<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Media Library</title>
  <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
  <link rel="manifest" href="/static/manifest.json" />
  <link rel="stylesheet" href="index.css" />
  <!-- Cytoscape.js and plugins (for Performers Graph tab) -->
  <link rel="stylesheet" href="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape.js-panzoom.css" />
  <script src="https://unpkg.com/cytoscape@3.27.0/dist/cytoscape.min.js"></script>
  <!-- fcose dependencies (must be loaded before fcose) -->
  <script src="https://unpkg.com/layout-base@2.0.1/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base@2.2.0/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js"></script>
  <script src="https://unpkg.com/webcola@3.4.0/WebCola/cola.min.js"></script>
  <script src="https://unpkg.com/cytoscape-cola@2.5.1/cytoscape-cola.js"></script>
  <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
  <script src="https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
  <script src="https://unpkg.com/klayjs@0.4.1/klay.js"></script>
  <script src="https://unpkg.com/cytoscape-klay@3.1.4/cytoscape-klay.js"></script>
  <script src="https://unpkg.com/cytoscape-spread@3.0.0/cytoscape-spread.js"></script>
  <script src="https://unpkg.com/cytoscape-cise@1.0.0/cytoscape-cise.js"></script>
  <script src="https://unpkg.com/cytoscape-avsdf@1.0.0/cytoscape-avsdf.js"></script>
  <script src="https://unpkg.com/cytoscape-euler@1.2.0/cytoscape-euler.js"></script>
  <script src="https://unpkg.com/cytoscape-cose-bilkent@4.1.0/cytoscape-cose-bilkent.js"></script>
  <script src="https://unpkg.com/cytoscape-cxtmenu@3.5.0/cytoscape-cxtmenu.js"></script>
  <script src="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape-panzoom.js"></script>
  <script>
    // Apply collapsed class ASAP to avoid post-load reflow when sidebar is persisted collapsed
    try {
      if (localStorage.getItem('mediaPlayer:sidebarCollapsed') === '1') {
        (document.documentElement || document.body).classList.add('has-sidebar-collapsed');
      }
    } catch (e) { }
  </script>
  <script>window.__JOBS_SSE_ENABLED = false; /* detected by client via /api/config; default false to avoid assumptions */</script>
  <script>
    // Fire TV/Android TV Detection
    (function() {
      const isFireTV = /silk|aftvb|afts|aft\w|aftt/i.test(navigator.userAgent);
      const isAndroidTV = /android.*tv|googletv/i.test(navigator.userAgent);

      if (isFireTV || isAndroidTV) {
        document.documentElement.classList.add('firetv');
        // Also add to <body> once DOM is ready so body-scoped rules can apply
        const addBodyClass = () => {
          try {
            document.body.classList.add('firetv');
          }
          catch (_) {}
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', addBodyClass, { once: true });
        }
        else {
          addBodyClass();
        }
      }
    })();
  </script>
  <script type="module" src="index.js"></script>
  <style>
    /* Column filter trigger and popover (List tab) */
    .col-filter-trigger { margin-left: 6px; font-size: 12px; opacity: .7; cursor: pointer; }
    .col-filter-trigger:hover { opacity: 1; }
    .list-filter-menu { position: absolute; z-index: 9999; background: var(--panel-bg, #111827); color: inherit; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.35); min-width: 220px; }
    .list-filter-menu .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .list-filter-menu .values { padding: 4px 0; }
    .list-filter-menu .values label { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 4px; font-size: 12px; }
    .list-filter-menu .values label span { color: var(--muted); }
    .list-filter-menu .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .list-filter-menu select.control-select { height: 26px; font-size: 12px; padding: 0 18px 0 8px; }
    .list-table tbody td.col-artifacts .chips-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .list-table tbody td.col-artifacts .chip { font-size: 11px; padding: 2px 6px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .list-table tbody td.col-artifacts .chip--ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.4); color: #bbf7d0; }
    .list-table tbody td.col-artifacts .chip--missing { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.45); color: #fecaca; }
  </style>
</head>

<body>
  <!-- Inline SVG sprite (all icon symbols embedded; external icons.svg removed) -->
  <svg aria-hidden="true" focusable="false" class="svg-sprite">
    <symbol id="icon-placeholder" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0e1016" />
          <stop offset="100%" stop-color="#1a2030" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g)" />
      <g fill="#3b4663">
        <rect x="30" y="40" width="260" height="100" rx="8" />
        <polygon points="140,90 140,70 200,90 140,110" fill="#6b7aa6" />
      </g>
    </symbol>
    <symbol id="icon-play" viewBox="0 0 24 24">
      <!-- Triangular play icon with slight inset for sharper edges -->
      <path d="M7 5v14l11-7-11-7z" fill="currentColor" />
    </symbol>
    <symbol id="icon-pause" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </symbol>
    <symbol id="icon-vol" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <!-- Sound waves (shown only in unmuted icon) -->
      <path d="M14 9.5c.9.6 1.5 1.5 1.5 2.5s-.6 1.9-1.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
      <path d="M16.5 7.5c1.4 1 2.5 2.6 2.5 4.5s-1.1 3.5-2.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
    </symbol>
    <symbol id="icon-muted" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <path d="M16 8l4 8M20 8l-4 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </symbol>
    <symbol id="icon-options" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </symbol>
    <symbol id="icon-gear" viewBox="0 0 24 24">
      <!-- Simplified cog with 6 teeth for clarity at small sizes -->
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
      <path d="M12 2.75l1.2.45a2 2 0 0 0 2.6-1.2l.3-.8 2.2 1.27-.3.8a2 2 0 0 0 1.2 2.6l.8.3v2.54l-.8.3a2 2 0 0 0-1.2 2.6l.3.8-2.2 1.27-.3-.8a2 2 0 0 0-2.6-1.2l-1.2.45-1.2-.45a2 2 0 0 0-2.6 1.2l-.3.8-2.2-1.27.3-.8a2 2 0 0 0-1.2-2.6l-.8-.3V8.37l.8-.3a2 2 0 0 0 1.2-2.6l-.3-.8L7.9 3.2l.3.8A2 2 0 0 0 10.8 5l1.2-.45z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" opacity="0.9" />
    </symbol>
    <symbol id="icon-caret" viewBox="0 0 24 24">
      <!-- filled chevron for better visibility (uses currentColor) -->
      <path d="M9 18 L15 12 L9 6 Z" fill="currentColor" />
    </symbol>
    <symbol id="icon-jump" viewBox="0 0 24 24">
      <path d="M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zm5.5-3.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </symbol>
    <symbol id="icon-clear" viewBox="0 0 24 24">
      <path d="M12 10.586 7.757 6.343 6.343 7.757 10.586 12l-4.243 4.243 1.414 1.414L12 13.414l4.243 4.243 1.414-1.414L13.414 12l4.243-4.243-1.414-1.414L12 10.586z" fill="currentColor" />
    </symbol>
    <symbol id="icon-reset" viewBox="0 0 24 24">
      <!-- Circular arrow reset icon -->
      <path d="M12 5a7 7 0 1 1-6.23 4H8a1 1 0 0 0 0-2H4.5A1.5 1.5 0 0 0 3 8.5V13a1 1 0 0 0 2 0V9.97A9 9 0 1 0 12 3v2z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" />
    </symbol>
    <symbol id="icon-restart" viewBox="0 0 24 24">
      <!-- Replay arrow for restarting current video -->
      <path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6s-2.69 6-6 6a6 6 0 0 1-5.65-4H6.1A8 8 0 0 0 20 15c0-4.42-3.58-8-8-8z" fill="currentColor" />
    </symbol>
    <symbol id="icon-prev" viewBox="0 0 24 24">
      <path d="M18 5v14l-8-7 8-7z" fill="currentColor" />
      <path d="M6 5h2v14H6z" fill="currentColor" />
    </symbol>
    <symbol id="icon-next" viewBox="0 0 24 24">
      <path d="M6 5v14l8-7-8-7z" fill="currentColor" />
      <path d="M16 5h2v14h-2z" fill="currentColor" />
    </symbol>
    <!-- Shuffle / Random icon (path supplied by user) -->
    <symbol id="icon-shuffle" viewBox="0 0 1792 1792">
      <path fill="currentColor" d="M666 481q-60 92-137 273-22-45-37-72.5t-40.5-63.5-51-56.5-63-35-81.5-14.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q250 0 410 225zm1126 799q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192q-32 0-85 .5t-81 1-73-1-71-5-64-10.5-63-18.5-58-28.5-59-40-55-53.5-56-69.5q59-93 136-273 22 45 37 72.5t40.5 63.5 51 56.5 63 35 81.5 14.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23zm0-896q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192h-256q-48 0-87 15t-69 45-51 61.5-45 77.5q-32 62-78 171-29 66-49.5 111t-54 105-64 100-74 83-90 68.5-106.5 42-128 16.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q48 0 87-15t69-45 51-61.5 45-77.5q32-62 78-171 29-66 49.5-111t54-105 64-100 74-83 90-68.5 106.5-42 128-16.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23z"/>
    </symbol>
    <!-- Repeat / Auto icon (two arrows in a circle) -->
    <symbol id="icon-repeat" viewBox="0 0 24 24">
      <path d="M7 7h7a5 5 0 0 1 0 10H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 7l2.5-2.5M7 7L4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17l-2.5 2.5M17 17l2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- Auto/loop icon for Random Auto (infinity-like circles) -->
    <symbol id="icon-auto-shuffle" viewBox="0 0 24 24">
      <path fill="currentColor" d="M20.288 9.463a4.856 4.856 0 0 0-4.336-2.3 4.586 4.586 0 0 0-3.343 1.767c.071.116.148.226.212.347l.879 1.652.134-.254a2.71 2.71 0 0 1 2.206-1.519 2.845 2.845 0 1 1 0 5.686 2.708 2.708 0 0 1-2.205-1.518L13.131 12l-1.193-2.26a4.709 4.709 0 0 0-3.89-2.581 4.845 4.845 0 1 0 0 9.682 4.586 4.586 0 0 0 3.343-1.767c-.071-.116-.148-.226-.212-.347l-.879-1.656-.134.254a2.71 2.71 0 0 1-2.206 1.519 2.855 2.855 0 0 1-2.559-1.369 2.825 2.825 0 0 1 0-2.946 2.862 2.862 0 0 1 2.442-1.374h.121a2.708 2.708 0 0 1 2.205 1.518l.7 1.327 1.193 2.26a4.709 4.709 0 0 0 3.89 2.581h.209a4.846 4.846 0 0 0 4.127-7.378z"/>
    </symbol>
    <symbol id="icon-cc" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M11.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5M17.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </symbol>
    <!-- Rating and Favorite Icons -->
    <symbol id="icon-star" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-star-filled" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
    </symbol>
    <symbol id="icon-heart" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-heart-filled" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="currentColor" />
    </symbol>
    <!-- Camera icon for frame download -->
    <symbol id="icon-camera" viewBox="0 0 24 24">
      <path d="M4 7h3.2l1.6-2h6.4l1.6 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="18" cy="9" r="1" fill="currentColor" />
    </symbol>
  </svg>

  <!-- Hidden SVG filters for video color matrix (kept with SVG definitions) -->
  <svg width="0" height="0" class="sprite-defs-hidden" aria-hidden="true" focusable="false">
    <filter id="playerColorMatrix" color-interpolation-filters="sRGB">
      <feColorMatrix id="playerColorMatrixValues" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>
  </svg>

  <!-- Templates: Settings JSON panels (Health, Config) -->
  <template id="settingsHealthTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Health</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm health-refresh" title="Refresh health">Refresh</button>
      </header>
      <pre class="json-pre health-pre" aria-live="polite"></pre>
    </section>
  </template>
  <template id="settingsConfigTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Config</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm config-refresh" title="Refresh config">Refresh</button>
      </header>
      <pre class="json-pre config-pre" aria-live="polite"></pre>
    </section>
  </template>

  <!-- Templates: Performers (card + empty state) -->
  <template id="performerCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select performer"></div>
      <div class="pc-top">
        <div class="pc-avatar" role="button" tabindex="0" aria-label="Upload image">
          <img class="pc-avatar-img" alt="" loading="lazy" hidden />
          <svg class="pc-avatar-icon" width="18" height="18" aria-hidden="true"><use href="#icon-camera"></use></svg>
        </div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <div class="pc-metadata hint-sm"></div>
        </div>
        <div class="pc-countwrap">
          <div class="pc-count" title="Files">0</div>
          <span class="pc-face-indicator" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </template>
  <!-- Templates: Tags (card) -->
  <template id="tagCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select tag"></div>
      <div class="pc-top">
        <div class="pc-avatar" aria-hidden="true"></div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <button class="tag-open-library-btn" type="button">Show in Library</button>
        </div>
        <span class="pc-count" title=""></span>
      </div>
    </div>
  </template>
  <template id="emptyHintTemplate">
    <div class="hint-sm empty-hint"></div>
  </template>

  <!-- Performer Import Preview Modal (moved inside <body> and grouped with other modals) -->
  <div id="performerImportPreviewModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <strong>Import Performers Preview</strong>
        <button id="performerImportPreviewClose" class="btn-sm" title="Cancel">Cancel</button>
      </header>
      <div class="body panel-body--scroll">
        <div class="hint-sm hint-sm--muted">The following performers will be imported:</div>
        <div id="performerImportPreviewList" class="performer-import-list"></div>
      </div>
      <footer class="panel-footer--actions">
        <button id="performerImportPreviewConfirm" class="btn">Import</button>
      </footer>
    </div>
  </div>
  <!-- Folder Picker Modal -->
  <div id="modal" class="modal" hidden>
    <div class="panel">
      <header>
        <div class="crumbs" id="crumbs"></div>
      </header>
      <div class="body">
        <div class="dirlist" id="dirlist"></div>
      </div>
      <div class="actions">
        <button class="btn" id="chooseBtn">Choose this folder</button>
        <button class="btn" id="cancelBtn">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Image Preview Modal -->
  <div id="imgModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong>Heatmap Preview</strong>
          <button class="btn" id="imgModalClose">Close</button>
        </div>
      </header>
      <div class="body panel--image-body">
        <img id="imgModalImage" alt="Heatmap" class="panel-image" />
      </div>
    </div>
  </div>
  <!-- Performer Auto-Match Modal (grouped with other modals) -->
  <div id="performerAutoMatchModal" class="modal" hidden>
    <div class="panel panel--wide">
      <header class="flex items-center justify-between gap-16">
        <strong>Auto‑Match Performers</strong>
        <div class="flex gap-8">
          <button id="perfAutoMatchClose" class="btn-sm" title="Close">Close</button>
        </div>
      </header>
      <div class="body panel-body--tall">
        <div class="hint-sm mt-6">Preview scans all videos using registry performers. Apply writes to sidecars.</div>
        <div id="perfAutoMatchStatus" class="hint-sm opacity-75">Awaiting preview.</div>
        <table class="job-table autotag-table mt-8" id="perfAutoMatchTable">
          <thead>
            <tr>
              <th>File</th>
              <th>Performers</th>
            </tr>
          </thead>
          <tbody id="perfAutoMatchTbody"></tbody>
        </table>
      </div>
      <footer class="panel-footer--actions">
        <span class="hint-sm hint-sm--muted">Esc or Close to dismiss • Changes only written after Apply.</span>
        <div class="flex-row gap-8">
          <button id="perfAutoApplyBtnFooter" class="btn-sm" disabled>Apply</button>
          <button id="perfAutoCancelBtn" class="btn-sm">Cancel</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Performer Image Face Box Preview Modal -->
  <div id="faceBoxModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong id="faceBoxTitle">Image Preview</strong>
          <div class="flex-row gap-8">
            <button class="btn" id="faceBoxDetectBtn" title="Auto-detect face box" disabled>Detect</button>
            <button class="btn" id="faceBoxUploadBtn" title="Upload new image">Upload</button>
            <button class="btn" id="faceBoxClose">Close</button>
          </div>
        </div>
      </header>
      <div class="body panel--image-body">
        <div class="facebox-stage">
          <img id="faceBoxImg" alt="Performer" class="panel-image" />
          <div id="faceBoxOverlay" class="facebox-overlay" hidden>
            <div class="handle" aria-hidden="true"></div>
          </div>
          <div id="faceBoxLinks" class="facebox-links hidden" aria-label="External performer links"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tag Merge Modal -->
  <div id="tagMergeModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Merge Tags</h3>
        <button id="tagMergeClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="hint-sm mb-8">Choose the tag name to keep. The other selected tags will be merged into it.</div>
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagMergeSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label class="hint-sm w-120">Keep name</label>
          <div id="tagMergeChoiceList" class="merge-choice-list" role="radiogroup" aria-live="polite"></div>
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagMergeCancel" class="btn">Cancel</button>
        <button id="tagMergeConfirm" class="btn btn-primary" disabled>Merge</button>
      </footer>
    </div>
  </div>

  <!-- Tag Rename Modal -->
  <div id="tagRenameModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Rename Tag</h3>
        <button id="tagRenameClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagRenameSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label for="tagRenameInput" class="hint-sm w-120">New name</label>
          <input id="tagRenameInput" type="text" class="control-input w-100" placeholder="e.g. Vintage" />
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagRenameCancel" class="btn">Cancel</button>
        <button id="tagRenameConfirm" class="btn btn-primary" disabled>Rename</button>
      </footer>
    </div>
  </div>

  <!-- Error modal (predeclared to avoid dynamic injection) -->
  <div id="errorModal" class="modal" hidden>
    <div class="modal-content modal-content--wide">
      <div class="modal-header modal-header--spaced">
        <h3 class="m-0">Job Error</h3>

        <!-- Small directory list item (used by folder picker) -->
        <template id="dirListItemTemplate">
          <div class="dir">
            <div class="icon"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirEmptyTemplate">
          <div class="dir muted dir-empty">
            <div class="icon dim" aria-hidden="true"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirErrorTemplate">
          <div class="dir dir-error">
            <div class="name"></div>
          </div>
        </template>

        <!-- Autotag preview row template -->
        <template id="autotagRowTemplate">
          <tr>
            <td class="break file"></td>
            <td class="tags"></td>
          </tr>
        </template>

        <!-- Job table row template -->
        <template id="jobRowTemplate">
          <tr>
            <td class="cell-time-start"></td>
            <td class="cell-time-end"></td>
            <td class="cell-task"></td>
            <td class="cell-file" title=""></td>
            <td class="cell-status">
              <span class="job-status"></span>
            </td>
            <td class="cell-progress">
              <div class="job-progress">
                <div class="job-progress-fill"></div>
              </div>
              <div class="cell-sub">
                <span class="pct"></span>
              </div>
            </td>
            <td class="cell-action"></td>
          </tr>
        </template>
        <!-- Marker Row Template -->
        <template id="markerRowTemplate">
          <div class="marker-row">
            <div class="marker-name-label marker-name-label--editable"></div>
            <div class="marker-time-label marker-time-label--editable"></div>
            <button type="button" class="marker-jump marker-btn-icon" aria-label="Jump to marker" title="Jump">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-jump" />
              </svg>
            </button>
            <button type="button" class="marker-remove marker-btn-icon" aria-label="Remove marker" title="Remove">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-clear" />
              </svg>
            </button>
          </div>
        </template>
        <!-- Shared chip templates -->
        <template id="chipTemplate">
          <span class="chip" title="">
            <span class="chip-label"></span>
            <button type="button" class="remove chip-remove" aria-label="Remove">×</button>
          </span>
        </template>
        <template id="chipSuggestTemplate">
          <button type="button" class="chip chip-suggest" title="">
            <span class="chip-label"></span>
          </button>
        </template>
        <template id="bulkSuggestionsLabelTemplate">
          <div class="hint-sm hint-sm--muted mb-4">Matches:</div>
        </template>
        <!-- List filter templates -->
        <template id="listFilterMenuTemplate">
          <div class="list-filter-menu"></div>
        </template>
        <template id="listFilterRowTemplate">
          <div class="row"></div>
        </template>
        <template id="listFilterValuesTemplate">
          <div class="values"></div>
        </template>
        <template id="listFilterFooterTemplate">
          <div class="footer"></div>
        </template>
        <template id="listFilterButtonTemplate">
          <button type="button" class="btn-sm"></button>
        </template>
        <template id="listFilterCheckboxLabelTemplate">
          <label class="list-filter-checkbox">
            <input type="checkbox" />
            <span></span>
          </label>
        </template>
        <template id="listFilterSelectTemplate">
          <select class="control-select"></select>
        </template>
        <template id="listFilterNumberInputTemplate">
          <input type="number" class="chips-input" placeholder="value" />
        </template>
        <template id="listFilterDateInputTemplate">
          <input type="datetime-local" class="chips-input" />
        </template>
        <template id="listFilterHintTemplate">
          <span class="hint-sm"></span>
        </template>
        <template id="listFilterMessageTemplate">
          <div class="row">
            <span class="hint-sm"></span>
          </div>
        </template>
        <template id="listFilterArtifactRowTemplate">
          <label class="list-filter-artifact">
            <span class="label"></span>
            <select class="control-select"></select>
          </label>
        </template>
        <template id="orphanFileTemplate">
          <div class="orphan-file" title="">
            <span class="orphan-file__text"></span>
          </div>
        </template>
        <!-- Segmented select templates -->
        <template id="segmentedControlTemplate">
          <div class="segmented-control" role="group"></div>
        </template>
        <template id="segmentedControlButtonTemplate">
          <button type="button" class="segmented-control__btn" data-value=""></button>
        </template>
        <!-- Artifact filter popover row template -->
        <template id="artifactFilterRowTemplate">
          <label class="artifact-filter-row">
            <span class="artifact-filter-name"></span>
            <select class="control-select artifact-filter-select">
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </template>
        <template id="artifactChipTemplate">
          <div class="badge-pill artifact-chip" data-key="" data-present="0">
            <span class="label"></span>
            <span class="status" aria-hidden="true">✗</span>
          </div>
        </template>
        <!-- Tags registry list item template -->
        <template id="registryItemTemplate">
          <div class="registry-item" data-selected="0"></div>
        </template>
        <!-- Breadcrumb segment template -->
        <template id="crumbSegmentTemplate">
          <span class="seg"></span>
        </template>


        <!-- List tab: table cell template -->
        <template id="listCellTemplate">
          <td class="list-cell"></td>
        </template>

        <!-- List tab: table row template -->
        <template id="listRowTemplate">
          <tr class="list-row" data-selected="0" data-path=""></tr>
        </template>

        <!-- List tab: head cell template -->
        <template id="listHeadCellTemplate">
          <th>
            <span class="col-drag-handle" title="Drag to reorder" draggable="true">⋮⋮</span>
            <div class="list-head-cell"></div>
            <div class="col-resizer"></div>
          </th>
        </template>

        <!-- List tab: column settings item template -->
        <template id="listColumnItemTemplate">
          <div class="list-col-item">
            <span class="drag-handle" title="Drag to reorder" aria-hidden="true" draggable="true">⋮⋮</span>
            <label>
              <input type="checkbox" class="list-col-visible" checked />
              <span class="list-col-label">Column</span>
            </label>
          </div>
        </template>
        <!-- Toast notification template -->
        <template id="toastTemplate">
          <div class="toast" role="status" aria-live="polite">
            <span class="toast-text"></span>
          </div>
        </template>
        <button class="btn" id="errorModalClose">Close</button>
      </div>
      <pre id="errorModalText" class="error-pre"></pre>
    </div>
  </div>
  <!-- Generic message modal (replaces legacy alert usage) -->
  <div id="messageModal" class="modal" hidden>
    <div class="modal-content">
      <div class="modal-header modal-header--spaced">
        <h3 id="messageModalTitle" class="m-0">Notice</h3>
        <button id="messageModalClose" class="btn-sm" aria-label="Close">Close</button>
      </div>
      <div class="modal-body">
        <p id="messageModalBody" class="m-0"></p>
      </div>
      <footer class="panel-footer--actions mt-12">
        <div class="flex-row gap-8 jc-end">
          <button id="messageModalOk" class="btn">OK</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Templates: API Explorer -->
  <template id="apiGroupTemplate">
    <section class="api-group" data-open="1">
      <header class="api-group__header flex-row gap-10" role="button" tabindex="0" aria-expanded="true">
        <span class="api-group__caret" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24"><use href="#icon-caret"></use></svg>
        </span>
        <h3 class="api-group__title"></h3>
        <button class="btn-xs api-group__expand-all" title="Expand/collapse all children" style="display: none;">±</button>
        <span class="ml-auto hint-sm api-group__count"></span>
      </header>
      <div class="api-group__body"></div>
    </section>
  </template>
  <template id="apiEndpointTemplate">
    <div class="card api-endpoint" data-open="0">
  <div class="api-endpoint__header row" role="button" tabindex="0" aria-expanded="false">
        <span class="method-badge">GET</span>
        <code class="api-path w-100"></code>
        <button class="btn-sm api-toggle" aria-expanded="false" aria-label="Toggle details">Details</button>
      </div>
      <div class="api-endpoint__body hidden">
        <div class="hint-sm api-summary"></div>
        <div class="api-params" role="group" aria-label="Parameters"></div>
        <div class="api-body" hidden>
          <label class="hint-sm">Request Body (JSON)
            <textarea class="api-body-text control-textarea w-100" rows="6" placeholder="{ }"></textarea>
          </label>
        </div>
        <div class="row gap-10 mt-12">
          <button class="btn-sm api-run">Run</button>
          <span class="hint-sm api-status"></span>
        </div>
        <pre class="json-pre api-response mt-12" aria-live="polite"></pre>
      </div>
    </div>
  </template>

  <header>
    <!-- Tab Navigation only (top bar removed) -->
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="player-panel" id="player-tab" data-tab="player">
        Player
      </button>
      <button class="tab-button active" role="tab" aria-selected="true" aria-controls="library-panel" id="library-tab" data-tab="library">
        Library
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="list-panel" id="list-tab" data-tab="list">
        List
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="similar-panel" id="similar-tab" data-tab="similar">
        Similar
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tasks-panel" id="tasks-tab" data-tab="tasks">
        Tasks
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="performers-panel" id="performers-tab" data-tab="performers">
        Performers
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="graph-panel" id="graph-tab" data-tab="graph">
        Graph
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="connections-panel" id="connections-tab" data-tab="connections">
        Connections
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tags-panel" id="tags-tab" data-tab="tags">
        Tags
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="stats-panel" id="stats-tab" data-tab="stats">
        Stats
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="settings-panel" id="settings-tab" data-tab="settings">
        Settings
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="api-panel" id="api-tab" data-tab="api">
        API
      </button>
    </nav>
  </header>

  <main>
    <!-- Tab Panels -->
    <div class="tab-panels">
      <!-- Connections Tab Panel (minimal: image-only nodes) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="connections-tab" id="connections-panel" hidden>
        <section class="graph-panel graph-panel--connections">
          <div class="graph-controls graph-controls--connections">
            <div class="connections-controls-header">
              <strong>Connections Graph</strong>
              <span id="connectionsStatus" class="hint-sm connections-status" aria-live="polite"></span>
            </div>
            <label class="hint-sm connections-toggle" title="Show performers even if no portrait is available">
              <input id="connectionsShowImageless" type="checkbox" checked />
              <span>Show imageless performers</span>
            </label>
            <label class="hint-sm" title="Minimum number of videos a performer must appear in to be included">
              Min performer videos
              <input id="connectionsMinVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum shared videos required for an edge to be drawn">
              Min shared videos
              <input id="connectionsMinEdgeVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum number of connections (edges) a performer must have to remain visible">
              Min edges per performer
              <input id="connectionsMinEdges" type="number" class="control-input w-120" value="0" min="0" step="1" />
            </label>
            <label class="hint-sm connections-toggle" title="Show performers that have no qualifying connections">
              <input id="connectionsShowOrphans" type="checkbox" checked />
              <span>Show orphans</span>
            </label>
            <label class="hint-sm connections-toggle" title="Scale edge thickness based on shared video counts">
              <input id="connectionsVariableThickness" type="checkbox" checked />
              <span>Variable edge width</span>
            </label>
            <label class="hint-sm" title="Choose a layout algorithm for the connections graph">
              Layout
              <select id="connectionsLayoutSelect" class="control-input w-120">
                <option value="fcose">fCoSE (force)</option>
                <option value="cose">CoSE</option>
                <option value="cose-bilkent">CoSE Bilkent</option>
                <option value="cise">CiSE</option>
                <option value="avsdf">AVSDF</option>
                <option value="spread">Spread</option>
                <option value="cola">Cola</option>
                <option value="dagre">Dagre</option>
                <option value="klay">Klay</option>
                <option value="concentric">Concentric</option>
                <option value="circle">Circle</option>
                <option value="breadthfirst">Breadthfirst</option>
                <option value="grid">Grid</option>
                <option value="random">Random</option>
                <option value="euler">Euler</option>
              </select>
            </label>
            <label class="hint-sm" title="Ideal edge length for force-based layouts (higher spreads nodes further apart)">
              Edge length
              <input id="connectionsEdgeLen" type="range" min="40" max="340" step="10" value="140" />
              <span class="connections-range-value" id="connectionsEdgeLenValue">140 px</span>
            </label>
            <label class="hint-sm" title="Node repulsion for force-based layouts (higher keeps nodes farther apart)">
              Node repulsion
              <input id="connectionsRepulsion" type="range" min="2000" max="160000" step="1000" value="60000" />
              <span class="connections-range-value" id="connectionsRepulsionValue">60k</span>
            </label>
            <div class="connections-actions">
              <button id="connectionsFitBtn" class="btn-sm" type="button">Fit Graph</button>
              <button id="connectionsRefreshBtn" class="btn-sm" type="button">Refresh</button>
            </div>
          </div>
          <div id="connectionsCyContainer">
            <div id="cyConnections" aria-label="Connections graph" role="application"></div>
          </div>
        </section>
      </div>
      <!-- Graph Tab Panel (Performers Co‑appearance) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="graph-tab" id="graph-panel" hidden>
        <section class="graph-panel">
          <div class="graph-controls">
            <strong>Performers Graph</strong>
            <span id="graphStatus" class="hint-sm" style="opacity:.8;"></span>
            <label class="hint-sm">
              Min videos
              <input id="graphMinCount" type="number" class="control-input w-120" value="2" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum number of connections (edges) a performer must have to be shown; > 0 hides isolated nodes">
              Min edges
              <input id="graphMinEdges" type="number" class="control-input w-120" value="0" min="0" step="1" />
            </label>
            <label class="hint-sm">
              Layout
              <select id="graphLayoutSelect" class="control-input w-120">
                <option value="fcose">fCoSE</option>
                <option value="cose">CoSE</option>
                <option value="circle">Circle</option>
                <option value="grid">Grid</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label class="hint-sm" title="Ideal edge length for force layouts (higher = looser)">
              Edge length
              <input id="graphEdgeLen" type="range" min="40" max="300" step="10" value="120" />
            </label>
            <label class="hint-sm" title="Node repulsion for force layouts (higher = more spread)">
              Node repulsion
              <input id="graphRepulsion" type="range" min="1000" max="120000" step="1000" value="50000" />
            </label>
            <label class="hint-sm" title="Render edges as straight lines">
              <input id="graphStraightEdges" type="checkbox" checked />
              Straight lines
            </label>
            <input id="graphSearchInput" class="control-input" placeholder="Search performer…" />
            <button id="graphRefreshBtn" class="btn-sm">Refresh</button>
            <div class="ml-auto"></div>
            <button id="graphNeighborhoodBtn" class="btn-sm" title="Reveal neighborhood of matches/selection">Reveal Neighborhood</button>
            <button id="graphClearBtn" class="btn-sm" title="Clear filters and highlights">Clear</button>
            <button id="graphFitBtn" class="btn-sm" title="Fit all">Fit</button>
          </div>
          <div id="cyContainer">
            <div id="cyGraph" aria-label="Performers graph" role="application"></div>
          </div>
          <div id="graphTooltip" hidden></div>
        </section>
      </div>
      <!-- Player Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="player-tab" id="player-panel" hidden>
        <!-- Split layout now stretches full height -->
        <div class="player-split">
          <div class="player-sidebar">
            <div id="sidebarAccordion" class="accordion">
              <div class="acc-item" data-key="file-info">
                <button class="acc-header" aria-expanded="true">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  File Info
                </button>
                <div class="acc-panel">
                  <div class="fi-thumbnail-wrap" id="fiThumbnailWrap">
                    <div class="fi-thumbnail-box">
                      <img id="fiThumbnail" alt="Thumbnail" />
                      <button id="fiSetThumbnailBtn" class="btn btn-xs fi-thumbnail-set" title="Set thumbnail from current frame">✚</button>
                    </div>
                  </div>
                  <div class="file-info-grid" role="table" aria-label="File metadata">
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Path</div>
                      <div class="fi-value break" id="fiPath" role="cell" title="">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Duration</div>
                      <div class="fi-value" id="fiDuration" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Resolution</div>
                      <div class="fi-value" id="fiResolution" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Codec</div>
                      <div class="fi-value" id="fiVideoCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Codec</div>
                      <div class="fi-value" id="fiAudioCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Bitrate</div>
                      <div class="fi-value" id="fiBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Bitrate</div>
                      <div class="fi-value" id="fiVBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Bitrate</div>
                      <div class="fi-value" id="fiABitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Size</div>
                      <div class="fi-value" id="fiSize" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Modified</div>
                      <div class="fi-value" id="fiModified" role="cell">—</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="markers">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Markers
                </button>
                <div class="acc-panel hidden">
                  <div class="markers-actions">
                    <button id="btnAddMarker" class="btn btn-xs" type="button" title="Add marker at current time">Add Marker</button>
                    <button id="btnSetIntroEnd" class="btn btn-xs" type="button" title="Set intro end (default start point)">Set Intro</button>
                    <button id="btnSetOutroBegin" class="btn btn-xs" type="button" title="Set outro begin (default end point)">Set Outro</button>
                  </div>
                  <div class="markers-header markers-header--spaced mt-0">
                    <div class="hint-sm hint-sm--muted">Edit time, label, or type. Enter or blur to save. Color indicates marker type.</div>
                  </div>
                  <div id="markersList" class="markers-list" aria-live="polite" aria-label="Marker list"></div>
                </div>
              </div>
              <div class="acc-item" data-key="artifacts">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Artifacts
                </button>
                <div class="acc-panel hidden">
                  <div class="artifact-badges-flat" id="artifactBadgesSidebar">
                    <div id="badge-metadata" class="badge-pill artifact-gen-btn" data-artifact="metadata" title="Metadata">
                      <span>Metadata</span><span id="badge-metadata-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-thumbnail" class="badge-pill artifact-gen-btn" data-artifact="thumbnail" title="Primary thumbnail">
                      <span>Thumbnail</span><span id="badge-thumbnail-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-preview" class="badge-pill artifact-gen-btn" data-artifact="preview" title="Preview video">
                      <span>Preview</span><span id="badge-preview-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-phash" class="badge-pill artifact-gen-btn" data-artifact="phash" title="Perceptual hash">
                      <span>pHash</span>
                      <span id="badge-phash-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-sprites" class="badge-pill artifact-gen-btn" data-artifact="sprites" title="Sprite sheet thumbnails (timeline scrub)">
                      <span>Sprites</span><span id="badge-sprites-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-heatmap" class="badge-pill artifact-gen-btn" data-artifact="heatmap" title="Heatmap timeline overlay">
                      <span>Heatmap</span><span id="badge-heatmap-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-markers" class="badge-pill artifact-gen-btn" data-artifact="markers" title="Marker / chapter markers">
                      <span>Markers</span><span id="badge-markers-status" aria-hidden="true">?</span>
                    </div>
                  </div>
                  <!-- Sidebar artifact previews (compact) -->
                  <div id="sidebarSpritePreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Sprite Sheet</div>
                    <img id="sidebarSpriteImage" alt="Sprites" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div id="sidebarHeatmapPreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Heatmap</div>
                    <img id="sidebarHeatmapImage" alt="Heatmap" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div class="hint-sm mt-6 hint-sm--muted line-13">Click a missing badge (✗) or Generate button to start. ✓ indicates the artifact is present. Spinner shows job progress.</div>
                </div>
              </div>
              <div class="acc-item" data-key="actions">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Actions
                </button>
                <div class="acc-panel hidden">
                  <div class="flex-row gap-8 mt-4" role="group" aria-label="Video actions">
                    <button id="btnResetPlayer" class="btn-sm" type="button" title="Reset player (unload video)" aria-label="Reset player">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-reset" /></svg>
                      <span class="ml-4">Reset player</span>
                    </button>
                    <button id="btnDownloadFrame" class="btn-sm" title="Download current frame as PNG">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-camera" /></svg>
                      <span class="ml-4">Download frame</span>
                    </button>
                    <button id="btnConvert" class="btn-sm" disabled title="Coming soon">Convert</button>
                    <button id="btnCompress" class="btn-sm" disabled title="Coming soon">Compress</button>
                    <button id="btnTrim" class="btn-sm" disabled title="Coming soon">Trim</button>
                    <button id="btnSplit" class="btn-sm" disabled title="Coming soon">Split</button>
                    <button id="btnConcat" class="btn-sm" disabled title="Coming soon">Concat</button>
                  </div>
                  <div class="hint-sm hint-sm--muted mt-6">Advanced actions (convert, compress, trim, split, concat) are planned. Download frame works locally now.</div>
                </div>
              </div>
              <div class="acc-item" data-key="video-settings">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Video
                </button>
                <div class="acc-panel hidden">
                  <div class="video-metadata-chips">
                    <div class="chips-group" id="videoPerformersGroup">
                      <div class="chips-label">Performers</div>
                      <div class="chips-list" id="videoPerformers"></div>
                      <input type="text" id="videoPerformerInput" class="chips-input" placeholder="Add performer…" aria-label="Add performer" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoPerformerSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-group" id="videoTagsGroup">
                      <div class="chips-label">Tags</div>
                      <div class="chips-list" id="videoTags"></div>
                      <input type="text" id="videoTagInput" class="chips-input" placeholder="Add tag…" aria-label="Add tag" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoTagSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-hint hint-sm hint-sm--muted mt-4">Enter to add · Click a chip to view · Click × to remove</div>
                    <!-- Rating (5-star) + Favorite toggle in header -->
                    <div class="chips-group" id="videoRatingGroup">
                      <div class="chips-label">Rating</div>
                      <div class="rating-row">
                        <div class="rating-stars" id="videoRating" role="radiogroup" aria-label="Rating (1 to 5)">
                        <span class="star" role="radio" tabindex="0" data-value="1" aria-label="1 star" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="2" aria-label="2 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="3" aria-label="3 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="4" aria-label="4 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="5" aria-label="5 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        </div>
                        <button id="videoFavorite" class="btn-sm btn-icon favorite-toggle" aria-pressed="false" title="Toggle favorite">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart-filled"></use></svg>
                        </button>
                      </div>
                    </div>
                    <!-- Description -->
                    <div class="chips-group" id="videoDescriptionGroup">
                      <div class="chips-label">Description</div>
                      <div id="videoDescription" class="desc-input" role="textbox" aria-label="Video description" tabindex="0" data-placeholder="Add a description…"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="filters">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Filters
                </button>
                <div class="acc-panel hidden">
                  <div class="video-adjustments" id="videoAdjustments" aria-label="Video image adjustment controls">
                    <div class="adj-row">
                      <label for="adjBrightness">Brightness</label>
                      <input type="range" id="adjBrightness" class="adj-slider vol-slider" min="0.20" max="2.00" step="0.01" value="1" aria-label="Brightness" />
                      <span class="adj-val" id="adjBrightnessVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjContrast">Contrast</label>
                      <input type="range" id="adjContrast" class="adj-slider vol-slider" min="0.50" max="2.00" step="0.01" value="1" aria-label="Contrast" />
                      <span class="adj-val" id="adjContrastVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjSaturation">Saturation</label>
                      <input type="range" id="adjSaturation" class="adj-slider vol-slider" min="0.00" max="3.00" step="0.01" value="1" aria-label="Saturation" />
                      <span class="adj-val" id="adjSaturationVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjHue">Hue</label>
                      <input type="range" id="adjHue" class="adj-slider vol-slider" min="0" max="360" step="1" value="0" aria-label="Hue rotation" />
                      <span class="adj-val" id="adjHueVal">0°</span>
                    </div>
                    <div class="adj-actions mt-4">
                      <button type="button" id="adjResetBtn" class="btn btn-xs" title="Reset all adjustments">Reset</button>
                    </div>
                    <div class="hint-sm hint-sm--muted mt-6">Adjustments apply locally using CSS filters and persist in this browser. They do not modify files.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Small non-intrusive sidebar toggle between the sidebar and main player -->
          <button id="sidebarToggle" class="sidebar-toggle" aria-expanded="true" aria-label="Toggle sidebar" title="Toggle sidebar">
            <!-- use centralized sprite symbol (icon-caret). CSS will rotate this when collapsed -->
            <svg class="sidebar-toggle__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <title>Toggle sidebar</title>
              <!-- primary: reference centralized symbol -->
              <use href="#icon-caret" />
              <!-- fallback: inline path so the caret is visible if <use> isn't applied by the UA -->
              <path class="sidebar-toggle__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
            </svg>
          </button>
          <div class="player-main">
            <div id="playerOverlayBar" class="player-overlay-bar">
              <span id="playerTitle" class="player-title"></span>
            </div>
            <video id="playerVideo" class="player-video" playsinline preload="metadata"></video>
            <!-- Subtitle overlay rendered by JS -->
            <div id="subtitleOverlay" class="subtitle-line bottom" aria-live="polite" hidden></div>
            <!-- Floating scrubber (timeline) overlay at bottom -->
            <div id="playerScrubber" class="player-scrubber-bar">
              <div class="scrubber-track" id="playerScrubberTrack">
                <!-- Heatmap layers moved inside track so width/position match exactly -->
                <div id="timelineHeatmap" class="timeline-heatmap" aria-hidden="true"></div>
                <canvas id="timelineHeatmapCanvas" class="timeline-heatmap-canvas" aria-hidden="true"></canvas>
                <!-- Legacy timeline markers layer expected by JS (renderMarkers) -->
                <div id="timelineMarkers" class="timeline-markers-layer" aria-hidden="true"></div>
                <div class="scrubber-buffer" id="playerScrubberBuffer"></div>
                <div class="scrubber-progress" id="playerScrubberProgress"></div>
              </div>
              <div id="playerControls" class="scrubber-status-row player-controls">
                <span class="scrubber-time" id="playerScrubberTime">00:00 / 00:00</span>
                <div class="player-controls-groups">
                  <div class="player-control-cluster cluster-transport" aria-label="Playback controls">
                    <button id="btnSeekBack30" class="btn btn-xs" type="button" title="Back 30 seconds" aria-label="Back 30 seconds">−30s</button>
                    <button id="btnPrevFrame" class="btn btn-xs" type="button" title="Previous frame" aria-label="Previous frame">−1f</button>
                    <button id="btnPlayPause" class="btn btn-xs" type="button" title="Play / Pause">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-play" class="icon-play"></use>
                        <use href="#icon-pause" class="icon-pause hidden"></use>
                      </svg>
                    </button>
                    <button id="btnNextFrame" class="btn btn-xs" type="button" title="Next frame" aria-label="Next frame">+1f</button>
                    <button id="btnSeekFwd30" class="btn btn-xs" type="button" title="Forward 30 seconds" aria-label="Forward 30 seconds">+30s</button>
                  </div>
                  <div class="player-control-cluster cluster-audio" aria-label="Audio controls">
                    <button id="btnMute" class="btn btn-xs" type="button" title="Mute / Unmute">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-vol" class="icon-vol"></use>
                        <use href="#icon-muted" class="icon-muted hidden"></use>
                      </svg>
                    </button>
                    <div class="player-volume">
                      <input id="volSlider" class="vol-slider" type="range" min="0" max="1" step="0.01" value="1" title="Volume" />
                    </div>
                  </div>
                  <div class="player-control-cluster cluster-navigate" aria-label="Navigation controls">
                    <button id="btnPrevVideo" class="btn btn-xs" type="button" title="Previous video" aria-label="Previous video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-prev"></use>
                      </svg>
                      <span class="sr-only">Previous video</span>
                    </button>
                    <button id="btnRestartVideo" class="btn btn-xs" type="button" title="Restart video" aria-label="Restart video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-restart"></use>
                      </svg>
                    </button>
                    <button id="btnFullscreen" class="btn btn-xs" type="button" title="Toggle fullscreen" aria-label="Fullscreen">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM6 14v4h4v2H4v-6h2zm12 0h2v6h-6v-2h4v-4z" />
                      </svg>
                    </button>
                    <button id="btnNextVideo" class="btn btn-xs" type="button" title="Next video" aria-label="Next video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-next"></use>
                      </svg>
                      <span class="sr-only">Next video</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Hover sprite preview (dynamically positioned) -->
            <div id="spritePreview"></div>
          </div>
        </div>
      </div>

      <!-- Library Tab Panel -->
      <div class="tab-panel active" role="tabpanel" aria-labelledby="library-tab" id="library-panel">
        <div class="controls-panel sticky-enabled library-toolbar">
          <div class="library-toolbar__surface">
            <div class="controls-row library-toolbar__row library-toolbar__row--primary">
              <div id="libraryUnifiedFiltersGroup" class="control-group control-group--flex library-toolbar__cluster library-toolbar__cluster-search">
                <button id="clearFiltersTopBtn" class="btn-icon clear-btn" type="button" aria-label="Clear filters" title="Clear search, tags, performers and resolution">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-clear"></use></svg>
                </button>
                <input type="text" id="libraryUnifiedInput" class="chips-input" placeholder="Search files, #tag, @performer…" aria-label="Search library" />
                <div class="chips-list" id="libraryUnifiedChips"></div>
              </div>
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-options" aria-label="Library view options">
                <div class="compact-filter" data-filter="resolution">
                  <div class="compact-filter__label-row">
                    <label for="resSelect" class="compact-filter__label">Resolution</label>
                  </div>
                  <select id="resSelect" class="control-select" title="Filter by resolution" aria-label="Filter by resolution">
                    <option value="" selected data-chip="All">All resolutions</option>
                    <option value="2160" data-chip="2160p+">2160p+</option>
                    <option value="1440" data-chip="1440p+">1440p+</option>
                    <option value="1080" data-chip="1080p+">1080p+</option>
                    <option value="720" data-chip="720p+">720p+</option>
                    <option value="480" data-chip="480p+">480p+</option>
                  </select>
                </div>
                <div class="compact-filter" data-filter="sort">
                  <div class="compact-filter__label-row">
                    <label for="sortSelect" class="compact-filter__label">Sort</label>
                    <button id="orderToggle" class="compact-filter__order" data-order="desc" type="button" title="Toggle sort order" aria-label="Toggle sort order">▼</button>
                  </div>
                  <select id="sortSelect" class="control-select" aria-label="Sort by">
                    <option value="date" data-chip="Date">Date</option>
                    <option value="name" data-chip="Name">Name</option>
                    <option value="size" data-chip="Size">Size</option>
                    <option value="random" data-chip="Random">Random</option>
                  </select>
                </div>
                <div class="library-density" aria-label="Grid density">
                  <span class="library-density__label hint-sm" id="densityLabel">Density</span>
                  <input id="densitySlider" type="range" min="1" max="15" value="12" step="1" class="control-slider" title="Adjust grid density (columns)" aria-describedby="densityLabel" aria-label="Grid density" />
                </div>
              </div>
            </div>
            <div class="controls-row library-toolbar__row library-toolbar__row--secondary">
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-artifacts">
                <button id="artifactFiltersBtn" class="btn-sm" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="artifactFiltersMenu">Artifacts</button>
                <div id="artifactFilterChips" class="artifact-filter-chips" aria-live="polite" hidden></div>
                <!-- Artifact boolean filters are available per-column on the List tab -->
              </div>
              <div class="pagination-group library-toolbar__cluster library-toolbar__cluster-pagination">
                <div class="pagination">
                  <button id="prevBtn" class="btn-sm" title="Previous page">‹</button>
                  <span id="pageInfo" class="page-info">Page 1 of 1</span>
                  <button id="nextBtn" class="btn-sm" title="Next page">›</button>
                </div>
                <div class="library-toolbar__random" role="group" aria-label="Random playback">
                  <button id="randomPlayBtn" class="btn-sm" title="Play a random video from current filters" aria-label="Play random">
                    <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-shuffle" /></svg>
                  </button>
                  <button id="randomAutoBtn" class="btn-sm" title="Toggle auto-random play when the video ends" aria-pressed="false" aria-label="Toggle auto-random">
                    <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-auto-shuffle" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="artifactFiltersMenu" class="artifact-filter-menu" role="dialog" aria-label="Artifact filters" hidden>
          <div class="artifact-filter-menu__body" id="artifactFilterMenuBody"></div>
          <div class="artifact-filter-menu__footer">
            <button id="artifactFiltersClearBtn" class="btn-sm" type="button">Clear</button>
            <button id="artifactFiltersApplyBtn" class="btn-sm btn-primary" type="button">Apply</button>
          </div>
        </div>

        <div id="selectionBar" class="selection-bar" hidden>
          <span id="selectionCount" class="selection-count">0 selected</span>
          <button id="selectAllBtn" class="btn-sm">Select All</button>
          <button id="selectNoneBtn" class="btn-sm">Select None</button>
          <button id="bulkEditBtn" class="btn-sm">Bulk Edit</button>
          <div id="bulkEditPanel" class="bulk-panel" hidden>
            <label class="hint-sm mr-6" for="bulkKindSelect">Type</label>
            <select id="bulkKindSelect" class="control-select">
              <option value="tag">Tag</option>
              <option value="performer">Performer</option>
            </select>
            <label class="hint-sm ml-10 mr-6" for="bulkOpSelect">Action</label>
            <select id="bulkOpSelect" class="control-select">
              <option value="add">Add</option>
              <option value="remove">Remove</option>
            </select>
            <input id="bulkValueInput" type="text" class="chips-input ml-10" placeholder="Name…" aria-label="Name" />
            <button id="bulkApplyBtn" class="btn-sm ml-6">Apply</button>
            <div id="bulkSuggestions" class="chips-suggestions hint-sm mt-4" aria-live="polite"></div>
          </div>
        </div>

        <div id="spinner" class="spinner"></div>
        <div id="status"></div>

        <!-- Card template (hidden) -->
        <template id="cardTemplate">
          <div class="card">
            <div class="card-checkbox"></div>
            <div class="thumbnail-wrap">
              <div class="quality-badge" aria-hidden="true"></div>
              <img class="thumbnail-img" loading="lazy" />
              <!-- Inline placeholder SVG using centralized sprite; shown when no thumbnail present -->
              <svg class="thumbnail-placeholder" aria-hidden="true">
                <use href="#icon-placeholder"></use>
              </svg>
              <!-- Overlay info (resolution only) -->
              <div class="overlay-info" aria-hidden="true">
                <span class="overlay-resolution"></span>
              </div>
            </div>
            <div class="metadata">
              <p class="title"></p>
              <div class="row sub">
                <span class="duration"></span>
                <span class="size"></span>
              </div>
            </div>
          </div>
        </template>

        <!-- Directory card template (hidden) -->
        <template id="dirTemplate">
          <div class="card">
            <div class="thumbnail-img dir-thumbnail">
              <div class="dir-thumbnail-inner">
                <span class="dir-icon"></span>
                <span class="dir-name"></span>
              </div>
            </div>
            <div class="metadata">
              <p class="title"></p>
              <div class="row sub"><span>Folder</span><span></span></div>
            </div>
          </div>
        </template>

        <div id="grid" class="grid" hidden></div>
      </div>

      <!-- List Tab Panel (static) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="list-tab" id="list-panel" hidden>
        <div class="list-panel">
          <div class="list-controls">
            <div class="flex-row gap-8">
              <button id="listColumnsBtn" class="btn-sm" aria-controls="listColumnsPanel" aria-expanded="false">Columns</button>
              <button id="listWrapToggle" class="btn-sm" aria-pressed="false" title="Toggle text wrapping in the table">Wrap: On</button>
              <label for="listPageSize" class="hint-sm" style="display:inline-flex; align-items:center; gap:6px;">
                Per page
                <select id="listPageSize" class="control-select" aria-label="Page size">
                  <option value="16">16</option>
                  <option value="32" selected>32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="500">500</option>
                </select>
              </label>
              <div id="listFilterChips" class="filter-chips" aria-label="Active list filters" hidden></div>
              <div class="list-pager" id="listPagerTop">
                <button id="listPrevBtn" class="btn-sm" aria-label="Previous page">Prev</button>
                <span id="listPageInfo" class="hint-sm">Page 1</span>
                <button id="listNextBtn" class="btn-sm" aria-label="Next page">Next</button>
              </div>
              <div id="listSpinner" class="spinner" hidden></div>
            </div>
          </div>
          <div id="listColumnsPanel" class="list-columns-panel hidden" role="region" aria-label="Column settings">
            <div class="panel-header--spaced">
              <strong>Columns</strong>
              <button id="listColumnsClose" class="btn-sm" aria-label="Close">Close</button>
            </div>
            <div id="listColumnsBody" class="list-columns-body"></div>
            <div class="list-columns-footer mt-12">
              <div class="hint-sm hint-sm--muted">Drag to reorder • Toggle to show/hide • Resize using header grips in the table</div>
              <button id="listColumnsReset" class="btn-sm" type="button">Reset to default</button>
            </div>
          </div>
          <div class="list-wrap">
            <table id="listTable" class="list-table" role="table" aria-label="Files list">
              <thead>
                <tr id="listHeadRow"></tr>
              </thead>
              <tbody id="listTbody"></tbody>
            </table>
          </div>
          <div class="list-pager-bottom" id="listPagerBottom">
            <div class="list-pager">
              <button id="listPrevBtnBottom" class="btn-sm" aria-label="Previous page">Prev</button>
              <span id="listPageInfoBottom" class="hint-sm">Page 1</span>
              <button id="listNextBtnBottom" class="btn-sm" aria-label="Next page">Next</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Performers Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="performers-tab" id="performers-panel" hidden>
        <div class="catalog-container">
          <div class="perf-toolbar">
            <input id="performerSearch" type="text" placeholder="Search performers…" class="perf-search" />
            <div class="compact-filter" data-filter="perf-images">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Images</span>
              </div>
              <select id="performerImageFilter" class="control-select sr-only" aria-label="Filter performers by image availability" data-segmented="1" data-segmented-label="Performer image filter">
                <option value="all" selected data-chip="All">All</option>
                <option value="with" data-chip="With">Has image</option>
                <option value="without" data-chip="Missing">No image</option>
              </select>
            </div>
            <div class="compact-filter" data-filter="perf-face">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Face box</span>
              </div>
              <select id="performerFaceFilter" class="control-select sr-only" aria-label="Filter performers by face box status" data-segmented="1" data-segmented-label="Performer face box filter">
                <option value="all" selected data-chip="All">All</option>
                <option value="with" data-chip="With">Has face box</option>
                <option value="without" data-chip="Missing">No face box</option>
              </select>
            </div>
            <!-- Sort controls: default to Markers (desc) -->
            <div class="compact-filter ml-8" data-filter="perf-sort">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Sort</span>
                <button id="performerSortOrder" class="compact-filter__order" type="button" title="Toggle sort order" aria-label="Toggle sort order">▼</button>
              </div>
              <select id="performerSort" class="control-select sr-only" aria-label="Sort performers" data-segmented="1" data-segmented-label="Performer sort">
                <option value="count" selected data-chip="Files">Files</option>
                <option value="name" data-chip="Name">Name</option>
              </select>
            </div>
            <span id="performersCount" class="hint-sm ml-8" aria-live="polite"></span>
            <button id="performerUnifiedImportBtn" class="btn-sm" title="Import performers: names list, images folder, loose images, or ZIP">Import</button>
            <button id="performerAddBtn" class="btn-sm" title="Create a new performer">Add</button>
            <button id="performerAutoMatchBtn" class="btn-sm" title="Match performers from filenames">Match</button>
            <button id="performerDetectAllBtn" class="btn-sm" title="Detect faces for visible performers">Detect faces</button>
            <button id="performerMergeBtn" class="btn-sm" title="Merge selected" disabled>Merge</button>
            <button id="performerRenameBtn" class="btn-sm" title="Rename selected" disabled>Rename</button>
            <button id="performerDeleteBtn" class="btn-sm" title="Delete selected" disabled>Delete</button>
          </div>
          <div id="performerDropZone" role="button" tabindex="0" aria-label="Import performers" class="performer-dropzone">
            <strong class="pdz-title">Unified Import</strong>
            <span class="pdz-sub">Click for names / images / ZIP or drag & drop text list</span>
          </div>
          <input id="performerFileInput" type="file" accept=".txt,.csv,.json,text/plain,application/json" multiple class="d-none" />
          <div id="performersStatus" class="catalog-status d-none" aria-live="polite">Loading…</div>
          <!-- Unified hidden inputs -->
          <input id="performerUnifiedFileInput" type="file" class="d-none" multiple accept=".txt,.csv,.json,.zip,image/*,text/plain,application/json,application/zip,application/x-zip-compressed" />
          <input id="performerUnifiedFolderInput" type="file" class="d-none" webkitdirectory directory multiple accept="image/*" />
          <input id="performerSingleImageInput" type="file" class="d-none" accept="image/*" />
          <div id="performersSpinner" class="spinner" hidden></div>
          <div class="list-controls flex-row gap-10 mt-12" id="performersPager">
            <div class="ml-auto"></div>
            <label for="perfPageSize" class="hint-sm">Page size</label>
            <select id="perfPageSize" class="control-select" aria-label="Performers page size">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="perfPrev" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="perfPageInfo" class="hint-sm" aria-live="polite">—</span>
            <button id="perfNext" class="btn-sm" aria-label="Next page">Next</button>
          </div>
          <div id="performersGrid" class="perf-grid performers-grid"></div>
          <!-- Bottom pager (duplicate of top) -->
          <div class="list-controls flex-row gap-10 mt-12" id="performersPagerBottom">
            <div class="ml-auto"></div>
            <label for="perfPageSizeBottom" class="hint-sm">Page size</label>
            <select id="perfPageSizeBottom" class="control-select" aria-label="Performers page size (bottom)">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="perfPrevBottom" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="perfPageInfoBottom" class="hint-sm" aria-live="polite">—</span>
            <button id="perfNextBottom" class="btn-sm" aria-label="Next page">Next</button>
          </div>
        </div>
      </div>

      <!-- Performer Merge Modal -->
      <div id="performerMergeModal" class="modal" hidden>
        <div class="panel panel--narrow">
          <header class="panel-header--spaced">
            <h3>Merge Performers</h3>
            <button id="performerMergeClose" class="btn btn-text" aria-label="Close">✕</button>
          </header>
          <div class="body">
            <div class="hint-sm mb-8">Choose the performer name to keep. The other selected performer(s) will be merged into it.</div>
            <div class="row gap-8 mb-10">
              <label class="hint-sm w-120">Selected</label>
              <div id="performerMergeSelected" class="flex-row gap-6"></div>
            </div>
            <div class="row gap-8">
              <label for="performerMergeInto" class="hint-sm w-120">Name that remains</label>
              <input id="performerMergeInto" type="text" class="control-input w-100" placeholder="e.g. Jane Doe" />
            </div>
          </div>
          <footer class="panel-footer--actions">
            <button id="performerMergeCancel" class="btn">Cancel</button>
            <button id="performerMergeConfirm" class="btn btn-primary" disabled>Merge</button>
          </footer>
        </div>
      </div>

      <!-- Performer Rename Modal -->
      <div id="performerRenameModal" class="modal" hidden>
        <div class="panel panel--narrow">
          <header class="panel-header--spaced">
            <h3>Rename Performer</h3>
            <button id="performerRenameClose" class="btn btn-text" aria-label="Close">✕</button>
          </header>
          <div class="body">
            <div class="row gap-8 mb-10">
              <label class="hint-sm w-120">Selected</label>
              <div id="performerRenameSelected" class="flex-row gap-6"></div>
            </div>
            <div class="row gap-8">
              <label for="performerRenameInput" class="hint-sm w-120">New name</label>
              <input id="performerRenameInput" type="text" class="control-input w-100" placeholder="e.g. Jane Doe" />
            </div>
          </div>
          <footer class="panel-footer--actions">
            <button id="performerRenameCancel" class="btn">Cancel</button>
            <button id="performerRenameConfirm" class="btn btn-primary" disabled>Rename</button>
          </footer>
        </div>
      </div>

      <!-- Tags Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="tags-tab" id="tags-panel" hidden>
        <!-- Tags grid (extant tags with counts) -->
        <div class="catalog-container">
          <div class="perf-toolbar">
            <input id="tagSearch" type="text" placeholder="Search tags…" class="perf-search" />
            <label for="tagSort" class="hint-sm ml-8" style="opacity:.8">Sort</label>
            <select id="tagSort" class="control-select" aria-label="Sort tags">
              <option value="count" selected>Files</option>
              <option value="name">Name</option>
            </select>
            <button id="tagSortOrder" class="btn-sm" title="Toggle sort order" aria-label="Toggle sort order">Desc</button>
            <span id="tagsCount" class="hint-sm ml-8" aria-live="polite"></span>
            <button id="tagImportBtn" class="btn-sm" title="Import tags from JSON">Import</button>
            <button id="tagAddBtn" class="btn-sm" title="Create a new tag">Add</button>
            <button id="tagAutoMatchBtn" class="btn-sm" title="Apply a tag by matching filenames">Match</button>
            <button id="tagMergeBtn" class="btn-sm" title="Merge selected" disabled>Merge</button>
            <button id="tagRenameBtn" class="btn-sm" title="Rename selected" disabled>Rename</button>
            <button id="tagDeleteBtn" class="btn-sm" title="Delete selected" disabled>Delete</button>
          </div>
          <div id="tagDropZone" role="button" tabindex="0" aria-label="Import tags" class="performer-dropzone">
            <strong class="pdz-title">Import Tags</strong>
            <span class="pdz-sub">Click to choose a file or drag & drop JSON / newline list</span>
          </div>
          <input id="tagImportFile" type="file" accept=".txt,.csv,.json,text/plain,application/json" class="d-none" />
          <div id="tagsStatus" class="catalog-status d-none" aria-live="polite">Loading…</div>
          <div id="tagsSpinner" class="spinner" hidden></div>
          <div class="list-controls flex-row gap-10 mt-12" id="tagsPager">
            <div class="ml-auto"></div>
            <label for="tagPageSize" class="hint-sm">Page size</label>
            <select id="tagPageSize" class="control-select" aria-label="Tags page size">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="tagPrev" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="tagPageInfo" class="hint-sm" aria-live="polite">—</span>
            <button id="tagNext" class="btn-sm" aria-label="Next page">Next</button>
          </div>
          <div id="tagsGrid" class="perf-grid performers-grid"></div>
          <div class="list-controls flex-row gap-10 mt-12" id="tagsPagerBottom">
            <div class="ml-auto"></div>
            <label for="tagPageSizeBottom" class="hint-sm">Page size</label>
            <select id="tagPageSizeBottom" class="control-select" aria-label="Tags page size (bottom)">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="tagPrevBottom" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="tagPageInfoBottom" class="hint-sm" aria-live="polite">—</span>
            <button id="tagNextBottom" class="btn-sm" aria-label="Next page">Next</button>
          </div>
        </div>
      </div>

      <!-- Template: Similar row (pair) -->
      <template id="similarRowTemplate">
        <div class="card similar-row">
          <div class="similar-row__header">
            <strong class="similar-title">—</strong>
          </div>
          <div class="similar-files">
            <div class="similar-file" data-role="a">
              <div class="similar-file__label">File A</div>
              <div class="similar-file__primary">
                <button class="similar-thumb-btn" type="button" aria-label="Open file A" title="Open file">
                  <img class="similar-thumb" alt="" loading="lazy" decoding="async" />
                </button>
                <div class="similar-file__path path-a"></div>
              </div>
              <dl class="similar-file__stats">
                <div class="similar-file__stat" data-stat="duration" data-diff="unknown">
                  <dt>Duration</dt>
                  <dd class="meta-duration">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="size" data-diff="unknown">
                  <dt>Size</dt>
                  <dd class="meta-size">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="resolution" data-diff="unknown">
                  <dt>Dimensions</dt>
                  <dd class="meta-resolution">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_v" data-diff="unknown">
                  <dt>Video BR</dt>
                  <dd class="meta-bitrate-v">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_a" data-diff="unknown">
                  <dt>Audio BR</dt>
                  <dd class="meta-bitrate-a">—</dd>
                </div>
              </dl>
            </div>
            <div class="similar-file" data-role="b">
              <div class="similar-file__label">File B</div>
              <div class="similar-file__primary">
                <button class="similar-thumb-btn" type="button" aria-label="Open file B" title="Open file">
                  <img class="similar-thumb" alt="" loading="lazy" decoding="async" />
                </button>
                <div class="similar-file__path path-b"></div>
              </div>
              <dl class="similar-file__stats">
                <div class="similar-file__stat" data-stat="duration" data-diff="unknown">
                  <dt>Duration</dt>
                  <dd class="meta-duration">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="size" data-diff="unknown">
                  <dt>Size</dt>
                  <dd class="meta-size">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="resolution" data-diff="unknown">
                  <dt>Dimensions</dt>
                  <dd class="meta-resolution">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_v" data-diff="unknown">
                  <dt>Video BR</dt>
                  <dd class="meta-bitrate-v">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_a" data-diff="unknown">
                  <dt>Audio BR</dt>
                  <dd class="meta-bitrate-a">—</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </template>

      <!-- Similar Tab Panel (static) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="similar-tab" id="similar-panel" hidden>
        <div class="task-section">
          <div class="section-header">
            <h2>Similar (pHash)</h2>
            <div class="section-actions">
              <label class="hint-sm">Threshold <input id="similarThresh" type="number" min="0" max="1" step="0.01" value="0.90" class="w-120" /></label>
              <label class="hint-sm">Limit <input id="similarLimit" type="number" min="1" step="1" value="50" class="w-120" /></label>
              <label class="hint-sm"><input id="similarRecursive" type="checkbox" /> Recursive</label>
              <button id="similarRefreshBtn" class="btn-sm">Refresh</button>
            </div>
          </div>
          <div id="similarStatus" class="hint-sm hint-sm--muted">—</div>
          <div id="similarResults" class="mt-12"></div>
          <div id="similarSelectionPanel" class="similar-selection" hidden>
            <div class="similar-selection__header">
              <div>
                <strong id="similarSelectionCount">No files selected</strong>
                <div class="similar-selection__hint">Click a file tile to choose which copy to remove from each pair.</div>
              </div>
              <div class="similar-selection__header-actions">
                <button id="similarSelectionClear" class="btn-sm" type="button">Clear</button>
              </div>
            </div>
            <ul id="similarSelectionList" class="similar-selection__list"></ul>
            <div class="similar-selection__footer">
              <button id="similarDeleteBtn" class="btn btn-danger btn-sm" type="button" disabled>Delete Selected</button>
            </div>
          </div>
        </div>
      </div>

      <!-- API Explorer Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="api-tab" id="api-panel" hidden>
        <div class="task-section">
          <div class="section-header">
            <h2>API Explorer</h2>
            <div class="section-actions">
              <button id="apiReloadSpecBtn" class="btn-sm" aria-label="Reload API spec">Reload Spec</button>
              <label for="apiSearch" class="sr-only">Filter endpoints</label>
              <input id="apiSearch" type="text" class="control-input" placeholder="Filter paths…" aria-label="Filter endpoints" />
            </div>
          </div>
          <div class="api-composer">
            <div class="row gap-10">
              <label for="apiMethod" class="sr-only">HTTP method</label>
              <select id="apiMethod" class="control-select" aria-label="HTTP method">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <label for="apiPath" class="sr-only">Request path</label>
              <input id="apiPath" class="control-input w-100" placeholder="/api/health" aria-label="Request path" />
              <button id="apiExecBtn" class="btn-sm" aria-label="Execute request">Execute</button>
            </div>
            <div class="row gap-10 mt-12">
              <div class="w-100">
                <label class="hint-sm" for="apiQueryJson">Query (JSON object)</label>
                <textarea id="apiQueryJson" class="control-textarea w-100" rows="4" placeholder="{\n  \"page\": 1\n}"></textarea>
              </div>
              <div class="w-100">
                <label class="hint-sm" for="apiBodyJson">Body (JSON)</label>
                <textarea id="apiBodyJson" class="control-textarea w-100" rows="4" placeholder="{ }"></textarea>
              </div>
            </div>
            <div class="row gap-10 mt-12">
              <span id="apiComposerStatus" class="hint-sm"></span>
            </div>
            <pre id="apiComposerResponse" class="json-pre mt-12" aria-live="polite"></pre>
          </div>
        </div>
        <div class="task-section">
          <div class="section-header">
            <h2>Endpoints</h2>
            <div class="section-actions">
              <label class="toggle-label" for="apiTreeToggle">
                <input id="apiTreeToggle" type="checkbox" checked aria-label="Toggle tree view" />
                <span>Tree View</span>
              </label>
              <button id="apiEndpointsToggleAllBtn" class="btn-sm" aria-expanded="false" aria-controls="apiEndpointsList">Expand All</button>
            </div>
          </div>
          <div id="apiEndpointsList" class="api-endpoints-list"></div>
        </div>
      </div>

      <!-- Tasks Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="tasks-tab" id="tasks-panel" hidden>
        <div class="tasks-container">

          <!-- Job Monitor Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Job Monitor</h2>
              <div class="section-actions">
                <button id="pauseToggleBtn" class="btn-sm" title="Pause starting new jobs" aria-pressed="false">
                  <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-pause"></use>
                  </svg>
                  <span class="ml-4">Pause</span>
                </button>
                <!-- Buttons hidden initially; JS toggles .d-none -->
                <button id="cancelAllBtn" class="btn-sm d-none" title="Cancel all queued and running jobs">Cancel All</button>
                <button id="cancelQueuedBtn" class="btn-sm d-none" title="Cancel all queued jobs">Cancel Queued</button>
                <button id="clearCompletedBtn" class="btn-sm d-none" title="Remove completed jobs from the list">Clear Completed</button>
              </div>
            </div>

            <div class="job-stats">
              <div class="stat-card" id="filterQueued" data-filter="queued" title="Show only queued jobs">
                <span class="stat-label">Queued</span>
                <span class="stat-value" id="queuedJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterActive" data-filter="running" title="Show only active (running) jobs">
                <span class="stat-label">Active</span>
                <span class="stat-value" id="activeJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterCompleted" data-filter="completed" title="Show completed jobs">
                <span class="stat-label">Completed</span>
                <span class="stat-value" id="completedJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterErrored" data-filter="failed" title="Show failed jobs">
                <span class="stat-label">Errored</span>
                <span class="stat-value" id="failedJobsCount">0</span>
              </div>
            </div>

            <div class="job-table-container" id="jobTableContainer">
              <table class="job-table">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>Finish</th>
                    <th>Task</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="jobTableBody">
                  <!-- Jobs will be populated here -->
                </tbody>
              </table>
              <div class="resize-handle" id="jobResizeHandle" title="Drag to resize job list"></div>
            </div>
          </div>

          <!-- Artifact Generation Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Generate Artifacts</h2>
            </div>

            <!-- File Selection -->
            <div class="file-selection">
              <div class="selection-options">
                <label class="selection-option">
                  <input type="radio" name="fileSelection" value="all" checked>
                  All files in library
                </label>
                <label class="selection-option">
                  <input type="radio" name="fileSelection" value="selected">
                  Selected files (<span id="selectedFileCount">0</span>)
                </label>
                <button id="generateAllBtn" class="btn-sm ml-auto" title="Queue all missing artifacts for the chosen scope">Generate All</button>
              </div>
            </div>

            <!-- Artifact Types -->
            <div class="artifact-grid">

              <div class="artifact-card artifact-card-uniform" data-artifact="metadata">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Metadata</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="metadataCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="metadataFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="metadata-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="metadata-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="metadata-clear" title="Delete all metadata JSON files">Clear</button>
                  </div>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="thumbnail">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Thumbnails</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="thumbnailCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="thumbnailFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="thumbnail-missing" title="Generate missing thumbnails">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="thumbnail-all" title="Recompute all thumbnails">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="thumbnail-clear" title="Delete all generated thumbnails without regenerating">Clear</button>
                    <button class="btn-options" data-artifact="thumbnail" title="Options" aria-label="Thumbnail options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="thumbnailOptions">
                  <label>Offset (seconds): <input type="number" id="thumbnailOffset" value="10" min="1" max="3600"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="preview">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Previews</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="previewCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="previewFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="preview-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="preview-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="preview-clear" title="Delete all preview videos">Clear</button>
                    <button class="btn-options" data-artifact="preview" aria-label="Preview options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="previewOptions">
                  <label>Segments: <input type="number" id="previewSegments" value="9" min="5" max="20"></label>
                  <label>Duration (sec): <input type="number" id="previewDuration" value="1.0" min="0.5" max="3.0" step="0.1"></label>
                  <label>Width (px): <input type="number" id="previewWidth" value="320" min="120" max="1280"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="sprites">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Sprite Sheets</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="spritesCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="spritesFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="sprites-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="sprites-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="sprites-clear" title="Delete all sprite sheets">Clear</button>
                    <button class="btn-options" data-artifact="sprites" aria-label="Sprite options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="spritesOptions">
                  <label>Interval (sec): <input type="number" id="spriteInterval" value="10" min="1" max="60"></label>
                  <label>Width (px): <input type="number" id="spriteWidth" value="320" min="160" max="1920"></label>
                  <label>Columns: <input type="number" id="spriteCols" value="10" min="5" max="20"></label>
                  <label>Rows: <input type="number" id="spriteRows" value="10" min="3" max="40"></label>
                  <label>Quality (0-8): <input type="number" id="spriteQuality" value="4" min="0" max="8"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="phash">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Perceptual Hash</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="phashCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="phashFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="phash-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="phash-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="phash-clear" title="Delete all perceptual hash artifacts">Clear</button>
                    <button class="btn-options" data-artifact="phash">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="phashOptions">
                  <label>Frames: <input type="number" id="phashFrames" value="5" min="3" max="10"></label>
                  <label>Algorithm:
                    <div class="select">
                      <select id="phashAlgo" class="control-select">
                        <option value="ahash">Average Hash</option>
                        <option value="phash">Perceptual Hash</option>
                        <option value="dhash">Difference Hash</option>
                      </select>
                      <span class="chevron">▾</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="markers">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Marker Detection</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="markersCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="markersFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="markers-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="markers-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="markers-clear" title="Delete all marker detection JSON">Clear</button>
                    <button class="btn-options" data-artifact="markers">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="markersOptions">
                  <label>Threshold: <input type="number" id="markerThreshold" value="0.4" min="0.1" max="1.0" step="0.1"></label>
                  <label>Limit: <input type="number" id="markerLimit" value="0" min="0" max="100"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="heatmap">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Heatmap</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="heatmapCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="heatmapFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="heatmap-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="heatmap-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="heatmap-clear" title="Delete all heatmap PNGs">Clear</button>
                    <button class="btn-options" data-artifact="heatmap">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="heatmapOptions">
                  <label>Interval (sec): <input type="number" id="heatmapInterval" value="1.0" min="0.5" max="10.0" step="0.5"></label>
                  <label>Mode:
                    <div class="select">
                      <select id="heatmapMode" class="control-select">
                        <option value="both">Both</option>
                        <option value="brightness">Brightness</option>
                        <option value="motion">Motion</option>
                        <option value="color">Color</option>
                      </select>
                      <span class="chevron">▾</span>
                    </div>
                  </label>
                  <label class="row small items-center gap-6">
                    <input type="checkbox" id="heatmapPng" checked /> Save PNG
                  </label>
                </div>
              </div>
            </div>
          </div>
          <!-- Orphaned Artifacts Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Orphaned Artifacts</h2>
            </div>
            <div class="orphan-card">
              <div class="orphan-header">
                <div class="orphan-info">
                  <h3>Orphaned Files</h3>
                  <div class="orphan-stats">
                    <span class="orphan-count" id="orphanCount">0</span>
                    <span class="orphan-label">files without corresponding videos</span>
                  </div>
                </div>
                <div class="orphan-actions">
                  <button class="btn-sm" id="refreshOrphansSummaryBtn" title="Manually recount orphaned artifacts">Refresh Count</button>
                  <button class="btn-preview" id="previewOrphansBtn" disabled title="Show suggested cleanup (dry run)">Preview Cleanup</button>
                  <!-- Apply Cleanup is hidden until a preview is displayed -->
                  <button class="btn-cleanup d-none" id="cleanupOrphansBtn" disabled title="Apply cleanup (removes unmatched orphans)">Apply Cleanup</button>
                  <button class="btn-preview" id="previewRepairsBtn" disabled title="Show suggested renames (dry run)">Preview Repairs</button>
                  <!-- Apply Repairs is hidden until repair preview streaming completes -->
                  <button class="btn-cleanup d-none" id="applyRepairsBtn" disabled title="Apply suggested repairs (move artifacts next to best-matched media; keeps unmatched orphans)">Apply Repairs</button>
                </div>
              </div>
              <div class="orphan-details d-none" id="orphanDetails">
                <div class="orphan-list" id="orphanList">
                  <!-- Orphan files will be listed here -->
                </div>
              </div>
              <div class="orphan-details d-none" id="orphanRenames">
                <div class="orphan-list" id="orphanRenamesList">
                  <!-- Suggested renames (dry run) will be listed here -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="stats-tab" id="stats-panel" hidden>
        <div class="stats-container">
          <h2>Library Statistics</h2>
          <div class="stats-row">
            <div class="stats-item"><strong>Number of Files:</strong> <span id="statsNumFiles">—</span></div>
            <div class="stats-item"><strong>Total Size:</strong> <span id="statsTotalSize">—</span></div>
            <div class="stats-item"><strong>Total Duration:</strong> <span id="statsTotalDuration">—</span></div>
            <div class="stats-item"><strong>Number of Tags:</strong> <span id="statsNumTags">—</span></div>
            <div class="stats-item"><strong>Number of Performers:</strong> <span id="statsNumPerformers">—</span></div>
          </div>
          <div class="stats-charts">
            <div class="chart-block">
              <h3>Resolution Distribution</h3>
              <canvas id="statsResChart" width="320" height="180"></canvas>
            </div>
            <div class="chart-block">
              <h3>Duration Distribution</h3>
              <canvas id="statsDurationChart" width="320" height="180"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="settings-tab" id="settings-panel" hidden>
        <div class="tab-content">
          <h2>Settings</h2>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Library Root</h2>
            </div>
            <div class="file-selection file-selection-root">
              <div class="root-input-row">
                <input id="folderInput" type="text" class="control-input root-input" placeholder="Type relative path (Enter) or absolute path to set root" title="Relative path to browse; absolute path to change root. Enter to apply." />
                <button id="refresh" class="btn-sm" title="Reload current listing">Reload</button>
                <button id="pickRootBtn" class="btn-sm" title="Open folder picker">Pick…</button>
              </div>
              <div class="hint-sm">
                Enter a relative path within the current root to browse (e.g. <code>Shows/Season 1</code>). Enter an absolute path (e.g. <code>/Volumes/Media</code> or <code>~/Movies</code>) to change the library root. Double‑click the input or click Pick… to open a folder picker.
              </div>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Player Preferences</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <div class="fw-600">Seek jumps (seconds)</div>
                <div class="row gap-10" style="align-items:center; flex-wrap:wrap; margin-top:4px">
                  <div class="flex-row gap-10" style="align-items:center">
                    <label for="settingJumpBackSeconds" class="hint-sm" style="opacity:.8">Back</label>
                    <input type="number" id="settingJumpBackSeconds" min="1" max="600" step="1" value="30" class="w-120" aria-label="Jump backward seconds" />
                  </div>
                  <div class="flex-row gap-10" style="align-items:center">
                    <label for="settingJumpFwdSeconds" class="hint-sm" style="opacity:.8">Forward</label>
                    <input type="number" id="settingJumpFwdSeconds" min="1" max="600" step="1" value="30" class="w-120" aria-label="Jump forward seconds" />
                  </div>
                  <span class="hint-sm" style="opacity:.75; flex-basis:100%">Values used by the ± buttons & Arrow Left/Right (when not frame-stepping).</span>
                </div>
              </label>
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingInfiniteScroll" />
                <div>
                  <div class="subtitle-icon-label">Infinite Scroll (auto-load next page)</div>
                  <div class="hint-sm">When enabled, scrolling near the end of the library automatically loads the next page instead of using the pager.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingStartAtBeginning" />
                <div>
                  <div class="fw-600">Always start videos at the beginning</div>
                  <div class="hint-sm">Ignores saved progress, resume overrides, and intro skip markers so playback always begins from 00:00.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingAutoplayResume" />
                <div>
                  <div class="subtitle-icon-label">
                    Autoplay on load when previously playing
                    <!-- reference subtitle icon placeholder (from user image) -->
                    <span aria-hidden="true" title="Subtitle icon reference" class="subtitle-icon">
                      <span class="subtitle-line top"></span>
                      <span class="subtitle-line bottom"></span>
                    </span>
                  </div>
                  <div class="hint-sm">
                    If enabled, the player resumes playback automatically when a video was playing before closing. Default is off.
                  </div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingShowHeatmap" />
                <div>
                  <div class="fw-600">Show timeline heatmap</div>
                  <div class="hint-sm">
                    Toggle the heatmap overlay on the player timeline. This only affects display; artifacts and badges still load as usual.
                  </div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingShowMarkers" />
                <div>
                  <div class="fw-600">Show marker boundary ticks</div>
                  <div class="hint-sm">
                    Toggle the marker boundary ticks on the player timeline. This only affects display; marker data still loads as usual.
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Library Preferences</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingPreview" />
                <div>
                  <div class="fw-600">Enable video previews</div>
                  <div class="hint-sm">When enabled, cards will play a small preview on hover. Previews are only played if they already exist; no background generation is triggered automatically.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingPreviewOnDemand" />
                <div>
                  <div class="fw-600">Generate previews on demand</div>
                  <div class="hint-sm">When enabled, hovering a card will request the server to create a preview if one doesn’t exist yet. This may start background work and use CPU.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingConfirmDeletes" />
                <div>
                  <div class="fw-600">Require confirmation for deletions</div>
                  <div class="hint-sm">When enabled, clearing or deleting artifacts will ask for confirmation. Default is off.</div>
                </div>
              </label>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Auto-generate Missing Artifacts</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingAutoArtifactMetadata" />
                <div>
                  <div class="fw-600">Metadata</div>
                  <div class="hint-sm">Automatically queue metadata extraction when a video is opened and its metadata sidecar is missing.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactThumbnail" />
                <div>
                  <div class="fw-600">Thumbnails</div>
                  <div class="hint-sm">Start a thumbnail job for the active video if none exists yet. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactPreview" />
                <div>
                  <div class="fw-600">Previews</div>
                  <div class="hint-sm">Kick off preview generation on playback when hover previews are missing. Requires FFmpeg and may take longer than other artifacts.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactSprites" />
                <div>
                  <div class="fw-600">Sprites</div>
                  <div class="hint-sm">Queue sprite sheet jobs automatically for the playing video when none are present. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactMarkers" />
                <div>
                  <div class="fw-600">Markers</div>
                  <div class="hint-sm">Begin marker detection automatically when playback starts and marker data is missing. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactHeatmap" />
                <div>
                  <div class="fw-600">Heatmaps</div>
                  <div class="hint-sm">Generate heatmaps for the current video whenever the artifact is missing. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactPhash" />
                <div>
                  <div class="fw-600">pHash</div>
                  <div class="hint-sm">Automatically queue perceptual hash generation to aid duplicate detection. Requires FFmpeg.</div>
                </div>
              </label>
              <div class="hint-sm hint-sm--muted mt-8">These automations run once per video selection and respect existing job deduplication.</div>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Job Processing</h2>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">Max concurrent jobs</div>
                <input type="number" id="settingConcurrency" min="1" max="16" step="1" value="4" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-12">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg parallel processes</div>
                <input type="number" id="settingFfmpegConcurrency" min="1" max="16" step="1" value="4" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-8">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg threads per process</div>
                <input type="number" id="settingFfmpegThreads" min="1" max="32" step="1" value="1" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-8">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg timelimit (s)</div>
                <input type="number" id="settingFfmpegTimelimit" min="0" max="86400" step="10" value="600" class="w-120" />
              </div>
            </div>
            <div class="hint-sm mt-8 max-w-640">FFmpeg settings control low-level media processing. Parallel processes multiply workload across different files; threads apply within a single process. Lower timelimit can fail very long operations; set 0 to disable.</div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Toast host (notifications rendered via template clones) -->
  <div id="toastHost" aria-live="polite" aria-atomic="false"></div>
</body>
</html>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    {
  color: #ff6b6b;
}

.markers-empty {
  font-size: 12px;
  opacity: .6;
  padding: 4px 2px;
}

.marker-row--intro {
  background: linear-gradient(90deg, rgba(255, 186, 0, 0.07), rgba(255, 122, 0, 0.04));
  border-left: 4px solid #ff9800;
  padding-left: 8px;
  order: 0;
  /* keep intro markers in normal flow */
}

.marker-row--intro .marker-jump {
  background: rgba(255, 160, 40, 0.12);
  border: 1px solid rgba(255, 160, 40, 0.18);
}

/* Outro (outro-begin) marker: visually distinct and pinned to bottom of list */
.marker-row--outro {
  background: linear-gradient(90deg, rgba(0, 186, 255, 0.07), rgba(0, 122, 255, 0.04));
  border-left: 4px solid #0098ff;
  padding-left: 8px;
  order: 999;
  /* show at bottom of the flex column */
}

.marker-row--outro .marker-jump {
  background: rgba(0, 160, 255, 0.12);
  border: 1px solid rgba(0, 160, 255, 0.18);
}

/* Outro begin marker tick (timeline tick) */
.outro-marker-tick {
  position: absolute;
  top: 0;
  width: 6px;
  height: 100%;
  background: linear-gradient(180deg, #00b0ff, #007aff);
  box-shadow: 0 0 6px rgba(0, 122, 255, 0.6);
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  mix-blend-mode: normal;
}

.scrubber-track:hover .scrubber-progress {
  filter: brightness(1.15);
}

.scrubber-track:hover .scrubber-handle {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}

.scrubber-buffer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255, 255, 255, .28);
  width: 0%;
  transition: width .25s linear;
  opacity: .4;
}

.scrubber-progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  background: linear-gradient(90deg, #3daaf9, #6679ff 45%, #9a6bff);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .15) inset, 0 1px 2px rgba(0, 0, 0, .45);
  transition: width .08s linear;
}

.scrubber-handle {
  position: absolute;
  top: 50%;
  left: 0%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fff, #d5e2ff);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .5), 0 0 0 2px rgba(0, 0, 0, .4), 0 0 0 1px rgba(255, 255, 255, .3) inset;
  transform: translate(-50%, -50%) scale(.65);
  opacity: 0;
  transition: .18s ease;
  pointer-events: none;
}

.player-scrubber-bar:hover .scrubber-handle {
  opacity: 1;
}

/* Marker ticks */
.scrubber-markers {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  pointer-events: none;
  mix-blend-mode: screen;
}

.scrubber-markers span {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, .85), rgba(255, 255, 255, .15));
  opacity: .55;
}

.scrubber-markers .intro-scrubber-marker {
  width: 4px;
  background: linear-gradient(180deg, #ffb000, #ff7a00);
  box-shadow: 0 0 6px rgba(255, 122, 0, 0.6);
  border-radius: 2px;
  opacity: 1;
}

/* Integrated heatmap inside scrubber track */
.scrubber-track .timeline-heatmap,
.scrubber-track .timeline-heatmap-canvas {
  pointer-events: none;
}

.scrubber-track .timeline-heatmap {
  mix-blend-mode: soft-light;
  opacity: .75;
}

.scrubber-track .timeline-heatmap-canvas {
  opacity: .85;
}

.scrubber-time {
  font-variant-numeric: tabular-nums;
  letter-spacing: .4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .7);
  font-weight: 500;
}

@media (max-width: 900px) {
  .player-scrubber-bar {
    padding: 12px 16px 16px;
  }

  #playerTitle.player-title {
    max-width: 60vw;
  }
}

@media (max-width: 640px) {
  .player-scrubber-bar {
    padding: 10px 12px 14px;
  }

  #playerTitle.player-title {
    max-width: 70vw;
    font-size: 12px;
  }
}

.player-main {
  position: relative;
}

.video-stage {
  position: relative;
  display: block;
  width: 100%;
  background: #000;
}

.video-el {
  display: block;
  width: 100%;
  height: calc(100vh - var(--header-h));
  max-height: calc(100vh - var(--header-h));
  background: #000;
  aspect-ratio: 16/9;
  object-fit: contain;
}

/* Overlay */
.player-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
}

.player-overlay .overlay-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  animation: accFade .25s ease;
}

.timeline-overlay {
  position: relative;
  height: 13px;
  border-radius: 4px;
  background: rgba(12, 18, 30, 0.55);
  backdrop-filter: blur(2px);
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.timeline-overlay:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.timeline-heatmap,
.timeline-heatmap-canvas,
.timeline-progress,
.timeline-markers {
  position: absolute;
  inset: 0;
}

.timeline-heatmap {
  background-position: left center;
  background-size: 100% 100%;
  opacity: .85;
  mix-blend-mode: soft-light;
}

.timeline-heatmap-canvas {
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: .95;
}

.timeline-progress {
  width: 0%;
  background: linear-gradient(90deg, rgba(79, 140, 255, 0.65), rgba(79, 140, 255, 0.25));
  mix-blend-mode: screen;
  transition: width .12s linear;
}

.timeline-markers {
  pointer-events: none;
}

.controls-overlay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: rgba(14, 19, 30, 0.74);
  backdrop-filter: blur(3px) saturate(130%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 7px;
  padding: 3px 7px;
  box-shadow: 0 3px 14px -3px rgba(0, 0, 0, 0.6);
  flex-wrap: wrap;
  min-height: 30px;
  font-size: 12px;
}

.controls-overlay:hover {
  background: rgba(18, 24, 36, 0.84);
}

.controls-overlay .btn-sm {
  --accent: #4f8cff;
}

.time-display {
  font-size: 12px;
  color: var(--muted, #94a2c7);
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.player-controls {
  display: flex;
  width: 100%;
}

/* (Removed nested .player-controls volume styling in favor of global .vol-slider rules above) */

/* Video adjustment panel */
.video-adjustments {
  padding: 4px 2px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.video-adjustments .adj-row {
  display: grid;
  grid-template-columns: 88px 1fr 52px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.video-adjustments .adj-row label {
  font-weight: 500;
  color: var(--fg-600, #ccd2e0);
}

.video-adjustments .adj-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--fg-500, #b5bccb);
}

.video-adjustments .adj-actions {
  display: flex;
  justify-content: flex-end;
}

.video-adjustments .adj-slider {
  width: 100%;
}

/* Updated thumbnail flash */
.thumbnail-updated {
  outline: 2px solid var(--accent, #4f8cff);
  outline-offset: 2px;
  transition: outline-color .6s ease;
}

.thumbnail-updated {
  animation: thumbnailFlash 1.2s ease 1;
}

@keyframes thumbnailFlash {
  0% {
    outline-color: var(--accent, #4f8cff);
  }

  70% {
    outline-color: rgba(79, 140, 255, 0);
  }

  100% {
    outline-color: rgba(79, 140, 255, 0);
  }
}

/* Sidebar thumbnail updating shimmer */
#fiThumbnail._updating {
  position: relative;
}

#fiThumbnail._updating::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.15) 20%, rgba(255, 255, 255, 0.05) 40%);
  animation: thumbShimmer 1s linear infinite;
  mix-blend-mode: overlay;
}

@keyframes thumbShimmer {
  from {
    background-position: -200% 0;
  }

  to {
    background-position: 200% 0;
  }
}


/* Sidebar File Info thumbnail */
.thumbnail-wrap {
  position: relative;
  aspect-ratio: 16/9;
  /* Reserve stable space immediately to avoid card height collapse */
  background: #0e0f14;
  overflow: hidden;
}

/* Image & placeholder layered absolutely so placeholder no longer influences layout */
.thumbnail-wrap>.thumbnail-img,
.thumbnail-wrap>.thumbnail-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.thumbnail-img {
  aspect-ratio: 16/9;
  /* Keep for legacy (dir cards without wrap) */
  width: 100%;
  display: block;
  background: #0e0f14;
  object-fit: cover;
  opacity: 0;
  /* Fade in when loaded */
  transition: opacity .28s ease;
}

.card.loaded .thumbnail-wrap>.thumbnail-img {
  opacity: 1;
}

/* Placeholder now overlays; fade it out after image load */
.thumbnail-wrap>.thumbnail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity .28s ease;
  color: #2f3749;
  fill: currentColor;
}

.card.loaded .thumbnail-wrap>.thumbnail-placeholder {
  opacity: 0;
  pointer-events: none;
}

.fi-thumbnail-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity .25s ease;
}

.fi-thumbnail-box img._updating {
  opacity: .35;
}

.fi-thumbnail-set {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, .55);
  backdrop-filter: blur(3px);
  border: 1px solid rgba(255, 255, 255, .18);
  padding: 2px 6px;
  line-height: 1;
  font-size: 11px;
}

.fi-thumbnail-set:hover {
  background: rgba(0, 0, 0, .7);
}

.rate-select-wrap {
  min-width: 78px;
}

.utility-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
}

.utility-buttons .btn-sm {
  background: #1d2a3d;
}

.utility-buttons .btn-sm:hover {
  background: #233348;
}

.sprite-preview {
  position: absolute;
  left: 8px;
  width: 240px;
  height: 135px;
  background: #111 center/cover no-repeat;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  display: none;
  pointer-events: none;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
  z-index: 6;
  opacity: 0.95;
}

/* Compact adjustments when sidebar collapsed */
#playerLayout[data-sidebar-collapsed="true"] .player-overlay {
  padding-bottom: 4px;
}

/* Responsive tweaks */
/* Keep sidebar on the left;
on narrower screens shrink width instead of stacking */

/* === Viewport-Fit Player (no scroll) === */

/* (Removed duplicate #player-panel height block;
earlier flex rule governs layout now) */

#player-panel .player-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

#player-panel .player-stage-simple {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  min-height: 0;
  /* allow flex child (video) to size fully */
}

/* Panel-specific .video-el override removed: unified calc-based height applies */

@media (max-height: 760px) {

  /* Tighten spacing on shorter viewports */
  #player-panel .player-shell {
    gap: 6px;
    padding: 2px 6px 8px;
  }

  #player-panel .player-stage-simple {
    padding: 4px;
  }

  .player-stage-simple .video-el {
    border-radius: 8px;
  }

  #player-panel .player-bar-simple {
    padding: 8px 10px;
  }
}

@media (max-height: 560px) {

  /* Compress controls further and shrink fonts */
  #player-panel .player-bar-simple {
    padding: 6px 8px;
    gap: 6px;
    font-size: 11px;
  }

  #player-panel .player-bar-simple button.btn-sm {
    padding: 4px 6px;
    font-size: 11px;
  }

  #player-panel .player-bar-simple .time-display {
    font-size: 11px;
  }

  .vol-slider {
    width: 90px;
  }
}

@media (max-width: 760px) {
  .player-layout {
    gap: 10px;
  }

  .player-video {
    border-radius: 10px;
  }
}

@media (max-width: 1024px) {
  #playerControls.player-controls {
    padding: 10px 14px;
    gap: 12px;
  }

  #playerControls .player-control-cluster.cluster-transport,
  #playerControls .player-control-cluster.cluster-audio {
    flex: 1 1 100%;
    min-width: 0;
  }

  #playerControls .player-control-cluster {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .player-overlay {
    padding: 10px 6px 4px;
  }

  #playerControls.player-controls {
    padding: 10px;
    border-radius: 14px;
    gap: 10px;
  }

  #playerControls .player-controls-groups {
    gap: 10px;
    grid-template-columns: 1fr;
  }

  #playerControls .player-control-cluster {
    width: 100%;
  }

  #playerControls .player-control-cluster.cluster-navigate {
    flex: 0 0 auto;
  }

  #playerControls .player-volume {
    min-width: 0;
  }

  #playerControls .player-volume .vol-slider {
    width: clamp(96px, 50vw, 130px);
  }

  #playerControls .btn.btn-xs {
    flex: 1 1 auto;
    min-width: 0;
  }

  .player-title {
    font-size: 16px;
  }

  .controls-overlay {
    padding: 2px 6px;
    gap: 4px;
  }
}

/* Fullscreen refinements */
:fullscreen .player-video,
.player-video:fullscreen {
  border-radius: 0;
  max-height: 100vh;
}

:fullscreen .player-overlay {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
}

/* High contrast / prefers-reduced-motion adjustments */
@media (prefers-reduced-motion: reduce) {
  .timeline-progress {
    transition: none;
  }

  .player-overlay .overlay-inner {
    animation: none;
  }
}

@media (forced-colors: active) {
  .controls-overlay {
    border: 1px solid CanvasText;
  }

  .timeline-overlay {
    border: 1px solid CanvasText;
  }
}

/* Toast / notification system */
#toastHost {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1000;
  pointer-events: none;
  /* clicks pass through when between toasts */
}

/* Destructive / danger button variant (used for Clear All) */
.btn-danger,
.btn.btn-danger,
button.btn-danger {
  background: linear-gradient(135deg, #b91c1c, #dc2626);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 4px -2px rgba(0, 0, 0, 0.5);
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626, #ef4444);
}

.btn-danger:active {
  background: #991b1b;
}

.btn-danger:disabled {
  opacity: .55;
  cursor: not-allowed;
}

/* Capability banner extracted from inline style */
.capability-banner {
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: #221b12;
  color: #f7d382;
  font-size: 13px;
  line-height: 1.4;
}

.toast {
  font-size: 13px;
  line-height: 1.3;
  background: #4f8cff;
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  animation: toastIn 0.32s ease;
  position: relative;
  pointer-events: auto;
  /* allow hover for potential future actions */
  max-width: 320px;
}

.toast.is-success {
  background: #22c55e;
}

.toast.is-error {
  background: #ef4444;
}

.toast.is-info {
  background: #4f8cff;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toast.fade-out {
  opacity: 0;
  transition: opacity .25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}

/* 18. Registry & Auto-Tag (appended) */
.registry-flex {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 8px;
}

.registry-column {
  flex: 1 1 340px;
  min-width: 300px;
  background: #1b1f28;
  border: 1px solid #273140;
  padding: 12px;
  border-radius: 10px;
  box-shadow: 0 2px 6px -2px rgba(0, 0, 0, .55);
}

.registry-column h3 {
  margin: 0 0 6px;
  font-size: 15px;
  letter-spacing: .3px;
}

.registry-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.registry-list {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #273140;
  border-radius: 6px;
  background: #141a22;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.registry-item {
  padding: 6px 8px;
  border: 1px solid #273140;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  background: #1d2530;
  cursor: pointer;
  line-height: 1.2;
}

.registry-item[data-selected="1"] {
  background: #20344e;
  border-color: #335a8a;
}

.registry-item .ri-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.registry-item .ri-count {
  opacity: .55;
  font-size: 11px;
}

.autotag-table {
  width: 100%;
  border-collapse: collapse;
}

.autotag-table th,
.autotag-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #1f2833;
  font-size: 12px;
  vertical-align: top;
  text-align: left;
}

.autotag-table thead th {
  background: #18202a;
  position: sticky;
  top: 0;
  z-index: 1;
}

.autotag-table tbody tr:hover {
  background: #1b2736;
}

.w-240 {
  width: 240px;
}

.w-200 {
  width: 200px;
}

/* Accordion animations: use max-height + opacity for a reliable, CSS-only transition
   that doesn't require JS-driven measurements. We toggle the `.open` class on the
   .acc-item and .acc-panel to animate. Keep `.hidden` as a graceful no-JS fallback. */
.accordion .acc-panel {
  max-height: 0;
  /* collapsed */
  overflow: hidden;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  transition: max-height 260ms cubic-bezier(.2, .9, .2, 1), opacity 180ms ease, padding 200ms ease;
}

.accordion .acc-panel.open {
  /* large enough to cover most content;
  using max-height avoids layout thrashing */
  max-height: 2000px;
  opacity: 1;
  padding-top: 10px;
  padding-bottom: 10px;
}

/* When JS is disabled we still support hiding via `.hidden` */
.accordion .acc-panel.hidden {
  display: none !important;
}

/* Header caret rotation: rotate when the item is open or when aria-expanded is true */
.accordion .acc-header .acc-header__icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  vertical-align: middle;
  transition: transform 220ms ease, opacity 150ms ease;
  color: inherit;
  /* default: point right (icon originally points left in the sprite) */
  transform: rotate(180deg);
}

.accordion .acc-header .acc-header__icon use,
.accordion .acc-header .acc-header__icon path {
  fill: currentColor;
}

/* rotate the svg caret when open/expanded */
.acc-item.open .acc-header .acc-header__icon,
.acc-header[aria-expanded="true"] .acc-header__icon {
  /* open: point down */
  transform: rotate(270deg);
}

/* ===== Settings: JSON panels (health/config) ===== */
.settings-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.json-pre {
  background: #0b0e18;
  color: #e6ebff;
  border: 1px solid #2a2e3a;
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
}

/* =============================================================
   Fire TV / Android TV Mode Overrides
   ============================================================= */

/* Fire TV mode only active when .firetv class is present on html/documentElement */
.firetv {
  /* Remove fine hover interactions that don't work with remote */
  --transition-quick: none;
  --transition-med: none;
}

/* Larger grid tiles for better remote navigation */
.firetv .grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

/* Larger, more visible focus indicators */
.firetv .grid .card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.firetv .grid .card:focus {
  outline: 4px solid var(--accent);
  outline-offset: 4px;
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(79, 140, 255, 0.3);
  z-index: 10;
  position: relative;
}

/* Larger buttons and controls */
.firetv .btn {
  min-height: 48px;
  padding: 12px 20px;
  font-size: 16px;
}

.firetv .search-input {
  height: 48px;
  font-size: 16px;
  padding: 0 16px;
}

/* Header auto-hide preparation */
.firetv header {
  transition: transform 0.3s ease;
}

.firetv header.hidden {
  transform: translateY(-100%);
}

/* Ensure content doesn't jump when header hides */
/* Optional: if main needs to adjust when header hides */
.firetv main { transition: padding-top 0.3s ease; }
.firetv header.hidden + main { padding-top: 0; }

/* Better contrast for text on TV screens */
.firetv {
  --text: #ffffff;
  --muted: #b8c5e0;
}

/* Remove hover states that don't apply to remote control */
.firetv .card:hover,
.firetv .btn:hover {
  transform: none;
  box-shadow: none;
}

/* Global link style: inherit color and remove underline for cleaner tile/title links */
a,
a:visited {
  color: inherit;
  text-decoration: none;
}
a:hover,
a:focus {
  text-decoration: none;
}

/* Focus-visible only for actual focus (not hover) */
.firetv .card:focus-visible {
  outline: 4px solid var(--accent);
  outline-offset: 4px;
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(79, 140, 255, 0.3);
}

/* =============================
   Performers Graph (Cytoscape)
   ============================= */
#graph-panel {
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow children to size within flex */
}
.graph-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.graph-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#cyContainer {  position: relative;  flex: 1 1 auto;  min-height: 320px; }
#cyGraph { position: absolute; inset: 0; }
.graph-controls input[type="range"] { width: 140px; }
#graphTooltip { position: fixed; z-index: 9999; background: rgba(10,12,18,0.96); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 8px; box-shadow: 0 8px 22px rgba(0,0,0,.45); max-width: 400px; }
#graphTooltip .gt-title { font-weight: 600; margin-bottom: 6px; font-size: 12px; }
#graphTooltip .gt-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
#graphTooltip .gt-item { display: block; text-decoration: none; color: inherit; font-size: 11px; }
#graphTooltip .gt-item div { margin-top: 3px; line-height: 1.2; word-break: break-word; }
#graphTooltip img { width: 100%; height: 60px; object-fit: cover; border-radius: 4px; background: #111a28; }
#cyContainer {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
}
#cyGraph {
  position: absolute;
  inset: 0;
}
#graphTooltip {
  position: fixed;
  z-index: 9999;
  background: rgba(10,12,18,0.96);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--text);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  max-width: 420px;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
}
#graphTooltip .gt-title {
  font-weight: 600;
  margin-bottom: 6px;
}
#graphTooltip .gt-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
#graphTooltip .gt-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
#graphTooltip .gt-item img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  display: block;
}
.cy-panzoom {
  /* Slightly raise panzoom above graph so it's always clickable */
  z-index: 10;
}

/* =============================
   Connections (Cytoscape)
   ============================= */
#connections-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.graph-panel--connections {
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}
#connectionsCyContainer {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
}
.graph-panel--connections #connectionsCyContainer {
  order: 1;
}
#cyConnections {
  position: absolute;
  inset: 0;
}

.graph-controls--connections {
  gap: 16px;
}
.graph-panel--connections .graph-controls--connections {
  order: 2;
  flex: 0 0 260px;
  flex-direction: column;
  align-items: stretch;
  padding: 16px;
  border-bottom: 0;
  border-left: 1px solid rgba(255,255,255,0.08);
  background: var(--panel);
}
.graph-panel--connections .graph-controls--connections input[type="range"] {
  width: 100%;
}
.graph-panel--connections .graph-controls--connections .connections-actions {
  margin-top: auto;
  padding-top: 8px;
}
.graph-panel--connections .graph-controls--connections label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.graph-panel--connections .graph-controls--connections .connections-toggle {
  align-items: flex-start;
}
.connections-range-value {
  font-size: 11px;
  color: var(--muted, rgba(226,232,255,0.7));
}
.connections-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.connections-actions button {
  flex: 1;
}

@media (max-width: 900px) {
  .graph-panel--connections {
    flex-direction: column;
  }
  .graph-panel--connections .graph-controls--connections {
    order: 1;
    flex: 0 0 auto;
    border-left: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .graph-panel--connections #connectionsCyContainer {
    order: 2;
  }
}

.graph-controls--connections strong {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(226, 232, 255, 0.85);
  display: block;
  margin-bottom: 4px;
}

.connections-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.connections-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ttoms for Knox.mp4": {
    "mtime": 1764956998144018276,
    "performers": [],
    "tags": []
  },
  "Jack Five and Jay Tee Flip Fuck.mp4": {
    "mtime": 1764957028079672878,
    "performers": [
      "Jay Tee"
    ],
    "tags": []
  },
  "Jack Vidra and Hoytt Walker.mp4": {
    "mtime": 1764962289085334698,
    "performers": [
      "Hoytt Walker",
      "Jack Vidra"
    ],
    "tags": []
  },
  "Jack Vidra and Liam Knox.mp4": {
    "mtime": 1764962290837304310,
    "performers": [
      "Jack Vidra",
      "Liam Knox"
    ],
    "tags": []
  },
  "Jack Vidra and Scott Demarco in the High Rise.mp4": {
    "mtime": 1764962291897285926,
    "performers": [
      "Jack Vidra",
      "Scott DeMarco"
    ],
    "tags": []
  },
  "Jack Waters Greg Dixxon Work On Your Ass First.mp4": {
    "mtime": 1764962293261262270,
    "performers": [
      "Greg Dixxon",
      "Jack Waters"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Boston Jock.mp4": {
    "mtime": 1764962296305209484,
    "performers": [
      "Boston Jock",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Eddie Burke.mp4": {
    "mtime": 1764962296869199704,
    "performers": [
      "Eddie Burke",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Gunnar Stone.mp4": {
    "mtime": 1764962322832749735,
    "performers": [
      "Gunnar Stone",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Jimmy Standard.mp4": {
    "mtime": 1764962298249175776,
    "performers": [
      "Jimmy Standard",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Leo Benjamin.mp4": {
    "mtime": 1764962299561153028,
    "performers": [
      "Jack Wolf",
      "Leo Benjamin"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Ridick.mp4": {
    "mtime": 1764962337028503908,
    "performers": [
      "Jack Wolf",
      "Ridick"
    ],
    "tags": []
  },
  "Jack Wolf Breeds Sexystache.mp4": {
    "mtime": 1764962301721115580,
    "performers": [
      "Jack Wolf",
      "SexyStache"
    ],
    "tags": []
  },
  "Jack Wolf Flip Fucks with Gabriel Cross.mp4": {
    "mtime": 1764962303253089022,
    "performers": [
      "Gabriel Cross",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Jack Wolf Jett Wayne OnlyFans.mp4": {
    "mtime": 1764962304785062466,
    "performers": [
      "Jack Wolf",
      "Jett Wayne"
    ],
    "tags": []
  },
  "Jack Wolf Takes Thomas Long's Ten Inches.mp4": {
    "mtime": 1764962337028503908,
    "performers": [
      "Jack Wolf",
      "Thomas Long"
    ],
    "tags": []
  },
  "Jack Wolf and the Bearded Gorillas Flip Fuck.mp4": {
    "mtime": 1764962294841234870,
    "performers": [
      "Jack Wolf",
      "The Bearded Gorillas"
    ],
    "tags": []
  },
  "Jack and the Boys Daddy Gym Rat Stacked Oxfit81 Smoghobbit.mp4": {
    "mtime": 1764962312984920350,
    "performers": [
      "Jack Stacked",
      "Daddy Gym Rat",
      "Oxfit81"
    ],
    "tags": []
  },
  "Jackson Cooper Carter Woods Muscular Demonstrate His Cock Power Bareback.mp4": {
    "mtime": 1764962314396895884,
    "performers": [
      "Carter Woods",
      "Jackson Cooper"
    ],
    "tags": []
  },
  "Jacob Durham Fucks Aaron Asker Bareback by Treasure Island Media.mp4": {
    "mtime": 1764962315456877517,
    "performers": [
      "Jacob Durham"
    ],
    "tags": []
  },
  "Jacob Woods Riley Mitchel Hairy Muscular Dudes Plowing by Pride Studios.mp4": {
    "mtime": 1764962316544858666,
    "performers": [
      "Jacob Woods",
      "Riley Mitchel"
    ],
    "tags": []
  },
  "Jake Cruise and JD Downs.mp4": {
    "mtime": 1764962336008521566,
    "performers": [
      "Jake Cruise",
      "JD Downs"
    ],
    "tags": []
  },
  "Jake Cruise and Steven Richards.mp4": {
    "mtime": 1764962337992487220,
    "performers": [
      "Jake Cruise",
      "Steven Richards"
    ],
    "tags": []
  },
  "Jake Deckard Rocco Steele.mp4": {
    "mtime": 1764962337184501207,
    "performers": [
      "Rocco Steele",
      "Jake Deckard"
    ],
    "tags": []
  },
  "Jake Lawrence Breeds Kevin Cakes.mp4": {
    "mtime": 1764962359876108537,
    "performers": [
      "Jake Lawrence"
    ],
    "tags": []
  },
  "Jake Lawrence Creams Jack Vidra's Pink Muscle Cunt.mp4": {
    "mtime": 1764962363360048278,
    "performers": [
      "Jack Vidra",
      "Jake Lawrence"
    ],
    "tags": []
  },
  "Jake Mitchell Fucks Nate Stetson.mp4": {
    "mtime": 1764962376415822530,
    "performers": [
      "Jake Mitchell",
      "Nate Stetson"
    ],
    "tags": []
  },
  "Jake Mitchell and Chad Brock.mp4": {
    "mtime": 1764962357720145831,
    "performers": [
      "Chad Brock",
      "Jake Mitchell"
    ],
    "tags": []
  },
  "Jake Mitchell and Marco Napoli Bareback.mp4": {
    "mtime": 1764962339808455783,
    "performers": [
      "Jake Mitchell",
      "Marco Napoli"
    ],
    "tags": []
  },
  "Jake Mitchell and Scott Reynolds.mp4": {
    "mtime": 1764962363756041429,
    "performers": [
      "Jake Mitchell",
      "Scott Reynolds"
    ],
    "tags": []
  },
  "Jake Mitchell and Steve Arcturus.mp4": {
    "mtime": 1764962358900125419,
    "performers": [
      "Jake Mitchell",
      "Steve Arcturus"
    ],
    "tags": []
  },
  "Jake Morgan Donnie Argento Flip Fuck.mp4": {
    "mtime": 1764962380403753596,
    "performers": [
      "Donnie Argento",
      "Jake Morgan"
    ],
    "tags": []
  },
  "Jake Morgan and Chandler Scott.mp4": {
    "mtime": 1764962361208085498,
    "performers": [
      "Chandler Scott",
      "Jake Morgan"
    ],
    "tags": []
  },
  "Jake Morgan and Clay Towers Bareback.mp4": {
    "mtime": 1764962362468063705,
    "performers": [
      "Clay Towers",
      "Jake Morgan"
    ],
    "tags": []
  },
  "Jake Morgan and Jesse Zeppelin Daddy.mp4": {
    "mtime": 1764962386523647828,
    "performers": [
      "Jake Morgan",
      "Jesse Zeppelin"
    ],
    "tags": []
  },
  "Jake Nicola Adam Russo and Dirk Caber Have Some Flip Fucking Fun Part 1.mp4": {
    "mtime": 1764962365140017494,
    "performers": [
      "Adam Russo",
      "Dirk Caber",
      "Jake Nicola"
    ],
    "tags": []
  },
  "Jake Nicola Adam Russo and Dirk Caber Have Some Flip Fucking Fun Part 2.mp4": {
    "mtime": 1764962366379996051,
    "performers": [
      "Adam Russo",
      "Dirk Caber",
      "Jake Nicola"
    ],
    "tags": []
  },
  "Jake Nicola Vince Parker Muscle Bear Dicked Down in Bathroom by Hot Stranger Muscular.mp4": {
    "mtime": 1764962367339979450,
    "performers": [
      "Jake Nicola",
      "Vince Parker"
    ],
    "tags": []
  },
  "Jake Norris and Coach Austin Bareback.mp4": {
    "mtime": 1764962379347771848,
    "performers": [
      "Jake Norris"
    ],
    "tags": []
  },
  "Jake Norris and Eric West Bareback.mp4": {
    "mtime": 1764962426318960599,
    "performers": [
      "Jake Norris",
      "Eric West"
    ],
    "tags": []
  },
  "Jake Norris and Ross Scott Bareback.mp4": {
    "mtime": 1764962394655507323,
    "performers": [
      "Jake Norris",
      "Ross Scott"
    ],
    "tags": []
  },
  "Jake Steel Matt Sizemore Josh Kole Tyler Sweet Part 1 Vintage Condom.mp4": {
    "mtime": 1764962394543509257,
    "performers": [
      "Josh Kole",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Jake Steel Matt Sizemore Josh Kole Tyler Sweet Part 2.mp4": {
    "mtime": 1764962399079430901,
    "performers": [
      "Josh Kole",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Jake Wetmore and Tom Trojan Bareback.mp4": {
    "mtime": 1764962410099240588,
    "performers": [
      "Jake Wetmore",
      "Tom Trojan"
    ],
    "tags": []
  },
  "Jan Faust Jalil Jafar Rado Zuska.mp4": {
    "mtime": 1764962396471475951,
    "performers": [
      "Jalil Jafar",
      "Jan Faust",
      "Rado Zuska"
    ],
    "tags": []
  },
  "Jax Thirio Takes Vin Roxx\u2019s Gaygitiny.mp4": {
    "mtime": 1764962416483130369,
    "performers": [
      "Jax Thirio",
      "Vin Roxx"
    ],
    "tags": []
  },
  "Jax Thirio Ty Roderick My Tradesman Is a Hole.mp4": {
    "mtime": 1764962415507147218,
    "performers": [
      "Jax Thirio",
      "Tradesman",
      "Ty Roderick"
    ],
    "tags": []
  },
  "Jaxton Wheeler Amateur.mp4": {
    "mtime": 1764962411055224081,
    "performers": [
      "Jaxton Wheeler"
    ],
    "tags": []
  },
  "Jaxton Wheeler Fucks Pierce Paris.mp4": {
    "mtime": 1764962426950949692,
    "performers": [
      "Pierce Paris",
      "Jaxton Wheeler"
    ],
    "tags": []
  },
  "Jay Mathew and Landon Conrad.mp4": {
    "mtime": 1764962440126722361,
    "performers": [
      "Landon Conrad"
    ],
    "tags": []
  },
  "Jeff Niels and Phillip Anadarko Flip Fuck.mp4": {
    "mtime": 1764962417983104476,
    "performers": [
      "Phillip Anadarko",
      "Jeff Niels"
    ],
    "tags": []
  },
  "Jeff Stronger and Balthazar Daddy.mp4": {
    "mtime": 1764962419259082450,
    "performers": [
      "Jeff Stronger"
    ],
    "tags": []
  },
  "Jerry and Dick Flip Fuck Bareback.mp4": {
    "mtime": 1764962420463061667,
    "performers": [],
    "tags": []
  },
  "Jesse Jackman and Anthony London.mp4": {
    "mtime": 1764962456978431744,
    "performers": [
      "Anthony London",
      "Jesse Jackman"
    ],
    "tags": []
  },
  "Jesse James Fucks Jack Five.mp4": {
    "mtime": 1764956979320230764,
    "performers": [],
    "tags": []
  },
  "Jesse Zeppelin Donnie Argento and Andrew Day Part 4.mp4": {
    "mtime": 1764962427646937681,
    "performers": [
      "Andrew Day",
      "Donnie Argento",
      "Jesse Zeppelin"
    ],
    "tags": []
  },
  "Jessie Colter Jake Morgan Locker Room Boner Bareback.mp4": {
    "mtime": 1764962428286926637,
    "performers": [
      "Jake Morgan",
      "Jessie Colter"
    ],
    "tags": []
  },
  "Jessy Ares and Jesse Jackman Condom.mp4": {
    "mtime": 1764962454038482434,
    "performers": [
      "Jesse Jackman"
    ],
    "tags": []
  },
  "Jett Wayne Fucks Jack Wolf.mp4": {
    "mtime": 1764962429442906689,
    "performers": [
      "Jack Wolf",
      "Jett Wayne"
    ],
    "tags": []
  },
  "Jimmie Slater Brett Bradley Angelo and Sean Storm Part 1.mp4": {
    "mtime": 1764962454726470572,
    "performers": [
      "Brett Bradley",
      "Jimmie Slater",
      "Sean Storm"
    ],
    "tags": []
  },
  "Jimmie Slater Uses His Huge Dick to Fuck Billy Warrens Holes.mp4": {
    "mtime": 1764962456474440434,
    "performers": [
      "Jimmie Slater",
      "Billy Warren"
    ],
    "tags": []
  },
  "Jimmie Slater and Dek Reckless.mp4": {
    "mtime": 1764962450878536923,
    "performers": [
      "Dek Reckless",
      "Jimmie Slater"
    ],
    "tags": []
  },
  "Jimmy Standard and Matt Stevens Fuck.mp4": {
    "mtime": 1764962455514456985,
    "performers": [
      "Jimmy Standard",
      "Matt Stevens"
    ],
    "tags": []
  },
  "Jock Barebacks Older Muscle Dads at School feat Cole Blue Killian Knox Matthew Figata by Twink Top.mp4": {
    "mtime": 1764962466314270807,
    "performers": [
      "Cole Blue",
      "Killian Knox",
      "Matthew Figata"
    ],
    "tags": []
  },
  "Jock Has Bareback Anal Sex with Friends.mp4": {
    "mtime": 1764962460378373129,
    "performers": [],
    "tags": []
  },
  "Jock Kyler Drayke's Wild Ride on Hunk Beaux Matthews Hard Dick Bareback.mp4": {
    "mtime": 1764962458722401677,
    "performers": [
      "Beaux Matthews",
      "Kyler Drayke"
    ],
    "tags": []
  },
  "Jock Park.mp4": {
    "mtime": 1764962547280876858,
    "performers": [],
    "tags": []
  },
  "Jock Stepson Joins Hunk Stepdad and the Postman Threesome Michael Boston Wesley Woods.mp4": {
    "mtime": 1764957009627886839,
    "performers": [
      "Wesley Woods",
      "Boston Jock",
      "Michael Boston"
    ],
    "tags": []
  },
  "Jock Stepson Shoves His Monster Cock in Stepdad feat Matt Stevens.mp4": {
    "mtime": 1764962472914157061,
    "performers": [
      "Matt Stevens"
    ],
    "tags": []
  },
  "Jocks Fuck Hardcore Bareback After Scotch Ending in Creampie Brett Bradley.mp4": {
    "mtime": 1764962466110274323,
    "performers": [
      "Brett Bradley"
    ],
    "tags": []
  },
  "Jockstrap Jock Dolf Dietrich Sucked Off Before Raw Drilling.mp4": {
    "mtime": 1764962472254168435,
    "performers": [
      "Dolf Dietrich"
    ],
    "tags": []
  },
  "Joe Parker and Michael Roman.mp4": {
    "mtime": 1764962490325857085,
    "performers": [
      "Joe Parker",
      "Michael Roman"
    ],
    "tags": []
  },
  "Joel Someone Breeds Rhys Dylan.mp4": {
    "mtime": 1764962475126118944,
    "performers": [
      "Joel Someone",
      "Rhys Dylan"
    ],
    "tags": []
  },
  "Joel Someone Mormonboyz Priest Gets His Hole Destroyed by Fellow Clergymen.mp4": {
    "mtime": 1764962475314115705,
    "performers": [
      "Joel Someone"
    ],
    "tags": []
  },
  "Joel Someone Nate Stetson.mp4": {
    "mtime": 1764962476742091099,
    "performers": [
      "Joel Someone",
      "Nate Stetson"
    ],
    "tags": []
  },
  "Joel Someone Therapy Dick Step Siblings James and Zayne Bright Seem to Have an Odd Tension Towards Each Other.mp4": {
    "mtime": 1764962476738091168,
    "performers": [
      "Joel Someone",
      "Zayne Bright"
    ],
    "tags": []
  },
  "Joel Someone and Musclebear Montreal Bareback.mp4": {
    "mtime": 1764962473522146584,
    "performers": [
      "Joel Someone",
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Joel Someone and Nate Stetson Bareback by That Hole.mp4": {
    "mtime": 1764962474022137968,
    "performers": [
      "Joel Someone",
      "Nate Stetson"
    ],
    "tags": []
  },
  "Joey Dino and Ulizes Carpelli.mp4": {
    "mtime": 1764962478098067735,
    "performers": [
      "Ulizes Carpelli"
    ],
    "tags": []
  },
  "Joey Doves Blowjob.mp4": {
    "mtime": 1764962478298064289,
    "performers": [
      "Joey Doves"
    ],
    "tags": []
  },
  "Jogger and Policeman feat Chris Steele Michael Soldier.mp4": {
    "mtime": 1764962503813624815,
    "performers": [
      "Chris Steele"
    ],
    "tags": []
  },
  "John Magnum Daxx Carter Bareback.mp4": {
    "mtime": 1764962479894036791,
    "performers": [
      "Daxx Carter",
      "John Magnum"
    ],
    "tags": []
  },
  "Johnny Ford Greg Dixxon Flip Fuck in Jack of all Trades.mp4": {
    "mtime": 1764962481046016943,
    "performers": [
      "Johnny Ford",
      "Greg Dixxon"
    ],
    "tags": []
  },
  "Johnny Ford Logan Stevens.mp4": {
    "mtime": 1764962482385993858,
    "performers": [
      "Johnny Ford",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Johnny Hill Collin Simpson Muscular Ass Fucked by Handsome Bodybuilder Bareback.mp4": {
    "mtime": 1764962485341942935,
    "performers": [
      "Collin Simpson",
      "Johnny Hill"
    ],
    "tags": []
  },
  "Johnny Hill Dakota Payne Flip Fuck Bareback.mp4": {
    "mtime": 1764962487057913375,
    "performers": [
      "Johnny Hill",
      "Dakota Payne"
    ],
    "tags": []
  },
  "Johnny Hill and Pierce Paris Flip Fuck.mp4": {
    "mtime": 1764962484057965054,
    "performers": [
      "Johnny Hill",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Johnny Hunter Fucks Greg Riley.mp4": {
    "mtime": 1764962492469820159,
    "performers": [
      "Greg Riley"
    ],
    "tags": []
  },
  "Johnny Rapid Flip Fucks Silver Fox Matthew Figata.mp4": {
    "mtime": 1764962493005810927,
    "performers": [
      "Johnny Rapid",
      "Matthew Figata"
    ],
    "tags": []
  },
  "Johnny Rapid and Kyle Connor Flip Fuck Bareback.mp4": {
    "mtime": 1764962491941829252,
    "performers": [
      "Kyle Connor",
      "Johnny Rapid"
    ],
    "tags": []
  },
  "Jon Galt and Rikk York.mp4": {
    "mtime": 1764962493925795083,
    "performers": [
      "Jon Galt",
      "Rikk York"
    ],
    "tags": []
  },
  "Jon Phelps Part 3.mp4": {
    "mtime": 1764962514721437038,
    "performers": [
      "Jon Phelps"
    ],
    "tags": []
  },
  "Jon Phelps Slammed by Keiran Part 3 Gangbang.mp4": {
    "mtime": 1764962495369770215,
    "performers": [
      "Jon Phelps",
      "Keiran"
    ],
    "tags": []
  },
  "Jon Shield Cooper Roads Breeding.mp4": {
    "mtime": 1764962497977725303,
    "performers": [
      "Jon Shield"
    ],
    "tags": []
  },
  "Jon Shield and Cam Christou Bare.mp4": {
    "mtime": 1764962496817745279,
    "performers": [
      "Cam Christou",
      "Jon Shield"
    ],
    "tags": []
  },
  "Jonas Jackson and Antonio Velez Flip Fuck.mp4": {
    "mtime": 1764962519557353806,
    "performers": [
      "Antonio Velez",
      "Jonas Jackson"
    ],
    "tags": []
  },
  "Jonas Jackson and Craig Marks Flip Fuck.mp4": {
    "mtime": 1764962504993604499,
    "performers": [
      "Craig Marks",
      "Jonas Jackson"
    ],
    "tags": []
  },
  "Jonas Jackson and Tommy Sparks.mp4": {
    "mtime": 1764962529001191298,
    "performers": [
      "Jonas Jackson"
    ],
    "tags": []
  },
  "Jonas Jackson in the Bedroom with a Friend Bareback.mp4": {
    "mtime": 1764962515889416935,
    "performers": [
      "Jonas Jackson"
    ],
    "tags": []
  },
  "Jordan Fucks a Straight Guy at Find Tube.mp4": {
    "mtime": 1764962547308876377,
    "performers": [],
    "tags": []
  },
  "Jordan Starr and Adam Gray Flip Fuck.mp4": {
    "mtime": 1764962521213325308,
    "performers": [
      "Adam Gray",
      "Jordan Starr"
    ],
    "tags": []
  },
  "Jordi Massive Brock Bailey and Bearded Bear Man Threeway Bareback.mp4": {
    "mtime": 1764962524057276367,
    "performers": [
      "Brock Bailey",
      "Jordi Massive"
    ],
    "tags": []
  },
  "Jordi Massive Gunnar Gates Alex Powers and Heights Hounds Hotel Inferno.mp4": {
    "mtime": 1764962528009208366,
    "performers": [
      "Alex Powers",
      "Gunnar Gates",
      "Jordi Massive"
    ],
    "tags": []
  },
  "Jordi Massive and Matthew Figata.mp4": {
    "mtime": 1764962522585301697,
    "performers": [
      "Jordi Massive",
      "Matthew Figata"
    ],
    "tags": []
  },
  "Jordi Massive fucks Brody Fox.mp4": {
    "mtime": 1764962525213256475,
    "performers": [
      "Brody Fox",
      "Jordi Massive"
    ],
    "tags": []
  },
  "Jordi Massive fucks Matt Stevens.mp4": {
    "mtime": 1764962526589232799,
    "performers": [
      "Jordi Massive",
      "Matt Stevens"
    ],
    "tags": []
  },
  "Josh Brady and Chris Damned Flip Fuck.mp4": {
    "mtime": 1764962538769023257,
    "performers": [
      "Chris Damned",
      "Josh Brady"
    ],
    "tags": []
  },
  "Josh Kole and Matthew Ford Condom Vintage.mp4": {
    "mtime": 1764962547080880298,
    "performers": [
      "Josh Kole",
      "Matthew Ford"
    ],
    "tags": []
  },
  "Julian Torres Getting Railed by Andy Onassis Part 1.mp4": {
    "mtime": 1764962539881004130,
    "performers": [
      "Andy Onassis",
      "Julian Torres"
    ],
    "tags": []
  },
  "Junior's Nude Cleaning Service Ray Catalina.mp4": {
    "mtime": 1764962541704972757,
    "performers": [],
    "tags": []
  },
  "Junk In The Trunk Scene 3 Jarrod James and Crush Daddy.mp4": {
    "mtime": 1764962542860952874,
    "performers": [
      "Crush Daddy",
      "Jarrod James"
    ],
    "tags": []
  },
  "Justin Matthews Carter Woods Next Door Taboo Creepy Stepbrother Caught Checking Out Bareback.mp4": {
    "mtime": 1764962543920934643,
    "performers": [
      "Carter Woods",
      "Justin Matthews"
    ],
    "tags": []
  },
  "Kaden Hylls and Cole Connor Flip Fuck.mp4": {
    "mtime": 1764962545124913936,
    "performers": [
      "Cole Connor",
      "Kaden Hylls"
    ],
    "tags": []
  },
  "Killian Knox Angel Ventura Muscular Power and An Ass To Be Fucked Bareback.mp4": {
    "mtime": 1764962548924848587,
    "performers": [
      "Angel Ventura",
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Brody Fox.mp4": {
    "mtime": 1764962549484838957,
    "performers": [
      "Brody Fox",
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Can't Resist Sean Duran.mp4": {
    "mtime": 1764962549300842121,
    "performers": [
      "Killian Knox",
      "Sean Duran"
    ],
    "tags": []
  },
  "Killian Knox Clay Towers Jacob Woods.mp4": {
    "mtime": 1764962550912814401,
    "performers": [
      "Clay Towers",
      "Jacob Woods",
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Flip Fucks Cole Connor the Territory.mp4": {
    "mtime": 1764962551020812544,
    "performers": [
      "Cole Connor",
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Fucks Jacks Hot Hole.mp4": {
    "mtime": 1764962551108811031,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Gets Railed.mp4": {
    "mtime": 1764962551708800713,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Home From Work Early.mp4": {
    "mtime": 1764962553344772582,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Johnny Bandera Young Latino Teen Stepson and Hunk Stepdad Ride Each Other Bareback.mp4": {
    "mtime": 1764962552956779254,
    "performers": [
      "Killian Knox",
      "Johnny Bandera"
    ],
    "tags": []
  },
  "Killian Knox Roman Todd Almost Caught Barebacking Ripped Stranger in Public Office.mp4": {
    "mtime": 1764962553500769900,
    "performers": [
      "Roman Todd",
      "Killian Knox"
    ],
    "tags": []
  },
  "Killian Knox Sean Harding Fucks His Boyfriend Hard at the Glory Hole Bareback.mp4": {
    "mtime": 1764962553872763504,
    "performers": [
      "Killian Knox",
      "Sean Harding"
    ],
    "tags": []
  },
  "Killian Knox and Leo Silva.mp4": {
    "mtime": 1764962547008881536,
    "performers": [
      "Killian Knox",
      "Leo Silva"
    ],
    "tags": []
  },
  "Killian Knox and Rhys Dylan Flip Fuck.mp4": {
    "mtime": 1764962548924848587,
    "performers": [
      "Killian Knox",
      "Rhys Dylan"
    ],
    "tags": []
  },
  "Kilo Liam Flip Fucking Pup Gryphon Ashe.mp4": {
    "mtime": 1764962600727958310,
    "performers": [
      "Gryphon Ashe",
      "Pup Kilo"
    ],
    "tags": []
  },
  "Kinky Men Brian Davila and Sir Jet Raw Fuck Bareback That Hole.mp4": {
    "mtime": 1764962569304498212,
    "performers": [
      "Sir Jet",
      "Brian Davilla"
    ],
    "tags": []
  },
  "Kit King.mp4": {
    "mtime": 1764962573372428296,
    "performers": [],
    "tags": []
  },
  "Kristofer Weston Bishop Gibson Atonement Peter Marcus.mp4": {
    "mtime": 1764962555532734962,
    "performers": [
      "Kristofer Weston",
      "Peter Marcus"
    ],
    "tags": []
  },
  "Kyle Fox fucks Angel Frontera Raw Fuck Club.mp4": {
    "mtime": 1764962601891938319,
    "performers": [
      "Angel Frontera",
      "Kyle Fox"
    ],
    "tags": []
  },
  "Kyle King and Jake Deckard.mp4": {
    "mtime": 1764962588224173095,
    "performers": [
      "Jake Deckard",
      "Kyle King"
    ],
    "tags": []
  },
  "Kyle Savage and Clark Longhammer.mp4": {
    "mtime": 1764962586876196254,
    "performers": [
      "Kyle Savage"
    ],
    "tags": []
  },
  "Kyle Savage and Preston Johnson.mp4": {
    "mtime": 1764962602315931037,
    "performers": [
      "Kyle Savage",
      "Preston Johnson"
    ],
    "tags": []
  },
  "Kyle Steele Goes Ass Up On The Bed For His Stepuncle Reece Scott.mp4": {
    "mtime": 1764962589568150006,
    "performers": [
      "Kyle Steele",
      "Reece Scott"
    ],
    "tags": []
  },
  "Kyle Steele Knows A Sexy Way To Get Rid Of His Stepuncle's Stress Bareback.mp4": {
    "mtime": 1764962590852127948,
    "performers": [
      "Kyle Steele"
    ],
    "tags": []
  },
  "Langley Gold Lays Some Pipe in Vin Roxx's Ass.mp4": {
    "mtime": 1764962602291931449,
    "performers": [
      "Vin Roxx",
      "Langley Gold"
    ],
    "tags": []
  },
  "Large Andy Onassis Victor D'Angelo.mp4": {
    "mtime": 1764962601943937426,
    "performers": [
      "Victor D'Angelo",
      "Andy Onassis"
    ],
    "tags": []
  },
  "Late Recruit Must Appease Major's Hungry Cock Active Duty Trevor Laster.mp4": {
    "mtime": 1764962604039901429,
    "performers": [
      "Trevor Laster"
    ],
    "tags": []
  },
  "Late for Work Killian Knox.mp4": {
    "mtime": 1764962603631908436,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Latin Homosexual Flip Fuck and Semen Flow.mp4": {
    "mtime": 1764962604239897994,
    "performers": [],
    "tags": []
  },
  "Latino Alessio Romero Bred by Dolf Dietrich Bareback That Hole.mp4": {
    "mtime": 1764962610175796060,
    "performers": [
      "Alessio Romero",
      "Dolf Dietrich"
    ],
    "tags": []
  },
  "Latino Romeo Davis Barebacks Bobby Bruiser Bareback That Hole.mp4": {
    "mtime": 1764962612103762954,
    "performers": [
      "Romeo Davis"
    ],
    "tags": []
  },
  "Laundry Raw Fantasy Nicholas Bardem.mp4": {
    "mtime": 1764962625435534073,
    "performers": [
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "Lawson James Hairy Hole Rimmed by Player Grant Ducati.mp4": {
    "mtime": 1764962611787768380,
    "performers": [
      "Lawson James",
      "Grant Ducati"
    ],
    "tags": []
  },
  "Lawson James and Brody Meyer.mp4": {
    "mtime": 1764962605907869350,
    "performers": [
      "Brody Meyer",
      "Lawson James"
    ],
    "tags": []
  },
  "Lawson James and Sir Peter.mp4": {
    "mtime": 1764962607155847918,
    "performers": [
      "Lawson James",
      "Sir Peter"
    ],
    "tags": []
  },
  "Lean Studs with Flawless Bodies Having Sex Outdoors.mp4": {
    "mtime": 1764962615775699907,
    "performers": [],
    "tags": []
  },
  "Leander Tell Me Where It Hurts.mp4": {
    "mtime": 1764962613671736032,
    "performers": [
      "Leander"
    ],
    "tags": []
  },
  "Legrand Wolf and Dallas Steele Share Austin Young by Twink Top.mp4": {
    "mtime": 1764962613355741457,
    "performers": [
      "Dallas Steele",
      "Legrand Wolf"
    ],
    "tags": []
  },
  "Leo Bacchus Flip Fucks with Colby Melvin.mp4": {
    "mtime": 1764962645155195647,
    "performers": [
      "Colby Melvin",
      "Leo Bacchus"
    ],
    "tags": []
  },
  "Leo Giamani and Jeremy Bilding Bang Park Wiley.mp4": {
    "mtime": 1764962615527704165,
    "performers": [
      "Leo Giamani",
      "Park Wiley"
    ],
    "tags": []
  },
  "Leo Grin Angel Frontera Flip Fuck.mp4": {
    "mtime": 1764962617187675665,
    "performers": [
      "Angel Frontera",
      "Leo Grin"
    ],
    "tags": []
  },
  "Leo Grin Angel Frontera and Ruben Martinez Raw Fuck Club.mp4": {
    "mtime": 1764962617107677039,
    "performers": [
      "Angel Frontera",
      "Leo Grin"
    ],
    "tags": []
  },
  "Leo Yankho Milan Gamiani Flip Fuck Big Cock.mp4": {
    "mtime": 1764962627851492603,
    "performers": [
      "Milan Gamiani",
      "Leo Yankho"
    ],
    "tags": []
  },
  "Let Me in Dude I'll Let You Bareback My Bubble Butt feat Sean Maygers by Next Door Raw.mp4": {
    "mtime": 1764962618519652797,
    "performers": [
      "Sean Maygers"
    ],
    "tags": []
  },
  "Liam Worships Davin.mp4": {
    "mtime": 1764962619823630411,
    "performers": [],
    "tags": []
  },
  "Licking and Breeding Coach's Manhole.mp4": {
    "mtime": 1764962626199520959,
    "performers": [],
    "tags": []
  },
  "Lito Cruz And Matteo Valentine Anal.mp4": {
    "mtime": 1764962626603514025,
    "performers": [
      "Lito Cruz",
      "Matteo Valentine"
    ],
    "tags": []
  },
  "Lito Cruz Cam Fuck.mp4": {
    "mtime": 1764962627151504618,
    "performers": [
      "Lito Cruz"
    ],
    "tags": []
  },
  "Live Cam Fuck Show Ryan Chad.mp4": {
    "mtime": 1764962627591497066,
    "performers": [],
    "tags": []
  },
  "Loaded Dawson's Cream Pie.mp4": {
    "mtime": 1764962628651478872,
    "performers": [
      "Dawson"
    ],
    "tags": []
  },
  "Loaded Muscle Fuck.mp4": {
    "mtime": 1764962629715460609,
    "performers": [],
    "tags": []
  },
  "Loaded Outdoor Threesome Cain Marko.mp4": {
    "mtime": 1764962629595462669,
    "performers": [
      "Cain Marko"
    ],
    "tags": []
  },
  "Locker Room Lust.mp4": {
    "mtime": 1764953628100568554,
    "performers": [],
    "tags": []
  },
  "Logan Gets Fucked by Latino Plumber Alessio Men Over 30.mp4": {
    "mtime": 1764962646839166754,
    "performers": [],
    "tags": []
  },
  "Logan Stevens Donnie Argento a Gentlemen's Club Revisited in a Form Bareback.mp4": {
    "mtime": 1764962651719083030,
    "performers": [
      "Donnie Argento",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens Flip Fuck Bareback.mp4": {
    "mtime": 1764962652747065394,
    "performers": [
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens Sean Maygers Bareback.mp4": {
    "mtime": 1764962653239056954,
    "performers": [
      "Logan Stevens",
      "Sean Maygers"
    ],
    "tags": []
  },
  "Logan Stevens and Alessio Romero.mp4": {
    "mtime": 1764962631191435276,
    "performers": [
      "Alessio Romero",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens and Diego Daniels Massage Flip Fuck Amateur.mp4": {
    "mtime": 1764962631687426763,
    "performers": [
      "Diego Daniels",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens and Donnie Argento at Macho Tube.mp4": {
    "mtime": 1764962632151418800,
    "performers": [
      "Donnie Argento",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens and Hayden Harding Flip Fuck.mp4": {
    "mtime": 1764962650299107391,
    "performers": [
      "Logan Stevens",
      "Hayden Harding"
    ],
    "tags": []
  },
  "Logan Stevens and Jessy Karson Amateur Bareback.mp4": {
    "mtime": 1764962657638981475,
    "performers": [
      "Jessy Karson",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens and Johnny Ford Having Bareback Anal on Their Workplace.mp4": {
    "mtime": 1764962649423122420,
    "performers": [
      "Johnny Ford",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Stevens and Roman Mercury.mp4": {
    "mtime": 1764962648143144381,
    "performers": [
      "Logan Stevens",
      "Roman Mercury"
    ],
    "tags": []
  },
  "Logan Stevens and Ryan Cummings at Macho Tube.mp4": {
    "mtime": 1764962649591119538,
    "performers": [
      "Logan Stevens",
      "Ryan Cummings"
    ],
    "tags": []
  },
  "Logan Stevens and Teddy Bear at Macho Tube.mp4": {
    "mtime": 1764962650935096480,
    "performers": [
      "Logan Stevens",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Logan Stevens and Yuri Bareback.mp4": {
    "mtime": 1764962664686860587,
    "performers": [
      "Logan Stevens"
    ],
    "tags": []
  },
  "Logan Vaughn and Rich Kelly Fuck Each Other Condom.mp4": {
    "mtime": 1764962656874994581,
    "performers": [
      "Logan Vaughn"
    ],
    "tags": []
  },
  "London Girth Plus Breeds Jack Wolf.mp4": {
    "mtime": 1764962698918273676,
    "performers": [
      "Jack Wolf"
    ],
    "tags": []
  },
  "London Raw Slam Party Bareback.mp4": {
    "mtime": 1764962658138972899,
    "performers": [],
    "tags": []
  },
  "Lost Dads.mp4": {
    "mtime": 1764962701226234119,
    "performers": [],
    "tags": []
  },
  "Lucas Entertainment Rafael Lords and Sergeant Miles Suck and Fuck Bareback.mp4": {
    "mtime": 1764962659526949090,
    "performers": [
      "Rafael Lords",
      "Sergeant Miles"
    ],
    "tags": []
  },
  "Luke Has His Tongue Deep in Not Stepdad's Hole feat Josh Peters.mp4": {
    "mtime": 1764962666438830539,
    "performers": [],
    "tags": []
  },
  "Lustful Public Fuck.mp4": {
    "mtime": 1764962666066836919,
    "performers": [],
    "tags": []
  },
  "Lusty Non-Professional Butthole and Cumshot.mp4": {
    "mtime": 1764962667546811536,
    "performers": [],
    "tags": []
  },
  "Mack and Jesse Both Ways.mp4": {
    "mtime": 1764962668230799806,
    "performers": [],
    "tags": []
  },
  "Making a Deposit.mp4": {
    "mtime": 1764962678942616118,
    "performers": [],
    "tags": []
  },
  "Male Gets a Big Dick up His Tight Ass Raw.mp4": {
    "mtime": 1764962676354660493,
    "performers": [],
    "tags": []
  },
  "Man Up Films Colby Jansen and Lance Hart Wake Twink with Their Cocks.mp4": {
    "mtime": 1764962677418642249,
    "performers": [
      "Colby Jansen",
      "Lance Hart"
    ],
    "tags": []
  },
  "Manhandled Worship Anthony London and Christopher Daniels.mp4": {
    "mtime": 1764962679462607202,
    "performers": [
      "Christopher Daniels",
      "Anthony London"
    ],
    "tags": []
  },
  "Manuel Skye Markus Kage Fun Time.mp4": {
    "mtime": 1764962681006580729,
    "performers": [
      "Manuel Skye",
      "Markus Kage"
    ],
    "tags": []
  },
  "Manuel Skye and Heath Halo Fuck Reach Around.mp4": {
    "mtime": 1764962680214594309,
    "performers": [
      "Heath Halo",
      "Manuel Skye"
    ],
    "tags": []
  },
  "Marco Napoli Caulk Job.mp4": {
    "mtime": 1764962682866548840,
    "performers": [
      "Marco Napoli"
    ],
    "tags": []
  },
  "Marco Napoli Fucked Perp Dick.mp4": {
    "mtime": 1764962688614450297,
    "performers": [
      "Marco Napoli"
    ],
    "tags": []
  },
  "Marco Napoli Isaac X Head Contractor Chris Damned Joins Hunks in the Pounding Bareback.mp4": {
    "mtime": 1764962689986426778,
    "performers": [
      "Chris Damned",
      "Isaac X",
      "Marco Napoli"
    ],
    "tags": []
  },
  "Marco Napoli Joel Someone and Parker Allen Daddy.mp4": {
    "mtime": 1764962691406402436,
    "performers": [
      "Joel Someone",
      "Marco Napoli",
      "Parker Allen"
    ],
    "tags": []
  },
  "Marco Napoli and Danny Wyatt Flip Fuck.mp4": {
    "mtime": 1764962692566382552,
    "performers": [
      "Danny Wyatt",
      "Marco Napoli"
    ],
    "tags": []
  },
  "Marco Polo American Bareback Sir Peter.mp4": {
    "mtime": 1764962692766379123,
    "performers": [
      "Sir Peter"
    ],
    "tags": []
  },
  "Marcus Isaacs and Drew Sumrok.mp4": {
    "mtime": 1764962694134355674,
    "performers": [
      "Drew Sumrok",
      "Marcus Isaacs"
    ],
    "tags": []
  },
  "Marcus Isaacs and Logan Stevens at Macho Tube.mp4": {
    "mtime": 1764962694294352932,
    "performers": [
      "Logan Stevens",
      "Marcus Isaacs"
    ],
    "tags": []
  },
  "Marek Tanker and Bruce Ford Bareback.mp4": {
    "mtime": 1764962695726328386,
    "performers": [
      "Bruce Ford"
    ],
    "tags": []
  },
  "Mario Galeno Guido Stahl Bottom Daddy Is So Hot.mp4": {
    "mtime": 1764962696966307133,
    "performers": [
      "Guido Stahl",
      "Mario Galeno"
    ],
    "tags": []
  },
  "Mario Galeno and Matt Ellis Outdoor Pounding.mp4": {
    "mtime": 1764962703646192645,
    "performers": [
      "Mario Galeno"
    ],
    "tags": []
  },
  "Mark Lax Kev Inspiring and Girth Brooks Have a Threesome.mp4": {
    "mtime": 1764962698118287388,
    "performers": [
      "Girth Brooks",
      "Kev Inspiring",
      "Mark Lax"
    ],
    "tags": []
  },
  "Mark Long Dante Colle Boss Catches Workers Fucking on the Farm Bareback.mp4": {
    "mtime": 1764962699322266752,
    "performers": [
      "Dante",
      "Dante Colle",
      "Mark Long"
    ],
    "tags": []
  },
  "Markie More Austin Andrews Flip Fuck.mp4": {
    "mtime": 1764962700422247899,
    "performers": [
      "Austin Andrews",
      "Markie More"
    ],
    "tags": []
  },
  "Markie More Johnny Hill Proves His Manhood by Taking Dick Bareback.mp4": {
    "mtime": 1764962700514246322,
    "performers": [
      "Johnny Hill",
      "Markie More"
    ],
    "tags": []
  },
  "Markus Kage Thyle Knoxx.mp4": {
    "mtime": 1764962701830223768,
    "performers": [
      "Markus Kage",
      "Thyle Knoxx"
    ],
    "tags": []
  },
  "Markus Kage and Alex Mecum.mp4": {
    "mtime": 1764962701814224042,
    "performers": [
      "Alex Mecum",
      "Markus Kage"
    ],
    "tags": []
  },
  "Married Guy Gets Fucked and Jizzed feat Preston Steel.mp4": {
    "mtime": 1764962702426213553,
    "performers": [
      "Preston Steel"
    ],
    "tags": []
  },
  "Mason Has His Ass Stuffed in the Bathroom by Jake Morgan Raw Dads.mp4": {
    "mtime": 1764962703230199774,
    "performers": [
      "Jake Morgan"
    ],
    "tags": []
  },
  "Masqulin Athletic Orson Deane and Troy Daniels Bareback.mp4": {
    "mtime": 1764962703774190451,
    "performers": [
      "Orson Deane",
      "Troy Daniels"
    ],
    "tags": []
  },
  "Masqulin Bearded Inked Markus Kage Barebacked by Alex Mecum Bareback.mp4": {
    "mtime": 1764962703838189354,
    "performers": [
      "Alex Mecum",
      "Markus Kage"
    ],
    "tags": []
  },
  "Masqulin Bro's Dirty Secret Shared Jizz Markus Kage Igor Romani.mp4": {
    "mtime": 1764962707034134584,
    "performers": [
      "Igor Romani",
      "Markus Kage"
    ],
    "tags": []
  },
  "Masqulin Hooking Up Gabriel Clark Travis Connor.mp4": {
    "mtime": 1764962705590159329,
    "performers": [
      "Gabriel Clark",
      "Travis Connor"
    ],
    "tags": []
  },
  "Masqulin Manuel Skye and Shane Jackson Bareback in Threesome.mp4": {
    "mtime": 1764962705994152406,
    "performers": [
      "Manuel Skye",
      "Shane Jackson"
    ],
    "tags": []
  },
  "Masqulin Muscular Hunks Alex Mecum and Pierce Paris Bareback.mp4": {
    "mtime": 1764962705886154257,
    "performers": [
      "Alex Mecum",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Masqulin Nic Sahara Raw Fucked by Pierce Paris and JJ Knight.mp4": {
    "mtime": 1764962709214097226,
    "performers": [
      "JJ Knight",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Masqulin Studs Logan Moore and Scott Miller Bareback.mp4": {
    "mtime": 1764962707854120532,
    "performers": [
      "Logan Moore",
      "Scott Miller"
    ],
    "tags": []
  },
  "Masqulin Tall Stud Pierce Paris Raw Breeds Inked Markus Kage Bareback.mp4": {
    "mtime": 1764962707710122999,
    "performers": [
      "Markus Kage",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Masqulin Tattooed Hunk Ryan Bones Breeds Jeremy London Bareback.mp4": {
    "mtime": 1764953617008756037,
    "performers": [
      "Jeremy London",
      "Ryan Bones"
    ],
    "tags": []
  },
  "Massage Ends with Steamy Muscle Jocks Having Bareback Sex.mp4": {
    "mtime": 1764962711346060693,
    "performers": [],
    "tags": []
  },
  "Massage Gay Table Luke Ward's Fiery Fuck Fest with Ryan Cage in the Woods.mp4": {
    "mtime": 1764962711142064189,
    "performers": [],
    "tags": []
  },
  "Masseur Surprised His Client Cameron Dalile Dante Colle.mp4": {
    "mtime": 1764962709194097569,
    "performers": [
      "Cameron Dalile",
      "Dante",
      "Dante Colle"
    ],
    "tags": []
  },
  "Master and Disciple Twink.mp4": {
    "mtime": 1764962710426076458,
    "performers": [],
    "tags": []
  },
  "Masturbation Station Kurtis Wolfe Dante Colle Cris Knight Bareback Bastards.mp4": {
    "mtime": 1764962710526074744,
    "performers": [
      "Cris Knight",
      "Dante",
      "Dante Colle",
      "Kurtis Wolfe"
    ],
    "tags": []
  },
  "Masturbation Station.mp4": {
    "mtime": 1764962823628452405,
    "performers": [],
    "tags": []
  },
  "Mateo Tomas Bottoms for Sir Peter.mp4": {
    "mtime": 1764962758405254648,
    "performers": [
      "Mateo Tomas",
      "Sir Peter"
    ],
    "tags": []
  },
  "Matt Sizemore Anthony Todds and Ben Venido Bareback.mp4": {
    "mtime": 1764962759805230679,
    "performers": [
      "Anthony Todds",
      "Ben Venido",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore Chris Kohl Sucking Each Others Dicks.mp4": {
    "mtime": 1764962763993158981,
    "performers": [
      "Matt Sizemore",
      "Chris Kohl"
    ],
    "tags": []
  },
  "Matt Sizemore Drew Sumrok and Sage Daniels Bareback.mp4": {
    "mtime": 1764962799560736906,
    "performers": [
      "Drew Sumrok",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore Patrick O'Connor and Ross X.mp4": {
    "mtime": 1764962775573015232,
    "performers": [
      "Matt Sizemore",
      "Patrick O'Connor",
      "Ross X"
    ],
    "tags": []
  },
  "Matt Sizemore Ray Dalton and Mason Garrett Bareback.mp4": {
    "mtime": 1764962797488761156,
    "performers": [
      "Ray Dalton",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Anthony Todds Bareback.mp4": {
    "mtime": 1764962732257702428,
    "performers": [
      "Anthony Todds",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Antonio Biaggi Bareback.mp4": {
    "mtime": 1764962728581765396,
    "performers": [
      "Antonio Biaggi",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Bill Marlowe Bareback.mp4": {
    "mtime": 1764962743497509920,
    "performers": [
      "Bill Marlowe",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Jay Hernandez Raw Fuck Club Bareback.mp4": {
    "mtime": 1764962744961484849,
    "performers": [
      "Jay Hernandez",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Kyle Savage Breed Me Raw.mp4": {
    "mtime": 1764962744757488342,
    "performers": [
      "Kyle Savage",
      "Matt Sizemore"
    ],
    "tags": []
  },
  "Matt Sizemore and Preston Johnson Bareback.mp4": {
    "mtime": 1764962773921034202,
    "performers": [
      "Matt Sizemore",
      "Preston Johnson"
    ],
    "tags": []
  },
  "Matt Sizemore and Sam Crockett Bareback.mp4": {
    "mtime": 1764962746561457449,
    "performers": [
      "Matt Sizemore",
      "Sam Crockett"
    ],
    "tags": []
  },
  "Matt Sizemore and Tommy Coxx Bareback.mp4": {
    "mtime": 1764962783640922219,
    "performers": [
      "Matt Sizemore",
      "Tommy Coxx"
    ],
    "tags": []
  },
  "Matt Stevens Brock Rustin and Jeff Kendall Bareback.mp4": {
    "mtime": 1764962825112434697,
    "performers": [
      "Jeff Kendall",
      "Matt Stevens"
    ],
    "tags": []
  },
  "Matt Stevens and Saxon West by Bareback That Hole.mp4": {
    "mtime": 1764962784680910185,
    "performers": [
      "Matt Stevens",
      "Saxon West"
    ],
    "tags": []
  },
  "Matthew Figata and Jarren Sofa Fuck.mp4": {
    "mtime": 1764962799012743324,
    "performers": [
      "Matthew Figata"
    ],
    "tags": []
  },
  "Matthew Figata and Johnny Rapid.mp4": {
    "mtime": 1764962800372727391,
    "performers": [
      "Johnny Rapid",
      "Matthew Figata"
    ],
    "tags": []
  },
  "Mature Bears.mp4": {
    "mtime": 1764962802272705106,
    "performers": [],
    "tags": []
  },
  "Mature Coach Breeds Ace Banner.mp4": {
    "mtime": 1764962808204635320,
    "performers": [
      "Ace Banner"
    ],
    "tags": []
  },
  "Mature Coach Takes a Huge Sports Jock Cock Bareback Twinks On Top.mp4": {
    "mtime": 1764962810524607940,
    "performers": [],
    "tags": []
  },
  "Mature Daddy Gets Fucked by Hunk Dick Twink Icon Male.mp4": {
    "mtime": 1764962809204623524,
    "performers": [],
    "tags": []
  },
  "Mature Daddy Has a Wild Threesome with Studs and Loves It.mp4": {
    "mtime": 1764962818712510931,
    "performers": [],
    "tags": []
  },
  "Mature Gives Blowjob Before Being Barebacked Missionary.mp4": {
    "mtime": 1764962817904520531,
    "performers": [],
    "tags": []
  },
  "Mature Hunk Seduces and Fucks Him Outdoors Troy Daniels David Anthony.mp4": {
    "mtime": 1764962823628452405,
    "performers": [
      "Troy Daniels"
    ],
    "tags": []
  },
  "Mature and His Hairy Cub Have Hardcore Fuck Session.mp4": {
    "mtime": 1764962804964673476,
    "performers": [],
    "tags": []
  },
  "Max Born Barebacked by Drago Lambert.mp4": {
    "mtime": 1764962827156410275,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born Barebacks Geoffrey Lloyd.mp4": {
    "mtime": 1764962828192397883,
    "performers": [
      "Max Born",
      "Geoffrey Lloyd"
    ],
    "tags": []
  },
  "Max Born Barebacks Tom Friedel.mp4": {
    "mtime": 1764962828740391324,
    "performers": [
      "Max Born",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Max Born Barebacks Vann Morris.mp4": {
    "mtime": 1764953576453438949,
    "performers": [
      "Max Born",
      "Vann Morris"
    ],
    "tags": []
  },
  "Max Born Gets Rubbed Tugged and Barebacked by Dickie.mp4": {
    "mtime": 1764953582357339793,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born Gets Rubbed Tugged and Barebacked by Ennui.mp4": {
    "mtime": 1764953576021446201,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born Thomas Friedl Third Date Sex.mp4": {
    "mtime": 1764962830912365304,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born Thomas Ride.mp4": {
    "mtime": 1764953577829415848,
    "performers": [
      "Max Born",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Max Born and Diego Fucking in a Secluded Spot.mp4": {
    "mtime": 1764962825612428726,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born and John Decker.mp4": {
    "mtime": 1764962828796390654,
    "performers": [
      "John Decker",
      "Max Born"
    ],
    "tags": []
  },
  "Max Born and John Hill Barebacking Like Crazy in Public.mp4": {
    "mtime": 1764962828096399032,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Max Born and Paul Fresh Bareback.mp4": {
    "mtime": 1764962826696415774,
    "performers": [
      "Max Born",
      "Paul Fresh"
    ],
    "tags": []
  },
  "Max Hilton and Colby Keller Kaboom.mp4": {
    "mtime": 1764962829924377146,
    "performers": [
      "Colby Keller",
      "Max Hilton"
    ],
    "tags": []
  },
  "Max Romano Flip Fucks Lars Larson.mp4": {
    "mtime": 1764962832892341549,
    "performers": [
      "Lars Larson",
      "Max Romano"
    ],
    "tags": []
  },
  "Max Romano Hairy Muscle Bear Dicks Down Bearded Stud.mp4": {
    "mtime": 1764962830776366934,
    "performers": [
      "Max Romano"
    ],
    "tags": []
  },
  "Max Romano Muscle Bear Flip Fucks Bearded Hottie Big Cock by Chaos Men.mp4": {
    "mtime": 1764962831392359548,
    "performers": [
      "Max Romano"
    ],
    "tags": []
  },
  "Mega Fucked Bareback Andy Onassis Halif Faru.mp4": {
    "mtime": 1764962840864245569,
    "performers": [
      "Andy Onassis"
    ],
    "tags": []
  },
  "Men Dot Com Projector Room Anal with Dann Grey and Andy Onassis.mp4": {
    "mtime": 1764962840280252618,
    "performers": [
      "Andy Onassis"
    ],
    "tags": []
  },
  "Men Got Daddy John Magnum and Jake Porter.mp4": {
    "mtime": 1764962834652320405,
    "performers": [
      "Jake Porter",
      "John Magnum"
    ],
    "tags": []
  },
  "Men Got Daddy Part 1 Lance Hart.mp4": {
    "mtime": 1764962835716307610,
    "performers": [
      "Lance Hart"
    ],
    "tags": []
  },
  "Men Got Daddy Part 2 Dean Phoenix.mp4": {
    "mtime": 1764962837132290568,
    "performers": [
      "Dean Phoenix"
    ],
    "tags": []
  },
  "Men Got Daddy Part 3 Ryan Bones.mp4": {
    "mtime": 1764962837336288111,
    "performers": [
      "Ryan Bones"
    ],
    "tags": []
  },
  "Men Got Daddy Part 4 Myles Landon.mp4": {
    "mtime": 1764958611163723391,
    "performers": [
      "Myles Landon"
    ],
    "tags": []
  },
  "Men Got Daddy Part 5 John Magnum.mp4": {
    "mtime": 1764958610883727993,
    "performers": [
      "John Magnum"
    ],
    "tags": []
  },
  "Men Locker Room Fuck Travis Connor Ryan Bailey Bareback.mp4": {
    "mtime": 1764958611291721287,
    "performers": [
      "Ryan Bailey",
      "Travis Connor"
    ],
    "tags": []
  },
  "Men Over 30 Eddie Patrick Brody Meyer It's Been Too Long.mp4": {
    "mtime": 1764958612503701363,
    "performers": [
      "Brody Meyer",
      "Eddie Patrick"
    ],
    "tags": []
  },
  "Men Over 30 Eddie Patrick and Brody Meyer Get to Expand Ass.mp4": {
    "mtime": 1764958612955693933,
    "performers": [
      "Brody Meyer",
      "Eddie Patrick"
    ],
    "tags": []
  },
  "Men Over 30 Hot Older Have Shower Sex After Workout Bareback feat Tristan Brazer.mp4": {
    "mtime": 1764958621103559975,
    "performers": [
      "Tristan Brazer"
    ],
    "tags": []
  },
  "Men Over 30 Killian Knox and Joseph Hart Go Hard on Each Other.mp4": {
    "mtime": 1764958620283573457,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Men Over 30 Marco Napoli and Eddie Patrick Are All About That Sexy Service.mp4": {
    "mtime": 1764958621391555239,
    "performers": [
      "Eddie Patrick",
      "Marco Napoli"
    ],
    "tags": []
  },
  "Men Over 30 Outstanding Anal with Eddie Patrick and Beaux Matthews.mp4": {
    "mtime": 1764953584221308469,
    "performers": [
      "Beaux Matthews",
      "Eddie Patrick"
    ],
    "tags": []
  },
  "Men Over 30 Sean Duran Has Two Hunks at Once.mp4": {
    "mtime": 1764958614207673351,
    "performers": [
      "Sean Duran"
    ],
    "tags": []
  },
  "Men Over 30 Sexy Muscle Hunk Sean Duran Michael Roman.mp4": {
    "mtime": 1764958615379654084,
    "performers": [
      "Michael Roman",
      "Sean Duran"
    ],
    "tags": []
  },
  "Men Presley Scott Gets Turned on After Touching a Boxers Big Dick Sucking Fucking Doggy Style.mp4": {
    "mtime": 1764958616535635079,
    "performers": [
      "Presley Scott"
    ],
    "tags": []
  },
  "Men Skipping Dinner Uncut Finn Harding Jeremy London Travis Connor Malik Delgaty.mp4": {
    "mtime": 1764958617879612983,
    "performers": [
      "Finn Harding",
      "Malik Delgaty",
      "Jeremy London",
      "Travis Connor"
    ],
    "tags": []
  },
  "Men Troye Dean Jake Preston Greg Dixxon Fratboys Shenanigans Part 1.mp4": {
    "mtime": 1764958618959595226,
    "performers": [
      "Greg Dixxon",
      "Jake Preston",
      "Troye Dean"
    ],
    "tags": []
  },
  "Men at Play Classy Jonas Jackson and Kayden Gray.mp4": {
    "mtime": 1764962835680308043,
    "performers": [
      "Jonas Jackson"
    ],
    "tags": []
  },
  "Men at Play Daddy Want 4 Dimitri Venum and Leo Adonis.mp4": {
    "mtime": 1764962832868341837,
    "performers": [
      "Dimitri Venum",
      "Leo Adonis"
    ],
    "tags": []
  },
  "Men at Play Hunks Dato Folando and Enzo Rimenez Bareback.mp4": {
    "mtime": 1764962830656368373,
    "performers": [
      "Enzo Rimenez"
    ],
    "tags": []
  },
  "Mexico Brought Me Leo Sir Peter.mp4": {
    "mtime": 1764958620367572076,
    "performers": [
      "Sir Peter"
    ],
    "tags": []
  },
  "Miami Heat Part 1 Pup Kilo Gryphon Ashe.mp4": {
    "mtime": 1764958649703089548,
    "performers": [
      "Gryphon Ashe",
      "Pup Kilo"
    ],
    "tags": []
  },
  "Miami Heat Part 2 Pup Kilo Gryphon Ashe.mp4": {
    "mtime": 1764958652735039656,
    "performers": [
      "Gryphon Ashe",
      "Pup Kilo"
    ],
    "tags": []
  },
  "Michael Lucas Boston Miles Devin Boston Greet Meat.mp4": {
    "mtime": 1764958654491010759,
    "performers": [
      "Boston Miles",
      "Michael Boston",
      "Michael Lucas"
    ],
    "tags": []
  },
  "Michael Lucas and Tomas Brand.mp4": {
    "mtime": 1764958653863021094,
    "performers": [
      "Michael Lucas",
      "Tomas Brand"
    ],
    "tags": []
  },
  "Michael Roman Fucked by a Masseur Masqulin.mp4": {
    "mtime": 1764958665818824315,
    "performers": [
      "Michael Roman"
    ],
    "tags": []
  },
  "Michael Roman Sean Duran Flip Fuck and Breed.mp4": {
    "mtime": 1764958656690974554,
    "performers": [
      "Michael Roman",
      "Sean Duran"
    ],
    "tags": []
  },
  "Michael Roman Seth Santoro and Parker Allen.mp4": {
    "mtime": 1764958657954953752,
    "performers": [
      "Michael Roman",
      "Parker Allen",
      "Seth Santoro"
    ],
    "tags": []
  },
  "Michael Roman and Armando De Armas Flip Fuck.mp4": {
    "mtime": 1764958655426995356,
    "performers": [
      "Armando De Armas",
      "Michael Roman"
    ],
    "tags": []
  },
  "Michael Roman and Peter Rough Bareback.mp4": {
    "mtime": 1764958671258740625,
    "performers": [
      "Peter Rough",
      "Michael Roman"
    ],
    "tags": []
  },
  "Mick Powers Fucked by Daddies Allen Silver and Rodney Steele.mp4": {
    "mtime": 1764958662794874091,
    "performers": [
      "Allen Silver",
      "Mick Powers",
      "Rodney Steele"
    ],
    "tags": []
  },
  "Mickey Carpathio Dives Into Eric Hassan Big Dick.mp4": {
    "mtime": 1764958668782775523,
    "performers": [
      "Eric Hassan",
      "Mickey Carpathio"
    ],
    "tags": []
  },
  "Midnight Outdoor Romp Fest for Horny Mechanics Blowjob by Raging Stallion Greg Dixxon Johnny Ford.mp4": {
    "mtime": 1764958669806759097,
    "performers": [
      "Johnny Ford",
      "Greg Dixxon"
    ],
    "tags": []
  },
  "Mike Dozer Fucking Bears Yeah Bareback feat Jr Bronson.mp4": {
    "mtime": 1764958695622440170,
    "performers": [
      "Mike Dozer",
      "JR Bronson"
    ],
    "tags": []
  },
  "Mike Gaite Chandler Scott Part 2.mp4": {
    "mtime": 1764958677742661078,
    "performers": [
      "Chandler Scott",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Mike Gaite Chandler Scott Part 3.mp4": {
    "mtime": 1764958696982423277,
    "performers": [
      "Chandler Scott",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Mike Gaite Dustin Cross Flip Fuck in the PNW Part 2.mp4": {
    "mtime": 1764958697190420691,
    "performers": [
      "Dustin Cross",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Mike Gaite Flip Fucks with Builtfur Part 2.mp4": {
    "mtime": 1764958697550416216,
    "performers": [
      "Mike Gaite"
    ],
    "tags": []
  },
  "Mike Gaite Nate Beck Flip Fuck Part 1.mp4": {
    "mtime": 1764958698510404279,
    "performers": [
      "Mike Gaite",
      "Nate Beck"
    ],
    "tags": []
  },
  "Mike Gaite Phoenix Tony Flip Fuck Part 1 and 2.mp4": {
    "mtime": 1764958714790200889,
    "performers": [
      "Mike Gaite",
      "Phoenix Tony"
    ],
    "tags": []
  },
  "Mike Gaite Teddy Bear.mp4": {
    "mtime": 1764958699158396218,
    "performers": [
      "Mike Gaite",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Mike Gaite and Seattle Dad Part 1.mp4": {
    "mtime": 1764958672562724652,
    "performers": [
      "Mike Gaite",
      "Seattle Dad"
    ],
    "tags": []
  },
  "Mike Gaite and Seattle Dad Part 2.mp4": {
    "mtime": 1764958674098705821,
    "performers": [
      "Seattle Dad",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Mike Gaite and Seattle Dad Part 3.mp4": {
    "mtime": 1764958675198692325,
    "performers": [
      "Mike Gaite",
      "Seattle Dad"
    ],
    "tags": []
  },
  "Mike Gaite and Seattle Dad Part 4.mp4": {
    "mtime": 1764958676462676805,
    "performers": [
      "Mike Gaite",
      "Seattle Dad"
    ],
    "tags": []
  },
  "Mike Power Peter Axel Going Really Wild.mp4": {
    "mtime": 1764958699478392236,
    "performers": [],
    "tags": []
  },
  "Military Guys Jacking Off and Fucking Around Too.mp4": {
    "mtime": 1764958700262382478,
    "performers": [],
    "tags": []
  },
  "Military Hunks Blow Massive Loads Kyler Drayke Brad Connors Active Duty.mp4": {
    "mtime": 1764958704942324138,
    "performers": [
      "Brad Connors",
      "Kyler Drayke"
    ],
    "tags": []
  },
  "Military Jack Off Party Gets Wild feat Tony Bay Sami Damo David Chase by Daddy Sex Files Orgy.mp4": {
    "mtime": 1764958704942324138,
    "performers": [
      "Tony Bay",
      "David Chase"
    ],
    "tags": []
  },
  "Military Teen Bred Outdoors by the Drill Sargent.mp4": {
    "mtime": 1764958714478204804,
    "performers": [],
    "tags": []
  },
  "Military.mp4": {
    "mtime": 1764958715502191953,
    "performers": [],
    "tags": []
  },
  "Milo Miles Two Hairy Bears Kyle Steele and Lawson James Creampie for Dessert.mp4": {
    "mtime": 1764958712890224719,
    "performers": [
      "Lawson James",
      "Kyle Steele",
      "Milo Miles"
    ],
    "tags": []
  },
  "Mind Blowing Flip Fuck Jaxx Thanatos.mp4": {
    "mtime": 1764958714390205908,
    "performers": [
      "Jaxx Thanatos"
    ],
    "tags": []
  },
  "Missionary Boys It's up to Buck Richards and Eddie Patrick Get Off Now.mp4": {
    "mtime": 1764958720954123416,
    "performers": [
      "Buck Richards",
      "Eddie Patrick"
    ],
    "tags": []
  },
  "Missionary Boys Two Mormon Hotties Find Themselves in Anal Trouble.mp4": {
    "mtime": 1764958722370105583,
    "performers": [],
    "tags": []
  },
  "Mmm Papi feat Vinnie D'Angelo.mp4": {
    "mtime": 1764958761005614038,
    "performers": [],
    "tags": []
  },
  "Moaning Mormon Cam Crawford Ethan Chase.mp4": {
    "mtime": 1764958784613309156,
    "performers": [
      "Ethan Chase",
      "Cam Crawford"
    ],
    "tags": []
  },
  "Morgan Black and Adam Herst.mp4": {
    "mtime": 1764956991248096550,
    "performers": [
      "Adam Herst",
      "Morgan Black"
    ],
    "tags": []
  },
  "Morgan Black and Christopher Daniels.mp4": {
    "mtime": 1764958768965511612,
    "performers": [
      "Christopher Daniels",
      "Morgan Black"
    ],
    "tags": []
  },
  "Morgan Black and Dominic Sol Flip Fuck.mp4": {
    "mtime": 1764958770157496241,
    "performers": [
      "Morgan Black",
      "Dominic Sol"
    ],
    "tags": []
  },
  "Morgan Black and Shane Frost Suit Tie Fuck.mp4": {
    "mtime": 1764958771549478280,
    "performers": [
      "Morgan Black"
    ],
    "tags": []
  },
  "Morgan Black and Spencer Reed.mp4": {
    "mtime": 1764958772605464646,
    "performers": [
      "Morgan Black",
      "Spencer Reed"
    ],
    "tags": []
  },
  "Mormon Boyz Daddy and Son Free for All.mp4": {
    "mtime": 1764958785601296324,
    "performers": [],
    "tags": []
  },
  "Mormon Boyz Flip Fuck Threesome with Leaders.mp4": {
    "mtime": 1764958783777320009,
    "performers": [],
    "tags": []
  },
  "Mormon Boyz Muscle Daddy Priest Breeds Twinkser Bishop\u2019s Hole Peter Marcus Kristofer Weston.mp4": {
    "mtime": 1764958801157093557,
    "performers": [
      "Kristofer Weston",
      "Peter Marcus"
    ],
    "tags": []
  },
  "Mormon Gets Ass Creampied Lance Hart.mp4": {
    "mtime": 1764958807389011938,
    "performers": [
      "Lance Hart"
    ],
    "tags": []
  },
  "Mormon Receives Blowjob Before Raw Fucking His Man Deep.mp4": {
    "mtime": 1764958810304973674,
    "performers": [],
    "tags": []
  },
  "Mormons Ass Fucking Pierce Paris Austin Everett.mp4": {
    "mtime": 1764958810836966688,
    "performers": [
      "Austin Everett",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Motorbikers Cruising in the Woods Joe Gillis.mp4": {
    "mtime": 1764958824132791585,
    "performers": [
      "Joe Gillis"
    ],
    "tags": []
  },
  "Mover Vander Pulaski Caught Jerking Muscular.mp4": {
    "mtime": 1764958811480958229,
    "performers": [
      "Vander Pulaski"
    ],
    "tags": []
  },
  "Movie Night with the Stepsons Always Better Four Horny Cocks and a Foursome.mp4": {
    "mtime": 1764953590217207647,
    "performers": [
      "Joel Someone",
      "Eddie Patrick"
    ],
    "tags": []
  },
  "Moving Van Starring Peter North AKA Matt Ramsey.mp4": {
    "mtime": 1764958831216697900,
    "performers": [
      "Peter North"
    ],
    "tags": []
  },
  "Mr Britain X Griffin Barrows Scott Wild Gabriel Cross.mp4": {
    "mtime": 1764958822484813340,
    "performers": [
      "Gabriel Cross",
      "Griffin Barrows",
      "Scott Wild"
    ],
    "tags": []
  },
  "Mr Scott Can't Keep His Hands Off of Hot Stepnephew Kyle Steele.mp4": {
    "mtime": 1764953595829113199,
    "performers": [
      "Kyle Steele"
    ],
    "tags": []
  },
  "Mr Towel Rack Sir.mp4": {
    "mtime": 1764958853964395274,
    "performers": [],
    "tags": []
  },
  "MrDeepVoice Bottoms Jack Cock.mp4": {
    "mtime": 1764958827044753107,
    "performers": [
      "Jack Cock",
      "MrDeepVoice"
    ],
    "tags": []
  },
  "MrDeepVoice Eddie Burke and Jake Manson Fuck Each Other.mp4": {
    "mtime": 1764958851864423323,
    "performers": [
      "MrDeepVoice",
      "Eddie Burke"
    ],
    "tags": []
  },
  "MrDeepVoice in an 11-man Orgy Part 1 of the Sauna Slut Series.mp4": {
    "mtime": 1764958833068673363,
    "performers": [
      "MrDeepVoice"
    ],
    "tags": []
  },
  "Murillo Mota Flavio Pimenta.mp4": {
    "mtime": 1764958834256657614,
    "performers": [
      "Flavio Pimenta"
    ],
    "tags": []
  },
  "Muscle Bareback and Cumshot Jeremy Stevens.mp4": {
    "mtime": 1764958855212378594,
    "performers": [
      "Jeremy Stevens"
    ],
    "tags": []
  },
  "Muscle Bear Barebacks and Sucks in Fourway.mp4": {
    "mtime": 1764958853960395328,
    "performers": [],
    "tags": []
  },
  "Muscle Bear Breeds Furry Cub Bareback feat Mike Dozer.mp4": {
    "mtime": 1764958853168405909,
    "performers": [
      "Mike Dozer"
    ],
    "tags": []
  },
  "Muscle Bear Cum Fest Amateur feat Musclebear Montreal.mp4": {
    "mtime": 1764958858340336752,
    "performers": [
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Muscle Bear Flip Fucks Stranger in Bathroom Raging Stallion Deep Throat.mp4": {
    "mtime": 1764958859492321330,
    "performers": [],
    "tags": []
  },
  "Muscle Bear Holes vs Daddy Cock the Fourway Battle.mp4": {
    "mtime": 1764958876120097991,
    "performers": [],
    "tags": []
  },
  "Muscle Big Cock Flip Fuck with Cumshot.mp4": {
    "mtime": 1764958864892248951,
    "performers": [],
    "tags": []
  },
  "Muscle Boy Story 4.mp4": {
    "mtime": 1764958923355456332,
    "performers": [],
    "tags": []
  },
  "Muscle Bros Fur on Red Ryder Teddy Bear.mp4": {
    "mtime": 1764958915151568514,
    "performers": [
      "Red Ryder",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Muscle Dad Boyfriend's Raw Fuck a Fit Inked Twunk Part 2.mp4": {
    "mtime": 1764958889863912369,
    "performers": [],
    "tags": []
  },
  "Muscle Daddies Bareback feat Jake Marshall.mp4": {
    "mtime": 1764958877376081065,
    "performers": [
      "Jake Marshall"
    ],
    "tags": []
  },
  "Muscle Daddy Anal Sex and Cumshot.mp4": {
    "mtime": 1764958937067268170,
    "performers": [],
    "tags": []
  },
  "Muscle Daddy Breeds Beefy Stud Killian Knox.mp4": {
    "mtime": 1764958924951434474,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Muscle Daddy Fourway Fuckfest Part 2 Alex Tikas.mp4": {
    "mtime": 1764958925547426308,
    "performers": [
      "Alex Tikas"
    ],
    "tags": []
  },
  "Muscle Daddy Fucks and Breeds His Silver Fox Bareback.mp4": {
    "mtime": 1764958926151418032,
    "performers": [],
    "tags": []
  },
  "Muscle Daddy Threeway Cain Marko and Drew Sebastian.mp4": {
    "mtime": 1764958927099405038,
    "performers": [
      "Cain Marko",
      "Drew Sebastian"
    ],
    "tags": []
  },
  "Muscle Flip Fuck and Cumshot.mp4": {
    "mtime": 1764958935447290442,
    "performers": [],
    "tags": []
  },
  "Muscle Flip Fuck.mp4": {
    "mtime": 1764958951731066043,
    "performers": [],
    "tags": []
  },
  "Muscle Fuckers Afternoon Dimitri Venum Charlie Ferreira.mp4": {
    "mtime": 1764958989326543756,
    "performers": [
      "Charlie Ferreira",
      "Dimitri Venum"
    ],
    "tags": []
  },
  "Muscle Guys Flip Fuck Part 1 Evan Sterling Mike Gaite.mp4": {
    "mtime": 1764955192249037518,
    "performers": [
      "Evan Sterling",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Muscle Guys Flip Fuck Part 2 Evan Sterling Mike Gaite.mp4": {
    "mtime": 1764955193661012334,
    "performers": [
      "Evan Sterling",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Muscle Guys Flip Fuck Samson Steed.mp4": {
    "mtime": 1764958988514555096,
    "performers": [
      "Samson Steed"
    ],
    "tags": []
  },
  "Muscle Heat Non-Stop Action with Horny Hotel Guests in Miami Beach.mp4": {
    "mtime": 1764959027886002344,
    "performers": [],
    "tags": []
  },
  "Muscle Hunk Barefucked in His Own Cum.mp4": {
    "mtime": 1764958990602525930,
    "performers": [],
    "tags": []
  },
  "Muscle Hunk Masseuse Rubs His Client the Right Way.mp4": {
    "mtime": 1764958997638427525,
    "performers": [],
    "tags": []
  },
  "Muscle Hunk Visitors Dick Down Sexy Cityboy Muscular feat Isaac X.mp4": {
    "mtime": 1764958992630497587,
    "performers": [
      "Isaac X"
    ],
    "tags": []
  },
  "Muscle Hunk and Muscle Daddy Fuck Bareback Jaxx Thanatos Liam Greer.mp4": {
    "mtime": 1764958991478513689,
    "performers": [
      "Jaxx Thanatos",
      "Liam Greer"
    ],
    "tags": []
  },
  "Muscle Hunk.mp4": {
    "mtime": 1764958993802481199,
    "performers": [],
    "tags": []
  },
  "Muscle Hunks on Rub Him Fucking Hard.mp4": {
    "mtime": 1764958999950395148,
    "performers": [],
    "tags": []
  },
  "Muscle Jock Flip Fuck.mp4": {
    "mtime": 1764959026678019389,
    "performers": [],
    "tags": []
  },
  "Muscle Load Red Ryder Thelv.mp4": {
    "mtime": 1764959077253301369,
    "performers": [
      "Red Ryder",
      "Thelv"
    ],
    "tags": []
  },
  "Muscle Mechanic Smashed by Hairy Assed Coworker Muscular Brody Meyer Wade Wolfgar Lawson James.mp4": {
    "mtime": 1764959027890002288,
    "performers": [
      "Brody Meyer",
      "Wade Wolfgar",
      "Lawson James"
    ],
    "tags": []
  },
  "Muscle Nick Bayne.mp4": {
    "mtime": 1764959037717863417,
    "performers": [
      "Nick Bayne"
    ],
    "tags": []
  },
  "Muscle Stud Baggage Handler Rails Hairy Flight Attendant feat Morgxn Thicke.mp4": {
    "mtime": 1764959029353981623,
    "performers": [
      "Morgxn Thicke"
    ],
    "tags": []
  },
  "Muscle Studs Breeding With Poppers Amateur.mp4": {
    "mtime": 1764959030545964792,
    "performers": [],
    "tags": []
  },
  "Muscle vs Red Ryder.mp4": {
    "mtime": 1764959056877591704,
    "performers": [
      "Red Ryder"
    ],
    "tags": []
  },
  "Musclebear Montreal Hairy Beefy Men Fucking Hard feat Justin Eros by Pride Studios.mp4": {
    "mtime": 1764959081517240437,
    "performers": [
      "Justin Eros",
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Musclebear Montreal and AJ Marshall.mp4": {
    "mtime": 1764959039341840437,
    "performers": [
      "AJ Marshall",
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Musclebear Montreal and Jordi Massive.mp4": {
    "mtime": 1764959078757279884,
    "performers": [
      "Jordi Massive",
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Musclebear Montreal and Killian Knox.mp4": {
    "mtime": 1764959080249258563,
    "performers": [
      "Killian Knox",
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Muscled Jocks All Take a Turn To Ride the Fuck Train Cole Connor Killian Knox.mp4": {
    "mtime": 1764959082821221791,
    "performers": [
      "Cole Connor",
      "Killian Knox"
    ],
    "tags": []
  },
  "Muscled Stud Mechanic Caught Sabotaging Team Makes Up for It Travis Connor.mp4": {
    "mtime": 1764959084185202282,
    "performers": [
      "Travis Connor"
    ],
    "tags": []
  },
  "Muscly Bear Fucks and Cums Jesse Jackman Condom.mp4": {
    "mtime": 1764959092401084639,
    "performers": [
      "Jesse Jackman"
    ],
    "tags": []
  },
  "Muscly Jock First Time Vin Roxx Johnny Rapid.mp4": {
    "mtime": 1764959094525054191,
    "performers": [
      "Johnny Rapid",
      "Vin Roxx"
    ],
    "tags": []
  },
  "Muscular DILFs Provide Nudity and Heavy Sex in Hotel Room Kinks Killian Knox Drew Sebastian.mp4": {
    "mtime": 1764959093501068872,
    "performers": [
      "Drew Sebastian",
      "Killian Knox"
    ],
    "tags": []
  },
  "Muscular Euro Dudes and Fuck on the Table Rub Him with Max Born Mark Brown.mp4": {
    "mtime": 1764959129712547717,
    "performers": [
      "Max Born",
      "Mark Brown"
    ],
    "tags": []
  },
  "Muscular Foursome Bareback Derek Parker.mp4": {
    "mtime": 1764959163092063864,
    "performers": [
      "Derek Parker"
    ],
    "tags": []
  },
  "Muscular Guys Riley Mitchel Nick Cranston Try Some Arm-Wrestle But They Decide Its Better To Fuck Instead.mp4": {
    "mtime": 1764959133256496499,
    "performers": [
      "Nick Cranston",
      "Riley Mitchel"
    ],
    "tags": []
  },
  "Muscular Hugh Hunter and Dolf Dietrich Bareback by Bear Films.mp4": {
    "mtime": 1764959147932284009,
    "performers": [
      "Dolf Dietrich",
      "Hugh Hunter"
    ],
    "tags": []
  },
  "Muscular Hunk Gets to Bang That Tight Asshole with His Cock Dolf Dietrich Billy Warren.mp4": {
    "mtime": 1764959140560390824,
    "performers": [
      "Billy Warren",
      "Dolf Dietrich"
    ],
    "tags": []
  },
  "Muscular Hunk Jake Norris Destroys Ross Scotts Ass with Raw.mp4": {
    "mtime": 1764959141648375070,
    "performers": [
      "Jake Norris"
    ],
    "tags": []
  },
  "Muscular Jake Bareback Fucks and Breeds Coach.mp4": {
    "mtime": 1764959153768199339,
    "performers": [],
    "tags": []
  },
  "Muscular Jock Luc Gets Raw Big Dick in His Tight Ass.mp4": {
    "mtime": 1764959156240163445,
    "performers": [],
    "tags": []
  },
  "Muscular Latino Flip Fucks Hairy Daddy Dirk Caber.mp4": {
    "mtime": 1764959164096049262,
    "performers": [
      "Dirk Caber"
    ],
    "tags": []
  },
  "Muscular Mormon Homo Sucks Dick Before Cumming From Bareback Joel Someone Joey Doves.mp4": {
    "mtime": 1764959165208033086,
    "performers": [
      "Joel Someone",
      "Joey Doves"
    ],
    "tags": []
  },
  "Muscular Older Slurps Cum After Breeding Roughly Outdoor.mp4": {
    "mtime": 1764959170831951221,
    "performers": [],
    "tags": []
  },
  "Muscular Rough Gay Intercourse.mp4": {
    "mtime": 1764959176255872185,
    "performers": [],
    "tags": []
  },
  "Muscular Silver Daddies Fucking Each Other.mp4": {
    "mtime": 1764959180327812798,
    "performers": [],
    "tags": []
  },
  "Muscular Stud Davin Strong Barebacked by Dilf Drew Sebastian Bareback.mp4": {
    "mtime": 1764959181431796689,
    "performers": [
      "Davin Strong",
      "Drew Sebastian"
    ],
    "tags": []
  },
  "Muscular Studs Horny for Sex Jan Faust Max Born.mp4": {
    "mtime": 1764959201959496570,
    "performers": [
      "Jan Faust",
      "Max Born"
    ],
    "tags": []
  },
  "My Boss Is a Dick Markus Kage Ryan Bones.mp4": {
    "mtime": 1764959187791703825,
    "performers": [
      "Markus Kage",
      "Ryan Bones"
    ],
    "tags": []
  },
  "My Gym Shower Adventures with Wrestling Teammate feat Matt Steel Mike Russo Varsity Grip.mp4": {
    "mtime": 1764959209239389874,
    "performers": [
      "Mike Russo"
    ],
    "tags": []
  },
  "My Heart Belongs to Daddy Bareback feat Alex Tikas Dirk Caber.mp4": {
    "mtime": 1764959210203375735,
    "performers": [
      "Alex Tikas",
      "Dirk Caber"
    ],
    "tags": []
  },
  "My Hot Roommate Quin Quire Johnny Ford.mp4": {
    "mtime": 1764956983656182150,
    "performers": [
      "Quin Quire",
      "Johnny Ford"
    ],
    "tags": []
  },
  "My Neighbour Is a Big Dicked Bear Top Allen King.mp4": {
    "mtime": 1764959210879365819,
    "performers": [
      "Allen King"
    ],
    "tags": []
  },
  "My Sister's Husband Bareback feat Daryl Brock.mp4": {
    "mtime": 1764959212255345631,
    "performers": [
      "Daryl Brock"
    ],
    "tags": []
  },
  "My Stepdad Is A Chore Greg Dixxon Andrew Delta.mp4": {
    "mtime": 1764959212335344457,
    "performers": [
      "Andrew Delta",
      "Greg Dixxon"
    ],
    "tags": []
  },
  "My Trainer Markus Kage Fucked Me Romeo Davis.mp4": {
    "mtime": 1764959212335344457,
    "performers": [
      "Markus Kage",
      "Romeo Davis"
    ],
    "tags": []
  },
  "My Way Man.mp4": {
    "mtime": 1764959213667324910,
    "performers": [],
    "tags": []
  },
  "Myles Landon Wesley Woods and Michael Boston.mp4": {
    "mtime": 1764959214483312933,
    "performers": [
      "Michael Boston",
      "Myles Landon",
      "Wesley Woods"
    ],
    "tags": []
  },
  "Naked Sword Private Collection Greg Dixxon and Roman Mercury.mp4": {
    "mtime": 1764959250518782378,
    "performers": [
      "Greg Dixxon",
      "Roman Mercury"
    ],
    "tags": []
  },
  "Naked Yogui and Tradesman Cock.mp4": {
    "mtime": 1764959287062241235,
    "performers": [
      "Tradesman"
    ],
    "tags": []
  },
  "Nasty Breeders Dan Fisk.mp4": {
    "mtime": 1764959261798615668,
    "performers": [
      "Dan Fisk"
    ],
    "tags": []
  },
  "Nasty Daddy Bottom Jayson Park Barebacked by Derek Anthony Bareback.mp4": {
    "mtime": 1764959262982598152,
    "performers": [
      "Derek Anthony",
      "Jayson Park"
    ],
    "tags": []
  },
  "Nasty Daddy DILF Myles Landon Raw Breeds Spencer Whitman Bareback.mp4": {
    "mtime": 1764959287906228702,
    "performers": [
      "Myles Landon",
      "Spencer Whitman"
    ],
    "tags": []
  },
  "Nasty Daddy Daddies Max Sargent and Peter Rough Raw Fuck Bareback.mp4": {
    "mtime": 1764959277026390147,
    "performers": [
      "Max Sargent",
      "Peter Rough"
    ],
    "tags": []
  },
  "Nasty Daddy Drew Sebastian Barebacks Greg Riley Part 1.mp4": {
    "mtime": 1764959291294178375,
    "performers": [
      "Drew Sebastian",
      "Greg Riley"
    ],
    "tags": []
  },
  "Nasty Daddy Drew Sebastian Barebacks Greg Riley Part 2.mp4": {
    "mtime": 1764959297694083240,
    "performers": [
      "Drew Sebastian",
      "Greg Riley"
    ],
    "tags": []
  },
  "Nasty Daddy Drew Sebastian Makes Lawson James Swallow His Thick Cock Before Breeding Him Raw.mp4": {
    "mtime": 1764959312173867675,
    "performers": [
      "Drew Sebastian",
      "Lawson James"
    ],
    "tags": []
  },
  "Nasty Daddy Hairy Hunk Ian Sterling Smashed DILF's Major Mo Sweet Ass.mp4": {
    "mtime": 1764959322689710848,
    "performers": [
      "Ian Sterling"
    ],
    "tags": []
  },
  "Nasty Daddy Hunks Clay Towers and Jake Morgan Breed Cum Bareback.mp4": {
    "mtime": 1764959322953706908,
    "performers": [
      "Clay Towers",
      "Jake Morgan"
    ],
    "tags": []
  },
  "Nasty Daddy Hunks Derek Parker and Hoytt Walker Bareback.mp4": {
    "mtime": 1764959323497698789,
    "performers": [
      "Derek Parker",
      "Hoytt Walker"
    ],
    "tags": []
  },
  "Nasty Daddy Hunky Jake Morgan Fucked by Dolf Dietrich Bareback.mp4": {
    "mtime": 1764959323257702371,
    "performers": [
      "Dolf Dietrich",
      "Jake Morgan"
    ],
    "tags": []
  },
  "Nasty Daddy My Hot Buddy Brian Bonds Charlie Harding Flip Fuck.mp4": {
    "mtime": 1764959324241687684,
    "performers": [
      "Brian Bonds",
      "Charlie Harding"
    ],
    "tags": []
  },
  "Nasty Daddy Tattooed Jack Dixon Barebacked by Daddy Carlo Cox.mp4": {
    "mtime": 1764959324593682429,
    "performers": [
      "Jack Dixon",
      "Carlo Cox"
    ],
    "tags": []
  },
  "Nasty Daddy Threeway Brody Meyer Roman Mercury Steve Arcturus Bareback.mp4": {
    "mtime": 1764959325161673950,
    "performers": [
      "Brody Meyer",
      "Roman Mercury",
      "Steve Arcturus"
    ],
    "tags": []
  },
  "Nathan Styles and Markie More Ends Up Flip Fucking in Empty Loft Bareback.mp4": {
    "mtime": 1764959335565518520,
    "performers": [
      "Nathan Styles",
      "Markie More"
    ],
    "tags": []
  },
  "Naughty Boy Alex Chandler Gets Big Dicking by Officer Pierce Hartman.mp4": {
    "mtime": 1764959337025496692,
    "performers": [
      "Alex Chandler"
    ],
    "tags": []
  },
  "Navy Seals the Deal feat Brock Kniles Guido Gold.mp4": {
    "mtime": 1764959356021212298,
    "performers": [
      "Brock Kniles"
    ],
    "tags": []
  },
  "Ne Ho Per Tutti Romeo Davis Cole Connor Beau Butler Group.mp4": {
    "mtime": 1764959341317432496,
    "performers": [
      "Beau Butler",
      "Cole Connor",
      "Romeo Davis"
    ],
    "tags": []
  },
  "Neighbor Gets Barebacked.mp4": {
    "mtime": 1764959342713411609,
    "performers": [],
    "tags": []
  },
  "Neighborhood Rec Room.mp4": {
    "mtime": 1764959408148428415,
    "performers": [],
    "tags": []
  },
  "Nerd Barber Fuck Thomas Ride.mp4": {
    "mtime": 1764959361041137026,
    "performers": [
      "Thomas Ride"
    ],
    "tags": []
  },
  "Nerdy Waiter Fisted by Hairy Daddy Bareback feat Sherman Maus Fisting Inferno.mp4": {
    "mtime": 1764959344885379103,
    "performers": [
      "Sherman Maus"
    ],
    "tags": []
  },
  "New Inmate Rite of Passage with Cellmate Riley Mitchel.mp4": {
    "mtime": 1764959376572903834,
    "performers": [
      "Riley Mitchel"
    ],
    "tags": []
  },
  "New Video Gay Nude Nude Porn feat Del Cobb.mp4": {
    "mtime": 1764953596145107878,
    "performers": [],
    "tags": []
  },
  "New York Realtor Flip Fucks HR Honcho Raging Stallion American Bareback.mp4": {
    "mtime": 1764959377304892833,
    "performers": [],
    "tags": []
  },
  "Newbie Fucked Raw and Good Gay Porn HD Online.mp4": {
    "mtime": 1764959378192879486,
    "performers": [],
    "tags": []
  },
  "Next Door Buddies Bored Bros Switch From Paddleboarding To Pounding.mp4": {
    "mtime": 1764959378176879727,
    "performers": [],
    "tags": []
  },
  "Next Door Buddies Rod Daily and Paul Wagner Pounding Away at Each Other.mp4": {
    "mtime": 1764959391344681642,
    "performers": [
      "Paul Wagner",
      "Rod Daily"
    ],
    "tags": []
  },
  "Next Door Buddies Tricking My Jacked Friend Into Bed for Raw Fucking Bareback.mp4": {
    "mtime": 1764959387264743050,
    "performers": [],
    "tags": []
  },
  "Next Door Raw Caught Fucking in Escape Room Owner Joins Bareback.mp4": {
    "mtime": 1764959385656767244,
    "performers": [],
    "tags": []
  },
  "Next Door Raw Let Me in Dude I\u2019ll Let You Bareback My Bubble Butt.mp4": {
    "mtime": 1764959394084640386,
    "performers": [],
    "tags": []
  },
  "Next Door Taboo My Stepuncle Is a Nudist Roman Todd Canyon Cole Flip Fuck.mp4": {
    "mtime": 1764959404000490969,
    "performers": [
      "Canyon Cole",
      "Roman Todd"
    ],
    "tags": []
  },
  "Nicholas Bardem Meets Apolo.mp4": {
    "mtime": 1764955197120950619,
    "performers": [
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "Nicholas Bardem vs Marco Napoli.mp4": {
    "mtime": 1764959420028249095,
    "performers": [
      "Marco Napoli",
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "Nick Capra Dicks Down Couple Vince Parker and Jake Nicola.mp4": {
    "mtime": 1764959443447894897,
    "performers": [
      "Nick Capra",
      "Jake Nicola",
      "Vince Parker"
    ],
    "tags": []
  },
  "Nick Capra Explores Every Inch of Asher's Body.mp4": {
    "mtime": 1764959444475879329,
    "performers": [
      "Nick Capra",
      "Asher Devin"
    ],
    "tags": []
  },
  "Nick Capra Exposes His Sweet Tight Ass by Icon Male.mp4": {
    "mtime": 1764959448619816557,
    "performers": [
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra Fucks Logan Stevens.mp4": {
    "mtime": 1764959444723875574,
    "performers": [
      "Logan Stevens",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra Gets Fucked.mp4": {
    "mtime": 1764959464135581283,
    "performers": [
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and Adam Killian Group Sex Part 3.mp4": {
    "mtime": 1764959405684465577,
    "performers": [
      "Adam Killian",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and Brendan Patrick.mp4": {
    "mtime": 1764959405808463707,
    "performers": [
      "Brendan Patrick",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and Brent Everett Flip Fuck Bareback.mp4": {
    "mtime": 1764959407592436801,
    "performers": [
      "Brent Everett",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and Dirk Caber.mp4": {
    "mtime": 1764959407528437767,
    "performers": [
      "Dirk Caber",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and Griffin Barrows.mp4": {
    "mtime": 1764959409500408019,
    "performers": [
      "Griffin Barrows",
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra and John Magnum.mp4": {
    "mtime": 1764959446427849764,
    "performers": [
      "Nick Capra",
      "John Magnum"
    ],
    "tags": []
  },
  "Nick Capra and Rocco Steele Part 1.mp4": {
    "mtime": 1764959409680405304,
    "performers": [
      "Nick Capra",
      "Rocco Steele"
    ],
    "tags": []
  },
  "Nick Capra and Rocco Steele Part 2.mp4": {
    "mtime": 1764959416060309016,
    "performers": [
      "Nick Capra",
      "Rocco Steele"
    ],
    "tags": []
  },
  "Nick Capra and Rodney Steele.mp4": {
    "mtime": 1764959436204004550,
    "performers": [
      "Nick Capra",
      "Rodney Steele"
    ],
    "tags": []
  },
  "Nick Capra and Rusty Stevens.mp4": {
    "mtime": 1764959442839904104,
    "performers": [
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Capra's Ass Is Owned by Mystery Blonde Dude.mp4": {
    "mtime": 1764959457231686017,
    "performers": [
      "Nick Capra"
    ],
    "tags": []
  },
  "Nick Moretti Chad Brock and Jake Norris Bareback.mp4": {
    "mtime": 1764959472235458311,
    "performers": [
      "Chad Brock",
      "Jake Norris",
      "Nick Moretti"
    ],
    "tags": []
  },
  "Nino B Assistance.mp4": {
    "mtime": 1764959460103642458,
    "performers": [],
    "tags": []
  },
  "Nothing Beats a Good Hotel Hookup Ryan Chad.mp4": {
    "mtime": 1764959461295624375,
    "performers": [],
    "tags": []
  },
  "Nuru Massage Sergio Wilde.mp4": {
    "mtime": 1764959527570615633,
    "performers": [
      "Sergio Wilde"
    ],
    "tags": []
  },
  "Obedient Mormon Jock Dildo Fucked Till He Cums and Doggy Style Drilling.mp4": {
    "mtime": 1764959505738948624,
    "performers": [],
    "tags": []
  },
  "Office Hunk Creamed on by His Boss.mp4": {
    "mtime": 1764959475611407029,
    "performers": [],
    "tags": []
  },
  "Office Hunks Take Turns to Suck Cock.mp4": {
    "mtime": 1764959493399136541,
    "performers": [],
    "tags": []
  },
  "Office Manager Anal Fucks New Employee During an Interview feat Josh Peters.mp4": {
    "mtime": 1764959494527119372,
    "performers": [],
    "tags": []
  },
  "Office Space Muscle Flip Fuck Cody Arizona Baxxx.mp4": {
    "mtime": 1764959513574829183,
    "performers": [
      "Cody Arizona"
    ],
    "tags": []
  },
  "Office Studs Bare Fucking While Alone at Work Bareback Quentin Gainz.mp4": {
    "mtime": 1764959495699101532,
    "performers": [
      "Quentin Gainz"
    ],
    "tags": []
  },
  "Officers Johnny Ford Jax Thirio Discipline Carter Delrey for Masturbating in Public Young Perps.mp4": {
    "mtime": 1764959502410999325,
    "performers": [
      "Jax Thirio",
      "Johnny Ford"
    ],
    "tags": []
  },
  "Oily Mechanic Flip Fuck Adonis Derek Kage Morgxn Thicke.mp4": {
    "mtime": 1764959503650980436,
    "performers": [
      "Derek Kage",
      "Morgxn Thicke"
    ],
    "tags": []
  },
  "Older Gay Men Jaxx Thanatos and Killian Knox.mp4": {
    "mtime": 1764959471211473863,
    "performers": [
      "Killian Knox",
      "Jaxx Thanatos"
    ],
    "tags": []
  },
  "Older Killian Knox Loves Getting Fucked Hard in the Shower Bareback feat Marco Lorenzo.mp4": {
    "mtime": 1764959528830596395,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Older Professor Barebacks and Breeds Eager Young Student Bareback.mp4": {
    "mtime": 1764959530754567015,
    "performers": [],
    "tags": []
  },
  "Older and Man Amateur Flip Fuck Bareback.mp4": {
    "mtime": 1764959504618965689,
    "performers": [],
    "tags": []
  },
  "Olivier Robert Skyy Knox Bareback Flip Fuck.mp4": {
    "mtime": 1764959532570539279,
    "performers": [
      "Olivier Robert",
      "Skyy Knox"
    ],
    "tags": []
  },
  "One Hooker vs Two Big Dicked Guys.mp4": {
    "mtime": 1764959532478540684,
    "performers": [],
    "tags": []
  },
  "Only Fans Adam Jacques AJ Exclusive Fitness Fucks Dimitri Venum.mp4": {
    "mtime": 1764959573057919775,
    "performers": [
      "Dimitri Venum"
    ],
    "tags": []
  },
  "Only Fans Angel Frontera Viktor Rom Threesome Bareback.mp4": {
    "mtime": 1764959557766154006,
    "performers": [
      "Angel Frontera",
      "Viktor Rom"
    ],
    "tags": []
  },
  "Only Fans Bull Barrett Jack Wolf.mp4": {
    "mtime": 1764959556290176598,
    "performers": [
      "Bull Barrett",
      "Jack Wolf"
    ],
    "tags": []
  },
  "Only Fans Cole Connor's Construction David Mitchell.mp4": {
    "mtime": 1764959569181979172,
    "performers": [
      "Cole Connor"
    ],
    "tags": []
  },
  "Only Fans David Mitchell Christian Power Barebacks Cole Connor.mp4": {
    "mtime": 1764959605129427584,
    "performers": [
      "Christian Power",
      "Cole Connor"
    ],
    "tags": []
  },
  "Only Fans Dimitri Venum Ulisses Prince.mp4": {
    "mtime": 1764959607305394145,
    "performers": [
      "Dimitri Venum"
    ],
    "tags": []
  },
  "Only Fans Hotmartin Maurealness.mp4": {
    "mtime": 1764959606485406747,
    "performers": [],
    "tags": []
  },
  "Only Fans Jesse Jackman and Rogan Richards.mp4": {
    "mtime": 1764959607593389719,
    "performers": [
      "Jesse Jackman",
      "Rogan Richards"
    ],
    "tags": []
  },
  "Only Fans Manuel Skye Diego Mineiro Twink.mp4": {
    "mtime": 1764959608773371583,
    "performers": [
      "Diego Mineiro",
      "Manuel Skye"
    ],
    "tags": []
  },
  "Only Fans Nate Stetson And Logan Stevens.mp4": {
    "mtime": 1764959609277363837,
    "performers": [
      "Logan Stevens",
      "Nate Stetson"
    ],
    "tags": []
  },
  "Only Fans Ronney Rebelle and Gael Kriok at Macho Tube.mp4": {
    "mtime": 1764959609857354922,
    "performers": [
      "Gael"
    ],
    "tags": []
  },
  "Only Fans William Seed Fucks Pierce Paris Bareback.mp4": {
    "mtime": 1764953594549134748,
    "performers": [
      "Pierce Paris",
      "William Seed"
    ],
    "tags": []
  },
  "Open Sesame Nude feat Logan Stevens.mp4": {
    "mtime": 1764959610561344100,
    "performers": [
      "Logan Stevens"
    ],
    "tags": []
  },
  "Open Up and Take my Cum.mp4": {
    "mtime": 1764959617041244466,
    "performers": [],
    "tags": []
  },
  "Open Up for Daddy.mp4": {
    "mtime": 1764959619353208905,
    "performers": [],
    "tags": []
  },
  "Open Your Legs for Me Logan Stevens Ricky Donovan Bareback.mp4": {
    "mtime": 1764959639780894445,
    "performers": [
      "Logan Stevens"
    ],
    "tags": []
  },
  "Orgia Gostosa De Grandoes.mp4": {
    "mtime": 1764959635816955502,
    "performers": [],
    "tags": []
  },
  "Orgy Bareback with Igor Lucios Teddy Torres Lucas Dias Jordan Neo Randhy.mp4": {
    "mtime": 1764959630461037971,
    "performers": [
      "Igor Lucios",
      "Teddy Torres",
      "Lucas Dias"
    ],
    "tags": []
  },
  "Orgy Between Stepdad and Stepson Markus Kage Romeo Davis.mp4": {
    "mtime": 1764959636564943982,
    "performers": [
      "Romeo Davis",
      "Markus Kage"
    ],
    "tags": []
  },
  "Orgy Flip Fuck Jake Nicola Vince Parker Isaac X Jacen Zhu Bareback.mp4": {
    "mtime": 1764959635592958951,
    "performers": [
      "Isaac X",
      "Jake Nicola",
      "Vince Parker"
    ],
    "tags": []
  },
  "Orgy Sean Duran Brendan Patrick Rogue Status Jake Morgan Link Parker Milan Gamiani Billy Warren.mp4": {
    "mtime": 1764959701491941775,
    "performers": [
      "Billy Warren",
      "Brendan Patrick",
      "Jake Morgan",
      "Milan Gamiani",
      "Sean Duran"
    ],
    "tags": []
  },
  "Orgy with Paddy O'Brien Gabriel Cross Scott Wild Dean Young.mp4": {
    "mtime": 1764959677896306496,
    "performers": [
      "Dean Young",
      "Gabriel Cross",
      "Paddy O'Brien",
      "Scott Wild"
    ],
    "tags": []
  },
  "Os Irm\u00e3os Tristan Jaxx Eddie Ceetee.mp4": {
    "mtime": 1764959698531987557,
    "performers": [
      "Tristan Jaxx",
      "Eddy Ceetee"
    ],
    "tags": []
  },
  "Otter Gets Bred by Older.mp4": {
    "mtime": 1764959690684108902,
    "performers": [],
    "tags": []
  },
  "Outdoor Wank Johnny Sins.mp4": {
    "mtime": 1764959704047902234,
    "performers": [
      "Johnny Sins"
    ],
    "tags": []
  },
  "Pad Flip Fucking Peter Juicy Ass.mp4": {
    "mtime": 1764959713355758188,
    "performers": [],
    "tags": []
  },
  "Pair Barefuck on the Bed.mp4": {
    "mtime": 1764959699695969555,
    "performers": [],
    "tags": []
  },
  "Palm Springs Heat Complete Film Gage Lennox Fucks Fists Stud Daddy.mp4": {
    "mtime": 1764959785658636561,
    "performers": [
      "Gage Lennox"
    ],
    "tags": []
  },
  "Park City Orgy Thomas Long Cole Connors Just in the jock Ryan Russo Jonas O\u2019Malley Aashwork.mp4": {
    "mtime": 1764959703255914487,
    "performers": [
      "Cole Ryan",
      "Ryan Russo",
      "Thomas Long"
    ],
    "tags": []
  },
  "Park Pickup.mp4": {
    "mtime": 1764959742863301001,
    "performers": [],
    "tags": []
  },
  "Parker Fucks Jack Five.mp4": {
    "mtime": 1764956984212175902,
    "performers": [],
    "tags": []
  },
  "Parker Williams Paul Carrigan and Todd Maxwell Jail Cops Condom.mp4": {
    "mtime": 1764959741383323951,
    "performers": [
      "Parker Williams",
      "Paul Carrigan",
      "Todd Maxwell"
    ],
    "tags": []
  },
  "Parking Lot Pounding with Rod Daily and Tyler Reid.mp4": {
    "mtime": 1764959742191311422,
    "performers": [
      "Rod Daily",
      "Tyler Reid"
    ],
    "tags": []
  },
  "Parole Eddy Ceetee Bruce Beckham.mp4": {
    "mtime": 1764959759199047559,
    "performers": [
      "Eddy Ceetee",
      "Bruce Beckham"
    ],
    "tags": []
  },
  "Part 1 Adam Russo Drew Sebastian Jake Nicola.mp4": {
    "mtime": 1764959743807286362,
    "performers": [
      "Adam Russo",
      "Drew Sebastian",
      "Jake Nicola"
    ],
    "tags": []
  },
  "Part 2 Adam Russo Drew Sebastian Jake Nicola.mp4": {
    "mtime": 1764959744351277926,
    "performers": [
      "Adam Russo",
      "Drew Sebastian",
      "Jake Nicola"
    ],
    "tags": []
  },
  "Passionate Fuck Josh Peters Kaleb Kessler by Pride Studios.mp4": {
    "mtime": 1764959755139110569,
    "performers": [],
    "tags": []
  },
  "Patient Got Last Time Worked Really Well to Boost His Libido Doctor Blows.mp4": {
    "mtime": 1764959750755178591,
    "performers": [],
    "tags": []
  },
  "Paul Babaro and Nick Forte Blowjob Condom.mp4": {
    "mtime": 1764959761719008442,
    "performers": [],
    "tags": []
  },
  "Paul Carrigan Erotic Wrestling.mp4": {
    "mtime": 1764959763118986708,
    "performers": [
      "Paul Carrigan"
    ],
    "tags": []
  },
  "Paul Carrigan More on Top Scene 3.mp4": {
    "mtime": 1764959764074971866,
    "performers": [
      "Paul Carrigan"
    ],
    "tags": []
  },
  "Paul Carrigan More on Top Scene 5.mp4": {
    "mtime": 1764959765354951992,
    "performers": [
      "Paul Carrigan"
    ],
    "tags": []
  },
  "Paul Carrigan Tom Moore Blowjob.mp4": {
    "mtime": 1764959778406749264,
    "performers": [
      "Paul Carrigan",
      "Tom Moore"
    ],
    "tags": []
  },
  "Paul Codi Travis Connor and Sir Jet Fuck the CC Boys Queen of Sluts Part 3.mp4": {
    "mtime": 1764959779786727821,
    "performers": [
      "Sir Jet",
      "Paul Codi",
      "Travis Connor"
    ],
    "tags": []
  },
  "Paul Fresh Bareback Anal Fucks Hairy Muscle Jock.mp4": {
    "mtime": 1764959785662636499,
    "performers": [
      "Paul Fresh"
    ],
    "tags": []
  },
  "Paul Fresh Bruce Ford.mp4": {
    "mtime": 1764959781338703703,
    "performers": [
      "Bruce Ford",
      "Paul Fresh"
    ],
    "tags": []
  },
  "Paul Wagner and Holden Hunt Flip Fuck.mp4": {
    "mtime": 1764959795246487489,
    "performers": [
      "Holden Hunt",
      "Paul Wagner"
    ],
    "tags": []
  },
  "Paul Wagner and Logan Stevens Only Fans.mp4": {
    "mtime": 1764959797094458748,
    "performers": [
      "Logan Stevens",
      "Paul Wagner"
    ],
    "tags": []
  },
  "Pedro Daniel Flip Fuck Big Cock.mp4": {
    "mtime": 1764959798178441888,
    "performers": [],
    "tags": []
  },
  "Perfect Male Sex Damian Boss and Paco.mp4": {
    "mtime": 1764959798694433862,
    "performers": [
      "Damian Boss"
    ],
    "tags": []
  },
  "Perv Stepdaddy Ripped His Innocent Stepson Butthole with His Hard Shaft.mp4": {
    "mtime": 1764959799146426831,
    "performers": [],
    "tags": []
  },
  "Perv Stepdads Romeo Davis Markus Kage Take Turns Drilling Stepson on the Couch Dadcreep.mp4": {
    "mtime": 1764959821714075589,
    "performers": [
      "Markus Kage",
      "Romeo Davis"
    ],
    "tags": []
  },
  "Perverted Cop Fucks an Inmate Alpha Wolfe Drew Sebastian.mp4": {
    "mtime": 1764959800522405427,
    "performers": [
      "Alpha Wolfe",
      "Drew Sebastian"
    ],
    "tags": []
  },
  "Peter Marcus and Zane.mp4": {
    "mtime": 1764959818998117881,
    "performers": [
      "Peter Marcus"
    ],
    "tags": []
  },
  "Philippe Soulier Fucks Jake Daniel.mp4": {
    "mtime": 1764959826070007748,
    "performers": [
      "Jake Daniel",
      "Philippe Soulier"
    ],
    "tags": []
  },
  "Philly Flip Fuck Mike Gaite Blaze Austin Part 1.mp4": {
    "mtime": 1764959827329988121,
    "performers": [
      "Blaze Austin",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Philly Flip Fuck Mike Gaite Blaze Austin Part 2.mp4": {
    "mtime": 1764959828341972357,
    "performers": [
      "Blaze Austin",
      "Mike Gaite"
    ],
    "tags": []
  },
  "Phoenix Group Fuck Part 1 Jack Vidra.mp4": {
    "mtime": 1764959829329956966,
    "performers": [
      "Jack Vidra"
    ],
    "tags": []
  },
  "Phoenix Group Fuck Part 2 Jack Vidra.mp4": {
    "mtime": 1764959830413940079,
    "performers": [
      "Jack Vidra"
    ],
    "tags": []
  },
  "Picked up at a Paris Subway Station Bareback Bastards.mp4": {
    "mtime": 1764959831057930046,
    "performers": [],
    "tags": []
  },
  "Pierce Paris Alex Mecum.mp4": {
    "mtime": 1764959851041618554,
    "performers": [
      "Alex Mecum",
      "Pierce Paris"
    ],
    "tags": []
  },
  "Pig Boy Creampies Andy Onassis in Black Socks Flip Fuck Watch Online.mp4": {
    "mtime": 1764959832417908857,
    "performers": [
      "Andy Onassis"
    ],
    "tags": []
  },
  "Pig Foursome Teddy Torres Sir Peter Mateo Zagal Tomas.mp4": {
    "mtime": 1764959855873543193,
    "performers": [
      "Mateo Tomas",
      "Mateo Zagal",
      "Teddy Torres",
      "Sir Peter"
    ],
    "tags": []
  },
  "Piggy Musclebear Montreal Can Give a Mean Blowjob.mp4": {
    "mtime": 1764959856057540323,
    "performers": [
      "Musclebear Montreal"
    ],
    "tags": []
  },
  "Pizza Poker and Orgy feat Damien Crosse Dean Flynn Justin Riddick Korben David Mason Wyler Condom Group Vintage.mp4": {
    "mtime": 1764959857937510998,
    "performers": [
      "Damien Crosse",
      "Dean Flynn",
      "Justin Riddick",
      "Korben David",
      "Mason Wyler"
    ],
    "tags": []
  },
  "Play Buddy.mp4": {
    "mtime": 1764959877797201055,
    "performers": [],
    "tags": []
  },
  "Plumber Bareback.mp4": {
    "mtime": 1764959859289489907,
    "performers": [],
    "tags": []
  },
  "Plumber Colby Jansen Nic Sahara.mp4": {
    "mtime": 1764959863405425690,
    "performers": [
      "Colby Jansen"
    ],
    "tags": []
  },
  "Plumber's Pipe Jacob Lord Fixes Ridick's Morning Blues Bareback.mp4": {
    "mtime": 1764959860569469938,
    "performers": [
      "Jacob Lord",
      "Ridick"
    ],
    "tags": []
  },
  "Pol Prince Sir Peter Get Ready To Play Fencing.mp4": {
    "mtime": 1764959861501455397,
    "performers": [
      "Sir Peter",
      "Pol Prince"
    ],
    "tags": []
  },
  "Police Fuck.mp4": {
    "mtime": 1764959891972979653,
    "performers": [],
    "tags": []
  },
  "Police Officers Fucking.mp4": {
    "mtime": 1764959893848950343,
    "performers": [],
    "tags": []
  },
  "Policemen Rimming While Homos Engage in Raw Hammering Fun.mp4": {
    "mtime": 1764959888173039015,
    "performers": [],
    "tags": []
  },
  "Porfi Maximus Logan Stevens Amateur.mp4": {
    "mtime": 1764959938892245913,
    "performers": [
      "Logan Stevens",
      "Porfi Maximus"
    ],
    "tags": []
  },
  "Porn Archives Tight Ass Get\u2019s Rammed Raw Thomas Ride Dom Ully.mp4": {
    "mtime": 1764959912060665687,
    "performers": [
      "Dom Ully",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Porn Archives Watching Rugby.mp4": {
    "mtime": 1764959918448565791,
    "performers": [],
    "tags": []
  },
  "Porn Star Andy Onassis Reveals Behind The Scenes Movies.mp4": {
    "mtime": 1764959899672859337,
    "performers": [
      "Andy Onassis",
      "Andy Star"
    ],
    "tags": []
  },
  "Pound Me Hard Red Ryder Emilio Cley.mp4": {
    "mtime": 1764959929820387890,
    "performers": [
      "Red Ryder"
    ],
    "tags": []
  },
  "Pounding Ridick in Montreal Romeo Davis.mp4": {
    "mtime": 1764959960811902657,
    "performers": [
      "Ridick",
      "Romeo Davis"
    ],
    "tags": []
  },
  "Power Vers Orgy Part 1 Heights Hounds.mp4": {
    "mtime": 1764959937788263193,
    "performers": [],
    "tags": []
  },
  "Power Vers Orgy Part 2 Heights Hounds.mp4": {
    "mtime": 1764959938920245474,
    "performers": [],
    "tags": []
  },
  "Pranksters Part 13 Jake Porter Blaze Austin.mp4": {
    "mtime": 1764959940192225563,
    "performers": [
      "Blaze Austin",
      "Jake Porter"
    ],
    "tags": []
  },
  "Preston Steel and Dirk Willis.mp4": {
    "mtime": 1764959940392222433,
    "performers": [
      "Preston Steel",
      "Dirk Willis"
    ],
    "tags": []
  },
  "Pretty Boy Takes a Huge Cock Bareback Caleb Moreton.mp4": {
    "mtime": 1764959961427893007,
    "performers": [
      "Caleb Moreton"
    ],
    "tags": []
  },
  "Pride Studios Juicy Hunk Goes From Measuring Dicks to Barebacking Hard Roman Todd Kyler Drake.mp4": {
    "mtime": 1764959942984181856,
    "performers": [
      "Roman Todd"
    ],
    "tags": []
  },
  "Pride Studios Stepuncle Pounds My Tight Jock Ass Hard Bareback feat Asher Day.mp4": {
    "mtime": 1764959963239864618,
    "performers": [
      "Asher Day"
    ],
    "tags": []
  },
  "Pride Studios in the Heat of Passion They Found Each Other.mp4": {
    "mtime": 1764959942000197261,
    "performers": [],
    "tags": []
  },
  "Primetime Part 3 Bareback Office Fantasy Big Dick Hookup feat Michael Del Ray by Men Network.mp4": {
    "mtime": 1764953594805130438,
    "performers": [
      "Michael Del Ray"
    ],
    "tags": []
  },
  "Priorities Be Damned.mp4": {
    "mtime": 1764959964431845942,
    "performers": [],
  <!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Media Library</title>
  <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
  <link rel="manifest" href="/static/manifest.json" />
  <link rel="stylesheet" href="index.css" />
  <!-- Cytoscape.js and plugins (for Performers Graph tab) -->
  <link rel="stylesheet" href="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape.js-panzoom.css" />
  <script src="https://unpkg.com/cytoscape@3.27.0/dist/cytoscape.min.js"></script>
  <!-- fcose dependencies (must be loaded before fcose) -->
  <script src="https://unpkg.com/layout-base@2.0.1/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base@2.2.0/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js"></script>
  <script src="https://unpkg.com/webcola@3.4.0/WebCola/cola.min.js"></script>
  <script src="https://unpkg.com/cytoscape-cola@2.5.1/cytoscape-cola.js"></script>
  <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
  <script src="https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
  <script src="https://unpkg.com/klayjs@0.4.1/klay.js"></script>
  <script src="https://unpkg.com/cytoscape-klay@3.1.4/cytoscape-klay.js"></script>
  <script src="https://unpkg.com/cytoscape-spread@3.0.0/cytoscape-spread.js"></script>
  <script src="https://unpkg.com/cytoscape-cise@1.0.0/cytoscape-cise.js"></script>
  <script src="https://unpkg.com/cytoscape-avsdf@1.0.0/cytoscape-avsdf.js"></script>
  <script src="https://unpkg.com/cytoscape-euler@1.2.0/cytoscape-euler.js"></script>
  <script src="https://unpkg.com/cytoscape-cose-bilkent@4.1.0/cytoscape-cose-bilkent.js"></script>
  <script src="https://unpkg.com/cytoscape-cxtmenu@3.5.0/cytoscape-cxtmenu.js"></script>
  <script src="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape-panzoom.js"></script>
  <script>
    // Apply collapsed class ASAP to avoid post-load reflow when sidebar is persisted collapsed
    try {
      if (localStorage.getItem('mediaPlayer:sidebarCollapsed') === '1') {
        (document.documentElement || document.body).classList.add('has-sidebar-collapsed');
      }
    } catch (e) { }
  </script>
  <script>window.__JOBS_SSE_ENABLED = false; /* detected by client via /api/config; default false to avoid assumptions */</script>
  <script>
    // Fire TV/Android TV Detection
    (function() {
      const isFireTV = /silk|aftvb|afts|aft\w|aftt/i.test(navigator.userAgent);
      const isAndroidTV = /android.*tv|googletv/i.test(navigator.userAgent);

      if (isFireTV || isAndroidTV) {
        document.documentElement.classList.add('firetv');
        // Also add to <body> once DOM is ready so body-scoped rules can apply
        const addBodyClass = () => {
          try {
            document.body.classList.add('firetv');
          }
          catch (_) {}
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', addBodyClass, { once: true });
        }
        else {
          addBodyClass();
        }
      }
    })();
  </script>
  <script type="module" src="index.js"></script>
  <style>
    /* Column filter trigger and popover (List tab) */
    .col-filter-trigger { margin-left: 6px; font-size: 12px; opacity: .7; cursor: pointer; }
    .col-filter-trigger:hover { opacity: 1; }
    .list-filter-menu { position: absolute; z-index: 9999; background: var(--panel-bg, #111827); color: inherit; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.35); min-width: 220px; }
    .list-filter-menu .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .list-filter-menu .values { padding: 4px 0; }
    .list-filter-menu .values label { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 4px; font-size: 12px; }
    .list-filter-menu .values label span { color: var(--muted); }
    .list-filter-menu .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .list-filter-menu select.control-select { height: 26px; font-size: 12px; padding: 0 18px 0 8px; }
    .list-table tbody td.col-artifacts .chips-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .list-table tbody td.col-artifacts .chip { font-size: 11px; padding: 2px 6px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .list-table tbody td.col-artifacts .chip--ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.4); color: #bbf7d0; }
    .list-table tbody td.col-artifacts .chip--missing { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.45); color: #fecaca; }
  </style>
</head>

<body>
  <!-- Inline SVG sprite (all icon symbols embedded; external icons.svg removed) -->
  <svg aria-hidden="true" focusable="false" class="svg-sprite">
    <symbol id="icon-placeholder" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0e1016" />
          <stop offset="100%" stop-color="#1a2030" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g)" />
      <g fill="#3b4663">
        <rect x="30" y="40" width="260" height="100" rx="8" />
        <polygon points="140,90 140,70 200,90 140,110" fill="#6b7aa6" />
      </g>
    </symbol>
    <symbol id="icon-play" viewBox="0 0 24 24">
      <!-- Triangular play icon with slight inset for sharper edges -->
      <path d="M7 5v14l11-7-11-7z" fill="currentColor" />
    </symbol>
    <symbol id="icon-pause" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </symbol>
    <symbol id="icon-vol" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <!-- Sound waves (shown only in unmuted icon) -->
      <path d="M14 9.5c.9.6 1.5 1.5 1.5 2.5s-.6 1.9-1.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
      <path d="M16.5 7.5c1.4 1 2.5 2.6 2.5 4.5s-1.1 3.5-2.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
    </symbol>
    <symbol id="icon-muted" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <path d="M16 8l4 8M20 8l-4 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </symbol>
    <symbol id="icon-options" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </symbol>
    <symbol id="icon-gear" viewBox="0 0 24 24">
      <!-- Simplified cog with 6 teeth for clarity at small sizes -->
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
      <path d="M12 2.75l1.2.45a2 2 0 0 0 2.6-1.2l.3-.8 2.2 1.27-.3.8a2 2 0 0 0 1.2 2.6l.8.3v2.54l-.8.3a2 2 0 0 0-1.2 2.6l.3.8-2.2 1.27-.3-.8a2 2 0 0 0-2.6-1.2l-1.2.45-1.2-.45a2 2 0 0 0-2.6 1.2l-.3.8-2.2-1.27.3-.8a2 2 0 0 0-1.2-2.6l-.8-.3V8.37l.8-.3a2 2 0 0 0 1.2-2.6l-.3-.8L7.9 3.2l.3.8A2 2 0 0 0 10.8 5l1.2-.45z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" opacity="0.9" />
    </symbol>
    <symbol id="icon-caret" viewBox="0 0 24 24">
      <!-- filled chevron for better visibility (uses currentColor) -->
      <path d="M9 18 L15 12 L9 6 Z" fill="currentColor" />
    </symbol>
    <symbol id="icon-jump" viewBox="0 0 24 24">
      <path d="M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zm5.5-3.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </symbol>
    <symbol id="icon-clear" viewBox="0 0 24 24">
      <path d="M12 10.586 7.757 6.343 6.343 7.757 10.586 12l-4.243 4.243 1.414 1.414L12 13.414l4.243 4.243 1.414-1.414L13.414 12l4.243-4.243-1.414-1.414L12 10.586z" fill="currentColor" />
    </symbol>
    <symbol id="icon-reset" viewBox="0 0 24 24">
      <!-- Circular arrow reset icon -->
      <path d="M12 5a7 7 0 1 1-6.23 4H8a1 1 0 0 0 0-2H4.5A1.5 1.5 0 0 0 3 8.5V13a1 1 0 0 0 2 0V9.97A9 9 0 1 0 12 3v2z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" />
    </symbol>
    <symbol id="icon-restart" viewBox="0 0 24 24">
      <!-- Replay arrow for restarting current video -->
      <path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6s-2.69 6-6 6a6 6 0 0 1-5.65-4H6.1A8 8 0 0 0 20 15c0-4.42-3.58-8-8-8z" fill="currentColor" />
    </symbol>
    <symbol id="icon-prev" viewBox="0 0 24 24">
      <path d="M18 5v14l-8-7 8-7z" fill="currentColor" />
      <path d="M6 5h2v14H6z" fill="currentColor" />
    </symbol>
    <symbol id="icon-next" viewBox="0 0 24 24">
      <path d="M6 5v14l8-7-8-7z" fill="currentColor" />
      <path d="M16 5h2v14h-2z" fill="currentColor" />
    </symbol>
    <!-- Shuffle / Random icon (path supplied by user) -->
    <symbol id="icon-shuffle" viewBox="0 0 1792 1792">
      <path fill="currentColor" d="M666 481q-60 92-137 273-22-45-37-72.5t-40.5-63.5-51-56.5-63-35-81.5-14.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q250 0 410 225zm1126 799q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192q-32 0-85 .5t-81 1-73-1-71-5-64-10.5-63-18.5-58-28.5-59-40-55-53.5-56-69.5q59-93 136-273 22 45 37 72.5t40.5 63.5 51 56.5 63 35 81.5 14.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23zm0-896q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192h-256q-48 0-87 15t-69 45-51 61.5-45 77.5q-32 62-78 171-29 66-49.5 111t-54 105-64 100-74 83-90 68.5-106.5 42-128 16.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q48 0 87-15t69-45 51-61.5 45-77.5q32-62 78-171 29-66 49.5-111t54-105 64-100 74-83 90-68.5 106.5-42 128-16.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23z"/>
    </symbol>
    <!-- Repeat / Auto icon (two arrows in a circle) -->
    <symbol id="icon-repeat" viewBox="0 0 24 24">
      <path d="M7 7h7a5 5 0 0 1 0 10H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 7l2.5-2.5M7 7L4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17l-2.5 2.5M17 17l2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- Auto/loop icon for Random Auto (infinity-like circles) -->
    <symbol id="icon-auto-shuffle" viewBox="0 0 24 24">
      <path fill="currentColor" d="M20.288 9.463a4.856 4.856 0 0 0-4.336-2.3 4.586 4.586 0 0 0-3.343 1.767c.071.116.148.226.212.347l.879 1.652.134-.254a2.71 2.71 0 0 1 2.206-1.519 2.845 2.845 0 1 1 0 5.686 2.708 2.708 0 0 1-2.205-1.518L13.131 12l-1.193-2.26a4.709 4.709 0 0 0-3.89-2.581 4.845 4.845 0 1 0 0 9.682 4.586 4.586 0 0 0 3.343-1.767c-.071-.116-.148-.226-.212-.347l-.879-1.656-.134.254a2.71 2.71 0 0 1-2.206 1.519 2.855 2.855 0 0 1-2.559-1.369 2.825 2.825 0 0 1 0-2.946 2.862 2.862 0 0 1 2.442-1.374h.121a2.708 2.708 0 0 1 2.205 1.518l.7 1.327 1.193 2.26a4.709 4.709 0 0 0 3.89 2.581h.209a4.846 4.846 0 0 0 4.127-7.378z"/>
    </symbol>
    <symbol id="icon-cc" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M11.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5M17.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </symbol>
    <!-- Rating and Favorite Icons -->
    <symbol id="icon-star" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-star-filled" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
    </symbol>
    <symbol id="icon-heart" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-heart-filled" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="currentColor" />
    </symbol>
    <!-- Camera icon for frame download -->
    <symbol id="icon-camera" viewBox="0 0 24 24">
      <path d="M4 7h3.2l1.6-2h6.4l1.6 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="18" cy="9" r="1" fill="currentColor" />
    </symbol>
  </svg>

  <!-- Hidden SVG filters for video color matrix (kept with SVG definitions) -->
  <svg width="0" height="0" class="sprite-defs-hidden" aria-hidden="true" focusable="false">
    <filter id="playerColorMatrix" color-interpolation-filters="sRGB">
      <feColorMatrix id="playerColorMatrixValues" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>
  </svg>

  <!-- Templates: Settings JSON panels (Health, Config) -->
  <template id="settingsHealthTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Health</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm health-refresh" title="Refresh health">Refresh</button>
      </header>
      <pre class="json-pre health-pre" aria-live="polite"></pre>
    </section>
  </template>
  <template id="settingsConfigTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Config</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm config-refresh" title="Refresh config">Refresh</button>
      </header>
      <pre class="json-pre config-pre" aria-live="polite"></pre>
    </section>
  </template>

  <!-- Templates: Performers (card + empty state) -->
  <template id="performerCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select performer"></div>
      <div class="pc-top">
        <div class="pc-avatar" role="button" tabindex="0" aria-label="Upload image">
          <img class="pc-avatar-img" alt="" loading="lazy" hidden />
          <svg class="pc-avatar-icon" width="18" height="18" aria-hidden="true"><use href="#icon-camera"></use></svg>
        </div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <div class="pc-metadata hint-sm"></div>
        </div>
        <div class="pc-countwrap">
          <div class="pc-count" title="Files">0</div>
          <span class="pc-face-indicator" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </template>
  <!-- Templates: Tags (card) -->
  <template id="tagCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select tag"></div>
      <div class="pc-top">
        <div class="pc-avatar" aria-hidden="true"></div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <button class="tag-open-library-btn" type="button">Show in Library</button>
        </div>
        <span class="pc-count" title=""></span>
      </div>
    </div>
  </template>
  <template id="emptyHintTemplate">
    <div class="hint-sm empty-hint"></div>
  </template>

  <!-- Performer Import Preview Modal (moved inside <body> and grouped with other modals) -->
  <div id="performerImportPreviewModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <strong>Import Performers Preview</strong>
        <button id="performerImportPreviewClose" class="btn-sm" title="Cancel">Cancel</button>
      </header>
      <div class="body panel-body--scroll">
        <div class="hint-sm hint-sm--muted">The following performers will be imported:</div>
        <div id="performerImportPreviewList" class="performer-import-list"></div>
      </div>
      <footer class="panel-footer--actions">
        <button id="performerImportPreviewConfirm" class="btn">Import</button>
      </footer>
    </div>
  </div>
  <!-- Folder Picker Modal -->
  <div id="modal" class="modal" hidden>
    <div class="panel">
      <header>
        <div class="crumbs" id="crumbs"></div>
      </header>
      <div class="body">
        <div class="dirlist" id="dirlist"></div>
      </div>
      <div class="actions">
        <button class="btn" id="chooseBtn">Choose this folder</button>
        <button class="btn" id="cancelBtn">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Image Preview Modal -->
  <div id="imgModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong>Heatmap Preview</strong>
          <button class="btn" id="imgModalClose">Close</button>
        </div>
      </header>
      <div class="body panel--image-body">
        <img id="imgModalImage" alt="Heatmap" class="panel-image" />
      </div>
    </div>
  </div>
  <!-- Performer Auto-Match Modal (grouped with other modals) -->
  <div id="performerAutoMatchModal" class="modal" hidden>
    <div class="panel panel--wide">
      <header class="flex items-center justify-between gap-16">
        <strong>Auto‑Match Performers</strong>
        <div class="flex gap-8">
          <button id="perfAutoMatchClose" class="btn-sm" title="Close">Close</button>
        </div>
      </header>
      <div class="body panel-body--tall">
        <div class="hint-sm mt-6">Preview scans all videos using registry performers. Apply writes to sidecars.</div>
        <div id="perfAutoMatchStatus" class="hint-sm opacity-75">Awaiting preview.</div>
        <table class="job-table autotag-table mt-8" id="perfAutoMatchTable">
          <thead>
            <tr>
              <th>File</th>
              <th>Performers</th>
            </tr>
          </thead>
          <tbody id="perfAutoMatchTbody"></tbody>
        </table>
      </div>
      <footer class="panel-footer--actions">
        <span class="hint-sm hint-sm--muted">Esc or Close to dismiss • Changes only written after Apply.</span>
        <div class="flex-row gap-8">
          <button id="perfAutoApplyBtnFooter" class="btn-sm" disabled>Apply</button>
          <button id="perfAutoCancelBtn" class="btn-sm">Cancel</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Performer Image Face Box Preview Modal -->
  <div id="faceBoxModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong id="faceBoxTitle">Image Preview</strong>
          <div class="flex-row gap-8">
            <button class="btn" id="faceBoxDetectBtn" title="Auto-detect face box" disabled>Detect</button>
            <button class="btn" id="faceBoxUploadBtn" title="Upload new image">Upload</button>
            <button class="btn" id="faceBoxClose">Close</button>
          </div>
        </div>
      </header>
      <div class="body panel--image-body">
        <div class="facebox-stage">
          <img id="faceBoxImg" alt="Performer" class="panel-image" />
          <div id="faceBoxOverlay" class="facebox-overlay" hidden>
            <div class="handle" aria-hidden="true"></div>
          </div>
          <div id="faceBoxLinks" class="facebox-links hidden" aria-label="External performer links"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tag Merge Modal -->
  <div id="tagMergeModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Merge Tags</h3>
        <button id="tagMergeClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="hint-sm mb-8">Choose the tag name to keep. The other selected tags will be merged into it.</div>
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagMergeSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label class="hint-sm w-120">Keep name</label>
          <div id="tagMergeChoiceList" class="merge-choice-list" role="radiogroup" aria-live="polite"></div>
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagMergeCancel" class="btn">Cancel</button>
        <button id="tagMergeConfirm" class="btn btn-primary" disabled>Merge</button>
      </footer>
    </div>
  </div>

  <!-- Tag Rename Modal -->
  <div id="tagRenameModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Rename Tag</h3>
        <button id="tagRenameClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagRenameSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label for="tagRenameInput" class="hint-sm w-120">New name</label>
          <input id="tagRenameInput" type="text" class="control-input w-100" placeholder="e.g. Vintage" />
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagRenameCancel" class="btn">Cancel</button>
        <button id="tagRenameConfirm" class="btn btn-primary" disabled>Rename</button>
      </footer>
    </div>
  </div>

  <!-- Error modal (predeclared to avoid dynamic injection) -->
  <div id="errorModal" class="modal" hidden>
    <div class="modal-content modal-content--wide">
      <div class="modal-header modal-header--spaced">
        <h3 class="m-0">Job Error</h3>

        <!-- Small directory list item (used by folder picker) -->
        <template id="dirListItemTemplate">
          <div class="dir">
            <div class="icon"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirEmptyTemplate">
          <div class="dir muted dir-empty">
            <div class="icon dim" aria-hidden="true"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirErrorTemplate">
          <div class="dir dir-error">
            <div class="name"></div>
          </div>
        </template>

        <!-- Autotag preview row template -->
        <template id="autotagRowTemplate">
          <tr>
            <td class="break file"></td>
            <td class="tags"></td>
          </tr>
        </template>

        <!-- Job table row template -->
        <template id="jobRowTemplate">
          <tr>
            <td class="cell-time-start"></td>
            <td class="cell-time-end"></td>
            <td class="cell-task"></td>
            <td class="cell-file" title=""></td>
            <td class="cell-status">
              <span class="job-status"></span>
            </td>
            <td class="cell-progress">
              <div class="job-progress">
                <div class="job-progress-fill"></div>
              </div>
              <div class="cell-sub">
                <span class="pct"></span>
              </div>
            </td>
            <td class="cell-action"></td>
          </tr>
        </template>
        <!-- Marker Row Template -->
        <template id="markerRowTemplate">
          <div class="marker-row">
            <div class="marker-name-label marker-name-label--editable"></div>
            <div class="marker-time-label marker-time-label--editable"></div>
            <button type="button" class="marker-jump marker-btn-icon" aria-label="Jump to marker" title="Jump">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-jump" />
              </svg>
            </button>
            <button type="button" class="marker-remove marker-btn-icon" aria-label="Remove marker" title="Remove">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-clear" />
              </svg>
            </button>
          </div>
        </template>
        <!-- Shared chip templates -->
        <template id="chipTemplate">
          <span class="chip" title="">
            <span class="chip-label"></span>
            <button type="button" class="remove chip-remove" aria-label="Remove">×</button>
          </span>
        </template>
        <template id="chipSuggestTemplate">
          <button type="button" class="chip chip-suggest" title="">
            <span class="chip-label"></span>
          </button>
        </template>
        <template id="bulkSuggestionsLabelTemplate">
          <div class="hint-sm hint-sm--muted mb-4">Matches:</div>
        </template>
        <!-- List filter templates -->
        <template id="listFilterMenuTemplate">
          <div class="list-filter-menu"></div>
        </template>
        <template id="listFilterRowTemplate">
          <div class="row"></div>
        </template>
        <template id="listFilterValuesTemplate">
          <div class="values"></div>
        </template>
        <template id="listFilterFooterTemplate">
          <div class="footer"></div>
        </template>
        <template id="listFilterButtonTemplate">
          <button type="button" class="btn-sm"></button>
        </template>
        <template id="listFilterCheckboxLabelTemplate">
          <label class="list-filter-checkbox">
            <input type="checkbox" />
            <span></span>
          </label>
        </template>
        <template id="listFilterSelectTemplate">
          <select class="control-select"></select>
        </template>
        <template id="listFilterNumberInputTemplate">
          <input type="number" class="chips-input" placeholder="value" />
        </template>
        <template id="listFilterDateInputTemplate">
          <input type="datetime-local" class="chips-input" />
        </template>
        <template id="listFilterHintTemplate">
          <span class="hint-sm"></span>
        </template>
        <template id="listFilterMessageTemplate">
          <div class="row">
            <span class="hint-sm"></span>
          </div>
        </template>
        <template id="listFilterArtifactRowTemplate">
          <label class="list-filter-artifact">
            <span class="label"></span>
            <select class="control-select"></select>
          </label>
        </template>
        <template id="orphanFileTemplate">
          <div class="orphan-file" title="">
            <span class="orphan-file__text"></span>
          </div>
        </template>
        <!-- Segmented select templates -->
        <template id="segmentedControlTemplate">
          <div class="segmented-control" role="group"></div>
        </template>
        <template id="segmentedControlButtonTemplate">
          <button type="button" class="segmented-control__btn" data-value=""></button>
        </template>
        <!-- Artifact filter popover row template -->
        <template id="artifactFilterRowTemplate">
          <label class="artifact-filter-row">
            <span class="artifact-filter-name"></span>
            <select class="control-select artifact-filter-select">
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </template>
        <template id="artifactChipTemplate">
          <div class="badge-pill artifact-chip" data-key="" data-present="0">
            <span class="label"></span>
            <span class="status" aria-hidden="true">✗</span>
          </div>
        </template>
        <!-- Tags registry list item template -->
        <template id="registryItemTemplate">
          <div class="registry-item" data-selected="0"></div>
        </template>
        <!-- Breadcrumb segment template -->
        <template id="crumbSegmentTemplate">
          <span class="seg"></span>
        </template>


        <!-- List tab: table cell template -->
        <template id="listCellTemplate">
          <td class="list-cell"></td>
        </template>

        <!-- List tab: table row template -->
        <template id="listRowTemplate">
          <tr class="list-row" data-selected="0" data-path=""></tr>
        </template>

        <!-- List tab: head cell template -->
        <template id="listHeadCellTemplate">
          <th>
            <span class="col-drag-handle" title="Drag to reorder" draggable="true">⋮⋮</span>
            <div class="list-head-cell"></div>
            <div class="col-resizer"></div>
          </th>
        </template>

        <!-- List tab: column settings item template -->
        <template id="listColumnItemTemplate">
          <div class="list-col-item">
            <span class="drag-handle" title="Drag to reorder" aria-hidden="true" draggable="true">⋮⋮</span>
            <label>
              <input type="checkbox" class="list-col-visible" checked />
              <span class="list-col-label">Column</span>
            </label>
          </div>
        </template>
        <!-- Toast notification template -->
        <template id="toastTemplate">
          <div class="toast" role="status" aria-live="polite">
            <span class="toast-text"></span>
          </div>
        </template>
        <button class="btn" id="errorModalClose">Close</button>
      </div>
      <pre id="errorModalText" class="error-pre"></pre>
    </div>
  </div>
  <!-- Generic message modal (replaces legacy alert usage) -->
  <div id="messageModal" class="modal" hidden>
    <div class="modal-content">
      <div class="modal-header modal-header--spaced">
        <h3 id="messageModalTitle" class="m-0">Notice</h3>
        <button id="messageModalClose" class="btn-sm" aria-label="Close">Close</button>
      </div>
      <div class="modal-body">
        <p id="messageModalBody" class="m-0"></p>
      </div>
      <footer class="panel-footer--actions mt-12">
        <div class="flex-row gap-8 jc-end">
          <button id="messageModalOk" class="btn">OK</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Templates: API Explorer -->
  <template id="apiGroupTemplate">
    <section class="api-group" data-open="1">
      <header class="api-group__header flex-row gap-10" role="button" tabindex="0" aria-expanded="true">
        <span class="api-group__caret" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24"><use href="#icon-caret"></use></svg>
        </span>
        <h3 class="api-group__title"></h3>
        <button class="btn-xs api-group__expand-all" title="Expand/collapse all children" style="display: none;">±</button>
        <span class="ml-auto hint-sm api-group__count"></span>
      </header>
      <div class="api-group__body"></div>
    </section>
  </template>
  <template id="apiEndpointTemplate">
    <div class="card api-endpoint" data-open="0">
  <div class="api-endpoint__header row" role="button" tabindex="0" aria-expanded="false">
        <span class="method-badge">GET</span>
        <code class="api-path w-100"></code>
        <button class="btn-sm api-toggle" aria-expanded="false" aria-label="Toggle details">Details</button>
      </div>
      <div class="api-endpoint__body hidden">
        <div class="hint-sm api-summary"></div>
        <div class="api-params" role="group" aria-label="Parameters"></div>
        <div class="api-body" hidden>
          <label class="hint-sm">Request Body (JSON)
            <textarea class="api-body-text control-textarea w-100" rows="6" placeholder="{ }"></textarea>
          </label>
        </div>
        <div class="row gap-10 mt-12">
          <button class="btn-sm api-run">Run</button>
          <span class="hint-sm api-status"></span>
        </div>
        <pre class="json-pre api-response mt-12" aria-live="polite"></pre>
      </div>
    </div>
  </template>

  <header>
    <!-- Tab Navigation only (top bar removed) -->
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="player-panel" id="player-tab" data-tab="player">
        Player
      </button>
      <button class="tab-button active" role="tab" aria-selected="true" aria-controls="library-panel" id="library-tab" data-tab="library">
        Library
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="list-panel" id="list-tab" data-tab="list">
        List
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="similar-panel" id="similar-tab" data-tab="similar">
        Similar
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tasks-panel" id="tasks-tab" data-tab="tasks">
        Tasks
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="performers-panel" id="performers-tab" data-tab="performers">
        Performers
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="graph-panel" id="graph-tab" data-tab="graph">
        Graph
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="connections-panel" id="connections-tab" data-tab="connections">
        Connections
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tags-panel" id="tags-tab" data-tab="tags">
        Tags
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="stats-panel" id="stats-tab" data-tab="stats">
        Stats
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="settings-panel" id="settings-tab" data-tab="settings">
        Settings
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="api-panel" id="api-tab" data-tab="api">
        API
      </button>
    </nav>
  </header>

  <main>
    <!-- Tab Panels -->
    <div class="tab-panels">
      <!-- Connections Tab Panel (minimal: image-only nodes) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="connections-tab" id="connections-panel" hidden>
        <section class="graph-panel graph-panel--connections">
          <div class="graph-controls graph-controls--connections">
            <div class="connections-controls-header">
              <strong>Connections Graph</strong>
              <span id="connectionsStatus" class="hint-sm connections-status" aria-live="polite"></span>
            </div>
            <label class="hint-sm connections-toggle" title="Show performers even if no portrait is available">
              <input id="connectionsShowImageless" type="checkbox" checked />
              <span>Show imageless performers</span>
            </label>
            <label class="hint-sm" title="Minimum number of videos a performer must appear in to be included">
              Min performer videos
              <input id="connectionsMinVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum shared videos required for an edge to be drawn">
              Min shared videos
              <input id="connectionsMinEdgeVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum number of connections (edges) a performer must have to remain visible">
              Min edges per performer
              <input id="connectionsMinEdges" type="number" class="control-input w-120" value="0" min="0" step="1" />
            </label>
            <label class="hint-sm connections-toggle" title="Show performers that have no qualifying connections">
              <input id="connectionsShowOrphans" type="checkbox" checked />
              <span>Show orphans</span>
            </label>
            <label class="hint-sm connections-toggle" title="Scale edge thickness based on shared video counts">
              <input id="connectionsVariableThickness" type="checkbox" checked />
              <span>Variable edge width</span>
            </label>
            <label class="hint-sm" title="Choose a layout algorithm for the connections graph">
              Layout
              <select id="connectionsLayoutSelect" class="control-input w-120">
                <option value="fcose">fCoSE (force)</option>
                <option value="cose">CoSE</option>
                <option value="cose-bilkent">CoSE Bilkent</option>
                <option value="cise">CiSE</option>
                <option value="avsdf">AVSDF</option>
                <option value="spread">Spread</option>
                <option value="cola">Cola</option>
                <option value="dagre">Dagre</option>
                <option value="klay">Klay</option>
                <option value="concentric">Concentric</option>
                <option value="circle">Circle</option>
                <option value="breadthfirst">Breadthfirst</option>
                <option value="grid">Grid</option>
                <option value="random">Random</option>
                <option value="euler">Euler</option>
              </select>
            </label>
            <label class="hint-sm" title="Ideal edge length for force-based layouts (higher spreads nodes further apart)">
              Edge length
              <input id="connectionsEdgeLen" type="range" min="40" max="340" step="10" value="140" />
              <span class="connections-range-value" id="connectionsEdgeLenValue">140 px</span>
            </label>
            <label class="hint-sm" title="Node repulsion for force-based layouts (higher keeps nodes farther apart)">
              Node repulsion
              <input id="connectionsRepulsion" type="range" min="2000" max="160000" step="1000" value="60000" />
              <span class="connections-range-value" id="connectionsRepulsionValue">60k</span>
            </label>
            <div class="connections-actions">
              <button id="connectionsFitBtn" class="btn-sm" type="button">Fit Graph</button>
              <button id="connectionsRefreshBtn" class="btn-sm" type="button">Refresh</button>
            </div>
          </div>
          <div id="connectionsCyContainer">
            <div id="cyConnections" aria-label="Connections graph" role="application"></div>
          </div>
        </section>
      </div>
      <!-- Graph Tab Panel (Performers Co‑appearance) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="graph-tab" id="graph-panel" hidden>
        <section class="graph-panel">
          <div class="graph-controls">
            <strong>Performers Graph</strong>
            <span id="graphStatus" class="hint-sm" style="opacity:.8;"></span>
            <label class="hint-sm">
              Min videos
              <input id="graphMinCount" type="number" class="control-input w-120" value="2" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum number of connections (edges) a performer must have to be shown; > 0 hides isolated nodes">
              Min edges
              <input id="graphMinEdges" type="number" class="control-input w-120" value="0" min="0" step="1" />
            </label>
            <label class="hint-sm">
              Layout
              <select id="graphLayoutSelect" class="control-input w-120">
                <option value="fcose">fCoSE</option>
                <option value="cose">CoSE</option>
                <option value="circle">Circle</option>
                <option value="grid">Grid</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label class="hint-sm" title="Ideal edge length for force layouts (higher = looser)">
              Edge length
              <input id="graphEdgeLen" type="range" min="40" max="300" step="10" value="120" />
            </label>
            <label class="hint-sm" title="Node repulsion for force layouts (higher = more spread)">
              Node repulsion
              <input id="graphRepulsion" type="range" min="1000" max="120000" step="1000" value="50000" />
            </label>
            <label class="hint-sm" title="Render edges as straight lines">
              <input id="graphStraightEdges" type="checkbox" checked />
              Straight lines
            </label>
            <input id="graphSearchInput" class="control-input" placeholder="Search performer…" />
            <button id="graphRefreshBtn" class="btn-sm">Refresh</button>
            <div class="ml-auto"></div>
            <button id="graphNeighborhoodBtn" class="btn-sm" title="Reveal neighborhood of matches/selection">Reveal Neighborhood</button>
            <button id="graphClearBtn" class="btn-sm" title="Clear filters and highlights">Clear</button>
            <button id="graphFitBtn" class="btn-sm" title="Fit all">Fit</button>
          </div>
          <div id="cyContainer">
            <div id="cyGraph" aria-label="Performers graph" role="application"></div>
          </div>
          <div id="graphTooltip" hidden></div>
        </section>
      </div>
      <!-- Player Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="player-tab" id="player-panel" hidden>
        <!-- Split layout now stretches full height -->
        <div class="player-split">
          <div class="player-sidebar">
            <div id="sidebarAccordion" class="accordion">
              <div class="acc-item" data-key="file-info">
                <button class="acc-header" aria-expanded="true">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  File Info
                </button>
                <div class="acc-panel">
                  <div class="fi-thumbnail-wrap" id="fiThumbnailWrap">
                    <div class="fi-thumbnail-box">
                      <img id="fiThumbnail" alt="Thumbnail" />
                      <button id="fiSetThumbnailBtn" class="btn btn-xs fi-thumbnail-set" title="Set thumbnail from current frame">✚</button>
                    </div>
                  </div>
                  <div class="file-info-grid" role="table" aria-label="File metadata">
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Path</div>
                      <div class="fi-value break" id="fiPath" role="cell" title="">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Duration</div>
                      <div class="fi-value" id="fiDuration" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Resolution</div>
                      <div class="fi-value" id="fiResolution" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Codec</div>
                      <div class="fi-value" id="fiVideoCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Codec</div>
                      <div class="fi-value" id="fiAudioCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Bitrate</div>
                      <div class="fi-value" id="fiBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Bitrate</div>
                      <div class="fi-value" id="fiVBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Bitrate</div>
                      <div class="fi-value" id="fiABitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Size</div>
                      <div class="fi-value" id="fiSize" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Modified</div>
                      <div class="fi-value" id="fiModified" role="cell">—</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="markers">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Markers
                </button>
                <div class="acc-panel hidden">
                  <div class="markers-actions">
                    <button id="btnAddMarker" class="btn btn-xs" type="button" title="Add marker at current time">Add Marker</button>
                    <button id="btnSetIntroEnd" class="btn btn-xs" type="button" title="Set intro end (default start point)">Set Intro</button>
                    <button id="btnSetOutroBegin" class="btn btn-xs" type="button" title="Set outro begin (default end point)">Set Outro</button>
                  </div>
                  <div class="markers-header markers-header--spaced mt-0">
                    <div class="hint-sm hint-sm--muted">Edit time, label, or type. Enter or blur to save. Color indicates marker type.</div>
                  </div>
                  <div id="markersList" class="markers-list" aria-live="polite" aria-label="Marker list"></div>
                </div>
              </div>
              <div class="acc-item" data-key="artifacts">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Artifacts
                </button>
                <div class="acc-panel hidden">
                  <div class="artifact-badges-flat" id="artifactBadgesSidebar">
                    <div id="badge-metadata" class="badge-pill artifact-gen-btn" data-artifact="metadata" title="Metadata">
                      <span>Metadata</span><span id="badge-metadata-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-thumbnail" class="badge-pill artifact-gen-btn" data-artifact="thumbnail" title="Primary thumbnail">
                      <span>Thumbnail</span><span id="badge-thumbnail-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-preview" class="badge-pill artifact-gen-btn" data-artifact="preview" title="Preview video">
                      <span>Preview</span><span id="badge-preview-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-phash" class="badge-pill artifact-gen-btn" data-artifact="phash" title="Perceptual hash">
                      <span>pHash</span>
                      <span id="badge-phash-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-sprites" class="badge-pill artifact-gen-btn" data-artifact="sprites" title="Sprite sheet thumbnails (timeline scrub)">
                      <span>Sprites</span><span id="badge-sprites-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-heatmap" class="badge-pill artifact-gen-btn" data-artifact="heatmap" title="Heatmap timeline overlay">
                      <span>Heatmap</span><span id="badge-heatmap-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-markers" class="badge-pill artifact-gen-btn" data-artifact="markers" title="Marker / chapter markers">
                      <span>Markers</span><span id="badge-markers-status" aria-hidden="true">?</span>
                    </div>
                  </div>
                  <!-- Sidebar artifact previews (compact) -->
                  <div id="sidebarSpritePreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Sprite Sheet</div>
                    <img id="sidebarSpriteImage" alt="Sprites" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div id="sidebarHeatmapPreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Heatmap</div>
                    <img id="sidebarHeatmapImage" alt="Heatmap" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div class="hint-sm mt-6 hint-sm--muted line-13">Click a missing badge (✗) or Generate button to start. ✓ indicates the artifact is present. Spinner shows job progress.</div>
                </div>
              </div>
              <div class="acc-item" data-key="actions">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Actions
                </button>
                <div class="acc-panel hidden">
                  <div class="flex-row gap-8 mt-4" role="group" aria-label="Video actions">
                    <button id="btnResetPlayer" class="btn-sm" type="button" title="Reset player (unload video)" aria-label="Reset player">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-reset" /></svg>
                      <span class="ml-4">Reset player</span>
                    </button>
                    <button id="btnDownloadFrame" class="btn-sm" title="Download current frame as PNG">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-camera" /></svg>
                      <span class="ml-4">Download frame</span>
                    </button>
                    <button id="btnConvert" class="btn-sm" disabled title="Coming soon">Convert</button>
                    <button id="btnCompress" class="btn-sm" disabled title="Coming soon">Compress</button>
                    <button id="btnTrim" class="btn-sm" disabled title="Coming soon">Trim</button>
                    <button id="btnSplit" class="btn-sm" disabled title="Coming soon">Split</button>
                    <button id="btnConcat" class="btn-sm" disabled title="Coming soon">Concat</button>
                  </div>
                  <div class="hint-sm hint-sm--muted mt-6">Advanced actions (convert, compress, trim, split, concat) are planned. Download frame works locally now.</div>
                </div>
              </div>
              <div class="acc-item" data-key="video-settings">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Video
                </button>
                <div class="acc-panel hidden">
                  <div class="video-metadata-chips">
                    <div class="chips-group" id="videoPerformersGroup">
                      <div class="chips-label">Performers</div>
                      <div class="chips-list" id="videoPerformers"></div>
                      <input type="text" id="videoPerformerInput" class="chips-input" placeholder="Add performer…" aria-label="Add performer" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoPerformerSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-group" id="videoTagsGroup">
                      <div class="chips-label">Tags</div>
                      <div class="chips-list" id="videoTags"></div>
                      <input type="text" id="videoTagInput" class="chips-input" placeholder="Add tag…" aria-label="Add tag" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoTagSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-hint hint-sm hint-sm--muted mt-4">Enter to add · Click a chip to view · Click × to remove</div>
                    <!-- Rating (5-star) + Favorite toggle in header -->
                    <div class="chips-group" id="videoRatingGroup">
                      <div class="chips-label">Rating</div>
                      <div class="rating-row">
                        <div class="rating-stars" id="videoRating" role="radiogroup" aria-label="Rating (1 to 5)">
                        <span class="star" role="radio" tabindex="0" data-value="1" aria-label="1 star" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="2" aria-label="2 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="3" aria-label="3 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="4" aria-label="4 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="5" aria-label="5 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        </div>
                        <button id="videoFavorite" class="btn-sm btn-icon favorite-toggle" aria-pressed="false" title="Toggle favorite">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart-filled"></use></svg>
                        </button>
                      </div>
                    </div>
                    <!-- Description -->
                    <div class="chips-group" id="videoDescriptionGroup">
                      <div class="chips-label">Description</div>
                      <div id="videoDescription" class="desc-input" role="textbox" aria-label="Video description" tabindex="0" data-placeholder="Add a description…"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="filters">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Filters
                </button>
                <div class="acc-panel hidden">
                  <div class="video-adjustments" id="videoAdjustments" aria-label="Video image adjustment controls">
                    <div class="adj-row">
                      <label for="adjBrightness">Brightness</label>
                      <input type="range" id="adjBrightness" class="adj-slider vol-slider" min="0.20" max="2.00" step="0.01" value="1" aria-label="Brightness" />
                      <span class="adj-val" id="adjBrightnessVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjContrast">Contrast</label>
                      <input type="range" id="adjContrast" class="adj-slider vol-slider" min="0.50" max="2.00" step="0.01" value="1" aria-label="Contrast" />
                      <span class="adj-val" id="adjContrastVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjSaturation">Saturation</label>
                      <input type="range" id="adjSaturation" class="adj-slider vol-slider" min="0.00" max="3.00" step="0.01" value="1" aria-label="Saturation" />
                      <span class="adj-val" id="adjSaturationVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjHue">Hue</label>
                      <input type="range" id="adjHue" class="adj-slider vol-slider" min="0" max="360" step="1" value="0" aria-label="Hue rotation" />
                      <span class="adj-val" id="adjHueVal">0°</span>
                    </div>
                    <div class="adj-actions mt-4">
                      <button type="button" id="adjResetBtn" class="btn btn-xs" title="Reset all adjustments">Reset</button>
                    </div>
                    <div class="hint-sm hint-sm--muted mt-6">Adjustments apply locally using CSS filters and persist in this browser. They do not modify files.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Small non-intrusive sidebar toggle between the sidebar and main player -->
          <button id="sidebarToggle" class="sidebar-toggle" aria-expanded="true" aria-label="Toggle sidebar" title="Toggle sidebar">
            <!-- use centralized sprite symbol (icon-caret). CSS will rotate this when collapsed -->
            <svg class="sidebar-toggle__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <title>Toggle sidebar</title>
              <!-- primary: reference centralized symbol -->
              <use href="#icon-caret" />
              <!-- fallback: inline path so the caret is visible if <use> isn't applied by the UA -->
              <path class="sidebar-toggle__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
            </svg>
          </button>
          <div class="player-main">
            <div id="playerOverlayBar" class="player-overlay-bar">
              <span id="playerTitle" class="player-title"></span>
            </div>
            <video id="playerVideo" class="player-video" playsinline preload="metadata"></video>
            <!-- Subtitle overlay rendered by JS -->
            <div id="subtitleOverlay" class="subtitle-line bottom" aria-live="polite" hidden></div>
            <!-- Floating scrubber (timeline) overlay at bottom -->
            <div id="playerScrubber" class="player-scrubber-bar">
              <div class="scrubber-track" id="playerScrubberTrack">
                <!-- Heatmap layers moved inside track so width/position match exactly -->
                <div id="timelineHeatmap" class="timeline-heatmap" aria-hidden="true"></div>
                <canvas id="timelineHeatmapCanvas" class="timeline-heatmap-canvas" aria-hidden="true"></canvas>
                <!-- Legacy timeline markers layer expected by JS (renderMarkers) -->
                <div id="timelineMarkers" class="timeline-markers-layer" aria-hidden="true"></div>
                <div class="scrubber-buffer" id="playerScrubberBuffer"></div>
                <div class="scrubber-progress" id="playerScrubberProgress"></div>
              </div>
              <div id="playerControls" class="scrubber-status-row player-controls">
                <span class="scrubber-time" id="playerScrubberTime">00:00 / 00:00</span>
                <div class="player-controls-groups">
                  <div class="player-control-cluster cluster-transport" aria-label="Playback controls">
                    <button id="btnSeekBack30" class="btn btn-xs" type="button" title="Back 30 seconds" aria-label="Back 30 seconds">−30s</button>
                    <button id="btnPrevFrame" class="btn btn-xs" type="button" title="Previous frame" aria-label="Previous frame">−1f</button>
                    <button id="btnPlayPause" class="btn btn-xs" type="button" title="Play / Pause">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-play" class="icon-play"></use>
                        <use href="#icon-pause" class="icon-pause hidden"></use>
                      </svg>
                    </button>
                    <button id="btnNextFrame" class="btn btn-xs" type="button" title="Next frame" aria-label="Next frame">+1f</button>
                    <button id="btnSeekFwd30" class="btn btn-xs" type="button" title="Forward 30 seconds" aria-label="Forward 30 seconds">+30s</button>
                  </div>
                  <div class="player-control-cluster cluster-audio" aria-label="Audio controls">
                    <button id="btnMute" class="btn btn-xs" type="button" title="Mute / Unmute">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-vol" class="icon-vol"></use>
                        <use href="#icon-muted" class="icon-muted hidden"></use>
                      </svg>
                    </button>
                    <div class="player-volume">
                      <input id="volSlider" class="vol-slider" type="range" min="0" max="1" step="0.01" value="1" title="Volume" />
                    </div>
                  </div>
                  <div class="player-control-cluster cluster-navigate" aria-label="Navigation controls">
                    <button id="btnPrevVideo" class="btn btn-xs" type="button" title="Previous video" aria-label="Previous video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-prev"></use>
                      </svg>
                      <span class="sr-only">Previous video</span>
                    </button>
                    <button id="btnRestartVideo" class="btn btn-xs" type="button" title="Restart video" aria-label="Restart video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-restart"></use>
                      </svg>
                    </button>
                    <button id="btnFullscreen" class="btn btn-xs" type="button" title="Toggle fullscreen" aria-label="Fullscreen">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM6 14v4h4v2H4v-6h2zm12 0h2v6h-6v-2h4v-4z" />
                      </svg>
                    </button>
                    <button id="btnNextVideo" class="btn btn-xs" type="button" title="Next video" aria-label="Next video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-next"></use>
                      </svg>
                      <span class="sr-only">Next video</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Hover sprite preview (dynamically positioned) -->
            <div id="spritePreview"></div>
          </div>
        </div>
      </div>

      <!-- Library Tab Panel -->
      <div class="tab-panel active" role="tabpanel" aria-labelledby="library-tab" id="library-panel">
        <div class="controls-panel sticky-enabled library-toolbar">
          <div class="library-toolbar__surface">
            <div class="controls-row library-toolbar__row library-toolbar__row--primary">
              <div id="libraryUnifiedFiltersGroup" class="control-group control-group--flex library-toolbar__cluster library-toolbar__cluster-search">
                <button id="clearFiltersTopBtn" class="btn-icon clear-btn" type="button" aria-label="Clear filters" title="Clear search, tags, performers and resolution">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-clear"></use></svg>
                </button>
                <input type="text" id="libraryUnifiedInput" class="chips-input" placeholder="Search files, #tag, @performer…" aria-label="Search library" />
                <div class="chips-list" id="libraryUnifiedChips"></div>
              </div>
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-options" aria-label="Library view options">
                <div class="compact-filter" data-filter="resolution">
                  <div class="compact-filter__label-row">
                    <label for="resSelect" class="compact-filter__label">Resolution</label>
                  </div>
                  <select id="resSelect" class="control-select" title="Filter by resolution" aria-label="Filter by resolution">
                    <option value="" selected data-chip="All">All resolutions</option>
                    <option value="2160" data-chip="2160p+">2160p+</option>
                    <option value="1440" data-chip="1440p+">1440p+</option>
                    <option value="1080" data-chip="1080p+">1080p+</option>
                    <option value="720" data-chip="720p+">720p+</option>
                    <option value="480" data-chip="480p+">480p+</option>
                  </select>
                </div>
                <div class="compact-filter" data-filter="sort">
                  <div class="compact-filter__label-row">
                    <label for="sortSelect" class="compact-filter__label">Sort</label>
                    <button id="orderToggle" class="compact-filter__order" data-order="desc" type="button" title="Toggle sort order" aria-label="Toggle sort order">▼</button>
                  </div>
                  <select id="sortSelect" class="control-select" aria-label="Sort by">
                    <option value="date" data-chip="Date">Date</option>
                    <option value="name" data-chip="Name">Name</option>
                    <option value="size" data-chip="Size">Size</option>
                    <option value="random" data-chip="Random">Random</option>
                  </select>
                </div>
                <div class="library-density" aria-label="Grid density">
                  <span class="library-density__label hint-sm" id="densityLabel">Density</span>
                  <input id="densitySlider" type="range" min="1" max="15" value="12" step="1" class="control-slider" title="Adjust grid density (columns)" aria-describedby="densityLabel" aria-label="Grid density" />
                </div>
              </div>
            </div>
            <div class="controls-row library-toolbar__row library-toolbar__row--secondary">
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-artifacts">
                <button id="artifactFiltersBtn" class="btn-sm" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="artifactFiltersMenu">Artifacts</button>
                <div id="artifactFilterChips" class="artifact-filter-chips" aria-live="polite" hidden></div>
                <!-- Artifact boolean filters are available per-column on the List tab -->
              </div>
              <div class="pagination-group library-toolbar__cluster library-toolbar__cluster-pagination">
                <div class="pagination">
                  <button id="prevBtn" class="btn-sm" title="Previous page">‹</button>
                  <span id="pageInfo" class="page-info">Page 1 of 1</span>
                  <button id="nextBtn" class="btn-sm" title="Next page">›</button>
                </div>
                <div class="library-toolbar__random" role="group" aria-label="Random playback">
                  <button id="randomPlayBtn" class="btn-sm" title="Play a random video from current filters" aria-label="Play random">
                    <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-shuffle" /></svg>
                  </button>
                  <button id="randomAutoBtn" class="btn-sm" title="Toggle auto-random play when the video ends" aria-pressed="false" aria-label="Toggle auto-random">
                    <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-auto-shuffle" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="artifactFiltersMenu" class="artifact-filter-menu" role="dialog" aria-label="Artifact filters" hidden>
          <div class="artifact-filter-menu__body" id="artifactFilterMenuBody"></div>
          <div class="artifact-filter-menu__footer">
            <button id="artifactFiltersClearBtn" class="btn-sm" type="button">Clear</button>
            <button id="artifactFiltersApplyBtn" class="btn-sm btn-primary" type="button">Apply</button>
          </div>
        </div>

        <div id="selectionBar" class="selection-bar" hidden>
          <span id="selectionCount" class="selection-count">0 selected</span>
          <button id="selectAllBtn" class="btn-sm">Select All</button>
          <button id="selectNoneBtn" class="btn-sm">Select None</button>
          <button id="bulkEditBtn" class="btn-sm">Bulk Edit</button>
          <div id="bulkEditPanel" class="bulk-panel" hidden>
            <label class="hint-sm mr-6" for="bulkKindSelect">Type</label>
            <select id="bulkKindSelect" class="control-select">
              <option value="tag">Tag</option>
              <option value="performer">Performer</option>
            </select>
            <label class="hint-sm ml-10 mr-6" for="bulkOpSelect">Action</label>
            <select id="bulkOpSelect" class="control-select">
              <option value="add">Add</option>
              <option value="remove">Remove</option>
            </select>
            <input id="bulkValueInput" type="text" class="chips-input ml-10" placeholder="Name…" aria-label="Name" />
            <button id="bulkApplyBtn" class="btn-sm ml-6">Apply</button>
            <div id="bulkSuggestions" class="chips-suggestions hint-sm mt-4" aria-live="polite"></div>
          </div>
        </div>

        <div id="spinner" class="spinner"></div>
        <div id="status"></div>

        <!-- Card template (hidden) -->
        <template id="cardTemplate">
          <div class="card">
            <div class="card-checkbox"></div>
            <div class="thumbnail-wrap">
              <div class="quality-badge" aria-hidden="true"></div>
              <img class="thumbnail-img" loading="lazy" />
              <!-- Inline placeholder SVG using centralized sprite; shown when no thumbnail present -->
              <svg class="thumbnail-placeholder" aria-hidden="true">
                <use href="#icon-placeholder"></use>
              </svg>
              <!-- Overlay info (resolution only) -->
              <div class="overlay-info" aria-hidden="true">
                <span class="overlay-resolution"></span>
              </div>
            </div>
            <div class="metadata">
              <p class="title"></p>
              <div class="row sub">
                <span class="duration"></span>
                <span class="size"></span>
              </div>
            </div>
          </div>
        </template>

        <!-- Directory card template (hidden) -->
        <template id="dirTemplate">
          <div class="card">
            <div class="thumbnail-img dir-thumbnail">
              <div class="dir-thumbnail-inner">
                <span class="dir-icon"></span>
                <span class="dir-name"></span>
              </div>
            </div>
            <div class="metadata">
              <p class="title"></p>
              <div class="row sub"><span>Folder</span><span></span></div>
            </div>
          </div>
        </template>

        <div id="grid" class="grid" hidden></div>
      </div>

      <!-- List Tab Panel (static) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="list-tab" id="list-panel" hidden>
        <div class="list-panel">
          <div class="list-controls">
            <div class="flex-row gap-8">
              <button id="listColumnsBtn" class="btn-sm" aria-controls="listColumnsPanel" aria-expanded="false">Columns</button>
              <button id="listWrapToggle" class="btn-sm" aria-pressed="false" title="Toggle text wrapping in the table">Wrap: On</button>
              <label for="listPageSize" class="hint-sm" style="display:inline-flex; align-items:center; gap:6px;">
                Per page
                <select id="listPageSize" class="control-select" aria-label="Page size">
                  <option value="16">16</option>
                  <option value="32" selected>32</option>
                  <option value="64">64</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="500">500</option>
                </select>
              </label>
              <div id="listFilterChips" class="filter-chips" aria-label="Active list filters" hidden></div>
              <div class="list-pager" id="listPagerTop">
                <button id="listPrevBtn" class="btn-sm" aria-label="Previous page">Prev</button>
                <span id="listPageInfo" class="hint-sm">Page 1</span>
                <button id="listNextBtn" class="btn-sm" aria-label="Next page">Next</button>
              </div>
              <div id="listSpinner" class="spinner" hidden></div>
            </div>
          </div>
          <div id="listColumnsPanel" class="list-columns-panel hidden" role="region" aria-label="Column settings">
            <div class="panel-header--spaced">
              <strong>Columns</strong>
              <button id="listColumnsClose" class="btn-sm" aria-label="Close">Close</button>
            </div>
            <div id="listColumnsBody" class="list-columns-body"></div>
            <div class="list-columns-footer mt-12">
              <div class="hint-sm hint-sm--muted">Drag to reorder • Toggle to show/hide • Resize using header grips in the table</div>
              <button id="listColumnsReset" class="btn-sm" type="button">Reset to default</button>
            </div>
          </div>
          <div class="list-wrap">
            <table id="listTable" class="list-table" role="table" aria-label="Files list">
              <thead>
                <tr id="listHeadRow"></tr>
              </thead>
              <tbody id="listTbody"></tbody>
            </table>
          </div>
          <div class="list-pager-bottom" id="listPagerBottom">
            <div class="list-pager">
              <button id="listPrevBtnBottom" class="btn-sm" aria-label="Previous page">Prev</button>
              <span id="listPageInfoBottom" class="hint-sm">Page 1</span>
              <button id="listNextBtnBottom" class="btn-sm" aria-label="Next page">Next</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Performers Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="performers-tab" id="performers-panel" hidden>
        <div class="catalog-container">
          <div class="perf-toolbar">
            <input id="performerSearch" type="text" placeholder="Search performers…" class="perf-search" />
            <div class="compact-filter" data-filter="perf-images">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Images</span>
              </div>
              <select id="performerImageFilter" class="control-select sr-only" aria-label="Filter performers by image availability" data-segmented="1" data-segmented-label="Performer image filter">
                <option value="all" selected data-chip="All">All</option>
                <option value="with" data-chip="With">Has image</option>
                <option value="without" data-chip="Missing">No image</option>
              </select>
            </div>
            <div class="compact-filter" data-filter="perf-face">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Face box</span>
              </div>
              <select id="performerFaceFilter" class="control-select sr-only" aria-label="Filter performers by face box status" data-segmented="1" data-segmented-label="Performer face box filter">
                <option value="all" selected data-chip="All">All</option>
                <option value="with" data-chip="With">Has face box</option>
                <option value="without" data-chip="Missing">No face box</option>
              </select>
            </div>
            <!-- Sort controls: default to Markers (desc) -->
            <div class="compact-filter ml-8" data-filter="perf-sort">
              <div class="compact-filter__label-row">
                <span class="compact-filter__label">Sort</span>
                <button id="performerSortOrder" class="compact-filter__order" type="button" title="Toggle sort order" aria-label="Toggle sort order">▼</button>
              </div>
              <select id="performerSort" class="control-select sr-only" aria-label="Sort performers" data-segmented="1" data-segmented-label="Performer sort">
                <option value="count" selected data-chip="Files">Files</option>
                <option value="name" data-chip="Name">Name</option>
              </select>
            </div>
            <span id="performersCount" class="hint-sm ml-8" aria-live="polite"></span>
            <button id="performerUnifiedImportBtn" class="btn-sm" title="Import performers: names list, images folder, loose images, or ZIP">Import</button>
            <button id="performerAddBtn" class="btn-sm" title="Create a new performer">Add</button>
            <button id="performerAutoMatchBtn" class="btn-sm" title="Match performers from filenames">Match</button>
            <button id="performerDetectAllBtn" class="btn-sm" title="Detect faces for visible performers">Detect faces</button>
            <button id="performerMergeBtn" class="btn-sm" title="Merge selected" disabled>Merge</button>
            <button id="performerRenameBtn" class="btn-sm" title="Rename selected" disabled>Rename</button>
            <button id="performerDeleteBtn" class="btn-sm" title="Delete selected" disabled>Delete</button>
          </div>
          <div id="performerDropZone" role="button" tabindex="0" aria-label="Import performers" class="performer-dropzone">
            <strong class="pdz-title">Unified Import</strong>
            <span class="pdz-sub">Click for names / images / ZIP or drag & drop text list</span>
          </div>
          <input id="performerFileInput" type="file" accept=".txt,.csv,.json,text/plain,application/json" multiple class="d-none" />
          <div id="performersStatus" class="catalog-status d-none" aria-live="polite">Loading…</div>
          <!-- Unified hidden inputs -->
          <input id="performerUnifiedFileInput" type="file" class="d-none" multiple accept=".txt,.csv,.json,.zip,image/*,text/plain,application/json,application/zip,application/x-zip-compressed" />
          <input id="performerUnifiedFolderInput" type="file" class="d-none" webkitdirectory directory multiple accept="image/*" />
          <input id="performerSingleImageInput" type="file" class="d-none" accept="image/*" />
          <div id="performersSpinner" class="spinner" hidden></div>
          <div class="list-controls flex-row gap-10 mt-12" id="performersPager">
            <div class="ml-auto"></div>
            <label for="perfPageSize" class="hint-sm">Page size</label>
            <select id="perfPageSize" class="control-select" aria-label="Performers page size">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="perfPrev" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="perfPageInfo" class="hint-sm" aria-live="polite">—</span>
            <button id="perfNext" class="btn-sm" aria-label="Next page">Next</button>
          </div>
          <div id="performersGrid" class="perf-grid performers-grid"></div>
          <!-- Bottom pager (duplicate of top) -->
          <div class="list-controls flex-row gap-10 mt-12" id="performersPagerBottom">
            <div class="ml-auto"></div>
            <label for="perfPageSizeBottom" class="hint-sm">Page size</label>
            <select id="perfPageSizeBottom" class="control-select" aria-label="Performers page size (bottom)">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="perfPrevBottom" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="perfPageInfoBottom" class="hint-sm" aria-live="polite">—</span>
            <button id="perfNextBottom" class="btn-sm" aria-label="Next page">Next</button>
          </div>
        </div>
      </div>

      <!-- Performer Merge Modal -->
      <div id="performerMergeModal" class="modal" hidden>
        <div class="panel panel--narrow">
          <header class="panel-header--spaced">
            <h3>Merge Performers</h3>
            <button id="performerMergeClose" class="btn btn-text" aria-label="Close">✕</button>
          </header>
          <div class="body">
            <div class="hint-sm mb-8">Choose the performer name to keep. The other selected performer(s) will be merged into it.</div>
            <div class="row gap-8 mb-10">
              <label class="hint-sm w-120">Selected</label>
              <div id="performerMergeSelected" class="flex-row gap-6"></div>
            </div>
            <div class="row gap-8">
              <label for="performerMergeInto" class="hint-sm w-120">Name that remains</label>
              <input id="performerMergeInto" type="text" class="control-input w-100" placeholder="e.g. Jane Doe" />
            </div>
          </div>
          <footer class="panel-footer--actions">
            <button id="performerMergeCancel" class="btn">Cancel</button>
            <button id="performerMergeConfirm" class="btn btn-primary" disabled>Merge</button>
          </footer>
        </div>
      </div>

      <!-- Performer Rename Modal -->
      <div id="performerRenameModal" class="modal" hidden>
        <div class="panel panel--narrow">
          <header class="panel-header--spaced">
            <h3>Rename Performer</h3>
            <button id="performerRenameClose" class="btn btn-text" aria-label="Close">✕</button>
          </header>
          <div class="body">
            <div class="row gap-8 mb-10">
              <label class="hint-sm w-120">Selected</label>
              <div id="performerRenameSelected" class="flex-row gap-6"></div>
            </div>
            <div class="row gap-8">
              <label for="performerRenameInput" class="hint-sm w-120">New name</label>
              <input id="performerRenameInput" type="text" class="control-input w-100" placeholder="e.g. Jane Doe" />
            </div>
          </div>
          <footer class="panel-footer--actions">
            <button id="performerRenameCancel" class="btn">Cancel</button>
            <button id="performerRenameConfirm" class="btn btn-primary" disabled>Rename</button>
          </footer>
        </div>
      </div>

      <!-- Tags Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="tags-tab" id="tags-panel" hidden>
        <!-- Tags grid (extant tags with counts) -->
        <div class="catalog-container">
          <div class="perf-toolbar">
            <input id="tagSearch" type="text" placeholder="Search tags…" class="perf-search" />
            <label for="tagSort" class="hint-sm ml-8" style="opacity:.8">Sort</label>
            <select id="tagSort" class="control-select" aria-label="Sort tags">
              <option value="count" selected>Files</option>
              <option value="name">Name</option>
            </select>
            <button id="tagSortOrder" class="btn-sm" title="Toggle sort order" aria-label="Toggle sort order">Desc</button>
            <span id="tagsCount" class="hint-sm ml-8" aria-live="polite"></span>
            <button id="tagImportBtn" class="btn-sm" title="Import tags from JSON">Import</button>
            <button id="tagAddBtn" class="btn-sm" title="Create a new tag">Add</button>
            <button id="tagAutoMatchBtn" class="btn-sm" title="Apply a tag by matching filenames">Match</button>
            <button id="tagMergeBtn" class="btn-sm" title="Merge selected" disabled>Merge</button>
            <button id="tagRenameBtn" class="btn-sm" title="Rename selected" disabled>Rename</button>
            <button id="tagDeleteBtn" class="btn-sm" title="Delete selected" disabled>Delete</button>
          </div>
          <div id="tagDropZone" role="button" tabindex="0" aria-label="Import tags" class="performer-dropzone">
            <strong class="pdz-title">Import Tags</strong>
            <span class="pdz-sub">Click to choose a file or drag & drop JSON / newline list</span>
          </div>
          <input id="tagImportFile" type="file" accept=".txt,.csv,.json,text/plain,application/json" class="d-none" />
          <div id="tagsStatus" class="catalog-status d-none" aria-live="polite">Loading…</div>
          <div id="tagsSpinner" class="spinner" hidden></div>
          <div class="list-controls flex-row gap-10 mt-12" id="tagsPager">
            <div class="ml-auto"></div>
            <label for="tagPageSize" class="hint-sm">Page size</label>
            <select id="tagPageSize" class="control-select" aria-label="Tags page size">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="tagPrev" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="tagPageInfo" class="hint-sm" aria-live="polite">—</span>
            <button id="tagNext" class="btn-sm" aria-label="Next page">Next</button>
          </div>
          <div id="tagsGrid" class="perf-grid performers-grid"></div>
          <div class="list-controls flex-row gap-10 mt-12" id="tagsPagerBottom">
            <div class="ml-auto"></div>
            <label for="tagPageSizeBottom" class="hint-sm">Page size</label>
            <select id="tagPageSizeBottom" class="control-select" aria-label="Tags page size (bottom)">
              <option value="16">16</option>
              <option value="32" selected>32</option>
              <option value="64">64</option>
              <option value="128">128</option>
            </select>
            <button id="tagPrevBottom" class="btn-sm" aria-label="Previous page">Prev</button>
            <span id="tagPageInfoBottom" class="hint-sm" aria-live="polite">—</span>
            <button id="tagNextBottom" class="btn-sm" aria-label="Next page">Next</button>
          </div>
        </div>
      </div>

      <!-- Template: Similar row (pair) -->
      <template id="similarRowTemplate">
        <div class="card similar-row">
          <div class="similar-row__header">
            <strong class="similar-title">—</strong>
          </div>
          <div class="similar-files">
            <div class="similar-file" data-role="a">
              <div class="similar-file__label">File A</div>
              <div class="similar-file__primary">
                <button class="similar-thumb-btn" type="button" aria-label="Open file A" title="Open file">
                  <img class="similar-thumb" alt="" loading="lazy" decoding="async" />
                </button>
                <div class="similar-file__path path-a"></div>
              </div>
              <dl class="similar-file__stats">
                <div class="similar-file__stat" data-stat="duration" data-diff="unknown">
                  <dt>Duration</dt>
                  <dd class="meta-duration">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="size" data-diff="unknown">
                  <dt>Size</dt>
                  <dd class="meta-size">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="resolution" data-diff="unknown">
                  <dt>Dimensions</dt>
                  <dd class="meta-resolution">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_v" data-diff="unknown">
                  <dt>Video BR</dt>
                  <dd class="meta-bitrate-v">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_a" data-diff="unknown">
                  <dt>Audio BR</dt>
                  <dd class="meta-bitrate-a">—</dd>
                </div>
              </dl>
            </div>
            <div class="similar-file" data-role="b">
              <div class="similar-file__label">File B</div>
              <div class="similar-file__primary">
                <button class="similar-thumb-btn" type="button" aria-label="Open file B" title="Open file">
                  <img class="similar-thumb" alt="" loading="lazy" decoding="async" />
                </button>
                <div class="similar-file__path path-b"></div>
              </div>
              <dl class="similar-file__stats">
                <div class="similar-file__stat" data-stat="duration" data-diff="unknown">
                  <dt>Duration</dt>
                  <dd class="meta-duration">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="size" data-diff="unknown">
                  <dt>Size</dt>
                  <dd class="meta-size">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="resolution" data-diff="unknown">
                  <dt>Dimensions</dt>
                  <dd class="meta-resolution">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_v" data-diff="unknown">
                  <dt>Video BR</dt>
                  <dd class="meta-bitrate-v">—</dd>
                </div>
                <div class="similar-file__stat" data-stat="bitrate_a" data-diff="unknown">
                  <dt>Audio BR</dt>
                  <dd class="meta-bitrate-a">—</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </template>

      <!-- Similar Tab Panel (static) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="similar-tab" id="similar-panel" hidden>
        <div class="task-section">
          <div class="section-header">
            <h2>Similar (pHash)</h2>
            <div class="section-actions">
              <label class="hint-sm">Threshold <input id="similarThresh" type="number" min="0" max="1" step="0.01" value="0.90" class="w-120" /></label>
              <label class="hint-sm">Limit <input id="similarLimit" type="number" min="1" step="1" value="50" class="w-120" /></label>
              <label class="hint-sm"><input id="similarRecursive" type="checkbox" /> Recursive</label>
              <button id="similarRefreshBtn" class="btn-sm">Refresh</button>
            </div>
          </div>
          <div id="similarStatus" class="hint-sm hint-sm--muted">—</div>
          <div id="similarResults" class="mt-12"></div>
          <div id="similarSelectionPanel" class="similar-selection" hidden>
            <div class="similar-selection__header">
              <div>
                <strong id="similarSelectionCount">No files selected</strong>
                <div class="similar-selection__hint">Click a file tile to choose which copy to remove from each pair.</div>
              </div>
              <div class="similar-selection__header-actions">
                <button id="similarSelectionClear" class="btn-sm" type="button">Clear</button>
              </div>
            </div>
            <ul id="similarSelectionList" class="similar-selection__list"></ul>
            <div class="similar-selection__footer">
              <button id="similarDeleteBtn" class="btn btn-danger btn-sm" type="button" disabled>Delete Selected</button>
            </div>
          </div>
        </div>
      </div>

      <!-- API Explorer Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="api-tab" id="api-panel" hidden>
        <div class="task-section">
          <div class="section-header">
            <h2>API Explorer</h2>
            <div class="section-actions">
              <button id="apiReloadSpecBtn" class="btn-sm" aria-label="Reload API spec">Reload Spec</button>
              <label for="apiSearch" class="sr-only">Filter endpoints</label>
              <input id="apiSearch" type="text" class="control-input" placeholder="Filter paths…" aria-label="Filter endpoints" />
            </div>
          </div>
          <div class="api-composer">
            <div class="row gap-10">
              <label for="apiMethod" class="sr-only">HTTP method</label>
              <select id="apiMethod" class="control-select" aria-label="HTTP method">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <label for="apiPath" class="sr-only">Request path</label>
              <input id="apiPath" class="control-input w-100" placeholder="/api/health" aria-label="Request path" />
              <button id="apiExecBtn" class="btn-sm" aria-label="Execute request">Execute</button>
            </div>
            <div class="row gap-10 mt-12">
              <div class="w-100">
                <label class="hint-sm" for="apiQueryJson">Query (JSON object)</label>
                <textarea id="apiQueryJson" class="control-textarea w-100" rows="4" placeholder="{\n  \"page\": 1\n}"></textarea>
              </div>
              <div class="w-100">
                <label class="hint-sm" for="apiBodyJson">Body (JSON)</label>
                <textarea id="apiBodyJson" class="control-textarea w-100" rows="4" placeholder="{ }"></textarea>
              </div>
            </div>
            <div class="row gap-10 mt-12">
              <span id="apiComposerStatus" class="hint-sm"></span>
            </div>
            <pre id="apiComposerResponse" class="json-pre mt-12" aria-live="polite"></pre>
          </div>
        </div>
        <div class="task-section">
          <div class="section-header">
            <h2>Endpoints</h2>
            <div class="section-actions">
              <label class="toggle-label" for="apiTreeToggle">
                <input id="apiTreeToggle" type="checkbox" checked aria-label="Toggle tree view" />
                <span>Tree View</span>
              </label>
              <button id="apiEndpointsToggleAllBtn" class="btn-sm" aria-expanded="false" aria-controls="apiEndpointsList">Expand All</button>
            </div>
          </div>
          <div id="apiEndpointsList" class="api-endpoints-list"></div>
        </div>
      </div>

      <!-- Tasks Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="tasks-tab" id="tasks-panel" hidden>
        <div class="tasks-container">

          <!-- Job Monitor Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Job Monitor</h2>
              <div class="section-actions">
                <button id="pauseToggleBtn" class="btn-sm" title="Pause starting new jobs" aria-pressed="false">
                  <svg width="16" height="16" aria-hidden="true" focusable="false">
                    <use href="#icon-pause"></use>
                  </svg>
                  <span class="ml-4">Pause</span>
                </button>
                <!-- Buttons hidden initially; JS toggles .d-none -->
                <button id="cancelAllBtn" class="btn-sm d-none" title="Cancel all queued and running jobs">Cancel All</button>
                <button id="cancelQueuedBtn" class="btn-sm d-none" title="Cancel all queued jobs">Cancel Queued</button>
                <button id="clearCompletedBtn" class="btn-sm d-none" title="Remove completed jobs from the list">Clear Completed</button>
              </div>
            </div>

            <div class="job-stats">
              <div class="stat-card" id="filterQueued" data-filter="queued" title="Show only queued jobs">
                <span class="stat-label">Queued</span>
                <span class="stat-value" id="queuedJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterActive" data-filter="running" title="Show only active (running) jobs">
                <span class="stat-label">Active</span>
                <span class="stat-value" id="activeJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterCompleted" data-filter="completed" title="Show completed jobs">
                <span class="stat-label">Completed</span>
                <span class="stat-value" id="completedJobsCount">0</span>
              </div>
              <div class="stat-card" id="filterErrored" data-filter="failed" title="Show failed jobs">
                <span class="stat-label">Errored</span>
                <span class="stat-value" id="failedJobsCount">0</span>
              </div>
            </div>

            <div class="job-table-container" id="jobTableContainer">
              <table class="job-table">
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>Finish</th>
                    <th>Task</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="jobTableBody">
                  <!-- Jobs will be populated here -->
                </tbody>
              </table>
              <div class="resize-handle" id="jobResizeHandle" title="Drag to resize job list"></div>
            </div>
          </div>

          <!-- Artifact Generation Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Generate Artifacts</h2>
            </div>

            <!-- File Selection -->
            <div class="file-selection">
              <div class="selection-options">
                <label class="selection-option">
                  <input type="radio" name="fileSelection" value="all" checked>
                  All files in library
                </label>
                <label class="selection-option">
                  <input type="radio" name="fileSelection" value="selected">
                  Selected files (<span id="selectedFileCount">0</span>)
                </label>
                <button id="generateAllBtn" class="btn-sm ml-auto" title="Queue all missing artifacts for the chosen scope">Generate All</button>
              </div>
            </div>

            <!-- Artifact Types -->
            <div class="artifact-grid">

              <div class="artifact-card artifact-card-uniform" data-artifact="metadata">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Metadata</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="metadataCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="metadataFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="metadata-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="metadata-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="metadata-clear" title="Delete all metadata JSON files">Clear</button>
                  </div>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="thumbnail">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Thumbnails</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="thumbnailCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="thumbnailFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="thumbnail-missing" title="Generate missing thumbnails">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="thumbnail-all" title="Recompute all thumbnails">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="thumbnail-clear" title="Delete all generated thumbnails without regenerating">Clear</button>
                    <button class="btn-options" data-artifact="thumbnail" title="Options" aria-label="Thumbnail options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="thumbnailOptions">
                  <label>Offset (seconds): <input type="number" id="thumbnailOffset" value="10" min="1" max="3600"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="preview">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Previews</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="previewCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="previewFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="preview-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="preview-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="preview-clear" title="Delete all preview videos">Clear</button>
                    <button class="btn-options" data-artifact="preview" aria-label="Preview options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="previewOptions">
                  <label>Segments: <input type="number" id="previewSegments" value="9" min="5" max="20"></label>
                  <label>Duration (sec): <input type="number" id="previewDuration" value="1.0" min="0.5" max="3.0" step="0.1"></label>
                  <label>Width (px): <input type="number" id="previewWidth" value="320" min="120" max="1280"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="sprites">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Sprite Sheets</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="spritesCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="spritesFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="sprites-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="sprites-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="sprites-clear" title="Delete all sprite sheets">Clear</button>
                    <button class="btn-options" data-artifact="sprites" aria-label="Sprite options">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="spritesOptions">
                  <label>Interval (sec): <input type="number" id="spriteInterval" value="10" min="1" max="60"></label>
                  <label>Width (px): <input type="number" id="spriteWidth" value="320" min="160" max="1920"></label>
                  <label>Columns: <input type="number" id="spriteCols" value="10" min="5" max="20"></label>
                  <label>Rows: <input type="number" id="spriteRows" value="10" min="3" max="40"></label>
                  <label>Quality (0-8): <input type="number" id="spriteQuality" value="4" min="0" max="8"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="phash">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Perceptual Hash</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="phashCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="phashFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="phash-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="phash-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="phash-clear" title="Delete all perceptual hash artifacts">Clear</button>
                    <button class="btn-options" data-artifact="phash">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="phashOptions">
                  <label>Frames: <input type="number" id="phashFrames" value="5" min="3" max="10"></label>
                  <label>Algorithm:
                    <div class="select">
                      <select id="phashAlgo" class="control-select">
                        <option value="ahash">Average Hash</option>
                        <option value="phash">Perceptual Hash</option>
                        <option value="dhash">Difference Hash</option>
                      </select>
                      <span class="chevron">▾</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="markers">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Marker Detection</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="markersCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="markersFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="markers-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="markers-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="markers-clear" title="Delete all marker detection JSON">Clear</button>
                    <button class="btn-options" data-artifact="markers">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="markersOptions">
                  <label>Threshold: <input type="number" id="markerThreshold" value="0.4" min="0.1" max="1.0" step="0.1"></label>
                  <label>Limit: <input type="number" id="markerLimit" value="0" min="0" max="100"></label>
                </div>
              </div>

              <div class="artifact-card artifact-card-uniform" data-artifact="heatmap">
                <div class="artifact-header">
                  <div class="artifact-info">
                    <h3>Heatmap</h3>
                    <div class="coverage-display">
                      <span class="coverage-text" id="heatmapCoverage">0%</span>
                      <div class="coverage-bar-mini">
                        <div class="coverage-fill-mini" id="heatmapFill"></div>
                      </div>
                    </div>
                  </div>
                  <div class="artifact-actions">
                    <button class="btn-generate hidden" data-operation="heatmap-missing">Generate Missing</button>
                    <button class="btn-generate d-none hidden" data-operation="heatmap-all">Recompute All</button>
                    <button class="btn-generate d-none hidden" data-operation="heatmap-clear" title="Delete all heatmap PNGs">Clear</button>
                    <button class="btn-options" data-artifact="heatmap">
                      <svg width="16" height="16" aria-hidden="true">
                        <use href="#icon-options" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="options-tooltip d-none" id="heatmapOptions">
                  <label>Interval (sec): <input type="number" id="heatmapInterval" value="1.0" min="0.5" max="10.0" step="0.5"></label>
                  <label>Mode:
                    <div class="select">
                      <select id="heatmapMode" class="control-select">
                        <option value="both">Both</option>
                        <option value="brightness">Brightness</option>
                        <option value="motion">Motion</option>
                        <option value="color">Color</option>
                      </select>
                      <span class="chevron">▾</span>
                    </div>
                  </label>
                  <label class="row small items-center gap-6">
                    <input type="checkbox" id="heatmapPng" checked /> Save PNG
                  </label>
                </div>
              </div>
            </div>
          </div>
          <!-- Orphaned Artifacts Section -->
          <div class="task-section">
            <div class="section-header">
              <h2>Orphaned Artifacts</h2>
            </div>
            <div class="orphan-card">
              <div class="orphan-header">
                <div class="orphan-info">
                  <h3>Orphaned Files</h3>
                  <div class="orphan-stats">
                    <span class="orphan-count" id="orphanCount">0</span>
                    <span class="orphan-label">files without corresponding videos</span>
                  </div>
                </div>
                <div class="orphan-actions">
                  <button class="btn-sm" id="refreshOrphansSummaryBtn" title="Manually recount orphaned artifacts">Refresh Count</button>
                  <button class="btn-preview" id="previewOrphansBtn" disabled title="Show suggested cleanup (dry run)">Preview Cleanup</button>
                  <!-- Apply Cleanup is hidden until a preview is displayed -->
                  <button class="btn-cleanup d-none" id="cleanupOrphansBtn" disabled title="Apply cleanup (removes unmatched orphans)">Apply Cleanup</button>
                  <button class="btn-preview" id="previewRepairsBtn" disabled title="Show suggested renames (dry run)">Preview Repairs</button>
                  <!-- Apply Repairs is hidden until repair preview streaming completes -->
                  <button class="btn-cleanup d-none" id="applyRepairsBtn" disabled title="Apply suggested repairs (move artifacts next to best-matched media; keeps unmatched orphans)">Apply Repairs</button>
                </div>
              </div>
              <div class="orphan-details d-none" id="orphanDetails">
                <div class="orphan-list" id="orphanList">
                  <!-- Orphan files will be listed here -->
                </div>
              </div>
              <div class="orphan-details d-none" id="orphanRenames">
                <div class="orphan-list" id="orphanRenamesList">
                  <!-- Suggested renames (dry run) will be listed here -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="stats-tab" id="stats-panel" hidden>
        <div class="stats-container">
          <h2>Library Statistics</h2>
          <div class="stats-row">
            <div class="stats-item"><strong>Number of Files:</strong> <span id="statsNumFiles">—</span></div>
            <div class="stats-item"><strong>Total Size:</strong> <span id="statsTotalSize">—</span></div>
            <div class="stats-item"><strong>Total Duration:</strong> <span id="statsTotalDuration">—</span></div>
            <div class="stats-item"><strong>Number of Tags:</strong> <span id="statsNumTags">—</span></div>
            <div class="stats-item"><strong>Number of Performers:</strong> <span id="statsNumPerformers">—</span></div>
          </div>
          <div class="stats-charts">
            <div class="chart-block">
              <h3>Resolution Distribution</h3>
              <canvas id="statsResChart" width="320" height="180"></canvas>
            </div>
            <div class="chart-block">
              <h3>Duration Distribution</h3>
              <canvas id="statsDurationChart" width="320" height="180"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="settings-tab" id="settings-panel" hidden>
        <div class="tab-content">
          <h2>Settings</h2>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Library Root</h2>
            </div>
            <div class="file-selection file-selection-root">
              <div class="root-input-row">
                <input id="folderInput" type="text" class="control-input root-input" placeholder="Type relative path (Enter) or absolute path to set root" title="Relative path to browse; absolute path to change root. Enter to apply." />
                <button id="refresh" class="btn-sm" title="Reload current listing">Reload</button>
                <button id="pickRootBtn" class="btn-sm" title="Open folder picker">Pick…</button>
              </div>
              <div class="hint-sm">
                Enter a relative path within the current root to browse (e.g. <code>Shows/Season 1</code>). Enter an absolute path (e.g. <code>/Volumes/Media</code> or <code>~/Movies</code>) to change the library root. Double‑click the input or click Pick… to open a folder picker.
              </div>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Player Preferences</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <div class="fw-600">Seek jumps (seconds)</div>
                <div class="row gap-10" style="align-items:center; flex-wrap:wrap; margin-top:4px">
                  <div class="flex-row gap-10" style="align-items:center">
                    <label for="settingJumpBackSeconds" class="hint-sm" style="opacity:.8">Back</label>
                    <input type="number" id="settingJumpBackSeconds" min="1" max="600" step="1" value="30" class="w-120" aria-label="Jump backward seconds" />
                  </div>
                  <div class="flex-row gap-10" style="align-items:center">
                    <label for="settingJumpFwdSeconds" class="hint-sm" style="opacity:.8">Forward</label>
                    <input type="number" id="settingJumpFwdSeconds" min="1" max="600" step="1" value="30" class="w-120" aria-label="Jump forward seconds" />
                  </div>
                  <span class="hint-sm" style="opacity:.75; flex-basis:100%">Values used by the ± buttons & Arrow Left/Right (when not frame-stepping).</span>
                </div>
              </label>
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingInfiniteScroll" />
                <div>
                  <div class="subtitle-icon-label">Infinite Scroll (auto-load next page)</div>
                  <div class="hint-sm">When enabled, scrolling near the end of the library automatically loads the next page instead of using the pager.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingStartAtBeginning" />
                <div>
                  <div class="fw-600">Always start videos at the beginning</div>
                  <div class="hint-sm">Ignores saved progress, resume overrides, and intro skip markers so playback always begins from 00:00.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingAutoplayResume" />
                <div>
                  <div class="subtitle-icon-label">
                    Autoplay on load when previously playing
                    <!-- reference subtitle icon placeholder (from user image) -->
                    <span aria-hidden="true" title="Subtitle icon reference" class="subtitle-icon">
                      <span class="subtitle-line top"></span>
                      <span class="subtitle-line bottom"></span>
                    </span>
                  </div>
                  <div class="hint-sm">
                    If enabled, the player resumes playback automatically when a video was playing before closing. Default is off.
                  </div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingShowHeatmap" />
                <div>
                  <div class="fw-600">Show timeline heatmap</div>
                  <div class="hint-sm">
                    Toggle the heatmap overlay on the player timeline. This only affects display; artifacts and badges still load as usual.
                  </div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingShowMarkers" />
                <div>
                  <div class="fw-600">Show marker boundary ticks</div>
                  <div class="hint-sm">
                    Toggle the marker boundary ticks on the player timeline. This only affects display; marker data still loads as usual.
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Library Preferences</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingPreview" />
                <div>
                  <div class="fw-600">Enable video previews</div>
                  <div class="hint-sm">When enabled, cards will play a small preview on hover. Previews are only played if they already exist; no background generation is triggered automatically.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingPreviewOnDemand" />
                <div>
                  <div class="fw-600">Generate previews on demand</div>
                  <div class="hint-sm">When enabled, hovering a card will request the server to create a preview if one doesn’t exist yet. This may start background work and use CPU.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingConfirmDeletes" />
                <div>
                  <div class="fw-600">Require confirmation for deletions</div>
                  <div class="hint-sm">When enabled, clearing or deleting artifacts will ask for confirmation. Default is off.</div>
                </div>
              </label>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Auto-generate Missing Artifacts</h2>
            </div>
            <div class="file-selection file-selection-compact">
              <label class="selection-option selection-option-wide">
                <input type="checkbox" id="settingAutoArtifactMetadata" />
                <div>
                  <div class="fw-600">Metadata</div>
                  <div class="hint-sm">Automatically queue metadata extraction when a video is opened and its metadata sidecar is missing.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactThumbnail" />
                <div>
                  <div class="fw-600">Thumbnails</div>
                  <div class="hint-sm">Start a thumbnail job for the active video if none exists yet. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactPreview" />
                <div>
                  <div class="fw-600">Previews</div>
                  <div class="hint-sm">Kick off preview generation on playback when hover previews are missing. Requires FFmpeg and may take longer than other artifacts.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactSprites" />
                <div>
                  <div class="fw-600">Sprites</div>
                  <div class="hint-sm">Queue sprite sheet jobs automatically for the playing video when none are present. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactMarkers" />
                <div>
                  <div class="fw-600">Markers</div>
                  <div class="hint-sm">Begin marker detection automatically when playback starts and marker data is missing. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactHeatmap" />
                <div>
                  <div class="fw-600">Heatmaps</div>
                  <div class="hint-sm">Generate heatmaps for the current video whenever the artifact is missing. Requires FFmpeg.</div>
                </div>
              </label>
              <label class="selection-option selection-option-wide mt-12">
                <input type="checkbox" id="settingAutoArtifactPhash" />
                <div>
                  <div class="fw-600">pHash</div>
                  <div class="hint-sm">Automatically queue perceptual hash generation to aid duplicate detection. Requires FFmpeg.</div>
                </div>
              </label>
              <div class="hint-sm hint-sm--muted mt-8">These automations run once per video selection and respect existing job deduplication.</div>
            </div>
          </div>
          <div class="task-section task-section-spaced">
            <div class="section-header">
              <h2>Job Processing</h2>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">Max concurrent jobs</div>
                <input type="number" id="settingConcurrency" min="1" max="16" step="1" value="4" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-12">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg parallel processes</div>
                <input type="number" id="settingFfmpegConcurrency" min="1" max="16" step="1" value="4" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-8">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg threads per process</div>
                <input type="number" id="settingFfmpegThreads" min="1" max="32" step="1" value="1" class="w-120" />
              </div>
            </div>
            <div class="file-selection file-selection-compact file-selection-inline mt-8">
              <div class="flex-row gap-16 w-100">
                <div class="fw-600">FFmpeg timelimit (s)</div>
                <input type="number" id="settingFfmpegTimelimit" min="0" max="86400" step="10" value="600" class="w-120" />
              </div>
            </div>
            <div class="hint-sm mt-8 max-w-640">FFmpeg settings control low-level media processing. Parallel processes multiply workload across different files; threads apply within a single process. Lower timelimit can fail very long operations; set 0 to disable.</div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Toast host (notifications rendered via template clones) -->
  <div id="toastHost" aria-live="polite" aria-atomic="false"></div>
</body>
</html>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      const open = epEl.getAttribute('data-open') === '1';
          devLog('debug', '[API] Endpoint toggle', { method: r.method, path: r.path, wasOpen: open, nowOpen: !open });
          epEl.setAttribute('data-open', open ? '0' : '1');
          body.classList.toggle('hidden', open);
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (headerRow) headerRow.setAttribute('aria-expanded', open ? 'false' : 'true');
        };
        if (toggleBtn && body) toggleBtn.addEventListener('click', toggleDetails);
        if (headerRow && body) {
          headerRow.addEventListener('click', (e) => {
            if (e.target && (e.target.closest('.api-toggle'))) return;
            toggleDetails();
          });
        }
        if (headerRow && body && !headerRow._kbd) {
          headerRow._kbd = true;
          headerRow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleDetails();
            }
          });
        }
        if (runBtn) {
          runBtn.addEventListener('click', async () => {
            status.textContent = 'Loading…';
            resp.textContent = '';
            try {
              const url = new URL(r.path, window.location.origin);
              const method = r.method || 'GET';
              const opts = { method, headers: { Accept: 'application/json' } };
              if (hasBody && !hasBody.hasAttribute('hidden')) {
                const btxt = epEl.querySelector('.api-body-text')?.value || '';
                const jobj = parseJsonOrEmpty(btxt);
                if (jobj) {
                  opts.headers['Content-Type'] = 'application/json';
                  opts.body = JSON.stringify(jobj);
                }
              }
              const res = await fetch(url.toString(), opts);
              const text = await res.text();
              let parsed = null;
              parsed = JSON.parse(text);
              status.textContent = `${res.status} ${res.statusText || ''}`.trim();
              resp.textContent = parsed ? fmt(parsed) : text;
            }
            catch (e) {
              status.textContent = 'Error';
              resp.textContent = String(e);
            }
          });
        }
        bodyEl.appendChild(epEl);
      });
      // Recurse into children (sorted)
      [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((child) => renderNode(bodyEl, child));
      parentEl.appendChild(groupEl);
    };
    // Start rendering children of root to avoid an extra unnamed wrapper
    container.innerHTML = '';
    if (container && container.classList && typeof container.classList.add === 'function') {
      container.classList.add('api-groups');
    }
    [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((child) => renderNode(container, child));
  }
  function renderEndpoints(routes) {
    const list = document.getElementById('apiEndpointsList');
    if (!list) {
      devLog('warn', '[API] renderEndpoints: #apiEndpointsList not found');
      return;
    }
    // Defensive: ensure routes is an array; fall back to lastFetchedRoutes if not
    const safeRoutes = Array.isArray(routes) ? routes : (lastFetchedRoutes || []);
    const treeToggle = document.getElementById('apiTreeToggle');
    const isTreeView = !treeToggle || treeToggle.checked;
    devLog('debug', '[API] renderEndpoints start', {
      isTreeView,
      routeCount: Array.isArray(safeRoutes) ? safeRoutes.length : 0,
    });

    if (isTreeView) {
      const tree = buildTree(safeRoutes);
      renderTree(list, tree);
      const gCount = list.querySelectorAll('.api-group').length;
      const eCount = list.querySelectorAll('.api-endpoint').length;
      devLog('debug', '[API] renderEndpoints tree rendered', { groups: gCount, endpoints: eCount });
    }
    else {
      renderFlat(list, safeRoutes);
      const eCount = list.querySelectorAll('.api-endpoint').length;
      devLog('debug', '[API] renderEndpoints flat rendered', { endpoints: eCount });
    }
    // Reset the Endpoints header toggle button label after re-render
    const hdrToggle = document.getElementById('apiEndpointsToggleAllBtn');
    if (hdrToggle) {
      hdrToggle.textContent = 'Expand All';
      hdrToggle.setAttribute('aria-expanded', 'false');
      devLog('debug', '[API] renderEndpoints reset toggle-all button');
    }
  }

  function renderFlat(container, routes) {
    if (!container) return;
    const tplEp = document.getElementById('apiEndpointTemplate');
    try {
      container.innerHTML = '';
    }
    catch (_) {
      return;
    }
    const cl = container && container.classList;
    if (cl && typeof cl.remove === 'function') cl.remove('api-groups');
    if (cl && typeof cl.add === 'function') cl.add('api-endpoints-list');

    // Sort routes by method priority first (GET < POST < DELETE < others), then by path
    const methodOrder = { GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5 };
    const baseRoutes = Array.isArray(routes) ? routes : [];
    const sortedRoutes = [...baseRoutes].sort((a, b) => {
      const am = methodOrder[String(a?.method || '').toUpperCase()] || 99;
      const bm = methodOrder[String(b?.method || '').toUpperCase()] || 99;
      const byMethod = am - bm;
      if (byMethod !== 0) return byMethod;
      const byPath = String(a?.path || '').localeCompare(String(b?.path || ''));
      devLog('log', '[API] Flat sort:', { methodA: a?.method, methodB: b?.method, priorityA: am, priorityB: bm, pathA: a?.path, pathB: b?.path, result: byMethod || byPath });
      return byPath;
    });

    sortedRoutes.forEach((r) => {
      const epEl = (tplEp && tplEp.content) ? tplEp.content.firstElementChild.cloneNode(true) : (() => {
        const d = document.createElement('div');
        d.className = 'card api-endpoint';
        return d;
      })();

      const badge = epEl.querySelector('.method-badge');
      const code = epEl.querySelector('.api-path');
      const toggleBtn = epEl.querySelector('.api-toggle');
      const headerRow = epEl.querySelector('.api-endpoint__header');
      const body = epEl.querySelector('.api-endpoint__body');
      const summary = epEl.querySelector('.api-summary');
      const hasBody = epEl.querySelector('.api-body');
      const runBtn = epEl.querySelector('.api-run');
      const status = epEl.querySelector('.api-status');
      const resp = epEl.querySelector('.api-response');

      if (badge) {
        const m = String(r.method || 'GET');
        badge.textContent = m;
        badge.className = `method-badge ${m.toLowerCase()}`;
      }
      if (code) {
        code.textContent = String(r.path || '');
      }
      if (summary) {
        const descFirst = String(r.description || '').trim();
        const sum = String(r.summary || '').trim();
        let show = descFirst || sum || '';
        if (show && show === `${r.method} ${r.path}`) show = '';
        summary.textContent = show || 'No description available';
      }

      const toggleDetails = () => {
        const open = epEl.getAttribute('data-open') === '1';
        epEl.setAttribute('data-open', open ? '0' : '1');
        if (body && body.classList) body.classList.toggle('hidden', open);
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (headerRow) headerRow.setAttribute('aria-expanded', open ? 'false' : 'true');
      };

      if (toggleBtn && body) toggleBtn.addEventListener('click', toggleDetails);
      if (headerRow && body) {
        headerRow.addEventListener('click', (e) => {
          if (e.target && (e.target.closest('.api-toggle'))) return;
          toggleDetails();
        });
      }
      if (headerRow && body && !headerRow._kbd) {
        headerRow._kbd = true;
        headerRow.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDetails();
          }
        });
      }

      if (runBtn) {
        runBtn.addEventListener('click', async () => {
          if (status) status.textContent = 'Loading…';
          if (resp) resp.textContent = '';
          try {
            const res = await fetch(r.path, { method: r.method });
            const text = await res.text();
            if (status) status.textContent = `${res.status} ${res.statusText}`;
            if (resp) resp.textContent = text;
          }
          catch (err) {
            if (status) status.textContent = 'Error';
            if (resp) resp.textContent = String(err);
          }
        });
      }

      container.appendChild(epEl);
    });
  }
  async function loadSpecAndRender() {
    const list = document.getElementById('apiEndpointsList');
    if (!list) return;
    const routes = await fetchRoutes();
    lastFetchedRoutes = routes;
    renderEndpoints(routes);
    apiSpecLoaded = true;
  }
  function wireComposer() {
    const methodSel = document.getElementById('apiMethod');
    const pathInput = document.getElementById('apiPath');
    const execBtn = document.getElementById('apiExecBtn');
    const qTxt = document.getElementById('apiQueryJson');
    const bTxt = document.getElementById('apiBodyJson');
    const status = document.getElementById('apiComposerStatus');
    const out = document.getElementById('apiComposerResponse');
    if (!execBtn) return;
    execBtn.addEventListener('click', async () => {
      status.textContent = 'Loading…';
      out.textContent = '';
      try {
        const method = methodSel.value || 'GET';
        const path = (pathInput.value || '').trim() || '/api/health';
        const url = new URL(path, window.location.origin);
        const query = parseJsonOrEmpty(qTxt.value);
        if (query && typeof query === 'object') {
          Object.entries(query).forEach(([k, v]) => url.searchParams.set(String(k), String(v)));
        }
        const body = parseJsonOrEmpty(bTxt.value);
        const opts = { method, headers: { Accept: 'application/json' } };
        if (body && (method !== 'GET' && method !== 'HEAD')) {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(body);
        }
        const res = await fetch(url.toString(), opts);
        const text = await res.text();
        let parsed = null;
        parsed = JSON.parse(text);
        status.textContent = `${res.status} ${res.statusText || ''}`.trim();
        out.textContent = parsed ? fmt(parsed) : text;
      }
      catch (e) {
        status.textContent = 'Error';
        out.textContent = String(e);
      }
    });
  }
  function init() {
    const ts = window.tabSystem;
    const btn = document.getElementById('api-tab');
    const panel = document.getElementById('api-panel');
    if (!panel) return; // Need the panel to exist
    if (ts && btn) {
      if (!ts.tabs.has('api')) {
        ts.tabs.set('api', {button: btn, panel});
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          ts.switchToTab('api');
          if (!apiSpecLoaded) loadSpecAndRender();
        });
      }
    }
    else if (btn) {
      // Basic fallback: ensure the button still navigates the hash and triggers load
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#api';
        if (!apiSpecLoaded) loadSpecAndRender();
      });
    }
    const reloadBtn = document.getElementById('apiReloadSpecBtn');
    if (reloadBtn && !reloadBtn._wired) {
      reloadBtn._wired = true;
      reloadBtn.addEventListener('click', loadSpecAndRender);
    }
    const endpointsToggleAll = document.getElementById('apiEndpointsToggleAllBtn');
    if (endpointsToggleAll && !endpointsToggleAll._wired) {
      endpointsToggleAll._wired = true;
      endpointsToggleAll.dataset.wired = '1';
      endpointsToggleAll.addEventListener('pointerdown', (ev) => {
        devLog('log', '[API] Expand/Collapse All: pointerdown', { x: ev.clientX, y: ev.clientY, btn: ev.button });
      }, { passive: true });
      endpointsToggleAll.addEventListener('click', (ev) => {
        devLog('log', '[API] Expand/Collapse All: click', { text: endpointsToggleAll.textContent, aria: endpointsToggleAll.getAttribute('aria-expanded') });
        const list = document.getElementById('apiEndpointsList');
        if (!list) {
          devLog('warn', '[API] ToggleAll click: #apiEndpointsList not found');
          return;
        }
        const treeToggle = document.getElementById('apiTreeToggle');
        const isTree = !treeToggle || treeToggle.checked;
        const isExpand = endpointsToggleAll.textContent.toLowerCase().includes('expand');
        devLog('log', '[API] Expand/Collapse All: state', { isTree, isExpand });
        // In tree view, toggle all groups recursively
        if (isTree) {
          const allGroups = list.querySelectorAll('.api-group');
          devLog('log', '[API] Expand/Collapse All: groups found', allGroups.length);
          allGroups.forEach((g) => {
            g.setAttribute('data-open', isExpand ? '1' : '0');
            const body = g.querySelector(':scope > .api-group__body');
            if (body) body.style.display = isExpand ? '' : 'none';
            const hdr = g.querySelector(':scope > .api-group__header');
            if (hdr) hdr.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
          });
        }
        // In both tree and flat views, toggle all endpoint details
        const allEndpoints = list.querySelectorAll('.api-endpoint');
        devLog('log', '[API] Expand/Collapse All: endpoints found', allEndpoints.length);
        allEndpoints.forEach((ep) => {
          ep.setAttribute('data-open', isExpand ? '1' : '0');
          const body = ep.querySelector(':scope > .api-endpoint__body');
          if (body) {
            if (isExpand) body.classList.remove('hidden');
            else body.classList.add('hidden');
          }
          const toggleBtn = ep.querySelector(':scope > .api-endpoint__header .api-toggle');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
          const epHdr = ep.querySelector(':scope > .api-endpoint__header');
          if (epHdr) epHdr.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
        });
        // Flip button label
        endpointsToggleAll.textContent = isExpand ? 'Collapse All' : 'Expand All';
        endpointsToggleAll.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
        devLog('log', '[API] Expand/Collapse All: done', { newLabel: endpointsToggleAll.textContent, aria: endpointsToggleAll.getAttribute('aria-expanded') });
      });
    }
    // Old header expand/collapse buttons removed in HTML; no wiring needed.

    const treeToggle = document.getElementById('apiTreeToggle');
    if (treeToggle && !treeToggle._wired) {
      treeToggle._wired = true;
      treeToggle.addEventListener('change', () => {
        devLog('debug', '[API] Tree toggle changed', { checked: treeToggle.checked });
        renderEndpoints(lastFetchedRoutes || []);
        const hdrToggle = document.getElementById('apiEndpointsToggleAllBtn');
        if (hdrToggle) {
          hdrToggle.textContent = 'Expand All';
          hdrToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    const search = document.getElementById('apiSearch');
    if (search && !search._wired) {
      search._wired = true;
      search.addEventListener('input', () => {
        const val = (search.value || '').toLowerCase();
        const list = document.getElementById('apiEndpointsList');
        if (!list) return;
        const treeToggle = document.getElementById('apiTreeToggle');
        const isTree = !treeToggle || treeToggle.checked;
        if (isTree) {
          // Filter groups and endpoints within
          const groups = list.querySelectorAll('.api-group');
          groups.forEach((group) => {
            const eps = group.querySelectorAll(':scope > .api-group__body > .api-endpoint');
            let anyMatch = false;
            eps.forEach((ep) => {
              const p = (ep.querySelector('.api-path')?.textContent || '').toLowerCase();
              const show = !val || p.includes(val);
              ep.style.display = show ? '' : 'none';
              if (show) anyMatch = true;
            });
            // If no direct endpoints match, see if any descendant group has a match
            if (!anyMatch) {
              const descendantEp = group.querySelector('.api-endpoint[style*="display: "]:not([style*="display: none"])');
              if (descendantEp) anyMatch = true;
            }
            group.style.display = anyMatch ? '' : 'none';
            // Expand groups with matches for visibility
            if (anyMatch) {
              group.setAttribute('data-open', '1');
              const body = group.querySelector(':scope > .api-group__body');
              if (body) body.style.display = '';
            }
          });
        }
        else {
          // Flat list filtering
          const eps = list.querySelectorAll('.api-endpoint');
          eps.forEach((ep) => {
            const p = (ep.querySelector('.api-path')?.textContent || '').toLowerCase();
            const show = !val || p.includes(val);
            ep.style.display = show ? '' : 'none';
          });
        }
      });
    }
    wireComposer();
    const isActive = ts && typeof ts.getActiveTab === 'function' && ts.getActiveTab() === 'api';
    if (isActive) loadSpecAndRender();
    if (ts) {
      window.addEventListener('tabchange', (ev) => {
        if (ev?.detail?.activeTab === 'api') loadSpecAndRender();
      });
    }
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash === 'api') setTimeout(loadSpecAndRender, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
// -----------------------------
// Player Manager
// -----------------------------
const Player = (() => {
  // DOM refs
  let videoEl;
  let titleEl;
  let curEl;
  let totalEl;
  let timelineEl;
  let heatmapEl;
  let heatmapCanvasEl;
  let progressEl;
  let markersEl;
  let spriteTooltipEl;
  let overlayBarEl;
  // floating translucent title bar
  let subtitleOverlayEl;
  // Custom controls
  let btnPlayPause;
  let btnMute;
  let volSlider;
  let rateSelect;
  let btnPip;
  let btnFullscreen;
  // New controls
  let btnSeekBack30;
  let btnSeekFwd30;
  let btnPrevFrame;
  let btnNextFrame;
  let btnRestartVideo;
  let btnPrevVideo;
  let btnNextVideo;
  // Remember last non-zero volume so unmute can restore it
  let _lastNonZeroVolume = 1;
  // Sidebar refs
  // Sidebar title removed;
  // retain variable for backward compatibility but unused
  let sbFileNameEl;
  // File info table fields
  let fiDurationEl;
  let fiResolutionEl;
  let fiVideoCodecEl;
  let fiAudioCodecEl;
  let fiBitrateEl;
  let fiVBitrateEl;
  let fiABitrateEl;
  let fiSizeEl;
  let fiModifiedEl;
  let fiPathEl;
  // Playback helpers (avoid unhandled play() rejections)
  const safePlay = async (v) => {
    if (!v) return;
    // Some browsers reject play() if another play/pause/seek is pending.
    // Await and swallow errors per recommended guidance.
    await v.play();
  };
  // Await next 'seeked' event (or timeout) for a given video element.
  const awaitSeekEvent = (v, timeout = 1200) => new Promise((res) => {
    if (!v) return res();
    let done = false;
    const onSeek = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', onSeek);
      res();
    };
    v.addEventListener('seeked', onSeek);
    setTimeout(() => {
      if (!done) {
        done = true;
        v.removeEventListener('seeked', onSeek);
        res();
      }
    }, timeout);
  });
  // Compact artifact badges
  let badgeHeatmap;
  let badgeMarkers;
  let badgeSprites;
  let badgePreview;
  let badgePhash;
  let badgeHeatmapStatus;
  let badgeMarkersStatus;
  let badgeSpritesStatus;
  let badgePreviewStatus;
  let badgePhashStatus;
  // Marker / overlay control buttons (grouped for clarity)
  let btnSetThumbnail = null;
  let btnAddMarker = null;
  let btnSetIntroEnd = null;
  let btnSetOutroBegin = null;
  // outro begin marker (skip tail)
  // State
  let currentPath = null;
  // relative path from /api library
  let duration = 0;
  let sprites = null;
  // {index, sheet}
  let markers = [];
  let introEnd = null;
  let outroBegin = null;
  let hasHeatmap = false;
  let subtitlesUrl = null;
  let timelineMouseDown = false;
  // Overlay auto-hide timer
  let overlayHideTimer = null;
  // @TODO copilot: make this configurable in a setting
  const OVERLAY_FADE_DELAY = 2500;
  // ms before fading overlay bar
  // Keep overlay visible briefly after keyboard interactions
  let overlayKbActiveUntil = 0;
  function markKeyboardActive() {
    try {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      overlayKbActiveUntil = now + OVERLAY_FADE_DELAY + 250;
    }
    catch (_) {
      overlayKbActiveUntil = Date.now() + OVERLAY_FADE_DELAY + 250;
    }
  }
  // Scrubber elements
  let scrubberEl = null;
  let scrubberTrackEl = null;
  let scrubberProgressEl = null;
  let scrubberBufferEl = null;
  let scrubberTimeEl = null;
  // (btnSetIntroEnd declared above with other marker buttons)
  let scrubberRAF = null;
  let scrubberDragging = false;
  let scrubberWasPaused = null;
  let scrubberHandleEl = null;
  let scrubberMarkersLayer = null;
  // ---- Progress persistence (localStorage) ----
  const LS_PREFIX = 'mediaPlayer';
  // Pending override seek time (seconds) applied on next loadedmetadata
  let resumeOverrideTime = null;
  const keyForVideo = (path) => `${LS_PREFIX}:video:${path}`;
  const keyLastVideoObj = () => `${LS_PREFIX}:last`;
  const keyLastVideoPathLegacy = () => `${LS_PREFIX}:lastVideo`;
  function rememberLastVideo(path, time = 0) {
    if (!path) return;
    localStorage.setItem(
      keyLastVideoObj(),
      JSON.stringify({
        path,
        time: Math.max(0, Number(time) || 0),
        ts: Date.now(),
      }),
    );
    localStorage.setItem(keyLastVideoPathLegacy(), path);
  }
  function saveProgress(path, data) {
    if (!path) return;
    const payload = JSON.stringify({
      t: Math.max(0, Number(data?.t ?? 0) || 0),
      d: Math.max(0, Number(data?.d ?? 0) || 0),
      paused: Boolean(data?.paused),
      rate: Number.isFinite(data?.rate) ? Number(data.rate) : undefined,
      ts: Date.now(),
    });
    localStorage.setItem(keyForVideo(path), payload);
    rememberLastVideo(path, data?.t);
  }
  function loadProgress(path) {
    try {
      const raw = localStorage.getItem(keyForVideo(path));
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object') return null;
      return j;
    }
    catch (_) {
      return null;
    }
  }
  function getLastVideoEntry() {
    const raw = localStorage.getItem(keyLastVideoObj());
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && j.path) return j;
    }
    const legacy = localStorage.getItem(keyLastVideoPathLegacy());
    if (legacy) return {path: legacy, time: 0};
    return null;
  }
  function qs(id) {
    return document.getElementById(id);
  }
  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return ((h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
  }
  // Helper: wire intro/outro marker buttons once. Keeps logic DRY.
  function wireIntroOutroButtons() {
    // Intro marker button
    if (btnSetIntroEnd && !btnSetIntroEnd._wired) {
      btnSetIntroEnd._wired = true;
      btnSetIntroEnd.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
        try {
          // Try server persistence first
          try {
            const mu = new URL('/api/markers', window.location.origin);
            mu.searchParams.set('path', currentPath);
            mu.searchParams.set('time', String(t.toFixed(3)));
            mu.searchParams.set('special', 'intro');
            const mr = await fetch(mu.toString(), { method: 'POST' });
            if (!mr.ok) {
              throw new Error('server');
            }
          }
          catch (_) {
            // Fallback to localStorage
            const key = `${LS_PREFIX}:intro:${currentPath}`;
            localStorage.setItem(key, String(Number(t.toFixed(3))));
          }
          notify('Intro set at ' + fmtTime(t), 'success');
          await loadMarkers();
          renderMarkers();
          renderMarkersList();
        }
        catch (e) {
          notify('Failed to set intro', 'error');
        }
      });
    }
    // Outro marker button
    if (btnSetOutroBegin && !btnSetOutroBegin._wired) {
      btnSetOutroBegin._wired = true;
      btnSetOutroBegin.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
        try {
          // Try server persistence first
          try {
            const mu = new URL('/api/markers', window.location.origin);
            mu.searchParams.set('path', currentPath);
            mu.searchParams.set('time', String(t.toFixed(3)));
            mu.searchParams.set('special', 'outro');
            const mr = await fetch(mu.toString(), { method: 'POST' });
            if (!mr.ok) throw new Error('server');
          }
          catch (_) {
            localStorage.setItem(`${LS_PREFIX}:outro:${currentPath}`, String(Number(t.toFixed(3))));
          }
          outroBegin = t;
          notify('Outro set', 'success');
          renderMarkers();
          renderMarkersList();
        }
        catch (e) {
          notify('Failed to set outro', 'error');
        }
      });
    }
  }
  let playerTagsSpinnerEl = null;
  function initDom() {
    // Resolve button elements (grouped)
    // (intro/outro buttons already resolved earlier in initDom)
    // Wire marker intro/outro actions via helper
    wireIntroOutroButtons();
    if (videoEl) return;
    // already
    videoEl = qs('playerVideo');
    titleEl = qs('playerTitle');
    overlayBarEl = qs('playerOverlayBar');
    if (overlayBarEl && !overlayBarEl.dataset.overlayReady) {
      overlayBarEl.dataset.overlayReady = '1';
      overlayBarEl.classList.add('fading');
    }
    if (videoEl && !videoEl._dblWired) {
      videoEl._dblWired = true;
      videoEl.addEventListener('dblclick', async (e) => {
        const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
        if (!document.fullscreenElement) await container.requestFullscreen();
        else await document.exitFullscreen();
      });
    }
    // subtitle overlay element (in-video textual captions rendered by JS)
    subtitleOverlayEl = qs('subtitleOverlay');
    if (overlayBarEl && (!titleEl || !titleEl.textContent.trim())) {
      overlayBarEl.dataset.empty = '1';
    }
    // Scrubber
    scrubberEl = qs('playerScrubber');
    if (scrubberEl && !scrubberEl.dataset.overlayReady) {
      scrubberEl.dataset.overlayReady = '1';
      scrubberEl.classList.add('fading');
    }
    scrubberTrackEl = qs('playerScrubberTrack');
    scrubberProgressEl = qs('playerScrubberProgress');
    scrubberBufferEl = qs('playerScrubberBuffer');
    scrubberTimeEl = qs('playerScrubberTime');
    if (scrubberTrackEl && !scrubberHandleEl) {
      scrubberHandleEl = document.createElement('div');
      scrubberHandleEl.className = 'scrubber-handle';
      scrubberTrackEl.appendChild(scrubberHandleEl);
    }
    if (scrubberTrackEl && !scrubberMarkersLayer) {
      scrubberMarkersLayer = document.createElement('div');
      scrubberMarkersLayer.className = 'scrubber-markers';
      scrubberTrackEl.appendChild(scrubberMarkersLayer);
    }
    curEl = qs('curTime');
    totalEl = qs('totalTime');
    timelineEl = qs('timeline');
    // legacy element (may be missing)
    heatmapEl = qs('timelineHeatmap');
    heatmapCanvasEl = qs('timelineHeatmapCanvas');
    progressEl = qs('timelineProgress');
    markersEl = qs('timelineMarkers');
    spriteTooltipEl = qs('spritePreview');
    if (!spriteTooltipEl) {
      // Fallback in case markup changed; create ephemeral element
      spriteTooltipEl = document.createElement('div');
      spriteTooltipEl.id = 'spritePreview';
      spriteTooltipEl.style.position = 'absolute';
      hide(spriteTooltipEl);
      (videoEl && videoEl.parentElement ? videoEl.parentElement : document.body).appendChild(spriteTooltipEl);
    }
    badgeHeatmap = qs('badgeHeatmap');
    badgeMarkers = qs('badgeMarkers');
    badgeSprites = qs('badgeSprites');
    badgePreview = qs('badgePreview');
    badgePhash = qs('badgePhash');
    badgeHeatmapStatus = qs('badgeHeatmapStatus');
    badgeMarkersStatus = qs('badgeMarkersStatus');
    badgeSpritesStatus = qs('badgeSpritesStatus');
    badgePreviewStatus = qs('badgePreviewStatus');
    badgePhashStatus = qs('badgePhashStatus');
    // Support new hyphenated badge IDs (preferred) with fallback to legacy camelCase if present
    const pick = (id1, id2, id3) => document.getElementById(id1) || (id2 ? document.getElementById(id2) : null) || (id3 ? document.getElementById(id3) : null);
    // Note: heatmap badge in markup uses plural "badge-heatmap"; support both
    badgeHeatmap = pick('badge-heatmap', 'badge-heatmap', 'badgeHeatmap');
    badgeMarkers = pick('badge-markers', 'badgeMarkers');
    badgeSprites = pick('badge-sprites', 'badgeSprites');
    badgePreview = pick('badge-preview', 'badgePreview');
    badgePhash = pick('badge-phash', 'badgePhash');
    badgeHeatmapStatus = pick('badge-heatmap-status', 'badge-heatmap-status', 'badgeHeatmapStatus');
    badgeMarkersStatus = pick('badge-markers-status', 'badgeMarkersStatus');
    badgeSpritesStatus = pick('badge-sprites-status', 'badgeSpritesStatus');
    badgePreviewStatus = pick('badge-preview-status', 'badgePreviewStatus');
    badgePhashStatus = pick('badge-phash-status', 'badgePhashStatus');
    // Extra resilience: if a status element wasn't found but the badge exists, try to locate a child span ending with -status
    if (!badgeMarkersStatus && badgeMarkers) {
      badgeMarkersStatus = badgeMarkers.querySelector('span[id$="-status"]') || null;
    }
    btnSetThumbnail = qs('btnSetThumbnail');
    btnAddMarker = qs('btnAddMarker');
    btnSetIntroEnd = qs('btnSetIntroEnd');
    btnSetOutroBegin = qs('btnSetOutroBegin');
    // Controls
    btnPlayPause = qs('btnPlayPause');
    btnMute = qs('btnMute');
    volSlider = qs('volSlider');
    rateSelect = qs('rateSelect');
    btnPip = qs('btnPip');
    btnFullscreen = qs('btnFullscreen');
    // New controls
    btnSeekBack30 = qs('btnSeekBack30');
    btnSeekFwd30 = qs('btnSeekFwd30');
    btnPrevFrame = qs('btnPrevFrame');
    btnNextFrame = qs('btnNextFrame');
    btnRestartVideo = qs('btnRestartVideo');
    btnPrevVideo = qs('btnPrevVideo');
    btnNextVideo = qs('btnNextVideo');
    // Actions panel buttons
    const btnDownloadFrame = qs('btnDownloadFrame');
    const btnConvert = qs('btnConvert');
    const btnCompress = qs('btnCompress');
    const btnTrim = qs('btnTrim');
    const btnSplit = qs('btnSplit');
    const btnConcat = qs('btnConcat');
    // Sidebar
    sbFileNameEl = null;
    // removed from DOM
    fiDurationEl = qs('fiDuration');
    fiResolutionEl = qs('fiResolution');
    fiVideoCodecEl = qs('fiVideoCodec');
    fiAudioCodecEl = qs('fiAudioCodec');
    fiBitrateEl = qs('fiBitrate');
    fiVBitrateEl = qs('fiVBitrate');
    fiABitrateEl = qs('fiABitrate');
    fiSizeEl = qs('fiSize');
    fiModifiedEl = qs('fiModified');
    fiPathEl = qs('fiPath');
    // Allow inline rename of the current file by double‑clicking the Path value
    if (fiPathEl && !fiPathEl._renameWired) {
      fiPathEl._renameWired = true;
      fiPathEl.title = 'Double‑click to rename file (artifacts move with it)';
      fiPathEl.style.cursor = 'text';
      fiPathEl.addEventListener('dblclick', () => {
        if (!currentPath) return;
        if (fiPathEl.querySelector('input')) return;
        // already editing
        const origRel = currentPath;
        // e.g. folder/name.mp4
        const dir = origRel.includes('/') ? origRel.slice(0, origRel.lastIndexOf('/')) : '';
        const origName = origRel.split('/').pop() || origRel;
        const input = document.createElement('textarea');
        input.value = origName;
        input.className = 'fi-rename-input';
        Object.assign(input.style, {
          width: '100%',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--text)',
          font: 'inherit',
          padding: '2px 4px',
          borderRadius: '4px',
          lineHeight: '1.3',
          resize: 'none',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        });
        // Replace content
        fiPathEl.textContent = '';
        fiPathEl.appendChild(input);
        input.focus();
        input.select();
        // Auto-resize height to fit content (cap at 5 lines / ~200px)
        const autoresize = () => {
          input.style.height = 'auto';
          input.style.height = Math.min(200, input.scrollHeight) + 'px';
        };
        autoresize();
        input.addEventListener('input', autoresize);
        let committing = false;
        const cancel = () => {
          if (committing) return;
          // Restore plain text content
          fiPathEl.textContent = origRel;
        };
        const commit = async () => {
          if (committing) return;
          committing = true;
          let newName = (input.value || '').replace(/[\r\n]+/g, ' ').trim();
          if (!newName) {
            cancel();
            return;
          }
          // Disallow path separators for now (rename only, no move) per UX request
          if (/[\\/]/.test(newName)) {
            notify('Name cannot contain "/"', 'error');
            committing = false;
            input.focus();
            return;
          }
          if (newName === origName) {
            cancel();
            return;
          }
          // Preserve original extension enforcement (server also validates)
          const origExt = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '';
          const newExt = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')) : '';
          if (origExt.toLowerCase() !== newExt.toLowerCase()) {
            notify('Extension must remain ' + origExt, 'error');
            committing = false;
            input.focus();
            return;
          }
          // Save current playback position to restore after reopen
          let resumeT = 0;
          let wasPaused = true;
          if (videoEl) {
            resumeT = videoEl.currentTime || 0;
            wasPaused = videoEl.paused;
          }
          fiPathEl.classList.add('renaming');
          try {
            const u = new URL('/api/media/rename', window.location.origin);
            u.searchParams.set('path', origRel);
            u.searchParams.set('new_name', newName);
            const r = await fetch(u.toString(), {method: 'POST' });
            if (!r.ok) {
              try {
                const j = await r.json();
                notify('Rename failed: ' + (j?.error || r.status), 'error');
              }
              catch (_) {
                notify('Rename failed', 'error');
              }
              cancel();
              return;
            }
            const dirPrefix = dir ? dir + '/' : '';
            const newRel = dirPrefix + newName;
            notify('Renamed to ' + newName, 'success');
            // Update path + reopen video to keep playback position
            currentPath = newRel;
            // Attempt to restore playback after reopen
            resumeOverrideTime = resumeT;
            fiPathEl.textContent = newRel;
            open(newRel);
            // will set new metadata + title (overwrites value again safely)
            if (!wasPaused) {
              setTimeout(() => {
                if (videoEl && videoEl.paused) safePlay(videoEl);
              }, 800);
            }
            // Refresh library grid entry names later
            setTimeout(() => {
              loadLibrary();
            }, 400);
          }
          catch (err) {
            notify('Rename error', 'error');
            cancel();
          }
          finally {
            fiPathEl.classList.remove('renaming');
          }
        };
        input.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) || e.key === 'Escape') {
            e.preventDefault();
            input.blur();
          }
        });
        input.addEventListener('blur', () => {
          // Always restore plain text immediately on blur, regardless of commit outcome
          let newName = (input.value || '').replace(/[\r\n]+/g, ' ').trim();
          if (!newName || newName === origName) {
            fiPathEl.textContent = origRel;
            return;
          }
          // Disallow path separators for now (rename only, no move)
          if (/[\\/]/.test(newName)) {
            fiPathEl.textContent = origRel;
            return;
          }
          // Preserve original extension enforcement
          const origExt = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '';
          const newExt = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')) : '';
          if (origExt.toLowerCase() !== newExt.toLowerCase()) {
            fiPathEl.textContent = origRel;
            return;
          }
          // If all validation passes, show new name immediately
          const dirPrefix = dir ? dir + '/' : '';
          const newRel = dirPrefix + newName;
          fiPathEl.textContent = newRel;
          // Then proceed with commit logic (async)
          commit();
        });
      });
    }
    // Wire basic events
    if (videoEl) {
      videoEl.addEventListener('timeupdate', () => {
        const t = videoEl.currentTime || 0;
        if (curEl) curEl.textContent = fmtTime(t);
        if (duration > 0 && progressEl) {
          const pct = Math.max(0, Math.min(100, (t / duration) * 100));
          progressEl.style.width = pct + '%';
        }
        if (!currentPath) return;

        const now = Date.now();
        if (!videoEl._lastPersist || now - videoEl._lastPersist > 5000 || (duration && duration - t < 2)) {
          saveProgress(currentPath, {
            t: t,
            d: duration,
            paused: videoEl.paused,
            rate: videoEl.playbackRate,
          });
          videoEl._lastPersist = now;
        }
      });
      videoEl.addEventListener('loadedmetadata', async () => {
        duration = Number(videoEl.duration) || 0;
        if (totalEl) totalEl.textContent = fmtTime(duration);
        syncControls();
        const saved = currentPath ? loadProgress(currentPath) : null;
        const override = resumeOverrideTime;
        const forceStartAtBeginning = isStartAtBeginningEnabled();
        const awaitSeek = (t, timeout = 2000) => new Promise((res) => {
          if (!videoEl) return res();
          let done = false;
          const onSeek = () => {
            if (done) return;
            done = true;
            videoEl.removeEventListener('seeked', onSeek);
            res();
          };
          try {
            videoEl.addEventListener('seeked', onSeek);
            videoEl.currentTime = Math.max(0, Math.min(duration || 0, t));
          }
          catch (_) {
            if (!done) {
              done = true;
              videoEl.removeEventListener('seeked', onSeek);
              res();
            }
          }
          setTimeout(() => {
            if (!done) {
              done = true;
              videoEl.removeEventListener('seeked', onSeek);
              res();
            }
          }, timeout);
        });
        if (saved && Number.isFinite(saved.rate)) {
          videoEl.playbackRate = Number(saved.rate);
        }
        if (forceStartAtBeginning) {
          if (Math.abs(videoEl.currentTime || 0) > 0.01) {
            await awaitSeek(0);
          }
          const autoplayResume = localStorage.getItem('setting.autoplayResume') === '1';
          if (saved && !saved.paused && autoplayResume) {
            await safePlay(videoEl);
          }
        }
        else if (saved && Number.isFinite(saved.t)) {
          const target = Math.max(0, Math.min(duration || 0, Number(saved.t)));
          if (target && Math.abs(target - (videoEl.currentTime || 0)) > 0.5) {
            await awaitSeek(target);
          }
          const autoplayResume = localStorage.getItem('setting.autoplayResume') === '1';
          if (!(saved.paused || !autoplayResume)) {
            await safePlay(videoEl);
          }
        }
        else if (override && Number.isFinite(override)) {
          const t = Math.max(0, Math.min(duration || 0, Number(override)));
          if (t && Math.abs(t - (videoEl.currentTime || 0)) > 0.25) await awaitSeek(t);
          const autoplayResume = localStorage.getItem('setting.autoplayResume') === '1';
          if (autoplayResume) await safePlay(videoEl);
        }
        else {
          const startAtIntro = (function () {
            try {
              const cb = document.getElementById('settingStartAtIntro');
              if (cb) return Boolean(cb.checked);
              return localStorage.getItem('setting.startAtIntro') !== '0';
            }
            catch (_) {
              return true;
            }
          })();
          if (startAtIntro) {
            const key = `${LS_PREFIX}:introEnd:${currentPath}`;
            const raw = getLocalStorageItem(key);
            let applied = false;
            if (raw) {
              const it = Number(raw);
              if (Number.isFinite(it) && it > 0 && it < duration) {
                if (Math.abs(it - (videoEl.currentTime || 0)) > 0.25) await awaitSeek(it);
                applied = true;
              }
            }
            if (!applied && introEnd && Number.isFinite(Number(introEnd)) && introEnd > 0 && introEnd < duration) {
              if (Math.abs(introEnd - (videoEl.currentTime || 0)) > 0.25) await awaitSeek(Number(introEnd));
            }
          }
        }
        resumeOverrideTime = null;
      });
      if (subtitleOverlayEl) {
        subtitleOverlayEl.textContent = '';
        hide(subtitleOverlayEl);
      }
      videoEl.addEventListener('play', syncControls);
      videoEl.addEventListener('pause', () => {
        syncControls();
        if (currentPath) {
          const t = Math.max(0, videoEl.currentTime || 0);
          saveProgress(currentPath, {
            t: t,
            d: duration,
            paused: true,
            rate: videoEl.playbackRate,
          });
        }
      });
      videoEl._clickToggleWired = true;
      videoEl.addEventListener('click', (e) => {
        // Only toggle when clicking the video surface itself
        if (e.target !== videoEl) return;
        if (videoEl.paused) safePlay(videoEl);
        else videoEl.pause();
      });
    }
    if (timelineEl || scrubberTrackEl) {
      const seekTo = (evt) => {
        if (!duration || !videoEl) return;
        const target = timelineEl || scrubberTrackEl;
        const rect = target.getBoundingClientRect();
        const x = Math.max(0, Math.min(evt.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        const t = Math.max(0, Math.min(duration, pct * duration));
        videoEl.currentTime = t;
        saveProgress(currentPath, {
          t: t,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      };
      (timelineEl || scrubberTrackEl).addEventListener('mousedown', (e) => {
        timelineMouseDown = true;
        seekTo(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (timelineMouseDown) seekTo(e);
      });
      window.addEventListener('mouseup', () => {
        timelineMouseDown = false;
      });
      (timelineEl || scrubberTrackEl).addEventListener('mouseenter', () => {
        spriteHoverEnabled = true;
      });
      (timelineEl || scrubberTrackEl).addEventListener('mouseleave', () => {
        spriteHoverEnabled = false;
        hideSprite();
      });
      (timelineEl || scrubberTrackEl).addEventListener('mousemove', (e) => handleSpriteHover(e));
    }
    const heatBand = document.getElementById('scrubberHeatmapBand');
    if (heatBand && !heatBand._hoverWired) {
      heatBand._hoverWired = true;
      heatBand.addEventListener('mouseenter', () => {
        spriteHoverEnabled = true;
      });
      heatBand.addEventListener('mouseleave', () => {
        spriteHoverEnabled = false;
        hideSprite();
      });
      heatBand.addEventListener('mousemove', (e) => handleSpriteHover(e));
    }
    if (btnSetThumbnail && !btnSetThumbnail._wired) {
      btnSetThumbnail._wired = true;
      btnSetThumbnail.addEventListener('click', async () => {
        // THUMBNAIL_ASYNC: PLAYER BUTTON HANDLER start – triggers thumbnail generation (inline attempt + fallback) and initiates refresh logic
        const activePath = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
        if (!videoEl || !activePath) return;
        try {
          const t = Math.max(0, videoEl.currentTime || 0);
          let immediateShown = false;
          const iu = new URL('/api/thumbnail/create/sync', window.location.origin);
          iu.searchParams.set('path', activePath);
          iu.searchParams.set('t', t.toFixed(3));
          iu.searchParams.set('overwrite', 'true');
          const ir = await fetch(iu.toString(), {method: 'POST' });
          if (ir.ok && ir.headers.get('Content-Type')?.includes('image')) {
            const blob = await ir.blob();
            const obj = URL.createObjectURL(blob);
            if (fiThumbnailImg) fiThumbnailImg.src = obj;
            const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
            if (card) {
              const img = card.querySelector('img.thumbnail-img');
              if (img) img.src = obj;
            }
            immediateShown = true;
            notify('Thumbnail updated', 'success');
          }
          if (!immediateShown) {
            const u = new URL('/api/thumbnail', window.location.origin);
            u.searchParams.set('path', activePath);
            u.searchParams.set('t', t.toFixed(3));
            u.searchParams.set('overwrite', 'true');
            const r = await fetch(u, {method: 'POST' });
            if (!r.ok) {
              throw new Error('HTTP ' + r.status);
            }
            notify('Thumbnail updated', 'success');
            const bust = Date.now() + Math.floor(Math.random() * 10000);
            const fresh = `/api/thumbnail?path=${encodeURIComponent(activePath)}&cb=${bust}`;
            const fi = document.getElementById('fiThumbnail');
            if (fi) fi.src = fresh;
            const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
            if (card) {
              const img = card.querySelector('img.thumbnail-img');
              if (img) img.src = fresh;
            }
            const deadline = Date.now() + 4000; // up to 4s
            let delay = 120;
            while (Date.now() < deadline) {
              const headUrl = new URL('/api/thumbnail', window.location.origin);
              headUrl.searchParams.set('path', activePath);
              headUrl.searchParams.set('cb', Date.now().toString());
              const hr = await fetch(headUrl.toString(), {method: 'HEAD', cache: 'no-store' });
              if (hr.ok) {
                const bust2 = Date.now() + Math.floor(Math.random() * 10000);
                const finalUrl = `/api/thumbnail?path=${encodeURIComponent(activePath)}&cb=${bust2}`;
                const fi = document.getElementById('fiThumbnail');
                if (fi) fi.src = finalUrl;
                const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
                if (card) {
                  const img = card.querySelector('img.thumbnail-img');
                  if (img) img.src = finalUrl;
                }
                break;
              }
              await new Promise((r) => setTimeout(r, delay));
              delay = Math.min(600, Math.round(delay * 1.5));
            }
            const bust3 = Date.now() + Math.floor(Math.random() * 10000);
            const fresh3 = `/api/thumbnail?path=${encodeURIComponent(activePath)}&cb=${bust3}`;
            if (fiThumbnailImg) {
              fiThumbnailImg.src = fresh3;
            }
            const cardLatest = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
            if (cardLatest) {
              const img = cardLatest.querySelector('img.thumbnail-img');
              if (img) {
                img.src = fresh3;
              }
            }
          }
          let got = await refreshSidebarThumbnail(activePath);
          if (!got) {
            const deadline = Date.now() + 6000;
            let delay = 250;
            while (Date.now() < deadline && !got) {
              await new Promise((r) => setTimeout(r, delay));
              got = await refreshSidebarThumbnail(activePath);
              delay = Math.min(delay * 1.6, 1200);
            }
          }
          // THUMBNAIL_ASYNC: PLAYER BUTTON HANDLER end – after polling got indicates if refresh succeeded
          if (got) {
            const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
            if (card) card.classList.add('thumbnail-updated');
            setTimeout(() => {
              if (card) {
                card.classList.remove('thumbnail-updated');
              }
            }, 1200);
          }
          else {
            setTimeout(() => loadLibrary(), 250);
          }
        }
        catch (e) {
          notify('Failed to set thumbnail', 'error');
        }
      });
    }
    // Wire custom controls
    if (btnPlayPause && !btnPlayPause._wired) {
      btnPlayPause._wired = true;
      btnPlayPause.addEventListener('click', () => {
        if (!videoEl) return;
        if (videoEl.paused) safePlay(videoEl);
        else videoEl.pause();
      });
    }
    if (btnMute && !btnMute._wired) {
      btnMute._wired = true;
      btnMute.addEventListener('click', () => {
        if (!videoEl) return;
        // Toggle mute without changing slider position; dim slider via class
        if (videoEl.muted) {
          videoEl.muted = false;
        }
        else {
          if (videoEl.volume > 0) _lastNonZeroVolume = videoEl.volume;
          videoEl.muted = true;
        }
        syncControls();
      });
    }
    if (volSlider && !volSlider._wired) {
      volSlider._wired = true;
      volSlider.addEventListener('input', () => {
        if (!videoEl) return;
        const v = Math.max(0, Math.min(1, parseFloat(volSlider.value)));
        videoEl.volume = v;
        if (v > 0) {
          _lastNonZeroVolume = v;
          if (videoEl.muted) videoEl.muted = false;
          // unmute when user drags up
        }
        syncControls();
      });
    }
    // Listen for programmatic volume/mute changes to keep UI in sync
    if (videoEl && !videoEl._volumeSyncAttached) {
      videoEl.addEventListener('volumechange', () => {
        if (videoEl.volume > 0 && !videoEl.muted) _lastNonZeroVolume = videoEl.volume;
        syncControls();
      });
      videoEl._volumeSyncAttached = true;
    }
    if (rateSelect && !rateSelect._wired) {
      rateSelect._wired = true;
      rateSelect.addEventListener('change', () => {
        if (videoEl) videoEl.playbackRate = parseFloat(rateSelect.value || '1');
      });
    }
    if (btnPip && !btnPip._wired) {
      btnPip._wired = true;
      btnPip.addEventListener('click', async () => {
        if (!document.pictureInPictureElement) await videoEl.requestPictureInPicture();
        else await document.exitPictureInPicture();
      });
    }
    if (btnFullscreen && !btnFullscreen._wired) {
      btnFullscreen._wired = true;
      btnFullscreen.addEventListener('click', async () => {
        const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
        if (!document.fullscreenElement) await container.requestFullscreen();
        else await document.exitFullscreen();
      });
    }
    // ---- New: Seek ±30s helpers & wiring ----
    const clampTime = (t) => Math.max(0, Math.min(Number(videoEl?.duration) || 0, t || 0));
    const approxFps = () => {
      const s = localStorage.getItem('setting.frameStepFps');
      const v = Number(s);
      if (Number.isFinite(v) && v > 1 && v < 144) return v;
      return 30;
    };
    const seekBy = async (delta) => {
      if (!videoEl) return;
      const wasPaused = videoEl.paused;
      const cur = Number(videoEl.currentTime || 0);
      // Use configurable jump seconds when delta matches our button convention (±30)
      // Distinct values for backward/forward
      const getJump = (key, fallback) => {
        const raw = localStorage.getItem(key);
        const v = Number(raw);
        if (Number.isFinite(v) && v >= 1 && v <= 600) return v;
        return fallback;
      };
      const back = getJump('setting.jumpBackSeconds', 30);
      const fwd = getJump('setting.jumpFwdSeconds', 30);
      const effectiveDelta = (Math.abs(delta) === 30) ? (delta < 0 ? -back : fwd) : delta;
      const next = clampTime(cur + effectiveDelta);
      if (!Number.isFinite(next)) return;
      videoEl.currentTime = next;
      await awaitSeekEvent(videoEl, 1200);
      if (!wasPaused) await safePlay(videoEl);
      showOverlayBar();
    };
    const stepFrame = async (dir) => {
      if (!videoEl) return;
      const wasPaused = videoEl.paused;
      if (!wasPaused) videoEl.pause();
      const fps = approxFps();
      const step = 1 / Math.max(1, fps);
      const cur = Number(videoEl.currentTime || 0);
      const next = clampTime(cur + (dir > 0 ? step : -step));
      videoEl.currentTime = next;
      await awaitSeekEvent(videoEl, 1200);
      if (!wasPaused) await safePlay(videoEl);
      showOverlayBar();
    };
    const openByIndexDelta = (dir) => {
      if (!currentPath) return;
      const cards = Array.from(document.querySelectorAll('.card[data-path]'));
      if (!cards.length) return;
      const idx = cards.findIndex((c) => (c?.dataset?.path || '') === currentPath);
      if (idx === -1) return;
      const nextIdx = Math.max(0, Math.min(cards.length - 1, idx + dir));
      if (nextIdx === idx) return;
      const p = cards[nextIdx]?.dataset?.path;
      if (p) open(p);
    };
    if (btnRestartVideo && !btnRestartVideo._wired) {
      btnRestartVideo._wired = true;
      btnRestartVideo.addEventListener('click', async () => {
        if (!videoEl) return;
        const wasPaused = videoEl.paused;
        try {
          videoEl.currentTime = 0;
          await awaitSeekEvent(videoEl, 1200);
        }
        catch (_) {
          /* swallow seek errors */
        }
        if (!wasPaused) await safePlay(videoEl);
        showOverlayBar();
      });
    }
    if (btnSeekBack30 && !btnSeekBack30._wired) {
      btnSeekBack30._wired = true;
      btnSeekBack30.addEventListener('click', () => {
        const getJump = (key, fallback) => {
          const raw = localStorage.getItem(key);
          const v = Number(raw);
          if (Number.isFinite(v) && v >= 1 && v <= 600) return v;
          return fallback;
        };
        const back = getJump('setting.jumpBackSeconds', 30);
        seekBy(-back);
      });
    }
    if (btnSeekFwd30 && !btnSeekFwd30._wired) {
      btnSeekFwd30._wired = true;
      btnSeekFwd30.addEventListener('click', () => {
        const getJump = (key, fallback) => {
          const raw = localStorage.getItem(key);
          const v = Number(raw);
          if (Number.isFinite(v) && v >= 1 && v <= 600) return v;
          return fallback;
        };
        const fwd = getJump('setting.jumpFwdSeconds', 30);
        seekBy(fwd);
      });
    }
    if (btnPrevFrame && !btnPrevFrame._wired) {
      btnPrevFrame._wired = true;
      btnPrevFrame.addEventListener('click', () => stepFrame(-1));
    }
    if (btnNextFrame && !btnNextFrame._wired) {
      btnNextFrame._wired = true;
      btnNextFrame.addEventListener('click', () => stepFrame(1));
    }
    if (btnPrevVideo && !btnPrevVideo._wired) {
      btnPrevVideo._wired = true;
      btnPrevVideo.addEventListener('click', () => openByIndexDelta(-1));
    }
    if (btnNextVideo && !btnNextVideo._wired) {
      btnNextVideo._wired = true;
      btnNextVideo.addEventListener('click', () => openByIndexDelta(1));
    }
    if (btnAddMarker && !btnAddMarker._wired) {
      btnAddMarker._wired = true;
      btnAddMarker.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, videoEl.currentTime || 0);
        try {
          const url = new URL('/api/markers', window.location.origin);
          url.searchParams.set('path', currentPath);
          url.searchParams.set('time', String(t.toFixed(3)));
          const r = await fetch(url, {method: 'POST' });
          if (!r.ok) {
            throw new Error('HTTP ' + r.status);
          }
          notify('Marker added', 'success');
          await loadMarkers();
          renderMarkers();
        }
        catch (e) {
          notify('Failed to add marker', 'error');
        }
      });
    }
    // Compact badges are wired in wireBadgeActions()
    // Apply initial display toggles now that elements are captured
    applyTimelineDisplayToggles();
    // Ensure icon states reflect current video status immediately
    syncControls();

    // Wire Actions panel: Download current frame
    if (btnDownloadFrame && !btnDownloadFrame._wired) {
      btnDownloadFrame._wired = true;
      btnDownloadFrame.addEventListener('click', async () => {
        try {
          await downloadCurrentFrame();
        }
        catch (e) {
          notify('Failed to download frame', 'error');
        }
      });
    }
    // Wire Actions panel: Convert / Compress / Trim
    const ensureTasksTab = () => {
      const tasksTab = document.querySelector('[data-tab="tasks"]');
      if (tasksTab) tasksTab.click();
    };
    if (btnConvert && !btnConvert._wired) {
      btnConvert._wired = true;
      btnConvert.disabled = false;
      btnConvert.title = 'Convert current file';
      btnConvert.addEventListener('click', async () => {
        if (!currentPath) return notify('No file selected', 'error');
        try {
          const choice = (prompt('Convert profile: h264 or vp9', 'h264') || 'h264').trim().toLowerCase();
          const profile = choice === 'vp9' ? 'vp9_opus_webm' : 'h264_aac_mp4';
          const res = await submitJob('transcode', { profile, targets: [currentPath], replace: false });
          if (res && res.id) {
            notify('Transcode queued', 'success');
            ensureTasksTab();
          }
          else {
            notify('Failed to queue transcode', 'error');
          }
        }
        catch (e) {
          notify('Failed to queue transcode', 'error');
        }
      });
    }
    if (btnCompress && !btnCompress._wired) {
      btnCompress._wired = true;
      btnCompress.disabled = false;
      btnCompress.title = 'Compress current file (H.264)';
      btnCompress.addEventListener('click', async () => {
        if (!currentPath) return notify('No file selected', 'error');
        try {
          const res = await submitJob('transcode', { profile: 'h264_aac_mp4', targets: [currentPath], replace: false });
          if (res && res.id) {
            notify('Compress queued', 'success');
            ensureTasksTab();
          }
          else {
            notify('Failed to queue compress', 'error');
          }
        }
        catch (e) {
          notify('Failed to queue compress', 'error');
        }
      });
    }
    if (btnTrim && !btnTrim._wired) {
      btnTrim._wired = true;
      btnTrim.disabled = false;
      btnTrim.title = 'Trim current file to a clip';
      btnTrim.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return notify('No file selected', 'error');
        try {
          const cur = Math.max(0, Number(videoEl.currentTime || 0));
          const startStr = prompt('Trim start (e.g., 00:10 or seconds):', String(Math.max(0, Math.floor(cur - 5))));
          if (startStr == null) return; // canceled
          const endStr = prompt('Trim end (e.g., 00:20 or seconds):', String(Math.ceil(cur + 5)));
          if (endStr == null) return;
          const s = parseTimeString(String(startStr).trim());
          const e = parseTimeString(String(endStr).trim());
          if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
            notify('Invalid time range', 'error');
            return;
          }
          const resp = await fetch('/api/actions/trim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, start: s, end: e }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const j = await resp.json();
          if (j && j.id) {
            notify('Trim queued', 'success');
            ensureTasksTab();
          }
          else {
            notify('Failed to queue trim', 'error');
          }
        }
        catch (e) {
          notify('Failed to queue trim', 'error');
        }
      });
    }
    if (btnSplit && !btnSplit._wired) {
      btnSplit._wired = true;
      btnSplit.disabled = false;
      btnSplit.title = 'Split current file into equally sized clips';
      btnSplit.addEventListener('click', async () => {
        if (!currentPath) return notify('No file selected', 'error');
        try {
          const everyStr = prompt('Split every (e.g., 60 or 01:00):', '60');
          if (everyStr == null) return;
          const every = parseTimeString(String(everyStr).trim());
          if (!Number.isFinite(every) || every <= 0) {
            notify('Invalid interval', 'error');
            return;
          }
          const resp = await fetch('/api/actions/split', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, every }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const j = await resp.json();
          if (j && j.id) {
            notify('Split queued', 'success');
            ensureTasksTab();
          }
          else notify('Failed to queue split', 'error');
        }
        catch (_) {
          notify('Failed to queue split', 'error');
        }
      });
    }
    if (btnConcat && !btnConcat._wired) {
      btnConcat._wired = true;
      btnConcat.disabled = false;
      btnConcat.title = 'Concatenate selected files (order = library order)';
      btnConcat.addEventListener('click', async () => {
        try {
          // Build ordered list from current grid order
          const sel = new Set(selectedItems ? Array.from(selectedItems) : []);
          if (currentPath && sel.size === 1 && !sel.has(currentPath)) sel.add(currentPath);
          const ordered = [];
          document.querySelectorAll('.card[data-path]').forEach((card) => {
            const p = card.dataset.path;
            if (sel.has(p)) ordered.push(p);
          });
          // If nothing selected, try to concat current with next selected prompt
          const paths = ordered.length ? ordered : (currentPath ? [currentPath] : []);
          if (!paths || paths.length < 2) {
            notify('Select at least two files in Library (Shift/Ctrl click), then click Concat.', 'info');
            return;
          }
          const outName = prompt('Output name (optional, .mp4 added if missing):', 'concat.mp4') || '';
          const resp = await fetch('/api/actions/concat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths, out_name: outName.trim() || undefined }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const j = await resp.json();
          if (j && j.id) {
            notify('Concat queued', 'success');
            ensureTasksTab();
          }
          else notify('Failed to queue concat', 'error');
        }
        catch (e) {
          notify('Failed to queue concat', 'error');
        }
      });
    }
  }
  // Auto-restore last played video on initial load if:
  // - No video currently open
  // - Library tab is still active (user hasn't explicitly opened a file yet)
  // - A valid last entry exists and file still appears in current listing fetch
  async function tryAutoResumeLast() {
    if (window.tabSystem && typeof window.tabSystem.getActiveTab === 'function') {
      const active = window.tabSystem.getActiveTab();
      if (active !== 'player') {
        devLog('debug', 'autoResume', 'skipped: player tab not active', { active });
        return;
      }
    }
    const now = Date.now();
    if (playerResetSuppressAutoResumeUntil && now < playerResetSuppressAutoResumeUntil) {
      devLog('debug', 'autoResume', 'skipped: suppression active', {now, until: playerResetSuppressAutoResumeUntil});
      return;
    }
    if (currentPath) {
      devLog('debug', 'autoResume', 'skipped: currentPath already set', {currentPath});
      return;
    }
    // something already playing/selected
    const last = getLastVideoEntry();
    if (!last) {
      devLog('debug', 'autoResume', 'no last entry');
      return;
    }
    devLog('debug', 'autoResume', 'considering last entry', last);
    if (!last || !last.path) return;
    // Defer until at least one library load attempt has happened (totalFiles initialized)
    if (typeof totalFiles === 'undefined') {
      devLog('debug', 'autoResume', 'totalFiles undefined; retry later');
      setTimeout(tryAutoResumeLast, 600);
      return;
    }
    // Validate that the video file still exists before attempting to load
    const p = last.path;
    let exists = false;

    try {
      // Use shared cached artifact status function
      const status = await fetchArtifactStatusForPath(p);
      if (status) {
        exists = true;
      }

      // Double-check by probing the actual video file
      if (exists) {
        const encPath = p.split('/').map(encodeURIComponent)
          .join('/');
        const fileUrl = new URL('/files/' + encPath, window.location.origin);
        const fileResponse = await fetch(fileUrl.toString(), { method: 'HEAD' });

        if (!fileResponse.ok) {
          devLog('warn', 'autoResume', 'video file not accessible', {path: p, status: fileResponse.status});
          exists = false;

          // If file doesn't exist, clean up localStorage
          if (fileResponse.status === 404) {
            lsRemove(keyLastVideoObj());
            lsRemove(keyLastVideoPathLegacy());
            devLog('info', 'autoResume', 'removed missing video from localStorage', {path: p});
            return;
          }
        }
      }
    }
    catch (error) {
      devLog('error', 'autoResume', 'existence check failed', {path: p, error: error.message});
      exists = false;
    }

    if (!exists) {
      devLog('debug', 'autoResume', 'video file not found or not accessible', {path: p});
      return;
    }

    devLog('debug', 'autoResume', 'existence confirmed; opening last video');
    // status endpoint failed entirely
    // Switch to player tab and load via Player module
    resumeOverrideTime = Number.isFinite(last.time) ? Number(last.time) : null;
    if (window.Player && typeof window.Player.open === 'function') {
      window.Player.open(p);
    }
    else if (typeof Player !== 'undefined' && Player && typeof Player.open === 'function') {
      Player.open(p);
    }
  }
  window.__tryAutoResumeLast = tryAutoResumeLast;
  // Wrap existing initial load hook
  const _origInit = window.addEventListener;
  window.addEventListener('load', () => {
    const wasSkipped = (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1');
    if (wasSkipped) {
      // remove exact last keys
      lsRemove(keyLastVideoObj());
      lsRemove(keyLastVideoPathLegacy());
      // remove any mediaPlayer:video:* entries
      const toRemove = [];
      for (let i = 0;
        i < localStorage.length;
        i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf(`${LS_PREFIX}:video:`) === 0) toRemove.push(k);
        if (/last/i.test(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => {
        lsRemove(k);
      });
    }
    lsRemove('mediaPlayer:skipSaveOnUnload');
  });
  window.addEventListener('beforeunload', () => {
    if (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1') return;
    if (currentPath && videoEl) {
      const t = Math.max(0, videoEl.currentTime || 0);
      saveProgress(currentPath, {
        t: t,
        d: duration,
        paused: videoEl.paused,
        rate: videoEl.playbackRate,
      });
    }
  });
  function syncControls() {
    if (!videoEl) return;
    // Play/Pause swap
    if (btnPlayPause) {
      const playIcon = btnPlayPause.querySelector('.icon-play');
      const pauseIcon = btnPlayPause.querySelector('.icon-pause');
      if (playIcon && pauseIcon) {
        if (videoEl.paused) {
          playIcon.classList.remove('hidden');
          pauseIcon.classList.add('hidden');
        }
        else {
          playIcon.classList.add('hidden');
          pauseIcon.classList.remove('hidden');
        }
      }
    }
    // Volume swap
    if (btnMute) {
      const vol = btnMute.querySelector('.icon-vol');
      const muted = btnMute.querySelector('.icon-muted');
      if (vol && muted) {
        if (videoEl.muted || videoEl.volume === 0) {
          vol.classList.add('hidden');
          muted.classList.remove('hidden');
        }
        else {
          vol.classList.remove('hidden');
          muted.classList.add('hidden');
        }
      }
    }
    if (volSlider && typeof videoEl.volume === 'number') {
      const v = videoEl.volume;
      // Only update numeric if drifted > small epsilon
      if (Math.abs(parseFloat(volSlider.value) - v) > 0.005) {
        volSlider.value = String(v.toFixed(2));
      }
      const pct = Math.round(v * 100);
      volSlider.style.setProperty('--vol-pct', pct + '%');
      volSlider.title = pct + '%';
      if (videoEl.muted || v === 0) volSlider.classList.add('is-muted');
      else volSlider.classList.remove('is-muted');
    }
    if (rateSelect) rateSelect.value = String(videoEl.playbackRate || 1);
  }
  // Volume keyboard shortcuts (ArrowUp / ArrowDown)
  if (!window._volKeysBound) {
    window._volKeysBound = true;
    document.addEventListener('keydown', (e) => {
      if (!videoEl) return;
      let playerTabActive = true;
      try {
        const ts = window.tabSystem;
        if (ts && typeof ts.getActiveTab === 'function') {
          playerTabActive = ts.getActiveTab() === 'player';
        }
      }
      catch (_) {
        playerTabActive = true;
      }
      if (!playerTabActive) return;
      const activeEl = document.activeElement;
      const tag = (activeEl && activeEl.tagName) || '';
      const inForm = /INPUT|TEXTAREA|SELECT/.test(tag) || (activeEl && activeEl.isContentEditable === true);
      // Prevent page scroll when focused on body and using space/arrow keys for player
      if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!inForm) {
          e.preventDefault();
        }
      }
      // Volume
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (inForm) return;
        const delta = (e.key === 'ArrowUp') ? 0.05 : -0.05;
        let nv = Math.max(0, Math.min(1, (videoEl.volume || 0) + delta));
        if (nv < 0.005) nv = 0; // snap tiny
        videoEl.volume = nv;
        if (nv > 0 && videoEl.muted) videoEl.muted = false;
        syncControls();
        markKeyboardActive();
        showOverlayBar();
        return;
      }
      // Seek left/right (configurable seconds)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (inForm) return;
        const getJump = (key, fallback) => {
          const raw = localStorage.getItem(key);
          const v = Number(raw);
          if (Number.isFinite(v) && v >= 1 && v <= 600) return v;
          return fallback;
        };
        const back = getJump('setting.jumpBackSeconds', 30);
        const fwd = getJump('setting.jumpFwdSeconds', 30);
        const delta = (e.key === 'ArrowLeft') ? -back : fwd;
        const cur = Number(videoEl.currentTime || 0);
        const dur = Number(videoEl.duration || 0) || 0;
        const next = Math.max(0, Math.min(dur || 9e9, cur + delta));
        videoEl.currentTime = next;
        markKeyboardActive();
        showOverlayBar();
        return;
      }
      // Space toggles play/pause
      if ((e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') && !inForm) {
        if (videoEl.paused) {
          safePlay(videoEl);
        }
        else {
          videoEl.pause();
        }
        markKeyboardActive();
        showOverlayBar();
        return;
      }
    }, {passive: false});
  }
  // Sidebar File Info thumbnail handling
  const fiThumbnailWrap = document.getElementById('fiThumbnailWrap');
  const fiThumbnailImg = document.getElementById('fiThumbnail');
  const fiSetThumbnailBtn = document.getElementById('fiSetThumbnailBtn');
  // Sidebar Rating/Description elements
  const ratingGroup = document.getElementById('videoRating');
  const descInput = document.getElementById('videoDescription');
  async function refreshSidebarThumbnail(path) {
    // THUMBNAIL_ASYNC: REFRESH FUNCTION start – attempts to resolve & load latest thumbnail image for sidebar + grid
    if (!fiThumbnailWrap || !fiThumbnailImg || !path) return;
    let updated = false;

    {
      const card = document.querySelector(`.card[data-path="${path.replace(/"/g, '\\"')}"]`);
      if (card) {
        const cardImg = card.querySelector('img.thumbnail-img');
        if (cardImg && cardImg.src) {
          fiThumbnailImg.src = cardImg.src;
          show(fiThumbnailWrap);
          return true; // done (already in sync with grid)
        }
      }
    }

    // Prefer API thumbnail endpoint (abstracts artifact location) then fallback direct artifact paths
    const parts = path.split('/');
    const fname = parts.pop();
    if (!fname) return;
    const parent = parts.join('/');
    const stem = fname.replace(/\.[^.]+$/, '');
    const thumbnailAPI = `/api/thumbnail?path=${encodeURIComponent(path)}&cb=${Date.now()}`;
    const enc = (p) => p.split('/').filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    const parentEnc = enc(parent);
    const artPath = ['/files', parentEnc, '.artifacts', stem + '.thumbnail.jpg'].filter(Boolean).join('/');
    const sibPath = ['/files', parentEnc, stem + '.thumbnail.jpg'].filter(Boolean).join('/');
    const candidates = [thumbnailAPI, (artPath.startsWith('/') ? artPath : '/' + artPath), (sibPath.startsWith('/') ? sibPath : '/' + sibPath)];
    let loaded = false;
    for (const c of candidates) {
      if (loaded) break;
      // If candidate is the thumbnail API we already have cache bust param.
      let base = c;
      // Replace legacy v= param approach with unified cb= cache buster
      // Remove any existing v= or cb= params then append one fresh cb
      try {
        const uo = new URL(base, window.location.origin);
        uo.searchParams.delete('v');
        uo.searchParams.delete('cb');
        uo.searchParams.append('cb', Date.now());
        base = uo.pathname + '?' + uo.searchParams.toString();
      }
      catch (_) {
        // Fallback string replace if URL constructor fails (unlikely)
        base = base.replace(/([?&])(v|cb)=\d+/g, '').replace(/[?&]+$/, '');
        base += (base.includes('?') ? '&' : '?') + 'cb=' + Date.now();
      }
      // Optionally probe existence with HEAD for non-API paths to avoid transient 404 image flashes.
      if (!c.startsWith('/api/thumbnail')) {
        try {
          const head = await fetch(base.replace(/\?(?=[^?]*$).*/, (m) => m), {method: 'HEAD', cache: 'no-store' });
          if (!head.ok) continue;
        }
        catch (_) {
          continue;
        }
      }
      const url = base;
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          fiThumbnailImg.classList.add('_updating');
          fiThumbnailImg.src = url;
          show(fiThumbnailWrap);
          const card = document.querySelector(`.card[data-path="${path.replace(/"/g, '\\"')}"]`);
          if (card) {
            const cardImg = card.querySelector('img.thumbnail-img');
            if (cardImg) cardImg.src = url;
          }
          loaded = true;
          updated = true;
          setTimeout(() => fiThumbnailImg.classList.remove('_updating'), 40);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });
    }
    if (!loaded) {
      if (!fiThumbnailImg.src) {
        fiThumbnailImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      }
      show(fiThumbnailWrap);
    }
    // THUMBNAIL_ASYNC: REFRESH FUNCTION end – returns whether an update occurred
    return updated;
  }
  window.refreshSidebarThumbnail = refreshSidebarThumbnail;
  // Clicking the sidebar thumbnail should asynchronously reload it (cache-busted)
  if (fiThumbnailImg && !fiThumbnailImg._reloadWired) {
    fiThumbnailImg._reloadWired = true;
    fiThumbnailImg.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentPath) return;
      await refreshSidebarThumbnail(currentPath);
    });
  }
  // -----------------------------
  // Rating (1..5), Favorite (bool), and Description (text)
  // Backed by server metadata only (no localStorage fallback)
  // -----------------------------
  function setStarsVisual(ratingVal = 0) {
    const group = document.getElementById('videoRating');
    if (!group) return;
    const stars = Array.from(group.querySelectorAll('.star'));
    stars.forEach((b) => {
      const val = Number(b.dataset.value || '0');
      const on = Number.isFinite(val) && val > 0 && val <= ratingVal;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-checked', on ? 'true' : 'false'); // assistive tech
      b.classList.toggle('active', on);
    });
  }
  async function loadRatingAndDescription() {
    if (!currentPath) return;
    // Resolve elements each call (script loads before DOM)
    const group = document.getElementById('videoRating');
    const desc = document.getElementById('videoDescription');
    const favBtn = document.getElementById('videoFavorite');
    // Reset UI defaults
    if (group) setStarsVisual(0);
    if (desc) {
      desc.textContent = ' ';
      desc.setAttribute('data-empty', '1');
    }
    // Fetch from backend
    let ratingServer = null;
    let description = null;
    let favorite = false;
    const u = new URL('/api/media/info', window.location.origin);
    u.searchParams.set('path', currentPath);
    const r = await fetch(u.toString());
    if (r.ok) {
      const j = await r.json();
      const d = j?.data || j || {};
      const nr = Number(d.rating);
      if (Number.isFinite(nr) && nr >= 0 && nr <= 5) ratingServer = nr;
      if (typeof d.description === 'string') description = d.description;
      if (typeof d.favorite === 'boolean') favorite = Boolean(d.favorite);
    }
    if (group) {
      const rv = Number.isFinite(ratingServer) ? Number(ratingServer) : 0;
      group._currentRating = rv;
      setStarsVisual(rv);
    }
    if (desc && typeof description === 'string') {
      const trimmed = (description || '').trim();
      const empty = trimmed.length === 0;
      desc.textContent = empty ? ' ' : description;
      desc.setAttribute('data-empty', empty ? '1' : '0');
    }
    const updateFav = (on) => {
      if (favBtn) {
        favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        favBtn.classList.toggle('active', Boolean(on));
      }
    };
    if (favBtn) updateFav(favorite);
  }
  async function saveRating(r) {
    if (!currentPath || !Number.isFinite(r)) return;
    let saved = false;
    const u = new URL('/api/media/rating', window.location.origin);
    u.searchParams.set('path', currentPath);
    u.searchParams.set('rating', String(Math.max(0, Math.min(5, r))));
    const resp = await fetch(u.toString(), {method: 'POST' });
    if (resp.ok) saved = true;
  }
  async function saveDescription(text) {
    if (!currentPath) return;
    let saved = false;
    const u = new URL('/api/media/description', window.location.origin);
    u.searchParams.set('path', currentPath);
    const resp = await fetch(u.toString(), {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({description: text || '' }) });
    if (resp.ok) saved = true;
  }
  async function saveFavorite(on) {
    if (!currentPath) return;
    const u = new URL('/api/media/favorite', window.location.origin);
    u.searchParams.set('path', currentPath);
    const resp = await fetch(u.toString(), {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({favorite: Boolean(on)})});
    if (!resp.ok) throw new Error('favorite save failed');
  }
  // Wire rating UI (hover preview, keyboard, click commit)
  if (ratingGroup && !ratingGroup._wired) {
    ratingGroup._wired = true;
    // Ensure basic ARIA roles on child stars
    Array.from(ratingGroup.querySelectorAll('.star')).forEach((b) => {
      b.setAttribute('role', 'radio');
      if (!b.hasAttribute('tabindex')) b.setAttribute('tabindex', '0');
    });
    // Click to commit (clicking the same selected star toggles off → 0)
    ratingGroup.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest('.star');
      if (!btn) return;
      const val = Number(btn.dataset.value || '0');
      if (!Number.isFinite(val) || val <= 0) return;
      const current = Number(ratingGroup._currentRating || 0);
      const next = (current === val) ? 0 : val;
      ratingGroup._currentRating = next;
      setStarsVisual(next);
      saveRating(next);
    });
    // No hover/focus preview: hovering should not change the displayed rating
    // Keyboard: Left/Right/Home/End to adjust rating; Enter/Space to commit current preview
    ratingGroup.addEventListener('keydown', (e) => {
      const max = 5;
      let cur = Number(ratingGroup._currentRating || 0);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = Math.min(max, cur + 1);
        setStarsVisual(cur);
        ratingGroup._currentRating = cur;
        saveRating(cur);
      }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        cur = Math.max(0, cur - 1);
        setStarsVisual(cur);
        ratingGroup._currentRating = cur;
        saveRating(cur);
      }
      else if (e.key === 'Home') {
        e.preventDefault();
        cur = 0;
        setStarsVisual(cur);
        ratingGroup._currentRating = cur;
        saveRating(cur);
      }
      else if (e.key === 'End') {
        e.preventDefault();
        cur = max;
        setStarsVisual(cur);
        ratingGroup._currentRating = cur;
        saveRating(cur);
      }
    });
  }
  // Wire description input (contenteditable div)
  if (descInput && !descInput._wired) {
    descInput._wired = true;
    if (!descInput.hasAttribute('contenteditable')) descInput.setAttribute('contenteditable', 'false');
    descInput.title = 'Double-click to edit';
    // Ensure a visible click target even when empty
    const ensureSpace = () => {
      const empty = !descInput.textContent || descInput.textContent.trim().length === 0;
      if (empty) {
        descInput.textContent = ' ';
        descInput.setAttribute('data-empty', '1');
      }
      else descInput.setAttribute('data-empty', '0');
    };
    ensureSpace();
    const getDesc = () => (descInput.textContent || '').replace(/\s+/g, ' ').trim();
    const persist = debounce(() => saveDescription(getDesc()), 500);
    const placeCaretEnd = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    const beginEdit = () => {
      descInput.setAttribute('contenteditable', 'true');
      descInput.focus();
      placeCaretEnd(descInput);
    };
    const endEdit = () => {
      descInput.setAttribute('contenteditable', 'false');
      saveDescription(getDesc());
      ensureSpace();
    };
    descInput.addEventListener('dblclick', beginEdit);
    descInput.addEventListener('blur', endEdit);
    // Prevent Enter from creating multi-line; commit instead
    descInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        descInput.blur();
      }
    });
    // While editing, still debounce-save on input
    descInput.addEventListener('input', () => {
      descInput.setAttribute('data-empty', getDesc().length ? '0' : '1');
      persist();
    });
  }
  // If the DOM wasn't ready when this module executed, wire up once it's loaded
  document.addEventListener('DOMContentLoaded', () => {
    const group = document.getElementById('videoRating');
    if (group && !group._wired) {
      group._wired = true;
      Array.from(group.querySelectorAll('.star')).forEach((b) => {
        b.setAttribute('role', 'radio');
        if (!b.hasAttribute('tabindex')) b.setAttribute('tabindex', '0');
      });
      group.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest('.star');
        if (!btn) return;
        const val = Number(btn.dataset.value || '0');
        if (!Number.isFinite(val) || val <= 0) return;
        const current = Number(group._currentRating || 0);
        const next = (current === val) ? 0 : val;
        group._currentRating = next;
        setStarsVisual(next);
        saveRating(next);
      });
      group.addEventListener('keydown', (e) => {
        const max = 5;
        let cur = Number(group._currentRating || 0);
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          cur = Math.min(max, cur + 1);
          setStarsVisual(cur);
          group._currentRating = cur;
          saveRating(cur);
        }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          cur = Math.max(0, cur - 1);
          setStarsVisual(cur);
          group._currentRating = cur;
          saveRating(cur);
        }
        else if (e.key === 'Home') {
          e.preventDefault();
          cur = 0;
          setStarsVisual(cur);
          group._currentRating = cur;
          saveRating(cur);
        }
        else if (e.key === 'End') {
          e.preventDefault();
          cur = max;
          setStarsVisual(cur);
          group._currentRating = cur;
          saveRating(cur);
        }
      });
    }
    const fav = document.getElementById('videoFavorite');
    if (fav && !fav._wired) {
      fav._wired = true;
      const toggleFavorite = () => {
        const cur = fav.getAttribute('aria-pressed') === 'true';
        const next = !cur;
        fav.setAttribute('aria-pressed', next ? 'true' : 'false');
        fav.classList.toggle('active', next);
        saveFavorite(next);
      };
      fav.addEventListener('click', toggleFavorite);
      fav.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFavorite();
        }
      });
    }
    const di = document.getElementById('videoDescription');
    if (di && !di._wired) {
      di._wired = true;
      if (!di.hasAttribute('contenteditable')) di.setAttribute('contenteditable', 'false');
      di.title = 'Double-click to edit';
      const ensureSpace = () => {
        const empty = !di.textContent || di.textContent.trim().length === 0;
        if (empty) {
          di.textContent = ' ';
          di.setAttribute('data-empty', '1');
        }
        else di.setAttribute('data-empty', '0');
      };
      ensureSpace();
      const getDesc = () => (di.textContent || '').replace(/\s+/g, ' ').trim();
      const persist = debounce(() => saveDescription(getDesc()), 500);
      const placeCaretEnd = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      };
      const beginEdit = () => {
        di.setAttribute('contenteditable', 'true');
        di.focus();
        placeCaretEnd(di);
      };
      const endEdit = () => {
        di.setAttribute('contenteditable', 'false');
        saveDescription(getDesc());
        ensureSpace();
      };
      di.addEventListener('dblclick', beginEdit);
      di.addEventListener('blur', endEdit);
      di.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          di.blur();
        }
      });
      di.addEventListener('input', () => {
        di.setAttribute('data-empty', getDesc().length ? '0' : '1');
        persist();
      });
    }
  });
  if (fiSetThumbnailBtn && !fiSetThumbnailBtn._wired) {
    fiSetThumbnailBtn._wired = true;
    fiSetThumbnailBtn.addEventListener('click', async () => {
      // THUMBNAIL_ASYNC: SIDEBAR BUTTON HANDLER start – generates thumbnail then polls refreshSidebarThumbnail
      if (!videoEl || !currentPath) return;
      try {
        const t = Math.max(0, videoEl.currentTime || 0);
        const u = new URL('/api/thumbnail', window.location.origin);
        u.searchParams.set('path', currentPath);
        u.searchParams.set('t', t.toFixed(3));
        u.searchParams.set('overwrite', 'true');
        const r = await fetch(u, {method: 'POST' });
        if (!r.ok) {
          throw new Error('HTTP ' + r.status);
        }
        notify('Thumbnail updated', 'success');
        // Immediate attempt then exponential backoff polling (up to 6s) until image appears.
        let got = await refreshSidebarThumbnail(currentPath);
        if (!got) {
          const deadline = Date.now() + 6000;
          let delay = 250;
          while (Date.now() < deadline && !got) {
            await new Promise((r) => setTimeout(r, delay));
            got = await refreshSidebarThumbnail(currentPath);
            delay = Math.min(delay * 1.6, 1200);
          }
        }
        // Lightly refresh library card metadata (does not force full page) if we updated image.
        if (got) {
          /* optional: mark card as freshly updated */
          const card = document.querySelector(`.card[data-path="${currentPath.replace(/"/g, '\\"')}"]`);
          if (card) card.classList.add('thumbnail-updated');
          setTimeout(() => {
            if (card) card.classList.remove('thumbnail-updated');
          }, 1200);
        }
        else {
          // fallback: schedule a library reload if we never saw it
          setTimeout(() => loadLibrary(), 250);
        }
        // THUMBNAIL_ASYNC: SIDEBAR BUTTON HANDLER end – finishing after polling / fallback
      }
      catch (e) {
        notify('Failed to set thumbnail', 'error');
      }
    });
  }
  // Download current frame utility (client‑side canvas)
  async function downloadCurrentFrame(format = 'png', scale = 1) {
    if (!videoEl) throw new Error('No video');
    const w = Math.round((videoEl.videoWidth || 0) * Math.max(0.1, scale));
    const h = Math.round((videoEl.videoHeight || 0) * Math.max(0.1, scale));
    if (!w || !h) {
      notify('Video not ready yet', 'error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    ctx.drawImage(videoEl, 0, 0, w, h);
    const ts = (() => {
      const t = Math.max(0, Number(videoEl.currentTime || 0));
      const ms = Math.round((t % 1) * 1000);
      const s = Math.floor(t) % 60;
      const m = Math.floor(t / 60) % 60;
      const H = Math.floor(t / 3600);
      const pad = (x, n = 2) => String(x).padStart(n, '0');
      return (H ? pad(H) + '-' : '') + pad(m) + '-' + pad(s) + '-' + pad(ms, 3);
    })();
    const nameBase = (() => {
      try {
        const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
        const fn = (p || '').split('/').pop() || 'frame';
        return fn.replace(/\.[^.]+$/, '');
      }
      catch (_) {
        return 'frame';
      }
    })();
    const filename = `${nameBase}-at-${ts}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    // Prefer toBlob for memory, fall back to dataURL
    const triggerDownload = (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 100);
    };
    if (canvas.toBlob) {
      return new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => {
            try {
              if (!blob) return reject(new Error('No image'));
              triggerDownload(blob);
              resolve(true);
            }
            catch (e) {
              reject(e);
            }
          }, mime, format === 'jpeg' ? 0.92 : 1.0);
        }
        catch (e) {
          reject(e);
        }
      });
    }
    else {
      const dataUrl = canvas.toDataURL(mime);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
      }, 100);
      return true;
    }
  }
  // Submit a background job via Jobs API
  async function submitJob(task, params = {}, directory = null, recursive = false, force = false) {
    try {
      const res = await fetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, params, directory, recursive, force }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    }
    catch (e) {
      return null;
    }
  }
  // Hook: whenever currentPath changes elsewhere, caller should invoke refreshSidebarThumbnail(currentPath)
  // Lightweight mutation watcher on video src to refresh automatically
  function _maybeRefreshThumb() {
    const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
    if (p) refreshSidebarThumbnail(p);
  }
  if (window.MutationObserver && videoEl && !videoEl._thumbWatch) {
    const mo = new MutationObserver(_maybeRefreshThumb);
    mo.observe(videoEl, {attributes: true, attributeFilter: ['src'] });
    videoEl._thumbWatch = mo;
  }
  // -----------------------------
  // Floating overlay title bar logic
  // -----------------------------
  function showOverlayBar() {
    if (!overlayBarEl) overlayBarEl = document.getElementById('playerOverlayBar');
    if (!overlayBarEl) return;
    overlayBarEl.classList.remove('fading');
    if (scrubberEl) scrubberEl.classList.remove('fading');
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    // Always schedule a fade check, but only apply if conditions allow
    overlayHideTimer = setTimeout(() => {
      const n = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const stillDefer = (overlayBarEl.matches(':hover') || (scrubberEl && scrubberEl.matches(':hover')) || scrubberDragging || n < overlayKbActiveUntil);
      if (stillDefer) {
        // Re-arm visibility without fading; try again shortly after the main delay window
        showOverlayBar();
        return;
      }
      if (overlayBarEl) overlayBarEl.classList.add('fading');
      if (scrubberEl) scrubberEl.classList.add('fading');
    }, OVERLAY_FADE_DELAY);
  }
  function wireOverlayInteractions() {
    if (!videoEl) return;
    const main = videoEl.parentElement;
    // Click to commit
    if (!main || main._overlayWired) return;
    main._overlayWired = true;
    ['mousemove', 'touchstart'].forEach((ev) => {
      main.addEventListener(ev, () => showOverlayBar(), {passive: true});
    });
    [overlayBarEl, scrubberEl].forEach((el) => {
      if (!el) return;
      el.addEventListener('mouseenter', () => showOverlayBar(), {passive: true});
      el.addEventListener('mousemove', () => showOverlayBar(), {passive: true});
      el.addEventListener('mouseleave', () => showOverlayBar(), {passive: true});
    });
  }
  // -----------------------------
  // Scrubber (progress + buffered) rendering
  // -----------------------------
  function fmtShortTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function updateScrubber() {
    if (!videoEl || !scrubberEl) return;
    if (scrubberProgressEl) {
      const pct = videoEl.duration ? (videoEl.currentTime / videoEl.duration) * 100 : 0;
      scrubberProgressEl.style.width = pct + '%';
      if (scrubberHandleEl) scrubberHandleEl.style.left = pct + '%';
    }
    if (scrubberBufferEl) {
      const buf = videoEl.buffered;
      if (buf && buf.length) {
        const end = buf.end(buf.length - 1);
        const pctB = videoEl.duration ? (end / videoEl.duration) * 100 : 0;
        scrubberBufferEl.style.width = pctB + '%';
      }
    }
    if (scrubberTimeEl) {
      scrubberTimeEl.textContent = `${fmtShortTime(videoEl.currentTime || 0)} / ${fmtShortTime(videoEl.duration || 0)}`;
    }
    scrubberRAF = requestAnimationFrame(updateScrubber);
  }
  function startScrubberLoop() {
    if (!scrubberEl || scrubberRAF) return;
    scrubberRAF = requestAnimationFrame(updateScrubber);
  }
  function stopScrubberLoop() {
    if (scrubberRAF) cancelAnimationFrame(scrubberRAF);
    scrubberRAF = null;
  }
  // Scrubber interactions (drag seek)
  function pctToTime(pct) {
    pct = Math.min(1, Math.max(0, pct));
    return (videoEl && Number.isFinite(videoEl.duration) ? videoEl.duration : 0) * pct;
  }
  function seekToClientX(clientX) {
    if (!videoEl || !scrubberTrackEl) return;
    const rect = scrubberTrackEl.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    const t = pctToTime(pct);
    if (Number.isFinite(t)) {
      videoEl.currentTime = t;
    }
  }
  function wireScrubberInteractions() {
    if (!scrubberTrackEl || scrubberTrackEl._wired) return;
    scrubberTrackEl._wired = true;
    const onDown = (e) => {
      if (!videoEl) return;
      e.preventDefault();
      showOverlayBar();
      scrubberDragging = true;
      scrubberWasPaused = videoEl.paused;
      if (!scrubberWasPaused) {
        videoEl.pause();
      }
      seekToClientX(e.touches ? e.touches[0].clientX : e.clientX);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, {passive: false});
      window.addEventListener('mouseup', onUp, {once: true});
      window.addEventListener('touchend', onUp, {once: true});
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!scrubberDragging) return;
      if (e.cancelable) e.preventDefault();
      seekToClientX(e.touches ? e.touches[0].clientX : e.clientX);
    };
    const onUp = async () => {
      scrubberDragging = false;
      if (videoEl && scrubberWasPaused === false) {
        // wait a short while for the browser to settle the currentTime change
        await awaitSeekEvent(videoEl, 1200);
        await safePlay(videoEl);
      }
      scrubberWasPaused = null;
      showOverlayBar();
    };
    scrubberTrackEl.addEventListener('mousedown', onDown);
    scrubberTrackEl.addEventListener('touchstart', onDown, {passive: true});
    // Hover sprite previews via existing logic
    scrubberTrackEl.addEventListener('mouseenter', () => {
      spriteHoverEnabled = true;
    });
    scrubberTrackEl.addEventListener('mouseleave', () => {
      spriteHoverEnabled = false;
      hideSprite();
    });
    scrubberTrackEl.addEventListener('mousemove', (e) => handleSpriteHover(e));
  }
  function renderMarkerTicks() {
    if (!scrubberMarkersLayer || !Array.isArray(markers) || !videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
    scrubberMarkersLayer.innerHTML = '';
    const dur = videoEl.duration;
    markers.forEach((sc) => {
      const time = Number(sc?.time ?? sc?.t ?? sc?.start ?? sc?.s);
      if (!Number.isFinite(time) || time <= 0 || time >= dur) return;
      const span = document.createElement('span');
      span.style.left = (time / dur * 100) + '%';
      scrubberMarkersLayer.appendChild(span);
    });
    let it = null;
    const key = `${LS_PREFIX}:introEnd:${currentPath}`;
    const raw = currentPath ? localStorage.getItem(key) : null;
    if (raw && Number.isFinite(Number(raw))) it = Number(raw);
    else if (typeof introEnd !== 'undefined' && introEnd && Number.isFinite(Number(introEnd))) it = Number(introEnd);
    if (it !== null && Number.isFinite(it) && it > 0 && it < dur) {
      const s = document.createElement('span');
      s.className = 'intro-scrubber-marker';
      s.style.left = (it / dur * 100) + '%';
      s.title = 'Intro end: ' + fmtTime(it);
      scrubberMarkersLayer.appendChild(s);
    }
  }
  function open(path) {
    devLog('debug', 'player', 'Player.open called', {path, suppressionUntil: playerResetSuppressAutoResumeUntil, now: Date.now()});
    initDom();
    wireOverlayInteractions();
    showOverlayBar();
    currentPath = path;
    if (typeof refreshSidebarThumbnail === 'function') refreshSidebarThumbnail(currentPath);
    if (typeof loadRatingAndDescription === 'function') loadRatingAndDescription();
    // Switch to Player tab only when user explicitly opens a video via a card click (handled upstream).
    // Avoid forcing tab switch here to respect persisted tab preference.
    if (window.tabSystem && window.tabSystem.getActiveTab() !== 'player') {
      // (Intentionally NOT auto-switching to prevent unexpected delayed jumps)
      // window.tabSystem.switchToTab('player');
    }
    // Load video source (with lightweight debugging)
    if (videoEl) {
      // Encode path segments to handle spaces/special characters
      const encPath = (typeof path === 'string' ? path.split('/') : []).map(encodeURIComponent).join('/');
      const src = new URL('/files/' + encPath, window.location.origin);
      // Cache-bust on change
      const finalUrl = src.toString() + `?t=${Date.now()}`;
      devLog('info', 'player', 'setting video src', {path: path, encPath: encPath, url: finalUrl});
      videoEl.src = finalUrl;
      devLog('debug', 'player', 'src assigned', {currentSrc: videoEl.currentSrc});
      const urlNoBust = src.toString();
      fetch(urlNoBust, {method: 'HEAD' })
        .then((r) => {
        devLog('info', 'player', 'HEAD /files status', {status: r.status, contentType: r.headers.get('content-type')});
      })
        .catch((e) => {
        devLog('error', 'player', 'HEAD /files failed', e);
      });
      // Debug media lifecycle once
      if (!videoEl._dbgWired) {
        videoEl._dbgWired = true;
        const logEvt = (evt) => {
          devLog('debug', '[player:event]', evt.type, {
            readyState: videoEl.readyState,
            networkState: videoEl.networkState,
            currentSrc: videoEl.currentSrc || videoEl.src || '',
          });
        };
        ['loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'suspend', 'abort', 'emptied', 'waiting', 'seeking', 'seeked', 'ended'].forEach((t) => {
          videoEl.addEventListener(t, logEvt);
        });
      }
      if (!videoEl._errWired) {
        videoEl._errWired = true;
        videoEl.addEventListener('error', (e) => {
          const err = (videoEl.error ? {code: videoEl.error.code, message: videoEl.error.message} : null);
          devLog('error', '[player:error] Video failed to load', {
            currentSrc: videoEl.currentSrc || videoEl.src,
            readyState: videoEl.readyState,
            networkState: videoEl.networkState,
            error: err,
          });

          // Handle missing video files gracefully
          if (videoEl.error && (videoEl.error.code === 4 || videoEl.error.code === 2)) {
            // MEDIA_ELEMENT_ERROR.MEDIA_ERR_SRC_NOT_SUPPORTED (4) or MEDIA_ERR_NETWORK (2)
            // Check if this was an auto-resumed video that no longer exists
            const currentSrc = videoEl.currentSrc || videoEl.src;
            if (currentSrc && path) {
              lsRemove(keyLastVideoObj());
              lsRemove(keyLastVideoPathLegacy());
              devLog('info', 'player', 'cleared missing video from localStorage', {path: path});

              // Show user-friendly toast
              notify(`Video file "${path}" is no longer available and has been removed from recent files.`, 'error');

              // Redirect to library grid after a brief delay
              setTimeout(() => {
                // Reset player to clear any lingering state
                resetPlayer({ full: true });

                // Switch to library tab if not already there
                const libraryTab = document.querySelector('[data-target="library"]');
                if (libraryTab) {
                  libraryTab.click();
                }

                devLog('info', 'player', 'redirected to library after missing video', {path: path});
              }, 1500);
            }
          }
        });
      }
      // Defer autoplay decision to loadedmetadata restore
      // Remember last video without wiping existing progress
      try {
        const existing = loadProgress(path);
        rememberLastVideo(path, existing?.t ?? 0);
      }
      catch (_) {
        rememberLastVideo(path, 0);
      }
      startScrubberLoop();
      videoEl.addEventListener('ended', () => stopScrubberLoop(), {once: true});
      wireScrubberInteractions();
      // When metadata arrives, we can now safely render marker ticks if markers already loaded
      videoEl.addEventListener('loadedmetadata', () => {
        renderMarkerTicks();
        (function () {
          const startAtIntro = (function () {
            try {
              const cb = document.getElementById('settingStartAtIntro');
              if (cb) return Boolean(cb.checked);
              return localStorage.getItem('setting.startAtIntro') !== '0';
            }
            catch (_) {
              return true;
            }
          })();
          if (!startAtIntro) return;
          // prefer localStorage per-path key first
          const key = `${LS_PREFIX}:introEnd:${path}`;
          const raw = getLocalStorageItem(key);
          let t = null;
          if (raw && Number.isFinite(Number(raw))) t = Number(raw);
          else if (typeof introEnd !== 'undefined' && introEnd && Number.isFinite(Number(introEnd))) t = Number(introEnd);
          if (t !== null && Number.isFinite(t) && t > 0 && videoEl.duration && t < videoEl.duration) {
            let done = false;
            const onSeek = () => {
              if (done) return;
              done = true;
              videoEl.removeEventListener('seeked', onSeek);
              updateScrubber();
            };
            try {
              videoEl.addEventListener('seeked', onSeek);
              videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, t));
            }
            catch (_) {
              updateScrubber();
            }
            // ensure scrubber updates even if seeked not fired
            setTimeout(() => {
              updateScrubber();
            }, 250);
          }
        })();
      }, {once: true});
    }
    const titleTarget = document.getElementById('playerTitle');
    if (titleTarget) {
      const rawName = path.split('/').pop() || path;
      const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
      titleTarget.textContent = baseName;
      if (overlayBarEl && baseName) delete overlayBarEl.dataset.empty;
      if (typeof showOverlayBar === 'function') showOverlayBar();
    }
    // Metadata and title
    (async () => {
      try {
        const url = new URL('/api/metadata', window.location.origin);
        url.searchParams.set('path', path);
        const r = await fetch(url);
        const j = await r.json();
        const d = j?.data || {};
        const rawName = path.split('/').pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
        if (titleEl) titleEl.textContent = baseName;
        if (overlayBarEl && baseName) {
          delete overlayBarEl.dataset.empty;
        }
        if (fiDurationEl) fiDurationEl.textContent = fmtTime(Number(d.duration) || 0) || '—';
        if (fiResolutionEl) fiResolutionEl.textContent = d.width && d.height ? `${d.width}x${d.height}` : '—';
        if (fiVideoCodecEl) fiVideoCodecEl.textContent = d.vcodec || '—';
        if (fiAudioCodecEl) fiAudioCodecEl.textContent = d.acodec || '—';
        if (fiBitrateEl) fiBitrateEl.textContent = d.bitrate ? Number(d.bitrate) >= 1000 ? Number(d.bitrate / 1000).toFixed(0) + ' kbps' : d.bitrate + ' bps' : '—';
        if (fiVBitrateEl) fiVBitrateEl.textContent = d.vbitrate ? Number(d.vbitrate) >= 1000 ? Number(d.vbitrate / 1000).toFixed(0) + ' kbps' : d.vbitrate + ' bps' : '—';
        if (fiABitrateEl) fiABitrateEl.textContent = d.abitrate ? Number(d.abitrate) >= 1000 ? Number(d.abitrate / 1000).toFixed(0) + ' kbps' : d.abitrate + ' bps' : '—';
        if (fiSizeEl) fiSizeEl.textContent = d.size ? fmtSize(Number(d.size)) : '—';
        if (fiModifiedEl) {
          if (d.modified) {
            try {
              fiModifiedEl.textContent = new Date(Number(d.modified) * 1000).toLocaleString();
            }
            catch (_) {
              fiModifiedEl.textContent = '—';
            }
          }
          else fiModifiedEl.textContent = '—';
        }
        if (fiPathEl) fiPathEl.textContent = path || '—';
      }
      catch (_) {
        const rawName = path.split('/').pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
        if (titleEl) titleEl.textContent = baseName;
        if (overlayBarEl && baseName) delete overlayBarEl.dataset.empty;
        if (fiDurationEl) fiDurationEl.textContent = '—';
        if (fiResolutionEl) fiResolutionEl.textContent = '—';
        if (fiVideoCodecEl) fiVideoCodecEl.textContent = '—';
        if (fiAudioCodecEl) fiAudioCodecEl.textContent = '—';
        if (fiBitrateEl) fiBitrateEl.textContent = '—';
        if (fiVBitrateEl) fiVBitrateEl.textContent = '—';
        if (fiABitrateEl) fiABitrateEl.textContent = '—';
        if (fiSizeEl) fiSizeEl.textContent = '—';
        if (fiModifiedEl) fiModifiedEl.textContent = '—';
        if (fiPathEl) fiPathEl.textContent = path || '—';
      }
    })();
    // Artifacts: load consolidated status first, then conditional loaders
    (async () => {
      await loadArtifactStatuses();
      if (typeof showHeatmap !== 'undefined' && showHeatmap) loadHeatmap();
      if (typeof showMarkers !== 'undefined' && showMarkers) loadMarkers();
      loadVideoChips();
    })();
    wireBadgeActions();
  }
  window.__playerOpen = open;
  // -----------------------------
  // Video performers & tags chips
  // -----------------------------
  async function loadVideoChips() {
    if (!currentPath) return;
    const perfListEl = document.getElementById('videoPerformers');
    const tagListEl = document.getElementById('videoTags');
    const perfSugEl = document.getElementById('videoPerformerSuggestions');
    const tagSugEl = document.getElementById('videoTagSuggestions');
    if (!perfListEl || !tagListEl) return;
    perfListEl.innerHTML = '';
    tagListEl.innerHTML = '';
    if (perfSugEl) perfSugEl.innerHTML = '';
    if (tagSugEl) tagSugEl.innerHTML = '';
    // Fetch metadata that might contain tags/performers (extendable). If not present, fallback to dedicated endpoints if exist.
    let performers = [];
    let tags = [];
    const u = new URL('/api/media/info', window.location.origin);
    // backend media info endpoint (prefixed)
    u.searchParams.set('path', currentPath);
    const r = await fetch(u.toString());
    if (r.ok) {
      const j = await r.json();
      const d = j?.data || j;
      if (Array.isArray(d?.performers)) performers = d.performers.filter((x) => Boolean(x)).slice(0, 200);
      if (Array.isArray(d?.tags)) tags = d.tags.filter((x) => Boolean(x)).slice(0, 400);
    }
    renderChipSet(perfListEl, performers, 'performer');
    renderChipSet(tagListEl, tags, 'tag');
    const perfLabel = document.querySelector('#videoPerformersGroup .chips-label');
    const tagLabel = document.querySelector('#videoTagsGroup .chips-label');
    if (perfLabel) perfLabel.textContent = `Performers (${performers.length})`;
    if (tagLabel) tagLabel.textContent = `Tags (${tags.length})`;
    wireChipInputs();

    const base = (currentPath.split('/').pop() || currentPath).replace(/\.[^.]+$/, '');
    const baseLower = base.toLowerCase();
    await loadRegistries(['performers', 'tags']);
    const perfNames = (window.__REG.performers || []).map((p) => p?.name).filter(Boolean);
    const tagNames = (window.__REG.tags || []).map((t) => t?.name).filter(Boolean);
    const havePerf = new Set((performers || []).map((x) => String(x).toLowerCase()));
    const haveTag = new Set((tags || []).map((x) => String(x).toLowerCase()));
    // match helper: check word-ish match by collapsing non-alnum to spaces
    const norm = (s) => String(s || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const baseNorm = ' ' + norm(baseLower) + ' ';
    const containsWord = (needle) => {
      const n = ' ' + norm(needle) + ' ';
      // require each token of needle to appear in base in order
      return n.trim().split(/\s+/)
        .every((tok) => baseNorm.includes(' ' + tok + ' '));
    };
    const perfSuggestions = [];
    for (const nm of perfNames) {
      if (!nm) continue;
      const low = String(nm).toLowerCase();
      if (havePerf.has(low)) continue;
      if (containsWord(low)) perfSuggestions.push(nm);
      if (perfSuggestions.length >= 8) break;
    }
    const tagSuggestions = [];
    for (const nm of tagNames) {
      if (!nm) continue;
      const low = String(nm).toLowerCase();
      if (haveTag.has(low)) continue;
      if (containsWord(low)) tagSuggestions.push(nm);
      if (tagSuggestions.length >= 8) break;
    }
    const renderSuggestions = (el, arr, kind) => {
      if (!el) return;
      if (!arr || !arr.length) {
        el.innerHTML = '';
        return;
      }
      const frag = document.createDocumentFragment();
      const label = document.createElement('div');
      label.className = 'hint-sm hint-sm--muted mb-4';
      label.textContent = 'Suggestions:';
      frag.appendChild(label);
      arr.forEach((name) => {
        const chip = createSuggestChip(name, { title: 'Click to add' });
        chip.addEventListener('click', () => addChip(kind, name));
        frag.appendChild(chip);
      });
      el.innerHTML = '';
      el.appendChild(frag);
    };
    renderSuggestions(perfSugEl, perfSuggestions, 'performer');
    renderSuggestions(tagSugEl, tagSuggestions, 'tag');
  }
  function renderChipSet(container, items, kind) {
    if (!container) return;
    container.innerHTML = '';
    (items || []).forEach((item) => {
      if (!item || typeof item !== 'string') return;
      const { chip, removeBtn, labelEl } = createChipElement({
        label: item,
        removable: true,
        removeLabel: 'Remove',
        title: 'View in Library',
      });
      chip.dataset.nameLower = String(item).toLowerCase();
      const labelTarget = labelEl || chip;
      labelTarget.title = 'View in Library';
      labelTarget.addEventListener('click', (ev) => {
        ev.preventDefault();
        const tab = document.querySelector('[data-tab="library"]');
        if (tab) tab.click();
        if (kind === 'tag') {
          libraryTagFilters = [ _slugify(item) ];
        }
        else {
          libraryPerformerFilters = [ item ];
        }
        setLocalStorageJSON('filters.tags', libraryTagFilters);
        setLocalStorageJSON('filters.performers', libraryPerformerFilters);
        if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
        if (typeof loadLibrary === 'function') loadLibrary();
        if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
      });
      if (removeBtn) {
        removeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          removeChip(kind, item);
        });
      }
      container.appendChild(chip);
    });
  }
  function wireChipInputs() {
    const perfInput = document.getElementById('videoPerformerInput');
    const tagInput = document.getElementById('videoTagInput');
    const ensureChipRegistries = () => loadRegistries(['performers', 'tags']);
    // Render typeahead suggestions for a given input
    async function updateTypeahead(kind, q) {
      const el = document.getElementById(kind === 'performer' ? 'videoPerformerSuggestions' : 'videoTagSuggestions');
      if (!el) return;
      const query = String(q || '').trim();
      if (!query) {
        // Clear autocomplete suggestions when input is empty; file-name based suggestions (if any) will be rendered by loadVideoChips
        el.innerHTML = '';
        return;
      }
      await ensureChipRegistries();
      const regNames = (kind === 'performer' ? (window.__REG.performers || []) : (window.__REG.tags || []))
        .map((x) => x?.name)
        .filter(Boolean);
      // Exclude already assigned chips
      const assigned = new Set(Array.from(document.querySelectorAll(`#${kind === 'performer' ? 'videoPerformers' : 'videoTags'} .chip`)).map((n) => (n.dataset.nameLower || n.querySelector('.chip-label')?.textContent || '').toLowerCase()));
      const ql = query.toLowerCase();
      // Rank prefix matches first, then substring
      const matches = [];
      for (const name of regNames) {
        const low = String(name).toLowerCase();
        if (assigned.has(low)) continue;
        const idx = low.indexOf(ql);
        if (idx === -1) continue;
        matches.push({name, rank: idx === 0 ? 0 : 1, pos: idx});
      }
      matches.sort((a, b) => a.rank - b.rank || a.pos - b.pos || a.name.localeCompare(b.name));
      const top = matches.slice(0, 10).map((m) => m.name);
      const frag = document.createDocumentFragment();
      const label = document.createElement('div');
      label.className = 'hint-sm hint-sm--muted mb-4';
      label.textContent = 'Matches:';
      frag.appendChild(label);
      top.forEach((name) => {
        const chip = createSuggestChip(name, { title: 'Click to add' });
        chip.addEventListener('click', () => {
          addChip(kind, name);
          const input = document.getElementById(kind === 'performer' ? 'videoPerformerInput' : 'videoTagInput');
          if (input) input.value = '';
          el.innerHTML = '';
        });
        frag.appendChild(chip);
      });
      el.innerHTML = '';
      el.appendChild(frag);
    }
    if (perfInput && !perfInput._wired) {
      perfInput._wired = true;
      perfInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = (perfInput.value || '').trim();
          if (val) {
            addChip('performer', val);
            perfInput.value = '';
          }
        }
      });
      perfInput.addEventListener('input', () => updateTypeahead('performer', perfInput.value));
    }
    if (tagInput && !tagInput._wired) {
      tagInput._wired = true;
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = (tagInput.value || '').trim();
          if (val) {
            addChip('tag', val);
            tagInput.value = '';
          }
        }
      });
      tagInput.addEventListener('input', () => updateTypeahead('tag', tagInput.value));
    }
  }
  async function addChip(kind, value) {
    if (!currentPath || !value) return;
    try {
      const ep = kind === 'performer' ? '/api/media/performers/add' : '/api/media/tags/add';
      const url = new URL(ep, window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set(kind, value);
      const r = await fetch(url.toString(), {method: 'POST' });
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      loadVideoChips();
    }
    catch (_) {
      notify('Failed to add ' + kind, 'error');
    }
  }
  async function removeChip(kind, value) {
    if (!currentPath || !value) return;
    try {
      const ep = kind === 'performer' ? '/api/media/performers/remove' : '/api/media/tags/remove';
      const url = new URL(ep, window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set(kind, value);
      const r = await fetch(url.toString(), {method: 'POST' });
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      loadVideoChips();
    }
    catch (_) {
      notify('Failed to remove ' + kind, 'error');
    }
  }
  async function loadHeatmap() {
    if (!currentPath) return;
    try {
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.heatmap === false) {
        if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = '✗';
        if (badgeHeatmap) badgeHeatmap.dataset.present = '0';
        applyTimelineDisplayToggles();
        return;
      }
      // Prefer JSON + canvas rendering for higher fidelity
      let renderedViaJson = false;
      const ju = new URL('/api/heatmap', window.location.origin);
      ju.searchParams.set('path', currentPath);
      const jr = await fetch(ju.toString(), {
        headers: {Accept: 'application/json' },
      });
      if (jr.ok) {
        const jj = await jr.json();
        const hm = jj?.data?.heatmap || jj?.heatmap || jj;
        const samples = Array.isArray(hm?.samples) ? hm.samples : [];
        if (samples.length && heatmapCanvasEl) {
          drawHeatmapCanvas(samples);
          // Clear any PNG bg under it
          heatmapEl.style.backgroundImage = '';
          hasHeatmap = true;
          renderedViaJson = true;
        }
      }
      if (!renderedViaJson) {
        const url = '/api/heatmap?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
        // Try to load an image to detect availability
        const ok = await new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = url;
        });
        if (ok) {
          heatmapEl.style.backgroundImage = `url('${url}')`;
          if (heatmapCanvasEl) clearHeatmapCanvas();
          hasHeatmap = true;
          const img = document.getElementById('sidebarHeatmapImage');
          const box = document.getElementById('sidebarHeatmapPreview');
          if (img && box) {
            img.src = url;
            box.classList.remove('hidden');
          }
        }
        else {
          heatmapEl.style.backgroundImage = '';
          if (heatmapCanvasEl) clearHeatmapCanvas();
          hasHeatmap = false;
          const box = document.getElementById('sidebarHeatmapPreview');
          if (box) box.classList.add('hidden');
        }
      }
      // Badge update
      if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = hasHeatmap ? '✓' : '✗';
      if (badgeHeatmap) badgeHeatmap.dataset.present = hasHeatmap ? '1' : '0';
      // Respect display toggle immediately
      applyTimelineDisplayToggles();
    }
    catch (_) {
      heatmapEl.style.backgroundImage = '';
      if (heatmapCanvasEl) clearHeatmapCanvas();
      hasHeatmap = false;
      if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = '✗';
      if (badgeHeatmap) badgeHeatmap.dataset.present = '0';
      const box = document.getElementById('sidebarHeatmapPreview');
      if (box) box.classList.add('hidden');
      applyTimelineDisplayToggles();
    }
  }
  // (No legacy singular alias retained)
  function heatColor(v) {
    // Map 0..1 to a pleasing gradient
    // 0 -> #0b1020 transparentish, 0.5 -> #4f8cff, 1 -> #ff7a59
    const clamp = (x) => Math.max(0, Math.min(1, x));
    v = clamp(v);
    // Blend between three stops
    if (v < 0.5) {
      const t = v / 0.5;
      // 0..1
      return lerpColor([11, 16, 32, 0.5], [79, 140, 255, 0.85], t);
    }
    else {
      const t = (v - 0.5) / 0.5;
      return lerpColor([79, 140, 255, 0.85], [255, 122, 89, 0.95], t)/* =============================================================
  Media Player Stylesheet (refactored ordering)
  -------------------------------------------------------------
  Table of Contents
  1. Root Variables
  2. Base / Resets
  3. Utilities
  4. Layout Primitives (grid, cards, generic components)
  5. Buttons & Controls
  6. Performers Panel
  7. Modals / Overlays
  8. Tabs & Sections (Tasks, Artifacts, Jobs)
  9. Selection & Badges
  10. Artifact Cards & Options Tooltip
  11. Job Monitor (stats, tables)
  12. Orphaned Artifacts
  13. Accordion
  14. Player (Simplified + Full Tab)
  15. Viewport Fit Player Adjustments
  16. Toast / Notifications
  17. Animations & Keyframes
  -------------------------------------------------------------
  Notes:
  * Nested selectors previously inside #folderInput were flattened.
  * Duplicate .btn-sm size variant inside controls panel is now scoped.
  * Duplicate @keyframes spin removed (single canonical definition).
  * Second slideIn variant renamed slideInRight for clarity.
  ============================================================= */

:root {
  --font-stack: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --bg: #0f1115;
  --panel: #151b25;
  --panel-bg: #1a2133;
  --card: #161c2c;
  --card-bg: #141b28;
  --card-hover: #1d2436;
  --text: #f7f9ff;
  --text-muted: rgba(247, 249, 255, 0.65);
  --text-alt: #c9d7ff;
  --muted: rgba(255, 255, 255, 0.55);
  --fg-500: #b5bccb;
  --fg-600: #94a3b8;
  --border-color: rgba(255, 255, 255, 0.12);
  --border-subtle: rgba(255, 255, 255, 0.06);
  --accent: #4f8cff;
  --success: #34d399;
  --danger: #f87171;
  --warn: #facc15;
  --header-h: 54px;
  --sticky-header-height: var(--header-h);
  --player-sidebar-w: 300px;
  --columns: 4;
  --grid-gap: 12px;
  --grid-side-padding: 64px;
  --grid-wide-padding: 64px;
  --radius-sm: 4px;
  --radius: 8px;
  --radius-lg: 14px;
  --transition: .2s cubic-bezier(.4, .2, .2, 1);
  --focus-ring: 0 0 0 2px rgba(79, 140, 255, .5);
  --vol-pct: 100%;
}

/* 2. Base / Resets */
* {
  box-sizing: border-box;
}

html, body {
  height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-stack);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Hide native scrollbars (while preserving scroll functionality) */
html,
body,
.tab-panels,
.tab-panel {
  scrollbar-width: none;
  /* Firefox */
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
.tab-panels::-webkit-scrollbar,
.tab-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* Globally hide WebKit scrollbars (extra safeguard) */
::-webkit-scrollbar {
  display: none !important;
  width: 0;
  height: 0;
}


body > header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000; /* raise above panels/modals so top bar is always visible */
  background: rgba(15, 17, 21, 0.75);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #242938;
  height: var(--header-h);
}

main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Offset for fixed header so content isn’t hidden behind it */
  padding-top: var(--header-h);
}

/* 3. Utilities */
.d-none,
.hidden {
  display: none !important;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.marker-label-strong {
  font-weight: 700;
}

.flex-1 {
  flex: 1 1 auto;
}

.compact-filter {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  flex: 0 1 200px;
  min-width: 140px;
  max-width: 240px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.compact-filter__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.compact-filter__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.segmented-control {
  display: inline-flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2px;
}

.compact-filter .segmented-control {
  width: 100%;
  justify-content: flex-start;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.segmented-control__btn,
.segmented-control button {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.2;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
}

.segmented-control button:hover,
.segmented-control__btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.1);
}

.segmented-control button.is-active,
.segmented-control__btn.is-active {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 6px 18px rgba(79, 140, 255, 0.35);
}

.segmented-control button:focus-visible,
.segmented-control__btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.segmented-control.is-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.compact-filter__order {
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  flex: 0 0 auto;
}

.compact-filter__order:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}

.compact-filter__order:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (max-width: 768px) {
  .compact-filter {
    flex: 1 1 160px;
    min-width: 0;
    width: 100%;
  }
}

/* Generic chips container used in list and sidebar */
.chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.chip .chip-label {
  white-space: nowrap;
}
.chip .chip-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}
.chip .chip-remove:hover,
.chip .chip-remove:focus-visible {
  color: #fff;
}
button.chip {
  font: inherit;
  cursor: pointer;
}
.chip-suggest {
  background: rgba(79, 140, 255, 0.18);
  border-color: rgba(79, 140, 255, 0.45);
}
.chip-suggest:hover {
  background: rgba(79, 140, 255, 0.30);
}
.chip-suggest::before,
.chip--pending::before {
  content: '?';
  font-weight: 600;
  opacity: .7;
  margin-right: 4px;
}

.ml-auto {
  margin-left: auto !important;
}

.fw-600 {
  font-weight: 600;
}

.hint-sm {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.mt-12 {
  margin-top: 12px;
}

.gap-10 {
  gap: 10px;
}

.gap-16 {
  gap: 16px;
}

.flex-row {
  display: flex;
  align-items: center;
}

.w-120 {
  width: 120px;
}

.w-100 {
  width: 100%;
}

/* Core inputs */
#folderInput {
  background: var(--panel);
  color: var(--text);
  border: 2px solid #2a3144;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  outline: none;
  width: 100%;
  transition: all 0.2s ease;
}

#folderInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.2);
  transform: translateY(-1px);
}

#folderInput::placeholder {
  color: var(--muted);
}

/* 4. Layout Primitives */
.grid {
  display: grid;
  grid-template-columns: repeat(var(--columns, 4), 1fr);
  /* dynamic columns */
}

.card {
  background: var(--card);
  border: 1px solid #2a3144;
  border-radius: 10px;
  overflow: hidden;
  transition: background .15s ease, transform .06s ease;
  position: relative;
}

.card:hover {
  background: var(--card-hover);
  transform: translateY(-1px);
}

/* Visual state while an on-demand preview is being generated */
.card.preview-generating {
  outline: 2px dashed rgba(79, 140, 255, 0.25);
}

/* Merge modal choice list */
.merge-choice-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.merge-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  font-size: 14px;
  line-height: 1.3;
}

.merge-choice input[type="radio"] {
  margin: 0;
}

.merge-choice span {
  flex: 1;
}

.merge-choice:focus-within,
.merge-choice input[type="radio"]:checked + span,
.merge-choice[data-checked="1"] {
  border-color: rgba(79, 140, 255, 0.45);
  background: rgba(79, 140, 255, 0.16);
}

/* 5. Buttons & Controls (core) */
.btn {
  background: var(--panel);
  color: var(--text);
  border: 2px solid #2a3144;
  border-radius: 12px;
  padding: 6px 12px;
  /* MENU_COMPACT: reduced */
  font-size: 14px;
  /* slightly smaller */
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn:hover {
  background: #1a2030;
  border-color: var(--accent);
  transform: translateY(-1px);
}

/* Base small button */
.btn-sm {
  background: var(--panel);
  color: var(--text);
  border: 1px solid #2a3144;
  border-radius: 12px;
  padding: 4px 8px;
  /* MENU_COMPACT */
  font-size: 11px;
  /* MENU_COMPACT */
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
}

.btn-sm:hover {
  background: #1e2634;
  border-color: #364258;
}

.btn-sm:active {
  background: #16202d;
}

.btn-sm.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Scoped larger variant previously overriding global .btn-sm */
.controls-panel .btn-sm {
  background: var(--bg);
  color: var(--text);
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 5px 10px;
  /* MENU_COMPACT */
  font-size: 12px;
  /* MENU_COMPACT */
  font-weight: 500;
  height: 30px;
  /* MENU_COMPACT */
  display: flex;
  align-items: center;
  justify-content: center;
}

.controls-panel .btn-sm:hover {
  background: var(--card);
  border-color: var(--accent);
  box-shadow: 0 2px 4px rgba(79, 140, 255, 0.2);
}

.controls-panel .btn-sm.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Busy state */
.btn-busy,
.btn.btn-busy,
.btn-sm.btn-busy {
  position: relative;
  pointer-events: none;
  opacity: .9;
}

.btn-busy::before {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  vertical-align: -2px;
}

/* Destructive */
.btn-danger,
.btn.btn-danger,
button.btn-danger {
  background: linear-gradient(135deg, #b91c1c, #dc2626);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 4px -2px rgba(0, 0, 0, 0.5);
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626, #ef4444);
}

.btn-danger:active {
  background: #991b1b;
}

.btn-danger:disabled {
  opacity: .55;
  cursor: not-allowed;
}

/* 6. Performers Panel (moved & consolidated) */
#performers-panel {
  overflow-x: hidden;
  /* Give the performers screen breathing room so it doesn't hug the edges */
  padding: 16px 20px;
}

#performers-panel .perf-grid {
  overflow-x: hidden;
  width: 100%;
  max-width: 100%;
}

/* Tags panel spacing mirrors performers for visual parity */
#tags-panel {
  overflow-x: hidden;
  padding: 16px 20px;
}

#tags-panel .perf-grid {
  overflow-x: hidden;
  width: 100%;
  max-width: 100%;
}

/* Inner container to provide consistent spacing between sections */
.catalog-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding-left: 12px;
  padding-right: 12px;
}

/* Mobile: eliminate horizontal scrolling and constrain paddings */
@media (max-width: 768px) {
  :root {
    --grid-side-padding: 12px;
    --grid-wide-padding: 12px;
  }
  body, html, .tab-panels, .tab-panel {
    overflow-x: hidden !important;
  }
  .grid {
    /* Auto-fit columns to available width with a safe minimum card size */
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    max-width: 100vw;
  }
  .player-main, .controls-panel, .perf-toolbar, .performers-grid, .perf-grid, .list-wrap {
    max-width: 100%;
    overflow-x: hidden;
  }
}

.marker-time-label {
  font-variant-numeric: tabular-nums;
}

.marker-time-label--editable {
  cursor: pointer;
  user-select: none;
}

.marker-time-label--editable:hover {
  text-decoration: underline;
}

.marker-name-label {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.marker-name-label--editable {
  cursor: pointer;
  user-select: none;
}

.marker-name-label--editable:hover {
  text-decoration: underline;
}

.marker-name-input {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  font-size: 12px;
}

.perf-grid {
  box-sizing: border-box;
  --card-bg: #141b28;
}

.perf-grid.loading {
  opacity: .55;
  pointer-events: none;
}

.perf-card {
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 12px 10px;
  background: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 2px 6px -2px rgba(0, 0, 0, 0.5);
  min-height: 96px;
  max-width: 100%;
}

.perf-card[data-selected="1"] {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Tile selection checkbox (performers/tags) */
.perf-card .pc-sel {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  cursor: pointer;
  accent-color: var(--accent, #60a5fa);
  z-index: 2;
}

/* Increase hit area slightly on touch */
@media (pointer: coarse) {
  .perf-card .pc-sel { top: 10px; left: 10px; width: 22px; height: 22px; }
}

.perf-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  word-break: break-word;
  overflow-wrap: break-word;
}

.perf-card .count {
  font-size: 11px;
  opacity: .65;
}

.perf-card .actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
}

.perf-card button.btn-xs {
  font-size: 11px;
  padding: 3px 6px;
  line-height: 1.1;
}

.perf-card .tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.perf-card .tag {
  font-size: 10px;
  padding: 2px 5px;
  background: #1f2b3b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

@media (max-width: 640px) {
  .perf-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  .perf-card {
    padding: 10px 10px 8px;
  }
}

/* Preserve existing (rest of file below remains in original relative order, minus removed nested block & duplicates) */
#performers-panel .perf-card h3 {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  word-break: break-word;
  overflow-wrap: break-word;
}

/* Ensure tag cards wrap titles the same as performers */
#tags-panel .perf-card h3 {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  word-break: break-word;
  overflow-wrap: break-word;
}

/* ORIGINAL CONTENT CONTINUES (unreordered beyond critical fixes) */

#playerControls.player-controls {
  display: flex;
  width: 100%;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 16px;
  gap: 18px;
  border-radius: 18px;
  background: radial-gradient(circle at top left, rgba(34, 52, 78, 0.85), rgba(13, 20, 33, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 30px -18px rgba(3, 7, 18, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  backdrop-filter: blur(6px) saturate(140%);
  flex-wrap: nowrap;
  overflow-x: auto;
}

#playerControls .scrubber-time {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  white-space: nowrap;
  flex: 0 0 auto;
  align-self: center;
}

#playerControls .player-controls-groups {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

#playerControls .player-control-cluster {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(12, 18, 30, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 18px -14px rgba(0, 0, 0, 0.9);
  flex: 1 1 0;
  min-width: 0;
}

#playerControls .player-control-cluster.cluster-transport {
  flex: 1.6 1 320px;
  min-width: 240px;
}

#playerControls .player-control-cluster.cluster-audio {
  flex: 0 0 auto;
  min-width: 0;
  padding-right: 18px;
}

#playerControls .player-control-cluster.cluster-navigate {
  flex: 0 0 auto;
}

#playerControls .player-volume {
  flex: 0 0 auto;
  min-width: 0;
}

#playerControls .player-volume .vol-slider {
  width: clamp(110px, 18vw, 150px);
  min-width: 110px;
}

#playerControls .btn.btn-xs {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(32, 48, 72, 0.9), rgba(12, 18, 28, 0.95));
  box-shadow: 0 8px 18px -10px rgba(0, 0, 0, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  color: #e7ecfb;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .1px;
}

#playerControls .btn.btn-xs:hover {
  border-color: rgba(79, 140, 255, 0.6);
  background: linear-gradient(180deg, rgba(52, 86, 132, 0.95), rgba(24, 38, 58, 0.95));
  color: #fff;
  box-shadow: 0 10px 24px -10px rgba(19, 31, 61, 0.9), inset 0 0 0 1px rgba(79, 140, 255, 0.35);
}

#playerControls .btn.btn-xs:focus-visible {
  outline: 2px solid rgba(79, 140, 255, 0.65);
  outline-offset: 2px;
}

#playerControls .btn.btn-xs svg {
  width: 20px;
  height: 20px;
  display: block;
}

@media (max-width: 1024px) {
  #playerControls.player-controls {
    padding: 8px 12px;
    gap: 12px;
  }

  #playerControls .player-controls-groups {
    gap: 10px;
  }

  #playerControls .btn.btn-xs {
    min-width: 34px;
    padding: 0 10px;
  }
}

@media (max-width: 640px) {
  #playerControls.player-controls {
    padding: 8px;
    border-radius: 14px;
    gap: 10px;
  }

  #playerControls .player-controls-groups {
    gap: 8px;
  }

  #playerControls .player-control-cluster {
    padding: 6px 8px;
  }

  #playerControls .player-volume .vol-slider {
    width: clamp(100px, 40vw, 140px);
  }
}



.orphan-details {
  font-size: 13px;
  line-height: 1.5;
}

.task-section-spaced {
  margin-top: 12px;
}

.file-selection-root {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.root-input-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.root-input {
  flex: 1;
}

.file-selection-compact {
  padding: 12px 0;
}

/* ===== List Tab (compact table view) ===== */
.list-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-wrap {
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.list-table {
  /* Allow table to grow beyond the container when columns are widened, while still
     filling at least the container width. This enables horizontal scroll in .list-wrap. */
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* honor explicit column widths and improve perf */
}

.list-table thead th {
  position: relative;
  text-align: left;
  padding: 8px 10px;
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  white-space: nowrap; /* never wrap header labels/arrows/handles */
}

/* Right-align numeric-ish columns (headers and cells) */
.list-table thead th.col-duration,
.list-table thead th.col-size,
.list-table thead th.col-width,
.list-table thead th.col-height,
.list-table tbody td.col-duration,
.list-table tbody td.col-size,
.list-table tbody td.col-width,
.list-table tbody td.col-height {
  text-align: right;
}
.list-table thead th.col-duration .list-head-cell,
.list-table thead th.col-size .list-head-cell,
.list-table thead th.col-width .list-head-cell,
.list-table thead th.col-height .list-head-cell {
  justify-content: flex-end;
}

.list-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
}
/* Vertical column borders similar to row borders */
.list-table thead th:not(:last-child),
.list-table tbody td:not(:last-child) {
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
/* Monospace, zero-aligned dates for visual alignment */
.list-table thead th.col-mtime,
.list-table tbody td.col-mtime,
.list-table thead th.col-created,
.list-table tbody td.col-created {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-variant-numeric: tabular-nums;
}

.list-table tr:hover td {
  background: rgba(255, 255, 255, 0.03);
}

.list-table tr[data-selected="1"] td {
  background: rgba(46, 140, 255, 0.12);
}

.list-head-cell {
  display: flex;
  align-items: center;
  /* gap: 8px; */
  /* allow inner title to shrink properly for ellipsis */
  min-width: 0;
}
.list-head-title {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-head-action {
  margin-left: 8px;
  white-space: nowrap;
}

/* Selection column checkboxes */
#listTable td.col-select, #listTable th.col-select {
  text-align: center;
  width: 34px;
  min-width: 34px;
  max-width: 34px;
  padding: 4px 6px;
}
.list-row-checkbox, #listSelectAll {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Pager containers */
.list-pager { display: flex; align-items: center; gap: 8px; }
.list-controls .list-pager { margin-left: 0; }
.list-pager-bottom { display: flex; justify-content: flex-end; margin-top: 8px; }

/* Remove drag/resize affordances from the select (checkbox) header column */
#listTable thead th.col-select .col-drag-handle,
#listTable thead th.col-select .col-resizer { display: none !important; pointer-events: none !important; }
#listTable thead th.col-select { cursor: default; }
#listTable thead th.col-select .list-head-cell { justify-content: center; }

/* Columns panel dynamic positioning override */

/* Header drag handle (optional; used when enabling direct header dragging) */
th .col-drag-handle {
  display: inline-block;
  margin-right: 6px;
  color: var(--muted);
  cursor: grab;
  user-select: none;
}

th .col-drag-handle:active {
  cursor: grabbing;
}

.col-resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2; /* ensure above header contents in nowrap mode */
}

.col-resizer::after {
  content: "";
  position: absolute;
  right: 2px;
  top: 18%;
  bottom: 18%;
  width: 2px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  opacity: 0.6;
}

/* Filter chips (List tab) */
.filter-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.filter-chip { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); padding: 2px 8px; border-radius: 14px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; }
.filter-chip button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12px; padding: 0 2px; }
.filter-chip button:hover { color: #fff; }
.filter-chip--indicator { background: rgba(79,140,255,0.18); border-color: rgba(79,140,255,0.45); }
/* Artifact filter chips (Library grid) */
.artifact-filter-chips { display:inline-flex; gap:6px; flex-wrap:wrap; margin-left:6px; }
.artifact-filter-chips .chip { font-size:11px; padding:2px 6px; border-radius:12px; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); display:inline-flex; align-items:center; gap:4px; }
.artifact-filter-chips .chip-remove { color:inherit; }
.artifact-filter-chips .chip-remove:hover { color:#fff; }
.artifact-filter-chips .chip--clear { background: rgba(79,140,255,0.18); border-color: rgba(79,140,255,0.45); }
.artifact-filter-menu { position:absolute; z-index:1200; background: var(--panel-bg,#111827); color: inherit; border:1px solid rgba(255,255,255,0.14); border-radius:8px; padding:12px; box-shadow:0 12px 24px rgba(0,0,0,0.45); min-width:240px; }
.artifact-filter-menu[hidden] { display:none; }
.artifact-filter-menu__body { display:flex; flex-direction:column; gap:6px; }
.artifact-filter-row { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; }
.artifact-filter-row .control-select { flex:0 0 120px; }
.artifact-filter-menu__footer { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }

/* Similar tab rows */
.similar-row { display:flex; flex-direction:column; gap:12px; }
#similarResults .similar-row { margin-bottom:12px; }
.similar-row__header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.similar-row__header .row { flex-wrap:wrap; }
.similar-files { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; }
.similar-file { border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px; background:rgba(15,23,42,0.35); display:flex; flex-direction:column; gap:8px; cursor:pointer; transition:border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease; }
.similar-file__primary { display:flex; align-items:center; gap:12px; }
.similar-thumb-btn { flex:0 0 auto; width:132px; min-width:96px; max-width:40%; aspect-ratio:16/9; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(15,23,42,0.6); padding:0; overflow:hidden; cursor:pointer; transition:border-color 0.2s ease, transform 0.2s ease; }
.similar-thumb-btn:disabled { cursor:not-allowed; opacity:0.4; }
.similar-thumb-btn:not(:disabled):hover { border-color:rgba(248,250,252,0.7); transform:translateY(-1px); }
.similar-thumb { width:100%; height:100%; object-fit:cover; display:block; }
.similar-file__label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin-bottom:4px; }
.similar-file__path { font-size:12px; color:var(--muted); word-break:break-all; font-family:var(--mono-font, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace); flex:1; min-width:0; }
.similar-file__stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px 16px; margin:8px 0 0; }
.similar-file__stat { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); background:rgba(15,23,42,0.55); transition:background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease; }
.similar-file__stat dt { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; margin:0; }
.similar-file__stat dd { margin:2px 0 0; font-size:13px; font-weight:600; color:#f8fafc; }
.similar-file__stat[data-diff="matches"] { opacity:0.8; }
.similar-file__stat[data-diff="matches"] dd { color:#e2e8f0; }
.similar-file__stat[data-diff="bigger"],
.similar-file__stat[data-diff="differs"] { border-color:rgba(248,113,113,0.55); background:rgba(248,113,113,0.12); box-shadow:0 0 0 1px rgba(248,113,113,0.25) inset; }
.similar-file__stat[data-diff="bigger"] dd,
.similar-file__stat[data-diff="differs"] dd { color:#fecaca; }
.similar-file__stat[data-diff="smaller"] { border-color:rgba(59,130,246,0.45); background:rgba(59,130,246,0.14); box-shadow:0 0 0 1px rgba(59,130,246,0.25) inset; opacity:0.9; }
.similar-file__stat[data-diff="smaller"] dd { color:#bfdbfe; }
.similar-file__stat[data-diff="unknown"] { border-style:dashed; opacity:0.6; }
.similar-file[data-selected="1"] { border-color:rgba(14,165,233,0.8); box-shadow:0 0 0 1px rgba(14,165,233,0.45) inset, 0 0 0 2px rgba(14,165,233,0.2); background:rgba(14,165,233,0.08); }

.similar-selection { margin-top:16px; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px; background:rgba(15,23,42,0.45); display:flex; flex-direction:column; gap:12px; }
.similar-selection__header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
.similar-selection__hint { font-size:12px; color:var(--muted, #94a3b8); margin-top:2px; }
.similar-selection__list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; max-height:220px; overflow:auto; }
.similar-selection__item { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 12px; background:rgba(15,23,42,0.35); }
.similar-selection__meta { display:flex; flex-direction:column; gap:2px; }
.similar-selection__badge { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted, #94a3b8); }
.similar-selection__path { font-family:var(--mono-font, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace); font-size:12px; word-break:break-all; }
.similar-selection__remove { background:none; border:1px solid rgba(255,255,255,0.18); border-radius:8px; color:#e2e8f0; }
.similar-selection__remove:hover { border-color:#fff; }
.similar-selection__footer { display:flex; justify-content:flex-end; }
.similar-selection__header-actions { display:flex; gap:8px; }

@media (max-width: 560px) {
  .similar-selection__item { flex-direction:column; align-items:flex-start; }
  .similar-selection__footer { justify-content:stretch; }
  .similar-selection__footer button { width:100%; }
}

@media (max-width: 560px) {
  .similar-file__primary { flex-direction:column; align-items:flex-start; }
  .similar-thumb-btn { width:100%; max-width:none; }
}

/* Merged Artifacts column: ensure wide enough initially (matches widened JS default 520px) */
.list-table thead th.col-artifacts,
.list-table tbody td.col-artifacts { min-width:520px; }
/* Prevent wrapping when table nowrap mode is active */
#listTable.nowrap tbody td.col-artifacts .chips-list { flex-wrap: nowrap; white-space: nowrap; }
/* Optional horizontal scroll if still overflow (keeps single line) */
#listTable.nowrap tbody td.col-artifacts .chips-list { overflow-x: auto; }
/* Add px units to width/height via JS; ensure no extra layout constraints needed here */

/* Performers & Tags columns chip styling (reuse artifact chip aesthetics) */
.list-table tbody td.col-performers .chips-list,
.list-table tbody td.col-tags .chips-list { display:flex; flex-wrap:wrap; gap:6px; }
.list-table tbody td.col-performers .chip,
.list-table tbody td.col-tags .chip { font-size:11px; padding:2px 6px; border-radius:12px; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); cursor:pointer; }
.list-table tbody td.col-performers .chip:hover,
.list-table tbody td.col-tags .chip:hover { background: rgba(255,255,255,0.14); }
/* No-wrap mode: keep single line with horizontal scroll */
#listTable.nowrap tbody td.col-performers .chips-list,
#listTable.nowrap tbody td.col-tags .chips-list { flex-wrap:nowrap; white-space:nowrap; overflow-x:auto; }
/* Inline suggestions (list performers/tags) */
.list-table tbody td.col-performers .chips-suggestions-inline,
.list-table tbody td.col-tags .chips-suggestions-inline { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
.list-table tbody td.col-performers .chip-suggest,
.list-table tbody td.col-tags .chip-suggest { font-size:11px; }
.performers-accept-all { width:100%; display:flex; justify-content:flex-start; margin-top:4px; }
.performers-accept-all-btn { padding:2px 10px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:rgba(79,140,255,0.15); color:inherit; cursor:pointer; font-size:10px; letter-spacing:0.03em; text-transform:uppercase; }
.performers-accept-all-btn:hover:not(:disabled) { background:rgba(79,140,255,0.25); border-color:rgba(79,140,255,0.35); }
.performers-accept-all-btn:disabled { opacity:0.6; cursor:wait; }
.chips-suggest-controls { width:100%; display:flex; justify-content:flex-start; margin-top:4px; }
.chip-suggest-all-btn { padding:2px 10px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:rgba(79,140,255,0.08); color:inherit; cursor:pointer; font-size:10px; letter-spacing:0.03em; text-transform:uppercase; }
.chip-suggest-all-btn:hover:not(:disabled) { background:rgba(79,140,255,0.18); border-color:rgba(79,140,255,0.28); }
.chip-suggest-all-btn:disabled { opacity:0.6; cursor:wait; }
/* Inline edit input styling */
.inline-edit-wrap { display:flex; width:100%; }
.inline-edit-input { width:100%; font-size:11px; padding:4px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.35); color:inherit; }
.inline-edit-input:focus { outline:2px solid rgba(79,140,255,0.6); }

/* ContentEditable chip-style inline input that preserves chip layout */
.chips-list .chip-input { display:inline-flex; align-items:center; min-width:18px; min-height:20px; padding:2px 6px; margin:0; border-radius:12px; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); font-size:11px; outline:none; cursor:text; }
.chips-list .chip-input:focus { background: rgba(255,255,255,0.10); border-color: rgba(79,140,255,0.45); box-shadow: 0 0 0 2px rgba(79,140,255,0.25) inset; }
.chips-list .chip-input:empty:before { content: attr(data-placeholder); color: var(--muted); opacity: .7; }
/* No-wrap mode: keep inline editor on one line with horizontal scroll */
#listTable.nowrap tbody td.col-performers .chips-list .chip-input,
#listTable.nowrap tbody td.col-tags .chips-list .chip-input { white-space:nowrap; }

/* Autocomplete dropdown for chip editors */
.list-table tbody td.col-performers, .list-table tbody td.col-tags { position: relative; }
.chip-suggest-menu { position:absolute; top:100%; left:0; margin-top:4px; z-index:500; background: var(--panel-bg,#1e293b); border:1px solid rgba(255,255,255,0.18); border-radius:6px; padding:4px 0; min-width:160px; max-width:260px; box-shadow:0 6px 16px rgba(0,0,0,.45); max-height:220px; overflow-y:auto; }
.chip-suggest-menu[hidden] { display:none; }
.chip-suggest-item { padding:4px 10px; font-size:11px; cursor:pointer; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
.chip-suggest-item:hover, .chip-suggest-item.active { background: rgba(79,140,255,0.30); }

/* Compact, centered utility columns (open/action + artifact presence) */
.list-table thead th.col-open,
.list-table tbody td.col-open,
.list-table thead th[class^="col-art-"],
.list-table thead th[class*=" col-art-"],
.list-table tbody td[class^="col-art-"],
.list-table tbody td[class*=" col-art-"],
.list-table thead th.col-subs,
.list-table tbody td.col-subs {
  text-align: center;
}
.list-table tbody td.col-open button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.14);
  color: var(--muted);
}
.list-table tbody td.col-open button:hover { color: #fff; border-color: rgba(255,255,255,0.28); }
.list-table tbody td[class^="col-art-"] .dot {
  font-size: 10px;
  line-height: 1;
}
/* New status glyphs for artifact presence */
.list-table tbody td[class^="col-art-"] .status,
.list-table tbody td[class*=" col-art-"] .status,
.list-table tbody td.col-subs .status {
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25em;
  height: 1.25em;
  line-height: 1.25em;
}
.list-table thead th[class^="col-art-"] .list-head-cell,
.list-table thead th[class*=" col-art-"] .list-head-cell { justify-content: center; }
/* Center chips/statuses within artifact cells */
#listTable tbody td[class^="col-art-"] .chips-list,
#listTable tbody td[class*=" col-art-"] .chips-list { justify-content: center; }
#listTable.nowrap tbody td[class^="col-art-"] .chips-list,
#listTable.nowrap tbody td[class*=" col-art-"] .chips-list { justify-content: center; }
.list-table tbody td[class^="col-art-"] .status,
.list-table tbody td[class*=" col-art-"] .status { margin: 0 auto; }
.status--present { color: #22c55e; } /* green check */
.status--missing { color: #ef4444; } /* red X */

/* Rotate headers feature removed */

/* Optional: disable wrapping for compact view */
#listTable.nowrap thead th,
#listTable.nowrap thead th .list-head-cell,
#listTable.nowrap tbody td {
  white-space: nowrap;
}
#listTable.nowrap tbody td {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Ensure drag handles remain inline and visible in nowrap mode */
#listTable.nowrap thead th .col-drag-handle {
  display: inline-block;
  white-space: nowrap;
}

/* Drag feedback and drop indicators for list headers */
#listTable thead th.drag-hover,
#listTable tbody td.drag-hover {
  background: #fff0e0;
}

#listTable thead th.drop-left::before,
#listTable thead th.drop-right::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #ff7a00;
}

#listTable thead th.drop-left::before {
  left: 0;
}

#listTable thead th.drop-right::after {
  right: 0;
}

.col-resizer:hover::after {
  background: rgba(46, 140, 255, 0.6);
  opacity: 1;
}

.list-columns-panel {
  position: absolute;
  z-index: 40;
  right: 12px;
  top: 76px;
  width: 320px;
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.list-columns-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50vh;
  overflow: auto;
}

.list-col-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px dashed transparent;
}

.list-col-item[draggable="true"] {
  cursor: grab;
}

.list-col-item.dragging {
  opacity: 0.7;
  border-color: rgba(46, 140, 255, 0.4);
}

.list-col-item .drag-handle {
  color: var(--muted);
}

.list-col-item .list-col-label {
  margin-left: 6px;
}

.list-columns-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* Drag indicators in the Columns panel */
.list-columns-panel .drop-before {
  border-top: 3px solid #2e8cff;
}

.list-columns-panel .drop-after {
  border-bottom: 3px solid #2e8cff;
}

.selection-option-wide {
  gap: 10px;
  align-items: flex-start;
}

.subtitle-icon-label {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.subtitle-icon {
  display: inline-block;
  width: 16px;
  height: 12px;
  border-radius: 3px;
  background: #2c323d;
  position: relative;
  overflow: hidden;
}

.subtitle-line {
  position: absolute;
  left: 2px;
  right: 2px;
  height: 3px;
  background: #12161f;
  border-radius: 2px;
}

.subtitle-line.top {
  top: 3px;
}

.subtitle-line.bottom {
  bottom: 3px;
  left: 6px;
}

/* Registry column narrow variant (used by tags panel) */
.registry-column--narrow {
  max-width: 640px;
}

/* Image modal specific helpers */
.panel--image-body {
  padding: 0;
  background: #0e1016;
}

.panel-image {
  display: block;
  max-width: 100%;
  height: auto;
}


.sprite-defs-hidden {
  position: absolute;
  left: -9999px;
  visibility: hidden;
}

.fw-600 {
  font-weight: 600;
}

.hint-sm {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.mt-12 {
  margin-top: 12px;
  margin-bottom: 12px;
}

.gap-10 {
  gap: 10px;
}

.gap-16 {
  gap: 16px;
}

.flex-row {
  display: flex;
  align-items: center;
}

.w-120 {
  width: 120px;
}

.w-100 {
  width: 100%;
}

.file-selection-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.control-group--flex {
  min-width: 160px;
  max-width: 240px;
  flex: 1;
}

/* spritePreview positioning and visuals moved from inline style */
#spritePreview {
  position: absolute;
  display: none;
  background-repeat: no-repeat;
  background-color: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(4px) saturate(140%);
}

.ml-8 {
  margin-left: 8px;
}

.ml-4 {
  margin-left: 4px;
}

/* ===== API Explorer ===== */
.api-endpoints-list {
  display: grid;
  gap: 8px;
}

.api-endpoint__header {
  gap: 10px;
}

.method-badge {
  display: inline-block;
  text-align: center;
  font-weight: 700;
  color: #fff;
  background: #3b6cb7;
  border-radius: 6px;
  padding: 2px 6px;
}

.method-badge.get {
  background: darkgreen;
}

.method-badge.post {
  background: darkgoldenrod;
}

.method-badge.delete {
  background: crimson;
}

.api-endpoint[data-open="1"] .api-endpoint__body {
  display: block;
}

.api-endpoint__body.hidden {
  display: none;
}

.api-param-row {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.json-pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: #0e1320;
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 8px;
}

/* API Grouping & Folding */
.api-groups {
  display: grid;
  gap: 12px;
}

.api-group {
  border: 1px solid #2a3144;
  border-radius: 10px;
  background: #0d1220;
}

.api-group__header {
  padding: 10px 12px;
  cursor: pointer;
  align-items: center;
}

.api-group__header:focus {
  outline: 2px solid var(--accent, #4f8cff);
  outline-offset: 2px;
}

.api-group__body {
  padding: 10px;
  border-top: 1px solid #1b2235;
}

.api-group[data-open="0"] .api-group__body {
  display: none;
}

.api-group__caret {
  transform: rotate(0deg); /* collapsed: right */
  transition: transform .15s ease;
  color: #7f8aa3;
}

.api-group[data-open="1"] .api-group__caret {
  transform: rotate(90deg); /* expanded: down */
}

/* Expand all button for groups with children */
.api-group__expand-all {
  background: #1a2635;
  border: 1px solid #2a3144;
  color: #94a2c7;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: auto;
  margin-right: 8px;
}

.api-group__expand-all:hover {
  background: #243247;
  border-color: #3a4354;
  color: #dbe2f1;
}

/* Slightly larger spacing for API endpoint cards inside groups */
.api-group .api-endpoint {
  margin-bottom: 10px;
}

.api-group .api-endpoint:last-child {
  margin-bottom: 0;
}

/* Tree view toggle */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #a0aec0;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

/* ===== Performer Face Box Preview ===== */
.facebox-stage {
  position: relative;
  max-width: 90vw;
  max-height: 80vh;
  margin: 0 auto;
}
.facebox-stage img {
  display: block;
  max-width: 480px; /* normalize modal image size */
  max-height: 480px;
  width: auto;
  height: auto;
}
.facebox-overlay {
  position: absolute;
  border: 2px solid #22c55e; /* green */
  box-shadow: 0 0 0 2px rgba(34,197,94,0.3) inset;
  cursor: move;
  /* Enable interaction for manual reposition */
  pointer-events: auto;
}
.facebox-overlay .handle {
  position: absolute;
  width: 14px;
  height: 14px;
  right: -8px;
  bottom: -8px;
  background: #22c55e;
  border: 2px solid #064e3b;
  border-radius: 4px;
  cursor: nwse-resize;
  box-shadow: 0 0 0 2px rgba(34,197,94,0.35);
}
.facebox-links {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}
.facebox-links a {
  padding: 4px 8px;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 6px;
  text-decoration: none;
  color: #e2e8f0;
  background: rgba(255,255,255,0.06);
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.facebox-links a:hover {
  background: rgba(255,255,255,0.14);
  color: #fff;
  border-color: rgba(255,255,255,0.34);
}
.facebox-links.hidden { display: none; }
.facebox-overlay.dragging {
  opacity: 0.85;
  border-color: #4ade80;
  box-shadow: 0 0 0 2px rgba(74,222,128,0.45) inset;
}

/* Tree indentation for nested groups */
.api-group__body>.api-group {
  margin-left: 14px;
  border-left: 1px dashed #1b2235;
}

.api-group__body>.api-group .api-group__header {
  padding-left: 18px;
}

/* Global: add more breathing room around tab contents */
.tab-panels>.tab-panel {
  padding: 20px 20px 28px;
}

.panel,
.card {
  padding: 14px;
}

/* Sidebar toggle handle (vertical) */
.sidebar-toggle {
  position: relative;
  z-index: 30;
  background: transparent;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 8px;
  /* horizontal padding only so height is governed by siblings */
  transition: background .15s ease, border-color .15s ease;
  align-self: stretch;
  /* match height of sibling panels */
  box-sizing: border-box;
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.02);
}

.sidebar-toggle:focus {
  outline: none;
  box-shadow: var(--focus-ring);
  overflow: visible;
  z-index: 60;
}

.sidebar-toggle:hover {
  overflow: visible;
  z-index: 50;
}

.sidebar-toggle__icon {
  display: block;
  width: 16px;
  height: 16px;
  transition: transform 220ms ease, color 150ms ease, opacity 150ms ease;
  color: var(--muted);
  transform-origin: center center;
}

.sidebar-toggle svg {
  display: block;
  width: 16px;
  height: 16px;
}

.sidebar-toggle__icon use,
.sidebar-toggle__icon path,
.sidebar-toggle__icon svg {
  stroke: none !important;
  fill: currentColor !important;
}

.sidebar-toggle__icon {
  opacity: 1;
}

.sidebar-toggle__fallback {
  display: none;
}

/* If the UA doesn't apply <use>, show the fallback path */
.sidebar-toggle__icon:not(:has(use)) .sidebar-toggle__fallback {
  display: block;
}

/* Make the toggle icon more visible and responsive to hover/active states */
.sidebar-toggle {
  color: var(--text);
}

.sidebar-toggle:hover {
  color: color-mix(in srgb, var(--text) 85%, var(--accent) 15%);
}

.sidebar-toggle:active {
  color: var(--accent);
}

/* Sidebar child contents transition for smooth collapse */
.player-split .player-sidebar>* {
  transition: opacity 190ms ease, transform 220ms ease;
}

.has-sidebar-collapsed .player-split .player-sidebar>* {
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
}

/* Ensure player-main expands to fill when sidebar collapsed */
.player-split {
  display: flex;
  gap: 12px;
  align-items: stretch;
  overflow: visible;
}

.player-sidebar {
  width: 320px;
  transition: width .18s ease, padding .15s ease;
}

.player-main {
  flex: 1 1 auto;
}

/* Make the toggle a stable flex sibling so it remains visible when sidebar is display:none */
.sidebar-toggle {
  flex: 0 0 auto;
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 8px;
  z-index: 40;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  overflow: visible;
}


/* Performers toolbar & dropzone */
.perf-toolbar {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin: 0 0 12px;
}

.perf-toolbar .compact-filter {
  flex: 0 1 180px;
  min-width: 120px;
}

.perf-search {
  flex: 1 1 200px;
  min-width: 200px;
}

.performer-dropzone {
  border: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  padding: 18px 20px;
  min-height: 72px;
  text-align: center;
  font-size: 13px;
  color: #94a2c7;
  margin: 0 0 14px;
  cursor: pointer;
  user-select: none;
  background: rgba(255, 255, 255, 0.02);
}

.performer-dropzone:hover {
  background: rgba(255, 255, 255, 0.03);
}

.pdz-title {
  display: block;
  font-weight: 600;
  color: #b9c6e4;
  margin: 0 0 2px;
}

.pdz-sub {
  display: block;
  font-size: 12px;
  opacity: 0.85;
}

.catalog-status {
  font-size: 12px;
  color: #8894b0;
  margin: 0 0 8px;
}

.performers-grid {
  position: relative;
  display: grid;
  /* Larger tiles: 4 fixed columns on desktop */
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 18px;
  padding: 14px 14px 18px;
  min-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.015));
}

@media (max-width: 1200px) {
  .performers-grid {
    grid-template-columns: repeat(3, minmax(220px, 1fr));
  }
}

@media (max-width: 820px) {
  .performers-grid {
    grid-template-columns: repeat(2, minmax(200px, 1fr));
  }
}

@media (max-width: 520px) {
  .performers-grid {
    grid-template-columns: 1fr;
  }
}

/* Pager (top and bottom) should have consistent spacing and alignment */
#performersPager,
#performersPagerBottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 12px;
}

#performersPager .control-select,
#performersPagerBottom .control-select {
  min-width: 72px;
}

#perfPageInfo,
#perfPageInfoBottom {
  min-width: 84px;
  text-align: center;
  color: var(--text-muted);
}

/* Enhanced performers cards */
.perf-card.perf-card--pretty {
  border: 1px solid rgba(120, 130, 160, 0.25);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  padding: 12px;
  border-radius: 10px;
}

.perf-card.perf-card--pretty:hover {
  border-color: rgba(120, 130, 160, 0.45);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.perf-card.perf-card--pretty .pc-top {
  display: grid;
  grid-template-columns: 56px 1fr auto; /* unified avatar column width */
  gap: 12px;
  align-items: center;
}

.perf-card.perf-card--pretty .pc-avatar {
  width: 56px; /* standardized avatar size */
  height: 56px; /* standardized avatar size */
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.25), rgba(90, 110, 160, 0.4));
  border: 1px solid rgba(120, 130, 160, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color .15s ease, box-shadow .15s ease, background .25s ease;
}

.perf-card.perf-card--pretty .pc-avatar .pc-avatar-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: cover;
  object-position: 50% 50%;
  transform-origin: 50% 50%;
  transform: none;
  transition: object-position .18s ease, transform .18s ease;
  pointer-events: none;
}

.perf-card.perf-card--pretty .pc-avatar:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(79,140,255,.5);
}

.perf-card.perf-card--pretty .pc-avatar:hover {
  border-color: rgba(120,130,160,.6);
}

.perf-card.perf-card--pretty .pc-avatar .pc-avatar-icon {
  opacity: .85;
  color: var(--text);
  pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}

.perf-card.perf-card--pretty .pc-avatar:hover .pc-avatar-icon,
.perf-card.perf-card--pretty .pc-avatar:focus .pc-avatar-icon {
  opacity: 1;
  transform: scale(1.05);
}

/* When an image is present, hide the camera icon but allow background-image click to re-upload */
.perf-card.perf-card--pretty .pc-avatar.has-image .pc-avatar-icon {
  opacity: 0;
}

/* Provide subtle overlay hint on hover when image exists */
.perf-card.perf-card--pretty .pc-avatar.has-image::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.15);
  opacity: 0;
  transition: opacity .15s ease;
}

.perf-card.perf-card--pretty .pc-avatar.has-image:hover::after,
.perf-card.perf-card--pretty .pc-avatar.has-image:focus::after {
  opacity: 1;
}

.perf-card.perf-card--pretty .pc-countwrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pc-face-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.35);
  background: var(--muted);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  display: inline-flex;
  transition: transform .15s ease, opacity .15s ease;
}

.pc-face-indicator[hidden] {
  display: none;
}

.pc-face-indicator[data-state="present"] {
  background: var(--success);
}

.pc-face-indicator[data-state="missing"] {
  background: var(--warn);
}

.perf-card.perf-card--pretty .pc-titlebox {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.perf-card.perf-card--pretty .pc-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-open-library-btn {
  align-self: flex-start;
  font-size: 12px;
  line-height: 1.2;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(120, 130, 160, 0.35);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.tag-open-library-btn:hover,
.tag-open-library-btn:focus {
  color: var(--text);
  border-color: rgba(120, 130, 160, 0.6);
  background: rgba(120, 130, 160, 0.15);
  outline: none;
}

.tag-open-library-btn:focus-visible {
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.35);
}

.perf-card.perf-card--pretty .pc-count {
  display: inline-block;
  min-width: 24px;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1;
  color: var(--text-muted);
  background: rgba(120, 130, 160, 0.2);
  border: 1px solid rgba(120, 130, 160, 0.35);
  border-radius: 999px;
  text-align: center;
}

.perf-card.perf-card--pretty .pc-tags {
  display: none;
}

.perf-card.perf-card--pretty .tag--compact {
  font-size: 11px;
  padding: 2px 6px;
}

.perf-card.perf-card--pretty .pc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.perf-card.perf-card--pretty .btn-chip {
  display: none;
}

/* Task / artifact utility replacements */
.options-tooltip.d-none {
  display: none !important;
}

/* (Duplicate base reset + button/grid/card definitions removed above for clarity) */

/* Video preview on hover */
.video-preview {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

/* Player overlay adjustments */
#playerContainer .player-video {
  position: relative;
}

#timeline {
  z-index: 5;
}

/* Position of #spritePreview is controlled by JS;
keep only z-index here */
#spritePreview {
  z-index: 6;
}

.video-preview.active {
  opacity: 1;
}

.video-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 9px;
  /* Slightly smaller than card to stay within borders */
}

/* Preview toggle button styling */
.btn-sm.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

/* Description field: visible area even when empty; styling handled by state/classes */
#videoDescription {
  display: block;
  width: 100%;
  min-height: 50px;
}

#videoDescription[data-empty="1"]::before {
  content: attr(data-placeholder);
  color: #9fb4c9;
  opacity: 0.6;
}

.thumbnail-wrap {
  position: relative;
}

.thumbnail-img {
  aspect-ratio: 16/9;
  width: 100%;
  display: block;
  background: #0e0f14;
  object-fit: cover;
}

.metadata {
  padding: 8px 10px 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  font-size: 12px;
  color: var(--muted);
}

.empty,
.error {
  color: var(--muted);
  padding: 24px;
  text-align: center;
}

.overlay-info {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 9;
  display: none;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  line-height: 1;
}

.overlay-info .overlay-resolution {
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.2px;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
  font-size: 11px;
}

.spinner {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  /* Establish containing block for pseudo-elements */
  width: 48px;
  /* Reserve space so layout shift is minimal before paint */
  height: 48px;
}

/* Inner dot fallback (Option B) to provide a visible center even if animation or borders fail */
.spinner::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  background: var(--accent, #4f8cff);
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
}

/* Outer ring (Option A: thicker & higher contrast) */
.spinner::after {
  content: "";
  position: absolute;
  inset: 0;
  /* Fill the reserved 48x48 box */
  width: 48px;
  height: 48px;
  border: 5px solid var(--border-subtle, #2b3548);
  border-top: 5px solid var(--accent, #4f8cff);
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
  box-sizing: border-box;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.job-progress {
  position: relative;
  width: 100%;
  height: 8px;
  background: #20263a;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #2a3144;
}

.job-progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--accent), #7aa6ff);
  transition: width 0.25s ease;
}

.job-progress.running .job-progress-fill {
  background-color: var(--accent);
  background-image: repeating-linear-gradient(-45deg,
      rgba(255, 255, 255, 0.25) 0,
      rgba(255, 255, 255, 0.25) 10px,
      transparent 10px,
      transparent 20px);
  animation: progress-stripes 1.2s linear infinite;
}

@keyframes progress-stripes {
  from {
    background-position: 0 0;
  }

  to {
    background-position: 40px 0;
  }
}

.btn-busy,
.btn.btn-busy,
.btn-sm.btn-busy {
  position: relative;
  pointer-events: none;
  opacity: 0.9;
}

.btn-busy::before {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  vertical-align: -2px;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal[hidden] {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 50;
}

.modal .panel {
  width: min(800px, 92vw);
  background: var(--panel);
  border: 1px solid #2a3144;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* Panel variants moved from inline styles in index.html */
.panel--narrow {
  max-width: 520px;
  width: 96%;
}

.panel--wide {
  max-width: 900px;
  width: 90%;
}

.panel--image {
  max-width: min(920px, 96vw);
}

.panel-header--spaced {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header--spaced-lg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-body--scroll {
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
  /* enforce no horizontal scroll in scrollable panels */
}

.panel-body--tall {
  max-height: 70vh;
  overflow: auto;
}

.hint-sm--muted {
  opacity: .7;
  margin-bottom: 8px;
}

.performer-import-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.panel-footer--actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}

.file-selection--compact {
  margin-bottom: 12px;
}

.selection-option--no-margin {
  margin: 0;
}

.hint-sm--small-top {
  margin-top: 6px;
}

.autotag-table {
  margin-top: 8px;
}

.autotag-table thead th:first-child {
  width: 55%;
}

/* Modal header and content spacing helpers */
.modal-content--wide {
  max-width: 720px;
}

.modal-header--spaced {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #161b27;
  border-bottom: 1px solid #2a3144;
}

.m-0 {
  margin: 0;
}

/* Error modal pre formatting */
.error-pre {
  white-space: pre-wrap;
  background: #111;
  color: #f88;
  padding: 12px;
  border-radius: 6px;
  max-height: 50vh;
  overflow: auto;
}

.markers-header--spaced {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.label-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Empty state enhancements */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.empty-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.empty-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--muted);
}

/* Thumb placeholder: default to block so initial layout reserves space;
   JS may hide it after image load. Hidden via [hidden] attribute when not needed. */
.thumbnail-placeholder {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* purely decorative */
}

.mt-4 {
  margin-top: 4px;
}

.modal header {
  position: static;
  padding: 12px 14px;
  background: #161b27;
  border-bottom: 1px solid #2a3144;
}

.crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.crumbs .seg {
  cursor: pointer;
  color: var(--text);
}

.crumbs .seg:hover {
  text-decoration: underline;
}

.modal .body {
  padding: 12px 14px;
  max-height: min(60vh, 520px);
  overflow-y: auto;
  overflow-x: hidden;
  /* avoid horizontal scrolling inside modal body */
}

.dirlist {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.dir {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1b2130;
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
}

.dir:hover {
  background: #20283a;
}

.dir .icon {
  width: 20px;
  height: 16px;
  background: #6b7aa6;
  border-radius: 2px;
  position: relative;
}

.dir .icon::after {
  content: "";
  position: absolute;
  left: 0;
  top: -4px;
  width: 12px;
  height: 6px;
  background: #6b7aa6;
  border-top-left-radius: 2px;
  border-top-right-radius: 2px;
}

.modal .actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #2a3144;
}

.dir.muted {
  opacity: 0.8;
}

/* Grid controls — streamlined sticky panel */
.controls-panel {
  /* Tunable custom properties scoped to this component */
  --cp-top: var(--sticky-header-height, 48px);
  --cp-z: 9; /* just under header (10) */
  --cp-bg: rgba(20, 24, 32, 0.85);
  --cp-gap: 8px;
  --cp-input-h: 40px;
  --cp-input-fs: 16px;

  background: var(--card);
  border: 1px solid #2a3144;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.controls-panel.sticky-enabled {
  position: sticky;
  top: var(--cp-top);
  z-index: var(--cp-z);
  backdrop-filter: blur(8px);
  background: var(--cp-bg);
}

.controls-panel.library-toolbar {
  --cp-gap: 12px;
  --cp-input-h: 44px;
  --cp-input-fs: 15px;
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}

.controls-panel.library-toolbar.sticky-enabled {
  backdrop-filter: none;
  background: transparent;
}

.library-toolbar__surface {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 18px;
  background: rgba(10, 14, 22, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 14px 35px -28px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px) saturate(140%);
}

.library-toolbar__row {
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.library-toolbar__row--secondary {
  align-items: flex-start;
}

.library-toolbar__cluster {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.library-toolbar__cluster-search {
  flex: 1 1 520px;
  min-width: 260px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(6, 10, 18, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.library-toolbar__cluster-options {
  flex: 0 1 360px;
  justify-content: flex-end;
}

.library-toolbar__cluster-artifacts {
  flex: 1 1 280px;
  align-items: center;
}

.library-toolbar__cluster-artifacts #artifactFilterChips {
  flex: 1 1 auto;
  min-width: 200px;
}

.library-toolbar__cluster-pagination {
  flex: 0 1 360px;
  justify-content: flex-end;
  align-items: center;
}

.library-toolbar__cluster-pagination .pagination {
  gap: 8px;
}

.library-toolbar__random {
  display: flex;
  gap: 8px;
  align-items: center;
}

.library-toolbar .btn-sm {
  background: rgba(18, 24, 36, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  height: 38px;
  min-width: 38px;
  padding: 0 12px;
  font-weight: 600;
  box-shadow: 0 6px 18px -12px rgba(0, 0, 0, 0.8);
}

.library-toolbar .btn-sm:hover {
  border-color: rgba(79, 140, 255, 0.7);
  color: #fff;
  background: rgba(35, 56, 92, 0.9);
  box-shadow: 0 10px 20px -16px rgba(14, 24, 44, 0.9);
}

.library-density {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
}

.library-density__label {
  font-size: 12px;
  color: rgba(226, 233, 243, 0.8);
}

.library-density .control-slider,
.library-density #densitySlider {
  width: 160px;
}

/* On mobile, disable sticky and bump tap targets via variables */
@media (max-width: 640px) {
  .controls-panel.sticky-enabled {
    position: static;
    top: auto;
    z-index: auto;
    backdrop-filter: none;
    background: var(--card);
  }
  .controls-panel {
    --cp-gap: 10px;
    --cp-input-h: 48px;
    --cp-input-fs: 18px;
  }
}

@media (max-width: 1024px) {
  .library-toolbar__row {
    flex-direction: column;
    align-items: stretch;
  }

  .library-toolbar__cluster,
  .library-toolbar__cluster-options,
  .library-toolbar__cluster-pagination {
    flex: 1 1 100%;
    justify-content: flex-start;
  }

  .library-toolbar__cluster-pagination .pagination,
  .library-toolbar__random {
    width: 100%;
    justify-content: space-between;
  }
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap);
  flex-wrap: wrap; /* allow right-side groups to flow below if search is wide */
  padding: 0; /* remove extra implicit line height */
}

/* Prevent non-search clusters from stretching; they sit to the right or wrap below */
.controls-panel .control-group,
.controls-panel .pagination-group {
  flex: 0 0 auto;
}

/* Desktop/base: allow the search group to own the row width */
.controls-panel .control-group--flex {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--cp-gap);
  flex: 1 1 420px; /* wider default growth */
  min-width: 0; /* allow input to shrink without overflow */
  max-width: none; /* override earlier utility cap (240px) */
  width: 100%; /* allow this group to occupy full row width */
}

/* Unified search cluster */
#libraryUnifiedFiltersGroup {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  flex-wrap: wrap;
}

#libraryUnifiedFiltersGroup .clear-btn {
  align-self: center;
  background: rgba(18, 26, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e9f3;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

#libraryUnifiedFiltersGroup .clear-btn:disabled {
  opacity: .5;
  cursor: default;
}

#libraryUnifiedInput {
  /* Fill remaining space within the controls row, but don't collapse too small */
  flex: 1 1 420px;
  min-width: 200px;
  height: 44px;
  font-size: 15px;
  padding: 10px 14px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(12, 18, 30, 0.95);
  color: var(--text);
  transition: border-color .15s ease, box-shadow .15s ease;
}

#libraryUnifiedInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.25);
}

/* Ensure chips next to the input don't steal the flexible space */
.controls-panel .control-group--flex .chips-list {
  flex: 0 1 auto;
  min-width: 0; /* allow chips to shrink/wrap */
}

#libraryUnifiedFiltersGroup .chips-list {
  flex: 1 1 100%;
  min-height: 0;
}

/* Improve search/filter usability on small screens */
@media (max-width: 640px) {
  /* Let the row wrap onto multiple lines */
  .controls-panel .controls-row {
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px var(--cp-gap);
  }

  /* Make the search group span full width on first row */
  .controls-panel .control-group--flex {
    flex: 1 1 100%;
    max-width: none;
    min-width: 0;
  }

  /* Ensure chips container and input are easy to tap */
  #libraryUnifiedFiltersGroup {
    flex-direction: column;
    flex-wrap: wrap;
    width: 100%;
    align-items: stretch;
  }
  /* Layout rule: keep [Clear] immediately left of the search input on the first row,
     and move the chips list to its own row below when space is tight. */
  #libraryUnifiedFiltersGroup .clear-btn { order: 1; flex: 0 0 auto; width: 48px; height: 48px; }
  #libraryUnifiedInput { order: 2; flex: 1 1 100%; min-width: 0; width: 100%; padding: 12px 16px; }
  #libraryUnifiedFiltersGroup .chips-list { order: 3; flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; min-height: 32px; }

  /* Larger selects and buttons for better touch */
  .controls-panel .control-select {
    font-size: 16px;
    height: 44px;
    padding: 10px 36px 10px 12px;
  }
  .controls-panel .btn-sm {
    font-size: 14px;
    height: 40px;
    padding: 6px 10px;
  }

  /* Allow the right-hand control clusters to wrap neatly */
  .controls-panel .control-group,
  .controls-panel .pagination-group {
    flex-wrap: wrap;
  }
  .controls-panel .pagination-group {
    width: 100%;
    justify-content: space-between;
    gap: 8px var(--cp-gap);
  }
  .controls-panel .pagination {
    order: 2;
    flex: 1 1 auto;
    display: flex;
    justify-content: center;
  }
  /* Give the density slider a full-width row for easier adjustment */
  #densitySlider {
    width: 100%;
  }

  .library-toolbar__surface {
    padding: 14px;
    gap: 12px;
    border-radius: 20px;
  }

  .library-toolbar__cluster,
  .library-toolbar__cluster-options,
  .library-toolbar__cluster-pagination,
  .library-toolbar__cluster-artifacts {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .library-density {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
  }

  .library-density .control-slider,
  .library-density #densitySlider {
    width: 100%;
  }

  .library-toolbar__cluster-pagination .pagination,
  .library-toolbar__random {
    width: 100%;
    justify-content: space-between;
  }
}

.pagination-group {
  display: flex;
  align-items: center;
  gap: 10px;
  /* COMPACT */
  margin-left: auto;
}

.library-toolbar .pagination-group {
  margin-left: 0;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-toolbar__cluster.control-group {
  gap: 10px;
}

.control-input {
  background: var(--bg);
  color: var(--text);
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  outline: none;
  height: 40px;
  transition: all 0.2s ease;
}

.control-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.2);
}

.select {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.select .chevron {
  position: absolute;
  right: 12px;
  pointer-events: none;
  color: #9aa4bd;
}

.control-select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 10px 36px 10px 14px;
  /* leave room for chevron */
  font-size: 14px;
  outline: none;
  height: 40px;
  transition: all 0.2s ease;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.library-toolbar .compact-filter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
}

.library-toolbar .compact-filter__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}

.library-toolbar .compact-filter__label {
  font-size: 12px;
  text-transform: none;
  letter-spacing: .02em;
}

.library-toolbar .compact-filter .control-select {
  position: static;
  clip: auto;
  width: 100%;
  height: 38px;
  padding: 6px 32px 6px 10px;
  font-size: 13px;
}

.library-toolbar #orderToggle {
  font-size: 12px;
  width: 32px;
  height: 28px;
  border-radius: 6px;
}

.control-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.2);
}

.control-select:hover {
  border-color: #3a435c;
}

.control-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Make options readable in dark themes where UA styles may differ */
@media (prefers-color-scheme: dark) {
  .control-select option {
    background-color: #0e1220;
    color: #dfe6ff;
  }
}

.control-slider {
  background: var(--bg);
  outline: none;
  cursor: pointer;
  height: 6px;
  border-radius: 3px;
  border: 1px solid #2a3144;
  transition: all 0.2s ease;
  appearance: none;
  -webkit-appearance: none;
}

.control-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  height: 18px;
  width: 18px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.control-slider::-moz-range-thumb {
  height: 18px;
  width: 18px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.control-slider:hover {
  border-color: var(--accent);
}

.btn-sm {
  background: var(--bg);
  color: var(--text);
  border: 1px solid #2a3144;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
  height: 40px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-sm:hover {
  background: var(--card);
  border-color: var(--accent);
  box-shadow: 0 2px 4px rgba(79, 140, 255, 0.2);
}

.btn-sm.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-info {
  font-size: 14px;
  color: var(--muted);
  font-weight: 500;
  min-width: 80px;
  text-align: center;
}

/* Selection bar */
.selection-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: white;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.selection-bar[hidden] {
  display: none;
}

.selection-count {
  font-weight: 600;
}

/* Bulk edit panel inside selection bar */
.selection-bar .bulk-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.15);
  padding: 8px 10px;
  border-radius: 8px;
}
.selection-bar .bulk-panel[hidden] { display: none; }
.selection-bar .bulk-panel .control-select {
  background: #122136;
  border: 1px solid #2b3d52;
  color: #e2e9f3;
  border-radius: 6px;
  padding: 4px 6px;
}
.selection-bar .bulk-panel .chips-input {
  background: #122136;
  border: 1px solid #2b3d52;
  color: #e2e9f3;
}
.selection-bar .bulk-panel .chips-suggestions {
  max-width: 520px;
}

/* Card selection overlay */
.card {
  position: relative;
}

.card.selection-mode {
  cursor: pointer;
}

.card-checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid white;
  border-radius: 6px;
  cursor: pointer;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.card:hover .card-checkbox,
.perf-card:hover .card-checkbox,
.card-checkbox.checked {
  opacity: 1;
}

.card-checkbox.checked {
  background: var(--accent);
}

.card-checkbox.checked::after {
  content: "✓";
  color: white;
  font-size: 14px;
  font-weight: bold;
  position: absolute;
  top: 2px;
  left: 5px;
}

/* Quality badge (resolution) — Stash-like overlay styling */
.quality-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 9;
  display: none;
  /* shown when JS sets display inline */
  padding: 2px 6px;
  line-height: 1;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
}

/* Previously inline widths */
#searchInput {
  width: 280px;
}

#sortSelect {
  width: 120px;
}

#densitySlider {
  width: 200px;
}

/* Initial hidden elements */
#spinner,
#status {
  display: none;
}

/* Tab System */
.tab-nav {
  display: flex;
  margin-top: 8px;
}

.tab-button {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 16px;
  font-weight: 600;
  padding: 12px 24px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  border-bottom: 3px solid transparent;
}

/* Mobile: allow tab buttons to wrap so all tabs are reachable */
@media (max-width: 768px) {
  .tab-nav {
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .tab-button {
    padding: 8px 12px;
    font-size: 14px;
    flex: 1 1 auto;
  }
}

.tab-button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.tab-button.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.tab-button:focus {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tab-panels {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tab-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow nested sticky + scroll to work within flex parent */
}

.tab-panel[hidden] {
  display: none !important;
}

.tab-panel:not(.active) {
  display: none;
}

/* Library scrolls with the page; keep sticky bars relative to viewport */
/* (Reverted per-panel scrolling to restore header+controls stickiness) */

.tab-content {
  padding: 24px;
  flex: 1;
}

.tab-content h2 {
  margin: 0 0 16px 0;
  font-size: 24px;
  font-weight: 600;
}

.tab-content p {
  color: var(--muted);
  font-size: 16px;
  line-height: 1.5;
}

/* Tasks Interface - Professional Design */
.tasks-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.task-section {
  background: var(--card);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.task-section:last-child {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

/* Ensure top-right queue monitor buttons are in one horizontal line */
.section-header .section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: nowrap;
}

.section-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.025em;
}

/* Job table layout stability */
.job-table-container {
  overflow: auto;
}

.job-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  /* Prevent column width thrash */
}

.job-table th,
.job-table td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  vertical-align: middle;
}

.job-table thead th {
  color: var(--muted);
  font-weight: 600;
}

.job-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.04);
}

/* Column widths */
/* 7 columns in order: Start, End, Task, File, Status, Progress, Action */
.job-table th:nth-child(1),
.job-table td:nth-child(1) {
  /* Start */
  width: 96px;
}

.job-table th:nth-child(2),
.job-table td:nth-child(2) {
  /* End */
  width: 96px;
}

.job-table th:nth-child(3),
.job-table td:nth-child(3) {
  /* Task */
  width: 160px;
}

.job-table th:nth-child(4),
.job-table td:nth-child(4) {
  /* File (flex) */
  width: auto;
}

.job-table th:nth-child(5),
.job-table td:nth-child(5) {
  /* Status */
  width: 120px;
}

.job-table th:nth-child(6),
.job-table td:nth-child(6) {
  /* Progress */
  width: 160px;
}

.job-table th:nth-child(7),
.job-table td:nth-child(7) {
  /* Action */
  width: 80px;
}

/* Job table cells & truncation */
.job-table .cell-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-table .cell-status {
  text-transform: capitalize;
}

.job-table .cell-progress .cell-sub {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.job-table .cell-progress .fname {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Stat card active state */
.job-stats {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.job-stats .stat-card {
  cursor: pointer;
  user-select: none;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.job-stats .stat-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.2) inset;
}

.btn-icon {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--muted);
  cursor: pointer;
  padding: 10px;
  border-radius: 8px;
  transition: all 0.2s ease;
  /* display: flex; */
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  border-color: var(--accent);
}

/* File Selection */
.file-selection {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.selection-options {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

/* Ensure the Generate All button floats right in the selection options row */
#generateAllBtn {
  margin-left: auto;
}

.selection-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background 0.2s ease;
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
}

.selection-option:hover {
  background: rgba(255, 255, 255, 0.05);
}

.selection-option input[type="radio"] {
  margin: 0;
  accent-color: var(--accent);
  transform: scale(1.1);
}

/* Artifact Grid - Clean Layout */
.artifact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  flex: 1;
}

.artifact-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 16px;
  position: relative;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  height: fit-content;
  /* Establish baseline stacking;
  will be raised when menu opens */
  z-index: 0;
}

.artifact-card .btn-options {
  position: absolute;
  top: 10px;
  right: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.artifact-card .artifact-actions .btn-options {
  /* prevent layout reservation */
  position: absolute;
}

.artifact-card-uniform {
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.artifact-card-uniform .artifact-header {
  flex: 1 1 auto;
}


.artifact-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px rgba(79, 140, 255, 0.15);
  transform: translateY(-2px);
}

/* When an options menu is open, ensure the card sits above neighbors */
.artifact-card.menu-open {
  z-index: 2000;
  overflow: visible;
  /* be explicit to avoid any accidental clipping */
}

.artifact-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.artifact-info {
  flex: 1;
}

#player-panel {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px;
}

.player-split {
  display: flex;
  flex: 1 1 auto;
  /* fill remaining space */
  width: 100%;
  gap: 8px;
  align-items: stretch;
  box-sizing: border-box;
  min-height: 0;
  /* Make height deterministic: viewport minus header and panel padding (20px top/bottom) */
  height: calc(100vh - var(--header-h) - 40px);
  /* Prevent flicker/jumps on sidebar toggle by avoiding natural height changes */
}

/* Removed previous min-height baseline in favor of explicit height above */

.player-split {
  /* Allow overflow so child focus/hover outlines (box-shadow) are visible.
     Internal scrolling is still confined to the sidebar (.player-sidebar).
     This prevents the sidebar-toggle's focus ring from being clipped. */
  overflow: visible;
}

.player-split .player-main {
  overflow: hidden;
  /* main area should not create vertical scroll */
}

.player-split .player-sidebar {
  overflow-y: auto;
  /* sidebar can scroll internally if content is long */
  -webkit-overflow-scrolling: touch;
}

.player-split .player-sidebar,
.player-split .player-main {
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  padding: 8px;
  /* reduced padding for more compact height */
  box-sizing: border-box;
  background: var(--panel-bg, rgba(0, 0, 0, 0.15));
  min-height: 0;
  max-height: 100%;
}

.player-split .player-sidebar {
  flex: 0 0 var(--player-sidebar-w);
  width: var(--player-sidebar-w);
  max-width: var(--player-sidebar-w);
}

.player-split .player-main {
  flex: 1 1 auto;
  /* fully fluid */
  min-width: 0;
  /* prevent overflow due to long content */
}

.player-split>* {
  max-height: 100%;
}

.player-split .player-main {
  overflow: hidden;
}

.player-split .player-sidebar {
  overflow-y: auto;
}

/* Make the main column a vertical flex container so the video can fill
  the available height while controls/overlays sit above/below. */
.player-split .player-main {
  display: flex;
  flex-direction: column;
  position: relative;
  gap: 6px; /* reduce vertical gap between video and overlays */
}

/* Let the video grow with available width while respecting the vertical cap.
  Height:auto keeps the aspect ratio responsive when the sidebar collapses. */
.player-main .player-video {
  width: 100%;
  height: auto;
  max-height: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

@media (max-width: 900px) {
  .player-split .player-sidebar {
    flex: 0 0 220px;
    width: 220px;
    max-width: 220px;
  }
}

@media (max-width: 640px) {
  .player-split {
    flex-direction: column;
    /* Let the layout grow naturally when tabs wrap in the header */
    height: auto;
  }

  .player-split .player-sidebar,
  .player-split .player-main {
    width: 100%;
    max-width: none;
    flex: 0 0 auto;
  }

  .player-split .player-main {
    /* Unset flex growth/order for mobile to avoid extra vertical space */
    flex: initial !important;
    order: initial !important;
    display: block !important;
  }

  /* Keep the toggle accessible after the video, before the sidebar */
  .sidebar-toggle {
    order: 2;
    align-self: center;
  }

  /* Place sidebar below the video on mobile */
  .player-split .player-sidebar {
    order: 3;
  }

  /* Make the video element shorter on small screens */
  .player-main .player-video {
    /* Apply explicit height to avoid layout stretching */
    height: 36vh !important;
    max-height: none !important;
    aspect-ratio: 16/9;
  }

  /* Also neutralize global player-main flex on mobile */
  #player-panel .player-main {
    flex: initial !important;
    display: block !important;
    flex-direction: initial !important;
    min-height: 0 !important;
    position: relative !important;
  }

  /* When the sidebar is collapsed, make the main player panel more compact */
  .has-sidebar-collapsed .player-split .player-main {
    padding: 4px 6px;
    border: 0;
    background: transparent;
    flex: 0 0 auto; /* don't grow taller than content */
  }
  .has-sidebar-collapsed .player-main .player-video {
    max-height: 36vh; /* slightly smaller when sidebar hidden */
    flex: 0 0 auto;  /* don't stretch to fill container */
  }
  /* Tighten the floating scrubber spacing on small screens */
  #player-panel .player-scrubber-bar {
    padding: 8px 12px 10px;
    gap: 6px;
    font-size: 11px;
  }

  /* Ensure no stray margins add space between video and scrubber */
  .player-main .player-video,
  #playerOverlayBar,
  #playerScrubber,
  .scrubber-heatmap-band,
  .scrubber-track {
    margin: 0;
  }
}

/* Collapse rules: hide the sidebar element entirely so the main area expands */
.has-sidebar-collapsed .player-split {
  gap: 6px;
  /* When sidebar is collapsed, allow the layout to shrink to content
     instead of enforcing the larger baseline min-height. */
  min-height: 0;
}

/* Animate collapse by shrinking max-width and flex-basis instead of using display:none */
.player-split .player-sidebar {
  transition: max-width 280ms ease, flex-basis 280ms ease, padding 220ms ease;
  overflow: hidden;
}

.has-sidebar-collapsed .player-split .player-sidebar {
  max-width: 0 !important;
  flex: 0 0 0 !important;
  /* Remove all padding so it doesn't inflate cross-size (height) */
  padding: 0 !important;
  /* Remove borders to avoid adding extra cross-size */
  border: 0 !important;
  /* Force zero height so it cannot become the tallest flex item during the width transition */
  height: 0 !important;
  min-height: 0 !important;
  /* Keep it fully clipped */
  overflow: hidden !important;
}

/* Rotate the caret icon when collapsed (points right when collapsed) */
.has-sidebar-collapsed .sidebar-toggle__icon {
  transform: rotate(180deg);
}

/* In collapsed mode, don't stretch the sidebar toggle to full height */
/* Keep the toggle full-height even when the sidebar is collapsed */
.has-sidebar-collapsed .sidebar-toggle {
  align-self: stretch;
}

/* Full-height opt-in modifier: add class to #player-panel if needed */
/* Full-height modifier no longer required;
keeping hook in case future conditional behavior needed */
/* #player-panel.is-fullheight .player-split { } */
.svg-sprite {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/* Hide the overlay bar when the title is empty so no empty bar remains visible */
/* Prefer CSS :has where supported;
JS observer below ensures compatibility */
.player-overlay-bar:has(.player-title:empty) {
  display: none !important;
}

.artifact-info h3 {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.025em;
}

.coverage-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.coverage-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  text-align: center;
}

.coverage-bar-mini {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.coverage-fill-mini {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, #22c55e 100%);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  width: 0%;
  border-radius: 4px;
}

.artifact-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.btn-generate {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Unified primary artifact action button;
contextual color set via JS (btn-danger for destructive) */
.btn-generate {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-generate:hover {
  background: #3b82ff;
  box-shadow: 0 4px 12px rgba(79, 140, 255, 0.3);
  transform: translateY(-1px);
}

/* Variant: generate-missing (slightly amber to differentiate) */
.btn-generate[data-state="missing"] {
  background: #d97706;
  /* amber-600 */
  border-color: #d97706;
}

.btn-generate[data-state="missing"]:hover {
  background: #f59e0b;
  /* amber-500 */
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);
}

/* Variant: clear (still relies on btn-danger already defined) */
.btn-generate.btn-danger {
  background: linear-gradient(135deg, #dc2626, #ef4444);
  border-color: #ef4444;
}

.btn-generate.btn-danger:hover {
  filter: brightness(1.05);
}

.btn-options {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  color: var(--muted);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-options:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  border-color: var(--accent);
}

/* Options Tooltip - Enhanced */
.options-tooltip {
  position: absolute;
  top: 48px;
  /* below top bar & button */
  right: 10px;
  z-index: 1000;
  background: var(--card);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  min-width: 240px;
  backdrop-filter: blur(20px);
}

.options-tooltip::before {
  /* reposition arrow to point at button */
  content: '';
  position: absolute;
  top: -6px;
  right: 22px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid var(--card);
}

.options-tooltip label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}

.options-tooltip input,
.options-tooltip select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 12px;
  margin-top: 4px;
  transition: all 0.2s ease;
}

.options-tooltip input:focus,
.options-tooltip select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

/* Job Monitor - Enhanced */
.job-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}

.stat-card:hover {
  border-color: var(--accent);
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.1) 0%, rgba(79, 140, 255, 0.05) 100%);
}

.stat-label {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.job-table-container {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* Allow natural height growth;
  only scroll if container ancestor constrains height */
  overflow: auto;
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
  position: relative;
}

/* Hide scrollbar but preserve scrolling */
.job-table-container::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.job-table-container {
  scrollbar-width: none;
}

.job-table-container {
  -ms-overflow-style: none;
}


.resize-handle {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  height: 10px;
  cursor: ns-resize;
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.06));
}

body.resizing-job-table {
  cursor: ns-resize !important;
  user-select: none;
}

/* WebKit overlay scrollbar styling */
.job-table-container::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.job-table-container::-webkit-scrollbar-track {
  background: transparent;
}

.job-table-container::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  border: 2px solid rgba(0, 0, 0, 0);
  background-clip: padding-box;
}

.job-table-container::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.28);
}

.job-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.job-table th {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.job-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
  color: var(--text);
}

.job-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.03);
}

.job-status {
  padding: 4px 8px;
  border-radius: 16px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.job-status.running {
  background: rgba(79, 140, 255, 0.2);
  color: var(--accent);
}

.job-status.completed {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.job-status.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.job-status.queued {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

/* Paused indicator style (applies to a paused badge) */
.job-status.paused {
  background: rgba(148, 163, 184, 0.25);
  /* slate-400/500 tint */
  color: #94a3b8;
}

.job-paused-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 6px;
  background: #94a3b8;
  vertical-align: middle;
}

.job-progress {
  width: 100px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.job-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #22c55e);
  transition: width 0.3s ease;
  border-radius: 3px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .controls-panel {
    margin: 0 8px 16px 8px;
    padding: 12px 16px;
  }

  .control-group {
    gap: 6px;
  }

  .tasks-container {
    padding: 8px;
    gap: 12px;
  }

  .task-section {
    padding: 12px;
  }

  .section-header {
    margin-bottom: 8px;
  }

  .job-stats {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .artifact-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .artifact-card {
    min-width: unset;
  }

  .artifact-actions {
    flex-direction: column;
    gap: 8px;
  }

  .coverage-text {
    font-size: 16px;
  }

  /* Removed mobile max-height constraint for job table container */

  .job-table {
    font-size: 11px;
  }

  .job-table th,
  .job-table td {
    padding: 6px 8px;
  }
}

@media (max-width: 480px) {
  .tasks-container {
    padding: 4px;
    gap: 8px;
  }

  .task-section {
    padding: 8px;
  }

  .artifact-grid {
    gap: 8px;
  }

  .artifact-header {
    gap: 8px;
  }

  .coverage-text {
    font-size: 14px;
  }

  .job-stats {
    gap: 6px;
  }

  .stat-card {
    padding: 8px;
  }

  .stat-value {
    font-size: 18px;
  }

  .stat-label {
    font-size: 10px;
  }
}

/* Directory card template styles */
.dir-thumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #121723;
  color: #aab2c7;
  font-weight: 600;
  letter-spacing: .2px;
}

.dir-thumbnail-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dir-icon {
  display: inline-block;
  width: 20px;
  height: 16px;
  background: #6b7aa6;
  border-radius: 2px;
  position: relative;
}

.dir .icon.dim {
  opacity: .4;
}

/* Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* (Duplicate spin keyframes removed;
single definition earlier) */

/* Orphaned Artifacts Section */
.orphan-card {
  background: linear-gradient(135deg, rgba(255, 71, 87, 0.03) 0%, rgba(255, 71, 87, 0.01) 100%);
  border: 1px solid rgba(255, 71, 87, 0.2);
  border-radius: 10px;
  padding: 20px;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.orphan-card:hover {
  border-color: rgba(255, 71, 87, 0.4);
  box-shadow: 0 8px 24px rgba(255, 71, 87, 0.15);
  transform: translateY(-2px);
}

.orphan-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.orphan-info h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.orphan-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.orphan-count {
  font-size: 24px;
  font-weight: 700;
  color: #ff4757;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.orphan-label {
  font-size: 13px;
  color: var(--muted);
}

.orphan-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-cleanup {
  background: linear-gradient(135deg, #ff4757 0%, #ff3742 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.btn-cleanup:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff3742 0%, #ff2533 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
}

.btn-cleanup:disabled {
  background: rgba(255, 71, 87, 0.3);
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-preview {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.btn-preview:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.btn-preview:disabled {
  background: rgba(255, 255, 255, 0.05);
  cursor: not-allowed;
  opacity: 0.6;
}

.orphan-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.orphan-list {
  max-height: 200px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 12px;
}

.orphan-file {
  display: block;
  font-size: 12px;
  color: var(--muted);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  margin-bottom: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.orphan-file:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

/* Sidebar Accordion */
.accordion .acc-header {
  width: 100%;
  text-align: left;
  background: #141c2b;
  color: #cfd6e4;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.accordion .acc-panel {
  padding: 6px 4px 4px;
  transition: height .24s ease, padding .24s ease;
}

.accordion .acc-panel.animating {
  overflow: hidden;
}

/* Slide content inside panel: translate + fade for a smooth slide-down/up feel.
   We animate children so we don't need JS measurements. The panel itself still
   animates max-height and opacity for an overall slide effect;
   children then
   translate/fade with a small delay when opening. */
.accordion .acc-panel {
  overflow: hidden;
  /* ensure content doesn't escape during transition */
}

.accordion .acc-panel>* {
  transform: translateY(-8px);
  opacity: 0;
  transition: transform 220ms cubic-bezier(.2, .9, .2, 1), opacity 180ms ease;
  transition-delay: 0ms;
}

.accordion .acc-panel.open>* {
  transform: translateY(0);
  opacity: 1;
  transition-delay: 60ms;
  /* slight delay so height expands first */
}

/* Respect reduced motion preferences */
@media (prefers-reduced-motion: reduce) {

  .accordion .acc-panel,
  .accordion .acc-panel>*,
  .accordion .acc-header .acc-header__icon {
    transition: none !important;
  }
}


.accordion .acc-item+.acc-item {
  margin-top: 8px;
  /* increased spacing to avoid visual overlap */
}

/* Ensure first accordion item has top spacing to avoid overlap with preceding elements */
.accordion .acc-item:first-child {
  margin-top: 6px;
}

@keyframes accFade {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* === Simplified Player Overhaul (experimental) === */
.player-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 8px 4px 32px;
}

.player-shell.no-sidebar .player-main {
  width: 100%;
}

.player-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  position: relative;
}

/* Reset previous mixed grid/flex definitions;
enforce single-line flex bar */
.player-bar-simple {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  overflow: hidden;
  background: #101724;
  border: 1px solid #263144;
  padding: 6px 8px;
  border-radius: 10px;
  box-shadow: 0 4px 18px -6px rgba(0, 0, 0, 0.5);
  min-width: 0;
}

.player-bar-simple>* {
  flex: 0 0 auto;
}

.player-bar-simple .bar-timeline-wrap {
  flex: 1 1 auto;
  min-width: 0;
}

.util-btn {
  background: #182535;
}

.util-btn:hover {
  background: #1e3044;
}

/* No special sidebar responsive rules needed after removal */
@media (max-width: 640px) {
  .player-bar-simple {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .player-bar-simple .util-btn {
    order: 99;
  }
}

.player-simple {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 4px 24px;
}

.player-header-simple {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px 0;
}

.player-header-simple h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  letter-spacing: .4px;
}

.player-stage-simple {
  position: relative;
  background: #05070c;
  border: 2px solid #1c2735;
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1 1 auto;
  /* allow stage to expand vertically */
  min-height: 0;
  /* enable child flex sizing */
}

.video-stage-simple::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 70px;
  pointer-events: none;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}

.player-stage-simple .video-el {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 10px;
  display: block;
  height: calc(100vh - var(--header-h));
  max-height: calc(100vh - var(--header-h));
  object-fit: contain;
}

.player-bar-simple .time-display {
  font-variant-numeric: tabular-nums;
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
}

.player-bar-simple .sep {
  opacity: .45;
}

.bar-timeline-wrap {
  width: 100%;
  display: flex;
  align-items: center;
}

.timeline-flat {
  position: relative;
  height: 8px;
  background: #1d2835;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  width: 100%;
}

.timeline-flat .timeline-heatmap,
.timeline-flat .timeline-heatmap-canvas,
.timeline-flat .timeline-progress,
.timeline-flat .timeline-markers {
  position: absolute;
  inset: 0;
}

.timeline-flat .timeline-progress {
  background: linear-gradient(90deg, #4f8cff, #2e5fa8);
  width: 0%;
  mix-blend-mode: normal;
  transition: width .1s linear;
}

.vol-slider {
  width: 130px;
  height: 6px;
  --vol-pct: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: linear-gradient(90deg, var(--accent, #4f8cff) 0%, var(--accent, #4f8cff) var(--vol-pct), #1e2a3e var(--vol-pct), #1e2a3e 100%);
  border: 1px solid #2b3b52;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  padding: 0;
  /* remove iOS extra tap area */
  transition: background .15s linear, opacity .18s ease, filter .18s ease;
}

/* WebKit track (Chrome/Safari/Edge) */
.vol-slider::-webkit-slider-runnable-track {
  height: 6px;
  background: linear-gradient(90deg, var(--accent, #4f8cff) 0%, var(--accent, #4f8cff) var(--vol-pct), #1e2a3e var(--vol-pct), #1e2a3e 100%);
  border: 1px solid #2b3b52;
  border-radius: 6px;
}

/* Firefox track */
.vol-slider::-moz-range-track {
  height: 6px;
  background: linear-gradient(90deg, var(--accent, #4f8cff) 0%, var(--accent, #4f8cff) var(--vol-pct), #1e2a3e var(--vol-pct), #1e2a3e 100%);
  border: 1px solid #2b3b52;
  border-radius: 6px;
}

/* Thumb */
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent, #4f8cff);
  border: 2px solid #0d121d;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.45), 0 0 0 4px rgba(79, 140, 255, 0.15);
  transition: transform .15s ease, box-shadow .2s ease;
  position: relative;
  margin-top: -5px;
  /* center over 6px track */
}

.vol-slider:active::-webkit-slider-thumb {
  transform: scale(.9);
}

.vol-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent, #4f8cff);
  border: 2px solid #0d121d;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, .45), 0 0 0 4px rgba(79, 140, 255, 0.15);
  transition: transform .15s ease, box-shadow .2s ease;
}

.vol-slider:active::-moz-range-thumb {
  transform: scale(.9);
}

.vol-slider:hover:not(.is-muted)::-webkit-slider-thumb,
.vol-slider:hover:not(.is-muted)::-moz-range-thumb {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, .55), 0 0 0 6px rgba(79, 140, 255, 0.25);
}

.vol-slider.is-muted {
  opacity: .45;
  filter: grayscale(.35) brightness(.85);
}

.vol-slider.is-muted::-webkit-slider-thumb,
.vol-slider.is-muted::-moz-range-thumb {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, .45), 0 0 0 4px rgba(79, 140, 255, 0.05);
}

.rate-select-inline {
  background: #162131;
  border: 1px solid #2a3a4e;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 12px;
}

.rate-select-inline:focus {
  outline: 2px solid var(--accent, #4f8cff);
  outline-offset: 2px;
}

/* Icon buttons */
.icon-btn {
  position: relative;
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a3144;
  background: #182230;
  border-radius: 8px;
  flex: 0 0 auto;
}

.icon-btn .icon {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

.icon-btn:hover {
  background: #203040;
}

.icon-btn:active {
  background: #15222f;
}

.icon-btn.util-btn {
  background: #1d2a38;
}

.icon-btn.util-btn:hover {
  background: #253547;
}

.icon-btn svg {
  stroke: none;
  fill: currentColor;
}

/* Medium icon sizing utility */
.icon-md {
  width: 20px;
  height: 20px;
  display: inline-block;
}

/* Ensure svg inside .icon-md inherits currentColor */
.icon-md svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

@media (max-width: 900px) {
  .vol-slider {
    width: 80px;
  }
}

/* Scrubber overlay at bottom of video */
.video-stage-simple {
  position: relative;
}

.video-stage-simple .timeline-overlay-shell {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 10%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-bar-overlay {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(10, 14, 20, 0.72);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 6px 10px;
}

.player-bar-overlay .spacer {
  flex: 1 1 auto;
}

.player-bar-overlay .time-display {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  opacity: .85;
}

.player-bar-overlay select {
  background: #162131;
  border: 1px solid #2a3a4e;
  padding: 2px 4px;
  border-radius: 6px;
  font-size: 11px;
}

.player-bar-overlay .vol-slider {
  width: 90px;
}

.player-bar-overlay .icon-btn {
  width: 26px;
  height: 26px;
}

.player-bar-overlay .icon-btn .icon {
  width: 14px;
  height: 14px;
}

.timeline-overlay-shell .timeline-flat {
  height: 6px;
  border-radius: 3px;
}

.timeline-overlay-shell .timeline-flat:hover {
  height: 8px;
}

.timeline-overlay-shell .timeline-wrapper {
  pointer-events: auto;
}

/* Info button active state */
#infoToggle.active {
  background: var(--accent, #4f8cff);
  color: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
}

/* Info Drawer */
.info-drawer {
  background: #0b1119;
  border: 1px solid #1e2b3b;
  border-radius: 14px;
  padding: 14px 16px 18px;
  animation: accFade .35s ease;
  box-shadow: 0 6px 28px -8px rgba(0, 0, 0, 0.55);
}

.drawer-inner {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.drawer-heading {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .8px;
  opacity: .7;
  margin: 0 0 6px;
}

.mini-metadata {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.mini-metadata li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  background: #121c29;
  border: 1px solid #1f2b3a;
  border-radius: 6px;
}

.mini-metadata li span:first-child {
  opacity: .65;
}

.artifact-badges-flat {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.artifact-badges-flat .badge-pill,
.artifact-chip.badge-pill {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 20px;
  background: #142031;
  border: 1px solid #223246;
  cursor: pointer;
  line-height: 1.1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.artifact-badges-flat .badge-pill[data-present="1"],
.artifact-chip.badge-pill[data-present="1"] {
  /* Present: green state */
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.45);
  color: #bbf7d0; /* mint text for contrast */
}

/* Missing: red state */
.artifact-chip.badge-pill[data-present="0"] {
  background: rgba(239, 68, 68, 0.18); /* var(--danger) softened */
  border-color: rgba(239, 68, 68, 0.55);
}

/* Loading state spinner for artifact badges */
@keyframes badge-spin {
  to {
    transform: rotate(360deg);
  }
}

.artifact-badges-flat .badge-pill[data-loading="1"],
.artifact-chip.badge-pill[data-loading="1"] {
  position: relative;
  opacity: .75;
  pointer-events: none;
  /* prevent double clicks */
  /* While loading, use neutral pill colors (not red/green) */
  background: #142031;
  border-color: #223246;
  color: inherit;
}

.artifact-badges-flat .badge-pill[data-loading="1"] span[id$="-status"],
.artifact-chip.badge-pill[data-loading="1"] span[id$="-status"],
.artifact-chip.badge-pill[data-loading="1"] .status {
  visibility: hidden;
  /* hide ✓ / ✗ while spinning */
}

.artifact-badges-flat .badge-pill[data-loading="1"]::after,
.artifact-chip.badge-pill[data-loading="1"]::after {
  content: "";
  position: absolute;
  right: 6px;
  width: 12px;
  height: 12px;
  border: 2px solid #4b6b8f;
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: badge-spin .7s linear infinite;
  box-sizing: border-box;
}

.artifact-chip .status {
  width: 1.4em;
  height: 1.4em;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.effects-panel-slim {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  background: #121c29;
  padding: 8px 10px 10px;
  border: 1px solid #1f2b3a;
  border-radius: 8px;
}

/* Add subtle bordered boxes for performers and tags chip groups inside the video sidebar */
.chips-group {
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.02);
}

.chips-group .chips-label {
  margin-bottom: 6px;
  display: block;
  font-weight: 600;
}

.effects-panel-slim label {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.effects-panel-slim input[type=range] {
  flex: 1;
  appearance: none;
  height: 4px;
  background: #243246;
  border-radius: 4px;
}

.effects-panel-slim input[type=range]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent, #4f8cff);
  border: 2px solid #0d121d;
}

/* Hide legacy complex layout elements if still present */
#playerLayout,
#playerSidebar,
.player-overlay,
.controls-overlay,
.timeline-overlay {
  display: none !important;
}

@media (max-width: 860px) {
  .player-bar-simple {
    grid-template-columns: auto auto 1fr auto auto auto auto auto auto;
    gap: 8px;
  }

  .vol-slider {
    width: 90px;
  }
}

@media (max-width: 600px) {
  .player-bar-simple {
    grid-template-columns: auto 1fr auto auto auto auto auto;
  }

  .rate-select-inline,
  #btnSetThumb,
  #btnAddMarker {
    display: none;
  }

  .vol-slider {
    width: 70px;
  }

  .drawer-inner {
    grid-template-columns: 1fr;
  }
}

/* -----------------------------
   Player Tab Modernized Styles
   (migrated from inline styles)
------------------------------*/
.player-layout {
  display: flex;
  gap: 14px;
  align-items: stretch;
  padding: 12px 0 8px;
  min-height: 60vh;
}

.player-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-start;
  min-height: 32px;
}

.player-title {
  font-weight: 600;
  font-size: 18px;
  letter-spacing: .3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Hide player title if empty */
.player-title:empty {
  display: none !important;
}

.player-video {
  position: relative;
  background: #000;
  border: 1px solid #1d2533;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 26px -4px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  flex: 1 1 auto;
  width: 100%;
  max-height: 100%;
  height: auto;
  object-fit: contain;
}

/* Floating overlay title bar */
.player-overlay-bar {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, rgba(22, 30, 44, .72), rgba(15, 22, 32, .58));
  backdrop-filter: blur(8px) saturate(140%);
  padding: 8px 18px 9px;
  border-radius: 46px;
  font-size: 13px;
  line-height: 1.15;
  color: var(--text);
  letter-spacing: .4px;
  box-shadow: 0 4px 22px -8px rgba(0, 0, 0, .72), 0 0 0 1px rgba(255, 255, 255, 0.09) inset, 0 1px 2px rgba(255, 255, 255, 0.06) inset;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 1;
  transition: opacity .4s ease, transform .4s ease;
  z-index: 20;
  pointer-events: none;
  /* non-interactive for now */
}

.player-overlay-bar.fading {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px);
}

/* Suppress initial flash of empty overlay title bar */
.player-overlay-bar[data-empty="1"] {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: none;
}

/* Overlay title text subtle styling */
#playerTitle.player-title {
  font-weight: 500;
  max-width: 48vw;
  text-shadow: 0 2px 4px rgba(0, 0, 0, .6);
  font-family: var(--font-stack, system-ui, sans-serif);
  letter-spacing: .35px;
}

/* Bottom floating scrubber */
.player-scrubber-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  transform: none;
  width: 100%;
  padding: 14px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* background: linear-gradient(to top, rgba(8, 12, 18, .78), rgba(10, 16, 24, .6) 60%, rgba(10, 16, 24, 0)); */
  backdrop-filter: blur(3px);
  border-radius: 0;
  font-size: 12px;
  color: var(--text-alt, #d7dde5);
  z-index: 22;
  opacity: 1;
  transition: opacity .45s ease, transform .45s ease;
  pointer-events: auto;
  /* interactive now */
}

.player-scrubber-bar.fading {
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
}

/* Scrubber inline action buttons (Add Marker / Set Thumbnail) */
.scrubber-actions-row .btn.btn-xs {
  background: #1a2735;
  border: 1px solid #2b3d52;
  color: #d5e2f2;
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.1;
  border-radius: 4px;
  cursor: pointer;
}

.scrubber-actions-row .btn.btn-xs:hover {
  background: #223345;
  border-color: #38516b;
}

.scrubber-actions-row {
  font-size: 11px;
}

/* Inline time + action buttons */
.scrubber-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  margin-top: 6px;
  width: 100%;
}

#playerControls.scrubber-status-row {
  flex-wrap: nowrap;
  align-items: center;
  gap: 18px;
  margin-top: 0;
}

/* Reusable control icon class */
.control-icon {
  width: 22px;
  height: 22px;
  display: block;
  flex: 0 0 auto;
}

/* Utility classes (extracted from previous inline styles) */
.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.gap-16 {
  gap: 16px;
}

.gap-8 {
  gap: 8px;
}

.gap-6 {
  gap: 6px;
}

.mb-12 {
  margin-bottom: 12px;
}

.mb-8 {
  margin-bottom: 8px;
}

.mt-6 {
  margin-top: 6px;
}

.mt-8 {
  margin-top: 8px;
}

.mt-0 {
  margin-top: 0 !important;
}

.m0 {
  margin: 0 !important;
}

.opacity-75 {
  opacity: .75;
}

.line-13 {
  line-height: 1.3;
}

.max-w-640 {
  max-width: 640px;
}

.flex-2 {
  flex: 2;
}

.gap-x-8 {
  column-gap: 8px;
}

#perfAutoMatchTable th:first-child {
  width: 55%;
}

.markers-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: nowrap;
}

#spritePreview {
  position: absolute;
  display: none;
  background-repeat: no-repeat;
  background-color: rgba(0, 0, 0, .55);
  border: 1px solid rgba(255, 255, 255, .2);
  box-shadow: 0 4px 14px -4px rgba(0, 0, 0, .7), 0 0 0 1px rgba(255, 255, 255, .08) inset;
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(4px) saturate(140%);
}


/* Legacy filter restoration */
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  background: #1e2c3a;
  color: #d3e0eb;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #2f4156;
}

.filter-chip button {
  background: transparent;
  border: none;
  color: #9fb4c9;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.filter-chip button:hover {
  color: #fff;
}

/* File Info two-column list */
.file-info-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  padding: 4px 2px 2px;
}

.file-info-grid .fi-row {
  display: grid;
  grid-template-columns: 124px 1fr;
  gap: 0;
  align-items: stretch;
  min-height: 22px;
}

.file-info-grid .fi-label {
  font-weight: 600;
  letter-spacing: .25px;
  color: #9fb4c9;
  text-align: right;
  padding: 2px 8px 2px 8px;
  background: linear-gradient(to right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.file-info-grid .fi-row:nth-child(odd) .fi-label {
  background: linear-gradient(to right, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
}

.file-info-grid .fi-value {
  color: #e1e8f0;
  font-variant-numeric: tabular-nums;
}

.file-info-grid .fi-value.break {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.file-info-grid .fi-row:nth-child(odd) {
  background: rgba(255, 255, 255, 0.018);
}

.file-info-grid .fi-value {
  padding: 2px 6px;
  display: flex;
  align-items: center;
}

.file-info-grid .fi-value.break {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.file-info-grid .fi-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Inline rename state */
.file-info-grid .fi-value.renaming {
  opacity: .75;
}

.fi-rename-input {
  font-size: 12px;
}

.fi-rename-input {
  width: 100%;
  box-sizing: border-box;
}

.fi-rename-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(79, 140, 255, .35);
  border-color: var(--accent);
}

/* Video metadata chips (performers & tags) */
.video-metadata-chips {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.video-metadata-chips .chips-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.video-metadata-chips .chips-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .75px;
  color: #9fb4c9;
}

/* Align rating stars and favorite toggle inline */
#videoRatingGroup .rating-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

#videoRatingGroup .rating-row .rating-stars {
  flex: 1 1 auto;
}

#videoRatingGroup .rating-row .favorite-toggle {
  flex: 0 0 auto;
}

.video-metadata-chips .chips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 30px;
  padding: 4px 0;
}

.video-metadata-chips .chip {
  background: #223042;
  border: 1px solid #314355;
  color: #e2e9f3;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px 6px 10px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  position: relative;
}

.video-metadata-chips .chip:hover {
  background: #2b3e54;
  border-color: #3d5166;
}

.video-metadata-chips .chip:active {
  background: #1c2835;
}

.video-metadata-chips .chip .chip-remove {
  font-size: 14px;
  line-height: 1;
  opacity: .7;
}

.video-metadata-chips .chip:hover .chip-remove {
  opacity: 1;
}

.video-metadata-chips .chips-input {
  background: #151d27;
  border: 1px dashed #334457;
  color: var(--text);
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  min-width: 140px;
  max-width: 100%;
  outline: none;
}

.video-metadata-chips .chips-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, .28);
}

.video-metadata-chips .chips-hint {
  font-size: 11px;
}

/* Favorite toggle */
.favorite-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: #e2e9f3; /* visible outline (off) on dark bg */
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.favorite-toggle:focus-visible {
  outline: 2px solid #3e5670;
  outline-offset: 2px;
  border-radius: 4px;
}
.favorite-toggle[aria-pressed="true"] { color: #fff; }
.favorite-toggle .icon-filled { display: none; }
.favorite-toggle[aria-pressed="true"] .icon-filled { display: inline; }
.favorite-toggle[aria-pressed="true"] .icon-outline { display: none; }

/* Rating stars (SVG outline/filled) */
.rating-stars {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  line-height: 1;
}

.rating-stars .star {
  background: transparent;
  border: none;
  color: #fff; /* outline (off) same color as filled */
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  line-height: 1;
  transition: color .12s ease, transform .12s ease;
  user-select: none;
}

.rating-stars .star[aria-checked="true"],
.rating-stars .star.active {
  color: #fff; /* filled (on) */
}

.rating-stars .star:hover {
  transform: translateY(-1px) scale(1.08);
  /* keep color */
}

.rating-stars .star:active {
  transform: scale(0.96);
}

.rating-stars .star:focus-visible {
  outline: 2px solid #3e5670;
  outline-offset: 2px;
  border-radius: 4px;
}

.rating-stars .star svg { width: 20px; height: 20px; }
.rating-stars .star .icon-filled { display: none; }
.rating-stars .star.active .icon-filled,
.rating-stars .star[aria-checked="true"] .icon-filled { display: inline; }
.rating-stars .star.active .icon-outline,
.rating-stars .star[aria-checked="true"] .icon-outline { display: none; }

/* Description */
.desc-input {
  width: 100%;
  min-height: 32px;
  color: var(--text);
  /* Read-only appearance: plain text */
  background: transparent;
  border: 0;
  padding: 0;
  border-radius: 0;
  font-size: 12px;
  line-height: 1.35;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.desc-input:empty:before {
  content: attr(data-placeholder);
  color: #9fb4c9;
  opacity: 0.6;
}

/* Also show placeholder when element contains only whitespace (we set a single space for click target) */
.desc-input[data-empty="1"]::before {
  content: attr(data-placeholder);
  color: #9fb4c9;
  opacity: 0.6;
}

.desc-input[contenteditable="false"] {
  cursor: text;
  background: transparent;
  border: 0;
  opacity: 1;
}

.desc-input[contenteditable="true"] {
  background: #1a2735;
  border: 1px solid #2b3d52;
  border-radius: 8px;
  padding: 8px 10px;
}

.desc-input[contenteditable="true"]:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 140, 255, .28);
}

.file-info-grid .fi-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.scrubber-track {
  position: relative;
  height: 22px; /* thicker to accommodate heatmap */
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.1));
  overflow: hidden;
  cursor: pointer;
}

/* Legacy markers layer (tick overlay) */
#timelineMarkers.timeline-markers-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

#timelineMarkers.timeline-markers-layer .marker-tick {
  position: absolute;
  top: 0;
  width: 4px;
  height: 100%;
  background: rgba(255, 255, 255, 0.75);
  mix-blend-mode: screen;
}

#timelineMarkers.timeline-markers-layer .intro-marker-tick {
  position: absolute;
  top: 0;
  width: 6px;
  height: 100%;
  background: linear-gradient(180deg, #ffb000, #ff7a00);
  box-shadow: 0 0 6px rgba(255, 122, 0, 0.6);
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  mix-blend-mode: normal;
}

/* Detached heatmap band above scrubber */
/* Heatmap now overlays directly atop scrubber track (no vertical offset).
  Keep the track positioned for the absolute children while leaving the
  scrubber bar free to remain absolutely positioned over the video. */
.scrubber-track { position: relative; }
.scrubber-heatmap-band {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  height: 100%;
  border-radius: 0;
  background: none;
  overflow: hidden;
  pointer-events: none; /* allow direct scrubbing without interference */
  display: block;
}

.scrubber-heatmap-band.hidden {
  display: none !important;
}

.scrubber-heatmap-band .timeline-heatmap,
.scrubber-heatmap-band .timeline-heatmap-canvas { position: absolute; inset: 0; }

.scrubber-heatmap-band .timeline-heatmap { mix-blend-mode: soft-light; opacity: .65; }

.scrubber-heatmap-band .timeline-heatmap-canvas { opacity: .75; }

/* Markers list */
.markers-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

/* Default: allow the markers list to grow naturally (no internal scroll) so
   the page will only scroll if the overall accordion doesn't fill available
   space. When the accordion fills the sidebar, JS will add
   `.accordion--fills` to the accordion and the markers list becomes
   constrained and scrollable. */
.markers-list {
  max-height: none;
  overflow-y: visible;
  padding-right: 4px;
  overscroll-behavior: contain;
}

/* When the accordion fills the sidebar, enable internal scrolling for
   the markers list and cap its height to the available space. JS will also
   set an inline max-height for pixel-perfect sizing, but this rule acts as
   a graceful fallback. */
.player-split .player-sidebar .accordion.accordion--fills .markers-list {
  max-height: calc(100% - 120px);
  /* fallback estimate */
  overflow-y: auto;
  padding-right: 8px;
  /* space for scrollbar */
}

/* Thin scrollbar styling (WebKit) */
.markers-list::-webkit-scrollbar {
  width: 8px;
}

.markers-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.markers-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 4px;
}

.markers-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.32);
}

.marker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #121c29;
  border: 1px solid #1e2b3a;
  padding: 4px 6px;
  border-radius: 6px;
}

.marker-row:hover {
  border-color: #2f4760;
  background: #162435;
}

.marker-row button.marker-remove {
  background: none;
  border: none;
  color: #c74f4f;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}

.marker-row button.marker-remove:hover {
  color: #ff6b6b;
}

.marker-time-input {
  width: 84px;
  font-family: monospace;
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid #2a3a50;
  background: #0f1621;
  color: #d9e2ec;
  border-radius: 4px;
}

.marker-time-input:focus {
  outline: 1px solid #4f8cff;
  border-color: #4f8cff;
}

.marker-jump {
  background: #203246;
  border: 1px solid #31465e;
  color: #d5e2f2;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.marker-jump:hover {
  background: #2a3e58;
}

.marker-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #d5e2f2;
  line-height: 1;
}

.marker-btn-icon svg {
  display: block;
  pointer-events: none;
}

.marker-btn-icon.marker-jump {
  background: #203246;
  border-color: #31465e;
}

.marker-btn-icon.marker-jump:hover {
  background: #2a3e58;
}

.marker-btn-icon.marker-remove {
  background: none;
  border: none;
  color: #c74f4f;
}

.marker-btn-icon.marker-remove:hover {
  color: #ff6b6b;
}

.markers-empty {
  font-size: 12px;
  opacity: .6;
  padding: 4px 2px;
}

.marker-row--intro {
  background: linear-gradient(90deg, rgba(255, 186, 0, 0.07), rgba(255, 122, 0, 0.04));
  border-left: 4px solid #ff9800;
  padding-left: 8px;
  order: 0;
  /* keep intro markers in normal flow */
}

.marker-row--intro .marker-jump {
  background: rgba(255, 160, 40, 0.12);
  border: 1px solid rgba(255, 160, 40, 0.18);
}

/* Outro (outro-begin) marker: visually distinct and pinned to bottom of list */
.marker-row--outro {
  background: linear-gradient(90deg, rgba(0, 186, 255, 0.07), rgba(0, 122, 255, 0.04));
  border-left: 4px solid #0098ff;
  padding-left: 8px;
  order: 999;
  /* show at bottom of the flex column */
}

.marker-row--outro .marker-jump {
  background: rgba(0, 160, 255, 0.12);
  border: 1px solid rgba(0, 160, 255, 0.18);
}

/* Outro begin marker tick (timeline tick) */
.outro-marker-tick {
  position: absolute;
  top: 0;
  width: 6px;
  height: 100%;
  background: linear-gradient(180deg, #00b0ff, #007aff);
  box-shadow: 0 0 6px rgba(0, 122, 255, 0.6);
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  mix-blend-mode: normal;
}

.scrubber-track:hover .scrubber-progress {
  filter: brightness(1.15);
}

.scrubber-track:hover .scrubber-handle {
  transform: translate(-50%, -50%) scale(1);
  opacity: 1;
}

.scrubber-buffer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255, 255, 255, .28);
  width: 0%;
  transition: width .25s linear;
  opacity: .4;
}

.scrubber-progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0%;
  background: linear-gradient(90deg, #3daaf9, #6679ff 45%, #9a6bff);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .15) inset, 0 1px 2px rgba(0, 0, 0, .45);
  transition: width .08s linear;
}

.scrubber-handle {
  position: absolute;
  top: 50%;
  left: 0%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fff, #d5e2ff);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .5), 0 0 0 2px rgba(0, 0, 0, .4), 0 0 0 1px rgba(255, 255, 255, .3) inset;
  transform: translate(-50%, -50%) scale(.65);
  opacity: 0;
  transition: .18s ease;
  pointer-events: none;
}

.player-scrubber-bar:hover .scrubber-handle {
  opacity: 1;
}

/* Marker ticks */
.scrubber-markers {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  right: 0;
  pointer-events: none;
  mix-blend-mode: screen;
}

.scrubber-markers span {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, .85), rgba(255, 255, 255, .15));
  opacity: .55;
}

.scrubber-markers .intro-scrubber-marker {
  width: 4px;
  background: linear-gradient(180deg, #ffb000, #ff7a00);
  box-shadow: 0 0 6px rgba(255, 122, 0, 0.6);
  border-radius: 2px;
  opacity: 1;
}

/* Integrated heatmap inside scrubber track */
.scrubber-track .timeline-heatmap,
.scrubber-track .timeline-heatmap-canvas {
  pointer-events: none;
}

.scrubber-track .timeline-heatmap {
  mix-blend-mode: soft-light;
  opacity: .75;
}

.scrubber-track .timeline-heatmap-canvas {
  opacity: .85;
}

.scrubber-time {
  font-variant-numeric: tabular-nums;
  letter-spacing: .4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .7);
  font-weight: 500;
}

@media (max-width: 900px) {
  .player-scrubber-bar {
    padding: 12px 16px 16px;
  }

  #playerTitle.player-title {
    max-width: 60vw;
  }
}

@media (max-width: 640px) {
  .player-scrubber-bar {
    padding: 10px 12px 14px;
  }

  #playerTitle.player-title {
    max-width: 70vw;
    font-size: 12px;
  }
}

.player-main {
  position: relative;
}

.video-stage {
  position: relative;
  display: block;
  width: 100%;
  background: #000;
}

.video-el {
  display: block;
  width: 100%;
  height: calc(100vh - var(--header-h));
  max-height: calc(100vh - var(--header-h));
  background: #000;
  aspect-ratio: 16/9;
  object-fit: contain;
}

/* Overlay */
.player-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
}

.player-overlay .overlay-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  animation: accFade .25s ease;
}

.timeline-overlay {
  position: relative;
  height: 13px;
  border-radius: 4px;
  background: rgba(12, 18, 30, 0.55);
  backdrop-filter: blur(2px);
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.timeline-overlay:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.timeline-heatmap,
.timeline-heatmap-canvas,
.timeline-progress,
.timeline-markers {
  position: absolute;
  inset: 0;
}

.timeline-heatmap {
  background-position: left center;
  background-size: 100% 100%;
  opacity: .85;
  mix-blend-mode: soft-light;
}

.timeline-heatmap-canvas {
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: .95;
}

.timeline-progress {
  width: 0%;
  background: linear-gradient(90deg, rgba(79, 140, 255, 0.65), rgba(79, 140, 255, 0.25));
  mix-blend-mode: screen;
  transition: width .12s linear;
}

.timeline-markers {
  pointer-events: none;
}

.controls-overlay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: rgba(14, 19, 30, 0.74);
  backdrop-filter: blur(3px) saturate(130%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 7px;
  padding: 3px 7px;
  box-shadow: 0 3px 14px -3px rgba(0, 0, 0, 0.6);
  flex-wrap: wrap;
  min-height: 30px;
  font-size: 12px;
}

.controls-overlay:hover {
  background: rgba(18, 24, 36, 0.84);
}

.controls-overlay .btn-sm {
  --accent: #4f8cff;
}

.time-display {
  font-size: 12px;
  color: var(--muted, #94a2c7);
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.player-controls {
  display: flex;
  width: 100%;
}

/* (Removed nested .player-controls volume styling in favor of global .vol-slider rules above) */

/* Video adjustment panel */
.video-adjustments {
  padding: 4px 2px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.video-adjustments .adj-row {
  display: grid;
  grid-template-columns: 88px 1fr 52px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.video-adjustments .adj-row label {
  font-weight: 500;
  color: var(--fg-600, #ccd2e0);
}

.video-adjustments .adj-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--fg-500, #b5bccb);
}

.video-adjustments .adj-actions {
  display: flex;
  justify-content: flex-end;
}

.video-adjustments .adj-slider {
  width: 100%;
}

/* Updated thumbnail flash */
.thumbnail-updated {
  outline: 2px solid var(--accent, #4f8cff);
  outline-offset: 2px;
  transition: outline-color .6s ease;
}

.thumbnail-updated {
  animation: thumbnailFlash 1.2s ease 1;
}

@keyframes thumbnailFlash {
  0% {
    outline-color: var(--accent, #4f8cff);
  }

  70% {
    outline-color: rgba(79, 140, 255, 0);
  }

  100% {
    outline-color: rgba(79, 140, 255, 0);
  }
}

/* Sidebar thumbnail updating shimmer */
#fiThumbnail._updating {
  position: relative;
}

#fiThumbnail._updating::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.15) 20%, rgba(255, 255, 255, 0.05) 40%);
  animation: thumbShimmer 1s linear infinite;
  mix-blend-mode: overlay;
}

@keyframes thumbShimmer {
  from {
    background-position: -200% 0;
  }

  to {
    background-position: 200% 0;
  }
}


/* Sidebar File Info thumbnail */
.thumbnail-wrap {
  position: relative;
  aspect-ratio: 16/9;
  /* Reserve stable space immediately to avoid card height collapse */
  background: #0e0f14;
  overflow: hidden;
}

/* Image & placeholder layered absolutely so placeholder no longer influences layout */
.thumbnail-wrap>.thumbnail-img,
.thumbnail-wrap>.thumbnail-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.thumbnail-img {
  aspect-ratio: 16/9;
  /* Keep for legacy (dir cards without wrap) */
  width: 100%;
  display: block;
  background: #0e0f14;
  object-fit: cover;
  opacity: 0;
  /* Fade in when loaded */
  transition: opacity .28s ease;
}

.card.loaded .thumbnail-wrap>.thumbnail-img {
  opacity: 1;
}

/* Placeholder now overlays; fade it out after image load */
.thumbnail-wrap>.thumbnail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity .28s ease;
  color: #2f3749;
  fill: currentColor;
}

.card.loaded .thumbnail-wrap>.thumbnail-placeholder {
  opacity: 0;
  pointer-events: none;
}

.fi-thumbnail-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity .25s ease;
}

.fi-thumbnail-box img._updating {
  opacity: .35;
}

.fi-thumbnail-set {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, .55);
  backdrop-filter: blur(3px);
  border: 1px solid rgba(255, 255, 255, .18);
  padding: 2px 6px;
  line-height: 1;
  font-size: 11px;
}

.fi-thumbnail-set:hover {
  background: rgba(0, 0, 0, .7);
}

.rate-select-wrap {
  min-width: 78px;
}

.utility-buttons {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
}

.utility-buttons .btn-sm {
  background: #1d2a3d;
}

.utility-buttons .btn-sm:hover {
  background: #233348;
}

.sprite-preview {
  position: absolute;
  left: 8px;
  width: 240px;
  height: 135px;
  background: #111 center/cover no-repeat;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  display: none;
  pointer-events: none;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
  z-index: 6;
  opacity: 0.95;
}

/* Compact adjustments when sidebar collapsed */
#playerLayout[data-sidebar-collapsed="true"] .player-overlay {
  padding-bottom: 4px;
}

/* Responsive tweaks */
/* Keep sidebar on the left;
on narrower screens shrink width instead of stacking */

/* === Viewport-Fit Player (no scroll) === */

/* (Removed duplicate #player-panel height block;
earlier flex rule governs layout now) */

#player-panel .player-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

#player-panel .player-stage-simple {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  min-height: 0;
  /* allow flex child (video) to size fully */
}

/* Panel-specific .video-el override removed: unified calc-based height applies */

@media (max-height: 760px) {

  /* Tighten spacing on shorter viewports */
  #player-panel .player-shell {
    gap: 6px;
    padding: 2px 6px 8px;
  }

  #player-panel .player-stage-simple {
    padding: 4px;
  }

  .player-stage-simple .video-el {
    border-radius: 8px;
  }

  #player-panel .player-bar-simple {
    padding: 8px 10px;
  }
}

@media (max-height: 560px) {

  /* Compress controls further and shrink fonts */
  #player-panel .player-bar-simple {
    padding: 6px 8px;
    gap: 6px;
    font-size: 11px;
  }

  #player-panel .player-bar-simple button.btn-sm {
    padding: 4px 6px;
    font-size: 11px;
  }

  #player-panel .player-bar-simple .time-display {
    font-size: 11px;
  }

  .vol-slider {
    width: 90px;
  }
}

@media (max-width: 760px) {
  .player-layout {
    gap: 10px;
  }

  .player-video {
    border-radius: 10px;
  }
}

@media (max-width: 1024px) {
  #playerControls.player-controls {
    padding: 10px 14px;
    gap: 12px;
  }

  #playerControls .player-control-cluster.cluster-transport,
  #playerControls .player-control-cluster.cluster-audio {
    flex: 1 1 100%;
    min-width: 0;
  }

  #playerControls .player-control-cluster {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .player-overlay {
    padding: 10px 6px 4px;
  }

  #playerControls.player-controls {
    padding: 10px;
    border-radius: 14px;
    gap: 10px;
  }

  #playerControls .player-controls-groups {
    gap: 10px;
    grid-template-columns: 1fr;
  }

  #playerControls .player-control-cluster {
    width: 100%;
  }

  #playerControls .player-control-cluster.cluster-navigate {
    flex: 0 0 auto;
  }

  #playerControls .player-volume {
    min-width: 0;
  }

  #playerControls .player-volume .vol-slider {
    width: clamp(96px, 50vw, 130px);
  }

  #playerControls .btn.btn-xs {
    flex: 1 1 auto;
    min-width: 0;
  }

  .player-title {
    font-size: 16px;
  }

  .controls-overlay {
    padding: 2px 6px;
    gap: 4px;
  }
}

/* Fullscreen refinements */
:fullscreen .player-video,
.player-video:fullscreen {
  border-radius: 0;
  max-height: 100vh;
}

:fullscreen .player-overlay {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
}

/* High contrast / prefers-reduced-motion adjustments */
@media (prefers-reduced-motion: reduce) {
  .timeline-progress {
    transition: none;
  }

  .player-overlay .overlay-inner {
    animation: none;
  }
}

@media (forced-colors: active) {
  .controls-overlay {
    border: 1px solid CanvasText;
  }

  .timeline-overlay {
    border: 1px solid CanvasText;
  }
}

/* Toast / notification system */
#toastHost {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1000;
  pointer-events: none;
  /* clicks pass through when between toasts */
}

/* Destructive / danger button variant (used for Clear All) */
.btn-danger,
.btn.btn-danger,
button.btn-danger {
  background: linear-gradient(135deg, #b91c1c, #dc2626);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 4px -2px rgba(0, 0, 0, 0.5);
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626, #ef4444);
}

.btn-danger:active {
  background: #991b1b;
}

.btn-danger:disabled {
  opacity: .55;
  cursor: not-allowed;
}

/* Capability banner extracted from inline style */
.capability-banner {
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: #221b12;
  color: #f7d382;
  font-size: 13px;
  line-height: 1.4;
}

.toast {
  font-size: 13px;
  line-height: 1.3;
  background: #4f8cff;
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.4);
  animation: toastIn 0.32s ease;
  position: relative;
  pointer-events: auto;
  /* allow hover for potential future actions */
  max-width: 320px;
}

.toast.is-success {
  background: #22c55e;
}

.toast.is-error {
  background: #ef4444;
}

.toast.is-info {
  background: #4f8cff;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toast.fade-out {
  opacity: 0;
  transition: opacity .25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}

/* 18. Registry & Auto-Tag (appended) */
.registry-flex {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-top: 8px;
}

.registry-column {
  flex: 1 1 340px;
  min-width: 300px;
  background: #1b1f28;
  border: 1px solid #273140;
  padding: 12px;
  border-radius: 10px;
  box-shadow: 0 2px 6px -2px rgba(0, 0, 0, .55);
}

.registry-column h3 {
  margin: 0 0 6px;
  font-size: 15px;
  letter-spacing: .3px;
}

.registry-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.registry-list {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #273140;
  border-radius: 6px;
  background: #141a22;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.registry-item {
  padding: 6px 8px;
  border: 1px solid #273140;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  background: #1d2530;
  cursor: pointer;
  line-height: 1.2;
}

.registry-item[data-selected="1"] {
  background: #20344e;
  border-color: #335a8a;
}

.registry-item .ri-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.registry-item .ri-count {
  opacity: .55;
  font-size: 11px;
}

.autotag-table {
  width: 100%;
  border-collapse: collapse;
}

.autotag-table th,
.autotag-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #1f2833;
  font-size: 12px;
  vertical-align: top;
  text-align: left;
}

.autotag-table thead th {
  background: #18202a;
  position: sticky;
  top: 0;
  z-index: 1;
}

.autotag-table tbody tr:hover {
  background: #1b2736;
}

.w-240 {
  width: 240px;
}

.w-200 {
  width: 200px;
}

/* Accordion animations: use max-height + opacity for a reliable, CSS-only transition
   that doesn't require JS-driven measurements. We toggle the `.open` class on the
   .acc-item and .acc-panel to animate. Keep `.hidden` as a graceful no-JS fallback. */
.accordion .acc-panel {
  max-height: 0;
  /* collapsed */
  overflow: hidden;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  transition: max-height 260ms cubic-bezier(.2, .9, .2, 1), opacity 180ms ease, padding 200ms ease;
}

.accordion .acc-panel.open {
  /* large enough to cover most content;
  using max-height avoids layout thrashing */
  max-height: 2000px;
  opacity: 1;
  padding-top: 10px;
  padding-bottom: 10px;
}

/* When JS is disabled we still support hiding via `.hidden` */
.accordion .acc-panel.hidden {
  display: none !important;
}

/* Header caret rotation: rotate when the item is open or when aria-expanded is true */
.accordion .acc-header .acc-header__icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  vertical-align: middle;
  transition: transform 220ms ease, opacity 150ms ease;
  color: inherit;
  /* default: point right (icon originally points left in the sprite) */
  transform: rotate(180deg);
}

.accordion .acc-header .acc-header__icon use,
.accordion .acc-header .acc-header__icon path {
  fill: currentColor;
}

/* rotate the svg caret when open/expanded */
.acc-item.open .acc-header .acc-header__icon,
.acc-header[aria-expanded="true"] .acc-header__icon {
  /* open: point down */
  transform: rotate(270deg);
}

/* ===== Settings: JSON panels (health/config) ===== */
.settings-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.json-pre {
  background: #0b0e18;
  color: #e6ebff;
  border: 1px solid #2a2e3a;
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
}

/* =============================================================
   Fire TV / Android TV Mode Overrides
   ============================================================= */

/* Fire TV mode only active when .firetv class is present on html/documentElement */
.firetv {
  /* Remove fine hover interactions that don't work with remote */
  --transition-quick: none;
  --transition-med: none;
}

/* Larger grid tiles for better remote navigation */
.firetv .grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

/* Larger, more visible focus indicators */
.firetv .grid .card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.firetv .grid .card:focus {
  outline: 4px solid var(--accent);
  outline-offset: 4px;
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(79, 140, 255, 0.3);
  z-index: 10;
  position: relative;
}

/* Larger buttons and controls */
.firetv .btn {
  min-height: 48px;
  padding: 12px 20px;
  font-size: 16px;
}

.firetv .search-input {
  height: 48px;
  font-size: 16px;
  padding: 0 16px;
}

/* Header auto-hide preparation */
.firetv header {
  transition: transform 0.3s ease;
}

.firetv header.hidden {
  transform: translateY(-100%);
}

/* Ensure content doesn't jump when header hides */
/* Optional: if main needs to adjust when header hides */
.firetv main { transition: padding-top 0.3s ease; }
.firetv header.hidden + main { padding-top: 0; }

/* Better contrast for text on TV screens */
.firetv {
  --text: #ffffff;
  --muted: #b8c5e0;
}

/* Remove hover states that don't apply to remote control */
.firetv .card:hover,
.firetv .btn:hover {
  transform: none;
  box-shadow: none;
}

/* Global link style: inherit color and remove underline for cleaner tile/title links */
a,
a:visited {
  color: inherit;
  text-decoration: none;
}
a:hover,
a:focus {
  text-decoration: none;
}

/* Focus-visible only for actual focus (not hover) */
.firetv .card:focus-visible {
  outline: 4px solid var(--accent);
  outline-offset: 4px;
  transform: scale(1.05);
  box-shadow: 0 8px 25px rgba(79, 140, 255, 0.3);
}

/* =============================
   Performers Graph (Cytoscape)
   ============================= */
#graph-panel {
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow children to size within flex */
}
.graph-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
}
.graph-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
#cyContainer {  position: relative;  flex: 1 1 auto;  min-height: 320px; }
#cyGraph { position: absolute; inset: 0; }
.graph-controls input[type="range"] { width: 140px; }
#graphTooltip { position: fixed; z-index: 9999; background: rgba(10,12,18,0.96); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 8px; box-shadow: 0 8px 22px rgba(0,0,0,.45); max-width: 400px; }
#graphTooltip .gt-title { font-weight: 600; margin-bottom: 6px; font-size: 12px; }
#graphTooltip .gt-list { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
#graphTooltip .gt-item { display: block; text-decoration: none; color: inherit; font-size: 11px; }
#graphTooltip .gt-item div { margin-top: 3px; line-height: 1.2; word-break: break-word; }
#graphTooltip img { width: 100%; height: 60px; object-fit: cover; border-radius: 4px; background: #111a28; }
#cyContainer {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
}
#cyGraph {
  position: absolute;
  inset: 0;
}
#graphTooltip {
  position: fixed;
  z-index: 9999;
  background: rgba(10,12,18,0.96);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--text);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  max-width: 420px;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
}
#graphTooltip .gt-title {
  font-weight: 600;
  margin-bottom: 6px;
}
#graphTooltip .gt-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
#graphTooltip .gt-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
#graphTooltip .gt-item img {
  width: 100%;
  height: auto;
  border-radius: 6px;
  display: block;
}
.cy-panzoom {
  /* Slightly raise panzoom above graph so it's always clickable */
  z-index: 10;
}

/* =============================
   Connections (Cytoscape)
   ============================= */
#connections-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.graph-panel--connections {
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}
#connectionsCyContainer {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
}
.graph-panel--connections #connectionsCyContainer {
  order: 1;
}
#cyConnections {
  position: absolute;
  inset: 0;
}

.graph-controls--connections {
  gap: 16px;
}
.graph-panel--connections .graph-controls--connections {
  order: 2;
  flex: 0 0 260px;
  flex-direction: column;
  align-items: stretch;
  padding: 16px;
  border-bottom: 0;
  border-left: 1px solid rgba(255,255,255,0.08);
  background: var(--panel);
}
.graph-panel--connections .graph-controls--connections input[type="range"] {
  width: 100%;
}
.graph-panel--connections .graph-controls--connections .connections-actions {
  margin-top: auto;
  padding-top: 8px;
}
.graph-panel--connections .graph-controls--connections label {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.graph-panel--connections .graph-controls--connections .connections-toggle {
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.connections-range-value {
  font-size: 11px;
  color: var(--muted, rgba(226,232,255,0.7));
}
.connections-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.connections-actions button {
  flex: 1;
}

.connections-control .connections-label-text {
  flex: 1 1 auto;
  min-width: 120px;
}

.connections-range-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 220px;
  min-width: 200px;
}

.connections-range-wrap input[type="range"] {
  flex: 1 1 auto;
  width: auto;
}

.connections-range-wrap .connections-range-value {
  flex: 0 0 auto;
}

@media (max-width: 900px) {
  .graph-panel--connections {
    flex-direction: column;
  }
  .graph-panel--connections .graph-controls--connections {
    order: 1;
    flex: 0 0 auto;
    border-left: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .graph-panel--connections #connectionsCyContainer {
    order: 2;
  }
}

.graph-controls--connections strong {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(226, 232, 255, 0.85);
  display: block;
  margin-bottom: 4px;
}

.connections-controls-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.connections-controls-header strong {
  display: inline-flex;
  margin-bottom: 0;
}

.connections-status {
  margin-left: auto;
  color: var(--muted, rgba(226,232,255,0.7));
  font-size: 12px;
}

.connections-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.connections-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ,
    "tags": []
  },
  "Steamy Threeway Fuck for Tattooed Guys.mp4": {
    "mtime": 1764960944102620913,
    "performers": [],
    "tags": []
  },
  "Stepdad Boyfriend Home Security.mp4": {
    "mtime": 1764960919879160568,
    "performers": [],
    "tags": []
  },
  "Stepdad Watches Stepson Jerk Off Seduces in Shower feat Tristan Hunter Drew Sebastian.mp4": {
    "mtime": 1764960921379126974,
    "performers": [],
    "tags": []
  },
  "Stepdad and Boy Flip Fuck Bareback.mp4": {
    "mtime": 1764960920175153937,
    "performers": [],
    "tags": []
  },
  "Stepdad's Weekend American Daddy.mp4": {
    "mtime": 1764960929166952932,
    "performers": [],
    "tags": []
  },
  "Stepdaddies feat Paul Carrigan Condom.mp4": {
    "mtime": 1764960929786939104,
    "performers": [
      "Paul Carrigan"
    ],
    "tags": []
  },
  "Stepfather Barebacks Stepson feat Lito Cruz.mp4": {
    "mtime": 1764960930550922071,
    "performers": [
      "Lito Cruz"
    ],
    "tags": []
  },
  "Stepfather What Do You Have Under Your Pants Is Hard and Very Big.mp4": {
    "mtime": 1764960935830804512,
    "performers": [],
    "tags": []
  },
  "Stephen Raw Riley Mitchell.mp4": {
    "mtime": 1764960931570899338,
    "performers": [],
    "tags": []
  },
  "Stepson Blows Dad's Boyfriend and Gets Caught.mp4": {
    "mtime": 1764960935930802288,
    "performers": [],
    "tags": []
  },
  "Stepson Catches Gay Stepfather Checking Him Out and Fucks.mp4": {
    "mtime": 1764960941410680587,
    "performers": [],
    "tags": []
  },
  "Stepson Makes the Rules Nick Fitt Killian Knox.mp4": {
    "mtime": 1764960937414769301,
    "performers": [
      "Killian Knox",
      "Nick Fitt"
    ],
    "tags": []
  },
  "Stepson Showing Appreciation and Love to His Sexy Scruffy Daddy Joey Doves.mp4": {
    "mtime": 1764960946342571317,
    "performers": [
      "Joey Doves"
    ],
    "tags": []
  },
  "Stepson Stumbles Upon His Stepdad Jerking Off He Then Offers Him Body to Play.mp4": {
    "mtime": 1764960945862581940,
    "performers": [],
    "tags": []
  },
  "Steve Arcturus Brody Meyer and Greg Dixxon Muscle Daddies Threeway Bareback.mp4": {
    "mtime": 1764960948450524688,
    "performers": [
      "Greg Dixxon",
      "Brody Meyer",
      "Steve Arcturus"
    ],
    "tags": []
  },
  "Steve Arcturus and Brody Meyer.mp4": {
    "mtime": 1764960946742562465,
    "performers": [
      "Steve Arcturus",
      "Brody Meyer"
    ],
    "tags": []
  },
  "Steve Arcturus and Greg Dixxon.mp4": {
    "mtime": 1764960963250198561,
    "performers": [
      "Greg Dixxon",
      "Steve Arcturus"
    ],
    "tags": []
  },
  "Steve Arcturus and Kev Inspiring.mp4": {
    "mtime": 1764960963974182662,
    "performers": [
      "Kev Inspiring",
      "Steve Arcturus"
    ],
    "tags": []
  },
  "Steve Sommers Flip Fucks with Inked Stud After Blowjob.mp4": {
    "mtime": 1764960949554500286,
    "performers": [],
    "tags": []
  },
  "Straight Big Mike Getting Blowjob and Jacked Off American Amateur.mp4": {
    "mtime": 1764960950502479341,
    "performers": [
      "Big Mike"
    ],
    "tags": []
  },
  "Straight Boys Flip Fuck.mp4": {
    "mtime": 1764960965514148863,
    "performers": [],
    "tags": []
  },
  "Straight Hunk Catches Coworker Sniffing His Underwear.mp4": {
    "mtime": 1764960966098136051,
    "performers": [],
    "tags": []
  },
  "Straight Hunk Fitness Coach Max Strong Tricked Into Sucking Dick.mp4": {
    "mtime": 1764960973645970762,
    "performers": [],
    "tags": []
  },
  "Straight Massive Inked Hunk Tries Barebacking Twink Roommate Bareback.mp4": {
    "mtime": 1764960967210111666,
    "performers": [],
    "tags": []
  },
  "Straight Seduction Lance Hart.mp4": {
    "mtime": 1764960981053809066,
    "performers": [
      "Lance Hart"
    ],
    "tags": []
  },
  "Straight Stud Fucks Killian Knox.mp4": {
    "mtime": 1764960971222023784,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Stressed Out Reece Scott Relaxes Under His Twinks Touch Twink.mp4": {
    "mtime": 1764953612848826275,
    "performers": [
      "Reece Scott"
    ],
    "tags": []
  },
  "Strong Bear Sucks Dick and Gets Fucked.mp4": {
    "mtime": 1764960978369867591,
    "performers": [],
    "tags": []
  },
  "Strong Buddies Drill in the Prison.mp4": {
    "mtime": 1764960990097612363,
    "performers": [],
    "tags": []
  },
  "Strong Muscle Bottom.mp4": {
    "mtime": 1764960987553667618,
    "performers": [],
    "tags": []
  },
  "Strong Muscular Jocks Connor Maguire Colby Jensen Butt Fuck for Fitness.mp4": {
    "mtime": 1764960989321629212,
    "performers": [
      "Connor Maguire"
    ],
    "tags": []
  },
  "Stud Mechanic Drilled by Hot Racer Bareback Cole Connor Alex Mecum.mp4": {
    "mtime": 1764960988841639636,
    "performers": [
      "Alex Mecum",
      "Cole Connor"
    ],
    "tags": []
  },
  "Stud Realtor Dicked Down By Handsome Client Bareback By Raging Stallion.mp4": {
    "mtime": 1764960989957615402,
    "performers": [],
    "tags": []
  },
  "Studs Tyler Hanson and Zane Penn Flip Fuck After Ball Game.mp4": {
    "mtime": 1764960990545602640,
    "performers": [
      "Tyler Hanson",
      "Zane Penn"
    ],
    "tags": []
  },
  "Sucking a Straight Guy.mp4": {
    "mtime": 1764960991169589099,
    "performers": [],
    "tags": []
  },
  "Suited Foursome Bareback.mp4": {
    "mtime": 1764961003705317819,
    "performers": [],
    "tags": []
  },
  "Sunday Orgy Fuckfest Part 1 Alex Tikas.mp4": {
    "mtime": 1764960992193566885,
    "performers": [
      "Alex Tikas"
    ],
    "tags": []
  },
  "Sunlight Seduction Daniel Gainsbrook Red Ryder.mp4": {
    "mtime": 1764961046196408627,
    "performers": [
      "Red Ryder"
    ],
    "tags": []
  },
  "Super Hot Bareback Orgy.mp4": {
    "mtime": 1764961025228855323,
    "performers": [],
    "tags": []
  },
  "Super Tight CJ Madison.mp4": {
    "mtime": 1764961026356831197,
    "performers": [
      "CJ Madison"
    ],
    "tags": []
  },
  "Superb Bearded Man Flip Fuck French.mp4": {
    "mtime": 1764961027756801269,
    "performers": [],
    "tags": []
  },
  "Sweaty Flip Fuck Nicholas Bardem.mp4": {
    "mtime": 1764961054636229863,
    "performers": [
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "Sweaty Florida Orgy Bareback feat Sean Harding.mp4": {
    "mtime": 1764961028564784004,
    "performers": [
      "Sean Harding"
    ],
    "tags": []
  },
  "Sweaty Hardcore Testosterone Filled Fuckfest with Romeo Davis and Tryp Bates at Cutler's Den.mp4": {
    "mtime": 1764961028948775800,
    "performers": [
      "Romeo Davis",
      "Tryp Bates"
    ],
    "tags": []
  },
  "Sweaty Suck Stick and Seed Matt Stevens.mp4": {
    "mtime": 1764961030428744196,
    "performers": [
      "Matt Stevens"
    ],
    "tags": []
  },
  "Sweet Massage.mp4": {
    "mtime": 1764961065124008528,
    "performers": [],
    "tags": []
  },
  "TJ Cumshot with Nick.mp4": {
    "mtime": 1764961325250759740,
    "performers": [],
    "tags": []
  },
  "Taking Dimitri Venum's Cock in Paris Romeo Davis.mp4": {
    "mtime": 1764961048428361295,
    "performers": [
      "Dimitri Venum",
      "Romeo Davis"
    ],
    "tags": []
  },
  "Taking Every Inch of Drew Sebastian's Huge Daddy Dick Sean Harding.mp4": {
    "mtime": 1764961077363751332,
    "performers": [
      "Drew Sebastian",
      "Sean Harding"
    ],
    "tags": []
  },
  "Taking Three Big Daddy Cocks in a Single Day Is No Joke.mp4": {
    "mtime": 1764961055808205085,
    "performers": [],
    "tags": []
  },
  "Taking Turns Breeding Daddy's Ass.mp4": {
    "mtime": 1764961061984074700,
    "performers": [],
    "tags": []
  },
  "Tanned and Tattooed Daddy John Decker Barebacks His Bottom Twink Lover Alex Morgan.mp4": {
    "mtime": 1764961067151965832,
    "performers": [
      "John Decker"
    ],
    "tags": []
  },
  "Tatted Hunks Rails Tightholed Jock Joel Someone Nic Sahara Chaos Men.mp4": {
    "mtime": 1764961069463917198,
    "performers": [
      "Joel Someone"
    ],
    "tags": []
  },
  "Tattoo Flip Fuck with Facial.mp4": {
    "mtime": 1764961085851573663,
    "performers": [],
    "tags": []
  },
  "Tattooed Bearded Hot Hunks Fucking Hard Bareback feat Chandler Scott.mp4": {
    "mtime": 1764961079911697939,
    "performers": [
      "Chandler Scott"
    ],
    "tags": []
  },
  "Tattooed Otter Gets Some Daddy Dick Bareback by Treasure Island Media Cam Christou Jacob Woods.mp4": {
    "mtime": 1764961081215670634,
    "performers": [
      "Cam Christou",
      "Jacob Woods"
    ],
    "tags": []
  },
  "Taylor Fucks Jaxton.mp4": {
    "mtime": 1764961099787283155,
    "performers": [],
    "tags": []
  },
  "Teacher and Stepdad Plow An Innocent Boys Tight Butthole.mp4": {
    "mtime": 1764961087163546251,
    "performers": [],
    "tags": []
  },
  "Teaching a Missionary.mp4": {
    "mtime": 1764961108371104938,
    "performers": [],
    "tags": []
  },
  "Ted Colunga and Buck Monroe Hunk feat Fred Fele.mp4": {
    "mtime": 1764961088239523779,
    "performers": [
      "Buck Monroe",
      "Fred Fele"
    ],
    "tags": []
  },
  "Teddy Bear Breeding Logan Stevens Cumming at Same Time.mp4": {
    "mtime": 1764961091071464675,
    "performers": [
      "Logan Stevens",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Teddy Bear Davin Strong Wrestling Fetish Fantasy Cums to Life Flip Fuck.mp4": {
    "mtime": 1764961107843115884,
    "performers": [
      "Davin Strong",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Teddy Bear Tops Brogan.mp4": {
    "mtime": 1764961109367084295,
    "performers": [
      "Brogan",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Teddy Bear Vander Pulaski Bareback.mp4": {
    "mtime": 1764961109679077830,
    "performers": [
      "Teddy Bear",
      "Vander Pulaski"
    ],
    "tags": []
  },
  "Teddy Bear and Bruno Wolf Flip Fuck.mp4": {
    "mtime": 1764961089647494387,
    "performers": [
      "Bruno Wolf",
      "Teddy Bear"
    ],
    "tags": []
  },
  "Teddy Bears Fight Sexystache.mp4": {
    "mtime": 1764961111099048414,
    "performers": [
      "SexyStache"
    ],
    "tags": []
  },
  "Teddy Joey Unprotected Action.mp4": {
    "mtime": 1764961111095048497,
    "performers": [],
    "tags": []
  },
  "Teddy Torres Amateur feat Allen King.mp4": {
    "mtime": 1764961112531018766,
    "performers": [
      "Allen King",
      "Teddy Torres"
    ],
    "tags": []
  },
  "Teen Boy First Time Interview with Older Man feat Bill Farnsworth by Missionary Boys.mp4": {
    "mtime": 1764961124594769575,
    "performers": [],
    "tags": []
  },
  "Tennis Players Tomm and Max Born Fuck on the Court.mp4": {
    "mtime": 1764961119738869753,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Thank You for Your Service Part 1 Alex Tikas.mp4": {
    "mtime": 1764961129426670058,
    "performers": [
      "Alex Tikas"
    ],
    "tags": []
  },
  "That Yoga Fucker and Killian Knox Flip Fuck.mp4": {
    "mtime": 1764961153026186345,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "That's What Friends Are for feat Billy Warren.mp4": {
    "mtime": 1764961130918639363,
    "performers": [
      "Billy Warren"
    ],
    "tags": []
  },
  "The Best Looking Authentic Chav I Have Ever Seen British by Hung Young Brit.mp4": {
    "mtime": 1764961131078636072,
    "performers": [
      "Hung Young Brit"
    ],
    "tags": []
  },
  "The Bigger the Better Scene 1.mp4": {
    "mtime": 1764961150786232094,
    "performers": [],
    "tags": []
  },
  "The CC Boys To Serve and Erect Police Fuck Travis Connor Paul Codi Cayden Clay.mp4": {
    "mtime": 1764961133090594706,
    "performers": [
      "Cayden Clay",
      "Paul Codi",
      "Travis Connor"
    ],
    "tags": []
  },
  "The Coach Nude feat Joshua Scott.mp4": {
    "mtime": 1764961134694561750,
    "performers": [
      "Joshua Scott"
    ],
    "tags": []
  },
  "The Gardener Travis Connor and Niko Russo.mp4": {
    "mtime": 1764961135894537105,
    "performers": [
      "Travis Connor"
    ],
    "tags": []
  },
  "The Ginger Fox and Ryan Lasure Flip Fuck.mp4": {
    "mtime": 1764961155606133696,
    "performers": [],
    "tags": []
  },
  "The Huge One Latinrelax.mp4": {
    "mtime": 1764961157062104003,
    "performers": [],
    "tags": []
  },
  "The Hustler 2 Axel Brown D Dan.mp4": {
    "mtime": 1764961156962106041,
    "performers": [
      "Axel Brown"
    ],
    "tags": []
  },
  "The Joint a Penile Institution.mp4": {
    "mtime": 1764961217416885135,
    "performers": [],
    "tags": []
  },
  "The More You Push I Feel Nathan Jeremy Bareback.mp4": {
    "mtime": 1764961158238080031,
    "performers": [],
    "tags": []
  },
  "The Night Before the Wedding Scene 3.mp4": {
    "mtime": 1764961178165675190,
    "performers": [],
    "tags": []
  },
  "The Paris Bear and Leo Grin.mp4": {
    "mtime": 1764961159602052238,
    "performers": [
      "Leo Grin",
      "The Paris Bear"
    ],
    "tags": []
  },
  "The Play Magic Javi Martin Mazza David Cork.mp4": {
    "mtime": 1764961160658030729,
    "performers": [
      "David Cork"
    ],
    "tags": []
  },
  "The Podophilic Podiatrist Franky Fox Leander Watch Online.mp4": {
    "mtime": 1764961177065697469,
    "performers": [
      "Franky Fox",
      "Leander"
    ],
    "tags": []
  },
  "The Salesman CJ Madison Fucks Sebastian Rivers.mp4": {
    "mtime": 1764961178325671951,
    "performers": [
      "CJ Madison",
      "Sebastian Rivers"
    ],
    "tags": []
  },
  "The Sexy Nicholas Bardem Used Raw by Mendoza at Open Mind Barcelona Attack Boys.mp4": {
    "mtime": 1764961216144910590,
    "performers": [
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "The Sister's Boyfriend.mp4": {
    "mtime": 1764961179709643932,
    "performers": [],
    "tags": []
  },
  "The Toe Tapper Bdsm feat Dean Tucker by Faphouse.mp4": {
    "mtime": 1764961179557647008,
    "performers": [
      "Dean Tucker"
    ],
    "tags": []
  },
  "The Trainer Dimitri Venum Tiago Santana.mp4": {
    "mtime": 1764961201365207080,
    "performers": [
      "Dimitri Venum",
      "Tiago Santana"
    ],
    "tags": []
  },
  "The Wedding Shaggers Blowjob.mp4": {
    "mtime": 1764961181589605891,
    "performers": [],
    "tags": []
  },
  "The Yard Work Never Gets Done Todd Haynes Joey Doves.mp4": {
    "mtime": 1764961190665422557,
    "performers": [
      "Joey Doves"
    ],
    "tags": []
  },
  "These European Studs Like It Raw.mp4": {
    "mtime": 1764961212740978758,
    "performers": [],
    "tags": []
  },
  "These Hunky Men and Dilfs Crave Warm Cock Cream Daddy Sex Files Andrew Justice Jake Steel Tyler Josh Kole Matt Sizemore Tommy Deluca.mp4": {
    "mtime": 1764961210321027263,
    "performers": [
      "Andrew Justice",
      "Josh Kole",
      "Matt Sizemore",
      "Tommy Deluca"
    ],
    "tags": []
  },
  "Thick Dick Top Loads Killian Knox.mp4": {
    "mtime": 1764961212612981323,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Thick and Sweaty in the Locker Room for Big Cock by Man Up Films.mp4": {
    "mtime": 1764961211281008017,
    "performers": [],
    "tags": []
  },
  "This Daddy Gets It Bareback.mp4": {
    "mtime": 1764961219080851849,
    "performers": [],
    "tags": []
  },
  "This Thief Won't Regret It feat Brock Masters.mp4": {
    "mtime": 1764961214416945186,
    "performers": [
      "Brock Masters"
    ],
    "tags": []
  },
  "Thomas Bjorn Jed Pisston Devin Moon Threesome Bareback.mp4": {
    "mtime": 1764961215884915794,
    "performers": [
      "Jed Pisston"
    ],
    "tags": []
  },
  "Thomas Friedl Caleb Moreton Bareback.mp4": {
    "mtime": 1764961242008394859,
    "performers": [
      "Caleb Moreton"
    ],
    "tags": []
  },
  "Thomas Ride Jan Faust Damian Dickey Threeway Bareback.mp4": {
    "mtime": 1764961263751964219,
    "performers": [
      "Damian Dickey",
      "Jan Faust",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Thomas Ride and John Decker.mp4": {
    "mtime": 1764961251396208608,
    "performers": [
      "John Decker",
      "John Thomas",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Thomas Ride and Luke Ward.mp4": {
    "mtime": 1764961279267658497,
    "performers": [
      "Thomas Ride"
    ],
    "tags": []
  },
  "Three Angry Bears Fuck the Hell Out of Each Other feat Teddy Torres.mp4": {
    "mtime": 1764961249976236748,
    "performers": [
      "Teddy Torres"
    ],
    "tags": []
  },
  "Three Daddies Skin to Skin.mp4": {
    "mtime": 1764961257904079782,
    "performers": [],
    "tags": []
  },
  "Three Dicks for Two Holes Romeo Davis.mp4": {
    "mtime": 1764961252884179132,
    "performers": [
      "Romeo Davis"
    ],
    "tags": []
  },
  "Three Hawt Studs Bumping Uglies Outdoors in Miami Florida.mp4": {
    "mtime": 1764961259564046959,
    "performers": [],
    "tags": []
  },
  "Three Hunks Bareback as Hookers.mp4": {
    "mtime": 1764961259344051309,
    "performers": [],
    "tags": []
  },
  "Three Pig Vers Leo Grin.mp4": {
    "mtime": 1764961278971664317,
    "performers": [
      "Leo Grin"
    ],
    "tags": []
  },
  "Threesome Bareback Breeding feat Drew Sebastian feat Logan Stevens by Treasure Island Media.mp4": {
    "mtime": 1764961285215541638,
    "performers": [
      "Drew Sebastian",
      "Logan Stevens"
    ],
    "tags": []
  },
  "Threesome with Adam Gray Col Oak Ginger Fox.mp4": {
    "mtime": 1764961296959311444,
    "performers": [
      "Adam Gray"
    ],
    "tags": []
  },
  "Threesome with Danny Wyatt Warner Luke.mp4": {
    "mtime": 1764961304751159101,
    "performers": [
      "Danny Wyatt"
    ],
    "tags": []
  },
  "Threeway Fuck Gabriel Cross Eddie Burke.mp4": {
    "mtime": 1764961286783510862,
    "performers": [
      "Eddie Burke",
      "Gabriel Cross"
    ],
    "tags": []
  },
  "Threeway Fun Nicholas Bardem.mp4": {
    "mtime": 1764961319582869953,
    "performers": [
      "Nicholas Bardem"
    ],
    "tags": []
  },
  "Threeway Plumb Big C Jackson Reed His Real Life Boyfriend Part 2.mp4": {
    "mtime": 1764961296727315985,
    "performers": [
      "Big C",
      "Jackson Reed"
    ],
    "tags": []
  },
  "Threeway with Brian Bonds Jack Andy.mp4": {
    "mtime": 1764961298355284128,
    "performers": [
      "Brian Bonds",
      "Jack Andy"
    ],
    "tags": []
  },
  "Threeway with MrDeepVoice Oliver Hunt and Holden Hunt.mp4": {
    "mtime": 1764961311423028897,
    "performers": [],
    "tags": []
  },
  "Thrill Drill Lito Cruz and Cooper Jameson.mp4": {
    "mtime": 1764961320582850497,
    "performers": [
      "Cooper Jameson",
      "Lito Cruz"
    ],
    "tags": []
  },
  "Tim Kruger and Zeb Hadid.mp4": {
    "mtime": 1764961318414892684,
    "performers": [
      "Tim Kruger",
      "Zeb Hadid"
    ],
    "tags": []
  },
  "Tim and Jake Norris at Nuvid.mp4": {
    "mtime": 1764961317038919471,
    "performers": [
      "Jake Norris"
    ],
    "tags": []
  },
  "Titan Men Cut to the Chase Dirk Caber Dolan Wolf and JD Phoenix.mp4": {
    "mtime": 1764961319866864427,
    "performers": [
      "Dirk Caber",
      "Dolan Wolf",
      "JD Phoenix"
    ],
    "tags": []
  },
  "Titan Men Dick Danger Jesse Jackman and Rogan Richards.mp4": {
    "mtime": 1764961321106840304,
    "performers": [
      "Dick Danger",
      "Jesse Jackman",
      "Rogan Richards"
    ],
    "tags": []
  },
  "Toilet Pound Nick Capra Michael Roman.mp4": {
    "mtime": 1764961322130820389,
    "performers": [
      "Michael Roman",
      "Nick Capra"
    ],
    "tags": []
  },
  "Tom Wolfe and Anthony London Daddy.mp4": {
    "mtime": 1764961383085643673,
    "performers": [
      "Anthony London",
      "Tom Wolfe"
    ],
    "tags": []
  },
  "Tomas Brand And Manuel Skye Flip Fuck Celebration Bareback.mp4": {
    "mtime": 1764961353234217831,
    "performers": [
      "Manuel Skye",
      "Tomas Brand"
    ],
    "tags": []
  },
  "Tomas Brand Muscle Daddy Get Breed Bareback.mp4": {
    "mtime": 1764961354798187651,
    "performers": [
      "Tomas Brand"
    ],
    "tags": []
  },
  "Tomas Brand and Gabriel Phoenix.mp4": {
    "mtime": 1764961346570346548,
    "performers": [
      "Gabriel Phoenix",
      "Tomas Brand"
    ],
    "tags": []
  },
  "Tomas Brand and Gustavo Cruz Gentlemen Servicing the CEO Bareback.mp4": {
    "mtime": 1764961348054317866,
    "performers": [
      "Tomas Brand",
      "Gustavo Cruz"
    ],
    "tags": []
  },
  "Tomas Brand and Jacob Lord.mp4": {
    "mtime": 1764961349642287186,
    "performers": [
      "Jacob Lord",
      "Tomas Brand"
    ],
    "tags": []
  },
  "Tomas Brand and Logan Rogue Bareback.mp4": {
    "mtime": 1764961351630248794,
    "performers": [
      "Logan Rogue",
      "Tomas Brand"
    ],
    "tags": []
  },
  "Tomas and Milos Raw Bareback.mp4": {
    "mtime": 1764961345254371991,
    "performers": [],
    "tags": []
  },
  "Tongue In Cheek Scene 4 Bruce Jones Timothy Chance.mp4": {
    "mtime": 1764961383009645129,
    "performers": [
      "Timothy Chance",
      "Bruce Jones"
    ],
    "tags": []
  },
  "Tony Bishop Raw Breed with Derek Parker Bareback That Hole.mp4": {
    "mtime": 1764961390025510749,
    "performers": [
      "Derek Parker",
      "Tony Bishop"
    ],
    "tags": []
  },
  "Topher Di Maggio Taking Adam Bryant Tight Ass Condom.mp4": {
    "mtime": 1764961387749554319,
    "performers": [
      "Adam Bryant",
      "Topher di Maggio"
    ],
    "tags": []
  },
  "Tops Into Bottoms Bruce Hudson and Knox Killian Flip Fuck.mp4": {
    "mtime": 1764961385261601973,
    "performers": [
      "Bruce Hudson",
      "Killian Knox"
    ],
    "tags": []
  },
  "Toronto Stripper Orgy Mateo Tomas.mp4": {
    "mtime": 1764961385701593544,
    "performers": [
      "Mateo Tomas"
    ],
    "tags": []
  },
  "Tough Daddy Love Bareback feat Spencer Whitman by Manalized.mp4": {
    "mtime": 1764961396265391407,
    "performers": [
      "Spencer Whitman"
    ],
    "tags": []
  },
  "Tradesman Cock That Guy From Wales Jordan King.mp4": {
    "mtime": 1764961401349294294,
    "performers": [
      "Tradesman"
    ],
    "tags": []
  },
  "Tradesman Cock and Leandro Hairydom XL 3.mp4": {
    "mtime": 1764961408925149778,
    "performers": [
      "Tradesman"
    ],
    "tags": []
  },
  "Trailer Trash Boys Daddy Greg Dixxon Raw Fucked by Bruce Jones Bareback.mp4": {
    "mtime": 1764961410237124775,
    "performers": [
      "Bruce Jones",
      "Greg Dixxon"
    ],
    "tags": []
  },
  "Trailer Trash Boys Drew Sebastian and Grant Ducati Uncle Drew\u2019s Moonshine Mule.mp4": {
    "mtime": 1764961411625098332,
    "performers": [],
    "tags": []
  },
  "Trailer Trash Boys Hunk Alpha Wolfe Breeds with Joel Someone.mp4": {
    "mtime": 1764961413237067630,
    "performers": [
      "Alpha Wolfe",
      "Joel Someone"
    ],
    "tags": []
  },
  "Trailer Trash Boys Hunk Greg Dixxon Raw Breeds Harrison Todd Twink.mp4": {
    "mtime": 1764961414189049503,
    "performers": [
      "Greg Dixxon",
      "Harrison Todd"
    ],
    "tags": []
  },
  "Trailer Trash Boys Jocks Andrew Delta and Buck Richards Breed.mp4": {
    "mtime": 1764961415665021407,
    "performers": [
      "Andrew Delta",
      "Buck Richards"
    ],
    "tags": []
  },
  "Trailer Trash Boys Meathead Davin Strong Ryan Sebastian.mp4": {
    "mtime": 1764961417244991341,
    "performers": [
      "Davin Strong",
      "Ryan Sebastian"
    ],
    "tags": []
  },
  "Training Day with Billy Essex British Twink.mp4": {
    "mtime": 1764961438344590770,
    "performers": [
      "Billy Essex"
    ],
    "tags": []
  },
  "Trashy Neighbor Part 1 Evan Sterling.mp4": {
    "mtime": 1764961422816885389,
    "performers": [
      "Evan Sterling"
    ],
    "tags": []
  },
  "Travis Connor Cody Mac.mp4": {
    "mtime": 1764961447380419756,
    "performers": [
      "Travis Connor",
      "Cody Mac"
    ],
    "tags": []
  },
  "Travis Connor Gets Spit Roasted and Flip Fucks With King Heartz and Nick Kross.mp4": {
    "mtime": 1764961448096406218,
    "performers": [
      "Nick Kross",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Connor Massive Muscle Ass Takes Hunter Sterling\u2019s Huge Cock.mp4": {
    "mtime": 1764961481455777575,
    "performers": [
      "Hunter Sterling",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Connor and Marco Napoli Flip Fuck.mp4": {
    "mtime": 1764961442772506927,
    "performers": [
      "Marco Napoli",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Connor and Paul Codi Part 1 Flip Fuck Bareback.mp4": {
    "mtime": 1764961444196479980,
    "performers": [],
    "tags": []
  },
  "Travis Connor and Paul Codi Part 2.mp4": {
    "mtime": 1764961445456456143,
    "performers": [
      "Paul Codi",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Connor and Paul Codi Part 3.mp4": {
    "mtime": 1764961446680432993,
    "performers": [
      "Paul Codi",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Connor's Cock-Squeezing Fuckhole Opened Up by Travis Berkley's Monster Fuckpole.mp4": {
    "mtime": 1764961449164386028,
    "performers": [
      "Travis Berkley",
      "Travis Connor"
    ],
    "tags": []
  },
  "Travis Dyson fucks the Bearded Gorillas.mp4": {
    "mtime": 1764961493811545750,
    "performers": [
      "The Bearded Gorillas",
      "Travis Dyson"
    ],
    "tags": []
  },
  "Travis Stevens Records Himself Jerking Off When His Stepdad Adam Herst Catches Him in the Act.mp4": {
    "mtime": 1764961483399741065,
    "performers": [
      "Travis Stevens",
      "Adam Herst"
    ],
    "tags": []
  },
  "Travis Stevens and His Stepfather Adam Herst Indulge in a Naughty Fuck Session.mp4": {
    "mtime": 1764961482303761647,
    "performers": [
      "Adam Herst",
      "Travis Stevens"
    ],
    "tags": []
  },
  "Treasure Island Media Dawson's 50-load Weekend.mp4": {
    "mtime": 1764961485471702167,
    "performers": [
      "Dawson"
    ],
    "tags": []
  },
  "Trenton Ducati and Jason Phoenix.mp4": {
    "mtime": 1764961486619680622,
    "performers": [],
    "tags": []
  },
  "Trespass Alexandros Andrew Addams.mp4": {
    "mtime": 1764961499263443627,
    "performers": [
      "Andrew Addams"
    ],
    "tags": []
  },
  "Trevor Knight Shane Rollins Huge Cock Fight in Prison.mp4": {
    "mtime": 1764961488603643398,
    "performers": [
      "Shane Rollins",
      "Trevor Knight"
    ],
    "tags": []
  },
  "Trevor Laster Country Livins Bareback.mp4": {
    "mtime": 1764961489791621115,
    "performers": [
      "Trevor Laster"
    ],
    "tags": []
  },
  "Trevor Laster Jackson Traynor for These Stepbrothers Family Takes Care of Family Bareback.mp4": {
    "mtime": 1764961500227425581,
    "performers": [
      "Jackson Traynor",
      "Trevor Laster"
    ],
    "tags": []
  },
  "Trevor Laster Spencer Laval Bald Muscular Dude Sucks Big Cock Than Rides It Passionately.mp4": {
    "mtime": 1764961501291405666,
    "performers": [
      "Spencer Laval",
      "Trevor Laster"
    ],
    "tags": []
  },
  "Tristan Brazzer Wesley Woods Bareback feat Brazer.mp4": {
    "mtime": 1764961526154941375,
    "performers": [
      "Tristan Brazer",
      "Wesley Woods"
    ],
    "tags": []
  },
  "Tristan Hunter Eddy Ceetee Dale Savage Not a Crowd Bareback.mp4": {
    "mtime": 1764961517459103525,
    "performers": [
      "Dale Savage",
      "Eddy Ceetee",
      "Tristan Hunter"
    ],
    "tags": []
  },
  "Tristan Jaxx Breeds Jack Wolf.mp4": {
    "mtime": 1764961518727079865,
    "performers": [
      "Jack Wolf",
      "Tristan Jaxx"
    ],
    "tags": []
  },
  "Tristan and Dale\u2019s Threesome with Stepdad.mp4": {
    "mtime": 1764961525522953152,
    "performers": [],
    "tags": []
  },
  "Trough Group Bareback.mp4": {
    "mtime": 1764956963360407957,
    "performers": [],
    "tags": []
  },
  "Troy Daniels and Eddie Burke.mp4": {
    "mtime": 1764961520551045841,
    "performers": [],
    "tags": []
  },
  "Troy Daniels and Thomas Johnson Flip Fuck.mp4": {
    "mtime": 1764961520955038307,
    "performers": [],
    "tags": []
  },
  "Tryp Bates Caden Jackson the Beach House.mp4": {
    "mtime": 1764961537730725905,
    "performers": [
      "Caden Jackson",
      "Tryp Bates"
    ],
    "tags": []
  },
  "Tryp Takes Jesse's Cock Deep in His Ass at the Club Bareback.mp4": {
    "mtime": 1764961536778743609,
    "performers": [],
    "tags": []
  },
  "Turkish Daddy at Ice Gay Tube.mp4": {
    "mtime": 1764961528250902329,
    "performers": [],
    "tags": []
  },
  "Turned Gay Amateur Bear Cums Angelo Thomas Ride.mp4": {
    "mtime": 1764961534954777537,
    "performers": [
      "Thomas Ride"
    ],
    "tags": []
  },
  "Twink Barefucked by Man.mp4": {
    "mtime": 1764961529650876257,
    "performers": [],
    "tags": []
  },
  "Twink Top Coach Eddie Patrick Takes a Ride on Grant Ducati's Fuck Stick.mp4": {
    "mtime": 1764961530490860617,
    "performers": [
      "Eddie Patrick",
      "Grant Ducati"
    ],
    "tags": []
  },
  "Twink Top Hung Athlete Jack Savvy Is Deepthroated by Coach Mark Laxx.mp4": {
    "mtime": 1764953611220853751,
    "performers": [],
    "tags": []
  },
  "Twink Top Hung Horny Twink Jock Milo Miles Eagerly Licks And Rims DILF.mp4": {
    "mtime": 1764961531362844383,
    "performers": [
      "Milo Miles"
    ],
    "tags": []
  },
  "Twink Top Jock Milo Miles Introduces His Cock To Coach Tomas Ass.mp4": {
    "mtime": 1764961532466823833,
    "performers": [
      "Milo Miles"
    ],
    "tags": []
  },
  "Twink Top Massively Hung Jock Barebacks Hairy Muscle Dad Coach.mp4": {
    "mtime": 1764961538994702403,
    "performers": [],
    "tags": []
  },
  "Twink Top Principal Matthew Figata Barebacked by Student.mp4": {
    "mtime": 1764961539338696008,
    "performers": [
      "Matthew Figata"
    ],
    "tags": []
  },
  "Twink Top Sexy Hung Top Blows Load All Over Older Beefy Bottom Killian Knox.mp4": {
    "mtime": 1764961540534673777,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Twink Used and Fucked Bareback by Group of Older Men Boy for Sale.mp4": {
    "mtime": 1764961540990665302,
    "performers": [],
    "tags": []
  },
  "Twink top Silver Fox Dilf Lawson James Rides Hung Jock Twink Cowboy.mp4": {
    "mtime": 1764961540646671695,
    "performers": [
      "James Fox",
      "Lawson James"
    ],
    "tags": []
  },
  "Two Bears Vs Otter Alex Tikas.mp4": {
    "mtime": 1764961541414657422,
    "performers": [
      "Alex Tikas"
    ],
    "tags": []
  },
  "Two Beefy Bear Types Banging in a Bedroom.mp4": {
    "mtime": 1764961563998238527,
    "performers": [],
    "tags": []
  },
  "Two Buds Swappin Loads Rusty Taylor.mp4": {
    "mtime": 1764961583109885235,
    "performers": [
      "Rusty Taylor"
    ],
    "tags": []
  },
  "Two Caught Petty Thugs Spit Roast a Horny Bear Cop Criminal Dick.mp4": {
    "mtime": 1764961569914129052,
    "performers": [],
    "tags": []
  },
  "Two Cops.mp4": {
    "mtime": 1764961574170050360,
    "performers": [],
    "tags": []
  },
  "Two Daddies Bareback Slamming.mp4": {
    "mtime": 1764961571250104344,
    "performers": [],
    "tags": []
  },
  "Two Daddies Fuck a Boy.mp4": {
    "mtime": 1764961583677874752,
    "performers": [],
    "tags": []
  },
  "Two Daddy Bears Fuck Their Boy.mp4": {
    "mtime": 1764961581573913589,
    "performers": [],
    "tags": []
  },
  "Two Delicious Dads in a Deluxe Flip Fuck Bareback.mp4": {
    "mtime": 1764956980492217643,
    "performers": [],
    "tags": []
  },
  "Two Gays Fuck Each Other in Turn.mp4": {
    "mtime": 1764961627777063603,
    "performers": [],
    "tags": []
  },
  "Two Hairy Dad.mp4": {
    "mtime": 1764961596553637357,
    "performers": [],
    "tags": []
  },
  "Two Hairy Hunks Flip Fuck.mp4": {
    "mtime": 1764961633584957170,
    "performers": [],
    "tags": []
  },
  "Two Horny Guys Sucking Each Others Cocks Deep in the Woods.mp4": {
    "mtime": 1764961615161295106,
    "performers": [],
    "tags": []
  },
  "Two Hot American Hunky Bears Fuck with Bruce Hammer Fox Rifler.mp4": {
    "mtime": 1764961616265274830,
    "performers": [
      "Bruce Hammer",
      "Fox Rifler"
    ],
    "tags": []
  },
  "Two Hot Hunks Flip Fuck Logan Stevens Michael Boston.mp4": {
    "mtime": 1764961617689248683,
    "performers": [],
    "tags": []
  },
  "Two Huge Dicks Fuck and Breed Each Other Joel Someone.mp4": {
    "mtime": 1764961619001224596,
    "performers": [
      "Joel Someone"
    ],
    "tags": []
  },
  "Two Hunks Bareback Fucking.mp4": {
    "mtime": 1764961621285182677,
    "performers": [],
    "tags": []
  },
  "Two Inmates Got Caught Screwing Around.mp4": {
    "mtime": 1764961632428978347,
    "performers": [],
    "tags": []
  },
  "Two Men with Hot Bodies Get Oiled up and Have Sex.mp4": {
    "mtime": 1764961641468812835,
    "performers": [],
    "tags": []
  },
  "Two Polish Hunks Flip Fuck Matt Polaco.mp4": {
    "mtime": 1764961641896805004,
    "performers": [
      "Matt Polaco"
    ],
    "tags": []
  },
  "Two Shoplifters Let the Guard Have Fun with Them Men Perps.mp4": {
    "mtime": 1764961646888713703,
    "performers": [],
    "tags": []
  },
  "Two Studs Fuck English Amateur Big C.mp4": {
    "mtime": 1764961643400777490,
    "performers": [
      "Big C"
    ],
    "tags": []
  },
  "Two for One Special.mp4": {
    "mtime": 1764961592009721080,
    "performers": [],
    "tags": []
  },
  "Two in One Max Born Thomas Ride.mp4": {
    "mtime": 1764961632324980252,
    "performers": [
      "Max Born",
      "Thomas Ride"
    ],
    "tags": []
  },
  "Two to One We're Winning.mp4": {
    "mtime": 1764961657644517198,
    "performers": [],
    "tags": []
  },
  "Tyler Reed and Jacob Durham Bareback.mp4": {
    "mtime": 1764961676164179526,
    "performers": [
      "Jacob Durham",
      "Tyler Reed"
    ],
    "tags": []
  },
  "Tyler Reed and Morgan Black.mp4": {
    "mtime": 1764961663112417412,
    "performers": [
      "Morgan Black",
      "Tyler Reed"
    ],
    "tags": []
  },
  "Tyler Reed and Preston Johnson Bareback.mp4": {
    "mtime": 1764961653936584907,
    "performers": [
      "Tyler Reed",
      "Preston Johnson"
    ],
    "tags": []
  },
  "Tyler Saint Ace Banner.mp4": {
    "mtime": 1764961683492046147,
    "performers": [
      "Tyler Saint",
      "Ace Banner"
    ],
    "tags": []
  },
  "Tyler Saint Colby M Bounce.mp4": {
    "mtime": 1764961696931801854,
    "performers": [
      "Tyler Saint"
    ],
    "tags": []
  },
  "Uncle Drew Sebastian in the Can Zack Bishop.mp4": {
    "mtime": 1764961683048054225,
    "performers": [
      "Drew Sebastian"
    ],
    "tags": []
  },
  "Uncle Nephew Jerk Off.mp4": {
    "mtime": 1764961698279777375,
    "performers": [],
    "tags": []
  },
  "Uncles Threeway Logan Stevens Skyy Knox Zayne Roman Bareback.mp4": {
    "mtime": 1764961685096016969,
    "performers": [
      "Logan Stevens",
      "Skyy Knox",
      "Zayne Roman"
    ],
    "tags": []
  },
  "Uncut Stud Gets His Tight Ass Pounded Bareback Caleb Moreton.mp4": {
    "mtime": 1764961686151997763,
    "performers": [
      "Caleb Moreton"
    ],
    "tags": []
  },
  "Uncut Stud Getting His Big Hard Cock Sucked on Max Born Caleb Moreton.mp4": {
    "mtime": 1764961694699842394,
    "performers": [
      "Caleb Moreton",
      "Max Born"
    ],
    "tags": []
  },
  "Uniformed Orgy Spanish Daddy.mp4": {
    "mtime": 1764961695807822268,
    "performers": [],
    "tags": []
  },
  "Vander Pulaski and Killian Knox Handsome Jock Fucks His Hunk Teammate After the Game Bareback.mp4": {
    "mtime": 1764961749034858652,
    "performers": [
      "Killian Knox",
      "Vander Pulaski"
    ],
    "tags": []
  },
  "Varsity Grip Gorgeous Sexy Matt Steel Will Do Anything to Get Into the Team Even Banging His Coach.mp4": {
    "mtime": 1764961765818556066,
    "performers": [],
    "tags": []
  },
  "Verbal Flip Fuck Breeders Matt Stevens.mp4": {
    "mtime": 1764961785994193084,
    "performers": [
      "Matt Stevens"
    ],
    "tags": []
  },
  "Versatile Beefcakes Pound Each Other Out Brogan Tryp Bates Raging Stallion Bareback.mp4": {
    "mtime": 1764961753038786414,
    "performers": [
      "Brogan",
      "Tryp Bates"
    ],
    "tags": []
  },
  "Versatile Hairy Uncut Suck and Fuck Amateur Bareback.mp4": {
    "mtime": 1764961754378762246,
    "performers": [],
    "tags": []
  },
  "Versatile Twunk Flip Fucks Daddy Killian Knox.mp4": {
    "mtime": 1764961755002750993,
    "performers": [
      "Killian Knox"
    ],
    "tags": []
  },
  "Versatile Vacation Alex Tikas.mp4": {
    "mtime": 1764961755598740246,
    "performers": [
      "Alex Tikas"
    ],
    "tags": []
  },
  "Videogame Tag Team Bareback Jack Vidra Cain Marko Wade Wolfgar.mp4": {
    "mtime": 1764961756210729210,
    "performers": [
      "Cain Marko",
      "Jack Vidra",
      "Wade Wolfgar"
    ],
    "tags": []
  },
  "Vin Barraca Justin Jett.mp4": {
    "mtime": 1764961779110316842,
    "performers": [
      "Justin Jett",
      "Vin Barraca"
    ],
    "tags": []
  },
  "Vin Roxx Justin.mp4": {
    "mtime": 1764961785406203652,
    "performers": [
      "Vin Roxx"
    ],
    "tags": []
  },
  "Vin Roxx popping Chris' Cherry.mp4": {
    "mtime": 1764961785178207749,
    "performers": [
      "Vin Roxx"
    ],
    "tags": []
  },
  "Vince Ferelli Colby Keller Conner Habib.mp4": {
    "mtime": 1764961794698036740,
    "performers": [
      "Colby Keller",
      "VInce Ferelli"
    ],
    "tags": []
  },
  "Vinnie D'Angelo and Nick Capra Hunk feat Dangelo.mp4": {
    "mtime": 1764961787122172814,
    "performers": [
      "Nick Capra"
    ],
    "tags": []
  },
  "Vinnie Stefano and Hugh Hunter Bareback.mp4": {
    "mtime": 1764961810609751297,
    "performers": [
      "Hugh Hunter",
      "Vinnie Stefano"
    ],
    "tags": []
  },
  "Vladimir Stark Pol Prince Nico Zett Threesome Bareback.mp4": {
    "mtime": 1764961805505842805,
    "performers": [
      "Pol Prince"
    ],
    "tags": []
  },
  "Wade Wolfgar and Daddy.mp4": {
    "mtime": 1764961796046012540,
    "performers": [
      "Wade Wolfgar"
    ],
    "tags": []
  },
  "Wagner Vittoria Jessie Colter and Shawn Reeve.mp4": {
    "mtime": 1764961825317487873,
    "performers": [
      "Jessie Colter",
      "Shawn Reeve",
      "Wagner Vittoria"
    ],
    "tags": []
  },
  "War Games Prisoner of Asskaban Max Born.mp4": {
    "mtime": 1764961883252453924,
    "performers": [
      "Max Born"
    ],
    "tags": []
  },
  "Warehouse Threesome Chad Brock Nick Moretti Blue Bailey.mp4": {
    "mtime": 1764961848457074216,
    "performers": [
      "Brock Bailey",
      "Chad Brock",
      "Nick Moretti"
    ],
    "tags": []
  },
  "Watching Football with Friends.mp4": {
    "mtime": 1764961862940815770,
    "performers": [],
    "tags": []
  },
  "We Love a Good Flip Fuck Do You Ryan Chad.mp4": {
    "mtime": 1764961835853299411,
    "performers": [],
    "tags": []
  },
  "We're Gonna Get Massaged by a Dude Trevor Brooks Sam Ledger.mp4": {
    "mtime": 1764961837881263158,
    "performers": [
      "Sam Ledger",
      "Trevor Brooks"
    ],
    "tags": []
  },
  "Welcome to LA West Hollywood.mp4": {
    "mtime": 1764961839293237921,
    "performers": [],
    "tags": []
  },
  "Welcome to the Big D Matt Stevens.mp4": {
    "mtime": 1764961840541215618,
    "performers": [
      "Matt Stevens"
    ],
    "tags": []
  },
  "Well Hung Uncut Stud Fucks Super Tight Ass Bareback.mp4": {
    "mtime": 1764961869612696837,
    "performers": [],
    "tags": []
  },
  "Wesley Woods Ricky Larkin Marco Napoli Bareback Crashpad.mp4": {
    "mtime": 1764961871804657779,
    "performers": [
      "Ricky Larkin",
      "Wesley Woods",
      "Marco Napoli"
    ],
    "tags": []
  },
  "Wesley Woods Wrecks Jake Morgan's Tight Ass Bareback That Hole.mp4": {
    "mtime": 1764961872920637897,
    "performers": [
      "Jake Morgan",
      "Wesley Woods"
    ],
    "tags": []
  },
  "Wesley Woods and Jake Morgan Bareback.mp4": {
    "mtime": 1764961881572483826,
    "performers": [
      "Jake Morgan",
      "Wesley Woods"
    ],
    "tags": []
  },
  "Wet Flip Fuck with Adam Wirthmore Bareback Vander Pulaski.mp4": {
    "mtime": 1764961873456628349,
    "performers": [
      "Adam Wirthmore",
      "Vander Pulaski"
    ],
    "tags": []
  },
  "White Men Swallowing Black Cum Stories and Big Solo Male feat Dustin Steele.mp4": {
    "mtime": 1764961881576483755,
    "performers": [
      "Dustin Steele"
    ],
    "tags": []
  },
  "White Trash Breeding in Berlin Pig Boy.mp4": {
    "mtime": 1764961905884051532,
    "performers": [],
    "tags": []
  },
  "White Trash Dads Threeway English.mp4": {
    "mtime": 1764961883244454066,
    "performers": [],
    "tags": []
  },
  "Who's Ready to See Guido Stahl and JP Knox Flip Fuck.mp4": {
    "mtime": 1764961889348345458,
    "performers": [
      "Guido Stahl"
    ],
    "tags": []
  },
  "Wife Finds Out Husband's Secret Affair Alpha Wolfe Isaac X Disruptive Films.mp4": {
    "mtime": 1764961907808017360,
    "performers": [
      "Alpha Wolfe",
      "Isaac X"
    ],
    "tags": []
  },
  "Wilfried Knight and Kent Larson.mp4": {
    "mtime": 1764961894840247790,
    "performers": [],
    "tags": []
  },
  "Will Braun Slams Josh Peters Hot Ass After Some Training.mp4": {
    "mtime": 1764961895716232216,
    "performers": [
      "Will Braun",
      "Josh Peters"
    ],
    "tags": []
  },
  "Workers Bareback Sir Peter.mp4": {
    "mtime": 1764961897220205480,
    "performers": [
      "Sir Peter"
    ],
    "tags": []
  },
  "Working Class Stiff Scene 1 Rocco Steele Tony Bay and Adam Russo.mp4": {
    "mtime": 1764961912063941792,
    "performers": [
      "Adam Russo",
      "Rocco Steele",
      "Tony Bay"
    ],
    "tags": []
  },
  "Working Class Verbal Irish Top British Bareback.mp4": {
    "mtime": 1764961902752107170,
    "performers": [],
    "tags": []
  },
  "XL Versatile Fun Nicholas Bardem Sir Peter.mp4": {
    "mtime": 1764961927667664965,
    "performers": [
      "Nicholas Bardem",
      "Sir Peter"
    ],
    "tags": []
  },
  "Yes Dad Stepmom Is Gone You Can Fuck Me Senseless Bareback feat Kurt Wood Sean Storm.mp4": {
    "mtime": 1764961923031747173,
    "performers": [
      "Kurt Wood",
      "Sean Storm"
    ],
    "tags": []
  },
  "Yes Sir Take Me in Your Powerful Pumped up Arms OnlyFans.mp4": {
    "mtime": 1764961923347741568,
    "performers": [],
    "tags": []
  },
  "You Want Someome Else on Your Ass feat Andrew Connor Joel Someone by Chaos Men.mp4": {
    "mtime": 1764961924539720429,
    "performers": [
      "Andrew Connor",
      "Joel Someone"
    ],
    "tags": []
  },
  "Young Missionary Fucks Older Priest Leader in Shower Bareback.mp4": {
    "mtime": 1764961925275707377,
    "performers": [],
    "tags": []
  },
  "Young Mormon Drills Mature Lover Before Returning the Favor.mp4": {
    "mtime": 1764961925387705391,
    "performers": [],
    "tags": []
  },
  "Young Picks up Older Blowjob feat Jake Gianelli Condom.mp4": {
    "mtime": 1764961926087692979,
    "performers": [
      "Jake Gianelli"
    ],
    "tags": []
  },
  "Young Straight Stepson and Father Threesome Sex with Cop Twink.mp4": {
    "mtime": 1764961935019534660,
    "performers": [],
    "tags": []
  },
  "Young Twink Julius Caesar Acquires Doubled by Monster Dongs Bareback.mp4": {
    "mtime": 1764961927667664965,
    "performers": [
      "Julius Caesar"
    ],
    "tags": []
  },
  "Younger Man Hooks up with Mature Guy for Raw Flip Fuck.mp4": {
    "mtime": 1764961944395368598,
    "performers": [],
    "tags": []
  },
  "Your Hands Are Tied Johnny Ford Caden Dior.mp4": {
    "mtime": 1764961943367386799,
    "performers": [
      "Caden Dior",
      "Johnny Ford"
    ],
    "tags": []
  },
  "Your Muscles Won't Stop My Big Long Cock Cain Marko Big Mike XXX.mp4": {
    "mtime": 1764961957107143650,
    "performers": [
      "Big Mike",
      "Cain Marko"
    ],
    "tags": []
  },
  "Youthful Energy Fuck American Bareback by Treasure Island Media.mp4": {
    "mtime": 1764961961615063933,
    "performers": [],
    "tags": []
  },
  "Yuri Gael Duett at Macho Tube.mp4": {
    "mtime": 1764961946147337581,
    "performers": [
      "Gael"
    ],
    "tags": []
  },
  "Zach Maxwell and Jay Piggy Bareback.mp4": {
    "mtime": 1764961947511313437,
    "performers": [
      "Jay Piggy",
      "Zach Maxwell"
    ],
    "tags": []
  },
  "Zak Spears and Mario Ortiz.mp4": {
    "mtime": 1764961960087090950,
    "performers": [
      "Mario Ortiz",
      "Zak Spears"
    ],
    "tags": []
  },
  "Zeno Kostas and Tate Flip Fuck.mp4": {
    "mtime": 1764961949163284198,
    "performers": [
      "Zeno Kostas"
    ],
    "tags": []
  },
  "Zeno Rey Pro Bodybuilder Flip Fuck with Latino Hunk Bareback.mp4": {
    "mtime": 1764961959583099862,
    "performers": [
      "Zeno Rey"
    ],
    "tags": []
  }
}                                                                              lick', (ev) => {
              ev.stopPropagation();
              const range = Boolean(ev.shiftKey);
              toggleSelect(key, { range, anchor: true });
            });
            sel.addEventListener('keydown', (ev) => {
              if (ev.key === ' ' || ev.key === 'Enter') {
                ev.preventDefault();
                ev.stopPropagation();
                toggleSelect(key, { anchor: true });
              }
            });
          }
          card.onclick = (e) => handleCardClick(e, t);
          card.onkeydown = (e) => handleCardKey(e, t);
        }
        frag.appendChild(node);
      });
      gridEl.appendChild(frag);
    }
    updateButtons();
    const infoText = srvTotal ? `Page ${srvPage} / ${srvTotalPages} • ${srvTotal} total` : '—';
    if (pager && pageInfo && prevBtn && nextBtn) {
      pageInfo.textContent = infoText;
      prevBtn.disabled = srvPage <= 1;
      nextBtn.disabled = srvPage >= srvTotalPages;
    }
    if (pagerB && pageInfoB && prevBtnB && nextBtnB) {
      pageInfoB.textContent = infoText;
      prevBtnB.disabled = srvPage <= 1;
      nextBtnB.disabled = srvPage >= srvTotalPages;
    }
    setPagerVisibility(shouldShowPager(srvTotal));
  }
  async function fetchTags() {
    initDom();
    ensureControlsVisible();
    try {
      // Cancel any in-flight request for snappier UX
      Tags._abort && Tags._abort.abort();
      Tags._abort = new AbortController();
      const signal = Tags._abort.signal;
      setStatus('Loading…', true);
      if (gridEl) gridEl.classList.add('loading');
      const url = new URL('/api/tags', window.location.origin);
      if (searchTerm) url.searchParams.set('search', searchTerm);
      url.searchParams.set('page', String(page || 1));
      url.searchParams.set('page_size', String(pageSize || 32));
      const sortSel = document.getElementById('tagSort');
      const sortVal = sortSel ? (sortSel.value === 'name' ? 'name' : 'count') : (sortBy || 'count');
      url.searchParams.set('sort', sortVal);
      // Only override order when diverging from backend default (name->asc, count->desc)
      {
        const defaultOrder = sortVal === 'name' ? 'asc' : 'desc';
        const requestedOrder = (sortDir === 1 ? 'desc' : 'asc');
        if (requestedOrder !== defaultOrder) {
          url.searchParams.set('order', requestedOrder);
        }
      }
      url.searchParams.set('debug', 'false');
      if (needRefresh) url.searchParams.set('refresh', 'true');
      const r = await fetch(url, { signal });
      const j = await r.json();
      const d = j?.data || {};
      tags = d.tags || d.items || [];
      const total = Number(d.total || 0);
      const totalPages = Number(d.total_pages || 1);
      const curPage = Number(d.page || page || 1);
      srvTotal = total;
      srvTotalPages = totalPages;
      srvPage = curPage;
      if (countEl) {
        countEl.textContent = total ? `${total} tag${total === 1 ? '' : 's'}${totalPages > 1 ? ` • showing ${tags.length}` : ''}` : '0 tags';
      }
      if (pageInfo) pageInfo.textContent = total ? `Page ${curPage} / ${totalPages} • ${total} total` : '—';
      if (pageInfoB) pageInfoB.textContent = total ? `Page ${curPage} / ${totalPages} • ${total} total` : '—';
      if (prevBtn) prevBtn.disabled = curPage <= 1;
      if (nextBtn) nextBtn.disabled = curPage >= totalPages;
      if (prevBtnB) prevBtnB.disabled = curPage <= 1;
      if (nextBtnB) nextBtnB.disabled = curPage >= totalPages;
      updatePage(curPage);
      setStatus('', false);
      if (gridEl) gridEl.classList.remove('loading');
      needRefresh = false;
      render();
    }
    catch (e) {
      if (e.name === 'AbortError') return;
      setStatus('Failed to load tags', true);
      if (gridEl) gridEl.classList.remove('loading');
      if (gridEl) {
        gridEl.innerHTML = '';
        const node = tpl('emptyHintTemplate');
        if (node) {
          const el = node.querySelector('.empty-hint');
          if (el) el.textContent = 'Error loading tags.';
          gridEl.appendChild(node);
        }
      }
      devLog('error', e);
    }
  }
  const debounceSearch = debounce(fetchTags, 400);
  function wireEvents() {
    if (searchEl && !searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', () => {
        searchTerm = searchEl.value.trim();
        goToFirstPage();
        debounceSearch();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          searchTerm = '';
          goToFirstPage();
          fetchTags();
        }
      });
    }
    // Rename wiring
    if (renameBtn && !renameBtn._wired) {
      renameBtn._wired = true;
      renameBtn.addEventListener('click', () => {
        if (selected.size !== 1) {
          toastTags('Select exactly one tag to rename', 'is-info');
          return;
        }
        const oldName = Array.from(selected)[0];
        openRenameModal(oldName);
      });
    }
    ensureRenameModalElements();
    if (renamePanel && !renamePanel._wired) {
      renamePanel._wired = true;
      const onInput = () => {
        if (!renameConfirmBtn || !renameInput) return;
        const can = Boolean(renameInput.value.trim());
        renameConfirmBtn.disabled = !can;
      };
      if (renameInput && !renameInput._wired) {
        renameInput._wired = true;
        renameInput.addEventListener('input', onInput);
        renameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !renameConfirmBtn.disabled) doRenameConfirm();
          if (e.key === 'Escape') closeRenameModal();
        });
      }
      if (renameCloseBtn) renameCloseBtn.addEventListener('click', closeRenameModal);
      if (renameCancelBtn) renameCancelBtn.addEventListener('click', closeRenameModal);
      if (renameConfirmBtn) renameConfirmBtn.addEventListener('click', doRenameConfirm);
      // backdrop click to close
      renamePanel.addEventListener('click', (e) => {
        if (e.target === renamePanel) closeRenameModal();
      });
    }
    const sortSel = document.getElementById('tagSort');
    const sortOrderBtn = document.getElementById('tagSortOrder');
    if (sortSel && !sortSel._wired) {
      sortSel._wired = true;
      sortSel.addEventListener('change', async () => {
        sortBy = sortSel.value === 'name' ? 'name' : 'count';
        sortDir = (sortBy === 'name') ? -1 : 1;
        applySortButtonLabel();
        goToFirstPage();
        await fetchTags();
      });
    }
    if (sortOrderBtn && !sortOrderBtn._wired) {
      sortOrderBtn._wired = true;
      applySortButtonLabel();
      sortOrderBtn.addEventListener('click', async () => {
        sortDir = sortDir === 1 ? -1 : 1;
        applySortButtonLabel();
        goToFirstPage();
        await fetchTags();
      });
    }
    const handlePrev = async () => {
      if (page > 1) {
        updatePage(page - 1);
        await fetchTags();
      }
    };
    const handleNext = async () => {
      updatePage(page + 1);
      await fetchTags();
    };
    if (prevBtn && !prevBtn._wired) {
      prevBtn._wired = true;
      prevBtn.addEventListener('click', handlePrev);
    }
    if (nextBtn && !nextBtn._wired) {
      nextBtn._wired = true;
      nextBtn.addEventListener('click', handleNext);
    }
    if (prevBtnB && !prevBtnB._wired) {
      prevBtnB._wired = true;
      prevBtnB.addEventListener('click', handlePrev);
    }
    if (nextBtnB && !nextBtnB._wired) {
      nextBtnB._wired = true;
      nextBtnB.addEventListener('click', handleNext);
    }
    if (autoMatchBtn && !autoMatchBtn._wired) {
      autoMatchBtn._wired = true;
      autoMatchBtn.addEventListener('click', runAutoMatch);
    }
    if (addTagBtn && !addTagBtn._wired) {
      addTagBtn._wired = true;
      addTagBtn.addEventListener('click', async () => {
        const raw = prompt('New tag name:');
        const name = raw ? raw.trim() : '';
        if (!name) return;
        try {
          const resp = await fetch('/api/registry/tags/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          if (!resp.ok) throw new Error('Failed');
          if (window.showToast) window.showToast('Tag added', 'is-success');
          needRefresh = true;
          await fetchTags();
        }
        catch (err) {
          if (window.showToast) window.showToast(err?.message || 'Failed to add tag', 'is-error');
        }
      });
    }
    // Drop zone wiring (drag/drop and click-to-open)
    if (dropZone && !dropZone._wired) {
      dropZone._wired = true;
      // click, dblclick, keydown just open file input
      const openFile = () => {
        const fi = document.getElementById('tagImportFile');
        if (fi && typeof fi.click === 'function') {
          fi.click();
        }
      };
      dropZone.addEventListener('click', openFile);
      dropZone.addEventListener('dblclick', openFile);
      dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFile();
        }
      });
      // Drag and drop file/text
      const isPanelActive = () => {
        const panel = document.getElementById('tags-panel');
        return panel && !panel.hasAttribute('hidden');
      };
      let over = false;
      function showHover() {
        if (dropZone) dropZone.classList.add('drag-hover');
      }
      function clearHover() {
        if (dropZone) dropZone.classList.remove('drag-hover');
      }
      function wantsIntercept(dt) {
        return Boolean(dt) && (dt.types?.includes('Files') || dt.types?.includes('text/plain') || (dt.files && dt.files.length));
      }
      async function readPayload(dt) {
        if (!dt) return '';
        let out = '';
        const items = dt.items ? [...dt.items] : [];
        for (const it of items) {
          if (it.kind === 'string') {
            out = await new Promise((r) => it.getAsString(r));
            if (out) return out;
          }
        }
        if (dt.files && dt.files.length) {
          for (const f of dt.files) {
            if (f.type.startsWith('text/') || /\.(txt|csv|json)$/i.test(f.name)) {
              out = await f.text();
              if (out) return out;
            }
          }
        }
        return out;
      }
      document.addEventListener('dragover', (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!over) {
          over = true;
          showHover();
        }
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }, true);
      document.addEventListener('dragenter', (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        over = true;
        showHover();
      }, true);
      document.addEventListener('dragleave', (e) => {
        if (!isPanelActive()) return;
        if (!over) return;
        over = false;
        clearHover();
      }, true);
      document.addEventListener('drop', async (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        over = false;
        clearHover();
        try {
          const text = await readPayload(e.dataTransfer);
          if (text) {
            setStatus('Importing…', true);
            // Accept bare array or newline-separated
            let payload;
            try {
              const js = JSON.parse(text);
              payload = {tags: js.tags || js, replace: false};
            }
            catch (_) {
              const lines = text
                .split(/[\r\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              payload = {tags: lines, replace: false};
            }
            await fetch('/api/registry/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
            needRefresh = true;
            await fetchTags();
          }
        }
        catch (err) {
          devLog('warn', 'tags drop failed', err);
          setStatus('Import failed', true);
          setTimeout(() => setStatus('', false), 1500);
        }
      }, true);
    }
    const handlePageSizeChange = async (sel) => {
      const v = parseInt(sel.value, 10);
      if (Number.isFinite(v) && v > 0) {
        updatePageSize(v);
        syncPageSizeSelectors();
        goToFirstPage();
        await fetchTags();
      }
    };
    if (pageSizeSel && !pageSizeSel._wired) {
      pageSizeSel._wired = true;
      pageSizeSel.addEventListener('change', () => handlePageSizeChange(pageSizeSel));
    }
    if (pageSizeSelB && !pageSizeSelB._wired) {
      pageSizeSelB._wired = true;
      pageSizeSelB.addEventListener('change', () => handlePageSizeChange(pageSizeSelB));
    }
    // Import/Merge/Delete wiring
    if (importBtn && !importBtn._wired) {
      importBtn._wired = true;
      importBtn.addEventListener('click', () => importFile && importFile.click());
    }
    if (importFile && !importFile._wired) {
      importFile._wired = true;
      importFile.addEventListener('change', async (e) => {
        const f = e.target && e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const json = JSON.parse(text);
          const payload = {tags: json.tags || json, replace: false};
          const r = await fetch('/api/registry/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
          if (r.ok) {
            if (window.showToast) window.showToast('Imported', 'is-success');
            needRefresh = true;
            await fetchTags();
          }
          else {
            if (window.showToast) window.showToast('Import failed', 'is-error');
          }
        }
        catch (_) {
          if (window.showToast) window.showToast('Invalid JSON', 'is-error');
        }
        finally {
          e.target.value = '';
        }
      });
    }
    if (mergeBtn && !mergeBtn._wired) {
      mergeBtn._wired = true;
      mergeBtn.addEventListener('click', async () => {
        devLog(`[Tags:mergeBtn:click] size=${selected.size} selected=${Array.from(selected).join(',')}`);
        if (selected.size < 2) {
          toastTags('Select at least two tags to merge', 'is-info');
          devLog('[Tags:mergeBtn:click] not-enough-selected');
          return;
        }
        const arr = [...selected];
        devLog('[Tags:mergeBtn:click] opening-modal', { names: arr });
        openMergeModal(arr);
      });
    }
    // Wire Merge modal interactions once
    ensureMergeModalElements();
    if (mergePanel && !mergePanel._wired) {
      mergePanel._wired = true;
      const escHandler = (e) => {
        if (e.key === 'Escape') closeMergeModal();
      };
      mergePanel.addEventListener('click', (e) => {
        if (e.target === mergePanel) closeMergeModal();
      });
      if (mergeCloseBtn) mergeCloseBtn.addEventListener('click', closeMergeModal);
      if (mergeCancelBtn) mergeCancelBtn.addEventListener('click', closeMergeModal);
      if (mergeChoiceList) {
        mergeChoiceList.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && mergeConfirmBtn && !mergeConfirmBtn.disabled) {
            e.preventDefault();
            mergeConfirmBtn.click();
          }
        });
      }
      if (mergeConfirmBtn) {
        mergeConfirmBtn.addEventListener('click', async () => {
          const rawSelection = Array.from(selected || []);
          devLog('log', '[Tags:mergeModal:confirm:click] start', { size: rawSelection.length, selected: rawSelection });
          if (rawSelection.length < 2) {
            toastTags('Select at least two tags to merge', 'is-info');
            closeMergeModal();
            return;
          }
          const intoName = (mergeChoiceValue || '').trim();
          if (!intoName) return;
          const selection = rawSelection
            .map((name) => (name || '').trim())
            .filter(Boolean);
          if (selection.length < 2) {
            toastTags('Select at least two tags to merge', 'is-info');
            closeMergeModal();
            return;
          }
          const destKey = intoName.toLowerCase();
          let sources = selection.filter((name) => name.toLowerCase() !== destKey);
          if (!sources.length && selection.length >= 2) {
            sources = [...selection];
          }
          const seenLower = new Set();
          sources = sources.filter((name) => {
            const key = name.toLowerCase();
            if (seenLower.has(key)) return false;
            seenLower.add(key);
            return true;
          });
          if (!sources.length) {
            toastTags('Nothing to merge. Pick a different destination name.', 'is-info');
            mergeConfirmBtn.disabled = false;
            return;
          }
          mergeConfirmBtn.disabled = true;
          try {
            for (const src of sources) {
              const params = new URLSearchParams({ from_name: src, into_name: intoName });
              const url = `/api/registry/tags/merge?${params.toString()}`;
              devLog('log', '[Tags:mergeModal:confirm] request', { url, src, intoName });
              const resp = await fetch(url, { method: 'POST' });
              if (!resp.ok) {
                let errMsg = 'Merge failed';
                const payload = await resp.json();
                errMsg = payload?.error || errMsg;
                throw new Error(errMsg);
              }
            }
            if (window.showToast) {
              const count = sources.length;
              window.showToast(`Merged ${count} tag${count === 1 ? '' : 's'} into '${intoName}'`, 'is-success');
            }
            closeMergeModal();
            selected.clear();
            needRefresh = true;
            await fetchTags();
          }
          catch (err) {
            devLog('warn', '[Tags:mergeModal:confirm] error', err);
            if (window.showToast) window.showToast(err?.message || 'Merge failed', 'is-error');
          }
          finally {
            mergeConfirmBtn.disabled = false;
          }
        });
      }
      document.addEventListener('keydown', escHandler);
    }
    if (deleteBtn && !deleteBtn._wired) {
      deleteBtn._wired = true;
      deleteBtn.addEventListener('click', async () => {
        if (!selected.size) return;
        // Use global confirmDeletesEnabled preference if present
        if (typeof confirmDeletesEnabled === 'undefined' || confirmDeletesEnabled) {
          if (!confirm(`Delete ${selected.size} tag(s)?`)) return;
        }
        try {
          const slugToName = (slug) => {
            const hit = tags.find((t) => (t.slug || _slugify(t.name || '')) === slug);
            return (hit && hit.name) || slug;
          };
          let deletedCount = 0;
          for (const slug of Array.from(selected)) {
            const name = slugToName(slug);
            const resp = await fetch('/api/registry/tags/delete', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({name}),
            });
            if (!resp.ok) {
              let errMsg = 'Delete failed';
              const payload = await resp.json();
              errMsg = payload?.error || errMsg;
              throw new Error(errMsg);
            }
            deletedCount++;
          }
          selected.clear();
          needRefresh = true;
          await fetchTags();
          if (window.showToast) {
            const msg = deletedCount > 1 ? `Deleted ${deletedCount} tags` : 'Deleted';
            window.showToast(msg, 'is-success');
          }
        }
        catch (err) {
          if (window.showToast) window.showToast(err?.message || 'Delete failed', 'is-error');
        }
      });
    }
  }
  async function doRenameConfirm() {
    if (!renameInput) return;
    if (selected.size !== 1) {
      toastTags('Select exactly one tag to rename', 'is-info');
      closeRenameModal();
      return;
    }
    const oldName = Array.from(selected)[0] || '';
    const newName = (renameInput.value || '').trim();
    devLog('log', `[Tags:renameConfirm] old="${oldName}" new="${newName}"`);
    if (!newName || !oldName || newName === oldName) {
      closeRenameModal();
      return;
    }
    try {
      const r = await fetch('/api/registry/tags/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: oldName, new_name: newName }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (j && j.error) ? String(j.error) : `Rename failed (${r.status})`;
        if (window.showToast) window.showToast(msg, 'is-error');
        devLog('log', `[Tags:renameConfirm] error ${msg}`);
        return;
      }
      if (window.showToast) window.showToast('Renamed', 'is-success');
      closeRenameModal();
      selected.clear();
      needRefresh = true;
      await fetchTags();
    }
    catch (_) {
      if (window.showToast) window.showToast('Rename failed', 'is-error');
    }
  }
  async function showTags() {
    if (!page) updatePage(1);
    await fetchTags();
  }
  // Fetch all tags across pages and print name/count to console (non-UI)
  async function logAll() {
    try {
      let p = 1;
      let totalPages = 1;
      const pageSizeAll = 500;
      const rows = [];
      do {
        const url = new URL('/api/tags', window.location.origin);
        url.searchParams.set('page', String(p));
        url.searchParams.set('page_size', String(pageSizeAll));
        url.searchParams.set('sort', 'name');
        url.searchParams.set('order', 'asc');
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) break;
        const j = await r.json();
        const d = j?.data || {};
        const list = d.tags || d.items || [];
        totalPages = Number(d.total_pages || 1);
        for (const t of list) {
          rows.push({ name: t.name, count: Number(t.count || 0) });
        }
        p++;
      } while (p <= totalPages);
      const total = rows.length;
      const sum = rows.reduce((acc, x) => acc + (Number.isFinite(x.count) ? x.count : 0), 0);
      if (debugEnabled()) console.groupCollapsed('All tags (name, count)');
      try {
        if (debugEnabled()) console.table(rows);
      }
      catch (_) {
        devLog('log', rows);
      }
      devLog('log', `Total tags: ${total}, total file refs across tags: ${sum}`);
      if (debugEnabled()) console.groupEnd();
    }
    catch (e) {
      devLog('warn', 'Failed to retrieve all tags', e);
    }
  }

  /*   function debugMerge(a = 'Vintage', b = 'vintage') {
    try {
      devLog('log', '[Tags:debugMerge] attempting to open modal', { a, b }); initDom();
      ensureControlsVisible();
      openMergeModal([a, b]);
    }
      catch (e) { devLog('warn', '[Tags:debugMerge] failed', e); }
  } */
  /*   function debugState() {
    try {
      const btn = typeof mergeBtn !== 'undefined' ? mergeBtn : document.getElementById('tagMergeBtn');
      const del = typeof deleteBtn !== 'undefined' ? deleteBtn : document.getElementById('tagDeleteBtn');
      const panel = typeof mergePanel !== 'undefined' ? mergePanel : document.getElementById('tagMergeModal');
      if (debugEnabled())
        devLog('[Tags:debugState]', {
          selected: Array.from(selected || []),
          mergeDisabled: btn ? btn.disabled : undefined,
          deleteDisabled: del ? del.disabled : undefined,
          hasPanel: !!panel,
          panelHidden: panel ? panel.hidden : undefined
        });
    }
        catch (e) {
      devLog('warn', '[Tags:debugState] failed', e);
    }
  } */
  return {show: showTags, autoMatchSelected: runAutoMatch, logAll/* , debugMerge, debugState */};
})();
window.Tags = Tags;
// Hook tab switch to load tags when opened
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-tab="tags"]');
  if (!btn) return;
  if (window.Tags) window.Tags.show();
});
window.addEventListener('tabchange', (ev) => {
  const active = ev && ev.detail && ev.detail.activeTab;
  if (active === 'tags' && window.Tags) {
    setTimeout(() => window.Tags && window.Tags.show(), 30);
  }
});
const hash = (window.location.hash || '').replace(/^#/, '');
if (hash === 'tags' && window.Tags) {
  setTimeout(() => window.Tags && window.Tags.show(), 50);
}
// Fallback direct wiring: ensure clicking the Import button always opens the file picker
// This acts even if the Performers module didn't wire events yet.
(function ensurePerformerImportButtonClick() {
  function wire() {
    const btn = document.getElementById('performerImportBtn');
    if (!btn || btn._directClick) return;
    btn._directClick = true;
    btn.addEventListener('click', (ev) => {
      const fi = document.getElementById('performerFileInput');
      if (fi && typeof fi.click === 'function') {
        fi.click();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, {once: true});
  }
  else {
    wire();
  }
})();

// Tasks System
const ACTIVE_JOB_STATES = new Set([
  'running',
  'queued',
  'pending',
  'starting',
  'paused',
  'waiting',
  'retrying',
  'restoring',
  'scheduled',
]);

class TasksManager {
  constructor () {
    this.jobs = new Map();
    this.coverage = {};
    this.orphanFiles = [];
    this._lastRepairPreview = [];
    this._repairStreamController = null;
    this._lastOrphanFetch = 0;
    this._orphanFetchPromise = null;
    this._lastOrphanData = null;
    this._coverageInflight = null;
    this._coverageCooldownUntil = 0;
    // Capabilities loaded from /config
    this.capabilities = {
      ffmpeg: true,
      ffprobe: true,
    };
    // Multi-select filters: empty set means "no filtering" (show all). User can narrow by toggling cards.
    // This also ensures completed / failed history is visible immediately on first load.
    this.activeFilters = new Set();
    this._jobRows = new Map();
    // id -> tr element for stable rendering
    this._jobPollTimer = null;
    this._jobPollInFlight = null;
    this._activePollSuspended = false;
    this._idlePollTimer = null;
    this._idlePollBackoffMs = 15000;
    this.init();
  }
  init() {
    this.initEventListeners();
    // SSE + polling are now strictly tied to the Tasks tab being active
    // (no background polling while hidden)
    this.startJobPolling();
    // Immediate first jobs fetch so table populates without waiting for passive poll interval
    // (and adjust container height once rows exist)
    setTimeout(() => {
      this.refreshJobs()?.then(() => this.ensureJobTableShowsSomeRows());
    }, 40);
    // Load backend capabilities and apply UI gating
    this.loadConfigAndApplyGates();
    this.loadCoverage();
    this.wireGenerateAll();
    // Initialize resizer for job queue container
    setTimeout(() => this.initJobQueueResizer(), 0);
    // Fetch server defaults, then hydrate option inputs (with local overrides) & add validation/tooltips
    setTimeout(() => this.loadDefaultsAndHydrate(), 0);
    // Persist changes on any option input change
    setTimeout(() => this.wireOptionPersistence(), 0);
    // Local elapsed time updater: refresh end-time (elapsed) display every second while viewing Tasks
    if (!this._elapsedTimer) {
      this._elapsedTimer = setInterval(() => {
        const activeTab = window.tabSystem && window.tabSystem.getActiveTab ? window.tabSystem.getActiveTab() : null;
        if (activeTab === 'tasks') {
          this.updateRunningVisuals();
        }
      }, 1000);
    }
    // Initialize pause/resume controls
    setTimeout(() => this.initPauseResumeControls(), 0);
    // Start/stop SSE and polling strictly on tab visibility
    window.addEventListener('tabchange', (e) => {
      const active = e && e.detail && e.detail.activeTab;
      if (active === 'tasks') {
        this._startPollingNow && this._startPollingNow();
        this.refreshJobs();
        this.loadCoverage();
        // Attach SSE only when explicitly enabled by config and not marked unavailable
        if (window.__JOBS_SSE_ENABLED && !window.__JOBS_SSE_UNAVAILABLE) {
          this.initJobEvents && this.initJobEvents();
        }
      }
      else {
        this._stopPollingNow && this._stopPollingNow();
      }
    });
    if (window.tabSystem && window.tabSystem.getActiveTab && window.tabSystem.getActiveTab() === 'tasks') {
      this._startPollingNow && this._startPollingNow();
      this.refreshJobs();
      this.loadCoverage();
      if (window.__JOBS_SSE_ENABLED && !window.__JOBS_SSE_UNAVAILABLE) {
        this.initJobEvents && this.initJobEvents();
      }
    }
  }
  async _initialActiveCheck() {
    // Small delay to allow freshly queued jobs to persist if init races with job enqueue
    await new Promise((r) => setTimeout(r, 150));
    const r = await fetch('/api/tasks/jobs', {headers: {Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const jobs = j?.data?.jobs || [];
    let hasActive = false;
    for (const jb of jobs) {
      const st = (jb?.state || '').toLowerCase();
      if (st === 'running' || st === 'queued' || st === 'pending' || st === 'starting') {
        hasActive = true;
        break;
      }
    }
    if (hasActive && window.tabSystem && window.tabSystem.getActiveTab && window.tabSystem.getActiveTab() !== 'tasks') {
      window.tabSystem.switchToTab('tasks');
    }
    // Update display immediately so user sees queue without waiting for first interval tick
    if (Array.isArray(jobs) && jobs.length) {
      this.updateJobsDisplay(jobs);
      const stats = j?.data?.stats;
      if (stats) this.updateJobStats(stats);
    }
    this.refreshJobs();
  }
  async loadConfigAndApplyGates() {
    const r = await fetch('/config', {
      headers: {Accept: 'application/json' },
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data || j || {};
      const deps = data.deps || {};
      const caps = data.capabilities || {};
      const feats = data.features || {};
      // Normalize booleans, fallback to /health-style top-level if present
      this.capabilities.ffmpeg = Boolean(deps.ffmpeg ?? data.ffmpeg ?? true);
      this.capabilities.ffprobe = Boolean(
        deps.ffprobe ?? data.ffprobe ?? true,
      );
      window.__JOBS_SSE_ENABLED = Boolean(feats.jobs_sse);
      // Now that we know if SSE exists, decide whether to attach
      if (window.__JOBS_SSE_ENABLED && !window.__JOBS_SSE_UNAVAILABLE) {
        this.initJobEvents();
      }
      else {
        window.__JOBS_SSE_UNAVAILABLE = true;
      }
      window.__capabilities = { ...this.capabilities};
    }
    this.applyCapabilityGates();
    this.updateCapabilityBanner();
  }
  canRunOperation(op) {
    // Accept full op (e.g., "thumbnail-missing") or base (e.g., "thumbnail")
    const raw = String(op || '').replace(/-(all|missing)$/, '');
    const base = normalizeArtifactKey(raw) || raw;
    const caps = this.capabilities || {};
    if (artifactRequiresFfmpeg(base)) return Boolean(caps.ffmpeg);
    // metadata and others default to allowed
    return true;
  }
  async loadDefaultsAndHydrate() {
    const r = await fetch('/api/tasks/defaults');
    if (!r.ok) {
      throw new Error('HTTP ' + r.status);
    }
    const j = await r.json();
    const data = j?.data || j || {};
    this.defaults = data;
    // For each artifact defaults entry, set inputs if not locally overridden
    const LS_KEY = 'mediaPlayer:artifactOptions';
    let saved = {};
    saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
    const applyVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (saved && saved[id] !== undefined) return;
      // user override
      if (el.type === 'checkbox') el.checked = Boolean(val);
      else el.value = val;
    };
    // Mapping artifact -> input ids
    const map = {
      thumbnail: {offset: 'thumbnailOffset' },
      sprites: {interval: 'spriteInterval', width: 'spriteWidth', cols: 'spriteCols', rows: 'spriteRows', quality: 'spriteQuality' },
      preview: {segments: 'previewSegments', duration: 'previewDuration', width: 'previewWidth' },
      phash: {frames: 'phashFrames', algorithm: 'phashAlgo' },
      markers: {threshold: 'markerThreshold', limit: 'markerLimit' },
      heatmap: {interval: 'heatmapInterval', mode: 'heatmapMode', png: 'heatmapPng' },
    };
    Object.entries(map).forEach(([art, fields]) => {
      const def = data[art] || {};
      Object.entries(fields).forEach(([k, id]) => {
        if (def[k] !== undefined) applyVal(id, def[k]);
      });
    });
    // Attach tooltips/help text (idempotent)
    this.applyOptionTooltips();
    // Attach validators to numeric inputs
    this.attachOptionValidators();
  }
  wireOptionPersistence() {
    const LS_KEY = 'mediaPlayer:artifactOptions';
    let cache = {};
    cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
    const persist = () => {
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
    };
    const sel = '#spritesOptions input, #previewOptions input, #thumbnailOptions input, #phashOptions select, #phashOptions input, #markersOptions input, #heatmapOptions input, #heatmapOptions select';
    document.querySelectorAll(sel).forEach((el) => {
      if (el._persistWired) return;
      el._persistWired = true;
      const handler = () => {
        const id = el.id;
        if (!id) return;
        cache[id] = (el.type === 'checkbox') ? el.checked : el.value;
        persist();
      };
      el.addEventListener('change', handler);
      el.addEventListener('blur', handler);
      el.addEventListener('input', (e) => {
        // Live validate number fields to avoid bad submissions
        if (el.type === 'number') this.validateNumericInput(el);
      });
    });
  }
  applyOptionTooltips() {
    const tips = {
      spriteRows: 'Number of rows in sprite sheet grid. Higher rows * columns increases coverage per sheet.',
      spriteQuality: 'JPEG quality (0 best / largest, 8 smallest / worst) scaled to backend expectation.',
      previewWidth: 'Target width in pixels for each hover segment video.',
      heatmapInterval: 'Sampling interval (seconds) for frame statistics.',
      heatmapMode: 'Metric: brightness, motion, color, or both combined (legacy composite).',
      heatmapPng: 'Whether to write a PNG stripe alongside JSON data (uses extra disk).',
      phashAlgo: 'Hash algorithm for perceptual similarity matching.',
      spriteInterval: 'Seconds between sprite capture frames.',
      spriteWidth: 'Scaled width for each captured frame before compositing.',
    };
    Object.entries(tips).forEach(([id, tip]) => {
      const el = document.getElementById(id);
      if (el && !el.title) el.title = tip;
    });
  }
  attachOptionValidators() {
    const numericIds = [
      'spriteInterval',
      'spriteWidth',
      'spriteCols',
      'spriteRows',
      'spriteQuality',
      'previewSegments',
      'previewDuration',
      'previewWidth',
      'phashFrames',
      'markerThreshold',
      'markerLimit',
      'heatmapInterval',
      'thumbnailOffset',
    ];
    numericIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el._valWired) return;
      el._valWired = true;
      el.addEventListener('blur', () => this.validateNumericInput(el));
    });
  }
  validateNumericInput(el) {
    if (!el) return;
    if (el.type !== 'number') return;
    const min = (el.min !== '' && !isNaN(parseFloat(el.min))) ? parseFloat(el.min) : null;
    const max = (el.max !== '' && !isNaN(parseFloat(el.max))) ? parseFloat(el.max) : null;
    let val = parseFloat(el.value);
    if (isNaN(val)) {
      if (min !== null) val = min;
      else return;
    }
    if (min !== null && val < min) val = min;
    if (max !== null && val > max) val = max;
    // Enforce integers where step is 1 or original value looked integer
    const step = el.step && !isNaN(parseFloat(el.step)) ? parseFloat(el.step) : null;
    if (step === 1 || (Number.isInteger(parseFloat(el.value)) && (!el.step || parseFloat(el.step) === 1))) {
      val = Math.round(val);
    }
    el.value = String(val);
  }
  applyCapabilityGates() {
    const caps = this.capabilities || {};
    const disableIf = (selector, disable, title) => {
      document.querySelectorAll(selector).forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        btn.disabled = Boolean(disable);
        if (title) btn.title = title;
      });
    };
    // FFmpeg-dependent
    const ffmpegMissing = !caps.ffmpeg;
    if (ffmpegMissing) {
      disableIf('[data-operation="thumbnail-missing"], [data-operation="thumbnail-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="preview-missing"], [data-operation="preview-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="sprites-missing"], [data-operation="sprites-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="markers-missing"], [data-operation="markers-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="heatmap-missing"], [data-operation="heatmap-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="phash-missing"], [data-operation="phash-all"]', true, 'Disabled: FFmpeg not detected');
      // Player badges
      ['badgeHeatmap', 'badgeMarkers', 'badgeSprites', 'badgePreview', 'badgePhash'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = true;
          el.title = 'Disabled: FFmpeg not detected';
        }
      });
    }
  }
  updateCapabilityBanner() {
    const caps = this.capabilities || {};
    const issues = [];
    if (!caps.ffmpeg) {
      issues.push(
        'FFmpeg not detected — thumbnails, previews, sprites, markers, heatmap, and pHash are disabled.',
      );
    }
    let banner = document.getElementById('capabilityBanner');
    // Where to insert: top of the tasks panel container
    const tasksPanel = document.getElementById('tasks-panel');
    const container = tasksPanel ? tasksPanel.querySelector('.tasks-container') : null;
    if (!container) return;
    if (issues.length === 0) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'capabilityBanner';
      banner.className = 'capability-banner';
      container.insertBefore(banner, container.firstChild);
    }
    // Populate banner content safely
    banner.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Tools notice:';
    banner.appendChild(strong);
    banner.appendChild(document.createTextNode(' ' + issues.join(' ')));
    // Add a small dismiss control. If only embeddings warning, persist the dismissal; otherwise hide once.
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn btn-link btn-dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.style.marginLeft = '0.5rem';
    dismiss.addEventListener('click', () => {
      banner.remove();
    });
    banner.appendChild(dismiss);
  }
  initJobEvents() {
    // Respect feature gating from /config to avoid 404 probes
    if (!window.__JOBS_SSE_ENABLED) return;
    // Avoid any preflight fetches that can 404; attach directly to the canonical stream.
    if (window.__JOBS_SSE_UNAVAILABLE) return;
    // If an EventSource already exists, don't attach twice
    if (this._jobEventSource && this._jobEventSource.readyState !== 2) return;
    const url = '/jobs/events';
    const throttle = 400;
    const attach = () => {
      let es;
      try {
        es = new EventSource(url);
      }
      catch (_) {
        window.__JOBS_SSE_UNAVAILABLE = true;
        localStorage.setItem('jobs:sse', 'off');
        return false;
      }
      this._jobEventsUrl = url;
      let lastUpdate = 0;
      const doRefresh = () => {
        const now = Date.now();
        if (now - lastUpdate > throttle) {
          lastUpdate = now;
          this.refreshJobs();
          this.loadCoverage();
        }
      };
      es.onmessage = (e) => {
        const payload = JSON.parse(e.data);
        if (payload.event) doRefresh();
      };
      [
        'created',
        'queued',
        'started',
        'progress',
        'current',
        'finished',
        'result',
        'cancel',
      ].forEach((type) => es.addEventListener(type, (evt) => {
        if (evt && evt.data) {
          const payload = JSON.parse(evt.data);
          const rawArt = payload.artifact ?? payload.type;
          const art = normalizeArtifactKey(rawArt);
          const file = payload.file || payload.path;
          if (art && file) {
            // Register spinner for active states; clear when finished/cancel/error
            const term = (payload.event === 'finished') || (payload.event === 'cancel');
            if (!term) {
              // Only show spinner if this job relates to the currently open file
              if (file === (window.currentPath || currentPath)) {
                window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
                const key = `${file}::${art}`;
                if (!window.__activeArtifactSpinners.has(key)) {
                  window.__activeArtifactSpinners.set(key, {path: file, artifact: art, since: Date.now(), manual: false});
                }
                setArtifactSpinner(art, true);
              }
            }
            else {
              // Terminal event: remove spinner if it belongs to current file
              const activePathSSE = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
              if (file === activePathSSE) {
                setArtifactSpinner(art, false);
                window.__activeArtifactSpinners?.delete?.(`${file}::${art}`);
                loadArtifactStatuses?.();
                // If a thumbnail job just finished for the currently open file, refresh sidebar thumbnail immediately.
                if (art === 'thumbnail') {
                  (async () => {
                    if (typeof refreshSidebarThumbnail === 'function') {
                      // Try a quick series of rapid attempts (micro-poll) to beat any FS latency
                      let ok = await refreshSidebarThumbnail(file);
                      if (!ok) {
                        let attempts = 0;
                        while (attempts < 6 && !ok) {
                          await new Promise((r) => setTimeout(r, 140 * (attempts + 1))); // 140ms, 280ms, ...
                          ok = await refreshSidebarThumbnail(file);
                          attempts++;
                        }
                      }
                    }
                  })();
                }
              }
            }
          }
        }
        this.updateTasksTabCountLight();
        doRefresh();
      }));
      es.onopen = () => {
        if (typeof this._onJobEventsConnected === 'function') {
          this._onJobEventsConnected();
        }
      };
      es.onerror = () => {
        es.close();
        window.__JOBS_SSE_UNAVAILABLE = true;
        localStorage.setItem('jobs:sse', 'off');
      };
      this._jobEventSource = es;
      return true;
    };
    attach();
  }
  stopJobEvents() {
    try {
      if (this._jobEventSource) {
        this._jobEventSource.close();
      }
    } finally {
      this._jobEventSource = null;
    }
  }
  initEventListeners() {
    // Batch operation buttons
    document.querySelectorAll('[data-operation]').forEach((btn) => {
      // Avoid attaching duplicate listeners
      if (btn._opHandlerAttached) return;
      btn._opHandlerAttached = true;
      btn.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const operation = button.dataset.operation;
        await this.handleBatchOperation(operation);
      });
    });
    // File selection change
    document
      .querySelectorAll('input[name="fileSelection"]')
      .forEach((radio) => {
        radio.addEventListener('change', () => {
          this.updateSelectedFileCount();
          this.updateCoverageDisplay();
        });
      });
    // Listen for tab changes to update selected file count and load initial data
    window.addEventListener('tabchange', (e) => {
      if (e.detail.activeTab === 'tasks') {
        this.updateSelectedFileCount();
        // Load coverage and jobs when switching to tasks tab
        this.loadCoverage();
        this.refreshJobs();
      }
      // Load stats lazily when the stats tab is shown
      if (e.detail.activeTab === 'stats') {
        if (typeof loadStats === 'function') loadStats();
      }
    });
    // Job stat filters
    const filterActive = document.getElementById('filterActive');
    const filterQueued = document.getElementById('filterQueued');
    const filterCompleted = document.getElementById('filterCompleted');
    const filterErrored = document.getElementById('filterErrored');
    const allFilters = [
      filterActive,
      filterQueued,
      filterCompleted,
      filterErrored,
    ];
    const refreshCardStates = () => {
      allFilters.forEach((el) => {
        if (!el) return;
        const key = el.dataset.filter;
        el.classList.toggle('active', this.activeFilters.has(key));
      });
    };
    const toggle = (which) => {
      if (this.activeFilters.has(which)) {
        this.activeFilters.delete(which);
      }
      else {
        this.activeFilters.add(which);
      }
      refreshCardStates();
      this.renderJobsTable();
      this.ensureJobTableShowsSomeRows();
    };
    if (filterActive) filterActive.addEventListener('click', () => toggle('running'));
    if (filterQueued) filterQueued.addEventListener('click', () => toggle('queued'));
    if (filterCompleted) filterCompleted.addEventListener('click', () => toggle('completed'));
    if (filterErrored) filterErrored.addEventListener('click', () => toggle('failed'));
    // Set initial visual state: running+queued active, completed inactive
    refreshCardStates();
    // Clear Completed button
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn && !clearBtn._wired) {
      clearBtn._wired = true;
      clearBtn.addEventListener('click', async () => {
        try {
          clearBtn.disabled = true;
          clearBtn.classList.add('btn-busy');
          const r = await fetch('/api/tasks/jobs/clear-completed', {method: 'POST' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const removed = data?.data?.removed ?? 0;
          this.showNotification(`Removed ${removed} completed job(s)`, 'success');
          // Refresh jobs table; hide button if nothing left to clear
          const jobs = await this.refreshJobs();
          // Force immediate stats recompute to avoid stale failed count until next poll
          if (jobs && Array.isArray(jobs)) {
            // Replace internal cache before recompute
            this.jobs = new Map(jobs.map((j) => [j.id, j]));
            if (typeof this.updateJobStats === 'function') {
              // Stats will be derived from this.jobs
              this.updateJobStats({});
            }
          }
          if (removed > 0 && typeof this.renderJobsTable === 'function') this.renderJobsTable();
          if (removed === 0) hide(clearBtn);
        }
        catch (e) {
          this.showNotification('Failed to clear completed jobs', 'error');
        }
        finally {
          clearBtn.classList.remove('btn-busy');
          clearBtn.disabled = false;
        }
      });
    }
    // Explicitly wire Cancel Queued / Cancel All once
    const cancelQueuedBtn = document.getElementById('cancelQueuedBtn');
    if (cancelQueuedBtn && !cancelQueuedBtn._wired) {
      cancelQueuedBtn._wired = true;
      cancelQueuedBtn.addEventListener('click', async () => {
        try {
          cancelQueuedBtn.disabled = true;
          cancelQueuedBtn.classList.add('btn-busy');
          const res = await fetch('/api/tasks/jobs/cancel-queued', {
            method: 'POST',
          });
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          this.showNotification('Queued jobs canceled', 'success');
          await this.refreshJobs();
        }
        catch (e) {
          this.showNotification('Failed to cancel queued jobs', 'error');
        }
        finally {
          cancelQueuedBtn.classList.remove('btn-busy');
          cancelQueuedBtn.disabled = false;
        }
      });
    }
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (cancelAllBtn && !cancelAllBtn._wired) {
      cancelAllBtn._wired = true;
      cancelAllBtn.addEventListener('click', async () => {
        try {
          cancelAllBtn.disabled = true;
          cancelAllBtn.classList.add('btn-busy');
          const res = await fetch('/api/tasks/jobs/cancel-all', {
            method: 'POST',
          });
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          this.showNotification(
            'All pending and running jobs asked to cancel',
            'success',
          );
          await this.refreshJobs();
        }
        catch (e) {
          this.showNotification('Failed to cancel all jobs', 'error');
        }
        finally {
          cancelAllBtn.classList.remove('btn-busy');
          cancelAllBtn.disabled = false;
        }
      });
    }
  }
  async getPauseState() {
    try {
      const r = await fetch('/api/tasks/pause');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return Boolean(j && j.data && j.data.paused);
    }
    catch (_) {
      return false;
    }
  }
  async setPauseState(paused) {
    const url = new URL('/api/tasks/pause', window.location.origin);
    url.searchParams.set('paused', paused ? 'true' : 'false');
    const r = await fetch(url.toString(), {method: 'POST' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return Boolean(j && j.data && j.data.paused);
  }
  async initPauseResumeControls() {
    const toggleBtn = document.getElementById('pauseToggleBtn');
    if (!toggleBtn) return;
    const iconUse = () => toggleBtn.querySelector('use');
    const labelSpan = () => toggleBtn.querySelector('span');
    const apply = (paused) => {
      // Update icon, label, and tooltip
      const useEl = iconUse();
      const lbl = labelSpan();
      if (paused) {
        if (useEl) useEl.setAttribute('href', '#icon-play');
        if (lbl) lbl.textContent = 'Resume';
        toggleBtn.title = 'Resume starting new jobs';
        toggleBtn.setAttribute('aria-pressed', 'true');
      }
      else {
        if (useEl) useEl.setAttribute('href', '#icon-pause');
        if (lbl) lbl.textContent = 'Pause';
        toggleBtn.title = 'Pause starting new jobs';
        toggleBtn.setAttribute('aria-pressed', 'false');
      }
      toggleBtn.disabled = false;
    };
    try {
      const paused = await this.getPauseState();
      apply(paused);
    }
    catch (_) {
      apply(false);
    }
    if (!toggleBtn._wired) {
      toggleBtn._wired = true;
      toggleBtn.addEventListener('click', async () => {
        try {
          toggleBtn.disabled = true;
          // Determine next state by reading current
          const current = await this.getPauseState();
          const next = !current;
          const paused = await this.setPauseState(next);
          this.showNotification(paused ? 'Job queue paused' : 'Job queue resumed', paused ? 'info' : 'success');
          apply(paused);
          await this.refreshJobs();
        }
        catch (_) {
          toggleBtn.disabled = false;
          this.showNotification('Failed to toggle queue', 'error');
        }
      });
    }
  }
  async previewHeatmapSample() {
    try {
      // Find first video in current folder
      const val = (folderInput.value || '').trim();
      const rel = isAbsolutePath(val) ? '' : currentPath();
      const url = new URL('/api/library', window.location.origin);
      if (rel) url.searchParams.set('path', rel);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '1');
      url.searchParams.set('sort', 'date');
      url.searchParams.set('order', 'desc');
      const r = awa<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Media Library</title>
  <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
  <link rel="manifest" href="/static/manifest.json" />
  <link rel="stylesheet" href="index.css" />
  <!-- Cytoscape.js and plugins (for Performers Graph tab) -->
  <link rel="stylesheet" href="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape.js-panzoom.css" />
  <script src="https://unpkg.com/cytoscape@3.27.0/dist/cytoscape.min.js"></script>
  <!-- fcose dependencies (must be loaded before fcose) -->
  <script src="https://unpkg.com/layout-base@2.0.1/layout-base.js"></script>
  <script src="https://unpkg.com/cose-base@2.2.0/cose-base.js"></script>
  <script src="https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js"></script>
  <script src="https://unpkg.com/cytoscape-cxtmenu@3.5.0/cytoscape-cxtmenu.js"></script>
  <script src="https://unpkg.com/cytoscape-panzoom@2.5.3/cytoscape-panzoom.js"></script>
  <script>
    // Apply collapsed class ASAP to avoid post-load reflow when sidebar is persisted collapsed
    try {
      if (localStorage.getItem('mediaPlayer:sidebarCollapsed') === '1') {
        (document.documentElement || document.body).classList.add('has-sidebar-collapsed');
      }
    } catch (e) { }
  </script>
  <script>window.__JOBS_SSE_ENABLED = false; /* detected by client via /api/config; default false to avoid assumptions */</script>
  <script>
    // Fire TV/Android TV Detection
    (function() {
      const isFireTV = /silk|aftvb|afts|aft\w|aftt/i.test(navigator.userAgent);
      const isAndroidTV = /android.*tv|googletv/i.test(navigator.userAgent);

      if (isFireTV || isAndroidTV) {
        document.documentElement.classList.add('firetv');
        // Also add to <body> once DOM is ready so body-scoped rules can apply
        const addBodyClass = () => {
          try {
            document.body.classList.add('firetv');
          }
          catch (_) {}
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', addBodyClass, { once: true });
        }
        else {
          addBodyClass();
        }
      }
    })();
  </script>
  <script type="module" src="index.js"></script>
  <style>
    /* Column filter trigger and popover (List tab) */
    .col-filter-trigger { margin-left: 6px; font-size: 12px; opacity: .7; cursor: pointer; }
    .col-filter-trigger:hover { opacity: 1; }
    .list-filter-menu { position: absolute; z-index: 9999; background: var(--panel-bg, #111827); color: inherit; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.35); min-width: 220px; }
    .list-filter-menu .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
    .list-filter-menu .values { padding: 4px 0; }
    .list-filter-menu .values label { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 4px; font-size: 12px; }
    .list-filter-menu .values label span { color: var(--muted); }
    .list-filter-menu .footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .list-filter-menu select.control-select { height: 26px; font-size: 12px; padding: 0 18px 0 8px; }
    .list-table tbody td.col-artifacts .chips-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .list-table tbody td.col-artifacts .chip { font-size: 11px; padding: 2px 6px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .list-table tbody td.col-artifacts .chip--ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.4); color: #bbf7d0; }
    .list-table tbody td.col-artifacts .chip--missing { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.45); color: #fecaca; }
  </style>
</head>

<body>
  <!-- Inline SVG sprite (all icon symbols embedded; external icons.svg removed) -->
  <svg aria-hidden="true" focusable="false" class="svg-sprite">
    <symbol id="icon-placeholder" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0e1016" />
          <stop offset="100%" stop-color="#1a2030" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g)" />
      <g fill="#3b4663">
        <rect x="30" y="40" width="260" height="100" rx="8" />
        <polygon points="140,90 140,70 200,90 140,110" fill="#6b7aa6" />
      </g>
    </symbol>
    <symbol id="icon-play" viewBox="0 0 24 24">
      <!-- Triangular play icon with slight inset for sharper edges -->
      <path d="M7 5v14l11-7-11-7z" fill="currentColor" />
    </symbol>
    <symbol id="icon-pause" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </symbol>
    <symbol id="icon-vol" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <!-- Sound waves (shown only in unmuted icon) -->
      <path d="M14 9.5c.9.6 1.5 1.5 1.5 2.5s-.6 1.9-1.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
      <path d="M16.5 7.5c1.4 1 2.5 2.6 2.5 4.5s-1.1 3.5-2.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
    </symbol>
    <symbol id="icon-muted" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <path d="M16 8l4 8M20 8l-4 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </symbol>
    <symbol id="icon-options" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </symbol>
    <symbol id="icon-gear" viewBox="0 0 24 24">
      <!-- Simplified cog with 6 teeth for clarity at small sizes -->
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
      <path d="M12 2.75l1.2.45a2 2 0 0 0 2.6-1.2l.3-.8 2.2 1.27-.3.8a2 2 0 0 0 1.2 2.6l.8.3v2.54l-.8.3a2 2 0 0 0-1.2 2.6l.3.8-2.2 1.27-.3-.8a2 2 0 0 0-2.6-1.2l-1.2.45-1.2-.45a2 2 0 0 0-2.6 1.2l-.3.8-2.2-1.27.3-.8a2 2 0 0 0-1.2-2.6l-.8-.3V8.37l.8-.3a2 2 0 0 0 1.2-2.6l-.3-.8L7.9 3.2l.3.8A2 2 0 0 0 10.8 5l1.2-.45z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" opacity="0.9" />
    </symbol>
    <symbol id="icon-caret" viewBox="0 0 24 24">
      <!-- filled chevron for better visibility (uses currentColor) -->
      <path d="M9 18 L15 12 L9 6 Z" fill="currentColor" />
    </symbol>
    <symbol id="icon-jump" viewBox="0 0 24 24">
      <path d="M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0zm5.5-3.5v7l6-3.5-6-3.5z" fill="currentColor" />
    </symbol>
    <symbol id="icon-clear" viewBox="0 0 24 24">
      <path d="M12 10.586 7.757 6.343 6.343 7.757 10.586 12l-4.243 4.243 1.414 1.414L12 13.414l4.243 4.243 1.414-1.414L13.414 12l4.243-4.243-1.414-1.414L12 10.586z" fill="currentColor" />
    </symbol>
    <symbol id="icon-reset" viewBox="0 0 24 24">
      <!-- Circular arrow reset icon -->
      <path d="M12 5a7 7 0 1 1-6.23 4H8a1 1 0 0 0 0-2H4.5A1.5 1.5 0 0 0 3 8.5V13a1 1 0 0 0 2 0V9.97A9 9 0 1 0 12 3v2z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" />
    </symbol>
    <symbol id="icon-restart" viewBox="0 0 24 24">
      <!-- Replay arrow for restarting current video -->
      <path d="M12 5V2L7 7l5 5V9c3.31 0 6 2.69 6 6s-2.69 6-6 6a6 6 0 0 1-5.65-4H6.1A8 8 0 0 0 20 15c0-4.42-3.58-8-8-8z" fill="currentColor" />
    </symbol>
    <symbol id="icon-prev" viewBox="0 0 24 24">
      <path d="M18 5v14l-8-7 8-7z" fill="currentColor" />
      <path d="M6 5h2v14H6z" fill="currentColor" />
    </symbol>
    <symbol id="icon-next" viewBox="0 0 24 24">
      <path d="M6 5v14l8-7-8-7z" fill="currentColor" />
      <path d="M16 5h2v14h-2z" fill="currentColor" />
    </symbol>
    <!-- Shuffle / Random icon (path supplied by user) -->
    <symbol id="icon-shuffle" viewBox="0 0 1792 1792">
      <path fill="currentColor" d="M666 481q-60 92-137 273-22-45-37-72.5t-40.5-63.5-51-56.5-63-35-81.5-14.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q250 0 410 225zm1126 799q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192q-32 0-85 .5t-81 1-73-1-71-5-64-10.5-63-18.5-58-28.5-59-40-55-53.5-56-69.5q59-93 136-273 22 45 37 72.5t40.5 63.5 51 56.5 63 35 81.5 14.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23zm0-896q0 14-9 23l-320 320q-9 9-23 9-13 0-22.5-9.5t-9.5-22.5v-192h-256q-48 0-87 15t-69 45-51 61.5-45 77.5q-32 62-78 171-29 66-49.5 111t-54 105-64 100-74 83-90 68.5-106.5 42-128 16.5h-224q-14 0-23-9t-9-23v-192q0-14 9-23t23-9h224q48 0 87-15t69-45 51-61.5 45-77.5q32-62 78-171 29-66 49.5-111t54-105 64-100 74-83 90-68.5 106.5-42 128-16.5h256v-192q0-14 9-23t23-9q12 0 24 10l319 319q9 9 9 23z"/>
    </symbol>
    <!-- Repeat / Auto icon (two arrows in a circle) -->
    <symbol id="icon-repeat" viewBox="0 0 24 24">
      <path d="M7 7h7a5 5 0 0 1 0 10H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 7l2.5-2.5M7 7L4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17 17l-2.5 2.5M17 17l2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
    <!-- Auto/loop icon for Random Auto (infinity-like circles) -->
    <symbol id="icon-auto-shuffle" viewBox="0 0 24 24">
      <path fill="currentColor" d="M20.288 9.463a4.856 4.856 0 0 0-4.336-2.3 4.586 4.586 0 0 0-3.343 1.767c.071.116.148.226.212.347l.879 1.652.134-.254a2.71 2.71 0 0 1 2.206-1.519 2.845 2.845 0 1 1 0 5.686 2.708 2.708 0 0 1-2.205-1.518L13.131 12l-1.193-2.26a4.709 4.709 0 0 0-3.89-2.581 4.845 4.845 0 1 0 0 9.682 4.586 4.586 0 0 0 3.343-1.767c-.071-.116-.148-.226-.212-.347l-.879-1.656-.134.254a2.71 2.71 0 0 1-2.206 1.519 2.855 2.855 0 0 1-2.559-1.369 2.825 2.825 0 0 1 0-2.946 2.862 2.862 0 0 1 2.442-1.374h.121a2.708 2.708 0 0 1 2.205 1.518l.7 1.327 1.193 2.26a4.709 4.709 0 0 0 3.89 2.581h.209a4.846 4.846 0 0 0 4.127-7.378z"/>
    </symbol>
    <symbol id="icon-cc" viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M11.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5M17.2 14.5c-.43.3-.93.5-1.5.5a3 3 0 1 1 0-6c.57 0 1.07.2 1.5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </symbol>
    <!-- Rating and Favorite Icons -->
    <symbol id="icon-star" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-star-filled" viewBox="0 0 24 24">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
    </symbol>
    <symbol id="icon-heart" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    </symbol>
    <symbol id="icon-heart-filled" viewBox="0 0 24 24">
      <path d="M12.1 8.64 12 8.77l-.1-.13C10.14 6.6 7.1 6.52 5.14 8.5 3.07 10.57 3.24 14 6 16.5c1.54 1.38 3.4 2.74 5.1 3.94 1.7-1.2 3.56-2.56 5.1-3.94 2.76-2.5 2.93-5.93.86-8C16.9 6.52 13.86 6.6 12.1 8.64z" fill="currentColor" />
    </symbol>
    <!-- Camera icon for frame download -->
    <symbol id="icon-camera" viewBox="0 0 24 24">
      <path d="M4 7h3.2l1.6-2h6.4l1.6 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="18" cy="9" r="1" fill="currentColor" />
    </symbol>
  </svg>

  <!-- Hidden SVG filters for video color matrix (kept with SVG definitions) -->
  <svg width="0" height="0" class="sprite-defs-hidden" aria-hidden="true" focusable="false">
    <filter id="playerColorMatrix" color-interpolation-filters="sRGB">
      <feColorMatrix id="playerColorMatrixValues" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>
  </svg>

  <!-- Templates: Settings JSON panels (Health, Config) -->
  <template id="settingsHealthTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Health</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm health-refresh" title="Refresh health">Refresh</button>
      </header>
      <pre class="json-pre health-pre" aria-live="polite"></pre>
    </section>
  </template>
  <template id="settingsConfigTemplate">
    <section class="settings-block">
      <header class="flex-row gap-10">
        <strong>Server Config</strong>
        <div class="ml-auto"></div>
        <button class="btn-sm config-refresh" title="Refresh config">Refresh</button>
      </header>
      <pre class="json-pre config-pre" aria-live="polite"></pre>
    </section>
  </template>

  <!-- Templates: Performers (card + empty state) -->
  <template id="performerCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select performer"></div>
      <div class="pc-top">
        <div class="pc-avatar" role="button" tabindex="0" aria-label="Upload image">
          <img class="pc-avatar-img" alt="" loading="lazy" hidden />
          <svg class="pc-avatar-icon" width="18" height="18" aria-hidden="true"><use href="#icon-camera"></use></svg>
        </div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <div class="pc-metadata hint-sm"></div>
        </div>
        <div class="pc-countwrap">
          <div class="pc-count" title="Files">0</div>
          <span class="pc-face-indicator" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </template>
  <!-- Templates: Tags (card) -->
  <template id="tagCardTemplate">
    <div class="perf-card perf-card--pretty" role="group">
      <div class="card-checkbox" role="checkbox" aria-checked="false" aria-label="Select tag"></div>
      <div class="pc-top">
        <div class="pc-avatar" aria-hidden="true"></div>
        <div class="pc-titlebox">
          <h3 class="pc-name"></h3>
          <button class="tag-open-library-btn" type="button">Show in Library</button>
        </div>
        <span class="pc-count" title=""></span>
      </div>
    </div>
  </template>
  <template id="emptyHintTemplate">
    <div class="hint-sm empty-hint"></div>
  </template>

  <!-- Performer Import Preview Modal (moved inside <body> and grouped with other modals) -->
  <div id="performerImportPreviewModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <strong>Import Performers Preview</strong>
        <button id="performerImportPreviewClose" class="btn-sm" title="Cancel">Cancel</button>
      </header>
      <div class="body panel-body--scroll">
        <div class="hint-sm hint-sm--muted">The following performers will be imported:</div>
        <div id="performerImportPreviewList" class="performer-import-list"></div>
      </div>
      <footer class="panel-footer--actions">
        <button id="performerImportPreviewConfirm" class="btn">Import</button>
      </footer>
    </div>
  </div>
  <!-- Folder Picker Modal -->
  <div id="modal" class="modal" hidden>
    <div class="panel">
      <header>
        <div class="crumbs" id="crumbs"></div>
      </header>
      <div class="body">
        <div class="dirlist" id="dirlist"></div>
      </div>
      <div class="actions">
        <button class="btn" id="chooseBtn">Choose this folder</button>
        <button class="btn" id="cancelBtn">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Image Preview Modal -->
  <div id="imgModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong>Heatmap Preview</strong>
          <button class="btn" id="imgModalClose">Close</button>
        </div>
      </header>
      <div class="body panel--image-body">
        <img id="imgModalImage" alt="Heatmap" class="panel-image" />
      </div>
    </div>
  </div>
  <!-- Performer Auto-Match Modal (grouped with other modals) -->
  <div id="performerAutoMatchModal" class="modal" hidden>
    <div class="panel panel--wide">
      <header class="flex items-center justify-between gap-16">
        <strong>Auto‑Match Performers</strong>
        <div class="flex gap-8">
          <button id="perfAutoMatchClose" class="btn-sm" title="Close">Close</button>
        </div>
      </header>
      <div class="body panel-body--tall">
        <div class="hint-sm mt-6">Preview scans all videos using registry performers. Apply writes to sidecars.</div>
        <div id="perfAutoMatchStatus" class="hint-sm opacity-75">Awaiting preview.</div>
        <table class="job-table autotag-table mt-8" id="perfAutoMatchTable">
          <thead>
            <tr>
              <th>File</th>
              <th>Performers</th>
            </tr>
          </thead>
          <tbody id="perfAutoMatchTbody"></tbody>
        </table>
      </div>
      <footer class="panel-footer--actions">
        <span class="hint-sm hint-sm--muted">Esc or Close to dismiss • Changes only written after Apply.</span>
        <div class="flex-row gap-8">
          <button id="perfAutoApplyBtnFooter" class="btn-sm" disabled>Apply</button>
          <button id="perfAutoCancelBtn" class="btn-sm">Cancel</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Performer Image Face Box Preview Modal -->
  <div id="faceBoxModal" class="modal" hidden>
    <div class="panel panel--image">
      <header>
        <div class="panel-header--spaced">
          <strong id="faceBoxTitle">Image Preview</strong>
          <div class="flex-row gap-8">
            <button class="btn" id="faceBoxDetectBtn" title="Auto-detect face box" disabled>Detect</button>
            <button class="btn" id="faceBoxUploadBtn" title="Upload new image">Upload</button>
            <button class="btn" id="faceBoxClose">Close</button>
          </div>
        </div>
      </header>
      <div class="body panel--image-body">
        <div class="facebox-stage">
          <img id="faceBoxImg" alt="Performer" class="panel-image" />
          <div id="faceBoxOverlay" class="facebox-overlay" hidden>
            <div class="handle" aria-hidden="true"></div>
          </div>
          <div id="faceBoxLinks" class="facebox-links hidden" aria-label="External performer links"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tag Merge Modal -->
  <div id="tagMergeModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Merge Tags</h3>
        <button id="tagMergeClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="hint-sm mb-8">Choose the tag name to keep. The other selected tags will be merged into it.</div>
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagMergeSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label class="hint-sm w-120">Keep name</label>
          <div id="tagMergeChoiceList" class="merge-choice-list" role="radiogroup" aria-live="polite"></div>
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagMergeCancel" class="btn">Cancel</button>
        <button id="tagMergeConfirm" class="btn btn-primary" disabled>Merge</button>
      </footer>
    </div>
  </div>

  <!-- Tag Rename Modal -->
  <div id="tagRenameModal" class="modal" hidden>
    <div class="panel panel--narrow">
      <header class="panel-header--spaced">
        <h3>Rename Tag</h3>
        <button id="tagRenameClose" class="btn btn-text" aria-label="Close">✕</button>
      </header>
      <div class="body">
        <div class="row gap-8 mb-10">
          <label class="hint-sm w-120">Selected</label>
          <div id="tagRenameSelected" class="flex-row gap-6"></div>
        </div>
        <div class="row gap-8">
          <label for="tagRenameInput" class="hint-sm w-120">New name</label>
          <input id="tagRenameInput" type="text" class="control-input w-100" placeholder="e.g. Vintage" />
        </div>
      </div>
      <footer class="panel-footer--actions">
        <button id="tagRenameCancel" class="btn">Cancel</button>
        <button id="tagRenameConfirm" class="btn btn-primary" disabled>Rename</button>
      </footer>
    </div>
  </div>

  <!-- Error modal (predeclared to avoid dynamic injection) -->
  <div id="errorModal" class="modal" hidden>
    <div class="modal-content modal-content--wide">
      <div class="modal-header modal-header--spaced">
        <h3 class="m-0">Job Error</h3>

        <!-- Small directory list item (used by folder picker) -->
        <template id="dirListItemTemplate">
          <div class="dir">
            <div class="icon"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirEmptyTemplate">
          <div class="dir muted dir-empty">
            <div class="icon dim" aria-hidden="true"></div>
            <div class="name"></div>
          </div>
        </template>
        <template id="dirErrorTemplate">
          <div class="dir dir-error">
            <div class="name"></div>
          </div>
        </template>

        <!-- Autotag preview row template -->
        <template id="autotagRowTemplate">
          <tr>
            <td class="break file"></td>
            <td class="tags"></td>
          </tr>
        </template>

        <!-- Job table row template -->
        <template id="jobRowTemplate">
          <tr>
            <td class="cell-time-start"></td>
            <td class="cell-time-end"></td>
            <td class="cell-task"></td>
            <td class="cell-file" title=""></td>
            <td class="cell-status">
              <span class="job-status"></span>
            </td>
            <td class="cell-progress">
              <div class="job-progress">
                <div class="job-progress-fill"></div>
              </div>
              <div class="cell-sub">
                <span class="pct"></span>
              </div>
            </td>
            <td class="cell-action"></td>
          </tr>
        </template>
        <!-- Marker Row Template -->
        <template id="markerRowTemplate">
          <div class="marker-row">
            <div class="marker-name-label marker-name-label--editable"></div>
            <div class="marker-time-label marker-time-label--editable"></div>
            <button type="button" class="marker-jump marker-btn-icon" aria-label="Jump to marker" title="Jump">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-jump" />
              </svg>
            </button>
            <button type="button" class="marker-remove marker-btn-icon" aria-label="Remove marker" title="Remove">
              <svg width="14" height="14" aria-hidden="true" focusable="false">
                <use href="#icon-clear" />
              </svg>
            </button>
          </div>
        </template>
        <!-- Shared chip templates -->
        <template id="chipTemplate">
          <span class="chip" title="">
            <span class="chip-label"></span>
            <button type="button" class="remove chip-remove" aria-label="Remove">×</button>
          </span>
        </template>
        <template id="chipSuggestTemplate">
          <button type="button" class="chip chip-suggest" title="">
            <span class="chip-label"></span>
          </button>
        </template>
        <template id="bulkSuggestionsLabelTemplate">
          <div class="hint-sm hint-sm--muted mb-4">Matches:</div>
        </template>
        <!-- List filter templates -->
        <template id="listFilterMenuTemplate">
          <div class="list-filter-menu"></div>
        </template>
        <template id="listFilterRowTemplate">
          <div class="row"></div>
        </template>
        <template id="listFilterValuesTemplate">
          <div class="values"></div>
        </template>
        <template id="listFilterFooterTemplate">
          <div class="footer"></div>
        </template>
        <template id="listFilterButtonTemplate">
          <button type="button" class="btn-sm"></button>
        </template>
        <template id="listFilterCheckboxLabelTemplate">
          <label class="list-filter-checkbox">
            <input type="checkbox" />
            <span></span>
          </label>
        </template>
        <template id="listFilterSelectTemplate">
          <select class="control-select"></select>
        </template>
        <template id="listFilterNumberInputTemplate">
          <input type="number" class="chips-input" placeholder="value" />
        </template>
        <template id="listFilterDateInputTemplate">
          <input type="datetime-local" class="chips-input" />
        </template>
        <template id="listFilterHintTemplate">
          <span class="hint-sm"></span>
        </template>
        <template id="listFilterMessageTemplate">
          <div class="row">
            <span class="hint-sm"></span>
          </div>
        </template>
        <template id="listFilterArtifactRowTemplate">
          <label class="list-filter-artifact">
            <span class="label"></span>
            <select class="control-select"></select>
          </label>
        </template>
        <template id="orphanFileTemplate">
          <div class="orphan-file" title="">
            <span class="orphan-file__text"></span>
          </div>
        </template>
        <!-- Segmented select templates -->
        <template id="segmentedControlTemplate">
          <div class="segmented-control" role="group"></div>
        </template>
        <template id="segmentedControlButtonTemplate">
          <button type="button" class="segmented-control__btn" data-value=""></button>
        </template>
        <!-- Artifact filter popover row template -->
        <template id="artifactFilterRowTemplate">
          <label class="artifact-filter-row">
            <span class="artifact-filter-name"></span>
            <select class="control-select artifact-filter-select">
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </template>
        <template id="artifactChipTemplate">
          <div class="badge-pill artifact-chip" data-key="" data-present="0">
            <span class="label"></span>
            <span class="status" aria-hidden="true">✗</span>
          </div>
        </template>
        <!-- Tags registry list item template -->
        <template id="registryItemTemplate">
          <div class="registry-item" data-selected="0"></div>
        </template>
        <!-- Breadcrumb segment template -->
        <template id="crumbSegmentTemplate">
          <span class="seg"></span>
        </template>


        <!-- List tab: table cell template -->
        <template id="listCellTemplate">
          <td class="list-cell"></td>
        </template>

        <!-- List tab: table row template -->
        <template id="listRowTemplate">
          <tr class="list-row" data-selected="0" data-path=""></tr>
        </template>

        <!-- List tab: head cell template -->
        <template id="listHeadCellTemplate">
          <th>
            <span class="col-drag-handle" title="Drag to reorder" draggable="true">⋮⋮</span>
            <div class="list-head-cell"></div>
            <div class="col-resizer"></div>
          </th>
        </template>

        <!-- List tab: column settings item template -->
        <template id="listColumnItemTemplate">
          <div class="list-col-item">
            <span class="drag-handle" title="Drag to reorder" aria-hidden="true" draggable="true">⋮⋮</span>
            <label>
              <input type="checkbox" class="list-col-visible" checked />
              <span class="list-col-label">Column</span>
            </label>
          </div>
        </template>
        <!-- Toast notification template -->
        <template id="toastTemplate">
          <div class="toast" role="status" aria-live="polite">
            <span class="toast-text"></span>
          </div>
        </template>
        <button class="btn" id="errorModalClose">Close</button>
      </div>
      <pre id="errorModalText" class="error-pre"></pre>
    </div>
  </div>
  <!-- Generic message modal (replaces legacy alert usage) -->
  <div id="messageModal" class="modal" hidden>
    <div class="modal-content">
      <div class="modal-header modal-header--spaced">
        <h3 id="messageModalTitle" class="m-0">Notice</h3>
        <button id="messageModalClose" class="btn-sm" aria-label="Close">Close</button>
      </div>
      <div class="modal-body">
        <p id="messageModalBody" class="m-0"></p>
      </div>
      <footer class="panel-footer--actions mt-12">
        <div class="flex-row gap-8 jc-end">
          <button id="messageModalOk" class="btn">OK</button>
        </div>
      </footer>
    </div>
  </div>

  <!-- Templates: API Explorer -->
  <template id="apiGroupTemplate">
    <section class="api-group" data-open="1">
      <header class="api-group__header flex-row gap-10" role="button" tabindex="0" aria-expanded="true">
        <span class="api-group__caret" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24"><use href="#icon-caret"></use></svg>
        </span>
        <h3 class="api-group__title"></h3>
        <button class="btn-xs api-group__expand-all" title="Expand/collapse all children" style="display: none;">±</button>
        <span class="ml-auto hint-sm api-group__count"></span>
      </header>
      <div class="api-group__body"></div>
    </section>
  </template>
  <template id="apiEndpointTemplate">
    <div class="card api-endpoint" data-open="0">
  <div class="api-endpoint__header row" role="button" tabindex="0" aria-expanded="false">
        <span class="method-badge">GET</span>
        <code class="api-path w-100"></code>
        <button class="btn-sm api-toggle" aria-expanded="false" aria-label="Toggle details">Details</button>
      </div>
      <div class="api-endpoint__body hidden">
        <div class="hint-sm api-summary"></div>
        <div class="api-params" role="group" aria-label="Parameters"></div>
        <div class="api-body" hidden>
          <label class="hint-sm">Request Body (JSON)
            <textarea class="api-body-text control-textarea w-100" rows="6" placeholder="{ }"></textarea>
          </label>
        </div>
        <div class="row gap-10 mt-12">
          <button class="btn-sm api-run">Run</button>
          <span class="hint-sm api-status"></span>
        </div>
        <pre class="json-pre api-response mt-12" aria-live="polite"></pre>
      </div>
    </div>
  </template>

  <header>
    <!-- Tab Navigation only (top bar removed) -->
    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="player-panel" id="player-tab" data-tab="player">
        Player
      </button>
      <button class="tab-button active" role="tab" aria-selected="true" aria-controls="library-panel" id="library-tab" data-tab="library">
        Library
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="list-panel" id="list-tab" data-tab="list">
        List
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="similar-panel" id="similar-tab" data-tab="similar">
        Similar
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tasks-panel" id="tasks-tab" data-tab="tasks">
        Tasks
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="performers-panel" id="performers-tab" data-tab="performers">
        Performers
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="graph-panel" id="graph-tab" data-tab="graph">
        Graph
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="connections-panel" id="connections-tab" data-tab="connections">
        Connections
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="tags-panel" id="tags-tab" data-tab="tags">
        Tags
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="stats-panel" id="stats-tab" data-tab="stats">
        Stats
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="settings-panel" id="settings-tab" data-tab="settings">
        Settings
      </button>
      <button class="tab-button" role="tab" aria-selected="false" aria-controls="api-panel" id="api-tab" data-tab="api">
        API
      </button>
    </nav>
  </header>

  <main>
    <!-- Tab Panels -->
    <div class="tab-panels">
      <!-- Connections Tab Panel (minimal: image-only nodes) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="connections-tab" id="connections-panel" hidden>
        <section class="graph-panel graph-panel--connections">
          <div class="graph-controls graph-controls--connections">
            <strong>Connections Graph</strong>
            <label class="hint-sm connections-toggle" title="Show performers even if no portrait is available">
              <input id="connectionsShowImageless" type="checkbox" checked />
              <span>Show imageless performers</span>
            </label>
            <label class="hint-sm" title="Minimum number of videos a performer must appear in to be included">
              Min performer videos
              <input id="connectionsMinVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum shared videos required for an edge to be drawn">
              Min shared videos
              <input id="connectionsMinEdgeVideos" type="number" class="control-input w-120" value="1" min="1" step="1" />
            </label>
            <label class="hint-sm connections-toggle" title="Show performers that have no qualifying connections">
              <input id="connectionsShowOrphans" type="checkbox" checked />
              <span>Show orphans</span>
            </label>
            <label class="hint-sm connections-toggle" title="Scale edge thickness based on shared video counts">
              <input id="connectionsVariableThickness" type="checkbox" checked />
              <span>Variable edge width</span>
            </label>
            <button id="connectionsRefreshBtn" class="btn-sm" type="button">Refresh</button>
          </div>
          <div id="connectionsCyContainer">
            <div id="cyConnections" aria-label="Connections graph" role="application"></div>
          </div>
        </section>
      </div>
      <!-- Graph Tab Panel (Performers Co‑appearance) -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="graph-tab" id="graph-panel" hidden>
        <section class="graph-panel">
          <div class="graph-controls">
            <strong>Performers Graph</strong>
            <span id="graphStatus" class="hint-sm" style="opacity:.8;"></span>
            <label class="hint-sm">
              Min videos
              <input id="graphMinCount" type="number" class="control-input w-120" value="2" min="1" step="1" />
            </label>
            <label class="hint-sm" title="Minimum number of connections (edges) a performer must have to be shown; > 0 hides isolated nodes">
              Min edges
              <input id="graphMinEdges" type="number" class="control-input w-120" value="0" min="0" step="1" />
            </label>
            <label class="hint-sm">
              Layout
              <select id="graphLayoutSelect" class="control-input w-120">
                <option value="fcose">fCoSE</option>
                <option value="cose">CoSE</option>
                <option value="circle">Circle</option>
                <option value="grid">Grid</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label class="hint-sm" title="Ideal edge length for force layouts (higher = looser)">
              Edge length
              <input id="graphEdgeLen" type="range" min="40" max="300" step="10" value="120" />
            </label>
            <label class="hint-sm" title="Node repulsion for force layouts (higher = more spread)">
              Node repulsion
              <input id="graphRepulsion" type="range" min="1000" max="120000" step="1000" value="50000" />
            </label>
            <label class="hint-sm" title="Render edges as straight lines">
              <input id="graphStraightEdges" type="checkbox" checked />
              Straight lines
            </label>
            <input id="graphSearchInput" class="control-input" placeholder="Search performer…" />
            <button id="graphRefreshBtn" class="btn-sm">Refresh</button>
            <div class="ml-auto"></div>
            <button id="graphNeighborhoodBtn" class="btn-sm" title="Reveal neighborhood of matches/selection">Reveal Neighborhood</button>
            <button id="graphClearBtn" class="btn-sm" title="Clear filters and highlights">Clear</button>
            <button id="graphFitBtn" class="btn-sm" title="Fit all">Fit</button>
          </div>
          <div id="cyContainer">
            <div id="cyGraph" aria-label="Performers graph" role="application"></div>
          </div>
          <div id="graphTooltip" hidden></div>
        </section>
      </div>
      <!-- Player Tab Panel -->
      <div class="tab-panel" role="tabpanel" aria-labelledby="player-tab" id="player-panel" hidden>
        <!-- Split layout now stretches full height -->
        <div class="player-split">
          <div class="player-sidebar">
            <div id="sidebarAccordion" class="accordion">
              <div class="acc-item" data-key="file-info">
                <button class="acc-header" aria-expanded="true">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  File Info
                </button>
                <div class="acc-panel">
                  <div class="fi-thumbnail-wrap" id="fiThumbnailWrap">
                    <div class="fi-thumbnail-box">
                      <img id="fiThumbnail" alt="Thumbnail" />
                      <button id="fiSetThumbnailBtn" class="btn btn-xs fi-thumbnail-set" title="Set thumbnail from current frame">✚</button>
                    </div>
                  </div>
                  <div class="file-info-grid" role="table" aria-label="File metadata">
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Path</div>
                      <div class="fi-value break" id="fiPath" role="cell" title="">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Duration</div>
                      <div class="fi-value" id="fiDuration" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Resolution</div>
                      <div class="fi-value" id="fiResolution" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Codec</div>
                      <div class="fi-value" id="fiVideoCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Codec</div>
                      <div class="fi-value" id="fiAudioCodec" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Bitrate</div>
                      <div class="fi-value" id="fiBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Video Bitrate</div>
                      <div class="fi-value" id="fiVBitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Audio Bitrate</div>
                      <div class="fi-value" id="fiABitrate" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Size</div>
                      <div class="fi-value" id="fiSize" role="cell">—</div>
                    </div>
                    <div class="fi-row" role="row">
                      <div class="fi-label" role="rowheader">Modified</div>
                      <div class="fi-value" id="fiModified" role="cell">—</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="markers">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Markers
                </button>
                <div class="acc-panel hidden">
                  <div class="markers-actions">
                    <button id="btnAddMarker" class="btn btn-xs" type="button" title="Add marker at current time">Add Marker</button>
                    <button id="btnSetIntroEnd" class="btn btn-xs" type="button" title="Set intro end (default start point)">Set Intro</button>
                    <button id="btnSetOutroBegin" class="btn btn-xs" type="button" title="Set outro begin (default end point)">Set Outro</button>
                  </div>
                  <div class="markers-header markers-header--spaced mt-0">
                    <div class="hint-sm hint-sm--muted">Edit time, label, or type. Enter or blur to save. Color indicates marker type.</div>
                  </div>
                  <div id="markersList" class="markers-list" aria-live="polite" aria-label="Marker list"></div>
                </div>
              </div>
              <div class="acc-item" data-key="artifacts">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Artifacts
                </button>
                <div class="acc-panel hidden">
                  <div class="artifact-badges-flat" id="artifactBadgesSidebar">
                    <div id="badge-metadata" class="badge-pill artifact-gen-btn" data-artifact="metadata" title="Metadata">
                      <span>Metadata</span><span id="badge-metadata-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-thumbnail" class="badge-pill artifact-gen-btn" data-artifact="thumbnail" title="Primary thumbnail">
                      <span>Thumbnail</span><span id="badge-thumbnail-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-preview" class="badge-pill artifact-gen-btn" data-artifact="preview" title="Preview video">
                      <span>Preview</span><span id="badge-preview-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-phash" class="badge-pill artifact-gen-btn" data-artifact="phash" title="Perceptual hash">
                      <span>pHash</span>
                      <span id="badge-phash-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-sprites" class="badge-pill artifact-gen-btn" data-artifact="sprites" title="Sprite sheet thumbnails (timeline scrub)">
                      <span>Sprites</span><span id="badge-sprites-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-heatmap" class="badge-pill artifact-gen-btn" data-artifact="heatmap" title="Heatmap timeline overlay">
                      <span>Heatmap</span><span id="badge-heatmap-status" aria-hidden="true">?</span>
                    </div>
                    <div id="badge-markers" class="badge-pill artifact-gen-btn" data-artifact="markers" title="Marker / chapter markers">
                      <span>Markers</span><span id="badge-markers-status" aria-hidden="true">?</span>
                    </div>
                  </div>
                  <!-- Sidebar artifact previews (compact) -->
                  <div id="sidebarSpritePreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Sprite Sheet</div>
                    <img id="sidebarSpriteImage" alt="Sprites" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div id="sidebarHeatmapPreview" class="mt-12 hidden" aria-live="polite">
                    <div class="hint-sm hint-sm--muted mb-4">Heatmap</div>
                    <img id="sidebarHeatmapImage" alt="Heatmap" style="max-width:100%; height:auto; display:block; border-radius:4px; opacity:0.95;" />
                  </div>
                  <div class="hint-sm mt-6 hint-sm--muted line-13">Click a missing badge (✗) or Generate button to start. ✓ indicates the artifact is present. Spinner shows job progress.</div>
                </div>
              </div>
              <div class="acc-item" data-key="actions">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Actions
                </button>
                <div class="acc-panel hidden">
                  <div class="flex-row gap-8 mt-4" role="group" aria-label="Video actions">
                    <button id="btnResetPlayer" class="btn-sm" type="button" title="Reset player (unload video)" aria-label="Reset player">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-reset" /></svg>
                      <span class="ml-4">Reset player</span>
                    </button>
                    <button id="btnDownloadFrame" class="btn-sm" title="Download current frame as PNG">
                      <svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#icon-camera" /></svg>
                      <span class="ml-4">Download frame</span>
                    </button>
                    <button id="btnConvert" class="btn-sm" disabled title="Coming soon">Convert</button>
                    <button id="btnCompress" class="btn-sm" disabled title="Coming soon">Compress</button>
                    <button id="btnTrim" class="btn-sm" disabled title="Coming soon">Trim</button>
                    <button id="btnSplit" class="btn-sm" disabled title="Coming soon">Split</button>
                    <button id="btnConcat" class="btn-sm" disabled title="Coming soon">Concat</button>
                  </div>
                  <div class="hint-sm hint-sm--muted mt-6">Advanced actions (convert, compress, trim, split, concat) are planned. Download frame works locally now.</div>
                </div>
              </div>
              <div class="acc-item" data-key="video-settings">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Video
                </button>
                <div class="acc-panel hidden">
                  <div class="video-metadata-chips">
                    <div class="chips-group" id="videoPerformersGroup">
                      <div class="chips-label">Performers</div>
                      <div class="chips-list" id="videoPerformers"></div>
                      <input type="text" id="videoPerformerInput" class="chips-input" placeholder="Add performer…" aria-label="Add performer" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoPerformerSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-group" id="videoTagsGroup">
                      <div class="chips-label">Tags</div>
                      <div class="chips-list" id="videoTags"></div>
                      <input type="text" id="videoTagInput" class="chips-input" placeholder="Add tag…" aria-label="Add tag" />
                      <div class="chips-suggestions hint-sm mt-4" id="videoTagSuggestions" aria-live="polite"></div>
                    </div>
                    <div class="chips-hint hint-sm hint-sm--muted mt-4">Enter to add · Click a chip to view · Click × to remove</div>
                    <!-- Rating (5-star) + Favorite toggle in header -->
                    <div class="chips-group" id="videoRatingGroup">
                      <div class="chips-label">Rating</div>
                      <div class="rating-row">
                        <div class="rating-stars" id="videoRating" role="radiogroup" aria-label="Rating (1 to 5)">
                        <span class="star" role="radio" tabindex="0" data-value="1" aria-label="1 star" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="2" aria-label="2 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="3" aria-label="3 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="4" aria-label="4 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        <span class="star" role="radio" tabindex="0" data-value="5" aria-label="5 stars" aria-checked="false">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-star-filled"></use></svg>
                        </span>
                        </div>
                        <button id="videoFavorite" class="btn-sm btn-icon favorite-toggle" aria-pressed="false" title="Toggle favorite">
                          <svg class="icon icon-outline" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart"></use></svg>
                          <svg class="icon icon-filled" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-heart-filled"></use></svg>
                        </button>
                      </div>
                    </div>
                    <!-- Description -->
                    <div class="chips-group" id="videoDescriptionGroup">
                      <div class="chips-label">Description</div>
                      <div id="videoDescription" class="desc-input" role="textbox" aria-label="Video description" tabindex="0" data-placeholder="Add a description…"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="acc-item" data-key="filters">
                <button class="acc-header" aria-expanded="false">
                  <svg class="acc-header__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <use href="#icon-caret"></use>
                    <path class="acc-header__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
                  </svg>
                  Filters
                </button>
                <div class="acc-panel hidden">
                  <div class="video-adjustments" id="videoAdjustments" aria-label="Video image adjustment controls">
                    <div class="adj-row">
                      <label for="adjBrightness">Brightness</label>
                      <input type="range" id="adjBrightness" class="adj-slider vol-slider" min="0.20" max="2.00" step="0.01" value="1" aria-label="Brightness" />
                      <span class="adj-val" id="adjBrightnessVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjContrast">Contrast</label>
                      <input type="range" id="adjContrast" class="adj-slider vol-slider" min="0.50" max="2.00" step="0.01" value="1" aria-label="Contrast" />
                      <span class="adj-val" id="adjContrastVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjSaturation">Saturation</label>
                      <input type="range" id="adjSaturation" class="adj-slider vol-slider" min="0.00" max="3.00" step="0.01" value="1" aria-label="Saturation" />
                      <span class="adj-val" id="adjSaturationVal">1.00x</span>
                    </div>
                    <div class="adj-row">
                      <label for="adjHue">Hue</label>
                      <input type="range" id="adjHue" class="adj-slider vol-slider" min="0" max="360" step="1" value="0" aria-label="Hue rotation" />
                      <span class="adj-val" id="adjHueVal">0°</span>
                    </div>
                    <div class="adj-actions mt-4">
                      <button type="button" id="adjResetBtn" class="btn btn-xs" title="Reset all adjustments">Reset</button>
                    </div>
                    <div class="hint-sm hint-sm--muted mt-6">Adjustments apply locally using CSS filters and persist in this browser. They do not modify files.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Small non-intrusive sidebar toggle between the sidebar and main player -->
          <button id="sidebarToggle" class="sidebar-toggle" aria-expanded="true" aria-label="Toggle sidebar" title="Toggle sidebar">
            <!-- use centralized sprite symbol (icon-caret). CSS will rotate this when collapsed -->
            <svg class="sidebar-toggle__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <title>Toggle sidebar</title>
              <!-- primary: reference centralized symbol -->
              <use href="#icon-caret" />
              <!-- fallback: inline path so the caret is visible if <use> isn't applied by the UA -->
              <path class="sidebar-toggle__fallback" d="M15 6 L9 12 L15 18 Z" fill="currentColor" />
            </svg>
          </button>
          <div class="player-main">
            <div id="playerOverlayBar" class="player-overlay-bar">
              <span id="playerTitle" class="player-title"></span>
            </div>
            <video id="playerVideo" class="player-video" playsinline preload="metadata"></video>
            <!-- Subtitle overlay rendered by JS -->
            <div id="subtitleOverlay" class="subtitle-line bottom" aria-live="polite" hidden></div>
            <!-- Floating scrubber (timeline) overlay at bottom -->
            <div id="playerScrubber" class="player-scrubber-bar">
              <div class="scrubber-track" id="playerScrubberTrack">
                <!-- Heatmap layers moved inside track so width/position match exactly -->
                <div id="timelineHeatmap" class="timeline-heatmap" aria-hidden="true"></div>
                <canvas id="timelineHeatmapCanvas" class="timeline-heatmap-canvas" aria-hidden="true"></canvas>
                <!-- Legacy timeline markers layer expected by JS (renderMarkers) -->
                <div id="timelineMarkers" class="timeline-markers-layer" aria-hidden="true"></div>
                <div class="scrubber-buffer" id="playerScrubberBuffer"></div>
                <div class="scrubber-progress" id="playerScrubberProgress"></div>
              </div>
              <div id="playerControls" class="scrubber-status-row player-controls">
                <span class="scrubber-time" id="playerScrubberTime">00:00 / 00:00</span>
                <div class="player-controls-groups">
                  <div class="player-control-cluster cluster-transport" aria-label="Playback controls">
                    <button id="btnSeekBack30" class="btn btn-xs" type="button" title="Back 30 seconds" aria-label="Back 30 seconds">−30s</button>
                    <button id="btnPrevFrame" class="btn btn-xs" type="button" title="Previous frame" aria-label="Previous frame">−1f</button>
                    <button id="btnPlayPause" class="btn btn-xs" type="button" title="Play / Pause">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-play" class="icon-play"></use>
                        <use href="#icon-pause" class="icon-pause hidden"></use>
                      </svg>
                    </button>
                    <button id="btnNextFrame" class="btn btn-xs" type="button" title="Next frame" aria-label="Next frame">+1f</button>
                    <button id="btnSeekFwd30" class="btn btn-xs" type="button" title="Forward 30 seconds" aria-label="Forward 30 seconds">+30s</button>
                  </div>
                  <div class="player-control-cluster cluster-audio" aria-label="Audio controls">
                    <button id="btnMute" class="btn btn-xs" type="button" title="Mute / Unmute">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-vol" class="icon-vol"></use>
                        <use href="#icon-muted" class="icon-muted hidden"></use>
                      </svg>
                    </button>
                    <div class="player-volume">
                      <input id="volSlider" class="vol-slider" type="range" min="0" max="1" step="0.01" value="1" title="Volume" />
                    </div>
                  </div>
                  <div class="player-control-cluster cluster-navigate" aria-label="Navigation controls">
                    <button id="btnPrevVideo" class="btn btn-xs" type="button" title="Previous video" aria-label="Previous video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-prev"></use>
                      </svg>
                      <span class="sr-only">Previous video</span>
                    </button>
                    <button id="btnRestartVideo" class="btn btn-xs" type="button" title="Restart video" aria-label="Restart video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-restart"></use>
                      </svg>
                    </button>
                    <button id="btnFullscreen" class="btn btn-xs" type="button" title="Toggle fullscreen" aria-label="Fullscreen">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM6 14v4h4v2H4v-6h2zm12 0h2v6h-6v-2h4v-4z" />
                      </svg>
                    </button>
                    <button id="btnNextVideo" class="btn btn-xs" type="button" title="Next video" aria-label="Next video">
                      <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-next"></use>
                      </svg>
                      <span class="sr-only">Next video</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Hover sprite preview (dynamically positioned) -->
            <div id="spritePreview"></div>
          </div>
        </div>
      </div>

      <!-- Library Tab Panel -->
      <div class="tab-panel active" role="tabpanel" aria-labelledby="library-tab" id="library-panel">
        <div class="controls-panel sticky-enabled library-toolbar">
          <div class="library-toolbar__surface">
            <div class="controls-row library-toolbar__row library-toolbar__row--primary">
              <div id="libraryUnifiedFiltersGroup" class="control-group control-group--flex library-toolbar__cluster library-toolbar__cluster-search">
                <button id="clearFiltersTopBtn" class="btn-icon clear-btn" type="button" aria-label="Clear filters" title="Clear search, tags, performers and resolution">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-clear"></use></svg>
                </button>
                <input type="text" id="libraryUnifiedInput" class="chips-input" placeholder="Search files, #tag, @performer…" aria-label="Search library" />
                <div class="chips-list" id="libraryUnifiedChips"></div>
              </div>
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-options" aria-label="Library view options">
                <div class="compact-filter" data-filter="resolution">
                  <div class="compact-filter__label-row">
                    <label for="resSelect" class="compact-filter__label">Resolution</label>
                  </div>
                  <select id="resSelect" class="control-select" title="Filter by resolution" aria-label="Filter by resolution">
                    <option value="" selected data-chip="All">All resolutions</option>
                    <option value="2160" data-chip="2160p+">2160p+</option>
                    <option value="1440" data-chip="1440p+">1440p+</option>
                    <option value="1080" data-chip="1080p+">1080p+</option>
                    <option value="720" data-chip="720p+">720p+</option>
                    <option value="480" data-chip="480p+">480p+</option>
                  </select>
                </div>
                <div class="compact-filter" data-filter="sort">
                  <div class="compact-filter__label-row">
                    <label for="sortSelect" class="compact-filter__label">Sort</label>
                    <button id="orderToggle" class="compact-filter__order" data-order="desc" type="button" title="Toggle sort order" aria-label="Toggle sort order">▼</button>
                  </div>
                  <select id="sortSelect" class="control-select" aria-label="Sort by">
                    <option value="date" data-chip="Date">Date</option>
                    <option value="name" data-chip="Name">Name</option>
                    <option value="size" data-chip="Size">Size</option>
                    <option value="random" data-chip="Random">Random</option>
                  </select>
                </div>
                <div class="library-density" aria-label="Grid density">
                  <span class="library-density__label hint-sm" id="densityLabel">Density</span>
                  <input id="densitySlider" type="range" min="1" max="15" value="12" step="1" class="control-slider" title="Adjust grid density (columns)" aria-describedby="densityLabel" aria-label="Grid density" />
                </div>
              </div>
            </div>
            <div class="controls-row library-toolbar__row library-toolbar__row--secondary">
              <div class="control-group library-toolbar__cluster library-toolbar__cluster-artifacts">
                <button id="artifactFiltersBtn" class="btn-sm" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="artifactFiltersMenu">Artifacts</button>
                <div id="artifactFilterChips" class="artifact-filter-chips" aria-live="polite" hidden></div>
                <!-- Artifact boolean filters are available per-column on the List tab -->
              </div>
              <div class="pagination-group library-toolbar__cluster library-toolbar__cluster-pagination">
                <div class="pagination">
                  <button id="prevBtn" class="btn-sm" t