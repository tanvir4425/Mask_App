// src/new-ui/components/WellnessManager.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  loadSettings,
  loadDaily,
  saveDaily,
  isQuietHours,
  isInGracePeriod,
  pickMessage,
  getLastShownSec,
  setLastShownSec,
  wasLogoutFired,
  markLogoutFired,
  resetLogoutFired,
  clearWellnessRuntime,
} from "../utils/wellness";

/** Optional console logging: localStorage.setItem("wellness.debug","1") */
const DEBUG_FLAG_KEY = "wellness.debug";
function useDebug() {
  try { return localStorage.getItem(DEBUG_FLAG_KEY) === "1"; } catch { return false; }
}

export default function WellnessManager() {
  const debug = useDebug();
  const log = useCallback((...a) => { if (debug) console.log("[wellness]", ...a); }, [debug]);

  // live settings + counters (persisted by the utils)
  const settingsRef     = useRef(loadSettings());
  const dailyRef        = useRef(loadDaily());        // { date, activeSec, count }
  const lastInteractRef = useRef(Date.now());
  const tickIdRef       = useRef(null);

  // warning “don’t show again this session”
  const warnAckRef      = useRef(false);

  // visible UI
  const [banner, setBanner]           = useState(null); // { message }
  const [warnVisible, setWarnVisible] = useState(false);
  const [warnSecLeft, setWarnSecLeft] = useState(0);

  // always clear the “logout fired” latch on a fresh page load (new session)
  useEffect(() => { resetLogoutFired(); }, []);

  // activity listeners (only count when user is “active” and tab visible)
  useEffect(() => {
    const bump = () => { lastInteractRef.current = Date.now(); };
    const onVis = () => { if (document.visibilityState === "visible") bump(); };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    return () => {
      evs.forEach(e => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // listen for settings/test events from Settings page
  useEffect(() => {
    const reload = () => { settingsRef.current = loadSettings(); log("settings reloaded", settingsRef.current); };
    const onStorage = (e) => { if (e?.key && e.key.toLowerCase().includes("wellness")) reload(); };

    const resetAll = () => {
      clearWellnessRuntime();   // daily + lastShown + logoutFired
      resetLogoutFired();
      warnAckRef.current = false;
      setBanner(null);
      setWarnVisible(false);
      setWarnSecLeft(0);
      dailyRef.current = loadDaily();
      log("runtime reset");
    };

    const forceShow = () => {
      const msg = pickMessage(settingsRef.current.goals);
      setBanner({ message: msg });
      log("forced banner:", msg);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("wellness:settingsChanged", reload);
    window.addEventListener("wellness:resetAll", resetAll);
    window.addEventListener("wellness:forceShow", forceShow);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("wellness:settingsChanged", reload);
      window.removeEventListener("wellness:resetAll", resetAll);
      window.removeEventListener("wellness:forceShow", forceShow);
    };
  }, [log]);

  // core loop (1s)
  useEffect(() => {
    const tick = () => {
      const s = settingsRef.current;
      if (!s.enabled) return;
      if (isInGracePeriod(s.graceHours || 0)) return;
      if (isQuietHours(s.quietHours)) return;

      // count “active” seconds
      if (document.visibilityState === "visible") {
        const activeWindowMs = (s.activeInactivityWindowSec || 60) * 1000;
        if (Date.now() - lastInteractRef.current <= activeWindowMs) {
          dailyRef.current.activeSec += 1;
        }
      }

      // persist every ~5s
      if ((dailyRef.current._lastSaveAt || 0) + 5000 < Date.now()) {
        saveDaily(dailyRef.current);
        dailyRef.current._lastSaveAt = Date.now();
      }

      const active = dailyRef.current.activeSec;
      const shown  = getLastShownSec();

      // 1) reminders (rotation limited by maxPerDay + lastShownSec)
      const next = (s.thresholdsSec || []).find(t => t > shown && active >= t);
      if (next !== undefined && (dailyRef.current.count || 0) < (s.maxPerDay || 4)) {
        const msg = pickMessage(s.goals);
        dailyRef.current.count = (dailyRef.current.count || 0) + 1;
        saveDaily(dailyRef.current);
        setLastShownSec(next);
        setBanner({ message: msg });
        log("REMINDER @", next, "sec:", msg);
      }

      // 2) show warning once unless user clicked “Keep reading”
      if (!wasLogoutFired() && !warnAckRef.current && s.warnAtSec && active >= s.warnAtSec) {
        const left = Math.max((s.logoutAtSec || 0) - active, 0);
        setWarnSecLeft(left);
        setWarnVisible(true);
      }

      // if warning is visible, keep updating the countdown
      if (warnVisible && s.logoutAtSec) {
        const left = Math.max(s.logoutAtSec - active, 0);
        if (left !== warnSecLeft) setWarnSecLeft(left);
      }

      // 3) forced logout once
      if (!wasLogoutFired() && s.logoutAtSec && active >= s.logoutAtSec) {
        markLogoutFired();            // mark that we fired (prevents loops)
        clearWellnessRuntime();       // reset counters for next session
        log("FORCE LOGOUT @", active);
        try { localStorage.removeItem("user"); } catch {}
        window.location.href = "/login-new";
      }
    };

    tickIdRef.current = window.setInterval(tick, 1000);
    return () => { if (tickIdRef.current) clearInterval(tickIdRef.current); };
  }, [warnVisible, warnSecLeft, log]);

  // UI handlers
  const onDismissBanner = () => setBanner(null);

  // “Keep reading” → hide warning and don’t show it again this session
  const onKeepReading = () => {
    warnAckRef.current = true;
    setWarnVisible(false);
  };

  // “Logout now” → immediate logout AND reset counters
  const onLogoutNow = () => {
    markLogoutFired();
    clearWellnessRuntime();         // start from zero next login
    try { localStorage.removeItem("user"); } catch {}
    window.location.href = "/login-new";
  };

  if (!banner && !warnVisible) return null;

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center p-4">
      {warnVisible && (
        <div className="pointer-events-auto w-full sm:max-w-lg rounded-2xl shadow-2xl border border-amber-300 bg-amber-50 text-amber-900 p-4 mb-3">
          <div className="font-semibold">Heads up</div>
          <div className="mt-1 text-sm">
            Auto logout in <span className="font-semibold">{Math.max(warnSecLeft, 0)}</span>s. Take a quick break?
          </div>
          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={onKeepReading} className="px-3 py-1.5 rounded-lg bg-zinc-200 text-sm" type="button">
              Keep reading
            </button>
            <button onClick={onLogoutNow} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm" type="button">
              Logout now
            </button>
          </div>
        </div>
      )}

      {banner && (
        <div className="pointer-events-auto w-full sm:max-w-md rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-sm">
            <span className="font-semibold">Wellness reminder</span>
            <span className="text-zinc-500"> · quick break suggested</span>
          </div>
          <div className="mt-1 text-sm">{banner.message}</div>
          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={onDismissBanner} className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm" type="button">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
