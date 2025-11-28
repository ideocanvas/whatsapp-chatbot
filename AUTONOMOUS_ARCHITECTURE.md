# 🤖 Autonomous WhatsApp Agent Architecture

## 🎯 Overview

This is a complete architectural transformation from a **Reactive Bot** (Input → Output) to an **Autonomous Agent** (Loop → Decision → Action). The system now behaves like a proactive assistant that learns, browses, and initiates conversations based on user interests.

## 🏗️ Core Architecture

### Three-Tier Memory System
- **Short-Term (Hot)**: [`ContextManager`](src/memory/ContextManager.ts) - 1-hour in-memory conversation context with auto-interest discovery
- **Long-Term (Cold)**: [`KnowledgeBase`](src/memory/KnowledgeBase.ts) - Vector database for facts learned from autonomous browsing
- **History (Logs)**: [`HistoryStore`](src/memory/HistoryStore.ts) - SQL-based conversation logs for recall and analysis

### Autonomous Loop Engine
- **Scheduler**: [`Scheduler`](src/core/Scheduler.ts) - 1-minute tick system managing idle/proactive modes
- **Agent**: [`Agent`](src/core/Agent.ts) - Decision-making brain with tool orchestration and mobile optimization
- **BrowserService**: [`BrowserService`](src/services/BrowserService.ts) - Autonomous web surfing for knowledge acquisition

### Extensible Tool System
- **BaseTool**: [`BaseTool`](src/core/BaseTool.ts) - Abstract class for easy tool creation
- **ToolRegistry**: [`ToolRegistry`](src/core/ToolRegistry.ts) - Dynamic tool management without core changes
- **ActionQueue**: [`ActionQueueService`](src/services/ActionQueueService.ts) - Rate-limited action execution

## 🚀 Key Features

### Autonomous Browsing (Priority Feature)
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

## 📂 File Structure

```
src/
├── core/                    # Core Agent Components
│   ├── Agent.ts            # The Brain (LLM Orchestration)
│   ├── Scheduler.ts        # The Heartbeat (1-minute ticks)
│   ├── ToolRegistry.ts     # Dynamic Tool Management
│   └── BaseTool.ts         # Tool Interface
├── memory/                 # Three-Tier Memory System
│   ├── ContextManager.ts   # Short-term (1h window)
│   ├── KnowledgeBase.ts    # Long-term Vector Store
│   └── HistoryStore.ts     # Conversation Logs (SQL)
├── services/              # Autonomous Services
│   ├── BrowserService.ts  # Autonomous Web Surfing
│   ├── ActionQueueService.ts # Rate-limited Messaging
│   ├── WhatsappService.ts # Enhanced with proactive support
│   └── OpenAIService.ts   # LLM Integration
├── config/               # Configuration
│   └── autonomous.json   # Behavior settings
├── autonomous.ts         # Main Entry Point
└── test-autonomous.ts    # Test Script
```

## 🔧 Usage

### Starting the Autonomous Agent

```typescript
import { startAutonomousAgent } from './src/autonomous';

// Start the complete autonomous system
const agent = await startAutonomousAgent();

// Handle incoming messages
await agent.handleIncomingMessage('user-123', 'Hello!', 'msg-123');

// Get system status
const status = agent.getStatus();
```

### Testing the System

```bash
# Run the test script to see autonomous behavior
npx ts-node src/test-autonomous.ts
```

## ⚙️ Configuration

The system behavior is configurable via [`src/config/autonomous.json`](src/config/autonomous.json):

- **Scheduler**: Tick intervals, mode switching probabilities
- **Browser**: URL lists, rate limits, mobile optimization
- **Memory**: TTL settings, cleanup schedules
- **Messaging**: Rate limits, cooldowns, mobile formatting

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

## 🎯 Proactive Messaging Logic

The system automatically discovers user interests through conversation analysis:

```typescript
// Interest patterns are extracted from messages
userInterests = ["tech", "ai", "programming"];

// When browsing finds relevant content
if (contentMatchesUserInterests(userId, discoveredContent)) {
  const shouldShare = await agent.evaluateProactiveMessage(userId, content);
  if (shouldShare) {
    actionQueue.queueProactiveMessage(userId, message);
  }
}
```

## 📊 Monitoring & Logging

The system provides comprehensive status monitoring:

```typescript
const status = agent.getStatus();
// Returns:
// - Scheduler tick count and mode
// - Memory statistics (active users, knowledge documents)
// - Browser sessions and pages visited
// - Queue status and message counts
// - Tool availability
```

## 🔮 Future Enhancements

- **Tool Migration**: Convert existing tools to BaseTool pattern
- **Advanced Analytics**: User behavior patterns and engagement metrics
- **Multi-modal Support**: Image and audio proactive content
- **Cluster Deployment**: Scalable autonomous agent instances

## 🚨 Important Notes

- **Complete Replacement**: This is a new architecture, not an incremental upgrade
- **No Data Migration**: Starts fresh with new memory systems
- **Autonomous First**: Browsing and proactive features are prioritized
- **Mobile Optimized**: All responses are formatted for WhatsApp mobile interface

This architecture transforms your WhatsApp bot from a passive responder into an active, learning assistant that grows smarter over time through autonomous knowledge acquisition.