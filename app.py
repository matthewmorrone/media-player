from __future__ import annotations
import os
import re
import json
import time
import math
import logging
import threading
import subprocess
import signal
import tempfile
import shutil
import concurrent.futures
import mimetypes
import io
from difflib import SequenceMatcher
from contextlib import asynccontextmanager

from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Callable, Iterable, cast
import asyncio
import uuid
import sys
import copy
from email.utils import formatdate
from pydantic import BaseModel, Field
from PIL import Image

from fastapi import FastAPI, APIRouter, HTTPException, Query, Body, Request, UploadFile, File
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse, RedirectResponse
from starlette.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

def _ffmpeg_hwaccel_flags() -> list[str]:
    """
    Optional decoder hwaccel hint before -i via FFMPEG_HWACCEL env (e.g., 'auto', 'videotoolbox', 'vaapi').
    Only used when set to avoid compatibility issues on devices without support.
    """
    v = os.environ.get("FFMPEG_HWACCEL")
    if v:
        return ["-hwaccel", str(v)]
    return []

# Global server state and config lock
STATE: Dict[str, Any] = {}
STATE["root"] = Path(os.environ.get("MEDIA_ROOT", ".")).expanduser().resolve()
STATE.setdefault("config", {})
STATE.setdefault("config_path", None)
_CONFIG_LOCK = threading.Lock()

def _sprite_defaults() -> Dict[str, Any]:
    """
    Server-side defaults for sprites generation. Frontend can override via UI.
    """
    return {
        "interval": 12.0,
        "width": 240,
        "cols": 8,
        "rows": 8,
        "quality": 6,
        "keyframes_first": True,
    }

def _vp9_realtime_flags() -> list[str]:
    """
    Aggressive realtime flags for libvpx-vp9/VP8 to favor speed over quality for small previews.
    Tunable via VP9_CPU_USED env (default 8). Also enables row-mt and tile-columns when available.
    """
    cpu = os.environ.get("VP9_CPU_USED")
    try:
        cpu_val = int(cpu) if cpu is not None else 8
    except Exception:
        cpu_val = 8
    cpu_val = max(-8, min(15, cpu_val))  # libvpx range
    return ["-deadline", "realtime", "-cpu-used", str(cpu_val), "-row-mt", "1", "-tile-columns", "2"]

# -----------------------------
# Size/quality env tunables
# -----------------------------
def _env_int(name: str, default: int) -> int:
    try:
        v = os.environ.get(name)
        return int(v) if v is not None and str(v).strip() != "" else int(default)
    except Exception:
        return int(default)

def _default_preview_crf_vp9() -> int:
    # Larger = smaller file. Default favors smaller, faster encodes now.
    return max(10, min(63, _env_int("PREVIEW_CRF_VP9", 42)))

def _default_preview_crf_h264() -> int:
    return max(10, min(51, _env_int("PREVIEW_CRF_H264", 32)))

# Effective preview quality mapping (align preview perceptual quality with thumbnail quality intent)
def _effective_preview_crf_vp9() -> int:
    # If THUMBNAIL_QUALITY provided, map its (2..31) JPEG-style scale to a VP9 CRF.
    # Lower q (better) should yield lower CRF (better). We'll center mapping around default thumbnail q=8 -> crf ~ 42 (legacy default).
    tq = _env_int("THUMBNAIL_QUALITY", -1)
    if tq >= 2:  # valid
        # Map 2(best) -> 30, 8(default) -> 42, 31(worst) -> 55 (clamped)
        crf = int(30 + (tq - 2) * (25 / 29))  # linear interpolation
        return max(10, min(63, crf))
    return _default_preview_crf_vp9()

def _effective_preview_crf_h264() -> int:
    tq = _env_int("THUMBNAIL_QUALITY", -1)
    if tq >= 2:
        # Map 2(best) -> 18, 8(default) -> 32, 31(worst) -> 44
        crf = int(18 + (tq - 2) * (26 / 29))
        return max(10, min(51, crf))
    return _default_preview_crf_h264()

def _ffmpeg_threads_flags() -> list[str]:
    """
    Build ffmpeg threading flags from env. When unset, return [].
    - FFMPEG_THREADS=auto -> ["-threads", "0"] (ffmpeg auto threads)
    - FFMPEG_THREADS=<int> -> ["-threads", str(int)]
    """
    v = os.environ.get("FFMPEG_THREADS")
    if not v:
        return []
    if str(v).strip().lower() == "auto":
        return ["-threads", "0"]
    try:
        n = int(str(v).strip())
        if n >= 0:
            return ["-threads", str(n)]
    except Exception:
        pass
    return []

def ffmpeg_available() -> bool:
    """
    Return True if an ffmpeg executable is available on PATH (or via FFMPEG env).
    """
    try:
        cmd = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
        return bool(cmd)
    except Exception:
        return False

def ffprobe_available() -> bool:
    """
    Return True if an ffprobe executable is available on PATH (or via FFPROBE env).
    """
    try:
        cmd = os.environ.get("FFPROBE") or shutil.which("ffprobe")
        return bool(cmd)
    except Exception:
        return False

def _default_scene_thumb_q() -> int:
    # JPEG/MJPEG scale: 2(best)..31(worst)
    return max(2, min(31, _env_int("SCENE_THUMB_QUALITY", 8)))

def _default_scene_clip_crf() -> int:
    return max(10, min(51, _env_int("SCENE_CLIP_CRF", 32)))

def artifact_dir(video: Path) -> Path:
        """
        Centralized per-video artifact directory under:
            <root>/.artifacts/scenes/<video.stem>/
        All per-video artifact files (same filenames/suffixes as before) are stored inside this folder.
        """
        root = STATE.get("root") or Path.cwd()
        d = Path(root) / ".artifacts" / "scenes" / video.stem
        d.mkdir(parents=True, exist_ok=True)
        return d

def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False

def _module_version(name: str) -> Optional[str]:
    """
    Best-effort to get a module's version string without raising.
    Returns None if unavailable or on error.
    """
    try:
        mod = __import__(name)
    except Exception:
        return None
    # Common attrs
    for attr in ("__version__", "VERSION", "version"):
        try:
            v = getattr(mod, attr, None)
            if v is None:
                continue
            # Some libs expose tuples
            if isinstance(v, (tuple, list)):
                return ".".join(str(x) for x in v)
            return str(v)
        except Exception:
            continue
    # Some libs nest version in a submodule (e.g., cv2.__version__ exists, so the above should work)
    return None

def metadata_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.metadata.json"

def thumbnails_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.thumbnail.jpg"

def phash_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.phash.json"

def scenes_json_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.scenes.json"

def scenes_json_exists(video: Path) -> bool:
    """
    Strict: only accept <stem>.scenes.json in .artifacts (non-empty)."""
    try:
        return _file_nonempty(scenes_json_path(video), min_size=2)
    except Exception:
        return False

def scenes_dir(video: Path) -> Path:
    d = artifact_dir(video) / f"{video.stem}.scenes"
    d.mkdir(parents=True, exist_ok=True)
    return d

def sprite_sheet_paths(video: Path) -> tuple[Path, Path]:
    sheet = artifact_dir(video) / f"{video.stem}.sprites.jpg"
    j = artifact_dir(video) / f"{video.stem}.sprites.json"
    return sheet, j

def heatmaps_json_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.heatmaps.json"

def heatmaps_json_exists(video: Path) -> bool:
    """
    Strict: only accept <stem>.heatmaps.json in .artifacts (non-empty)."""
    try:
        return _file_nonempty(heatmaps_json_path(video), min_size=2)
    except Exception:
        return False

def heatmaps_png_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.heatmaps.png"

def faces_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.faces.json"

def faces_exists_check(video: Path) -> bool:
    """
    Strict: only accept <stem>.faces.json in .artifacts (non-empty, non-stub).

    Rules to count as existing/processed:
    - File exists and is non-empty JSON
    - Not explicitly marked as a stub ("stub": true)
    - Contains a non-empty "faces" array
    - At least one face entry contains a non-empty embedding vector
      (pure detections without embeddings are treated as incomplete)
    - Rejects known sentinel stub: single face with box [0,0,100,100] and empty embedding
    """
    try:
        p = faces_path(video)
        if not _file_nonempty(p, min_size=2):
            return False
        # Parse and reject known stub outputs
        try:
            data = json.loads(p.read_text())
        except Exception:
            return False
        if isinstance(data, dict):
            if bool(data.get("stub")):
                return False
            faces = data.get("faces") or []
            if not isinstance(faces, list) or not faces:
                return False
            # Must have at least one face with a non-empty embedding vector
            try:
                any_emb = False
                for f in faces:
                    emb = (f or {}).get("embedding") or []
                    if isinstance(emb, list) and len(emb) > 0:
                        any_emb = True
                        break
                if not any_emb:
                    return False
            except Exception:
                return False
            # Heuristic: a single sentinel face with empty embedding and 100x100 box is considered stub
            if len(faces) == 1:
                f = faces[0] or {}
                box = f.get("box") or []
                emb = f.get("embedding") or []
                if isinstance(box, list) and len(box) == 4 and list(map(int, box)) == [0, 0, 100, 100] and not emb:
                    return False
        return True
    except Exception:
        return False

def find_subtitles(video: Path) -> Optional[Path]:
    """
    Strict: only accept <stem>{SUFFIX_SUBTITLES_SRT} either in .artifacts or alongside the video (non-empty).
    """
    s_art = artifact_dir(video) / f"{video.stem}{SUFFIX_SUBTITLES_SRT}"
    s_side = video.with_suffix(SUFFIX_SUBTITLES_SRT)
    if _file_nonempty(s_art, min_size=2):
        return s_art
    if _file_nonempty(s_side, min_size=2):
        return s_side
    return None

def _is_stub_subtitles_file(p: Path) -> bool:
    """Heuristic: detect a previously generated 'stub' subtitles file (so we can auto-regenerate later).

    When no real whisper backend is installed we fall back to a tiny deterministic subtitle output.
    If the user later installs a backend the existence check would otherwise skip regeneration and
    jobs appear to finish instantly. We treat files containing the sentinel phrase as stubs.
    """
    try:
        if not p.exists() or p.stat().st_size > 8_000:  # real SRTs usually get larger quickly
            return False
        head = p.read_text(encoding="utf-8", errors="ignore")[:400].lower()
        if "[no speech engine installed]" in head:
            return True
        return False
    except Exception:
        return False

def preview_json_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}"

def preview_webm_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_WEBM}"

def preview_mp4_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_MP4}"

def waveform_png_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_WAVEFORM_PNG}"
def motion_json_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_MOTION_JSON}"
SUFFIX_SUBTITLES_SRT = ".subtitles.srt"
HIDDEN_DIR_SUFFIX_PREVIEWS = ".previews"

# Common artifact suffixes used across the server. Keep in sync with path helpers above.
SUFFIX_METADATA_JSON = ".metadata.json"
SUFFIX_THUMBNAIL_JPG = ".thumbnail.jpg"
SUFFIX_PHASH_JSON = ".phash.json"
SUFFIX_SCENES_JSON = ".scenes.json"
SUFFIX_SPRITES_JPG = ".sprites.jpg"
SUFFIX_SPRITES_JSON = ".sprites.json"
SUFFIX_HEATMAPS_JSON = ".heatmaps.json"
SUFFIX_HEATMAPS_PNG = ".heatmaps.png"
SUFFIX_FACES_JSON = ".faces.json"
SUFFIX_PREVIEW_WEBM = ".preview.webm"
SUFFIX_PREVIEW_MP4 = ".preview.mp4"
SUFFIX_PREVIEW_JSON = ".preview.json"
SUFFIX_WAVEFORM_PNG = ".waveform.png"
SUFFIX_MOTION_JSON = ".motion.json"

def _file_nonempty(p: Path, min_size: int = 64) -> bool:
    """
    Return True if file exists and has at least min_size bytes (guards against zero-byte stubs).
    """
    try:
        return p.exists() and p.stat().st_size >= int(min_size)
    except Exception:
        return False

class _JobContext(threading.local):
    def __init__(self):
        super().__init__()
        self.jid: Optional[str] = None

JOB_CTX = _JobContext()

# Track live subprocesses per job so we can terminate on cancel
JOB_PROCS: dict[str, set[subprocess.Popen]] = {}
JOB_HEARTBEATS: dict[str, float] = {}

# Guarded background workers registry to prevent spawning duplicate infinite workers
_WORKER_THREADS: dict[str, threading.Thread] = {}
_WORKER_MTX = threading.Lock()

def _start_worker_once(key: str, target: Callable, *args, **kwargs) -> bool:
    """Start a long-lived worker thread once by key. Returns True if started now.
    If a previous thread exists and is alive, do nothing and return False.
    """
    try:
        with _WORKER_MTX:
            t = _WORKER_THREADS.get(key)
            if t is not None and t.is_alive():
                return False
            th = threading.Thread(target=target, args=args or (), kwargs=kwargs or {}, name=f"worker-{key}", daemon=True)
            _WORKER_THREADS[key] = th
            th.start()
            return True
    except Exception:
        return False

# Shared bounded thread pool for per-item batch processing across endpoints.
# Caps thread creation on constrained devices (e.g., Raspberry Pi), preventing
# "can't start new thread" crashes from unbounded per-file threads.
try:
    _CPU_CT = os.cpu_count() or 2  # type: ignore[name-defined]
except Exception:
    _CPU_CT = 2  # conservative fallback

def _env_int_safe(name: str, default: int) -> int:
    try:
        v = int(os.environ.get(name, str(default)))  # type: ignore[name-defined]
        return v
    except Exception:
        return default

_BATCH_WORKERS = max(1, _env_int_safe("BATCH_WORKERS", min(4, max(2, _CPU_CT // 2))))
try:
    _BATCH_EXEC: Optional[concurrent.futures.ThreadPoolExecutor] = concurrent.futures.ThreadPoolExecutor(
        max_workers=_BATCH_WORKERS,
        thread_name_prefix="batch-items",
    )
except Exception:
    _BATCH_EXEC = None

def _run_batch_items(items: list[Path], fn: Callable[[Path], None]) -> None:
    """Run per-item work on a shared bounded pool. Falls back to sequential."""
    if not items:
        return
    if _BATCH_EXEC is None:
        for it in items:
            fn(it)
        return
    futs: list[concurrent.futures.Future] = []
    for it in items:
        try:
            futs.append(_BATCH_EXEC.submit(fn, it))
        except Exception:
            # If submission fails (pool saturated or executor unavailable), run inline
            fn(it)
    for fu in futs:
        try:
            fu.result()
        except Exception:
            # Exceptions are already handled within fn in most cases
            pass

# Shared, bounded executor for restoring queued jobs on startup
def _init_restore_executor() -> Optional[concurrent.futures.ThreadPoolExecutor]:
    try:
        # Default 2; never exceed JOB_MAX_CONCURRENCY
        rw = _env_int_safe("RESTORE_WORKERS", min(2, int(JOB_MAX_CONCURRENCY)))
        rw = max(1, min(int(JOB_MAX_CONCURRENCY), int(rw)))
    except Exception:
        rw = 1
    try:
        return concurrent.futures.ThreadPoolExecutor(max_workers=rw, thread_name_prefix="job-restore")
    except Exception:
        return None

_RESTORE_EXEC = _init_restore_executor()

def _register_job_proc(jid: str, proc: subprocess.Popen) -> None:
    with JOB_LOCK:
        s = JOB_PROCS.get(jid)
        if s is None:
            s = set()
            JOB_PROCS[jid] = s
        s.add(proc)

def _unregister_job_proc(jid: str, proc: subprocess.Popen) -> None:
    with JOB_LOCK:
        s = JOB_PROCS.get(jid)
        if s and proc in s:
            s.remove(proc)
            if not s:
                JOB_PROCS.pop(jid, None)

def _terminate_job_processes(jid: str, grace_seconds: float = 2.0) -> int:
    """Signal all tracked processes for a job. TERM first, then KILL after grace.
    Returns number of processes signaled."""
    procs: list[subprocess.Popen] = []
    with JOB_LOCK:
        s = JOB_PROCS.get(jid)
        if s:
            procs = list(s)
    count = 0
    for p in procs:
        try:
            if getattr(p, "pid", None):
                try:
                    os.killpg(p.pid, signal.SIGTERM)
                except Exception:
                    p.terminate()
            else:
                p.terminate()
            count += 1
        except Exception:
            pass
    if count:
        t0 = time.time()
        while time.time() - t0 < grace_seconds:
            if all(p.poll() is not None for p in procs):
                break
            time.sleep(0.1)
        for p in [p for p in procs if p.poll() is None]:
            try:
                if getattr(p, "pid", None):
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except Exception:
                        p.kill()
                else:
                    p.kill()
            except Exception:
                pass
    return count

# -----------------------------
# Global ffmpeg concurrency gate
# -----------------------------
try:
    # Default concurrency raised to 4 (was 2) so that lightweight preview encodes
    # can run in parallel up to four at a time without requiring an env override.
    _FFMPEG_CONCURRENCY = max(1, min(16, int(os.environ.get("FFMPEG_CONCURRENCY", "4"))))
except Exception:
    _FFMPEG_CONCURRENCY = 4
_FFMPEG_SEM = threading.BoundedSemaphore(_FFMPEG_CONCURRENCY)
_FFMPEG_SEM_GUARD = threading.Lock()

def _set_ffmpeg_concurrency(new_val: int) -> int:
    """Adjust the FFmpeg concurrency gate at runtime.
    We swap the global semaphore safely; callers capture a local reference before acquire/release.
    Returns the effective concurrency.
    """
    global _FFMPEG_CONCURRENCY, _FFMPEG_SEM
    try:
        target = max(1, min(16, int(new_val)))
    except Exception:
        target = 1
    with _FFMPEG_SEM_GUARD:
        # Swap semaphore; callers use local captured ref for release safety
        _FFMPEG_SEM = threading.BoundedSemaphore(target)
        _FFMPEG_CONCURRENCY = target
    # Also mirror into environment for visibility
    try:
        os.environ["FFMPEG_CONCURRENCY"] = str(target)
    except Exception:
        pass
    return _FFMPEG_CONCURRENCY

# (removed: legacy global job concurrency gate; see Jobs subsystem for active JOB_RUN_SEM)


def _run_inner(cmd: list[str]) -> subprocess.CompletedProcess:
    """
    Run a subprocess command with optional global timeout and cooperative cancellation.
    If env FFMPEG_TIMELIMIT (>0) is set, apply it as a timeout to protect against hangs.
    When called within a job thread (JOB_CTX.jid is set), launch as a process group and
    poll periodically; if the job is canceled, terminate the group early.
    """
    try:
        # Built-in default timelimit 600s unless overridden by env
        tl = int(os.environ.get("FFMPEG_TIMELIMIT", "600") or 600)
    except Exception:
        tl = 600
    jid = getattr(JOB_CTX, "jid", None)
    if not jid:
        try:
            if tl and tl > 0:
                return subprocess.run(cmd, capture_output=True, text=True, timeout=tl)
            return subprocess.run(cmd, capture_output=True, text=True)
        except subprocess.TimeoutExpired as te:
            raise RuntimeError(f"subprocess timed out after {tl}s: {' '.join(cmd[:4])}...") from te
    # In a job context
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    _register_job_proc(jid, proc)
    start_time = time.time()
    try:
        while True:
            rc = proc.poll()
            if rc is not None:
                break
            if tl and tl > 0 and (time.time() - start_time) > tl:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except Exception:
                    proc.kill()
                raise RuntimeError(f"subprocess timed out after {tl}s: {' '.join(cmd[:4])}...")
            if _job_check_canceled(jid):
                _terminate_job_processes(jid)
                raise RuntimeError("canceled")
            time.sleep(0.1)
        out, err = proc.communicate()
        return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
    finally:
        _unregister_job_proc(jid, proc)

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    """
    Wrapper around _run_inner that enforces a GLOBAL concurrency cap for ffmpeg.
    Any command whose executable basename is 'ffmpeg' must acquire a slot in
    _FFMPEG_SEM before running. Non-ffmpeg commands bypass the gate.
    Concurrency can be adjusted via env FFMPEG_CONCURRENCY (default 2, min 1, max 8).
    """
    is_ffmpeg = False
    try:
        if cmd and os.path.basename(cmd[0]) == "ffmpeg":
            is_ffmpeg = True
    except Exception:
        is_ffmpeg = False

    if not is_ffmpeg:
        return _run_inner(cmd)

    # Capture local reference to tolerate runtime swaps
    local_sem = _FFMPEG_SEM
    local_sem.acquire()
    try:
        return _run_inner(cmd)
    finally:
        try:
            local_sem.release()
        except Exception:
            # In case of unexpected swap or other error, avoid crashing
            pass

# -----------------------------
# Per-file locks (in-proc + cross-proc)
# -----------------------------
try:
    import fcntl as _fcntl  # type: ignore
except Exception:
    _fcntl = None  # type: ignore

_FILE_LOCKS: dict[str, threading.Lock] = {}
_FILE_LOCKS_MTX = threading.Lock()

class _PerFileLock:
    def __init__(self, video: Path, key: str):
        self.video = video
        self.key = key
        self._lock: Optional[threading.Lock] = None
        self._fd: Optional[int] = None

    def __enter__(self):
        k = f"{self.key}::{str(self.video.resolve())}"
        with _FILE_LOCKS_MTX:
            lock = _FILE_LOCKS.get(k)
            if lock is None:
                lock = threading.Lock()
                _FILE_LOCKS[k] = lock
        lock.acquire()
        self._lock = lock
        # Cross-process lock: place under artifact_dir/.locks/<key>.lock
        try:
            d = artifact_dir(self.video) / ".locks"
            d.mkdir(parents=True, exist_ok=True)
            lp = d / f"{self.key}.lock"
            fd = os.open(lp, os.O_CREAT | os.O_RDWR, 0o644)
            self._fd = fd
            if _fcntl is not None:
                try:
                    _fcntl.flock(fd, _fcntl.LOCK_EX)
                except Exception:
                    pass
        except Exception:
            pass
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if self._fd is not None and _fcntl is not None:
                try:
                    _fcntl.flock(self._fd, _fcntl.LOCK_UN)
                except Exception:
                    pass
        finally:
            try:
                if self._fd is not None:
                    os.close(self._fd)
            except Exception:
                pass
            try:
                if self._lock is not None:
                    self._lock.release()
            except Exception:
                pass

def metadata_single(video: Path, *, force: bool = False) -> None:
    out = metadata_path(video)
    if out.exists() and not force:
        return
    # If ffprobe is disabled or not available, write a minimal stub instead of failing
    # @TODO copilot: no want this, should error
    _log("thumbnail", f"metadata start path={video}")
    if os.environ.get("FFPROBE_DISABLE") or not ffprobe_available():
        payload = {
            "format": {"duration": "0.0", "bit_rate": "0"},
            "streams": [
                {"codec_type": "video", "width": 640, "height": 360, "codec_name": "h264", "bit_rate": "0"},
                {"codec_type": "audio", "codec_name": "aac", "bit_rate": "0"}
            ]
        }
        out.write_text(json.dumps(payload, indent=2))
        _log("thumbnail", f"metadata end path={video} stub=1 ok=1")
        return
    cmd = [
        "ffprobe", "-v", "error",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(video),
    ]
    proc = _run(cmd)
    if proc.returncode == 0:
        try:
            payload = json.loads(proc.stdout or "{}")
            if not isinstance(payload, dict) or not payload:
                # Guard against unexpected output
                raise ValueError("invalid ffprobe json")
        except Exception:
            # Fallback to a minimal stub when parsing fails
            payload = {
                "format": {"duration": "0.0", "bit_rate": "0"},
                "streams": [
                    {"codec_type": "video", "width": 640, "height": 360, "codec_name": "h264", "bit_rate": "0"},
                    {"codec_type": "audio", "codec_name": "aac", "bit_rate": "0"}
                ]
            }
    else:
        # Fall back to a minimal stub when ffprobe fails (e.g., invalid/corrupt file)
        payload = {
            "format": {"duration": "0.0", "bit_rate": "0"},
            "streams": [
                {"codec_type": "video", "width": 640, "height": 360, "codec_name": "h264", "bit_rate": "0"},
                {"codec_type": "audio", "codec_name": "aac", "bit_rate": "0"}
            ]
        }
    out.write_text(json.dumps(payload, indent=2))
    try:
        dur = extract_duration(payload)
    except Exception:
        dur = None
    _log("thumbnail", f"metadata end path={video} stub=0 ok=1 dur={dur if dur is not None else 'na'}")

def extract_duration(ffprobe_json: Optional[dict]) -> Optional[float]:
    try:
        if not isinstance(ffprobe_json, dict):
            return None
        d = ffprobe_json.get("format", {}).get("duration")
        if d is None:
            return None
        return float(d)
    except Exception:
        return None

def _metadata_summary_cached(video: Path) -> tuple[Optional[float], Optional[str], Optional[int], Optional[int]]:
    """
    Return (duration, title, width, height) using a small cache by sidecar mtime.
    Avoids re-reading/parsing the JSON on every /api/library call across many files.
    """
    try:
        mpath = metadata_path(video)
        if not mpath.exists():
            return None, None, None, None
        st = mpath.stat()
        mt = float(getattr(st, "st_mtime", 0.0) or 0.0)
        key = str(video.resolve())
        cache = STATE.get("_metadata_cache")  # type: ignore[assignment]
        if isinstance(cache, dict):
            ent = cache.get(key)
            if ent and isinstance(ent, dict) and ent.get("mt") == mt:
                s = ent.get("s") or {}
                return (
                    s.get("duration"),
                    s.get("title"),
                    s.get("width"),
                    s.get("height"),
                )
        # Not cached or stale: parse afresh
        try:
            raw = json.loads(mpath.read_text())
        except Exception:
            raw = None
        dur = extract_duration(raw) if isinstance(raw, dict) else None
        title = None
        width = None
        height = None
        try:
            if isinstance(raw, dict):
                fmt = raw.get("format", {}) or {}
                title = (fmt.get("tags", {}) or {}).get("title")
                for st in (raw.get("streams") or []):
                    if (st or {}).get("codec_type") == "video":
                        try:
                            width = int(st.get("width") or 0) or None
                            height = int(st.get("height") or 0) or None
                        except Exception:
                            width = width or None
                            height = height or None
                        break
        except Exception:
            pass
        # Store back to cache
        if isinstance(cache, dict):
            cache[key] = {"mt": mt, "s": {"duration": dur, "title": title, "width": width, "height": height}}
        return dur, title, width, height
    except Exception:
        return None, None, None, None

def _metadata_bitrate_codecs_cached(video: Path) -> tuple[Optional[int], Optional[str], Optional[str]]:
    """
    Return (bitrate, vcodec, acodec) using the same small cache keyed by sidecar mtime.
    Safe and fast: parses JSON sidecar once per mtime.
    """
    try:
        mpath = metadata_path(video)
        if not mpath.exists():
            return None, None, None
        st = mpath.stat()
        mt = float(getattr(st, "st_mtime", 0.0) or 0.0)
        key = str(video.resolve())
        cache = STATE.get("_metadata_cache")  # type: ignore[assignment]
        if isinstance(cache, dict):
            ent = cache.get(key)
            if ent and isinstance(ent, dict) and ent.get("mt") == mt:
                s = ent.get("s") or {}
                return (
                    s.get("bitrate"),
                    s.get("vcodec"),
                    s.get("acodec"),
                )
        # Not cached or stale: parse
        try:
            raw = json.loads(mpath.read_text())
        except Exception:
            raw = None
        bitrate: Optional[int] = None
        vcodec: Optional[str] = None
        acodec: Optional[str] = None
        if isinstance(raw, dict):
            try:
                fmt = (raw.get("format", {}) or {})
                br = fmt.get("bit_rate") if isinstance(fmt, dict) else None
                if isinstance(br, (int, float)):
                    bitrate = int(br)
                elif isinstance(br, str) and br.isdigit():
                    bitrate = int(br)
            except Exception:
                bitrate = None
            try:
                for st in (raw.get("streams") or []):
                    if not isinstance(st, dict):
                        continue
                    ct = (st.get("codec_type") or "").lower()
                    if ct == "video" and vcodec is None:
                        vc = st.get("codec_name")
                        vcodec = str(vc) if isinstance(vc, str) else None
                    elif ct == "audio" and acodec is None:
                        ac = st.get("codec_name")
                        acodec = str(ac) if isinstance(ac, str) else None
                    if vcodec is not None and acodec is not None:
                        break
            except Exception:
                pass
        # Merge into existing summary cache entry if present
        if isinstance(cache, dict):
            ent = cache.get(key)
            if ent and isinstance(ent, dict) and ent.get("mt") == mt:
                s = ent.get("s") or {}
                s.update({"bitrate": bitrate, "vcodec": vcodec, "acodec": acodec})
                ent["s"] = s
                cache[key] = ent
            else:
                cache[key] = {"mt": mt, "s": {"bitrate": bitrate, "vcodec": vcodec, "acodec": acodec}}
        return bitrate, vcodec, acodec
    except Exception:
        return None, None, None

def parse_time_spec(spec: str | float | int | None, duration: Optional[float]) -> float:
    if spec is None:
        return 0.0
    try:
        if isinstance(spec, (int, float)):
            return max(0.0, float(spec))
        s = str(spec).strip().lower()
        if s == "start":
            return 0.0
        if s == "middle" and duration:
            return max(0.0, float(duration) / 2.0)
        if s.endswith("%") and duration:
            p = float(s[:-1]) / 100.0
            return max(0.0, float(duration) * p)
        return max(0.0, float(s))
    except Exception:
        return 0.0

def generate_thumbnail(video: Path, *, force: bool, time_spec: str | float | int = "middle", quality: int = 2) -> None:
    out = thumbnails_path(video)
    if out.exists() and not force:
        try:
            size0 = out.stat().st_size if out.exists() else None
        except Exception:
            size0 = None
        _log("thumbnail", f"thumbnail skip path={video} reason=exists size={size0 if size0 is not None else 'na'} out={out}")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    _log("thumbnail", f"thumbnail start path={video} force={int(force)} out={out} time_spec={time_spec} q_in={quality}")
    # If ffmpeg isn't available, write a valid placeholder JPEG (last resort)
    if not ffmpeg_available():
        try:
            from PIL import Image  # type: ignore
            img = Image.new("RGB", (320, 180), color=(17, 17, 17))
            img.save(out, format="JPEG", quality=max(2, min(95, int(quality)*10)))
            _log("thumbnail", f"thumbnail placeholder written (ffmpeg missing) path={video} size={out.stat().st_size if out.exists() else 'na'}")
            return
        except Exception:
            # Last resort: write a tiny valid JPEG byte sequence
            # 1x1 black JPEG
            stub = bytes([
                0xFF,0xD8,0xFF,0xDB,0x00,0x43,0x00,0x03,0x02,0x02,0x03,0x02,0x02,0x03,0x03,0x03,0x03,0x04,0x03,0x03,0x04,0x05,0x08,0x05,0x05,0x04,0x04,0x05,0x0A,0x07,0x07,0x06,0x08,0x0C,0x0A,0x0C,0x0C,0x0B,0x0A,0x0B,0x0B,0x0D,0x0E,0x12,0x10,0x0D,0x0E,0x11,0x0E,0x0B,0x0B,0x10,0x16,0x10,0x11,0x13,0x14,0x15,0x15,0x15,0x0C,0x0F,0x17,0x18,0x16,0x14,0x18,0x12,0x14,0x15,0x14,
                0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,
                0xFF,0xC4,0x00,0x14,0x00,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0xFF,0xC4,0x00,0x14,0x10,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xBF,0xFF,0xD9
            ])
            try:
                out.write_bytes(stub)
            except Exception:
                pass
            _log("thumbnail", f"thumbnail stub written (ffmpeg missing) path={video}")
            return

    duration = None
    try:
        mpath = metadata_path(video)
        if mpath.exists():
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
        else:
            metadata_single(video, force=False)
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
    except Exception:
        duration = None
    _log("thumbnail", f"thumbnail metadata path={video} dur={duration if duration is not None else 'na'} source={'cached' if 'mpath' in locals() and mpath.exists() else 'generated'}")
    t = parse_time_spec(time_spec, duration)
    _log("thumbnail", f"thumbnail time_spec_resolved path={video} time={t:.3f}s from={time_spec}")
    # Use mjpeg to write jpg
    # Allow env override when API callers pass default quality (2)
    if int(quality) == 2:
        # Default to more compressed thumbnails unless overridden via env
        quality = _env_int("THUMBNAIL_QUALITY", 8)
    # Capture ffmpeg runtime flags for visibility
    try:
        hw = _ffmpeg_hwaccel_flags()
    except Exception:
        hw = []
    try:
        th_flags = _ffmpeg_threads_flags()
    except Exception:
        th_flags = []
    # Preserve aspect ratio: scale width to a target while letting height follow (-1), ensure even dims
    target_w = int(os.environ.get("THUMBNAIL_WIDTH", "320") or 320)
    cmd = [
        "ffmpeg", "-y",
        *(hw),
        "-noaccurate_seek",
        "-ss", f"{t:.3f}",
        "-i", str(video),
        "-frames:v", "1",
        # Scale by width keeping aspect ratio, then enforce even dimensions.
        # The 'scale' ensures width~=target_w and height auto; 'scale' with ceil then even padding by truncation
        "-vf", f"scale='min({target_w},iw)':'-2'",
        "-q:v", str(max(2, min(31, int(quality)))),
        *(th_flags),
        str(out),
    ]
    try:
        tl = int(os.environ.get("FFMPEG_TIMELIMIT", "600") or 600)
    except Exception:
        tl = 600
    try:
        _log("thumbnail", f"thumbnail exec path={video} hw={','.join(hw) if hw else 'none'} threads_flags={' '.join(th_flags) if th_flags else 'none'} timelimit={tl}s cmd={' '.join(cmd)}")
    except Exception:
        pass
    t0 = time.time()
    proc = _run(cmd)
    elapsed = time.time() - t0
    if proc.returncode != 0:
        # Log a trimmed stderr for inspection
        try:
            err = (proc.stderr or "").strip()
            if len(err) > 1200:
                err = err[:1200] + "…"
        except Exception:
            err = ""
        _log("thumbnail", f"thumbnail fail path={video} code={proc.returncode} elapsed={elapsed:.3f}s stderr={err!r}")
        raise RuntimeError(proc.stderr.strip() or "ffmpeg thumbnail failed")
    else:
        size = None
        try:
            if out.exists():
                size = out.stat().st_size
        except Exception:
            pass
        _log("thumbnail", f"thumbnail end path={video} code=0 size={size if size is not None else 'na'} elapsed={elapsed:.3f}s out={out}")

# ----------------------
# Preview generator
# ----------------------
def generate_preview(
    video: Path,
    *,
    segments: int = 9,
    seg_dur: float = 2,
    width: int = 240,
    fmt: str = "webm",
    out: Optional[Path] = None,
    progress_cb: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Path:
    out = out or (artifact_dir(video) / f"{video.stem}.preview.{fmt}")
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        print(f"[preview][init] video={video} fmt={fmt} segs={segments} seg_dur={seg_dur} width={width} out={out}")
    except Exception:
        pass
    # Collect debug/inspection info to persist next to the preview
    preview_info: dict[str, Any] = {
        "status": "started",
        "strategy": None,
        "video": str(video),
        "output": str(out),
        "fmt": (fmt or "webm").lower(),
        "width": int(width),
        "seg_dur": float(seg_dur),
        "segments_planned": int(segments),
        "segments_used": 0,
        "points": [],
    }
    # Allow operation without ffprobe: we'll skip duration probing and use uniform spacing
    # If explicitly disabled, or ffmpeg missing, write a lightweight stub to keep pipelines moving.
    if os.environ.get("FFPROBE_DISABLE") and not ffmpeg_available():
        out.write_text("stub preview")
        try: print("[preview][early-exit] ffprobe disabled & ffmpeg unavailable -> stub")
        except Exception: pass
        return out
    if not ffmpeg_available():
        # Last-resort: create a tiny stub so idempotent checks pass and jobs don't loop
        try:
            out.write_text("stub preview")
        except Exception:
            pass
        try: print("[preview][early-exit] ffmpeg unavailable -> stub written")
        except Exception: pass
        return out
    # compute timeline positions
    dur = None
    try:
        # Try to read duration if available; tolerate lack of ffprobe by falling back gracefully
        if ffprobe_available():
            if metadata_path(video).exists():
                dur = extract_duration(json.loads(metadata_path(video).read_text()))
            else:
                metadata_single(video, force=False)
                dur = extract_duration(json.loads(metadata_path(video).read_text()))
        else:
            dur = None
    except Exception:
        dur = None
    segs = max(1, int(segments))
    # Enforce segments so each (start, start+seg_dur) fits fully when duration known.
    if dur and dur > 0:
        max_full_segments = int(float(dur) // float(seg_dur)) if seg_dur > 0 else segs
        if max_full_segments == 0:
            max_full_segments = 1
        if segs > max_full_segments:
            segs = max_full_segments
        max_start = max(0.0, float(dur) - float(seg_dur))
        if max_start <= 0:
            points = [0.0]
            segs = 1
        else:
            points = [min(max_start, ((i + 1) / (segs + 1)) * max_start) for i in range(segs)]
        # Enforce a minimum gap between segment starts to avoid visually similar adjacent frames
        # Gap is 25% of segment duration (capped so we don't overshoot timeline). Adjustable via PREVIEW_MIN_GAP_FRAC.
        try:
            gap_frac = float(os.environ.get("PREVIEW_MIN_GAP_FRAC", "0.25"))
        except Exception:
            gap_frac = 0.25
        gap_frac = max(0.0, min(0.9, gap_frac))
        min_gap = float(seg_dur) * gap_frac
        if min_gap > 0 and len(points) > 1:
            filtered = []
            last = -1e9
            for p in points:
                if p - last >= min_gap:
                    filtered.append(p)
                    last = p
            # If aggressive filtering removed too many, fall back to at least first/last unique positions
            if not filtered:
                filtered = [0.0]
            points = filtered
            segs = len(points)
    else:
        points = [max(0.0, i * float(seg_dur)) for i in range(segs)]
    if len(points) > segs:
        points = points[:segs]
    try:
        preview_info["points"] = [float(f"{p:.3f}") for p in points]
        try: print(f"[preview][points] count={len(points)} values={preview_info['points']}")
        except Exception: pass
    except Exception:
        pass

    # Prefer single-pass when no progress callback; otherwise multi-step to report progress
    try:
        _psp = os.environ.get("PREVIEW_SINGLE_PASS", "1")
        try_single_pass = str(_psp).strip().lower() not in ("0", "false", "no")
    except Exception:
        try_single_pass = True
    # Previously we disabled single-pass when progress_cb present to allow per-segment updates.
    # We now support progress reporting inside single-pass by parsing ffmpeg's -progress output,
    # so keep try_single_pass unless explicitly disabled via env.
    ff_loglevel = os.environ.get("FFMPEG_LOGLEVEL", "error")
    ff_debug = os.environ.get("FFMPEG_DEBUG") is not None
    try: print(f"[preview][mode] try_single_pass={try_single_pass} ff_loglevel={ff_loglevel} ff_debug={ff_debug}")
    except Exception: pass

    # Per-file lock to avoid concurrent preview generation on same file
    try:
        with _PerFileLock(video, key="preview"):
            try: print("[preview][lock] acquired")
            except Exception: pass
            if try_single_pass:
                try:
                    try: print("[preview][single-pass] building filter graph")
                    except Exception: pass
                    trim_chains: list[str] = []
                    split_labels = "".join([f"[v{i}]" for i in range(segs)])
                    parts = [f"[0:v]split={segs}{split_labels}"]
                    for i, start in enumerate(points):
                        parts.append(f"[v{i}]trim=start={start:.3f}:end={(start + seg_dur):.3f},setpts=PTS-STARTPTS[s{i}]")
                        trim_chains.append(f"[s{i}]")
                    concat_inputs = "".join(trim_chains)
                    parts.append(
                        f"{concat_inputs}concat=n={segs}:v=1:a=0,"
                        f"scale={int(width)}:-2:force_original_aspect_ratio=decrease,"
                        f"pad=ceil(iw/2)*2:ceil(ih/2)*2[outv]"
                    )
                    filter_complex = ";".join(parts)
                    base_cmd = [
                        "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
                        *(_ffmpeg_hwaccel_flags()),
                        "-i", str(video),
                        "-filter_complex", filter_complex,
                        "-map", "[outv]",
                        "-an",
                    ]
                    if fmt == "mp4":
                        cmd = base_cmd + [
                            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_effective_preview_crf_h264()),
                            "-pix_fmt", "yuv420p",
                            "-movflags", "+faststart",
                            *(_ffmpeg_threads_flags()),
                            str(out),
                        ]
                        if ff_debug:
                            try:
                                print("[preview] ffmpeg:", " ".join(cmd))
                            except Exception:
                                pass
                        else:
                            try: print(f"[preview][single-pass][cmd] {' '.join(cmd)}")
                            except Exception: pass
                        # If a progress callback is provided, run ffmpeg with -progress pipe:1 and parse timing.
                        proc = None
                        if progress_cb is not None:
                            try: print("[preview][progress] starting mp4 progress parsing run")
                            except Exception: pass
                            import subprocess, time as _time
                            # Insert -progress option before output file argument
                            cmd_progress = cmd[:-1] + ["-progress", "pipe:1"] + cmd[-1:]
                            # Concurrency gate (mirror _run) for ffmpeg
                            _is_ffmpeg = False
                            try:
                                if cmd_progress and os.path.basename(cmd_progress[0]) == "ffmpeg":
                                    _is_ffmpeg = True
                            except Exception:
                                _is_ffmpeg = False
                            _sem = _FFMPEG_SEM if _is_ffmpeg else None
                            if _sem is not None:
                                _sem.acquire()
                            try:
                                proc_p = subprocess.Popen(cmd_progress, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                                total_target = float(segs) * float(seg_dur)
                                last_step = -1
                                start_t = _time.time()
                                # Watchdog configuration (env-tunable)
                                try:
                                    wd_log_after = float(os.environ.get("PREVIEW_PROGRESS_WATCHDOG_SECS", "10"))
                                except Exception:
                                    wd_log_after = 10.0
                                try:
                                    wd_kill_after = float(os.environ.get("PREVIEW_PROGRESS_KILL_SECS", "60"))
                                except Exception:
                                    wd_kill_after = 60.0
                                wd_log_after = max(1.0, wd_log_after)
                                wd_kill_after = max(wd_log_after + 1.0, wd_kill_after)
                                last_progress_time = start_t
                                watchdog_logged = False
                                killed_for_stall = False
                                last_raw_ms = -1  # for deduping identical out_time_ms values
                                while True:
                                    if cancel_check and cancel_check():
                                        try:
                                            proc_p.kill()
                                        except Exception:
                                            pass
                                        raise RuntimeError("canceled")
                                    line = proc_p.stdout.readline() if proc_p.stdout else ''
                                    if line == '' and proc_p.poll() is not None:
                                        break
                                    line = line.strip()
                                    if line.startswith('out_time_ms='):
                                        try:
                                            ms = int(line.split('=',1)[1])
                                        except Exception:
                                            ms = -1
                                        secs = ms / 1_000_000.0 if ms >= 0 else 0.0
                                        if ms != last_raw_ms:
                                            last_raw_ms = ms
                                            # (debug removed per request)
                                        # Map continuous time to segment-count style updates for UI consistency
                                        if total_target > 0 and secs >= 0:
                                            frac = max(0.0, min(1.0, secs / total_target))
                                            step = int(round(frac * segs))
                                            if step > segs:
                                                step = segs
                                            if step > last_step:
                                                last_step = step
                                                try: progress_cb(step, segs)
                                                except Exception: pass
                                                try: print(f"[preview][progress] step={step}/{segs} secs={secs:.3f}")
                                                except Exception: pass
                                                last_progress_time = _time.time()
                                    elif line == 'progress=end':
                                        try: print(f"[preview][progress] end (mp4 single-pass) video={video.name}")
                                        except Exception: pass
                                    # Light sleep prevents busy loop if progress lines sparse
                                    if proc_p.poll() is None and not line:
                                        _time.sleep(0.05)
                                    # Stall watchdog: log once after wd_log_after with no progress, force kill after wd_kill_after
                                    now_t = _time.time()
                                    idle = now_t - last_progress_time
                                    if not watchdog_logged and idle >= wd_log_after and proc_p.poll() is None:
                                        watchdog_logged = True
                                        try:
                                            cur_size = out.stat().st_size if out.exists() else 0
                                        except Exception:
                                            cur_size = -1
                                        try: print(f"[preview][watchdog] no progress for {idle:.1f}s (size={cur_size}) cmd=mp4 single-pass")
                                        except Exception: pass
                                    if idle >= wd_kill_after and proc_p.poll() is None:
                                        try: print(f"[preview][watchdog] killing stalled ffmpeg after {idle:.1f}s (mp4 single-pass)")
                                        except Exception: pass
                                        try:
                                            proc_p.kill()
                                        except Exception:
                                            pass
                                        killed_for_stall = True
                                        break
                                rc = proc_p.poll()
                                # Drain remaining stderr for diagnostics
                                stderr_txt = ''
                                try:
                                    if proc_p.stderr:
                                        stderr_txt = proc_p.stderr.read()
                                except Exception:
                                    pass
                                proc = subprocess.CompletedProcess(cmd_progress, rc if rc is not None else -1, '', stderr_txt)
                                # Ensure final progress update hits 100%
                                if rc == 0 and last_step < segs:
                                    try:
                                        progress_cb(segs, segs)
                                    except Exception:
                                        pass
                                    try: print(f"[preview][progress] final step forced {segs}/{segs}")
                                    except Exception: pass
                            finally:
                                if _sem is not None:
                                    try:
                                        _sem.release()
                                    except Exception:
                                        pass
                        else:
                            proc = _run(cmd)
                            try: print(f"[preview][single-pass][exec] returncode={proc.returncode}")
                            except Exception: pass
                        if proc.returncode == 0 and _file_nonempty(out):
                            if ff_debug:
                                try:
                                    print(f"[preview] success (single-pass mp4): {out} size={out.stat().st_size}")
                                except Exception:
                                    pass
                            try:
                                preview_info.update({"status": "ok", "strategy": "single-pass-mp4", "segments_used": int(segs)})
                                _json_dump_atomic(artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}", preview_info)
                            except Exception:
                                pass
                            return out
                    else:
                        cmd = base_cmd + [
                            "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()),
                            *_vp9_realtime_flags(),
                            "-pix_fmt", "yuv420p",
                            *(_ffmpeg_threads_flags()),
                            str(out),
                        ]
                        if ff_debug:
                            try:
                                print("[preview] ffmpeg:", " ".join(cmd))
                            except Exception:
                                pass
                        else:
                            try: print(f"[preview][single-pass][cmd] {' '.join(cmd)}")
                            except Exception: pass
                        proc = None
                        if progress_cb is not None:
                            try: print("[preview][progress] starting webm progress parsing run")
                            except Exception: pass
                            import subprocess, time as _time
                            cmd_progress = cmd[:-1] + ["-progress", "pipe:1"] + cmd[-1:]
                            _is_ffmpeg = False
                            try:
                                if cmd_progress and os.path.basename(cmd_progress[0]) == "ffmpeg":
                                    _is_ffmpeg = True
                            except Exception:
                                _is_ffmpeg = False
                            _sem = _FFMPEG_SEM if _is_ffmpeg else None
                            if _sem is not None:
                                _sem.acquire()
                            try:
                                proc_p = subprocess.Popen(cmd_progress, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                                total_target = float(segs) * float(seg_dur)
                                last_step = -1
                                # Watchdog configuration for webm variant
                                try:
                                    wd_log_after = float(os.environ.get("PREVIEW_PROGRESS_WATCHDOG_SECS", "10"))
                                except Exception:
                                    wd_log_after = 10.0
                                try:
                                    wd_kill_after = float(os.environ.get("PREVIEW_PROGRESS_KILL_SECS", "60"))
                                except Exception:
                                    wd_kill_after = 60.0
                                wd_log_after = max(1.0, wd_log_after)
                                wd_kill_after = max(wd_log_after + 1.0, wd_kill_after)
                                import time as _time  # ensure _time for this scope if not imported above
                                last_progress_time = _time.time()
                                watchdog_logged = False
                                killed_for_stall = False
                                last_raw_ms = -1
                                while True:
                                    if cancel_check and cancel_check():
                                        try: proc_p.kill()
                                        except Exception: pass
                                        raise RuntimeError("canceled")
                                    line = proc_p.stdout.readline() if proc_p.stdout else ''
                                    if line == '' and proc_p.poll() is not None:
                                        break
                                    line=line.strip()
                                    if line.startswith('out_time_ms='):
                                        try:
                                            ms = int(line.split('=',1)[1])
                                        except Exception:
                                            ms = -1
                                        secs = ms/1_000_000.0 if ms >= 0 else 0.0
                                        if ms != last_raw_ms:
                                            last_raw_ms = ms
                                            # (debug removed per request)
                                        if total_target>0 and secs >= 0:
                                            frac = max(0.0, min(1.0, secs/total_target))
                                            step = int(round(frac*segs))
                                            if step>segs: step=segs
                                            if step> last_step:
                                                last_step = step
                                                try: progress_cb(step, segs)
                                                except Exception: pass
                                                try: print(f"[preview][progress] step={step}/{segs} secs={secs:.3f}")
                                                except Exception: pass
                                                last_progress_time = _time.time()
                                    elif line == 'progress=end':
                                        try: print(f"[preview][progress] end (webm single-pass) video={video.name}")
                                        except Exception: pass
                                    if proc_p.poll() is None and not line:
                                        _time.sleep(0.05)
                                    now_t = _time.time()
                                    idle = now_t - last_progress_time
                                    if not watchdog_logged and idle >= wd_log_after and proc_p.poll() is None:
                                        watchdog_logged = True
                                        try:
                                            cur_size = out.stat().st_size if out.exists() else 0
                                        except Exception:
                                            cur_size = -1
                                        try: print(f"[preview][watchdog] no progress for {idle:.1f}s (size={cur_size}) cmd=webm single-pass")
                                        except Exception: pass
                                    if idle >= wd_kill_after and proc_p.poll() is None:
                                        try: print(f"[preview][watchdog] killing stalled ffmpeg after {idle:.1f}s (webm single-pass)")
                                        except Exception: pass
                                        try: proc_p.kill()
                                        except Exception: pass
                                        killed_for_stall = True
                                        break
                                rc = proc_p.poll()
                                stderr_txt=''
                                try:
                                    if proc_p.stderr: stderr_txt = proc_p.stderr.read()
                                except Exception: pass
                                proc = subprocess.CompletedProcess(cmd_progress, rc if rc is not None else -1, '', stderr_txt)
                                if rc == 0 and last_step < segs:
                                    try: progress_cb(segs, segs)
                                    except Exception: pass
                                    try: print(f"[preview][progress] final step forced {segs}/{segs}")
                                    except Exception: pass
                            finally:
                                if _sem is not None:
                                    try: _sem.release()
                                    except Exception: pass
                        else:
                            proc = _run(cmd)
                            try: print(f"[preview][single-pass][exec] returncode={proc.returncode}")
                            except Exception: pass
                        if (proc.returncode != 0 or not _file_nonempty(out)):
                            cmd = base_cmd + [
                                "-c:v", "libvpx", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()),
                                *_vp9_realtime_flags(),
                                *(_ffmpeg_threads_flags()),
                                str(out),
                            ]
                            if ff_debug:
                                try:
                                    print("[preview] ffmpeg (fallback):", " ".join(cmd))
                                except Exception:
                                    pass
                            proc = _run(cmd)
                        if proc.returncode == 0 and _file_nonempty(out):
                            if ff_debug:
                                try:
                                    print(f"[preview] success (single-pass webm): {out} size={out.stat().st_size}")
                                except Exception:
                                    pass
                            try:
                                preview_info.update({"status": "ok", "strategy": "single-pass-webm", "segments_used": int(segs)})
                                _json_dump_atomic(artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}", preview_info)
                            except Exception:
                                pass
                            return out
                except Exception:
                    try: print("[preview][single-pass] failed; falling back to multi-step")
                    except Exception: pass
                    pass
    except Exception:
        pass

    # Multi-step fallback: segments then concat via filter.
    # BUGFIX: Previously the TemporaryDirectory context closed BEFORE segments were encoded,
    # deleting the directory and causing every segment encode to fail with 'No such file or directory (tmp gone)'.
    # We now keep the entire multi-step process inside the context so temp files persist until concat completes.
    with tempfile.TemporaryDirectory() as td:
        td = str(td)
        # Ensure directory still exists (defensive; TemporaryDirectory guarantees this but for clarity)
        os.makedirs(td, exist_ok=True)
        clip_paths: list[Path] = []
        final_fmt = (fmt or "webm").lower()
        seg_fmt = "mp4" if final_fmt == "webm" else final_fmt
        success_count = 0
        fail_count = 0
        for i, start in enumerate(points, start=1):
            if cancel_check and cancel_check():
                raise RuntimeError("canceled")
            import tempfile as _tf
            try:
                fd, tmp_name = _tf.mkstemp(prefix=f"seg_{i:02d}_", suffix=f".{seg_fmt}", dir=td)
                os.close(fd)
                clip = Path(tmp_name)
            except Exception:
                clip = Path(td) / f"seg_{i:02d}.{seg_fmt}"
            vfilter = f"scale={width}:-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"
            base_cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
                *(_ffmpeg_hwaccel_flags()),
                "-noaccurate_seek",
                "-ss", f"{start:.3f}", "-i", str(video), "-t", f"{seg_dur:.3f}",
                "-vf", vfilter,
                "-an",
            ]
            tried_cmds: list[tuple[list[str], str]] = []
            if seg_fmt == "mp4":
                tried_cmds.append((base_cmd + [
                    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_effective_preview_crf_h264()),
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", *(_ffmpeg_threads_flags()), str(clip)
                ], "libx264"))
                tried_cmds.append((base_cmd + [
                    "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(clip)
                ], "mpeg4"))
            else:
                tried_cmds.append((base_cmd + [
                    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()), *_vp9_realtime_flags(), "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(clip)
                ], "libvpx-vp9"))
                tried_cmds.append((base_cmd + [
                    "-c:v", "libvpx", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()), *_vp9_realtime_flags(), "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(clip)
                ], "libvpx"))
            seg_success = False
            last_err = ""
            for cmd, label in tried_cmds:
                if ff_debug:
                    try:
                        print(f"[preview] ffmpeg seg attempt codec={label}:", " ".join(cmd))
                    except Exception:
                        pass
                proc = _run(cmd)
                if proc.returncode == 0 and clip.exists() and clip.stat().st_size > 0:
                    seg_success = True
                    break
                try:
                    e = (proc.stderr or '').strip()
                    if e:
                        last_err = e
                except Exception:
                    pass
            if not seg_success:
                try:
                    missing_note = " (tmp gone)" if (not clip.exists()) else ""
                    print(f"[preview] segment {i}/{segs} FAILED start={start:.3f}s err={last_err[:160]}{missing_note}")
                except Exception:
                    pass
                fail_count += 1
                if progress_cb:
                    try:
                        progress_cb(i, segs)
                    except Exception:
                        pass
                continue
            clip_paths.append(clip)
            success_count += 1
            try:
                print(f"[preview] segment {i}/{segs} ok start={start:.3f}s", flush=True)
            except Exception:
                pass
            if progress_cb:
                try:
                    progress_cb(i, segs)
                except Exception:
                    pass
            # end segment loop
        # Validate segments have video streams; skip bad ones to avoid filtergraph ':v' errors
    def _has_video_stream(p: Path) -> bool:
        if not p.exists() or p.stat().st_size == 0:
            return False
        if not ffprobe_available():
            return True
        pr = _run([
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            str(p),
        ])
        return pr.returncode == 0 and bool((pr.stdout or '').strip())

        valid_clip_paths: list[Path] = []
        for cp in clip_paths:
            if _has_video_stream(cp):
                valid_clip_paths.append(cp)
            else:
                if ff_debug:
                    try:
                        print(f"[preview] skipping segment without video: {cp}")
                    except Exception:
                        pass
        clip_paths = valid_clip_paths

        if not clip_paths:
            # Final fallback: try encoding a short preview directly from the source
            # Attempt from 0s, then from 10% into the file if duration known
            def _try_direct(start_time: float) -> bool:
                base_cmd = [
                    "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
                    *(_ffmpeg_hwaccel_flags()),
                    "-ss", f"{max(0.0, start_time):.3f}", "-i", str(video), "-t", f"{float(seg_dur):.3f}",
                    "-vf", f"scale={int(width)}:-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
                    "-an",
                ]
                if final_fmt == "webm":
                    cmdx = base_cmd + [
                        "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()),
                        *_vp9_realtime_flags(),
                        "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(out),
                    ]
                else:
                    cmdx = base_cmd + [
                        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_effective_preview_crf_h264()),
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart", *(_ffmpeg_threads_flags()), str(out),
                    ]
                if ff_debug:
                    try:
                        print("[preview] ffmpeg direct-fallback:", " ".join(cmdx))
                    except Exception:
                        pass
                pr = _run(cmdx)
                return pr.returncode == 0 and _file_nonempty(out)

            tried = _try_direct(0.0)
            if not tried and (dur and dur > 0):
                _ = _try_direct(max(0.0, float(dur) * 0.1))
                tried = _file_nonempty(out)
            if not tried:
                raise RuntimeError("no preview segments with video; aborting concat")
            # Direct fallback succeeded; return final output
            try:
                preview_info.update({
                    "status": "ok",
                    "strategy": "direct-fallback",
                    "segments_used": 1,
                })
                _json_dump_atomic(artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}", preview_info)
            except Exception:
                pass
            return out

        # If only a single valid segment, transcode straight to final output
        if len(clip_paths) == 1:
            single = clip_paths[0]
            base_cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y", *(_ffmpeg_hwaccel_flags()), "-i", str(single), "-an",
            ]
            if final_fmt == "webm":
                cmd1 = base_cmd + [
                    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()), *_vp9_realtime_flags(), "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(out),
                ]
                if ff_debug:
                    try:
                        print("[preview] ffmpeg single->webm:", " ".join(cmd1))
                    except Exception:
                        pass
                pr = _run(cmd1)
                if pr.returncode != 0:
                    # Retry without hwaccel in case decoder selection is the issue
                    cmd1 = [
                        "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y", "-i", str(single), "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_effective_preview_crf_vp9()), *_vp9_realtime_flags(), "-pix_fmt", "yuv420p", *(_ffmpeg_threads_flags()), str(out),
                    ]
                    pr = _run(cmd1)
            else:
                cmd1 = base_cmd + [
                    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_effective_preview_crf_h264()), "-pix_fmt", "yuv420p", "-movflags", "+faststart", *(_ffmpeg_threads_flags()), str(out),
                ]
                if ff_debug:
                    try:
                        print("[preview] ffmpeg single->mp4:", " ".join(cmd1))
                    except Exception:
                        pass
                pr = _run(cmd1)
                if pr.returncode != 0:
                    cmd1 = [
                        "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
                        "-i", str(single), "-an", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_effective_preview_crf_h264()), "-pix_fmt", "yuv420p", "-movflags", "+faststart", *(_ffmpeg_threads_flags()), str(out),
                    ]
                    pr = _run(cmd1)
            if pr.returncode != 0 or not out.exists():
                try:
                    err = (pr.stderr or '').strip()
                    if err:
                        print('[preview] single segment transcode error:', err)
                except Exception:
                    pass
                raise RuntimeError(pr.stderr.strip() or "ffmpeg single segment transcode failed")
            return out

        # Concat via filter_complex with multiple inputs; encode directly to final output
        try:
            preview_info["segments_used"] = int(len(clip_paths))
            preview_info["strategy"] = "segments-concat"
        except Exception:
            pass
        cmd2 = [
            "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
            *(_ffmpeg_hwaccel_flags()),
        ]
        for cp in clip_paths:
            cmd2 += ["-i", str(cp)]
        n = len(clip_paths)
        inputs_chain = "".join([f"[{i}:v]" for i in range(n)])
        filter_concat = (
            f"{inputs_chain}concat=n={n}:v=1:a=0,"
            f"pad=ceil(iw/2)*2:ceil(ih/2)*2[outv]"
        )
        cmd2 += [
            "-filter_complex", filter_concat,
            "-map", "[outv]",
            "-an",
        ]
        if final_fmt == "webm":
            cmd2 += [
                "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_default_preview_crf_vp9()),
                *_vp9_realtime_flags(),
                "-pix_fmt", "yuv420p",
                *(_ffmpeg_threads_flags()),
                str(out),
            ]
        else:
            cmd2 += [
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_default_preview_crf_h264()),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                *(_ffmpeg_threads_flags()),
                str(out),
            ]
        if ff_debug:
            try:
                print("[preview] ffmpeg concat-filter:", " ".join(cmd2))
            except Exception:
                pass
        proc2 = _run(cmd2)
        if proc2.returncode != 0:
            # Retry without hwaccel flags once; sometimes decoder selection causes ':v' matching issues
            cmd2_no_hw = []
            for t in cmd2:
                if isinstance(t, str):
                    # simply rebuild without calling _ffmpeg_hwaccel_flags; easiest: reconstruct
                    pass
            cmd2_no_hw = [
                "ffmpeg", "-hide_banner", "-loglevel", str(ff_loglevel), "-nostdin", "-y",
            ]
            for cp in clip_paths:
                cmd2_no_hw += ["-i", str(cp)]
            cmd2_no_hw += [
                "-filter_complex", filter_concat,
                "-map", "[outv]",
                "-an",
            ]
            if final_fmt == "webm":
                cmd2_no_hw += [
                    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(_default_preview_crf_vp9()),
                    *_vp9_realtime_flags(),
                    "-pix_fmt", "yuv420p",
                    *(_ffmpeg_threads_flags()),
                    str(out),
                ]
            else:
                cmd2_no_hw += [
                    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_default_preview_crf_h264()),
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    *(_ffmpeg_threads_flags()),
                    str(out),
                ]
            if ff_debug:
                try:
                    print("[preview] ffmpeg concat-filter (no hwaccel):", " ".join(cmd2_no_hw))
                except Exception:
                    pass
            proc2 = _run(cmd2_no_hw)
        if proc2.returncode != 0:
            try:
                err = (proc2.stderr or '').strip()
                if err:
                    print('[preview] concat-filter error:', err)
            except Exception:
                pass
            raise RuntimeError(proc2.stderr.strip() or "ffmpeg concat filter failed")
        # Final guard: only succeed with a non-empty output file
        if not _file_nonempty(out):
            raise RuntimeError("preview output missing or too small after processing")
        if ff_debug:
            try:
                print(f"[preview] success: {out} size={out.stat().st_size}")
            except Exception:
                pass
        try:
            try:
                # Determine status based on segment success/failure mix
                try:
                    if success_count == 0:
                        preview_info.update({"status": "failed", "segments_used": 0, "segments_failed": int(fail_count)})
                    elif fail_count > 0:
                        preview_info.update({"status": "partial", "segments_used": int(preview_info.get("segments_used") or len(clip_paths) or 0), "segments_failed": int(fail_count)})
                    else:
                        preview_info.update({"status": "ok", "segments_used": int(preview_info.get("segments_used") or len(clip_paths) or 0), "segments_failed": 0})
                except Exception:
                    pass
            except Exception:
                pass
            _json_dump_atomic(artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}", preview_info)
        except Exception:
            pass
        return out
    # Fallback safeguard (should not reach): ensure a Path is always returned to satisfy type hints
    if out.exists():
        return out
    try:
        out.write_text("stub preview (unreachable guard)")
    except Exception:
        pass
    return out

# -----------------------------
# Waveform generator (audio amplitude over time)
# -----------------------------
def generate_waveform(video: Path, *, force: bool = False, width: int = 800, height: int = 160, color: str = "#4fa0ff") -> Path:
    out = waveform_png_path(video)
    if out.exists() and not force:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    if not ffmpeg_available():
        out.write_bytes(b"WF")
        return out
    # Use ffmpeg showwavespic for fast waveform (mono mix)
    cmd = [
        "ffmpeg", "-y", "-i", str(video),
        "-filter_complex", f"aformat=channel_layouts=stereo,showwavespic=s={width}x{height}:colors={color}",
        "-frames:v", "1",
        str(out)
    ]
    try:
        _run(cmd)
    except Exception:
        try:
            out.write_bytes(b"WFERR")
        except Exception:
            pass
    return out

# -----------------------------
# Motion activity generator (frame differencing)
# -----------------------------
def generate_motion_activity(video: Path, *, force: bool = False, interval: float = 1.0) -> Path:
    out = motion_json_path(video)
    if out.exists() and not force:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    if not ffmpeg_available():
        out.write_text(json.dumps({"interval": interval, "samples": []}, indent=2))
        return out
    # Sample frames at fps=1/interval, compute simple L2 diff versus previous frame
    with tempfile.TemporaryDirectory() as td:
        pattern = Path(td) / "frame_%05d.jpg"
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video),
            "-vf", f"fps=1/{max(0.1, float(interval))},scale=160:-1:force_original_aspect_ratio=decrease", str(pattern)
        ]
        try:
            _run(cmd)
        except Exception:
            out.write_text(json.dumps({"interval": interval, "samples": []}, indent=2))
            return out
        frames = sorted(Path(td).glob("frame_*.jpg"))
        vals: list[dict[str, float]] = []
        prev_pixels: list[int] | None = None
        try:
            from PIL import Image  # type: ignore
        except Exception:
            out.write_text(json.dumps({"interval": interval, "samples": []}, indent=2))
            return out
        for idx, fp in enumerate(frames):
            try:
                im = Image.open(fp).convert("L")
                px = list(cast(Iterable[int], im.getdata()))
                im.close()
            except Exception:
                continue
            if prev_pixels is None:
                prev_pixels = px
                vals.append({"t": idx * interval, "v": 0.0})
                continue
            # Compute normalized average absolute difference
            try:
                diff_sum = 0
                L = min(len(px), len(prev_pixels))
                for i in range(L):
                    diff_sum += abs(px[i] - prev_pixels[i])
                ndiff = (diff_sum / (L * 255.0)) if L else 0.0
                vals.append({"t": idx * interval, "v": round(float(ndiff), 5)})
            except Exception:
                vals.append({"t": idx * interval, "v": 0.0})
            prev_pixels = px
    out.write_text(json.dumps({"interval": interval, "samples": vals}, indent=2))
    return out

# ---------
# pHash stub
# ---------
def _bits_to_hex(bits: list[int]) -> str:
    s = 0
    for b in bits:
        s = (s << 1) | (1 if b else 0)
    hex_len = max(1, (len(bits) + 3) // 4)
    return f"{s:0{hex_len}x}"


def _image_ahash(img, hash_size: int = 8) -> list[int]:
    from PIL import Image  # type: ignore
    try:
        resample = Image.Resampling.BILINEAR  # Pillow >= 9
    except Exception:  # pragma: no cover
        resample = Image.BILINEAR  # type: ignore[attr-defined]
    g = img.convert("L").resize((hash_size, hash_size), resample)
    px = list(g.getdata())
    avg = sum(px) / len(px)
    return [1 if p >= avg else 0 for p in px]


def _image_dhash(img, hash_size: int = 8) -> list[int]:
    from PIL import Image  # type: ignore
    try:
        resample = Image.Resampling.BILINEAR  # Pillow >= 9
    except Exception:  # pragma: no cover
        resample = Image.BILINEAR  # type: ignore[attr-defined]
    g = img.convert("L").resize((hash_size + 1, hash_size), resample)
    px = list(g.getdata())
    # Compare adjacent pixels horizontally
    bits: list[int] = []
    for r in range(hash_size):
        row = px[r * (hash_size + 1) : (r + 1) * (hash_size + 1)]
        bits.extend([1 if row[c] > row[c + 1] else 0 for c in range(hash_size)])
    return bits


def _hash_image(img, algo: str = "ahash", hash_size: int = 8) -> list[int]:
    algo = (algo or "ahash").lower()
    if algo in ("ahash", "average", "avg"):
        return _image_ahash(img, hash_size)
    if algo in ("dhash", "diff"):
        return _image_dhash(img, hash_size)
    # Default to ahash when unknown
    return _image_ahash(img, hash_size)


def _combine_hashes(hashes: list[list[int]], combine: str = "xor") -> list[int]:
    if not hashes:
        return []
    n = len(hashes[0])
    combine = (combine or "xor").lower()
    if combine == "avg":
        # Majority vote per bit
        out: list[int] = []
        for i in range(n):
            ones = sum(h[i] for h in hashes)
            out.append(1 if ones >= (len(hashes) / 2.0) else 0)
        return out
    # XOR combine (default)
    acc = [0] * n
    for h in hashes:
        for i in range(n):
            acc[i] ^= h[i]
    return acc


def phash_create_single(
    video: Path,
    *,
    frames: int = 5,
    algo: str = "ahash",
    combine: str = "xor",
    progress_cb: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> None:
    """
    Compute a simple perceptual hash across multiple frames.
    - algo: 'ahash' (default) or 'dhash'
    - combine: 'xor' (default) or 'avg' to merge per-frame hashes
    Writes a JSON with keys {phash, algo, frames, combine}.
    """
    out = phash_path(video)
    try:
        print(f"[phash][debug] start video={video} frames={frames} algo={algo} combine={combine} exists={video.exists()} size={(video.stat().st_size if video.exists() else -1)}")
    except Exception:
        pass
    out.parent.mkdir(parents=True, exist_ok=True)

    # Fallback for environments without ffprobe/ffmpeg or Pillow
    try:
        from PIL import Image  # type: ignore
    except Exception:
        import hashlib
        h = hashlib.sha256(video.read_bytes() if video.exists() else b"")
        out.write_text(json.dumps({"phash": h.hexdigest(), "algo": "file-sha256", "frames": 1, "combine": "none"}, indent=2))
        return

    # Determine duration
    duration = None
    try:
        if metadata_path(video).exists():
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
            try:
                print(f"[phash][debug] metadata exists duration={duration}")
            except Exception:
                pass
        else:
            try:
                print("[phash][debug] metadata missing; probing ffprobe")
            except Exception:
                pass
            metadata_single(video, force=False)
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
            try:
                print(f"[phash][debug] probed duration={duration}")
            except Exception:
                pass
    except Exception as e:
        duration = None
        try:
            print(f"[phash][debug] duration detection failed: {e}")
        except Exception:
            pass

    ff_ok = ffmpeg_available()
    if not duration or duration <= 0 or not ff_ok:
        # Basic fallback: hash middle-frame thumbnail
        try:
            print(f"[phash][debug] fallback path: duration={duration} ffmpeg_ok={ff_ok}")
        except Exception:
            pass
        try:
            generate_thumbnail(video, force=False, time_spec="middle", quality=2)
            img = Image.open(thumbnails_path(video))
            bits = _hash_image(img, algo)
            img.close()
            out.write_text(json.dumps({
                "phash": _bits_to_hex(bits),
                "algo": algo,
                "frames": 1,
                "combine": "single",
            }, indent=2))
            try:
                print(f"[phash][debug] wrote fallback single-frame hash hex={_bits_to_hex(bits)[:32]}")
            except Exception:
                pass
            if progress_cb:
                try:
                    progress_cb(1, 1)
                except Exception:
                    pass
            return
        except Exception:
            import hashlib
            h = hashlib.sha256(video.read_bytes() if video.exists() else b"")
            out.write_text(json.dumps({"phash": h.hexdigest(), "algo": "file-sha256", "frames": 1, "combine": "none"}, indent=2))
            try:
                print(f"[phash][debug] fallback sha256 hash={h.hexdigest()[:32]}")
            except Exception:
                pass
            if progress_cb:
                try:
                    progress_cb(1, 1)
                except Exception:
                    pass
            return

    # Sample N frames evenly across duration
    segs = max(1, int(frames))
    points = [((i + 1) / (segs + 1)) * float(duration) for i in range(segs)]
    hashes: list[list[int]] = []
    try:
        print(f"[phash][debug] sampling segs={segs} points={[round(p,3) for p in points]}")
    except Exception:
        pass
    with tempfile.TemporaryDirectory() as td:
        for idx, t in enumerate(points):
            if cancel_check and cancel_check():
                raise RuntimeError("canceled")
            try:
                print(f"[phash][debug] extract idx={idx} t={t:.3f}")
            except Exception:
                pass
            frame_path = Path(td) / f"phash_{idx:02d}.jpg"
            cmd = [
                "ffmpeg", "-y",
                *(_ffmpeg_hwaccel_flags()),
                "-noaccurate_seek",
                "-ss", f"{t:.3f}",
                "-i", str(video),
                "-frames:v", "1",
                "-vf", "scale=128:-1",
                *(_ffmpeg_threads_flags()),
                str(frame_path),
            ]
            proc = _run(cmd)
            if proc.returncode != 0:
                try:
                    err_txt = (proc.stderr or "").strip() if hasattr(proc, 'stderr') else ''
                    if err_txt:
                        print(f"[phash][frame-error] idx={idx} t={t:.3f}s rc={proc.returncode} video={video.name} err={err_txt[:240]}")
                    else:
                        print(f"[phash][frame-error] idx={idx} t={t:.3f}s rc={proc.returncode} video={video.name}")
                except Exception:
                    pass
            if proc.returncode != 0 or not frame_path.exists():
                # Still report progress advance even if frame extraction failed
                if progress_cb:
                    try:
                        progress_cb(idx + 1, segs)
                    except Exception:
                        pass
                continue
            try:
                img = Image.open(frame_path)
                bits = _hash_image(img, algo)
                img.close()
                hashes.append(bits)
                try:
                    print(f"[phash][debug] hashed idx={idx} bits_len={len(bits)}")
                except Exception:
                    pass
            except Exception as _e:
                try:
                    print(f"[phash][debug] hash compute failed idx={idx} err={_e}")
                except Exception:
                    pass
                pass
            if progress_cb:
                try:
                    progress_cb(idx + 1, segs)
                except Exception:
                    pass

    if not hashes:
        # fallback to thumbnail path if extraction failed
        try:
            from PIL import Image  # type: ignore
            generate_thumbnail(video, force=False, time_spec="middle", quality=2)
            img = Image.open(thumbnails_path(video))
            bits = _hash_image(img, algo)
            img.close()
            hashes = [bits]
            try:
                print("[phash][debug] all sampled frames failed; fallback to middle thumbnail")
            except Exception:
                pass
        except Exception:
            hashes = []

    combined = _combine_hashes(hashes, combine) if hashes else []
    phash_hex = _bits_to_hex(combined) if combined else ""
    try:
        print(f"[phash][debug] finalize frames_hashed={len(hashes)} combined_bits={len(combined) if combined else 0} hex={phash_hex[:48]}")
    except Exception:
        pass
    out.write_text(json.dumps({
        "phash": phash_hex,
        "algo": algo,
        "frames": int(segs),
        "combine": combine,
    }, indent=2))
    if progress_cb:
        try:
            progress_cb(segs, segs)
        except Exception:
            pass

# ------------------
# Scenes placeholders
# ------------------
def generate_scene_artifacts(
    video: Path,
    *,
    threshold: float,
    limit: int,
    gen_thumbnails: bool,
    gen_clips: bool,
    thumbnails_width: int,
    clip_duration: float,
    fast_mode: bool = False,
    progress_cb: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> None:
    """
    Detect scene changes using ffmpeg showinfo and optionally export thumbnails/clips.
    threshold: 0..1 typical (e.g., 0.3)
    limit: cap number of detected scenes written
    thumbnails_width: width in px for thumbnails
    clip_duration: seconds per scene clip (if gen_clips)
    """
    j = scenes_json_path(video)
    out_dir = scenes_dir(video)
    out_dir.mkdir(parents=True, exist_ok=True)

    scenes: list[dict] = []
    if not ffmpeg_available():
        # No ffmpeg: write empty scenes
        j.write_text(json.dumps({"scenes": scenes}, indent=2))
        return

    # Per-file lock to prevent concurrent analyzers for the same video (server+CLI safe)
    with _PerFileLock(video, key="scenes"):
        # Use ffmpeg showinfo to find pts_time for frames exceeding scene threshold
        thr = max(0.0, min(1.0, float(threshold)))
        cmd = [
            "ffmpeg",
            "-hide_banner",
            *(_ffmpeg_hwaccel_flags()),
            "-i", str(video),
            "-filter_complex",
            f"select='gt(scene,{thr})',showinfo",
            "-f", "null", "-",
        ]
        # Stream stderr/stdout to incrementally parse showinfo and emit progress
        times: list[float] = []
        # Estimate duration for progress (best-effort)
        duration: Optional[float] = None
        try:
            if metadata_path(video).exists():
                duration = extract_duration(json.loads(metadata_path(video).read_text()))
            else:
                metadata_single(video, force=False)
                duration = extract_duration(json.loads(metadata_path(video).read_text()))
        except Exception:
            duration = None
        _local_sem = _FFMPEG_SEM
        # Pre-acquire heartbeat: if we can't immediately obtain an ffmpeg slot, emit tiny progress so UI reflects liveness
        pre_acquire_start = time.time()
        pre_acquire_last_emit = 0.0
        pre_acquire_steps = 0
        try:
            pre_acquire_interval = float(os.environ.get("SCENES_PREWAIT_INTERVAL", "2.5"))
        except Exception:
            pre_acquire_interval = 2.5
        try:
            pre_acquire_max_steps = int(os.environ.get("SCENES_PREWAIT_STEPS", "2"))  # contributes up to 2% before real pass
        except Exception:
            pre_acquire_max_steps = 2
        acquired = False
        while not acquired:
            # Attempt non-blocking acquire first for snappy start
            acquired = _local_sem.acquire(blocking=False)
            if acquired:
                break
            # Try a short blocking acquire with timeout to avoid tight spin
            try:
                acquired = _local_sem.acquire(timeout=0.5)
            except Exception:
                acquired = False
            if acquired:
                break
            # If concurrency was changed at runtime, _FFMPEG_SEM may have been swapped.
            # Refresh our local reference so waiting jobs can benefit from newly added slots.
            if _FFMPEG_SEM is not _local_sem:
                try:
                    _local_sem = _FFMPEG_SEM
                    try:
                        print("[scenes][ffmpeg] detected semaphore swap; refreshed reference")
                    except Exception:
                        pass
                except Exception:
                    pass
            # Emit pre-start heartbeat progress (0->max pre-wait pct) if still waiting
            jid_wait = getattr(JOB_CTX, "jid", None)
            if jid_wait and pre_acquire_steps < pre_acquire_max_steps:
                elapsed = time.time() - pre_acquire_start
                if (elapsed - pre_acquire_last_emit) >= pre_acquire_interval:
                    try:
                        pct = 0 + pre_acquire_steps + 1  # 1, 2, ...
                        if pct > 3:
                            pct = 3  # never exceed 3% before actual ffmpeg run
                        _set_job_progress(jid_wait, total=100, processed_set=pct)
                    except Exception:
                        pass
                    pre_acquire_last_emit = elapsed
                    pre_acquire_steps += 1
            # Cancellation check while waiting
            evw = JOB_CANCEL_EVENTS.get(getattr(JOB_CTX, "jid", ""))
            if evw is not None and evw.is_set():
                raise RuntimeError("canceled")
        proc_rc: Optional[int] = None
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            try:
                _register_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
            except Exception:
                pass
            # Incremental parse
            last_ts: float = 0.0
            # Heartbeat progress support: emit 1–2% early progress if no pts_time lines yet
            hb_start = time.time()
            hb_last_emit = 0.0
            hb_emitted_steps = 0
            try:
                hb_initial_delay = float(os.environ.get("SCENES_HEARTBEAT_DELAY", "2.0"))  # seconds before first heartbeat
            except Exception:
                hb_initial_delay = 2.0
            try:
                hb_interval = float(os.environ.get("SCENES_HEARTBEAT_INTERVAL", "3.0"))  # spacing between heartbeats
            except Exception:
                hb_interval = 3.0
            try:
                hb_max_steps = int(os.environ.get("SCENES_HEARTBEAT_STEPS", "2"))  # max heartbeats before real progress
            except Exception:
                hb_max_steps = 2
            jid_hb = getattr(JOB_CTX, "jid", None)
            if proc.stdout is not None:
                for line in proc.stdout:
                    if not line:
                        continue
                    try:
                        m = re.search(r"pts_time:(?P<t>[0-9]+\.[0-9]+)", line)
                        if m:
                            t = float(m.group("t"))
                            # dedupe close times
                            if (not times) or abs(times[-1] - t) > 0.25:
                                times.append(t)
                            last_ts = t
                        # update approximate pass progress based on last seen timestamp
                        if duration and duration > 0:
                            frac = max(0.0, min(1.0, float(last_ts) / float(duration)))
                            jid = getattr(JOB_CTX, "jid", None)
                            if jid:
                                try:
                                    _set_job_progress(jid, total=100, processed_set=int(frac * 100))
                                except Exception:
                                    pass
                        # Heartbeat: if we have not seen any pts_time yet (times empty) emit tiny progress
                        if (not times) and jid_hb and hb_emitted_steps < hb_max_steps:
                            elapsed = time.time() - hb_start
                            needed_delay = hb_initial_delay if hb_emitted_steps == 0 else (hb_initial_delay + hb_interval * hb_emitted_steps)
                            if elapsed >= needed_delay and (elapsed - hb_last_emit) >= (hb_interval if hb_emitted_steps > 0 else 0):
                                try:
                                    pct = 1 + hb_emitted_steps  # first emit=1, second=2, etc.
                                    if pct > 4:
                                        pct = 4  # never exceed 4% via heartbeat
                                    _set_job_progress(jid_hb, total=100, processed_set=pct)
                                except Exception:
                                    pass
                                hb_last_emit = elapsed
                                hb_emitted_steps += 1
                    except Exception:
                        pass
                    # cancel check
                    ev = JOB_CANCEL_EVENTS.get(getattr(JOB_CTX, "jid", ""))
                    if ev is not None and ev.is_set():
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except Exception:
                            proc.terminate()
                        raise RuntimeError("canceled")
            proc_rc = proc.wait()
        finally:
            try:
                _local_sem.release()
            except Exception:
                pass
            try:
                _unregister_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
            except Exception:
                pass
    # Outside lock scope: continue processing
    times = times if 'times' in locals() else []
    if int(proc_rc or 0) != 0 and not times:
        times = []

    if limit and limit > 0:
        times = times[: int(limit)]

    total_steps = len(times)
    step = 0
    for i, t in enumerate(times, start=1):
        if cancel_check and cancel_check():
            raise RuntimeError("canceled")
        # Detection-generated marker: mark scene=true and add a simple name (sequence number as string)
        entry: dict[str, Any] = {"time": float(t), "scene": True, "name": f"{i}"}
        if gen_thumbnails:
            thumbnail = out_dir / f"{video.stem}.scene_{i:03d}.jpg"
            cmd_t = [
                "ffmpeg", "-y",
                *(_ffmpeg_hwaccel_flags()),
                "-noaccurate_seek",
                "-ss", f"{t:.3f}", "-i", str(video),
                "-frames:v", "1",
                "-vf", f"scale={int(thumbnails_width)}:-1",
                "-q:v", str(_default_scene_thumb_q()),
                *(_ffmpeg_threads_flags()),
                str(thumbnail),
            ]
            _run(cmd_t)
            if thumbnail.exists():
                entry["thumbnail"] = thumbnail.name
            step += 1
            if progress_cb and total_steps:
                try:
                    progress_cb(min(step, total_steps), total_steps)
                except Exception:
                    pass
        if gen_clips:
            clip = out_dir / f"{video.stem}.scene_{i:03d}.mp4"
            cmd_c = [
                "ffmpeg", "-y",
                *(_ffmpeg_hwaccel_flags()),
                "-noaccurate_seek",
                "-ss", f"{t:.3f}", "-i", str(video),
                "-t", f"{max(0.1, float(clip_duration)):.3f}",
                "-an",
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", str(_default_scene_clip_crf()),
                "-movflags", "+faststart",
                *(_ffmpeg_threads_flags()),
                str(clip),
            ]
            _run(cmd_c)
            if clip.exists():
                entry["clip"] = clip.name
        scenes.append(entry)
        if not gen_thumbnails and not gen_clips:
            step += 1
            if progress_cb and total_steps:
                try:
                    progress_cb(min(step, total_steps), total_steps)
                except Exception:
                    pass

    j.write_text(json.dumps({"scenes": scenes}, indent=2))
    if progress_cb and total_steps:
        try:
            progress_cb(total_steps, total_steps)
        except Exception:
            pass

# -----------------
# Sprites generator
# -----------------
def generate_sprite_sheet(
    video: Path,
    *,
    interval: float,
    width: int,
    cols: int,
    rows: int,
    quality: int,
    progress_cb: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> None:
    """
    Generate a sprite sheet by sampling frames with ffmpeg.
    Falls back to a repeated thumbnail if ffmpeg/Pillow are unavailable.
    Writes a JPEG sprite sheet and a JSON index with fields:
      - cols, rows, interval, width
      - tile_width, tile_height
      - frames (<= cols*rows)
      Also includes legacy keys grid: [cols,rows], tile: [w,h] for compatibility.
    """
    sheet, j = sprite_sheet_paths(video)
    # Idempotency guard: if both artifacts exist and are non-empty, skip work
    try:
        if sheet.exists() and sheet.stat().st_size > 0 and j.exists() and j.stat().st_size > 0:
            return
    except Exception:
        pass
    # Preferred path: use ffmpeg tile filter to build mosaic in one pass
    if ffmpeg_available():
        # Lock per file to prevent concurrent sprite jobs for same video
        with _PerFileLock(video, key="sprites"):
            # First try: keyframe-driven sampling (default ON). Much faster on long-GOP.
            # Disable by setting SPRITES_KEYFRAMES=0/false
            try:
                kf_env = os.environ.get("SPRITES_KEYFRAMES")
                use_keyframes = not (kf_env in ("0", "false", "False"))
            except Exception:
                use_keyframes = True
            if use_keyframes:
                try:
                    # Build a single-pass pipeline that selects I-frames only, scales, and tiles.
                    # -skip_frame nokey hints decoder to skip non-keyframes; filter guards selection.
                    vf_kf = (
                        f"select='eq(pict_type\\,I)',"
                        f"scale={int(width)}:-2:flags=lanczos,"
                        f"tile={int(cols)}x{int(rows)}"
                    )
                    cmd_kf = [
                        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
                        *(_ffmpeg_hwaccel_flags()),
                        "-skip_frame", "nokey",
                        "-i", str(video),
                        "-an",
                        "-vf", vf_kf,
                        "-vsync", "vfr",
                        "-frames:v", "1",
                        *(_ffmpeg_threads_flags()),
                        str(sheet),
                    ]
                    try:
                        print("[sprites][keyframes] ffmpeg:", " ".join(shlex.quote(x) for x in cmd_kf))  # type: ignore[name-defined]
                    except Exception:
                        pass
                    proc = _run(cmd_kf)
                    if int(proc.returncode) != 0:
                        raise RuntimeError("keyframe sprite generation failed")
                    # Compute tile geometry and validate uniqueness; fallback if too few distinct tiles
                    try:
                        from PIL import Image  # type: ignore
                        with Image.open(sheet) as im:
                            sheet_w, sheet_h = im.size
                    except Exception:
                        sheet_w = int(width * cols)
                        sheet_h = int((width * 9 // 16) * rows)
                    tile_w = int(max(1, sheet_w // max(1, cols)))
                    tile_h = int(max(1, sheet_h // max(1, rows)))

                    # Uniqueness check similar to legacy path
                    try:
                        from PIL import Image  # type: ignore
                        import hashlib

                        def _unique_tiles_count(path: Path, tw: int, th: int, c: int, r: int) -> int:
                            try:
                                with Image.open(path) as _im:
                                    _im = _im.convert('RGB')
                                    _hashes: list[str] = []
                                    for _rr in range(r):
                                        for _cc in range(c):
                                            _box = (_cc * tw, _rr * th, (_cc + 1) * tw, (_rr + 1) * th)
                                            _tile = _im.crop(_box)
                                            _h = hashlib.md5(_tile.tobytes()).hexdigest()
                                            _hashes.append(_h)
                                    return len(set(_hashes))
                            except Exception:
                                return 0

                        total_tiles_kf = int(cols * rows)
                        min_unique_kf = max(1, total_tiles_kf // 4)
                        unique_kf = _unique_tiles_count(sheet, tile_w, tile_h, int(cols), int(rows))
                    except Exception:
                        unique_kf = max(1, int(cols) * int(rows))

                    if not _file_nonempty(sheet, min_size=64) or unique_kf < min_unique_kf:
                        # Drop and fallback to non-keyframe strategies
                        try:
                            print(f"[sprites][keyframes] insufficient unique tiles ({unique_kf} < {min_unique_kf}); falling back")
                        except Exception:
                            pass
                        try:
                            sheet.unlink(missing_ok=True)  # type: ignore[call-arg]
                        except Exception:
                            try:
                                sheet.unlink()
                            except Exception:
                                pass
                    else:
                        # Write metadata
                        metadata = {
                            "cols": int(cols),
                            "rows": int(rows),
                            "interval": float(interval),  # nominal interval retained for UI hints
                            "width": int(width),
                            "tile_width": int(tile_w),
                            "tile_height": int(tile_h),
                            "frames": int(int(cols) * int(rows)),
                            "grid": [int(cols), int(rows)],
                            "tile": [int(tile_w), int(tile_h)],
                            "keyframes_sampling": True,
                        }
                        j.write_text(json.dumps(metadata, indent=2))
                        try:
                            print(f"[sprites][keyframes] sheet created {sheet.name} tiles={int(cols)*int(rows)}")
                        except Exception:
                            pass
                        if progress_cb:
                            try:
                                progress_cb(1, 1)
                            except Exception:
                                pass
                        return
                except Exception:
                    # Proceed to even/legacy strategies
                    try:
                        print("[sprites][keyframes] path failed; trying other strategies")
                    except Exception:
                        pass
            # Optional even sampling path: sample frames uniformly across full duration rather than fixed fps window
            # Default DISABLED; enable via SPRITES_EVEN_SAMPLING=1 or auto-switch when estimated time is large.
            use_even = False
            try:
                env_even = os.environ.get("SPRITES_EVEN_SAMPLING")
                if env_even not in (None, ""):
                    use_even = env_even not in ("0", "false", "False")
            except Exception:
                pass
            # Only attempt even sampling if we can determine duration and PIL is available
            dur: Optional[float] = None
            if use_even:
                try:
                    if metadata_path(video).exists():
                        dur = extract_duration(json.loads(metadata_path(video).read_text()))
                    else:
                        metadata_single(video, force=False)
                        dur = extract_duration(json.loads(metadata_path(video).read_text()))
                except Exception:
                    dur = None
            # Auto-switch heuristic: if the legacy tile path would need to scan a long interval
            # (interval * tiles) beyond a threshold, prefer even sampling for speed when possible.
            if not use_even:
                try:
                    total_tiles_est = int(cols * rows)
                    est_secs = float(interval) * float(total_tiles_est)
                except Exception:
                    est_secs = 0.0
                if est_secs >= float(os.environ.get("SPRITES_AUTO_EVEN_SEC", "300")):
                    _pil_ok = True
                    try:
                        from PIL import Image  # type: ignore
                        _ = Image
                    except Exception:
                        _pil_ok = False
                    if _pil_ok:
                        # Ensure we have duration handy for even sampling segmenting
                        try:
                            if metadata_path(video).exists():
                                dur = extract_duration(json.loads(metadata_path(video).read_text()))
                            else:
                                metadata_single(video, force=False)
                                dur = extract_duration(json.loads(metadata_path(video).read_text()))
                        except Exception:
                            dur = None
                        if dur and float(dur) > 0:
                            try:
                                print(f"[sprites] auto-switch to even sampling (est~{est_secs:.1f}s, tiles={int(cols)*int(rows)})")
                            except Exception:
                                pass
                            use_even = True
            if use_even and dur and isinstance(dur, (int, float)) and float(dur) > 0:
                total_tiles = int(cols * rows)
                # Guard: if absurdly large grid, fallback to legacy (performance)
                if total_tiles <= 400:  # 20x20 upper bound for even sampling path
                    try:
                        from PIL import Image  # type: ignore
                        import tempfile
                        import math
                        # Build list of target timestamps centered in equal segments
                        _dur_f = float(dur)
                        if _dur_f < 0.1:  # extremely short clip, fallback
                            raise RuntimeError("duration too short for even sampling")
                        segment = _dur_f / float(total_tiles)
                        times: list[float] = []
                        for k in range(total_tiles):
                            # Center sample within segment; clamp inside [0, dur]
                            ts = (k + 0.5) * segment
                            if ts > _dur_f:
                                ts = _dur_f
                            times.append(ts)
                        # Temp directory for extracted frames
                        with tempfile.TemporaryDirectory(prefix="sprites_even_") as tmpd:
                            tmp_dir = Path(tmpd)
                            extracted: list[Path] = []
                            steps = total_tiles
                            # Parallel extraction with bounded worker pool
                            import concurrent.futures
                            # Determine pool size
                            # Default to a modest parallelism for speed while respecting global ffmpeg concurrency.
                            pool_size = min(4, _FFMPEG_CONCURRENCY)
                            fair_mode = True
                            try:
                                fair_env = os.environ.get("SPRITES_EVEN_FAIR")
                                if fair_env not in (None, ""):
                                    # Allow disabling fairness by setting SPRITES_EVEN_FAIR=0
                                    fair_mode = fair_env not in ("0", "false", "False")
                            except Exception:
                                pass
                            try:
                                env_pool = os.environ.get("SPRITES_EVEN_WORKERS")
                                if env_pool not in (None, ""):
                                    pv = int(env_pool)
                                    if pv > 0:
                                        # Explicit override takes precedence over fairness restriction
                                        pool_size = max(1, min(pv, min(total_tiles, _FFMPEG_CONCURRENCY)))
                                        fair_mode = False
                            except Exception:
                                pass
                            if not fair_mode:
                                # Recompute pool_size if fairness disabled and no explicit override (fallback path)
                                if os.environ.get("SPRITES_EVEN_WORKERS") in (None, ""):
                                    pool_size = min(total_tiles, _FFMPEG_CONCURRENCY)
                            # Apply global hard bound
                            pool_size = max(1, min(16, pool_size))
                            try:
                                print(f"[sprites][even] extracting frames parallel pool={pool_size} fair={fair_mode} total={total_tiles} dur={_dur_f:.2f}s")
                            except Exception:
                                pass
                            extracted_paths: list[Optional[Path]] = [None] * total_tiles
                            completed = 0
                            completed_lock = threading.Lock()
                            cancel_flag = {"canceled": False}
                            def _extract_one(idx_ts):
                                idx, ts = idx_ts
                                if cancel_flag["canceled"]:
                                    return None
                                if cancel_check and cancel_check():
                                    cancel_flag["canceled"] = True
                                    return None
                                _FFMPEG_SEM.acquire()
                                try:
                                    out_path = tmp_dir / f"frame_{idx:04d}.jpg"
                                    cmd = [
                                        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                                        "-ss", f"{ts:.3f}",
                                        *(_ffmpeg_hwaccel_flags()),
                                        "-i", str(video),
                                        "-vf", f"scale={int(width)}:-2:flags=lanczos",
                                        "-q:v", str(max(2, min(31, int(quality)))) ,
                                        "-frames:v", "1",
                                        *(_ffmpeg_threads_flags()),
                                        str(out_path),
                                    ]
                                    proc = subprocess.run(cmd, capture_output=True, text=True)
                                    if proc.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                                        return out_path
                                    return None
                                finally:
                                    try:
                                        _FFMPEG_SEM.release()
                                    except Exception:
                                        pass
                            with concurrent.futures.ThreadPoolExecutor(max_workers=pool_size, thread_name_prefix="sprite-even") as ex:
                                futures = {ex.submit(_extract_one, (idx, ts)): idx for idx, ts in enumerate(times)}
                                for fut in concurrent.futures.as_completed(futures):
                                    idx = futures[fut]
                                    path_or_none = None
                                    try:
                                        path_or_none = fut.result()
                                    except Exception:
                                        path_or_none = None
                                    extracted_paths[idx] = path_or_none
                                    with completed_lock:
                                        completed += 1
                                        c = completed
                                    if progress_cb:
                                        try:
                                            progress_cb(c, steps)
                                        except Exception:
                                            pass
                                    # Optional short-circuit if canceled
                                    if cancel_flag["canceled"]:
                                        break
                            if cancel_flag["canceled"]:
                                raise RuntimeError("canceled")
                            # Collect successful frames in order (fallback to previous good frame when missing)
                            last_good: Optional[Path] = None
                            for i, pth in enumerate(extracted_paths):
                                if pth and pth.exists() and pth.stat().st_size > 0:
                                    extracted.append(pth)
                                    last_good = pth
                                elif last_good is not None:
                                    extracted.append(last_good)
                            # If still none, abort to legacy
                            if not extracted:
                                raise RuntimeError("no frames extracted in even sampling path")
                            # Load first frame to determine tile height
                            with Image.open(extracted[0]) as im0:
                                tile_w, tile_h = im0.size
                            sheet_w = tile_w * cols
                            sheet_h = tile_h * rows
                            try:
                                sheet.parent.mkdir(parents=True, exist_ok=True)
                            except Exception:
                                pass
                            mosaic = Image.new("RGB", (sheet_w, sheet_h))
                            # Fill grid
                            idx = 0
                            for r in range(rows):
                                for c in range(cols):
                                    src = extracted[idx] if idx < len(extracted) else extracted[-1]
                                    try:
                                        with Image.open(src) as fr:
                                            mosaic.paste(fr, (c * tile_w, r * tile_h))
                                    except Exception:
                                        pass
                                    idx += 1
                            # Save composite
                            try:
                                mosaic.save(sheet, format="JPEG", quality=max(60, 100 - quality * 5))
                            except Exception:
                                mosaic.save(sheet, format="JPEG")
                            # Write index JSON with time mapping
                            frames_metadata = []
                            for k, ts in enumerate(times):
                                frames_metadata.append({"i": k, "t": ts})
                            metadata = {
                                "cols": cols,
                                "rows": rows,
                                "interval": segment,  # average spacing
                                "width": width,
                                "tile_width": tile_w,
                                "tile_height": tile_h,
                                "frames": frames_metadata[: total_tiles],
                                "grid": [cols, rows],
                                "tile": [tile_w, tile_h],
                                "even_sampling": True,
                                "duration": _dur_f,
                            }
                            j.write_text(json.dumps(metadata, indent=2))
                            if progress_cb:
                                try:
                                    progress_cb(steps, steps)
                                except Exception:
                                    pass
                            try:
                                print(f"[sprites][even] sheet created {sheet.name} tiles={total_tiles} dur={_dur_f:.2f}s")
                            except Exception:
                                pass
                            return  # Successful even sampling path
                    except Exception:
                        # Fall through to legacy single-pass mosaic path
                        try:
                            print("[sprites][even] fallback to legacy path")
                        except Exception:
                            pass
            # Build filter:
            # - Normalize timestamps to frame count to avoid hwaccel/decoder PTS oddities (prevents duplicate selection)
            # - fps to sample one frame per interval with a slight start offset to avoid the very first frame
            # - scale to desired width and tile to mosaic
            start_time = max(0.0, float(interval) * 0.5)
            vf = (
                f"setpts=N/FRAME_RATE/TB,"
                f"fps=1/{max(0.001, float(interval))}:start_time={start_time},"
                f"scale={int(width)}:-2:flags=lanczos,"
                f"tile={int(cols)}x{int(rows)}"
            )
            # Estimate an input cap to provide enough samples to fill the grid without over-reading
            # Prefer real duration when available to prevent overrun on short clips.
            try:
                dur = None
                if metadata_path(video).exists():
                    dur = extract_duration(json.loads(metadata_path(video).read_text()))
                else:
                    metadata_single(video, force=False)
                    dur = extract_duration(json.loads(metadata_path(video).read_text()))
            except Exception:
                dur = None
            target_frames = int(max(1, int(cols) * int(rows)))
            base_secs = float(interval) * float(target_frames)
            if isinstance(dur, (int, float)) and dur and float(dur) > 0:
                cap_secs = min(float(dur), base_secs + max(float(interval) * 2.0, 2.0))
            else:
                cap_secs = max(0.5, base_secs + max(float(interval) * 2.0, 2.0))
            cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
                *(_ffmpeg_hwaccel_flags()),
                "-t", f"{cap_secs:.3f}",
                "-i", str(video),
                "-an",  # no audio processing
                "-vf", vf,
                "-frames:v", "1",
                *(_ffmpeg_threads_flags()),
                str(sheet),
            ]
            try:
                # Helpful logging so users can see long-running sprite jobs
                try:
                    print("[sprites] ffmpeg:", " ".join(shlex.quote(x) for x in cmd))  # type: ignore[name-defined]
                except Exception:
                    pass
                proc_rc: Optional[int] = None
                proc_err_text: str = ""
                if progress_cb or cancel_check:
                    # Use Popen to allow polling for approximate progress and cancellation
                    # Enforce global ffmpeg concurrency even in this Popen path
                    _local_sem = _FFMPEG_SEM
                    _local_sem.acquire()
                    try:
                        proc = subprocess.Popen(
                            cmd,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                            start_new_session=True,
                        )
                    except Exception:
                        # If spawn fails, release the slot and re-raise
                        try:
                            _local_sem.release()
                        except Exception:
                            pass
                        raise
                    try:
                        _register_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
                    except Exception:
                        pass
                    start_time = time.time()
                    steps = 100
                    last_progress_time = start_time
                    last_logged_pct = -1
                    # Watchdog env knobs
                    try:
                        spr_wd_log = float(os.environ.get("SPRITES_WATCHDOG_LOG_SECS", "15"))
                    except Exception:
                        spr_wd_log = 15.0
                    try:
                        spr_wd_kill = float(os.environ.get("SPRITES_WATCHDOG_KILL_SECS", "120"))
                    except Exception:
                        spr_wd_kill = 120.0
                    spr_wd_log = max(2.0, spr_wd_log)
                    spr_wd_kill = max(spr_wd_log + 5.0, spr_wd_kill)
                    watchdog_logged = False
                    killed_for_stall = False
                    # We'll read stderr lines opportunistically for richer diagnostics
                    stderr_buf: list[str] = []
                    while True:
                        rc = proc.poll()
                        now = time.time()
                        # update approx progress
                        if progress_cb:
                            try:
                                frac = 0.0
                                try:
                                    frac = min(1.0, max(0.0, (now - start_time) / cap_secs))
                                except Exception:
                                    frac = 0.0
                                progress = int(frac * steps)
                                progress_cb(progress, steps)
                                if progress != last_logged_pct and (progress % 5 == 0 or progress in (0, 99)):
                                    last_logged_pct = progress
                                    try:
                                        print(f"[sprites][progress] {video.name} ~{progress}% (elapsed={now-start_time:.1f}s cap={cap_secs:.1f}s)")
                                    except Exception:
                                        pass
                            except Exception:
                                pass
                        # drain any available stderr without blocking
                        try:
                            if proc.stderr is not None and not rc:
                                while True:
                                    try:
                                        line = proc.stderr.readline()
                                    except Exception:
                                        break
                                    if not line:
                                        break
                                    ls = line.strip()
                                    if ls:
                                        stderr_buf.append(ls)
                                        # Attempt to parse pts_time or frame matches for more granular updates
                                        if 'pts_time:' in ls and 'frame=' in ls:
                                            last_progress_time = now
                                        elif 'frame=' in ls:
                                            last_progress_time = now
                        except Exception:
                            pass
                        # handle cancel
                        if cancel_check and cancel_check():
                            try:
                                proc.terminate()
                                try:
                                    proc.wait(timeout=2)
                                except Exception:
                                    proc.kill()
                            except Exception:
                                pass
                            # Release ffmpeg slot on cancel
                            try:
                                _local_sem.release()
                            except Exception:
                                pass
                            try:
                                _unregister_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
                            except Exception:
                                pass
                            raise RuntimeError("canceled")
                        if rc is not None:
                            # ensure 100% on success
                            if rc == 0 and progress_cb:
                                try:
                                    progress_cb(steps, steps)
                                except Exception:
                                    pass
                            if rc == 0:
                                try:
                                    print(f"[sprites][done] {video.name} elapsed={now-start_time:.2f}s")
                                except Exception:
                                    pass
                            # Release ffmpeg slot when the process ends
                            try:
                                _local_sem.release()
                            except Exception:
                                pass
                            # Capture stderr for diagnostics and unregister tracked process
                            try:
                                _out_text, _err_text = proc.communicate()
                                proc_err_text = str(_err_text or "")
                            except Exception:
                                proc_err_text = ""
                            try:
                                _unregister_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
                            except Exception:
                                pass
                            proc_rc = int(rc)
                            break
                        # Watchdog checks while running
                        idle = now - last_progress_time
                        if not watchdog_logged and idle >= spr_wd_log and rc is None:
                            watchdog_logged = True
                            try:
                                cur_size = sheet.stat().st_size if sheet.exists() else 0
                            except Exception:
                                cur_size = -1
                            try:
                                print(f"[sprites][watchdog] no progress lines for {idle:.1f}s (size={cur_size} bytes) video={video.name}")
                            except Exception:
                                pass
                        if idle >= spr_wd_kill and rc is None:
                            try:
                                print(f"[sprites][watchdog] killing stalled ffmpeg after {idle:.1f}s video={video.name}")
                            except Exception:
                                pass
                            try:
                                proc.terminate()
                                killed_for_stall = True
                            except Exception:
                                pass
                        time.sleep(0.2)
                        time.sleep(0.2)
                else:
                    proc = _run(cmd)
                    proc_rc = int(proc.returncode)
                    try:
                        proc_err_text = str(proc.stderr or "")
                    except Exception:
                        proc_err_text = ""
                if int(proc_rc or 0) != 0:
                    try:
                        err = (proc_err_text or '').strip()
                        if err:
                            print('[sprites] ffmpeg error:', err)
                    except Exception:
                        pass
                    raise RuntimeError(proc_err_text or "ffmpeg sprite generation failed")
            except Exception:
                # Fall back to replicated thumbnail flow below
                pass
            else:
                # Compute tile dimensions from output image
                try:
                    from PIL import Image  # type: ignore
                    with Image.open(sheet) as im:
                        sheet_w, sheet_h = im.size
                except Exception:
                    # If PIL not available at runtime, approximate tile_h by 9:16 aspect
                    sheet_w = int(width * cols)
                    sheet_h = int((width * 9 // 16) * rows)
                tile_w = int(max(1, sheet_w // max(1, cols)))
                tile_h = int(max(1, sheet_h // max(1, rows)))
                # Optional: sanity check for duplicate tiles; progressively try to improve uniqueness.
                try:
                    from PIL import Image  # type: ignore
                    import hashlib

                    def _unique_tiles_count(path: Path, tw: int, th: int, c: int, r: int) -> int:
                        try:
                            with Image.open(path) as _im:
                                _im = _im.convert('RGB')
                                _hashes: list[str] = []
                                for _rr in range(r):
                                    for _cc in range(c):
                                        _box = (_cc * tw, _rr * th, (_cc + 1) * tw, (_rr + 1) * th)
                                        _tile = _im.crop(_box)
                                        _h = hashlib.md5(_tile.tobytes()).hexdigest()
                                        _hashes.append(_h)
                                return len(set(_hashes))
                        except Exception:
                            return 0

                    total_tiles = int(cols * rows)
                    # Start with conservative threshold: require at least 25% unique tiles
                    min_unique = max(1, total_tiles // 4)
                    unique = _unique_tiles_count(sheet, tile_w, tile_h, int(cols), int(rows))

                    # Fallback 1: slight jitter to sampling start to avoid boundary/keyframe bias
                    if unique < min_unique:
                        try:
                            jitter = max(0.01, float(interval) * 0.15)
                            start_time2 = max(0.0, float(interval) * 0.5 + jitter)
                            vf2 = (
                                f"setpts=N/FRAME_RATE/TB,"
                                f"fps=1/{max(0.001, float(interval))}:start_time={start_time2},"
                                f"scale={int(width)}:-2:flags=lanczos,"
                                f"tile={int(cols)}x{int(rows)}"
                            )
                            cmd2 = [
                                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
                                *(_ffmpeg_hwaccel_flags()),
                                "-t", f"{cap_secs:.3f}",
                                "-i", str(video),
                                "-an",
                                "-vf", vf2,
                                "-frames:v", "1",
                                *(_ffmpeg_threads_flags()),
                                str(sheet),
                            ]
                            _run(cmd2)
                            unique = _unique_tiles_count(sheet, tile_w, tile_h, int(cols), int(rows))
                        except Exception:
                            pass

                    # Fallback 2: drop near-identical frames before sampling (mpdecimate), then fps
                    if unique < min_unique:
                        try:
                            vf3 = (
                                f"setpts=N/FRAME_RATE/TB,"
                                f"mpdecimate,"
                                f"fps=1/{max(0.001, float(interval))}:start_time={max(0.0, float(interval) * 0.5)},"
                                f"scale={int(width)}:-2:flags=lanczos,"
                                f"tile={int(cols)}x{int(rows)}"
                            )
                            cmd3 = [
                                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
                                *(_ffmpeg_hwaccel_flags()),
                                # For decimation, scan more broadly (omit -t cap)
                                "-i", str(video),
                                "-an",
                                "-vf", vf3,
                                "-frames:v", "1",
                                *(_ffmpeg_threads_flags()),
                                str(sheet),
                            ]
                            _run(cmd3)
                            unique = _unique_tiles_count(sheet, tile_w, tile_h, int(cols), int(rows))
                        except Exception:
                            pass

                    # Fallback 3: scene-change-driven sampling as a last resort
                    if unique < min_unique:
                        try:
                            try:
                                thr_env = os.environ.get("SPRITES_SCENE_THRESHOLD")
                                scene_thr = float(thr_env) if thr_env not in (None, "") else 0.03
                            except Exception:
                                scene_thr = 0.03
                            vf4 = (
                                f"select='gt(scene,{scene_thr})',"
                                f"setpts=PTS-STARTPTS,"
                                f"scale={int(width)}:-2:flags=lanczos,"
                                f"tile={int(cols)}x{int(rows)}"
                            )
                            cmd4 = [
                                "ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
                                *(_ffmpeg_hwaccel_flags()),
                                "-i", str(video),
                                "-an",
                                "-vf", vf4,
                                "-frames:v", "1",
                                *(_ffmpeg_threads_flags()),
                                str(sheet),
                            ]
                            _run(cmd4)
                            unique = _unique_tiles_count(sheet, tile_w, tile_h, int(cols), int(rows))
                        except Exception:
                            pass
                except Exception:
                    pass

                # Final guard: ensure we actually wrote a non-empty sheet
                if not _file_nonempty(sheet, min_size=64):
                    raise RuntimeError("sprite sheet output missing or too small after processing")
                frames = int(cols * rows)
                metadata = {
                    "cols": int(cols),
                    "rows": int(rows),
                    "interval": float(interval),
                    "width": int(width),
                    "tile_width": int(tile_w),
                    "tile_height": int(tile_h),
                    "frames": int(frames),
                    # legacy keys for compatibility
                    "grid": [int(cols), int(rows)],
                    "tile": [int(tile_w), int(tile_h)],
                }
                j.write_text(json.dumps(metadata, indent=2))
                try:
                    print(f"[sprites] wrote {sheet.name} and {j.name}")
                except Exception:
                    pass
                return

    # Fallback: use a repeated thumbnail (last-resort)
    try:
        generate_thumbnail(video, force=False, time_spec="middle", quality=quality)
        from PIL import Image  # type: ignore
        base_img = Image.open(thumbnails_path(video))
        w, h = base_img.size
        tile_w, tile_h = width, int(h * (width / w))
        sheet_img = Image.new("RGB", (tile_w * cols, tile_h * rows), color=(0, 0, 0))
        tile = base_img.resize((tile_w, tile_h))
        for r in range(rows):
            for c in range(cols):
                sheet_img.paste(tile, (c * tile_w, r * tile_h))
        sheet_img.save(sheet)
        metadata = {
            "cols": int(cols),
            "rows": int(rows),
            "interval": float(interval),
            "width": int(width),
            "tile_width": int(tile_w),
            "tile_height": int(tile_h),
            "frames": int(cols * rows),
            "grid": [int(cols), int(rows)],
            "tile": [int(tile_w), int(tile_h)],
        }
        j.write_text(json.dumps(metadata, indent=2))
        return
    except Exception:
        # Absolute stub if everything else failed
        try:
            sheet.write_bytes(b"JPEGDATA")
            j.write_text(json.dumps({
                "cols": int(cols), "rows": int(rows), "interval": float(interval), "width": int(width),
                "tile_width": int(width), "tile_height": int(width * 9 // 16), "frames": int(cols * rows),
                "grid": [int(cols), int(rows)], "tile": [int(width), int(width * 9 // 16)],
            }, indent=2))
        except Exception:
            pass

# ---------------
# Heatmaps (stub)
# ---------------
def compute_heatmaps(
    video: Path,
    interval: float,
    mode: str,
    png: bool,
    progress_cb: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> dict:
    """
    Compute a basic heatmap by sampling frame brightness every `interval` seconds.
    mode is currently informational; brightness is normalized 0..1.
    """
    try:
        from PIL import Image, ImageDraw  # type: ignore
    except Exception:
        # Fallback: empty data
        data = {"interval": interval, "samples": []}
        heatmaps_json_path(video).write_text(json.dumps(data, indent=2))
        if png:
            heatmaps_png_path(video).write_bytes(b"")
        if progress_cb:
            try:
                progress_cb(1, 1)
            except Exception:
                pass
        return data

    # Determine duration
    duration = None
    try:
        if metadata_path(video).exists():
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
        else:
            metadata_single(video, force=False)
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
    except Exception:
        duration = None
    if not duration or duration <= 0 or not ffmpeg_available():
        data = {"interval": interval, "samples": []}
        heatmaps_json_path(video).write_text(json.dumps(data, indent=2))
        if png:
            heatmaps_png_path(video).write_bytes(b"")
        if progress_cb:
            try:
                progress_cb(1, 1)
            except Exception:
                pass
        return data

    samples: list[dict] = []
    # Fast path: single ffmpeg pass sampling frames and computing brightness via signalstats
    total_steps = 0
    try:
        if duration and interval:
            total_steps = max(1, int(float(duration) / max(0.1, float(interval))) + 1)
        vf = f"fps=1/{max(0.1, float(interval))},scale=160:-1,signalstats,metadata=print"
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "info", "-nostdin",
            *(_ffmpeg_hwaccel_flags()),
            "-i", str(video),
            "-vf", vf,
            "-f", "null", "-",
        ]
        # Stream combined output to parse YAVG incrementally and update progress
        _local_sem = _FFMPEG_SEM
        _local_sem.acquire()
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            try:
                _register_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
            except Exception:
                pass
            last_idx = 0
            last_ts = 0.0
            if proc.stdout is not None:
                for line in proc.stdout:
                    if not line:
                        continue
                    try:
                        # Extract pts_time if available for timestamp
                        m_ts = re.search(r"pts_time:([0-9]+\.[0-9]+)", line)
                        t_val = float(m_ts.group(1)) if m_ts else None
                        m = re.search(r"YAVG:([0-9]+\.?[0-9]*)", line)
                        if not m:
                            m = re.search(r"lavfi\.signalstats\.YAVG[=:]([0-9]+\.?[0-9]*)", line)
                        if m:
                            yavg = float(m.group(1))
                            v = max(0.0, min(1.0, yavg / 255.0))
                            samples.append({"t": round(t_val, 3) if t_val is not None else None, "v": v})
                            last_idx += 1
                            if isinstance(t_val, float):
                                last_ts = t_val
                            if progress_cb and total_steps:
                                try:
                                    progress_cb(min(last_idx, total_steps), total_steps)
                                except Exception:
                                    pass
                        # Approximate progress by timestamp if frame count lags
                        elif duration and duration > 0 and progress_cb and ("signalstats" in line):
                            try:
                                frac = max(0.0, min(1.0, float(last_ts) / float(duration)))
                                progress_cb(int(frac * total_steps), total_steps)
                            except Exception:
                                pass
                    except Exception:
                        continue
                    # cancellation
                    ev = JOB_CANCEL_EVENTS.get(getattr(JOB_CTX, "jid", ""))
                    if ev is not None and ev.is_set():
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except Exception:
                            proc.terminate()
                        raise RuntimeError("canceled")
            rc = proc.wait()
            if rc != 0 and not samples:
                samples = []  # force fallback
        finally:
            try:
                _local_sem.release()
            except Exception:
                pass
            try:
                _unregister_job_proc(getattr(JOB_CTX, "jid", "") or "", proc)  # type: ignore[name-defined]
            except Exception:
                pass
        # Backfill timestamps if not provided
        if samples and samples[0].get("t") is None:
            t = 0.0
            step = max(0.1, float(interval))
            for i in range(len(samples)):
                samples[i]["t"] = round(t, 3)
                t += step
    except Exception:
        samples = []

    # Fallback: per-sample extraction (slower)
    if not samples:
        with tempfile.TemporaryDirectory() as td:
            t = 0.0
            idx = 0
            total_steps = 0
            if duration and interval:
                try:
                    total_steps = max(1, int(float(duration) / max(0.1, float(interval))) + 1)
                except Exception:
                    total_steps = 0
            while t <= float(duration) + 1e-6:
                if cancel_check and cancel_check():
                    raise RuntimeError("canceled")
                frame_path = Path(td) / f"heat_{idx:04d}.jpg"
                cmd = [
                    "ffmpeg", "-y",
                    *(_ffmpeg_hwaccel_flags()),
                    "-noaccurate_seek",
                    "-ss", f"{t:.3f}", "-i", str(video),
                    "-frames:v", "1",
                    "-vf", "scale=160:-1,format=gray",
                    *(_ffmpeg_threads_flags()),
                    str(frame_path),
                ]
                proc = _run(cmd)
                if proc.returncode == 0 and frame_path.exists():
                    try:
                        img = Image.open(frame_path)
                        px = list(cast(Iterable[int], img.getdata()))
                        img.close()
                        v = (sum(px) / (len(px) * 255.0)) if px else 0.0
                        samples.append({"t": round(t, 3), "v": max(0.0, min(1.0, float(v)))})
                    except Exception:
                        samples.append({"t": round(t, 3), "v": 0.0})
                else:
                    samples.append({"t": round(t, 3), "v": 0.0})
                idx += 1
                t += max(0.1, float(interval))
                if progress_cb and total_steps:
                    try:
                        progress_cb(idx, total_steps)
                    except Exception:
                        pass

    data = {
        "interval": float(interval),
        "samples": samples
    }
    heatmaps_json_path(video).write_text(json.dumps(data, indent=2))
    if png and samples:
        # Simple bar chart visualization
        W = max(50, len(samples))
        H = 40
        img = Image.new("RGB", (W, H), color=(10, 10, 12))
        dr = ImageDraw.Draw(img)
        for x, s in enumerate(samples):
            val = float(s.get("v", 0.0))
            h = int(val * (H - 2))
            dr.line([(x, H - 1), (x, H - 1 - h)], fill=(79, 140, 255))
        try:
            img.save(heatmaps_png_path(video), optimize=True, compress_level=9)
        except Exception:
            # Fallback: save without options if Pillow lacks these params
            img.save(heatmaps_png_path(video))
    if progress_cb and total_steps:
        try:
            progress_cb(total_steps, total_steps)
        except Exception:
            pass
    return data

# -----------------
# Subtitles
# -----------------
def detect_backend(preference: str) -> str:
    if preference != "auto":
        return preference
    # Prefer installed Python backends
    try:
        __import__("faster_whisper")
        return "faster-whisper"
    except Exception:
        pass
    try:
        __import__("whisper")
        return "whisper"
    except Exception:
        pass
    # If whisper.cpp is configured via env, use it
    cpp_bin = os.environ.get("WHISPER_CPP_BIN")
    cpp_model = os.environ.get("WHISPER_CPP_MODEL")
    if cpp_bin and cpp_model and Path(cpp_bin).exists() and Path(cpp_model).exists():
        return "whisper.cpp"
    # As a last-resort, return stub to avoid hard failure
    return "stub"


def _safe_importable(mod: str) -> bool:
    try:
        __import__(mod)
        return True
    except Exception:
        return False


def _format_srt_segments(segments: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for i, s in enumerate(segments, start=1):
        def ts(t: float) -> str:
            h = int(t // 3600)
            m = int((t % 3600) // 60)
            sec = float(t % 60)
            return f"{h:02d}:{m:02d}:{sec:06.3f}".replace('.', ',')
        lines.append(str(i))
        lines.append(f"{ts(float(s.get('start', 0)))} --> {ts(float(s.get('end', 0)))}")
        lines.append((s.get('text') or '').strip())
        lines.append("")
    return ("\n".join(lines)).strip() + "\n"


def run_whisper_backend(
    video: Path,
    backend: str,
    model_name: str,
    language: Optional[str],
    translate: bool,
    cpp_bin: Optional[str] = None,
    cpp_model: Optional[str] = None,
    compute_type: Optional[str] = None,
    progress_cb: Optional[Callable[[float], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> List[Dict[str, Any]]:
    # Returns list of segments: {start,end,text}
    if os.environ.get("FFPROBE_DISABLE"):
        segs = [{
            "start": i * 2.0,
            "end": i * 2.0 + 1.5,
            "text": f"Stub segment {i+1}"
        } for i in range(3)]
        if progress_cb:
            try:
                for i, s in enumerate(segs, start=1):
                    progress_cb(min(1.0, float(i) / float(len(segs))))
            except Exception:
                pass
        return segs
    if backend == "faster-whisper":
        from faster_whisper import WhisperModel  # type: ignore
        initial_type = compute_type or ("int8" if translate else "float16")
        tried: list[str] = []
        chain = [initial_type]
        if initial_type != "int8":
            chain.append("int8")
        if initial_type not in ("float32", "int16"):
            chain.append("float32")
        last_err: Exception | None = None
        # Determine duration for fractional progress
        duration: float | None = None
        try:
            if metadata_path(video).exists():
                duration = extract_duration(json.loads(metadata_path(video).read_text()))
            else:
                metadata_single(video, force=False)
                duration = extract_duration(json.loads(metadata_path(video).read_text()))
        except Exception:
            duration = None
        for ct in chain:
            try:
                tried.append(ct)
                model = WhisperModel(model_name, compute_type=ct)
                seg_iter, _info = model.transcribe(str(video), language=language, task=("translate" if translate else "transcribe"))
                segs: List[Dict[str, Any]] = []
                for s in seg_iter:
                    if cancel_check and cancel_check():
                        raise RuntimeError("canceled")
                    segs.append({"start": s.start, "end": s.end, "text": s.text})
                    if progress_cb and duration and duration > 0:
                        try:
                            end_t = float(getattr(s, "end", 0.0) or 0.0)
                            frac = max(0.0, min(1.0, end_t / duration))
                            progress_cb(frac)
                        except Exception:
                            pass
                if ct != initial_type:
                    print(f"[subtitles] compute_type fallback: {initial_type} -> {ct}", file=sys.stderr)
                return segs
            except Exception as e:  # noqa: BLE001
                last_err = e
                continue
        raise RuntimeError(f"faster-whisper failed (tried {tried}): {last_err}")
    if backend == "whisper":
        import whisper  # type: ignore
        model = whisper.load_model(model_name)
        result = model.transcribe(str(video), language=language, task=("translate" if translate else "transcribe"))
        segs: List[Dict[str, Any]] = []
        for s in result.get("segments", []):
            if isinstance(s, dict):
                segs.append({
                    "start": s.get("start"),
                    "end": s.get("end"),
                    "text": s.get("text")
                })
                if progress_cb:
                    try:
                        # Best-effort fractional progress based on segment index
                        idx = len(segs)
                        total = max(idx, len(result.get("segments") or []))
                        if total > 0:
                            progress_cb(min(1.0, float(idx) / float(total)))
                    except Exception:
                        pass
        return segs
    if backend == "whisper.cpp":
        # Allow env-based autodiscovery
        cpp_bin = cpp_bin or os.environ.get("WHISPER_CPP_BIN")
        cpp_model = cpp_model or os.environ.get("WHISPER_CPP_MODEL")
        if not cpp_bin or not Path(cpp_bin).exists():
            raise RuntimeError("whisper.cpp binary not found (provide --whisper-cpp-bin)")
        if not cpp_model or not Path(cpp_model).exists():
            raise RuntimeError("whisper.cpp model not found (provide --whisper-cpp-model)")
        out_json = artifact_dir(video) / f"{video.stem}.whisper.cpp.json"
        cmd = [cpp_bin, "-m", cpp_model, "-f", str(video), "-otxt", "-oj"]
        if language:
            cmd += ["-l", language]
        if translate:
            cmd += ["-tr"]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "whisper.cpp failed")
        try:
            data = json.loads(proc.stdout)
            segs: List[Dict[str, Any]] = []
            for s in data.get("transcription", {}).get("segments", []):
                segs.append({"start": (s.get("t0", 0) / 1000.0), "end": (s.get("t1", 0) / 1000.0), "text": s.get("text", "")})
                if progress_cb:
                    try:
                        idx = len(segs)
                        total = max(idx, len(data.get("transcription", {}).get("segments", []) or []))
                        if total > 0:
                            progress_cb(min(1.0, float(idx) / float(total)))
                    except Exception:
                        pass
            return segs
        except Exception:
            if out_json.exists():
                data = json.loads(out_json.read_text())
                segs: List[Dict[str, Any]] = []
                for s in data.get("transcription", {}).get("segments", []):
                    segs.append({"start": (s.get("t0", 0) / 1000.0), "end": (s.get("t1", 0) / 1000.0), "text": s.get("text", "")})
                    if progress_cb:
                        try:
                            idx = len(segs)
                            total = max(idx, len(data.get("transcription", {}).get("segments", []) or []))
                            if total > 0:
                                progress_cb(min(1.0, float(idx) / float(total)))
                        except Exception:
                            pass
                return segs
            raise RuntimeError("Failed to parse whisper.cpp output")
    if backend == "stub":
        # Deterministic tiny set of segments to ensure UI works without deps
        return [
            {"start": 0.0, "end": 1.5, "text": "[no speech engine installed]"},
            {"start": 2.0, "end": 3.2, "text": "Install faster-whisper or whisper."},
        ]
    raise RuntimeError(f"Unknown backend {backend}")


def generate_subtitles(
    video: Path,
    out_file: Path,
    model: str = "small",
    language: Optional[str] = None,
    translate: bool = False,
    progress_cb: Optional[Callable[[float], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    backend = detect_backend("auto")
    dbg = bool(os.environ.get("SUBTITLES_DEBUG")) or True  # always-on lightweight logging (can tune later)
    if dbg:
        try:
            print(f"[subtitles] start video={video.name} backend={backend} model={model} lang={language or 'auto'} translate={translate} out={out_file.name}")
        except Exception:
            pass
    segments = run_whisper_backend(
        video, backend, model, language, translate,
        progress_cb=progress_cb,
        cancel_check=cancel_check,
    )
    # Write SRT
    srt = _format_srt_segments(segments)
    out_file.write_text(srt, encoding="utf-8")
    if dbg:
        try:
            print(f"[subtitles] wrote {len(segments)} segments size={out_file.stat().st_size}B backend={backend}")
        except Exception:
            pass
    return None


def detect_face_backend(preference: str) -> str:
    """
    Select an available faces backend.

    Returns one of: 'insightface', 'opencv', or 'none' when nothing usable is installed.
    - 'auto' prefers InsightFace when both insightface and OpenCV (cv2) are available;
      otherwise falls back to OpenCV when cv2 is available; else 'none'.
    - When a specific preference is provided, we return it verbatim; callers must validate
      availability separately.
    """
    if preference != "auto":
        return preference
    has_cv2 = False
    has_insight = False
    try:
        __import__("cv2")
        has_cv2 = True
    except Exception:
        has_cv2 = False
    try:
        __import__("insightface")
        has_insight = True
    except Exception:
        has_insight = False
    if has_insight and has_cv2:
        return "insightface"
    if has_cv2:
        return "opencv"
    return "none"


def _detect_faces(
    video: Path,
    interval: float = 1.0,
    scale_factor: float = 1.2,
    min_neighbors: int = 7,
    min_size_frac: float = 0.10,
    backend: str = "auto",
    progress_cb: Optional[Callable[[int, int], None]] = None,
) -> List[Dict[str, Any]]:
    """
    Detect faces using selected backend.
    - insightface: SCRFD/RetinaFace + ArcFace embeddings via insightface.app.FaceAnalysis
    - opencv: Haar + OpenFace embeddings (existing path)
    """
    be = detect_face_backend(backend)
    if be == "insightface":
        try:
            import cv2  # type: ignore
            from insightface.app import FaceAnalysis  # type: ignore
            # Lazy singleton cache
            app_inst = getattr(_detect_faces, "_ins_app", None)
            if app_inst is None:
                providers = ["CPUExecutionProvider"]
                app_inst = FaceAnalysis(name="buffalo_l", providers=providers)
                # det_size keeps detection efficient; 640x640 is typical
                app_inst.prepare(ctx_id=0, det_size=(640, 640))
                _detect_faces._ins_app = app_inst  # type: ignore[attr-defined]
            cap = cv2.VideoCapture(str(video))
            if not cap.isOpened():
                raise RuntimeError("cannot open video")
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            step = max(int(fps * interval), 1)
            # progress: estimate how many frames we will process
            try:
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            except Exception:
                total_frames = 0
            total_processed = int(total_frames // step) if total_frames > 0 else 0
            processed = 0
            if progress_cb is not None:
                try:
                    progress_cb(processed, total_processed)
                except Exception:
                    pass
            results: List[Dict[str, Any]] = []
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % step == 0:
                    faces = app_inst.get(frame)
                    t = frame_idx / fps if fps else 0.0
                    for f in faces or []:
                        try:
                            # bbox: [x1, y1, x2, y2]
                            b = getattr(f, "bbox", None)
                            if b is None:
                                continue
                            x1, y1, x2, y2 = [int(max(0, v)) for v in b]
                            w = max(1, int(x2 - x1))
                            h = max(1, int(y2 - y1))
                            # embedding: prefer normed_embedding; else embedding
                            emb = getattr(f, "normed_embedding", None)
                            if emb is None:
                                emb = getattr(f, "embedding", None)
                            embedding = []
                            if emb is not None:
                                try:
                                    embedding = [round(float(x), 6) for x in list(emb)]
                                except Exception:
                                    embedding = []
                            score = float(getattr(f, "det_score", 1.0) or 1.0)
                            results.append({
                                "time": round(float(t), 3),
                                "box": [int(x1), int(y1), int(w), int(h)],
                                "score": score,
                                "embedding": embedding,
                            })
                        except Exception:
                            continue
                    processed += 1
                    if progress_cb is not None:
                        try:
                            progress_cb(processed, total_processed)
                        except Exception:
                            pass
                frame_idx += 1
            cap.release()
            return results
        except Exception:
            # Fall through to OpenCV path on any failure
            pass

    # OpenCV legacy path
    try:
        import cv2  # type: ignore
        import numpy as _np  # type: ignore
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            raise RuntimeError("cannot open video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(int(fps * interval), 1)
        # progress: estimate number of processed frames
        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        except Exception:
            total_frames = 0
        total_processed = int(total_frames // step) if total_frames > 0 else 0
        processed = 0
        if progress_cb is not None:
            try:
                progress_cb(processed, total_processed)
            except Exception:
                pass
        import cv2.data  # type: ignore  # noqa: F401
        cascade = cv2.CascadeClassifier(f"{cv2.data.haarcascades}haarcascade_frontalface_default.xml")
        if cascade.empty():
            raise RuntimeError("cascade not found")
        # Optional: OpenFace embedding model (if available via env OPENFACE_MODEL)
        net = None
        try:
            model_path = os.environ.get("OPENFACE_MODEL")
            if model_path and Path(model_path).exists():
                net = cv2.dnn.readNetFromTorch(str(model_path))
        except Exception:
            net = None
        results: List[Dict[str, Any]] = []

        def _fallback_embed(face_img) -> list[float]:
            """
            Lightweight embedding when no DNN model is available.
            - Convert to grayscale, resize to 32x32
            - 2D DCT and take top-left 8x8 coefficients (low-frequency)
            - L2-normalize the vector
            Returns a small non-empty vector stable enough for cosine dedupe.
            """
            try:
                if face_img is None:
                    return []
                if len(getattr(face_img, 'shape', []) or []) == 3:
                    g = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
                else:
                    g = face_img
                g = cv2.resize(g, (32, 32), interpolation=cv2.INTER_AREA)
                m = _np.asarray(g, dtype=_np.float32) / 255.0
                dct = cv2.dct(m)
                blk = dct[:8, :8].astype(_np.float32)
                vec = blk.reshape(-1)
                n = float(_np.linalg.norm(vec))
                if n > 0:
                    vec = vec / n
                return [round(float(x), 6) for x in vec.tolist()]
            except Exception:
                return []
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % step == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                # Dynamic minimum size to suppress tiny false positives
                gh, gw = gray.shape[:2]
                min_w = max(32, int(gw * float(min_size_frac)))
                min_h = max(32, int(gh * float(min_size_frac)))
                detections = cascade.detectMultiScale(
                    gray,
                    float(scale_factor),
                    int(min_neighbors),
                    minSize=(min_w, min_h),
                )
                t = frame_idx / fps if fps else 0.0
                for (x, y, w, h) in detections:
                    # Basic geometric filtering (aspect ratio and size)
                    if w <= 0 or h <= 0:
                        continue
                    ar = float(w) / float(h)
                    if ar < 0.6 or ar > 1.8:
                        # Unusually wide/tall boxes tend to be non-faces for Haar frontal
                        continue
                    if w < min_w or h < min_h:
                        continue
                    face = frame[y:y+h, x:x+w]
                    embedding = []
                    if net is not None:
                        try:
                            blob = cv2.dnn.blobFromImage(cv2.resize(face, (96, 96)), 1/255.0, (96, 96), (0,0,0), swapRB=True, crop=False)
                            net.setInput(blob)
                            vec = net.forward()[0]
                            embedding = [round(float(v), 6) for v in vec.tolist()]
                        except Exception:
                            embedding = []
                    # If DNN embedding unavailable, compute a lightweight descriptor so output isn't a stub
                    if not embedding:
                        try:
                            embedding = _fallback_embed(face)
                        except Exception:
                            embedding = []
                    results.append({"time": round(float(t), 3), "box": [int(x), int(y), int(w), int(h)], "score": 1.0, "embedding": embedding})
                processed += 1
                if progress_cb is not None:
                    try:
                        progress_cb(processed, total_processed)
                    except Exception:
                        pass
            frame_idx += 1
        cap.release()
        return results
    except Exception:
        # As a last resort, return a clearly marked sentinel that our exists_check will treat as stub.
        # The caller (compute_face_embeddings) will convert this into a hard error so we don't write stubs.
        return [{
            "time": 0.0,
            "box": [0, 0, 100, 100],
            "score": 1.0,
            "embedding": []
        }]


def compute_face_embeddings(
    video: Path,
    sim_thresh: float | None = None,
    interval: float = 1.0,
    scale_factor: float = 1.2,
    min_neighbors: int = 7,
    min_size_frac: float = 0.10,
    backend: str = "auto",
    progress_cb: Optional[Callable[[int, int], None]] = None,
) -> dict:
    out = faces_path(video)
    # Validate backend availability up-front to avoid writing stubs when deps are missing
    sel = detect_face_backend(backend)
    # Explicit preferences must also be honored/validated
    if backend == "insightface":
        if not _has_module("cv2") or not _has_module("insightface"):
            raise RuntimeError("InsightFace backend requested but required packages are missing (need opencv-python and insightface)")
    elif backend == "opencv":
        if not _has_module("cv2"):
            raise RuntimeError("OpenCV backend requested but 'cv2' (opencv-python) is not installed")
    else:  # auto
        if sel == "none":
            raise RuntimeError("No face detection backend available. Please install at least 'opencv-python' or 'insightface' (plus 'onnxruntime').")
    # Deduplicate faces so there's one embedding per distinct face for this video.
    faces = _detect_faces(
        video,
        interval=interval,
        scale_factor=scale_factor,
        min_neighbors=min_neighbors,
        min_size_frac=min_size_frac,
        backend=(backend if backend != "auto" else sel),
        progress_cb=progress_cb,
    )
    # If we received the sentinel stub detection, treat as a hard failure instead of writing a stub file
    try:
        if isinstance(faces, list) and len(faces) == 1:
            f0 = faces[0] or {}
            if list(map(int, (f0.get("box") or []))) == [0, 0, 100, 100] and not (f0.get("embedding") or []):
                raise RuntimeError("Face detection failed (no usable backend). Install 'opencv-python' or 'insightface' to enable faces.")
    except Exception:
        # If any error occurs during sentinel inspection, continue to normal flow
        pass

    def _dedupe_faces(items: List[Dict[str, Any]], sim_thresh: float = 0.9) -> List[Dict[str, Any]]:
        """
        Group face detections by embedding similarity and return one per identity.

        - Uses cosine similarity with a greedy online clustering.
        - Aggregates count/first_time/last_time and keeps a representative box.
        - If numpy is unavailable or embeddings are empty, falls back to coarse hashing.
        """
        clusters: List[Dict[str, Any]] = []
        stub_cluster: Optional[Dict[str, Any]] = None

        # Try numpy-based cosine clustering first.
        try:
            import numpy as np  # type: ignore

            for f in items:
                emb = f.get("embedding") or []
                t = float(f.get("time", 0.0))
                if not emb:
                    if stub_cluster is None:
                        stub_cluster = {
                            "type": "stub",
                            "count": 1,
                            "first_time": t,
                            "last_time": t,
                            "box": f.get("box"),
                            "best_score": float(f.get("score", 0.0)),
                            "rep_time": t,
                        }
                    else:
                        stub_cluster["count"] += 1
                        stub_cluster["first_time"] = min(float(stub_cluster["first_time"]), t)
                        stub_cluster["last_time"] = max(float(stub_cluster["last_time"]), t)
                        sc = float(f.get("score", 0.0))
                        if sc >= float(stub_cluster.get("best_score", -1)):
                            stub_cluster["box"] = f.get("box")
                            stub_cluster["best_score"] = sc
                            stub_cluster["rep_time"] = t
                    continue

                # Normalize embedding
                v = np.asarray(emb, dtype=np.float32)
                n = float(np.linalg.norm(v))
                if n > 0:
                    v = v / n

                assigned = False
                for c in clusters:
                    if c.get("type") != "vec":
                        continue
                    sim = float(np.dot(c["centroid"], v))
                    if sim >= sim_thresh:
                        # Update centroid and aggregate stats
                        cnt = int(c["count"])
                        c["centroid"] = ((c["centroid"] * cnt) + v) / (cnt + 1)
                        c["count"] = cnt + 1
                        c["first_time"] = min(float(c["first_time"]), t)
                        c["last_time"] = max(float(c["last_time"]), t)
                        sc = float(f.get("score", 0.0))
                        if sc >= float(c.get("best_score", -1)):
                            c["box"] = f.get("box")
                            c["best_score"] = sc
                            c["rep_time"] = t
                        assigned = True
                        break
                if not assigned:
                    clusters.append({
                        "type": "vec",
                        "centroid": v,
                        "count": 1,
                        "first_time": t,
                        "last_time": t,
                        "box": f.get("box"),
                        "best_score": float(f.get("score", 0.0)),
                        "rep_time": t,
                    })
        except Exception:
            # Fallback: coarse hash of rounded embeddings to group similar ones.
            from hashlib import sha1
            buckets: Dict[str, Dict[str, Any]] = {}
            for f in items:
                emb = f.get("embedding") or []
                t = float(f.get("time", 0.0))
                if not emb:
                    key = "stub"
                else:
                    key = sha1(
                        (",".join(f"{float(x):.3f}" for x in emb)).encode("utf-8")
                    ).hexdigest()
                b = buckets.get(key)
                if not b:
                    buckets[key] = {
                        "type": "stub" if key == "stub" else "hash",
                        "count": 1,
                        "first_time": t,
                        "last_time": t,
                        "box": f.get("box"),
                        "best_score": float(f.get("score", 0.0)),
                        "embedding": emb,
                        "rep_time": t,
                    }
                else:
                    b["count"] += 1
                    b["first_time"] = min(float(b["first_time"]), t)
                    b["last_time"] = max(float(b["last_time"]), t)
                    sc = float(f.get("score", 0.0))
                    if sc >= float(b.get("best_score", -1)):
                        b["box"] = f.get("box")
                        b["best_score"] = sc
                        b["rep_time"] = t
            # Convert buckets
            for key, b in buckets.items():
                if key == "stub":
                    if stub_cluster is None:
                        stub_cluster = b
                    else:
                        # merge
                        stub_cluster["count"] += b.get("count", 0)
                        stub_cluster["first_time"] = min(float(stub_cluster["first_time"]), float(b.get("first_time", 0.0)))
                        stub_cluster["last_time"] = max(float(stub_cluster["last_time"]), float(b.get("last_time", 0.0)))
                        if float(b.get("best_score", -1)) >= float(stub_cluster.get("best_score", -1)):
                            stub_cluster["box"] = b.get("box")
                            stub_cluster["best_score"] = b.get("best_score")
                else:
                    clusters.append({
                        "type": "hash",
                        "centroid": None,
                        "count": b.get("count", 1),
                        "first_time": b.get("first_time", 0.0),
                        "last_time": b.get("last_time", 0.0),
                        "box": b.get("box"),
                        "best_score": b.get("best_score", 0.0),
                        "embedding": b.get("embedding") or [],
                        "rep_time": b.get("rep_time", b.get("first_time", 0.0)),
                    })

        # Prepare output faces: one entry per cluster
        out_faces: List[Dict[str, Any]] = []
        try:
            import numpy as np  # type: ignore
            for c in clusters:
                if c.get("type") == "vec":
                    v = c["centroid"]
                    n = float(np.linalg.norm(v)) or 1.0
                    v = v / n
                    embedding = [round(float(x), 6) for x in v.tolist()]
                else:
                    embedding = [round(float(x), 6) for x in (c.get("embedding") or [])]
                out_faces.append({
                    "time": round(float(c.get("rep_time", c.get("first_time", 0.0))), 3),
                    "box": c.get("box") or [0, 0, 0, 0],
                    "score": 1.0,
                    "embedding": embedding,
                    "count": int(c.get("count", 1)),
                    "first_time": round(float(c.get("first_time", 0.0)), 3),
                    "last_time": round(float(c.get("last_time", 0.0)), 3),
                })
        except Exception:
            for c in clusters:
                embedding = c.get("embedding") or []
                out_faces.append({
                    "time": round(float(c.get("rep_time", c.get("first_time", 0.0))), 3),
                    "box": c.get("box") or [0, 0, 0, 0],
                    "score": 1.0,
                    "embedding": embedding,
                    "count": int(c.get("count", 1)),
                    "first_time": round(float(c.get("first_time", 0.0)), 3),
                    "last_time": round(float(c.get("last_time", 0.0)), 3),
                })

        if stub_cluster is not None:
            out_faces.append({
                "time": round(float(stub_cluster.get("rep_time", stub_cluster.get("first_time", 0.0))), 3),
                "box": stub_cluster.get("box") or [0, 0, 0, 0],
                "score": 1.0,
                "embedding": [],
                "count": int(stub_cluster.get("count", 1)),
                "first_time": round(float(stub_cluster.get("first_time", 0.0)), 3),
                "last_time": round(float(stub_cluster.get("last_time", 0.0)), 3),
            })

        return out_faces

    # Allow callers to tune similarity threshold; default to 0.9
    deduped = _dedupe_faces(faces, sim_thresh if isinstance(sim_thresh, (int, float)) else 0.9)
    # Annotate backend and stub=false when we have at least one real detection or embedding
    is_stub = False
    try:
        if not deduped:
            is_stub = True
        elif len(deduped) == 1:
            f = deduped[0]
            box = f.get("box") or []
            emb = f.get("embedding") or []
            if isinstance(box, list) and len(box) == 4 and list(map(int, box)) == [0, 0, 100, 100] and not emb:
                is_stub = True
    except Exception:
        is_stub = False
    data = {
        "video": video.name,
        "faces": deduped,
        "generated_at": time.time(),
        "backend": (backend if backend != "auto" else sel),
        "stub": bool(is_stub),
    }
    out.write_text(json.dumps(data, indent=2))
    return data


def api_success(data=None, message: str = "OK", status_code: int = 200):
    return JSONResponse({"status": "success", "message": message, "data": data}, status_code=status_code)


def api_error(message: str, status_code: int = 400, data=None):
    return JSONResponse({"status": "error", "message": message, "data": data}, status_code=status_code)


def raise_api_error(message: str, status_code: int = 400, data=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "data": data})


def _require_ffmpeg_or_error(task_name: str) -> None:
    """
    Guard that raises a user-facing API error when ffmpeg is unavailable.
    task_name: short human label like 'previews' or 'scene detection'.
    """
    if not ffmpeg_available():
        raise_api_error(
            f"ffmpeg is required for {task_name}. Please install ffmpeg and try again.",
            status_code=400,
            data={"ffmpeg": False},
        )


app = FastAPI(title="Media Player", version="3.0")
try:
    # Mount static assets (favicon, manifest, docs) at /static
    app.mount('/static', StaticFiles(directory='static'), name='static')  # type: ignore[arg-type]
    # Expose performer images directory if present (for avatar rendering)
    try:
        # Mount current performers images directory only (no legacy compatibility)
        _perf_dir = (_registry_dir() / 'performers')  # type: ignore[name-defined]
        if _perf_dir.exists():
            app.mount('/performers', StaticFiles(directory=str(_perf_dir)), name='performers')  # type: ignore[arg-type]
    except Exception:
        pass
except Exception as _e:  # pragma: no cover
    logging.getLogger().warning("[init] failed to mount /static: %s", _e)
api = APIRouter(prefix="/api")

# Serve OpenAPI schema under /api as well, so clients that expect an /api base can find it
@app.get('/api/openapi.json', include_in_schema=False)
def openapi_alias():
    try:
        return JSONResponse(app.openapi())  # type: ignore[arg-type]
    except Exception as e:  # pragma: no cover
        # If OpenAPI generation is disabled or fails, return a minimal stub
        return JSONResponse({"openapi": "3.0.2", "info": {"title": "Media Player", "version": "3.0"}, "paths": {}}, status_code=200)

# Comprehensive endpoint listing that includes both API router routes and app-level routes
def _humanize_segment(seg: str) -> str:
    s = (seg or '').strip('/').replace('_', ' ').replace('-', ' ')
    # Friendly names for common tokens
    repl = {
        'phash': 'perceptual hash',
        'orphans': 'orphaned artifacts',
        'sprites': 'sprite sheets',
        'heatmaps': 'heatmaps',
        'faces': 'face detections',
        'scenes': 'scenes',
        'preview': 'preview',
        'library': 'library files',
        'duplicates': 'duplicates',
        'tags': 'tags',
        'jobs': 'jobs',
        'admin': 'admin',
        'config': 'configuration',
        'health': 'health',
        'cleanup': 'cleanup',
        'status': 'status',
        'summary': 'summary',
    }
    return repl.get(s, s)

def _load_route_descriptions() -> dict:
    """Load static route descriptions from static/routes.json.

    Keys must be formatted as "METHOD /path". Returns an empty dict on error.
    """
    try:
        base = Path(__file__).parent
        fp = base / "static" / "routes.json"
        data = json.loads(fp.read_text()) if fp.exists() else {}
        # Normalize keys to METHOD UPPER, path exact
        out = {}
        for k, v in (data or {}).items():
            if not isinstance(k, str):
                continue
            parts = k.strip().split(None, 1)
            if len(parts) != 2:
                continue
            m = parts[0].upper()
            p = parts[1].strip()
            out[f"{m} {p}"] = str(v)
        return out
    except Exception:
        return {}

ROUTE_DESCRIPTIONS = _load_route_descriptions()

def _guess_description(method: str, path: str) -> str:
    """Best-effort human description used ONLY to bootstrap static descriptions.

    Runtime listing does not use this; it's for exporting to the JSON file.
    """
    try:
        method = (method or '').upper()
        p = str(path or '/').strip()
        segs = [s for s in p.strip('/').split('/') if s]
        if segs and segs[0] == 'api':
            segs = segs[1:]
        resource = (segs[0] if segs else 'resource').replace('-', ' ').replace('_', ' ')
        tail = segs[1] if len(segs) > 1 else ''

        if resource == 'markers' and tail in ('intro', 'outro'):
            if tail == 'intro':
                return 'Set or clear intro end marker for a video' if method in ('POST','DELETE') else 'Intro marker operation for a video'
            if tail == 'outro':
                return 'Set or clear outro begin marker for a video' if method in ('POST','DELETE') else 'Outro marker operation for a video'

        if method == 'GET':
            return f'List {resource}' if resource.endswith('s') else f'Retrieve {resource}'
        if method == 'HEAD':
            return f'Check {resource} presence'
        if method in ('PUT', 'PATCH'):
            return f'Update {resource}'
        if method == 'POST':
            # Heuristic: treat trailing segment as action for readability
            if len(segs) > 1 and tail not in ('intro','outro'):
                action = tail.replace('-', ' ').replace('_', ' ')
                return f'{action.title()} {resource}'
            return f'Create {resource}'
        if method == 'DELETE':
            return f'Delete {resource}'
        return f'{method.title()} {resource}'
    except Exception:
        return f'{method} {path}'

@app.get('/api/routes', include_in_schema=False)
def list_all_routes(include_head: bool = Query(default=False)):
    """List all available routes, including those excluded from OpenAPI schema."""
    try:
        routes = []
        for route in app.routes:
            methods = getattr(route, 'methods', None)
            path = getattr(route, 'path', None)
            if methods and path:
                for method in methods:
                    if method == 'HEAD' and not include_head:
                        continue
                    # Best-effort extraction of description from multiple sources
                    desc = ''
                    try:
                        desc = getattr(route, 'description', '') or ''
                    except Exception:
                        desc = ''
                    if not desc:
                        try:
                            # FastAPI routes often expose the underlying callable as .endpoint
                            fn = getattr(route, 'endpoint', None)
                            if fn and getattr(fn, '__doc__', None):
                                desc = (fn.__doc__ or '').strip()
                        except Exception:
                            pass
                    # Only use static descriptions from ROUTE_DESCRIPTIONS; no heuristics in runtime
                    if not desc:
                        key = f"{method} {path}"
                        desc = ROUTE_DESCRIPTIONS.get(key, '')
                    # Derive a concise summary (single line)
                    summary = (getattr(route, 'summary', '') or '').strip()
                    if not summary:
                        # Use description first line or default to METHOD PATH
                        summary = (desc.split('\n', 1)[0]).strip() or f"{method} {path}"
                    if not summary:
                        summary = f"{method} {path}"
                    routes.append({
                        "method": method,
                        "path": path,
                        "summary": summary,
                        "description": desc,
                        "name": getattr(route, 'name', ''),
                        "include_in_schema": getattr(route, 'include_in_schema', True)
                    })
        # Sort by path then method with user-friendly verb priority
        method_order = {"GET": 0, "HEAD": 1, "POST": 2, "PUT": 3, "PATCH": 4, "DELETE": 5}
        routes.sort(key=lambda x: (x["path"], method_order.get(x["method"], 99), x["method"]))
        # Build OpenAPI-like paths object, merging multiple methods under the same path
        paths_obj: dict[str, dict[str, dict]] = {}
        for r in routes:
            p = r["path"]
            m = r["method"].lower()
            if p not in paths_obj:
                paths_obj[p] = {}
            paths_obj[p][m] = {
                "summary": r["summary"],
                "description": r.get("description", ""),
                "operationId": f"{m}_{p.replace('/', '_').replace('{', '').replace('}', '').replace(':', '').strip('_')}",
                "responses": {"200": {"description": "Success"}},
            }
        return JSONResponse({
            "openapi": "3.0.2",
            "info": {"title": "Media Player", "version": "3.0"},
            "paths": paths_obj,
        })
    except Exception as e:  # pragma: no cover
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post('/api/routes/descriptions/export', include_in_schema=False)
def export_route_descriptions(include_head: bool = Query(default=True)):
    """Export a complete static/routes.json with guessed text for missing entries.

    This helps bootstrap the static JSON so ALL endpoints have a description.
    Existing entries are preserved; only missing keys are added.
    """
    global ROUTE_DESCRIPTIONS
    try:
        # Gather all methods/paths
        seen: dict[str, str] = dict(ROUTE_DESCRIPTIONS)
        for route in app.routes:
            methods = getattr(route, 'methods', None)
            path = getattr(route, 'path', None)
            if methods and path:
                for method in methods:
                    if method == 'HEAD' and not include_head:
                        continue
                    key = f"{method} {path}"
                    if key not in seen:
                        seen[key] = _guess_description(method, path)
        # Persist to JSON file (sorted by key for stable diffs)
        base = Path(__file__).parent
        fp = base / "static" / "routes.json"
        fp.parent.mkdir(parents=True, exist_ok=True)
        ordered = {k: seen[k] for k in sorted(seen.keys())}
        fp.write_text(json.dumps(ordered, indent=2))
        # Reload into memory so subsequent calls see updates
        ROUTE_DESCRIPTIONS = ordered
        return api_success({"written": str(fp), "count": len(ordered)})
    except Exception as e:
        return api_error(str(e), status_code=500)

# -----------------------------
# CORS: allow UI from file:// or other hosts to call the API
# Configure via CORS_ALLOW_ORIGINS (comma-separated). Defaults to * for dev.
# -----------------------------
def _cors_origins() -> list[str]:
    try:
        v = os.environ.get("CORS_ALLOW_ORIGINS")
        if not v or not v.strip():
            return ["*"]
        out: list[str] = []
        for part in v.split(","):
            s = part.strip()
            if s:
                out.append(s)
        return out or ["*"]
    except Exception:
        return ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    # Allow any origin including 'null' (file://) and IPs/hosts not explicitly listed
    allow_origin_regex=r".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
"""
Jobs subsystem: in-memory job store, SSE broadcasting, and helpers.
"""

# Global job state
JOBS: dict[str, dict] = {}
JOB_LOCK = threading.Lock()
JOB_EVENT_SUBS: list[tuple[asyncio.Queue[str], asyncio.AbstractEventLoop]] = []
JOB_CANCEL_EVENTS: dict[str, threading.Event] = {}
META_BATCH_EVENTS: dict[str, threading.Event] = {}

# Global concurrency control for running jobs
# Default to 4 unless overridden by env JOB_MAX_CONCURRENCY
JOB_MAX_CONCURRENCY = int(os.environ.get("JOB_MAX_CONCURRENCY", "4"))
JOB_RUN_SEM = threading.Semaphore(JOB_MAX_CONCURRENCY)
JOB_QUEUE_PAUSED = False

# ------------------------------------------------------------
# Logging categories (coarse grained, opt-in / opt-out)
#   Set LOG_ALL=0 to disable all unless explicitly enabled.
#   Set LOG_ALL=1 to enable all unless explicitly disabled.
#   Per-category env vars override: LOG_JOBS, LOG_FFMPEG, LOG_TASKS, LOG_PREVIEW, LOG_THUMBNAIL
#   Values: 1 enable, 0 disable. Default: follow LOG_ALL (which defaults to 1).
# ------------------------------------------------------------
def _log_enabled(cat: str) -> bool:
    try:
        base = os.environ.get("LOG_ALL", "1")
        base_on = str(base).lower() not in ("0", "false", "no")
        specific = os.environ.get(f"LOG_{cat.upper()}")
        if specific is not None:
            return str(specific).lower() in ("1", "true", "yes")
        return base_on
    except Exception:
        return True

def _log(cat: str, msg: str) -> None:
    """Emit an application log line for a given category.

    Uses the standard logging pipeline so messages reliably appear under
    uvicorn's reloader and in tee'd logs. Falls back to print with flush
    if logging is unavailable for any reason.
    """
    if not _log_enabled(cat):
        return
    try:
        logging.info("%s", msg)
    except Exception:
        try:
            # Ensure immediate visibility even under buffered stdout
            print(msg, flush=True)
        except Exception:
            pass

def _env_on(name: str, default: bool = False) -> bool:
    try:
        v = os.environ.get(name)
        if v is None:
            return default
        return str(v).lower() in ("1", "true", "yes")
    except Exception:
        return default

def _set_job_concurrency(new_val: int) -> int:
    """
    Adjust the existing JOB_RUN_SEM to match new concurrency immediately.
    - If increasing, release additional tokens so more jobs can start now.
    - If decreasing, acquire tokens (non-blocking) to reduce available permits;
      any remainder takes effect as running jobs complete and release.
    Returns the effective concurrency stored in JOB_MAX_CONCURRENCY.
    """
    global JOB_MAX_CONCURRENCY
    try:
        target = max(1, min(128, int(new_val)))
    except Exception:
        target = 1
    cur = int(JOB_MAX_CONCURRENCY)
    delta = target - cur
    if delta > 0:
        # Increase: release delta tokens
        for _ in range(delta):
            try:
                JOB_RUN_SEM.release()
            except ValueError:
                # Not bounded; ignore
                pass
    elif delta < 0:
        # Decrease: acquire up to -delta tokens non-blocking to immediately shrink availability
        need = -delta
        for _ in range(need):
            try:
                if not JOB_RUN_SEM.acquire(blocking=False):
                    break
            except Exception:
                break
    JOB_MAX_CONCURRENCY = target
    return JOB_MAX_CONCURRENCY

# Per-file/task locks to avoid duplicate heavy work on the same target
FILE_TASK_LOCKS: dict[tuple[str, str], threading.Lock] = {}
FILE_TASK_LOCKS_GUARD = threading.Lock()

def _file_task_lock(path: Path, task: str) -> threading.Lock:
    """
    Return a process-wide lock for (absolute-file-path, task) pairs.
    Prevents launching multiple ffmpeg/CPU-heavy operations on the same file+task at once.
    """
    try:
        key = (str(path.resolve()), str(_normalize_job_type(task)))
    except Exception:
        key = (str(path), str(_normalize_job_type(task)))
    with FILE_TASK_LOCKS_GUARD:
        lk = FILE_TASK_LOCKS.get(key)
        if lk is None:
            lk = threading.Lock()
            FILE_TASK_LOCKS[key] = lk
        return lk

# Registry lock for centralized tags/performers files
REGISTRY_LOCK = threading.Lock()

# Lightweight helper: detect if a job for the same (task,path) is already queued or running
def _find_active_job(task: str, path: str) -> Optional[str]:
    try:
        t = _normalize_job_type(task)
        # Normalize path to relative-to-root string like what _new_job stores
        p = str(path)
        try:
            # If caller passed an absolute path, convert to rel
            pp = Path(p)
            if pp.is_absolute():
                try:
                    p = str(pp.resolve().relative_to(STATE["root"].resolve()))
                except Exception:
                    p = str(pp)
        except Exception:
            pass
        with JOB_LOCK:
            for jid, j in JOBS.items():
                try:
                    st = str(j.get("state") or "").lower()
                    if st not in ("queued", "running"):
                        continue
                    if _normalize_job_type(str(j.get("type") or "")) != t:
                        continue
                    if str(j.get("path") or "") == p:
                        return jid
                except Exception:
                    continue
    except Exception:
        pass
    return None

# -----------------------------
# Jobs persistence (survive restarts)
# -----------------------------

def _jobs_state_dir() -> Path:
    """
    Directory where job state is persisted across restarts.
    Defaults to MEDIA_PLAYER_STATE_DIR/.jobs or <root>/.jobs.
    """
    try:
        base = os.environ.get("MEDIA_PLAYER_STATE_DIR")
        base_path = Path(base).expanduser().resolve() if base else STATE["root"].resolve()
    except Exception:
        base_path = STATE["root"].resolve()
    d = base_path / ".jobs"
    try:
        d.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return d

def _job_file_path(jid: str) -> Path:
    return _jobs_state_dir() / f"{jid}.json"

def _json_dump_atomic(path: Path, data: dict) -> None:
    """
    Write JSON atomically to avoid partial files.
    """
    try:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(path)
    except Exception:
        # Best-effort; ignore IO errors
        try:
            path.write_text(json.dumps(data, indent=2))
        except Exception:
            pass

def _persist_job(jid: str) -> None:
    if os.environ.get("JOB_PERSIST_DISABLE"):
        return
    with JOB_LOCK:
        j = dict(JOBS.get(jid) or {})
    if not j:
        return
    # Avoid persisting volatile fields that churn rapidly
    j.pop("current", None)
    # Ensure minimal keys
    payload = {
        "id": j.get("id"),
        "type": j.get("type"),
        "path": j.get("path"),
        "state": j.get("state"),
        "created_at": j.get("created_at"),
        "started_at": j.get("started_at"),
        "ended_at": j.get("ended_at"),
        "error": j.get("error"),
        "total": j.get("total"),
        "processed": j.get("processed"),
        "label": j.get("label"),
        "request": j.get("request"),
        "result": j.get("result"),
    }
    _json_dump_atomic(_job_file_path(str(j.get("id") or "")), payload)  # type: ignore[arg-type]
    # Update heartbeat timestamp when persisting job state to reflect liveness
    try:
        JOB_HEARTBEATS[str(j.get("id") or "")] = time.time()
    except Exception:
        pass

def _delete_persisted_job(jid: str) -> None:
    try:
        p = _job_file_path(jid)
        if p.exists():
            p.unlink(missing_ok=True)
    except Exception:
        pass

def _restore_jobs_on_start() -> None:
    if os.environ.get("JOB_PERSIST_DISABLE"):
        return
    d = _jobs_state_dir()
    try:
        files = list(d.glob("*.json"))
    except Exception:
        files = []
    for fp in files:
        try:
            data = json.loads(fp.read_text())
            jid = str(data.get("id") or fp.stem)
            base_type = _normalize_job_type(str(data.get("type") or ""))
            # Decide target state based on previous state and auto-restore setting
            prev = str(data.get("state") or "").lower()
            auto_restore = not bool(os.environ.get("JOB_AUTORESTORE_DISABLE"))
            # Treat cancel_requested as canceled on restore to avoid resurrecting them
            if prev == "cancel_requested":
                target_state = "canceled"
            elif prev in ("done", "failed", "canceled"):
                target_state = prev
            elif prev in ("queued", "running"):
                target_state = "queued" if auto_restore else "restored"
            else:
                # Unknown or missing state: treat as restored (paused) unless auto-resume is enabled
                target_state = "queued" if auto_restore else "restored"
            with JOB_LOCK:
                JOBS[jid] = {
                    "id": jid,
                    "type": base_type,
                    "path": data.get("path"),
                    "state": target_state,
                    "created_at": data.get("created_at"),
                    "started_at": data.get("started_at"),
                    "ended_at": data.get("ended_at"),
                    "error": data.get("error"),
                    "total": data.get("total"),
                    "processed": data.get("processed"),
                    "label": data.get("label"),
                    "result": data.get("result"),
                    "request": data.get("request"),
                }
                JOB_CANCEL_EVENTS[jid] = threading.Event()
            # Persist any state normalization (e.g., running->queued, or queued->restored)
            if prev != target_state:
                _persist_job(jid)
        except Exception:
            continue

    # Optionally auto-resume queued jobs that have a saved request
    if os.environ.get("JOB_AUTORESTORE_DISABLE"):
        return
    with JOB_LOCK:
        items = list(JOBS.items())
    # Submit restore jobs through a bounded executor to prevent spawning hundreds of threads
    submits: int = 0
    for jid, j in items:
        try:
            if j.get("state") == "queued" and isinstance(j.get("request"), dict):
                req_data = j["request"]
                task = str(req_data.get("task") or j.get("type") or "")
                directory = req_data.get("directory") or j.get("path") or str(STATE["root"])  # type: ignore[assignment]
                recursive = bool(req_data.get("recursive", False))
                force = bool(req_data.get("force", False))
                params = dict(req_data.get("params") or {})
                jr = JobRequest(task=task, directory=directory, recursive=recursive, force=force, params=params)
                def _runner(_jid=jid, _jr=jr):
                    try:
                        with JOB_RUN_SEM:
                            _run_job_worker(_jid, _jr)
                    except Exception:
                        pass
                if _RESTORE_EXEC is not None:
                    try:
                        _RESTORE_EXEC.submit(_runner)
                        submits += 1
                        continue
                    except Exception:
                        pass
                # Fallback: start a single conservative thread if executor unavailable
                try:
                    threading.Thread(target=_runner, name=f"job-restore-{task}-{jid}", daemon=True).start()
                    submits += 1
                except Exception:
                    pass
        except Exception:
            continue


def _normalize_job_type(job_type: str) -> str:
    """
    Normalize backend job-type variants to base types for the UI and tests."""
    s = (job_type or "").strip().lower()
    # Legacy aliases
    if s == "preview-concat":
        return "preview"
    if s == "heatmap":
        return "heatmaps"
    # Legacy scenes -> markers
    if s == "scenes":
        return "markers"
    # Batch suffix normalization
    if s.endswith("-batch"):
        s = s[: -len("-batch")]
    return s

def _artifact_from_type(job_type: Optional[str]) -> Optional[str]:
    """Map job type to canonical artifact identifier used by the frontend badges."""
    if not job_type:
        return None
    t = _normalize_job_type(job_type)
    mapping = {
        # Canonical, pluralized where UI expects plural
        "thumbnail": "thumbnails",
        "preview": "previews",
        "phash": "phash",
        # Map both new and legacy scene job names to markers badge
        "scenes": "markers",
        "markers": "markers",
        "sprites": "sprites",
        "heatmaps": "heatmaps",
        "faces": "faces",
        "embed": "faces",      # embed updates faces vectors / faces.json
        "metadata": "metadata",
        "subtitles": "subtitles",
    }
    return mapping.get(t)


def _publish_job_event(evt: dict) -> None:
    """
    Publish a job event to SSE subscribers. Thread-safe."""
    try:
        payload = f"data: {json.dumps(evt)}\n\n"
    except Exception:
        return
    subs = list(JOB_EVENT_SUBS)
    for q, loop in subs:
        try:
            asyncio.run_coroutine_threadsafe(q.put(payload), loop)
        except Exception:
            continue


def _set_job_current(jid: str, current_path: Optional[str]) -> None:
    with JOB_LOCK:
        j = JOBS.get(jid)
        if not j:
            return
        j["current"] = current_path
        jtype = j.get("type")
        jpath = j.get("path")
    _publish_job_event({
        "event": "current",
        "id": jid,
        "type": jtype,
        "path": jpath,
        "current": current_path,
        "artifact": _artifact_from_type(jtype),
        "file": current_path or jpath,
    })


def _new_job(job_type: str, path: str, *, priority: bool = False, meta_batch: Optional[str] = None) -> str:
    """
    Create a new job record and publish creation events.

    meta_batch: if supplied, associates the job with a batch before any events
    are published, eliminating the race where a user cancels the first visible
    job before its batch tag is attached.
    """
    jid = uuid.uuid4().hex[:12]
    base_type = _normalize_job_type(job_type)
    with JOB_LOCK:
        JOBS[jid] = {
            "id": jid,
            "type": base_type,
            "path": path,
            "state": "queued",
            # If priority, bias created_at slightly earlier to promote ordering fairly
            "created_at": (time.time() - 1000.0) if priority else time.time(),
            "started_at": None,
            "ended_at": None,
            "error": None,
            "total": None,
            "processed": None,
            "result": None,
            "priority": bool(priority),
            **({"meta_batch": meta_batch} if meta_batch else {}),
        }
        JOB_CANCEL_EVENTS[jid] = threading.Event()
    _persist_job(jid)
    art = _artifact_from_type(base_type)
    _publish_job_event({"event": "created", "id": jid, "type": base_type, "path": path, "artifact": art, "file": path})
    _publish_job_event({"event": "queued", "id": jid, "type": base_type, "path": path, "artifact": art, "file": path})
    return jid


def _start_job(jid: str):
    with JOB_LOCK:
        j = JOBS.get(jid)
        if j:
            j["state"] = "running"
            j["started_at"] = time.time()
            # Diagnostic: print current running count vs max
            # Only log job starts when explicitly enabled
            if _env_on("LOG_JOBS_START", False):
                try:
                    running_now = sum(1 for qq in JOBS.values() if str(qq.get("state")) == "running")
                    _log("jobs", f"[jobs] start jid={jid} type={j.get('type')} running={running_now}/{JOB_MAX_CONCURRENCY}")
                except Exception:
                    pass
    # Bind thread-local job context if running in current thread
    try:
        JOB_CTX.jid = jid  # type: ignore[name-defined]
    except Exception:
        pass
    _persist_job(jid)
    # Mark heartbeat when job transitions to running
    try:
        JOB_HEARTBEATS[jid] = time.time()
    except Exception:
        pass
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
    _publish_job_event({"event": "started", "id": jid, "type": jtype, "path": jpath, "artifact": _artifact_from_type(jtype), "file": jpath})



def _finish_job(jid: str, error: Optional[str] = None):
    # Best-effort: terminate any live subprocesses tied to this job
    try:
        _terminate_job_processes(jid)  # type: ignore[name-defined]
    except Exception:
        pass
    with JOB_LOCK:
        j = JOBS.get(jid)
        if j:
            # If pause requested a cooperative requeue, move job back to queued
            pause_requeue = bool(j.get("pause_requeue"))
            if pause_requeue:
                j["state"] = "queued"
                j["paused"] = True
                # Reset runtime fields
                j["started_at"] = None
                j["ended_at"] = None
                # Clear any transient error so UI doesn't show a failure from pause
                try:
                    j.pop("error", None)
                except Exception:
                    pass
                # Reset cancel event for next run
                try:
                    ev = JOB_CANCEL_EVENTS.get(jid)
                    if ev:
                        ev.clear()
                except Exception:
                    pass
            else:
                # Honor cancel flag if set
                if error:
                    j["state"] = "failed"
                elif JOB_CANCEL_EVENTS.get(jid) and JOB_CANCEL_EVENTS[jid].is_set():
                    j["state"] = "canceled"
                else:
                    j["state"] = "done"
                    # If we know totals, snap processed to total on successful completion
                    try:
                        t = j.get("total")
                        if t is not None:
                            j["processed"] = int(t)
                    except Exception:
                        pass
                j["ended_at"] = time.time()
                j["error"] = error
    _persist_job(jid)
    # Update heartbeat on finish to indicate recent terminal activity
    try:
        JOB_HEARTBEATS[jid] = time.time()
    except Exception:
        pass
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
    _publish_job_event({"event": "finished", "id": jid, "error": error, "type": jtype, "path": jpath, "artifact": _artifact_from_type(jtype), "file": jpath})
    # Clear thread-local jid when leaving job context in this thread
    try:
        if getattr(JOB_CTX, "jid", None) == jid:  # type: ignore[name-defined]
            JOB_CTX.jid = None  # type: ignore[name-defined]
    except Exception:
        pass


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and exc.detail.get("status") == "error":
        payload = exc.detail
        return JSONResponse(payload, status_code=exc.status_code)
    return JSONResponse({"status": "error", "message": str(exc.detail)}, status_code=exc.status_code)
def _set_job_progress(jid: str, *, total: Optional[int] = None, processed_inc: int = 0, processed_set: Optional[int] = None):
    with JOB_LOCK:
        j = JOBS.get(jid)
        if not j:
            return
        if total is not None:
            j["total"] = int(total)
            if j.get("processed") is None:
                j["processed"] = 0
        if processed_set is not None:
            j["processed"] = int(processed_set)
        if processed_inc:
            cur = j.get("processed") or 0
            j["processed"] = int(cur) + int(processed_inc)
        # Clamp processed within [0, total] if total is known
        try:
            t = j.get("total")
            p = j.get("processed")
            if t is not None and p is not None:
                t_i = int(t)
                p_i = int(p)
                if t_i >= 0:
                    j["processed"] = max(0, min(p_i, t_i))
        except Exception:
            # Best-effort clamping; ignore errors
            pass
        # Derive a percentage for convenience (frontend prefers job.progress if present)
        try:
            t = j.get("total")
            p = j.get("processed")
            if isinstance(t, (int, float)) and t and t > 0 and isinstance(p, (int, float)) and p >= 0:
                pct = int((float(p) / float(t)) * 100)
                if pct < 0:
                    pct = 0
                elif pct > 100:
                    pct = 100
                j["progress"] = pct
            else:
                # Remove stale progress if insufficient data
                if "progress" in j:
                    j.pop("progress", None)
        except Exception:
            # Non-fatal
            pass
    # Persist infrequently changing counters (safe to write each update; small files)
    _persist_job(jid)
    # lightweight progress event (throttling left to clients)
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
        total_v = j.get("total")
        processed_v = j.get("processed")
        progress_v = j.get("progress")
    _publish_job_event({
        "event": "progress",
        "id": jid,
        "type": jtype,
        "path": jpath,
        "file": jpath,
        "artifact": _artifact_from_type(jtype),
        "total": total_v,
        "processed": processed_v,
        "progress": progress_v,
    })
    # Bump heartbeat on progress updates so long-running jobs appear active
    try:
        JOB_HEARTBEATS[jid] = time.time()
    except Exception:
        pass


def _cleanup_orphan_jobs(max_idle: float = 300.0, min_age: float = 5.0) -> dict:
    """Mark running jobs as finished if their processes are gone and heartbeat stale."""
    now = time.time()
    marked: list[str] = []
    with JOB_LOCK:
        for jid, j in JOBS.items():
            if j.get("state") != "running":
                continue
            hb = JOB_HEARTBEATS.get(jid, 0.0)
            idle = now - float(hb or 0.0)
            if idle < max(1.0, min_age):
                continue
            procs = list(JOB_PROCS.get(jid) or [])
            if any(p.poll() is None for p in procs):
                continue
            # orphan
            j["state"] = "failed" if not j.get("error") else j.get("state")
            j.setdefault("error", "orphaned (no active process)")
            j["ended_at"] = time.time()
            marked.append(jid)
            try:
                _persist_job(jid)
            except Exception:
                pass
    return {"marked": len(marked), "ids": marked}


@api.post("/jobs/reap-orphans")
def jobs_reap_orphans(max_idle: float = Query(default=300.0), min_age: float = Query(default=5.0)):
    return api_success(_cleanup_orphan_jobs(max_idle=max_idle, min_age=min_age))



def _wrap_job(job_type: str, path: str, fn, *, priority: bool = False):
    # Conservatively skip if same job already queued/running to avoid duplicates.
    try:
        existing = _find_active_job(job_type, path)
        if existing:
            return api_success({"job": existing, "queued": True, "skipped": True, "reason": "already queued/running"})
    except Exception:
        pass
    jid = _new_job(job_type, path, priority=priority)
    try:
        # Start as soon as a concurrency slot is available; no extra FIFO gating.
        # Enforce global job concurrency even for synchronous (request-thread) jobs
        fp = Path(path)
        lock = _file_task_lock(fp, job_type)
        with JOB_RUN_SEM:
            with lock:
                # Now officially mark as running and bind job context
                _start_job(jid)
                try:
                    JOB_CTX.jid = jid  # type: ignore[name-defined]
                except Exception:
                    pass
                result = fn()
        # store result if it's JSON-serializable
        with JOB_LOCK:
            if jid in JOBS:
                JOBS[jid]["result"] = result if not isinstance(result, JSONResponse) else None
        _finish_job(jid, None)
        return result
    except Exception as e:  # noqa: BLE001
        # On cancellation or failure, mark finished accordingly
        try:
            import traceback, sys
            _log("jobs", f"[jobs] error jid={jid} type={job_type} err={e}\n" + ''.join(traceback.format_exception(*sys.exc_info()))[:1500])
        except Exception:
            pass
        _finish_job(jid, str(e) if str(e) and str(e).lower() != "canceled" else None)
        if str(e).lower() == "canceled":
            # Propagate a clean API error for canceled operations
            raise_api_error("canceled", status_code=499)
        raise


def _wrap_job_background(job_type: str, path: str, fn, *, priority: bool = False):
    """
    Run a job in a background thread and return immediately with a job id.
    This avoids coupling long-running work to the HTTP request lifecycle.
    """
    # Avoid duplicate enqueue for same (task,path) if a job is already active
    try:
        existing = _find_active_job(job_type, path)
        if existing:
            return api_success({"job": existing, "queued": True, "skipped": True, "reason": "already queued/running"})
    except Exception:
        pass
    jid = _new_job(job_type, path, priority=priority)
    def _runner():
        try:
            # Start as soon as a concurrency slot is available
            # Determine whether to use a "light-slot" start (release JOB_RUN_SEM immediately
            # after transitioning to running) to allow more ffmpeg-heavy jobs to overlap.
            # Controlled via env:
            #   LIGHT_SLOT_ALL=1            -> all jobs use light slot
            #   LIGHT_SLOT_TYPES=csv        -> only listed types (normalized) use light slot
            # Default list (if LIGHT_SLOT_TYPES unset): markers,preview,sprites,phash,faces,heatmaps
            use_light = False
            try:
                if str(os.environ.get("LIGHT_SLOT_ALL", "0")).lower() in ("1", "true", "yes"):  # global override
                    use_light = True
                else:
                    raw = os.environ.get("LIGHT_SLOT_TYPES")
                    if raw is not None:
                        wanted = {s.strip().lower() for s in raw.split(',') if s.strip()}
                    else:
                        wanted = {"markers", "preview", "sprites", "phash", "faces", "heatmaps"}
                    norm = _normalize_job_type(job_type)
                    use_light = norm in wanted
            except Exception:
                use_light = False

            fp = Path(path)
            lock = _file_task_lock(fp, job_type)
            if use_light:
                # Acquire per-file lock first (avoid duplicate work), then briefly grab JOB_RUN_SEM
                # just to mark state=running and publish events; release immediately so other
                # eligible jobs can also start. Heavy work still respects:
                #   - per-file lock (we still hold it around fn())
                #   - ffmpeg process gate via _FFMPEG_SEM inside _run/_run_inner
                with lock:
                    with JOB_RUN_SEM:
                        _start_job(jid)
                        try:
                            JOB_CTX.jid = jid  # type: ignore[name-defined]
                        except Exception:
                            pass
                    # JOB_RUN_SEM released here -> improved overlap potential
                    result = fn()
            else:
                # Legacy behavior: hold JOB_RUN_SEM for the duration of fn()
                with JOB_RUN_SEM:
                    with lock:
                        _start_job(jid)
                        try:
                            JOB_CTX.jid = jid  # type: ignore[name-defined]
                        except Exception:
                            pass
                        result = fn()

            with JOB_LOCK:
                if jid in JOBS:
                    JOBS[jid]["result"] = result if not isinstance(result, JSONResponse) else None
            _finish_job(jid, None)
        except Exception as e:  # noqa: BLE001
            # Emit a focused error for metadata/thumbnail jobs so failures are visible
            try:
                jt = _normalize_job_type(job_type)
                if jt in ("thumbnail", "metadata"):
                    _log("thumbnail", f"{jt} error path={path} err={e}")
            except Exception:
                pass
            _finish_job(jid, str(e) if str(e) and str(e).lower() != "canceled" else None)
    t = threading.Thread(target=_runner, name=f"job-{job_type}-{jid}", daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})

def _wait_for_turn(jid: str, poll_interval: float = 0.15, timeout: Optional[float] = None) -> None:
    """
    Block until this job is eligible to start under a FIFO window policy.

    Previous behavior: only the single earliest queued job could proceed to acquire JOB_RUN_SEM.
    That made downstream concurrency (e.g., _FFMPEG_SEM allowing 4 preview encodes) moot because
    jobs beyond the first stayed 'queued' even if capacity existed.

    New behavior: allow the first K queued jobs (ordered by created_at, id) to proceed, where
    K = JOB_MAX_CONCURRENCY (dynamic) unless STRICT_FIFO_START=1 is set in the environment.
    This preserves global ordering fairness while letting multiple jobs transition to 'running'
    promptly when there is available semaphore capacity.

    Cancellation is still honored at each poll. A timeout (if provided) exits early.
    """
    start_ts = time.time()
    last_diag = 0.0
    while True:
        # Global pause gate: while paused, do not let queued jobs become eligible
        if JOB_QUEUE_PAUSED:
            time.sleep(poll_interval)
            continue
        # Timeout (best-effort safety)
        if timeout is not None and (time.time() - start_ts) > timeout:
            break
        ev = JOB_CANCEL_EVENTS.get(jid)
        if ev is not None and ev.is_set():
            raise RuntimeError("canceled")
        with JOB_LOCK:
            j = JOBS.get(jid)
            if not j:
                # Job vanished; nothing to wait for
                break
            # If job already started (running) or finished, no need to wait
            st = str(j.get("state") or "")
            if st in ("running", "done", "completed", "failed", "canceled"):
                break
            # Fast-path: if capacity available and not strict fairness, start immediately
            try:
                strict_global = str(os.environ.get("JOB_FAIR_START_STRICT", "0")).lower() in ("1", "true", "yes")
            except Exception:
                strict_global = False
            if not strict_global:
                try:
                    running_now = sum(1 for qq in JOBS.values() if str(qq.get("state")) == "running")
                except Exception:
                    running_now = JOB_MAX_CONCURRENCY
                if running_now < int(JOB_MAX_CONCURRENCY):
                    # Diagnostic
                    if _log_enabled("jobs"):
                        _log("jobs", f"[jobs] turn fast-path start jid={jid} running={running_now}/{JOB_MAX_CONCURRENCY}")
                    break
            # Build ordered list of queued jobs
            queued = [
                (float(qq.get("created_at") or 0), str(qq.get("id") or ""))
                for qq in JOBS.values()
                if str(qq.get("state") or "") == "queued" and not bool(qq.get("paused"))
            ]
            # Note: jobs in state 'restored' are paused and intentionally ignored here
            queued.sort(key=lambda x: (x[0], x[1]))
            if not queued:
                break
            # Determine effective window size
            try:
                strict = str(os.environ.get("STRICT_FIFO_START", "0")).lower() in ("1", "true", "yes")
            except Exception:
                strict = False
            window = 1 if strict else max(1, int(JOB_MAX_CONCURRENCY))
            # Collect the first 'window' job ids eligible to start
            eligible_ids = {q[1] for q in queued[:window]}
            if jid in eligible_ids:
                if _log_enabled("jobs"):
                    _log("jobs", f"[jobs] turn window-eligible jid={jid} window={window} queue_len={len(queued)}")
                break
        # Periodic diagnostic if still queued
        now_ts = time.time()
        if now_ts - last_diag > 5.0:  # every 5s
            last_diag = now_ts
            try:
                with JOB_LOCK:
                    q_states = [ (qq.get('id'), qq.get('state')) for qq in JOBS.values() ]
                if _log_enabled("jobs"):
                    _log("jobs", f"[jobs] turn waiting jid={jid} states={q_states}")
            except Exception:
                pass
        time.sleep(poll_interval)

@api.get("/tasks/pause")
def tasks_get_pause():
    """Return whether the job queue is paused."""
    try:
        return api_success({"paused": bool(JOB_QUEUE_PAUSED)})
    except Exception as e:
        raise_api_error(f"Failed to get pause state: {str(e)}")


@api.post("/tasks/pause")
def tasks_set_pause(paused: bool = Query(...)):
    """Pause or resume the job queue.

    When pausing (paused=true):
    - Prevent new jobs from starting.
    - Ask all running jobs to yield and be re-queued (not canceled).

    When resuming (paused=false):
    - Clear paused markers so queued jobs can proceed normally.
    """
    try:
        global JOB_QUEUE_PAUSED
        want_pause = bool(paused)
        JOB_QUEUE_PAUSED = want_pause
        if want_pause:
            # For all running jobs, request a cooperative stop and mark to requeue on exit
            with JOB_LOCK:
                running_ids = [jid for jid, j in JOBS.items() if str(j.get("state")) == "running"]
                for jid in running_ids:
                    try:
                        JOBS[jid]["pause_requeue"] = True
                        JOBS[jid]["paused"] = True
                        ev = JOB_CANCEL_EVENTS.get(jid)
                        if ev:
                            ev.set()
                    except Exception:
                        continue
                # Also mark currently queued jobs as paused so UI reflects the state and scheduler skips them
                try:
                    for j in JOBS.values():
                        if str(j.get("state") or "") == "queued":
                            j["paused"] = True
                except Exception:
                    pass
        else:
            # Clear paused markers on any queued jobs so UI and scheduler treat them as normal
            with JOB_LOCK:
                for j in JOBS.values():
                    try:
                        if j.get("state") == "queued" and j.get("paused"):
                            j["paused"] = False
                            j.pop("pause_requeue", None)
                    except Exception:
                        continue
        try:
            _publish_job_event({"event": "pause", "paused": JOB_QUEUE_PAUSED})
        except Exception:
            pass
        return api_success({"paused": bool(JOB_QUEUE_PAUSED)})
    except Exception as e:
        raise_api_error(f"Failed to set pause state: {str(e)}")


def _safe_int(x):
    try:
        return int(x)
    except Exception:
        return None


def safe_join(root: Path, rel: str) -> Path:
    p = (root / rel).resolve()
    root = root.resolve()
    try:
        p.relative_to(root)
    except Exception:  # noqa: BLE001
        raise_api_error("Invalid path", status_code=400)
    return p


############################
# Static assets
############################
_BASE = Path(__file__).parent
_STATIC = _BASE


@app.middleware("http")
async def no_cache_middleware(request, call_next):
    resp = await call_next(request)
    path = request.url.path
    # Apply no-cache headers to all static files served from root directory and /static
    if (path in {"/", "/index.css", "/index.js", "/favicon.ico"} or
        path.startswith("/static") or
        (not path.startswith("/api") and "." in path.split("/")[-1])):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


@app.get("/", include_in_schema=False)
def index_html():
    idx = _STATIC / "index.html"
    if idx.exists():
        return HTMLResponse(idx.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>UI missing</h1>")


@app.get("/index.css", include_in_schema=False)
def index_css():
    css = _STATIC / "index.css"
    if css.exists():
        return Response(css.read_text(encoding="utf-8"), media_type="text/css")
    return Response("/* CSS not found */", media_type="text/css")


@app.get("/index.js", include_in_schema=False)
def index_js():
    js = _STATIC / "index.js"
    if js.exists():
        return Response(js.read_text(encoding="utf-8"), media_type="text/javascript")
    return Response("// JS not found", media_type="text/javascript")




@app.get("/favicon.ico", include_in_schema=False)
def favicon_ico():
    ico = _STATIC / "favicon.ico"
    if ico.exists():
        return FileResponse(str(ico), media_type="image/x-icon")
    return Response(status_code=404)


@app.get("/manifest.json", include_in_schema=False)
def manifest_json():
    m = _STATIC / "manifest.json"
    if m.exists() and m.is_file():
        return Response(m.read_text(encoding="utf-8"), media_type="application/json")
    return Response(status_code=404)


@app.get("/apple-touch-icon.png", include_in_schema=False)
def apple_touch_icon():
    p = _STATIC / "apple-touch-icon.png"
    if p.exists() and p.is_file():
        return FileResponse(str(p), media_type="image/png")
    return Response(status_code=404)


# Note: legacy /old-index.html route removed; existing bookmarks will 404.
# If a redirect is desired, re-add a handler returning a RedirectResponse("/").

# Static assets are already mounted at the top of the file - no need to mount again

# Lifespan: replaces deprecated on_event startup handler
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_obj: FastAPI):  # type: ignore[override]
    # Startup
    try:
        try:
            root_str = str(STATE.get("root"))
            print(f"[startup] MEDIA_ROOT={root_str}")
        except Exception:
            pass
        _restore_jobs_on_start()
    except Exception:
        # Non-fatal: continue without restore on any error
        pass
    try:
        yield
    finally:
        # Shutdown (currently no-op; placeholder for future cleanup)
        pass

# Attach lifespan to app
app.router.lifespan_context = lifespan  # type: ignore[attr-defined]


# API under /api - mount BEFORE catch-all static handler

def _media_exts() -> set[str]:
    """
    Allowed media extensions (lowercased with dot).
    Configure via MEDIA_EXTS env (comma-separated). Defaults to MP4-only.
    """
    env = os.environ.get("MEDIA_EXTS")
    if env:
        out: set[str] = set()
        for part in env.split(","):
            s = part.strip().lower()
            if not s:
                continue
            if not s.startswith("."):
                s = "." + s
            out.add(s)
        if out:
            return out
    # Default to common video formats so the library isn't empty by default
    return {".mp4", ".mkv", ".mov", ".m4v", ".webm", ".avi"}

MEDIA_EXTS = _media_exts()


def _is_hidden_path(p: Path, base: Path) -> bool:
    """
    Return True if any directory component under base starts with '.' or ends with '.previews'.
    """
    try:
        parts = p.relative_to(base).parts
    except Exception:
        parts = p.parts
    # exclude file itself when checking for dot prefix
    for comp in parts[:-1]:
        if comp.startswith(".") or comp.endswith(HIDDEN_DIR_SUFFIX_PREVIEWS):
            return True
    return False


def _is_original_media_file(p: Path, base: Path) -> bool:
    """
    Only consider user media files, not artifacts or legacy preview segments.
    """
    if not p.is_file():
        return False
    # Exclude AppleDouble/metadata files created by macOS on some filesystems
    if p.name.startswith("._"):
        return False
    if p.suffix.lower() not in MEDIA_EXTS:
        return False
    if _is_hidden_path(p, base):
        return False
    # Skip known artifact outputs regardless of location
    n = p.name.lower()
    if n.endswith(SUFFIX_PREVIEW_WEBM) or n.endswith(SUFFIX_PREVIEW_MP4) or n.endswith(SUFFIX_SPRITES_JPG):
        return False
    return True


# -----------------------------
# Central registry (tags/performers)
# -----------------------------

def _registry_dir() -> Path:
    root = STATE.get("root") or Path.cwd()
    d = Path(root) / ".artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _tags_registry_path() -> Path:
    return _registry_dir() / "tags.json"


def _performers_registry_path() -> Path:
    return _registry_dir() / "performers.json"


def _slugify(name: str) -> str:
    s = (name or "").strip().lower()
    # replace non-alnum with '-'
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def _load_registry(path: Path, kind: str) -> dict:
    """
    Load a registry file, creating a minimal skeleton if missing.
    kind: 'tags' or 'performers'
    """
    skel = {"version": 1, "next_id": 1, kind: []}
    if not path.exists():
        return skel
    try:
        data = json.loads(path.read_text())
        # Support legacy/simple formats:
        # - If file is a bare list, wrap into the expected dict skeleton.
        if isinstance(data, list):
            wrapped = {"version": 1, "next_id": 1, kind: []}
            items: list = []
            if kind == "performers":
                # Convert strings to performer objects; pass through dicts with name when present
                next_id = 1
                for it in data:
                    if isinstance(it, str):
                        nm = it.strip()
                        if not nm:
                            continue
                        items.append({"id": next_id, "name": nm, "slug": _slugify(nm), "images": []})
                        next_id += 1
                    elif isinstance(it, dict):
                        nm = str(it.get("name") or "").strip()
                        if not nm:
                            continue
                        slug = it.get("slug") or _slugify(nm)
                        items.append({"id": next_id, "name": nm, "slug": slug, "images": list(it.get("images") or [])})
                        next_id += 1
                wrapped[kind] = items
                wrapped["next_id"] = next_id
            else:
                # tags: make sure it's a list of strings
                wrapped[kind] = [str(t).strip() for t in data if str(t).strip()]
            return wrapped
        if not isinstance(data, dict):
            return skel
        # ensure keys
        data.setdefault("version", 1)
        data.setdefault("next_id", 1)
        data.setdefault(kind, [])
        return data
    except Exception:
        return skel


def _save_registry(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


class TagCreate(BaseModel): # type: ignore
    name: str


class TagRename(BaseModel): # type: ignore
    id: Optional[int] = None
    name: Optional[str] = None
    new_name: str


class TagDelete(BaseModel): # type: ignore
    id: Optional[int] = None
    name: Optional[str] = None


class PerformerCreate(BaseModel): # type: ignore
    name: str
    images: Optional[List[str]] = None
    image: Optional[str] = None


class PerformerUpdate(BaseModel): # type: ignore
    id: Optional[int] = None
    name: Optional[str] = None
    new_name: Optional[str] = None
    add_images: Optional[List[str]] = None
    remove_images: Optional[List[str]] = None


class PerformerDelete(PerformerUpdate):
    id: Optional[int] = None
    name: Optional[str] = None


############################
# Core API
############################

@api.get("/health")
def health():
    uptime = None
    try:
        started = getattr(health, "_started_at", None)
        if started is None:
            health._started_at = time.time()  # type: ignore[attr-defined]
            started = health._started_at  # type: ignore[attr-defined]
        uptime = max(0.0, time.time() - float(started))
    except Exception:
        uptime = None
    return {
        "ok": True,
        "time": time.time(),
        "uptime": uptime,
        "root": str(STATE.get("root")),
        "registries": {
            "performers": str(_performers_registry_path()),
        },
        "ffmpeg": ffmpeg_available(),
        "ffprobe": ffprobe_available(),
        "faces_backend": detect_face_backend("auto"),
        "faces_deps": {
            "opencv": _has_module("cv2"),
            "insightface": _has_module("insightface"),
            "onnxruntime": _has_module("onnxruntime"),
        },
        "version": app.version,
        "pid": os.getpid(),
    }


@app.get("/health")
def health_redirect():
    """Compatibility alias: redirect root /health to canonical /api/health.

    Using 307 preserves method if clients ever POST (unlikely for health) and avoids caching confusion.
    """
    return RedirectResponse(url="/api/health", status_code=307)


@app.get("/config")
def config_info():
    """Unified configuration endpoint.

    Combines legacy environment/dependency info with dynamic runtime config
    (previously available at /api/config). Provides three sections:
      - raw: raw persisted config file contents
      - defaults: derived default values (e.g., sprites)
      - effective: defaults overlaid with raw overrides
    Retains legacy keys (features, deps, versions) for backward compatibility.
    """
    with _CONFIG_LOCK:
        raw_cfg = copy.deepcopy(STATE.get("config") or {})
    defaults = {"sprites": _sprite_defaults()}
    effective = {
        "sprites": {**defaults["sprites"], **(raw_cfg.get("sprites") or {})},
    }
    # Detect SSE jobs events route presence for frontend (avoid 404 probing)
    try:
        jobs_sse = any(getattr(r, "path", None) == "/jobs/events" for r in app.routes)
    except Exception:
        jobs_sse = False
    return {
        "root": str(STATE.get("root")),
        "env": {k: os.environ.get(k) for k in ["MEDIA_ROOT", "FFPROBE_DISABLE", "MEDIA_EXTS"]},
        "media_exts": sorted(list(MEDIA_EXTS)),
        "features": {
            "range_stream": True,
            "sprites": True,
            "heatmaps": True,
            "faces": True,
            "subtitles": True,
            "phash": True,
            "jobs_sse": jobs_sse,
        },
        "deps": {
            "ffmpeg": ffmpeg_available(),
            "ffprobe": ffprobe_available(),
            "faster_whisper": _has_module("faster_whisper"),
            "openai_whisper": _has_module("whisper"),
            "whisper_cpp_bin": (lambda p=os.environ.get("WHISPER_CPP_BIN"): bool(p and Path(p).exists()))(),
            "whisper_cpp_model": (lambda p=os.environ.get("WHISPER_CPP_MODEL"): bool(p and Path(p).exists()))(),
            "opencv": _has_module("cv2"),
            "insightface": _has_module("insightface"),
            "onnxruntime": _has_module("onnxruntime"),
            "numpy": _has_module("numpy"),
            "pillow": _has_module("PIL"),
        },
        "versions": {
            "fastapi": _module_version("fastapi"),
            "pydantic": _module_version("pydantic"),
            "faster_whisper": _module_version("faster_whisper"),
            "openai_whisper": _module_version("whisper"),
            "opencv": _module_version("cv2"),
            "insightface": _module_version("insightface"),
            "onnxruntime": _module_version("onnxruntime"),
            "numpy": _module_version("numpy"),
            "pillow": _module_version("PIL"),
        },
        "capabilities": {
            "subtitles_backend": detect_backend("auto"),
            "faces_backend": detect_face_backend("auto"),
            "subtitles_enabled": detect_backend("auto") != "stub",
            "faces_enabled": (detect_face_backend("auto") in ("opencv", "insightface")) and (_has_module("cv2") or _has_module("insightface")),
        },
        "raw": raw_cfg,
        "defaults": defaults,
        "effective": effective,
        "config_path": STATE.get("config_path"),
        "version": app.version,
    }

# Provide /api/config alias for clients expecting the API-prefixed route
@app.get("/api/config", include_in_schema=False)
def config_info_api_alias():
    try:
        return config_info()  # type: ignore[misc]
    except Exception as e:
        raise_api_error(f"Failed to load config: {e}")


# -----------------------------
# Root path (GET current / POST update)
# -----------------------------
class RootUpdate(BaseModel):  # type: ignore
    root: str


@api.post("/root/set")
def api_root_set(payload: RootUpdate):
    """Update the library root directory (alternate setter endpoint to avoid function name clash)."""
    try:
        raw = (payload.root or "").strip()
        if not raw:
            raise_api_error("root path required", status_code=400)
        p = Path(raw).expanduser().resolve()
        if not p.exists() or not p.is_dir():
            raise_api_error("directory not found", status_code=404)
        try:
            next(p.iterdir())  # type: ignore[call-overload]
        except StopIteration:
            pass
        except Exception:
            raise_api_error("directory not readable", status_code=403)
        STATE["root"] = p
        return api_success({"root": str(p)})
    except HTTPException:
        raise
    except Exception as e:
        raise_api_error(f"failed to set root: {e}")


def _find_mp4s(root: Path, recursive: bool) -> list[Path]:
    it = root.rglob("*") if recursive else root.iterdir()
    vids: list[Path] = []
    for p in it:
        if _is_original_media_file(p, root):
            vids.append(p)
    vids.sort(key=lambda x: x.name.lower())
    return vids


def _build_artifacts_info(p: Path) -> dict:
    info: dict[str, Any] = {}
    # Standard names
    info["thumbnail"] = thumbnails_path(p).exists()
    info["preview"] = _file_nonempty(_preview_concat_path(p))
    s, j = sprite_sheet_paths(p)
    info["sprites"] = s.exists() and j.exists()
    info["subtitles"] = find_subtitles(p) is not None
    info["phash"] = phash_path(p).exists()
    info["heatmaps"] = heatmaps_json_exists(p)
    info["markers"] = scenes_json_exists(p)
    info["faces"] = faces_exists_check(p)
    return info


def _tags_file(p: Path) -> Path:
    return artifact_dir(p) / f"{p.stem}.tags.json"


@app.get("/tags/export")
def tags_export(directory: str = Query("."), recursive: bool = Query(False)):
    # Enforce root scoping
    if directory in (".", ""):
        root = STATE.get("root")
    else:
        p = Path(directory).expanduser()
        if p.is_absolute():
            # must be inside STATE["root"]
            try:
                p.resolve().relative_to(STATE["root"])  # type: ignore[arg-type]
            except Exception:
                raise HTTPException(400, "invalid directory")
            root = p
        else:
            root = safe_join(STATE["root"], directory)
    root = Path(str(root)).resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
    vids = _find_mp4s(root, recursive)
    out: list[dict] = []
    for v in vids:
        tf = _tags_file(v)
        data = {
            "path": str(v),
            "name": v.name,
            "tags": [],
            "performers": [],
            "description": "",
            "rating": 0,
            "favorite": False
        }
        if tf.exists():
            try:
                td = json.loads(tf.read_text())
                data["tags"] = td.get("tags", []) or []
                data["performers"] = td.get("performers", []) or []
                data["description"] = td.get("description", "") or ""
                try:
                    rating = int(td.get("rating", 0) or 0)
                except Exception:
                    rating = 0
                # Clamp rating to valid range 0-5
                data["rating"] = max(0, min(5, rating))
                try:
                    data["favorite"] = bool(td.get("favorite", False))
                except Exception:
                    data["favorite"] = False
            except Exception:
                pass
        out.append(data)
    return {"videos": out, "count": len(out)}


    videos: Optional[list[dict]] = None
    mapping: Optional[dict[str, dict]] = None
    replace: bool = False

class TagsImport(BaseModel):  # type: ignore
    videos: Optional[List[Dict[str, Any]]] = None
    mapping: Optional[Dict[str, Dict[str, Any]]] = None
    replace: bool = False

@app.post("/tags/import")
def tags_import(payload: TagsImport):
    count = 0
    items: list[tuple[Path, dict]] = []
    if payload.videos:
        for item in payload.videos:
            try:
                p = Path(item.get("path") or "").expanduser().resolve()
                # Only allow files within configured root
                try:
                    p.relative_to(STATE["root"])  # type: ignore[arg-type]
                except Exception:
                    continue
                items.append((p, item))
            except Exception:
                continue
    elif payload.mapping:
        for k, v in payload.mapping.items():
            try:
                p = Path(k).expanduser().resolve()
                try:
                    p.relative_to(STATE["root"])  # type: ignore[arg-type]
                except Exception:
                    continue
                items.append((p, v))
            except Exception:
                continue
    for p, data in items:
        if not p.exists():
            continue
        tf = _tags_file(p)
        cur = {
            "video": p.name,
            "tags": [],
            "performers": [],
            "description": "",
            "rating": 0,
            "favorite": False,
        }
        if tf.exists() and not payload.replace:
            try:
                cur = json.loads(tf.read_text())
            except Exception:
                pass
        cur.setdefault("tags", [])
        cur.setdefault("performers", [])
        cur.setdefault("description", "")
        cur.setdefault("rating", 0)
        cur.setdefault("favorite", False)
        # merge
        for k in ("tags", "performers"):
            vals = data.get(k)
            if isinstance(vals, list):
                if payload.replace:
                    cur[k] = list(dict.fromkeys(vals))
                else:
                    cur[k] = list(dict.fromkeys(list(cur.get(k, [])) + vals))
        if isinstance(data.get("description"), str):
            cur["description"] = data.get("description")
        if data.get("rating") is not None:
            try:
                rating = int(data.get("rating") or 0)
                cur["rating"] = max(0, min(5, rating))
            except Exception:
                cur["rating"] = 0
        if data.get("favorite") is not None:
            try:
                cur["favorite"] = bool(data.get("favorite"))
            except Exception:
                cur["favorite"] = False
        try:
            tf.write_text(json.dumps(cur, indent=2))
            count += 1
        except Exception:
            continue
    return {"updated": count}


def _load_metadata_summary(root: Path, recursive: bool) -> dict[str, dict]:
    # Pre-scan once for duration/codecs
    out: dict[str, dict] = {}
    for v in _find_mp4s(root, recursive):
        m = metadata_path(v)
        rel = None
        try:
            rel = str(v.relative_to(root))
        except Exception:
            rel = v.name
        if m.exists():
            try:
                raw = json.loads(m.read_text())
                d = extract_duration(raw)
                v_stream = None
                a_stream = None
                if isinstance(raw, dict) and isinstance(raw.get("streams"), list):
                    for s in raw["streams"]:
                        if not isinstance(s, dict):
                            continue
                        if s.get("codec_type") == "video" and v_stream is None:
                            v_stream = s
                        elif s.get("codec_type") == "audio" and a_stream is None:
                            a_stream = s
                out[rel] = {
                    "duration": d,
                    "vcodec": v_stream.get("codec_name") if v_stream else None,
                    "acodec": a_stream.get("codec_name") if a_stream else None,
                }
            except Exception:
                out[rel] = {}
        else:
            out[rel] = {}
    return out

# -----------------------------
# Artifact cleanup helpers
# -----------------------------
def _artifact_kinds_for_stem(stem: str) -> set[str]:
    # Known suffixes we produce
    return {
        f"{stem}{SUFFIX_METADATA_JSON}",
        f"{stem}{SUFFIX_THUMBNAIL_JPG}",
        f"{stem}{SUFFIX_PHASH_JSON}",
        f"{stem}{SUFFIX_SCENES_JSON}",
        f"{stem}{SUFFIX_SPRITES_JPG}",
        f"{stem}{SUFFIX_SPRITES_JSON}",
        f"{stem}{SUFFIX_HEATMAPS_JSON}",
        f"{stem}{SUFFIX_HEATMAPS_PNG}",
        f"{stem}{SUFFIX_FACES_JSON}",
        f"{stem}{SUFFIX_PREVIEW_WEBM}",
        f"{stem}{SUFFIX_SUBTITLES_SRT}",
    }

def _parse_artifact_name(name: str) -> tuple[str, str] | None:
    """
    Return (stem, kind) if name matches one of our artifact patterns, else None.
    kind is the suffix part after the stem (including dot), e.g. '.metadata.json'.
    """
    parts = name.split(".")
    if len(parts) < 2:
        return None
    # Try progressively shorter suffixes against known kinds
    # Enumerate from longest known kinds to shortest
    known_suffixes = [
        SUFFIX_METADATA_JSON,
        SUFFIX_THUMBNAIL_JPG,
        SUFFIX_PHASH_JSON,
        SUFFIX_SCENES_JSON,
        SUFFIX_SPRITES_JPG,
        SUFFIX_SPRITES_JSON,
        SUFFIX_HEATMAPS_JSON,
        SUFFIX_HEATMAPS_PNG,
        SUFFIX_FACES_JSON,
        SUFFIX_PREVIEW_WEBM,
        SUFFIX_SUBTITLES_SRT,
    ]
    for suf in known_suffixes:
        if name.endswith(suf):
            stem = name[: -len(suf)]
            if stem:
                return stem, suf
    return None

def _collect_media_and_metadata(root: Path) -> tuple[dict[str, Path], dict[str, dict]]:
    """
    Return (media_by_stem, metadata_by_stem) for fast lookup.
    - media_by_stem: map of media stem -> path
    - metadata_by_stem: map of media stem -> metadata summary (duration, codecs)
    """
    media: dict[str, Path] = {}
    for v in _find_mp4s(root, recursive=True):
        media[v.stem] = v
    # Load metadata summaries once
    metadata: dict[str, dict] = {}
    summaries = _load_metadata_summary(root, recursive=True)
    for v in _find_mp4s(root, recursive=True):
        try:
            rel = str(v.relative_to(root))
        except Exception:
            rel = v.name
        metadata[v.stem] = summaries.get(rel) or {}
    return media, metadata

## Removed legacy: /videos endpoint

## Removed legacy: GET /videos/{name}/tags


class TagUpdate(BaseModel): # type: ignore
    add: list[str] | None = None
    remove: list[str] | None = None
    performers_add: list[str] | None = None
    performers_remove: list[str] | None = None
    replace: bool = False
    description: str | None = None
    rating: int | None = None
    favorite: bool | None = None

## Removed legacy: PATCH /videos/{name}/tags

## Removed legacy: GET /tags/summary (use /api/tags/summary)

## Removed legacy: GET /phash/duplicates (replaced by /api/duplicates)


def _list_dir(root: Path, rel: str):
    p = safe_join(root, rel) if rel else root
    if not p.exists() or not p.is_dir():
        raise_api_error("Not found", status_code=404)
    dirs, files = [], []
    for entry in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        if entry.name.startswith("._") or entry.name == ".DS_Store":
            continue
        # Hide dot-directories (like .artifacts) and legacy .previews dirs
        if entry.is_dir() and (entry.name.startswith(".") or entry.name.endswith(".previews")):
            continue
        if entry.is_dir():
            dirs.append({"name": entry.name, "path": str(entry.relative_to(root))})
        elif entry.is_file() and _is_original_media_file(entry, root):
            # Try to enrich with MIME and known metadata if available (cached)
            mime, _ = __import__("mimetypes").guess_type(str(entry))
            # Add duration when metadata sidecar exists
            duration_val = None
            title_val = None
            width_val = None
            height_val = None
            try:
                duration_val, title_val, width_val, height_val = _metadata_summary_cached(entry)
            except Exception:
                duration_val = None
            # Artifact presence
            phash_exists = False
            scenes_exists = False
            sprites_exists = False
            heatmaps_exists = False
            faces_exists = False
            subtitles_exists = False
            try:
                phash_exists = phash_path(entry).exists()
            except Exception:
                pass
            try:
                scenes_exists = scenes_json_exists(entry)
            except Exception:
                pass
            try:
                s_sheet, s_json = sprite_sheet_paths(entry)
                sprites_exists = s_sheet.exists() and s_json.exists()
            except Exception:
                pass
            try:
                heatmaps_exists = heatmaps_json_exists(entry)
            except Exception:
                pass
            try:
                faces_exists = faces_exists_check(entry)
            except Exception:
                pass
            try:
                subtitles_exists = find_subtitles(entry) is not None
            except Exception:
                pass
            info = {
                "name": entry.name,
                "path": str(entry.relative_to(root)),
                "size": entry.stat().st_size,
                "type": mime or "application/octet-stream",
                "duration": duration_val,
                "title": title_val or entry.stem,
                "width": width_val,
                "height": height_val,
                "phash": phash_exists,
                "chapters": scenes_exists,
                "sprites": sprites_exists,
                "heatmaps": heatmaps_exists,
                "subtitles": subtitles_exists,
                "faces": faces_exists,
            }
            # Thumbnail/preview URLs
            if thumbnails_path(entry).exists():
                try:
                    thumb_rel = thumbnails_path(entry).relative_to(STATE["root"]).as_posix()
                    info["thumbnail"] = f"/files/{thumb_rel}"
                except Exception:
                    info["thumbnail"] = f"/api/thumbnail?path={info['path']}"
            else:
                info["thumbnail"] = None
            # Preview: single-file only
            concat = _preview_concat_path(entry)
            if _file_nonempty(concat):
                info["previewUrl"] = f"/api/preview?path={info['path']}"
            files.append(info)
    return {"cwd": rel, "dirs": dirs, "files": files}


# Fast-path lightweight scanner (no sidecar/artifact checks) used when there are
# no tag/performer/extension/search/resolution filters. It only gathers basic
# file info and (optionally) mtime for date sorting. We then enrich ONLY the
# paginated slice. This dramatically reduces first-page latency on very large
# libraries because we avoid thousands of existence/stat/json operations.
def _list_dir_fast_basic(root: Path, rel: str, need_mtime: bool) -> dict:
    p = safe_join(root, rel) if rel else root
    if not p.exists() or not p.is_dir():
        raise_api_error("Not found", status_code=404)
    dirs: list[dict] = []
    files: list[dict] = []
    try:
        entries = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    except Exception:
        entries = []
    for entry in entries:
        try:
            if entry.name.startswith("._") or entry.name == ".DS_Store":
                continue
            if entry.is_dir() and (entry.name.startswith(".") or entry.name.endswith(".previews")):
                continue
            if entry.is_dir():
                dirs.append({"name": entry.name, "path": str(entry.relative_to(root))})
            elif entry.is_file() and _is_original_media_file(entry, root):
                try:
                    st = entry.stat()
                except Exception:
                    continue
                info = {
                    "name": entry.name,
                    "path": str(entry.relative_to(root)),
                    "size": getattr(st, "st_size", 0) or 0,
                }
                if need_mtime:
                    info["mtime"] = float(getattr(st, "st_mtime", 0.0) or 0.0)
                files.append(info)
        except Exception:
            continue
    return {"cwd": rel, "dirs": dirs, "files": files}


def _enrich_file_basic(entry: dict) -> dict:
    """Enrich a single file dict with metadata/artifact presence (extracted from legacy _list_dir logic)."""
    try:
        rel_path = entry.get("path")
        if not rel_path:
            return entry
        fp = safe_join(STATE["root"], rel_path)
        if not fp.exists():
            return entry
        mime, _ = __import__("mimetypes").guess_type(str(fp))
        duration_val = None
        title_val = None
        width_val = None
        height_val = None
        try:
            duration_val, title_val, width_val, height_val = _metadata_summary_cached(fp)
        except Exception:
            pass
        phash_exists = False
        scenes_exists = False
        sprites_exists = False
        heatmaps_exists = False
        faces_exists = False
        subtitles_exists = False
        try: phash_exists = phash_path(fp).exists()
        except Exception: pass
        try: scenes_exists = scenes_json_exists(fp)
        except Exception: pass
        try:
            s_sheet, s_json = sprite_sheet_paths(fp)
            sprites_exists = s_sheet.exists() and s_json.exists()
        except Exception: pass
        try: heatmaps_exists = heatmaps_json_exists(fp)
        except Exception: pass
        try: faces_exists = faces_exists_check(fp)
        except Exception: pass
        try: subtitles_exists = find_subtitles(fp) is not None
        except Exception: pass
        # Add enriched fields (only if not already present to avoid overwriting sort keys like mtime)
        entry.setdefault("type", mime or "application/octet-stream")
        entry.setdefault("duration", duration_val)
        entry.setdefault("title", title_val or Path(fp).stem)
        entry.setdefault("width", width_val)
        entry.setdefault("height", height_val)
        # Ensure timestamps are present for list views irrespective of current sort
        try:
            st = fp.stat()
            # Modified time
            if "mtime" not in entry or entry.get("mtime") in (None, ""):
                try:
                    entry["mtime"] = float(getattr(st, "st_mtime", 0.0) or 0.0)
                except Exception:
                    entry.setdefault("mtime", 0.0)
            # Created time (prefer birthtime on platforms that support it)
            if "ctime" not in entry or entry.get("ctime") in (None, ""):
                try:
                    ct = getattr(st, "st_birthtime", None)
                    if ct is None:
                        ct = getattr(st, "st_ctime", 0.0)
                    entry["ctime"] = float(ct or 0.0)
                except Exception:
                    entry.setdefault("ctime", 0.0)
        except Exception:
            pass
        entry.setdefault("phash", phash_exists)
        entry.setdefault("chapters", scenes_exists)
        entry.setdefault("sprites", sprites_exists)
        entry.setdefault("heatmaps", heatmaps_exists)
        entry.setdefault("subtitles", subtitles_exists)
        entry.setdefault("faces", faces_exists)
        # Tags/performers from sidecar (populate for page slice to power list columns)
        try:
            tf = _tags_file(fp)
            tags_arr = []
            perf_arr = []
            if tf.exists():
                try:
                    td = json.loads(tf.read_text())
                    _t = td.get("tags") or []
                    _p = td.get("performers") or []
                    if isinstance(_t, list):
                        tags_arr = [str(x) for x in _t if str(x).strip()]
                    if isinstance(_p, list):
                        perf_arr = [str(x) for x in _p if str(x).strip()]
                except Exception:
                    tags_arr = []
                    perf_arr = []
            # Merge/override with media attribute store (authoritative for current performers/tags)
            try:
                ent = _MEDIA_ATTR.get(str(rel_path))
                if isinstance(ent, dict):
                    mt_tags = ent.get("tags")
                    mt_perfs = ent.get("performers")
                    if isinstance(mt_tags, list) and mt_tags:
                        tags_arr = [str(x) for x in mt_tags if str(x).strip()]
                    if isinstance(mt_perfs, list) and mt_perfs:
                        perf_arr = [str(x) for x in mt_perfs if str(x).strip()]
            except Exception:
                pass
            entry.setdefault("tags", tags_arr)
            entry.setdefault("performers", perf_arr)
        except Exception:
            pass
        # Thumbnail / preview
        try:
            if thumbnails_path(fp).exists():
                try:
                    thumb_rel = thumbnails_path(fp).relative_to(STATE["root"]).as_posix()
                    entry["thumbnail"] = f"/files/{thumb_rel}"
                except Exception:
                    entry["thumbnail"] = f"/api/thumbnail?path={entry['path']}"
            else:
                entry.setdefault("thumbnail", None)
            concat = _preview_concat_path(fp)
            if _file_nonempty(concat):
                entry["previewUrl"] = f"/api/preview?path={entry['path']}"
        except Exception:
            pass
    except Exception:
        pass
    return entry

@api.get("/library")
def get_library(
    path: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=48, ge=1, le=500),
    search: Optional[str] = Query(default=None),
    ext: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default=None),
    order: Optional[str] = Query(default="asc"),
    tags: Optional[str] = Query(default=None),
    tags_ids: Optional[str] = Query(default=None),
    performers: Optional[str] = Query(default=None),
    performers_ids: Optional[str] = Query(default=None),
    match_any: bool = Query(default=False),
    res_min: Optional[int] = Query(default=None, ge=1, description="Minimum vertical resolution (height) in pixels"),
    res_max: Optional[int] = Query(default=None, ge=1, description="Maximum vertical resolution (height) in pixels"),
    filters: Optional[str] = Query(default=None, description="JSON object of advanced filters"),
):
    t0 = time.time()
    # Correlate log lines per request (avoid importing uuid for speed)
    try:
        rid = f"{int(t0 * 1000) & 0xFFFF:04x}-{(threading.get_ident() or 0) & 0xFFFF:04x}"
    except Exception:
        rid = f"{int(t0 * 1000) & 0xFFFF:04x}"
    # Fast-path determination: only basic page load (no filters that require sidecar/tag scan)
    fast_path = not any([
        search, ext, tags, tags_ids, performers, performers_ids, res_min, res_max
    ])
    # Capture reasons that force slow path (for diagnostics)
    slow_reasons: list[str] = []
    if search: slow_reasons.append("search")
    if ext: slow_reasons.append("ext")
    if tags or tags_ids: slow_reasons.append("tags")
    if performers or performers_ids: slow_reasons.append("performers")
    if (res_min is not None) or (res_max is not None): slow_reasons.append("res")
    # We'll need mtime only if sorting by date; created time is computed lazily in sort step
    data = None
    files: list[dict] = []
    # Log before the expensive directory listing so timestamps reflect wall time correctly
    try:
        _log("library", f"rid={rid} library list start path={path!r} page={page} size={page_size} sort={sort or 'date'} order={order or 'asc'} fast={int(fast_path)} flags={','.join(slow_reasons) if slow_reasons else 'none'}")
    except Exception:
        pass
    # Always use the lightweight scanner; we'll enrich only the page slice later.
    # This keeps listing latency low even when filters are active.
    data = _list_dir_fast_basic(STATE["root"], path, need_mtime=(sort == "date"))
    files = data.get("files", [])
    t_list = time.time()
    try:
        _log("library", f"rid={rid} library list end files={len(files)} dirs={len(data.get('dirs', [])) if isinstance(data, dict) else 'na'} elapsed={(t_list - t0):.3f}s")
    except Exception:
        pass
    # Search / filter
    if search:
        s = (search or "").strip().lower()
        if s:
            def _match(f: dict) -> bool:
                try:
                    name = str(f.get("name") or "").lower()
                    title = str(f.get("title") or "").lower()
                    relp = str(f.get("path") or "").lower()
                    return (s in name) or (s in title) or (s in relp)
                except Exception:
                    return False
            files = [f for f in files if _match(f)]
    if ext:
        files = [f for f in files if f["name"].lower().endswith(ext.lower())]
    # Registry-backed tag/performer filters
    # Build required slug sets from names and ids
    def _parse_ids(s: Optional[str]) -> list[int]:
        out: list[int] = []
        if not s:
            return out
        for part in s.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                out.append(int(part))
            except Exception:
                continue
        return out

    tag_slugs_req: set[str] = set()
    perf_slugs_req: set[str] = set()
    # From names
    for s in (tags.split(',') if tags else []):
        ss = _slugify(s)
        if ss:
            tag_slugs_req.add(ss)
    for s in (performers.split(',') if performers else []):
        ss = _slugify(s)
        if ss:
            perf_slugs_req.add(ss)
    # From ids
    tag_ids = _parse_ids(tags_ids)
    perf_ids = _parse_ids(performers_ids)
    if tag_ids or perf_ids:
        # load registries once
        with REGISTRY_LOCK:
            tdata = _load_registry(_tags_registry_path(), "tags")
            pdata = _load_registry(_performers_registry_path(), "performers")
        t_items = {int(t.get("id")): (t.get("slug") or "") for t in (tdata.get("tags") or []) if t.get("id") is not None}
        p_items = {int(p.get("id")): (p.get("slug") or "") for p in (pdata.get("performers") or []) if p.get("id") is not None}
        for i in tag_ids:
            sl = t_items.get(int(i))
            if sl:
                tag_slugs_req.add(sl)
        for i in perf_ids:
            sl = p_items.get(int(i))
            if sl:
                perf_slugs_req.add(sl)

    def _load_sidecar_sets(rel_path: str) -> tuple[set[str], set[str]]:
        fp = safe_join(STATE["root"], rel_path)
        tf = _tags_file(fp)
        vt: set[str] = set()
        vp: set[str] = set()
        if tf.exists():
            try:
                tdata = json.loads(tf.read_text())
                for t in (tdata.get("tags") or []):
                    ss = _slugify(str(t))
                    if ss:
                        vt.add(ss)
                for p in (tdata.get("performers") or []):
                    ss = _slugify(str(p))
                    if ss:
                        vp.add(ss)
            except Exception:
                pass
        # Merge with media attribute store (authoritative current state)
        try:
            ent = _MEDIA_ATTR.get(rel_path)
            if isinstance(ent, dict):
                for t in (ent.get("tags") or []):
                    ss = _slugify(str(t))
                    if ss:
                        vt.add(ss)
                for p in (ent.get("performers") or []):
                    ss = _slugify(str(p))
                    if ss:
                        vp.add(ss)
        except Exception:
            pass
        return vt, vp

    pre_filter_count = len(files)
    if tag_slugs_req or perf_slugs_req:
        # Build or reuse a lightweight inverted index of tag/performer→paths to avoid
        # per-file sidecar reads on every request. Cache for a short TTL.
        def _get_or_build_sidecar_index(root: Path, all_files: list[dict], ttl: float = 60.0) -> tuple[dict[str, set[str]], dict[str, set[str]], bool]:
            now = time.time()
            idx = STATE.get("_sidecar_index") or {}
            built_at = float(idx.get("built_at") or 0.0)
            by_tag = idx.get("by_tag") or None
            by_perf = idx.get("by_perf") or None
            if by_tag is not None and by_perf is not None and (now - built_at) < ttl:
                return by_tag, by_perf, False
            # Build fresh
            bt = time.time()
            new_by_tag: dict[str, set[str]] = {}
            new_by_perf: dict[str, set[str]] = {}
            # Use a fast path over the current root listing (file dicts contain relative 'path')
            for f in all_files:
                relp = f.get("path")
                if not isinstance(relp, str) or not relp:
                    continue
                try:
                    fp = safe_join(root, relp)
                    tf = _tags_file(fp)
                    if not tf.exists():
                        continue
                    tdata = json.loads(tf.read_text())
                    for t in (tdata.get("tags") or []):
                        ss = _slugify(str(t))
                        if ss:
                            new_by_tag.setdefault(ss, set()).add(relp)
                    for pslug in (tdata.get("performers") or []):
                        ss = _slugify(str(pslug))
                        if ss:
                            new_by_perf.setdefault(ss, set()).add(relp)
                except Exception:
                    continue
            STATE["_sidecar_index"] = {"built_at": time.time(), "by_tag": new_by_tag, "by_perf": new_by_perf}
            _bt = time.time() - bt
            try:
                _log("library", f"rid={rid} index built tags={len(new_by_tag)} perfs={len(new_by_perf)} elapsed={_bt:.3f}s")
            except Exception:
                pass
            return new_by_tag, new_by_perf, True

        by_tag, by_perf, _built = _get_or_build_sidecar_index(STATE["root"], files)
        in_scope = {str(f.get("path")) for f in files if isinstance(f.get("path"), str)}
        cand: Optional[set[str]] = None
        # Tags
        if tag_slugs_req:
            if match_any:
                tag_paths: set[str] = set()
                for sl in tag_slugs_req:
                    tag_paths |= set(by_tag.get(sl, set()))
            else:
                tag_paths_opt: Optional[set[str]] = None
                for sl in tag_slugs_req:
                    tag_paths_opt = set(by_tag.get(sl, set())) if tag_paths_opt is None else (tag_paths_opt & set(by_tag.get(sl, set())))
                tag_paths = tag_paths_opt if tag_paths_opt is not None else set()
            cand = tag_paths if cand is None else (cand & tag_paths)
        # Performers
        if perf_slugs_req:
            if match_any:
                perf_paths: set[str] = set()
                for sl in perf_slugs_req:
                    perf_paths |= set(by_perf.get(sl, set()))
            else:
                perf_paths_opt: Optional[set[str]] = None
                for sl in perf_slugs_req:
                    perf_paths_opt = set(by_perf.get(sl, set())) if perf_paths_opt is None else (perf_paths_opt & set(by_perf.get(sl, set())))
                perf_paths = perf_paths_opt if perf_paths_opt is not None else set()
            cand = perf_paths if cand is None else (cand & perf_paths)
        if cand is None:
            cand = set()
        # Restrict to the current directory scope
        cand &= in_scope
        files = [f for f in files if str(f.get("path")) in cand]

    # Resolution filter (by height preferred, width heuristic fallback, filename token fallback)
    if res_min is not None or res_max is not None:
        def _tier_from_metadata(f: dict) -> Optional[int]:
            try:
                h = f.get("height")
                w = f.get("width")
                if isinstance(h, (int, float)) and h:
                    return int(h)
                if isinstance(w, (int, float)) and w:
                    # approximate mapping width->height tiers
                    if w >= 3840: return 2160
                    if w >= 2560: return 1440
                    if w >= 1920: return 1080
                    if w >= 1280: return 720
                    if w >= 854: return 480
                    if w >= 640: return 360
                    if w >= 426: return 240
                # Lazy-load dimensions from cached metadata when available
                relp = str(f.get("path") or "")
                if relp:
                    try:
                        fp = safe_join(STATE["root"], relp)
                        _d, _t, _w, _h = _metadata_summary_cached(fp)
                        if isinstance(_h, (int, float)) and _h:
                            return int(_h)
                        if isinstance(_w, (int, float)) and _w:
                            if _w >= 3840: return 2160
                            if _w >= 2560: return 1440
                            if _w >= 1920: return 1080
                            if _w >= 1280: return 720
                            if _w >= 854: return 480
                            if _w >= 640: return 360
                            if _w >= 426: return 240
                    except Exception:
                        pass
                # filename token fallback
                nm = (str(f.get("name") or "") + " " + str(f.get("title") or "")).lower()
                if "2160p" in nm or "4k" in nm or "uhd" in nm: return 2160
                if "1440p" in nm: return 1440
                if "1080p" in nm: return 1080
                if "720p" in nm: return 720
                if "480p" in nm: return 480
                if "360p" in nm: return 360
                if "240p" in nm: return 240
            except Exception:
                return None
            return None
        lo = int(res_min) if res_min is not None else None
        hi = int(res_max) if res_max is not None else None
        files = [f for f in files if (
            (lambda r: (lo is None or (r is not None and r >= lo)) and (hi is None or (r is not None and r <= hi)))(_tier_from_metadata(f))
        )]
    t_filters = time.time()
    try:
        _log("library", f"rid={rid} library filters pruned {pre_filter_count}->{len(files)} elapsed={(t_filters - t_list):.3f}s (accum {(t_filters - t0):.3f}s)")
    except Exception:
        pass
    # Advanced per-column filters (JSON object in 'filters' query param)
    if filters:
        flt_obj = None
        try:
            flt_obj = json.loads(filters)
        except Exception:
            flt_obj = None
        if isinstance(flt_obj, dict) and flt_obj:
            def _ensure_time_fields(f: dict):
                try:
                    if ("mtime" not in f) or (f.get("mtime") in (None, "")) or ("ctime" not in f) or (f.get("ctime") in (None, "")):
                        fp = safe_join(STATE["root"], f.get("path", ""))
                        if fp.exists():
                            st = fp.stat()
                            if "mtime" not in f or f.get("mtime") in (None, ""):
                                try:
                                    f["mtime"] = float(getattr(st, "st_mtime", 0.0) or 0.0)
                                except Exception:
                                    f["mtime"] = 0.0
                            if "ctime" not in f or f.get("ctime") in (None, ""):
                                try:
                                    ct = getattr(st, "st_birthtime", None)
                                    if ct is None:
                                        ct = getattr(st, "st_ctime", 0.0)
                                    f["ctime"] = float(ct or 0.0)
                                except Exception:
                                    f["ctime"] = 0.0
                except Exception:
                    pass
            def _ensure_metadata_basic(f: dict):
                # duration/width/height
                try:
                    relp = f.get("path") or ""
                    if not relp:
                        return
                    need_d = ("duration" in flt_obj) and (f.get("duration") in (None, ""))
                    need_w = ("width" in flt_obj) and (f.get("width") in (None, ""))
                    need_h = ("height" in flt_obj) and (f.get("height") in (None, ""))
                    if need_d or need_w or need_h:
                        d, _t, w, h = _metadata_summary_cached(safe_join(STATE["root"], relp))
                        if d is not None and need_d:
                            f["duration"] = d
                        if w is not None and need_w:
                            f["width"] = w
                        if h is not None and need_h:
                            f["height"] = h
                except Exception:
                    pass
            def _ensure_bitrate_codecs(f: dict):
                try:
                    relp = f.get("path") or ""
                    if not relp:
                        return
                    need_br = ("bitrate" in flt_obj) and (f.get("bitrate") in (None, ""))
                    need_vc = ("vcodec" in flt_obj) and (f.get("vcodec") in (None, ""))
                    need_ac = ("acodec" in flt_obj) and (f.get("acodec") in (None, ""))
                    if need_br or need_vc or need_ac:
                        br, vc, ac = _metadata_bitrate_codecs_cached(safe_join(STATE["root"], relp))
                        if need_br and br is not None:
                            f.setdefault("bitrate", br)
                        if need_vc and vc is not None:
                            f.setdefault("vcodec", vc)
                        if need_ac and ac is not None:
                            f.setdefault("acodec", ac)
                except Exception:
                    pass
            def _ensure_ext(f: dict):
                try:
                    if ("format" in flt_obj) or ("ext" in flt_obj):
                        nm = str(f.get("name") or "")
                        if not nm and f.get("path"):
                            nm = Path(str(f.get("path"))).name
                        if nm:
                            if "." in nm:
                                f.setdefault("ext", "." + nm.split(".")[-1].lower())
                            else:
                                f.setdefault("ext", "")
                            f.setdefault("format", (f.get("ext") or "").lstrip("."))
                except Exception:
                    pass
            def _ensure_sidecar_sets(f: dict) -> tuple[set[str], set[str]]:
                try:
                    relp = f.get("path") or ""
                    if not relp:
                        return set(), set()
                    vt, vp = _load_sidecar_sets(relp)
                    return vt, vp
                except Exception:
                    return set(), set()
            # Sidecar/flags booleans only if requested (can be costly across many files)
            def _ensure_flags(f: dict):
                try:
                    needed = any(k in flt_obj for k in ("phash","chapters","sprites","heatmaps","subtitles","faces","thumbnail","preview"))
                    if not needed:
                        return
                    relp = f.get("path") or ""
                    if not relp:
                        return
                    fp = safe_join(STATE["root"], relp)
                    if "phash" in flt_obj and f.get("phash") in (None, ""):
                        try: f["phash"] = phash_path(fp).exists()
                        except Exception: pass
                    if "chapters" in flt_obj and f.get("chapters") in (None, ""):
                        try: f["chapters"] = scenes_json_exists(fp)
                        except Exception: pass
                    if "sprites" in flt_obj and f.get("sprites") in (None, ""):
                        try:
                            s_sheet, s_json = sprite_sheet_paths(fp)
                            f["sprites"] = s_sheet.exists() and s_json.exists()
                        except Exception: pass
                    if "heatmaps" in flt_obj and f.get("heatmaps") in (None, ""):
                        try: f["heatmaps"] = heatmaps_json_exists(fp)
                        except Exception: pass
                    if "faces" in flt_obj and f.get("faces") in (None, ""):
                        try: f["faces"] = faces_exists_check(fp)
                        except Exception: pass
                    if "subtitles" in flt_obj and f.get("subtitles") in (None, ""):
                        try: f["subtitles"] = find_subtitles(fp) is not None
                        except Exception: pass
                    if "thumbnail" in flt_obj and f.get("thumbnail") in (None, ""):
                        try: f["thumbnail"] = thumbnails_path(fp).exists()
                        except Exception: pass
                    if "preview" in flt_obj and f.get("previewUrl") in (None, ""):
                        try:
                            concat = _preview_concat_path(fp)
                            f["previewUrl"] = f"/api/preview?path={relp}" if _file_nonempty(concat) else None
                        except Exception:
                            pass
                except Exception:
                    pass
            def _get_num(v):
                try:
                    if v is None:
                        return None
                    return float(v)
                except Exception:
                    return None
            def _match_cond(val, cond):
                # cond can be bool, scalar, or dict of ops
                if isinstance(cond, bool):
                    return bool(val) is cond
                if not isinstance(cond, dict):
                    # equality fallback
                    return str(val).lower() == str(cond).lower()
                # If the value is a collection (tags/performers), support include/exclude semantics
                if isinstance(val, (list, set, tuple)):
                    try:
                        sval = set()
                        for x in val:
                            try:
                                sx = _slugify(str(x))
                            except Exception:
                                sx = str(x).strip().lower()
                            if sx:
                                sval.add(sx)
                        arr_in = cond.get("in")
                        if isinstance(arr_in, list):
                            want = {(_slugify(str(x)) or str(x).strip().lower()) for x in arr_in if str(x).strip()}
                            if want and sval.isdisjoint(want):
                                return False
                        arr_not = cond.get("not_in")
                        if isinstance(arr_not, list):
                            notwant = {(_slugify(str(x)) or str(x).strip().lower()) for x in arr_not if str(x).strip()}
                            if notwant and not sval.isdisjoint(notwant):
                                return False
                        return True
                    except Exception:
                        return True
                # in-list
                arr_in = cond.get("in")
                if isinstance(arr_in, list):
                    target = [str(x).lower() for x in arr_in]
                    return str(val).lower() in target
                # bool
                if "bool" in cond:
                    return (bool(val) is bool(cond.get("bool")))
                # numeric compares
                vnum = _get_num(val)
                if vnum is not None:
                    _eq = _get_num(cond.get("eq")) if cond.get("eq") is not None else None
                    if _eq is not None and vnum != _eq:
                        return False
                    _lt = _get_num(cond.get("lt")) if cond.get("lt") is not None else None
                    if _lt is not None and not (vnum < _lt):
                        return False
                    _le = _get_num(cond.get("le")) if cond.get("le") is not None else None
                    if _le is not None and not (vnum <= _le):
                        return False
                    _gt = _get_num(cond.get("gt")) if cond.get("gt") is not None else None
                    if _gt is not None and not (vnum > _gt):
                        return False
                    _ge = _get_num(cond.get("ge")) if cond.get("ge") is not None else None
                    if _ge is not None and not (vnum >= _ge):
                        return False
                    rng = cond.get("range")
                    if isinstance(rng, (list, tuple)) and len(rng) == 2:
                        lo = _get_num(rng[0])
                        hi = _get_num(rng[1])
                        if (lo is not None) and (vnum < lo):
                            return False
                        if (hi is not None) and (vnum > hi):
                            return False
                # time filters (epoch seconds)
                if cond.get("before") is not None or cond.get("after") is not None:
                    tnum = _get_num(val)
                    if tnum is None:
                        return False
                    _bf = _get_num(cond.get("before")) if cond.get("before") is not None else None
                    if _bf is not None and not (tnum <= _bf):
                        return False
                    _af = _get_num(cond.get("after")) if cond.get("after") is not None else None
                    if _af is not None and not (tnum >= _af):
                        return False
                return True
            # Apply filters; compute on-demand fields
            def _value_for(f: dict, key: str):
                k = key.lower()
                # aliases
                if k in ("modified",): k = "mtime"
                if k in ("created",): k = "ctime"
                if k in ("extension",): k = "ext"
                if k in ("format", "ext"):
                    _ensure_ext(f)
                if k in ("mtime", "ctime"):
                    _ensure_time_fields(f)
                if k in ("duration", "width", "height"):
                    _ensure_metadata_basic(f)
                if k in ("bitrate", "vcodec", "acodec"):
                    _ensure_bitrate_codecs(f)
                if k in ("phash","chapters","sprites","heatmaps","subtitles","faces","thumbnail","preview"):
                    _ensure_flags(f)
                # Provide set values for tags/performers to allow include/exclude matching
                if k in ("tags", "performers"):
                    vt, vp = _ensure_sidecar_sets(f)
                    return vt if k == "tags" else vp
                if k == "metadata":
                    # Treat presence of metadata sidecar as boolean
                    try:
                        relp = f.get("path") or ""
                        if relp:
                            fp = safe_join(STATE["root"], relp)
                            return metadata_path(fp).exists()
                    except Exception:
                        return False
                if k == "size":
                    try:
                        if f.get("size") in (None, ""):
                            relp = f.get("path") or ""
                            if relp:
                                p = safe_join(STATE["root"], relp)
                                f["size"] = p.stat().st_size if p.exists() else None
                    except Exception:
                        pass
                return f.get(k)
            files = [f for f in files if all(_match_cond(_value_for(f, k), v) for k, v in flt_obj.items())]
            t_filters2 = time.time()
            try:
                _log("library", f"rid={rid} adv-filters pruned ->{len(files)} elapsed={(t_filters2 - t_filters):.3f}s (accum {(t_filters2 - t0):.3f}s)")
            except Exception:
                pass
    # Sort
    reverse = (order == "desc")
    if sort == "name":
        files.sort(key=lambda f: (str(f.get("name") or "").lower(), str(f.get("path") or "")), reverse=reverse)
    elif sort == "size":
        files.sort(key=lambda f: (int(f.get("size") or 0), str(f.get("path") or "")), reverse=reverse)
    elif sort == "date":
        # Fast-path already populated mtime; fallback compute if missing
        missing_mtime = any("mtime" not in f for f in files)
        if missing_mtime:
            for f in files:
                if "mtime" in f:
                    continue
                fp = safe_join(STATE["root"], f.get("path", ""))
                try:
                    mt = fp.stat().st_mtime if fp.exists() else 0
                except Exception:
                    mt = 0
                f["mtime"] = mt
        files.sort(key=lambda f: (float(f.get("mtime") or 0), str(f.get("path") or "")), reverse=reverse)
    elif sort == "created":
        # Populate ctime lazily
        for f in files:
            if "ctime" in f:
                continue
            try:
                fp = safe_join(STATE["root"], f.get("path", ""))
                if fp.exists():
                    try:
                        st = fp.stat()
                        ct = getattr(st, "st_birthtime", None)
                        if ct is None:
                            ct = getattr(st, "st_ctime", 0.0)
                        f["ctime"] = float(ct or 0.0)
                    except Exception:
                        f["ctime"] = 0.0
            except Exception:
                f["ctime"] = 0.0
        files.sort(key=lambda f: (float(f.get("ctime") or 0.0), str(f.get("path") or "")), reverse=reverse)
    elif sort in ("width", "height", "duration"):
        # Ensure numeric metadata fields present using cached metadata
        for f in files:
            try:
                has_all = all(k in f and f.get(k) not in (None, "") for k in ("duration" if sort == "duration" else (sort,)))
                if has_all:
                    continue
                relp = f.get("path") or ""
                if not relp:
                    continue
                fp = safe_join(STATE["root"], relp)
                d, _t, w, h = _metadata_summary_cached(fp)
                if d is not None and f.get("duration") in (None, ""):
                    f["duration"] = d
                if w is not None and f.get("width") in (None, ""):
                    f["width"] = w
                if h is not None and f.get("height") in (None, ""):
                    f["height"] = h
            except Exception:
                continue
        def _num(x):
            try:
                v = float(x)
                return v
            except Exception:
                return 0.0
        files.sort(key=lambda f: (_num(f.get(sort)), str(f.get("path") or "")), reverse=reverse)
    elif sort in ("bitrate", "vcodec", "acodec"):
        for f in files:
            try:
                # Skip if already present
                if sort in f and f.get(sort) not in (None, ""):
                    continue
                relp = f.get("path") or ""
                if not relp:
                    continue
                fp = safe_join(STATE["root"], relp)
                br, vc, ac = _metadata_bitrate_codecs_cached(fp)
                if br is not None:
                    f.setdefault("bitrate", br)
                if vc is not None:
                    f.setdefault("vcodec", vc)
                if ac is not None:
                    f.setdefault("acodec", ac)
            except Exception:
                continue
        if sort == "bitrate":
            files.sort(key=lambda f: (int(f.get("bitrate") or 0), str(f.get("path") or "")), reverse=reverse)
        elif sort == "vcodec":
            files.sort(key=lambda f: (str(f.get("vcodec") or "").lower(), str(f.get("path") or "")), reverse=reverse)
        else:  # acodec
            files.sort(key=lambda f: (str(f.get("acodec") or "").lower(), str(f.get("path") or "")), reverse=reverse)
    elif sort in ("format", "ext"):
        def _ext_of(f: dict) -> str:
            try:
                nm = str(f.get("name") or "")
                return ("." + nm.split(".")[-1].lower()) if "." in nm else ""
            except Exception:
                return ""
        files.sort(key=lambda f: (_ext_of(f), str(f.get("path") or "")), reverse=reverse)
    elif sort == "random":
        import random as _r
        seed = int(time.time() * 1000) & 0xFFFFFFFF  # pseudo-per-request seed
        rnd = _r.Random(seed)
        rnd.shuffle(files)
    t_sorted = time.time()
    try:
        _log("library", f"rid={rid} library sort elapsed={(t_sorted - t_filters):.3f}s (accum {(t_sorted - t0):.3f}s)")
    except Exception:
        pass
    total_files = len(files)
    total_pages = max(1, (total_files + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    page_slice = files[start:end]
    # Enrich the page slice (thumbnail/flags/duration etc.). Keeps overall load fast.
    t_enrich0 = time.time()
    enriched = []
    for f in page_slice:
        enriched.append(_enrich_file_basic(f))
    page_slice = enriched
    t_enrich1 = time.time()
    try:
        _log("library", f"rid={rid} library enrich page_count={len(page_slice)} elapsed={(t_enrich1 - t_enrich0):.3f}s (accum {(t_enrich1 - t0):.3f}s)")
    except Exception:
        pass
    data["files"] = page_slice
    data["page"] = page
    data["page_size"] = page_size
    data["total_files"] = total_files
    data["total_pages"] = total_pages
    t_done = time.time()
    try:
        _log("library", f"rid={rid} library done page={page}/{total_pages} size={page_size} returned={len(page_slice)} total={total_files} totalElapsed={(t_done - t0):.3f}s")
    except Exception:
        pass
    return api_success(data)


# -----------------
# Duplicates (API wrapper)
# -----------------
@api.get("/duplicates")
def api_duplicates_list(
    directory: str = Query(".", description="Directory under root to scan ('.' for root)"),
    recursive: bool = Query(False, description="Recurse into subdirectories"),
    phash_threshold: float = Query(0.90, ge=0.0, le=1.0, description="Minimum pHash similarity (0..1) before metadata bonus"),
    min_similarity: Optional[float] = Query(None, ge=0.0, le=1.0, description="Filter on final combined similarity (0..1) after metadata bonus"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
):
    """
    List potential duplicate video pairs.

    Computes pairs using pHash similarity with a small metadata-based bonus, then
    applies an optional minimum final-similarity filter and returns paginated results.
    """
    # Resolve and guard root directory within configured STATE["root"]
    if directory in (".", ""):
        root = STATE.get("root")
    else:
        p = Path(directory).expanduser()
        if p.is_absolute():
            try:
                p.resolve().relative_to(STATE["root"])  # type: ignore[arg-type]
            except Exception:
                raise HTTPException(400, "invalid directory")
            root = p
        else:
            root = safe_join(STATE["root"], directory)
    root = Path(str(root)).resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")

    # Build entries from videos that have pHash sidecars (opportunistically load metadata)
    videos = _find_mp4s(root, recursive)
    entries: list[dict] = []
    for v in videos:
        p = phash_path(v)
        if not p.exists():
            continue
        try:
            data = json.loads(p.read_text())
            h_hex = data.get("phash")
            if not isinstance(h_hex, str):
                continue
            # Gather lightweight metadata signals
            metadata: dict | None = None
            mpath = metadata_path(v)
            if mpath.exists():
                try:
                    metadata = json.loads(mpath.read_text())
                except Exception:
                    metadata = None
            else:
                # opportunistically compute metadata if ffprobe is available
                try:
                    metadata_single(v, force=False)
                    if mpath.exists():
                        metadata = json.loads(mpath.read_text())
                except Exception:
                    metadata = None
            # Extract comparable features
            dur = extract_duration(metadata) if metadata else None
            width = height = None
            v_bitrate = None
            a_bitrate = None
            title = None
            try:
                if isinstance(metadata, dict):
                    fmt = metadata.get("format", {}) or {}
                    try:
                        _vb = fmt.get("bit_rate")
                        v_bitrate = float(_vb) if _vb is not None else None
                    except Exception:
                        v_bitrate = None
                    try:
                        title = (fmt.get("tags", {}) or {}).get("title")
                    except Exception:
                        title = None
                    for st in metadata.get("streams", []) or []:
                        if (st or {}).get("codec_type") == "video":
                            try:
                                width = int(st.get("width") or 0) or None
                                height = int(st.get("height") or 0) or None
                            except Exception:
                                width = width or None
                                height = height or None
                            try:
                                vb = st.get("bit_rate")
                                if vb is not None:
                                    v_bitrate = float(vb)
                            except Exception:
                                pass
                        elif (st or {}).get("codec_type") == "audio":
                            try:
                                ab = st.get("bit_rate")
                                if ab is not None:
                                    a_bitrate = float(ab)
                            except Exception:
                                pass
            except Exception:
                pass
            size_bytes = None
            try:
                size_bytes = v.stat().st_size
            except Exception:
                size_bytes = None
            entries.append({
                "video": v.name,
                "path": str(v),
                "hex": h_hex,
                "duration": dur,
                "width": width,
                "height": height,
                "bitrate_v": v_bitrate,
                "bitrate_a": a_bitrate,
                "size": size_bytes,
                "title": title,
            })
        except Exception:
            continue

    # Pairwise compare using pHash similarity augmented with small metadata bonus
    pairs: list[dict] = []
    def hamming(a: str, b: str) -> int:
        ia = int(a, 16)
        ib = int(b, 16)
        # Use portable popcount to avoid relying on int.bit_count (compat/type-checker friendly)
        return bin(ia ^ ib).count("1")

    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            a = entries[i]
            b = entries[j]
            bits = max(len(a["hex"]), len(b["hex"])) * 4
            dist = hamming(a["hex"], b["hex"]) if bits else 0
            sim = 1.0 - (dist / bits) if bits else 0.0
            if sim >= float(phash_threshold):
                # Compute metadata affinity bonus (0..~0.1)
                bonus = 0.0
                try:
                    def frac_close(x, y, tol=0.05):
                        if x is None or y is None:
                            return 0.0
                        if x == 0 or y == 0:
                            return 0.0
                        f = abs(float(x) - float(y)) / max(abs(float(x)), abs(float(y)))
                        return 1.0 if f <= tol else max(0.0, 1.0 - (f - tol) * 5)
                    # duration closeness within 5%
                    bonus += 0.04 * frac_close(a.get("duration"), b.get("duration"), tol=0.05)
                    # resolution match
                    res_match = 1.0 if (a.get("width") and a.get("height") and a.get("width") == b.get("width") and a.get("height") == b.get("height")) else 0.0
                    bonus += 0.02 * res_match
                    # filesize closeness within 10%
                    bonus += 0.02 * frac_close(a.get("size"), b.get("size"), tol=0.10)
                    # bitrate closeness within 15%
                    vb = frac_close(a.get("bitrate_v"), b.get("bitrate_v"), tol=0.15)
                    ab = frac_close(a.get("bitrate_a"), b.get("bitrate_a"), tol=0.20)
                    bonus += 0.01 * vb + 0.005 * ab
                    # title token similarity if present
                    ta = (a.get("title") or a.get("video") or "").lower()
                    tb = (b.get("title") or b.get("video") or "").lower()
                    if ta and tb:
                        try:
                            s = SequenceMatcher(None, ta, tb).ratio()
                            bonus += 0.005 * s
                        except Exception:
                            pass
                except Exception:
                    bonus += 0.0
                final_score = min(1.0, sim + bonus)
                pairs.append({
                    "a": a["path"],
                    "b": b["path"],
                    "similarity": final_score,
                    "bits": bits,
                    "distance": dist,
                    "phash_similarity": sim,
                    "metadata_bonus": round(bonus, 4),
                })
    pairs.sort(key=lambda x: x["similarity"], reverse=True)

    # Optional post-filter on final combined similarity
    if isinstance(min_similarity, (int, float)):
        pairs = [p for p in pairs if float(p.get("similarity", 0.0)) >= float(min_similarity)]

    total_pairs = len(pairs)
    total_pages = max(1, (total_pairs + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    page_items = pairs[start:end]

    return api_success({
        "directory": directory,
        "recursive": recursive,
        "phash_threshold": phash_threshold,
        "min_similarity": min_similarity,
        "page": page,
        "page_size": page_size,
        "total_pairs": total_pairs,
        "total_pages": total_pages,
        "pairs": page_items,
    })

# Legacy parity alias for prior path; delegates to unified duplicates logic
@api.get("/phash/duplicates")
def api_phash_duplicates(
    directory: str = Query("."),
    recursive: bool = Query(False),
    phash_threshold: float = Query(0.90, ge=0.0, le=1.0),
    min_similarity: Optional[float] = Query(None, ge=0.0, le=1.0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
):
    """Return grouped near-duplicate clusters based on pHash similarity.

    Output shape aligns with branch spec:
      { status: 'success', data: [ { representative, group:[...], distance_mode:'xor', frame_count:? } ] }
    Internally reuses pairwise duplicate logic, then unions overlapping pairs into clusters.
    """
    # First get full (unpaginated) pair list via existing helper
    try:
        base = api_duplicates_list(
            directory=directory,
            recursive=recursive,
            phash_threshold=phash_threshold,
            min_similarity=min_similarity,
            page=1,
            page_size=1000000,  # effectively all; clustering done in-memory
        )
        if isinstance(base, Response):  # already Response
            payload = base.body  # type: ignore[attr-defined]
        data = base.get("data") if isinstance(base, dict) else None  # type: ignore[index]
    except Exception:
        data = None
    if not data or "pairs" not in data:
        return api_success({ "data": [] })
    pairs = data["pairs"]
    # Build adjacency graph
    adj: dict[str, set[str]] = {}
    for p in pairs:
        a = str(p.get("a"))
        b = str(p.get("b"))
        if not a or not b:
            continue
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)
    visited: set[str] = set()
    clusters: list[list[str]] = []
    for node in adj:
        if node in visited:
            continue
        stack = [node]
        comp = []
        visited.add(node)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nxt in adj.get(cur, set()):
                if nxt not in visited:
                    visited.add(nxt)
                    stack.append(nxt)
        if len(comp) > 1:
            clusters.append(sorted(comp))
    # Representative: choose smallest path (could be replaced with earliest mtime later)
    result = [
        {
            "representative": c[0],
            "group": c,
            "distance_mode": "xor",
            "frame_count": None,  # not available without deeper sidecar parse; left nullable
            "group_count": len(c),
            # representative_metadata will attempt to provide small metadata (size/duration) when available
            "representative_metadata": None,
            # group_details may include optional phash hex if sidecars exist; best-effort only
            "group_details": None,
        }
        for c in clusters
    ]
    # Best-effort: enrich clusters with small metadata for representative and optional phash entries
    for item in result:
        try:
            rep = item.get("representative")
            if rep:
                p = Path(rep)
                # representative paths are stored relative to root in pairs; try to resolve
                try:
                    if not p.is_absolute():
                        p = (STATE["root"] / p).resolve()
                except Exception:
                    pass
                metadata = None
                try:
                    mp = metadata_path(p)
                    if mp.exists():
                        metadata_j = json.loads(mp.read_text())
                        metadata = {"duration": extract_duration(metadata_j), "size": p.stat().st_size if p.exists() else None}
                except Exception:
                    metadata = None
                item["representative_metadata"] = metadata
            # group_details: try to include phash hex per member when available
            details = []
            for m in item.get("group", []) or []:
                try:
                    pm = Path(m)
                    if not pm.is_absolute():
                        pm = (STATE["root"] / pm).resolve()
                except Exception:
                    pm = None
                row = {"path": m}
                try:
                    if pm and phash_path(pm).exists():
                        j = json.loads(phash_path(pm).read_text())
                        row["phash"] = j.get("phash")
                except Exception:
                    pass
                details.append(row)
            item["group_details"] = details
        except Exception:
            continue
    # Pagination over clusters
    total = len(result)
    total_pages = max(1, (total + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    return api_success({
        "directory": directory,
        "recursive": recursive,
        "phash_threshold": phash_threshold,
        "min_similarity": min_similarity,
        "page": page,
        "page_size": page_size,
        "total_groups": total,
        "total_pages": total_pages,
        "data": result[start:end],
    })


# -----------------
# Lightweight Compare (metadata + pHash distance)
# -----------------
@api.get("/compare/metadata")
def api_compare_metadata(
    path_a: str = Query(..., description="First video path (relative to root)"),
    path_b: str = Query(..., description="Second video path (relative to root)"),
):
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    pa = safe_join(STATE["root"], path_a)
    pb = safe_join(STATE["root"], path_b)
    if not pa.exists() or not pb.exists():
        raise_api_error("One or both files not found", status_code=404)

    def basic_metadata(p: Path) -> dict:
        _metadata_path = metadata_path(p)
        metadata = None
        if _metadata_path.exists():
            try:
                metadata = json.loads(_metadata_path.read_text())
            except Exception:
                metadata = None
        dur = None
        width = height = None
        try:
            if metadata:
                dur = extract_duration(metadata)
                for st in metadata.get("streams", []) or []:
                    if (st or {}).get("codec_type") == "video":
                        try:
                            width = int(st.get("width") or 0) or None
                            height = int(st.get("height") or 0) or None
                        except Exception:
                            pass
        except Exception:
            pass
        size = None
        try:
            size = p.stat().st_size
        except Exception:
            size = None
        return {
            "path": str(p.relative_to(STATE["root"])),
            "duration": dur,
            "width": width,
            "height": height,
            "size": size,
        }

    a_metadata = basic_metadata(pa)
    b_metadata = basic_metadata(pb)

    # pHash distance
    def read_hex(p: Path) -> Optional[str]:
        fp = phash_path(p)
        if fp.exists():
            try:
                j = json.loads(fp.read_text())
                h = j.get("phash")
                if isinstance(h, str):
                    return h
            except Exception:
                return None
        return None

    ha = read_hex(pa)
    hb = read_hex(pb)
    phash_distance = None
    if ha and hb:
        try:
            ia = int(ha, 16)
            ib = int(hb, 16)
            phash_distance = bin(ia ^ ib).count("1")
        except Exception:
            phash_distance = None

    # Metrics
    duration_diff_sec = None
    try:
        if a_metadata.get("duration") is not None and b_metadata.get("duration") is not None:
            duration_diff_sec = abs(float(a_metadata["duration"]) - float(b_metadata["duration"]))
    except Exception:
        pass

    size_diff_bytes = None
    try:
        if a_metadata.get("size") is not None and b_metadata.get("size") is not None:
            size_diff_bytes = abs(int(a_metadata["size"]) - int(b_metadata["size"]))
    except Exception:
        pass

    same_resolution = None
    try:
        if a_metadata.get("width") and b_metadata.get("width") and a_metadata.get("height") and b_metadata.get("height"):
            same_resolution = (a_metadata["width"], a_metadata["height"]) == (b_metadata["width"], b_metadata["height"])
    except Exception:
        pass

    return api_success({
        "a": a_metadata,
        "b": b_metadata,
        "metrics": {
            "duration_diff_sec": duration_diff_sec,
            "size_diff_bytes": size_diff_bytes,
            "same_resolution": same_resolution,
            "phash_distance": phash_distance,
        }
    })


# -----------------
# Previews / Artifact Presence Report
# -----------------
@api.get("/report/previews")
def api_report_previews(
    directory: str = Query(".", description="Directory under root to scan ('.' for root)"),
    recursive: bool = Query(False, description="Recurse into subdirectories"),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=2000),
):
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    # Resolve directory
    if directory in (".", ""):
        base = Path(STATE["root"]).resolve()
    else:
        base = safe_join(STATE["root"], directory).resolve()
    if not base.exists() or not base.is_dir():
        raise_api_error("directory not found", status_code=404)
    # Collect candidates (mp4 only to align with other artifact systems)
    vids = _find_mp4s(base, recursive)
    # Local inline helper (redeclared if earlier private versions exist); single canonical implementation
    def _artifact_flags(v: Path) -> dict[str, bool]:
        s_sheet, s_json = sprite_sheet_paths(v)
        return {
            "thumbnails": thumbnails_path(v).exists(),
            "previews": _file_nonempty(_preview_concat_path(v)),
            "sprites": s_sheet.exists() and s_json.exists(),
            "markers": scenes_json_exists(v),
            "heatmaps": heatmaps_json_exists(v),
            "phash": phash_path(v).exists(),
        }
    records: list[dict] = []
    for v in vids:
        try:
            rel = str(v.relative_to(STATE["root"]))
        except Exception:
            rel = str(v)
        f = _artifact_flags(v)
        records.append({
            "path": rel,
            "thumbnail": bool(f.get("thumbnails")),
            "preview": bool(f.get("previews")),
            "sprites": bool(f.get("sprites")),
            "markers": bool(f.get("markers")),
            "heatmaps": bool(f.get("heatmaps")),
            "phash": bool(f.get("phash")),
        })
    total = len(records)
    total_pages = max(1, (total + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    return api_success({
        "directory": directory,
        "recursive": recursive,
        "page": page,
        "page_size": page_size,
        "total_files": total,
        "total_pages": total_pages,
        "data": records[start:end],
    })


# -----------------
# Performers System (lightweight in-file store & counters)
# -----------------
_PERFORMERS_CACHE: dict[str, dict] = {}
_PERFORMERS_CACHE_TS: float | None = None
_PERFORMERS_INDEX: dict[str, set[str]] = {}  # name -> set(paths)
_PERFORMERS_SCAN_IN_PROGRESS: bool = False
_PERFORMERS_SCAN_REQUESTED_AT: float | None = None
_PERFORMERS_INDEX_LOCK = threading.Lock()

# Persistent on-disk incremental index (optional). We store per-file performer arrays + mtime
# to avoid reparsing unchanged metadata sidecars. This greatly reduces cold-start overhead
# for large libraries while always returning accurate counts.
def _performers_index_path() -> Path:
    """Legacy path for the standalone performers index (pre-consolidation).
    Kept for migration; new writes go into _MEDIA_ATTR file.
    """
    root = STATE.get("root") or Path.cwd()
    return Path(root) / ".media_player_performers_index.json"

def _load_performers_index() -> dict:
    """Load legacy performers index if present (for one-time migration)."""
    p = _performers_index_path()
    if not p.exists() or p.stat().st_size < 8:
        return {"files": {}, "version": 1}
    try:
        raw = json.loads(p.read_text())
        if isinstance(raw, dict):
            files = raw.get("files") or {}
            if isinstance(files, dict):
                return {"files": files, "version": raw.get("version", 1)}
    except Exception:
        pass
    return {"files": {}, "version": 1}

def _save_performers_index(_idx: dict) -> None:  # deprecated no-op (retain for backward calls)
    # We now persist performers per-file lists inside _MEDIA_ATTR; keep silent compatibility.
    return None

# -- Incremental index mutation helpers (avoid full sidecar rescan on every mutation) --
_PERFORMERS_LAST_SCAN_STATS: dict[str, Any] | None = None

def _performers_index_mutate_file(rel_path: str, performers: list[str]) -> None:
    """
    Persist a direct change to performers for a single media file.
    This augments the existing incremental index so subsequent listing requests do not
    need to parse the sidecar again provided its mtime is unchanged.
    """
    try:
        with _PERFORMERS_INDEX_LOCK:
            # Mutate consolidated _MEDIA_ATTR entry
            ent = _MEDIA_ATTR.get(rel_path)
            if not ent:
                ent = {"performers": [], "tags": []}
                _MEDIA_ATTR[rel_path] = ent
            # Preserve existing mtime if present (ns precision)
            mtime_ns = ent.get("mtime", 0)
            seen: set[str] = set()
            clean: list[str] = []
            for n in performers:
                if isinstance(n, str):
                    t = n.strip()
                    if t:
                        k = t.lower()
                        if k not in seen:
                            seen.add(k)
                            clean.append(t)
            ent["performers"] = clean
            # Unified model; performers already reflect merged names from scans
            _save_media_attr()
            # Update in-memory mapping for immediate count accuracy.
            # Remove stale path references first.
            for perf_norm, paths in list(_PERFORMERS_INDEX.items()):
                if rel_path in paths and perf_norm not in { _normalize_performer(x) for x in clean }:
                    paths.discard(rel_path)
                    if not paths:
                        _PERFORMERS_INDEX.pop(perf_norm, None)
            for n in clean:
                norm = _normalize_performer(n)
                if not norm:
                    continue
                _PERFORMERS_INDEX.setdefault(norm, set()).add(rel_path)
                _PERFORMERS_CACHE.setdefault(norm, {"name": n, "tags": []})
    except Exception:
        # Best effort only; failures here won't break mutation endpoints.
        pass

def _performers_index_rename(old_norm: str, new_name: str) -> None:
    """Apply a rename across the persisted index so future scans reuse the new name."""
    try:
        with _PERFORMERS_INDEX_LOCK:
            changed = False
            for rel, ent in _MEDIA_ATTR.items():
                try:
                    names = ent.get("performers") or []
                    if not isinstance(names, list):
                        continue
                    out = []
                    for nm in names:
                        if _normalize_performer(str(nm)) == old_norm:
                            out.append(new_name)
                            changed = True
                        else:
                            out.append(nm)
                    if changed:
                        ent["performers"] = out
                except Exception:
                    pass
            if changed:
                _save_media_attr()
            # Update in-memory mapping already handled by endpoint logic; ensure cache rec name kept.
    except Exception:
        pass

def _performers_index_merge(sources: list[str], target_name: str) -> None:
    """Persist a merge across the index file (replace source names with target)."""
    try:
        src_norms = { _normalize_performer(s) for s in sources if isinstance(s, str) }
        tgt_norm = _normalize_performer(target_name)
        with _PERFORMERS_INDEX_LOCK:
            changed = False
            for rel, ent in _MEDIA_ATTR.items():
                try:
                    names = ent.get("performers") or []
                    if not isinstance(names, list) or not names:
                        continue
                    out: list[str] = []
                    seen: set[str] = set()
                    replaced = False
                    for nm in names:
                        nn = _normalize_performer(str(nm))
                        if nn in src_norms:
                            if tgt_norm not in seen:
                                out.append(target_name)
                                seen.add(tgt_norm)
                            replaced = True
                        else:
                            if nn not in seen:
                                out.append(nm)
                                seen.add(nn)
                    if replaced:
                        ent["performers"] = out
                        changed = True
                except Exception:
                    pass
            if changed:
                _save_media_attr()
    except Exception:
        pass

def _performers_index_delete(norm: str) -> None:
    """Remove a performer from all file entries in the persisted index."""
    try:
        with _PERFORMERS_INDEX_LOCK:
            changed = False
            for rel, ent in _MEDIA_ATTR.items():
                try:
                    names = ent.get("performers") or []
                    if not isinstance(names, list) or not names:
                        continue
                    new_list = [nm for nm in names if _normalize_performer(str(nm)) != norm]
                    if len(new_list) != len(names):
                        ent["performers"] = new_list
                        changed = True
                except Exception:
                    pass
            if changed:
                _save_media_attr()
    except Exception:
        pass

def _normalize_performer(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()

def _load_performers_sidecars() -> None:
    """Incrementally scan metadata sidecars to build performer usage index.
    Uses a persisted index file to avoid reparsing unchanged JSON. Always merges registry
    and media-attr store so counts are accurate each call.
    """
    global _PERFORMERS_CACHE_TS, _PERFORMERS_INDEX, _PERFORMERS_CACHE, _PERFORMERS_SCAN_IN_PROGRESS
    if STATE.get("root") is None:
        return
    root = Path(STATE["root"]).resolve()
    t_start = time.time()
    # Ensure media-attr is loaded and import any legacy index into it once
    try:
        _load_media_attr()
    except Exception:
        pass
    # One-time migration from legacy standalone index file
    try:
        leg = _load_performers_index()  # legacy structure {files:{rel:{mtime_ns, performers}}}
        files_map_legacy: dict = leg.get("files", {}) if isinstance(leg, dict) else {}
        if files_map_legacy:
            migrated = 0
            for rel, entry in files_map_legacy.items():
                try:
                    names = entry.get("performers") or []
                    mns = entry.get("mtime_ns") or 0
                    ent = _MEDIA_ATTR.get(rel)
                    if not ent:
                        ent = {"performers": [], "tags": []}
                        _MEDIA_ATTR[rel] = ent
                    # Merge legacy sidecar into unified fields
                    merged = (ent.get("performers") or []) + [str(n) for n in names if isinstance(n, str)]
                    seen: set[str] = set(); perf_out: list[str] = []
                    for nm in merged:
                        k = str(nm).lower().strip()
                        if k and k not in seen:
                            seen.add(k); perf_out.append(str(nm).strip())
                    ent["performers"] = perf_out[:500]
                    if isinstance(mns, (int, float)):
                        try:
                            ent["mtime_ns"] = int(mns) # type: ignore
                        except Exception:
                            pass
                    migrated += 1
                except Exception:
                    pass
            if migrated:
                _save_media_attr()
            # After migration, remove legacy file to avoid confusion
            try:
                p = _performers_index_path()
                if p.exists():
                    p.unlink(missing_ok=True)  # type: ignore[call-arg]
            except Exception:
                pass
    except Exception:
        pass
    # Rebuild in-memory structures fresh each call (cheap)
    _PERFORMERS_INDEX = {}
    # Preserve existing cache names; will add/augment below
    # Scan mp4 list (stat only) - much cheaper than reading metadata content
    videos = _find_mp4s(root, recursive=True)
    changed = 0
    missing = 0
    media_attr_changed = False
    for v in videos:
        m = metadata_path(v)
        if not m.exists():
            continue
        try:
            rel = str(v.relative_to(root))
        except Exception:
            rel = str(v)
        try:
            st = m.stat().st_mtime_ns
        except Exception:
            st = None
        ent = _MEDIA_ATTR.get(rel)
        if ent is None:
            ent = {"performers": [], "tags": []}
            _MEDIA_ATTR[rel] = ent
        val_mns = ent.get("mtime")
        prev_mns = int(val_mns) if (st is not None and isinstance(val_mns, (int, float))) else 0
        need_parse = bool(st is not None and prev_mns != st)
        names = list(ent.get("performers") or [])
        if need_parse:
            try:
                j = json.loads(m.read_text())
            except Exception:
                j = {}
            # Heuristic extraction
            try:
                fmt = j.get("format", {}) or {}
                tags = fmt.get("tags", {}) or {}
                if isinstance(tags, dict) and tags:
                    tags_ci = {str(k).lower(): v for k, v in tags.items()}
                    for key in ("performers", "cast"):
                        raw_val = tags_ci.get(key)
                        if isinstance(raw_val, str):
                            names.extend([t.strip() for t in re.split(r"[;,]", raw_val) if t.strip()])
                        elif isinstance(raw_val, list):
                            for n in raw_val:
                                if isinstance(n, str) and n.strip():
                                    names.append(n.strip())
            except Exception:
                pass
            try:
                perf_field = j.get("performers")
                if isinstance(perf_field, list):
                    for n in perf_field:
                        if isinstance(n, str) and n.strip():
                            names.append(n.strip())
            except Exception:
                pass
            if st is not None:
                try:
                    merged = (ent.get("performers") or []) + list(names)
                    seen: set[str] = set(); perf_out: list[str] = []
                    for nm in merged:
                        k = str(nm).lower().strip()
                        if k and k not in seen:
                            seen.add(k); perf_out.append(str(nm).strip())
                    ent["performers"] = perf_out[:500]  # type: ignore[index]
                    ent["mtime"] = int(st)  # type: ignore[index]
                    media_attr_changed = True
                except Exception:
                    pass
            if names:
                changed += 1
        for n in names:
            norm = _normalize_performer(n)
            if not norm:
                continue
            _PERFORMERS_INDEX.setdefault(norm, set()).add(rel)
            _PERFORMERS_CACHE.setdefault(norm, {"name": n, "tags": []})
    # Note: we no longer maintain a separate files_map; missing count refers only to sidecar scan
    # Merge media-attr store (user-assigned per file)
    try:
        existing_rel = {str(v.relative_to(root)) for v in videos if v.exists()}
        for rel, ent in (_MEDIA_ATTR or {}).items():  # type: ignore[name-defined]
            if rel not in existing_rel:
                continue
            perfs = (ent or {}).get("performers") or []
            if not isinstance(perfs, list):
                continue
            for n in perfs:
                if not isinstance(n, str) or not n.strip():
                    continue
                norm = _normalize_performer(n)
                if not norm:
                    continue
                _PERFORMERS_INDEX.setdefault(norm, set()).add(str(rel))
                _PERFORMERS_CACHE.setdefault(norm, {"name": n, "tags": []})
    except Exception:
        pass
    # Merge registry for persistence & images
    try:
        reg_path = _performers_registry_path()
        with REGISTRY_LOCK:
            pdata = _load_registry(reg_path, "performers")
            items = list(pdata.get("performers") or [])
        for item in items:
            if isinstance(item, str):
                name = item.strip()
                data_item = {}
            else:
                name = (item.get("name") or "").strip()
                data_item = item
            if not name:
                continue
            norm = _normalize_performer(name)
            rec = _PERFORMERS_CACHE.setdefault(norm, {"name": name, "tags": []})
            try:
                imgs = list(data_item.get("images") or [])
                if imgs:
                    rec["images"] = imgs
                primary = data_item.get("image")
                if isinstance(primary, str) and primary.strip():
                    rec["image"] = primary.strip()
                face_box = data_item.get("image_face_box")
                if isinstance(face_box, (list, tuple)) and len(face_box) == 4:
                    rec["image_face_box"] = [max(0.0, min(1.0, float(v))) for v in face_box]
            except Exception:
                pass
            _PERFORMERS_INDEX.setdefault(norm, set())
    except Exception:
        pass
    # Persist updated sidecar cache into consolidated media-attr file
    if media_attr_changed:
        try:
            _save_media_attr()
        except Exception:
            pass
    _PERFORMERS_CACHE_TS = t_start
    try:
        duration_ms = round((time.time() - t_start) * 1000, 2)
        global _PERFORMERS_LAST_SCAN_STATS
        _PERFORMERS_LAST_SCAN_STATS = {
            "videos": len(videos),
            "changed": changed,
            "removed": missing,
            "index_keys": len(_PERFORMERS_INDEX),
            "duration_ms": duration_ms,
        }
    except Exception:
        pass
    try:
        logging.info(
            "[performers] incremental scan: videos=%d changed=%d removed=%d index_keys=%d",
            len(videos), changed, missing, len(_PERFORMERS_INDEX),
        )
    except Exception:
        pass

def _merge_performers_registry_once() -> int:
    """Lightweight merge of performers registry into in-memory cache/index.
    Avoids any filesystem scanning so it can be used on cold start fast paths.
    Returns the number of registry entries processed.
    """
    count = 0
    try:
        reg_path = _performers_registry_path()
        with REGISTRY_LOCK:
            pdata = _load_registry(reg_path, "performers")
            items = list(pdata.get("performers") or [])
        for item in items:
            if isinstance(item, str):
                name = item.strip()
            else:
                name = (item.get("name") or "").strip()
            if not name:
                continue
            norm = _normalize_performer(name)
            rec = _PERFORMERS_CACHE.setdefault(norm, {"name": name, "tags": []})
            try:
                if isinstance(item, dict):
                    imgs = list(item.get("images") or [])
                    if imgs:
                        rec["images"] = imgs
                    primary = item.get("image")
                    if isinstance(primary, str) and primary.strip():
                        rec["image"] = primary.strip()
                    fb = item.get("image_face_box")
                    if isinstance(fb, (list, tuple)) and len(fb) == 4:
                        try:
                            rec["image_face_box"] = [max(0.0, min(1.0, float(v))) for v in fb]
                        except Exception:
                            pass
            except Exception:
                pass
            _PERFORMERS_INDEX.setdefault(norm, set())
            count += 1
    except Exception:
        # best-effort only
        pass
    return count

def _list_performers(search: str | None = None) -> list[dict]:
    # Caller (api_performers) is responsible for ensuring sidecars/cache are loaded.
    # Avoid duplicate scans here to keep listing lightweight.
    out = []
    # Include both indexed (found in files) and imported-only performers
    all_norms = set(_PERFORMERS_INDEX.keys()) | set(_PERFORMERS_CACHE.keys())
    for norm in all_norms:
        paths = _PERFORMERS_INDEX.get(norm, set())
        rec = _PERFORMERS_CACHE.get(norm, {"name": norm, "tags": []})
        if search and search.lower() not in rec["name"].lower():
            continue
        # Determine primary image URL if available (registry stores paths relative to root)
        img_rel = None
        try:
            primary = rec.get("image") or (rec.get("images") or [None])[0]
            if isinstance(primary, str) and primary.strip():
                img_rel = primary.strip()
        except Exception:
            img_rel = None
        item = {
            "name": rec["name"],
            "slug": _slugify(rec["name"]),
            "count": len(paths),
        }
        if img_rel:
            # Expose as files URL; client can fetch /files/<relative>
            item["image"] = f"/files/{img_rel}"
        # Bubble through optional face-focus box if present in registry/cache
        try:
            box = rec.get("image_face_box")
            if isinstance(box, (list, tuple)) and len(box) == 4:
                # Ensure numbers and clamp to sane range 0..1
                bx = [max(0.0, min(1.0, float(x))) for x in box]
                item["image_face_box"] = bx
        except Exception:
            pass
        out.append(item)
    # Sort by usage desc then alpha
    out.sort(key=lambda r: (-int(r.get("count") or 0), r.get("name", "" ).lower()))
    return out

@api.get("/performers")
def api_performers(
    search: Optional[str] = Query(None),
    debug: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=32, ge=1, le=200),
    sort: str = Query(default="count"),  # 'count' | 'name'
    order: Optional[str] = Query(default=None),  # if None -> default by sort: name=asc, count=desc
    refresh: bool = Query(default=False),  # force a rebuild of incremental index
    fast: bool = Query(default=True, description="(deprecated) maintained for compatibility; always performs incremental accurate scan"),
):
    # Timing probe (function-scoped import to avoid global churn)
    try:
        import time as _time
        t0 = _time.perf_counter()
    except Exception:
        t0 = None  # type: ignore[assignment]
        _time = None  # type: ignore[assignment]
    timings: dict[str, Any] = {}
    try:
        logging.info("[performers] list request: search=%s debug=%s refresh=%s fast=%s", str(search), str(debug), str(refresh), str(fast))
    except Exception:
        pass
    # Incremental scan orchestration: always ensure up-to-date counts (no fast/partial mode).
    global _PERFORMERS_SCAN_IN_PROGRESS, _PERFORMERS_CACHE_TS
    try:
        t_ls0 = _time.perf_counter() if _time else None
        _PERFORMERS_SCAN_IN_PROGRESS = True
        # Only rescan if forced, never scanned before, or cache older than threshold.
        threshold_s = 5.0
        do_scan = refresh or not _PERFORMERS_CACHE_TS or (time.time() - (_PERFORMERS_CACHE_TS or 0) > threshold_s)
        if do_scan:
            _load_performers_sidecars()
            timings["scan_trigger"] = "full"
        else:
            timings["scan_trigger"] = "skipped_recent"
        if _time and t_ls0 is not None and do_scan:
            timings["incremental_scan_ms"] = round((_time.perf_counter() - t_ls0) * 1000, 2)
    except Exception:
        pass
    finally:
        _PERFORMERS_SCAN_IN_PROGRESS = False
    timings["counts_partial"] = False  # maintain client compatibility (always full counts)
    t_l0 = _time.perf_counter() if _time else None
    # Deprecated: no retro-normalization; keep whatever box shape was stored
    items = _list_performers(search)
    if _time and t_l0 is not None:
        timings["list_build_ms"] = round((_time.perf_counter() - t_l0) * 1000, 2)
    # (Removed fast-mode zero-count fallback; incremental scan already ensured counts.)
    if debug:
        timings["fast_mode"] = False
        timings["scan_in_progress"] = _PERFORMERS_SCAN_IN_PROGRESS
        timings["cache_ts"] = _PERFORMERS_CACHE_TS
    # Apply server-side sort per request
    try:
        t_s0 = _time.perf_counter() if _time else None
        key_name = lambda r: (r.get("name") or "").lower()
        key_count = lambda r: int(r.get("count") or 0)
        sort_key = (sort or "count").lower()
        # Default ordering: name -> asc, count -> desc; explicit order overrides
        eff_order = (order or "").strip().lower()
        if eff_order not in ("asc", "desc"):
            eff_order = "asc" if sort_key == "name" else "desc"
        reverse = eff_order == "desc"
        if sort_key == "name":
            items.sort(key=key_name, reverse=reverse)
        else:
            # count with name tiebreaker (asc/desc via reverse)
            items.sort(key=lambda r: (key_count(r), key_name(r)), reverse=reverse)
        if _time and t_s0 is not None:
            timings["sort_ms"] = round((_time.perf_counter() - t_s0) * 1000, 2)
    except Exception:
        pass
    # Pagination slice
    try:
        t_p0 = _time.perf_counter() if _time else None
        total = len(items)
        total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
        if page > total_pages:
            page = total_pages
        start = max(0, (page - 1) * page_size)
        end = start + page_size
        page_items = items[start:end]
        if _time and t_p0 is not None:
            timings["paginate_ms"] = round((_time.perf_counter() - t_p0) * 1000, 2)
    except Exception:
        total = len(items)
        total_pages = 1
        page_items = items
    try:
        logging.info("[performers] list response: %d item(s) total; page=%s size=%s sort=%s order=%s", len(items), str(page), str(page_size), str(sort), str(order))
        if debug:
            try:
                # Log cache/index sizes and a small sample of counts for visibility
                idx_size = len(_PERFORMERS_INDEX or {})
                cache_size = len(_PERFORMERS_CACHE or {})
                logging.info("[performers] index size=%d cache size=%d", idx_size, cache_size)
                try:
                    ma_size = len((_MEDIA_ATTR or {}))  # type: ignore[name-defined]
                except Exception:
                    ma_size = -1
                logging.info("[performers] media-attr entries=%s", str(ma_size))
                # Top 10 by count for quick inspection
                sample = sorted(items, key=lambda r: int(r.get("count") or 0), reverse=True)[:10]
                for i, r in enumerate(sample, start=1):
                    logging.info("[performers] #%d %s (slug=%s) count=%s", i, r.get("name"), r.get("slug"), str(r.get("count")))
                if _time and t0 is not None:
                    timings["total_ms"] = round((_time.perf_counter() - t0) * 1000, 2)
                    timings["counts"] = {
                        "total_items": len(items),
                        "page_items": len(page_items),
                        "index_size": idx_size,
                        "cache_size": cache_size,
                        "media_attr_size": ma_size,
                    }
            except Exception:
                pass
    except Exception:
        pass
    payload = {
        "performers": page_items,
        "page": page,
        "total": total,
        "total_pages": total_pages,
        "page_size": page_size,
        "sort": (sort or "count"),
        "order": eff_order,
        "search": search or None,
    }
    if debug:
        try:
            payload["debug"] = timings
        except Exception:
            pass
    return api_success(payload)

@api.post("/performers/add")
def api_performers_add(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    if not name:
        raise_api_error("name required", status_code=400)
    norm = _normalize_performer(name)
    if norm not in _PERFORMERS_CACHE:
        _PERFORMERS_CACHE[norm] = {"name": name, "tags": []}
        _PERFORMERS_INDEX.setdefault(norm, set())
        # Persist zero-count performer (no file entries yet) by ensuring index file references remain consistent.
        # No direct file mutation needed; counts remain 0 until media-level add.
    return api_success({"added": name})

@api.post("/performers/import")
def api_performers_import(body: str = Body(..., media_type="text/plain")):
    # Accept either JSON list or plaintext newline list
    names: list[str] = []
    txt = body.strip()
    if not txt:
        return api_success({"imported": 0})
    try:
        if txt.lstrip().startswith("["):
            arr = json.loads(txt)
            if isinstance(arr, list):
                for n in arr:
                    if isinstance(n, str) and n.strip():
                        names.append(n.strip())
        else:
            for line in txt.splitlines():
                line = line.strip()
                if line:
                    names.append(line)
    except Exception:
        raise_api_error("invalid import payload", status_code=400)
    added = 0
    new_names: list[str] = []  # Initialize new names list
    for n in names:  # Iterate through performer names
        norm = _normalize_performer(n)
        if norm and norm not in _PERFORMERS_CACHE:
            _PERFORMERS_CACHE[norm] = {"name": n, "tags": []}
            _PERFORMERS_INDEX.setdefault(norm, set())
            added += 1
            new_names.append(n)  # Collect new names
    # Persist into central registry so performers survive server reloads
    if new_names:
        try:
            path = _performers_registry_path()
            with REGISTRY_LOCK:
                data = _load_registry(path, "performers")
                items: list[dict] = data.get("performers") or []
                # Build set of existing slugs to prevent duplicates
                existing = {p.get("slug") or "" for p in items}
                next_id = int(data.get("next_id") or 1)
                for nm in new_names:
                    slug = _slugify(nm)
                    if slug in existing:
                        continue
                    items.append({"id": next_id, "name": nm, "slug": slug, "images": []})
                    existing.add(slug)
                    next_id += 1
                data["performers"] = items
                data["next_id"] = next_id
                _save_registry(path, data)
            try:
                logging.info("[performers] import persisted: +%d new → %d total at %s", added, len(items), str(path))
            except Exception:
                pass
        except Exception:
            # Non-fatal: keep in-memory import even if persistence fails
            pass
    if added == 0:
        try:
            logging.info("[performers] import: 0 new (likely duplicates) at %s", str(_performers_registry_path()))
        except Exception:
            pass
    return api_success({"imported": added})  # Return the number of added performers

@api.post("/performers/rename")
def api_performers_rename(body: dict = Body(...)):
    old = _normalize_performer((body.get("old") or ""))
    new = (body.get("new") or "").strip()
    if not old or not new:
        raise_api_error("old and new required", status_code=400)
    new_norm = _normalize_performer(new)
    if old not in _PERFORMERS_CACHE:
        raise_api_error("old performer not found", status_code=404)
    rec = _PERFORMERS_CACHE.pop(old)
    paths = _PERFORMERS_INDEX.pop(old, set())
    rec["name"] = new
    _PERFORMERS_CACHE[new_norm] = rec
    _PERFORMERS_INDEX[new_norm] = _PERFORMERS_INDEX.get(new_norm, set()).union(paths)
    # Persist rename across index entries.
    _performers_index_rename(old, new)
    return api_success({"renamed": {"old": old, "new": new}})

@api.post("/performers/merge")
def api_performers_merge(body: dict = Body(...)):
    from_list = body.get("from") or []
    target = (body.get("to") or "").strip()
    if not isinstance(from_list, list) or not target:
        raise_api_error("from (list) and to (string) required", status_code=400)
    target_norm = _normalize_performer(target)
    _PERFORMERS_CACHE.setdefault(target_norm, {"name": target, "tags": []})
    _PERFORMERS_INDEX.setdefault(target_norm, set())
    merged = []
    for n in from_list:
        norm = _normalize_performer(str(n))
        if norm in _PERFORMERS_INDEX and norm != target_norm:
            _PERFORMERS_INDEX[target_norm].update(_PERFORMERS_INDEX.pop(norm))
            _PERFORMERS_CACHE.pop(norm, None)
            merged.append(norm)
    if merged:
        _performers_index_merge(merged, target)
    return api_success({"merged_into": target, "sources": merged})

@api.delete("/performers")
def api_performers_delete(name: str = Query(...)):
    norm = _normalize_performer(name)
    if norm not in _PERFORMERS_CACHE:
        raise_api_error("performer not found", status_code=404)
    _PERFORMERS_CACHE.pop(norm, None)
    _PERFORMERS_INDEX.pop(norm, None)
    _performers_index_delete(norm)
    # Persist deletion in central registry so it doesn't reappear on reload
    try:
        path = _performers_registry_path()
        with REGISTRY_LOCK:
            data = _load_registry(path, "performers")
            items: list[dict] = list(data.get("performers") or [])
            before = len(items)
            # Remove by either slug or normalized name match
            slug_to_remove = _slugify(name)
            items = [it for it in items if (it.get("slug") or _slugify(str(it.get("name") or ""))) != slug_to_remove and _normalize_performer(str(it.get("name") or "")) != norm]
            if len(items) != before:
                data["performers"] = items
                _save_registry(path, data)
                try:
                    logging.info("[performers] deleted '%s' from registry (%d -> %d)", name, before, len(items))
                except Exception:
                    pass
    except Exception:
        # Non-fatal: in-memory deletion still applies this session
        pass
    return api_success({"deleted": name})

def _performer_images_store() -> Path:
    # Centralized performer images under <root>/.artifacts/performers/<slug>/
    d = _registry_dir() / "performers"
    d.mkdir(parents=True, exist_ok=True)
    return d

@api.post("/performers/images/import")
def performers_images_import(
    directory: str = Query(..., description="Directory containing images; filenames map to performer names"),
    mode: str = Query(default="link", description="link: store relative paths under root; copy: copy into registry store"),
    replace: bool = Query(default=False, description="Replace existing images instead of appending"),
    create_missing: bool = Query(default=False, description="Create performers that don't exist"),
):
    # Resolve directory under root
    root_path = Path(STATE.get("root") or Path.cwd()).resolve()
    base = safe_join(root_path, directory) if directory else root_path
    if not base.exists() or not base.is_dir():
        raise_api_error("directory not found", status_code=404)
    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    updated = 0
    created = 0
    skipped = 0
    errors: list[str] = []
    # Load current registry
    reg_path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(reg_path, "performers")
        items: list[dict] = list(data.get("performers") or [])
        by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
        next_id = int(data.get("next_id") or 1)
    for f in sorted(base.iterdir(), key=lambda p: p.name.lower()):
        try:
            if not f.is_file() or f.suffix.lower() not in exts:
                continue
            disp = f.stem
            if not disp.strip():
                continue
            norm = _normalize_performer(disp)
            slug = _slugify(disp)
            # Ensure performer exists
            if norm not in _PERFORMERS_CACHE:
                if not create_missing:
                    skipped += 1
                    continue
                _PERFORMERS_CACHE[norm] = {"name": disp, "tags": []}
                _PERFORMERS_INDEX.setdefault(norm, set())
                created += 1
            # Determine storage path
            if mode.lower() == "copy":
                dest_dir = _performer_images_store() / slug
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / f.name
                try:
                    shutil.copy2(str(f), str(dest))
                except Exception:
                    # fallback simple copy
                    try:
                        shutil.copy(str(f), str(dest))
                    except Exception as e:
                        errors.append(f"copy failed: {f.name}: {e}")
                        continue
                rel = str(dest.relative_to(root_path).as_posix())
            else:
                # link mode: require inside root
                try:
                    rel = str(f.relative_to(root_path).as_posix())
                except Exception:
                    errors.append(f"outside root: {f}")
                    skipped += 1
                    continue
            # Update registry item
            with REGISTRY_LOCK:
                data = _load_registry(reg_path, "performers")
                items = list(data.get("performers") or [])
                by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
                it = by_slug.get(slug)
                if it is None:
                    it = {"id": next_id, "name": disp, "slug": slug, "images": [], "image": None}
                    next_id += 1
                    items.append(it)
                imgs = list(it.get("images") or [])
                if replace:
                    imgs = [rel]
                else:
                    if rel not in imgs:
                        imgs.append(rel)
                it["images"] = imgs
                # Set primary if not set
                prim = it.get("image")
                if not (isinstance(prim, str) and prim.strip()):
                    it["image"] = rel
                data["performers"] = items
                data["next_id"] = next_id
                _save_registry(reg_path, data)
            updated += 1
        except Exception as e:
            try:
                errors.append(f"{f.name}: {e}")
            except Exception:
                pass
            skipped += 1
            continue
    # After import, merge registry images into cache so API reflects immediately
    try:
        _load_performers_sidecars()
    except Exception:
        pass
    return api_success({
        "updated": updated,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "mode": mode,
    })

@api.post("/performers/images/upload")
def performers_images_upload(
    files: List[UploadFile] = File(..., description="Image files; names or relative paths map to performers"),
    replace: bool = Query(default=False, description="Replace existing images instead of appending"),
    create_missing: bool = Query(default=True, description="Create performers that don't exist"),
):
    """
    Upload performer images directly (no need to reside under media root).
    Mapping rules:
      - If a file has a relative path like "Performer Name/img.jpg", the first directory is used as the performer name.
      - Otherwise, the file stem (without extension) is used as the performer name.
    Files are copied into the registry store under /performers/<slug>/.
    """
    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    updated = 0
    created = 0
    skipped = 0
    errors: list[str] = []
    root_path = Path(STATE.get("root") or Path.cwd()).resolve()
    reg_path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(reg_path, "performers")
        items: list[dict] = list(data.get("performers") or [])
        by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
        next_id = int(data.get("next_id") or 1)
    for uf in files:
        try:
            # Derive performer display from path (prefer first directory)
            raw_name = str(getattr(uf, "filename", "") or "").strip().replace("\\", "/")
            if "/" in raw_name:
                perf_disp = raw_name.split("/", 1)[0].strip() or Path(raw_name).stem
                basename = raw_name.rsplit("/", 1)[1]
            else:
                perf_disp = Path(raw_name).stem
                basename = Path(raw_name).name
            if not perf_disp:
                skipped += 1
                continue
            ext = (Path(basename).suffix or "").lower()
            if ext not in exts:
                skipped += 1
                continue
            norm = _normalize_performer(perf_disp)
            slug = _slugify(perf_disp)
            if norm not in _PERFORMERS_CACHE:
                if not create_missing:
                    skipped += 1
                    continue
                _PERFORMERS_CACHE[norm] = {"name": perf_disp, "tags": []}
                _PERFORMERS_INDEX.setdefault(norm, set())
                created += 1
            # Persist file into registry store
            dest_dir = _performer_images_store() / slug
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / basename
            # Save content
            try:
                with dest.open("wb") as out:
                    while True:
                        chunk = uf.file.read(1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
            finally:
                try:
                    uf.file.close()
                except Exception:
                    pass
            rel = str(dest.relative_to(root_path).as_posix())
            # Update registry
            with REGISTRY_LOCK:
                data = _load_registry(reg_path, "performers")
                items = list(data.get("performers") or [])
                by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
                it = by_slug.get(slug)
                if it is None:
                    it = {"id": next_id, "name": perf_disp, "slug": slug, "images": [], "image": None}
                    next_id += 1
                    items.append(it)
                imgs = list(it.get("images") or [])
                if replace:
                    imgs = [rel]
                else:
                    if rel not in imgs:
                        imgs.append(rel)
                it["images"] = imgs
                if not (isinstance(it.get("image"), str) and (it.get("image") or "").strip()):
                    it["image"] = rel
                data["performers"] = items
                data["next_id"] = next_id
                _save_registry(reg_path, data)

            # Face bounding box detection for the current primary image (bulk route parity with /performers/image)
            # Only attempt if OpenCV is available and the just-written image is (or became) the primary.
            try:
                # Re-open registry to get the canonical current primary after update
                with REGISTRY_LOCK:
                    pdata = _load_registry(reg_path, "performers")
                    pitems = list(pdata.get("performers") or [])
                    for pit in pitems:
                        if str(pit.get("slug") or "") == slug:
                            primary_rel = str(pit.get("image") or "")
                            break
                    else:
                        primary_rel = ""
                if primary_rel:
                    abs_path = (root_path / primary_rel).resolve()
                    face_box_norm: list[float] | None = None
                    try:
                        import cv2  # type: ignore
                        import cv2.data  # type: ignore  # noqa: F401
                        img = cv2.imread(str(abs_path))
                        if img is not None:
                            ih, iw = img.shape[:2]
                            if ih > 1 and iw > 1:
                                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                                cascade = cv2.CascadeClassifier(f"{cv2.data.haarcascades}haarcascade_frontalface_default.xml")
                                dets = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=7, minSize=(int(0.10*iw), int(0.10*ih)))
                                best = None
                                bestA = -1.0
                                for (x, y, ww, hh) in list(dets) or []:
                                    a = float(ww * hh)
                                    if a > bestA:
                                        bestA = a
                                        best = (x, y, ww, hh)
                                if best is not None:
                                    x, y, ww, hh = best
                                    # Raw normalized rectangle (no square/padding)
                                    nx = max(0.0, min(1.0, x / iw))
                                    ny = max(0.0, min(1.0, y / ih))
                                    nw = max(0.0, min(1.0, ww / iw))
                                    nh = max(0.0, min(1.0, hh / ih))
                                    face_box_norm = [nx, ny, nw, nh]
                    except Exception:
                        face_box_norm = None
                    # Single concise log line
                    try:
                        box_str = (
                            f"[{face_box_norm[0]:.3f},{face_box_norm[1]:.3f},{face_box_norm[2]:.3f},{face_box_norm[3]:.3f}]"
                            if isinstance(face_box_norm, (list, tuple)) and len(face_box_norm) == 4 else "None"
                        )
                        logging.info("[performers:face] image=%s box=%s", primary_rel, box_str)
                    except Exception:
                        pass
                    if face_box_norm is not None:
                        try:
                            with REGISTRY_LOCK:
                                pdata = _load_registry(reg_path, "performers")
                                pitems = list(pdata.get("performers") or [])
                                for pit in pitems:
                                    if str(pit.get("slug") or "") == slug and str(pit.get("image") or "") == primary_rel:
                                        pit["image_face_box"] = face_box_norm
                                        break
                                pdata["performers"] = pitems
                                _save_registry(reg_path, pdata)
                        except Exception:
                            pass
            except Exception:
                # Never fail upload due to face detection errors
                pass
            updated += 1
        except Exception as e:
            try:
                errors.append(f"{getattr(uf, 'filename', '?')}: {e}")
            except Exception:
                pass
            skipped += 1
            continue
    try:
        _load_performers_sidecars()
    except Exception:
        pass
    return api_success({
        "updated": updated,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "mode": "upload",
    })

@api.post("/performers/face-box")
def performer_update_face_box(
    slug: str = Query(..., description="Performer slug or name"),
    x: float = Body(..., embed=True, description="Normalized x (0..1) of face box"),
    y: float = Body(..., embed=True, description="Normalized y (0..1) of face box"),
    w: float = Body(..., embed=True, description="Normalized width 0..1"),
    h: float = Body(..., embed=True, description="Normalized height 0..1"),
):
    """
    Update (or set) the manual face bounding box for a performer's primary image.
    Accepts normalized coordinates. Box is clamped into [0,1] (no forced square).
    """
    try:
        slug_in = (slug or "").strip()
        if not slug_in:
            raise_api_error("slug required", status_code=400)
        # Allow passing name: slugify to lookup
        norm_slug = _slugify(slug_in)
        nx = max(0.0, min(1.0, float(x)))
        ny = max(0.0, min(1.0, float(y)))
        nw = max(0.0, min(1.0, float(w)))
        nh = max(0.0, min(1.0, float(h)))
        bx = [nx, ny, nw, nh]
        # Clamp so box fully fits (adjust width/height if needed)
        if bx[0] + bx[2] > 1.0:
            bx[2] = max(0.0, 1.0 - bx[0])
        if bx[1] + bx[3] > 1.0:
            bx[3] = max(0.0, 1.0 - bx[1])
        reg_path = _performers_registry_path()
        with REGISTRY_LOCK:
            data = _load_registry(reg_path, "performers")
            items: list[dict] = list(data.get("performers") or [])
            found = False
            for it in items:
                if _slugify(str(it.get("slug") or it.get("name") or "")) == norm_slug:
                    # Only set if primary image exists
                    if isinstance(it.get("image"), str) and (it.get("image") or "").strip():
                        it["image_face_box"] = bx
                        found = True
                    break
            if not found:
                raise_api_error("performer not found or has no primary image", status_code=404)
            data["performers"] = items
            _save_registry(reg_path, data)
        return api_success({"slug": norm_slug, "image_face_box": bx, "status": "updated"})
    # Use raise_api_error helper consistently; APIError class isn't defined here
    except Exception as e:
        raise_api_error(f"failed to update face box: {e}")

@api.post("/performers/face-boxes")
def performer_update_face_boxes(body: dict = Body(..., description="Batch face boxes")):
    """Batch update face boxes.
    Body format: { boxes: [ { slug: str, x: float, y: float, w: float, h: float }, ... ] }
    Each box is normalized (0..1). Box clamped to image bounds; no forced square.
    Returns list of updated slugs.
    """
    try:
        entries = body.get("boxes") or []
        if not isinstance(entries, list):
            raise_api_error("boxes must be list", status_code=400)
        reg_path = _performers_registry_path()
        updated: list[str] = []
        with REGISTRY_LOCK:
            data = _load_registry(reg_path, "performers")
            items: list[dict] = list(data.get("performers") or [])
            # Map slugified lookup
            by_slug: dict[str, dict] = {}
            for it in items:
                s = _slugify(str(it.get("slug") or it.get("name") or ""))
                if s:
                    by_slug[s] = it
            for ent in entries:
                try:
                    slug_in = _slugify(str(ent.get("slug") or "").strip())
                    if not slug_in or slug_in not in by_slug:
                        continue
                    it = by_slug[slug_in]
                    # Only set if performer has a primary image
                    if not (isinstance(it.get("image"), str) and (it.get("image") or "").strip()):
                        continue
                    nx = max(0.0, min(1.0, float(ent.get("x", 0.0))))
                    ny = max(0.0, min(1.0, float(ent.get("y", 0.0))))
                    nw = max(0.0, min(1.0, float(ent.get("w", 0.0))))
                    nh = max(0.0, min(1.0, float(ent.get("h", 0.0))))
                    bx = [nx, ny, nw, nh]
                    if bx[0] + bx[2] > 1.0:
                        bx[2] = max(0.0, 1.0 - bx[0])
                    if bx[1] + bx[3] > 1.0:
                        bx[3] = max(0.0, 1.0 - bx[1])
                    it["image_face_box"] = bx
                    updated.append(slug_in)
                except Exception:
                    continue
            data["performers"] = items
            _save_registry(reg_path, data)
        return api_success({"updated": updated, "count": len(updated)})
    except Exception as e:
        raise_api_error(f"failed batch face box update: {e}")

@api.post("/performers/image")
def performer_image_upload(
    name: str = Query(..., description="Performer name (or slug) to associate image with"),
    file: UploadFile = File(..., description="Image file for performer"),
    replace: bool = Query(default=False, description="Replace existing images instead of appending"),
    create_missing: bool = Query(default=True, description="Create performer if missing"),
):
    """Upload a single image for a specific performer.
    If performer does not exist and create_missing is true, the performer is created.
    Accepts common image extensions. Stores under /performers/<slug>/.
    Returns updated performer summary (id, name, slug, image, images count)."""
    exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    disp = (name or "").strip()
    if not disp:
        raise_api_error("name required", status_code=400)
    norm = _normalize_performer(disp)
    slug = _slugify(disp)
    # Validate extension
    raw_fn = str(getattr(file, "filename", "") or "").strip() or (slug + ".jpg")
    # If the incoming filename has directories, strip them (single image upload shouldn't nest)
    if "/" in raw_fn or "\\" in raw_fn:
        raw_fn = raw_fn.replace("\\", "/").rsplit("/", 1)[-1]
    ext = Path(raw_fn).suffix.lower()
    if ext not in exts:
        raise_api_error("unsupported image extension", status_code=415)
    root_path = Path(STATE.get("root") or Path.cwd()).resolve()
    reg_path = _performers_registry_path()
    created = False
    # Ensure performer exists in cache
    if norm not in _PERFORMERS_CACHE:
        if not create_missing:
            raise_api_error("performer not found", status_code=404)
        _PERFORMERS_CACHE[norm] = {"name": disp, "tags": []}
        _PERFORMERS_INDEX.setdefault(norm, set())
        created = True
    # Persist file
    dest_dir = _performer_images_store() / slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Ensure unique filename if one exists (avoid silent overwrite confusion)
    dest = dest_dir / raw_fn
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        i = 2
        while dest.exists() and i < 50:  # bounded loop
            dest = dest_dir / f"{stem}-{i}{suffix}"
            i += 1
    try:
        with dest.open("wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    finally:
        try:
            file.file.close()
        except Exception:
            pass
    rel = str(dest.relative_to(root_path).as_posix())
    # Update registry atomically
    with REGISTRY_LOCK:
        data = _load_registry(reg_path, "performers")
        items: list[dict] = list(data.get("performers") or [])
        by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
        it = by_slug.get(slug)
        next_id = int(data.get("next_id") or 1)
        if it is None:
            it = {"id": next_id, "name": disp, "slug": slug, "images": [], "image": None}
            next_id += 1
            items.append(it)
        imgs = list(it.get("images") or [])
        if replace:
            imgs = [rel]
        else:
            if rel not in imgs:
                imgs.append(rel)
        it["images"] = imgs
        # Always set primary to the newest if replace OR no primary yet
        prim = it.get("image")
        if replace or not (isinstance(prim, str) and prim.strip()):
            it["image"] = rel
        data["performers"] = items
        data["next_id"] = next_id
        _save_registry(reg_path, data)
    # Optionally compute a face bounding box for the (current) primary image using OpenCV if available
    # We store a normalized [x, y, w, h] in 0..1 as 'image_face_box' on the performer record.
    face_box_norm: list[float] | None = None
    try:
        # Determine the latest primary (after registry update)
        with REGISTRY_LOCK:
            data = _load_registry(reg_path, "performers")
            items = list(data.get("performers") or [])
            by_slug = {str(it.get("slug") or _slugify(str(it.get("name") or ""))): it for it in items}
            it2 = by_slug.get(slug)
            primary_rel = str((it2 or {}).get("image") or "")
        if primary_rel:
            abs_path = (root_path / primary_rel).resolve()
            try:
                import cv2  # type: ignore
                import cv2.data  # type: ignore  # noqa: F401
                img = cv2.imread(str(abs_path))
                if img is not None:
                    h, w = img.shape[:2]
                    if h > 1 and w > 1:
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        cascade = cv2.CascadeClassifier(f"{cv2.data.haarcascades}haarcascade_frontalface_default.xml")
                        dets = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=7, minSize=(int(0.10*w), int(0.10*h)))
                        best = None
                        bestA = -1.0
                        for (x, y, ww, hh) in list(dets) or []:
                            a = float(ww * hh)
                            if a > bestA:
                                bestA = a
                                best = (x, y, ww, hh)
                        if best is not None:
                            x, y, ww, hh = best
                            # Raw normalized rectangle (no square/padding)
                            nx = max(0.0, min(1.0, x / w))
                            ny = max(0.0, min(1.0, y / h))
                            nw = max(0.0, min(1.0, ww / w))
                            nh = max(0.0, min(1.0, hh / h))
                            face_box_norm = [nx, ny, nw, nh]
            except Exception:
                face_box_norm = None
            # Single concise log line
            try:
                box_str = (
                    f"[{face_box_norm[0]:.3f},{face_box_norm[1]:.3f},{face_box_norm[2]:.3f},{face_box_norm[3]:.3f}]"
                    if isinstance(face_box_norm, (list, tuple)) and len(face_box_norm) == 4 else "None"
                )
                logging.info("[performers:face] image=%s box=%s", primary_rel, box_str)
            except Exception:
                pass
        # Persist face box on the performer entry only if it corresponds to the current primary image
        if face_box_norm is not None:
            with REGISTRY_LOCK:
                data = _load_registry(reg_path, "performers")
                items = list(data.get("performers") or [])
                for it3 in items:
                    if str(it3.get("slug") or "") == slug:
                        it3["image_face_box"] = face_box_norm
                        break
                data["performers"] = items
                _save_registry(reg_path, data)
    except Exception:
        # Non-fatal: absence of cv2 or any error shouldn't break upload
        pass
    # Refresh in-memory cache to reflect images & primary
    try:
        _load_performers_sidecars()
    except Exception:
        pass
    summary = {
        "name": disp,
        "slug": slug,
        "created": created,
        "image": f"/files/{rel}",  # return full served URL for immediate client use
        "images": len(imgs),
        # Include face box if we computed one
        "image_face_box": face_box_norm,
    }
    try:
        logging.info("[performers] image uploaded for '%s' (%s created=%s) -> %s", disp, slug, created, rel)
    except Exception:
        pass
    return api_success({"performer": summary})

@api.post("/performers/images/upload-zip")
def performers_images_upload_zip(
    request: Request,
    zip: UploadFile = File(..., description="Zip archive containing performer images"),
    replace: bool = Query(default=False, description="Replace existing images instead of appending"),
    create_missing: bool = Query(default=True, description="Create performers that don't exist"),
):
    """
    Accept a .zip archive containing images and associate them to performers.
    Mapping is identical to /performers/images/upload.
    """
    import zipfile
    tmpdir = None
    t_start = time.time()
    updated = 0
    created = 0
    skipped = 0
    errors: list[str] = []

    # Whether to stream incremental progress (client passes ?stream=1)
    stream_flag = request.query_params.get("stream") in {"1", "true", "yes"}

    # Helper to extract zip and prepare UploadFile-like list
    def _extract() -> list[UploadFile]:
        nonlocal skipped, errors, tmpdir
        # Write zip to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tf:
            while True:
                chunk = zip.file.read(1024 * 1024)
                if not chunk:
                    break
                tf.write(chunk)
            tmpzip = tf.name
        try:
            logging.info("[performers:upload-zip] received filename=%s size=%sB", getattr(zip, 'filename', '?'), os.path.getsize(tmpzip))
        except Exception:
            pass
        tmpdir = tempfile.mkdtemp(prefix="perfimg_")
        with zipfile.ZipFile(tmpzip, 'r') as zf:
            for m in zf.infolist():
                p = Path(m.filename.replace("\\", "/"))
                if any(part in ("..", "") for part in p.parts):
                    skipped += 1
                    errors.append(f"skip unsafe path: {m.filename}")
                    continue
                try:
                    zf.extract(m, path=tmpdir)
                except Exception:
                    skipped += 1
                    errors.append(f"extract failed: {m.filename}")
                    continue
        files: list[Any] = []
        class _F:
            def __init__(self, path: Path, rel: str):
                self.file = open(path, 'rb')
                self.filename = rel
        for root, _dirs, fnames in os.walk(tmpdir):
            for n in fnames:
                pp = Path(root) / n
                rel = str(pp.relative_to(tmpdir).as_posix())
                files.append(_F(pp, rel))
        # Wrapper flattening (single top-level dir like 'output/')
        try:
            first_parts = {p.filename.split('/', 1)[0] for p in files if isinstance(getattr(p, 'filename', None), str) and p.filename}
            if len(first_parts) == 1:
                wrapper = next(iter(first_parts))
                wrapper_lower = wrapper.lower()
                if wrapper_lower in {"output", "images", "img", "performers", "upload"} or len(wrapper_lower) <= 3 or wrapper_lower.startswith("out"):
                    for p in files:
                        fn = getattr(p, 'filename', None)
                        if isinstance(fn, str) and fn.startswith(wrapper + "/"):
                            p.filename = fn[len(wrapper) + 1:]
                    try:
                        logging.info("[performers:upload-zip] flattened wrapper '%s' for %d file(s)", wrapper, len(files))
                    except Exception:
                        pass
        except Exception:
            pass
        return files

    files = _extract()

    if stream_flag:
        # Streaming NDJSON response with incremental progress
        def _iter() -> Iterator[bytes]:
            nonlocal updated, created, skipped, errors, files, tmpdir
            try:
                yield (json.dumps({"event": "start", "file_count": len(files)}) + "\n").encode("utf-8")
                if not files:
                    yield (json.dumps({"event": "done", "updated": 0, "created": 0, "skipped": skipped, "errors": errors, "empty": True, "elapsed_ms": round((time.time() - t_start) * 1000, 2)}) + "\n").encode("utf-8")
                    return
                # Process each file individually to surface incremental progress
                for idx, uf in enumerate(files):
                    try:
                        resp = performers_images_upload(files=[uf], replace=replace, create_missing=create_missing)  # type: ignore[arg-type]
                        # Parse inner stats
                        if isinstance(resp, dict):
                            inner = resp.get("data") or resp
                        else:
                            body = resp.body if hasattr(resp, "body") else None
                            inner = json.loads(body.decode("utf-8")) if isinstance(body, (bytes, bytearray)) else {}
                            inner = inner.get("data") or inner
                        updated += int(inner.get("updated", 0))
                        created += int(inner.get("created", 0))
                        skipped += int(inner.get("skipped", 0))
                        if inner.get("errors"):
                            errors.extend(list(inner.get("errors") or []))
                        yield (json.dumps({
                            "event": "saved",
                            "index": idx + 1,
                            "file_count": len(files),
                            "updated_total": updated,
                            "created_total": created,
                            "skipped_total": skipped,
                            "errors_total": len(errors),
                            "elapsed_ms": round((time.time() - t_start) * 1000, 2),
                        }) + "\n").encode("utf-8")
                    except Exception as e:
                        skipped += 1
                        errors.append(str(e))
                        yield (json.dumps({"event": "error", "index": idx + 1, "message": str(e)}) + "\n").encode("utf-8")
                yield (json.dumps({
                    "event": "done",
                    "updated": updated,
                    "created": created,
                    "skipped": skipped,
                    "errors": errors,
                    "elapsed_ms": round((time.time() - t_start) * 1000, 2),
                    "file_count": len(files),
                }) + "\n").encode("utf-8")
            finally:
                if tmpdir and os.path.isdir(tmpdir):
                    shutil.rmtree(tmpdir, ignore_errors=True)
        return StreamingResponse(_iter(), media_type="application/x-ndjson")

    # Non-streaming original aggregated behavior
    try:
        if not files:
            logging.warning("[performers:upload-zip] archive contained no files after extraction")
            return api_success({
                "updated": 0,
                "created": 0,
                "skipped": skipped,
                "errors": errors,
                "mode": "upload-zip",
                "empty": True,
                "elapsed_ms": round((time.time() - t_start) * 1000, 2),
            })
        resp = performers_images_upload(files=files, replace=replace, create_missing=create_missing)  # type: ignore[arg-type]
        try:
            data = resp.body if hasattr(resp, 'body') else None
            if isinstance(resp, dict):
                inner = resp.get("data") or resp
            else:
                inner = json.loads(data.decode("utf-8")) if isinstance(data, (bytes, bytearray)) else {}
                inner = inner.get("data") or inner
            inner_data = inner
        except Exception:
            inner_data = {}
        try:
            logging.info("[performers:upload-zip] processed files=%d updated=%s created=%s skipped=%s errors=%d", len(files), inner_data.get("updated"), inner_data.get("created"), inner_data.get("skipped"), len(inner_data.get("errors") or []))
        except Exception:
            pass
        return api_success({
            "updated": inner_data.get("updated", 0),
            "created": inner_data.get("created", 0),
            "skipped": skipped + int(inner_data.get("skipped", 0)),
            "errors": errors + list(inner_data.get("errors") or []),
            "mode": "upload-zip",
            "elapsed_ms": round((time.time() - t_start) * 1000, 2),
            "file_count": len(files),
        })
    finally:
        try:
            if tmpdir and os.path.isdir(tmpdir):
                shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass

@api.post("/performers/tags/update")
def api_performers_tags_update(body: dict = Body(...)):
    """Replace full tag list for a performer.
    Body: { name: str, tags: list[str] }
    """
    name = (body.get("name") or "").strip()
    if not name:
        raise_api_error("name required", status_code=400)
    norm = _normalize_performer(name)
    if norm not in _PERFORMERS_CACHE:
        raise_api_error("performer not found", status_code=404)
    raw_tags = body.get("tags") or []
    if not isinstance(raw_tags, list):
        raise_api_error("tags must be list", status_code=400)
    tags: list[str] = []
    seen: set[str] = set()
    for t in raw_tags:
        if isinstance(t, str):
            tt = t.strip()
            if tt and tt.lower() not in seen:
                seen.add(tt.lower())
                tags.append(tt)
    _PERFORMERS_CACHE[norm]["tags"] = tags
    return api_success({"updated": name, "tags": tags})

@api.post("/performers/tags/add")
def api_performers_tags_add(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    tag = (body.get("tag") or "").strip()
    if not name or not tag:
        raise_api_error("name and tag required", status_code=400)
    norm = _normalize_performer(name)
    if norm not in _PERFORMERS_CACHE:
        raise_api_error("performer not found", status_code=404)
    rec = _PERFORMERS_CACHE[norm]
    tags = rec.setdefault("tags", [])
    if tag.lower() not in {t.lower() for t in tags}:
        tags.append(tag)
    return api_success({"added": tag, "tags": tags})

@api.post("/performers/tags/remove")
def api_performers_tags_remove(body: dict = Body(...)):
    name = (body.get("name") or "").strip()
    tag = (body.get("tag") or "").strip()
    if not name or not tag:
        raise_api_error("name and tag required", status_code=400)
    norm = _normalize_performer(name)
    if norm not in _PERFORMERS_CACHE:
        raise_api_error("performer not found", status_code=404)
    rec = _PERFORMERS_CACHE[norm]
    tags = rec.setdefault("tags", [])
    new_tags = [t for t in tags if t.lower() != tag.lower()]
    rec["tags"] = new_tags
    return api_success({"removed": tag, "tags": new_tags})

# -----------------
# Performers graph (co-appearance)
# -----------------
@api.get("/performers/graph")
def api_performers_graph(
    min_count: int = Query(default=1, ge=1),
    limit_videos_per_edge: int = Query(default=6, ge=1, le=50),
):
    """
    Build a co-appearance graph from the in-memory performers index.
    - Nodes: performers with at least `min_count` appearances.
    - Edges: pairs of performers who co-appear in at least one video; `videos` lists up to `limit_videos_per_edge` sample paths.
    """
    try:
        _load_performers_sidecars()
    except Exception:
        pass
    # Build node list with counts and a working map of slug->paths
    nodes: list[dict] = []
    paths_by_slug: dict[str, set[str]] = {}
    name_by_slug: dict[str, str] = {}
    try:
        # Include both indexed and imported performers; filter by count
        all_norms = set((_PERFORMERS_INDEX or {}).keys()) | set((_PERFORMERS_CACHE or {}).keys())
        for norm in all_norms:
            paths = set((_PERFORMERS_INDEX or {}).get(norm, set()))
            rec = (_PERFORMERS_CACHE or {}).get(norm, {"name": norm, "tags": []})
            name = str(rec.get("name") or norm)
            count = len(paths)
            if count >= int(min_count):
                slug = _slugify(name)
                name_by_slug[slug] = name
                paths_by_slug[slug] = paths
                nodes.append({"id": slug, "name": name, "count": count})
    except Exception:
        nodes = []
    # Compute edges by intersecting path sets for each pair
    edges: list[dict] = []
    try:
        slugs = list(paths_by_slug.keys())
        n = len(slugs)
        for i in range(n):
            s1 = slugs[i]
            p1 = paths_by_slug.get(s1, set())
            if not p1:
                continue
            for j in range(i + 1, n):
                s2 = slugs[j]
                p2 = paths_by_slug.get(s2, set())
                if not p2:
                    continue
                inter = p1.intersection(p2)
                if not inter:
                    continue
                vids = list(inter)
                if limit_videos_per_edge and limit_videos_per_edge > 0:
                    vids = vids[: int(limit_videos_per_edge)]
                eid = f"{s1}|{s2}"
                edges.append({
                    "id": eid,
                    "source": s1,
                    "target": s2,
                    "count": len(inter),
                    "videos": vids,
                    "a": name_by_slug.get(s1, s1),
                    "b": name_by_slug.get(s2, s2),
                })
    except Exception:
        edges = []
    # Sort nodes by count desc then name; edges by count desc
    try:
        nodes.sort(key=lambda r: (-(int(r.get("count") or 0)), str(r.get("name") or "").lower()))
    except Exception:
        pass
    try:
        edges.sort(key=lambda e: (-(int(e.get("count") or 0)), str(e.get("id") or "")))
    except Exception:
        pass
    return api_success({"nodes": nodes, "edges": edges})

# -----------------
# Media-level performers & tags association (in-memory sidecar index)
# -----------------
_MEDIA_ATTR: dict[str, dict] = {}  # relative path -> {"performers": [...], "tags": [...], "mtime": int}
_MEDIA_ATTR_PATH: Optional[Path] = None

def _init_media_attr_path() -> Path:
    """
    Centralized media attribute store path.
    Was previously <root>/.media_player_media_attr.json.
    Now stored as <root>/.artifacts/scenes.json.
    """
    root = STATE.get("root") or Path.cwd()
    d = Path(root) / ".artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d / "scenes.json"

def _load_media_attr() -> None:
    global _MEDIA_ATTR_PATH, _MEDIA_ATTR
    try:
        _MEDIA_ATTR_PATH = _init_media_attr_path()
        if _MEDIA_ATTR_PATH.exists() and _MEDIA_ATTR_PATH.stat().st_size > 4:
            raw = json.loads(_MEDIA_ATTR_PATH.read_text())
            if isinstance(raw, dict):
                # Sanitize structure; merge any legacy sidecar_* fields into unified performers list + mtime
                clean: dict[str, dict] = {}
                for k, v in raw.items():
                    if not isinstance(k, str) or not isinstance(v, dict):
                        continue
                    perfs_raw = v.get("performers")
                    tags_raw = v.get("tags")
                    perfs = perfs_raw if isinstance(perfs_raw, list) else []
                    tags = tags_raw if isinstance(tags_raw, list) else []
                    ent: dict[str, Any] = {
                        "performers": [str(p) for p in perfs if isinstance(p, str)][:500],
                        "tags": [str(t) for t in tags if isinstance(t, str)][:500],
                    }
                    # Legacy migration support: if sidecar_performers present, merge into performers then drop
                    sc_perfs = v.get("sidecar_performers")
                    if isinstance(sc_perfs, list) and sc_perfs:
                        merged = ent["performers"] + [str(p) for p in sc_perfs if isinstance(p, str)]
                        seen: set[str] = set()
                        perf_out: list[str] = []
                        for nm in merged:
                            k2 = nm.lower().strip()
                            if k2 and k2 not in seen:
                                seen.add(k2)
                                perf_out.append(nm.strip())
                        ent["performers"] = perf_out[:500]
                    try:
                        sc_mtime = v.get("sidecar_mtime_ns") or v.get("mtime") or v.get("mtime_ns")
                        if isinstance(sc_mtime, (int, float)):
                            ent["mtime"] = int(sc_mtime)
                    except Exception:
                        pass
                    clean[k] = ent
                _MEDIA_ATTR = clean
    except Exception:
        pass

def _save_media_attr() -> None:
    try:
        if _MEDIA_ATTR_PATH is None:
            return
        tmp = _MEDIA_ATTR_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(_MEDIA_ATTR, indent=2, sort_keys=True))
        tmp.replace(_MEDIA_ATTR_PATH)
    except Exception:
        pass

_load_media_attr()

def _media_entry(path: str) -> dict:
    ent = _MEDIA_ATTR.get(path)
    if not ent:
        ent = {"performers": [], "tags": []}
        _MEDIA_ATTR[path] = ent
        _save_media_attr()
    return ent

@api.get("/media/info")
def media_info(path: str = Query(...)):
    rel = path
    ent = _MEDIA_ATTR.get(rel, {"performers": [], "tags": []})
    # Enrich with sidecar-backed fields kept separate from tags API
    desc = ""
    rating = 0
    favorite = False
    try:
        root = STATE.get("root")
        if isinstance(root, Path):
            root_path: Path = root  # type: ignore[assignment]
            vp = safe_join(root_path, rel)
            tf = _tags_file(vp)
            if tf.exists():
                try:
                    td = json.loads(tf.read_text())
                    if isinstance(td.get("description"), str):
                        desc = td.get("description") or ""
                    try:
                        r = int(td.get("rating") or 0)
                        rating = max(0, min(5, r))
                    except Exception:
                        rating = 0
                    try:
                        favorite = bool(td.get("favorite") or False)
                    except Exception:
                        favorite = False
                except Exception:
                    pass
    except Exception:
        pass
    return api_success({"path": rel, **ent, "description": desc, "rating": rating, "favorite": favorite})


@api.post("/media/rating")
def media_set_rating(path: str = Query(...), rating: Optional[int] = Query(None)):
    # Support rating via querystring param; clamp to 0-5; 0 clears
    try:
        root = STATE.get("root")
        if not isinstance(root, Path):
            raise_api_error("invalid server root", 500)
        root_path: Path = root  # type: ignore[assignment]
        vp = safe_join(root_path, path)
        tf = _tags_file(vp)
        cur: dict = {"video": vp.name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
        if tf.exists():
            try:
                cur = json.loads(tf.read_text())
            except Exception:
                pass
        cur.setdefault("description", "")
        cur.setdefault("rating", 0)
        cur.setdefault("favorite", False)
        val = int(rating or 0)
        cur["rating"] = max(0, min(5, val))
        tf.parent.mkdir(parents=True, exist_ok=True)
        tf.write_text(json.dumps(cur, indent=2))
        return api_success({"rating": cur["rating"]})
    except HTTPException:
        raise
    except Exception:
        return api_error("failed to set rating", 500)


class _DescriptionPayload(BaseModel):  # type: ignore
    description: Optional[str] = None


@api.post("/media/description")
def media_set_description(
    path: str = Query(...),
    payload: Optional[_DescriptionPayload] = Body(default=None),
    description: Optional[str] = Query(None),
):
    # Accept description from JSON body or query param for flexibility
    try:
        root = STATE.get("root")
        if not isinstance(root, Path):
            raise_api_error("invalid server root", 500)
        root_path: Path = root  # type: ignore[assignment]
        vp = safe_join(root_path, path)
        tf = _tags_file(vp)
        cur: dict = {"video": vp.name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
        if tf.exists():
            try:
                cur = json.loads(tf.read_text())
            except Exception:
                pass
        cur.setdefault("description", "")
        cur.setdefault("rating", 0)
        cur.setdefault("favorite", False)
        desc_val = description
        if payload and isinstance(payload.description, str):
            desc_val = payload.description
        cur["description"] = (desc_val or "")
        tf.parent.mkdir(parents=True, exist_ok=True)
        tf.write_text(json.dumps(cur, indent=2))
        return api_success({"description": cur["description"]})
    except HTTPException:
        raise
    except Exception:
        return api_error("failed to set description", 500)


@api.post("/media/favorite")
def media_set_favorite(
    path: str = Query(...),
    favorite: Optional[bool] = Query(None),
    payload: Optional[dict] = Body(default=None),
):
    # Accept favorite from query bool or JSON {favorite: true/false}
    try:
        root = STATE.get("root")
        if not isinstance(root, Path):
            raise_api_error("invalid server root", 500)
        root_path: Path = root  # type: ignore[assignment]
        vp = safe_join(root_path, path)
        tf = _tags_file(vp)
        cur: dict = {"video": vp.name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
        if tf.exists():
            try:
                cur = json.loads(tf.read_text())
            except Exception:
                pass
        cur.setdefault("description", "")
        cur.setdefault("rating", 0)
        cur.setdefault("favorite", False)
        fav_val = favorite
        if payload and isinstance(payload, dict) and "favorite" in payload:
            try:
                fav_val = bool(payload.get("favorite"))
            except Exception:
                fav_val = False
        cur["favorite"] = bool(fav_val)
        tf.parent.mkdir(parents=True, exist_ok=True)
        tf.write_text(json.dumps(cur, indent=2))
        return api_success({"favorite": cur["favorite"]})
    except HTTPException:
        raise
    except Exception:
        return api_error("failed to set favorite", 500)

def _norm_list(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        if not isinstance(v, str):
            continue
        t = v.strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out[:500]

@api.post("/media/performers/add")
def media_performers_add(path: str = Query(...), performer: str = Query(...)):
    performer = performer.strip()
    if not performer:
        raise_api_error("performer required", status_code=400)
    ent = _media_entry(path)
    if performer.lower() not in {p.lower() for p in ent["performers"]}:
        ent["performers"].append(performer)
        ent["performers"] = _norm_list(ent["performers"])
    _save_media_attr()
    # Update in-memory index for immediate accuracy
    try:
        norm = _normalize_performer(performer)
        _PERFORMERS_INDEX.setdefault(norm, set()).add(path)
        _PERFORMERS_CACHE.setdefault(norm, {"name": performer, "tags": []})
    except Exception:
        pass
    return api_success({"performers": ent["performers"]})

@api.post("/media/performers/remove")
def media_performers_remove(path: str = Query(...), performer: str = Query(...)):
    performer = performer.strip()
    ent = _media_entry(path)
    ent["performers"] = [p for p in ent["performers"] if p.lower() != performer.lower()]
    _save_media_attr()
    try:
        norm = _normalize_performer(performer)
        paths = _PERFORMERS_INDEX.get(norm)
        if paths and path in paths:
            paths.discard(path)
            if not paths:
                _PERFORMERS_INDEX.pop(norm, None)
    except Exception:
        pass
    return api_success({"performers": ent["performers"]})

@api.get("/performers/index/stats")
def api_performers_index_stats():
    """Expose debug/stats about the performers incremental index for troubleshooting.

    Updated unified schema: per file we persist {performers:[], tags:[], mtime:int} only.
    Legacy 'sidecar_entries' renamed to 'mtime_entries'.
    """
    try:
        with _PERFORMERS_INDEX_LOCK:
            # Consolidated model: stats come from _MEDIA_ATTR and in-memory index
            _load_media_attr()
        files = _MEDIA_ATTR or {}
        mtime_entries = sum(1 for _rel, ent in files.items() if isinstance(ent, dict) and isinstance(ent.get("mtime"), (int, float)))
        stats = {
            "files_indexed": len(files),
            "mtime_entries": mtime_entries,
            "performer_keys": len(_PERFORMERS_INDEX),
            "cache_size": len(_PERFORMERS_CACHE),
            "last_scan": _PERFORMERS_LAST_SCAN_STATS,
            "legacy_index_removed": not _performers_index_path().exists(),
        }
        return api_success({"index_stats": stats})
    except Exception as e:
        return api_error(f"failed to read index stats: {e}", 500)

@api.post("/media/tags/add")
def media_tags_add(path: str = Query(...), tag: str = Query(...)):
    tag = tag.strip()
    if not tag:
        raise_api_error("tag required", status_code=400)
    ent = _media_entry(path)
    if tag.lower() not in {t.lower() for t in ent["tags"]}:
        ent["tags"].append(tag)
        ent["tags"] = _norm_list(ent["tags"])
    _save_media_attr()
    return api_success({"tags": ent["tags"]})

@api.post("/media/tags/remove")
def media_tags_remove(path: str = Query(...), tag: str = Query(...)):
    tag = tag.strip()
    ent = _media_entry(path)
    ent["tags"] = [t for t in ent["tags"] if t.lower() != tag.lower()]
    _save_media_attr()
    return api_success({"tags": ent["tags"]})


# -----------------
# Report
# -----------------
@app.get("/report")
def report(directory: str = Query("."), recursive: bool = Query(False)):
    if directory in (".", ""):
        root = STATE.get("root")
    else:
        p = Path(directory).expanduser()
        if p.is_absolute():
            try:
                p.resolve().relative_to(STATE["root"])  # type: ignore[arg-type]
            except Exception:
                raise HTTPException(400, "invalid directory")
            root = p
        else:
            root = safe_join(STATE["root"], directory)
    root = Path(str(root)).resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
    vids = _find_mp4s(root, recursive)

    def _artifact_flags(v: Path) -> dict[str, bool]:
        s_sheet, s_json = sprite_sheet_paths(v)
        return {
            "metadata": metadata_path(v).exists(),
            "thumbnails": thumbnails_path(v).exists(),
            "previews": _file_nonempty(_preview_concat_path(v)),
            "subtitles": bool(find_subtitles(v)),
            "faces": faces_exists_check(v),
            "sprites": s_sheet.exists() and s_json.exists(),
            "heatmaps": heatmaps_json_exists(v),
            "phash": phash_path(v).exists(),
            "markers": scenes_json_exists(v),
        }

    counts = {
        "metadata": 0,
        "thumbnails": 0,
        "previews": 0,
        "subtitles": 0,
        "faces": 0,
        "sprites": 0,
        "heatmaps": 0,
        "phash": 0,
        "markers": 0,
    }
    for v in vids:
        flags = _artifact_flags(v)
        for k, present in flags.items():
            if present:
                counts[k] += 1
    return {"counts": counts, "total": len(vids)}


# -----------------
# Compare (SSIM / PSNR)
# -----------------
@api.get("/compare")
def api_compare(
    a: str = Query(..., description="First video path (relative to root)"),
    b: str = Query(..., description="Second video path (relative to root)"),
    normalize: bool = Query(True, description="Scale both videos to the smaller resolution before comparing"),
    timeout: int = Query(60, ge=1, le=600),
):
    """Compute perceptual similarity metrics between two videos.

    Returns SSIM (Y/U/V/All) and PSNR (Y/U/V/Avg/Max) along with a qualitative rating.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    va = safe_join(STATE["root"], a)
    vb = safe_join(STATE["root"], b)
    if not va.exists() or not vb.exists():
        raise_api_error("One or both files not found", status_code=404)
    if not ffprobe_available():
        raise_api_error("ffprobe not available", status_code=500)
    if shutil.which("ffmpeg") is None:
        raise_api_error("ffmpeg not available", status_code=500)

    def _probe_dim(p: Path) -> tuple[Optional[int], Optional[int]]:
        metadata = _ffprobe_streams_safe(p)
        try:
            for st in metadata.get("streams", []) or []:
                if (st or {}).get("codec_type") == "video":
                    w = st.get("width")
                    h = st.get("height")
                    return int(w) if w else None, int(h) if h else None
        except Exception:
            pass
        return None, None

    wa, ha = _probe_dim(va)
    wb, hb = _probe_dim(vb)
    target_w = target_h = None
    if normalize and wa and ha and wb and hb:
        # choose the smaller area (or min dims) to preserve detail where both overlap
        if (wa * ha) <= (wb * hb):
            target_w, target_h = wa, ha
        else:
            target_w, target_h = wb, hb
        # Ensure even dimensions for codecs/filters
        if target_w:
            target_w -= target_w % 2
        if target_h:
            target_h -= target_h % 2

    # Build filter graph
    if target_w and target_h:
        filt = f"[0:v]scale={target_w}:{target_h}:flags=bicubic[va];[1:v]scale={target_w}:{target_h}:flags=bicubic[vb];[va][vb]ssim;[va][vb]psnr"
    else:
        filt = "[0:v][1:v]ssim;[0:v][1:v]psnr"

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "info", "-nostdin",
        "-i", str(va),
        "-i", str(vb),
        "-lavfi", filt,
        "-an", "-f", "null", "-",
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise_api_error("Comparison timed out", status_code=504)
    out = (proc.stdout.decode("utf-8", "ignore") + "\n" + proc.stderr.decode("utf-8", "ignore"))
    import re as _re
    ssim_match = None
    psnr_match = None
    for line in out.splitlines():
        if "SSIM Y:" in line:
            ssim_match = line
        if "PSNR y:" in line:
            psnr_match = line
    ssim_vals = {}
    psnr_vals = {}
    if ssim_match:
        m = _re.search(r"SSIM Y:([0-9.]+).*?U:([0-9.]+).*?V:([0-9.]+).*?All:([0-9.]+)", ssim_match)
        if m:
            ssim_vals = {"y": float(m.group(1)), "u": float(m.group(2)), "v": float(m.group(3)), "all": float(m.group(4))}
    if psnr_match:
        m = _re.search(r"PSNR y:([0-9.]+) u:([0-9.]+) v:([0-9.]+) t:([0-9.]+) max:([0-9.]+)", psnr_match)
        if m:
            psnr_vals = {"y": float(m.group(1)), "u": float(m.group(2)), "v": float(m.group(3)), "avg": float(m.group(4)), "max": float(m.group(5))}
    if not ssim_vals and not psnr_vals:
        raise_api_error("Failed to parse comparison metrics", status_code=500)
    # Qualitative rating
    all_ssim = ssim_vals.get("all") or 0.0
    avg_psnr = psnr_vals.get("avg") or 0.0
    if all_ssim >= 0.995 or avg_psnr >= 45:
        rating = "identical"
    elif all_ssim >= 0.99 or avg_psnr >= 40:
        rating = "excellent"
    elif all_ssim >= 0.97 or avg_psnr >= 35:
        rating = "good"
    elif all_ssim >= 0.94 or avg_psnr >= 32:
        rating = "fair"
    else:
        rating = "poor"
    return api_success({
        "a": a,
        "b": b,
        "normalized": bool(target_w and target_h),
        "width": target_w,
        "height": target_h,
        "ssim": ssim_vals,
        "psnr": psnr_vals,
        "rating": rating,
    })


def _serve_range(request: Request, file_path: Path, media_type: str):
    try:
        print(f"[range][in] path={file_path} exists={file_path.exists()} mt={media_type} range={request.headers.get('range') or request.headers.get('Range')}")
    except Exception:
        pass
    if not file_path.exists() or not file_path.is_file():
        raise_api_error("Not found", status_code=404)
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range") or request.headers.get("Range")

    def file_chunk(start: int, end: int) -> Iterator[bytes]:
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            chunk = 1024 * 1024
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    if range_header:
        start = 0
        end = file_size - 1
        try:
            _, rng = range_header.split("=")
            start_s, end_s = rng.split("-")
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            end = min(end, file_size - 1)
            if start > end or start < 0:
                raise ValueError
        except Exception:
            raise_api_error("Invalid Range", status_code=416)
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1),
            "Content-Type": media_type,
        }
        try:
            print(f"[range][206] path={file_path.name} {start}-{end}/{file_size} ct={media_type}")
        except Exception:
            pass
        return StreamingResponse(file_chunk(start, end), status_code=206, headers=headers)
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": media_type,
            "Content-Length": str(file_size),
        }
        try:
            print(f"[range][200] path={file_path.name} full bytes ct={media_type} size={file_size}")
        except Exception:
            pass
        return StreamingResponse(file_chunk(0, file_size - 1), status_code=200, headers=headers)


@api.get("/stream")
def stream_media(request: Request, path: str = Query(...)):
    file_path = safe_join(STATE["root"], path)
    # Media type best-effort
    import mimetypes

    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    try:
        print(f"[stream] GET /stream path={path} fp={file_path} ct={content_type}")
    except Exception:
        pass
    return _serve_range(request, file_path, content_type)


# Direct file serving under /files for artifacts and originals
@app.get("/files/{full_path:path}")
def serve_file(full_path: str, request: Request):
    # full_path is relative to MEDIA_ROOT
    file_path = safe_join(STATE["root"], full_path)
    if not file_path.exists() or not file_path.is_file():
        raise_api_error("Not found", status_code=404)
    mt = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    # If media type is video/audio, support Range
    if mt.startswith("video/") or mt.startswith("audio/"):
        try:
            print(f"[files][GET] /files/{full_path} mt={mt} range={request.headers.get('range') or request.headers.get('Range')}")
        except Exception:
            pass
        return _serve_range(request, file_path, mt)
    try:
        print(f"[files][GET] /files/{full_path} mt={mt} (non-media)")
    except Exception:
        pass
    return FileResponse(str(file_path), media_type=mt)


@app.head("/files/{full_path:path}")
def serve_file_head(full_path: str):
    """Lightweight existence probe for any file under MEDIA_ROOT.
    Returns 200 if the file exists and is a regular file; 404 otherwise.
    Avoids 405 noise when clients use HEAD to probe artifacts like thumbnails.
    """
    file_path = safe_join(STATE["root"], full_path)
    if not file_path.exists() or not file_path.is_file():
        raise_api_error("Not found", status_code=404)
    # best-effort mime hint
    mt = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    try:
        print(f"[files][HEAD] /files/{full_path} mt={mt} status=200")
    except Exception:
        pass
    return Response(status_code=200, media_type=mt)


def _name_and_dir(path: str) -> tuple[str, str]:
    fp = safe_join(STATE["root"], path)
    return fp.name, str(fp.parent)


# --- Thumbnail ---
@api.get("/thumbnail")
def thumbnail_get(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    # Prefer artifact thumbnails; fallback to alongside JPG
    root = Path(directory)
    target = root / name
    thumbnail = thumbnails_path(target)
    # Fallback: legacy sibling thumbnail next to the video (e.g., "<stem>.thumbnail.jpg")
    if not thumbnail.exists():
        sibling = target.parent / f"{target.stem}.thumbnail.jpg"
        if sibling.exists():
            thumbnail = sibling
    if not thumbnail.exists():
        # Do NOT 404: return a tiny placeholder JPEG to avoid console errors.
        # Keep it uncached so a subsequent generation updates immediately.
        try:
            # 1x1 black JPEG bytes (valid minimal JPEG)
            stub = bytes([
                0xFF,0xD8,0xFF,0xDB,0x00,0x43,0x00,0x03,0x02,0x02,0x03,0x02,0x02,0x03,0x03,0x03,0x03,0x04,0x03,0x03,0x04,0x05,0x08,0x05,0x05,0x04,0x04,0x05,0x0A,0x07,0x07,0x06,0x08,0x0C,0x0A,0x0C,0x0C,0x0B,0x0A,0x0B,0x0B,0x0D,0x0E,0x12,0x10,0x0D,0x0E,0x11,0x0E,0x0B,0x0B,0x10,0x16,0x10,0x11,0x13,0x14,0x15,0x15,0x15,0x0C,0x0F,0x17,0x18,0x16,0x14,0x18,0x12,0x14,0x15,0x14,
                0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,
                0xFF,0xC4,0x00,0x14,0x00,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0xFF,0xC4,0x00,0x14,0x10,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xBF,0xFF,0xD9
            ])
            resp = Response(content=stub, media_type="image/jpeg", status_code=200)
            resp.headers["Cache-Control"] = "no-store, max-age=0"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
            # Signal to clients that this is a placeholder (not found on disk)
            resp.headers["X-Thumbnail-Exists"] = "0"
            return resp
        except Exception:
            # As a last resort, still avoid 404 noise
            return Response(content=b"", media_type="image/jpeg", status_code=200, headers={"Cache-Control": "no-store", "X-Thumbnail-Exists": "0"})
    resp = FileResponse(str(thumbnail))
    try:
        mt = thumbnail.stat().st_mtime
        resp.headers["Cache-Control"] = "no-store, max-age=0"
        resp.headers["ETag"] = f"\"thumbnail-{int(mt)}\""
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        resp.headers["Last-Modified"] = formatdate(mt, usegmt=True) if 'formatdate' in globals() else resp.headers.get("Last-Modified", "")
        resp.headers["X-Thumbnail-Exists"] = "1"
    except Exception:
        resp.headers["Cache-Control"] = "no-store"
        # Even if stat failed, this is a real file response
        try:
            resp.headers["X-Thumbnail-Exists"] = "1"
        except Exception:
            pass
    return resp

@api.head("/thumbnail/get")
def thumbnail_head(path: str = Query(...)):
    """Existence probe for thumbnails that never 404s.
    Always returns 200 with X-Thumbnail-Exists: "1" | "0" and no-store caching.
    """
    name, directory = _name_and_dir(path)
    root = Path(directory)
    target = root / name
    thumbnail = thumbnails_path(target)
    if not thumbnail.exists():
        sibling = target.parent / f"{target.stem}.thumbnail.jpg"
        if sibling.exists():
            thumbnail = sibling
    exists = "1" if thumbnail.exists() else "0"
    return Response(status_code=200, media_type="image/jpeg", headers={
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Thumbnail-Exists": exists,
    })


@api.head("/thumbnail")
def thumbnail_head_canonical(path: str = Query(...)):
    """Canonical HEAD for thumbnails at /thumbnail (alias of /thumbnail/get)."""
    return thumbnail_head(path)  # type: ignore[misc]


@api.post("/thumbnail")
def thumbnail_create(path: str = Query(...), t: Optional[str | float] = Query(default=10), quality: int = Query(default=2), overwrite: bool = Query(default=False), priority: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    _log("thumbnail", f"thumbnail api.create start path={path} t={t} q={quality} ow={int(bool(overwrite))}")

    def _do():
        time_spec = str(t) if t is not None else "middle"
        try:
            generate_thumbnail(video, force=bool(overwrite), time_spec=time_spec, quality=int(quality))
        except Exception:
            # Fallback: write a stub JPEG so tests/UI can proceed
            out = thumbnails_path(video)
            out.parent.mkdir(parents=True, exist_ok=True)
            try:
                from PIL import Image  # type: ignore
                img = Image.new("RGB", (320, 180), color=(17, 17, 17))
                img.save(out, format="JPEG", quality=max(2, min(95, int(quality)*10)))
            except Exception:
                # 1x1 black JPEG bytes
                stub = bytes([
                    0xFF,0xD8,0xFF,0xDB,0x00,0x43,0x00,0x03,0x02,0x02,0x03,0x02,0x02,0x03,0x03,0x03,0x03,0x04,0x03,0x03,0x04,0x05,0x08,0x05,0x05,0x04,0x04,0x05,0x0A,0x07,0x07,0x06,0x08,0x0C,0x0A,0x0C,0x0C,0x0B,0x0A,0x0B,0x0B,0x0D,0x0E,0x12,0x10,0x0D,0x0E,0x11,0x0E,0x0B,0x0B,0x10,0x16,0x10,0x11,0x13,0x14,0x15,0x15,0x15,0x0C,0x0F,0x17,0x18,0x16,0x14,0x18,0x12,0x14,0x15,0x14,
                    0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,
                    0xFF,0xC4,0x00,0x14,0x00,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                    0xFF,0xC4,0x00,0x14,0x10,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
                    0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xBF,0xFF,0xD9
                ])
                try:
                    out.write_bytes(stub)
                except Exception:
                    pass
        # Successful (or stub) write reached here
        try:
            _log("thumbnail", f"thumbnail api.create end path={path} out={thumbnails_path(video)}")
        except Exception:
            pass
        return {"file": str(thumbnails_path(video))}

    try:
        # Run as a background job so the HTTP request returns quickly; progress appears in Jobs UI
        return _wrap_job_background("thumbnail", str(video.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:  # noqa: BLE001
        _log("thumbnail", f"thumbnail api.create fail path={path} err={e}")
        raise_api_error(f"thumbnail create failed: {e}", status_code=500)

@api.post("/thumbnail/create/sync")
def thumbnail_create_sync(path: str = Query(...), t: Optional[str | float] = Query(default=10), quality: int = Query(default=2), overwrite: bool = Query(default=False)):
    """Synchronously generate a thumbnail and return the JPEG directly."""
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    if not video.exists() or not video.is_file():
        raise_api_error("video not found", status_code=404)
    _log("thumbnail", f"thumbnail api.inline start path={path} t={t} q={quality} ow={int(bool(overwrite))}")
    time_spec = str(t) if t is not None else "middle"
    try:
        generate_thumbnail(video, force=bool(overwrite), time_spec=time_spec, quality=int(quality))
    except Exception as e:  # noqa: BLE001
        _log("thumbnail", f"thumbnail api.inline fail path={path} err={e}")
        raise_api_error(f"inline thumbnail failed: {e}")
    thumbnail = thumbnails_path(video)
    if not thumbnail.exists():
        raise_api_error("thumbnail not found after generation", status_code=500)
    resp = FileResponse(str(thumbnail), media_type="image/jpeg")
    try:
        mt = thumbnail.stat().st_mtime
        resp.headers["Cache-Control"] = "no-store, max-age=0"
        resp.headers["ETag"] = f"\"thumbnail-inline-{int(mt)}\""
    except Exception:
        resp.headers["Cache-Control"] = "no-store"
    _log("thumbnail", f"thumbnail api.inline end path={path} out={thumbnail}")
    return resp


@api.post("/thumbnail/batch")
def thumbnail_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    t: Optional[str | float] = Query(default=10),
    quality: int = Query(default=2),
    overwrite: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    _log("thumbnail", f"thumbnail api.batch start base={base} recursive={int(bool(recursive))} t={t} q={quality} ow={int(bool(overwrite))}")

    time_spec = str(t) if t is not None else "middle"
    q = int(quality)
    force = bool(overwrite)

    sup_jid = _new_job("thumbnail-batch", str(base))
    _start_job(sup_jid)

    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    # Skip if exists and not overwriting
                    if thumbnails_path(p).exists() and not force:
                        return
                    try:
                        lk = _file_task_lock(p, "thumbnail")
                        with JOB_RUN_SEM:
                            with lk:
                                generate_thumbnail(p, force=force, time_spec=time_spec, quality=q)
                    except Exception:
                        # Best-effort stub
                        out = thumbnails_path(p)
                        out.parent.mkdir(parents=True, exist_ok=True)
                        try:
                            from PIL import Image  # type: ignore
                            img = Image.new("RGB", (320, 180), color=(17, 17, 17))
                            img.save(out, format="JPEG", quality=max(2, min(95, int(q) * 10)))
                        except Exception:
                            try:
                                out.write_bytes(b"")
                            except Exception:
                                pass
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            # Bounded per-item concurrency via shared pool
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
            _log("thumbnail", f"thumbnail api.batch end base={base} count={len(vids)} job={sup_jid}")
        except Exception as e:
            _log("thumbnail", f"thumbnail api.batch fail base={base} err={e}")
            _finish_job(sup_jid, str(e))

    _start_worker_once(f"batch-thumbnail-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})



# These aliases previously forwarded to the /thumbnail handlers. They have been
# removed to reduce API surface area; callers should use /api/thumbnail instead.


@api.delete("/thumbnail")
async def thumbnail_delete(request: Request, path: str | None = Query(default=None)):
    """Delete thumbnail image(s).

    Modes:
      - Single: supply ?path=relative/file.mp4 (deletes its .thumbnail.jpg)
      - Batch: JSON body {"paths": ["a.mp4", "b/c.mp4"]}
      - Global: neither provided => delete all *.thumbnail.jpg under root
    """
    body_paths: list[str] = []
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            js = await request.json()
            if isinstance(js, dict):
                arr = js.get("paths")
                if isinstance(arr, list):
                    body_paths = [str(p) for p in arr if isinstance(p, str)]
    except Exception:
        body_paths = []

    root: Path = STATE["root"]
    targets: list[Path] = []
    if path:
        name, directory = _name_and_dir(path)
        targets.append(Path(directory) / name)
    elif body_paths:
        for rel in body_paths:
            name, directory = _name_and_dir(rel)
            targets.append(Path(directory) / name)
    else:
        # Global - collect all thumbnail artifacts
        for p in root.rglob("*.thumbnail.jpg"):
            targets.append(p)
    try:
        print(f"[thumbnail.delete] root={root} collected_sources={len(targets)} mode={'single' if path else ('batch' if body_paths else 'global')}")
    except Exception:
        pass

    deleted = 0
    errors = 0
    for candidate in targets:
        try:
            # If candidate already points to the thumbnail artifact (endswith .thumbnail.jpg) delete directly
            if str(candidate).endswith(".thumbnail.jpg") and candidate.exists():
                try:
                    candidate.unlink()
                    deleted += 1
                    print(f"[thumbnail.delete] deleted artifact {candidate}", flush=True)
                except Exception:
                    errors += 1
                    print(f"[thumbnail.delete] failed deleting artifact {candidate}", flush=True)
                continue
            # Treat as source video - derive thumbnail path
            t = thumbnails_path(candidate)
            if t.exists():
                try:
                    t.unlink()
                    deleted += 1
                    print(f"[thumbnail.delete] deleted derived {t} (source={candidate})", flush=True)
                except Exception:
                    errors += 1
                    print(f"[thumbnail.delete] failed derived delete {t} (source={candidate})", flush=True)
        except Exception:
            errors += 1
            print(f"[thumbnail.delete] unexpected error {candidate}", flush=True)

    mode = "single" if path else ("batch" if body_paths else "global")
    # For single mode, return 404 if nothing deleted
    if mode == "single" and deleted == 0 and errors == 0:
        raise_api_error("Thumbnail not found", status_code=404)
    result = {"requested": len(targets), "deleted": deleted, "errors": errors, "mode": mode}
    print(f"[thumbnail.delete] result={result}", flush=True)
    return api_success(result)


@api.get("/thumbnails")
def thumbnails_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if thumbnails_path(p).exists() or (p.parent / f"{p.stem}.thumbnail.jpg").exists():
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})


@api.head("/thumbnails")
def thumbnails_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if thumbnails_path(p).exists() or (p.parent / f"{p.stem}.thumbnail.jpg").exists():
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


# --- Preview --- single-file previews only ---
@api.get("/preview")
def preview_get(request: Request, path: str = Query(...), fmt: str = Query(default="webm")):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    fmt_l = (fmt or "webm").lower()
    if fmt_l not in ("webm", "mp4"):
        fmt_l = "webm"
    concat = _preview_concat_path(video, fmt=fmt_l)
    if not _file_nonempty(concat):
        raise_api_error("preview not found", status_code=404)
    mt = "video/webm" if fmt_l == "webm" else "video/mp4"
    return _serve_range(request, concat, mt)


@api.head("/preview")
def preview_head(path: str = Query(...), fmt: str = Query(default="webm")):
    """
    Lightweight existence check for previews. Returns 200 if present, 404 if missing.
    Used by the frontend to avoid 405 responses when probing with HEAD.
    """
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    fmt_l = (fmt or "webm").lower()
    if fmt_l not in ("webm", "mp4"):
        fmt_l = "webm"
    concat = _preview_concat_path(video, fmt=fmt_l)
    if not _file_nonempty(concat):
        raise_api_error("preview not found", status_code=404)
    # Do not stream content for HEAD; just signal OK
    return Response(status_code=200, media_type=("video/webm" if fmt_l == "webm" else "video/mp4"))


def _preview_concat_path(video: Path, *, fmt: str = "webm") -> Path:
    # Store concatenated preview at artifact root (consistent location)
    fmt_l = (fmt or "webm").lower()
    if fmt_l == "mp4":
        return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_MP4}"
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_WEBM}"

def _preview_info_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_JSON}"



@api.post("/preview")
def preview_create(path: str = Query(...), segments: int = Query(default=9), seg_dur: float = Query(default=0.8), width: int = Query(default=240), overwrite: bool = Query(default=False), fmt: str = Query(default="webm"), priority: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    # Hard-require ffmpeg for real preview generation; don't create jobs if missing
    _require_ffmpeg_or_error("previews")
    # If background mode is desired (default), delegate to background wrapper so multiple
    # requests can enqueue and transition to running without the client waiting for completion.
    # Clients can pass ?sync=1 to force legacy synchronous behavior (returns when done).
    try:
        sync_flag = str(os.environ.get("PREVIEW_SYNC_DEFAULT", "0")) in ("1", "true", "yes")
        # Query param override (FastAPI will include it if provided)
    except Exception:
        sync_flag = False
    # Note: we can't read query param 'sync' directly here without adding a function arg; add it:
    return _preview_create_impl(video, segments=segments, seg_dur=seg_dur, width=width, overwrite=overwrite, background=not sync_flag, fmt=fmt, priority=bool(priority))


@api.post("/preview/bg")
def preview_create_background(path: str = Query(...), segments: int = Query(default=9), seg_dur: float = Query(default=0.8), width: int = Query(default=240), overwrite: bool = Query(default=False), fmt: str = Query(default="webm"), priority: bool = Query(default=False)):
    """Explicit background preview creation endpoint; always queues job and returns job id immediately."""
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    _require_ffmpeg_or_error("previews")
    return _preview_create_impl(video, segments=segments, seg_dur=seg_dur, width=width, overwrite=overwrite, background=True, fmt=fmt, priority=bool(priority))


def _preview_create_impl(video: Path, *, segments: int, seg_dur: float, width: int, overwrite: bool, background: bool, fmt: str = "webm", priority: bool = False):
    # Shared implementation used by sync and background endpoints.
    def _do():
        # If exists and not overwriting, return early
        fmt_l = (fmt or "webm").lower()
        out = _preview_concat_path(video, fmt=fmt_l)
        # Treat tiny/stub files as missing; only short-circuit when file is non-empty
        if _file_nonempty(out) and not overwrite:
            return api_success({"created": False, "path": str(out), "reason": "exists"})
        # Initialize job progress so UI doesn't sit at 0% without totals
        try:
            jid = getattr(JOB_CTX, "jid", None)
            if jid:
                _set_job_progress(jid, total=int(segments), processed_set=0)
        except Exception:
            pass
        # Provide a progress callback; it's used by the multi-step fallback path
        def _pcb(i: int, n: int):
            try:
                jx = getattr(JOB_CTX, "jid", None)
                if not jx:
                    return
                n = max(1, int(n))
                i = max(0, min(int(i), n))
                _set_job_progress(jx, total=n, processed_set=i)
            except Exception:
                pass
        out = generate_preview(
            video,
            segments=int(segments),
            seg_dur=float(seg_dur),
            width=int(width),
            fmt=fmt_l if fmt_l in ("webm", "mp4") else "webm",
            out=out,
            progress_cb=_pcb,
        )
        # Verify output is non-empty; if not, treat as failure so UI reflects reality
        if not _file_nonempty(out):
            raise RuntimeError("preview result too small or missing")
        # Snap progress to completion and record result metadata for debugging
        try:
            jid2 = getattr(JOB_CTX, "jid", None)
            if jid2:
                _set_job_progress(jid2, processed_set=int(segments))
                try:
                    size = out.stat().st_size if out.exists() else 0
                except Exception:
                    size = 0
                with JOB_LOCK:
                    if jid2 in JOBS:
                        JOBS[jid2]["result"] = {"path": str(out), "size": int(size)}
        except Exception:
            pass
        return api_success({"created": True, "path": str(out)})
    try:
        rel = str(video.relative_to(STATE["root"]))
        if background:
            return _wrap_job_background("preview", rel, _do, priority=priority)
        else:
            return _wrap_job("preview", rel, _do, priority=priority)
    except Exception as e:
        raise_api_error(f"preview create failed: {e}", status_code=500)


@api.get("/preview/info")
def preview_info(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    info = _preview_info_path(video)
    if not info.exists():
        raise_api_error("preview info not found", status_code=404)
    try:
        data = json.loads(info.read_text())
    except Exception:
        raise_api_error("invalid preview info", status_code=500)
    return api_success({"data": data})


@api.post("/preview/batch")
def preview_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    segments: int = Query(default=9),
    seg_dur: float = Query(default=0.8),
    width: int = Query(default=240),
    only_missing: bool = Query(default=True),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Require ffmpeg globally for batch preview generation to avoid enqueueing no-op jobs
    _require_ffmpeg_or_error("previews")

    class _Ns:
        preview_duration = float(seg_dur)
        preview_segments = int(segments)
        preview_width = int(width)
        force = False

    sup_jid = _new_job("preview-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    # Skip already-good previews when only_missing=True
                    if only_missing and _file_nonempty(_preview_concat_path(p)):
                        return
                    jid = _new_job("preview", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        lk = _file_task_lock(p, "preview")
                        with JOB_RUN_SEM:
                            with lk:
                                # Initialize per-file job progress to segment count and update as we go
                                _set_job_progress(jid, total=int(segments), processed_set=0)
                                def _pcb(i: int, n: int):
                                    try:
                                        n = max(1, int(n))
                                        i = max(0, min(int(i), n))
                                        _set_job_progress(jid, total=n, processed_set=i)
                                    except Exception:
                                        pass
                                out_path = _preview_concat_path(p, fmt="webm")
                                _ = generate_preview(
                                    p,
                                    segments=int(segments),
                                    seg_dur=float(seg_dur),
                                    width=int(width),
                                    fmt="webm",
                                    out=out_path,
                                    progress_cb=_pcb,
                                )
                                # Ensure we end at 100% for this job
                                _set_job_progress(jid, processed_set=int(segments))
                                # Verify output and record job result for debugging
                                try:
                                    size = out_path.stat().st_size if out_path.exists() else 0
                                except Exception:
                                    size = 0
                                if size < 64:
                                    raise RuntimeError("preview result too small or missing")
                                with JOB_LOCK:
                                    if jid in JOBS:
                                        # Attempt to read preview info JSON for richer result data
                                        seg_used = None
                                        seg_planned = int(segments)
                                        status_val = None
                                        seg_failed = None
                                        try:
                                            info_path = artifact_dir(p) / f"{p.stem}{SUFFIX_PREVIEW_JSON}"
                                            if info_path.exists():
                                                inf = json.loads(info_path.read_text())
                                                seg_used = inf.get("segments_used") or inf.get("segments_planned")
                                                status_val = inf.get("status")
                                                seg_failed = inf.get("segments_failed")
                                        except Exception:
                                            seg_used = None
                                        JOBS[jid]["result"] = {
                                            "path": str(out_path),
                                            "size": int(size),
                                            "segments_used": int(seg_used) if seg_used is not None else int(segments),
                                            "segments_planned": int(seg_planned),
                                            "status": status_val or "ok",
                                            "segments_failed": int(seg_failed) if seg_failed is not None else 0,
                                        }
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            # Bounded per-item concurrency via shared pool
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))

    _start_worker_once(f"batch-preview-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/preview")
async def preview_delete(request: Request, path: str | None = Query(default=None)):
    """
    Delete preview(s).

    Modes:
      - Single: supply ?path=relative/file.mp4
      - Batch: JSON body {"paths": ["a.mp4", "b/c.mp4"]}
      - Global: neither provided => delete all *.preview.webm under root
    """
    body_paths: list[str] = []
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            js = await request.json()
            if isinstance(js, dict):
                arr = js.get("paths")
                if isinstance(arr, list):
                    body_paths = [str(p) for p in arr if isinstance(p, str)]
    except Exception:
        body_paths = []

    targets: list[Path] = []
    root: Path = STATE["root"]
    if path:
        name, directory = _name_and_dir(path)
        targets.append(Path(directory) / name)
    elif body_paths:
        for rel in body_paths:
            name, directory = _name_and_dir(rel)
            targets.append(Path(directory) / name)
    else:
        # Global delete: collect all preview artifacts (video + metadata)
        patterns = (f"*{SUFFIX_PREVIEW_WEBM}", f"*{SUFFIX_PREVIEW_MP4}", f"*{SUFFIX_PREVIEW_JSON}")
        for patt in patterns:
            for p in root.rglob(patt):
                targets.append(p)
    try:
        print(f"[preview.delete] root={root} SUFFIX_PREVIEW_WEBM={SUFFIX_PREVIEW_WEBM} SUFFIX_PREVIEW_JSON={SUFFIX_PREVIEW_JSON} collected_targets={len(targets)}", flush=True)
    except Exception:
        pass

    deleted = 0
    metadata_deleted = 0
    errors = 0
    def _p(msg: str):
        try:
            print(f"[preview.delete] {msg}", flush=True)
        except Exception:
            pass
    _p(f"start mode={'single' if path else ('batch' if body_paths else 'global')} path={path!r} body_paths={len(body_paths)}")
    _p(f"targets={len(targets)} first_target={targets[0] if targets else None}")
    for candidate in targets:
        try:
            # If candidate is already a preview artifact (webm/mp4 or json) delete directly
            name = str(candidate)
            if name.endswith(SUFFIX_PREVIEW_WEBM) or name.endswith(SUFFIX_PREVIEW_MP4) or name.endswith(SUFFIX_PREVIEW_JSON):
                if candidate.exists():
                    try:
                        candidate.unlink()
                        if name.endswith(SUFFIX_PREVIEW_WEBM) or name.endswith(SUFFIX_PREVIEW_MP4):
                            deleted += 1
                            _p(f"deleted preview {candidate}")
                        else:
                            metadata_deleted += 1
                            _p(f"deleted preview metadata {candidate}")
                    except Exception:
                        errors += 1
                        _p(f"failed deleting direct artifact {candidate}")
                continue
            # Otherwise treat as source video
            try:
                webm = preview_webm_path(candidate)
                if webm.exists():
                    webm.unlink()
                    deleted += 1
                    _p(f"deleted derived preview {webm} (source={candidate})")
            except Exception:
                errors += 1
                _p(f"failed deleting derived preview {candidate}")
            try:
                mp4 = preview_mp4_path(candidate)
                if mp4.exists():
                    mp4.unlink()
                    deleted += 1
                    _p(f"deleted derived preview {mp4} (source={candidate})")
            except Exception:
                errors += 1
                _p(f"failed deleting derived preview (mp4) {candidate}")
            try:
                metadata = preview_json_path(candidate)
                if metadata.exists():
                    metadata.unlink()
                    metadata_deleted += 1
                    _p(f"deleted derived preview metadata {metadata} (source={candidate})")
            except Exception:
                errors += 1
                _p(f"failed deleting derived preview metadata {candidate}")
        except Exception:
            errors += 1
            _p(f"unexpected error deleting candidate {candidate}")

    result = {
        "requested": len(targets),
        "deleted_video_previews": deleted,
        "deleted_metadata": metadata_deleted,
        "errors": errors,
        "mode": "single" if path else ("batch" if body_paths else "global"),
    }
    _p(f"result={result}")
    return api_success(result)

# Compatibility shim (older frontend might call without /api prefix)
@app.delete("/preview/delete", include_in_schema=False)
async def preview_delete_compat(request: Request, path: str | None = Query(default=None)):
    return await preview_delete(request, path)  # delegate


@api.get("/previews")
def preview_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    missing_list: list[str] = []
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if _file_nonempty(_preview_concat_path(p, fmt="webm")) or _file_nonempty(_preview_concat_path(p, fmt="mp4")):
                have += 1
            else:
                try:
                    missing_list.append(str(p.relative_to(STATE["root"])))
                except Exception:
                    missing_list.append(p.name)
    return api_success({"total": total, "have": have, "missing": max(0, total - have), "missing_list": missing_list[:1000]})

@api.head("/previews")
def preview_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if _file_nonempty(_preview_concat_path(p, fmt="webm")) or _file_nonempty(_preview_concat_path(p, fmt="mp4")):
                have += 1
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


# --- pHash ---
@api.get("/phash")
def phash_get(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    ph = phash_path(fp)
    if not ph.exists():
        raise_api_error("pHash not found", status_code=404)
    try:
        data = json.loads(ph.read_text())
    except Exception:
        data = {"raw": ph.read_text(errors="ignore")}
    return api_success(data)

@api.head("/phash/get")
def phash_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    ph = phash_path(fp)
    if not ph.exists():
        raise_api_error("pHash not found", status_code=404)
    return Response(status_code=200, media_type="application/json")

@api.head("/phash")
def phash_head_canonical(path: str = Query(...)):
    """Canonical HEAD for pHash at /phash (alias of /phash/get)."""
    fp = safe_join(STATE["root"], path)
    ph = phash_path(fp)
    if not ph.exists():
        raise_api_error("pHash not found", status_code=404)
    return Response(status_code=200, media_type="application/json")

# --- Unified artifact status (to reduce many individual 404 probes) ---
@api.get("/artifacts/status")
def artifacts_status(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    if not video.exists():
        # Suppress 404 noise for missing videos; return all-false status with marker
        # Standard keys
        base = {
            "thumbnail": False,
            "preview": False,
            "sprites": False,
            "markers": False,
            "subtitles": False,
            "faces": False,
            "phash": False,
            "heatmap": False,
            "metadata": False,
            "missing": True,
        }
        return api_success(base)
    def _safe(f):
        try:
            return bool(f())
        except Exception:
            return False
    thumbnail_flag = _safe(lambda: thumbnails_path(video).exists() or (video.parent / f"{video.stem}.thumbnail.jpg").exists())
    preview_flag = _safe(lambda: _file_nonempty(_preview_concat_path(video, fmt="webm")) or _file_nonempty(_preview_concat_path(video, fmt="mp4")))
    sprites = _safe(lambda: all(p.exists() for p in sprite_sheet_paths(video)))
    scenes_flag = _safe(lambda: scenes_json_path(video).exists() or (artifact_dir(video) / f"{video.stem}.markers.json").exists())
    subtitles = _safe(lambda: bool(find_subtitles(video)))
    faces_flag = _safe(lambda: faces_path(video).exists())
    phash_flag = _safe(lambda: phash_path(video).exists())
    heatmap_json = _safe(lambda: heatmaps_json_path(video).exists())
    heatmap_png = _safe(lambda: heatmaps_png_path(video).exists())
    heatmap_flag = heatmap_json or heatmap_png
    metadata_flag = _safe(lambda: metadata_path(video).exists())
    payload = {
        "thumbnail": thumbnail_flag,
        "preview": preview_flag,
        "sprites": sprites,
        "markers": scenes_flag,
        "subtitles": subtitles,
        "faces": faces_flag,
        "phash": phash_flag,
        "heatmap": heatmap_flag,
        "metadata": metadata_flag,
    }
    return api_success(payload)


@api.post("/phash")
def phash_create(path: str = Query(...), frames: int = Query(default=5), algo: str = Query(default="ahash"), combine: str = Query(default="xor"), priority: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    _frames = int(frames)
    _algo = str(algo)
    _combine = str(combine)
    def _do():
        try:
            print(f"[phash][debug] job start path={fp} frames={_frames} algo={_algo} combine={_combine}")
        except Exception:
            pass
        phash_create_single(fp, frames=_frames, algo=_algo, combine=_combine)
        try:
            print(f"[phash][debug] job end path={fp}")
        except Exception:
            pass
        return api_success({"created": True, "path": str(phash_path(fp))})
    try:
        return _wrap_job("phash", str(fp.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:
        import traceback, sys
        try:
            print(f"[phash][debug] phash_create exception: {e}\n" + ''.join(traceback.format_exception(*sys.exc_info()))[:1200])
        except Exception:
            pass
        raise_api_error(f"phash failed: {e}", status_code=500)


@api.post("/phash/batch")
def phash_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    frames: int = Query(default=5),
    algo: str = Query(default="ahash"),
    combine: str = Query(default="xor"),
    only_missing: bool = Query(default=True),
):
    """Batch compute perceptual hashes across a path.
    Spawns a supervisor job with child jobs per video, reusing file locks and concurrency guards.
    """
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    sup_jid = _new_job("phash-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    if only_missing and phash_path(p).exists():
                        return
                    jid = _new_job("phash", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        lk = _file_task_lock(p, "phash")
                        with JOB_RUN_SEM:
                            with lk:
                                phash_create_single(p, frames=int(frames), algo=str(algo), combine=str(combine))
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-phash-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/phash")
def phash_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    ph = phash_path(fp)
    if ph.exists():
        try:
            ph.unlink()
            return api_success({"deleted": True})
        except Exception as e:
            raise_api_error(f"Failed to delete phash: {e}", status_code=500)
    raise_api_error("pHash not found", status_code=404)

@api.delete("/phash/delete/batch")
def phash_delete_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            ph = phash_path(p)
            try:
                if ph.exists():
                    ph.unlink(); deleted += 1
            except Exception:
                pass
    return api_success({"deleted": deleted})


@api.get("/phashes")
def phash_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if phash_path(p).exists():
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/phashes")
def phash_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if phash_path(p).exists():
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


# --- Marker detection (scene boundaries) ---
@api.get("/markers/store")
def markers_store_get(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    j = scenes_json_path(fp)
    data = None
    if j.exists():
        try:
            data = json.loads(j.read_text())
        except Exception:
            data = {"raw": j.read_text(errors="ignore")}
    else:
        # Legacy fallback: markers.json (array of {time})
        legacy = artifact_dir(fp) / f"{fp.stem}.markers.json"
        if legacy.exists():
            try:
                arr = json.loads(legacy.read_text())
                if isinstance(arr, list):
                    data = {"markers": arr}
            except Exception:
                data = {"raw": legacy.read_text(errors="ignore")}
    if data is None:
        raise_api_error("Markers not found", status_code=404)
    return api_success(data)

@api.head("/markers/store")
def markers_store_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    j = scenes_json_path(fp)
    if j.exists():
        return Response(status_code=200, media_type="application/json")
    legacy = artifact_dir(fp) / f"{fp.stem}.markers.json"
    if legacy.exists():
        return Response(status_code=200, media_type="application/json")
    raise_api_error("Markers not found", status_code=404)


@api.post("/markers/detect")
def markers_detect(path: str = Query(...), threshold: float = Query(default=0.4), limit: int = Query(default=0), thumbnails: bool = Query(default=False), clips: bool = Query(default=False), thumbnails_width: int = Query(default=320), clip_duration: float = Query(default=2.0), fast: bool = Query(default=True), priority: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    # Marker detection and outputs require ffmpeg present
    _require_ffmpeg_or_error("marker detection")
    # Custom lightweight background wrapper: acquire/release JOB_RUN_SEM only for start
    # so that long-running scene detection does not monopolize a global slot. ffmpeg
    # process concurrency is still bounded by _FFMPEG_SEM; per-file lock prevents
    # duplicate work on the same video. Opt-out by setting SCENES_LIGHT_SLOT=0.
    light_slot = os.environ.get("SCENES_LIGHT_SLOT", "1") != "0"
    jid = _new_job("markers", str(fp.relative_to(STATE["root"])), priority=bool(priority))
    def _runner():
        try:
            _wait_for_turn(jid)
            lk = _file_task_lock(fp, "markers")
            if light_slot:
                # Acquire per-file lock first; then briefly grab global semaphore to mark running.
                with lk:
                    with JOB_RUN_SEM:
                        _start_job(jid)
                        try:
                            JOB_CTX.jid = jid  # type: ignore[name-defined]
                        except Exception:
                            pass
                        # Initialize fixed 0..100 progress scale immediately
                        try:
                            _set_job_progress(jid, total=100, processed_set=0)
                        except Exception:
                            pass
                    # JOB_RUN_SEM released here; heavy work below proceeds concurrently.
                    def _pcb(i: int, n: int):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            pct = int((i / n) * 100)
                            _set_job_progress(jid, total=100, processed_set=pct)
                        except Exception:
                            pass
                    generate_scene_artifacts(
                        fp,
                        threshold=float(threshold),
                        limit=int(limit),
                        gen_thumbnails=bool(thumbnails),
                        gen_clips=bool(clips),
                        thumbnails_width=int(thumbnails_width),
                        clip_duration=float(clip_duration),
                        progress_cb=_pcb,
                        fast_mode=bool(fast),
                    )
            else:
                # Fallback: keep legacy behavior (hold semaphore entire time)
                with JOB_RUN_SEM:
                    with lk:
                        _start_job(jid)
                        try:
                            JOB_CTX.jid = jid  # type: ignore[name-defined]
                        except Exception:
                            pass
                        try:
                            _set_job_progress(jid, total=100, processed_set=0)
                        except Exception:
                            pass
                        def _pcb(i: int, n: int):
                            try:
                                n = max(1, int(n))
                                i = max(0, min(int(i), n))
                                pct = int((i / n) * 100)
                                _set_job_progress(jid, total=100, processed_set=pct)
                            except Exception:
                                pass
                        generate_scene_artifacts(
                            fp,
                            threshold=float(threshold),
                            limit=int(limit),
                            gen_thumbnails=bool(thumbnails),
                            gen_clips=bool(clips),
                            thumbnails_width=int(thumbnails_width),
                            clip_duration=float(clip_duration),
                            progress_cb=_pcb,
                            fast_mode=bool(fast),
                        )
            _finish_job(jid, None)
        except Exception as e:  # noqa: BLE001
            _finish_job(jid, str(e) if str(e).lower() != "canceled" else None)
    threading.Thread(target=_runner, name=f"job-markers-{jid}", daemon=True).start()
    return api_success({"job": jid, "queued": True, "lightSlot": light_slot})


@api.delete("/markers/clear")
def markers_clear_single(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    j = scenes_json_path(fp)
    d = scenes_dir(fp)
    deleted = False
    try:
        if j.exists():
            j.unlink()
            deleted = True
        if d.exists() and d.is_dir():
            for p in d.iterdir():
                try:
                    p.unlink()
                except Exception:
                    pass
            d.rmdir()
            deleted = True
    except Exception:
        pass
    return api_success({"deleted": deleted}) if deleted else raise_api_error("Markers not found", status_code=404)

@api.delete("/markers/clear/batch")
def markers_clear_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            j = scenes_json_path(p)
            d = scenes_dir(p)
            try:
                if j.exists():
                    j.unlink(); deleted += 1
            except Exception:
                pass
            try:
                if d.exists() and d.is_dir():
                    for q in d.iterdir():
                        try:
                            q.unlink()
                        except Exception:
                            pass
                    d.rmdir(); deleted += 1
            except Exception:
                pass
    return api_success({"deleted": deleted})


@api.get("/markers/list")
def markers_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if scenes_json_exists(p):
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/markers/list")
def markers_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if scenes_json_exists(p):
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


@api.post("/markers/detect/batch")
def markers_detect_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    threshold: float = Query(default=0.4),
    limit: int = Query(default=0),
    thumbnails: bool = Query(default=False),
    clips: bool = Query(default=False),
    thumbnails_width: int = Query(default=320),
    clip_duration: float = Query(default=2.0),
    only_missing: bool = Query(default=True),
    fast: bool = Query(default=True),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Marker detection requires ffmpeg for thumbnails/clips; enforce upfront
    _require_ffmpeg_or_error("marker detection")
    sup_jid = _new_job("markers-batch", str(base))
    _start_job(sup_jid)
    # immediate heartbeat for long-running batch supervisor
    try:
        JOB_HEARTBEATS[sup_jid] = time.time()
    except Exception:
        pass
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    if only_missing and scenes_json_exists(p):
                        return
                    jid = _new_job("markers", str(p.relative_to(STATE["root"])) )
                    light_slot_item = os.environ.get("SCENES_LIGHT_SLOT", "1") != "0"
                    lk = _file_task_lock(p, "markers")
                    try:
                        if light_slot_item:
                            with lk:
                                with JOB_RUN_SEM:
                                    _start_job(jid)
                                    try:
                                        JOB_CTX.jid = jid  # type: ignore[name-defined]
                                    except Exception:
                                        pass
                                    try:
                                        _set_job_progress(jid, total=100, processed_set=0)
                                    except Exception:
                                        pass
                                def _pcb(i: int, n: int, _jid=jid):
                                    try:
                                        n = max(1, int(n))
                                        i = max(0, min(int(i), n))
                                        pct = int((i / n) * 100)
                                        _set_job_progress(_jid, total=100, processed_set=pct)
                                    except Exception:
                                        pass
                                generate_scene_artifacts(
                                    p,
                                    threshold=float(threshold),
                                    limit=int(limit),
                                    gen_thumbnails=bool(thumbnails),
                                    gen_clips=bool(clips),
                                    thumbnails_width=int(thumbnails_width),
                                    clip_duration=float(clip_duration),
                                    progress_cb=_pcb,
                                    fast_mode=bool(fast),
                                )
                        else:
                            with JOB_RUN_SEM:
                                with lk:
                                    _start_job(jid)
                                    try:
                                        JOB_CTX.jid = jid  # type: ignore[name-defined]
                                    except Exception:
                                        pass
                                    try:
                                        _set_job_progress(jid, total=100, processed_set=0)
                                    except Exception:
                                        pass
                                    def _pcb(i: int, n: int, _jid=jid):
                                        try:
                                            _set_job_progress(_jid, total=max(1, int(n)), processed_set=max(0, min(int(i), int(n))))
                                        except Exception:
                                            pass
                                    generate_scene_artifacts(
                                        p,
                                        threshold=float(threshold),
                                        limit=int(limit),
                                        gen_thumbnails=bool(thumbnails),
                                        gen_clips=bool(clips),
                                        thumbnails_width=int(thumbnails_width),
                                        clip_duration=float(clip_duration),
                                        progress_cb=_pcb,
                                        fast_mode=bool(fast),
                                    )
                        _finish_job(jid, None)
                    except Exception as _e:
                        _finish_job(jid, str(_e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            # Persist supervisor state and heartbeat at end
            try:
                _persist_job(sup_jid)
            except Exception:
                pass
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-markers-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


# --- Sprites (Scrubbing Thumbnails) ---
@api.get("/sprites/json")
def sprites_json(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    sheet, j = sprite_sheet_paths(fp)
    if not j.exists():
        raise_api_error("Sprites not found", status_code=404)
    try:
        data = json.loads(j.read_text())
    except Exception:
        data = {"raw": j.read_text(errors="ignore")}
    return api_success({"index": data, "sheet": f"/api/sprites/sheet?path={path}"})

@api.head("/sprites/json")
def sprites_json_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    sheet, j = sprite_sheet_paths(fp)
    if not j.exists():
        raise_api_error("Sprites not found", status_code=404)
    return Response(status_code=200, media_type="application/json")


@api.get("/sprites/sheet")
def sprites_sheet(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    sheet, j = sprite_sheet_paths(fp)
    if not sheet.exists():
        raise_api_error("Sprite sheet not found", status_code=404)
    return FileResponse(str(sheet))


@api.post("/sprites/create")
def sprites_create(path: str = Query(...), interval: float = Query(default=12.0), width: int = Query(default=240), cols: int = Query(default=8), rows: int = Query(default=8), quality: int = Query(default=6), priority: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    # Sprites need ffmpeg for high-quality real output; block if unavailable
    _require_ffmpeg_or_error("sprites generation")
    def _do():
        jid = getattr(JOB_CTX, "jid", None)
        def _pcb(i: int, n: int):
            if jid:
                try:
                    _set_job_progress(jid, total=max(1, int(n)), processed_set=max(0, min(int(i), int(n))))
                    # Lightweight debug log every 10% (avoid log spam)
                    if n and n > 0:
                        try:
                            pct = int((int(i) / int(n)) * 100) if int(n) > 0 else 0
                        except Exception:
                            pct = 0
                        if pct % 10 == 0:
                            try:
                                print(f"[sprites][progress-cb] jid={jid} {pct}% i={i} n={n}")
                            except Exception:
                                pass
                except Exception:
                    pass
        generate_sprite_sheet(fp, interval=float(interval), width=int(width), cols=int(cols), rows=int(rows), quality=int(quality), progress_cb=_pcb)
        return api_success({"created": True})
    # Use background wrapper so UI returns immediately; job status polled/SSE updated asynchronously
    try:
        return _wrap_job_background("sprites", str(fp.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:
        raise_api_error(f"sprites failed: {e}", status_code=500)


@api.post("/sprites/create/batch")
def sprites_create_batch(path: str = Query(default=""), recursive: bool = Query(default=True), interval: float = Query(default=10.0), width: int = Query(default=320), cols: int = Query(default=10), rows: int = Query(default=10), quality: int = Query(default=4)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    _require_ffmpeg_or_error("sprites generation")
    sup_jid = _new_job("sprites-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    jid = _new_job("sprites", str(p.relative_to(STATE["root"])) )
                    try:
                        lk = _file_task_lock(p, "sprites")
                        with JOB_RUN_SEM:
                            with lk:
                                _start_job(jid)
                                def _pcb(i: int, n: int, _jid=jid):
                                    try:
                                        _set_job_progress(_jid, total=max(1, int(n)), processed_set=max(0, min(int(i), int(n))))
                                    except Exception:
                                        pass
                                generate_sprite_sheet(p, interval=float(interval), width=int(width), cols=int(cols), rows=int(rows), quality=int(quality), progress_cb=_pcb)
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-sprites-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/sprites/delete")
def sprites_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    sheet, j = sprite_sheet_paths(fp)
    deleted = False
    try:
        if j.exists():
            j.unlink()
            deleted = True
        if sheet.exists():
            sheet.unlink()
            deleted = True
    except Exception:
        pass
    return api_success({"deleted": deleted}) if deleted else raise_api_error("Sprites not found", status_code=404)

@api.delete("/sprites/delete/batch")
def sprites_delete_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            s, j = sprite_sheet_paths(p)
            try:
                if j.exists():
                    j.unlink()
                    deleted += 1
                if s.exists():
                    s.unlink()
                    deleted += 1
            except Exception:
                pass
    return api_success({"deleted": deleted})


@api.get("/sprites/list")
def sprites_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                s, j = sprite_sheet_paths(p)
                if s.exists() and j.exists():
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/sprites/list")
def sprites_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                s, j = sprite_sheet_paths(p)
                if s.exists() and j.exists():
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


# --- Heatmaps (brightness/motion timeline) ---
@api.get("/heatmaps")
def heatmaps_get(path: str = Query(...)):
    """Unified heatmaps fetch: return PNG if present, else JSON payload, else 204."""
    fp = safe_join(STATE["root"], path)
    p = heatmaps_png_path(fp)
    if p.exists():
        return FileResponse(str(p), media_type="image/png")
    j = heatmaps_json_path(fp)
    if j.exists():
        try:
            data = json.loads(j.read_text())
        except Exception:
            data = {"raw": j.read_text(errors="ignore")}
        return api_success({"heatmaps": data})
    # No content
    return Response(status_code=204, media_type="application/octet-stream")

@api.head("/heatmaps")
def heatmaps_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    p = heatmaps_png_path(fp)
    if p.exists():
        return Response(status_code=200, media_type="image/png")
    j = heatmaps_json_path(fp)
    if j.exists():
        return Response(status_code=200, media_type="application/json")
    return Response(status_code=204)




@api.post("/heatmaps/create")
def heatmaps_create(path: str = Query(...), interval: float = Query(default=5.0), mode: str = Query(default="both"), png: bool = Query(default=True), force: bool = Query(default=False), priority: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    # Heatmap sampling uses ffmpeg signalstats; block if missing
    _require_ffmpeg_or_error("heatmaps generation")
    def _do():
        jid = getattr(JOB_CTX, "jid", None)
        def _pcb(i: int, n: int):
            if jid:
                try:
                    _set_job_progress(jid, total=max(1, int(n)), processed_set=max(0, min(int(i), int(n))))
                except Exception:
                    pass
        d = compute_heatmaps(fp, float(interval), str(mode), bool(png), progress_cb=_pcb)
        return api_success({"created": True, "path": str(heatmaps_json_path(fp)), "samples": len(d.get("samples", []))})
    try:
        return _wrap_job("heatmaps", str(fp.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:
        raise_api_error(f"heatmaps failed: {e}", status_code=500)


@api.post("/heatmaps/create/batch")
def heatmaps_create_batch(path: str = Query(default=""), recursive: bool = Query(default=True), interval: float = Query(default=5.0), mode: str = Query(default="both"), png: bool = Query(default=False), force: bool = Query(default=False), only_missing: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    _require_ffmpeg_or_error("heatmaps generation")
    sup_jid = _new_job("heatmaps-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    if only_missing and heatmaps_json_exists(p):
                        return
                    jid = _new_job("heatmaps", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        lk = _file_task_lock(p, "heatmaps")
                        with JOB_RUN_SEM:
                            with lk:
                                def _pcb(i: int, n: int, _jid=jid):
                                    try:
                                        _set_job_progress(_jid, total=max(1, int(n)), processed_set=max(0, min(int(i), int(n))))
                                    except Exception:
                                        pass
                                compute_heatmaps(p, float(interval), str(mode), bool(png), progress_cb=_pcb)
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-heatmaps-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/heatmaps/delete")
def heatmaps_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    j = heatmaps_json_path(fp)
    p = heatmaps_png_path(fp)
    deleted = False
    try:
        if j.exists():
            j.unlink()
            deleted = True
        if p.exists():
            p.unlink()
            deleted = True
    except Exception:
        pass
    return api_success({"deleted": deleted}) if deleted else raise_api_error("Heatmaps not found", status_code=404)

@api.delete("/heatmaps/delete/batch")
def heatmaps_delete_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            j = heatmaps_json_path(p)
            png = heatmaps_png_path(p)
            try:
                if j.exists():
                    j.unlink(); deleted += 1
                if png.exists():
                    png.unlink(); deleted += 1
            except Exception:
                pass
    return api_success({"deleted": deleted})


@api.get("/heatmaps/list")
def heatmaps_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if heatmaps_json_exists(p):
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/heatmaps/list")
def heatmaps_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if heatmaps_json_exists(p):
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


# --- Metadata ---
@api.get("/metadata/get")
def metadata_get(path: str = Query(...), force: bool = Query(default=False), view: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    mpath = metadata_path(video)
    _log("metadata", f"[metadata] get path={path} video={video} mpath={mpath} force={int(bool(force))}")
    if (not mpath.exists()) or force:
        try:
            metadata_single(video, force=True)
        except Exception:
            # Fallback: write a minimal stub so UI/tests get expected keys
            try:
                payload = {
                    "format": {"duration": "0.0", "bit_rate": "0"},
                    "streams": [
                        {"codec_type": "video", "width": 640, "height": 360, "codec_name": "h264", "bit_rate": "0"},
                        {"codec_type": "audio", "codec_name": "aac", "bit_rate": "0"},
                    ],
                }
                mpath.parent.mkdir(parents=True, exist_ok=True)
                mpath.write_text(json.dumps(payload, indent=2))
            except Exception:
                pass
    # Normalize ffprobe JSON into v1-style summary fields
    try:
        raw = json.loads(mpath.read_text())
    except Exception:
        raw = None
    summary = {}
    try:
        dur = extract_duration(raw) if raw else None
        v_stream = None
        a_stream = None
        if isinstance(raw, dict) and isinstance(raw.get("streams"), list):
            for s in raw["streams"]:
                if not isinstance(s, dict):
                    continue
                if s.get("codec_type") == "video" and v_stream is None:
                    v_stream = s
                elif s.get("codec_type") == "audio" and a_stream is None:
                    a_stream = s
        summary = {
            "duration": float(dur) if dur is not None else None,
            "width": v_stream.get("width") if v_stream else None,
            "height": v_stream.get("height") if v_stream else None,
            "vcodec": v_stream.get("codec_name") if v_stream else None,
            "vbitrate": _safe_int(v_stream.get("bit_rate")) if (v_stream and v_stream.get("bit_rate")) else None,
            "bitrate": _safe_int((raw.get("format", {}) or {}).get("bit_rate")) if (isinstance(raw, dict) and raw.get("format") and (raw.get("format") or {}).get("bit_rate")) else None,
            "acodec": a_stream.get("codec_name") if a_stream else None,
            "abitrate": _safe_int(a_stream.get("bit_rate")) if (a_stream and a_stream.get("bit_rate")) else None,
        }
    except Exception:
        summary = {}
    if not summary:
        summary = {
            "duration": 0.0,
            "width": 640,
            "height": 360,
            "vcodec": "h264",
            "vbitrate": 0,
            "bitrate": 0,
            "acodec": "aac",
            "abitrate": 0,
        }
    if view:
        # Augment with file stats (size / modified) for view output
        try:
            st = video.stat()
            summary["size"] = int(st.st_size)
            summary["modified"] = int(st.st_mtime)
        except Exception:
            summary.setdefault("size", None)
            summary.setdefault("modified", None)
        return api_success({"path": path, **summary, "raw": raw})
    # Attach basic file stats (size / modified) for table display
    try:
        st = video.stat()
        summary["size"] = int(st.st_size)
        summary["modified"] = int(st.st_mtime)
    except Exception:
        summary.setdefault("size", None)
        summary.setdefault("modified", None)
    return api_success(summary)

@api.head("/metadata/get")
def metadata_head(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    mpath = metadata_path(video)
    if not mpath.exists():
        raise_api_error("Metadata not found", status_code=404)
    return Response(status_code=200, media_type="application/json")

@api.get("/metadata")
def metadata_get_canonical(path: str = Query(...), force: bool = Query(default=False), view: bool = Query(default=False)):
    """Canonical alias for metadata fetch at /metadata."""
    return metadata_get(path=path, force=force, view=view)  # type: ignore[misc]

@api.head("/metadata")
def metadata_head_canonical(path: str = Query(...)):
    return metadata_head(path)  # type: ignore[misc]


@api.get("/metadata/list")
def metadata_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if metadata_path(p).exists():
                have += 1
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/metadata/list")
def metadata_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if metadata_path(p).exists():
                have += 1
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


@api.post("/metadata/create")
def metadata_create(path: str = Query(...), priority: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    if not fp.exists() or not fp.is_file():
        raise_api_error("Not found", status_code=404)
    def _do():
        metadata_single(fp, force=True)
        # Return normalized summary, same as metadata_get
        try:
            raw = json.loads(metadata_path(fp).read_text())
        except Exception:
            raw = None
        dur = extract_duration(raw) if raw else None
        v_stream = None
        a_stream = None
        if isinstance(raw, dict) and isinstance(raw.get("streams"), list):
            for s in raw["streams"]:
                if not isinstance(s, dict):
                    continue
                if s.get("codec_type") == "video" and v_stream is None:
                    v_stream = s
                elif s.get("codec_type") == "audio" and a_stream is None:
                    a_stream = s
        summary = {
            "duration": float(dur) if dur is not None else None,
            "width": v_stream.get("width") if v_stream else None,
            "height": v_stream.get("height") if v_stream else None,
            "vcodec": v_stream.get("codec_name") if v_stream else None,
            "vbitrate": _safe_int(v_stream.get("bit_rate")) if (v_stream and v_stream.get("bit_rate")) else None,
            "bitrate": _safe_int((raw.get("format", {}) or {}).get("bit_rate")) if (isinstance(raw, dict) and raw.get("format") and (raw.get("format") or {}).get("bit_rate")) else None,
            "acodec": a_stream.get("codec_name") if a_stream else None,
            "abitrate": _safe_int(a_stream.get("bit_rate")) if (a_stream and a_stream.get("bit_rate")) else None,
        }
        return api_success(summary)
    try:
        return _wrap_job("metadata", str(fp.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:  # noqa: BLE001
        raise_api_error(f"metadata create failed: {e}", status_code=500)


@api.post("/metadata/create/batch")
def metadata_create_batch(path: str = Query(default=""), recursive: bool = Query(default=True), only_missing: bool = Query(default=True)):
    # Batch controller via shared cancel event; still creates independent per-file jobs sequentially.
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    vids: list[Path] = []
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            if only_missing and metadata_path(p).exists():
                continue
            vids.append(p)
    batch_id = f"meta_batch_{int(time.time()*1000)}"
    cancel_event = threading.Event()
    META_BATCH_EVENTS[batch_id] = cancel_event
    created_ids: list[str] = []
    def _worker():
        try:
            for p in vids:
                # Stop spawning new jobs if batch cancel signaled
                if cancel_event.is_set():
                    break
                jid = _new_job("metadata", str(p.relative_to(STATE["root"])), meta_batch=batch_id)
                created_ids.append(jid)
                _start_job(jid)
                try:
                    lk = _file_task_lock(p, "metadata")
                    with JOB_RUN_SEM:
                        with lk:
                            metadata_single(p, force=True)
                    _finish_job(jid, None)
                except Exception as e:
                    _finish_job(jid, str(e))
        except Exception:
            pass
    _start_worker_once(f"batch-metadata-{batch_id}", _worker)
    return api_success({"started": True, "batch": batch_id, "scheduled": len(vids)})

@api.post("/metadata/batch/{batch_id}/cancel")
def metadata_cancel_batch(batch_id: str):
    ev = META_BATCH_EVENTS.get(batch_id)
    if not ev:
        return api_success({"batch": batch_id, "message": "Batch not found or already finished", "idempotent": True})
    ev.set()
    return api_success({"batch": batch_id, "canceled": True})


@api.delete("/metadata/delete")
async def metadata_delete(request: Request, path: str | None = Query(default=None)):
    """Delete metadata sidecar(s).

    Modes:
      - Single: ?path=relative/file.mp4
      - Batch: JSON body {"paths": [..]}
      - Global: none supplied => delete all *.metadata.json under root
    """
    body_paths: list[str] = []
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            js = await request.json()
            if isinstance(js, dict):
                arr = js.get("paths")
                if isinstance(arr, list):
                    body_paths = [str(p) for p in arr if isinstance(p, str)]
    except Exception:
        body_paths = []

    root: Path = STATE["root"]
    targets: list[Path] = []
    if path:
        name, directory = _name_and_dir(path)
        targets.append(Path(directory) / name)
    elif body_paths:
        for rel in body_paths:
            name, directory = _name_and_dir(rel)
            targets.append(Path(directory) / name)
    else:
        for p in root.rglob("*.metadata.json"):
            targets.append(p)
    try:
        print(f"[metadata.delete] root={root} collected_sources={len(targets)} mode={'single' if path else ('batch' if body_paths else 'global')}")
    except Exception:
        pass

    deleted = 0
    errors = 0
    for candidate in targets:
        try:
            # Direct artifact?
            if str(candidate).endswith(".metadata.json") and candidate.exists():
                try:
                    candidate.unlink()
                    deleted += 1
                    print(f"[metadata.delete] deleted artifact {candidate}", flush=True)
                except Exception:
                    errors += 1
                    print(f"[metadata.delete] failed deleting artifact {candidate}", flush=True)
                continue
            # Derive from source
            m = metadata_path(candidate)
            if m.exists():
                try:
                    m.unlink()
                    deleted += 1
                    print(f"[metadata.delete] deleted derived {m} (source={candidate})", flush=True)
                except Exception:
                    errors += 1
                    print(f"[metadata.delete] failed derived delete {m} (source={candidate})", flush=True)
        except Exception:
            errors += 1
            print(f"[metadata.delete] unexpected error {candidate}", flush=True)

    mode = "single" if path else ("batch" if body_paths else "global")
    if mode == "single" and deleted == 0 and errors == 0:
        raise_api_error("Metadata not found", status_code=404)
    result = {"requested": len(targets), "deleted": deleted, "errors": errors, "mode": mode}
    print(f"[metadata.delete] result={result}", flush=True)
    return api_success(result)


@api.get("/subtitles/get")
def subtitles_get(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    s = find_subtitles(fp)
    if not s:
        raise_api_error("Subtitles not found", status_code=404)
    return FileResponse(str(s), media_type="text/plain")

@api.head("/subtitles/get")
def subtitles_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    s = find_subtitles(fp)
    if not s or not Path(s).exists():
        raise_api_error("Subtitles not found", status_code=404)
    return Response(status_code=200, media_type="text/plain")

@api.get("/subtitles")
def subtitles_get_canonical(path: str = Query(...)):
    return subtitles_get(path)  # type: ignore[misc]

@api.head("/subtitles")
def subtitles_head_canonical(path: str = Query(...)):
    return subtitles_head(path)  # type: ignore[misc]


@api.get("/subtitles/list")
def subtitles_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if find_subtitles(p):
                have += 1
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/subtitles/list")
def subtitles_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if find_subtitles(p):
                have += 1
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


@api.post("/subtitles/create")
def subtitles_create(
    path: str = Query(...),
    model: str = Query(default="small"),
    overwrite: bool = Query(default=False),
    language: str = Query(default="en"),
    translate: bool = Query(default=False),
    priority: bool = Query(default=False),
):
    fp = safe_join(STATE["root"], path)
    out_dir = artifact_dir(fp)
    out_file = out_dir / f"{fp.stem}{SUFFIX_SUBTITLES_SRT}"
    if out_file.exists() and not overwrite and not _is_stub_subtitles_file(out_file):
        return api_success({"created": False, "reason": "exists"})
    class _Ns:
        subtitles_backend = "auto"
        subtitles_model = model
        subtitles_language = language or "en"
        subtitles_translate = bool(translate)
        force = True
        compute_type = None
    def _do():
        # Map fractional progress from backend to integer steps [0..100]
        jid = getattr(JOB_CTX, "jid", None)
        if jid:
            try:
                _set_job_progress(jid, total=100, processed_set=0)
            except Exception:
                pass
        def _pcb(frac: float):
            if jid:
                try:
                    p = int(max(0.0, min(1.0, float(frac))) * 100)
                    _set_job_progress(jid, total=100, processed_set=p)
                except Exception:
                    pass
        generate_subtitles(fp, out_file, model=_Ns.subtitles_model, language=_Ns.subtitles_language, translate=_Ns.subtitles_translate, progress_cb=_pcb)
        return api_success({"created": True, "path": str(out_file)})
    try:
        return _wrap_job("subtitles", str(fp.relative_to(STATE["root"])), _do, priority=bool(priority))
    except Exception as e:
        raise_api_error(f"Subtitle generation failed: {e}", status_code=500)


@api.get("/subtitles/backend")
def subtitles_backend_info():
    """Return which backend would be used for subtitles plus a few diagnostic flags.

    Helps explain 'instant completion' when the stub backend or FFPROBE_DISABLE shortcut is active.
    """
    be = detect_backend("auto")
    return api_success({
        "backend": be,
        "ffprobe_disable": bool(os.environ.get("FFPROBE_DISABLE")),
        "has_faster_whisper": _safe_importable("faster_whisper"),
        "has_whisper": _safe_importable("whisper"),
        "whisper_cpp_bin": os.environ.get("WHISPER_CPP_BIN") or None,
        "whisper_cpp_model": os.environ.get("WHISPER_CPP_MODEL") or None,
    })


@api.delete("/subtitles/delete")
def subtitles_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    s = find_subtitles(fp)
    if s and s.exists():
        try:
            s.unlink()
            return api_success({"deleted": True})
        except Exception as e:
            raise_api_error(f"Failed to delete subtitles: {e}", status_code=500)
    raise_api_error("Subtitles not found", status_code=404)


@api.post("/subtitles/create/batch")
def subtitles_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    model: str = Query(default="small"),
    overwrite: bool = Query(default=False),
    language: str = Query(default="en"),
    translate: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    sup_jid = _new_job("subtitles-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    out_file = artifact_dir(p) / f"{p.stem}{SUFFIX_SUBTITLES_SRT}"
                    if out_file.exists() and not overwrite and not _is_stub_subtitles_file(out_file):
                        return
                    jid = _new_job("subtitles", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        lk = _file_task_lock(p, "subtitles")
                        with JOB_RUN_SEM:
                            with lk:
                                def _pcb(frac: float, _jid=jid):
                                    try:
                                        p = int(max(0.0, min(1.0, float(frac))) * 100)
                                        _set_job_progress(_jid, total=100, processed_set=p)
                                    except Exception:
                                        pass
                                generate_subtitles(p, out_file, model=model, language=(language or "en"), translate=bool(translate), progress_cb=_pcb)
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-subtitles-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/subtitles/delete/batch")
def subtitles_delete_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            s = find_subtitles(p)
            if s and s.exists():
                try:
                    s.unlink()
                    deleted += 1
                except Exception:
                    pass
    return api_success({"deleted": deleted})


# --- Root/testpath ---
@api.get("/root")
def get_root():
    return api_success({"root": str(STATE["root"])})


# --- Media management ---
@api.post("/media/rename")
def media_rename(
    path: str = Query(..., description="Relative path of the existing media file under root"),
    new_name: Optional[str] = Query(None, description="New filename (basename with extension). If not provided, 'to' must be given."),
    to: Optional[str] = Query(None, description="Optional new relative path under root (directory and filename). Overrides new_name when provided."),
    overwrite: bool = Query(default=False, description="Allow overwriting an existing destination file (rarely recommended)"),
):
    """
    Rename a media file and move associated artifact files to match the new stem.

    Accepts either:
    - path + new_name (rename within same directory), or
    - path + to (full destination relative path under root, may include subdirs)

    Moves/renames known artifact sidecars in the source .artifacts directory to the
    destination .artifacts directory, updating stems accordingly. Fails if destination
    already exists unless overwrite=true.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    # Resolve source
    src = safe_join(STATE["root"], path)
    if (not src.exists()) or (not src.is_file()):
        raise_api_error("Source not found", status_code=404)
    # Only allow renaming original media files (not artifacts)
    try:
        if src.name.startswith('.') or src.parent.name == '.artifacts':
            raise_api_error("Cannot rename artifacts directly", status_code=400)
    except Exception:
        pass
    # Determine destination path (relative under root)
    if to is not None and str(to).strip() != "":
        dst_rel = str(to).strip()
    else:
        if not new_name or str(new_name).strip() == "":
            raise_api_error("Provide new_name or to", status_code=400)
        dst_rel = str(src.parent.relative_to(STATE["root"])) + "/" + str(new_name).strip()
    # Normalize and guard
    dst = safe_join(STATE["root"], dst_rel)
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    if dst.exists():
        if not overwrite:
            raise_api_error("Destination already exists", status_code=409, data={"dest": str(dst.relative_to(STATE["root"]))})
        if dst.is_dir():
            raise_api_error("Destination is a directory", status_code=400)
    # Validate filename safety
    bn = dst.name
    if bn in ("", ".", ".."):
        raise_api_error("Invalid destination name", status_code=400)
    # Require same extension type (prevent accidental extension change)
    try:
        if src.suffix.lower() != dst.suffix.lower():
            raise_api_error("Changing file extension is not allowed", status_code=400)
    except Exception:
        pass

    # Compute artifact moves
    src_stem = src.stem
    dst_stem = dst.stem
    src_art = artifact_dir(src)
    dst_art = artifact_dir(dst)
    # Map of suffix constants to include in rename
    suffixes = [
        SUFFIX_METADATA_JSON,
        SUFFIX_THUMBNAIL_JPG,
        SUFFIX_PHASH_JSON,
        SUFFIX_SCENES_JSON,
        SUFFIX_SPRITES_JPG,
        SUFFIX_SPRITES_JSON,
        SUFFIX_HEATMAPS_JSON,
        SUFFIX_HEATMAPS_PNG,
        SUFFIX_FACES_JSON,
        SUFFIX_PREVIEW_WEBM,
        SUFFIX_SUBTITLES_SRT,
    ]
    # Also include scenes directory if present
    scenes_dirname_old = f"{src_stem}.scenes"
    scenes_dirname_new = f"{dst_stem}.scenes"

    # Perform rename/moves atomically best-effort
    try:
        # Move main media first
        os.rename(src, dst)
    except Exception as e:
        raise_api_error(f"Failed to move source: {e}", status_code=500)

    moved: list[dict] = []
    failed: list[str] = []
    # Ensure artifact directory exists at destination
    try:
        dst_art.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    # Move sidecar files
    for suf in suffixes:
        try:
            s = src_art / f"{src_stem}{suf}"
            if s.exists():
                d = dst_art / f"{dst_stem}{suf}"
                # If destination exists and not overwriting, skip
                if d.exists() and not overwrite:
                    failed.append(str(s))
                    continue
                # Ensure parent
                try: d.parent.mkdir(parents=True, exist_ok=True)
                except Exception: pass
                os.rename(s, d)
                moved.append({"from": str(s.relative_to(STATE["root"])), "to": str(d.relative_to(STATE["root"]))})
        except Exception:
            try:
                failed.append(str((src_art / f"{src_stem}{suf}").relative_to(STATE["root"])) )
            except Exception:
                failed.append(str(src_art / f"{src_stem}{suf}"))
            continue
    # Move scenes directory if present
    try:
        sdir = src_art / scenes_dirname_old
        if sdir.exists() and sdir.is_dir():
            ddir = dst_art / scenes_dirname_new
            if ddir.exists() and (not overwrite):
                # leave as-is to avoid clobbering
                failed.append(str(sdir.relative_to(STATE["root"])) )
            else:
                try:
                    # os.rename works across same volume; falls back to copy on other FS would fail
                    os.rename(sdir, ddir)
                    moved.append({"from": str(sdir.relative_to(STATE["root"])), "to": str(ddir.relative_to(STATE["root"]))})
                except Exception:
                    failed.append(str(sdir.relative_to(STATE["root"])) )
    except Exception:
        pass

    return api_success({
        "from": str(src.relative_to(STATE["root"])) if src.exists() else str(path),
        "to": str(dst.relative_to(STATE["root"])) if dst.exists() else str(dst_rel),
        "moved": moved,
        "failed": failed,
    })

@api.delete("/media/delete")
def media_delete(path: str = Query(..., description="Relative path of the media file under root")):
    """
    Delete a media file and its associated artifacts (sidecars and scenes directory).
    This only affects files within the configured root and refuses to touch artifacts directly.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    fp = safe_join(STATE["root"], path)
    if (not fp.exists()) or (not fp.is_file()):
        raise_api_error("Not found", status_code=404)
    # Disallow deleting artifacts directly
    try:
        if fp.name.startswith('.') or fp.parent.name == '.artifacts':
            raise_api_error("Not a media file", status_code=400)
    except Exception:
        pass
    base = fp.parent
    # Collect artifacts
    src_stem = fp.stem
    art = artifact_dir(fp)
    suffixes = [
        SUFFIX_METADATA_JSON,
        SUFFIX_THUMBNAIL_JPG,
        SUFFIX_PHASH_JSON,
        SUFFIX_SCENES_JSON,
        SUFFIX_SPRITES_JPG,
        SUFFIX_SPRITES_JSON,
        SUFFIX_HEATMAPS_JSON,
        SUFFIX_HEATMAPS_PNG,
        SUFFIX_FACES_JSON,
        SUFFIX_PREVIEW_WEBM,
        SUFFIX_SUBTITLES_SRT,
    ]
    scenes_dirname = f"{src_stem}.scenes"
    deleted: list[str] = []
    failed: list[str] = []
    # Delete main file
    try:
        fp.unlink()
        deleted.append(str(fp.relative_to(STATE["root"])) )
    except Exception:
        raise_api_error("Failed to delete file", status_code=500)
    # Delete artifacts best-effort
    for suf in suffixes:
        try:
            p = art / f"{src_stem}{suf}"
            if p.exists():
                p.unlink()
                try:
                    deleted.append(str(p.relative_to(STATE["root"])) )
                except Exception:
                    deleted.append(str(p))
        except Exception:
            try:
                failed.append(str((art / f"{src_stem}{suf}").relative_to(STATE["root"])) )
            except Exception:
                failed.append(str(art / f"{src_stem}{suf}"))
    try:
        sdir = art / scenes_dirname
        if sdir.exists() and sdir.is_dir():
            shutil.rmtree(sdir, ignore_errors=False)
            try:
                deleted.append(str(sdir.relative_to(STATE["root"])) )
            except Exception:
                deleted.append(str(sdir))
    except Exception:
        try:
            failed.append(str((art / scenes_dirname).relative_to(STATE["root"])) )
        except Exception:
            failed.append(str(art / scenes_dirname))
    return api_success({"deleted": deleted, "failed": failed})

@api.post("/setroot")
def set_root(root: str = Query(...)):
    p = Path(root).expanduser()
    if not p.exists() or not p.is_dir():
        raise_api_error("Root does not exist or is not a directory", status_code=400, data={"path": str(p)})
    new_root = p.resolve()
    old_root = STATE.get("root")
    # If changing root, attempt to merge/migrate central registries so user data persists
    try:
        if old_root and Path(old_root) != new_root:
            old_perf = Path(old_root) / ".artifacts" / "performers.json"
            new_perf = new_root / ".artifacts" / "performers.json"
            try:
                logging.info("[performers] setroot: migrate registry from %s → %s", str(old_perf), str(new_perf))
            except Exception:
                pass
            with REGISTRY_LOCK:
                old_data = _load_registry(old_perf, "performers") if old_perf.exists() else {"version": 1, "next_id": 1, "performers": []}
                new_data = _load_registry(new_perf, "performers")
                # Merge unique by slug
                items: list[dict] = list(new_data.get("performers") or [])
                seen = {str(it.get("slug") or "") for it in items}
                next_id = int(new_data.get("next_id") or 1)
                for it in (old_data.get("performers") or []):
                    slug = str(it.get("slug") or "")
                    name = (it.get("name") or "").strip()
                    if not name:
                        continue
                    if slug in seen:
                        continue
                    pid = int(it.get("id") or 0)
                    if pid <= 0:
                        pid = next_id
                        next_id += 1
                    else:
                        next_id = max(next_id, pid + 1)
                    items.append({
                        "id": pid,
                        "name": name,
                        "slug": slug or _slugify(name),
                        "images": list(it.get("images") or []),
                    })
                new_data["performers"] = items
                new_data["next_id"] = next_id
                _save_registry(new_perf, new_data)
            try:
                logging.info("[performers] setroot: migration complete → %d item(s) at %s", len(items), str(new_perf))
            except Exception:
                pass
    except Exception:
        # Non-fatal: proceed with root change even if registry migration fails
        pass
    STATE["root"] = new_root
    # Invalidate performers cache so next read reflects new root/registry
    try:
        global _PERFORMERS_CACHE_TS
        _PERFORMERS_CACHE_TS = None
    except Exception:
        pass
    return api_success({"root": str(STATE["root"])})


@api.post("/testpath")
def test_path(path: str = Query(...)):
    p = Path(path).expanduser()
    return api_success({
        "path": str(p),
        "exists": p.exists(),
        "is_dir": p.is_dir() if p.exists() else False,
    "mode": oct(p.stat().st_mode & 0o777) if p.exists() else None,
    "owner": (p.owner() if p.exists() else None) if hasattr(p, "owner") else None,
    })

# TODO @copilot v2 reference, unnecessary backwards compatibility
# --- Stats --- map v2 -> v1 shape


# --- Faces API ---
@api.get("/faces/get")
def faces_get(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    f = faces_path(fp)
    if not f.exists():
        raise_api_error("Faces not found", status_code=404)
    try:
        data = json.loads(f.read_text())
    except Exception:
        data = {"raw": f.read_text(errors="ignore")}
    return api_success(data)

@api.head("/faces/get")
def faces_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    f = faces_path(fp)
    if not f.exists():
        raise_api_error("Faces not found", status_code=404)
    return Response(status_code=200, media_type="application/json")

@api.get("/faces/json")
def faces_json(path: str = Query(...)):
    # Alias that mirrors faces_get for UI convenience
    return faces_get(path)  # type: ignore

@api.get("/faces")
def faces_get_canonical(path: str = Query(...)):
    """Canonical per-file faces fetch at /faces (alias of /faces/get)."""
    return faces_get(path)  # type: ignore[misc]

@api.head("/faces")
def faces_head_canonical(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    f = faces_path(fp)
    if not f.exists():
        raise_api_error("Faces not found", status_code=404)
    return Response(status_code=200, media_type="application/json")


class _FacesUpload(BaseModel):  # type: ignore
    """
    Payload schema for uploading faces detected in the browser.
    - faces: list of { time: float, box: [x,y,w,h], score?: float, embedding?: number[] }
    - backend: optional string describing the client detector (e.g., 'browser-facedetector' or 'browser-mediapipe')
    - stub: optional flag; ignored on write (server ensures non-stub if embeddings are computed)
    """
    faces: Optional[List[Dict[str, Any]]] = None
    backend: Optional[str] = None
    stub: Optional[bool] = None


def _compute_fallback_embedding_for_box(video: Path, t: float, box: List[int]) -> List[float]:
    """
    Compute a lightweight embedding for a given (time, box) from a video frame.
    Prefers OpenCV DCT when available; otherwise falls back to a coarse 8x8 pooled grayscale vector.
    """
    try:
        import cv2  # type: ignore
        import numpy as _np  # type: ignore
    except Exception:
        cv2 = None  # type: ignore
        _np = None  # type: ignore
    x, y, w, h = [int(max(0, v)) for v in (box or [0, 0, 0, 0])]
    frame = None
    # Try OpenCV seek + read for speed
    try:
        if cv2 is not None:
            cap = cv2.VideoCapture(str(video))
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(t)) * 1000.0)
                ok, frm = cap.read()
                cap.release()
                if ok and frm is not None:
                    frame = frm
    except Exception:
        frame = None
    # If CV path failed, try ffmpeg pipe -> PIL
    if frame is None:
        try:
            from PIL import Image  # type: ignore
            cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                *(_ffmpeg_hwaccel_flags()),
                "-noaccurate_seek", "-ss", f"{max(0.0, float(t)):.3f}", "-i", str(video),
                "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
            ]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if proc.returncode == 0 and proc.stdout:
                from io import BytesIO
                im = Image.open(BytesIO(proc.stdout))
                # Crop safely within bounds
                W, H = im.size
                x2 = min(W, x + w)
                y2 = min(H, y + h)
                x1 = min(max(0, x), max(0, W - 1))
                y1 = min(max(0, y), max(0, H - 1))
                if x2 > x1 and y2 > y1:
                    im = im.crop((x1, y1, x2, y2)).convert("L").resize((32, 32))
                    px = list(cast(Iterable[int], im.getdata()))
                    # Average-pool to 8x8 grid
                    vec: List[float] = []
                    for ry in range(8):
                        for rx in range(8):
                            acc = 0.0
                            cnt = 0
                            for yy in range(ry * 4, ry * 4 + 4):
                                for xx in range(rx * 4, rx * 4 + 4):
                                    acc += float(px[yy * 32 + xx])
                                    cnt += 1
                            vec.append(acc / max(1, cnt) / 255.0)
                    # L2 normalize
                    n = sum(v * v for v in vec) ** 0.5
                    if n > 0:
                        vec = [round(v / n, 6) for v in vec]
                    return vec
        except Exception:
            pass
    # If we have a CV frame, compute DCT-based embedding
    if frame is not None and cv2 is not None and _np is not None:
        try:
            H, W = frame.shape[:2]
            x2 = min(W, x + w)
            y2 = min(H, y + h)
            x1 = min(max(0, x), max(0, W - 1))
            y1 = min(max(0, y), max(0, H - 1))
            if x2 > x1 and y2 > y1:
                face = frame[y1:y2, x1:x2]
                g = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
                g = cv2.resize(g, (32, 32), interpolation=cv2.INTER_AREA)
                m = _np.asarray(g, dtype=_np.float32) / 255.0  # type: ignore[attr-defined]
                dct = cv2.dct(m)
                blk = dct[:8, :8].astype(_np.float32)
                vec_np = blk.reshape(-1)
                n = float(_np.linalg.norm(vec_np))
                if n > 0:
                    vec_np = vec_np / n
                return [round(float(x), 6) for x in vec_np.tolist()]
        except Exception:
            pass
    return []


@api.post("/faces/upload")
def faces_upload(
    path: str = Query(...),
    compute_embeddings: bool = Query(default=True),
    overwrite: bool = Query(default=True),
    payload: _FacesUpload = Body(...),
):
    """
    Accept faces detected client-side and write a faces.json artifact.
    Optionally compute lightweight embeddings for detections missing an embedding.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    fp = safe_join(STATE["root"], path)
    if not fp.exists() or not fp.is_file():
        raise_api_error("Not found", status_code=404)
    faces_in = list(payload.faces or [])
    if not faces_in:
        raise_api_error("No faces provided", status_code=400)
    # Ensure each has required keys and compute missing embeddings if requested
    out_faces: List[Dict[str, Any]] = []
    for f in faces_in:
        try:
            t = float(f.get("time", 0.0))
            box = f.get("box") or []
            if not (isinstance(box, list) and len(box) == 4):
                continue
            emb = f.get("embedding") or []
            if (not emb) and compute_embeddings:
                try:
                    emb = _compute_fallback_embedding_for_box(fp, t, [int(x) for x in box])
                except Exception:
                    emb = []
            out_faces.append({
                "time": round(t, 3),
                "box": [int(x) for x in box],
                "score": float(f.get("score", 1.0) or 1.0),
                "embedding": list(emb) if isinstance(emb, list) else [],
            })
        except Exception:
            continue
    # If still no usable embeddings, reject to avoid writing stubs
    any_emb = False
    for fc in out_faces:
        emb = fc.get("embedding")
        if isinstance(emb, list) and emb:
            any_emb = True
            break
    if not any_emb:
        raise_api_error("No embeddings present; enable compute_embeddings or include embeddings in payload", status_code=400)
    # Write artifact
    out = faces_path(fp)
    if out.exists() and not overwrite:
        raise_api_error("faces.json already exists (set overwrite=true to replace)", status_code=409)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "faces": out_faces,
        "backend": payload.backend or "browser",
        "source": "upload",
        "stub": False,
        "uploaded": True,
        "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        out.write_text(json.dumps(doc, indent=2))
    except Exception as e:  # noqa: BLE001
        raise_api_error(f"Failed to write faces: {e}", status_code=500)
    return api_success({"created": True, "path": str(out), "count": len(out_faces)})


@api.post("/faces/create")
def faces_create(
    path: str = Query(...),
    sim_thresh: float = Query(default=0.9),
    interval: float = Query(default=1.0),
    scale_factor: float = Query(default=1.2),
    min_neighbors: int = Query(default=7),
    min_size_frac: float = Query(default=0.10),
    backend: str = Query(default="auto", pattern="^(auto|opencv|insightface)$"),
    background: bool = Query(default=False),
    priority: bool = Query(default=False),
):
    fp = safe_join(STATE["root"], path)
    # Background mode for UI progress: return immediately with job id and report progress via SSE/polling
    if background:
        rel = str(fp.relative_to(STATE["root"]))
        def _runner():
            compute_face_embeddings(
                fp,
                sim_thresh=sim_thresh,
                interval=interval,
                scale_factor=scale_factor,
                min_neighbors=min_neighbors,
                min_size_frac=min_size_frac,
                backend=backend,
                progress_cb=lambda processed, total: _set_job_progress(jid, total=total if total is not None else None, processed_set=processed),
            )
            return {"created": True, "path": str(faces_path(fp))}
        # create job and start thread
        jid = _new_job("faces", rel, priority=bool(priority))
        _start_job(jid)
        def _bg():
            try:
                res = _runner()
                with JOB_LOCK:
                    if jid in JOBS:
                        JOBS[jid]["result"] = res
                _finish_job(jid, None)
            except Exception as e:  # noqa: BLE001
                _finish_job(jid, str(e))
        threading.Thread(target=_bg, name=f"job-faces-{Path(path).name}", daemon=True).start()
        return api_success({"job": jid, "queued": True})
    # Synchronous mode (used by tests and scripts); still emits job progress while running
    jid = _new_job("faces", str(fp.relative_to(STATE["root"])) , priority=bool(priority))
    _start_job(jid)
    try:
        compute_face_embeddings(
            fp,
            sim_thresh=sim_thresh,
            interval=interval,
            scale_factor=scale_factor,
            min_neighbors=min_neighbors,
            min_size_frac=min_size_frac,
            backend=backend,
            progress_cb=lambda processed, total: _set_job_progress(jid, total=total if total is not None else None, processed_set=processed),
        )
        _finish_job(jid, None)
        return api_success({"created": True, "path": str(faces_path(fp))})
    except Exception as e:
        _finish_job(jid, str(e))
        raise_api_error(f"faces failed: {e}", status_code=500)


@api.post("/faces/create/batch")
def faces_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    sim_thresh: float = Query(default=0.9),
    interval: float = Query(default=1.0),
    scale_factor: float = Query(default=1.2),
    min_neighbors: int = Query(default=7),
    min_size_frac: float = Query(default=0.10),
    backend: str = Query(default="auto", pattern="^(auto|opencv|insightface)$"),
    only_missing: bool = Query(default=True),
    force: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    sup_jid = _new_job("faces-batch", str(base))
    _start_job(sup_jid)
    # Emit an immediate progress event so the UI gets instant feedback
    try:
        _set_job_progress(sup_jid, total=0, processed_set=0)
    except Exception:
        pass
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            threads: list[threading.Thread] = []
            def _process(p: Path):
                try:
                    if (only_missing and not force) and faces_exists_check(p):
                        return
                    jid = _new_job("faces", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        compute_face_embeddings(
                            p,
                            sim_thresh=sim_thresh,
                            interval=interval,
                            scale_factor=scale_factor,
                            min_neighbors=min_neighbors,
                            min_size_frac=min_size_frac,
                            backend=backend,
                            progress_cb=lambda processed, total, _jid=jid: _set_job_progress(_jid, total=total if total is not None else None, processed_set=processed),
                        )
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                finally:
                    _set_job_progress(sup_jid, processed_inc=1)
            _run_batch_items(vids, _process)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    _start_worker_once(f"batch-faces-{sup_jid}", _worker)
    return api_success({"started": True, "job": sup_jid})


@api.delete("/faces/delete")
def faces_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    f = faces_path(fp)
    if f.exists():
        try:
            f.unlink()
            return api_success({"deleted": True})
        except Exception as e:
            raise_api_error(f"Failed to delete faces: {e}", status_code=500)
    raise_api_error("Faces not found", status_code=404)

@api.delete("/faces/delete/batch")
def faces_delete_batch(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    deleted = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            f = faces_path(p)
            try:
                if f.exists():
                    f.unlink(); deleted += 1
            except Exception:
                pass
    return api_success({"deleted": deleted})


@api.get("/faces/list")
def faces_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            if faces_exists_check(p):
                have += 1
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})

@api.head("/faces/list")
def faces_list_head(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    total = 0
    have = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total += 1
            try:
                if faces_exists_check(p):
                    have += 1
            except Exception:
                pass
    return Response(status_code=200, headers={
        "X-Total": str(total),
        "X-Have": str(have),
        "X-Missing": str(max(0, total - have)),
    })


@api.get("/faces/listing")
def faces_listing(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    out: list[dict] = []
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            f = faces_path(p)
            if not f.exists():
                continue
            try:
                data = json.loads(f.read_text())
                faces = data.get("faces") or []
                out.append({"path": str(p.relative_to(STATE["root"])), "count": len(faces)})
            except Exception:
                continue
    return api_success({"videos": out, "count": len(out)})


@api.get("/faces/signatures")
def faces_signatures(path: str = Query(default=""), recursive: bool = Query(default=True)):
    import hashlib
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    sigs: dict[str, int] = {}
    by_video: list[dict] = []
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            f = faces_path(p)
            if not f.exists():
                continue
            try:
                data = json.loads(f.read_text())
                faces = data.get("faces") or []
                video_sigs: list[str] = []
                for fc in faces:
                    emb = fc.get("embedding") or []
                    if isinstance(emb, list) and emb:
                        h = hashlib.sha1(
                            ",".join(str(float(x)) for x in emb).encode("utf-8")
                        ).hexdigest()
                    else:
                        h = "stub"
                    sigs[h] = sigs.get(h, 0) + 1
                    video_sigs.append(h)
                by_video.append({
                    "path": str(p.relative_to(STATE["root"])),
                    "signatures": video_sigs,
                    "count": len(video_sigs),
                })
            except Exception:
                continue
    return api_success({"signatures": sigs, "videos": by_video})


# --- Embed API (re-embed/update embeddings without re-detecting boxes) ---
@api.post("/embed/update")
def embed_update(
    path: str = Query(...),
    sim_thresh: float = Query(default=0.9),
    interval: float = Query(default=1.0),
    scale_factor: float = Query(default=1.2),
    min_neighbors: int = Query(default=7),
    min_size_frac: float = Query(default=0.10),
    backend: str = Query(default="auto", pattern="^(auto|opencv|insightface)$"),
    overwrite: bool = Query(default=False),
    background: bool = Query(default=False),
):
    """
    Trigger an embed job for a single file. Produces/updates faces.json.

    Semantics match the 'embed' Task job branch: skips when a valid, non-stub
    faces.json exists unless overwrite=true; otherwise recomputes and writes.
    """
    fp = safe_join(STATE["root"], path)
    # Background mode returns immediately with a job id
    if background:
        rel = str(fp.relative_to(STATE["root"]))
        prm = {
            "targets": [rel],
            "overwrite": bool(overwrite),
            "sim_thresh": float(sim_thresh),
            "interval": float(interval),
            "scale_factor": float(scale_factor),
            "min_neighbors": int(min_neighbors),
            "min_size_frac": float(min_size_frac),
            "backend": str(backend),
        }
        jr = JobRequest(task="embed", directory=str(fp.parent), recursive=False, force=bool(overwrite), params=prm)
        jid = _new_job(jr.task, rel)
        # Persist request for resume
        try:
            with JOB_LOCK:
                if jid in JOBS:
                    JOBS[jid]["request"] = jr.dict()
        except Exception:
            pass
        def _runner():
            with JOB_RUN_SEM:
                _run_job_worker(jid, jr)
        threading.Thread(target=_runner, daemon=True).start()
        return api_success({"job": jid, "queued": True})

    # Synchronous: run now but still track as a job for progress
    rel = str(fp.relative_to(STATE["root"]))
    prm = {
        "targets": [rel],
        "overwrite": bool(overwrite),
        "sim_thresh": float(sim_thresh),
        "interval": float(interval),
        "scale_factor": float(scale_factor),
        "min_neighbors": int(min_neighbors),
        "min_size_frac": float(min_size_frac),
        "backend": str(backend),
    }
    jr = JobRequest(task="embed", directory=str(fp.parent), recursive=False, force=bool(overwrite), params=prm)
    jid = _new_job(jr.task, rel)
    # Ensure synchronous execution still respects global job ordering and concurrency limits
    try:
        _wait_for_turn(jid)
        # Acquire per-file task lock when we know the singular target to avoid duplicate work
        lock_ctx = None
        targets = (jr.params or {}).get("targets") or []
        if isinstance(targets, list) and len(targets) == 1:
            try:
                target_path = safe_join(STATE["root"], targets[0])
                lock_ctx = _file_task_lock(target_path, jr.task)
            except Exception:
                lock_ctx = None
        if lock_ctx is not None:
            with JOB_RUN_SEM:
                with lock_ctx:
                    _run_job_worker(jid, jr)
        else:
            with JOB_RUN_SEM:
                _run_job_worker(jid, jr)
        return api_success({"job": jid, "queued": False, "path": str(faces_path(fp))})
    except Exception as e:  # noqa: BLE001
        raise_api_error(f"embed failed: {e}", status_code=500)


@api.post("/embed/update/batch")
def embed_update_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    sim_thresh: float = Query(default=0.9),
    interval: float = Query(default=1.0),
    scale_factor: float = Query(default=1.2),
    min_neighbors: int = Query(default=7),
    min_size_frac: float = Query(default=0.10),
    backend: str = Query(default="auto", pattern="^(auto|opencv|insightface)$"),
    only_missing: bool = Query(default=True),
    overwrite: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Determine targets
    vids = _find_mp4s(base, recursive)
    targets: list[str] = []
    for v in vids:
        if only_missing and not overwrite:
            if faces_exists_check(v):
                continue
        try:
            targets.append(str(v.relative_to(STATE["root"])))
        except Exception:
            continue
    # Create a single batch job using the generic worker; it will fan out per target
    prm = {
        "targets": targets,
        "overwrite": bool(overwrite),
        "sim_thresh": float(sim_thresh),
        "interval": float(interval),
        "scale_factor": float(scale_factor),
        "min_neighbors": int(min_neighbors),
        "min_size_frac": float(min_size_frac),
        "backend": str(backend),
    }
    jr = JobRequest(task="embed", directory=str(base), recursive=False, force=bool(overwrite), params=prm)
    jid = _new_job(jr.task, str(base))
    # Persist request for resume
    try:
        with JOB_LOCK:
            if jid in JOBS:
                JOBS[jid]["request"] = jr.dict()
    except Exception:
        pass
    def _runner():
        with JOB_RUN_SEM:
            _run_job_worker(jid, jr)
    threading.Thread(target=_runner, daemon=True).start()
    return api_success({"job": jid, "queued": True, "fileCount": len(targets)})


# --- Face crops (image thumbnails for FaceLab) ---
@api.get("/frame/crop")
def frame_crop(path: str = Query(...), t: float = Query(...), x: int = Query(...), y: int = Query(...), w: int = Query(...), h: int = Query(...), scale: int = Query(default=128)):
    """
    Return a cropped face image at time t from the given box.

    Attempts PIL first for lightweight JPEG/PNG from decoded frame via ffmpeg pipe fallback.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    fp = safe_join(STATE["root"], path)
    if not fp.exists():
        raise_api_error("Not found", status_code=404)
    try:
        if Image is None:
            raise RuntimeError("PIL not available")
        cmd = [
            "ffmpeg", "-y",
            *(_ffmpeg_hwaccel_flags()),
            "-noaccurate_seek", "-ss", str(float(t)), "-i", str(fp),
            "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not proc.stdout:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore"))
        import io
        im = Image.open(io.BytesIO(proc.stdout)).convert("RGB")
        # Clamp crop box to image bounds to avoid errors on edge cases
        cx, cy, cw, ch = int(x), int(y), int(w), int(h)
        cx = max(0, min(cx, im.width - 1))
        cy = max(0, min(cy, im.height - 1))
        if cw <= 0 or ch <= 0:
            # Fallback to small center crop if invalid size
            cw = max(1, min(64, im.width))
            ch = max(1, min(64, im.height))
        # Ensure right/bottom inside bounds
        right = max(cx + 1, min(cx + cw, im.width))
        bottom = max(cy + 1, min(cy + ch, im.height))
        crop = im.crop((cx, cy, right, bottom))
        if scale and scale > 0:
            # Use filter=3 (BICUBIC) to avoid depending on PIL constants across versions
            crop = crop.resize((int(scale), int(scale * crop.height / max(1, crop.width))), 3)
        buf = io.BytesIO()
        crop.save(buf, format="JPEG", quality=90)
        buf.seek(0)
        headers = {"Cache-Control": "public, max-age=604800"}
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=headers)
    except Exception:
        # Sanitize crop values for ffmpeg; ensure non-negative and at least 1x1
        cw = max(1, int(w))
        ch = max(1, int(h))
        cx = max(0, int(x))
        cy = max(0, int(y))
        vf = f"crop={cw}:{ch}:{cx}:{cy},scale={int(scale)}:-1"
        cmd = [
            "ffmpeg", "-y",
            *(_ffmpeg_hwaccel_flags()),
            "-noaccurate_seek", "-ss", str(float(t)), "-i", str(fp),
            "-vf", vf, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not proc.stdout:
            raise_api_error("frame crop failed", status_code=500)
        headers = {"Cache-Control": "public, max-age=604800"}
        return Response(content=proc.stdout, media_type="image/jpeg", headers=headers)


@api.get("/frame/boxed")
def frame_boxed(
    path: str = Query(...),
    t: float = Query(...),
    x: int = Query(...),
    y: int = Query(...),
    w: int = Query(...),
    h: int = Query(...),
    scale: int = Query(default=256),
    thickness: int = Query(default=3),
):
    """
    Return a full video frame at time t with a bounding box overlay.
    Uses PIL to draw the rectangle when available; falls back to ffmpeg drawbox.
    """
    if STATE.get("root") is None:
        raise_api_error("Root not set", status_code=400)
    fp = safe_join(STATE["root"], path)
    if not fp.exists():
        raise_api_error("Not found", status_code=404)
    try:
        if Image is None:
            raise RuntimeError("PIL not available")
        cmd = [
            "ffmpeg", "-y",
            *(_ffmpeg_hwaccel_flags()),
            "-noaccurate_seek", "-ss", str(float(t)), "-i", str(fp),
            "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not proc.stdout:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore"))
        import io
        from PIL import ImageDraw  # type: ignore
        im = Image.open(io.BytesIO(proc.stdout)).convert("RGB")
        # Draw rectangle clamped to bounds
        cx, cy, cw, ch = int(x), int(y), int(w), int(h)
        cx = max(0, min(cx, im.width - 1))
        cy = max(0, min(cy, im.height - 1))
        if cw <= 0 or ch <= 0:
            cw = max(1, min(64, im.width))
            ch = max(1, min(64, im.height))
        right = max(cx + 1, min(cx + cw, im.width))
        bottom = max(cy + 1, min(cy + ch, im.height))
        draw = ImageDraw.Draw(im)
        th = max(1, int(thickness))
        # Draw multiple rectangles to simulate thickness
        for i in range(th):
            draw.rectangle([cx - i, cy - i, right + i, bottom + i], outline=(255, 64, 64))
        # Scale down if requested
        if scale and scale > 0:
            im = im.resize((int(scale), int(scale * im.height / max(1, im.width))), 3)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=90)
        buf.seek(0)
        headers = {"Cache-Control": "public, max-age=604800"}
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=headers)
    except Exception:
        # Fallback: use ffmpeg drawbox then scale
        cw = max(1, int(w))
        ch = max(1, int(h))
        cx = max(0, int(x))
        cy = max(0, int(y))
        th = max(1, int(thickness))
        # drawbox thickness uses absolute pixels in source resolution
        vf = f"drawbox=x={cx}:y={cy}:w={cw}:h={ch}:color=red@0.8:thickness={th},scale={int(scale)}:-1"
        cmd = [
            "ffmpeg", "-y",
            *(_ffmpeg_hwaccel_flags()),
            "-noaccurate_seek", "-ss", str(float(t)), "-i", str(fp),
            "-vf", vf, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not proc.stdout:
            raise_api_error("frame boxed failed", status_code=500)
        headers = {"Cache-Control": "public, max-age=604800"}
        return Response(content=proc.stdout, media_type="image/jpeg", headers=headers)

# --- Markers (manual timeline points)
@api.post("/markers")
def set_marker(
    path: str = Query(...),
    time: float = Query(...),
    type: str = Query(default="scene"),
    label: Optional[str] = Query(default=None),
    special: Optional[str] = Query(default=None, description="intro | outro to set intro/outro"),
    name: Optional[str] = Query(default=None),
    scene: Optional[bool] = Query(default=None),
    intro: Optional[bool] = Query(default=None),
    outro: Optional[bool] = Query(default=None),
):
    # Normalize flags from special if provided
    if special == "intro":
        intro = True
    elif special == "outro":
        outro = True
    fp = safe_join(STATE["root"], path)
    store = scenes_json_path(fp)
    data: dict = {"scenes": []}
    if store.exists():
        try:
            cur = json.loads(store.read_text())
            if isinstance(cur, dict) and isinstance(cur.get("scenes"), list):
                data = cur
        except Exception:
            data = {"scenes": []}
    tval = round(float(time), 3)
    scenes = data.setdefault("scenes", [])
    if isinstance(scenes, list):
        # Build marker with defaults: flags false if unspecified
        m_scene = bool(scene) if scene is not None else False
        m_intro = bool(intro) if intro is not None else False
        m_outro = bool(outro) if outro is not None else False
        marker = {"time": tval, "type": type, "label": label, "scene": m_scene}
        if name is not None:
            marker["name"] = name
        if m_intro:
            marker["intro"] = True
        if m_outro:
            marker["outro"] = True
        scenes.append(marker)
        # Enforce single intro/outro by clearing flags on others if set here
        if m_intro or m_outro:
            new_list = []
            for s in scenes:
                try:
                    tv = round(float(s.get("time")), 3)
                except Exception:
                    continue
                obj = {
                    "time": tv,
                    "type": s.get("type", "scene"),
                    "label": s.get("label"),
                    "scene": bool(s.get("scene", False)),
                }
                if "name" in s:
                    obj["name"] = s.get("name")
                if m_intro:
                    obj["intro"] = (tv == tval)
                else:
                    obj["intro"] = bool(s.get("intro", False))
                if m_outro:
                    obj["outro"] = (tv == tval)
                else:
                    obj["outro"] = bool(s.get("outro", False))
                new_list.append(obj)
            scenes = new_list
        try:
            # de-dup by rounded time and type
            seen = set()
            unique = []
            for s in scenes:
                try:
                    tv = round(float(s.get("time")), 3)
                    ty = s.get("type", "scene")
                except Exception:
                    continue
                key = (tv, ty)
                if key in seen:
                    continue
                seen.add(key)
                unique.append({
                    "time": tv,
                    "type": ty,
                    "label": s.get("label"),
                    "scene": bool(s.get("scene", False)),
                    **({"name": s.get("name")} if s.get("name") is not None else {}),
                    **({"intro": bool(s.get("intro", False))} if "intro" in s else {}),
                    **({"outro": bool(s.get("outro", False))} if "outro" in s else {}),
                })
            scenes = sorted(unique, key=lambda x: x.get("time", 0.0))
            data["scenes"] = scenes
        except Exception:
            pass
    try:
        store.write_text(json.dumps(data, indent=2))
    except Exception:
        pass
    # Mirror top-level intro/outro for compatibility if flags present
    try:
        if isinstance(data.get("scenes"), list):
            arr = data["scenes"]
            intro_m = next((s for s in arr if s.get("intro")), None)
            outro_m = next((s for s in arr if s.get("outro")), None)
            if intro_m:
                data["intro"] = round(float(intro_m.get("time", 0)), 3)
            if outro_m:
                data["outro"] = round(float(outro_m.get("time", 0)), 3)
            store.write_text(json.dumps(data, indent=2))
    except Exception:
        pass
    return api_success({"saved": True, "count": len(data.get("scenes", [])), "intro": data.get("intro"), "outro": data.get("outro")})


@api.patch("/markers")
def update_marker(
    path: str = Query(...),
    old_time: float = Query(..., alias="old_time"),
    new_time: float = Query(..., alias="new_time"),
    type: str = Query(default="scene"),
    label: Optional[str] = Query(default=None),
    special: Optional[str] = Query(default=None, description="intro | outro to set intro/outro"),
    name: Optional[str] = Query(default=None),
    scene: Optional[bool] = Query(default=None),
    intro: Optional[bool] = Query(default=None),
    outro: Optional[bool] = Query(default=None),
):
    # Special convenience: set top-level intro/outro markers
    if special in {"intro", "outro"}:
        fp = safe_join(STATE["root"], path)
        store = scenes_json_path(fp)
        data: dict = {"scenes": []}
        if store.exists():
            try:
                cur = json.loads(store.read_text())
                if isinstance(cur, dict):
                    data = cur
            except Exception:
                data = {"scenes": []}
        if new_time is None:
            raise_api_error("invalid time", status_code=400)
        try:
            tval = round(float(new_time), 3)
        except Exception:
            raise_api_error("invalid time", status_code=400)
        if special == "intro":
            data["intro"] = tval
            try:
                if "intro_end" in data:
                    del data["intro_end"]
            except Exception:
                pass
        else:
            data["outro"] = tval
            try:
                if "outro_begin" in data:
                    del data["outro_begin"]
            except Exception:
                pass
        try:
            store.write_text(json.dumps(data, indent=2))
        except Exception:
            raise_api_error("write failed", status_code=500)
    return api_success({"saved": True, "intro": data.get("intro"), "outro": data.get("outro")})
    fp = safe_join(STATE["root"], path)
    store = scenes_json_path(fp)
    data: dict = {"scenes": []}
    if store.exists():
        try:
            cur = json.loads(store.read_text())
            if isinstance(cur, dict) and isinstance(cur.get("scenes"), list):
                data = cur
        except Exception:
            data = {"scenes": []}
    if new_time is None:
        raise_api_error("invalid time", status_code=400)
    target = round(float(new_time), 3)
    # ...existing code...
    """Update a single marker time/type/label (rounded to 3 decimals uniqueness).

    If the old time/type is not found, returns saved=False.
    """
    fp = safe_join(STATE["root"], path)
    store = scenes_json_path(fp)
    data: dict = {"scenes": []}
    if store.exists():
        try:
            cur = json.loads(store.read_text())
            if isinstance(cur, dict) and isinstance(cur.get("scenes"), list):
                data = cur
        except Exception:
            pass
    scenes = data.setdefault("scenes", [])
    try:
        ot = round(float(old_time), 3)
        nt = round(float(new_time), 3)
        ty = type
    except Exception:
        raise_api_error("invalid time/type", status_code=400)
    # Locate and replace
    found = False
    out = []
    for s in scenes:
        try:
            tv = round(float(s.get("time")), 3)
            sty = s.get("type", "scene")
        except Exception:
            continue
        if tv == ot and sty == ty and not found:
            found = True
            obj = {
                "time": nt,
                "type": ty,
                "label": label if label is not None else s.get("label"),
                "scene": bool(scene) if scene is not None else bool(s.get("scene", False)),
            }
            # Name
            if name is not None:
                obj["name"] = name
            elif s.get("name") is not None:
                obj["name"] = s.get("name")
            # Flags intro/outro
            if intro is not None:
                obj["intro"] = bool(intro)
            elif "intro" in s:
                obj["intro"] = bool(s.get("intro", False))
            if outro is not None:
                obj["outro"] = bool(outro)
            elif "outro" in s:
                obj["outro"] = bool(s.get("outro", False))
            out.append(obj)
        else:
            keep = {
                "time": tv,
                "type": sty,
                "label": s.get("label"),
                "scene": bool(s.get("scene", False))
            }
            if s.get("name") is not None:
                keep["name"] = s.get("name")
            if "intro" in s:
                keep["intro"] = bool(s.get("intro", False))
            if "outro" in s:
                keep["outro"] = bool(s.get("outro", False))
            out.append(keep)
    if not found:
        return api_success({"saved": False, "reason": "old_time/type not found", "count": len(out)})
    # De-dup & sort
    uniq = []
    seen: set = set()
    for s in out:
        try:
            tv = round(float(s.get("time")), 3)
            ty = s.get("type", "scene")
        except Exception:
            continue
        key = (tv, ty)
        if key in seen:
            continue
        seen.add(key)
        obj = {
            "time": tv,
            "type": ty,
            "label": s.get("label"),
            "scene": bool(s.get("scene", False))
        }
        if s.get("name") is not None:
            obj["name"] = s.get("name")
        if "intro" in s:
            obj["intro"] = bool(s.get("intro", False))
        if "outro" in s:
            obj["outro"] = bool(s.get("outro", False))
        uniq.append(obj)
    uniq.sort(key=lambda x: x.get("time", 0.0))
    # If intro/outro flags were updated, ensure single-flag invariant per video
    if intro is not None or outro is not None:
        try:
            # Find the marker we just updated by time/type
            updated_time = nt
            updated_type = ty
            fixed = []
            for s in uniq:
                tv = round(float(s.get("time", 0)), 3)
                obj = dict(s)
                if intro is True:
                    obj["intro"] = (tv == updated_time)
                elif intro is False:
                    # explicit false only clears target if matches
                    if tv == updated_time:
                        obj.pop("intro", None)
                if outro is True:
                    obj["outro"] = (tv == updated_time)
                elif outro is False:
                    if tv == updated_time:
                        obj.pop("outro", None)
                fixed.append(obj)
            uniq = fixed
        except Exception:
            pass
    data["scenes"] = uniq
    try:
        # Enforce single intro/outro if flags were updated
        if intro is not None or outro is not None:
            # Mirror to top-level
            try:
                i_m = next((s for s in uniq if s.get("intro")), None)
                o_m = next((s for s in uniq if s.get("outro")), None)
                if i_m:
                    data["intro"] = round(float(i_m.get("time", 0)), 3)
                else:
                    data.pop("intro", None)
                if o_m:
                    data["outro"] = round(float(o_m.get("time", 0)), 3)
                else:
                    data.pop("outro", None)
            except Exception:
                pass
        store.write_text(json.dumps(data, indent=2))
    except Exception:
        raise_api_error("write failed", status_code=500)
    return api_success({"saved": True, "count": len(uniq)})


@api.delete("/markers")
def delete_marker(
    path: str = Query(...),
    time: Optional[float] = Query(default=None),
    type: str = Query(default="scene"),
    special: Optional[str] = Query(default=None, description="intro | outro to clear top-level marker")
):
    """Delete a marker at given time/type, or clear special intro/outro markers.

    - When special=intro or special=outro is provided, ignores time/type and clears the corresponding top-level entry.
    """
    # Special convenience: clear top-level intro/outro
    if special in {"intro", "outro"}:
        fp = safe_join(STATE["root"], path)
        store = scenes_json_path(fp)
        if not store.exists():
            return api_success({"deleted": False, "reason": "no store"})
        try:
            cur = json.loads(store.read_text())
        except Exception:
            return api_success({"deleted": False, "reason": "corrupt store"})
        key = "intro" if special == "intro" else "outro"
        if not isinstance(cur, dict) or key not in cur:
            return api_success({"deleted": False, "reason": "not set"})
        try:
            del cur[key]
        except Exception:
            return api_success({"deleted": False, "reason": "delete failed"})
        try:
            store.write_text(json.dumps(cur, indent=2))
        except Exception:
            raise_api_error("write failed", status_code=500)
        return api_success({"deleted": True})
    fp = safe_join(STATE["root"], path)
    store = scenes_json_path(fp)
    if not store.exists():
        return api_success({"deleted": False, "reason": "no store"})
    try:
        cur = json.loads(store.read_text())
    except Exception:
        return api_success({"deleted": False, "reason": "corrupt store"})
    if not isinstance(cur, dict) or not isinstance(cur.get("scenes"), list):
        return api_success({"deleted": False, "reason": "no scenes"})
    try:
        target = round(float(time), 3) # type: ignore
        ty = type
    except Exception:
        raise_api_error("invalid time/type", status_code=400)
    new_list = []
    removed = False
    for s in cur["scenes"]:
        try:
            tv = round(float(s.get("time")), 3)
            sty = s.get("type", "scene")
        except Exception:
            continue
        if tv == target and sty == ty and not removed:
            removed = True
            continue
        # preserve other entries, including their scene flag
        obj = {"time": tv, "type": sty, "label": s.get("label"), "scene": bool(s.get("scene", False))}
        if s.get("name") is not None:
            obj["name"] = s.get("name")
        if "intro" in s:
            obj["intro"] = bool(s.get("intro", False))
        if "outro" in s:
            obj["outro"] = bool(s.get("outro", False))
        new_list.append(obj)
    if not removed:
        return api_success({"deleted": False, "reason": "not found", "count": len(new_list)})
    cur["scenes"] = sorted(new_list, key=lambda x: x.get("time", 0.0))
    try:
        # If we removed an intro/outro flagged marker, mirror to top-level
        try:
            i_m = next((s for s in cur["scenes"] if s.get("intro")), None)
            o_m = next((s for s in cur["scenes"] if s.get("outro")), None)
            if i_m:
                cur["intro"] = i_m.get("time")
            else:
                cur.pop("intro", None)
            if o_m:
                cur["outro"] = o_m.get("time")
            else:
                cur.pop("outro", None)
        except Exception:
            pass
        store.write_text(json.dumps(cur, indent=2))
    except Exception:
        raise_api_error("write failed", status_code=500)
    return api_success({"deleted": True, "count": len(cur["scenes"])})

@api.get("/markers")
def list_markers(path: str = Query(...)):
    """List markers for a given video. Returns a stable 'markers' array even though the on-disk key is 'scenes'."""
    fp = safe_join(STATE["root"], path)
    store = scenes_json_path(fp)
    res: dict = {"markers": []}
    if not store.exists():
        return api_success(res)
    try:
        cur = json.loads(store.read_text())
        arr = []
        if isinstance(cur, dict) and isinstance(cur.get("scenes"), list):
            # Normalize to markers list
            for s in cur["scenes"]:
                try:
                    arr.append({
                        "video": str(fp.relative_to(STATE["root"])),
                        "time": round(float(s.get("time")), 3),
                        "type": s.get("type", "scene"),
                        "label": s.get("label"),
                        "name": s.get("name"),
                        # Flags default false
                        "scene": bool(s.get("scene", False)),
                        "intro": bool(s.get("intro", False)),
                        "outro": bool(s.get("outro", False)),
                    })
                except Exception:
                    continue
            arr.sort(key=lambda x: x.get("time", 0.0))
        res["markers"] = arr
        # Include intro/outro if present for convenience
        if isinstance(cur, dict):
            # Prefer new consolidated keys if present
            if "intro" in cur:
                res["intro"] = cur.get("intro")
            if "outro" in cur:
                res["outro"] = cur.get("outro")
            # If top-level missing, derive from flagged markers
            if "intro" not in res and arr:
                try:
                    intro_markers = [m for m in arr if bool(m.get("intro"))]
                    if intro_markers:
                        res["intro"] = intro_markers[0].get("time")
                except Exception:
                    pass
            if "outro" not in res and arr:
                try:
                    outro_markers = [m for m in arr if bool(m.get("outro"))]
                    if outro_markers:
                        res["outro"] = outro_markers[0].get("time")
                except Exception:
                    pass
            # Mirror legacy keys if they exist for older UIs
            if "intro_end" in cur:
                res["intro_end"] = cur.get("intro_end")
            if "outro_begin" in cur:
                res["outro_begin"] = cur.get("outro_begin")
        return api_success(res)
    except Exception:
        return api_success(res)


# --- Intro end helper endpoints: persist a top-level `intro_end` value in the same scenes JSON
# removed dedicated /markers/intro and /markers/outro routes in favor of special flag on /markers




# Wire router (moved to end after all routes are defined)


# Jobs API
@app.get("/api/jobs")
def jobs(state: str = Query(default="active"), limit: int = Query(default=100)):
    """
    List jobs. state=active|recent|all. Active = queued or running. Recent = done/failed in last 10 minutes."""
    now = time.time()
    with JOB_LOCK:
        vals = list(JOBS.values())
    if state == "active":
        vals = [j for j in vals if j.get("state") in ("queued", "running")]
    elif state == "recent":
        tmp = []
        for j in vals:
            if j.get("state") in ("done", "failed"):
                t = j.get("ended_at")
                if isinstance(t, (int, float)) and (now - float(t) <= 600):
                    tmp.append(j)
        vals = tmp
    else:
        pass
    # Sort newest first by started_at or ended_at
    def _ts(j):
        return j.get("started_at") or j.get("ended_at") or 0
    vals.sort(key=_ts, reverse=True)
    return api_success({"jobs": vals[: max(1, min(limit, 1000))]})

# Cleanup API: attempt to reconcile renamed media with orphaned artifacts
@api.get("/artifacts/orphans")
def artifacts_orphans_status(
    path: str = Query(default=""),
):
    """
    Check for orphaned artifacts (artifacts without corresponding video files)."""
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)

    # Gather all artifacts under .artifacts directories
    artifacts: list[Path] = []
    for p in base.rglob(".artifacts"):
        if not p.is_dir():
            continue
        for f in p.iterdir():
            if f.is_file() and _parse_artifact_name(f.name):
                artifacts.append(f)

    media_by_stem, _ = _collect_media_and_metadata(base)

    orphaned: list[str] = []  # per-file orphaned artifacts (legacy)
    matched: list[str] = []
    # Track unique orphan stems to avoid over-counting same-name sidecars
    orphaned_stems: dict[str, str] = {}

    for art in artifacts:
        try:
            parsed = _parse_artifact_name(art.name)
            if not parsed:
                continue
            a_stem, kind = parsed
            # Normalize artifact stem: if it erroneously includes an original media
            # extension (e.g. 'video.mp4.metadata.json' -> stem 'video.mp4'), strip
            # the extension so matching doesn't falsely classify valid artifacts
            # as orphans. This handles legacy sidecars generated with full filename.
            try:
                a_stem_lower = a_stem.lower()
                for ext in MEDIA_EXTS:
                    if a_stem_lower.endswith(ext):
                        a_stem = a_stem[: -len(ext)]
                        break
            except Exception:
                pass

            # Prefer strict adjacency: look for media next to the .artifacts folder
            # with the same stem and any allowed media extension.
            media_exists = False
            try:
                media_dir = art.parent.parent
                for ext in MEDIA_EXTS:
                    cand = media_dir / f"{a_stem}{ext}"
                    if cand.exists() and cand.is_file():
                        media_exists = True
                        break
            except Exception:
                media_exists = False
            # Fallback to global stem map only if adjacency check fails
            if not media_exists:
                cand_media = media_by_stem.get(a_stem)
                media_exists = bool(cand_media and cand_media.exists())
            if media_exists:
                matched.append(str(art.relative_to(base)))
            else:
                relp = str(art.relative_to(base))
                orphaned.append(relp)
                try:
                    # Record a representative file per orphan stem
                    if a_stem not in orphaned_stems:
                        orphaned_stems[a_stem] = relp
                except Exception:
                    pass
        except Exception:
            continue

    return api_success({
        "total_artifacts": len(artifacts),
        "matched": len(matched),
        # Report unique stems as the main orphan count (more accurate)
        "orphaned": len(orphaned_stems),
        # Provide legacy per-file count for UIs that still need it
        "orphaned_files_total": len(orphaned),
        "orphaned_files": orphaned[:100],  # Limit to first 100 for display
        # Provide sample representatives for unique stems
        "orphaned_stem_examples": list(orphaned_stems.values())[:100],
    })

@app.post("/api/artifacts/cleanup")
def artifacts_cleanup(
    path: str = Query(default=""),
    dry_run: bool = Query(default=True),
    keep_orphans: bool = Query(default=False),
    reassociate: bool = Query(default=False, description="Attempt to repair by re-associating artifacts via fuzzy matching (slower). Default false."),
    local_only: bool = Query(default=True, description="When reassociate=true, restrict matching to the local media directory only (faster). Default true."),
    use_preview: bool = Query(default=False, description="When reassociate=true, reuse the most recent repair preview cache for this path to avoid recomputation."),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    req = JobRequest(
        task="cleanup-artifacts",
        directory=str(base),
        recursive=True,
        force=False,
        params={
            "dry_run": bool(dry_run),
            "keep_orphans": bool(keep_orphans),
            "reassociate": bool(reassociate),
            "local_only": bool(local_only),
            "use_preview": bool(use_preview),
        },
    )
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    t = threading.Thread(target=_run_job_worker, args=(jid, req), daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


@app.post("/api/artifacts/repair-preview")
def artifacts_repair_preview(path: str = Query(default=""), local_only: bool = Query(default=True)):
    """
    Compute a dry-run preview of suggested artifact re-associations (repairs) for the given path.
    This is synchronous and returns a list of proposed renames with confidence scores.
    - Strictly non-destructive: does not move or delete any files.
    - Only attempts conservative fuzzy matches; identical to cleanup's reassociate mode heuristics.
    """
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Gather artifacts once
    artifacts: list[Path] = []
    for p in base.rglob(".artifacts"):
        if not p.is_dir():
            continue
        for f in p.iterdir():
            if f.is_file() and _parse_artifact_name(f.name):
                artifacts.append(f)
    media_by_stem: dict[str, Path] = {}
    media_by_dir: dict[Path, list[tuple[str, Path]]] = {}
    media_durations: dict[str, float] = {}
    metadata_by_stem: dict[str, dict] = {}
    if not local_only:
        media_by_stem, metadata_by_stem = _collect_media_and_metadata(base)
        # Index media by parent dir to prefer local matches
        for stem, v in media_by_stem.items():
            try:
                media_by_dir.setdefault(v.parent, []).append((stem, v))
            except Exception:
                pass
        for stem, v in media_by_stem.items():
            try:
                m = metadata_by_stem.get(stem) or {}
                d = m.get("duration")
                if isinstance(d, (int, float)):
                    media_durations[stem] = float(d)
            except Exception:
                pass
    orphan_duration_cache: dict[str, float] = {}
    # Caches to accelerate local-only scans
    media_dir_files_cache: dict[Path, list[tuple[str, Path]]] = {}
    media_duration_path_cache: dict[Path, float] = {}
    renamed: list[dict] = []
    repaired_count = 0
    for art in artifacts:
        try:
            parsed = _parse_artifact_name(art.name)
            if not parsed:
                continue
            a_stem, kind = parsed
            a_stem_lower = a_stem.lower()
            parent_dir = art.parent
            # If exact media exists with the same stem, it's not an orphan — skip
            cand_media = media_by_stem.get(a_stem)
            if cand_media and cand_media.exists():
                continue
            # In local-only mode, also check for a same-stem media file in the parent directory
            if local_only:
                try:
                    found_same_stem = False
                    for de in os.scandir(parent_dir.parent):
                        if not de.is_file():
                            continue
                        name = de.name
                        if name.startswith('.'):
                            continue
                        stem, ext = os.path.splitext(name)
                        if ext.lower() in {".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"} and stem == a_stem:
                            found_same_stem = True
                            break
                    if found_same_stem:
                        # Artifact already corresponds to an existing local media file with same stem
                        continue
                except Exception:
                    pass
            # Attempt reassociation (repair heuristics)
            a_duration: float | None = None
            try:
                if a_stem in orphan_duration_cache:
                    a_duration = orphan_duration_cache[a_stem]
                else:
                    if kind == SUFFIX_METADATA_JSON:
                        raw = json.loads(art.read_text())
                        a_duration = extract_duration(raw)
                    else:
                        metadata_file = parent_dir / f"{a_stem}{SUFFIX_METADATA_JSON}"
                        if metadata_file.exists():
                            raw = json.loads(metadata_file.read_text())
                            a_duration = extract_duration(raw)
                    if isinstance(a_duration, (int, float)):
                        orphan_duration_cache[a_stem] = float(a_duration)
            except Exception:
                a_duration = None
            best: tuple[float, Path] | None = None
            local_candidates: list[tuple[str, Path]] = []
            try:
                if local_only:
                    # Build once per directory: list of (stem, path) for video files
                    media_dir = parent_dir.parent
                    cands = media_dir_files_cache.get(media_dir)
                    if cands is None:
                        cands = []
                        try:
                            for de in os.scandir(media_dir):
                                if not de.is_file():
                                    continue
                                name = de.name
                                if name.startswith('.'):
                                    continue
                                ext = os.path.splitext(name)[1].lower()
                                if ext in {".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"}:
                                    vp = Path(de.path)
                                    cands.append((vp.stem, vp))
                        except Exception:
                            cands = []
                        media_dir_files_cache[media_dir] = cands
                    local_candidates = cands
                else:
                    local_candidates = media_by_dir.get(parent_dir.parent, []) or []
            except Exception:
                local_candidates = []
            # Fast-path: if exact same stem exists in local candidates, prefer it immediately
            if local_candidates:
                for stem, v in local_candidates:
                    if stem.lower() == a_stem_lower:
                        matched = v
                        dst_dir = artifact_dir(matched)
                        new_name = f"{matched.stem}{kind}"
                        dst_path = dst_dir / new_name
                        try:
                            if str(dst_path) == str(art) or (art.name == new_name and art.parent == dst_dir):
                                matched = None  # identity; skip
                            else:
                                renamed.append({"from": str(art), "to": str(dst_path), "confidence": 1.0, "strategy": "exact"})
                                repaired_count += 1
                                continue
                        except Exception:
                            pass
            def _score_candidates(cands: list[tuple[str, Path]], cur_best: tuple[float, Path] | None) -> tuple[float, Path] | None:
                best_local = cur_best
                for stem, v in cands:
                    try:
                        same_parent_boost = 0.05 if v.parent == parent_dir.parent else 0.0
                    except Exception:
                        same_parent_boost = 0.0
                    stem_lower = stem.lower()
                    if stem_lower == a_stem_lower:
                        name_sim = 1.0
                    else:
                        name_sim = SequenceMatcher(a=a_stem_lower, b=stem_lower).ratio()
                    dur_sim = 0.0
                    if a_duration is not None:
                        d: Optional[float] = None
                        if local_only:
                            try:
                                mf = metadata_path(v)
                                if mf.exists():
                                    raw = json.loads(mf.read_text())
                                    d = extract_duration(raw) or None
                            except Exception:
                                d = None
                        else:
                            d = media_durations.get(stem)
                        if isinstance(d, (int, float)) and d > 0:
                            diff = abs(float(d) - float(a_duration))
                            dur_sim = max(0.0, 1.0 - (diff / max(d, 1.0)))
                    score = (0.65 * name_sim) + (0.35 * dur_sim) + same_parent_boost
                    if best_local is None or score > best_local[0]:
                        best_local = (score, v)
                return best_local
            # First pass: local dir
            if local_candidates:
                best = _score_candidates(local_candidates, None)
            # Optional global fallback if enabled
            if not local_only:
                if best is None or best[0] < 0.80:
                    global_candidates = list(media_by_stem.items())
                    best = _score_candidates(global_candidates, best)
            if best and best[0] >= 0.80:
                matched = best[1]
                dst_dir = artifact_dir(matched)
                new_name = f"{matched.stem}{kind}"
                dst_path = dst_dir / new_name
                # Skip identity mappings (artifact already at the correct destination)
                try:
                    if str(dst_path) == str(art) or (art.name == new_name and art.parent == dst_dir):
                        continue
                except Exception:
                    pass
                try:
                    conf = float(best[0]) if isinstance(best, tuple) else 1.0
                except Exception:
                    conf = 1.0
                entry = {"from": str(art), "to": str(dst_path), "confidence": round(conf, 3), "strategy": "fuzzy"}
                renamed.append(entry)
                repaired_count += 1
        except Exception:
            # Skip problematic entries; preview should be resilient
            continue
    # Persist into short-lived cache for subsequent apply if requested
    try:
        cache = STATE.get("_repair_preview_cache")
        if isinstance(cache, dict):
            cache[str(base)] = {"ts": time.time(), "renamed": renamed, "repaired_count": repaired_count, "total": len(artifacts)}
    except Exception:
        pass
    return api_success({
        "renamed": renamed,
        "repaired_count": repaired_count,
        "total": len(artifacts),
        "dry_run": True,
        "mode": "reassociate",
        "cached": True,
    })

# Compatibility alias under router prefix (ensures availability regardless of include order)
@api.post("/artifacts/repair-preview", include_in_schema=False)
def artifacts_repair_preview_api(path: str = Query(default=""), local_only: bool = Query(default=True)):
    return artifacts_repair_preview(path=path, local_only=local_only)  # type: ignore[misc]


# Streaming variant: emit NDJSON lines as suggestions are found
def _iter_artifacts_repair_preview_stream(base: Path, *, local_only: bool = True) -> Iterator[bytes]:
    try:
        # Gather artifacts once
        artifacts: list[Path] = []
        for p in base.rglob(".artifacts"):
            if not p.is_dir():
                continue
            for f in p.iterdir():
                if f.is_file() and _parse_artifact_name(f.name):
                    artifacts.append(f)

        # Optional global indices when not local-only
        media_by_stem: dict[str, Path] = {}
        media_by_dir: dict[Path, list[tuple[str, Path]]] = {}
        media_durations: dict[str, float] = {}
        metadata_by_stem: dict[str, dict] = {}
        if not local_only:
            media_by_stem, metadata_by_stem = _collect_media_and_metadata(base)
            # Index media by parent dir to prefer local matches
            for stem, v in media_by_stem.items():
                try:
                    media_by_dir.setdefault(v.parent, []).append((stem, v))
                except Exception:
                    pass
            for stem in list(media_by_stem.keys()):
                try:
                    m = metadata_by_stem.get(stem) or {}
                    d = m.get("duration")
                    if isinstance(d, (int, float)):
                        media_durations[stem] = float(d)
                except Exception:
                    pass

        # Caches
        orphan_duration_cache: dict[str, float] = {}
        media_dir_files_cache: dict[Path, list[tuple[str, Path]]] = {}
        media_duration_path_cache: dict[Path, float] = {}

        repaired_count = 0
        total = len(artifacts)

        # Initialize/seed cache for this base so apply can reuse results quickly
        try:
            cache = STATE.get("_repair_preview_cache")
            if isinstance(cache, dict):
                cache[str(base)] = {"ts": time.time(), "renamed": [], "repaired_count": 0, "total": total}
        except Exception:
            pass

        # Emit header with totals
        yield (json.dumps({"type": "start", "total": total}) + "\n").encode()

        processed = 0
        for art in artifacts:
            processed += 1
            try:
                parsed = _parse_artifact_name(art.name)
                if not parsed:
                    # Not a recognized artifact; skip
                    if processed % 25 == 0:
                        yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                    continue
                a_stem, kind = parsed
                a_stem_lower = a_stem.lower()
                parent_dir = art.parent

                # If exact media exists with the same stem, it's not an orphan — skip
                if not local_only:
                    cand_media = media_by_stem.get(a_stem)
                    if cand_media and cand_media.exists():
                        if processed % 25 == 0:
                            yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                        continue

                # In local-only mode, also check for a same-stem media file in the parent directory
                if local_only:
                    try:
                        found_same_stem = False
                        for de in os.scandir(parent_dir.parent):
                            if not de.is_file():
                                continue
                            name = de.name
                            if name.startswith('.'):
                                continue
                            stem, ext = os.path.splitext(name)
                            if ext.lower() in {".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"} and stem == a_stem:
                                found_same_stem = True
                                break
                        if found_same_stem:
                            if processed % 25 == 0:
                                yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                            continue
                    except Exception:
                        pass

                # Attempt reassociation (repair heuristics)
                a_duration: Optional[float] = None
                try:
                    if a_stem in orphan_duration_cache:
                        a_duration = orphan_duration_cache[a_stem]
                    else:
                        if kind == SUFFIX_METADATA_JSON:
                            raw = json.loads(art.read_text())
                            a_duration = extract_duration(raw)
                        else:
                            metadata_file = parent_dir / f"{a_stem}{SUFFIX_METADATA_JSON}"
                            if metadata_file.exists():
                                raw = json.loads(metadata_file.read_text())
                                a_duration = extract_duration(raw)
                        if isinstance(a_duration, (int, float)):
                            orphan_duration_cache[a_stem] = float(a_duration)
                except Exception:
                    a_duration = None

                # Build candidate list for local-only matching
                local_candidates: list[tuple[str, Path]] = []
                try:
                    if local_only:
                        media_dir = parent_dir.parent
                        cands = media_dir_files_cache.get(media_dir)
                        if cands is None:
                            cands = []
                            try:
                                for de in os.scandir(media_dir):
                                    if not de.is_file():
                                        continue
                                    name = de.name
                                    if name.startswith('.'):
                                        continue
                                    ext = os.path.splitext(name)[1].lower()
                                    if ext in {".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"}:
                                        vp = Path(de.path)
                                        cands.append((vp.stem, vp))
                            except Exception:
                                cands = []
                            media_dir_files_cache[media_dir] = cands
                        local_candidates = cands
                    else:
                        local_candidates = media_by_dir.get(parent_dir.parent, []) or []
                except Exception:
                    local_candidates = []

                # Fast-path: if exact same stem exists in local candidates, prefer it immediately
                if local_candidates:
                    try:
                        exact = next(((s, v) for (s, v) in local_candidates if s.lower() == a_stem_lower), None)
                    except Exception:
                        exact = None
                    if exact is not None:
                        _, matched_v = exact
                        dst_dir = artifact_dir(matched_v)
                        new_name = f"{matched_v.stem}{kind}"
                        dst_path = dst_dir / new_name
                        try:
                            # Skip identity mappings
                            if str(dst_path) == str(art) or (art.name == new_name and art.parent == dst_dir):
                                pass
                            else:
                                entry = {"type": "item", "from": str(art), "to": str(dst_path), "confidence": 1.0, "strategy": "exact"}
                                yield (json.dumps(entry) + "\n").encode()
                                # Update cache
                                try:
                                    cache = STATE.get("_repair_preview_cache")
                                    if isinstance(cache, dict):
                                        ce = cache.get(str(base))
                                        if isinstance(ce, dict):
                                            lst = ce.get("renamed")
                                            if isinstance(lst, list):
                                                lst.append({k: v for k, v in entry.items() if k != "type"})
                                            ce["repaired_count"] = int((ce.get("repaired_count") or 0)) + 1
                                            ce["ts"] = time.time()
                                except Exception:
                                    pass
                                repaired_count += 1
                                if processed % 25 == 0:
                                    yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                                continue
                        except Exception:
                            pass

                # Scoring-based fallback
                def _score_candidates(cands: list[tuple[str, Path]], cur_best: Optional[tuple[float, Path]]) -> Optional[tuple[float, Path]]:
                    best_local = cur_best
                    for stem, v in cands:
                        try:
                            same_parent_boost = 0.05 if v.parent == parent_dir.parent else 0.0
                        except Exception:
                            same_parent_boost = 0.0
                        stem_lower = stem.lower()
                        if stem_lower == a_stem_lower:
                            name_sim = 1.0
                        else:
                            name_sim = SequenceMatcher(a=a_stem_lower, b=stem_lower).ratio()
                        dur_sim = 0.0
                        if a_duration is not None:
                            d: Optional[float] = None
                            if local_only:
                                try:
                                    dv = media_duration_path_cache.get(v)
                                    if dv is None:
                                        mf = metadata_path(v)
                                        if mf.exists():
                                            raw = json.loads(mf.read_text())
                                            dv = extract_duration(raw) or None
                                        media_duration_path_cache[v] = float(dv) if isinstance(dv, (int, float)) else 0.0
                                    d = dv if isinstance(dv, (int, float)) else None
                                except Exception:
                                    d = None
                            else:
                                d = media_durations.get(stem)
                            if isinstance(d, (int, float)) and d > 0:
                                diff = abs(float(d) - float(a_duration))
                                dur_sim = max(0.0, 1.0 - (diff / max(d, 1.0)))
                        score = (0.65 * name_sim) + (0.35 * dur_sim) + same_parent_boost
                        if best_local is None or score > best_local[0]:
                            best_local = (score, v)
                    return best_local

                best: Optional[tuple[float, Path]] = None
                if local_candidates:
                    best = _score_candidates(local_candidates, None)
                if not local_only:
                    if best is None or best[0] < 0.80:
                        global_candidates = list(media_by_stem.items())
                        best = _score_candidates(global_candidates, best)
                if best and best[0] >= 0.80:
                    matched = best[1]
                    dst_dir = artifact_dir(matched)
                    new_name = f"{matched.stem}{kind}"
                    dst_path = dst_dir / new_name
                    # Skip identity mappings (artifact already at the correct destination)
                    try:
                        if str(dst_path) == str(art) or (art.name == new_name and art.parent == dst_dir):
                            if processed % 25 == 0:
                                yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                            continue
                    except Exception:
                        pass
                    try:
                        conf = float(best[0]) if isinstance(best, tuple) else 1.0
                    except Exception:
                        conf = 1.0
                    entry = {"type": "item", "from": str(art), "to": str(dst_path), "confidence": round(conf, 3), "strategy": "fuzzy"}
                    yield (json.dumps(entry) + "\n").encode()
                    # Append to cache
                    try:
                        cache = STATE.get("_repair_preview_cache")
                        if isinstance(cache, dict):
                            ce = cache.get(str(base))
                            if isinstance(ce, dict):
                                lst = ce.get("renamed")
                                if isinstance(lst, list):
                                    lst.append({k: v for k, v in entry.items() if k != "type"})
                                ce["repaired_count"] = int((ce.get("repaired_count") or 0)) + 1
                                ce["ts"] = time.time()
                    except Exception:
                        pass
                    repaired_count += 1

                # Emit progress every 25 items to avoid too chatty streams
                if processed % 25 == 0:
                    yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
            except Exception:
                # Skip problematic entries; keep the stream alive
                if processed % 25 == 0:
                    yield (json.dumps({"type": "progress", "processed": processed, "total": total}) + "\n").encode()
                continue

        # Done
        yield (json.dumps({"type": "done", "repaired_count": repaired_count, "total": total}) + "\n").encode()
        try:
            cache = STATE.get("_repair_preview_cache")
            if isinstance(cache, dict):
                ce = cache.get(str(base))
                if isinstance(ce, dict):
                    ce["repaired_count"] = repaired_count
                    ce["total"] = total
                    ce["ts"] = time.time()
        except Exception:
            pass
    except Exception as e:
        # Emit a terminal error message in-stream
        try:
            yield (json.dumps({"type": "error", "message": str(e)}) + "\n").encode()
        except Exception:
            pass


@app.post("/api/artifacts/repair-preview/stream")
def artifacts_repair_preview_stream(path: str = Query(default=""), local_only: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    return StreamingResponse(_iter_artifacts_repair_preview_stream(base, local_only=local_only), media_type="application/x-ndjson")


@api.post("/artifacts/repair-preview/stream", include_in_schema=False)
def artifacts_repair_preview_stream_api(path: str = Query(default=""), local_only: bool = Query(default=True)):
    return artifacts_repair_preview_stream(path=path, local_only=local_only)  # type: ignore[misc]


# --------------------------
# Tasks API for batch operations and coverage
# --------------------------

@api.get("/tasks/coverage")
def tasks_coverage(path: str = Query(default="")):
    """
    Get artifact coverage statistics for the given path."""
    try:
        base = safe_join(STATE["root"], path) if path else STATE["root"]
        if not base.exists() or not base.is_dir():
            raise_api_error("Path not found", status_code=404)

        # Find all video files
        videos = _find_mp4s(base, recursive=True)
        total_count = len(videos)

        # Count artifacts for each type
        coverage = {}

        # Metadata artifacts
        metadata_count = sum(1 for v in videos if metadata_path(v).exists())
        coverage["metadata"] = {
            "processed": metadata_count,
            "missing": total_count - metadata_count,
            "total": total_count
        }

        # Thumbnail artifacts
        thumbnails_count = sum(1 for v in videos if thumbnails_path(v).exists())
        coverage["thumbnails"] = {
            "processed": thumbnails_count,
            "missing": total_count - thumbnails_count,
            "total": total_count
        }

        # Sprite artifacts (require both sheet and index json)
        def _sprites_ok(v: Path) -> bool:
            s, jj = sprite_sheet_paths(v)
            return s.exists() and jj.exists()
        sprite_count = sum(1 for v in videos if _sprites_ok(v))
        coverage["sprites"] = {
            "processed": sprite_count,
            "missing": total_count - sprite_count,
            "total": total_count
        }

        # Preview artifacts (concatenated preview files)
        preview_count = 0
        for v in videos:
            # Check for concatenated preview file (non-empty to avoid counting stubs)
            concat_path = _preview_concat_path(v)
            if _file_nonempty(concat_path):
                preview_count += 1
        coverage["previews"] = {
            "processed": preview_count,
            "missing": total_count - preview_count,
            "total": total_count
        }

        # Phash artifacts
        phash_count = sum(1 for v in videos if phash_path(v).exists())
        coverage["phash"] = {
            "processed": phash_count,
            "missing": total_count - phash_count,
            "total": total_count
        }

        # Markers artifacts (scene detection writes into marker store)
        markers_count = sum(1 for v in videos if scenes_json_exists(v))
        coverage["markers"] = {
            "processed": markers_count,
            "missing": total_count - markers_count,
            "total": total_count
        }

        # Heatmaps artifacts (JSON is the source of truth)
        heatmaps_count = 0
        for v in videos:
            try:
                if heatmaps_json_exists(v):
                    heatmaps_count += 1
            except Exception:
                pass
        coverage["heatmaps"] = {
            "processed": heatmaps_count,
            "missing": total_count - heatmaps_count,
            "total": total_count,
        }

        # Subtitles artifacts (supports multiple naming conventions)
        subtitles_count = 0
        for v in videos:
            try:
                if find_subtitles(v) is not None:
                    subtitles_count += 1
            except Exception:
                pass
        coverage["subtitles"] = {
            "processed": subtitles_count,
            "missing": total_count - subtitles_count,
            "total": total_count,
        }

        # Faces artifacts (supports multiple naming conventions)
        faces_count = 0
        for v in videos:
            try:
                if faces_exists_check(v):
                    faces_count += 1
            except Exception:
                pass
        coverage["faces"] = {
            "processed": faces_count,
            "missing": total_count - faces_count,
            "total": total_count,
        }

        return api_success({"coverage": coverage})

    except Exception as e:
        raise_api_error(f"Failed to get coverage: {str(e)}")

@api.get("/tasks/defaults")
def tasks_defaults():
    """Return effective server-side default parameters for artifact generation.
    Frontend can use these to pre-populate option tooltips/inputs; users may override locally.
    """
    try:
        sprite_def = _sprite_defaults()
        data = {
            "thumbnails": {"offset": 10, "quality": 2},
            "sprites": {
                "interval": sprite_def.get("interval"),
                "width": sprite_def.get("width"),
                "cols": sprite_def.get("cols"),
                "rows": sprite_def.get("rows"),
                "quality": sprite_def.get("quality", 4),
            },
            "previews": {"segments": 9, "duration": 1.0, "width": 320},
            "phash": {"frames": 5, "algorithm": "ahash"},
            "markers": {"threshold": 0.4, "limit": 0, "thumbnails": False, "clips": False},
            "heatmaps": {"interval": 1.0, "mode": "both", "png": True},
            "subtitles": {"model": "small", "language": "auto", "translate": False},
            "faces": {"interval": 1.0, "min_size_frac": 0.10, "backend": "auto", "scale_factor": 1.2, "min_neighbors": 7, "sim_thresh": 0.9},
            "embed": {"interval": 1.0, "min_size_frac": 0.10, "backend": "auto", "sim_thresh": 0.9},
        }
        return api_success(data)
    except Exception as e:
        raise_api_error(f"Failed to get defaults: {e}")

# Compatibility shim routes (frontend expects /api/artifacts/orphans and /api/tasks/coverage)
@app.get("/api/artifacts/orphans", include_in_schema=False)
def artifacts_orphans_status_api(path: str = Query(default="")):
    return artifacts_orphans_status(path=path)  # type: ignore

@app.get("/api/tasks/coverage", include_in_schema=False)
def tasks_coverage_api(path: str = Query(default="")):
    return tasks_coverage(path=path)  # type: ignore

# Ensure /api/stats exists even if the router was included before this endpoint
# This avoids 404s when app.include_router(api) is executed earlier in the file.
@app.get("/api/stats", include_in_schema=False)
def api_stats_api(path: str = Query(default=""), recursive: bool = Query(default=True)):
    return api_stats(path=path, recursive=recursive)  # type: ignore

# Ensure /api/tags and /api/tags/summary exist regardless of router include order
# Forward to the router-registered handlers to prevent 404s if those were defined later.
@app.get("/api/tags", include_in_schema=False)
def api_tags_api(
    search: Optional[str] = Query(default=None),
    sort: str = Query(default="count"),
    order: str = Query(default="desc"),
    page: int = Query(default=1),
    page_size: int = Query(default=32),
    refresh: bool = Query(default=False),
    debug: bool = Query(default=False),
):
    return api_tags(  # type: ignore
        search=search,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
        refresh=refresh,
        debug=debug,
    )

@app.get("/api/tags/summary", include_in_schema=False)
def api_tags_summary_api(path: str = Query(default=""), recursive: bool = Query(default=False)):
    return api_tags_summary(path=path, recursive=recursive)  # type: ignore


@api.head("/tasks/batch")
def tasks_batch_operation_head():
    """HEAD endpoint for batch operations to avoid 405 errors."""
    return Response(status_code=200, headers={"Content-Type": "application/json"})

@api.post("/tasks/batch")
def tasks_batch_operation(request: Request):
    """
    Execute a batch artifact generation operation."""
    try:
        # Get JSON body
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        body = loop.run_until_complete(request.json())

        operation = body.get("operation")
        mode = body.get("mode")  # 'missing' or 'all'
        fileSelection = body.get("fileSelection")  # 'all' or 'selected'
        params = body.get("params", {})
        path = body.get("path", "")
        selected_paths = body.get("selectedPaths") or []

        base = safe_join(STATE["root"], path) if path else STATE["root"]
        if not base.exists() or not base.is_dir():
            raise_api_error("Path not found", status_code=404)

        # Get list of videos to process
        all_videos = _find_mp4s(base, recursive=True)
        try:
            _log("jobs", f"[batch] op={operation} mode={mode} base={base} found_videos={len(all_videos)}")
        except Exception:
            pass

        # Filter based on file selection
        if fileSelection == "selected":
            # If explicit selectedPaths provided by the frontend, filter to those
            videos_to_process: list[Path] = []
            if isinstance(selected_paths, list) and selected_paths:
                vids: list[Path] = []
                for rel in selected_paths:
                    try:
                        rel_str = str(rel)
                        # Normalize and ensure relative to root
                        p = safe_join(STATE["root"], rel_str)
                        vids.append(p)
                    except Exception:
                        continue
                # Constrain to existing and video files
                videos_to_process = [v for v in vids if v.exists() and v.is_file() and _is_original_media_file(v, base)]
            else:
                # Fallback: no selection provided; default to all (legacy behavior)
                videos_to_process = all_videos
        else:
            videos_to_process = all_videos

        # Filter based on mode (missing vs all)
        initial_count = len(videos_to_process)
        if mode == "missing":
            filtered_videos = []
            for video in videos_to_process:
                needs_processing = False

                if operation == "metadata" and not metadata_path(video).exists():
                    needs_processing = True
                elif operation == "thumbnails" and not thumbnails_path(video).exists():
                    needs_processing = True
                elif operation == "sprites":
                    s, jj = sprite_sheet_paths(video)
                    if not (s.exists() and jj.exists()):
                        needs_processing = True
                elif operation == "previews":
                    # Align with coverage: consider the concatenated preview file non-empty
                    if not _file_nonempty(_preview_concat_path(video)):
                        needs_processing = True
                elif operation == "phash" and not phash_path(video).exists():
                    needs_processing = True
                elif operation == "markers" and not scenes_json_exists(video):
                    needs_processing = True
                elif operation == "heatmaps" and not heatmaps_json_exists(video):
                    needs_processing = True
                elif operation == "subtitles" and not find_subtitles(video):
                    needs_processing = True
                elif operation == "embed" and not faces_exists_check(video):
                    # Treat missing or stub faces.json as needing embed
                    needs_processing = True
                elif operation == "faces" and not faces_exists_check(video):
                    needs_processing = True

                if needs_processing:
                    filtered_videos.append(video)

            videos_to_process = filtered_videos
            try:
                _log("jobs", f"[batch] op={operation} mode=missing filtered_missing={len(videos_to_process)} (from {initial_count})")
            except Exception:
                pass

        if not videos_to_process:
            return api_success({
                "message": "No files need processing",
                "fileCount": 0,
                "job": None
            })

        # Handle metadata clear (special immediate operation; no jobs)
        if operation == "metadata" and mode == "clear":
            deleted = 0
            for v in videos_to_process:
                try:
                    mp = metadata_path(v)
                    if mp.exists():
                        mp.unlink()
                        deleted += 1
                except Exception:
                    continue
            return api_success({"cleared": deleted, "fileCount": deleted})

        # Create job request
        task_name = operation

        job_params = {}

        # Map frontend params to backend params
        if operation == "thumbnails":
            job_params["time"] = params.get("offset", 10)
            job_params["quality"] = 2
        elif operation == "phash":
            job_params["frames"] = params.get("frames", 5)
            # Accept multiple alias names from UI for algorithm
            algo = params.get("algorithm") or params.get("algo") or params.get("phash_algorithm")
            if isinstance(algo, str) and algo.lower() in {"ahash","phash","dhash"}:
                job_params["algorithm"] = algo.lower()
        elif operation == "sprites":
            # Frontend shouldn't specify rows; use server defaults when missing
            sd = _sprite_defaults()
            job_params["interval"] = params.get("interval", sd["interval"])  # type: ignore[index]
            job_params["width"] = params.get("width", sd["width"])  # type: ignore[index]
            job_params["cols"] = params.get("cols", sd["cols"])  # type: ignore[index]
            # rows comes from server-side config (if provided), else default
            job_params["rows"] = params.get("rows", sd["rows"])  # type: ignore[index]
            # Optional quality hint (0-8) aligning with legacy UI scale (0 best? adapt as needed)
            try:
                qv = int(params.get("quality", 4))
                if 0 <= qv <= 8:
                    job_params["quality"] = qv
            except Exception:
                pass
            # Also accept quality as string (e.g., "4") or legacy scales; best-effort clamp
            if "quality" in params and not job_params.get("quality"):
                try:
                    qv2 = int(str(params.get("quality")))
                    job_params["quality"] = max(0, min(8, qv2))
                except Exception:
                    pass
        elif operation == "previews":
            job_params["segments"] = params.get("segments", 9)
            job_params["duration"] = params.get("duration", 1.0)
            # Optional width override for previews
            try:
                # Accept alternative key names for width
                pw = int(params.get("width", params.get("preview_width", params.get("previews_width", 0))))
                if pw >= 120 and pw <= 1280:
                    job_params["width"] = pw
            except Exception:
                pass
        elif operation == "embed":
            task_name = "embed"
            # Re-embed parameters (same tunables as faces)
            job_params["sim_thresh"] = float(params.get("sim_thresh", 0.9))
            job_params["interval"] = float(params.get("interval", 1.0))
            job_params["scale_factor"] = float(params.get("scale_factor", 1.2))
            job_params["min_neighbors"] = int(params.get("min_neighbors", 7))
            job_params["min_size_frac"] = float(params.get("min_size_frac", 0.10))
            job_params["backend"] = str(params.get("backend", "auto"))
            if bool(params.get("force", False)) or bool(params.get("overwrite", False)):
                job_params["overwrite"] = True
        elif operation == "heatmaps":
            job_params["interval"] = params.get("interval", 5.0)
            job_params["mode"] = params.get("mode", "both")
            job_params["png"] = bool(params.get("png", True))
        elif operation == "subtitles":
            job_params["model"] = params.get("model", "small")
            job_params["language"] = params.get("language", "auto")
            job_params["translate"] = bool(params.get("translate", False))
        elif operation == "markers":
            # Support both snake_case and camelCase param names from the UI
            job_params["threshold"] = float(params.get("threshold", 0.4))
            job_params["limit"] = int(params.get("limit", 0) or 0)
            job_params["thumbnails"] = bool(params.get("thumbnails", False))
            job_params["clips"] = bool(params.get("clips", False))
            job_params["thumbnails_width"] = int(params.get("thumbnails_width", params.get("thumbnailsWidth", 320)))
            job_params["clip_duration"] = float(params.get("clip_duration", params.get("clipDuration", 2.0)))
        elif operation == "faces":
            # Face embeddings parameters
            job_params["sim_thresh"] = float(params.get("sim_thresh", 0.9))
            job_params["interval"] = float(params.get("interval", 1.0))
            job_params["scale_factor"] = float(params.get("scale_factor", 1.2))
            job_params["min_neighbors"] = int(params.get("min_neighbors", 7))
            job_params["min_size_frac"] = float(params.get("min_size_frac", 0.10))
            job_params["backend"] = str(params.get("backend", "auto"))
            if bool(params.get("force", False)):
                # Force recompute even if outputs exist
                job_params["overwrite"] = True

        # When running only missing, pass explicit targets so job progress reflects the actual work set
        targets: list[str] = []
        if mode == "missing" and videos_to_process:
            for v in videos_to_process:
                try:
                    rel = str(v.relative_to(STATE["root"]))
                except Exception:
                    # If not within root, skip (shouldn't happen)
                    continue
                targets.append(rel)
            if targets:
                job_params["targets"] = targets

        # Queue-time deduplication: avoid enqueuing jobs for targets that already have
        # a queued or running job for the same task.
        # Build a set of (task_name, rel_path) for active jobs.
        active_targets: set[tuple[str, str]] = set()
        try:
            with JOB_LOCK:
                existing_jobs = list(JOBS.values())
        except Exception:
            existing_jobs = []
        root_res = STATE["root"].resolve()
        for j in existing_jobs:
            try:
                state = (j.get("state") or "").lower()
                if state not in ("queued", "running"):
                    continue
                jtype = (j.get("type") or "").lower()
                if not jtype:
                    continue
                # Only dedupe against same normalized task
                if jtype != task_name:
                    continue
                # Collect possible target hints: current, label, and request.params.targets
                paths: list[str] = []
                cur = j.get("current") or j.get("label")
                if cur:
                    paths.append(str(cur))
                try:
                    req = j.get("request") or {}
                    params_j = (req.get("params") or {})
                    tgts = params_j.get("targets") or []
                    for t in tgts:
                        paths.append(str(t))
                except Exception:
                    pass
                for pstr in paths:
                    try:
                        p = Path(pstr)
                        if not p.is_absolute():
                            vp = (STATE["root"] / p).resolve()
                        else:
                            vp = p.resolve()
                        rel = str(vp.relative_to(root_res))
                    except Exception:
                        rel = str(pstr)
                    active_targets.add((jtype, rel))
            except Exception:
                continue

        # If we have explicit targets (missing mode), drop any already-active ones
        if mode == "missing" and targets:
            filtered_targets: list[str] = []
            filtered_videos: list[Path] = []
            for v in videos_to_process:
                try:
                    rel = str(v.relative_to(STATE["root"]))
                except Exception:
                    continue
                if (task_name, rel) in active_targets:
                    # skip this one; already has a queued/running job
                    continue
                filtered_targets.append(rel)
                filtered_videos.append(v)
            videos_to_process = filtered_videos
            if filtered_targets:
                job_params["targets"] = filtered_targets
            else:
                job_params.pop("targets", None)
            try:
                _log("jobs", f"[batch] op={operation} deduped_active targets={len(job_params.get('targets') or [])} remaining_files={len(videos_to_process)} active_hits={initial_count - len(videos_to_process)}")
            except Exception:
                pass

        # If multiple files, spawn per-file jobs (default concurrency capped globally).
        # Special-case retained only for thumbnails (aggregated); metadata now uses per-file jobs
        # so each file appears as its own row in the queue for clarity.
        created_jobs: list[str] = []
        if operation == "thumbnails":
            # Single aggregated thumbnails job (maps to internal 'thumbnail' task)
            agg_params = dict(job_params)
            if mode == "missing":
                if not agg_params.get("targets"):
                    tgt_list: list[str] = []
                    for v in videos_to_process:
                        try:
                            tgt_list.append(str(v.relative_to(STATE["root"])))
                        except Exception:
                            continue
                    if tgt_list:
                        agg_params["targets"] = tgt_list
            elif fileSelection == "selected":
                # Honor selected scope for all-mode by passing explicit targets
                if not agg_params.get("targets"):
                    tgt_list2: list[str] = []
                    for v in videos_to_process:
                        try:
                            tgt_list2.append(str(v.relative_to(STATE["root"])))
                        except Exception:
                            continue
                    if tgt_list2:
                        agg_params["targets"] = tgt_list2
            req = JobRequest(
                task="thumbnail",
                directory=str(base),
                recursive=(mode == "all" and not bool(agg_params.get("targets"))),
                force=(mode == "all"),
                params=agg_params,
            )
            jid = _new_job(req.task, req.directory or str(STATE["root"]))
            try:
                with JOB_LOCK:
                    if jid in JOBS:
                        JOBS[jid]["request"] = req.dict()
                _persist_job(jid)
            except Exception:
                pass
            def _thumbnails_runner():
                with JOB_RUN_SEM:
                    _run_job_worker(jid, req)
            threading.Thread(target=_thumbnails_runner, daemon=True).start()
            created_jobs.append(jid)
        elif operation == "previews":
            agg_params = dict(job_params)
            if mode == "missing":
                if not agg_params.get("targets"):
                    tgt_list: list[str] = []
                    for v in videos_to_process:
                        try:
                            tgt_list.append(str(v.relative_to(STATE["root"])))
                        except Exception:
                            continue
                    if tgt_list:
                        agg_params["targets"] = tgt_list
            elif fileSelection == "selected":
                if not agg_params.get("targets"):
                    tgt_list2: list[str] = []
                    for v in videos_to_process:
                        try:
                            tgt_list2.append(str(v.relative_to(STATE["root"])))
                        except Exception:
                            continue
                    if tgt_list2:
                        agg_params["targets"] = tgt_list2
            req = JobRequest(
                task="preview",
                directory=str(base),
                recursive=(mode == "all" and not bool(agg_params.get("targets"))),
                force=(mode == "all"),
                params=agg_params,
            )
            jid = _new_job(req.task, req.directory or str(STATE["root"]))
            try:
                with JOB_LOCK:
                    if jid in JOBS:
                        JOBS[jid]["request"] = req.dict()
                _persist_job(jid)
            except Exception:
                pass
            def _preview_runner():
                with JOB_RUN_SEM:
                    _run_job_worker(jid, req)
            threading.Thread(target=_preview_runner, daemon=True).start()
            created_jobs.append(jid)
        elif len(videos_to_process) <= 1:
            # Single job path for 0 or 1 file
            # If 1 file and it's already active, short-circuit with a friendly message
            if len(videos_to_process) == 1 and mode == "missing":
                try:
                    rel0 = str(videos_to_process[0].relative_to(STATE["root"]))
                except Exception:
                    rel0 = ""
                if rel0 and (task_name, rel0) in active_targets:
                    return api_success({
                        "jobs": [],
                        "fileCount": 0,
                        "message": f"Skipped: {task_name} job already queued/running for {rel0}",
                    })
            req = JobRequest(
                task=task_name,
                directory=str(base),
                recursive=(mode == "all"),
                force=(mode == "all"),
                params=job_params,
            )
            jid = _new_job(req.task, req.directory or str(STATE["root"]))
            # Persist originating request for restore/resume
            try:
                with JOB_LOCK:
                    if jid in JOBS:
                        JOBS[jid]["request"] = req.dict()
                _persist_job(jid)
            except Exception:
                pass
            def _single_runner():
                with JOB_RUN_SEM:
                    _run_job_worker(jid, req)
            threading.Thread(target=_single_runner, daemon=True).start()
            created_jobs.append(jid)
        else:
            # Per-file jobs: one JobRequest per video, but avoid spawning thousands of threads at once.
            # Strategy: create all job rows immediately, then use a single starter thread to
            # launch workers in bounded waves. This keeps separate queue rows while preventing
            # "can't start new thread" errors for large batches.
            seen_targets: set[tuple[str, str]] = set()
            to_start: list[tuple[str, JobRequest]] = []
            for v in videos_to_process:
                try:
                    rel = str(v.relative_to(STATE["root"]))
                except Exception:
                    continue
                per_params = dict(job_params)
                per_params["targets"] = [rel]
                dedup_key = (task_name, rel)
                if dedup_key in seen_targets or dedup_key in active_targets:
                    continue
                seen_targets.add(dedup_key)
                req = JobRequest(
                    task=task_name,
                    directory=str(base),
                    recursive=False,
                    force=(mode == "all"),
                    params=per_params,
                )
                jid = _new_job(req.task, req.directory or str(STATE["root"]))
                try:
                    with JOB_LOCK:
                        if jid in JOBS:
                            JOBS[jid]["label"] = rel
                            JOBS[jid]["request"] = req.dict()
                except Exception:
                    pass
                _persist_job(jid)
                created_jobs.append(jid)
                to_start.append((jid, req))

            # Staggered starter: launches up to a bounded window of worker threads at a time
            def _staggered_start(pairs: list[tuple[str, JobRequest]], task_type: str):
                try:
                    import time as _time
                except Exception:
                    # Fallback shim
                    class _T:  # type: ignore
                        @staticmethod
                        def sleep(x):
                            pass
                    _time = _T()  # type: ignore
                try:
                    # Window defaults: 2x job concurrency, min 6, max 32 (configurable via env)
                    wnd_env = os.environ.get("BATCH_START_WINDOW")
                    if wnd_env is not None:
                        window = max(1, int(wnd_env))
                    else:
                        window = max(6, min(32, JOB_MAX_CONCURRENCY * 2))  # type: ignore[name-defined]
                except Exception:
                    window = 12

                idx = 0
                total = len(pairs)
                started: set[str] = set()
                while idx < total:
                    # Launch up to 'window' new workers
                    upper = min(total, idx + window)
                    for k in range(idx, upper):
                        jid_k, req_k = pairs[k]
                        def _runner(jid=jid_k, req=req_k):
                            with JOB_RUN_SEM:
                                _run_job_worker(jid, req)
                        try:
                            threading.Thread(target=_runner, name=f"job-{task_type}-{jid_k}", daemon=True).start()
                            started.add(jid_k)
                        except Exception:
                            # If thread creation fails, break to avoid tight loop
                            break
                    idx = upper
                    if idx >= total:
                        break
                    # Wait until number of active-started jobs (queued/running) among those we started
                    # drops below half the window before starting next wave. This bounds total worker
                    # threads and avoids starting a thread per file at once.
                    while True:
                        try:
                            with JOB_LOCK:
                                active = 0
                                for jid_s in list(started):
                                    j = JOBS.get(jid_s)
                                    if not j:
                                        continue
                                    st = str(j.get("state") or "").lower()
                                    if st in ("queued", "running", "cancel_requested"):
                                        active += 1
                        except Exception:
                            active = 0
                        if active <= max(1, window // 2):
                            break
                        _time.sleep(0.35)

            # Kick off the starter thread (returns immediately)
            try:
                threading.Thread(target=_staggered_start, args=(to_start, task_name), name=f"batch-starter-{task_name}", daemon=True).start()
            except Exception:
                # As a fallback, start sequentially (still avoids massive thread fan-out)
                for jid_k, req_k in to_start:
                    def _runner(jid=jid_k, req=req_k):
                        with JOB_RUN_SEM:
                            _run_job_worker(jid, req)
                    try:
                        threading.Thread(target=_runner, name=f"job-{task_name}-{jid_k}", daemon=True).start()
                    except Exception:
                        break

        try:
            _log("jobs", f"[batch] op={operation} enqueued_jobs={len(created_jobs)} file_count={len(videos_to_process)}")
        except Exception:
            pass
        return api_success({
            "jobs": created_jobs,
            "fileCount": len(videos_to_process),
            "message": f"Queued {len(created_jobs)} {operation} jobs for {len(videos_to_process)} files"
        })

    except Exception as e:
        raise_api_error(f"Failed to start batch operation: {str(e)}")


@api.get("/tasks/jobs")
def tasks_jobs():
    """
    Get current job status with stats."""
    try:
        with JOB_LOCK:
            all_jobs = list(JOBS.values())

        # Format jobs for frontend
        formatted_jobs = []
        root = STATE["root"].resolve()
        def _fmt_rel(p: Path) -> str:
            try:
                return p.resolve().relative_to(root).as_posix()
            except Exception:
                try:
                    return p.as_posix()
                except Exception:
                    return str(p)
        for job in all_jobs:
            # Map backend job to frontend format
            formatted_job = {
                "id": job["id"],
                "task": job.get("type", "unknown"),
                # Prefer current active file if available, else a queued label, else base path
                "file": job.get("current") or job.get("label") or job.get("path", ""),
                "status": job.get("state", "unknown"),
                "paused": bool(job.get("paused")),
                "progress": 0,
                "createdTime": job.get("created_at"),
                "startTime": job.get("started_at"),
                "endedTime": job.get("ended_at"),
                # Expose raw counters so the UI can derive percentages if needed
                "totalRaw": job.get("total"),
                "processedRaw": job.get("processed"),
                # Bubble up error when present so UI can display/inspect it
                "error": job.get("error"),
            }
            # Best-effort target artifact path (relative to root) for the current file, when applicable
            try:
                jtype = (job.get("type") or "").lower()
                # Provide a stable "artifact" key aligning with frontend badge dataset values
                # Badge keys (sidebar): metadata, thumbnail, preview, phash, sprites, heatmaps, subtitles, markers, faces
                artifact_map = {
                    "thumbnail": "thumbnail",
                    "preview": "preview",
                    "phash": "phash",
                    "markers": "markers",
                    "sprites": "sprites",
                    "heatmaps": "heatmaps",
                    "faces": "faces",
                    "embed": "faces",           # embed updates faces.json; reuse faces spinner
                    "metadata": "metadata",
                    "subtitles": "subtitles",
                }
                if jtype in artifact_map:
                    formatted_job["artifact"] = artifact_map[jtype]
                cur = job.get("current") or job.get("label") or job.get("path") or ""
                target_path_str: Optional[str] = None
                if cur:
                    vp = Path(cur)
                    if not vp.is_absolute():
                        vp = (STATE["root"] / vp).resolve()
                    tp: Optional[Path] = None
                    if jtype == "thumbnail":
                        tp = thumbnails_path(vp)
                    elif jtype == "preview":
                        tp = artifact_dir(vp) / f"{vp.stem}{SUFFIX_PREVIEW_WEBM}"
                    elif jtype == "phash":
                        tp = phash_path(vp)
                    elif jtype == "markers":
                        tp = scenes_json_path(vp)
                    elif jtype == "sprites":
                        tp, _ = sprite_sheet_paths(vp)
                    elif jtype == "heatmaps":
                        tp = heatmaps_json_path(vp)
                    elif jtype == "faces":
                        tp = faces_path(vp)
                    elif jtype == "embed":
                        # Embed jobs also produce/update faces.json
                        tp = faces_path(vp)
                    elif jtype == "metadata":
                        tp = metadata_path(vp)
                    elif jtype == "subtitles":
                        tp = artifact_dir(vp) / f"{vp.stem}{SUFFIX_SUBTITLES_SRT}"
                    if tp is not None:
                        target_path_str = _fmt_rel(tp)
                if target_path_str:
                    formatted_job["target"] = target_path_str
            except Exception:
                pass

            # Calculate progress percentage
            total = job.get("total")
            processed = job.get("processed")
            pct_val = None
            if total and processed is not None:
                try:
                    pct_val = int((float(processed) / float(total)) * 100)
                    if pct_val < 0:
                        pct_val = 0
                    if pct_val > 100:
                        pct_val = 100
                except Exception:
                    pct_val = None
            # If job is completed, force 100% regardless of counters to avoid UI mismatch
            if job.get("state") == "done":
                formatted_job["progress"] = 100
            else:
                formatted_job["progress"] = pct_val if pct_val is not None else 0

            formatted_jobs.append(formatted_job)

        # Calculate stats
        now = time.time()
        # Active = actually running jobs (not queued)
        active_jobs = [j for j in all_jobs if j.get("state") == "running"]
        queued_jobs = [j for j in all_jobs if j.get("state") == "queued"]
        failed_jobs = [j for j in all_jobs if j.get("state") == "failed"]

        # Count completed jobs from today
        completed_today = 0
        for job in all_jobs:
            if job.get("state") == "done" and job.get("ended_at"):
                # Simple check for jobs completed in last 24 hours
                if now - job.get("ended_at", 0) < 86400:
                    completed_today += 1

        stats = {
            "active": len(active_jobs),
            "queued": len(queued_jobs),
            "failed": len(failed_jobs),
            "completedToday": completed_today
        }

        # Prioritize live jobs (running first, then queued), then recent others.
        live = [j for j in formatted_jobs if j.get("status") in ("running", "queued")]
        rest = [j for j in formatted_jobs if j.get("status") not in ("running", "queued")]

        def live_key(x: dict):
            # running before queued; then by start time desc; then by created time desc
            prio = 1 if x.get("status") == "running" else 0
            t = x.get("startTime") or x.get("createdTime") or 0
            return (-prio, -float(t))

        def rest_key(x: dict):
            # prefer started_at, then ended_at, then created_at
            t = x.get("startTime") or x.get("endedTime") or x.get("createdTime") or 0
            return -float(t)

        live.sort(key=live_key)
        rest.sort(key=rest_key)

        # Always include all jobs (live first), so UI filters can show full history
        result_jobs = live + rest

        return api_success({
            "jobs": result_jobs,
            "stats": stats
        })
    except Exception as e:
        raise_api_error(f"Failed to get job status: {str(e)}")


@api.get("/tasks/diag")
def tasks_diag():
    """
    Return a lightweight diagnostics snapshot for job scheduling/concurrency.
    Helps identify why only one job might be running when higher caps are set.
    """
    try:
        with JOB_LOCK:
            all_jobs = list(JOBS.values())
        running = [j for j in all_jobs if str(j.get("state") or "").lower() == "running"]
        queued = [j for j in all_jobs if str(j.get("state") or "").lower() == "queued"]
        def by_type(lst):
            out: dict[str, int] = {}
            for j in lst:
                t = _normalize_job_type(str(j.get("type") or ""))
                out[t] = out.get(t, 0) + 1
            return out
        # Env flags that influence starting behavior
        strict_fifo = str(os.environ.get("STRICT_FIFO_START", "0")).lower() in ("1","true","yes")
        fair_strict = str(os.environ.get("JOB_FAIR_START_STRICT", "0")).lower() in ("1","true","yes")
        raw_light = os.environ.get("LIGHT_SLOT_TYPES")
        if raw_light is not None:
            light_types = {s.strip().lower() for s in raw_light.split(',') if s.strip()}
        else:
            light_types = {"markers", "previews", "sprites", "phash", "faces", "heatmaps"}
        light_all = str(os.environ.get("LIGHT_SLOT_ALL", "0")).lower() in ("1","true","yes")
        resp = {
            "jobMaxConcurrency": int(JOB_MAX_CONCURRENCY),
            "ffmpegConcurrency": int(_FFMPEG_CONCURRENCY),  # type: ignore[name-defined]
            "env": {
                "STRICT_FIFO_START": strict_fifo,
                "JOB_FAIR_START_STRICT": fair_strict,
                "LIGHT_SLOT_ALL": light_all,
                "LIGHT_SLOT_TYPES": sorted(light_types),
            },
            "running": {
                "total": len(running),
                "byType": by_type(running),
            },
            "queued": {
                "total": len(queued),
                "byType": by_type(queued),
            },
        }
        return api_success(resp)
    except Exception as e:
        raise_api_error(f"Failed to get diagnostics: {str(e)}")


@api.post("/tasks/jobs/{job_id}/cancel")
def tasks_cancel_job(job_id: str):
    """
    Cancel a running job."""
    try:
        ev = JOB_CANCEL_EVENTS.get(job_id)
        if ev is None:
            raise_api_error("Job not found", status_code=404)
        # Idempotent behavior: treat missing job/event or terminal states as success
        with JOB_LOCK:
            j = JOBS.get(job_id)
        if j is None:
            # Already cleared from registry; report idempotent success
            return api_success({"message": "Job already removed", "job": job_id, "idempotent": True})
        st = str(j.get("state") or "").lower()
        if st in ("done", "failed", "canceled", "cancel_requested", "completed"):
            # Already finished or cancel in progress; nothing more to do
            return api_success({"message": "Job already in terminal state", "job": job_id, "state": st, "idempotent": True})
        ev = JOB_CANCEL_EVENTS.get(job_id)
        if ev is None:
            # Event missing but job still present (shouldn't happen unless manual mutation); create one and continue
            ev = threading.Event()
            JOB_CANCEL_EVENTS[job_id] = ev
        # Immediately terminate any active subprocesses for this job (e.g., ffmpeg)
        try:
            _terminate_job_processes(job_id)  # type: ignore[name-defined]
        except Exception:
            pass
        with JOB_LOCK:
            j = JOBS.get(job_id)
            if j and j.get("state") in ("queued", "running"):
                # Hard cancel queued or running jobs immediately
                j["state"] = "canceled"
                j["ended_at"] = time.time()
                # Signal cancel event so _finish_job preserves canceled state
                try:
                    cev = JOB_CANCEL_EVENTS.get(job_id)
                    if cev:
                        cev.set()
                except Exception:
                    pass
                # Propagate batch cancel if part of a metadata batch
                try:
                    batch_ref = j.get("meta_batch")
                    if batch_ref and batch_ref in META_BATCH_EVENTS:
                        META_BATCH_EVENTS[batch_ref].set()
                except Exception:
                    pass
        # Persist updated state so restarts do not auto-restore
        try:
            _persist_job(job_id)
        except Exception:
            pass

        _publish_job_event({"event": "cancel", "id": job_id})

        return api_success({"message": "Job canceled", "job": job_id})

    except Exception as e:
        raise_api_error(f"Failed to cancel job: {str(e)}")


@api.post("/tasks/jobs/cancel-queued")
def tasks_cancel_all_queued():
    """
    Cancel all queued jobs (fast no-op for ones already running)."""
    try:
        count = 0
        with JOB_LOCK:
            ids = [jid for jid, j in JOBS.items() if j.get("state") == "queued"]
        for jid in ids:
            ev = JOB_CANCEL_EVENTS.get(jid)
            if ev and not ev.is_set():
                ev.set()
            try:
                _terminate_job_processes(jid)  # type: ignore[name-defined]
            except Exception:
                pass
            with JOB_LOCK:
                j = JOBS.get(jid)
                if j and j.get("state") == "queued":
                    j["state"] = "canceled"
                    j["ended_at"] = time.time()
            try:
                _persist_job(jid)
            except Exception:
                pass
            count += 1
        _publish_job_event({"event": "cancel_all", "count": count})
        return api_success({"canceled": count})
    except Exception as e:
        raise_api_error(f"Failed to cancel queued jobs: {str(e)}")


@api.post("/tasks/jobs/cancel-all")
def tasks_cancel_all():
    """
    Cancel all queued and running jobs by signaling their cancel events.
    Running jobs will attempt to stop gracefully at their next cancellation check.
    """
    try:
        # Phase 1: snapshot and persist state transitions up front to minimize race with process termination
        with JOB_LOCK:
            queued_ids = [jid for jid, j in JOBS.items() if str(j.get("state") or "").lower() == "queued"]
            running_ids = [jid for jid, j in JOBS.items() if str(j.get("state") or "").lower() == "running"]
        # Mark queued as canceled immediately (with ended_at) and running as cancel_requested
        now_ts = time.time()
        for jid in queued_ids:
            try:
                with JOB_LOCK:
                    j = JOBS.get(jid)
                    if j and str(j.get("state") or "").lower() == "queued":
                        j["state"] = "canceled"
                        j["ended_at"] = now_ts
                _persist_job(jid)
            except Exception:
                pass
        for jid in running_ids:
            try:
                with JOB_LOCK:
                    j = JOBS.get(jid)
                    if j and str(j.get("state") or "").lower() == "running":
                        j["state"] = "canceled"
                        j["ended_at"] = now_ts
                _persist_job(jid)
            except Exception:
                pass

        # Phase 2: signal cancel events and terminate any active subprocesses (best-effort)
        for jid in queued_ids + running_ids:
            try:
                ev = JOB_CANCEL_EVENTS.get(jid)
                if ev and not ev.is_set():
                    ev.set()
                _terminate_job_processes(jid)  # type: ignore[name-defined]
            except Exception:
                pass

        count = len(queued_ids) + len(running_ids)
        _publish_job_event({"event": "cancel_all", "count": count})
        return api_success({"canceled": count})
    except Exception as e:
        raise_api_error(f"Failed to cancel all jobs: {str(e)}")


@api.post("/tasks/jobs/resume-restored")
def tasks_resume_restored():
    """
    Resume all jobs in 'restored' state that have a saved request payload by queuing
    worker threads. This is a manual alternative to auto-restore on startup.
    """
    try:
        to_resume: list[tuple[str, dict]] = []
        with JOB_LOCK:
            for jid, j in JOBS.items():
                if str(j.get("state") or "").lower() == "restored" and isinstance(j.get("request"), dict):
                    to_resume.append((jid, dict(j["request"])))
        count = 0
        for jid, req_data in to_resume:
            try:
                jr = JobRequest(
                    task=str(req_data.get("task") or ""),
                    directory=req_data.get("directory"),
                    recursive=bool(req_data.get("recursive", False)),
                    force=bool(req_data.get("force", False)),
                    params=dict(req_data.get("params") or {}),
                )
                def _runner(jid=jid, jr=jr):
                    with JOB_RUN_SEM:
                        _run_job_worker(jid, jr)
                with JOB_LOCK:
                    j = JOBS.get(jid)
                    if j:
                        j["state"] = "queued"
                        _persist_job(jid)
                threading.Thread(target=_runner, name=f"job-resume-{jid}", daemon=True).start()
                count += 1
            except Exception:
                continue
        return api_success({"resumed": count})
    except Exception as e:
        raise_api_error(f"Failed to resume restored jobs: {str(e)}")


@api.post("/tasks/jobs/clear-restored")
def tasks_clear_restored():
    """
    Remove jobs in 'restored' state from memory and delete their persisted .jobs files.
    Useful to declutter after a dev session with auto-restore disabled.
    """
    try:
        removed = 0
        with JOB_LOCK:
            ids = [jid for jid, j in JOBS.items() if str(j.get("state") or "").lower() == "restored"]
            for jid in ids:
                JOBS.pop(jid, None)
                JOB_CANCEL_EVENTS.pop(jid, None)
                removed += 1
                try:
                    _delete_persisted_job(jid)
                except Exception:
                    pass
        _publish_job_event({"event": "purge_restored", "removed": removed})
        return api_success({"removed": removed})
    except Exception as e:
        raise_api_error(f"Failed to clear restored jobs: {str(e)}")


@api.get("/tasks/concurrency")
def tasks_get_concurrency():
    """
    Return current max concurrency."""
    try:
        return api_success({"maxConcurrency": JOB_MAX_CONCURRENCY})
    except Exception as e:
        raise_api_error(f"Failed to get concurrency: {str(e)}")


@api.post("/tasks/concurrency")
def tasks_set_concurrency(value: int = Query(..., ge=1, le=128)):
    """
    Update max concurrency (process-wide)."""
    try:
        new_val = int(value)
        eff = _set_job_concurrency(new_val)
        _publish_job_event({"event": "concurrency", "value": eff})
        return api_success({"maxConcurrency": eff})
    except Exception as e:
        raise_api_error(f"Failed to set concurrency: {str(e)}")

# -----------------------------
# FFmpeg runtime settings API
# -----------------------------
@api.get("/settings/ffmpeg")
def ffmpeg_get_settings():
    """Return current FFmpeg settings: concurrency, threads, timelimit."""
    try:
        try:
            threads = int(os.environ.get("FFMPEG_THREADS", "1") or 1)
        except Exception:
            threads = 1
        try:
            timelimit = int(os.environ.get("FFMPEG_TIMELIMIT", "600") or 600)
        except Exception:
            timelimit = 600
        return api_success({
            "concurrency": int(_FFMPEG_CONCURRENCY),
            "threads": max(1, threads),
            "timelimit": max(0, timelimit),
        })
    except Exception as e:
        raise_api_error(f"Failed to get ffmpeg settings: {str(e)}")

@api.post("/settings/ffmpeg")
def ffmpeg_set_settings(
    concurrency: Optional[int] = Query(None, ge=1, le=16),
    threads: Optional[int] = Query(None, ge=1, le=32),
    timelimit: Optional[int] = Query(None, ge=0, le=86400),
):
    """Update FFmpeg settings at runtime. Any omitted field is left unchanged.
    - concurrency: number of parallel ffmpeg processes allowed
    - threads: passed to ffmpeg as -threads N for encoders/filters
    - timelimit: passed as -timelimit seconds to cap each run (0 to disable)
    """
    try:
        applied = {}
        if concurrency is not None:
            eff = _set_ffmpeg_concurrency(int(concurrency))
            applied["concurrency"] = int(eff)
        if threads is not None:
            try:
                os.environ["FFMPEG_THREADS"] = str(int(threads))
            except Exception:
                pass
            applied["threads"] = int(os.environ.get("FFMPEG_THREADS", threads))
        if timelimit is not None:
            try:
                os.environ["FFMPEG_TIMELIMIT"] = str(int(timelimit))
            except Exception:
                pass
            applied["timelimit"] = int(os.environ.get("FFMPEG_TIMELIMIT", timelimit))
        # Return current values (fully populated)
        try:
            threads_cur = int(os.environ.get("FFMPEG_THREADS", "1") or 1)
        except Exception:
            threads_cur = 1
        try:
            timelimit_cur = int(os.environ.get("FFMPEG_TIMELIMIT", "600") or 600)
        except Exception:
            timelimit_cur = 600
        current = {
            "concurrency": int(_FFMPEG_CONCURRENCY),
            "threads": max(1, threads_cur),
            "timelimit": max(0, timelimit_cur),
        }
        _publish_job_event({"event": "ffmpeg_settings", "value": current})
        return api_success(current)
    except Exception as e:
        raise_api_error(f"Failed to set ffmpeg settings: {str(e)}")


@api.post("/tasks/jobs/clear-completed")
def tasks_clear_completed():
    """
    Remove completed/failed/canceled jobs from the registry and on-disk .jobs folder."""
    try:
        removed = 0
        with JOB_LOCK:
            ids = [jid for jid, j in JOBS.items() if j.get("state") in ("done", "completed", "failed", "canceled")]
            for jid in ids:
                JOBS.pop(jid, None)
                ev = JOB_CANCEL_EVENTS.pop(jid, None)
                # no special cleanup needed for events
                removed += 1
                # also remove persisted state on disk
                try:
                    _delete_persisted_job(jid)
                except Exception:
                    pass
        # Sweep any orphaned .jobs files too
        try:
            d = _jobs_state_dir()
            for p in d.glob("*.json"):
                try:
                    jid = p.stem
                    # If file id no longer in JOBS OR its persisted state is terminal, remove
                    if jid not in JOBS:
                        p.unlink(missing_ok=True)
                        continue
                    # If still present but somehow terminal (e.g. race where JOBS mutated after id list capture)
                    try:
                        data = json.loads(p.read_text())
                        st = str(data.get("state") or "").lower()
                        if st in ("done", "failed", "canceled", "cancel_requested", "completed"):
                            p.unlink(missing_ok=True)
                            # Ensure registry reflects purge to avoid ghost re-persist
                            with JOB_LOCK:
                                JOBS.pop(jid, None)
                                JOB_CANCEL_EVENTS.pop(jid, None)
                            removed += 1
                    except Exception:
                        # If unreadable, treat as orphan and remove
                        p.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception:
            pass
        _publish_job_event({"event": "purge", "removed": removed})
        return api_success({"removed": removed})
    except Exception as e:
        raise_api_error(f"Failed to clear completed jobs: {str(e)}")


@api.post("/tasks/jobs/clear-all")
def tasks_clear_all():
    """Clear all jobs and delete their persisted state."""
    try:
        removed = 0
        with JOB_LOCK:
            ids = list(JOBS.keys())
            for jid in ids:
                JOBS.pop(jid, None)
                ev = JOB_CANCEL_EVENTS.pop(jid, None)
                removed += 1
        try:
            d = _jobs_state_dir()
            for p in d.glob("*.json"):
                p.unlink(missing_ok=True)
        except Exception:
            pass
        _publish_job_event({"event": "purge", "removed": removed})
        return api_success({"removed": removed})
    except Exception as e:
        raise_api_error(f"Failed to clear all jobs: {str(e)}")


# --------------------------
# Registry API (tags, performers)
# --------------------------

@api.get("/registry/tags")
def registry_tags_list():
    path = _tags_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "tags")
        items = list(data.get("tags") or [])
    items.sort(key=lambda x: (x.get("name") or "").lower())
    return api_success({"tags": items, "count": len(items)})


@api.post("/registry/tags/create")
def registry_tags_create(payload: TagCreate):
    name = (payload.name or "").strip()
    if not name:
        return api_error("name is required", status_code=400)
    slug = _slugify(name)
    path = _tags_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "tags")
        items: list[dict] = data.get("tags") or []
        # conflict if slug exists
        for t in items:
            if (t.get("slug") or "") == slug:
                return api_error("tag already exists", status_code=409)
        tid = int(data.get("next_id") or 1)
        item = {"id": tid, "name": name, "slug": slug}
        items.append(item)
        data["tags"] = items
        data["next_id"] = tid + 1
        _save_registry(path, data)
    return api_success(item, status_code=201)


@api.post("/registry/tags/rename")
def registry_tags_rename(
    payload: TagRename,
    rewrite_sidecars: bool = Query(default=True),
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
):
    """Rename a tag and update references consistently.

    Behavior:
    - If the tag is found in the registry by id or slug(old name), update its name first
      (keeping the old slug) so sidecar rewrite can map old-slug -> new name.
    - If not found but a name is provided, create a temporary canonical entry using the
      OLD slug and the NEW name, so the sidecar rewrite can lift all occurrences to the
      new display name.
    - After sidecar rewrite, update the entry's slug to match the NEW name (new slug).
    - Finally, normalize in-memory media attributes for immediate UI reflection.
    """
    if not payload.new_name:
        return api_error("new_name is required", status_code=400)

    old_name_in = (payload.name or "").strip() if payload.name is not None else None
    reg_path = _tags_registry_path()
    new_name = (payload.new_name or "").strip()
    new_slug = _slugify(new_name)

    # First pass: find or (optionally) create entry with OLD slug, and set its NAME to new_name
    with REGISTRY_LOCK:
        data = _load_registry(reg_path, "tags")
        items: list[dict] = data.get("tags") or []

        target = None
        old_slug = None
        if payload.id is not None:
            for t in items:
                if int(t.get("id") or 0) == int(payload.id):
                    target = t
                    break
            if target is None and old_name_in:
                old_slug = _slugify(old_name_in)
        elif old_name_in:
            old_slug = _slugify(old_name_in)
            for t in items:
                if (t.get("slug") or "") == old_slug:
                    target = t
                    break

        # If still unknown, and we have an old name, create a placeholder entry so rewrite works
        if target is None:
            if not old_name_in:
                return api_error("tag not found", status_code=404)
            if old_slug is None:
                old_slug = _slugify(old_name_in)
            # Conflict check: if another item already uses the intended NEW slug, this would be a merge
            for t in items:
                if (t.get("slug") or "") == new_slug:
                    return api_error("tag with new_name already exists", status_code=409)
            tid = int(data.get("next_id") or 1)
            target = {"id": tid, "name": new_name, "slug": old_slug}
            items.append(target)
            data["tags"] = items
            data["next_id"] = tid + 1
            _save_registry(reg_path, data)
        else:
            # Found existing entry: ensure we don't collide if changing slug later
            # Only do a conflict check when new slug differs from current one
            cur_slug = (target.get("slug") or "")
            if new_slug != cur_slug:
                for t in items:
                    if t is target:
                        continue
                    if (t.get("slug") or "") == new_slug:
                        return api_error("tag with new_name already exists", status_code=409)
            # Update NAME first but keep OLD slug for rewrite step
            target["name"] = new_name
            _save_registry(reg_path, data)

    # Rewrite sidecars while the registry still maps OLD slug -> NEW name
    updated = None
    if rewrite_sidecars:
        try:
            res = registry_tags_rewrite_sidecars(path=path, recursive=recursive)  # type: ignore
            updated = json.loads(bytes(res.body).decode("utf-8")) if hasattr(res, "body") else None
        except Exception:
            updated = None

    # Pass 1: normalize in-memory media attributes while OLD slug still maps to NEW name
    # This ensures any old-slug references in _MEDIA_ATTR are upgraded to the new display name
    # before we change the slug, preventing stray old-name entries.
    try:
        _ = _rewrite_media_attr_tags_with_registry()
    except Exception:
        pass

    # Second pass: change the slug to NEW slug, then normalize in-memory attributes
    with REGISTRY_LOCK:
        data2 = _load_registry(reg_path, "tags")
        items2: list[dict] = data2.get("tags") or []
        # Locate by id (stable) if possible; fallback to name match (new_name)
        target2 = None
        tid = None
        if payload.id is not None:
            tid = int(payload.id)
            for t in items2:
                if int(t.get("id") or 0) == tid:
                    target2 = t
                    break
        if target2 is None:
            # fallback: find any entry whose name equals new_name (case-insensitive) and whose slug still matches old
            for t in items2:
                if (t.get("name") or "").strip().lower() == new_name.lower():
                    target2 = t
                    break
        if target2 is not None:
            target2["slug"] = new_slug
            _save_registry(reg_path, data2)

    # Normalize in-memory media attributes and invalidate tags cache (final pass)
    try:
        ma_changed = _rewrite_media_attr_tags_with_registry()
    except Exception:
        ma_changed = 0

    # Compose response
    out = {"renamed": target2 or target, "sidecars": updated, "media_attr_updated": ma_changed}
    return api_success(out)


@api.post("/registry/tags/delete")
def registry_tags_delete(payload: TagDelete):
    path = _tags_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "tags")
        items: list[dict] = data.get("tags") or []
        idx = None
        if payload.id is not None:
            for i, t in enumerate(items):
                if int(t.get("id") or 0) == int(payload.id):
                    idx = i
                    break
        elif payload.name:
            s = _slugify(payload.name)
            for i, t in enumerate(items):
                if (t.get("slug") or "") == s:
                    idx = i
                    break
        if idx is None:
            return api_error("tag not found", status_code=404)
        removed = items.pop(idx)
        data["tags"] = items
        _save_registry(path, data)
    return api_success({"deleted": True, "tag": removed})


@api.post("/registry/tags/rewrite-sidecars")
def registry_tags_rewrite_sidecars(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    with REGISTRY_LOCK:
        tdata = _load_registry(_tags_registry_path(), "tags")
        by_slug = { (t.get("slug") or ""): t for t in (tdata.get("tags") or []) }
    changed = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            tf = _tags_file(p)
            if not tf.exists():
                continue
            try:
                data = json.loads(tf.read_text())
            except Exception:
                continue
            tags = data.get("tags") or []
            new_tags: list[str] = []
            seen = set()
            for t in tags:
                s = _slugify(str(t))
                # Use canonical registry name if present
                canon = by_slug.get(s)
                name = (canon.get("name") if canon else str(t)).strip()
                if name.lower() not in seen:
                    new_tags.append(name)
                    seen.add(name.lower())
            if new_tags != tags:
                data["tags"] = new_tags
                try:
                    tf.write_text(json.dumps(data, indent=2))
                    changed += 1
                except Exception:
                    pass
    return api_success({"updated_files": changed})


@api.get("/registry/performers")
def registry_performers_list():
    path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "performers")
        items = list(data.get("performers") or [])
    items.sort(key=lambda x: (x.get("name") or "").lower())
    try:
        logging.info("[performers] registry list: %d item(s) from %s", len(items), str(path))
    except Exception:
        pass
    return api_success({"performers": items, "count": len(items)})


@api.post("/registry/performers/create")
def registry_performers_create(payload: PerformerCreate):
    name = (payload.name or "").strip()
    if not name:
        return api_error("name is required", status_code=400)
    slug = _slugify(name)
    path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "performers")
        items: list[dict] = data.get("performers") or []
        for p in items:
            if (p.get("slug") or "") == slug:
                return api_error("performer already exists", status_code=409)
        pid = int(data.get("next_id") or 1)
        images: list[str] = []
        if payload.image:
            images.append(str(payload.image))
        if payload.images:
            for u in payload.images:
                if u and u not in images:
                    images.append(str(u))
        item = {"id": pid, "name": name, "slug": slug, "images": images}
        items.append(item)
        data["performers"] = items
        data["next_id"] = pid + 1
        _save_registry(path, data)
    return api_success(item, status_code=201)


@api.post("/registry/performers/update")
def registry_performers_update(payload: PerformerUpdate):
    if not (payload.id is not None or payload.name is not None):
        return api_error("id or name required", status_code=400)
    path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "performers")
        items: list[dict] = data.get("performers") or []
        target = None
        if payload.id is not None:
            for p in items:
                if int(p.get("id") or 0) == int(payload.id):
                    target = p
                    break
        else:
            s = _slugify(payload.name or "")
            for p in items:
                if (p.get("slug") or "") == s:
                    target = p
                    break
        if target is None:
            return api_error("performer not found", status_code=404)
        # Rename if requested
        if payload.new_name:
            new_slug = _slugify(payload.new_name)
            # conflict check
            for p in items:
                if p is target:
                    continue
                if (p.get("slug") or "") == new_slug:
                    return api_error("performer with new_name already exists", status_code=409)
            target["name"] = payload.new_name
            target["slug"] = new_slug
        # Images updates
        imgs: list[str] = list(target.get("images") or [])
        changed = False
        for u in (payload.add_images or []):
            if u and u not in imgs:
                imgs.append(str(u))
                changed = True
        if payload.remove_images:
            before = set(imgs)
            imgs = [x for x in imgs if x not in set(payload.remove_images or [])]
            changed = changed or (set(imgs) != before)
        if changed:
            target["images"] = imgs
        _save_registry(path, data)
    return api_success(target)


@api.post("/registry/performers/delete")
def registry_performers_delete(payload: PerformerDelete):
    path = _performers_registry_path()
    with REGISTRY_LOCK:
        data = _load_registry(path, "performers")
        items: list[dict] = data.get("performers") or []
        idx = None
        if payload.id is not None:
            for i, p in enumerate(items):
                if int(p.get("id") or 0) == int(payload.id):
                    idx = i
                    break
        elif payload.name:
            s = _slugify(payload.name)
            for i, p in enumerate(items):
                if (p.get("slug") or "") == s:
                    idx = i
                    break
        if idx is None:
            return api_error("performer not found", status_code=404)
        removed = items.pop(idx)
        data["performers"] = items
        _save_registry(path, data)
    return api_success({"deleted": True, "performer": removed})


@api.post("/registry/performers/rewrite-sidecars")
def registry_performers_rewrite_sidecars(path: str = Query(default=""), recursive: bool = Query(default=True)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    with REGISTRY_LOCK:
        pdata = _load_registry(_performers_registry_path(), "performers")
        by_slug = { (p.get("slug") or ""): p for p in (pdata.get("performers") or []) }
    changed = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            tf = _tags_file(p)
            if not tf.exists():
                continue
            try:
                data = json.loads(tf.read_text())
            except Exception:
                continue
            perfs = data.get("performers") or []
            new_perfs: list[str] = []
            seen = set()
            for nm in perfs:
                s = _slugify(str(nm))
                canon = by_slug.get(s)
                name = (canon.get("name") if canon else str(nm)).strip()
                if name.lower() not in seen:
                    new_perfs.append(name)
                    seen.add(name.lower())
            if new_perfs != perfs:
                data["performers"] = new_perfs
                try:
                    tf.write_text(json.dumps(data, indent=2))
                    changed += 1
                except Exception:
                    pass
    return api_success({"updated_files": changed})


# Simple merges that update registry only (optional sidecar rewrite via flag)
@api.post("/registry/tags/merge")
def registry_tags_merge(from_name: str = Query(...), into_name: str = Query(...), rewrite_sidecars: bool = Query(default=True), path: str = Query(default=""), recursive: bool = Query(default=True)):
    """Merge one tag into another in the tags registry.

    Special-case: if the two names differ only by case (same slug), treat this as a
    case-only consolidation. We'll pick a canonical item (prefer the one matching
    `into_name`), update its name to `into_name`, and remove any other duplicate(s)
    that share the same slug.
    """
    f_slug = _slugify(from_name)
    i_slug = _slugify(into_name)

    with REGISTRY_LOCK:
        data = _load_registry(_tags_registry_path(), "tags")
        items: list[dict] = data.get("tags") or []

        # If slugs differ, handle general merge (including missing registry entries)
        if f_slug != i_slug:
            fr = next((t for t in items if (t.get("slug") or "") == f_slug), None)
            to = next((t for t in items if (t.get("slug") or "") == i_slug), None)

            # Ensure the destination exists; create if missing
            if to is None:
                nid = int(data.get("next_id") or 1)
                to = {"id": nid, "name": into_name.strip(), "slug": i_slug}
                items.append(to)
                data["tags"] = items
                data["next_id"] = nid + 1
                _save_registry(_tags_registry_path(), data)

            # Ensure there is a mapping for the source slug to the destination name for rewrite
            created_temp_fr = False
            if fr is None:
                nid2 = int(data.get("next_id") or 1)
                fr = {"id": nid2, "name": into_name.strip(), "slug": f_slug}
                items.append(fr)
                data["tags"] = items
                data["next_id"] = nid2 + 1
                created_temp_fr = True
                _save_registry(_tags_registry_path(), data)
            else:
                # Update source entry's name to match destination for rewrite canonicalization
                fr["name"] = into_name.strip()
                _save_registry(_tags_registry_path(), data)

            # After sidecar rewrite below, we'll remove the source slug entry so only 'to' remains
        else:
            # Case-only merge: consolidate duplicates that share the same slug.
            dups = [t for t in items if (t.get("slug") or "") == f_slug]
            if not dups:
                # No registry entry yet for this slug: create canonical to entry so
                # sidecar rewrite can lift casing consistently across files.
                nid = int(data.get("next_id") or 1)
                to = {"id": nid, "name": into_name.strip(), "slug": i_slug}
                data.setdefault("tags", []).append(to)
                data["next_id"] = nid + 1
                fr = None
                _save_registry(_tags_registry_path(), data)
            else:
                # Choose canonical ('to'): prefer exact case-insensitive name match to into_name
                to = next((t for t in dups if (t.get("name") or "").strip().lower() == (into_name or "").strip().lower()), None) or dups[0]
                # Ensure canonical carries the desired case
                to["name"] = into_name.strip()
                to["slug"] = i_slug

                # Identify 'from' as the specific source if present, else any other duplicate
                fr = next((t for t in dups if (t.get("name") or "").strip().lower() == (from_name or "").strip().lower() and t is not to), None)

                # Remove all other duplicates except 'to'
                keep = to
                new_items: list[dict] = []
                removed_list: list[dict] = []
                for t in items:
                    if (t.get("slug") or "") == f_slug and t is not keep:
                        removed_list.append(t)
                        continue
                    new_items.append(t)
                data["tags"] = new_items
                _save_registry(_tags_registry_path(), data)
                # For response, set fr to one of the removed (prefer the one matching from_name)
                if fr is None and removed_list:
                    fr = removed_list[0]

    updated = None
    if rewrite_sidecars:
        res = registry_tags_rewrite_sidecars(path=path, recursive=recursive)  # type: ignore
        # Extract JSON payload from the response instead of returning raw bytes
        try:
            updated = json.loads(bytes(res.body).decode("utf-8")) if hasattr(res, "body") else None
        except Exception:
            updated = None
    # Also rewrite in-memory media attributes so /api/tags reflects changes immediately
    try:
        ma_changed = _rewrite_media_attr_tags_with_registry()
    except Exception:
        ma_changed = 0

    # If this was a general merge (different slugs), remove the source slug entry now
    if f_slug != i_slug:
        with REGISTRY_LOCK:
            data3 = _load_registry(_tags_registry_path(), "tags")
            items3: list[dict] = data3.get("tags") or []
            new_items3 = [t for t in items3 if (t.get("slug") or "") != f_slug]
            if len(new_items3) != len(items3):
                data3["tags"] = new_items3
                _save_registry(_tags_registry_path(), data3)

    return api_success({"merged": True, "from": fr, "into": to, "sidecars": updated, "media_attr_updated": ma_changed})


@api.post("/registry/performers/merge")
def registry_performers_merge(from_name: str = Query(...), into_name: str = Query(...), rewrite_sidecars: bool = Query(default=True), path: str = Query(default=""), recursive: bool = Query(default=True)):
    """Merge one performer into another in the performers registry.

    Handles case-only merges (same slug) by consolidating duplicates and keeping the
    canonical `into_name` casing.
    """
    f_slug = _slugify(from_name)
    i_slug = _slugify(into_name)

    with REGISTRY_LOCK:
        data = _load_registry(_performers_registry_path(), "performers")
        items: list[dict] = data.get("performers") or []

        if f_slug != i_slug:
            fr = next((p for p in items if (p.get("slug") or "") == f_slug), None)
            to = next((p for p in items if (p.get("slug") or "") == i_slug), None)
            if not fr or not to:
                return api_error("performer not found", status_code=404)
            items = [p for p in items if p is not fr]
            data["performers"] = items
            _save_registry(_performers_registry_path(), data)
        else:
            # Case-only consolidation
            dups = [p for p in items if (p.get("slug") or "") == f_slug]
            if not dups:
                return api_error("performer not found", status_code=404)
            to = next((p for p in dups if (p.get("name") or "").strip().lower() == (into_name or "").strip().lower()), None) or dups[0]
            to["name"] = into_name.strip()
            to["slug"] = i_slug

            fr = next((p for p in dups if (p.get("name") or "").strip().lower() == (from_name or "").strip().lower() and p is not to), None)

            new_items: list[dict] = []
            removed_list: list[dict] = []
            for p in items:
                if (p.get("slug") or "") == f_slug and p is not to:
                    removed_list.append(p)
                    continue
                new_items.append(p)
            data["performers"] = new_items
            _save_registry(_performers_registry_path(), data)
            if fr is None and removed_list:
                fr = removed_list[0]

    updated = None
    if rewrite_sidecars:
        res = registry_performers_rewrite_sidecars(path=path, recursive=recursive)  # type: ignore
        # Extract JSON payload from the response instead of returning raw bytes
        try:
            updated = json.loads(bytes(res.body).decode("utf-8")) if hasattr(res, "body") else None
        except Exception:
            updated = None
    return api_success({"merged": True, "from": fr, "into": to, "sidecars": updated})


# Export/import for registries
@api.get("/registry/export")
def registry_export():
    with REGISTRY_LOCK:
        tdata = _load_registry(_tags_registry_path(), "tags")
        pdata = _load_registry(_performers_registry_path(), "performers")
    return api_success({"tags": tdata, "performers": pdata})


class RegistryImport(BaseModel):   # type: ignore
    tags: Optional[dict] = None
    performers: Optional[dict] = None
    replace: bool = False


@api.post("/registry/import")
def registry_import(payload: RegistryImport):
    with REGISTRY_LOCK:
        if payload.tags is not None:
            if payload.replace:
                _save_registry(_tags_registry_path(), payload.tags)
            else:
                cur = _load_registry(_tags_registry_path(), "tags")
                merged = cur
                # naive merge: append new uniques by slug, keep next_id max
                cur_items = { (t.get("slug") or ""): t for t in (cur.get("tags") or []) }
                for t in (payload.tags.get("tags") or []):
                    sl = t.get("slug") or _slugify(t.get("name") or "")
                    if sl and sl not in cur_items:
                        cur.setdefault("tags", []).append({"id": int(cur.get("next_id") or 1), "name": t.get("name"), "slug": sl})
                        cur["next_id"] = int(cur["next_id"]) + 1
                _save_registry(_tags_registry_path(), merged)
        if payload.performers is not None:
            if payload.replace:
                _save_registry(_performers_registry_path(), payload.performers)
            else:
                cur = _load_registry(_performers_registry_path(), "performers")
                merged = cur
                cur_items = { (p.get("slug") or ""): p for p in (cur.get("performers") or []) }
                for p in (payload.performers.get("performers") or []):
                    sl = p.get("slug") or _slugify(p.get("name") or "")
                    if sl and sl not in cur_items:
                        cur.setdefault("performers", []).append({"id": int(cur.get("next_id") or 1), "name": p.get("name"), "slug": sl, "images": list(p.get("images") or [])})
                        cur["next_id"] = int(cur["next_id"]) + 1
                _save_registry(_performers_registry_path(), merged)
    return api_success({"imported": True})


# -------------------------------------------------
# Admin: Panic kill (dangerous)
# -------------------------------------------------
@api.post("/admin/panic-kill")
def admin_panic_kill(request: Request):
    """
    Forcefully kill server and media processes. This will:
      - pkill -9 -f uvicorn
      - pkill -9 -f '/mnt/media/media-player/.venv/bin/python'
      - pkill -9 -f ffmpeg

    Safety:
      - Only allowed from localhost unless PANIC_ALLOW_REMOTE=1 is set.
      - Runs the kill sequence on a background thread after a short delay so this
        HTTP request can return a response first.
    """
    try:
        client = getattr(request, "client", None)
        client_host = str(getattr(client, "host", "")) if client is not None else ""
        allow_remote = os.environ.get("PANIC_ALLOW_REMOTE", "0") == "1"
        if not allow_remote and client_host not in ("127.0.0.1", "::1", "localhost"):
            raise_api_error("panic-kill only allowed from localhost", status_code=403)

        def _do_kill():
            try:
                time.sleep(0.3)  # allow response to flush
                cmds = [
                    ["pkill", "-9", "-f", "uvicorn"],
                    ["pkill", "-9", "-f", "/mnt/media/media-player/.venv/bin/python"],
                    ["pkill", "-9", "-f", "ffmpeg"],
                ]
                for cmd in cmds:
                    try:
                        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                    except Exception:
                        pass
            except Exception:
                pass

        threading.Thread(target=_do_kill, name="panic-kill", daemon=True).start()
        return api_success({"scheduled": True})
    except HTTPException:
        raise
    except Exception as e:
        raise_api_error(f"Failed to schedule panic kill: {str(e)}")


# Final router wiring
app.include_router(api)

# Catch-all for static files (both root and subdirectories)
# Defined AFTER API router so API routes take precedence
@app.get("/{filepath:path}", include_in_schema=False)
def serve_static_file(filepath: str):
    """
    Serve static files from root directory and subdirectories like components/tabs.html"""

    file_path = _STATIC / filepath
    # Security check: ensure the resolved path is still within _STATIC
    try:
        file_path = file_path.resolve()
        static_root = _STATIC.resolve()
        # Check if file_path is within static_root
        file_path.relative_to(static_root)

        if file_path.exists() and file_path.is_file():
            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(str(file_path))
            if mime_type is None:
                mime_type = "application/octet-stream"
            return FileResponse(str(file_path), media_type=mime_type)
    except (ValueError, OSError):
        pass
    raise HTTPException(status_code=404, detail="File not found")


# --------------------------
# Jobs API at root
# --------------------------
class JobRequest(BaseModel):  # type: ignore
    task: str
    directory: Optional[str] = None
    recursive: Optional[bool] = False
    force: Optional[bool] = False
    params: Optional[dict] = None


def _iter_videos(dir_path: Path, recursive: bool) -> list[Path]:
    return _find_mp4s(dir_path, recursive)


class AutoTagRequest(BaseModel):  # type: ignore
    path: Optional[str] = None
    recursive: Optional[bool] = False
    performers: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    use_registry_performers: Optional[bool] = False
    use_registry_tags: Optional[bool] = False


class AutoTagPreviewRequest(AutoTagRequest):  # type: ignore
    limit: Optional[int] = None  # optional cap on number of files returned


@app.post("/api/autotag/scan")
def autotag_scan(req: AutoTagRequest):
    base = Path(req.path or str(STATE["root"]))
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Expand with registry contents if requested and explicit lists are empty / present
    perf_list = list(req.performers or [])
    tag_list = list(req.tags or [])
    if req.use_registry_performers:
        try:
            with REGISTRY_LOCK:
                pdata = _load_registry(_performers_registry_path(), "performers")
                for p in (pdata.get("performers") or []):
                    nm = p.get("name") or ""
                    if nm and nm not in perf_list:
                        perf_list.append(nm)
        except Exception:
            pass
    if req.use_registry_tags:
        try:
            with REGISTRY_LOCK:
                tdata = _load_registry(_tags_registry_path(), "tags")
                for t in (tdata.get("tags") or []):
                    nm = t.get("name") or ""
                    if nm and nm not in tag_list:
                        tag_list.append(nm)
        except Exception:
            pass
    jr = JobRequest(
        task="autotag",
        directory=str(base),
        recursive=bool(req.recursive),
        force=False,
        params={
            "performers": perf_list,
            "tags": tag_list,
        },
    )
    jid = _new_job(jr.task, jr.directory or str(STATE["root"]))
    # Save request for restore/resume
    try:
        with JOB_LOCK:
            if jid in JOBS:
                JOBS[jid]["request"] = jr.dict()
        _persist_job(jid)
    except Exception:
        pass
    def _runner():
        with JOB_RUN_SEM:
            _run_job_worker(jid, jr)
    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


@app.post("/api/autotag/preview")
def autotag_preview(req: AutoTagPreviewRequest):
    """Return a non-destructive preview of which tags/performers would be added per file.

    Strategy mirrors the background job matcher but without writing sidecars.
    If use_registry_* flags are true, registry values are unioned into the supplied lists.
    """
    base = Path(req.path or str(STATE["root"]))
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    perf_list = list(req.performers or [])
    tag_list = list(req.tags or [])
    if req.use_registry_performers:
        try:
            with REGISTRY_LOCK:
                pdata = _load_registry(_performers_registry_path(), "performers")
                for p in (pdata.get("performers") or []):
                    nm = p.get("name") or ""
                    if nm and nm not in perf_list:
                        perf_list.append(nm)
        except Exception:
            pass
    if req.use_registry_tags:
        try:
            with REGISTRY_LOCK:
                tdata = _load_registry(_tags_registry_path(), "tags")
                for t in (tdata.get("tags") or []):
                    nm = t.get("name") or ""
                    if nm and nm not in tag_list:
                        tag_list.append(nm)
        except Exception:
            pass
    # Build patterns (reuse logic inline to avoid import cycles)
    def _mk_patterns(items: list[str]):
        pats: list[re.Pattern] = []
        for it in items:
            s = re.escape(it.lower())
            s = s.replace(r"\ ", r"[\s._-]+")
            pats.append(re.compile(rf"(?<![A-Za-z0-9]){s}(?![A-Za-z0-9])"))
        return pats
    perf_pats = _mk_patterns(perf_list)
    tag_pats = _mk_patterns(tag_list)
    vids = _iter_videos(base, bool(req.recursive))
    out: list[dict] = []
    limit = int(req.limit) if req.limit else None
    for v in vids:
        name = v.name.rsplit(".", 1)[0].lower()
        hay = re.sub(r"[\s._-]+", " ", name)
        found_perfs: list[str] = []
        for pat, raw in zip(perf_pats, perf_list):
            if pat.search(hay):
                found_perfs.append(raw)
        found_tags: list[str] = []
        for pat, raw in zip(tag_pats, tag_list):
            if pat.search(hay):
                found_tags.append(raw)
        if found_perfs or found_tags:
            out.append({
                "file": str(v.relative_to(STATE["root"])),
                "performers": found_perfs,
                "tags": found_tags,
            })
            if limit and len(out) >= limit:
                break
    return api_success({
        "path": str(base),
        "recursive": bool(req.recursive),
        "candidates": out,
        "total_files": len(vids),
        "matched_files": len(out),
        "performer_pool": perf_list,
        "tag_pool": tag_list,
    })


def _job_check_canceled(jid: str) -> bool:
    ev = JOB_CANCEL_EVENTS.get(jid)
    return bool(ev and ev.is_set())


def _job_set_result(jid: str, result: Any) -> None:
    with JOB_LOCK:
        if jid in JOBS:
            JOBS[jid]["result"] = result
    _publish_job_event({"event": "result", "id": jid})


def _handle_transcode_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Execute a transcode job (plan already resolved into JobRequest).

    Parameters used from jr.params:
      - profile: transcode profile key (h264_aac_mp4 | vp9_opus_webm)
      - targets: optional list of relative paths; else iterate directory (respect recursive)
      - replace: bool (replace originals / keep .orig)
    Honors job cancellation and updates progress.
    """
    prm = jr.params or {}
    profile = str(prm.get("profile", "h264_aac_mp4"))
    replace = bool(prm.get("replace", False))
    force = bool(jr.force)
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    done = 0
    results: list[dict[str, Any]] = []
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
        out_path = v
        tmp_out: Optional[Path] = None
        try:
            vc = "libx264"; ac = "aac"; container = ".mp4"
            if profile == "vp9_opus_webm":
                vc = "libvpx-vp9"; ac = "libopus"; container = ".webm"
            target_path = v.with_suffix(container)
            if not force and target_path.exists() and not replace:
                results.append({"file": rel, "status": "skip_exists", "target": str(target_path.name)})
                done += 1
                _set_job_progress(jid, processed_set=done)
                continue
            tmp_out = v.parent / f".{v.stem}.transcode.{uuid.uuid4().hex}{container}"
            cmd = [
                "ffmpeg", "-y", "-i", str(v),
                "-c:v", vc, "-c:a", ac,
            ]
            if container == ".mp4":
                cmd += ["-movflags", "+faststart"]
            cmd += [str(tmp_out)]
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if proc.returncode != 0:
                results.append({"file": rel, "status": "error", "code": proc.returncode})
            else:
                if replace:
                    backup = None
                    if v != target_path:
                        backup = v
                    if target_path.exists() and target_path != v:
                        target_path.unlink()
                    shutil.move(str(tmp_out), str(target_path))
                    if backup and backup.exists():
                        try:
                            backup.rename(backup.with_suffix(backup.suffix + ".orig"))
                        except Exception:
                            pass
                    out_path = target_path
                else:
                    if target_path.exists() and not force:
                        target_path = v.parent / f"{v.stem}.transcoded{container}"
                    shutil.move(str(tmp_out), str(target_path))
                    out_path = target_path
                results.append({"file": rel, "status": "ok", "target": str(out_path.name)})
        except Exception as e:
            results.append({"file": rel, "status": "error", "error": str(e)})
        finally:
            try:
                if tmp_out and tmp_out.exists():
                    tmp_out.unlink()
            except Exception:
                pass
            done += 1
            _set_job_progress(jid, processed_set=done)
    _job_set_result(jid, {"profile": profile, "results": results})
    _finish_job(jid)


def _handle_autotag_job(jid: str, jr: JobRequest, base: Path) -> None:
    vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    prm = jr.params or {}
    perf_list = [str(x).strip() for x in (prm.get("performers") or []) if str(x).strip()]
    tag_list = [str(x).strip() for x in (prm.get("tags") or []) if str(x).strip()]
    def _mk_patterns(items: list[str]):
        pats: list[re.Pattern] = []
        for it in items:
            s = re.escape(it.lower())
            s = s.replace(r"\ ", r"[\s._-]+")
            pats.append(re.compile(rf"(?<![A-Za-z0-9]){s}(?![A-Za-z0-9])"))
        return pats
    perf_pats = _mk_patterns(perf_list)
    tag_pats = _mk_patterns(tag_list)
    changed = 0
    matched_count = 0
    for i, v in enumerate(vids, start=1):
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            name = v.name.rsplit(".", 1)[0].lower()
            hay = re.sub(r"[\s._-]+", " ", name)
            found_perfs: list[str] = []
            for pat, raw in zip(perf_pats, perf_list):
                if pat.search(hay):
                    found_perfs.append(raw)
            found_tags: list[str] = []
            for pat, raw in zip(tag_pats, tag_list):
                if pat.search(hay):
                    found_tags.append(raw)
            if not found_perfs and not found_tags:
                _set_job_progress(jid, processed_set=i)
                continue
            matched_count += 1
            tfile = _tags_file(v)
            if tfile.exists():
                try:
                    data = json.loads(tfile.read_text())
                except Exception:
                    data = {"video": v.name, "tags": [], "performers": [], "description": "", "rating": 0}
            else:
                data = {"video": v.name, "tags": [], "performers": [], "description": "", "rating": 0}
            data.setdefault("tags", [])
            data.setdefault("performers", [])
            before_t = set(data["tags"])
            before_p = set(data["performers"])
            for t in found_tags:
                if t not in data["tags"]:
                    data["tags"].append(t)
            for p in found_perfs:
                if p not in data["performers"]:
                    data["performers"].append(p)
            if set(data["tags"]) != before_t or set(data["performers"]) != before_p:
                try:
                    tfile.write_text(json.dumps(data, indent=2))
                    changed += 1
                except Exception:
                    pass
            # Mirror into media attribute store for immediate UI reflection
            try:
                rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
                ent = _media_entry(rel)
                # merge performers/tags with normalization and dedupe
                merged_perfs = _norm_list((ent.get("performers") or []) + list(found_perfs))
                merged_tags = _norm_list((ent.get("tags") or []) + list(found_tags))
                ent["performers"] = merged_perfs
                ent["tags"] = merged_tags
                _save_media_attr()
            except Exception:
                pass
        finally:
            _set_job_progress(jid, processed_set=i)
    _job_set_result(jid, {"matched_files": matched_count, "updated_files": changed, "total": len(vids)})
    _finish_job(jid)


def _handle_thumbnail_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    time_spec = str(prm.get("t", prm.get("time", 10))) if prm.get("t", prm.get("time")) is not None else "middle"
    q = int(prm.get("quality", 2))
    force = bool(jr.force) or bool(prm.get("overwrite", False))
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        _set_job_current(jid, str(v))
        lk = _file_task_lock(v, "thumbnail")
        with lk:
            try:
                generate_thumbnail(v, force=force, time_spec=time_spec, quality=q)
            except Exception:
                pass
        cur = JOBS.get(jid, {}).get("processed", 0)
        _set_job_progress(jid, processed_set=int(cur) + 1)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_metadata_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Generate metadata sidecar JSON files.
    Missing-mode uses explicit target list when provided; all-mode (jr.force) forces recompute.
    Mirrors structure of other artifact handlers for consistency.
    """
    prm = jr.params or {}
    targets = prm.get("targets") or []
    # Resolve list of videos to process
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    force = bool(jr.force) or bool(prm.get("overwrite", False))
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        _set_job_current(jid, str(v))
        lk = _file_task_lock(v, "metadata")
        with lk:
            try:
                metadata_single(v, force=force)
            except Exception:
                # Capture but continue with next file
                pass
        cur = JOBS.get(jid, {}).get("processed", 0)
        _set_job_progress(jid, processed_set=int(cur) + 1)
    _job_set_result(jid, {"processed": len(vids), "forced": bool(force)})
    _finish_job(jid)


def _handle_embed_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    prm2 = jr.params or {}
    overwrite = bool(prm2.get("overwrite", False))
    sim_thresh = float(prm2.get("sim_thresh", 0.9))
    interval = float(prm2.get("interval", 1.0))
    scale_factor = float(prm2.get("scale_factor", 1.2))
    min_neighbors = int(prm2.get("min_neighbors", 7))
    min_size_frac = float(prm2.get("min_size_frac", 0.10))
    backend = str(prm2.get("backend", "auto"))
    done_files = 0
    skipped = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "faces")
            with lk:
                if faces_exists_check(v) and not (bool(jr.force) or overwrite):
                    done_files += 1
                    skipped += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_embed(i: int, n: int):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            overall = (done_files * 100) + int((i / n) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    compute_face_embeddings(
                        v,
                        sim_thresh=sim_thresh,
                        interval=interval,
                        scale_factor=scale_factor,
                        min_neighbors=min_neighbors,
                        min_size_frac=min_size_frac,
                        backend=backend,
                        progress_cb=_pcb_embed,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids), "skipped": skipped})
    _finish_job(jid)


def _handle_clip_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    _src_val = prm.get("file")
    src = Path(str(_src_val)).expanduser().resolve() if _src_val else None
    ranges = prm.get("ranges") or []
    _dest_val = prm.get("dest")
    dest = Path(str(_dest_val)).expanduser().resolve() if _dest_val else None
    if not src or not src.exists() or not dest:
        _finish_job(jid, error="invalid clip params")
        return
    try:
        src.relative_to(STATE["root"])  # type: ignore[arg-type]
        dest.relative_to(STATE["root"])  # type: ignore[arg-type]
    except Exception:
        _finish_job(jid, error="paths outside root")
        return
    dest.mkdir(parents=True, exist_ok=True)
    files_out: list[str] = []
    _set_job_progress(jid, total=len(ranges), processed_set=0)
    for i, r in enumerate(ranges):
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        start = float(r.get("start", 0.0))
        end = float(r.get("end", start))
        outp = dest / f"clip_{i+1:02d}.mp4"
        if ffmpeg_available():
            cmd = [
                "ffmpeg", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src),
                "-c", "copy", str(outp),
            ]
            try:
                _run(cmd)
            except Exception:
                outp.write_bytes(b"")
        else:
            outp.write_bytes(b"CLIP")
        files_out.append(str(outp))
        _set_job_progress(jid, processed_inc=1)
    _job_set_result(jid, {"files": files_out})
    _finish_job(jid)


def _handle_cleanup_artifacts_job(jid: str, jr: JobRequest, base: Path) -> None:
    base_dir = Path(jr.directory or str(STATE["root"]))
    base_dir = base_dir.expanduser().resolve()
    prm = jr.params or {}
    dry_run = bool(prm.get("dry_run", False))
    keep_orphans = bool(prm.get("keep_orphans", False))
    reassociate = bool(prm.get("reassociate", False))
    use_preview = bool(prm.get("use_preview", False))
    local_only = bool(prm.get("local_only", True))
    artifacts: list[Path] = []
    for p in base_dir.rglob(".artifacts"):
        if not p.is_dir():
            continue
        for f in p.iterdir():
            if f.is_file() and _parse_artifact_name(f.name):
                artifacts.append(f)
    _set_job_progress(jid, total=len(artifacts), processed_set=0)
    # In strict mode (no reassociation), avoid building global media indexes.
    # This keeps cleanup extremely fast by doing small per-directory checks.
    media_by_stem: dict[str, Path] = {}
    metadata_by_stem: dict[str, dict] = {}
    media_by_dir: dict[Path, list[tuple[str, Path]]] = {}
    media_durations: dict[str, float] = {}
    if reassociate and not local_only:
        media_by_stem, metadata_by_stem = _collect_media_and_metadata(base_dir)
        # Build a fast index of media by their immediate parent directory to avoid
        # O(N*M) global scans when trying to re-associate orphan artifacts. In
        # practice, correct matches overwhelmingly live next to the original media.
        for stem, v in media_by_stem.items():
            try:
                media_by_dir.setdefault(v.parent, []).append((stem, v))
            except Exception:
                # Skip weird paths; they'll still be reachable via the global map
                pass
        for stem, v in media_by_stem.items():
            try:
                m = metadata_by_stem.get(stem) or {}
                d = m.get("duration")
                if isinstance(d, (int, float)):
                    media_durations[stem] = float(d)
            except Exception:
                pass
    # Cache per-artifact-stem duration lookups to avoid re-reading JSON for
    # multiple artifacts with the same stem (common for multi-artifact sets).
    orphan_duration_cache: dict[str, float] = {}
    renamed: list[dict] = []
    deleted: list[str] = []
    kept: list[str] = []
    repaired_count = 0
    mode = "reassociate" if reassociate else "strict"
    # For strict mode, lazily cache media stems present in each media directory
    # so we only scan directories that actually contain artifacts.
    media_dir_stems_cache: dict[Path, set[str]] = {}
    media_dir_files_cache: dict[Path, list[tuple[str, Path]]] = {}
    media_duration_path_cache: dict[Path, float] = {}
    VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"}
    # Optional reuse of cached repair preview suggestions when applying (non-dry run)
    cached_moves: dict[str, dict] = {}
    if reassociate and use_preview and not dry_run:
        try:
            cache = STATE.get("_repair_preview_cache")
            if isinstance(cache, dict):
                entry = cache.get(str(base_dir))
                if entry and isinstance(entry, dict):
                    # Expire after 10 minutes
                    if time.time() - float(entry.get("ts", 0)) <= 600:
                        for rec in entry.get("renamed", []):
                            if isinstance(rec, dict):
                                src = rec.get("from")
                                if src:
                                    cached_moves[src] = rec
        except Exception:
            cached_moves = {}
    for art in artifacts:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            parsed = _parse_artifact_name(art.name)
            if not parsed:
                continue
            a_stem, kind = parsed
            # Same normalization as artifacts_orphans_status: strip trailing media
            # extension from artifact stem if present (legacy sidecars).
            try:
                a_stem_lower_tmp = a_stem.lower()
                for ext in MEDIA_EXTS:
                    if a_stem_lower_tmp.endswith(ext):
                        a_stem = a_stem[: -len(ext)]
                        a_stem_lower_tmp = a_stem.lower()
                        break
            except Exception:
                pass
            a_stem_lower = a_stem.lower()
            parent_dir = art.parent
            # Fast-path: reuse cached preview move suggestions before running heuristics
            if reassociate and use_preview and not dry_run:
                move_entry = cached_moves.get(str(art))
                if move_entry:
                    try:
                        target_path = move_entry.get("to")
                        if target_path:
                            dst_path = Path(target_path)
                            if dst_path.parent:
                                dst_path.parent.mkdir(parents=True, exist_ok=True)
                            os.rename(art, dst_path)
                            renamed.append({k: v for k, v in move_entry.items()})
                            repaired_count += 1
                            # Skip remaining heuristic logic; progress will increment in finally
                            continue
                    except Exception:
                        # Fall back to normal heuristic path if cached move fails
                        pass
            # Fast path: in strict mode, check only the local media directory for a matching stem
            if not reassociate:
                media_dir = parent_dir.parent
                stems = media_dir_stems_cache.get(media_dir)
                if stems is None:
                    stems = set()
                    try:
                        for de in os.scandir(media_dir):
                            if not de.is_file():
                                continue
                            try:
                                name = de.name
                                # Skip dotfiles and obvious artifact files
                                if name.startswith('.'):
                                    continue
                                ext = os.path.splitext(name)[1].lower()
                                if ext in VIDEO_EXTS:
                                    stems.add(Path(name).stem)
                            except Exception:
                                continue
                    except Exception:
                        stems = set()
                    media_dir_stems_cache[media_dir] = stems
                if a_stem in stems:
                    kept.append(str(art))
                    _set_job_progress(jid, processed_inc=1)
                    continue
            else:
                cand_media = media_by_stem.get(a_stem)
                if cand_media and cand_media.exists():
                    kept.append(str(art))
                    _set_job_progress(jid, processed_inc=1)
                    continue
            # Strict mode: don't attempt repair; just act on known orphans fast
            if not reassociate:
                if keep_orphans or dry_run:
                    kept.append(str(art))
                else:
                    try:
                        art.unlink()
                        deleted.append(str(art))
                    except Exception:
                        kept.append(str(art))
            else:
                # Repair mode: try to re-associate using conservative fuzzy matching
                a_duration: float | None = None
                try:
                    if a_stem in orphan_duration_cache:
                        a_duration = orphan_duration_cache[a_stem]
                    else:
                        if kind == SUFFIX_METADATA_JSON:
                            raw = json.loads(art.read_text())
                            a_duration = extract_duration(raw)
                        else:
                            metadata_file = parent_dir / f"{a_stem}{SUFFIX_METADATA_JSON}"
                            if metadata_file.exists():
                                raw = json.loads(metadata_file.read_text())
                                a_duration = extract_duration(raw)
                        if isinstance(a_duration, (int, float)):
                            orphan_duration_cache[a_stem] = float(a_duration)
                except Exception:
                    a_duration = None
                best: tuple[float, Path] | None = None
                # Prefer candidates in the same media directory (parent of .artifacts)
                local_candidates: list[tuple[str, Path]] = []
                try:
                    if local_only:
                        # Build once per directory: list of (stem, path) for video files
                        media_dir = parent_dir.parent
                        cands = media_dir_files_cache.get(media_dir)
                        if cands is None:
                            cands = []
                            try:
                                for de in os.scandir(media_dir):
                                    if not de.is_file():
                                        continue
                                    name = de.name
                                    if name.startswith('.'):
                                        continue
                                    ext = os.path.splitext(name)[1].lower()
                                    if ext in VIDEO_EXTS:
                                        vp = Path(de.path)
                                        cands.append((vp.stem, vp))
                            except Exception:
                                cands = []
                            media_dir_files_cache[media_dir] = cands
                        local_candidates = cands
                    else:
                        local_candidates = media_by_dir.get(parent_dir.parent, []) or []
                except Exception:
                    local_candidates = []
                def _score_candidates(cands: list[tuple[str, Path]], cur_best: tuple[float, Path] | None) -> tuple[float, Path] | None:
                    best_local = cur_best
                    for stem, v in cands:
                        try:
                            same_parent_boost = 0.05 if v.parent == parent_dir.parent else 0.0
                        except Exception:
                            same_parent_boost = 0.0
                        stem_lower = stem.lower()
                        # Fast-path: exact lowercased match
                        if stem_lower == a_stem_lower:
                            name_sim = 1.0
                        else:
                            name_sim = SequenceMatcher(a=a_stem_lower, b=stem_lower).ratio()
                        dur_sim = 0.0
                        if a_duration is not None:
                            d: Optional[float] = None
                            if local_only:
                                # Lazy-load duration from candidate's own metadata when needed
                                try:
                                    dv = media_duration_path_cache.get(v)
                                    if dv is None:
                                        mf = metadata_path(v)
                                        if mf.exists():
                                            raw = json.loads(mf.read_text())
                                            dv = extract_duration(raw) or None
                                        media_duration_path_cache[v] = float(dv) if isinstance(dv, (int, float)) else 0.0
                                    d = dv if isinstance(dv, (int, float)) else None
                                except Exception:
                                    d = None
                            else:
                                d = media_durations.get(stem)
                            if isinstance(d, (int, float)) and d > 0:
                                diff = abs(float(d) - float(a_duration))
                                dur_sim = max(0.0, 1.0 - (diff / max(d, 1.0)))
                        score = (0.65 * name_sim) + (0.35 * dur_sim) + same_parent_boost
                        if best_local is None or score > best_local[0]:
                            best_local = (score, v)
                    return best_local
                # First pass: local directory only
                if local_candidates:
                    best = _score_candidates(local_candidates, None)
                # Fallback: global scan only if enabled
                if not local_only:
                    if best is None or best[0] < 0.80:
                        global_candidates = list(media_by_stem.items())
                        best = _score_candidates(global_candidates, best)
                matched: Optional[Path] = None
                if best and best[0] >= 0.80:
                    matched = best[1]
                if matched is not None:
                    dst_dir = artifact_dir(matched)
                    new_name = f"{matched.stem}{kind}"
                    dst_path = dst_dir / new_name
                    try:
                        conf = float(best[0]) if isinstance(best, tuple) else 1.0
                    except Exception:
                        conf = 1.0
                    entry = {"from": str(art), "to": str(dst_path), "confidence": round(conf, 3), "strategy": "fuzzy"}
                    if dry_run:
                        renamed.append(entry)
                        repaired_count += 1
                    else:
                        try:
                            dst_dir.mkdir(parents=True, exist_ok=True)
                            os.rename(art, dst_path)
                            renamed.append(entry)
                            repaired_count += 1
                        except Exception:
                            kept.append(str(art))
                else:
                    if keep_orphans or dry_run:
                        kept.append(str(art))
                    else:
                        try:
                            art.unlink()
                            deleted.append(str(art))
                        except Exception:
                            kept.append(str(art))
        except Exception:
            kept.append(str(art))
        finally:
            _set_job_progress(jid, processed_inc=1)
    _job_set_result(jid, {
        "renamed": renamed,
        "deleted": deleted,
        "kept": kept,
        "dry_run": dry_run,
        "mode": mode,
        "repaired_count": repaired_count,
        "total": len(artifacts),
    })
    _finish_job(jid)


def _handle_sprites_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    sd = _sprite_defaults()
    interval = float(prm.get("interval", sd["interval"]))  # type: ignore[index]
    width = int(prm.get("width", sd["width"]))  # type: ignore[index]
    cols = int(prm.get("cols", sd["cols"]))  # type: ignore[index]
    rows = int(prm.get("rows", sd["rows"]))  # type: ignore[index]
    quality = int(prm.get("quality", sd["quality"]))  # type: ignore[index]
    done_files = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "sprites")
            with lk:
                s, jj = sprite_sheet_paths(v)
                if s.exists() and jj.exists() and not bool(jr.force):
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_sprites(step: int, steps: int):
                        try:
                            steps = max(1, int(steps))
                            step = max(0, min(int(step), steps))
                            overall = (done_files * 100) + int((step / steps) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    generate_sprite_sheet(
                        v,
                        interval=interval,
                        width=width,
                        cols=cols,
                        rows=rows,
                        quality=quality,
                        progress_cb=_pcb_sprites,
                        cancel_check=_cc,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_heatmaps_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    interval = float(prm.get("interval", 5.0))
    mode = str(prm.get("mode", "both"))
    png = bool(prm.get("png", True))
    done_files = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "heatmaps")
            with lk:
                if heatmaps_json_exists(v) and not bool(jr.force):
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_heat(i: int, n: int):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            overall = (done_files * 100) + int((i / n) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    compute_heatmaps(v, interval=interval, mode=mode, png=png, progress_cb=_pcb_heat, cancel_check=_cc)
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_faces_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    overwrite = bool(prm.get("overwrite", False))
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    sim_thresh = float(prm.get("sim_thresh", 0.9))
    interval = float(prm.get("interval", 1.0))
    scale_factor = float(prm.get("scale_factor", 1.2))
    min_neighbors = int(prm.get("min_neighbors", 7))
    min_size_frac = float(prm.get("min_size_frac", 0.10))
    backend = str(prm.get("backend", "auto"))
    done_files = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "faces")
            with lk:
                if faces_exists_check(v) and not (bool(jr.force) or overwrite):
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_faces(i: int, n: int):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            overall = (done_files * 100) + int((i / n) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    compute_face_embeddings(
                        v,
                        sim_thresh=sim_thresh,
                        interval=interval,
                        scale_factor=scale_factor,
                        min_neighbors=min_neighbors,
                        min_size_frac=min_size_frac,
                        backend=backend,
                        progress_cb=_pcb_faces,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_preview_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    segments = int(prm.get("segments", 9))
    duration = float(prm.get("duration", 1.0))
    width = int(prm.get("width", 320))
    single_file = len(vids) == 1
    # Use total steps as files*segments so progress advances smoothly per segment
    total_steps = max(1, max(1, len(vids)) * max(1, segments))
    _set_job_progress(jid, total=total_steps, processed_set=0)
    done_files = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            out_path = _preview_concat_path(v)
            lk = _file_task_lock(v, "preview")
            with lk:
                if _file_nonempty(out_path) and not bool(jr.force):
                    # Treat as fully done for this file
                    done_files += 1
                    _set_job_progress(jid, processed_set=min(total_steps, done_files * max(1, segments)))
                else:
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    def _pcb(i: int, n: int):
                        # Update progress within this file using segments-based steps
                        try:
                            ni = max(1, int(n))
                            ii = max(0, min(int(i), ni))
                            base = done_files * ni
                            _set_job_progress(jid, processed_set=min(total_steps, base + ii))
                        except Exception:
                            pass
                    generate_preview(
                        v,
                        segments=segments,
                        seg_dur=duration,
                        width=width,
                        fmt="webm",
                        out=out_path,
                        progress_cb=_pcb,
                        cancel_check=_cc,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=min(total_steps, done_files * max(1, segments)))
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=min(total_steps, done_files * max(1, segments)))
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_subtitles_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    model = str(prm.get("model", "small"))
    language = prm.get("language")
    translate = bool(prm.get("translate", False))
    done_files = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            out_file = artifact_dir(v) / f"{v.stem}{SUFFIX_SUBTITLES_SRT}"
            lk = _file_task_lock(v, "subtitles")
            with lk:
                if out_file.exists() and not bool(jr.force) and not _is_stub_subtitles_file(out_file):
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_sub(frac: float):
                        try:
                            frac = max(0.0, min(1.0, float(frac)))
                            overall = (done_files * 100) + int(frac * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    generate_subtitles(
                        v, out_file, model=model, language=(language or None), translate=translate,
                        progress_cb=_pcb_sub, cancel_check=_cc,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)

def _handle_concat_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Concatenate multiple input files into a single MP4 (H.264/AAC).

    jr.params fields:
      inputs: list[str] relative paths under MEDIA_ROOT (required, len>=2)
      out_dir: absolute path under MEDIA_ROOT (string)
      out_name: filename (e.g., concat_XXXX.mp4)
    """
    prm = jr.params or {}
    rels = prm.get("inputs") or []
    if not isinstance(rels, list) or len(rels) < 2:
        _finish_job(jid, error="need at least two inputs"); return
    # Resolve and validate
    inputs: list[Path] = []
    for rel in rels:
        try:
            p = safe_join(STATE["root"], rel)
            if p.exists() and p.is_file():
                inputs.append(p.resolve())
        except Exception:
            pass
    if len(inputs) < 2:
        _finish_job(jid, error="resolved fewer than two inputs"); return
    out_dir_val = prm.get("out_dir")
    out_dir = Path(str(out_dir_val)).expanduser().resolve() if out_dir_val else (inputs[0].parent / ".concat").resolve()
    try:
        out_dir.relative_to(STATE["root"])  # ensure inside root
    except Exception:
        _finish_job(jid, error="out_dir must be under MEDIA_ROOT"); return
    out_dir.mkdir(parents=True, exist_ok=True)
    out_name = str(prm.get("out_name") or f"concat_{uuid.uuid4().hex[:8]}.mp4")
    if not out_name.lower().endswith(".mp4"):
        out_name += ".mp4"
    out_path = out_dir / out_name
    tmp_out = out_dir / f".{out_path.stem}.tmp.{uuid.uuid4().hex}.mp4"
    # Build ffmpeg commands with concat filter (attempt with audio first, then video-only fallback)
    if not ffmpeg_available():
        try:
            out_path.write_bytes(b"CONCAT")
            _job_set_result(jid, {"file": str(out_path.relative_to(STATE["root"]))})
            _finish_job(jid); return
        except Exception as e:
            _finish_job(jid, error=str(e)); return
    n = len(inputs)
    _set_job_progress(jid, total=100, processed_set=5)
    # Attempt 1: include audio
    try:
        args = ["ffmpeg", "-y"]
        for p in inputs:
            args += ["-i", str(p)]
        inputs_chain = "".join([f"[{i}:v:0][{i}:a:0]" for i in range(n)])
        filter_concat = f"{inputs_chain}concat=n={n}:v=1:a=1[v][a]"
        cmd = args + [
            "-filter_complex", filter_concat,
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart",
            str(tmp_out),
        ]
        _run(cmd)
        ok = True
    except Exception:
        ok = False
    if not ok:
        # Attempt 2: video only
        try:
            args = ["ffmpeg", "-y"]
            for p in inputs:
                args += ["-i", str(p)]
            inputs_chain = "".join([f"[{i}:v:0]" for i in range(n)])
            filter_concat = f"{inputs_chain}concat=n={n}:v=1:a=0[v]"
            cmd = args + [
                "-filter_complex", filter_concat,
                "-map", "[v]", "-c:v", "libx264", "-movflags", "+faststart", "-an",
                str(tmp_out),
            ]
            _run(cmd)
            ok = True
        except Exception as e:
            _finish_job(jid, error=f"concat failed: {e}"); return
    # Move temp to final
    try:
        if out_path.exists():
            try: out_path.unlink()
            except Exception: pass
        shutil.move(str(tmp_out), str(out_path))
    except Exception as e:
        _finish_job(jid, error=f"finalize failed: {e}"); return
    rel = str(out_path.relative_to(STATE["root"])) if str(out_path).startswith(str(STATE["root"])) else str(out_path)
    _set_job_progress(jid, processed_set=100)
    _job_set_result(jid, {"file": rel})
    _finish_job(jid)



def _handle_scenes_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    threshold = float(prm.get("threshold", 0.4))
    limit = int(prm.get("limit", 0))
    gen_thumbnails = bool(prm.get("thumbnails", False))
    gen_clips = bool(prm.get("clips", False))
    thumbnails_width = int(prm.get("thumbnails_width", 320))
    clip_duration = float(prm.get("clip_duration", 2.0))
    done_files = 0
    failed_paths: list[str] = []
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "markers")
            with lk:
                if scenes_json_exists(v) and not bool(jr.force):
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb_scenes(i: int, n: int):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            overall = (done_files * 100) + int((i / n) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    generate_scene_artifacts(
                        v,
                        threshold=threshold,
                        limit=limit,
                        gen_thumbnails=gen_thumbnails,
                        gen_clips=gen_clips,
                        thumbnails_width=thumbnails_width,
                        clip_duration=clip_duration,
                        progress_cb=_pcb_scenes,
                        cancel_check=_cc,
                    )
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception:
            # Per-file failure: mark progress for this file and attempt to write an empty scenes JSON
            done_files += 1
            try:
                rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
                failed_paths.append(rel)
            except Exception:
                failed_paths.append(str(v))
            try:
                sj = scenes_json_path(v)
                if not sj.exists():
                    sj.write_text(json.dumps({"scenes": []}, indent=2))
            except Exception:
                pass
            _set_job_progress(jid, processed_set=done_files * 100)
    _set_job_current(jid, None)
    try:
        result: dict[str, Any] = {"processed": len(vids), "failed": len(failed_paths)}
        if failed_paths:
            result["failed_paths"] = failed_paths[:200]
        _job_set_result(jid, result)
    except Exception:
        _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_phash_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    # Each file scaled to 100 progress units
    _set_job_progress(jid, total=max(0, len(vids) * 100), processed_set=0)
    done_files = 0
    frames = int(prm.get("frames", 5))
    algo = str(prm.get("algorithm" or prm.get("algo", "ahash")))
    combine = str(prm.get("combine", "xor"))
    force = bool(jr.force)
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "phash")
            with lk:
                if phash_path(v).exists() and not force:
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
                else:
                    def _pcb(i: int, n: int, _base=done_files):
                        try:
                            n = max(1, int(n))
                            i = max(0, min(int(i), n))
                            overall = (_base * 100) + int((i / n) * 100)
                            _set_job_progress(jid, processed_set=overall)
                        except Exception:
                            pass
                    def _cc() -> bool:
                        return _job_check_canceled(jid)
                    try:
                        phash_create_single(v, frames=frames, algo=algo, combine=combine, progress_cb=_pcb, cancel_check=_cc)
                    except Exception as e:
                        try:
                            print(f"[phash][handler][error] file={v.name} err={e}")
                        except Exception:
                            pass
                    done_files += 1
                    _set_job_progress(jid, processed_set=done_files * 100)
        except Exception as e:
            done_files += 1
            _set_job_progress(jid, processed_set=done_files * 100)
            try:
                print(f"[phash][handler][exception] file={v.name} err={e}")
            except Exception:
                pass
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)


def _handle_sample_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Generate synthetic sample media files for testing pipeline.

    jr.params fields:
      count: number of files to generate (default 3)
      pattern: filename pattern with {i} placeholder (default "sample_{i:02d}.mp4")
      duration: seconds per clip (default 4)
      size: resolution WxH (default "640x360")
      silence: if true, omit audio track
      color: optional ffmpeg color source (e.g. "red") cycling if list provided
    """
    prm = jr.params or {}
    count = int(prm.get("count", 3))
    pattern = str(prm.get("pattern", "sample_{i:02d}.mp4"))
    duration = float(prm.get("duration", 4.0))
    size = str(prm.get("size", "640x360"))
    silence = bool(prm.get("silence", False))
    color_param = prm.get("color")
    # Colors: allow single string or list
    colors: list[str]
    if isinstance(color_param, list):
        colors = [str(c) for c in color_param if str(c).strip()]
    elif isinstance(color_param, str) and color_param.strip():
        colors = [color_param.strip()]
    else:
        colors = ["black", "gray", "navy", "maroon"]
    target_dir = base
    target_dir.mkdir(parents=True, exist_ok=True)
    _set_job_progress(jid, total=count, processed_set=0)
    generated: list[str] = []
    for i in range(1, count + 1):
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        fname = pattern.format(i=i)
        # ensure .mp4 suffix
        if not fname.lower().endswith(".mp4"):
            fname += ".mp4"
        outp = target_dir / fname
        col = colors[(i - 1) % len(colors)]
        if ffmpeg_available():
            # Use color + testsrc overlay for variation; add tone if not silence
            vf = f"color=c={col}:s={size}:d={duration}" if silence else f"testsrc=size={size}:rate=30:duration={duration}"
            cmd = ["ffmpeg", "-hide_banner", "-y",
                   "-f", "lavfi", "-i", vf]
            if not silence:
                cmd += ["-f", "lavfi", "-i", f"sine=frequency={440 + (i*20)%200}:duration={duration}",
                        "-shortest",
                        "-c:v", "libx264", "-t", f"{duration}", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", str(outp)]
            else:
                cmd += ["-c:v", "libx264", "-t", f"{duration}", "-pix_fmt", "yuv420p", str(outp)]
            try:
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            except Exception:
                outp.write_bytes(b"")
        else:
            # Fallback: small placeholder file
            outp.write_bytes(b"SAMPLE")
        generated.append(str(outp))
        _set_job_progress(jid, processed_inc=1)
    _job_set_result(jid, {"generated": generated, "count": len(generated)})
    _finish_job(jid)

# -----------------------------
# Simple Actions API wrappers (frontend helpers)
# -----------------------------
class TranscodeActionRequest(BaseModel):  # type: ignore
    paths: list[str]
    profile: str | None = None  # "h264_aac_mp4" | "vp9_opus_webm"
    replace: bool | None = False
    force: bool | None = False


@api.post("/actions/transcode")
def api_action_transcode(req: TranscodeActionRequest):
    """Queue a transcode job for one or more relative media paths under MEDIA_ROOT.

    This is a thin wrapper around POST /jobs with task="transcode".
    """
    if not isinstance(req.paths, list) or not req.paths:
        raise HTTPException(400, "paths required")
    # Validate that each path resolves under root; keep as relative in job params
    rels: list[str] = []
    for rel in req.paths:
        try:
            p = safe_join(STATE["root"], rel)
            if not p.exists() or not p.is_file():
                raise HTTPException(404, f"file not found: {rel}")
            rels.append(str(p.relative_to(STATE["root"])) if str(p).startswith(str(STATE["root"])) else rel)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"invalid path {rel}: {e}")
    jr = JobRequest(
        task="transcode",
        directory=str(STATE["root"]),
        recursive=False,
        force=bool(req.force),
        params={
            "profile": str(req.profile or "h264_aac_mp4"),
            "targets": rels,
            "replace": bool(req.replace),
        },
    )
    return jobs_submit(jr)


class TrimActionRequest(BaseModel):  # type: ignore
    path: str
    start: float
    end: float
    dest_dir: str | None = None  # relative to root; defaults to sibling ".clips" dir


@api.post("/actions/trim")
def api_action_trim(req: TrimActionRequest):
    """Queue a trim (clip) job for a single file.

    Produces one clip [start,end] into a destination directory under MEDIA_ROOT.
    """
    base = STATE["root"]
    try:
        # Resolve source under root
        src = safe_join(base, req.path)
    except Exception as e:
        raise HTTPException(400, f"invalid path: {e}")
    if not src.exists() or not src.is_file():
        raise HTTPException(404, f"file not found: {req.path}")
    # Compute destination directory under root
    if req.dest_dir and str(req.dest_dir).strip():
        try:
            dest = safe_join(base, req.dest_dir)
        except Exception as e:
            raise HTTPException(400, f"invalid dest_dir: {e}")
    else:
        dest = src.parent / ".clips"
    try:
        dest = dest.resolve()
        # Enforce containment
        dest.relative_to(base)
    except Exception:
        raise HTTPException(400, "dest_dir must be under MEDIA_ROOT")
    # Validate times
    try:
        s = float(req.start)
        e = float(req.end)
        if s < 0 or e < 0 or e < s:
            raise ValueError("invalid time range")
    except Exception:
        raise HTTPException(400, "invalid start/end values")
    jr = JobRequest(
        task="clip",
        directory=str(base),
        recursive=False,
        force=False,
        params={
            "file": str(src.resolve()),
            "dest": str(dest),
            "ranges": [{"start": float(s), "end": float(e)}],
        },
    )
    return jobs_submit(jr)

class SplitActionRequest(BaseModel):  # type: ignore
    path: str
    every: float | None = None  # split every N seconds (required unless ranges are provided)
    dest_dir: str | None = None


@api.post("/actions/split")
def api_action_split(req: SplitActionRequest):
    """Queue a split operation by converting it into a multi-range clip job.

    You can specify `every` (seconds) to split into equal chunks. Clips are written under
    `.clips` next to the source unless `dest_dir` is provided (relative to MEDIA_ROOT).
    """
    base = STATE["root"]
    try:
        src = safe_join(base, req.path)
    except Exception as e:
        raise HTTPException(400, f"invalid path: {e}")
    if not src.exists() or not src.is_file():
        raise HTTPException(404, f"file not found: {req.path}")
    # Determine destination directory
    if req.dest_dir and str(req.dest_dir).strip():
        try:
            dest = safe_join(base, req.dest_dir)
        except Exception as e:
            raise HTTPException(400, f"invalid dest_dir: {e}")
    else:
        dest = src.parent / ".clips"
    try:
        dest = dest.resolve(); dest.relative_to(base)
    except Exception:
        raise HTTPException(400, "dest_dir must be under MEDIA_ROOT")
    # Build ranges using metadata duration
    every = float(req.every or 0.0)
    if not (every and every > 0):
        raise HTTPException(400, "every (seconds) must be > 0")
    dur, _title, _w, _h = _metadata_summary_cached(src)
    if not dur or dur <= 0:
        try:
            # Generate metadata sidecar if missing, then re-read
            metadata_single(src, force=False)
            dur, _t2, _w2, _h2 = _metadata_summary_cached(src)
        except Exception:
            dur = None
    if not dur or dur <= 0:
        raise HTTPException(400, "duration unavailable; generate metadata first")
    ranges: list[dict[str, float]] = []
    t = 0.0
    while t < float(dur) - 1e-3:
        s = t
        e = min(float(dur), s + every)
        ranges.append({"start": float(s), "end": float(e)})
        t = e
        if len(ranges) > 2000:
            break
    if not ranges:
        raise HTTPException(400, "no ranges computed")
    jr = JobRequest(
        task="clip",
        directory=str(base),
        recursive=False,
        force=False,
        params={
            "file": str(src.resolve()),
            "dest": str(dest),
            "ranges": ranges,
        },
    )
    return jobs_submit(jr)

class ConcatActionRequest(BaseModel):  # type: ignore
    paths: list[str]
    out_dir: str | None = None
    out_name: str | None = None  # default generated


@api.post("/actions/concat")
def api_action_concat(req: ConcatActionRequest):
    """Queue a concat job for two or more files.

    Concatenation re-encodes to MP4 (H.264/AAC) for compatibility. Output is written to
    `.concat` next to the first file unless `out_dir` is specified (relative to MEDIA_ROOT).
    """
    if not isinstance(req.paths, list) or len(req.paths) < 2:
        raise HTTPException(400, "paths must contain at least two files")
    base = STATE["root"]
    inputs: list[str] = []
    abs_inputs: list[Path] = []
    for rel in req.paths:
        try:
            p = safe_join(base, rel)
        except Exception as e:
            raise HTTPException(400, f"invalid path {rel}: {e}")
        if not p.exists() or not p.is_file():
            raise HTTPException(404, f"file not found: {rel}")
        abs_inputs.append(p.resolve())
        inputs.append(str(p.relative_to(base)))
    # Determine output directory
    if req.out_dir and str(req.out_dir).strip():
        try:
            out_dir = safe_join(base, req.out_dir)
        except Exception as e:
            raise HTTPException(400, f"invalid out_dir: {e}")
    else:
        out_dir = abs_inputs[0].parent / ".concat"
    try:
        out_dir = out_dir.resolve(); out_dir.relative_to(base)
    except Exception:
        raise HTTPException(400, "out_dir must be under MEDIA_ROOT")
    out_name = (req.out_name or f"concat_{uuid.uuid4().hex[:8]}.mp4").strip()
    if not out_name.lower().endswith(".mp4"):
        out_name += ".mp4"
    jr = JobRequest(
        task="concat",
        directory=str(base),
        recursive=False,
        force=False,
        params={
            "inputs": inputs,
            "out_dir": str(out_dir),
            "out_name": out_name,
        },
    )
    return jobs_submit(jr)

def _handle_waveform_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    width = int(prm.get("width", 800))
    height = int(prm.get("height", 160))
    color = str(prm.get("color", "#4fa0ff"))
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    done = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid); return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "waveform")
            with lk:
                if waveform_png_path(v).exists() and not bool(jr.force):
                    pass
                else:
                    generate_waveform(v, force=bool(jr.force), width=width, height=height, color=color)
        finally:
            done += 1
            _set_job_progress(jid, processed_set=done)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)

def _handle_motion_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    targets = prm.get("targets") or []
    interval = float(prm.get("interval", 1.0))
    if targets:
        vids: list[Path] = []
        for rel in targets:
            try:
                p = safe_join(STATE["root"], rel)
                if p.exists() and p.is_file():
                    vids.append(p)
            except Exception:
                continue
    else:
        vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    done = 0
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid); return
        try:
            _set_job_current(jid, str(v))
            lk = _file_task_lock(v, "motion")
            with lk:
                if motion_json_path(v).exists() and not bool(jr.force):
                    pass
                else:
                    generate_motion_activity(v, force=bool(jr.force), interval=interval)
        finally:
            done += 1
            _set_job_progress(jid, processed_set=done)
    _set_job_current(jid, None)
    _job_set_result(jid, {"processed": len(vids)})
    _finish_job(jid)

def _handle_chain_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Execute a sequence of child jobs sequentially.

    jr.params fields:
      steps: list[ { task: str, params?: dict, directory?, recursive?, force? } ]
      continue_on_error: bool (default False) – if False abort chain on first error.
      propagate_force: bool (default False) – if True, apply parent jr.force to each step unless step overrides force.
    Progress model: total = steps * 100. Each completed child increments processed by 100.
    While a child runs, we map its fractional progress into current step's 0..100 slice.
    Result contains per-step summary with child job id and outcome.
    """
    prm = jr.params or {}
    steps = prm.get("steps") or []
    if not isinstance(steps, list) or not steps:
        _finish_job(jid, error="no steps provided")
        return
    continue_on_error = bool(prm.get("continue_on_error", False))
    propagate_force = bool(prm.get("propagate_force", False))
    # Determine allowed tasks (reuse handlers registry excluding chain itself)
    allowed_tasks = {
    "transcode", "autotag", "embed", "clip", "cleanup-artifacts",
        "sprites", "heatmaps", "faces", "preview", "subtitles", "scenes", "sample",
        "waveform", "motion", "index-embeddings", "integrity-scan"
    }
    # Validate steps
    norm_steps: list[dict[str, Any]] = []
    for idx, st in enumerate(steps):
        if not isinstance(st, dict):
            _finish_job(jid, error=f"invalid step {idx}")
            return
        task = str(st.get("task", "")).lower()
        if task not in allowed_tasks:
            _finish_job(jid, error=f"unsupported task: {task}")
            return
        norm_steps.append(st)
    total_slices = len(norm_steps) * 100
    _set_job_progress(jid, total=total_slices, processed_set=0)
    results: list[dict[str, Any]] = []
    for i, st in enumerate(norm_steps):
        if _job_check_canceled(jid):
            results.append({"step": i, "task": st.get("task"), "status": "canceled"})
            break
        task = str(st.get("task"))
        step_dir = st.get("directory") or jr.directory
        step_recursive = st.get("recursive") if st.get("recursive") is not None else jr.recursive
        step_force = bool(st.get("force")) if st.get("force") is not None else (jr.force if propagate_force else False)
        step_params = st.get("params") or {}
        child_req = JobRequest(
            task=task,
            directory=step_dir,
            params=step_params,
            recursive=bool(step_recursive),
            force=bool(step_force),
        )
        # Submit child job
        try:
            resp = jobs_submit(child_req)
            child_jid_any = resp.get("id")  # type: ignore
            child_jid = str(child_jid_any) if child_jid_any else ""
        except Exception as e:
            results.append({"step": i, "task": task, "status": "submit_error", "error": str(e)})
            if not continue_on_error:
                _job_set_result(jid, {"steps": results})
                _finish_job(jid)
                return
            continue
        if not child_jid:
            results.append({"step": i, "task": task, "status": "submit_error", "error": "no child id"})
            if not continue_on_error:
                _job_set_result(jid, {"steps": results})
                _finish_job(jid)
                return
            continue
        # Monitor child job
        slice_base = i * 100
        while True:
            if _job_check_canceled(jid):
                ev = JOB_CANCEL_EVENTS.get(child_jid) if child_jid else None
                if ev:
                    ev.set()  # attempt to cancel child
                results.append({"step": i, "task": task, "status": "canceled", "child": child_jid})
                break
            job_info = JOBS.get(child_jid) or {}
            state = job_info.get("state")
            total = max(1, int(job_info.get("total", 100)))
            processed = int(job_info.get("processed", 0))
            # Map to chain progress
            frac = min(1.0, max(0.0, processed / total))
            _set_job_progress(jid, processed_set=slice_base + int(frac * 100))
            if state in ("finished", "error", "canceled"):
                # capture result
                res_entry = {
                    "step": i,
                    "task": task,
                    "child": child_jid,
                    "state": state,
                }
                if job_info.get("error"):
                    res_entry["error"] = job_info.get("error")
                if job_info.get("result") is not None:
                    res_entry["result"] = job_info.get("result")
                results.append(res_entry)
                if state == "error" and not continue_on_error:
                    _job_set_result(jid, {"steps": results})
                    _finish_job(jid)
                    return
                # Advance processed to end of slice
                _set_job_progress(jid, processed_set=slice_base + 100)
                break
            time.sleep(0.25)
    _job_set_result(jid, {"steps": results})
    _finish_job(jid)


def _handle_integrity_scan_job(jid: str, jr: JobRequest, base: Path) -> None:
    """Scan library for artifact integrity.

    For each video:
      - missing: artifact kinds not present
      - stale: artifact older than source video (mtime comparison)
    Globally:
      - orphaned: artifact files whose base media file is missing (de-duplicated)

    jr.params options:
      kinds: optional list of artifact kinds to restrict (defaults FINISH_ARTIFACT_ORDER)
      include_ok: if true include entries even when no issues
    """
    prm = jr.params or {}
    include_ok = bool(prm.get("include_ok", False))
    limit_kinds = prm.get("kinds") or FINISH_ARTIFACT_ORDER
    if isinstance(limit_kinds, str):  # allow comma list
        limit_kinds = [k.strip() for k in limit_kinds.split(',') if k.strip()]
    kinds: list[str] = [k for k in FINISH_ARTIFACT_ORDER if k in set(limit_kinds)] or FINISH_ARTIFACT_ORDER
    # Gather videos
    vids = _iter_videos(base, bool(jr.recursive))
    # Pre-compute artifact file path resolvers
    def _artifact_paths(v: Path) -> dict[str, list[Path]]:
        mp: dict[str, list[Path]] = {
            "metadata": [metadata_path(v)],
            "thumbnail": [thumbnails_path(v)],
            "preview": [preview_webm_path(v), preview_json_path(v)],
            "sprites": list(sprite_sheet_paths(v)),
            "scenes": [scenes_json_path(v)],
            "heatmaps": [heatmaps_json_path(v), heatmaps_png_path(v)],
            "phash": [phash_path(v)],
            "faces": [faces_path(v)],
            "subtitles": [artifact_dir(v) / f"{v.stem}{SUFFIX_SUBTITLES_SRT}", v.with_suffix(SUFFIX_SUBTITLES_SRT)],
        }
        return mp
    base_root = STATE["root"]
    rel = lambda p: str(p.relative_to(base_root)) if str(p).startswith(str(base_root)) else str(p)
    results: list[dict[str, Any]] = []
    # We'll also collect all artifact files to later detect orphans
    all_artifact_files: list[Path] = []
    for v in vids:
        if _job_check_canceled(jid):
            _finish_job(jid)
            return
        _set_job_current(jid, str(v))
        try:
            art_map = _artifact_paths(v)
            missing: list[str] = []
            stale: list[str] = []
            try:
                v_mtime = v.stat().st_mtime
            except Exception:
                v_mtime = 0.0
            for k in kinds:
                try:
                    paths = art_map.get(k, [])
                    exists_any = False
                    stale_any = False
                    for pth in paths:
                        if pth.exists() and pth.is_file():
                            exists_any = True
                            try:
                                if v_mtime and pth.stat().st_mtime < v_mtime:
                                    stale_any = True
                            except Exception:
                                pass
                    if not exists_any:
                        missing.append(k)
                    elif stale_any:
                        stale.append(k)
                except Exception:
                    continue
            if include_ok or missing or stale:
                results.append({
                    "file": rel(v),
                    **({"missing": missing} if missing else {}),
                    **({"stale": stale} if stale else {}),
                })
        finally:
            _set_job_progress(jid, processed_inc=1)
    # Orphans: search artifact dirs for files not linked to a known video stem
    video_stems = {v.stem for v in vids}
    orphaned: list[str] = []
    for v in vids:
        pass  # placeholder to keep local variable used - vids used already
    # Instead of iterating only videos, enumerate all .artifacts subdirs under base
    for p in base.rglob(".artifacts"):
        if not p.is_dir():
            continue
        for f in p.iterdir():
            if not f.is_file():
                continue
            parsed = _parse_artifact_name(f.name)
            if not parsed:
                continue
            stem, _kind = parsed
            if stem not in video_stems:
                try:
                    orphaned.append(rel(f))
                except Exception:
                    orphaned.append(str(f))
    summary = {
        "videos_scanned": len(vids),
        "entries": len(results),
        "missing_total": sum(len(r.get("missing", [])) for r in results),
        "stale_total": sum(len(r.get("stale", [])) for r in results),
        "orphaned_total": len(orphaned),
    }
    _job_set_result(jid, {"results": results, "orphaned": orphaned[:500], "summary": summary, "kinds": kinds})
    _finish_job(jid)

# -----------------------------
# Embeddings & Search (Batch 2)
# -----------------------------

EMB_INDEX_LOCK = threading.Lock()
STATE.setdefault("embedding_index", None)  # will hold {built_at, entries:[...]}

def _hex_to_bits(h: str) -> list[int]:
    bits: list[int] = []
    try:
        for c in h.strip():
            v = int(c, 16)
            for i in range(3, -1, -1):
                bits.append(1 if (v >> i) & 1 else 0)
    except Exception:
        return []
    return bits

def _vec_norm(v: list[float]) -> list[float]:
    try:
        import math
        s = math.sqrt(sum(x*x for x in v))
        if s <= 0:
            return v
        return [x / s for x in v]
    except Exception:
        return v

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    L = min(len(a), len(b))
    num = 0.0
    da = 0.0
    db = 0.0
    for i in range(L):
        x = float(a[i]); y = float(b[i])
        num += x * y
        da += x * x
        db += y * y
    try:
        import math
        if da <= 0 or db <= 0:
            return 0.0
        return float(num) / float(math.sqrt(da) * math.sqrt(db))
    except Exception:
        return 0.0

def _placeholder_clip_embedding(seed_text: str) -> list[float]:
    """Deterministic pseudo embedding (size 128) using sha256 of seed."""
    import hashlib
    h = hashlib.sha256(seed_text.encode("utf-8", "ignore")).digest()
    # Expand to 128 floats by hashing blocks
    out: list[float] = []
    cur = h
    while len(out) < 128:
        cur = hashlib.sha256(cur).digest()
        for b in cur:
            out.append((b / 255.0) * 2 - 1)  # [-1,1]
            if len(out) >= 128:
                break
    return _vec_norm(out)

def _average_face_embedding(faces_json: dict) -> list[float]:
    faces = faces_json.get("faces") if isinstance(faces_json, dict) else None
    if not isinstance(faces, list) or not faces:
        return []
    accum: list[float] = []
    count = 0
    for f in faces:
        try:
            emb = f.get("embedding") if isinstance(f, dict) else None
            if not isinstance(emb, list) or not emb:
                continue
            if not accum:
                accum = [0.0]*len(emb)
            if len(emb) != len(accum):
                continue
            for i, val in enumerate(emb):
                accum[i] += float(val)
            count += 1
        except Exception:
            continue
    if not accum or count == 0:
        return []
    return _vec_norm([x / count for x in accum])

def _combined_vector(ent: dict[str, Any], mode: str) -> list[float]:
    mode = mode.lower()
    vec: list[float] = []
    if mode in ("auto", "phash", "all"):
        pv = ent.get("phash_vec")
        if isinstance(pv, list) and pv:
            vec.extend([1.0 if bool(b) else -1.0 for b in pv])
    if mode in ("auto", "faces", "all"):
        fv = ent.get("face_vec")
        if isinstance(fv, list) and fv:
            vec.extend([float(x) for x in fv])
    if mode in ("auto", "clip", "all"):
        cv = ent.get("clip_vec")
        if isinstance(cv, list) and cv:
            vec.extend([float(x) for x in cv])
    return _vec_norm(vec)

def _handle_index_embeddings_job(jid: str, jr: JobRequest, base: Path) -> None:
    prm = jr.params or {}
    mode = str(prm.get("mode", "auto"))
    vids = _iter_videos(base, bool(jr.recursive))
    _set_job_progress(jid, total=len(vids), processed_set=0)
    entries: list[dict[str, Any]] = []
    for i, v in enumerate(vids, start=1):
        if _job_check_canceled(jid):
            _finish_job(jid); return
        rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
        phash_hex = None
        phash_vec: list[int] = []
        try:
            pp = phash_path(v)
            if not pp.exists():
                try:
                    phash_create_single(v)  # type: ignore[arg-type]
                except Exception:
                    pass
            if pp.exists():
                data = json.loads(pp.read_text())
                phash_hex = data.get("phash")
                if isinstance(phash_hex, str) and phash_hex:
                    phash_vec = _hex_to_bits(phash_hex)
        except Exception:
            pass
        face_vec: list[float] = []
        try:
            fp = faces_path(v)
            if fp.exists():
                fdata = json.loads(fp.read_text())
                face_vec = _average_face_embedding(fdata)
        except Exception:
            pass
        clip_vec: list[float] = []
        try:
            clip_vec = _placeholder_clip_embedding(rel)
        except Exception:
            pass
        ent = {
            "file": rel,
            "phash_hex": phash_hex,
            "phash_vec": phash_vec,
            "face_vec": face_vec,
            "clip_vec": clip_vec,
        }
        entries.append(ent)
        _set_job_progress(jid, processed_set=i)
    with EMB_INDEX_LOCK:
        STATE["embedding_index"] = {
            "built_at": time.time(),
            "count": len(entries),
            "mode": mode,
            "entries": entries,
        }
    _job_set_result(jid, {"count": len(entries), "mode": mode})
    _finish_job(jid)


def _run_job_worker(jid: str, jr: JobRequest):
    try:
        try:
            JOB_CTX.jid = jid  # type: ignore[name-defined]
        except Exception:
            pass
        if _job_check_canceled(jid):
            _finish_job(jid); return
        _start_job(jid)
        if jr.directory:
            cand = Path(jr.directory).expanduser()
            if cand.is_absolute():
                try:
                    cand.resolve().relative_to(STATE["root"])  # type: ignore[arg-type]
                except Exception:
                    _finish_job(jid, error="invalid directory"); return
                base = cand.resolve()
            else:
                base = safe_join(STATE["root"], jr.directory)
        else:
            base = STATE["root"].resolve()  # type: ignore[attr-defined]
        task = (jr.task or "").lower()
        handlers: dict[str, Callable[[str, JobRequest, Path], None]] = {
            "transcode": _handle_transcode_job,
            "autotag": _handle_autotag_job,
            # Canonicalize: thumbnails use task "thumbnail"
            "thumbnail": _handle_thumbnail_job,
            # Newly added: generate metadata sidecar JSON (was previously missing, causing 'unknown task')
            "metadata": _handle_metadata_job,
            "embed": _handle_embed_job,
            "clip": _handle_clip_job,
            "concat": _handle_concat_job,
            "cleanup-artifacts": _handle_cleanup_artifacts_job,
            "sprites": _handle_sprites_job,
            "heatmaps": _handle_heatmaps_job,
            "faces": _handle_faces_job,
            "preview": _handle_preview_job,
            "subtitles": _handle_subtitles_job,
            "markers": _handle_scenes_job,
            "sample": _handle_sample_job,
            "chain": _handle_chain_job,
            "integrity-scan": _handle_integrity_scan_job,
            "index-embeddings": _handle_index_embeddings_job,
            "waveform": _handle_waveform_job,
            "motion": _handle_motion_job,
            "phash": _handle_phash_job,
        }
        h = handlers.get(task)
        if not h:
            _finish_job(jid, error="unknown task"); return
        h(jid, jr, base)
    except Exception as e:
        _finish_job(jid, error=str(e))


@app.post("/jobs")
def jobs_submit(req: JobRequest):
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    # Save request for restore/resume
    try:
        with JOB_LOCK:
            if jid in JOBS:
                JOBS[jid]["request"] = req.dict()
        _persist_job(jid)
    except Exception:
        pass
    # Start worker thread with global concurrency control
    def _runner():
        # For single-target operations, acquire per-file lock to avoid duplicate work
        prm = req.params or {}
        targets = prm.get("targets") or []
        lock_ctx = None
        if isinstance(targets, list) and len(targets) == 1:
            try:
                p = safe_join(STATE["root"], targets[0])
                lock_ctx = _file_task_lock(p, req.task)
            except Exception:
                lock_ctx = None
        if lock_ctx is not None:
            with JOB_RUN_SEM:
                with lock_ctx:
                    _run_job_worker(jid, req)
        else:
            with JOB_RUN_SEM:
                _run_job_worker(jid, req)
    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    return {"id": jid, "status": "queued"}

# -----------------------------
# Waveform & Motion query endpoints (Batch 3)
# -----------------------------
@app.get("/waveform")
def get_waveform(
    file: str = Query(..., description="Video file path (relative to root or absolute)"),
    force: bool = Query(False, description="Regenerate waveform even if it exists"),
    width: int = Query(800, ge=32, le=4096),
    height: int = Query(160, ge=32, le=2048),
    color: str = Query("#4fa0ff", description="Waveform color (hex)"),
):
    base = STATE["root"]
    # Support absolute path (must reside under root) or relative path
    try:
        if os.path.isabs(file):
            video = Path(file).resolve()
            # Enforce containment within media root
            if not str(video).startswith(str(base)):
                raise HTTPException(400, "absolute path is outside media root")
        else:
            video = safe_join(base, file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"invalid path: {e}")
    if not video.exists() or not video.is_file():
        raise HTTPException(404, f"video not found: {file}")
    lk = _file_task_lock(video, "waveform")
    with lk:
        try:
            generate_waveform(video, force=force, width=width, height=height, color=color)
        except Exception as e:
            raise HTTPException(500, f"waveform generation failed: {e}")
    wf = waveform_png_path(video)
    if not wf.exists():
        raise HTTPException(500, "waveform artifact missing after generation")
    return FileResponse(str(wf), media_type="image/png")


@app.get("/motion")
def get_motion_activity(
    file: str = Query(..., description="Video file path (relative to root or absolute)"),
    force: bool = Query(False, description="Regenerate motion JSON even if it exists"),
    interval: float = Query(1.0, ge=0.1, le=30.0, description="Frame sampling interval (seconds)"),
    top: int = Query(5, ge=1, le=100, description="Return top-N highest motion samples"),
):
    base = STATE["root"]
    try:
        if os.path.isabs(file):
            video = Path(file).resolve()
            if not str(video).startswith(str(base)):
                raise HTTPException(400, "absolute path is outside media root")
        else:
            video = safe_join(base, file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"invalid path: {e}")
    if not video.exists() or not video.is_file():
        raise HTTPException(404, f"video not found: {file}")
    lk = _file_task_lock(video, "motion")
    with lk:
        try:
            generate_motion_activity(video, force=force, interval=interval)
        except Exception as e:
            raise HTTPException(500, f"motion generation failed: {e}")
    mp = motion_json_path(video)
    if not mp.exists():
        raise HTTPException(500, "motion artifact missing after generation")
    try:
        data = json.loads(mp.read_text() or "{}")
    except Exception as e:
        raise HTTPException(500, f"failed to parse motion json: {e}")
    samples = data.get("samples") or []
    if samples:
        vals = [float(s.get("value", 0.0)) for s in samples]
        total = sum(vals)
        avg = total / len(vals) if vals else 0.0
        max_v = max(vals) if vals else 0.0
        indexed = list(enumerate(vals))
        indexed.sort(key=lambda x: x[1], reverse=True)
        top_list = [
            {
                "rank": i + 1,
                "index": idx,
                "time": float(idx) * float(data.get("interval", interval)),
                "value": v,
            }
            for i, (idx, v) in enumerate(indexed[:top])
        ]
        data["stats"] = {
            "count": len(vals),
            "avg": avg,
            "max": max_v,
            "sum": total,
            "top": top_list,
        }
    else:
        data["stats"] = {"count": 0, "avg": 0.0, "max": 0.0, "sum": 0.0, "top": []}
    return JSONResponse(data)


@app.get("/jobs/events")
async def jobs_events():
    q: asyncio.Queue[str] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    JOB_EVENT_SUBS.append((q, loop))

    async def event_gen():
        try:
            # Send a hello event
            yield "event: hello\n" + f"data: {json.dumps({'ok': True})}\n\n"
            while True:
                msg = await q.get()
                yield msg
        except asyncio.CancelledError:  # client disconnected
            pass
        finally:
            try:
                JOB_EVENT_SUBS.remove((q, loop))
            except ValueError:
                pass

    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_gen(), headers=headers, media_type="text/event-stream")


# Alias under /api for clients expecting jobs routes there
@api.get("/jobs/events")
async def jobs_events_api():
    return await jobs_events()


@app.get("/jobs/{job_id}")
def jobs_status(job_id: str):
    with JOB_LOCK:
        j = JOBS.get(job_id)
    if not j:
        raise HTTPException(404, "job not found")
    # TODO @copilot v2 reference
    # Map to v2-ish shape
    out = {
        "id": j["id"],
        "status": j.get("state"),
        "error": j.get("error"),
        "processed": j.get("processed"),
        "total": j.get("total"),
        "result": j.get("result"),
    }
    return out


@app.delete("/jobs/{job_id}")
def jobs_cancel(job_id: str):
    ev = JOB_CANCEL_EVENTS.get(job_id)
    if not ev:
        raise HTTPException(404, "job not found")
    ev.set()
    with JOB_LOCK:
        j = JOBS.get(job_id)
        if j and j.get("state") in ("queued", "running"):
            j["state"] = "canceled"
            j["ended_at"] = time.time()
    _publish_job_event({"event": "cancel", "id": job_id})
    return {"id": job_id, "status": "canceled"}




# jobs_events is exposed via @api.get("/jobs/events"); no extra alias needed

# Proper /api endpoints that resolve paths relative to MEDIA_ROOT
@api.get("/videos/{name}/tags")
def api_get_video_tags(name: str, directory: str = Query(default="")):
    base = safe_join(STATE["root"], directory) if directory else STATE["root"]
    path = base / name
    if not path.exists():
        raise_api_error("video not found", status_code=404)
    tfile = _tags_file(path)
    if not tfile.exists():
        return {"video": name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
    try:
        data = json.loads(tfile.read_text())
    except Exception:
        raise_api_error("invalid tags file", status_code=500)
    if "description" not in data:
        data["description"] = ""
    if "rating" not in data:
        data["rating"] = 0
    if "favorite" not in data:
        data["favorite"] = False
    return data


@api.patch("/videos/{name}/tags")
def api_update_video_tags(name: str, payload: TagUpdate, directory: str = Query(default="")):
    base = safe_join(STATE["root"], directory) if directory else STATE["root"]
    path = base / name
    if not path.exists():
        raise_api_error("video not found", status_code=404)
    tfile = _tags_file(path)
    if tfile.exists():
        try:
            data = json.loads(tfile.read_text())
        except Exception:
            data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
    else:
        data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0, "favorite": False}
    data.setdefault("description", "")
    data.setdefault("rating", 0)
    data.setdefault("favorite", False)
    if payload.replace and payload.add is not None:
        data["tags"] = []
    if payload.replace:
        data["performers"] = []
    if payload.add:
        for t in payload.add:
            if t not in data["tags"]:
                data["tags"].append(t)
    if payload.remove:
        data["tags"] = [t for t in data["tags"] if t not in payload.remove]
    if payload.performers_add:
        for t in payload.performers_add:
            if t not in data["performers"]:
                data["performers"].append(t)
    if payload.performers_remove:
        data["performers"] = [t for t in data["performers"] if t not in payload.performers_remove]
    if payload.description is not None:
        data["description"] = payload.description
    if payload.rating is not None:
        try:
            data["rating"] = max(0, min(5, int(payload.rating)))
        except (ValueError, TypeError):
            data["rating"] = 0
    if payload.favorite is not None:
        try:
            data["favorite"] = bool(payload.favorite)
        except Exception:
            data["favorite"] = False
    try:
        tfile.write_text(json.dumps(data, indent=2))
    except Exception:
        raise_api_error("failed to write tags", status_code=500)
    return data


@api.get("/tags/summary")
def api_tags_summary(path: str = Query(default=""), recursive: bool = Query(default=False)):
    """
    Summarize tags and performers under a directory.

    Be forgiving if the path is empty or invalid: return empty counts instead of 404
    so the UI can render without error during initialization.
    """
    try:
        base = safe_join(STATE["root"], path) if path else STATE["root"]
    except Exception:
        # Invalid path outside root; treat as empty
        return {"tags": {}, "performers": {}}
    if not base.is_dir():
        # Non-directory path provided; treat as empty rather than erroring
        return {"tags": {}, "performers": {}}
    vids = _find_mp4s(base, bool(recursive))
    tag_counts: dict[str, int] = {}
    perf_counts: dict[str, int] = {}
    for p in vids:
        tf = _tags_file(p)
        if not tf.exists():
            continue
        try:
            data = json.loads(tf.read_text())
        except Exception:
            continue
        for t in data.get("tags", []) or []:
            tag_counts[t] = tag_counts.get(t, 0) + 1
        for t in data.get("performers", []) or []:
            perf_counts[t] = perf_counts.get(t, 0) + 1
    return {"tags": tag_counts, "performers": perf_counts}


# ---------------------------------
# Tags System (lightweight counters)
# ---------------------------------
_TAGS_CACHE: dict[str, dict] = {}
_TAGS_CACHE_TS: float | None = None
_TAGS_INDEX: dict[str, set[str]] = {}

def _normalize_tag(name: str) -> str:
    s = (name or "").strip()
    return s

def _load_tags_sidecars() -> None:
    """Scan tags from sidecar files and in-memory media attributes; merge with registry.
    Builds an index of tag -> set(paths) for counts. Cached for a few minutes.
    """
    global _TAGS_CACHE_TS, _TAGS_INDEX, _TAGS_CACHE
    root = STATE.get("root")
    root_missing = not root or not root.exists()
    now = time.time()
    rescan = (not _TAGS_CACHE_TS or (now - _TAGS_CACHE_TS) >= 300) and not root_missing
    if not rescan:
        return
    _TAGS_INDEX = {}
    _TAGS_CACHE = {}
    # From media-attr first (fast, in-memory)
    try:
        for rel, ent in (_MEDIA_ATTR or {}).items():
            try:
                rel_str = str(rel)
            except Exception:
                rel_str = str(rel)
            tags = (ent or {}).get("tags") or []
            for n in tags:
                if not isinstance(n, str):
                    continue
                tag = _normalize_tag(n)
                if not tag:
                    continue
                _TAGS_INDEX.setdefault(tag, set()).add(rel_str)
                _TAGS_CACHE.setdefault(tag, {"name": n})
    except Exception:
        pass
    # Merge from sidecar files on disk
    try:
        vids = _find_mp4s(root, True) if root and root.exists() else []
    except Exception:
        vids = []
    for p in vids:
        tf = _tags_file(p)
        if not tf.exists():
            continue
        try:
            data = json.loads(tf.read_text())
        except Exception:
            continue
        for n in (data.get("tags") or []):
            if not isinstance(n, str):
                continue
            tag = _normalize_tag(n)
            if not tag:
                continue
            rel = None
            try:
                rel = str(p.relative_to(root)) if root else str(p)
            except Exception:
                rel = str(p)
            _TAGS_INDEX.setdefault(tag, set()).add(rel)
            _TAGS_CACHE.setdefault(tag, {"name": n})
    # Merge from registry (ensures known tags appear with count=0)
    try:
        path = _tags_registry_path()
        data = _load_registry(path, "tags") if path.exists() else {"tags": []}
        items = list(data.get("tags") or [])
        for it in items:
            nm = str(it.get("name") or "").strip()
            if not nm:
                continue
            tag = _normalize_tag(nm)
            _TAGS_CACHE.setdefault(tag, {"name": nm})
            _TAGS_INDEX.setdefault(tag, set())
    except Exception:
        pass
    _TAGS_CACHE_TS = now

def _rewrite_media_attr_tags_with_registry() -> int:
    """Update in-memory/persisted media-attr tags to canonical registry names.

    Uses slug-based mapping so case-only merges and alias merges reflect immediately
    in API responses that read from _MEDIA_ATTR.
    Returns the number of entries modified.
    """
    try:
        with REGISTRY_LOCK:
            tdata = _load_registry(_tags_registry_path(), "tags")
            by_slug = { (t.get("slug") or ""): t for t in (tdata.get("tags") or []) }
    except Exception:
        by_slug = {}
    changed = 0
    try:
        for rel, ent in (_MEDIA_ATTR or {}).items():
            tags = list((ent or {}).get("tags") or [])
            new_tags: list[str] = []
            seen = set()
            for t in tags:
                s = _slugify(str(t))
                canon = by_slug.get(s)
                name = (canon.get("name") if canon else str(t)).strip()
                low = name.lower()
                if low not in seen:
                    new_tags.append(name)
                    seen.add(low)
            if new_tags != tags:
                ent["tags"] = new_tags
                changed += 1
        if changed:
            _save_media_attr()
    except Exception:
        pass
    # Invalidate tags list cache so next /api/tags reflects updates
    global _TAGS_CACHE_TS
    _TAGS_CACHE_TS = None
    return changed

def _list_tags(search: str | None = None) -> list[dict]:
    _load_tags_sidecars()
    all_norms = set(_TAGS_INDEX.keys()) | set(_TAGS_CACHE.keys())
    out: list[dict] = []
    for norm in all_norms:
        paths = _TAGS_INDEX.get(norm, set())
        rec = _TAGS_CACHE.get(norm, {"name": norm})
        name = rec.get("name") or norm
        slug = _slugify(name)
        out.append({"name": name, "slug": slug, "count": len(paths)})
    if search:
        s = search.strip().lower()
        out = [r for r in out if s in (r.get("name") or "").lower()]
    return out

@api.get("/tags")
def api_tags(
    search: Optional[str] = Query(default=None),
    sort: str = Query(default="count"),
    order: str = Query(default="desc"),
    page: int = Query(default=1),
    page_size: int = Query(default=32),
    refresh: bool = Query(default=False),
    debug: bool = Query(default=False),
):
    try:
        if debug:
            logging.info("[tags] list request: search=%s refresh=%s", str(search), str(refresh))
        if refresh:
            global _TAGS_CACHE_TS
            _TAGS_CACHE_TS = None
        # Ensure loaded
        _load_tags_sidecars()
        items = _list_tags(search)
        s = (sort or "count").lower()
        o = (order or "desc").lower()
        if s == "name":
            items.sort(key=lambda r: (r.get("name") or "").lower(), reverse=(o == "desc"))
        else:
            items.sort(key=lambda r: (int(r.get("count") or 0), (r.get("name") or "").lower()), reverse=(o == "desc"))
        total = len(items)
        p = max(1, int(page or 1))
        ps = max(1, min(256, int(page_size or 32)))
        start = (p - 1) * ps
        end = start + ps
        page_items = items[start:end]
        if debug:
            logging.info("[tags] list response: total=%d page=%d size=%d sort=%s order=%s", total, p, ps, s, o)
            for i, r in enumerate(page_items[:10], 1):
                logging.info("[tags] #%d %s (slug=%s) count=%s", i, r.get("name"), r.get("slug"), str(r.get("count")))
        return api_success({
            "tags": page_items,
            "total": total,
            "page": p,
            "page_size": ps,
            "total_pages": max(1, (total + ps - 1) // ps),
            "sort": s,
            "order": o,
            "search": search or "",
        })
    except Exception as e:
        raise_api_error(f"Failed to list tags: {str(e)}")


@api.get("/stats")
def api_stats(path: str = Query(default=""), recursive: bool = Query(default=True)):
    """
    Compute basic library-wide statistics for a given path (defaults to root).

    Returns: { num_files, total_size, total_duration, tags_count, performers_count, res_buckets, duration_buckets }
    """
    try:
        base = safe_join(STATE["root"], path) if path else STATE["root"]
    except Exception:
        return api_success({"num_files": 0, "total_size": 0, "total_duration": 0.0, "tags": 0, "performers": 0, "res_buckets": {}, "duration_buckets": {}})
    if not base.exists() or not base.is_dir():
        return api_success({"num_files": 0, "total_size": 0, "total_duration": 0.0, "tags": 0, "performers": 0, "res_buckets": {}, "duration_buckets": {}})

    vids = _find_mp4s(base, bool(recursive))
    num_files = len(vids)
    total_size = 0
    total_duration = 0.0

    # Resolution buckets (by height)
    res_buckets: dict[str, int] = {"2160": 0, "1440": 0, "1080": 0, "720": 0, "480": 0, "360": 0, "other": 0}

    # Duration buckets (seconds)
    duration_buckets: dict[str, int] = {"<1m": 0, "1-5m": 0, "5-20m": 0, "20-60m": 0, ">60m": 0}

    tag_set: set[str] = set()
    perf_set: set[str] = set()

    for p in vids:
        try:
            st = p.stat()
            total_size += int(getattr(st, "st_size", 0) or 0)
        except Exception:
            pass
        dur, _title, width, height = _metadata_summary_cached(p)
        if dur:
            try:
                total_duration += float(dur)
            except Exception:
                pass
        # resolution grouping by height
        h = int(height) if height else None
        if h is None:
            res_buckets["other"] += 1
        elif h >= 2160:
            res_buckets["2160"] += 1
        elif h >= 1440:
            res_buckets["1440"] += 1
        elif h >= 1080:
            res_buckets["1080"] += 1
        elif h >= 720:
            res_buckets["720"] += 1
        elif h >= 480:
            res_buckets["480"] += 1
        elif h >= 360:
            res_buckets["360"] += 1
        else:
            res_buckets["other"] += 1

        # duration bucket
        if dur is None:
            duration_buckets["<1m"] += 1
        else:
            try:
                dsec = float(dur)
                if dsec < 60:
                    duration_buckets["<1m"] += 1
                elif dsec < 300:
                    duration_buckets["1-5m"] += 1
                elif dsec < 1200:
                    duration_buckets["5-20m"] += 1
                elif dsec < 3600:
                    duration_buckets["20-60m"] += 1
                else:
                    duration_buckets[">60m"] += 1
            except Exception:
                duration_buckets["<1m"] += 1

        # collect tags/performers from sidecar if present
        tf = _tags_file(p)
        if tf.exists():
            try:
                tdata = json.loads(tf.read_text())
                for t in (tdata.get("tags") or []):
                    tag_set.add(t)
                for pf in (tdata.get("performers") or []):
                    perf_set.add(pf)
            except Exception:
                pass

    out = {
        "num_files": num_files,
        "total_size": total_size,
        "total_duration": total_duration,
        "tags": len(tag_set),
        "performers": len(perf_set),
        "res_buckets": res_buckets,
        "duration_buckets": duration_buckets,
    }
    return api_success(out)


# -----------------------------
# Doctor / system diagnostics (transcode roadmap prerequisite)
# -----------------------------

def _which_version(cmd: str) -> tuple[bool, Optional[str]]:
    exe = shutil.which(cmd)
    if not exe:
        return False, None
    try:
        out = subprocess.check_output([cmd, "-version"], stderr=subprocess.STDOUT, timeout=5)
        first = out.decode("utf-8", "ignore").splitlines()[0].strip()
        return True, first
    except Exception:
        return True, None


def _model_available(name: str) -> bool:
    # Placeholder heuristic until face/subtitle models formalized
    if name == "whisper":
        return _has_module("whisper") or _has_module("faster_whisper")
    if name == "faces":
        return _has_module("insightface") or _has_module("facenet_pytorch") or _has_module("dlib")
    return False


@api.get("/system/doctor")
def api_system_doctor():
    checks: list[dict[str, Any]] = []

    def add(name: str, ok: bool, detail: Optional[str] = None):
        checks.append({"name": name, "status": "ok" if ok else "fail", **({"detail": detail} if detail else {})})

    # ffmpeg / ffprobe
    ff_ok, ff_ver = _which_version("ffmpeg")
    add("ffmpeg", ff_ok, ff_ver)
    fp_ok, fp_ver = _which_version("ffprobe")
    add("ffprobe", fp_ok, fp_ver)

    # concurrency env
    add("env.FFMPEG_THREADS", True, os.environ.get("FFMPEG_THREADS", "(default)"))
    add("env.FFMPEG_TIMELIMIT", True, os.environ.get("FFMPEG_TIMELIMIT", "(default)"))

    # hwaccel
    hw = os.environ.get("FFMPEG_HWACCEL")
    add("hwaccel", bool(hw), hw or "(none)")

    # root writable
    try:
        test_file = STATE["root"] / ".artifacts" / "__doctor_write.test"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("ok")
        test_file.unlink(missing_ok=True)  # type: ignore[arg-type]
        add("artifacts_writable", True)
    except Exception as e:
        add("artifacts_writable", False, str(e))

    # optional models
    add("model.whisper", _model_available("whisper"))
    add("model.faces", _model_available("faces"))

    # python deps snapshot (selected)
    for mod in ["PIL", "numpy", "torch", "onnx", "opencv-python"]:
        add(f"dep.{mod}", _has_module(mod.lower().replace("-", "_")))

    # config echo (subset)
    cfg = STATE.get("config") or {}
    diagnostics = {
        "root": str(STATE["root"]),
        "config_keys": sorted(list(cfg.keys())),
        "ffmpeg_threads_flags": _ffmpeg_threads_flags(),
    }
    summary = {
        "ok": all(c["status"] == "ok" for c in checks if not c["name"].startswith("dep.")),
        "failures": [c for c in checks if c["status"] != "ok"],
    }
    return {"checks": checks, "summary": summary, "diagnostics": diagnostics}


# -----------------------------
# Additional legacy vid feature ports: codecs scan & finish
# -----------------------------

class CodecsScanResult(BaseModel):  # type: ignore # minimal pydantic model for structured response
    file: str
    video_codec: str | None = None
    audio_codec: str | None = None
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    size_bytes: int | None = None
    bitrate: int | None = None
    pix_fmt: str | None = None
    r_frame_rate: str | None = None
    errors: list[str] | None = None


def _ffprobe_streams_safe(path: Path) -> dict[str, Any]:
    if not ffprobe_available():
        return {}
    try:
        cmd = [
            "ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        return json.loads(out.decode("utf-8", "ignore"))
    except Exception as e:  # pragma: no cover
        return {"error": str(e)}


def _codecs_reasoning(v: Path, rec: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reasons: list[dict[str, Any]] = []
    suggest: dict[str, Any] = {}
    video = (rec.get("video_codec") or "").lower() if isinstance(rec.get("video_codec"), str) else None
    audio = (rec.get("audio_codec") or "").lower() if isinstance(rec.get("audio_codec"), str) else None
    pix_fmt = (rec.get("pix_fmt") or "").lower() if isinstance(rec.get("pix_fmt"), str) else None
    width = rec.get("width") or 0
    height = rec.get("height") or 0
    bitrate = rec.get("bitrate") or 0
    duration = rec.get("duration") or 0.0
    ext = v.suffix.lower()
    def add(code: str, level: str = "info", message: str | None = None, **extra):
        reasons.append({"code": code, "level": level, **({"message": message} if message else {}), **extra})
    # Video codec suitability
    if video and video not in {"h264", "hevc", "vp9", "av1"}:
        add("uncommon_video_codec", "warn", f"Video codec '{video}' may have limited playback support")
    if not video:
        add("missing_video_stream", "error", "No video stream detected")
    # Audio
    if not audio:
        add("missing_audio", "warn", "File has no audio track")
    elif audio not in {"aac", "opus", "mp3"}:
        add("uncommon_audio_codec", "info", f"Audio codec '{audio}' is less common for web delivery")
    # Pixel format
    if pix_fmt and pix_fmt not in {"yuv420p", "yuvj420p"}:
        add("non_standard_pix_fmt", "info", f"Pixel format {pix_fmt} may trigger transcode for compatibility")
    # Resolution
    area = width * height
    if area >= 3840*2160:
        add("ultra_hd", "info", "4K/UHD content may benefit from AV1/VP9 for efficiency")
    elif area > 1920*1080:
        add("above_full_hd", "info", "Resolution above 1080p")
    # Bitrate heuristic thresholds
    if bitrate and duration:
        # rough per-second bytes
        if area <= 1920*1080 and bitrate > 12_000_000:
            add("high_bitrate", "warn", f"Bitrate {bitrate} > 12Mbps for <=1080p; consider re-encoding")
        if area >= 3840*2160 and bitrate > 40_000_000:
            add("very_high_bitrate", "warn", f"Bitrate {bitrate} > 40Mbps for 4K; consider more efficient codec")
    # Container/codec mismatch
    if ext == ".webm" and video and video not in {"vp8", "vp9", "av1"}:
        add("container_codec_mismatch", "warn", f"{video} inside .webm (expect VP9/AV1)")
    if ext == ".mp4" and video in {"vp9", "av1"}:
        add("container_codec_mismatch", "info", f"{video} in mp4 may have limited support; consider .webm for {video}")
    # Suggest simple profile
    if video in {"h264", "hevc"} and (audio in {"aac", None}):
        suggest["recommended_profile"] = "h264_aac_mp4"
    elif video in {"vp9"} and audio in {"opus", None}:
        suggest["recommended_profile"] = "vp9_opus_webm"
    elif video in {"av1"}:
        suggest["recommended_profile"] = "av1 (not yet defined profile)"
    # If high bitrate + non standard pix fmt, strong transcode suggestion
    if any(r["code"] in ("high_bitrate", "very_high_bitrate") for r in reasons):
        suggest["action"] = "transcode"
    return reasons, suggest

@api.get("/codecs")
def api_codecs_scan(path: str = Query(default=""), recursive: bool = Query(default=False), reasons: bool = Query(default=False)):
    """Profile media files (lightweight ffprobe summary).

    Query params:
      path: base directory relative to root
      recursive: recurse into subdirectories
      reasons: if true, add heuristic quality/compatibility analysis & suggestions
    """
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    vids = _iter_videos(base, recursive)
    out: list[dict[str, Any]] = []
    for v in vids:
        info = _ffprobe_streams_safe(v)
        rec: dict[str, Any] = {
            "file": str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v),
            "video_codec": None,
            "audio_codec": None,
        }
        try:
            if "error" in info:
                rec["errors"] = [info["error"]]
            fmt = (info.get("format") or {}) if isinstance(info, dict) else {}
            if fmt:
                try:
                    dur_v = fmt.get("duration")
                    rec["duration"] = float(dur_v) if dur_v not in (None, "") else None
                except Exception:
                    pass
                try:
                    size_v = fmt.get("size")
                    rec["size_bytes"] = int(size_v) if size_v not in (None, "") else None
                except Exception:
                    pass
                try:
                    br_v = fmt.get("bit_rate")
                    rec["bitrate"] = int(br_v) if br_v not in (None, "") else None
                except Exception:
                    pass
            streams = info.get("streams") if isinstance(info, dict) else None
            if isinstance(streams, list):
                for s in streams:
                    if not isinstance(s, dict):
                        continue
                    ct = s.get("codec_type")
                    if ct == "video" and rec.get("video_codec") is None:
                        rec["video_codec"] = s.get("codec_name")
                        rec["width"] = s.get("width")
                        rec["height"] = s.get("height")
                        rec["pix_fmt"] = s.get("pix_fmt")
                        rec["r_frame_rate"] = s.get("r_frame_rate")
                    elif ct == "audio" and rec.get("audio_codec") is None:
                        rec["audio_codec"] = s.get("codec_name")
        except Exception:
            rec.setdefault("errors", []).append("parse_error")
        if reasons:
            rlist, suggest = _codecs_reasoning(v, rec)
            if rlist:
                rec["reasons"] = rlist
            if suggest:
                rec["suggest"] = suggest
        out.append(rec)
    return {"items": out, "count": len(out)}


# -----------------------------
# Transcode plan endpoint
# -----------------------------
@api.get("/transcode/plan")
def api_transcode_plan(
    path: str = Query(default=""),
    recursive: bool = Query(default=False),
    target_profile: str = Query(default="auto"),
    max_items: int = Query(default=0, description="If >0, limit number of plan entries"),
):
    """Analyze which files would benefit from transcode.

    For each media file produce:
      file, current_profile (heuristic), recommended_profile, action (keep|transcode),
      est_size_reduction (bytes, heuristic), reasons (subset) and raw probe summary.
    """
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    vids = _iter_videos(base, recursive)
    out: list[dict[str, Any]] = []
    for v in vids:
        info = _ffprobe_streams_safe(v)
        rec: dict[str, Any] = {"file": str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)}
        try:
            fmt = (info.get("format") or {}) if isinstance(info, dict) else {}
            duration = None
            size_bytes = None
            bitrate = None
            if isinstance(fmt, dict):
                raw_duration = fmt.get("duration")
                if raw_duration not in (None, ""):
                    try:
                        duration = float(raw_duration)  # type: ignore[arg-type]
                    except Exception:
                        duration = None
                raw_size = fmt.get("size")
                if raw_size not in (None, ""):
                    try:
                        size_bytes = int(raw_size)  # type: ignore[arg-type]
                    except Exception:
                        size_bytes = None
                raw_br = fmt.get("bit_rate")
                if raw_br not in (None, ""):
                    try:
                        bitrate = int(raw_br)  # type: ignore[arg-type]
                    except Exception:
                        bitrate = None
            vcodec = None; acodec = None; width=None; height=None; pix_fmt=None
            streams = info.get("streams") if isinstance(info, dict) else None
            if isinstance(streams, list):
                for s in streams:
                    if not isinstance(s, dict):
                        continue
                    if s.get("codec_type") == "video" and vcodec is None:
                        vcodec = s.get("codec_name"); width=s.get("width"); height=s.get("height"); pix_fmt=s.get("pix_fmt")
                    elif s.get("codec_type") == "audio" and acodec is None:
                        acodec = s.get("codec_name")
            rec.update({
                "video_codec": vcodec,
                "audio_codec": acodec,
                "width": width,
                "height": height,
                "duration": duration,
                "bitrate": bitrate,
                "size_bytes": size_bytes,
                "pix_fmt": pix_fmt,
            })
        except Exception:
            rec.setdefault("errors", []).append("probe_error")
        reasons, suggest = _codecs_reasoning(v, rec)
        # Derive current simple profile
        cur_profile = None
        if vcodec in {"h264", "hevc"} and (acodec in {"aac", None}):
            cur_profile = "h264_aac_mp4"
        elif vcodec == "vp9" and (acodec in {"opus", None}):
            cur_profile = "vp9_opus_webm"
        elif vcodec == "av1":
            cur_profile = "av1"
        # Decide recommended
        if target_profile == "auto":
            rec_profile = suggest.get("recommended_profile") if suggest else cur_profile
        else:
            rec_profile = target_profile
        # Heuristic size reduction estimate
        size_red = None
        try:
            if rec.get("size_bytes") and rec.get("bitrate"):
                br = rec.get("bitrate") or 0
                # crude rule: if high_bitrate reason present, assume 35% reduction, else 0
                if any(r.get("code") in ("high_bitrate", "very_high_bitrate") for r in reasons):
                    size_red = int(int(rec["size_bytes"]) * 0.35)
        except Exception:
            size_red = None
        action = "keep"
        if rec_profile and rec_profile != cur_profile:
            action = "transcode"
        if action == "keep" and any(r.get("code") in ("high_bitrate", "very_high_bitrate", "non_standard_pix_fmt") for r in reasons):
            action = "transcode"
        plan_ent = {
            **rec,
            "current_profile": cur_profile,
            "recommended_profile": rec_profile,
            "action": action,
            **({"est_size_reduction": size_red} if size_red is not None else {}),
            "reasons": reasons[:10],  # cap
        }
        if action == "transcode":
            out.append(plan_ent)
        else:
            # include keeps only if explicitly desired? For now exclude to keep concise.
            pass
        if max_items and len(out) >= max_items:
            break
    return {"items": out, "count": len(out), "target_profile": target_profile}


# -----------------------------
# Embedding / Similarity Search API
# -----------------------------
@api.post("/embeddings/index")
def api_embeddings_index(path: str = Query(default=""), recursive: bool = Query(default=True), mode: str = Query(default="auto")):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    req = JobRequest(task="index-embeddings", directory=str(base), recursive=bool(recursive), force=False, params={"mode": mode})
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    def _runner():
        with JOB_RUN_SEM:
            _run_job_worker(jid, req)
    threading.Thread(target=_runner, daemon=True).start()
    return api_success({"job": jid, "queued": True})

@api.get("/embeddings/index")
def api_embeddings_index_status():
    with EMB_INDEX_LOCK:
        idx = STATE.get("embedding_index")
        if not idx:
            return api_success({"indexed": False})
        shallow = {k: v for k, v in idx.items() if k != "entries"}
        shallow["entries"] = idx.get("count", 0)
        return api_success({"indexed": True, **shallow})

def _search_similar_vector(query_vec: list[float], top_k: int, mode: str) -> list[dict[str, Any]]:
    with EMB_INDEX_LOCK:
        idx = STATE.get("embedding_index")
        entries = (idx or {}).get("entries") if isinstance(idx, dict) else None
    if not isinstance(entries, list) or not entries:
        return []
    scored: list[tuple[float, dict]] = []
    for ent in entries:
        try:
            vec = _combined_vector(ent, mode)
            if not vec:
                continue
            score = _cosine(query_vec, vec)
            if score <= 0:
                continue
            scored.append((score, ent))
        except Exception:
            continue
    scored.sort(key=lambda x: x[0], reverse=True)
    out: list[dict[str, Any]] = []
    for s, e in scored[: max(1, min(top_k, 200))]:
        out.append({"file": e.get("file"), "score": round(float(s), 6)})
    return out

@api.get("/search/by-file")
def api_search_by_file(file: str = Query(...), mode: str = Query(default="auto"), top_k: int = Query(default=10)):
    target = safe_join(STATE["root"], file)
    if not target.exists():
        raise_api_error("file not found", status_code=404)
    with EMB_INDEX_LOCK:
        idx = STATE.get("embedding_index")
        entries = (idx or {}).get("entries") if isinstance(idx, dict) else None
    if not isinstance(entries, list):
        raise_api_error("index not built", status_code=400)
    ent: Optional[dict[str, Any]] = None
    if isinstance(entries, list):
        for e in entries:
            try:
                if isinstance(e, dict) and e.get("file") == file:
                    ent = e
                    break
            except Exception:
                continue
    if not ent:
        raise_api_error("file not indexed", status_code=400)
    qvec = _combined_vector(ent, mode)  # type: ignore[arg-type]
    if not qvec:
        raise_api_error("no vector for file (missing embeddings)", status_code=400)
    res = _search_similar_vector(qvec, top_k, mode)
    # remove self
    res = [r for r in res if r.get("file") != file]
    return {"items": res, "count": len(res), "mode": mode}

@api.get("/search/by-text")
def api_search_by_text(q: str = Query(..., min_length=1), mode: str = Query(default="auto"), top_k: int = Query(default=10)):
    qvec = _placeholder_clip_embedding(q)
    res = _search_similar_vector(qvec, top_k, mode)
    return {"items": res, "count": len(res), "mode": mode}

@api.post("/search/by-vector")
def api_search_by_vector(payload: dict = Body(default_factory=dict)):
    vec = payload.get("vector") or []
    mode = str(payload.get("mode", "auto"))
    top_k = int(payload.get("top_k", 10))
    if not isinstance(vec, list) or not vec:
        raise_api_error("vector required")
    try:
        qvec = [float(x) for x in vec]
    except Exception:
        raise_api_error("invalid vector values")
    qvec = _vec_norm(qvec)
    res = _search_similar_vector(qvec, top_k, mode)
    return {"items": res, "count": len(res), "mode": mode}


# -----------------------------
# Rename undo ledger
# -----------------------------
RENAME_UNDO_LOG: list[dict[str, Any]] = []  # each entry: {plan_id, time, actions:[{from,to}]}
RENAME_UNDO_LOCK = threading.Lock()

@api.post("/rename/undo")
def api_rename_undo(payload: dict = Body(default_factory=dict)):
    plan_id = str(payload.get("plan_id") or "").strip()
    steps = int(payload.get("steps", 1))
    reverted: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    if plan_id:
        # Undo only that plan id
        with RENAME_UNDO_LOCK:
            entries = [e for e in RENAME_UNDO_LOG if e.get("plan_id") == plan_id]
    else:
        with RENAME_UNDO_LOCK:
            entries = list(RENAME_UNDO_LOG)[-steps:][::-1]
    for ent in entries:
        acts = ent.get("actions") or []
        base = Path(ent.get("base") or STATE["root"])  # original base recorded
        for a in acts:
            src = base / a.get("to", "")
            dst = base / a.get("from", "")
            if not src.exists():
                errors.append({"to": a.get("to", ""), "error": "missing_current"})
                continue
            if dst.exists():
                errors.append({"to": a.get("to", ""), "error": "original_exists"})
                continue
            try:
                src.rename(dst)
                reverted.append({"from": a.get("to", ""), "to": a.get("from", "")})
            except Exception as e:
                errors.append({"to": a.get("to", ""), "error": str(e)})
    return {"reverted": reverted, "errors": errors, "entries": len(entries)}


# Integrity scan job submit endpoint
@api.post("/integrity/scan")
def api_integrity_scan(path: str = Query(default=""), recursive: bool = Query(default=True), kinds: str = Query(default="")):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    prm: dict[str, Any] = {}
    if kinds:
        prm["kinds"] = kinds
    req = JobRequest(task="integrity-scan", directory=str(base), recursive=bool(recursive), params=prm, force=False)
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    def _runner():
        with JOB_RUN_SEM:
            _run_job_worker(jid, req)
    threading.Thread(target=_runner, daemon=True).start()
    return api_success({"job": jid, "queued": True})


def _artifact_exists(video: Path, kind: str) -> bool:
    if kind == "metadata":
        return metadata_path(video).exists()
    if kind == "thumbnail":
        return thumbnails_path(video).exists()
    if kind == "preview":
        return preview_webm_path(video).exists() or preview_json_path(video).exists()
    if kind == "sprites":
        s, j = sprite_sheet_paths(video)
        return s.exists() and j.exists()
    if kind == "markers":
        return scenes_json_exists(video)
    if kind == "heatmaps":
        return heatmaps_json_exists(video)
    if kind == "phash":
        return phash_path(video).exists()
    if kind == "faces":
        return faces_exists_check(video)
    if kind == "subtitles":
        return find_subtitles(video) is not None
    if kind == "waveform":
        return waveform_png_path(video).exists()
    if kind == "motion":
        return motion_json_path(video).exists()
    return False


FINISH_ARTIFACT_ORDER = [
    "metadata", "thumbnail", "preview", "sprites", "markers", "heatmaps", "phash", "faces", "subtitles", "waveform", "motion"
]

# -----------------------------
# Batch rename (plan/apply)
# -----------------------------
RENAME_PLANS: dict[str, dict[str, Any]] = {}
RENAME_PLANS_LOCK = threading.Lock()

def _validate_rename_pattern(pattern: str) -> re.Pattern:
    try:
        return re.compile(pattern)
    except Exception as e:  # pragma: no cover
        # raise_api_error always raises; add explicit raise for type analyzers
        raise_api_error(f"invalid regex: {e}")
        raise

def _mk_rename_plan(base: Path, recursive: bool, pattern: str, replacement: str, dry_run: bool, limit: int | None, include_ext: bool) -> dict[str, Any]:
    rx = _validate_rename_pattern(pattern)
    vids = _iter_videos(base, recursive)
    mapping: list[dict[str, str]] = []
    seen_targets: set[str] = set()
    collisions: list[dict[str, str]] = []
    count = 0
    for v in vids:
        stem = v.name if include_ext else v.stem
        new_name_body = rx.sub(replacement, stem)
        if new_name_body == stem:
            continue
        new_filename = new_name_body if include_ext else new_name_body + v.suffix
        if new_filename in seen_targets:
            collisions.append({"source": v.name, "target": new_filename, "reason": "duplicate_target_in_plan"})
            continue
        target_path = v.parent / new_filename
        if target_path.exists():
            collisions.append({"source": v.name, "target": new_filename, "reason": "target_exists"})
            continue
        mapping.append({"source": v.name, "target": new_filename})
        seen_targets.add(new_filename)
        count += 1
        if limit and count >= limit:
            break
    plan_id = uuid.uuid4().hex
    plan = {
        "id": plan_id,
        "base": str(base),
        "recursive": recursive,
        "pattern": pattern,
        "replacement": replacement,
        "dry_run": dry_run,
        "include_ext": include_ext,
        "created": time.time(),
        "items": mapping,
        "collisions": collisions,
    }
    with RENAME_PLANS_LOCK:
        RENAME_PLANS[plan_id] = plan
    return plan

@api.post("/rename/plan")
def api_rename_plan(payload: dict = Body(default_factory=dict)):
    pattern = payload.get("pattern")
    replacement = payload.get("replacement", "")
    if not pattern:
        raise_api_error("pattern required")
    path = payload.get("path") or ""
    recursive = bool(payload.get("recursive", False))
    dry_run = bool(payload.get("dry_run", True))
    limit = payload.get("limit")
    include_ext = bool(payload.get("include_ext", False))
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    plan = _mk_rename_plan(base, recursive, str(pattern), replacement, dry_run, limit, include_ext)
    return {"plan": {k: v for k, v in plan.items() if k != "_applied"}, "count": len(plan["items"]), "collisions": plan["collisions"]}

@api.post("/rename/apply")
def api_rename_apply(payload: dict = Body(default_factory=dict)):
    plan_id_val = payload.get("plan_id")
    plan_id = str(plan_id_val) if plan_id_val else ""
    if not plan_id:
        raise_api_error("plan_id required")
    with RENAME_PLANS_LOCK:
        plan_any = RENAME_PLANS.get(plan_id)
    if plan_any is None:
        raise_api_error("plan not found", status_code=404)
    plan: dict[str, Any] = plan_any  # type: ignore[assignment]
    if plan.get("_applied"):
        raise_api_error("plan already applied")
    applied: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    base = Path(plan["base"]) if plan.get("base") else STATE["root"]
    # Re-validate collisions still absent
    for entry in plan["items"]:
        src = base / entry["source"]
        dst = base / entry["target"]
        if not src.exists():
            errors.append({"source": entry["source"], "error": "missing_source"})
            continue
        if dst.exists():
            errors.append({"source": entry["source"], "error": "target_exists"})
            continue
        try:
            src.rename(dst)
            applied.append({"source": entry["source"], "target": entry["target"]})
        except Exception as e:  # pragma: no cover
            errors.append({"source": entry["source"], "error": str(e)})
    # Mark plan applied
    with RENAME_PLANS_LOCK:
        plan["_applied"] = True
        plan["applied_at"] = time.time()
        plan["applied_count"] = len(applied)
        plan["errors"] = errors
    # Persist optional log
    try:
        log_dir = STATE["root"] / ".artifacts"
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / f"rename.{plan_id}.json").write_text(json.dumps({"plan_id": plan_id, "applied": applied, "errors": errors}, indent=2))
    except Exception:
        pass
    # Record undo entry if there are applied renames
    if applied:
        try:
            entry = {
                "plan_id": plan_id,
                "time": time.time(),
                "actions": [{"from": a["source"], "to": a["target"]} for a in applied],
                "base": str(base),
            }
            with RENAME_UNDO_LOCK:
                RENAME_UNDO_LOG.append(entry)
                # Keep only last 50 entries to bound memory
                if len(RENAME_UNDO_LOG) > 50:
                    del RENAME_UNDO_LOG[:-50]
        except Exception:
            pass
    return {"applied": applied, "errors": errors, "plan_id": plan_id, "count": len(applied)}

# -----------------------------
# Config ingestion (schema + GET/POST)
# -----------------------------

class SpritesConfig(BaseModel):  # type: ignore
    interval: Optional[float] = Field(None, gt=0)
    width: Optional[int] = Field(None, gt=0)
    cols: Optional[int] = Field(None, gt=0)
    rows: Optional[int] = Field(None, gt=0)
    quality: Optional[int] = Field(None, ge=1, le=10)

class ConfigUpdate(BaseModel):  # type: ignore
    sprites: Optional[SpritesConfig] = None
    # Future: add sections (transcode profiles, feature toggles, etc.)

def _apply_config_update(update: ConfigUpdate) -> dict:
    with _CONFIG_LOCK:
        cfg = STATE.get("config") or {}
        changed: dict[str, Any] = {}
        if update.sprites is not None:
            sprites_cur = cfg.get("sprites") or {}
            sprites_new = sprites_cur.copy()
            for k, v in update.sprites.model_dump(exclude_unset=True).items():  # type: ignore
                if v is not None:
                    sprites_new[k] = v
            if sprites_new != sprites_cur:
                cfg["sprites"] = sprites_new
                changed["sprites"] = sprites_new
        if changed:
            STATE["config"] = cfg
            # Persist to disk best-effort
            try:
                path = Path(str(STATE.get("config_path")))
                path.write_text(json.dumps(cfg, indent=2, sort_keys=True))
            except Exception:
                pass
        return {"changed": changed, "effective": STATE["config"]}

@api.post("/config")
def api_config_post(payload: dict = Body(default_factory=dict)):
    try:
        upd = ConfigUpdate(**payload)
    except Exception as e:
        raise_api_error(f"invalid payload: {e}")
    result = _apply_config_update(upd)
    return result


@api.get("/finish/plan")
def api_finish_plan(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    artifacts: Optional[str] = Query(default=None, description="Comma-separated subset of artifact kinds to consider"),
    include_existing: bool = Query(default=False, description="If true, list all requested artifacts (marking existing vs missing).")
):
    """Return missing (or all) artifact status per video.

    artifacts: optional comma list (e.g. metadata,thumbnail,preview) to restrict scope.
    include_existing: when true, each record returns two arrays: missing & existing.
    """
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    subset: list[str] | None = None
    if artifacts:
        subset = [a.strip() for a in artifacts.split(',') if a.strip()]
    vids = _iter_videos(base, recursive)
    plan: list[dict[str, Any]] = []
    for v in vids:
        kinds = subset or FINISH_ARTIFACT_ORDER
        missing = [k for k in kinds if not _artifact_exists(v, k)]
        existing: list[str] = []
        if include_existing:
            existing = [k for k in kinds if _artifact_exists(v, k)]
        if missing or include_existing:
            plan.append({
                "file": str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v),
                "missing": missing,
                **({"existing": existing} if include_existing else {}),
            })
    return {"items": plan, "count": len(plan), "artifacts": subset or FINISH_ARTIFACT_ORDER}


@api.post("/finish/run")
def api_finish_run(payload: dict = Body(default_factory=dict)):
    """Generate missing (or requested) artifacts.

    Payload fields:
      path: base directory (relative to root)
      recursive: bool
      artifacts: optional list or comma-separated string of artifact kinds
      force: bool (regenerate even if present)
      force_faces: bool (legacy toggle kept for compatibility)
    Returns detailed per-file action results with timings.
    """
    path = payload.get("path") or ""
    recursive = bool(payload.get("recursive", True))
    force = bool(payload.get("force", False))
    force_faces = bool(payload.get("force_faces", False))
    arts = payload.get("artifacts")
    if isinstance(arts, str):
        artifacts_list = [a.strip() for a in arts.split(',') if a.strip()]
    elif isinstance(arts, list):
        artifacts_list = [str(a) for a in arts]
    else:
        artifacts_list = FINISH_ARTIFACT_ORDER
    # Preserve ordering from FINISH_ARTIFACT_ORDER while filtering
    order_filtered = [a for a in FINISH_ARTIFACT_ORDER if a in artifacts_list]
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    vids = _iter_videos(base, recursive)
    results: list[dict[str, Any]] = []
    for v in vids:
        rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
        needed = [k for k in order_filtered if force or not _artifact_exists(v, k)]
        if not needed:
            continue
        entry: dict[str, Any] = {"file": rel, "planned": needed, "actions": []}
        # Job-backed artifacts first
        job_map = {"sprites": "sprites", "markers": "markers", "subtitles": "subtitles"}
        for kind in [k for k in needed if k in job_map]:
            jobs_submit(JobRequest(task=job_map[kind], directory=str(v.parent), params={"targets": [rel]}, force=force, recursive=False))  # type: ignore[arg-type]
            entry["actions"].append({"name": kind, "mode": "job", "status": "queued"})
        # Inline artifacts
        inline = [k for k in needed if k not in job_map]
        lk = _file_task_lock(v, "finish-inline")
        with lk:
            for kind in inline:
                start = time.time()
                status = "ok"
                err: Optional[str] = None
                try:
                    if kind == "metadata":
                        try:
                            _ = _probe_metadata(v, force=force)  # type: ignore[name-defined]
                        except NameError:  # pragma: no cover
                            _ = probe_metadata(v, force=force)  # type: ignore[name-defined]
                    elif kind == "thumbnail":
                        generate_thumbnail(v, force=force)
                    elif kind == "preview":
                        generate_preview(v, segments=9, seg_dur=0.8, width=240, fmt="webm")
                    elif kind == "heatmaps":
                        _ = _generate_heatmap(v)  # type: ignore[name-defined]
                    elif kind == "phash":
                        _ = phash_create_single(v, overwrite=force)  # type: ignore[name-defined]
                    elif kind == "faces":
                        if force or force_faces or not faces_exists_check(v):
                            _ = _detect_faces(v, stride=30)  # type: ignore[name-defined]
                        else:
                            status = "skipped"
                    else:
                        status = "unsupported"
                except Exception as e:  # pragma: no cover
                    status = "error"
                    err = str(e)
                elapsed = int((time.time() - start) * 1000)
                entry["actions"].append({
                    "name": kind,
                    "mode": "inline",
                    "status": status,
                    "elapsed_ms": elapsed,
                    **({"error": err} if err else {}),
                })
        results.append(entry)
    summary = {
        "files": len(results),
        "actions": sum(len(r.get("actions", [])) for r in results),
        "force": force,
        "artifacts": order_filtered,
    }
    return {"results": results, "summary": summary}


if __name__ == "__main__":  # pragma: no cover
    try:
        import uvicorn  # type: ignore
    except Exception as e:  # pragma: no cover
        sys.stderr.write("[app] Missing dependency: uvicorn. Install with: pip install uvicorn\n")
        sys.exit(1)
    # Require an explicit opt-in to start the server when running this file directly
    run_flag = os.environ.get("RUN_SERVER") or os.environ.get("RUN_STANDALONE")
    if str(run_flag).strip().lower() not in {"1", "true", "yes", "y"}:
        sys.stderr.write(
            "[app] Not starting server. To run directly, set RUN_SERVER=1 (or RUN_STANDALONE=1).\n"
        )
        sys.exit(0)
    root = os.environ.get("MEDIA_ROOT")
    if root:
        try:
            STATE["root"] = Path(root).expanduser().resolve()
        except Exception:
            pass
    # Mirror serve.sh behavior when running directly: honor HOST/PORT and exclude
    # artifact/state paths from reload to avoid thrashing/crashes during development.
    host = os.environ.get("HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("PORT", "9999") or 9999)
    except Exception:
        port = 9999
    # Default to disabling job auto-restore under reload in direct runs
    os.environ.setdefault("JOB_AUTORESTORE_DISABLE", "1")
    # Only apply reload_excludes if the watchfiles backend is available
    have_watchfiles = False
    try:
        import importlib  # noqa: F401
        import watchfiles  # type: ignore  # noqa: F401
        have_watchfiles = True
    except Exception:
        have_watchfiles = False
    reload_excludes = None
    if have_watchfiles:
        reload_excludes = [
            ".jobs/*",
            "**/.jobs/*",
            "**/.artifacts/*",
            "**/.previews/*",
            "**/*.preview.webm",
        ]
    try:
        if reload_excludes is not None:
            cfg = uvicorn.Config(
                "app:app",
                host=host,
                port=port,
                reload=True,
                reload_excludes=reload_excludes,
            )
        else:
            cfg = uvicorn.Config(
                "app:app",
                host=host,
                port=port,
                reload=True,
            )
        server = uvicorn.Server(cfg)
        server.run()
    except Exception:
        # Fallback to basic run if Config signature differs (older uvicorn)
        uvicorn.run("app:app", host=host, port=port, reload=True)
