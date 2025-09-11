import sys
from pathlib import Path

import pytest
import os
import signal


# Ensure repo root is on sys.path so `import app` works when running from repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def _env_and_cwd(tmp_path, monkeypatch):
    """Run tests in a temp cwd, set MEDIA_ROOT, and disable ffprobe."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    monkeypatch.setenv("FFPROBE_DISABLE", "1")
    yield


@pytest.fixture(autouse=True)
def _per_test_timeout():
    """Fail a test if it exceeds TEST_TIMEOUT seconds (default: 10s).
    Uses SIGALRM on Unix/macOS; no-op on platforms without it.
    """
    timeout = int(os.getenv("TEST_TIMEOUT", "10"))
    if hasattr(signal, "SIGALRM"):
        def _handler(signum, frame):  # noqa: ARG001
            raise TimeoutError(f"Test exceeded {timeout}s timeout")
        prev = signal.signal(signal.SIGALRM, _handler)
        signal.alarm(timeout)
        try:
            yield
        finally:
            try:
                signal.alarm(0)
            finally:
                signal.signal(signal.SIGALRM, prev)
    else:
        # Fallback: no timeout enforcement on this platform
        yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient  # import here to keep deps local to tests
    from app import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c
