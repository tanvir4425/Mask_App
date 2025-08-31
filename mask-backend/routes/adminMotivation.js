// mask-backend/routes/adminMotivation.js
const express = require("express");
const { body, query, param, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const User = require("../models/User");
const MotivationQuote = require("../models/MotivationQuote");
const MotivationDelivery = require("../models/MotivationDelivery");
const Notification = require("../models/Notification");

// services
const MotivationService = require("../services/motivationService");
const MotivationDaily = require("../services/motivationDailyWorker"); // inline scheduler if enabled

const router = express.Router();

/** Admin guard (role === 'admin'); allows dev override with X-Admin-Key */
async function requireAdmin(req, res, next) {
  try {
    const devKey = process.env.ADMIN_DEV_KEY || "dev-admin-key";
    const provided = req.get("x-admin-key");
    if (provided && provided === devKey) return next(); // dev bypass

    const uid = res.locals.userId;
    const me = await User.findById(uid).select("role").lean();
    if (!me || (me.role || "user") !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    next();
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
}

/** Normalize tags from array or comma-separated string */
function normTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).map((t) => t.trim()).filter(Boolean);
  return String(input).split(",").map((t) => t.trim()).filter(Boolean);
}

/* ------------------------------ HANDLERS ---------------------------------- */

const listQuotes = async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    const filter = {};
    if (req.query.tone) filter.tone = req.query.tone;
    if (req.query.tag) filter.tags = req.query.tag;
    if (req.query.lang) filter.lang = req.query.lang;

    const search = (req.query.search || req.query.q || "").trim();
    if (search) {
      filter.$or = [
        { $text: { $search: search } },
        { text: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
      ];
    }

    const cursor = MotivationQuote.find(filter).sort({ createdAt: -1 });
    const total = await MotivationQuote.countDocuments(filter);
    const items = await cursor.skip((page - 1) * limit).limit(limit).lean();

    // Backward compatible: provide both items and rows
    return res.json({ page, limit, total, items, rows: items });
  } catch (e) {
    console.error("[adminMotivation] list error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const createQuote = async (req, res) => {
  const v = validationResult(req);
  if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

  try {
    const { text, author = "", tone = "inspiration", tags, lang = "en" } = req.body;
    const doc = await MotivationQuote.create({
      text: String(text).trim(),
      author: String(author || "").trim(),
      tone,
      tags: normTags(tags),
      lang,
    });
    return res.json(doc);
  } catch (e) {
    console.error("[adminMotivation] create error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateQuote = async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.text === "string") update.text = req.body.text.trim();
    if (typeof req.body.author === "string") update.author = req.body.author.trim();
    if (req.body.tone && ["inspiration", "humor"].includes(req.body.tone)) update.tone = req.body.tone;
    if (req.body.lang) update.lang = String(req.body.lang).trim();
    if (req.body.tags !== undefined) update.tags = normTags(req.body.tags);

    const doc = await MotivationQuote.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json(doc);
  } catch (e) {
    console.error("[adminMotivation] update error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteQuote = async (req, res) => {
  try {
    const del = await MotivationQuote.deleteOne({ _id: req.params.id });
    if (del.deletedCount === 0) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[adminMotivation] delete error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const previewAudience = async (req, res) => {
  try {
    const tags = normTags(req.body.tags);
    const tone = req.body.tone || "inspiration";

    const or = [];
    if (tags.length) {
      or.push({ "motivationPrefs.interests": { $in: tags } });
      or.push({ "motivationPrefs.goals": { $in: tags } });
      or.push({ "motivationPrefs.role": { $in: tags } });
    }

    const match = { "motivationPrefs.enabled": true };
    if (or.length) match.$or = or;

    const estimatedUsers = await User.countDocuments(match);
    const sample = await User.find(match).select("_id pseudonym").limit(5).lean();

    return res.json({ tone, tags, estimatedUsers, sampleUsers: sample });
  } catch (e) {
    console.error("[adminMotivation] preview error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

const sendTest = async (req, res) => {
  try {
    const me = await User.findById(res.locals.userId).lean();
    if (!me) return res.status(404).json({ message: "User not found" });

    let quote = null;
    try {
      if (MotivationService?._internals?.pickQuoteForUser) {
        quote = await MotivationService._internals.pickQuoteForUser(me);
      }
    } catch (e) {
      console.warn("[adminMotivation] send-test pick error:", e?.message || e);
    }
    if (!quote) return res.json({ ok: false, message: "No matching quote" });

    const now = new Date();
    await Promise.all([
      MotivationDelivery.create({
        user: me._id,
        quote: quote._id,
        sentAt: now,
        tagsAtSend: [
          ...(me.motivationPrefs?.interests || []),
          ...(me.motivationPrefs?.goals || []),
          ...(me.motivationPrefs?.role ? [String(me.motivationPrefs.role).toLowerCase()] : []),
        ],
        tone: quote.tone || "inspiration",
      }),
      Notification.create({
        user: me._id,
        type: "motivation",
        message: quote.text,
        meta: { quoteId: String(quote._id), author: quote.author || "", tags: quote.tags || [], tone: quote.tone || "inspiration" },
        createdAt: now,
      }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.warn("[adminMotivation] send-test error:", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ------------------------------ ROUTES ------------------------------------ */
/** LIST / SEARCH */
router.get("/quotes", auth, requireAdmin, [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("tone").optional().isIn(["inspiration", "humor"]),
  query("tag").optional().isString(),
  query("search").optional().isString(),
  query("q").optional().isString(),
  query("lang").optional().isString(),
], listQuotes);

/** CREATE */
router.post("/quotes", auth, requireAdmin, [
  body("text").isString().isLength({ min: 3, max: 1000 }),
  body("author").optional().isString().isLength({ max: 200 }),
  body("tone").optional().isIn(["inspiration", "humor"]),
  body("tags").optional(),
  body("lang").optional().isString().isLength({ min: 2, max: 10 }),
], createQuote);

/** UPDATE */
router.put("/quotes/:id", auth, requireAdmin, [
  param("id").custom((v) => mongoose.isValidObjectId(v)),
], updateQuote);

/** DELETE */
router.delete("/quotes/:id", auth, requireAdmin, [
  param("id").custom((v) => mongoose.isValidObjectId(v)),
], deleteQuote);

/** PREVIEW AUDIENCE */
router.post("/quotes/preview", auth, requireAdmin, [
  body("tags").optional(),
  body("tone").optional().isIn(["inspiration", "humor"]),
], previewAudience);

/** RUNNERS */
router.post("/run-once", auth, requireAdmin, async (req, res) => {
  try {
    const { userId, force = false } = req.body || {};
    if (userId) {
      // deliver to a single user
      const user = await User.findById(userId).lean();
      if (!user) return res.status(404).json({ message: "User not found" });

      let quote = null;
      try {
        if (MotivationService?._internals?.pickQuoteForUser) {
          quote = await MotivationService._internals.pickQuoteForUser(user);
        }
      } catch (e) {
        console.warn("[adminMotivation] pickQuoteForUser error:", e?.message || e);
      }
      if (!quote) return res.json({ ok: false, message: "No matching quote" });

      const now = new Date();
      await Promise.all([
        MotivationDelivery.create({
          user: user._id,
          quote: quote._id,
          sentAt: now,
          tagsAtSend: [
            ...(user.motivationPrefs?.interests || []),
            ...(user.motivationPrefs?.goals || []),
            ...(user.motivationPrefs?.role ? [String(user.motivationPrefs.role).toLowerCase()] : []),
          ],
          tone: quote.tone || "inspiration",
        }),
        Notification.create({
          user: user._id,
          type: "motivation",
          message: quote.text,
          meta: { quoteId: String(quote._id), author: quote.author || "", tags: quote.tags || [], tone: quote.tone || "inspiration" },
          createdAt: now,
        }),
      ]);

      return res.json({ ok: true, sent: 1 });
    }
    const r = await MotivationService.runOnce();
    return res.json(r);
  } catch (e) {
    console.error("[adminMotivation] run-once error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/run-daily-tick", auth, requireAdmin, async (_req, res) => {
  try {
    const r = await MotivationDaily.runDailyTick();
    return res.json({ ok: true, ...r });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

/** HEALTH */
router.get("/health", auth, requireAdmin, async (_req, res) => {
  try {
    const totalQuotes = await MotivationQuote.countDocuments({});
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const deliveries7d = await MotivationDelivery.countDocuments({ sentAt: { $gte: since } });

    const agg = await MotivationQuote.aggregate([
      { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$tags", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
    ]);
    const topTags = agg.map((r) => [r._id, r.n]);

    return res.json({ totalQuotes, deliveries7d, topTags });
  } catch (e) {
    console.warn("[adminMotivation] health error:", e?.message || e);
    return res.json({ totalQuotes: 0, deliveries7d: 0, topTags: [] });
  }
});

/** Legacy /stats alias that mirrors /health but keeps 'total' key */
router.get("/stats", auth, requireAdmin, async (_req, res) => {
  try {
    const totalQuotes = await MotivationQuote.countDocuments({});
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const deliveries7d = await MotivationDelivery.countDocuments({ sentAt: { $gte: since } });

    const agg = await MotivationQuote.aggregate([
      { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$tags", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
    ]);
    const topTags = agg.map((r) => [r._id, r.n]);

    return res.json({ total: totalQuotes, deliveries7d, topTags });
  } catch (e) {
    console.warn("[adminMotivation] stats alias error:", e?.message || e);
    return res.json({ total: 0, deliveries7d: 0, topTags: [] });
  }
});

/** SEND ME A TEST */
router.post("/send-test", auth, requireAdmin, sendTest);

/* ---------- Legacy aliases to avoid 404s from older UI code ---------- */
// List/create on "/"
router.get("/", auth, requireAdmin, listQuotes);
router.post("/", auth, requireAdmin, [
  body("text").isString().isLength({ min: 3, max: 1000 }),
  body("author").optional().isString().isLength({ max: 200 }),
  body("tone").optional().isIn(["inspiration", "humor"]),
  body("tags").optional(),
  body("lang").optional().isString().isLength({ min: 2, max: 10 }),
], createQuote);

// Update/delete "/:id"
router.put("/:id", auth, requireAdmin, [
  param("id").custom((v) => mongoose.isValidObjectId(v)),
], updateQuote);
router.delete("/:id", auth, requireAdmin, [
  param("id").custom((v) => mongoose.isValidObjectId(v)),
], deleteQuote);

// Preview + Test
router.post("/preview", auth, requireAdmin, previewAudience);
router.post("/test", auth, requireAdmin, sendTest); // legacy alias kept

module.exports = router;
