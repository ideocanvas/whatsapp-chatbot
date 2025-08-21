import { Router, Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsappService';
import { MessageHandler } from '../handlers/messageHandler';
import { MediaService } from '../services/mediaService';
import { ProcessedMessageService } from '../services/processedMessageService';
import { CryptoUtils } from '../utils/crypto';
import { WhatsAppMessage } from '../types/whatsapp';

export class WebhookRoutes {
  private router: Router;
  private messageHandler: MessageHandler;
  private processedMessageService: ProcessedMessageService;
  private verifyToken: string;
  private appSecret: string;

  constructor(whatsappService: WhatsAppService, verifyToken: string, appSecret: string, whatsappConfig: any) {
    this.router = Router();
    const mediaService = new MediaService(whatsappConfig);
    this.messageHandler = new MessageHandler(whatsappService, mediaService);
    this.processedMessageService = new ProcessedMessageService();
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Webhook verification endpoint (GET)
    this.router.get('/webhook', (req: Request, res: Response) => {
      this.handleWebhookVerification(req, res);
    });

    // Webhook message handler (POST)
    this.router.post('/webhook', (req: Request, res: Response) => {
      this.handleWebhookMessage(req, res);
    });

    // Health check endpoint
    this.router.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
    });
  }

  private handleWebhookVerification(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token) {
      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('Webhook verified successfully!');
        res.status(200).send(challenge);
      } else {
        console.log('Webhook verification failed!');
        res.sendStatus(403);
      }
    }
  }

  private async handleWebhookMessage(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature if app secret is provided
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        // Use raw body for signature verification (stored by body-parser middleware)
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);
        if (!CryptoUtils.verifySignature(this.appSecret, rawBody, signature)) {
          console.warn('Invalid webhook signature');
          res.sendStatus(401);
          return;
        }
      }

      const data: WhatsAppMessage = req.body;

      // Process each entry
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;

            if (messages && messages.length > 0) {
              for (const message of messages) {
                // Check if this message has already been processed
                const alreadyProcessed = await this.processedMessageService.hasMessageBeenProcessed(message.id);

                if (alreadyProcessed) {
                  console.log(`Skipping duplicate message: ${message.id} (already processed)`);
                  continue;
                }

                // Mark message as processed immediately to prevent race conditions
                await this.processedMessageService.markMessageAsProcessed(
                  message.id,
                  message.from,
                  message.type
                );

                if (message.type === 'text' && message.text) {
                  await this.messageHandler.processMessage(
                    message.from,
                    message.text.body,
                    message.id,
                    'text'
                  );
                } else if (message.type === 'image' && message.image) {
                  await this.messageHandler.processMessage(
                    message.from,
                    '',
                    message.id,
                    'image',
                    {
                      id: message.image.id,
                      mimeType: message.image.mime_type,
                      sha256: message.image.sha256,
                      type: 'image'
                    }
                  );
                } else if (message.type === 'audio' && message.audio) {
                  await this.messageHandler.processMessage(
                    message.from,
                    '',
                    message.id,
                    'audio',
                    {
                      id: message.audio.id,
                      mimeType: message.audio.mime_type,
                      sha256: message.audio.sha256,
                      type: 'audio'
                    }
                  );
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

  getRouter(): Router {
    return this.router;
  }
}