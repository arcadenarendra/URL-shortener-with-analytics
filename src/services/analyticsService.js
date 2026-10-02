import mongoose from 'mongoose';
import Click from '../models/Click.js';
import DailyStats from '../models/DailyStats.js';
import Url from '../models/Url.js';
import { ApiError } from '../utils/ApiError.js';

const RANGES = {
  '24h': { ms: 24 * 60 * 60 * 1000, unit: 'hour', format: '%Y-%m-%dT%H:00' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, unit: 'day', format: '%Y-%m-%d' },
  '30d': { ms: 30 * 24 * 60 * 60 * 1000, unit: 'day', format: '%Y-%m-%d' },
  '90d': { ms: 90 * 24 * 60 * 60 * 1000, unit: 'day', format: '%Y-%m-%d' },
  all: { ms: null, unit: 'day', format: '%Y-%m-%d' },
};

export const SUPPORTED_RANGES = Object.keys(RANGES);

export function resolveRange(range) {
  const key = (range || '7d').toLowerCase();
  if (!RANGES[key]) {
    throw new ApiError(400, 'INVALID_RANGE', `range must be one of: ${SUPPORTED_RANGES.join(', ')}`);
  }
  return { key, ...RANGES[key] };
}

function requireObjectId(urlId) {
  if (!mongoose.isValidObjectId(urlId)) {
    throw new ApiError(400, 'INVALID_ID', 'Invalid url id');
  }
  return new mongoose.Types.ObjectId(urlId);
}

/** Total clicks, unique visitors and first/last click for a link. */
export async function summary({ urlId, range = 'all' }) {
  const _id = requireObjectId(urlId);
  const { key, ms } = resolveRange(range);
  const match = { urlId: _id, isBot: false };
  if (ms) match.timestamp = { $gte: new Date(Date.now() - ms) };

  const [totals, first, last] = await Promise.all([
    Click.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          clicks: { $sum: 1 },
          unique: { $addToSet: '$visitorHash' },
        },
      },
      {
        $project: {
          _id: 0,
          clicks: 1,
          // $addToSet already dedupes, but nulls (clicks with no resolvable IP)
          // would each count as one "visitor". Filter them out.
          uniqueVisitors: {
            $size: { $setDifference: [{ $ifNull: ['$unique', []] }, [null]] },
          },
        },
      },
    ]),
    Click.findOne({ urlId: _id, isBot: false }).sort({ timestamp: 1 }).select('timestamp').lean(),
    Click.findOne({ urlId: _id, isBot: false }).sort({ timestamp: -1 }).select('timestamp').lean(),
  ]);

  const url = await Url.findById(_id).select('totalClicks').lean();
  const row = totals[0] || { clicks: 0, uniqueVisitors: 0 };

  return {
    range: key,
    totalClicks: row.clicks,
    uniqueVisitors: row.uniqueVisitors,
    lifetimeClicks: url?.totalClicks ?? 0,
    firstClickAt: first?.timestamp || null,
    lastClickAt: last?.timestamp || null,
  };
}

/** Clicks bucketed by hour or day, with empty buckets filled in for charting. */
export async function timeseries({ urlId, range = '7d' }) {
  const _id = requireObjectId(urlId);
  const { key, ms, unit, format } = resolveRange(range);
  const since = ms ? new Date(Date.now() - ms) : null;
  const cap = Math.min(Math.ceil((Date.now() - (since?.getTime() ?? 0)) / (unit === 'hour' ? 3600_000 : 86_400_000)) + 2, 1000);

  const match = { urlId: _id, isBot: false };
  if (since) match.timestamp = { $gte: since };

  const rows = await Click.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format, date: '$timestamp' } },
        clicks: { $sum: 1 },
        unique: { $addToSet: '$visitorHash' },
      },
    },
    { $project: { _id: 0, bucket: '$_id', clicks: 1, uniqueVisitors: { $size: '$unique' } } },
    { $sort: { bucket: 1 } },
  ]);

  return { range: key, unit, data: fillBuckets(rows, key, unit, cap) };
}

/** Densify the series so the chart has a point for every period, not just active ones. */
function fillBuckets(rows, rangeKey, unit, cap) {
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const stepMs = unit === 'hour' ? 3600_000 : 86_400_000;
  const start = new Date(Date.now() - (RANGES[rangeKey].ms || 7 * 86_400_000));

  // Align to the bucket boundary in UTC so keys line up with $dateToString.
  const aligned = new Date(start);
  if (unit === 'hour') aligned.setUTCMinutes(0, 0, 0);
  else aligned.setUTCHours(0, 0, 0, 0);

  const out = [];
  for (let t = aligned.getTime(), i = 0; t <= Date.now() && i < cap; t += stepMs, i += 1) {
    const d = new Date(t);
    const bucket =
      unit === 'hour'
        ? d.toISOString().slice(0, 13) + ':00'
        : d.toISOString().slice(0, 10);
    const row = byBucket.get(bucket);
    out.push({ bucket, clicks: row?.clicks ?? 0, uniqueVisitors: row?.uniqueVisitors ?? 0 });
  }
  return out;
}

const BREAKDOWN_FIELDS = ['country', 'device', 'browser', 'referrer', 'os'];

/** Top values for each dimension over a time range, in one pass per dimension. */
export async function breakdown({ urlId, range = '7d', limit = 10 }) {
  const _id = requireObjectId(urlId);
  const { key, ms } = resolveRange(range);
  const match = { urlId: _id, isBot: false };
  if (ms) match.timestamp = { $gte: new Date(Date.now() - ms) };

  const results = await Promise.all(
    BREAKDOWN_FIELDS.map(async (field) => {
      const rows = await Click.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, clicks: { $sum: 1 }, unique: { $addToSet: '$visitorHash' } } },
        { $project: { _id: 1, value: '$_id', clicks: 1, uniqueVisitors: { $size: '$unique' } } },
        { $sort: { clicks: -1 } },
        { $limit: limit },
      ]);
      // Group nulls (unknown referrer, unresolvable country) under one label.
      const labelled = rows.map((r) => ({
        value: r.value ?? (field === 'referrer' ? 'Direct / unknown' : 'Unknown'),
        clicks: r.clicks,
        uniqueVisitors: r.uniqueVisitors,
      }));
      return [field, labelled];
    })
  );

  return { range: key, ...Object.fromEntries(results) };
}

/** The most recent individual clicks, for a "recent activity" panel. */
export async function recentClicks({ urlId, limit = 20 }) {
  const _id = requireObjectId(urlId);
  return Click.find({ urlId: _id })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('timestamp country city device browser os referrer isBot')
    .lean();
}

/** Daily rollups, cheap to read because they touch O(days) documents, not O(clicks). */
export async function dailyStats({ urlId, limit = 30 }) {
  const _id = requireObjectId(urlId);
  const rows = await DailyStats.find({ urlId: _id }).sort({ date: -1 }).limit(limit).lean();
  return rows.map(({ _id, ...rest }) => rest).reverse();
}
