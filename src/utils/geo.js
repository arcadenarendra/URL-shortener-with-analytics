import geoip from 'geoip-lite';

/**
 * Best-effort country lookup. geoip-lite ships its own database, so this works
 * offline and adds no network hop on the redirect path.
 */
export function lookupGeo(ip) {
  if (!ip) return { country: null, city: null };
  // geoip-lite returns null for private/loopback ranges, which is expected in dev.
  const geo = geoip.lookup(ip);
  if (!geo) return { country: null, city: null };
  return { country: geo.country || null, city: geo.city || null };
}
