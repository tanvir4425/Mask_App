// mask-backend/routes/auth.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");

const User = require("../models/User");
const EmailOTP = require("../models/EmailOTP");
const { isReservedPseudonym } = require("../utils/reservedNames");
const { sendMail } = require("../services/mailer");
const auth = require("../middleware/auth");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const DEV = !IS_PROD;
const DEBUG_AUTH = String(process.env.DEBUG_AUTH || "").toLowerCase() === "true";
const REQUIRE_EMAIL_VERIFICATION = String(process.env.REQUIRE_EMAIL_VERIFICATION || "1") === "1";
const ADMIN_DEV_KEY = process.env.ADMIN_DEV_KEY || "dev-admin-key";
const EMAIL_TRANSPORT = String(process.env.EMAIL_TRANSPORT || "console").toLowerCase();

/** Set cookie correctly for dev and prod */
function issueCookie(res, uid) {
  const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: IS_PROD ? "none" : "lax", // ✅ dev: lax; prod: none
    secure: IS_PROD,                    // ✅ prod requires HTTPS
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(u) {
  return {
    _id: u._id,
    pseudonym: u.pseudonym,
    avatarURL: u.avatarURL || "",
    createdAt: u.createdAt,
    role: u.role || "user",
    email: u.email || undefined,
    emailVerified: !!u.emailVerified,
  };
}

const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

function rxEscape(s) { return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }

function extractIdentifier(req) {
  const b = req.body || {};
  const candidates = [
    b.identifier, b.pseudonym, b.username, b.email,
    b.login, b.name, b.userName,
    b?.user?.email, b?.user?.username, b?.user?.pseudonym, b?.user?.name,
  ];
  for (const v of candidates) if (typeof v === "string" && v.trim()) return v.trim();
  for (const [k, v] of Object.entries(b)) {
    if (k.toLowerCase().includes("pass")) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/* ==================== REQUEST SIGNUP CODE (OTP) ==================== */
router.post(
  "/request-signup-code",
  authLimiter,
  [
    body("email")
      .customSanitizer((v) => normEmail(v))
      .custom((v) => {
        const ok = validator.isEmail(v, {
          allow_utf8_local_part: true,
          ignore_max_length: true,
          domain_specific_validation: false,
        });
        if (!ok) throw new Error("Valid email required");
        return true;
      }),
  ],
  async (req, res) => {
    try {
      const v = validationResult(req);
      if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

      const email = normEmail(req.body.email);

      const existing = await User.findOne({ email }).lean();
      if (existing) return res.status(409).json({ message: "Email already in use" });

      const force = DEV && (req.body.force === true || req.get("x-admin-key") === ADMIN_DEV_KEY);

      if (!force) {
        const sixtyAgo = new Date(Date.now() - 60 * 1000);
        const recent = await EmailOTP.findOne({
          email, purpose: "signup", createdAt: { $gte: sixtyAgo },
        }).lean();
        if (recent) return res.json({ ok: true, throttled: true });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await bcrypt.hash(code, 8);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await EmailOTP.deleteMany({ email, purpose: "signup" });
      await EmailOTP.create({ email, codeHash, purpose: "signup", expiresAt });

      try {
        await sendMail(
          email,
          "Your Mask verification code",
          `Your verification code is ${code}\nThis code expires in 15 minutes.`
        );
      } catch (e) {
        console.error("sendMail error:", e);
        return res.status(500).json({
          message: "Email send failed",
          ...(process.env.DEBUG_MAILER ? { error: String(e?.message || e) } : {}),
        });
      }

      const resp = { ok: true, ...(force ? { forced: true } : {}) };
      if (
        DEV &&
        EMAIL_TRANSPORT === "console" &&
        req.body.returnCode === true &&
        req.get("x-admin-key") === ADMIN_DEV_KEY
      ) {
        resp.devCode = code;
      }
      return res.json(resp);
    } catch (err) {
      console.error("request-signup-code error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================== SIGNUP ============================== */
router.post(
  "/signup",
  authLimiter,
  [
    body("pseudonym")
      .trim()
      .isLength({ min: 3, max: 32 }).withMessage("Pseudonym must be 3-32 chars")
      .matches(/^[\p{L}\p{N} _\-.]+$/u).withMessage("Only letters, numbers, space, _ - .")
      .custom((v) => { if (isReservedPseudonym(v)) throw new Error("Pseudonym not allowed"); return true; }),
    body("email")
      .customSanitizer((v) => normEmail(v))
      .custom((v) => {
        const ok = validator.isEmail(v, {
          allow_utf8_local_part: true,
          ignore_max_length: true,
          domain_specific_validation: false,
        });
        if (!ok) throw new Error("Valid email required");
        return true;
      }),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 chars")
      .matches(/[A-Za-z]/).withMessage("Password needs a letter")
      .matches(/\d/).withMessage("Password needs a number"),
    body("code").optional().isString().isLength({ min: 6, max: 6 }).withMessage("Bad code"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const pseudonym = String(req.body.pseudonym || "").trim();
      const email = normEmail(req.body.email);
      const password = String(req.body.password);
      const code = String(req.body.code || "");

      const exists = await User.findOne({
        $or: [{ pseudonym: new RegExp(`^${rxEscape(pseudonym)}$`, "i") }, { email }],
      }).lean();
      if (exists) return res.status(409).json({ message: "Pseudonym or email already in use" });

      if (REQUIRE_EMAIL_VERIFICATION) {
        if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Verification code required" });
        const otp = await EmailOTP.findOne({ email, purpose: "signup" }).sort({ createdAt: -1 });
        if (!otp || otp.expiresAt < new Date()) {
          return res.status(400).json({ message: "Verification code expired" });
        }
        const ok = await bcrypt.compare(code, otp.codeHash);
        if (!ok) {
          await EmailOTP.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
          return res.status(400).json({ message: "Invalid verification code" });
        }
        await EmailOTP.deleteMany({ email, purpose: "signup" });
      }

      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({
        pseudonym,
        email,
        password: hash,
        role: "user",
        emailVerified: true,
      });

      issueCookie(res, user._id);
      return res.json({ user: publicUser(user) });
    } catch (err) {
      console.error("signup error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* =============================== LOGIN ============================== */
router.post(
  "/login",
  authLimiter,
  [body("password").isLength({ min: 1 }).withMessage("Password required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const identifier = extractIdentifier(req);
      const pass = String(req.body.password || "");
      if (!identifier) {
        return res.status(400).json({
          message: "Identifier required",
          ...(DEBUG_AUTH ? { debug: { bodyKeys: Object.keys(req.body || {}) } } : {}),
        });
      }

      const or = [
        { pseudonym: new RegExp(`^${rxEscape(identifier)}$`, "i") },
        { username: new RegExp(`^${rxEscape(identifier)}$`, "i") },
        { email: identifier.toLowerCase() },
      ];
      const user = await User.findOne({ $or: or })
        .select("+password role deletedAt avatarURL pseudonym createdAt email emailVerified");

      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      if (user.deletedAt) return res.status(403).json({ message: "Account disabled" });

      const stored = String(user.password || "");
      const ok = stored.startsWith("$2") ? await bcrypt.compare(pass, stored) : pass === stored;
      if (!ok) return res.status(401).json({ message: "Invalid credentials" });

      issueCookie(res, user._id);
      return res.json({ user: publicUser(user) });
    } catch (err) {
      console.error("login error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ========================== CHANGE PASSWORD ========================= */
router.post(
  "/change-password",
  auth,
  authLimiter,
  [
    body("current").isString().isLength({ min: 1 }).withMessage("Current password required"),
    body("next")
      .isString().isLength({ min: 8 }).withMessage("New password must be at least 8 chars")
      .matches(/[A-Za-z]/).withMessage("New password needs a letter")
      .matches(/\d/).withMessage("New password needs a number"),
  ],
  async (req, res) => {
    try {
      const v = validationResult(req);
      if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

      const me = await User.findById(res.locals.userId).select("+password");
      if (!me) return res.status(404).json({ message: "Not found" });

      const ok = await bcrypt.compare(String(req.body.current), String(me.password || ""));
      if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

      me.password = await bcrypt.hash(String(req.body.next), 10);
      await me.save();

      return res.json({ ok: true });
    } catch (err) {
      console.error("change-password error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* =============================== LOGOUT ============================= */
router.post("/logout", authLimiter, async (_req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: IS_PROD ? "none" : "lax", // ✅ match issueCookie
      secure: IS_PROD,
      path: "/",
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("logout error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
