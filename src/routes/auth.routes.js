import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as auth from '../controllers/auth.controller.js';
import { renderError } from '../middleware/errors.js';
import { requireAuth, requireGuest } from '../middleware/auth.js';

const router = Router();

// Slows down password guessing: 20 login or sign-up attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => renderError(req, res, 429, 'Too many attempts. Try again in a few minutes.'),
});

router.get('/login', requireGuest, auth.showLogin);
router.post('/login', requireGuest, authLimiter, auth.login);
router.get('/register', requireGuest, auth.showRegister);
router.post('/register', requireGuest, authLimiter, auth.register);
router.post('/logout', requireAuth, auth.logout);

export default router;
