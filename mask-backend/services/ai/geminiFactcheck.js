// mask-backend/services/ai/geminiFactcheck.js
// Text-only or multimodal (image + text) fact-checker for Gemini 2.5 Flash.
// Safe: hard timeout, never throws, schema-safe return.

const fs = require("fs");
const path = require("path");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;
const TIMEOUT_MS = 12000;
const IMAGES_ENABLED = String(process.env.TRUST_GEMINI_IMAGES_ENABLED || "0") === "1";
const MAX_IMAGE_BYTES = Math.max(0, parseInt(process.env.TRUST_GEMINI_MAX_IMAGE_BYTES || "1500000", 10));

// simple mime guess from extension
function guessMimeFromUrl(url = "") {
  const ext = (url.split("?")[0] || "").toLowerCase();
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) return "image/jpeg";
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".webp")) return "image/webp";
  return ""; // unknown/unsupported
}

function buildPrompt(userText) {
  return `You are a strict fact-checking AI for a social media platform.

Task:
1) Decide if the post contains a verifiable factual claim.
2) If yes, rate it with ONLY one of:
   "true", "false", "misleading", "outdated", "satire".
3) If it is an opinion/personal experience/ambiguous, use "opinion".
4) If you cannot tell from your knowledge, use "unverified".
Return ONLY JSON per the schema. No markdown, no prose.

Post: """${(userText || "").trim()}"""`;
}

/** Read an image URL or local /uploads path and return { mime, b64 } or null */
async function readImageAsBase64(imageUrl) {
  if (!imageUrl) return null;

  try {
    // Local /uploads path (dev) -> read from disk
    if (imageUrl.startsWith("/uploads/")) {
      const diskPath = path.join(__dirname, "..", "..", imageUrl);
      const buf = fs.readFileSync(diskPath);
      if (MAX_IMAGE_BYTES && buf.length > MAX_IMAGE_BYTES) return null;
      const mime = guessMimeFromUrl(imageUrl) || "image/jpeg";
      return { mime, b64: buf.toString("base64") };
    }

    // Remote (Cloudinary etc.)
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(imageUrl, { signal: controller.signal }).catch(err => ({ ok:false, _err: err }));
    clearTimeout(t);
    if (!res || !res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (MAX_IMAGE_BYTES && buf.length > MAX_IMAGE_BYTES) return null;

    // Prefer server-provided content-type; fallback to extension
    const mime = (res.headers.get("content-type") || "").split(";")[0] || guessMimeFromUrl(imageUrl) || "image/jpeg";
    if (!/^image\/(png|jpe?g|webp)$/i.test(mime)) return null;

    return { mime, b64: buf.toString("base64") };
  } catch {
    return null;
  }
}

/**
 * Call Gemini and return { ok, verdict?, explanation?, confidence?, error?, detail? }.
 * opts.imageUrl (optional) enables multimodal.
 */
async function factcheckWithGemini(userText = "", opts = {}) {
  try {
    if (!API_KEY) return { ok: false, error: "missing_api_key" };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    // Build parts: text is always included; image part is optional
    const parts = [{ text: buildPrompt(userText) }];

    if (IMAGES_ENABLED && opts.imageUrl) {
      const img = await readImageAsBase64(opts.imageUrl);
      if (img && img.b64 && img.mime) {
        parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
      }
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            verdict: { type: "STRING", enum: ["true","false","misleading","opinion","unverified","outdated","satire"] },
            explanation: { type: "STRING" },
            confidence: { type: "NUMBER" }
          },
          required: ["verdict","explanation"],
          propertyOrdering: ["verdict","confidence","explanation"]
        }
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).catch(err => ({ ok: false, status: 0, _netErr: err }));

    clearTimeout(t);

    if (!res || res._netErr) return { ok: false, error: "network_error", detail: String(res?._netErr || "unknown") };
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      return { ok: false, error: `http_${res.status}`, detail: txt };
    }

    const data = await res.json().catch(() => null);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return { ok:false, error:"bad_json", raw }; }

    return {
      ok: true,
      verdict: parsed.verdict,
      explanation: parsed.explanation,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined
    };
  } catch (e) {
    return { ok:false, error:"exception", detail: e?.message || String(e) };
  }
}

module.exports = { factcheckWithGemini };
