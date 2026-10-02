import * as urlService from '../services/urlService.js';
import { recordClick } from '../services/clickQueue.js';
import { hashVisitor } from '../utils/hashVisitor.js';
import { parseUserAgent } from '../utils/parseUserAgent.js';
import { lookupGeo } from '../utils/geo.js';
import logger from '../utils/logger.js';

const PAGE = (code, reason) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Link unavailable</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1a1a1a}h1{font-size:1.4rem}a{color:#0b64c8}</style>
</head><body>
<h1>This link isn't available</h1>
<p>The link <code>${code}</code> ${reason}.</p>
<p><a href="/">Go home</a></p>
</body></html>`;

const REASONS = {
  notfound: 'does not exist',
  expired: 'has expired',
  inactive: 'has been deactivated by its owner',
  exhausted: 'has reached its click limit',
};

/**
 * The hot path.
 *
 * 302 (not 301) on purpose: browsers cache a 301 permanently, so the second
 * visit would never reach this server and the click would be invisible to us.
 *
 * Click logging is fire-and-forget — the response is sent before the event is
 * queued, and the queue writes in batches off the request path.
 */
export async function redirect(req, res, next) {
  const { code } = req.params;
  const startedAt = process.hrtime.bigint();

  try {
    const { url, cacheHit } = await urlService.resolveByCode(code);

    const hit = cacheHit ? 'hit' : 'miss';
    res.set('X-Cache', hit);
    res.set('X-Response-Time', `${Number(process.hrtime.bigint() - startedAt) / 1e6}toFixed(2)}ms`);

    if (!url) {
      return res.status(404).type('html').send(PAGE(code, REASONS.notfound));
    }
    if (url.isActive === false) {
      return res.status(410).type('html').send(PAGE(code, REASONS.inactive));
    }
    if (url.expiresAt && new Date(url.expiresAt).getTime() <= Date.now()) {
      return res.status(410).type('html').send(PAGE(code, REASONS.expired));
    }
    if (url.maxClicks && url.totalClicks >= url.maxClicks) {
      return res.status(410).type('html').send(PAGE(code, REASONS.exhausted));
    }

    const ua = parseUserAgent(req.headers['user-agent']);
    const ip = req.ip;
    const geo = lookupGeo(ip);

    // Never block the redirect on analytics. The counter bump rides along in the
    // same batched flush, so a hot link costs zero extra writes per request.
    recordClick({
      urlId: url._id,
      timestamp: new Date(),
      visitorHash: hashVisitor(ip),
      country: geo.country,
      city: geo.city,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      referrer: (req.headers.referer || req.headers.referrer || null)?.slice(0, 500) || null,
      isBot: ua.isBot,
    });

    return res.redirect(302, url.longUrl);
  } catch (err) {
    next(err);
  }
}
