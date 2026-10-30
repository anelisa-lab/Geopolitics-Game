import rateLimit from 'express-rate-limit';
import { AppError } from '../domain/errors.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError('Too many attempts. Wait 15 minutes and try again.', 429));
  },
});
