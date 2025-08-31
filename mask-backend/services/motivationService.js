// mask-backend/services/motivationService.js
require("dotenv").config();

const User = require("../models/User");
const MotivationQuote = require("../models/MotivationQuote");
const MotivationDelivery = require("../models/MotivationDelivery");
const Notification = require("../models/Notification");

// -------------------------- ENV / CONFIG -----------------------------------
const ENABLED = String(process.env.MOTIVATION_ENABLED || "0") === "1";
const INTERVAL_MINUTES = Math.max(1, parseInt(process.env.MOTIVATION_INTERVAL_MINUTES || "60", 10));

// Throttle: don’t send again if user got one within LOOKBACK_HOURS
const LOOKBACK_HOURS = Math.max(
  1,
  parseInt(process.env.MOTIVATION_LOOKBACK_HOURS || "24", 10)
);

// Rotation: avoid repeats for N days, or last K deliveries (whichever broader)
const ROTATE_DAYS = Math.max(1, parseInt(process.env.MOTIVATION_ROTATE_DAYS || "60", 10));
const ROTATE_MAX = Math.max(1, parseInt(process.env.MOTIVATION_ROTATE_MAX || "30", 10));

const INLINE_WORKER = String(process.env.MOTIVATION_WORKER_INLINE || "0") === "1";

// -------------------------- HELPERS ----------------------------------------
function lc(s) { return String(s || "").toLowerCase().trim(); }
function normTags(arr) {
  if (!arr) return [];
  if (!Array.isArray(arr)) return [lc(arr)];
  return arr.map(lc).filter(Boolean);
}

function allowedTones(prefs) {
  const tones = [];
  if (prefs?.tone?.inspiration !== false) tones.push("inspiration"); // default ON
  if (prefs?.tone?.humor) tones.push("humor");                       // opt-in
  return tones.length ? tones : ["inspiration"];
}

function unionUserTags(prefs) {
  const set = new Set();
  normTags(prefs?.interests).forEach(t => set.add(t));
  normTags(prefs?.goals).forEach(t => set.add(t));
  if (prefs?.role) set.add(lc(prefs.role));
  return set;
}

async function lastDeliveryWithin(userId, ms) {
  const last = await MotivationDelivery.findOne({ user: userId }).sort({ sentAt: -1 }).select("sentAt").lean();
  if (!last) return false;
  return Date.now() - new Date(last.sentAt).getTime() < ms;
}

async function recentDeliveredQuoteIds(userId) {
  const since = new Date(Date.now() - ROTATE_DAYS * 24 * 3600 * 1000);
  const recents = await MotivationDelivery
    .find({ user: userId, sentAt: { $gte: since } })
    .sort({ sentAt: -1 })
    .select("quote")
    .limit(ROTATE_MAX)
    .lean();
  return new Set(recents.map(r => String(r.quote)));
}

/**
 * Score a quote against a user’s tag sets.
 * Weights:
 *  +2 per overlap with goals
 *  +1 per overlap with interests/role
 *  +0.25 tone “inspiration” boost (tiny nudge so humor doesn’t override unless asked)
 */
function scoreQuote(quote, tagSets, userTones) {
  const qTags = normTags(quote.tags);
  let goalHits = 0, interestHits = 0, roleHits = 0;

  for (const t of qTags) {
    if (tagSets.goals.has(t)) goalHits += 1;
    if (tagSets.interests.has(t)) interestHits += 1;
    if (tagSets.role.has(t)) roleHits += 1;
  }

  let score = 0;
  score += goalHits * 2;
  score += interestHits * 1;
  score += roleHits * 1;

  // tiny bias to “inspiration” so it wins ties when both tones allowed
  if (quote.tone === "inspiration") score += 0.25;

  // avoid all-zero ties: add jitter
  score += Math.random() * 0.1;

  return score;
}

/**
 * Pick one quote for a user:
 *  - match tone
 *  - language if user set it
 *  - tags overlapping (interests ∪ goals ∪ role) OR “universal”
 *  - exclude recently delivered
 *  - score & choose best
 */
async function pickQuoteForUser(u) {
  const prefs = u.motivationPrefs || {};
  const tones = allowedTones(prefs);
  const lang = lc(prefs.language || "");
  const tagUnion = unionUserTags(prefs);
  const tagArray = Array.from(tagUnion);

  // Recent rotation exclusions
  const excludeIds = await recentDeliveredQuoteIds(u._id);

  // Build filter
  const filter = {
    tone: { $in: tones },
    _id: { $nin: Array.from(excludeIds) }
  };
  if (lang) filter.lang = lang;

  // Prefer quotes that overlap user tags OR evergreen “universal”
  filter.$or = [
    { tags: { $in: tagArray } },
    { tags: "universal" }
  ];

  const candidates = await MotivationQuote
    .find(filter)
    .limit(200)                     // safety cap; we’ll score these
    .lean();

  if (!candidates.length) return null;

  // Build sets to score quickly
  const tagSets = {
    goals: new Set(normTags(prefs.goals)),
    interests: new Set(normTags(prefs.interests)),
    role: new Set(prefs.role ? [lc(prefs.role)] : []),
  };

  let best = null;
  let bestScore = -Infinity;

  for (const q of candidates) {
    const s = scoreQuote(q, tagSets, tones);
    if (s > bestScore) { bestScore = s; best = q; }
  }

  return best;
}

async function sendQuoteToUser(user, quote) {
  const now = new Date();

  // Notification payload
  const note = {
    user: user._id,
    type: "motivation",
    message: quote.text,
    meta: {
      quoteId: String(quote._id),
      author: quote.author || "",
      tags: normTags(quote.tags),
      tone: quote.tone || "inspiration",
    },
    createdAt: now,
  };

  // Insert both in parallel
  await Promise.all([
    Notification.create(note),
    MotivationDelivery.create({
      user: user._id,
      quote: quote._id,
      sentAt: now,
      tagsAtSend: Array.from(unionUserTags(user.motivationPrefs || {})),
      tone: quote.tone || "inspiration",
    })
  ]);
}

// -------------------------- MAIN CYCLE --------------------------------------
/**
 * Run one cycle:
 *  - Only users with prefs.enabled
 *  - Only those whose preferred hour matches current hour (server local time)
 *  - Respect LOOKBACK throttle (e.g., 22h)
 */
async function runMotivationCycle() {
  if (!ENABLED) return 0;

  const now = new Date();
  const currentHour = now.getHours();
  const throttleMs = LOOKBACK_HOURS * 3600 * 1000;

  // Only users whose hourLocal == currentHour (simple & efficient)
  const users = await User.find({
    "motivationPrefs.enabled": true,
    "motivationPrefs.hourLocal": currentHour,
  })
    .select("_id motivationPrefs pseudonym")
    .lean();

  let sent = 0;

  for (const u of users) {
    try {
      // Per-user throttle, e.g., last 22h
      const tooSoon = await lastDeliveryWithin(u._id, throttleMs);
      if (tooSoon) continue;

      const quote = await pickQuoteForUser(u);
      if (!quote) continue;

      await sendQuoteToUser(u, quote);
      sent += 1;
    } catch (e) {
      console.warn("[motivation] send error for user", u?._id, e?.message || e);
    }
  }

  return sent;
}

// -------------------------- SCHEDULER ---------------------------------------
let __timer = null;

function startScheduler() {
  if (!ENABLED) {
    console.log("[motivation] disabled (MOTIVATION_ENABLED!=1)");
    return;
  }
  if (__timer) return;

  const everyMs = INTERVAL_MINUTES * 60 * 1000;
  __timer = setInterval(async () => {
    try {
      const sent = await runMotivationCycle();
      console.log(`[motivation] cycle sent=${sent}`);
    } catch (e) {
      console.warn("[motivation] cycle error:", e?.message || e);
    }
  }, everyMs);

  console.log(`[motivation] scheduler: every ${INTERVAL_MINUTES}m (lookback ${LOOKBACK_HOURS}h)`);
}

// For admin “run once” button/endpoint
async function runOnce() {
  try {
    const sent = await runMotivationCycle();
    return { ok: true, sent };
  } catch (e) {
    console.warn("[motivation] runOnce error:", e?.message || e);
    return { ok: false, sent: 0 };
  }
}

// Auto-start when INLINE mode
if (INLINE_WORKER) startScheduler();

module.exports = {
  startScheduler,
  runOnce,
  // Mostly for tests
  _internals: {
    pickQuoteForUser,
    scoreQuote,
  },
};
