const Redis = require("ioredis");

const redisClient = new Redis({
  host: process.env.REDISURL,
  port: 6379,
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisClient.on("error", () => {
  //console.log("Redis connection error");
});
module.exports = { redisClient };
