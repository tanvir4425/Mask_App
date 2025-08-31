// mask-backend/services/motivationDailyWorker.js
require("dotenv").config();

const User = require("../models/User");
const MotivationQuote = require("../models/MotivationQuote");
const MotivationDelivery = require("../models/MotivationDelivery");
const Notification = require("../models/Notification");

// Reuse scoring/picking from the interval service
const MotivationService = require("./motivationService");

// -------------------- ENV --------------------
const ENABLED = String(process.env.MOTIVATION_ENABLED || "0") === "1";
const TEST_INTERVAL_MIN =
  parseInt(process.env.MOTIVATION_TEST_INTERVAL_MIN || "0", 10) || 0;

const BATCH_SIZE =
  Math.max(50, parseInt(process.env.MOTIVATION_BATCH_SIZE || "500", 10));

const MAX_PER_DAY =
  Math.max(1, parseInt(process.env.MOTIVATION_MAX_PER_DAY || "1", 10));

const LOOKBACK_DAYS =
  Math.max(1, parseInt(process.env.MOTIVATION_LOOKBACK_DAYS || "60", 10));

const INLINE = String(process.env.MOTIVATION_WORKER_INLINE || "0") === "1";

// -------------------- HELPERS --------------------
function lc(s) { return String(s || "").toLowerCase().trim(); }

function minutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function inWindow(userHour /*0..23*/, now /*Date*/, minutes = 30) {
  const target = Number(userHour) * 60;
  const cur = minutesOfDay(now);
  let diff = Math.abs(cur - target);
  // wrap-around (e.g., 23:50 to 00:10)
  diff = Math.min(diff, 1440 - diff);
  return diff <= minutes;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function sentToday(userId) {
  const { start, end } = todayRange();
  const count = await MotivationDelivery.countDocuments({
    user: userId,
    sentAt: { $gte: start, $lte: end },
  });
  return count >= MAX_PER_DAY;
}

async function recentDeliveredQuoteIds(userId) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const rows = await MotivationDelivery
    .find({ user: userId, sentAt: { $gte: since } })
    .sort({ sentAt: -1 })
    .select("quote")
    .limit(200)
    .lean();
  return new Set(rows.map(r => String(r.quote)));
}

async function sendQuoteToUser(user, quote) {
  const now = new Date();
  await Promise.all([
    Notification.create({
      user: user._id,
      type: "motivation",
      message: quote.text,
      meta: {
        quoteId: String(quote._id),
        author: quote.author || "",
        tags: (quote.tags || []).map(t => String(t).toLowerCase()),
        tone: quote.tone || "inspiration",
      },
      createdAt: now,
    }),
    MotivationDelivery.create({
      user: user._id,
      quote: quote._id,
      sentAt: now,
      tagsAtSend: [
        ...(user.motivationPrefs?.interests || []),
        ...(user.motivationPrefs?.goals || []),
        ...(user.motivationPrefs?.role ? [lc(user.motivationPrefs.role)] : []),
      ],
      tone: quote.tone || "inspiration",
    }),
  ]);
}

// -------------------- CORE: one tick --------------------
async function runDailyTick() {
  if (!ENABLED) return { processed: 0, sent: 0, skipped: 0 };

  const now = new Date();
  const curHour = now.getHours();

  let processed = 0, sent = 0, skipped = 0;
  let lastId = null;

  // page through users in batches (by _id)
  /* eslint no-constant-condition: 0 */
  while (true) {
    const findFilter = {
      "motivationPrefs.enabled": true,
      "motivationPrefs.hourLocal": { $exists: true },
    };
    if (lastId) findFilter._id = { $gt: lastId };

    const users = await User.find(findFilter)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select("_id pseudonym motivationPrefs")
      .lean();

    if (!users.length) break;

    for (const u of users) {
      processed += 1;

      const prefs = u.motivationPrefs || {};
      const hour = Number(prefs.hourLocal ?? curHour);

      // Only act inside the ±30 minute window around user’s preferred hour
      if (!inWindow(hour, now, 30)) { skipped += 1; continue; }

      // daily uniqueness guard
      const already = await sentToday(u._id);
      if (already) { skipped += 1; continue; }

      // rotation exclusion ids (60 days by default)
      const exclude = await recentDeliveredQuoteIds(u._id);

      // pick a quote using the motivationService scoring/logic
      const quote = await MotivationService._internals.pickQuoteForUser(u);
      if (!quote) { skipped += 1; continue; }

      if (exclude.has(String(quote._id))) { skipped += 1; continue; }

      await sendQuoteToUser(u, quote);
      sent += 1;
    }

    lastId = users[users.length - 1]._id;
  }

  return { processed, sent, skipped };
}

// -------------------- SCHEDULER --------------------
let __timer = null;

function startDailyScheduler() {
  if (!ENABLED) {
    console.log("[motivation-daily] disabled (MOTIVATION_ENABLED!=1)");
    return;
  }
  if (__timer) return;

  // Test mode: run every N minutes; otherwise every minute (very light filter)
  const everyMs = (TEST_INTERVAL_MIN > 0 ? TEST_INTERVAL_MIN : 1) * 60 * 1000;

  __timer = setInterval(async () => {
    try {
      const r = await runDailyTick();
      console.log(
        `[motivation-daily] tick processed=${r.processed} sent=${r.sent} skipped=${r.skipped}`
      );
    } catch (e) {
      console.warn("[motivation-daily] tick error:", e?.message || e);
    }
  }, everyMs);

  console.log(
    `[motivation-daily] scheduler started: every ${TEST_INTERVAL_MIN > 0 ? TEST_INTERVAL_MIN + "m (TEST)" : "1m"} (window ±30m, max/day=${MAX_PER_DAY}, rotate=${LOOKBACK_DAYS}d)`
  );
}

// Auto-start in inline mode
if (INLINE) startDailyScheduler();

module.exports = {
  startDailyScheduler,
  runDailyTick,
};
