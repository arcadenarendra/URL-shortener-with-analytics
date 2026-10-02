/**
 * Seed a demo account with a few links and synthetic click history so the
 * analytics endpoints have something to show. Safe to re-run: it wipes first.
 *
 *   npm run seed
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/config/db.js';
import User from '../src/models/User.js';
import Url from '../src/models/Url.js';
import Click from '../src/models/Click.js';
import DailyStats from '../src/models/DailyStats.js';
import { hashVisitor } from '../src/utils/hashVisitor.js';

const DEMO_EMAIL = process.env.SEED_EMAIL || 'demo@example.com';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo-password-1234';
const DAYS = 14;

const DEVICES = ['mobile', 'mobile', 'desktop', 'desktop', 'desktop', 'tablet'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge'];
const OSES = ['iOS', 'Windows', 'macOS', 'Android', 'Linux'];
const COUNTRIES = ['IN', 'US', 'GB', 'DE', 'BR', 'NG', 'CA', 'AU'];
const REFERRERS = [
  'https://news.ycombinator.com/',
  'https://x.com/',
  'https://www.google.com/',
  'https://linkedin.com/feed/',
  null,
];

const LINKS = [
  { longUrl: 'https://nodejs.org/en', title: 'Node.js', customAlias: 'node' },
  { longUrl: 'https://developer.mozilla.org/en-US/', title: 'MDN Web Docs' },
  { longUrl: 'https://expressjs.com/', title: 'Express' },
  { longUrl: 'https://www.mongodb.com/docs/', title: 'MongoDB Docs', maxClicks: 1000 },
  { longUrl: 'https://redis.io/docs/', title: 'Redis Docs', expiresInDays: 30 },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function seed() {
  await connectDb();
  await Promise.all([
    User.deleteMany({}),
    Url.deleteMany({}),
    Click.deleteMany({}),
    DailyStats.deleteMany({}),
  ]);

  const user = await User.create({
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
  });

  const now = Date.now();
  let totalClicks = 0;

  for (const spec of LINKS) {
    const { expiresInDays, ...fields } = spec;
    const doc = await Url.create({
      ...fields,
      userId: user._id,
      customAlias: Boolean(fields.customAlias),
      expiresAt: expiresInDays ? new Date(now + expiresInDays * 86_400_000) : null,
      createdAt: new Date(now - DAYS * 86_400_000),
    });

    // Two visitors per day, more on recent days, so the chart has a shape.
    const clicks = [];
    for (let day = DAYS; day >= 0; day -= 1) {
      const count = day < 4 ? 4 + Math.floor(Math.random() * 6) : 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i += 1) {
        clicks.push({
          urlId: doc._id,
          timestamp: new Date(now - day * 86_400_000 - i * 90_000),
          visitorHash: hashVisitor(`203.0.113.${1 + (i % 40)}`),
          country: pick(COUNTRIES),
          city: null,
          device: pick(DEVICES),
          browser: pick(BROWSERS),
          os: pick(OSES),
          referrer: pick(REFERRERS),
          isBot: false,
        });
      }
    }

    await Click.insertMany(clicks, { ordered: false });
    await Url.updateOne({ _id: doc._id }, { $set: { totalClicks: clicks.length } });
    totalClicks += clicks.length;

    // Roll the same daily_stats the click writer would have produced.
    const byDay = new Map();
    for (const click of clicks) {
      const date = click.timestamp.toISOString().slice(0, 10);
      if (!byDay.has(date)) byDay.set(date, { clicks: 0, hashes: new Set() });
      byDay.get(date).clicks += 1;
      byDay.get(date).hashes.add(click.visitorHash);
    }
    await DailyStats.insertMany(
      [...byDay].map(([date, v]) => ({
        urlId: doc._id,
        date,
        clicks: v.clicks,
        uniqueVisitors: v.hashes.size,
        visitorHashes: [...v.hashes],
      }))
    );
  }

  console.log(`Seeded ${LINKS.length} links and ${totalClicks} clicks for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
}

seed()
  .then(async () => {
    await disconnectDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    if (mongoose.connection.readyState !== 0) await disconnectDb();
    process.exit(1);
  });
