import { Response } from 'express';
import { publishPostById } from '../services/publishService';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

export const publish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId } = req.body as { postId: string };
  if (!postId) return sendError(res, 'postId is required', 400);
  try {
    const result = await publishPostById(postId);
    return sendSuccess(res, result, 'Post published');
  } catch (e) {
    return sendError(res, e instanceof Error ? e.message : 'Publish failed', 500);
  }
});