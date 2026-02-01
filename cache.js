const { fetchAndProcessIndexStocks } = require("./FetchStocksForIndices_v2.js");

const cacheJob = async (
  INDEX,
  CACHE_REFRESH,
  stockDataCache,
  stockMetadataCache,
  requestCache,
) => {
  console.log(
    `[Cache Refresh] Starting daily cache refresh at ${new Date().toUTCString()}`,
  );
  try {
    console.log(
      `[Cache] Running scheduled cleanup at ${new Date().toUTCString()}`,
    );
    await stockDataCache.clear();
    await requestCache.clear();
    //stockMetadataCache.clear(); not required
    console.log("[Cache] All caches cleared.");
    // Refresh cache for NIFTY 50 (you can add more indices)
    const result = await fetchAndProcessIndexStocks(INDEX, stockDataCache, {
      stockMetadataCache,
      invalidateCache: CACHE_REFRESH, // Force refresh even if cached
      metadataConcurrency: 10,
      batchSize: 10,
      batchConcurrency: 1,
    });
    console.log(
      `[Cache Refresh] Completed. Processed ${result.processedSymbols} symbols, ` +
        `Fetched ${result.fetchedCount}, Cached ${result.cachedCount}`,
    );
  } catch (error) {
    console.error(`[Cache Refresh] Failed:`, error.message);
  }
};

module.exports = { cacheJob };
