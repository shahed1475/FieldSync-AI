import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import { CreateAnalyticsRequest, UpdateAnalyticsRequest, AuthRequest, AnalyticsQuery, PaginationQuery } from '../types';
import { PostStatus } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { broadcastToAccount } from '../utils/sse';

/**
 * Get analytics for all posts of the authenticated user
 */
export const getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { 
    page = 1, 
    limit = 10, 
    platform, 
    channelId,
    startDate,
    endDate,
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = req.query as AnalyticsQuery & PaginationQuery;
  const pageNum = typeof page === 'string' ? parseInt(page, 10) || 1 : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) || 10 : limit;
  const skip = (pageNum - 1) * limitNum;
  
  // Build where clause
  const where: any = {
    post: {
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  };

  if (platform) {
    where.post.channel = {
      platform: platform.toUpperCase()
    };
  }

  if (channelId) {
    where.post.channelId = channelId;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // Build orderBy clause
  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;

  const [analytics, total] = await Promise.all([
    prisma.analytics.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        post: {
          select: {
            id: true,
            status: true,
            scheduledTime: true,
            publishedAt: true,
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
                    id: true,
                    originalText: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.analytics.count({ where })
  ]);

  const pagination = {
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.ceil(total / limitNum)
  };

  return sendSuccess(res, { analytics, pagination }, 'Analytics retrieved successfully');
});

/**
 * Get analytics by post ID
 */
export const getAnalyticsByPostId = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;
  const userId = req.user?.id;

  // Verify post belongs to user
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (!post) {
    return sendNotFound(res, 'Post not found');
  }

  const analytics = await prisma.analytics.findMany({
    where: { postId },
    include: {
      post: {
        select: {
          id: true,
          status: true,
          publishedAt: true,
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
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, analytics, 'Post analytics retrieved successfully');
});

/**
 * Create or update analytics for a post
 */
export const createOrUpdateAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { postId, impressions, engagement, conversions, clicks, shares, comments, likes }: CreateAnalyticsRequest = req.body;

  // Verify post belongs to user and is published
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      status: PostStatus.PUBLISHED,
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (!post) {
    return sendNotFound(res, 'Published post not found');
  }

  // Check if analytics already exists for this post
  const existingAnalytics = await prisma.analytics.findFirst({
    where: { postId }
  });

  let analytics;

  if (existingAnalytics) {
    // Update existing analytics
    analytics = await prisma.analytics.update({
      where: { id: existingAnalytics.id },
      data: {
        impressions,
        engagement,
        conversions,
        clicks,
        shares,
        comments,
        likes
      },
      include: {
        post: {
          select: {
            id: true,
            channel: {
              select: {
                platform: true,
                name: true
              }
            }
          }
        }
      }
    });
    // Broadcast update
    const accountId = userId as string;
    broadcastToAccount(accountId, 'analytics-update', { postId, analyticsId: existingAnalytics.id });
  } else {
    // Create new analytics
    analytics = await prisma.analytics.create({
      data: {
        postId,
        impressions,
        engagement,
        conversions,
        clicks,
        shares,
        comments,
        likes
      },
      include: {
        post: {
          select: {
            id: true,
            channel: {
              select: {
                platform: true,
                name: true
              }
            }
          }
        }
      }
    });
  }

  // Broadcast create/update with payload
  broadcastToAccount(userId as string, 'analytics-update', {
    postId,
    analytics: {
      id: analytics.id,
      impressions: analytics.impressions,
      engagement: analytics.engagement,
      clicks: analytics.clicks,
      conversions: analytics.conversions,
      shares: analytics.shares,
      comments: analytics.comments,
      likes: analytics.likes,
      updatedAt: analytics.updatedAt
    }
  });

  return sendSuccess(res, analytics, 'Analytics saved successfully', existingAnalytics ? 200 : 201);
});

/**
 * Get analytics summary for dashboard
 */
export const getAnalyticsSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { 
    startDate, 
    endDate, 
    platform 
  } = req.query as {
    startDate?: string;
    endDate?: string;
    platform?: string;
  };

  // Build date filter
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  // Build platform filter
  const platformFilter: any = {
    post: {
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  };

  if (platform) {
    platformFilter.post.channel = {
      platform: platform.toUpperCase()
    };
  }

  if (Object.keys(dateFilter).length > 0) {
    platformFilter.createdAt = dateFilter;
  }

  // Get aggregated analytics
  const [
    totalAnalytics,
    topPerformingPosts,
    recentAnalytics
  ] = await Promise.all([
    // Total metrics
    prisma.analytics.aggregate({
      where: platformFilter,
      _sum: {
        impressions: true,
        engagement: true,
        conversions: true,
        clicks: true,
        shares: true,
        comments: true,
        likes: true
      },
      _count: true
    }),

    // Top performing posts
    prisma.analytics.findMany({
      where: platformFilter,
      orderBy: { engagement: 'desc' },
      take: 5,
      include: {
        post: {
          select: {
            id: true,
            publishedAt: true,
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
        }
      }
    }),

    // Recent analytics (last 7 days)
    prisma.analytics.findMany({
      where: {
        ...platformFilter,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        post: {
          select: {
            channel: {
              select: {
                platform: true
              }
            }
          }
        }
      }
    })
  ]);

  // Calculate platform-specific metrics
  const platformMetrics = await prisma.$queryRaw`
    SELECT 
      c.platform,
      COUNT(a.id) as total_posts,
      SUM(a.impressions) as total_impressions,
      SUM(a.engagement) as total_engagement,
      SUM(a.conversions) as total_conversions,
      SUM(a.clicks) as total_clicks,
      SUM(a.shares) as total_shares,
      SUM(a.comments) as total_comments,
      SUM(a.likes) as total_likes
    FROM analytics a
    JOIN posts p ON a.post_id = p.id
    JOIN channels c ON p.channel_id = c.id
    JOIN variations v ON p.variation_id = v.id
    JOIN content_items ci ON v.content_id = ci.id
    WHERE ci.account_id = ${userId}
    ${platform ? `AND c.platform = '${platform.toUpperCase()}'` : ''}
    ${startDate ? `AND a.created_at >= '${startDate}'` : ''}
    ${endDate ? `AND a.created_at <= '${endDate}'` : ''}
    GROUP BY c.platform
  `;

  const summary = {
    overview: {
      totalPosts: totalAnalytics._count,
      totalImpressions: totalAnalytics._sum.impressions || 0,
      totalEngagement: totalAnalytics._sum.engagement || 0,
      totalConversions: totalAnalytics._sum.conversions || 0,
      totalClicks: totalAnalytics._sum.clicks || 0,
      totalShares: totalAnalytics._sum.shares || 0,
      totalComments: totalAnalytics._sum.comments || 0,
      totalLikes: totalAnalytics._sum.likes || 0
    },
    platformMetrics,
    topPerformingPosts,
    recentActivity: recentAnalytics
  };

  return sendSuccess(res, summary, 'Analytics summary retrieved successfully');
});

/**
 * Get analytics trends over time
 */
export const getAnalyticsTrends = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { 
    startDate, 
    endDate, 
    platform,
    interval = 'day' // day, week, month
  } = req.query as {
    startDate?: string;
    endDate?: string;
    platform?: string;
    interval?: string;
  };

  // Default to last 30 days if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Build platform filter
  let platformCondition = '';
  if (platform) {
    platformCondition = `AND c.platform = '${platform.toUpperCase()}'`;
  }

  // Determine date truncation based on interval
  let dateTrunc = 'DATE(a.created_at)';
  if (interval === 'week') {
    dateTrunc = 'DATE_TRUNC(\'week\', a.created_at)';
  } else if (interval === 'month') {
    dateTrunc = 'DATE_TRUNC(\'month\', a.created_at)';
  }

  const trends = await prisma.$queryRaw`
    SELECT 
      ${dateTrunc} as date,
      COUNT(a.id) as posts_count,
      SUM(a.impressions) as total_impressions,
      SUM(a.engagement) as total_engagement,
      SUM(a.conversions) as total_conversions,
      SUM(a.clicks) as total_clicks,
      SUM(a.shares) as total_shares,
      SUM(a.comments) as total_comments,
      SUM(a.likes) as total_likes
    FROM analytics a
    JOIN posts p ON a.post_id = p.id
    JOIN channels c ON p.channel_id = c.id
    JOIN variations v ON p.variation_id = v.id
    JOIN content_items ci ON v.content_id = ci.id
    WHERE ci.account_id = ${userId}
    AND a.created_at >= ${start}
    AND a.created_at <= ${end}
    ${platformCondition}
    GROUP BY ${dateTrunc}
    ORDER BY date ASC
  `;

  return sendSuccess(res, { trends, interval, startDate: start, endDate: end }, 'Analytics trends retrieved successfully');
});

/**
 * Delete analytics
 */
export const deleteAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Verify analytics belongs to user
  const analytics = await prisma.analytics.findFirst({
    where: {
      id,
      post: {
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }
  });

  if (!analytics) {
    return sendNotFound(res, 'Analytics not found');
  }

  await prisma.analytics.delete({
    where: { id }
  });

  return sendSuccess(res, null, 'Analytics deleted successfully');
});

/**
 * Bulk update analytics
 */
export const bulkUpdateAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { analytics }: { analytics: (CreateAnalyticsRequest & { id?: string })[] } = req.body;

  if (!analytics || analytics.length === 0) {
    return sendError(res, 'No analytics data provided', 400);
  }

  // Verify all posts belong to user
  const postIds = analytics.map(a => a.postId);
  const posts = await prisma.post.findMany({
    where: {
      id: { in: postIds },
      status: 'PUBLISHED',
      variation: {
        content: {
          accountId: userId
        }
      }
    }
  });

  if (posts.length !== postIds.length) {
    return sendError(res, 'Some posts not found or not published', 400);
  }

  // Process each analytics entry using unique id for updates
  const results = await Promise.all(
    analytics.map(async (analyticsData) => {
      const { postId, impressions, engagement, conversions, clicks, shares, comments, likes } = analyticsData;

      const existing = await prisma.analytics.findFirst({ where: { postId } });
      if (existing) {
        return prisma.analytics.update({
          where: { id: existing.id },
          data: {
            impressions,
            engagement,
            conversions,
            clicks,
            shares,
            comments,
            likes
          }
        });
      }

      return prisma.analytics.create({
        data: {
          postId,
          impressions,
          engagement,
          conversions,
          clicks,
          shares,
          comments,
          likes
        }
      });
    })
  );

  return sendSuccess(res, { 
    updated: results.length,
    analytics: results
  }, 'Bulk analytics update completed');
});