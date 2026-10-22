import { Router } from 'express';
import * as home from '../controllers/home.controller.js';
import authRoutes from './auth.routes.js';
import channelRoutes from './channel.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();

router.get('/', home.index);
router.use(authRoutes);
router.use('/dashboard', dashboardRoutes);

// /:username matches almost any path, so the channel routes must come last.
router.use(channelRoutes);

export default router;
