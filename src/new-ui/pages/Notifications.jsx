import React, { useEffect, useState } from "react";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api";

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setRows(await getNotifications()); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function onMarkAll() {
    try { await markAllNotificationsRead(); await load(); }
    catch (e) { alert(e?.response?.data?.message || e.message || "Failed"); }
  }

  async function onMark(id) {
    try { await markNotificationRead(id); await load(); }
    catch (e) { alert(e?.response?.data?.message || e.message || "Failed"); }
  }

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Notifications</div>
          <div className="text-sm text-zinc-500">Latest activity</div>
        </div>
      </div>

      <div className="px-2 py-3">
        <div className="mb-2 text-right">
          <button onClick={onMarkAll} className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-sm">Mark all read</button>
        </div>

        {loading && <div className="px-2 py-6 text-zinc-500">Loading…</div>}
        {!loading && rows.length === 0 && <div className="px-2 py-6 text-zinc-500">No notifications.</div>}

        <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
          {rows.map((n) => (
            <li key={n._id} className="px-2 py-2 flex items-center gap-3">
              <img src={n.actor?.avatarURL} alt="" className="w-9 h-9 rounded-full object-cover" />
              <div className="min-w-0">
                <div className="font-medium">{n.title}</div>
                <div className="text-xs text-zinc-500">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              {!n.read && <button onClick={() => onMark(n._id)} className="ml-auto text-sm px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800">Mark read</button>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
