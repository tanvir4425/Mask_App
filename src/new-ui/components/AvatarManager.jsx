import React, { useEffect, useState } from "react";
import { uploadAvatar, deleteAvatar, getAvatarHistory } from "../api";
import { useToast } from "../../context/ToastContext";

export default function AvatarManager() {
  const { addToast } = useToast();
  const [status, setStatus] = useState({ avatarURL: "", history: [], canChange: true, nextChangeAt: null });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const data = await getAvatarHistory(5);
      setStatus(data);
    } catch {
      setStatus((s) => s);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return addToast("Please select an image", "error");
    if (file.size > 5 * 1024 * 1024) return addToast("Max 5MB", "error");

    setBusy(true);
    try {
      const res = await uploadAvatar(file);
      addToast("Profile photo updated", "success");
      setStatus((s) => ({ ...s, avatarURL: res.avatarURL, canChange: res.canChange, nextChangeAt: res.nextChangeAt }));
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update photo";
      addToast(msg, "error");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onDelete() {
    if (!window.confirm("Remove your profile photo?")) return;
    setBusy(true);
    try {
      const res = await deleteAvatar();
      addToast("Profile photo removed", "success");
      setStatus((s) => ({ ...s, avatarURL: "", canChange: res.canChange, nextChangeAt: res.nextChangeAt }));
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to remove photo";
      addToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const nextText = status.nextChangeAt
    ? new Date(status.nextChangeAt).toLocaleString()
    : null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden">
          {status.avatarURL ? <img src={status.avatarURL} alt="" className="w-full h-full object-cover" /> : null}
        </div>

        <div className="flex-1">
          <div className="font-semibold">Profile photo</div>
          {!status.canChange && nextText && (
            <div className="text-xs text-zinc-500 mt-1">
              You can change again on <span className="font-medium">{nextText}</span>
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <label className={`px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
              Change photo
              <input type="file" className="hidden" accept="image/*" onChange={onPick} disabled={busy || !status.canChange} />
            </label>
            <button
              onClick={onDelete}
              disabled={busy || !status.avatarURL}
              className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm disabled:opacity-50"
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {status.history?.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Previous photos</div>
          <div className="flex gap-2 flex-wrap">
            {status.history.map((h, i) => (
              <div key={i} className="w-14 h-14 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                <img src={h.url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
