import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { WhatsAppService } from './services/whatsappService';
import { WebhookRoutes } from './routes/webhook';

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
const webhookRoutes = new WebhookRoutes(
  whatsappService,
  process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
  process.env.WHATSAPP_APP_SECRET || '',
  whatsappConfig
);

// Use routes
app.use('/', webhookRoutes.getRouter());

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