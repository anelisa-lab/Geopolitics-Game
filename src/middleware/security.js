import { AppError } from '../domain/errors.js';

const CHANGES_SOMETHING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const blocked = () => new AppError('Requests from other websites are blocked.', 403);

// Stops other websites from sending moves, logins or logouts on a visitor's behalf
// (cross-site request forgery). Reading pages is never blocked.
export function requireSameOrigin(req, res, next) {
  if (!CHANGES_SOMETHING.has(req.method)) return next();

  // Modern browsers say exactly where a request came from:
  // "same-origin" = this site, "none" = typed in or bookmarked, anything else = another site
  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none' ? next() : next(blocked());

  // Older browsers: check the Origin header instead. Forms on this site can send
  // "Origin: null" (because of the no-referrer security header), so only a real,
  // different address counts as another site. Tools like curl send neither header;
  // they're let through, as they can't use a visitor's login cookie anyway.
  const origin = req.get('origin');
  if (origin && origin !== 'null') {
    let originHost = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // not a valid address: treated as another site below
    }
    if (originHost !== req.get('host')) return next(blocked());
  }
  next();
}

// Moves sent to the API must be JSON, which only this site's own script sends.
// A plain HTML form on another website can't send JSON
export function requireJsonBody(req, res, next) {
  if (CHANGES_SOMETHING.has(req.method) && !req.is('application/json')) {
    return next(new AppError('Moves must be sent as JSON.', 415));
  }
  next();
}