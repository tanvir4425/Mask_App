// mask-backend/models/MotivationDelivery.js
const mongoose = require("mongoose");

const MotivationDeliverySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  quote: { type: mongoose.Schema.Types.ObjectId, ref: "MotivationQuote", required: true, index: true },
  sentAt: { type: Date, default: Date.now, index: true },

  // extra diagnostics (optional)
  tagsAtSend: { type: [String], default: [] },
  tone: { type: String, enum: ["inspiration", "humor"], default: "inspiration" },
});

// Recent lookups by user + time
MotivationDeliverySchema.index({ user: 1, sentAt: -1 });

// Prevent exact duplicates within the same minute (guard against double-send)
MotivationDeliverySchema.index({ user: 1, quote: 1 }, { unique: false });

module.exports =
  mongoose.models.MotivationDelivery ||
  mongoose.model("MotivationDelivery", MotivationDeliverySchema);
