import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../domain/errors.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Only failed attempts count, so normal logins never lock anyone out.
  // Password guessing still gets blocked after 10 wrong tries.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Too many failed attempts. Wait 15 minutes and try again.', 429));
  },
});

// The game API: plenty for normal play and watching, but stops scripts hammering the server
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Logged-in players are counted per account, everyone else per internet address
  keyGenerator: (req) => req.session?.user?.id ?? ipKeyGenerator(req.ip),
  handler: (req, res, next) => {
    next(new AppError('Too many requests. Wait a minute and try again.', 429));
  },
});