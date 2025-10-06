import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { UserRole, Platform, PostStatus } from '@prisma/client';
import { sendValidationError } from '../utils/response';

/**
 * Generic validation middleware
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        const key = detail.path.join('.');
        errors[key] = detail.message;
      });
      
      sendValidationError(res, errors);
      return;
    }
    
    next();
    return;
  };
};

/**
 * Query parameter validation middleware
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.query, { abortEarly: false });
    
    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        const key = detail.path.join('.');
        errors[key] = detail.message;
      });
      
      sendValidationError(res, errors);
      return;
    }
    
    next();
    return;
  };
};

// Authentication Schemas
export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  })
});

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    'any.required': 'Password is required'
  })
});

// Profile and password update schemas
export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required'
  })
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(8).required().messages({
    'string.min': 'Current password must be at least 8 characters long',
    'any.required': 'Current password is required'
  }),
  newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
    'string.min': 'New password must be at least 8 characters long',
    'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
    'any.required': 'New password is required'
  })
});

// Account Schemas
export const createAccountSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
  role: Joi.string().valid(...Object.values(UserRole)).optional()
});

export const updateAccountSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  subscription: Joi.string().optional(),
  credits: Joi.number().integer().min(0).optional()
});

export const updateCreditsSchema = Joi.object({
  credits: Joi.number().integer().min(0).required().messages({
    'number.base': 'Credits must be a number',
    'number.integer': 'Credits must be an integer',
    'number.min': 'Credits cannot be negative',
    'any.required': 'Credits are required'
  }),
  operation: Joi.string().valid('set', 'add', 'subtract').optional().messages({
    'any.only': "Operation must be one of: 'set', 'add', 'subtract'"
  })
});

// Channel Schemas
export const createChannelSchema = Joi.object({
  platform: Joi.string().valid(...Object.values(Platform)).required().messages({
    'any.only': 'Platform must be one of: ' + Object.values(Platform).join(', ')
  }),
  name: Joi.string().min(1).max(100).required(),
  credentials: Joi.object().required().messages({
    'any.required': 'Platform credentials are required'
  })
});

export const updateChannelSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  credentials: Joi.object().optional(),
  isActive: Joi.boolean().optional()
});

// Content Schemas
export const createContentSchema = Joi.object({
  originalText: Joi.string().min(1).max(5000).required().messages({
    'string.min': 'Content text cannot be empty',
    'string.max': 'Content text cannot exceed 5000 characters',
    'any.required': 'Content text is required'
  }),
  mediaUrl: Joi.string().uri().optional().messages({
    'string.uri': 'Media URL must be a valid URL'
  })
});

export const updateContentSchema = Joi.object({
  originalText: Joi.string().min(1).max(5000).optional(),
  mediaUrl: Joi.string().uri().allow('').optional()
});

// Variation Schemas
export const createVariationSchema = Joi.object({
  contentId: Joi.string().required(),
  platform: Joi.string().valid(...Object.values(Platform)).required(),
  adaptedText: Joi.string().min(1).max(5000).required()
});

export const updateVariationSchema = Joi.object({
  adaptedText: Joi.string().min(1).max(5000).optional()
});

// Post Schemas
export const createPostSchema = Joi.object({
  variationId: Joi.string().required(),
  channelId: Joi.string().required(),
  scheduledTime: Joi.date().iso().greater('now').optional().messages({
    'date.greater': 'Scheduled time must be in the future'
  })
});

export const updatePostSchema = Joi.object({
  scheduledTime: Joi.date().iso().greater('now').optional(),
  status: Joi.string().valid(...Object.values(PostStatus)).optional()
});

// Bulk and reschedule Post Schemas
export const bulkCreatePostsSchema = Joi.object({
  posts: Joi.array().items(createPostSchema).min(1).required()
});

export const reschedulePostSchema = Joi.object({
  scheduledTime: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Scheduled time must be in the future'
  })
});

// Analytics Schemas
export const createAnalyticsSchema = Joi.object({
  postId: Joi.string().required(),
  impressions: Joi.number().integer().min(0).optional(),
  engagement: Joi.number().integer().min(0).optional(),
  conversions: Joi.number().integer().min(0).optional(),
  clicks: Joi.number().integer().min(0).optional(),
  shares: Joi.number().integer().min(0).optional(),
  comments: Joi.number().integer().min(0).optional(),
  likes: Joi.number().integer().min(0).optional()
});

export const updateAnalyticsSchema = Joi.object({
  impressions: Joi.number().integer().min(0).optional(),
  engagement: Joi.number().integer().min(0).optional(),
  conversions: Joi.number().integer().min(0).optional(),
  clicks: Joi.number().integer().min(0).optional(),
  shares: Joi.number().integer().min(0).optional(),
  comments: Joi.number().integer().min(0).optional(),
  likes: Joi.number().integer().min(0).optional()
});

export const bulkAnalyticsSchema = Joi.object({
  analytics: Joi.array()
    .items(createAnalyticsSchema.keys({ id: Joi.string().optional() }))
    .min(1)
    .required()
});

// Query Schemas
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

export const postsQuerySchema = paginationSchema.keys({
  status: Joi.string().valid(...Object.values(PostStatus)).optional(),
  platform: Joi.string().valid(...Object.values(Platform)).optional(),
  channelId: Joi.string().optional()
});

export const analyticsQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  platform: Joi.string().valid(...Object.values(Platform)).optional(),
  channelId: Joi.string().optional(),
  sortBy: Joi.string().valid(
    'createdAt',
    'impressions',
    'engagement',
    'conversions',
    'clicks',
    'shares',
    'comments',
    'likes'
  ).optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional()
});

// AI Schemas
export const aiAdaptSchema = Joi.object({
  contentId: Joi.string().required(),
  platform: Joi.string().valid(...Object.values(Platform)).required()
});

export const aiHashtagSchema = Joi.object({
  text: Joi.string().min(1).max(5000).required(),
  platform: Joi.string().valid(...Object.values(Platform)).required(),
  maxCount: Joi.number().integer().min(1).max(20).optional()
});

export const aiForecastSchema = Joi.object({
  postId: Joi.string().required()
});

// Validation middleware exports
export const validateLogin = validate(loginSchema);
export const validateRegister = validate(registerSchema);
export const validateCreateAccount = validate(createAccountSchema);
export const validateUpdateAccount = validate(updateAccountSchema);
export const validateCreateChannel = validate(createChannelSchema);
export const validateUpdateChannel = validate(updateChannelSchema);
export const validateCreateContent = validate(createContentSchema);
export const validateUpdateContent = validate(updateContentSchema);
export const validateCreateVariation = validate(createVariationSchema);
export const validateUpdateVariation = validate(updateVariationSchema);
export const validateCreatePost = validate(createPostSchema);
export const validateUpdatePost = validate(updatePostSchema);
export const validateUpdateAnalytics = validate(updateAnalyticsSchema);
export const validatePagination = validateQuery(paginationSchema);
export const validatePostsQuery = validateQuery(postsQuerySchema);
export const validateAnalyticsQuery = validateQuery(analyticsQuerySchema);

// Alias to match route imports
export const validateRequest = validate;