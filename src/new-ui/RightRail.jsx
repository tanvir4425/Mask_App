// src/new-ui/RightRail.jsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  search,
  getLiveNow,
  getMe,
  getPage,
  getGroup,
  getPageSuggestions,
  getGroupSuggestions,
  followPage,
  joinGroup,
  createGroup,
  createPage,
} from "./api";
import { Moon, Sun, Plus, ExternalLink, Search as SearchIcon } from "lucide-react";

/* ------------------------------- utilities ------------------------------- */
function useDebouncedValue(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// NOTE: nested under /app so these avoid 500s
const ROUTES = {
  pages: "/app/pages",
  page: (id) => `/app/pages/${id}`,
  groups: "/app/groups",
  group: (id) => `/app/groups/${id}`,
  profile: (id) => `/app/profile/${id}`,
};

function MiniRow({ title, subtitle, trailing, onClick, avatarURL }) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-3"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
        {avatarURL ? <img src={avatarURL} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{title}</div>
        {subtitle ? <div className="text-xs text-zinc-500 truncate">{subtitle}</div> : null}
      </div>
      <div className="ml-2 shrink-0 opacity-80">{trailing}</div>
    </button>
  );
}

function Card({ title, headerRight, className, children }) {
  return (
    <div className={`w-full max-w-full overflow-x-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 mb-4 ${className || ""}`}>
      <div className="px-2 py-1 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="shrink-0">{headerRight}</div>
      </div>
      <div className="px-2 py-2">{children}</div>
    </div>
  );
}

/* -------------------------------- component ------------------------------- */
export default function RightRail() {
  const nav = useNavigate();
  const rootRef = useRef(null);
  const [hidden, setHidden] = useState(false); // self-suppress if not rightmost

  // search
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 350);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [pageResults, setPageResults] = useState([]);
  const [groupResults, setGroupResults] = useState([]);
  const panelRef = useRef(null);        // anchor for dropdown
  const dropdownRef = useRef(null);     // dropdown element (in portal)
  const [panelPos, setPanelPos] = useState(null); // {top,left,width}

  function updatePanelPos() {
    if (!panelRef.current) return;
    const r = panelRef.current.getBoundingClientRect();
    setPanelPos({ top: r.bottom + 8, left: r.left, width: r.width });
  }

  // live
  const [lives, setLives] = useState([]);

  // my pages/groups + suggestions
  const [myPages, setMyPages] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [pageSugs, setPageSugs] = useState([]);
  const [groupSugs, setGroupSugs] = useState([]);

  // quick-create (Pages)
  const [showPageCreate, setShowPageCreate] = useState(false);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [creatingPage, setCreatingPage] = useState(false);

  // quick-create (Groups)
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [gName, setGName] = useState("");
  const [gPrivacy, setGPrivacy] = useState("public");
  const [gDesc, setGDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  /* --------------------------- self-suppress (rightmost only) --------------------------- */
  useEffect(() => {
    function compute() {
      try {
        const nodes = Array.from(document.querySelectorAll('[data-rr="mask-rail"]'));
        if (nodes.length <= 1) { setHidden(false); return; }
        let best = null, bestRight = -Infinity;
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (r.right > bestRight) { bestRight = r.right; best = el; }
        }
        setHidden(rootRef.current && best !== rootRef.current);
      } catch { setHidden(false); }
    }
    compute();
    window.addEventListener("resize", compute);
    const obs = new MutationObserver(compute);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { window.removeEventListener("resize", compute); obs.disconnect(); };
  }, []);

  /* ------------------------------- quick create ------------------------------ */
  async function quickCreatePage(e) {
    e.preventDefault();
    const name = pName.trim();
    if (!name) return;
    setCreatingPage(true);
    try {
      const page = await createPage({ name, description: pDesc.trim() });
      setMyPages((prev) => [page, ...prev]);
      setPName(""); setPDesc(""); setShowPageCreate(false);
    } finally { setCreatingPage(false); }
  }
  async function quickCreateGroup(e) {
    e.preventDefault();
    const name = gName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const g = await createGroup({ name, description: gDesc.trim(), privacy: gPrivacy });
      setMyGroups((prev) => [g, ...prev]);
      setGName(""); setGDesc(""); setGPrivacy("public"); setShowGroupCreate(false);
    } finally { setCreatingGroup(false); }
  }

  /* --------------------------------- search -------------------------------- */
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await search(debounced);
        if (cancelled) return;
        setUsers(res.users || []);
        setPosts(res.posts || []);
        setPageResults(res.pages || []);
        setGroupResults(res.groups || []);
        setOpen(((res.users || []).length + (res.posts || []).length + (res.pages || []).length + (res.groups || []).length) > 0);
      } catch {
        if (!cancelled) setOpen(false);
      }
    }
    if (debounced && debounced.trim()) run();
    else { setOpen(false); setUsers([]); setPosts([]); setPageResults([]); setGroupResults([]); }
    return () => { cancelled = true; };
  }, [debounced]);

  useEffect(() => {
    const onDoc = (e) => {
      const inAnchor = panelRef.current && panelRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inAnchor && !inDropdown) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // keep dropdown aligned to the input while open
  useEffect(() => {
    if (!open) return;
    const sync = () => updatePanelPos();
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => { window.removeEventListener("resize", sync); window.removeEventListener("scroll", sync, true); };
  }, [open]);

  /* ---------------------------- lists + suggestions --------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [liveList, me] = await Promise.all([
          getLiveNow().catch(() => []),
          getMe().catch(() => null),
        ]);
        setLives(Array.isArray(liveList) ? liveList : []);
        if (!me) return;

        const pagesToLoad = (me?.pages || []).slice(0, 6);
        const groupsToLoad = (me?.groups || []).slice(0, 6);

        const [pDetails, gDetails, pS, gS] = await Promise.all([
          Promise.all(pagesToLoad.map((id) => getPage(id).catch(() => null))),
          Promise.all(groupsToLoad.map((id) => getGroup(id).catch(() => null))),
          getPageSuggestions(8).catch(() => []),
          getGroupSuggestions(8).catch(() => []),
        ]);
        if (cancelled) return;

        setMyPages(pDetails.filter(Boolean));
        setMyGroups(gDetails.filter(Boolean));
        setPageSugs(Array.isArray(pS) ? pS : []);
        setGroupSugs(Array.isArray(gS) ? gS : []);
      } catch {
        if (!cancelled) { setLives([]); setMyPages([]); setMyGroups([]); setPageSugs([]); setGroupSugs([]); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ------------------------- follow/join quick toggles ------------------------ */
  async function onToggleFollow(pageId) {
    try {
      const res = await followPage(pageId);
      if (res.following) {
        setMyPages((prev) => {
          if (prev.some((p) => String(p._id) === String(pageId))) return prev;
          const found = pageSugs.find((s) => String(s._id) === String(pageId));
          const entry = found || res.page || { _id: pageId, name: "Page", followersCount: res?.followersCount ?? 0 };
          return [entry, ...prev];
        });
      } else {
        setMyPages((prev) => prev.filter((p) => String(p._id) !== String(pageId)));
      }
    } catch {}
  }
  async function onToggleJoin(groupId) {
    try {
      const res = await joinGroup(groupId);
      if (res.joined) {
        setMyGroups((prev) => {
          if (prev.some((g) => String(g._id) === String(groupId))) return prev;
          const found = groupSugs.find((s) => String(s._id) === String(groupId));
          const entry = found || res.group || { _id: groupId, name: "Group", membersCount: res?.membersCount ?? 0 };
          return [entry, ...prev];
        });
      } else {
        setMyGroups((prev) => prev.filter((g) => String(g._id) !== String(groupId)));
      }
    } catch {}
  }

  // theme
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // 2-row cap logic helpers
  function pickPageRows() {
    const yours = myPages.slice(0, 1);
    if (yours.length === 0) return { yours: [], sugs: pageSugs.slice(0, 2) };
    return { yours, sugs: pageSugs.slice(0, 1) };
  }
  function pickGroupRows() {
    const yours = myGroups.slice(0, 1);
    if (yours.length === 0) return { yours: [], sugs: groupSugs.slice(0, 2) };
    return { yours, sugs: groupSugs.slice(0, 1) };
  }

  if (hidden) return null;

  /* ------------------------------ render ------------------------------ */
  const { yours: pagesYour, sugs: pagesSugRows } = pickPageRows();
  const { yours: groupsYour, sugs: groupsSugRows } = pickGroupRows();

  return (
    <aside
      ref={rootRef}
      data-rr="mask-rail"
      className="w-full max-w-full overflow-x-hidden shrink-0"
    >
      {/* Quick search */}
      <div className="mb-4 w-full max-w-full overflow-x-hidden">
        <div className="relative" ref={panelRef}>
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3 top-2.5 opacity-60" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Mask…"
              className="w-full rounded-2xl pl-8 pr-3 py-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none"
              onFocus={() => {
                if ((users.length + posts.length + pageResults.length + groupResults.length) > 0) { setOpen(true); updatePanelPos(); }
              }}
            />
          </div>

          {/* RESULTS DROPDOWN (rendered via portal so it can't be buried) */}
          {open && (users.length + posts.length + pageResults.length + groupResults.length > 0) && panelPos && createPortal(
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: panelPos.width, zIndex: 9999 }}
              className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl max-h-[420px]"
            >
              <div className="p-2 text-xs text-zinc-500 uppercase">Users</div>
              {users.length === 0 ? (
                <div className="px-3 pb-2 text-sm text-zinc-500">No users</div>
              ) : users.slice(0, 5).map(u => (
                <MiniRow
                  key={u._id}
                  title={u.pseudonym || "User"}
                  subtitle={u.email || ""}
                  avatarURL={u.avatarURL}
                  onClick={() => { setOpen(false); nav(ROUTES.profile(u._id)); }}
                />
              ))}

              <div className="p-2 text-xs text-zinc-500 uppercase border-t border-zinc-200 dark:border-zinc-800">Pages</div>
              {pageResults.length === 0 ? (
                <div className="px-3 pb-2 text-sm text-zinc-500">No pages</div>
              ) : pageResults.slice(0, 5).map(p => (
                <MiniRow
                  key={p._id}
                  title={p.name}
                  subtitle={`${p.followersCount ?? 0} followers`}
                  avatarURL={p.avatarURL || p.coverURL}
                  onClick={() => { setOpen(false); nav(ROUTES.page(p._id)); }}
                />
              ))}

              <div className="p-2 text-xs text-zinc-500 uppercase border-t border-zinc-200 dark:border-zinc-800">Groups</div>
              {groupResults.length === 0 ? (
                <div className="px-3 pb-2 text-sm text-zinc-500">No groups</div>
              ) : groupResults.slice(0, 5).map(g => (
                <MiniRow
                  key={g._id}
                  title={g.name}
                  subtitle={`${g.membersCount ?? 0} members`}
                  avatarURL={g.avatarURL || g.coverURL}
                  onClick={() => { setOpen(false); nav(ROUTES.group(g._id)); }}
                />
              ))}

              <div className="p-2 text-xs text-zinc-500 uppercase border-t border-zinc-200 dark:border-zinc-800">Posts</div>
              {posts.length === 0 ? (
                <div className="px-3 pb-3 text-sm text-zinc-500">No posts</div>
              ) : posts.slice(0, 5).map(p => (
                <MiniRow
                  key={p._id}
                  title={(p.author?.pseudonym || "Someone")}
                  subtitle={(p.text || "").slice(0, 80)}
                  avatarURL={p.author?.avatarURL}
                  onClick={() => { setOpen(false); nav(ROUTES.profile(p.author?._id)); }}
                />
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Live now */}
      <Card title="Live now">
        {lives.length === 0 ? (
          <div className="text-sm text-zinc-500">No one is live right now.</div>
        ) : (
          <div className="space-y-1.5">
            {lives.slice(0, 3).map((l) => (
              <MiniRow
                key={l.id || l._id}
                title={l.title || l.name || "Live"}
                subtitle={l.viewerCount != null ? `${l.viewerCount} watching` : ""}
                onClick={() => l.id && nav(`/live/${l.id}`)}
                avatarURL={l.avatarURL}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Pages */}
      <Card
        title="Pages"
        className="min-h-40"
        headerRight={
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(ROUTES.pages); }}
              className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100 whitespace-nowrap"
              type="button"
              title="More"
            >
              <ExternalLink size={14} />
              More
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPageCreate(v => !v); }}
              className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100 whitespace-nowrap"
              type="button"
              title="Create Page"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        }
      >
        {showPageCreate && (
          <form onSubmit={quickCreatePage} className="mb-3 rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="Page name"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <input
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPageCreate(false)} className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={creatingPage} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
                {creatingPage ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Your pages</div>
        {pagesYour.length === 0 ? (
          <div className="text-[0] h-0 m-0 p-0" aria-hidden />
        ) : (
          <div className="space-y-1.5 mb-3">
            {pagesYour.map((p) => (
              <MiniRow
                key={p._id}
                title={p.name}
                subtitle={`${p.followersCount ?? 0} followers`}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFollow(p._id); }}
                    className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 whitespace-nowrap shrink-0"
                    type="button"
                  >
                    Unfollow
                  </button>
                }
                onClick={() => nav(ROUTES.page(p._id))}
                avatarURL={p.avatarURL || p.coverURL}
              />
            ))}
          </div>
        )}

        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Suggestions</div>
        {pagesSugRows.length === 0 ? (
          <div className="text-sm text-zinc-500">No suggestions now.</div>
        ) : (
          <div className="space-y-1.5">
            {pagesSugRows.map((s) => (
              <MiniRow
                key={s._id}
                title={s.name}
                subtitle={`${s.followersCount ?? 0} followers`}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFollow(s._id); }}
                    className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 whitespace-nowrap shrink-0"
                    type="button"
                  >
                    Follow
                  </button>
                }
                onClick={() => nav(ROUTES.page(s._id))}
                avatarURL={s.avatarURL || s.coverURL}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Groups */}
      <Card
        title="Groups"
        className="min-h-40"
        headerRight={
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(ROUTES.groups); }}
              className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100 whitespace-nowrap"
              type="button"
              title="More"
            >
              <ExternalLink size={14} />
              More
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowGroupCreate(v => !v); }}
              className="text-xs font-normal flex items-center gap-1 opacity-80 hover:opacity-100 whitespace-nowrap"
              type="button"
              title="Quick create group"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        }
      >
        {showGroupCreate && (
          <form onSubmit={quickCreateGroup} className="mb-3 rounded-2xl p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <input
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="Group name"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <select
              value={gPrivacy}
              onChange={(e) => setGPrivacy(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <input
              value={gDesc}
              onChange={(e) => setGDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="w-full rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 outline-none"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowGroupCreate(false)} className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={creatingGroup} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
                {creatingGroup ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Your groups</div>
        {groupsYour.length === 0 ? (
          <div className="text-[0] h-0 m-0 p-0" aria-hidden />
        ) : (
          <div className="space-y-1.5 mb-3">
            {groupsYour.map((g) => (
              <MiniRow
                key={g._id}
                title={g.name}
                subtitle={`${g.membersCount ?? 0} members`}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleJoin(g._id); }}
                    className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 whitespace-nowrap shrink-0"
                    type="button"
                  >
                    Leave
                  </button>
                }
                onClick={() => nav(ROUTES.group(g._id))}
                avatarURL={g.avatarURL || g.coverURL}
              />
            ))}
          </div>
        )}

        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Suggestions</div>
        {groupsSugRows.length === 0 ? (
          <div className="text-sm text-zinc-500">No suggestions now.</div>
        ) : (
          <div className="space-y-1.5">
            {groupsSugRows.map((s) => (
              <MiniRow
                key={s._id}
                title={s.name}
                subtitle={`${s.membersCount ?? 0} members`}
                trailing={
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleJoin(s._id); }}
                    className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 whitespace-nowrap shrink-0"
                    type="button"
                  >
                    Join
                  </button>
                }
                onClick={() => nav(ROUTES.group(s._id))}
                avatarURL={s.avatarURL || s.coverURL}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Theme toggle (fixed to viewport edge) */}
      <div className="fixed right-6 bottom-6">
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full shadow-lg flex items-center justify-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          type="button"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </aside>
  );
}

