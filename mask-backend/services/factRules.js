//mask-backend/services/factRules.js
const fs = require("fs");
const path = require("path");

const FACTS_PATH = path.join(__dirname, "facts.json");
let FACTS = [];
let _mtime = 0;

function _norm(s) {
  return String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function loadFacts() {
  try {
    const stat = fs.statSync(FACTS_PATH);
    if (stat.mtimeMs === _mtime && FACTS.length) return;
    const raw = fs.readFileSync(FACTS_PATH, "utf8");
    FACTS = JSON.parse(raw);
    _mtime = stat.mtimeMs;
    console.log(`[facts] loaded ${FACTS.length} rules`);
  } catch (e) {
    console.warn("[facts] load failed:", e?.message || e);
    FACTS = [];
  }
}
loadFacts();

// best-effort hot reload (Windows can be flaky; restart if it doesn’t fire)
try {
  fs.watch(FACTS_PATH, { persistent: false }, () => setTimeout(loadFacts, 200));
} catch {}

function matchRule(text) {
  loadFacts();
  const raw = String(text || "");
  const n = _norm(raw);

  for (const r of FACTS) {
    const type = r.type || "containsAny";
    const baseConf = Number(
      r.confidence ?? r.confidenceFalse ?? r.confidenceTrue ?? 0.8
    );

    if (type === "containsAll") {
      const arr = (r.keywords || []).map(_norm);
      if (arr.length && arr.every((k) => n.includes(k))) {
        return { verdict: r.verdict || "false", confidence: baseConf, claim: raw };
      }
    } else if (type === "containsAny") {
      const arr = (r.keywords || []).map(_norm);
      if (arr.length && arr.some((k) => n.includes(k))) {
        return { verdict: r.verdict || "false", confidence: baseConf, claim: raw };
      }
    } else if (type === "equals") {
      if (_norm(r.text || "") === n) {
        return { verdict: r.verdict || "false", confidence: baseConf, claim: raw };
      }
    } else if (type === "regex") {
      try {
        const re = new RegExp(r.pattern, r.flags || "i");
        if (re.test(raw)) {
          return { verdict: r.verdict || "false", confidence: baseConf, claim: raw };
        }
      } catch {}
    } else if (type === "numberRange") {
      // optional keyword gate
      let ok = true;
      const pats = r.patterns || [];
      if (pats.length) ok = pats.some((p) => n.includes(_norm(p)));
      if (ok) {
        const m = n.match(/(\d+(?:\.\d+)?)\s*(m|meter|meters|km|kilometer|kilometers|ft|feet)?\b/);
        if (m) {
          const val = parseFloat(m[1]);
          const min = Number(r.trueRange?.[0]);
          const max = Number(r.trueRange?.[1]);
          if (!Number.isNaN(min) && !Number.isNaN(max)) {
            if (val >= min && val <= max) {
              return {
                verdict: r.trueVerdict || "true",
                confidence: Number(r.confidenceTrue ?? baseConf),
                claim: raw,
              };
            }
            return {
              verdict: r.ifOutsideVerdict || "false",
              confidence: Number(r.confidenceFalse ?? baseConf),
              claim: raw,
            };
          }
        }
      }
    }
  }
  return null;
}

module.exports = { matchRule, loadFacts };
