// mask-backend/routes/search.js
const express = require("express");
const { query } = require("express-validator");
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const User = require("../models/User");
const Post = require("../models/Post");
const Page = require("../models/Page");
const Group = require("../models/Group");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get(
  "/",
  limiter,
  auth,
  [query("q").isLength({ min: 1 }).withMessage("q required")],
  async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const myId = res.locals.userId;

      // escape to safe regex
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      // groups I can see
      const me = await User.findById(myId).select("groups").lean();
      const myGroupIds = (me?.groups || []).map((id) => String(id));

      const postsQuery = {
        text: re,
        $or: [
          { group: { $in: myGroupIds } }, // group posts I can see
          { group: null },
          { group: { $exists: false } },
        ],
      };

      const [users, posts, pages, groups] = await Promise.all([
        User.find({ role: { $ne: "admin" }, pseudonym: re })
          .select("_id pseudonym avatarURL")
          .limit(10)
          .lean(),

        Post.find(postsQuery)
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("author", "_id pseudonym avatarURL")
          .populate("page", "_id name avatarURL coverURL")
          .populate("group", "_id name privacy")
          .lean(),

        Page.find({ name: re, disabled: false, deletedAt: null })
          .select("_id name description avatarURL coverURL")
          .limit(10)
          .lean(),

        Group.find({
          $and: [
            { name: re },
            { disabled: false, deletedAt: null },
            { $or: [{ privacy: "public" }, { members: { $in: [myId] } }] },
          ],
        })
          .select("_id name description privacy avatarURL")
          .limit(10)
          .lean(),
      ]);

      return res.json({ users, posts, pages, groups });
    } catch (e) {
      console.error("search error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
