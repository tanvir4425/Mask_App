/* Usage: node mask-backend/scripts/encrypt-existing-messages.js
 *
 * This encrypts any legacy plaintext Message.text into Message.encrypted
 * using the same AES-GCM helper used at runtime. Idempotent & safe to re-run.
 */
require("dotenv").config({ path: "mask-backend/.env" });

const mongoose = require("mongoose");
const Message = require("../models/Message");
const { encrypt } = require("../utils/msgCrypto");

(async () => {
  try {
    const MONGO =
      process.env.MONGO_URL ||
      process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/mask";
    console.log("[migrate] Connecting to", MONGO);
    await mongoose.connect(MONGO);

    // Find messages that still have plaintext (text) and no encrypted payload
    const cursor = Message.find({
      $or: [{ encrypted: null }, { "encrypted.ct": { $exists: false } }],
      text: { $exists: true, $ne: null, $ne: "" },
    }).cursor();

    let n = 0;
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
      try {
        doc.encrypted = encrypt(doc.text);
        doc.text = undefined; // remove plaintext
        await doc.save();
        n++;
      } catch (e) {
        console.warn("[migrate] Failed to encrypt one doc:", doc?._id, e?.message);
      }
    }
    console.log(`[migrate] Encrypted ${n} existing messages.`);
  } catch (err) {
    console.error("[migrate] Fatal:", err);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
})();
