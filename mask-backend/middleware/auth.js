// mask-backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

module.exports = async function auth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await User.findById(payload.uid).select("_id pseudonym avatarURL role deletedAt");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.deletedAt) return res.status(403).json({ message: "Account disabled" });

    req.user = { id: String(user._id), pseudonym: user.pseudonym, role: user.role };
    res.locals.userId = String(user._id);
    next();
  } catch (err) {
    console.error("auth middleware error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
