# v3 Media Player

- v1 layout + simple run
- v1 frontend (single HTML)
- v2 backend mounted under `/v2` and v1-compatible API under `/api`

## Quick start

- Optional: create a virtualenv and install top-level `v2/requirements.txt` if you plan to use heavy features. For basic shim, `pip install -r v3/requirements.txt` is enough.
- Run: `bash v3/serve.sh`
- Open: http://127.0.0.1:9998/

Environment:
- MEDIA_ROOT: absolute path of your library root (defaults to current working directory).

## Notes
- `/api/*` endpoints mimic v1 while delegating work to v2's processors and artifacts.
- The full v2 API remains available at `/v2/*`.
