import { Router } from 'express';
import { showSignup, signup, showLogin, login, logout } from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimits.js';

const router = Router();

router.get('/signup', showSignup);
router.post('/signup', authLimiter, signup);
router.get('/login', showLogin);
router.post('/login', authLimiter, login);
router.post('/logout', logout);

export default router;