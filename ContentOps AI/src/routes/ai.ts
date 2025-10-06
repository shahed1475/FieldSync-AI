import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { aiAdaptSchema, aiHashtagSchema, aiForecastSchema } from '../middleware/validation';
import { adaptContent, createAIVariation, recommendHashtags, forecastEngagement, roiByCampaign, roiPerPlatform } from '../controllers/aiController';

const router = Router();
router.use(authenticate);

// Adapt content for platform
router.post('/adapt', validateRequest(aiAdaptSchema), adaptContent);

// Create variation with AI
router.post('/variation', validateRequest(aiAdaptSchema), createAIVariation);

// Recommend hashtags
router.post('/hashtags', validateRequest(aiHashtagSchema), recommendHashtags);

// Engagement forecast
router.post('/forecast', validateRequest(aiForecastSchema), forecastEngagement);

// ROI computations
router.get('/roi/campaign/:campaignId', roiByCampaign);
router.get('/roi/platforms', roiPerPlatform);

export default router;