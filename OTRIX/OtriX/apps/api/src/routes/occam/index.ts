/**
 * OCCAM API Routes Index
 * Phase 1: Ontology & Schema Engineering
 */

import { Router } from 'express';
import ontologyRoutes from './ontology.routes';

const router = Router();

// Mount ontology routes
router.use('/ontology', ontologyRoutes);

export default router;
