# Media Player

## Quick start

- Run: `pip install -r requirements.txt`
- Run: `bash serve.sh`
- Open: http://127.0.0.1:9998/
  - Library UI: http://127.0.0.1:9998/ui/library

Environment:
- MEDIA_ROOT: absolute path of your library root (defaults to current working directory).
- API_TOKEN: if set, API requests must include this value in an `X-API-Key` header or
  `token` query parameter.
