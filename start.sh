
#!/bin/bash

echo "🚀 [Gemini CodeLens PRO] Starting initialization..."

# Check for .env file
if [ ! -f .env ]; then
    echo "💡 [INFO] .env file not found, creating template..."
    echo "API_KEY=your_api_key_here" > .env
    echo "⚠️ [WARN] Please update the .env file with your real Gemini API Key, then run this script again."
    exit 1
fi

# Check for node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 [INFO] Installing dependencies..."
    npm install
fi

echo "✅ [SUCCESS] Environment ready. Launching application..."
npm run dev
