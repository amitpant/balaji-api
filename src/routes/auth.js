import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { AdminUser } from '../models/AdminUser.js';
import { ah, validate } from '../lib/validate.js';
import { loginInput } from '../lib/schemas.js';
import { HttpError } from '../middleware/error.js';
import { clearSession, requireAdmin, setSession } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again in 15 minutes' } }),
});

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginInput),
  ah(async (req, res) => {
    const user = await AdminUser.findOne({ email: req.body.email }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'INVALID_LOGIN', 'Wrong email or password');
    setSession(res, user);
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ user: req.user });
});
