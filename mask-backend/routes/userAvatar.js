// mask-backend/routes/userAvatar.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { query } = require("express-validator");
const auth = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

// Cloudinary toggle (ON when CLOUDINARY_URL is present)
const { isEnabled: CLOUD_ON, uploadBuffer } = require("../utils/cloudinary");

// ensure /uploads/avatars exists (used only when Cloudinary is OFF)
const avatarsDir = path.join(__dirname, "..", "uploads", "avatars");
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// multer storage
// - Cloudinary ON  -> keep file in memory and upload the buffer
// - Cloudinary OFF -> write file to /uploads/avatars
const storage = CLOUD_ON
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, avatarsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if ((file.mimetype || "").startsWith("image/")) return cb(null, true);
    cb(new Error("Only image uploads are allowed"));
  },
});

// cooldown in days (env override optional)
const COOLDOWN_DAYS = parseInt(process.env.AVATAR_COOLDOWN_DAYS || "30", 10);
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// Util: compute status from user doc
function buildStatus(u) {
  const now = Date.now();
  let canChange = true;
  let nextChangeAt = null;
  if (u?.avatarUpdatedAt) {
    const next = u.avatarUpdatedAt.getTime() + COOLDOWN_MS;
    if (now < next) {
      canChange = false;
      nextChangeAt = new Date(next);
    }
  }
  return { canChange, nextChangeAt };
}

// POST /api/users/me/avatar  (upload new)
// field name: avatar
router.post("/me/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(res.locals.userId).select(
      "avatarURL avatarUpdatedAt avatarHistory createdAt"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    // cooldown check (skip if first-ever set)
    const { canChange, nextChangeAt } = buildStatus(user);
    const firstEver = !user.avatarURL && !user.avatarUpdatedAt;
    if (!firstEver && !canChange) {
      return res.status(429).json({
        message: `You can change your profile photo again on ${nextChangeAt.toISOString()}`,
        nextChangeAt,
      });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    // push current into history (if exists)
    if (user.avatarURL) {
      user.avatarHistory = user.avatarHistory || [];
      user.avatarHistory.unshift({
        url: user.avatarURL,
        uploadedAt: user.avatarUpdatedAt || user.createdAt || new Date(),
      });
      // keep only last 5
      const MAX = parseInt(process.env.AVATAR_HISTORY_MAX || "5", 10);
      while (user.avatarHistory.length > MAX) {
        const removed = user.avatarHistory.pop();
        // Delete only local files; Cloudinary items are left alone
        if (removed?.url?.startsWith("/uploads/avatars/")) {
          const p = path.join(__dirname, "..", removed.url);
          fs.promises.unlink(p).catch(() => {});
        }
      }
    }

    // set new avatar (Cloudinary or local)
    let nextUrl;
    if (CLOUD_ON) {
      try {
        const up = await uploadBuffer(file.buffer, "avatars");
        nextUrl = up.secure_url; // permanent CDN URL
      } catch (err) {
        console.error("Cloudinary upload error:", err);
        return res.status(500).json({ message: "Image upload failed" });
      }
    } else {
      nextUrl = `/uploads/avatars/${file.filename}`;
    }

    user.avatarURL = nextUrl;
    user.avatarUpdatedAt = new Date();
    await user.save();

    const status = buildStatus(user);
    return res.json({
      ok: true,
      avatarURL: user.avatarURL,
      ...status,
    });
  } catch (e) {
    console.error("avatar upload error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/users/me/avatar  (remove current)
// Counts as a change → cooldown starts
router.delete("/me/avatar", auth, async (req, res) => {
  try {
    const user = await User.findById(res.locals.userId).select(
      "avatarURL avatarUpdatedAt avatarHistory createdAt"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    // push current into history if present
    if (user.avatarURL) {
      user.avatarHistory = user.avatarHistory || [];
      user.avatarHistory.unshift({
        url: user.avatarURL,
        uploadedAt: user.avatarUpdatedAt || user.createdAt || new Date(),
      });
    }

    user.avatarURL = "";
    user.avatarUpdatedAt = new Date(); // deletion starts cooldown
    await user.save();

    const status = buildStatus(user);
    return res.json({ ok: true, avatarURL: "", ...status });
  } catch (e) {
    console.error("avatar delete error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/users/me/avatar/history?limit=5
router.get(
  "/me/avatar/history",
  auth,
  [query("limit").optional().isInt({ min: 1, max: 20 })],
  async (req, res) => {
    try {
      const user = await User.findById(res.locals.userId).select(
        "avatarURL avatarUpdatedAt avatarHistory"
      );
      if (!user) return res.status(404).json({ message: "User not found" });

      const limit = Math.min(parseInt(req.query.limit || "5", 10), 20);
      const history = (user.avatarHistory || []).slice(0, limit);

      const status = buildStatus(user);
      return res.json({
        avatarURL: user.avatarURL || "",
        history,
        ...status,
      });
    } catch (e) {
      console.error("avatar history error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
