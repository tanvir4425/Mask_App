// mask-backend/models/FriendRequest.js
const mongoose = require("mongoose");

const FriendRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

// Prevent duplicate pending requests in the same direction
FriendRequestSchema.index({ from: 1, to: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

module.exports = mongoose.model("FriendRequest", FriendRequestSchema);
