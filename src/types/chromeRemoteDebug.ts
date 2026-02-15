/**
 * Type definitions for ChromeRemoteDebugService
 */

/**
 * Configuration for ChromeRemoteDebugService
 */
export interface ChromeRemoteDebugConfig {
  /** CDP endpoint URL (e.g., http://127.0.0.1:9222) */
  endpoint: string;
  /** Navigation timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Connection retry count (default: 3) */
  retries?: number;
  /** Retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
}

/**
 * Options for page navigation
 */
export interface NavigateOptions {
  /** Page load timeout in milliseconds */
  timeout?: number;
  /** When to consider navigation complete */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

/**
 * Result of a navigation operation
 */
export interface NavigateResult {
  /** Whether navigation was successful */
  success: boolean;
  /** Final URL after any redirects */
  url: string;
  /** Page title */
  title: string;
  /** HTTP status code if available */
  statusCode?: number;
  /** Error message if navigation failed */
  error?: string;
}

/**
 * Page content result
 */
export interface PageContent {
  /** Final URL after any redirects */
  url: string;
  /** Page title */
  title: string;
  /** Full HTML content */
  html: string;
  /** Timestamp when content was retrieved */
  timestamp: Date;
}

/**
 * Health check result
 */
export interface HealthStatus {
  /** Whether the connection is healthy */
  healthy: boolean;
  /** Browser version if connected */
  browserVersion?: string;
  /** Number of open contexts */
  contextCount?: number;
  /** Number of open pages */
  pageCount?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of the check */
  timestamp: Date;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Connection status information
 */
export interface ConnectionStatus {
  /** Current connection state */
  state: ConnectionState;
  /** Endpoint URL */
  endpoint: string;
  /** Last successful connection time */
  lastConnected?: Date;
  /** Last error if any */
  lastError?: string;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
}
