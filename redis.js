const Redis = require("ioredis");

const redisClient = new Redis(process.env.REDISURL, {
  // Add these for better serverless debugging
  connectTimeout: 10000, // Wait 10s before failing
  maxRetriesPerRequest: 1, // Don't let it loop forever in a serverless function
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err.message);
  //console.error("Full Error Stack:", err.stack);
});
module.exports = { redisClient };
