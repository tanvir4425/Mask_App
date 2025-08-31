// mask-backend/config/db.js
const mongoose = require("mongoose");

function redact(uri) {
  return String(uri || "").replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}

function buildVariants(uri) {
  // If the URI is not a seedlist, just return it as-is.
  if (!/mongodb:\/\//.test(uri)) return [uri];

  // Grab the "user:pass@" … "/dbname?..." segment to isolate hosts
  // mongodb://user:pass@hostA,hostB,hostC/db?...
  const m = uri.match(/^mongodb:\/\/([^@]+)@([^/]+)\/(.*)$/i);
  if (!m) return [uri];

  const auth = m[1];               // user:pass
  const hostsStr = m[2];           // hostA,hostB,hostC
  const tail = m[3];               // db?query
  const hosts = hostsStr.split(",").map(s => s.trim()).filter(Boolean);

  // Generate variants: full list, rotated orders, then pairs that exclude
  // the last host (useful if one node is flaky), then single-host fallbacks.
  const variants = new Set();

  const push = (arr) => {
    const u = `mongodb://${auth}@${arr.join(",")}/${tail}`;
    variants.add(u);
  };

  // 1) As-is
  push(hosts);

  // 2) Rotations
  for (let i = 1; i < hosts.length; i++) {
    const rot = hosts.slice(i).concat(hosts.slice(0, i));
    push(rot);
  }

  // 3) Pairs (drop each host once)
  if (hosts.length >= 3) {
    push([hosts[0], hosts[1]]);
    push([hosts[1], hosts[2]]);
    push([hosts[0], hosts[2]]);
  }

  // 4) Singles (last resort)
  hosts.forEach(h => push([h]));

  return Array.from(variants);
}

let connected = false;

async function tryConnectOnce(uri) {
  // Give Atlas time, and don't die on a single slow node
  return mongoose.connect(uri, {
    serverSelectionTimeoutMS: 20000, // 20s to pick a healthy node
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    // keepAlive defaults are OK; IPv4 forced via &family=4 in your URI
  });
}

async function connectDB() {
  const baseUri = process.env.MONGO_URI;
  if (!baseUri) {
    console.error("⚠️  MONGO_URI is missing in mask-backend/.env");
    process.exit(1);
  }

  const variants = buildVariants(baseUri);
  console.log("[db] trying", variants.length, "connection variant(s)");

  let lastErr = null;
  for (let i = 0; i < variants.length; i++) {
    const uri = variants[i];
    console.log(`[db] connect attempt ${i + 1}/${variants.length}:`, redact(uri));
    try {
      await tryConnectOnce(uri);
      connected = true;
      console.log("✅ Mongo connected via variant", i + 1);
      return;
    } catch (err) {
      lastErr = err;
      const msg = (err && err.message) || String(err);
      // Surface the most useful info but keep going
      console.warn("↩️  connect failed:", msg);
      try { await mongoose.disconnect(); } catch {}
    }
  }

  console.error("❌ All Mongo connection attempts failed.");
  if (lastErr) console.error("Last error:", lastErr.message || lastErr);
  console.error(
    [
      "Check these:",
      "1) Atlas → Network Access: your IP (or 0.0.0.0/0) is allowed (and not expired).",
      "2) Atlas → Database Access: user/password correct; role has RW.",
      "3) Password special chars are URL-encoded in MONGO_URI.",
      "4) If one shard IP is flaky from your ISP, this fallback will skip it next restart.",
    ].join("\n")
  );
  throw lastErr || new Error("Mongo connect failed");
}

function isConnected() {
  return connected;
}

module.exports = { connectDB, isConnected };
