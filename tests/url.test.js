import request from 'supertest';
import { app, registerUser, auth } from './helpers.js';
import Url from '../src/models/Url.js';

const TARGET = 'https://example.com/some/long/path?a=1&b=2';

describe('POST /api/urls', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/urls').send({ longUrl: TARGET }).expect(401);
  });

  it('creates a short URL and returns the short form', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/urls')
      .set(auth(token))
      .send({ longUrl: TARGET })
      .expect(201);

    expect(res.body.url.code).toHaveLength(7);
    expect(res.body.url.shortUrl).toMatch(/\/[A-Za-z0-9]{7}$/);
    expect(res.body.url.longUrl).toBe(TARGET);
    expect(res.body.url.totalClicks).toBe(0);
  });

  it('honours a custom alias', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/urls')
      .set(auth(token))
      .send({ longUrl: TARGET, customAlias: 'my-link_1' })
      .expect(201);

    expect(res.body.url.code).toBe('my-link_1');
    expect(res.body.url.customAlias).toBe(true);
  });

  it('rejects an alias that is already taken', async () => {
    const { token } = await registerUser();
    await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET, customAlias: 'taken' }).expect(201);
    const res = await request(app)
      .post('/api/urls')
      .set(auth(token))
      .send({ longUrl: TARGET, customAlias: 'taken' })
      .expect(409);
    expect(res.body.error.code).toBe('ALIAS_TAKEN');
  });

  it.each([
    ['javascript:alert(1)', 'INVALID_PROTOCOL'],
    ['data:text/html,<script>alert(1)</script>', 'INVALID_PROTOCOL'],
    ['file:///etc/passwd', 'INVALID_PROTOCOL'],
    ['not-a-url', 'INVALID_URL'],
    ['http://localhost:3000/abc', 'REDIRECT_LOOP'],
  ])('rejects %s', async (longUrl, expectedCode) => {
    const { token } = await registerUser();
    const res = await request(app).post('/api/urls').set(auth(token)).send({ longUrl }).expect(400);
    expect(res.body.error.code).toBe(expectedCode);
  });

  it('rejects an expiry in the past', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/urls')
      .set(auth(token))
      .send({ longUrl: TARGET, expiresAt: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
    expect(res.body.error.code).toBe('EXPIRY_IN_PAST');
  });

  it('rejects unknown body fields', async () => {
    const { token } = await registerUser();
    await request(app)
      .post('/api/urls')
      .set(auth(token))
      .send({ longUrl: TARGET, isAdmin: true })
      .expect(400);
  });
});

describe('GET /api/urls', () => {
  it('only returns the caller own links, paginated', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/urls').set(auth(alice.token)).send({ longUrl: `${TARGET}/${i}` }).expect(201);
    }
    await request(app).post('/api/urls').set(auth(bob.token)).send({ longUrl: TARGET }).expect(201);

    const res = await request(app)
      .get('/api/urls?page=1&limit=2')
      .set(auth(alice.token))
      .expect(200);

    expect(res.body.urls).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, pages: 2 });

    const bobRes = await request(app).get('/api/urls').set(auth(bob.token)).expect(200);
    expect(bobRes.body.urls).toHaveLength(1);
  });
});

describe('PATCH /api/urls/:id', () => {
  it('deactivates a link', async () => {
    const { token } = await registerUser();
    const created = await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET }).expect(201);

    const res = await request(app)
      .patch(`/api/urls/${created.body.url.id}`)
      .set(auth(token))
      .send({ isActive: false })
      .expect(200);

    expect(res.body.url.isActive).toBe(false);
  });

  it('refuses to touch another user link', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const created = await request(app).post('/api/urls').set(auth(alice.token)).send({ longUrl: TARGET }).expect(201);

    await request(app)
      .patch(`/api/urls/${created.body.url.id}`)
      .set(auth(bob.token))
      .send({ isActive: false })
      .expect(404);
  });

  it('rejects an empty patch', async () => {
    const { token } = await registerUser();
    const created = await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET }).expect(201);
    await request(app).patch(`/api/urls/${created.body.url.id}`).set(auth(token)).send({}).expect(400);
  });
});

describe('DELETE /api/urls/:id', () => {
  it('removes the link', async () => {
    const { token } = await registerUser();
    const created = await request(app).post('/api/urls').set(auth(token)).send({ longUrl: TARGET }).expect(201);

    await request(app).delete(`/api/urls/${created.body.url.id}`).set(auth(token)).expect(204);
    expect(await Url.countDocuments({})).toBe(0);

    await request(app).get(`/api/urls/${created.body.url.id}`).set(auth(token)).expect(404);
  });
});
