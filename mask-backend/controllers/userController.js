// controllers/userController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');

/* Helper: current user id from auth middleware */
function getAuthUserId(req) {
  return req?.user?.id || req?.user?._id || req?.userId || null;
}

/* ===== Profile ===== */
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('pseudonym avatarURL createdAt role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const me = getAuthUserId(req);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) !== String(me)) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Allow updating a subset of fields
    if (typeof req.body.pseudonym === 'string') user.pseudonym = req.body.pseudonym.trim() || user.pseudonym;
    if (typeof req.body.avatarURL === 'string') user.avatarURL = req.body.avatarURL.trim();

    const updated = await user.save();
    return res.json({
      id: updated._id,
      pseudonym: updated.pseudonym,
      avatarURL: updated.avatarURL
    });
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

/* ===== Bookmarks ===== */
// POST /api/users/me/bookmarks/:postId  -> toggle
exports.toggleBookmark = async (req, res) => {
  try {
    const me = getAuthUserId(req);
    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    const postId = req.params.postId;
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid post id' });
    }

    // Ensure post exists and is not expired
    const post = await Post.findOne({ _id: postId, expiresAt: { $gt: new Date() } }).select('_id');
    if (!post) return res.status(404).json({ message: 'Post not found or expired' });

    const user = await User.findById(me).select('bookmarks');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const idx = user.bookmarks.findIndex(b => String(b.post) === String(postId));
    let bookmarked = false;
    if (idx >= 0) {
      // remove
      user.bookmarks.splice(idx, 1);
      bookmarked = false;
    } else {
      user.bookmarks.push({ post: postId, createdAt: new Date() });
      bookmarked = true;
    }
    await user.save();

    return res.json({ bookmarked });
  } catch (err) {
    console.error('toggleBookmark error:', err);
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

// GET /api/users/me/bookmarks -> populated posts (non-expired), newest first
// Also supports ?ids=1 to only return { ids: [] }
exports.getMyBookmarks = async (req, res) => {
  try {
    const me = getAuthUserId(req);
    if (!me) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(me).select('bookmarks');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Sort by createdAt desc
    const sorted = [...user.bookmarks].sort((a, b) => b.createdAt - a.createdAt);

    const ids = sorted.map(b => b.post).filter(Boolean);

    if (req.query.ids === '1') {
      return res.json({ ids: ids.map(String) });
    }

    // Fetch non-expired posts and preserve order
    const posts = await Post.find({ _id: { $in: ids }, expiresAt: { $gt: new Date() } })
      .populate('author', 'pseudonym avatarURL')
      .populate('comments.user', 'pseudonym avatarURL')
      .lean();

    // Preserve original bookmark order
    const byId = new Map(posts.map(p => [String(p._id), p]));
    const ordered = ids.map(id => byId.get(String(id))).filter(Boolean);

    return res.json(ordered);
  } catch (err) {
    console.error('getMyBookmarks error:', err);
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};

/* ===== Profile posts ===== */
// GET /api/users/:id/posts -> that user's non-expired posts, newest first
exports.getUserPosts = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const posts = await Post.find({ author: userId, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .populate('author', 'pseudonym avatarURL')
      .populate('comments.user', 'pseudonym avatarURL');

    return res.json(posts);
  } catch (err) {
    console.error('getUserPosts error:', err);
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
};
