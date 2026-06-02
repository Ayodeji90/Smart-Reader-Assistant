#!/usr/bin/env bash
# Start the Smart Reader Assistant development server
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/venv/bin/python"

echo "=== Smart Reader Assistant ==="
echo "Starting server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop"
echo ""

exec "${VENV_PYTHON}" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
