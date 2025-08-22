import { MediaService } from '../src/services/mediaService';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Mock config for testing (no WhatsApp API calls needed)
const testConfig = {
  accessToken: 'test-token-only',
  phoneNumberId: 'test-phone-id-only',
  apiVersion: 'v19.0'
};

async function testTranscriptionOnly() {
  console.log('🎤 Testing Audio Transcription Only...\n');

  const mediaService = new MediaService(testConfig);

  // Check if audio service is configured
  console.log('1. Checking audio service configuration...');
  if (!process.env.AUDIO_SERVICE_API_URL || !process.env.AUDIO_SERVICE_API_KEY) {
    console.log('   ⚠️  Audio service not configured');
    console.log('   ℹ️  Set these in .env to test transcription:');
    console.log('      AUDIO_SERVICE_API_URL=https://your-audio-service.com/');
    console.log('      AUDIO_SERVICE_API_KEY=your-api-key-here\n');
  } else {
    console.log('   ✅ Audio service configured\n');
  }

  // Check for audio files in data/media
  const mediaDir = 'data/media';
  if (!fs.existsSync(mediaDir)) {
    console.log('❌ No media directory found.');
    console.log('   Place audio files in data/media/ folder to test transcription\n');
    return;
  }

  const files = fs.readdirSync(mediaDir);
  const audioFiles = files.filter(file =>
    file.startsWith('audio_') &&
    (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.m4a') || file.endsWith('.ogg'))
  );

  if (audioFiles.length === 0) {
    console.log('ℹ️  No audio files found in data/media/');
    console.log('   Add some audio files to test transcription\n');
    return;
  }

  console.log(`📁 Found ${audioFiles.length} audio file(s) for transcription testing:\n`);

  for (const audioFile of audioFiles) {
    const filePath = path.join(mediaDir, audioFile);
    const stats = fs.statSync(filePath);

    console.log(`🔊 Testing file: ${audioFile}`);
    console.log(`   Size: ${mediaService['formatFileSize'](stats.size)}`);
    console.log(`   Path: ${filePath}`);

    if (process.env.AUDIO_SERVICE_API_URL && process.env.AUDIO_SERVICE_API_KEY) {
      console.log('   🎤 Attempting transcription...');

      try {
        const transcribedText = await mediaService.transcribeAudio(filePath);
        console.log('   ✅ Transcription successful!');
        console.log(`   📝 Text: "${transcribedText}"\n`);

        // Test the response formatting
        const mediaInfo = {
          filename: audioFile,
          filepath: filePath,
          mimeType: 'audio/mpeg',
          size: stats.size,
          sha256: 'test_hash_for_transcription_demo',
          type: 'audio' as const
        };

        const response = mediaService.getTranscriptionResponse(transcribedText, mediaInfo);
        console.log('   💬 Formatted WhatsApp response:');
        console.log(response);
        console.log('');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : `${error}`;
        console.log('   ❌ Transcription failed:', errorMessage);
        console.log('   ℹ️  Check your audio service configuration and network connection\n');
      }
    } else {
      console.log('   ⚠️  Audio service not configured - skipping transcription');
      console.log('   ℹ️  Set AUDIO_SERVICE_API_URL and AUDIO_SERVICE_API_KEY in .env\n');
    }
  }

  console.log('✅ Transcription testing completed!');
  console.log('\n📋 Next steps:');
  console.log('   1. Configure audio service in .env file');
  console.log('   2. Add audio files to data/media/ folder');
  console.log('   3. Run this test again: npm run test:transcription');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run test:transcription');
  console.log('Tests audio transcription functionality only (no WhatsApp API calls)');
  console.log('Requires audio files in data/media/ folder and audio service configuration');
  process.exit(0);
}

testTranscriptionOnly().catch(error => {
  console.error('❌ Transcription test failed:', error);
  process.exit(1);
});