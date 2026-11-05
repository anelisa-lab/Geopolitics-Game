import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { showDashboard } from '../controllers/gameController.js';

const router = Router();

router.get('/dashboard', requireAuth, showDashboard);
router.get('/how-to-play', (req, res) => res.render('how-to-play', { title: 'How to play' }));

export default router;