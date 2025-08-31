// src/new-ui/components/LeftNav.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getLocalUser, logout } from "../api";
import {
  Home,
  Hash,
  Bell,
  UserRoundPlus,
  MessageSquare,
  Bookmark,
  Settings,
  User,
  MoreHorizontal,
  Edit3,
  LogOut,
  ChevronDown,
  Shield
} from "lucide-react";

/** All possible nav items (stable keys) */
const ALL_ITEMS_BASE = [
  { key: "home",          label: "Home",            icon: Home,          to: "/new" },
  { key: "explore",       label: "Explore",         icon: Hash,          to: "/explore" },
  { key: "notifications", label: "Notifications",   icon: Bell,          to: "/notifications" },
  { key: "friends",       label: "Friend Requests", icon: UserRoundPlus, to: "/friend-requests" },
  { key: "messages",      label: "Messages",        icon: MessageSquare, to: "/messages" },
  { key: "bookmarks",     label: "Bookmarks",       icon: Bookmark,      to: "/bookmarks" },
  { key: "settings",      label: "Settings",        icon: Settings,      to: "/settings" },
  // profile path is resolved at runtime
  { key: "profile",       label: "Profile",         icon: User,          to: null },
];

const DEFAULT_PINNED = ["home","explore","notifications","friends","messages","bookmarks"];
const STORAGE_KEY = "leftnav_pinned_v1";
const LOCKED_KEYS = new Set(["home"]); // keep Home always in main list (disable its checkbox)

// local helper
function useLocalUser() {
  return useMemo(() => {
    const u = getLocalUser() || {};
    return {
      id: u.id || u._id || null,
      role: u.role || "user",
      pseudonym: u.pseudonym || "User",
      avatarURL: u.avatarURL || "",
    };
  }, []);
}

export default function LeftNav() {
  const me = useLocalUser();
  const { pathname } = useLocation();

  // is this device “admin-ok” via key?
  const adminOk = (localStorage.getItem("admin_ok") === "1") ||
                  Boolean(localStorage.getItem("admin_key"));

  // compute full item list; append Admin only if allowed
  const ALL_ITEMS = useMemo(() => {
    const items = [...ALL_ITEMS_BASE];
    if (me.role === "admin" || adminOk) {
      items.splice(6, 0, { key: "admin", label: "Admin", icon: Shield, to: "/admin" });
    }
    return items;
  }, [me.role, adminOk]);

  // ----- pinned / more  -----
  const [pinnedKeys, setPinnedKeys] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : DEFAULT_PINNED;
      return Array.isArray(arr) && arr.length ? arr : DEFAULT_PINNED;
    } catch {
      return DEFAULT_PINNED;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedKeys)); } catch {}
  }, [pinnedKeys]);

  const resolvedItems = useMemo(() => {
    return ALL_ITEMS.map((i) =>
      i.key === "profile" ? { ...i, to: me.id ? `/profile/${me.id}` : "/profile" } : i
    );
  }, [ALL_ITEMS, me.id]);

  const pinned = resolvedItems.filter((i) => pinnedKeys.includes(i.key));
  const more = resolvedItems.filter((i) => !pinnedKeys.includes(i.key));

  // ----- dropdowns -----
  const [moreOpen, setMoreOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const moreRef = useRef(null);
  const acctRef = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // ----- Compose = customize modal -----
  const [editOpen, setEditOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState(pinnedKeys);

  function openComposeConfigurator() {
    setDraftKeys(pinnedKeys);
    setEditOpen(true);
  }
  function toggleDraftKey(k) {
    if (LOCKED_KEYS.has(k)) return;
    setDraftKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }
  function saveDraft() {
    // ensure locked keys always present
    const next = Array.from(new Set([...draftKeys, ...LOCKED_KEYS]));
    setPinnedKeys(next);
    setEditOpen(false);
  }
  function resetDefaults() {
    setDraftKeys(DEFAULT_PINNED);
  }

  function isActive(to) {
    if (!to) return false;
    return to === "/new" ? pathname === "/new" : pathname.startsWith(to);
  }

  return (
    <aside className="w-[272px] shrink-0 sticky top-0 self-start">
      <div className="rounded-3xl bg-white/80 dark:bg-zinc-950/80 backdrop-blur border border-zinc-200 dark:border-zinc-800 px-5 py-6">
        <div className="text-3xl font-black tracking-tight mb-4">Mask</div>

        {/* Pinned */}
        <nav className="space-y-1">
          {pinned.map((item) => (
            <Link
              key={item.key}
              to={item.to || "/new"}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                isActive(item.to) ? "bg-zinc-100 dark:bg-zinc-900 font-medium" : ""
              }`}
              onClick={() => setMoreOpen(false)}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}

          {/* More */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
              type="button"
            >
              <span className="flex items-center gap-3">
                <MoreHorizontal size={20} />
                <span className="font-medium">More</span>
              </span>
              <ChevronDown size={18} className={`transition ${moreOpen ? "rotate-180" : ""}`} />
            </button>

            {moreOpen && (
              <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden">
                {more.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to || "/new"}
                    onClick={() => setMoreOpen(false)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-2"
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Compose => open configurator */}
          <div className="pt-3">
            <button
              onClick={openComposeConfigurator}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-sky-600 text-white py-3 font-semibold hover:bg-sky-700"
              type="button"
            >
              <Edit3 size={18} />
              <span>Compose</span>
            </button>
          </div>
        </nav>

        {/* Account */}
        <div className="mt-6 relative" ref={acctRef}>
          <button
            onClick={() => setAcctOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
            type="button"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
              {me.avatarURL ? <img src={me.avatarURL} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">{me.pseudonym}</div>
            </div>
            <ChevronDown size={18} className={`transition ${acctOpen ? "rotate-180" : ""}`} />
          </button>

          {acctOpen && (
            <div className="absolute left-0 right-0 bottom-12 z-30 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden">
              <button
                onClick={async () => {
                  setAcctOpen(false);
                  await logout();
                  window.location.assign("/login-new");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-2"
                type="button"
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compose / Customize modal */}
      {editOpen && (
        <div className="fixed inset-0 z-[9999]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditOpen(false)} />
          <div className="absolute left-1/2 top-16 -translate-x-1/2 w-[560px] max-w-[92vw] rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="text-lg font-semibold">Customize your left menu</div>
              <div className="text-xs text-zinc-500 mt-1">
                Select which items show in the main list. Others will appear under “More”.
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
              {resolvedItems.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="flex items-center gap-3">
                    <item.icon size={18} />
                    <span className="text-sm">{item.label}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={draftKeys.includes(item.key) || LOCKED_KEYS.has(item.key)}
                    onChange={() => toggleDraftKey(item.key)}
                    disabled={LOCKED_KEYS.has(item.key)}
                  />
                </label>
              ))}
            </div>

            <div className="px-5 py-4 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800">
              <button
                onClick={resetDefaults}
                className="text-sm px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                type="button"
              >
                Reset to defaults
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditOpen(false)}
                  className="text-sm px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDraft}
                  className="text-sm px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
