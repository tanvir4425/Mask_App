// mask-backend/routes/userRoutes.js
const express = require("express");
const { param, query, body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");

const User = require("../models/User");
const Post = require("../models/Post");
const FriendRequest = require("../models/FriendRequest");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

// helpers
function publicUser(u) {
  return {
    _id: u._id,
    pseudonym: u.pseudonym,
    avatarURL: u.avatarURL || "",
    createdAt: u.createdAt,
  };
}

/* ============================== ME ============================== */

// GET /api/users/me
router.get("/me", limiter, auth, async (_req, res) => {
  try {
    const u = await User.findById(res.locals.userId)
      .select("_id pseudonym avatarURL pages groups following friends followersCount role createdAt")
      .lean();
    if (!u) return res.status(404).json({ message: "User not found" });

    return res.json({
      _id: u._id,
      pseudonym: u.pseudonym,
      avatarURL: u.avatarURL || "",
      pages: u.pages || [],
      groups: u.groups || [],
      following: u.following || [],
      friends: u.friends || [],
      followersCount: u.followersCount || 0,
      role: u.role || "user",
      createdAt: u.createdAt,
    });
  } catch (e) {
    console.error("users/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});


/* =========================== BOOKMARKS ========================== */

router.post(
  "/me/bookmarks/:postId",
  limiter,
  auth,
  [param("postId").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const uid = res.locals.userId;
      const postId = req.params.postId;

      const has = await User.exists({ _id: uid, "bookmarks.post": postId });
      if (has) {
        await User.updateOne({ _id: uid }, { $pull: { bookmarks: { post: postId } } });
        return res.json({ bookmarked: false });
      } else {
        await User.updateOne(
          { _id: uid },
          { $addToSet: { bookmarks: { post: postId, createdAt: new Date() } } }
        );
        return res.json({ bookmarked: true });
      }
    } catch (e) {
      console.error("bookmark toggle error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

router.get("/me/bookmarks", limiter, auth, async (req, res) => {
  try {
    const idsOnly = String(req.query.ids || "") === "1";
    const u = await User.findById(res.locals.userId).select("bookmarks").lean();
    if (!u) return res.json(idsOnly ? { ids: [] } : []);

    const ids = (u.bookmarks || [])
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => b.post);

    if (idsOnly) return res.json({ ids: ids.map(String) });

    const posts = await Post.find({
      _id: { $in: ids },
      expiresAt: { $gt: new Date() },
    })
      .populate("author", "_id pseudonym avatarURL")
      .populate("comments.user", "_id pseudonym avatarURL")
      .lean();

    const map = new Map(posts.map((p) => [String(p._id), p]));
    const ordered = ids.map((id) => map.get(String(id))).filter(Boolean);
    return res.json(ordered);
  } catch (e) {
    console.error("bookmarks list error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================== PROFILES ========================== */

// GET /api/users/:id  (enriched with relationship info)
router.get(
  "/:id",
  limiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const targetId = String(req.params.id);

      const target = await User.findById(targetId)
        .select("_id pseudonym avatarURL following friends followersCount createdAt")
        .lean();
      if (!target) return res.status(404).json({ message: "Not found" });

      const me = await User.findById(meId).select("following friends").lean();

      const following = (me?.following || []).some((x) => String(x) === targetId);
      const isFriend = (me?.friends || []).some((x) => String(x) === targetId);

      // pending request between us?
      const pending = await FriendRequest.findOne({
        status: "pending",
        $or: [
          { from: meId, to: targetId },
          { from: targetId, to: meId },
        ],
      })
        .select("_id from to status createdAt")
        .lean();

      let pendingDirection = null;
      let requestId = null;
      if (pending) {
        pendingDirection = String(pending.from) === meId ? "outgoing" : "incoming";
        requestId = pending._id;
      }

      return res.json({
        ...publicUser(target),
        followersCount: target.followersCount || 0,
        followingCount: (target.following || []).length,
        isMe: meId === targetId,
        following,
        isFriend,
        pendingDirection, // "incoming" | "outgoing" | null
        requestId,
      });
    } catch (e) {
      console.error("users:get error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Posts by user (non-expired)
router.get(
  "/:id/posts",
  limiter,
  auth,
  [
    param("id").custom((v) => mongoose.isValidObjectId(v)),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res) => {
    try {
      const page = parseInt(req.query.page || "1", 10);
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const posts = await Post.find({
        author: req.params.id,
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("author", "_id pseudonym avatarURL")
        .populate("comments.user", "_id pseudonym avatarURL")
        .lean();
      return res.json(posts);
    } catch (e) {
      console.error("users:posts error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================== FOLLOW TOGGLE ======================== */

// POST /api/users/:id/follow  (toggle)
router.post(
  "/:id/follow",
  limiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const targetId = String(req.params.id);
      if (meId === targetId) return res.status(400).json({ message: "Cannot follow yourself" });

      const me = await User.findById(meId).select("following").lean();
      const already = (me?.following || []).some((x) => String(x) === targetId);

      if (already) {
        await User.updateOne({ _id: meId }, { $pull: { following: targetId } });
        await User.updateOne({ _id: targetId }, { $inc: { followersCount: -1 } });
        const t = await User.findById(targetId).select("followersCount").lean();
        return res.json({ following: false, followersCount: Math.max(0, t?.followersCount || 0) });
      } else {
        await User.updateOne({ _id: meId }, { $addToSet: { following: targetId } });
        await User.updateOne({ _id: targetId }, { $inc: { followersCount: 1 } });
        const t = await User.findById(targetId).select("followersCount").lean();
        return res.json({ following: true, followersCount: Math.max(0, t?.followersCount || 0) });
      }
    } catch (e) {
      console.error("follow toggle error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================= FRIEND REQUESTS ======================= */

// POST /api/users/:id/friend-request  (send; auto-accept if they already sent you)
router.post(
  "/:id/friend-request",
  limiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const targetId = String(req.params.id);
      if (meId === targetId) return res.status(400).json({ message: "Cannot friend yourself" });

      const me = await User.findById(meId).select("friends").lean();
      const target = await User.findById(targetId).select("friends").lean();
      if (!target) return res.status(404).json({ message: "User not found" });

      const alreadyFriends =
        (me?.friends || []).some((x) => String(x) === targetId) &&
        (target?.friends || []).some((x) => String(x) === meId);
      if (alreadyFriends) return res.json({ status: "friends" });

      // If they already sent me a pending request, accept it
      const incoming = await FriendRequest.findOne({ from: targetId, to: meId, status: "pending" });
      if (incoming) {
        await Promise.all([
          User.updateOne({ _id: meId }, { $addToSet: { friends: targetId } }),
          User.updateOne({ _id: targetId }, { $addToSet: { friends: meId } }),
          FriendRequest.updateOne({ _id: incoming._id }, { $set: { status: "accepted" } }),
        ]);
        return res.json({ status: "accepted", requestId: incoming._id });
      }

      // If I already sent one, keep pending
      const outgoing = await FriendRequest.findOne({ from: meId, to: targetId, status: "pending" });
      if (outgoing) return res.json({ status: "pending", requestId: outgoing._id });

      const created = await FriendRequest.create({ from: meId, to: targetId, status: "pending" });
      return res.json({ status: "pending", requestId: created._id });
    } catch (e) {
      console.error("friend-request error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/users/requests  (incoming + outgoing)
router.get("/requests", limiter, auth, async (_req, res) => {
  try {
    const meId = String(res.locals.userId);
    const [incoming, outgoing] = await Promise.all([
      FriendRequest.find({ to: meId, status: "pending" })
        .sort({ createdAt: -1 })
        .populate("from", "_id pseudonym avatarURL")
        .lean(),
      FriendRequest.find({ from: meId, status: "pending" })
        .sort({ createdAt: -1 })
        .populate("to", "_id pseudonym avatarURL")
        .lean(),
    ]);
    return res.json({ incoming, outgoing });
  } catch (e) {
    console.error("list requests error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/users/requests/:rid/accept
router.post(
  "/requests/:rid/accept",
  limiter,
  auth,
  [param("rid").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const fr = await FriendRequest.findById(req.params.rid).lean();
      if (!fr || fr.status !== "pending") return res.status(404).json({ message: "Not found" });
      if (String(fr.to) !== meId) return res.status(403).json({ message: "Forbidden" });

      await Promise.all([
        User.updateOne({ _id: fr.to }, { $addToSet: { friends: fr.from } }),
        User.updateOne({ _id: fr.from }, { $addToSet: { friends: fr.to } }),
        FriendRequest.updateOne({ _id: fr._id }, { $set: { status: "accepted" } }),
      ]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("accept request error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// POST /api/users/requests/:rid/decline  (also used by sender to cancel)
router.post(
  "/requests/:rid/decline",
  limiter,
  auth,
  [param("rid").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const fr = await FriendRequest.findById(req.params.rid).lean();
      if (!fr || fr.status !== "pending") return res.status(404).json({ message: "Not found" });
      if (![String(fr.to), String(fr.from)].includes(meId)) return res.status(403).json({ message: "Forbidden" });

      await FriendRequest.updateOne({ _id: fr._id }, { $set: { status: "declined" } });
      return res.json({ ok: true });
    } catch (e) {
      console.error("decline/cancel request error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// POST /api/users/:id/unfriend
router.post(
  "/:id/unfriend",
  limiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const meId = String(res.locals.userId);
      const targetId = String(req.params.id);
      if (meId === targetId) return res.status(400).json({ message: "Cannot unfriend yourself" });

      await Promise.all([
        User.updateOne({ _id: meId }, { $pull: { friends: targetId } }),
        User.updateOne({ _id: targetId }, { $pull: { friends: meId } }),
        FriendRequest.deleteMany({
          $or: [
            { from: meId, to: targetId },
            { from: targetId, to: meId },
          ],
        }),
      ]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("unfriend error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
