// mask-backend/utils/linkPreview.js
const { URL } = require("url");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36";

function findFirstUrl(text = "") {
  const re = /(https?:\/\/[^\s]+)/i;
  const m = String(text || "").match(re);
  return m ? m[1] : null;
}

function absUrl(possible, base) {
  try { return new URL(possible, base).href; } catch { return ""; }
}

function pickMeta(html, names = []) {
  for (const n of names) {
    const r = new RegExp(
      `<meta\\s+(?:property|name)=["']${n.replace(/[:\-]/g, "\\$&")}["']\\s+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const m = html.match(r);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m && m[1] ? m[1].trim() : "";
}

async function fetchWithTimeout(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, "accept-language": "en" },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// very small in-mem cache to avoid hammering sites
const CACHE = new Map(); // url -> { data, exp }
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

function getCached(url) {
  const hit = CACHE.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  CACHE.delete(url);
  return null;
}
function setCached(url, data) {
  CACHE.set(url, { data, exp: Date.now() + TTL_MS });
}

async function fetchLinkPreview(rawUrl) {
  if (!/^https?:\/\//i.test(rawUrl)) throw new Error("Invalid URL");

  const cached = getCached(rawUrl);
  if (cached) return cached;

  const res = await fetchWithTimeout(rawUrl, 7000);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const finalUrl = res.url || rawUrl;
  const html = await res.text();

  const title =
    pickMeta(html, ["og:title", "twitter:title"]) || pickTitle(html);
  const description =
    pickMeta(html, ["og:description", "twitter:description", "description"]);
  const imageRel =
    pickMeta(html, ["og:image:secure_url", "og:image", "twitter:image"]) || "";
  const siteName =
    pickMeta(html, ["og:site_name"]) ||
    (new URL(finalUrl).hostname || "").replace(/^www\./, "");

  const image = imageRel ? absUrl(imageRel, finalUrl) : "";

  const data = {
    url: rawUrl,
    finalUrl,
    title: title?.slice(0, 200) || "",
    description: description?.slice(0, 300) || "",
    image,
    siteName,
  };
  setCached(rawUrl, data);
  return data;
}

module.exports = { findFirstUrl, fetchLinkPreview };
