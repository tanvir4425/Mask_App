const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const auth = require("../middleware/auth");
const Page = require("../models/Page");
const Post = require("../models/Post");
const User = require("../models/User");

const router = express.Router();

function stripTags(s = "") { return String(s).replace(/<[^>]*>/g, ""); }

const createLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const toggleLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const listLimiter   = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false });

async function ensurePlatformAdmin(userId) {
  const me = await User.findById(userId).select("role").lean();
  return !!me && me.role === "admin";
}

/* ---------- uploads for page cover ---------- */
const uploadsRoot = path.join(__dirname, "..", "uploads");
const pageUploadsDir = path.join(uploadsRoot, "pages");
if (!fs.existsSync(pageUploadsDir)) fs.mkdirSync(pageUploadsDir, { recursive: true });

const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, pageUploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `page_${req.params.id || "new"}_cover_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const coverUpload = multer({ storage: coverStorage });

function removeLocalUploadsFileIfSafe(url) {
  try {
    if (!url || typeof url !== "string") return;
    if (!url.startsWith("/uploads/pages/")) return;
    const rel = url.replace("/uploads/", "");
    const p = path.join(uploadsRoot, rel);
    if (p.startsWith(uploadsRoot) && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

/* ------------------------------------------------------------------ */
/* GET /api/pages                                                     */
/* ------------------------------------------------------------------ */
router.get(
  "/",
  listLimiter,
  auth,
  [query("mode").optional().isIn(["mine", "suggestions"]), query("q").optional().isString()],
  async (req, res) => {
    try {
      const uid = res.locals.userId;
      const q = String(req.query.q || "").trim();
      const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

      // Load my page ids
      const me = await User.findById(uid).select("pages").lean();
      const myIds = (me?.pages || []).map((x) => String(x));

      // Build "mine"
      const mineFilter = {
        _id: { $in: myIds },
        deletedAt: null,
      };
      if (re) mineFilter.name = re;

      const suggestionsFilter = {
        _id: { $nin: myIds },
        deletedAt: null,
        disabled: false,
      };
      if (re) suggestionsFilter.name = re;

      async function loadMine() {
        if (!myIds.length) return [];
        const rows = await Page.find(mineFilter)
          .select("_id name category description avatarURL coverURL admins followers disabled deletedAt")
          .sort({ name: 1 })
          .lean();
        return rows.map((p) => ({
          ...p,
          followersCount: (p.followers || []).length,
          isAdmin: (p.admins || []).some((a) => String(a) === String(uid)),
          following: true,
        }));
      }

      async function loadSuggestions() {
        const rows = await Page.find(suggestionsFilter)
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        return rows.map((p) => ({ ...p, followersCount: (p.followers || []).length }));
      }

      if (req.query.mode === "mine")        return res.json(await loadMine());
      if (req.query.mode === "suggestions") return res.json(await loadSuggestions());

      const [mine, suggestions] = await Promise.all([loadMine(), loadSuggestions()]);
      return res.json({ mine, suggestions });
    } catch (e) {
      console.error("[pages] GET / error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ CREATE PAGE ------------------------------ */
router.post(
  "/",
  createLimiter,
  auth,
  [
    body("name").trim().isLength({ min: 3, max: 80 }).withMessage("Name 3–80 chars"),
    body("category").optional().isLength({ max: 80 }),
    body("description").optional().isLength({ max: 300 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    try {
      const doc = await Page.create({
        name: stripTags(req.body.name).trim(),
        category: stripTags(req.body.category || "").trim(),
        description: stripTags(req.body.description || "").trim(),
        admins: [res.locals.userId],
        followers: [res.locals.userId],
      });
      await User.updateOne({ _id: res.locals.userId }, { $addToSet: { pages: doc._id } });
      res.json({ ...doc.toObject(), followersCount: 1, isAdmin: true, following: true });
    } catch (e) {
      console.error("page create error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ FOLLOW/UNFOLLOW ------------------------------ */
router.post(
  "/:id/follow",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;
      const p = await Page.findById(id).select("followers disabled deletedAt");
      if (!p) return res.status(404).json({ message: "Page not found" });
      if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

      const has = p.followers.some((x) => String(x) === String(uid));
      if (has) {
        await Page.updateOne({ _id: id }, { $pull: { followers: uid } });
        await User.updateOne({ _id: uid }, { $pull: { pages: id } });
      } else {
        await Page.updateOne({ _id: id }, { $addToSet: { followers: uid } });
        await User.updateOne({ _id: uid }, { $addToSet: { pages: id } });
      }
      const fresh = await Page.findById(id).select("followers");
      res.json({ following: !has, followersCount: fresh ? fresh.followers.length : 0 });
    } catch (e) {
      console.error("page follow error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ SUGGESTIONS (compat) ------------------------------ */
router.get("/suggestions", listLimiter, auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 20);
    const me = await User.findById(res.locals.userId).select("pages").lean();
    const mine = new Set((me?.pages || []).map(String));
    const items = await Page.find({ disabled: false, deletedAt: null }).sort({ createdAt: -1 }).limit(50).lean();
    const out = items
      .map((p) => ({ ...p, followersCount: (p.followers || []).length }))
      .filter((p) => !mine.has(String(p._id)))
      .slice(0, limit);
    res.json(out);
  } catch (e) {
    console.error("page sugg error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ YOUR PAGES (compat) ------------------------------ */
router.get("/mine", listLimiter, auth, async (req, res) => {
  try {
    const uid = res.locals.userId;
    const me = await User.findById(uid).select("pages").lean();
    const ids = (me?.pages || []).map((x) => String(x));
    if (!ids.length) return res.json([]);
    const rows = await Page.find({ _id: { $in: ids }, deletedAt: null })
      .select("_id name category description avatarURL coverURL admins followers disabled deletedAt")
      .sort({ name: 1 })
      .lean();
    const out = rows.map((p) => ({
      ...p,
      followersCount: (p.followers || []).length,
      isAdmin: (p.admins || []).some((a) => String(a) === String(uid)),
      following: true,
    }));
    res.json(out);
  } catch (e) {
    console.error("pages /mine error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ GET PAGE ------------------------------ */
router.get("/:id", listLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const p = await Page.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ message: "Not found" });
    const followersCount = (p.followers || []).length;
    const isAdmin = (p.admins || []).some((x) => String(x) === String(res.locals.userId));
    const following = (p.followers || []).some((x) => String(x) === String(res.locals.userId));
    res.json({ ...p, followersCount, isAdmin, following });
  } catch (e) {
    console.error("page get error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ PAGE POSTS ------------------------------ */
router.get(
  "/:id/posts",
  listLimiter,
  auth,
  [
    param("id").custom(mongoose.isValidObjectId),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 })
  ],
  async (req, res) => {
    try {
      const id = req.params.id;
      const page = parseInt(req.query.page || "1", 10);
      const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const now = new Date();

      const posts = await Post.find({
        scope: "page",
        page: id,
        $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      })
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate("author", "_id pseudonym avatarURL")
        .populate("comments.user", "_id pseudonym avatarURL")
        .populate("page", "_id name avatarURL coverURL")
        .lean();

      res.json(posts);
    } catch (e) {
      console.error("page posts error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ CREATE POST ON PAGE ------------------------------ */
router.post(
  "/:id/post",
  toggleLimiter,
  auth,
  [
    param("id").custom(mongoose.isValidObjectId),
    body("text").optional().isString().isLength({ max: 2000 }),
    body("image").optional().isString(),
    body("expiresAt").optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;
      const p = await Page.findById(id).select("admins disabled deletedAt");
      if (!p) return res.status(404).json({ message: "Page not found" });
      if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

      const isAdmin = p.admins.some((x) => String(x) === String(uid));
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });

      const { text = "", image = "", expiresAt } = req.body;
      const t = stripTags(text || "").trim();
      if (!t && !image) return res.status(400).json({ message: "Post cannot be empty" });

      // Admin posts permanent
      const me = await User.findById(uid).select("role").lean();
      const isPlatformAdmin = me?.role === "admin";

      const base = {
        author: uid,
        text: t,
        image: image || "",
        scope: "page",
        page: id,
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
        .populate("page", "_id name avatarURL coverURL")
        .lean();
      res.json(populated);
    } catch (e) {
      console.error("page post error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ DELETE PAGE ------------------------------ */
router.delete(
  "/:id",
  createLimiter,
  auth,
  [param("id").custom(mongoose.isValidObjectId)],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const p = await Page.findById(id).select("admins coverURL").lean();
      if (!p) return res.status(404).json({ message: "Not found" });

      const isPageAdmin = (p.admins || []).some(a => String(a) === String(uid));
      if (!isPageAdmin) return res.status(403).json({ message: "Forbidden" });

      removeLocalUploadsFileIfSafe(p.coverURL);

      await Post.deleteMany({ scope: "page", page: id });
      await Page.deleteOne({ _id: id });
      await User.updateMany({}, { $pull: { pages: id } });

      res.json({ ok: true });
    } catch (e) {
      console.error("page delete error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ ROSTERS ------------------------------ */
router.get("/:id/followers", listLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const p = await Page.findById(req.params.id).select("followers disabled deletedAt").lean();
    if (!p) return res.status(404).json({ message: "Not found" });
    if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

    const ids = (p.followers || []).slice(0, 200);
    const users = await User.find({ _id: { $in: ids } }).select("_id pseudonym avatarURL role").lean();
    res.json({ items: users, count: (p.followers || []).length });
  } catch (e) {
    console.error("page followers error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/admins", listLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const p = await Page.findById(req.params.id).select("admins disabled deletedAt").lean();
    if (!p) return res.status(404).json({ message: "Not found" });
    if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

    const users = await User.find({ _id: { $in: p.admins || [] } }).select("_id pseudonym avatarURL role").lean();
    res.json({ items: users });
  } catch (e) {
    console.error("page admins error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ COVER: upload/delete ------------------------------ */
router.post(
  "/:id/cover",
  toggleLimiter,
  auth,
  [param("id").custom(mongoose.isValidObjectId)],
  coverUpload.single("image"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const p = await Page.findById(id).select("admins disabled deletedAt coverURL").lean();
      if (!p) return res.status(404).json({ message: "Not found" });
      if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

      const isAdmin = (p.admins || []).some(a => String(a) === String(uid));
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });

      const url = `/uploads/pages/${req.file.filename}`;
      removeLocalUploadsFileIfSafe(p.coverURL);

      await Page.updateOne({ _id: id }, { $set: { coverURL: url } }, { strict: false });

      res.json({ coverURL: url });
    } catch (e) {
      console.error("page cover upload error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.delete(
  "/:id/cover",
  toggleLimiter,
  auth,
  [param("id").custom(mongoose.isValidObjectId)],
  async (req, res) => {
    try {
      const id = req.params.id;
      const uid = res.locals.userId;

      const p = await Page.findById(id).select("admins coverURL disabled deletedAt").lean();
      if (!p) return res.status(404).json({ message: "Not found" });
      if (p.disabled || p.deletedAt) return res.status(403).json({ message: "Page unavailable" });

      const isAdmin = (p.admins || []).some(a => String(a) === String(uid));
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });

      removeLocalUploadsFileIfSafe(p.coverURL);
      await Page.updateOne({ _id: id }, { $unset: { coverURL: "" } }, { strict: false });

      res.json({ ok: true });
    } catch (e) {
      console.error("page cover delete error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ============================== ADMIN MODERATION ============================== */
router.get("/admin", listLimiter, auth, async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });

    const q = String(req.query.search || "").trim();
    const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

    const where = {};
    if (re) where.name = re;
    if (typeof req.query.disabled !== "undefined") {
      where.disabled = String(req.query.disabled).toLowerCase() === "true";
    }

    const pages = await Page.find(where)
      .select("_id name avatarURL coverURL disabled deletedAt category description")
      .sort({ name: 1 })
      .limit(200)
      .lean();

    res.json(pages);
  } catch (e) {
    console.error("[admin pages] list error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/disable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });
    await Page.updateOne({ _id: req.params.id }, { $set: { disabled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/enable", toggleLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });
    await Page.updateOne({ _id: req.params.id }, { $set: { disabled: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id/soft", createLimiter, auth, [param("id").custom(mongoose.isValidObjectId)], async (req, res) => {
  try {
    const isAdmin = await ensurePlatformAdmin(res.locals.userId);
    if (!isAdmin) return res.status(403).json({ message: "Admin only" });

    await Page.updateOne({ _id: req.params.id }, { $set: { deletedAt: new Date(), disabled: true } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
