import { spawn } from 'child_process';
import * as https from 'https';
import * as http from 'http';

/**
 * Configuration for the Desktop-to-Web API service
 */
export interface DesktopToWebConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Response from sending text to clipboard
 */
export interface SendToClipboardResponse {
  status: 'success' | 'error';
  message?: string;
}

/**
 * Response from reading clipboard
 */
export interface ReadFromClipboardResponse {
  status: 'success' | 'error';
  text?: string;
  message?: string;
}

/**
 * Script template definition
 */
export interface ScriptTemplate {
  id: string;
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

/**
 * Response from listing script templates
 */
export interface ScriptTemplatesResponse {
  status: 'success' | 'error';
  templates?: ScriptTemplate[];
  message?: string;
}

/**
 * Response from executing a script
 */
export interface ExecuteScriptResponse {
  status: 'success' | 'error';
  message?: string;
  result?: any;
}

/**
 * Desktop-to-Web API Service
 * 
 * Provides methods to interact with the Python backend for:
 * - Sending text to remote clipboard
 * - Reading text from remote clipboard
 * - Listing and executing script templates
 * 
 * Based on the API documentation in docs/NODEJS_INTEGRATION.md
 * 
 * IMPLEMENTATION NOTE:
 * This service uses curl for all HTTP requests instead of axios to avoid
 * connection pooling and timeout issues. Curl is more reliable for long-running
 * requests and doesn't have the connection reuse problems that axios has.
 */
export class DesktopToWebService {
  private config: DesktopToWebConfig;

  constructor(config: DesktopToWebConfig) {
    this.config = config;
  }

  /**
   * Make a curl request with timeout
   * 
   * @param method - HTTP method (GET, POST, etc.)
   * @param url - Full URL to request
   * @param data - Optional data to send (for POST requests)
   * @param timeoutMs - Timeout in milliseconds (default: 30000)
   * @returns Promise with the parsed JSON response
   */
  private async curlRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    data?: any,
    timeoutMs: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-s',           // Silent mode
        '-L',           // Follow redirects
        '--max-time', String(Math.ceil(timeoutMs / 1000)), // Timeout in seconds
        '-H', `X-API-KEY: ${this.config.apiKey}`,
        '-H', 'Accept: application/json',
      ];

      if (method === 'POST') {
        args.push('-X', 'POST');
        args.push('-H', 'Content-Type: application/json');
        args.push('-d', JSON.stringify(data));
      }

      args.push(url);

      const curl = spawn('curl', args);

      let stdout = '';
      let stderr = '';

      curl.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      curl.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      curl.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result as T);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${stdout}`));
          }
        } else {
          reject(new Error(`curl exited with code ${code}: ${stderr || 'Unknown error'}`));
        }
      });

      curl.on('error', (err) => {
        reject(new Error(`curl error: ${err.message}`));
      });
    });
  }

  /**
   * Send text to the remote clipboard
   * 
   * @param text - The text to send to the clipboard
   * @returns Promise with the response status
   */
  async sendToClipboard(text: string): Promise<SendToClipboardResponse> {
    try {
      console.log(`📋 Sending text to clipboard: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      const response = await this.curlRequest<SendToClipboardResponse>(
        'POST',
        `${this.config.baseUrl}/api/send_to_clipboard`,
        { text },
        30000
      );

      console.log('✅ Text sent to clipboard successfully');
      return response;
    } catch (error) {
      console.error('❌ Error sending text to clipboard:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to send text to clipboard'
      };
    }
  }

  /**
   * Read text from the remote clipboard
   * 
   * @returns Promise with the clipboard content
   */
  async readFromClipboard(): Promise<ReadFromClipboardResponse> {
    try {
      console.log('📋 Reading from clipboard...');

      const response = await this.curlRequest<ReadFromClipboardResponse>(
        'GET',
        `${this.config.baseUrl}/api/read_from_clipboard`,
        undefined,
        30000
      );

      console.log(`✅ Clipboard read successfully: "${response.text?.substring(0, 50)}${response.text && response.text.length > 50 ? '...' : ''}"`);
      return response;
    } catch (error) {
      console.error('❌ Error reading from clipboard:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to read from clipboard'
      };
    }
  }

  /**
   * List available script templates
   * 
   * @returns Promise with the list of script templates
   */
  async listScriptTemplates(): Promise<ScriptTemplatesResponse> {
    try {
      console.log('📜 Listing script templates...');

      const response = await this.curlRequest<ScriptTemplatesResponse>(
        'GET',
        `${this.config.baseUrl}/api/script_templates`,
        undefined,
        30000
      );

      console.log(`✅ Found ${response.templates?.length || 0} script templates`);
      return response;
    } catch (error) {
      console.error('❌ Error listing script templates:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list script templates'
      };
    }
  }

  /**
   * Execute a script template
   *
   * @param templateId - The ID of the template to execute
   * @param parameters - Optional parameters for the script
   * @param timeoutSeconds - Optional timeout in seconds (default: 300)
   * @returns Promise with the execution result
   */
  async executeScript(
    templateId: string,
    parameters?: Record<string, any>,
    timeoutSeconds: number = 300
  ): Promise<ExecuteScriptResponse> {
    try {
      console.log(`🚀 Executing script template: ${templateId}`);
      if (parameters) {
        console.log(`   Parameters:`, parameters);
      }
      console.log(`   Timeout: ${timeoutSeconds}s`);

      const response = await this.curlRequest<ExecuteScriptResponse>(
        'POST',
        `${this.config.baseUrl}/api/execute_parameterized_script`,
        {
          template_id: templateId,
          parameters: parameters || {},
          timeout_seconds: timeoutSeconds
        },
        (timeoutSeconds + 10) * 1000 // Add 10s buffer to server timeout
      );

      console.log('✅ Script executed successfully');
      return response;
    } catch (error) {
      console.error(`❌ Error executing script template ${templateId}:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to execute script template'
      };
    }
  }

  /**
   * Check if the service is properly configured
   * 
   * @returns true if both baseUrl and apiKey are set
   */
  isConfigured(): boolean {
    return !!this.config.baseUrl && !!this.config.apiKey;
  }

  /**
   * Get the current configuration
   * 
   * @returns The service configuration
   */
  getConfig(): DesktopToWebConfig {
    return { ...this.config };
  }
}

/**
 * Helper function to create DesktopToWebService instance from environment variables
 * 
 * Environment variables:
 * - DESKTOP_TO_WEB_API_URL: Base URL of the desktop-to-web API (default: http://localhost:5000)
 * - DESKTOP_TO_WEB_API_KEY: API key for authentication (default: empty string)
 * 
 * @returns A new DesktopToWebService instance
 */
export function createDesktopToWebServiceFromEnv(): DesktopToWebService {
  const baseUrl = process.env.DESKTOP_TO_WEB_API_URL || 'http://localhost:5000';
  const apiKey = process.env.DESKTOP_TO_WEB_API_KEY || '';

  return new DesktopToWebService({ baseUrl, apiKey });
}