import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Get comprehensive dashboard statistics
 */
export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { 
    startDate, 
    endDate 
  } = req.query as {
    startDate?: string;
    endDate?: string;
  };

  // Default to last 30 days if no dates provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get basic counts
  const [
    totalChannels,
    activeChannels,
    totalContentItems,
    totalPosts,
    scheduledPosts,
    publishedPosts,
    totalAnalytics
  ] = await Promise.all([
    // Total channels
    prisma.channel.count({
      where: { accountId: userId }
    }),

    // Active channels
    prisma.channel.count({
      where: { 
        accountId: userId,
        isActive: true 
      }
    }),

    // Total content items
    prisma.contentItem.count({
      where: { accountId: userId }
    }),

    // Total posts
    prisma.post.count({
      where: {
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Scheduled posts
    prisma.post.count({
      where: {
        status: 'SCHEDULED',
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Published posts in date range
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: start,
          lte: end
        },
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Analytics summary
    prisma.analytics.aggregate({
      where: {
        createdAt: {
          gte: start,
          lte: end
        },
        post: {
          variation: {
            content: {
              accountId: userId
            }
          }
        }
      },
      _sum: {
        impressions: true,
        engagement: true,
        conversions: true
      }
    })
  ]);

  // Get platform breakdown
  const platformStats = await prisma.$queryRaw`
    SELECT 
      c.platform,
      COUNT(DISTINCT c.id) as channels_count,
      COUNT(DISTINCT p.id) as posts_count,
      COUNT(DISTINCT CASE WHEN p.status = 'SCHEDULED' THEN p.id END) as scheduled_posts,
      COUNT(DISTINCT CASE WHEN p.status = 'PUBLISHED' THEN p.id END) as published_posts,
      COALESCE(SUM(a.impressions), 0) as total_impressions,
      COALESCE(SUM(a.engagement), 0) as total_engagement,
      COALESCE(SUM(a.conversions), 0) as total_conversions
    FROM channels c
    LEFT JOIN posts p ON c.id = p.channel_id
    LEFT JOIN variations v ON p.variation_id = v.id
    LEFT JOIN content_items ci ON v.content_id = ci.id
    LEFT JOIN analytics a ON p.id = a.post_id 
      AND a.created_at >= ${start} 
      AND a.created_at <= ${end}
    WHERE c.account_id = ${userId}
    GROUP BY c.platform
    ORDER BY posts_count DESC
  `;

  // Get recent activity (last 7 days)
  const recentActivity = await prisma.post.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      variation: {
        content: {
          accountId: userId
        }
      }
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      scheduledTime: true,
      publishedAt: true,
      createdAt: true,
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

  // Get upcoming scheduled posts (next 7 days)
  const upcomingPosts = await prisma.post.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledTime: {
        gte: new Date(),
        lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      variation: {
        content: {
          accountId: userId
        }
      }
    },
    take: 10,
    orderBy: { scheduledTime: 'asc' },
    select: {
      id: true,
      scheduledTime: true,
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

  // Get top performing content (by engagement)
  const topContent = await prisma.analytics.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end
      },
      post: {
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    },
    orderBy: { engagement: 'desc' },
    take: 5,
    select: {
      impressions: true,
      engagement: true,
      conversions: true,
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
              adaptedText: true,
              content: {
                select: {
                  originalText: true
                }
              }
            }
          }
        }
      }
    }
  });

  // Calculate growth metrics (compare with previous period)
  const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const previousEnd = start;

  const previousPeriodStats = await prisma.analytics.aggregate({
    where: {
      createdAt: {
        gte: previousStart,
        lte: previousEnd
      },
      post: {
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    },
    _sum: {
      impressions: true,
      engagement: true,
      conversions: true
    }
  });

  // Calculate growth percentages
  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const currentImpressions = totalAnalytics._sum.impressions || 0;
  const currentEngagement = totalAnalytics._sum.engagement || 0;
  const currentConversions = totalAnalytics._sum.conversions || 0;

  const previousImpressions = previousPeriodStats._sum.impressions || 0;
  const previousEngagement = previousPeriodStats._sum.engagement || 0;
  const previousConversions = previousPeriodStats._sum.conversions || 0;

  const dashboardData = {
    overview: {
      totalChannels,
      activeChannels,
      totalContentItems,
      totalPosts,
      scheduledPosts,
      publishedPosts: publishedPosts,
      totalImpressions: currentImpressions,
      totalEngagement: currentEngagement,
      totalConversions: currentConversions
    },
    growth: {
      impressionsGrowth: calculateGrowth(currentImpressions, previousImpressions),
      engagementGrowth: calculateGrowth(currentEngagement, previousEngagement),
      conversionsGrowth: calculateGrowth(currentConversions, previousConversions)
    },
    platformStats,
    recentActivity,
    upcomingPosts,
    topContent,
    dateRange: {
      start,
      end
    }
  };

  return sendSuccess(res, dashboardData, 'Dashboard statistics retrieved successfully');
});

/**
 * Get engagement summary for dashboard
 */
export const getEngagementSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { days = 30 } = req.query as { days?: number };

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get daily engagement data
  const dailyEngagement = await prisma.$queryRaw`
    SELECT 
      DATE(a.created_at) as date,
      SUM(a.impressions) as impressions,
      SUM(a.engagement) as engagement,
      SUM(a.conversions) as conversions,
      COUNT(a.id) as posts_count
    FROM analytics a
    JOIN posts p ON a.post_id = p.id
    JOIN variations v ON p.variation_id = v.id
    JOIN content_items ci ON v.content_id = ci.id
    WHERE ci.account_id = ${userId}
    AND a.created_at >= ${startDate}
    GROUP BY DATE(a.created_at)
    ORDER BY date ASC
  `;

  // Get platform engagement comparison
  const platformEngagement = await prisma.$queryRaw`
    SELECT 
      c.platform,
      SUM(a.impressions) as impressions,
      SUM(a.engagement) as engagement,
      SUM(a.conversions) as conversions,
      COUNT(a.id) as posts_count
    FROM analytics a
    JOIN posts p ON a.post_id = p.id
    JOIN channels c ON p.channel_id = c.id
    JOIN variations v ON p.variation_id = v.id
    JOIN content_items ci ON v.content_id = ci.id
    WHERE ci.account_id = ${userId}
    AND a.created_at >= ${startDate}
    GROUP BY c.platform
    ORDER BY engagement DESC
  `;

  return sendSuccess(res, {
    dailyEngagement,
    platformEngagement,
    period: `${days} days`
  }, 'Engagement summary retrieved successfully');
});

/**
 * Get content performance insights
 */
export const getContentInsights = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  // Get content with best and worst performance
  const [bestPerforming, worstPerforming] = await Promise.all([
    // Best performing content
    prisma.analytics.findMany({
      where: {
        post: {
          variation: {
            content: {
              accountId: userId
            }
          }
        }
      },
      orderBy: { engagement: 'desc' },
      take: 5,
      include: {
        post: {
          select: {
            channel: {
              select: {
                platform: true
              }
            },
            variation: {
              select: {
                adaptedText: true,
                content: {
                  select: {
                    originalText: true
                  }
                }
              }
            }
          }
        }
      }
    }),

    // Worst performing content
    prisma.analytics.findMany({
      where: {
        post: {
          variation: {
            content: {
              accountId: userId
            }
          }
        },
        engagement: {
          gt: 0 // Only include content that has some engagement data
        }
      },
      orderBy: { engagement: 'asc' },
      take: 5,
      include: {
        post: {
          select: {
            channel: {
              select: {
                platform: true
              }
            },
            variation: {
              select: {
                adaptedText: true,
                content: {
                  select: {
                    originalText: true
                  }
                }
              }
            }
          }
        }
      }
    })
  ]);

  // Analyze posting patterns
  const postingPatterns = await prisma.$queryRaw`
    SELECT 
      EXTRACT(hour FROM p.published_at) as hour_of_day,
      EXTRACT(dow FROM p.published_at) as day_of_week,
      COUNT(p.id) as posts_count
    FROM posts p
    LEFT JOIN analytics a ON p.id = a.post_id
    JOIN variations v ON p.variation_id = v.id
    JOIN content_items ci ON v.content_id = ci.id
    WHERE ci.account_id = ${userId}
    AND p.status = 'PUBLISHED'
    AND p.published_at IS NOT NULL
    GROUP BY EXTRACT(hour FROM p.published_at), EXTRACT(dow FROM p.published_at)
    HAVING COUNT(p.id) > 0
    ORDER BY posts_count DESC
  `;

  return sendSuccess(res, {
    bestPerforming,
    worstPerforming,
    postingPatterns
  }, 'Content insights retrieved successfully');
});

// Temporary alias to maintain route compatibility; both handlers provide content performance insights.
export const getContentPerformance = getContentInsights;

/**
 * Get quick stats for dashboard widgets
 */
export const getQuickStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  const [
    todayPosts,
    weekPosts,
    monthPosts,
    pendingScheduled
  ] = await Promise.all([
    // Posts published today
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        },
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Posts published this week
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        },
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Posts published this month
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        },
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    }),

    // Pending scheduled posts
    prisma.post.count({
      where: {
        status: 'SCHEDULED',
        scheduledTime: {
          gte: new Date()
        },
        variation: {
          content: {
            accountId: userId
          }
        }
      }
    })
  ]);

  return sendSuccess(res, {
    todayPosts,
    weekPosts,
    monthPosts,
    pendingScheduled
  }, 'Quick stats retrieved successfully');
});