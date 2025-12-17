# 🤖 Autonomous WhatsApp Agent (TypeScript)

A complete autonomous agent system that transforms from a **Reactive Bot** to an **Intelligent Assistant** with autonomous browsing, proactive messaging, and a comprehensive web dashboard.

## 🎯 Overview

This is a complete architectural transformation from a **Reactive Bot** (Input → Output) to an **Autonomous Agent** (Loop → Decision → Action). The system now behaves like a proactive assistant that learns, browses, and initiates conversations based on user interests.

## 🚀 Key Features

### 🤖 Autonomous Agent System

- **Three-Tier Memory**: Short-term context (1h), long-term knowledge (vector DB), conversation history (SQL)
- **Intelligent Scheduler**: 1-minute autonomous loop with mode switching (idle/proactive/reactive)
- **Agent Brain**: LLM orchestration with tool calling and mobile optimization
- **Autonomous Browsing**: 10 pages/hour limit with 2-5 second delays between pages
- **Proactive Messaging**: User interest discovery and relevant content sharing

### 🌐 Dashboard Features

- **Real-time Monitoring**: System stats, activity logs, memory visualization
- **Interactive Chat**: Test the bot directly in the web interface
- **Memory Exploration**: View context, knowledge base, and conversation history
- **Simulation Controls**: Trigger browsing sessions and proactive messaging

### 🔧 Core Capabilities

- **WhatsApp Integration**: Full WhatsApp Business API support
- **AI Intelligence**: OpenAI integration with tool calling
- **Knowledge Acquisition**: Autonomous web surfing and content embedding
- **Mobile Optimization**: 50-word response limit, natural spacing, emoji integration
- **Extensible Tools**: Web search (10 results/request, 3 request limit), news scraping, history recall, and more

## 🏗️ Architecture

### Three-Tier Memory System

- **Short-Term (Hot)**: [`ContextManager`](src/memory/ContextManager.ts) - 1-hour in-memory conversation context with auto-interest discovery
- **Long-Term (Cold)**: [`KnowledgeBase`](src/memory/KnowledgeBase.ts) - Vector database for facts learned from autonomous browsing
- **History (Logs)**: [`HistoryStore`](src/memory/HistoryStore.ts) - SQL-based conversation logs for recall and analysis

### Autonomous Loop Engine

- **Scheduler**: [`Scheduler`](src/core/Scheduler.ts) - 1-minute tick system managing idle/proactive modes
- **Agent**: [`Agent`](src/core/Agent.ts) - Decision-making brain with tool orchestration and mobile optimization
- **BrowserService**: [`BrowserService`](src/services/BrowserService.ts) - Autonomous web surfing for knowledge acquisition

### Web Interface

- **Dashboard**: Real-time system statistics and activity monitoring
- **Chat Interface**: Interactive testing environment
- **Memory Visualization**: Explore all three memory tiers
- **API Endpoints**: RESTful API for system control and data access

## 🛠️ Prerequisites

### Required Setup

1. **Facebook Developer Account**: Create an app at <https://developers.facebook.com>
2. **WhatsApp Business Account**: Set up a WhatsApp Business account
3. **Access Token**: Get your access token from Facebook Developer Console
4. **Phone Number ID**: Get your WhatsApp phone number ID
5. **Webhook URL**: A publicly accessible HTTPS URL (use ngrok for development)

### Optional AI Configuration

- **OpenAI API Key**: For advanced AI capabilities
- **Google Search API**: For real-time information retrieval
- **PostgreSQL Database**: For persistent memory storage (optional)

## 📥 Installation

```bash
# Clone the repository
git clone <repository-url>
cd whatsapp-chatbot

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Initialize database (optional, for persistent memory)
npx prisma generate
npx prisma db push
```

## ⚙️ Configuration

Edit the `.env` file with your credentials:

```env
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=your_verify_token_here
WHATSAPP_APP_SECRET=your_app_secret_here

# AI Configuration (File-based or Environment)
AI_CONFIG_PATH=config/ai
AI_CONFIG_FILE=default.json
# OR use environment variables:
# OPENAI_API_KEY=your_api_key_here
# OPENAI_BASE_URL=https://api.openai.com/v1

# Server Configuration
PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook
HOST=localhost  # or 0.0.0.0 for network access

# Autonomous Agent Settings
CHATBOT_NAME=Lucy  # Customize bot name
DEV_MODE=true      # Development mode (logs to console)

# Timing Configuration (values in milliseconds unless noted)
AUTONOMOUS_TICK_INTERVAL_MS=60000       # Main heartbeat interval (default: 60000 = 1 minute)
AUTONOMOUS_MAINTENANCE_INTERVAL_MS=3600000 # Maintenance task interval (default: 3600000 = 1 hour)
AUTONOMOUS_BATCH_FLUSH_INTERVAL=180     # News digest flush interval in ticks (default: 180 ticks = 3 hours)

# Database Configuration (Optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_agent

# Google Search API (Optional)
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_engine_id_here
```

## 🤖 Autonomous Agent Features

### Memory System Details

- **Short-Term Context**: 1-hour conversation window with automatic user interest discovery
- **Long-Term Knowledge**: Vector database storing facts learned from autonomous browsing
- **Conversation History**: SQL-based logs for recall and analysis

### Autonomous Browsing

- **10 pages/hour limit** with intelligent URL selection
- **Intent-based surfing** based on knowledge gaps and user interests
- **Mobile-optimized scraping** for efficient content extraction
- **Automatic knowledge embedding** into vector database

### Proactive Messaging

- **User interest auto-discovery** from conversation patterns
- **Content relevance matching** using vector similarity
- **Rate-limited delivery** with 15-minute cooldown per user
- **Intelligent decision-making** via LLM evaluation

### Mobile Optimization

- **50-word response limit** unless requested
- **Natural spacing** for WhatsApp readability
- **No markdown blocks** or complex formatting
- **Emoji integration** for personality

## 🌐 Dashboard Interface

### Real-time Monitoring

- **System Stats**: Active users, knowledge documents, scheduler ticks, browsing sessions
- **Activity Log**: Live monitoring of autonomous activities and system events
- **Auto-refresh**: Automatic updates every 5 seconds with manual control

### Interactive Features

- **Test Chat**: Interactive chat interface to test the bot's responses
- **Memory Visualization**: Explore context, knowledge base, and conversation history
- **Simulation Controls**: Trigger browsing sessions and proactive messaging

### API Endpoints

- `GET /api/status` - Comprehensive system statistics
- `GET /api/activity` - Recent activity log (last 50 entries)
- `POST /api/chat` - Send message to the bot and get response
- `GET /api/memory/{context|knowledge|history}` - Memory data access
- `POST /api/search/knowledge` - Search knowledge base content

## 🔧 Tool System

### Available Tools

- **Web Search**: Google Search API integration for real-time information
- **News Scraping**: Direct content extraction from news websites
- **History Recall**: Access conversation history and user interactions
- **Browser Automation**: Autonomous web surfing for knowledge acquisition

### Extensible Architecture

- **BaseTool Pattern**: Easy creation of new tools without core changes
- **Tool Registry**: Dynamic tool management and registration
- **OpenAI Function Calling**: Intelligent tool selection and execution

## 🚀 Quick Start

### Running the Autonomous Agent

```bash
# Development mode (messages logged to console, no WhatsApp sending)
npm run autonomous:dev

# Production mode (messages sent to WhatsApp)
npm run autonomous

# Watch mode (auto-restart on changes)
npm run autonomous:watch

# Test the autonomous system
npm run web:test
```

### Accessing the Web Dashboard

Once the server is running, access the dashboard at:

- **Local**: <http://localhost:3000>
- **Network**: http://[your-ip]:3000 (if HOST=0.0.0.0)

### Using ngrok for Development

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000

# Update .env with the ngrok URL
WEBHOOK_URL=https://abc123.ngrok.io
```

## 📂 Project Structure

```bash
whatsapp-chatbot/
├── src/
│   ├── core/                    # Core Agent Components
│   │   ├── Agent.ts            # The Brain (LLM Orchestration)
│   │   ├── Scheduler.ts        # The Heartbeat (1-minute ticks)
│   │   ├── ToolRegistry.ts     # Dynamic Tool Management
│   │   └── BaseTool.ts         # Tool Interface
│   ├── memory/                 # Memory System
│   │   ├── ContextManager.ts   # Short-term (1h window)
│   │   ├── KnowledgeBase.ts    # Long-term Vector Store
│   │   └── HistoryStore.ts     # Conversation Logs (SQL)
│   ├── services/              # Autonomous Services
│   │   ├── BrowserService.ts  # Autonomous Web Surfing
│   │   ├── ActionQueueService.ts # Rate-limited Messaging
│   │   ├── WhatsappService.ts # Enhanced with proactive support
│   │   └── OpenAIService.ts   # LLM Integration
│   ├── config/               # Configuration
│   │   └── databaseConfig.ts # Database configuration switcher
│   ├── routes/              # API Routes
│   │   ├── dashboard.ts     # Web interface API
│   │   └── webhook.ts       # WhatsApp webhook handler
│   ├── tools/               # Extensible Tool System
│   │   ├── WebSearchTool.ts # Google Search integration
│   │   ├── RecallHistoryTool.ts # Conversation history access
│   │   └── ScrapeNewsTool.ts # News scraping capabilities
│   ├── autonomous.ts        # Main Autonomous Agent Entry Point
│   └── server.ts           # Main Server with Web Dashboard
├── web/                    # Web Interface
│   └── index.html         # Dashboard HTML/CSS/JS
├── config/                # Configuration Files
│   └── ai/               # AI Model Configurations
├── prisma/               # Database Schema (see Database Tables section below)
├── test/                 # Test Files
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🔄 Autonomous Behavior Patterns

### Idle Mode (No Active Users)

1. Browser surfs predefined URLs
2. Extracts knowledge and embeds into vector store
3. Builds knowledge base for future proactive messaging

### Proactive Mode (Active Users)

1. Checks user interests from conversation context
2. Searches knowledge base for relevant content
3. Asks LLM if content should be shared
4. Queues message with appropriate delay and priority

### Reactive Mode (User Messages)

1. Processes through agent with tool calling
2. Uses 3-tier memory for context and knowledge
3. Optimizes response for mobile interface
4. Auto-discovers user interests for future proactive messages

## 📊 Monitoring & Logging

### Real-time Dashboard

- **System Status**: Active users, knowledge documents, scheduler ticks, browsing sessions
- **Activity Log**: Live monitoring of autonomous activities
- **Memory Visualization**: Explore all three memory tiers
- **Chat Testing**: Interactive testing environment

### Comprehensive Logging

- **AI Response**: Logs all AI-generated responses with model information
- **Tool Call**: Logs tool execution requests, results, and timing
- **Search**: Logs Google search API requests and responses
- **Decision**: Logs response generation decisions and search triggers
- **Error**: Logs errors and failures with context information

## 🎯 Configuration

### Autonomous Behavior Settings

Autonomous behavior is configured through **environment variables** and **hardcoded constants** in the service classes:

**Environment Variables:**

- `AUTONOMOUS_TICK_INTERVAL_MS`: Scheduler tick interval (default: 60000ms)
- `AUTONOMOUS_MAINTENANCE_INTERVAL_MS`: Maintenance interval (default: 300000ms)
- `AUTONOMOUS_BATCH_FLUSH_INTERVAL`: News batch flush interval (default: 30 ticks)

**Service Constants:**

- Browser limits: `MAX_PAGES_PER_HOUR = 20` in [`BrowserService`](src/services/BrowserService.ts)
- Memory settings: Hardcoded in respective memory management classes
- Messaging delays: Configured in [`ActionQueueService`](src/services/ActionQueueService.ts)
      "proactiveCooldownMs": 900000,
      "mobileOptimization": {
        "maxWords": 50,
        "removeMarkdown": true
      }
    }
  }
}

```json

## 📊 Rate Limits and Quotas

### Website Surfing Limits
- **Maximum Pages per Hour**: 10 pages
- **Page Load Delay**: 2-5 seconds between pages
- **Daily URL Sources**: TechCrunch, Hacker News, Hong Kong Free Press, BBC World, CNBC World
- **Mobile Optimization**: Enabled for efficient scraping

### Google Search Limits
- **Results per Request**: 10 results (Google API maximum)
- **Maximum Requests**: 3 requests per search operation
- **Total Results**: Up to 30 unique results per search
- **Request Delay**: 500ms between requests to avoid rate limiting
- **Duplicate Removal**: Automatic removal of duplicate URLs

### Tool Calling Limits
- **Maximum Tool Rounds**: 10 rounds per conversation
- **Rate Limit Delay**: 2 seconds between actions
- **Proactive Cooldown**: 15 minutes between proactive messages per user
- **Retry Limit**: 3 retries with 30-second backoff

## 📋 Available Scripts

```bash
# Development
npm run dev                    # Standard development server
npm run autonomous:dev        # Autonomous agent with web dashboard
npm run autonomous:watch      # Watch mode with auto-restart
npm run dev:test              # Development testing

# Production
npm run build                 # Build TypeScript
npm start                     # Start production server
npm run autonomous           # Start autonomous agent

# Testing
npm run test                 # Run all tests
npm run test:watch          # Watch mode testing
npm run web:test            # Test autonomous system

# Database
npx prisma generate          # Generate database client
npx prisma db push          # Push schema to database
npx prisma studio           # Open database GUI

## 🗃️ Database Tables

The system uses PostgreSQL with Prisma ORM to manage persistent storage. Here's a breakdown of each table's purpose:

### Core Memory Tables

**ConversationLog** - Stores all user and assistant conversations for long-term memory and recall
- **Purpose**: Three-tier memory system (history/logs layer)
- **Key Fields**: userId, message, role, timestamp, messageType, metadata
- **Service**: [`HistoryStorePostgres`](src/memory/HistoryStorePostgres.ts)

**Knowledge** - Stores facts learned from autonomous browsing using vector embeddings
- **Purpose**: Three-tier memory system (long-term/cold storage)
- **Key Fields**: content, vector (BYTEA embeddings), source, category, tags, relevanceScore
- **Service**: [`KnowledgeBasePostgres`](src/memory/KnowledgeBasePostgres.ts)

**ConversationSummary** - Stores AI-generated summaries of conversations for efficient recall
- **Purpose**: Compressed conversation memory with deduplication
- **Key Fields**: userId, summary, contextHash (for deduplication), timestamp

### User Management Tables

**UserProfile** - Stores structured user information for personalized interactions
- **Purpose**: User profiling and personalization
- **Key Fields**: userId (primary key), name, location, language, facts (JSON), completeness score
- **Service**: [`UserProfileService`](src/services/UserProfileService.ts)

**ProcessedMessage** - Tracks processed WhatsApp messages to prevent duplicate handling
- **Purpose**: Message deduplication and processing tracking
- **Key Fields**: messageId (primary key), senderNumber, messageType, processedAt
- **Service**: [`ProcessedMessageServicePostgres`](src/services/ProcessedMessageServicePostgres.ts)

### Content Generation Tables

**BlogPost** - Stores AI-generated blog posts from news content
- **Purpose**: Content generation and publishing pipeline
- **Key Fields**: title, content (Markdown), sourceUrl, tags, category, status, publishedAt
- **Service**: [`BlogGenerationService`](src/services/blogGenerationService.ts)

**DailyDigest** & **WeeklyDigest** - Organizes blog posts into daily and weekly digests
- **Purpose**: Content organization and period-based aggregation
- **Key Fields**: date (unique), title, content, blogPosts/dailyDigests relations

### News System Tables

**NewsSource** - Manages news sources for autonomous browsing and content acquisition
- **Purpose**: News source management and prioritization
- **Key Fields**: url (unique), name, region, language, priority, isActive, lastScraped

**NewsKeyword** - Tracks keywords and their relevance for content filtering
- **Purpose**: Keyword-based content prioritization
- **Key Fields**: keyword, relevance score, category, lastUsed

### Architecture Integration

The database schema supports the **Three-Tier Memory System**:
- **Short-term**: ContextManager (in-memory)
- **Long-term**: Knowledge/Document tables (vector embeddings)
- **History**: ConversationLog/ConversationSummary (SQL storage)

Each table serves specific roles in the autonomous agent's learning, recall, and proactive messaging capabilities.
```

## 🔒 Security Features

- **Signature Verification**: Validates webhook requests using HMAC-SHA256
- **Environment Variables**: Sensitive credentials stored in .env file
- **HTTPS Required**: Webhook only works with HTTPS URLs
- **Rate Limiting**: Action queue prevents spam and API abuse

## 🐛 Troubleshooting

### Common Issues

1. **"Agent not initialized"** - Ensure autonomous agent is started with `npm run autonomous:dev`
2. **Web dashboard not loading** - Check if server is running on correct port
3. **WhatsApp messages not processing** - Verify webhook configuration and ngrok setup
4. **Database connection errors** - Check DATABASE_URL in .env file
5. **AI service errors** - Verify OpenAI API key or config file settings

### Development Mode

Enable development mode to test without WhatsApp:

```env
DEV_MODE=true
```

### Debug Information

Access system status via API:

```bash
curl http://localhost:3000/api/status
```

## 🚀 Production Deployment

### Docker Deployment

Use the provided [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml):

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t whatsapp-autonomous-agent .
docker run -p 3000:3000 whatsapp-autonomous-agent
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
WEBHOOK_URL=https://your-production-domain.com
DEV_MODE=false
```

## 📚 Additional Documentation

- **[AUTONOMOUS_ARCHITECTURE.md](AUTONOMOUS_ARCHITECTURE.md)** - Complete autonomous agent architecture details
- **[WEB_INTERFACE.md](WEB_INTERFACE.md)** - Web dashboard features and API documentation
- **[POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md)** - Database setup and migration guide
- **[DEV_MODE_GUIDE.md](DEV_MODE_GUIDE.md)** - Development mode usage and testing

## 🎯 Future Enhancements

- **Advanced Analytics**: User behavior patterns and engagement metrics
- **Multi-modal Support**: Image and audio proactive content
- **Cluster Deployment**: Scalable autonomous agent instances
- **Plugin System**: Community-developed tools and extensions

---

**Note**: This is a complete architectural transformation from reactive bot to autonomous agent. The system now proactively learns, browses, and initiates conversations based on user interests, transforming your WhatsApp bot into an intelligent, learning assistant.
