import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import FormData from 'form-data';
import { WhatsAppAPIConfig } from '../types/whatsapp';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

const execAsync = promisify(exec);

export interface MediaInfo {
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  sha256: string;
  type: 'image' | 'audio';
}

// --- NEW: Options for TTS ---
export interface TTSOptions {
  voice?: string;      // e.g., 'af_heart'
  speed?: number;      // e.g., 1.0
  lang_code?: string;  // 'a' (US English), 'b' (UK English), 'z' (Chinese), etc.
  model_repo?: string; // e.g., 'prince-canuma/Kokoro-82M' or 'mlx-community/Spark-TTS...'
}

export class MediaService {
  private config: WhatsAppAPIConfig;
  private openaiService: OpenAIService | null;

  // Known Whisper Hallucinations (Common phrases generated on silence/noise)
  private readonly HALLUCINATIONS = [
    "subtitle by amara.org",
    "subtitles by amara.org",
    "thank you for watching",
    "thanks for watching",
    "you",
    "bye",
    "copyright",
    "all rights reserved",
    "audio",
    "silence"
  ];

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

    // Fix: Handle formats with codecs like "audio/ogg; codecs=opus"
    const cleanMime = mimeType.split(';')[0].trim();
    return mimeToExt[cleanMime] || 'bin';
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
      console.log(`📡 Sending audio to transcription service: ${fileName} (${audioBuffer.length} bytes)`);
      const response = await axios.post(`${apiUrl}transcribe`, form, {
        headers: {
          'X-API-Key': apiKey,
          ...form.getHeaders(),
        },
      });
      
      let rawText = "";
      if (response.data.text) {
        rawText = response.data.text;
      } else if (response.data.success && response.data.text) {
        rawText = response.data.text;
      } else {
        throw new Error(response.data.error || response.data.detail || 'Transcription failed');
      }

      // Filter hallucinations
      const cleanText = this.filterHallucinations(rawText);
      console.log(`📝 Transcription result: "${cleanText}" (Raw: "${rawText}")`);
      
      return cleanText || "[Audio contains no speech or was unintelligible]";

    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  /**
   * Helper to clean up Whisper hallucinations
   */
  private filterHallucinations(text: string): string {
    const lower = text.trim().toLowerCase();
    
    // Check if the entire text is a known hallucination
    if (this.HALLUCINATIONS.some(h => lower === h || lower.startsWith(h))) {
        return "";
    }
    
    // Remove "Subtitle by..." if it appears at the end
    return text.replace(/Subtitles? by .*$/i, "").trim();
  }

  /**
   * NEW: Force convert any audio to standard WAV (16kHz, mono) for best transcription results
   * This fixes issues with WhatsApp OGG/Opus files
   */
  async convertAudioToWav(inputFilePath: string): Promise<string> {
    try {
      // Check if FFmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch (error) {
        console.warn('⚠️ FFmpeg not found. Skipping conversion. Transcription may fail for OGG files.');
        return inputFilePath;
      }

      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.wav`;
      const outputFilePath = path.join('data', 'media', outputFilename);

      // 16kHz sample rate (-ar 16000), mono (-ac 1), 16-bit PCM (default for wav)
      // This is the "Gold Standard" format for Whisper and most STT engines
      const ffmpegCommand = `ffmpeg -i "${inputFilePath}" -ar 16000 -ac 1 -y "${outputFilePath}"`;
      
      console.log(`🔄 Normalizing audio for transcription: ${inputFilePath} -> ${outputFilePath}`);
      const { stderr } = await execAsync(ffmpegCommand);
      
      if (stderr && !fs.existsSync(outputFilePath)) {
          console.warn(`⚠️ FFmpeg warning: ${stderr}`);
      }

      return outputFilePath;
    } catch (error) {
      console.error('Error converting audio to WAV:', error);
      return inputFilePath; // Fallback to original file
    }
  }

  // ==========================================
  //  🆕 NEW METHOD: Synthesize Audio (TTS)
  // ==========================================
  async synthesizeAudio(text: string, options: TTSOptions = {}): Promise<MediaInfo> {
    try {
      const apiUrl = process.env.AUDIO_SERVICE_API_URL;
      const apiKey = process.env.AUDIO_SERVICE_API_KEY;

      if (!apiUrl || !apiKey) {
        throw new Error('Audio service not configured');
      }

      if (!text) {
        throw new Error('Text is required for synthesis');
      }

      // Default Configuration
      const payload = {
        text: text,
        model_repo: options.model_repo || 'prince-canuma/Kokoro-82M', // Default to Kokoro
        voice: options.voice || 'af_heart',
        speed: options.speed || 1.0,
        lang_code: options.lang_code || 'a' // Default US English
      };

      console.log(`Synthesizing audio: "${text.substring(0, 50)}..." with model ${payload.model_repo}`);

      // NOTE: Synthesize endpoint expects JSON, not FormData
      const response = await axios.post(`${apiUrl}synthesize`, payload, {
        responseType: 'arraybuffer', // Critical: We expect a binary WAV file back
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      // Prepare file path
      const timestamp = Date.now();
      const filename = `tts_${timestamp}.wav`;
      const filepath = path.join('data', 'media', filename);

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save the buffer to disk
      fs.writeFileSync(filepath, response.data);
      const stats = fs.statSync(filepath);

      return {
        filename,
        filepath,
        mimeType: 'audio/wav',
        size: stats.size,
        sha256: '', // Not strictly needed for generated content, or calculate if needed
        type: 'audio'
      };

    } catch (error) {
      console.error('Error synthesizing audio:', error);
      
      // Handle axios error response specially to read the text error from arraybuffer
      if (axios.isAxiosError(error) && error.response && error.response.data) {
        const errorBuffer = error.response.data as Buffer;
        const errorText = errorBuffer.toString('utf8');
        throw new Error(`TTS Failed: ${errorText}`);
      }

      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to synthesize audio: ${errorMessage}`);
    }
  }

  /**
   * Convert audio file from WAV to WhatsApp-compatible format (OGG with Opus codec)
   * WhatsApp supports: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
   */
  async convertAudioToWhatsAppFormat(inputFilePath: string, outputFormat: 'ogg' | 'mp3' = 'ogg'): Promise<MediaInfo> {
    try {
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Input file not found: ${inputFilePath}`);
      }

      // Check if FFmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch (error) {
        throw new Error('FFmpeg is not installed or not available in PATH');
      }

      const inputExt = path.extname(inputFilePath).toLowerCase();
      if (inputExt !== '.wav') {
        console.warn(`Warning: Input file is ${inputExt}, expected .wav. Conversion may still work.`);
      }

      // Create output file path
      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.${outputFormat}`;
      const outputFilePath = path.join('data', 'media', outputFilename);

      // Ensure directory exists
      const dir = path.dirname(outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Build FFmpeg command based on output format
      let ffmpegCommand: string;
      let mimeType: string;

      if (outputFormat === 'ogg') {
        // Convert to OGG with Opus codec (WhatsApp's preferred format)
        ffmpegCommand = `ffmpeg -i "${inputFilePath}" -c:a libopus -b:a 64k -ac 1 -vn -y "${outputFilePath}"`;
        mimeType = 'audio/ogg';
      } else {
        // Convert to MP3
        ffmpegCommand = `ffmpeg -i "${inputFilePath}" -c:a libmp3lame -b:a 128k -ac 1 -vn -y "${outputFilePath}"`;
        mimeType = 'audio/mpeg';
      }

      console.log(`Converting audio: ${inputFilePath} -> ${outputFilePath}`);
      console.log(`FFmpeg command: ${ffmpegCommand}`);

      // Execute FFmpeg conversion
      const { stdout, stderr } = await execAsync(ffmpegCommand);

      if (stderr) {
        console.warn('FFmpeg stderr:', stderr);
      }

      // Verify output file was created
      if (!fs.existsSync(outputFilePath)) {
        throw new Error('FFmpeg conversion failed - output file not created');
      }

      const stats = fs.statSync(outputFilePath);
      
      if (stats.size === 0) {
        throw new Error('FFmpeg conversion failed - output file is empty');
      }

      console.log(`✅ Audio conversion successful: ${stats.size} bytes`);

      return {
        filename: outputFilename,
        filepath: outputFilePath,
        mimeType,
        size: stats.size,
        sha256: '', // Not needed for generated content
        type: 'audio'
      };

    } catch (error) {
      console.error('Error converting audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to convert audio: ${errorMessage}`);
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