# Use official Node.js runtime as a base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whatsapp-bot -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=whatsapp-bot:nodejs /app/dist ./dist

# Copy other necessary files
COPY --chown=whatsapp-bot:nodejs .env.example ./
COPY --chown=whatsapp-bot:nodejs data/ ./data/

# Create data directory if it doesn't exist
RUN mkdir -p data/conversations && chown whatsapp-bot:nodejs data/conversations

# Switch to non-root user
USER whatsapp-bot

# Expose the port the app runs on
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]