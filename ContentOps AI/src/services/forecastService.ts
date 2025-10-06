import { Platform } from '@prisma/client';
import { prisma } from '../utils/database';
import { LLMProvider, MockLLMProvider, ForecastParams, ForecastResult } from './llmProvider';

let provider: LLMProvider = new MockLLMProvider();
export function setForecastProvider(p: LLMProvider) { provider = p; }

export async function forecastForPost(postId: string): Promise<ForecastResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      variation: { include: { content: true } },
      channel: true
    }
  });
  if (!post) throw new Error('Post not found');
  const platform = post.channel.platform as Platform;

  const history = await prisma.analytics.findMany({
    where: { post: { channelId: post.channelId } },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const params: ForecastParams = {
    platform,
    historical: history.map(h => ({
      timestamp: h.createdAt.toISOString(),
      impressions: h.impressions || 0,
      engagement: h.engagement || 0,
      clicks: h.clicks || 0,
      likes: h.likes || 0,
      comments: h.comments || 0,
      shares: h.shares || 0
    })),
    contentSignals: {
      length: post.variation?.adaptedText?.length || post.variation?.content?.originalText?.length || 0,
      hasMedia: !!post.variation?.content?.mediaUrl
    }
  };

  return provider.forecastEngagement(params);
}

export async function recommendBestTimes(platform: Platform): Promise<string[]> {
  // Use provider simple best times and blend with historical engagement peaks
  const recent = await prisma.analytics.findMany({
    where: { post: { channel: { platform } } },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  // naive aggregation: pick next day times 9, 13, 20 if evening engagement higher
  const avgEng = average(recent.map(r => r.engagement || 0));
  const now = new Date();
  const candidates = [9, 13, avgEng > 100 ? 20 : 18];
  return candidates.map(h => {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  });
}

function average(arr: number[]): number { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }