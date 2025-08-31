// mask-backend/routes/trust.js
const express = require("express");
const mongoose = require("mongoose");
const TrustSnapshot = require("../models/TrustSnapshot");

const router = express.Router();

/**
 * GET /api/trust/:type/:id
 * type: "user" | "page"
 * Returns the trust snapshot for subject, or null if not computed yet.
 */
router.get("/:type/:id", async (req, res) => {
  const { type, id } = req.params;

  if (!["user", "page"].includes(type)) {
    return res.status(400).json({ message: "Invalid subject type" });
  }
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const snap = await TrustSnapshot
      .findOne({ subjectType: type, subject: id })
      .lean();

    return res.json(snap || null);
  } catch (e) {
    console.error("trust route error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
