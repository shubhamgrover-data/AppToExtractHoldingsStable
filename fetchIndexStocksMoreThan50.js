const cron = require("node-cron");
const {
    initiateBulkInsightExtraction,
} = require("./FetchStocksForIndices_v2.js");
const { CacheWrapper } = require("./cacheWrapper.js");
const { fetchNSEIndexSymbols } = require("./helper.js");

// Configuration
const CONFIG = {
    INDEX_NAME: "NIFTY SMALLCAP 250", // Index to process
    BATCH_SIZE: 50, // Number of stocks to process per run
    // Schedule: Every 30 minutes from 08:30 to 20:30 (Matches the cron.js requirement)
    CRON_SCHEDULE: "*/5 8-20 * * *",
    CACHE_TTL_HOURS: 20, // Consider data stale after 20 hours
    // NSE Request Headers (copied from FetchStocksForIndices_v2.js)
    HEADERS: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.nseindia.com/",
    },
};

// Initialize Cache
const stockDataCache = new CacheWrapper("stockDataCache");
const stockMetadataCache = new CacheWrapper("stockMetadataCache");

// Local fetchNSEIndexSymbols removed - imported from helper.js

/**
 * Checks cache status for a list of symbols and returns those that need processing.
 * @param {Array<string>} allSymbols
 * @param {object} stockDataCache
 * @param {number} cacheTTLHours
 * @returns {Promise<Array<string>>}
 */
async function getPendingSymbols(
    allSymbols,
    stockDataCache,
    cacheTTLHours = 20,
) {
    const pendingSymbols = [];
    let alreadyCachedCount = 0;
    const now = Date.now();
    const staleThreshold = cacheTTLHours * 60 * 60 * 1000;

    // Using Promise.all for cache checks
    console.log(
        `[BatchJob] Checking cache status for ${allSymbols.length} symbols...`,
    );

    const cacheChecks = await Promise.all(
        allSymbols.map(async (sym) => {
            const cached = await stockDataCache.get(sym);
            // Check if exists and is fresh
            if (
                cached &&
                cached.timestamp &&
                now - cached.timestamp < staleThreshold
            ) {
                return { sym, isCached: true };
            }
            return { sym, isCached: false };
        }),
    );

    cacheChecks.forEach((result) => {
        if (result.isCached) {
            alreadyCachedCount++;
        } else {
            pendingSymbols.push(result.sym);
        }
    });

    console.log(
        `[BatchJob] Status: ${alreadyCachedCount} cached (fresh), ${pendingSymbols.length} pending.`,
    );
    return pendingSymbols;
}

/**
 * Main logic to check cache state and process next batch
 */
async function runBatchJob(
    indexName,
    cacheRefresh,
    stockDataCache,
    stockMetadataCache,
    batchSize,
) {
    console.log(
        `\n[BatchJob] Starting job execution at ${new Date().toISOString()} for index: ${indexName}`,
    );

    try {
        // 1. Get all symbols
        const allSymbols = await fetchNSEIndexSymbols(indexName);

        // 2. Filter symbols that need processing
        const pendingSymbols = await getPendingSymbols(
            allSymbols,
            stockDataCache,
            CONFIG.CACHE_TTL_HOURS,
        );

        // 3. Process next batch if any pending
        if (pendingSymbols.length === 0) {
            console.log(
                `[BatchJob] All symbols are up to date! Nothing to do.`,
            );
            return;
        }

        const batchToProcess = pendingSymbols.slice(0, batchSize);
        console.log(
            `[BatchJob] Processing batch of ${batchToProcess.length} symbols: ${batchToProcess.join(", ")}`,
        );

        // Reuse the existing extraction logic
        const result = await initiateBulkInsightExtraction(
            batchToProcess,
            stockDataCache,
            {
                stockMetadataCache,
                invalidateCache: cacheRefresh, // Force fetch since we know they are stale/missing
                metadataConcurrency: 10,
                batchSize: 10,
                batchConcurrency: 1,
            },
        );

        console.log(
            `[BatchJob] Batch completion stats: Fetched ${result.fetchedCount}, Processed ${result.processedSymbols}`,
        );
        console.log(
            `[BatchJob] Remaining pending symbols for next run: ${pendingSymbols.length - batchToProcess.length}`,
        );
    } catch (error) {
        console.error(`[BatchJob] Critical Fail: ${error.message}`);
    }
    console.log(
        `[BatchJob] Job execution finished at ${new Date().toISOString()}`,
    );
}

// --- Scheduler (Standalone Mode) ---

// Check if run directly
if (require.main === module) {
    console.log(
        `[Standalone] Initializing Batch Scheduler for index: ${CONFIG.INDEX_NAME}`,
    );
    console.log(`[Standalone] Cron Schedule: ${CONFIG.CRON_SCHEDULE}`);

    // Schedule the task
    cron.schedule(
        CONFIG.CRON_SCHEDULE,
        () => {
            runBatchJob(
                CONFIG.INDEX_NAME,
                false,
                stockDataCache,
                stockMetadataCache,
                CONFIG.BATCH_SIZE,
            );
        },
        {
            timezone: "Asia/Kolkata",
        },
    );

    console.log(`[Standalone] Waiting for next scheduled run...`);
}

module.exports = {
    runBatchJob,
    fetchNSEIndexSymbols,
    getPendingSymbols,
    cronSchedule: CONFIG.CRON_SCHEDULE,
    indexName: CONFIG.INDEX_NAME,
};
