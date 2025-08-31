// src/new-ui/components/CoverEditable.jsx
import React, { useRef, useState } from "react";

export default function CoverEditable({ url, canEdit, onUpload, onRemove, height = 180 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handlePick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { await onUpload?.(f); }
    finally { setBusy(false); e.target.value = ""; }
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
      style={{ height }}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
          No cover yet
        </div>
      )}

      {canEdit && (
        <div className="absolute right-3 bottom-3 flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePick}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 text-sm"
          >
            {busy ? "Uploading…" : "Change cover"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 text-sm"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
