// mask-backend/services/postRetentionWorker.js
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");

const INTERVAL_MIN = parseInt(process.env.POST_RETENTION_INTERVAL_MIN || "5", 10); // minutes; 0 = off
const BASE_TTL_HOURS = parseInt(process.env.POST_BASE_TTL_HOURS || "24", 10);     // your default auto-delete
const T1_REACTIONS = parseInt(process.env.POST_T1_REACTIONS || "5", 10);
const T1_COMMENTS  = parseInt(process.env.POST_T1_COMMENTS  || "3", 10);
const T1_DAYS      = parseInt(process.env.POST_T1_DAYS      || "7", 10);
const T2_REACTIONS = parseInt(process.env.POST_T2_REACTIONS || "8", 10);
const T2_COMMENTS  = parseInt(process.env.POST_T2_COMMENTS  || "5", 10);

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function addHours(d, hrs) {
  const x = new Date(d);
  x.setHours(x.getHours() + hrs);
  return x;
}

async function applyRetentionToPost(doc) {
  // Admin posts are always permanent
  if (doc._authorRole === "admin") {
    if (doc.expiresAt) {
      await Post.updateOne({ _id: doc._id }, { $unset: { expiresAt: 1 }, $set: { isPermanent: true } });
    } else if (!doc.isPermanent) {
      await Post.updateOne({ _id: doc._id }, { $set: { isPermanent: true } });
    }
    return { changed: true, reason: "admin-permanent" };
  }

  const reactions = Array.isArray(doc.reactions) ? doc.reactions.length : 0;
  const comments  = Array.isArray(doc.comments)  ? doc.comments.length  : 0;

  // Tier 2 → permanent
  if (reactions >= T2_REACTIONS || comments >= T2_COMMENTS) {
    if (doc.expiresAt || !doc.isPermanent) {
      await Post.updateOne({ _id: doc._id }, { $unset: { expiresAt: 1 }, $set: { isPermanent: true } });
      return { changed: true, reason: "tier2-permanent" };
    }
    return { changed: false };
  }

  // Tier 1 → extend to 7 days from createdAt
  if (reactions >= T1_REACTIONS || comments >= T1_COMMENTS) {
    const target = addDays(doc.createdAt, T1_DAYS);
    if (!doc.expiresAt || doc.expiresAt < target) {
      await Post.updateOne({ _id: doc._id }, { $set: { expiresAt: target, isPermanent: false } });
      return { changed: true, reason: "tier1-extend" };
    }
    return { changed: false };
  }

  // Otherwise ensure baseline TTL exists (24h) unless already permanent
  if (!doc.isPermanent) {
    const baseline = addHours(doc.createdAt, BASE_TTL_HOURS);
    if (!doc.expiresAt) {
      await Post.updateOne({ _id: doc._id }, { $set: { expiresAt: baseline } });
      return { changed: true, reason: "baseline-set" };
    }
  }

  return { changed: false };
}

async function runTick() {
  // Look at recent posts and those expiring soon
  const since = addDays(new Date(), -8); // past week + buffer
  const soon  = addDays(new Date(), 2);

  // Pull author role in one pass (lookup users)
  const pipeline = [
    { $match: { createdAt: { $gte: since } } },
    { $lookup: { from: "users", localField: "author", foreignField: "_id", as: "authorUser", pipeline: [{ $project: { role: 1 } }] } },
    { $addFields: { _authorRole: { $let: { vars: { a: { $arrayElemAt: ["$authorUser", 0] } }, in: { $ifNull: ["$$a.role", "user"] } } } } },
    { $project: { authorUser: 0 } },
    { $limit: 2000 } // safety
  ];

  const posts = await Post.aggregate(pipeline);
  let changed = 0, scanned = posts.length;
  for (const p of posts) {
    const res = await applyRetentionToPost(p);
    if (res.changed) changed++;
  }

  // Also touch posts that are expiring soon to see if thresholds now extend them
  const expiringSoon = await Post.find({ expiresAt: { $lte: soon } }).select("_id reactions comments createdAt author expiresAt isPermanent").lean();
  for (const doc of expiringSoon) {
    // fetch author role
    const u = await User.findById(doc.author).select("role").lean();
    doc._authorRole = (u?.role || "user");
    const res = await applyRetentionToPost(doc);
    if (res.changed) changed++;
    scanned++;
  }

  console.log(`[retention] tick scanned=${scanned} changed=${changed}`);
  return { scanned, changed };
}

function start() {
  if (!INTERVAL_MIN) {
    console.log("[retention] disabled (POST_RETENTION_INTERVAL_MIN=0)");
    return;
  }
  console.log(`[retention] every ${INTERVAL_MIN}m (baseline ${BASE_TTL_HOURS}h, T1=${T1_REACTIONS}/${T1_COMMENTS}→${T1_DAYS}d, T2=${T2_REACTIONS}/${T2_COMMENTS}→permanent)`);
  setInterval(() => {
    runTick().catch(err => console.warn("[retention] tick error:", err?.message || err));
  }, INTERVAL_MIN * 60 * 1000);
}

module.exports = { start, runTick };
