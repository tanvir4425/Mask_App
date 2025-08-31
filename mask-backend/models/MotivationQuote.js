// mask-backend/models/MotivationQuote.js
const mongoose = require("mongoose");

const MotivationQuoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    author: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] }, // e.g. ['reading','writing','sports','universal']
    tone: { type: String, enum: ["inspiration", "humor"], default: "inspiration" },
    lang: { type: String, default: "en", trim: true }, // optional language tag
  },
  { timestamps: true }
);

// Helpful indexes for filtering/search
MotivationQuoteSchema.index({ tags: 1, tone: 1 });
try {
  MotivationQuoteSchema.index({ text: "text", author: "text" });
} catch { /* some Mongo variants disallow text index more than once */ }

module.exports = mongoose.model("MotivationQuote", MotivationQuoteSchema);
