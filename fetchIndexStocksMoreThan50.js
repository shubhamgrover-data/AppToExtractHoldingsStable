const { initiateBulkInsightExtraction } = require("./FetchStocksForIndices_v2.js");
const { CacheWrapper } = require("./cacheWrapper.js");
const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Custom function to fetch index symbols from Trendlyne.
 * We need this because we can't modify existing code and need the list of symbols to batch them.
 */
async function fetchIndexSymbols(indexName) {
  try {
    const slug = indexName.replace(/ /g, "-").toLowerCase();
    const url = `https://trendlyne.com/stock-screeners/index/${slug}/`;
    console.log(`[fetchIndexSymbols] Fetching symbols from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    
    const $ = cheerio.load(response.data);
    const symbols = [];
    
    // Try multiple selectors as Trendlyne's structure can vary
    $("a.symbol-link, td.symbol a, .stock-name a").each((i, el) => {
      const symbol = $(el).text().trim();
      if (symbol && !symbols.includes(symbol)) {
        symbols.push(symbol);
      }
    });

    console.log(`[fetchIndexSymbols] Found ${symbols.length} symbols for ${indexName}`);
    return symbols;
  } catch (error) {
    console.error(`[fetchIndexSymbols] Error:`, error.message);
    return [];
  }
}

/**
 * Main function to fetch and process index stocks in batches.
 * Condition: NO CHANGES to existing code.
 * Reuses: initiateBulkInsightExtraction from FetchStocksForIndices_v2.js
 */
async function fetchIndexStocksInBatches(indexName, intervalMinutes = 30) {
  console.log(`[Batch Processor] Starting for ${indexName} at ${new Date().toISOString()}`);
  
  const stockDataCache = new CacheWrapper("stockDataCache");
  const stockMetadataCache = new CacheWrapper("stockMetadataCache");

  // 1. Get all symbols for the target index
  const allSymbols = await fetchIndexSymbols(indexName);
  
  if (allSymbols.length === 0) {
    console.error(`[Batch Processor] No symbols found for ${indexName}. Aborting.`);
    return;
  }

  const batchSize = 50;
  const totalBatches = Math.ceil(allSymbols.length / batchSize);
  
  console.log(`[Batch Processor] Total symbols: ${allSymbols.length} | Batch size: ${batchSize} | Total batches: ${totalBatches}`);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, allSymbols.length);
    const batchSymbols = allSymbols.slice(start, end);
    
    console.log(`[Batch Processor] Processing batch ${i + 1}/${totalBatches} (${batchSymbols.length} symbols)`);

    try {
      /**
       * We reuse initiateBulkInsightExtraction which is the core logic in FetchStocksForIndices_v2.js
       * it takes (symbols, stockDataCache, options)
       */
      const result = await initiateBulkInsightExtraction(
        batchSymbols,
        stockDataCache,
        {
          stockMetadataCache,
          invalidateCache: false, // Don't clear cache, we are building it
          metadataConcurrency: 10,
          batchSize: 10,
          batchConcurrency: 1,
        }
      );

      console.log(`[Batch Processor] Batch ${i + 1} Done: Processed ${result.processedSymbols} symbols.`);
    } catch (error) {
      console.error(`[Batch Processor] Batch ${i + 1} Failed:`, error.message);
    }

    // Wait if there are more batches
    if (i < totalBatches - 1) {
      console.log(`[Batch Processor] Sleeping for ${intervalMinutes} minutes...`);
      await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
    }
  }

  console.log(`[Batch Processor] Completed all ${totalBatches} batches for ${indexName}`);
}

module.exports = { fetchIndexStocksInBatches };

// Usage example (standalone):
if (require.main === module) {
    const index = process.argv[2] || "NIFTY SMALLCAP 250";
    const delay = parseInt(process.argv[3]) || 30;
    fetchIndexStocksInBatches(index, delay);
}
