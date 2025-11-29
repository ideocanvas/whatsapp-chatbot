import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
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

  /**
   * NEW: Upload media file to WhatsApp Cloud API
   */
  async uploadMedia(filePath: string, mimeType: string): Promise<string | null> {
    if (this.devMode) return 'dev-media-id';

    try {
      const data = new FormData();
      data.append('messaging_product', 'whatsapp');
      data.append('file', fs.createReadStream(filePath));
      data.append('type', mimeType);

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/media`;

      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          ...data.getHeaders()
        }
      });

      return response.data.id;
    } catch (error) {
      console.error('❌ Error uploading media to WhatsApp:', error);
      return null;
    }
  }

  /**
   * NEW: Send an audio message via WhatsApp
   */
  async sendAudioMessage(to: string, mediaId: string): Promise<boolean> {
    if (this.devMode) {
      console.log(`📱 [DEV MODE] Audio sent to ${to} (Media ID: ${mediaId})`);
      return true;
    }

    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'audio',
        audio: {
          id: mediaId
        }
      };

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`🎤 Audio message sent to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending audio message:', error);
      return false;
    }
  }
}