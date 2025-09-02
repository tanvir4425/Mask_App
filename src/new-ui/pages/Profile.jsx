// src/new-ui/pages/Profile.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PostCard from "../PostCard";

import {
  createOrGetConversationWith,
  getFriendRequests,           // used best-effort only
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
} from "../api";

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
const sameId = (a, b) => String(a ?? "") === String(b ?? "") && String(a ?? "") !== "";

// messages base in your app:
const MESSAGES_BASE = "/app/messages";

/* ---------------------------------- page ---------------------------------- */
export default function ProfilePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = getLocalUserLite();

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isSelf, setIsSelf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  // relationship ui state: 'none' | 'outgoing' | 'incoming' | 'friends'
  const [rel, setRel] = useState("none");
  const [relReqId, setRelReqId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [u, feed] = await Promise.all([
        fetchJSON(`/api/users/${id}`),
        fetchJSON(`/api/users/${id}/posts`),
      ]);
      setUser(u || null);
      setPosts(Array.isArray(feed) ? feed : []);
      const self = sameId(me.id, id);
      setIsSelf(self);
      setErr("");

      // best-effort relationship detection (don’t block UI)
      if (!self && u?._id) {
        await detectRelationship(u._id);
      } else {
        setRel("none");
        setRelReqId(null);
      }
    } catch (e) {
      setUser(null);
      setPosts([]);
      setIsSelf(false);
      setRel("none");
      setRelReqId(null);
      setErr(e?.message || "Failed to load profile");
    }
  }, [id, me.id]);

  async function detectRelationship(targetUserId) {
    try {
      // 1) check if already friends via /me (if your backend exposes it)
      try {
        const meFull = await fetchJSON(`/api/users/me`);
        const friendIds = (meFull?.friends || meFull?.friendIds || []).map(x => String(x?._id || x));
        if (friendIds.includes(String(targetUserId))) {
          setRel("friends"); setRelReqId(null); return;
        }
      } catch {}

      // 2) look at incoming requests (your API’s friend-requests page shows incoming)
      try {
        const incoming = await getFriendRequests().catch(() => []);
        const inc = (incoming || []).find(r =>
          sameId(r?.from?._id || r?.fromId, targetUserId) ||
          sameId(r?.userId, targetUserId) // some UIs flatten sender to userId
        );
        if (inc) { setRel("incoming"); setRelReqId(inc._id || inc.id || null); return; }
      } catch {}

      // fallback
      setRel("none"); setRelReqId(null);
    } catch {
      setRel("none"); setRelReqId(null);
    }
  }

  useEffect(() => { load(); }, [load]);

  /* ------------------------------ avatar upload ----------------------------- */
  async function handlePickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("Image must be ≤ 5 MB."); return; }

    setUploading(true);
    setErr("");

    const fd = new FormData();
    fd.append("avatar", file);

    try {
      const data = await fetchJSON(`/api/users/me/avatar`, { method: "POST", body: fd });
      const url = (data?.avatarURL || data?.avatar || "").replace(/\?t=\d+$/, "");
      if (url) setUser((prev) => ({ ...(prev || {}), avatarURL: `${url}?t=${Date.now()}` }));
      try { await load(); } catch {}
    } catch (eUpload) {
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
          const url = d?.avatarURL || d?.avatar || d?.user?.avatarURL || d?.user?.avatar || "";
          if (url) setUser((prev) => ({ ...(prev || {}), avatarURL: `${url}?t=${Date.now()}` }));
          ok = true; break;
        } catch {}
      }
      if (!ok) setErr(eUpload?.data?.message || eUpload?.message || "Upload failed. Please try again.");
    } finally {
      try { e.target.value = ""; } catch {}
      setUploading(false);
    }
  }

  /* -------------------------- actions: message / friend --------------------- */
  async function onMessage() {
    if (!user?._id) return;
    try {
      // try to create/open a conversation first
      const conv = await createOrGetConversationWith(user._id).catch(() => null);
      if (conv?.id) {
        nav(`${MESSAGES_BASE}/${conv.id}`);
      } else {
        // fall back to “start chat” flow your MessagesPage supports
        nav(`${MESSAGES_BASE}?to=${user._id}`);
      }
    } catch {
      nav(`${MESSAGES_BASE}?to=${user._id}`);
    }
  }

  async function onAddFriend() {
    if (!user?._id) return;
    try {
      const res = await sendFriendRequest(user._id);
      // optimistic UI: flip to "outgoing"
      setRel("outgoing");
      setRelReqId(res?.id || res?._id || null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to send request");
    }
  }

  async function onCancelRequest() {
    try {
      if (relReqId) await declineFriendRequest(relReqId);
      setRel("none"); setRelReqId(null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to cancel");
    }
  }

  async function onAccept() {
    try {
      if (relReqId) await acceptFriendRequest(relReqId);
      setRel("friends"); setRelReqId(null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to accept");
    }
  }

  async function onDecline() {
    try {
      if (relReqId) await declineFriendRequest(relReqId);
      setRel("none"); setRelReqId(null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to decline");
    }
  }

  async function onUnfriend() {
    try {
      if (user?._id) await unfriend(user._id);
      setRel("none"); setRelReqId(null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to unfriend");
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

            {/* actions (only when viewing someone else) */}
            {!isSelf && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={onMessage}
                  className="rounded-full px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:opacity-90 dark:bg-white dark:text-zinc-900"
                >
                  Message
                </button>

                {rel === "none" && (
                  <button
                    onClick={onAddFriend}
                    className="rounded-full px-4 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Add friend
                  </button>
                )}

                {rel === "outgoing" && (
                  <button
                    onClick={onCancelRequest}
                    className="rounded-full px-4 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel request
                  </button>
                )}

                {rel === "incoming" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onAccept}
                      className="rounded-full px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:opacity-90"
                    >
                      Accept
                    </button>
                    <button
                      onClick={onDecline}
                      className="rounded-full px-4 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {rel === "friends" && (
                  <button
                    onClick={onUnfriend}
                    className="rounded-full px-4 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Unfriend
                  </button>
                )}
              </div>
            )}
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
