import React, { useEffect, useState } from "react";
import { getLiveById } from "../api";

export default function Live() {
  const [live, setLive] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await getLiveById("now");
        setLive(d || null);
      } catch (e) {
        setErr(e.message || "Failed");
        setLive(null);
      }
    })();
  }, []);

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Live Now</div>
          <div className="text-sm text-zinc-500">What’s currently happening</div>
        </div>
      </div>

      {err && <div className="px-4 py-8 text-red-600/80 dark:text-red-400">{err}</div>}
      {!err && !live && <div className="px-4 py-8 text-zinc-500">No one is live right now.</div>}
      {!err && live && (
        <div className="px-4 py-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="font-semibold mb-1">{live.title}</div>
            <div className="text-sm text-zinc-500">{live.viewers} watching</div>
          </div>
        </div>
      )}
    </>
  );
}
