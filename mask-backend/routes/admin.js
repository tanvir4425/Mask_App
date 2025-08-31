// mask-backend/routes/admin.js
const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const User = require("../models/User");      // make sure this model includes `password: { select: false }`
const Report = require("../models/Report");

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/* ------------------------------------------------------------------ */
/* Health check (auth + role gate)                                     */
/* ------------------------------------------------------------------ */
router.get("/health", auth, requireRole("admin", "moderator"), (req, res) => {
  res.json({ ok: true, role: req.user.role });
});

/* ------------------------------------------------------------------ */
/* Reports (moderation)                                                */
/* ------------------------------------------------------------------ */
/**
 * GET /api/admin/reports?status=open|resolved|dismissed&targetType=post|comment|user&q=&page=&limit=
 * Role: admin or moderator
 */
router.get("/reports", auth, requireRole("admin", "moderator"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req);

    const filter = {};
    const { status, targetType, q } = req.query;

    if (status && ["open", "resolved", "dismissed"].includes(status)) filter.status = status;
    if (targetType && ["post", "comment", "user"].includes(targetType)) filter.targetType = targetType;
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [{ reason: rx }, { note: rx }];
    }

    const [items, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id reporter targetType post commentId targetUser reason note status resolver resolvedAt createdAt")
        .lean(),
      Report.countDocuments(filter),
    ]);

    // Light enrich (no heavy populate to keep it lean)
    const userIds = [
      ...new Set(
        items.flatMap((r) => [r.reporter, r.targetUser, r.resolver].filter(Boolean).map(String))
      ),
    ];
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id pseudonym avatarURL role deletedAt")
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const data = items.map((r) => ({
      ...r,
      reporterUser: r.reporter ? userMap.get(String(r.reporter)) || null : null,
      targetUserUser: r.targetUser ? userMap.get(String(r.targetUser)) || null : null,
      resolverUser: r.resolver ? userMap.get(String(r.resolver)) || null : null,
    }));

    res.json({
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
      items: data,
    });
  } catch (err) {
    console.error("GET /api/admin/reports error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/reports/:id/resolve
 * Body: { note?: string }
 * Role: admin or moderator
 */
router.post("/reports/:id/resolve", auth, requireRole("admin", "moderator"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.status !== "open") return res.status(400).json({ message: "Report already processed" });

    report.status = "resolved";
    report.resolver = res.locals.userId;
    report.resolvedAt = new Date();
    if (req.body?.note) report.note = String(req.body.note).slice(0, 400);
    await report.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/resolve error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/reports/:id/dismiss
 * Body: { note?: string }
 * Role: admin or moderator
 */
router.post("/reports/:id/dismiss", auth, requireRole("admin", "moderator"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.status !== "open") return res.status(400).json({ message: "Report already processed" });

    report.status = "dismissed";
    report.resolver = res.locals.userId;
    report.resolvedAt = new Date();
    if (req.body?.note) report.note = String(req.body.note).slice(0, 400);
    await report.save();

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/dismiss error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* Users (admin)                                                       */
/* ------------------------------------------------------------------ */
/**
 * GET /api/admin/users?search=&page=&limit=
 * Role: admin
 */
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req);
    const { search } = req.query;

    const filter = {};
    if (search) {
      const rx = new RegExp(String(search).trim(), "i");
      filter.$or = [{ pseudonym: rx }, { email: rx }];
    }

    const projection =
      "_id pseudonym email avatarURL role deletedAt createdAt followersCount";

    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select(projection).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
      items: items.map((u) => ({
        ...u,
        disabled: !!u.deletedAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/users/:id/toggle-disable
 * Role: admin
 * Effect: set deletedAt to now if null; else clear it
 */
router.post("/users/:id/toggle-disable", auth, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    if (String(id) === String(res.locals.userId)) {
      return res.status(400).json({ message: "You cannot disable your own account" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.deletedAt = user.deletedAt ? null : new Date();
    await user.save();

    res.json({ ok: true, disabled: !!user.deletedAt, deletedAt: user.deletedAt });
  } catch (err) {
    console.error("POST /api/admin/users/:id/toggle-disable error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------------ */
/* Password reset (header key) — your original route, hardened         */
/* ------------------------------------------------------------------ */
/**
 * POST /api/admin/reset-password
 * Headers: x-admin-key: <ADMIN_KEY>
 * Body: { identifier: "pseudonym|username|email", newPassword: "..." }
 *
 * Uses updateOne to ensure password persists even if a stale doc/model was loaded earlier.
 */
router.post("/reset-password", async (req, res) => {
  const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { identifier, newPassword } = req.body || {};
  if (!identifier || !newPassword) {
    return res.status(400).json({ message: "identifier and newPassword are required" });
  }

  const user = await User.findOne({
    $or: [
      { pseudonym: new RegExp(`^${String(identifier).trim()}$`, "i") },
      { username:  new RegExp(`^${String(identifier).trim()}$`, "i") },  // legacy field
      { email: String(identifier).toLowerCase() },
    ],
  }).select("_id pseudonym");

  if (!user) return res.status(404).json({ message: "User not found" });

  const hash = await bcrypt.hash(String(newPassword), 10);

  // Use updateOne to avoid any stale document/schema issues
  await User.updateOne({ _id: user._id }, { $set: { password: hash } });

  return res.json({ ok: true, user: { _id: user._id, pseudonym: user.pseudonym } });
});

module.exports = router;
