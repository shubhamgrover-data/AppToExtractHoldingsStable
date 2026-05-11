const RedisTCP = require("ioredis");
const { Redis: RedisHTTP } = require("@upstash/redis");

const REDISCONNECTION = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ? "HTTP" : "TCP";

let redisClient;

if (REDISCONNECTION === "HTTP") {
  redisClient = new RedisHTTP({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log("Redis Mode: HTTP (Upstash REST)");
} else {
  redisClient = new RedisTCP(process.env.REDISURL, {
    connectTimeout: 10000,
    maxRetriesPerRequest: 1,
  });

  redisClient.on("connect", () => {
    console.log("Redis Mode: TCP (ioredis) - Connected");
  });

  redisClient.on("error", (err) => {
    console.error("❌ Redis TCP Error:", err.message);
  });
}

module.exports = { redisClient, REDISCONNECTION };
