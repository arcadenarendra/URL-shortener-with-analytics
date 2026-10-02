import { connectDb, disconnectDb } from '../src/config/db.js';
import { connectRedis, disconnectRedis } from '../src/config/redis.js';
import redis from '../src/config/redis.js';

// Each file gets a clean database; Redis is flushed once per file too.
beforeAll(async () => {
  process.env.MONGO_URI = process.env.MONGO_TEST_URI;
  await connectDb(process.env.MONGO_TEST_URI);
  try {
    await connectRedis();
    await redis.flushdb();
  } catch {
    // Redis is optional in tests: the cache is fail-soft and redirect tests
    // still pass without it (they just exercise the miss path every time).
  }
});

afterEach(async () => {
  const { collections } = await import('mongoose').then((m) => m.connection);
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await Promise.allSettled([disconnectDb(), disconnectRedis()]);
});
