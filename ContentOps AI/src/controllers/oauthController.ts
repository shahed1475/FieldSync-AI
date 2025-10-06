import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { encryptCredentials } from '../utils/encryption';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { Platform } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';

// Placeholder OAuth initiation endpoints return a mock URL
export const initiateOAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { platform } = req.params;
  const supported = ['twitter', 'linkedin', 'facebook'];
  if (!supported.includes(platform.toLowerCase())) {
    return sendError(res, 'Unsupported platform for OAuth', 400);
  }
  const redirectUrl = `https://auth.${platform}.com/authorize?state=${Date.now()}`;
  return sendSuccess(res, { url: redirectUrl }, 'OAuth initiation URL generated');
});

// OAuth callback stub: store token in Channel credentials
export const oauthCallback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { platform } = req.params;
  const { code, channelName } = req.query as { code?: string; channelName?: string };
  if (!code) return sendError(res, 'Missing authorization code', 400);

  // Simulate exchange code->accessToken
  const accessToken = `token_${platform}_${Date.now()}`;

  const channel = await prisma.channel.create({
    data: {
      accountId: userId!,
      platform: platform.toUpperCase() as Platform,
      name: channelName || `${platform} channel`,
      credentials: encryptCredentials({ accessToken })
    },
    select: { id: true, platform: true, name: true, isActive: true }
  });

  return sendSuccess(res, channel, 'OAuth connection established');
});