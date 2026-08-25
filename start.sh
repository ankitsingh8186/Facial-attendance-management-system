#!/bin/bash
echo ""
echo "🚀 Starting FaceTrack — Live Attendance System"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org"
  exit 1
fi

# Install deps if needed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing dependencies..."
  cd backend && npm install && cd ..
  echo "✅ Done"
fi

echo "🔑 Make sure ANTHROPIC_API_KEY is set!"
echo "   export ANTHROPIC_API_KEY=your_key_here"
echo ""
echo "🌐 Opening: http://localhost:3001"
echo ""

cd backend && node server.js
