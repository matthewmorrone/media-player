from app import import_media


def test_library_ui_served(client, tmp_path):
    # ensure at least one file in library
    vid = tmp_path / "clip.mp4"
    vid.write_bytes(b"00")
    import_media(vid)
    res = client.get("/ui/library")
    assert res.status_code == 200
    assert "Media Library" in res.text
