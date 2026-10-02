import Session from '../models/Session.js';
import { verifyAccessToken, hashRefreshToken } from '../utils/tokens.js';
import { ApiError } from '../utils/ApiError.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Require a valid access token; attaches req.userId. */
export function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized('Missing bearer token', 'NO_TOKEN'));
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Exchange a refresh token for a new access token.
 * The presented token must match a live, unrevoked, unexpired session row.
 */
export async function consumeRefreshToken(token) {
  if (!token) throw ApiError.unauthorized('Missing refresh token', 'NO_REFRESH_TOKEN');

  const session = await Session.findOne({
    refreshTokenHash: hashRefreshToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+refreshTokenHash');

  if (!session) throw ApiError.unauthorized('Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
  return session;
}
