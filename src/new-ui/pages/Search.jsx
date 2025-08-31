// src/new-ui/pages/Search.jsx
import React, { useState } from "react";
import PostCard from "../PostCard";

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function onSearch(e) {
    e?.preventDefault();
    const s = q.trim();
    if (!s) return;
    setLoading(true);
    try { setRows(await fetchJSON(`/api/search?q=${encodeURIComponent(s)}`)); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Search</div>
          <div className="text-sm text-zinc-500">Find posts and people</div>
        </div>
      </div>

      <form onSubmit={onSearch} className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search Mask…"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
          <button className="px-4 py-2 rounded-xl bg-sky-600 text-white">Search</button>
        </div>
      </form>

      {loading && <div className="px-4 py-6 text-zinc-500">Searching…</div>}
      {!loading && rows.length === 0 && <div className="px-4 py-6 text-zinc-500">No results.</div>}
      {!loading && rows.map((p) => <PostCard key={p._id} post={p} />)}
    </>
  );
}
