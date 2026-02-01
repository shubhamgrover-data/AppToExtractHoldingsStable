const cacheCleanupAndRebuild = require("./cron.js");

const cronResults = cacheCleanupAndRebuild();
console.log("Cron worker started at", new Date().toString(), cronResults);
// keep process alive
setInterval(() => {}, 1000);
