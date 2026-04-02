import { BaseTool } from '../core/BaseTool';
import { MediaService } from '../services/MediaService';
import { WhatsAppService } from '../services/WhatsAppService';

const MAX_CHARS_PER_NOTE = 300;
const MIN_CHUNK_SIZE = 50;

export class SendVoiceTool extends BaseTool {
  name = 'send_voice';
  description = `Send a voice/audio response to the user via WhatsApp voice note. Use this when the user explicitly asks you to reply with voice, speak, use audio, or send a voice note. Do NOT use this for normal text conversations - only when the user requests an audio response. Prefer keeping your message under ${MAX_CHARS_PER_NOTE} characters for best results.`;

  parameters = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: `The exact text to speak in the voice note. Keep it under ${MAX_CHARS_PER_NOTE} characters. If your full answer is longer, the system will automatically split it into multiple voice notes at sentence boundaries.`
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
    const chunks = this.splitIntoChunks(textToSpeak);

    if (chunks.length === 1) {
      const success = await this.sendSingleVoiceNote(chunks[0]);
      if (!success) {
        return 'Failed to upload audio. Respond with your answer as text instead.';
      }
    } else {
      console.log(`🗣️ Splitting voice response into ${chunks.length} notes for ${this.userId}`);
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
        const success = await this.sendSingleVoiceNote(chunks[i]);
        if (!success) {
          return `Failed to upload audio chunk ${i + 1}. Respond with your answer as text instead.`;
        }
      }
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
    console.log(`✅ Voice note(s) sent to ${this.userId}`);
    return 'Voice message sent successfully. Respond with exactly: [VOICE_RESPONSE_SENT]';
  }

  private async sendSingleVoiceNote(text: string): Promise<boolean> {
    try {
      const audioResponse = await this.mediaService!.synthesizeAudio(text, {
        voice: 'af_heart',
        speed: 1.0
      });

      const convertedAudio = await this.mediaService!.convertAudioToWhatsAppFormat(audioResponse.filepath, 'ogg');
      const uploadedMediaId = await this.whatsapp!.uploadMedia(convertedAudio.filepath, convertedAudio.mimeType);

      if (uploadedMediaId) {
        if (process.env.DEV_MODE !== 'true') {
          await this.whatsapp!.sendAudioMessage(this.userId!, uploadedMediaId);
        }
        console.log(`✅ Voice note chunk sent (${text.length} chars)`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to send voice note chunk:', error);
      return false;
    }
  }

  private splitIntoChunks(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_NOTE) {
      return [text];
    }

    const sentences = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length <= MAX_CHARS_PER_NOTE) {
        current += sentence;
      } else {
        if (current.length >= MIN_CHUNK_SIZE) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
          if (current.length > MAX_CHARS_PER_NOTE) {
            const hardSplit = Math.floor(MAX_CHARS_PER_NOTE / 2);
            chunks.push(current.substring(0, hardSplit).trim());
            current = current.substring(hardSplit);
          }
        }
      }
    }

    if (current.trim().length > 0) {
      if (current.length < MIN_CHUNK_SIZE && chunks.length > 0) {
        chunks[chunks.length - 1] = (chunks[chunks.length - 1] + ' ' + current).trim();
      } else {
        chunks.push(current.trim());
      }
    }

    return chunks;
  }
}
