// mask-backend/routes/live.js
const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");

// In the MVP we don't persist sessions yet.
// These endpoints return real shapes with no data by default.
// Later you can store sessions in Mongo and return them here.

const router = express.Router();

/**
 * GET /api/live/now
 * Returns an array of currently-live sessions.
 * Shape: [{ _id, user: { _id, pseudonym, avatarURL }, title }]
 */
router.get("/now", auth, async (_req, res) => {
  // No dummy data: return empty list until your producer writes sessions.
  return res.json([]);
});

/**
 * GET /api/live/:id
 * Returns details for a single live session.
 * Shape: { _id, user: { _id, pseudonym, avatarURL }, title, streamUrl }
 */
router.get("/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    // keep 404 semantics (id format isn’t important for the empty MVP)
    return res.status(404).json({ message: "Live not found" });
  }
  // No dummy stream; respond “not found” until you create sessions for real.
  return res.status(404).json({ message: "Live not found" });
});

module.exports = router;
