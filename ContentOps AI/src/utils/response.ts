import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '../types';

/**
 * Sends a successful response
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data
  };
  
  return res.status(statusCode).json(response);
};

/**
 * Sends an error response
 */
export const sendError = (
  res: Response,
  message: string = 'An error occurred',
  statusCode: number = 500,
  error?: string
): Response => {
  const response: ApiResponse = {
    success: false,
    message,
    error
  };
  
  return res.status(statusCode).json(response);
};

/**
 * Sends a validation error response
 */
export const sendValidationError = (
  res: Response,
  errors: Record<string, string>,
  message: string = 'Validation failed'
): Response => {
  const response: ApiResponse = {
    success: false,
    message,
    errors
  };
  
  return res.status(400).json(response);
};

/**
 * Sends a paginated response
 */
export const sendPaginatedResponse = <T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number,
  message: string = 'Success'
): Response => {
  const totalPages = Math.ceil(total / limit);
  
  const response: PaginatedResponse<T> = {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
  
  return res.status(200).json(response);
};

/**
 * Sends a created response (201)
 */
export const sendCreated = <T>(
  res: Response,
  data: T,
  message: string = 'Resource created successfully'
): Response => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Sends a no content response (204)
 */
export const sendNoContent = (res: Response): Response => {
  return res.status(204).send();
};

/**
 * Sends an unauthorized response (401)
 */
export const sendUnauthorized = (
  res: Response,
  message: string = 'Unauthorized'
): Response => {
  return sendError(res, message, 401);
};

/**
 * Sends a forbidden response (403)
 */
export const sendForbidden = (
  res: Response,
  message: string = 'Forbidden'
): Response => {
  return sendError(res, message, 403);
};

/**
 * Sends a not found response (404)
 */
export const sendNotFound = (
  res: Response,
  message: string = 'Resource not found'
): Response => {
  return sendError(res, message, 404);
};

/**
 * Sends a conflict response (409)
 */
export const sendConflict = (
  res: Response,
  message: string = 'Resource already exists'
): Response => {
  return sendError(res, message, 409);
};

/**
 * Sends a bad request response (400)
 */
export const sendBadRequest = (
  res: Response,
  message: string = 'Bad request'
): Response => {
  return sendError(res, message, 400);
};

/**
 * Sends an internal server error response (500)
 */
export const sendInternalError = (
  res: Response,
  message: string = 'Internal server error',
  error?: string
): Response => {
  return sendError(res, message, 500, error);
};