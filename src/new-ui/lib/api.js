// src/new-ui/lib/api.js
export async function fetchJSON(path, opts = {}) {
  const API = process.env.REACT_APP_API_BASE || "";
  const method = (opts.method || "GET").toUpperCase();

  // Build headers
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };

  // Always include cookie & bypass browser cache
  const init = {
    credentials: "include",
    cache: "no-store",
    headers,
    ...opts,
  };

  const url0 = API + path;

  // Add a cache-busting param for GET requests to avoid 304
  const url =
    method === "GET"
      ? url0 + (url0.includes("?") ? "&" : "?") + "_ts=" + Date.now()
      : url0;

  const res = await fetch(url, init);

  // If any proxy/CDN still replies 304, do one forced re-fetch
  if (res.status === 304) {
    const freshUrl =
      url0 +
      (url0.includes("?") ? "&" : "?") +
      "_ts=" +
      Date.now() +
      Math.random().toString(36).slice(2);
    const res2 = await fetch(freshUrl, init);
    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
    return res2.headers.get("content-type")?.includes("application/json")
      ? res2.json()
      : res2.text();
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.headers.get("content-type")?.includes("application/json")
    ? res.json()
    : res.text();
}
