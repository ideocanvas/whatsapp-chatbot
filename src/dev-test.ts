#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import * as readline from 'readline';

interface SendOptions {
  port: string;
  from: string;
  type: string;
}

interface InteractiveOptions {
  port: string;
  from: string;
}

const program = new Command();

program
  .name('dev-test')
  .description('CLI tool to send test messages to WhatsApp chatbot dev server')
  .version('1.0.0');

program
  .command('send')
  .description('Send a test message to the dev server')
  .argument('<message>', 'Message to send')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --from <number>', 'Sender phone number', '1234567890')
  .option('-t, --type <type>', 'Message type', 'text')
  .action(async (message: string, options: SendOptions) => {
    try {
      // Use the port from options, or fall back to PORT environment variable, or default to 3000
      const port = options.port || process.env.PORT || '3000';
      const webhookUrl = `http://localhost:${port}/webhook`;

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'test-entry-id',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '1234567890',
                    phone_number_id: 'test-phone-id'
                  },
                  messages: [
                    {
                      from: options.from,
                      id: `test-message-${Date.now()}`,
                      timestamp: Math.floor(Date.now() / 1000),
                      type: options.type,
                      text: {
                        body: message
                      }
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      console.log(`📤 Sending message to ${webhookUrl}:`);
      console.log(`💬 "${message}"`);
      console.log(`📞 From: ${options.from}`);
      console.log(`🌐 Port: ${port}`);
      console.log('---');

      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Dev-Test-CLI/1.0.0'
        }
      });

      console.log('✅ Message sent successfully!');
      console.log(`📋 Server response: ${response.status} ${response.statusText}`);
    } catch (error: any) {
      if (error.response) {
        console.error('❌ Server error:', error.response.status, error.response.statusText);
        console.error('📋 Response data:', error.response.data);
      } else if (error.request) {
        console.error('❌ Network error: Could not connect to server');
        console.error('💡 Make sure the dev server is running on port', options.port);
      } else {
        console.error('❌ Error:', error.message);
      }
      process.exit(1);
    }
  });

program
  .command('interactive')
  .description('Start interactive mode to send multiple messages')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --from <number>', 'Sender phone number', '1234567890')
  .action((options: InteractiveOptions) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('💬 Interactive mode started');
    console.log(`📞 Sender: ${options.from}`);
    console.log(`🌐 Server: http://localhost:${options.port}`);
    console.log('📝 Type your messages (type "exit" or "quit" to end):');
    console.log('---');

    const sendMessage = async (message: string) => {
      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        rl.close();
        return;
      }

      try {
        // Use the port from options, or fall back to PORT environment variable, or default to 3000
        const port = options.port || process.env.PORT || '3000';
        const webhookUrl = `http://localhost:${port}/webhook`;

        const payload = {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: 'test-entry-id',
              changes: [
                {
                  value: {
                    messaging_product: 'whatsapp',
                    metadata: {
                      display_phone_number: '1234567890',
                      phone_number_id: 'test-phone-id'
                    },
                    messages: [
                      {
                        from: options.from,
                        id: `test-message-${Date.now()}`,
                        timestamp: Math.floor(Date.now() / 1000),
                        type: 'text',
                        text: {
                          body: message
                        }
                      }
                    ]
                  },
                  field: 'messages'
                }
              ]
            }
          ]
        };

        await axios.post(webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Dev-Test-CLI/1.0.0'
          }
        });

        console.log('✅ Message sent!');
      } catch (error: any) {
        console.error('❌ Failed to send message:', error.message);
      }

      rl.question('💬 Next message: ', sendMessage);
    };

    rl.question('💬 Message: ', sendMessage);
  });

program.parse();