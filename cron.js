const { cacheJob } = require("./cache.js");
const cron = require("node-cron");

// Configuration for cache cleanup time (UTC)
const CACHE_CLEANUP_SCHEDULE = "40 2 * * *"; // Midnight UTC
const CACHE_REBUILD_SCHEDULE_NEXT50 = "45 2 * * *";
const CACHE_REBUILD_SCHEDULE_MID50 = "0 6 * * *";
const CACHE_REBUILD_SCHEDULE_MID100 = "10 6 * * *";
const CACHE_REBUILD_SCHEDULE_MID150 = "20 6 * * *";

const CACHE_REBUILD = [
  { schedule: CACHE_CLEANUP_SCHEDULE, index: "NIFTY 50", cache: true },
  {
    schedule: CACHE_REBUILD_SCHEDULE_NEXT50,
    index: "NIFTY NEXT 50",
    cache: false,
  },
  {
    schedule: CACHE_REBUILD_SCHEDULE_MID50,
    index: "NIFTY MIDCAP 50",
    cache: false,
  },
  {
    schedule: CACHE_REBUILD_SCHEDULE_MID100,
    index: "NIFTY MIDCAP 100",
    cache: false,
  },
  {
    schedule: CACHE_REBUILD_SCHEDULE_MID150,
    index: "NIFTY MIDCAP 150",
    cache: false,
  },
];

function cacheClean_50(stockDataCache, stockMetadataCache, requestCache) {
  const result = cron.schedule(
    CACHE_REBUILD[0].schedule,
    () => () =>
      cacheJob(
        CACHE_REBUILD[0].index,
        CACHE_REBUILD[0].cache,
        stockDataCache,
        stockMetadataCache,
        requestCache,
      ),
    {
      timezone: "Asia/Kolkata",
    },
  );
}

function cacheRebuild_NEXT50(stockDataCache, stockMetadataCache, requestCache) {
  const result = cron.schedule(
    CACHE_REBUILD[1].schedule,
    () =>
      cacheJob(
        CACHE_REBUILD[1].index,
        CACHE_REBUILD[1].cache,
        stockDataCache,
        stockMetadataCache,
        requestCache,
      ),
    {
      timezone: "Asia/Kolkata",
    },
  );
}

function cacheRebuild_MID50(stockDataCache, stockMetadataCache, requestCache) {
  const result = cron.schedule(
    CACHE_REBUILD[2].schedule,
    () =>
      cacheJob(
        CACHE_REBUILD[2].index,
        CACHE_REBUILD[2].cache,
        stockDataCache,
        stockMetadataCache,
        requestCache,
      ),
    {
      timezone: "Asia/Kolkata",
    },
  );
}

function cacheRebuild_MID100(stockDataCache, stockMetadataCache, requestCache) {
  const result = cron.schedule(
    CACHE_REBUILD[3].schedule,
    () =>
      cacheJob(
        CACHE_REBUILD[3].index,
        CACHE_REBUILD[3].cache,
        stockDataCache,
        stockMetadataCache,
        requestCache,
      ),
    {
      timezone: "Asia/Kolkata",
    },
  );
}

function cacheRebuild_MID150(stockDataCache, stockMetadataCache, requestCache) {
  const result = cron.schedule(
    CACHE_REBUILD[4].schedule,
    () =>
      cacheJob(
        CACHE_REBUILD[4].index,
        CACHE_REBUILD[4].cache,
        stockDataCache,
        stockMetadataCache,
        requestCache,
      ),
    {
      timezone: "Asia/Kolkata",
    },
  );
}

function cacheCleanupAndRebuild(
  stockDataCache,
  stockMetadataCache,
  requestCache,
) {
  const cronResult = [];
  cronResult[0] = cacheClean_50(
    stockDataCache,
    stockMetadataCache,
    requestCache,
  );
  cronResult[1] = cacheRebuild_NEXT50(
    stockDataCache,
    stockMetadataCache,
    requestCache,
  );
  cronResult[2] = cacheRebuild_MID50(
    stockDataCache,
    stockMetadataCache,
    requestCache,
  );
  cronResult[3] = cacheRebuild_MID100(
    stockDataCache,
    stockMetadataCache,
    requestCache,
  );
  cronResult[4] = cacheRebuild_MID150(
    stockDataCache,
    stockMetadataCache,
    requestCache,
  );

  return cronResult;
}

module.exports = { cacheCleanupAndRebuild };

// cron.schedule(
//   CACHE_REBUILD_SCHEDULE_MID150,
//   async () => {
//     console.log(
//       `[Cache Refresh] Starting daily cache refresh at ${new Date().toUTCString()}`,
//     );
//     try {
//       console.log(
//         `[Cache] Running scheduled cleanup at ${new Date().toUTCString()}`,
//       );
//       //stockMetadataCache.clear(); not required
//       console.log("[Cache] Stock cache not cleared.");
//       // Refresh cache for NIFTY 50 (you can add more indices)
//       const result = await fetchAndProcessIndexStocks(
//         "NIFTY MIDCAP 150",
//         stockDataCache,
//         {
//           stockMetadataCache,
//           invalidateCache: false, // Force refresh even if cached
//           metadataConcurrency: 10,
//           batchSize: 10,
//           batchConcurrency: 1,
//         },
//       );
//       console.log(
//         `[Cache Refresh] Completed. Processed ${result.processedSymbols} symbols, ` +
//           `Fetched ${result.fetchedCount}, Cached ${result.cachedCount}`,
//       );
//     } catch (error) {
//       console.error(`[Cache Refresh] Failed:`, error.message);
//     }
//   },
//   null,
//   true,
//   "Asia/Kolkata",
// );
