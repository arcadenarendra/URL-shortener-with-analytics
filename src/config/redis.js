import { createClient } from "redis";

let redisClient;
let connectionPromise;

export function getRedisClient() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (error) => {
      console.error("Redis client error.", error);
    });
    connectionPromise = redisClient.connect().catch((error) => {
      console.error("Redis connection failed.", error);
      return null;
    });
  }

  return redisClient;
}

export async function getConnectedRedisClient() {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  await connectionPromise;
  return client.isReady ? client : null;
}

export async function disconnectFromRedis() {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  redisClient = undefined;
  connectionPromise = undefined;
}
