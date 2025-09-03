// mask-backend/services/factcheckWorker.js
require("dotenv").config();

const FactCheckResult = require("../models/FactCheckResult");
const TrustSnapshot = require("../models/TrustSnapshot");
const Post = require("../models/Post");
const { computeTrust } = require("./trustMath");

// ---- Optional Gemini integration (feature-flagged) ----
let factcheckWithGemini = null;
try {
  ({ factcheckWithGemini } = require("./ai/geminiFactcheck"));
} catch (_) {
  // service missing is OK; we'll log in skip reasons
}

// ---- Config ----
const TRUST_ENABLED = process.env.TRUST_ENABLED !== "0";
const QUEUE_MODE = (process.env.TRUST_QUEUE_MODE || "local").toLowerCase();
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.TRUST_QUEUE_NAME || "mask.factcheck";
const INLINE_WORKER = String(process.env.TRUST_WORKER_INLINE || "1") === "1";

// Re-check scheduler
const RECHECK_INTERVAL_MINUTES = parseInt(process.env.TRUST_RECHECK_INTERVAL_MINUTES || "0", 10);
const RECHECK_AGE_HOURS = parseFloat(process.env.TRUST_RECHECK_AGE_HOURS || process.env.TRUST_TTL_HOURS || "24");

// Gemini flags & rate guards
const GEMINI_ENABLED     = String(process.env.TRUST_GEMINI_ENABLED     || "0") === "1";
const GEMINI_FORCE       = String(process.env.TRUST_GEMINI_FORCE       || "0") === "1";
const RULES_FIRST        = String(process.env.TRUST_RULES_FIRST        || "1") === "1";
const GEMINI_DEMO_ONLY   = String(process.env.TRUST_GEMINI_DEMO_ONLY   || "0") === "1";
const GEMINI_TRIGGER_TAG = (process.env.TRUST_GEMINI_TRIGGER_TAG || "#verify").toLowerCase();
const GEMINI_HOURLY_BUDGET = Math.max(0, parseInt(process.env.TRUST_GEMINI_HOURLY_BUDGET || "20", 10));
const GEMINI_MIN_INTERVAL_MS = Math.max(0, parseInt(process.env.TRUST_GEMINI_MIN_INTERVAL_MS || "4000", 10));

// <<< NEW: switches to disable the legacy path without deleting code >>>
const LOCAL_RULES_ENABLED   = String(process.env.TRUST_LOCAL_RULES_ENABLED   ?? "1") === "1";
const HEURISTICS_ENABLED    = String(process.env.TRUST_HEURISTICS_ENABLED    ?? "1") === "1";
const NO_RESULT_IF_SKIPPED  = String(process.env.TRUST_NO_RESULT_IF_SKIPPED  ?? "1") === "1";

// Optional BullMQ deps
let BullMQ = null, IORedis = null;
try { BullMQ = require("bullmq"); IORedis = require("ioredis"); } catch (_) {}

/* --------------------------------- helpers -------------------------------- */
function looksFactualClaim(text) {
  const t = (text || "").trim();
  if (t.length < 8) return false;
  const lower = t.toLowerCase();
  if (/^(i|we)\b.*\b(am|are|was|were|think|feel|believe|like|listening|eating|going)\b/.test(lower)) return false;
  if (/\d{1,4}/.test(lower)) return true;
  if (/\b(km|kilometers?|miles?|meters?|m|cm|kg|tons?|percent|%|bce|ce|ad|bc)\b/.test(lower)) return true;
  if (/\b(is|are|was|were|has|have|contains|equals)\b/.test(lower) && /\w+\s+\b(is|are|was|were|has|have)\b/.test(lower)) return true;
  return false;
}

function ruleBasedVerdict(text) {
  const t = (text || "").toLowerCase().trim();
  if (/bangladesh .*biggest country/.test(t) || /biggest country .*bangladesh/.test(t)) {
    return { verdict: "false", confidence: 0.9, claim: text };
  }
  if (/eiffel/.test(t)) {
    const m = t.match(/(\d+)\s*(m|meter|meters)\b/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 300 && n <= 330) return { verdict: "true", confidence: 0.85, claim: text };
      return { verdict: "false", confidence: 0.9, claim: text };
    }
  }
  return null;
}

let matchRule = null;
try {
  ({ matchRule } = require("./factRules"));
  if (typeof matchRule !== "function") matchRule = null;
} catch (_) { matchRule = null; }

/* --------------------------- Gemini rate budgeting ------------------------- */
const __budget = { windowStartMs: 0, used: 0, lastCallAt: 0 };
function _resetBudgetWindowIfNeeded(now) {
  if (!__budget.windowStartMs || now - __budget.windowStartMs >= 3600_000) {
    __budget.windowStartMs = now; __budget.used = 0;
  }
}
function geminiCanCall() {
  if (!GEMINI_ENABLED) return false;
  if (!factcheckWithGemini) return false;
  const now = Date.now(); _resetBudgetWindowIfNeeded(now);
  if (GEMINI_HOURLY_BUDGET > 0 && __budget.used >= GEMINI_HOURLY_BUDGET) return false;
  if (GEMINI_MIN_INTERVAL_MS > 0 && now - __budget.lastCallAt < GEMINI_MIN_INTERVAL_MS) return false;
  return true;
}
function geminiMarkCall() { const now = Date.now(); _resetBudgetWindowIfNeeded(now); __budget.used += 1; __budget.lastCallAt = now; }

function logSkipReasons(ctx) { try { console.log("[gemini-skip]", JSON.stringify(ctx)); } catch {} }

async function tryGemini(text) {
  const lower = (text || "").toLowerCase();
  const hasTag = lower.includes(GEMINI_TRIGGER_TAG);
  const demoAllows = !GEMINI_DEMO_ONLY || hasTag || GEMINI_FORCE;
  const factual = looksFactualClaim(text) || GEMINI_FORCE;

  const enabled = GEMINI_ENABLED;
  const hasModule = !!factcheckWithGemini;
  const canCall = geminiCanCall() || GEMINI_FORCE;
  const intervalOk = GEMINI_MIN_INTERVAL_MS === 0 || Date.now() - __budget.lastCallAt >= GEMINI_MIN_INTERVAL_MS;
  const budgetLimit = GEMINI_HOURLY_BUDGET;
  const budgetUsed = __budget.used;

  if (!(enabled && hasModule && demoAllows && factual && canCall)) {
    logSkipReasons({ force: GEMINI_FORCE, enabled, hasModule, demoAllows, hasTag, factual, canCall, intervalOk, budgetUsed, budgetLimit, text: (text || "").slice(0,120) });
    return null;
  }

  try {
    if (!GEMINI_FORCE) geminiMarkCall();
    const ai = await factcheckWithGemini(text);
    if (ai && ai.ok) {
      return {
        verdict: ai.verdict,
        confidence: typeof ai.confidence === "number" ? ai.confidence : 0.66,
        modelTag: `gemini (${process.env.GEMINI_MODEL || "gemini-2.5-flash"})`,
        evidence: ai.explanation
          ? [{ title: "Model note", url: "", snippet: ai.explanation, stance: "neutral" }]
          : []
      };
    }
    try { console.warn("[gemini-fail]", ai?.error || "unknown", ai?.detail || ""); } catch {}
    return null;
  } catch (e) {
    try { console.warn("[gemini-exception]", e?.message || e); } catch {}
    return null;
  }
}

/* ------------------------------- Core job --------------------------------- */
async function processJob({ postId }) {
  if (!TRUST_ENABLED) return;

  const post = await Post.findById(postId).populate("author", "_id").lean();
  if (!post) return;

  const text = (post.text || "").trim();
  const lower = text.toLowerCase();
  const hasTag = lower.includes(GEMINI_TRIGGER_TAG);

  // If we already have a non-unverified verdict, skip
  const latest = await FactCheckResult.findOne({ post: post._id }).sort({ createdAt: -1 }).lean();
  if (latest && latest.verdict !== "unverified") {
    try { console.log(`[factcheck] skip post=${postId} (already has verdict=${latest.verdict})`);} catch {}
    return;
  }

  // Early skip: demo-only + no tag + legacy paths disabled → do nothing
  if (GEMINI_DEMO_ONLY && !hasTag && !LOCAL_RULES_ENABLED && !HEURISTICS_ENABLED) {
    try { console.log(`[factcheck] skip post=${postId} (demo-only, no #verify, local checks disabled)`); } catch {}
    return;
  }

  let verdict = "opinion";
  let confidence = 0.4;
  let claim = text.slice(0, 200);
  let modelTag = "stub-v1-rules";
  let evidence = [];

  let usedGemini = false, usedRules = false, usedHeuristics = false;

  // Pipeline ordering
  if (!RULES_FIRST) {
    const ai = await tryGemini(text);
    if (ai) { ({ verdict, confidence, evidence } = ai); modelTag = ai.modelTag; usedGemini = true; }
  }

  if (!usedGemini) {
    // 1) File rules
    if (LOCAL_RULES_ENABLED && matchRule) {
      try {
        const hit = matchRule(text);
        if (hit) { ({ verdict, confidence, claim } = hit); modelTag = "rules-file-v1"; usedRules = true; }
      } catch (_) {}
    }

    // 2) Hard-coded rules
    if (!usedRules && LOCAL_RULES_ENABLED) {
      const ruleHit = ruleBasedVerdict(text);
      if (ruleHit) { ({ verdict, confidence, claim } = ruleHit); modelTag = "stub-v1-rules"; usedRules = true; }
    }

    // 3) Heuristic
    if (!usedRules && HEURISTICS_ENABLED) {
      if (text.length > 20 && !/[!?]$/.test(text)) { verdict = "unverified"; confidence = 0.6; usedHeuristics = true; }
    }

    // Gemini as fallback if rules-first
    if (!usedRules && !usedHeuristics && RULES_FIRST) {
      const ai = await tryGemini(text);
      if (ai) { ({ verdict, confidence, evidence } = ai); modelTag = ai.modelTag; usedGemini = true; }
    }
  }

  // If we ended up not using anything and we're configured to skip, bail
  if (!usedGemini && !usedRules && !usedHeuristics && NO_RESULT_IF_SKIPPED) {
    try { console.log(`[factcheck] no judgement created for post=${postId} (all paths skipped)`); } catch {}
    return;
  }

  // --- Write result (NEVER crash the process) ---
  try {
    await FactCheckResult.create({
      post: post._id,
      claim,
      verdict,
      confidence,
      topic: "",
      evidence,        // schema-valid (stance: neutral)
      model: modelTag,
    });
  } catch (e) {
    console.warn("[factcheck] failed to save FactCheckResult:", e?.message || e);
    return;
  }

  // Recompute trust (safe)
  try { await recomputeTrustForSubject("user", post.author._id); }
  catch (e) { console.warn("[factcheck] trust recompute failed:", e?.message || e); }

  try { console.log(`[factcheck] processed post=${postId} -> verdict=${verdict} conf=${confidence} model=${modelTag}`); } catch {}
}

async function recomputeTrustForSubject(subjectType, subjectId) {
  const pipeline = [
    { $lookup: { from: "posts", localField: "post", foreignField: "_id", as: "p" } },
    { $unwind: "$p" },
    { $match: { "p.author": subjectId } },
    {
      $group: {
        _id: null,
        postsChecked: { $sum: 1 },
        postsTrue: { $sum: { $cond: [{ $eq: ["$verdict", "true"] }, 1, 0] } },
        postsFalse: { $sum: { $cond: [{ $eq: ["$verdict", "false"] }, 1, 0] } },
        postsMisleading: { $sum: { $cond: [{ $eq: ["$verdict", "misleading"] }, 1, 0] } },
      },
    },
  ];

  const [agg] = await FactCheckResult.aggregate(pipeline);
  const counts = agg || { postsChecked: 0, postsTrue: 0, postsFalse: 0, postsMisleading: 0 };
  const { score, confLow, confHigh, tier } = computeTrust({
    trueCount: counts.postsTrue,
    falseCount: counts.postsFalse,
    misleadingCount: counts.postsMisleading,
  });

  await TrustSnapshot.findOneAndUpdate(
    { subjectType, subject: subjectId },
    {
      $set: {
        postsChecked: counts.postsChecked,
        postsTrue: counts.postsTrue,
        postsFalse: counts.postsFalse,
        postsMisleading: counts.postsMisleading,
        score, confLow, confHigh, tier,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/* ----------------------------- Re-check timer ------------------------------ */
let __recheckTimer = null;
async function recheckOnce() {
  if (!TRUST_ENABLED) return;
  const ageMs = Math.max(0, Math.floor(RECHECK_AGE_HOURS * 3600 * 1000));
  const cutoff = new Date(Date.now() - ageMs);

  const batch = await FactCheckResult.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$post", latest: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$latest" } },
    { $match: { verdict: "unverified", createdAt: { $lte: cutoff } } },
    { $sort: { createdAt: 1 } },
    { $limit: 20 },
    { $project: { post: 1, createdAt: 1 } }
  ]);

  if (!batch.length) return;
  console.log(`[recheck] re-enqueueing ${batch.length} posts for fact-check...`);
  for (const r of batch) {
    try { await processJob({ postId: r.post }); } catch (e) { console.warn("[factcheck] recheck job failed:", e?.message || e); }
  }
  console.log(`[factcheck] recheck: processed ${batch.length} results`);
}
function startRecheckTimer() {
  if (!TRUST_ENABLED) return;
  if (!RECHECK_INTERVAL_MINUTES || RECHECK_INTERVAL_MINUTES <= 0) return;
  if (__recheckTimer) return;
  __recheckTimer = setInterval(() => { recheckOnce().catch((e) => console.warn("[factcheck] recheck error:", e?.message || e)); }, RECHECK_INTERVAL_MINUTES * 60 * 1000);
  console.log(`[factcheck] recheck timer every ${RECHECK_INTERVAL_MINUTES}m; age >= ${RECHECK_AGE_HOURS}h`);
}

/* --------------------------------- Queues --------------------------------- */
const LOCAL = (() => {
  const QUEUE = []; let running = false;
  async function run() {
    if (running) return; running = true;
    try { while (QUEUE.length) { const job = QUEUE.shift(); await processJob(job); } }
    finally { running = false; }
  }
  return {
    enqueue: (postId) => { if (!TRUST_ENABLED) return; QUEUE.push({ postId }); run(); },
    startWorker: () => { console.log("[factcheck] using LOCAL in-memory queue"); },
  };
})();

function makeBullQueue() {
  if (!BullMQ || !IORedis) return null;
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  async function probe() { try { await connection.ping(); return true; } catch { return false; } }
  function startWorker() {
    const worker = new BullMQ.Worker(QUEUE_NAME, async (job) => { await processJob(job.data || {}); }, { connection, concurrency: 1 });
    worker.on("ready", () => console.log(`[factcheck] BullMQ worker ready on ${QUEUE_NAME}`));
    worker.on("failed", (job, err) => console.warn("[factcheck] job failed", job?.id, err?.message || err));
    worker.on("error", (err) => console.warn("[factcheck] worker error:", err?.message || err));
  }
  const queue = new BullMQ.Queue(QUEUE_NAME, { connection });
  async function enqueue(postId) {
    if (!TRUST_ENABLED) return;
    await queue.add("factcheck", { postId }, { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
  }
  return { enqueue, startWorker, probe };
}

let IMPL = LOCAL;
if (TRUST_ENABLED && QUEUE_MODE === "redis" && BullMQ && IORedis) {
  (async () => {
    const bull = makeBullQueue();
    if (!bull) return console.warn("[factcheck] BullMQ not available; falling back to LOCAL queue");
    const ok = await bull.probe();
    if (ok) { IMPL = bull; console.log("[factcheck] using REDIS queue via BullMQ"); if (INLINE_WORKER) IMPL.startWorker(); }
    else { console.warn("[factcheck] Redis not reachable; falling back to LOCAL queue"); }
  })();
} else if (TRUST_ENABLED && QUEUE_MODE === "redis") {
  console.warn("[factcheck] redis mode requested but bullmq/ioredis not installed; using LOCAL queue");
}

/* --------------------------------- Exports -------------------------------- */
function enqueueFactCheck(postId) { try { IMPL.enqueue(String(postId)); } catch (e) { console.warn("[factcheck] enqueue error:", e?.message || e); } }
function startFactcheckWorker() { if (IMPL && IMPL.startWorker && IMPL !== LOCAL) IMPL.startWorker(); else console.log("[factcheck] startFactcheckWorker(): using LOCAL queue or inline worker; nothing to start"); startRecheckTimer(); }
if (INLINE_WORKER) startRecheckTimer();

module.exports = {
  enqueueFactCheck,
  recomputeTrustForSubject,
  startFactcheckWorker,
  recheckOnce,
  startRecheckTimer,
};
