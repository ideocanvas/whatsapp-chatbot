import { Router, Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsappService';
import { MediaService } from '../services/mediaService';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { CryptoUtils } from '../utils/crypto';
import { WhatsAppMessage } from '../types/whatsapp';
import { getToolSchemas } from '../tools';
// Import the Autonomous Agent getter
import { getAutonomousAgent } from '../autonomous';

export class WebhookRoutes {
  private router: Router;
  private processedMessageService: ProcessedMessageServicePostgres;
  private whatsappService: WhatsAppService; // Added property
  private verifyToken: string;
  private appSecret: string;

  constructor(whatsappService: WhatsAppService, verifyToken: string, appSecret: string, whatsappConfig: any) {
    this.router = Router();
    this.processedMessageService = new ProcessedMessageServicePostgres();
    this.whatsappService = whatsappService; // Store the service instance
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Webhook verification endpoint (GET)
    this.router.get('/', (req: Request, res: Response) => {
      this.handleWebhookVerification(req, res);
    });

    // Webhook message handler (POST)
    this.router.post('/', (req: Request, res: Response) => {
      this.handleWebhookMessage(req, res);
    });

    // Health check endpoint (webhook-specific)
    this.router.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        service: 'webhook',
        timestamp: new Date().toISOString()
      });
    });

    // Dev mode API endpoint (only available in dev mode)
    if (process.env.DEV_MODE === 'true') {
      this.router.post('/dev/message', (req: Request, res: Response) => {
        this.handleDevMessage(req, res);
      });
    }
  }

  private handleWebhookVerification(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Log verification attempt for debugging
    console.log(`Webhook Verification: Mode=${mode}, Token=${token?.toString().substring(0,3)}...`);

    if (mode && token) {
      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('✅ Webhook verified successfully!');
        // WhatsApp expects the challenge string directly, not JSON
        res.status(200).send(challenge);
      } else {
        console.warn('❌ Webhook verification failed! Token mismatch.');
        res.sendStatus(403);
      }
    } else {
        res.sendStatus(400);
    }
  }

  private async handleWebhookMessage(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature if app secret is provided
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        // FIX: Use rawBody captured by middleware in server.ts
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);
        
        if (!CryptoUtils.verifySignature(this.appSecret, rawBody, signature)) {
          console.warn('Invalid webhook signature');
          res.sendStatus(401);
          return;
        }
      }

      const data: WhatsAppMessage = req.body;

      if (!data.entry || !Array.isArray(data.entry)) {
          res.sendStatus(200);
          return;
      }

      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;

            if (messages && messages.length > 0) {
              for (const message of messages) {
                // Mark message as read immediately
                if (this.whatsappService) {
                    await this.whatsappService.markMessageAsRead(message.id);
                }

                // Check if this message has already been processed
                const alreadyProcessed = await this.processedMessageService.hasMessageBeenProcessed(message.id);
                if (alreadyProcessed) continue;

                // Mark message as processed
                await this.processedMessageService.markMessageAsProcessed(
                  message.id,
                  message.from,
                  message.type
                );

                const agent = getAutonomousAgent();

                if (message.type === 'text' && message.text) {
                  // Text Message
                  agent.handleIncomingMessage(
                    message.from,
                    message.text.body,
                    message.id
                  ).catch(err => console.error('Agent text processing error:', err));

                } else if (message.type === 'image' && message.image) {
                  // Image Message
                  console.log(`🖼️ Processing image message from ${message.from}`);
                  
                  // Extract caption if available
                  const caption = message.image.caption;
                  
                  agent.handleImageMessage(
                    message.from,
                    message.image.id,
                    message.image.mime_type,
                    message.image.sha256,
                    caption
                  ).catch(err => console.error('Agent image processing error:', err));

                } else if (message.type === 'audio' && message.audio) {
                  console.log(`🎤 Audio message from ${message.from} (ID: ${message.audio.id})`);
                  console.log('⚠️ Audio processing not yet implemented in autonomous agent');
                } else {
                  console.log(`Unsupported message type: ${message.type}`);
                }
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.sendStatus(500);
    }
  }

  private async handleDevMessage(req: Request, res: Response): Promise<void> {
    try {
      const { message, from = 'dev-user', type = 'text', imagePath, audioPath } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      console.log(`📱 [DEV API] Received ${type} message from ${from}: "${message}"`);

      let response: string;

      if (type === 'image' && imagePath) {
        console.log(`🖼️ Processing local image: ${imagePath}`);
        // TODO: Implement image processing in autonomous agent
        response = "Image processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else if (type === 'audio' && audioPath) {
        console.log(`🎤 Processing local audio: ${audioPath}`);
        // TODO: Implement audio processing in autonomous agent
        response = "Audio processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else {
        // Process text message using the autonomous agent
        const agent = getAutonomousAgent();
        response = await agent.handleWebMessage(from, message);
      }

      console.log(`🤖 [DEV API] Response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);

      // Return the response directly as JSON
      res.status(200).json({
        success: true,
        message: message,
        response: response,
        from: from,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing dev message:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}