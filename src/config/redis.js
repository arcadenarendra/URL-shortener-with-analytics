import Redis from 'ioredis';
import config from './env.js';
import logger from '../utils/logger.js';

// ioredis queues commands while the socket is down and replays them on reconnect,
// which is exactly what we want for the cache-aside redirect path.
export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: true,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('error', (err) => {
  // Log once per failure streak rather than on every retry.
  logger.error('Redis error', err.message);
});

export async function connectRedis() {
  if (redis.status === 'ready' || redis.status === 'connecting') return redis;
  await redis.connect();
  await redis.ping();
  logger.info('Redis connected');
  return redis;
}

export async function disconnectRedis() {
  if (redis.status === 'end') return;
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
  logger.info('Redis disconnected');
}

export default redis;
