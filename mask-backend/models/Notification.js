// mask-backend/models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  // who receives this notification
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // what kind
  // NOTE: added "motivation" to be compatible with the daily motivation worker
  type: {
    type: String,
    required: true,
    enum: [
      "reaction",
      "comment",
      "share",
      "friend_request",
      "system",
      "motivation", // <-- NEW
    ],
  },

  // typical social fields (kept for compatibility)
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
  reactionType: { type: String, default: null },

  // generic message/payload fields (safe to ignore in old code)
  message: { type: String, default: "" }, // e.g., motivation text or system note
  quote: { type: mongoose.Schema.Types.ObjectId, ref: "MotivationQuote", default: null },
  meta: { type: Object, default: {} },

  // read state & timestamps
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// helpful index for listing by user
NotificationSchema.index({ user: 1, createdAt: -1 });

// Return existing compiled model if it’s already registered
module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);
