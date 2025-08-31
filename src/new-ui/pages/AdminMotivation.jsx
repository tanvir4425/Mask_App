// src/new-ui/pages/AdminMotivation.jsx
import React, { useEffect, useState, useCallback } from "react";

const API_BASE = "/api/admin/motivation";
const PAGE_SIZE = 20;

function devHeaders() {
  // Optional dev bypass: put this in console during local dev:
  // localStorage.setItem('adminKey','dev-admin-key')
  let h = { "Content-Type": "application/json" };
  try {
    const k = localStorage.getItem("adminKey");
    if (k) h["X-Admin-Key"] = k;
  } catch {}
  return h;
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: devHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {}
    throw new Error(msg);
  }
  try { return await res.json(); } catch { return {}; }
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminMotivation() {
  const [search, setSearch] = useState("");
  const [tone, setTone] = useState("");
  const [tag, setTag] = useState("");
  const [lang, setLang] = useState("");

  const debSearch = useDebounced(search, 350);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    text: "",
    author: "",
    tone: "inspiration",
    tags: "",
    lang: "en",
  });
  const isEdit = !!editing?._id;

  const [health, setHealth] = useState({
    totalQuotes: 0,
    deliveries7d: 0,
    topTags: [],
  });

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [err, setErr] = useState("");

  // ---- load list, aligned to backend (/quotes) ----
  const loadList = useCallback(async () => {
    setErr("");
    const qs = new URLSearchParams({
      search: debSearch || "",
      tone: tone || "",
      tag: tag || "",
      lang: lang || "",
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    try {
      // primary (correct) endpoint
      const d = await api(`${API_BASE}/quotes?${qs.toString()}`);
      const items = d.items || [];
      const total = Number(d.total || items.length || 0);
      const limit = Number(d.limit || PAGE_SIZE);
      setRows(items);
      setPages(Math.max(1, Math.ceil(total / limit)));
    } catch (e) {
      // compatibility: if server only has legacy handlers
      try {
        const d = await api(`${API_BASE}?${qs.toString()}`);
        const items = d.items || d.rows || [];
        const total = Number(d.total || items.length || 0);
        const limit = Number(d.limit || PAGE_SIZE);
        setRows(items);
        setPages(Math.max(1, Math.ceil(total / limit)));
      } catch (ee) {
        setErr(ee.message || "Failed to load");
        setRows([]);
        setPages(1);
      }
    }
  }, [debSearch, tone, tag, lang, page]);

  async function loadHealth() {
    setErr("");
    try {
      const d = await api(`${API_BASE}/health`);
      setHealth(d || {});
    } catch (e) {
      setErr(e.message || "Failed to load health");
    }
  }

  useEffect(() => { loadHealth(); }, []); // eslint-disable-line
  useEffect(() => { loadList(); }, [loadList]);

  function resetForm() {
    setEditing(null);
    setForm({ text: "", author: "", tone: "inspiration", tags: "", lang: "en" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    const body = {
      ...form,
      tags: (form.tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (isEdit) {
        // new path
        try {
          await api(`${API_BASE}/quotes/${editing._id}`, {
            method: "PUT",
            body,
          });
        } catch {
          // legacy path
          await api(`${API_BASE}/${editing._id}`, { method: "PUT", body });
        }
      } else {
        // new path
        try {
          await api(`${API_BASE}/quotes`, { method: "POST", body });
        } catch {
          // legacy path
          await api(`${API_BASE}`, { method: "POST", body });
        }
      }
      resetForm();
      setPage(1);
      await loadList();
    } catch (e) {
      setErr(e.message || "Save failed");
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this quote?")) return;
    setErr("");
    try {
      try {
        await api(`${API_BASE}/quotes/${id}`, { method: "DELETE" });
      } catch {
        await api(`${API_BASE}/${id}`, { method: "DELETE" });
      }
      await loadList();
    } catch (e) {
      setErr(e.message || "Delete failed");
    }
  }

  // Show who would receive something, do NOT send
  const onPreviewAudience = async () => {
    setErr("");
    try {
      // proper endpoint
      const d = await api(`${API_BASE}/quotes/preview`, {
        method: "POST",
        body: { tone: form.tone, tags: form.tags },
      });
      const n = d?.estimatedUsers ?? 0;
      const sample =
        (d?.sampleUsers || [])
          .map((u) => u?.pseudonym || u?._id)
          .filter(Boolean)
          .join(", ") || "—";
      alert(`Estimated users matched: ${n}\nSample: ${sample}`);
    } catch {
      // legacy alias
      const d = await api(`${API_BASE}/preview`, {
        method: "POST",
        body: { tone: form.tone, tags: form.tags },
      });
      const n = d?.estimatedUsers ?? 0;
      alert(`Estimated users matched: ${n}`);
    }
  };

  // Push a test motivation to current admin
  const onSendMeATest = async () => {
    setErr("");
    try {
      try {
        await api(`${API_BASE}/send-test`, { method: "POST", body: {} });
      } catch {
        await api(`${API_BASE}/test`, { method: "POST", body: {} });
      }
      alert("Test motivation sent to your account.");
    } catch (e) {
      alert(e.message || "Failed to send test");
    }
  };

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3 flex items-center">
          <div>
            <div className="text-xl font-bold">Admin · Motivation</div>
            <div className="text-sm text-zinc-500">
              Manage daily quotes, tones &amp; delivery
            </div>
          </div>
          <div className="ml-auto">
            <button
              onClick={onSendMeATest}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm"
              type="button"
            >
              Send me a test
            </button>
          </div>
        </div>
      </div>

      {/* Health cards */}
      <div className="px-2 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-sm text-zinc-500 mb-1">Total quotes</div>
          <div className="text-2xl font-bold">{health.totalQuotes || 0}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-sm text-zinc-500 mb-1">Deliveries (7d)</div>
          <div className="text-2xl font-bold">{health.deliveries7d || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search text/author…"
          className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none"
        />
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900"
        >
          <option value="">All tones</option>
          {/* Keep in sync with backend validators */}
          {["inspiration", "humor"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="tag"
          className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none w-28"
        />
        <input
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="lang (en)"
          className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none w-24"
        />
        <div className="flex-1" />
        <button
          onClick={() => setPage(1)}
          className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-sm"
        >
          Apply
        </button>
      </div>

      {err ? (
        <div className="px-4 text-rose-600 text-sm">{err}</div>
      ) : null}

      {/* List */}
      <div className="px-2">
        <table className="w-full text-sm rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr className="text-left">
              <th className="px-3 py-2">Text</th>
              <th className="px-3 py-2">Author</th>
              <th className="px-3 py-2">Tone</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2 w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r._id}
                className="border-t border-zinc-200/70 dark:border-zinc-800/70"
              >
                <td className="px-3 py-2 max-w-[420px] truncate">{r.text}</td>
                <td className="px-3 py-2">{r.author}</td>
                <td className="px-3 py-2">{r.tone}</td>
                <td className="px-3 py-2">{(r.tags || []).join(", ")}</td>
                <td className="px-3 py-2">{r.lang}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditing(r);
                        setForm({
                          text: r.text,
                          author: r.author || "",
                          tone: r.tone || "inspiration",
                          tags: (r.tags || []).join(","),
                          lang: r.lang || "en",
                        });
                      }}
                      className="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(r._id)}
                      className="px-2 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-center text-zinc-500" colSpan={6}>
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <div className="text-sm text-zinc-500">
          Page {page} / {pages}
        </div>
        <button
          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800"
          disabled={page >= pages}
          onClick={() => setPage((p) => Math.min(p + 1, pages))}
        >
          Next
        </button>
      </div>

      {/* Drawer (create/edit) */}
      <div className="px-4 py-3">
        <button
          onClick={() => setEditing({})}
          className="px-4 py-2 rounded-xl bg-sky-600 text-white"
        >
          New quote
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-end md:items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-lg font-semibold mb-2">
              {isEdit ? "Edit quote" : "New quote"}
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-500 mb-1">Text</label>
                <textarea
                  value={form.text}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, text: e.target.value }))
                  }
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                ></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">
                    Author
                  </label>
                  <input
                    value={form.author}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, author: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">
                    Tone
                  </label>
                  <select
                    value={form.tone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tone: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  >
                    {["inspiration", "humor"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tags: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-500 mb-1">
                    Language
                  </label>
                  <input
                    value={form.lang}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, lang: e.target.value }))
                    }
                    placeholder="en"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onPreviewAudience}
                  className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800"
                >
                  Preview audience
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
