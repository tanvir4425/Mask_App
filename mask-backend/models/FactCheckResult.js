// mask-backend/models/factCheckResult.js

const mongoose = require("mongoose");

const FactCheckResultSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", index: true, required: true },
  claim: { type: String, default: "" },
  verdict: {
    type: String,
    enum: ["true","false","misleading","unverified","opinion","outdated","satire"],
    required: true
  },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  topic: { type: String, default: "" }, // health, politics, etc.
  evidence: [{
    title: String,
    url: String,
    snippet: String,
    stance: { type: String, enum: ["support","refute","neutral"], default: "neutral" }
  }],
  model: { type: String, default: "" }, // model/version
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.FactCheckResult
  || mongoose.model("FactCheckResult", FactCheckResultSchema);
