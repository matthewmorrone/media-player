from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

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
