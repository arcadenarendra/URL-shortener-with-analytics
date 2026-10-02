import { createApp } from './app.js';
import config from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { startClickWriter, stopClickWriter } from './services/clickQueue.js';
import logger from './utils/logger.js';

const app = createApp();
let server;

async function start() {
  await connectDb();

  // Redis is optional: the cache is fail-soft and the app serves redirects
  // straight from MongoDB. A missing Redis must not block boot.
  try {
    await connectRedis();
  } catch (err) {
    logger.warn(`Redis unavailable (${err.message}); running without cache`);
  }

  startClickWriter();

  server = app.listen(config.port, () => {
    logger.info(`Server listening on http://localhost:${config.port} (${config.env})`);
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    // Drain the click buffer first so buffered events are not lost.
    await stopClickWriter();
    if (server) await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([disconnectDb(), disconnectRedis()]);
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
