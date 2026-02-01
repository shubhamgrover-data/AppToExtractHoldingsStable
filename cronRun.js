const cacheCleanupAndRebuild = require("./cron.js");

const cronResults = cacheCleanupAndRebuild();
console.log(
  "Cron worker status at",
  new Date().toString(),
  "\n",
  "NIFTY 50:",
  cronResults[0].getStatus(),
  "\n",
  "NIFTY NEXT 50:",
  cronResults[1].getStatus(),
  "\n",
  "NIFTY MIDCAP 50:",
  cronResults[2].getStatus(),
  "\n",
  "NIFTY MIDCAP 100:",
  cronResults[3].getStatus(),
  "\n",
  "NIFTY MIDCAP 150:",
  cronResults[4].getStatus(),
);
// keep process alive
setInterval(() => {}, 1000);
