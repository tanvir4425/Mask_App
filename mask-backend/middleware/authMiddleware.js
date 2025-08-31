// mask-backend/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const COOKIE_NAME = "token";

function cookieOptionsDev() {
  // localhost is "same-site" so Lax works; no HTTPS in dev
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
  };
}

function userPayload(u) {
  return {
    _id: u._id,
    id: u._id,
    pseudonym: u.pseudonym,
    avatarURL: u.avatarURL || "",
  };
}

exports.signup = async (req, res) => {
  try {
    const { pseudonym, password, email } = req.body || {};
    if (!pseudonym || !password) {
      return res.status(400).json({ message: "Missing pseudonym or password" });
    }
    const exists = await User.findOne({ pseudonym });
    if (exists) return res.status(409).json({ message: "Pseudonym already taken" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ pseudonym, passwordHash: hash, email });

    const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(COOKIE_NAME, token, cookieOptionsDev());
    return res.status(201).json({ user: userPayload(user) });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { pseudonym, password } = req.body || {};
    if (!pseudonym || !password) {
      return res.status(400).json({ message: "Missing pseudonym or password" });
    }
    const user = await User.findOne({ pseudonym });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(COOKIE_NAME, token, cookieOptionsDev());
    return res.json({ user: userPayload(user) });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptionsDev(), maxAge: 0 });
  return res.json({ ok: true });
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("pseudonym avatarURL");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: userPayload(user) });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
};
