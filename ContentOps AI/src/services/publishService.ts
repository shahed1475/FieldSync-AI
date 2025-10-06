import { prisma } from '../utils/database';
import { decryptCredentials } from '../utils/encryption';
import { getAdapter } from './platformAdapters';
import { PostStatus } from '@prisma/client';
import { broadcastToAccount } from '../utils/sse';

export const publishPostById = async (postId: string) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      channel: true,
      variation: { include: { content: true } }
    }
  });
  if (!post) throw new Error('Post not found');

  if (post.status === PostStatus.PUBLISHED) {
    return post;
  }

  const credentials = decryptCredentials(post.channel.credentials);
  const adapter = getAdapter(post.channel.platform);
  const text = post.variation.adaptedText;
  const mediaUrl = post.variation.content.mediaUrl || null;

  try {
    const result = await adapter.publish({ text, mediaUrl, credentials });
    const updated = await prisma.post.update({
      where: { id: postId },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        platformPostId: result.platformPostId
      }
    });
    broadcastToAccount(post.channel.accountId, 'post-status', { id: postId, status: 'PUBLISHED', publishedAt: updated.publishedAt });
    return updated;
  } catch (err) {
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: PostStatus.FAILED
      }
    });
    broadcastToAccount(post.channel.accountId, 'post-status', { id: postId, status: 'FAILED' });
    throw err;
  }
};

export const publishDueScheduledPosts = async () => {
  const now = new Date();
  const duePosts = await prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      scheduledTime: { lte: now }
    },
    select: { id: true }
  });
  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const p of duePosts) {
    try {
      await publishPostById(p.id);
      results.push({ id: p.id, success: true });
    } catch (e) {
      results.push({ id: p.id, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
};