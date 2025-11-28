import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { startAutonomousAgent } from './autonomous';
import { DashboardRoutes } from './routes/dashboard';
import { WebhookRoutes } from './routes/webhook';

/**
 * Main server that integrates both autonomous agent and web dashboard
 */
class AutonomousServer {
  private app: express.Application;
  private port: number;
  private dashboardRoutes: DashboardRoutes;
  private webhookRoutes?: WebhookRoutes;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.dashboardRoutes = new DashboardRoutes();
    
    this.setupMiddleware();
    // Note: setupRoutes() will be called after agent initialization in start() method
  }

  private setupMiddleware(): void {
    // Cookie parser middleware
    this.app.use(cookieParser());
    
    // JSON parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    
    // URL-encoded parsing middleware
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS middleware for web interface
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // Dashboard routes (web interface)
    this.app.use('/', this.dashboardRoutes.getRouter());
    
    // Webhook routes (WhatsApp integration) - only if not in dev mode
    if (process.env.DEV_MODE !== 'true') {
      // Initialize WhatsApp webhook routes if configured
      const whatsappConfig = {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        apiVersion: 'v19.0'
      };
      
      if (whatsappConfig.accessToken && whatsappConfig.phoneNumberId) {
        const { WhatsAppService } = require('./services/whatsappService');
        const { MediaService } = require('./services/mediaService');
        
        const whatsappService = new WhatsAppService(whatsappConfig);
        const mediaService = new MediaService(whatsappConfig);
        
        this.webhookRoutes = new WebhookRoutes(
          whatsappService,
          process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
          process.env.WHATSAPP_APP_SECRET || '',
          whatsappConfig
        );
        
        this.app.use('/webhook', this.webhookRoutes.getRouter());
        console.log('✅ WhatsApp webhook routes enabled');
      } else {
        console.log('⚠️ WhatsApp webhook routes disabled - missing configuration');
      }
    } else {
      console.log('💡 Development mode - WhatsApp webhook routes disabled');
    }

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        endpoints: {
          dashboard: '/',
          status: '/api/status',
          chat: '/api/chat',
          activity: '/api/activity',
          memory: '/api/memory/{context|knowledge|history}',
          health: '/health'
        }
      });
    });
  }

  /**
   * Start the server and autonomous agent
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Autonomous WhatsApp Agent Server...');
      
      // Start the autonomous agent first
      await startAutonomousAgent();
      
      // Now set up routes after agent is initialized
      this.setupRoutes();
      
      // Determine host based on environment variable or fallback to 0.0.0.0 for external access
      const host = process.env.HOST || '0.0.0.0';
      
      // Start the HTTP server
      this.app.listen(this.port, host, () => {
        console.log('\n' + '='.repeat(60));
        console.log('🤖 AUTONOMOUS SERVER STARTED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📍 Server Host: ${host}`);
        console.log(`📍 Server Port: ${this.port}`);
        
        // Show appropriate URLs based on host binding
        if (host === '0.0.0.0') {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port} (local)`);
          console.log(`🌐 Web Dashboard: http://[your-ip]:${this.port} (network)`);
        } else {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port}`);
        }
        
        if (process.env.DEV_MODE === 'true') {
          console.log('\n💡 DEVELOPMENT MODE ACTIVATED');
          console.log('📱 Messages will be logged to console');
          console.log('🚫 No messages will be sent to WhatsApp');
        } else {
          console.log('\n⚡ PRODUCTION MODE');
          console.log('📱 Messages will be sent to WhatsApp');
        }
        
        if (this.webhookRoutes) {
          if (host === '0.0.0.0') {
            console.log(`🔗 Webhook URL: http://[your-ip]:${this.port}/webhook`);
          } else {
            console.log(`🔗 Webhook URL: http://localhost:${this.port}/webhook`);
          }
        }
        
        console.log(`❤️  Health Check: http://localhost:${this.port}/health`);
        console.log('='.repeat(60) + '\n');
      });

    } catch (error) {
      console.error('❌ Failed to start autonomous server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  stop(): void {
    console.log('🛑 Stopping autonomous server...');
    process.exit(0);
  }
}

// Export for testing and manual control
export { AutonomousServer };

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new AutonomousServer();
  server.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => server.stop());
  process.on('SIGTERM', () => server.stop());
}