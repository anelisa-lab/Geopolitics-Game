import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { showDashboard } from '../controllers/gameController.js';

const router = Router();

router.get('/dashboard', requireAuth, showDashboard);

export default router;