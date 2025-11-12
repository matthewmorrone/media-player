from __future__ import annotations

import importlib
import json
import logging
import os
import sys
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app_module(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    repo_root = Path(__file__).resolve().parents[1]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
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


@pytest.fixture
def client(app_module):
    with TestClient(app_module.app) as test_client:
        yield test_client


def _create_video(
    app_module,
    path: Path,
    *,
    metadata: dict | None = None,
    phash: str | None = None,
    tags: list[str] | None = None,
    performers: list[str] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"test video")
    if metadata is not None:
        app_module.metadata_path(path).write_text(json.dumps(metadata))
    if phash is not None:
        app_module.phash_path(path).write_text(json.dumps({"phash": phash}))
    if tags is not None or performers is not None:
        payload = {
            "video": path.name,
            "tags": tags or [],
            "performers": performers or [],
            "description": "",
            "rating": 0,
        }
        tag_file = app_module._tags_file(path)  # type: ignore[attr-defined]
        tag_file.parent.mkdir(parents=True, exist_ok=True)
        tag_file.write_text(json.dumps(payload, indent=2))


def _relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def test_health_and_config_endpoints(app_module, client, tmp_path):
    health = client.get("/api/health")
    assert health.status_code == 200
    payload = health.json()
    assert payload.get("ok") is True
    assert payload.get("root") == str(tmp_path)
    assert payload.get("ffmpeg") in {True, False}

    config = client.get("/config")
    assert config.status_code == 200
    cfg = config.json()
    assert cfg.get("root") == str(tmp_path)
    assert "media_exts" in cfg
    assert "features" in cfg


def test_library_listing_search_and_tag_filters(app_module, client, tmp_path):
    alpha = tmp_path / "alpha.mp4"
    beta = tmp_path / "beta.mp4"
    _create_video(
        app_module,
        alpha,
        metadata={
            "format": {"duration": "30.0", "tags": {"title": "Alpha Clip"}},
            "streams": [{"codec_type": "video", "width": 854, "height": 480}],
        },
        tags=["Drama"],
    )
    _create_video(
        app_module,
        beta,
        metadata={
            "format": {"duration": "45.5", "tags": {"title": "Beta Feature"}},
            "streams": [{"codec_type": "video", "width": 1920, "height": 1080}],
        },
        tags=["Action"],
    )

    listing = client.get("/api/library")
    assert listing.status_code == 200
    data = listing.json()
    assert data["status"] == "success"
    files = {item["name"] for item in data["data"]["files"]}
    assert {"alpha.mp4", "beta.mp4"}.issubset(files)

    search = client.get("/api/library", params={"search": "beta"})
    assert search.status_code == 200
    results = search.json()["data"]["files"]
    assert len(results) == 1
    assert results[0]["name"] == "beta.mp4"

    tagged = client.get("/api/library", params={"tags": "Action"})
    assert tagged.status_code == 200
    tagged_files = [item["name"] for item in tagged.json()["data"]["files"]]
    assert tagged_files == ["beta.mp4"]

    hi_res = client.get("/api/library", params={"res_min": 720})
    assert hi_res.status_code == 200
    hi_files = [item["name"] for item in hi_res.json()["data"]["files"]]
    assert hi_files == ["beta.mp4"]


def test_duplicates_and_compare_meta_endpoints(app_module, client, tmp_path):
    first = tmp_path / "first.mp4"
    second = tmp_path / "second.mp4"
    meta = {
        "format": {"duration": "60", "tags": {"title": "Dupe"}},
        "streams": [{"codec_type": "video", "width": 1280, "height": 720}],
    }
    _create_video(app_module, first, metadata=meta, phash="ffffffffffffffff")
    _create_video(app_module, second, metadata=meta, phash="ffffffffffffffff")

    dupes = client.get("/api/duplicates/list", params={"directory": ".", "recursive": True})
    assert dupes.status_code == 200
    dup_payload = dupes.json()
    assert dup_payload["status"] == "success"
    pairs = dup_payload["data"]["pairs"]
    assert len(pairs) == 1
    assert pairs[0]["similarity"] >= 0.99

    clusters = client.get("/api/phash/duplicates")
    assert clusters.status_code == 200
    cluster_payload = clusters.json()
    assert cluster_payload["status"] == "success"
    cluster_data = cluster_payload["data"]
    if "total_groups" in cluster_data:
        assert cluster_data["total_groups"] >= 0
        assert cluster_data["data"] == []
    else:
        assert cluster_data == {"data": []}

    compare = client.get(
        "/api/compare/meta",
        params={"path_a": _relative(first, tmp_path), "path_b": _relative(second, tmp_path)},
    )
    assert compare.status_code == 200
    compare_data = compare.json()
    assert compare_data["status"] == "success"
    metrics = compare_data["data"]["metrics"]
    assert metrics["phash_distance"] == 0
    assert metrics["same_resolution"] is True


def test_registry_tag_and_performer_crud(app_module, client, tmp_path):
    video = tmp_path / "registry.mp4"
    _create_video(app_module, video, tags=["action hero"], performers=["primary star"])

    tag_create = client.post("/api/registry/tags/create", json={"name": "Action Hero"})
    assert tag_create.status_code == 201

    rewrite_tags = client.post("/api/registry/tags/rewrite-sidecars")
    assert rewrite_tags.status_code == 200
    tag_sidecar = json.loads((app_module._tags_file(video)).read_text())  # type: ignore[attr-defined]
    assert tag_sidecar["tags"] == ["Action Hero"]

    tag_list = client.get("/api/registry/tags")
    assert tag_list.status_code == 200
    names = [t["name"] for t in tag_list.json()["data"]["tags"]]
    assert names == ["Action Hero"]

    delete_tag = client.post("/api/registry/tags/delete", json={"name": "Action Hero"})
    assert delete_tag.status_code == 200

    perf_create = client.post(
        "/api/registry/performers/create",
        json={"name": "Primary Star", "images": ["a.jpg"]},
    )
    assert perf_create.status_code == 201

    rewrite_perf = client.post("/api/registry/performers/rewrite-sidecars")
    assert rewrite_perf.status_code == 200
    perf_sidecar = json.loads((app_module._tags_file(video)).read_text())  # type: ignore[attr-defined]
    assert perf_sidecar["performers"] == ["Primary Star"]

    update_perf = client.post(
        "/api/registry/performers/update",
        json={"name": "Primary Star", "add_images": ["b.jpg"]},
    )
    assert update_perf.status_code == 200
    assert sorted(update_perf.json()["data"]["images"]) == ["a.jpg", "b.jpg"]

    delete_perf = client.post("/api/registry/performers/delete", json={"name": "Primary Star"})
    assert delete_perf.status_code == 200


def test_thumbnail_create_and_get(app_module, client, tmp_path):
    clip = tmp_path / "clip.mp4"
    _create_video(
        app_module,
        clip,
        metadata={
            "format": {"duration": "12.0", "tags": {"title": "Clip"}},
            "streams": [{"codec_type": "video", "width": 640, "height": 360}],
        },
    )
    rel = _relative(clip, tmp_path)

    create_resp = client.post("/api/thumbnail/create_inline", params={"path": rel})
    assert create_resp.status_code == 200
    thumb_file = app_module.thumbs_path(clip)
    assert thumb_file.exists()
    assert thumb_file.stat().st_size > 0

    fetch = client.get("/api/thumbnail/get", params={"path": rel})
    assert fetch.status_code == 200
    assert fetch.headers["Content-Type"].startswith("image/")
    assert fetch.content


def test_health_redirect(client):
    response = client.get("/health", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/api/health"


def test_static_assets_served(client):
    index_html = client.get("/")
    assert index_html.status_code == 200
    assert "<!doctype html" in index_html.text.lower()

    css_resp = client.get("/index.css")
    assert css_resp.status_code == 200
    assert "body" in css_resp.text

    js_resp = client.get("/index.js")
    assert js_resp.status_code == 200
    assert "function" in js_resp.text


def test_config_endpoint_includes_capabilities(app_module, client, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "ffmpeg_available", lambda: False)
    monkeypatch.setattr(app_module, "ffprobe_available", lambda: False)
    cfg = client.get("/config")
    assert cfg.status_code == 200
    payload = cfg.json()
    assert payload["root"] == str(tmp_path)
    assert payload["capabilities"]["subtitles_backend"] in {"stub", "auto"}
    assert payload["features"]["sprites"] is True


def test_root_set_endpoint_validates_paths(client, tmp_path):
    new_root = tmp_path / "new_root"
    new_root.mkdir()
    ok = client.post("/api/root/set", json={"root": str(new_root)})
    assert ok.status_code == 200
    assert ok.json()["data"]["root"] == str(new_root.resolve())

    missing = client.post("/api/root/set", json={"root": str(tmp_path / "missing")})
    assert missing.status_code == 404


def test_tags_export_and_import_roundtrip(app_module, client, tmp_path):
    video = tmp_path / "tagged.mp4"
    _create_video(app_module, video)

    export = client.get("/tags/export")
    assert export.status_code == 200
    data = export.json()
    assert data["count"] == 1
    assert data["videos"][0]["tags"] == []

    payload = {
        "videos": [
            {
                "path": str(video),
                "tags": ["alpha", "beta"],
                "performers": ["lead"],
                "description": "desc",
                "rating": 7,
            }
        ],
        "replace": True,
    }
    imported = client.post("/tags/import", json=payload)
    assert imported.status_code == 200
    assert imported.json() == {"updated": 1}

    tag_sidecar = json.loads((app_module._tags_file(video)).read_text())  # type: ignore[attr-defined]
    assert tag_sidecar["tags"] == ["alpha", "beta"]
    assert tag_sidecar["performers"] == ["lead"]
    assert tag_sidecar["description"] == "desc"
    assert tag_sidecar["rating"] == 5


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


def test_parse_time_spec_variants(app_module):
    assert app_module.parse_time_spec("start", 100.0) == 0.0
    assert app_module.parse_time_spec("50%", 200.0) == 100.0
    assert app_module.parse_time_spec("10", None) == 10.0
    assert app_module.parse_time_spec("middle", 60.0) == 30.0
    assert app_module.parse_time_spec("-5", None) == 0.0


def test_artifact_kinds_for_stem_includes_known_suffixes(app_module):
    kinds = app_module._artifact_kinds_for_stem("sample")
    expected = {
        "sample.metadata.json",
        "sample.thumbnail.jpg",
        "sample.phash.json",
        "sample.sprites.jpg",
        "sample.sprites.json",
    }
    assert expected.issubset(kinds)


def test_build_artifacts_info_reflects_present_files(app_module, tmp_path):
    video = tmp_path / "info.mp4"
    _create_video(app_module, video)

    thumb = app_module.thumbs_path(video)
    thumb.parent.mkdir(parents=True, exist_ok=True)
    thumb.write_bytes(b"0")
    phash = app_module.phash_path(video)
    phash.parent.mkdir(parents=True, exist_ok=True)
    phash.write_text(json.dumps({"phash": "abc"}))
    subtitle = app_module.artifact_dir(video) / f"{video.stem}.subtitles.srt"
    subtitle.write_text("1\n00:00:00,000 --> 00:00:01,000\nHi\n")

    info = app_module._build_artifacts_info(video)
    assert info["cover"] is True
    assert info["phash"] is True
    assert info["subtitles"] is True
    assert info["faces"] is False


def test_find_mp4s_respects_recursion(app_module, tmp_path):
    root = tmp_path
    (root / "a.mp4").write_bytes(b"a")
    nested_dir = root / "nested"
    nested_dir.mkdir()
    (nested_dir / "b.mp4").write_bytes(b"b")
    (nested_dir / "c.txt").write_text("noop")

    non_recursive = app_module._find_mp4s(root, recursive=False)
    assert [p.name for p in non_recursive] == ["a.mp4"]

    recursive = app_module._find_mp4s(root, recursive=True)
    assert [p.name for p in recursive] == ["a.mp4", "b.mp4"]


def test_require_ffmpeg_or_error_guard(app_module, monkeypatch):
    monkeypatch.setattr(app_module, "ffmpeg_available", lambda: True)
    app_module._require_ffmpeg_or_error("thumbs")

    monkeypatch.setattr(app_module, "ffmpeg_available", lambda: False)
    with pytest.raises(Exception):
        app_module._require_ffmpeg_or_error("thumbs")


def test_ffmpeg_threads_flags_and_timelimit(monkeypatch, app_module):
    monkeypatch.setenv("FFMPEG_THREADS", "4")
    monkeypatch.setenv("FFMPEG_TIMELIMIT", "120")
    assert app_module._ffmpeg_threads_flags() == ["-threads", "4", "-timelimit", "120"]

    monkeypatch.setenv("FFMPEG_THREADS", "not-a-number")
    monkeypatch.setenv("FFMPEG_TIMELIMIT", "0")
    assert app_module._ffmpeg_threads_flags() == ["-threads", "1"]


def test_ffmpeg_hwaccel_and_vp9_flags(monkeypatch, app_module):
    monkeypatch.setenv("FFMPEG_HWACCEL", "auto")
    assert app_module._ffmpeg_hwaccel_flags() == ["-hwaccel", "auto"]

    monkeypatch.setenv("VP9_CPU_USED", "20")
    flags = app_module._vp9_realtime_flags()
    assert "-cpu-used" in flags
    idx = flags.index("-cpu-used")
    assert flags[idx + 1] == "15"  # clamped max


def test_effective_preview_crf_and_scene_quality(monkeypatch, app_module):
    monkeypatch.setenv("THUMBNAIL_QUALITY", "2")
    assert app_module._effective_preview_crf_vp9() == 30
    assert app_module._effective_preview_crf_h264() == 18

    monkeypatch.setenv("THUMBNAIL_QUALITY", "31")
    assert app_module._effective_preview_crf_vp9() == 55
    assert app_module._effective_preview_crf_h264() == 44

    monkeypatch.setenv("SCENE_THUMB_QUALITY", "50")
    assert app_module._default_scene_thumb_q() == 31

    monkeypatch.setenv("SCENE_CLIP_CRF", "5")
    assert app_module._default_scene_clip_crf() == 10


def test_has_module_and_module_version(monkeypatch, app_module):
    assert app_module._has_module("json") is True
    assert app_module._has_module("nonexistent_module_xyz") is False

    fake = ModuleType("fake_module_version")
    fake.__version__ = (1, 2, 3)
    monkeypatch.setitem(sys.modules, "fake_module_version", fake)
    try:
        assert app_module._module_version("fake_module_version") == "1.2.3"
    finally:
        sys.modules.pop("fake_module_version", None)

    fake_missing = ModuleType("fake_missing_version")
    monkeypatch.setitem(sys.modules, "fake_missing_version", fake_missing)
    try:
        assert app_module._module_version("fake_missing_version") is None
    finally:
        sys.modules.pop("fake_missing_version", None)


def test_scenes_helpers_and_sprite_paths(app_module, tmp_path):
    video = tmp_path / "scene.mp4"
    video.write_bytes(b"data")

    directory = app_module.scenes_dir(video)
    assert directory.exists()
    assert directory.name == f"{video.stem}.scenes"

    json_path = app_module.scenes_json_path(video)
    json_path.write_text("")
    assert not app_module.scenes_json_exists(video)

    json_path.write_text("{\"scenes\": []}")
    assert app_module.scenes_json_exists(video)

    sheet, meta = app_module.sprite_sheet_paths(video)
    assert sheet.name.endswith(app_module.SUFFIX_SPRITES_JPG)
    assert meta.name.endswith(app_module.SUFFIX_SPRITES_JSON)


def test_uvicorn_access_filter_behavior(monkeypatch, app_module):
    logger = logging.getLogger("uvicorn.access")
    original_filters = list(logger.filters)
    try:
        logger.filters.clear()
        app_module._install_uvicorn_access_filter_once()
        filters = [f for f in logger.filters if isinstance(f, app_module._UvicornAccessFilter)]
        assert len(filters) == 1
        filt = filters[0]

        suppress = logging.LogRecord(
            "uvicorn.access",
            logging.INFO,
            __file__,
            0,
            '"GET /api/tasks/jobs HTTP/1.1" 200 OK',
            (),
            None,
        )
        assert not filt.filter(suppress)

        monkeypatch.setenv("ENABLE_GET_ACCESS_LOG", "1")
        allow = logging.LogRecord(
            "uvicorn.access",
            logging.INFO,
            __file__,
            0,
            '"GET /api/other HTTP/1.1" 200 OK',
            (),
            None,
        )
        assert filt.filter(allow)
    finally:
        logger.filters[:] = original_filters
