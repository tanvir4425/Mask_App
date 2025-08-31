// mask-backend/middleware/upload.js
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    // safer filename: timestamp-rand.ext
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new Error("INVALID_FILE_TYPE"), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = { upload, uploadsDir };
