import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', { title: 'My games' });
});

export default router;