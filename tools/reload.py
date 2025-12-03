#!/usr/bin/env python3
"""
Strict content-change reloader for development.

Watches a small set of include patterns and restarts the server only when
actual file contents change (based on SHA-256), not just metadata touches.

Enable via: DEV_STRICT_CONTENT_RELOAD=1 ./serve.sh

Env:
- HOST, PORT: forwarded to uvicorn
- DEV_RELOAD_INCLUDE: comma-separated glob patterns to include (optional)
- DEV_RELOAD_EXCLUDE: comma-separated glob patterns to exclude (optional)
"""
from __future__ import annotations

import hashlib
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, Dict, Set

try:
    from watchfiles import awatch, Change  # type: ignore
    WATCHFILES_OK = True
except Exception:
    WATCHFILES_OK = False

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = os.environ.get("PORT", "9998")

DEFAULT_INCLUDE = [
    "**/*.py",
    "**/*.html",
    "**/*.css",
    "**/*.js",
]
DEFAULT_EXCLUDE = [
    "**/.git/**",
    "**/__pycache__/**",
    "**/.artifacts/**",
    "**/.jobs/**",
    "**/.DS_Store",
]

INCLUDE = [p.strip() for p in os.environ.get("DEV_RELOAD_INCLUDE", "").split(",") if p.strip()] or DEFAULT_INCLUDE
EXCLUDE = [p.strip() for p in os.environ.get("DEV_RELOAD_EXCLUDE", "").split(",") if p.strip()] or DEFAULT_EXCLUDE


def _matches_any(path: Path, patterns: Iterable[str]) -> bool:
    s = path.as_posix()
    for pat in patterns:
        if path.match(pat) or s.endswith(pat):
            return True
    return False


def _should_watch(path: Path) -> bool:
    if _matches_any(path, EXCLUDE):
        return False
    return _matches_any(path, INCLUDE)


def _hash_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _snapshot(root: Path) -> Dict[Path, str]:
    data: Dict[Path, str] = {}
    for pat in INCLUDE:
        for p in root.glob(pat):
            try:
                if p.is_file() and _should_watch(p):
                    data[p] = _hash_file(p)
            except Exception:
                continue
    return data


def _start_server() -> subprocess.Popen:
    cmd = [
        "uvicorn", "app:app",
        "--host", HOST,
        "--port", PORT,
    ]
    print(f"[dev] Starting server: {' '.join(cmd)}")
    return subprocess.Popen(cmd)


def _restart(proc: subprocess.Popen):
    try:
        print("[dev] Reloading server…")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception:
        pass


def main() -> int:
    if not WATCHFILES_OK:
        print("[dev] watchfiles is not installed; falling back to plain uvicorn (no strict reload)")
        os.execvp("uvicorn", ["uvicorn", "app:app", "--host", HOST, "--port", PORT])
        return 0

    baseline = _snapshot(ROOT)
    proc = _start_server()

    try:
        # Debounced event processing
        async def _watch_loop():
            async for changes in awatch(str(ROOT), debounce=750):
                changed_files: Set[Path] = set()
                for change, path_s in changes:
                    p = Path(path_s)
                    if not _should_watch(p):
                        continue
                    changed_files.add(p)

                if not changed_files:
                    continue

                # Compute new hashes and decide if content changed
                content_changed = False
                for p in list(changed_files):
                    if p.is_file():
                        try:
                            new_hash = _hash_file(p)
                        except Exception:
                            continue
                        old_hash = baseline.get(p)
                        if old_hash != new_hash:
                            baseline[p] = new_hash
                            content_changed = True
                    else:
                        # Directory or deletion; resnapshot and reload if includes affected
                        content_changed = True

                if content_changed:
                    nonlocal proc
                    _restart(proc)
                    proc = _start_server()

        import asyncio
        asyncio.run(_watch_loop())
    except KeyboardInterrupt:
        pass
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
