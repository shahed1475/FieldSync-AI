import jwt, { Secret, SignOptions, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { TokenPayload } from '../types';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-fallback-secret-key';
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = process.env.JWT_EXPIRES_IN
  ? (process.env.JWT_EXPIRES_IN as unknown as SignOptions['expiresIn'])
  : '7d';
const JWT_REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET || 'your-fallback-refresh-secret';

/**
 * Generates an access token
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'contentops-ai',
    audience: 'contentops-ai-users'
  };
  return jwt.sign(payload, JWT_SECRET, options);
};

/**
 * Generates a refresh token
 */
export const generateRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: '30d',
    issuer: 'contentops-ai',
    audience: 'contentops-ai-users'
  };
  return jwt.sign(payload, JWT_REFRESH_SECRET, options);
};

/**
 * Verifies an access token
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'contentops-ai',
      audience: 'contentops-ai-users'
    }) as TokenPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new Error('Token expired');
    } else if (error instanceof JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
};

/**
 * Verifies a refresh token
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'contentops-ai',
      audience: 'contentops-ai-users'
    }) as TokenPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new Error('Refresh token expired');
    } else if (error instanceof JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    } else {
      throw new Error('Refresh token verification failed');
    }
  }
};

/**
 * Extracts token from Authorization header
 */
export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

/**
 * Generates both access and refresh tokens
 */
export const generateTokenPair = (payload: TokenPayload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: JWT_EXPIRES_IN
  };
};

/**
 * Decodes token without verification (for debugging)
 */
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};