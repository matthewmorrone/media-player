#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configurable host/port
HOST="${HOST:-127.0.0.1}"
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

exec env MEDIA_ROOT="${MEDIA_ROOT:-$PWD}" uvicorn app:app \
	--reload \
	--host "$HOST" \
	--port "$PORT" \
	--log-level info \
	--reload-dir . \
	--reload-include "*.py" \
	--reload-include "*.html"
