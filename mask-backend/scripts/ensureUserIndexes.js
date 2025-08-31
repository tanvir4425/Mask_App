// mask-backend/scripts/ensureUserIndexes.js
require("dotenv").config();
const mongoose = require("mongoose");

// IMPORTANT: adjust the path if your model location differs
const User = require("../models/User");

(async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI missing in .env");
    await mongoose.connect(uri, { dbName: undefined });

    // Ensure indexes are declared on the schema (next step) then:
    console.log("Syncing User indexes...");
    await User.syncIndexes();
    console.log("Done. Current indexes:", await User.collection.indexes());
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
