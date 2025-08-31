// mask-backend/routes/devfactcheck.js

const express = require("express");
const router = express.Router();

const FactCheckResult = require("../models/FactCheckResult");
const Post = require("../models/Post");

function inProd() {
  return process.env.NODE_ENV === "production";
}

// POST /api/dev/factcheck/:postId
// body: { verdict: "false"|"misleading"|"true"|"unverified"|"opinion"|"outdated"|"satire", confidence: 0..1, claim?: string }
router.post("/factcheck/:postId", async (req, res) => {
  if (inProd()) return res.status(403).json({ message: "Disabled in production" });

  const { postId } = req.params;
  const { verdict = "unverified", confidence = 0.9, claim = "" } = req.body || {};

  const p = await Post.findById(postId).select("_id");
  if (!p) return res.status(404).json({ message: "Post not found" });

  const doc = await FactCheckResult.create({
    post: p._id,
    claim,
    verdict,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    topic: "",
    evidence: [],
    model: "dev-seed",
  });

  res.json({ ok: true, result: doc });
});

module.exports = router;
