import { Router } from 'express';
import { showSignup, signup, showLogin, login, logout } from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { guestOnly } from '../middleware/auth.js';

const router = Router();

router.get('/signup', guestOnly, showSignup);
router.post('/signup', guestOnly, authLimiter, signup);
router.get('/login', guestOnly, showLogin);
router.post('/login', guestOnly, authLimiter, login);
router.post('/logout', logout);

export default router;