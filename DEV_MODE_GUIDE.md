# WhatsApp ChatBot Dev Mode Guide

## Overview
The WhatsApp ChatBot now supports a development mode that allows you to test the bot without actually sending messages to WhatsApp. In dev mode, all messages are printed to the console instead of being sent to the WhatsApp API.

## How to Use Dev Mode

### 1. Start the Server in Dev Mode
```bash
npm run dev:mode
```

This starts the server with `DEV_MODE=true` environment variable, which enables dev mode.

### 2. Use the Chat Client
The dev-test tool now functions as a chat client:

#### Send a Single Message
```bash
npm run dev:test -- "Hello, how are you?" --port 3000
```

#### Start Interactive Chat Mode (no message argument)
```bash
npm run dev:test -- --port 3000
```

#### With Custom Sender
```bash
npm run dev:test -- "What's your name?" --port 3000 --from 5551234567
```

### 3. Example Output
When you send a message in dev mode, you'll see output like this in the server console:
```
📱 [DEV MODE] Message would be sent to 1234567890:
💬 Hello! I'm Lucy, your personal assistant. What should I call you?
---
```

## Available Commands

### Server Commands
- `npm run dev:mode` - Start server in dev mode
- `npm run dev` - Start server normally (with nodemon)
- `npm run start` - Start production server

### Chat Client Commands
- `npm run dev:test -- <message>` - Send a single message and exit
- `npm run dev:test --` - Start interactive chat mode (no message argument)

### CLI Options for dev-test
- `-p, --port <port>` - Server port (default: 3000)
- `-f, --from <number>` - Sender phone number (default: 1234567890)
- `-t, --type <type>` - Message type (default: text)

## Environment Variables
- `DEV_MODE=true` - Enable dev mode (messages print to console)
- `PORT=3000` - Server port (default: 3000)
- `WHATSAPP_ACCESS_TOKEN` - Not required in dev mode
- `WHATSAPP_PHONE_NUMBER_ID` - Not required in dev mode

## Benefits of Dev Mode
1. **No WhatsApp API Credentials Required** - Test without setting up WhatsApp Business API
2. **Rapid Testing** - Quickly test message flows and responses
3. **Debugging** - See exactly what messages would be sent
4. **Cost Saving** - Avoid WhatsApp API usage charges during development

## Example Workflow

1. Start dev server:
   ```bash
   npm run dev:mode
   ```

2. In another terminal, use the chat client:
   ```bash
   # Single messages
   npm run dev:test -- "Hello"
   npm run dev:test -- "What's your name?"

   # Or start interactive chat
   npm run dev:test -- --port 3001
   ```

3. Watch the server console for responses and debug output.

## Switching to Production
When you're ready to deploy, simply:
1. Set up your WhatsApp Business API credentials
2. Remove `DEV_MODE=true` or set it to `false`
3. Use `npm run start` for production