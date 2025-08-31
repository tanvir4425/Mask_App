const mongoose = require("mongoose");

const TrustSnapshotSchema = new mongoose.Schema({
  subjectType: { type: String, enum: ["user","page"], required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, refPath: "subjectType", required: true, index: true },
  postsChecked: { type: Number, default: 0 },
  postsTrue: { type: Number, default: 0 },
  postsFalse: { type: Number, default: 0 },
  postsMisleading: { type: Number, default: 0 },
  score: { type: Number, min:0, max:100, default: 50 },   // displayed %
  confLow: { type: Number, min:0, max:100, default: 0 },   // lower band
  confHigh:{ type: Number, min:0, max:100, default: 100 }, // upper band
  tier: { type: String, enum: ["provisional","low","normal","high"], default: "provisional" },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.TrustSnapshot
  || mongoose.model("TrustSnapshot", TrustSnapshotSchema);
