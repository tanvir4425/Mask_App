const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const auth = require("../middleware/auth");
const Group = require("../models/Group");
const Post = require("../models/Post");
const User = require("../models/User");

const router = express.Router();

function stripTags(s = "") { return String(s).replace(/<[^>]*>/g, ""); }
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";

const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const toggleLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const listLimiter   = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false });

async function ensurePlatformAdmin(userId) {
  const me = await User.findById(userId).select("role").lean();
  return !!me && me.role === "admin";
}

// uploads/ (covers for groups)
const uploadsRoot = path.join(__dirname, "..", "uploads");
const groupUploadsDir = path.join(uploadsRoot, "groups");
if (!fs.existsSync(groupUploadsDir)) fs.mkdirSync(groupUploadsDir, { recursive: true });

const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, groupUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `group_${req.params.id || "new"}_cover_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const coverUpload = multer({ storage: coverStorage });

function removeLocalUploadsFileIfSafe(url) {
  try {
    if (!url || typeof url !== "string") return;
    if (!url.startsWith("/uploads/groups/")) return;
    const rel = url.replace("/uploads/", "");
    const p = path.join(uploadsRoot, rel);
    if (p.startsWith(uploadsRoot) && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/* ------------------------------ CREATE GROUP ------------------------------ */
router.post(
  "/",
  createLimiter,
  auth,
  [
    body("name").trim().isLength({ min: 3, max: 80 }).withMessage("Name 3–80 chars"),
    body("description").optional().isLength({ max: 300 }).withMessage("Description too long"),
    body("privacy").optional().isIn(["public","private"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const name = stripTags(req.body.name).trim();
      const description = stripTags(req.body.description || "").trim();
      const privacy = (req.body.privacy === "private") ? "private" : "public";

      const g = await Group.create({
        name,
        description,
        privacy,
        admins: [res.locals.userId],
        members: [res.locals.userId],
        createdBy: res.locals.userId, // if not in schema, Mongoose will ignore; harmless
      });

      await User.updateOne({ _id: res.locals.userId }, { $addToSet: { groups: g._id } });

      res.json({
        ...g.toObject(),
        isAdmin: true,
        isMember: true,
        membersCount: 1,
      });
    } catch (e) {
      console.error("group create error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ JOIN / LEAVE ------------------------------ */
router.post(
  "/:id/join",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("members disabled deletedAt");
      if (!g) return res.status(404).json({ message: "Group not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const isMember = g.members.some((m) => String(m) === String(uid));
      if (isMember) {
        await Group.updateOne({ _id: id }, { $pull: { members: uid } });
        await User.updateOne({ _id: uid }, { $pull: { groups: id } });
      } else {
        await Group.updateOne({ _id: id }, { $addToSet: { members: uid } });
        await User.updateOne({ _id: uid }, { $addToSet: { groups: id } });
      }

      const fresh = await Group.findById(id).select("members").lean();
      res.json({ member: !isMember, membersCount: (fresh?.members || []).length });
    } catch (e) {
      console.error("group join error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ SUGGESTIONS ------------------------------ */
router.get("/suggestions", listLimiter, auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 20);
    const me = await User.findById(res.locals.userId).select("groups").lean();
    const mine = (me?.groups || []).map((x) => mongoose.Types.ObjectId.createFromHexString(String(x)));
    const items = await Group.find({ _id: { $nin: mine }, disabled: false, deletedAt: null })
      .sort({ createdAt: -1 }).limit(limit).lean();
    const withCounts = items.map(g => ({ ...g, membersCount: (g.members || []).length }));
    res.json(withCounts);
  } catch (e) {
    console.error("group sugg error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ GET GROUP (with flags) ------------------------------ */
router.get(
  "/:id",
  listLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const g = await Group.findById(req.params.id).lean();
      if (!g) return res.status(404).json({ message: "Not found" });

      const uid = res.locals.userId;
      const isAdmin  = (g.admins || []).some(a => String(a) === String(uid));
      const isMember = (g.members || []).some(m => String(m) === String(uid));
      const membersCount = (g.members || []).length;

      res.json({ ...g, isAdmin, isMember, membersCount });
    } catch (e) {
      console.error("group get error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ GROUP POSTS (members only) ------------------------------ */
router.get(
  "/:id/posts",
  listLimiter,
  auth,
  [
    param("id").custom((v) => mongoose.isValidObjectId(v)),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("members disabled deletedAt").lean();
      if (!g) return res.status(404).json({ message: "Group not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const isMember = (g.members || []).some(m => String(m) === String(uid));
      if (!isMember) return res.status(403).json({ message: "Join the group to view posts" });

      const page = parseInt(req.query.page || "1", 10);
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const now = new Date();

      const posts = await Post.find({
        scope: "group",
        group: id,
        $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("author", "_id pseudonym avatarURL")
        .populate("comments.user", "_id pseudonym avatarURL")
        .populate("group", "_id name privacy avatarURL coverURL")
        .lean();

      res.json(posts);
    } catch (e) {
      console.error("group posts error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ CREATE GROUP POST (members only) ------------------------------ */
router.post(
  "/:id/post",
  toggleLimiter,
  auth,
  [
    param("id").custom((v) => mongoose.isValidObjectId(v)),
    body("text").optional().isString().isLength({ max: 2000 }),
    body("image").optional().isString(),
    body("expiresAt").optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("members disabled deletedAt");
      if (!g) return res.status(404).json({ message: "Group not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const isMember = g.members.some((m) => String(m) === String(uid));
      if (!isMember) return res.status(403).json({ message: "Join the group first" });

      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const { text = "", image = "", expiresAt } = req.body;
      if (!text.trim() && !image) return res.status(400).json({ message: "Post cannot be empty" });

      // Admin posts permanent
      const me = await User.findById(uid).select("role").lean();
      const isPlatformAdmin = me?.role === "admin";

      const base = {
        author: uid,
        text: stripTags(text).trim(),
        image: image || "",
        scope: "group",
        group: id,
      };

      if (isPlatformAdmin) {
        base.isProtected = true;
        base.retention = "permanent";
        base.expiresAt = null;
      } else {
        base.expiresAt = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      const doc = await Post.create(base);

      const populated = await Post.findById(doc._id)
        .populate("author", "_id pseudonym avatarURL")
        .populate("comments.user", "_id pseudonym avatarURL")
        .populate("group", "_id name privacy avatarURL coverURL")
        .lean();

      res.json(populated);
    } catch (e) {
      console.error("group scoped post error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ ROSTERS: members & admins ------------------------------ */
router.get(
  "/:id/members",
  listLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const g = await Group.findById(req.params.id).select("members admins privacy disabled deletedAt").lean();
      if (!g) return res.status(404).json({ message: "Not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const uid = res.locals.userId;
      const isMember = (g.members || []).some(m => String(m) === String(uid));
      if (g.privacy === "private" && !isMember) return res.status(403).json({ message: "Members only" });

      const ids = (g.members || []).slice(0, 400);
      const users = await User.find({ _id: { $in: ids } }).select("_id pseudonym avatarURL role").lean();

      const adminSet = new Set((g.admins || []).map(String));
      const items = users.map(u => ({ ...u, isAdmin: adminSet.has(String(u._id)) }));

      res.json({ items, count: (g.members || []).length, admins: g.admins || [] });
    } catch (e) {
      console.error("group members error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/:id/admins",
  listLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const g = await Group.findById(req.params.id).select("admins disabled deletedAt").lean();
      if (!g) return res.status(404).json({ message: "Not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const users = await User.find({ _id: { $in: g.admins || [] } }).select("_id pseudonym avatarURL role").lean();
      res.json({ items: users });
    } catch (e) {
      console.error("group admins error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ COVER: upload & delete (group admins) ------------------------------ */
// POST /api/groups/:id/cover  (multipart/form-data; field name "image")
router.post(
  "/:id/cover",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  coverUpload.single("image"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("admins disabled deletedAt coverURL").lean();
      if (!g) return res.status(404).json({ message: "Not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const isAdmin = (g.admins || []).some(a => String(a) === String(uid));
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });

      const url = `/uploads/groups/${req.file.filename}`;
      removeLocalUploadsFileIfSafe(g.coverURL);

      await Group.updateOne({ _id: id }, { $set: { coverURL: url } }, { strict: false });
      res.json({ coverURL: url });
    } catch (e) {
      console.error("group cover upload error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// DELETE /api/groups/:id/cover
router.delete(
  "/:id/cover",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("admins coverURL disabled deletedAt").lean();
      if (!g) return res.status(404).json({ message: "Not found" });
      if (g.disabled || g.deletedAt) return res.status(403).json({ message: "Group unavailable" });

      const isAdmin = (g.admins || []).some(a => String(a) === String(uid));
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });

      removeLocalUploadsFileIfSafe(g.coverURL);
      await Group.updateOne({ _id: id }, { $unset: { coverURL: "" } }, { strict: false });

      res.json({ ok: true });
    } catch (e) {
      console.error("group cover delete error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ DELETE GROUP (group admin OR platform admin-key) ------------------------------ */
router.delete(
  "/:id",
  createLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const g = await Group.findById(id).select("admins coverURL").lean();
      if (!g) return res.status(404).json({ message: "Not found" });

      const isGroupAdmin = (g.admins || []).some(a => String(a) === String(uid));
      const hasKey = (req.headers["x-admin-key"] || "") === ADMIN_KEY;
      if (!isGroupAdmin && !hasKey) return res.status(403).json({ message: "Forbidden" });

      removeLocalUploadsFileIfSafe(g.coverURL);

      await Post.deleteMany({ scope: "group", group: id });
      await Group.deleteOne({ _id: id });
      await User.updateMany({}, { $pull: { groups: id } });

      res.json({ ok: true });
    } catch (e) {
      console.error("group delete error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================== ADMIN MODERATION ============================== */
/* LIST GROUPS (platform admin) */
router.get("/admin", listLimiter, auth, async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });

    const q = String(req.query.search || "").trim();
    theRe = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

    const where = {};
    if (theRe) where.name = theRe;
    if (typeof req.query.disabled !== "undefined") {
      where.disabled = String(req.query.disabled).toLowerCase() === "true";
    }

    const groups = await Group.find(where)
      .select("_id name privacy avatarURL coverURL disabled deletedAt description")
      .sort({ name: 1 })
      .limit(200)
      .lean();

    res.json(groups);
  } catch (e) {
    console.error("[admin groups] list error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* DISABLE GROUP (platform admin) */
router.post("/:id/disable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });
    await Group.updateOne({ _id: req.params.id }, { $set: { disabled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ENABLE GROUP (platform admin) */
router.post("/:id/enable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });
    await Group.updateOne({ _id: req.params.id }, { $set: { disabled: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

/* SOFT DELETE GROUP (platform admin) */
router.delete("/:id/soft", createLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });
    await Group.updateOne({ _id: req.params.id }, { $set: { deletedAt: new Date(), disabled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
