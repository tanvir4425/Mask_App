// mask-backend/routes/adminFactchecks.js
const express = require("express");
const mongoose = require("mongoose");
const FactCheckResult = require("../models/FactCheckResult");

// NEW: allow cookie auth admin too (same pattern as motivation)
const auth = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

/** Dev/admin gate (matches motivation's behavior):
 *  - If X-Admin-Key matches ADMIN_KEY or ADMIN_DEV_KEY (fallback 'dev-admin-key') → allow
 *  - Else, if logged-in user has role 'admin' → allow
 *  - Else 403
 */
async function requireAdmin(req, res, next) {
  try {
    const headerKey =
      req.headers["x-admin-key"] ||
      req.headers["x-admin"] ||
      req.headers["x_admin_key"];
    const envKey =
      process.env.ADMIN_KEY ||
      process.env.ADMIN_DEV_KEY ||
      "dev-admin-key";

    if (headerKey && headerKey === envKey) return next(); // dev bypass

    // cookie/admin role path
    const uid = res.locals.userId;
    if (!uid) return res.status(403).json({ message: "Forbidden" });

    const me = await User.findById(uid).select("role").lean();
    if (!me || (me.role || "user") !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  } catch (e) {
    console.warn("[admin factchecks] requireAdmin error:", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * Core listing handler (reused by both /factchecks and /fact-checks)
 * Query params:
 *  - verdict: "true,false,misleading,unverified,opinion,outdated,satire" (comma-list or single)
 *  - minConf, maxConf: 0..1
 *  - page, limit
 */
async function listFactChecks(req, res) {
  try {
    const {
      verdict = "",
      minConf,
      maxConf,
      page = "1",
      limit = "20",
    } = req.query;

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const q = {};
    if (verdict) {
      const list = String(verdict)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) q.verdict = { $in: list };
    }
    if (minConf !== undefined || maxConf !== undefined) {
      q.confidence = {};
      if (minConf !== undefined) q.confidence.$gte = Number(minConf);
      if (maxConf !== undefined) q.confidence.$lte = Number(maxConf);
    }

    const pipeline = [
      { $match: q },
      { $sort: { createdAt: -1 } },
      { $skip: (p - 1) * l },
      { $limit: l },
      { $lookup: { from: "posts", localField: "post", foreignField: "_id", as: "post" } },
      { $unwind: { path: "$post", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "users", localField: "post.author", foreignField: "_id", as: "author" } },
      { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          verdict: 1,
          confidence: 1,
          topic: 1,
          model: 1,
          claim: 1,
          postId: "$post._id",
          postText: "$post.text",
          authorId: "$author._id",
          authorName: "$author.pseudonym",
        },
      },
    ];

    const rows = await FactCheckResult.aggregate(pipeline);
    const total = await FactCheckResult.countDocuments(q);

    // Backward compatible and consistent with other admin lists
    res.json({ rows, items: rows, total, page: p, limit: l });
  } catch (e) {
    console.error("[admin factchecks] error:", e);
    res.status(500).json({ message: "Server error" });
  }
}

/** GET /api/admin/factchecks */
router.get("/factchecks", auth, requireAdmin, listFactChecks);
/** Alias: GET /api/admin/fact-checks */
router.get("/fact-checks", auth, requireAdmin, listFactChecks);

module.exports = router;
