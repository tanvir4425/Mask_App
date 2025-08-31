const mongoose = require("mongoose");

const GroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: "" },
  privacy:     { type: String, enum: ["public", "private"], default: "public" },
  avatarURL:   { type: String, default: "" },
  coverURL:    { type: String, default: "" },
  admins:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // Step 7
  disabled:   { type: Boolean, default: false },
  deletedAt:  { type: Date, default: null },

  createdAt:  { type: Date, default: Date.now },
});

GroupSchema.index({ name: 1 }, { unique: true });
// Optional: admin moderation filters
GroupSchema.index({ disabled: 1 });
GroupSchema.index({ deletedAt: 1 });

module.exports = mongoose.model("Group", GroupSchema);
