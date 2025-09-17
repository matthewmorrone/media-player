#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configurable host/port
# Default host to 0.0.0.0 so the server is reachable from other devices on your network
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-9998}"

# Gracefully kill any process already listening on our port to avoid address-in-use
if command -v lsof >/dev/null 2>&1; then
	# Find PIDs listening on the port
	if EXISTING_PIDS=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true); then
		if [ -n "${EXISTING_PIDS:-}" ]; then
			echo "[serve.sh] Terminating processes on port $PORT: $EXISTING_PIDS" 1>&2
			# Try TERM first
			kill -TERM $EXISTING_PIDS 2>/dev/null || true
			# Wait briefly for shutdown
			for _ in 1 2 3 4 5 6 7 8 9 10; do
				sleep 0.2
				if ! lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
					break
				fi
			done
			# Force kill if still present
			if lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
				echo "[serve.sh] Force killing processes on port $PORT" 1>&2
				kill -KILL $EXISTING_PIDS 2>/dev/null || true
			fi
		fi
	fi
fi

# Activate project venv if present (keeps uvicorn/pip off system Python)
if [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
	# shellcheck source=/dev/null
	. .venv/bin/activate
fi

# Best-effort: discover an IP for friendly output
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
LAN_IP=${LAN_IP:-$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {print $7; exit}')}
echo "[serve.sh] Host:Port  = ${HOST}:${PORT}"
echo "[serve.sh] Local URL  = http://127.0.0.1:${PORT}/"
if [ -n "$LAN_IP" ]; then
	echo "[serve.sh] LAN URL    = http://${LAN_IP}:${PORT}/"
fi
echo "[serve.sh] MEDIA_ROOT = ${MEDIA_ROOT:-$PWD}"

# Prefer explicit MEDIA_ROOT, else /mnt/media/PornMin if it exists, else $PWD
if [ -z "${MEDIA_ROOT:-}" ]; then
	if [ -d "/mnt/media/PornMin" ]; then
		export MEDIA_ROOT="/mnt/media/PornMin"
	fi
fi

exec env MEDIA_ROOT="${MEDIA_ROOT}" uvicorn app:app \
	--reload \
	--host "$HOST" \
	--port "$PORT" \
	--log-level info \
	--reload-dir . \
	--reload-include "app.py" \
	--reload-include "index.html" \
	--reload-include "index.css" \
	--reload-include "index.js" \
	--reload-exclude "old-index.html" \
	--reload-exclude "**/__pycache__/*" \
	--reload-exclude "**/*.pyc" \
	--reload-exclude "**/*.swp" \
	--reload-exclude "**/.DS_Store" \
	--reload-exclude "**/.*"
