#!/bin/bash

echo "🚀 Starting Python Polymarket Backend..."

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo "🌐 Starting FastAPI server on port 8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload