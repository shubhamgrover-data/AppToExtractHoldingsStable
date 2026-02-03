const { cacheCleanupAndRebuild, CACHE_REBUILD } = require("./cron.js");
const { CacheWrapper } = require("./cacheWrapper.js");
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

console.log("Cron worker status at", new Date().toString());
CACHE_REBUILD.forEach((job, index) => {
  if (cronResults[index]) {
    console.log(`${job.index}:`, cronResults[index].getStatus());
  } else {
    console.log(`${job.index}: [No active cron task created]`);
  }
});

// keep process alive
setInterval(() => {}, 1000);
