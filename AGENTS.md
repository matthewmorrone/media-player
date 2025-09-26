# Agents & Automation

This document tracks autonomous or semi-autonomous helpers ("agents") that have interacted with this repository and the conventions for safe usage.

## Purpose
Provide a transparent log and a guard-rail checklist when letting scripted or AI-driven processes modify the codebase.

## Current / Historical Agents

| Agent | Scope | Notable Changes | Safety Notes |
|-------|-------|-----------------|--------------|
| Copilot Chat (guided) | Incremental refactors, HTML/CSS tweaks, backend endpoints | Added root path endpoints, refactored SVG icons into sprite, improved `serve.sh` runner detection | Human reviewed every patch; no mass search/replace runs |
| Stash Salvage (manual+AI) | Selected lines from discarded stash | Restored root endpoints, README/TODO restructuring | Verified no destructive diff before applying |

## Operational Guidelines

1. Always diff before commit: `git diff --stat` then inspect hunks.
2. Isolate risky multi-file automation in a feature branch.
3. Keep patches minimal: unrelated formatting goes in separate commits.
4. For generated scripts (install / serve), prefer idempotent, side-effect-light logic.
5. Never store secrets; environment variables documented, not committed.
6. Large deletions (>200 LOC) require manual double-check.

## Commit Hygiene Checklist
- [ ] Logical single concern
- [ ] Includes/update docs if behavior changes
- [ ] Adds/updates quick usage notes if user-facing
- [ ] No accidental binary blobs
- [ ] `serve.sh` / `install.sh` still run after change

## Adding a New Agent
Describe: purpose, boundaries, rollback plan. Example template:
```md
### Agent: <name>
Goal: <what problem it solves>
Boundaries: (files / layers it may touch)
Exclusions: (never touch these paths)
Verification: (tests / manual steps)
Rollback: (branch / tag saved at <ref>)
```

## Rollback Strategy
Tag stable baselines before large automated refactors:
```bash
git tag -a pre-agent-YYYYMMDD -m "Baseline before <agent>"
```
If something goes wrong, revert or reset to tag and cherry-pick good commits.

## Open Ideas
- Lightweight smoke test script (`scripts/smoke.sh`) to validate API health.
- JSON manifest of last N agent runs with timestamps.

---
Last updated: 2025-09-26
