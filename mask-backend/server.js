require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const { connectDB } = require("./config/db");

const app = express();

// Behind proxy (Render) + helpful for cookies/ratelimit
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: false }));

// Build allow-list from env, with SAFE defaults for dev
let allowList = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (!allowList.length && process.env.NODE_ENV !== "production") {
  allowList = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
}

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // tools/mobile
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Keep /uploads for dev/back-compat (prod will use Cloudinary)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch {}
}
app.use("/uploads", express.static(uploadsDir, { maxAge: "1d", index: false }));

// --------------------------- ROUTES ---------------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/search", require("./routes/search"));
app.use("/api/live", require("./routes/live"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/pages", require("./routes/pages"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/factcheck", require("./routes/factcheck"));
app.use("/api/trust", require("./routes/trust"));
app.use("/api/dev", require("./routes/dev"));
app.use("/api/users", require("./routes/userAvatar"));

// Admin
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin", require("./routes/adminFactchecks"));
app.use("/api/admin/motivation", require("./routes/adminMotivation"));
app.use("/api/me", require("./routes/motivationPrefs"));
app.use("/api/admin/pages", require("./routes/pages.moderation"));
app.use("/api/admin/groups", require("./routes/groups.moderation"));

// back-compat mounts (leave as-is)
app.use("/api", require("./routes/auth"));
app.use("/api", require("./routes/adminBootstrap"));
app.use("/api/admin", require("./routes/adminUsers"));
app.use("/api", require("./routes/admin.users"));

if (process.env.NODE_ENV !== "production") {
  try { app.use("/api/dev", require("./routes/devFactcheck")); } catch {}
}

app.get("/", (_req, res) => res.send("Mask API is running 🚀"));

(async () => {
  try {
    await connectDB();
    try {
      require("./services/motivationDailyWorker");
      require("./services/postRetentionWorker").start();
    } catch (e) {
      console.warn("[workers] failed to start:", e?.message || e);
    }
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
    try {
      if (process.env.TRUST_RECHECK_ENABLED === "1") {
        const { startRecheckCron } = require("./services/recheckCron");
        startRecheckCron();
      }
    } catch (e) {
      console.warn("[recheck] failed to start:", e?.message || e);
    }
  } catch {
    process.exit(1);
  }
})();
