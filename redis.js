const Redis = require("ioredis");
const { REDISSWITCH } = require("./cacheWrapper.js");

const redisClient = new Redis({
  host: "127.0.0.1",
  port: 6379,
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisClient

redisClient.on("error", () => {
  //console.log("Redis connection error");
});
module.exports = { redisClient };
