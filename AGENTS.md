# Agents & Automation Policy

This file defines explicit rules and guard-rails for any automated or AI-driven process ("agents") that will modify this repository.

Purpose
- Provide a concise, machine-actionable policy so agents behave safely and predictably.
- Prevent common anti-patterns (including programmatic DOM construction for repeated UI fragments) that harm maintainability and UX.
- Serve as the single source of truth for architecture, style, and automation (replaces former `.github/copilot-instructions.md`).

---
## Architecture Snapshot (Backend & Frontend)
- Backend: Single FastAPI application (`app.py`, ~14k LOC) serving REST/JSON plus static frontend assets (`index.html`, `index.js`, `index.css`).
- Global state: `STATE` dict holding root path, config, caches. Media root derived from `MEDIA_ROOT` env var or CWD.
- Artifacts live beside media inside hidden directories (`.artifacts`, `.jobs`, etc.) to avoid polluting the visible file tree.
- Artifact sidecars per video (naming centralized via helpers):
	- `metadata.json`, `thumbnail.jpg`, `preview.webm`, `sprites.{jpg,json}`, `scenes.json`, `heatmaps.{json,png}`, `faces.json`, `phash.json`, `subtitles.*`.
- Generation model: Some artifacts inline (metadata, thumbnail, preview, phash, faces); others job-queued (sprites, scenes, subtitles). Finish flow: `/finish/plan` → `/finish/run`.
- Ordering contract: `FINISH_ARTIFACT_ORDER` ensures deterministic generation (metadata → thumbnail → sprites/preview → analysis sidecars).
- FFmpeg & quality knobs controlled purely by environment variables (never hardcode derived values): `FFMPEG_THREADS`, `FFMPEG_TIMELIMIT`, `THUMBNAIL_QUALITY`, `PREVIEW_CRF_VP9`, etc.
- Frontend: Monolithic `index.js` for DOM + fetch; pure, side‑effect‑free helpers in `utils.js`; HTML `<template>` tags in `index.html` define repeatable UI (jobs, markers, chips, etc.).
- Visibility/UI helpers: Centralized show/hide helpers; avoid scattered `style.display` or `.hidden =` toggles.
- Modals: Required DOM nodes (`#errorModal`, `#messageModal`) must exist at load; no dynamic fallback creation.

### Adding / Extending Artifacts (Guideline)
1. Add existence check or extend dispatcher.
2. Use existing path helper patterns (`<stem>.<kind>.<ext>` inside `.artifacts`).
3. Decide inline vs. job; if job-backed, map the kind to a job name in `/finish/run` logic.
4. Insert into `FINISH_ARTIFACT_ORDER` respecting logical sequencing.
5. Surface status anywhere artifact lists are shown (search for other artifact enumerations for parity).

### Frontend Pattern Essentials
- Always clone from `<template>` for repeated structures (cards, rows, badges) — NEVER assemble multi-node fragments via string concatenation or repeated `createElement` chains.
- No inline styles; define or reuse CSS classes in `index.css`.
- Debounce: Use the shared `debounce` in `utils.js`; do not roll custom timers.
- LocalStorage key naming: Prefix `mediaPlayer:` (e.g., `mediaPlayer:videoAdjust`).

---
## Style Reference
Formatting/style enforcement lives only in the ESLint configuration at `.vscode/eslint.config.json` (surfaced via VS Code settings). Agents and contributors should rely on auto-fix (source.fixAll) rather than re‑describing rules here. If a rule change is needed, edit the config—do not duplicate style text in docs.

Key intent (summary, not normative): 2‑space indent, Stroustrup braces, one statement per line, single quotes, semicolons, warning-only lint. Inline styles & manual DOM assembly for repeated UI remain disallowed (see Frontend Pattern Essentials & Agent Rules below).

---

Assistant Quick Guide (short checklist)
- Do not interact with git unless explicitly requested to do so. When git interaction is required, explain why and include the exact commands or PR flow.
- Do not create new files unless explicitly requested. If a new file is warranted, propose it first and include rationale in the PR description.
- Always implement best coding practices and formatting (use existing project style where present). Avoid drive-by reformatting unrelated to the change.
- Do not use inline styles in HTML; prefer CSS classes and update `index.css`.
- Add comments only when they clarify non-obvious logic; avoid noise comments.


Scope
- Applies to any automated actor (scripts, CI jobs, chat assistants, code-generating agents) that creates, modifies, or deletes files in this repo.
- Does not replace human code review. Agents must create a PR for any non-trivial change and must include a clear explanation of their changes.

Single‑user project note (No backwards compatibility by default)
- This repository is operated by a single maintainer for personal use. Agents MUST NOT introduce or maintain backwards-compatibility shims, legacy persistence keys, or migration code paths unless explicitly requested in the task. Prefer the simplest forward-only implementation.

Agent Rules (mandatory)
1. Use templates, not DOM assembly: Agents MUST NOT construct repeated UI fragments by composing strings, by frequently calling `document.createElement(...)`, or by using `innerHTML`/`insertAdjacentHTML` to inject large UI fragments in front-end JavaScript. Instead agents MUST add or reuse an HTML `<template id="...">` and clone it via `template.content.cloneNode(true)`.
	 - Allowed exceptions (require explicit justification in PR): tiny ephemeral measurement nodes, small utility nodes used only for non-UI measurement, or programmatic SVG where templates are impractical.
2. No inline styles: Agents must not add inline style attributes to HTML elements created by agents. Use CSS classes and add styles to `index.css` instead.
3. No secret persistence: Agents must never add secrets, tokens, credentials, or environment-specific configuration files to the repo.
4. No backwards-compatibility shims by default: Do not add legacy key fallbacks, alias routes, deprecated API handlers, or data migrations unless the task explicitly calls for them.
4. Keep changes minimal and scoped: Each automated change should be a focused commit that makes a single logical update. Large multi-file transformations require a feature branch and a human reviewer prior to merging.
5. Add tests or smoke checks when behavior is changed: If an agent changes runtime behavior (API, routing, major UI flows), it must add a basic smoke test in `scripts/` or update documentation describing manual verification steps.
6. Always include a rollback plan: Add a note in the PR description describing how to revert if the automated change causes regressions (tag, branch, or commit id).

Agent Checklist (what an agent must include in the PR body)
- Summary of change (1–2 lines)
- Files modified (list)
- Why a template was added/used (if front-end changes)
- Verification steps (unit test, smoke script, manual steps)
- Rollback instructions (git ref)

Enforcement (recommended)
- Pre-merge CI check: A lightweight grep-based job that fails when the repo contains new or changed files with the following patterns (unless the change touches an explicit exception list):
	- `document.createElement(`
	- `innerHTML\s*=`
	- `insertAdjacentHTML\(`
	- `outerHTML\s*=`
	- `new XMLSerializer\(` (if used to build large fragments)

	The CI job should only run the check on the diff (changed files) to avoid false positives in unchanged legacy code.

- Human review: PRs flagged by the check must be reviewed by a human developer who either approves or asks for templates.

Migration guidance for agents (how to replace programmatic DOM with templates)
1. Identify repeated structures: cards, list rows, tables, job rows, marker rows.
2. Add a `<template id="...">` in `index.html` near other templates (e.g., next to `cardTemplate`, `jobRowTemplate`). Include placeholder child elements with clear class names (e.g., `.marker-time`, `.marker-label`).
3. Replace `createElement` sequences in JS with `const node = document.getElementById('tplId').content.cloneNode(true);` and then fill fields using `node.querySelector('.marker-time').value = ...`.
4. Run the grep-based enforcement check; update tests/manual verification steps.

Example (BAD vs GOOD)
- BAD:
```js
const row = document.createElement('div');
row.className = 'marker-row';
// many appendChild calls...
markersList.appendChild(row);
```
- GOOD:
HTML:
```html
<template id="markerRowTemplate">
	<div class="marker-row">
		<input class="marker-time" />
		<div class="marker-label"></div>
		<button class="marker-remove">✕</button>
	</div>
</template>
```
JS:
```js
const tpl = document.getElementById('markerRowTemplate');
const node = tpl.content.cloneNode(true);
node.querySelector('.marker-time').value = fmtDuration(sec);
node.querySelector('.marker-label').textContent = label;
markersList.appendChild(node);
```

Rollback strategy for agent incidents
- Tag or branch before applying multi-file automated changes: `git tag -a pre-agent-YYYYMMDD -m "pre-agent baseline"`.
- If a deploy/regression occurs, revert the PR commit(s) and re-open a human-reviewed PR with fixes.

Agent exceptions
- Agents may request an exception by opening an Issue and assigning a human reviewer; exception PRs must include:
	- Detailed justification
	- A test plan
	- A time-boxed automatic revert if applicable

Last updated: 2025-09-30

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
