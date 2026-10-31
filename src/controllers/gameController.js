import { gameService } from '../services/GameService.js';
import { buildGameView } from '../services/gameView.js';
import { createGameSchema } from '../validators/gameSchemas.js';
import { ValidationError } from '../domain/errors.js';
import { gameListQuerySchema } from '../validators/listSchemas.js';

async function renderNewGame(res, status, error, values = {}) {
  const countries = await gameService.listCountries();
  res.status(status).render('games/new', { title: 'New game', countries, error, values });
}

export async function showNewGame(req, res) {
  await renderNewGame(res, 200, null);
}

export async function createGame(req, res, next) {
  const values = { iso2: req.body.iso2, title: req.body.title };
  const result = createGameSchema.safeParse(req.body);
  if (!result.success) return renderNewGame(res, 400, result.error.issues[0].message, values);

  try {
    const game = await gameService.createGame(req.session.user.id, result.data);
    res.redirect(`/games/${game._id}`);
  } catch (err) {
    if (err instanceof ValidationError) return renderNewGame(res, 400, err.message, values);
    next(err);
  }
}

export function showGame(req, res) {
  const game = buildGameView(req.game, req.session.user?.id);
  res.render('games/show', { title: game.title, game });
}
// Rebuilds the URL query (?q=...&status=...) for page links, so filters stay applied
function listUrl(basePath, query, page) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (page > 1) params.set('page', page);
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function listLocals(basePath, query, result) {
  return {
    ...result,
    query,
    basePath,
    isFiltered: Boolean(query.q || query.status),
    prevUrl: result.page > 1 ? listUrl(basePath, query, result.page - 1) : null,
    nextUrl: result.page < result.pages ? listUrl(basePath, query, result.page + 1) : null,
  };
}

export async function showDashboard(req, res) {
  const query = gameListQuerySchema.parse(req.query);
  const result = await gameService.listMyGames(req.session.user.id, query);
  res.render('dashboard', { title: 'My games', ...listLocals('/dashboard', query, result) });
}

export async function showBrowse(req, res) {
  const query = gameListQuerySchema.parse(req.query);
  const result = await gameService.listPublicGames(req.session.user?.id, query);
  res.render('games/index', { title: 'Browse games', ...listLocals('/games', query, result) });
}