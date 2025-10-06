import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';
import { sendSuccess, sendError, sendNotFound, sendConflict } from '../utils/response';
import { CreateAccountRequest, UpdateAccountRequest, AuthRequest, PaginationQuery } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Get all accounts (Admin only)
 */
export const getAllAccounts = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10' }: PaginationQuery = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      skip,
      take: limitNum,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subscription: true,
        credits: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            channels: true,
            contentItems: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.account.count()
  ]);

  return sendSuccess(res, {
    accounts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Accounts retrieved successfully');
});

/**
 * Get account by ID (Admin only)
 */
export const getAccountById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const account = await prisma.account.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscription: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
      channels: {
        select: {
          id: true,
          platform: true,
          name: true,
          isActive: true,
          createdAt: true
        }
      },
      contentItems: {
        select: {
          id: true,
          originalText: true,
          createdAt: true,
          _count: {
            select: {
              variations: true
            }
          }
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      },
      _count: {
        select: {
          channels: true,
          contentItems: true
        }
      }
    }
  });

  if (!account) {
    return sendNotFound(res, 'Account not found');
  }

  return sendSuccess(res, account, 'Account retrieved successfully');
});

/**
 * Create new account (Admin only)
 */
export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role }: CreateAccountRequest = req.body;

  // Check if user already exists
  const existingUser = await prisma.account.findUnique({
    where: { email }
  });

  if (existingUser) {
    return sendConflict(res, 'User with this email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.account.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || 'USER'
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscription: true,
      credits: true,
      createdAt: true
    }
  });

  return sendSuccess(res, user, 'Account created successfully', 201);
});

/**
 * Update account (Admin only)
 */
export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, subscription, credits }: UpdateAccountRequest = req.body;

  // Check if account exists
  const existingAccount = await prisma.account.findUnique({
    where: { id }
  });

  if (!existingAccount) {
    return sendNotFound(res, 'Account not found');
  }

  // Update account
  const updatedAccount = await prisma.account.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(subscription && { subscription }),
      ...(credits !== undefined && { credits })
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscription: true,
      credits: true,
      updatedAt: true
    }
  });

  return sendSuccess(res, updatedAccount, 'Account updated successfully');
});

/**
 * Delete account (Admin only)
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if account exists
  const existingAccount = await prisma.account.findUnique({
    where: { id }
  });

  if (!existingAccount) {
    return sendNotFound(res, 'Account not found');
  }

  // Delete account (cascade will handle related records)
  await prisma.account.delete({
    where: { id }
  });

  return sendSuccess(res, null, 'Account deleted successfully');
});

/**
 * Update account credits (Admin only)
 */
export const updateCredits = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { credits, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'

  // Check if account exists
  const existingAccount = await prisma.account.findUnique({
    where: { id },
    select: { id: true, credits: true }
  });

  if (!existingAccount) {
    return sendNotFound(res, 'Account not found');
  }

  let newCredits: number;
  switch (operation) {
    case 'add':
      newCredits = existingAccount.credits + credits;
      break;
    case 'subtract':
      newCredits = Math.max(0, existingAccount.credits - credits);
      break;
    case 'set':
    default:
      newCredits = credits;
      break;
  }

  // Update credits
  const updatedAccount = await prisma.account.update({
    where: { id },
    data: { credits: newCredits },
    select: {
      id: true,
      name: true,
      email: true,
      credits: true,
      updatedAt: true
    }
  });

  return sendSuccess(res, updatedAccount, 'Credits updated successfully');
});

/**
 * Get account statistics (Admin only)
 */
export const getAccountStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const account = await prisma.account.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          channels: true,
          contentItems: true
        }
      }
    }
  });

  if (!account) {
    return sendNotFound(res, 'Account not found');
  }

  // Get additional statistics
  const [totalPosts, totalAnalytics] = await Promise.all([
    prisma.post.count({
      where: {
        channel: {
          accountId: id
        }
      }
    }),
    prisma.analytics.aggregate({
      where: {
        post: {
          channel: {
            accountId: id
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

  const stats = {
    account,
    totalChannels: account._count.channels,
    totalContentItems: account._count.contentItems,
    totalPosts,
    totalImpressions: totalAnalytics._sum.impressions || 0,
    totalEngagement: totalAnalytics._sum.engagement || 0,
    totalConversions: totalAnalytics._sum.conversions || 0
  };

  return sendSuccess(res, stats, 'Account statistics retrieved successfully');
});