const cacheCleanupAndRebuild = require("./cron.js");
const { CacheWrapper, REDISSWITCH } = require("./cacheWrapper.js");
// Separate cache for persistent stock data results
// Map of symbol -> { results, timestamp }
const stockDataCache = new CacheWrapper("stockDataCache");
// In-memory cache for stock metadata (symbol -> {pk, slug})
const stockMetadataCache = new CacheWrapper("stockMetadataCache");
// In-memory cache for background requests
const requestCache = new CacheWrapper("requestCache");
const cronResults = cacheCleanupAndRebuild(
  stockDataCache,
  stockMetadataCache,
  requestCache,
);
console.log(
  "Cron worker status at",
  new Date().toString(),
  "\n",
  "NIFTY 50:",
  cronResults[0].getStatus(),
  "\n",
  "NIFTY NEXT 50:",
  cronResults[1].getStatus(),
  "\n",
  "NIFTY MIDCAP 50:",
  cronResults[2].getStatus(),
  "\n",
  "NIFTY MIDCAP 100:",
  cronResults[3].getStatus(),
  "\n",
  "NIFTY MIDCAP 150:",
  cronResults[4].getStatus(),
);
// keep process alive
setInterval(() => {}, 1000);
