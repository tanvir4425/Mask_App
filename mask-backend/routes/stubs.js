// mask-backend/routes/stubs.js
const express = require("express");
const router = express.Router();

router.get("/groups/suggestions", (_req, res) => res.json([]));
router.get("/pages/suggestions", (_req, res) => res.json([]));

module.exports = router;
