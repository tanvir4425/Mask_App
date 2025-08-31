// src/new-ui/components/TrustBadge.jsx

import React, { useEffect, useState } from "react";
import { getTrustSnapshot } from "../api"; // ✅ correct path

/**
 * Tiny pill showing the current trust tier & score.
 * - subjectType: "user" | "page"
 * - subjectId: Mongo id string
 * - hideWhenEmpty: don't render until a snapshot exists (default true)
 */
export default function TrustBadge({
  subjectType = "user",
  subjectId,
  hideWhenEmpty = true,
  className = "",
}) {
  const [snap, setSnap] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const data = await getTrustSnapshot(subjectType, subjectId);
        if (!alive) return;
        setSnap(data); // can be null if no snapshot yet
      } catch {
        // ignore—badge is optional
      } finally {
        if (alive) setLoaded(true);
      }
    }
    if (subjectId) run();
    return () => {
      alive = false;
    };
  }, [subjectType, subjectId]);

  if (!loaded && hideWhenEmpty) return null;
  if (!snap && hideWhenEmpty) return null;

  const tier = snap?.tier || "provisional";
  const score = typeof snap?.score === "number" ? snap.score : 50;

  const tierLabel =
    tier === "high" ? "High"
    : tier === "normal" ? "Normal"
    : tier === "low" ? "Low"
    : "Provisional";

  const color =
    tier === "high" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
    : tier === "low" ? "border-rose-500 text-rose-600 dark:text-rose-400"
    : tier === "normal" ? "border-zinc-400 text-zinc-600 dark:text-zinc-300"
    : "border-zinc-400 text-zinc-500 dark:text-zinc-400"; // provisional

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-xs ${color} ${className}`}
      title="Trust builds as more check-worthy posts are reviewed."
    >
      <span>{tierLabel}</span>
      <span className="opacity-80">•</span>
      <span>{score}%</span>
    </span>
  );
}
