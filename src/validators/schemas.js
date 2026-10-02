import { z } from 'zod';
import { SUPPORTED_RANGES } from '../services/analyticsService.js';

const email = z.string().email('Must be a valid email').max(254).toLowerCase().trim();

export const registerSchema = z.object({
  email,
  // 12 is the NIST-recommended floor for a user-chosen password.
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(200),
});

export const createUrlSchema = z
  .object({
    longUrl: z.string().min(4).max(2048),
    customAlias: z.string().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
    title: z.string().max(200).optional(),
    // ISO 8601; must be in the future, checked in the service against "now".
    expiresAt: z.coerce.date().optional(),
    maxClicks: z.coerce.number().int().min(1).max(10_000_000).optional(),
  })
  .strict();

export const updateUrlSchema = z
  .object({
    longUrl: z.string().min(4).max(2048).optional(),
    title: z.string().max(200).nullable().optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    maxClicks: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const idParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });
const codeParam = z.object({ code: z.string().min(1).max(64) });

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const rangeQuery = z.object({
  range: z.enum(SUPPORTED_RANGES).default('7d'),
});

const breakdownQuery = rangeQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const recentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listUrlsQuery = pagination;
export const analyticsSummaryQuery = rangeQuery;
export const analyticsTimeseriesQuery = rangeQuery;
export const analyticsBreakdownQuery = breakdownQuery;
export const recentClicksQuery = recentQuery;
export const dailyStatsQuery = z.object({ limit: z.coerce.number().int().min(1).max(365).default(30) });

export const idParams = idParam;
export const codeParams = codeParam;
