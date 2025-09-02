// mask-backend/routes/links.js
const express = require("express");
const { query, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const auth = require("../middleware/auth");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/** simple helpers */
function pickMeta(html, attr, key) {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1].trim() : "";
}
function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "";
}
function pickName(html, name) {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1].trim() : "";
}
function absolutize(href, base) {
  try { return new URL(href, base).href; } catch { return href || ""; }
}

/**
 * GET /api/links/unfurl?url=...
 * Requires auth (prevents open proxy abuse).
 * Returns { ok, url, canonicalUrl, domain, title, description, image, siteName }
 */
router.get(
  "/unfurl",
  limiter,
  auth,
  [query("url").isString().isLength({ min: 8 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: "Invalid URL" });

      const raw = String(req.query.url || "").trim();
      let pageURL;
      try {
        pageURL = new URL(raw);
        if (!/^https?:$/.test(pageURL.protocol)) {
          return res.status(400).json({ message: "Only http/https allowed" });
        }
      } catch {
        return res.status(400).json({ message: "Invalid URL" });
      }

      // Fetch HTML (limit size for safety)
      const resp = await axios.get(pageURL.href, {
        responseType: "text",
        timeout: 8000,
        maxContentLength: 1_200_000,
        maxBodyLength: 2_000_000,
        headers: {
          // some sites give better OG if they think it's a browser
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      const html = String(resp.data || "");

      // Prefer OpenGraph → Twitter → fallback <title>/meta description
      let title =
        pickMeta(html, "property", "og:title") ||
        pickMeta(html, "name", "og:title") ||
        pickMeta(html, "name", "twitter:title") ||
        pickTitle(html);

      let description =
        pickMeta(html, "property", "og:description") ||
        pickMeta(html, "name", "og:description") ||
        pickMeta(html, "name", "description") ||
        pickMeta(html, "name", "twitter:description") ||
        "";

      let image =
        pickMeta(html, "property", "og:image") ||
        pickMeta(html, "name", "og:image") ||
        pickMeta(html, "name", "twitter:image") ||
        "";

      let siteName =
        pickMeta(html, "property", "og:site_name") ||
        pickMeta(html, "name", "og:site_name") ||
        "";

      const canonical =
        pickMeta(html, "property", "og:url") ||
        pickMeta(html, "name", "og:url") ||
        "";

      const result = {
        ok: true,
        url: pageURL.href,
        canonicalUrl: canonical || pageURL.href,
        domain: pageURL.hostname.replace(/^www\./, ""),
        title: title || pageURL.hostname,
        description: description || "",
        image: image ? absolutize(image, pageURL.href) : "",
        siteName: siteName || pageURL.hostname.replace(/^www\./, ""),
      };

      return res.json(result);
    } catch (err) {
      console.error("unfurl error:", err?.message || err);
      return res.json({
        ok: false,
        url: String(req.query.url || ""),
        domain: "",
        title: "",
        description: "",
        image: "",
        siteName: "",
      });
    }
  }
);

module.exports = router;
