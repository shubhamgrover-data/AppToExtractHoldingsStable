const { cacheCleanupAndRebuild, CACHE_REBUILD } = require("./cron.js");
const { CacheWrapper } = require("./cacheWrapper.js");
// Separate cache for persistent stock data results
// Map of symbol -> { results, timestamp }
const stockDataCache = new CacheWrapper("stockDataCache");
// In-memory cache for stock metadata (symbol -> {pk, slug})
const stockMetadataCache = new CacheWrapper("stockMetadataCache");
// In-memory cache for background requests
const requestCache = new CacheWrapper("requestCache");
const runJobs = async () => {
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

  // In GITHUB mode: await the job promise, then exit to kill the ioredis socket
  if (process.env.MODE === "GITHUB") {
    const jobIndex = CACHE_REBUILD.findIndex((j) => j.index === process.env.INDEX);
    if (jobIndex !== -1 && cronResults[jobIndex] && cronResults[jobIndex].promise) {
      try {
        await cronResults[jobIndex].promise;
        console.log(`[CronRun] Job for ${process.env.INDEX} completed. Exiting.`);
        process.exit(0);
      } catch (err) {
        console.error(`[CronRun] Job failed:`, err);
        process.exit(1);
      }
    } else {
      console.log(`[CronRun] No matching job found for INDEX=${process.env.INDEX}. Exiting.`);
      process.exit(0);
    }
  } else {
    // Server mode: keep process alive for cron.schedule to fire
    setInterval(() => { }, 1000);
  }
};

runJobs();
