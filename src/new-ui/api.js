// src/new-ui/api.js
import axiosBase from "axios";

/**
 * HOW BASE URL WORKS (super simple):
 * - If you set REACT_APP_API_URL (e.g. http://localhost:5000), we call that server at .../api
 * - Otherwise we fall back to CRA proxy and call "/api"
 */
const API_ORIGIN = (process.env.REACT_APP_API_URL || "").replace(/\/$/, ""); // no trailing slash
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : "/api";

/** One axios instance (cookies on for session auth) */
const axios = axiosBase.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/** Redirect to login only on true auth failures (401) for auth-critical endpoints */
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    const shouldLogout =
      status === 401 && (/^\/auth\//.test(url) || /^\/users\/me\b/.test(url));

    if (shouldLogout) {
      try { localStorage.removeItem("user"); } catch {}
      if (window.location.pathname !== "/login-new") window.location.assign("/login-new");
    }
    return Promise.reject(error);
  }
);

/* ----------------------------- local storage utils ----------------------------- */
function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
export function getLocalUser() { return readLocal("user"); }

/* ------------------------------- error helper ------------------------------- */
function extractErrMsg(err, fallback = "Request failed") {
  const r = err?.response;
  if (r?.data && typeof r.data === "object") {
    return r.data.message || r.data.error || fallback;
  }
  if (typeof r?.data === "string" && r.data.trim()) return r.data;
  return err?.message || fallback;
}

/* --------------------------------- Auth ---------------------------------- */
export async function login({ pseudonym, username, email, password }) {
  let payload;
  if (pseudonym) payload = { pseudonym, password };
  else if (username) payload = { username, password };
  else payload = { email, password };

  try {
    const { data } = await axios.post(`/auth/login`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    const user = data?.user ?? data;
    if (user) writeLocal("user", user);
    return data;
  } catch (err) {
    throw new Error(extractErrMsg(err, "Login failed"));
  }
}

export async function signup({ pseudonym, username, email, password }) {
  let payload = {};
  if (pseudonym) payload = { pseudonym, password, email };
  else if (username) payload = { username, password, email };
  else payload = { email, password };

  try {
    const { data } = await axios.post(`/auth/signup`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    const user = data?.user ?? data;
    if (user) writeLocal("user", user);
    return data;
  } catch (err) {
    throw new Error(extractErrMsg(err, "Signup failed"));
  }
}

export async function logout() {
  try { await axios.post(`/auth/logout`); } catch {}
  try { localStorage.removeItem("user"); } catch {}
}

export async function getMe() {
  const { data } = await axios.get(`/users/me`);
  return data;
}

/** Change password (current, next) */
export async function changePassword(current, next) {
  try {
    const { data } = await axios.post(
      `/auth/change-password`,
      { current, next },
      { headers: { "Content-Type": "application/json" } }
    );
    return data; // { ok: true }
  } catch (err) {
    throw new Error(extractErrMsg(err, "Failed to change password"));
  }
}

/* --------------------------------- Posts --------------------------------- */
export async function getPosts(tab = "forYou", page = 1, limit = 20, opts = {}) {
  const { signal } = opts || {};
  const path = tab === "trending" ? `/posts/trending` : `/posts`;
  const { data } = await axios.get(`${path}?page=${page}&limit=${limit}`, { signal });
  return data;
}

export async function createPost({
  text = "",
  file = null,
  scope = "global",
  group = null,
  page = null,
}) {
  const fd = new FormData();
  if (text && String(text).trim()) fd.append("text", String(text).trim());
  if (scope) fd.append("scope", scope);
  if (group) fd.append("group", group);
  if (page) fd.append("page", page);
  if (file instanceof File) fd.append("image", file);

  const { data } = await axios.post(`/posts`, fd);
  return data;
}

export async function deletePost(id) { await axios.delete(`/posts/${id}`); }

export async function reactToPost(postId, type) {
  const { data } = await axios.post(`/posts/${postId}/react`, { type });
  return data?.post || data;
}

export async function commentOnPost(id, text) { const { data } = await axios.post(`/posts/${id}/comment`, { text }); return data; }
export async function sharePost(id) { const { data } = await axios.post(`/posts/${id}/share`); return data; }
export async function getPost(id) { const { data } = await axios.get(`/posts/${id}`); return data; }

/* ------------------------------- Bookmarks -------------------------------- */
let __bookmarkIds = null;
let __bookmarkLoadedAt = 0;
export async function getMyBookmarks({ idsOnly = false } = {}) {
  if (idsOnly) { const { data } = await axios.get(`/users/me/bookmarks?ids=1`); return data; }
  const { data } = await axios.get(`/users/me/bookmarks`); return data;
}
export async function loadBookmarkIdsCache(force = false) {
  const now = Date.now();
  if (!force && __bookmarkIds && now - __bookmarkLoadedAt < 60_000) return __bookmarkIds;
  try {
    const res = await getMyBookmarks({ idsOnly: true });
    __bookmarkIds = new Set(res?.ids || []); __bookmarkLoadedAt = now;
  } catch { __bookmarkIds = new Set(); }
  return __bookmarkIds;
}
export function isBookmarkedLocally(id) { return __bookmarkIds ? __bookmarkIds.has(String(id)) : false; }
export function updateBookmarkLocal(id, bookmarked) {
  if (!__bookmarkIds) __bookmarkIds = new Set();
  const key = String(id);
  if (bookmarked) __bookmarkIds.add(key); else __bookmarkIds.delete(key);
}
export async function toggleBookmark(postId) {
  const { data } = await axios.post(`/users/me/bookmarks/${postId}`);
  if (typeof data?.bookmarked === "boolean") updateBookmarkLocal(postId, data.bookmarked);
  return data;
}

/* --------------------------- Profiles / Friends --------------------------- */
export async function getUserProfile(userId) { const { data } = await axios.get(`/users/${userId}`); return data; }
export async function getUserPosts(userId, page = 1, limit = 20) { const { data } = await axios.get(`/users/${userId}/posts?page=${page}&limit=${limit}`); return data; }
export async function followUser(userId) { const { data } = await axios.post(`/users/${userId}/follow`); return data; }
export async function sendFriendRequest(userId) { const { data } = await axios.post(`/users/${userId}/friend-request`); return data; }
export async function getFriendRequests() { const { data } = await axios.get(`/users/requests`); return data; }
export async function acceptFriendRequest(rid) { const { data } = await axios.post(`/users/requests/${rid}/accept`); return data; }
export async function declineFriendRequest(rid) { const { data } = await axios.post(`/users/requests/${rid}/decline`); return data; }
export async function unfriend(userId) { const { data } = await axios.post(`/users/${userId}/unfriend`); return data; }

/* --------------------------------- Avatar -------------------------------- */
export async function uploadAvatar(file) {
  const fd = new FormData();
  fd.append("avatar", file);
  const { data } = await axios.post(`/users/me/avatar`, fd);
  try {
    const u = getLocalUser() || {};
    u.avatarURL = data?.avatarURL || "";
    localStorage.setItem("user", JSON.stringify(u));
  } catch {}
  return data;
}
export async function deleteAvatar() {
  const { data } = await axios.delete(`/users/me/avatar`);
  try {
    const u = getLocalUser() || {};
    u.avatarURL = "";
    localStorage.setItem("user", JSON.stringify(u));
  } catch {}
  return data;
}
export async function getAvatarHistory(limit = 5) {
  const { data } = await axios.get(`/users/me/avatar/history?limit=${limit}`);
  return data;
}

/* ------------------------------ Groups/Pages ------------------------------ */
export async function getGroup(id) { const { data } = await axios.get(`/groups/${id}`); return data; }
export async function getPage(id) { const { data } = await axios.get(`/pages/${id}`); return data; }
export async function getGroupPosts(id, page = 1, limit = 20) { const { data } = await axios.get(`/groups/${id}/posts?page=${page}&limit=${limit}`); return data; }
export async function getPagePosts(id, page = 1, limit = 20) { const { data } = await axios.get(`/pages/${id}/posts?page=${page}&limit=${limit}`); return data; }
export async function createGroupPost(id, payload) { const { data } = await axios.post(`/groups/${id}/post`, payload); return data; }
export async function createPagePost(id, payload) { const { data } = await axios.post(`/pages/${id}/post`, payload); return data; }
export async function createGroup(payload) { const { data } = await axios.post(`/groups`, payload); return data; }
export async function createPage(payload) { const { data } = await axios.post(`/pages`, payload); return data; }
export async function joinGroup(id) { const { data } = await axios.post(`/groups/${id}/join`); return data; }
export async function followPage(id) { const { data } = await axios.post(`/pages/${id}/follow`); return data; }
export async function getGroupSuggestions(limit = 5) { const { data } = await axios.get(`/groups/suggestions?limit=${limit}`); return data; }
export async function getPageSuggestions(limit = 5) { const { data } = await axios.get(`/pages/suggestions?limit=${limit}`); return data; }

/* -------- Covers -------- */
export async function uploadPageCover(id, file) {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await axios.post(`/pages/${id}/cover`, fd);
  return data;
}
export async function deletePageCover(id) {
  const { data } = await axios.delete(`/pages/${id}/cover`);
  return data;
}
export async function uploadGroupCover(id, file) {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await axios.post(`/groups/${id}/cover`, fd);
  return data;
}
export async function deleteGroupCover(id) {
  const { data } = await axios.delete(`/groups/${id}/cover`);
  return data;
}

/* ---------------------------------- Live --------------------------------- */
export async function getLiveNow() { const { data } = await axios.get(`/live`); return data; }
export async function getLiveById(id) { const { data } = await axios.get(`/live/${id}`); return data; }

/* --------------------------------- Search -------------------------------- */
export async function search(q) { const { data } = await axios.get(`/search?q=${encodeURIComponent(q)}`); return data; }

/* ---------------------------- Notifications ------------------------------ */
export async function getNotifications(page = 1, limit = 20) {
  const { data } = await axios.get(`/notifications?page=${page}&limit=${limit}`);
  return data;
}
export async function getUnreadCount() {
  const { data } = await axios.get(`/notifications/unread-count`);
  return data;
}
export async function markNotificationRead(id) {
  const { data } = await axios.post(`/notifications/read/${id}`);
  return data;
}
export async function markAllNotificationsRead() {
  const { data } = await axios.post(`/notifications/read-all`);
  return data;
}

/* ------------------------------ Messages (DM) ----------------------------- */
function withUserHeader(extra = {}) {
  const me = getLocalUser();
  const uid = me?.id || me?._id || "";
  return {
    headers: { "x-user-id": uid, ...(extra.headers || {}) },
    ...(extra || {}),
  };
}

export async function getDMUnreadCount() {
  try {
    const { data } = await axios.get(`/messages/unread-count`, withUserHeader());
    return data;
  } catch {
    return { count: 0 };
  }
}
export async function listConversations() {
  const { data } = await axios.get(`/messages/conversations`, withUserHeader());
  return data;
}
export async function getMessages(conversationId, { before } = {}) {
  const q = before ? `?before=${encodeURIComponent(before)}` : "";
  const { data } = await axios.get(`/messages/${conversationId}${q}`, withUserHeader());
  return data;
}
export async function sendMessage(conversationId, text) {
  const { data } = await axios.post(`/messages/${conversationId}`, { text }, withUserHeader());
  return data;
}
export async function markConversationRead(conversationId) {
  try { await axios.post(`/messages/${conversationId}/read`, {}, withUserHeader()); } catch {}
}
export async function createOrGetConversationWith(userId) {
  const { data } = await axios.post(`/messages/with/${userId}`, {}, withUserHeader());
  return data; // { id }
}
export function connectMessagesWS(onEvent) {
  const httpOrigin = API_ORIGIN || window.location.origin.replace(/\/+$/, "");
  const wsBase = httpOrigin.replace(/^http/i, "ws");
  const wsURL = `${wsBase}/api/messages/ws`;

  let ws;
  try { ws = new WebSocket(wsURL); } catch { return { close() {} }; }
  ws.onmessage = (e) => {
    if (!onEvent) return;
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  return ws;
}

/* ----------------------------- Trust / Facts ----------------------------- */
export async function getFactCheck(postId) {
  const { data } = await axios.get(`/factcheck/${postId}`);
  return data;
}
export async function getTrustSnapshot(type, id) {
  const { data } = await axios.get(`/trust/${type}/${id}`);
  return data;
}

/* ---------------------------------- Admin -------------------------------- */
export function setAdminKey(k) {
  try { k ? localStorage.setItem("adminKey", k) : localStorage.removeItem("adminKey"); } catch {}
}
export function getAdminKey() {
  try { return localStorage.getItem("adminKey") || ""; } catch { return ""; }
}
function withAdminHeader(extra = {}) {
  const key = getAdminKey();
  return {
    headers: { "x-admin-key": key, ...(extra.headers || {}) },
    ...(extra || {}),
  };
}
export async function adminListFactChecks({ verdict, minConf, maxConf, page = 1, limit = 20 } = {}) {
  const sp = new URLSearchParams();
  if (verdict) sp.set("verdict", verdict);
  if (minConf != null) sp.set("minConf", String(minConf));
  if (maxConf != null) sp.set("maxConf", String(maxConf));
  if (page) sp.set("page", String(page));
  if (limit) sp.set("limit", String(limit));
  const { data } = await axios.get(`/admin/factchecks?${sp.toString()}`, withAdminHeader());
  return data; // { rows, total, page, limit }
}

/* ---- Motivation admin (CRUD) ---- */
export async function adminMotivationList({ q, tone, tag, lang, page = 1, limit = 20 } = {}) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (tone) sp.set("tone", tone);
  if (tag) sp.set("tag", tag);
  if (lang) sp.set("lang", lang);
  if (page) sp.set("page", String(page));
  if (limit) sp.set("limit", String(limit));
  const { data } = await axios.get(`/admin/motivation?${sp.toString()}`, withAdminHeader());
  return data;
}

export async function adminMotivationCreate(payload) {
  const { data } = await axios.post(`/admin/motivation`, payload, withAdminHeader({
    headers: { "Content-Type": "application/json" },
  }));
  return data;
}

export async function adminMotivationUpdate(id, payload) {
  const { data } = await axios.put(`/admin/motivation/${id}`, payload, withAdminHeader({
    headers: { "Content-Type": "application/json" },
  }));
  return data;
}

export async function adminMotivationDelete(id) {
  const { data } = await axios.delete(`/admin/motivation/${id}`, withAdminHeader());
  return data;
}

/* ----------------------- Motivation prefs (axios) ------------------------ */
export async function getMotivationPrefs() {
  const { data } = await axios.get(`/me/motivation-prefs`);
  return data;
}
export async function updateMotivationPrefs(payload) {
  const { data } = await axios.put(`/me/motivation-prefs`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

/* exports for reuse elsewhere */
export { axios as http, API_BASE, API_ORIGIN };
export default axios;
