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
- MEDIA_DATA_BACKEND: set to `dual` (default) to allow both DB + JSON reads, `db` to disable tag/performer sidecar reads & writes, or `files` to keep legacy JSON as the only source while importing.

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

### Database sidecar migration
Use `python tools/migrate_media_attr.py` to import the legacy `.artifacts/scenes.json` index and per-video `*.tags.json` files into SQLite. The tool reports row counts and SHA-256 hashes for the sidecars vs. the database so you can spot drift before removing the JSON. Typical flow:

```bash
# Dry-run: preview diffs without touching the DB
python tools/migrate_media_attr.py

# Apply imports, then archive the JSON files into .artifacts/archive/media-attr/<timestamp>
python tools/migrate_media_attr.py --apply --archive

# Emit machine-readable JSON summary
python tools/migrate_media_attr.py --json
```

Flags such as `--limit` (process first N paths), `--delete` (remove JSON after a clean run), and `--archive-dir` (custom destination) help when validating large libraries.

### Database scaffold
- Schema lives in `db/schema.sql` and is applied automatically on startup.
- The SQLite file defaults to `<MEDIA_PLAYER_STATE_DIR>/.state/media-player.db`. When that env var is unset we now resolve the base to the user-level application data directory (e.g., `~/Library/Application Support/media-player/.state` on macOS, `%APPDATA%/Media Player/.state` on Windows, or `~/.local/share/media-player/.state` on Linux).
- Override the location by setting `MEDIA_PLAYER_DB_PATH=/absolute/path/to/media-player.db` if you need the database elsewhere.

### DB-first workflows
- `/api/library`, `/api/stats`, `/api/tasks/coverage`, `/api/tags`, `/api/performers`, `/report`, and the Library/List tabs now read from SQLite first and fall back to filesystem walks only when the DB has no coverage for a path.
- All tag/performer mutations, artifact refreshes, and job/subtitle/metadata pipelines write through SQLite as the source of truth; JSON sidecars exist solely for legacy tooling.
- Set `MEDIA_DATA_BACKEND=db` whenever you want the server to avoid reading/writing `*.tags.json` entirely (artifacts still write to disk). Use this after migrating so only SQLite drives metadata.
- The `/api/db/status` endpoint, `tools/migrate_media_attr.py`, and `tools/db_backup.py` form the core operational toolkit: status → import/update → backup/export.
- Cold-start a new library by running `python tools/migrate_media_attr.py --apply`, then `POST /api/db/import` (or `python tools/artifacts.py --root <path> --what all`) to populate the remaining artifact tables; UI endpoints will be instant once the DB is hydrated.

### Migration & rollback checklist
1. Stop the server, ensure a backup of `.artifacts/scenes.json` plus any `*.tags.json` sidecars exists (the migrate tool can archive them automatically).
2. Run `python tools/migrate_media_attr.py --apply --archive` to import performers/tags + metadata into SQLite.
3. Restart `./serve.sh` and visit `/api/db/status`; confirm `legacy_files` is empty and row counts look sane.
4. (Optional) Disable future JSON writes with `MEDIA_ATTR_SIDECAR_WRITE=0 ./serve.sh` so only the DB receives updates.
5. Use `python tools/db_backup.py --out backups/media-player-$(date +%Y%m%d).json` (or `GET /api/jobs/backup`) to snapshot the DB before deleting legacy files.

Rollback steps:
1. Restore the archived `.artifacts/scenes.json` and `*.tags.json` produced in step 1.
2. Start the server with `MEDIA_ATTR_SIDECAR_WRITE=1` so mutations re-populate sidecars.
3. Call `python tools/migrate_media_attr.py --apply` (without `--archive`) to push DB contents back into the JSON store if you need parity before disabling the DB.
4. Endpoints automatically fall back to filesystem scans when the relevant tables are empty, so no additional flags are required.

## Troubleshooting
ffmpeg missing: install via your package manager (e.g., `brew install ffmpeg`, `apt-get install ffmpeg`).
Port already in use: set `PORT=9999 ./serve.sh`.
Root path wrong: `curl http://localhost:9998/api/root` (GET) / `POST /api/root` with `{ "root": "/new/path" }`.
Schema drift: `GET /api/db/status` reports the expected vs. actual schema version, key table row counts, and whether any legacy files (e.g., `.jobs/*.json`) still need cleanup.

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

## Legacy sidecar fallback

- The SQLite database is authoritative for all list/stat/report endpoints, but every route still has a filesystem fallback for safety. If the DB tables are empty, `/api/library`, `/api/stats`, `/api/tags`, `/api/performers`, etc. will walk the media root and (re)hydrate the DB opportunistically.
- Leave `MEDIA_ATTR_SIDECAR_WRITE=1` if you still need `.artifacts/scenes.json` and per-file `*.tags.json` for external tooling. Set it to `0` once you fully trust the DB to reduce disk churn.
- Prefer `MEDIA_DATA_BACKEND=db` instead of juggling multiple *_SIDECAR_* flags when you want a clean DB-only run; it disables tag/performer sidecar reads and writes globally while keeping artifact generation untouched.
- To regenerate the DB from sidecars after a rollback, run `python tools/migrate_media_attr.py --apply` followed by `POST /api/db/import` (or the relevant `tools/artifacts.py` command) and watch `/api/db/status` until row counts recover.
- JSON archives created by the migrate tool live under `.artifacts/archive/media-attr/<timestamp>`; restore those files if you ever need to abandon the DB temporarily.
