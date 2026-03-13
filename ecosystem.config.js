/**
 * PM2 Ecosystem Configuration
 * 
 * This configuration separates the chatbot from the news scraping worker
 * to prevent memory issues. Each process runs in its own Node.js process
 * with independent memory limits.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js                # Start all processes
 *   pm2 start ecosystem.config.js --only chatbot # Start only chatbot
 *   pm2 start ecosystem.config.js --only news-worker # Start only news worker
 *   pm2 stop all                                 # Stop all processes
 *   pm2 logs                                     # View logs
 *   pm2 monit                                    # Monitor processes
 */

module.exports = {
  apps: [
    {
      name: 'chatbot',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        ENABLE_NEWS_SCHEDULER: 'false' // Disable scheduler in chatbot
      },
      env_development: {
        NODE_ENV: 'development',
        ENABLE_NEWS_SCHEDULER: 'false'
      },
      // Log configuration
      error_file: './logs/chatbot-error.log',
      out_file: './logs/chatbot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'news-worker',
      script: 'dist/commands/news-cli.js',
      instances: 1,
      autorestart: false, // Don't auto-restart, let cron schedule handle it
      watch: false,
      max_memory_restart: '4G', // News scraping needs more memory
      cron_restart: '0 */6 * * *', // Run every 6 hours (0:00, 6:00, 12:00, 18:00)
      env: {
        NODE_ENV: 'production',
        NEWS_WORKER_MODE: 'true'
      },
      env_development: {
        NODE_ENV: 'development',
        NEWS_WORKER_MODE: 'true'
      },
      // Log configuration
      error_file: './logs/news-worker-error.log',
      out_file: './logs/news-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Wait for process to gracefully shutdown before restart
      kill_timeout: 60000, // 60 seconds for news scraping to finish
      wait_ready: true,
      // Listen for ready signal from script
      listen_timeout: 3000
    }
  ]
};