// mask-backend/worker.factcheck.js
require("dotenv").config();
const connectDB = require("./config/db");
const { startFactcheckWorker } = require("./services/factcheckWorker");

(async () => {
  await connectDB();
  console.log("✅ DB connected. Starting fact-check worker…");
  startFactcheckWorker();
})();
