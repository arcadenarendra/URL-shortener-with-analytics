import Click from '../models/Click.js';
import DailyStats from '../models/DailyStats.js';
import Url from '../models/Url.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * In-process buffered writer for click events.
 *
 * The redirect response must never wait on analytics, so clicks are pushed into
 * this buffer and flushed in batches of bulk writes. This is the
 * fire-and-forget layer described in the blueprint; the documented next step is
 * swapping this for a BullMQ queue (see README) once clicks must survive a
 * restart or fan out to more than one app instance.
 */

let buffer = [];
let flushTimer = null;
let flushing = false;
let pendingAgain = false;
const stats = { buffered: 0, flushed: 0, dropped: 0, flushes: 0 };

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Which of these visitor hashes have already been counted for this link. */
async function loadRecentVisitorHashes(urlId, visitorHashes) {
  if (visitorHashes.length === 0) return new Map();
  const rows = await DailyStats.find(
    { urlId, visitorHashes: { $in: visitorHashes } },
    { visitorHashes: 1 }
  ).lean();
  const known = new Map();
  for (const row of rows) {
    for (const hash of row.visitorHashes || []) known.set(hash, true);
  }
  return known;
}

export function recordClick(click) {
  if (buffer.length >= config.clickBuffer.size * 10) {
    // The writer is wedged (a long Mongo outage). Drop rather than grow
    // unbounded and take the process down with an OOM.
    stats.dropped += 1;
    return false;
  }
  buffer.push(click);
  stats.buffered = buffer.length;
  if (buffer.length >= config.clickBuffer.size) {
    void flush();
  }
  return true;
}

export async function flush() {
  if (flushing) {
    pendingAgain = true;
    return;
  }
  if (buffer.length === 0) return;

  flushing = true;
  const batch = buffer;
  buffer = [];
  stats.buffered = 0;

  try {
    await Click.insertMany(batch, { ordered: false });
    await Promise.all([bumpClickCounters(batch), rollupDailyStats(batch)]);
    stats.flushed += batch.length;
    stats.flushes += 1;
  } catch (err) {
    logger.error(`Click flush failed (${batch.length} events):`, err.message);
  } finally {
    flushing = false;
    if (pendingAgain) {
      pendingAgain = false;
      void flush();
    }
  }
}

/**
 * Apply the batch's clicks to each link's lifetime counter in one update per link.
 * Doing this here rather than per-request keeps a hot link at O(1) writes per
 * CLICK_BUFFER_SIZE redirects instead of one write each.
 */
async function bumpClickCounters(batch) {
  const perUrl = new Map();
  for (const click of batch) {
    perUrl.set(click.urlId, (perUrl.get(click.urlId) || 0) + 1);
  }
  await Promise.all(
    [...perUrl].map(([urlId, count]) => Url.updateOne({ _id: urlId }, { $inc: { totalClicks: count } }))
  );
}

/**
 * Maintain per-day counters alongside the raw clicks.
 *
 * uniqueVisitors needs a distinct count per day, which an atomic $inc cannot do.
 * We store the day's visitor hashes alongside the counter and compute the delta
 * (new hashes minus hashes already counted that day) inside an upsert.
 */
async function rollupDailyStats(batch) {
  // Group the whole batch into (urlId, date) buckets in one pass.
  const buckets = new Map();
  for (const click of batch) {
    const key = `${click.urlId}|${dayKey(click.timestamp || Date.now())}`;
    if (!buckets.has(key)) buckets.set(key, { urlId: click.urlId, date: dayKey(click.timestamp || Date.now()), clicks: 0, hashes: new Set() });
    const bucket = buckets.get(key);
    bucket.clicks += 1;
    if (!click.isBot && click.visitorHash) bucket.hashes.add(click.visitorHash);
  }

  await Promise.all(
    [...buckets.values()].map(async ({ urlId, date, clicks, hashes }) => {
      const incoming = [...hashes];
      if (incoming.length === 0) {
        await DailyStats.updateOne({ urlId, date }, { $inc: { clicks } }, { upsert: true });
        return;
      }
      const known = await loadRecentVisitorHashes(urlId, incoming);
      const delta = incoming.filter((h) => !known.has(h)).length;
      await DailyStats.updateOne(
        { urlId, date },
        {
          $inc: { clicks, uniqueVisitors: delta },
          $addToSet: { visitorHashes: { $each: incoming } },
        },
        { upsert: true }
      );
    })
  );
}

export function startClickWriter() {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flush(), config.clickBuffer.flushIntervalMs);
  flushTimer.unref(); // never hold the process open on shutdown
  logger.info(`Click writer started (buffer ${config.clickBuffer.size}, flush ${config.clickBuffer.flushIntervalMs}ms)`);
}

export async function stopClickWriter() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flush();
}

export function clickWriterStats() {
  return { ...stats, pending: buffer.length };
}
