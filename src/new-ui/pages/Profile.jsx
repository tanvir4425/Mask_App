// src/new-ui/pages/Profile.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import PostCard from "../PostCard";

/* -------------------------- env-aware fetch helper -------------------------- */
const API_ORIGIN = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
function apiURL(u) { return API_ORIGIN ? `${API_ORIGIN}${u}` : u; }

async function fetchJSON(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(apiURL(url), {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    body: options.body || undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (data && data.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* --------------------------- local current user id -------------------------- */
function getLocalUserLite() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return { id: null };
    const u = JSON.parse(raw);
    return { id: u?.id || u?._id || null };
  } catch {
    return { id: null };
  }
}

/* ---------------------------------- page ---------------------------------- */
export default function ProfilePage() {
  const { id } = useParams();
  const me = getLocalUserLite();

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isSelf, setIsSelf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [u, feed] = await Promise.all([
        fetchJSON(`/api/users/${id}`),
        fetchJSON(`/api/users/${id}/posts`),
      ]);
      setUser(u || null);
      setPosts(Array.isArray(feed) ? feed : []);
      setIsSelf(String(me.id || "") === String(id || ""));
      setErr("");
    } catch (e) {
      setUser(null);
      setPosts([]);
      setIsSelf(false);
      setErr(e?.message || "Failed to load profile");
    }
  }, [id, me.id]);

  useEffect(() => { load(); }, [load]);

  /* ------------------------------ avatar upload ----------------------------- */
  async function handlePickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Image must be ≤ 5 MB."); return; }

    setUploading(true);
    setErr("");

    // Standardize on field name "avatar"
    const fd = new FormData();
    fd.append("avatar", file);

    try {
      // Primary route (Phase 4 backend): POST /api/users/me/avatar
      const data = await fetchJSON(`/api/users/me/avatar`, { method: "POST", body: fd });

      // show instantly (cache bust)
      const url = (data?.avatarURL || data?.avatar || "").replace(/\?t=\d+$/, "");
      if (url) {
        const next = `${url}?t=${Date.now()}`;
        setUser((prev) => ({ ...(prev || {}), avatarURL: next }));
      }

      // refresh profile quietly
      try { await load(); } catch {}
    } catch (eUpload) {
      // Legacy fallbacks if primary route missing
      const endpoints = [
        `/api/users/${id}/avatar`,
        `/api/me/avatar`,
        `/api/users/${id}/photo`,
        `/api/users/${id}/picture`,
      ];
      let ok = false;
      for (const u of endpoints) {
        try {
          const d = await fetchJSON(u, { method: "POST", body: fd });
          const url =
            d?.avatarURL || d?.avatar || d?.user?.avatarURL || d?.user?.avatar || "";
          if (url) {
            const next = `${url}?t=${Date.now()}`;
            setUser((prev) => ({ ...(prev || {}), avatarURL: next }));
          }
          ok = true;
          break;
        } catch {}
      }
      if (!ok) setErr(eUpload?.data?.message || eUpload?.message || "Upload failed. Please try again.");
    } finally {
      try { e.target.value = ""; } catch {}
      setUploading(false);
    }
  }

  /* ------------------------------- render bits ------------------------------ */
  const displayName = user?.pseudonym || user?.name || "User";
  const handle =
    user?.username ||
    user?.handle ||
    (user?.email ? user.email.split("@")[0] : "") ||
    (user?.pseudonym ? user.pseudonym.toLowerCase().replace(/\s+/g, "_") : "");

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Profile</div>
          <div className="text-sm text-zinc-500">User posts &amp; info</div>
        </div>
      </div>

      {!user && <div className="px-4 py-8 text-zinc-500">Loading…</div>}

      {user && (
        <div className="px-2 py-3 space-y-3">
          {/* Header card */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 flex items-center gap-3">
            <div className="relative">
              <img
                src={user.avatarURL || "/images/avatar-placeholder.png"}
                alt=""
                className="w-16 h-16 rounded-full object-cover bg-zinc-200 dark:bg-zinc-800"
              />
              {isSelf && (
                <div className="absolute -bottom-1 -right-1">
                  <label
                    htmlFor="avatar-input"
                    className={`px-2 py-1 rounded-lg text-xs font-medium cursor-pointer border ${
                      uploading
                        ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-600"
                        : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    } border-zinc-200 dark:border-zinc-700 shadow-sm`}
                    title={uploading ? "Uploading…" : "Change photo"}
                  >
                    {uploading ? "…" : "Edit"}
                  </label>
                  <input
                    id="avatar-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePickAvatar}
                    disabled={uploading}
                  />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-xl font-semibold truncate">{displayName}</div>
              <div className="text-sm text-zinc-500 truncate">@{handle}</div>
              {err && <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">{err}</div>}
            </div>
          </div>

          {/* Posts */}
          {posts.length === 0 && (
            <div className="text-sm text-zinc-500">No posts yet.</div>
          )}
          {posts.map((p) => (
            <PostCard key={p._id || p.id} post={p} />
          ))}
        </div>
      )}
    </>
  );
}
