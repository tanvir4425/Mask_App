// test-atlas.js
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    console.log('Connecting to:', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ Connected to MongoDB');
  } catch (e) {
    console.error('❌ FAILED:', e.message);
  } finally {
    await mongoose.disconnect().catch(() => {});
    process.exit();
  }
})();
