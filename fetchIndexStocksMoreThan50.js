const { initiateBulkInsightExtraction } = require("./FetchStocksForIndices_v2.js");
const { CacheWrapper } = require("./cacheWrapper.js");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");

/**
 * State-managed Batch Processor
 * Goal: Resilience against server crashes, configurable delays, and modular structure.
 * 
 * Logic:
 * 1. Maintain a persistent state of processing in Redis (via CacheWrapper).
 * 2. Break large indices into batches of 50.
 * 3. Use a cron or a smarter interval to pick up "pending" batches.
 * 4. If the server crashes, it resumes from the last successful batch.
 */

const batchStateCache = new CacheWrapper("batchProcessingState");

async function fetchIndexSymbols(indexName) {
    try {
        const slug = indexName.replace(/ /g, "-").toLowerCase();
        const url = `https://trendlyne.com/stock-screeners/index/${slug}/`;
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });
        const $ = cheerio.load(response.data);
        const symbols = [];
        $("a.symbol-link, td.symbol a, .stock-name a").each((i, el) => {
            const symbol = $(el).text().trim();
            if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
        });
        return symbols;
    } catch (error) {
        console.error(`[Batch Processor] Symbol fetch error:`, error.message);
        return [];
    }
}

/**
 * Processes a single batch and updates persistent state.
 */
async function processNextBatch(indexName) {
    const stockDataCache = new CacheWrapper("stockDataCache");
    const stockMetadataCache = new CacheWrapper("stockMetadataCache");

    // Load or initialize state
    let state = await batchStateCache.get(indexName);
    const allSymbols = await fetchIndexSymbols(indexName);

    if (allSymbols.length === 0) return;

    if (!state || state.allSymbolsHash !== allSymbols.join(',')) {
        state = {
            currentIndex: 0,
            batchSize: 50,
            totalSymbols: allSymbols.length,
            allSymbolsHash: allSymbols.join(','),
            completed: false,
            lastRun: null
        };
    }

    if (state.completed && (Date.now() - (state.lastRun || 0) < 24 * 60 * 60 * 1000)) {
        console.log(`[Batch Processor] ${indexName} already completed today.`);
        return;
    }

    const start = state.currentIndex;
    const end = Math.min(start + state.batchSize, allSymbols.length);
    const batchSymbols = allSymbols.slice(start, end);

    console.log(`[Batch Processor] ${indexName}: Processing batch ${start}-${end} of ${allSymbols.length}`);

    try {
        await initiateBulkInsightExtraction(batchSymbols, stockDataCache, {
            stockMetadataCache,
            invalidateCache: false,
            metadataConcurrency: 10,
            batchSize: 10,
            batchConcurrency: 1,
        });

        // Update state
        state.currentIndex = end;
        state.lastRun = Date.now();
        if (state.currentIndex >= allSymbols.length) {
            state.completed = true;
            state.currentIndex = 0; // Reset for next cycle (e.g. tomorrow)
        }
        await batchStateCache.set(indexName, state);
        console.log(`[Batch Processor] ${indexName}: Batch successful. Progress: ${state.currentIndex}/${allSymbols.length}`);
    } catch (error) {
        console.error(`[Batch Processor] ${indexName}: Batch failed. Will retry on next run.`, error.message);
    }
}

/**
 * Entry point that sets up a resilient schedule.
 * Instead of one long loop, we run a task every X minutes.
 * If the server restarts, the task picks up where it left off.
 */
function setupResilientBatchProcessing(indexName, intervalMinutes = 30) {
    console.log(`[Batch Processor] Setting up resilient processing for ${indexName} every ${intervalMinutes}m`);
    
    // Immediate run
    processNextBatch(indexName);

    // Schedule subsequent runs
    cron.schedule(`*/${intervalMinutes} * * * *`, () => {
        console.log(`[Batch Processor] Scheduled run for ${indexName}`);
        processNextBatch(indexName);
    });
}

module.exports = { 
    fetchIndexSymbols, 
    processNextBatch, 
    setupResilientBatchProcessing 
};

if (require.main === module) {
    const index = process.argv[2] || "NIFTY SMALLCAP 250";
    const interval = parseInt(process.argv[3]) || 30;
    setupResilientBatchProcessing(index, interval);
}
