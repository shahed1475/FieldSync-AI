import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { initiateOAuth, oauthCallback } from '../controllers/oauthController';

const router = Router();
router.use(authenticate);

// Initiate OAuth: GET /api/oauth/:platform/init
router.get('/:platform/init', initiateOAuth);

// OAuth callback: GET /api/oauth/:platform/callback
router.get('/:platform/callback', oauthCallback);

export default router;