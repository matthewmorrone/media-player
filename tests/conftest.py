import sys
from pathlib import Path

import pytest


# Ensure repo folder is on sys.path so `import app` works when running from repo root
V3_DIR = Path(__file__).resolve().parent.parent
if str(V3_DIR) not in sys.path:
    sys.path.insert(0, str(V3_DIR))


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
    from app import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c
