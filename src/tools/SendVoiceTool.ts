import { BaseTool } from '../core/BaseTool';
import { MediaService } from '../services/MediaService';
import { WhatsAppService } from '../services/WhatsAppService';

export class SendVoiceTool extends BaseTool {
  name = 'send_voice';
  description = `Send a voice/audio response to the user via WhatsApp voice note. Use this when the user explicitly asks you to reply with voice, speak, use audio, or send a voice note. Do NOT use this for normal text conversations - only when the user requests an audio response.`;

  parameters = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The exact text to speak in the voice note. This should be your full response to the user.'
      }
    },
    required: ['message'],
    additionalProperties: false,
  };

  private mediaService?: MediaService;
  private whatsapp?: WhatsAppService;
  private userId?: string;
  voiceWasSent = false;

  setMediaService(mediaService: MediaService): void {
    this.mediaService = mediaService;
  }

  setWhatsApp(whatsapp: WhatsAppService): void {
    this.whatsapp = whatsapp;
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  async execute(args: { message: string }): Promise<string> {
    if (!this.userId) {
      return 'Error: No user ID context.';
    }
    if (!this.mediaService || !this.whatsapp) {
      return 'Error: MediaService or WhatsAppService not configured.';
    }

    const textToSpeak = args.message;

    try {
      console.log(`🗣️ Synthesizing voice response for ${this.userId}...`);
      const audioResponse = await this.mediaService.synthesizeAudio(textToSpeak, {
        voice: 'af_heart',
        speed: 1.0
      });

      console.log(`🔄 Converting audio to WhatsApp format...`);
      const convertedAudio = await this.mediaService.convertAudioToWhatsAppFormat(audioResponse.filepath, 'ogg');

      const uploadedMediaId = await this.whatsapp.uploadMedia(convertedAudio.filepath, convertedAudio.mimeType);

      if (uploadedMediaId) {
        if (process.env.DEV_MODE !== 'true') {
          await this.whatsapp.sendAudioMessage(this.userId, uploadedMediaId);
        }

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = textToSpeak.match(urlRegex);

        if (links && links.length > 0) {
          const uniqueLinks = [...new Set(links)];
          const linkMessage = `*Links mentioned:*\n${uniqueLinks.join('\n')}`;
          console.log(`🔗 Link(s) detected in voice response, sending text fallback to ${this.userId}`);
          await new Promise(resolve => setTimeout(resolve, 800));
          if (process.env.DEV_MODE !== 'true') {
            await this.whatsapp.sendMessage(this.userId, linkMessage);
          }
        }

        this.voiceWasSent = true;
        console.log(`✅ Voice note sent to ${this.userId}`);
        return 'Voice message sent successfully. Respond with exactly: [VOICE_RESPONSE_SENT]';
      }

      return 'Failed to upload audio. Respond with your answer as text instead.';
    } catch (error) {
      console.error('❌ send_voice tool failed:', error);
      return 'Voice synthesis failed. Respond with your answer as text instead.';
    }
  }
}
