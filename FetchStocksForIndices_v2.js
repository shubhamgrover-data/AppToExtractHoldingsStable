const axios = require("axios");
const cheerio = require("cheerio");
const { extractInsightStandalone } = require("./standalone_extractor.js");

// JSON formats
const JSONFORMAT = [
  {
    id: "stock_indicator_tiles",
    format: `{
      tiles: [
        {
          title: "",
          label: "",
          value: "",
          message: ""
        }
      ]
    }`,
  },
  {
    id: "mf_share_change",
    format: `{
      title: "",
      summary: "",
      charts: [
        {
          heading: "",
          chart_options: {},
          chart_data: []
        }
      ],
      insights: [
        {
          type: "",
          message: ""
        }
      ]
    }`,
  },
  {
    id: "simple_insights",
    format: `{
      insights: [
        {
          type: "",
          message: ""
        }
      ]
    }`,
  },
  {
    id: "bulk_block_deals",
    format: `{
      title: "",
      summary: "",
      description: ""
    }`,
  },
  {
    id: "insider_trading",
    format: `{
      title: "",
      summaries: [],
      description: "",
      table: {
        id: "",
        class: ""
      }
    }
  }`,
  },
];

// Prompts (each refers to its JSON format by id)
const PROMPTS = [
  {
    id: "stock_indicator_tiles",
    prompt: `
You are an HTML data extraction engine.
Extract all tiles with class "stock-indicator-tile" and return the result in the JSON format below:".

${JSONFORMAT[0].format}

Rules:
- title -> data-title attribute
- label -> text inside <p class="tile-data">
- value -> text inside <div class="value">
- message -> text inside <p class="tile-msg"> if present
- Omit message if not present
- Output only valid JSON, no extra text.
`,
  },
  {
    id: "mf_share_change",
    prompt: `
You are an HTML data extraction engine.
Extract all information and return the result in the JSON format below:".

${JSONFORMAT[1].format}

Rules:
- title -> <h1>
- summary -> <h2>
- charts -> each .tl_stacked_chart
  - heading -> previous <p> header
  - chart_options & chart_data -> parse from data-chartdata
- insights -> elements with class positive/negative Msg
- Output only valid JSON, no extra text.
`,
  },
  {
    id: "simple_insights",
    prompt: `
You are an HTML data extraction engine.
Extract all messages and return the result in the JSON format below:".

${JSONFORMAT[2].format}

Rules:
- type -> class name (positive/negative/neutral)
- message -> <h3> text
- Output only valid JSON, no extra text.
`,
  },
  {
    id: "bulk_block_deals",
    prompt: `
You are an HTML data extraction engine.
Extract all information and  return the result in the JSON format below:".

${JSONFORMAT[3].format}

Rules:
- title -> <h1>
- summary -> <h2> (including nested spans)
- description -> <h4>
- Output only valid JSON, no extra text.
`,
  },
  {
    id: "insider_trading",
    prompt: `
You are an HTML data extraction engine.
Extract all information and  return the result in the JSON format below:".

${JSONFORMAT[4].format}

Rules:
- title -> <h1 class="page-title">
- summaries -> all <h2 class="page-description">
- description -> <h4 class="page-description">
- table.class -> <table> class attribute
- table.id -> "insider_trading_table"
- Output only valid JSON, no extra text.
`,
  },
];

const INSIGHTS_TEMPLATE = [
  {
    updateType: "Valuation",
    indicatorName: "PE",
    url: "https://trendlyne.com/tools/buy-sell-zone/stockpk/symbol/stockslugname/",
    attribute: "class",
    attributeValue:
      "scrolling-wrapper m-l-0 m-r-0 stock-indicator-tile-container",
    tagName: "",
    geminiParsingReq: true,
    filterReq: false,
    geminiPrompt: PROMPTS[0].prompt,
  },
  {
    updateType: "Valuation",
    indicatorName: "DetailledPE",
    url: "https://trendlyne.com/equity/stockpk/symbol/",
    attribute: "data-metrics",
    attributeValue: "",
    tagName: "",
    geminiParsingReq: false,
    filterReq: false,
    geminiPrompt: "",
  },
  {
    updateType: "Valuation",
    indicatorName: "Technical",
    url: "https://trendlyne.com/equity/api/stock/adv-technical-analysis/stockpk/24/",
    attribute: "",
    attributeValue: "",
    tagName: "",
    geminiParsingReq: false,
    filterReq: false,
    geminiPrompt: "",
  },
  {
    updateType: "Holdings",
    indicatorName: "MFHoldings",
    url: "https://trendlyne.com/equity/monthly-mutual-fund-share-holding/stockpk/symbol/latest/stockslugname/prune-etf/",
    attribute: "id",
    attributeValue: "share-change-analysis",
    tagName: "",
    geminiParsingReq: true,
    filterReq: false,
    geminiPrompt: PROMPTS[1].prompt,
  },
  {
    updateType: "Holdings",
    indicatorName: "QuaterlyHoldings",
    url: "https://trendlyne.com/equity/share-holding/stockpk/symbol/latest/stockslugname/",
    attribute: "class",
    attributeValue: "list-group list-group-mbdr gray666 fs09rem",
    tagName: "",
    geminiParsingReq: true,
    filterReq: false,
    geminiPrompt: PROMPTS[2].prompt,
  },
  {
    updateType: "Deals",
    indicatorName: "Bulk/Block Deals",
    url: "https://trendlyne.com/equity/bulk-block-deals/symbol/stockpk/stockslugname/",
    attribute: "class",
    attributeValue: "card-block",
    tagName: "",
    geminiParsingReq: true,
    filterReq: false,
    geminiPrompt: PROMPTS[3].prompt,
  },
  {
    updateType: "Deals",
    indicatorName: "Insider/SAST Deals",
    url: "https://trendlyne.com/equity/insider-trading-sast/all/symbol/stockpk/stockslugname/",
    attribute: "class",
    attributeValue: "tlcard p-a-1 m-b-2",
    tagName: "",
    geminiParsingReq: true,
    filterReq: false,
    geminiPrompt: PROMPTS[4].prompt,
  },
  {
    updateType: "Financials",
    indicatorName: "FinancialInsights",
    url: "https://trendlyne.com/fundamentals/financials/stockpk/symbol/stockslugname/",
    attribute: "data-stock-insight",
    attributeValue: "",
    tagName: "",
    geminiParsingReq: false,
    filterReq: false,
    geminiPrompt: "",
  },
];

const DEFAULT_OPTIONS = {
  metadataConcurrency: 10,
  batchSize: 10,
  batchConcurrency: 1, // How many batches to process in parallel (1 = sequential)
  normalizeSymbols: true,
  requestTimeoutMs: 10000,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  mockMetadata: null,
  mockExtract: false,
  invalidateCache: true, // If true, ignore cache and fetch fresh data
};

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "")
    .trim()
    .toUpperCase();
  console.log(`[normalizeSymbol] "${symbol}" -> "${normalized}"`);
  return normalized;
}

async function asyncPool(limit, items, iterator) {
  console.log(
    `[asyncPool] Starting pool with limit=${limit}, items=${items.length}`,
  );
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      console.log(
        `[asyncPool] Processing index ${current + 1}/${items.length}`,
      );
      results[current] = await iterator(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  console.log("[asyncPool] Pool complete");
  return results;
}

async function getStockMetadata(symbol, stockMetadataCache, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const normalizedSymbol = settings.normalizeSymbols
    ? normalizeSymbol(symbol)
    : symbol;

  if (!normalizedSymbol) {
    console.warn("[getStockMetadata] Empty symbol");
    return { symbol, error: "Empty symbol" };
  }

  // Check cache before fetching
  if (stockMetadataCache && stockMetadataCache.has(normalizedSymbol)) {
    const cachedData = stockMetadataCache.get(normalizedSymbol);
    console.log(
      `[getStockMetadata] Cache HIT for ${normalizedSymbol}: pk=${cachedData.pk}, slug=${cachedData.slug}`,
    );
    return { symbol: normalizedSymbol, ...cachedData };
  }

  console.log(
    `[getStockMetadata] Cache MISS for ${normalizedSymbol}. Fetching...`,
  );

  try {
    const targetUrl = `https://trendlyne.com/equity/${normalizedSymbol}/stock-page/`;
    console.log(`[getStockMetadata] Fetching ${targetUrl}`);
    const { data: html } = await axios.get(targetUrl, {
      timeout: settings.requestTimeoutMs,
      headers: { "User-Agent": settings.userAgent },
    });

    const $ = cheerio.load(html);
    const pk = $("[data-stock-pk]").first().attr("data-stock-pk");
    const slug = $("[data-stockslugname]").first().attr("data-stockslugname");

    if (!pk || !slug) {
      console.warn(
        `[getStockMetadata] Missing pk/slug for ${normalizedSymbol}`,
      );
      return {
        symbol: normalizedSymbol,
        error: "Missing data-stock-pk or data-stockslugname",
      };
    }

    // console.log(
    //   `[getStockMetadata] Resolved ${normalizedSymbol}: pk=${pk}, slug=${slug}`,
    // );

    // Update cache
    const metadata = { pk: String(pk), slug: String(slug) };
    if (stockMetadataCache) {
      stockMetadataCache.set(normalizedSymbol, metadata);
      // console.log(
      //   `[getStockMetadata] Updated metdata cache for ${normalizedSymbol}`,
      // );
    }

    return { symbol: normalizedSymbol, ...metadata };
  } catch (error) {
    console.error(
      `[getStockMetadata] Failed for ${normalizedSymbol}: ${error.message}`,
    );
    return { symbol: normalizedSymbol, error: error.message };
  }
}

function generateInsightConfig(symbol, pk, slug) {
  console.log(
    `[generateInsightConfig] Building config for ${symbol} (pk=${pk}, slug=${slug})`,
  );
  return INSIGHTS_TEMPLATE.map((template) => {
    const finalUrl = template.url
      .replace(/stockpk/g, pk)
      .replace(/symbol/g, symbol)
      .replace(/stockslugname/g, slug);

    return {
      ...template,
      url: finalUrl,
    };
  });
}

/**
 * Main function to initiate bulk insight extraction with cache support
 * @param {Array<string>} symbols - Array of stock symbols
 * @param {Map} stockDataCache - The cache Map to store/retrieve results
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Extraction results
 */
async function initiateBulkInsightExtraction(
  symbols,
  stockDataCache,
  options = {},
) {
  if (!stockDataCache || !(stockDataCache instanceof Map)) {
    throw new Error("stockDataCache must be a Map instance");
  }

  const settings = { ...DEFAULT_OPTIONS, ...options };
  const symbolList = Array.isArray(symbols) ? symbols : [];
  console.log(
    `[initiateBulkInsightExtraction] Symbols=${symbolList.length}, ` +
      `invalidateCache=${settings.invalidateCache}, ` +
      `mockMetadata=${Boolean(settings.mockMetadata)}, mockExtract=${Boolean(
        settings.mockExtract,
      )}`,
  );

  // Check cache for symbols that don't need refresh
  const symbolsToFetch = [];
  const cachedSymbols = [];

  if (!settings.invalidateCache) {
    for (const sym of symbolList) {
      const normalizedSym = settings.normalizeSymbols
        ? normalizeSymbol(sym)
        : sym;
      if (stockDataCache.has(normalizedSym)) {
        const cached = stockDataCache.get(normalizedSym);
        console.log(
          `[initiateBulkInsightExtraction] Found cache for ${normalizedSym} (timestamp: ${new Date(cached.timestamp).toISOString()})`,
        );
        cachedSymbols.push(normalizedSym);
      } else {
        symbolsToFetch.push(normalizedSym);
      }
    }
    console.log(
      `[initiateBulkInsightExtraction] Cache hit: ${cachedSymbols.length}, ` +
        `Cache miss: ${symbolsToFetch.length}`,
    );
  } else {
    symbolsToFetch.push(
      ...symbolList.map((sym) =>
        settings.normalizeSymbols ? normalizeSymbol(sym) : sym,
      ),
    );
    console.log(
      `[initiateBulkInsightExtraction] Cache invalidated, fetching all ${symbolsToFetch.length} symbols`,
    );
  }

  // Fetch metadata for symbols that need fetching
  let metadataResults = [];
  if (symbolsToFetch.length > 0) {
    if (settings.mockMetadata && typeof settings.mockMetadata === "object") {
      console.log("[initiateBulkInsightExtraction] Using mock metadata");
      metadataResults = symbolsToFetch.map((sym) => {
        const mock = settings.mockMetadata[sym];
        if (mock && mock.pk && mock.slug) {
          return { symbol: sym, pk: String(mock.pk), slug: String(mock.slug) };
        }
        return { symbol: sym, error: "Missing mockMetadata for symbol" };
      });
    } else {
      metadataResults = await asyncPool(
        settings.metadataConcurrency,
        symbolsToFetch,
        (sym) => getStockMetadata(sym, options.stockMetadataCache, settings),
      );
    }
  }

  // Build request payload for symbols that need fetching
  const requestPayload = [];
  const metadataErrors = [];

  for (const meta of metadataResults) {
    if (meta && meta.pk && meta.slug) {
      requestPayload.push({
        Symbol: meta.symbol,
        data: generateInsightConfig(meta.symbol, meta.pk, meta.slug),
      });
    } else if (meta && meta.error) {
      metadataErrors.push(meta);
    }
  }

  console.log(
    `[initiateBulkInsightExtraction] Payload=${requestPayload.length}, ` +
      `metadataErrors=${metadataErrors.length}`,
  );

  // Process extraction for symbols that need fetching
  const results = {};

  // Add cached results first
  for (const symbol of cachedSymbols) {
    const cached = stockDataCache.get(symbol);
    results[symbol] = cached.results;
    console.log(
      `[initiateBulkInsightExtraction] Using cached results for ${symbol}`,
    );
  }

  // Process new extractions
  if (requestPayload.length > 0) {
    if (settings.mockExtract) {
      console.log("[initiateBulkInsightExtraction] Using mock extraction");
      for (const stock of requestPayload) {
        results[stock.Symbol] = stock.data.map((item) => ({
          ...item,
          success: true,
          mock: true,
          type: "mock",
          data: null,
        }));
        // Store in cache even for mock data
        stockDataCache.set(stock.Symbol, {
          results: results[stock.Symbol],
          timestamp: Date.now(),
        });
      }
    } else {
      // Create batches
      const batches = [];
      for (let i = 0; i < requestPayload.length; i += settings.batchSize) {
        batches.push(requestPayload.slice(i, i + settings.batchSize));
      }

      console.log(
        `[initiateBulkInsightExtraction] Processing ${batches.length} batches ` +
          `(batchSize=${settings.batchSize}, batchConcurrency=${settings.batchConcurrency})`,
      );

      // Process batches with controlled concurrency
      await asyncPool(
        settings.batchConcurrency,
        batches,
        async (batch, batchIndex) => {
          console.log(
            `[initiateBulkInsightExtraction] Executing batch ${batchIndex + 1}/${batches.length} (size=${batch.length})`,
          );
          const batchResults = await extractInsightStandalone(batch);

          // Store each symbol's results in cache
          for (const [symbol, symbolResults] of Object.entries(batchResults)) {
            stockDataCache.set(symbol, {
              results: symbolResults,
              timestamp: Date.now(),
            });
            console.log(
              `[initiateBulkInsightExtraction] Cached results for ${symbol}`,
            );
          }

          Object.assign(results, batchResults);
          console.log(
            `[initiateBulkInsightExtraction] Completed batch ${batchIndex + 1}/${batches.length}`,
          );
          return batchResults;
        },
      );
    }
  }

  console.log(
    `[initiateBulkInsightExtraction] Completed. processedSymbols=${Object.keys(results).length}, ` +
      `cached=${cachedSymbols.length}, fetched=${requestPayload.length}`,
  );

  return {
    results,
    metadataErrors,
    totalSymbols: symbolList.length,
    processedSymbols: Object.keys(results).length,
    cachedCount: cachedSymbols.length,
    fetchedCount: requestPayload.length,
  };
}

/**
 * Fetches stock symbols from NSE API for a given index and processes them
 * @param {string} indexName - The index name (e.g., "NIFTY 50", "NIFTY BANK")
 * @param {Map} stockDataCache - The cache Map to store/retrieve results
 * @param {object} options - Options for initiateBulkInsightExtraction
 * @returns {Promise<object>} Result from initiateBulkInsightExtraction
 */
async function fetchAndProcessIndexStocks(
  indexName,
  stockDataCache,
  options = {},
) {
  if (!indexName || typeof indexName !== "string") {
    console.error("[fetchAndProcessIndexStocks] Invalid index name provided");
    throw new Error("Index name must be a non-empty string");
  }

  if (!stockDataCache || !(stockDataCache instanceof Map)) {
    throw new Error("stockDataCache must be a Map instance");
  }

  try {
    const encodedIndex = encodeURIComponent(indexName);
    const nseUrl = `https://www.nseindia.com/api/equity-stockIndices?index=${encodedIndex}`;

    console.log(
      `[fetchAndProcessIndexStocks] Fetching symbols for index: "${indexName}" from ${nseUrl}`,
    );

    const response = await axios.get(nseUrl, {
      timeout: DEFAULT_OPTIONS.requestTimeoutMs,
      headers: {
        "User-Agent": DEFAULT_OPTIONS.userAgent,
        Accept: "application/json",
        Referer: "https://www.nseindia.com/",
      },
    });

    if (!response.data || !Array.isArray(response.data.data)) {
      console.error(
        `[fetchAndProcessIndexStocks] Invalid response structure for index: ${indexName}`,
      );
      throw new Error("Invalid response structure from NSE API");
    }

    const indexData = response.data;
    console.log(
      `[fetchAndProcessIndexStocks] Received ${indexData.data.length} items from NSE API`,
    );

    // Extract symbols, filtering out the index entry itself
    const symbols = indexData.data
      .filter((item) => {
        // Skip the index entry (priority: 1 or symbol matching index name)
        if (item.priority === 1) return false;
        if (item.symbol === indexName) return false;
        // Only include items with valid symbol
        return item.symbol && typeof item.symbol === "string";
      })
      .map((item) => item.symbol.trim())
      .filter((symbol) => symbol.length > 0);

    console.log(
      `[fetchAndProcessIndexStocks] Extracted ${symbols.length} stock symbols from index "${indexName}"`,
    );

    if (symbols.length === 0) {
      console.warn(
        `[fetchAndProcessIndexStocks] No valid symbols found for index: ${indexName}`,
      );
      return {
        results: {},
        metadataErrors: [],
        totalSymbols: 0,
        processedSymbols: 0,
        indexName,
        symbols: [],
        cachedCount: 0,
        fetchedCount: 0,
      };
    }

    // Process the symbols using initiateBulkInsightExtraction
    console.log(
      `[fetchAndProcessIndexStocks] Starting bulk extraction for ${symbols.length} symbols`,
    );
    const extractionResult = await initiateBulkInsightExtraction(
      symbols,
      stockDataCache,
      options,
    );

    return {
      ...extractionResult,
      indexName,
      symbols,
    };
  } catch (error) {
    console.error(
      `[fetchAndProcessIndexStocks] Failed to fetch/process index "${indexName}":`,
      error.message,
    );
    throw error;
  }
}

module.exports = {
  JSONFORMAT,
  PROMPTS,
  INSIGHTS_TEMPLATE,
  getStockMetadata,
  generateInsightConfig,
  initiateBulkInsightExtraction,
  fetchAndProcessIndexStocks,
};
