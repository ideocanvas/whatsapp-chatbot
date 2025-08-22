# Use official Node.js runtime as a base image
FROM node:20-bookworm AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including Playwright WebKit browser
RUN npm ci --only=production && npx playwright install webkit

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS production

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs whatsapp-bot

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies including Playwright WebKit browser
RUN npm ci --only=production && npx playwright install webkit && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=whatsapp-bot:nodejs /app/dist ./dist

# Copy other necessary files
COPY --chown=whatsapp-bot:nodejs .env.example ./
COPY --chown=whatsapp-bot:nodejs data/ ./data/

# Create data directory if it doesn't exist
RUN mkdir -p data/conversations && chown whatsapp-bot:nodejs data/conversations

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/app/node_modules/playwright/.local-browsers
ENV CHROME_BIN=/usr/bin/chromium-browser

# Switch to non-root user
USER whatsapp-bot

# Expose the port the app runs on
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]