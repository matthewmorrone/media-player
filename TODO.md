# TODO (Structured Roadmap)

options menus for artifact generation don't show up

### Known issues:
- [ ] No percentage progress for orphans
- [x] thumbnail doesn't update in the UI without a refresh
- [ ] add a way to filter by duration: input and lt/gt/eq
- [x] in performers metadata, stores both image and images array: this is redundant
- [ ] menus for artifact generation don't appear: ... buttons with options
- [ ] batch jobs for metadata and thumbnail generation should be split into individual jobs
- [ ] metadata job shows hyphen for time instead of current duration
- [ ] add forward and backward buttons in player: forward hits random, backward will require history
- [x] still no shift click in the library grid
- [x] background idling would be nice (tools/idle_worker.py exists, decoupled by design)
- [ ] use tensorflowjs/blazeface to detect faces for centering
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
- [ ] Database backend, maybe even full portability
- [ ] full import/export
