const Redis = require('ioredis');

const LIST_CACHE_KEY = 'items:all';
const LIST_TTL_SECONDS = 30;

// REDIS_HOST should be the Compose service name (e.g. "cache"), not localhost,
// when the API runs inside a container on the same network as Redis.
const redis = new Redis({
  host: process.env.REDIS_HOST || 'cache',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.warn('Redis error:', err.message);
});

async function connectCache() {
  try {
    await redis.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.warn('Redis connect failed (API will still run):', err.message);
  }
}

async function getCachedList() {
  try {
    const raw = await redis.get(LIST_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedList(items) {
  try {
    await redis.setex(LIST_CACHE_KEY, LIST_TTL_SECONDS, JSON.stringify(items));
  } catch (err) {
    console.warn('Redis set failed:', err.message);
  }
}

async function invalidateListCache() {
  try {
    await redis.del(LIST_CACHE_KEY);
  } catch (err) {
    console.warn('Redis invalidate failed:', err.message);
  }
}

async function checkRedis() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

module.exports = {
  connectCache,
  getCachedList,
  setCachedList,
  invalidateListCache,
  checkRedis,
  LIST_TTL_SECONDS,
};
