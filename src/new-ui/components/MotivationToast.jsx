// src/new-ui/components/MotivationToast.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";

/** very light fetch helper with cookies */
async function getJSON(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return await res.json(); } catch { return {}; }
}

/** Read any array-like response: {items:[...]}, {notifications:[...]}, or plain [] */
function readList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  return [];
}

const LAST_SEEN_KEY = "motivation.lastSeenId.v1";
const DISMISS_UNTIL_KEY = "motivation.dismissUntil.v1";

export default function MotivationToast() {
  const [notif, setNotif] = useState(null);     // { _id, message, meta:{author,tags,tone}, createdAt }
  const [visible, setVisible] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const pollRef = useRef(null);

  // Hide if user snoozed "for today"
  const snoozed = useMemo(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_UNTIL_KEY) || 0);
      return until > Date.now();
    } catch { return false; }
  }, []);

  // ---- polling for newest motivation notification ----
  async function checkLatest() {
    if (snoozed || visible) return;

    // NOTE: if your backend supports filtering, you can call:
    //   /api/notifications?limit=10&type=motivation
    // but we'll be robust and just scan the latest few.
    let list = [];
    try {
      const data = await getJSON("/api/notifications?limit=10");
      list = readList(data);
    } catch { /* ignore network errors */ }

    const latest = list.find(n => (n?.type || n?.kind) === "motivation");
    if (!latest) return;

    let lastSeen = "";
    try { lastSeen = localStorage.getItem(LAST_SEEN_KEY) || ""; } catch {}

    if (String(latest._id || latest.id) !== String(lastSeen)) {
      setNotif({
        _id: String(latest._id || latest.id || ""),
        message: latest.message || "",
        meta: latest.meta || {},
        createdAt: latest.createdAt || Date.now(),
      });
      setVisible(true);
      setCanClose(false);
      setCountdown(5);
    }
  }

  // Start polling every 15s (lightweight)
  useEffect(() => {
    checkLatest(); // kick once on mount
    pollRef.current = setInterval(checkLatest, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snoozed]);

  // 5s lockout before close is enabled
  useEffect(() => {
    if (!visible) return;
    setCanClose(false);
    setCountdown(5);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); setCanClose(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [visible]);

  function closeNow() {
    if (!notif) return setVisible(false);
    try { localStorage.setItem(LAST_SEEN_KEY, notif._id || ""); } catch {}
    setVisible(false);
  }

  function dismissForToday() {
    // hide until local midnight
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    try { localStorage.setItem(DISMISS_UNTIL_KEY, String(d.getTime())); } catch {}
    closeNow();
  }

  if (!visible || !notif) return null;

  const tone = String(notif.meta?.tone || "inspiration");
  const author = notif.meta?.author;
  const tags = Array.isArray(notif.meta?.tags) ? notif.meta.tags : [];

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none p-4">
      <div
        className="pointer-events-auto w-full sm:max-w-sm rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 animate-in slide-in-from-bottom-2"
        role="dialog"
        aria-live="polite"
      >
        <div className="text-xs uppercase tracking-wide mb-1 text-zinc-500">
          {tone === "humor" ? "A light joke for you" : "Daily motivation"}
        </div>

        <div className="text-base leading-relaxed">
          {notif.message}
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          {author ? <>— {author}</> : null}
          {tags.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 4).map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">{t}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm"
            onClick={closeNow}
            disabled={!canClose}
            title={!canClose ? `Available in ${countdown}s` : "Close"}
          >
            {canClose ? "Close" : `Close in ${countdown}s`}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm"
            onClick={dismissForToday}
            disabled={!canClose}
            title={!canClose ? "Available after 5s" : "Hide until tomorrow"}
          >
            Not today
          </button>
          <div className="flex-1" />
          <span className="text-xs text-zinc-500">
            {new Date(notif.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}
