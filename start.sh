#!/usr/bin/env bash
# Start the Smart Reader Assistant development server
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Smart Reader Assistant ==="
echo "Starting server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop"
echo ""

exec uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
