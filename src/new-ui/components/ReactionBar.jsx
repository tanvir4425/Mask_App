import React, { useEffect, useMemo, useRef, useState } from "react";

/** tiny helper */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

const REACTIONS = [
  { key: "like",  emoji: "👍", label: "Like"  },
  { key: "love",  emoji: "❤️", label: "Love"  },
  { key: "care",  emoji: "🤗", label: "Care"  },
  { key: "haha",  emoji: "😂", label: "Haha"  },
  { key: "wow",   emoji: "😮", label: "Wow"   },
  { key: "sad",   emoji: "😢", label: "Sad"   },
  { key: "angry", emoji: "😡", label: "Angry" },
];

function getMe() {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
}

export default function ReactionBar({ post, onChange }) {
  const [p, setP] = useState(post);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const pressTimer = useRef(null);
  const btnRef = useRef(null);
  const me = getMe();

  useEffect(() => setP(post), [post]);

  const myReaction = useMemo(() => {
    if (!p?.reactions) return null;
    const r = p.reactions.find((r) => String(r.user) === String(me?._id));
    return r ? r.type : null;
  }, [p?.reactions, me?._id]);

  const counts = useMemo(() => {
    const map = Object.create(null);
    (p?.reactions || []).forEach((r) => { map[r.type] = (map[r.type] || 0) + 1; });
    return map;
  }, [p?.reactions]);

  const top = useMemo(() => {
    const arr = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, n]) => ({ type, n, emoji: REACTIONS.find(r => r.key === type)?.emoji || "🙂" }));
    return arr;
  }, [counts]);

  const total = (p?.reactions || []).length;

  async function react(type) {
    try {
      setError("");
      const updated = await fetchJSON(`/api/posts/${p._id}/react`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setP(updated);
      onChange && onChange(updated);
    } catch (e) {
      setError(e.message || "Failed to react");
    }
  }

  // click (quick): toggle "like" OR remove if already liked
  function onQuickClick() {
    react(myReaction === "like" ? "like" : "like"); // backend toggles if same type
  }

  // long press handling -> open picker
  function startPress() {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setOpen(true), 400); // 400ms long-press
  }
  function endPress() {
    clearTimeout(pressTimer.current);
  }

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!btnRef.current) return setOpen(false);
      if (!btnRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [open]);

  const activeStyle = myReaction
    ? "ring-1 ring-emerald-500/60 bg-emerald-500/10"
    : "hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60";

  return (
    <div className="flex items-center gap-3">
      {/* main button (click to toggle like, long-press for picker) */}
      <div className="relative" ref={btnRef}>
        <button
          type="button"
          className={`px-3 py-1 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 ${activeStyle}`}
          onClick={onQuickClick}
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={endPress}
          onTouchStart={startPress}
          onTouchEnd={endPress}
          title={myReaction ? `You reacted: ${myReaction}` : "React"}
        >
          {myReaction
            ? `${REACTIONS.find(r => r.key === myReaction)?.emoji || "🙂"} Reacted`
            : "Like"}
        </button>

        {/* picker */}
        {open && (
          <div className="absolute z-20 mt-2 left-0 p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-lg">
            <div className="grid grid-cols-7 gap-2">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { react(r.key); setOpen(false); }}
                  className={`text-xl leading-none p-1 rounded-md ${myReaction === r.key ? "ring-2 ring-emerald-500" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
                  title={r.label}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* counters */}
      <div className="text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
        {top.map((t) => (
          <span
            key={t.type}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs
              ${myReaction === t.type
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-zinc-300 dark:border-zinc-700"}`}
            title={t.type}
          >
            <span>{t.emoji}</span>
            <span>x{t.n}</span>
          </span>
        ))}
        <span className="opacity-60">· {total}</span>
      </div>

      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
