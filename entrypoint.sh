#!/bin/bash
set -e

# Function to handle graceful shutdown
graceful_shutdown() {
    echo "Received SIGTERM/SIGINT, shutting down gracefully..."
    # Add any cleanup logic here if needed
    exit 0
}

# Trap signals for graceful shutdown
trap 'graceful_shutdown' SIGTERM SIGINT

# Set default environment variables if not set
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3000}

# Check if the dist directory exists and contains the built application
if [ ! -f "dist/index.js" ]; then
    echo "Error: dist/index.js not found. Please build the application first."
    echo "If running in development, you may need to run: npm run build"
    exit 1
fi

# Check if .env file exists, if not, use .env.example
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "Warning: .env file not found, using .env.example as template"
    cp .env.example .env
    echo "Created .env file from .env.example template"
fi

# Ensure data directory exists with proper permissions
mkdir -p data/conversations
chmod 755 data data/conversations

# Install Playwright browsers if not already installed
echo "Checking Playwright browser installation..."
if [ ! -d "node_modules/playwright/.local-browsers" ]; then
    echo "Playwright browsers not found, installing..."
    npx playwright install chromium
else
    echo "Playwright browsers already installed"
fi

echo "Starting WhatsApp Chat Bot in $NODE_ENV mode on port $PORT"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Start the application
exec node dist/index.js