import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { WebhookRoutes } from './routes/webhook';
import { WhatsAppService } from './services/whatsappService';
import { newsScrapeService, initializeTools } from './tools/index'; // Import service
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { MediaService } from './services/mediaService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const devMode = process.env.DEV_MODE === 'true';

// Middleware
app.use(bodyParser.json({ verify: (req, res, buf) => {
  (req as any).rawBody = buf;
} }));

// WhatsApp API configuration
const whatsappConfig = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  apiVersion: 'v19.0'
};

// Validate required environment variables only if not in dev mode
if (!devMode && (!whatsappConfig.accessToken || !whatsappConfig.phoneNumberId)) {
  console.error('Missing required environment variables: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
  process.exit(1);
}

// Initialize services
const whatsappService = new WhatsAppService(whatsappConfig, devMode);
const mediaService = new MediaService(whatsappConfig);
const webhookRoutes = new WebhookRoutes(
  whatsappService,
  process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
  process.env.WHATSAPP_APP_SECRET || '',
  whatsappConfig
);

// Use routes
app.use('/', webhookRoutes.getRouter());

// Initialize tools and start background service
async function initializeBackgroundService() {
  try {
    // Initialize Google Search service if API keys are available
    let googleSearchService: GoogleSearchService | null = null;
    try {
      googleSearchService = createGoogleSearchServiceFromEnv();
      console.log('✅ Google Search service initialized successfully');
    } catch (error) {
      console.warn('⚠️ Google Search service not available:', error instanceof Error ? error.message : `${error}`);
      googleSearchService = null;
    }

    // Initialize tools if Google Search service is available
    if (googleSearchService) {
      initializeTools(googleSearchService, mediaService);
      console.log('✅ Tools initialized successfully');
      
      // Start background service after tools are initialized
      if (newsScrapeService) {
        console.log('🕰️ Starting Background News Service (Every 30 mins)');
        newsScrapeService.startBackgroundService(30); // Runs every 30 mins
      } else {
        console.warn('⚠️ News scrape service not available');
      }
    } else {
      console.warn('⚠️ Tools not initialized - Google Search service unavailable');
    }
  } catch (error) {
    console.error('❌ Failed to initialize background service:', error);
  }
}

// Start background service initialization after server settles
setTimeout(() => {
  initializeBackgroundService();
}, 5000);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WhatsApp ChatBot Server Started');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${port}`);

  if (devMode) {
    console.log('\n' + '💡'.repeat(20));
    console.log('💡 DEVELOPMENT MODE ACTIVATED');
    console.log('💡'.repeat(20));
    console.log('📱 Messages will be printed to console');
    console.log('🚫 No messages will be sent to WhatsApp');
    console.log('💡 No API credentials required');
    console.log('💡'.repeat(20));
    console.log('\n Usage: npm run dev:test -- send "Your message"');
    console.log('📝 Interactive: npm run dev:test interactive');
  } else {
    console.log('\n⚡ Production Mode - Messages will be sent to WhatsApp');
  }

  console.log('\n🌐 Webhook URL:', `${process.env.WEBHOOK_URL || `http://localhost:${port}`}/webhook`);
  console.log('❤️  Health check:', `${process.env.WEBHOOK_URL || `http://localhost:${port}`}/health`);
  console.log('='.repeat(60) + '\n');
});