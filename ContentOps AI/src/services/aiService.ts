import { Platform } from '@prisma/client';
import { prisma } from '../utils/database';
import { MockLLMProvider, LLMProvider, AdaptContentParams, HashtagParams } from './llmProvider';

let provider: LLMProvider = new MockLLMProvider();

export function setLLMProvider(p: LLMProvider) {
  provider = p;
}

export async function adaptContentForPlatform(contentId: string, platform: Platform, options?: AdaptContentParams['options']): Promise<{ adaptedText: string }>{
  const content = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!content) throw new Error('Content not found');

  const adaptedText = await provider.adaptContent({
    originalText: content.originalText,
    platform,
    context: { brandVoice: undefined, audience: undefined, campaign: undefined, url: content.mediaUrl || undefined },
    options
  });

  return { adaptedText };
}

export async function recommendHashtagsForPlatform(text: string, platform: Platform, maxCount = 8): Promise<string[]>{
  return provider.recommendHashtags({ text, platform, maxCount } as HashtagParams);
}

export async function createVariationWithAI(contentId: string, platform: Platform): Promise<{ variationId: string; adaptedText: string; hashtags: string[] }>{
  const { adaptedText } = await adaptContentForPlatform(contentId, platform);
  const hashtags = await recommendHashtagsForPlatform(adaptedText, platform, 8);

  const variation = await prisma.variation.create({
    data: { contentId, platform, adaptedText }
  });

  return { variationId: variation.id, adaptedText, hashtags };
}