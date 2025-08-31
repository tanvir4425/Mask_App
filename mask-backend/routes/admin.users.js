const express = require("express");
const { isValidObjectId } = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");

// Optional models—require if you have them; otherwise we’ll skip gracefully
let Post, Comment, Reaction, Bookmark;
try { Post = require("../models/Post"); } catch {}
try { Comment = require("../models/Comment"); } catch {}
try { Reaction = require("../models/Reaction"); } catch {}
try { Bookmark = require("../models/Bookmark"); } catch {}

const router = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_DEV_KEY || "dev-admin-key";
const MODE = String(process.env.ON_USER_DELETE || "anonymize").toLowerCase();

function requireAdminKey(req, res, next) {
  const k = req.get("x-admin-key");
  if (k && k === ADMIN_KEY) return next();
  return res.status(403).json({ message: "Admin key required" });
}

function safeDeletedName(userId) {
  // short, deterministic suffix from ObjectId for uniqueness
  const tail = String(userId).slice(-6).toLowerCase();
  return `deleted-${tail}`;
}

async function anonymizeUser(u) {
  // Clear PII but keep the account doc for referential integrity
  u.pseudonym = safeDeletedName(u._id);
  u.email = null;                 // frees unique index for future reuse
  u.emailVerified = false;
  u.avatarURL = "";
  u.bio = "";
  u.website = "";
  u.location = "";
  // set a random password so password reuse is impossible even if cookie leaks
  u.password = await bcrypt.hash(`deleted:${u._id}:${Date.now()}`, 10);
  u.deletedAt = new Date();
  await u.save();

  // If your Post schema stores denormalized author fields (e.g., authorName),
  // you can also scrub them here. This is safe to skip if UI always reads from user.
  if (Post) {
    try {
      await Post.updateMany(
        { author: u._id },
        {
          $set: {
            authorDisplayName: "Deleted user",
            authorAvatarURL: "",
          },
        },
        { strict: false } // in case these fields don't exist
      );
    } catch {}
  }
}

async function deleteUserPosts(userId) {
  const tasks = [];
  if (Post) tasks.push(Post.deleteMany({ author: userId }));
  if (Comment) tasks.push(Comment.deleteMany({ author: userId }));
  if (Reaction) tasks.push(Reaction.deleteMany({ user: userId }));
  if (Bookmark) tasks.push(Bookmark.deleteMany({ user: userId }));
  await Promise.all(tasks);
}

router.delete("/admin/users/:id", requireAdminKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Bad user id" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin")
      return res.status(400).json({ message: "Refusing to remove an admin user" });

    const mode = MODE;
    if (mode === "disable_only") {
      user.deletedAt = new Date();
      await user.save();
      return res.json({ ok: true, mode });
    }

    if (mode === "anonymize") {
      await anonymizeUser(user);
      return res.json({ ok: true, mode, pseudonym: user.pseudonym });
    }

    if (mode === "delete_posts") {
      // Always disable the account
      user.deletedAt = new Date();
      await user.save();
      await deleteUserPosts(user._id);
      // Optional: also anonymize, to purge PII even though account is disabled
      await anonymizeUser(user);
      return res.json({ ok: true, mode, postsRemoved: true, pseudonym: user.pseudonym });
    }

    // Unknown mode → default to anonymize for safety
    await anonymizeUser(user);
    return res.json({ ok: true, mode: "anonymize" });
  } catch (err) {
    console.error("admin delete user error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
