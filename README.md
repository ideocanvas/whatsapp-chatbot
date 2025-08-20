# WhatsApp ChatBot (TypeScript)

A TypeScript-based WhatsApp chat bot that integrates with Facebook's WhatsApp Business API to receive and respond to messages.

## Features

- ✅ Receive WhatsApp messages via webhooks
- ✅ Send automated responses to users
- ✅ Message read receipts
- ✅ Signature verification for security
- ✅ TypeScript support with proper type definitions
- ✅ Express.js HTTP server
- ✅ Environment configuration
- ✅ Basic chatbot responses
- ✅ Image file support (download and info)
- ✅ Audio file support (download and transcription)
- ✅ Media file storage and management

## Prerequisites

Before running this bot, you need:

1. **Facebook Developer Account**: Create an app at https://developers.facebook.com
2. **WhatsApp Business Account**: Set up a WhatsApp Business account
3. **Access Token**: Get your access token from Facebook Developer Console
4. **Phone Number ID**: Get your WhatsApp phone number ID
5. **Webhook URL**: A publicly accessible HTTPS URL (use ngrok for development)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd whatsapp-chatbot

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

## Configuration

Edit the `.env` file with your WhatsApp Business API credentials:

```env
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=your_verify_token_here
WHATSAPP_APP_SECRET=your_app_secret_here

# Server Configuration
PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook

# Audio Transcription Service (Optional)
AUDIO_SERVICE_API_URL=https://api.example.com/audio/
AUDIO_SERVICE_API_KEY=your_audio_service_api_key_here
```

## Development Setup

### Using ngrok for local development

1. Install ngrok: https://ngrok.com/download
2. Start ngrok:
   ```bash
   ngrok http 3000
   ```
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. Update your `.env` file: `WEBHOOK_URL=https://abc123.ngrok.io`

### Running the bot

```bash
# Development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Watch mode
npm run watch

# Test audio service functionality
npm run test:audio

# Test audio integration with actual files
npm run test:audio:integration
```

## WhatsApp API Setup

1. **Create Facebook App**:
   - Go to https://developers.facebook.com/apps
   - Create a new app with "Business" type
   - Add WhatsApp product

2. **Configure Webhook**:
   - In your Facebook app, go to WhatsApp > Configuration
   - Set webhook URL: `https://your-domain.com/webhook`
   - Set verify token (must match WHATSAPP_VERIFY_TOKEN in .env)
   - Subscribe to `messages` webhook field

3. **Test the bot**:
   - Send a message to your WhatsApp number
   - The bot should respond automatically

## API Endpoints

- **GET /webhook**: Webhook verification endpoint
- **POST /webhook**: Main webhook handler for WhatsApp messages
- **GET /health**: Health check endpoint

## Bot Commands

The bot responds to these commands:

- `hello` - Welcome message
- `help` - List of available commands
- `time` - Current time
- `info` - Information about the bot

## Media Support

The bot now supports receiving and processing media files:

### Image Files
- ✅ Download and save images to `data/media/` folder
- ✅ Respond with file information (filename, size, MIME type, SHA256 hash)
- ✅ Support for JPEG, PNG, GIF, WebP formats

### Audio Files
- ✅ Download and save audio files to `data/media/` folder
- ✅ Respond with file information
- ✅ Optional audio transcription (requires external service)
- ✅ Support for MP3, WAV, OGG, M4A, AAC formats

### Audio Transcription
To enable audio transcription, configure these environment variables:
```env
AUDIO_SERVICE_API_URL=https://your-audio-service.com/
AUDIO_SERVICE_API_KEY=your-api-key-here
```

The bot will attempt to transcribe audio files and include the transcribed text in the response.

## Project Structure

```
whatsapp-chatbot/
├── src/
│   ├── types/
│   │   └── whatsapp.ts         # TypeScript interfaces
│   ├── services/
│   │   ├── whatsappService.ts  # WhatsApp API client
│   │   └── mediaService.ts     # Media download and processing
│   ├── handlers/
│   │   └── messageHandler.ts   # Message processing logic
│   ├── utils/
│   │   └── crypto.ts           # Signature verification
│   ├── routes/
│   │   └── webhook.ts          # Express routes
│   └── index.ts                # Main entry point
├── data/
│   └── media/                  # Storage for received media files
├── scripts/
│   ├── test-audio-service.ts   # Audio service testing
│   └── test-audio-integration.ts # Integration testing
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Security Features

- **Signature Verification**: Validates webhook requests using HMAC-SHA256
- **Environment Variables**: Sensitive credentials stored in .env file
- **HTTPS Required**: Webhook only works with HTTPS URLs

## Error Handling

The bot includes comprehensive error handling:
- Invalid webhook signatures
- Missing environment variables
- API request failures
- Message processing errors

## Production Deployment

### Docker (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
WEBHOOK_URL=https://your-production-domain.com
```

## Testing Audio Service

### Basic Testing
```bash
npm run test:audio
```
Tests the audio service functionality including file formatting, MIME type detection, and response formatting.

### Integration Testing
```bash
npm run test:audio:integration
```
Tests with actual audio files in the `data/media/` folder and attempts transcription if configured.

### Testing Workflow
1. Start the bot: `npm run dev`
2. Send an audio message to your WhatsApp number
3. Audio file will be saved to `data/media/`
4. Run integration test: `npm run test:audio:integration`
5. Check transcription results and file handling

## Deployment Guide

### Step 1: Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your credentials
nano .env  # or use your preferred editor
```

### Step 2: Configure WhatsApp Business API
1. Go to https://developers.facebook.com/apps
2. Create a new Business app
3. Add WhatsApp product
4. Get your credentials:
   - Access Token
   - Phone Number ID
   - App Secret
5. Set up webhook with your public URL

### Step 3: Configure Audio Service (Optional)
For audio transcription, add these to your `.env`:
```env
AUDIO_SERVICE_API_URL=https://your-audio-service.com/
AUDIO_SERVICE_API_KEY=your-api-key-here
```

### Step 4: Start the Bot
```bash
# Development mode
npm run dev

# Or production mode
npm run build
npm start
```

### Step 5: Test the Setup
```bash
# Test basic audio service functionality
npm run test:audio

# Test with actual audio files (after receiving messages)
npm run test:audio:integration
```

## Troubleshooting

### Common Issues

1. **"Invalid signature format"** - Ensure webhook verification uses raw body
2. **Audio transcription fails** - Check audio service configuration
3. **Media files not saving** - Verify `data/media/` directory permissions
4. **Webhook verification fails** - Check verify token matches Facebook app settings
5. **API calls failing** - Verify WhatsApp access token and phone number ID
6. **TypeScript compilation errors** - Run `npm run build` to check for issues

### Debug Mode
Enable detailed logging by setting `NODE_ENV=development` in your `.env` file.

### File Permissions
Ensure the `data/media/` directory has write permissions:
```bash
chmod 755 data
chmod 755 data/media
```

### Network Configuration
- Ensure your server has a public HTTPS URL (use ngrok for development)
- Configure firewall to allow incoming webhook requests
- Verify SSL certificates if using custom domain