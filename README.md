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

## Project Structure

```
whatsapp-chatbot/
├── src/
│   ├── types/
│   │   └── whatsapp.ts         # TypeScript interfaces
│   ├── services/
│   │   └── whatsappService.ts  # WhatsApp API client
│   ├── handlers/
│   │   └── messageHandler.ts   # Message processing logic
│   ├── utils/
│   │   └── crypto.ts           # Signature verification
│   ├── routes/
│   │   └── webhook.ts          # Express routes
│   └── index.ts                # Main entry point
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

## Troubleshooting

### Common Issues

1. **"Cannot find