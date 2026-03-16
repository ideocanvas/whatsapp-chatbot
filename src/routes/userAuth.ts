import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { rateLimitOTP, requireUserAuth, UserRequest } from '../middleware/userAuth';

/**
 * User authentication routes for OTP-based authentication
 * These routes are separate from admin dashboard authentication
 */
export class UserAuthRoutes {
  private readonly router: Router;
  private readonly authService: AuthService;
  private whatsappService: any;

  constructor(whatsappService?: any) {
    this.router = Router();
    this.whatsappService = whatsappService;
    this.authService = new AuthService(whatsappService);
    this.setupRoutes();
  }

  /**
   * Set WhatsAppService instance (for dependency injection)
   */
  setWhatsAppService(service: any): void {
    this.whatsappService = service;
    this.authService.setWhatsAppService(service);
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Get the AuthService instance (for middleware initialization)
   */
  getAuthService(): AuthService {
    return this.authService;
  }

  private setupRoutes(): void {
    /**
     * Request OTP for phone number
     * POST /api/user/request-otp
     */
    this.router.post('/api/user/request-otp', rateLimitOTP, async (req: Request, res: Response) => {
      try {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
          return res.status(400).json({ 
            error: 'Phone number is required',
            code: 'PHONE_REQUIRED' 
          });
        }

        // Validate phone number format (basic validation)
        const phoneRegex = /^\+?[1-9]\d{6,14}$/;
        if (!phoneRegex.test(phoneNumber.replaceAll(/[\s-]/g, ''))) {
          return res.status(400).json({ 
            error: 'Invalid phone number format',
            code: 'INVALID_PHONE' 
          });
        }

        const result = await this.authService.requestOTP(phoneNumber);

        if (result.success) {
          return res.json({ 
            success: true, 
            message: result.message,
            expiresIn: result.expiresIn 
          });
        } else {
          return res.status(429).json({ 
            error: result.message,
            code: 'RATE_LIMITED' 
          });
        }
      } catch (error) {
        console.error('Error requesting OTP:', error);
        return res.status(500).json({ 
          error: 'Failed to send OTP',
          code: 'SERVER_ERROR' 
        });
      }
    });

    /**
     * Verify OTP and get session token
     * POST /api/user/verify-otp
     */
    this.router.post('/api/user/verify-otp', async (req: Request, res: Response) => {
      try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
          return res.status(400).json({ 
            error: 'Phone number and OTP are required',
            code: 'MISSING_FIELDS' 
          });
        }

        const result = await this.authService.verifyOTP(phoneNumber, otp);

        if (result.success && result.token) {
          // Set HTTP-only cookie with JWT token
          res.cookie('userToken', result.token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/',
            secure: process.env.NODE_ENV === 'production' && req.secure,
            sameSite: 'lax'
          });

          return res.json({ 
            success: true, 
            message: result.message,
            user: { phoneNumber }
          });
        } else {
          return res.status(401).json({ 
            error: result.message,
            code: 'INVALID_OTP' 
          });
        }
      } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ 
          error: 'Verification failed',
          code: 'SERVER_ERROR' 
        });
      }
    });

    /**
     * Logout - invalidate session
     * POST /api/user/logout
     */
    this.router.post('/api/user/logout', async (req: Request, res: Response) => {
      try {
        const token = req.cookies?.userToken;

        if (token) {
          await this.authService.logout(token);
        }

        res.clearCookie('userToken');
        return res.json({ success: true, message: 'Logged out successfully' });
      } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ 
          error: 'Logout failed',
          code: 'SERVER_ERROR' 
        });
      }
    });

    /**
     * Get current user info
     * GET /api/user/me
     */
    this.router.get('/api/user/me', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ 
            error: 'Not authenticated',
            code: 'NOT_AUTHENTICATED' 
          });
        }

        return res.json({ 
          success: true, 
          user: { 
            phoneNumber: req.user.phoneNumber 
          } 
        });
      } catch (error) {
        console.error('Error getting user info:', error);
        return res.status(500).json({ 
          error: 'Failed to get user info',
          code: 'SERVER_ERROR' 
        });
      }
    });

    /**
     * Check authentication status
     * GET /api/user/auth/status
     */
    this.router.get('/api/user/auth/status', async (req: Request, res: Response) => {
      try {
        const token = req.cookies?.userToken;

        if (!token) {
          return res.json({ authenticated: false });
        }

        const result = await this.authService.verifyToken(token);

        return res.json({ 
          authenticated: result.valid,
          phoneNumber: result.phoneNumber 
        });
      } catch (error) {
        console.error('Error checking auth status:', error);
        return res.json({ authenticated: false });
      }
    });
  }
}