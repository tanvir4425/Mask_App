// mask-backend/routes/reports.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");

const auth = require("../middleware/auth");
const Report = require("../models/Report");

const router = express.Router();

// rate limit: at most 12 reports per minute per IP
const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 12 });

/**
 * POST /api/reports
 * Body:
 *  - targetType: "post" | "comment" | "user"
 *  - postId: required when targetType = "post" or "comment"
 *  - commentId: required when targetType = "comment"
 *  - targetUserId: required when targetType = "user"
 *  - reason: short string ("spam", "abuse", "harassment", "other", etc.)
 *  - note: optional extra details
 */
router.post(
  "/",
  createLimiter,
  auth,
  [
    body("targetType")
      .exists().withMessage("targetType is required")
      .isIn(["post", "comment", "user"]).withMessage("targetType must be post, comment, or user"),

    body("reason")
      .exists().withMessage("reason is required")
      .isLength({ min: 3, max: 100 }).withMessage("reason must be 3-100 chars")
      .bail()
      .trim(),

    body("note")
      .optional({ values: "falsy" })
      .isLength({ max: 400 }).withMessage("note max 400 chars")
      .bail()
      .trim(),

    // If post or comment, require postId
    body("postId")
      .if((value, { req }) => req.body?.targetType === "post" || req.body?.targetType === "comment")
      .exists().withMessage("postId is required for post/comment reports")
      .bail()
      .isMongoId().withMessage("postId must be a valid id"),

    // If comment, require commentId (string ok if comments are subdocs)
    body("commentId")
      .if((value, { req }) => req.body?.targetType === "comment")
      .exists().withMessage("commentId is required for comment reports")
      .bail()
      .isLength({ min: 1, max: 64 }).withMessage("commentId must be 1-64 chars")
      .bail()
      .trim(),

    // If user, require targetUserId
    body("targetUserId")
      .if((value, { req }) => req.body?.targetType === "user")
      .exists().withMessage("targetUserId is required for user reports")
      .bail()
      .isMongoId().withMessage("targetUserId must be a valid id"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

      const { targetType, postId, commentId, targetUserId, reason, note } = req.body;

      const doc = {
        reporter: res.locals.userId,
        targetType,
        reason: String(reason).trim(),
        note: note ? String(note).trim().slice(0, 400) : "",
      };

      if (targetType === "post" || targetType === "comment") doc.post = postId;
      if (targetType === "comment") doc.commentId = String(commentId);
      if (targetType === "user") doc.targetUser = targetUserId;

      const created = await Report.create(doc);
      return res.json({ ok: true, reportId: created._id });
    } catch (err) {
      console.error("POST /api/reports error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
