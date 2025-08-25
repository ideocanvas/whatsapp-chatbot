# WhatsApp ChatBot (TypeScript)

A TypeScript-based WhatsApp chat bot that integrates with Facebook's WhatsApp Business API to receive and respond to messages with advanced AI capabilities.

## Features

### Core Functionality
- ✅ Receive WhatsApp messages via webhooks
- ✅ Send automated responses to users
- ✅ Message read receipts
- ✅ Signature verification for security
- ✅ TypeScript support with proper type definitions
- ✅ Express.js HTTP server
- ✅ Environment configuration

### AI Capabilities
- ✅ **OpenAI Integration** - Intelligent text responses using GPT models
- ✅ **AI Image Analysis** - Detailed image content analysis using OpenAI Vision
- ✅ **Response Cleaning** - Automatic removal of internal thinking tags
- ✅ **Tool Calling** - OpenAI function calling for external tool integration

### Media Support
- ✅ Image file support (download and info)
- ✅ Audio file support (download and transcription)
- ✅ Media file storage and management

### Advanced Features
- ✅ **Google Search Integration** - Real-time information retrieval
- ✅ **Web Scraping** - Direct content extraction from websites
- ✅ **Comprehensive Logging** - Detailed monitoring of AI responses and tool usage
- ✅ **Error Handling** - Robust error handling and fallback mechanisms

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

# AI Configuration File Settings
AI_CONFIG_PATH=config/ai
AI_CONFIG_FILE=default.json

# WhatsApp Business API Configuration
WHATSAPP_VERIFY_TOKEN=your_verify_token_here
WHATSAPP_APP_SECRET=your_app_secret_here

# Server Configuration
PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook

# Audio Transcription Service (Optional)
AUDIO_SERVICE_API_URL=https://api.example.com/audio/
AUDIO_SERVICE_API_KEY=your_audio_service_api_key_here
```

## OpenAI Features

The bot now includes advanced AI capabilities powered by OpenAI:

### Intelligent Text Responses
- Uses GPT models to generate natural, contextual responses to text messages
- Falls back to basic responses if OpenAI is not configured or fails
- Handles a wide variety of questions and conversations

### AI Image Analysis
- Uses OpenAI Vision to analyze image content
- Provides detailed descriptions of images including objects, people, text, colors, and context
- Automatically processes images sent to the bot via WhatsApp

### Configuration
The bot now uses config files for AI model configuration instead of environment variables. This allows for multiple AI model configurations and easier switching between different providers.

**Configuration File Structure:**
Create JSON files in the `config/ai/` directory with the following structure:

```json
{
  "name": "Configuration Name",
  "description": "Description of this configuration",
  "config": {
    "apiKey": "your_api_key_here",
    "baseURL": "https://api.provider.com/v1",
    "model": "model-name",
    "visionModel": "vision-model-name",
    "temperature": 0.7,
    "maxTokens": 1000,
    "enableToolCalling": true,
    "embeddingModel": "embedding-model",
    "prompts": {
      "textResponse": "Custom prompt template...",
      "imageAnalysis": "Custom image analysis prompt...",
      "toolCalling": "Custom tool calling prompt...",
      "errorResponse": "Custom error response...",
      "searchLimit": "Custom search limit response..."
    }
  }
}
```

**Setup Steps:**
1. Create config files in `config/ai/` directory (see examples provided)
2. Update your `.env` file to specify which config file to use:
   ```env
   AI_CONFIG_PATH=config/ai
   AI_CONFIG_FILE=default.json
   ```
3. The bot will automatically load the specified configuration

**Supported Providers:**
- [OpenAI](https://platform.openai.com/api-keys) - Official OpenAI API
- [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) - Microsoft Azure OpenAI
- [Anthropic Claude](https://console.anthropic.com/) - Anthropic's Claude models
- [Google Gemini](https://aistudio.google.com/) - Google's Gemini models
- Local LLM servers (LM Studio, Ollama, etc.)
- Any other OpenAI-compatible API endpoint

**Example Config Files:**
- `default.json` - Default configuration based on current setup
- `openai.json` - Configuration for OpenAI API models
- `local-llm.json` - Configuration for locally hosted models

### Testing OpenAI Integration

**Test Configuration:**
```bash
npm run test:openai:config
```

**Full Integration Test (requires valid API credentials):**
```bash
npm run test:openai
```

The bot will automatically fall back to basic responses if OpenAI is not configured or encounters errors.

**Legacy Environment Variable Support:**
The bot maintains backward compatibility with environment variables. If no config file is found or specified, it will fall back to reading from:
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_TEMPERATURE`
- `OPENAI_MAX_TOKENS`
- `OPENAI_ENABLE_TOOL_CALLING`
- `OPENAI_EMBEDDING_MODEL`

### Response Cleaning
The bot automatically removes internal thinking tags (`<think>...</think>`) from OpenAI responses before sending them to users, ensuring clean and professional output.

**Example:**
```
Before: <think>User asked about weather...</think>Hello!<think>Preparing response...</think>The weather is sunny.
After: Hello! The weather is sunny.
```

**Features:**
- Automatic removal of thinking tags and internal AI thought processes
- Whitespace cleanup and formatting
- Graceful handling of responses without thinking tags
- No additional configuration required

## Tool Calling and Google Search Integration

The bot includes advanced tool calling capabilities with Google Search integration for real-time information retrieval.

### Features
- **Web Search**: Perform Google searches using Custom Search API
- **Tool Calling**: OpenAI function calling for intelligent tool selection
- **Real-time Information**: Access current news, facts, and updates
- **Automatic Integration**: Search results automatically incorporated into responses

### Setup Requirements

**Google Custom Search API:**
1. Create a Google Cloud project at https://console.cloud.google.com/
2. Enable Custom Search API
3. Create API key and Search Engine ID
4. Add to `.env`:
```env
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_engine_id_here
OPENAI_ENABLE_TOOL_CALLING=true
```

### Search Trigger Keywords
The bot automatically triggers search for messages containing:
- Current/latest information requests
- News and updates
- "What is", "Who is", "When is", "Where is", "How to"
- Search/find/look up requests
- Weather, stock prices, scores, results

### Usage Examples
- **User**: "What's the latest news about AI?" → Bot performs Google search
- **User**: "Who won the last World Cup?" → Bot searches for factual information
- **User**: "What's the weather in Tokyo?" → Bot provides current weather info

### Web Scraping Tool
The bot includes a powerful web scraping tool using Playwright for direct content extraction from websites:

**Features:**
- Real-time content extraction from specific URLs
- JavaScript support for modern websites
- CSS selector targeting for precise content extraction
- Multiple URL support in single operations
- Automatic content cleaning and formatting

**Tool Schema:**
```json
{
  "name": "web_scrape",
  "description": "Scrape content from URLs to get real-time information",
  "parameters": {
    "urls": ["https://example.com"],
    "selector": "article"  // Optional CSS selector
  }
}
```

**Usage Patterns:**
1. **Search + Scrape**: Use Google search to find URLs, then scrape content
2. **Direct URL**: Scrape specific URLs provided by users
3. **Multi-source**: Scrape multiple sources for comprehensive information

**Common Selectors:**
- `article` - Main article content
- `main` - Main content area
- `.content` - Content container
- `#content` - Content container by ID

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
│   │   ├── whatsapp.ts         # WhatsApp API type definitions
│   │   └── conversation.ts     # Conversation management types
│   ├── services/
│   │   ├── whatsappService.ts  # WhatsApp API client
│   │   ├── mediaService.ts     # Media download and processing
│   │   ├── openaiService.ts    # OpenAI integration for AI responses
│   │   ├── googleSearchService.ts # Google Search API integration
│   │   ├── webScrapeService.ts # Web scraping with Playwright
│   │   ├── conversationStorageService.ts # Conversation management
│   │   ├── processedMessageService.ts # Message processing state
│   │   └── newsScrapeService.ts # News scraping functionality
│   ├── handlers/
│   │   └── messageHandler.ts   # Message processing logic
│   ├── utils/
│   │   ├── crypto.ts           # Signature verification
│   │   ├── logger.ts           # Comprehensive logging system
│   │   └── responseCleaner.ts  # Response cleaning utilities
│   ├── tools/
│   │   └── index.ts            # Tool calling system
│   ├── routes/
│   │   └── webhook.ts          # Express routes
│   └── index.ts                # Main entry point
├── data/
│   └── media/                  # Storage for received media files
├── test/                       # Test files
├── test-data/                  # Test data
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Logging and Monitoring

The bot includes comprehensive logging for all AI responses and tool calling activities:

### Log Types
- **🤖 AI Response**: Logs all AI-generated responses with model information and token counts
- **🛠️ Tool Call**: Logs tool execution requests, results, and timing information
- **🔍 Search**: Logs Google search API requests and responses with timing
- **🧠 Decision**: Logs response generation decisions and search triggers
- **❌ Error**: Logs errors and failures with context information

### Log Features
- **Structured Logging**: Consistent log format with timestamps and emoji indicators
- **Real-time Console Output**: Immediate feedback during development
- **In-memory Storage**: Configurable log retention (default: 1000 entries)
- **Programmatic Access**: Filter and retrieve logs by type or limit

### Usage Examples
```typescript
import { logger } from './utils/logger';

// Log AI responses
logger.logAIResponse('Response generated', {
  model: 'gpt-4',
  tokens: 150,
  tool_calls: 1
});

// Get filtered logs
const searchLogs = logger.getLogs({ type: 'search' });
const recentLogs = logger.getLogs({ limit: 10 });
```

### Environment Variables for Logging
```env
# Enable detailed logging (default: enabled)
LOG_LEVEL=debug

# Disable logging
LOG_LEVEL=silent
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

## Testing

### Testing Audio Service

### Testing OpenAI Integration
```bash
npm run test:openai
```
Tests OpenAI text response generation and embedding creation. Requires OPENAI_API_KEY to be configured.

### Basic Audio Testing
```bash
npm run test:audio
```
Tests the audio service functionality including file formatting, MIME type detection, and response formatting.

### Audio Integration Testing
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