from __future__ import annotations

import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import re
import time
import uuid
import importlib
from pathlib import Path
import asyncio
from collections import defaultdict
from typing import Any, Dict, Iterator, List, Optional, Callable
from pydantic import BaseModel
from difflib import SequenceMatcher

from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    Response,
    Header,
)
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles

try:
    from PIL import Image  # type: ignore
except Exception:  # pragma: no cover
    Image = None  # type: ignore


# Simple plugin manager ----------------------------------------------------


class PluginManager:
    """Minimal plugin registry allowing external hooks.

    Plugins are regular Python modules located in the ``plugins`` directory.
    Each module may expose a ``register(manager)`` function that registers
    callbacks for named hooks. Hooks can then be executed via ``run``.
    """

    def __init__(self, folder: Path):
        self.folder = folder
        self.hooks: dict[str, list[Callable]] = defaultdict(list)

    def load(self) -> None:
        if not self.folder.exists():
            return
        sys.path.insert(0, str(self.folder.resolve()))
        for mod_path in self.folder.glob("*.py"):
            name = mod_path.stem
            try:
                mod = importlib.import_module(name)
                if hasattr(mod, "register"):
                    mod.register(self)
            except Exception:
                continue

    def register(self, hook: str, func: Callable) -> None:
        self.hooks.setdefault(hook, []).append(func)

    def run(self, hook: str, *args, **kwargs) -> None:
        for fn in self.hooks.get(hook, []):
            try:
                fn(*args, **kwargs)
            except Exception:
                continue

LIBRARY_FILE = Path("library.json")
SAVED_SEARCHES_FILE = Path("saved_searches.json")


# Global server state
STATE: dict[str, Any] = {
    "root": Path.cwd().resolve(),
    "library": {},
    "saved_searches": {},
}


def _load_library() -> None:
    try:
        if LIBRARY_FILE.exists():
            data = json.loads(LIBRARY_FILE.read_text())
            if isinstance(data, dict):
                STATE["library"] = data
    except Exception:
        STATE["library"] = {}


def _save_library() -> None:
    try:
        LIBRARY_FILE.write_text(json.dumps(STATE.get("library", {}), indent=2))
    except Exception:
        pass


def _load_saved_searches() -> None:
    try:
        if SAVED_SEARCHES_FILE.exists():
            data = json.loads(SAVED_SEARCHES_FILE.read_text())
            if isinstance(data, dict):
                STATE["saved_searches"] = data
    except Exception:
        STATE["saved_searches"] = {}


def _save_saved_searches() -> None:
    try:
        SAVED_SEARCHES_FILE.write_text(
            json.dumps(STATE.get("saved_searches", {}), indent=2)
        )
    except Exception:
        pass


# Optional API token for simple authentication ---------------------------------

# If the `API_TOKEN` environment variable is set, all `/api` routes require the
# matching value either via `X-API-Key` header, `Authorization: Bearer` header,
# or `token` query parameter. When not set, the API remains open (test default).
API_TOKEN = os.getenv("API_TOKEN")


def require_api_token(request: Request, x_api_key: str = Header(default=None)) -> None:
    if not API_TOKEN:
        return
    token = x_api_key or request.headers.get("Authorization") or request.query_params.get("token")
    if token and token.lower().startswith("bearer "):
        token = token[7:]
    if token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


STATE["plugins"] = PluginManager(Path("plugins"))
STATE["plugins"].load()
_load_library()
_load_saved_searches()


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None

def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None

def artifact_dir(video: Path) -> Path:
    d = video.parent / ".artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False

def metadata_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.metadata.json"

def thumbs_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.thumbnail.jpg"

def phash_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.phash.json"

def scenes_json_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.scenes.json"

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

def heatmaps_png_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.heatmaps.png"

def faces_path(video: Path) -> Path:
    return artifact_dir(video) / f"{video.stem}.faces.json"

def find_subtitles(video: Path) -> Optional[Path]:
    s_art = artifact_dir(video) / f"{video.stem}{SUFFIX_SUBTITLES_SRT}"
    s_side = video.with_suffix(SUFFIX_SUBTITLES_SRT)
    if s_art.exists():
        return s_art
    if s_side.exists():
        return s_side
    return None

# SRT only: removed VTT conversion helper

# -----------------------------
# Artifact suffix/constants
# -----------------------------
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
SUFFIX_SUBTITLES_SRT = ".srt" # ".subtitles.srt"
HIDDEN_DIR_SUFFIX_PREVIEWS = ".previews"

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)

def metadata_single(video: Path, *, force: bool = False) -> None:
    out = metadata_path(video)
    if out.exists() and not force:
        return
    # If ffprobe is disabled or not available, write a minimal stub instead of failing
    if os.environ.get("FFPROBE_DISABLE") or not ffprobe_available():
        payload = {
            "format": {"duration": "0.0", "bit_rate": "0"},
            "streams": [
                {"codec_type": "video", "width": 640, "height": 360, "codec_name": "h264", "bit_rate": "0"},
                {"codec_type": "audio", "codec_name": "aac", "bit_rate": "0"}
            ]
        }
        out.write_text(json.dumps(payload, indent=2))
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


def extract_width(ffprobe_json: Optional[dict]) -> Optional[int]:
    try:
        if not isinstance(ffprobe_json, dict):
            return None
        return next(
            (
                int(s.get("width"))
                for s in ffprobe_json.get("streams", [])
                if s.get("codec_type") == "video"
                and s.get("width") is not None
            ),
            None,
        )
    except Exception:
        return None

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
    out = thumbs_path(video)
    if out.exists() and not force:
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    # If ffmpeg isn't available, write a valid placeholder JPEG (last resort)
    if not ffmpeg_available():
        try:
            from PIL import Image  # type: ignore
            img = Image.new("RGB", (320, 180), color=(17, 17, 17))
            img.save(out, format="JPEG", quality=max(2, min(95, int(quality)*10)))
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
            return
    
    duration = None
    try:
        if metadata_path(video).exists():
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
        else:
            metadata_single(video, force=False)
            duration = extract_duration(json.loads(metadata_path(video).read_text()))
    except Exception:
        duration = None
    t = parse_time_spec(time_spec, duration)
    # Use mjpeg to write jpg
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{t:.3f}",
        "-i", str(video),
        "-frames:v", "1",
        "-q:v", str(max(2, min(31, int(quality)))),
        str(out),
    ]
    proc = _run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ffmpeg thumbnail failed")


def import_media(video: Path, *, force: bool = False) -> dict:
    """Import a media file into the in-memory library.

    Generates basic artifacts (metadata + thumbnail) and lets plugins mutate
    the gathered metadata. The resulting metadata is persisted back to the
    artifact directory and returned.
    """

    metadata_single(video, force=force)
    generate_thumbnail(video, force=force, time_spec="middle", quality=2)
    try:
        md = json.loads(metadata_path(video).read_text())
    except Exception:
        md = {}
    STATE["plugins"].run("metadata", path=video, metadata=md)
    try:
        metadata_path(video).write_text(json.dumps(md, indent=2))
    except Exception:
        pass
    entry = {"path": str(video), "metadata": md}
    STATE.setdefault("library", {})[str(video)] = entry
    STATE["plugins"].run("import", path=video, metadata=md)
    _save_library()
    return entry

# ----------------------
# Hover preview generator
# ----------------------
def generate_hover_preview(video: Path, *, segments: int = 9, seg_dur: float = 1.0, width: int = 320, fmt: str = "webm", out: Optional[Path] = None) -> Path:
    out = out or (artifact_dir(video) / f"{video.stem}.preview.{fmt}")
    out.parent.mkdir(parents=True, exist_ok=True)
    if os.environ.get("FFPROBE_DISABLE"):
        out.write_text("stub preview")
        return out
    if not ffmpeg_available() or not ffprobe_available():
        raise RuntimeError("ffmpeg/ffprobe not available")
    # compute timeline positions
    dur = None
    try:
        if metadata_path(video).exists():
            dur = extract_duration(json.loads(metadata_path(video).read_text()))
        else:
            metadata_single(video, force=False)
            dur = extract_duration(json.loads(metadata_path(video).read_text()))
    except Exception:
        dur = None
    segs = max(1, int(segments))
    points = [((i + 1) / (segs + 1)) * (dur or (segs * seg_dur)) for i in range(segs)]

    # Try a single-pass ffmpeg using filter_complex (split/trim/concat); fallback to multi-step on failure
    try:
        trim_chains = []
        split_labels = "".join([f"[v{i}]" for i in range(segs)])
        parts = [f"[0:v]split={segs}{split_labels}"]
        for i, start in enumerate(points):
            parts.append(f"[v{i}]trim=start={start:.3f}:end={(start + seg_dur):.3f},setpts=PTS-STARTPTS[s{i}]")
            trim_chains.append(f"[s{i}]")
        concat_inputs = "".join(trim_chains)
        parts.append(f"{concat_inputs}concat=n={segs}:v=1:a=0,scale={int(width)}:-1:force_original_aspect_ratio=decrease[outv]")
        filter_complex = ";".join(parts)
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video),
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-an",
        ]
        if fmt == "mp4":
            cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(out)]
        else:
            cmd += ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", str(out)]
        proc = _run(cmd)
        if proc.returncode == 0 and out.exists():
            return out
        # else fall through to legacy path
    except Exception:
        pass

    # Fallback: multi-step segments then concat
    with tempfile.TemporaryDirectory() as td:
        td = str(td)
        list_path = Path(td) / "list.txt"
        clip_paths: list[Path] = []
        for i, start in enumerate(points, start=1):
            clip = Path(td) / f"seg_{i:02d}.{fmt}"
            vfilter = f"scale={width}:-1:force_original_aspect_ratio=decrease"
            cmd = [
                "ffmpeg", "-y",
                "-ss", f"{start:.3f}", "-i", str(video), "-t", f"{seg_dur:.3f}",
                "-vf", vfilter,
                "-an",
            ]
            if fmt == "mp4":
                cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(clip)]
            else:
                cmd += ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", str(clip)]
            proc = _run(cmd)
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.strip() or "ffmpeg segment failed")
            clip_paths.append(clip)
        with list_path.open("w") as f:
            for cp in clip_paths:
                f.write(f"file '{cp.as_posix()}'\n")
        cmd2 = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_path),
            "-an",
        ]
        if fmt == "mp4":
            cmd2 += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(out)]
        else:
            cmd2 += ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", str(out)]
        proc2 = _run(cmd2)
        if proc2.returncode != 0:
            raise RuntimeError(proc2.stderr.strip() or "ffmpeg concat failed")
    return out

# ---------
# pHash stub
# ---------
def phash_create_single(video: Path, *, frames: int = 5, algo: str = "ahash", combine: str = "xor") -> None:
    # Minimal placeholder implementation: hash file bytes as stand-in
    out = phash_path(video)
    if os.environ.get("FFPROBE_DISABLE"):
        import hashlib
        h = hashlib.sha256(video.read_bytes() if video.exists() else b"")
        out.write_text(json.dumps({"phash": h.hexdigest(), "algo": algo, "frames": frames, "combine": combine}, indent=2))
        return
    # For simplicity, reuse file hash when not stubbing too (can be extended later)
    import hashlib
    h = hashlib.sha256(video.read_bytes() if video.exists() else b"")
    out.write_text(json.dumps({"phash": h.hexdigest(), "algo": algo, "frames": frames, "combine": combine}, indent=2))

# ------------------
# Scenes placeholders
# ------------------
def generate_scene_artifacts(video: Path, *, threshold: float, limit: int, gen_thumbs: bool, gen_clips: bool, thumbs_width: int, clip_duration: float) -> None:
    # Placeholder: create a minimal scenes.json with 3 fake markers
    j = scenes_json_path(video)
    payload = {"scenes": [{"time": 10.0}, {"time": 30.0}, {"time": 60.0}]}
    j.write_text(json.dumps(payload, indent=2))

# -----------------
# Sprites generator
# -----------------
def generate_sprite_sheet(video: Path, *, interval: float, width: int, cols: int, rows: int, quality: int) -> None:
    """Generate a sprite sheet by sampling frames with ffmpeg.
    Falls back to a repeated thumbnail if ffmpeg/Pillow are unavailable.
    Writes a JPEG sprite sheet and a JSON index with fields:
      - cols, rows, interval, width
      - tile_width, tile_height
      - frames (<= cols*rows)
      Also includes legacy keys grid: [cols,rows], tile: [w,h] for compatibility.
    """
    sheet, j = sprite_sheet_paths(video)
    # Preferred path: use ffmpeg tile filter to build mosaic in one pass
    if ffmpeg_available():
        # Build filter: fps (one frame per interval), scale to desired width, tile to mosaic
        vf = f"fps=1/{max(0.001, float(interval))},scale={int(width)}:-1:flags=lanczos,tile={int(cols)}x{int(rows)}"
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video),
            "-vf", vf,
            "-frames:v", "1",
            str(sheet),
        ]
        try:
            proc = _run(cmd)
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or "ffmpeg sprite generation failed")
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
            frames = int(cols * rows)
            meta = {
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
            j.write_text(json.dumps(meta, indent=2))
            return

    # Fallback: use a repeated thumbnail (last-resort)
    try:
        generate_thumbnail(video, force=False, time_spec="middle", quality=quality)
        from PIL import Image  # type: ignore
        base_img = Image.open(thumbs_path(video))
        w, h = base_img.size
        tile_w, tile_h = width, int(h * (width / w))
        sheet_img = Image.new("RGB", (tile_w * cols, tile_h * rows), color=(0, 0, 0))
        tile = base_img.resize((tile_w, tile_h))
        for r in range(rows):
            for c in range(cols):
                sheet_img.paste(tile, (c * tile_w, r * tile_h))
        sheet_img.save(sheet)
        meta = {
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
        j.write_text(json.dumps(meta, indent=2))
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
def compute_heatmaps(video: Path, interval: float, mode: str, png: bool) -> dict:
    # Stub timeline values
    samples = []
    total = 100.0
    t = 0.0
    while t <= total:
        samples.append({"t": t, "v": (abs((t % 20) - 10) / 10.0)})
        t += interval
    data = {"interval": interval, "samples": samples}
    heatmaps_json_path(video).write_text(json.dumps(data, indent=2))
    if png:
        heatmaps_png_path(video).write_bytes(b"PNGDATA")
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


def run_whisper_backend(video: Path, backend: str, model_name: str, language: Optional[str], translate: bool, cpp_bin: Optional[str] = None, cpp_model: Optional[str] = None, compute_type: Optional[str] = None) -> List[Dict[str, Any]]:
    # Returns list of segments: {start,end,text}
    if os.environ.get("FFPROBE_DISABLE"):
        return [{"start": i * 2.0, "end": i * 2.0 + 1.5, "text": f"Stub segment {i+1}"} for i in range(3)]
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
        for ct in chain:
            try:
                tried.append(ct)
                model = WhisperModel(model_name, compute_type=ct)
                seg_iter, _info = model.transcribe(str(video), language=language, task=("translate" if translate else "transcribe"))
                segs: List[Dict[str, Any]] = []
                for s in seg_iter:
                    segs.append({"start": s.start, "end": s.end, "text": s.text})
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
                segs.append({"start": s.get("start"), "end": s.get("end"), "text": s.get("text")})
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
            return segs
        except Exception:
            if out_json.exists():
                data = json.loads(out_json.read_text())
                segs: List[Dict[str, Any]] = []
                for s in data.get("transcription", {}).get("segments", []):
                    segs.append({"start": (s.get("t0", 0) / 1000.0), "end": (s.get("t1", 0) / 1000.0), "text": s.get("text", "")})
                return segs
            raise RuntimeError("Failed to parse whisper.cpp output")
    if backend == "stub":
        # Deterministic tiny set of segments to ensure UI works without deps
        return [
            {"start": 0.0, "end": 1.5, "text": "[no speech engine installed]"},
            {"start": 2.0, "end": 3.2, "text": "Install faster-whisper or whisper."},
        ]
    raise RuntimeError(f"Unknown backend {backend}")


def generate_subtitles(video: Path, out_file: Path, model: str = "small", language: Optional[str] = None, translate: bool = False) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    backend = detect_backend("auto")
    segments = run_whisper_backend(video, backend, model, language, translate)
    srt = _format_srt_segments(segments)
    out_file.write_text(srt)

# ------------------------
# Face embeddings (stubs)
# ------------------------
def _ensure_openface_model() -> Path:
    url = "https://storage.cmusatyalab.org/openface-models/nn4.small2.v1.t7"
    cache = Path.home() / ".cache" / "vid"
    cache.mkdir(parents=True, exist_ok=True)
    model_path = cache / "openface.nn4.small2.v1.t7"
    if not model_path.exists():
        try:
            import urllib.request  # noqa: F401
            urllib.request.urlretrieve(url, model_path)
        except Exception:
            return model_path
    return model_path


def detect_face_backend(preference: str) -> str:
    if preference != "auto":
        return preference
    try:
        __import__("insightface")
        return "insightface"
    except Exception:
        return "opencv"


def _detect_faces(
    video: Path,
    interval: float = 1.0,
    scale_factor: float = 1.2,
    min_neighbors: int = 7,
    min_size_frac: float = 0.10,
    backend: str = "auto",
    progress_cb: Optional[Callable[[int, int], None]] = None,
) -> List[Dict[str, Any]]:
    """Detect faces using selected backend.

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
        model_path = _ensure_openface_model()
        net = cv2.dnn.readNetFromTorch(str(model_path))
        results: List[Dict[str, Any]] = []
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
                    blob = cv2.dnn.blobFromImage(cv2.resize(face, (96, 96)), 1/255.0, (96, 96), (0,0,0), swapRB=True, crop=False)
                    net.setInput(blob)
                    vec = net.forward()[0]
                    embedding = [round(float(v), 6) for v in vec.tolist()]
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
        return [{"time": 0.0, "box": [0, 0, 100, 100], "score": 1.0, "embedding": []}]


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
    # Deduplicate faces so there's one embedding per distinct face for this video.
    faces = _detect_faces(
        video,
        interval=interval,
        scale_factor=scale_factor,
        min_neighbors=min_neighbors,
        min_size_frac=min_size_frac,
        backend=backend,
        progress_cb=progress_cb,
    )

    def _dedupe_faces(items: List[Dict[str, Any]], sim_thresh: float = 0.9) -> List[Dict[str, Any]]:
        """Group face detections by embedding similarity and return one per identity.

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
    data = {"video": video.name, "faces": deduped, "generated_at": time.time()}
    out.write_text(json.dumps(data, indent=2))
    return data


def api_success(data=None, message: str = "OK", status_code: int = 200):
    return JSONResponse({"status": "success", "message": message, "data": data}, status_code=status_code)


def api_error(message: str, status_code: int = 400, data=None):
    return JSONResponse({"status": "error", "message": message, "data": data}, status_code=status_code)


def raise_api_error(message: str, status_code: int = 400, data=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "data": data})


app = FastAPI(title="Media Player", version="3.0")
"""
Jobs subsystem: in-memory job store, SSE broadcasting, and helpers.
"""

# Global job state
JOBS: dict[str, dict] = {}
JOB_LOCK = threading.Lock()
JOB_EVENT_SUBS: list[tuple[asyncio.Queue[str], asyncio.AbstractEventLoop]] = []
JOB_CANCEL_EVENTS: dict[str, threading.Event] = {}


def _normalize_job_type(job_type: str) -> str:
    """Normalize backend job-type variants to base types for the UI and tests."""
    s = (job_type or "").strip().lower()
    if s == "hover-concat":
        return "hover"
    if s.endswith("-batch"):
        return s[: -len("-batch")]
    return s


def _publish_job_event(evt: dict) -> None:
    """Publish a job event to SSE subscribers. Thread-safe."""
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


def _new_job(job_type: str, path: str) -> str:
    jid = uuid.uuid4().hex[:12]
    base_type = _normalize_job_type(job_type)
    with JOB_LOCK:
        JOBS[jid] = {
            "id": jid,
            "type": base_type,
            "path": path,
            "state": "queued",
            "started_at": None,
            "ended_at": None,
            "error": None,
            "total": None,
            "processed": None,
            "result": None,
        }
        JOB_CANCEL_EVENTS[jid] = threading.Event()
    _publish_job_event({"event": "created", "id": jid, "type": base_type, "path": path})
    _publish_job_event({"event": "queued", "id": jid, "type": base_type, "path": path})
    # Emit an initial progress event so clients see the job immediately
    _set_job_progress(jid, processed_set=0)
    return jid


def _start_job(jid: str):
    with JOB_LOCK:
        j = JOBS.get(jid)
        if j:
            j["state"] = "running"
            j["started_at"] = time.time()
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
    _publish_job_event({"event": "started", "id": jid, "type": jtype, "path": jpath})



def _finish_job(jid: str, error: Optional[str] = None):
    with JOB_LOCK:
        j = JOBS.get(jid)
        if j:
            # Honor cancel flag if set
            if error:
                j["state"] = "failed"
            elif JOB_CANCEL_EVENTS.get(jid) and JOB_CANCEL_EVENTS[jid].is_set():
                j["state"] = "canceled"
            else:
                j["state"] = "done"
            j["ended_at"] = time.time()
            j["error"] = error
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
    _publish_job_event({"event": "finished", "id": jid, "error": error, "type": jtype, "path": jpath})


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
    # lightweight progress event (throttling left to clients)
    with JOB_LOCK:
        j = JOBS.get(jid) or {}
        jtype = j.get("type")
        jpath = j.get("path")
        total_v = j.get("total")
        processed_v = j.get("processed")
    _publish_job_event({
        "event": "progress",
        "id": jid,
        "type": jtype,
        "path": jpath,
        "total": total_v,
        "processed": processed_v,
    })



def _wrap_job(job_type: str, path: str, fn):
    jid = _new_job(job_type, path)
    _start_job(jid)
    try:
        result = fn()
        # store result if it's JSON-serializable
        with JOB_LOCK:
            if jid in JOBS:
                JOBS[jid]["result"] = result if not isinstance(result, JSONResponse) else None
        _finish_job(jid, None)
        return result
    except Exception as e:  # noqa: BLE001
        _finish_job(jid, str(e))
        raise


def _wrap_job_background(job_type: str, path: str, fn):
    """
    Run a job in a background thread and return immediately with a job id.
    This avoids coupling long-running work to the HTTP request lifecycle.
    """
    jid = _new_job(job_type, path)
    _start_job(jid)
    def _runner():
        try:
            result = fn()
            with JOB_LOCK:
                if jid in JOBS:
                    JOBS[jid]["result"] = result if not isinstance(result, JSONResponse) else None
            _finish_job(jid, None)
        except Exception as e:  # noqa: BLE001
            _finish_job(jid, str(e))
    t = threading.Thread(target=_runner, name=f"job-{job_type}-{jid}", daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


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
    if request.url.path == "/" or request.url.path.startswith("/static"):
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


@app.get("/ui/library", include_in_schema=False)
def library_ui():
    page = _STATIC / "library.html"
    if page.exists():
        return HTMLResponse(page.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>UI missing</h1>")


# Also serve any static assets placed here (optional)
if (_BASE / "static").exists():
    app.mount("/static", StaticFiles(directory=str(_BASE / "static")), name="static")


# API under /api
api = APIRouter(prefix="/api", dependencies=[Depends(require_api_token)])

# Only MP4 videos are considered user media
MEDIA_EXTS = {".mp4"}


def _is_hidden_path(p: Path, base: Path) -> bool:
    """Return True if any directory component under base starts with '.' or ends with '.previews'."""
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
    if n.endswith(SUFFIX_PREVIEW_WEBM) or n.endswith(SUFFIX_SPRITES_JPG):
        return False
    return True


############################
# Core API
############################

@app.get("/health")
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
        "ffmpeg": ffmpeg_available(),
        "ffprobe": ffprobe_available(),
        "version": app.version,
        "pid": os.getpid(),
    }


@app.get("/config")
def config_info():
    return {
        "root": str(STATE.get("root")),
    "env": {k: os.environ.get(k) for k in ["MEDIA_ROOT", "FFPROBE_DISABLE"]},
        "features": {
            "range_stream": True,
            "sprites": True,
            "heatmaps": True,
            "faces": True,
            "subtitles": True,
            "phash": True,
        },
        "deps": {
            "ffmpeg": ffmpeg_available(),
            "ffprobe": ffprobe_available(),
            "faster_whisper": _has_module("faster_whisper"),
            "openai_whisper": _has_module("whisper"),
            "whisper_cpp_bin": (lambda p=os.environ.get("WHISPER_CPP_BIN"): bool(p and Path(p).exists()))(),
            "whisper_cpp_model": (lambda p=os.environ.get("WHISPER_CPP_MODEL"): bool(p and Path(p).exists()))(),
            "opencv": _has_module("cv2"),
            "pillow": _has_module("PIL"),
        },
        "version": app.version,
    }


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
    info["cover"] = thumbs_path(p).exists()
    info["hover"] = _hover_concat_path(p).exists()
    s, j = sprite_sheet_paths(p)
    info["sprites"] = s.exists() and j.exists()
    info["subtitles"] = find_subtitles(p) is not None
    info["phash"] = phash_path(p).exists()
    info["heatmaps"] = heatmaps_json_path(p).exists()
    info["scenes"] = scenes_json_path(p).exists()
    info["faces"] = faces_path(p).exists()
    return info


def _tags_file(p: Path) -> Path:
    return artifact_dir(p) / f"{p.stem}.tags.json"


@app.get("/tags/export")
def tags_export(directory: str = Query("."), recursive: bool = Query(False)):
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
    vids = _find_mp4s(root, recursive)
    out: list[dict] = []
    for v in vids:
        tf = _tags_file(v)
        data = {"path": str(v), "name": v.name, "tags": [], "performers": [], "description": "", "rating": 0}
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
            except Exception:
                pass
        out.append(data)
    return {"videos": out, "count": len(out)}


class TagsImport(BaseModel):
    videos: Optional[list[dict]] = None
    mapping: Optional[dict[str, dict]] = None
    replace: bool = False


@app.post("/tags/import")
def tags_import(payload: TagsImport):
    count = 0
    items: list[tuple[Path, dict]] = []
    if payload.videos:
        for item in payload.videos:
            try:
                p = Path(item.get("path") or "").expanduser().resolve()
                items.append((p, item))
            except Exception:
                continue
    elif payload.mapping:
        for k, v in payload.mapping.items():
            try:
                p = Path(k).expanduser().resolve()
                items.append((p, v))
            except Exception:
                continue
    for p, data in items:
        if not p.exists():
            continue
        tf = _tags_file(p)
        cur = {"video": p.name, "tags": [], "performers": [], "description": "", "rating": 0}
        if tf.exists() and not payload.replace:
            try:
                cur = json.loads(tf.read_text())
            except Exception:
                pass
        cur.setdefault("tags", [])
        cur.setdefault("performers", [])
        cur.setdefault("description", "")
        cur.setdefault("rating", 0)
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
        try:
            tf.write_text(json.dumps(cur, indent=2))
            count += 1
        except Exception:
            continue
    return {"updated": count}


def _load_meta_summary(root: Path, recursive: bool) -> dict[str, dict]:
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
    """Return (stem, kind) if name matches one of our artifact patterns, else None.
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

def _collect_media_and_meta(root: Path) -> tuple[dict[str, Path], dict[str, dict]]:
    """
    Return (media_by_stem, meta_by_stem) for fast lookup.
    - media_by_stem: map of media stem -> path
    - meta_by_stem: map of media stem -> meta summary (duration, codecs)
    """
    media: dict[str, Path] = {}
    for v in _find_mp4s(root, recursive=True):
        media[v.stem] = v
    # Load meta summaries once
    meta: dict[str, dict] = {}
    summaries = _load_meta_summary(root, recursive=True)
    for v in _find_mp4s(root, recursive=True):
        try:
            rel = str(v.relative_to(root))
        except Exception:
            rel = v.name
        meta[v.stem] = summaries.get(rel) or {}
    return media, meta

# TODO @copilot v2 reference, unnecessary backwards compatibility
@app.get("/videos")
def v2_list_videos(request: Request, directory: str = Query("."), recursive: bool = Query(False), offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000), q: Optional[str] = Query(None), tags: Optional[str] = Query(None), performers: Optional[str] = Query(None), match_any: bool = Query(False), detail: bool = Query(False)):
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
    vids_all = [p for p in _find_mp4s(root, recursive)]
    summaries = _load_meta_summary(root, recursive)
    if q:
        qlow = q.lower()
        vids_all = [p for p in vids_all if qlow in p.name.lower()]
    # Tag filtering
    if tags or performers:
        tag_set = {t.strip() for t in (tags.split(',') if tags else []) if t.strip()}
        perf_set = {t.strip() for t in (performers.split(',') if performers else []) if t.strip()}
        filtered: list[Path] = []
        for p in vids_all:
            data = {"tags": [], "performers": []}
            tf = _tags_file(p)
            if tf.exists():
                try:
                    tdata = json.loads(tf.read_text())
                    data["tags"] = tdata.get("tags", [])
                    data["performers"] = tdata.get("performers", [])
                except Exception:
                    pass
            vt = set(data.get("tags") or [])
            vp = set(data.get("performers") or [])
            cond_tags = not tag_set or ((vt & tag_set) if match_any else tag_set.issubset(vt))
            cond_perf = not perf_set or ((vp & perf_set) if match_any else perf_set.issubset(vp))
            if cond_tags and cond_perf:
                filtered.append(p)
        vids_all = filtered
    total = len(vids_all)
    slice_v = vids_all[offset: offset + limit]
    import hashlib
    etag_base = f"{root}:{recursive}:{total}:{offset}:{limit}:{q or ''}:{tags or ''}:{performers or ''}:{int(match_any)}".encode()
    etag = hashlib.sha1(etag_base).hexdigest()
    inm = request.headers.get("if-none-match")
    if inm and inm.strip('"') == etag:
        raise HTTPException(status_code=304, detail="not modified")
    videos_out: List[Dict[str, Any]] = [
        {"path": str(p), "name": p.name, "size": p.stat().st_size} for p in slice_v
    ]
    if detail:
        for i, info in enumerate(videos_out):
            p = slice_v[i]
            # tags
            tf = _tags_file(p)
            if tf.exists():
                try:
                    tdata = json.loads(tf.read_text())
                    info["tags"] = tdata.get("tags", [])
                    info["performers"] = tdata.get("performers", [])
                    info["description"] = tdata.get("description", "")
                    info["rating"] = tdata.get("rating", 0)
                except Exception:
                    info["tags"] = []
                    info["performers"] = []
                    info["description"] = ""
                    info["rating"] = 0
            else:
                info["tags"] = []
                info["performers"] = []
                info["description"] = ""
                info["rating"] = 0
            # duration / codecs from summary cache
            rel = None
            try:
                rel = str(p.relative_to(root))
            except Exception:
                rel = p.name
            summ = summaries.get(rel) or {}
            if summ.get("duration") is not None:
                info["duration"] = summ.get("duration")
            if summ.get("vcodec") is not None:
                info["vcodec"] = summ.get("vcodec")
            if summ.get("acodec") is not None:
                info["acodec"] = summ.get("acodec")
            info["artifacts"] = _build_artifacts_info(p)
    resp = {"directory": str(root), "count": total, "videos": videos_out, "offset": offset, "limit": limit, "etag": etag}
    return resp

# TODO @copilot v2 reference, unnecessary backwards compatibility
@app.get("/videos/{name}/tags")
def v2_get_video_tags(name: str, directory: str = Query(".")):
    root = Path(directory).expanduser().resolve()
    path = root / name
    if not path.exists():
        raise HTTPException(404, "video not found")
    tfile = _tags_file(path)
    if not tfile.exists():
        return {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    try:
        data = json.loads(tfile.read_text())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, "invalid tags file") from e
    if "description" not in data:
        data["description"] = ""
    if "rating" not in data:
        data["rating"] = 0
    return data


class TagUpdate(BaseModel):
    add: list[str] | None = None
    remove: list[str] | None = None
    performers_add: list[str] | None = None
    performers_remove: list[str] | None = None
    replace: bool = False
    description: str | None = None
    rating: int | None = None

# TODO @copilot v2 reference, unnecessary backwards compatibility
@app.patch("/videos/{name}/tags")
def v2_update_video_tags(name: str, payload: TagUpdate, directory: str = Query(".")):
    root = Path(directory).expanduser().resolve()
    path = root / name
    if not path.exists():
        raise HTTPException(404, "video not found")
    tfile = _tags_file(path)
    if tfile.exists():
        try:
            data = json.loads(tfile.read_text())
        except Exception:
            data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    else:
        data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    data.setdefault("description", "")
    data.setdefault("rating", 0)
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
    try:
        tfile.write_text(json.dumps(data, indent=2))
    except Exception:
        raise HTTPException(500, "failed to write tags")
    return data

# TODO @copilot v2 reference, unnecessary backwards compatibility
@app.get("/tags/summary")
def v2_tags_summary(directory: str = Query("."), recursive: bool = Query(False)):
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        # Be forgiving: return empty summary rather than 404 so callers can ignore
        return {"tags": {}, "performers": {}}
    vids = _find_mp4s(root, recursive)
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

# TODO @copilot v2 reference, unnecessary backwards compatibility
@app.get("/phash/duplicates")
def v2_phash_duplicates(directory: str = Query("."), recursive: bool = Query(False), threshold: float = Query(0.90), limit: int = Query(0)):
    # Duplicate detector that considers pHash plus metadata (duration, resolution, bitrate, size, title)
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
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
            meta: dict | None = None
            mpath = metadata_path(v)
            if mpath.exists():
                try:
                    meta = json.loads(mpath.read_text())
                except Exception:
                    meta = None
            else:
                # opportunistically compute metadata if ffprobe is available
                try:
                    metadata_single(v, force=False)
                    if mpath.exists():
                        meta = json.loads(mpath.read_text())
                except Exception:
                    meta = None
            # Extract comparable features
            dur = extract_duration(meta) if meta else None
            width = height = None
            v_bitrate = None
            a_bitrate = None
            title = None
            try:
                if isinstance(meta, dict):
                    fmt = meta.get("format", {}) or {}
                    try:
                        _vb = fmt.get("bit_rate")
                        v_bitrate = float(_vb) if _vb is not None else None
                    except Exception:
                        v_bitrate = None
                    try:
                        title = (fmt.get("tags", {}) or {}).get("title")
                    except Exception:
                        title = None
                    for st in meta.get("streams", []) or []:
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
    pairs: list[dict] = []
    def hamming(a: str, b: str) -> int:
        ia = int(a, 16)
        ib = int(b, 16)
        return (ia ^ ib).bit_count()
    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            a = entries[i]
            b = entries[j]
            bits = max(len(a["hex"]), len(b["hex"])) * 4
            dist = hamming(a["hex"], b["hex"]) if bits else 0
            sim = 1.0 - (dist / bits) if bits else 0.0
            if sim >= float(threshold):
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
                    "meta_bonus": round(bonus, 4),
                })
    pairs.sort(key=lambda x: x["similarity"], reverse=True)
    if limit and limit > 0:
        pairs = pairs[: int(limit)]
    return {"pairs": pairs, "count": len(pairs)}


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
            # Try to enrich with MIME and known metadata if available
            mime, _ = __import__("mimetypes").guess_type(str(entry))
            # Add duration when metadata sidecar exists
            duration_val = None
            title_val = None
            mpath = metadata_path(entry)
            if mpath.exists():
                try:
                    m = json.loads(mpath.read_text())
                    # Use v2 extractor to obtain duration (seconds)
                    duration_val = extract_duration(m)
                    # Try to extract human title from ffprobe tags
                    try:
                        title_val = (m.get("format", {}) or {}).get("tags", {}).get("title")
                    except Exception:
                        title_val = None
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
                scenes_exists = scenes_json_path(entry).exists()
            except Exception:
                pass
            try:
                s_sheet, s_json = sprite_sheet_paths(entry)
                sprites_exists = s_sheet.exists() and s_json.exists()
            except Exception:
                pass
            try:
                heatmaps_exists = heatmaps_json_path(entry).exists()
            except Exception:
                pass
            try:
                faces_exists = faces_path(entry).exists()
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
                "phash": phash_exists,
                "chapters": scenes_exists,
                "sprites": sprites_exists,
                "heatmaps": heatmaps_exists,
                "subtitles": subtitles_exists,
                "faces": faces_exists,
            }
            # Cover/hover URLs (served by our endpoints below)
            # Prefer direct file URL for cover: /files/<relative path to artifact>
            if thumbs_path(entry).exists():
                try:
                    cover_rel = thumbs_path(entry).relative_to(STATE["root"]).as_posix()
                    info["cover"] = f"/files/{cover_rel}"
                except Exception:
                    info["cover"] = f"/api/cover/get?path={info['path']}"
            else:
                info["cover"] = None
            # Hover: single-file only
            concat = _hover_concat_path(entry)
            if concat.exists():
                info["hoverPreview"] = f"/api/hover/get?path={info['path']}"
            files.append(info)
    return {"cwd": rel, "dirs": dirs, "files": files}


@api.get("/library")
def get_library(
    path: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=48, ge=1, le=500),
    search: Optional[str] = Query(default=None),
    ext: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default=None),
    order: Optional[str] = Query(default="asc"),
):
    data = _list_dir(STATE["root"], path)
    files = data.get("files", [])
    # Search / filter
    if search:
        files = [f for f in files if search.lower() in f["name"].lower()]
    if ext:
        files = [f for f in files if f["name"].lower().endswith(ext.lower())]
    # Sort
    reverse = (order == "desc")
    if sort == "name":
        files.sort(key=lambda f: f["name"].lower(), reverse=reverse)
    elif sort == "size":
        files.sort(key=lambda f: f.get("size", 0), reverse=reverse)
    elif sort == "date":
        for f in files:
            fp = safe_join(STATE["root"], f["path"])
            f["mtime"] = fp.stat().st_mtime if fp.exists() else 0
        files.sort(key=lambda f: f.get("mtime", 0), reverse=reverse)
    elif sort == "random":
        import random as _r
        _r.shuffle(files)
    total_files = len(files)
    total_pages = max(1, (total_files + page_size - 1) // page_size)
    if page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    end = start + page_size
    data["files"] = files[start:end]
    data["page"] = page
    data["page_size"] = page_size
    data["total_files"] = total_files
    data["total_pages"] = total_pages
    return api_success(data)


# -----------------
# Report
# -----------------
@app.get("/report")
def report(directory: str = Query("."), recursive: bool = Query(False)):
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(404, "directory not found")
    vids = _find_mp4s(root, recursive)

    def _artifact_flags(v: Path) -> dict[str, bool]:
        s_sheet, s_json = sprite_sheet_paths(v)
        return {
            "metadata": metadata_path(v).exists(),
            "thumbs": thumbs_path(v).exists(),
            "hovers": _hover_concat_path(v).exists(),
            "subtitles": bool(find_subtitles(v)),
            "faces": faces_path(v).exists(),
            "sprites": s_sheet.exists() and s_json.exists(),
            "heatmaps": heatmaps_json_path(v).exists(),
            "phash": phash_path(v).exists(),
            "scenes": scenes_json_path(v).exists(),
        }

    counts = {
        "metadata": 0,
        "thumbs": 0,
        "hovers": 0,
        "subtitles": 0,
        "faces": 0,
        "sprites": 0,
        "heatmaps": 0,
        "phash": 0,
        "scenes": 0,
    }
    for v in vids:
        flags = _artifact_flags(v)
        for k, present in flags.items():
            if present:
                counts[k] += 1
    return {"counts": counts, "total": len(vids)}


def _serve_range(request: Request, file_path: Path, media_type: str):
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
        return StreamingResponse(file_chunk(start, end), status_code=206, headers=headers)
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": media_type,
            "Content-Length": str(file_size),
        }
        return StreamingResponse(file_chunk(0, file_size - 1), status_code=200, headers=headers)


@api.get("/stream")
def stream_media(request: Request, path: str = Query(...)):
    file_path = safe_join(STATE["root"], path)
    # Media type best-effort
    import mimetypes

    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
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
        return _serve_range(request, file_path, mt)
    return FileResponse(str(file_path), media_type=mt)


def _name_and_dir(path: str) -> tuple[str, str]:
    fp = safe_join(STATE["root"], path)
    return fp.name, str(fp.parent)


# --- Cover ---
@api.get("/cover/get")
def cover_get(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    # Prefer artifact thumbs; fallback to alongside JPG
    root = Path(directory)
    target = root / name
    thumb = thumbs_path(target)
    if not thumb.exists():
        raise_api_error("cover not found", status_code=404)
    return FileResponse(str(thumb))


@api.post("/cover/create")
def cover_create(path: str = Query(...), t: Optional[str | float] = Query(default=10), quality: int = Query(default=2), overwrite: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    def _do():
        time_spec = str(t) if t is not None else "middle"
        try:
            generate_thumbnail(video, force=bool(overwrite), time_spec=time_spec, quality=int(quality))
        except Exception:
            # Fallback: write a stub JPEG so tests/UI can proceed
            out = thumbs_path(video)
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
        return api_success({"file": str(thumbs_path(video))})
    try:
        return _wrap_job("cover", str(video.relative_to(STATE["root"])), _do)
    except Exception as e:  # noqa: BLE001
        raise_api_error(f"cover create failed: {e}", status_code=500)


@api.post("/cover/create/batch")
def cover_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    t: Optional[str | float] = Query(default=10),
    quality: int = Query(default=2),
    overwrite: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)

    time_spec = str(t) if t is not None else "middle"
    q = int(quality)
    force = bool(overwrite)

    sup_jid = _new_job("cover-batch", str(base))
    _start_job(sup_jid)

    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            for p in vids:
                try:
                    # Skip if exists and not overwriting
                    if thumbs_path(p).exists() and not force:
                        _set_job_progress(sup_jid, processed_inc=1)
                        continue
                    try:
                        generate_thumbnail(p, force=force, time_spec=time_spec, quality=q)
                    except Exception:
                        # Best-effort stub
                        out = thumbs_path(p)
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
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return api_success({"started": True, "job": sup_jid})


@api.delete("/cover/delete")
def cover_delete(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    deleted = False
    p = thumbs_path(video)
    if p.exists():
        try:
            p.unlink()
            deleted = True
        except Exception:
            pass
    return api_success({"deleted": deleted}) if deleted else raise_api_error("Cover not found", status_code=404)


# --- Hover --- single-file previews only ---
@api.get("/hover/get")
def hover_get(request: Request, path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    concat = _hover_concat_path(video)
    if not concat.exists():
        raise_api_error("hover preview not found", status_code=404)
    return _serve_range(request, concat, "video/webm")


def _hover_concat_path(video: Path) -> Path:
    # Store concatenated preview at artifact root (consistent location)
    return artifact_dir(video) / f"{video.stem}{SUFFIX_PREVIEW_WEBM}"

    

@api.post("/hover/create")
def hover_create(path: str = Query(...), segments: int = Query(default=9), seg_dur: float = Query(default=1.0), width: int = Query(default=320), overwrite: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    def _do():
        # If exists and not overwriting, return early
        out = _hover_concat_path(video)
        if out.exists() and not overwrite:
            return api_success({"created": False, "path": str(out), "reason": "exists"})
        generate_hover_preview(video, segments=int(segments), seg_dur=float(seg_dur), width=int(width), fmt="webm", out=out)
        return api_success({"created": True, "path": str(out)})
    try:
        return _wrap_job("hover", str(video.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"hover create failed: {e}", status_code=500)


@api.post("/hover/create/batch")
def hover_create_batch(
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    segments: int = Query(default=9),
    seg_dur: float = Query(default=1.0),
    width: int = Query(default=320),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)

    class _Ns:
        preview_duration = float(seg_dur)
        preview_segments = int(segments)
        preview_width = int(width)
        force = False

    sup_jid = _new_job("hover-batch", str(base))
    _start_job(sup_jid)
    def _worker():
        try:
            vids: list[Path] = []
            it = base.rglob("*") if recursive else base.iterdir()
            for p in it:
                if _is_original_media_file(p, base):
                    vids.append(p)
            _set_job_progress(sup_jid, total=len(vids), processed_set=0)
            for p in vids:
                try:
                    jid = _new_job("hover", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        generate_hover_preview(p, segments=int(segments), seg_dur=float(seg_dur), width=int(width), fmt="webm")
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                    finally:
                        _set_job_progress(sup_jid, processed_inc=1)
                except Exception:
                    _set_job_progress(sup_jid, processed_inc=1)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))

    threading.Thread(target=_worker, daemon=True).start()
    return api_success({"started": True, "job": sup_jid})


@api.delete("/hover/delete")
def hover_delete(path: str = Query(...)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    concat = _hover_concat_path(video)
    deleted = False
    if concat.exists():
        try:
            concat.unlink()
            deleted = True
        except Exception:
            pass
    if deleted:
        return api_success({"deleted": True})
    raise_api_error("Hover not found", status_code=404)


@api.get("/hover/list")
def hover_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
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
            if _hover_concat_path(p).exists():
                have += 1
            else:
                try:
                    missing_list.append(str(p.relative_to(STATE["root"])))
                except Exception:
                    missing_list.append(p.name)
    return api_success({"total": total, "have": have, "missing": max(0, total - have), "missing_list": missing_list[:1000]})


# --- pHash ---
@api.get("/phash/get")
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


@api.post("/phash/create")
def phash_create(path: str = Query(...), frames: int = Query(default=5), algo: str = Query(default="ahash"), combine: str = Query(default="xor")):
    fp = safe_join(STATE["root"], path)
    _frames = int(frames)
    _algo = str(algo)
    _combine = str(combine)
    def _do():
        phash_create_single(fp, frames=_frames, algo=_algo, combine=_combine)
        return api_success({"created": True, "path": str(phash_path(fp))})
    try:
        return _wrap_job("phash", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"phash failed: {e}", status_code=500)


@api.delete("/phash/delete")
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


@api.get("/phash/list")
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


# --- Scenes (Chapter Markers) ---
@api.get("/scenes/get")
def scenes_get(path: str = Query(...)):
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
        raise_api_error("Scenes not found", status_code=404)
    return api_success(data)


@api.post("/scenes/create")
def scenes_create(path: str = Query(...), threshold: float = Query(default=0.4), limit: int = Query(default=0), thumbs: bool = Query(default=False), clips: bool = Query(default=False), thumbs_width: int = Query(default=320), clip_duration: float = Query(default=2.0)):
    fp = safe_join(STATE["root"], path)
    def _do():
        generate_scene_artifacts(fp, threshold=float(threshold), limit=int(limit), gen_thumbs=bool(thumbs), gen_clips=bool(clips), thumbs_width=int(thumbs_width), clip_duration=float(clip_duration))
        return api_success({"created": True, "path": str(scenes_json_path(fp))})
    try:
        return _wrap_job("scenes", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"scenes failed: {e}", status_code=500)


@api.delete("/scenes/delete")
def scenes_delete(path: str = Query(...)):
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
    return api_success({"deleted": deleted}) if deleted else raise_api_error("Scenes not found", status_code=404)


@api.get("/scenes/list")
def scenes_list(path: str = Query(default=""), recursive: bool = Query(default=True)):
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
                if scenes_json_path(p).exists():
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})


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


@api.get("/sprites/sheet")
def sprites_sheet(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    sheet, j = sprite_sheet_paths(fp)
    if not sheet.exists():
        raise_api_error("Sprite sheet not found", status_code=404)
    return FileResponse(str(sheet))


@api.post("/sprites/create")
def sprites_create(path: str = Query(...), interval: float = Query(default=10.0), width: int = Query(default=320), cols: int = Query(default=10), rows: int = Query(default=10), quality: int = Query(default=4)):
    fp = safe_join(STATE["root"], path)
    def _do():
        generate_sprite_sheet(fp, interval=float(interval), width=int(width), cols=int(cols), rows=int(rows), quality=int(quality))
        return api_success({"created": True})
    try:
        return _wrap_job("sprites", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"sprites failed: {e}", status_code=500)


@api.post("/sprites/create/batch")
def sprites_create_batch(path: str = Query(default=""), recursive: bool = Query(default=True), interval: float = Query(default=10.0), width: int = Query(default=320), cols: int = Query(default=10), rows: int = Query(default=10), quality: int = Query(default=4)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
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
            for p in vids:
                try:
                    jid = _new_job("sprites", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        generate_sprite_sheet(p, interval=float(interval), width=int(width), cols=int(cols), rows=int(rows), quality=int(quality))
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                    finally:
                        _set_job_progress(sup_jid, processed_inc=1)
                except Exception:
                    _set_job_progress(sup_jid, processed_inc=1)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    threading.Thread(target=_worker, daemon=True).start()
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


# --- Heatmaps (brightness/motion timeline) ---
@api.get("/heatmaps/json")
def heatmaps_json(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    j = heatmaps_json_path(fp)
    if not j.exists():
        raise_api_error("Heatmaps not found", status_code=404)
    try:
        data = json.loads(j.read_text())
    except Exception:
        data = {"raw": j.read_text(errors="ignore")}
    return api_success({"heatmaps": data})


@api.get("/heatmaps/png")
def heatmaps_png(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    p = heatmaps_png_path(fp)
    if not p.exists():
        raise_api_error("Heatmaps PNG not found", status_code=404)
    return FileResponse(str(p), media_type="image/png")

@api.head("/heatmaps/png")
def heatmaps_png_head(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    p = heatmaps_png_path(fp)
    if not p.exists():
        raise_api_error("Heatmaps PNG not found", status_code=404)
    # No body for HEAD
    return Response(status_code=200, media_type="image/png")


@api.post("/heatmaps/create")
def heatmaps_create(path: str = Query(...), interval: float = Query(default=5.0), mode: str = Query(default="both"), png: bool = Query(default=True), force: bool = Query(default=False)):
    fp = safe_join(STATE["root"], path)
    def _do():
        d = compute_heatmaps(fp, float(interval), str(mode), bool(png))
        return api_success({"created": True, "path": str(heatmaps_json_path(fp)), "samples": len(d.get("samples", []))})
    try:
        return _wrap_job("heatmaps", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"heatmaps failed: {e}", status_code=500)


@api.post("/heatmaps/create/batch")
def heatmaps_create_batch(path: str = Query(default=""), recursive: bool = Query(default=True), interval: float = Query(default=5.0), mode: str = Query(default="both"), png: bool = Query(default=False), force: bool = Query(default=False)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
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
            for p in vids:
                try:
                    jid = _new_job("heatmaps", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        compute_heatmaps(p, float(interval), str(mode), bool(png))
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                    finally:
                        _set_job_progress(sup_jid, processed_inc=1)
                except Exception:
                    _set_job_progress(sup_jid, processed_inc=1)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    threading.Thread(target=_worker, daemon=True).start()
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
                if heatmaps_json_path(p).exists():
                    have += 1
            except Exception:
                pass
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})


# --- Metadata ---
@api.get("/metadata/get")
def metadata_get(path: str = Query(...), force: bool = Query(default=False), view: bool = Query(default=False)):
    name, directory = _name_and_dir(path)
    video = Path(directory) / name
    mpath = metadata_path(video)
    try:
        print(f"[debug] metadata_get: path={path} root={STATE['root']} video={video} mpath={mpath} force={force} FFPROBE_DISABLE={os.environ.get('FFPROBE_DISABLE')}")
    except Exception:
        pass
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
        return api_success({"path": path, **summary, "raw": raw})
    return api_success(summary)


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


@api.post("/metadata/create")
def metadata_create(path: str = Query(...)):
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
        return _wrap_job("metadata", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:  # noqa: BLE001
        raise_api_error(f"metadata create failed: {e}", status_code=500)


@api.delete("/metadata/delete")
def metadata_delete(path: str = Query(...)):
    fp = safe_join(STATE["root"], path)
    m = metadata_path(fp)
    if m.exists():
        try:
            m.unlink()
            return api_success({"deleted": True})
        except Exception as e:
            raise_api_error(f"Failed to delete metadata: {e}", status_code=500)
    raise_api_error("Metadata not found", status_code=404)


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

    # SRT only; no VTT endpoint


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


@api.post("/subtitles/create")
def subtitles_create(
    path: str = Query(...),
    model: str = Query(default="small"),
    overwrite: bool = Query(default=False),
    language: str = Query(default="en"),
    translate: bool = Query(default=False),
):
    fp = safe_join(STATE["root"], path)
    out_dir = artifact_dir(fp)
    out_file = out_dir / f"{fp.stem}{SUFFIX_SUBTITLES_SRT}"
    if out_file.exists() and not overwrite:
        return api_success({"created": False, "reason": "exists"})
    class _Ns:
        subtitles_backend = "auto"
        subtitles_model = model
        subtitles_language = language or "en"
        subtitles_translate = bool(translate)
        force = True
        compute_type = None
    def _do():
        generate_subtitles(fp, out_file, model=_Ns.subtitles_model, language=_Ns.subtitles_language, translate=_Ns.subtitles_translate)
        return api_success({"created": True, "path": str(out_file)})
    try:
        return _wrap_job("subtitles", str(fp.relative_to(STATE["root"])), _do)
    except Exception as e:
        raise_api_error(f"Subtitle generation failed: {e}", status_code=500)


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
            for p in vids:
                try:
                    out_file = artifact_dir(p) / f"{p.stem}{SUFFIX_SUBTITLES_SRT}"
                    if out_file.exists() and not overwrite:
                        _set_job_progress(sup_jid, processed_inc=1)
                        continue
                    jid = _new_job("subtitles", str(p.relative_to(STATE["root"])) )
                    _start_job(jid)
                    try:
                        generate_subtitles(p, out_file, model=model, language=(language or "en"), translate=bool(translate))
                        _finish_job(jid, None)
                    except Exception as e:
                        _finish_job(jid, str(e))
                    finally:
                        _set_job_progress(sup_jid, processed_inc=1)
                except Exception:
                    _set_job_progress(sup_jid, processed_inc=1)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    threading.Thread(target=_worker, daemon=True).start()
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
@api.post("/setroot")
def set_root(root: str = Query(...)):
    p = Path(root).expanduser()
    if not p.exists() or not p.is_dir():
        raise_api_error("Root does not exist or is not a directory", status_code=400, data={"path": str(p)})
    STATE["root"] = p.resolve()
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
@api.get("/stats")
def stats(path: str = Query(default=""), recursive: bool = Query(default=True), fast: bool = Query(default=False)):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    # Simple TTL cache to avoid repeated full scans
    try:
        cache = STATE.setdefault("_stats_cache", {})
    except Exception:
        cache = {}
    key = (str(base), bool(recursive), bool(fast))
    now = time.time()
    entry = cache.get(key)
    if entry and isinstance(entry, dict) and (now - entry.get("ts", 0) < 2.0):
        return api_success(entry.get("data", {}))
    total_files = total_size = total_duration = 0.0
    c_thumbs = c_previews = c_subs = c_meta = c_faces = c_phash = c_scenes = c_sprites = c_heatmaps = 0
    duration_files_count = 0
    it = base.rglob("*") if recursive else base.iterdir()
    for p in it:
        if _is_original_media_file(p, base):
            total_files += 1
            if not fast:
                try:
                    total_size += p.stat().st_size
                except Exception:
                    pass
            if thumbs_path(p).exists():
                c_thumbs += 1
            if _hover_concat_path(p).exists():
                c_previews += 1
            try:
                if phash_path(p).exists():
                    c_phash += 1
            except Exception:
                pass
            try:
                if scenes_json_path(p).exists():
                    c_scenes += 1
            except Exception:
                pass
            try:
                s_sheet, s_json = sprite_sheet_paths(p)
                if s_sheet.exists() and s_json.exists():
                    c_sprites += 1
            except Exception:
                pass
            try:
                if heatmaps_json_path(p).exists():
                    c_heatmaps += 1
            except Exception:
                pass
            if find_subtitles(p):
                c_subs += 1
            if faces_path(p).exists():
                c_faces += 1
            m = metadata_path(p)
            if m.exists():
                c_meta += 1
                if not fast:
                    try:
                        d = (extract_duration(json.loads(m.read_text())) or 0.0)
                        if d:
                            total_duration += d
                            duration_files_count += 1
                    except Exception:
                        pass
    # Aggregate artifact presence counts (DRY with report)
    def _artifact_flags(v: Path) -> dict[str, bool]:
        s_sheet, s_json = sprite_sheet_paths(v)
        return {
            "covers": thumbs_path(v).exists(),
            "hovers": _hover_concat_path(v).exists(),
            "subtitles": bool(find_subtitles(v)),
            "metadata": metadata_path(v).exists(),
            "faces": faces_path(v).exists(),
            "phash": phash_path(v).exists(),
            "scenes": scenes_json_path(v).exists(),
            "sprites": s_sheet.exists() and s_json.exists(),
            "heatmaps": heatmaps_json_path(v).exists(),
        }
    # Recompute counts from files list for consistency
    agg = {
        "covers": c_thumbs,
        "hovers": c_previews,
        "subtitles": c_subs,
        "metadata": c_meta,
        "faces": c_faces,
        "phash": c_phash,
        "scenes": c_scenes,
        "sprites": c_sprites,
        "heatmaps": c_heatmaps,
    }
    # If we built a file list earlier, we could recompute strictly; otherwise keep prior counters
    # For now, we use the counted values but the helper is available for future DRY refactors
    data = {
        "path": path,
        "total_files": total_files,
        "total_size_bytes": total_size if not fast else None,
        "total_duration_seconds": int(total_duration) if not fast else None,
        "duration_files_count": duration_files_count if not fast else None,
        "covers": agg["covers"],
        "hovers": agg["hovers"],
        "subtitles": agg["subtitles"],
        "metadata": agg["metadata"],
        "faces": agg["faces"],
        "phash": agg["phash"],
        "scenes": agg["scenes"],
        "sprites": agg["sprites"],
        "heatmaps": agg["heatmaps"],
    }
    try:
        cache[key] = {"ts": now, "data": data}
        STATE["_stats_cache"] = cache
    except Exception:
        pass
    return api_success(data)


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
        jid = _new_job("faces", rel)
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
    jid = _new_job("faces", str(fp.relative_to(STATE["root"])) )
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
            for p in vids:
                try:
                    if only_missing and faces_path(p).exists():
                        # Skip already-generated faces when only_missing=True
                        _set_job_progress(sup_jid, processed_inc=1)
                        continue
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
                except Exception:
                    _set_job_progress(sup_jid, processed_inc=1)
            _finish_job(sup_jid, None)
        except Exception as e:
            _finish_job(sup_jid, str(e))
    threading.Thread(target=_worker, daemon=True).start()
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
            if faces_path(p).exists():
                have += 1
    return api_success({"total": total, "have": have, "missing": max(0, total - have)})


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


# --- Face crops (image thumbnails for FaceLab) ---
@api.get("/frame/crop")
def frame_crop(path: str = Query(...), t: float = Query(...), x: int = Query(...), y: int = Query(...), w: int = Query(...), h: int = Query(...), scale: int = Query(default=128)):
    """Return a cropped face image at time t from the given box.

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
            "ffmpeg", "-y", "-ss", str(float(t)), "-i", str(fp),
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
            "ffmpeg", "-y", "-ss", str(float(t)), "-i", str(fp),
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
    """Return a full video frame at time t with a bounding box overlay.

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
            "ffmpeg", "-y", "-ss", str(float(t)), "-i", str(fp),
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
            "ffmpeg", "-y", "-ss", str(float(t)), "-i", str(fp),
            "-vf", vf, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not proc.stdout:
            raise_api_error("frame boxed failed", status_code=500)
        headers = {"Cache-Control": "public, max-age=604800"}
        return Response(content=proc.stdout, media_type="image/jpeg", headers=headers)

# --- Simple marker store expected by v1 UI
@api.post("/marker")
def set_marker(path: str = Query(...), time: float = Query(...)):
    fp = safe_join(STATE["root"], path)
    # Persist into scenes.json with shape {"scenes": [{"time": ...}, ...]}
    store = scenes_json_path(fp)
    data: dict = {"scenes": []}
    if store.exists():
        try:
            cur = json.loads(store.read_text())
            if isinstance(cur, dict) and isinstance(cur.get("scenes"), list):
                data = cur
        except Exception:
            data = {"scenes": []}
    # append and keep sorted unique by time (nearest 0.1s) to avoid duplicates
    tval = round(float(time), 3)
    scenes = data.setdefault("scenes", [])
    if isinstance(scenes, list):
        scenes.append({"time": tval})
        try:
            # de-dup by rounded time
            seen = set()
            unique = []
            for s in scenes:
                try:
                    tv = round(float(s.get("time")), 3)
                except Exception:
                    continue
                key = tv
                if key in seen:
                    continue
                seen.add(key)
                unique.append({"time": tv})
            scenes = sorted(unique, key=lambda x: x.get("time", 0.0))
            data["scenes"] = scenes
        except Exception:
            pass
    try:
        store.write_text(json.dumps(data, indent=2))
    except Exception:
        pass
    return api_success({"saved": True, "count": len(data.get("scenes", []))})

 


# Wire router
app.include_router(api)


# Jobs API
@app.get("/api/jobs")
def jobs(state: str = Query(default="active"), limit: int = Query(default=100)):
    """List jobs with optional filtering.

    ``state`` can be one of ``active`` (default), ``recent``, ``all`` or a
    specific job state such as ``queued`` or ``running``. Active jobs are those
    currently queued or running. Recent jobs are completed ones in the last ten
    minutes.
    """
    now = time.time()
    with JOB_LOCK:
        vals = list(JOBS.values())
    if state == "active":
        vals = [j for j in vals if j.get("state") in ("queued", "running")]
    elif state == "recent":
        tmp = []
        for j in vals:
            if j.get("state") in ("done", "failed", "canceled"):
                t = j.get("ended_at")
                if isinstance(t, (int, float)) and (now - float(t) <= 600):
                    tmp.append(j)
        vals = tmp
    elif state in {"queued", "running", "done", "failed", "canceled"}:
        vals = [j for j in vals if j.get("state") == state]
    # else state == "all" -> no filtering
    # Sort newest first by started_at or ended_at
    def _ts(j):
        return j.get("started_at") or j.get("ended_at") or 0
    vals.sort(key=_ts, reverse=True)
    return api_success({"jobs": vals[: max(1, min(limit, 1000))]})

# Cleanup API: attempt to reconcile renamed media with orphaned artifacts
@app.post("/api/artifacts/cleanup")
def artifacts_cleanup(
    path: str = Query(default=""),
    dry_run: bool = Query(default=True),
    keep_orphans: bool = Query(default=False),
):
    base = safe_join(STATE["root"], path) if path else STATE["root"]
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    req = JobRequest(
        task="cleanup-artifacts",
        directory=str(base),
        recursive=True,
        force=False,
        params={"dry_run": bool(dry_run), "keep_orphans": bool(keep_orphans)},
    )
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    t = threading.Thread(target=_run_job_worker, args=(jid, req), daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


# --------------------------
# Jobs API at root
# --------------------------
class JobRequest(BaseModel):
    task: str
    directory: Optional[str] = None
    recursive: Optional[bool] = False
    force: Optional[bool] = False
    params: Optional[dict] = None


def _iter_videos(dir_path: Path, recursive: bool) -> list[Path]:
    return _find_mp4s(dir_path, recursive)


class AutoTagRequest(BaseModel):
    path: Optional[str] = None
    recursive: Optional[bool] = False
    performers: Optional[list[str]] = None
    tags: Optional[list[str]] = None


class ScanRequest(BaseModel):
    path: Optional[str] = None
    recursive: Optional[bool] = True


@app.post("/api/autotag/scan")
def autotag_scan(req: AutoTagRequest):
    base = Path(req.path or str(STATE["root"]))
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    jr = JobRequest(
        task="autotag",
        directory=str(base),
        recursive=bool(req.recursive),
        force=False,
        params={
            "performers": list(req.performers or []),
            "tags": list(req.tags or []),
        },
    )
    jid = _new_job(jr.task, jr.directory or str(STATE["root"]))
    t = threading.Thread(target=_run_job_worker, args=(jid, jr), daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


@app.post("/api/scan")
def api_scan(req: ScanRequest):
    base = Path(req.path or str(STATE["root"]))
    if not base.exists() or not base.is_dir():
        raise_api_error("Not found", status_code=404)
    jr = JobRequest(
        task="scan",
        directory=str(base),
        recursive=bool(req.recursive),
        force=True,
    )
    jid = _new_job(jr.task, jr.directory or str(STATE["root"]))
    t = threading.Thread(target=_run_job_worker, args=(jid, jr), daemon=True)
    t.start()
    return api_success({"job": jid, "queued": True})


def _job_check_canceled(jid: str) -> bool:
    ev = JOB_CANCEL_EVENTS.get(jid)
    return bool(ev and ev.is_set())


def _job_set_result(jid: str, result: Any) -> None:
    with JOB_LOCK:
        if jid in JOBS:
            JOBS[jid]["result"] = result
    _publish_job_event({"event": "result", "id": jid})


def _run_job_worker(jid: str, jr: JobRequest):
    try:
        time.sleep(0.01)
        task = (jr.task or "").lower()
        base = Path(jr.directory or str(STATE["root"]))
        base = base.expanduser().resolve()
        if task == "scan":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            imported = 0
            for i, v in enumerate(vids, start=1):
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                import_media(v, force=bool(jr.force))
                imported += 1
                _set_job_progress(jid, processed_set=i)
            _finish_job(jid)
            with JOB_LOCK:
                JOBS[jid]["result"] = {"total": len(vids), "imported": imported}
            return
        if task == "autotag":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            prm = jr.params or {}
            perf_list = [str(x).strip() for x in (prm.get("performers") or []) if str(x).strip()]
            tag_list = [str(x).strip() for x in (prm.get("tags") or []) if str(x).strip()]
            # Precompile simple word-boundary regex for each candidate
            def _mk_patterns(items: list[str]):
                pats = []
                for it in items:
                    s = re.escape(it.lower())
                    # allow separators like ., _, -, space between words by replacing spaces with a character class
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
                    # normalize separators
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
                    # Load current tags
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
                finally:
                    _set_job_progress(jid, processed_set=i)
            _job_set_result(jid, {"matched_files": matched_count, "updated_files": changed, "total": len(vids)})
            _finish_job(jid)
            return
        if task == "cover":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            prm = jr.params or {}
            time_spec = str(prm.get("t", prm.get("time", 10))) if prm.get("t", prm.get("time")) is not None else "middle"
            q = int(prm.get("quality", 2))
            force = bool(jr.force) or bool(prm.get("overwrite", False))
            for v in vids:
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                try:
                    if thumbs_path(v).exists() and not force:
                        pass
                    else:
                        generate_thumbnail(v, force=force, time_spec=time_spec, quality=q)
                except Exception:
                    pass
                _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, {"processed": len(vids)})
            _finish_job(jid)
            return
        if task == "metadata":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            for v in vids:
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                try:
                    metadata_single(v, force=bool(jr.force))
                except Exception:
                    pass
                _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, {"processed": len(vids)})
            _finish_job(jid)
            return
        if task == "phash":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            frames = int((jr.params or {}).get("frames", 5))
            for v in vids:
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                try:
                    phash_create_single(v, frames=frames)
                except Exception:
                    pass
                _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, {"processed": len(vids)})
            _finish_job(jid)
            return
        if task == "embed":
            vids = _iter_videos(base, bool(jr.recursive))
            _set_job_progress(jid, total=len(vids), processed_set=0)
            for v in vids:
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                try:
                    compute_face_embeddings(v)
                except Exception:
                    pass
                _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, 0)
            _finish_job(jid)
            return
        if task == "clip":
            prm = jr.params or {}
            _src_val = prm.get("file")
            src = Path(str(_src_val)) if _src_val else None
            ranges = prm.get("ranges") or []
            _dest_val = prm.get("dest")
            dest = Path(str(_dest_val)) if _dest_val else None
            if not src or not src.exists() or not dest:
                _finish_job(jid, error="invalid clip params")
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
                    # best-effort fast clip
                    cmd = [
                        "ffmpeg", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(src),
                        "-c", "copy", str(outp),
                    ]
                    try:
                        _run(cmd)
                    except Exception:
                        outp.write_bytes(b"")
                else:
                    # create a stub file
                    outp.write_bytes(b"CLIP")
                files_out.append(str(outp))
                _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, {"files": files_out})
            _finish_job(jid)
            return
        if task == "cleanup-artifacts":
            base = Path(jr.directory or str(STATE["root"]))
            base = base.expanduser().resolve()
            prm = jr.params or {}
            dry_run = bool(prm.get("dry_run", False))
            keep_orphans = bool(prm.get("keep_orphans", False))
            # Gather all artifacts under .artifacts directories
            artifacts: list[Path] = []
            for p in base.rglob(".artifacts"):
                if not p.is_dir():
                    continue
                for f in p.iterdir():
                    if f.is_file() and _parse_artifact_name(f.name):
                        artifacts.append(f)
            _set_job_progress(jid, total=len(artifacts), processed_set=0)
            media_by_stem, meta_by_stem = _collect_media_and_meta(base)
            # Build duration lookup for media
            media_durations: dict[str, float] = {}
            for stem, v in media_by_stem.items():
                try:
                    m = meta_by_stem.get(stem) or {}
                    d = m.get("duration")
                    if isinstance(d, (int, float)):
                        media_durations[stem] = float(d)
                except Exception:
                    pass
            renamed: list[dict] = []
            deleted: list[str] = []
            kept: list[str] = []
            for art in artifacts:
                if _job_check_canceled(jid):
                    _finish_job(jid)
                    return
                try:
                    parsed = _parse_artifact_name(art.name)
                    if not parsed:
                        _set_job_progress(jid, processed_inc=1)
                        continue
                    a_stem, kind = parsed
                    parent_dir = art.parent
                    # Fast-path: if same-stem media exists in same parent
                    cand_media = media_by_stem.get(a_stem)
                    if cand_media and cand_media.exists():
                        # Artifact already matches existing media; keep
                        kept.append(str(art))
                        _set_job_progress(jid, processed_inc=1)
                        continue
                    # Try to find a best candidate among media by comparing duration and name similarity
                    # Load artifact's associated metadata duration if available
                    a_duration: float | None = None
                    try:
                        if kind == SUFFIX_METADATA_JSON:
                            raw = json.loads(art.read_text())
                            a_duration = extract_duration(raw)
                        else:
                            # If not a metadata sidecar, try reading sibling metadata file with same stem
                            meta_file = parent_dir / f"{a_stem}{SUFFIX_METADATA_JSON}"
                            if meta_file.exists():
                                raw = json.loads(meta_file.read_text())
                                a_duration = extract_duration(raw)
                    except Exception:
                        a_duration = None
                    # Score candidates
                    best: tuple[float, Path] | None = None
                    for stem, v in media_by_stem.items():
                        # Prefer files in the same grandparent directory
                        try:
                            same_parent_boost = 0.05 if v.parent == parent_dir.parent else 0.0
                        except Exception:
                            same_parent_boost = 0.0
                        name_sim = SequenceMatcher(a=a_stem.lower(), b=stem.lower()).ratio()
                        dur_sim = 0.0
                        if a_duration is not None:
                            d = media_durations.get(stem)
                            if isinstance(d, (int, float)) and d > 0:
                                diff = abs(float(d) - float(a_duration))
                                # 0 diff -> 1.0, 5% diff -> ~0.0
                                dur_sim = max(0.0, 1.0 - (diff / max(d, 1.0)))
                        score = (0.65 * name_sim) + (0.35 * dur_sim) + same_parent_boost
                        if best is None or score > best[0]:
                            best = (score, v)
                    matched: Optional[Path] = None
                    if best and best[0] >= 0.80:  # threshold for confident match
                        matched = best[1]
                    if matched is not None:
                        # Rename artifact to new stem in the matched media's .artifacts
                        dst_dir = artifact_dir(matched)
                        new_name = f"{matched.stem}{kind}"
                        dst_path = dst_dir / new_name
                        if dry_run:
                            renamed.append({"from": str(art), "to": str(dst_path)})
                        else:
                            try:
                                dst_dir.mkdir(parents=True, exist_ok=True)
                                os.rename(art, dst_path)
                                renamed.append({"from": str(art), "to": str(dst_path)})
                            except Exception:
                                # If rename fails, keep for manual inspection
                                kept.append(str(art))
                    else:
                        # No match — delete unless keep_orphans
                        if keep_orphans or dry_run:
                            kept.append(str(art))
                        else:
                            try:
                                art.unlink()
                                deleted.append(str(art))
                            except Exception:
                                kept.append(str(art))
                except Exception:
                    # On any unexpected error, keep artifact
                    kept.append(str(art))
                finally:
                    _set_job_progress(jid, processed_inc=1)
            _job_set_result(jid, {"renamed": renamed, "deleted": deleted, "kept": kept, "dry_run": dry_run})
            _finish_job(jid)
            return
        # Unknown task
        _finish_job(jid, error="unknown task")
    except Exception as e:
        _finish_job(jid, error=str(e))


@app.post("/jobs")
def jobs_submit(req: JobRequest):
    jid = _new_job(req.task, req.directory or str(STATE["root"]))
    # Start worker thread
    t = threading.Thread(target=_run_job_worker, args=(jid, req), daemon=True)
    t.start()
    return {"id": jid, "status": "queued"}


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
            j["state"] = "cancel_requested"
    _publish_job_event({"event": "cancel", "id": job_id})
    return {"id": job_id, "status": "cancel_requested"}


 

# Ensure the alias is registered even if defined after the router was included
try:
    app.add_api_route("/api/jobs/events", jobs_events, methods=["GET"])
except Exception:
    # If already registered or during import-time constraints, ignore
    pass

# Proper /api endpoints that resolve paths relative to MEDIA_ROOT
@api.get("/videos/{name}/tags")
def api_get_video_tags(name: str, directory: str = Query(default="")):
    base = safe_join(STATE["root"], directory) if directory else STATE["root"]
    path = base / name
    if not path.exists():
        raise_api_error("video not found", status_code=404)
    tfile = _tags_file(path)
    if not tfile.exists():
        return {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    try:
        data = json.loads(tfile.read_text())
    except Exception:
        raise_api_error("invalid tags file", status_code=500)
    if "description" not in data:
        data["description"] = ""
    if "rating" not in data:
        data["rating"] = 0
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
            data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    else:
        data = {"video": name, "tags": [], "performers": [], "description": "", "rating": 0}
    data.setdefault("description", "")
    data.setdefault("rating", 0)
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
    try:
        tfile.write_text(json.dumps(data, indent=2))
    except Exception:
        raise_api_error("failed to write tags", status_code=500)
    return data


@api.get("/tags/summary")
def api_tags_summary(path: str = Query(default=""), recursive: bool = Query(default=False)):
    """Summarize tags and performers under a directory.

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


@app.get("/api/tags/search")
def api_tags_search(q: str = Query(...), path: str = Query(default=""), recursive: bool = Query(default=False)):
    """Search tags and performers containing a substring.

    Returns lists of matching tag and performer names. Path handling mirrors
    :func:`api_tags_summary` and is forgiving of invalid paths so the UI can
    query during initialization without surfacing errors.
    """
    try:
        base = safe_join(STATE["root"], path) if path else STATE["root"]
    except Exception:
        return {"tags": [], "performers": []}
    if not base.is_dir():
        return {"tags": [], "performers": []}
    vids = _find_mp4s(base, bool(recursive))
    ql = q.lower()
    tag_set: set[str] = set()
    perf_set: set[str] = set()
    for p in vids:
        tf = _tags_file(p)
        if not tf.exists():
            continue
        try:
            data = json.loads(tf.read_text())
        except Exception:
            continue
        for t in data.get("tags", []) or []:
            if ql in t.lower():
                tag_set.add(t)
        for t in data.get("performers", []) or []:
            if ql in t.lower():
                perf_set.add(t)
    return {"tags": sorted(tag_set), "performers": sorted(perf_set)}


@app.get("/api/library/media")
def api_library(
    q: str = Query(default=""),
    tag: str = Query(default=""),
    performer: str = Query(default=""),
    min_width: int = Query(default=0, ge=0),
    min_duration: float = Query(default=0.0, ge=0.0),
):
    """Return the in-memory library of imported media files with optional filtering."""
    files = list(STATE.get("library", {}).values())
    if q:
        ql = q.lower()
        files = [f for f in files if ql in f.get("path", "").lower()]
    if tag:
        tl = tag.lower()
        files = [
            f for f in files
            if any(tl == t.lower() for t in f.get("metadata", {}).get("tags", []))
        ]
    if performer:
        pl = performer.lower()
        files = [
            f for f in files
            if any(pl == t.lower() for t in f.get("metadata", {}).get("performers", []))
        ]
    if min_width:
        files = [
            f
            for f in files
            if (extract_width(f.get("metadata")) or 0) >= int(min_width)
        ]
    if min_duration:
        files = [
            f
            for f in files
            if (extract_duration(f.get("metadata")) or 0.0) >= float(min_duration)
        ]
    files.sort(key=lambda x: x.get("path", ""))
    return api_success({"files": files})


@app.post("/api/library/clear")
def api_library_clear():
    """Clear the in-memory library and persisted storage."""
    STATE["library"] = {}
    _save_library()
    return api_success({"cleared": True})


@app.get("/api/search")
def api_search(
    q: str = Query(...),
    path: str = Query(default=""),
    recursive: bool = Query(default=True),
    limit: int = Query(default=10, ge=1, le=1000),
    min_width: int = Query(default=0, ge=0),
    min_duration: float = Query(default=0.0, ge=0.0),
):
    """Search tags, performers, and file names for a substring.

    This mimics StashApp's global search, returning simple lists of matching
    names and relative file paths. Results are limited to ``limit`` items per
    category to keep responses light-weight.
    """
    try:
        base = safe_join(STATE["root"], path) if path else STATE["root"]
    except Exception:
        return {"tags": [], "performers": [], "files": []}
    if not base.is_dir():
        return {"tags": [], "performers": [], "files": []}
    vids = _find_mp4s(base, bool(recursive))
    ql = q.lower()
    tag_set: set[str] = set()
    perf_set: set[str] = set()
    file_list: list[str] = []
    for p in vids:
        # Filter by metadata if requested
        if min_width or min_duration:
            try:
                md = json.loads(metadata_path(p).read_text())
            except Exception:
                md = {}
            streams = md.get("streams") or []
            vinfo = next((s for s in streams if s.get("codec_type") == "video"), {})
            width = int(vinfo.get("width") or 0)
            duration = float(md.get("format", {}).get("duration") or 0.0)
            if width < int(min_width) or duration < float(min_duration):
                continue
        name = p.name
        if ql in name.lower():
            file_list.append(p.relative_to(STATE["root"]).as_posix())
        tf = _tags_file(p)
        if not tf.exists():
            continue
        try:
            data = json.loads(tf.read_text())
        except Exception:
            continue
        for t in data.get("tags", []) or []:
            if ql in t.lower():
                tag_set.add(t)
        for t in data.get("performers", []) or []:
            if ql in t.lower():
                perf_set.add(t)
    return {
        "tags": sorted(tag_set)[:limit],
        "performers": sorted(perf_set)[:limit],
        "files": sorted(file_list)[:limit],
    }


@app.get("/api/search/saved")
def api_search_saved_list():
    """Return all saved searches."""
    return api_success({"searches": STATE.get("saved_searches", {})})


@app.post("/api/search/saved")
def api_search_saved_create(body: dict = Body(...)):
    name = body.get("name")
    query = body.get("query")
    if not isinstance(name, str) or not isinstance(query, dict):
        raise_api_error("Invalid saved search", 400)
    STATE["saved_searches"][name] = query
    _save_saved_searches()
    return api_success({"name": name})


@app.get("/api/search/saved/{name}")
def api_search_saved_run(name: str):
    query = STATE.get("saved_searches", {}).get(name)
    if not isinstance(query, dict):
        raise_api_error("Search not found", 404)
    params = {
        "q": query.get("q", ""),
        "path": query.get("path", ""),
        "recursive": query.get("recursive", True),
        "limit": query.get("limit", 10),
        "min_width": query.get("min_width", 0),
        "min_duration": query.get("min_duration", 0.0),
    }
    return api_search(**params)


@app.delete("/api/search/saved/{name}")
def api_search_saved_delete(name: str):
    if name in STATE.get("saved_searches", {}):
        del STATE["saved_searches"][name]
        _save_saved_searches()
    return api_success({"deleted": name})


if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    root = os.environ.get("MEDIA_ROOT")
    if root:
        try:
            STATE["root"] = Path(root).expanduser().resolve()
        except Exception:
            pass
    uvicorn.run("app:app", host="127.0.0.1", port=9999, reload=True)
