import React, { useEffect, useState } from "react";
import Composer from "./Composer";
import PostCard from "./PostCard";
import { getPosts } from "./api";

export default function Feed() {
  const [tab, setTab] = useState("forYou"); // "forYou" | "trending"
  const [posts, setPosts] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    const data = await getPosts(tab, 1);
    setPosts(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await getPosts(tab, 1);
      if (alive) setPosts(Array.isArray(data) ? data : []);
    })();
    return () => { alive = false; };
  }, [tab, refreshKey]);

  const bump = () => setRefreshKey(k => k + 1);

  return (
    <main className="flex-1 min-w-0 border-r border-zinc-200 dark:border-zinc-800">
      <div className="px-4 py-3 text-xl font-bold sticky top-0 z-20 bg-white/70 dark:bg-zinc-950/70 backdrop-blur">
        Home
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 text-center border-b border-zinc-200 dark:border-zinc-800 sticky top-[52px] z-10 bg-white/70 dark:bg-zinc-950/70 backdrop-blur">
        <button
          className={`py-3 font-semibold ${tab === "forYou" ? "text-sky-500 border-b-2 border-sky-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`}
          onClick={() => setTab("forYou")}
        >For you</button>
        <button
          className={`py-3 font-semibold ${tab === "trending" ? "text-sky-500 border-b-2 border-sky-500" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`}
          onClick={() => setTab("trending")}
        >Trending</button>
      </div>

      {/* Composer only on For you */}
      {tab === "forYou" && <Composer onPosted={bump} />}

      {/* Posts */}
      {posts?.map(p => (
        <PostCard
          key={p._id || p.id}
          post={p}
          readOnly={tab === "trending"}
          onAction={bump}  // << refresh after react/comment/share/delete
        />
      ))}
    </main>
  );
}
