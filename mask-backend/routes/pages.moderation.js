// mask-backend/routes/pages.moderation.js
const express = require("express");
const { param } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const Page = require("../models/Page");
const Post = require("../models/Post");
const User = require("../models/User");

const router = express.Router();

const listLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false });
const toggleLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

async function ensurePlatformAdmin(userId) {
  const me = await User.findById(userId).select("role").lean();
  return !!me && me.role === "admin";
}

// Health
router.get("/health", listLimiter, auth, async (req, res) => {
  const ok = await ensurePlatformAdmin(res.locals.userId);
  if (!ok) return res.status(403).json({ message: "Admin only" });
  res.json({ ok: true });
});

// List pages
router.get("/", listLimiter, auth, async (req, res) => {
  try {
    const ok = await ensurePlatformAdmin(res.locals.userId);
    if (!ok) return res.status(403).json({ message: "Admin only" });

    const q = String(req.query.search || "").trim();
    const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

    const where = {};
    if (re) where.name = re;
    if (typeof req.query.disabled !== "undefined" && req.query.disabled !== "") {
      where.disabled = String(req.query.disabled).toLowerCase() === "true";
    }

    const items = await Page.find(where)
      .select("_id name avatarURL disabled deletedAt category description")
      .sort({ name: 1 })
      .limit(200)
      .lean();

    res.json({ items });
  } catch (e) {
    console.error("[admin pages] list error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Disable
router.post("/:id/disable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const ok = await ensurePlatformAdmin(res.locals.userId);
    if (!ok) return res.status(403).json({ message: "Admin only" });
    await Page.updateOne({ _id: req.params.id }, { $set: { disabled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// Enable
router.post("/:id/enable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const ok = await ensurePlatformAdmin(res.locals.userId);
    if (!ok) return res.status(403).json({ message: "Admin only" });
    await Page.updateOne({ _id: req.params.id }, { $set: { disabled: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// Soft delete (kept, in case you want it)
router.delete("/:id", createLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const ok = await ensurePlatformAdmin(res.locals.userId);
    if (!ok) return res.status(403).json({ message: "Admin only" });
    await Page.updateOne({ _id: req.params.id }, { $set: { deletedAt: new Date(), disabled: true } });
    res.json({ ok: true, softDeleted: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// HARD delete (permanent)
router.delete("/:id/hard", createLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const ok = await ensurePlatformAdmin(res.locals.userId);
    if (!ok) return res.status(403).json({ message: "Admin only" });

    const id = req.params.id;

    // Remove page posts
    await Post.deleteMany({ scope: "page", page: id });
    // Remove page itself
    await Page.deleteOne({ _id: id });
    // Pull from users.followed pages
    await User.updateMany({}, { $pull: { pages: id } });

    res.json({ ok: true, hardDeleted: true });
  } catch (e) {
    console.error("[admin pages] hard delete error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
