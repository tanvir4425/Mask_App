import React, { useRef, useState } from "react";
import {
  uploadPageCover, deletePageCover,
  uploadGroupCover, deleteGroupCover,
} from "../api";

export default function CoverHeader({
  type,          // "page" | "group"
  id,            // pageId or groupId
  coverURL,      // string or ""
  isAdmin,       // boolean
  onChange,      // (newURL:string) => void
  className = "",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handlePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      let result;
      if (type === "page") result = await uploadPageCover(id, file);
      else result = await uploadGroupCover(id, file);
      onChange?.(result.coverURL || "");
    } catch (err) {
      alert(err?.message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!window.confirm("Remove cover image?")) return;
    setBusy(true);
    try {
      if (type === "page") await deletePageCover(id);
      else await deleteGroupCover(id);
      onChange?.("");
    } catch (err) {
      alert(err?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-200/60 dark:bg-zinc-800/60 h-48 md:h-56 lg:h-64 ${className}`}>
      {coverURL ? (
        <img
          src={coverURL}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
          No cover yet
        </div>
      )}

      {isAdmin && (
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
            className="px-3 py-1.5 rounded-lg bg-white/90 hover:bg-white text-sm border border-zinc-200 shadow-sm disabled:opacity-60"
            title="Change cover"
          >
            {busy ? "Uploading…" : "Change cover"}
          </button>
          {coverURL ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="px-3 py-1.5 rounded-lg bg-white/90 hover:bg-white text-sm border border-zinc-200 shadow-sm disabled:opacity-60"
              title="Remove cover"
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
