from __future__ import annotations

import importlib
import hashlib
import json
import logging
import os
import sys
import time
from contextlib import nullcontext
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


def test_artifacts_import_and_video_discovery(tmp_path, app_module, monkeypatch):
    import artifacts as cli

    repo_root = Path(__file__).resolve().parents[1]
    monkeypatch.chdir(repo_root)
    module = cli.import_app_module()
    assert module is app_module

    alpha = tmp_path / "alpha.mp4"
    alpha.write_bytes(b"data")
    hidden_dir = tmp_path / ".artifacts"
    hidden_dir.mkdir()
    (hidden_dir / "alpha.preview.webm").write_bytes(b"preview")
    nested = tmp_path / "nested"
    nested.mkdir()
    beta = nested / "beta.mp4"
    beta.write_text("clip")

    videos = cli.find_videos(app_module, tmp_path, recursive=False)
    assert videos == [alpha]

    recursive = cli.find_videos(app_module, tmp_path, recursive=True)
    assert recursive == [alpha, beta]


def test_artifact_task_helpers_invoke_expected_methods(tmp_path):
    import artifacts as cli

    calls: list[tuple[str, tuple]] = []
    progress_events: list[tuple[int, int]] = []

    class Dummy:
        def generate_thumbnail(self, path, *, force, time_spec, quality):
            calls.append(("thumb", (force, time_spec, quality)))
            assert force is True
            assert time_spec == "middle"
            assert quality == 2

        def generate_hover_preview(self, path, *, segments, seg_dur, width, fmt, progress_cb, cancel_check):
            calls.append(("hover", (segments, seg_dur, width, fmt)))
            assert segments == 9
            assert seg_dur == 0.8
            assert width == 240
            assert fmt == "mp4"
            assert progress_cb is progress
            assert cancel_check is cancel
            progress_cb(1, segments)

        def _sprite_defaults(self):
            return {"interval": "2.5", "width": "320", "cols": "5", "rows": "3", "quality": "75"}

        def generate_sprite_sheet(self, path, *, interval, width, cols, rows, quality):
            calls.append(("sprites", (interval, width, cols, rows, quality)))
            assert isinstance(interval, float)
            assert (width, cols, rows, quality) == (320, 5, 3, 75)

        def generate_scene_artifacts(self, path, *, threshold, limit, gen_thumbs, gen_clips, thumbs_width, clip_duration):
            calls.append(("scenes", (threshold, limit, gen_thumbs, gen_clips, thumbs_width, clip_duration)))
            assert threshold == 0.4
            assert limit == 0
            assert gen_thumbs is False
            assert gen_clips is True
            assert thumbs_width == 320
            assert clip_duration == 2.0

        def compute_heatmaps(self, path, *, interval, mode, png):
            calls.append(("heatmaps", (interval, mode, png)))
            assert interval == 5.0
            assert mode == "both"
            assert png is True

        def phash_create_single(self, path, *, frames, algo, combine):
            calls.append(("phash", (frames, algo, combine)))
            assert (frames, algo, combine) == (5, "ahash", "xor")

        def metadata_single(self, path, *, force):
            calls.append(("metadata", (force,)))
            assert force is False

    dummy = Dummy()
    target = tmp_path / "clip.mp4"
    def progress(step: int, total: int):
        progress_events.append((step, total))

    def cancel():
        return False

    cli.task_thumb(dummy, target, force=True)
    cli.task_hover(dummy, target, progress=progress, cancel=cancel, fmt="mp4")
    cli.task_sprites(dummy, target)
    cli.task_scenes(dummy, target, thumbs=False, clips=True)
    cli.task_heatmaps(dummy, target, png=True)
    cli.task_phash(dummy, target)
    cli.task_metadata(dummy, target, force=False)

    order = [name for name, _ in calls]
    assert order == [
        "thumb",
        "hover",
        "sprites",
        "scenes",
        "heatmaps",
        "phash",
        "metadata",
    ]
    assert progress_events == [(1, 9)]


def test_artifacts_main_handles_missing_root(tmp_path, capsys):
    import artifacts as cli

    missing = tmp_path / "missing"
    code = cli.main(["--root", str(missing)])
    captured = capsys.readouterr()
    assert code == 2
    assert "Root not found" in captured.err


def test_artifacts_main_no_videos(monkeypatch, tmp_path, capsys):
    import artifacts as cli

    root = tmp_path / "library"
    root.mkdir()

    class Stub:
        MEDIA_EXTS = {".mp4", ".mkv"}

    monkeypatch.setattr(cli, "import_app_module", lambda: Stub())
    monkeypatch.setattr(cli, "find_videos", lambda m, base, recursive: [])
    code = cli.main(["--root", str(root)])
    out = capsys.readouterr().out
    assert code == 0
    assert "No video files found" in out


def test_artifacts_main_runs_all_tasks(monkeypatch, tmp_path, capsys):
    import artifacts as cli

    video = tmp_path / "movie.mp4"
    video.write_bytes(b"binary")

    class StubModule:
        MEDIA_EXTS = {".mp4"}

        def metadata_path(self, v: Path) -> Path:
            return tmp_path / f"{v.stem}.metadata.json"

        def thumbs_path(self, v: Path) -> Path:
            return tmp_path / f"{v.stem}.thumb.jpg"

        def artifact_dir(self, v: Path) -> Path:
            d = tmp_path / f"{v.stem}.artifacts"
            d.mkdir(exist_ok=True)
            return d

        def sprite_sheet_paths(self, v: Path):
            base = self.artifact_dir(v)
            return base / f"{v.stem}.sprites.jpg", base / f"{v.stem}.sprites.json"

        def scenes_json_exists(self, v: Path) -> bool:
            return False

        def scenes_json_path(self, v: Path) -> Path:
            return self.artifact_dir(v) / f"{v.stem}.scenes.json"

        def heatmaps_json_exists(self, v: Path) -> bool:
            return False

        def heatmaps_json_path(self, v: Path) -> Path:
            return self.artifact_dir(v) / f"{v.stem}.heatmaps.json"

        def phash_path(self, v: Path) -> Path:
            return self.artifact_dir(v) / f"{v.stem}.phash.json"

    stub = StubModule()

    tasks_called: list[str] = []

    monkeypatch.setattr(cli, "import_app_module", lambda: stub)
    monkeypatch.setattr(cli, "find_videos", lambda m, base, recursive: [video])
    monkeypatch.setattr(cli.signal, "signal", lambda signum, handler: None)

    def record(name):
        def _inner(*args, **kwargs):
            tasks_called.append(name)
            return None

        return _inner

    monkeypatch.setattr(cli, "task_metadata", record("metadata"))
    monkeypatch.setattr(cli, "task_thumb", record("thumb"))
    monkeypatch.setattr(cli, "task_hover", record("hover"))
    monkeypatch.setattr(cli, "task_sprites", record("sprites"))
    monkeypatch.setattr(cli, "task_scenes", record("scenes"))
    monkeypatch.setattr(cli, "task_heatmaps", record("heatmaps"))
    monkeypatch.setattr(cli, "task_phash", record("phash"))

    class ImmediateFuture:
        def __init__(self, value=None, error=None):
            self._value = value
            self._error = error
            self._cancelled = False

        def result(self):
            if self._error:
                raise self._error
            return self._value

        def cancel(self):
            self._cancelled = True

    class ImmediateExecutor:
        def __init__(self, max_workers):
            self.max_workers = max_workers

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def submit(self, fn, *args, **kwargs):
            try:
                value = fn(*args, **kwargs)
                return ImmediateFuture(value=value)
            except Exception as exc:
                return ImmediateFuture(error=exc)

    monkeypatch.setattr(cli.cf, "ThreadPoolExecutor", ImmediateExecutor)
    monkeypatch.setattr(cli.cf, "as_completed", lambda futures: futures)

    code = cli.main([
        "--root",
        str(tmp_path),
        "--recompute-all",
        "--concurrency",
        "1",
        "--hover-fmt",
        "mp4",
    ])
    captured = capsys.readouterr()
    assert code == 0
    assert "Processing 1 video" in captured.out
    assert "Completed successfully" in captured.out
    assert tasks_called == [
        "metadata",
        "thumb",
        "hover",
        "sprites",
        "scenes",
        "heatmaps",
        "phash",
    ]


def test_metadata_api_endpoints_flow(app_module, client, tmp_path, monkeypatch):
    video = tmp_path / "api_meta.mp4"
    video.write_bytes(b"video data")

    payload = {
        "format": {"duration": "42.5", "bit_rate": "123456"},
        "streams": [
            {"codec_type": "video", "width": 1280, "height": 720, "codec_name": "h264", "bit_rate": "100000"},
            {"codec_type": "audio", "codec_name": "aac", "bit_rate": "23456"},
        ],
    }

    def fake_metadata(path: Path, *, force: bool = False):
        assert path == video
        meta_path = app_module.metadata_path(path)
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(json.dumps(payload))
        return meta_path

    monkeypatch.setattr(app_module, "metadata_single", fake_metadata)

    fetch = client.get("/api/metadata/get", params={"path": "api_meta.mp4", "force": True, "view": True})
    assert fetch.status_code == 200
    summary = fetch.json()
    assert summary["status"] == "success"
    view_data = summary["data"]
    assert view_data["duration"] == pytest.approx(42.5)
    assert view_data["width"] == 1280
    assert view_data["height"] == 720
    assert view_data["vcodec"] == "h264"
    assert view_data["acodec"] == "aac"

    head = client.head("/api/metadata/get", params={"path": "api_meta.mp4"})
    assert head.status_code == 200

    listing = client.get("/api/metadata/list", params={"recursive": False})
    assert listing.status_code == 200
    stats = listing.json()["data"]
    assert stats == {"total": 1, "have": 1, "missing": 0}

    created = client.post("/api/metadata/create", params={"path": "api_meta.mp4"})
    assert created.status_code == 200
    assert created.json()["status"] == "success"

    deleted = client.request("DELETE", "/api/metadata/delete", json={"paths": ["api_meta.mp4"]})
    assert deleted.status_code == 200
    delete_stats = deleted.json()["data"]
    assert delete_stats["deleted"] == 1
    assert delete_stats["mode"] == "batch"

    missing = client.head("/api/metadata/get", params={"path": "api_meta.mp4"})
    assert missing.status_code == 404


def test_subtitles_and_heatmaps_endpoints(app_module, client, tmp_path):
    video = tmp_path / "subs.mp4"
    video.write_bytes(b"sample")

    art_dir = app_module.artifact_dir(video)
    subtitle = art_dir / f"{video.stem}.subtitles.srt"
    subtitle.write_text("1\n00:00:00,000 --> 00:00:01,000\nHello\n")
    heat_json = art_dir / f"{video.stem}.heatmaps.json"
    heat_png = art_dir / f"{video.stem}.heatmaps.png"
    heat_json.write_text(json.dumps({"interval": 5, "samples": [{"time": 0, "value": 0.5}]}))
    heat_png.write_bytes(b"heat")

    sub_list = client.get("/api/subtitles/list", params={"recursive": False})
    assert sub_list.status_code == 200
    assert sub_list.json()["data"] == {"total": 1, "have": 1, "missing": 0}

    fetched = client.get("/api/subtitles/get", params={"path": "subs.mp4"})
    assert fetched.status_code == 200
    assert b"Hello" in fetched.content

    head = client.head("/api/subtitles/get", params={"path": "subs.mp4"})
    assert head.status_code == 200

    heat_list = client.get("/api/heatmaps/list", params={"recursive": False})
    assert heat_list.status_code == 200
    assert heat_list.json()["data"] == {"total": 1, "have": 1, "missing": 0}

    removed = client.delete("/api/heatmaps/delete", params={"path": "subs.mp4"})
    assert removed.status_code == 200
    assert removed.json()["data"] == {"deleted": True}
    assert not heat_json.exists()
    assert not heat_png.exists()


def test_finish_plan_and_run_with_stubs(app_module, tmp_path, monkeypatch):
    video = tmp_path / "finish.mp4"
    video.write_bytes(b"data")

    order = list(app_module.FINISH_ARTIFACT_ORDER)
    artifact_status = {kind: False for kind in order}
    artifact_status["thumbnail"] = True

    def fake_iter_videos(base: Path, recursive: bool):
        assert base == tmp_path
        return [video]

    def fake_artifact_exists(path: Path, kind: str) -> bool:
        return artifact_status.get(kind, False)

    monkeypatch.setattr(app_module, "_iter_videos", fake_iter_videos)
    monkeypatch.setattr(app_module, "_artifact_exists", fake_artifact_exists)

    payload = app_module.api_finish_plan(path="", recursive=True, artifacts=None, include_existing=True)
    assert payload["count"] == 1
    entry = payload["items"][0]
    assert "thumbnail" in entry["existing"]
    assert "metadata" in entry["missing"]

    for kind in order:
        artifact_status[kind] = False

    inline_calls: list[tuple[str, object]] = []
    job_calls: list[dict[str, object]] = []

    def fake_probe(path: Path, force: bool = False):
        inline_calls.append(("metadata", force))
        return {}

    def fake_jobs_submit(req):
        job_calls.append({"task": req.task, "targets": (req.params or {}).get("targets")})
        return {"id": "job", "status": "queued"}

    monkeypatch.setitem(app_module.__dict__, "_probe_metadata", fake_probe)
    monkeypatch.setitem(app_module.__dict__, "probe_metadata", fake_probe)
    monkeypatch.setattr(app_module, "generate_thumbnail", lambda path, force=False: inline_calls.append(("thumbnail", force)))
    monkeypatch.setattr(app_module, "generate_hover_preview", lambda path, **kwargs: inline_calls.append(("preview", kwargs.get("fmt"))))
    monkeypatch.setitem(app_module.__dict__, "_generate_heatmap", lambda path: inline_calls.append(("heatmaps", None)))
    monkeypatch.setattr(app_module, "phash_create_single", lambda path, **kwargs: inline_calls.append(("phash", kwargs.get("overwrite"))))
    monkeypatch.setattr(app_module, "_detect_faces", lambda path, **kwargs: inline_calls.append(("faces", kwargs.get("stride"))))
    monkeypatch.setattr(app_module, "faces_exists_check", lambda path: False)
    monkeypatch.setattr(app_module, "jobs_submit", fake_jobs_submit)

    summary = app_module.api_finish_run({"force": False})
    assert summary["summary"]["files"] == 1

    inline_kinds = [name for name, _ in inline_calls]
    for expected in ["metadata", "thumbnail", "preview", "heatmaps", "phash", "faces"]:
        assert expected in inline_kinds

    job_tasks = {entry["task"] for entry in job_calls}
    assert {"sprites", "scenes", "subtitles"}.issubset(job_tasks)


def test_job_handlers_execute_with_stubs(app_module, tmp_path, monkeypatch):
    videos = []
    for name in ("job_a.mp4", "job_b.mp4"):
        path = tmp_path / name
        path.write_bytes(b"payload")
        videos.append(path)

    rels = [v.name for v in videos]

    records = {"heatmaps": [], "faces": [], "hover": [], "subtitles": [], "scenes": [], "phash": []}

    def fake_heatmaps(video: Path, interval: float, mode: str, png: bool, progress_cb=None, cancel_check=None):
        records["heatmaps"].append((video, interval, mode, png))
        app_module.artifact_dir(video)
        app_module.heatmaps_json_path(video).write_text(json.dumps({"interval": interval, "samples": []}))

    def fake_faces(video: Path, **kwargs):
        records["faces"].append((video, kwargs))
        app_module.faces_path(video).write_text(json.dumps({"faces": []}))

    def fake_hover(video: Path, segments: int, seg_dur: float, width: int, fmt: str, out: Path, progress_cb=None, cancel_check=None):
        records["hover"].append((video, segments, seg_dur, width, fmt))
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_bytes(b"")

    def fake_subtitles(video: Path, out_file: Path, **kwargs):
        records["subtitles"].append((video, kwargs))
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text("1\n00:00:00,000 --> 00:00:01,000\nLine\n")

    def fake_scenes(video: Path, **kwargs):
        records["scenes"].append((video, kwargs))
        app_module.scenes_json_path(video).write_text(json.dumps({"scenes": []}))

    def fake_phash(video: Path, **kwargs):
        records["phash"].append((video, kwargs))
        app_module.phash_path(video).write_text(json.dumps({"phash": "0"}))

    monkeypatch.setattr(app_module, "compute_heatmaps", fake_heatmaps)
    monkeypatch.setattr(app_module, "compute_face_embeddings", fake_faces)
    monkeypatch.setattr(app_module, "generate_hover_preview", fake_hover)
    monkeypatch.setattr(app_module, "generate_subtitles", fake_subtitles)
    monkeypatch.setattr(app_module, "generate_scene_artifacts", fake_scenes)
    monkeypatch.setattr(app_module, "phash_create_single", fake_phash)
    monkeypatch.setattr(app_module, "heatmaps_json_exists", lambda path: False)
    monkeypatch.setattr(app_module, "faces_exists_check", lambda path: False)
    monkeypatch.setattr(app_module, "scenes_json_exists", lambda path: False)
    monkeypatch.setattr(app_module, "_is_stub_subtitles_file", lambda path: False)
    monkeypatch.setattr(app_module, "_file_nonempty", lambda path, min_size=1: False)
    monkeypatch.setattr(app_module, "_file_task_lock", lambda path, kind: nullcontext())
    monkeypatch.setattr(app_module, "_job_check_canceled", lambda jid: False)

    monkeypatch.setattr(app_module, "_set_job_current", lambda jid, current: None)
    monkeypatch.setattr(app_module, "_set_job_progress", lambda jid, total=None, processed_set=None: None)
    monkeypatch.setattr(app_module, "_job_set_result", lambda jid, result: None)
    finished: list[str] = []
    monkeypatch.setattr(app_module, "_finish_job", lambda jid: finished.append(jid))

    JobRequest = app_module.JobRequest

    app_module._handle_heatmaps_job("heat", JobRequest(task="heatmaps", directory="", params={"targets": rels}), tmp_path)
    app_module._handle_faces_job("faces", JobRequest(task="faces", directory="", params={"targets": rels}), tmp_path)
    app_module._handle_hover_job("hover", JobRequest(task="hover", directory="", params={"targets": rels}), tmp_path)
    app_module._handle_subtitles_job("subs", JobRequest(task="subtitles", directory="", params={"targets": rels}), tmp_path)
    app_module._handle_scenes_job("scenes", JobRequest(task="scenes", directory="", params={"targets": rels}), tmp_path)
    app_module._handle_phash_job("phash", JobRequest(task="phash", directory="", params={"targets": rels}), tmp_path)

    assert len(records["heatmaps"]) == 2
    assert len(records["faces"]) == 2
    assert len(records["hover"]) == 2
    assert len(records["subtitles"]) == 2
    assert len(records["scenes"]) == 2
    assert len(records["phash"]) == 2
    assert set(finished) == {"heat", "faces", "hover", "subs", "scenes", "phash"}


def test_job_handlers_waveform_motion_and_integrity(app_module, tmp_path, monkeypatch):
    videos = []
    for name in ("wave.mp4", "motion.mp4"):
        path = tmp_path / name
        path.write_bytes(b"sample data")
        videos.append(path)

    rels = [v.name for v in videos]

    records = {"waveform": [], "motion": []}
    progress: dict[str, list[dict]] = {}
    results: dict[str, dict] = {}
    finished: list[str] = []

    def fake_progress(jid: str, **kwargs):
        progress.setdefault(jid, []).append(kwargs)

    def fake_waveform(video: Path, force: bool = False, width: int = 800, height: int = 160, color: str = "#4fa0ff"):
        records["waveform"].append((video, force, width, height, color))
        out = app_module.waveform_png_path(video)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"PNG")

    def fake_motion(video: Path, force: bool = False, interval: float = 1.0):
        records["motion"].append((video, force, interval))
        out = app_module.motion_json_path(video)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"interval": interval, "samples": [{"value": 0.2}, {"value": 0.8}]}))

    monkeypatch.setattr(app_module, "generate_waveform", fake_waveform)
    monkeypatch.setattr(app_module, "generate_motion_activity", fake_motion)
    monkeypatch.setattr(app_module, "ffmpeg_available", lambda: False)
    monkeypatch.setattr(app_module, "_file_task_lock", lambda path, kind: nullcontext())
    monkeypatch.setattr(app_module, "_job_check_canceled", lambda jid: False)
    monkeypatch.setattr(app_module, "_set_job_progress", fake_progress)
    monkeypatch.setattr(app_module, "_set_job_current", lambda jid, current: None)
    monkeypatch.setattr(app_module, "_job_set_result", lambda jid, result: results.setdefault(jid, result))
    monkeypatch.setattr(app_module, "_finish_job", lambda jid: finished.append(jid))
    monkeypatch.setattr(app_module, "_iter_videos", lambda base, recursive: list(videos))

    first = videos[0]
    meta1 = app_module.metadata_path(first)
    meta1.parent.mkdir(parents=True, exist_ok=True)
    meta1.write_text(json.dumps({"format": {"duration": "12.0"}}))
    thumb1 = app_module.thumbs_path(first)
    thumb1.parent.mkdir(parents=True, exist_ok=True)
    thumb1.write_bytes(b"thumb")
    old = time.time() - 60
    os.utime(meta1, (old, old))
    os.utime(thumb1, (old, old))
    os.utime(first, (time.time(), time.time()))
    orphan_file = app_module.artifact_dir(first) / "ghost.metadata.json"
    orphan_file.write_text("{}")

    JobRequest = app_module.JobRequest

    app_module._handle_waveform_job(
        "wave",
        JobRequest(task="waveform", directory="", params={"targets": rels, "width": 640, "height": 120}, recursive=False, force=False),
        tmp_path,
    )
    app_module._handle_motion_job(
        "motion",
        JobRequest(task="motion", directory="", params={"targets": rels, "interval": 2.0}, recursive=False, force=False),
        tmp_path,
    )
    sample_dir = tmp_path / "generated"
    app_module._handle_sample_job(
        "sample",
        JobRequest(task="sample", directory=str(sample_dir), params={"count": 2, "pattern": "sample_{i}.mp4"}, recursive=False, force=False),
        sample_dir,
    )
    app_module._handle_integrity_scan_job(
        "integrity",
        JobRequest(task="integrity-scan", directory="", params={"kinds": ["metadata", "thumbnail"], "include_ok": True}, recursive=False, force=False),
        tmp_path,
    )

    assert len(records["waveform"]) == 2
    assert len(records["motion"]) == 2
    assert (sample_dir / "sample_1.mp4").exists()
    integrity_result = results["integrity"]
    assert integrity_result["summary"]["orphaned_total"] == 1
    assert any(entry.get("missing") for entry in integrity_result["results"])
    assert {"wave", "motion", "sample", "integrity"}.issubset(set(finished))

    wf_resp = app_module.get_waveform(file="wave.mp4", force=False, width=640, height=120, color="#123456")
    assert getattr(wf_resp, "status_code", 200) == 200
    motion_resp = app_module.get_motion_activity(file="motion.mp4", force=False, interval=1.5, top=3)
    assert motion_resp.status_code == 200
    motion_payload = json.loads(motion_resp.body.decode())
    assert motion_payload["stats"]["count"] == 2


def test_api_stats_and_codecs_scan(app_module, tmp_path, monkeypatch):
    video1 = tmp_path / "stats1.mp4"
    video2 = tmp_path / "stats2.mp4"
    _create_video(
        app_module,
        video1,
        metadata={
            "format": {"duration": "120", "tags": {"title": "Stats One"}},
            "streams": [
                {"codec_type": "video", "width": 1920, "height": 1080},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
        },
        tags=["Feature"],
        performers=["Lead"],
    )
    _create_video(
        app_module,
        video2,
        metadata={
            "format": {"duration": "35", "tags": {"title": "Stats Two"}},
            "streams": [
                {"codec_type": "video", "width": 640, "height": 360},
            ],
        },
        tags=["Short"],
    )

    videos = [video1, video2]

    monkeypatch.setattr(app_module, "_find_mp4s", lambda base, recursive: list(videos))
    monkeypatch.setattr(app_module, "_iter_videos", lambda base, recursive: list(videos))

    def fake_ffprobe(path: Path):
        if path == video1:
            return {
                "format": {"duration": "120", "size": "1000000", "bit_rate": "8000000"},
                "streams": [
                    {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "pix_fmt": "yuv420p", "r_frame_rate": "30000/1001"},
                    {"codec_type": "audio", "codec_name": "aac"},
                ],
            }
        return {
            "format": {"duration": "35", "size": "500000", "bit_rate": "15000000"},
            "streams": [
                {"codec_type": "video", "codec_name": "vp9", "width": 640, "height": 360, "pix_fmt": "yuv420p"},
            ],
        }

    monkeypatch.setattr(app_module, "_ffprobe_streams_safe", fake_ffprobe)

    stats_resp = app_module.api_stats(path="", recursive=True)
    stats_payload = json.loads(stats_resp.body)
    assert stats_payload["data"]["num_files"] == 2
    assert stats_payload["data"]["res_buckets"]["1080"] == 1
    assert stats_payload["data"]["tags"] >= 1

    codecs = app_module.api_codecs_scan(path="", recursive=False, reasons=True)
    assert codecs["count"] == 2
    reasoned = [entry for entry in codecs["items"] if entry.get("reasons")]
    assert reasoned, "expected at least one entry with codec reasons"

    plan = app_module.api_transcode_plan(path="", recursive=False, target_profile="auto", max_items=0)
    assert plan["target_profile"] == "auto"
    files = {item["file"]: item for item in plan["items"]}
    rel2 = str(video2.relative_to(tmp_path))
    assert files[rel2]["action"] == "transcode"


def test_reload_path_matching(tmp_path, monkeypatch):
    import reload as strict_reload

    monkeypatch.setattr(strict_reload, "INCLUDE", ["**/*.py", ".special"])
    monkeypatch.setattr(strict_reload, "EXCLUDE", ["**/ignore.py"])

    sample = tmp_path / "module.py"
    sample.write_text("print('hi')")
    ignored = tmp_path / "ignore.py"
    ignored.write_text("print('no')")
    special = tmp_path / "config.special"
    special.write_text("1")

    assert strict_reload._matches_any(sample, strict_reload.INCLUDE)
    assert strict_reload._matches_any(special, strict_reload.INCLUDE)
    assert strict_reload._should_watch(sample)
    assert not strict_reload._should_watch(ignored)


def test_reload_hash_and_snapshot(tmp_path, monkeypatch):
    import reload as strict_reload

    target = tmp_path / "file.txt"
    target.write_text("payload")
    expected = hashlib.sha256(b"payload").hexdigest()
    assert strict_reload._hash_file(target) == expected

    monkeypatch.setattr(strict_reload, "INCLUDE", ["**/*.txt"])
    monkeypatch.setattr(strict_reload, "EXCLUDE", [])
    snap = strict_reload._snapshot(tmp_path)
    assert target in snap
    assert snap[target] == expected


def test_reload_start_and_restart(monkeypatch):
    import reload as strict_reload
    import subprocess

    commands = []

    class DummyProc:
        def __init__(self, cmd):
            commands.append(cmd)
            self.terminated = False
            self.killed = False

        def terminate(self):
            self.terminated = True

        def wait(self, timeout):
            raise subprocess.TimeoutExpired(cmd="uvicorn", timeout=timeout)

        def kill(self):
            self.killed = True

    monkeypatch.setattr(strict_reload.subprocess, "Popen", DummyProc)
    proc = strict_reload._start_server()
    assert commands and commands[0][0] == "uvicorn"

    strict_reload._restart(proc)
    assert proc.terminated is True
    assert proc.killed is True


def test_reload_main_without_watchfiles(monkeypatch, capsys):
    import reload as strict_reload

    monkeypatch.setattr(strict_reload, "WATCHFILES_OK", False)
    captured_exec = {}

    def fake_execvp(cmd, args):
        captured_exec["cmd"] = cmd
        captured_exec["args"] = args

    monkeypatch.setattr(strict_reload.os, "execvp", fake_execvp)
    code = strict_reload.main()
    output = capsys.readouterr().out
    assert "watchfiles is not installed" in output
    assert code == 0
    assert captured_exec["cmd"] == "uvicorn"
    assert captured_exec["args"] == [
        "uvicorn",
        "app:app",
        "--host",
        strict_reload.HOST,
        "--port",
        strict_reload.PORT,
    ]
