from tests.conftest import write_video
from pathlib import Path
def test_saved_searches(client, tmp_path):
    write_video(tmp_path, "clip.mp4")
    r = client.post("/api/setroot", params={"root": str(tmp_path)})
    assert r.status_code == 200
    body = {"name": "clips", "query": {"q": "clip"}}
    r = client.post("/api/search/saved", json=body)
    assert r.status_code == 200
    r = client.get("/api/search/saved")
    assert r.status_code == 200
    assert "clips" in r.json()["data"]["searches"]
    r = client.get("/api/search/saved/clips")
    assert r.status_code == 200
    files = r.json().get("files", [])
    assert any(f.endswith("clip.mp4") for f in files)
    r = client.delete("/api/search/saved/clips")
    assert r.status_code == 200
    r = client.get("/api/search/saved")
    assert "clips" not in r.json()["data"]["searches"]
