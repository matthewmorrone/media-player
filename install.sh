#!/usr/bin/env bash
set -euo pipefail

# Minimal setup script: create/activate a project-local venv and install deps.
# Usage:
#   ./install.sh [--required|--no-required] [--optional|--no-optional]
# Then start the server with:
#   ./serve.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Flags
DO_REQUIRED=1
DO_OPTIONAL=0
DO_APT_OPENCV=0

# Preferred fallback venv location for filesystems that don't support symlinks
FALLBACK_VENV="${FALLBACK_VENV:-$HOME/.venvs/media-player}"

# Baked-in dependency sets (no external files needed)
# Adjust these arrays if you need to tweak dependencies.
REQUIRED_PKGS=(
  fastapi
  uvicorn
  pydantic
  python-multipart
  httpx
  Pillow
  watchgod
)

# Optional extras for extended features (install with: ./install.sh --optional)
# Raspberry Pi friendly, headless set:
# - opencv-python-headless: Face detection without GUI deps
# - numpy: required by face pipelines
# Subtitles on Pi default to whisper.cpp (built automatically on Linux when --optional is used).
# If you explicitly want faster-whisper, install it manually: `pip install faster-whisper`
# (requires FFmpeg dev libs for PyAV on ARM).
OPTIONAL_PKGS=(
  opencv-python-headless
  numpy
)

usage() {
  cat <<'EOF'
Usage: ./install.sh [--required|--no-required] [--optional|--no-optional] [--apt-opencv]

Options:
  --required       Install required dependencies from requirements.txt (default)
  --no-required    Do not install required dependencies
  --optional       Install optional extras from optional.txt (best effort)
  --no-optional    Do not install optional extras (default)
  --apt-opencv     If OpenCV pip wheel fails and system OpenCV isn't found, attempt apt-get install python3-opencv (Linux/Debian)
  -h, --help       Show this help and exit
EOF
}

for arg in "$@"; do
  case "$arg" in
    --required) DO_REQUIRED=1 ;;
    --no-required) DO_REQUIRED=0 ;;
    --optional) DO_OPTIONAL=1 ;;
    --no-optional) DO_OPTIONAL=0 ;;
    --apt-opencv) DO_APT_OPENCV=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[install] Unknown argument: $arg" >&2; usage; exit 2 ;;
  esac
done

PY_BIN="${PY_BIN:-python3}"
VENV_PATH="${VENV_PATH:-$SCRIPT_DIR/.venv}"

echo "[install] Repo: $SCRIPT_DIR"
echo "[install] Python: $(command -v "$PY_BIN" || echo not-found)"
echo "[install] Venv: $VENV_PATH"
echo "[install] Required: $DO_REQUIRED, Optional: $DO_OPTIONAL, Apt-OpenCV: $DO_APT_OPENCV"

mkdir -p "$(dirname "$VENV_PATH")" || true
if [ ! -x "$VENV_PATH/bin/python" ]; then
  echo "[install] Creating venv at $VENV_PATH ..."
  # Use --copies to avoid symlink issues on external volumes
  if ! "$PY_BIN" -m venv --copies "$VENV_PATH" 2>/dev/null; then
    echo "[install] Failed to create venv on external volume, trying fallback location..."
    # Fallback: create venv in home directory if external volume fails
    echo "[install] Using fallback venv at $FALLBACK_VENV"
    mkdir -p "$(dirname "$FALLBACK_VENV")"
    "$PY_BIN" -m venv --copies "$FALLBACK_VENV"
    # Always use fallback directly to avoid pseudo-symlinks on network/USB filesystems
    VENV_PATH="$FALLBACK_VENV"
    echo "[install] Using fallback venv directly at $VENV_PATH"
  fi
fi

# Validate venv interpreter: avoid Samba/NAS pseudo-symlinks (files starting with 'XSym')
if [ -f "$VENV_PATH/bin/python" ]; then
  if head -c 4 "$VENV_PATH/bin/python" 2>/dev/null | grep -q '^XSym'; then
    echo "[install] Detected non-executable symlink stub for venv python; switching to fallback $FALLBACK_VENV"
    mkdir -p "$(dirname "$FALLBACK_VENV")"
    if [ ! -x "$FALLBACK_VENV/bin/python" ]; then
      "$PY_BIN" -m venv --copies "$FALLBACK_VENV"
    fi
    VENV_PATH="$FALLBACK_VENV"
  fi
fi

# shellcheck source=/dev/null
source "$VENV_PATH/bin/activate"
# Determine explicit venv executables (some venvs lack a 'python' shim)
PY_EXE="$VENV_PATH/bin/python"
if [ ! -x "$PY_EXE" ] && [ -x "$VENV_PATH/bin/python3" ]; then
  PY_EXE="$VENV_PATH/bin/python3"
fi
PIP_EXE="$VENV_PATH/bin/pip"
if [ ! -x "$PIP_EXE" ]; then
  PIP_EXE="$PY_EXE -m pip"
fi
echo "[install] Using interpreter: $PY_EXE"

eval "$PY_EXE -m pip install --upgrade pip wheel setuptools"

if [ "$DO_REQUIRED" = "1" ]; then
  echo "[install] Installing required packages: ${REQUIRED_PKGS[*]}"
  eval "$PIP_EXE install ${REQUIRED_PKGS[*]}"
else
  echo "[install] Skipping required dependency installation (per flag)."
fi

if [ "$DO_OPTIONAL" = "1" ]; then
  # Helper to link system OpenCV into venv using a .pth file
  link_system_opencv() {
    echo "[install] Attempting to use system OpenCV (python3-opencv) in this venv"
    # Prefer system Python explicitly (outside the venv) for detection
    if [ -x "/usr/bin/python3" ]; then
      SYS_PY="/usr/bin/python3"
    else
      SYS_PY="$(command -v python3 || true)"
    fi

    # First try a direct import to get the module file's directory (works for .so layout)
    SYS_CV2_DIR="$($SYS_PY -c 'import os, sys;\ntry:\n    import cv2\n    print(os.path.dirname(cv2.__file__))\nexcept Exception:\n    print("")' 2>/dev/null || true)"

    # If that failed, scan sys.path for cv2 in multiple layouts: directory, .so, or .py
    if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
      SYS_CV2_DIR="$($SYS_PY -c 'import os, sys, glob\nfor p in sys.path:\n    try:\n        if os.path.isdir(os.path.join(p, "cv2")):\n            print(p); break\n        so = glob.glob(os.path.join(p, "cv2.*.so")) or glob.glob(os.path.join(p, "cv2.so"))\n        if so:\n            print(p); break\n        py = os.path.join(p, "cv2.py")\n        if os.path.isfile(py):\n            print(p); break\n    except Exception:\n        pass' 2>/dev/null || true)"
    fi

    # If still not found, try common distro paths directly
    if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
      for base in /usr/lib/python3/dist-packages /usr/local/lib/python3/dist-packages; do
        if [ -d "$base/cv2" ] || ls "$base"/cv2*.so >/dev/null 2>&1; then
          SYS_CV2_DIR="$base"
          break
        fi
      done
      if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
        for base in /usr/lib/python3.*/*-packages /usr/local/lib/python3.*/*-packages; do
          for d in $base; do
            if [ -d "$d/cv2" ] || ls "$d"/cv2*.so >/dev/null 2>&1; then
              SYS_CV2_DIR="$d"
              break 2
            fi
          done
        done
      fi
    fi

    # If still not found, optionally try apt-get (Debian/Raspbian/Ubuntu)
    if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
      echo "[install] System OpenCV not found in common Python paths."
      if [ "$DO_APT_OPENCV" = "1" ] && command -v apt-get >/dev/null 2>&1; then
        echo "[install] Installing python3-opencv via apt (requires sudo)..."
        if sudo apt-get update && sudo apt-get install -y python3-opencv libopencv-dev; then
          # Retry detection once after install
          SYS_CV2_DIR="$($SYS_PY -c 'import os, sys, glob\ntry:\n    import cv2\n    print(os.path.dirname(cv2.__file__))\nexcept Exception:\n    pass\nfor p in sys.path:\n    try:\n        if os.path.isdir(os.path.join(p, "cv2")):\n            print(p); break\n        so = glob.glob(os.path.join(p, "cv2.*.so")) or glob.glob(os.path.join(p, "cv2.so"))\n        if so:\n            print(p); break\n        py = os.path.join(p, "cv2.py")\n        if os.path.isfile(py):\n            print(p); break\n    except Exception:\n        pass' 2>/dev/null || true)"
          if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
            for base in /usr/lib/python3/dist-packages /usr/local/lib/python3/dist-packages; do
              if [ -d "$base/cv2" ] || ls "$base"/cv2*.so >/dev/null 2>&1; then
                SYS_CV2_DIR="$base"; break
              fi
            done
            if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
              for base in /usr/lib/python3.*/*-packages /usr/local/lib/python3.*/*-packages; do
                for d in $base; do
                  if [ -d "$d/cv2" ] || ls "$d"/cv2*.so >/dev/null 2>&1; then
                    SYS_CV2_DIR="$d"; break 2
                  fi
                done
              done
            fi
          fi
        else
          echo "[install] apt-get install python3-opencv failed."
        fi
      fi
    fi

    if [ -z "$SYS_CV2_DIR" ] || [ ! -d "$SYS_CV2_DIR" ]; then
      echo "[install] System OpenCV still not found. You can install it manually with:"
      echo "           sudo apt-get update && sudo apt-get install -y python3-opencv libopencv-dev"
      return 1
    fi

    # Determine the site-packages directory to add to .pth
    SYS_SITE_DIR="$SYS_CV2_DIR"
    # If SYS_CV2_DIR ends with '/cv2', use its parent directory
    case "$SYS_CV2_DIR" in
      */cv2) SYS_SITE_DIR="$(dirname "$SYS_CV2_DIR")" ;;
    esac

    # Determine venv site-packages path (robust)
    VENV_SITE=""
    # Try sysconfig (preferred)
    VENV_SITE="$($PY_EXE -c 'import sysconfig; p=sysconfig.get_paths(); print(p.get("purelib") or p.get("platlib") or "")' 2>/dev/null || true)"
    # If empty or not a directory, try deriving from VENV_PATH
    if [ -z "$VENV_SITE" ] || [ ! -d "$VENV_SITE" ]; then
      if [ -n "${VENV_PATH:-}" ] && [ -d "$VENV_PATH" ]; then
        CAND="$(ls -d "$VENV_PATH"/lib/python*/site-packages 2>/dev/null | head -n1 || true)"
        if [ -n "$CAND" ] && [ -d "$CAND" ]; then
          VENV_SITE="$CAND"
        fi
      fi
    fi
    # Last resort: site.getsitepackages()
    if [ -z "$VENV_SITE" ] || [ ! -d "$VENV_SITE" ]; then
      VENV_SITE="$($PY_EXE -c 'import site; import sys; print(next((p for p in site.getsitepackages() if p.endswith("site-packages")), ""))' 2>/dev/null || true)"
    fi
    [ -n "$VENV_SITE" ] && echo "[install] venv site-packages: $VENV_SITE"

    if [ -n "$VENV_SITE" ] && [ -d "$VENV_SITE" ]; then
      echo "$SYS_SITE_DIR" > "$VENV_SITE/opencv-system.pth"
      echo "[install] Linked system OpenCV via $VENV_SITE/opencv-system.pth -> $SYS_SITE_DIR"
      echo "[install] Verifying OpenCV import in venv ..."
      if "$PY_EXE" - <<'PY'
import cv2, numpy as np
print('[install] OpenCV import check: OK', cv2.__version__, 'NumPy', np.__version__)
PY
      then
        return 0
      else
        NV="$($PY_EXE -c 'import numpy as np; import sys; v=str(getattr(np, "__version__", "")); print(v.split(".")[0] if v else "")' 2>/dev/null || true)"
        if [ "$NV" = "2" ]; then
          echo "[install] Detected NumPy 2.x with system OpenCV built for NumPy 1.x; pinning NumPy to <2 (1.26.x) for compatibility ..."
          eval "$PY_EXE -m pip install 'numpy<2,>=1.25'" || eval "$PY_EXE -m pip install 'numpy<2'"
          if "$PY_EXE" - <<'PY'
import cv2, numpy as np
print('[install] OpenCV import check (after numpy pin): OK', cv2.__version__, 'NumPy', np.__version__)
PY
          then
            return 0
          fi
        fi
        echo "[install] OpenCV import check still failing; see error above."
        return 1
      fi
    else
      echo "[install] Could not locate venv site-packages to link system OpenCV"
      return 1
    fi
  }

  # Prefer piwheels on ARM to avoid building heavy packages from source
  UNAME_S="$(uname -s)" || UNAME_S=""
  UNAME_M="$(uname -m)" || UNAME_M=""
  if [ "$UNAME_S" = "Linux" ] && echo "$UNAME_M" | grep -qiE 'arm|aarch64'; then
    if [ -z "${PIP_INDEX_URL:-}" ]; then
      export PIP_INDEX_URL="https://www.piwheels.org/simple"
      echo "[install] Using piwheels.org for ARM wheels (PIP_INDEX_URL)"
    fi
  fi
  if [ ${#OPTIONAL_PKGS[@]} -eq 0 ]; then
    echo "[install] Optional package set is empty (none to install)"
  else
    echo "[install] Installing optional packages: ${OPTIONAL_PKGS[*]}"
    # Install numpy first for better wheel resolution on ARM
    if printf '%s\n' "${OPTIONAL_PKGS[@]}" | grep -q '^numpy$'; then
      eval "$PIP_EXE install numpy" || echo "[install] WARNING: numpy failed to install — continuing"
    fi
    # Install remaining optional packages one by one to allow partial success
    for pkg in "${OPTIONAL_PKGS[@]}"; do
      if [ "$pkg" = "numpy" ]; then continue; fi
      echo "[install] pip install $pkg"
      if ! eval "$PIP_EXE install $pkg"; then
        echo "[install] WARNING: failed to install $pkg — continuing"
        # Fallback for OpenCV on Debian/Raspberry Pi: use system python3-opencv inside venv
        if [ "$pkg" = "opencv-python-headless" ] && [ "$UNAME_S" = "Linux" ]; then
          link_system_opencv || true
        fi
      fi
    done
  fi
else
  echo "[install] Skipping optional extras (per flag)."
fi

echo "[install] Done. Start the server with: ./serve.sh"

# Post-step: ensure problematic reloader is not installed
if eval "$PIP_EXE show watchfiles" >/dev/null 2>&1; then
  echo "[install] Removing watchfiles to avoid memory issues/spurious reloads"
  eval "$PIP_EXE uninstall -y watchfiles" || true
fi

# If optional extras are requested, also set up whisper.cpp automatically on Linux
if [ "$DO_OPTIONAL" = "1" ]; then
  if [ "$(uname -s)" = "Linux" ]; then
    echo "[install] Optional: setting up whisper.cpp (native, no PyTorch)"
    if ! command -v git >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1 || ! command -v cmake >/dev/null 2>&1; then
      echo "[install] Missing prerequisites for whisper.cpp: git, make, cmake. Install via apt:"
      echo "           sudo apt-get update && sudo apt-get install -y git build-essential cmake"
    else
      WC_DIR="$HOME/whisper.cpp"
      # Skip reinstall if binary and at least one model are already present
      EXIST_BIN=""
      if [ -x "$WC_DIR/main" ]; then
        EXIST_BIN="$WC_DIR/main"
      elif [ -x "$WC_DIR/build/bin/main" ]; then
        EXIST_BIN="$WC_DIR/build/bin/main"
      fi
      HAVE_MODEL=0
      if [ -d "$WC_DIR/models" ] && ls "$WC_DIR/models"/*.bin >/dev/null 2>&1; then
        HAVE_MODEL=1
      fi
      if [ -n "$EXIST_BIN" ] && [ "$HAVE_MODEL" = "1" ]; then
        echo "[install] whisper.cpp already present: BIN=$EXIST_BIN, MODEL=$(basename "$(ls \"$WC_DIR/models\"/*.bin 2>/dev/null | head -n1)") — skipping reinstall"
      else
      if [ ! -d "$WC_DIR/.git" ]; then
        echo "[install] Cloning whisper.cpp into $WC_DIR ..."
        git clone https://github.com/ggerganov/whisper.cpp.git "$WC_DIR"
      else
        echo "[install] Updating whisper.cpp in $WC_DIR ..."
        git -C "$WC_DIR" pull --ff-only || true
      fi
        echo "[install] Building whisper.cpp (main target only) ..."
        NPROC="$(getconf _NPROCESSORS_ONLN || echo 2)"
        ARCH="$(uname -m)" || ARCH=""
        CMAKE_FLAGS=""
        if echo "$ARCH" | grep -qiE 'arm|aarch64'; then
          # Link libatomic to satisfy __atomic_* on some ARM toolchains
          CMAKE_FLAGS="-DCMAKE_EXE_LINKER_FLAGS=-latomic"
        fi
        (
          cd "$WC_DIR" && \
          cmake -B build $CMAKE_FLAGS && \
          cmake --build build --config Release --target main -j"$NPROC"
        ) || (
          echo "[install] Initial build failed; retrying with -j1 and forcing -latomic" && \
          cd "$WC_DIR" && \
          cmake -B build -DCMAKE_EXE_LINKER_FLAGS=-latomic && \
          cmake --build build --config Release --target main -j1 || true
        )
      # Fetch a small model if none exists
      if [ ! -f "$WC_DIR/models/ggml-tiny.bin" ] && [ ! -f "$WC_DIR/models/ggml-base.bin" ]; then
        echo "[install] Downloading tiny model ..."
        (cd "$WC_DIR" && bash ./models/download-ggml-model.sh tiny)
      fi
        # Verify binary exists
        WC_BIN=""
        if [ -x "$WC_DIR/main" ]; then WC_BIN="$WC_DIR/main"; fi
        if [ -z "$WC_BIN" ] && [ -x "$WC_DIR/build/bin/main" ]; then WC_BIN="$WC_DIR/build/bin/main"; fi
        if [ -n "$WC_BIN" ]; then
          echo "[install] whisper.cpp ready: $WC_BIN. The server will auto-detect it on ./serve.sh"
        else
          echo "[install] ERROR: whisper.cpp main binary not found after build."
          echo "           Try: enabling swap, installing build tools (git build-essential cmake), and rebuilding manually:"
          echo "             cd $WC_DIR && rm -rf build && cmake -B build -DCMAKE_EXE_LINKER_FLAGS=-latomic && cmake --build build --target main -j1"
        fi
      fi
    fi
  else
    echo "[install] Optional: skipping whisper.cpp build on $(uname -s). Build manually if desired."
  fi
fi
