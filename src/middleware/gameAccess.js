import { AppError, ForbiddenError, NotFoundError } from '../domain/errors.js';
import { gameRepository } from '../repositories/GameRepository.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export async function loadGame(req, res, next) {
  const { id } = req.params;
  if (!OBJECT_ID.test(id)) return next(new NotFoundError('That game does not exist.'));

  const game = await gameRepository.findById(id);
  if (!game) return next(new NotFoundError('That game does not exist.'));

  req.game = game;
  next();
}

export function requireOwner(req, res, next) {
  if (req.game.ownerId.toString() === req.session.user?.id) return next();
  next(new ForbiddenError('Only the player who created this game can make moves. You can still watch.'));
}

export function requireHumanTurn(req, res, next) {
  const game = req.game;
  if (game.status !== 'active') return next(new AppError('This game is over.', 409));

  const human = game.players.find((player) => player.type === 'human');
  const currentPlayerId = game.turnOrder[game.currentTurnIndex];
  if (currentPlayerId !== human.playerId) return next(new AppError("It's not your turn yet.", 409));

  next();
}