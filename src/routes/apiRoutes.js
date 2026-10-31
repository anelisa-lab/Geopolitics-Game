import { Router } from 'express';
import {
  getState, getEvents, reinforce, transfer, startAttack, rollAttack, stopAttack, conquestMove, endTurn,
} from '../controllers/apiController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadGame, requireOwner, requireHumanTurn } from '../middleware/gameAccess.js';
import { validate } from '../middleware/validate.js';
import { reinforceSchema, transferSchema, attackSchema, conquestMoveSchema } from '../validators/gameSchemas.js';

const router = Router();

// Every move passes the same checks, in this order:
// logged in → game exists → it's your game → it's your turn
const canMove = [requireAuth, loadGame, requireOwner, requireHumanTurn];

// Public: anyone can watch
router.get('/games/:id/state', loadGame, getState);
router.get('/games/:id/events', loadGame, getEvents);

// Moves: only the owner, on their turn
router.post('/games/:id/reinforce', ...canMove, validate(reinforceSchema), reinforce);
router.post('/games/:id/transfer', ...canMove, validate(transferSchema), transfer);
router.post('/games/:id/attack', ...canMove, validate(attackSchema), startAttack);
router.post('/games/:id/attack/roll', ...canMove, rollAttack);
router.post('/games/:id/attack/stop', ...canMove, stopAttack);
router.post('/games/:id/conquest-move', ...canMove, validate(conquestMoveSchema), conquestMove);
router.post('/games/:id/end-turn', ...canMove, endTurn);

export default router;
