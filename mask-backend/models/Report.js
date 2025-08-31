// mask-backend/models/Report.js
const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema({
  // who filed the report
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // what is being reported (Step 7: support 'page' and 'group')
  targetType: { type: String, enum: ["post", "comment", "user", "page", "group"], required: true },

  // targets (only one will be relevant based on targetType)
  post:       { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },   // for post/comment reports
  commentId:  { type: String, default: null },                                         // if your comments are subdocs
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },   // for user reports
  page:       { type: mongoose.Schema.Types.ObjectId, ref: "Page", default: null },   // NEW: for page reports
  group:      { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },  // NEW: for group reports

  // why
  reason: { type: String, required: true, trim: true }, // e.g., "spam", "abuse", "other"
  note:   { type: String, default: "" },                // optional details

  // admin workflow
  status:    { type: String, enum: ["open", "resolved", "dismissed"], default: "open" },
  resolver:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt:{ type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

// helpful indexes
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, post: 1 });
ReportSchema.index({ reporter: 1, createdAt: -1 });

// NEW: helpful lookups for page/group reports
ReportSchema.index({ targetType: 1, page: 1 });
ReportSchema.index({ targetType: 1, group: 1 });

module.exports = mongoose.model("Report", ReportSchema);
