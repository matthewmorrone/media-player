from pathlib import Path

from app import import_media, STATE, _load_library


def test_library_persisted(tmp_path):
    vid = tmp_path / "clip.mp4"
    vid.write_bytes(b"00")
    import_media(vid)
    lib = Path("library.json")
    assert lib.exists()
    # Simulate restart
    STATE["library"] = {}
    _load_library()
    assert str(vid) in STATE.get("library", {})


def test_library_query_filter(client):
    vid = Path("one.mp4")
    vid.write_bytes(b"00")
    import_media(vid)
    r = client.get("/api/library/media", params={"q": "one"})
    assert r.status_code == 200
    files = r.json()["data"]["files"]
    assert any(f.get("path", "").endswith("one.mp4") for f in files)
    r = client.get("/api/library/media", params={"q": "nomatch"})
    assert r.status_code == 200
    assert r.json()["data"]["files"] == []


def test_library_filter_by_dims(client):
    vid = Path("dim.mp4")
    vid.write_bytes(b"00")
    import_media(vid)
    # Patch metadata with custom width and duration for filtering tests
    entry = STATE["library"][str(vid)]
    entry.setdefault("metadata", {}).setdefault("streams", [{}])[0]["width"] = 800
    entry["metadata"].setdefault("format", {})["duration"] = "12.0"

    r = client.get("/api/library/media", params={"min_width": 600, "min_duration": 10})
    assert any(f.get("path", "").endswith("dim.mp4") for f in r.json()["data"]["files"])

    r = client.get("/api/library/media", params={"min_width": 1000})
    assert r.json()["data"]["files"] == []

    r = client.get("/api/library/media", params={"min_duration": 20})
    assert r.json()["data"]["files"] == []

