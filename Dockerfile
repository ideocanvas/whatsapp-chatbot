# Use official Node.js runtime as a base image
FROM node:20-bookworm AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including all Playwright browsers
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN npx playwright install chromium --with-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS production

# Install dumb-init and all required system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    dumb-init \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs whatsapp-bot

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install production dependencies including all Playwright browsers
RUN npx playwright install chromium --with-deps && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=whatsapp-bot:nodejs /app/dist ./dist

# Copy other necessary files
COPY --chown=whatsapp-bot:nodejs .env.example ./
COPY --chown=whatsapp-bot:nodejs data/ ./data/
COPY --chown=whatsapp-bot:nodejs config/ ./config/
COPY --chown=whatsapp-bot:nodejs entrypoint.sh ./

# Create data directory if it doesn't exist
RUN mkdir -p data/conversations && chown whatsapp-bot:nodejs data/conversations

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/app/node_modules/playwright/.local-browsers
ENV CHROME_BIN=/usr/bin/chromium-browser

RUN chown -R whatsapp-bot:nodejs /app/

RUN npm install -g pnpm
# Switch to non-root user
USER whatsapp-bot

RUN pnpm install --frozen-lockfile
COPY pnpm-workspace.yaml ./
RUN pnpm rebuild better-sqlite3

# Expose the port the app runs on
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using entrypoint script
CMD ["./entrypoint.sh"]