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
if [ -n "${WHISPER_CPP_BIN:-}" ] && [ -n "${WHISPER_CPP_MODEL:-}" ]; then
  echo "whisper.cpp backend: BIN=$WHISPER_CPP_BIN MODEL=$(basename "$WHISPER_CPP_MODEL")"
fi

# Exclude scripts directory to avoid noisy reloads from helper scripts
exec uvicorn app:app --reload --host "$HOST" --port "$PORT"
