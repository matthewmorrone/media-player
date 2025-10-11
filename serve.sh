#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Activate local venv if present
[ -d .venv ] && source .venv/bin/activate

# Defaults
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-9998}"

# MEDIA_ROOT: use existing env, else pick a sensible default
if [ -z "${MEDIA_ROOT:-}" ]; then
  if   [ -d "/Volumes/media/Porn" ]; then export MEDIA_ROOT="/Volumes/media/Porn";
  elif [ -d "/mnt/media/Porn" ];    then export MEDIA_ROOT="/mnt/media/Porn";
  else export MEDIA_ROOT="$PWD"; fi
fi

# Print friendly access URLs (LAN + localhost) before exec
LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$LAN_IP" ] && command -v hostname >/dev/null 2>&1; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
echo "[serve.sh] Serving on:"
echo "[serve.sh] http://${LAN_IP:-$HOST}:$PORT"
echo "[serve.sh] MEDIA_ROOT=$MEDIA_ROOT"

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
# if [ -n "${WHISPER_CPP_BIN:-}" ] && [ -n "${WHISPER_CPP_MODEL:-}" ]; then
#   # echo "whisper.cpp backend: BIN=$WHISPER_CPP_BIN MODEL=$(basename "$WHISPER_CPP_MODEL")"
# fi

# Exclude scripts directory to avoid noisy reloads from helper scripts

# echo "[serve.sh] Starting Media Player on ${HOST}:${PORT} (MEDIA_ROOT=${MEDIA_ROOT})" 1>&2

# Runner resolution (from salvaged stash logic, adapted)
choose_runner() {
  if [ -n "${UVICORN_BIN:-}" ]; then
    echo "$UVICORN_BIN"; return 0
  fi
  if command -v uvicorn >/dev/null 2>&1; then
    command -v uvicorn; return 0
  fi
  if [ -x ".venv/bin/uvicorn" ]; then
    echo ".venv/bin/uvicorn"; return 0
  fi
  if python3 -c 'import uvicorn' >/dev/null 2>&1; then
    echo "python3 -m uvicorn"; return 0
  fi
  return 1
}

probe_runner() {
  # shellcheck disable=SC2086
  $1 --version >/dev/null 2>&1
}

RUN_UVICORN="$(choose_runner || true)"
if [ -z "$RUN_UVICORN" ] || ! probe_runner "$RUN_UVICORN"; then
  for cand in "$(command -v uvicorn 2>/dev/null || true)" \
             ".venv/bin/uvicorn" \
             "python3 -m uvicorn"; do
    if [ -n "$cand" ] && probe_runner "$cand"; then
      RUN_UVICORN="$cand"; break
    fi
  done
fi

if [ -z "$RUN_UVICORN" ] || ! probe_runner "$RUN_UVICORN"; then
  echo "[serve.sh] ERROR: uvicorn not found or not runnable. Activate venv or install deps (./install.sh)." 1>&2
  exit 1
fi

# ----------------------------------------------------------------------------
# Logging / verbosity controls
#   LOG_FILE   : path ("/dev/null" disables file logging)  (default: server.log)
#   LOG_APPEND : 1 to append instead of truncate            (default: 0)
#   LOG_LEVEL  : uvicorn log level (debug, info, warning..) (default: info)
#   ACCESS_LOG : 1 to enable, 0 to disable access logs      (default: 1)
#   RELOAD     : 1 enable autoreload, 0 disable             (default: 1)
#   QUIET      : 1 shortcut → LOG_LEVEL=warning ACCESS_LOG=0 (overrides above)
# ----------------------------------------------------------------------------
LOG_FILE="${LOG_FILE:-server.log}"
LOG_APPEND="${LOG_APPEND:-0}"
LOG_LEVEL="${LOG_LEVEL:-info}"
ACCESS_LOG="${ACCESS_LOG:-1}"
RELOAD="${RELOAD:-1}"
if [ "${QUIET:-0}" = "1" ]; then
  LOG_LEVEL="warning"
  ACCESS_LOG="0"
fi

# Build uvicorn argument list
UVICORN_ARGS=(app:app --host "$HOST" --port "$PORT")
if [ "$RELOAD" = "1" ]; then
  UVICORN_ARGS+=(--reload)
fi
UVICORN_ARGS+=(--log-level "$LOG_LEVEL")
if [ "$ACCESS_LOG" != "1" ]; then
  UVICORN_ARGS+=(--no-access-log)
fi

echo "[serve.sh] LOG_LEVEL=$LOG_LEVEL" 1>&2
echo "[serve.sh] ACCESS_LOG=$ACCESS_LOG" 1>&2
echo "[serve.sh] RELOAD=$RELOAD" 1>&2
echo "[serve.sh] QUIET=${QUIET:-0}" 1>&2

if [ "$LOG_FILE" = "/dev/null" ]; then
  # Disable file logging explicitly
  exec env MEDIA_ROOT="${MEDIA_ROOT}" $RUN_UVICORN "${UVICORN_ARGS[@]}"
else
  # Prepare file (truncate unless append requested)
  if [ "$LOG_APPEND" != "1" ]; then : >"$LOG_FILE"; fi
  echo "[serve.sh] Logging to $LOG_FILE (append=$LOG_APPEND)" | tee -a "$LOG_FILE"
  if command -v stdbuf >/dev/null 2>&1; then
    exec stdbuf -oL -eL env MEDIA_ROOT="${MEDIA_ROOT}" $RUN_UVICORN "${UVICORN_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
  else
    exec env MEDIA_ROOT="${MEDIA_ROOT}" $RUN_UVICORN "${UVICORN_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
  fi
fi
