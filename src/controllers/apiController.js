import { gameService } from '../services/GameService.js';
import { buildGameView } from '../services/gameView.js';
import { eventsQuerySchema } from '../validators/gameSchemas.js';

const viewerId = (req) => req.session.user?.id;

// Only the fields the browser needs
const toEventView = (event) => ({
  seq: event.seq,
  round: event.round,
  playerId: event.playerId,
  type: event.type,
  payload: event.payload,
  commentary: event.commentary ?? null,
  justification: event.justification ?? null,
});

// Every move answers with the new board and the events it caused
function respondWith(move) {
  return async (req, res) => {
    const events = await move(req);
    res.json({ state: buildGameView(req.game, viewerId(req)), events: events.map(toEventView) });
  };
}

export function getState(req, res) {
  res.json(buildGameView(req.game, viewerId(req)));
}

export async function getEvents(req, res) {
  const { after } = eventsQuerySchema.parse(req.query);
  const events = await gameService.listEvents(req.game._id, after);
  res.json({ events: events.map(toEventView) });
}

export const reinforce = respondWith((req) => gameService.reinforce(req.game, req.validated.allocations));
export const transfer = respondWith((req) => gameService.transfer(req.game, req.validated));
export const startAttack = respondWith((req) => gameService.startAttack(req.game, req.validated));
export const rollAttack = respondWith((req) => gameService.rollAttack(req.game));
export const stopAttack = respondWith((req) => gameService.stopAttack(req.game));
export const conquestMove = respondWith((req) => gameService.conquestMove(req.game, req.validated));
export const endTurn = respondWith((req) => gameService.endTurn(req.game));
