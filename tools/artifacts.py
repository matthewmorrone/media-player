#!/usr/bin/env python3
"""
CLI to generate artifacts for all videos in a directory without running the server.

Artifacts covered:
- thumbnail JPG
- hover preview (webm)
- sprite sheet JPG + JSON
- scene JSON (+ optional thumbs/clips)
- heatmaps JSON (+ optional PNG)
- phash JSON
- metadata JSON

Usage:
    python artifacts.py \
        --root /path/to/videos \
    [--recursive] \
    [--what all|thumb|hover|sprites|scenes|heatmaps|phash|metadata] \
    [--force] [--concurrency 2]

Notes:
- Respects MEDIA_ROOT if set; --root overrides.
- Uses the same media extension list as the server (see MEDIA_EXTS env or /config media_exts).
- Requires ffmpeg/ffprobe for full fidelity, otherwise writes stubs where supported.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import sys
import signal
import threading
from pathlib import Path
from typing import Optional, Callable, Any

# --- Auto-venv bootstrap (mirror serve.sh logic) ---
def _ensure_venv_if_needed():
    """
    If not running inside the usual virtualenv (or FastAPI is missing),
        re-exec this script with the repo venv's Python:
            - prefer ./.venv/bin/python
      - else $HOME/.venvs/media-player/bin/python

    This avoids ModuleNotFoundError: fastapi when invoked as `python artifacts.py`.
    """
    try:
        # Avoid infinite recursion
        if os.environ.get("MP_VENV_BOOTSTRAPPED") == "1":
            return

        # If we're already in a venv and fastapi can import, do nothing
        in_venv = (hasattr(sys, 'base_prefix') and sys.prefix != getattr(sys, 'base_prefix', sys.prefix)) or bool(os.environ.get('VIRTUAL_ENV'))
        fastapi_ok = False
        try:
            import importlib  # noqa: F401
            import fastapi  # type: ignore  # noqa: F401
            fastapi_ok = True
        except Exception:
            fastapi_ok = False
        if in_venv and fastapi_ok:
            return

        # Locate candidate venv interpreters
        script_dir = Path(__file__).resolve().parent
        candidates = []
        # Local .venv
        candidates.append(script_dir / '.venv' / 'bin' / 'python')
        # Home venv fallback
        home = Path(os.path.expanduser('~'))
        candidates.append(home / '.venvs' / 'media-player' / 'bin' / 'python')

        for py in candidates:
            try:
                if py.is_file() and os.access(str(py), os.X_OK):
                    # Re-exec with env marker
                    new_env = dict(os.environ)
                    new_env['MP_VENV_BOOTSTRAPPED'] = '1'
                    # Helpful message for CLI users
                    try:
                        sys.stderr.write(f"[cli] Switching to venv interpreter: {py}\n")
                        sys.stderr.flush()
                    except Exception:
                        pass
                    os.execve(str(py), [str(py), str(Path(__file__).resolve())] + sys.argv[1:], new_env)
                    return  # not reached
            except Exception:
                continue
        # If we get here, no suitable venv Python was found; continue anyway
    except Exception:
        # Best-effort only; if anything goes wrong, fall through and let imports fail normally
        pass

# Perform venv bootstrap as early as possible
_ensure_venv_if_needed()

# Import internal helpers from app.py without triggering server run
import importlib


def import_app_module():
    """
    Import the top-level app.py regardless of current working directory.

    When running this script as `python artifacts.py`,
    Python sets sys.path[0] to the scripts directory, so we need to add
    the project root to sys.path to import `app`.
    """
    try:
        # Ensure project root (parent of this file's directory) is on sys.path
        root = Path(__file__).resolve().parents[1]
        sroot = str(root)
        if sroot not in sys.path:
            sys.path.insert(0, sroot)
    except Exception:
        pass
    mod = importlib.import_module("app")
    return mod


def find_videos(m, base: Path, recursive: bool) -> list[Path]:
    """
    Use server's media filter to find eligible videos.
    This respects hidden/.previews rules and app.MEDIA_EXTS.
    """
    it = base.rglob("*") if recursive else base.iterdir()
    vids: list[Path] = []
    for p in it:
        try:
            if m._is_original_media_file(p, base):
                vids.append(p)
        except Exception:
            continue
    vids.sort(key=lambda x: x.name.lower())
    return vids


def task_thumb(m, v: Path, force: bool):
    m.generate_thumbnail(v, force=force, time_spec="middle", quality=2)


def task_hover(m, v: Path, progress=None, cancel=None, fmt: str = "webm"):
    """
    Generate hover preview with optional progress and cancel callbacks.
    When a progress callback is provided, the backend uses a segmented path and
    reports per-segment progress via progress_cb(i, total).
    """
    m.generate_hover_preview(v, segments=9, seg_dur=0.8, width=240, fmt=fmt, progress_cb=progress, cancel_check=cancel)


def task_sprites(m, v: Path):
    d = m._sprite_defaults()
    m.generate_sprite_sheet(v, interval=float(d["interval"]), width=int(d["width"]), cols=int(d["cols"]), rows=int(d["rows"]), quality=int(d["quality"]))


def task_scenes(m, v: Path, thumbs: bool, clips: bool):
    # Default threshold/limit mirror server defaults
    m.generate_scene_artifacts(
        v,
        threshold=0.4,
        limit=0,
        gen_thumbs=thumbs,
        gen_clips=clips,
        thumbs_width=320,
        clip_duration=2.0,
    )


def task_heatmaps(m, v: Path, png: bool):
    # Default interval/mode align with server defaults
    m.compute_heatmaps(v, interval=5.0, mode="both", png=png)


def task_phash(m, v: Path):
    m.phash_create_single(v, frames=5, algo="ahash", combine="xor")


def task_metadata(m, v: Path, force: bool):
    m.metadata_single(v, force=force)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Generate media artifacts without running server")
    ap.add_argument("--root", default=os.environ.get("MEDIA_ROOT", os.getcwd()), help="Directory containing media files")
    ap.add_argument("--recursive", action="store_true", help="Recurse into subdirectories")
    ap.add_argument("--what", default="all", choices=[
        "all", "thumb", "hover", "sprites", "scenes", "heatmaps", "phash", "metadata"
    ], help="Which artifact(s) to generate")
    ap.add_argument("--force", action="store_true", help="Force overwrite where applicable")
    # Align with server default JOB_MAX_CONCURRENCY=4 (overridable via env)
    ap.add_argument("--concurrency", type=int, default=int(os.environ.get("JOB_MAX_CONCURRENCY", "4")), help="Max parallel workers")
    ap.add_argument("--scene-thumbs", action="store_true", help="For scenes: write thumbnail JPEGs")
    ap.add_argument("--scene-clips", action="store_true", help="For scenes: write MP4 clips")
    ap.add_argument("--heatmaps-png", action="store_true", help="For heatmaps: also write PNG strip")
    ap.add_argument("--ffmpeg-timelimit", type=int, default=int(os.environ.get("FFMPEG_TIMELIMIT", "600") or 600), help="Hard cap for each ffmpeg invocation in seconds (0 disables)")
    ap.add_argument("--no-ffprobe", action="store_true", help="Disable ffprobe (set FFPROBE_DISABLE=1) to avoid probe hangs; some features may be approximate")
    ap.add_argument("--hover-fmt", default=os.environ.get("HOVER_FMT", "webm"), choices=["webm", "mp4"], help="Container for hover previews (webm/libvpx-vp9 or mp4/h264)")
    ap.add_argument("--ffmpeg-verbose", action="store_true", help="Print ffmpeg commands (sets FFMPEG_DEBUG=1)")
    ap.add_argument("--ffmpeg-loglevel", default=os.environ.get("FFMPEG_LOGLEVEL", "error"), choices=["quiet", "panic", "fatal", "error", "warning", "info"], help="ffmpeg -loglevel (default: error)")
    # Hover generation strategy: by default the server attempts single-pass and can parse progress.
    # Expose parity flags that map to PREVIEW_SINGLE_PASS env while preserving progress reporting.
    ap.add_argument("--hover-single-pass", action="store_true", help="Prefer single-pass hover encoding (sets PREVIEW_SINGLE_PASS=1; progress still reported)")
    ap.add_argument("--hover-multi-step", action="store_true", help="Force multi-step hover encoding (sets PREVIEW_SINGLE_PASS=0)")
    ap.add_argument("--venv-status", action="store_true", help="Print the Python interpreter path in use and exit")
    # Default behavior: only-missing. Users can override with --recompute-all.
    ap.add_argument("--only-missing", action="store_true", default=None, help="Skip steps whose artifact already exists (default). Use --recompute-all to force regeneration.")
    ap.add_argument("--recompute-all", action="store_true", help="Force regenerate even if artifacts exist (overrides --only-missing)")

    args = ap.parse_args(argv)
    if args.venv_status:
        try:
            interp = sys.executable
            print(f"[cli] Interpreter: {interp}")
            print(f"[cli] In venv: {'yes' if os.environ.get('VIRTUAL_ENV') or (sys.prefix != getattr(sys, 'base_prefix', sys.prefix)) else 'no'}")
        except Exception:
            pass
        return 0
    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[cli] Root not found or not a dir: {root}", file=sys.stderr)
        return 2

    os.environ.setdefault("MEDIA_ROOT", str(root))
    # Optional cap to prevent runaway ffmpeg on problematic files
    if args.ffmpeg_timelimit and args.ffmpeg_timelimit > 0:
        os.environ["FFMPEG_TIMELIMIT"] = str(int(args.ffmpeg_timelimit))
    if args.no_ffprobe:
        os.environ["FFPROBE_DISABLE"] = "1"
    if args.ffmpeg_verbose:
        os.environ["FFMPEG_DEBUG"] = "1"
    if args.ffmpeg_loglevel:
        os.environ["FFMPEG_LOGLEVEL"] = str(args.ffmpeg_loglevel)

    m = import_app_module()
    # Honor hover single-pass/multi-step flags via env to match server behavior
    if args.hover_single_pass:
        os.environ["PREVIEW_SINGLE_PASS"] = "1"
    if args.hover_multi_step:
        os.environ["PREVIEW_SINGLE_PASS"] = "0"

    videos = find_videos(m, root, args.recursive)
    if not videos:
        try:
            exts = ",".join(sorted(getattr(m, "MEDIA_EXTS", {".mp4"})))
        except Exception:
            exts = ".mp4"
        print(f"[cli] No video files found (extensions: {exts}).")
        return 0

    # Cancellation support
    cancel_event = threading.Event()

    def _sigint_handler(signum, frame):
        cancel_event.set()
        print("\n[cli] Cancellation requested. Waiting for running tasks to finish current step...", file=sys.stderr)

    try:
        signal.signal(signal.SIGINT, _sigint_handler)
    except Exception:
        pass

    # Progress bars using tqdm if available
    try:
        from tqdm import tqdm as _tqdm  # type: ignore
        tqdm_fn: Optional[Callable[..., Any]] = _tqdm
    except Exception:
        tqdm_fn = None
    use_tqdm = bool(tqdm_fn and (sys.stderr.isatty() or sys.stdout.isatty()))

    # Determine steps per job based on --what
    def steps_for_job() -> list[str]:
        if args.what == "all":
            return [
                "metadata",
                "thumb",
                # Keep sprites and hover adjacent; server runs them in the same phase
                "sprites",
                "hover",
                "scenes",
                "heatmaps",
                "phash"
            ]
        return [args.what]

    workers = max(1, int(args.concurrency))
    total = len(videos)
    print(f"[cli] Processing {total} video(s) with concurrency={workers}")

    # Slot-based multi-bar manager (limit to #workers visible at once)
    class BarSlot:
        def __init__(self, pos: int):
            self.pos = pos
            self.bar: Optional[Any] = None  # allow tqdm instance instead of inferring NoneType
            self.in_use = False

    bar_slots = [BarSlot(i) for i in range(workers)]
    slots_lock = threading.Lock()

    def acquire_slot():
        if not use_tqdm or tqdm_fn is None:
            return None
        with slots_lock:
            for s in bar_slots:
                if not s.in_use:
                    s.in_use = True
                    # Create bar lazily
                    s.bar = tqdm_fn(total=len(steps_for_job()), position=s.pos, leave=False, ncols=80)
                    return s
        # No free slot; return a dummy (no bar), will print lines instead
        return None

    def release_slot(slot):
        if not slot:
            return
        with slots_lock:
            try:
                if slot.bar:
                    slot.bar.close()
            except Exception:
                pass
            slot.bar = None
            slot.in_use = False

    def artifact_exists(task: str, v: Path) -> bool:
        try:
            if task == "metadata":
                return m.metadata_path(v).exists()
            if task == "thumb":
                return m.thumbs_path(v).exists()
            if task == "hover":
                fmt = args.hover_fmt
                p = (m.artifact_dir(v) / f"{v.stem}.preview.{fmt}")
                try:
                    return p.exists() and p.stat().st_size > 0
                except Exception:
                    return p.exists()
            if task == "sprites":
                try:
                    sheet, jpath = m.sprite_sheet_paths(v)
                    return sheet.exists() and jpath.exists()
                except Exception:
                    return False
            if task == "scenes":
                try:
                    # Prefer strict server helper when available
                    return bool(getattr(m, "scenes_json_exists")(v))  # type: ignore[misc]
                except Exception:
                    return m.scenes_json_path(v).exists()
            if task == "heatmaps":
                try:
                    return bool(getattr(m, "heatmaps_json_exists")(v))  # type: ignore[misc]
                except Exception:
                    return m.heatmaps_json_path(v).exists()
            if task == "phash":
                return m.phash_path(v).exists()
        except Exception:
            return False
        return False

    # Per-file job
    def run_job(v: Path) -> str | None:
        steps = steps_for_job()
        slot = acquire_slot()
        name = v.name
        # Initialize bar description
        if slot and slot.bar:
            slot.bar.set_description_str(name[:40])
        completed = 0
        # Effective skipping mode: default to only-missing unless --recompute-all is used
        only_missing = True if not args.recompute_all else False
        if args.only_missing is True and not args.recompute_all:
            only_missing = True

        def advance(label: str):
            nonlocal completed
            completed += 1
            if slot and slot.bar:
                try:
                    slot.bar.set_postfix_str(label)
                    slot.bar.update(1)
                except Exception:
                    pass
            else:
                print(f"[cli] {name}: {label} ({completed}/{len(steps)})")

        def starting(label: str):
            # Log step start so the user sees what's currently running
            if not (slot and slot.bar):
                try:
                    sys.stderr.write(f"[cli] {name}: starting {label}...\n")
                    sys.stderr.flush()
                except Exception:
                    pass

        try:
            # Early cancellation before starting
            if cancel_event.is_set():
                return f"{v}: cancelled"
            if args.what == "all":
                if only_missing and artifact_exists("metadata", v):
                    advance("metadata (skip)")
                else:
                    starting("metadata"); task_metadata(m, v, args.force); advance("metadata")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                if only_missing and artifact_exists("thumb", v):
                    advance("thumb (skip)")
                else:
                    starting("thumb"); task_thumb(m, v, args.force); advance("thumb")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                # Hover progress: update bar postfix or print simple progress
                def _hover_progress(i: int, total: int):
                    if slot and slot.bar:
                        try:
                            slot.bar.set_postfix_str(f"hover {i}/{total}")
                        except Exception:
                            pass
                    else:
                        try:
                            sys.stderr.write(f"[cli] {name}: hover {i}/{total}\n")
                            sys.stderr.flush()
                        except Exception:
                            pass
                if only_missing and artifact_exists("hover", v):
                    advance("hover (skip)")
                else:
                    starting("hover")
                    try:
                        # Always provide progress; server handles single-pass progress internally when enabled
                        task_hover(m, v, progress=_hover_progress, cancel=cancel_event.is_set, fmt=args.hover_fmt)
                    except Exception as e:
                        # If webm fails, retry once with mp4 as a fallback
                        if args.hover_fmt == "webm":
                            try:
                                sys.stderr.write(f"[cli] {name}: webm failed ({e}); retrying as mp4...\n")
                                sys.stderr.flush()
                            except Exception:
                                pass
                            task_hover(m, v, progress=_hover_progress, cancel=cancel_event.is_set, fmt="mp4")
                        else:
                            raise
                    advance("hover")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                if only_missing and artifact_exists("sprites", v):
                    advance("sprites (skip)")
                else:
                    starting("sprites"); task_sprites(m, v); advance("sprites")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                if only_missing and artifact_exists("scenes", v):
                    advance("scenes (skip)")
                else:
                    starting("scenes"); task_scenes(m, v, thumbs=args.scene_thumbs, clips=args.scene_clips); advance("scenes")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                if only_missing and artifact_exists("heatmaps", v):
                    advance("heatmaps (skip)")
                else:
                    starting("heatmaps"); task_heatmaps(m, v, png=args.heatmaps_png); advance("heatmaps")
                if cancel_event.is_set():
                    return f"{v}: cancelled"
                if only_missing and artifact_exists("phash", v):
                    advance("phash (skip)")
                else:
                    starting("phash"); task_phash(m, v); advance("phash")
            elif args.what == "metadata":
                if only_missing and artifact_exists("metadata", v):
                    advance("metadata (skip)")
                else:
                    starting("metadata"); task_metadata(m, v, args.force); advance("metadata")
            elif args.what == "thumb":
                if only_missing and artifact_exists("thumb", v):
                    advance("thumb (skip)")
                else:
                    starting("thumb"); task_thumb(m, v, args.force); advance("thumb")
            elif args.what == "hover":
                if only_missing and artifact_exists("hover", v):
                    advance("hover (skip)")
                else:
                    def _hover_progress2(i: int, total: int):
                        if slot and slot.bar:
                            try:
                                slot.bar.set_postfix_str(f"hover {i}/{total}")
                            except Exception:
                                pass
                        else:
                            try:
                                sys.stderr.write(f"[cli] {name}: hover {i}/{total}\n")
                                sys.stderr.flush()
                            except Exception:
                                pass
                    starting("hover")
                    try:
                        task_hover(m, v, progress=_hover_progress2, cancel=cancel_event.is_set, fmt=args.hover_fmt)
                    except Exception as e:
                        if args.hover_fmt == "webm":
                            try:
                                sys.stderr.write(f"[cli] {name}: webm failed ({e}); retrying as mp4...\n")
                                sys.stderr.flush()
                            except Exception:
                                pass
                            task_hover(m, v, progress=_hover_progress2, cancel=cancel_event.is_set, fmt="mp4")
                        else:
                            raise
                    advance("hover")
            elif args.what == "sprites":
                if only_missing and artifact_exists("sprites", v):
                    advance("sprites (skip)")
                else:
                    starting("sprites"); task_sprites(m, v); advance("sprites")
            elif args.what == "scenes":
                if only_missing and artifact_exists("scenes", v):
                    advance("scenes (skip)")
                else:
                    starting("scenes"); task_scenes(m, v, thumbs=args.scene_thumbs, clips=args.scene_clips); advance("scenes")
            elif args.what == "heatmaps":
                if only_missing and artifact_exists("heatmaps", v):
                    advance("heatmaps (skip)")
                else:
                    starting("heatmaps"); task_heatmaps(m, v, png=args.heatmaps_png); advance("heatmaps")
            elif args.what == "phash":
                if only_missing and artifact_exists("phash", v):
                    advance("phash (skip)")
                else:
                    starting("phash"); task_phash(m, v); advance("phash")
            else:
                return f"unknown task {args.what}"
            return None
        except Exception as e:
            return f"{v}: {e}"
        finally:
            release_slot(slot)

    errors: list[str] = []
    done_count = 0
    is_tty = sys.stdout.isatty() or sys.stderr.isatty()
    show_simple_overall = (is_tty and not use_tqdm)
    # Submit futures so we can cancel pending ones if needed
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futures: list[cf.Future] = []
        for v in videos:
            if cancel_event.is_set():
                break
            futures.append(ex.submit(run_job, v))
        # Collect results as they finish
        for fut in cf.as_completed(futures):
            try:
                res = fut.result()
            except Exception as e:
                res = str(e)
            # Update overall simple progress if enabled
            done_count += 1
            if show_simple_overall and total > 0:
                pct = int((done_count / total) * 100)
                try:
                    sys.stdout.write(f"\r[cli] Overall: {done_count}/{total} ({pct}%)    ")
                    sys.stdout.flush()
                except Exception:
                    pass
            if res:
                # If cancelled, try to cancel remaining pending futures
                if "cancelled" in res:
                    for f in futures:
                        f.cancel()
                errors.append(res)
                print(f"[cli] ERROR: {res}", file=sys.stderr)
    if show_simple_overall:
        try:
            sys.stdout.write("\n")
            sys.stdout.flush()
        except Exception:
            pass

    if errors:
        # Distinguish pure-cancel from real errors
        only_cancel = all("cancelled" in e for e in errors)
        if only_cancel:
            print(f"[cli] Cancelled ({len(errors)} job(s) interrupted)")
            return 130  # 128+SIGINT
        print(f"[cli] Completed with {len(errors)} error(s)")
        return 1
    print("[cli] Completed successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
