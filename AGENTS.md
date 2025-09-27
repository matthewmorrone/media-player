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

## Agent Style Guardrails (CSS / Frontend)
These are constraints the AI agent must self-enforce (not reminders for human contributors):

1. No single-line multi-property rule blocks (one declaration per line) except intentionally minified icon path data.
2. Never reintroduce duplicate base sections (`:root`, resets, button primitives). Check with a quick grep before adding.
3. Do not change property ordering inside an untouched rule just to “normalize” (avoid noisy diffs) unless a rule is already being edited.
4. Media queries must remain adjacent to the component they refine; do not move them to a global bucket.
5. Adding animations: verify uniqueness of keyframe name; no duplicate semantic variants.
6. If removing nested (invalid) CSS, ensure brace balance and replace with flat selectors in a single dedicated patch.
7. Always run a brace count sanity (open vs close) after structural edits. (Automation note: `grep -o '{' index.css | wc -l` vs `grep -o '}' ...`).
8. Avoid `transition: all`; limit to specific properties unless editing legacy code already using it.
9. Use existing custom properties; do not inline new hard-coded theme colors when a semantically equivalent var exists.
10. If a large reorganization is required, generate a parallel `index.refactor.css` and request human review before replacing the primary file.

Deviation Handling: If a constraint must be violated (e.g., urgent hotfix), the agent must annotate the diff with a brief justification comment directly above the exception.


---
Last updated: 2025-09-26
