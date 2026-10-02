import mongoose from 'mongoose';
import config from './env.js';
import logger from '../utils/logger.js';

mongoose.set('strictQuery', true);

let connecting = null;

export async function connectDb(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  // Concurrent callers during startup would otherwise open several pools.
  if (!connecting) {
    mongoose.set('strictQuery', true);
    connecting = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 20,
        autoIndex: !config.isProd, // build indexes explicitly in production
      })
      .then((m) => m.connection)
      .finally(() => {
        connecting = null;
      });
  }

  const connection = await connecting;
  logger.info('MongoDB connected');
  return connection;
}

export async function disconnectDb() {
  connecting = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
