import sys
from pathlib import Path

import pytest


# Ensure v3 folder is on sys.path so `import v3.app` works when running from repo root
V3_DIR = Path(__file__).resolve().parent.parent
if str(V3_DIR.parent) not in sys.path:
    sys.path.insert(0, str(V3_DIR.parent))


@pytest.fixture(autouse=True)
def _env_and_cwd(tmp_path, monkeypatch):
    """Run tests in a temp cwd, set MEDIA_ROOT, and disable ffprobe."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    monkeypatch.setenv("FFPROBE_DISABLE", "1")
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient  # import here to keep deps local to tests
    from v3.app import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c
