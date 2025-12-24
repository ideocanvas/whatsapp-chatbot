import axios from 'axios';

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
 */
export class DesktopToWebService {
  private config: DesktopToWebConfig;

  constructor(config: DesktopToWebConfig) {
    this.config = config;
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

      const response = await axios.post(
        `${this.config.baseUrl}/api/send_to_clipboard`,
        { text },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.config.apiKey
          }
        }
      );

      console.log('✅ Text sent to clipboard successfully');
      return response.data as SendToClipboardResponse;
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

      const response = await axios.get(
        `${this.config.baseUrl}/api/read_from_clipboard`,
        {
          headers: {
            'X-API-KEY': this.config.apiKey
          }
        }
      );

      const data = response.data as ReadFromClipboardResponse;
      console.log(`✅ Clipboard read successfully: "${data.text?.substring(0, 50)}${data.text && data.text.length > 50 ? '...' : ''}"`);
      return data;
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

      const response = await axios.get(
        `${this.config.baseUrl}/api/script_templates`,
        {
          headers: {
            'X-API-KEY': this.config.apiKey
          }
        }
      );

      const data = response.data as ScriptTemplatesResponse;
      console.log(`✅ Found ${data.templates?.length || 0} script templates`);
      return data;
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
   * @returns Promise with the execution result
   */
  async executeScript(
    templateId: string,
    parameters?: Record<string, any>
  ): Promise<ExecuteScriptResponse> {
    try {
      console.log(`🚀 Executing script template: ${templateId}`);
      if (parameters) {
        console.log(`   Parameters:`, parameters);
      }

      const response = await axios.post(
        `${this.config.baseUrl}/api/execute_parameterized_script`,
        {
          template_id: templateId,
          parameters: parameters || {}
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.config.apiKey
          }
        }
      );

      console.log('✅ Script executed successfully');
      return response.data as ExecuteScriptResponse;
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