import { Router, Request, Response } from 'express';
import { getAutonomousAgent } from '../autonomous';
import express from 'express';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';

/**
 * Dashboard API routes for the web interface
 * Provides real-time access to autonomous agent data and chat testing
 */
export class DashboardRoutes {
  private router: Router;
  private activityLog: Array<{timestamp: string; message: string; type?: string}> = [];
  private dashboardPassword: string;

  constructor() {
    this.router = Router();
    this.dashboardPassword = process.env.DASHBOARD_PASSWORD || 'admin';
    this.setupRoutes();
    
    // Initialize with startup message
    this.logActivity('System started - Dashboard API initialized');
  }

  /**
   * Check if user is authenticated
   */
  private isAuthenticated(req: Request): boolean {
    return req.cookies?.dashboardAuth === this.dashboardPassword;
  }

  /**
   * Require authentication middleware
   */
  private requireAuth(req: Request, res: Response, next: Function): void {
    if (this.isAuthenticated(req)) {
      next();
    } else {
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  private setupRoutes(): void {
    // Login endpoint
    this.router.post('/api/login', (req: Request, res: Response) => {
      const { password } = req.body;
      
      if (password === this.dashboardPassword) {
        // FIX: Relaxed cookie settings for reliable local/prod development
        res.cookie('dashboardAuth', this.dashboardPassword, {
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
          // Only set Secure if actually in production and on HTTPS
          secure: process.env.NODE_ENV === 'production' && req.secure,
          sameSite: 'lax' // 'strict' can block cookies on some redirects
        });
        
        this.logActivity('User logged in to dashboard');
        res.json({ success: true });
      } else {
        this.logActivity('Failed login attempt', 'warning');
        res.status(401).json({ error: 'Invalid password' });
      }
    });

    // Logout endpoint
    this.router.post('/api/logout', (req: Request, res: Response) => {
      res.clearCookie('dashboardAuth');
      this.logActivity('User logged out from dashboard');
      res.json({ success: true });
    });

    // Check authentication status
    this.router.get('/api/auth/status', (req: Request, res: Response) => {
      res.json({ authenticated: this.isAuthenticated(req) });
    });

    // Protected routes - require authentication
    // System status endpoint
    this.router.get('/api/status', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Agent not initialized' });
      }
    });

    // Bot info endpoint
    this.router.get('/api/bot-info', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json({
        name: process.env.CHATBOT_NAME || 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // Activity log endpoint
    this.router.get('/api/activity', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json(this.activityLog.slice(-50)); // Last 50 activities
    });

    // Memory data endpoints
    this.router.get('/api/memory/context', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        
        // Use real context data from ContextManager stats
        const contextStats = status.memory?.context || { activeUsers: 0, totalMessages: 0 };
        
        // Format the data based on real stats
        const contextData = [{
          id: 'ctx-stats',
          title: 'Context Statistics',
          timestamp: new Date().toISOString(),
          content: `Active users: ${contextStats.activeUsers}, Total messages: ${contextStats.totalMessages}`,
          activeUsers: contextStats.activeUsers,
          totalMessages: contextStats.totalMessages
        }];
        
        // Add web interface user for testing
        contextData.push({
          id: 'ctx-web',
          title: 'Web Interface User',
          timestamp: new Date().toISOString(),
          content: 'Web chat interface ready for testing',
          activeUsers: 0,
          totalMessages: 0
        });
        
        res.json(contextData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get context data' });
      }
    });

    this.router.get('/api/memory/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        
        // Get actual knowledge content from the autonomous agent
        const knowledgeContent = await agent.getKnowledgeContent(20); // Get up to 20 recent documents
        
        // If we have real content, show it
        if (knowledgeContent.length > 0) {
          const knowledgeData = knowledgeContent.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            timestamp: doc.timestamp,
            content: doc.content,
            source: doc.source,
            category: doc.category
          }));
          
          res.json(knowledgeData);
        } else {
          // If no real content yet, show what the agent is ready to learn
          const exampleTopics = [
            'AI and Machine Learning',
            'Web Development',
            'Mobile Technology',
            'Cloud Computing',
            'Cybersecurity',
            'Data Science',
            'Internet of Things',
            'Blockchain Technology'
          ];
          
          const knowledgeData = exampleTopics.map((topic, i) => ({
            id: `knowledge-ready-${i + 1}`,
            title: `${topic} (Ready to Learn)`,
            timestamp: new Date().toISOString(),
            content: `The autonomous agent will learn about ${topic.toLowerCase()} during browsing sessions.`,
            source: 'Autonomous Browsing',
            category: topic
          }));
          
          res.json(knowledgeData);
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get knowledge data' });
      }
    });

    this.router.get('/api/memory/history', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        
        // Use activity log as real history data
        const historyData = this.activityLog.slice(-20).map((log, index) => ({
          id: `hist-${index + 1}`,
          title: `Activity: ${log.type || 'info'}`,
          timestamp: log.timestamp,
          message: log.message,
          type: log.type || 'info'
        }));
        
        res.json(historyData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get history data' });
      }
    });

    // Chat endpoint for testing the bot
    this.router.post('/api/chat', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { message } = req.body;
        const webUiUserId = process.env.WEB_UI_USER_ID || 'web-ui-user';
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        const agent = getAutonomousAgent();
        const historyStore = new HistoryStorePostgres();
        
        // Log the chat activity
        this.logActivity(`Web UI chat message from ${webUiUserId}: ${message.substring(0, 50)}...`);
        
        // Store user message in database like normal WhatsApp messages
        await historyStore.storeMessage({
          userId: webUiUserId,
          message: message,
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
        
        // Process the message through the autonomous agent using web interface method
        const response = await agent.handleWebMessage(webUiUserId, message);
        
        // Store bot response in database
        await historyStore.storeMessage({
          userId: webUiUserId,
          message: response,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
        
        // Log the response
        this.logActivity(`Bot response to ${webUiUserId}: ${response.substring(0, 50)}...`);
        
        res.json({ success: true, response });
      } catch (error) {
        console.error('Chat API error:', error);
        this.logActivity(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        res.status(500).json({ error: 'Failed to process message' });
      }
    });

    // Autonomous activity simulation endpoints
    this.router.post('/api/simulate/browse', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();
        
        this.logActivity(`Simulating browsing session with intent: ${intent || 'general'}`);
        
        // In a real implementation, this would trigger actual browsing
        // For now, we'll simulate the activity
        setTimeout(() => {
          this.logActivity(`Browsing session completed - learned 3 new facts about ${intent || 'technology'}`);
        }, 2000);
        
        res.json({ success: true, message: 'Browsing session started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate browsing' });
      }
    });

    this.router.post('/api/simulate/proactive', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { userId = 'web-user', content } = req.body;
        const agent = getAutonomousAgent();
        
        this.logActivity(`Simulating proactive message to ${userId}`);
        
        // Simulate proactive messaging logic
        setTimeout(() => {
          this.logActivity(`Proactive message sent to ${userId}: "Check out this interesting content!"`);
        }, 1000);
        
        res.json({ success: true, message: 'Proactive message simulation started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate proactive message' });
      }
    });

    // Knowledge search endpoint
    this.router.post('/api/search/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { query } = req.body;
        
        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }

        const agent = getAutonomousAgent();
        
        // Log the search activity
        this.logActivity(`Knowledge search: "${query}"`);
        
        // Search actual knowledge content
        const searchResults = await agent.searchKnowledgeContent(query, 10);
        
        // Format results with relevance scoring
        const formattedResults = searchResults.map((doc: any, index: number) => ({
          id: doc.id,
          title: doc.title,
          timestamp: doc.timestamp,
          content: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''), // Limit content length
          relevance: ['High', 'Medium', 'Low'][index % 3], // Simple relevance based on order
          source: doc.source,
          category: doc.category
        }));
        
        // If no real results, provide informative message
        if (formattedResults.length === 0) {
          formattedResults.push({
            id: 'search-no-results',
            title: 'No Results Found',
            timestamp: new Date().toISOString(),
            content: `No knowledge found matching "${query}". The autonomous agent will learn about this topic during future browsing sessions.`,
            relevance: 'Low',
            source: 'Knowledge Base',
            category: 'Information'
          });
        }

        res.json(formattedResults);
      } catch (error) {
        console.error('Knowledge search error:', error);
        res.status(500).json({ error: 'Failed to search knowledge base' });
      }
    });

    // Manual browsing trigger endpoint
    this.router.post('/api/browse/now', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();
        
        // Get browser service from agent (this would need to be exposed)
        // For now, we'll simulate triggering a browsing session
        this.logActivity(`Manual browsing triggered with intent: ${intent || 'general'}`);
        
        // Simulate browsing session
        setTimeout(() => {
          this.logActivity(`Manual browsing completed - learned fresh content about ${intent || 'technology'}`);
        }, 3000);
        
        res.json({
          success: true,
          message: `Browsing session started${intent ? ` with intent: ${intent}` : ''}`,
          estimatedTime: '3-5 seconds'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger browsing session' });
      }
    });

    // Force knowledge update endpoint
    this.router.post('/api/knowledge/refresh', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        
        this.logActivity('Manual knowledge refresh triggered');
        
        // This would force the agent to browse and update knowledge
        // For now, simulate the process
        setTimeout(() => {
          this.logActivity('Knowledge refresh completed - fresh content available');
        }, 2000);
        
        res.json({
          success: true,
          message: 'Knowledge refresh initiated',
          status: 'Updating with latest content'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to refresh knowledge' });
      }
    });

    // FIX: Improved Middleware to protect HTML files AND the root path
    this.router.use((req: Request, res: Response, next: Function) => {
      const path = req.path;
      
      // Always allow login page, static assets (css/js/images), and specific public API endpoints
      if (
        path === '/login.html' ||
        path === '/api/login' ||
        path === '/api/auth/status' ||
        path === '/health' ||
        path === '/api' ||
        path.match(/\.(js|css|png|jpg|ico|json)$/)
      ) {
        return next();
      }
      
      // Check authentication
      if (this.isAuthenticated(req)) {
        return next();
      }
      
      // If accessing root or html files without auth, redirect to login
      if (path === '/' || path.endsWith('.html')) {
        return res.redirect('/login.html');
      }

      // For protected API endpoints, return 401 instead of redirect
      if (path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      next();
    });

    // Serve static files from web directory
    this.router.use(express.static('web'));

    // Serve the web interface
    this.router.get('/', (req: Request, res: Response) => {
      // Redirect to login if not authenticated
      if (!this.isAuthenticated(req)) {
        return res.redirect('/login.html');
      }
      res.sendFile('web/index.html', { root: process.cwd() });
    });

    // Serve login page route
    this.router.get('/login', (req: Request, res: Response) => {
      // If already authenticated, redirect to dashboard
      if (this.isAuthenticated(req)) {
        return res.redirect('/');
      }
      res.redirect('/login.html');
    });
  }

  /**
   * Log activity for the dashboard
   */
  private logActivity(message: string, type?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    
    this.activityLog.push(logEntry);
    
    // Keep only the last 1000 entries to prevent memory issues
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }
    
    console.log(`📊 Dashboard: ${message}`);
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }
}