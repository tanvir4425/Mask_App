// mask-backend/utils/msgCrypto.js
const crypto = require("crypto");

/**
 * We expect MESSAGE_ENC_KEY to be a 32-byte base64 string (AES-256).
 * If missing (dev), fall back to a SHA-256 of JWT_SECRET so things still work.
 */
function resolveKey() {
  const b64 = process.env.MESSAGE_ENC_KEY;
  if (b64) {
    try {
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 32) return buf;
      console.warn("[msgCrypto] MESSAGE_ENC_KEY is not 32 bytes; falling back to derived key.");
    } catch {}
  }
  const seed = process.env.JWT_SECRET || "dev-secret";
  return crypto.createHash("sha256").update(seed).digest(); // 32 bytes
}

const KEY = resolveKey();

/** Encrypt UTF-8 string with AES-256-GCM -> base64 parts { ct, iv, tag } */
function encrypt(plaintext = "") {
  const iv = crypto.randomBytes(12); // GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Decrypt { ct, iv, tag } -> UTF-8 string. Returns "" on any failure. */
function decrypt(payload) {
  try {
    if (!payload || !payload.ct || !payload.iv || !payload.tag) return "";
    const iv = Buffer.from(payload.iv, "base64");
    const ct = Buffer.from(payload.ct, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return "";
  }
}

module.exports = { encrypt, decrypt };
