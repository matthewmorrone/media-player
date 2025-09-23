#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Activate a working venv: prefer project .venv if valid, else fallback to HOME venv
activate_ok=0
if [ -d .venv ] && [ -x .venv/bin/python ]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate || true
  # Validate this venv isn't stale (e.g., moved volume with broken shebangs)
  if python -c 'import sys; print(sys.version)' >/dev/null 2>&1; then
    activate_ok=1
  else
    echo "[serve] Detected a broken .venv (python not runnable). Ignoring local .venv."
    # shellcheck disable=SC2312
    deactivate 2>/dev/null || true
  fi
fi
if [ "$activate_ok" != "1" ] && [ -d "$HOME/.venvs/media-player" ] && [ -x "$HOME/.venvs/media-player/bin/python" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.venvs/media-player/bin/activate" || true
  if python -c 'import sys; print(sys.version)' >/dev/null 2>&1; then
    activate_ok=1
  fi
fi
if [ "$activate_ok" != "1" ]; then
  echo "[serve] No working virtualenv activated. You can create one with: ./install.sh"
else
  echo "[serve] Using interpreter: $(command -v python)"
fi

# Defaults
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-9998}"

# MEDIA_ROOT: use existing env, else pick a sensible default
if [ -z "${MEDIA_ROOT:-}" ]; then
  if   [ -d "/Volumes/media/PornMin" ]; then export MEDIA_ROOT="/Volumes/media/PornMin";
  elif [ -d "/mnt/media/PornMin" ];    then export MEDIA_ROOT="/mnt/media/PornMin";
  else export MEDIA_ROOT="$PWD"; fi
fi

# Keep job state and caches OUTSIDE the repo to avoid dev reload loops on file writes
if [ -z "${MEDIA_PLAYER_STATE_DIR:-}" ]; then
  if [ -d "$HOME/Library/Caches" ]; then
    export MEDIA_PLAYER_STATE_DIR="$HOME/Library/Caches/media-player"
  else
    export MEDIA_PLAYER_STATE_DIR="$HOME/.cache/media-player"
  fi
fi
mkdir -p "$MEDIA_PLAYER_STATE_DIR/.jobs" || true

# When running with --reload, avoid auto-restoring queued jobs by default to prevent loops
export JOB_AUTORESTORE_DISABLE="${JOB_AUTORESTORE_DISABLE:-1}"

# Print friendly access URLs (LAN + localhost) before exec
LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$LAN_IP" ] && command -v hostname >/dev/null 2>&1; then
  # On Linux, hostname -I prints IPs; on macOS it errors. Guard to avoid exiting due to set -euo pipefail.
  if hostname -I >/dev/null 2>&1; then
    LAN_IP=$(hostname -I | awk '{print $1}')
  fi
fi
echo "Serving on:"
echo "  http://localhost:$PORT"
echo "  http://${LAN_IP:-$HOST}:$PORT"
echo "MEDIA_ROOT=$MEDIA_ROOT"
echo "STATE_DIR=$MEDIA_PLAYER_STATE_DIR"

# Preflight: advise if watchfiles is missing (uvicorn will ignore --reload-exclude without it)
if ! python - <<'PY' >/dev/null 2>&1
import sys
try:
    import watchfiles  # noqa: F401
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
then
  echo "[serve] WARNING: 'watchfiles' is not installed in the active environment."
  echo "        Uvicorn will ignore --reload-exclude/--reload-include without it."
  echo "        Fix: activate your venv and install it: pip install watchfiles"
fi

# Auto-enable whisper.cpp subtitles backend if discovered and not explicitly configured
if [ -z "${WHISPER_CPP_BIN:-}" ]; then
  if [ -x "$HOME/whisper.cpp/main" ]; then
    export WHISPER_CPP_BIN="$HOME/whisper.cpp/main"
  elif [ -x "$HOME/whisper.cpp/build/bin/main" ]; then
    export WHISPER_CPP_BIN="$HOME/whisper.cpp/build/bin/main"
  fi
fi
if [ -z "${WHISPER_CPP_MODEL:-}" ]; then
  if [ -f "$HOME/whisper.cpp/models/ggml-tiny.bin" ]; then
    export WHISPER_CPP_MODEL="$HOME/whisper.cpp/models/ggml-tiny.bin"
  elif [ -f "$HOME/whisper.cpp/models/ggml-base.bin" ]; then
    export WHISPER_CPP_MODEL="$HOME/whisper.cpp/models/ggml-base.bin"
  else
    # Pick first *.bin under models if present
    if [ -d "$HOME/whisper.cpp/models" ]; then
      first_model=$(ls "$HOME/whisper.cpp/models"/*.bin 2>/dev/null | head -n 1 || true)
      if [ -n "$first_model" ]; then export WHISPER_CPP_MODEL="$first_model"; fi
    fi
  fi
fi
if [ -n "${WHISPER_CPP_BIN:-}" ] && [ -n "${WHISPER_CPP_MODEL:-}" ]; then
  echo "whisper.cpp backend: BIN=$WHISPER_CPP_BIN MODEL=$(basename "$WHISPER_CPP_MODEL")"
fi

# Exclude artifact/state folders from auto-reload to prevent ffmpeg thrashing.
# Only effective with the 'watchfiles' backend. If not installed, uvicorn
# falls back to 'statreload', which ignores include/exclude flags; in that case
# we simply omit them to avoid noisy warnings.
EXCLUDE_FLAGS=()
if python - <<'PY' >/dev/null 2>&1
try:
    import watchfiles  # noqa: F401
    print('ok')
except Exception:
    raise SystemExit(1)
PY
then
  EXCLUDE_FLAGS=(
    --reload-exclude ".jobs/*"
    --reload-exclude "**/.jobs/*"
    --reload-exclude "**/.artifacts/*"
    --reload-exclude "**/.previews/*"
    --reload-exclude "**/*.preview.webm"
    # Avoid reloads when editing or touching the CLI helper
    --reload-exclude "artifacts.py"
    --reload-exclude "**/artifacts.py"
  )
else
  # Optional: restrict to current dir to avoid watching parent trees on some setups
  # EXCLUDE_FLAGS+=( --reload-dir "$PWD" )
  :
fi

if [ "${DEV_STRICT_CONTENT_RELOAD:-}" = "1" ]; then
  echo "[serve] Using strict content-change reloader (DEV_STRICT_CONTENT_RELOAD=1)"
  exec python dev_reload.py
else
  exec uvicorn app:app \
    --reload \
    --host "$HOST" \
    --port "$PORT" \
    ${EXCLUDE_FLAGS:+"${EXCLUDE_FLAGS[@]}"}
fi
