// src/new-ui/pages/Admin.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Flag, Users, CheckCircle, XCircle, Loader2, Search,
  Ban, UserCheck, Quote, FileText, LayoutGrid, Filter
} from "lucide-react";

/* ---------------- helpers ---------------- */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* tolerate non-JSON */ }
  if (!res.ok) {
    const err = new Error(data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function Empty({ children }) {
  return (
    <div className="text-sm text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-8 text-center">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <Loader2 className="animate-spin" size={16} />
      Loading…
    </div>
  );
}

/* ---------------- Tiny modal ---------------- */
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl p-4 shadow-2xl">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="max-h-[60vh] overflow-auto">{children}</div>
        <div className="mt-3 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

/* ---------------- Tabs header ---------------- */
function Tabs({ value, onChange }) {
  const items = [
    { key: "reports",    label: "Reports",     Icon: Flag },
    { key: "users",      label: "Users",       Icon: Users },
    { key: "pages",      label: "Pages",       Icon: FileText },
    { key: "groups",     label: "Groups",      Icon: LayoutGrid },
    { key: "motivation", label: "Motivation",  Icon: Quote },
    { key: "factchecks", label: "Fact-checks", Icon: CheckCircle },
  ];
  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 mb-4">
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm ${
            value === key
              ? "bg-zinc-100 dark:bg-zinc-900 font-medium"
              : "hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
          }`}
          type="button"
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ===================== Reports ===================== */
function ReportsTab() {
  const [items, setItems]   = useState([]);
  const [page, setPage]     = useState(1);
  const [hasMore, setMore]  = useState(false);
  const [status, setStatus] = useState("open");
  const [targetType, setT]  = useState("");
  const [q, setQ]           = useState("");
  const [loading, setLoad]  = useState(false);
  const [err, setErr]       = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status)     p.set("status", status);
    if (targetType) p.set("targetType", targetType);
    if (q.trim())   p.set("q", q.trim());
    p.set("page", String(page));
    p.set("limit", "20");
    return p.toString();
  }, [status, targetType, q, page]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoad(true); setErr("");
        const data = await fetchJSON(`/api/admin/reports?${qs}`);
        if (!ignore) {
          setItems(data.items || []);
          setMore(!!data.hasMore);
        }
      } catch (e) {
        if (!ignore) setErr(e.message || "Failed to load reports");
      } finally {
        if (!ignore) setLoad(false);
      }
    })();
    return () => { ignore = true; };
  }, [qs]);

  async function act(id, action) {
    try {
      setErr("");
      const path = action === "resolve" ? "resolve" : "dismiss";
      await fetchJSON(`/api/admin/reports/${id}/${path}`, { method: "POST", body: JSON.stringify({}) });
      const data = await fetchJSON(`/api/admin/reports?${qs}`);
      setItems(data.items || []);
      setMore(!!data.hasMore);
    } catch (e) {
      setErr(e.message || "Failed to update report");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Status</label>
          <select
            className="px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Target</label>
          <select
            className="px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
            value={targetType}
            onChange={(e) => { setPage(1); setT(e.target.value); }}
          >
            <option value="">All</option>
            <option value="post">Post</option>
            <option value="comment">Comment</option>
            <option value="user">User</option>
            <option value="page">Page</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
          <input
            className="w-full pl-7 pr-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="Search reason/note…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
        </div>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && items.length === 0 && <Empty>No reports found.</Empty>}

      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r._id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">{r.targetType}</span>
                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">{r.status}</span>
                <span className="text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              {r.status === "open" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => act(r._id, "resolve")}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-emerald-500/40 hover:bg-emerald-500/10"
                    type="button"
                  >
                    <CheckCircle size={14} /> Resolve
                  </button>
                  <button
                    onClick={() => act(r._id, "dismiss")}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-rose-500/40 hover:bg-rose-500/10"
                    type="button"
                  >
                    <XCircle size={14} /> Dismiss
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 text-sm">
              <div className="font-medium">Reason: <span className="font-normal">{r.reason}</span></div>
              {r.note ? <div className="text-zinc-600 dark:text-zinc-300">Note: {r.note}</div> : null}
              <div className="mt-1 text-xs text-zinc-500">
                Reporter: {r.reporterUser?.pseudonym || "—"}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Prev
        </button>
        <span className="text-xs text-zinc-500">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ====================== Users ====================== */
function UsersTab() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("search", q.trim());
    p.set("page", String(page));
    p.set("limit", "20");
    return p.toString();
  }, [q, page]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true); setErr("");
        const data = await fetchJSON(`/api/admin/users?${qs}`);
        if (!ignore) {
          setItems(data.items || []);
          setHasMore(!!data.hasMore);
        }
      } catch (e) {
        if (!ignore) setErr(e.message || "Failed to load users");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [qs]);

  async function toggle(id) {
    try {
      setErr("");
      await fetchJSON(`/api/admin/users/${id}/toggle-disable`, { method: "POST", body: JSON.stringify({}) });
      const data = await fetchJSON(`/api/admin/users?${qs}`);
      setItems(data.items || []);
      setHasMore(!!data.hasMore);
    } catch (e) {
      setErr(e.message || "Failed to update user");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
          <input
            className="w-full pl-7 pr-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="Search pseudonym/email…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
        </div>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && items.length === 0 && <Empty>No users found.</Empty>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="py-2 pr-3">User</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u._id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    {u.avatarURL ? (
                      <img src={u.avatarURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    )}
                    <Link to={`/profile/${u._id}`} className="hover:underline">
                      {u.pseudonym || "—"}
                    </Link>
                  </div>
                </td>
                <td className="py-2 pr-3">{u.email || "—"}</td>
                <td className="py-2 pr-3">{u.role}</td>
                <td className="py-2 pr-3">
                  {u.disabled ? (
                    <span className="inline-flex items-center gap-1 text-rose-600">
                      <Ban size={14} /> Disabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <UserCheck size={14} /> Active
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="py-2 pr-0 text-right">
                  <button
                    onClick={() => toggle(u._id)}
                    className="px-3 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                    type="button"
                  >
                    {u.disabled ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Prev
        </button>
        <span className="text-xs text-zinc-500">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ====================== Pages ====================== */
function PagesTab() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all|enabled|disabled
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("search", q.trim());
    if (filter !== "all") p.set("disabled", filter === "disabled" ? "true" : "false");
    return p.toString();
  }, [q, filter]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const data = await fetchJSON(`/api/admin/pages?${qs}`);
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(list);
    } catch (e) {
      setErr(e.message || "Failed to load pages");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  async function toggle(p) {
    try {
      setErr("");
      const path = p.disabled ? "enable" : "disable";
      await fetchJSON(`/api/admin/pages/${p._id}/${path}`, { method: "POST", body: JSON.stringify({}) });
      load();
    } catch (e) {
      setErr(e.message || "Failed to update page");
    }
  }

  async function remove(id) {
    const ok = window.confirm("Delete this page? This cannot be undone.");
    if (!ok) return;
    try {
      setErr("");
      await fetchJSON(`/api/admin/pages/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e.message || "Failed to delete page");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
          <input
            className="w-full pl-7 pr-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="Search pages…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          onClick={load}
          className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
          type="button"
        >
          Reload
        </button>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && items.length === 0 && <Empty>No pages found.</Empty>}

      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p._id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {p.avatarURL ? (
                <img src={p.avatarURL} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              )}
              <div className="text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-500">
                  {p.category || "—"} · {(p.followers || []).length} followers
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${p.disabled ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
                {p.disabled ? "Disabled" : "Enabled"}
              </span>
              <button
                onClick={() => toggle(p)}
                className="px-3 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                type="button"
              >
                {p.disabled ? "Enable" : "Disable"}
              </button>
              <button
                onClick={() => remove(p._id)}
                className="px-3 py-1 text-xs rounded-md border border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600"
                type="button"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ====================== Groups ====================== */
function GroupsTab() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all|enabled|disabled
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("search", q.trim());
    if (filter !== "all") p.set("disabled", filter === "disabled" ? "true" : "false");
    return p.toString();
  }, [q, filter]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const data = await fetchJSON(`/api/admin/groups?${qs}`);
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(list);
    } catch (e) {
      setErr(e.message || "Failed to load groups");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  async function toggle(g) {
    try {
      setErr("");
      const path = g.disabled ? "enable" : "disable";
      await fetchJSON(`/api/admin/groups/${g._id}/${path}`, { method: "POST", body: JSON.stringify({}) });
      load();
    } catch (e) {
      setErr(e.message || "Failed to update group");
    }
  }

  async function remove(id) {
    const ok = window.confirm("Delete this group? This cannot be undone.");
    if (!ok) return;
    try {
      setErr("");
      await fetchJSON(`/api/admin/groups/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e.message || "Failed to delete group");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
          <input
            className="w-full pl-7 pr-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="Search groups…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          onClick={load}
          className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
          type="button"
        >
          Reload
        </button>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && items.length === 0 && <Empty>No groups found.</Empty>}

      <ul className="space-y-2">
        {items.map((g) => (
          <li key={g._id} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {g.avatarURL ? (
                <img src={g.avatarURL} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              )}
              <div className="text-sm">
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-zinc-500">
                  {g.privacy || "public"} · {(g.members || []).length} members
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${g.disabled ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
                {g.disabled ? "Disabled" : "Enabled"}
              </span>
              <button
                onClick={() => toggle(g)}
                className="px-3 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                type="button"
              >
                {g.disabled ? "Enable" : "Disable"}
              </button>
              <button
                onClick={() => remove(g._id)}
                className="px-3 py-1 text-xs rounded-md border border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600"
                type="button"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ====================== Motivation ====================== */
function MotivationTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tone, setTone] = useState("");
  const [tag, setTag] = useState("");
  const [lang, setLang] = useState("");
  const [stats, setStats] = useState({ total: 0, deliveries7d: 0, topTags: [] });

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ text: "", author: "", tone: "inspiration", tags: "", lang: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (tone) sp.set("tone", tone);
      if (tag) sp.set("tag", tag);
      if (lang) sp.set("lang", lang);
      const list = await fetchJSON(`/api/admin/motivation?${sp.toString()}`);
      setItems(Array.isArray(list?.rows) ? list.rows : Array.isArray(list) ? list : []);
      try {
        const st = await fetchJSON(`/api/admin/motivation/stats`);
        setStats({
          total: st?.total || 0,
          deliveries7d: st?.deliveries7d || 0,
          topTags: st?.topTags || [],
        });
      } catch { /* optional */ }
    } catch (e) {
      setErr(e.message || "Failed to load quotes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, tone, tag, lang]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditRow(null);
    setForm({ text: "", author: "", tone: "inspiration", tags: "", lang: "" });
    setEditOpen(true);
  }
  function openEdit(row) {
    setEditRow(row);
    setForm({
      text: row.text || "",
      author: row.author || "",
      tone: row.tone || "inspiration",
      tags: (row.tags || []).join(", "),
      lang: row.lang || "",
    });
    setEditOpen(true);
  }

  async function save() {
    try {
      setErr("");
      const payload = {
        text: form.text,
        author: form.author,
        tone: form.tone,
        tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
        lang: form.lang || undefined,
      };
      if (editRow?._id) {
        await fetchJSON(`/api/admin/motivation/${editRow._id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await fetchJSON(`/api/admin/motivation`, { method: "POST", body: JSON.stringify(payload) });
      }
      setEditOpen(false);
      await load();
    } catch (e) {
      setErr(e.message || "Failed to save");
    }
  }

  async function removeRow(row) {
    const ok = window.confirm("Delete this quote?");
    if (!ok) return;
    try {
      await fetchJSON(`/api/admin/motivation/${row._id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e.message || "Failed to delete");
    }
  }

  async function sendTest() {
    try {
      await fetchJSON(`/api/admin/motivation/test`, { method: "POST", body: JSON.stringify({}) });
      alert("Sent (if test endpoint is enabled).");
    } catch (e) {
      alert(e.message || "Test failed");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Total quotes</div>
          <div className="text-2xl font-semibold">{stats.total || items.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Deliveries (7d)</div>
          <div className="text-2xl font-semibold">{stats.deliveries7d}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">Top tags</div>
          <div className="text-sm">{(stats.topTags || []).slice(0, 3).join(", ") || "—"}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2 top-2.5 opacity-60" />
          <input
            className="w-full pl-7 pr-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="Search text/author…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="opacity-70" />
          <select className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="">All tones</option>
            <option value="inspiration">Inspiration</option>
            <option value="humor">Light humor</option>
          </select>
          <input
            className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <input
            className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            placeholder="lang (en)"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          />
          <button onClick={load} className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm" type="button">
            Apply
          </button>
        </div>
        <div className="flex-1" />
        <button onClick={sendTest} className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm" type="button">
          Send me a test
        </button>
        <button onClick={openNew} className="px-3 py-2 rounded-md bg-sky-600 text-white text-sm" type="button">
          + New quote
        </button>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && items.length === 0 && <Empty>No results.</Empty>}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-3">Text</th>
                <th className="py-2 pr-3">Author</th>
                <th className="py-2 pr-3">Tone</th>
                <th className="py-2 pr-3">Tags</th>
                <th className="py-2 pr-3">Lang</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-3 max-w-[380px]">
                    <div className="line-clamp-2">{row.text}</div>
                  </td>
                  <td className="py-2 pr-3">{row.author || "—"}</td>
                  <td className="py-2 pr-3">{row.tone || "inspiration"}</td>
                  <td className="py-2 pr-3">{(row.tags || []).join(", ") || "—"}</td>
                  <td className="py-2 pr-3">{row.lang || "—"}</td>
                  <td className="py-2 pr-0 text-right">
                    <button
                      onClick={() => openEdit(row)}
                      className="px-3 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 mr-2"
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeRow(row)}
                      className="px-3 py-1 text-xs rounded-md border border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600"
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editRow ? "Edit quote" : "New quote"}
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700" type="button">
              Cancel
            </button>
            <button onClick={save} className="px-3 py-2 rounded-md bg-sky-600 text-white" type="button">
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Text</div>
            <textarea
              className="w-full min-h-[100px] px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Author</div>
              <input
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Tone</div>
              <select
                className="w-full px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                value={form.tone}
                onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
              >
                <option value="inspiration">Inspiration</option>
                <option value="humor">Light humor</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Tags (comma-separated)</div>
              <input
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Lang (optional)</div>
              <input
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                value={form.lang}
                onChange={(e) => setForm((f) => ({ ...f, lang: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ====================== Fact-checks ====================== */
function FactChecksTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [verdict, setVerdict] = useState("");
  const [minConf, setMinConf] = useState("0.2");
  const [maxConf, setMaxConf] = useState("0.8");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    if (verdict) sp.set("verdict", verdict);
    if (minConf) sp.set("minConf", minConf);
    if (maxConf) sp.set("maxConf", maxConf);
    sp.set("page", String(page));
    sp.set("limit", String(limit));
    return sp.toString();
  }, [verdict, minConf, maxConf, page, limit]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const res = await fetchJSON(`/api/admin/factchecks?${qs}`);
      setRows(res?.rows || []);
      setTotal(Number(res?.total || 0));
    } catch (e) {
      setErr(e.message || "Failed to load fact-checks");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <select className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" value={verdict} onChange={(e) => { setPage(1); setVerdict(e.target.value); }}>
          <option value="">All verdicts</option>
          <option value="true">true</option>
          <option value="false">false</option>
          <option value="unverified">unverified</option>
        </select>
        <div>
          <div className="text-xs text-zinc-500">Min conf.</div>
          <input className="w-24 px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" value={minConf} onChange={(e) => setMinConf(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-zinc-500">Max conf.</div>
          <input className="w-24 px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" value={maxConf} onChange={(e) => setMaxConf(e.target.value)} />
        </div>
        <button onClick={() => { setPage(1); load(); }} className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm" type="button">
          Apply
        </button>
        <div className="flex-1" />
        <select className="px-2 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm" value={limit} onChange={(e) => { setPage(1); setLimit(Number(e.target.value)); }}>
          {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {loading && <Spinner />}
      {err && <div className="text-sm text-rose-500 mb-2">{err}</div>}
      {!loading && rows.length === 0 && <Empty>No results.</Empty>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-2 pr-3">Post</th>
                <th className="py-2 pr-3">Snippet</th>
                <th className="py-2 pr-3">Verdict</th>
                <th className="py-2 pr-3">Confidence</th>
                <th className="py-2 pr-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id || `${r.postId}-${r.when || ""}`} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-3">
                    <Link to={`/post/${r.postId}`} className="text-sky-600 hover:underline">{String(r.postId).slice(-8)}</Link>
                  </td>
                  <td className="py-2 pr-3 max-w-[420px]">
                    <div className="line-clamp-2">{r.snippet || r.text || "—"}</div>
                  </td>
                  <td className="py-2 pr-3">{r.verdict || "unverified"}</td>
                  <td className="py-2 pr-3">{Math.round((r.confidence || 0) * 100)}%</td>
                  <td className="py-2 pr-3">{r.when ? new Date(r.when).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Prev
        </button>
        <span className="text-xs text-zinc-500">Page {page} / {Math.max(1, Math.ceil(total / limit))}</span>
        <button
          onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(total / limit)), p + 1))}
          disabled={page >= Math.max(1, Math.ceil(total / limit))}
          className="px-3 py-1 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ====================== Admin key gate + shell ====================== */
export default function AdminPage() {
  const [tab, setTab] = useState("reports");
  const [authorized, setAuthorized] = useState(null); // null=checking, false=need key, true=ok
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  async function checkAuth() {
    try {
      setAuthorized(null);
      await fetchJSON("/api/admin/health"); // 200 only if admin session is valid
      setAuthorized(true);
    } catch {
      setAuthorized(false);
    }
  }

  useEffect(() => { checkAuth(); }, []);

  async function submitKey(e) {
    e.preventDefault();
    setError("");
    try {
      await fetchJSON("/api/admin/login", { method: "POST", body: JSON.stringify({ key }) });
      setKey("");
      await checkAuth();
    } catch (e) {
      setError(e.message || "Invalid key");
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800">
        <div className="px-4 py-3 flex items-center gap-2">
          <Shield size={18} />
          <h1 className="text-lg font-semibold">Admin</h1>
        </div>
      </div>

      <div className="px-4 py-4 max-w-6xl mx-auto">
        {authorized === null && <Empty>Checking access…</Empty>}

        {authorized === false && (
          <div className="max-w-2xl">
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
              <div className="font-semibold mb-2">Enter admin key</div>
              <div className="text-sm text-zinc-500 mb-3">
                This key must match <code>ADMIN_KEY</code> on the server.
              </div>
              <form className="flex gap-2" onSubmit={submitKey}>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Admin key"
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                />
                <button className="px-4 py-2 rounded-xl bg-sky-600 text-white">Save</button>
              </form>
              {error && <div className="text-sm text-rose-600 mt-2">{error}</div>}
            </div>
          </div>
        )}

        {authorized === true && (
          <>
            <Tabs value={tab} onChange={setTab} />
            {tab === "reports"    && <ReportsTab />}
            {tab === "users"      && <UsersTab />}
            {tab === "pages"      && <PagesTab />}
            {tab === "groups"     && <GroupsTab />}
            {tab === "motivation" && <MotivationTab />}
            {tab === "factchecks" && <FactChecksTab />}
          </>
        )}
      </div>
    </>
  );
}
