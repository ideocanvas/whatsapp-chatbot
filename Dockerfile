# Use official Node.js runtime as a base image
FROM node:20-bookworm AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including all Playwright browsers and FFmpeg
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
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN npx playwright install chromium --with-deps

# Copy source code
COPY . .

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build frontend
RUN cd frontend && npm run build

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build || { echo 'Build failed'; exit 1; }

# Production stage
FROM node:20-bookworm-slim AS production

# Install dumb-init and all required system dependencies for Playwright and FFmpeg
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
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs whatsapp-bot

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=whatsapp-bot:nodejs /app/dist ./dist
COPY --from=builder --chown=whatsapp-bot:nodejs /app/frontend/dist ./frontend/dist

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm globally
RUN npm install -g pnpm

# Install production dependencies including all Playwright browsers
RUN pnpm install --frozen-lockfile --prod && npm cache clean --force
RUN npx playwright install chromium --with-deps

# Copy other necessary files
COPY --chown=whatsapp-bot:nodejs .env.example ./
COPY --chown=whatsapp-bot:nodejs data/ ./data/
COPY --chown=whatsapp-bot:nodejs config/ ./config/
COPY --chown=whatsapp-bot:nodejs prisma/ ./prisma/
COPY --chown=whatsapp-bot:nodejs frontend/package.json ./frontend/
COPY --chown=whatsapp-bot:nodejs entrypoint.sh ./

# Create data directory if it doesn't exist
RUN mkdir -p data/conversations && chown whatsapp-bot:nodejs data/conversations

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/app/node_modules/playwright/.local-browsers
ENV CHROME_BIN=/usr/bin/chromium-browser

RUN chown -R whatsapp-bot:nodejs /app/

# Switch to non-root user
USER whatsapp-bot

# Expose the port the app runs on
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using entrypoint script
CMD ["./entrypoint.sh"]