// mask-backend/routes/dev.js
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();
const DEBUG_AUTH = String(process.env.DEBUG_AUTH || "").toLowerCase() === "true";

// escape regex special chars
function rxEscape(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.post("/debug-login", async (req, res) => {
  if (!DEBUG_AUTH) return res.status(404).json({ message: "Not enabled" });

  const identifier = String(req.body.identifier || "").trim();
  const pass = String(req.body.password || "");

  const or = [
    { pseudonym: new RegExp(`^${rxEscape(identifier)}$`, "i") },
    { username:  new RegExp(`^${rxEscape(identifier)}$`, "i") },
    { email: identifier.toLowerCase() },
  ];

  const user = await User.findOne({ $or: or }).select("+password pseudonym email createdAt");
  if (!user) return res.json({ found: false, reason: "no_user" });

  const stored = String(user.password || "");
  const isBcrypt = stored.startsWith("$2");
  const compare = isBcrypt ? await bcrypt.compare(pass, stored) : null;

  return res.json({
    found: true,
    user: { _id: user._id, pseudonym: user.pseudonym, email: user.email },
    passwordFieldPresent: stored.length > 0,
    storedPrefix: stored.slice(0, 7), // e.g. "$2b$10"
    storedLength: stored.length,
    isBcrypt,
    bcryptCompare: compare, // true/false/null
  });
});

module.exports = router;
