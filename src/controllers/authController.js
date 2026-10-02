import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, issueRefreshToken, hashRefreshToken, refreshTokenExpiry } from '../utils/tokens.js';
import { consumeRefreshToken } from '../middleware/auth.js';

// Cost 12 is ~250ms on commodity hardware: slow enough to make offline cracking
// expensive, fast enough for an interactive login.
const BCRYPT_ROUNDS = 12;

async function createSession(user, userAgent) {
  const { token, hash } = issueRefreshToken();
  await Session.create({
    userId: user._id,
    refreshTokenHash: hash,
    expiresAt: refreshTokenExpiry(),
    userAgent: userAgent || null,
  });
  return token;
}

function authPayload(user, accessToken, refreshToken) {
  return {
    user: user.toPublicJSON(),
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  };
}

export async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    if (await User.exists({ email })) {
      throw ApiError.conflict('That email is already registered', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ email, passwordHash });
    const refreshToken = await createSession(user, req.headers['user-agent']);

    res.status(201).json(authPayload(user, signAccessToken(user), refreshToken));
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    // Compare against a dummy hash when the user does not exist so that a missing
    // account and a wrong password take the same time (no user enumeration).
    const hash = user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) throw ApiError.unauthorized('Invalid email or password', 'BAD_CREDENTIALS');

    const refreshToken = await createSession(user, req.headers['user-agent']);
    res.json(authPayload(user, signAccessToken(user), refreshToken));
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const session = await consumeRefreshToken(req.body.refreshToken);
    const user = await User.findById(session.userId);
    if (!user) throw ApiError.unauthorized('User no longer exists', 'INVALID_REFRESH_TOKEN');

    // Rotate: the presented token is single-use.
    await Session.updateOne({ _id: session._id }, { revokedAt: new Date() });
    const refreshToken = await createSession(user, req.headers['user-agent']);

    res.json(authPayload(user, signAccessToken(user), refreshToken));
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.body?.refreshToken) {
      await Session.updateOne(
        { refreshTokenHash: hashRefreshToken(req.body.refreshToken) },
        { revokedAt: new Date() }
      );
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) throw ApiError.unauthorized('User no longer exists');
    res.json({ user: user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
}
