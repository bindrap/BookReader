#!/bin/bash

# BookReader Docker Startup Script

echo "🚀 Starting BookReader..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose:"
    echo "   https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if .env exists, if not create from example
if [ ! -f .env ]; then
    echo "ℹ️  No .env file found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. You may want to edit it and set a secure JWT_SECRET."
        echo ""
    fi
fi

# Start the application
echo "🐳 Starting Docker containers..."
docker compose up -d

# Wait a moment for the container to start
sleep 3

# Check if container is running
if docker compose ps | grep -q "Up"; then
    echo ""
    echo "✅ BookReader is now running!"
    echo ""
    echo "📖 Open your browser and go to:"
    echo "   http://localhost:8669"
    echo ""
    echo "📝 First time? Create an account to get started!"
    echo ""
    echo "To view logs:    docker compose logs -f"
    echo "To stop:         docker compose down"
    echo ""
else
    echo ""
    echo "❌ Failed to start BookReader. Check the logs:"
    echo "   docker compose logs"
    exit 1
fi
