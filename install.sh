#!/usr/bin/env bash
set -euo pipefail

# Top-level setup script: create/activate a stable Python venv, install deps, then run serve.sh
# Avoid creating venv on /Volumes; use ~/.venvs/media-player by default.
#
# Flags:
#   --required       Install only required dependencies (requirements.txt). [default]
#   --no-required    Skip installing required dependencies.
#   --optional       Install optional extras from optional.txt (best effort).
#   --no-optional    Skip installing optional extras. [default]
#   --use-apt       Use apt-get for system packages when available (Debian/Ubuntu)
#   --no-apt        Do not use apt-get even if available (default)
#   -h | --help      Show this help.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Config
PY_BIN="${PY_BIN:-python3}"
# Default to project-local .venv; can override with VENV_PATH
VENV_PATH_DEFAULT="$SCRIPT_DIR/.venv"
VENV_FALLBACK="$HOME/.venvs/media-player"
VENV_PATH="${VENV_PATH:-$VENV_PATH_DEFAULT}"

# Defaults: install required, skip optional unless asked or INSTALL_EXTRAS=1
DO_REQUIRED=1
DO_OPTIONAL=${INSTALL_EXTRAS:-0}
USE_APT=0

usage() {
	cat <<'EOF'
Usage: ./install.sh [--required|--no-required] [--optional|--no-optional]

Options:
	--required       Install required dependencies from requirements.txt (default)
	--no-required    Do not install required dependencies
	--optional       Install optional extras from optional.txt (best effort)
	--no-optional    Do not install optional extras (default)
	--use-apt        Use apt-get to install system packages when available (Debian/Ubuntu)
	--no-apt         Do not use apt-get (default)
	-h, --help       Show this help and exit
EOF
}

for arg in "$@"; do
	case "$arg" in
		--required) DO_REQUIRED=1 ;;
		--no-required) DO_REQUIRED=0 ;;
		--optional) DO_OPTIONAL=1 ;;
		--no-optional) DO_OPTIONAL=0 ;;
		--use-apt) USE_APT=1 ;;
		--no-apt) USE_APT=0 ;;
		-h|--help) usage; exit 0 ;;
		*) echo "[install] Unknown argument: $arg" >&2; usage; exit 2 ;;
	esac
done

echo "[install] Repo: $SCRIPT_DIR"
echo "[install] Python: $(command -v "$PY_BIN" || echo not-found)"
echo "[install] Venv: $VENV_PATH"
echo "[install] Will install required: $DO_REQUIRED, optional: $DO_OPTIONAL, use-apt: $USE_APT"

# Helper: apt-get wrapper with sudo detection
APT_BIN="$(command -v apt-get || true)"
SUDO_BIN="$(command -v sudo || true)"
SUDO_CMD=""
if [ "$(id -u)" != "0" ] && [ -n "$SUDO_BIN" ]; then
	SUDO_CMD="sudo"
fi
apt_update_once() {
	if [ -z "$APT_BIN" ]; then return 0; fi
	if [ -n "${APT_UPDATED:-}" ]; then return 0; fi
	echo "[install] Running apt-get update (once) ..."
	if ! ${SUDO_CMD:+$SUDO_CMD }apt-get update; then
		echo "[install] WARNING: apt-get update failed; continuing"
	else
		APT_UPDATED=1
	fi
}
apt_install() {
	if [ -z "$APT_BIN" ]; then return 1; fi
	if [ -z "$1" ]; then return 1; fi
	local pkg="$1"
	echo "[install] Installing via apt-get: $pkg"
	if ! ${SUDO_CMD:+$SUDO_CMD }apt-get install -y "$pkg"; then
		echo "[install] WARNING: apt-get install failed for $pkg"
		return 1
	fi
	return 0
}

# Warn about macOS /Volumes quirk (venv symlinks sometimes problematic)
OS_NAME="$(uname -s || true)"
if [ "$OS_NAME" = "Darwin" ] && [[ "$VENV_PATH" == /Volumes/* ]]; then
	cat <<'EOF'
[install] NOTE: Your venv is under /Volumes on macOS. Some Python venvs created on external volumes can misbehave due to symlink quirks.
[install]       If you encounter issues, re-run with e.g. VENV_PATH="$HOME/.venvs/media-player" ./install.sh
EOF
fi

# Try to create venv at requested location; fallback if creation fails
mkdir -p "$(dirname "$VENV_PATH")" || true
if [ ! -d "$VENV_PATH" ] || [ ! -x "$VENV_PATH/bin/python" ]; then
	echo "[install] Creating venv at $VENV_PATH ..."
	if ! "$PY_BIN" -m venv "$VENV_PATH" 2>/dev/null; then
		echo "[install] WARN: Failed to create venv at $VENV_PATH; trying fallback $VENV_FALLBACK"
		VENV_PATH="$VENV_FALLBACK"
		mkdir -p "$(dirname "$VENV_PATH")" || true
		"$PY_BIN" -m venv "$VENV_PATH"
	fi
fi

# shellcheck source=/dev/null
source "$VENV_PATH/bin/activate"
echo "[install] Using interpreter: $(command -v python)"

python -m pip install --upgrade pip wheel setuptools

if [ "$DO_REQUIRED" = "1" ]; then
	if [ -f requirements.txt ]; then
		echo "[install] Installing core dependencies from requirements.txt..."
		pip install -r requirements.txt
	else
		echo "[install] requirements.txt not found; installing minimal runtime packages..."
		pip install fastapi uvicorn pydantic httpx pillow
	fi
else
	echo "[install] Skipping required dependency installation (per flag)."
fi

# Optionally install extras
if [ "$DO_OPTIONAL" = "1" ]; then
	echo "[install] Installing optional extras from optional.txt (best effort)"
	if [ -f optional.txt ]; then
		# Detect platform once
		OPT_UNAME="$(uname -s || true)"
		OPT_ARCH="$(uname -m || true)"
		# Read optional.txt line by line, skipping comments and blank lines
		while IFS= read -r pkg; do
			pkg_trimmed="$(echo "$pkg" | sed 's/[[:space:]]*$//')"
			# Skip comments and empty
			if [ -z "$pkg_trimmed" ] || [[ "$pkg_trimmed" =~ ^# ]]; then
				continue
			fi
			pkg_name_only="$(echo "$pkg_trimmed" | sed 's/[<>=!].*$//')"
			# On many Raspberry Pi/ARM setups, onnxruntime wheels are unavailable; skip insightface too (depends on onnxruntime)
			if [ "$OPT_UNAME" = "Linux" ] && [[ "$OPT_ARCH" == arm* || "$OPT_ARCH" == aarch64 ]]; then
				if [ "$pkg_name_only" = "onnxruntime" ] || [ "$pkg_name_only" = "insightface" ]; then
					echo "[install] Skipping $pkg_name_only on $OPT_UNAME/$OPT_ARCH (no wheels typically available). Faces will fall back to OpenCV backend."
					continue
				fi
			fi
			# Prefer apt for OpenCV when requested and available
			if [ "$pkg_name_only" = "opencv-python" ] && [ "$USE_APT" = "1" ] && [ -n "$APT_BIN" ]; then
				apt_update_once
				if apt_install python3-opencv; then
					echo "[install] Installed system OpenCV (python3-opencv); skipping pip opencv-python"
					continue
				else
					echo "[install] Falling back to pip for opencv-python"
				fi
			fi
			echo "[install] Optional: $pkg_trimmed"
			if ! pip install "$pkg_trimmed"; then
				echo "[install] WARNING: Failed to install optional package '$pkg_trimmed' — continuing"
			fi
		done < optional.txt
	else
		echo "[install] No optional.txt found; skipping extras"
	fi
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
	if [ "$USE_APT" = "1" ] && [ -n "$APT_BIN" ]; then
		echo "[install] ffmpeg not found; attempting apt installation"
		apt_update_once
		if apt_install ffmpeg; then
			echo "[install] Installed ffmpeg via apt."
		else
			echo "[install] WARNING: ffmpeg not found and apt install failed. Some features will degrade or stub."
		fi
	else
		echo "[install] WARNING: ffmpeg not found. Some features will degrade or stub."
	fi
fi
if ! command -v ffprobe >/dev/null 2>&1; then
	echo "[install] WARNING: ffprobe not found. Metadata probing will stub."
fi

# Platform notes for optional ML packages
if [ "$DO_OPTIONAL" = "1" ]; then
	UNAME_STR="$(uname -s || true)"
	ARCH_STR="$(uname -m || true)"
	if [ "$UNAME_STR" = "Darwin" ] && [ "$ARCH_STR" = "arm64" ]; then
		cat <<'EOF'
[install] NOTE: On macOS arm64, some optional packages (onnxruntime, insightface, faster-whisper) may not have wheels for your Python version.
[install]       If installation failed, consider:
[install]         - Using Python 3.10 or 3.11 via pyenv
[install]         - Installing platform-specific extras manually (e.g., onnxruntime-silicon if available)
[install]         - Skipping those features; the app will still run without them
EOF
	fi
fi

echo "[install] Launching dev server via ./serve.sh"
exec ./serve.sh
