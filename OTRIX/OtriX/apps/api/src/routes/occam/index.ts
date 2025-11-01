/**
 * OCCAM API Routes Index
 * Phase 2: Regulatory Intelligence
 */

import { Router } from 'express';
import { regintRouter } from './regint.routes';

const router = Router();

// Mount regulatory intelligence routes
router.use('/regint', regintRouter);

export const occamRouter = router;
