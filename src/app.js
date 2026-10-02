import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

import config, { ROOT_DIR } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import urlRoutes from './routes/urlRoutes.js';
import { redirect } from './controllers/redirectController.js';
import { redirectLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { clickWriterStats } from './services/clickQueue.js';
import { cacheStats } from './services/cacheService.js';
import redis from './config/redis.js';
import mongoose from 'mongoose';

export function createApp() {
  const app = express();

  // Behind a proxy (Render/Railway/nginx) req.ip must come from X-Forwarded-For,
  // otherwise every client shares one rate-limit bucket and one visitor hash.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  if (config.env !== 'test') {
    app.use(morgan(config.isProd ? 'combined' : 'dev'));
  }

  app.get('/health', async (_req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redis.status,
      clickWriter: clickWriterStats(),
    });
  });

  app.get('/health/cache', async (_req, res) => {
    res.json({ redis: redis.status, ...(await cacheStats()) });
  });

  const openapiPath = path.join(ROOT_DIR, 'openapi.yaml');
  if (fs.existsSync(openapiPath)) {
    const spec = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'URL Shortener API' }));
    app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').send(fs.readFileSync(openapiPath, 'utf8')));
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/urls', urlRoutes);

  // The hot path, last so it never shadows an API route.
  app.get('/:code', redirectLimiter, redirect);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
