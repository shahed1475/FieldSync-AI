import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess, sendError, sendUnauthorized, sendConflict, sendBadRequest } from '../utils/response';
import { LoginRequest, RegisterRequest, AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * Register a new user
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password }: RegisterRequest = req.body;

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
      password: hashedPassword
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

  // Generate tokens
  const tokens = generateTokenPair({
    id: user.id,
    email: user.email,
    role: user.role
  });

  return sendSuccess(res, {
    user,
    ...tokens
  }, 'User registered successfully', 201);
});

/**
 * Login user
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password }: LoginRequest = req.body;

  // Find user
  const user = await prisma.account.findUnique({
    where: { email }
  });

  if (!user) {
    return sendUnauthorized(res, 'Invalid email or password');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return sendUnauthorized(res, 'Invalid email or password');
  }

  // Generate tokens
  const tokens = generateTokenPair({
    id: user.id,
    email: user.email,
    role: user.role
  });

  // Return user data without password
  const { password: _, ...userWithoutPassword } = user;

  return sendSuccess(res, {
    user: userWithoutPassword,
    ...tokens
  }, 'Login successful');
});

/**
 * Refresh access token
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return sendBadRequest(res, 'Refresh token is required');
  }

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if user still exists
    const user = await prisma.account.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      return sendUnauthorized(res, 'User not found');
    }

    // Generate new tokens
    const tokens = generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role
    });

    return sendSuccess(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    return sendUnauthorized(res, 'Invalid refresh token');
  }
});

/**
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  const user = await prisma.account.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      subscription: true,
      credits: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  return sendSuccess(res, user, 'Profile retrieved successfully');
});

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { name } = req.body;

  const updatedUser = await prisma.account.update({
    where: { id: userId },
    data: { name },
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

  return sendSuccess(res, updatedUser, 'Profile updated successfully');
});

/**
 * Change password
 */
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await prisma.account.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return sendBadRequest(res, 'Current password is incorrect');
  }

  // Hash new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  // Update password
  await prisma.account.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });

  return sendSuccess(res, null, 'Password changed successfully');
});

/**
 * Logout (client-side token invalidation)
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // In a stateless JWT system, logout is typically handled client-side
  // by removing the token from storage. However, we can log the action.
  
  return sendSuccess(res, null, 'Logged out successfully');
});

/**
 * Delete account
 */
export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { password } = req.body;

  // Get user with password
  const user = await prisma.account.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return sendBadRequest(res, 'Password is incorrect');
  }

  // Delete user (cascade will handle related records)
  await prisma.account.delete({
    where: { id: userId }
  });

  return sendSuccess(res, null, 'Account deleted successfully');
});