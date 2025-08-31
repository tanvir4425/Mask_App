// mask-backend/routes/messages.js

const express = require("express");
const router = express.Router();
const { Types } = require("mongoose");
const jwt = require("jsonwebtoken");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

/* -------- auth helpers (compatible with cookie/JWT or session) -------- */
function getUserIdFromReq(req) {
  // 1) session / passport style
  const sessionId =
    req.user?.id ||
    req.user?._id ||
    req.session?.user?.id ||
    req.session?.user?._id;
  if (sessionId) return String(sessionId);

  // 2) JWT cookie (common names)
  const possibleCookies = [
    "token",
    "jwt",
    "access_token",
    "session_token",
    "auth_token",
  ];
  for (const name of possibleCookies) {
    const raw = req.cookies?.[name];
    if (!raw) continue;
    try {
      const payload = jwt.verify(raw, process.env.JWT_SECRET);
      const uid =
        payload?.id || payload?._id || payload?.userId || payload?.sub;
      if (uid) return String(uid);
    } catch (_) {}
  }

  // 3) Authorization: Bearer <token>
  const auth = req.headers?.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const uid =
        payload?.id || payload?._id || payload?.userId || payload?.sub;
      if (uid) return String(uid);
    } catch (_) {}
  }
  return null;
}

// Dev-friendly: also accept x-user-id header as a fallback identifier
function getAuthUserId(req) {
  return getUserIdFromReq(req) || req.headers["x-user-id"] || null;
}

function toId(v) {
  try {
    return new Types.ObjectId(String(v));
  } catch {
    return null;
  }
}
const keyFor = (a, b) => [String(a), String(b)].sort().join(":");

async function isParticipant(cid, uid) {
  return !!(await Conversation.exists({ _id: cid, participants: uid }));
}

/* --------- middlewares: strict & soft (no auto-logout on GETs) --------- */
function requireAuthStrict(req, res, next) {
  const uid = getAuthUserId(req);
  if (!uid) return res.status(401).json({ message: "Unauthorized" });
  req.authUserId = String(uid);
  next();
}
function maybeAuth(req, _res, next) {
  const uid = getAuthUserId(req);
  if (uid) req.authUserId = String(uid);
  next();
}

/* ---------------------------- endpoints ---------------------------- */

/* Unread badge — returns {count:0} if not logged in (prevents axios logout) */
router.get("/unread-count", maybeAuth, async (req, res) => {
  const uid = req.authUserId;
  if (!uid) return res.json({ count: 0 });

  const me = toId(uid);
  const convs = await Conversation.find({ participants: me })
    .select("_id")
    .lean();
  if (!convs.length) return res.json({ count: 0 });
  const ids = convs.map((c) => c._id);
  const count = await Message.countDocuments({
    conversation: { $in: ids },
    readBy: { $ne: me },
    sender: { $ne: me },
  });
  res.json({ count });
});

/* Create or get a 1:1 conversation */
router.post("/with/:userId", requireAuthStrict, async (req, res) => {
  const me = toId(req.authUserId);
  const other = toId(req.params.userId);
  if (!other) return res.status(400).json({ message: "Invalid userId" });
  if (String(me) === String(other))
    return res.status(400).json({ message: "Cannot DM yourself" });

  const key = keyFor(me, other);
  let convo = await Conversation.findOne({ participantsKey: key }).lean();
  if (!convo) {
    convo = await Conversation.create({
      isGroup: false,
      participants: [me, other],
      participantsKey: key,
      lastMessageAt: new Date(),
    });
  }
  res.json({ id: String(convo._id || convo.id) });
});

/* List conversations — returns [] if not logged in (prevents axios logout) */
router.get("/conversations", maybeAuth, async (req, res) => {
  const uid = req.authUserId;
  if (!uid) return res.json([]); // not logged in -> harmless empty list

  const me = toId(uid);
  const list = await Conversation.find({ participants: me })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

  const result = await Promise.all(
    list.map(async (c) => {
      const last = c.lastMessage?.text
        ? c.lastMessage
        : await Message.findOne({ conversation: c._id })
            .sort({ createdAt: -1 })
            .lean();

      const unread = await Message.countDocuments({
        conversation: c._id,
        readBy: { $ne: me },
        sender: { $ne: me },
      });

      return {
        id: String(c._id),
        participants: (c.participants || []).map((id) => ({
          id: String(id),
          isSelf: String(id) === String(me),
          // name/avatar can be populated later if you want
        })),
        lastMessage: last
          ? {
              id: String(last._id || ""),
              text: last.text,
              createdAt: last.createdAt,
              senderId: String(last.sender),
            }
          : null,
        unread,
      };
    })
  );

  res.json(result);
});

/* Get messages (strict) */
router.get("/:conversationId", requireAuthStrict, async (req, res) => {
  const me = toId(req.authUserId);
  const cid = toId(req.params.conversationId);
  if (!cid) return res.status(400).json({ message: "Invalid conversationId" });

  if (!(await isParticipant(cid, me)))
    return res.status(403).json({ message: "Forbidden" });

  const { before } = req.query;
  const q = { conversation: cid };
  if (before) {
    const b = new Date(before);
    if (!isNaN(b)) q.createdAt = { $lt: b };
  }

  const msgs = await Message.find(q).sort({ createdAt: 1 }).limit(50).lean();
  res.json(
    msgs.map((m) => ({
      id: String(m._id),
      conversationId: String(m.conversation),
      senderId: String(m.sender),
      text: m.text,
      createdAt: m.createdAt,
      status: m.readBy?.some((x) => String(x) === String(me)) ? "read" : "delivered",
    }))
  );
});

/* Send message (strict) */
router.post("/:conversationId", requireAuthStrict, async (req, res) => {
  const me = toId(req.authUserId);
  const cid = toId(req.params.conversationId);
  const text = (req.body?.text || "").trim();
  if (!cid) return res.status(400).json({ message: "Invalid conversationId" });
  if (!text) return res.status(400).json({ message: "Empty message" });

  if (!(await isParticipant(cid, me)))
    return res.status(403).json({ message: "Forbidden" });

  const msg = await Message.create({
    conversation: cid,
    sender: me,
    text,
    readBy: [me],
  });

  await Conversation.findByIdAndUpdate(
    cid,
    {
      lastMessageAt: msg.createdAt,
      lastMessage: { text: msg.text, sender: me, createdAt: msg.createdAt },
      updatedAt: new Date(),
    },
    { new: false }
  );

  res.json({
    id: String(msg._id),
    conversationId: String(msg.conversation),
    senderId: String(msg.sender),
    text: msg.text,
    createdAt: msg.createdAt,
    status: "read",
  });
});

/* Mark conversation read (strict) */
router.post("/:conversationId/read", requireAuthStrict, async (req, res) => {
  const me = toId(req.authUserId);
  const cid = toId(req.params.conversationId);
  if (!cid) return res.status(400).json({ message: "Invalid conversationId" });

  if (!(await isParticipant(cid, me)))
    return res.status(403).json({ message: "Forbidden" });

  await Message.updateMany(
    { conversation: cid, readBy: { $ne: me } },
    { $addToSet: { readBy: me } }
  );
  res.json({ ok: true });
});

module.exports = router;
