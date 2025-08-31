// models/Post.js
const mongoose = require("mongoose");

const ReactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["like", "love", "care", "haha", "wow", "sad", "angry"],
      required: true,
    },
  },
  { _id: false }
);

const CommentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ShareSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PostSchema = new mongoose.Schema({
  // author is always the account who posted or reshared
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // main content for original posts (reshare may have empty text/image)
  text: { type: String, default: "", trim: true },
  image: { type: String, default: "" },

  // Scope (you already use these refs; keeping as-is)
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  page:  { type: mongoose.Schema.Types.ObjectId, ref: "Page",  default: null },

  reactions: [ReactionSchema],
  comments:  [CommentSchema],
  shares:    [ShareSchema],

  // Step 5: reshare support
  type: {
    type: String,
    enum: ["original", "reshare"],
    default: "original",
  },
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    default: null,
  },

  // Step 2: retention/permanent support
  isProtected: { type: Boolean, default: false },
  retention: {
    type: String,
    enum: ["normal", "extended", "permanent"],
    default: "normal",
  },

  createdAt: { type: Date, default: Date.now },

  // TTL: if null -> never expires (permanent)
  expiresAt: { type: Date, default: null },
});

// TTL index: expire when expiresAt is reached (null is ignored by TTL)
PostSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helpful query indexes
PostSchema.index({ createdAt: -1 });
PostSchema.index({ group: 1, createdAt: -1 });
PostSchema.index({ page: 1, createdAt: -1 });
PostSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Post", PostSchema);
