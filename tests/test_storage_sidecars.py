import importlib
import json
import os
import sys
from pathlib import Path

import pytest


@pytest.fixture
def app_module(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    if "app" in sys.modules:
        module = importlib.reload(sys.modules["app"])
    else:
        module = importlib.import_module("app")
    module.STATE["root"] = tmp_path
    cache = module.STATE.get("_meta_cache")
    if isinstance(cache, dict):
        cache.clear()
    yield module
    cache = module.STATE.get("_meta_cache")
    if isinstance(cache, dict):
        cache.clear()


def test_artifact_dir_creation(app_module, tmp_path):
    video = tmp_path / "movies" / "sample.mp4"
    video.parent.mkdir(parents=True, exist_ok=True)
    video.touch()

    artifact_directory = app_module.artifact_dir(video)

    assert artifact_directory == video.parent / ".artifacts"
    assert artifact_directory.exists()
    assert artifact_directory.is_dir()


def test_metadata_single_stub_written_when_ffprobe_disabled(app_module, tmp_path, monkeypatch):
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake video")

    monkeypatch.setenv("FFPROBE_DISABLE", "1")
    try:
        app_module.metadata_single(video, force=True)
    finally:
        monkeypatch.delenv("FFPROBE_DISABLE", raising=False)

    metadata_file = app_module.metadata_path(video)
    assert metadata_file.exists()

    data = json.loads(metadata_file.read_text())
    assert data.get("format", {}).get("duration") == "0.0"
    video_streams = [s for s in data.get("streams", []) if (s or {}).get("codec_type") == "video"]
    assert video_streams, "expected at least one video stream entry"
    stream = video_streams[0]
    assert stream.get("width") == 640
    assert stream.get("height") == 360


def test_meta_summary_cached_tracks_sidecar_changes(app_module, tmp_path):
    video = tmp_path / "movie.mp4"
    video.touch()

    metadata_file = app_module.metadata_path(video)
    first_payload = {
        "format": {"duration": "12.5", "tags": {"title": "First"}},
        "streams": [{"codec_type": "video", "width": 1920, "height": 1080}],
    }
    metadata_file.write_text(json.dumps(first_payload))

    duration, title, width, height = app_module._meta_summary_cached(video)
    assert duration == 12.5
    assert title == "First"
    assert width == 1920
    assert height == 1080

    cache = app_module.STATE.get("_meta_cache")
    key = str(video.resolve())
    assert isinstance(cache, dict)
    assert key in cache

    second_payload = {
        "format": {"duration": "21.0", "tags": {"title": "Second"}},
        "streams": [{"codec_type": "video", "width": 1280, "height": 720}],
    }
    metadata_file.write_text(json.dumps(second_payload))
    current_mtime = metadata_file.stat().st_mtime
    os.utime(metadata_file, (current_mtime + 5, current_mtime + 5))

    duration2, title2, width2, height2 = app_module._meta_summary_cached(video)
    assert duration2 == 21.0
    assert title2 == "Second"
    assert width2 == 1280
    assert height2 == 720


def test_faces_exists_check_requires_embeddings(app_module, tmp_path):
    video = tmp_path / "faces.mp4"
    video.touch()
    faces_file = app_module.faces_path(video)

    real_faces = {
        "faces": [
            {"embedding": [0.1, 0.2], "box": [10, 20, 30, 40]},
        ]
    }
    faces_file.write_text(json.dumps(real_faces))
    assert app_module.faces_exists_check(video)

    stub_faces = {
        "faces": [
            {"embedding": [], "box": [0, 0, 100, 100]},
        ]
    }
    faces_file.write_text(json.dumps(stub_faces))
    os.utime(faces_file, None)
    assert not app_module.faces_exists_check(video)


def test_find_subtitles_prefers_artifact_directory(app_module, tmp_path):
    video = tmp_path / "show.mkv"
    video.touch()

    art_sub = app_module.artifact_dir(video) / f"{video.stem}.subtitles.srt"
    art_sub.write_text("1\n00:00:00,000 --> 00:00:01,000\nHi\n")

    side_sub = video.with_suffix(".subtitles.srt")
    side_sub.write_text("1\n00:00:00,000 --> 00:00:02,000\nSide\n")

    found = app_module.find_subtitles(video)
    assert found == art_sub

    art_sub.unlink()
    found_side = app_module.find_subtitles(video)
    assert found_side == side_sub
