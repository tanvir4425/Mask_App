import React, { useEffect, useMemo, useState, useContext } from "react";
import { X, Image as ImageIcon, Smile } from "lucide-react";
import { createPost } from "./api";
import { useToast } from "../context/ToastContext";

// Lightweight current user reader (display only)
function useCurrentUserLite() {
  return useMemo(() => {
    try {
      const keys = ["user", "authUser", "profile", "currentUser"];
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const u = JSON.parse(raw);
        return {
          name: u?.pseudonym || u?.username || u?.name || u?.displayName || null,
          avatar: u?.avatarURL || u?.avatar || u?.photoURL || u?.imageUrl || null,
        };
      }
    } catch {}
    return { name: null, avatar: null };
  }, []);
}

export default function Composer({ onPosted }) {
  const user = useCurrentUserLite();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // useToast hook from your context
  const toastApi = useToast(); // { addToast, removeToast }
  const notify = (type, message) =>
    toastApi?.addToast ? toastApi.addToast(message, type) : alert(message);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit() {
    const body = text.trim();
    if (!body) return;

    setLoading(true);
    setErr("");
    try {
      await createPost({ text: body });
      setText("");
      setOpen(false);
      onPosted && onPosted();
      notify("success", "Posted!");
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Could not create post. Please try again.";
      setErr(msg);
      notify("error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Composer + options row (Facebook-like trigger) */}
      <div className="px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 sticky top-[92px] z-10">
        <div className="flex gap-3 py-3">
          <div className="w-12 h-12 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0 overflow-hidden">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-left px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
          >
            What’s on your mind{user.name ? `, ${user.name}` : ""}?
          </button>
          <button
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-full bg-sky-500 text-white font-semibold hover:opacity-90 transition"
          >
            Post
          </button>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 pb-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ImageIcon size={20} className="text-emerald-500" />
              <span className="text-sm font-medium">Photo/video</span>
            </button>
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Smile size={20} className="text-amber-500" />
              <span className="text-sm font-medium">Feeling/activity</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl border border-zinc-800">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="w-6" />
                <div className="font-extrabold">Create post</div>
                <button
                  aria-label="Close"
                  onClick={() => !loading && setOpen(false)}
                  className="p-1 rounded-full hover:bg-zinc-800"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="px-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="leading-tight">
                    <div className="font-semibold">{user.name || " "}</div>
                  </div>
                </div>

                <textarea
                  autoFocus
                  rows={6}
                  placeholder="What's on your mind?"
                  className="mt-4 w-full resize-none bg-transparent outline-none placeholder:text-zinc-500 text-xl"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={loading}
                />

                {err ? (
                  <div className="mb-3 text-sm text-rose-400 bg-rose-950/40 px-3 py-2 rounded-lg border border-rose-900/40">
                    {err}
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="px-4 pb-4 pt-2 flex items-center justify-end gap-3">
                <button
                  onClick={() => !loading && setOpen(false)}
                  className="px-4 py-2 rounded-full border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!text.trim() || loading}
                  className="px-5 py-2 rounded-full bg-sky-500 text-white font-semibold disabled:opacity-50"
                >
                  {loading ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
