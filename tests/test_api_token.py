import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient


def test_api_token_required(monkeypatch):
    monkeypatch.setenv("API_TOKEN", "secret")
    spec = importlib.util.spec_from_file_location("app_auth", Path(__file__).resolve().parent.parent / "app.py")
    app_module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(app_module)

    with TestClient(app_module.app) as c:
        r = c.get("/api/library")
        assert r.status_code == 401
        r = c.get("/api/library", headers={"X-API-Key": "secret"})
        assert r.status_code == 200
