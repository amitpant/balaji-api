import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './error.js';

export const COOKIE = 'session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const secret = () => {
  if (!env.JWT_SECRET) throw new HttpError(500, 'SERVER_MISCONFIGURED', 'JWT_SECRET is not set');
  return env.JWT_SECRET;
};

export function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role, name: user.name }, secret(), {
    expiresIn: '7d',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'UNAUTHORIZED', 'Please log in'));
  try {
    const payload = jwt.verify(token, secret());
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(401, 'UNAUTHORIZED', 'Session expired, please log in again'));
  }
}
