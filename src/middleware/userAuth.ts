import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';

/**
 * Extended Request interface with user info
 */
export interface UserRequest extends Request {
  user?: {
    phoneNumber: string;
  };
}

/**
 * AuthService instance for token verification
 */
let authService: AuthService;

/**
 * Initialize the auth middleware with AuthService instance
 */
export function initUserAuthMiddleware(service: AuthService): void {
  authService = service;
}

/**
 * Middleware to require user authentication via JWT token
 * Extracts token from cookie or Authorization header
 */
export async function requireUserAuth(req: UserRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies?.userToken || 
                  (req.headers.authorization?.startsWith('Bearer ') 
                    ? req.headers.authorization.substring(7) 
                    : null);

    if (!token) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN' 
      });
      return;
    }

    if (!authService) {
      console.error('AuthService not initialized. Call initUserAuthMiddleware first.');
      res.status(500).json({ 
        error: 'Server configuration error',
        code: 'AUTH_SERVICE_NOT_INITIALIZED' 
      });
      return;
    }

    // Verify token
    const result = await authService.verifyToken(token);

    if (!result.valid || !result.phoneNumber) {
      res.status(401).json({ 
        error: result.message || 'Invalid or expired token',
        code: 'INVALID_TOKEN' 
      });
      return;
    }

    // Attach user info to request
    req.user = {
      phoneNumber: result.phoneNumber,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR' 
    });
  }
}

/**
 * Optional middleware - attaches user if authenticated, but doesn't require it
 */
export async function optionalUserAuth(req: UserRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.userToken || 
                  (req.headers.authorization?.startsWith('Bearer ') 
                    ? req.headers.authorization.substring(7) 
                    : null);

    if (token && authService) {
      const result = await authService.verifyToken(token);
      if (result.valid && result.phoneNumber) {
        req.user = {
          phoneNumber: result.phoneNumber,
        };
      }
    }
    next();
  } catch (error) {
    // Silently continue without user info
    next();
  }
}

/**
 * Rate limiting middleware for OTP requests
 * Prevents abuse of OTP endpoint
 */
const otpRequestCounts = new Map<string, { count: number; resetAt: number }>();
const OTP_RATE_LIMIT = 3; // Max requests per hour
const OTP_RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

export function rateLimitOTP(req: Request, res: Response, next: NextFunction): void {
  const phoneNumber = req.body?.phoneNumber;

  if (!phoneNumber) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const now = Date.now();
  const record = otpRequestCounts.get(phoneNumber);

  if (!record || now > record.resetAt) {
    // Reset counter for new hour
    otpRequestCounts.set(phoneNumber, {
      count: 1,
      resetAt: now + OTP_RATE_WINDOW,
    });
    next();
    return;
  }

  if (record.count >= OTP_RATE_LIMIT) {
    const remainingMs = record.resetAt - now;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    res.status(429).json({ 
      error: 'Too many OTP requests',
      message: `Please try again in ${remainingMinutes} minutes`,
      code: 'RATE_LIMITED',
      retryAfter: remainingMinutes,
    });
    return;
  }

  record.count++;
  next();
}

/**
 * Clean up expired rate limit entries (should be called periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of otpRequestCounts.entries()) {
    if (now > record.resetAt) {
      otpRequestCounts.delete(key);
    }
  }
}