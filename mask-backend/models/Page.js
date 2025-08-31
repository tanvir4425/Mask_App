const mongoose = require("mongoose");

const PageSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  category:    { type: String, default: "" },
  description: { type: String, default: "" },
  avatarURL:   { type: String, default: "" },
  coverURL:    { type: String, default: "" },
  admins:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // Step 7
  disabled:   { type: Boolean, default: false },
  deletedAt:  { type: Date, default: null },

  createdAt:  { type: Date, default: Date.now },
});

PageSchema.index({ name: 1 }, { unique: true });
// Optional: admin moderation filters
PageSchema.index({ disabled: 1 });
PageSchema.index({ deletedAt: 1 });

module.exports = mongoose.model("Page", PageSchema);
