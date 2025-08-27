# WhatsApp ChatBot Dev Mode Guide

## Overview
The WhatsApp ChatBot now supports a development mode that allows you to test the bot without actually sending messages to WhatsApp. In dev mode, all messages are printed to the console instead of being sent to the WhatsApp API.

## How to Use Dev Mode

### 1. Start the Server in Dev Mode
```bash
npm run dev:mode
```

This starts the server with `DEV_MODE=true` environment variable, which enables dev mode.

### 2. Send Test Messages
Use the dev-test CLI tool to send test messages to your dev server:

#### Single Message
```bash
npm run dev:test -- send "Hello, how are you?"
```

#### With Custom Options
```bash
npm run dev:test -- send "What's the weather today?" --port 3000 --from 1234567890
```

#### Interactive Mode
```bash
npm run dev:test interactive
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

### Test Commands
- `npm run dev:test -- send <message>` - Send a single test message
- `npm run dev:test interactive` - Start interactive mode

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

2. In another terminal, send test messages:
   ```bash
   npm run dev:test -- send "Hello"
   npm run dev:test -- send "What's your name?"
   npm run dev:test -- send "Can you help me?"
   ```

3. Watch the server console for responses and debug output.

## Switching to Production
When you're ready to deploy, simply:
1. Set up your WhatsApp Business API credentials
2. Remove `DEV_MODE=true` or set it to `false`
3. Use `npm run start` for production