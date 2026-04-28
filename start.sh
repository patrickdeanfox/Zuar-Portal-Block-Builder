#!/bin/bash
# Block Builder — launcher
# Double-click or run: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check Node
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed. Get it at https://nodejs.org"
  read -p "Press Enter to exit..."
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "  Installing dependencies..."
  npm install
  echo ""
fi

echo ""
echo "  ╔════════════════════════════════════════════╗"
echo "  ║    Zuar Block Builder                      ║"
echo "  ╠════════════════════════════════════════════╣"
echo "  ║   Opening http://localhost:3131            ║"
echo "  ║   Press Ctrl+C to stop                     ║"
echo "  ╚════════════════════════════════════════════╝"
echo ""

# Open browser after a short delay (works on Linux, Mac, Windows/WSL)
(sleep 1.5 && \
  if command -v xdg-open &>/dev/null; then xdg-open http://localhost:3131; \
  elif command -v open &>/dev/null; then open http://localhost:3131; \
  elif command -v start &>/dev/null; then start http://localhost:3131; \
  fi) &

node server.js
