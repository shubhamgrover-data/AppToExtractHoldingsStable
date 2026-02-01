const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const { JSDOM } = require("jsdom");
const path = require("path");
const { parseTableToJSON } = require("./helper.js");
const { Worker } = require("worker_threads");
const crypto = require("crypto");

const { extractInsightStandalone } = require("./standalone_extractor.js");
const { fetchAndProcessIndexStocks } = require("./FetchStocksForIndices_v2.js");
const { cacheCleanupAndRebuild } = require("./cron.js");

const { CacheWrapper } = require("./cacheWrapper.js");

// Configuration for max stocks in one bulk request
const MAX_STOCKS_PER_REQUEST = 20;
// Separate cache for persistent stock data results
// Map of symbol -> { results, timestamp }
const stockDataCache = new CacheWrapper("stockDataCache");
// In-memory cache for stock metadata (symbol -> {pk, slug})
const stockMetadataCache = new CacheWrapper("stockMetadataCache");
// In-memory cache for background requests
const requestCache = new CacheWrapper("requestCache");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "X-Custom-Header",
    ],
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint to extract data
app.post("/api/extract", async (req, res) => {
  const { urls, label, attribute } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Please provide at least one URL" });
  }

  const results = [];

  for (const url of urls) {
    try {
      // Check metadata cache for specific attributes
      if (attribute === "data-stock-pk" || attribute === "data-stockslugname") {
        const symbolMatch = url.match(/\/equity\/([^/]+)\/stock-page\//);
        if (symbolMatch) {
          const symbol = symbolMatch[1].toUpperCase();
          const cached = await stockMetadataCache.get(symbol);
          if (cached) {
            console.log(
              `[POST /api/extract] Cache HIT for ${symbol} attribute ${attribute}`,
            );
            results.push({
              url,
              success: true,
              data: attribute === "data-stock-pk" ? cached.pk : cached.slug,
              attribute: attribute,
              rawValue: attribute === "data-stock-pk" ? cached.pk : cached.slug,
              fromCache: true,
            });
            continue;
          }
        }
      }

      const { data: html } = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const $ = cheerio.load(html);

      // Find element with the specified attribute
      const element = $(`[${attribute}]`).first();

      if (element.length) {
        const attrValue = element.attr(attribute);

        if (attrValue) {
          try {
            const jsonData = JSON.parse(attrValue);
            results.push({
              url,
              success: true,
              data: jsonData,
              attribute: attribute,
              rawValue: attrValue,
            });
          } catch (parseError) {
            results.push({
              url,
              success: true,
              data: null,
              attribute: attribute,
              rawValue: attrValue,
              parseError: "Could not parse as JSON",
            });
          }
        } else {
          results.push({
            url,
            success: false,
            error: `Attribute "${attribute}" not found`,
          });
        }
      } else {
        results.push({
          url,
          success: false,
          error: `Element with attribute "${attribute}" not found`,
        });
      }
    } catch (error) {
      results.push({
        url,
        success: false,
        error: error.message,
      });
    }
  }

  res.json({ results });
});

// GET endpoint for single URL data extraction
app.get("/api/extract-data", async (req, res) => {
  const { url, attribute, attributeValue, tagName } = req.query;
  let symbol = "";

  console.log(
    `[GET /api/extract-data] Request for URL: ${url}, Attribute: ${attribute}, Value: ${attributeValue}, Tag: ${tagName}`,
  );

  if (!url) {
    return res.status(400).json({ error: "Please provide a url parameter" });
  }

  // Check metadata cache for stock pk/slug if the URL follows trendlyne pattern
  if (
    String(attribute) === "data-stock-pk,data-stockslugname" ||
    String(attribute) === "data-stockslugname,data-stock-pk"
  ) {
    const symbolMatch = url.match(/\/equity\/([^/]+)\/stock-page\/?$/);
    if (symbolMatch) {
      symbol = symbolMatch[1].toUpperCase();
      const cached = await stockMetadataCache.get(symbol);
      if (cached) {
        console.log(
          `[GET /api/extract-data] Cache HIT for ${symbol} attribute ${attribute}`,
        );
        return res.json(cached);
      } else {
        console.log(
          `[GET /api/extract-data] Cache MISS for ${symbol} attribute ${attribute}`,
        );
      }
    } else {
      console.log("`[GET /api/extract-data] Symbol not found in URL");
    }
  }

  try {
    const { data: html } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (attribute && attributeValue) {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      let selector;

      // if (attribute === "class") {
      //   selector = tagName
      //     ? `${tagName}.${attributeValue}`
      //     : `.${attributeValue}`;
      // } else
      {
        selector = tagName
          ? `[${attribute}="${attributeValue}"]`
          : `[${attribute}="${attributeValue}"]`;
      }

      let element = document.querySelector(selector);
      element = element ? element.outerHTML : null;
      if (element) {
        let jsonOutput;
        if (tagName === "table") {
          jsonOutput = parseTableToJSON(element);
        } else jsonOutput = element;
        return res.send(jsonOutput);
      } else {
        return res.status(404).json({
          error: `Element with attribute "${attribute}" and attrValue "${attributeValue}" not found`,
        });
      }
    }

    // If attribute is provided, maintain existing logic
    else if (attribute) {
      const attributes = attribute.split(",").map((attr) => attr.trim());
      const $ = cheerio.load(html);

      if (attributes.length > 1) {
        const multiResults = {};
        for (const attr of attributes) {
          try {
            const element = $(`[${attr}]`).first();
            if (element.length) {
              const attrValue = element.attr(attr);
              if (attrValue) {
                try {
                  multiResults[attr] = JSON.parse(attrValue);
                } catch (parseError) {
                  multiResults[attr] = attrValue;
                }
              } else {
                multiResults[attr] = null;
              }
            } else {
              multiResults[attr] = null;
            }
          } catch (selectorError) {
            multiResults[attr] = { error: "Invalid attribute selector" };
          }
        }
        if (
          attribute === "data-stock-pk,data-stockslugname" ||
          attribute === "data-stockslugname,data-stock-pk"
        ) {
          if (
            multiResults["data-stock-pk"] &&
            multiResults["data-stockslugname"]
          ) {
            // Update cache
            const metadata = {
              pk: String(multiResults["data-stock-pk"]),
              slug: String(multiResults["data-stockslugname"]),
            };
            if (stockMetadataCache) {
              await stockMetadataCache.set(symbol, metadata);
              // console.log(
              //   `[GET /api/extract-data] Updated metadata cache for ${symbol}`,
              // );
            }
          }
          const finalMetadata = await stockMetadataCache.get(symbol);
          return res.json(finalMetadata);
        }
        return res.json(multiResults);
      } else {
        // Original single attribute logic
        const singleAttr = attributes[0];
        const element = $(`[${singleAttr}]`).first();

        if (element.length) {
          const attrValue = element.attr(singleAttr);

          if (attrValue) {
            try {
              const jsonData = JSON.parse(attrValue);
              // Maintain compatibility with previous data structure if possible

              if (
                Array.isArray(jsonData) &&
                jsonData[0] &&
                jsonData[0][1] &&
                jsonData[0][1].tableData
              ) {
                return res.json(jsonData[0][1].tableData);
              }
              return res.json(jsonData);
            } catch (parseError) {
              return res.status(200).json({
                error: "Could not parse as JSON",
                rawValue: attrValue,
              });
            }
          } else {
            return res
              .status(404)
              .json({ error: `Attribute "${singleAttr}" not found` });
          }
        } else {
          return res.status(404).json({
            error: `Element with attribute "${singleAttr}" not found`,
          });
        }
      }
    }

    // Change 1: If no attribute, return html as is
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/extractinsight", async (req, res) => {
  const isBulk = req.query.BulkStocks;
  const invalidateCache = req.query.invalidateCache;
  const useStandalone = req.query.mode;
  const body = req.body;

  // Normalize input: single stock object becomes an array of one
  const stocks = isBulk ? body : [body];

  console.log(
    `[extractinsight] Received ${isBulk ? "BULK" : "SINGLE"} request for ${stocks?.length || 0} stocks. mode=${useStandalone ? "standalone" : "worker"}, invalidateCache=${invalidateCache}`,
  );

  if (!Array.isArray(stocks) || stocks.length === 0) {
    console.error("[extractinsight] Error: Invalid request body structure");
    return res
      .status(400)
      .json({ error: "Please provide a valid stock data structure" });
  }

  if (stocks.length > MAX_STOCKS_PER_REQUEST) {
    console.error(
      `[extractinsight] Error: Too many stocks (${stocks.length}). Max allowed: ${MAX_STOCKS_PER_REQUEST}`,
    );
    return res.status(400).json({
      error: `Too many stocks. Maximum allowed is ${MAX_STOCKS_PER_REQUEST}`,
    });
  }

  const requestId = crypto.randomUUID();
  console.log(`[extractinsight] Generated requestId: ${requestId}`);

  if (useStandalone) {
    // Initialize cache entry for the request
    await requestCache.set(requestId, {
      status: "pending",
      results: {},
      completedStocks: 0,
      totalStocks: stocks.length,
      timestamp: Date.now(),
    });

    // Separate stocks into cached and uncached
    const cachedResults = {};
    const stocksToFetch = [];

    for (const stock of stocks) {
      const { Symbol: symbol } = stock;
      // Check stockDataCache first before fetching from URL
      const cachedStockData =
        invalidateCache != "true" ? await stockDataCache.get(symbol) : null;
      if (cachedStockData) {
        console.log(
          `[extractinsight] [Standalone] Using cached data for ${symbol}`,
        );
        cachedResults[symbol] = cachedStockData.results;
      } else {
        stocksToFetch.push(stock);
      }
    }

    // Execute standalone only for stocks that need fetching
    (async () => {
      try {
        const cachedData = await requestCache.get(requestId);
        if (!cachedData) return;

        // Add cached results first
        for (const symbol in cachedResults) {
          cachedData.results[symbol] = cachedResults[symbol];
          cachedData.completedStocks++;
        }

        // If all stocks were cached, mark as resolved
        if (stocksToFetch.length === 0) {
          cachedData.status = "resolved";
          await requestCache.set(requestId, cachedData);
          console.log(
            `[extractinsight] Standalone execution completed for ${requestId} (all from cache)`,
          );
          return;
        }

        // Fetch remaining stocks
        const fetchedResults = await extractInsightStandalone(stocksToFetch);

        // Add fetched results and update stockDataCache
        for (const symbol in fetchedResults) {
          cachedData.results[symbol] = fetchedResults[symbol];
          cachedData.completedStocks++;

          // Update persistent stockDataCache
          await stockDataCache.set(symbol, {
            results: fetchedResults[symbol],
            timestamp: Date.now(),
          });
        }

        cachedData.status = "resolved";
        await requestCache.set(requestId, cachedData);
        console.log(
          `[extractinsight] Standalone execution completed for ${requestId}`,
        );
      } catch (error) {
        console.error(
          `[extractinsight] Standalone execution failed for ${requestId}:`,
          error,
        );
        const cachedData = await requestCache.get(requestId);
        if (cachedData) {
          cachedData.status = "failed";
          cachedData.error = error.message;
          await requestCache.set(requestId, cachedData);
        }
      }
    })();

    return res.json({
      requestId,
      status: "pending",
      totalStocks: stocks.length,
      mode: "standalone",
    });
  }

  // Original worker logic (unchanged)
  // Initialize cache entry for the request
  await requestCache.set(requestId, {
    status: "pending",
    results: {}, // Map of symbol -> results
    completedStocks: 0,
    totalStocks: stocks.length,
    timestamp: Date.now(),
  });

  const checkCompletion = async () => {
    const cachedData = await requestCache.get(requestId);
    if (cachedData && cachedData.completedStocks === cachedData.totalStocks) {
      cachedData.status = "resolved";
      await requestCache.set(requestId, cachedData);
      console.log(`[extractinsight] All stocks for ${requestId} completed.`);
    }
  };

  for (const stock of stocks) {
    const { Symbol: symbol, data } = stock;

    if (!symbol || !data) {
      console.error(`[extractinsight] Skipping invalid stock entry:`, stock);
      const cachedData = await requestCache.get(requestId);
      if (cachedData) {
        cachedData.completedStocks++;
        await requestCache.set(requestId, cachedData);
        await checkCompletion();
      }
      continue;
    }

    // Check if symbol data exists in cache and should be used
    const cachedStockData = !invalidateCache
      ? await stockDataCache.get(symbol)
      : null;
    if (cachedStockData) {
      console.log(`[extractinsight] Using cached data for ${symbol}`);
      const reqCachedData = await requestCache.get(requestId);
      if (reqCachedData) {
        reqCachedData.results[symbol] = cachedStockData.results;
        reqCachedData.completedStocks++;
        await requestCache.set(requestId, reqCachedData);
        await checkCompletion();
      }
      continue;
    }

    const worker = new Worker("./worker.js", {
      workerData: { symbol, data },
    });

    worker.on("message", async (message) => {
      console.log(
        `[extractinsight] Worker completed for ${symbol} in request ${requestId}`,
      );
      const cachedData = await requestCache.get(requestId);
      if (cachedData) {
        // Save to persistent stock cache
        await stockDataCache.set(symbol, {
          results: message.results,
          timestamp: Date.now(),
        });

        cachedData.results[symbol] = message.results;
        cachedData.completedStocks++;
        await requestCache.set(requestId, cachedData);
        await checkCompletion();
      }
    });

    worker.on("error", async (error) => {
      console.error(
        `[extractinsight] Worker error for ${symbol} in request ${requestId}:`,
        error,
      );
      const cachedData = await requestCache.get(requestId);
      if (cachedData) {
        cachedData.results[symbol] = { success: false, error: error.message };
        cachedData.completedStocks++;
        await requestCache.set(requestId, cachedData);
        await checkCompletion();
      }
    });
  }

  res.json({ requestId, status: "pending", totalStocks: stocks.length });
});
// Endpoint to check status of a request
app.get("/api/extractinsight/status/:requestId", async (req, res) => {
  const { requestId } = req.params;
  console.log(`[status] Checking status for requestId: ${requestId}`);
  const cachedData = await requestCache.get(requestId);

  if (!cachedData) {
    const size = await requestCache.getSize();
    console.error(
      `[status] RequestId ${requestId} not found in cache. Current cache size: ${size}`,
    );
    return res.status(404).json({ error: "Request ID not found" });
  }

  console.log(
    `[status] Found data for ${requestId}: status=${cachedData.status}`,
  );
  res.json(cachedData);

  if (cachedData.status === "resolved") {
    console.log(
      `[status] Request ${requestId} is resolved and has been fetched. Cleaning up request cache.`,
    );
    await requestCache.delete(requestId);
  }
});

// POST endpoint to extract data from a URL using POST method
app.post("/api/extractdata_post", async (req, res) => {
  const { url, attribute, attributeValue, tagName, headers } = req.query;
  console.log(
    `[POST /api/extractdata_post] Request for URL: ${url}, Attribute: ${attribute}, Value: ${attributeValue}, Tag: ${tagName}`,
  );

  if (!url) {
    return res.status(400).json({ error: "Please provide a url parameter" });
  }

  try {
    const { data: html } = await axios.post(url, req.body || {}, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        ...(headers || {}),
      },
    });

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (attribute && attributeValue) {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      let selector = tagName
        ? `${tagName}[${attribute}="${attributeValue}"]`
        : `[${attribute}="${attributeValue}"]`;

      let element = document.querySelector(selector);
      let elementHtml = element ? element.outerHTML : null;

      if (elementHtml) {
        if (tagName === "table") {
          const jsonOutput = parseTableToJSON(elementHtml);
          return res.json(jsonOutput);
        } else {
          return res.send(elementHtml);
        }
      } else {
        return res.status(404).json({
          error: `Element with attribute "${attribute}" and attrValue "${attributeValue}" not found`,
        });
      }
    } else if (attribute) {
      const $ = cheerio.load(html);
      const element = $(`[${attribute}]`).first();

      if (element.length) {
        const attrValue = element.attr(attribute);
        if (attrValue) {
          try {
            const jsonData = JSON.parse(attrValue);
            if (
              Array.isArray(jsonData) &&
              jsonData[0] &&
              jsonData[0][1] &&
              jsonData[0][1].tableData
            ) {
              return res.json(jsonData[0][1].tableData);
            }
            return res.json(jsonData);
          } catch (parseError) {
            return res
              .status(400)
              .json({ error: "Could not parse as JSON", rawValue: attrValue });
          }
        } else {
          return res
            .status(404)
            .json({ error: `Attribute "${attribute}" not found` });
        }
      } else {
        return res
          .status(404)
          .json({ error: `Element with attribute "${attribute}" not found` });
      }
    }

    // Default: return html as is
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint-only API route that returns just the extracted data (POST for multiple URLs)
app.post("/api/extract-data", async (req, res) => {
  const { urls, label, attribute } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Please provide at least one URL" });
  }

  const results = [];

  for (const url of urls) {
    try {
      const { data: html } = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const $ = cheerio.load(html);
      const element = $(`[${attribute}]`).first();

      if (element.length) {
        const attrValue = element.attr(attribute);

        if (attrValue) {
          try {
            const jsonData = JSON.parse(attrValue);
            results.push(jsonData);
          } catch (parseError) {
            results.push({
              error: "Could not parse as JSON",
              rawValue: attrValue,
            });
          }
        }
      }
    } catch (error) {
      results.push({ error: error.message });
    }
  }

  // Return just the data, not wrapped in results array if single URL
  const finalData = results.length === 1 ? results[0] : results;
  res.json(finalData);
});

app.get("/api/triggerRefresh", async (req, res) => {
  const clearCache = req.query.clearCache;

  if (clearCache === "yes") {
    console.log(`[triggerRefresh] Triggering refresh with clear cache`);
    await stockDataCache.clear();
    await requestCache.clear();
    //stockMetadataCache.clear(); not required
  } else {
    console.log(`[triggerRefresh] Triggering refresh without clearing cache`);
  }

  const stockDataSize = await stockDataCache.getSize();
  const metadataSize = await stockMetadataCache.getSize();
  const requestCacheSize = await requestCache.getSize();

  return res.json({
    message: clearCache === "yes" ? "Caches cleared" : "Caches not cleared",
    cacheSizes: {
      stockDataCache: stockDataSize,
      stockMetadataCache: metadataSize,
      requestCache: requestCacheSize,
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// (async () => {
//   //const stockDataCache = new Map();
//   await fetchAndProcessIndexStocks("NIFTY 50", stockDataCache, {
//     stockMetadataCache,
//     invalidateCache: true, // Force refresh even if cached
//     metadataConcurrency: 10,
//     batchSize: 10,
//     batchConcurrency: 1,
//   });
// })();
