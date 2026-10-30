import { UnauthorizedError } from '../domain/errors.js';

export function requireAuth(req, res, next) {
  if (req.session.user) return next();

  if (req.originalUrl.startsWith('/api/')) return next(new UnauthorizedError());

  // Remember where they were going, so login can send them back there
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

export function guestOnly(req, res, next) {
  if (req.session.user) return res.redirect('/dashboard');
  next();
}