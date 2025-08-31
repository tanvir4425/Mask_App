// src/new-ui/PostCard.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { Repeat2, MoreHorizontal, Trash2 } from "lucide-react";
import {
  reactToPost, commentOnPost, sharePost, deletePost,
  toggleBookmark, loadBookmarkIdsCache, isBookmarkedLocally, getFactCheck, getPost,
} from "./api";
import { useToast } from "../context/ToastContext";
import { openReportDialog } from "./reportDialog";
import { useNavigate } from "react-router-dom";
import FactcheckSheet from "./components/FactcheckSheet";
import TrustBadge from "./components/TrustBadge"; // ✅ bring back trust badge

const REACTIONS = [
  { type: "like",  emoji: "👍", label: "Like"  },
  { type: "love",  emoji: "❤️", label: "Love"  },
  { type: "care",  emoji: "🤗", label: "Care"  },
  { type: "haha",  emoji: "😂", label: "Haha"  },
  { type: "wow",   emoji: "😮", label: "Wow"   },
  { type: "sad",   emoji: "😢", label: "Sad"   },
  { type: "angry", emoji: "😡", label: "Angry" },
];

function timeAgo(dateInput) {
  const d = new Date(dateInput);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

function useCurrentUserLite() {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        return { id: u?.id || u?._id, pseudonym: u?.pseudonym, avatarURL: u?.avatarURL || u?.avatar };
      }
    } catch {}
    return { id: null, pseudonym: null, avatarURL: null };
  }, []);
}

function ExpireCountdown({ expiresAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return <span className="text-rose-500 text-xs">expired</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return <span className="text-xs text-zinc-500">{h}h {m}m left</span>;
}

/* ----------------- helpers for deleted/anonymized users ----------------- */
function isDeletedUser(u) {
  // server sets deletedAt; fall back to heuristic (pseudonym like deleted-xxxxx) if needed
  return !!u?.deletedAt || (typeof u?.pseudonym === "string" && /^deleted[-_]/i.test(u.pseudonym));
}

/* ---------- Compact embed for originalPost ---------- */
function EmbeddedOriginal({ orig, onClickGroup, nav }) {
  if (!orig) return null;

  const scope = orig?.scope;
  const pageInfo  = orig?.page;
  const groupInfo = orig?.group;

  const deletedAuthor = isDeletedUser(orig?.author || {});
  let displayName = "User";
  let displayAvatar = null;
  let canClick = false;
  let clickName = () => {};

  if (scope === "page" && pageInfo?.name) {
    displayName = pageInfo.name;
    displayAvatar = pageInfo.avatarURL || pageInfo.coverURL || null;
    canClick = !!pageInfo?._id;
    clickName = () => canClick && nav(`/pages/${pageInfo._id}`);
  } else {
    displayName = deletedAuthor ? "Deleted user" : (orig?.author?.pseudonym || "User");
    displayAvatar = deletedAuthor ? null : (orig?.author?.avatarURL || null);
    canClick = !!orig?.author?._id && !deletedAuthor;
    clickName = () => canClick && nav(`/profile/${orig.author._id}`);
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/40">
      <div className="flex items-center gap-2 text-sm">
        <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
          {displayAvatar ? <img src={displayAvatar} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        {canClick ? (
          <button onClick={clickName} className="font-semibold hover:underline">
            {displayName}
          </button>
        ) : (
          <span className={`font-semibold ${deletedAuthor ? "text-zinc-500" : ""}`}>{displayName}</span>
        )}
        {scope === "group" && groupInfo?.name && (
          <button onClick={() => onClickGroup?.()} className="text-xs text-zinc-500 hover:underline">
            · in {groupInfo.name}
          </button>
        )}
        <span className="text-zinc-500">· {timeAgo(orig?.createdAt)}</span>
        <ExpireCountdown expiresAt={orig?.expiresAt} />
      </div>

      {orig?.text && <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{orig.text}</div>}
      {orig?.image && (
        <div className="mt-2 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <img src={orig.image} alt="" className="w-full object-cover" />
        </div>
      )}
    </div>
  );
}

/* ------------------------- identity helpers ------------------------ */
function getPostIdentity(post) {
  const isPagePost = !!post?.page;
  const isGroupPost = !!post?.group;

  const a = post?.author || {};
  const deleted = isDeletedUser(a);

  const primaryName = isPagePost
    ? post.page?.name || "Page"
    : deleted ? "Deleted user" : (a.pseudonym || "User");

  const primaryAvatar = isPagePost
    ? post.page?.avatarURL || ""
    : deleted ? "" : (a.avatarURL || "");

  let subtitle = "";
  if (isGroupPost) {
    const by = deleted ? "Deleted user" : (a.pseudonym || "Someone");
    const gname = post.group?.name || "Group";
    subtitle = `${by} · in ${gname}`;
  }

  return { primaryName, primaryAvatar, subtitle, isPagePost, isGroupPost, deletedAuthor: deleted };
}

export default function PostCard({ post, readOnly = false, onAction }) {
  const [data, setData] = useState(post);
  useEffect(() => { setData(post); }, [post]);

  const { addToast } = useToast();
  const nav = useNavigate();
  const me = useCurrentUserLite();

  const [menuOpen, setMenuOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [bookmarkReady, setBookmarkReady] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // fact-check
  const [factcheck, setFactcheck] = useState(null);
  const [fcLoaded, setFcLoaded] = useState(false);
  const [fcOpen, setFcOpen] = useState(false);

  const iOwnThis = useMemo(
    () => String(data?.author?._id || data?.author) === String(me.id),
    [data, me]
  );

  const menuRef = useRef(null);
  useEffect(() => {
    function onClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Bookmark IDs cache (load once)
  useEffect(() => {
    let alive = true;
    loadBookmarkIdsCache().then(() => {
      if (!alive) return;
      setBookmarked(isBookmarkedLocally(data?._id));
      setBookmarkReady(true);
    });
    return () => { alive = false; };
  }, [data?._id]);

  // Load fact-check result (lightweight)
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const fc = await getFactCheck(data?._id);
        if (!alive) return;
        setFactcheck(fc || null);
      } catch {
      } finally {
        if (alive) setFcLoaded(true);
      }
    }
    if (data?._id) run();
    return () => { alive = false; };
  }, [data?._id]);

  // ------------ Optimistic React ------------
  async function handleReact(type) {
    if (readOnly || !data?._id) return;

    const uid = String(me.id || "");
    setData(prev => {
      if (!prev) return prev;
      const reactions = Array.isArray(prev.reactions) ? [...prev.reactions] : [];
      const i = reactions.findIndex(r => String(r.user) === uid);
      if (i === -1) reactions.push({ user: uid, type });
      else if (reactions[i].type === type) reactions.splice(i, 1);
      else reactions[i].type = type;
      return { ...prev, reactions };
    });

    try {
      const updated = await reactToPost(data._id, type);
      setData(updated?.post || updated || data);
    } catch (e) {
      addToast(e?.response?.data?.message || "Failed to react", "error");
      try { setData(await getPost(data._id)); } catch {}
    }
  }

  async function handleComment() {
    if (readOnly || !comment.trim()) return;
    try {
      const updated = await commentOnPost(data._id, comment.trim());
      setComment("");
      addToast("Comment added", "success");
      setData(updated?.post || updated || data);
      onAction?.();
    } catch (e) {
      addToast(e?.response?.data?.message || "Failed to comment", "error");
    }
  }

  async function handleShare() {
    if (data?.scope === "group" && data?.group?.privacy === "private") {
      addToast("Posts from private groups can’t be shared.", "error");
      return;
    }
    try {
      await sharePost(data._id);
      addToast("Shared", "success");
      onAction?.();
    } catch (e) {
      addToast(e?.response?.data?.message || "Failed to share", "error");
    }
  }

  async function handleDelete() {
    try {
      await deletePost(data._id);
      addToast("Post deleted", "success");
      onAction?.();
    } catch (e) {
      addToast(e?.response?.data?.message || "Failed to delete", "error");
    }
  }

  async function handleToggleBookmark() {
    try {
      const res = await toggleBookmark(data._id);
      setBookmarked(!!res?.bookmarked);
      addToast(res?.bookmarked ? "Bookmarked" : "Removed bookmark", "success");
    } catch (e) {
      addToast(e?.response?.data?.message || "Failed to toggle bookmark", "error");
    } finally {
      setMenuOpen(false);
    }
  }

  const { primaryName, primaryAvatar, isPagePost, isGroupPost, deletedAuthor } = getPostIdentity(data);
  const isReshare = data?.type === "reshare";
  const orig = data?.originalPost;

  const showContext = fcLoaded && !!factcheck;
  const contextLabel =
    factcheck?.verdict === "true"       ? "✅ Likely true" :
    factcheck?.verdict === "false"      ? "⚠️ Likely false" :
    factcheck?.verdict === "misleading" ? "Context needed" :
    factcheck?.verdict === "outdated"   ? "Outdated" :
    factcheck?.verdict === "satire"     ? "Satire / parody" :
    factcheck?.verdict === "opinion"    ? "Opinion / not checkable" :
    "Context suggested";

  const myReaction = useMemo(() => {
    const uid = String(me.id || "");
    const arr = data?.reactions || [];
    const found = arr.find(r => String(r.user) === uid);
    return found?.type || null;
  }, [data?.reactions, me.id]);

  const reactionCounts = useMemo(() => {
    const map = Object.create(null);
    (data?.reactions || []).forEach(r => {
      map[r.type] = (map[r.type] || 0) + 1;
    });
    return map;
  }, [data?.reactions]);

  const topReactions = useMemo(() =>
    Object.entries(reactionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, n]) => ({
        type, n, emoji: REACTIONS.find(x => x.type === type)?.emoji || "🙂",
      }))
  , [reactionCounts]);

  const totalReactions = (data?.reactions || []).length;
  const likeBtnActive = myReaction ? "ring-1 ring-emerald-500/60 bg-emerald-500/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-800";

  const canVisitProfile = isPagePost
    ? !!data?.page?._id
    : !!data?.author?._id && !deletedAuthor;

  function onPrimaryNameClick() {
    if (!canVisitProfile) return;
    if (isPagePost && data?.page?._id) return nav(`/pages/${data.page._id}`);
    if (data?.author?._id) return nav(`/profile/${data.author._id}`);
  }

  return (
    <article className="px-4 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex gap-3 py-4">
        <div className="w-10 h-10 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
          {primaryAvatar ? <img src={primaryAvatar} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                {canVisitProfile ? (
                  <button onClick={onPrimaryNameClick} className="font-semibold truncate hover:underline">
                    {primaryName}
                  </button>
                ) : (
                  <span className={`font-semibold truncate ${deletedAuthor ? "text-zinc-500" : ""}`}>
                    {primaryName}
                  </span>
                )}

                {/* ✅ Trust badge restored (skip for deleted users) */}
                {(isPagePost ? data?.page?._id : data?.author?._id) && !deletedAuthor ? (
                  <TrustBadge
                    subjectType={isPagePost ? "page" : "user"}
                    subjectId={isPagePost ? data.page._id : data.author._id}
                    className="ml-1"
                  />
                ) : null}

                {isReshare && <span className="text-xs text-zinc-500">· shared</span>}
                <span className="text-zinc-500">· {timeAgo(data?.createdAt)}</span>
                <ExpireCountdown expiresAt={data?.expiresAt} />
              </div>

              {isGroupPost && (
                <div className="text-xs text-zinc-500 truncate">
                  by {deletedAuthor ? "Deleted user" : (data?.author?.pseudonym || "Someone")} ·{" "}
                  {data?.group?._id ? (
                    <button
                      onClick={() => nav(`/groups/${data.group._id}`)}
                      className="hover:underline"
                    >
                      in {data.group.name || "Group"}
                    </button>
                  ) : (
                    <>in {data?.group?.name || "Group"}</>
                  )}
                </div>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setMenuOpen(v => !v)}
                aria-label="More"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-10">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={handleToggleBookmark}
                    disabled={!bookmarkReady}
                  >
                    {bookmarked ? "🔖 Remove bookmark" : "🔖 Add bookmark"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openReportDialog({ postId: data._id });
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-2"
                  >
                    <span aria-hidden>🚩</span>
                    <span>Report…</span>
                  </button>

                  {iOwnThis && (
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
                      onClick={handleDelete}
                    >
                      <Trash2 size={16} /> Delete post
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* content (original posts) */}
          {!isReshare && data?.text && (
            <div className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">
              {data.text}
            </div>
          )}
          {!isReshare && data?.image && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <img src={data.image} alt="" className="w-full object-cover" />
            </div>
          )}

          {/* RESHARE: embedded original */}
          {isReshare && (
            <EmbeddedOriginal
              orig={orig}
              nav={nav}
              onClickGroup={() => orig?.group?._id && nav(`/groups/${orig.group._id}`)}
            />
          )}

          {/* context pill */}
          {(() => {
            if (!showContext) return null;
            return (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setFcOpen(true)}
                  className={`px-2 py-1 rounded-full text-xs border
                    ${factcheck?.verdict === "false"
                      ? "border-rose-500 text-rose-600 dark:text-rose-400"
                      : factcheck?.verdict === "misleading"
                      ? "border-amber-500 text-amber-600 dark:text-amber-400"
                      : factcheck?.verdict === "true"
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-sky-500 text-sky-600 dark:text-sky-400"}`}
                  title="Click to see context details"
                >
                  {contextLabel}
                </button>
              </div>
            );
          })()}

          {/* actions */}
          <div className="mt-3 flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="relative group">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => handleReact("like")}
                className={`px-3 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 ${likeBtnActive} disabled:opacity-60`}
                title={myReaction ? `You reacted: ${myReaction}` : "React"}
              >
                {myReaction
                  ? `${REACTIONS.find(r => r.type === myReaction)?.emoji || "🙂"} Reacted`
                  : "React"}
              </button>

              <div
                className="absolute hidden group-hover:flex -top-14 left-0 z-20 px-3 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-lg gap-3"
              >
                {REACTIONS.map((r) => (
                  <button
                    key={r.type}
                    type="button"
                    onClick={() => handleReact(r.type)}
                    className={`text-2xl leading-none p-1.5 rounded-full transition
                      ${myReaction === r.type
                        ? "ring-2 ring-emerald-500"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
                    title={r.label}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Repeat2 size={16} /> Share
            </button>

            <div className="flex-1" />

            <div className="text-xs text-zinc-500 flex items-center gap-2">
              {topReactions.map((t) => (
                <span
                  key={t.type}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border
                    ${myReaction === t.type
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-zinc-300 dark:border-zinc-700"}`}
                  title={t.type}
                >
                  <span>{t.emoji}</span>
                  <span>x{t.n}</span>
                </span>
              ))}
              <span className="opacity-60">· {totalReactions}</span>
              <span className="ml-3">{data?.comments?.length || 0} comments</span>
              <span>{data?.shares?.length || 0} shares</span>
            </div>
          </div>

          {/* comments */}
          <div className="mt-3 flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
              {me?.avatarURL ? <img src={me.avatarURL} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="flex-1">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Write a comment…"
                rows={1}
                className="w-full resize-none rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2 text-sm outline-none"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleComment}
                  disabled={!comment.trim() || readOnly}
                  className="px-3 py-1 rounded-full bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Comment
                </button>
              </div>
            </div>
          </div>

          {/* existing comments */}
          <div className="mt-3 space-y-3">
            {(data?.comments || []).map((c, i) => {
              const cu = c?.user || {};
              const cDeleted = isDeletedUser(cu);
              const cName = cDeleted ? "Deleted user" : (cu?.pseudonym || "User");
              const cAvatar = cDeleted ? "" : (cu?.avatarURL || "");

              return (
                <div key={c._id || i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
                    {cAvatar ? <img src={cAvatar} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm">
                      <span className={`font-semibold mr-2 ${cDeleted ? "text-zinc-500" : ""}`}>
                        {cName}
                      </span>
                      <span className="text-xs text-zinc-500">{timeAgo(c?.createdAt)}</span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{c?.text || c?.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <FactcheckSheet open={fcOpen} onClose={() => setFcOpen(false)} factcheck={factcheck} />
    </article>
  );
}
