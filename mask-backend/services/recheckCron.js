// mask-backend/services/recheckCron.js
require("dotenv").config();

const FactCheckResult = require("../models/FactCheckResult");
const { enqueueFactCheck } = require("./factcheckWorker");

function num(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : def;
}

/**
 * Re-check scheduler:
 * - Every N minutes, find posts whose *latest* verdict is "unverified"
 *   and older than AGE_HOURS, and re-enqueue them for checking.
 */
function startRecheckCron() {
  if (process.env.TRUST_ENABLED === "0") {
    console.log("[recheck] TRUST_ENABLED=0 → cron disabled");
    return;
  }
  if (!enqueueFactCheck) {
    console.log("[recheck] enqueueFactCheck not available → cron disabled");
    return;
  }

  const INTERVAL_MIN = num("TRUST_RECHECK_INTERVAL_MINUTES", 60); // how often to scan
  const AGE_HOURS = num("TRUST_RECHECK_AGE_HOURS", 24);           // recheck if older than this
  const BATCH = num("TRUST_RECHECK_BATCH", 50);                    // limit per tick

  async function tick() {
    try {
      const threshold = new Date(Date.now() - AGE_HOURS * 3600_000);
      // Latest result per post:
      const rows = await FactCheckResult.aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$post",
            latestVerdict: { $first: "$verdict" },
            latestAt: { $first: "$createdAt" },
          },
        },
        { $match: { latestVerdict: "unverified", latestAt: { $lte: threshold } } },
        { $limit: BATCH },
      ]);

      if (!rows.length) {
        console.log(`[recheck] none to recheck (older than ${AGE_HOURS}h)`);
        return;
      }

      console.log(`[recheck] re-enqueueing ${rows.length} posts for fact-check…`);
      for (const r of rows) {
        try {
          enqueueFactCheck(String(r._id));
        } catch (e) {
          console.warn("[recheck] enqueue failed:", e?.message || e);
        }
      }
    } catch (e) {
      console.warn("[recheck] tick failed:", e?.message || e);
    }
  }

  // Start after a short delay, then on an interval
  setTimeout(tick, 10_000);
  setInterval(tick, INTERVAL_MIN * 60_000);

  console.log(
    `[recheck] started (interval=${INTERVAL_MIN}m, age>=${AGE_HOURS}h, batch=${BATCH})`
  );
}

module.exports = { startRecheckCron };
