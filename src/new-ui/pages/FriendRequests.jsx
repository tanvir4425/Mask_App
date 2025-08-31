// src/new-ui/pages/FriendRequests.jsx
import React, { useEffect, useState } from "react";
import { getFriendRequests, acceptFriendRequest, declineFriendRequest } from "../api";

export default function FriendRequestsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(await getFriendRequests()); }
      catch { setRows([]); }
      finally { setLoading(false); }
    })();
  }, []);

  async function onAccept(id) {
    try { await acceptFriendRequest(id); setRows(rs => rs.filter(r => r._id !== id)); }
    catch (e) { alert(e?.response?.data?.message || e.message || "Failed"); }
  }
  async function onDecline(id) {
    try { await declineFriendRequest(id); setRows(rs => rs.filter(r => r._id !== id)); }
    catch (e) { alert(e?.response?.data?.message || e.message || "Failed"); }
  }

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Friend Requests</div>
          <div className="text-sm text-zinc-500">Approve or ignore pending requests</div>
        </div>
      </div>

      {loading && <div className="px-4 py-8 text-zinc-500">Loading…</div>}
      {!loading && rows.length === 0 && <div className="px-4 py-8 text-zinc-500">No pending requests.</div>}

      <ul className="px-2">
        {rows.map((r) => (
          <li key={r._id} className="flex items-center gap-3 py-3 border-b border-zinc-200/70 dark:border-zinc-800/70">
            <img src={r.avatarURL} alt="" className="w-10 h-10 rounded-full object-cover" />
            <div className="min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-zinc-500">{r.mutuals || 0} mutual friends</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => onAccept(r._id)} className="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-sm">Confirm</button>
              <button onClick={() => onDecline(r._id)} className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-sm">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
