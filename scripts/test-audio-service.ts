import { MediaService } from '../src/services/mediaService';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock WhatsApp config for testing
const testConfig = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'test-token',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-phone-id',
  apiVersion: 'v19.0'
};

async function testAudioService() {
  console.log('🧪 Testing Audio Service...\n');

  const mediaService = new MediaService(testConfig);

  // Test 1: Check if audio service is configured
  console.log('1. Checking audio service configuration...');
  if (!process.env.AUDIO_SERVICE_API_URL || !process.env.AUDIO_SERVICE_API_KEY) {
    console.log('   ⚠️  Audio service not configured - using mock mode');
    console.log('   ℹ️  Set AUDIO_SERVICE_API_URL and AUDIO_SERVICE_API_KEY in .env to enable transcription\n');
  } else {
    console.log('   ✅ Audio service configured\n');
  }

  // Test 2: Test file size formatting
  console.log('2. Testing file size formatting...');
  const testSizes = [0, 1024, 1048576, 1073741824];
  testSizes.forEach(size => {
    const formatted = mediaService['formatFileSize'](size);
    console.log(`   ${size} bytes → ${formatted}`);
  });
  console.log('');

  // Test 3: Test extension detection
  console.log('3. Testing MIME type to extension conversion...');
  const testMimeTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/mp4',
    'unknown/type'
  ];

  testMimeTypes.forEach(mimeType => {
    const extension = mediaService['getExtensionFromMimeType'](mimeType);
    console.log(`   ${mimeType} → .${extension}`);
  });
  console.log('');

  // Test 4: Test media info response formatting
  console.log('4. Testing media info response formatting...');
  const mockMediaInfo = {
    filename: 'test_audio.mp3',
    filepath: 'data/media/test_audio.mp3',
    mimeType: 'audio/mpeg',
    size: 1048576, // 1MB
    sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    type: 'audio' as const
  };

  const infoResponse = mediaService.getMediaInfoResponse(mockMediaInfo);
  console.log('   Media Info Response:');
  console.log(infoResponse);
  console.log('');

  // Test 5: Test transcription response formatting
  console.log('5. Testing transcription response formatting...');
  const transcribedText = 'This is a test transcription of the audio message.';
  const transcriptionResponse = mediaService.getTranscriptionResponse(transcribedText, mockMediaInfo);
  console.log('   Transcription Response:');
  console.log(transcriptionResponse);
  console.log('');

  console.log('✅ All tests completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   - Configure AUDIO_SERVICE_API_URL and AUDIO_SERVICE_API_KEY in .env');
  console.log('   - Test with actual audio files in data/media/ folder');
  console.log('   - Run the main server to test WhatsApp integration');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run test:audio');
  console.log('Tests the audio service functionality');
  process.exit(0);
}

testAudioService().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});