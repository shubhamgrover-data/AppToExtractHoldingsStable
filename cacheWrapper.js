const { redisClient, REDISCONNECTION } = require("./redis.js");

const REDISSWITCH = (process.env.REDISURL || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)) ? true : false;

class CacheWrapper {
  constructor(name, internalMap = new Map()) {
    this.name = name;
    this.map = internalMap;
    console.log(
      `[CacheWrapper] Initialized ${name} with REDISSWITCH=${REDISSWITCH} (${REDISCONNECTION})`,
    );
  }

  async get(key) {
    if (REDISSWITCH && redisClient) {
      try {
        const val = await redisClient.get(`${this.name}:${key}`);
        if (val) {
          console.log(`[CacheWrapper] ${this.name} Redis HIT for ${key}`);
          // ioredis returns string, @upstash/redis auto-parses JSON
          return REDISCONNECTION === "HTTP" ? val : JSON.parse(val);
        }
        console.log(`[CacheWrapper] ${this.name} Redis MISS for ${key}`);
        return null;
      } catch (err) {
        console.error(`[CacheWrapper] ${this.name} Redis GET error:`, err);
        return null;
      }
    } else {
      return this.map.get(key);
    }
  }

  async set(key, value, ttl = 86400) {
    if (REDISSWITCH && redisClient) {
      try {
        console.log(`[CacheWrapper] ${this.name} Redis SET for ${key}`);
        if (REDISCONNECTION === "HTTP") {
          await redisClient.set(`${this.name}:${key}`, value, { ex: ttl });
        } else {
          await redisClient.set(
            `${this.name}:${key}`,
            JSON.stringify(value),
            "EX",
            ttl
          );
        }
      } catch (err) {
        console.error(`[CacheWrapper] ${this.name} Redis SET error:`, err);
      }
    } else {
      this.map.set(key, value);
    }
  }

  async has(key) {
    if (REDISSWITCH && redisClient) {
      try {
        const exists = await redisClient.exists(`${this.name}:${key}`);
        return exists === 1;
      } catch (err) {
        console.error(`[CacheWrapper] ${this.name} Redis EXISTS error:`, err);
        return false;
      }
    } else {
      return this.map.has(key);
    }
  }

  async delete(key) {
    if (REDISSWITCH && redisClient) {
      try {
        console.log(`[CacheWrapper] ${this.name} Redis DELETE for ${key}`);
        await redisClient.del(`${this.name}:${key}`);
      } catch (err) {
        console.error(`[CacheWrapper] ${this.name} Redis DELETE error:`, err);
      }
    } else {
      this.map.delete(key);
    }
  }

  async clear() {
    if (REDISSWITCH && redisClient) {
      try {
        console.log(`[CacheWrapper] ${this.name} Redis CLEAR (prefix based)`);
        const keys = await redisClient.keys(`${this.name}:*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (err) {
        console.error(`[CacheWrapper] ${this.name} Redis CLEAR error:`, err);
      }
    } else {
      this.map.clear();
    }
  }

  async getSize() {
    if (REDISSWITCH && redisClient) {
      const keys = await redisClient.keys(`${this.name}:*`);
      return keys.length;
    }
    return this.map.size;
  }
}

module.exports = { CacheWrapper, REDISSWITCH };
