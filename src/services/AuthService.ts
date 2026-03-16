import { prisma } from '../config/prisma';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Configuration for OTP authentication
 */
const OTP_CONFIG = {
  LENGTH: 6,                    // 6-digit OTP
  EXPIRY_MINUTES: 5,            // OTP valid for 5 minutes
  MAX_REQUESTS_PER_HOUR: 3,     // Rate limiting
  TOKEN_EXPIRY_HOURS: 24,       // JWT token valid for 24 hours
};

/**
 * Rate limiting store (in-memory, should be moved to Redis for production)
 */
const otpRequestCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * AuthService handles OTP-based user authentication via WhatsApp
 */
export class AuthService {
  private jwtSecret: string;
  private whatsappService: any; // WhatsAppService type

  constructor(whatsappService?: any) {
    this.jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-change-in-production';
    this.whatsappService = whatsappService;
  }

  /**
   * Set WhatsAppService instance (for dependency injection)
   */
  setWhatsAppService(service: any): void {
    this.whatsappService = service;
  }

  /**
   * Generate a random OTP code
   */
  private generateOTP(): string {
    // Generate a 6-digit numeric code
    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    return otp;
  }

  /**
   * Hash OTP for storage (security best practice)
   */
  private hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Check rate limiting for OTP requests
   */
  private checkRateLimit(phoneNumber: string): boolean {
    const now = Date.now();
    const record = otpRequestCounts.get(phoneNumber);

    if (!record || now > record.resetAt) {
      // Reset counter for new hour
      otpRequestCounts.set(phoneNumber, {
        count: 1,
        resetAt: now + 60 * 60 * 1000, // 1 hour from now
      });
      return true;
    }

    if (record.count >= OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Request OTP for a phone number
   * Sends the OTP via WhatsApp
   */
  async requestOTP(phoneNumber: string): Promise<{ success: boolean; message: string; expiresIn?: number }> {
    // Check rate limiting
    if (!this.checkRateLimit(phoneNumber)) {
      return {
        success: false,
        message: 'Too many OTP requests. Please try again later.',
      };
    }

    // Generate OTP
    const otp = this.generateOTP();
    const hashedOTP = this.hashOTP(otp);
    const otpExpires = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

    try {
      // Delete any existing sessions for this phone number
      await prisma.userSession.deleteMany({
        where: { phoneNumber },
      });

      // Create new session with OTP
      await prisma.userSession.create({
        data: {
          phoneNumber,
          otpCode: hashedOTP,
          otpExpires,
        },
      });

      // Send OTP via WhatsApp
      if (this.whatsappService) {
        const message = `Your verification code is: ${otp}\n\nThis code will expire in ${OTP_CONFIG.EXPIRY_MINUTES} minutes.\n\nIf you didn't request this code, please ignore this message.`;
        await this.whatsappService.sendMessage(phoneNumber, message);
      } else {
        // Log OTP in development mode
        console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
      }

      return {
        success: true,
        message: 'OTP sent successfully',
        expiresIn: OTP_CONFIG.EXPIRY_MINUTES * 60,
      };
    } catch (error) {
      console.error('Error requesting OTP:', error);
      return {
        success: false,
        message: 'Failed to send OTP. Please try again.',
      };
    }
  }

  /**
   * Verify OTP and generate session token
   */
  async verifyOTP(phoneNumber: string, otp: string): Promise<{ success: boolean; token?: string; message: string }> {
    try {
      // Find the session
      const session = await prisma.userSession.findFirst({
        where: {
          phoneNumber,
          otpExpires: { gt: new Date() }, // OTP not expired
        },
      });

      if (!session) {
        return {
          success: false,
          message: 'Invalid or expired OTP. Please request a new one.',
        };
      }

      // Verify OTP
      const hashedOTP = this.hashOTP(otp);
      if (session.otpCode !== hashedOTP) {
        return {
          success: false,
          message: 'Invalid OTP. Please try again.',
        };
      }

      // Generate JWT token
      const token = jwt.sign(
        { phoneNumber, id: session.id },
        this.jwtSecret,
        { expiresIn: `${OTP_CONFIG.TOKEN_EXPIRY_HOURS}h` }
      );

      // Update session with token
      const tokenExpires = new Date(Date.now() + OTP_CONFIG.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          token,
          tokenExpires,
          otpCode: '', // Clear OTP after successful verification
        },
      });

      return {
        success: true,
        token,
        message: 'Verification successful',
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'Verification failed. Please try again.',
      };
    }
  }

  /**
   * Verify JWT token and get user info
   */
  async verifyToken(token: string): Promise<{ valid: boolean; phoneNumber?: string; message: string }> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, this.jwtSecret) as { phoneNumber: string; id: string };
      
      // Check if session exists and is valid
      const session = await prisma.userSession.findFirst({
        where: {
          id: decoded.id,
          phoneNumber: decoded.phoneNumber,
          token,
          tokenExpires: { gt: new Date() },
        },
      });

      if (!session) {
        return {
          valid: false,
          message: 'Session expired. Please login again.',
        };
      }

      return {
        valid: true,
        phoneNumber: decoded.phoneNumber,
        message: 'Token is valid',
      };
    } catch (error) {
      return {
        valid: false,
        message: 'Invalid token. Please login again.',
      };
    }
  }

  /**
   * Logout - invalidate session
   */
  async logout(token: string): Promise<{ success: boolean; message: string }> {
    try {
      await prisma.userSession.deleteMany({
        where: { token },
      });

      return {
        success: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      console.error('Error during logout:', error);
      return {
        success: false,
        message: 'Logout failed',
      };
    }
  }

  /**
   * Get user info from token
   */
  async getUserFromToken(token: string): Promise<{ phoneNumber: string } | null> {
    const result = await this.verifyToken(token);
    if (result.valid && result.phoneNumber) {
      return { phoneNumber: result.phoneNumber };
    }
    return null;
  }

  /**
   * Clean up expired sessions (should be called periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { otpExpires: { lt: new Date() } },
            { tokenExpires: { lt: new Date() } },
          ],
        },
      });
      return result.count;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      return 0;
    }
  }
}