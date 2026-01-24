const { extractInsightLogic } = require("./helper.js");

/**
 * Standalone function that performs stock data extraction without using worker threads.
 * Processes an array of stock data sequentially (or concurrently using Promise.all).
 *
 * @param {Array} stocks - Array of stock objects { Symbol, data }
 * @returns {Promise<Object>} - Object mapping symbols to their extraction results
 */
async function extractInsightStandalone(stocks) {
  const allResults = {};

  for (const stock of stocks) {
    const { Symbol: symbol, data } = stock;
    console.log(
      `[Standalone] Starting processing for Symbol: ${symbol} (${data.length} URLs)`,
    );
    const results = [];

    for (const item of data) {
      const { url, attribute, attributeValue, tagName, ...metadata } = item;
      try {
        console.log(`[Standalone] Processing URL for ${symbol}: ${url}`);
        // Ensure URL has protocol
        const fullUrl = url && url.startsWith("http") ? url : `https://${url}`;

        const result = await extractInsightLogic(
          fullUrl,
          attribute,
          attributeValue,
          tagName,
        );

        results.push({
          ...metadata,
          url,
          success: true,
          ...result,
        });
      } catch (error) {
        console.error(
          `[Standalone] Error processing URL ${url} for ${symbol}:`,
          error.message,
        );
        results.push({
          ...metadata,
          url,
          success: false,
          error: error.message,
        });
      }
    }

    allResults[symbol] = results;
    console.log(`[Standalone] Finished processing for ${symbol}.`);
  }

  return allResults;
}

module.exports = { extractInsightStandalone };
