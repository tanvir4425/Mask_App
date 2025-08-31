// mask-backend/models/EmailOTP.js
const mongoose = require("mongoose");

const EmailOTPSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["signup", "reset"], default: "signup", index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { versionKey: false }
);

// TTL: auto-delete when expired
EmailOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("EmailOTP", EmailOTPSchema);
