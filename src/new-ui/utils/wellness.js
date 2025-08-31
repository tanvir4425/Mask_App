// Local, client-only wellness defaults + helpers (no backend required)

const SETTINGS_KEY = "wellness.settings.v1";
const DAILY_KEY = "wellness.daily.v1";
const LAST_SHOWN_SEC_KEY = "wellness.lastShownSec.v1";
const FIRST_SEEN_KEY = "wellness.firstSeenAt.v1";
const LOGOUT_FIRED_KEY = "wellness.logoutFired.v1";
const POLICY_HASH_KEY = "wellness.policyHash.v1";

// ----------------------- Timings (prod vs test) ----------------------- //
// PROD policy (minutes -> seconds)
const PROD_THRESHOLDS = [3 * 60, 5 * 60]; // 15m, 30m reminders
const PROD_WARN_AT = 6 * 60;               // 44m warning
const PROD_LOGOUT_AT = 7 * 60;             // 45m force logout

// TEST policy (seconds)
const TEST_THRESHOLDS = [10, 30];           // 10s, 30s reminders
const TEST_WARN_AT = 45;                    // 45s warning
const TEST_LOGOUT_AT = 60;                  // 60s force logout

// ---------------------------- Defaults ---------------------------- //
export const DEFAULTS = {
  enabled: true,
  // When ON, we use the short test timings above.
  useTestTimings: false,

  // Consider user "active" if they interacted within this many seconds
  activeInactivityWindowSec: 60,

  // These are placeholders; effective values come from getEffectiveTimings()
  thresholdsSec: PROD_THRESHOLDS,
  warnAtSec: PROD_WARN_AT,
  logoutAtSec: PROD_LOGOUT_AT,

  // Daily limits (max reminders shown per day)
  maxPerDay: 20,

  // Quiet hours local time (no reminders). Make start==end to disable.
  quietHours: { start: 0, end: 0 }, // disabled by default

  // Focus areas for messages
  goals: { stretch: true, eyes: true, hydrate: true, breathe: true },
};

// Short rotating messages by goal
const MESSAGES = {
  stretch: [
    "Quick stretch break? Roll your shoulders and stand up for 30s.",
    "Uncross your legs and stretch calves for 20s.",
    "Stand tall, reach overhead, slow inhale—nice.",
  ],
  eyes: [
    "Eye break: look 20 ft away for 20s (20-20-20 rule).",
    "Blink slowly 10 times—your eyes will thank you.",
    "Let your focus shift to something far away for a moment.",
  ],
  hydrate: [
    "Sip some water—tiny habit, big payoff.",
    "Hydration nudge: a few sips right now?",
    "Water check: refill and sip.",
  ],
  breathe: [
    "Take 3 slow breaths: in for 4, out for 6.",
    "Box breathing: 4-4-4-4 for one round.",
    "Soft belly breathing for 20s—reset.",
  ],
};

// --------------------- Effective timings / policy --------------------- //
export function getEffectiveTimings(s) {
  const test = !!s.useTestTimings;
  return {
    thresholdsSec: test ? TEST_THRESHOLDS : PROD_THRESHOLDS,
    warnAtSec: test ? TEST_WARN_AT : PROD_WARN_AT,
    logoutAtSec: test ? TEST_LOGOUT_AT : PROD_LOGOUT_AT,
  };
}

function hashPolicyFromSettings(s) {
  const eff = getEffectiveTimings(s);
  return JSON.stringify({
    enabled: !!s.enabled,
    thresholdsSec: eff.thresholdsSec,
    warnAtSec: eff.warnAtSec,
    logoutAtSec: eff.logoutAtSec,
    quiet: s.quietHours || { start: 0, end: 0 },
  });
}

export function ensurePolicyUpToDate(s) {
  try {
    const current = hashPolicyFromSettings(s);
    const saved = localStorage.getItem(POLICY_HASH_KEY);
    if (saved !== current) {
      // Policy changed → reset today & markers so reminders can fire fresh.
      localStorage.removeItem(DAILY_KEY);
      localStorage.removeItem(LAST_SHOWN_SEC_KEY);
      localStorage.removeItem(LOGOUT_FIRED_KEY);
      localStorage.setItem(POLICY_HASH_KEY, current);
    }
  } catch {}
}

// ------------------------------- Settings I/O ------------------------------ //
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    // Always compute the effective timings onto the settings object
    const eff = getEffectiveTimings(s);
    s.thresholdsSec = eff.thresholdsSec;
    s.warnAtSec = eff.warnAtSec;
    s.logoutAtSec = eff.logoutAtSec;
    return s;
  } catch {
    return { ...DEFAULTS, ...getEffectiveTimings(DEFAULTS) };
  }
}

export function saveSettings(s) {
  try {
    // Only persist primitive settings; effective timings are derived
    const toSave = { ...s };
    delete toSave.thresholdsSec;
    delete toSave.warnAtSec;
    delete toSave.logoutAtSec;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
    // Let listeners (same-tab) know to reload
    window.dispatchEvent(new Event("wellness:settingsChanged"));
  } catch {}
}

// ------------------------------ Daily counters ----------------------------- //
export function loadDaily() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || "null") || {};
    if (raw.date !== today) {
      const fresh = { date: today, count: 0, activeSec: 0 };
      localStorage.setItem(DAILY_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return raw;
  } catch {
    const fresh = { date: today, count: 0, activeSec: 0 };
    localStorage.setItem(DAILY_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

export function saveDaily(d) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {}
}

// Runtime helpers
export function getLastShownSec() {
  try { return Number(localStorage.getItem(LAST_SHOWN_SEC_KEY) || "0"); } catch { return 0; }
}
export function setLastShownSec(sec) {
  try { localStorage.setItem(LAST_SHOWN_SEC_KEY, String(sec)); } catch {}
}

export function markLogoutFired() {
  try { localStorage.setItem(LOGOUT_FIRED_KEY, "1"); } catch {}
}
export function resetLogoutFired() {
  try { localStorage.removeItem(LOGOUT_FIRED_KEY); } catch {}
}
export function wasLogoutFired() {
  try { return localStorage.getItem(LOGOUT_FIRED_KEY) === "1"; } catch { return false; }
}

// Hard reset used by UI buttons
export function clearWellnessRuntime() {
  try {
    localStorage.removeItem(DAILY_KEY);
    localStorage.removeItem(LAST_SHOWN_SEC_KEY);
    localStorage.removeItem(LOGOUT_FIRED_KEY);
  } catch {}
}

// ------------------------------- Quiet hours --------------------------------
export function isQuietHours(quiet) {
  const start = Number(quiet?.start ?? 22);
  const end = Number(quiet?.end ?? 7);
  const hour = new Date().getHours();
  if (start === end) return false; // disabled
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps midnight
}

// ------------------------------ Grace handling ------------------------------ //
export function ensureFirstSeenAt() {
  try {
    const existing = localStorage.getItem(FIRST_SEEN_KEY);
    if (existing) return Number(existing);
    const userRaw = localStorage.getItem("user");
    let created = null;
    if (userRaw) {
      try { created = JSON.parse(userRaw)?.createdAt || null; } catch {}
    }
    const t = created ? new Date(created).getTime() : Date.now();
    localStorage.setItem(FIRST_SEEN_KEY, String(t));
    return t;
  } catch {
    return Date.now();
  }
}

export function isInGracePeriod(hours) {
  const seen = ensureFirstSeenAt();
  return Date.now() - seen < hours * 3600 * 1000;
}

// ------------------------------- Message pick ------------------------------ //
export function pickMessage(goals) {
  const enabled = Object.keys(goals || {}).filter((k) => goals[k]);
  const pool = enabled.length
    ? enabled.flatMap((k) => MESSAGES[k] || [])
    : Object.values(MESSAGES).flat();
  if (!pool.length) return "Time for a quick reset?";
  return pool[Math.floor(Math.random() * pool.length)];
}
