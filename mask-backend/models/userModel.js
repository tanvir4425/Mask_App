// mask-backend/models/userModel.js
const mongoose = require("mongoose");

const BookmarkSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  pseudonym: { type: String, required: true, trim: true, unique: true },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  password: { type: String, required: true, select: false }, // <— critical
  avatarURL: { type: String, default: "" },

  pages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Page", default: [] }],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group", default: [] }],

  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  followersCount: { type: Number, default: 0 },

  bookmarks: { type: [BookmarkSchema], default: [] },

  role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
  deletedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ pseudonym: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
