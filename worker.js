const { parentPort, workerData } = require('worker_threads');
const { extractInsightLogic } = require('./helper.js');

async function processStockData() {
  const { symbol, data } = workerData;
  console.log(`[Worker] Starting processing for Symbol: ${symbol} (${data.length} URLs)`);
  
  // Process all URLs in parallel instead of sequentially
  const results = await Promise.all(data.map(async (item) => {
    const { url, attribute, attributeValue, tagName, ...metadata } = item;
    try {
      console.log(`[Worker] Processing URL for ${symbol}: ${url}`);
      // Ensure URL has protocol
      const fullUrl = url && url.startsWith('http') ? url : `https://${url}`;
      
      const result = await extractInsightLogic(
        fullUrl, 
        attribute, 
        attributeValue, 
        tagName 
      );
      
      return { 
        ...metadata,
        url, 
        success: true, 
        ...result 
      };
    } catch (error) {
      console.error(`[Worker] Error processing URL ${url} for ${symbol}:`, error.message);
      return { 
        ...metadata,
        url, 
        success: false, 
        error: error.message 
      };
    }
  }));

  console.log(`[Worker] Finished processing for ${symbol}. Sending results back.`);
  parentPort.postMessage({ status: 'resolved', symbol, results });
}

processStockData();
