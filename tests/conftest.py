import copy

import pytest

import app
import db


@pytest.fixture()
def media_root(tmp_path):
    """Isolate filesystem-coupled globals per test."""
    original_root = app.STATE.get("root")
    original_state_dir = app.STATE.get("state_dir")
    original_db_path = app.STATE.get("db_path")
    try:
        original_db_file = db.path()
    except RuntimeError:
        original_db_file = None
    original_media_attr = copy.deepcopy(app._MEDIA_ATTR)
    original_media_attr_path = app._MEDIA_ATTR_PATH
    original_performer_cache = copy.deepcopy(app._PERFORMERS_CACHE)
    original_performer_index = {k: set(v) for k, v in app._PERFORMERS_INDEX.items()}
    new_state_dir = tmp_path / ".state"
    new_state_dir.mkdir(parents=True, exist_ok=True)
    new_db_path = new_state_dir / "media-player.db"
    db.configure(new_db_path)
    db.ensure_schema()
    app.STATE["state_dir"] = new_state_dir
    app.STATE["db_path"] = new_db_path
    app.STATE["root"] = tmp_path
    app._MEDIA_ATTR = {}
    app._MEDIA_ATTR_PATH = None
    app._load_media_attr()
    app._PERFORMERS_CACHE = {}
    app._PERFORMERS_INDEX = {}
    try:
        yield tmp_path
    finally:
        if original_db_file is not None:
            db.configure(original_db_file)
            db.ensure_schema()
        app.STATE["state_dir"] = original_state_dir
        app.STATE["db_path"] = original_db_path
        app.STATE["root"] = original_root
        app._MEDIA_ATTR = original_media_attr
        app._MEDIA_ATTR_PATH = original_media_attr_path
        app._PERFORMERS_CACHE = original_performer_cache
        app._PERFORMERS_INDEX = {k: set(v) for k, v in original_performer_index.items()}


@pytest.fixture()
def job_state():
    original_jobs = app.JOBS
    original_job_procs = app.JOB_PROCS
    original_heartbeats = app.JOB_HEARTBEATS
    original_event_subs = app.JOB_EVENT_SUBS
    original_cancel = app.JOB_CANCEL_EVENTS
    original_meta_batch = app.META_BATCH_EVENTS
    original_file_locks = app.FILE_TASK_LOCKS
    original_paused = app.JOB_QUEUE_PAUSED
    app.JOBS = {}
    app.JOB_PROCS = {}
    app.JOB_HEARTBEATS = {}
    app.JOB_EVENT_SUBS = []
    app.JOB_CANCEL_EVENTS = {}
    app.META_BATCH_EVENTS = {}
    app.FILE_TASK_LOCKS = {}
    app.JOB_QUEUE_PAUSED = False
    try:
        yield
    finally:
        app.JOBS = original_jobs
        app.JOB_PROCS = original_job_procs
        app.JOB_HEARTBEATS = original_heartbeats
        app.JOB_EVENT_SUBS = original_event_subs
        app.JOB_CANCEL_EVENTS = original_cancel
        app.META_BATCH_EVENTS = original_meta_batch
        app.FILE_TASK_LOCKS = original_file_locks
        app.JOB_QUEUE_PAUSED = original_paused
