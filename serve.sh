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

# Optional venv activation (opt-in)
# If you already have a venv active, we won't touch it.
# To have this script activate one for you, set USE_VENV=1 and optionally VENV_PATH=/path/to/venv
if [ -z "${VIRTUAL_ENV:-}" ] && [ "${USE_VENV:-0}" = "1" ]; then
	if [ -n "${VENV_PATH:-}" ] && [ -f "$VENV_PATH/bin/activate" ]; then
		# shellcheck source=/dev/null
		. "$VENV_PATH/bin/activate" || true
	elif [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
		# shellcheck source=/dev/null
		. .venv/bin/activate || true
	elif [ -f "$HOME/.venvs/media-player/bin/activate" ]; then
		# shellcheck source=/dev/null
		. "$HOME/.venvs/media-player/bin/activate" || true
	fi
fi

# Report which Python/venv will be used
PYTHON_BIN="${PYTHON_BIN:-python3}"
if command -v python >/dev/null 2>&1; then
	PYTHON_BIN="python"
fi
if [ -n "${VIRTUAL_ENV:-}" ]; then
	echo "[serve.sh] Using venv: $VIRTUAL_ENV"
else
	echo "[serve.sh] No venv active; using system Python ($(command -v "$PYTHON_BIN" || echo python3))"
fi

# Best-effort: discover an IP for friendly output (robust to missing tools)
LAN_IP=""
# Try `ip route` (Linux)
if command -v ip >/dev/null 2>&1; then
	LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {print $7; exit}' || true)"
fi
# Try `hostname -I` (Linux)
if [ -z "$LAN_IP" ]; then
	LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
# Try macOS `ipconfig`
if [ -z "$LAN_IP" ] && command -v ipconfig >/dev/null 2>&1; then
	LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
echo "[serve.sh] Host:Port  = ${HOST}:${PORT}"
echo "[serve.sh] Local URL  = http://127.0.0.1:${PORT}/"
if [ -n "$LAN_IP" ]; then
	echo "[serve.sh] LAN URL    = http://${LAN_IP}:${PORT}/"
fi
echo "[serve.sh] MEDIA_ROOT = ${MEDIA_ROOT:-$PWD}"
if [ -n "${MEDIA_EXTS:-}" ]; then
	echo "[serve.sh] MEDIA_EXTS = ${MEDIA_EXTS}"
else
	# Don't override app defaults; just document them for clarity
	echo "[serve.sh] MEDIA_EXTS = (app default: .mp4)"
fi

# On some filesystems (SMB/NFS/exFAT) the file watcher can be noisy or unreliable.
# Auto-enable polling for watchfiles on those FS types unless the user has set it explicitly.
if [ -z "${WATCHFILES_FORCE_POLLING:-}" ]; then
	FSTYPE="$(stat -f %T . 2>/dev/null || echo '')"
	case "$FSTYPE" in
		smbfs|nfs|exfat|msdos|fusefs*)
			export WATCHFILES_FORCE_POLLING=1
			echo "[serve.sh] Detected FS=$FSTYPE → enabling WATCHFILES_FORCE_POLLING=1" 1>&2
			;;
		*) ;;
	esac
fi

# Prefer explicit MEDIA_ROOT, else /mnt/media/PornMin if it exists, else $PWD
if [ -z "${MEDIA_ROOT:-}" ]; then
	if [ -d "/mnt/media/PornMin" ]; then
		export MEDIA_ROOT="/mnt/media/PornMin"
	else
		# Fall back to current working directory to avoid unbound variable in set -u
		export MEDIA_ROOT="$PWD"
	fi
fi

# Apply conservative defaults to avoid thrashing on low-power devices unless the user explicitly overrides.
# Limit concurrent jobs and ffmpeg threads; add a timelimit to bound runaway processes.
export JOB_MAX_CONCURRENCY="${JOB_MAX_CONCURRENCY:-1}"
export FFMPEG_THREADS="${FFMPEG_THREADS:-1}"
export FFMPEG_TIMELIMIT="${FFMPEG_TIMELIMIT:-900}"
echo "[serve.sh] JOB_MAX_CONCURRENCY = ${JOB_MAX_CONCURRENCY}"
echo "[serve.sh] FFMPEG_THREADS      = ${FFMPEG_THREADS}"
echo "[serve.sh] FFMPEG_TIMELIMIT    = ${FFMPEG_TIMELIMIT}s"

# Do not set MEDIA_EXTS here; app provides sensible defaults.

# Prefer module invocation so it works even if PATH doesn't include uvicorn
exec env MEDIA_ROOT="${MEDIA_ROOT}" "$PYTHON_BIN" -m uvicorn app:app \
	--reload \
	--reload-delay 0.5 \
	--host "$HOST" \
	--port "$PORT" \
	--log-level info \
	--reload-dir . \
	--reload-include "app.py" \
	--reload-include "index.html" \
	--reload-include "index.css" \
	--reload-include "index.js" \
	--reload-exclude "scripts/**" \
	--reload-exclude "old-index.html" \
	--reload-exclude "**/__pycache__/*" \
	--reload-exclude "**/*.pyc" \
	--reload-exclude "**/*.swp" \
	--reload-exclude "**/.DS_Store" \
	--reload-exclude "**/.*"
