/**
 * Action Queue Service for rate-limited messaging and scheduled actions.
 * Prevents WhatsApp API rate limit violations and enables human-like delayed responses.
 */
interface QueuedAction {
  id: string;
  type: 'message' | 'media' | 'proactive';
  userId: string;
  content: string;
  scheduledFor: Date;
  priority: number; // 1-10, higher = more urgent
  retryCount: number;
  metadata?: any;
}

export class ActionQueueService {
  private queue: QueuedAction[] = [];
  private processing: boolean = false;
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 2000; // 2 seconds between messages
  private readonly PROACTIVE_COOLDOWN = 15 * 60 * 1000; // 15 minutes between proactive messages

  constructor() {
    // Start processing loop
    this.startProcessing();
  }

  /**
   * Queue a message for delivery with rate limiting
   */
  queueMessage(userId: string, content: string, options: {
    priority?: number;
    delayMs?: number;
    isProactive?: boolean;
    metadata?: any;
  } = {}): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const scheduledFor = new Date(Date.now() + (options.delayMs || 0));
    
    const action: QueuedAction = {
      id: actionId,
      type: options.isProactive ? 'proactive' : 'message',
      userId,
      content,
      scheduledFor,
      priority: options.priority || 5,
      retryCount: 0,
      metadata: options.metadata
    };

    this.queue.push(action);
    this.queue.sort((a, b) => {
      // Sort by priority (descending), then by scheduled time (ascending)
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });

    console.log(`📬 Queued ${action.type} message for ${userId} (priority: ${action.priority})`);
    
    return actionId;
  }

  /**
   * Start processing the action queue
   */
  private startProcessing() {
    setInterval(() => {
      if (!this.processing) {
        this.processNextAction();
      }
    }, 1000); // Check every second
  }

  /**
   * Process the next action in the queue
   */
  private async processNextAction() {
    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;
    const now = new Date();

    // Find the next actionable item (scheduled for now or earlier)
    const nextActionIndex = this.queue.findIndex(action => 
      action.scheduledFor <= now
    );

    if (nextActionIndex === -1) {
      this.processing = false;
      return;
    }

    const action = this.queue.splice(nextActionIndex, 1)[0];

    try {
      // Simulate action execution (will be integrated with WhatsApp service)
      await this.executeAction(action);
      
      console.log(`✅ Action completed: ${action.type} to ${action.userId}`);
      
    } catch (error) {
      console.error(`❌ Action failed: ${action.type} to ${action.userId}`, error);
      
      // Retry logic
      if (action.retryCount < this.MAX_RETRIES) {
        action.retryCount++;
        action.scheduledFor = new Date(Date.now() + (action.retryCount * 30000)); // Exponential backoff
        this.queue.push(action);
        console.log(`🔄 Retry scheduled for action ${action.id} (attempt ${action.retryCount})`);
      } else {
        console.error(`💀 Action ${action.id} failed after ${this.MAX_RETRIES} retries`);
      }
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
    
    this.processing = false;
  }

  /**
   * Execute an action (to be integrated with actual service)
   */
  private async executeAction(action: QueuedAction): Promise<void> {
    // This will be replaced with actual WhatsApp service integration
    console.log(`📤 Executing ${action.type} action for ${action.userId}:`);
    console.log(`💬 Content: ${action.content.substring(0, 100)}${action.content.length > 100 ? '...' : ''}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    // Simulate occasional failures for testing retry logic
    if (Math.random() < 0.1) { // 10% failure rate for testing
      throw new Error('Simulated API failure');
    }
  }

  /**
   * Check if a user has a proactive message cooldown
   */
  canSendProactiveMessage(userId: string): boolean {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return true;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return cooldownRemaining <= 0;
  }

  /**
   * Get time until next proactive message can be sent to a user
   */
  getProactiveCooldownRemaining(userId: string): number {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return 0;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return Math.max(0, cooldownRemaining);
  }

  /**
   * Get the last proactive message time for a user
   */
  private getLastProactiveMessageTime(userId: string): Date | null {
    const proactiveActions = this.queue.filter(action => 
      action.type === 'proactive' && action.userId === userId
    ).concat(
      // Would also check completed actions from a log in production
      []
    );

    if (proactiveActions.length === 0) return null;
    
    return new Date(Math.max(...proactiveActions.map(a => a.scheduledFor.getTime())));
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const now = new Date();
    
    return {
      totalQueued: this.queue.length,
      processing: this.processing,
      messages: this.queue.filter(a => a.type === 'message').length,
      proactive: this.queue.filter(a => a.type === 'proactive').length,
      delayed: this.queue.filter(a => a.scheduledFor > now).length,
      ready: this.queue.filter(a => a.scheduledFor <= now).length,
      averagePriority: this.queue.reduce((sum, a) => sum + a.priority, 0) / this.queue.length || 0
    };
  }

  /**
   * Clear the queue (for testing/reset)
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    console.log(`🧹 Cleared ${count} actions from queue`);
    return count;
  }

  /**
   * Get actions for a specific user
   */
  getUserActions(userId: string): QueuedAction[] {
    return this.queue.filter(action => action.userId === userId);
  }

  /**
   * Cancel a specific action
   */
  cancelAction(actionId: string): boolean {
    const index = this.queue.findIndex(action => action.id === actionId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`❌ Cancelled action ${actionId}`);
      return true;
    }
    return false;
  }
}