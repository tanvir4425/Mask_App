// mask-backend/routes/factcheck.js
const express = require("express");
const mongoose = require("mongoose");
const FactCheckResult = require("../models/FactCheckResult");

const router = express.Router();

/**
 * GET /api/factcheck/:postId
 * Returns the latest fact-check result for a post, or null if none yet.
 */
router.get("/:postId", async (req, res) => {
  const { postId } = req.params;
  if (!mongoose.isValidObjectId(postId)) {
    return res.status(400).json({ message: "Invalid postId" });
  }

  try {
    const result = await FactCheckResult
      .findOne({ post: postId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(result || null);
  } catch (e) {
    console.error("factcheck route error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
