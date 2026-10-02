import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from '../config/redis.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // If Redis is down, fall back to the default in-memory store rather than
  // letting every request fail.
  store: config.isProd
    ? new RedisStore({ sendCommand: (...args) => redis.sendCommand(...args) })
    : undefined,
};

/** Credentials endpoints: strict, since they are the brute-force surface. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in 15 minutes' },
    });
  },
});

/** Blueprint: stricter on create, ~20/hour. */
export const createLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'CREATE_RATE_LIMITED', message: 'Link creation limit reached, try again later' },
    });
  },
});

/** Looser on the redirect hot path: this is the traffic that makes the product work. */
export const redirectLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 600,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  },
});

/** Reads (list, analytics) sit in between. */
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${req.userId || req.body?.email || 'anon'}`,
  handler: (_req, res) => {
    logger.warn('Rate limit exceeded');
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  },
});
