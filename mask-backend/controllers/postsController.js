// mask-backend/controllers/postsController.js
const Post = require("../models/Post");

const ALLOWED_REACTIONS = ["like", "love", "care", "haha", "wow", "sad", "angry"];

/* helpers */
function getPageLimit(q) {
  const page = Math.max(parseInt(q.page ?? "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit ?? "20", 10) || 20, 1), 50);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
function getAuthUserId(req) {
  return req?.user?.id || req?.user?._id || req?.userId || null;
}
function stripTags(s = "") {
  return String(s).replace(/<[^>]*>/g, "");
}
function sanitizeText(s = "", max = 1000) {
  return stripTags(s).trim().slice(0, max);
}

/* create */
exports.createPost = async (req, res) => {
  try {
    const text = sanitizeText(req.body?.text);
    if (!text) return res.status(400).json({ message: "Post text required" });

    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const hours = 12 + Math.floor(Math.random() * 13); // 12..24
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const newPost = await Post.create({
      text,
      image: req.body?.image || null,
      author: uid,
      expiresAt,
    });

    const populated = await Post.findById(newPost._id)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("Create post error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

/* feeds */
exports.getPosts = async (req, res) => {
  try {
    const now = new Date();
    const { limit, skip } = getPageLimit(req.query);

    const posts = await Post.find({ expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");

    return res.json(posts);
  } catch (err) {
    console.error("Get posts error:", err);
    return res.status(500).json({ message: "Error loading posts", error: err?.message });
  }
};

exports.getTrending = async (req, res) => {
  try {
    const now = new Date();
    const { limit, skip } = getPageLimit(req.query);

    const pipeline = [
      { $match: { expiresAt: { $gt: now } } },
      {
        $addFields: {
          commentsCount:  { $size: { $ifNull: ["$comments", []] } },
          sharesCount:    { $size: { $ifNull: ["$shares", []] } },
          reactionsCount: { $size: { $ifNull: ["$reactions", []] } },
        },
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$commentsCount", 5] },
              { $multiply: ["$sharesCount", 3] },
              { $multiply: ["$reactionsCount", 1] },
            ],
          },
        },
      },
      { $sort: { score: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    let docs = await Post.aggregate(pipeline);
    docs = await Post.populate(docs, [
      { path: "author", select: "pseudonym avatarURL" },
      { path: "comments.user", select: "pseudonym avatarURL" },
    ]);

    return res.json(docs);
  } catch (err) {
    console.error("Trending error:", err);
    return res.status(500).json({ message: "Error loading trending", error: err?.message });
  }
};

/* single post (for card self-refresh) */
exports.getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");
    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json(post);
  } catch (err) {
    console.error("Get post error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

/* interactions */
exports.reactPost = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  if (!ALLOWED_REACTIONS.includes(type)) {
    return res.status(400).json({ message: "Invalid reaction type" });
  }

  try {
    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // ensure arrays are clean
    if (!Array.isArray(post.reactions)) post.reactions = [];
    post.reactions = post.reactions.filter(r => r && r.user && r.type);

    const idx = post.reactions.findIndex((r) => String(r.user) === String(uid));
    if (idx === -1) {
      post.reactions.push({ user: uid, type });
    } else if (post.reactions[idx].type === type) {
      post.reactions.splice(idx, 1);               // toggle off
    } else {
      post.reactions[idx].type = type;             // change type
    }

    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");

    const counts = {};
    (populated.reactions || []).forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });

    return res.json({ post: populated, reactionCounts: counts });
  } catch (err) {
    console.error("React error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.commentPost = async (req, res) => {
  const { id } = req.params;
  const text = sanitizeText(req.body?.text);
  if (!text) return res.status(400).json({ message: "Comment text required" });

  try {
    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // keep arrays clean
    if (!Array.isArray(post.reactions)) post.reactions = [];
    if (!Array.isArray(post.comments)) post.comments = [];
    post.reactions = post.reactions.filter(r => r && r.user && r.type);
    post.comments  = post.comments .filter(c => c && c.user && typeof c.text === "string" && c.text.trim());

    post.comments.push({ user: uid, text });
    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("Comment error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.sharePost = async (req, res) => {
  const { id } = req.params;
  try {
    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!Array.isArray(post.shares)) post.shares = [];
    post.shares = post.shares.filter(s => s && s.user);
    post.shares.push({ user: uid });

    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "pseudonym avatarURL")
      .populate("comments.user", "pseudonym avatarURL");

    return res.json(populated);
  } catch (err) {
    console.error("Share error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const deleted = await Post.findOneAndDelete({ _id: id, author: uid });
    if (!deleted) return res.status(404).json({ message: "Post not found or not owned by you" });

    return res.status(204).send();
  } catch (err) {
    console.error("Delete post error:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};
