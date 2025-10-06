import { Router } from 'express';
import { optionalAuth } from '../middleware/auth';
import { subscribeEvents } from '../controllers/eventsController';

const router = Router();
// Allow optional auth so EventSource can pass token via query
router.use(optionalAuth);

router.get('/subscribe', subscribeEvents);

export default router;