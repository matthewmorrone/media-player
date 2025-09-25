// ----- Top-level DOM refs & state -----
const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const spinner = document.getElementById('spinner');
const refreshBtn = document.getElementById('refresh');
const folderInput = document.getElementById('folderInput');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const orderToggle = document.getElementById('orderToggle');
const pageInfo = document.getElementById('pageInfo');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const densitySlider = document.getElementById('densitySlider');
const selectionBar = document.getElementById('selectionBar');
const selectionCount = document.getElementById('selectionCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const selectNoneBtn = document.getElementById('selectNoneBtn');
// Optional/legacy folder picker elements (guarded)
const modal = document.getElementById('folderModal');
const crumbsEl = document.getElementById('crumbs');
const dirlistEl = document.getElementById('dirlist');
const chooseBtn = document.getElementById('chooseBtn');
const cancelBtn = document.getElementById('cancelBtn');
// Optional sidebar heatmap image placeholder (may not exist)
let sbHeatmapImg = document.getElementById('sbHeatmapImg');
// Folder picker current path state
let pickerPath = '';

// Global state
let currentPage = 1;
let totalPages = 1;
let totalFiles = 0;
let currentDensity = parseInt((densitySlider && densitySlider.value) || '12', 10);
const selectedItems = new Set();

// Sidebar collapse state
let sidebarCollapsed = false;

// Hover preview settings (loaded via Settings panel wiring)
let hoverPreviewsEnabled = false;
let hoverOnDemandEnabled = false;

// Density config: [pageSize (unused), columns, label]
// Density configuration helpers
// Direct mapping: slider value (1..8) equals columns (1..8)
function sliderToColumns(val) { return Math.max(1, Math.min(8, Number(val) || 4)); }
function columnsToSlider(cols) { return String(Math.max(1, Math.min(8, Number(cols) || 4))); }
function getColumns() {
  try {
    const saved = Number(localStorage.getItem('grid.columns'));
    if (Number.isFinite(saved) && saved >= 1 && saved <= 8) return saved;
  } catch(_) {}
  // Default to 4 columns if no saved value
  return 4;
}

// --- Fire TV helpers ---
function fireTvColumns(base) { return Math.max(1, Math.round(base * 0.6)); }
function setupFireTvMode() {
  // Adjust columns immediately
  try {
    const rawCols = sliderToColumns(densitySlider ? densitySlider.value : 4);
    const cols = fireTvColumns(rawCols);
    document.documentElement.style.setProperty('--columns', String(cols));
  } catch(_){ }
  // Make cards focusable & enable arrow navigation
  const gridEl = document.getElementById('grid');
  if (gridEl) {
    const ensureTabIndex = () => gridEl.querySelectorAll('.card').forEach(c => { if (!c.hasAttribute('tabindex')) c.tabIndex = 0; });
    const mo = new MutationObserver(ensureTabIndex);
    mo.observe(gridEl, { childList: true, subtree: true });
    ensureTabIndex();
    gridEl.addEventListener('keydown', (e) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      const cards = Array.from(gridEl.querySelectorAll('.card'));
      if (!cards.length) return;
      let idx = cards.indexOf(document.activeElement);
      if (idx === -1) idx = 0;
      const cols = parseInt(getComputedStyle(gridEl).getPropertyValue('--columns')||'4',10) || 4;
      if (e.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
      else if (e.key === 'ArrowRight') idx = Math.min(cards.length - 1, idx + 1);
      else if (e.key === 'ArrowUp') idx = Math.max(0, idx - cols);
      else if (e.key === 'ArrowDown') idx = Math.min(cards.length - 1, idx + cols);
      cards[idx]?.focus();
      e.preventDefault();
    });
    setTimeout(() => { const first = gridEl.querySelector('.card'); if (first) first.focus(); }, 600);
  }
}

if (document.documentElement.classList.contains('firetv')) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupFireTvMode);
  else setupFireTvMode();
}

// Fire TV header auto-hide / reveal logic
(function(){
  if (!document.documentElement.classList.contains('firetv')) return;
  let hideTimer = null;
  function showHeader() {
    const h = document.querySelector('header');
    if (!h) return;
    h.classList.add('firetv-show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideHeader(), 4000);
  }
  function hideHeader() {
    const h = document.querySelector('header');
    if (!h) return;
    h.classList.remove('firetv-show');
  }
  function activity() { showHeader(); }
  ['keydown','mousemove','touchstart','click'].forEach(ev => window.addEventListener(ev, activity, { passive: true }));
  // On first load, do not show header-top (hidden by CSS). Show on first activity.
  document.addEventListener('DOMContentLoaded', () => {
    // If desired, briefly show then hide after initial delay; currently remain hidden until activity.
    // Uncomment below to auto-show once then hide.
    // showHeader(); hideTimer = setTimeout(() => hideHeader(), 2500);
  });
})();

// Apply columns to the grid via CSS var and persist user preference
function setColumns(cols) {
  const c = Math.max(1, Math.min(8, Number(cols) || 4));
  try { localStorage.setItem('grid.columns', String(c)); } catch(_) {}
  // Apply on grid container and root to ensure CSS picks it up consistently
  if (grid && grid.style) grid.style.setProperty('--columns', String(c));
  if (document && document.documentElement && document.documentElement.style) {
    document.documentElement.style.setProperty('--columns', String(c));
  }
  // Fallback: set explicit columns inline in case CSS var path isn't applied
  if (grid && grid.style) {
    try { grid.style.gridTemplateColumns = `repeat(${c}, 1fr)`; } catch(_) {}
  }
}

// Handle slider -> columns mapping and refresh
function updateDensity() {
  if (!densitySlider) return;
  const cols = sliderToColumns(densitySlider.value);
  setColumns(cols);
}

function currentPath() {
  const val = (folderInput && folderInput.value || '').trim();
  if (!val) return '';
  return isAbsolutePath(val) ? '' : val;
}

// Sidebar toggle wiring
function initSidebarToggle() {
  const toggle = document.getElementById('sidebarToggle');
  const layout = document.getElementById('playerLayout');
  if (!toggle || !layout) return;
  if (toggle._wired) return; toggle._wired = true;
  const update = () => {
    if (sidebarCollapsed) {
      layout.classList.add('collapsed');
      toggle.textContent = '▶';
      toggle.dataset.state = 'closed';
    } else {
      layout.classList.remove('collapsed');
      toggle.textContent = '◀';
      toggle.dataset.state = 'open';
    }
  };
  toggle.addEventListener('click', () => { sidebarCollapsed = !sidebarCollapsed; update(); });
  update();
}

document.addEventListener('DOMContentLoaded', initSidebarToggle);

// Fullscreen helper fallback for browsers / Fire TV Silk
async function toggleFullscreen(el) {
  try {
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  } catch(_){ /* swallow */ }
}

// Scroll jank mitigation: throttle wheel-induced reflows
let _scrollBusy = false;
window.addEventListener('wheel', () => {
  if (_scrollBusy) return;
  _scrollBusy = true;
  requestAnimationFrame(()=> { _scrollBusy = false; });
}, { passive: true });

// ----- Card helpers -----
function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function fmtBytes(n) {
  const v = Number(n) || 0;
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, x = v;
  while (x >= 1024 && i < units.length-1) { x /= 1024; i++; }
  return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + ' ' + units[i];
}
function inferResLabel(file) {
  const h = Number(file?.height);
  const w = Number(file?.width);
  let tier = 0;
  if (Number.isFinite(h) && h > 0) tier = h;
  else if (Number.isFinite(w) && w > 0) {
    if (w >= 3840) tier = 2160; else if (w >= 2560) tier = 1440; else if (w >= 1920) tier = 1080; else if (w >= 1280) tier = 720; else if (w >= 854) tier = 480;
  } else {
    const nm = (String(file?.name||'') + ' ' + String(file?.title||'')).toLowerCase();
    if (/(2160p|\b4k\b|uhd)/.test(nm)) tier = 2160;
    else if (/1440p/.test(nm)) tier = 1440;
    else if (/1080p/.test(nm)) tier = 1080;
    else if (/720p/.test(nm)) tier = 720;
    else if (/480p/.test(nm)) tier = 480;
  }
  if (!tier) return '';
  return `${tier}p`;
}

// Template-backed card renderers (align with index.html and CSS)
function videoCard(file) {
  const tpl = document.getElementById('cardTemplate');
  const frag = tpl && tpl.content ? tpl.content.cloneNode(true) : null;
  if (!frag) {
    // Fallback to minimal card if template not found
    const div = document.createElement('div');
    div.className = 'card';
    const p = file.path || '';
    div.dataset.path = p;
    const cb = document.createElement('div');
    cb.className = 'card-checkbox';
    cb.setAttribute('role', 'checkbox');
    cb.setAttribute('aria-checked', 'false');
    div.appendChild(cb);
    const name = document.createElement('div');
    name.className = 'title';
    name.textContent = (file.title || file.name || p.split('/').pop() || p);
    div.appendChild(name);
    div.title = p;
    div.addEventListener('click', (e) => handleCardClick(e, p));
    return div;
  }
  const root = frag.querySelector('.card');
  const p = file.path || '';
  if (root) root.dataset.path = p;
  // Hover preview overlay wiring (grid)
  try { if (root) attachHoverOverlay(root, p); } catch(_) {}
  // Checkbox
  const cb = frag.querySelector('.card-checkbox');
  if (cb) {
    cb.setAttribute('role', 'checkbox');
    cb.setAttribute('aria-checked', 'false');
    cb.addEventListener('click', (e) => {
      // Toggle selection without opening the player
      toggleSelection(e, p);
    });
  }
  // Image
  const img = frag.querySelector('img.thumb');
  if (img) {
    const src = file.cover || '';
    if (src) img.src = src;
    img.alt = file.title || file.name || p.split('/').pop() || 'thumbnail';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
  }
  // Quality badge (top-right)
  const badge = frag.querySelector('.quality-badge');
  const resLabel = inferResLabel(file);
  if (badge && resLabel) {
    badge.textContent = resLabel;
    badge.style.display = 'inline-block';
  }
  // Remove duplicate overlay resolution (we use only the top-right quality badge)
  const overlay = frag.querySelector('.overlay-info');
  if (overlay) overlay.style.display = 'none';
  // Meta: title, duration, size
  const titleEl = frag.querySelector('.title');
  if (titleEl) {
    titleEl.textContent = file.title || file.name || p.split('/').pop() || p;
    // Rename is now in Player title, not on tiles; no dblclick wiring here.
  }
  const durEl = frag.querySelector('.duration');
  if (durEl) durEl.textContent = Number.isFinite(Number(file.duration)) ? fmtDuration(file.duration) : '';
  const sizeEl = frag.querySelector('.size');
  if (sizeEl) sizeEl.textContent = file.size ? fmtBytes(file.size) : '';
  // Title attribute for full path
  if (root) root.title = p;
  // Open behavior
  if (root) root.addEventListener('click', (e) => handleCardClick(e, p));
  return root || frag;
}

// Attach a video hover overlay to a card element that plays a small preview on hover
function attachHoverOverlay(cardEl, relPath) {
  if (!cardEl || cardEl._hoverWired) return;
  cardEl._hoverWired = true;
  const wrap = cardEl.querySelector('.thumb-wrap') || cardEl;
  const overlay = document.createElement('div');
  overlay.className = 'video-hover-preview';
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
  overlay.appendChild(v);
  wrap.appendChild(overlay);

  let fetching = null; // Promise<string|null>
  async function ensureSrc() {
    if (v.src) return v.src;
    if (fetching) return fetching;
    fetching = (async () => {
      const url = new URL('/api/hover/get', window.location.origin);
      url.searchParams.set('path', relPath);
      const src = url.toString();
      try {
        const head = await fetch(src, { method: 'HEAD', cache: 'no-store' });
        if (head.ok) return src;
      } catch(_) {}
      if (!hoverOnDemandEnabled) return null;
      // Kick off creation on demand
      try {
        const createUrl = new URL('/api/hover/create', window.location.origin);
        createUrl.searchParams.set('path', relPath);
        await fetch(createUrl.toString(), { method: 'POST' });
      } catch(_) {}
      // Poll for availability (up to ~8s)
      const start = Date.now();
      while (Date.now() - start < 8000) {
        try {
          const r = await fetch(src, { method: 'HEAD', cache: 'no-store' });
          if (r.ok) return src;
        } catch(_) {}
        await new Promise(res => setTimeout(res, 400));
      }
      return null;
    })();
    const got = await fetching; fetching = null; return got;
  }

  function onEnter() {
    if (!hoverPreviewsEnabled) return;
    ensureSrc().then((src) => {
      if (!src) return;
      if (!v.src) v.src = src + `&t=${Date.now()}`; // bust cache once
      overlay.classList.add('active');
      v.play().catch(()=>{});
    });
  }
  function onLeave() {
    overlay.classList.remove('active');
    try { v.pause(); } catch(_) {}
  }
  cardEl.addEventListener('mouseenter', onEnter);
  cardEl.addEventListener('mouseleave', onLeave);
  // Safety: pause when card scrolls off or grid is hidden
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (!e.isIntersecting) onLeave(); });
  }, { root: document.querySelector('#library-panel') || null, threshold: 0 });
  try { obs.observe(cardEl); } catch(_) {}
  // Handle error -> hide overlay gracefully
  v.addEventListener('error', () => { overlay.classList.remove('active'); });
}

function dirCard(dir) {
  const tpl = document.getElementById('dirTemplate');
  const frag = tpl && tpl.content ? tpl.content.cloneNode(true) : null;
  const name = dir.name || dir.path || String(dir) || '';
  const dpath = dir.path || name;
  if (!frag) {
    // Minimal fallback
    const div = document.createElement('div');
    div.className = 'card dir-card';
    const label = document.createElement('div');
    label.className = 'title';
    label.textContent = name;
    div.appendChild(label);
    div.title = dpath;
    div.addEventListener('click', async () => {
      if (folderInput) folderInput.value = dpath;
      currentPage = 1;
      await loadLibrary();
    });
    return div;
  }
  const root = frag.querySelector('.card');
  const titleEl = frag.querySelector('.title');
  const nameEl = frag.querySelector('.dir-name');
  if (titleEl) titleEl.textContent = name;
  if (nameEl) nameEl.textContent = name;
  if (root) root.title = dpath;
  if (root) root.addEventListener('click', async () => {
    if (folderInput) folderInput.value = dpath;
    currentPage = 1;
    await loadLibrary();
  });
  return root || frag;
}

// Inline rename helpers
function beginInlineRename(titleEl, relPath) {
  try {
    // Avoid duplicate editors
    if (titleEl.querySelector('input')) return;
    const basename = relPath.split('/').pop() || relPath;
    const dot = basename.lastIndexOf('.');
    const stem = dot > 0 ? basename.slice(0, dot) : basename;
    const ext = dot > 0 ? basename.slice(dot) : '';
    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-rename-input';
    input.value = stem;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.background = 'transparent';
    input.style.color = 'inherit';
    input.style.border = '1px solid rgba(255,255,255,0.2)';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 4px';
    input.style.outline = 'none';
    const oldText = titleEl.textContent;
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    const cancel = () => {
      titleEl.textContent = oldText;
    };
    const commit = async () => {
      const newStem = (input.value || '').trim();
      if (!newStem || newStem === stem) { cancel(); return; }
      // Build destination name, keep extension
      const newName = newStem + ext;
      try {
        const u = new URL('/api/media/rename', window.location.origin);
        u.searchParams.set('path', relPath);
        u.searchParams.set('new_name', newName);
        const r = await fetch(u.toString(), { method: 'POST' });
        if (!r.ok) {
          // Try to extract message
          let msg = 'Rename failed';
          try { const j = await r.json(); msg = j?.message || msg; } catch(_) {}
          notify(msg, 'error');
          cancel();
          return;
        }
        const j = await r.json();
        if (j?.status !== 'success') {
          notify(j?.message || 'Rename failed', 'error');
          cancel();
          return;
        }
        // Success: refresh appropriate UI
        notify('Renamed to ' + newName, 'success');
        // If we're renaming inside the Player, reopen the new path
        try {
          const parts = relPath.split('/');
          parts[parts.length - 1] = newName;
          const newRel = parts.join('/');
          if (typeof Player?.open === 'function' && titleEl.closest('#player-panel')) {
            Player.open(newRel);
          } else {
            // Tile context: reload library
            currentPage = 1;
            await loadLibrary();
          }
        } catch(_) {
          // Fallback to library reload
          currentPage = 1;
          await loadLibrary();
        }
      } catch (e) {
        notify('Rename error', 'error');
        cancel();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => { commit(); });
  } catch (_) {}
}

// Some modules call this; stop any active tile hover previews
function stopAllTileHovers() {
  try {
    document.querySelectorAll('.video-hover-preview').forEach(el => {
      el.classList.remove('active');
      const v = el.querySelector('video');
      if (v) { try { v.pause(); } catch(_) {} }
    });
  } catch(_) {}
}

// Library loader (wrapped around previously orphaned block)
async function loadLibrary() {
  if (!grid || !statusEl || !spinner) return;
  try {
    // Pre-state UI
    spinner.style.display = 'block';
    statusEl.style.display = 'none';

    // Build request
    const url = new URL('/api/library', window.location.origin);
    url.searchParams.set('page', String(currentPage));
  // page size derived from columns: 3 rows of tiles by default
  const cols = getColumns();
  const rows = 3;
  const pageSize = Math.max(12, cols * rows);
  url.searchParams.set('page_size', String(pageSize));
    const sort = (sortSelect && sortSelect.value) || 'date';
    const order = (orderToggle && orderToggle.dataset.order) || 'desc';
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', order);
    const searchVal = (searchInput && searchInput.value || '').trim();
    if (searchVal) url.searchParams.set('search', searchVal);
    const resSel = document.getElementById('resSelect');
    const resVal = resSel ? String(resSel.value || '') : '';
    if (resVal) url.searchParams.set('res_min', resVal);
    const p = currentPath();
    if (p) url.searchParams.set('path', p);

    const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.status !== 'success') throw new Error(payload?.message || 'Unexpected response');
    
    const data = payload.data || {};
    const files = Array.isArray(data.files) ? data.files : [];
    const dirs = Array.isArray(data.dirs) ? data.dirs : [];
    
    // Update pagination info
    totalPages = data.total_pages || 1;
    totalFiles = data.total_files || 0;
    currentPage = data.page || 1;
    
    // Update pagination UI
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalFiles} files)`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    grid.innerHTML = '';
    if (files.length === 0) {
      // When searching, do not auto-fill from subfolders; show no results instead
      if (dirs.length > 0 && !searchVal) {
        // Render folders first for navigation
        for (const d of dirs) grid.appendChild(dirCard(d));

        // Then fetch videos from up to N subfolders, respecting current sort/order
        const MAX_DIRS = 8;
        const MAX_TILES = 60;
        const subdirs = dirs.slice(0, MAX_DIRS);
        const combined = [];
        const curSort = ((sortSelect && sortSelect.value) || 'date');
        const curOrder = ((orderToggle && orderToggle.dataset.order) || 'desc');
        // Kick off fetches in parallel
        await Promise.all(subdirs.map(async (d) => {
          const dpath = d.path || d.name || '';
          if (!dpath) return;
          try {
            const u = new URL('/api/library', window.location.origin);
            u.searchParams.set('path', dpath);
            u.searchParams.set('page', '1');
            const subCols = cols; // use same density-derived columns
            const subPageSize = Math.min(MAX_TILES, Math.max(12, subCols * rows));
            u.searchParams.set('page_size', String(subPageSize));
            u.searchParams.set('sort', curSort);
            u.searchParams.set('order', curOrder);
            // Include resolution filter in fallback fetches
            const resSel2 = document.getElementById('resSelect');
            const resVal2 = resSel2 ? String(resSel2.value || '') : '';
            if (resVal2) u.searchParams.set('res_min', resVal2);
            const r = await fetch(u, { headers: { 'Accept': 'application/json' }});
            if (!r.ok) return;
            const pl = await r.json();
            const f2 = Array.isArray(pl?.data?.files) ? pl.data.files : [];
            for (const f of f2) combined.push(f);
          } catch (_) { /* ignore sub-errors */ }
        }));

        // Client-side sort across aggregated results for a consistent order
        const rev = curOrder === 'desc';
        if (curSort === 'name') {
          combined.sort((a,b) => (a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase()) * (rev ? -1 : 1));
        } else if (curSort === 'size') {
          combined.sort((a,b) => ((a.size||0) - (b.size||0)) * (rev ? -1 : 1));
        } else if (curSort === 'random') {
          for (let i = combined.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [combined[i], combined[j]] = [combined[j], combined[i]];
          }
        } else { // date or default
          combined.sort((a,b) => ((a.mtime||0) - (b.mtime||0)) * (rev ? -1 : 1));
        }

        // Render up to MAX_TILES
        let shown = 0;
        for (const f of combined) {
          if (shown >= MAX_TILES) break;
          grid.appendChild(videoCard(f));
          shown++;
        }

        spinner.style.display = 'none';
        grid.hidden = false;
        return;
      } else {
        spinner.style.display = 'none';
        statusEl.className = 'empty';
        statusEl.textContent = searchVal ? 'No results match your search.' : 'No videos found.';
        statusEl.style.display = 'block';
        grid.hidden = true;
        return;
      }
    }
    for (const f of files) {
      grid.appendChild(videoCard(f));
    }
    
    // Always hide status and show grid if we got here without errors
    statusEl.style.display = 'none';
    spinner.style.display = 'none';
    grid.hidden = false;
  } catch (e) {
    console.error('Library loading error:', e);
    spinner.style.display = 'none';
    statusEl.className = 'error';
    statusEl.textContent = 'Failed to load library.';
    statusEl.style.display = 'block';
    if (grid) grid.hidden = true;
  }
}

refreshBtn.addEventListener('click', loadLibrary);

// Grid control event listeners
searchInput.addEventListener('input', () => { currentPage = 1; loadLibrary(); });
sortSelect.addEventListener('change', () => {
  currentPage = 1;
  const v = (sortSelect && sortSelect.value) || 'date';
  if (orderToggle) {
    if (v === 'name') {
      // Default Name sort to ascending (A→Z)
      orderToggle.dataset.order = 'asc';
      orderToggle.textContent = '▲';
    } else if (v === 'date' || v === 'size') {
      // Default Date/Size to descending (newest/largest first)
      orderToggle.dataset.order = 'desc';
      orderToggle.textContent = '▼';
    }
  }
  loadLibrary();
});
orderToggle.addEventListener('click', () => { 
  const isDesc = orderToggle.dataset.order === 'desc';
  orderToggle.dataset.order = isDesc ? 'asc' : 'desc';
  orderToggle.textContent = isDesc ? '▲' : '▼';
  currentPage = 1; 
  loadLibrary(); 
});

// Resolution filter change
const resSelect = document.getElementById('resSelect');
if (resSelect) {
  resSelect.addEventListener('change', () => {
    // Persist selection
    try { localStorage.setItem('filter.res_min', resSelect.value || ''); } catch (_) {}
    currentPage = 1; 
    loadLibrary(); 
  });
}

// Pagination
prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadLibrary(); } });
nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadLibrary(); } });

// Density slider
densitySlider.addEventListener('input', () => {
  currentDensity = parseInt(densitySlider.value);
  // updateDensity reads slider -> columns mapping and persists columns
  updateDensity();
  currentPage = 1;
  loadLibrary();
});

// Some browsers fire change more predictably than input; wire both
densitySlider.addEventListener('change', () => {
  currentDensity = parseInt(densitySlider.value);
  updateDensity();
  currentPage = 1;
  loadLibrary();
});

// Initialize density from saved columns on load
(function initDensity() {
  const cols = getColumns();
  if (densitySlider) densitySlider.value = columnsToSlider(cols);
  setColumns(cols);
})();

// Re-apply columns when returning to Library tab (in case styles/layout reset)
window.addEventListener('tabchange', (e) => {
  try {
    if (e && e.detail && e.detail.activeTab === 'library') {
      setColumns(getColumns());
    }
  } catch(_) {}
});

// Settings wiring for hover previews
function loadHoverSetting() {
  try {
    const raw = localStorage.getItem('setting.hoverPreviews');
    hoverPreviewsEnabled = raw ? raw === '1' : false;
  } catch (_) {
    hoverPreviewsEnabled = false;
  }
}

function saveHoverSetting() {
  try { localStorage.setItem('setting.hoverPreviews', hoverPreviewsEnabled ? '1' : '0'); } catch (_) {}
}

function loadHoverOnDemandSetting() {
  try {
    const raw = localStorage.getItem('setting.hoverOnDemand');
    hoverOnDemandEnabled = raw ? raw === '1' : false;
  } catch (_) {
    hoverOnDemandEnabled = false;
  }
}

function saveHoverOnDemandSetting() {
  try { localStorage.setItem('setting.hoverOnDemand', hoverOnDemandEnabled ? '1' : '0'); } catch (_) {}
}

// Settings for timeline display toggles
function loadShowHeatmapSetting() {
  try {
    const raw = localStorage.getItem('setting.showHeatmap');
    // Default to ON when unset
    showHeatmap = raw == null ? true : (raw === '1');
  } catch (_) { showHeatmap = true; }
}
function saveShowHeatmapSetting() {
  try { localStorage.setItem('setting.showHeatmap', showHeatmap ? '1' : '0'); } catch (_) {}
}
function loadShowScenesSetting() {
  try {
    const raw = localStorage.getItem('setting.showScenes');
    showScenes = raw == null ? true : (raw === '1');
  } catch (_) { showScenes = true; }
}
function saveShowScenesSetting() {
  try { localStorage.setItem('setting.showScenes', showScenes ? '1' : '0'); } catch (_) {}
}

function wireSettings() {
  const cbPlay = document.getElementById('settingHoverPreviews');
  const cbDemand = document.getElementById('settingHoverOnDemand');
  const concurrencyInput = document.getElementById('settingConcurrency');
  const ffmpegConcInput = document.getElementById('settingFfmpegConcurrency');
  const ffmpegThreadsInput = document.getElementById('settingFfmpegThreads');
  const cbAutoplayResume = document.getElementById('settingAutoplayResume');
  const cbShowHeatmap = document.getElementById('settingShowHeatmap');
  const cbShowScenes = document.getElementById('settingShowScenes');
  loadHoverSetting();
  loadHoverOnDemandSetting();
  loadShowHeatmapSetting();
  loadShowScenesSetting();
  if (cbPlay) {
    cbPlay.checked = !!hoverPreviewsEnabled;
    cbPlay.addEventListener('change', () => {
      hoverPreviewsEnabled = !!cbPlay.checked;
      saveHoverSetting();
      if (!hoverPreviewsEnabled) stopAllTileHovers();
    });
  }
  if (cbDemand) {
    cbDemand.checked = !!hoverOnDemandEnabled;
    cbDemand.addEventListener('change', () => {
      hoverOnDemandEnabled = !!cbDemand.checked;
      saveHoverOnDemandSetting();
    });
  }

  // Timeline display toggles
  if (cbShowHeatmap) {
    cbShowHeatmap.checked = !!showHeatmap;
    cbShowHeatmap.addEventListener('change', () => {
      showHeatmap = !!cbShowHeatmap.checked;
      saveShowHeatmapSetting();
      applyTimelineDisplayToggles();
    });
  }
  if (cbShowScenes) {
    cbShowScenes.checked = !!showScenes;
    cbShowScenes.addEventListener('change', () => {
      showScenes = !!cbShowScenes.checked;
      saveShowScenesSetting();
      applyTimelineDisplayToggles();
    });
  }

  // Autoplay resume setting
  const loadAutoplayResume = () => {
    try { return localStorage.getItem('setting.autoplayResume') === '1'; } catch(_) { return false; }
  };
  const saveAutoplayResume = (v) => {
    try { localStorage.setItem('setting.autoplayResume', v ? '1' : '0'); } catch(_) {}
  };
  if (cbAutoplayResume) {
    cbAutoplayResume.checked = loadAutoplayResume();
    cbAutoplayResume.addEventListener('change', () => saveAutoplayResume(!!cbAutoplayResume.checked));
  }

  // Concurrency setting
  (async () => {
    try {
      const r = await fetch('/api/tasks/concurrency');
      if (r.ok) {
        const data = await r.json();
        const val = Number(data?.data?.maxConcurrency) || 4;
        if (concurrencyInput) concurrencyInput.value = String(val);
      } else if (concurrencyInput) {
        concurrencyInput.value = String(Number(localStorage.getItem('setting.maxConcurrency')) || 4);
      }
    } catch (_) {
      if (concurrencyInput) concurrencyInput.value = String(Number(localStorage.getItem('setting.maxConcurrency')) || 4);
    }
    // Load ffmpeg settings
    try {
      const r2 = await fetch('/api/settings/ffmpeg');
      if (r2.ok) {
        const d2 = await r2.json();
        const c = Number(d2?.data?.concurrency) || 2;
        const th = Number(d2?.data?.threads) || 1;
        if (ffmpegConcInput) ffmpegConcInput.value = String(c);
        if (ffmpegThreadsInput) ffmpegThreadsInput.value = String(th);
      } else {
        if (ffmpegConcInput) ffmpegConcInput.value = String(Number(localStorage.getItem('setting.ffmpegConcurrency')) || 2);
        if (ffmpegThreadsInput) ffmpegThreadsInput.value = String(Number(localStorage.getItem('setting.ffmpegThreads')) || 1);
      }
    } catch (_) {
      if (ffmpegConcInput) ffmpegConcInput.value = String(Number(localStorage.getItem('setting.ffmpegConcurrency')) || 2);
      if (ffmpegThreadsInput) ffmpegThreadsInput.value = String(Number(localStorage.getItem('setting.ffmpegThreads')) || 1);
    }
  })();
  // Debounced autosave on change
  if (concurrencyInput) {
    let t;
    const push = async (val) => {
      try {
        const r = await fetch(`/api/tasks/concurrency?value=${val}`, { method: 'POST' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        localStorage.setItem('setting.maxConcurrency', String(val));
        const data = await r.json();
        const applied = Number(data?.data?.maxConcurrency) || val;
        if (concurrencyInput) concurrencyInput.value = String(applied);
        tasksManager?.showNotification(`Max concurrency set to ${applied}`, 'success');
      } catch (e) {
        tasksManager?.showNotification('Failed to set concurrency', 'error');
      }
    };
    const debounced = (val) => {
      clearTimeout(t);
      t = setTimeout(() => push(val), 400);
    };
    const handle = () => {
      const val = Math.max(1, Math.min(128, Number(concurrencyInput.value || 4)));
      debounced(val);
    };
    concurrencyInput.addEventListener('change', handle);
    concurrencyInput.addEventListener('input', handle);
  }

  // FFmpeg concurrency + threads
  const debouncedPush = (() => {
    let t;
    return (fn) => { clearTimeout(t); t = setTimeout(fn, 400); };
  })();
  const pushFfmpegSettings = async () => {
    try {
      const conc = Math.max(1, Math.min(16, Number(ffmpegConcInput?.value || 2)));
      const th = Math.max(1, Math.min(32, Number(ffmpegThreadsInput?.value || 1)));
      const url = `/api/settings/ffmpeg?concurrency=${conc}&threads=${th}`;
      const r = await fetch(url, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const appliedC = Number(d?.data?.concurrency) || conc;
      const appliedT = Number(d?.data?.threads) || th;
      if (ffmpegConcInput) ffmpegConcInput.value = String(appliedC);
      if (ffmpegThreadsInput) ffmpegThreadsInput.value = String(appliedT);
      try { localStorage.setItem('setting.ffmpegConcurrency', String(appliedC)); } catch (_) {}
      try { localStorage.setItem('setting.ffmpegThreads', String(appliedT)); } catch (_) {}
      tasksManager?.showNotification(`FFmpeg settings updated (concurrency=${appliedC}, threads=${appliedT})`, 'success');
    } catch (e) {
      tasksManager?.showNotification('Failed to update FFmpeg settings', 'error');
    }
  };
  if (ffmpegConcInput) {
    const h = () => debouncedPush(pushFfmpegSettings);
    ffmpegConcInput.addEventListener('input', () => debouncedPush(pushFfmpegSettings));
    ffmpegConcInput.addEventListener('change', () => debouncedPush(pushFfmpegSettings));
  }
  if (ffmpegThreadsInput) {
    ffmpegThreadsInput.addEventListener('input', () => debouncedPush(pushFfmpegSettings));
    ffmpegThreadsInput.addEventListener('change', () => debouncedPush(pushFfmpegSettings));
  }
}

// (Removed: simple Enter handler; replaced below with unified behavior)
if (folderInput) {
  folderInput.addEventListener('dblclick', () => openFolderPicker());
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadLibrary();
});
window.addEventListener('load', () => {
  // Initialize density from saved/default (4); slider already set in initDensity
  // No need to force default again here
  
  // Initialize resolution filter from storage (persisted across sessions)
  try {
    const savedRes = localStorage.getItem('filter.res_min');
    const sel = document.getElementById('resSelect');
    if (sel) {
      const validValues = ['', '2160', '1440', '1080', '720', '480'];
      if (savedRes && validValues.includes(savedRes)) sel.value = savedRes;
      else if (!savedRes) sel.value = '';
    }
  } catch (_) {}

  // Prefill placeholder with current root value, but keep input empty for relative navigation
  fetch('/api/root').then(r => r.json()).then((p) => {
    if (p?.status === 'success' && p?.data?.root) {
      folderInput.placeholder = `Root: ${String(p.data.root)} — type a relative path to browse, or an absolute path to change root`;
      try { window.apiRootAbs = String(p.data.root); } catch(_) {}
      folderInput.value = '';
    } else {
      folderInput.value = '';
    }
  }).catch(() => {
    folderInput.value = '';
  }).finally(loadLibrary);

  // Initialize per-artifact options menus
  initArtifactOptionsMenus();
});

// Utility: toggled tooltip menus for artifact options
function initArtifactOptionsMenus() {
  // Close any open tooltip when clicking outside
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.options-tooltip').forEach(tt => {
      // hide all; specific handlers will re-open targeted one
      tt.style.display = 'none';
    });
    // also drop raised stacking on any cards
    document.querySelectorAll('.artifact-card.menu-open').forEach(card => card.classList.remove('menu-open'));
  });
  // Open corresponding tooltip for clicked options button
  document.querySelectorAll('.btn-options[data-artifact]').forEach(btn => {
    if (btn._optsWired) return;
    btn._optsWired = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const artifact = btn.getAttribute('data-artifact');
      const tooltip = document.getElementById(`${artifact}Options`);
      const card = btn.closest('.artifact-card');
      // Toggle: hide others, then toggle this
      document.querySelectorAll('.options-tooltip').forEach(tt => {
        if (tt !== tooltip) tt.style.display = 'none';
      });
      document.querySelectorAll('.artifact-card.menu-open').forEach(c => c.classList.remove('menu-open'));
      if (tooltip) {
        const willOpen = (tooltip.style.display === 'none' || !tooltip.style.display);
        tooltip.style.display = willOpen ? 'block' : 'none';
        if (card) {
          if (willOpen) card.classList.add('menu-open');
          else card.classList.remove('menu-open');
        }
        // Prevent global click handler from immediately closing it
        e.stopPropagation();
      }
    });
  });
}

// Density function (unified): map slider -> columns and apply
function updateDensity() {
  const cols = densitySlider ? sliderToColumns(densitySlider.value) : getColumns();
  setColumns(cols);
}

// Enhanced selection functions
let lastSelectedPath = null; // For shift-click range selection

function handleCardClick(event, path) {
  // If any items are selected, or if Ctrl/Shift is pressed, handle as selection
  if (selectedItems.size > 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
    if (event.shiftKey && lastSelectedPath) {
      // Shift-click: select range
      selectRange(lastSelectedPath, path);
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl-click: toggle individual item
      toggleSelection(event, path);
      lastSelectedPath = path;
    } else {
      // Normal click with items selected: toggle this item
      toggleSelection(event, path);
      lastSelectedPath = path;
    }
  } else {
    // No items selected and no modifiers: open in Player tab
    Player.open(path);
  }
}

function selectRange(startPath, endPath) {
  const cards = Array.from(document.querySelectorAll('.card[data-path]'));
  const startIdx = cards.findIndex(card => card.dataset.path === startPath);
  const endIdx = cards.findIndex(card => card.dataset.path === endPath);
  
  if (startIdx === -1 || endIdx === -1) return;
  
  const start = Math.min(startIdx, endIdx);
  const end = Math.max(startIdx, endIdx);
  
  for (let i = start; i <= end; i++) {
    const path = cards[i].dataset.path;
    if (path) {
      selectedItems.add(path);
      updateCardSelection(path);
    }
  }
  updateSelectionUI();
}

function toggleSelection(event, path) {
  event.preventDefault();
  event.stopPropagation();
  if (selectedItems.has(path)) {
    selectedItems.delete(path);
  } else {
    selectedItems.add(path);
  }
  updateSelectionUI();
  updateCardSelection(path);
}

function updateSelectionUI() {
  const count = selectedItems.size;
  if (count > 0) {
    selectionBar.hidden = false;
    selectionCount.textContent = `${count} selected`;
  } else {
    selectionBar.hidden = true;
  }
}

function updateCardSelection(path) {
  const card = document.querySelector(`[data-path="${path}"]`);
  if (card) {
    const checkbox = card.querySelector('.card-checkbox');
    if (selectedItems.has(path)) {
      checkbox.classList.add('checked');
      try { checkbox.setAttribute('aria-checked', 'true'); } catch(_){}
    } else {
      checkbox.classList.remove('checked');
      try { checkbox.setAttribute('aria-checked', 'false'); } catch(_){}
    }
  }
}

// Selection controls
selectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.card[data-path]').forEach(card => {
    const path = card.dataset.path;
    if (path) selectedItems.add(path);
  });
  updateSelectionUI();
  document.querySelectorAll('.card-checkbox').forEach(cb => cb.classList.add('checked'));
});

selectNoneBtn.addEventListener('click', () => {
  selectedItems.clear();
  updateSelectionUI();
  document.querySelectorAll('.card-checkbox').forEach(cb => cb.classList.remove('checked'));
});

// Folder picker
async function fetchDirs(path = '') {
  const url = new URL('/api/library', window.location.origin);
  if (path) url.searchParams.set('path', path);
  url.searchParams.set('page', '1');
  // Large page_size to avoid server-side file pagination affecting perceived results
  url.searchParams.set('page_size', '500'); // we only need dirs; dirs are not paginated server-side
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (payload?.status !== 'success') throw new Error(payload?.message || 'Unexpected response');
  const data = payload.data || {};
  const dirs = Array.isArray(data.dirs) ? data.dirs : [];
  return { cwd: String(data.cwd || ''), dirs };
}

function renderCrumbs(path) {
  crumbsEl.innerHTML = '';
  const segs = path.split('/').filter(Boolean);
  const mkSeg = (label, p) => {
    const s = document.createElement('span');
    s.className = 'seg';
    s.textContent = label;
    s.addEventListener('click', () => goTo(p));
    return s;
  };
  const divider = document.createTextNode(' / ');
  crumbsEl.appendChild(mkSeg('root', ''));
  let acc = '';
  for (const seg of segs) {
    crumbsEl.appendChild(divider.cloneNode());
    acc = acc ? acc + '/' + seg : seg;
    crumbsEl.appendChild(mkSeg(seg, acc));
  }
}

async function renderDir(path) {
  pickerPath = path;
  renderCrumbs(path);
  dirlistEl.innerHTML = '';
  try {
    const { dirs } = await fetchDirs(path);
    if (path) {
      const up = document.createElement('div');
      up.className = 'dir';
      up.innerHTML = `<div class="icon"></div><div>.. (up)</div>`;
      up.addEventListener('click', () => {
        const segs = path.split('/').filter(Boolean);
        segs.pop();
        goTo(segs.join('/'));
      });
      dirlistEl.appendChild(up);
    }
    dirs.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    for (const d of dirs) {
      const item = document.createElement('div');
      item.className = 'dir';
      const name = d.name || String(d);
      const dpath = d.path || (path ? `${path}/${name}` : name);
      item.innerHTML = `<div class="icon"></div><div>${name}</div>`;
      item.addEventListener('click', () => goTo(dpath));
      item.addEventListener('dblclick', () => choose(dpath));
      dirlistEl.appendChild(item);
    }
    if (dirs.length === 0) {
      const none = document.createElement('div');
      none.className = 'dir muted';
      const icon = document.createElement('div');
      icon.className = 'icon dim';
      const label = document.createElement('div');
      label.textContent = 'No folders here';
      none.appendChild(icon);
      none.appendChild(label);
      dirlistEl.appendChild(none);
    }
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'dir';
    err.textContent = 'Failed to list directories.';
    dirlistEl.appendChild(err);
  }
}

function openFolderPicker() {
  if (!modal) return; // no folder picker UI in this build
  modal.hidden = false;
  const val = (folderInput.value || '').trim();
  const start = isAbsolutePath(val) ? '' : currentPath();
  renderDir(start);
}
function closeFolderPicker() {
  modal.hidden = true;
}
function goTo(path) { renderDir(path); }
function choose(path) {
  folderInput.value = path || '';
  closeFolderPicker();
  loadLibrary();
}
if (chooseBtn) chooseBtn.addEventListener('click', () => choose(pickerPath));
if (cancelBtn) cancelBtn.addEventListener('click', () => closeFolderPicker());
if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeFolderPicker(); });

// Root setter merged into the single input
function isAbsolutePath(p) {
  if (!p) return false;
  // Allow Unix absolute (/...) and home (~), and Windows drive (C:\\ or C:/)
  return p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:[\\/]/.test(p);
}

// Lightweight global notifier so we can show toasts outside TasksManager too
function notify(message, type = 'info') {
  try {
    if (window.tasksManager && typeof window.tasksManager.showNotification === 'function') {
      window.tasksManager.showNotification(message, type);
      return;
    }
  } catch (_) {}
  // Fallback toast (matches TasksManager styling)
  const n = document.createElement('div');
  n.className = `notification notification-${type}`;
  n.textContent = message;
  n.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#4f8cff'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 5000);
}

async function setRoot(val) {
  const rootVal = (val || '').trim();
  if (!rootVal) return;
  if (!isAbsolutePath(rootVal)) {
    notify('Please enter an absolute path (e.g., /Volumes/Media or ~/Movies).', 'error');
    return;
  }
  try {
    // Validate path first to prevent 400s
    const tp = await fetch('/api/testpath?' + new URLSearchParams({ path: rootVal }), { method: 'POST' });
    if (!tp.ok) throw new Error('Path check failed (HTTP ' + tp.status + ')');
    const tj = await tp.json();
    const tdata = tj?.data || {};
    if (!tdata.exists || !tdata.is_dir) throw new Error('Path does not exist or is not a directory');

    // Set root on the server
    const sr = await fetch('/api/setroot?' + new URLSearchParams({ root: rootVal }), { method: 'POST' });
    if (!sr.ok) throw new Error('HTTP ' + sr.status);
    const sjson = await sr.json();
    if (sjson?.status !== 'success') throw new Error(sjson?.message || 'Failed to set root');

  // After setting root, clear the input so it's ready for relative paths
  const newRoot = String(sjson.data.root || rootVal);
  folderInput.value = '';
  folderInput.placeholder = `Root: ${newRoot} — type a relative path to browse, or an absolute path to change root`;
    currentPage = 1;
    notify(`Root set to ${newRoot}`, 'success');
    await loadLibrary();
  } catch (err) {
    notify(`Failed to set root: ${err && err.message ? err.message : 'Ensure the directory exists and is accessible.'}`, 'error');
  }
}

// Single-input behavior: Enter applies relative browse or sets root if absolute
folderInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const val = (folderInput.value || '').trim();
  currentPage = 1; // Reset to first page when changing folders
  if (!val) { await loadLibrary(); return; }
  if (isAbsolutePath(val)) {
    await setRoot(val);
  } else {
    await loadLibrary();
  }
});

// Tab Router for URL-based navigation
class TabRouter {
  constructor(tabSystem) {
    this.tabSystem = tabSystem;
    this.defaultTab = 'library';
    this.history = [];
  }

  init() {
    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', () => {
      this.handleRouteChange();
    });

    // Handle initial route on page load
    this.handleRouteChange();
  }

  handleRouteChange() {
    const hash = window.location.hash.slice(1); // Remove the # symbol
    const tabId = hash || this.defaultTab;
    
    // Track navigation history
    if (this.history.length === 0 || this.history[this.history.length - 1] !== tabId) {
      this.history.push(tabId);
      // Keep history reasonable size
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }
    }
    
    // Only switch if it's a valid tab and different from current
    if (this.tabSystem.tabs.has(tabId) && tabId !== this.tabSystem.activeTab) {
      // Switch without updating URL to avoid infinite loop
      this.tabSystem.switchToTab(tabId, false);
    } else if (!this.tabSystem.tabs.has(tabId) && hash) {
      // Invalid tab in URL, redirect to default
      this.updateUrl(this.defaultTab);
    }
  }

  updateUrl(tabId) {
    // Update URL hash without triggering hashchange if we're already there
    const newHash = `#${tabId}`;
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }

  // Navigate programmatically
  navigateTo(tabId) {
    if (this.tabSystem.tabs.has(tabId)) {
      this.updateUrl(tabId);
      // The hashchange event will trigger the tab switch
    }
  }

  // Go back to previous tab if available
  goBack() {
    if (this.history.length > 1) {
      // Remove current tab from history
      this.history.pop();
      // Get previous tab
      const previousTab = this.history[this.history.length - 1];
      this.navigateTo(previousTab);
    }
  }

  // Get current route
  getCurrentRoute() {
    return window.location.hash.slice(1) || this.defaultTab;
  }

  // Get navigation history
  getHistory() {
    return [...this.history];
  }

  // Check if can go back
  canGoBack() {
    return this.history.length > 1;
  }
}

// Tab System
class TabSystem {
  constructor() {
    this.activeTab = 'library';
    this.tabs = new Map();
    this.router = new TabRouter(this);
    this.init();
  }

  init() {
    // Find all tab buttons and panels
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    // Register tabs
    tabButtons.forEach(button => {
      const tabId = button.dataset.tab;
      const panel = document.getElementById(`${tabId}-panel`);
      if (panel) {
        this.tabs.set(tabId, { button, panel });
      }
    });

    // Add event listeners
    this.addEventListeners();

    // Initialize keyboard navigation
    this.initKeyboardNavigation();
    
    // Initialize router and handle initial route
    this.router.init();
  }

  addEventListeners() {
    this.tabs.forEach((tab, tabId) => {
      tab.button.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchToTab(tabId);
      });
    });
  }

  initKeyboardNavigation() {
    const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
    
    tabButtons.forEach((button, index) => {
      button.addEventListener('keydown', (e) => {
        let targetIndex = index;
        
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            targetIndex = index > 0 ? index - 1 : tabButtons.length - 1;
            break;
          case 'ArrowRight':
            e.preventDefault();
            targetIndex = index < tabButtons.length - 1 ? index + 1 : 0;
            break;
          case 'Home':
            e.preventDefault();
            targetIndex = 0;
            break;
          case 'End':
            e.preventDefault();
            targetIndex = tabButtons.length - 1;
            break;
          case 'Enter':
          case ' ':
            e.preventDefault();
            this.switchToTab(button.dataset.tab);
            return;
          default:
            return;
        }
        
        tabButtons[targetIndex].focus();
      });
    });
  }

  switchToTab(tabId, updateUrl = true) {
    if (!this.tabs.has(tabId)) return;

    const previousTab = this.activeTab;
    
    // Update active tab
    this.activeTab = tabId;

    // Update all tabs
    this.tabs.forEach((tab, id) => {
      const isActive = id === tabId;
      
      // Update button state
      tab.button.classList.toggle('active', isActive);
      tab.button.setAttribute('aria-selected', isActive);
      
      // Update panel visibility
      tab.panel.classList.toggle('active', isActive);
      tab.panel.hidden = !isActive;
    });

    // Focus management for accessibility
    const activeTab = this.tabs.get(tabId);
    if (activeTab && document.activeElement !== activeTab.button) {
      // Don't steal focus unless user is navigating with keyboard
      if (document.activeElement && document.activeElement.classList.contains('tab-button')) {
        activeTab.button.focus();
      }
    }

    // Update URL if requested
    if (updateUrl) {
      this.router.updateUrl(tabId);
    }

    // Trigger custom event for other components to react
    window.dispatchEvent(new CustomEvent('tabchange', { 
      detail: { activeTab: tabId, previousTab: previousTab } 
    }));
  }

  getActiveTab() {
    return this.activeTab;
  }

  addTab(tabId, buttonText, panelContent) {
    // Method to programmatically add tabs if needed
    const tabNav = document.querySelector('.tab-nav');
    const tabPanels = document.querySelector('.tab-panels');
    
    if (!tabNav || !tabPanels) return;

    // Create button
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.role = 'tab';
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-controls', `${tabId}-panel`);
    button.id = `${tabId}-tab`;
    button.dataset.tab = tabId;
    button.textContent = buttonText;
    tabNav.appendChild(button);

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.role = 'tabpanel';
    panel.setAttribute('aria-labelledby', `${tabId}-tab`);
    panel.id = `${tabId}-panel`;
    panel.hidden = true;
    panel.innerHTML = panelContent;
    tabPanels.appendChild(panel);

    // Register the new tab
    this.tabs.set(tabId, { button, panel });

    // Add event listeners
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchToTab(tabId);
    });

    return { button, panel };
  }
}

// Initialize tab system when DOM is ready
let tabSystem;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    tabSystem = new TabSystem();
    wireSettings();
  });
} else {
  tabSystem = new TabSystem();
  wireSettings();
}

// Export for potential external use
window.TabRouter = TabRouter;
window.TabSystem = TabSystem;
window.tabSystem = tabSystem;

// -----------------------------
// Player Manager
// -----------------------------
const Player = (() => {
  // DOM refs
  let videoEl, titleEl, metaEl, curEl, totalEl, timelineEl, heatmapEl, heatmapCanvasEl, progressEl, markersEl, spriteTooltipEl;
  // Custom controls
  let btnPlayPause, btnMute, volSlider, rateSelect, btnCC, btnPip, btnFullscreen;
  // Sidebar refs
  let sbFileNameEl, sbMetaEl;
  // Compact artifact badges
  let badgeHeatmap, badgeScenes, badgeSubtitles, badgeSprites, badgeFaces, badgeHover, badgePhash;
  let badgeHeatmapStatus, badgeScenesStatus, badgeSubtitlesStatus, badgeSpritesStatus, badgeFacesStatus, badgeHoverStatus, badgePhashStatus;
  let btnSetThumb, btnAddMarker;
  // Performers sidebar refs/state
  let perfChipsEl, perfInputEl, perfSuggestionsEl;
  let currentPerformers = [];
  let perfSuggestionsCache = null;

  // State
  let currentPath = null; // relative path from /api library
  let duration = 0;
  let sprites = null; // { index, sheet }
  let scenes = [];
  let hasHeatmap = false;
  // Cache last heatmap samples so we can redraw on resize
  let lastHeatmapSamples = null;
  let subtitlesUrl = null;
  let timelineMouseDown = false;

  // ---- Progress persistence (localStorage) ----
  const LS_PREFIX = 'mediaPlayer';
  const keyForVideo = (path) => `${LS_PREFIX}:video:${path}`;
  const keyLastVideo = () => `${LS_PREFIX}:lastVideo`;
  function saveProgress(path, data) {
    try {
      if (!path) return;
      const payload = JSON.stringify({
        t: Math.max(0, Number(data?.t ?? 0) || 0),
        d: Math.max(0, Number(data?.d ?? 0) || 0),
        paused: Boolean(data?.paused),
        rate: Number.isFinite(data?.rate) ? Number(data.rate) : undefined,
        ts: Date.now()
      });
      localStorage.setItem(keyForVideo(path), payload);
      localStorage.setItem(keyLastVideo(), path);
    } catch(_) {}
  }
  function loadProgress(path) {
    try {
      const raw = localStorage.getItem(keyForVideo(path));
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j || typeof j !== 'object') return null;
      return j;
    } catch(_) { return null; }
  }
  function getLastVideoPath() {
    try { return localStorage.getItem(keyLastVideo()) || null; } catch(_) { return null; }
  }

  function qs(id) { return document.getElementById(id); }
  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function initDom() {
    if (videoEl) return; // already
    videoEl = qs('playerVideo');
    titleEl = qs('playerTitle');
    metaEl = qs('playerMeta');
    curEl = qs('curTime');
    totalEl = qs('totalTime');
    timelineEl = qs('timeline');
    heatmapEl = qs('timelineHeatmap');
    heatmapCanvasEl = qs('timelineHeatmapCanvas');
    progressEl = qs('timelineProgress');
    markersEl = qs('timelineMarkers');
    spriteTooltipEl = qs('spritePreview');
    badgeHeatmap = qs('badgeHeatmap');
    badgeScenes = qs('badgeScenes');
    badgeSubtitles = qs('badgeSubtitles');
    badgeSprites = qs('badgeSprites');
    badgeFaces = qs('badgeFaces');
    badgeHover = qs('badgeHover');
    badgePhash = qs('badgePhash');
    badgeHeatmapStatus = qs('badgeHeatmapStatus');
    badgeScenesStatus = qs('badgeScenesStatus');
    badgeSubtitlesStatus = qs('badgeSubtitlesStatus');
    badgeSpritesStatus = qs('badgeSpritesStatus');
    badgeFacesStatus = qs('badgeFacesStatus');
    badgeHoverStatus = qs('badgeHoverStatus');
    badgePhashStatus = qs('badgePhashStatus');
    btnSetThumb = qs('btnSetThumb');
    btnAddMarker = qs('btnAddMarker');
    // Controls
    btnPlayPause = qs('btnPlayPause');
    btnMute = qs('btnMute');
    volSlider = qs('volSlider');
    rateSelect = qs('rateSelect');
    btnCC = qs('btnCC');
    btnPip = qs('btnPip');
    btnFullscreen = qs('btnFullscreen');

    // Sidebar
    sbFileNameEl = qs('sbFileName');
    sbMetaEl = qs('sbMeta');
  perfChipsEl = qs('perfChips');
  perfInputEl = qs('perfInput');
  perfSuggestionsEl = document.getElementById('perfSuggestions');

    // Wire basic events
    if (videoEl) {
      videoEl.addEventListener('timeupdate', () => {
        const t = videoEl.currentTime || 0;
        curEl.textContent = fmtTime(t);
        if (duration > 0) {
          const pct = Math.max(0, Math.min(100, (t / duration) * 100));
          progressEl.style.width = pct + '%';
        }
      });
      videoEl.addEventListener('loadedmetadata', () => {
        duration = Number(videoEl.duration) || 0;
        totalEl.textContent = fmtTime(duration);
        syncControls();
        // Attempt restore if we have saved progress
        try {
          const saved = currentPath ? loadProgress(currentPath) : null;
          if (saved && Number.isFinite(saved.t)) {
            const target = Math.max(0, Math.min(duration || 0, Number(saved.t)));
            if (target && Math.abs(target - (videoEl.currentTime || 0)) > 0.5) {
              videoEl.currentTime = target;
            }
            if (saved.rate && Number.isFinite(saved.rate)) {
              videoEl.playbackRate = Number(saved.rate);
            }
            const autoplayResume = (localStorage.getItem('setting.autoplayResume') === '1');
            if (!(saved.paused || !autoplayResume)) {
              videoEl.play().catch(()=>{});
            }
          }
        } catch(_) {}
      });
      videoEl.addEventListener('play', syncControls);
      videoEl.addEventListener('pause', syncControls);
      videoEl.addEventListener('volumechange', syncControls);
      videoEl.addEventListener('ratechange', syncControls);
      videoEl.addEventListener('enterpictureinpicture', syncControls);
      videoEl.addEventListener('leavepictureinpicture', syncControls);
      // Click anywhere on the video toggles play/pause
      if (!videoEl._clickToggleWired) {
        videoEl._clickToggleWired = true;
        videoEl.addEventListener('click', (e) => {
          // Only toggle when clicking the video surface itself
          if (e.target !== videoEl) return;
          if (videoEl.paused) videoEl.play(); else videoEl.pause();
        });
      }
    }
    if (timelineEl) {
      const seekTo = (evt) => {
        if (!duration || !videoEl) return;
        const rect = timelineEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(evt.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        const t = Math.max(0, Math.min(duration, pct * duration));
        videoEl.currentTime = t;
        saveProgress(currentPath, { t, d: duration, paused: videoEl.paused, rate: videoEl.playbackRate });
      };
      timelineEl.addEventListener('mousedown', (e) => { timelineMouseDown = true; seekTo(e); });
      window.addEventListener('mousemove', (e) => { if (timelineMouseDown) seekTo(e); });
      window.addEventListener('mouseup', () => { timelineMouseDown = false; });
      timelineEl.addEventListener('mouseenter', () => { spriteHoverEnabled = true; });
      timelineEl.addEventListener('mouseleave', () => { spriteHoverEnabled = false; hideSprite(); });
      timelineEl.addEventListener('mousemove', (e) => handleSpriteHover(e));

      // Redraw waveform on resize for crispness
      try {
        const ro = new ResizeObserver(() => {
          if (showHeatmap && hasHeatmap && lastHeatmapSamples) drawHeatmapCanvas(lastHeatmapSamples);
        });
        ro.observe(timelineEl);
      } catch(_) {
        // Fallback: window resize debounce
        let t = null;
        window.addEventListener('resize', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            if (showHeatmap && hasHeatmap && lastHeatmapSamples) drawHeatmapCanvas(lastHeatmapSamples);
          }, 150);
        });
      }
    }
    if (btnSetThumb && !btnSetThumb._wired) {
      btnSetThumb._wired = true;
      btnSetThumb.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, videoEl.currentTime || 0);
        try {
          const url = new URL('/api/cover/create', window.location.origin);
          url.searchParams.set('path', currentPath);
          url.searchParams.set('t', String(t.toFixed(3)));
          url.searchParams.set('overwrite', 'true');
          const r = await fetch(url, { method: 'POST' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          notify('Thumbnail set', 'success');
          // Refresh library tile if visible by reloading page 1 quickly
          setTimeout(() => loadLibrary(), 200);
        } catch (e) {
          notify('Failed to set thumbnail', 'error');
        }
      });
    }
    // Wire custom controls
    if (btnPlayPause && !btnPlayPause._wired) {
      btnPlayPause._wired = true;
      btnPlayPause.addEventListener('click', () => {
        if (!videoEl) return;
        if (videoEl.paused) videoEl.play(); else videoEl.pause();
      });
    }
    if (btnMute && !btnMute._wired) {
      btnMute._wired = true;
      btnMute.addEventListener('click', () => { if (videoEl) videoEl.muted = !videoEl.muted; });
    }
    if (volSlider && !volSlider._wired) {
      volSlider._wired = true;
      volSlider.addEventListener('input', () => { if (videoEl) videoEl.volume = Math.max(0, Math.min(1, parseFloat(volSlider.value))); });
    }
    if (rateSelect && !rateSelect._wired) {
      rateSelect._wired = true;
      rateSelect.addEventListener('change', () => { if (videoEl) videoEl.playbackRate = parseFloat(rateSelect.value || '1'); });
    }
    if (btnCC && !btnCC._wired) {
      btnCC._wired = true;
      btnCC.addEventListener('click', () => {
        try {
          const tracks = videoEl ? Array.from(videoEl.querySelectorAll('track')) : [];
          const anyShowing = tracks.some(t => t.mode === 'showing');
          tracks.forEach(t => t.mode = anyShowing ? 'disabled' : 'showing');
          syncControls();
        } catch (_) {}
      });
    }
    if (btnPip && !btnPip._wired) {
      btnPip._wired = true;
      btnPip.addEventListener('click', async () => {
        try {
          if (!document.pictureInPictureElement) await videoEl.requestPictureInPicture();
          else await document.exitPictureInPicture();
        } catch (_) {}
      });
    }
    if (btnFullscreen && !btnFullscreen._wired) {
      btnFullscreen._wired = true;
      btnFullscreen.addEventListener('click', async () => {
        const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
        await toggleFullscreen(container);
      });
    }
    if (btnAddMarker && !btnAddMarker._wired) {
      btnAddMarker._wired = true;
      btnAddMarker.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, videoEl.currentTime || 0);
        try {
          const url = new URL('/api/marker', window.location.origin);
          url.searchParams.set('path', currentPath);
          url.searchParams.set('time', String(t.toFixed(3)));
          const r = await fetch(url, { method: 'POST' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          notify('Marker added', 'success');
          await loadScenes();
          renderMarkers();
        } catch (e) {
          notify('Failed to add marker', 'error');
        }
      });
    }
    // Compact badges are wired in wireBadgeActions()
    // Apply initial display toggles now that elements are captured
    applyTimelineDisplayToggles();

    // Wire performers sidebar input once
    if (perfInputEl && !perfInputEl._wired) {
      perfInputEl._wired = true;
      perfInputEl.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const val = (perfInputEl.value || '').trim();
        if (!val) return;
        await addPerformerToVideo(val);
        perfInputEl.value = '';
      });
      // Prime suggestions on focus
      perfInputEl.addEventListener('focus', () => { refreshPerformerSuggestions(); });
    }
  }

  function syncControls() {
    try {
      if (!videoEl) return;
      // Use icon labels
      if (btnPlayPause) btnPlayPause.textContent = videoEl.paused ? '▶︎' : '⏸';
      if (btnMute) btnMute.textContent = videoEl.muted ? '🔇' : '🔊';
      if (volSlider && typeof videoEl.volume === 'number') volSlider.value = String(videoEl.volume);
      if (rateSelect) rateSelect.value = String(videoEl.playbackRate || 1);
      if (btnCC) {
        const tracks = Array.from(videoEl.querySelectorAll('track'));
        const anyShowing = tracks.some(t => t.mode === 'showing');
        btnCC.classList.toggle('active', anyShowing);
      }
    } catch (_) {}
  }

  function open(path) {
    initDom();
    currentPath = path;
    // Switch to Player tab
    if (window.tabSystem) window.tabSystem.switchToTab('player');
    // Load video source
    if (videoEl) {
      const src = new URL('/files/' + path, window.location.origin);
      // Cache-bust on change
      videoEl.src = src.toString() + `?t=${Date.now()}`;
      // Defer autoplay decision to loadedmetadata restore
      // Attempt to keep lastVideo reference for convenience
      saveProgress(path, { t: 0, d: 0, paused: true, rate: 1 });
    }
    // Metadata and title
    (async () => {
      try {
        const url = new URL('/api/metadata/get', window.location.origin);
        url.searchParams.set('path', path);
        const r = await fetch(url);
        const j = await r.json();
        const d = j?.data || {};
        titleEl.textContent = path.split('/').pop() || path;
        // Wire inline rename on player title
        if (titleEl && !titleEl._renameWired) {
          titleEl._renameWired = true;
          titleEl.style.cursor = 'text';
          titleEl.title = 'Double-click to rename';
          titleEl.addEventListener('dblclick', (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            // Use currentPath for accurate relative path
            if (currentPath) beginInlineRename(titleEl, currentPath);
          });
        }
        const wh = (d.width && d.height) ? `${d.width}x${d.height}` : '';
        const vc = d.vcodec || '';
        const ac = d.acodec || '';
        metaEl.textContent = [fmtTime(Number(d.duration)||0), wh, vc, ac].filter(Boolean).join(' • ');
        // Sidebar mirrors
        if (sbFileNameEl) sbFileNameEl.textContent = titleEl.textContent;
        if (sbMetaEl) sbMetaEl.textContent = metaEl.textContent;
      } catch (_) {
        titleEl.textContent = path.split('/').pop() || path;
        metaEl.textContent = '—';
        if (sbFileNameEl) sbFileNameEl.textContent = titleEl.textContent;
        if (sbMetaEl) sbMetaEl.textContent = metaEl.textContent;
      }
    })();
    // Artifacts
    loadHeatmap();
    loadSprites();
    loadScenes();
    loadSubtitles();
    loadFacesStatus();
    loadHoverStatus();
    loadPhashStatus();
    wireBadgeActions();
    // Initialize filter controls
    initFilterControls();
    // Load performers and suggestions for sidebar
    loadVideoPerformers();
    refreshPerformerSuggestions();
  }

  // Run browser-side face detection using the FaceDetector API and upload results to server
  async function detectAndUploadFacesBrowser(opts) {
    try {
      initDom();
      if (!currentPath || !videoEl) {
        notify('Open a video in the Player first, then try again.', 'error');
        if (window.tabSystem) window.tabSystem.switchToTab('player');
        return;
      }
      // Feature check
      const Supported = ('FaceDetector' in window) && typeof window.FaceDetector === 'function';
      if (!Supported) {
        notify('FaceDetector API not available in this browser. Try Chrome/Edge desktop.', 'error');
        return;
      }
      // Options from UI
      const intervalSec = Math.max(0.2, parseFloat(document.getElementById('faceInterval')?.value || '1.0'));
      const minSizeFrac = Math.max(0.01, Math.min(0.9, parseFloat(document.getElementById('faceMinSize')?.value || '0.10')));
      const maxSamples = 300; // safety cap
      // Ensure metadata is ready
      if (!Number.isFinite(duration) || duration <= 0) {
        await new Promise((res) => {
          const onMeta = () => { videoEl.removeEventListener('loadedmetadata', onMeta); res(); };
          videoEl.addEventListener('loadedmetadata', onMeta);
        });
      }
      const W = Math.max(1, videoEl.videoWidth || 0);
      const H = Math.max(1, videoEl.videoHeight || 0);
      // Prepare canvas
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) { notify('Canvas not available for capture.', 'error'); return; }
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      // Build sampling timeline
      const total = Math.max(0, Number(duration) || 0);
      let step = intervalSec;
      let samples = [];
      if (total <= 0) samples = [0];
      else {
        for (let t = 0; t <= total; t += step) samples.push(t);
        if (samples.length > maxSamples) {
          const ratio = samples.length / maxSamples;
          const out = [];
          for (let i = 0; i < samples.length; i += Math.ceil(ratio)) out.push(samples[i]);
          samples = out;
        }
      }
      if (samples.length === 0) samples = [0];
      // Pause and remember state
      const wasPaused = videoEl.paused;
      const prevT = videoEl.currentTime || 0;
      try { videoEl.pause(); } catch (_) {}
      notify(`Browser face detection: sampling ${samples.length} frame(s)...`, 'info');
      const faces = [];
      // Helper: precise seek
      const seekTo = (t) => new Promise((res) => {
        const onSeek = () => { videoEl.removeEventListener('seeked', onSeek); res(); };
        videoEl.addEventListener('seeked', onSeek);
        try { videoEl.currentTime = Math.max(0, Math.min(total, t)); } catch (_) { res(); }
      });
      for (let i = 0; i < samples.length; i++) {
        const t = samples[i];
        await seekTo(t);
        try {
          ctx.drawImage(videoEl, 0, 0, W, H);
          // FaceDetector accepts Canvas as source
          const dets = await detector.detect(canvas);
          for (const d of dets || []) {
            const bb = d && d.boundingBox ? d.boundingBox : null;
            if (!bb) continue;
            let x = Math.max(0, Math.floor(bb.x || 0));
            let y = Math.max(0, Math.floor(bb.y || 0));
            let w = Math.max(0, Math.floor(bb.width || 0));
            let h = Math.max(0, Math.floor(bb.height || 0));
            if (w <= 1 || h <= 1) continue;
            const minFrac = Math.min(w / W, h / H);
            if (minFrac < minSizeFrac) continue;
            faces.push({ time: Number(t.toFixed(3)), box: [x, y, w, h], score: 1.0 });
          }
        } catch (err) {
          // continue on errors
        }
      }
      // Restore playback position/state
      try { videoEl.currentTime = prevT; } catch(_) {}
      try { if (!wasPaused) await videoEl.play(); } catch(_) {}
      if (faces.length === 0) {
        notify('No faces detected in sampled frames.', 'error');
        return;
      }
      // If an existing faces.json is present, confirm overwrite
      let overwrite = true;
      try {
        const head = await fetch('/api/faces/get?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
        if (head.ok) {
          overwrite = confirm('faces.json already exists for this video. Replace it with browser-detected faces?');
          if (!overwrite) return;
        }
      } catch (_) {}
      // Upload
      const payload = { faces, backend: 'browser-facedetector', stub: false };
      const url = new URL('/api/faces/upload', window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set('compute_embeddings', 'true');
      url.searchParams.set('overwrite', overwrite ? 'true' : 'false');
      const r = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j?.status === 'success') {
        notify(`Uploaded ${faces.length} face(s) from browser detection.`, 'success');
        // Refresh indicators
        try { if (window.tasksManager) window.tasksManager.loadCoverage(); } catch(_) {}
        try { await loadFacesStatus(); } catch(_) {}
      } else {
        throw new Error(j?.message || 'Upload failed');
      }
    } catch (e) {
      notify('Browser detection failed: ' + (e && e.message ? e.message : 'error'), 'error');
    }
  }

  async function loadHeatmap() {
    if (!currentPath) return;
    try {
      // Prefer JSON + canvas rendering for higher fidelity
      let renderedViaJson = false;
      try {
        const ju = new URL('/api/heatmaps/json', window.location.origin);
        ju.searchParams.set('path', currentPath);
        const jr = await fetch(ju.toString(), { headers: { 'Accept': 'application/json' } });
        if (jr.ok) {
          const jj = await jr.json();
          const hm = jj?.data?.heatmaps || jj?.heatmaps || jj;
          const samples = Array.isArray(hm?.samples) ? hm.samples : [];
          if (samples.length && heatmapCanvasEl) {
            lastHeatmapSamples = samples;
            drawHeatmapCanvas(samples);
            // Clear any PNG bg under it
            heatmapEl.style.backgroundImage = '';
            hasHeatmap = true;
            renderedViaJson = true;
          }
        }
      } catch (_) { /* ignore and fallback to PNG probe */ }

      if (!renderedViaJson) {
        // Silent probe using HEAD to avoid console errors from failed image loads
        const base = new URL('/api/heatmaps/png', window.location.origin);
        base.searchParams.set('path', currentPath);
        let ok = false;
        try {
          const h = await fetch(base.toString(), { method: 'HEAD', cache: 'no-store' });
          ok = h.ok;
        } catch (_) { ok = false; }
        if (ok) {
          const url = base.toString() + `&t=${Date.now()}`;
          heatmapEl.style.backgroundImage = `url('${url}')`;
          if (heatmapCanvasEl) { clearHeatmapCanvas(); }
          hasHeatmap = true;
          if (sbHeatmapImg) sbHeatmapImg.src = url;
        } else {
          heatmapEl.style.backgroundImage = '';
          if (heatmapCanvasEl) { clearHeatmapCanvas(); }
          hasHeatmap = false;
        }
      }

      // Badge update
      if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = hasHeatmap ? '✓' : '✗';
      if (badgeHeatmap) badgeHeatmap.dataset.present = hasHeatmap ? '1' : '0';
      // Respect display toggle immediately
      applyTimelineDisplayToggles();
    } catch (_) {
      heatmapEl.style.backgroundImage = '';
      if (heatmapCanvasEl) { clearHeatmapCanvas(); }
      hasHeatmap = false;
      if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = '✗';
      if (badgeHeatmap) badgeHeatmap.dataset.present = '0';
      applyTimelineDisplayToggles();
    }
  }

  function clearHeatmapCanvas() {
    try {
      const ctx = heatmapCanvasEl.getContext('2d');
      ctx.clearRect(0, 0, heatmapCanvasEl.width || 0, heatmapCanvasEl.height || 0);
      lastHeatmapSamples = null;
    } catch (_) {}
  }

  function drawHeatmapCanvas(samples) {
    if (!heatmapCanvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    const w = heatmapCanvasEl.clientWidth || 1;
    const h = heatmapCanvasEl.clientHeight || 1;
    if (heatmapCanvasEl.width !== Math.round(w * dpr) || heatmapCanvasEl.height !== Math.round(h * dpr)) {
      heatmapCanvasEl.width = Math.round(w * dpr);
      heatmapCanvasEl.height = Math.round(h * dpr);
    }
    const ctx = heatmapCanvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Normalize values 0..1 and lightly smooth, downsample to match width
    const raw = samples.map(s => Math.max(0, Math.min(1, Number(s.v) || 0)));
    const targetPts = Math.max(32, Math.min(512, Math.floor(w)));
    const step = Math.max(1, Math.floor(raw.length / targetPts));
    const down = [];
    for (let i = 0; i < raw.length; i += step) down.push(raw[i]);
    const win = Math.max(2, Math.round(down.length / 64));
    const vals = new Array(down.length);
    let sum = 0;
    for (let i = 0; i < down.length; i++) {
      sum += down[i];
      if (i >= win) sum -= down[i - win];
      const v = (i >= win - 1) ? (sum / win) : (sum / Math.max(1, i + 1));
      // Ease dynamic range so quiet areas still show shape
      vals[i] = Math.pow(v, 0.8);
    }

    const yMid = h / 2;
    const ampMax = Math.max(2, (h / 2) - 2);
    const N = vals.length;
    if (N < 2) return;
    const xs = new Array(N);
    const topYs = new Array(N);
    const botYs = new Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w;
      const a = Math.max(0, Math.min(1, vals[i])) * ampMax;
      xs[i] = x;
      topYs[i] = yMid - a;
      botYs[i] = yMid + a;
    }

    // Fill gradient resembling the reference style
    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0.0, 'rgba(79,140,255,0.35)');
    fillGrad.addColorStop(1.0, 'rgba(255,122,89,0.35)');
    ctx.fillStyle = fillGrad;

    // Closed path: top curve left->right, bottom curve right->left
    ctx.beginPath();
    ctx.moveTo(xs[0], yMid);
    for (let i = 1; i < N; i++) {
      const xc = (xs[i - 1] + xs[i]) / 2;
      const yc = (topYs[i - 1] + topYs[i]) / 2;
      ctx.quadraticCurveTo(xs[i - 1], topYs[i - 1], xc, yc);
    }
    ctx.lineTo(xs[N - 1], yMid);
    for (let i = N - 1; i > 0; i--) {
      const xc = (xs[i] + xs[i - 1]) / 2;
      const yc = (botYs[i] + botYs[i - 1]) / 2;
      ctx.quadraticCurveTo(xs[i], botYs[i], xc, yc);
    }
    ctx.closePath();
    ctx.fill();

    // Delicate outline on top ridge
    ctx.beginPath();
    ctx.moveTo(xs[0], topYs[0]);
    for (let i = 1; i < N; i++) {
      const xc = (xs[i - 1] + xs[i]) / 2;
      const yc = (topYs[i - 1] + topYs[i]) / 2;
      ctx.quadraticCurveTo(xs[i - 1], topYs[i - 1], xc, yc);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Soft vignette to blend
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.20)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function heatColor(v) {
    // Map 0..1 to a pleasing gradient
    // 0 -> #0b1020 transparentish, 0.5 -> #4f8cff, 1 -> #ff7a59
    const clamp = (x) => Math.max(0, Math.min(1, x));
    v = clamp(v);
    // Blend between three stops
    if (v < 0.5) {
      const t = v / 0.5; // 0..1
      return lerpColor([11,16,32, 0.5], [79,140,255, 0.85], t);
    } else {
      const t = (v - 0.5) / 0.5;
      return lerpColor([79,140,255, 0.85], [255,122,89, 0.95], t);
    }
  }

  function lerpColor(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    const al = (a[3] + (b[3] - a[3]) * t).toFixed(3);
    return `rgba(${r},${g},${bl},${al})`;
  }

  async function loadSprites() {
  // initialize
    sprites = null;
    if (!currentPath) return;
    try {
      const u = new URL('/api/sprites/json', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const index = data?.data?.index;
      const sheet = data?.data?.sheet;
      if (index && sheet) {
        sprites = { index, sheet };
        if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✓';
        if (badgeSprites) badgeSprites.dataset.present = '1';
      }
    } catch (_) { sprites = null; }
    if (!sprites) {
      if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✗';
      if (badgeSprites) badgeSprites.dataset.present = '0';
    }
  }

  async function loadScenes() {
    scenes = [];
    if (!currentPath) return;
    try {
      const u = new URL('/api/scenes/get', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const d = data?.data || {};
      const arr = (d.scenes && Array.isArray(d.scenes)) ? d.scenes : (d.markers || []);
      scenes = arr.map(s => ({ time: Number(s.time || s.t || s.start || 0) })).filter(s => Number.isFinite(s.time));
      renderMarkers();
      if (badgeScenesStatus) badgeScenesStatus.textContent = scenes.length ? '✓' : '✗';
      if (badgeScenes) badgeScenes.dataset.present = scenes.length ? '1' : '0';
      applyTimelineDisplayToggles();
    } catch (_) { scenes = []; renderMarkers(); if (badgeScenesStatus) badgeScenesStatus.textContent='✗'; if (badgeScenes) badgeScenes.dataset.present='0'; }
    applyTimelineDisplayToggles();
  }

  async function loadSubtitles() {
    subtitlesUrl = null;
    if (!currentPath || !videoEl) return;
    // Remove existing tracks
    Array.from(videoEl.querySelectorAll('track')).forEach(t => t.remove());
    try {
      // Silent probe via HEAD to avoid attaching a failing track that logs
      const test = await fetch('/api/subtitles/get?path=' + encodeURIComponent(currentPath), { method: 'HEAD', cache: 'no-store' });
      if (test.ok) {
        const src = '/api/subtitles/get?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
        subtitlesUrl = src;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Subtitles';
        track.srclang = 'en';
        track.default = true;
        track.src = src; // browser will parse SRT in many cases; if not, still downloadable
        videoEl.appendChild(track);
        if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✓';
        if (badgeSubtitles) badgeSubtitles.dataset.present = '1';
      }
    } catch (_) { /* ignore */ }
    if (!subtitlesUrl) {
      if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✗';
      if (badgeSubtitles) badgeSubtitles.dataset.present = '0';
    }
  }

  function renderMarkers() {
    if (!markersEl) return;
    markersEl.innerHTML = '';
    if (!duration || !scenes || scenes.length === 0) return;
    const rect = timelineEl.getBoundingClientRect();
    for (const s of scenes) {
      const t = Math.max(0, Math.min(duration, Number(s.time)));
      const pct = (t / duration) * 100;
      const mark = document.createElement('div');
      mark.style.position = 'absolute';
      mark.style.left = `calc(${pct}% - 2px)`;
      mark.style.top = '0';
      mark.style.width = '4px';
      mark.style.height = '100%';
      mark.style.background = 'rgba(255,255,255,0.7)';
      mark.style.mixBlendMode = 'screen';
      mark.title = fmtTime(t);
      markersEl.appendChild(mark);
    }
  }

  function renderSidebarScenes() { /* list removed in compact sidebar */ }

  let spriteHoverEnabled = false;

  async function loadFacesStatus() {
    try {
      if (!currentPath) return;
      const u = new URL('/api/faces/get', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString(), { method: 'HEAD', cache: 'no-store' });
      const ok = r.ok;
      if (badgeFacesStatus) badgeFacesStatus.textContent = ok ? '✓' : '✗';
      if (badgeFaces) badgeFaces.dataset.present = ok ? '1' : '0';
    } catch (_) { if (badgeFacesStatus) badgeFacesStatus.textContent = '✗'; if (badgeFaces) badgeFaces.dataset.present = '0'; }
  }

  async function loadHoverStatus() {
    try {
      if (!currentPath) return;
      const u = new URL('/api/hover/get', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString(), { method: 'HEAD', cache: 'no-store' });
      const ok = r.ok;
      if (badgeHoverStatus) badgeHoverStatus.textContent = ok ? '✓' : '✗';
      if (badgeHover) badgeHover.dataset.present = ok ? '1' : '0';
    } catch (_) { if (badgeHoverStatus) badgeHoverStatus.textContent = '✗'; if (badgeHover) badgeHover.dataset.present = '0'; }
  }

  async function loadPhashStatus() {
    try {
      if (!currentPath) return;
      const u = new URL('/api/phash/get', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString(), { method: 'HEAD', cache: 'no-store' });
      const ok = r.ok;
      if (badgePhashStatus) badgePhashStatus.textContent = ok ? '✓' : '✗';
      if (badgePhash) badgePhash.dataset.present = ok ? '1' : '0';
    } catch (_) { if (badgePhashStatus) badgePhashStatus.textContent = '✗'; if (badgePhash) badgePhash.dataset.present = '0'; }
  }

  function wireBadgeActions() {
    const gen = async (kind) => {
      if (!currentPath) return;
      // Capability gating: map kind -> operation type
      try {
        const caps = (window.tasksManager && window.tasksManager.capabilities) || window.__capabilities || {};
        const needsFfmpeg = new Set(['heatmap', 'scenes', 'sprites', 'hover', 'phash']);
        if (needsFfmpeg.has(kind) && caps.ffmpeg === false) {
          notify('Cannot start: FFmpeg not detected', 'error');
          return;
        }
        if (kind === 'subtitles' && caps.subtitles_enabled === false) {
          notify('Cannot start subtitles: no backend available', 'error');
          return;
        }
        if (kind === 'faces' && caps.faces_enabled === false) {
          notify('Cannot start faces: face backends unavailable', 'error');
          return;
        }
      } catch(_) {}
      try {
        // TODO: @copilot DRY
        let url;
             if (kind === 'heatmap') url = new URL('/api/heatmaps/create', window.location.origin);
        else if (kind === 'scenes') url = new URL('/api/scenes/create', window.location.origin);
        else if (kind === 'subtitles') url = new URL('/api/subtitles/create', window.location.origin);
        else if (kind === 'sprites') url = new URL('/api/sprites/create', window.location.origin);
        else if (kind === 'faces') url = new URL('/api/faces/create', window.location.origin);
        else if (kind === 'hover') url = new URL('/api/hover/create', window.location.origin);
        else if (kind === 'phash') url = new URL('/api/phash/create', window.location.origin);
        else return;
        url.searchParams.set('path', currentPath);
        const r = await fetch(url.toString(), { method: 'POST' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        notify(kind + ' generation started', 'success');
        setTimeout(() => {
          if (kind==='heatmap') loadHeatmap();
          else if (kind==='scenes') loadScenes();
          else if (kind==='subtitles') loadSubtitles();
          else if (kind==='sprites') loadSprites();
          else if (kind==='faces') loadFacesStatus();
          else if (kind==='hover') loadHoverStatus();
          else if (kind==='phash') loadPhashStatus();
        }, 400);
      } catch (e) {
        notify('Failed to start ' + kind + ' job', 'error');
      }
    };
    const attach = (btn, kind) => {
      if (!btn || btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => {
        const present = btn.dataset.present === '1';
        if (!present) gen(kind);
      });
    };
    // TODO: @copilot DRY
    attach(badgeHeatmap, 'heatmap');
    attach(badgeScenes, 'scenes');
    attach(badgeSubtitles, 'subtitles');
    attach(badgeSprites, 'sprites');
    attach(badgeFaces, 'faces');
    attach(badgeHover, 'hover');
    attach(badgePhash, 'phash');
  }

  function handleSpriteHover(evt) {
    if (!sprites || !sprites.index || !sprites.sheet) { hideSprite(); return; }
    if (!spriteHoverEnabled) { hideSprite(); return; }
    const rect = timelineEl.getBoundingClientRect();
    // Tooltip now lives under the controls container below the video
    const container = spriteTooltipEl && spriteTooltipEl.parentElement ? spriteTooltipEl.parentElement : (videoEl && videoEl.parentElement ? videoEl.parentElement : document.body);
    const containerRect = container.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    if (x < 0 || x > rect.width) { hideSprite(); return; }
    const pct = x / rect.width;
    const t = pct * (duration || 0);
    // Position tooltip
    // Determine tile width/height for placement
    let tw = 240, th = 135;
    try {
      const idx = sprites.index;
      tw = Number(idx.tile_width || (idx.tile && idx.tile[0]) || tw);
      th = Number(idx.tile_height || (idx.tile && idx.tile[1]) || th);
    } catch(_) {}
    // Scale preview to avoid being too large; cap width to 180px
    const scale = Math.min(1, 180 / Math.max(1, tw));
    const twS = Math.max(1, Math.round(tw * scale));
    const thS = Math.max(1, Math.round(th * scale));
    const halfW = Math.max(1, Math.floor(twS / 2));
    const baseLeft = (rect.left - containerRect.left) + x - halfW; // center on cursor
    const clampedLeft = Math.max(8, Math.min(containerRect.width - (twS + 8), baseLeft));
    spriteTooltipEl.style.left = clampedLeft + 'px';
    // Place the preview directly above the entire controls container
    // Bottom of the tooltip sits 'gap' px above the top edge of #playerControlsContainer
    const gap = 12; // px
    const anchorTop = -gap;
    spriteTooltipEl.style.top = anchorTop + 'px';
    spriteTooltipEl.style.bottom = 'auto';
    spriteTooltipEl.style.transform = 'translateY(-100%)';
    // Ensure tooltip stays above any overlay bars
    spriteTooltipEl.style.zIndex = '9999';
    spriteTooltipEl.style.display = 'block';
    // Compute background position based on sprite metadata
    try {
      const idx = sprites.index;
      const cols = Number(idx.cols || (idx.grid && idx.grid[0]) || 0);
      const rows = Number(idx.rows || (idx.grid && idx.grid[1]) || 0);
      const interval = Number(idx.interval || 10);
      // tw/th already computed above for placement
      const totalFrames = Math.max(1, Number(idx.frames || cols * rows));
      const frame = Math.min(totalFrames - 1, Math.floor((t / Math.max(0.1, interval))));
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      const xOff = -(col * tw) * scale;
      const yOff = -(row * th) * scale;
      spriteTooltipEl.style.width = twS + 'px';
      spriteTooltipEl.style.height = thS + 'px';
      spriteTooltipEl.style.backgroundImage = `url('${sprites.sheet}')`;
      spriteTooltipEl.style.backgroundPosition = `${xOff}px ${yOff}px`;
      spriteTooltipEl.style.backgroundSize = `${tw * cols * scale}px ${th * rows * scale}px`;
      spriteTooltipEl.style.opacity = '0.8';
    } catch (_) {
      // If anything goes wrong, hide the preview gracefully
      hideSprite();
    }
  }

  // Spacebar toggles play/pause when player tab is active
  document.addEventListener('keydown', (e) => {
    try {
      if (window.tabSystem?.getActiveTab() !== 'player') return;
      // Ignore if typing into inputs/selects
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!videoEl) return;
        if (videoEl.paused) videoEl.play(); else videoEl.pause();
      }
    } catch (_) {}
  });

  // Persist on unload as a final safeguard
  window.addEventListener('beforeunload', () => {
    try {
      if (videoEl && currentPath) {
        saveProgress(currentPath, { t: videoEl.currentTime||0, d: duration, paused: videoEl.paused, rate: videoEl.playbackRate });
      }
    } catch(_) {}
  });

  function hideSprite() {
    if (spriteTooltipEl) spriteTooltipEl.style.display = 'none';
  }

  // Apply show/hide for heatmap and markers based on settings
  function applyTimelineDisplayToggles() {
    try {
      if (heatmapEl) heatmapEl.style.display = showHeatmap && hasHeatmap ? '' : 'none';
      if (heatmapCanvasEl) heatmapCanvasEl.style.display = showHeatmap && hasHeatmap ? '' : 'none';
      if (markersEl) markersEl.style.display = showScenes && (scenes && scenes.length > 0) ? '' : 'none';
    } catch(_) {}
  }


  // -----------------------------
  // Performers (Player sidebar)
  // -----------------------------
  function splitRelPath(p) {
    p = String(p || '');
    const i = p.lastIndexOf('/');
    if (i === -1) return { dir: '', name: p };
    return { dir: p.slice(0, i), name: p.slice(i + 1) };
  }

  async function loadVideoPerformers() {
    try {
      if (!currentPath) return;
      const { dir, name } = splitRelPath(currentPath);
      const url = new URL('/api/videos/' + encodeURIComponent(name) + '/tags', window.location.origin);
      if (dir) url.searchParams.set('directory', dir);
      const r = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const data = j?.data || j || {};
      currentPerformers = Array.isArray(data.performers) ? data.performers : [];
      renderPerformerChips();
    } catch(_) {
      currentPerformers = [];
      renderPerformerChips();
    }
  }

  function renderPerformerChips() {
    if (!perfChipsEl) return;
    perfChipsEl.innerHTML = '';
    if (!currentPerformers || currentPerformers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted text-12';
      empty.textContent = 'No performers yet';
      perfChipsEl.appendChild(empty);
      return;
    }
    for (const name of currentPerformers) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const label = document.createElement('span');
      label.textContent = name;
      const btn = document.createElement('button');
      btn.className = 'remove';
      btn.title = 'Remove performer';
      btn.textContent = '×';
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        await removePerformerFromVideo(name);
      });
      chip.appendChild(label);
      chip.appendChild(btn);
      perfChipsEl.appendChild(chip);
    }
  }

  async function addPerformerToVideo(name) {
    try {
      if (!currentPath || !name) return;
      const { dir, name: base } = splitRelPath(currentPath);
      const url = new URL('/api/videos/' + encodeURIComponent(base) + '/tags', window.location.origin);
      if (dir) url.searchParams.set('directory', dir);
      const body = { performers_add: [name] };
      const r = await fetch(url.toString(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      notify('Added performer', 'success');
      await loadVideoPerformers();
      // Optional: add to registry if missing to improve suggestions
      try { await ensurePerformerInRegistry(name); } catch(_) {}
      // Refresh top-level table if present
      try { if (window.performersManager) window.performersManager.refreshCountsSoon(); } catch(_) {}
    } catch(_) {
      notify('Failed to add performer', 'error');
    }
  }

  async function removePerformerFromVideo(name) {
    try {
      if (!currentPath || !name) return;
      const { dir, name: base } = splitRelPath(currentPath);
      const url = new URL('/api/videos/' + encodeURIComponent(base) + '/tags', window.location.origin);
      if (dir) url.searchParams.set('directory', dir);
      const body = { performers_remove: [name] };
      const r = await fetch(url.toString(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      notify('Removed performer', 'success');
      await loadVideoPerformers();
      try { if (window.performersManager) window.performersManager.refreshCountsSoon(); } catch(_) {}
    } catch(_) {
      notify('Failed to remove performer', 'error');
    }
  }

  async function refreshPerformerSuggestions(force = false) {
    try {
      if (!perfSuggestionsEl) return;
      if (!force && perfSuggestionsCache) return; // already loaded
      const url = new URL('/api/registry/performers', window.location.origin);
      const r = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const items = (j?.data?.performers) || [];
      perfSuggestionsCache = items;
      // Populate datalist
      perfSuggestionsEl.innerHTML = '';
      for (const it of items) {
        const opt = document.createElement('option');
        opt.value = it.name || it.slug || '';
        perfSuggestionsEl.appendChild(opt);
      }
    } catch(_) { /* ignore */ }
  }

  async function ensurePerformerInRegistry(name) {
    try {
      const exists = Array.isArray(perfSuggestionsCache) && perfSuggestionsCache.some(p => (p.name||'').toLowerCase() === String(name).toLowerCase());
      if (exists) return;
      const url = new URL('/api/registry/performers/create', window.location.origin);
      await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      perfSuggestionsCache = null; // bust cache
      refreshPerformerSuggestions(true);
    } catch(_) {}
  }

  // Expose a tiny API for other modules
  function _refreshPerfSidebar() { loadVideoPerformers(); refreshPerformerSuggestions(); }
  function _currentRelPath() { return currentPath; }
  // Video Filter Controls
  let filterState = {
    brightness: 100,
    contrast: 100,
    gamma: 100,
    saturation: 100,
    hue: 0,
    warmth: 0,
    red: 100,
    green: 100,
    blue: 100,
    blur: 0,
    rotate: 0,
    scale: 100,
    aspect: 100
  };

  function initFilterControls() {
    // Get all filter control elements
    // TODO: @copilot DRY
    const filterControls = {
      brightness: { slider: qs('filterBrightness'), value: qs('filterBrightnessValue') },
      contrast: { slider: qs('filterContrast'), value: qs('filterContrastValue') },
      gamma: { slider: qs('filterGamma'), value: qs('filterGammaValue') },
      saturation: { slider: qs('filterSaturation'), value: qs('filterSaturationValue') },
      hue: { slider: qs('filterHue'), value: qs('filterHueValue') },
      warmth: { slider: qs('filterWarmth'), value: qs('filterWarmthValue') },
      red: { slider: qs('filterRed'), value: qs('filterRedValue') },
      green: { slider: qs('filterGreen'), value: qs('filterGreenValue') },
      blue: { slider: qs('filterBlue'), value: qs('filterBlueValue') },
      blur: { slider: qs('filterBlur'), value: qs('filterBlurValue') },
      rotate: { slider: qs('transformRotate'), value: qs('transformRotateValue') },
      scale: { slider: qs('transformScale'), value: qs('transformScaleValue') },
      aspect: { slider: qs('transformAspect'), value: qs('transformAspectValue') }
    };

    // Action buttons
    const btnRotateLeft = qs('btnRotateLeft');
    const btnRotateRight = qs('btnRotateRight');
    const btnResetFilters = qs('btnResetFilters');
    const btnResetTransforms = qs('btnResetTransforms');

    // Initialize sidebar tab switching
    initSidebarTabs();

    // Load saved filter state
    loadFilterState();

    // Wire up filter sliders
    Object.keys(filterControls).forEach(key => {
      const control = filterControls[key];
      if (!control.slider || !control.value) return;

      // Set initial values
      control.slider.value = filterState[key];
      updateValueDisplay(key, filterState[key]);

      // Wire slider events
      control.slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        filterState[key] = value;
        updateValueDisplay(key, value);
        applyFilters();
        saveFilterState();
      });
    });

    // Wire action buttons
    if (btnRotateLeft) {
        _refreshPerformerSuggestions: refreshPerformerSuggestions,
        _refreshPerfSidebar,
        _currentRelPath,
      btnRotateLeft.addEventListener('click', () => {
        filterState.rotate = (filterState.rotate - 90) % 360;
        if (filterState.rotate < 0) filterState.rotate += 360;
        filterControls.rotate.slider.value = filterState.rotate;
        updateValueDisplay('rotate', filterState.rotate);
        applyFilters();
        saveFilterState();
      });
    }

    if (btnRotateRight) {
      btnRotateRight.addEventListener('click', () => {
        filterState.rotate = (filterState.rotate + 90) % 360;
        filterControls.rotate.slider.value = filterState.rotate;
        updateValueDisplay('rotate', filterState.rotate);
        applyFilters();
        saveFilterState();
      });
    }

    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', () => {
        // Reset only filter values, not transforms
        const filterKeys = ['brightness', 'contrast', 'gamma', 'saturation', 'hue', 'warmth', 'red', 'green', 'blue', 'blur'];
        filterKeys.forEach(key => {
          const defaultValue = (key === 'hue' || key === 'warmth' || key === 'blur') ? 0 : 100;
          filterState[key] = defaultValue;
          if (filterControls[key].slider) {
            filterControls[key].slider.value = defaultValue;
            updateValueDisplay(key, defaultValue);
          }
        });
        applyFilters();
        saveFilterState();
      });
    }

    if (btnResetTransforms) {
      btnResetTransforms.addEventListener('click', () => {
        // Reset only transform values
        filterState.rotate = 0;
        filterState.scale = 100;
        filterState.aspect = 100;
        if (filterControls.rotate.slider) {
          filterControls.rotate.slider.value = 0;
          updateValueDisplay('rotate', 0);
        }
        if (filterControls.scale.slider) {
          filterControls.scale.slider.value = 100;
          updateValueDisplay('scale', 100);
        }
        if (filterControls.aspect.slider) {
          filterControls.aspect.slider.value = 100;
          updateValueDisplay('aspect', 100);
        }
        applyFilters();
        saveFilterState();
      });
    }

    // Apply current filter state
    applyFilters();
  }

  function initSidebarTabs() {
    // Prevent duplicate wiring if already initialized
    if (initSidebarTabs._wired) return;
    initSidebarTabs._wired = true;
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const sidebarTabContents = document.querySelectorAll('.sidebar-tab-content');

    // Defensive normalization: ensure only a single active content remains
    let activeContent = null;
    sidebarTabContents.forEach(content => {
      if (content.classList.contains('active') && !activeContent) {
        activeContent = content;
      } else if (content.classList.contains('active')) {
        content.classList.remove('active');
      }
      content.style.display = 'none';
    });
    if (!activeContent && sidebarTabContents.length) {
      activeContent = sidebarTabContents[0];
      activeContent.classList.add('active');
    }
    if (activeContent) activeContent.style.display = 'flex';
    // Sync tab button to active content
    if (activeContent) {
      const id = activeContent.id.replace(/Tab$/, '');
      sidebarTabs.forEach(tab => {
        if (tab.getAttribute('data-tab') === id) tab.classList.add('active'); else tab.classList.remove('active');
      });
    }

    sidebarTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        if (!targetTab) return;
        // Clear active state
        sidebarTabs.forEach(t => t.classList.remove('active'));
        sidebarTabContents.forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
        // Activate
        tab.classList.add('active');
        const targetContent = document.getElementById(targetTab + 'Tab');
        if (targetContent) { targetContent.classList.add('active'); targetContent.style.display = 'flex'; }
      }, { passive: true });
    });
  }

  // Early global delegation so tabs are clickable even before a video is opened
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', delegateSidebarTabs, { once: true });
  } else {
    delegateSidebarTabs();
  }

  function delegateSidebarTabs() {
    const sidebar = document.getElementById('playerSidebar');
    if (!sidebar || sidebar._delegated) return;
    sidebar._delegated = true;
    sidebar.addEventListener('click', (ev) => {
      const tabBtn = ev.target.closest('.sidebar-tab');
      if (!tabBtn) return;
      const targetTab = tabBtn.getAttribute('data-tab');
      if (!targetTab) return;
      const tabs = sidebar.querySelectorAll('.sidebar-tab');
      const contents = sidebar.querySelectorAll('.sidebar-tab-content');
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
      tabBtn.classList.add('active');
      const content = document.getElementById(targetTab + 'Tab');
      if (content) { content.classList.add('active'); content.style.display = 'flex'; }
    });
  }

  function updateValueDisplay(key, value) {
    const valueEl = qs(`${key.startsWith('transform') ? key : 'filter' + key.charAt(0).toUpperCase() + key.slice(1)}Value`);
    if (!valueEl) return;

    // Format value display based on type
    if (key === 'hue' || key === 'rotate') {
      valueEl.textContent = Math.round(value) + '°';
    } else if (key === 'blur') {
      valueEl.textContent = value.toFixed(1) + 'px';
    } else if (key === 'warmth') {
      valueEl.textContent = (value > 0 ? '+' : '') + Math.round(value);
    } else {
      valueEl.textContent = Math.round(value) + '%';
    }
  }

  function applyFilters() {
    if (!videoEl) return;

    // Build CSS filter string
    const filters = [];
    
    // Basic filters
    // TODO: @copilot DRY
    if (filterState.brightness !== 100) filters.push(`brightness(${filterState.brightness}%)`);
    if (filterState.contrast !== 100) filters.push(`contrast(${filterState.contrast}%)`);
    if (filterState.saturation !== 100) filters.push(`saturate(${filterState.saturation}%)`);
    if (filterState.hue !== 0) filters.push(`hue-rotate(${filterState.hue}deg)`);
    if (filterState.blur !== 0) filters.push(`blur(${filterState.blur}px)`);

    // Color channel adjustments (simulated with sepia and hue)
    if (filterState.warmth !== 0) {
      const warmthAmount = Math.abs(filterState.warmth) / 100;
      if (filterState.warmth > 0) {
        filters.push(`sepia(${warmthAmount * 0.3})`, `hue-rotate(${filterState.warmth * 0.5}deg)`);
      } else {
        filters.push(`hue-rotate(${filterState.warmth * 2}deg)`);
      }
    }

    // Gamma simulation using contrast and brightness combination
    if (filterState.gamma !== 100) {
      const gamma = filterState.gamma / 100;
      // Approximate gamma correction with CSS filters
      if (gamma < 1) {
        filters.push(`contrast(${100 + (100 - filterState.gamma) * 0.3}%)`);
      } else {
        filters.push(`contrast(${100 - (filterState.gamma - 100) * 0.2}%)`);
      }
    }

    // Apply filter string
    videoEl.style.filter = filters.join(' ');

    // Build CSS transform string
    const transforms = [];
    
    if (filterState.rotate !== 0) transforms.push(`rotate(${filterState.rotate}deg)`);
    if (filterState.scale !== 100) transforms.push(`scale(${filterState.scale / 100})`);
    if (filterState.aspect !== 100) {
      const aspectRatio = filterState.aspect / 100;
      transforms.push(`scaleX(${aspectRatio})`);
    }

    // Apply transform string
    videoEl.style.transform = transforms.join(' ');
  }

  function saveFilterState() {
    try {
      localStorage.setItem('playerFilters', JSON.stringify(filterState));
    } catch(_) {}
  }

  function loadFilterState() {
    try {
      const saved = localStorage.getItem('playerFilters');
      if (saved) {
        const parsed = JSON.parse(saved);
        filterState = { ...filterState, ...parsed };
      }
    } catch(_) {}
  }

  // TODO: @copilot DRY
  function resetAllFilters() {
    filterState = {
      brightness: 100,
      contrast: 100,
      gamma: 100,
      saturation: 100,
      hue: 0,
      warmth: 0,
      red: 100,
      green: 100,
      blue: 100,
      blur: 0,
      rotate: 0,
      scale: 100,
      aspect: 100
    };
    applyFilters();
    saveFilterState();
    // Update UI if controls are available
    initFilterControls();
  }

  // Public API
  return { open, detectAndUploadFacesBrowser, initFilterControls, resetAllFilters };
})();

window.Player = Player;

// Tasks System
class TasksManager {
  constructor() {
    this.jobs = new Map();
    this.coverage = {};
    this.orphanFiles = [];
    // Capabilities loaded from /config
    this.capabilities = {
      ffmpeg: true,
      ffprobe: true,
      subtitles_enabled: true,
      faces_enabled: true,
    };
    // Multi-select filters: default show queued and running, hide completed/failed
    this.activeFilters = new Set(['running', 'queued']);
    this._jobRows = new Map(); // id -> tr element for stable rendering
    this.init();
  }

  init() {
    this.initEventListeners();
    this.initJobEvents();
    this.startJobPolling();
    // Load backend capabilities and apply UI gating
    this.loadConfigAndApplyGates();
    this.loadCoverage();
    this.wireGenerateAll();
    // Initialize resizer for job queue container
    setTimeout(() => this.initJobQueueResizer(), 0);
    // Wire browser faces button (idempotent)
    setTimeout(() => this.wireBrowserFacesButton(), 0);
  }

  startJobPolling() {
    // Avoid duplicate timers
    if (this._pollTimer) return;
    const interval = 2000; // 2s cadence keeps UI responsive without spamming
    const tick = async () => {
      try {
        await this.refreshJobs();
        await this.loadCoverage();
      } catch(_) { /* quiet */ }
    };
    // Kick once immediately, then set interval
    tick();
    this._pollTimer = setInterval(tick, interval);
    // Clear timer when page becomes hidden for a while to save resources
    const visHandler = () => {
      if (document.visibilityState === 'hidden') {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
      } else if (!this._pollTimer) {
        this._pollTimer = setInterval(tick, interval);
        tick();
      }
    };
    document.addEventListener('visibilitychange', visHandler);
    this._visHandler = visHandler;
  }

  async loadConfigAndApplyGates() {
    try {
      const r = await fetch('/config', { 
        headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const data = j?.data || j || {};
        const deps = data.deps || {};
        const caps = data.capabilities || {};
        // Normalize booleans, fallback to /health-style top-level if present
        this.capabilities.ffmpeg = Boolean(deps.ffmpeg ?? data.ffmpeg ?? true);
        this.capabilities.ffprobe = Boolean(deps.ffprobe ?? data.ffprobe ?? true);
        this.capabilities.subtitles_enabled = Boolean(caps.subtitles_enabled ?? true);
        this.capabilities.faces_enabled = Boolean(caps.faces_enabled ?? true);
        // Expose for other modules (Player badge actions)
        try { window.__capabilities = { ...this.capabilities }; } catch(_) {}
      }
    } catch (_) {
      // Keep defaults if /config fails
    }
    this.applyCapabilityGates();
    // Re-evaluate and wire browser faces button when caps are known
    this.wireBrowserFacesButton();
    this.updateCapabilityBanner();
  }

  canRunOperation(op) {
    // Accept full op (e.g., "thumbnails-missing") or base (e.g., "thumbnails")
    const base = String(op || '').replace(/-(all|missing)$/,'');
    const caps = this.capabilities || {};
    const needsFfmpeg = new Set(['thumbnails', 'previews', 'sprites', 'scenes', 'heatmaps', 'phash']);
    if (needsFfmpeg.has(base)) return !!caps.ffmpeg;
    if (base === 'subtitles') return !!caps.subtitles_enabled;
    if (base === 'faces' || base === 'embed') return !!caps.faces_enabled;
    // metadata and others default to allowed
    return true;
  }

  applyCapabilityGates() {
    const caps = this.capabilities || {};
    const disableIf = (selector, disable, title) => {
      document.querySelectorAll(selector).forEach(btn => {
        if (!(btn instanceof HTMLElement)) return;
        btn.disabled = !!disable;
        if (title) btn.title = title;
      });
    };
    // FFmpeg-dependent
    const ffmpegMissing = !caps.ffmpeg;
    if (ffmpegMissing) {
      disableIf('[data-operation="thumbnails-missing"], [data-operation="thumbnails-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="previews-missing"], [data-operation="previews-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="sprites-missing"], [data-operation="sprites-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="scenes-missing"], [data-operation="scenes-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="heatmaps-missing"], [data-operation="heatmaps-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="phash-missing"], [data-operation="phash-all"]', true, 'Disabled: FFmpeg not detected');
      const prev = document.getElementById('previewHeatmapsBtn');
      if (prev) { prev.disabled = true; prev.title = 'Disabled: FFmpeg not detected'; }
      // Player badges
      ['badgeHeatmap', 'badgeScenes', 'badgeSprites', 'badgeHover', 'badgePhash'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = true; el.title = 'Disabled: FFmpeg not detected'; }
      });
    }
    // Subtitles
    if (!caps.subtitles_enabled) {
      disableIf('[data-operation="subtitles-missing"], [data-operation="subtitles-all"]', true, 'Disabled: no subtitles backend available');
      const el = document.getElementById('badgeSubtitles');
      if (el) { el.disabled = true; el.title = 'Disabled: no subtitles backend available'; }
    }
    // Faces/Embeddings
    if (!caps.faces_enabled) {
      disableIf('[data-operation="faces-missing"], [data-operation="faces-all"]', true, 'Disabled: face backends not available');
      disableIf('[data-operation="embed-missing"], [data-operation="embed-all"]', true, 'Disabled: face backends not available');
      const bf = document.getElementById('badgeFaces');
      if (bf) { bf.disabled = true; bf.title = 'Disabled: face backends not available'; }
    }
    // Browser-side faces button gating: requires FaceDetector OR a server path to compute embeddings may still work
    const fb = document.getElementById('facesBrowserBtn');
    if (fb) {
      const hasFD = ('FaceDetector' in window) && typeof window.FaceDetector === 'function';
      // We require either FaceDetector availability (client) AND at least one embedding path on server (ffmpeg or faces backend)
      const serverOk = !!caps.ffmpeg || !!caps.faces_enabled;
      fb.disabled = !(hasFD && serverOk);
      fb.title = fb.disabled ? (!hasFD ? 'Disabled: FaceDetector API not available in this browser' : 'Disabled: no server embedding path available') : 'Detect faces in your browser and upload';
    }
  }

  updateCapabilityBanner() {
    const caps = this.capabilities || {};
    const issues = [];
    if (!caps.ffmpeg) issues.push('FFmpeg not detected — thumbnails, previews, sprites, scenes, heatmaps, and pHash are disabled.');
    if (!caps.subtitles_enabled) issues.push('Subtitles backend unavailable — subtitles generation is disabled.');
    if (!caps.faces_enabled) issues.push('Face backends unavailable — face detection and embeddings are disabled.');
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
      banner.style.cssText = 'margin: 8px 0 12px; padding: 10px 12px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; background:#221b12; color:#f7d382;';
      container.insertBefore(banner, container.firstChild);
    }
    banner.innerHTML = '<strong>Tools notice:</strong> ' + issues.join(' ');
  }

  initJobEvents() {
    try {
      // Live job updates via SSE; fallback to polling remains enabled
      const es = new EventSource('/api/jobs/events');
      let lastUpdate = 0;
      const throttle = 400; // ms
      const doRefresh = () => {
        const now = Date.now();
        if (now - lastUpdate > throttle) {
          lastUpdate = now;
          this.refreshJobs();
          // Also refresh coverage so artifact tiles (e.g., metadata) advance in near-real-time
          this.loadCoverage();
        }
      };
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          // Update only for job lifecycle/progress events
          const evt = payload.event;
          if (!evt) return;
          if (["created", "queued", "started", "progress", "current", "finished", "result"].includes(evt)) {
            doRefresh();
          }
        } catch {}
      };
      // Some servers send named events; attach explicit listeners as well
      ["created", "queued", "started", "progress", "current", "finished", "result", "cancel"].forEach(type => {
        es.addEventListener(type, () => doRefresh());
      });
      es.onerror = () => {
        // Let polling handle updates if SSE drops
      };
      this._jobEventSource = es;
    } catch (err) {
      // Non-fatal: rely on polling only
    }
  }

  initEventListeners() {
    // Batch operation buttons
    document.querySelectorAll('[data-operation]').forEach(btn => {
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
    document.querySelectorAll('input[name="fileSelection"]').forEach(radio => {
      radio.addEventListener('change', () => this.updateSelectedFileCount());
    });

    // Listen for tab changes to update selected file count and load initial data
    window.addEventListener('tabchange', (e) => {
      if (e.detail.activeTab === 'tasks') {
        this.updateSelectedFileCount();
        // Load coverage and jobs when switching to tasks tab
        this.loadCoverage();
        this.refreshJobs();
      }
    });

    // Job stat filters
  const filterActive = document.getElementById('filterActive');
  const filterQueued = document.getElementById('filterQueued');
  const filterCompleted = document.getElementById('filterCompleted');
  const filterErrored = document.getElementById('filterErrored');
  const allFilters = [filterActive, filterQueued, filterCompleted, filterErrored];
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
      } else {
        this.activeFilters.add(which);
      }
      refreshCardStates();
      this.renderJobsTable();
    };
  // TODO @copilot: standardize names
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
          const r = await fetch('/api/tasks/jobs/clear-completed', { method: 'POST' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          this.showNotification(`Removed ${data?.data?.removed ?? 0} completed job(s)`, 'success');
          await this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to clear completed jobs', 'error');
        } finally {
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
          const res = await fetch('/api/tasks/jobs/cancel-queued', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('Queued jobs cancelled', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel queued jobs', 'error');
        } finally {
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
          const res = await fetch('/api/tasks/jobs/cancel-all', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('All pending and running jobs asked to cancel', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel all jobs', 'error');
        } finally {
          cancelAllBtn.classList.remove('btn-busy');
          cancelAllBtn.disabled = false;
        }
      });
    }
  }

  // Wire facesBrowserBtn to run browser detection on the currently open video
  wireBrowserFacesButton() {
    const btn = document.getElementById('facesBrowserBtn');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      try {
        // Switch to player tab if needed so the user can see progress and allow playback controls
        if (window.tabSystem && window.tabSystem.getActiveTab() !== 'player') window.tabSystem.switchToTab('player');
        // Delegate to Player module
        if (window.Player && typeof window.Player.detectAndUploadFacesBrowser === 'function') {
          await window.Player.detectAndUploadFacesBrowser();
        } else {
          this.showNotification('Player not ready for browser detection.', 'error');
        }
      } catch (e) {
        this.showNotification('Browser faces failed: ' + (e && e.message ? e.message : 'error'), 'error');
      }
    });
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
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pl = await r.json();
      const file = (pl?.data?.files || [])[0];
      if (!file || !file.path) {
        this.showNotification('No videos found in this folder to preview.', 'error');
        return;
      }
      const path = file.path;
      // Ensure heatmap exists; try a GET probe; if missing, trigger create and poll briefly
      const headUrl = new URL('/api/heatmaps/png', window.location.origin);
      headUrl.searchParams.set('path', path);
      let ok = false;
      for (let i=0; i<10; i++) { // ~10 quick tries
        const h = await fetch(headUrl.toString());
        if (h.ok) { ok = true; break; }
        // Trigger creation once at the beginning
        if (i === 0) {
          const createUrl = new URL('/api/heatmaps/create', window.location.origin);
          createUrl.searchParams.set('path', path);
          createUrl.searchParams.set('interval', String(parseFloat(document.getElementById('heatmapInterval')?.value || '5.0')));
          createUrl.searchParams.set('mode', document.getElementById('heatmapMode')?.value || 'both');
          createUrl.searchParams.set('png', 'true');
          try { await fetch(createUrl, { method: 'POST' }); } catch(_){ }
        }
        await new Promise(res => setTimeout(res, 300));
      }
      if (!ok) {
        this.showNotification('Heatmap PNG not ready yet.', 'error');
        return;
      }
      // Show modal
      const imgUrl = new URL('/api/heatmaps/png', window.location.origin);
      imgUrl.searchParams.set('path', path);
      imgModalImage.src = imgUrl.toString() + `&t=${Date.now()}`;
      imgModal.hidden = false;
    } catch (e) {
      this.showNotification('Failed to preview heatmap.', 'error');
    }
  }

  async handleBatchOperation(operation) {
    try {
      // Derive base operation and mode from the button's data-operation value
      let base = String(operation || '').trim();
      let mode = 'missing';
      if (base.endsWith('-missing')) {
        base = base.replace(/-missing$/, '');
        mode = 'missing';
      } else if (base.endsWith('-all')) {
        base = base.replace(/-all$/, '');
        mode = 'all';
      }

      // Capability gate
      if (!this.canRunOperation(base)) {
        const why = (base === 'subtitles') ? 'No subtitles backend available.'
                  : (base === 'faces' || base === 'embed') ? 'Face backends unavailable.'
                  : 'FFmpeg not detected.';
        this.showNotification(`Cannot start ${base} (${mode}). ${why}`, 'error');
        return;
      }

      // Scope: all vs selected files
      const selectedRadio = document.querySelector('input[name="fileSelection"]:checked');
      const fileSelection = selectedRadio ? selectedRadio.value : 'all';

      // Folder path (relative to root unless absolute provided)
      const val = (folderInput.value || '').trim();
      const rel = isAbsolutePath(val) ? '' : currentPath();

      // Collect params for this operation
      const params = this.getOperationParams(base) || {};
      // When recomputing all, explicitly request overwrite/force when applicable
      if (mode === 'all') {
        params.force = true;
        params.overwrite = true;
      }

      const payload = {
        operation: base,
        mode,
        fileSelection,
        params,
        path: rel
      };

      const response = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        this.showNotification(`Started ${base} (${mode}) for ${result.data.fileCount} files`, 'success');
        // Immediately refresh jobs and coverage
        this.refreshJobs();
        this.loadCoverage();
      } else {
        throw new Error(result.message || 'Operation failed');
      }
    } catch (error) {
      console.error('Batch operation failed:', error);
      this.showNotification(`Failed to start ${operation}: ${error.message}`, 'error');
    }
  }

  // Wire Generate All button: queue all missing artifacts in fast-first order
  wireGenerateAll() {
    const btn = document.getElementById('generateAllBtn');
    if (!btn) return;
    if (btn._wired) return; btn._wired = true;
    btn.addEventListener('click', async () => {
      const ops = [
        'metadata-missing',
        'phash-missing',
        'thumbnails-missing',
        'previews-missing',
        'sprites-missing',
        'heatmaps-missing',
        'scenes-missing',
        'faces-missing',
        'embed-missing',
        'subtitles-missing',
      ].filter(op => this.canRunOperation(op));
      if (ops.length === 0) {
        this.showNotification('No compatible operations available. Check the Tools notice above.', 'error');
        return;
      }
      btn.disabled = true;
      btn.classList.add('btn-busy');
      try {
        for (const op of ops) {
          await this.handleBatchOperation(op);
          await new Promise(r => setTimeout(r, 80));
        }
        this.showNotification('Queued all missing artifacts (fast-first).', 'success');
      } catch (e) {
        this.showNotification('Failed to queue one or more operations.', 'error');
      } finally {
        btn.classList.remove('btn-busy');
        btn.disabled = false;
      }
    });
  }

  resetCoverageDisplay(artifactType) {
    // Reset the display for a specific artifact type to show 0%
    const percentageEl = document.getElementById(`${artifactType}Coverage`);
    const fillEl = document.getElementById(`${artifactType}Fill`);
    
    if (percentageEl) {
      percentageEl.textContent = '0%';
    }
    
    if (fillEl) {
      fillEl.style.width = '0%';
    }
    
    // Update button visibility for 0% coverage
    const generateBtn = document.querySelector(`[data-operation="${artifactType}-missing"]`);
    const recomputeBtn = document.querySelector(`[data-operation="${artifactType}-all"]`);
    
    if (generateBtn) generateBtn.style.display = 'block';
    if (recomputeBtn) recomputeBtn.style.display = 'none';
  }

  getOperationParams(type) {
    const params = {};
    
    switch (type) {
      case 'thumbnails':
        params.offset = document.getElementById('thumbnailOffset')?.value || 10;
        break;
      case 'phash':
        params.frames = document.getElementById('phashFrames')?.value || 5;
        params.algorithm = document.getElementById('phashAlgo')?.value || 'ahash';
        break;
      case 'sprites':
        params.interval = document.getElementById('spriteInterval')?.value || 10;
        params.width = document.getElementById('spriteWidth')?.value || 320;
        params.cols = document.getElementById('spriteCols')?.value || 10;
        break;
      case 'previews':
        params.segments = document.getElementById('previewSegments')?.value || 9;
        params.duration = document.getElementById('previewDuration')?.value || 1.0;
        break;
      case 'heatmaps':
        params.interval = parseFloat(document.getElementById('heatmapInterval')?.value || '5.0');
        params.mode = document.getElementById('heatmapMode')?.value || 'both';
        // default to true PNG generation for better visual feedback
        params.png = true;
        break;
      case 'subtitles':
        params.model = document.getElementById('subtitleModel')?.value || 'small';
        {
          const langVal = (document.getElementById('subtitleLang')?.value || '').trim();
          params.language = langVal || 'auto';
        }
        // translate option not exposed in UI; default false
        params.translate = false;
        break;
      case 'scenes':
        params.threshold = parseFloat(document.getElementById('sceneThreshold')?.value || '0.4');
        params.limit = parseInt(document.getElementById('sceneLimit')?.value || '0', 10);
        break;
      case 'faces':
        params.interval = parseFloat(document.getElementById('faceInterval')?.value || '1.0');
        params.min_size_frac = parseFloat(document.getElementById('faceMinSize')?.value || '0.10');
        // Advanced tunables (parity with legacy FaceLab)
        params.backend = document.getElementById('faceBackend')?.value || 'auto';
        // Only some backends use these; harmless to pass through
        params.scale_factor = parseFloat(document.getElementById('faceScale')?.value || '1.1');
        params.min_neighbors = parseInt(document.getElementById('faceMinNeighbors')?.value || '5', 10);
        params.sim_thresh = parseFloat(document.getElementById('faceSimThresh')?.value || '0.9');
        break;
      case 'embed':
        params.interval = parseFloat(document.getElementById('embedInterval')?.value || '1.0');
        params.min_size_frac = parseFloat(document.getElementById('embedMinSize')?.value || '0.10');
        params.backend = document.getElementById('embedBackend')?.value || 'auto';
        params.sim_thresh = parseFloat(document.getElementById('embedSimThresh')?.value || '0.9');
        break;
    }
    
    return params;
  }

  async loadCoverage() {
    try {
      // Request coverage for the current folder (relative to root)
      const val = (folderInput.value || '').trim();
      const rel = isAbsolutePath(val) ? '' : currentPath();
      const url = new URL('/api/tasks/coverage', window.location.origin);
      if (rel) url.searchParams.set('path', rel);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.coverage = data.data.coverage;
        this.updateCoverageDisplay();
      }
    } catch (error) {
      // Quiet failure during polling
    }

  // Orphan data disabled (endpoint not available)
  // await this.loadOrphanData();
  }

  // --- Orphan files UI helpers (stubbed to avoid runtime errors) ---
  async loadOrphanData() { /* no-op: backend not available */ }

  async previewOrphans() {
    try {
      if (!Array.isArray(this.orphanFiles) || this.orphanFiles.length === 0) {
        this.showNotification('No orphan artifacts to preview.', 'error');
        return;
      }
      // Just show a summary count; detailed preview UI is out of scope here
      this.showNotification(`Found ${this.orphanFiles.length} orphan artifact(s).`, 'success');
    } catch(_) {}
  }

  async cleanupOrphans() {
    try {
      const r = await fetch('/api/tasks/orphans/cleanup', { method: 'POST' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const removed = j?.data?.removed ?? 0;
      this.showNotification(`Removed ${removed} orphan artifact(s).`, 'success');
  await this.loadOrphanData();
    } catch(_) {
      this.showNotification('Failed to clean up orphan artifacts.', 'error');
    }
  }

  updateCoverageDisplay() {
    const artifacts = ['metadata', 'thumbnails', 'sprites', 'previews', 'phash', 'scenes', 'heatmaps', 'subtitles', 'faces'];
    
    artifacts.forEach(artifact => {
      const data = this.coverage[artifact] || { processed: 0, missing: 0, total: 0 };
      const percentage = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
      
      // Update percentage
      const percentageEl = document.getElementById(`${artifact}Coverage`);
      if (percentageEl) {
        percentageEl.textContent = `${percentage}%`;
      }
      
      // Update progress bar
      const fillEl = document.getElementById(`${artifact}Fill`);
      if (fillEl) {
        fillEl.style.width = `${percentage}%`;
      }
      
      // Show only one button: Generate Missing OR Recompute All (when 100%)
      const generateBtn = document.querySelector(`[data-operation="${artifact}-missing"]`);
      const recomputeBtn = document.querySelector(`[data-operation="${artifact}-all"]`);
      
      if (percentage === 100) {
        // Show only recompute button at 100%
        if (generateBtn) generateBtn.style.display = 'none';
        if (recomputeBtn) recomputeBtn.style.display = 'block';
      } else {
        // Show only generate missing button when < 100%
        if (generateBtn) generateBtn.style.display = 'block';
        if (recomputeBtn) recomputeBtn.style.display = 'none';
      }
    });

    // Mirror faces coverage to embeddings UI (embeddings share faces.json presence)
    const facesData = this.coverage['faces'] || { processed: 0, total: 0 };
    const embedPct = facesData.total > 0 ? Math.round((facesData.processed / facesData.total) * 100) : 0;
    const embedPctEl = document.getElementById('embedCoverage');
    const embedFillEl = document.getElementById('embedFill');
    if (embedPctEl) embedPctEl.textContent = `${embedPct}%`;
    if (embedFillEl) embedFillEl.style.width = `${embedPct}%`;
    const embedGen = document.querySelector('[data-operation="embed-missing"]');
    const embedRe = document.querySelector('[data-operation="embed-all"]');
    if (embedPct === 100) {
      if (embedGen) embedGen.style.display = 'none';
      if (embedRe) embedRe.style.display = 'block';
    } else {
      if (embedGen) embedGen.style.display = 'block';
      if (embedRe) embedRe.style.display = 'none';
    }
  }

  async refreshJobs() {
    try {
      const response = await fetch('/api/tasks/jobs');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.updateJobsDisplay(data.data.jobs);
        this.updateJobStats(data.data.stats);
      }
    } catch (error) {
      // Quiet failure during polling
    }
  }

  updateJobsDisplay(jobs) {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    // Update internal job cache and keep existing rows when possible (reduce thrash)
    const now = Date.now();
    const ids = new Set();
    for (const job of jobs) {
      ids.add(job.id);
      this.jobs.set(job.id, job);
    }
    // Remove rows for jobs not present anymore
    for (const [id, tr] of Array.from(this._jobRows.entries())) {
      if (!ids.has(id)) {
        if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
        this._jobRows.delete(id);
        this.jobs.delete(id);
      }
    }
    // Render/update visible rows
    this.renderJobsTable();

    // Enable/disable Clear Completed based on whether any completed jobs exist
    const hasCompleted = jobs.some(j => this.normalizeStatus(j) === 'completed');
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn) clearBtn.style.display = hasCompleted ? '' : 'none';
    const failedEl = document.getElementById('failedJobsCount');
    if (failedEl) failedEl.textContent = jobs.filter(j => (j.status === 'failed')).length;
  }

  renderJobsTable() {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    const all = Array.from(this.jobs.values());
    // Filtering: when no filters selected, show none (not all)
    let visible = [];
    if (this.activeFilters && this.activeFilters.size > 0) {
      visible = all.filter(j => this.activeFilters.has(this.normalizeStatus(j)));
    }
    // Sort with explicit priority: running > queued > others, then by time desc
    const prio = (j) => {
      const s = this.normalizeStatus(j);
      if (s === 'running') return 2;
      if (s === 'queued') return 1;
      return 0;
    };
    visible.sort((a, b) => {
      const pb = prio(b);
      const pa = prio(a);
      if (pb !== pa) return pb - pa;
      // When equal priority, use the freshest meaningful timestamp
      const tb = (b.startTime || b.endedTime || b.createdTime || 0);
      const ta = (a.startTime || a.endedTime || a.createdTime || 0);
      return tb - ta;
    });
    // Build/update rows
    const seen = new Set();
    for (const job of visible) {
      seen.add(job.id);
      let tr = this._jobRows.get(job.id);
      if (!tr) {
        tr = this.createJobRow(job);
        this._jobRows.set(job.id, tr);
      } else {
        // Update existing row fields
        this.updateJobRow(tr, job);
      }
      // Always append in the current sorted order; this moves existing rows
      tbody.appendChild(tr);
    }
    // Hide rows that don't match filter
    for (const [id, tr] of this._jobRows.entries()) {
      if (!seen.has(id)) {
        tr.style.display = 'none';
      } else {
        tr.style.display = '';
      }
    }
    this.updateRunningVisuals();
    // Toggle action buttons based on current state
    const clearBtn = document.getElementById('clearCompletedBtn');
    const cancelQueuedBtn = document.getElementById('cancelQueuedBtn');
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (clearBtn) {
      const hasCompleted = Array.from(this.jobs.values()).some(j => this.normalizeStatus(j) === 'completed');
      clearBtn.style.display = hasCompleted ? 'inline-block' : 'none';
    }
    if (cancelQueuedBtn) {
      const hasQueued = Array.from(this.jobs.values()).some(j => (j.status || '') === 'queued');
      cancelQueuedBtn.style.display = hasQueued ? 'inline-block' : 'none';
      cancelQueuedBtn.onclick = async () => {
        try {
          const res = await fetch('/api/tasks/jobs/cancel-queued', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('Queued jobs cancelled', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel queued jobs', 'error');
        }
      };
    }
    if (cancelAllBtn) {
      const hasAny = Array.from(this.jobs.values()).some(j => (j.status || '') === 'queued' || (j.status || '') === 'running');
      cancelAllBtn.style.display = hasAny ? 'inline-block' : 'none';
      cancelAllBtn.onclick = async () => {
        try {
          const res = await fetch('/api/tasks/jobs/cancel-all', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('All pending and running jobs asked to cancel', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel all jobs', 'error');
        }
      };
    }
  }

  updateRunningVisuals(jobs) {
    // Add animated stripes to each running job's progress bar
    const rows = document.querySelectorAll('#jobTableBody tr');
    rows.forEach((tr, idx) => {
      const id = tr?.dataset?.jobId;
      const job = id ? this.jobs.get(id) : null;
      const status = job ? this.normalizeStatus(job) : '';
      const bar = tr.querySelector('.job-progress');
      if (bar) {
        bar.classList.toggle('running', status === 'running');
      }
    });
  }

  // Map server states directly; do not infer running from progress for queued
  normalizeStatus(job) {
    let s = (job.status || '').toLowerCase();
    if (s === 'done' || s === 'completed') return 'completed';
    if (s === 'running') return 'running';
    if (s === 'queued') return 'queued';
    if (s === 'failed' || s === 'error' || s === 'errored') return 'failed';
    if (s === 'canceled' || s === 'cancelled' || s === 'cancel_requested') return 'canceled';
    return s || 'unknown';
  }

  displayStatusLabel(status) {
    const map = {
      running: 'Active',
      queued: 'Queued',
      completed: 'Completed',
      failed: 'Errored',
      canceled: 'Canceled',
    };
    if (status in map) return map[status];
    // Fallback: capitalize unknown status keys
    if (typeof status === 'string' && status.length) {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
    return '';
  }

  initJobStats(stats) {
    const activeEl = document.getElementById('activeJobsCount');
    const queuedEl = document.getElementById('queuedJobsCount');
    const completedEl = document.getElementById('completedJobsCount');
    const failedEl = document.getElementById('failedJobsCount');
    
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (queuedEl) queuedEl.textContent = stats.queued || 0;
    if (completedEl) completedEl.textContent = stats.completedToday || 0;
    if (failedEl) failedEl.textContent = stats.failed || 0;
  }

  // Back-compat shim: refreshJobs() calls updateJobStats; route to initJobStats
  updateJobStats(stats) {
    this.initJobStats(stats || {});
  }

  // Back-compat shim: refreshJobs() calls updateJobStats; route to initJobStats
  updateJobStats(stats) {
    this.initJobStats(stats || {});
  }

  createJobRow(job) {
    const row = document.createElement('tr');
    row.dataset.jobId = job.id;
    row.innerHTML = `
      <td class="cell-time"></td>
      <td class="cell-task"></td>
      <td class="cell-file" title=""></td>
      <td class="cell-status"><span class="job-status"></span></td>
      <td class="cell-progress">
        <div class="job-progress"><div class="job-progress-fill"></div></div>
        <div class="cell-sub"><span class="pct"></span><span class="fname"></span></div>
      </td>
      <td class="cell-action"></td>
    `;
    this.updateJobRow(row, job);
    return row;
  }

  updateJobRow(row, job) {
  const tstamp = job.startTime || job.createdTime || 0;
  const startTime = tstamp ? new Date(tstamp * 1000).toLocaleTimeString() : 'N/A';
    const baseName = (p) => (p || '').split('/').filter(Boolean).pop() || '';
    const fileName = baseName(job.target) || baseName(job.file);
    row.querySelector('.cell-time').textContent = startTime;
    row.querySelector('.cell-task').textContent = job.task;
    const fileCell = row.querySelector('.cell-file');
    fileCell.textContent = fileName;
    fileCell.title = job.target || job.file || '';
    // Status
    let status = this.normalizeStatus(job);
    const statusEl = row.querySelector('.job-status');
    statusEl.className = 'job-status ' + status;
    statusEl.textContent = this.displayStatusLabel(status);
    // Progress: prefer server-provided value; only fall back to raw counters when missing
    let pct = 0;
    const totalRaw = job.totalRaw;
    const processedRaw = job.processedRaw;
    if (typeof job.progress === 'number' && Number.isFinite(job.progress)) {
      pct = job.progress;
    }
    // If not completed and server didn't provide a value, derive from raw counters
    if (status !== 'completed' && status !== 'canceled' && (pct == null || pct <= 0)) {
      if (typeof totalRaw === 'number' && totalRaw > 0 && typeof processedRaw === 'number') {
        const calc = Math.max(0, Math.min(100, Math.floor((processedRaw / totalRaw) * 100)));
        if (calc > 0) pct = calc;
      }
    }
    // Queued shows 0%; completed always shows 100%
    if (status === 'queued') pct = 0;
    if (status === 'completed') pct = 100;
    const bar = row.querySelector('.job-progress-fill');
    // Canceled explicitly shows 0% and "Canceled"
    if (status === 'canceled') {
      bar.style.width = '0%';
    } else {
      bar.style.width = (status !== 'queued' ? pct : 0) + '%';
    }
    row.querySelector('.pct').textContent = (status === 'queued') ? 'Queued' : (status === 'completed' ? '100%' : (status === 'canceled' ? 'Canceled' : `${pct}%`));
    const fname = row.querySelector('.fname');
    // Show the target path when available for non-queued states
    const targetPath = (job && typeof job.target === 'string' && job.target) ? job.target : '';
    fname.textContent = (status === 'queued') ? '' : (targetPath || '');
    // Action
    const action = row.querySelector('.cell-action');
    action.innerHTML = '';
    if (status === 'running') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === 'queued') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === 'canceled') {
      // No actions for canceled
    } else if (status === 'failed') {
      // Click row to view error details
      const errText = (job && job.error) ? String(job.error) : '';
      if (errText) {
        row.style.cursor = 'pointer';
        row.title = 'Click to view error details';
        row.addEventListener('click', () => this.showErrorModal(errText, job), { once: true });
      }
    }
  }

  initJobQueueResizer() {
    const container = document.getElementById('jobTableContainer');
    const handle = document.getElementById('jobResizeHandle');
    if (!container || !handle) return;
    // Restore prior height
    const saved = localStorage.getItem('jobQueueHeight');
    if (saved) container.style.maxHeight = saved;
    let down = false, startY = 0, startH = 0;
    const onDown = (e) => {
      down = true; startY = e.clientY; startH = container.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
    };
    const onMove = (e) => {
      if (!down) return;
      const h = Math.max(140, Math.min(720, startH + (e.clientY - startY)));
      container.style.maxHeight = h + 'px';
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      localStorage.setItem('jobQueueHeight', container.style.maxHeight || '240px');
      document.body.style.userSelect = '';
    };
    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Wire facesBrowserBtn to run browser detection on the currently open video
  wireBrowserFacesButton() {
    const btn = document.getElementById('facesBrowserBtn');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      try {
        // Switch to player tab if needed so the user can see progress and allow playback controls
        if (window.tabSystem && window.tabSystem.getActiveTab() !== 'player') window.tabSystem.switchToTab('player');
        // Delegate to Player module
        if (window.Player && typeof window.Player.detectAndUploadFacesBrowser === 'function') {
          await window.Player.detectAndUploadFacesBrowser();
        } else {
          this.showNotification('Player not ready for browser detection.', 'error');
        }
      } catch (e) {
        this.showNotification('Browser faces failed: ' + (e && e.message ? e.message : 'error'), 'error');
      }
    });
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
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pl = await r.json();
      const file = (pl?.data?.files || [])[0];
      if (!file || !file.path) {
        this.showNotification('No videos found in this folder to preview.', 'error');
        return;
      }
      const path = file.path;
      // Ensure heatmap exists; try a GET probe; if missing, trigger create and poll briefly
      const headUrl = new URL('/api/heatmaps/png', window.location.origin);
      headUrl.searchParams.set('path', path);
      let ok = false;
      for (let i=0; i<10; i++) { // ~10 quick tries
        const h = await fetch(headUrl.toString());
        if (h.ok) { ok = true; break; }
        // Trigger creation once at the beginning
        if (i === 0) {
          const createUrl = new URL('/api/heatmaps/create', window.location.origin);
          createUrl.searchParams.set('path', path);
          createUrl.searchParams.set('interval', String(parseFloat(document.getElementById('heatmapInterval')?.value || '5.0')));
          createUrl.searchParams.set('mode', document.getElementById('heatmapMode')?.value || 'both');
          createUrl.searchParams.set('png', 'true');
          try { await fetch(createUrl, { method: 'POST' }); } catch(_){ }
        }
        await new Promise(res => setTimeout(res, 300));
      }
      if (!ok) {
        this.showNotification('Heatmap PNG not ready yet.', 'error');
        return;
      }
      // Show modal
      const imgUrl = new URL('/api/heatmaps/png', window.location.origin);
      imgUrl.searchParams.set('path', path);
      imgModalImage.src = imgUrl.toString() + `&t=${Date.now()}`;
      imgModal.hidden = false;
    } catch (e) {
      this.showNotification('Failed to preview heatmap.', 'error');
    }
  }

  async handleBatchOperation(operation) {
    try {
      // Derive base operation and mode from the button's data-operation value
      let base = String(operation || '').trim();
      let mode = 'missing';
      if (base.endsWith('-missing')) {
        base = base.replace(/-missing$/, '');
        mode = 'missing';
      } else if (base.endsWith('-all')) {
        base = base.replace(/-all$/, '');
        mode = 'all';
      }

      // Capability gate
      if (!this.canRunOperation(base)) {
        const why = (base === 'subtitles') ? 'No subtitles backend available.'
                  : (base === 'faces' || base === 'embed') ? 'Face backends unavailable.'
                  : 'FFmpeg not detected.';
        this.showNotification(`Cannot start ${base} (${mode}). ${why}`, 'error');
        return;
      }

      // Scope: all vs selected files
      const selectedRadio = document.querySelector('input[name="fileSelection"]:checked');
      const fileSelection = selectedRadio ? selectedRadio.value : 'all';

      // Folder path (relative to root unless absolute provided)
      const val = (folderInput.value || '').trim();
      const rel = isAbsolutePath(val) ? '' : currentPath();

      // Collect params for this operation
      const params = this.getOperationParams(base) || {};
      // When recomputing all, explicitly request overwrite/force when applicable
      if (mode === 'all') {
        params.force = true;
        params.overwrite = true;
      }

      const payload = {
        operation: base,
        mode,
        fileSelection,
        params,
        path: rel
      };

      const response = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        this.showNotification(`Started ${base} (${mode}) for ${result.data.fileCount} files`, 'success');
        // Immediately refresh jobs and coverage
        this.refreshJobs();
        this.loadCoverage();
      } else {
        throw new Error(result.message || 'Operation failed');
      }
    } catch (error) {
      console.error('Batch operation failed:', error);
      this.showNotification(`Failed to start ${operation}: ${error.message}`, 'error');
    }
  }

  // Wire Generate All button: queue all missing artifacts in fast-first order
  wireGenerateAll() {
    const btn = document.getElementById('generateAllBtn');
    if (!btn) return;
    if (btn._wired) return; btn._wired = true;
    btn.addEventListener('click', async () => {
      const ops = [
        'metadata-missing',
        'phash-missing',
        'thumbnails-missing',
        'previews-missing',
        'sprites-missing',
        'heatmaps-missing',
        'scenes-missing',
        'faces-missing',
        'embed-missing',
        'subtitles-missing',
      ].filter(op => this.canRunOperation(op));
      if (ops.length === 0) {
        this.showNotification('No compatible operations available. Check the Tools notice above.', 'error');
        return;
      }
      btn.disabled = true;
      btn.classList.add('btn-busy');
      try {
        for (const op of ops) {
          await this.handleBatchOperation(op);
          await new Promise(r => setTimeout(r, 80));
        }
        this.showNotification('Queued all missing artifacts (fast-first).', 'success');
      } catch (e) {
        this.showNotification('Failed to queue one or more operations.', 'error');
      } finally {
        btn.classList.remove('btn-busy');
        btn.disabled = false;
      }
    });
  }

  resetCoverageDisplay(artifactType) {
    // Reset the display for a specific artifact type to show 0%
    const percentageEl = document.getElementById(`${artifactType}Coverage`);
    const fillEl = document.getElementById(`${artifactType}Fill`);
    
    if (percentageEl) {
      percentageEl.textContent = '0%';
    }
    
    if (fillEl) {
      fillEl.style.width = '0%';
    }
    
    // Update button visibility for 0% coverage
    const generateBtn = document.querySelector(`[data-operation="${artifactType}-missing"]`);
    const recomputeBtn = document.querySelector(`[data-operation="${artifactType}-all"]`);
    
    if (generateBtn) generateBtn.style.display = 'block';
    if (recomputeBtn) recomputeBtn.style.display = 'none';
  }

  getOperationParams(type) {
    const params = {};
    
    switch (type) {
      case 'thumbnails':
        params.offset = document.getElementById('thumbnailOffset')?.value || 10;
        break;
      case 'phash':
        params.frames = document.getElementById('phashFrames')?.value || 5;
        params.algorithm = document.getElementById('phashAlgo')?.value || 'ahash';
        break;
      case 'sprites':
        params.interval = document.getElementById('spriteInterval')?.value || 10;
        params.width = document.getElementById('spriteWidth')?.value || 320;
        params.cols = document.getElementById('spriteCols')?.value || 10;
        break;
      case 'previews':
        params.segments = document.getElementById('previewSegments')?.value || 9;
        params.duration = document.getElementById('previewDuration')?.value || 1.0;
        break;
      case 'heatmaps':
        params.interval = parseFloat(document.getElementById('heatmapInterval')?.value || '5.0');
        params.mode = document.getElementById('heatmapMode')?.value || 'both';
        // default to true PNG generation for better visual feedback
        params.png = true;
        break;
      case 'subtitles':
        params.model = document.getElementById('subtitleModel')?.value || 'small';
        {
          const langVal = (document.getElementById('subtitleLang')?.value || '').trim();
          params.language = langVal || 'auto';
        }
        // translate option not exposed in UI; default false
        params.translate = false;
        break;
      case 'scenes':
        params.threshold = parseFloat(document.getElementById('sceneThreshold')?.value || '0.4');
        params.limit = parseInt(document.getElementById('sceneLimit')?.value || '0', 10);
        break;
      case 'faces':
        params.interval = parseFloat(document.getElementById('faceInterval')?.value || '1.0');
        params.min_size_frac = parseFloat(document.getElementById('faceMinSize')?.value || '0.10');
        // Advanced tunables (parity with legacy FaceLab)
        params.backend = document.getElementById('faceBackend')?.value || 'auto';
        // Only some backends use these; harmless to pass through
        params.scale_factor = parseFloat(document.getElementById('faceScale')?.value || '1.1');
        params.min_neighbors = parseInt(document.getElementById('faceMinNeighbors')?.value || '5', 10);
        params.sim_thresh = parseFloat(document.getElementById('faceSimThresh')?.value || '0.9');
        break;
      case 'embed':
        params.interval = parseFloat(document.getElementById('embedInterval')?.value || '1.0');
        params.min_size_frac = parseFloat(document.getElementById('embedMinSize')?.value || '0.10');
        params.backend = document.getElementById('embedBackend')?.value || 'auto';
        params.sim_thresh = parseFloat(document.getElementById('embedSimThresh')?.value || '0.9');
        break;
    }
    
    return params;
  }

  async loadCoverage() {
    try {
      // Request coverage for the current folder (relative to root)
      const val = (folderInput.value || '').trim();
      const rel = isAbsolutePath(val) ? '' : currentPath();
      const url = new URL('/api/tasks/coverage', window.location.origin);
      if (rel) url.searchParams.set('path', rel);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.coverage = data.data.coverage;
        this.updateCoverageDisplay();
      }
    } catch (error) {
      // Quiet failure during polling
    }

    // Load orphan data
    await this.loadOrphanData();
  }

  updateCoverageDisplay() {
    const artifacts = ['metadata', 'thumbnails', 'sprites', 'previews', 'phash', 'scenes', 'heatmaps', 'subtitles', 'faces'];
    
    artifacts.forEach(artifact => {
      const data = this.coverage[artifact] || { processed: 0, missing: 0, total: 0 };
      const percentage = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
      
      // Update percentage
      const percentageEl = document.getElementById(`${artifact}Coverage`);
      if (percentageEl) {
        percentageEl.textContent = `${percentage}%`;
      }
      
      // Update progress bar
      const fillEl = document.getElementById(`${artifact}Fill`);
      if (fillEl) {
        fillEl.style.width = `${percentage}%`;
      }
      
      // Show only one button: Generate Missing OR Recompute All (when 100%)
      const generateBtn = document.querySelector(`[data-operation="${artifact}-missing"]`);
      const recomputeBtn = document.querySelector(`[data-operation="${artifact}-all"]`);
      
      if (percentage === 100) {
        // Show only recompute button at 100%
        if (generateBtn) generateBtn.style.display = 'none';
        if (recomputeBtn) recomputeBtn.style.display = 'block';
      } else {
        // Show only generate missing button when < 100%
        if (generateBtn) generateBtn.style.display = 'block';
        if (recomputeBtn) recomputeBtn.style.display = 'none';
      }
    });

    // Mirror faces coverage to embeddings UI (embeddings share faces.json presence)
    const facesData = this.coverage['faces'] || { processed: 0, total: 0 };
    const embedPct = facesData.total > 0 ? Math.round((facesData.processed / facesData.total) * 100) : 0;
    const embedPctEl = document.getElementById('embedCoverage');
    const embedFillEl = document.getElementById('embedFill');
    if (embedPctEl) embedPctEl.textContent = `${embedPct}%`;
    if (embedFillEl) embedFillEl.style.width = `${embedPct}%`;
    const embedGen = document.querySelector('[data-operation="embed-missing"]');
    const embedRe = document.querySelector('[data-operation="embed-all"]');
    if (embedPct === 100) {
      if (embedGen) embedGen.style.display = 'none';
      if (embedRe) embedRe.style.display = 'block';
    } else {
      if (embedGen) embedGen.style.display = 'block';
      if (embedRe) embedRe.style.display = 'none';
    }
  }

  async refreshJobs() {
    try {
      const response = await fetch('/api/tasks/jobs');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.updateJobsDisplay(data.data.jobs);
        this.updateJobStats(data.data.stats);
      }
    } catch (error) {
      // Quiet failure during polling
    }
  }

  updateJobsDisplay(jobs) {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    // Update internal job cache and keep existing rows when possible (reduce thrash)
    const now = Date.now();
    const ids = new Set();
    for (const job of jobs) {
      ids.add(job.id);
      this.jobs.set(job.id, job);
    }
    // Remove rows for jobs not present anymore
    for (const [id, tr] of Array.from(this._jobRows.entries())) {
      if (!ids.has(id)) {
        if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
        this._jobRows.delete(id);
        this.jobs.delete(id);
      }
    }
    // Render/update visible rows
    this.renderJobsTable();

    // Enable/disable Clear Completed based on whether any completed jobs exist
    const hasCompleted = jobs.some(j => this.normalizeStatus(j) === 'completed');
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn) clearBtn.style.display = hasCompleted ? '' : 'none';
    const failedEl = document.getElementById('failedJobsCount');
    if (failedEl) failedEl.textContent = jobs.filter(j => (j.status === 'failed')).length;
  }

  renderJobsTable() {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    const all = Array.from(this.jobs.values());
    // Filtering
    let visible = all;
    if (this.activeFilters && this.activeFilters.size > 0) {
      visible = all.filter(j => this.activeFilters.has(this.normalizeStatus(j)));
    }
    // Sort with explicit priority: running > queued > others, then by time desc
    const prio = (j) => {
      const s = this.normalizeStatus(j);
      if (s === 'running') return 2;
      if (s === 'queued') return 1;
      return 0;
    };
    visible.sort((a, b) => {
      const pb = prio(b);
      const pa = prio(a);
      if (pb !== pa) return pb - pa;
      // When equal priority, use the freshest meaningful timestamp
      const tb = (b.startTime || b.endedTime || b.createdTime || 0);
      const ta = (a.startTime || a.endedTime || a.createdTime || 0);
      return tb - ta;
    });
    // Build/update rows
    const seen = new Set();
    for (const job of visible) {
      seen.add(job.id);
      let tr = this._jobRows.get(job.id);
      if (!tr) {
        tr = this.createJobRow(job);
        this._jobRows.set(job.id, tr);
      } else {
        // Update existing row fields
        this.updateJobRow(tr, job);
      }
      // Always append in the current sorted order; this moves existing rows
      tbody.appendChild(tr);
    }
    // Hide rows that don't match filter
    for (const [id, tr] of this._jobRows.entries()) {
      if (!seen.has(id)) {
        tr.style.display = 'none';
      } else {
        tr.style.display = '';
      }
    }
    this.updateRunningVisuals();
    // Toggle action buttons based on current state
    const clearBtn = document.getElementById('clearCompletedBtn');
    const cancelQueuedBtn = document.getElementById('cancelQueuedBtn');
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (clearBtn) {
      const hasCompleted = Array.from(this.jobs.values()).some(j => this.normalizeStatus(j) === 'completed');
      clearBtn.style.display = hasCompleted ? 'inline-block' : 'none';
    }
    if (cancelQueuedBtn) {
      const hasQueued = Array.from(this.jobs.values()).some(j => (j.status || '') === 'queued');
      cancelQueuedBtn.style.display = hasQueued ? 'inline-block' : 'none';
      cancelQueuedBtn.onclick = async () => {
        try {
          const res = await fetch('/api/tasks/jobs/cancel-queued', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('Queued jobs cancelled', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel queued jobs', 'error');
        }
      };
    }
    if (cancelAllBtn) {
      const hasAny = Array.from(this.jobs.values()).some(j => (j.status || '') === 'queued' || (j.status || '') === 'running');
      cancelAllBtn.style.display = hasAny ? 'inline-block' : 'none';
      cancelAllBtn.onclick = async () => {
        try {
          const res = await fetch('/api/tasks/jobs/cancel-all', { method: 'POST' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.showNotification('All pending and running jobs asked to cancel', 'success');
          this.refreshJobs();
        } catch (e) {
          this.showNotification('Failed to cancel all jobs', 'error');
        }
      };
    }
  }

  updateRunningVisuals(jobs) {
    // Add animated stripes to each running job's progress bar
    const rows = document.querySelectorAll('#jobTableBody tr');
    rows.forEach((tr, idx) => {
      const id = tr?.dataset?.jobId;
      const job = id ? this.jobs.get(id) : null;
      const status = job ? this.normalizeStatus(job) : '';
      const bar = tr.querySelector('.job-progress');
      if (bar) {
        bar.classList.toggle('running', status === 'running');
      }
    });
  }

  // Map server states directly; do not infer running from progress for queued
  normalizeStatus(job) {
    let s = (job.status || '').toLowerCase();
    if (s === 'done' || s === 'completed') return 'completed';
    if (s === 'running') return 'running';
    if (s === 'queued') return 'queued';
    if (s === 'failed' || s === 'error' || s === 'errored') return 'failed';
    if (s === 'canceled' || s === 'cancelled' || s === 'cancel_requested') return 'canceled';
    return s || 'unknown';
  }

  displayStatusLabel(status) {
    const map = {
      running: 'Active',
      queued: 'Queued',
      completed: 'Completed',
      failed: 'Errored',
      canceled: 'Canceled',
    };
    if (status in map) return map[status];
    // Fallback: capitalize unknown status keys
    if (typeof status === 'string' && status.length) {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
    return '';
  }

  initJobStats(stats) {
    const activeEl = document.getElementById('activeJobsCount');
    const queuedEl = document.getElementById('queuedJobsCount');
    const completedEl = document.getElementById('completedJobsCount');
    const failedEl = document.getElementById('failedJobsCount');
    
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (queuedEl) queuedEl.textContent = stats.queued || 0;
    if (completedEl) completedEl.textContent = stats.completedToday || 0;
    if (failedEl) failedEl.textContent = stats.failed || 0;
  }

  createJobRow(job) {
    const row = document.createElement('tr');
    row.dataset.jobId = job.id;
    row.innerHTML = `
      <td class="cell-time"></td>
      <td class="cell-task"></td>
      <td class="cell-file" title=""></td>
      <td class="cell-status"><span class="job-status"></span></td>
      <td class="cell-progress">
        <div class="job-progress"><div class="job-progress-fill"></div></div>
        <div class="cell-sub"><span class="pct"></span><span class="fname"></span></div>
      </td>
      <td class="cell-action"></td>
    `;
    this.updateJobRow(row, job);
    return row;
  }

  updateJobRow(row, job) {
  const tstamp = job.startTime || job.createdTime || 0;
  const startTime = tstamp ? new Date(tstamp * 1000).toLocaleTimeString() : 'N/A';
    const baseName = (p) => (p || '').split('/').filter(Boolean).pop() || '';
    const fileName = baseName(job.target) || baseName(job.file);
    row.querySelector('.cell-time').textContent = startTime;
    row.querySelector('.cell-task').textContent = job.task;
    const fileCell = row.querySelector('.cell-file');
    fileCell.textContent = fileName;
    fileCell.title = job.target || job.file || '';
    // Status
    let status = this.normalizeStatus(job);
    const statusEl = row.querySelector('.job-status');
    statusEl.className = 'job-status ' + status;
    statusEl.textContent = this.displayStatusLabel(status);
    // Progress: prefer server-provided value; only fall back to raw counters when missing
    let pct = 0;
    const totalRaw = job.totalRaw;
    const processedRaw = job.processedRaw;
    if (typeof job.progress === 'number' && Number.isFinite(job.progress)) {
      pct = job.progress;
    }
    // If not completed and server didn't provide a value, derive from raw counters
    if (status !== 'completed' && status !== 'canceled' && (pct == null || pct <= 0)) {
      if (typeof totalRaw === 'number' && totalRaw > 0 && typeof processedRaw === 'number') {
        const calc = Math.max(0, Math.min(100, Math.floor((processedRaw / totalRaw) * 100)));
        if (calc > 0) pct = calc;
      }
    }
    // Queued shows 0%; completed always shows 100%
    if (status === 'queued') pct = 0;
    if (status === 'completed') pct = 100;
    const bar = row.querySelector('.job-progress-fill');
    // Canceled explicitly shows 0% and "Canceled"
    if (status === 'canceled') {
      bar.style.width = '0%';
    } else {
      bar.style.width = (status !== 'queued' ? pct : 0) + '%';
    }
    row.querySelector('.pct').textContent = (status === 'queued') ? 'Queued' : (status === 'completed' ? '100%' : (status === 'canceled' ? 'Canceled' : `${pct}%`));
    const fname = row.querySelector('.fname');
    // Show the target path when available for non-queued states
    const targetPath = (job && typeof job.target === 'string' && job.target) ? job.target : '';
    fname.textContent = (status === 'queued') ? '' : (targetPath || '');
    // Action
    const action = row.querySelector('.cell-action');
    action.innerHTML = '';
    if (status === 'running') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === 'queued') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === 'canceled') {
      // No actions for canceled
    } else if (status === 'failed') {
      // Click row to view error details
      const errText = (job && job.error) ? String(job.error) : '';
      if (errText) {
        row.style.cursor = 'pointer';
        row.title = 'Click to view error details';
        row.addEventListener('click', () => this.showErrorModal(errText, job), { once: true });
      }
    }
  }

  initJobQueueResizer() {
    const container = document.getElementById('jobTableContainer');
    const handle = document.getElementById('jobResizeHandle');
    if (!container || !handle) return;
    // Restore prior height
    const saved = localStorage.getItem('jobQueueHeight');
    if (saved) container.style.maxHeight = saved;
    let down = false, startY = 0, startH = 0;
    const onDown = (e) => {
      down = true; startY = e.clientY; startH = container.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
    };
    const onMove = (e) => {
      if (!down) return;
      const h = Math.max(140, Math.min(720, startH + (e.clientY - startY)));
      container.style.maxHeight = h + 'px';
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      localStorage.setItem('jobQueueHeight', container.style.maxHeight || '240px');
      document.body.style.userSelect = '';
    };
    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ----- Compare Modal -----
  async showCompareModal(absA, absB) {
    try {
      const modal = document.getElementById('dupCompareModal');
      const closeBtn = document.getElementById('dupCompareClose');
      const aPathEl = document.getElementById('dupAPath');
      const bPathEl = document.getElementById('dupBPath');
      const aStatsEl = document.getElementById('dupAStats');
      const bStatsEl = document.getElementById('dupBStats');
      if (!modal || !aPathEl || !bPathEl || !aStatsEl || !bStatsEl) return;
      aPathEl.textContent = absA;
      bPathEl.textContent = absB;
      aStatsEl.textContent = 'Loading…';
      bStatsEl.textContent = 'Loading…';
      modal.hidden = false;
      const relA = this.toRel(absA);
      const relB = this.toRel(absB);
      const [ma, mb] = await Promise.all([
        this.fetchMetadata(relA),
        this.fetchMetadata(relB)
      ]);
      aStatsEl.textContent = this.formatMetadata(ma);
      bStatsEl.textContent = this.formatMetadata(mb);
      // Close wiring
      if (closeBtn && !closeBtn._wired) {
        closeBtn._wired = true;
        closeBtn.addEventListener('click', () => { modal.hidden = true; });
      }
      if (!modal._bgWired) {
        modal._bgWired = true;
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
        window.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
        });
      }
    } catch (e) {
      notify('Failed to load metadata for comparison.', 'error');
    }
  }

  async fetchMetadata(relPath) {
    try {
      const url = new URL('/api/metadata/get', window.location.origin);
      url.searchParams.set('path', relPath);
      url.searchParams.set('view', 'true');
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const data = j?.data || {};
      return data.raw || {};
    } catch(_) { return {}; }
  }

  formatMetadata(meta) {
    try {
      const lines = [];
      const safe = (v) => (v == null ? '' : String(v));
      const fmtSize = (n) => {
        const bytes = Number(n || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0; let v = bytes;
        while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
        return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
      };
      const fmtTimeLocal = (sec) => {
        const s = Number(sec || 0);
        if (!Number.isFinite(s) || s < 0) return '00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      };
      // Format-level info (expects ffprobe raw JSON)
      const fmt = meta.format || {};
      const duration = Number(fmt.duration || 0);
      const size = fmtSize(fmt.size);
      const container = safe(fmt.format_name || fmt.format_long_name);
      const overall_br = fmt.bit_rate ? `${Math.round(Number(fmt.bit_rate)/1000)} kb/s` : '';
      lines.push(`Container: ${container}`);
      lines.push(`Duration: ${fmtTimeLocal(duration)}`);
      if (size) lines.push(`File size: ${size}`);
      if (overall_br) lines.push(`Overall bitrate: ${overall_br}`);
      // Streams
      const video = (meta.streams || []).find(s => s.codec_type === 'video') || {};
      const audio = (meta.streams || []).find(s => s.codec_type === 'audio') || {};
      if (video && Object.keys(video).length) {
        const vcodec = [video.codec_name, video.profile].filter(Boolean).join(' ');
        const vres = (video.width && video.height) ? `${video.width}x${video.height}` : '';
        const vfps = (() => { try { const r = (video.r_frame_rate || video.avg_frame_rate || '').split('/'); return r.length===2 && Number(r[1]) ? (Number(r[0])/Number(r[1])).toFixed(3) + ' fps' : ''; } catch(_) { return ''; } })();
        const vbr = video.bit_rate ? `${Math.round(Number(video.bit_rate)/1000)} kb/s` : '';
        const pixfmt = safe(video.pix_fmt);
        const color = [video.color_range, video.color_space, video.color_transfer, video.color_primaries].filter(Boolean).join(', ');
        lines.push('');
        lines.push('Video:');
        lines.push(`  Codec: ${vcodec}`);
        if (vres) lines.push(`  Resolution: ${vres}`);
        if (vfps) lines.push(`  Framerate: ${vfps}`);
        if (vbr) lines.push(`  Bitrate: ${vbr}`);
        if (pixfmt) lines.push(`  Pixel format: ${pixfmt}`);
        if (color) lines.push(`  Color: ${color}`);
      }
      if (audio && Object.keys(audio).length) {
        const acodec = [audio.codec_name, audio.profile].filter(Boolean).join(' ');
        const ach = audio.channels ? `${audio.channels} ch` : '';
        const asr = audio.sample_rate ? `${Math.round(Number(audio.sample_rate)/1000)} kHz` : '';
        const abr = audio.bit_rate ? `${Math.round(Number(audio.bit_rate)/1000)} kb/s` : '';
        lines.push('');
        lines.push('Audio:');
        lines.push(`  Codec: ${acodec}`);
        const extra = [ach, asr, abr].filter(Boolean).join(', ');
        if (extra) lines.push(`  ${extra}`);
      }
      // Tags (title)
      try {
        const title = (fmt.tags || {}).title;
        if (title) { lines.push(''); lines.push(`Title tag: ${title}`); }
      } catch(_){}
      return lines.join('\n');
    } catch(_) {
      return 'No metadata available.';
    }
  }
}

// Initialize tasks manager when DOM is ready
let tasksManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    tasksManager = new TasksManager();
    try { window.tasksManager = tasksManager; } catch(_) {}
  });
} else {
  // Script likely loaded with defer, DOM is ready; safe to init now
  tasksManager = new TasksManager();
  try { window.tasksManager = tasksManager; } catch(_) {}
  const previewBtn = document.getElementById('previewOrphansBtn');
  const cleanupBtn = document.getElementById('cleanupOrphansBtn');
  const previewHeatmapsBtn = document.getElementById('previewHeatmapsBtn');

  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      if (tasksManager) {
        tasksManager.previewOrphans();
      }
    });
  }

  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', () => {
      if (tasksManager) {
        tasksManager.cleanupOrphans();
      }
    });
  }
  if (previewHeatmapsBtn) {
    previewHeatmapsBtn.addEventListener('click', () => {
      if (tasksManager) tasksManager.previewHeatmapSample();
    });
  }
}

// -----------------------------
// Duplicates Manager
// -----------------------------
class DuplicatesManager {
  constructor() {
    this.page = 1;
    this.totalPages = 1;
    this.totalPairs = 0;
    this.pageSize = 50;
    this.lastQuery = null; // persist last params for pagination
    this.init();
  }

  init() {
    // Wire controls
    const dir = document.getElementById('dupDirInput');
    const rec = document.getElementById('dupRecursive');
    const thr = document.getElementById('dupThreshold');
    const thrVal = document.getElementById('dupThresholdVal');
    const ms = document.getElementById('dupMinSim');
    const msVal = document.getElementById('dupMinSimVal');
    const ps = document.getElementById('dupPageSize');
    const scan = document.getElementById('dupScanBtn');
    const prev = document.getElementById('dupPrevBtn');
    const next = document.getElementById('dupNextBtn');
    const gen = document.getElementById('dupGenPhashBtn');

    if (thr) thr.addEventListener('input', () => { if (thrVal) thrVal.textContent = Number(thr.value).toFixed(2); });
    if (ms) ms.addEventListener('input', () => { if (msVal) msVal.textContent = Number(ms.value).toFixed(2); });
    if (ps) ps.addEventListener('change', () => {
      this.pageSize = Math.max(1, parseInt(ps.value || '50', 10));
      this.page = 1;
      this.runScan();
    });
    if (scan) scan.addEventListener('click', () => { this.page = 1; this.runScan(); });
    if (prev) prev.addEventListener('click', () => { if (this.page > 1) { this.page--; this.runScan(true); } });
    if (next) next.addEventListener('click', () => { if (this.page < this.totalPages) { this.page++; this.runScan(true); } });
    if (gen) gen.addEventListener('click', () => this.generateMissingPhash());

    // Default directory to current folder input (relative) if any
    try {
      const rel = isAbsolutePath(folderInput.value || '') ? '' : currentPath();
      if (dir && rel) dir.value = rel;
    } catch(_) {}

    // Auto-run a scan when opening the tab
    window.addEventListener('tabchange', (e) => {
      if (e.detail.activeTab === 'duplicates') {
        if (!this.lastQuery) this.runScan();
      }
    });
  }

  buildQuery() {
    const dir = document.getElementById('dupDirInput');
    const rec = document.getElementById('dupRecursive');
    const thr = document.getElementById('dupThreshold');
    const ms = document.getElementById('dupMinSim');
    const ps = document.getElementById('dupPageSize');
    const directory = (dir && dir.value || '').trim() || '.';
    const recursive = !!(rec && rec.checked);
    const phash_threshold = Number(thr && thr.value ? thr.value : 0.9);
    const min_similarity = Number(ms && ms.value ? ms.value : 0.0);
    const page_size = Math.max(1, parseInt(ps && ps.value ? ps.value : '50', 10));
    this.pageSize = page_size;
    return { directory, recursive, phash_threshold, min_similarity, page: this.page, page_size };
  }

  async runScan(keepParams = false) {
    try {
      const status = document.getElementById('dupStatus');
      const body = document.getElementById('dupTableBody');
      const info = document.getElementById('dupPageInfo');
      const countEl = document.getElementById('dupPairsCount');
      if (body) body.innerHTML = '';
      if (status) status.textContent = 'Scanning...';
      const q = this.buildQuery();
      if (!keepParams) this.lastQuery = { ...q };
      const url = new URL('/api/duplicates/list', window.location.origin);
      Object.entries(q).forEach(([k,v]) => url.searchParams.set(k, String(v)));
      const r = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const data = j?.data || j || {};
      this.totalPairs = Number(data.total_pairs || 0);
      this.totalPages = Number(data.total_pages || 1);
      this.page = Number(data.page || 1);
      if (countEl) countEl.textContent = String(this.totalPairs);
      if (info) info.textContent = `${this.page} / ${this.totalPages}`;
      const list = Array.isArray(data.pairs) ? data.pairs : [];
      for (const p of list) this.appendRow(p);
      if (status) status.textContent = list.length ? '' : 'No pairs on this page.';
    } catch (e) {
      const status = document.getElementById('dupStatus');
      if (status) status.textContent = 'Failed to scan.';
    }
  }

  appendRow(pair) {
    const body = document.getElementById('dupTableBody');
    if (!body) return;
    const tr = document.createElement('tr');
    const sim = Number(pair.similarity || 0);
    const fmtSim = (sim * 100).toFixed(1) + '%';
    const a = String(pair.a || '');
    const b = String(pair.b || '');
    tr.innerHTML = `
      <td>${fmtSim}</td>
      <td title="${a}">${this.baseName(a)}</td>
      <td title="${b}">${this.baseName(b)}</td>
      <td class="cell-action"></td>
    `;
    // Click row to open compare modal
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      // Ignore clicks on buttons inside the row
      if (e.target && (e.target.closest('.cell-action') || e.target.tagName === 'BUTTON')) return;
      this.showCompareModal(a, b, sim);
    });
    const actions = tr.querySelector('.cell-action');
    if (actions) {
      const openA = this.makeBtn('Open A', () => Player.open(this.toRel(a)));
      const openB = this.makeBtn('Open B', () => Player.open(this.toRel(b)));
      const revealA = this.makeBtn('Reveal A', () => this.revealInFinder(a));
      const revealB = this.makeBtn('Reveal B', () => this.revealInFinder(b));
      actions.append(openA, openB, revealA, revealB);
    }
    body.appendChild(tr);
  }

  baseName(p) {
    const parts = String(p).split('/').filter(Boolean);
    return parts[parts.length - 1] || p;
  }

  toRel(abs) {
    // Convert absolute path to relative path under current root for Player.open
    try {
      const rootText = document.getElementById('folderInput')?.placeholder || '';
      const m = /Root: (.*) \u2014/.exec(rootText) || /Root: (.*) —/.exec(rootText);
      const root = m ? m[1] : '';
      if (root && abs.startsWith(root)) return abs.slice(root.length + (abs[root.length] === '/' ? 1 : 0));
    } catch(_) {}
    // Fallback: return filename, which Player.open can’t resolve cross-folder; still useful in UI
    return this.baseName(abs);
  }

  makeBtn(label, handler) {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.textContent = label;
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handler(); });
    return btn;
  }

  async generateMissingPhash() {
    try {
      const dir = document.getElementById('dupDirInput');
      const rec = document.getElementById('dupRecursive');
      const directory = (dir && dir.value || '').trim();
      const recursive = !!(rec && rec.checked);
      // We’ll walk the list endpoint and trigger pHash where missing
      const url = new URL('/api/phash/list', window.location.origin);
      if (directory) url.searchParams.set('path', directory);
      url.searchParams.set('recursive', String(recursive));
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      // j.data only has totals; fetch library to iterate files
      const lib = new URL('/api/library', window.location.origin);
      if (directory) lib.searchParams.set('path', directory);
      lib.searchParams.set('page', '1');
      lib.searchParams.set('page_size', '1000');
      lib.searchParams.set('sort', 'name');
      lib.searchParams.set('order', 'asc');
      const lr = await fetch(lib.toString(), { headers: { 'Accept': 'application/json' }});
      const lj = await lr.json();
      const files = Array.isArray(lj?.data?.files) ? lj.data.files : [];
      let started = 0;
      for (const f of files) {
        try {
          const head = await fetch('/api/phash/get?path=' + encodeURIComponent(f.path));
          if (head.ok) continue; // already have
        } catch(_) {}
        try {
          const create = new URL('/api/phash/create', window.location.origin);
          create.searchParams.set('path', f.path);
          // use fast defaults
          create.searchParams.set('frames', '5');
          create.searchParams.set('algo', 'ahash');
          create.searchParams.set('combine', 'xor');
          await fetch(create.toString(), { method: 'POST' });
          started++;
          await new Promise(r => setTimeout(r, 50));
        } catch(_) {}
      }
      notify(`Started pHash for ${started} file(s).`, 'success');
    } catch (e) {
      notify('Failed to start pHash generation.', 'error');
    }
  }

  async revealInFinder(absPath) {
    try {
      // Add a simple handler server-side would be ideal; for now, provide path copy
      await navigator.clipboard.writeText(absPath);
      notify('Path copied to clipboard. Reveal in Finder manually.', 'info');
    } catch(_) {
      notify('Copied path to clipboard.', 'info');
    }
  }

  // ----- Compare Modal -----
  async showCompareModal(absA, absB, similarity = null) {
    try {
      const modal = document.getElementById('dupCompareModal');
      const closeBtn = document.getElementById('dupCompareClose');
      const aPathEl = document.getElementById('dupAPath');
      const bPathEl = document.getElementById('dupBPath');
      const simEl = document.getElementById('dupSimVal');
      const tableBody = document.getElementById('dupCompareTable');
      const btnOpenA = document.getElementById('dupOpenA');
      const btnOpenB = document.getElementById('dupOpenB');
      const btnRevealA = document.getElementById('dupRevealA');
      const btnRevealB = document.getElementById('dupRevealB');
      const btnDeleteA = document.getElementById('dupDeleteA');
      const btnDeleteB = document.getElementById('dupDeleteB');
      if (!modal || !aPathEl || !bPathEl || !tableBody) return;
      aPathEl.textContent = absA;
      bPathEl.textContent = absB;
      if (simEl) simEl.textContent = (similarity != null) ? `Similarity: ${(similarity*100).toFixed(1)}%` : '';
      tableBody.innerHTML = `<tr><td colspan="3" class="muted">Loading…</td></tr>`;
      modal.hidden = false;
      const relA = this.toRel(absA);
      const relB = this.toRel(absB);
      const [ma, mb] = await Promise.all([
        this.fetchMetadata(relA),
        this.fetchMetadata(relB)
      ]);
      // Build compare rows
      const rows = this.buildCompareRows(ma, mb);
      tableBody.innerHTML = '';
      for (const [label, valA, valB] of rows) {
        const tr = document.createElement('tr');
        const td0 = document.createElement('td'); td0.textContent = label; tr.appendChild(td0);
        const td1 = document.createElement('td'); td1.textContent = valA; tr.appendChild(td1);
        const td2 = document.createElement('td'); td2.textContent = valB; tr.appendChild(td2);
        tableBody.appendChild(tr);
      }
      // Wire actions
      const relPathA = this.toRel(absA);
      const relPathB = this.toRel(absB);
      if (btnOpenA && !btnOpenA._wired) { btnOpenA._wired = true; btnOpenA.addEventListener('click', (e)=>{ e.stopPropagation(); Player.open(relPathA); }); }
      if (btnOpenB && !btnOpenB._wired) { btnOpenB._wired = true; btnOpenB.addEventListener('click', (e)=>{ e.stopPropagation(); Player.open(relPathB); }); }
      if (btnRevealA && !btnRevealA._wired) { btnRevealA._wired = true; btnRevealA.addEventListener('click', (e)=>{ e.stopPropagation(); this.revealInFinder(absA); }); }
      if (btnRevealB && !btnRevealB._wired) { btnRevealB._wired = true; btnRevealB.addEventListener('click', (e)=>{ e.stopPropagation(); this.revealInFinder(absB); }); }
      if (btnDeleteA && !btnDeleteA._wired) { btnDeleteA._wired = true; btnDeleteA.addEventListener('click', async (e)=>{ e.stopPropagation(); await this.deleteMedia(relPathA, 'A'); }); }
      if (btnDeleteB && !btnDeleteB._wired) { btnDeleteB._wired = true; btnDeleteB.addEventListener('click', async (e)=>{ e.stopPropagation(); await this.deleteMedia(relPathB, 'B'); }); }
      // Close wiring
      if (closeBtn && !closeBtn._wired) {
        closeBtn._wired = true;
        closeBtn.addEventListener('click', () => { modal.hidden = true; });
      }
      if (!modal._bgWired) {
        modal._bgWired = true;
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
      }
    } catch (e) {
      notify('Failed to load metadata for comparison.', 'error');
    }
  }

  async fetchMetadata(relPath) {
    try {
      const url = new URL('/api/metadata/get', window.location.origin);
      url.searchParams.set('path', relPath);
      url.searchParams.set('view', 'true');
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const data = j?.data || {};
      return data.raw || {};
    } catch(_) { return {}; }
  }

  formatMetadata(meta) {
    try {
      const lines = [];
      const safe = (v) => (v == null ? '' : String(v));
      const fmtSize = (n) => {
        const bytes = Number(n || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0; let v = bytes;
        while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
        return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
      };
      const fmtTimeLocal = (sec) => {
        const s = Number(sec || 0);
        if (!Number.isFinite(s) || s < 0) return '00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      };
      // Format-level info (expects ffprobe raw JSON)
      const fmt = meta.format || {};
      const duration = Number(fmt.duration || 0);
      const size = fmtSize(fmt.size);
      const container = safe(fmt.format_name || fmt.format_long_name);
      const overall_br = fmt.bit_rate ? `${Math.round(Number(fmt.bit_rate)/1000)} kb/s` : '';
      lines.push(`Container: ${container}`);
      lines.push(`Duration: ${fmtTimeLocal(duration)}`);
      if (size) lines.push(`File size: ${size}`);
      if (overall_br) lines.push(`Overall bitrate: ${overall_br}`);
      // Streams
      const video = (meta.streams || []).find(s => s.codec_type === 'video') || {};
      const audio = (meta.streams || []).find(s => s.codec_type === 'audio') || {};
      if (video && Object.keys(video).length) {
        const vcodec = [video.codec_name, video.profile].filter(Boolean).join(' ');
        const vres = (video.width && video.height) ? `${video.width}x${video.height}` : '';
        const vfps = (() => { try { const r = (video.r_frame_rate || video.avg_frame_rate || '').split('/'); return r.length===2 && Number(r[1]) ? (Number(r[0])/Number(r[1])).toFixed(3) + ' fps' : ''; } catch(_) { return ''; } })();
        const vbr = video.bit_rate ? `${Math.round(Number(video.bit_rate)/1000)} kb/s` : '';
        const pixfmt = safe(video.pix_fmt);
        const color = [video.color_range, video.color_space, video.color_transfer, video.color_primaries].filter(Boolean).join(', ');
        lines.push('');
        lines.push('Video:');
        lines.push(`  Codec: ${vcodec}`);
        if (vres) lines.push(`  Resolution: ${vres}`);
        if (vfps) lines.push(`  Framerate: ${vfps}`);
        if (vbr) lines.push(`  Bitrate: ${vbr}`);
        if (pixfmt) lines.push(`  Pixel format: ${pixfmt}`);
        if (color) lines.push(`  Color: ${color}`);
      }
      if (audio && Object.keys(audio).length) {
        const acodec = [audio.codec_name, audio.profile].filter(Boolean).join(' ');
        const ach = audio.channels ? `${audio.channels} ch` : '';
        const asr = audio.sample_rate ? `${Math.round(Number(audio.sample_rate)/1000)} kHz` : '';
        const abr = audio.bit_rate ? `${Math.round(Number(audio.bit_rate)/1000)} kb/s` : '';
        lines.push('');
        lines.push('Audio:');
        lines.push(`  Codec: ${acodec}`);
        const extra = [ach, asr, abr].filter(Boolean).join(', ');
        if (extra) lines.push(`  ${extra}`);
      }
      // Tags (title)
      try {
        const title = (fmt.tags || {}).title;
        if (title) { lines.push(''); lines.push(`Title tag: ${title}`); }
      } catch(_){}
      return lines.join('\n');
    } catch(_) {
      return 'No metadata available.';
    }
  }

  buildCompareRows(ma, mb) {
    const pick = (m) => {
      const fmt = m?.format || {};
      const v = (m?.streams || []).find(s => s.codec_type === 'video') || {};
      const a = (m?.streams || []).find(s => s.codec_type === 'audio') || {};
      const dur = Number(fmt.duration || 0);
      const size = Number(fmt.size || 0);
      const vres = (v.width && v.height) ? `${v.width}x${v.height}` : '';
      const vf = (()=>{ try { const r=(v.r_frame_rate||v.avg_frame_rate||'').split('/'); return r.length===2 && Number(r[1]) ? (Number(r[0])/Number(r[1])).toFixed(3)+' fps' : ''; } catch(_) { return ''; } })();
      const vbr = v.bit_rate ? `${Math.round(Number(v.bit_rate)/1000)} kb/s` : '';
      const abr = a.bit_rate ? `${Math.round(Number(a.bit_rate)/1000)} kb/s` : '';
      const ac = [a.codec_name, a.profile].filter(Boolean).join(' ');
      const vc = [v.codec_name, v.profile].filter(Boolean).join(' ');
      return { dur, size, vres, vf, vbr, abr, ac, vc };
    };
    const A = pick(ma), B = pick(mb);
    const fmtBytes = (n)=>{
      const units=['B','KB','MB','GB','TB']; let i=0, x=Number(n)||0; while(x>=1024&&i<units.length-1){x/=1024;i++;}
      return (x>=100?x.toFixed(0):x>=10?x.toFixed(1):x.toFixed(2))+' '+units[i];
    };
    const fmtTime = (s)=>{ s=Number(s)||0; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=Math.floor(s%60); return (h? h+':' : '')+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'); };
    const rows = [];
    rows.push(['Filename', (ma?.format?.filename||'').split('/').pop()||'', (mb?.format?.filename||'').split('/').pop()||'']);
    rows.push(['File size', A.size? fmtBytes(A.size):'', B.size? fmtBytes(B.size):'']);
    rows.push(['Duration', A.dur? fmtTime(A.dur):'', B.dur? fmtTime(B.dur):'']);
    rows.push(['Video codec', A.vc||'', B.vc||'']);
    rows.push(['Resolution', A.vres||'', B.vres||'']);
    rows.push(['Framerate', A.vf||'', B.vf||'']);
    rows.push(['Video bitrate', A.vbr||'', B.vbr||'']);
    rows.push(['Audio codec', A.ac||'', B.ac||'']);
    rows.push(['Audio bitrate', A.abr||'', B.abr||'']);
    return rows;
  }

  async deleteMedia(relPath, which) {
    try {
      if (!relPath) return;
      if (!confirm(`Permanently delete file ${which}? This will also remove its artifacts.`)) return;
      const url = new URL('/api/media/delete', window.location.origin);
      url.searchParams.set('path', relPath);
      const r = await fetch(url.toString(), { method: 'DELETE' });
      if (!r.ok) {
        try { const j = await r.json(); notify(j?.message || 'Delete failed', 'error'); }
        catch(_) { notify('Delete failed', 'error'); }
        return;
      }
      notify(`Deleted ${which}.`, 'success');
      // Refresh list on current page
      await this.runScan(true);
      // Hide modal after delete to avoid stale view
      const modal = document.getElementById('dupCompareModal');
      if (modal) modal.hidden = true;
    } catch (e) {
      notify('Delete error', 'error');
    }
  }
}

// Initialize duplicates manager when DOM is ready
let duplicatesManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { duplicatesManager = new DuplicatesManager(); });
} else {
  duplicatesManager = new DuplicatesManager();
}

// -----------------------------
// Performers Manager (Top-level tab)
// -----------------------------
class PerformersManager {
  constructor() {
    this.items = [];
    this.counts = {}; // name -> usage count
    this.refreshTimer = null;
    this.importModalOpen = false;
    this.searchTerm = '';
  // Restore pagination (pageSize=0 means dynamic fill)
  const savedPageSize = parseInt(localStorage.getItem('perfPageSize')||'0', 10);
  const savedPage = parseInt(localStorage.getItem('perfPage')||'1', 10);
  this.pageSize = [0,50,100,250,500].includes(savedPageSize) ? savedPageSize : 0;
  this.page = savedPage > 0 ? savedPage : 1;
  this.totalPages = 1;
  this._allItems = [];
  this._resizeHandler = null;
    this.init();
  }

  init() {
    // Wire buttons
  const createBtn = document.getElementById('perfCreateBtn');
  const createName = document.getElementById('perfCreateName');
  const importBtn = document.getElementById('perfImportBtn');
  const importInput = document.getElementById('perfImportInput');
  const importReplace = document.getElementById('perfImportReplace');
  const refreshBtn = document.getElementById('perfRefreshBtn');
  const dropHint = document.getElementById('perfDropZoneHint');
  const openImportBtn = document.getElementById('perfOpenImportModal');
  const importModal = document.getElementById('perfImportModal');
  const importModalClose = document.getElementById('perfImportModalClose');
  const autoTagBtn = document.getElementById('perfAutoTagBtn');
  const prevPageBtn = document.getElementById('perfPrevPage');
  const nextPageBtn = document.getElementById('perfNextPage');
  const pageInfoEl = document.getElementById('perfPageInfo');
  const pageSizeSel = document.getElementById('perfPageSize');

    if (createBtn && !createBtn._wired) {
      createBtn._wired = true;
      createBtn.addEventListener('click', () => this._attemptAddPerformer());
    }

    if (createName && !createName._wired) {
      createName._wired = true;
      createName.addEventListener('input', () => {
        this.searchTerm = (createName.value || '').trim();
        this.page = 1; // reset to first page on new search
        this.renderTable();
        this._updateAddButtonVisibility();
      });
      createName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._attemptAddPerformer();
        }
      });
      createName.addEventListener('dblclick', () => this.openImportModal());
    }

    if (openImportBtn && !openImportBtn._wired) {
      openImportBtn._wired = true;
      openImportBtn.addEventListener('click', () => this.openImportModal());
    }

    if (importModalClose && !importModalClose._wired) {
      importModalClose._wired = true;
      importModalClose.addEventListener('click', () => this.closeImportModal());
    }

    if (importModal && !importModal._backdropWired) {
      importModal._backdropWired = true;
      importModal.addEventListener('click', (e) => { if (e.target === importModal) this.closeImportModal(); });
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.importModalOpen) this.closeImportModal(); });
    }

    if (importBtn && !importBtn._wired) {
      importBtn._wired = true;
      importBtn.addEventListener('click', async () => {
        const raw = (importInput && importInput.value || '').trim();
        const replace = !!(importReplace && importReplace.checked);
        if (!raw) return;
        try {
          // Try parse JSON first
          let payload = null;
          try {
            const j = JSON.parse(raw);
            // Accept array of strings or full registry shape
            if (Array.isArray(j)) {
              payload = { performers: { next_id: 1, performers: j.map(n => ({ name: String(n), slug: String(n).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') })) }, replace };
            } else if (j && typeof j === 'object') {
              if (Array.isArray(j.performers)) payload = { performers: { next_id: Number(j.next_id||1), performers: j.performers }, replace };
              else if (Array.isArray(j.tags) || j.tags) payload = { performers: j.performers ? j : { next_id: 1, performers: [] }, replace };
              else payload = { performers: j, replace };
            }
          } catch(_) {}
          if (!payload) {
            // Treat as line-separated
            const names = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            payload = { performers: { next_id: 1, performers: names.map(n => ({ name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') })) }, replace };
          }
          const r = await fetch('/api/registry/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          notify('Import complete', 'success');
          if (importInput) importInput.value = '';
          await this.loadAll();
          try { if (window.Player) Player._refreshPerformerSuggestions?.(true); } catch(_) {}
        } catch(_) { notify('Import failed', 'error'); }
      });
    }

    // Drag & drop (modal textarea)
    this.wireImportDragDrop();

    if (refreshBtn && !refreshBtn._wired) {
      refreshBtn._wired = true;
      refreshBtn.addEventListener('click', () => this.loadAll());
    }

    if (prevPageBtn && !prevPageBtn._wired) {
      prevPageBtn._wired = true;
      prevPageBtn.addEventListener('click', () => { if (this.page > 1) { this.page--; this.renderTable(); this._updatePageControls?.(); localStorage.setItem('perfPage', String(this.page)); } });
    }
    if (nextPageBtn && !nextPageBtn._wired) {
      nextPageBtn._wired = true;
      nextPageBtn.addEventListener('click', () => { if (this.page < this.totalPages) { this.page++; this.renderTable(); this._updatePageControls?.(); localStorage.setItem('perfPage', String(this.page)); } });
    }
    this._updatePageControls = () => {
      if (pageInfoEl) pageInfoEl.textContent = `${this.page} / ${this.totalPages}`;
      if (prevPageBtn) prevPageBtn.disabled = this.page <= 1;
      if (nextPageBtn) nextPageBtn.disabled = this.page >= this.totalPages;
      if (pageSizeSel) {
        if (!pageSizeSel._initSet) {
          pageSizeSel.value = String(this.pageSize);
          pageSizeSel._initSet = true;
        }
      }
    };

    if (pageSizeSel && !pageSizeSel._wired) {
      pageSizeSel._wired = true;
      pageSizeSel.addEventListener('change', () => {
        const v = parseInt(pageSizeSel.value, 10);
        if ([0,50,100,250,500].includes(v)) {
          this.pageSize = v;
          this.page = 1;
          localStorage.setItem('perfPageSize', String(v));
          this.renderTable();
          this._updatePageControls?.();
        }
      });
    }

    if (autoTagBtn && !autoTagBtn._wired) {
      autoTagBtn._wired = true;
      autoTagBtn.addEventListener('click', () => this.previewAutoTagPerformers(autoTagBtn));
    }

    // Auto-load when opening the tab
    window.addEventListener('tabchange', (e) => {
      if (e.detail.activeTab === 'performers') {
        if (!this.items || this.items.length === 0) this.loadAll();
      }
    });

    // Initial lazy load (don’t block app startup)
    setTimeout(() => this.loadAll(), 200);

    // Recompute dynamic pagination on resize (debounced)
    this._resizeHandler = () => {
      if (this.pageSize !== 0) return; // only for dynamic mode
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => { this.renderTable(); this._updatePageControls?.(); }, 120);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  async loadAll() {
    const grid = document.getElementById('perfGrid');
    grid?.classList.add('loading');
    try {
      const [allList, counts] = await Promise.all([
        this.fetchAllPerformers(),
        this.fetchCounts()
      ]);
      this._allItems = allList;
      this._recomputePagination();
      this.counts = counts;
      this.renderTable();
      this._updatePageControls?.();
    } catch(_) {
      this._allItems = [];
      this.items = [];
      this.counts = {};
      this.renderTable();
      this._updatePageControls?.();
    } finally {
      grid?.classList.remove('loading');
    }
    try { localStorage.setItem('perfPage', String(this.page)); } catch(_) {}
  }

  async fetchAllPerformers() {
    try {
      const url = new URL('/api/registry/performers', window.location.origin);
      url.searchParams.set('all', '1');
      const r = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return Array.isArray(j?.data?.performers) ? j.data.performers : [];
    } catch(_) { return []; }
  }

  _recomputePagination() {
    const total = this._allItems.length;
    let ps = this.pageSize;
    if (ps === 0) {
      const grid = document.getElementById('perfGrid');
      const w = (grid && grid.clientWidth) || window.innerWidth;
      const h = window.innerHeight;
      // Force at most 5 columns matching CSS definition
      const min = 200; // approximate width; actual column width flexes
      const gap = 24;
      let perRow = Math.max(1, Math.floor((w + gap) / (min + gap)));
      if (perRow > 5) perRow = 5; // cap to 5 columns
      // Estimate rows to fill viewport below top bar
      let topBarBottom = 0;
      try { const topBar = document.getElementById('perfTopBar'); if (topBar) { const r = topBar.getBoundingClientRect(); topBarBottom = r.bottom; } } catch(_) {}
      const availableH = Math.max(200, h - topBarBottom - 80);
      const cardH = 180 + gap; // updated approximate height with new padding
      const rows = Math.max(1, Math.floor(availableH / cardH));
      ps = perRow * rows;
    }
    this._currentPageSizeResolved = ps;
    this.totalPages = Math.max(1, Math.ceil(total / ps));
    if (this.page > this.totalPages) this.page = this.totalPages;
    const start = (this.page - 1) * ps;
    const end = start + ps;
    this.items = this._allItems.slice(start, end);
  }

  async fetchCounts() {
    try {
      // Always fetch counts recursively from root so performer usage reflects entire library
      const u = new URL('/api/tags/summary', window.location.origin);
      u.searchParams.set('recursive','true');
      const r = await fetch(u.toString(), { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const raw = j?.data?.performers || j?.performers || {};
      // Build a normalized lookup so name, lowercase name, and slug variants all resolve
      const norm = {};
      for (const [k,v] of Object.entries(raw)) {
        if (typeof v !== 'number') continue;
        norm[k] = v; // original
        const lower = k.toLowerCase();
        if (!(lower in norm)) norm[lower] = v;
        const slug = lower.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
        if (slug && !(slug in norm)) norm[slug] = v;
        const stripped = lower.replace(/[^a-z0-9]+/g,'');
        if (stripped && !(stripped in norm)) norm[stripped] = v;
      }
      return norm;
    } catch(_) { return {}; }
  }

  renderTable() { this.renderGrid(); }

  renderGrid() {
    const container = document.getElementById('perfGrid');
    if (!container) return;
    container.innerHTML = '';
    if (this._allItems.length) this._recomputePagination();
    let items = Array.isArray(this.items) ? [...this.items] : [];
    // Apply search filter (case-insensitive substring match)
    const term = (this.searchTerm || '').toLowerCase();
    if (term) {
      // Filter from full list then re-slice manually ignoring existing pagination items list
      const source = this._allItems.filter(it => (it.name||it.slug||'').toLowerCase().includes(term));
      // Recompute pagination boundaries on filtered set
      const ps = this._currentPageSizeResolved || 50;
      this.totalPages = Math.max(1, Math.ceil(source.length / ps));
      if (this.page > this.totalPages) this.page = this.totalPages;
      const start = (this.page - 1) * ps;
      const end = start + ps;
      items = source.slice(start, end);
    }
    // Sort by usage count desc, then name
    items.sort((a,b) => {
      const an = a.name || a.slug || '';
      const bn = b.name || b.slug || '';
      const ac = this._resolveCount(an);
      const bc = this._resolveCount(bn);
      if (bc !== ac) return bc - ac;
      return an.localeCompare(bn);
    });
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'muted text-12';
      empty.style.padding = '12px 4px';
      empty.textContent = term ? 'No performers match your search. Press Enter to add.' : 'No performers yet. Add one above or bulk import.';
      container.appendChild(empty);
      return;
    }
    for (const it of items) {
      const name = it.name || it.slug || '';
      const count = this._resolveCount(name);
      const card = document.createElement('div');
      card.className = 'perf-card';
      card.dataset.name = name;
      const title = document.createElement('div');
      title.className = 'perf-name';
      title.textContent = name;
  const usage = document.createElement('div');
  usage.className = 'perf-usage';
  usage.textContent = count === 1 ? '1 video' : `${count} videos`;
      const actions = document.createElement('div');
      actions.className = 'perf-actions';
      const mk = (label, cls, fn, title) => { const b=document.createElement('button'); b.className=cls; b.textContent=label; if(title) b.title=title; b.addEventListener('click',(e)=>{e.stopPropagation(); fn();}); return b; };
      const btnFilter = mk('Filter','btn-sm', () => this.filterLibraryByPerformer(name), 'Filter library by this performer');
      const btnRename = mk('Rename','btn-sm', async () => { const nn = prompt('New name for performer', name); if (nn && nn !== name) await this.renamePerformer(name, nn); }, 'Rename performer');
      const btnDelete = mk('Delete','btn-sm btn-danger', async () => { if (confirm('Delete performer from registry (does not remove from videos)?')) await this.deletePerformer(name); }, 'Delete performer');
      actions.append(btnFilter, btnRename, btnDelete);
      card.append(title, usage, actions);
      container.appendChild(card);
    }
  }

  _resolveCount(name) {
    if (!name) return 0;
    // Try exact, lowercase, and slug variants
    const exact = this.counts[name];
    if (typeof exact === 'number') return exact;
    const lower = name.toLowerCase();
    const lc = this.counts[lower];
    if (typeof lc === 'number') return lc;
    const slug = lower.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const sc = this.counts[slug];
    if (typeof sc === 'number') return sc;
    // Stripped variant (remove all non-alphanumerics)
    const stripped = lower.replace(/[^a-z0-9]+/g,'');
    const stc = this.counts[stripped];
    if (typeof stc === 'number') return stc;
    // Last resort: O(n) scan comparing stripped forms (only if counts small)
    const keys = Object.keys(this.counts);
    if (keys.length < 5000) {
      for (const k of keys) {
        if (k.replace(/[^a-z0-9]+/g,'') === stripped) {
          const v = this.counts[k];
            if (typeof v === 'number') return v;
        }
      }
    }
    return 0;
  }

  _updateAddButtonVisibility() {
    const createBtn = document.getElementById('perfCreateBtn');
    const createName = document.getElementById('perfCreateName');
    if (!createBtn || !createName) return;
    const name = (createName.value || '').trim();
    if (!name) { createBtn.hidden = true; return; }
    const exists = this._allItems.some(it => (it.name||it.slug||'').toLowerCase() === name.toLowerCase());
    createBtn.hidden = exists; // show only if new
  }

  async _attemptAddPerformer() {
    const createBtn = document.getElementById('perfCreateBtn');
    const createName = document.getElementById('perfCreateName');
    if (!createName) return;
    const name = (createName.value || '').trim();
    if (!name) return;
    const exists = this._allItems.some(it => (it.name||it.slug||'').toLowerCase() === name.toLowerCase());
    if (exists) return; // nothing to add; search only
    try {
      createBtn && (createBtn.disabled = true);
      await fetch('/api/registry/performers/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      notify('Performer added', 'success');
      createName.value = '';
      this.searchTerm = '';
      await this.loadAll();
      this._updateAddButtonVisibility();
      try { if (window.Player) Player._refreshPerformerSuggestions?.(true); } catch(_) {}
    } catch(_) {
      notify('Failed to add performer', 'error');
    } finally {
      createBtn && (createBtn.disabled = false);
    }
  }

  async previewAutoTagPerformers(buttonEl) {
    if (!buttonEl) return;
    try {
      buttonEl.disabled = true; buttonEl.classList.add('btn-busy');
      const dir = currentPath();
      const body = { path: dir || undefined, recursive: true, apply: false };
      const r = await fetch('/api/autotag/performers/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) {
        let detail = '';
        try {
          const ct = r.headers.get('Content-Type') || '';
          if (ct.includes('application/json')) {
            const jerr = await r.json();
            detail = jerr?.detail || JSON.stringify(jerr).slice(0,200);
          } else {
            detail = (await r.text()).slice(0,200);
          }
        } catch(_) {}
        throw new Error('HTTP ' + r.status + (detail ? ' - ' + detail : ''));
      }
      const j = await r.json();
      const matches = j?.data?.matches || [];
      if (!matches.length) { notify('No filename performer matches found.', 'info'); return; }
      const modalId = 'perfAutoTagPreviewModal';
      let modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.innerHTML = `\n<div class="panel maxw-900">\n  <header><h3>Performer Auto‑tag Preview</h3></header>\n  <div class="body" style="max-height:60vh; overflow:auto;">\n    <table class="table compact">\n      <thead><tr><th>File</th><th>Performers Found</th></tr></thead>\n      <tbody id="perfAutoTagPreviewBody"></tbody>\n    </table>\n    <p class="muted text-12" id="perfAutoTagSummary"></p>\n  </div>\n  <footer class="row gap-12 justify-between items-center">\n    <div id="perfAutoTagStats" class="muted text-12"></div>\n    <div class="row gap-8">\n      <button class="btn-sm" id="perfAutoTagCancel">Cancel</button>\n      <button class="btn-sm btn-primary" id="perfAutoTagApply">Apply Tags</button>\n    </div>\n  </footer>\n</div>`;
        document.body.appendChild(modal);
      }
      const tbody = modal.querySelector('#perfAutoTagPreviewBody');
      const summary = modal.querySelector('#perfAutoTagSummary');
      const statsEl = modal.querySelector('#perfAutoTagStats');
      if (tbody) {
        tbody.innerHTML = '';
        const MAX_DIRECT = 5000; // safety limit for huge lists before simple virtualization
        if (matches.length > MAX_DIRECT) {
          const note = document.createElement('tr');
          const td = document.createElement('td'); td.colSpan = 2; td.textContent = `Large result set (${matches.length}). Showing first ${MAX_DIRECT}.`; note.appendChild(td); tbody.appendChild(note);
          const frag = document.createDocumentFragment();
          for (const m of matches.slice(0, MAX_DIRECT)) {
            const tr = document.createElement('tr');
            const tdFile = document.createElement('td'); tdFile.textContent = m.file;
            const tdFound = document.createElement('td');
            const already = m.already_present || [];
            const wouldAdd = m.would_add || [];
            const addedList = (wouldAdd.length ? ` + ${wouldAdd.join(', ')}` : '');
            tdFound.innerHTML = `<span>${(already.concat(wouldAdd)).join(', ')}</span>${addedList ? `<span class="muted" style="margin-left:6px;">${addedList}</span>`:''}`;
            tr.append(tdFile, tdFound); frag.appendChild(tr);
          }
          tbody.appendChild(frag);
        } else {
          const frag = document.createDocumentFragment();
          for (const m of matches) {
            const tr = document.createElement('tr');
            const tdFile = document.createElement('td'); tdFile.textContent = m.file;
            const tdFound = document.createElement('td'); tdFound.textContent = (m.performers_found||[]).join(', ');
            tr.append(tdFile, tdFound); frag.appendChild(tr);
          }
          tbody.appendChild(frag);
        }
      }
      if (summary) summary.textContent = `${matches.length} file(s) have performer matches${matches.length>5000?' (showing first 5000)':''}.`;
      if (statsEl) {
        const mc = j?.data?.match_count || matches.length;
        const wu = j?.data?.would_update_files ?? 0;
        const ac = j?.data?.already_complete_files ?? 0;
        statsEl.textContent = `${mc} matches: ${wu} will update, ${ac} already complete`;
      }
      const cancelBtn = modal.querySelector('#perfAutoTagCancel');
      const applyBtn = modal.querySelector('#perfAutoTagApply');
      modal.hidden = false; modal.setAttribute('aria-hidden','false');
      const close = () => { modal.hidden = true; modal.setAttribute('aria-hidden','true'); };
      cancelBtn.onclick = () => close();
      applyBtn.onclick = async () => {
        applyBtn.disabled = true; applyBtn.textContent = 'Applying…';
        try {
          const r2 = await fetch('/api/autotag/performers/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: dir || undefined, recursive: true, apply: true }) });
          if (!r2.ok) {
            let detail = '';
            try {
              const ct = r2.headers.get('Content-Type') || '';
              if (ct.includes('application/json')) {
                const jerr = await r2.json();
                detail = jerr?.detail || JSON.stringify(jerr).slice(0,200);
              } else {
                detail = (await r2.text()).slice(0,200);
              }
            } catch(_) {}
            throw new Error('HTTP ' + r2.status + (detail ? ' - ' + detail : ''));
          }
          const j2 = await r2.json();
          const upd = j2?.data?.updated_files || 0;
          const mc2 = j2?.data?.match_count || 0;
          const wu2 = j2?.data?.would_update_files ?? upd;
          const ac2 = j2?.data?.already_complete_files ?? 0;
          notify(`Applied performer tags to ${upd} file(s).`, 'success');
          if (statsEl) statsEl.textContent = `${mc2} matches: ${wu2} would update (${upd} applied), ${ac2} already complete`;
          close();
        } catch(err) {
          notify('Apply failed' + (err && err.message ? ': ' + err.message : ''), 'error');
        } finally {
          applyBtn.disabled = false; applyBtn.textContent = 'Apply Tags';
          this.fetchCounts().then(c => { this.counts = c; this.renderTable(); });
        }
      };
    } catch(e) {
      console.error('Performer autotag preview error', e);
      notify('Preview failed' + (e && e.message ? ': ' + e.message : ''), 'error');
    } finally {
      buttonEl.classList.remove('btn-busy');
      buttonEl.disabled = false;
    }
  }

  openImportModal() {
    const modal = document.getElementById('perfImportModal');
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    this.importModalOpen = true;
    const ta = document.getElementById('perfImportInput');
    if (ta) setTimeout(()=> ta.focus(), 30);
  }

  closeImportModal() {
    const modal = document.getElementById('perfImportModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    this.importModalOpen = false;
  }

  wireImportDragDrop() {
    const importInput = document.getElementById('perfImportInput');
    const dropHint = document.getElementById('perfDropZoneHint');
    if (!importInput || importInput._dragWired) return;
    importInput._dragWired = true;
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover','dragleave','drop'].forEach(ev => importInput.addEventListener(ev, stop));
    importInput.addEventListener('dragenter', () => importInput.classList.add('drag-hover'));
    importInput.addEventListener('dragover', () => importInput.classList.add('drag-hover'));
    importInput.addEventListener('dragleave', (e) => { if (!importInput.contains(e.relatedTarget)) importInput.classList.remove('drag-hover'); });
    importInput.addEventListener('drop', async (e) => {
      importInput.classList.remove('drag-hover');
      try {
        const files = Array.from(e.dataTransfer.files || []);
        if (!files.length) return;
        const file = files[0];
        const nameLc = file.name.toLowerCase();
        if (!/\.(json|txt|text)$/.test(nameLc)) { notify('Unsupported file type (use .json or .txt)', 'error'); return; }
        const text = await file.text();
        if (!text.trim()) { notify('File is empty', 'error'); return; }
        let finalText = text;
        if (nameLc.endsWith('.json')) { try { finalText = JSON.stringify(JSON.parse(text), null, 2); } catch(_) {} }
        importInput.value = finalText;
        if (dropHint) dropHint.classList.add('hidden');
        notify('Loaded file: ' + file.name, 'success');
      } catch(_) { notify('Failed to read dropped file', 'error'); }
    });
  }

  async renamePerformer(oldName, newName) {
    try {
      const r = await fetch('/api/registry/performers/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: oldName, new_name: newName }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      notify('Renamed performer', 'success');
      await this.loadAll();
      try { Player._refreshPerformerSuggestions?.(true); } catch(_) {}
    } catch(_) { notify('Rename failed', 'error'); }
  }

  async deletePerformer(name) {
    try {
      const r = await fetch('/api/registry/performers/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      notify('Deleted performer', 'success');
      await this.loadAll();
      try { Player._refreshPerformerSuggestions?.(true); } catch(_) {}
    } catch(_) { notify('Delete failed', 'error'); }
  }

  async filterLibraryByPerformer(name) {
    try {
      // Set search to include performer: syntax or do server-side when list endpoint supports it.
      // For now, jump to Library and set search query to name.
      if (window.tabSystem) window.tabSystem.switchToTab('library');
      if (searchInput) {
        searchInput.value = name;
        await loadLibrary();
      }
    } catch(_) {}
  }

  refreshCountsSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(async () => {
      try { this.counts = await this.fetchCounts(); this.renderTable(); } catch(_) {}
    }, 300);
  }
}

// Initialize performers manager when DOM is ready
let performersManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { performersManager = new PerformersManager(); window.performersManager = performersManager; });
} else {
  performersManager = new PerformersManager(); window.performersManager = performersManager;
}
