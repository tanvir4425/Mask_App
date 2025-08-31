// src/new-ui/pages/HomeFeed.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import PostCard from "../PostCard";
import { createPost, getPosts } from "../api";
import { useToast } from "../../context/ToastContext";

/** Small helper */
function clsx(...xs) { return xs.filter(Boolean).join(" "); }

/* ===================== Composer (compact visuals, same behavior) ===================== */
function Composer({ onPosted }) {
  const { addToast } = useToast();
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef(null);

  // Focus the composer when landing on /app#composer
  useEffect(() => {
    const focusIfNeeded = () => {
      if (typeof window !== "undefined" && window.location.hash === "#composer") {
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    focusIfNeeded();
    window.addEventListener("hashchange", focusIfNeeded);
    return () => window.removeEventListener("hashchange", focusIfNeeded);
  }, []);

  function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { addToast("Please select an image file", "error"); return; }
    if (f.size > 5 * 1024 * 1024) { addToast("Image must be ≤ 5 MB", "error"); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  function clearImage() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(""); setFile(null);
    const input = document.getElementById("composer-image-input"); if (input) input.value = "";
  }

  async function handlePost() {
    const t = text.trim();
    if (!t && !file) return;
    setPosting(true);
    try {
      const newPost = await createPost({ text: t, file }); // multipart with "image"
      setText(""); clearImage();
      onPosted?.(newPost);
      addToast("Posted!", "success");
    } catch {
      addToast("Failed to post", "error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div id="composer" className="px-3 py-2">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share something…"
          rows={2} /* smaller */
          className="w-full bg-transparent outline-none resize-none text-[15px]"
        />
        {preview && (
          <div className="mt-2 relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <img src={preview} alt="" className="w-full object-cover" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-black/60 text-white"
            >
              Remove
            </button>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <label
            htmlFor="composer-image-input"
            className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700"
          >
            📎 Add photo
          </label>
          <input id="composer-image-input" type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          <div className="flex-1" />
          <button
            type="button"
            disabled={posting || (!text.trim() && !file)}
            onClick={handlePost}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-white font-semibold text-sm",
              posting || (!text.trim() && !file) ? "bg-zinc-400 dark:bg-zinc-700" : "bg-sky-600 hover:bg-sky-700"
            )}
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Tabs (no sticky here; sticky is provided by center <main>) ===================== */
function Tabs({ tab, setTab }) {
  return (
    <div className="bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur">
      <div className="px-4 pt-3"><div className="text-xl font-bold">Home</div></div>
      <div className="mt-3 flex">
        <button
          type="button"
          onClick={() => setTab("forYou")}
          className={clsx("flex-1 py-3 font-semibold", tab === "forYou" ? "border-b-2 border-sky-500 text-sky-500" : "text-zinc-500")}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => setTab("trending")}
          className={clsx("flex-1 py-3 font-semibold", tab === "trending" ? "border-b-2 border-sky-500 text-sky-500" : "text-zinc-500")}
        >
          Trending
        </button>
      </div>
    </div>
  );
}

/* ===================== Feed ===================== */
function Feed() {
  const [tab, setTab] = useState("forYou");
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  const resetFeed = useCallback(() => {
    setPosts([]); setPage(1); setHasMore(true); seenIdsRef.current.clear(); setInitialLoading(true);
  }, []);

  useEffect(() => { resetFeed(); }, [tab, resetFeed]);

  const loadPage = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const list = await getPosts(tab, page, limit);
      const items = Array.isArray(list) ? list : [];
      const unique = [];
      for (const p of items) {
        const id = String(p._id);
        if (!seenIdsRef.current.has(id)) { seenIdsRef.current.add(id); unique.push(p); }
      }
      setPosts((prev) => [...prev, ...unique]);
      setHasMore(items.length >= limit);
      setPage((p) => p + 1);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false); setInitialLoading(false);
    }
  }, [loading, hasMore, tab, page]);

  // root: the center <main> (so IO works with the new single scroller)
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (observerRef.current) observerRef.current.disconnect();
    const rootEl = sentinelRef.current.closest("main");
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadPage(); },
      { root: rootEl || null, rootMargin: "300px 0px 300px 0px", threshold: 0.01 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current && observerRef.current.disconnect();
  }, [loadPage]);

  const handlePosted = useCallback((newPost) => {
    if (!newPost) { resetFeed(); return; }
    const id = String(newPost._id);
    if (!seenIdsRef.current.has(id)) seenIdsRef.current.add(id);
    setPosts((prev) => [newPost, ...prev]);
  }, [resetFeed]);

  const onPostUpdated = useCallback((next) => {
    if (!next?._id) return;
    setPosts((prev) => prev.map((p) => (p._id === next._id ? next : p)));
  }, []);

  return (
    <div className="bg-transparent">
      {/* sticky header inside the center scroller: Tabs + (optional) Composer */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <Tabs tab={tab} setTab={setTab} />
        {tab === "forYou" && (
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <Composer onPosted={handlePosted} />
          </div>
        )}
      </div>

      {/* Feed items */}
      {initialLoading && posts.length === 0 && (
        <div className="px-4 py-8 text-zinc-500">Loading feed…</div>
      )}

      {posts.map((p) => (
        <PostCard key={p._id} post={p} onPostUpdated={onPostUpdated} />
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="py-8 text-center text-zinc-500">
          {loading ? "Loading…" : "Load more"}
        </div>
      )}
    </div>
  );
}

export default function HomeFeed() {
  return (
    <div className="bg-transparent">
      <Feed />
    </div>
  );
}
