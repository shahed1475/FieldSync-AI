import { Platform } from '@prisma/client';

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tone?: 'professional' | 'casual' | 'concise' | 'playful';
}

export interface AdaptContentParams {
  originalText: string;
  platform: Platform;
  context?: {
    brandVoice?: string;
    audience?: string;
    campaign?: string;
    url?: string;
  };
  options?: GenerateOptions;
}

export interface HashtagParams {
  text: string;
  platform: Platform;
  maxCount?: number;
}

export interface ForecastParams {
  platform: Platform;
  historical: Array<{
    timestamp: string; // ISO
    impressions?: number;
    engagement?: number;
    clicks?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  }>;
  contentSignals?: {
    length?: number;
    hasMedia?: boolean;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
}

export interface ForecastResult {
  predictedImpressions: number;
  predictedEngagement: number;
  predictedClicks?: number;
  confidence: number; // 0..1
  bestTimes?: string[]; // ISO timestamps in next week
}

export interface LLMProvider {
  adaptContent(params: AdaptContentParams): Promise<string>;
  recommendHashtags(params: HashtagParams): Promise<string[]>;
  forecastEngagement(params: ForecastParams): Promise<ForecastResult>;
}

export class MockLLMProvider implements LLMProvider {
  async adaptContent(params: AdaptContentParams): Promise<string> {
    const base = params.originalText.trim();
    switch (params.platform) {
      case Platform.TWITTER:
        return `${base.slice(0, 240)}${base.length > 240 ? '…' : ''}`;
      case Platform.LINKEDIN:
        return `${base}\n\n— via ContentOps AI`;
      case Platform.FACEBOOK:
        return base;
      case Platform.INSTAGRAM:
        return base;
      default:
        return base;
    }
  }

  async recommendHashtags({ text, platform, maxCount = 8 }: HashtagParams): Promise<string[]> {
    const keywords = extractKeywords(text).slice(0, maxCount);
    return keywords.map(k => formatHashtag(k, platform));
  }

  async forecastEngagement(params: ForecastParams): Promise<ForecastResult> {
    const history = params.historical || [];
    const avgImpr = average(history.map(h => h.impressions || 0));
    const avgEng = average(history.map(h => h.engagement || 0));
    const lengthBoost = (params.contentSignals?.length || 0) > 120 ? 1.1 : 1.0;
    const mediaBoost = params.contentSignals?.hasMedia ? 1.2 : 1.0;
    const predictedImpressions = Math.round(avgImpr * lengthBoost * mediaBoost);
    const predictedEngagement = Math.round(avgEng * lengthBoost * mediaBoost);
    const confidence = history.length >= 10 ? 0.7 : 0.5;
    const bestTimes = naiveBestTimes(params.platform);
    return { predictedImpressions, predictedEngagement, confidence, bestTimes };
  }
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 12);
}

function formatHashtag(keyword: string, platform: Platform): string {
  const safe = keyword.replace(/\s+/g, '');
  if (platform === Platform.LINKEDIN) return safe; // LinkedIn prefers fewer hashtags
  return `#${safe}`;
}

function average(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function naiveBestTimes(platform: Platform): string[] {
  const now = new Date();
  const offsets = platform === Platform.TWITTER ? [6, 12, 18] : [9, 13, 20];
  return offsets.map(h => {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  });
}