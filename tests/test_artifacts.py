from pathlib import Path


def write_video(tmp_path: Path, name: str = "v.mp4") -> Path:
    p = tmp_path / name
    p.write_bytes(b"00")
    return p


def test_sprites_flow(client, tmp_path):
    write_video(tmp_path, "spr.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})

    # Initially missing
    r = client.get("/api/sprites/json", params={"path": "spr.mp4"})
    assert r.status_code == 404
    # Create
    r = client.post("/api/sprites/create", params={"path": "spr.mp4", "interval": 5, "width": 120, "cols": 3, "rows": 2, "quality": 4})
    assert r.status_code == 200
    # List should show 1/1
    r = client.get("/api/sprites/list")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total"] == 1 and data["have"] == 1
    # Fetch json and sheet
    r = client.get("/api/sprites/json", params={"path": "spr.mp4"})
    assert r.status_code == 200
    j = r.json()["data"]["index"]
    assert "grid" in j and "interval" in j
    r = client.get("/api/sprites/sheet", params={"path": "spr.mp4"})
    assert r.status_code == 200
    # Delete and verify
    r = client.delete("/api/sprites/delete", params={"path": "spr.mp4"})
    assert r.status_code == 200
    r = client.get("/api/sprites/list")
    assert r.status_code == 200
    assert r.json()["data"]["have"] == 0


def test_heatmaps_flow(client, tmp_path):
    write_video(tmp_path, "h.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})
    # Missing
    assert client.get("/api/heatmaps/json", params={"path": "h.mp4"}).status_code == 404
    # Create with PNG
    r = client.post("/api/heatmaps/create", params={"path": "h.mp4", "interval": 2.5, "mode": "both", "png": True})
    assert r.status_code == 200
    # List and fetch both assets
    r = client.get("/api/heatmaps/list")
    assert r.status_code == 200 and r.json()["data"]["have"] == 1
    r = client.get("/api/heatmaps/json", params={"path": "h.mp4"})
    assert r.status_code == 200 and "samples" in r.json()["data"]["heatmaps"]
    r = client.get("/api/heatmaps/png", params={"path": "h.mp4"})
    assert r.status_code == 200
    # Delete
    r = client.delete("/api/heatmaps/delete", params={"path": "h.mp4"})
    assert r.status_code == 200
    assert client.get("/api/heatmaps/list").json()["data"]["have"] == 0


def test_faces_flow(client, tmp_path):
    write_video(tmp_path, "f.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})
    # Missing
    assert client.get("/api/faces/get", params={"path": "f.mp4"}).status_code == 404
    # Create
    r = client.post("/api/faces/create", params={"path": "f.mp4"})
    assert r.status_code == 200
    # List and fetch
    r = client.get("/api/faces/list")
    assert r.status_code == 200 and r.json()["data"]["have"] == 1
    r = client.get("/api/faces/get", params={"path": "f.mp4"})
    assert r.status_code == 200
    faces = r.json()["data"].get("faces")
    assert isinstance(faces, list) and len(faces) >= 1
    # Delete
    r = client.delete("/api/faces/delete", params={"path": "f.mp4"})
    assert r.status_code == 200
    assert client.get("/api/faces/list").json()["data"]["have"] == 0


def test_subtitles_flow(client, tmp_path):
    write_video(tmp_path, "s.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})
    # Missing
    assert client.get("/api/subtitles/get", params={"path": "s.mp4"}).status_code == 404
    # Create
    r = client.post("/api/subtitles/create", params={"path": "s.mp4", "model": "tiny"})
    assert r.status_code == 200
    # List and fetch
    r = client.get("/api/subtitles/list")
    assert r.status_code == 200 and r.json()["data"]["have"] == 1
    r = client.get("/api/subtitles/get", params={"path": "s.mp4"})
    assert r.status_code == 200
    assert "Stub segment" in r.text or len(r.text) > 0
    # Delete
    r = client.delete("/api/subtitles/delete", params={"path": "s.mp4"})
    assert r.status_code == 200
    assert client.get("/api/subtitles/list").json()["data"]["have"] == 0


def test_phash_flow(client, tmp_path):
    write_video(tmp_path, "p.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})
    # Missing
    assert client.get("/api/phash/get", params={"path": "p.mp4"}).status_code == 404
    # Create
    r = client.post("/api/phash/create", params={"path": "p.mp4", "frames": 3, "algo": "ahash", "combine": "xor"})
    assert r.status_code == 200
    # List and fetch
    r = client.get("/api/phash/list")
    assert r.status_code == 200 and r.json()["data"]["have"] == 1
    r = client.get("/api/phash/get", params={"path": "p.mp4"})
    assert r.status_code == 200
    ph = r.json()["data"].get("phash")
    assert isinstance(ph, str) and len(ph) > 0
    # Delete
    r = client.delete("/api/phash/delete", params={"path": "p.mp4"})
    assert r.status_code == 200
    assert client.get("/api/phash/list").json()["data"]["have"] == 0


def test_jobs_list_recent_has_entries(client, tmp_path):
    # Create multiple artifacts to populate jobs
    write_video(tmp_path, "j.mp4")
    client.post("/api/setroot", params={"root": str(tmp_path)})
    client.post("/api/sprites/create", params={"path": "j.mp4"})
    client.post("/api/heatmaps/create", params={"path": "j.mp4"})
    client.post("/api/faces/create", params={"path": "j.mp4"})
    client.post("/api/subtitles/create", params={"path": "j.mp4"})
    client.post("/api/phash/create", params={"path": "j.mp4"})
    # Recent should include these jobs
    r = client.get("/api/jobs", params={"state": "recent"})
    assert r.status_code == 200
    jobs = r.json()["data"]["jobs"]
    assert isinstance(jobs, list) and len(jobs) >= 5
    types = {j.get("type") for j in jobs}
    assert {"sprites", "heatmaps", "faces", "subtitles", "phash"} <= types
