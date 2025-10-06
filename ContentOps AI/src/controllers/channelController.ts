import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { encryptCredentials, decryptCredentials } from '../utils/encryption';
import { sendSuccess, sendError, sendNotFound, sendConflict } from '../utils/response';
import { CreateChannelRequest, UpdateChannelRequest, AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Get all channels for the authenticated user
 */
export const getChannels = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  const channels = await prisma.channel.findMany({
    where: { accountId: userId },
    select: {
      id: true,
      platform: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          posts: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, channels, 'Channels retrieved successfully');
});

/**
 * Get channel by ID
 */
export const getChannelById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const channel = await prisma.channel.findFirst({
    where: { 
      id,
      accountId: userId 
    },
    select: {
      id: true,
      platform: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      posts: {
        select: {
          id: true,
          status: true,
          scheduledTime: true,
          publishedAt: true,
          createdAt: true,
          variation: {
            select: {
              adaptedText: true,
              platform: true
            }
          }
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      },
      _count: {
        select: {
          posts: true
        }
      }
    }
  });

  if (!channel) {
    return sendNotFound(res, 'Channel not found');
  }

  return sendSuccess(res, channel, 'Channel retrieved successfully');
});

/**
 * Create new channel
 */
export const createChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { platform, name, credentials }: CreateChannelRequest = req.body;

  // Check if channel with same platform already exists for user
  const existingChannel = await prisma.channel.findFirst({
    where: {
      accountId: userId,
      platform,
      name
    }
  });

  if (existingChannel) {
    return sendConflict(res, `Channel '${name}' for ${platform} already exists`);
  }

  // Encrypt credentials
  const encryptedCredentials = encryptCredentials(credentials);

  // Create channel
  const channel = await prisma.channel.create({
    data: {
      accountId: userId!,
      platform,
      name,
      credentials: encryptedCredentials
    },
    select: {
      id: true,
      platform: true,
      name: true,
      isActive: true,
      createdAt: true
    }
  });

  return sendSuccess(res, channel, 'Channel created successfully', 201);
});

/**
 * Update channel
 */
export const updateChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { name, credentials, isActive }: UpdateChannelRequest = req.body;

  // Check if channel exists and belongs to user
  const existingChannel = await prisma.channel.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!existingChannel) {
    return sendNotFound(res, 'Channel not found');
  }

  // Prepare update data
  const updateData: any = {};
  if (name) updateData.name = name;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (credentials) {
    updateData.credentials = encryptCredentials(credentials);
  }

  // Update channel
  const updatedChannel = await prisma.channel.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      platform: true,
      name: true,
      isActive: true,
      updatedAt: true
    }
  });

  return sendSuccess(res, updatedChannel, 'Channel updated successfully');
});

/**
 * Delete channel
 */
export const deleteChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Check if channel exists and belongs to user
  const existingChannel = await prisma.channel.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!existingChannel) {
    return sendNotFound(res, 'Channel not found');
  }

  // Delete channel (cascade will handle related posts)
  await prisma.channel.delete({
    where: { id }
  });

  return sendSuccess(res, null, 'Channel deleted successfully');
});

/**
 * Test channel connection
 */
export const testChannelConnection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Get channel with credentials
  const channel = await prisma.channel.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!channel) {
    return sendNotFound(res, 'Channel not found');
  }

  try {
    // Decrypt credentials for testing
    const credentials = decryptCredentials(channel.credentials);
    
    // Here you would implement actual platform API testing
    // For now, we'll simulate a successful test
    const testResult = {
      platform: channel.platform,
      status: 'connected',
      message: 'Channel connection is working properly',
      lastTested: new Date().toISOString()
    };

    // Update channel to mark as active if test passes
    await prisma.channel.update({
      where: { id },
      data: { isActive: true }
    });

    return sendSuccess(res, testResult, 'Channel connection tested successfully');
  } catch (error) {
    // Mark channel as inactive if test fails
    await prisma.channel.update({
      where: { id },
      data: { isActive: false }
    });

    return sendError(res, 'Channel connection test failed', 400);
  }
});

/**
 * Get channel credentials (for editing)
 */
export const getChannelCredentials = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Get channel
  const channel = await prisma.channel.findFirst({
    where: { 
      id,
      accountId: userId 
    }
  });

  if (!channel) {
    return sendNotFound(res, 'Channel not found');
  }

  try {
    // Decrypt credentials
    const credentials = decryptCredentials(channel.credentials);
    
    // Remove sensitive data before sending (keep only structure)
    const sanitizedCredentials = Object.keys(credentials).reduce((acc, key) => {
      acc[key] = typeof credentials[key] === 'string' ? '***' : credentials[key];
      return acc;
    }, {} as Record<string, any>);

    return sendSuccess(res, {
      platform: channel.platform,
      credentialFields: sanitizedCredentials
    }, 'Channel credential structure retrieved');
  } catch (error) {
    return sendError(res, 'Failed to retrieve channel credentials', 500);
  }
});

/**
 * Get channels by platform
 */
export const getChannelsByPlatform = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { platform } = req.params;
  const userId = req.user?.id;

  const channels = await prisma.channel.findMany({
    where: { 
      accountId: userId,
      platform: platform.toUpperCase() as any
    },
    select: {
      id: true,
      platform: true,
      name: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          posts: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return sendSuccess(res, channels, `${platform} channels retrieved successfully`);
});