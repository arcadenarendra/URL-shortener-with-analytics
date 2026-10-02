import redis, { connectRedis } from '../config/redis.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

const PREFIX = 'url:';

/**
 * Cache-aside for the redirect hot path.
 *
 * Every function here is fail-soft: if Redis is unavailable the caller must fall
 * through to MongoDB rather than return an error. A cache outage degrades latency,
 * it must not take down redirects.
 */

export async function getUrl(code) {
  try {
    const raw = await redis.get(PREFIX + code);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Cache read failed for ${code}: ${err.message}`);
    return null;
  }
}

export async function setUrl(code, payload, ttl = config.cacheTtlSeconds) {
  try {
    await redis.set(PREFIX + code, JSON.stringify(payload), 'EX', ttl);
  } catch (err) {
    logger.warn(`Cache write failed for ${code}: ${err.message}`);
  }
}

export async function delUrl(code) {
  try {
    await redis.del(PREFIX + code);
  } catch (err) {
    logger.warn(`Cache delete failed for ${code}: ${err.message}`);
  }
}

/**
 * Invalidate a cached link. Takes the write path's own TTL as the upper bound so a
 * short-lived expiry set after a long cache entry cannot outlive its key.
 */
export async function invalidate(code, ttl = config.cacheTtlSeconds) {
  try {
    const currentTtl = await redis.ttl(PREFIX + code);
    if (currentTtl > 0 && ttl > currentTtl) ttl = currentTtl;
    await redis.set(PREFIX + code, '__invalid__', 'EX', Math.max(ttl, 1));
  } catch {
    /* fail-soft: worst case the stale value lives out its TTL */
  }
}

export async function cacheStats() {
  try {
    let cursor = '0';
    let keys = 0;
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 500);
      cursor = next;
      keys += batch.length;
    } while (cursor !== '0');
    return { keys };
  } catch {
    return { keys: 0 };
  }
}

export { connectRedis };
