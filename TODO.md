# TODO (Structured Roadmap)

## Database Migration Plan
- [x] **Dual-write safety (current requirement):** ensure every metadata/tags/performers/artifact/job mutation continues to update the legacy flat files _and_ the SQLite tables in lockstep (failures must be reported and retried) until a later cutoff is agreed.
- [x] **Metadata authority flip:** Update `/media/description`, `/media/rating`, `/media/favorite`, `/media/info*` endpoints so writes/reads go straight to the `video` table; gate sidecar writes behind a compatibility flag (`METADATA_SIDECAR_WRITE`) and delete when parity confirmed.
- [x] **Tag/performer CRUD overhaul:** Rework `/media/tags/*`, `/media/performers/*`, bulk-add/remove, and performer auto-match flows to mutate `media_tags` / `media_performers` link tables; regenerate `_MEDIA_ATTR` from SQLite (sidecar writes now optional via `MEDIA_ATTR_SIDECAR_WRITE`).
- [ ] **Artifact and status queries:** Introduce centralized SQL query helpers for artifacts, coverage, and list views (e.g., `get_media_listing`, `get_artifact_flags`); have `/grid`, `/list`, `/tasks/coverage`, `/report`, and sidebar summaries execute SQL instead of filesystem scans.
- [ ] **Search/filter engine:** Implement DB-backed filtering (duration, rating, tags, performers, favorites, missing artifacts, date ranges) with pagination so the UI can support richer queries once the filesystem fallback is gone.
- [ ] **Migration + validator CLI:** Build a `tools/migrate_media_attr.py` (or extend `tools/artifacts.py`) that imports existing `.artifacts/scenes.json`, `.tags.json` sidecars, verifies row counts/hashes, and reports drift before deleting/archiving the JSON files.
- [ ] **Job persistence unification:** Remove `.jobs/*.json` snapshots by ensuring `_restore_jobs_on_start` reads exclusively from the `job` table, add cleanup for orphaned DB rows, and expose `/api/jobs/backup` to export/import job queues when needed.
- [ ] **Bootstrapping & health:** Add `/api/db/status` to report schema version, row counts, and whether any legacy files still exist; refuse to start if DB migrations haven’t been applied (Alembic-lite or manual version table).
- [ ] **Front-end adjustments:** Modify `index.js` fetchers to rely on the new SQL-backed endpoints (sorting, filters, stats) and remove code paths that expect sidecar-only fields.
- [ ] **Import/export utilities:** Ship CLI commands to dump/load SQLite contents (videos, tags, performers, artifacts, jobs) to JSON for backups, mirroring the prior flat-file portability story.
- [ ] **Documentation & ops:** Update `README.md`, `static/AGENTS.md`, and `/api/routes` descriptions with the new DB-first workflows, migration steps, and rollback instructions so operators know how to retire flat files.

Media Player



Network graph of porn stars
Better duplicate resolution
Facial recognition pipeline
New movie import pipeline:
	copy to server
	detect in scan
	run script for tagging
	check if any scenes are recognized in stashdb
	add new performers
	check if any performers are added in stashdb


	•	Persistent database and complex data model: StashApp maintains structured entities for scenes, images, galleries, performers, studios, and tags, whereas this app relies mostly on the filesystem without a relational or graph database.




•	implement Comprehensive web UI for browsing, editing, and searching the library
•	Metadata scraping and StashBox integration: scrape Google or something
•	File scanning and library management: automatically scan directories, import new media, rename files, and track changes, implement automatic artifact generation and automated import pipeline.
•	Plugin and scripting ecosystem: implement hooks for scraping, post-processing, and custom workflows
•	Advanced search and filtering UI: implement rich filtering (e.g., by tags, performers, studios, resolution, duration, and custom fields) along with saved searches and complex query language.
•	Video playback and streaming features: implement integrated video playback, HLS transcoding, scene markers, preview tiles, and heatmaps in the UI
•	Scene editing and markers: allow users to create, edit, and export scene markers, chapters, and interactive metadata
•	Duplicate detection and management UI: implement visual deduplication workflows with UI support

### Known issues:
- [ ] No percentage progress for orphans
- [x] thumbnail doesn't update in the UI without a refresh
- [ ] add a way to filter by duration: input and lt/gt/eq
- [x] in performers metadata, stores both image and images array: this is redundant
- [ ] batch jobs for metadata and thumbnail generation should be split into individual jobs
- [ ] add forward and backward buttons in player: forward hits random, backward will require history
- [x] still no shift click in the library grid
- [x] background idling would be nice (tools/idle_worker.py exists, decoupled by design)
- [x] use tensorflowjs/blazeface to detect faces for centering
- [x] resetting player/unloading video fires twice

## Now
- [x] add a tab for library-wide statistics: number of files, library size, library total duration, resolution pi chart, duration pi chart, number of tags, number of performers
- [x] add a boolean favorite heart icon (videoFavorite + btnFavorite with toggle, persists to /api/media/favorite)
- [x] move forward and back with left and right arrows (amount of time specified in settings)
- [ ] jump forward and backward by scene markers
- [ ] persist color filters (controls exist, persistence unclear)
- [x] Phone/Mobile Layout optimization
- [x] Fire TV Layout optimization

## Later
- [x] List layout (Complete: #list-panel tab with sortable/resizable columns, drag-and-drop reordering, column config panel, row selection, pagination)
  Per-column and per-row selection with checkboxes and batch actions.
  Spreadsheet-like selection with batch editing
- [ ] Library Filters: Duration, Rating, Tags, Performers, Resolution, Performer Count, Recency, Etc.
  chips containers in file info and also in sidebar and tag editor.
  Inline chips for tags and performers with add (input), remove (button), and autocomplete.
  Used in both the main list search/filter and in file detail/tag editor panels.
- [ ] Saved Library Views: Filters and Multisort Order
- [ ] Storage Layering Abstraction (Prep for DB Swap Later)
- [ ] FaceLab with face tuning knobs and results grid
  Face Identities & Clustering (Embedding Grouping, Identity Store)
- [ ] Implementation of Playlists
- [ ] configurable keyboard shortcuts
- [ ] UI to split a file into pieces
- [ ] Integrity scan (checks for missing/corrupt files)
- [ ] Batch Operations Dashboard (Unify Jobs With Cancel/Retry Ux)
- [ ] Advanced Search Scoring (Duration/Rating Weighting)
- [ ] Transcoding features

## Under the Hood
- [ ] full import/export
