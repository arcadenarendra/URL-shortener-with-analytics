import request from 'supertest';
import { app, registerUser, auth, uniqueEmail, validPassword } from './helpers.js';
import Session from '../src/models/Session.js';

describe('POST /api/auth/register', () => {
  it('creates an account and returns tokens', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: validPassword })
      .expect(201);

    expect(res.body).toMatchObject({ tokenType: 'Bearer' });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('never leaks the password hash', async () => {
    const { user } = await registerUser();
    expect(JSON.stringify(user)).not.toMatch(/passwordHash/);
  });

  it('rejects a weak password with field-level detail', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail(), password: 'short' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues.some((i) => i.field === 'password')).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ email, password: validPassword }).expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: validPassword })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for correct credentials', async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: validPassword })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const { email } = await registerUser();
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' })
      .expect(401);
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'not-the-password' })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe('BAD_CREDENTIALS');
    expect(unknownUser.body.error.code).toBe('BAD_CREDENTIALS');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const { refreshToken } = await registerUser();

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(200);
    expect(first.body.accessToken).toEqual(expect.any(String));
    expect(first.body.refreshToken).not.toBe(refreshToken);

    // Single-use: replaying the old token must fail.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    // The new one still works.
    await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
  });

  it('revokes the session on logout', async () => {
    const { refreshToken } = await registerUser();
    await request(app).post('/api/auth/logout').send({ refreshToken }).expect(200);
    await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth('not.a.jwt')).expect(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the caller profile', async () => {
    const { token, email } = await registerUser();
    const res = await request(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(res.body.user.email).toBe(email);
  });
});
