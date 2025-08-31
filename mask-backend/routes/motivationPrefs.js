// mask-backend/routes/motivationPrefs.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

/** Curated, non-sensitive tags (expand later if you like) */
const INTEREST_TAGS = [
  "sports","football","reading","writing","coding","startups","photography",
  "travel","mindfulness","productivity","study","exams","fitness","music",
  "art","volunteering","leadership","public-speaking","entrepreneurship"
];
const GOAL_TAGS = [
  "be-a-writer","get-fit","learn-to-code","ace-exams","grow-business",
  "be-more-confident","improve-focus","save-money","learn-language"
];
const ROLES = ["student","engineer","designer","teacher","freelancer","entrepreneur","athlete","artist","other"];

function dedupe(arr) {
  return Array.from(new Set((arr || []).map(String)));
}
function clampHour(h) {
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
  return 9;
}

/** GET my motivation prefs + allowed lists */
router.get("/motivation-prefs", auth, async (req, res) => {
  try {
    const me = await User.findById(res.locals.userId).select("motivationPrefs").lean();
    const prefs = me?.motivationPrefs || {};
    return res.json({
      prefs: {
        enabled: !!prefs.enabled,
        hourLocal: typeof prefs.hourLocal === "number" ? prefs.hourLocal : 9,
        tone: {
          inspiration: !!(prefs.tone?.inspiration ?? true),
          humor: !!(prefs.tone?.humor ?? false),
        },
        interests: Array.isArray(prefs.interests) ? prefs.interests : [],
        goals: Array.isArray(prefs.goals) ? prefs.goals : [],
        role: prefs.role || "",
        language: prefs.language || "",
        updatedAt: prefs.updatedAt || null,
      },
      allowed: { interests: INTEREST_TAGS, goals: GOAL_TAGS, roles: ROLES }
    });
  } catch (e) {
    console.error("motivation GET error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/** PUT my motivation prefs (sanitize to the curated lists) */
router.put(
  "/motivation-prefs",
  auth,
  [
    body("enabled").optional().isBoolean(),
    body("hourLocal").optional().isInt({ min: 0, max: 23 }),
    body("tone").optional().isObject(),
    body("tone.inspiration").optional().isBoolean(),
    body("tone.humor").optional().isBoolean(),
    body("interests").optional().isArray({ max: 25 }),
    body("goals").optional().isArray({ max: 25 }),
    body("role").optional().isString().isLength({ max: 40 }),
    body("language").optional().isString().isLength({ max: 10 }),
  ],
  async (req, res) => {
    try {
      const v = validationResult(req);
      if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

      const uid = res.locals.userId;
      const u = await User.findById(uid).select("motivationPrefs");
      if (!u) return res.status(404).json({ message: "Not found" });

      const src = req.body || {};
      const dst = u.motivationPrefs || {};

      if (typeof src.enabled === "boolean") dst.enabled = src.enabled;
      if (src.hourLocal !== undefined) dst.hourLocal = clampHour(src.hourLocal);

      if (src.tone && typeof src.tone === "object") {
        dst.tone = {
          inspiration: !!(src.tone.inspiration ?? dst.tone?.inspiration ?? true),
          humor: !!(src.tone.humor ?? dst.tone?.humor ?? false),
        };
      }

      if (Array.isArray(src.interests)) {
        const filtered = dedupe(src.interests)
          .filter(t => INTEREST_TAGS.includes(t));
        dst.interests = filtered.slice(0, 25);
      }

      if (Array.isArray(src.goals)) {
        const filtered = dedupe(src.goals)
          .filter(t => GOAL_TAGS.includes(t));
        dst.goals = filtered.slice(0, 25);
      }

      if (typeof src.role === "string") {
        dst.role = ROLES.includes(src.role) ? src.role : "";
      }
      if (typeof src.language === "string") {
        dst.language = src.language.trim().slice(0, 10);
      }

      dst.updatedAt = new Date();
      u.motivationPrefs = dst;
      await u.save();

      return res.json({ ok: true, prefs: u.motivationPrefs });
    } catch (e) {
      console.error("motivation PUT error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
