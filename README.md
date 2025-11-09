# Media Player

## Quick start

1. Create & activate a venv (or run `./install.sh`):
	```bash
	python3 -m venv .venv
	source .venv/bin/activate
	./install.sh --required
	```
2. Start the server:
	```bash
	./serve.sh
	```
3. Open: http://127.0.0.1:9998/ (LAN URL printed on startup)

Environment variables:
- MEDIA_ROOT: absolute path of your library root (defaults to current working directory or detected path in `serve.sh`).
- JOB_MAX_CONCURRENCY: limit parallel heavy jobs (default 1).
- FFMPEG_TIMELIMIT: per ffmpeg run time cap (default 600 seconds).

## Optional features & extras
Some functionality (face detection, subtitles via whisper.cpp) activates automatically if supporting binaries or Python packages are present.

### Raspberry Pi / ARM notes
Heavy ML packages can be slow to build. Start with core dependencies only:
```bash
./install.sh --required
```
Then optionally add OpenCV + numpy for face detection:
```bash
./install.sh --optional
```
If OpenCV wheels fail on ARM and you pass `--apt-opencv`, the script will attempt a system package fallback (`python3-opencv`).

### whisper.cpp autodetect
`serve.sh` will auto-detect a compiled whisper.cpp binary and model under `~/whisper.cpp/` and enable local subtitle generation if found.

## Roadmap snapshot (see `TODO.md` for structured list)
- Library filters & saved views
- Duplicate manager (pHash driven) + actions
- Tags & performers management (rename/merge)
- Scenes markers editor
- Jobs dashboard (SSE live updates, cancel)
- Face identities & clustering (longer term)

## Actions panel (convert/compress/trim)

In the Player sidebar, open the Actions accordion:

- Download frame: saves the current video frame as a PNG locally (client‑side).
- Convert: queues a transcode job for the current file. Choose between H.264/AAC (MP4) and VP9/Opus (WebM). The original file is kept; the converted file is written alongside it.
- Compress: shorthand for converting to H.264/AAC (MP4) using default settings; keeps the original file.
- Trim: prompts for start/end and queues a server job to extract a clip to a sibling “.clips/” folder.

Jobs appear in the Tasks tab. Progress updates stream over server‑sent events when available. You can cancel jobs from the Tasks tab.

API notes:

- POST /jobs with `{ task: "transcode", params: { profile, targets, replace } }` is used for convert/compress.
- POST /api/actions/trim with `{ path, start, end, dest_dir? }` wraps a `clip` job safely resolving paths under MEDIA_ROOT.


## Contributing / development
Hot reload: the default `serve.sh` uses `--reload` so backend changes auto-apply.
Frontend assets are served directly from the working directory.

### Assistant / automation guidance
See `AGENTS.md` for agent operational guidelines.
See `.github/copilot-hints.md` for the concise rule anchor (open this file before starting AI-assisted edits for stronger context priming).
See `COPILOT_GUIDE.md` for extended semantics (endpoints, adaptive artifact button rules, safe patch checklist).

If you change core UI semantics or API endpoints, update those docs to keep them authoritative.

## Troubleshooting
ffmpeg missing: install via your package manager (e.g., `brew install ffmpeg`, `apt-get install ffmpeg`).
Port already in use: set `PORT=9999 ./serve.sh`.
Root path wrong: `curl http://localhost:9998/api/root` (GET) / `POST /api/root` with `{ "root": "/new/path" }`.

## Tips

- Space toggles play/pause when focus isn’t in a text field.
- Performer and tag names are clickable; they navigate to Library with that filter applied.
- Use the Clear button next to the Library search/chips to reset search terms, #tags, @performers, and resolution.

## Merging tags and performers

To merge variants (e.g., “Bareback” and “bareback”) into a single canonical entry:

1. Open the Tags (or Performers) tab.
2. Select the two items you want to merge.
3. Click “Merge” and choose which name to keep.
4. Leave “rewrite sidecars” enabled to update existing video sidecars to the canonical name.

Notes:

- Matching is case-insensitive. You can also run “Rewrite sidecars” from the toolbar later to normalize existing files to registry names.
- URL/search params are the source of truth on reload/back/forward. If you remove a parameter (e.g. performers) from the URL, the corresponding filter will be fully cleared in the UI and results on next load.

## SQLite fallback plan (performers index)

The app now maintains a lightweight, on-disk incremental performers index at `.media_player_performers_index.json` that stores, per media file, the list of performer names and the last observed sidecar mtime. This keeps listing accurate and fast without rescanning unchanged files.

If the JSON index proves insufficient (e.g., very large libraries, concurrent writes), migrate to SQLite with this schema:

- performers(id INTEGER PRIMARY KEY, norm TEXT UNIQUE NOT NULL, name TEXT NOT NULL)
- media(id INTEGER PRIMARY KEY, rel_path TEXT UNIQUE NOT NULL, mtime_ns INTEGER NOT NULL)
- media_performers(media_id INTEGER NOT NULL, performer_id INTEGER NOT NULL, PRIMARY KEY(media_id, performer_id))
	- INDEX on media_id; INDEX on performer_id

API mapping:

- List: SELECT p.name, COUNT(mp.media_id) AS cnt FROM performers p LEFT JOIN media_performers mp ON p.id=mp.performer_id GROUP BY p.id ORDER BY cnt DESC, p.name ASC LIMIT ?, OFFSET ?
- Media add/remove performer: upsert media row by rel_path+mtime, upsert performer by norm, then insert/delete in media_performers.
- Rename: UPDATE performers SET name=?, norm=? WHERE norm=?; optionally rewrite sidecars asynchronously.
- Merge: UPDATE media_performers SET performer_id=? WHERE performer_id IN (?,...); DELETE FROM performers WHERE id IN (?,...).
- Delete: DELETE FROM performers WHERE norm=?; CASCADE via media_performers.

Migration/feature flag:

- Add env `PERFORMERS_INDEX_BACKEND=json|sqlite` (default json). When `sqlite`, create `media-player.db` in MEDIA_ROOT and route helpers accordingly.
- Provide a one-time import: read `.media_player_performers_index.json` and the registry/media-attr, populate DB tables, then switch over.

Concurrency & integrity:

- Use a single connection with PRAGMA journal_mode=WAL and foreign_keys=ON. Wrap mutations in transactions. Keep queries indexed and small.

Rollback:

- The JSON index remains compatible. You can flip the env back to `json` and the app will rebuild the file lazily on next scan.
