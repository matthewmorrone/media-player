from typing import Optional

# Legacy square/padding helpers removed; face boxes are stored in raw normalized form [x,y,w,h].
import json
import copy
import mimetypes
from email.utils import formatdate
import os
import shutil
import subprocess
import signal
import sys
import tempfile
import threading
import re
import time
import uuid
import shlex
import logging
import asyncio
from tools.idle_worker import IdleWorker  # type: ignore

_IDLE_WORKER_INST: Optional[IdleWorker] = None

def _idle_conf_app() -> dict:
    cfg = dict(STATE.get("config") or {})
    block = dict(cfg.get("idle_worker") or cfg.get("idle") or {})
    def _get(name: str, default):
        return block.get(name, cfg.get(f"idle_{name}", default))
    return {
        "enabled": bool(_get("enabled", False)),
        "cpu_percent_max": float(_get("cpu_percent_max", 25.0)),
        "load_per_core_max": float(_get("load_per_core_max", 0.60)),
        "min_idle_seconds": int(_get("min_idle_seconds", 60)),
        "poll_seconds": int(_get("poll_seconds", 15)),
        "max_concurrent": int(_get("max_concurrent", 1)),
        "artifacts": list(_get("artifacts", [
            "metadata", "thumbnail", "preview", "sprites", "phash", "heatmap", "faces"
        ])),
    }

def _idle_active_jobs_app() -> int:
    try:
        with JOB_LOCK:
            return sum(1 for j in JOBS.values() if str(j.get("state")).lower() == "running")
    except Exception:
        return 0

def _artifact_missing_app(kind: str, v: Path) -> bool:
    k = kind.lower()
    try:
        if k == "metadata":
            return not metadata_path(v).exists()
        if k == "thumbnail":
            p = thumbnails_path(v)
            if p.exists():
                return False
            sib = v.parent / f"{v.stem}{SUFFIX_THUMBNAIL_JPG}"
            return not sib.exists()
        if k == "preview":
            return not (_file_nonempty(preview_webm_path(v)) or _file_nonempty(preview_mp4_path(v)))
        if k == "sprites":
            jpg, jsonp = sprite_sheet_paths(v)
            return not (jpg.exists() and jsonp.exists())
        if k == "heatmap":
            return not heatmap_json_exists(v)
        if k == "phash":
            return not phash_path(v).exists()
        if k == "faces":
            return not faces_exists_check(v)
    except Exception:
        return False
    return False

def _idle_pick_next_missing_app(base: Path, kinds: list[str]) -> tuple[Optional[str], Optional[str]]:
    vids = _iter_videos(base, recursive=True)
    for k in kinds:
        for v in vids:
            try:
                if _artifact_missing_app(k, v):
                    rel = str(v.relative_to(STATE["root"])) if str(v).startswith(str(STATE["root"])) else str(v)
                    return k, rel
            except Exception:
                continue
    return None, None

def _idle_submit_app(task: str, relpath: str) -> Optional[str]:
    try:
        jr = JobRequest(task=task, directory=str(STATE["root"]), recursive=False, force=False, params={"targets": [relpath]})
        out = jobs_submit(jr)
        jid = (out or {}).get("id") if isinstance(out, dict) else None
        return str(jid) if jid else None
    except Exception:
        return None

@app.on_event("startup")
async def _on_startup_idle_worker():  # pragma: no cover
    global _IDLE_WORKER_INST
    conf = _idle_conf_app()
    if not bool(conf.get("enabled", False)):
        return
    if _IDLE_WORKER_INST and _IDLE_WORKER_INST.is_running():
        return
    _IDLE_WORKER_INST = IdleWorker(
        conf_getter=_idle_conf_app,
        base_path=STATE["root"].resolve(),
        active_jobs_fn=_idle_active_jobs_app,
        pick_next_fn=_idle_pick_next_missing_app,
        submit_fn=_idle_submit_app,
    )
    _IDLE_WORKER_INST.start()

@app.on_event("shutdown")
async def _on_shutdown_idle_worker():  # pragma: no cover
    try:
        if _IDLE_WORKER_INST:
            _IDLE_WORKER_INST.stop()
    except Exception:
        pass
