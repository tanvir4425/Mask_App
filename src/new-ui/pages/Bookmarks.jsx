// src/new-ui/pages/Bookmarks.jsx
import React, { useEffect, useState } from "react";
import PostCard from "../PostCard";
import { getMyBookmarks, loadBookmarkIdsCache } from "../api";

export default function BookmarksPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ids = await loadBookmarkIdsCache();
        const list = await getMyBookmarks({ ids });
        setPosts(Array.isArray(list) ? list : []);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Bookmarks</div>
          <div className="text-sm text-zinc-500">Your saved posts</div>
        </div>
      </div>

      {loading && <div className="px-4 py-8 text-zinc-500">Loading…</div>}
      {!loading && posts.length === 0 && <div className="px-4 py-8 text-zinc-500">No bookmarks yet.</div>}
      {!loading && posts.map((p) => <PostCard key={p._id} post={p} />)}
    </>
  );
}
