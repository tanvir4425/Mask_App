import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getMe,
  getGroup,
  getGroupPosts,
  createGroupPost,
  uploadGroupCover,
  deleteGroupCover,
} from "../api";
import { Upload, Trash2 } from "lucide-react";

export default function GroupDetail() {
  const { id } = useParams();
  const [me, setMe] = useState(null);
  const [group, setGroup] = useState(null);
  const [posts, setPosts] = useState([]);
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, g, ps] = await Promise.all([
        getMe().catch(() => null),
        getGroup(id).catch(() => null),
        getGroupPosts(id, 1, 20).catch(() => []),
      ]);
      if (cancelled) return;
      setMe(m);
      setGroup(g);
      const mapped = (ps || []).map((po) => ({
        ...po,
        __displayName: `${g?.name || "Group"} • ${po?.author?.pseudonym || "Member"}`,
      }));
      setPosts(mapped);
    })();
    return () => { cancelled = true; };
  }, [id]);

  function isMember() {
    if (!me || !group) return false;
    const uid = String(me.id || me._id || "");
    if (Array.isArray(group.members) && group.members.some((x) => String(x) === uid)) return true;
    if (group.isMember) return true;
    return false;
  }

  async function postNow() {
    if (!composer.trim()) return;
    setPosting(true);
    try {
      const created = await createGroupPost(id, { text: composer.trim() });
      setPosts((prev) => [
        { ...created, __displayName: `${group?.name || "Group"} • ${created?.author?.pseudonym || "Member"}` },
        ...prev,
      ]);
      setComposer("");
    } finally { setPosting(false); }
  }

  async function changeCover(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverBusy(true);
    try {
      const res = await uploadGroupCover(id, file);
      setGroup((g) => ({ ...g, coverURL: res?.coverURL || g?.coverURL }));
    } finally { setCoverBusy(false); }
  }
  async function removeCover() {
    setCoverBusy(true);
    try {
      await deleteGroupCover(id);
      setGroup((g) => ({ ...g, coverURL: "" }));
    } finally { setCoverBusy(false); }
  }

  if (!group) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-4">
        <div className="h-44 bg-zinc-200 dark:bg-zinc-800">
          {group.coverURL ? <img src={group.coverURL} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        {isMember() && (
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <label className="text-xs px-2 py-1 rounded bg-zinc-900/80 text-white cursor-pointer flex items-center gap-1">
              <Upload size={14} /> {coverBusy ? "…" : "Change cover"}
              <input type="file" className="hidden" accept="image/*" onChange={changeCover} />
            </label>
            {group.coverURL ? (
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
        <div className="text-xl font-bold">{group.name}</div>
        <div className="text-sm text-zinc-500">{group.description}</div>
      </div>

      {isMember() ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 mb-3">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={`Share with ${group.name}…`}
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
        <div className="text-xs text-zinc-500 mb-2">Join this group to post.</div>
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
