## TODO (Structured Roadmap)

### Easy
- [ ] Scenes markers editor
  - Endpoints: `POST /api/scenes/marker` (add/update), `DELETE /api/scenes/marker/{id}` (remove), `POST /api/scenes/markers/bulk` (bulk set)
  - Accept: Can add/remove markers and manage groups (add/rename/delete)
- [ ] Library filters (backend)
  - Extend `GET /api/library` with `tags[]`, `performers[]`, `rating_gte`, `rating_lte`, `dur_min`, `dur_max`
  - Accept: Combined filters narrow result set correctly
- [ ] Saved views
  - CRUD: `/api/views` list, `/api/views/{name}` GET/PUT/DELETE; store in `~/.media-player/views.json`
  - Accept: Round-trip create/update/delete
- [ ] Duplicate manager API wrapper
  - `GET /api/duplicates/list?offset&limit` wrapping pHash duplicates
  - `POST /api/duplicates/action` `{ pairId, action: keep|delete_left|delete_right }`
  - Accept: Pagination + actions reflected on next fetch

### Medium
- [ ] Duplicate manager UI (grid review, key actions)
- [ ] File operations suite (move by tag/performer, safe trash, template rename; dry-run preview)
- [ ] Tags & performers management (rename / merge endpoints & UI)
- [ ] Jobs dashboard (SSE stream + cancel/retry + per-job detail)
- [ ] Storage layering abstraction (prep for DB swap later)

### Hard
- [ ] Face identities & clustering (embedding grouping, identity store)
- [ ] Subtitle full-text index (search over subtitles; phrase + boolean)

### Nice-to-have / Later
- [ ] Batch operations dashboard (unify jobs with cancel/retry UX)
- [ ] Advanced search scoring (duration/rating weighting)

### Acceptance Criteria Notes
- All destructive operations (delete, move) require explicit confirmation or dry-run path.
- SSE endpoints silent-fail tolerant; clients can reconnect without losing state.
- Pluggable persistence layer isolates JSON sidecars vs future DB.



