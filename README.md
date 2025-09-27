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