import json
import threading
import time
from io import BytesIO

from fastapi import UploadFile
from fastapi.responses import JSONResponse

import app
import db
from .helpers import (
    _relative_path,
    _set_media_attr_entry,
    _write_tags_sidecar,
    _write_video_with_sidecars,
)


def _wait_for(predicate, *, timeout: float = 1.0, interval: float = 0.01) -> bool:
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def test_slugify_normalizes_strings():
    assert app._slugify("  Hello World!! ") == "hello-world"
    assert app._slugify("Already--Slugified") == "already-slugified"


def test_public_image_list_deduplicates_and_filters():
    inputs = [
        "images/A.jpg",
        {"path": "images/A.jpg"},
        "https://example.test/icon.png",
        None,
        "",
    ]
    result = app._public_image_list(inputs)
    assert result[0] == "/files/images/A.jpg"
    assert "https://example.test/icon.png" in result
    assert len(result) == 2


def test_parse_artifact_name_round_trip():
    stem = "sample"
    expected = (stem, app.SUFFIX_METADATA_JSON)
    assert app._parse_artifact_name(f"{stem}{app.SUFFIX_METADATA_JSON}") == expected
    assert app._parse_artifact_name("not-an-artifact.txt") is None


def test_artifact_from_type_normalizes_batches():
    assert app._artifact_from_type("preview-batch") == "previews"
    assert app._artifact_from_type("HEATMAP") == "heatmaps"
    assert app._artifact_from_type(None) is None


def test_tasks_coverage_uses_database(media_root):
    video = _write_video_with_sidecars(media_root, "dbcov.mp4", phash_hex="ffee0011")
    with db.session() as conn:
        app._db_backfill_single_video(conn, video)
    video.unlink()
    response = app.tasks_coverage(path="")
    assert isinstance(response, JSONResponse)
    payload = json.loads(bytes(response.body))
    coverage = payload["data"]["coverage"]
    assert coverage["metadata"]["total"] == 1
    assert coverage["metadata"]["processed"] == 1


def test_api_duplicates_list_identifies_pair(media_root):
    v1 = _write_video_with_sidecars(media_root, "alpha.mp4", phash_hex="abcd1234")
    v2 = _write_video_with_sidecars(media_root, "beta.mp4", phash_hex="abcd1234")

    response = app.api_duplicates_list(directory=".", recursive=False, phash_threshold=0.9, min_similarity=None,
                                       page=1, page_size=10)
    assert isinstance(response, JSONResponse)
    payload = json.loads(bytes(response.body))
    data = payload["data"]
    assert data["total_pairs"] == 1
    pair = data["pairs"][0]
    assert pair["a"].endswith(v1.name)
    assert pair["b"].endswith(v2.name)


def test_api_phash_duplicates_clusters_pairs(media_root):
    _write_video_with_sidecars(media_root, "gamma.mp4", phash_hex="ffff0000", duration=5)
    _write_video_with_sidecars(media_root, "delta.mp4", phash_hex="ffff0000", duration=5)

    response = app.api_phash_duplicates(directory=".", recursive=False, phash_threshold=0.8, min_similarity=None,
                                        page=1, page_size=10)
    assert isinstance(response, JSONResponse)
    payload = json.loads(bytes(response.body))
    data = payload["data"]
    clusters = data["data"]
    assert len(clusters) == 1
    cluster = clusters[0]
    assert sorted(cluster["group"]) == sorted([str(media_root / "gamma.mp4"), str(media_root / "delta.mp4")])


def test_get_library_with_filters_and_sorting(media_root):
    alpha = _write_video_with_sidecars(media_root, "alpha.mp4", phash_hex="abcdefff", duration=12.5, width=1920, height=1080)
    beta = _write_video_with_sidecars(media_root, "beta.mp4", phash_hex="12345678", duration=4.0, width=640, height=360)
    _set_media_attr_entry(alpha, tags=["Action", "Featured"], performers=["Alice"])
    _set_media_attr_entry(beta, tags=["Drama"], performers=["Bob"])
    _write_tags_sidecar(alpha, tags=["Action"], performers=["Alice"], description="Alpha", rating=4, favorite=True)
    _write_tags_sidecar(beta, tags=["Drama"], performers=["Bob"], description="Beta", rating=2, favorite=False)
    filters_payload = json.dumps({
        "tags": {"in": ["Action"]},
        "performers": {"not_in": ["Bob"]},
        "duration": {"ge": 5},
        "width": {"ge": 1000},
        "height": {"ge": 700},
        "bitrate": {"ge": 1000000},
        "format": {"in": ["mp4"]},
        "mtime": {"after": 0},
        "metadata": {"bool": True},
        "phash": {"bool": True},
    })

    response = app.get_library(
        path="",
        page=1,
        page_size=10,
        search="alpha",
        ext=".mp4",
        sort="date",
        order="desc",
        tags="Action",
        performers="Alice",
        tags_ids=None,
        performers_ids=None,
        match_any=False,
        res_min=700,
        res_max=None,
        filters=filters_payload,
    )
    assert isinstance(response, JSONResponse)
    payload = json.loads(bytes(response.body))
    data = payload["data"]
    assert data["total_files"] == 1
    assert data["files"][0]["name"] == "alpha.mp4"
    assert "Action" in data["files"][0]["tags"]
    assert "Alice" in data["files"][0]["performers"]


def test_media_info_and_updates_flow(media_root):
    alpha = _write_video_with_sidecars(media_root, "alpha.mp4", phash_hex="aaaa0000", duration=9.5)
    beta = _write_video_with_sidecars(media_root, "beta.mp4", phash_hex="bbbb0000", duration=7.25)
    rel_alpha = _set_media_attr_entry(alpha, tags=["Initial"], performers=["Init"])
    rel_beta = _set_media_attr_entry(beta, tags=[], performers=[])
    _write_tags_sidecar(alpha, tags=["Initial"], performers=["Init"], description="Seed", rating=1, favorite=False)

    app.media_tags_add(path=rel_alpha, tag="Action")
    app.media_tags_remove(path=rel_alpha, tag="Initial")
    app.media_performers_add(path=rel_alpha, performer="Alice")
    app.media_performers_remove(path=rel_alpha, performer="Init")

    bulk_payload = app.MediaTagsBulkAddPayload(
        updates=[
            app.MediaTagUpdate(path=rel_alpha, tag="Drama"),
            app.MediaTagUpdate(path=rel_alpha, tag="Drama"),
        ]
    )
    bulk_resp = app.media_tags_bulk_add(bulk_payload)
    bulk_data = json.loads(bytes(bulk_resp.body))["data"]
    assert bulk_data["updated"] == 1

    rating_resp = app.media_set_rating(path=rel_alpha, rating=5)
    assert json.loads(bytes(rating_resp.body))["data"]["rating"] == 5
    desc_resp = app.media_set_description(path=rel_alpha, payload=app._DescriptionPayload(description="Updated notes"))
    assert json.loads(bytes(desc_resp.body))["data"]["description"] == "Updated notes"
    fav_resp = app.media_set_favorite(path=rel_alpha, favorite=True)
    assert json.loads(bytes(fav_resp.body))["data"]["favorite"] is True

    info_resp = app.media_info(path=rel_alpha)
    info_data = json.loads(bytes(info_resp.body))["data"]
    assert "Action" in info_data["tags"]
    assert "Alice" in info_data["performers"]

    bulk_info_resp = app.media_info_bulk(app.MediaInfoBulkRequest(paths=[rel_alpha, rel_alpha, rel_beta], include_sidecar=False))
    bulk_info = json.loads(bytes(bulk_info_resp.body))["data"]
    assert bulk_info["total"] == 2

    perf_stats_resp = app.api_performers_index_stats()
    assert json.loads(bytes(perf_stats_resp.body))["status"] == "success"

    export_data = app.tags_export(directory=".", recursive=True)
    assert export_data["count"] >= 1

    import_payload = app.TagsImport(
        videos=[{
            "path": str(alpha),
            "tags": ["Imported"],
            "performers": ["Ivy"],
            "description": "Imported",
            "rating": 3,
            "favorite": True,
        }],
        replace=True,
    )
    import_result = app.tags_import(import_payload)
    assert import_result["updated"] == 1

    previews_resp = app.api_report_previews(directory=".", recursive=False, page=1, page_size=10)
    previews_data = json.loads(bytes(previews_resp.body))["data"]
    assert previews_data["total_files"] >= 2

    compare_resp = app.api_compare_metadata(path_a=_relative_path(alpha), path_b=_relative_path(beta))
    compare_payload = json.loads(bytes(compare_resp.body))
    assert compare_payload["data"]["metrics"]["phash_distance"] >= 0


def test_performer_management_flow(media_root):
    video = _write_video_with_sidecars(media_root, "clip.mp4", phash_hex="feedbeef")
    rel = _set_media_attr_entry(video, tags=["Action"], performers=["Alice"])
    app.media_performers_add(path=rel, performer="Alice")

    add_resp = app.api_performers_add({"name": "Alice"})
    assert json.loads(bytes(add_resp.body))["status"] == "success"

    import_payload = json.dumps(["Bob", "Alice"])
    import_resp = app.api_performers_import(import_payload)
    assert json.loads(bytes(import_resp.body))["data"]["imported"] == 1

    rename_resp = app.api_performers_rename({"old": "Alice", "new": "Alicia"})
    renamed = json.loads(bytes(rename_resp.body))["data"]["renamed"]
    assert renamed["new"] == "Alicia"

    merge_resp = app.api_performers_merge({"from": ["Bob"], "to": "Alicia"})
    merge_data = json.loads(bytes(merge_resp.body))["data"]
    assert any(src.lower() == "bob" for src in merge_data["sources"])

    app.api_performers_add({"name": "Charlie"})
    delete_resp = app.api_performers_delete(name="Charlie")
    assert json.loads(bytes(delete_resp.body))["data"]["deleted"] == "Charlie"

    list_resp = app.api_performers(search=None, image="any", debug=True, page=1, page_size=10,
                                   sort="count", order="desc", refresh=True, fast=True)
    list_payload = json.loads(bytes(list_resp.body))["data"]
    assert list_payload["total"] >= 1

    images_dir = media_root / "perf_images"
    images_dir.mkdir(parents=True, exist_ok=True)
    img_path = images_dir / "Alicia.jpg"
    img_path.write_bytes(b"fake-image")
    img_import_resp = app.performers_images_import(directory=str(images_dir.relative_to(media_root)), mode="link", replace=False, create_missing=True)
    img_payload = json.loads(bytes(img_import_resp.body))["data"]
    assert img_payload["updated"] == 1

    upload = UploadFile(filename="Eve/photo.jpg", file=BytesIO(b"upload-bytes"))
    upload_resp = app.performers_images_upload(files=[upload], replace=True, create_missing=True, detect_face=False)
    upload_payload = json.loads(bytes(upload_resp.body))["data"]
    assert upload_payload["updated"] == 1


def test_report_and_route_listing(media_root):
    video = _write_video_with_sidecars(media_root, "report.mp4", phash_hex="0011ff00")
    thumb = app.thumbnails_path(video)
    thumb.parent.mkdir(parents=True, exist_ok=True)
    thumb.write_bytes(b"thumb")
    preview = app._preview_concat_path(video)
    preview.write_bytes(b"preview")
    sheet, sheet_json = app.sprite_sheet_paths(video)
    sheet.write_bytes(b"sprite")
    sheet_json.write_text(json.dumps({"grid": [1, 2]}))
    app.heatmaps_json_path(video).write_text(json.dumps({"bins": [0, 1]}))
    app.scenes_json_path(video).write_text(json.dumps({"scenes": []}))
    faces_payload = {"faces": [{"embedding": [0.5], "box": [1, 2, 3, 4]}]}
    app.faces_path(video).write_text(json.dumps(faces_payload))
    subtitles_path = app.artifact_dir(video) / f"{video.stem}{app.SUFFIX_SUBTITLES_SRT}"
    subtitles_path.write_text("1\n00:00:00,000 --> 00:00:01,000\ncaption\n")

    report_data = app.report(directory=".", recursive=True)
    assert report_data["total"] == 1
    assert report_data["counts"]["metadata"] == 1

    root_resp = app.api_root_set(app.RootUpdate(root=str(media_root)))
    root_payload = json.loads(bytes(root_resp.body)) # type: ignore
    assert root_payload["data"]["root"].endswith(str(media_root))

    routes_resp = app.list_all_routes(include_head=True)
    routes_payload = json.loads(bytes(routes_resp.body))
    assert "paths" in routes_payload


def test_env_preview_and_thread_helpers(monkeypatch):
    monkeypatch.setenv("VP9_CPU_USED", "20")
    flags = app._vp9_realtime_flags()
    assert "-cpu-used" in flags
    assert flags[flags.index("-cpu-used") + 1] == "15"

    monkeypatch.setenv("THUMBNAIL_QUALITY", "2")
    assert app._effective_preview_crf_vp9() <= 32
    monkeypatch.setenv("THUMBNAIL_QUALITY", "31")
    assert app._effective_preview_crf_h264() >= 40

    monkeypatch.setenv("FFMPEG_THREADS", "auto")
    assert app._ffmpeg_threads_flags() == ["-threads", "0"]
    monkeypatch.setenv("FFMPEG_THREADS", "3")
    assert app._ffmpeg_threads_flags() == ["-threads", "3"]

    monkeypatch.setenv("TEST_INT", "5")
    assert app._env_int("TEST_INT", 1) == 5
    monkeypatch.delenv("TEST_INT")
    assert app._env_int("TEST_INT", 7) == 7


def test_path_and_artifact_helpers(media_root):
    video = _write_video_with_sidecars(media_root, "helper.mp4", phash_hex="aa00")
    registry = app._registry_dir()
    assert registry.name == ".artifacts"

    art_dir = app.artifact_dir(video)
    assert art_dir.exists()

    sheet, sheet_json = app.sprite_sheet_paths(video)
    assert sheet.parent == art_dir
    assert sheet_json.parent == art_dir

    app.scenes_json_path(video).write_text(json.dumps({"scenes": []}))
    assert app.scenes_json_exists(video)
    app.heatmaps_json_path(video).write_text(json.dumps({"bins": []}))
    assert app.heatmaps_json_exists(video)

    faces_file = app.faces_path(video)
    faces_file.write_text(json.dumps({"faces": [{"embedding": [], "box": [0, 0, 100, 100]}]}))
    assert not app.faces_exists_check(video)
    faces_file.write_text(json.dumps({"faces": [{"embedding": [0.2], "box": [0.1, 0.2, 0.3, 0.4]}]}))
    assert app.faces_exists_check(video)

    art_subs = art_dir / f"{video.stem}{app.SUFFIX_SUBTITLES_SRT}"
    art_subs.write_text("[no speech engine installed]\n")
    assert app.find_subtitles(video) == art_subs
    assert app._is_stub_subtitles_file(art_subs) is True

    side_subs = video.with_suffix(app.SUFFIX_SUBTITLES_SRT)
    side_subs.write_text("1\n00:00:00,000 --> 00:00:01,000\ncaption\n")
    assert app.find_subtitles(video) == art_subs


def test_per_file_lock_and_metadata_cache(media_root, monkeypatch):
    video = _write_video_with_sidecars(media_root, "meta.mp4", phash_hex="bb00")
    monkeypatch.setenv("FFPROBE_DISABLE", "1")
    meta_path = app.metadata_path(video)
    if meta_path.exists():
        meta_path.unlink()

    with app._PerFileLock(video, "metadata"):
        app.metadata_single(video, force=True)

    payload = json.loads(meta_path.read_text())
    assert payload["format"]["duration"] == "0.0"

    app.STATE["_metadata_cache"] = {}
    first = app._metadata_summary_cached(video)
    second = app._metadata_summary_cached(video)
    assert first == second


def test_batch_runner_and_ffmpeg_concurrency(monkeypatch, tmp_path):
    paths = [tmp_path / f"item-{i}.txt" for i in range(3)]
    for p in paths:
        p.write_text("x")

    captured: list[str] = []
    monkeypatch.setattr(app, "_BATCH_EXEC", None)
    app._run_batch_items(paths, lambda p: captured.append(p.name))
    assert sorted(captured) == [p.name for p in paths]

    original_sem = app._FFMPEG_SEM
    original_conc = app._FFMPEG_CONCURRENCY
    try:
        new_val = app._set_ffmpeg_concurrency(2)
        assert new_val == 2
        assert app._FFMPEG_CONCURRENCY == 2
    finally:
        app._FFMPEG_SEM = original_sem
        app._FFMPEG_CONCURRENCY = original_conc


def test_registry_worker_singleton():
    started = threading.Event()
    release = threading.Event()

    def _worker(flag: threading.Event, release_event: threading.Event):
        flag.set()
        release_event.wait(0.2)

    assert app._start_worker_once("demo", _worker, started, release) is True
    started.wait(0.2)
    assert started.is_set()
    assert app._start_worker_once("demo", _worker, started, release) is False
    release.set()


def test_wrap_job_records_progress(media_root, job_state):
    video = media_root / "job.mp4"
    video.write_bytes(b"data")
    rel_target = str(video.relative_to(media_root))
    seen: dict[str, str] = {}

    def worker():
        jid = getattr(app.JOB_CTX, "jid")
        assert jid
        app._set_job_progress(jid, total=10, processed_inc=3)
        app._set_job_progress(jid, processed_set=10)
        seen["jid"] = jid
        return {"ok": True}

    result = app._wrap_job("thumbnail", rel_target, worker)
    assert result == {"ok": True}
    jid = seen["jid"]
    with app.JOB_LOCK:
        job_entry = app.JOBS[jid]
    assert job_entry["state"] == "done"
    assert job_entry["processed"] == 10
    assert job_entry["total"] == 10

    queued = app._new_job("preview", rel_target)
    assert app._find_active_job("preview", rel_target) == queued
    app._finish_job(queued)


def test_wrap_job_background_skips_duplicates(media_root, job_state, monkeypatch):
    video = media_root / "bg.mp4"
    video.write_bytes(b"bg")
    rel_target = str(video.relative_to(media_root))
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def worker():
        started.set()
        release.wait(0.05)
        finished.set()
        return {"bg": True}

    monkeypatch.setenv("LIGHT_SLOT_ALL", "1")
    resp = app._wrap_job_background("preview", rel_target, worker)
    payload = json.loads(resp.body)
    jid = payload["data"]["job"]

    assert started.wait(1.0)
    dup_payload = json.loads(app._wrap_job_background("preview", rel_target, worker).body)
    assert dup_payload["data"]["skipped"] is True
    assert dup_payload["data"]["job"] == jid

    release.set()
    assert finished.wait(1.0)
    assert _wait_for(lambda: app.JOBS[jid]["state"] == "done", timeout=3.0)


def test_cleanup_orphan_jobs_marks_stale(media_root, job_state):
    video = media_root / "orphan.mp4"
    video.write_bytes(b"x")
    rel_target = str(video.relative_to(media_root))

    jid = app._new_job("preview", rel_target)
    with app.JOB_LOCK:
        app.JOBS[jid]["state"] = "running"
    app.JOB_HEARTBEATS[jid] = time.time() - 10
    app.JOB_PROCS[jid] = set()

    result = app._cleanup_orphan_jobs(max_idle=0.01, min_age=0.0)
    assert jid in result["ids"]
    assert app.JOBS[jid]["state"] == "failed"

