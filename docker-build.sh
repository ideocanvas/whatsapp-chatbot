#!/bin/bash
# Build script for two-stage Docker images

set -e

echo "🏗️  Building WhatsApp Chatbot Docker Images"
echo ""

# Build base image (only needs to be rebuilt when dependencies change)
echo "📦 Step 1: Building base image with dependencies..."
echo "   This step is slow but only needs to run when package.json or system deps change"
docker build -f Dockerfile.base -t ideocanvas/whatsapp-chatbot-base:latest .

echo ""
echo "✅ Base image built successfully"
echo ""

# Build production image (fast, only copies compiled code)
echo "🚀 Step 2: Building production image..."
docker compose build whatsapp-chatbot

echo ""
echo "✅ Production image built successfully"
echo ""
echo "🎉 Build complete!"
echo ""
echo "Next steps:"
echo "  - Push base image: docker push ideocanvas/whatsapp-chatbot-base:latest"
echo "  - Push prod image: docker push ideocanvas/whatsapp-chatbot:v3"
echo "  - Start services: docker compose up -d"
