import { URL } from 'node:url';
import mongoose from 'mongoose';
import Url from '../models/Url.js';
import * as cache from './cacheService.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { generateCode, isValidAlias } from '../utils/generateCode.js';
import { ApiError } from '../utils/ApiError.js';

const DANGEROUS_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'];

/**
 * Reject anything that would make us an open redirect or an XSS gadget.
 * We only ever forward to http(s), and never to our own host (redirect loops).
 */
export function validateLongUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiError(400, 'INVALID_URL', 'longUrl must be a valid absolute URL');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (DANGEROUS_PROTOCOLS.includes(protocol)) {
    throw new ApiError(400, 'INVALID_PROTOCOL', `Links using ${protocol} are not allowed`);
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new ApiError(400, 'INVALID_PROTOCOL', 'Only http and https links are allowed');
  }
  if (!parsed.hostname) {
    throw new ApiError(400, 'INVALID_URL', 'longUrl must include a hostname');
  }

  // Redirect loop guard: a link back into this service would bounce forever.
  if (isOwnHost(parsed.hostname)) {
    throw new ApiError(400, 'REDIRECT_LOOP', 'Cannot create a link that points at this service');
  }
  return parsed.toString();
}

function isOwnHost(hostname) {
  const self = new URL(config.baseUrl);
  const host = hostname.toLowerCase();
  if (host === self.hostname.toLowerCase()) return true;
  // Also treat 127.0.0.1 / localhost as "us" in development.
  if (config.isProd === false && ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return true;
  return false;
}

const isDuplicateKey = (err) => err?.code === 11000;

const MAX_CODE_ATTEMPTS = 5;

export async function createUrl({ longUrl, userId, customAlias, title, expiresAt, maxClicks }) {
  const normalised = validateLongUrl(longUrl);

  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'EXPIRY_IN_PAST', 'expiresAt must be in the future');
  }

  if (customAlias) {
    if (!isValidAlias(customAlias)) {
      throw new ApiError(400, 'INVALID_ALIAS', 'Alias must be 3-32 characters, letters, numbers, - or _');
    }
    const existing = await Url.exists({ code: customAlias });
    if (existing) throw new ApiError(409, 'ALIAS_TAKEN', 'That alias is already taken');
  }

  // Retry a few times on a nanoid collision before giving up. At 62^7 combinations
  // this effectively never fires, but the unique index is the real guarantee.
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = customAlias || generateCode();
    try {
      const doc = await Url.create({
        code,
        longUrl: normalised,
        userId,
        customAlias: Boolean(customAlias),
        title: title || null,
        expiresAt: expiresAt || null,
        maxClicks: maxClicks || null,
      });
      await cache.setUrl(doc.code, toCachePayload(doc));
      return doc;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      if (customAlias) {
        throw new ApiError(409, 'ALIAS_TAKEN', 'That alias is already taken');
      }
      logger.warn(`Short code collision on attempt ${attempt}, retrying`);
    }
  }
  throw new ApiError(500, 'CODE_EXHAUSTED', 'Could not allocate a short code, please retry');
}

function toCachePayload(doc) {
  return {
    _id: String(doc._id),
    code: doc.code,
    longUrl: doc.longUrl,
    userId: String(doc.userId),
    expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
    maxClicks: doc.maxClicks ?? null,
    totalClicks: doc.totalClicks ?? 0,
    isActive: doc.isActive,
  };
}

/** A cached link is only usable if it was cached before the link went inactive. */
function isCacheEntryResolvable(entry) {
  if (!entry) return false;
  // Tombstone written by updateUrl: fall through to MongoDB for the truth.
  if (entry.__invalid__) return false;
  if (entry.isActive === false) return false;
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) return false;
  if (entry.maxClicks && entry.totalClicks >= entry.maxClicks) return false;
  return true;
}

/**
 * The hot path. Cache first, MongoDB only on a miss.
 * Returns { url, cacheHit } so callers can expose the hit rate in headers.
 */
export async function resolveByCode(code) {
  const cached = await cache.getUrl(code);
  if (isCacheEntryResolvable(cached)) {
    return { url: cached, cacheHit: true };
  }
  if (cached) {
    // Cached but no longer resolvable: drop it so the next request re-reads Mongo.
    await cache.delUrl(code);
  }

  const doc = await Url.findOne({ code });
  if (!doc) return { url: null, cacheHit: false };

  if (doc.isResolvable()) {
    await cache.setUrl(code, toCachePayload(doc));
  } else {
    await cache.delUrl(code);
  }
  return { url: doc, cacheHit: false };
}

export async function listUrls({ userId, page = 1, limit = 20, isActive }) {
  const filter = { userId };
  if (isActive !== undefined) filter.isActive = isActive;

  const [items, total] = await Promise.all([
    Url.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Url.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

export async function getOwnedUrl({ urlId, userId }) {
  if (!mongoose.isValidObjectId(urlId)) {
    throw new ApiError(400, 'INVALID_ID', 'Invalid url id');
  }
  const doc = await Url.findOne({ _id: urlId, userId });
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Link not found');
  return doc;
}

export async function updateUrl({ urlId, userId, patch }) {
  const doc = await getOwnedUrl({ urlId, userId });

  if (patch.longUrl !== undefined) doc.longUrl = validateLongUrl(patch.longUrl);
  if (patch.title !== undefined) doc.title = patch.title;
  if (patch.isActive !== undefined) doc.isActive = patch.isActive;
  if (patch.expiresAt !== undefined) doc.expiresAt = patch.expiresAt;
  if (patch.maxClicks !== undefined) doc.maxClicks = patch.maxClicks;

  await doc.save();
  // Cap the tombstone by the document's own remaining lifetime, so a link set to
  // expire in 10 minutes cannot keep serving its old destination for a full hour.
  const remainingSec = doc.expiresAt
    ? Math.ceil((doc.expiresAt.getTime() - Date.now()) / 1000)
    : config.cacheTtlSeconds;
  await cache.setUrl(doc.code, { __invalid__: true }, Math.max(remainingSec, 1));
  return doc;
}

export async function deleteUrl({ urlId, userId }) {
  const doc = await getOwnedUrl({ urlId, userId });
  await Promise.all([doc.deleteOne(), cache.delUrl(doc.code)]);
}

export default {
  validateLongUrl,
  createUrl,
  resolveByCode,
  listUrls,
  getOwnedUrl,
  updateUrl,
  deleteUrl,
};
