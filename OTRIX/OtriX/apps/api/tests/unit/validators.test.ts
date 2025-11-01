import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Admin API Validation Schemas
const UserCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['user', 'admin', 'superadmin']).default('user'),
});

const UserUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['user', 'admin', 'superadmin']).optional(),
  emailVerified: z.boolean().optional(),
});

const ProjectCreateSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  name: z.string().min(3, 'Name must be at least 3 characters').max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['web-app', 'mobile', 'iot', '3d-model']),
  status: z.enum(['queued', 'analyzing', 'generating', 'completed', 'failed']).default('queued'),
});

describe('Admin API Validators', () => {
  describe('UserCreateSchema', () => {
    it('should validate correct user creation data', () => {
      const validData = {
        email: 'test@otrix.com',
        name: 'Test User',
        password: 'Test@2025!',
        role: 'user' as const,
      };

      const result = UserCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@otrix.com');
        expect(result.data.role).toBe('user');
      }
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        name: 'Test User',
        password: 'Test@2025!',
      };

      const result = UserCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('email');
      }
    });

    it('should reject short password', () => {
      const invalidData = {
        email: 'test@otrix.com',
        name: 'Test User',
        password: 'short',
      };

      const result = UserCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('8 characters');
      }
    });

    it('should use default role when not provided', () => {
      const validData = {
        email: 'test@otrix.com',
        name: 'Test User',
        password: 'Test@2025!',
      };

      const result = UserCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('user');
      }
    });
  });

  describe('UserUpdateSchema', () => {
    it('should allow partial updates', () => {
      const validData = {
        name: 'Updated Name',
      };

      const result = UserUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow role updates', () => {
      const validData = {
        role: 'admin' as const,
      };

      const result = UserUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const invalidData = {
        role: 'invalid-role',
      };

      const result = UserUpdateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('ProjectCreateSchema', () => {
    it('should validate correct project creation data', () => {
      const validData = {
        userId: 'clxxx123456789',
        name: 'Test Project',
        description: 'A test project',
        type: 'web-app' as const,
        status: 'queued' as const,
      };

      const result = ProjectCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject short project name', () => {
      const invalidData = {
        userId: 'clxxx123456789',
        name: 'AB',
        type: 'web-app' as const,
      };

      const result = ProjectCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('3 characters');
      }
    });

    it('should use default status when not provided', () => {
      const validData = {
        userId: 'clxxx123456789',
        name: 'Test Project',
        type: 'web-app' as const,
      };

      const result = ProjectCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('queued');
      }
    });
  });
});
