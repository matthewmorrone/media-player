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
  if   [ -d "/Volumes/media/PornMin" ]; then export MEDIA_ROOT="/Volumes/media/PornMin";
  elif [ -d "/mnt/media/PornMin" ];    then export MEDIA_ROOT="/mnt/media/PornMin";
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
echo "Serving on:"
echo "  http://localhost:$PORT"
echo "  http://${LAN_IP:-$HOST}:$PORT"
echo "MEDIA_ROOT=$MEDIA_ROOT"

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

# shellcheck disable=SC2086
exec env MEDIA_ROOT="${MEDIA_ROOT}" $RUN_UVICORN app:app --reload --host "$HOST" --port "$PORT"
