import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') return undefined;
  return value;
}

// In production a weak/placeholder secret is a real vulnerability, so refuse to boot.
// In dev and test we fall back to a fixed value so the project runs with zero setup.
function secret(name, devFallback) {
  const value = process.env[name];
  if (!value) {
    if (isProd) {
      throw new Error(`${name} must be set in production. Generate one with:
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
    }
    return devFallback;
  }
  if (value.includes('change-me') && isProd) {
    throw new Error(`${name} still holds the placeholder value from .env.example`);
  }
  if (value.length < 32 && isProd) {
    throw new Error(`${name} must be at least 32 characters in production`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: Number(process.env.PORT || 3000),

  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''),

  mongoUri:
    process.env.MONGO_URI ||
    (isTest ? 'mongodb://127.0.0.1:27017/url_shortener_test' : 'mongodb://localhost:27017/url_shortener'),

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret-do-not-use-in-production-0000'),
    refreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-do-not-use-in-production-000'),
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7),
  },

  visitorSalt: secret('VISITOR_SALT', 'dev-visitor-salt'),

  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 3600),

  clickBuffer: {
    size: Number(process.env.CLICK_BUFFER_SIZE || 200),
    flushIntervalMs: Number(process.env.CLICK_FLUSH_INTERVAL_MS || 1000),
  },
};

export default config;
