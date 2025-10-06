import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError } from '../utils/response';
import { Platform } from '@prisma/client';
import { adaptContentForPlatform, createVariationWithAI, recommendHashtagsForPlatform } from '../services/aiService';
import { forecastForPost } from '../services/forecastService';
import { computeROIByCampaign, computeROIPerPlatform } from '../services/roiService';
import { prisma } from '../utils/database';

export const adaptContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentId, platform } = req.body as { contentId: string; platform: Platform };
  const result = await adaptContentForPlatform(contentId, platform);
  sendSuccess(res, result, 'Content adapted');
});

export const createAIVariation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contentId, platform } = req.body as { contentId: string; platform: Platform };
  const result = await createVariationWithAI(contentId, platform);
  sendSuccess(res, result, 'Variation created with AI');
});

export const recommendHashtags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { text, platform, maxCount } = req.body as { text: string; platform: Platform; maxCount?: number };
  const tags = await recommendHashtagsForPlatform(text, platform, maxCount || 8);
  sendSuccess(res, { hashtags: tags }, 'Hashtags recommended');
});

export const forecastEngagement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId } = req.body as { postId: string };
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { variation: { include: { content: true } } }
  });
  if (!post || post.variation.content.accountId !== req.user?.id) {
    return sendError(res, 'Post not found', 404);
  }

  const forecast = await forecastForPost(postId);

  const existing = await prisma.analytics.findFirst({ where: { postId } });
  const analytics = existing
    ? await prisma.analytics.update({
        where: { id: existing.id },
        data: {
          impressions: Math.round(forecast.predictedImpressions || 0),
          engagement: Math.round(forecast.predictedEngagement || 0),
          clicks: Math.round(forecast.predictedClicks || 0)
        }
      })
    : await prisma.analytics.create({
        data: {
          postId,
          impressions: Math.round(forecast.predictedImpressions || 0),
          engagement: Math.round(forecast.predictedEngagement || 0),
          clicks: Math.round(forecast.predictedClicks || 0)
        }
      });

  return sendSuccess(res, { forecast, analytics }, 'Forecast generated and persisted');
});

export const roiByCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { campaignId } = req.params as { campaignId: string };
  const result = await computeROIByCampaign(campaignId);
  sendSuccess(res, result, 'ROI computed for campaign');
});

export const roiPerPlatform = asyncHandler(async (req: AuthRequest, res: Response) => {
  const accountId = req.user?.id as string;
  const results = await computeROIPerPlatform(accountId);
  sendSuccess(res, results, 'ROI per platform');
});