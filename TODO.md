# TODO (Structured Roadmap)

## Already
- unify marker appearance
- unify tags display and input
- add rating, favorite, description to video tab, merge with file info
- in the UI, it's fine to just calls these "intro" and "outro". make their times editable as well. for the rest of the markers, add text inputs so that they align with intro and outro

## Now
- add a tab for library-wide statistics: number of files, library size, library total duration, resolution pi chart, duration pi chart, number of tags, number of performers
- add a description in the video side bar tab that becomes editable on focus/blur like the filename, wire up backend to persist in metadata
- add a 5 star rating system in the video sidebar tab that persists automatically, and a boolean favorite heart icon
- move forward and back with left and right arrows (amount of time specified in settings)
- persist color filters

## Soon
- [ ] supersede old-index.html
- [ ] Restore The Color Alteration and Video Editing Controls To Filters Sidebar Tab With A Clean, Minimal UI
- [ ] jump forward and backward by scene markers
- [ ] Functional Tags and Performers Pages: improve sidebar UI
- [ ] Ensure performers and tags, chip tags, and their batch import (and export) work as expected
- [ ] registry management tab for tags/performers, custom image tab with tiles
- [ ] Add Deduplication Tab Back To UI (Grid Review, Key Actions)
  pHash “Similar” cluster tab
- [ ] Layout optimization
  Phone/Mobile
  Fire TV
- [ ] consider adding a "needs looked at" sentiment similar to favorite

## Later
- [ ] FaceLab with face tuning knobs and results grid
  Face Identities & Clustering (Embedding Grouping, Identity Store)
- [ ] List layout
  Full-featured file list as a table: sortable/resizable/reorderable columns, column selection, column drag-and-drop, rotating headers.
  Per-column and per-row selection with checkboxes and batch actions.
  Persisted column preferences, metadata column autodetection, and reset/discover UI.
  Toggleable column configuration (show/hide, reorder, drag-resize).
  List row double-click to play, click to select, header clicks for sort.
- [ ] Implementation of Playlists
- [ ] configurable keyboard shortcuts
- [ ] UI to split a file into pieces
- [ ] Integrity scan (checks for missing/corrupt files)
- [ ] Library Filters: Duration, Rating, Tags, Performers, Resolution, Performer Count, Recency, Etc. 
  .chips containers in file info and also in sidebar and tag editor.
  Inline chips for tags and performers with add (input), remove (button), and autocomplete.
  Used in both the main list search/filter and in file detail/tag editor panels.
- [ ] Saved Library Views: Filters and Multisort Order
- [ ] Storage Layering Abstraction (Prep for DB Swap Later)
- [ ] Batch Operations Dashboard (Unify Jobs With Cancel/Retry Ux)
- [ ] Advanced Search Scoring (Duration/Rating Weighting)
- [ ] Transcoding features

## Under the Hood
- [ ] Database backend, maybe even full portability
- [ ] full import/export