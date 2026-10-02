import crypto from 'node:crypto';
import config from '../config/env.js';

/**
 * Hash a visitor IP for unique-visitor counting without storing the raw address.
 *
 * A plain hash is not enough: the IP space is tiny (~2^32 for IPv4), so an
 * attacker with the hash list can brute-force every address in seconds. The
 * app-level salt is therefore required to make the mapping non-reversible.
 */
export function hashVisitor(ip) {
  if (!ip) return null;
  return crypto
    .createHmac('sha256', config.visitorSalt)
    .update(String(ip))
    .digest('hex')
    .slice(0, 32);
}
