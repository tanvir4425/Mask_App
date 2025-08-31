// src/new-ui/components/MotivationModal.jsx

import React, { useEffect, useRef, useState } from "react";

/**
 * Daily motivation/humor modal.
 * - Fetches latest motivation notification (last one created by the worker)
 * - Shows once per notification id (per browser) using localStorage
 * - Close button unlocks after 5 seconds (countdown shown)
 *
 * Backends it tries (in this order):
 *   1) GET /api/notifications/latest-motivation  -> { _id, type, message, meta, createdAt }
 *   2) GET /api/notifications?type=motivation&limit=1 -> { items: [...] }
 * Both calls are safe: if missing, we just no-op.
 */

const DISMISSED_PREFIX = "motivation.dismissed.v1."; // per-notification local flag

async function fetchLatestMotivation() {
  // Try dedicated endpoint first
  try {
    const r = await fetch("/api/notifications/latest-motivation", { credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      if (j && (j._id || j.id)) return j;
    }
  } catch {}

  // Fallback: generic notifications list filtered by type
  try {
    const r = await fetch("/api/notifications?type=motivation&limit=1", { credentials: "include" });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j?.items) && j.items[0]) return j.items[0];
      if (Array.isArray(j) && j[0]) return j[0]; // some backends return an array
    }
  } catch {}

  return null;
}

function isRecently(dts, hours = 48) {
  if (!dts) return false;
  const t = new Date(dts).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < hours * 3600 * 1000;
}

export default function MotivationModal() {
  const [notif, setNotif] = useState(null); // { _id, message, meta, createdAt }
  const [open, setOpen] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [count, setCount] = useState(5);
  const timerRef = useRef(null);
  const unlockRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const n = await fetchLatestMotivation();
      if (!n) return;
      const id = n._id || n.id;
      const dismissedKey = DISMISSED_PREFIX + id;

      // Don't show if user already dismissed this exact notification in this browser
      try {
        if (localStorage.getItem(dismissedKey)) return;
      } catch {}

      // Only show if it’s fairly recent (safety)
      if (!isRecently(n.createdAt, 48)) return;

      if (!ignore) {
        setNotif({
          id,
          text: n.message || n.text || "",
          tone: n.meta?.tone || n.tone || "inspiration",
          author: n.meta?.author || n.author || "",
          tags: n.meta?.tags || n.tags || [],
          createdAt: n.createdAt,
        });

        // Slight delay so we don’t pop over first paint jank
        setTimeout(() => setOpen(true), 400);

        // 5s lock on close
        setCanClose(false);
        setCount(5);
        let secs = 5;
        timerRef.current = setInterval(() => {
          secs -= 1;
          setCount(secs);
          if (secs <= 0) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            setCanClose(true);
          }
        }, 1000);

        // absolute unlock guard (in case tab sleeps)
        unlockRef.current = setTimeout(() => setCanClose(true), 6500);
      }
    }

    load();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (unlockRef.current) clearTimeout(unlockRef.current);
    };
  }, []);

  if (!open || !notif) return null;

  const title = notif.tone === "humor" ? "A quick smile" : "Daily motivation";

  async function markReadRemote() {
    // Optional best-effort mark as read if your backend supports it
    try {
      await fetch(`/api/notifications/${notif.id}/read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {}
  }

  function dismiss() {
    // remember this id locally so we don’t show again
    try { localStorage.setItem(DISMISSED_PREFIX + notif.id, String(Date.now())); } catch {}
    markReadRemote();
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={() => { /* backdrop does nothing during lock */ }} />

      {/* card */}
      <div
        className="relative w-[min(92vw,640px)] rounded-3xl border border-zinc-200 dark:border-zinc-800
                   shadow-2xl bg-white/95 dark:bg-zinc-950/95 backdrop-blur p-5 animate-in fade-in zoom-in-105"
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/15">
            <span className="text-amber-600">★</span>
          </div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="ml-auto text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">
            {notif.tone}
          </div>
        </div>

        <div className="text-[15px] leading-relaxed">
          {notif.text}
        </div>
        {notif.author ? (
          <div className="mt-2 text-sm text-zinc-500">— {notif.author}</div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          {!canClose ? (
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm cursor-wait"
              disabled
              title="You can close in a moment"
            >
              Close ( {count}s )
            </button>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm"
            >
              Close
            </button>
          )}

          <a
            href="/notifications"
            className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm"
          >
            See all
          </a>
        </div>
      </div>
    </div>
  );
}
