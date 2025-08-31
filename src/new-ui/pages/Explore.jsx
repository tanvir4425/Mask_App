import React, { useEffect, useState } from "react";
import { getPosts } from "../api";
import PostCard from "../PostCard";

export default function ExplorePage() {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const list = await getPosts("trending", 1, 20);
        if (!stop) setPosts(Array.isArray(list) ? list : []);
      } catch {
        if (!stop) setPosts([]);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Explore</div>
          <div className="text-sm text-zinc-500">Trending across Mask</div>
        </div>
      </div>

      {posts === null && <div className="px-4 py-8 text-zinc-500">Loading…</div>}
      {Array.isArray(posts) && posts.length === 0 && (
        <div className="px-4 py-8 text-zinc-500">Nothing trending now.</div>
      )}
      {Array.isArray(posts) && posts.map((p) => (
        <PostCard key={p._id} post={p} readOnly />
      ))}
    </>
  );
}
