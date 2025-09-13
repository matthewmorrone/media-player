import time
from pathlib import Path


def write_video(tmp_path: Path, name: str) -> Path:
    p = tmp_path / name
    p.write_bytes(b"00")
    return p


def _poll_job_done(client, jid: str, timeout: float = 3.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get("/api/jobs", params={"state": "recent"})
        assert r.status_code == 200
        jobs = r.json()["data"]["jobs"]
        for j in jobs:
            if j.get("id") == jid:
                last = j
                if last.get("state") in ("done", "failed", "canceled"):
                    return last
        time.sleep(0.05)
    return last


def test_scan_imports_files(client, tmp_path):
    write_video(tmp_path, "clip.mp4")
    r = client.post("/api/setroot", params={"root": str(tmp_path)})
    assert r.status_code == 200
    r = client.post("/api/scan", json={"path": str(tmp_path)})
    assert r.status_code == 200
    jid = r.json()["data"]["job"]
    assert isinstance(jid, str) and jid
    j = _poll_job_done(client, jid)
    assert j is not None and j.get("state") == "done"
    r = client.get("/api/library/media")
    assert r.status_code == 200
    files = r.json()["data"].get("files", [])
    assert any(f.get("path", "").endswith("clip.mp4") for f in files)
