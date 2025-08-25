import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { WhatsAppAPIConfig } from '../types/whatsapp';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

export interface MediaInfo {
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  sha256: string;
  type: 'image' | 'audio';
}

export class MediaService {
  private config: WhatsAppAPIConfig;
  private openaiService: OpenAIService | null;

  constructor(config: WhatsAppAPIConfig) {
    this.config = config;

    // Initialize OpenAI service if API key is available
    this.openaiService = null;
    this.initializeOpenAIService();
  }

  async downloadAndSaveMedia(
    mediaId: string,
    mimeType: string,
    sha256: string,
    mediaType: 'image' | 'audio'
  ): Promise<MediaInfo> {
    try {
      // Get media URL from WhatsApp API
      const mediaUrl = `https://graph.facebook.com/${this.config.apiVersion}/${mediaId}`;

      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      const downloadUrl = response.data.url;

      // Download the media file
      const mediaResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(mimeType);
      const timestamp = Date.now();
      const filename = `${mediaType}_${timestamp}_${mediaId.substring(0, 8)}.${extension}`;
      const filepath = path.join('data', 'media', filename);

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save file
      fs.writeFileSync(filepath, mediaResponse.data);

      // Get file stats
      const stats = fs.statSync(filepath);

      return {
        filename,
        filepath,
        mimeType,
        size: stats.size,
        sha256,
        type: mediaType
      };

    } catch (error) {
      console.error('Error downloading media:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to download media: ${errorMessage}`);
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      // Image types
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',

      // Audio types - WhatsApp commonly uses these
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a', // WhatsApp often sends audio as MP4 container
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac',
      'audio/x-wav': 'wav',
      'audio/amr': 'amr', // WhatsApp voice messages often use AMR
      'audio/3gpp': '3gp', // Common mobile audio format

      // Video types (for future expansion)
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
      'video/quicktime': 'mov'
    };

    return mimeToExt[mimeType] || 'bin';
  }

  getMediaInfoResponse(mediaInfo: MediaInfo): string {
    return `📁 Media received!\n\n` +
           `Type: ${mediaInfo.type.toUpperCase()}\n` +
           `Filename: ${mediaInfo.filename}\n` +
           `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
           `MIME Type: ${mediaInfo.mimeType}\n` +
           `SHA256: ${mediaInfo.sha256.substring(0, 12)}...`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async transcribeAudio(audioFilePath: string, language?: string): Promise<string> {
    try {
      const apiUrl = process.env.AUDIO_SERVICE_API_URL;
      const apiKey = process.env.AUDIO_SERVICE_API_KEY;

      if (!apiUrl || !apiKey) {
        throw new Error('Audio transcription service not configured');
      }

      // Read the audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      const fileName = path.basename(audioFilePath);

      // Determine content type based on file extension
      const extension = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'audio/wav';
      if (extension === 'mp3') contentType = 'audio/mpeg';
      else if (extension === 'm4a') contentType = 'audio/mp4';
      else if (extension === 'flac') contentType = 'audio/flac';
      else if (extension === 'ogg') contentType = 'audio/ogg';

      // Create form data
      const form = new FormData();
      form.append('audio_file', audioBuffer, {
        filename: fileName,
        contentType: contentType,
      });

      if (language) {
        form.append('language', language);
      }

      // Make API request to audio service
      const response = await axios.post(`${apiUrl}transcribe`, form, {
        headers: {
          'X-API-Key': apiKey,
          ...form.getHeaders(),
        },
      });
      console.log('response', response);
      // Handle different response formats from audio service
      if (response.data.text) {
        // Direct text response format: { text: "transcribed text" }
        return response.data.text;
      } else if (response.data.success && response.data.text) {
        // Success-based response format: { success: true, text: "transcribed text" }
        return response.data.text;
      } else {
        throw new Error(response.data.error || response.data.detail || 'Transcription failed');
      }

    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  async getTranscriptionResponse(transcribedText: string, mediaInfo: MediaInfo): Promise<string> {
    // Generate enhanced AI response based on the transcription
    const aiResponse = await this.generateAIResponseFromTranscription(transcribedText);

    return `🎤 I heard your audio message!\n\n${aiResponse}\n\n` +
           `Note: This response was generated automatically based on the audio content and may contain inaccuracies.`;
  }

  /**
   * Analyze image content using OpenAI's vision capabilities
   * Returns only the enhanced AI response, not the raw analysis
   */
  async analyzeImageWithOpenAI(imagePath: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      throw new Error('OpenAI service is not configured for image analysis');
    }

    try {
      // Use specialized media image analysis prompt from config if available
      const mediaImagePrompt = this.openaiService.getConfig()?.prompts?.mediaImageAnalysis;
      const analysis = await this.openaiService.analyzeImage(imagePath, mediaImagePrompt);

      // Generate enhanced AI response based on the image analysis
      const aiResponse = await this.generateEnhancedAIResponseFromAnalysis(analysis);

      return aiResponse;
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Generate enhanced AI response based on image analysis with contextual suggestions
   */
  private async generateEnhancedAIResponseFromAnalysis(analysis: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I analyzed the image but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use enhanced image response prompt from config if available
      const enhancedPrompt = this.openaiService.getConfig()?.prompts?.enhancedImageResponse;

      // If no custom prompt is configured, use the default one
      const prompt = enhancedPrompt
        ? enhancedPrompt.replace('{analysis}', analysis)
        : `Based on this detailed image analysis: "${analysis}"

Generate a helpful, engaging, and conversational response with specific contextual awareness:

- If it's a food menu: suggest popular dishes, recommend what to order based on cuisine type, mention any specials or pricing
- If it's a building or landmark: suggest where it might be located, provide architectural details, historical context, and nearby attractions
- If it's a hand holding an object: identify what the object is, suggest its purpose or how to use it, provide related recommendations
- If it's a product: provide recommendations, usage tips, where to buy it, or similar alternatives
- If it's a document or text-heavy: summarize key information clearly, highlight important details, suggest next steps
- If it's nature or scenery: provide interesting facts, travel suggestions, best times to visit, or photography tips
- If it's people or events: provide appropriate commentary, suggest related activities or social context
- If it's artwork or creative content: discuss the style, possible meaning, or artistic techniques

Keep the response natural, conversational, and focused on being genuinely helpful with practical suggestions.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating enhanced AI response from image analysis:', error);
      return 'I analyzed the image but encountered an error generating a response.';
    }
  }

  /**
   * Generate enhanced AI response based on audio transcription
   */
  private async generateAIResponseFromTranscription(transcription: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I transcribed the audio but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use audio transcription response prompt from config if available
      const transcriptionPrompt = this.openaiService.getConfig()?.prompts?.audioTranscriptionResponse;

      // If no custom prompt is configured, use the default one
      const prompt = transcriptionPrompt
        ? transcriptionPrompt.replace('{transcription}', transcription)
        : `Based on this audio transcription: "${transcription}"

Generate a helpful, engaging, and conversational response. Provide thoughtful commentary, answer questions, or continue the conversation naturally based on the audio content. Keep it conversational and focused on being helpful.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating AI response from transcription:', error);
      return 'I transcribed the audio but encountered an error generating a response.';
    }
  }

  /**
   * Enhanced media info response that includes only the AI-generated response
   * without raw analysis details
   */
  getEnhancedMediaInfoResponse(mediaInfo: MediaInfo, aiResponse?: string): string {
    let response = `📁 I received your ${mediaInfo.type}!\n\n`;

    if (aiResponse) {
      response += `${aiResponse}\n\n`;
    } else {
      response += `Type: ${mediaInfo.type.toUpperCase()}\n` +
                  `Filename: ${mediaInfo.filename}\n` +
                  `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
                  `MIME Type: ${mediaInfo.mimeType}`;
    }

    return response;
  }
  /**
   * Initialize OpenAI service asynchronously
   */
  private async initializeOpenAIService(): Promise<void> {
    try {
      // Try to load from config file first
      this.openaiService = await createOpenAIServiceFromConfig();
      console.log('OpenAI service initialized successfully from config file in MediaService');
    } catch (configError) {
      console.warn('Failed to initialize from config file in MediaService, trying legacy environment variables:', configError instanceof Error ? configError.message : `${configError}`);

      // Fall back to environment variables for backward compatibility
      try {
        this.openaiService = createOpenAIServiceFromEnv();
        console.log('OpenAI service initialized successfully from environment variables (legacy mode) in MediaService');
      } catch (envError) {
        console.warn('OpenAI service not available for media analysis:', envError instanceof Error ? envError.message : `${envError}`);
        this.openaiService = null;
      }
    }
  }
}