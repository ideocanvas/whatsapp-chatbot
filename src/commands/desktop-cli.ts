#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { DesktopToWebService, createDesktopToWebServiceFromEnv } from '../services/DesktopToWebService';

// Parse command line arguments
const program = new Command();

program
  .name('desktop')
  .description('Desktop-to-Web API command line tool for clipboard and script operations')
  .version('1.0.0')
  .option('-v, --verbose', 'Show verbose output including HTTP responses');

// Send text to clipboard command
program
  .command('clipboard:send')
  .description('Send text to the remote clipboard')
  .requiredOption('-t, --text <text>', 'Text to send to clipboard (required)')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const service = createDesktopToWebServiceFromEnv();

      if (!service.isConfigured()) {
        console.error('❌ DesktopToWebService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY in .env');
        process.exit(1);
      }

      if (globalOptions.verbose) {
        console.log('📤 Request Body:', JSON.stringify({ text: options.text }, null, 2));
      }

      const result = await service.sendToClipboard(options.text);

      if (globalOptions.verbose) {
        console.log('📡 HTTP Response:', JSON.stringify(result, null, 2));
      }

      if (result.status === 'success') {
        console.log('✅ Text sent to clipboard successfully');
      } else {
        console.error('❌ Failed to send text to clipboard:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during clipboard send:', error);
      process.exit(1);
    }
  });

// Read text from clipboard command
program
  .command('clipboard:read')
  .description('Read text from the remote clipboard')
  .action(async () => {
    try {
      const globalOptions = program.opts();
      const service = createDesktopToWebServiceFromEnv();

      if (!service.isConfigured()) {
        console.error('❌ DesktopToWebService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY in .env');
        process.exit(1);
      }

      if (globalOptions.verbose) {
        console.log('📤 Request Body: (GET request - no body)');
      }

      const result = await service.readFromClipboard();

      if (globalOptions.verbose) {
        console.log('📡 HTTP Response:', JSON.stringify(result, null, 2));
      }

      if (result.status === 'success') {
        console.log('✅ Clipboard content:');
        console.log(result.text || '(empty)');
      } else {
        console.error('❌ Failed to read from clipboard:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during clipboard read:', error);
      process.exit(1);
    }
  });

// List script templates command
program
  .command('templates:list')
  .description('List available script templates')
  .action(async () => {
    try {
      const globalOptions = program.opts();
      const service = createDesktopToWebServiceFromEnv();

      if (!service.isConfigured()) {
        console.error('❌ DesktopToWebService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY in .env');
        process.exit(1);
      }

      if (globalOptions.verbose) {
        console.log('📤 Request Body: (GET request - no body)');
      }

      const result = await service.listScriptTemplates();

      if (globalOptions.verbose) {
        console.log('📡 HTTP Response:', JSON.stringify(result, null, 2));
      }

      if (result.status === 'success' && result.templates) {
        console.log(`✅ Found ${result.templates.length} script templates:\n`);
        result.templates.forEach((template, index) => {
          console.log(`${index + 1}. ${template.name} (ID: ${template.id})`);
          if (template.description) {
            console.log(`   Description: ${template.description}`);
          }
          if (template.parameters) {
            console.log(`   Parameters:`);
            // Handle both array and object formats
            const params = Array.isArray(template.parameters)
              ? template.parameters
              : Object.entries(template.parameters);
            
            for (const param of params) {
              if (Array.isArray(param)) {
                // Object format: [name, info]
                const [paramName, paramInfo] = param;
                if (typeof paramInfo === 'object' && paramInfo !== null) {
                  const info = paramInfo as any;
                  const desc = info.description || info.desc || '';
                  const type = info.type || '';
                  console.log(`     --${paramName}${type ? ` (${type})` : ''}${desc ? `: ${desc}` : ''}`);
                } else {
                  console.log(`     --${paramName}`);
                }
              } else if (typeof param === 'object' && param !== null) {
                // Array format: { name, description, type, ... }
                const info = param as any;
                const name = info.name || info.id || '';
                const desc = info.description || info.desc || '';
                const type = info.type || '';
                console.log(`     --${name}${type ? ` (${type})` : ''}${desc ? `: ${desc}` : ''}`);
              }
            }
          }
          console.log('');
        });
      } else {
        console.error('❌ Failed to list script templates:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during template listing:', error);
      process.exit(1);
    }
  });

// Show template help command
program
  .command('template:help')
  .description('Show help for a specific script template')
  .requiredOption('-i, --id <templateId>', 'Template ID to show help for (required)')
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const service = createDesktopToWebServiceFromEnv();

      if (!service.isConfigured()) {
        console.error('❌ DesktopToWebService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY in .env');
        process.exit(1);
      }

      if (globalOptions.verbose) {
        console.log('📤 Request Body: (GET request - no body)');
      }

      const result = await service.listScriptTemplates();

      if (globalOptions.verbose) {
        console.log('📡 HTTP Response:', JSON.stringify(result, null, 2));
      }

      if (result.status === 'success' && result.templates) {
        const template = result.templates.find(t => t.id === options.id);
        if (!template) {
          console.error(`❌ Template with ID "${options.id}" not found`);
          process.exit(1);
        }

        console.log(`📜 Template: ${template.name}`);
        console.log(`   ID: ${template.id}`);
        if (template.description) {
          console.log(`   Description: ${template.description}`);
        }

        if (template.parameters && Array.isArray(template.parameters) && template.parameters.length > 0) {
          console.log(`\n   Parameters:`);
          for (const param of template.parameters) {
            if (typeof param === 'object' && param !== null) {
              const info = param as any;
              const name = info.name || info.id || '';
              const desc = info.description || info.desc || '';
              const type = info.type || 'string';
              const required = info.required ? ' (required)' : ' (optional)';
              console.log(`     --${name}${required}${type ? ` (${type})` : ''}${desc ? `: ${desc}` : ''}`);
            }
          }
          console.log(`\n   Usage:`);
          console.log(`     pnpm run desktop:cli template:execute -i ${template.id} \\`);
          for (const param of template.parameters) {
            if (typeof param === 'object' && param !== null) {
              const info = param as any;
              const name = info.name || info.id || '';
              console.log(`       --${name} "<value>" \\`);
            }
          }
          console.log(`       [--verbose]`);
        } else {
          console.log(`\n   No parameters required`);
          console.log(`\n   Usage:`);
          console.log(`     pnpm run desktop:cli template:execute -i ${template.id} [--verbose]`);
        }
      } else {
        console.error('❌ Failed to list script templates:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during template help:', error);
      process.exit(1);
    }
  });

// Execute script template command
program
  .command('template:execute')
  .description('Execute a script template with optional parameters')
  .requiredOption('-i, --id <templateId>', 'Template ID to execute (required)')
  .option('-t, --timeout <seconds>', 'Timeout in seconds (default: 300)', '300')
  .allowUnknownOption(true)
  .action(async (options) => {
    try {
      const globalOptions = program.opts();
      const service = createDesktopToWebServiceFromEnv();

      if (!service.isConfigured()) {
        console.error('❌ DesktopToWebService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY in .env');
        process.exit(1);
      }

      // First, fetch the template to get parameter definitions
      const templatesResult = await service.listScriptTemplates();
      if (templatesResult.status !== 'success' || !templatesResult.templates) {
        console.error('❌ Failed to fetch template definitions:', templatesResult.message);
        process.exit(1);
      }

      const template = templatesResult.templates.find(t => t.id === options.id);
      if (!template) {
        console.error(`❌ Template with ID "${options.id}" not found`);
        process.exit(1);
      }

      // Build parameter map from template definition
      const paramMap: Record<string, any> = {};
      if (template.parameters && Array.isArray(template.parameters)) {
        for (const param of template.parameters) {
          if (typeof param === 'object' && param !== null) {
            const info = param as any;
            const name = info.name || info.id || '';
            if (name) {
              paramMap[name] = info;
            }
          }
        }
      }

      // Parse parameters from unknown options (format: --<var> "value")
      const parameters: Record<string, any> = {};
      const unknownOptions = program.parseOptions(process.argv).unknown;
      
      // Known options that should not be treated as parameters
      const knownOptions = new Set(['id', 'verbose', 'v', 'timeout', 't']);

      for (let i = 0; i < unknownOptions.length; i++) {
        const opt = unknownOptions[i];
        if (opt.startsWith('--')) {
          const key = opt.slice(2);
          // Skip known options
          if (knownOptions.has(key)) {
            continue;
          }
          const value = unknownOptions[i + 1];
          // Only add value if it's not another option
          if (value && !value.startsWith('--')) {
            // Type conversion based on parameter definition
            const paramDef = paramMap[key];
            if (paramDef) {
              const type = paramDef.type || 'string';
              if (type === 'number') {
                parameters[key] = parseFloat(value);
              } else if (type === 'boolean') {
                parameters[key] = value.toLowerCase() === 'true';
              } else if (type === 'json') {
                try {
                  parameters[key] = JSON.parse(value);
                } catch {
                  parameters[key] = value;
                }
              } else {
                parameters[key] = value;
              }
            } else {
              parameters[key] = value;
            }
            i++; // Skip the value in the next iteration
          } else {
            parameters[key] = true; // Flag without value
          }
        }
      }

      // Validate required parameters
      if (template.parameters && Array.isArray(template.parameters)) {
        for (const param of template.parameters) {
          if (typeof param === 'object' && param !== null) {
            const info = param as any;
            const name = info.name || info.id || '';
            if (info.required && !(name in parameters)) {
              console.error(`❌ Required parameter "--${name}" is missing`);
              console.log(`\n💡 Run 'pnpm run desktop:cli template:help -i ${options.id}' for usage information`);
              process.exit(1);
            }
          }
        }
      }

      console.log(`🚀 Executing template: ${options.id}`);
      if (Object.keys(parameters).length > 0) {
        console.log(`   Parameters:`, parameters);
      }

      const timeout = parseInt(options.timeout, 10) || 300;

      if (globalOptions.verbose) {
        console.log('📤 Request Body:', JSON.stringify({
          template_id: options.id,
          parameters: parameters,
          timeout_seconds: timeout
        }, null, 2));
      }

      const result = await service.executeScript(options.id, parameters, timeout);

      if (globalOptions.verbose) {
        console.log('📡 HTTP Response:', JSON.stringify(result, null, 2));
      }

      if (result.status === 'success') {
        console.log('✅ Script executed successfully');
        if (result.result !== undefined) {
          console.log('Result:', result.result);
        }
      } else {
        console.error('❌ Failed to execute script template:', result.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error during template execution:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parseAsync(process.argv).catch((error) => {
  console.error('❌ Command execution failed:', error);
  process.exit(1);
});