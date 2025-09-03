// mask-backend/routes/devAi.js
const express = require("express");
const router = express.Router();

let svc;
try {
  svc = require("../services/ai/geminiFactcheck");
} catch (e) {
  svc = null;
}

/**
 * POST /api/dev/ai/factcheck
 * Body: { "text": "Mount Everest is 8848 meters tall." }
 * Directly calls the Gemini service (no worker gates).
 */
router.post("/ai/factcheck", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ ok: false, error: "disabled_in_production" });
  }
  if (!svc || typeof svc.factcheckWithGemini !== "function") {
    return res.status(500).json({ ok: false, error: "service_not_loaded" });
  }
  const text = (req.body && req.body.text) || "";
  try {
    const out = await svc.factcheckWithGemini(text);
    return res.status(out.ok ? 200 : 500).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: "exception", detail: e?.message || String(e) });
  }
});

/**
 * GET /api/dev/debug/trust
 * Shows env flags so you can confirm the worker is reading them.
 */
router.get("/debug/trust", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ ok: false, error: "disabled_in_production" });
  }
  const env = process.env;
  res.json({
    ok: true,
    env: env.NODE_ENV,
    model: env.GEMINI_MODEL,
    gemini: {
      enabled: env.TRUST_GEMINI_ENABLED === "1",
      force: env.TRUST_GEMINI_FORCE === "1",
      rulesFirst: env.TRUST_RULES_FIRST !== "0",
      demoOnly: env.TRUST_GEMINI_DEMO_ONLY === "1",
      triggerTag: env.TRUST_GEMINI_TRIGGER_TAG || "#verify",
      hourlyBudget: Number(env.TRUST_GEMINI_HOURLY_BUDGET || "20"),
      minIntervalMs: Number(env.TRUST_GEMINI_MIN_INTERVAL_MS || "4000"),
      hasService: !!(svc && svc.factcheckWithGemini),
      hasApiKey: !!env.GEMINI_API_KEY,
    },
  });
});

module.exports = router;
