import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { sendSuccess, sendError, sendNotFound, sendBadRequest } from '../utils/response';
import { CreatePostRequest, UpdatePostRequest, AuthRequest, PostsQuery } from '../types';
import { PostStatus, Platform } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Get all posts for the authenticated user
 */
export const getPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { 
    page = 1, 
    limit = 10, 
    status, 
    platform, 
    channelId,
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = req.query as PostsQuery & { sortBy?: string; sortOrder?: 'asc' | 'desc' };
  const pageNum = typeof page === 'string' ? parseInt(page, 10) || 1 : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) || 10 : limit;
  const skip = (pageNum - 1) * limitNum;
  
  // Build where clause
  const where: any = {
    variation: {
      content: {
        accountId: userId
      }
    }
  };

  if (status) {
    const statusEnum = (PostStatus as any)[String(status).toUpperCase()];
    if (statusEnum) {
      where.status = statusEnum as PostStatus;
    }
  }
  if (channelId) where.channelId = channelId;
  if (platform) {
    const platformEnum = (Platform as any)[String(platform).toUpperCase()];
    if (platformEnum) {
      where.channel = { platform: platformEnum as Platform };
    }
  }

  // Build orderBy clause
  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        channel: {
          select: {
            id: true,
            platform: true,
            name: true,
            isActive: true
          }
        },
        variation: {
          select: {
            id: true,
            platform: true,
            adaptedText: true,
            content: {
              select: {
                id: true,
                originalText: true,
                mediaUrl: true
              }
            }
          }
        },
        analytics: {
          select: {
            impressions: true,
            engagement: true,
            conversions: true
          }
        }
      }
    }),
    prisma.post.count({ where })
  ]);

  const pagination = {
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.ceil(total / limitNum)
  };

  return sendSuccess(res, { posts, pagination }, 'Posts retrieved successfully');
});

/**
 * Get post by ID
 */
export const getPostById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const post = await prisma.post.findFirst({
    where: { 
      id,
      variation: {
        content: {
          accountId: userId
        }
      }
    },
    include: {
      channel: {
        select: {
          id: true,
          platform: true,
          name: true,
          isActive: true
        }
      },
      variation: {
        include: {
          content: {
            select: {
              id: true,
              originalText: true,
              mediaUrl: true
            }
          }
        }
      },
      analytics: true
    }
  });

  if (!post) {
    return sendNotFound(res, 'Post not found');
  }

  return sendSuccess(res, post, 'Post retrieved successfully');
});

/**
 * Create new post
 */
export const createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { variationId, channelId, scheduledTime }: CreatePostRequest = req.body;

  // Verify variation belongs to user
  const variation = await prisma.variation.findFirst({
    where: {
      id: variationId,
      content: {
        accountId: userId
      }
    },
    include: {
      content: true
    }
  });

  if (!variation) {
    return sendNotFound(res, 'Variation not found');
  }

  // Verify channel belongs to user and is active
  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      accountId: userId,
      isActive: true
    }
  });

  if (!channel) {
    return sendNotFound(res, 'Channel not found or inactive');
  }

  // Verify platform compatibility
  if (variation.platform !== channel.platform) {
    return sendBadRequest(res, 'Variation platform must match channel platform');
  }

  // Determine status based on scheduled time if provided
  const now = new Date();
  const data: any = {
    variationId,
    channelId
  };
  if (scheduledTime) {
    const scheduledDate = new Date(scheduledTime);
    if (!isNaN(scheduledDate.getTime())) {
      const status = scheduledDate <= now ? PostStatus.PUBLISHED : PostStatus.SCHEDULED;
      data.scheduledTime = scheduledDate;
      data.status = status;
      data.publishedAt = status === PostStatus.PUBLISHED ? now : null;
    }
  }

  const post = await prisma.post.create({
    data,
    include: {
      channel: {
        select: {
          id: true,
          platform: true,
          name: true
        }
      },
      variation: {
        select: {
          id: true,
          platform: true,
          adaptedText: true,
          content: {
            select: {
              originalText: true,
              mediaUrl: true
            }
          }
        }
      }
    }
  });

  return sendSuccess(res, post, 'Post created successfully', 201);
});

/**
 * Update post
 */
export const updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { scheduledTime, status }: UpdatePostRequest = req.body;

  // Check if post exists and belongs to user
  const existingPost = await prisma.post.findFirst({
    where: { 
      id,
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (!existingPost) {
    return sendNotFound(res, 'Post not found');
  }

  // Prevent updating published posts
  if (existingPost.status === 'PUBLISHED' && status !== 'PUBLISHED') {
    return sendBadRequest(res, 'Cannot modify published posts');
  }

  // Prepare update data
  const updateData: any = {};
  
  if (scheduledTime) {
    const scheduledDate = new Date(scheduledTime);
    updateData.scheduledTime = scheduledDate;
    
    // Update status based on new scheduled time if not explicitly provided
    if (!status) {
      const now = new Date();
      updateData.status = scheduledDate <= now ? PostStatus.PUBLISHED : PostStatus.SCHEDULED;
      if (updateData.status === PostStatus.PUBLISHED && existingPost.status !== PostStatus.PUBLISHED) {
        updateData.publishedAt = now;
      }
    }
  }

  if (status) {
    updateData.status = status as PostStatus;
    if (status === PostStatus.PUBLISHED && existingPost.status !== PostStatus.PUBLISHED) {
      updateData.publishedAt = new Date();
    } else if (status !== PostStatus.PUBLISHED) {
      updateData.publishedAt = null; // Clear publishedAt when moving away from PUBLISHED
    }
  }

  const updatedPost = await prisma.post.update({
    where: { id },
    data: updateData,
    include: {
      channel: {
        select: {
          id: true,
          platform: true,
          name: true
        }
      },
      variation: {
        select: {
          id: true,
          platform: true,
          adaptedText: true
        }
      }
    }
  });

  return sendSuccess(res, updatedPost, 'Post updated successfully');
});

/**
 * Delete post
 */
export const deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Check if post exists and belongs to user
  const existingPost = await prisma.post.findFirst({
    where: { 
      id,
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (!existingPost) {
    return sendNotFound(res, 'Post not found');
  }

  // Prevent deleting published posts with analytics
  const hasAnalytics = await prisma.analytics.findFirst({
    where: { postId: id }
  });

  if (existingPost.status === 'PUBLISHED' && hasAnalytics) {
    return sendBadRequest(res, 'Cannot delete published posts with analytics data');
  }

  // Delete post (cascade will handle analytics)
  await prisma.post.delete({
    where: { id }
  });

  return sendSuccess(res, null, 'Post deleted successfully');
});

/**
 * Bulk create posts
 */
export const bulkCreatePosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { posts }: { posts: CreatePostRequest[] } = req.body;

  if (!posts || posts.length === 0) {
    return sendBadRequest(res, 'No posts provided');
  }

  // Validate all posts belong to user and channels are active
  const variationIds = posts.map(p => p.variationId);
  const channelIds = posts.map(p => p.channelId);

  const [variations, channels] = await Promise.all([
    prisma.variation.findMany({
      where: {
        id: { in: variationIds },
        content: { accountId: userId }
      },
      include: { content: true }
    }),
    prisma.channel.findMany({
      where: {
        id: { in: channelIds },
        accountId: userId,
        isActive: true
      }
    })
  ]);

  // Validate all variations and channels exist
  if (variations.length !== variationIds.length) {
    return sendBadRequest(res, 'Some variations not found or do not belong to user');
  }

  if (channels.length !== channelIds.length) {
    return sendBadRequest(res, 'Some channels not found, inactive, or do not belong to user');
  }

  // Create posts
  const now = new Date();
  const postsData = posts.map(post => {
    const variation = variations.find(v => v.id === post.variationId)!;
    const channel = channels.find(c => c.id === post.channelId)!;
    
    // Verify platform compatibility
    if (variation.platform !== channel.platform) {
      throw new Error(`Platform mismatch for variation ${variation.id} and channel ${channel.id}`);
    }

    const data: any = {
      variationId: post.variationId,
      channelId: post.channelId
    };

    if (post.scheduledTime) {
      const scheduledDate = new Date(post.scheduledTime);
      if (!isNaN(scheduledDate.getTime())) {
        const status = scheduledDate <= now ? PostStatus.PUBLISHED : PostStatus.SCHEDULED;
        data.scheduledTime = scheduledDate;
        data.status = status;
        data.publishedAt = status === PostStatus.PUBLISHED ? now : null;
      }
    }

    return data;
  });

  const createdPosts = await prisma.post.createMany({
    data: postsData
  });

  return sendSuccess(res, { 
    created: createdPosts.count,
    message: `${createdPosts.count} posts created successfully`
  }, 'Bulk post creation completed', 201);
});

/**
 * Get posts by status
 */
export const getPostsByStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.params;
  const userId = req.user?.id;
  const { page = 1, limit = 10 } = req.query as PostsQuery;
  const pageNum = typeof page === 'string' ? parseInt(page, 10) || 1 : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) || 10 : limit;
  const skip = (pageNum - 1) * limitNum;

  const statusEnum = (PostStatus as any)[String(status).toUpperCase()];
  if (!statusEnum) {
    return sendBadRequest(res, 'Invalid status');
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        status: statusEnum as PostStatus,
        variation: {
          content: {
            accountId: userId
          }
        }
      },
      skip,
      take: limitNum,
      orderBy: { scheduledTime: 'asc' },
      include: {
        channel: {
          select: {
            id: true,
            platform: true,
            name: true
          }
        },
        variation: {
          select: {
            id: true,
            adaptedText: true,
            content: {
              select: {
                originalText: true,
                mediaUrl: true
              }
            }
          }
        }
      }
    }),
    prisma.post.count({
      where: {
        status: status.toUpperCase() as any,
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    })
  ]);

  const pagination = {
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.ceil(total / limitNum)
  };

  return sendSuccess(res, { posts, pagination }, `${status} posts retrieved successfully`);
});

/**
 * Reschedule post
 */
export const reschedulePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { scheduledTime } = req.body;
  const userId = req.user?.id;

  // Check if post exists and belongs to user
  const existingPost = await prisma.post.findFirst({
    where: { 
      id,
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (!existingPost) {
    return sendNotFound(res, 'Post not found');
  }

  // Only allow rescheduling of scheduled posts
  if (existingPost.status !== 'SCHEDULED') {
    return sendBadRequest(res, 'Only scheduled posts can be rescheduled');
  }

  const newScheduledTime = new Date(scheduledTime);
  const now = new Date();
  const newStatus = newScheduledTime <= now ? PostStatus.PUBLISHED : PostStatus.SCHEDULED;

  const updatedPost = await prisma.post.update({
    where: { id },
    data: {
      scheduledTime: newScheduledTime,
      status: newStatus,
      publishedAt: newStatus === PostStatus.PUBLISHED ? now : null
    },
    include: {
      channel: {
        select: {
          platform: true,
          name: true
        }
      },
      variation: {
        select: {
          adaptedText: true
        }
      }
    }
  });

  return sendSuccess(res, updatedPost, 'Post rescheduled successfully');
});