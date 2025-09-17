# implement JSON database or make sure that backend lends itself well to switching to database

High-value, low/medium complexity for this app:
1) Scene markers editor UX — build on `/api/scenes/*` and `/api/marker`; allow add/remove/rename groups
2) Batch operations dashboard — unify batch jobs and expose cancel/retry; SSE stream for progress
3) File operations: move to folders by tag/performer; safe trash; rename using templates

Medium/higher effort but feasible incrementally:
8) Face clustering to identities (name assignment) — keep embeddings, add simple identity store per library

- Phase: Library filters and saved views
  - Extend `/api/library` with filter params: `tags`, `performers`, `rating_gte`, `rating_lte`, `dur_min`, `dur_max`
  - Add `/api/views/*` to CRUD saved filters in `~/.media-player/views.json`
  - Filters: by tag(s), performer(s), rating range, duration range
  - Saved views: CRUD named filters stored locally in JSON
  - Rich filtering in library list (by tags, performers, rating, duration range) — build on existing params

- Phase: Duplicate manager
  - Duplicate manager UI using existing pHash endpoint — list pairs and allow quick delete/keep
  - Wrap existing pHash duplicates into a paged list with actions
  - Add `/api/duplicates/list` wrapping `/phash/duplicates` with paging and optional actions
  - Frontend grid to review pairs, quick actions (open location, delete one)

- Phase: Tag/performer management
  - Rename, merge, bulk ops over sidecar JSONs
  - Performer and tag management panel — CRUD over sidecar JSON (bulk rename/merge)
- Phase: Scenes editor
  - Add/remove markers endpoints and simple UI support
  - Extend scenes API with delete marker and bulk set
  - Minimal UI to scrub and place markers; list and remove
- Phase: Jobs dashboard
  - Per-job detail endpoint and SSE; cancel support in loops
  - `/api/jobs/stream` SSE and `/api/jobs/{id}` detail; add cancel flag support to worker loops
- Phase: Tags/performers management
  - Add `/api/tags/rename`, `/api/tags/merge`, `/api/performers/rename`, `/api/performers/merge`
  - Batch apply over sidecar files
- Phase: Identity and search extras (optional)
  - Face identities store and labeling endpoints
  - Subtitle full-text index (Whoosh/simple inverted index JSON)

## Feature specs

### Library filters & saved views
- Extend `GET /api/library` with filters: `tags[]`, `performers[]`, `rating_gte`, `rating_lte`, `dur_min`, `dur_max`.
- Saved views CRUD: `/api/views` (GET list), `/api/views/{name}` (GET/PUT/DELETE); persisted in `~/.media-player/views.json`.
- UI: rich filtering on library list (tags, performers, rating, duration range).

### Duplicate manager
- Wrap pHash duplicates into a paged API: `GET /api/duplicates/list?offset&limit`.
- Actions: `POST /api/duplicates/action` `{ pairId, action: "keep"|"delete_left"|"delete_right" }`.
- UI: grid to review pairs; quick actions (open location, delete one).

### Tags & performers management
- Bulk rename/merge; CRUD over sidecar JSONs.
- Endpoints: `POST /api/tags/rename`, `POST /api/tags/merge`, `POST /api/performers/rename`, `POST /api/performers/merge`.

### Scenes editor
- Endpoints: `POST /api/scenes/marker` (add/update), `DELETE /api/scenes/marker/{id}` (remove), `POST /api/scenes/markers/bulk` (set list).
- UI: scrub to place markers; list, remove; group add/remove/rename.
- Scenes markers editor UX — build on scenes APIs; support add/remove/rename groups.


### Jobs dashboard
- Live stream: `GET /api/jobs/stream` (SSE).
- Detail: `GET /api/jobs/{id}`.
- Control: `POST /api/jobs/{id}/cancel`; ensure worker loops honor cancel flags.
- File operations — move by tag/performer, safe trash, template-based rename.

### Identity extras
- Face identities store + labeling endpoints.
- Face clustering → identities (keep embeddings; simple per-library identity store).



