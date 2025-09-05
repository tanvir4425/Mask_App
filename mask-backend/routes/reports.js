// mask-backend/routes/reports.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const auth = require("../middleware/auth");
const Report = require("../models/Report");
const Post = require("../models/Post");

const router = express.Router();

/** Quick auth check */
router.get("/_whoami", auth, (req, res) => {
  return res.json({ ok: true, userId: req.user?.id || null });
});

/**
 * POST /api/reports
 * Body accepts the simple form used by your UI:
 *   { postId, reason, note? }
 * We default targetType to "post".
 */
router.post(
  "/",
  auth,
  [
    body("postId")
      .exists().withMessage("postId is required")
      .bail()
      .custom((v) => mongoose.isValidObjectId(v))
      .withMessage("postId must be a valid ObjectId"),
    body("reason")
      .exists().withMessage("reason is required")
      .bail()
      .isString().trim().isLength({ min: 3, max: 100 })
      .withMessage("reason must be 3–100 characters"),
    body("note").optional({ values: "falsy" }).isString().trim().isLength({ max: 400 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ ok: false, errors: errors.array() });
      }

      const { postId, reason, note } = req.body;

      // Load the post being reported
      const post = await Post.findById(postId).select("_id author").lean();
      if (!post) {
        return res.status(404).json({ ok: false, error: "Post not found" });
      }

      // Self-report guard (compare ObjectId to string safely)
      if (post.author && String(post.author) === String(req.user.id)) {
        return res.status(400).json({ ok: false, error: "You cannot report your own post." });
      }

      // Normalize reasons a little to keep admin clean
      const allowed = ["spam", "harassment", "hate", "violence", "nudity", "misinformation", "other"];
      const normalized = String(reason || "").toLowerCase();
      const finalReason = allowed.includes(normalized) ? normalized : "other";

      // Create the report
      const created = await Report.create({
        reporter: req.user.id,
        targetType: "post",
        post: post._id,
        reason: finalReason,
        note: note || "",
        status: "open",
        createdAt: new Date(),
      });

      return res.json({ ok: true, reportId: String(created._id) });
    } catch (err) {
      console.error("POST /api/reports error:", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }
);

module.exports = router;
