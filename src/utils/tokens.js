import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import config from '../config/env.js';
import { ApiError } from './ApiError.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id || user.id), type: 'access' }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
    issuer: 'url-shortener',
  });
}

/**
 * Refresh tokens are opaque random strings, not JWTs. Storing a hash of them lets
 * us revoke an individual session; a signed refresh JWT cannot be revoked without
 * a server-side denylist, which is the thing you are trying to avoid.
 */
export function issueRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret, { issuer: 'url-shortener' });
    if (payload.type !== 'access') throw new Error('wrong token type');
    return payload;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Access token expired');
    }
    throw new ApiError(401, 'INVALID_TOKEN', 'Invalid access token');
  }
}

export function refreshTokenExpiry() {
  return new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000);
}
