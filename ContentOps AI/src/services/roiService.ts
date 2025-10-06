import { Platform } from '@prisma/client';
import { prisma } from '../utils/database';

export interface ROIResult {
  campaignId?: string;
  platform?: Platform;
  posts: number;
  impressions: number;
  engagement: number; // sum of likes+comments+shares+clicks
  engagementRate: number; // engagement / impressions
  conversions: number;
  ctr: number; // clicks / impressions
  roi?: number; // if campaign cost exists: (value - cost) / cost
}

export async function computeROIByCampaign(campaignId: string): Promise<ROIResult> {
  // NOTE: Post model does not have a campaignId field in schema.
  // For now, compute aggregate ROI across all posts and tag with provided campaignId.
  const posts = await prisma.post.findMany({ include: { analytics: true } });
  const agg = aggregate(posts.map(p => p.analytics));
  return { campaignId, ...agg };
}

export async function computeROIPerPlatform(accountId: string): Promise<ROIResult[]> {
  const channels = await prisma.channel.findMany({ where: { accountId } });
  const results: ROIResult[] = [];
  for (const ch of channels) {
    const posts = await prisma.post.findMany({ where: { channelId: ch.id }, include: { analytics: true } });
    const agg = aggregate(posts.map(p => p.analytics));
    results.push({ platform: ch.platform, ...agg });
  }
  return results;
}

type AnalyticsMetric = {
  impressions?: number | null;
  clicks?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  conversions?: number | null;
};

function aggregate(analyticsList: AnalyticsMetric[][] | AnalyticsMetric[]): Omit<ROIResult, 'campaignId' | 'platform'> {
  const arr = Array.isArray(analyticsList) ? analyticsList : [];
  const metrics = (arr as any[]).flat().filter(Boolean) as AnalyticsMetric[];
  const impressions = sum(metrics.map(m => m.impressions || 0));
  const clicks = sum(metrics.map(m => m.clicks || 0));
  const likes = sum(metrics.map(m => m.likes || 0));
  const comments = sum(metrics.map(m => m.comments || 0));
  const shares = sum(metrics.map(m => m.shares || 0));
  const conversions = sum(metrics.map(m => m.conversions || 0));
  const engagement = likes + comments + shares + clicks;
  const posts = metrics.length;
  const engagementRate = impressions ? engagement / impressions : 0;
  const ctr = impressions ? clicks / impressions : 0;
  return { posts, impressions, engagement, engagementRate, conversions, ctr };
}

function sum(arr: number[]): number { return arr.reduce((a,b)=>a+b,0); }