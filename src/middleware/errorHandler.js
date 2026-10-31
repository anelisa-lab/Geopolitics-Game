import { NotFoundError } from '../domain/errors.js';

export function notFound(req, res, next) {
  next(new NotFoundError(`We couldn't find ${req.originalUrl}.`));
}

export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message;

  // Two saves of the same game at once (e.g. a double-click): the second one is refused
  if (err.name === 'VersionError') {
    status = 409;
    message = 'This game was just updated. Refresh to see the latest.';
  }

  // A request body that isn't valid JSON
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request was not valid JSON.';
  }

  if (status >= 500) {
    console.error(err);
    message = 'Something went wrong on our side. Please try again.';
  }

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  res.status(status).render('error', { title: 'Error', status, message });
}
