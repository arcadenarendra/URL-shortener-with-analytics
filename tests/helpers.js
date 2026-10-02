import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

let seq = 0;
export const uniqueEmail = () => `user${Date.now()}${seq++}@example.com`;
export const validPassword = 'correct-horse-battery';

/** Register a user and return { token, user } ready to use as a bearer. */
export async function registerUser(overrides = {}) {
  const email = overrides.email || uniqueEmail();
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: overrides.password || validPassword })
    .expect(201);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, user: res.body.user, email };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
