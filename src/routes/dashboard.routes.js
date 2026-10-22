import { Router } from 'express';
import * as dashboard from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.js';

// Everything under /dashboard is for logged-in creators only.
const router = Router();
router.use(requireAuth);

router.get('/', dashboard.show);
router.post('/stream', dashboard.updateStream);
router.post('/profile', dashboard.updateProfile);
router.post('/stream-key', dashboard.resetStreamKey);

export default router;
