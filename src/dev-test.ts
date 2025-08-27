#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import * as readline from 'readline';

interface SendOptions {
  port: string;
  from: string;
}

const program = new Command();

program
  .name('dev-test')
  .description('CLI chat client for WhatsApp chatbot dev server')
  .version('1.0.0')
  .argument('[message]', 'Message to send (if not provided, enters interactive chat mode)')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --from <number>', 'Sender phone number', '1234567890')
  .action(async (message: string | undefined, options: SendOptions) => {
    try {
      const port = options.port || process.env.PORT || '3000';
      const devApiUrl = `http://localhost:${port}/dev/message`;

      if (message) {
        // Send single message from command line
        console.log(`📤 Sending message to ${devApiUrl}:`);
        console.log(`💬 "${message}"`);
        console.log(`📞 From: ${options.from}`);
        console.log(`🌐 Port: ${port}`);
        console.log('---');

        const response = await axios.post(devApiUrl, {
          message: message,
          from: options.from
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Dev-Test-CLI/1.0.0'
          }
        });

        console.log('✅ Message processed successfully!');
        console.log(`🤖 Response: ${response.data.response}`);
        console.log(`📋 Server status: ${response.status} ${response.statusText}`);
      } else {
        // Enter interactive chat mode
        console.log('💬 Interactive chat mode started');
        console.log(`📞 Sender: ${options.from}`);
        console.log(`🌐 Server: http://localhost:${port}`);
        console.log('📝 Type your messages (type "exit" or "quit" to end):');
        console.log('---');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const chatLoop = async () => {
          rl.question('👤 You: ', async (userMessage: string) => {
            if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
              console.log('👋 Goodbye!');
              rl.close();
              return;
            }

            try {
              console.log('⏳ Thinking...');

              const response = await axios.post(devApiUrl, {
                message: userMessage,
                from: options.from
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Dev-Test-CLI/1.0.0'
                }
              });

              console.log(`🤖 AI: ${response.data.response}`);
              console.log('---');

              // Continue the chat loop
              chatLoop();
            } catch (error: any) {
              console.error('❌ Error:', error.message);
              console.log('---');
              // Continue the chat loop even on error
              chatLoop();
            }
          });
        };

        // Start the chat loop
        chatLoop();
      }
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

program.parse();