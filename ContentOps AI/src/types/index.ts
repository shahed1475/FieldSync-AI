import { UserRole, Platform, PostStatus } from '@prisma/client';
import { Request } from 'express';

// Authentication Types
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  role: UserRole;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Account Types
export interface CreateAccountRequest {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateAccountRequest {
  name?: string;
  subscription?: string;
  credits?: number;
}

// Channel Types
export interface CreateChannelRequest {
  platform: Platform;
  name: string;
  credentials: Record<string, any>;
}

export interface UpdateChannelRequest {
  name?: string;
  credentials?: Record<string, any>;
  isActive?: boolean;
}

// Content Types
export interface CreateContentRequest {
  originalText: string;
  mediaUrl?: string;
}

export interface UpdateContentRequest {
  originalText?: string;
  mediaUrl?: string;
}

// Variation Types
export interface CreateVariationRequest {
  contentId: string;
  platform: Platform;
  adaptedText: string;
}

export interface UpdateVariationRequest {
  adaptedText?: string;
}

// Post Types
export interface CreatePostRequest {
  variationId: string;
  channelId: string;
  scheduledTime?: string;
}

export interface UpdatePostRequest {
  scheduledTime?: string;
  status?: PostStatus;
}

// Analytics Types
export interface UpdateAnalyticsRequest {
  impressions?: number;
  engagement?: number;
  conversions?: number;
  clicks?: number;
  shares?: number;
  comments?: number;
  likes?: number;
}

export interface CreateAnalyticsRequest extends UpdateAnalyticsRequest {
  postId: string;
}

// Dashboard Types
export interface DashboardStats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  totalEngagement: number;
  totalImpressions: number;
  totalConversions: number;
  recentPosts: Array<{
    id: string;
    platform: Platform;
    status: PostStatus;
    scheduledTime?: Date;
    publishedAt?: Date;
    engagement: number;
  }>;
}

// Query Parameters
export interface PaginationQuery {
  page?: string;
  limit?: string;
}

// Content Query Parameters
export interface ContentQuery extends PaginationQuery {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PostsQuery extends PaginationQuery {
  status?: PostStatus;
  platform?: Platform;
  channelId?: string;
}

export interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  platform?: Platform;
  channelId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}