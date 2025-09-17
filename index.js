const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const spinner = document.getElementById('spinner');
const refreshBtn = document.getElementById('refresh');
const folderInput = document.getElementById('folderInput');

// Grid controls
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const orderToggle = document.getElementById('orderToggle');
const densitySlider = document.getElementById('densitySlider');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

// Hover controls (Settings)
let hoverPreviewsEnabled = false; // playback on hover
let hoverOnDemandEnabled = false; // generation on hover

// Selection
const selectionBar = document.getElementById('selectionBar');
const selectionCount = document.getElementById('selectionCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const selectNoneBtn = document.getElementById('selectNoneBtn');

// State
let currentPage = 1;
let totalPages = 1;
let totalFiles = 0;
let selectedItems = new Set();
let currentDensity = 12; // Default to 12 (maps to 4 columns)

// Simple density configurations: [pageSize, columns, label]
// Just controls how many columns are visible
const densityConfigs = [
  [200, 20, 'Tiny'],      // 1 - 20 columns (very small tiles)
  [180, 18, 'Tiny+'],     // 2
  [160, 16, 'Small--'],   // 3
  [140, 14, 'Small-'],    // 4
  [120, 12, 'Small'],     // 5
  [100, 10, 'Small+'],    // 6
  [90, 9, 'Medium--'],    // 7
  [80, 8, 'Medium-'],     // 8
  [70, 7, 'Medium'],      // 9
  [60, 6, 'Medium+'],     // 10
  [50, 5, 'Large--'],     // 11
  [45, 4, 'Large-'],      // 12 - Default: 4 columns
  [40, 3, 'Large'],       // 13
  [35, 2, 'Large+'],      // 14
  [30, 1, 'Largest']      // 15 - 1 column (largest tiles)
];

// Compute columns/page-size from currentDensity and set CSS var
function applyColumnsAndComputePageSize() {
  const [, columns] = densityConfigs[currentDensity - 1] || [60, 6];
  document.documentElement.style.setProperty('--columns', String(columns));

  // Estimate rows that fit: tile aspect 16/9 + meta (~54px)
  const gridWidth = grid.clientWidth || (window.innerWidth - 128); // margins 64px each side
  const colWidth = Math.max(120, Math.floor(gridWidth / Math.max(1, columns))); // min width safeguard
  const tileHeight = Math.round(colWidth * 9/16) + 54; // image + meta
  const usableHeight = Math.max(200, window.innerHeight - 220); // header + controls padding
  const rows = Math.max(2, Math.floor(usableHeight / tileHeight) + 1); // +1 buffer row
  return columns * rows;
}

const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0e1016"/>
        <stop offset="100%" stop-color="#1a2030"/>
      </linearGradient>
    </defs>
    <rect width="320" height="180" fill="url(#g)"/>
    <g fill="#3b4663">
      <rect x="30" y="40" width="260" height="100" rx="8"/>
      <polygon points="140,90 140,70 200,90 140,110" fill="#6b7aa6"/>
    </g>
  </svg>`);

// Modal elements
const modal = document.createElement('div');
modal.className = 'modal';
modal.hidden = true;
modal.innerHTML = `
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
  </div>`;
document.body.appendChild(modal);
const crumbsEl = modal.querySelector('#crumbs');
const dirlistEl = modal.querySelector('#dirlist');
const chooseBtn = modal.querySelector('#chooseBtn');
const cancelBtn = modal.querySelector('#cancelBtn');
let pickerPath = '';

// Lightweight image modal for previews
const imgModal = document.createElement('div');
imgModal.className = 'modal';
imgModal.hidden = true;
imgModal.innerHTML = `
  <div class="panel" style="max-width: min(920px, 96vw);">
    <header><div style="display:flex;align-items:center;justify-content:space-between;">
      <strong>Heatmap Preview</strong>
      <button class="btn" id="imgModalClose">Close</button>
    </div></header>
    <div class="body" style="padding: 0; background: #0e1016;">
      <img id="imgModalImage" alt="Heatmap" style="display:block; max-width:100%; height:auto;" />
    </div>
  </div>`;
document.body.appendChild(imgModal);
const imgModalClose = imgModal.querySelector('#imgModalClose');
const imgModalImage = imgModal.querySelector('#imgModalImage');
imgModal.addEventListener('click', (e) => { 
  if (e.target === imgModal) {
    imgModal.hidden = true;
  }
});
imgModalClose.addEventListener('click', ()=> imgModal.hidden = true);

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return (h ? h+':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Hover preview utility functions
async function ensureHover(file) {
  // If a preview already exists, use it immediately
  const ts = `&t=${Date.now()}`;
  if (file.hoverPreview) return file.hoverPreview + ts;
  const base = `/api/hover/get?path=${encodeURIComponent(file.path)}`;
  try {
    const head = await fetch(base + ts, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return base + ts;
  } catch (_) {}
  // If on-demand generation is disabled, stop here
  if (!hoverOnDemandEnabled) return null;
  // Otherwise, request creation and briefly poll for readiness
  try {
    await fetch(`/api/hover/create?path=${encodeURIComponent(file.path)}`, { method: 'POST' });
  } catch (_) {}
  const maxTries = 12; // ~1.8s @ 150ms
  for (let i = 0; i < maxTries; i++) {
    try {
      const h2 = await fetch(base + `&t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      if (h2.ok) return base + `&t=${Date.now()}`;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

// Ensure no tiles are currently showing a hover video
function stopAllTileHovers(exceptTile = null) {
  try { 
    const tiles = document.querySelectorAll(".card");
    tiles.forEach((t) => {
      if (exceptTile && t === exceptTile) return;
      
      // Trigger manual cleanup
      const video = t.querySelector("video.hover-video");
      if (video) {
        try { 
          video.pause();
          video.src = "";
          video.load();
          video.remove();
        }
        catch (_) { }
      }
      
      // Reset hover state
      t._hovering = false;
      t._hoverToken = (t._hoverToken || 0) + 1;
      
      // Clear any timers
      if (t._hoverTimer) {
        clearTimeout(t._hoverTimer);
        t._hoverTimer = null;
      }
    });
  }
  catch (_) { }
}

function videoCard(v) {
  const template = document.getElementById('cardTemplate');
  const el = template.content.cloneNode(true).querySelector('.card');
  
  const imgSrc = v.cover || PLACEHOLDER_IMG;
  const dur = fmtDuration(Number(v.duration));
  const size = fmtSize(Number(v.size));
  const isSelected = selectedItems.has(v.path);
  
  el.dataset.path = v.path;
  
  const checkbox = el.querySelector('.card-checkbox');
  if (isSelected) checkbox.classList.add('checked');
  // Make the overlay checkbox interactive and accessible
  try {
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  } catch (_) {}
  // Clicking the checkbox should always toggle selection (no modifiers required)
  checkbox.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleSelection(ev, v.path);
  });
  // Keyboard support for accessibility
  checkbox.addEventListener('keydown', (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      toggleSelection(ev, v.path);
    }
  });
  
  const img = el.querySelector('.thumb');
  img.src = imgSrc;
  img.alt = v.title || v.name;
  img.dataset.fallback = PLACEHOLDER_IMG;
  img.onerror = function() { this.onerror = null; this.src = this.dataset.fallback; };
  
  // Add video hover preview functionality
  el.addEventListener('mouseenter', async () => {
    if (!hoverPreviewsEnabled) return;
    // Stop any other tile's hover video before starting this one
    stopAllTileHovers(el);
    // Track hover tokens to avoid late insert after mouse leaves
    const token = (el._hoverToken || 0) + 1;
    el._hoverToken = token;
    el._hovering = true;
    
    const url = await ensureHover(v);
    // If no preview exists, don't swap out the thumbnail
    if (!url) {
      return;
    }
    if (!el._hovering || el._hoverToken !== token) return;
    // Double-check no other tiles are showing hover previews
    stopAllTileHovers(el);
    
    const video = document.createElement("video");
    video.className = "thumb hover-video";
    video.src = url;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.style.pointerEvents = "none";
    
    // Replace the thumbnail with the video
    if (img) img.replaceWith(video);
    try { 
      await video.play();
    }
    catch (_) { }
  });
  
  el.addEventListener('mouseleave', () => {
    el._hovering = false;
    el._hoverToken = (el._hoverToken || 0) + 1;
    if (el._hoverTimer) {
      clearTimeout(el._hoverTimer);
      el._hoverTimer = null;
    }
    const video = el.querySelector("video.hover-video");
    if (video) {
      video.pause();
      video.src = "";
      video.load();
      
      // Restore original thumbnail
      const newImg = document.createElement("img");
      newImg.className = "thumb";
      newImg.src = imgSrc;
      newImg.alt = v.title || v.name;
      newImg.dataset.fallback = PLACEHOLDER_IMG;
      newImg.onerror = function() { 
        this.onerror = null; 
        this.src = this.dataset.fallback; 
      };
      video.replaceWith(newImg);
    }
  });
  
  const title = el.querySelector('.title');
  title.textContent = v.title || v.name;
  title.title = v.title || v.name;
  
  el.querySelector('.duration').textContent = dur;
  el.querySelector('.size').textContent = size;
  el.addEventListener('click', (event) => {
    handleCardClick(event, v.path);
  });
  return el;
}

function dirCard(d) {
  const template = document.getElementById('dirTemplate');
  const el = template.content.cloneNode(true).querySelector('.card');
  
  const name = d.name || String(d);
  const dpath = d.path || name;
  
  el.querySelector('.dir-name').textContent = name;
  el.querySelector('.title').textContent = name;
  el.querySelector('.title').title = name;
  
  el.addEventListener('click', () => {
    folderInput.value = dpath;
    currentPage = 1; // Reset to first page when navigating to a folder
    loadLibrary();
  });
  el.addEventListener('dblclick', () => {
    folderInput.value = dpath;
    currentPage = 1; // Reset to first page when navigating to a folder
    loadLibrary();
  });
  
  return el;
}

function currentPath() {
  const v = (folderInput.value || '').trim();
  // When the input contains an absolute path (root), do not treat it as a relative folder
  if (isAbsolutePath(v)) return '';
  return v.replace(/^\/+|\/+$/g, '');
}

async function loadLibrary() {
  try {
    statusEl.style.display = 'none';
    spinner.style.display = 'block';
    grid.hidden = true;
    
    const url = new URL('/api/library', window.location.origin);
    url.searchParams.set('page', String(currentPage));
    url.searchParams.set('page_size', String(applyColumnsAndComputePageSize()));
    url.searchParams.set('sort', sortSelect.value || 'date');
    url.searchParams.set('order', orderToggle.dataset.order || 'desc');
    
    // Add search and filter parameters
    const searchVal = searchInput.value.trim();
    if (searchVal) url.searchParams.set('search', searchVal);
    
    const val = (folderInput.value || '').trim();
    const p = currentPath();
    // Only set a relative path; ignore absolute values (those represent the root itself)
    if (val && !isAbsolutePath(val) && p) url.searchParams.set('path', p);
    
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
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalFiles} files)`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    
    grid.innerHTML = '';
    if (files.length === 0) {
      // If there are folders, try a shallow fallback: pull videos from a few subfolders
      if (dirs.length > 0) {
        // Render folders first for navigation
        for (const d of dirs) grid.appendChild(dirCard(d));
        
        // Then fetch videos from up to N subfolders until we have some tiles
        const MAX_DIRS = 8;
        const MAX_TILES = 60;
        let collected = 0;
        const subdirs = dirs.slice(0, MAX_DIRS);
        // Kick off fetches in parallel with a soft cap
        const promises = subdirs.map(async (d) => {
          if (collected >= MAX_TILES) return;
          const dpath = d.path || d.name || '';
          if (!dpath) return;
          try {
            const u = new URL('/api/library', window.location.origin);
            u.searchParams.set('path', dpath);
            u.searchParams.set('page', '1');
            u.searchParams.set('page_size', String(Math.min(24, MAX_TILES)));
            u.searchParams.set('sort', 'date');
            u.searchParams.set('order', 'desc');
            const r = await fetch(u, { headers: { 'Accept': 'application/json' }});
            if (!r.ok) return;
            const pl = await r.json();
            const f2 = Array.isArray(pl?.data?.files) ? pl.data.files : [];
            for (const f of f2) {
              if (collected >= MAX_TILES) break;
              grid.appendChild(videoCard(f));
              collected++;
            }
          } catch (_) { /* ignore sub-errors */ }
        });
        await Promise.all(promises);
        
        spinner.style.display = 'none';
        grid.hidden = false;
        return;
      } else {
        spinner.style.display = 'none';
        statusEl.className = 'empty';
        statusEl.textContent = 'No videos found.';
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
    statusEl.style.display = 'none';
    spinner.style.display = 'none';
    grid.hidden = false;
  } catch (e) {
    console.error('Library loading error:', e);
    spinner.style.display = 'none';
    statusEl.className = 'error';
    statusEl.textContent = 'Failed to load library.';
    statusEl.style.display = 'block';
    grid.hidden = true;
  }
}

refreshBtn.addEventListener('click', loadLibrary);

// Grid control event listeners
searchInput.addEventListener('input', () => { currentPage = 1; loadLibrary(); });
sortSelect.addEventListener('change', () => { currentPage = 1; loadLibrary(); });
orderToggle.addEventListener('click', () => { 
  const isDesc = orderToggle.dataset.order === 'desc';
  orderToggle.dataset.order = isDesc ? 'asc' : 'desc';
  orderToggle.textContent = isDesc ? '▲' : '▼';
  currentPage = 1; 
  loadLibrary(); 
});

// Pagination
prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadLibrary(); } });
nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadLibrary(); } });

// Density slider
densitySlider.addEventListener('input', () => {
  currentDensity = parseInt(densitySlider.value);
  updateDensity();
  currentPage = 1; 
  loadLibrary();
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

function wireSettings() {
  const cbPlay = document.getElementById('settingHoverPreviews');
  const cbDemand = document.getElementById('settingHoverOnDemand');
  const concurrencyInput = document.getElementById('settingConcurrency');
  loadHoverSetting();
  loadHoverOnDemandSetting();
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
}

// (Removed: simple Enter handler; replaced below with unified behavior)
folderInput.addEventListener('dblclick', () => openFolderPicker());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadLibrary();
});
window.addEventListener('load', () => {
  // Initialize density
  updateDensity();
  
  // Prefill placeholder with current root value, but keep input empty for relative navigation
  fetch('/api/root').then(r => r.json()).then((p) => {
    if (p?.status === 'success' && p?.data?.root) {
      folderInput.placeholder = `Root: ${String(p.data.root)} — type a relative path to browse, or an absolute path to change root`;
      folderInput.value = '';
    } else {
      folderInput.value = '';
    }
  }).catch(() => {
    folderInput.value = '';
  }).finally(loadLibrary);
});

// Recalculate columns/page size on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Update CSS columns for current density
    updateDensity();
    // Reload with fit-aware page size
    loadLibrary();
  }, 120);
});

// Overscroll pagination disabled per request

// Density function
function updateDensity() {
  const config = densityConfigs[currentDensity - 1];
  const [pageSize, columns, label] = config;
  
  const root = document.documentElement;
  root.style.setProperty('--columns', String(columns));
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
chooseBtn.addEventListener('click', () => choose(pickerPath));
cancelBtn.addEventListener('click', () => closeFolderPicker());
modal.addEventListener('click', (e) => { if (e.target === modal) closeFolderPicker(); });

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
  let videoEl, titleEl, metaEl, curEl, totalEl, timelineEl, heatmapEl, progressEl, markersEl, spriteTooltipEl;
  // Sidebar refs
  let sbFileNameEl, sbMetaEl, sbReloadBtn, sbHeatmapStatus, sbHeatmapPreview, sbHeatmapImg, sbHeatmapOpen,
      sbScenesStatus, sbScenesList, sbSubStatus, sbSubToggle, sbSpritesStatus;
  let badgeCC, badgeSprites, badgeHeatmap, badgeScenes;
  let btnSetThumb, btnAddMarker;

  // State
  let currentPath = null; // relative path from /api library
  let duration = 0;
  let sprites = null; // { index, sheet }
  let scenes = [];
  let hasHeatmap = false;
  let subtitlesUrl = null;
  let timelineMouseDown = false;

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
    progressEl = qs('timelineProgress');
    markersEl = qs('timelineMarkers');
    spriteTooltipEl = qs('spritePreview');
    badgeCC = qs('badgeSubtitles');
    badgeSprites = qs('badgeSprites');
    badgeHeatmap = qs('badgeHeatmap');
    badgeScenes = qs('badgeScenes');
    btnSetThumb = qs('btnSetThumb');
    btnAddMarker = qs('btnAddMarker');

  // Sidebar
  sbFileNameEl = qs('sbFileName');
  sbMetaEl = qs('sbMeta');
  sbReloadBtn = qs('sbReloadBtn');
  sbHeatmapStatus = qs('sbHeatmapStatus');
  sbHeatmapPreview = qs('sbHeatmapPreview');
  sbHeatmapImg = qs('sbHeatmapImg');
  sbHeatmapOpen = qs('sbHeatmapOpen');
  sbScenesStatus = qs('sbScenesStatus');
  sbScenesList = qs('sbScenesList');
  sbSubStatus = qs('sbSubStatus');
  sbSubToggle = qs('sbSubToggle');
  sbSpritesStatus = qs('sbSpritesStatus');

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
      });
    }
    if (timelineEl) {
      const seekTo = (evt) => {
        if (!duration || !videoEl) return;
        const rect = timelineEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(evt.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        const t = pct * duration;
        videoEl.currentTime = t;
      };
      timelineEl.addEventListener('mousedown', (e) => { timelineMouseDown = true; seekTo(e); });
      window.addEventListener('mousemove', (e) => {
        if (timelineMouseDown) seekTo(e);
        handleSpriteHover(e);
      });
      window.addEventListener('mouseup', () => { timelineMouseDown = false; });
      timelineEl.addEventListener('mouseleave', () => { hideSprite(); });
      timelineEl.addEventListener('mousemove', (e) => handleSpriteHover(e));
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
          notify('Cover updated from current frame.', 'success');
          // Refresh library tile if visible by reloading page 1 quickly
          setTimeout(() => loadLibrary(), 200);
        } catch (e) {
          notify('Failed to set thumbnail', 'error');
        }
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
    if (sbReloadBtn && !sbReloadBtn._wired) {
      sbReloadBtn._wired = true;
      sbReloadBtn.addEventListener('click', async () => {
        await Promise.all([loadHeatmap(), loadSprites(), loadScenes(), loadSubtitles()]);
      });
    }
    if (sbHeatmapOpen && !sbHeatmapOpen._wired) {
      sbHeatmapOpen._wired = true;
      sbHeatmapOpen.addEventListener('click', async () => {
        try {
          // Reuse modal from tasks heatmap preview when available
          const head = await fetch('/api/heatmaps/png?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
          if (!head.ok) return notify('Heatmap not available for this file', 'error');
          imgModalImage.src = '/api/heatmaps/png?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
          imgModal.hidden = false;
        } catch (_) { notify('Failed to open heatmap preview', 'error'); }
      });
    }
    if (sbSubToggle && !sbSubToggle._wired) {
      sbSubToggle._wired = true;
      sbSubToggle.addEventListener('change', () => {
        try {
          const tracks = videoEl ? Array.from(videoEl.querySelectorAll('track')) : [];
          tracks.forEach(t => t.mode = sbSubToggle.checked ? 'showing' : 'disabled');
        } catch (_) {}
      });
    }
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
      videoEl.play().catch(()=>{});
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
  }

  async function loadHeatmap() {
    badgeHeatmap.style.display = 'none';
    if (!currentPath) return;
    try {
      const head = await fetch('/api/heatmaps/png?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
      if (head.ok) {
        const url = '/api/heatmaps/png?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
        heatmapEl.style.backgroundImage = `url('${url}')`;
        hasHeatmap = true;
        badgeHeatmap.style.display = '';
        if (sbHeatmapStatus) sbHeatmapStatus.textContent = 'Available';
        if (sbHeatmapPreview) sbHeatmapPreview.style.display = '';
        if (sbHeatmapImg) sbHeatmapImg.src = url;
        if (sbHeatmapOpen) sbHeatmapOpen.style.display = '';
      } else {
        heatmapEl.style.backgroundImage = '';
        hasHeatmap = false;
        if (sbHeatmapStatus) sbHeatmapStatus.textContent = 'Missing';
        if (sbHeatmapPreview) sbHeatmapPreview.style.display = 'none';
        if (sbHeatmapOpen) sbHeatmapOpen.style.display = 'none';
      }
    } catch (_) {
      heatmapEl.style.backgroundImage = '';
      hasHeatmap = false;
      if (sbHeatmapStatus) sbHeatmapStatus.textContent = 'Missing';
      if (sbHeatmapPreview) sbHeatmapPreview.style.display = 'none';
      if (sbHeatmapOpen) sbHeatmapOpen.style.display = 'none';
    }
  }

  async function loadSprites() {
    badgeSprites.style.display = 'none';
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
        badgeSprites.style.display = '';
        if (sbSpritesStatus) sbSpritesStatus.textContent = 'Available';
      }
    } catch (_) { sprites = null; }
    if (!sprites && sbSpritesStatus) sbSpritesStatus.textContent = 'Missing';
  }

  async function loadScenes() {
    badgeScenes.style.display = 'none';
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
      if (scenes.length) {
        badgeScenes.style.display = '';
        if (sbScenesStatus) sbScenesStatus.textContent = String(scenes.length);
      } else {
        if (sbScenesStatus) sbScenesStatus.textContent = '0';
      }
      renderSidebarScenes();
    } catch (_) { scenes = []; renderMarkers(); }
  }

  async function loadSubtitles() {
    badgeCC.style.display = 'none';
    subtitlesUrl = null;
    if (!currentPath || !videoEl) return;
    // Remove existing tracks
    Array.from(videoEl.querySelectorAll('track')).forEach(t => t.remove());
    try {
      const head = await fetch('/api/subtitles/get?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
      if (head.ok) {
        const src = '/api/subtitles/get?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
        subtitlesUrl = src;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Subtitles';
        track.srclang = 'en';
        track.default = true;
        track.src = src; // browser will parse SRT in many cases; if not, still downloadable
        videoEl.appendChild(track);
        badgeCC.style.display = '';
        if (sbSubStatus) sbSubStatus.textContent = 'Available';
        if (sbSubToggle) sbSubToggle.checked = true;
      }
    } catch (_) { /* ignore */ }
    if (!subtitlesUrl) {
      if (sbSubStatus) sbSubStatus.textContent = 'Missing';
      if (sbSubToggle) sbSubToggle.checked = false;
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

  function renderSidebarScenes() {
    if (!sbScenesList) return;
    sbScenesList.innerHTML = '';
    if (!duration || !scenes || scenes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.color = 'var(--muted, #7a859f)';
      empty.textContent = 'No markers';
      sbScenesList.appendChild(empty);
      return;
    }
    scenes
      .slice()
      .sort((a,b)=>a.time-b.time)
      .forEach((s, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '8px';
        const left = document.createElement('button');
        left.className = 'btn-sm';
        left.textContent = fmtTime(Math.max(0, Math.min(duration, Number(s.time))));
        left.title = 'Seek to ' + left.textContent;
        left.addEventListener('click', () => {
          if (videoEl) videoEl.currentTime = Math.max(0, Math.min(duration, Number(s.time)));
        });
        const del = document.createElement('button');
        del.className = 'btn-sm';
        del.textContent = '×';
        del.title = 'Remove marker';
        del.addEventListener('click', async () => {
          try {
            const u = new URL('/api/marker', window.location.origin);
            u.searchParams.set('path', currentPath);
            u.searchParams.set('time', String(Number(s.time)));
            const r = await fetch(u, { method: 'DELETE' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            notify('Marker removed', 'success');
            await loadScenes();
          } catch (e) { notify('Failed to remove marker', 'error'); }
        });
        row.appendChild(left);
        row.appendChild(del);
        sbScenesList.appendChild(row);
      });
  }

  function handleSpriteHover(evt) {
    if (!sprites || !sprites.index || !sprites.sheet) { hideSprite(); return; }
    const rect = timelineEl.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    if (x < 0 || x > rect.width) { hideSprite(); return; }
    const pct = x / rect.width;
    const t = pct * (duration || 0);
    // Position tooltip
    const left = Math.max(8, Math.min(rect.width - 248, x - 120));
    spriteTooltipEl.style.left = left + 'px';
    spriteTooltipEl.style.display = 'block';
    // Compute background position based on sprite metadata
    try {
      const idx = sprites.index;
      const cols = Number(idx.cols || (idx.grid && idx.grid[0]) || 0);
      const rows = Number(idx.rows || (idx.grid && idx.grid[1]) || 0);
      const interval = Number(idx.interval || 10);
      const tw = Number(idx.tile_width || (idx.tile && idx.tile[0]) || 240);
      const th = Number(idx.tile_height || (idx.tile && idx.tile[1]) || 135);
      const totalFrames = Math.max(1, Number(idx.frames || cols * rows));
      const frame = Math.min(totalFrames - 1, Math.floor((t / Math.max(0.1, interval))));
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      const xOff = -(col * tw);
      const yOff = -(row * th);
      spriteTooltipEl.style.width = tw + 'px';
      spriteTooltipEl.style.height = th + 'px';
      spriteTooltipEl.style.backgroundImage = `url('${sprites.sheet}')`;
      spriteTooltipEl.style.backgroundPosition = `${xOff}px ${yOff}px`;
      spriteTooltipEl.style.backgroundSize = `${tw * cols}px ${th * rows}px`;
    } catch (_) {
      // If anything goes wrong, hide the preview gracefully
      hideSprite();
    }
  }

  function hideSprite() {
    if (spriteTooltipEl) spriteTooltipEl.style.display = 'none';
  }

  // Public API
  return { open };
})();

window.Player = Player;

// Tasks System
class TasksManager {
  constructor() {
    this.jobs = new Map();
    this.coverage = {};
    this.orphanFiles = [];
    // Multi-select filters: default show queued and running, hide completed
    this.activeFilters = new Set(['running', 'queued']);
    this._jobRows = new Map(); // id -> tr element for stable rendering
    this.init();
  }

  init() {
    this.initEventListeners();
    this.initJobEvents();
    this.startJobPolling();
    this.loadCoverage();
    this.wireGenerateAll();
    // Initialize resizer for job queue container
    setTimeout(() => this.initJobQueueResizer(), 0);
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
        }
      };
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          // Update only for job lifecycle/progress events
          const evt = payload.event;
          if (!evt) return;
          if (["created","queued","started","progress","current","finished","result"].includes(evt)) {
            doRefresh();
          }
        } catch {}
      };
      // Some servers send named events; attach explicit listeners as well
      ["created","queued","started","progress","current","finished","result","cancel"].forEach(type => {
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
    const allFilters = [filterActive, filterQueued, filterCompleted];
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
    if (filterActive) filterActive.addEventListener('click', () => toggle('running'));
    if (filterQueued) filterQueued.addEventListener('click', () => toggle('queued'));
    if (filterCompleted) filterCompleted.addEventListener('click', () => toggle('completed'));
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
      // Ensure heatmap exists; try HEAD; if missing, trigger create and poll briefly
      const headUrl = new URL('/api/heatmaps/png', window.location.origin);
      headUrl.searchParams.set('path', path);
      let ok = false;
      for (let i=0; i<10; i++) { // ~10 quick tries
        const h = await fetch(headUrl, { method: 'HEAD' });
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
    const [type, mode] = operation.split('-');
    const fileSelection = document.querySelector('input[name="fileSelection"]:checked').value;
    
    // Get operation parameters
    const params = this.getOperationParams(type);
    // Scope to current folder (relative to root)
    const val = (folderInput.value || '').trim();
    const rel = isAbsolutePath(val) ? '' : currentPath();
    
    // Confirm destructive operations
    if (mode === 'all' && !confirm(`This will recompute ALL ${type} artifacts. Continue?`)) {
      return;
    }

    // For recompute all operations, immediately reset the coverage display
    if (mode === 'all') {
      this.resetCoverageDisplay(type);
    }

    try {
      const response = await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: type,
          mode: mode, // 'missing' or 'all'
          fileSelection: fileSelection,
          params: params,
          path: rel
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        this.showNotification(`Started ${operation} operation for ${result.data.fileCount} files`, 'success');
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
        'subtitles-missing',
      ];
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
    // Sort by start time desc
    visible.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    // Build/update rows
    const seen = new Set();
    for (const job of visible) {
      seen.add(job.id);
      let tr = this._jobRows.get(job.id);
      if (!tr) {
        tr = this.createJobRow(job);
        this._jobRows.set(job.id, tr);
        tbody.appendChild(tr);
      } else {
        // Update existing row fields
        this.updateJobRow(tr, job);
        if (tr.parentElement !== tbody) tbody.appendChild(tr);
      }
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
    const startTime = job.startTime ? new Date(job.startTime * 1000).toLocaleTimeString() : 'N/A';
    const fileName = (job.file || '').split('/').pop();
    row.querySelector('.cell-time').textContent = startTime;
    row.querySelector('.cell-task').textContent = job.task;
    const fileCell = row.querySelector('.cell-file');
    fileCell.textContent = fileName;
    fileCell.title = job.file || '';
    // Status
    let status = this.normalizeStatus(job);
    const statusEl = row.querySelector('.job-status');
    statusEl.className = 'job-status ' + status;
    statusEl.textContent = status;
    // Progress (prefer raw counters when available)
    let pct = 0;
    if (typeof job.progress === 'number' && job.progress > 0) {
      pct = job.progress;
    }
    const totalRaw = job.totalRaw;
    const processedRaw = job.processedRaw;
    if (typeof totalRaw === 'number' && totalRaw > 0 && typeof processedRaw === 'number') {
      const calc = Math.max(0, Math.min(100, Math.floor((processedRaw / totalRaw) * 100)));
      // If server-provided progress seems missing but raw is present, use calc
      if (pct === 0 || Math.abs(calc - pct) > 0) pct = calc;
    }
    // Queued shows 0%; completed shows 100%
    if (status === 'completed') pct = 100;
    const bar = row.querySelector('.job-progress-fill');
    bar.style.width = (status !== 'queued' ? pct : 0) + '%';
    row.querySelector('.pct').textContent = (status === 'queued') ? 'Queued' : (status === 'completed' ? '100%' : `${pct}%`);
    const fname = row.querySelector('.fname');
    // Show the target path+file when available; otherwise leave blank to avoid duplication
    const targetPath = (job && typeof job.target === 'string' && job.target) ? job.target : '';
    fname.textContent = (status === 'running' && targetPath) ? targetPath : '';
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

  // Normalize backend status to UI status names
  normalizeStatus(job) {
    let s = job.status || '';
    if (s === 'done') s = 'completed';
    if (s === 'queued' && (job.progress || 0) > 0) s = 'running';
    return s;
  }

  updateJobStats(stats) {
    const activeEl = document.getElementById('activeJobsCount');
    const queuedEl = document.getElementById('queuedJobsCount');
    const completedEl = document.getElementById('completedJobsCount');
    
    if (activeEl) activeEl.textContent = stats.active || 0;
    if (queuedEl) queuedEl.textContent = stats.queued || 0;
    if (completedEl) completedEl.textContent = stats.completedToday || 0;
  }

  async cancelJob(jobId) {
    try {
      const response = await fetch(`/api/tasks/jobs/${jobId}/cancel`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          this.showNotification('Job cancelled', 'success');
          this.refreshJobs();
        }
      } else {
        throw new Error('Failed to cancel job');
      }
    } catch (error) {
      console.error('Failed to cancel job:', error);
      this.showNotification('Failed to cancel job', 'error');
    }
  }

  updateSelectedFileCount() {
    const selectedRadio = document.querySelector('input[name="fileSelection"]:checked');
    const countEl = document.getElementById('selectedFileCount');
    
    if (selectedRadio && countEl) {
      if (selectedRadio.value === 'selected') {
        // Get count from library selection
        countEl.textContent = selectedItems.size;
      } else {
        countEl.textContent = '0';
      }
    }
  }

  startJobPolling() {
    // Poll for job and coverage updates every 1 second when on tasks tab for more responsive updates
    setInterval(() => {
      if (tabSystem && tabSystem.getActiveTab() === 'tasks') {
        this.refreshJobs();
        this.loadCoverage();
      }
    }, 1000);
  }

  showNotification(message, type = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
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
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  async loadOrphanData() {
    try {
      // Use empty path to scan the current root directory
      const response = await fetch('/api/artifacts/orphans');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.updateOrphanDisplay(data.data);
      }
    } catch (error) {
      // Quiet failure during polling
      // Reset display on error
      this.updateOrphanDisplay({ orphaned: 0, orphaned_files: [] });
    }
  }

  updateOrphanDisplay(orphanData) {
    const orphanCount = orphanData.orphaned || 0;
    const orphanCountEl = document.getElementById('orphanCount');
    const cleanupBtn = document.getElementById('cleanupOrphansBtn');
    const previewBtn = document.getElementById('previewOrphansBtn');

    if (orphanCountEl) {
      orphanCountEl.textContent = orphanCount;
    }

    // Enable/disable buttons based on orphan count
    if (cleanupBtn) {
      cleanupBtn.disabled = orphanCount === 0;
    }
    if (previewBtn) {
      previewBtn.disabled = orphanCount === 0;
    }

    // Store orphan data for preview
    this.orphanFiles = orphanData.orphaned_files || [];
  }

  async previewOrphans() {
    const orphanDetails = document.getElementById('orphanDetails');
    const orphanList = document.getElementById('orphanList');

    if (orphanDetails.style.display === 'none') {
      // Show preview
      orphanList.innerHTML = this.orphanFiles.map(file => 
        `<div class="orphan-file">${file}</div>`
      ).join('');
      orphanDetails.style.display = 'block';
      document.getElementById('previewOrphansBtn').textContent = 'Hide';
    } else {
      // Hide preview
      orphanDetails.style.display = 'none';
      document.getElementById('previewOrphansBtn').textContent = 'Preview';
    }
  }

  async cleanupOrphans() {
    if (!confirm(`Are you sure you want to delete ${this.orphanFiles.length} orphaned artifact files? This action cannot be undone.`)) {
      return;
    }

    try {
      // Use empty path to cleanup the current root directory
      const response = await fetch('/api/artifacts/cleanup?dry_run=false&keep_orphans=false', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success') {
        this.showNotification('Cleanup started successfully', 'success');
        // Refresh orphan data after cleanup starts
        setTimeout(() => this.loadOrphanData(), 2000);
      } else {
        throw new Error(data.message || 'Cleanup failed');
      }
    } catch (error) {
      console.error('Failed to start cleanup:', error);
      this.showNotification('Failed to start cleanup: ' + error.message, 'error');
    }
  }
}

// Initialize tasks manager when DOM is ready
let tasksManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    tasksManager = new TasksManager();
  });
} else {
  // Script likely loaded with defer, DOM is ready; safe to init now
  tasksManager = new TasksManager();
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
