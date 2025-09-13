import time
from pathlib import Path


def write_video(tmp_path: Path, name: str) -> Path:
    p = tmp_path / name
    p.write_bytes(b"00")
    return p


def _poll_job_done(client, jid: str, timeout: float = 3.0):
    """Poll /api/jobs for the given id until state is done/failed or timeout."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get("/api/jobs", params={"state": "recent"})
        assert r.status_code == 200
        jobs = r.json()["data"]["jobs"]
        for j in jobs:
            if j.get("id") == jid:
                last = j
                if j.get("state") in ("done", "failed", "canceled"):
                    return last
        time.sleep(0.05)
    return last


def test_autotag_scan_updates_tags_and_summary(client, tmp_path):
    # Arrange: create sample media files with separator variations
    write_video(tmp_path, "Alice Action-One.mp4")
    write_video(tmp_path, "Bob.Drama_two.mp4")
    write_video(tmp_path, "Nomatch.mp4")
    # Point API to temp root
    r = client.post("/api/setroot", params={"root": str(tmp_path)})
    assert r.status_code == 200

    # Act: run autotag scan for performers and tags
    payload = {
        "path": str(tmp_path),
        "recursive": False,
        "performers": ["Alice", "Bob"],
        "tags": ["Action", "Drama"],
    }
    r = client.post("/api/autotag/scan", json=payload)
    assert r.status_code == 200
    jid = r.json()["data"]["job"]
    assert isinstance(jid, str) and jid

    # The job should appear immediately with zero progress
    r_queued = client.get("/api/jobs", params={"state": "queued"})
    assert r_queued.status_code == 200
    jobs = r_queued.json()["data"]["jobs"]
    j0 = next((j for j in jobs if j.get("id") == jid), None)
    if j0 is None:
        r_active = client.get("/api/jobs", params={"state": "active"})
        assert r_active.status_code == 200
        jobs = r_active.json()["data"]["jobs"]
        j0 = next((j for j in jobs if j.get("id") == jid), None)
    assert j0 is not None and j0.get("processed") is not None

    # Wait for background job to complete
    j = _poll_job_done(client, jid, timeout=3.0)
    assert j is not None, "Job not found in recent list"
    assert j.get("state") == "done"
    res = j.get("result") or {}
    assert int(res.get("total") or 0) == 3
    assert int(res.get("matched_files") or 0) >= 2
    assert int(res.get("updated_files") or 0) >= 2

    # Assert: per-file tags were written
    def read_tags(rel: str):
        # Use the API to read tags in v2-style (note: this route is not under /api)
        r = client.get(f"/videos/{rel}/tags", params={"directory": str(tmp_path)})
        assert r.status_code == 200
        return r.json()

    t1 = read_tags("Alice Action-One.mp4")
    assert "Alice" in (t1.get("performers") or [])
    assert "Action" in (t1.get("tags") or [])

    t2 = read_tags("Bob.Drama_two.mp4")
    assert "Bob" in (t2.get("performers") or [])
    assert "Drama" in (t2.get("tags") or [])

    # Nomatch should have no tag file -> API returns empty defaults
    t3 = read_tags("Nomatch.mp4")
    assert t3.get("tags") == [] and t3.get("performers") == []

    # And the tags summary should count our assignments
    r = client.get("/tags/summary", params={"directory": str(tmp_path)})
    assert r.status_code == 200
    data = r.json()
    tags = data.get("tags") or {}
    perfs = data.get("performers") or {}
    assert tags.get("Action", 0) >= 1
    assert tags.get("Drama", 0) >= 1
    assert perfs.get("Alice", 0) >= 1
    assert perfs.get("Bob", 0) >= 1

    # Tag search API should find tags and performers by substring
    r = client.get("/api/tags/search", params={"path": str(tmp_path), "q": "a"})
    assert r.status_code == 200
    data = r.json()
    assert "Action" in data.get("tags", [])
    assert "Alice" in data.get("performers", [])

    # Global search should return tags, performers, and files
    r = client.get("/api/search", params={"path": str(tmp_path), "q": "a"})
    assert r.status_code == 200
    data = r.json()
    assert "Action" in data.get("tags", [])
    assert "Alice" in data.get("performers", [])
    assert any(f.endswith("Alice Action-One.mp4") for f in data.get("files", []))
