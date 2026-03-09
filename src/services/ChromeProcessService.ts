/**
 * ChromeProcessService
 * 
 * Manages the Chrome browser process lifecycle:
 * - Auto-starts Chrome with remote debugging enabled
 * - Tracks the process PID
 * - Monitors process health
 * - Auto-restarts if the process dies
 * 
 * This ensures the Chrome browser is always available for the ChromeRemoteDebugService.
 */

import { spawn, ChildProcess, execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for ChromeProcessService
 */
export interface ChromeProcessConfig {
  /** Path to Chrome executable (default: /opt/google/chrome/chrome) */
  chromePath?: string;
  /** Remote debugging port (default: 9222) */
  port?: number;
  /** User data directory for Chrome profile */
  userDataDir?: string;
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number;
  /** Auto restart on crash (default: true) */
  autoRestart?: boolean;
  /** Max restart attempts before giving up (default: 5) */
  maxRestartAttempts?: number;
  /** Delay between restart attempts in ms (default: 5000) */
  restartDelay?: number;
  /** Run in headless mode (default: false - browser will be visible) */
  headless?: boolean;
}

/**
 * Status of the Chrome process
 */
export interface ChromeProcessStatus {
  isRunning: boolean;
  pid: number | null;
  port: number;
  startedAt: Date | null;
  restartCount: number;
  lastError: string | null;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<ChromeProcessConfig> = {
  chromePath: '/opt/google/chrome/chrome',
  port: 9222,
  userDataDir: '/home/ubuntu/remote-chrome-user-dir',
  healthCheckInterval: 30000,
  autoRestart: true,
  maxRestartAttempts: 5,
  restartDelay: 5000,
  headless: false, // Default to visible browser
};

/**
 * ChromeProcessService
 * 
 * Manages the Chrome browser process with remote debugging enabled.
 * Provides auto-start, health monitoring, and auto-restart capabilities.
 */
export class ChromeProcessService {
  private config: Required<ChromeProcessConfig>;
  private chromeProcess: ChildProcess | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartCount = 0;
  private startedAt: Date | null = null;
  private lastError: string | null = null;
  private isShuttingDown = false;

  constructor(config?: ChromeProcessConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the Chrome process with remote debugging
   * 
   * @returns Promise that resolves when Chrome is started
   */
  async start(): Promise<void> {
    if (this.isRunning()) {
      console.log('🔄 Chrome process already running, skipping start');
      return;
    }

    console.log('🚀 Starting Chrome with remote debugging...');
    console.log(`   Port: ${this.config.port}`);
    console.log(`   User Data Dir: ${this.config.userDataDir}`);

    // Ensure user data directory exists
    await this.ensureUserDataDir();

    // Kill any existing Chrome process on the same port
    await this.killExistingProcessOnPort();

    try {
      // Start Chrome with remote debugging
      const args = [
        `--remote-debugging-port=${this.config.port}`,
        `--user-data-dir=${this.config.userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-sandbox',
        '--disable-gpu',
      ];

      // Add headless mode if configured (default: false = visible browser)
      if (this.config.headless) {
        args.push('--headless=new');
      }

      this.chromeProcess = spawn(this.config.chromePath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle process events
      this.chromeProcess.on('error', (error) => {
        console.error('❌ Chrome process error:', error);
        this.lastError = error.message;
        this.handleProcessExit();
      });

      this.chromeProcess.on('exit', (code, signal) => {
        console.log(`🛑 Chrome process exited with code ${code}, signal ${signal}`);
        this.lastError = `Process exited with code ${code}, signal ${signal}`;
        this.handleProcessExit();
      });

      // Log stdout/stderr for debugging
      if (this.chromeProcess.stdout) {
        this.chromeProcess.stdout.on('data', (data) => {
          console.log(`[Chrome stdout] ${data.toString().trim()}`);
        });
      }

      if (this.chromeProcess.stderr) {
        this.chromeProcess.stderr.on('data', (data) => {
          console.error(`[Chrome stderr] ${data.toString().trim()}`);
        });
      }

      // Wait for Chrome to be ready
      await this.waitForReady();

      this.startedAt = new Date();
      this.restartCount = 0;
      console.log(`✅ Chrome started successfully (PID: ${this.chromeProcess.pid})`);

      // Start health monitoring
      this.startHealthCheck();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to start Chrome:', errorMessage);
      this.lastError = errorMessage;
      throw error;
    }
  }

  /**
   * Stop the Chrome process
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Chrome process...');
    this.isShuttingDown = true;

    // Stop health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.chromeProcess) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('⚠️ Chrome did not exit gracefully, forcing kill...');
          if (this.chromeProcess) {
            this.chromeProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.chromeProcess!.on('exit', () => {
          clearTimeout(timeout);
          this.chromeProcess = null;
          console.log('✅ Chrome process stopped');
          resolve();
        });

        // Try graceful shutdown first
        this.chromeProcess!.kill('SIGTERM');
      });
    }
  }

  /**
   * Check if Chrome process is running
   */
  isRunning(): boolean {
    if (!this.chromeProcess || !this.chromeProcess.pid) {
      return false;
    }

    try {
      // Send signal 0 to check if process is alive
      process.kill(this.chromeProcess.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current process status
   */
  getStatus(): ChromeProcessStatus {
    return {
      isRunning: this.isRunning(),
      pid: this.chromeProcess?.pid ?? null,
      port: this.config.port,
      startedAt: this.startedAt,
      restartCount: this.restartCount,
      lastError: this.lastError,
    };
  }

  /**
   * Get the PID of the Chrome process
   */
  getPid(): number | null {
    return this.chromeProcess?.pid ?? null;
  }

  /**
   * Check if Chrome debugging port is responding
   */
  async isPortReady(): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2000);

      socket.connect(this.config.port, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Ensure the user data directory exists
   */
  private async ensureUserDataDir(): Promise<void> {
    if (!fs.existsSync(this.config.userDataDir)) {
      console.log(`📁 Creating Chrome user data directory: ${this.config.userDataDir}`);
      fs.mkdirSync(this.config.userDataDir, { recursive: true });
    }
  }

  /**
   * Kill any existing Chrome process using the same port
   */
  private async killExistingProcessOnPort(): Promise<void> {
    try {
      // Find process listening on the port
      const result = execSync(`lsof -ti:${this.config.port} 2>/dev/null || true`, {
        encoding: 'utf-8',
      }).trim();

      if (result) {
        const pids = result.split('\n').filter(Boolean);
        for (const pid of pids) {
          console.log(`⚠️ Killing existing process on port ${this.config.port} (PID: ${pid})`);
          try {
            process.kill(parseInt(pid, 10), 'SIGTERM');
            // Wait a bit for process to exit
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch {
            // Process might already be dead
          }
        }
      }
    } catch (error) {
      // lsof might not be available, that's okay
      console.log('ℹ️ Could not check for existing processes on port (lsof not available)');
    }
  }

  /**
   * Wait for Chrome to be ready
   */
  private async waitForReady(): Promise<void> {
    const maxAttempts = 30;
    const delayMs = 500;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (await this.isPortReady()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`Chrome failed to start within ${(maxAttempts * delayMs) / 1000} seconds`);
  }

  /**
   * Handle process exit (crash or unexpected termination)
   */
  private handleProcessExit(): void {
    this.chromeProcess = null;

    if (this.isShuttingDown) {
      return;
    }

    if (this.config.autoRestart && this.restartCount < this.config.maxRestartAttempts) {
      this.restartCount++;
      console.log(`🔄 Auto-restarting Chrome (attempt ${this.restartCount}/${this.config.maxRestartAttempts})...`);
      
      setTimeout(() => {
        this.start().catch((error) => {
          console.error('❌ Failed to restart Chrome:', error);
        });
      }, this.config.restartDelay);
    } else if (this.restartCount >= this.config.maxRestartAttempts) {
      console.error(`❌ Max restart attempts (${this.config.maxRestartAttempts}) reached. Giving up.`);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      const isRunning = this.isRunning();
      const isPortReady = await this.isPortReady();

      if (!isRunning || !isPortReady) {
        console.log('⚠️ Chrome health check failed:');
        console.log(`   Process running: ${isRunning}`);
        console.log(`   Port ready: ${isPortReady}`);
        
        if (!this.isShuttingDown && this.config.autoRestart) {
          console.log('🔄 Triggering restart due to health check failure...');
          this.handleProcessExit();
        }
      }
    }, this.config.healthCheckInterval);
  }
}

/**
 * Singleton instance for global access
 */
let chromeProcessServiceInstance: ChromeProcessService | null = null;

/**
 * Get or create the ChromeProcessService singleton
 */
export function getChromeProcessService(config?: ChromeProcessConfig): ChromeProcessService {
  if (!chromeProcessServiceInstance) {
    chromeProcessServiceInstance = new ChromeProcessService(config);
  }
  return chromeProcessServiceInstance;
}

/**
 * Create ChromeProcessService from environment variables
 */
export function createChromeProcessServiceFromEnv(): ChromeProcessService {
  return new ChromeProcessService({
    chromePath: process.env.CHROME_PATH || DEFAULT_CONFIG.chromePath,
    port: process.env.CHROME_DEBUG_PORT ? parseInt(process.env.CHROME_DEBUG_PORT, 10) : DEFAULT_CONFIG.port,
    userDataDir: process.env.CHROME_USER_DATA_DIR || DEFAULT_CONFIG.userDataDir,
    healthCheckInterval: process.env.CHROME_HEALTH_CHECK_INTERVAL
      ? parseInt(process.env.CHROME_HEALTH_CHECK_INTERVAL, 10)
      : DEFAULT_CONFIG.healthCheckInterval,
    autoRestart: process.env.CHROME_AUTO_RESTART !== 'false',
    maxRestartAttempts: process.env.CHROME_MAX_RESTART_ATTEMPTS
      ? parseInt(process.env.CHROME_MAX_RESTART_ATTEMPTS, 10)
      : DEFAULT_CONFIG.maxRestartAttempts,
    restartDelay: process.env.CHROME_RESTART_DELAY
      ? parseInt(process.env.CHROME_RESTART_DELAY, 10)
      : DEFAULT_CONFIG.restartDelay,
    headless: process.env.CHROME_HEADLESS === 'true', // Default: false (visible browser)
  });
}