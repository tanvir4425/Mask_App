import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getMe,
  getPage,
  getPagePosts,
  createPagePost,
  uploadPageCover,
  deletePageCover,
} from "../api";
import { Upload, Trash2 } from "lucide-react";

export default function PageDetail() {
  const { id } = useParams();
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(null);
  const [posts, setPosts] = useState([]);
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, p, ps] = await Promise.all([
        getMe().catch(() => null),
        getPage(id).catch(() => null),
        getPagePosts(id, 1, 20).catch(() => []),
      ]);
      if (cancelled) return;
      setMe(m);
      setPage(p);
      const mapped = (ps || []).map((po) => ({ ...po, __displayName: p?.name || "Page" }));
      setPosts(mapped);
    })();
    return () => { cancelled = true; };
  }, [id]);

  function isAdmin() {
    if (!me || !page) return false;
    const uid = String(me.id || me._id || "");
    if (page.ownerId && String(page.ownerId) === uid) return true;
    if (Array.isArray(page.admins) && page.admins.some((a) => String(a) === uid)) return true;
    if (page.isAdmin) return true;
    return false;
  }

  async function postNow() {
    if (!composer.trim()) return;
    setPosting(true);
    try {
      const created = await createPagePost(id, { text: composer.trim() });
      setPosts((prev) => [{ ...created, __displayName: page?.name || "Page" }, ...prev]);
      setComposer("");
    } finally { setPosting(false); }
  }

  async function changeCover(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverBusy(true);
    try {
      const res = await uploadPageCover(id, file);
      setPage((p) => ({ ...p, coverURL: res?.coverURL || p?.coverURL }));
    } finally { setCoverBusy(false); }
  }
  async function removeCover() {
    setCoverBusy(true);
    try {
      await deletePageCover(id);
      setPage((p) => ({ ...p, coverURL: "" }));
    } finally { setCoverBusy(false); }
  }

  if (!page) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-4">
        <div className="h-44 bg-zinc-200 dark:bg-zinc-800">
          {page.coverURL ? <img src={page.coverURL} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        {isAdmin() && (
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <label className="text-xs px-2 py-1 rounded bg-zinc-900/80 text-white cursor-pointer flex items-center gap-1">
              <Upload size={14} /> {coverBusy ? "…" : "Change cover"}
              <input type="file" className="hidden" accept="image/*" onChange={changeCover} />
            </label>
            {page.coverURL ? (
              <button
                onClick={removeCover}
                className="text-xs px-2 py-1 rounded bg-zinc-900/80 text-white flex items-center gap-1"
                type="button"
                disabled={coverBusy}
              >
                <Trash2 size={14} /> Remove
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="mb-3">
        <div className="text-xl font-bold">{page.name}</div>
        <div className="text-sm text-zinc-500">{page.description}</div>
      </div>

      {isAdmin() ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 mb-3">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={`Post as ${page.name}…`}
            className="w-full resize-none outline-none bg-transparent"
            rows={3}
          />
          <div className="flex justify-end">
            <button
              onClick={postNow}
              disabled={posting || !composer.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
              type="button"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 mb-2">Only page admins can post.</div>
      )}

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {posts.length === 0 ? (
          <div className="text-sm text-zinc-500">No posts yet.</div>
        ) : (
          posts.map((po) => (
            <div key={po._id} className="py-3">
              <div className="text-sm font-semibold mb-1">{po.__displayName}</div>
              <div className="text-sm whitespace-pre-wrap">{po.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
