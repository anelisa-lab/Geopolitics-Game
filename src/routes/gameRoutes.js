import { Router } from 'express';
import { showNewGame, createGame, showGame, showBrowse } from '../controllers/gameController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadGame } from '../middleware/gameAccess.js';

const router = Router();

router.get('/games', showBrowse);                       // public: Browse games
router.get('/games/new', requireAuth, showNewGame);
router.post('/games', requireAuth, createGame);
router.get('/games/:id', loadGame, showGame);           // public: anyone with the link can watch

export default router;