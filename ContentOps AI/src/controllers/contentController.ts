import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { sendSuccess, sendError, sendNotFound, sendBadRequest } from '../utils/response';
import { CreateContentRequest, UpdateContentRequest, AuthRequest, ContentQuery } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Get all content items for the authenticated user
 */
export const getContentItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query as ContentQuery;
  const pageNum = typeof page === 'string' ? parseInt(page, 10) || 1 : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) || 10 : limit;
  const skip = (pageNum - 1) * limitNum;
  
  // Build where clause
  const where: any = { accountId: userId };
  if (search) {
    where.originalText = {
      contains: search,
      mode: 'insensitive'
    };
  }

  // Build orderBy clause
  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;

  const [contentItems, total] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        variations: {
          select: {
            id: true,
            platform: true,
            adaptedText: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            variations: true
          }
        }
      }
    }),
    prisma.contentItem.count({ where })
  ]);

  const pagination = {
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.ceil(total / limitNum)
  };

  return sendSuccess(res, { contentItems, pagination }, 'Content items retrieved successfully');
});

/**
 * Get content item by ID
 */
export const getContentItemById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const contentItem = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    },
    include: {
      variations: {
        include: {
          posts: {
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
              }
            }
          }
        }
      }
    }
  });

  if (!contentItem) {
    return sendNotFound(res, 'Content item not found');
  }

  return sendSuccess(res, contentItem, 'Content item retrieved successfully');
});

/**
 * Create new content item
 */
export const createContentItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { originalText, mediaUrl }: CreateContentRequest = req.body;

  const contentItem = await prisma.contentItem.create({
    data: {
      accountId: userId!,
      originalText,
      mediaUrl
    },
    include: {
      _count: {
        select: {
          variations: true
        }
      }
    }
  });

  return sendSuccess(res, contentItem, 'Content item created successfully', 201);
});

/**
 * Update content item
 */
export const updateContentItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { originalText, mediaUrl }: UpdateContentRequest = req.body;

  // Check if content item exists and belongs to user
  const existingContent = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!existingContent) {
    return sendNotFound(res, 'Content item not found');
  }

  // Prepare update data
  const updateData: any = {};
  if (originalText) updateData.originalText = originalText;
  if (mediaUrl !== undefined) updateData.mediaUrl = mediaUrl;
  // ContentItem has no tags field in schema

  const updatedContent = await prisma.contentItem.update({
    where: { id },
    data: updateData,
    include: {
      variations: {
        select: {
          id: true,
          platform: true,
          adaptedText: true
        }
      },
      _count: {
        select: {
          variations: true
        }
      }
    }
  });

  return sendSuccess(res, updatedContent, 'Content item updated successfully');
});

/**
 * Delete content item
 */
export const deleteContentItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Check if content item exists and belongs to user
  const existingContent = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!existingContent) {
    return sendNotFound(res, 'Content item not found');
  }

  // Delete content item (cascade will handle variations and posts)
  await prisma.contentItem.delete({
    where: { id }
  });

  return sendSuccess(res, null, 'Content item deleted successfully');
});

/**
 * Create variation for content item
 */
export const createVariation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // content item id
  const userId = req.user?.id;
  const { platform, adaptedText } = req.body;

  // Check if content item exists and belongs to user
  const contentItem = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!contentItem) {
    return sendNotFound(res, 'Content item not found');
  }

  // Check if variation for this platform already exists
  const existingVariation = await prisma.variation.findFirst({
    where: {
      contentId: id,
      platform
    }
  });

  if (existingVariation) {
    return sendBadRequest(res, `Variation for ${platform} already exists`);
  }

  const variation = await prisma.variation.create({
    data: {
      contentId: id,
      platform,
      adaptedText
    }
  });

  return sendSuccess(res, variation, 'Variation created successfully', 201);
});

/**
 * Update variation
 */
export const updateVariation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, variationId } = req.params;
  const userId = req.user?.id;
  const { adaptedText } = req.body;

  // Check if content item exists and belongs to user
  const contentItem = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!contentItem) {
    return sendNotFound(res, 'Content item not found');
  }

  // Check if variation exists
  const existingVariation = await prisma.variation.findFirst({
    where: {
      id: variationId,
      contentId: id
    }
  });

  if (!existingVariation) {
    return sendNotFound(res, 'Variation not found');
  }

  const updatedVariation = await prisma.variation.update({
    where: { id: variationId },
    data: { adaptedText }
  });

  return sendSuccess(res, updatedVariation, 'Variation updated successfully');
});

/**
 * Delete variation
 */
export const deleteVariation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, variationId } = req.params;
  const userId = req.user?.id;

  // Check if content item exists and belongs to user
  const contentItem = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!contentItem) {
    return sendNotFound(res, 'Content item not found');
  }

  // Check if variation exists
  const existingVariation = await prisma.variation.findFirst({
    where: {
      id: variationId,
      contentId: id
    }
  });

  if (!existingVariation) {
    return sendNotFound(res, 'Variation not found');
  }

  // Delete variation (cascade will handle posts)
  await prisma.variation.delete({
    where: { id: variationId }
  });

  return sendSuccess(res, null, 'Variation deleted successfully');
});

/**
 * Get variations for content item
 */
export const getVariations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params; // content item id
  const userId = req.user?.id;

  // Check if content item exists and belongs to user
  const contentItem = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!contentItem) {
    return sendNotFound(res, 'Content item not found');
  }

  const variations = await prisma.variation.findMany({
    where: { contentId: id },
    include: {
      posts: {
        select: {
          id: true,
          status: true,
          scheduledTime: true,
          channel: {
            select: {
              id: true,
              platform: true,
              name: true
            }
          }
        }
      },
      _count: {
        select: {
          posts: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, variations, 'Variations retrieved successfully');
});

/**
 * Duplicate content item
 */
export const duplicateContentItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Get original content item with variations
  const originalContent = await prisma.contentItem.findFirst({
    where: { 
      id,
      accountId: userId 
    },
    include: {
      variations: true
    }
  });

  if (!originalContent) {
    return sendNotFound(res, 'Content item not found');
  }

  // Create duplicate content item
  const duplicatedContent = await prisma.contentItem.create({
    data: {
      accountId: userId!,
      originalText: `${originalContent.originalText} (Copy)`,
      mediaUrl: originalContent.mediaUrl
    }
  });

  // Create duplicate variations
  if (originalContent.variations.length > 0) {
    await prisma.variation.createMany({
      data: originalContent.variations.map(variation => ({
        contentId: duplicatedContent.id,
        platform: variation.platform,
        adaptedText: variation.adaptedText
      }))
    });
  }

  // Get the complete duplicated content with variations
  const result = await prisma.contentItem.findUnique({
    where: { id: duplicatedContent.id },
    include: {
      variations: true,
      _count: {
        select: {
          variations: true
        }
      }
    }
  });

  return sendSuccess(res, result, 'Content item duplicated successfully', 201);
});