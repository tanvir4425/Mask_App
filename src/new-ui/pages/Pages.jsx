import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe,
  getPage,
  getPagePosts,
  createPagePost,
  getPageSuggestions,
  followPage,
  createPage,
  uploadPageCover,
  deletePageCover,
} from "../api";
import { Plus, Image as ImageIcon, ExternalLink, Upload, Trash2 } from "lucide-react";

/* Small helpers */
function Section({ title, children, right }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-zinc-600">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MiniRow({ title, subtitle, onClick, avatarURL, trailing }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
        {avatarURL ? <img src={avatarURL} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{title}</div>
        {subtitle ? <div className="text-xs text-zinc-500 truncate">{subtitle}</div> : null}
      </div>
      <div className="ml-auto">{trailing}</div>
    </button>
  );
}

export default function PagesPage() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);

  // mine + suggestions
  const [myPages, setMyPages] = useState([]);
  const [sugs, setSugs] = useState([]);
  const [sugLimit, setSugLimit] = useState(12);
  const [loading, setLoading] = useState(true);

  // quick create
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // detail drawer (lightweight inline view) — keeps you on the list page
  const [openId, setOpenId] = useState(null);
  const [openPage, setOpenPage] = useState(null);
  const [openPosts, setOpenPosts] = useState([]);
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const profile = await getMe().catch(() => null);
        if (cancelled) return;
        setMe(profile);

        const ids = (profile?.pages || []).slice(0, 50);
        const detailed = await Promise.all(ids.map((id) => getPage(id).catch(() => null)));
        if (cancelled) return;
        setMyPages(detailed.filter(Boolean));

        const sug = await getPageSuggestions(sugLimit).catch(() => []);
        if (!cancelled) setSugs(Array.isArray(sug) ? sug : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sugLimit]);

  async function onFollowToggle(id) {
    try {
      const res = await followPage(id);
      const following = !!res?.following;
      setMyPages((prev) => {
        if (following) {
          if (prev.some((p) => String(p._id) === String(id))) return prev;
          const found = sugs.find((s) => String(s._id) === String(id));
          return found ? [found, ...prev] : prev;
        }
        return prev.filter((p) => String(p._id) !== String(id));
      });
    } catch {}
  }

  async function onCreatePage(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    try {
      const p = await createPage({ name: n, description: desc.trim() });
      setMyPages((prev) => [p, ...prev]);
      setName(""); setDesc(""); setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function openInline(id) {
    setOpenId(id);
    setOpenPage(null);
    setOpenPosts([]);
    try {
      const [p, posts] = await Promise.all([
        getPage(id).catch(() => null),
        getPagePosts(id, 1, 20).catch(() => []),
      ]);
      setOpenPage(p);
      // In page view, show the page name as the "author"
      const mapped = (posts || []).map((po) => ({
        ...po,
        __displayName: p?.name || po?.author?.pseudonym || "Page",
      }));
      setOpenPosts(mapped);
    } catch {}
  }

  async function handlePost() {
    if (!openId || !composer.trim()) return;
    setPosting(true);
    try {
      const created = await createPagePost(openId, { text: composer.trim() });
      setOpenPosts((prev) => [{ ...created, __displayName: openPage?.name || "Page" }, ...prev]);
      setComposer("");
    } finally {
      setPosting(false);
    }
  }

  function isAdminOfOpen() {
    if (!me || !openPage) return false;
    const uid = String(me.id || me._id || "");
    if (openPage.ownerId && String(openPage.ownerId) === uid) return true;
    if (Array.isArray(openPage.admins) && openPage.admins.some((a) => String(a) === uid)) return true;
    // backend might send a boolean
    if (openPage.isAdmin) return true;
    return false;
  }

  async function changeCover(e) {
    const file = e.target.files?.[0];
    if (!file || !openId) return;
    setCoverBusy(true);
    try {
      const res = await uploadPageCover(openId, file);
      setOpenPage((p) => ({ ...p, coverURL: res?.coverURL || p?.coverURL }));
    } finally {
      setCoverBusy(false);
    }
  }
  async function removeCover() {
    if (!openId) return;
    setCoverBusy(true);
    try {
      await deletePageCover(openId);
      setOpenPage((p) => ({ ...p, coverURL: "" }));
    } finally {
      setCoverBusy(false);
    }
  }

  const hasMine = myPages.length > 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">Pages</h1>

      <Section
        title="Your pages"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100"
              type="button"
              title="Create Page"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        }
      >
        {showCreate && (
          <form onSubmit={onCreatePage} className="mb-3 rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Page name"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        {!hasMine ? (
          <div className="text-sm text-zinc-500">No pages yet.</div>
        ) : (
          <div className="space-y-1.5">
            {myPages.map((p) => (
              <MiniRow
                key={p._id}
                title={p.name}
                subtitle={`${p.followersCount ?? 0} followers`}
                avatarURL={p.avatarURL || p.coverURL}
                trailing={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onFollowToggle(p._id); }}
                      className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800"
                      type="button"
                    >
                      Unfollow
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openInline(p._id); }}
                      className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800"
                      type="button"
                    >
                      Preview
                    </button>
                  </div>
                }
                onClick={() => nav(`/app/pages/${p._id}`)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Suggestions"
        right={
          <button
            onClick={() => setSugLimit((n) => n + 12)}
            className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100"
            type="button"
            title="More"
          >
            <ExternalLink size={14} /> More
          </button>
        }
      >
        {sugs.length === 0 ? (
          <div className="text-sm text-zinc-500">No suggestions now.</div>
        ) : (
          <div className="space-y-1.5">
            {sugs.map((s) => (
              <MiniRow
                key={s._id}
                title={s.name}
                subtitle={`${s.followersCount ?? 0} followers`}
                avatarURL={s.avatarURL || s.coverURL}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); onFollowToggle(s._id); }}
                    className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800"
                    type="button"
                  >
                    Follow
                  </button>
                }
                onClick={() => nav(`/app/pages/${s._id}`)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Inline page drawer */}
      {openId && openPage && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-0 overflow-hidden">
          <div className="relative">
            <div className="h-40 bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              {openPage.coverURL ? (
                <img src={openPage.coverURL} alt="" className="w-full h-full object-cover" />
              ) : null}
            </div>
            {isAdminOfOpen() && (
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <label className="text-xs px-2 py-1 rounded bg-zinc-900/80 text-white cursor-pointer flex items-center gap-1">
                  <Upload size={14} />
                  {coverBusy ? "…" : "Change cover"}
                  <input type="file" className="hidden" accept="image/*" onChange={changeCover} />
                </label>
                {openPage.coverURL ? (
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

          <div className="p-4">
            <div className="text-lg font-semibold">{openPage.name}</div>
            <div className="text-sm text-zinc-500 mb-3">{openPage.description}</div>

            {/* Page posts – admin only composer */}
            {isAdminOfOpen() ? (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 mb-3">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder={`Post as ${openPage.name}…`}
                  className="w-full resize-none outline-none bg-transparent"
                  rows={3}
                />
                <div className="flex justify-end">
                  <button
                    onClick={handlePost}
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
              {openPosts.length === 0 ? (
                <div className="text-sm text-zinc-500">No posts yet.</div>
              ) : (
                openPosts.map((po) => (
                  <div key={po._id} className="py-3">
                    <div className="text-sm font-semibold mb-1">{po.__displayName}</div>
                    <div className="text-sm whitespace-pre-wrap">{po.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
