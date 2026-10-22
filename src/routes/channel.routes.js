import { Router } from 'express';
import * as channel from '../controllers/channel.controller.js';
import { requireAuth } from '../middleware/auth.js';

// Channel pages live at the top level (/:username), like twitch.tv/<name>.
const router = Router();

router.get('/:username', channel.show);
router.post('/:username/follow', requireAuth, channel.follow);
router.post('/:username/unfollow', requireAuth, channel.unfollow);

export default router;
