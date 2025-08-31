// src/new-ui/components/FactcheckSheet.jsx

import React, { useMemo } from "react";

/**
 * Slide-in fact-check details panel.
 * Props:
 *  - open       : boolean
 *  - onClose    : () => void
 *  - factcheck  : { claim, verdict, confidence, evidence: [{title,url,stance}], model } | null
 */
export default function FactcheckSheet({ open, onClose, factcheck }) {
  const confPct = Math.round((Number(factcheck?.confidence) || 0) * 100);

  const verdictMeta = useMemo(() => {
    const v = factcheck?.verdict || "unverified";
    switch (v) {
      case "true":        return { label: "Likely true",        color: "text-emerald-600 dark:text-emerald-400" };
      case "false":       return { label: "Likely false",       color: "text-rose-600 dark:text-rose-400" };
      case "misleading":  return { label: "Potentially misleading", color: "text-amber-600 dark:text-amber-400" };
      case "outdated":    return { label: "Outdated",           color: "text-amber-600 dark:text-amber-400" };
      case "satire":      return { label: "Satire / parody",    color: "text-zinc-600 dark:text-zinc-300" };
      case "opinion":     return { label: "Opinion / not checkable", color: "text-zinc-600 dark:text-zinc-300" };
      default:            return { label: "Context suggested",  color: "text-sky-600 dark:text-sky-400" }; // unverified + default
    }
  }, [factcheck]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl
        transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-label="Post context"
      >
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="font-semibold">Post context</div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="p-4 space-y-4 text-[15px]">
          {/* Verdict + confidence */}
          <div className="space-y-1">
            <div className={`font-medium ${verdictMeta.color}`}>{verdictMeta.label}</div>
            <div className="text-sm text-zinc-500">
              Confidence: <span className="font-medium text-zinc-700 dark:text-zinc-300">{confPct}%</span>
            </div>
            {factcheck?.model ? (
              <div className="text-xs text-zinc-400">Model: {factcheck.model}</div>
            ) : null}
          </div>

          {/* Claim */}
          {factcheck?.claim ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Claim</div>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/40">
                {factcheck.claim}
              </div>
            </div>
          ) : null}

          {/* Evidence */}
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Evidence</div>
            {Array.isArray(factcheck?.evidence) && factcheck.evidence.length > 0 ? (
              <ul className="space-y-2">
                {factcheck.evidence.map((ev, idx) => (
                  <li key={idx} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <div className="font-medium">
                      {ev.url ? (
                        <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {ev.title || ev.url}
                        </a>
                      ) : (
                        <span>{ev.title || "Evidence"}</span>
                      )}
                    </div>
                    {ev.snippet ? (
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{ev.snippet}</div>
                    ) : null}
                    {ev.stance ? (
                      <div className="mt-1 text-xs text-zinc-500">Stance: {ev.stance}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500">No external sources attached yet.</div>
            )}
          </div>

          {/* Why am I seeing this? */}
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/40 p-3 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Why am I seeing this?
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              Posts that look like factual claims may receive a context label. This helps readers
              evaluate content. Labels don’t delete posts and can be reviewed by moderators.
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
