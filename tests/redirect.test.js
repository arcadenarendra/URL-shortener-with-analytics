import request from 'supertest';
import { app, registerUser, auth, WINDOWS_UA, IPHONE_UA, BOT_UA } from './helpers.js';
import Url from '../src/models/Url.js';
import Click from '../src/models/Click.js';
import * as cache from '../src/services/cacheService.js';
import { flush } from '../src/services/clickQueue.js';

const TARGET = 'https://example.com/destination';

async function createLink(token, extra = {}) {
  const res = await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET, ...extra }).expect(201);
  return res.body.url;
}

describe('GET /:code', () => {
  it('redirects with 302, never 301', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    const res = await request(app).get(`/${link.code}`).expect(302);
    expect(res.headers.location).toBe(TARGET);
    expect(res.headers['cache-control']).not.toMatch(/max-age=\d{5,}/);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/nosuchcode').expect(404);
    expect(res.body.error ?? res.text).toBeDefined();
  });

  it('serves the second request from cache', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    const first = await request(app).get(`/${link.code}`).expect(302);
    const second = await request(app).get(`/${link.code}`).expect(302);

    expect(first.headers['x-cache']).toBe('miss');
    expect(second.headers['x-cache']).toBe('hit');
  });

  it('falls back to MongoDB when the cache is cold', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await cache.delUrl(link.code);
    const res = await request(app).get(`/${link.code}`).expect(302);
    expect(res.headers['x-cache']).toBe('miss');

    const warm = await request(app).get(`/${link.code}`).expect(302);
    expect(warm.headers['x-cache']).toBe('hit');
  });

  it('returns 410 once the link is deactivated, and the cache follows', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);
    await request(app).get(`/${link.code}`).expect(302);

    await request(app)
      .patch(`/api/urls/${link.id}`)
      .set(auth(token))
      .send({ isActive: false })
      .expect(200);

    const res = await request(app).get(`/${link.code}`).expect(410);
    expect(res.text).toMatch(/deactivated/);
  });

  it('stops resolving an expired link', async () => {
    const { token } = await registerUser();
    const link = await createLink(token, { expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await request(app).get(`/${link.code}`).expect(302);

    // Force the clock rather than sleeping: move expiresAt into the past.
    await Url.updateOne({ code: link.code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await cache.delUrl(link.code);

    const res = await request(app).get(`/${link.code}`).expect(410);
    expect(res.text).toMatch(/expired/);
  });

  it('stops resolving a link that hit its click cap', async () => {
    const { token } = await registerUser();
    const link = await createLink(token, { maxClicks: 1 });

    await request(app).get(`/${link.code}`).expect(302);
    await flush();
    await cache.delUrl(link.code);

    const res = await request(app).get(`/${link.code}`).expect(410);
    expect(res.text).toMatch(/click limit/);
  });
});

describe('click tracking', () => {
  it('logs the click with parsed device and browser, and bumps the counter', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await request(app)
      .get(`/${link.code}`)
      .set('User-Agent', IPHONE_UA)
      .set('Referer', 'https://news.example.com/post')
      .expect(302);

    await flush();

    const clicks = await Click.find({ urlId: link.id }).lean();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ device: 'mobile', browser: 'Mobile Safari', isBot: false });
    expect(clicks[0].referrer).toBe('https://news.example.com/post');

    const doc = await Url.findById(link.id).lean();
    expect(doc.totalClicks).toBe(1);
  });

  it('flags bots but still counts them in the lifetime total', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await request(app).get(`/${link.code}`).set('User-Agent', BOT_UA).expect(302);
    await flush();

    const [click] = await Click.find({}).lean();
    expect(click.isBot).toBe(true);
    expect((await Url.findById(link.id).lean()).totalClicks).toBe(1);
  });

  it('never stores a raw IP', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    await request(app).get(`/${link.code}`).set('User-Agent', WINDOWS_UA).expect(302);
    await flush();

    const [click] = await Click.find({}).lean();
    expect(click.visitorHash).toEqual(expect.any(String));
    expect(click.visitorHash).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
  });

  it('counts repeat clicks from the same visitor once in unique stats', async () => {
    const { token } = await registerUser();
    const link = await createLink(token);

    for (let i = 0; i < 3; i += 1) {
      await request(app).get(`/${link.code}`).set('User-Agent', WINDOWS_UA).expect(302);
    }
    await flush();

    const summary = await request(app)
      .get(`/api/urls/${link.id}/analytics?range=24h`)
      .set(auth(token))
      .expect(200);

    expect(summary.body.analytics.totalClicks).toBe(3);
    expect(summary.body.analytics.uniqueVisitors).toBe(1);
  });
});
