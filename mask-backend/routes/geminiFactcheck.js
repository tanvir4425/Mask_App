// mask-backend/services/ai/geminiFactcheck.js
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;

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

/** Call Gemini and return { ok, verdict?, explanation?, confidence?, error? } */
async function factcheckWithGemini(userText) {
  if (!API_KEY) return { ok: false, error: "missing_api_key" };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const payload = {
    contents: [{ parts: [{ text: buildPrompt(userText) }]}],
    generationConfig: {
      // Deterministic & cheap first: you can raise temp or thinking later
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        // Strict JSON schema (Gemini Structured Output)
        // Docs: https://ai.google.dev/gemini-api/docs/structured-output
        type: "OBJECT",
        properties: {
          verdict: {
            type: "STRING",
            enum: ["true","false","misleading","opinion","unverified","outdated","satire"]
          },
          explanation: { type: "STRING" },
          confidence: { type: "NUMBER" }
        },
        required: ["verdict", "explanation"],
        propertyOrdering: ["verdict","confidence","explanation"]
      }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, error: `http_${res.status}`, detail: msg };
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "bad_json", raw };
  }

  return {
    ok: true,
    verdict: parsed.verdict,
    explanation: parsed.explanation,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined
  };
}

module.exports = { factcheckWithGemini };
