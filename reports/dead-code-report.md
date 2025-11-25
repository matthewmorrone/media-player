# Dead Code & Redundancy Report

_Date:_ November 25, 2025

## What Was Analyzed
- `app.py` (FastAPI backend) for unused helpers in the performers/registry stack.
- `index.js` (monolithic frontend) for duplicate helper definitions tied to performer imagery and slug handling.
- Quick `rg` searches for helper names to confirm whether definitions had any call sites.

## Confirmed Dead Code (Removed)
1. **`app.py` · `_merge_performers_registry_once`**
   - No references anywhere in the repository (`rg "_merge_performers_registry_once"` returned only the definition).
   - Logic duplicated the incremental scan already performed by `_load_performers_sidecars`.
   - Removal shrinks the backend surface area and eliminates an untested codepath that could drift from the active implementation.

## Redundant Code (Deduplicated)
1. **`index.js` · `_slugifyName` definitions**
   - Two identical implementations existed inside separate IIFEs (Connections graph + face-crop worker).
   - Consolidated into a single global helper right after `_slugify`, ensuring every consumer shares one canonical slug rule.
2. **`index.js` · `guessPerformerImagePath` definitions**
   - Also defined twice with identical logic.
   - Relocated next to `_slugifyName` so both performers UI and Connections graph reuse the same helper without re‑declaring it.

The duplication removal trims ~60 lines of parsed JS, but (more importantly) prevents future divergence—the Connections view, performers import pipeline, and any new module now stay in sync when slug rules change.

## Residual Risks / Follow‑Ups
- `edgeWidthForCount` still exists in two variants (graph vs. Connections). They intentionally use different scaling, so no change was made, but it is worth consolidating under a single helper that accepts a tuning preset if the visuals should match.
- A broader static analysis pass (e.g., `pyflakes`/`ts-prune`) could surface more unused symbols once the codebase grows—this report targeted the obvious, high-churn helpers only.

## Efficiency Impact
- Fewer duplicate function declarations means less parsing + faster startup in the single-page app.
- Removing the unused Python helper lowers import time slightly and eliminates an unreferenced registry walk during hot reloads.
