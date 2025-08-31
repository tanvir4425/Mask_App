const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");

const router = express.Router();
const SETUP_ADMIN_KEY = process.env.SETUP_ADMIN_KEY || "dev-admin-key";

function publicUser(u) {
  return {
    _id: u._id,
    pseudonym: u.pseudonym,
    avatarURL: u.avatarURL || "",
    createdAt: u.createdAt,
    role: u.role || "user",
    email: u.email || undefined,
    emailVerified: !!u.emailVerified,
  };
}

/**
 * GET /api/admin/who
 * See who is admin now (for the drill).
 */
router.get("/who", async (_req, res) => {
  const admin = await User.findOne({ role: "admin" }).lean();
  if (!admin) return res.json({ admin: null });
  res.json({ admin: publicUser(admin) });
});

/**
 * POST /api/admin/bootstrap
 * - If no admin exists: creates one with provided {pseudonym, email, password}
 * - If admin exists: only rotates when header x-admin-key === SETUP_ADMIN_KEY
 *   (demotes current admin -> user, then creates a new admin)
 */
router.post(
  "/bootstrap",
  [
    body("pseudonym").trim().isLength({ min: 3, max: 32 }).withMessage("Pseudonym 3–32 chars"),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").isLength({ min: 8 }).withMessage("Password min 8 chars"),
  ],
  async (req, res) => {
    try {
      const v = validationResult(req);
      if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

      const { pseudonym, email, password } = req.body;
      const existingAdmin = await User.findOne({ role: "admin" });

      if (!existingAdmin) {
        // No admin: create first admin
        const hash = await bcrypt.hash(String(password), 10);
        const u = await User.create({
          pseudonym,
          email: String(email).toLowerCase(),
          password: hash,
          role: "admin",
          emailVerified: true,
        });
        return res.status(201).json({ created: true, admin: publicUser(u) });
      }

      // Admin exists: require the setup key
      const key = req.get("x-admin-key") || "";
      if (key !== SETUP_ADMIN_KEY) {
        return res.status(403).json({ message: "Admin already exists (setup key required for rotation)" });
      }

      // Rotate: demote old admin, create new one
      existingAdmin.role = "user";
      await existingAdmin.save();

      const hash = await bcrypt.hash(String(password), 10);
      const u = await User.create({
        pseudonym,
        email: String(email).toLowerCase(),
        password: hash,
        role: "admin",
        emailVerified: true,
      });

      return res.status(201).json({ created: true, rotated: true, admin: publicUser(u) });
    } catch (err) {
      console.error("bootstrap error:", err);
      // If you see duplicate-key on role admin: your rotation didn’t demote first
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
