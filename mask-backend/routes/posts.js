// mask-backend/routes/posts.js
const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const auth = require("../middleware/auth");
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Group = require("../models/Group");
const Page = require("../models/Page");
const FactCheckResult = require("../models/FactCheckResult"); // used for Trending throttle
const { enqueueFactCheck } = require("../services/factcheckWorker"); // ✅ enqueue fact-checks

// ✅ link preview helpers
const { findFirstUrl, fetchLinkPreview } = require("../utils/linkPreview");

const router = express.Router();
const ALLOWED_REACTIONS = ["like", "love", "care", "haha", "wow", "sad", "angry"];

// Cloudinary toggle
const { isEnabled: CLOUD_ON, uploadBuffer } = require("../utils/cloudinary");

/* ----------------------------- auto-trigger knobs ----------------------------- */
// Thresholds: only auto-check "hot" posts.
const REACTS_THRESHOLD = parseInt(process.env.TRUST_AUTOTRIGGER_REACTS || "2", 10);
const UNIQUE_THRESHOLD = parseInt(process.env.TRUST_AUTOTRIGGER_UNIQUE_USERS || "2", 10);
// Cooldown to avoid spamming the queue if a post stays above the threshold (minutes → ms)
const AUTOTRIGGER_COOLDOWN_MS =
  (parseInt(process.env.TRUST_AUTOTRIGGER_COOLDOWN_MINUTES || "60", 10) || 60) * 60 * 1000;
// One-and-done guard (if enabled in env)
const ONLY_ONCE = String(process.env.TRUST_FACTCHECK_ONLY_ONCE || "1") === "1";

// In-memory "recently queued" map (postId -> timestamp)
const __recentAutoFC = new Map();

/* --------------------------------- uploads -------------------------------- */
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
}

// - Cloudinary ON  -> memoryStorage (we upload buffer)
// - Cloudinary OFF -> diskStorage in /uploads
const storage = CLOUD_ON
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
      },
    });

const upload = multer({ storage }); // field name must be "image"

/* ----------------------------- helper: populates ----------------------------- */
function withPopulates(q) {
  return q
    .populate("author", "_id pseudonym avatarURL")
    .populate("comments.user", "_id pseudonym avatarURL")
    .populate("group", "_id name privacy avatarURL")
    .populate("page", "_id name avatarURL coverURL")
    .populate({
      path: "originalPost",
      select: "_id text image author page group createdAt expiresAt scope",
      populate: [
        { path: "author", select: "_id pseudonym avatarURL" },
        { path: "page",   select: "_id name avatarURL coverURL" },
        { path: "group",  select: "_id name privacy avatarURL" },
      ],
    });
}

/* ------------------------ helper: build reaction counts --------------------- */
function buildReactionCounts(reactions = []) {
  const base = { like:0, love:0, care:0, haha:0, wow:0, sad:0, angry:0 };
  if (!Array.isArray(reactions) && reactions && typeof reactions === "object") {
    for (const k of Object.keys(base)) base[k] = Number(reactions[k] || 0);
    return base;
  }
  for (const r of reactions) {
    if (r && base.hasOwnProperty(r.type)) base[r.type] += 1;
  }
  return base;
}

// ---- Step 3: reaction-based retention helper ----
async function applyRetention(post) {
  try {
    if (!post) return;
    const RETENTION_WEEK_THRESHOLD = Number(process.env.RETENTION_WEEK_THRESHOLD || 5);
    const RETENTION_PERMA_THRESHOLD = Number(process.env.RETENTION_PERMA_THRESHOLD || 8);
    const RETENTION_WEEK_DAYS = Number(process.env.RETENTION_WEEK_DAYS || 7);

    const counts = buildReactionCounts(post.reactions);
    const likes = (counts.like || 0) + (counts.love || 0);
    const strong = likes + (counts.wow || 0) + (counts.care || 0);

    if (!post.isProtected && strong >= RETENTION_PERMA_THRESHOLD) {
      post.retention = "permanent";
      post.expiresAt = null;
      await post.save();
      return;
    }
    if (!post.isProtected && likes >= RETENTION_WEEK_THRESHOLD && post.expiresAt) {
      post.retention = "extended";
      post.expiresAt = new Date(Date.now() + RETENTION_WEEK_DAYS * 24 * 60 * 60 * 1000);
      await post.save();
    }
  } catch (err) {
    console.error("applyRetention error:", err);
  }
}

/* Build "for you" scope */
async function buildForYouFilter(userId) {
  const me = await User.findById(userId).select("groups pages").lean();
  const myGroupIds = (me?.groups || []).map(String);
  const myPageIds  = (me?.pages  || []).map(String);
  return {
    $or: [
      { $or: [{ scope: { $exists: false } }, { scope: "global" }] },
      myGroupIds.length ? { scope: "group", group: { $in: myGroupIds } } : null,
      myPageIds.length  ? { scope: "page",  page:  { $in: myPageIds } }  : null,
    ].filter(Boolean),
  };
}

/* -------------------------------- rate limits ------------------------------- */
const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const toggleLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

/* ------------------------------ auto-trigger fn ------------------------------ */
async function maybeAutoFactcheck(post) {
  try {
    if (!post) return;

    // Hard "only once" guard (skip if any result exists)
    if (ONLY_ONCE) {
      const already = await FactCheckResult.exists({ post: post._id });
      if (already) return;
    } else {
      // Else: If latest verdict is non-unverified, do nothing.
      const latest = await FactCheckResult.findOne({ post: post._id })
        .sort({ createdAt: -1 })
        .select("verdict createdAt")
        .lean();
      if (latest && latest.verdict && latest.verdict !== "unverified") return;
    }

    // Compute total reactions + unique users
    const counts = buildReactionCounts(post.reactions || []);
    const totalReacts = Object.values(counts).reduce((a, b) => a + b, 0);
    const uniqueUsers = new Set((post.reactions || []).map(r => String(r.user))).size;

    if (totalReacts < REACTS_THRESHOLD || uniqueUsers < UNIQUE_THRESHOLD) return;

    // Cooldown guard so we don't enqueue repeatedly if the post stays hot
    const key = String(post._id);
    const last = __recentAutoFC.get(key) || 0;
    if (Date.now() - last < AUTOTRIGGER_COOLDOWN_MS) return;

    // Enqueue; passing a hint object is safe even if the worker ignores it.
    try {
      enqueueFactCheck(post._id, { forceGemini: true, reason: "engagement_threshold" });
      __recentAutoFC.set(key, Date.now());
      console.log(`[factcheck] auto-triggered for post=${key} (reactions=${totalReacts}, unique=${uniqueUsers})`);
    } catch (e) {
      console.warn("[factcheck] auto-trigger enqueue failed:", e?.message || e);
    }
  } catch (e) {
    console.warn("[factcheck] auto-trigger error:", e?.message || e);
  }
}

/* -------------------------------- CREATE post ------------------------------- */
router.post(
  "/",
  createLimiter,
  auth,
  upload.single("image"),
  [
    body("scope").optional().isIn(["global", "group", "page"]),
    body("group").optional().isString(),
    body("page").optional().isString(),
    body("text").optional().isLength({ max: 2000 }),
  ],
  async (req, res) => {
    try {
      const uid = res.locals.userId;
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const isAdmin = String(req.user?.role || "") === "admin";
      const text = String(req.body?.text || "").slice(0, 2000).trim();

      // Resolve scope
      let scope = String(req.body?.scope || "global");
      let group = null;
      let page  = null;

      if (scope === "group") {
        const gId = String(req.body?.group || "");
        if (!mongoose.isValidObjectId(gId)) return res.status(400).json({ message: "Invalid group" });
        const g = await Group.findById(gId).select("_id members disabled deletedAt").lean();
        if (!g || g.disabled || g.deletedAt) return res.status(400).json({ message: "Invalid group" });
        const isMember = (g.members || []).some((m) => String(m) === String(uid));
        if (!isMember) return res.status(403).json({ message: "Only members can post in group" });
        group = g._id;
      } else if (scope === "page") {
        const pId = String(req.body?.page || "");
        if (!mongoose.isValidObjectId(pId)) return res.status(400).json({ message: "Invalid page" });
        const p = await Page.findById(pId).select("_id admins disabled deletedAt").lean();
        if (!p || p.disabled || p.deletedAt) return res.status(400).json({ message: "Invalid page" });
        const isAdminOfPage = (p.admins || []).some((a) => String(a) === String(uid));
        if (!isAdminOfPage) return res.status(403).json({ message: "Only page admins can post to a page" });
        page = p._id;
      } else {
        scope = "global";
      }

      // TTL (24h by default, permanent for admin)
      const expiresAt = isAdmin ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Build image URL depending on storage
      let imageUrl = "";
      if (req.file) {
        if (CLOUD_ON) {
          try {
            const up = await uploadBuffer(req.file.buffer, "posts");
            imageUrl = up.secure_url;
          } catch (e) {
            console.error("Cloudinary upload failed:", e);
            return res.status(500).json({ message: "Image upload failed" });
          }
        } else {
          imageUrl = `/uploads/${req.file.filename}`;
        }
      }

      // ✅ Try to enrich with link preview (non-blocking, short timeout)
      let linkPreview = null;
      try {
        const firstUrl = findFirstUrl(text);
        if (firstUrl) {
          linkPreview = await Promise.race([
            fetchLinkPreview(firstUrl),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
          ]).catch(() => null);
        }
      } catch { /* ignore */ }

      const post = await Post.create({
        author: uid,
        text,
        image: imageUrl,
        scope,
        group,
        page,
        isProtected: !!isAdmin,
        retention: isAdmin ? "permanent" : "normal",
        expiresAt,
        ...(linkPreview ? { linkPreview } : {}),
      });

      // ✅ optionally queue a fact-check on create (env-controlled)
      try {
        const ON_CREATE = String(process.env.TRUST_FACTCHECK_ON_CREATE || "0") === "1";
        const TAG_ONLY  = String(process.env.TRUST_FACTCHECK_ON_CREATE_TAG_ONLY || "1") === "1";
        const TRIGGER_TAG = (process.env.TRUST_GEMINI_TRIGGER_TAG || "#verify").toLowerCase();
        const hasTag = (text || "").toLowerCase().includes(TRIGGER_TAG);

        if (ON_CREATE && (!TAG_ONLY || hasTag)) {
          enqueueFactCheck(post._id, { reason: "on_create" });
        }
      } catch (e) {
        console.warn("[factcheck] enqueue (on_create) failed:", e?.message || e);
      }

      const populated = await withPopulates(Post.findById(post._id)).lean();
      return res.status(201).json(populated);
    } catch (err) {
      console.error("Create post error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------ FEED (for you) ------------------------------ */
router.get("/", toggleLimiter, auth, async (req, res) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (p - 1) * l;

    const scopeFilter = await buildForYouFilter(res.locals.userId);

    const now = new Date();
    const posts = await withPopulates(
      Post.find({
        ...scopeFilter,
        $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
    ).lean();

    res.json(posts);
  } catch (e) {
    console.error("feed error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------ TRENDING feed ------------------------------ */
router.get("/trending", toggleLimiter, auth, async (req, res) => {
  try {
    const { page = "1", limit = "20", windowDays = "30" } = req.query;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (p - 1) * l;

    const days = Math.max(parseInt(windowDays, 10) || 30, 1);
    const now = new Date();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const scopeFilter = await buildForYouFilter(res.locals.userId);
    const match = {
      ...scopeFilter,
      $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      createdAt: { $gte: since },
    };

    const raw = await Post.find(match).sort({ createdAt: -1 }).limit(1000).lean();

    let scored = raw
      .map((r) => {
        const counts = buildReactionCounts(r.reactions);
        const reactionsCount = Object.values(counts).reduce((a, b) => a + b, 0);
        const commentsCount = (r.comments || []).length;
        const sharesCount = (r.shares || []).length;
        const score = reactionsCount * 1 + commentsCount * 5 + sharesCount * 3;
        return { ...r, reactionsCount, commentsCount, sharesCount, score };
      })
      .filter((r) => r.reactionsCount >= 2)
      .sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));

    try {
      const dingSet = new Set(
        (await FactCheckResult.find({
          post: { $in: scored.map((x) => x._id) },
          createdAt: { $gte: since },
        }).select("post").lean()).map((x) => String(x.post))
      );
      if (dingSet.size) {
        const head = [], tail = [];
        for (const r of scored) (dingSet.has(String(r._id)) ? tail : head).push(r);
        scored = [...head, ...tail];
      }
    } catch (err) {
      console.warn("[trending] throttle skipped:", err?.message || err);
    }

    const pageSlice = scored.slice(skip, skip + l);
    const populated = await Post.populate(pageSlice, [
      { path: "author", select: "_id pseudonym avatarURL" },
      { path: "comments.user", select: "_id pseudonym avatarURL" },
      { path: "group", select: "_id name privacy avatarURL" },
      { path: "page",  select: "_id name avatarURL coverURL" },
      {
        path: "originalPost",
        select: "_id text image author page group createdAt expiresAt scope",
        populate: [
          { path: "author", select: "_id pseudonym avatarURL" },
          { path: "page",   select: "_id name avatarURL coverURL" },
          { path: "group",  select: "_id name privacy avatarURL" },
        ],
      },
    ]);

    return res.json(populated);
  } catch (e) {
    console.error("trending error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------- GET one -------------------------------- */
router.get(
  "/:id",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const post = await withPopulates(Post.findById(req.params.id)).lean();
      if (!post) return res.status(404).json({ message: "Not found" });

      if (post.scope === "group" && post.group) {
        const me = await User.findById(res.locals.userId).select("groups").lean();
        const isMember = (me?.groups || []).some((g) => String(g) === String(post.group._id || post.group));
        if (!isMember) return res.status(403).json({ message: "Forbidden" });
      }

      return res.json(post);
    } catch (e) {
      console.error("get post error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* --------------------------------- Comment --------------------------------- */
router.post(
  "/:id/comment",
  toggleLimiter,
  auth,
  [
    param("id").custom((v) => mongoose.isValidObjectId(v)),
    body("text").isLength({ min: 1, max: 1000 }).withMessage("text required"),
  ],
  async (req, res) => {
    try {
      const id = req.params.id;
      const text = String(req.body.text || "").trim();
      const post = await Post.findById(id);
      if (!post) return res.status(404).json({ message: "Not found" });

      if (post.scope === "group" && post.group) {
        const me = await User.findById(res.locals.userId).select("groups").lean();
        const isMember = (me?.groups || []).some((g) => String(g) === String(post.group));
        if (!isMember) return res.status(403).json({ message: "Forbidden" });
      }

      post.comments = post.comments || [];
      post.comments.push({ user: res.locals.userId, text, createdAt: new Date() });
      await post.save();

      try {
        if (String(post.author) !== String(res.locals.userId)) {
          await Notification.create({
            user: post.author,
            type: "comment",
            data: { post: post._id, by: res.locals.userId, text },
          });
        }
      } catch {}

      const populated = await withPopulates(Post.findById(id)).lean();
      return res.json(populated);
    } catch (e) {
      console.error("comment error:", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* -------------------------------- React -------------------------------- */
router.post("/:id/react", toggleLimiter, auth, async (req, res) => {
  try {
    const id = req.params.id;
    const type = String(req.body?.type || "");
    if (!ALLOWED_REACTIONS.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction" });
    }

    const userId = res.locals.userId;
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Not found" });

    if (!Array.isArray(post.reactions)) post.reactions = [];

    post.reactions = (post.reactions || []).filter(r => r && r.user && r.type);
    const seen = new Set();
    for (let i = post.reactions.length - 1; i >= 0; i--) {
      const k = String(post.reactions[i].user);
      if (seen.has(k)) post.reactions.splice(i, 1);
      else seen.add(k);
    }
    const idx = post.reactions.findIndex(r => String(r.user) === String(userId));

    if (idx === -1) post.reactions.push({ user: userId, type });
    else if (post.reactions[idx].type === type) post.reactions.splice(idx, 1);
    else post.reactions[idx].type = type;

    await post.save();
    await applyRetention(post);

    // 🔔 Auto-trigger: high engagement → queue a fact-check (cooldown-protected)
    try { await maybeAutoFactcheck(post); } catch {}

    const populated = await withPopulates(Post.findById(id)).lean();
    const reactionCounts = buildReactionCounts(populated.reactions);
    return res.json({ post: populated, reactionCounts, ...populated });
  } catch (e) {
    console.error("react error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------------------------------- Share -------------------------------- */
router.post("/:id/share", toggleLimiter, auth, async (req, res) => {
  try {
    const original = await withPopulates(Post.findById(req.params.id)).lean();
    if (!original) return res.status(404).json({ message: "Not found" });

    if (original.scope === "group" && original.group) {
      const me = await User.findById(res.locals.userId).select("groups").lean();
      const isMember = (me?.groups || []).some((g) => String(g) === String(original.group._id || original.group));
      if (!isMember) return res.status(403).json({ message: "Forbidden" });
    }

    const isAdmin = String(req.user?.role || "") === "admin";
    const expiresAt = isAdmin ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const re = await Post.create({
      author: res.locals.userId,
      type: "reshare",
      originalPost: original._id,
      text: "",
      image: "",
      scope: "global",
      isProtected: !!isAdmin,
      retention: isAdmin ? "permanent" : "normal",
      expiresAt,
    });

    const populated = await withPopulates(Post.findById(re._id)).lean();
    return res.status(201).json(populated);
  } catch (e) {
    console.error("share error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------------------------------- Delete -------------------------------- */
router.delete(
  "/:id",
  toggleLimiter,
  auth,
  [param("id").custom((v) => mongoose.isValidObjectId(v))],
  async (req, res) => {
    try {
      const p = await Post.findById(req.params.id).lean();
      if (!p) return res.status(404).json({ message: "Not found" });

      const isOwner = String(p.author) === String(res.locals.userId);
      const isAdmin = String(req.user?.role || "") === "admin";

      let allowed = isOwner || isAdmin;

      if (!allowed && p.scope === "page" && p.page) {
        const page = await Page.findById(p.page).select("admins").lean();
        allowed = !!page && (page.admins || []).some((a) => String(a) === String(res.locals.userId));
      }
      if (!allowed && p.scope === "group" && p.group) {
        const group = await Group.findById(p.group).select("admins").lean();
        allowed = !!group && (group.admins || []).some((a) => String(a) === String(res.locals.userId));
      }

      if (!allowed) return res.status(403).json({ message: "Forbidden" });

      await Post.deleteOne({ _id: p._id });
      return res.json({ ok: true });
    } catch (e) {
      console.error("delete error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
