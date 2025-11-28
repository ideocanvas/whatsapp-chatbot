# 🌐 Autonomous Agent Web Interface

## Overview

The web interface provides a comprehensive dashboard to monitor and interact with the autonomous WhatsApp agent. It includes real-time data visualization, chat testing, and system monitoring capabilities.

## Features

### 📊 Dashboard
- **Real-time System Stats**: Active users, knowledge documents, scheduler ticks, browsing sessions
- **Activity Log**: Live monitoring of autonomous activities and system events
- **Auto-refresh**: Automatic updates every 5 seconds with manual control

### 💬 Chat Interface
- **Test Chat**: Interactive chat interface to test the bot's responses
- **Real-time Messaging**: Send messages and receive responses directly in the web interface
- **Message History**: View conversation history with the bot

### 🧠 Memory Visualization
- **Context Data**: View short-term memory (1-hour window) with user interests
- **Knowledge Base**: Explore long-term knowledge learned from autonomous browsing
- **History Store**: Access conversation logs and user interaction history

### ⚙️ Simulation Controls
- **Browse Simulation**: Trigger autonomous browsing sessions with specific intents
- **Proactive Messaging**: Simulate proactive message delivery to users

## Quick Start

### Running the Web Interface

```bash
# Start the autonomous server with web interface
npm run autonomous:dev

# Access the dashboard at:
# http://localhost:3000
```

### Development Mode

```bash
# Development mode (messages logged to console, no WhatsApp sending)
npm run autonomous:dev

# Watch mode (auto-restart on changes)
npm run autonomous:watch
```

## API Endpoints

The web interface exposes the following API endpoints:

### System Status
- `GET /api/status` - Get comprehensive system statistics
- `GET /api/activity` - Get recent activity log (last 50 entries)

### Memory Data
- `GET /api/memory/context` - Get context memory data
- `GET /api/memory/knowledge` - Get knowledge base data
- `GET /api/memory/history` - Get conversation history

### Chat Interface
- `POST /api/chat` - Send message to the bot and get response
- `POST /api/simulate/browse` - Simulate autonomous browsing
- `POST /api/simulate/proactive` - Simulate proactive messaging

### System Info
- `GET /health` - Health check endpoint
- `GET /api` - API information and available endpoints

## Dashboard Components

### System Status Card
Displays real-time metrics:
- **Active Users**: Number of users with recent interactions
- **Knowledge Docs**: Total documents in the vector database
- **Scheduler Ticks**: Number of autonomous loop cycles completed
- **Browse Sessions**: Total autonomous browsing sessions

### Activity Log
Shows system activities in real-time:
- Chat messages and responses
- Browsing sessions and knowledge acquisition
- Proactive messaging decisions
- System errors and warnings

### Chat Interface
Interactive testing environment:
- Send messages to the autonomous agent
- Receive real-time responses
- Test mobile-optimized message formatting
- Observe user interest discovery

### Memory Data Tabs
Three-tab interface for memory exploration:

#### Context Tab
- Short-term memory (1-hour TTL)
- User interests auto-discovered from conversations
- Active conversation contexts

#### Knowledge Tab
- Long-term vector database
- Facts learned from autonomous browsing
- Categorized knowledge with relevance scores

#### History Tab
- Conversation logs stored in SQL database
- User interaction history
- Message timestamps and types

## Testing the Autonomous Agent

### Chat Testing
1. Open the web interface at `http://localhost:3000`
2. Use the chat box to send messages to the bot
3. Observe how the agent processes messages and discovers interests
4. Watch the activity log for real-time updates

### Autonomous Behavior Observation
1. Monitor the scheduler ticks in the status card
2. Watch for autonomous browsing sessions in the activity log
3. Observe how knowledge is accumulated in the knowledge base
4. See proactive messaging decisions based on user interests

### Memory Exploration
1. Switch between context, knowledge, and history tabs
2. Observe how user interests are discovered and stored
3. Explore the knowledge acquired through autonomous browsing
4. Review conversation history and interaction patterns

## Development Features

### Auto-refresh
The dashboard automatically refreshes every 5 seconds to show real-time data. This can be disabled using the "Auto-refresh" checkbox.

### Error Handling
The interface gracefully handles errors and displays appropriate messages in the activity log.

### Responsive Design
The web interface is fully responsive and works on desktop, tablet, and mobile devices.

## Integration with Autonomous Agent

The web interface seamlessly integrates with the autonomous agent architecture:

- **Real-time Data**: All autonomous activities are reflected in the dashboard
- **Direct Interaction**: Chat messages are processed by the actual agent
- **Memory Access**: Full access to the 3-tier memory system
- **Activity Monitoring**: Live tracking of scheduler and browser activities

## Security Considerations

- The web interface is designed for development and monitoring purposes
- In production, consider adding authentication and access controls
- API endpoints expose system internals - restrict access as needed
- Static files are served from the `web/` directory

## Customization

### Styling
The interface uses CSS with a modern gradient design. Customize by modifying `web/index.html`.

### Data Presentation
Modify the API endpoints in `src/routes/dashboard.ts` to change data presentation.

### Additional Features
Extend the dashboard by adding new API endpoints and corresponding UI components.

The web interface transforms the autonomous agent from a black box into a transparent, observable system that can be monitored, tested, and understood in real-time.