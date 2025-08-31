// src/new-ui/pages/Messages.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

export default function Messages() {
  const params = useParams();
  const { conversationId } = params || {};
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/messages/${conversationId || ""}`, { credentials: "include" });
        const data = await res.json().catch(() => ([]));
        if (!stop) setMessages(Array.isArray(data) ? data : []);
      } catch {
        if (!stop) setMessages([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [conversationId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function onSend() {
    if (!text.trim()) return;
    const body = { text };
    setText("");
    await fetch(`/api/messages/${conversationId || "new"}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const res = await fetch(`/api/messages/${conversationId || ""}`, { credentials: "include" });
    const data = await res.json().catch(() => ([]));
    setMessages(Array.isArray(data) ? data : []);
  }

  return (
    <>
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Messages</div>
          <div className="text-sm text-zinc-500">Chat with friends</div>
        </div>
      </div>

      {loading && <div className="px-4 py-8 text-zinc-500">Loading…</div>}
      <div className="px-4 py-4 space-y-2">
        {messages.map((m) => (
          <div key={m._id} className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 w-fit max-w-[75%]">{m.text}</div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 p-3 bg-white/80 dark:bg-zinc-950/80 backdrop-blur border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Type a message…"
            className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 outline-none" />
          <button onClick={onSend} className="px-4 py-2 rounded-xl bg-sky-600 text-white">Send</button>
        </div>
      </div>
    </>
  );
}
