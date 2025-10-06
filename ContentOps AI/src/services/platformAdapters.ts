import { Platform } from '@prisma/client';

type PublishParams = {
  text: string;
  mediaUrl?: string | null;
  credentials: Record<string, any>;
};

export type PublishResult = {
  platformPostId: string;
  url?: string;
};

export interface PlatformAdapter {
  publish(params: PublishParams): Promise<PublishResult>;
}

class StubAdapter implements PlatformAdapter {
  private platform: Platform;
  constructor(platform: Platform) { this.platform = platform; }
  async publish(params: PublishParams): Promise<PublishResult> {
    const id = `${this.platform}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const url = `https://${String(this.platform).toLowerCase()}.com/post/${id}`;
    return { platformPostId: id, url };
  }
}

export const getAdapter = (platform: Platform): PlatformAdapter => {
  // In future, return real adapters per platform.
  return new StubAdapter(platform);
};