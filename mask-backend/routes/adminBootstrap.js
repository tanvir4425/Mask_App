// mask-backend/routes/adminBootstrap.js
const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { isReservedPseudonym } = require("../utils/reservedNames");

const router = express.Router();

/**
 * POST /api/admin/bootstrap
 * If no admin exists → allow creating one without a key.
 * If an admin exists → require SETUP_ADMIN_KEY in body.
 */
router.post("/admin/bootstrap", [
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("pseudonym").isString().isLength({ min:3, max:32 }),
  body("password").isString().isLength({ min:8 })
    .matches(/[A-Za-z]/).withMessage("Password needs a letter")
    .matches(/\d/).withMessage("Password needs a number"),
  body("setupKey").optional().isString(),
], async (req, res) => {
  const v = validationResult(req);
  if (!v.isEmpty()) return res.status(400).json({ message: v.array()[0].msg });

  const { email, pseudonym, password, setupKey } = req.body;
  if (isReservedPseudonym(pseudonym)) {
    return res.status(400).json({ message: "Pseudonym not allowed" });
  }

  const adminCount = await User.countDocuments({ role: "admin" });
  if (adminCount > 0) {
    const envKey = process.env.SETUP_ADMIN_KEY || "";
    if (!envKey || setupKey !== envKey) {
      return res.status(403).json({ message: "Admin already exists (setup key required)" });
    }
  }

  const dup = await User.findOne({ $or: [{ email }, { pseudonym }] }).lean();
  if (dup) return res.status(400).json({ message: "Email or pseudonym already in use" });

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email, pseudonym, password: hash, role: "admin",
  });

  return res.json({ ok: true, adminId: user._id });
});

module.exports = router;
