import json
from pathlib import Path

import app


def _relative_path(p: Path) -> str:
    return str(p.relative_to(app.STATE["root"]))


def _write_video_with_sidecars(root: Path, name: str, phash_hex: str, *, duration: float = 10.0,
                               width: int = 1280, height: int = 720, size_bytes: int = 1024) -> Path:
    video_path = root / name
    video_path.parent.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(b"0" * max(1, size_bytes))

    metadata = {
        "format": {
            "duration": str(duration),
            "bit_rate": 2_000_000,
            "tags": {"title": name},
        },
        "streams": [
            {"codec_type": "video", "width": width, "height": height, "bit_rate": 1_500_000},
            {"codec_type": "audio", "bit_rate": 192000},
        ],
    }

    artifacts_dir = app.artifact_dir(video_path)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    app.phash_path(video_path).write_text(json.dumps({"phash": phash_hex}))
    app.metadata_path(video_path).write_text(json.dumps(metadata))
    return video_path


def _write_tags_sidecar(video_path: Path, *, tags=None, performers=None, description="", rating=0, favorite=False) -> None:
    payload = {
        "video": video_path.name,
        "tags": tags or [],
        "performers": performers or [],
        "description": description,
        "rating": rating,
        "favorite": favorite,
    }
    app._tags_file(video_path).write_text(json.dumps(payload))


def _set_media_attr_entry(video_path: Path, *, tags=None, performers=None) -> str:
    rel = _relative_path(video_path)
    app._MEDIA_ATTR[rel] = {
        "tags": list(tags or []),
        "performers": list(performers or []),
    }
    app._save_media_attr([rel])
    return rel
