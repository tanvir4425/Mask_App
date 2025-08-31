// src/new-ui/pages/MessagesPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  listConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  connectMessagesWS,
  createOrGetConversationWith,
  getUserProfile,
} from "../api";
import { Search, SendHorizonal } from "lucide-react";

/* ---------- helpers ---------- */

const APP_BASE = "/app/messages"; // << important: new base

function useAutoScroll(dep) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Load the other participant's name & avatar for display
async function enrichConversations(items, myId) {
  const out = [];
  for (const c of items) {
    const other = (c.participants || []).find(p => !p.isSelf) || (c.participants || [])[0];
    let name = "Conversation", avatar = null;
    if (other?.id) {
      try {
        const u = await getUserProfile(other.id);
        name = u?.pseudonym || u?.username || u?.name || name;
        avatar = u?.avatarURL || u?.avatar || null;
      } catch {}
    }
    out.push({
      ...c,
      participants: (c.participants || []).map(p => p.isSelf ? p : { ...p, name, avatar }),
    });
  }
  return out;
}

function ConversationList({ items, activeId, onOpen }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(c =>
      (c.participants || []).some(p => (p.name || "").toLowerCase().includes(q))
    );
  }, [items, query]);

  return (
    <aside className="w-[320px] border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      <div className="p-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800">
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="bg-transparent outline-none w-full text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(c => {
          const other = (c.participants || []).find(p => p.isSelf !== true) || {};
          return (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={`w-full text-left px-4 py-3 flex gap-3 items-center hover:bg-zinc-50 dark:hover:bg-zinc-900 ${activeId===c.id ? "bg-zinc-50 dark:bg-zinc-900" : ""}`}
            >
              <div className="w-10 h-10 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden shrink-0">
                {other.avatar ? <img src={other.avatar} alt="" className="w-full h-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{other.name || "Conversation"}</div>
                <div className="text-xs text-zinc-500 truncate">{c.lastMessage?.text || "No messages yet"}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-zinc-400">{c.lastMessage?.createdAt ? formatTime(c.lastMessage.createdAt) : ""}</div>
                {c.unread > 0 && (
                  <div className="mt-1 text-[11px] px-2 py-[2px] rounded-full bg-sky-500 text-white inline-block">
                    {c.unread > 99 ? "99+" : c.unread}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function MessageBubble({ me, msg }) {
  const mine = msg.senderId === me?.id || msg.senderId === me?._id;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm
        ${mine ? "bg-sky-500 text-white rounded-br-sm" : "bg-zinc-100 dark:bg-zinc-800 rounded-bl-sm"}`}>
        <div>{msg.text}</div>
        <div className={`text-[10px] mt-1 ${mine ? "text-white/80" : "text-zinc-500"}`}>{formatTime(msg.createdAt)}</div>
      </div>
    </div>
  );
}

function MessageInput({ onSend, disabled, placeholder = "Message" }) {
  const [text, setText] = useState("");
  async function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    await onSend(t);
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-3 border-t border-zinc-200 dark:border-zinc-800">
      <input
        className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 outline-none"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <button
        className="px-3 py-2 rounded-xl bg-sky-500 text-white disabled:opacity-50 flex items-center gap-1"
        disabled={disabled}
        type="submit"
      >
        <SendHorizonal size={16} /> Send
      </button>
    </form>
  );
}

/* ---------- page ---------- */

export default function MessagesPage() {
  const nav = useNavigate();
  const { conversationId } = useParams();
  const { search } = useLocation();
  const urlTo = new URLSearchParams(search).get("to"); // userId to start a chat with

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  }, []);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);          // conversations (enriched)
  const [messages, setMessages] = useState([]);    // current messages
  const [busySend, setBusySend] = useState(false);
  const [pendingToUser, setPendingToUser] = useState(urlTo || "");

  // load conversations
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listConversations().catch(() => []);
        if (!alive) return;

        const enriched = await enrichConversations(data, me?.id || me?._id);
        if (!alive) return;
        setItems(enriched);

        // If we already have a conversation & no :conversationId in URL, open first
        if (!conversationId && !urlTo && data[0]?.id) {
          nav(`${APP_BASE}/${data[0].id}`, { replace: true }); // << use /app base
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, nav, urlTo]);

  // load messages when conversationId changes
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }

    // quick client-side validity check (avoids needless 400s)
    if (!/^[a-f0-9]{24}$/i.test(String(conversationId))) {
      // navigate back to the list route under /app
      nav(`${APP_BASE}`, { replace: true });
      return;
    }

    setPendingToUser(""); // we're in a real conversation now
    let alive = true;
    (async () => {
      try {
        const data = await getMessages(conversationId);
        if (!alive) return;
        setMessages(Array.isArray(data) ? data : []);
        markConversationRead(conversationId).catch(() => {});
      } catch (e) {
        // swallow errors so UI doesn't crash; keep user on the list
        setMessages([]);
      }
    })();
    return () => { alive = false; };
  }, [conversationId, nav]);

  // optional WebSocket live updates
  useEffect(() => {
    const ws = connectMessagesWS?.((evt) => {
      if (!evt) return;
      if (evt.type === "message") {
        setItems((prev) => {
          const next = [...prev];
          const i = next.findIndex(c => c.id === evt.conversationId);
          if (i >= 0) {
            next[i] = { ...next[i], lastMessage: evt.message, unread: (evt.conversationId === conversationId) ? 0 : (next[i].unread||0)+1 };
          }
          return next;
        });
        if (evt.conversationId === conversationId) {
          setMessages((prev) => [...prev, evt.message]);
          markConversationRead(conversationId).catch(()=>{});
        }
      }
    });
    return () => { try { ws && ws.close(); } catch {} };
  }, [conversationId]);

  const scrollRef = useAutoScroll(messages);

  async function handleSend(text) {
    // If starting from /app/messages?to=<userId>, create convo AND send first message now
    if (!conversationId && pendingToUser) {
      setBusySend(true);
      try {
        const conv = await createOrGetConversationWith(pendingToUser);
        if (conv?.id) {
          // Build minimal local convo and enrich for UI
          const raw = {
            id: conv.id,
            participants: [
              { id: String(me?.id || me?._id), isSelf: true },
              { id: String(pendingToUser), isSelf: false },
            ],
            lastMessage: null,
            unread: 0,
          };
          const enriched = await enrichConversations([raw], me?.id || me?._id);
          setItems((prev) => [enriched[0], ...prev]);

          // Navigate to it and send the message
          nav(`${APP_BASE}/${conv.id}`, { replace: true });
          const msg = await sendMessage(conv.id, text);
          setMessages([msg]);
          setItems((prev) => {
            const copy = [...prev];
            const i = copy.findIndex(c => c.id === conv.id);
            if (i >= 0) copy[i] = { ...copy[i], lastMessage: msg };
            return copy;
          });
          markConversationRead(conv.id).catch(()=>{});
          setPendingToUser("");
        }
      } finally {
        setBusySend(false);
      }
      return;
    }

    if (!conversationId) return;
    setBusySend(true);
    try {
      const msg = await sendMessage(conversationId, text);
      setMessages((m) => [...m, msg]);
      setItems((prev) => {
        const i = prev.findIndex(c => c.id === conversationId);
        if (i < 0) return prev;
        const copy = [...prev];
        copy[i] = { ...copy[i], lastMessage: msg };
        return copy;
      });
    } finally {
      setBusySend(false);
    }
  }

  function openConversation(id) {
    if (id && id !== conversationId) nav(`${APP_BASE}/${id}`);
  }

  const activeTitle =
    items.find(c => c.id === conversationId)?.participants?.find(p => p.isSelf !== true)?.name
    || "Messages";
  const placeholder = pendingToUser ? "Type a message to start this chat…" : "Message";

  return (
    <div className="flex h-screen">
      <ConversationList items={items} activeId={conversationId} onOpen={openConversation} />
      <main className="flex-1 flex flex-col">
        <header className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="font-semibold">{activeTitle}</div>
          {pendingToUser && (
            <div className="text-xs text-amber-500 mt-1">
              Chat will be created when you send your first message.
            </div>
          )}
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 bg-white dark:bg-black">
          {messages.map(m => <MessageBubble key={m.id} me={me} msg={m} />)}
          {(!conversationId && !loading && !pendingToUser) && (
            <div className="text-sm text-zinc-500 p-6">No conversation selected.</div>
          )}
        </div>
        <MessageInput onSend={handleSend} disabled={busySend} placeholder={placeholder} />
      </main>
    </div>
  );
}
