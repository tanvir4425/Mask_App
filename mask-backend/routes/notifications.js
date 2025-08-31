const express = require("express");
const { query, param } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Notification = require("../models/Notification");

const router = express.Router();

const limiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });

// List
router.get(
  "/",
  limiter,
  auth,
  [query("page").optional().isInt({ min: 1 }), query("limit").optional().isInt({ min: 1, max: 50 })],
  async (req, res) => {
    try {
      const page = parseInt(req.query.page || "1", 10);
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const items = await Notification.find({ user: res.locals.userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("actor", "_id pseudonym avatarURL")
        .populate("post", "_id text")
        .lean();
      res.json(items);
    } catch (e) {
      console.error("notifications:list", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Unread count
router.get("/unread-count", limiter, auth, async (req, res) => {
  try {
    const n = await Notification.countDocuments({ user: res.locals.userId, readAt: null });
    res.json({ count: n });
  } catch (e) {
    console.error("notifications:unread-count", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark one read
router.post(
  "/read/:id",
  limiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const n = await Notification.findOne({ _id: req.params.id, user: res.locals.userId });
      if (!n) return res.status(404).json({ message: "Not found" });
      if (!n.readAt) { n.readAt = new Date(); await n.save(); }
      res.json({ ok: true });
    } catch (e) {
      console.error("notifications:read-one", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Mark all read
router.post("/read-all", limiter, auth, async (req, res) => {
  try {
    await Notification.updateMany({ user: res.locals.userId, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    console.error("notifications:read-all", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Simple admin broadcast (optional dev tool)
router.post("/admin-broadcast", limiter, async (req, res) => {
  try {
    const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";
    if ((req.headers["x-admin-key"] || "") !== ADMIN_KEY) return res.status(401).json({ message: "Unauthorized" });
    const msg = (req.body?.message || "").trim();
    if (!msg) return res.status(400).json({ message: "Message required" });
    const User = require("../models/User");
    const all = await User.find().select("_id").lean();
    if (all.length) {
      await Notification.insertMany(all.map((u) => ({ user: u._id, type: "admin", message: msg })));
    }
    res.json({ ok: true, created: all.length });
  } catch (e) {
    console.error("notifications:broadcast", e);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
