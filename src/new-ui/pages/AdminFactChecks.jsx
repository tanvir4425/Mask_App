// src/new-ui/pages/AdminFactChecks.jsx

import React, { useEffect, useState, useCallback } from "react";
import { adminListFactChecks, getAdminKey, setAdminKey } from "../api";

const VERDICT_OPTIONS = [
  "true","false","misleading","unverified","opinion","outdated","satire"
];

function pct(x) { return `${Math.round((x || 0) * 100)}%`; }
function ts(d) { try { return new Date(d).toLocaleString(); } catch { return ""; } }

export default function AdminFactChecks() {
  const [adminKey, setKey] = useState(getAdminKey());
  const [verdict, setVerdict] = useState("");
  const [minConf, setMinConf] = useState("");
  const [maxConf, setMaxConf] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListFactChecks({
        adminKey, verdict: verdict || undefined,
        minConfidence: minConf || undefined,
        maxConfidence: maxConf || undefined,
        page, limit,
      });
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [adminKey, verdict, minConf, maxConf, page, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Admin · Fact-checks</div>
          <div className="text-sm text-zinc-500">Review model verdicts &amp; confidence</div>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <span className="text-sm text-zinc-500">Admin key</span>
          <input
            value={adminKey}
            onChange={(e) => { setKey(e.target.value); setAdminKey(e.target.value); }}
            className="bg-transparent outline-none text-sm w-56"
            placeholder="••••••••"
          />
        </label>

        <select value={verdict} onChange={(e)=>setVerdict(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-sm">
          <option value="">All verdicts</option>
          {VERDICT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="text-sm text-zinc-500">Min conf.
          <input className="ml-2 w-20 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900" value={minConf} onChange={e=>setMinConf(e.target.value)} placeholder="0.2" />
        </label>
        <label className="text-sm text-zinc-500">Max conf.
          <input className="ml-2 w-20 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900" value={maxConf} onChange={e=>setMaxConf(e.target.value)} placeholder="0.8" />
        </label>

        <div className="flex-1" />

        <label className="text-sm text-zinc-500">Per page
          <select className="ml-2 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900" value={limit} onChange={e=>setLimit(Number(e.target.value))}>
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="px-2">
        <table className="w-full text-sm rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr className="text-left">
              <th className="px-3 py-2">Post</th>
              <th className="px-3 py-2">Snippet</th>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="py-6 text-zinc-500 text-center" colSpan={7}>Loading…</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r._id} className="border-t border-zinc-200/70 dark:border-zinc-800/70">
                <td className="px-3 py-2">{r.postId}</td>
                <td className="px-3 py-2">{r.postText?.slice(0,120) || ""}</td>
                <td className="px-3 py-2 font-medium">{r.verdict}</td>
                <td className="px-3 py-2">{pct(r.confidence)}</td>
                <td className="px-3 py-2">{ts(r.createdAt)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td className="py-6 text-zinc-500" colSpan={7}>No results.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
        >
          Prev
        </button>
        <div className="text-sm text-zinc-500">Page {page} / {pages}</div>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
