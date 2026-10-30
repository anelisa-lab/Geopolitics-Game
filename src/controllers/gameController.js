import { gameService } from '../services/GameService.js';
import { buildGameView } from '../services/gameView.js';
import { createGameSchema } from '../validators/gameSchemas.js';
import { ValidationError } from '../domain/errors.js';

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