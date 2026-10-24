import { getConnectedRedisClient } from "../config/redis.js";

const DEFAULT_TTL_SECONDS = 3600;
const CACHE_PREFIX = "url:";

function getCacheKey(shortCode) {
  return `${CACHE_PREFIX}${shortCode}`;
}

function getConfiguredTtl() {
  const value = Number.parseInt(
    process.env.REDIS_CACHE_TTL_SECONDS ?? String(DEFAULT_TTL_SECONDS),
    10,
  );
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TTL_SECONDS;
}

function getTtlSeconds(expiresAt) {
  const configuredTtl = getConfiguredTtl();
  if (!expiresAt) {
    return configuredTtl;
  }

  const remainingSeconds = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, Math.min(configuredTtl, remainingSeconds));
}

export async function getCachedUrl(shortCode) {
  const client = await getConnectedRedisClient();
  if (!client) return null;

  try {
    const cached = await client.get(getCacheKey(shortCode));
    if (!cached) return null;

    const url = JSON.parse(cached);
    if (!url.isActive || (url.expiresAt && new Date(url.expiresAt) <= new Date())) {
      await client.del(getCacheKey(shortCode));
      return null;
    }
    return url;
  } catch (error) {
    console.error("Redis cache read failed.", error);
    return null;
  }
}

export async function cacheUrl(shortCode, url) {
  const ttlSeconds = getTtlSeconds(url.expiresAt);
  if (ttlSeconds < 1) return;

  const client = await getConnectedRedisClient();
  if (!client) return;

  try {
    await client.set(getCacheKey(shortCode), JSON.stringify({
      id: url._id ?? url.id,
      originalUrl: url.originalUrl,
      expiresAt: url.expiresAt ?? null,
      isActive: url.isActive,
    }), { EX: ttlSeconds });
  } catch (error) {
    console.error("Redis cache write failed.", error);
  }
}

export async function invalidateUrlCache(shortCode) {
  const client = await getConnectedRedisClient();
  if (!client) return;

  try {
    await client.del(getCacheKey(shortCode));
  } catch (error) {
    console.error("Redis cache invalidation failed.", error);
  }
}

export { getCacheKey };
