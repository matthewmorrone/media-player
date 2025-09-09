def test_setroot_and_library_listing(client, tmp_path):
    # Set root to an empty temp dir
    r_set = client.post('/api/setroot', params={'root': str(tmp_path)})
    assert r_set.status_code == 200
    # Initially no files
    r_lib = client.get('/api/library')
    assert r_lib.status_code == 200
    data = r_lib.json()["data"]
    assert data["total_files"] == 0
    assert data["files"] == []
    # Add a video and list again
    (tmp_path / 'a.mp4').write_bytes(b'00')
    r_lib2 = client.get('/api/library')
    assert r_lib2.status_code == 200
    d2 = r_lib2.json()["data"]
    assert d2["total_files"] == 1
    assert d2["files"][0]["name"] == 'a.mp4'


def test_metadata_and_cover_flow(client, tmp_path, monkeypatch):
    client.post('/api/setroot', params={'root': str(tmp_path)})
    video = tmp_path / 'v.mp4'
    video.write_bytes(b'00')
    # Metadata GET should succeed and return summary structure
    r_meta = client.get('/api/metadata/get', params={'path': 'v.mp4'})
    assert r_meta.status_code == 200
    body = r_meta.json().get('data') or {}
    # Keys presence, values may be None/0 in stub mode
    for key in ('duration','width','height','vcodec','bitrate'):
        assert key in body
    # Create cover and fetch
    r_cov = client.post('/api/cover/create', params={'path': 'v.mp4', 't': '0'})
    assert r_cov.status_code == 200
    r_get = client.get('/api/cover/get', params={'path': 'v.mp4'})
    assert r_get.status_code == 200
    assert r_get.headers['content-type'].startswith('image/')
    # Metadata list should reflect presence
    r_list = client.get('/api/metadata/list')
    assert r_list.status_code == 200
    have = (r_list.json().get('data') or {}).get('have')
    assert isinstance(have, int) and have >= 1
    # Delete cover succeeds
    r_del = client.delete('/api/cover/delete', params={'path': 'v.mp4'})
    assert r_del.status_code == 200


def test_stream_and_files_endpoint(client, tmp_path):
    client.post('/api/setroot', params={'root': str(tmp_path)})
    p = tmp_path / 's.mp4'
    p.write_bytes(b'0123456789')
    # /api/stream supports range
    r = client.get('/api/stream', params={'path': 's.mp4'}, headers={'Range': 'bytes=0-3'})
    assert r.status_code in (200, 206)
    # /files can serve direct files by relative path
    rel = 's.mp4'
    r2 = client.get(f'/files/{rel}')
    assert r2.status_code in (200, 206)


def test_hover_missing_returns_404(client, tmp_path):
    client.post('/api/setroot', params={'root': str(tmp_path)})
    (tmp_path / 'h.mp4').write_bytes(b'00')
    r = client.get('/api/hover/get', params={'path': 'h.mp4'})
    assert r.status_code == 404


def test_stats_counts(client, tmp_path):
    client.post('/api/setroot', params={'root': str(tmp_path)})
    (tmp_path / 'a.mp4').write_bytes(b'00')
    (tmp_path / 'b.mp4').write_bytes(b'00')
    r = client.get('/api/stats')
    assert r.status_code == 200
    data = r.json().get('data') or {}
    assert data.get('total_files') == 2
    
