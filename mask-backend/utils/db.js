const mongoose = require('mongoose');

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mask';
const OPTS = {
  autoIndex: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

async function connectWithRetry(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(URI, OPTS);
      console.log('✅ Mongo connected:', mongoose.connection.host);
      mongoose.connection.on('error', (err) =>
        console.error('[mongo] error:', err.message)
      );
      return mongoose;
    } catch (err) {
      console.error(`[db] connect failed (${i + 1}/${retries}): ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Mongo connect failed after retries');
}

module.exports = { connectWithRetry };
