import request from 'supertest';
import { app, registerUser, auth, WINDOWS_UA, IPHONE_UA } from './helpers.js';
import Click from '../src/models/Click.js';
import DailyStats from '../src/models/DailyStats.js';
import { flush } from '../src/services/clickQueue.js';

const TARGET = 'https://example.com/destination';
const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function createLink(token) {
  const res = await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET }).expect(201);
  return res.body.url;
}

/** Seed clicks directly so tests do not depend on the async writer's timing. */
async function seedClicks(urlId, rows) {
  await Click.insertMany(
    rows.map((r) => ({ urlId, isBot: false, timestamp: new Date(), ...r }))
  );
  return Click.find({ urlId }).lean();
}

describe('GET /api/urls/:id/analytics', () => {
  it('returns zeroed analytics for a link with no clicks', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics?range=7d`)
      .set(auth(token))
      .expect(200);

    expect(res.body.analytics).toMatchObject({ totalClicks: 0, uniqueVisitors: 0, firstClickAt: null });
  });

  it('summarises clicks and unique visitors within the range', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    const now = Date.now();

    await seedClicks(link.id, [
      { visitorHash: 'v1', timestamp: new Date(now - 2 * DAY), device: 'desktop' },
      { visitorHash: 'v1', timestamp: new Date(now - 2 * DAY + HOUR), device: 'desktop' },
      { visitorHash: 'v2', timestamp: new Date(now - HOUR), device: 'mobile' },
      // Outside the 7d window: must not be counted.
      { visitorHash: 'v3', timestamp: new Date(now - 30 * DAY), device: 'desktop' },
    ]);

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics?range=7d`)
      .set(auth(token))
      .expect(200);

    expect(res.body.analytics.totalClicks).toBe(3);
    expect(res.body.analytics.uniqueVisitors).toBe(2);
  });

  it('excludes bot clicks from analytics but reports them separately', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await seedClicks(link.id, [{ visitorHash: 'v1' }, { visitorHash: 'v2' }]);
    await Click.create({ urlId: link.id, visitorHash: 'bot1', isBot: true, timestamp: new Date() });

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics?range=7d`)
      .set(auth(token))
      .expect(200);

    expect(res.body.analytics.totalClicks).toBe(2);
  });

  it('rejects an unsupported range', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    await request(app)
      .get(`/api/urls/${link.id}/analytics?range=99y`)
      .set(auth(token))
      .expect(400);
  });

  it('refuses to serve analytics for another user link', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const link = await createLink(alice.token);

    await request(app).get(`/api/urls/${link.id}/analytics`).set(auth(bob.token)).expect(404);
  });
});

describe('GET /api/urls/:id/analytics/timeseries', () => {
  it('returns one bucket per day with empty days filled in', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    const now = Date.now();

    await seedClicks(link.id, [
      { visitorHash: 'v1', timestamp: new Date(now - 2 * DAY) },
      { visitorHash: 'v1', timestamp: new Date(now - 2 * DAY + 600_000) },
      { visitorHash: 'v2', timestamp: new Date(now - HOUR) },
    ]);

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics/timeseries?range=7d`)
      .set(auth(token))
      .expect(200);

    const { data, unit } = res.body.analytics;
    expect(unit).toBe('day');
    // 7 days back, inclusive of today, so up to 8 aligned buckets.
    expect(data.length).toBeGreaterThanOrEqual(7);
    expect(data.length).toBeLessThanOrEqual(8);
    expect(data.every((d) => typeof d.clicks === 'number')).toBe(true);

    const totals = data.reduce((sum, d) => sum + d.clicks, 0);
    expect(totals).toBe(3);
  });

  it('buckets by hour for the 24h range', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    await seedClicks(link.id, [{ visitorHash: 'v1' }]);

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics/timeseries?range=24h`)
      .set(auth(token))
      .expect(200);

    expect(res.body.analytics.unit).toBe('hour');
    expect(res.body.analytics.data.length).toBeLessThanOrEqual(25);
    expect(res.body.analytics.data.every((d) => /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(d.bucket))).toBe(true);
  });
});

describe('GET /api/urls/:id/analytics/breakdown', () => {
  it('breaks clicks down by country, device, browser and referrer', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    const now = Date.now();

    await seedClicks(link.id, [
      { visitorHash: 'v1', country: 'IN', device: 'mobile', browser: 'Chrome', referrer: null },
      { visitorHash: 'v2', country: 'US', device: 'desktop', browser: 'Firefox', referrer: 'https://x.com' },
      { visitorHash: 'v3', country: 'US', device: 'desktop', browser: 'Firefox', referrer: 'https://x.com' },
    ]);

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics/breakdown?range=7d`)
      .set(auth(token))
      .expect(200);

    const { country, device, browser, referrer } = res.body.analytics;
    expect(country[0]).toMatchObject({ value: 'US', clicks: 2, uniqueVisitors: 2 });
    expect(device.find((d) => d.value === 'desktop').clicks).toBe(2);
    expect(browser.find((b) => b.value === 'Firefox').clicks).toBe(2);
    expect(referrer[0]).toMatchObject({ value: 'https://x.com', clicks: 2 });
    // Unknown referrer is labelled rather than null.
    expect(referrer.some((r) => r.value === 'Direct / unknown')).toBe(true);
  });
});

describe('daily stats rollup', () => {
  it('is written alongside the raw clicks by the flusher', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await request(app).get(`/${link.code}`).set('User-Agent', WINDOWS_UA).expect(302);
    await request(app).get(`/${link.code}`).set('User-Agent', IPHONE_UA).expect(302);
    await flush();

    const rows = await DailyStats.find({ urlId: link.id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clicks: 2, uniqueVisitors: 2 });
  });

  it('does not double count a repeat visitor within the same day', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    for (let i = 0; i < 4; i += 1) {
      await request(app).get(`/${link.code}`).set('User-Agent', WINDOWS_UA).expect(302);
    }
    await flush();

    const [row] = await DailyStats.find({ urlId: link.id }).lean();
    expect(row.clicks).toBe(4);
    expect(row.uniqueVisitors).toBe(1);
  });

  it('is readable through the daily endpoint', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    await request(app).get(`/${link.code}`).set('User-Agent', WINDOWS_UA).expect(302);
    await flush();

    const res = await request(app)
      .get(`/api/urls/${link.id}/analytics/daily`)
      .set(auth(token))
      .expect(200);

    expect(res.body.dailyStats).toHaveLength(1);
    expect(res.body.dailyStats[0].clicks).toBe(1);
    // Internal visitor-hash bookkeeping must not leak to clients.
    expect(res.body.dailyStats[0].visitorHashes).toBeUndefined();
  });
});
