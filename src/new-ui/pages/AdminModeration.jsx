// src/new-ui/pages/AdminModeration.jsx
import React, { useEffect, useMemo, useState } from "react";

function useAuthHeaders() {
  // If your backend uses cookies, `credentials: "include"` is enough.
  // If you also store a token, add it to the Authorization header.
  const token = (() => {
    try { return JSON.parse(localStorage.getItem("token") || "null"); } catch { return null; }
  })();
  return useMemo(() => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);
}

export default function AdminModeration() {
  const headers = useAuthHeaders();

  const [tab, setTab] = useState("pages"); // "pages" | "groups"
  const [search, setSearch] = useState("");
  const [disabledFilter, setDisabledFilter] = useState(""); // "", "true", "false"

  const [pages, setPages] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadPages() {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (disabledFilter !== "") qs.set("disabled", disabledFilter);
      const res = await fetch(`/api/admin/pages?${qs.toString()}`, {
        method: "GET",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Failed to load pages");
      setPages(await res.json());
    } catch (e) {
      setErr(e?.message || "Failed to load pages");
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (disabledFilter !== "") qs.set("disabled", disabledFilter);
      const res = await fetch(`/api/admin/groups?${qs.toString()}`, {
        method: "GET",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Failed to load groups");
      setGroups(await res.json());
    } catch (e) {
      setErr(e?.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "pages") loadPages();
    else loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]); // initial + when switching tabs

  async function refresh() {
    if (tab === "pages") await loadPages();
    else await loadGroups();
  }

  function Toolbar() {
    return (
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        />
        <select
          value={disabledFilter}
          onChange={(e) => setDisabledFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
        >
          <option value="">All</option>
          <option value="false">Enabled</option>
          <option value="true">Disabled</option>
        </select>
        <button
          onClick={refresh}
          className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm"
          type="button"
        >
          Reload
        </button>
      </div>
    );
  }

  async function handleTogglePage(p) {
    try {
      const path = p.disabled ? "enable" : "disable";
      const res = await fetch(`/api/admin/pages/${p._id}/${path}`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Failed");
      await refresh();
    } catch (e) {
      setErr(e?.message || "Failed to toggle");
    }
  }

  async function handleDeletePage(p) {
    if (!window.confirm(`Delete page "${p.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/pages/${p._id}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Delete failed");
      await refresh();
    } catch (e) {
      setErr(e?.message || "Failed to delete");
    }
  }

  async function handleToggleGroup(g) {
    try {
      const path = g.disabled ? "enable" : "disable";
      const res = await fetch(`/api/admin/groups/${g._id}/${path}`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Failed");
      await refresh();
    } catch (e) {
      setErr(e?.message || "Failed to toggle");
    }
  }

  async function handleDeleteGroup(g) {
    if (!window.confirm(`Delete group "${g.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/groups/${g._id}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json())?.message || "Delete failed");
      await refresh();
    } catch (e) {
      setErr(e?.message || "Failed to delete");
    }
  }

  // Trigger search/filter apply
  async function applyFilters(e) {
    e?.preventDefault?.();
    await refresh();
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="mb-4">
        <div className="text-2xl font-bold">Admin moderation</div>
        <div className="text-sm text-zinc-500">Pages & Groups</div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("pages")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${tab === "pages" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          Pages
        </button>
        <button
          type="button"
          onClick={() => setTab("groups")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${tab === "groups" ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          Groups
        </button>
      </div>

      <form onSubmit={applyFilters}>
        <Toolbar />
      </form>

      {err && (
        <div className="mb-3 text-sm text-rose-600">
          {err}
        </div>
      )}

      {loading && <div className="text-sm text-zinc-500">Loading…</div>}

      {!loading && tab === "pages" && (
        <div className="space-y-2">
          {pages.map((p) => (
            <div
              key={p._id}
              className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden">
                  {p.avatarURL ? <img src={p.avatarURL} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    {p.disabled ? "Disabled" : "Enabled"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTogglePage(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${p.disabled ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}`}
                >
                  {p.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePage(p)}
                  className="px-3 py-1.5 rounded-lg text-sm bg-rose-600 text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!pages.length && (
            <div className="text-sm text-zinc-500">No pages found.</div>
          )}
        </div>
      )}

      {!loading && tab === "groups" && (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g._id}
              className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden">
                  {g.avatarURL ? <img src={g.avatarURL} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{g.name}</div>
                  <div className="text-xs text-zinc-500">
                    {g.disabled ? "Disabled" : "Enabled"} · {g.privacy || "public"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleGroup(g)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${g.disabled ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}`}
                >
                  {g.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(g)}
                  className="px-3 py-1.5 rounded-lg text-sm bg-rose-600 text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!groups.length && (
            <div className="text-sm text-zinc-500">No groups found.</div>
          )}
        </div>
      )}
    </div>
  );
}
