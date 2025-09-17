#!/usr/bin/env python3
"""
CLI to generate artifacts for all MP4s in a directory without running the server.

Artifacts covered:
- thumbnail JPG
- hover preview (webm)
- sprite sheet JPG + JSON
- scene JSON (+ optional thumbs/clips)
- heatmaps JSON (+ optional PNG)
- phash JSON
- metadata JSON

Usage:
  python scripts/generate_artifacts.py \
    --root /path/to/videos \
    [--recursive] \
    [--what all|thumb|hover|sprites|scenes|heatmaps|phash|metadata] \
    [--force] [--concurrency 2]

Notes:
- Respects MEDIA_ROOT if set; --root overrides.
- Requires ffmpeg/ffprobe for full fidelity, otherwise writes stubs where supported.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import sys
from pathlib import Path

# Import internal helpers from app.py without triggering server run
import importlib


def import_app_module():
    mod = importlib.import_module("app")
    return mod


def find_mp4s(base: Path, recursive: bool) -> list[Path]:
    if recursive:
        return [p for p in base.rglob("*.mp4") if p.is_file()]
    return [p for p in base.glob("*.mp4") if p.is_file()]


def task_thumb(m, v: Path, force: bool):
    m.generate_thumbnail(v, force=force, time_spec="middle", quality=2)


def task_hover(m, v: Path):
    m.generate_hover_preview(v, segments=9, seg_dur=0.8, width=240)


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


def task_heatmaps(m, v: Path, png: bool, force: bool):
    # Default interval/mode align with server defaults
    m.compute_heatmaps(v, interval=5.0, mode="both", png=png, force=force)


def task_phash(m, v: Path):
    m.phash_create_single(v, frames=5, algo="ahash", combine="xor")


def task_metadata(m, v: Path, force: bool):
    m.metadata_single(v, force=force)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Generate media artifacts without running server")
    ap.add_argument("--root", default=os.environ.get("MEDIA_ROOT", os.getcwd()), help="Directory containing MP4 files")
    ap.add_argument("--recursive", action="store_true", help="Recurse into subdirectories")
    ap.add_argument("--what", default="all", choices=[
        "all", "thumb", "hover", "sprites", "scenes", "heatmaps", "phash", "metadata"
    ], help="Which artifact(s) to generate")
    ap.add_argument("--force", action="store_true", help="Force overwrite where applicable")
    ap.add_argument("--concurrency", type=int, default=int(os.environ.get("JOB_MAX_CONCURRENCY", 2)), help="Max parallel workers")
    ap.add_argument("--scene-thumbs", action="store_true", help="For scenes: write thumbnail JPEGs")
    ap.add_argument("--scene-clips", action="store_true", help="For scenes: write MP4 clips")
    ap.add_argument("--heatmaps-png", action="store_true", help="For heatmaps: also write PNG strip")

    args = ap.parse_args(argv)
    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"[cli] Root not found or not a dir: {root}", file=sys.stderr)
        return 2

    os.environ.setdefault("MEDIA_ROOT", str(root))

    m = import_app_module()
    videos = find_mp4s(root, args.recursive)
    if not videos:
        print("[cli] No MP4 files found.")
        return 0

    # Map what -> callable
    def do(v: Path):
        try:
            if args.what == "all":
                task_metadata(m, v, args.force)
                task_thumb(m, v, args.force)
                task_hover(m, v)
                task_sprites(m, v)
                task_scenes(m, v, thumbs=args.scene_thumbs, clips=args.scene_clips)
                task_heatmaps(m, v, png=args.heatmaps_png, force=args.force)
                task_phash(m, v)
            elif args.what == "metadata":
                task_metadata(m, v, args.force)
            elif args.what == "thumb":
                task_thumb(m, v, args.force)
            elif args.what == "hover":
                task_hover(m, v)
            elif args.what == "sprites":
                task_sprites(m, v)
            elif args.what == "scenes":
                task_scenes(m, v, thumbs=args.scene_thumbs, clips=args.scene_clips)
            elif args.what == "heatmaps":
                task_heatmaps(m, v, png=args.heatmaps_png, force=args.force)
            elif args.what == "phash":
                task_phash(m, v)
            else:
                return f"unknown task {args.what}"
            return None
        except Exception as e:
            return f"{v}: {e}"

    workers = max(1, int(args.concurrency))
    print(f"[cli] Processing {len(videos)} video(s) with concurrency={workers}")
    errors: list[str] = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(do, videos):
            if res:
                errors.append(res)
                print(f"[cli] ERROR: {res}", file=sys.stderr)

    if errors:
        print(f"[cli] Completed with {len(errors)} error(s)")
        return 1
    print("[cli] Completed successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
