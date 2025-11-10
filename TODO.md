# TODO (Structured Roadmap)


### Known issues:
<!-- the 405 was coming from clicking on the artifact chip in the player tab, not batch.  -->
+ Orphans detects same-name orphans
+ No percentage progress for orphans
+ get a weird transparent 405 modal when trying to regenerate a thumbnail
+ when selecting files for tasks tab, no way to specify which artifacts to generate
+ thumbnail doesn't update in the UI without a refresh
+ add a way to filter by duration: input and lt/gt/eq
+ in performers metadata, stores both image and images array: this is redundant
+ menus for artifact generation don't appear: ... buttons with options
+ batch jobs for metadata and thumbnail generation should be split into individual jobs
+ metadata job shows hyphen for time instead of current duration
+ add forward and backward buttons in player: forward hits random, backward will require history
+ heatmap still not visible
+ still no shift click in the library grid
+ background idling would be nice
+ use tensorflowjs/blazeface to detect faces for centering

## Now
- [x] add a tab for library-wide statistics: number of files, library size, library total duration, resolution pi chart, duration pi chart, number of tags, number of performers
- [x] add a boolean favorite heart icon
- [x] move forward and back with left and right arrows (amount of time specified in settings)
- [ ] jump forward and backward by scene markers
- [ ] persist color filters
- [x] Phone/Mobile Layout optimization
- [x] Fire TV Layout optimization

## Later
- [ ] List layout
  Full-featured file list as a table: sortable/resizable/reorderable columns, column selection, column drag-and-drop, rotating headers.
  Per-column and per-row selection with checkboxes and batch actions.
  Persisted column preferences, metadata column autodetection, and reset/discover UI.
  Toggleable column configuration (show/hide, reorder, drag-resize).
  List row double-click to play, click to select, header clicks for sort.
- [ ] Library Filters: Duration, Rating, Tags, Performers, Resolution, Performer Count, Recency, Etc.
  .chips containers in file info and also in sidebar and tag editor.
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
