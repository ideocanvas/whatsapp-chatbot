import axios from 'axios';
import { WhatsAppResponse, WhatsAppAPIConfig } from '../types/whatsapp';

export class WhatsAppService {
  private config: WhatsAppAPIConfig;
  private devMode: boolean;

  constructor(config: WhatsAppAPIConfig, devMode: boolean = false) {
    this.config = config;
    this.devMode = devMode;
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message would be sent to ${to}:`);
        console.log(`💬 ${message}`);
        console.log('---');
        return true;
      }

      const response: WhatsAppResponse = {
        messaging_product: 'whatsapp',
        to,
        text: {
          body: message
        }
      };

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, response, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message ${messageId} would be marked as read`);
        return true;
      }

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message ${messageId} marked as read`);
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }
}