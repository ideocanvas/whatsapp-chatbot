# Build stage - compile TypeScript and frontend
FROM node:20-bookworm AS builder

# Set working directory
WORKDIR /app

# Non-interactive installs (pnpm aborts without TTY unless CI is true)
ENV CI=true

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend
RUN cd frontend && pnpm run build

# Generate Prisma client (required for TypeScript compilation)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm exec prisma generate

# Build the application
RUN npm run build || { echo 'Build failed'; exit 1; }

# Production stage - use pre-built base image with all dependencies
FROM ideocanvas/whatsapp-chatbot-base:latest AS production

# Set working directory (already set in base but being explicit)
WORKDIR /app

# Switch to root to copy files, then switch back
USER root

# Copy package files from builder to ensure dependencies are up-to-date
COPY --chown=whatsapp-bot:nodejs --from=builder /app/package*.json ./
COPY --chown=whatsapp-bot:nodejs --from=builder /app/pnpm-lock.yaml ./
COPY --chown=whatsapp-bot:nodejs --from=builder /app/pnpm-workspace.yaml ./

# Reinstall all dependencies (including dev for Prisma CLI) to ensure they match updated packages
RUN pnpm install --frozen-lockfile && npm cache clean --force && chown -R whatsapp-bot:nodejs node_modules node_modules/.pnpm

# Copy built application from builder stage
COPY --chown=whatsapp-bot:nodejs --from=builder /app/dist ./dist
COPY --chown=whatsapp-bot:nodejs --from=builder /app/frontend/dist ./frontend/dist

# Copy other necessary files
COPY --chown=whatsapp-bot:nodejs .env.example ./
COPY --chown=whatsapp-bot:nodejs config/ ./config/
COPY --chown=whatsapp-bot:nodejs prisma/ ./prisma/
COPY --chown=whatsapp-bot:nodejs frontend/package.json ./frontend/
COPY --chown=whatsapp-bot:nodejs entrypoint.sh ./

# Switch to non-root user for Prisma generation to ensure correct file ownership
USER whatsapp-bot
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm exec prisma generate

# Switch back to root for remaining setup
USER root

# Create data directory if it doesn't exist
RUN mkdir -p data/conversations && chown -R whatsapp-bot:nodejs data/

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Switch to non-root user
USER whatsapp-bot

# Expose the port the app runs on
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using entrypoint script
CMD ["./entrypoint.sh"]