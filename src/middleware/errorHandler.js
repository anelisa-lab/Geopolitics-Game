import { NotFoundError } from '../domain/errors.js';

export function notFound(req, res, next) {
  next(new NotFoundError(`We couldn't find ${req.originalUrl}.`));
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  const message = status >= 500
    ? 'Something went wrong on our side. Please try again.'
    : err.message;

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  res.status(status).render('error', { title: 'Error', status, message });
}