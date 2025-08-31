// mask-backend/services/factcheckWorker.js
require("dotenv").config();

const FactCheckResult = require("../models/FactCheckResult");
const TrustSnapshot = require("../models/TrustSnapshot");
const Post = require("../models/Post");
const { computeTrust } = require("./trustMath");

// ---- Config ----
const TRUST_ENABLED = process.env.TRUST_ENABLED !== "0";
const QUEUE_MODE = (process.env.TRUST_QUEUE_MODE || "local").toLowerCase(); // "local" | "redis"
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.TRUST_QUEUE_NAME || "mask.factcheck";
const INLINE_WORKER = String(process.env.TRUST_WORKER_INLINE || "1") === "1";

// Re-check scheduler (does nothing unless interval > 0)
const RECHECK_INTERVAL_MINUTES = parseInt(process.env.TRUST_RECHECK_INTERVAL_MINUTES || "0", 10);
const RECHECK_AGE_HOURS = parseFloat(
  process.env.TRUST_RECHECK_AGE_HOURS ||
    process.env.TRUST_TTL_HOURS ||
    "24"
);

// Optional BullMQ deps (loaded only if installed)
let BullMQ = null;
let IORedis = null;
try {
  BullMQ = require("bullmq");
  IORedis = require("ioredis");
} catch (_) {
  // not installed; we'll fall back to local
}

/* -------------------------------------------------------------------------- */
/*                         Tiny demo rule-based helper                         */
/* -------------------------------------------------------------------------- */
function ruleBasedVerdict(text) {
  const t = (text || "").toLowerCase().trim();

  // 1) Bangladesh "biggest country" — false
  if (/bangladesh .*biggest country/.test(t) || /biggest country .*bangladesh/.test(t)) {
    return { verdict: "false", confidence: 0.9, claim: text };
  }

  // 2) Eiffel Tower height rule (rough range check)
  if (/eiffel/.test(t)) {
    const m = t.match(/(\d+)\s*(m|meter|meters)\b/);
    if (m) {
      const n = parseInt(m[1], 10);
      // Real height ~324m (incl. antenna). Treat 300–330 as true-ish, otherwise false.
      if (n >= 300 && n <= 330) return { verdict: "true", confidence: 0.85, claim: text };
      return { verdict: "false", confidence: 0.9, claim: text };
    }
  }

  return null; // no rule applied
}

/* -------------------- Safe optional import: file-driven rules -------------------- */
let matchRule = null;
try {
  ({ matchRule } = require("./factRules"));
  if (typeof matchRule !== "function") matchRule = null;
} catch (_) {
  matchRule = null; // ok if you haven't created factRules.js/facts.json yet
}

/* -------------------------------------------------------------------------- */
/*                               Core job logic                                */
/* -------------------------------------------------------------------------- */
async function processJob({ postId }) {
  if (!TRUST_ENABLED) return;

  const post = await Post.findById(postId).populate("author", "_id").lean();
  if (!post) return;

  const text = (post.text || "").trim();

  // Default values
  let verdict = "opinion";
  let confidence = 0.4;
  let claim = "";

  // 1) Try file-based rules FIRST (lets you add ~100 sentences without code changes)
  let hit = null;
  if (matchRule) {
    try { hit = matchRule(text); } catch (_) { /* ignore and fall back */ }
  }
  if (hit) {
    ({ verdict, confidence, claim } = hit);
  } else {
    // 2) Then your hard-coded demo rules
    const ruleHit = ruleBasedVerdict(text);
    if (ruleHit) {
      ({ verdict, confidence, claim } = ruleHit);
    } else {
      // 3) Finally: generic heuristics (unverified/ opinion)
      if (text.length > 20 && !/[!?]$/.test(text)) {
        verdict = "unverified";
        confidence = 0.6;
        claim = text.slice(0, 200);
      }
      const lower = text.toLowerCase();
      if (/is a free country/.test(lower)) {
        verdict = "opinion";
        confidence = 0.6;
        claim = text;
      }
    }
  }

  await FactCheckResult.create({
    post: post._id,
    claim,
    verdict,
    confidence,
    topic: "",
    evidence: [],
    model: matchRule ? "rules-file-v1" : "stub-v1-rules",
  });

  await recomputeTrustForSubject("user", post.author._id);

  try {
    console.log(`[factcheck] processed post=${postId} -> verdict=${verdict} conf=${confidence}`);
  } catch {}
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
        score,
        confLow,
        confHigh,
        tier,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

/* -------------------------------------------------------------------------- */
/*                           Optional re-check scheduler                       */
/* -------------------------------------------------------------------------- */
let __recheckTimer = null;

// Only recheck the latest result per post, and only if that latest result is still unverified.
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
    try {
      await processJob({ postId: r.post });
    } catch (e) {
      console.warn("[factcheck] recheck job failed:", e?.message || e);
    }
  }
  console.log(`[factcheck] recheck: processed ${batch.length} results`);
}

function startRecheckTimer() {
  if (!TRUST_ENABLED) return;
  if (!RECHECK_INTERVAL_MINUTES || RECHECK_INTERVAL_MINUTES <= 0) return;
  if (__recheckTimer) return; // already started
  __recheckTimer = setInterval(() => {
    recheckOnce().catch((e) => console.warn("[factcheck] recheck error:", e?.message || e));
  }, RECHECK_INTERVAL_MINUTES * 60 * 1000);
  console.log(
    `[factcheck] recheck timer every ${RECHECK_INTERVAL_MINUTES}m; age >= ${RECHECK_AGE_HOURS}h`
  );
}

/* -------------------------------------------------------------------------- */
/*                           Queue implementations                             */
/* -------------------------------------------------------------------------- */

// Local (in-memory) queue
const LOCAL = (() => {
  const QUEUE = [];
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      while (QUEUE.length) {
        const job = QUEUE.shift();
        await processJob(job);
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue: (postId) => {
      if (!TRUST_ENABLED) return;
      QUEUE.push({ postId });
      run();
    },
    startWorker: () => {
      console.log("[factcheck] using LOCAL in-memory queue");
    },
  };
})();

// Redis (BullMQ) queue with connectivity probe + graceful fallback
function makeBullQueue() {
  if (!BullMQ || !IORedis) return null;

  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  async function probe() {
    try {
      await connection.ping();
      return true;
    } catch {
      return false;
    }
  }

  function startWorker() {
    const worker = new BullMQ.Worker(
      QUEUE_NAME,
      async (job) => {
        await processJob(job.data || {});
      },
      { connection, concurrency: 1 }
    );
    worker.on("ready", () => console.log(`[factcheck] BullMQ worker ready on ${QUEUE_NAME}`));
    worker.on("failed", (job, err) =>
      console.warn("[factcheck] job failed", job?.id, err?.message || err)
    );
    worker.on("error", (err) =>
      console.warn("[factcheck] worker error (will keep running):", err?.message || err)
    );
  }

  const queue = new BullMQ.Queue(QUEUE_NAME, { connection });

  async function enqueue(postId) {
    if (!TRUST_ENABLED) return;
    await queue.add(
      "factcheck",
      { postId },
      { removeOnComplete: 1000, removeOnFail: 1000, attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );
  }

  return { enqueue, startWorker, probe };
}

// Decide which queue to use, with auto-fallback if Redis is down
let IMPL = LOCAL;

if (TRUST_ENABLED && QUEUE_MODE === "redis" && BullMQ && IORedis) {
  (async () => {
    const bull = makeBullQueue();
    if (!bull) {
      console.warn("[factcheck] BullMQ not available; falling back to LOCAL queue");
      return;
    }
    const ok = await bull.probe();
    if (ok) {
      IMPL = bull;
      console.log("[factcheck] using REDIS queue via BullMQ");
      if (INLINE_WORKER) IMPL.startWorker();
    } else {
      console.warn("[factcheck] Redis not reachable; falling back to LOCAL queue");
    }
  })();
} else if (TRUST_ENABLED && QUEUE_MODE === "redis") {
  console.warn("[factcheck] redis mode requested but bullmq/ioredis not installed; using LOCAL queue");
}

/* -------------------------------------------------------------------------- */
/*                                  Exports                                    */
/* -------------------------------------------------------------------------- */
function enqueueFactCheck(postId) {
  try {
    IMPL.enqueue(String(postId));
  } catch (e) {
    console.warn("[factcheck] enqueue error:", e?.message || e);
  }
}

function startFactcheckWorker() {
  // For dedicated worker process (if INLINE_WORKER=0 and you call this from worker.factcheck.js)
  if (IMPL && IMPL.startWorker && IMPL !== LOCAL) {
    IMPL.startWorker();
  } else {
    console.log("[factcheck] startFactcheckWorker(): using LOCAL queue or inline worker; nothing to start");
  }
  // Start the optional re-check timer when explicitly asked
  startRecheckTimer();
}

// Auto-start re-check in inline mode for convenience
if (INLINE_WORKER) {
  startRecheckTimer();
}

module.exports = {
  enqueueFactCheck,
  recomputeTrustForSubject,
  startFactcheckWorker,
  // exposed for tests/ops if needed
  recheckOnce,
  startRecheckTimer,
};
