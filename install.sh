#!/usr/bin/env bash
set -euo pipefail

# Top-level setup script: create/activate a stable Python venv, install deps, then run serve.sh
# Avoid creating venv on /Volumes; use ~/.venvs/media-player by default.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Config
PY_BIN="${PY_BIN:-python3}"
VENV_PATH_DEFAULT="$HOME/.venvs/media-player"
VENV_PATH="${VENV_PATH:-$VENV_PATH_DEFAULT}"

echo "[install] Repo: $SCRIPT_DIR"
echo "[install] Python: $(command -v "$PY_BIN" || echo not-found)"
echo "[install] Venv: $VENV_PATH"

mkdir -p "$(dirname "$VENV_PATH")"

if [ ! -d "$VENV_PATH" ] || [ ! -x "$VENV_PATH/bin/python" ]; then
	echo "[install] Creating venv..."
	"$PY_BIN" -m venv "$VENV_PATH"
fi

# shellcheck source=/dev/null
source "$VENV_PATH/bin/activate"
echo "[install] Using interpreter: $(command -v python)"

python -m pip install --upgrade pip wheel setuptools

if [ -f requirements.txt ]; then
	echo "[install] Installing dependencies from requirements.txt..."
	pip install -r requirements.txt
else
	echo "[install] requirements.txt not found; installing minimal runtime packages..."
	pip install fastapi uvicorn pydantic httpx pillow
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
	echo "[install] WARNING: ffmpeg not found. Some features will degrade or stub."
fi
if ! command -v ffprobe >/dev/null 2>&1; then
	echo "[install] WARNING: ffprobe not found. Metadata probing will stub."
fi

echo "[install] Launching dev server via ./serve.sh"
exec ./serve.sh
