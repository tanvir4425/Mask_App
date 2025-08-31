// mask-backend/services/motivationJob.js
require("dotenv").config();

const User = require("../models/User");
const Notification = require("../models/Notification");
const MotivationQuote = require("../models/MotivationQuote");

// ---- Config (safe defaults) ----
const ENABLED = String(process.env.MOTIVATION_ENABLED ?? "1") === "1";       // master switch
const RUN_EVERY_MINUTES = parseInt(process.env.MOTIVATION_INTERVAL_MINUTES || "60", 10); // how often the worker wakes up
const LOOKBACK_HOURS = parseFloat(process.env.MOTIVATION_LOOKBACK_HOURS || "22");        // ensure 1/day, tolerate clock drift
const INLINE_WORKER = String(process.env.MOTIVATION_WORKER_INLINE ?? "1") === "1";       // auto-start when required

// NOTE: We use server local hour as “local” for now. If you later add user timezones,
// just convert now() to that TZ before comparing to user.motivationPrefs.hourLocal.

// Map role -> extra tags to help the matcher
const ROLE_TAGS = {
  student: ["study", "exams", "learning", "productivity"],
  engineer: ["coding", "focus", "learning", "productivity"],
  designer: ["art", "creativity", "focus"],
  teacher: ["leadership", "public-speaking", "learning"],
  freelancer: ["productivity", "business", "focus"],
  entrepreneur: ["startups", "leadership", "business", "productivity"],
  athlete: ["sports", "fitness", "discipline"],
  artist: ["art", "creativity"],
  other: [],
};

function uniq(xs) {
  return [...new Set((xs || []).filter(Boolean))];
}

function overlapScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let n = 0;
  for (const x of b) if (set.has(x)) n++;
  return n;
}

async function pickQuoteForUser(user) {
  const prefs = user?.motivationPrefs || {};
  const interestedTags = uniq([...(prefs.interests || []), ...(prefs.goals || []), ...(ROLE_TAGS[prefs.role] || [])]);
  const selectedTones = [];
  if (prefs.tone?.inspiration !== false) selectedTones.push("inspiration");
  if (prefs.tone?.humor) selectedTones.push("humor");
  if (!selectedTones.length) selectedTones.push("inspiration");

  // Build base query
  const q = {
    tone: { $in: selectedTones },
  };
  if (prefs.language) {
    q.lang = prefs.language;
  }

  let candidates = [];
  // Prefer tag overlap first
  if (interestedTags.length) {
    candidates = await MotivationQuote.find({
      ...q,
      tags: { $in: interestedTags },
    })
      .limit(50)
      .lean();
  }
  // Fallback: any tone/lang that matches (still limit)
  if (!candidates.length) {
    candidates = await MotivationQuote.find(q).limit(50).lean();
  }

  if (!candidates.length) return null;

  // Score by tag overlap, then small random tiebreaker
  const scored = candidates.map((c) => ({
    q: c,
    score: overlapScore(interestedTags, c.tags || []),
    r: Math.random(),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.r - a.r;
  });

  return scored[0].q;
}

async function alreadyGotOneRecently(userId) {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  const last = await Notification.findOne({
    user: userId,
    type: "motivation",
    createdAt: { $gte: cutoff },
  })
    .select("_id createdAt")
    .sort({ createdAt: -1 })
    .lean();
  return !!last;
}

function hourNowLocal() {
  return new Date().getHours(); // server local hour
}

function shouldSendThisHour(prefs) {
  const target = Number(prefs?.hourLocal ?? 9);
  return hourNowLocal() === target;
}

async function runOnce() {
  if (!ENABLED) return { ok: false, reason: "MOTIVATION_ENABLED=0" };

  // find users who opted in
  const users = await User.find({ "motivationPrefs.enabled": true })
    .select("_id pseudonym motivationPrefs")
    .lean();

  let sent = 0;
  for (const u of users) {
    const prefs = u.motivationPrefs || {};

    // respect preferred hour (approx, local server time)
    if (!shouldSendThisHour(prefs)) continue;

    // 1/day
    const got = await alreadyGotOneRecently(u._id);
    if (got) continue;

    // Pick a quote
    const quote = await pickQuoteForUser(u);
    if (!quote) continue;

    // Insert notification.
    // Schema is flexible in your app; using fields similar to existing notifications.
    await Notification.create({
      user: u._id,
      type: "motivation",
      // actor/post omitted
      message: quote.text,               // for UI use later
      motivationQuote: quote._id,        // reference
      author: quote.author || "",
      tone: quote.tone || "inspiration",
      tags: quote.tags || [],
    });

    sent++;
  }

  if (sent) {
    console.log(`[motivation] sent ${sent} motivation notifications`);
  } else {
    console.log("[motivation] nothing to send this run");
  }

  return { ok: true, sent };
}

let __timer = null;
function startMotivationScheduler() {
  if (!ENABLED) {
    console.log("[motivation] disabled via MOTIVATION_ENABLED=0");
    return;
  }
  if (__timer) return;

  const everyMs = Math.max(1, RUN_EVERY_MINUTES) * 60 * 1000;
  __timer = setInterval(() => {
    runOnce().catch((e) => console.warn("[motivation] run error:", e?.message || e));
  }, everyMs);

  console.log(`[motivation] scheduler: every ${RUN_EVERY_MINUTES}m (lookback ${LOOKBACK_HOURS}h)`);
}

function stopMotivationScheduler() {
  if (__timer) {
    clearInterval(__timer);
    __timer = null;
    console.log("[motivation] scheduler stopped");
  }
}

// Auto-start if configured
if (INLINE_WORKER) {
  startMotivationScheduler();
}

module.exports = {
  runOnce,
  startMotivationScheduler,
  stopMotivationScheduler,
};
