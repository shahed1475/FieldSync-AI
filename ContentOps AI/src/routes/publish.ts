import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { publish } from '../controllers/publishController';
import { validateRequest } from '../middleware/validation';
import Joi from 'joi';

const router = Router();
router.use(authenticate);

const publishSchema = Joi.object({
  postId: Joi.string().required()
});

router.post('/', validateRequest(publishSchema), publish);

export default router;