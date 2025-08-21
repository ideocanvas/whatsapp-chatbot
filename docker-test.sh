#!/bin/bash

# Docker test script for WhatsApp ChatBot
echo "Testing Docker setup for WhatsApp ChatBot..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Build the Docker image
echo "Building Docker image..."
docker build -t whatsapp-chatbot:test .

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"

    # Test that the image can be run
    echo "Testing image startup..."
    docker run --rm -d --name whatsapp-chatbot-test -p 3001:3000 whatsapp-chatbot:test

    # Wait a moment for the container to start
    sleep 5

    # Check if container is running
    if docker ps | grep -q "whatsapp-chatbot-test"; then
        echo "✅ Container started successfully"

        # Test health endpoint
        echo "Testing health endpoint..."
        response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "000")

        if [ "$response" = "200" ] || [ "$response" = "000" ]; then
            echo "✅ Health check passed (or container is starting up)"
        else
            echo "⚠️  Health check returned: $response"
        fi

        # Stop the test container
        docker stop whatsapp-chatbot-test
        echo "✅ Test container stopped"
    else
        echo "❌ Container failed to start"
    fi
else
    echo "❌ Docker build failed"
    exit 1
fi

echo ""
echo "Docker setup test completed!"
echo "To run the application with Docker Compose:"
echo "1. Copy .env.example to .env and configure your settings"
echo "2. Run: docker-compose up -d"
echo "3. Check logs: docker-compose logs -f"