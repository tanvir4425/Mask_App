// mask-backend/routes/linkPreview.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { fetchLinkPreview } = require("../utils/linkPreview");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/", limiter, async (req, res) => {
  try {
    const url = String(req.query.url || "");
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ message: "Bad url" });
    }
    const data = await fetchLinkPreview(url);
    res.json(data);
  } catch (e) {
    res.status(200).json({ url: String(req.query.url || ""), title: "", description: "", image: "", siteName: "", finalUrl: String(req.query.url || "") });
  }
});

module.exports = router;
