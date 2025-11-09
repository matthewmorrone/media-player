// Inlined utilities (merged from utils.js)
// Keep this section free of app-specific state; pure or narrowly scoped helpers only.

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function parseTimeString(str) {
  if (!str) return 0;
  const parts = str.trim().split(':')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.some((p) => !/^[0-9]{1,2}$/.test(p))) return NaN;
  let h = 0, m = 0, s = 0;

  if (parts.length === 3) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    s = Number(parts[2]);
  }
  else if (parts.length === 2) {
    m = Number(parts[0]);
    s = Number(parts[1]);
  }
  else if (parts.length === 1) {
    s = Number(parts[0]);
  }
  return (h * 3600) + (m * 60) + s;
}

function debounce(fn, wait = 120) {
  let t = null;
  return function debounced (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// DOM visibility helpers
function hide(el) {
  if (!el) return;
  el.classList.add('hidden');
  if (el.getAttribute('data-keep-attr') !== '0') {
    if (!el.hasAttribute('hidden')) {
      el.setAttribute('hidden', '');
    }
  }
  try { el.style.removeProperty('display'); }
  catch (_) {}
}
function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.removeProperty('display');
  if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
function showAs(el, display) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = display;
  if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
function isHidden(el) {
  return !el || el.classList.contains('hidden') || el.hasAttribute('hidden');
}

function showMessageModal(message, opts = {}) {
  const modal = document.getElementById('messageModal');
  if (!modal) throw new Error('messageModal element missing');
  const titleEl = document.getElementById('messageModalTitle');
  const bodyEl = document.getElementById('messageModalBody');
  const closeBtn = document.getElementById('messageModalClose');
  const okBtn = document.getElementById('messageModalOk');
  if (titleEl && opts.title) titleEl.textContent = opts.title;
  if (bodyEl) bodyEl.textContent = message || '';
  const close = () => { hide(modal); };
  if (closeBtn && !closeBtn._wired) { closeBtn._wired = true; closeBtn.addEventListener('click', close); }
  if (okBtn && !okBtn._wired) { okBtn._wired = true; okBtn.addEventListener('click', close); }
  if (!modal._bgWired) {
    modal._bgWired = true;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }
  show(modal);
}

function isAbsolutePath(p) {
  if (!p) return false;
  return p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:[\\/]/.test(p);
}

function notify(message, type = 'info') {
  try {
    if (window.tasksManager && typeof window.tasksManager.showNotification === 'function') {
      window.tasksManager.showNotification(message, type);
      return;
    }
  }
  catch (_) {}
  let host = document.getElementById('toastHost');
  if (!host) { host = document.createElement('div'); host.id = 'toastHost'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast';
  if (type === 'success') el.classList.add('is-success');
  else if (type === 'error') el.classList.add('is-error');
  else el.classList.add('is-info');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.textContent = message;
  host.appendChild(el);
  const lifespan = 5000, fadeMs = 250;
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), fadeMs + 30); }, lifespan - fadeMs);
}

function getLocalStorageItem(key, opts = null) {
  let type = 'string';
  let fallback = null;
  if (opts && typeof opts === 'object' && !(opts instanceof String)) {
    type = opts.type || 'string';
    fallback = Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }
  else if (opts !== null && opts !== undefined) {
    fallback = opts;
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    switch (type) {
      case 'json':
        try { return JSON.parse(raw); }
        catch (_) { return fallback; }
      case 'bool':
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
        return fallback;
      case 'number': {
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
      }
      default:
        return raw;
    }
  }
  catch (_) {
    return fallback;
  }
}

function setLocalStorageItem(key, value, opts = null) {
  let type = 'string';
  if (typeof opts === 'string') type = opts;
  else if (opts && typeof opts === 'object') type = opts.type || 'string';
  try {
    let stored;
    switch (type) {
      case 'json': stored = JSON.stringify(value); break;
      case 'bool': stored = value ? '1' : '0'; break;
      case 'number': stored = Number.isFinite(value) ? String(value) : '0'; break;
      case 'string':
      default: stored = value == null ? '' : String(value); break;
    }
    localStorage.setItem(key, stored);
    return true;
  }
  catch (_) { return false; }
}

function lsKeysWithPrefix(prefix) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  }
  catch (_) {}
  return out;
}
function lsRemove(key) {
  try { localStorage.removeItem(key); return true; }
  catch (_) { return false; }
}
function lsRemovePrefix(prefix) {
  lsKeysWithPrefix(prefix).forEach((k) => lsRemove(k));
}

function getLocalStorageJSON(key, fallback = null) { return getLocalStorageItem(key, { type: 'json', fallback }); }
function setLocalStorageJSON(key, value) { return setLocalStorageItem(key, value, { type: 'json' }); }
function getLocalStorageBoolean(key, fallback = false) { return getLocalStorageItem(key, { type: 'bool', fallback }); }
function setLocalStorageBoolean(key, value) { return setLocalStorageItem(key, value, { type: 'bool' }); }

function loadToggleSetting(name, defaultValue = false) {
  try {
    const raw = getLocalStorageItem(`setting.${name}`);
    if (raw == null) return defaultValue;
    return raw === '1';
  }
  catch (_) { return defaultValue; }
}
function saveToggleSetting(name, value) {
  try { setLocalStorageItem(`setting.${name}`, value ? '1' : '0'); }
  catch (_) {}
}
// Attach to window for any legacy non-module access patterns (defensive)
try {
  window.loadToggleSetting = window.loadToggleSetting || loadToggleSetting;
  window.saveToggleSetting = window.saveToggleSetting || saveToggleSetting;
}
catch (_) {}

function devLog(level, scope, ...args) {
  try {
    const lv = (level || 'log').toLowerCase();
    let enabled = false;
    try {
      if (typeof window !== 'undefined') {
        const hasUrlDebug = /(^|[?&#])debug=1(?!\d)/.test(window.location.search) || /(^|[?&#])debug=1(?!\d)/.test(window.location.hash);
        if (hasUrlDebug && !window.__DEBUG_LOGS) {
          window.__DEBUG_LOGS = true;
          try { localStorage.setItem('setting.debugLogs', '1'); }
          catch (_) {}
        }
        enabled = !!window.__DEBUG_LOGS || loadToggleSetting('debugLogs', false);
      }
    }
    catch (_) { enabled = false; }
    if (!enabled && lv !== 'error') return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${scope || 'app'}]`;
    if (lv === 'debug' && console.debug) return console.debug(prefix, ...args);
    if (lv === 'info' && console.info) return console.info(prefix, ...args);
    if (lv === 'warn' && console.warn) return console.warn(prefix, ...args);
    if (lv === 'error' && console.error) return console.error(prefix, ...args);
    return console.log(prefix, ...args);
  }
  catch (_) {}
}

// Suppress console errors for expected 404s on thumbnail/artifact requests
// This prevents browser noise when thumbnails or media info don't exist yet
(function suppressExpected404s() {
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const message = args.join(' ');
    // Skip logging 404 errors for expected missing artifacts
    if (message.includes('404') && (
      message.includes('/api/thumbnail') ||
      message.includes('/api/media/info') ||
      message.includes('/files/') ||
      message.includes('Failed to load resource')
    )) {
      return; // Suppress these expected errors
    }
    // Allow all other errors through
    originalConsoleError.apply(console, args);
  };
})();
// Some browser extensions inject content_script.js that can throw on focus events
// when inspecting non-form elements (e.g., reading element.control of undefined).
// Swallow that specific, external error so it doesn't clutter the console or
// interrupt our app's focus handling.
(function suppress3pFocusErrors(){
  try {
    const isKnownExtError = (message, source) => {
      const msg = String(message || '').toLowerCase();
      const src = String(source || '').toLowerCase();
      // Some extensions throw when reading element.control on focusin
      // Loosen match to message only so we catch Promise rejections too
      return msg.includes("reading 'control'");
    };
    window.addEventListener('error', (e) => {
      if (isKnownExtError(e?.message, e?.filename)) {
        try { e.preventDefault(); e.stopImmediatePropagation(); }
        catch(_) { }
        return false;
      }
    }, true);
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e && e.reason;
      const msg = reason && (reason.message || String(reason));
      const src = reason && (reason.fileName || reason.sourceURL || reason.stack || '');
      if (isKnownExtError(msg, src)) {
        try { e.preventDefault(); }
        catch(_) { }
        return false;
      }
    }, true);
  }
  catch(_) { }
})();
// Lightweight no-op placeholders to avoid no-undef when optional helpers are not wired
const loadArtifactStatuses = (..._args) => {};
const refreshSidebarThumbnail = (..._args) => {};
// Local slugify for tag/name normalization where needed
const _slugify = (s) => String(s ?? '')
.toLowerCase()
.replace(/\s+/g, '-');
// Local toast helper: prefer legacy window.showToast if present; otherwise use notify()
const showToast = (message, type) => {
  try {
    if (window.showToast) {
      window.showToast(message, type || 'is-info');
    }
    else {
      const map = { 'is-error': 'error', 'is-success': 'success' };
      notify(message, map[type] || 'info');
    }
  }
  catch (_) { }
};
const grid = document.getElementById('grid');
try { devLog('info', 'app', 'script loaded build=reset-debug-1', {ts: Date.now()}); }
catch (_) {}

// --------------------------------------------------
// Global Player Reset (moved to top-level so it's definitely defined & wired)
// --------------------------------------------------
function resetPlayer(opts = {}) {
  try {
    devLog('info', 'player', 'resetPlayer invoked', {opts});
    const vid = document.getElementById('playerVideo');
    if (vid) {
      try { vid.pause(); }
      catch (_) {}
      try { vid.currentTime = 0; }
      catch (_) {}
      if (opts.unload !== false) {
        try {
          vid.removeAttribute('src');
          vid.load();
          devLog('debug', 'player', 'video src removed; currentSrc after load()', {currentSrc: vid.currentSrc});
        }
        catch (e) { console.warn('[resetPlayer] error unloading video', e); }
      }
    }
    // Remove transient preview videos
    try { document.querySelectorAll('.tile video.preview-video').forEach(v => {
      try { v.pause(); }
    catch (_) {}; v.remove(); }); }
    catch (_) {}
    // Clear active library selection so auto-open logic does not immediately reload same file
    try {
      if (selectedItems && selectedItems.size) selectedItems.clear();
      if (typeof updateSelectionUI === 'function') updateSelectionUI();
      if (typeof lastSelectedPath !== 'undefined') lastSelectedPath = null;
      document.querySelectorAll('.card .card-checkbox.checked').forEach(cb => cb.classList.remove('checked'));
      const selectionBarEl = typeof selectionBar !== 'undefined' ? selectionBar : document.getElementById('selectionBar');
      if (selectionBarEl) selectionBarEl.hidden = true;
    }
    catch (e) { /* non-fatal */ }
    if (opts.full) {
      adjState = {brightness: 1, contrast: 1, saturation: 1, hue: 0};
      updateAdjUI();
    }
    else {
      applyVideoAdjustments();
    }
    const playBtn = document.getElementById('btnPlayPause');
    if (playBtn) {
      const playIcon = playBtn.querySelector('.icon-play');
      const pauseIcon = playBtn.querySelector('.icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
    }
    const t = document.getElementById('playerScrubberTime');
    if (t) t.textContent = '00:00 / 00:00';
    try { playerResetSuppressAutoResumeUntil = Date.now() + 1500; }
    catch (_) {}
    devLog('debug', 'player', 'suppression window set', {until: playerResetSuppressAutoResumeUntil});
    // Purge persisted last video so a full page refresh doesn't auto-load it again
    try {
      localStorage.removeItem('mediaPlayer:last');
      localStorage.removeItem('mediaPlayer:lastVideo'); // legacy key
      // Optionally also remove per-video progress for the video we just cleared
      if (typeof currentPath === 'string' && currentPath) {
        try { localStorage.removeItem('mediaPlayer:video:' + currentPath); }
        catch (_) {}
      }
      // Set an explicit one-shot skip flag that survives a reload exactly once
      localStorage.setItem('mediaPlayer:skipSaveOnUnload', '1');
      devLog('info', 'player', 'cleared last video persistence + set skip flag');
    }
    catch (e) {
      console.warn('[resetPlayer] failed clearing last video keys', e);
    }
    showToast('Player reset', 'is-info');
  }
  catch (e) {
    devLog('warn', 'player', 'resetPlayer failed', e);
  }
}

function wireResetButton() {
  const btnResetPlayer = document.getElementById('btnResetPlayer');
  if (!btnResetPlayer) return false;
  if (!btnResetPlayer._wired) {
    btnResetPlayer._wired = true;
    btnResetPlayer.addEventListener('click', () => {
      devLog('debug', 'player', 'reset button click captured');
      resetPlayer({ full: true });
    });
    btnResetPlayer.setAttribute('data-reset-wired', '1');
    devLog('debug', 'player', 'reset button wired');
  }
  return true;
}
if (!wireResetButton()) {
  window.addEventListener('DOMContentLoaded', () => {
    const ok = wireResetButton();
    devLog('debug', 'player', 'DOMContentLoaded wiring attempt', {success: ok});
  }, {once: true});
}
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest && e.target.closest('#btnResetPlayer');
  if (t && !t._delegatedHandled) {
    t._delegatedHandled = true;
    devLog('debug', 'player', 'delegated reset click handler');
    resetPlayer({ full: true });
    setTimeout(() => { t._delegatedHandled = false; }, 0);
  }
});
try { window.resetPlayer = resetPlayer; }
catch (_) {}
const statusEl = document.getElementById('status');
const spinner = document.getElementById('spinner');
const refreshBtn = document.getElementById('refresh');
const folderInput = document.getElementById('folderInput');
// Grid controls (unified search input: plain text, #tag, @performer)
const unifiedInput = document.getElementById('libraryUnifiedInput');
const unifiedChipsEl = document.getElementById('libraryUnifiedChips');
const randomPlayBtn = document.getElementById('randomPlayBtn');
const randomAutoBtn = document.getElementById('randomAutoBtn');
const sortSelect = document.getElementById('sortSelect');
const orderToggle = document.getElementById('orderToggle');
const clearFiltersTopBtn = document.getElementById('clearFiltersTopBtn');
// Sorting order helpers: default to ASC for name, DESC otherwise
function syncOrderToggleArrow() {
  if (!orderToggle) return;
  const isAsc = (orderToggle.dataset.order || '').toLowerCase() === 'asc';
  orderToggle.textContent = isAsc ? '▲' : '▼';
}
function applyDefaultOrderForSort(force = false) {
  if (!orderToggle || !sortSelect) return;
  // If user explicitly toggled the order, don't override unless force=true
  if (!force && orderToggle.dataset.userSet === '1') {
    syncOrderToggleArrow();
    return;
  }
  const s = (sortSelect.value || 'date').toLowerCase();
  const def = s === 'name' ? 'asc' : 'desc';
  orderToggle.dataset.order = def;
  syncOrderToggleArrow();
}
// Initialize default order once on load if not already set
if (orderToggle && !orderToggle.dataset.order) {
  applyDefaultOrderForSort(true);
}
const densitySlider = document.getElementById('densitySlider');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
// Image adjustment controls (video filters)
const adjBrightness = document.getElementById('adjBrightness');
const adjContrast = document.getElementById('adjContrast');
const adjSaturation = document.getElementById('adjSaturation');
const adjHue = document.getElementById('adjHue');
const adjVals = {
  brightness: document.getElementById('adjBrightnessVal'),
  contrast: document.getElementById('adjContrastVal'),
  saturation: document.getElementById('adjSaturationVal'),
  hue: document.getElementById('adjHueVal'),
};
const adjResetBtn = document.getElementById('adjResetBtn');
const ADJ_LS_KEY = 'mediaPlayer:videoAdjust';
let adjState = {brightness: 1, contrast: 1, saturation: 1, hue: 0};
try {
  const raw = getLocalStorageItem(ADJ_LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      adjState = {
        ...adjState, ...['brightness', 'contrast', 'saturation', 'hue'].reduce((acc, k) => {
          if (parsed[k] !== undefined && isFinite(parsed[k])) acc[k] = parsed[k];
          return acc;
        }, {}),
      };
    }
  }
}
catch (_) { }
function applyVideoAdjustments() {
  const v = document.getElementById('playerVideo');
  if (!v) return;
  const {brightness, contrast, saturation, hue} = adjState;
  v.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`;
}
function persistAdjustments() {
  try {
    setLocalStorageJSON(ADJ_LS_KEY, adjState);
  }
  catch (_) { }
}
function updateAdjUI(fromLoad = false) {
  if (adjBrightness) adjBrightness.value = String(adjState.brightness);
  if (adjContrast) adjContrast.value = String(adjState.contrast);
  if (adjSaturation) adjSaturation.value = String(adjState.saturation);
  if (adjHue) adjHue.value = String(adjState.hue);
  if (adjVals.brightness) adjVals.brightness.textContent = adjState.brightness.toFixed(2) + 'x';
  if (adjVals.contrast) adjVals.contrast.textContent = adjState.contrast.toFixed(2) + 'x';
  if (adjVals.saturation) adjVals.saturation.textContent = adjState.saturation.toFixed(2) + 'x';
  if (adjVals.hue) adjVals.hue.textContent = adjState.hue.toFixed(0) + '°';
  if (!fromLoad) {
    applyVideoAdjustments();
    persistAdjustments();
  }
}
function wireAdjustments() {
  const hook = (el, key) => {
    if (!el) return;
    if (el._wired) return;
    el._wired = true;
    el.addEventListener('input', () => {
      let val = parseFloat(el.value);
      if (!isFinite(val)) return;
      adjState[key] = val;
      updateAdjUI();
    });
    el.addEventListener('change', () => {
      let val = parseFloat(el.value);
      if (!isFinite(val)) return;
      adjState[key] = val;
      updateAdjUI();
    });
  };
  hook(adjBrightness, 'brightness');
  hook(adjContrast, 'contrast');
  hook(adjSaturation, 'saturation');
  hook(adjHue, 'hue');
  if (adjResetBtn && !adjResetBtn._wired) {
    adjResetBtn._wired = true;
    adjResetBtn.addEventListener('click', () => {
      adjState = {brightness: 1, contrast: 1, saturation: 1, hue: 0};
      updateAdjUI();
    });
  }
  // Apply adjustments after each new video metadata loads
  try {
    const v = document.getElementById('playerVideo');
    if (v && !v._adjMetaWired) {
      v._adjMetaWired = true;
      v.addEventListener('loadedmetadata', () => applyVideoAdjustments());
    }
  }
  catch (_) { }
  updateAdjUI(true); // set slider positions & labels
  applyVideoAdjustments();
}
// Defer wiring until DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAdjustments);
}
else wireAdjustments();
// Preview controls (Settings) unified naming (was hoverPreviewsEnabled)
let previewEnabled = false;
// playback on hover
let previewOnDemandEnabled = false;
// generation on hover
let confirmDeletesEnabled = false;
// user preference for delete confirmations
// Feature flag for on-demand preview generation. Was previously false which prevented
// persistence of the "Generate previews on demand" checkbox even when the
// user enabled it. Enable it so the UI state persists across reloads.
const FEATURE_PREVIEW_ON_DEMAND = true;
// Player timeline display toggles (Settings)
let showHeatmap = true;
// default ON
let showScenes = true;
// default ON
// Selection
const selectionBar = document.getElementById('selectionBar');
const selectionCount = document.getElementById('selectionCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const selectNoneBtn = document.getElementById('selectNoneBtn');
const bulkEditBtn = document.getElementById('bulkEditBtn');
const bulkEditPanel = document.getElementById('bulkEditPanel');
const bulkKindSelect = document.getElementById('bulkKindSelect');
const bulkOpSelect = document.getElementById('bulkOpSelect');
const bulkValueInput = document.getElementById('bulkValueInput');
const bulkApplyBtn = document.getElementById('bulkApplyBtn');
const bulkSuggestions = document.getElementById('bulkSuggestions');
// State
let currentPage = 1;
let totalPages = 1;
let totalFiles = 0;
let infiniteScrollEnabled = true; // user setting default ON
let infiniteScrollSentinel = null;
let infiniteScrollIO = null;
let infiniteScrollLoading = false;
let infiniteScrollUserScrolled = false;
let infiniteScrollPendingInsertion = null; // Promise while new tiles are being inserted
// When layout changes (e.g., density/columns), optionally auto-fill more tiles
// until the viewport overflows so the grid doesn’t look sparse.
let autoFillAfterLayoutChange = false; // disabled by default; no auto-fill loops
// Bounded prefill budget to avoid runaway chaining; used only right after
// density/column changes to ensure at least a scrollable viewport.
let autoFillAfterLayoutChangeBudget = 0;
// Flag to indicate the current reload was triggered by a density change so we
// can bypass the small first-page cap and request an appropriate batch.
let densityReloadPending = false;
// Bottom-trigger infinite scroll enhancements
// Strict mode (requested): ONLY load when user reaches/overscrolls the real bottom.
// No prefill auto-loading;
// if first page doesn't create overflow, user must resize or change density.
const INFINITE_SCROLL_BOTTOM_THRESHOLD = 32; // tighter threshold for "at bottom"
let infiniteScrollLastTriggerHeight = 0; // scrollHeight at last successful trigger
let stablePageSize = null; // locked page size for current browsing session (resets when page=1)
let selectedItems = new Set();
// Suppression flag set when user explicitly resets player to avoid auto-resume of last video
let playerResetSuppressAutoResumeUntil = 0;
let currentDensity = 12;
// Default to 12 (maps to 4 columns)
// Library filter chips state
let libraryTagFilters = [];
let libraryPerformerFilters = [];
let librarySearchTerms = [];
// plain text search tokens (chips)
let autoRandomEnabled = false;
let lastCardHeight = 230; // updated after first render of cards
// Simple density configurations: [legacyPageSize, columns]
// We previously forced rows=3; now we restore variable page sizes using legacyPageSize.
const densityConfigs = [
  [200, 20],
  [180, 18],
  [160, 16],
  [140, 14],
  [120, 12], // default
  [100, 10],
  [90, 9],
  [80, 8],
  [70, 7],
  [60, 6],
  [50, 5],
  [45, 4],
  [40, 3],
  [35, 2],
  [30, 1],
];
// Removed ROWS_PER_PAGE fixed row cap.
// Modal elements
const modal = document.getElementById('modal');
const panel = modal ? modal.querySelector('.panel') : null;
const header = panel ? panel.querySelector('header') : null;
const crumbsEl = header ? header.querySelector('.crumbs') : null;
const body = panel ? panel.querySelector('.body') : null;
const dirlistEl = body ? body.querySelector('.dirlist') : null;
const actions = panel ? panel.querySelector('.actions') : null;
const chooseBtn = actions ? actions.querySelector('#chooseBtn') : null;
const cancelBtn = actions ? actions.querySelector('#cancelBtn') : null;
let pickerPath = '';
// Lightweight image modal for previews
const imgModal = document.getElementById('imgModal');
const imgModalClose = imgModal ? imgModal.querySelector('#imgModalClose') : null;
const imgModalImage = imgModal ? imgModal.querySelector('#imgModalImage') : null;
if (imgModal) {
  imgModal.addEventListener('click', (e) => {
    if (e.target === imgModal) hide(imgModal);
  });
}
if (imgModalClose) {
  imgModalClose.addEventListener('click', () => hide(imgModal));
}
// (fmtSize moved to utils.js)
// Ensure a preview artifact exists for a video record;
// returns a blob URL or empty string.
async function ensurePreview(v) {
  // Goal: avoid generating any 404 network entries. We first consult unified
  // artifact status (cheap, should never 404). Only if it reports preview=true
  // do we attempt to fetch the blob. If preview is absent but on‑demand
  // generation is enabled, we trigger creation and poll status (not the blob)
  // until it reports present, then fetch. No HEAD probes.
  const path = (v && (v.path || v.name)) || '';
  if (!path) return '';
  if (v && v.preview_url) return v.preview_url;
  const qp = encodeURIComponent(path);
  const getStatusForPath = async () => {
    try {
      window.__artifactStatus = window.__artifactStatus || {};
      if (window.__artifactStatus[path]) return window.__artifactStatus[path];
      const u = new URL('/api/artifacts/status', window.location.origin);
      u.searchParams.set('path', path);
      const r = await fetch(u.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && (j.data || j);
      if (d) window.__artifactStatus[path] = d;
      return d || null;
    }
    catch (_) {
      return null;
    }
  };
  const refreshStatus = async () => {
    try {
      const u = new URL('/api/artifacts/status', window.location.origin);
      u.searchParams.set('path', path);
      const r = await fetch(u.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && (j.data || j);
      if (d) window.__artifactStatus[path] = d;
      return d || null;
    }
    catch (_) {
      return null;
    }
  };
  let status = await getStatusForPath();
  // Determine best preview format for this device
  let preferredFmt = 'webm';
  try {
    const probe = document.createElement('video');
    const canWebm = !!probe.canPlayType && probe.canPlayType('video/webm; codecs="vp9,vorbis"');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    // Safari on iOS/macOS historically has limited webm; prefer mp4 there
    if (isIOS) preferredFmt = 'mp4';
    else if (!canWebm || canWebm === 'no') preferredFmt = 'mp4';
  }
  catch (_) { preferredFmt = 'webm'; }
  if (status && status.preview) {
    // Fetch the blob directly (GET). If this 404s (race), we just abort silently.
    try {
  const r = await fetch(`/api/preview?path=${qp}&fmt=${encodeURIComponent(preferredFmt)}`);
      if (!r.ok) return '';
      const blob = await r.blob();
      if (!blob || !blob.size) return '';
      const obj = URL.createObjectURL(blob);
  v.preview_url = obj;
      return obj;
    }
    catch (_) {
      return '';
    }
  }
  // Not present yet.
  if (!status) {
    // Status unknown (not cached);
    // treat as absent for now.
  status = {preview: false};
  }
  // If preview is missing but on-demand generation is enabled, trigger creation
  try {
    if (previewOnDemandEnabled) {
      // Mark UI state for generation
      try {
  const card = document.querySelector(`.card[data-path="${path}"]`);
  if (card) card.classList.add('preview-generating');
      }
      catch (_) { }
      // Trigger creation endpoint if available
      try {
        // Prefer non-blocking background job to avoid tying up the request thread.
        // Fall back to synchronous POST if /api/preview/bg is not available.
        let kicked = false;
        try {
          const bg = new URL('/api/preview/bg', window.location.origin);
          bg.searchParams.set('path', path);
          bg.searchParams.set('fmt', preferredFmt);
          const resp = await fetch(bg.toString(), { method: 'POST' });
          // Accept 200/202 with a job id payload; ignore body either way
          if (resp.ok) kicked = true;
        }
        catch (_) { /* ignore and try sync */ }
        if (!kicked) {
          const u = new URL('/api/preview', window.location.origin);
          u.searchParams.set('path', path);
          u.searchParams.set('fmt', preferredFmt);
          await fetch(u.toString(), { method: 'POST' });
          kicked = true;
        }
        // Poll status for completion (background may take a bit longer)
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 600));
          const s = await refreshStatus();
          if (s && s.preview) {
            try {
              const r = await fetch(`/api/preview?path=${qp}&fmt=${encodeURIComponent(preferredFmt)}`);
              if (!r.ok) break;
              const blob = await r.blob();
              if (blob && blob.size) {
                const obj = URL.createObjectURL(blob);
                v.preview_url = obj;
                try {
                  const card = document.querySelector(`.card[data-path="${path}"]`);
                  if (card) card.classList.remove('preview-generating');
                }
                catch (_) { }
                return obj;
              }
            }
            catch (_) {
              break;
            }
          }
        }
      }
      catch (_) { }
      finally {
        try {
          const card = document.querySelector(`.card[data-path="${path}"]`);
          if (card) card.classList.remove('preview-generating');
        }
        catch (_) { }
      }
    }
  }
  catch (_) { }
  return '';
}
// (fmtDuration moved to utils.js)
// Clean up any existing preview videos except an optional tile we want to keep active
function stopAllTilePreviews(exceptTile) {
  try {
    const tiles = document.querySelectorAll('.card');
    tiles.forEach((t) => {
      if (exceptTile && t === exceptTile) return;
  const video = t.querySelector('video.preview-video');
      if (video) {
        try {
          video.pause();
          video.src = '';
          video.load();
          video.remove();
        }
        catch (_) { }
      }
      t._previewing = false;
      t._previewToken = (t._previewToken || 0) + 1;
      if (t._previewTimer) {
        clearTimeout(t._previewTimer);
        t._previewTimer = null;
      }
    });
  }
  catch (_) { }
}
function videoCard(v) {
  const template = document.getElementById('cardTemplate');
  const el = template.content.cloneNode(true).querySelector('.card');
  // Resolve thumbnail URL: prefer payload-provided URL; fall back to canonical endpoint
  const imgSrc = (v && (v.thumbnail || v.thumb || v.thumbnail_url))
    ? (v.thumbnail || v.thumb || v.thumbnail_url)
    : (v && v.path ? `/api/thumbnail?path=${encodeURIComponent(v.path)}` : '');
  // Duration/size: accept multiple field shapes for robustness
  const durationSecRaw = (v && (v.duration ?? v.dur ?? v.length ?? (v.meta && v.meta.duration) ?? (v.info && v.info.duration))) ?? null;
  const durationSec = Number(durationSecRaw);
  const dur = fmtDuration(Number.isFinite(durationSec) ? durationSec : NaN);
  const sizeRaw = (v && (v.size ?? v.bytes ?? v.filesize)) ?? null;
  const size = fmtSize(Number(sizeRaw));
  const isSelected = selectedItems.has(v.path);
  el.dataset.path = v.path;
  const checkbox = el.querySelector('.card-checkbox');
  if (isSelected) checkbox.classList.add('checked');
  // Make the overlay checkbox interactive and accessible
  try {
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  }
  catch (_) { }
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
  // Updated naming: template now uses .thumbnail-img instead of legacy .thumb
  const img = el.querySelector('.thumbnail-img');
  const thumbWrap = el.querySelector('.thumbnail-wrap');
  // Small helper: ensure /api/thumbnail exists; if not, generate and return cb URL
  async function ensureThumbUrlIfNeeded(url, pathRel) {
    try {
      if (!url || !String(url).startsWith('/api/thumbnail') || !pathRel) return url;
      const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (head.ok) {
        const u = new URL(url, window.location.origin);
        u.searchParams.set('cb', Date.now());
        return u.pathname + '?' + u.searchParams.toString();
      }
      // generate on demand, then return cb url (suppress 404 console errors)
      const gen = await fetch(`/api/thumbnail?path=${encodeURIComponent(pathRel)}&t=middle&quality=2&overwrite=0`, { method: 'POST' }).catch(() => ({ ok: false }));
      if (gen.ok) {
        try { const m = window.__LIB_LAST_METRICS; if (m) m.thumbGen = (m.thumbGen || 0) + 1; }
        catch (_) {}
        const u = new URL(`/api/thumbnail?path=${encodeURIComponent(pathRel)}`, window.location.origin);
        u.searchParams.set('cb', Date.now());
        return u.pathname + '?' + u.searchParams.toString();
      }
    }
    catch (_) {}
    return url;
  }
  // Always start with placeholder visible until the image truly loads to avoid blank flashes.
  img.alt = v.title || v.name;
  const placeholderSvg = el.querySelector('svg.thumbnail-placeholder');
  // Placeholder is now absolutely positioned overlay; class toggles handle fade.
  function markLoaded(el, success) {
    if (success) {
      el.classList.add('loaded');
    }
    else {
      el.classList.remove('loaded');
    }
  }
  // Start in not-loaded state (placeholder visible via CSS)
  el.classList.remove('loaded');
  // Load events: hide placeholder after successful decode
  img.addEventListener('load', () => {
    // Guard: if naturalWidth is 0, treat as failure
    if (!img.naturalWidth || (img.naturalWidth <= 2 && img.naturalHeight <= 2)) {
      markLoaded(el, false);
      return;
    }
    markLoaded(el, true);
    // Metrics: count image load and mark first/all timings
    try {
      const m = window.__LIB_LAST_METRICS;
      if (m) {
        m.imgLoaded = (m.imgLoaded || 0) + 1;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (m.firstImgMs == null) m.firstImgMs = Math.max(0, Math.round(now - m.t0));
        const exp = m.imgExpected || 0;
        if (exp && (m.imgLoaded + (m.imgError || 0)) >= exp && m.allImgsMs == null) {
          m.allImgsMs = Math.max(0, Math.round(now - m.t0));
          try { devLog('info', 'library', 'images', { page: m.page, expected: exp, loaded: m.imgLoaded, errors: (m.imgError||0), firstMs: m.firstImgMs, allMs: m.allImgsMs, requested: m.requested, returned: m.returned, total: m.total }); }
          catch (_) {}
        }
      }
    }
    catch (_) {}
  });
  img.addEventListener('error', async () => {
    markLoaded(el, false);
    try { const m = window.__LIB_LAST_METRICS; if (m) m.imgError = (m.imgError || 0) + 1; }
    catch (_) {}
    // Attempt on-demand thumbnail generation once per card to heal 404s
    try {
      if (el._thumbGenTried) return;
      el._thumbGenTried = true;
      const p = el.dataset.path || v.path || '';
      if (!p) return;
      const enc = encodeURIComponent(p);
      // Generate thumbnail synchronously (server endpoint performs work inline)
      const genUrl = `/api/thumbnail?path=${enc}&t=middle&quality=2&overwrite=0`;
      const r = await fetch(genUrl, { method: 'POST' }).catch(() => ({ ok: false }));
      if (!r.ok) return;
      try { const m = window.__LIB_LAST_METRICS; if (m) m.thumbGen = (m.thumbGen || 0) + 1; }
      catch (_) {}
      // Retry load with cache buster (suppress console error if still 404)
      const base = `/api/thumbnail?path=${enc}`;
      const retry = `${base}&cb=${Date.now()}`;
      try { img.loading = 'eager'; }
      catch (_) {}
      // Set a flag to suppress error logging for this retry attempt
      img._retryAttempt = true;
      img.src = retry;
    }
    catch (_) {}
  });
  // Defer assigning src for non-eager tiles to reduce main thread contention.
  // We attach data attributes for deferred meta computation as well.
  el.dataset.w = String(v.width || '');
  el.dataset.h = String(v.height || '');
  el.dataset.name = String(v.title || v.name || '');
  if (imgSrc) {
    if (window.__TILE_EAGER_COUNT === undefined) window.__TILE_EAGER_COUNT = 0;
    // On mobile, load a few more eagerly to avoid waiting for intersections that may be delayed
    const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const eagerLimit = window.__TILE_EAGER_LIMIT || (isMobile ? 24 : 16); // configurable global
    const eager = window.__TILE_EAGER_COUNT < eagerLimit;
    if (eager) {
      window.__TILE_EAGER_COUNT++;
      try { img.loading = 'eager'; }
      catch (_) {}
      // Preflight /api/thumbnail and auto-generate if needed
      (async () => {
        const finalUrl = await ensureThumbUrlIfNeeded(imgSrc, v?.path);
        img.src = finalUrl || imgSrc;
      })();
    }
    else {
      // For deferred loads, keep the original URL but IntersectionObserver will preflight on set
      img.dataset.src = imgSrc;
      // Will be set when intersecting (observer installed below)
      if (window.__tileIO) {
        try {
          window.__tileIO.observe(img);
        }
        catch (_) { /* noop */ }
      }
    }
  }
  else {
    markLoaded(el, false);
  }
  // Resolution / quality badge: prefer height (common convention)
  // Defer quality / resolution overlay population until element intersects viewport (reduces synchronous cost).
  el._needsMeta = true;
  // Add video preview functionality
  el.addEventListener('mouseenter', async () => {
    if (!previewEnabled) return;
    // Stop any other tile's preview video before starting this one
    stopAllTilePreviews(el);
    // Track tokens to avoid late insert after mouse leaves
    const token = (el._previewToken || 0) + 1;
    el._previewToken = token;
    el._previewing = true;
  const url = await ensurePreview(v);
  if (v && v.preview_url) return v.preview_url;
    // If no preview exists, don't swap out the thumbnail
    if (!url) return;
  if (!el._previewing || el._previewToken !== token) return;
  // Double-check no other tiles are showing previews
    stopAllTilePreviews(el);
  const video = document.createElement('video');
  // Use updated class naming so sizing rules (thumbnail-img) still apply to the preview element.
  // Keep a distinct marker class for potential styling (.preview-video) without relying on removed .thumb class.
  video.className = 'thumbnail-img preview-video';
    video.src = url;
  video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
  try { video.setAttribute('playsinline', ''); }
  catch (_) {}
  try { video.disablePictureInPicture = true; }
  catch (_) {}
    video.style.pointerEvents = 'none';
    // Replace the thumbnail with the video
    if (img) img.replaceWith(video);
    try {
      await video.play();
    }
    catch (_) { }
  });
  function restoreThumbnail() {
    const vid = el.querySelector('video.preview-video');
    if (!vid) return;
    try {
      vid.pause();
    }
    catch (_) { }
    try {
      vid.src = '';
      vid.load();
    }
    catch (_) { }
    // Put original <img> back (it still exists in closure even after replaceWith)
    if (img && !img.parentNode) {
      vid.replaceWith(img);
    }
    else if (img && vid.parentNode) {
      vid.parentNode.replaceChild(img, vid);
    }
    else {
      // Fallback: remove video if img reference lost
      vid.remove();
    }
    // Show placeholder if no thumbnail source
    if (!imgSrc) el.classList.remove('loaded');
    else el.classList.add('loaded');
  }
  el.addEventListener('mouseleave', () => {
    el._previewing = false;
    el._previewToken = (el._previewToken || 0) + 1;
    if (el._previewTimer) {
      clearTimeout(el._previewTimer);
      el._previewTimer = null;
    }
    restoreThumbnail();
  });
  const title = el.querySelector('.title');
  title.textContent = v.title || v.name;
  title.title = v.title || v.name;
  // Create per-video route anchors for image and title
  try {
    const enc = encodeURIComponent(v.path || '');
    const href = `#player/v/${enc}`;
    // Wrap thumbnail area in a link
    if (thumbWrap && !thumbWrap.closest('a')) {
      const aImg = document.createElement('a');
      aImg.href = href;
      aImg.className = 'tile-link tile-link--image';
      // Stop bubbling to card click/selection, but allow default navigation
      aImg.addEventListener('click', (e) => { e.stopPropagation(); });
      thumbWrap.parentNode.replaceChild(aImg, thumbWrap);
      aImg.appendChild(thumbWrap);
    }
    // Make title clickable with the same link
    if (title && !title.querySelector('a')) {
      const aTitle = document.createElement('a');
      aTitle.href = href;
      aTitle.className = 'tile-link tile-link--title';
      aTitle.textContent = title.textContent || '';
      aTitle.title = title.title || '';
      aTitle.addEventListener('click', (e) => { e.stopPropagation(); });
      // Replace title's text with the anchor
      title.textContent = '';
      title.appendChild(aTitle);
    }
  }
  catch (_) {}
  el.querySelector('.duration').textContent = dur;
  el.querySelector('.size').textContent = size;
  el.addEventListener('click', (event) => {
    handleCardClick(event, v.path);
  });
  return el;
}
// -----------------------------
// Deferred tile metadata & lazy loading observer setup (runs once)
// -----------------------------
if (!window.__tileIO) {
  try {
    const computeTileMeta = (card) => {
      if (!card || !card._needsMeta) return;
      card._needsMeta = false;
      try {
        const w = Number(card.dataset.w || '');
        const h = Number(card.dataset.h || '');
        const name = String(card.dataset.name || '');
        const q = card.querySelector('.quality-badge');
        const overlay = card.querySelector('.overlay-info');
        const overlayRes = overlay ? overlay.querySelector('.overlay-resolution') : null;
        const durEl = card.querySelector('.duration');
        let label = '';
        const pickByHeight = (hh) => {
          if (!Number.isFinite(hh) || hh <= 0) return '';
          if (hh >= 2160) return '2160p';
          if (hh >= 1440) return '1440p';
          if (hh >= 1080) return '1080p';
          if (hh >= 720) return '720p';
          if (hh >= 480) return '480p';
          if (hh >= 360) return '360p';
          if (hh >= 240) return '240p';
          return '';
        };
        const pickByWidth = (ww) => {
          if (!Number.isFinite(ww) || ww <= 0) return '';
          if (ww >= 3840) return '2160p';
          if (ww >= 2560) return '1440p';
          if (ww >= 1920) return '1080p';
          if (ww >= 1280) return '720p';
          if (ww >= 854) return '480p';
          if (ww >= 640) return '360p';
          if (ww >= 426) return '240p';
          return '';
        };
        label = pickByHeight(h) || pickByWidth(w);
        if (!label && name) {
          const lower = name.toLowerCase();
          if (/\b(2160p|4k|uhd)\b/.test(lower)) label = '2160p';
          else if (/\b1440p\b/.test(lower)) label = '1440p';
          else if (/\b1080p\b/.test(lower)) label = '1080p';
          else if (/\b720p\b/.test(lower)) label = '720p';
          else if (/\b480p\b/.test(lower)) label = '480p';
          else if (/\b360p\b/.test(lower)) label = '360p';
          else if (/\b240p\b/.test(lower)) label = '240p';
        }
        if (q) {
          q.textContent = label || '';
          hide(q); // prefer overlay variant
          try {
            q.setAttribute('aria-hidden', label ? 'false' : 'true');
          }
          catch (_) { }
        }
        if (overlay && overlayRes) {
          if (label) {
            overlayRes.textContent = label;
            showAs(overlay, 'inline-flex');
            try {
              overlay.setAttribute('aria-hidden', 'false');
            }
            catch (_) { }
          }
          else {
            hide(overlay);
            try {
              overlay.setAttribute('aria-hidden', 'true');
            }
            catch (_) { }
          }
        }
        // Lazy duration fix: if duration text is empty or "0:00", fetch media info once for this path
        try {
          const currentText = durEl ? String(durEl.textContent || '').trim() : '';
          const path = card.dataset.path || '';
          if (durEl && path && (!currentText || currentText === '0:00')) {
            window.__durCache = window.__durCache || new Map();
            window.__durPending = window.__durPending || new Set();
            if (window.__durCache.has(path)) {
              const sec = window.__durCache.get(path);
              if (Number.isFinite(sec)) durEl.textContent = fmtDuration(Number(sec));
            }
            else if (!window.__durPending.has(path)) {
              window.__durPending.add(path);
              fetch(`/api/media/info?path=${encodeURIComponent(path)}`, {headers: {Accept: 'application/json'}})
                .then((r) => r.ok ? r.json() : null)
                .catch(() => null) // Suppress console errors for missing info
                .then((j) => {
                  const sec = (j && (j.duration ?? j?.data?.duration)) || 0;
                  if (Number.isFinite(Number(sec)) && Number(sec) > 0) {
                    window.__durCache.set(path, Number(sec));
                    durEl.textContent = fmtDuration(Number(sec));
                  }
                })
                .catch(() => {})
                .finally(() => {
                  try { window.__durPending.delete(path); }
                  catch (_) {}
                });
            }
          }
        }
        catch (_) { }
        card._metaApplied = true;
      }
      catch (_) { }
    };
    window.__computeTileMeta = computeTileMeta;
    // Prefer viewport root for broad compatibility. If the library panel is an actual
    // scroll container (content taller than its client height), use it; otherwise fall back
    // to the viewport so mobile/body scrolling still triggers intersections.
    let rootEl = null;
    try {
      const rp = document.getElementById('library-panel');
      if (rp && rp.scrollHeight > (rp.clientHeight + 4)) rootEl = rp;
    }
    catch (_) {}
    window.__tileIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const node = e.target;
        const card = node.closest('.card');
        if (card && card._needsMeta) computeTileMeta(card);
        if (node.dataset && node.dataset.src && !node.src) {
          // Preflight and possibly generate for /api/thumbnail URLs before assigning
          const src = node.dataset.src;
          const cardPath = card ? card.dataset.path : '';
          const setSrc = async () => {
            try {
              const docOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : undefined;
              if (src && String(src).startsWith('/api/thumbnail') && cardPath) {
                const headResp = await fetch(src, { method: 'HEAD', cache: 'no-store' }).catch(() => ({ ok: false }));
                let exists = false;
                try {
                  const h = headResp && headResp.headers && typeof headResp.headers.get === 'function' ? headResp.headers.get('x-thumbnail-exists') : null;
                  if (h === '1' || h === '0') {
                    exists = (h === '1');
                  }
                  else {
                    // Back-compat with older server: fall back to HTTP ok
                    exists = !!headResp.ok;
                  }
                }
                catch (_) {
                  exists = !!headResp.ok;
                }
                if (!exists) {
                  await fetch(`/api/thumbnail?path=${encodeURIComponent(cardPath)}&t=middle&quality=2&overwrite=0`, { method: 'POST' }).catch(() => ({ ok: false }));
                }
                const u = new URL(`/api/thumbnail?path=${encodeURIComponent(cardPath)}`, docOrigin);
                u.searchParams.set('cb', Date.now());
                node.src = u.pathname + '?' + u.searchParams.toString();
              }
              else {
                node.src = src;
              }
            }
            catch (_) { node.src = src; }
          };
          setSrc();
        }
        try {
          window.__tileIO.unobserve(node);
        }
        catch (_) { }
      }
    }, {root: rootEl, rootMargin: '250px 0px', threshold: 0.01});
  }
  catch (_) { }
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
    currentPage = 1;
    // Reset to first page when navigating to a folder
    loadLibrary();
  });
  el.addEventListener('dblclick', () => {
    folderInput.value = dpath;
    currentPage = 1;
    // Reset to first page when navigating to a folder
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
let __libLoading = false;
let __libReloadRequested = false;
async function loadLibrary() {
  if (__libLoading) {
    try { devLog('debug', 'library', 'coalesce'); }
    catch (_) {}
    __libReloadRequested = true;
    return;
  }
  __libLoading = true;
  try {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Initialize a fresh metrics batch for this load (console-visible)
    try {
      window.__LIB_BATCH_SEQ = (window.__LIB_BATCH_SEQ || 0) + 1;
      const batchId = window.__LIB_BATCH_SEQ;
      const m = {
        id: batchId,
        t0,
        page: currentPage,
        requested: null,
        returned: 0,
        total: null,
        imgExpected: 0,
        imgLoaded: 0,
        imgError: 0,
        thumbGen: 0,
        firstImgMs: null,
        allImgsMs: null,
      };
      window.__LIB_LAST_METRICS = m;
    }
    catch (_) {}
  const isAppend = infiniteScrollEnabled && currentPage > 1;
    if (!isAppend) {
      hide(statusEl);
      showAs(spinner, 'block');
      hide(grid);
      // Reset stable page size snapshot when starting a new sequence
      stablePageSize = null;
    }
    else {
      // Append mode: keep current tiles visible; show lightweight busy state on sentinel
      if (infiniteScrollSentinel) {
        infiniteScrollSentinel.textContent = 'Loading…';
        infiniteScrollSentinel.style.fontSize = '11px';
        infiniteScrollSentinel.style.textAlign = 'center';
        infiniteScrollSentinel.style.color = '#778';
      }
    }
  // Build endpoint robustly without depending on window.location.origin (which can be 'null' under file://)
    const params = new URLSearchParams();
    // Lock page size after first computation so subsequent pages add a consistent count
    let pageSize;
    if (currentPage === 1 || !stablePageSize) {
      pageSize = applyColumnsAndComputePageSize();
      // First-page behavior:
      // - Normal initial load: keep a small cap (fast paint)
      // - Density-change reload: use a larger but still bounded cap so we
      //   don’t fetch an excessively large batch that collapses pagination
      //   and disables infinite scroll.
      if (!densityReloadPending) {
        try {
          const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
          const firstPageCap = isMobile ? 24 : 12;
          if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = firstPageCap;
          // Force-cap the first page regardless of density to avoid loading too many items initially
          pageSize = Math.min(firstPageCap, Math.max(1, Math.floor(pageSize)));
        }
        catch (_) {
          pageSize = 12;
        }
      }
      else {
        // Density reload: clamp to a moderate size so columns fill, but keep
        // enough pages remaining for infinite scroll to function.
        try {
          const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
          const maxFirst = isMobile ? 36 : 60; // moderate upper bound
          if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = maxFirst;
          pageSize = Math.min(maxFirst, Math.max(1, Math.floor(pageSize)));
        }
        catch (_) {
          pageSize = 48;
        }
      }
      stablePageSize = pageSize;
      try { if (window.__LIB_LAST_METRICS) window.__LIB_LAST_METRICS.requested = pageSize; }
      catch (_) {}
    }
    else {
      // Still update columns (visual responsiveness) but ignore new dynamic size
      applyColumnsAndComputePageSize();
      pageSize = stablePageSize;
    }
    // Safety clamp: never request 0 items (some servers will return empty results)
    try {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      const minSize = isMobile ? 24 : 12;
      if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = minSize;
      pageSize = Math.max(1, Math.floor(pageSize));
    }
    catch (_) { pageSize = 12; }
  params.set('page', String(currentPage));
  // In infinite scroll mode, still request page-sized chunks (server handles page param)
  params.set('page_size', String(pageSize));
    // Honor server-supported sorts chosen via header double-click even if not present in <select>
    const SERVER_SORT_MAP = {
      name: 'name', size: 'size', mtime: 'date', date: 'date', created: 'created',
      width: 'width', height: 'height', duration: 'duration', bitrate: 'bitrate', vcodec: 'vcodec', acodec: 'acodec', format: 'format', ext: 'ext'
    };
    const overrideFromSortState = (() => {
      try { return (sortState && sortState.id && SERVER_SORT_MAP[sortState.id]) ? SERVER_SORT_MAP[sortState.id] : null; }
      catch(_) { return null; }
    })();
    params.set('sort', overrideFromSortState || (sortSelect.value || 'date'));
    params.set('order', orderToggle.dataset.order || 'desc');
    // Resolution filter
    const resSel = document.getElementById('resSelect');
    const resVal = resSel ? String(resSel.value || '') : '';
    if (resVal) params.set('res_min', resVal);
    // Add search and filter parameters
    const searchVal = computeSearchVal();
    if (searchVal) params.set('search', searchVal);
    const val = (folderInput.value || '').trim();
    const p = currentPath();
    // Only set a relative path; ignore absolute values (those represent the root itself)
    if (val && !isAbsolutePath(val) && p) params.set('path', p);
    // Tag / performer filter chips
    if (libraryTagFilters.length) {
      params.set('tags', libraryTagFilters.join(','));
    }
    if (libraryPerformerFilters.length) {
      params.set('performers', libraryPerformerFilters.join(','));
    }
  const endpoint = '/api/library' + (params.toString() ? ('?' + params.toString()) : '');
  try { devLog('info', 'library', 'request', { page: currentPage, pageSize, path: (currentPath()||''), sort: (overrideFromSortState || sortSelect.value || 'date'), order: (orderToggle.dataset.order||'desc') }); }
  catch (_) {}
    const res = await fetch(endpoint, {headers: {Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    // Accept multiple backend response shapes:
    // 1) {status:'success', data:{files, dirs, ...}}
    // 2) {files, dirs, ...}
    // 3) [ {..file..}, ... ]
    let data;
    if (Array.isArray(payload)) {
      data = { files: payload, dirs: [] };
    }
    else if (payload && typeof payload === 'object') {
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        if (payload.status && String(payload.status).toLowerCase() !== 'success') {
          throw new Error(payload?.message || 'Unexpected response');
        }
        data = payload.data || {};
      }
      else {
        data = payload;
      }
    }
    else {
      data = { files: [], dirs: [] };
    }
  let files = Array.isArray(data.files) ? data.files : [];
    const dirs = Array.isArray(data.dirs) ? data.dirs : [];
  // Update pagination info (backend may currently return all files due to pagination regression)
    const effectivePageSize = pageSize; // keep consistent with request
    // If backend reported counts, trust them;
    // else derive client-side with heuristics that avoid duplicate/reset issues
    if (data.total_pages && data.total_files) {
      totalPages = data.total_pages;
      totalFiles = data.total_files;
      currentPage = data.page || currentPage;
    }
    else {
      // Heuristic:
      // - If server returned more than requested page size, it likely returned
      //   the full (or large) list; do client-side slicing and compute totals.
      // - If it returned <= requested size, assume the server already paginated.
      //   Do NOT recompute totals from this page; instead, infer whether there
      //   may be more pages based on whether we received a full page.
      if (Array.isArray(files) && files.length > effectivePageSize) {
        // Unpaginated response: slice client-side
        totalFiles = files.length;
        totalPages = Math.max(1, Math.ceil(totalFiles / effectivePageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * effectivePageSize;
        const end = start + effectivePageSize;
        files = files.slice(start, end);
      }
      else {
        // Server-paginated response: keep or extend totals heuristically
        // Maintain a monotonic totalPages so append logic doesn't clamp back to 1
        const fullPage = Array.isArray(files) && files.length >= effectivePageSize;
        if (currentPage === 1) {
          totalPages = fullPage ? 2 : 1; // there might be more if we got a full page
          totalFiles = Math.max(totalFiles, files.length);
        }
        else {
          // If we got a short page, treat as last page; otherwise expect more
          totalPages = fullPage ? Math.max(totalPages, currentPage + 1) : currentPage;
          totalFiles = Math.max(totalFiles, (currentPage - 1) * effectivePageSize + files.length);
        }
      }
    }
    // If backend returned more than requested (pagination disabled server-side),
    // we already sliced above in the unpaginated branch. Avoid blunt trimming here
    // as it would wrongly re-trim paginated pages when currentPage>1.
    // Client-side log of how many items we got vs expected
    try {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const elapsed = Math.max(0, Math.round(t1 - t0));
      const total = Number.isFinite(data.total_files) ? data.total_files : (Array.isArray(data.files) ? data.files.length : 0);
      devLog('info', 'library', 'response', { page: currentPage, requested: effectivePageSize, returned: (files ? files.length : 0), total, elapsedMs: elapsed });
      try { if (window.__LIB_LAST_METRICS) { window.__LIB_LAST_METRICS.returned = (files ? files.length : 0); window.__LIB_LAST_METRICS.total = total; } }
      catch (_) {}
    }
    catch (_) {}
    // Update pagination / infinite scroll UI
    if (infiniteScrollEnabled) {
      const effectiveSize = stablePageSize || applyColumnsAndComputePageSize();
      const shown = Math.min(totalFiles, currentPage * effectiveSize);
      pageInfo.textContent = `${shown} of ${totalFiles}`;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
    else {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalFiles} files)`;
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
    }
    if (!infiniteScrollEnabled || !isAppend) {
      grid.innerHTML = '';
    }
  if (files.length === 0) {
      // When searching, do not auto-fill from subfolders;
      // show no results instead
      if (dirs.length > 0 && !searchVal) {
        // Render folders first for navigation
        for (const d of dirs) grid.appendChild(dirCard(d));
        // Then fetch videos from up to N subfolders, respecting current sort/order
        const MAX_DIRS = 8;
        const MAX_TILES = 60;
        const subdirs = dirs.slice(0, MAX_DIRS);
        const combined = [];
        const curSort = sortSelect.value || 'date';
        const curOrder = orderToggle.dataset.order || 'desc';
        // Kick off fetches in parallel
        await Promise.all(
          subdirs.map(async (d) => {
            const dpath = d.path || d.name || '';
            if (!dpath) return;
            try {
              const sp = new URLSearchParams();
              sp.set('path', dpath);
              sp.set('page', '1');
              sp.set('page_size', String(Math.min(48, MAX_TILES)));
              sp.set('sort', curSort);
              sp.set('order', curOrder);
              // Include resolution filter in fallback fetches
              const resSel = document.getElementById('resSelect');
              const resVal = resSel ? String(resSel.value || '') : '';
              if (resVal) sp.set('res_min', resVal);
              const u = '/api/library?' + sp.toString();
              const r = await fetch(u, {
                headers: {Accept: 'application/json' },
              });
              if (!r.ok) return;
              const pl = await r.json();
              const f2 = Array.isArray(pl?.data?.files) ? pl.data.files : [];
              for (const f of f2) combined.push(f);
            }
            catch (_) { }
          }),
        );
        // Client-side sort across aggregated results for a consistent order
        const rev = curOrder === 'desc';
        if (curSort === 'name') {
          combined.sort(
            (a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()) * (rev ? -1 : 1),
          );
        }
        else if (curSort === 'size') {
          combined.sort((a, b) => ((a.size || 0) - (b.size || 0)) * (rev ? -1 : 1));
        }
        else if (curSort === 'random') {
          for (let i = combined.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [combined[i], combined[j]] = [combined[j], combined[i]];
          }
        }
        else {
          // date or default
          combined.sort((a, b) => ((a.mtime || 0) - (b.mtime || 0)) * (rev ? -1 : 1));
        }
        // Render up to MAX_TILES
        let shown = 0;
        for (const f of combined) {
          if (shown >= MAX_TILES) break;
          grid.appendChild(videoCard(f));
          shown++;
        }
        hide(spinner);
        show(grid);
        return;
      }
      else {
        hide(spinner);
        statusEl.className = files.length === 0 && searchVal ? 'empty' : 'empty';
  // Try a one-shot relaxed fetch: drop resolution and search filters to populate some content
  // Skip when tag or performer chips are active (user expects exact matches)
  if (!searchVal && (!Array.isArray(libraryTagFilters) || libraryTagFilters.length === 0) && (!Array.isArray(libraryPerformerFilters) || libraryPerformerFilters.length === 0)) {
          try {
            const sp2 = new URLSearchParams();
            sp2.set('page', '1');
            sp2.set('page_size', String(Math.max(24, applyColumnsAndComputePageSize() || 24)));
            {
              const override2 = (sortState && sortState.id && SERVER_SORT_MAP[sortState.id]) ? SERVER_SORT_MAP[sortState.id] : null;
              sp2.set('sort', override2 || (sortSelect.value || 'date'));
            }
            sp2.set('order', orderToggle.dataset.order || 'desc');
            const u2 = '/api/library?' + sp2.toString();
            const r2 = await fetch(u2, { headers: { Accept: 'application/json' } });
            if (r2.ok) {
              const pl2 = await r2.json();
              let d2;
              if (Array.isArray(pl2)) d2 = { files: pl2 };
              else if (pl2 && typeof pl2 === 'object') d2 = pl2.data || pl2;
              else d2 = { files: [] };
              const f2 = Array.isArray(d2.files) ? d2.files : [];
              if (f2.length) {
                grid.innerHTML = '';
                const nodes2 = f2.slice(0, Math.max(24, applyColumnsAndComputePageSize() || 24)).map(videoCard);
                const frag2 = document.createDocumentFragment();
                nodes2.forEach((n) => frag2.appendChild(n));
                grid.appendChild(frag2);
                hide(statusEl);
                show(grid);
                return;
              }
            }
          }
          catch (_) {}
        }
        // Build and render empty state with active filters and a Clear button
        try {
          const resSel = document.getElementById('resSelect');
          const resVal = resSel ? String(resSel.value || '') : '';
          const activeFilters = [];
          // Search terms
          if (Array.isArray(librarySearchTerms) && librarySearchTerms.length) {
            for (const t of librarySearchTerms) activeFilters.push(`“${String(t)}”`);
          }
          // Live input (uncommitted) for visibility
          const live = (unifiedInput && unifiedInput.value || '').trim();
          if (live && !live.startsWith('#') && !live.startsWith('@')) activeFilters.push(`“${live}”`);
          // Tags
          if (Array.isArray(libraryTagFilters) && libraryTagFilters.length) {
            for (const tag of libraryTagFilters) activeFilters.push(`#${tag}`);
          }
          // Performers
          if (Array.isArray(libraryPerformerFilters) && libraryPerformerFilters.length) {
            for (const pf of libraryPerformerFilters) activeFilters.push(`@${pf}`);
          }
          // Resolution
          if (resVal) {
            // Show the selected option text if possible
            let label = resVal;
            try {
              const opt = resSel.options[resSel.selectedIndex];
              if (opt && opt.text) label = opt.text;
            }
            catch (_) {}
            activeFilters.push(label);
          }
          const hasFilters = activeFilters.length > 0;
          const msg = searchVal ? 'No results match your search.' : 'No videos found.';
          const chips = hasFilters ? `<div class="empty-filters" aria-label="Active filters">${activeFilters.map((f) => `<span class="empty-chip">${f}</span>`).join('')}</div>` : '';
          const btn = hasFilters ? `<div class="mt-12"><button id="clearFiltersBtn" class="btn-sm" type="button" aria-label="Clear filters">Clear filters</button></div>` : '';
          statusEl.innerHTML = `<div class="empty-state">${msg}${chips}${btn}</div>`;
          showAs(statusEl, 'block');
          // Wire the button once
          const clearBtn = document.getElementById('clearFiltersBtn');
          if (clearBtn && !clearBtn._wired) {
            clearBtn._wired = true;
            clearBtn.addEventListener('click', () => {
              try {
                // Clear search input and chips
                if (unifiedInput) unifiedInput.value = '';
                librarySearchTerms = [];
                libraryTagFilters = [];
                libraryPerformerFilters = [];
                // Reset resolution
                const rs = document.getElementById('resSelect');
                if (rs) rs.value = '';
                // Persist + re-render chip UI if helpers exist
                if (typeof persistLibraryFilters === 'function') persistLibraryFilters();
                if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
                if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
              }
              catch (_) {}
              currentPage = 1;
              loadLibrary();
            });
          }
        }
        catch (__) {
          statusEl.textContent = searchVal ? 'No results match your search.' : 'No videos found.';
          showAs(statusEl, 'block');
        }
        hide(grid);
        return;
      }
    }
    // Progressive tile insertion (improves responsiveness for large sets)
    const nodes = files.map(videoCard);
    // Attach expected image count to current metrics batch and set a timeout fallback
    try {
      if (window.__LIB_LAST_METRICS) {
        window.__LIB_LAST_METRICS.imgExpected = nodes.length;
        const mRef = window.__LIB_LAST_METRICS;
        // If all images haven't loaded within 10s, emit a timeout summary for diagnostics
        setTimeout(() => {
          try {
            if (!mRef) return;
            const exp = mRef.imgExpected || 0;
            const done = (mRef.imgLoaded || 0) + (mRef.imgError || 0);
            if (exp && !mRef.allImgsMs && done < exp) {
              devLog('warn', 'library', 'images-timeout', { page: mRef.page, expected: exp, loaded: (mRef.imgLoaded||0), errors: (mRef.imgError||0), requested: mRef.requested, returned: mRef.returned, total: mRef.total, timeoutMs: 10000 });
            }
          }
          catch (_) {}
        }, 10000);
      }
    }
    catch (_) {}
    const BATCH = 48;
    let i = 0;
    hide(statusEl);
    if (!isAppend) hide(spinner);
    if (!infiniteScrollEnabled || currentPage === 1) {
      grid.innerHTML = '';
    }
    // Mark insertion pending so infinite scroll won't trigger another page mid-insert
    if (!infiniteScrollPendingInsertion) {
      infiniteScrollPendingInsertion = new Promise((resolve) => {
        grid._resolveInsertion = resolve;
      });
    }
    function finishInsertion() {
      if (grid._resolveInsertion) {
        try {
          grid._resolveInsertion();
        }
        catch (_) { }
        delete grid._resolveInsertion;
      }
      infiniteScrollPendingInsertion = null;
    }
    function insertBatch() {
      const frag = document.createDocumentFragment();
      const start = i;
      for (; i < nodes.length && i < start + BATCH; i++) {
        frag.appendChild(nodes[i]);
      }
      grid.appendChild(frag);
      if (i < nodes.length) {
        if (window.requestIdleCallback) {
          requestIdleCallback(insertBatch, {timeout: 120});
        }
        else {
          requestAnimationFrame(insertBatch);
        }
      }
      else {
        // Finished
        requestAnimationFrame(() => {
          const c = grid.querySelector('.card');
          if (c) {
            const h = c.getBoundingClientRect().height;
            if (h && isFinite(h) && h > 50) {
              lastCardHeight = h;
            }
          }
          enforceGridSideSpacing();
          finishInsertion();
          // Finished inserting; do not auto-trigger next page. User must reach bottom again.
          // Bounded prefill: when re-rendering after a density change and we
          // still have no vertical scroll, load up to N more pages to create
          // overflow. This avoids the “stuck at 3 rows” problem while
          // preventing unbounded loading.
          if (infiniteScrollEnabled && densityReloadPending && !hasVerticalScroll() && currentPage < totalPages && autoFillAfterLayoutChangeBudget > 0) {
            autoFillAfterLayoutChangeBudget -= 1;
            currentPage += 1;
            setTimeout(() => {
              try { loadLibrary(); }
            catch (_) {} }, 0);
          }
          else {
            densityReloadPending = false;
            autoFillAfterLayoutChangeBudget = 0;
          }
        });
      }
      if (grid.classList.contains('hidden')) show(grid);
      if (infiniteScrollEnabled) setupInfiniteScrollSentinel();
      if (infiniteScrollSentinel) infiniteScrollSentinel.textContent = '';
      // No eager chain trigger here (strict bottom-only mode).
    }
    if (nodes.length <= BATCH) {
      const frag = document.createDocumentFragment();
      nodes.forEach((n) => frag.appendChild(n));
      grid.appendChild(frag);
      show(grid);
      requestAnimationFrame(() => enforceGridSideSpacing());
      finishInsertion();
      // Do not auto-trigger; wait for explicit bottom overscroll.
      // Bounded prefill (single-batch path)
      if (infiniteScrollEnabled && densityReloadPending && !hasVerticalScroll() && currentPage < totalPages && autoFillAfterLayoutChangeBudget > 0) {
        autoFillAfterLayoutChangeBudget -= 1;
        currentPage += 1;
        setTimeout(() => {
          try { loadLibrary(); }
        catch (_) {} }, 0);
      }
      else {
        densityReloadPending = false;
        autoFillAfterLayoutChangeBudget = 0;
      }
    }
    else {
      if (window.requestIdleCallback) requestIdleCallback(insertBatch, {timeout: 80});
      else requestAnimationFrame(insertBatch);
    }
    if (infiniteScrollEnabled) {
      setupInfiniteScrollSentinel();
      if (infiniteScrollSentinel) infiniteScrollSentinel.textContent = '';
      // No consolidated trigger; bottom overscroll only.
    }
  }
  catch (e) {
    console.error('Library loading error:', e);
    hide(spinner);
    statusEl.className = 'error';
    statusEl.textContent = 'Failed to load library.';
    showAs(statusEl, 'block');
    hide(grid);
  }
  finally {
    __libLoading = false;
    if (__libReloadRequested) {
      __libReloadRequested = false;
      setTimeout(() => {
        try { loadLibrary(); }
      catch (_) {} }, 0);
    }
  }
}
// One-time capability check to decide if we should attempt SSE at all (avoids blind 404 probes)
(async () => {
  if (!window.__JOBS_SSE_ENABLED) return;
  if (window.__JOBS_SSE_UNAVAILABLE) return;
  // already decided
  try {
    const res = await fetch('/config', {cache: 'no-store' });
    if (!res.ok) return;
    const cfg = await res.json();
    const has = Boolean(cfg && cfg.features && cfg.features.jobs_sse);
    if (!has) {
      window.__JOBS_SSE_UNAVAILABLE = true;
    }
  }
  catch (_) { }
})();
// -----------------------------
// Simple Accordion Wiring (robust, minimal)
// Ensures the sidebar accordion works even when other modules aren't active.
(function wireSimpleAccordion() {
  function init() {
    const root = document.getElementById('sidebarAccordion');
    if (!root) return;
    const LS_KEY = 'mediaPlayer:sidebarAccordionState';
    const items = Array.from(root.querySelectorAll('.acc-item'));
    const loadState = () => {
      try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      }
      catch (_) {
        return {};
      }
    };
    const saveState = (st) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(st));
      }
      catch (_) { }
    };
    let state = loadState();
    items.forEach((it, idx) => {
      const hdr = it.querySelector('.acc-header');
      const panel = it.querySelector('.acc-panel');
      if (!hdr || !panel) return;
      // (SVG caret is embedded in the HTML markup now;
      // no runtime injection required)
      const key = it.getAttribute('data-key') || String(idx);
      const open = Object.prototype.hasOwnProperty.call(state, key) ? Boolean(state[key]) : hdr.getAttribute('aria-expanded') === 'true';
      hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.classList.toggle('hidden', !open);
      if (open) {
        it.classList.add('open');
        panel.classList.add('open');
      }
      else {
        it.classList.remove('open');
        panel.classList.remove('open');
      }
      // Idempotent guard
      if (hdr._simpleAccordionWired) return;
      hdr._simpleAccordionWired = true;
      function toggleAccordionHeader() {
        // Re-sync if attribute and DOM got out of sync (e.g. user reported arrow down but panel closed)
        const attrOpen = hdr.getAttribute('aria-expanded') === 'true';
        const panelHidden = panel.classList.contains('hidden');
        let currentlyOpen = attrOpen && !panelHidden;
        if (attrOpen && panelHidden) {
          // Force open instead of toggling closed (desync fix)
          currentlyOpen = false;
        }
        if (!currentlyOpen) {
          items.forEach((other) => {
            if (other === it) return;
            const oh = other.querySelector('.acc-header');
            const op = other.querySelector('.acc-panel');
            if (oh && op) {
              oh.setAttribute('aria-expanded', 'false');
              op.classList.add('hidden');
              other.classList.remove('open');
              op.classList.remove('open');
            }
          });
        }
        const now = !currentlyOpen;
        hdr.setAttribute('aria-expanded', now ? 'true' : 'false');
        panel.classList.toggle('hidden', !now);
        it.classList.toggle('open', now);
        panel.classList.toggle('open', now);
        const out = {};
        items.forEach((ii, j) => {
          const k = ii.getAttribute('data-key') || String(j);
          const h = ii.querySelector('.acc-header');
          if (h) out[k] = h.getAttribute('aria-expanded') === 'true';
        });
        saveState(out);
      }
      hdr.addEventListener('click', (e) => {
        if (hdr._skipNextClick) {
          hdr._skipNextClick = false; return;
        }
        toggleAccordionHeader();
      });
      hdr.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return; // left only
        // Execute immediately and skip the ensuing click to avoid double toggle flicker.
        hdr._skipNextClick = true;
        toggleAccordionHeader();
        ev.preventDefault();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
refreshBtn.addEventListener('click', loadLibrary);
if (randomPlayBtn) {
  randomPlayBtn.addEventListener('click', async () => {
    try {
      // Fetch one random page (page_size=1 sort=random) with current filters applied
      const url = new URL('/api/library', window.location.origin);
      url.searchParams.set('page', '1');
      url.searchParams.set('page_size', '1');
      url.searchParams.set('sort', 'random');
      url.searchParams.set('order', orderToggle.dataset.order || 'desc');
      const resSel = document.getElementById('resSelect');
      const resVal = resSel ? String(resSel.value || '') : '';
      if (resVal) {
        url.searchParams.set('res_min', resVal);
      }
      const searchVal = computeSearchVal();
      if (searchVal) {
        url.searchParams.set('search', searchVal);
      }
      const val = (folderInput.value || '').trim();
      const p = currentPath();
      if (val && !isAbsolutePath(val) && p) {
        url.searchParams.set('path', p);
      }
      if (libraryTagFilters.length) {
        url.searchParams.set('tags', libraryTagFilters.join(','));
      }
      if (libraryPerformerFilters.length) {
        url.searchParams.set('performers', libraryPerformerFilters.join(','));
      }
      const r = await fetch(url.toString(), {headers: {Accept: 'application/json' } });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      const pl = await r.json();
      const f = (pl?.data?.files || [])[0];
      if (!f || !f.path) {
        showMessageModal('No video found for random play.', {title: 'Random Play' });
        return;
      }
      if (typeof window.__playerOpen === 'function') {
        window.__playerOpen(f.path);
        // Switch to player tab now (explicit user action)
        if (window.tabSystem) window.tabSystem.switchToTab('player');
      }
    }
    catch (e) {
      showMessageModal('Random play failed.', {title: 'Random Play' });
    }
  });
}
// Persist auto-random setting
function loadAutoRandomSetting() {
  try {
    autoRandomEnabled = getLocalStorageBoolean('setting.autoRandom');
  }
  catch (_) {
    autoRandomEnabled = false;
  }
}
function saveAutoRandomSetting() {
  try {
    setLocalStorageBoolean('setting.autoRandom', autoRandomEnabled);
  }
  catch (_) { }
}
loadAutoRandomSetting();
if (randomAutoBtn) {
  const syncBtn = () => {
    randomAutoBtn.classList.toggle('btn-active', autoRandomEnabled);
    randomAutoBtn.setAttribute('aria-pressed', autoRandomEnabled ? 'true' : 'false');
    randomAutoBtn.title = autoRandomEnabled ? 'Auto random ON (will pick another random video when current ends)' : 'Auto random OFF';
  };
  syncBtn();
  randomAutoBtn.addEventListener('click', () => {
    autoRandomEnabled = !autoRandomEnabled;
    saveAutoRandomSetting();
    syncBtn();
  });
}
// Helper to fetch a random file given current filters (reused by manual & auto)
async function fetchRandomFilePath() {
  const url = new URL('/api/library', window.location.origin);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '1');
  url.searchParams.set('sort', 'random');
  url.searchParams.set('order', orderToggle?.dataset?.order || 'desc');
  const resSel = document.getElementById('resSelect');
  const resVal = resSel ? String(resSel.value || '') : '';
  if (resVal) url.searchParams.set('res_min', resVal);
  const searchVal = computeSearchVal();
  if (searchVal) url.searchParams.set('search', searchVal);
  const val = (folderInput.value || '').trim();
  const p = currentPath();
  if (val && !isAbsolutePath(val) && p) url.searchParams.set('path', p);
  if (libraryTagFilters.length) url.searchParams.set('tags', libraryTagFilters.join(','));
  if (libraryPerformerFilters.length) url.searchParams.set('performers', libraryPerformerFilters.join(','));
  const r = await fetch(url.toString(), {headers: {Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const pl = await r.json();
  const f = (pl?.data?.files || [])[0];
  return f && f.path ? f.path : null;
}
// Auto-random listener on player video end
function installAutoRandomListener() {
  try {
    const v = document.getElementById('playerVideo');
    if (!v || v._autoRandomWired) return;
    v._autoRandomWired = true;
    v.addEventListener('ended', async () => {
      if (!autoRandomEnabled) return;
      try {
        const p = await fetchRandomFilePath();
        if (p && typeof window.__playerOpen === 'function') {
          window.__playerOpen(p);
          if (window.tabSystem) window.tabSystem.switchToTab('player');
        }
      }
      catch (_) { }
    });
  }
  catch (_) { }
}
installAutoRandomListener();
// -----------------------------
// Infinite Scroll Helpers
// -----------------------------
function teardownInfiniteScroll() {
  try {
    if (infiniteScrollIO && infiniteScrollSentinel) {
      infiniteScrollIO.unobserve(infiniteScrollSentinel);
    }
  }
  catch (_) { }
  if (infiniteScrollSentinel && infiniteScrollSentinel.parentNode) {
    try {
      infiniteScrollSentinel.remove();
    }
    catch (_) { }
  }
  infiniteScrollSentinel = null;
  infiniteScrollIO = null;
}
// If the sentinel was already visible before the user actually scrolled,
// the original IntersectionObserver callback may have fired while
// infiniteScrollUserScrolled was still false (thus loading was skipped).
// When the user does finally scroll (or interacts in a way that implies
// intent to scroll), we manually re-check visibility and trigger the load.
function getScrollContainer() {
  // Library content is inside #library-panel; fallback to documentElement/body.
  const panel = document.getElementById('library-panel');
  return panel || document.scrollingElement || document.documentElement || document.body;
}
function hasVerticalScroll() {
  const sc = getScrollContainer();
  if (!sc) return false;
  return sc.scrollHeight > sc.clientHeight + 4; // small tolerance
}
function isAtBottom() {
  const sc = getScrollContainer();
  if (!sc) return false;
  const remaining = sc.scrollHeight - (sc.scrollTop + sc.clientHeight);
  return remaining <= INFINITE_SCROLL_BOTTOM_THRESHOLD;
}
function maybeTriggerPendingInfiniteScroll() {
  if (!infiniteScrollEnabled) return;
  if (infiniteScrollLoading) return;
  if (currentPage >= totalPages) return;
  if (infiniteScrollPendingInsertion) return;
  if (!infiniteScrollUserScrolled) return; // require explicit user interaction
  // Require that a new user scroll (or intent) occurred since the last load to
  // prevent continuous chaining while the sentinel remains visible.
  try {
    const lastScrollAt = Number(window.__INF_LAST_USER_SCROLL_AT || 0);
    const lastLoadAt = Number(window.__INF_LAST_LOAD_AT || 0);
    if (lastScrollAt <= lastLoadAt) return;
  }
  catch (_) {}
  if (!isAtBottom()) return; // not actually at bottom
  const sc = getScrollContainer();
  if (sc && sc.scrollHeight === infiniteScrollLastTriggerHeight) {
    // Already triggered at this height; require a scroll height change and another bottom reach.
    return;
  }
  infiniteScrollLastTriggerHeight = sc ? sc.scrollHeight : 0;
  infiniteScrollLoading = true;
  currentPage += 1;
  try { window.__INF_LAST_LOAD_AT = Date.now(); }
  catch (_) {}
  const done = () => {
    infiniteScrollLoading = false;
  };
  const p = loadLibrary();
  if (p && typeof p.then === 'function') p.finally(done);
  else done();
}
function markUserScrolled() {
  if (!infiniteScrollEnabled) return;
  if (!infiniteScrollUserScrolled) infiniteScrollUserScrolled = true;
  try { window.__INF_LAST_USER_SCROLL_AT = Date.now(); }
  catch (_) {}
  // Do not auto-trigger; bottom overscroll check happens via sentinel/intersection.
}
function setupInfiniteScrollSentinel() {
  if (!infiniteScrollEnabled) return;
  const panel = document.getElementById('library-panel');
  if (!panel) return;
  // Mark when user actually scrolls (prevents immediate auto-trigger on load)
  if (!panel._infiniteScrollScrollWired) {
    panel._infiniteScrollScrollWired = true;
    panel.addEventListener('scroll', markUserScrolled, {passive: true});
    // Also listen on the window/document in case the body (not panel) is the scrolling element.
    window.addEventListener('scroll', markUserScrolled, {passive: true});
    window.addEventListener('wheel', markUserScrolled, {passive: true});
    window.addEventListener('touchmove', markUserScrolled, {passive: true});
    window.addEventListener('keydown', (e) => {
      // Keys that commonly initiate scroll/navigation; we can just mark on any keydown for simplicity.
      // This avoids over-specific logic missing an edge case.
      markUserScrolled();
    }, {passive: true});
  }
  if (!infiniteScrollSentinel) {
    infiniteScrollSentinel = document.createElement('div');
    infiniteScrollSentinel.className = 'infinite-sentinel';
    infiniteScrollSentinel.setAttribute('aria-hidden', 'true');
    infiniteScrollSentinel.style.width = '100%';
    infiniteScrollSentinel.style.height = '1px';
    infiniteScrollSentinel.style.marginTop = '1px';
  }
  const gridParent = grid && grid.parentNode ? grid.parentNode : panel;
  if (!infiniteScrollSentinel.parentNode) {
    gridParent.appendChild(infiniteScrollSentinel);
  }
  else {
    // Ensure it is last child
    try {
      gridParent.appendChild(infiniteScrollSentinel);
    }
    catch (_) { }
  }
  if (!infiniteScrollIO) {
    try {
      infiniteScrollIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!infiniteScrollEnabled) return;
          // Intersection alone no longer triggers eager load; rely on bottom check.
          maybeTriggerPendingInfiniteScroll();
        }
      }, {root: null, rootMargin: '0px 0px', threshold: 0.01});
    }
    catch (_) {
      return;
    }
  }
  try {
    infiniteScrollIO.observe(infiniteScrollSentinel);
  }
  catch (_) { }
}
// -----------------------------
// Unified search + filter chips (#tag, @performer, plain text tokens)
// -----------------------------
function persistLibraryFilters() {
  try {
    setLocalStorageJSON('filters.tags', libraryTagFilters);
    setLocalStorageJSON('filters.performers', libraryPerformerFilters);
    setLocalStorageJSON('filters.searchTerms', librarySearchTerms);
  }
  catch (_) { }
}
// Helper: whether any Library filters/search are active
function hasAnyLibraryFiltersActive() {
  try {
    const resSel = document.getElementById('resSelect');
    const resVal = resSel ? String(resSel.value || '') : '';
    const live = (unifiedInput && unifiedInput.value || '').trim();
    return Boolean((libraryTagFilters && libraryTagFilters.length) || (libraryPerformerFilters && libraryPerformerFilters.length) || (librarySearchTerms && librarySearchTerms.length) || resVal || (live && !live.startsWith('#') && !live.startsWith('@')));
  }
  catch (_) { return false; }
}
function updateClearFiltersBtnState() {
  if (!clearFiltersTopBtn) return;
  const on = hasAnyLibraryFiltersActive();
  try { clearFiltersTopBtn.disabled = !on; }
  catch (_) {}
}
function clearAllLibraryFilters() {
  try {
    if (unifiedInput) unifiedInput.value = '';
    librarySearchTerms = [];
    libraryTagFilters = [];
    libraryPerformerFilters = [];
    const rs = document.getElementById('resSelect');
    if (rs) rs.value = '';
    persistLibraryFilters();
    renderUnifiedFilterChips();
    updateClearFiltersBtnState();
    if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
  }
  catch (_) {}
  currentPage = 1;
  loadLibrary();
}
if (clearFiltersTopBtn && !clearFiltersTopBtn._wired) {
  clearFiltersTopBtn._wired = true;
  clearFiltersTopBtn.addEventListener('click', clearAllLibraryFilters);
  updateClearFiltersBtnState();
}
function loadLibraryFilters() {
  try {
    const t = getLocalStorageJSON('filters.tags', []);
    const p = getLocalStorageJSON('filters.performers', []);
    const s = getLocalStorageJSON('filters.searchTerms', []);
    if (Array.isArray(t)) libraryTagFilters = t.filter(Boolean);
    if (Array.isArray(p)) libraryPerformerFilters = p.filter(Boolean);
    if (Array.isArray(s)) librarySearchTerms = s.filter(Boolean);
  }
  catch (_) { }
}
function renderUnifiedFilterChips() {
  if (!unifiedChipsEl) return;
  unifiedChipsEl.innerHTML = '';
  const tpl = document.getElementById('filterChipTemplate');
  function add(label, cls, removeFn, title) {
    let el = null;
    if (tpl && tpl.content) {
      el = tpl.content.firstElementChild.cloneNode(true);
    }
    else {
      el = document.createElement('span');
      el.className = 'chip';
      const span = document.createElement('span');
      span.className = 'chip-label';
      span.textContent = label;
      el.appendChild(span);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove';
      rm.textContent = '×';
      el.appendChild(rm);
    }
    el.classList.add(cls);
    const labelEl = el.querySelector('.chip-label');
    if (labelEl) {
      labelEl.textContent = label;
    }
    if (title) {
      el.title = title;
    }
    const rmBtn = el.querySelector('.remove');
    if (rmBtn) {
      rmBtn.addEventListener('click', () => {
        removeFn();
        persistLibraryFilters();
        renderUnifiedFilterChips();
        if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
        currentPage = 1;
        loadLibrary();
      });
    }
    unifiedChipsEl.appendChild(el);
  }
  librarySearchTerms.forEach((term) => add(term, 'chip-search', () => {
    librarySearchTerms = librarySearchTerms.filter((t) => t !== term);
  }, `Search term: ${term}`));
  libraryTagFilters.forEach((tag) => add(`#${tag}`, 'chip-tag', () => {
    libraryTagFilters = libraryTagFilters.filter((t) => t !== tag);
  }, `Tag: ${tag}`));
  libraryPerformerFilters.forEach((p) => add(`@${p}`, 'chip-performer', () => {
    libraryPerformerFilters = libraryPerformerFilters.filter((x) => x !== p);
  }, `Performer: ${p}`));
  // Keep Clear button state in sync
  updateClearFiltersBtnState();
}
function commitUnifiedInputToken(raw) {
  if (!raw) return false;
  let consumed = false;
  if (raw.startsWith('#')) {
    const tag = raw.slice(1).trim();
    if (tag && !libraryTagFilters.includes(tag)) {
      libraryTagFilters.push(tag);
      consumed = true;
    }
  }
  else if (raw.startsWith('@')) {
    const perf = raw.slice(1).trim();
    if (perf && !libraryPerformerFilters.includes(perf)) {
      libraryPerformerFilters.push(perf);
      consumed = true;
    }
  }
  else {
    if (!librarySearchTerms.includes(raw)) {
      librarySearchTerms.push(raw);
      consumed = true;
    }
  }
  if (consumed) {
    persistLibraryFilters();
    renderUnifiedFilterChips();
    if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
    currentPage = 1;
    loadLibrary();
  }
  return consumed;
}
function computeSearchVal() {
  const live = (unifiedInput && unifiedInput.value || '').trim();
  const parts = [...librarySearchTerms];
  if (live && !live.startsWith('#') && !live.startsWith('@')) {
    parts.push(live);
  }
  return parts.join(' ');
}
// On startup/back/forward: read filters/search/sort/res/path from URL and apply to state/UI
function applyLibraryStateFromUrl() {
  try {
    const url = new URL(window.location.href);
    // Search as chips (split by whitespace)
    const s = (url.searchParams.get('search') || '').trim();
    librarySearchTerms = s ? s.split(/\s+/).filter(Boolean) : [];
    if (unifiedInput) unifiedInput.value = '';
    // Tags and performers as comma-separated
    const tags = (url.searchParams.get('tags') || '').trim();
    libraryTagFilters = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const perfs = (url.searchParams.get('performers') || '').trim();
    libraryPerformerFilters = perfs ? perfs.split(',').map((p) => p.trim()).filter(Boolean) : [];
    // Resolution
    const resSel = document.getElementById('resSelect');
    const resMin = (url.searchParams.get('res_min') || '').trim();
    if (resSel) resSel.value = resMin;
    // Sort and order
    const sortVal = (url.searchParams.get('sort') || '').trim();
    if (sortVal && sortSelect) sortSelect.value = sortVal;
    const ord = (url.searchParams.get('order') || '').trim();
    if (ord) { orderToggle.dataset.order = ord.toLowerCase() === 'asc' ? 'asc' : 'desc'; syncOrderToggleArrow(); }
    // Path (relative path within root)
    const p = (url.searchParams.get('path') || '').trim();
    if (folderInput) folderInput.value = p;
    persistLibraryFilters();
    renderUnifiedFilterChips();
    updateClearFiltersBtnState();
  }
  catch (_) { }
}
// Apply URL state once on load and when navigating history
window.addEventListener('DOMContentLoaded', () => {
  try { applyLibraryStateFromUrl(); currentPage = 1; loadLibrary(); }
  catch (_) {}
});
window.addEventListener('popstate', () => {
  try { applyLibraryStateFromUrl(); currentPage = 1; loadLibrary(); }
  catch (_) {}
});
// Keep the browser URL in sync with current Library filters and search
function updateLibraryUrlFromState() {
  try {
    const url = new URL(window.location.href);
    const searchVal = computeSearchVal();
    const val = (folderInput && folderInput.value || '').trim();
    const relPath = (typeof currentPath === 'function') ? currentPath() : '';
    const resSel = document.getElementById('resSelect');
    const resVal = resSel ? String(resSel.value || '') : '';
    const sortVal = sortSelect ? (sortSelect.value || 'date') : 'date';
    const orderVal = orderToggle ? (orderToggle.dataset.order || 'desc') : 'desc';
    const setOrDel = (k, v) => {
      if (v && String(v).length) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    };
    setOrDel('search', searchVal);
    if (val && typeof isAbsolutePath === 'function' && !isAbsolutePath(val) && relPath) setOrDel('path', relPath);
    else url.searchParams.delete('path');
    if (Array.isArray(libraryTagFilters) && libraryTagFilters.length) setOrDel('tags', libraryTagFilters.join(','));
    else url.searchParams.delete('tags');
    if (Array.isArray(libraryPerformerFilters) && libraryPerformerFilters.length) setOrDel('performers', libraryPerformerFilters.join(','));
    else url.searchParams.delete('performers');
    setOrDel('res_min', resVal);
    setOrDel('sort', sortVal);
    setOrDel('order', orderVal);
    history.replaceState(null, '', url);
  }
  catch (_) { }
}
if (unifiedInput) {
  unifiedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const raw = unifiedInput.value.trim();
      if (commitUnifiedInputToken(raw)) {
        unifiedInput.value = '';
      }
    }
    else if (e.key === 'Backspace' && !unifiedInput.value) {
      // Remove last chip (search -> tag -> performer priority reversed for recency illusions)
      if (libraryPerformerFilters.length) {
        libraryPerformerFilters.pop();
      }
      else if (libraryTagFilters.length) {
        libraryTagFilters.pop();
      }
      else if (librarySearchTerms.length) {
        librarySearchTerms.pop();
      }
      persistLibraryFilters();
      renderUnifiedFilterChips();
      if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
      currentPage = 1;
      loadLibrary();
    }
  });
}
loadLibraryFilters();
renderUnifiedFilterChips();
// Grid control event listeners
// -----------------------------
// Library Stats Panel
// -----------------------------
function drawPieChart(canvas, dataObj) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const entries = Object.entries(dataObj).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.4;
  ctx.clearRect(0, 0, w, h);
  if (total === 0) {
    // draw placeholder
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', cx, cy);
    return;
  }
  const colors = ['#4dc9f6', '#f67019', '#f53794', '#537bc4', '#acc236', '#166a8f', '#00a950', '#58595b'];
  let start = -Math.PI / 2;
  entries.forEach(([k, v], i) => {
    const frac = Number(v) / total;
    const angle = frac * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start += angle;
  });
  // legend
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let ly = 10;
  entries.forEach(([k, v], i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(w - 120, ly, 12, 12);
    ctx.fillStyle = '#ddd';
    ctx.fillText(`${k} (${v})`, w - 104, ly + 6);
    ly += 18;
  });
}
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) {
      throw new Error('failed');
    }
    const body = await res.json();
    if (!body || body.status !== 'success') return;
    const d = body.data || {};
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = (val === null || val === undefined) ? '—' : val;
      }
    };
    setText('statsNumFiles', d.num_files ?? '—');
    setText('statsTotalSize', (typeof d.total_size === 'number') ? fmtSize(d.total_size) : '—');
    setText('statsTotalDuration', (typeof d.total_duration === 'number') ? fmtDuration(d.total_duration) : '—');
    setText('statsNumTags', d.tags ?? '—');
    setText('statsNumPerformers', d.performers ?? '—');
    const resCanvas = document.getElementById('statsResChart');
    const durCanvas = document.getElementById('statsDurationChart');
    if (resCanvas && d.res_buckets) drawPieChart(resCanvas, d.res_buckets);
    if (durCanvas && d.duration_buckets) drawPieChart(durCanvas, d.duration_buckets);
  }
  catch (e) { }
}
// run on initial load
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadStats, 500);
});
// Unified input live search (uncommitted text acts as search term)
if (unifiedInput) {
  unifiedInput.addEventListener('input', () => {
    currentPage = 1;
    loadLibrary();
    updateClearFiltersBtnState();
  });
}
sortSelect.addEventListener('change', () => {
  // Reset to sensible default per changed sort (ASC for name, DESC otherwise) regardless of prior user-set order
  applyDefaultOrderForSort(true);
  // Clear the sticky userSet so future clicks re-establish intent on the new sort
  if (orderToggle) delete orderToggle.dataset.userSet;
  currentPage = 1;
  loadLibrary();
  updateClearFiltersBtnState();
});
// Wire up sidebar artifact generation buttons
function getSelectedFilePath() {
  // Prefer the actively playing path from the Player, if available
  try {
    const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : null;
    if (p) return p;
  }
  catch (_) { }
  // Otherwise use the currently selected file in the grid
  if (selectedItems && selectedItems.size > 0) return Array.from(selectedItems)[0];
  // Fallback: try to get the first card in the grid
  const card = document.querySelector('.card[data-path]');
  return card ? card.dataset.path : null;
}
function setArtifactSpinner(artifact, spinning) {
  const btn = document.querySelector(`.artifact-gen-btn[data-artifact="${artifact}"]`);
  if (!btn) return;
  if (spinning) {
    btn.dataset.loading = '1';
    btn.disabled = true;
  }
  else {
    delete btn.dataset.loading;
    btn.disabled = false;
  }
}
async function triggerArtifactJob(artifact) {
  const filePath = getSelectedFilePath();
  if (!filePath) {
    showMessageModal('No file selected.', {title: 'Generate Artifact' });
    return;
  }
  setArtifactSpinner(artifact, true);
  // Record an optimistic active spinner state keyed by path+artifact so TasksManager can reconcile later
  try {
    window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
    window.__activeArtifactSpinners.set(`${filePath}::${artifact}`, {path: filePath, artifact: artifact, since: Date.now(), manual: true});
  }
  catch (_) { }
  let endpoint = '';
  let params = '';
  if (artifact) {
    endpoint = `/api/${artifact}/create`;
    params = `?path=${encodeURIComponent(filePath)}`;
  }
  else {
    setArtifactSpinner(artifact, false);
    showMessageModal('Unknown artifact type.', {title: 'Generate Artifact' });
    return;
  }
  try {
    const res = await fetch(endpoint + params, {method: 'POST' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    // Do NOT clear spinner here; we now wait for job completion via TasksManager reconciliation.
  }
  catch (e) {
    setArtifactSpinner(artifact, false);
    try {
      window.__activeArtifactSpinners?.delete?.(`${filePath}::${artifact}`);
    }
    catch (_) { }
    showMessageModal(`Failed to generate ${artifact}: ${e.message}`, {title: 'Generate Artifact' });
  }
}
document.querySelectorAll('.artifact-gen-btn[data-artifact]').forEach((btn) => {
  if (btn._wired) return;
  btn._wired = true;
  btn.addEventListener('click', () => {
    const artifact = btn.getAttribute('data-artifact');
    triggerArtifactJob(artifact);
  });
});
orderToggle.addEventListener('click', () => {
  // Mark that the user explicitly chose an order; future sort changes won't auto-reset it
  orderToggle.dataset.userSet = '1';
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
    try {
      localStorage.setItem('filter.res_min', resSelect.value || '');
    }
    catch (_) { }
    currentPage = 1;
    loadLibrary();
    updateClearFiltersBtnState();
  });
}
// Pagination
prevBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadLibrary();
  }
});
nextBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadLibrary();
  }
});
// Density slider
densitySlider.addEventListener('input', () => {
  currentDensity = parseInt(densitySlider.value);
  updateDensity();
  // Mark that this reload is due to a density change so we can bypass the
  // initial small-page cap; do not auto-fill additional pages.
  densityReloadPending = true;
  autoFillAfterLayoutChange = false;
  autoFillAfterLayoutChangeBudget = 2; // allow up to 2 extra pages to create overflow
  // Reset last trigger state to allow new bottom checks at the new height; keep
  // userScrolled=false so we only load after actual user interaction.
  infiniteScrollLastTriggerHeight = 0;
  infiniteScrollUserScrolled = false;
  try { window.__INF_LAST_LOAD_AT = Date.now(); }
  catch (_) {}
  // Clean up any existing sentinel before reloading.
  teardownInfiniteScroll();
  currentPage = 1;
  loadLibrary();
});
// Apply density once on startup so initial load uses correct columns
updateDensity();
// Settings wiring for video previews (canonical key 'setting.preview')
function loadPreviewSetting() {
  try {
    const raw = getLocalStorageItem('setting.preview');
    previewEnabled = raw === '1';
  }
  catch (_) {
    previewEnabled = false;
  }
}
function savePreviewSetting() {
  try {
    setLocalStorageItem('setting.preview', previewEnabled ? '1' : '0');
  }
  catch (_) { }
}
function loadPreviewOnDemandSetting() {
  try {
    const raw = getLocalStorageItem('setting.previewOnDemand');
    // Respect stored value when present; default to false when absent.
    // FEATURE_HOVER_ON_DEMAND controls only whether the UI/behavior is active,
    // not whether we remember prior intent.
    const stored = raw ? raw === '1' : false;
    previewOnDemandEnabled = FEATURE_PREVIEW_ON_DEMAND ? stored : false;
  }
  catch (_) {
    previewOnDemandEnabled = false;
  }
}
function savePreviewOnDemandSetting() {
  try {
    setLocalStorageItem('setting.previewOnDemand', previewOnDemandEnabled ? '1' : '0');
  }
  catch (_) { }
}
// Settings for timeline display toggles
function loadShowHeatmapSetting() {
  try {
    const raw = getLocalStorageItem('setting.showHeatmap');
    // Default to ON when unset
    showHeatmap = raw == null ? true : raw === '1';
  }
  catch (_) {
    showHeatmap = true;
  }
}
function saveShowHeatmapSetting() {
  try {
    setLocalStorageItem('setting.showHeatmap', showHeatmap ? '1' : '0');
  }
  catch (_) { }
}
function loadShowScenesSetting() {
  try {
    const raw = getLocalStorageItem('setting.showScenes');
    showScenes = raw == null ? true : raw === '1';
  }
  catch (_) {
    showScenes = true;
  }
}
function saveShowScenesSetting() {
  try {
    setLocalStorageItem('setting.showScenes', showScenes ? '1' : '0');
  }
  catch (_) { }
}
function wireSettings() {
  const cbPlay = document.getElementById('settingPreview');
  const cbDemand = document.getElementById('settingPreviewOnDemand');
  const cbConfirmDeletes = document.getElementById('settingConfirmDeletes');
  const concurrencyInput = document.getElementById('settingConcurrency');
  const ffmpegConcurrencyInput = document.getElementById('settingFfmpegConcurrency');
  const ffmpegThreadsInput = document.getElementById('settingFfmpegThreads');
  const ffmpegTimelimitInput = document.getElementById('settingFfmpegTimelimit');
  const cbAutoplayResume = document.getElementById('settingAutoplayResume');
  const cbShowHeatmap = document.getElementById('settingShowHeatmap');
  const cbShowScenes = document.getElementById('settingShowScenes');
  const cbInfinite = document.getElementById('settingInfiniteScroll');
  loadPreviewSetting();
  loadPreviewOnDemandSetting();
  loadShowHeatmapSetting();
  loadShowScenesSetting();
  // Load confirm delete preference
  try {
    confirmDeletesEnabled = localStorage.getItem('setting.confirmDeletes') === '1';
  }
  catch (_) {
    confirmDeletesEnabled = false;
  }
  if (cbPlay) {
    cbPlay.checked = Boolean(previewEnabled);
    cbPlay.addEventListener('change', () => {
      previewEnabled = Boolean(cbPlay.checked);
      savePreviewSetting();
      if (!previewEnabled) stopAllTilePreviews();
    });
  }
  if (cbDemand) {
    cbDemand.checked = Boolean(previewOnDemandEnabled);
    cbDemand.addEventListener('change', () => {
      previewOnDemandEnabled = Boolean(cbDemand.checked);
      savePreviewOnDemandSetting();
    });
  }
  // Infinite scroll setting (default ON if unset)
  try {
    const rawInf = localStorage.getItem('setting.infiniteScroll');
    if (rawInf === null) infiniteScrollEnabled = true;
    else infiniteScrollEnabled = rawInf === '1';
  }
  catch (_) {
    infiniteScrollEnabled = true;
  }
  if (cbInfinite) {
    cbInfinite.checked = Boolean(infiniteScrollEnabled);
    if (!cbInfinite._wired) {
      cbInfinite._wired = true;
      cbInfinite.addEventListener('change', () => {
        infiniteScrollEnabled = Boolean(cbInfinite.checked);
        try {
          localStorage.setItem('setting.infiniteScroll', infiniteScrollEnabled ? '1' : '0');
        }
        catch (_) { }
        currentPage = 1;
        teardownInfiniteScroll();
        loadLibrary();
      });
    }
  }
  if (cbConfirmDeletes) {
    cbConfirmDeletes.checked = Boolean(confirmDeletesEnabled);
    cbConfirmDeletes.addEventListener('change', () => {
      confirmDeletesEnabled = Boolean(cbConfirmDeletes.checked);
      try {
        localStorage.setItem('setting.confirmDeletes', confirmDeletesEnabled ? '1' : '0');
      }
      catch (_) { }
    });
  }
  // Timeline display toggles
  if (cbShowHeatmap) {
    cbShowHeatmap.checked = Boolean(showHeatmap);
    cbShowHeatmap.addEventListener('change', () => {
      showHeatmap = Boolean(cbShowHeatmap.checked);
      saveShowHeatmapSetting();
      // Defer actual UI toggle to Player module when active
    });
  }
  if (cbShowScenes) {
    cbShowScenes.checked = Boolean(showScenes);
    cbShowScenes.addEventListener('change', () => {
      showScenes = Boolean(cbShowScenes.checked);
      saveShowScenesSetting();
      // Defer actual UI toggle to Player module when active
    });
  }
  // Autoplay resume setting
  const loadAutoplayResume = () => {
    try {
      return getLocalStorageItem('setting.autoplayResume') === '1';
    }
    catch (_) {
      return false;
    }
  };
  const saveAutoplayResume = (v) => {
    try {
      setLocalStorageItem('setting.autoplayResume', v ? '1' : '0');
    }
    catch (_) { }
  };
  if (cbAutoplayResume) {
    cbAutoplayResume.checked = loadAutoplayResume();
    cbAutoplayResume.addEventListener('change', () => saveAutoplayResume(Boolean(cbAutoplayResume.checked)));
  }
  // Start at Intro End setting (default ON)
  const loadStartAtIntro = () => {
    try {
      // default to on if not set
      const v = getLocalStorageItem('setting.startAtIntro');
      if (v === null || v === undefined) return true;
      return v === '1';
    }
    catch (_) {
      return true;
    }
  };
  const saveStartAtIntro = (v) => {
    try {
      setLocalStorageItem('setting.startAtIntro', v ? '1' : '0');
    }
    catch (_) { }
  };
  const cbStartAtIntro = document.getElementById('settingStartAtIntro');
  if (cbStartAtIntro) {
    cbStartAtIntro.checked = loadStartAtIntro();
    cbStartAtIntro.addEventListener('change', () => saveStartAtIntro(Boolean(cbStartAtIntro.checked)));
  }
  // Concurrency setting
  (async () => {
    try {
      const r = await fetch('/api/tasks/concurrency');
      if (r.ok) {
        const data = await r.json();
        const val = Number(data?.data?.maxConcurrency) || 4;
        if (concurrencyInput) {
          concurrencyInput.value = String(val);
        }
      }
      else if (concurrencyInput) {
        concurrencyInput.value = String(Number(localStorage.getItem('setting.maxConcurrency')) || 4);
      }
    }
    catch (_) {
      if (concurrencyInput) {
        concurrencyInput.value = String(Number(localStorage.getItem('setting.maxConcurrency')) || 4);
      }
    }
  })();
  // FFmpeg settings load
  (async () => {
    if (!ffmpegConcurrencyInput && !ffmpegThreadsInput && !ffmpegTimelimitInput) return;
    try {
      const r = await fetch('/api/settings/ffmpeg');
      if (r.ok) {
        const data = await r.json();
        const c = Number(data?.data?.concurrency) || 4;
        const th = Number(data?.data?.threads) || 1;
        const tl = Number(data?.data?.timelimit);
        if (ffmpegConcurrencyInput) {
          ffmpegConcurrencyInput.value = String(c);
        }
        if (ffmpegThreadsInput) {
          ffmpegThreadsInput.value = String(th);
        }
        if (ffmpegTimelimitInput) {
          ffmpegTimelimitInput.value = String(isNaN(tl) ? 600 : tl);
        }
      }
    }
    catch (e) { }
  })();
  // Debounced autosave on change
  if (concurrencyInput) {
    const push = async () => {
      const raw = Math.max(1, Math.min(128, Number(concurrencyInput.value || 4)));
      try {
        const r = await fetch(`/api/tasks/concurrency?value=${raw}`, {method: 'POST' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        localStorage.setItem('setting.maxConcurrency', String(raw));
        const data = await r.json();
        const applied = Number(data?.data?.maxConcurrency) || raw;
        concurrencyInput.value = String(applied);
        tasksManager?.showNotification(`Max concurrency set to ${applied}`, 'success');
      }
      catch (_) {
        tasksManager?.showNotification('Failed to set concurrency', 'error');
      }
    };
    const debouncedPush = debounce(push, 400);
    concurrencyInput.addEventListener('change', debouncedPush);
    concurrencyInput.addEventListener('input', debouncedPush);
  }
  // FFmpeg settings handlers (shared debounce so rapid multi-field edits collapse into one POST)
  if (ffmpegConcurrencyInput || ffmpegThreadsInput || ffmpegTimelimitInput) {
    const pushFfmpeg = async () => {
      const c = ffmpegConcurrencyInput ? Math.max(1, Math.min(16, Number(ffmpegConcurrencyInput.value || 4))) : undefined;
      const th = ffmpegThreadsInput ? Math.max(1, Math.min(32, Number(ffmpegThreadsInput.value || 1))) : undefined;
      const tl = ffmpegTimelimitInput ? Math.max(0, Math.min(86400, Number(ffmpegTimelimitInput.value || 600))) : undefined;
      const params = new URLSearchParams();
      if (c !== undefined) {
        params.append('concurrency', String(c));
      }
      if (th !== undefined) {
        params.append('threads', String(th));
      }
      if (tl !== undefined) {
        params.append('timelimit', String(tl));
      }
      try {
        const r = await fetch(`/api/settings/ffmpeg?${params.toString()}`, {method: 'POST'});
        if (!r.ok) {
          throw new Error();
        }
        const data = await r.json();
        const applied = data?.data || {};
        if (ffmpegConcurrencyInput && applied.concurrency != null) {
          ffmpegConcurrencyInput.value = String(applied.concurrency);
        }
        if (ffmpegThreadsInput && applied.threads != null) {
          ffmpegThreadsInput.value = String(applied.threads);
        }
        if (ffmpegTimelimitInput && applied.timelimit != null) {
          ffmpegTimelimitInput.value = String(applied.timelimit);
        }
        tasksManager?.showNotification(`FFmpeg settings updated (proc=${applied.concurrency}, threads=${applied.threads}, limit=${applied.timelimit}s)`, 'success');
      }
      catch (_) {
        tasksManager?.showNotification('Failed to update FFmpeg settings', 'error');
      }
    };
    const debouncedFfmpeg = debounce(pushFfmpeg, 500);
    const attach = (el) => {
      if (!el) return;
      el.addEventListener('change', debouncedFfmpeg);
      el.addEventListener('input', debouncedFfmpeg);
    };
    attach(ffmpegConcurrencyInput);
    attach(ffmpegThreadsInput);
    attach(ffmpegTimelimitInput);
  }
  // Insert Health/Config read-only JSON panels
  try {
    const settingsPanel = document.querySelector('#settings-panel .tab-content');
    if (settingsPanel) {
      // Only add once
      if (!settingsPanel._jsonPanelsAdded) {
        settingsPanel._jsonPanelsAdded = true;
        const healthTpl = document.getElementById('settingsHealthTemplate');
        const configTpl = document.getElementById('settingsConfigTemplate');
        const frag = document.createDocumentFragment();
        if (healthTpl && healthTpl.tagName === 'TEMPLATE') frag.appendChild(healthTpl.content.cloneNode(true));
        if (configTpl && configTpl.tagName === 'TEMPLATE') frag.appendChild(configTpl.content.cloneNode(true));
        settingsPanel.appendChild(frag);
        const healthPre = settingsPanel.querySelector('.health-pre');
        const configPre = settingsPanel.querySelector('.config-pre');
        const healthBtn = settingsPanel.querySelector('.health-refresh');
        const configBtn = settingsPanel.querySelector('.config-refresh');
        const fmt = (obj) => {
          try {
            return JSON.stringify(obj, null, 2);
          }
          catch (_) {
            return String(obj);
          }
        };
        async function loadHealth() {
          if (!healthPre) return;
          healthPre.textContent = 'Loading…';
          try {
            // Prefer /api/health if router mounted, else fallback to /health
            let r = await fetch('/api/health');
            if (!r.ok) r = await fetch('/health');
            const j = await r.json();
            const data = j && j.data ? j.data : j;
            healthPre.textContent = fmt(data);
          }
          catch (e) {
            healthPre.textContent = 'Failed to load health';
          }
        }
        async function loadConfig() {
          if (!configPre) return;
          configPre.textContent = 'Loading…';
          try {
            // Prefer /api/config if present in legacy setups; otherwise /config
            let r = await fetch('/api/config');
            if (!r.ok) r = await fetch('/config');
            const j = await r.json();
            const data = j && j.data ? j.data : j;
            configPre.textContent = fmt(data);
          }
          catch (e) {
            configPre.textContent = 'Failed to load config';
          }
        }
        if (healthBtn && !healthBtn._wired) {
          healthBtn._wired = true;
          healthBtn.addEventListener('click', loadHealth);
        }
        if (configBtn && !configBtn._wired) {
          configBtn._wired = true;
          configBtn.addEventListener('click', loadConfig);
        }
        // Lazy-load when the Settings tab becomes active to avoid wasted requests
        const maybeInit = (tabId) => {
          if (tabId !== 'settings') return;
          loadHealth();
          loadConfig();
        };
        // If settings already visible, load now
        try {
          if (!(settingsPanel.hasAttribute('hidden') || settingsPanel.classList.contains('hidden'))) {
            maybeInit('settings');
          }
        }
        catch (_) { }
        // Also react to tab changes
        window.addEventListener('tabchange', (e) => {
          try {
            maybeInit(e?.detail?.activeTab);
          }
          catch (_) { }
        });
      }
    }
  }
  catch (_) { /* ignore */ }
}
// (Removed: simple Enter handler;
// replaced below with unified behavior)
folderInput.addEventListener('dblclick', () => openFolderPicker());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadLibrary();
  }
});
window.addEventListener('load', () => {
  // Initialize density
  updateDensity();
  // Initialize resolution filter from storage (persisted across sessions)
  try {
    const savedRes = localStorage.getItem('filter.res_min');
    const sel = document.getElementById('resSelect');
    if (sel) {
      const validValues = ['', '2160', '1440', '1080', '720', '480'];
      if (savedRes && validValues.includes(savedRes)) {
        sel.value = savedRes;
      }
      else if (!savedRes) {
        sel.value = '';
      }
    }
  }
  catch (_) { }
  // Prefill placeholder with current root value, but keep input empty for relative navigation
  (async () => {
    try {
      const r = await fetch('/api/root');
      if (r.ok) {
        const p = await r.json();
        if (p?.status === 'success' && p?.data?.root) {
          folderInput.placeholder = `Root: ${String(p.data.root)} — type a relative path to browse, or an absolute path to change root`;
        }
      }
    }
    catch (_) { }
    finally {
      folderInput.value = '';
      loadLibrary();
    }
  })();
  // Ensure job action buttons can be toggled by JS even if residual d-none class remains
  ['cancelAllBtn', 'cancelQueuedBtn', 'clearCompletedBtn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.classList.contains('d-none')) el.classList.remove('d-none');
  });
  // Wire job action buttons early so clicks always work, independent of table renders
  const clearBtn = document.getElementById('clearCompletedBtn');
  if (clearBtn && !clearBtn._wired) {
    clearBtn._wired = true;
    clearBtn.addEventListener('click', async () => {
      try {
        clearBtn.disabled = true; clearBtn.classList.add('btn-busy');
        const r = await fetch('/api/tasks/jobs/clear-completed', {method: 'POST' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const removed = data?.data?.removed ?? 0;
        (window.tasksManager?.showNotification || notify)(`Removed ${removed} completed job(s)`, 'success');
        await (window.tasksManager?.refreshJobs?.() || Promise.resolve());
      }
      catch (e) {
        (window.tasksManager?.showNotification || notify)('Failed to clear completed jobs', 'error');
      }
      finally {
        clearBtn.classList.remove('btn-busy');
        clearBtn.disabled = false;
      }
    });
  }
  const cancelQueuedBtn = document.getElementById('cancelQueuedBtn');
  if (cancelQueuedBtn && !cancelQueuedBtn._wired) {
    cancelQueuedBtn._wired = true;
    cancelQueuedBtn.addEventListener('click', async () => {
      try {
        cancelQueuedBtn.disabled = true;
        cancelQueuedBtn.classList.add('btn-busy');
        const res = await fetch('/api/tasks/jobs/cancel-queued', {method: 'POST' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        (window.tasksManager?.showNotification || notify)('Queued jobs canceled', 'success');
        await (window.tasksManager?.refreshJobs?.() || Promise.resolve());
      }
      catch (e) {
        (window.tasksManager?.showNotification || notify)('Failed to cancel queued jobs', 'error');
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
        const res = await fetch('/api/tasks/jobs/cancel-all', {method: 'POST' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        (window.tasksManager?.showNotification || notify)('All pending and running jobs asked to cancel', 'success');
        await (window.tasksManager?.refreshJobs?.() || Promise.resolve());
      }
      catch (e) {
        (window.tasksManager?.showNotification || notify)('Failed to cancel all jobs', 'error');
      }
      finally {
        cancelAllBtn.classList.remove('btn-busy');
        cancelAllBtn.disabled = false;
      }
    });
  }
  // Initialize per-artifact options menus
  initArtifactOptionsMenus();
});
// Utility: toggled tooltip menus for artifact options
function initArtifactOptionsMenus() {
  // Close any open tooltip when clicking outside
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.options-tooltip').forEach((tt) => {
      hide(tt);
    });
    // also drop raised stacking on any cards
    document.querySelectorAll('.artifact-card.menu-open')
    .forEach((card) => card.classList.remove('menu-open'));
  });
  // Open corresponding tooltip for clicked options button
  document.querySelectorAll('.btn-options[data-artifact]').forEach((btn) => {
    if (btn._optsWired) return;
    btn._optsWired = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const artifact = btn.getAttribute('data-artifact');
      const tooltip = document.getElementById(`${artifact}Options`);
      const card = btn.closest('.artifact-card');
      // Toggle: hide others, then toggle this
      document.querySelectorAll('.options-tooltip').forEach((tt) => {
        if (tt !== tooltip) hide(tt);
      });
      document.querySelectorAll('.artifact-card.menu-open')
      .forEach((c) => c.classList.remove('menu-open'));
      if (tooltip) {
        const willOpen = isHidden(tooltip);
        if (willOpen) showAs(tooltip, 'block');
        else hide(tooltip);
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
// Density function
function updateDensity() {
  const root = document.documentElement;
  const cfg = densityConfigs[currentDensity - 1];
  let columns = 4;
  if (cfg && Array.isArray(cfg)) columns = cfg[1];
  else columns = Math.max(1, currentDensity);
  // On small screens, adapt columns to maintain a reasonable min card width
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const gridEl = document.getElementById('grid');
    const containerW = gridEl ? gridEl.clientWidth : window.innerWidth;
    const minCard = 160; // match CSS mobile minmax
    const gap = 12;
    if (isMobile && containerW) {
      const fitCols = Math.max(1, Math.floor((containerW + gap) / (minCard + gap)));
      columns = Math.min(columns, fitCols);
    }
  }
  catch (_) {}
  root.style.setProperty('--columns', String(Math.max(1, columns)));
}
// Returns the current page size derived from the density configuration while
// also ensuring the --columns CSS variable is applied. This centralizes the
// logic that loadLibrary previously expected (applyColumnsAndComputePageSize).
// If densityConfigs/currentDensity are out of range, a conservative fallback
// is used. Keeping this minimal to avoid broader refactors right now.
function applyColumnsAndComputePageSize() {
  const cfg = densityConfigs[currentDensity - 1];
  let columns = 4;
  if (cfg && Array.isArray(cfg)) columns = cfg[1];
  else columns = Math.max(1, currentDensity);
  // Respect mobile min card width when computing columns
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const gridEl = document.getElementById('grid');
    const containerW = gridEl ? gridEl.clientWidth : window.innerWidth;
    const minCard = 160;
    const gap = 12;
    if (isMobile && containerW) {
      const fitCols = Math.max(1, Math.floor((containerW + gap) / (minCard + gap)));
      columns = Math.min(columns, fitCols);
    }
  }
  catch (_) {}
  document.documentElement.style.setProperty('--columns', String(Math.max(1, columns)));
  // Estimate rows that fit without vertical scroll (soft limit); allow fallback large page if unknown
  const gridEl = document.getElementById('grid');
  let gap = 12;
  if (gridEl) {
    const st = window.getComputedStyle(gridEl);
    const g = parseFloat(st.rowGap || st.gap || '12');
    if (isFinite(g) && g >= 0) gap = g;
  }
  const baseHeight = lastCardHeight || 230;
  let available = window.innerHeight;
  if (gridEl) {
    const rect = gridEl.getBoundingClientRect();
    available = Math.max(200, window.innerHeight - rect.top - 8);
  }
  let rows = Math.max(1, Math.floor((available + gap) / (baseHeight + gap)));
  if (rows > 20) rows = 20; // hard safety cap
  let size = columns * rows;
  // On small screens, ensure a minimum batch so the first view isn't too sparse
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) size = Math.max(size, 24);
  }
  catch (_) {}
  return size;
}
// Dynamically add horizontal spacing (margins) to the grid only until vertical
// overflow (page scroll) is removed or we reach a max side spacing. This keeps
// global layout untouched per user request.
function enforceGridSideSpacing() {
  if (!grid || grid.hidden) return;
  // When infinite scroll is enabled we keep card width stable to prevent perceptible size shifts
  // as new batches append. So skip dynamic margin adjustments in that mode.
  if (infiniteScrollEnabled) return;
  // Only operate when library panel is active
  const libPanel = document.getElementById('library-panel');
  if (libPanel && libPanel.hasAttribute('hidden')) return;
  // Reset first so we measure true overflow baseline
  grid.style.marginLeft = '0px';
  grid.style.marginRight = '0px';
  const firstCard = grid.querySelector('.card');
  const minCardWidth = 140; // do not shrink cards narrower than this
  const maxSpacing = Math.floor(window.innerWidth * 0.18); // cap ~18% each side
  const step = 12; // px increment
  let spacing = 0;
  let attempts = 0;
  // Measure overflow using documentElement scrollHeight vs viewport height
  while (document.documentElement.scrollHeight > window.innerHeight && spacing <= maxSpacing && attempts < 60) {
    spacing += step;
    grid.style.marginLeft = spacing + 'px';
    grid.style.marginRight = spacing + 'px';
    // If cards collapse below minimum width, stop expanding spacing further
    const cw = firstCard ? firstCard.getBoundingClientRect().width : 999;
    if (cw < minCardWidth) break;
    attempts++;
  }
}
window.addEventListener('resize', () => {
  // Re-evaluate spacing after resize; defer to allow layout settle
  requestAnimationFrame(() => enforceGridSideSpacing());
});
// Enhanced selection functions
let lastSelectedPath = null;
// For shift-click range selection
function handleCardClick(event, path) {
  // If any items are selected, or if Ctrl/Shift is pressed, handle as selection
  if (selectedItems.size > 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
    if (event.shiftKey && lastSelectedPath) {
      // Shift-click: select range
      selectRange(lastSelectedPath, path);
    }
    else if (event.ctrlKey || event.metaKey) {
      // Ctrl-click: toggle individual item
      toggleSelection(event, path);
      lastSelectedPath = path;
    }
    else {
      // Normal click with items selected: toggle this item
      toggleSelection(event, path);
      lastSelectedPath = path;
    }
  }
  else {
    // No items selected and no modifiers: open in Player tab
    Player.open(path);
    try {
      // Update URL to a unique per-video route
      const enc = encodeURIComponent(path || '');
      const route = `#player/v/${enc}`;
      if (window.location.hash !== route) window.location.hash = route;
    }
    catch (_) {}
    try {
      if (window.tabSystem && typeof window.tabSystem.switchToTab === 'function') {
        window.tabSystem.switchToTab('player');
      }
    }
    catch (_) { }
  }
}
function selectRange(startPath, endPath) {
  const cards = Array.from(document.querySelectorAll('.card[data-path]'));
  const startIdx = cards.findIndex((card) => card.dataset.path === startPath);
  const endIdx = cards.findIndex((card) => card.dataset.path === endPath);
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
  }
  else {
    selectedItems.add(path);
  }
  updateSelectionUI();
  updateCardSelection(path);
}
function updateSelectionUI() {
  const count = selectedItems.size;
  if (count > 0) {
    show(selectionBar);
    selectionCount.textContent = `${count} selected`;
  }
  else {
    hide(selectionBar);
  }
}
function updateCardSelection(path) {
  const card = document.querySelector(`[data-path="${path}"]`);
  if (card) {
    const checkbox = card.querySelector('.card-checkbox');
    if (selectedItems.has(path)) {
      checkbox.classList.add('checked');
      checkbox.setAttribute('aria-checked', 'true');
    }
    else {
      checkbox.classList.remove('checked');
      checkbox.setAttribute('aria-checked', 'false');
    }
  }
}
// Selection controls
selectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.card[data-path]').forEach((card) => {
    const path = card.dataset.path;
    if (path) selectedItems.add(path);
  });
  updateSelectionUI();
  document.querySelectorAll('.card-checkbox')
  .forEach((cb) => cb.classList.add('checked'));
});
selectNoneBtn.addEventListener('click', () => {
  selectedItems.clear();
  updateSelectionUI();
  document.querySelectorAll('.card-checkbox')
  .forEach((cb) => cb.classList.remove('checked'));
});

// Bulk edit actions for selected items
if (bulkEditBtn && bulkEditPanel && bulkValueInput && bulkApplyBtn) {
  // Toggle panel visibility
  bulkEditBtn.addEventListener('click', () => {
    const vis = !bulkEditPanel.hidden;
    bulkEditPanel.hidden = vis; // toggle
    if (!vis) {
      try { bulkValueInput.focus(); }
      catch (_) {}
    }
  });
  // Ensure registries are available for suggestions
  async function ensureRegistries() {
    window.__REG = window.__REG || {};
    if (!window.__REG.performers) {
      try {
        const r = await fetch('/api/registry/performers');
        if (r.ok) {
          const j = await r.json();
          window.__REG.performers = Array.isArray(j?.data?.performers) ? j.data.performers : (Array.isArray(j?.performers) ? j.performers : []);
        }
        else { window.__REG.performers = []; }
      }
      catch (_) { window.__REG.performers = []; }
    }
    if (!window.__REG.tags) {
      try {
        const r = await fetch('/api/registry/tags');
        if (r.ok) {
          const j = await r.json();
          window.__REG.tags = Array.isArray(j?.data?.tags) ? j.data.tags : (Array.isArray(j?.tags) ? j.tags : []);
        }
        else { window.__REG.tags = []; }
      }
      catch (_) { window.__REG.tags = []; }
    }
  }
  function renderBulkSuggestions(kind, query) {
    if (!bulkSuggestions) return;
    const q = String(query || '').trim().toLowerCase();
    if (!q) { bulkSuggestions.innerHTML = ''; return; }
    const src = (kind === 'performer' ? (window.__REG?.performers || []) : (window.__REG?.tags || [])).map(x => x?.name).filter(Boolean);
    const matches = [];
    for (const name of src) {
      const low = String(name).toLowerCase();
      const idx = low.indexOf(q);
      if (idx === -1) continue;
      matches.push({name, rank: idx === 0 ? 0 : 1, pos: idx});
    }
    matches.sort((a,b) => a.rank - b.rank || a.pos - b.pos || a.name.localeCompare(b.name));
    const top = matches.slice(0, 10).map(m => m.name);
    const frag = document.createDocumentFragment();
    const label = document.createElement('div');
    label.className = 'hint-sm hint-sm--muted mb-4';
    label.textContent = 'Matches:';
    frag.appendChild(label);
    top.forEach((name) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-suggest';
      chip.title = 'Click to use';
      chip.textContent = name;
      chip.addEventListener('click', () => {
        bulkValueInput.value = name;
        bulkSuggestions.innerHTML = '';
        try { bulkValueInput.focus(); }
        catch (_) {}
      });
      frag.appendChild(chip);
    });
    bulkSuggestions.innerHTML = '';
    bulkSuggestions.appendChild(frag);
  }
  bulkValueInput.addEventListener('input', async () => {
    await ensureRegistries();
    const kind = (bulkKindSelect && bulkKindSelect.value) || 'tag';
    renderBulkSuggestions(kind, bulkValueInput.value);
  });
  if (bulkKindSelect) {
    bulkKindSelect.addEventListener('change', () => renderBulkSuggestions(bulkKindSelect.value, bulkValueInput.value));
  }
  async function bulkApply(kind, op, name) {
    const val = String(name || '').trim();
    if (!val) { notify('Enter a name to apply', 'error'); return; }
    const paths = Array.from(selectedItems || []);
    if (!paths.length) { notify('No items selected', 'error'); return; }
    let ok = 0, fail = 0;
    const epBase = kind === 'performer' ? '/api/media/performers' : '/api/media/tags';
    await Promise.all(paths.map(async (p) => {
      try {
        const url = new URL(`${epBase}/${op === 'remove' ? 'remove' : 'add'}`, window.location.origin);
        url.searchParams.set('path', p);
        url.searchParams.set(kind, val);
        const r = await fetch(url.toString(), { method: 'POST' });
        if (r.ok) ok++; else fail++;
      }
      catch (_) { fail++; }
    }));
    if (fail === 0) notify(`${op === 'remove' ? 'Removed' : 'Added'} ${val} ${kind} on ${ok} file(s)`, 'success');
    else notify(`${op === 'remove' ? 'Removed' : 'Added'} ${val} ${kind} on ${ok} file(s); ${fail} failed`, 'error');
    // Clear UI helpers
    bulkSuggestions.innerHTML = '';
    // Optional: keep selection; re-render current page to reflect labels next open
  }
  bulkApplyBtn.addEventListener('click', () => bulkApply((bulkKindSelect && bulkKindSelect.value) || 'tag', (bulkOpSelect && bulkOpSelect.value) || 'add', bulkValueInput.value));
  bulkValueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bulkApply((bulkKindSelect && bulkKindSelect.value) || 'tag', (bulkOpSelect && bulkOpSelect.value) || 'add', bulkValueInput.value);
    }
  });
}
// Folder picker
async function fetchDirs(path = '') {
  const url = new URL('/api/library', window.location.origin);
  if (path) url.searchParams.set('path', path);
  url.searchParams.set('page', '1');
  // Large page_size to avoid server-side file pagination affecting perceived results
  url.searchParams.set('page_size', '500');
  // we only need dirs;
  // dirs are not paginated server-side
  const res = await fetch(url, {headers: {Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (payload?.status !== 'success') {
    throw new Error(payload?.message || 'Unexpected response');
  }
  const data = payload.data || {};
  const dirs = Array.isArray(data.dirs) ? data.dirs : [];
  return {cwd: String(data.cwd || ''), dirs: dirs};
}
function renderCrumbs(path) {
  if (!crumbsEl) return;
  crumbsEl.textContent = '';
  const tpl = document.getElementById('crumbSegmentTemplate');
  const addSeg = (label, p, withDivider) => {
    if (withDivider) crumbsEl.appendChild(document.createTextNode(' / '));
    let node;
    if (tpl && tpl.content) {
      node = tpl.content.firstElementChild.cloneNode(true);
    }
    else {
      node = document.createElement('span');
      // fallback (template missing) per policy exception
      node.className = 'seg';
    }
    node.textContent = label;
    node.addEventListener('click', () => goTo(p));
    crumbsEl.appendChild(node);
  };
  addSeg('root', '', false);
  const segs = path.split('/').filter(Boolean);
  let acc = '';
  for (const seg of segs) {
    acc = acc ? acc + '/' + seg : seg;
    addSeg(seg, acc, true);
  }
}
async function renderDir(path) {
  pickerPath = path;
  renderCrumbs(path);
  dirlistEl.innerHTML = '';
  try {
    const {dirs} = await fetchDirs(path);
    if (path) {
      const tpl = document.getElementById('dirListItemTemplate');
      const up = tpl.content.firstElementChild.cloneNode(true);
      up.querySelector('.name').textContent = '.. (up)';
      up.addEventListener('click', () => {
        const segs = path.split('/').filter(Boolean);
        segs.pop();
        goTo(segs.join('/'));
        // -------------------------------------------------
        // Tags Registry Module
        // -------------------------------------------------
        const TagsRegistry = (() => {
          let listEl;
          let statusEl;
          let searchEl;
          let addBtn;
          let mergeBtn;
          let deleteBtn;
          let rewriteBtn;
          let exportBtn;
          let importBtn;
          let importFile;
          let importReplace;
          let tags = [];
          let selected = new Set();
          function initDom() {
            if (listEl) return;
            listEl = document.getElementById('tagsRegistryList');
            statusEl = document.getElementById('tagsRegistryStatus');
            searchEl = document.getElementById('tagsRegistrySearch');
            addBtn = document.getElementById('tagsRegistryAddBtn');
            mergeBtn = document.getElementById('tagsRegistryMergeBtn');
            deleteBtn = document.getElementById('tagsRegistryDeleteBtn');
            rewriteBtn = document.getElementById('tagsRegistryRewriteBtn');
            exportBtn = document.getElementById('tagsRegistryExportBtn');
            importBtn = document.getElementById('tagsRegistryImportBtn');
            importFile = document.getElementById('tagsRegistryImportFile');
            importReplace = document.getElementById('tagsRegistryImportReplace');
            wire();
          }
          function setStatus(msg) {
            if (statusEl) statusEl.textContent = msg;
          }
          function render() {
            if (!listEl) return;
            listEl.innerHTML = '';
            const term = (searchEl?.value || '').toLowerCase();
            const tpl = document.getElementById('registryItemTemplate');
            const items = tags.filter((t) => !term || t.name.toLowerCase().includes(term));
            for (const t of items) {
              let node;
              if (tpl && tpl.content) {
                node = tpl.content.firstElementChild.cloneNode(true);
              }
              else {
                // Fallback when template missing (policy exception, should not occur)
                node = document.createElement('div');
                node.className = 'registry-item';
              }
              if (selected.has(t.slug)) node.dataset.selected = '1';
              else delete node.dataset.selected;
              node.textContent = t.name;
              node.onclick = () => toggle(t.slug);
              node.ondblclick = () => rename(t);
              listEl.appendChild(node);
            }
            updateButtons();
          }
          function updateButtons() {
            if (mergeBtn) mergeBtn.disabled = selected.size !== 2;
            if (deleteBtn) deleteBtn.disabled = selected.size === 0;
          }
          async function fetchTags() {
            initDom();
            setStatus('Loading…');
            try {
              const r = await fetch('/api/registry/tags');
              const j = await r.json();
              tags = j?.data?.tags || [];
              setStatus(`${tags.length} tag(s)`);
              render();
            }
            catch (e) {
              setStatus('Failed');
            }
          }
          function toggle(slug) {
            if (selected.has(slug)) selected.delete(slug);
            else selected.add(slug);
            render();
          }
          async function add() {
            const name = prompt('New tag name:');
            if (!name) return;
            const r = await fetch('/api/registry/tags/create', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({name}) });
            if (r.ok) {
              showToast('Tag added', 'is-success');
              fetchTags();
            }
            else showToast('Failed', 'is-error');
          }
          async function rename(t) {
            const nn = prompt('Rename tag', t.name);
            if (!nn || nn === t.name) return;
            const r = await fetch('/api/registry/tags/rename', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({name: t.name, new_name: nn}) });
            if (r.ok) {
              showToast('Renamed', 'is-success');
              fetchTags();
            }
            else showToast('Rename failed', 'is-error');
          }
          async function del() {
            if (!confirm(`Delete ${selected.size} tag(s)?`)) return;
            for (const slug of Array.from(selected)) {
              await fetch('/api/registry/tags/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({name: slug}),
              });
            }
            selected.clear();
            fetchTags();
          }
          async function merge() {
            if (selected.size !== 2) return;
            const arr = [...selected];
            const into = prompt('Merge: tag that remains', arr[0]);
            if (!into) return;
            const from = arr.find((s) => s !== _slugify(into)) || arr[0];
            const url = `/api/registry/tags/merge?from_name=${encodeURIComponent(from)}&into_name=${encodeURIComponent(into)}`;
            const r = await fetch(url, {method: 'POST' });
            if (r.ok) {
              showToast('Merged', 'is-success');
              selected.clear();
              fetchTags();
            }
            else showToast('Merge failed', 'is-error');
          }
          async function rewrite() {
            const r = await fetch('/api/registry/tags/rewrite-sidecars', {method: 'POST' });
            if (r.ok) showToast('Rewritten', 'is-success');
            else showToast('Rewrite failed', 'is-error');
          }
          async function exportJson() {
            try {
              const r = await fetch('/api/registry/export');
              if (!r.ok) {
                throw new Error('HTTP ' + r.status);
              }
              const j = await r.json();
              const blob = new Blob([JSON.stringify({tags: j.data.tags}, null, 2)], {type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'tags-registry.json';
              a.click();
            }
            catch (e) {
              showToast('Export failed', 'is-error');
            }
          }
          function importJson() {
            importFile?.click();
          }
          function handleImport(e) {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const json = JSON.parse(reader.result);
                const payload = {tags: json.tags || json, replace: Boolean(importReplace?.checked) };
                const r = await fetch('/api/registry/import', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (r.ok) {
                  showToast('Imported', 'is-success');
                  fetchTags();
                }
                else showToast('Import failed', 'is-error');
              }
              catch (err) {
                showToast('Invalid JSON', 'is-error');
              }
            };
            reader.readAsText(f);
          }
          function wire() {
            searchEl?.addEventListener('input', render);
            addBtn?.addEventListener('click', add);
            mergeBtn?.addEventListener('click', merge);
            deleteBtn?.addEventListener('click', del);
            rewriteBtn?.addEventListener('click', rewrite);
            exportBtn?.addEventListener('click', exportJson);
            importBtn?.addEventListener('click', importJson);
            importFile?.addEventListener('change', handleImport);
          }
          function ensure() {
            initDom();
          }
          return {ensure: ensure, fetch: fetchTags};
        })();
        // -------------------------------------------------
        // Performers Registry Module (re-using existing performers tab if needed later)
        // -------------------------------------------------
        // Placeholder for future dedicated performers registry (already have performers tab)
        // -------------------------------------------------
        // Embedded Auto-Tag logic (Performers & Tags)
        // -------------------------------------------------
        function _parseList(val) {
          return (val || '').split(/[,\n]/).map((s) => s.trim())
          .filter(Boolean);
        }
        async function _autotagPreview(opts) {
          const payload = {
            path: opts.path || undefined,
            recursive: Boolean(opts.recursive),
            use_registry_performers: Boolean(opts.useRegistryPerformers),
            use_registry_tags: Boolean(opts.useRegistryTags),
            performers: opts.performers || [],
            tags: opts.tags || [],
            limit: opts.limit || 500,
          };
          const r = await fetch('/api/autotag/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const j = await r.json();
          if (!r.ok) {
            throw new Error(j?.message || 'Preview failed');
          }
          return j?.data || {};
        }
        async function _autotagScan(opts) {
          const payload = {
            path: opts.path || undefined,
            recursive: Boolean(opts.recursive),
            use_registry_performers: Boolean(opts.useRegistryPerformers),
            use_registry_tags: Boolean(opts.useRegistryTags),
            performers: opts.performers || [],
            tags: opts.tags || [],
          };
          const r = await fetch('/api/autotag/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => null);
            throw new Error((j && j.message) || 'Scan failed');
          }
          return true;
        }
        function wireEmbeddedAutotag() {
          // Tags panel elements only (performer autotag removed)
          const tPath = document.getElementById('autotagPathTags');
          const tRec = document.getElementById('autotagRecursiveTags');
          const tUse = document.getElementById('autotagUseRegTagsOnly');
          const tExtra = document.getElementById('autotagExtraTags');
          const tPrev = document.getElementById('autotagPreviewTagsBtn');
          const tScan = document.getElementById('autotagScanTagsBtn');
          const tStatus = document.getElementById('autotagTagResultsStatus');
          const tBody = document.getElementById('autotagTagResultsBody');
          if (tPrev) {
            tPrev.addEventListener('click', async () => {
              tStatus.textContent = 'Previewing…';
              tBody.innerHTML = '';
              tScan.disabled = true;
              try {
                const data = await _autotagPreview({
                  path: tPath.value.trim(),
                  recursive: tRec.checked,
                  useRegistryTags: tUse.checked,
                  tags: _parseList(tExtra.value),
                });
                const rows = data.candidates || [];
                tStatus.textContent = rows.length ? `${rows.length} match(es)` : 'No matches';
                rows.forEach((rw) => {
                  const tpl = document.getElementById('autotagRowTemplate');
                  const tr = tpl.content.firstElementChild.cloneNode(true);
                  tr.querySelector('.file').textContent = rw.file;
                  tr.querySelector('.tags').textContent = (rw.tags || []).join(', ');
                  tBody.appendChild(tr);
                });
                tScan.disabled = rows.length === 0;
              }
              catch (err) {
                tStatus.textContent = err.message || 'Preview failed';
              }
            });
          }
          if (tScan) {
            tScan.addEventListener('click', async () => {
              tScan.disabled = true;
              try {
                await _autotagScan({
                  path: tPath.value.trim(),
                  recursive: tRec.checked,
                  useRegistryTags: tUse.checked,
                  tags: _parseList(tExtra.value),
                });
                showToast('Auto‑tag job queued', 'is-success');
              }
              catch (err) {
                showToast(err.message || 'Queue failed', 'is-error');
              }
            });
          }
        }
        // Hook tab activation to load registries / autotag lazily
        document.addEventListener('click', (e) => {
          const btn = e.target.closest && e.target.closest('.tab-button');
          if (!btn) return;
          const tab = btn.getAttribute('data-tab');
          if (tab === 'tags') {
            TagsRegistry.ensure();
            TagsRegistry.fetch();
            wireEmbeddedAutotag();
          }
        });
      });
      dirlistEl.appendChild(up);
    }
    dirs.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    for (const d of dirs) {
      const tpl = document.getElementById('dirListItemTemplate');
      const item = tpl.content.firstElementChild.cloneNode(true);
      const name = d.name || String(d);
      const dpath = d.path || (path ? `${path}/${name}` : name);
      item.querySelector('.name').textContent = name;
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
  }
  catch (e) {
    const err = document.createElement('div');
    err.className = 'dir';
    err.textContent = 'Failed to list directories.';
    dirlistEl.appendChild(err);
  }
}
function openFolderPicker() {
  show(modal);
  const val = (folderInput.value || '').trim();
  const start = isAbsolutePath(val) ? '' : currentPath();
  renderDir(start);
}
function closeFolderPicker() {
  hide(modal);
}
function goTo(path) {
  renderDir(path);
}
function choose(path) {
  folderInput.value = path || '';
  closeFolderPicker();
  loadLibrary();
}
chooseBtn.addEventListener('click', () => choose(pickerPath));
cancelBtn.addEventListener('click', () => closeFolderPicker());
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeFolderPicker();
});
async function setRoot(val) {
  const rootVal = (val || '').trim();
  if (!rootVal) return;
  if (!isAbsolutePath(rootVal)) {
    notify('Please enter an absolute path (e.g., /Volumes/Media or ~/Movies).', 'error');
    return;
  }
  try {
    // Validate path first to prevent 400s
    const tp = await fetch('/api/testpath?' + new URLSearchParams({path: rootVal}), {method: 'POST' });
    if (!tp.ok) {
      throw new Error('Path check failed (HTTP ' + tp.status + ')');
    }
    const tj = await tp.json();
    const tdata = tj?.data || {};
    if (!tdata.exists || !tdata.is_dir) {
      throw new Error('Path does not exist or is not a directory');
    }
    // Set root on the server
    const sr = await fetch('/api/setroot?' + new URLSearchParams({root: rootVal}), {method: 'POST' });
    if (!sr.ok) {
      throw new Error('HTTP ' + sr.status);
    }
    const sjson = await sr.json();
    if (sjson?.status !== 'success') {
      throw new Error(sjson?.message || 'Failed to set root');
    }
    // After setting root, clear the input so it's ready for relative paths
    const newRoot = String(sjson.data.root || rootVal);
    folderInput.value = '';
    folderInput.placeholder = `Root: ${newRoot} — type a relative path to browse, or an absolute path to change root`;
    currentPage = 1;
    notify(`Root set to ${newRoot}`, 'success');
    await loadLibrary();
  }
  catch (err) {
    notify(`Failed to set root: ${err && err.message ? err.message : 'Ensure the directory exists and is accessible.'}`, 'error');
  }
}
// Single-input behavior: Enter applies relative browse or sets root if absolute
folderInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const val = (folderInput.value || '').trim();
  currentPage = 1;
  // Reset to first page when changing folders
  if (!val) {
    await loadLibrary();
    return;
  }
  if (isAbsolutePath(val)) {
    await setRoot(val);
  }
  else {
    await loadLibrary();
  }
});
// Optional pick root button (present only in Settings panel after header removal)
const pickRootBtn = document.getElementById('pickRootBtn');
if (pickRootBtn) {
  pickRootBtn.addEventListener('click', () => openFolderPicker());
}
// Tab Router for URL-based navigation
class TabRouter {
  constructor (tabSystem) {
    this.tabSystem = tabSystem;
    // Persist last active tab across reloads;
    // fall back to library.
    try {
      const saved = getLocalStorageItem('activeTab');
      this.defaultTab = saved || 'library';
    }
    catch (e) {
      this.defaultTab = 'library';
    }
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
    const raw = window.location.hash.slice(1);
    // Parse hash: expected formats
    //  - "library" (tab only)
    //  - "player/v/<encodedPath>" (open video in player)
    const segs = (raw || '').split('/').filter(Boolean);
    const tabId = segs[0] || this.defaultTab;
    // Track navigation history
    if (this.history.length === 0 || this.history[this.history.length - 1] !== raw) {
      this.history.push(raw || tabId);
      // Keep history reasonable size
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }
    }
    // Only switch if it's a valid tab and different from current
    if (this.tabSystem.tabs.has(tabId) && tabId !== this.tabSystem.activeTab) {
      // Switch without updating URL to avoid infinite loop
      this.tabSystem.switchToTab(tabId, false);
    }
    else if (!this.tabSystem.tabs.has(tabId) && raw) {
      // Invalid tab in URL, redirect to default
      this.updateUrl(this.defaultTab);
    }
    // Handle deep routes (video open in player)
    try {
      if (tabId === 'player' && segs[1] === 'v' && segs[2]) {
        const enc = segs[2];
        const path = decodeURIComponent(enc);
        if (path && window.Player && typeof window.Player.open === 'function') {
          window.Player.open(path);
        }
      }
    }
    catch (_) {}
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
  constructor () {
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
    tabButtons.forEach((button) => {
      const tabId = button.dataset.tab;
      const panel = document.getElementById(`${tabId}-panel`);
      if (panel) {
        this.tabs.set(tabId, {button, panel});
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
          default: return;
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
      if (isActive) show(tab.panel);
      else hide(tab.panel);
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
    window.dispatchEvent(
      new CustomEvent('tabchange', {
        detail: {activeTab: tabId, previousTab: previousTab},
      }),
    );
    // Persist active tab (ignore failures in private modes)
    try {
      setLocalStorageItem('activeTab', tabId);
    }
    catch (e) { }
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
    // Create panel. Accept either:
    // - a template id string (e.g. '#myTemplate') to clone
    // - a HTML string (panelContent) which will be set as innerHTML (fallback)
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.role = 'tabpanel';
    panel.setAttribute('aria-labelledby', `${tabId}-tab`);
    panel.id = `${tabId}-panel`;
    hide(panel);
    // If caller passed a template reference (string '#id' or element), prefer cloning
    try {
      let tpl = null;
      if (typeof panelContent === 'string' && panelContent.startsWith('#')) {
        tpl = document.getElementById(panelContent.slice(1));
        if (tpl && tpl.tagName === 'TEMPLATE') {
          panel.appendChild(tpl.content.cloneNode(true));
        }
        else {
          // fallback: treat as HTML id not found -> leave empty
          panel.innerHTML = '';
        }
      }
      else if (panelContent && panelContent.tagName === 'TEMPLATE') {
        panel.appendChild(panelContent.content.cloneNode(true));
      }
      else if (typeof panelContent === 'string') {
        // backward-compat: accept raw HTML string
        panel.innerHTML = panelContent;
      }
      else {
        // unknown type: leave empty
        panel.innerHTML = '';
      }
    }
    catch (e) {
      panel.innerHTML = typeof panelContent === 'string' ? panelContent : '';
    }
    tabPanels.appendChild(panel);
    // Register the new tab
    this.tabs.set(tabId, {button, panel});
    // Add event listeners
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchToTab(tabId);
    });
    return {button, panel};
  }
}
// Initialize tab system when DOM is ready
let tabSystem;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    tabSystem = new TabSystem();
    wireSettings();
    setupViewportFitPlayer();
    // Tags are fetched on first tab activation or when URL hash is #tags.
    // Use window.Tags.logAll() in console if you want to print tags on demand.
  });
}
else {
  tabSystem = new TabSystem();
  wireSettings();
  setupViewportFitPlayer();
  // Tags are fetched on first tab activation or when URL hash is #tags.
  // Use window.Tags.logAll() in console if you want to print tags on demand.
}
// Export for potential external use
window.TabRouter = TabRouter;
window.TabSystem = TabSystem;
window.tabSystem = tabSystem;
// Ensure video + controls fit in viewport without vertical scroll (YouTube-like behavior)
function setupViewportFitPlayer() {
  const playerPanel = document.getElementById('player-panel');
  const playerBar = document.getElementById('playerBar');
  const videoStage = document.getElementById('videoStage');
  const vid = document.getElementById('playerVideo');
  if (!playerPanel || !playerBar || !vid || !videoStage) return;
  function recompute() {
    // If panel is hidden (inactive tab), defer sizing until it's shown to avoid 0 height measurements
    if (playerPanel.hasAttribute('hidden') || playerPanel.classList.contains('hidden')) return;
    // Panel height already excludes header (sticky header outside main scroll)
    const panelH = playerPanel.getBoundingClientRect().height;
    if (!panelH) {
      return; // guard against transient 0-height during layout passes
    }
    // Overlay bar sits over video;
    // treat bar height negligible for layout
    const spare = 20;
    // minimal gap/padding reserve
    const maxH = panelH - spare;
    // Maintain 16:9 aspect by width
    const stageWidth = videoStage.getBoundingClientRect().width;
    const ideal = stageWidth / (16 / 9);
    const finalH = Math.min(ideal, maxH);
    document.documentElement.style.setProperty('--player-max-h', finalH + 'px');
  }
  ['resize', 'orientationchange'].forEach((ev) => window.addEventListener(ev, recompute));
  vid.addEventListener('loadedmetadata', recompute);
  // Recompute when the player tab becomes active (after it is shown)
  window.addEventListener('tabchange', (e) => {
    try {
      if (e && e.detail && e.detail.activeTab === 'player') {
        // run twice (immediate + after potential layout/scrollbars settle)
        setTimeout(recompute, 0);
        setTimeout(recompute, 120);
      }
    }
    catch (_) { /* ignore */ }
  });
  // Slight delay to allow fonts/layout settle
  // Only attempt initial measurements if the player tab is already active (rare on first load)
  if (!(playerPanel.hasAttribute('hidden') || playerPanel.classList.contains('hidden'))) {
    setTimeout(recompute, 0);
    setTimeout(recompute, 150);
  }
}
// --- List Tab (compact table view) ---
(function setupListTab() {
  const COL_LS_KEY = 'mediaPlayer:list:columns';
  const SORT_LS_KEY = 'mediaPlayer:list:sort';
  const WRAP_LS_KEY = 'mediaPlayer:list:wrap';
  const PAGE_SIZE_LS_KEY = 'mediaPlayer:list:pageSize';
  const AUTOSIZED_ONCE_LS_KEY = 'mediaPlayer:list:autosizedOnce';
  // Lightweight metadata cache for list rows (used to populate codec columns when missing)
  function fetchMetadataCached(path) {
    try {
      if (!path) return Promise.resolve(null);
      window.__metadataByPath = window.__metadataByPath || {};
      window.__metadataInflight = window.__metadataInflight || {};
      if (window.__metadataByPath[path]) return Promise.resolve(window.__metadataByPath[path]);
      if (window.__metadataInflight[path]) return window.__metadataInflight[path];
      const u = new URL('/api/metadata', window.location.origin);
      u.searchParams.set('path', path);
      const p = fetch(u.toString())
        .then((r) => r.json())
        .then((j) => j?.data || null)
        .catch(() => null)
        .then((d) => {
          if (d) window.__metadataByPath[path] = d;
          try { delete window.__metadataInflight[path]; }
          catch(_) { }
          return d;
        });
      window.__metadataInflight[path] = p;
      return p;
    }
    catch(_) {
      return Promise.resolve(null);
    }
  }
  // Compute the natural non-wrapping width for a given column id based on current DOM
  function computeAutoWidth(panel, colId) {
    try {
      const th = panel.querySelector(`#listTable th.col-${colId}`);
      const tds = Array.from(panel.querySelectorAll(`#listTable td.col-${colId}`));
      if (!th) return null;
      const els = [th, ...tds];
      const saved = new Map();
      for (const el of els) {
        saved.set(el, {
          width: el.style.width,
          minWidth: el.style.minWidth,
          maxWidth: el.style.maxWidth,
          whiteSpace: el.style.whiteSpace,
        });
        el.style.width = 'auto';
        el.style.minWidth = '0';
        el.style.maxWidth = 'none';
        el.style.whiteSpace = 'nowrap';
      }
      let maxW = Math.ceil(th.scrollWidth);
      for (const td of tds) {
        const w = Math.ceil(td.scrollWidth);
        if (w > maxW) maxW = w;
      }
      const target = Math.max(60, maxW + 12);
      for (const el of els) {
        const s = saved.get(el) || {};
        if (s.width != null) el.style.width = s.width; else el.style.removeProperty('width');
        if (s.minWidth != null) el.style.minWidth = s.minWidth; else el.style.removeProperty('min-width');
        if (s.maxWidth != null) el.style.maxWidth = s.maxWidth; else el.style.removeProperty('max-width');
        if (s.whiteSpace != null) el.style.whiteSpace = s.whiteSpace; else el.style.removeProperty('white-space');
      }
      return target;
    }
    catch(_) {
      return null;
    }
  }
  // Default column definitions (id, label, width px, visible, accessor)
  const DEFAULT_COLS = [
    {id: 'open', label: 'Link', width: 44, visible: true, render: (td, f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = 'Open in player';
      btn.setAttribute('aria-label', 'Open in player');
      btn.textContent = '↗';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { if (window.tabSystem) window.tabSystem.switchToTab('player'); }
        catch(_) { }
        try { if (window.Player?.open) window.Player.open(f.path); }
        catch(_) { }
      });
      td.appendChild(btn);
    } },
    {id: 'name', label: 'Name', width: 260, visible: true, get: (f) => {
      let s = f.title || f.name || f.path || '';
      const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
      if (slash >= 0) s = s.slice(slash + 1);
      const dot = s.lastIndexOf('.');
      if (dot > 0) s = s.slice(0, dot);
      return s;
    } },
    {id: 'path', label: 'Path', width: 320, visible: true, get: (f) => f.path || '' },
    {id: 'duration', label: 'Duration', width: 90, visible: true, render: (td, f) => {
      const v = Number(f.duration);
      td.textContent = Number.isFinite(v) && v > 0 ? fmtDuration(v) : '';
      if ((!Number.isFinite(v) || v <= 0) && f.path) {
        fetchMetadataCached(f.path).then((d) => {
          if (!d || !td.isConnected) return;
          const sec = Number(d.duration);
          if (Number.isFinite(sec) && sec > 0) td.textContent = fmtDuration(sec);
        });
      }
    } },
    {id: 'size', label: 'Size', width: 90, visible: true, get: (f) => fmtSize(Number(f.size)) },
    {id: 'width', label: 'Width', width: 90, visible: true, render: (td, f) => {
      const w = Number(f.width);
      td.textContent = Number.isFinite(w) && w > 0 ? String(w) : '';
      if ((!Number.isFinite(w) || w <= 0) && f.path) {
        fetchMetadataCached(f.path).then((d) => {
          if (!d || !td.isConnected) return;
          const val = Number(d.width);
          if (Number.isFinite(val) && val > 0) td.textContent = String(val);
        });
      }
    } },
    {id: 'height', label: 'Height', width: 90, visible: true, render: (td, f) => {
      const h = Number(f.height);
      td.textContent = Number.isFinite(h) && h > 0 ? String(h) : '';
      if ((!Number.isFinite(h) || h <= 0) && f.path) {
        fetchMetadataCached(f.path).then((d) => {
          if (!d || !td.isConnected) return;
          const val = Number(d.height);
          if (Number.isFinite(val) && val > 0) td.textContent = String(val);
        });
      }
    } },
    {id: 'created', label: 'Created', width: 160, visible: false, get: (f) => {
      const t = Number(f.ctime) || Number(f.birthtime) || Number(f.mtime) || 0;
      return formatDateTime(t);
    }},
    {id: 'mtime', label: 'Modified', width: 160, visible: true, get: (f) => formatDateTime(f.mtime) },
    {id: 'codec', label: 'Video Codec', width: 130, visible: false, render: (td, f) => {
      const initial = (f.video_codec || f.vcodec || f.vcodec_name || f.codec || f.codec_name || '').toString();
      td.textContent = initial || '—';
      if (!initial && f.path) {
        fetchMetadataCached(f.path).then((d) => {
          if (!d || !td.isConnected) return;
          const v = (d.vcodec || d.video_codec || '').toString();
          if (v) td.textContent = v;
        });
      }
    } },
    {id: 'acodec', label: 'Audio Codec', width: 130, visible: false, render: (td, f) => {
      const initial = (f.audio_codec || f.acodec || f.acodec_name || f.audio_codec_name || '').toString();
      td.textContent = initial || '—';
      if (!initial && f.path) {
        fetchMetadataCached(f.path).then((d) => {
          if (!d || !td.isConnected) return;
          const v = (d.acodec || d.audio_codec || '').toString();
          if (v) td.textContent = v;
        });
      }
    } },
    {id: 'format', label: 'Format', width: 90, visible: true, get: (f) => {
      const p = f.path || f.name || '';
      const m = /\.([^.\/]+)$/.exec(p);
      return m ? m[1].toLowerCase() : '';
    }},
    {id: 'bitrate', label: 'Bitrate', width: 110, visible: false, render: (td, f) => {
      const renderBps = (bps) => {
        const mbps = bps / 1_000_000;
        return mbps >= 0.1 ? `${mbps.toFixed(2)} Mbps` : `${Math.round(bps/1000)} kbps`;
      };
      const dur = Number(f.duration) || 0;
      const size = Number(f.size) || 0;
      if (dur > 0 && size > 0) {
        td.textContent = renderBps((size * 8) / dur);

      // (Graph module moved out of this render function)
      }
      else {
        td.textContent = '';
        if (f.path) {
          fetchMetadataCached(f.path).then((d) => {
            if (!d || !td.isConnected) return;
            const bps = Number(d.bitrate);
            if (Number.isFinite(bps) && bps > 0) td.textContent = renderBps(bps);
            else {
              const dur2 = Number(d.duration) || 0; const size2 = Number(d.size) || size;
              if (dur2 > 0 && size2 > 0) td.textContent = renderBps((size2 * 8) / dur2);
            }
          });
        }
      }
    } },
  ];
  // Artifact/sidecar presence helpers and columns (hidden by default; enable as needed)
  function hasArtifact(f, keys) {
    for (const k of keys) { if (f && f[k]) return true; }
    const art = f && f.artifacts || {};
    for (const k of keys) { if (art && art[k]) return true; }
    const sc = f && f.sidecars;
    if (Array.isArray(sc)) { for (const k of keys) { if (sc.includes(k)) return true; } }
    return false;
  }
  const ART_COLS = [
    {id: 'art-meta',   label: 'Meta',   keys: ['has_metadata','metadata'], width: 54},
    {id: 'art-thumb',  label: 'Thumb',  keys: ['has_thumbnail','thumbnail','thumbnails'], width: 54},
    {id: 'art-sprite', label: 'Sprite', keys: ['has_sprites','sprites'], width: 54},
    {id: 'art-preview',label: 'Preview',keys: ['has_preview','preview','previewUrl'], width: 60},
    {id: 'art-wave',   label: 'Wave',   keys: ['has_waveform','waveform'], width: 54},
    {id: 'art-scenes', label: 'Scenes', keys: ['has_scenes','scenes','chapters'], width: 60},
    {id: 'art-faces',  label: 'Faces',  keys: ['has_faces','faces'], width: 54},
    {id: 'subs',       label: 'Subs',   keys: ['has_subtitles','subtitles'], width: 50},
    {id: 'art-heat',   label: 'Heat',   keys: ['has_heatmaps','heatmaps'], width: 54},
    {id: 'art-motion', label: 'Motion', keys: ['has_motion','motion'], width: 60},
  ];
  for (const ac of ART_COLS) {
    DEFAULT_COLS.push({ id: ac.id, label: ac.label, width: ac.width, visible: false,
      render: (td, f) => {
        let present = hasArtifact(f, ac.keys);
        const span = document.createElement('span');
        const apply = (ok) => {
          span.className = ok ? 'status status--present' : 'status status--missing';
          span.title = ok ? `${ac.label} present` : `${ac.label} missing`;
          span.textContent = ok ? '✓' : '✕';
        };
        apply(present);
        // Special-case Metadata: if unknown from quick flags, confirm via metadata fetch
        if (!present && ac.id === 'art-meta' && f && f.path) {
          fetchMetadataCached(f.path).then((d) => {
            if (!td.isConnected) return;
            apply(Boolean(d));
          });
        }
        td.appendChild(span);
      }
    });
  }
  // Merged Artifacts column using chips UI (visible by default)
  DEFAULT_COLS.push({ id: 'artifacts', label: 'Artifacts', width: 220, visible: true,
    render: (td, f) => {
      const cont = document.createElement('div');
      cont.className = 'chips-list';
      const items = [
        { key: 'meta',      label: 'Meta',    keys: ['has_metadata','metadata'] },
        { key: 'thumbnail', label: 'Thumb',   keys: ['has_thumbnail','thumbnail','thumbnails'] },
        { key: 'sprites',   label: 'Sprite',  keys: ['has_sprites','sprites'] },
        { key: 'preview',   label: 'Preview', keys: ['has_preview','preview','previewUrl'] },
        { key: 'chapters',  label: 'Scenes',  keys: ['has_scenes','scenes','chapters'] },
        { key: 'subtitles', label: 'Subs',    keys: ['has_subtitles','subtitles'] },
        { key: 'heatmaps',  label: 'Heat',    keys: ['has_heatmaps','heatmaps'] },
        { key: 'faces',     label: 'Faces',   keys: ['has_faces','faces'] },
        { key: 'waveform',  label: 'Wave',    keys: ['has_waveform','waveform'] },
        { key: 'motion',    label: 'Motion',  keys: ['has_motion','motion'] },
      ];
      // Render a chip for each artifact: green if present, red with ✕ if missing
      for (const it of items) {
        try {
          const present = hasArtifact(f, it.keys);
          const chip = document.createElement('span');
          chip.dataset.key = it.key || it.label.toLowerCase();
          chip.className = present ? 'chip chip--ok' : 'chip chip--missing';
          chip.textContent = present ? it.label : `✕ ${it.label}`;
          chip.title = present ? `${it.label} present` : `${it.label} missing`;
          cont.appendChild(chip);
        }
        catch(_) { }
      }
      // Lazy-check metadata presence and update the Meta chip if needed
      try {
        if (f && f.path) {
          const metaChip = () => cont.querySelector('[data-key="meta"]');
          const metaInitiallyPresent = hasArtifact(f, ['has_metadata','metadata']);
          if (!metaInitiallyPresent) {
            fetchMetadataCached(f.path).then((d) => {
              if (!td.isConnected) return;
              if (d) {
                const c = metaChip();
                if (c) {
                  c.className = 'chip chip--ok';
                  c.textContent = 'Meta';
                  c.title = 'Meta present';
                }
              }
            });
          }
        }
      }
      catch(_) { }
      td.appendChild(cont);
    }
  });
  function pad2(n) { n = Number(n)||0; return n < 10 ? '0'+n : String(n); }
  function formatDateTime(sec) {
    const t = Number(sec)||0; if (!t) return '';
    const d = new Date(t*1000);
    const Y = d.getFullYear();
    const M = pad2(d.getMonth()+1);
    const D = pad2(d.getDate());
    const h = pad2(d.getHours());
    const m = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    return `${Y}/${M}/${D} ${h}:${m}:${s}`;
  }
  function loadCols() {
    try {
      const raw = getLocalStorageItem(COL_LS_KEY, {type: 'json', fallback: null});
      if (!raw) return DEFAULT_COLS.map((c) => ({ ...c}));
      // Merge to keep future default additions
      const map = new Map(raw.map((c) => [c.id, c]));
      return DEFAULT_COLS.map((d) => ({ ...d, ...(map.get(d.id) || {}) }));
    }
    catch (_) {
      return DEFAULT_COLS.map((c) => ({ ...c}));
    }
  }
  function saveCols(cols) {
    try {
      setLocalStorageItem(String(COL_LS_KEY), cols, {type: 'json'});
    }
    catch (_) { }
  }
  function addListTab(ts) {
    // Require existing static panel
    let panel = document.getElementById('list-panel');
    if (!panel) return null;
    const headRow = panel.querySelector('#listHeadRow');
    const tbody = panel.querySelector('#listTbody');
    const table = panel.querySelector('#listTable');
    const pagerPrev = panel.querySelector('#listPrevBtn');
    const pagerNext = panel.querySelector('#listNextBtn');
    const pageInfo = panel.querySelector('#listPageInfo');
    const colsBtn = panel.querySelector('#listColumnsBtn');
    const wrapBtn = panel.querySelector('#listWrapToggle');
    const colsPanel = panel.querySelector('#listColumnsPanel');
    const colsClose = panel.querySelector('#listColumnsClose');
    const colsBody = panel.querySelector('#listColumnsBody');
    const cellTpl = document.getElementById('listCellTemplate');
    const itemTpl = document.getElementById('listColumnItemTemplate');
    const pageSizeSelect = panel.querySelector('#listPageSize');
    const spinner = panel.querySelector('#listSpinner');
    // Local state for List tab
    let cols = loadCols();
    let draggingCol = null;
    let filesCache = [];
    let total = 0;
    let listClientAllMode = false;
    let page = 1;
    let pageSize = (() => {
      try { const raw = getLocalStorageItem(PAGE_SIZE_LS_KEY); const n = Number(raw); return (Number.isFinite(n) && n > 0) ? n : 50; }
    catch(_) { return 50; } })();
    // List filters state and helpers (persisted per tab)
    const LIST_FILTERS_LS_KEY = 'list.filters.v1';
    function loadListFilters() {
      try { return getLocalStorageJSON(LIST_FILTERS_LS_KEY, {}) || {}; }
    catch(_) { return {}; } }
    function saveListFilters(obj) {
      try { setLocalStorageJSON(LIST_FILTERS_LS_KEY, obj || {}); }
    catch(_) { /* no-op */ } }
    let listFilters = loadListFilters();
    function hasAnyFilters(obj) { return obj && Object.keys(obj).length > 0; }
    // Wrap toggle helpers
    function wrapEnabled() {
      try { return getLocalStorageBoolean(WRAP_LS_KEY, true); }
      catch(_) { return true; }
    }
    function setWrapEnabled(v) {
      try { setLocalStorageBoolean(WRAP_LS_KEY, Boolean(v)); }
      catch(_) { }
    }
    function applyWrapUI() {
      const enabled = wrapEnabled();
      try {
        if (table) table.classList.toggle('nowrap', !enabled);
        if (wrapBtn) {
          wrapBtn.textContent = `Wrap: ${enabled ? 'On' : 'Off'}`;
          wrapBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }
      }
      catch(_) { }
    }
    if (wrapBtn) {
      applyWrapUI();
      wrapBtn.addEventListener('click', () => { setWrapEnabled(!wrapEnabled()); applyWrapUI(); });
    }
    // Per-column filter popover
    let filterMenuEl = null;
    function uniqueValues(arr, selector) {
      try {
        const seen = new Set();
        const out = [];
        (arr || []).forEach((it) => {
          let v = selector ? selector(it) : it;
          if (v == null) v = '';
          v = String(v);
          if (!seen.has(v)) { seen.add(v); out.push(v); }
        });
        return out.sort();
      }
      catch (_) { return []; }
    }
    function closeFilterMenu() {
      if (filterMenuEl && filterMenuEl.parentNode) filterMenuEl.parentNode.removeChild(filterMenuEl);
      filterMenuEl = null;
      document.removeEventListener('click', onDocClick, true);
    }
    function onDocClick(e) {
      if (!filterMenuEl) return;
      if (filterMenuEl.contains(e.target)) return;
      closeFilterMenu();
    }
    function isArtifactsFilterActive() {
      const keys = ['meta','thumbnail','sprites','chapters','subtitles','heatmaps','faces','preview'];
      return keys.some((k)=> listFilters && listFilters[k]);
    }
    function isFilterActiveForKey(key, colId) {
      if (colId === 'artifacts') return isArtifactsFilterActive();
      return listFilters && listFilters[key];
    }
    function setFilterForKey(key, payload) {
      if (!payload || (typeof payload === 'object' && !Object.keys(payload).length)) delete listFilters[key];
      else listFilters[key] = payload;
      saveListFilters(listFilters);
    }
    function openFilterMenu(anchorTh, colId) {
      closeFilterMenu();
      const menu = document.createElement('div');
      menu.className = 'list-filter-menu';
      const keyMap = { format:'format', codec:'vcodec', vcodec:'vcodec', acodec:'acodec', bitrate:'bitrate', duration:'duration', size:'size', width:'width', height:'height', mtime:'mtime', created:'ctime', artifacts:'artifacts' };
      const key = keyMap[colId] || null;
      function row(el){ const r=document.createElement('div'); r.className='row'; if (el) r.appendChild(el); return r; }
      function btn(label){ const b=document.createElement('button'); b.className='btn-sm'; b.textContent=label; return b; }
      if (key === 'format' || key === 'vcodec' || key === 'acodec') {
        const values = key==='format'
          ? uniqueValues(filesCache, (f)=>{ const p=f.path||f.name||''; const m=/\.([^.\/]+)$/.exec(p); return m?m[1].toLowerCase():''; })
          : (key==='vcodec' ? uniqueValues(filesCache, (f)=> f.video_codec||f.vcodec||f.vcodec_name||'') : uniqueValues(filesCache, (f)=> f.audio_codec||f.acodec||f.acodec_name||''));
        const selected = (listFilters[key] && Array.isArray(listFilters[key].in)) ? new Set(listFilters[key].in.map(String)) : new Set();
        const wrap = document.createElement('div'); wrap.className='values';
        values.slice(0, 50).forEach((val)=>{
          const lab=document.createElement('label');
          const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=selected.has(val); cb.value=val;
          const sp=document.createElement('span'); sp.textContent = val || '—';
          lab.appendChild(cb); lab.appendChild(sp); wrap.appendChild(lab);
        });
        menu.appendChild(wrap);
        const footer=document.createElement('div'); footer.className='footer';
        const clearB=btn('Clear'); const applyB=btn('Apply');
        clearB.addEventListener('click', async ()=>{ delete listFilters[key]; saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        applyB.addEventListener('click', async ()=>{
          const vals=Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb)=>cb.value);
          if (vals.length) setFilterForKey(key, { in: vals }); else delete listFilters[key];
          saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage();
        });
        footer.appendChild(clearB); footer.appendChild(applyB); menu.appendChild(footer);
      }
      else if (key === 'bitrate' || key==='duration' || key==='size' || key==='width' || key==='height') {
        const cur = listFilters[key] || {};
        const sel=document.createElement('select'); sel.className='control-select';
        sel.innerHTML = '<option value="">—</option><option value="gt">&gt;</option><option value="lt">&lt;</option><option value="eq">=</option>';
        const inp=document.createElement('input'); inp.type='number'; inp.className='chips-input'; inp.placeholder='value';
        const op = cur.gt!=null?'gt':cur.lt!=null?'lt':cur.eq!=null?'eq':''; if (op) sel.value=op; const vv=(cur.gt??cur.lt??cur.eq); if (vv!=null) inp.value=String(vv);
        const r=document.createElement('div'); r.className='row'; r.appendChild(sel); r.appendChild(inp); menu.appendChild(r);
        const footer=document.createElement('div'); footer.className='footer'; const clearB=btn('Clear'); const applyB=btn('Apply');
        clearB.addEventListener('click', async ()=>{ delete listFilters[key]; saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        applyB.addEventListener('click', async ()=>{ const op=sel.value; const v=Number(inp.value); if (op && Number.isFinite(v)) setFilterForKey(key, { [op]: v }); else delete listFilters[key]; saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        footer.appendChild(clearB); footer.appendChild(applyB); menu.appendChild(footer);
      }
      else if (key === 'mtime' || key === 'ctime') {
        const cur = listFilters[key] || {};
        const mkInp = (val)=>{ const i=document.createElement('input'); i.type='datetime-local'; i.className='chips-input'; if (val) { const d=new Date(val*1000); const pad=(n)=>String(n).padStart(2,'0'); i.value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; } return i; };
        const afterInp = mkInp(cur.after); const beforeInp = mkInp(cur.before);
        const wrap = document.createElement('div'); wrap.className='row'; wrap.appendChild(afterInp); const span=document.createElement('span'); span.className='hint-sm'; span.textContent='to'; wrap.appendChild(span); wrap.appendChild(beforeInp); menu.appendChild(wrap);
        const footer=document.createElement('div'); footer.className='footer'; const clearB=btn('Clear'); const applyB=btn('Apply');
        clearB.addEventListener('click', async ()=>{ delete listFilters[key]; saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        applyB.addEventListener('click', async ()=>{ const toEpoch=(el)=>{ const v=el.value; if (!v) return null; const t=new Date(v).getTime(); return Number.isFinite(t)?Math.floor(t/1000):null; }; const a=toEpoch(afterInp); const b=toEpoch(beforeInp); const obj={}; if (a!=null) obj.after=a; if (b!=null) obj.before=b; if (Object.keys(obj).length) setFilterForKey(key, obj); else delete listFilters[key]; saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        footer.appendChild(clearB); footer.appendChild(applyB); menu.appendChild(footer);
      }
      else if (colId === 'artifacts') {
        const items = [
          { k:'meta', label:'Meta' }, { k:'thumbnail', label:'Thumb' }, { k:'sprites', label:'Sprite' }, { k:'chapters', label:'Scenes' },
          { k:'subtitles', label:'Subs' }, { k:'heatmaps', label:'Heat' }, { k:'faces', label:'Faces' }, { k:'preview', label:'Preview' }
        ];
        const wrap = document.createElement('div'); wrap.className='values';
        items.forEach(({k,label})=>{
          const lab=document.createElement('label');
          const sel=document.createElement('select'); sel.className='control-select'; sel.dataset.key=k;
          sel.innerHTML='<option value="">Any</option><option value="yes">Yes</option><option value="no">No</option>';
          const cur=listFilters[k]; if (cur && 'bool' in cur) sel.value = cur.bool===true?'yes':(cur.bool===false?'no':'');
          const sp=document.createElement('span'); sp.textContent=label;
          lab.appendChild(sp); lab.appendChild(sel); wrap.appendChild(lab);
        });
        menu.appendChild(wrap);
        const footer=document.createElement('div'); footer.className='footer'; const clearB=btn('Clear'); const applyB=btn('Apply');
        clearB.addEventListener('click', async ()=>{ items.forEach(({k})=>{ delete listFilters[k]; }); saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        applyB.addEventListener('click', async ()=>{ const sels=Array.from(wrap.querySelectorAll('select.control-select')); sels.forEach((sel)=>{ const k=sel.dataset.key; if (sel.value==='yes') listFilters[k]={ bool: true }; else if (sel.value==='no') listFilters[k]={ bool: false }; else delete listFilters[k]; }); saveListFilters(listFilters); closeFilterMenu(); page=1; await loadPage(); });
        footer.appendChild(clearB); footer.appendChild(applyB); menu.appendChild(footer);
      }
      else {
        const p = document.createElement('div'); p.className='row'; const s=document.createElement('span'); s.className='hint-sm'; s.textContent='No filters for this column'; p.appendChild(s); menu.appendChild(p);
      }
      // Position near header
      const rect = anchorTh.getBoundingClientRect();
      const hostRect = panel.getBoundingClientRect();
      menu.style.left = `${Math.max(0, rect.left - hostRect.left)}px`;
      menu.style.top = `${Math.max(0, rect.bottom - hostRect.top + 4)}px`;
      panel.appendChild(menu);
      filterMenuEl = menu;
      setTimeout(()=> document.addEventListener('click', onDocClick, true), 0);
    }
    if (pageSizeSelect) {
      try { pageSizeSelect.value = String(pageSize); }
      catch(_){ }
      pageSizeSelect.addEventListener('change', () => {
        const v = Number(pageSizeSelect.value);
        if (Number.isFinite(v) && v > 0) {
          pageSize = v;
          try { setLocalStorageItem(PAGE_SIZE_LS_KEY, v); }
          catch(_){ }
          page = 1;
          loadPage();
        }
      });
    }
    let sortState = (() => {
      try { return getLocalStorageJSON(SORT_LS_KEY, null) || null; }
    catch (_) { return null; } })();
    // Drop sort state for unknown/removed columns (e.g., legacy 'res')
    const KNOWN_COL_IDS = new Set(DEFAULT_COLS.map((c)=>c.id));
    if (sortState && !KNOWN_COL_IDS.has(sortState.id)) { sortState = null; try { setLocalStorageJSON(SORT_LS_KEY, null); }
    catch(_) { }
  }
    function saveSortState() {
      try { setLocalStorageJSON(SORT_LS_KEY, sortState || null); }
    catch (_) {} }
    function sortKey(colId, f) {
      switch (colId) {
        case 'name': {
          let s = f.title || f.name || f.path || '';
          const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
          if (slash >= 0) s = s.slice(slash + 1);
          const dot = s.lastIndexOf('.');
          if (dot > 0) s = s.slice(0, dot);
          return String(s).toLowerCase();
        }
        case 'path': return String(f.path || '').toLowerCase();
        case 'duration': return Number(f.duration) || 0;
        case 'size': return Number(f.size) || 0;
        case 'width': return Number(f.width) || 0;
        case 'height': return Number(f.height) || 0;
        case 'mtime': return Number(f.mtime) || 0;
        case 'codec': return String(f.video_codec || '').toLowerCase();
        case 'acodec': return String(f.audio_codec || '').toLowerCase();
        case 'format': { const p = f.path || f.name || ''; const m = /\.([^.\/]+)$/.exec(p); return m ? m[1].toLowerCase() : ''; }
        case 'bitrate': { const dur = Number(f.duration)||0; const size = Number(f.size)||0; return (dur>0 && size>0) ? (size*8/dur) : 0; }
        case 'created': return Number(f.ctime) || Number(f.birthtime) || Number(f.mtime) || 0;
        default: return String(f[colId] ?? '').toLowerCase();
      }
    }
    function sortFiles(files) {
      if (!sortState || !sortState.id) return files;
      const id = sortState.id; const asc = sortState.asc !== false;
      const arr = files.slice();
      arr.sort((a, b) => {
        const va = sortKey(id, a); const vb = sortKey(id, b);
        const na = typeof va === 'number'; const nb = typeof vb === 'number';
        let cmp = 0; if (na && nb) cmp = va - vb; else cmp = String(va).localeCompare(String(vb));
        return asc ? cmp : -cmp;
      });
      return arr;
    }
    function renderHead() {
      headRow.innerHTML = '';
      const headTpl = document.getElementById('listHeadCellTemplate');
      cols.filter((c) => c.visible).forEach((c) => {
        let th;
        if (headTpl && headTpl.content) th = headTpl.content.firstElementChild.cloneNode(true);
        else {
          th = document.createElement('th');
          const wrap = document.createElement('div');
          wrap.className = 'list-head-cell';
          th.appendChild(wrap);
          const rz = document.createElement('div');
          rz.className = 'col-resizer';
          th.appendChild(rz);
        }
        const wrapEl = th.querySelector('.list-head-cell');
        const rz = th.querySelector('.col-resizer');
        if (wrapEl) {
          wrapEl.textContent = c.label;
          if (sortState && sortState.id === c.id) {
            const ind = document.createElement('span');
            ind.className = 'sort-ind';
            ind.style.marginLeft = '6px';
            ind.textContent = (sortState.asc !== false) ? '▲' : '▼';
            wrapEl.appendChild(ind);
          }
          // Column filter trigger
          const keyMap = { format:'format', codec:'vcodec', vcodec:'vcodec', acodec:'acodec', bitrate:'bitrate', duration:'duration', size:'size', width:'width', height:'height', mtime:'mtime', created:'ctime', artifacts:'artifacts' };
          const fkey = keyMap[c.id] || (c.id === 'artifacts' ? 'artifacts' : null);
          if (fkey) {
            const trig = document.createElement('span');
            trig.className = 'col-filter-trigger';
            trig.textContent = '▾';
            if ((fkey==='artifacts' && isArtifactsFilterActive()) || (fkey!=='artifacts' && isFilterActiveForKey(fkey))) {
              trig.style.color = '#bbf7d0';
            }
            trig.addEventListener('click', (ev) => { ev.stopPropagation(); openFilterMenu(th, c.id); });
            wrapEl.appendChild(trig);
          }
        }
        // Mark header with column-specific class for styling (alignments, etc.)
        th.classList.add(`col-${c.id}`);
        th.style.width = (c.width || 120) + 'px';
        th.dataset.colId = c.id;
        let startX = 0;
        let startW = c.width || 120;
        let colTds = [];
        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const nw = Math.max(60, startW + dx);
          th.style.width = nw + 'px';
          th.style.minWidth = nw + 'px';
          th.style.maxWidth = nw + 'px';
          for (const td of colTds) {
            td.style.width = nw + 'px';
            td.style.minWidth = nw + 'px';
            td.style.maxWidth = nw + 'px';
          }
        };
        const onUp = (ev) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const rect = th.getBoundingClientRect();
          const nw = Math.max(60, Math.round(rect.width));
          const idx = cols.findIndex((x) => x.id === c.id);
          if (idx >= 0) {
            cols[idx] = { ...cols[idx], width: nw};
            saveCols(cols);
          }
          // Clear inline styles set during drag
          th.style.removeProperty('width');
          th.style.removeProperty('min-width');
          th.style.removeProperty('max-width');
          for (const td of colTds) {
            td.style.removeProperty('width');
            td.style.removeProperty('min-width');
            td.style.removeProperty('max-width');
          }
          applyColumnWidths();
        };
        rz && rz.addEventListener('mousedown', (ev) => {
          startX = ev.clientX;
          startW = th.getBoundingClientRect().width;
          colTds = Array.from(panel.querySelectorAll(`#listTable td.col-${c.id}`));
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          ev.preventDefault();
        });
        // Double-click on the resizer: auto-size column to fit the widest non-wrapping content
        rz && rz.addEventListener('dblclick', (ev) => {
          ev.stopPropagation(); // prevent triggering sort on header dblclick
          try {
            // Temporarily remove width constraints and force no-wrap to measure natural widths
            const tds = Array.from(panel.querySelectorAll(`#listTable td.col-${c.id}`));
            const els = [th, ...tds];
            const saved = new Map();
            for (const el of els) {
              saved.set(el, {
                width: el.style.width,
                minWidth: el.style.minWidth,
                maxWidth: el.style.maxWidth,
                whiteSpace: el.style.whiteSpace,
              });
              el.style.width = 'auto';
              el.style.minWidth = '0';
              el.style.maxWidth = 'none';
              el.style.whiteSpace = 'nowrap';
            }
            // Force reflow and measure scrollWidth which reflects no-wrap content width incl. padding
            let maxW = Math.ceil(th.scrollWidth);
            for (const td of tds) {
              const w = Math.ceil(td.scrollWidth);
              if (w > maxW) maxW = w;
            }
            // Add a small buffer to account for resizer handle/gaps
            const target = Math.max(60, maxW + 12);
            // Restore inline styles
            for (const el of els) {
              const s = saved.get(el) || {};
              if (s.width != null) el.style.width = s.width; else el.style.removeProperty('width');
              if (s.minWidth != null) el.style.minWidth = s.minWidth; else el.style.removeProperty('min-width');
              if (s.maxWidth != null) el.style.maxWidth = s.maxWidth; else el.style.removeProperty('max-width');
              if (s.whiteSpace != null) el.style.whiteSpace = s.whiteSpace; else el.style.removeProperty('white-space');
            }
            // Persist new width and apply
            const idx = cols.findIndex((x) => x.id === c.id);
            if (idx >= 0) {
              cols[idx] = { ...cols[idx], width: target };
              saveCols(cols);
            }
            applyColumnWidths();
          }
          catch (_) {
            // no-op
          }
        });
        th.addEventListener('dblclick', async (ev) => {
          if (ev.target && (ev.target.closest('.col-resizer') || ev.target.closest('.col-drag-handle'))) return;
          const numericCols = new Set(['duration','size','width','height','mtime','bitrate','created']);
          if (sortState && sortState.id === c.id) {
            sortState.asc = !sortState.asc;
          }
          else {
            sortState = { id: c.id, asc: !numericCols.has(c.id) };
          }
          saveSortState();
          // Use backend for supported sorts; else fetch all pages and sort client-side
          const SERVER_SORT_MAP = {
            name: 'name',
            size: 'size',
            mtime: 'date',
            date: 'date',
            created: 'created',
            width: 'width',
            height: 'height',
            duration: 'duration',
            bitrate: 'bitrate',
            vcodec: 'vcodec',
            acodec: 'acodec',
            format: 'format',
            ext: 'ext',
          };
          const serverKey = SERVER_SORT_MAP[c.id];
          if (serverKey) {
            try { if (sortSelect) sortSelect.value = serverKey; }
            catch(_) { }
            try { if (orderToggle && orderToggle.dataset) { orderToggle.dataset.order = (sortState.asc !== false) ? 'asc' : 'desc'; if (typeof syncOrderToggleArrow === 'function') syncOrderToggleArrow(); } }
            catch(_) { }
            page = 1; listClientAllMode = false;
            await loadPage();
          }
          else {
            const CLIENT_SORT_LIMIT = 1000;
            if (Number(total) > CLIENT_SORT_LIMIT) {
              notify('Sorting by this column is not supported server-side for large libraries. Use filters or choose a supported sort.', 'info');
              return;
            }
            await loadAllAndRender();
          }
        });
        headRow.appendChild(th);
      });
      // Header-level drag-over drop indicators (for future header dragging support)
      // We still manage the actual ordering in the columns panel; this is visual affordance.
      const headers = Array.from(headRow.querySelectorAll('th'));
      headers.forEach((th) => {
        th.addEventListener('dragover', (e) => {
          if (!draggingCol) return;
          e.preventDefault();
          const rect = th.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          th.classList.toggle('drop-left', (e.clientX || 0) < mid);
          th.classList.toggle('drop-right', (e.clientX || 0) >= mid);
        });
        th.addEventListener('dragleave', () => {
          th.classList.remove('drop-left');
          th.classList.remove('drop-right');
        });
        th.addEventListener('drop', async (e) => {
          if (!draggingCol) return;
          e.preventDefault();
          const src = draggingCol;
          const dst = th.dataset.colId;
          if (!src || !dst || src === dst) return;
          const sIdx = cols.findIndex((x) => x.id === src);
          const dIdx = cols.findIndex((x) => x.id === dst);
          if (sIdx < 0 || dIdx < 0) return;
          const before = th.classList.contains('drop-left');
          const [moved] = cols.splice(sIdx, 1);
          const insertAt = before ? dIdx : dIdx + 1;
          cols.splice(insertAt, 0, moved);
          saveCols(cols);
          if (listClientAllMode) {
            renderHead();
            renderBody(filesCache);
            applyColumnWidths();
          }
          else {
            await loadPage();
          }
        });
        // Optional: enable direct header dragging via the handle span
        const handle = th.querySelector('.col-drag-handle');
        if (handle) {
          handle.addEventListener('dragstart', () => {
            draggingCol = th.dataset.colId || null;
            th.classList.add('drag-hover');
          });
          handle.addEventListener('dragend', () => {
            draggingCol = null;
            th.classList.remove('drag-hover');
            th.classList.remove('drop-left');
            th.classList.remove('drop-right');
          });
        }
      });
    }
    function renderBody(files) {
      tbody.innerHTML = '';
      const visible = cols.filter((c) => c.visible);
      const rows = sortFiles(files);
      const frag = document.createDocumentFragment();
      const rowTpl = document.getElementById('listRowTemplate');
      rows.forEach((f) => {
        let tr;
        if (rowTpl && rowTpl.content) tr = rowTpl.content.firstElementChild.cloneNode(true);
        else tr = document.createElement('tr');
        tr.dataset.path = f.path || '';
        tr.addEventListener('click', (e) => {
          // selection toggle with meta/ctrl, or single-select row
          const sel = tr.getAttribute('data-selected') === '1';
          const nextSel = e.metaKey || e.ctrlKey ? !sel : true;
          // clear other selections if not multi
          if (!(e.metaKey || e.ctrlKey)) {
            tbody.querySelectorAll('tr[data-selected="1"]').forEach((r) => r.setAttribute('data-selected', '0'));
          }
          tr.setAttribute('data-selected', nextSel ? '1' : '0');
          if (!e.metaKey && !e.ctrlKey && e.detail === 2) {
            // double click open
            try {
              if (window.tabSystem) window.tabSystem.switchToTab('player');
            }
            catch (_) { }
            try {
              if (window.Player?.open) window.Player.open(f.path);
            }
            catch (_) { }
          }
        });
        visible.forEach((c) => {
          let td;
          if (cellTpl && cellTpl.content) td = cellTpl.content.firstElementChild.cloneNode(true);
          else {
            td = document.createElement('td');
            td.className = 'list-cell';
          }
          td.classList.add(`col-${c.id}`);
          if (typeof c.render === 'function') {
            c.render(td, f);
          }
          else {
            td.textContent = (c.get && typeof c.get === 'function') ? (c.get(f) ?? '') : String(f[c.id] ?? '');
          }
          tr.appendChild(td);
        });
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }
    function applyColumnWidths() {
      // Ensure column widths are applied consistently to header and body cells
      let styleEl = panel.querySelector('#listColWidthsStyle');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'listColWidthsStyle';
        panel.appendChild(styleEl);
      }
      const visible = cols.filter((c) => c.visible);
      const rules = visible.map((c) => {
        const w = Math.max(60, c.width || 120);
        return `#listTable th.col-${c.id}, #listTable td.col-${c.id}{width:${w}px;min-width:${w}px;max-width:${w}px;}`;
      }).join('\n');
      styleEl.textContent = rules;
    }
    function renderColumnsPanel() {
      colsBody.innerHTML = '';
      cols.forEach((c, idx) => {
        let item;
        if (itemTpl && itemTpl.content) item = itemTpl.content.firstElementChild.cloneNode(true);
        else {
          item = document.createElement('div'); item.className = 'list-col-item';
          const h = document.createElement('span');
          h.className = 'drag-handle';
          h.textContent = '⋮⋮';
          item.appendChild(h);
          const lab = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'list-col-visible';
          cb.checked = Boolean(c.visible);
          const sp = document.createElement('span');
          sp.className = 'list-col-label';
          sp.textContent = c.label;
          lab.appendChild(cb);
          lab.appendChild(sp);
          item.appendChild(lab);
        }
        item.dataset.colId = c.id;
        const cb = item.querySelector('.list-col-visible');
        const lab = item.querySelector('.list-col-label');
        if (cb) {
          cb.checked = Boolean(c.visible);
          cb.addEventListener('change', () => {
            c.visible = Boolean(cb.checked);
            saveCols(cols);
            renderHead();
            renderBody(filesCache);
            applyColumnWidths();
            // Auto-size newly shown column
            try {
              if (c.visible) {
                const w = computeAutoWidth(panel, c.id);
                const idx = cols.findIndex((x)=>x.id===c.id);
                if (w && idx>=0) { cols[idx] = { ...cols[idx], width: w }; saveCols(cols); applyColumnWidths(); }
              }
            }
            catch(_) { }
          });
        }
        if (lab) lab.textContent = c.label;
        // drag to reorder
        item.addEventListener('dragstart', () => {
          draggingCol = c.id;
          item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
          draggingCol = null;
          item.classList.remove('dragging');
        });
        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!draggingCol) return;
          const rect = item.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          item.classList.toggle('drop-before', (e.clientX || 0) < mid);
          item.classList.toggle('drop-after', (e.clientX || 0) >= mid);
        });
        item.addEventListener('dragleave', () => {
          item.classList.remove('drop-before');
          item.classList.remove('drop-after');
        });
        item.addEventListener('drop', async (e) => {
          e.preventDefault();
          const src = draggingCol;
          const dst = c.id;
          if (!src || src === dst) return;
          const sIdx = cols.findIndex((x) => x.id === src);
          const dIdx = cols.findIndex((x) => x.id === dst);
          if (sIdx < 0 || dIdx < 0) return;
          const before = item.classList.contains('drop-before');
          const [moved] = cols.splice(sIdx, 1);
          const insertAt = before ? dIdx : dIdx + 1;
          cols.splice(insertAt, 0, moved);
          saveCols(cols);
          renderColumnsPanel();
          if (listClientAllMode) {
            renderHead();
            renderBody(filesCache);
            applyColumnWidths();
          }
          else {
            await loadPage();
          }
        });
        colsBody.appendChild(item);
      });
    }
    function buildLibraryURL(pageNum, size) {
      const url = new URL('/api/library', window.location.origin);
      url.searchParams.set('page', String(pageNum));
      url.searchParams.set('page_size', String(size));
      url.searchParams.set('sort', sortSelect?.value || 'date');
      url.searchParams.set('order', orderToggle?.dataset?.order || 'desc');
      const resSel = document.getElementById('resSelect');
      const resVal = resSel ? String(resSel.value || '') : '';
      if (resVal) url.searchParams.set('res_min', resVal);
      const searchVal = computeSearchVal();
      if (searchVal) url.searchParams.set('search', searchVal);
      const val = (folderInput?.value || '').trim();
      const p = currentPath();
      if (val && !isAbsolutePath(val) && p) url.searchParams.set('path', p);
      if (libraryTagFilters.length) url.searchParams.set('tags', libraryTagFilters.join(','));
      if (libraryPerformerFilters.length) url.searchParams.set('performers', libraryPerformerFilters.join(','));
      // Advanced filters from list tab
      if (hasAnyFilters(listFilters)) {
        try { url.searchParams.set('filters', JSON.stringify(listFilters)); }
        catch(_) { }
      }
      return url;
    }
    async function loadAllAndRender() {
      try { if (spinner) show(spinner); }
      catch(_) { }
      try { if (pageInfo) pageInfo.textContent = 'Loading…'; }
      catch(_){ }
      try { pagerPrev.disabled = true; pagerNext.disabled = true; }
      catch(_){ }
      const perPage = 500;
      const url1 = buildLibraryURL(1, perPage);
      const r1 = await fetch(url1.toString(), {headers: {Accept: 'application/json' } });
      if (!r1.ok) { tbody.innerHTML=''; pageInfo.textContent='Failed'; return; }
      const pl1 = await r1.json();
      const d1 = pl1?.data || {};
      const page1 = Array.isArray(d1.files) ? d1.files : [];
      const totalCount = Number(d1.total_files || page1.length || 0);
      const totalPagesGuess = totalCount ? Math.max(1, Math.ceil(totalCount / perPage)) : (page1.length === perPage ? 2 : 1);
      const all = [...page1];
      const seen = new Set(all.map((f)=>f.path||''));
      for (let pn=2; pn<=totalPagesGuess; pn++) {
        const url = buildLibraryURL(pn, perPage);
        const r = await fetch(url.toString(), {headers: {Accept: 'application/json' } });
        if (!r.ok) break;
        const pl = await r.json();
        const d = pl?.data || {};
        const files = Array.isArray(d.files) ? d.files : [];
        for (const f of files) { const k=f.path||''; if (k && !seen.has(k)) { seen.add(k); all.push(f);} }
        if (!totalCount && files.length < perPage) break;
      }
      filesCache = all; total = all.length; listClientAllMode = true;
      renderHead(); renderBody(filesCache); applyColumnWidths();
      try {
        if (!getLocalStorageItem(AUTOSIZED_ONCE_LS_KEY)) {
          const visible = cols.filter((c)=>c.visible);
          for (const c of visible) {
            const w = computeAutoWidth(panel, c.id);
            const idx = cols.findIndex((x)=>x.id===c.id);
            if (w && idx>=0) cols[idx] = { ...cols[idx], width: w };
          }
          saveCols(cols); applyColumnWidths();
          setLocalStorageItem(AUTOSIZED_ONCE_LS_KEY, '1');
        }
      }
      catch(_) { }
      try {
        const shown = Array.isArray(filesCache) ? filesCache.length : 0;
        const totalPages = 1;
        page = 1; // logical page when showing all
        pageInfo.textContent = `Page ${page} of ${totalPages}, ${shown} files shown of ${total} total`;
      }
      catch(_) { }
      try { pagerPrev.disabled = true; pagerNext.disabled = true; }
      catch(_){ }
      try { if (spinner) hide(spinner); }
      catch(_) { }
    }
    async function loadPage() {
      try { if (spinner) show(spinner); }
      catch(_) { }
      try { if (pageInfo) pageInfo.textContent = 'Loading…'; }
      catch(_){ }
      try { pagerPrev.disabled = true; pagerNext.disabled = true; }
      catch(_){ }
      const url = buildLibraryURL(page, pageSize);
      const r = await fetch(url.toString(), {headers: {Accept: 'application/json' } });
      if (!r.ok) {
        tbody.innerHTML = '';
        pageInfo.textContent = 'Failed';
        return;
      }
      const payload = await r.json();
      const data = payload?.data || {};
      filesCache = Array.isArray(data.files) ? data.files : [];
      total = Number(data.total_files || filesCache.length || 0);
      listClientAllMode = false;
  renderHead();
  renderBody(filesCache);
  applyColumnWidths();
      // Auto-size visible columns once (first-render)
      try {
        if (!getLocalStorageItem(AUTOSIZED_ONCE_LS_KEY)) {
          const visible = cols.filter((c)=>c.visible);
          for (const c of visible) {
            const w = computeAutoWidth(panel, c.id);
            const idx = cols.findIndex((x)=>x.id===c.id);
            if (w && idx>=0) cols[idx] = { ...cols[idx], width: w };
          }
          saveCols(cols); applyColumnWidths();
          setLocalStorageItem(AUTOSIZED_ONCE_LS_KEY, '1');
        }
      }
      catch(_) { }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const shown = Array.isArray(filesCache) ? filesCache.length : 0;
      pageInfo.textContent = `Page ${Math.min(page, totalPages)} of ${totalPages}, ${shown} files shown of ${total} total`;
      pagerPrev.disabled = page <= 1;
      pagerNext.disabled = page >= totalPages;
      try { if (spinner) hide(spinner); }
      catch(_) { }
    }
    // Wire controls
    pagerPrev.addEventListener('click', () => {
      if (!listClientAllMode && page > 1) {
        page--;
        loadPage();
      }
    });
    pagerNext.addEventListener('click', () => {
      if (!listClientAllMode) {
        page++;
        loadPage();
      }
    });
    colsBtn.addEventListener('click', () => {
      const open = isHidden(colsPanel);
      if (open) {
        renderColumnsPanel();
        showAs(colsPanel, 'block');
        colsBtn.setAttribute('aria-expanded', 'true');
      }
      else {
        hide(colsPanel);
        colsBtn.setAttribute('aria-expanded', 'false');
      }
    });
    colsClose.addEventListener('click', () => {
      hide(colsPanel);
      colsBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', (e) => {
      if (!colsPanel.contains(e.target) && e.target !== colsBtn) {
        hide(colsPanel);
        colsBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // Rotate headers functionality removed
    // Auto-load when the tab becomes active
    window.addEventListener('tabchange', (ev) => {
      if (ev?.detail?.activeTab === 'list') {
        loadPage();
      }
    });
    // If user deep-linked
    if ((window.location.hash || '').replace(/^#/, '') === 'list') {
      setTimeout(() => loadPage(), 0);
    }
    return {panel};
  }
  const tryInstall = () => {
    const ts = window.tabSystem;
    if (!ts) return false;
    const staticBtn = document.getElementById('list-tab');
    const staticPanel = document.getElementById('list-panel');
    if (!(staticBtn && staticPanel)) return false;
    if (!ts.tabs.has('list')) {
      ts.tabs.set('list', {button: staticBtn, panel: staticPanel});
      staticBtn.addEventListener('click', (e) => { e.preventDefault(); ts.switchToTab('list'); });
    }
    addListTab(ts); return true;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      tryInstall();
    }, {once: true});
  }
  else if (!tryInstall()) setTimeout(tryInstall, 0);
})();
// --- Similar Tab (pHash duplicates) ---
// Minimal tab that lists similar pairs from /api/duplicates with quick Play A/B
// --- Similar Tab (pHash duplicates) ---
(function setupSimilarTab() {
  function install(ts) {
    // Require existing static panel
    const panel = document.getElementById('similar-panel');
    if (!panel) return null;
    const btn = document.getElementById('similar-tab');
    if (btn && !ts.tabs.has('similar')) {
      ts.tabs.set('similar', {button: btn, panel});
      btn.addEventListener('click', (e) => { e.preventDefault(); ts.switchToTab('similar'); });
    }
    function persistSettings(thresh, limit, rec) {
      try {
        setLocalStorageItem('similar:thresh', String(thresh));
      }
      catch (_) { }
      try {
        setLocalStorageItem('similar:limit', String(limit));
      }
      catch (_) { }
      try {
        setLocalStorageItem('similar:rec', rec ? '1' : '0');
      }
      catch (_) { }
    }
    function restoreSettings() {
      const tEl = document.getElementById('similarThresh');
      const lEl = document.getElementById('similarLimit');
      const rEl = document.getElementById('similarRecursive');
      if (tEl) {
        const raw = getLocalStorageItem('similar:thresh');
        if (raw != null && raw !== '') tEl.value = raw;
      }
      if (lEl) {
        const raw = getLocalStorageItem('similar:limit');
        if (raw != null && raw !== '') lEl.value = raw;
      }
      if (rEl) {
        const raw = getLocalStorageItem('similar:rec');
        rEl.checked = raw === '1';
      }
    }
    async function loadSimilar() {
      const statusEl = panel.querySelector('#similarStatus');
      const resultsEl = panel.querySelector('#similarResults');
      const tEl = panel.querySelector('#similarThresh');
      const lEl = panel.querySelector('#similarLimit');
      const rEl = panel.querySelector('#similarRecursive');
      if (!statusEl || !resultsEl || !tEl || !lEl || !rEl) return;
      const thr = Math.max(0, Math.min(1, parseFloat(tEl.value || '0.90')));
      const limit = Math.max(1, parseInt(lEl.value || '50', 10) || 50);
      const rec = Boolean(rEl.checked);
      persistSettings(thr, limit, rec);
      resultsEl.innerHTML = '';
      statusEl.textContent = 'Loading…';
      statusEl.style.color = '';
      // Determine directory from Library folder input (relative path only)
      let directory = '';
      try {
        const val = (folderInput && folderInput.value || '').trim();
        if (!isAbsolutePath(val)) {
          // Use currentPath() helper which normalizes leading/trailing slashes
          directory = (typeof currentPath === 'function') ? (currentPath() || '') : '';
        }
      }
      catch (_) {
        directory = '';
      }
      const qs = new URLSearchParams();
      qs.set('phash_threshold', String(thr));
      if (directory) qs.set('directory', directory);
      qs.set('recursive', rec ? 'true' : 'false');
      qs.set('page_size', String(limit));
      try {
  const res = await fetch('/api/duplicates?' + qs.toString(), {headers: {Accept: 'application/json' } });
        if (!res.ok) {
          statusEl.textContent = 'Failed to load';
          statusEl.style.color = 'var(--danger-400, red)';
          return;
        }
        const j = await res.json();
        const data = j && (j.data || j) || {};
        const pairs = Array.isArray(data.pairs) ? data.pairs : [];
        const total = Number.isFinite(data.total_pairs) ? data.total_pairs : pairs.length;
        if (!pairs.length) {
          statusEl.textContent = 'No similar pairs at this threshold.';
          statusEl.style.color = 'var(--muted-500, #778)';
          return;
        }
        statusEl.textContent = `${total} pairs ≥ ${(thr * 100).toFixed(0)}%`;
        statusEl.style.color = '';
        // Render results
        const frag = document.createDocumentFragment();
        const tpl = document.getElementById('similarRowTemplate');
        pairs.forEach((p) => {
          let rowEl;
          if (tpl && tpl.content) rowEl = tpl.content.firstElementChild.cloneNode(true);
          else {
            rowEl = document.createElement('div');
            rowEl.className = 'card similar-row';
            const top = document.createElement('div');
            top.className = 'row jc-between ai-center';
            const title = document.createElement('strong');
            title.className = 'similar-title';
            top.appendChild(title);
            const act = document.createElement('div');
            act.className = 'row gap-10';
            const pa = document.createElement('button'); pa.className = 'btn-sm play-a'; pa.textContent = 'Play A';
            const pb = document.createElement('button'); pb.className = 'btn-sm play-b'; pb.textContent = 'Play B';
            act.appendChild(pa); act.appendChild(pb); top.appendChild(act); rowEl.appendChild(top);
            const hint = document.createElement('div'); hint.className = 'hint-sm mt-6';
            const a = document.createElement('div'); a.className = 'path-a';
            const b = document.createElement('div'); b.className = 'path-b';
            hint.appendChild(a); hint.appendChild(b); rowEl.appendChild(hint);
          }
          const titleEl = rowEl.querySelector('.similar-title');
          const btnA = rowEl.querySelector('.play-a');
          const btnB = rowEl.querySelector('.play-b');
          const pathA = rowEl.querySelector('.path-a');
          const pathB = rowEl.querySelector('.path-b');
          if (titleEl) titleEl.textContent = `${Math.round(((p && p.similarity) || 0) * 100)}% similar`;
          if (pathA) pathA.textContent = p && p.a ? p.a : '';
          if (pathB) pathB.textContent = p && p.b ? p.b : '';
          const openPath = (path) => {
            try { ts.switchToTab('player'); }
            catch (_) { }
            try {
              if (window.Player && typeof window.Player.open === 'function') window.Player.open(path);
              else if (typeof Player !== 'undefined' && Player && typeof Player.open === 'function') Player.open(path);
            }
            catch (_) { }
          };
          btnA && btnA.addEventListener('click', () => openPath(p && p.a));
          btnB && btnB.addEventListener('click', () => openPath(p && p.b));
          frag.appendChild(rowEl);
        });
        resultsEl.appendChild(frag);
      }
      catch (_) {
        statusEl.textContent = 'Error loading';
        statusEl.style.color = 'var(--danger-400, red)';
      }
    }
    // Wire controls
    panel.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('#similarRefreshBtn');
      if (btn) {
        e.preventDefault();
        loadSimilar();
      }
    });
    panel.addEventListener('change', (e) => {
      const id = (e.target && e.target.id) || '';
      if (id === 'similarThresh' || id === 'similarLimit' || id === 'similarRecursive') {
        // Do not auto-load to avoid spamming; but persist user choice
        const tEl = document.getElementById('similarThresh');
        const lEl = document.getElementById('similarLimit');
        const rEl = document.getElementById('similarRecursive');
        const thr = parseFloat(tEl && tEl.value || '0.90');
        const lim = parseInt(lEl && lEl.value || '50', 10) || 50;
        const rec = Boolean(rEl && rEl.checked);
        persistSettings(thr, lim, rec);
      }
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const t = e.target && e.target.id;
        if (t === 'similarThresh' || t === 'similarLimit') {
          e.preventDefault();
          loadSimilar();
        }
      }
    });
    // Load on tab activation
    window.addEventListener('tabchange', (ev) => {
      if (ev && ev.detail && ev.detail.activeTab === 'similar') {
        restoreSettings();
        loadSimilar();
      }
    });
    // If user navigated directly to #similar before we added the tab, honor it
    try {
      const hash = (window.location.hash || '').replace(/^#/, '');
      if (hash === 'similar') {
        restoreSettings();
        ts.switchToTab('similar');
        loadSimilar();
      }
    }
    catch (_) { /* noop */ }
    return {panel};
  }
  const tryInstall = () => {
    const ts = window.tabSystem;
    if (!ts) return false;
    const res = install(ts);
    return Boolean(res);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      tryInstall();
    }, {once: true});
  }
  else {
    if (!tryInstall()) {
      // In case tabSystem is assigned slightly later, retry once on next tick
      setTimeout(tryInstall, 0);
    }
  }
})();

// =============================
// Performers Graph (Cytoscape)
// =============================
(function GraphModule(){
  let cy = null;
  let initialized = false;
  let lastData = { nodes: [], edges: [] };
  let usingPlugins = false;
  const STATUS_ID = 'graphStatus';

  function ensurePlugins() {
    if (usingPlugins) return;
    try {
      if (window.cytoscape && window.cytoscapeFcose) {
        // Some UMD builds attach automatically; guard use() calls
        try { window.cytoscape.use(window.cytoscapeFcose); }
        catch (_) {}
      }
      if (window.cytoscape && window.cxtmenu) {
        try { window.cytoscape.use(window.cxtmenu); }
        catch (_) {}
      }
      if (window.cytoscape && window.cytoscapePanzoom) {
        try { window.cytoscape.use(window.cytoscapePanzoom); }
        catch (_) {}
      }
      // panzoom plugin adds cy.panzoom function
      usingPlugins = true;
    }
    catch (_) { usingPlugins = true; }
  }

  function el(id) { return document.getElementById(id); }

  function straightPrefGet() {
    try { return getLocalStorageBoolean('graph:straightEdges', true); }
    catch (_) { return true; }
  }
  function straightPrefSet(v) {
    try { setLocalStorageBoolean('graph:straightEdges', !!v); }
    catch (_) {}
  }

  function nodeSizeForCount(c) {
    const n = Math.max(1, Number(c) || 1);
    // sqrt scale to tame large counts
    return Math.max(18, Math.min(90, 14 + Math.sqrt(n) * 8));
  }
  function edgeWidthForCount(c) {
    const n = Math.max(1, Number(c) || 1);
    return Math.max(1, Math.min(8, 1 + Math.log2(1 + n)));
  }

  // Compute per-node dimensions so the label text is contained inside the node
  function nodeDims(name, count) {
    const base = nodeSizeForCount(count);
    // Map the size into a wider card-like node; width scales with count
    const w = Math.max(70, Math.min(160, base * 2));
    // Estimate text width capacity (px) inside the node
    const textW = Math.max(40, w - 18);
    // Roughly estimate line count at current font-size (10px ~ 6.5px avg char)
    const avgCharPx = 6.5;
    const estPerLine = Math.max(8, Math.floor(textW / avgCharPx));
    const estLines = Math.max(1, Math.ceil(String(name || '').length / estPerLine));
    // Height grows with lines; keep within reasonable bounds
    const h = Math.max(28, Math.min(160, 22 + estLines * 12));
    return { w: Math.round(w), h: Math.round(h), textW: Math.round(textW) };
  }

  function toElements(data) {
    const nodes = (data.nodes || []).map((n) => ({
      data: {
        id: n.id,
        label: n.name,
        count: Number(n.count || 0),
        size: nodeSizeForCount(n.count),
        ...nodeDims(n.name, n.count),
      },
    }));
    const edges = (data.edges || []).map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        count: Number(e.count || 0),
        width: edgeWidthForCount(e.count),
        videos: Array.isArray(e.videos) ? e.videos : [],
        a: e.a || e.source,
        b: e.b || e.target,
      },
    }));
    return [...nodes, ...edges];
  }

  function getMinEdges() {
    const v = parseInt(el('graphMinEdges')?.value || '0', 10);
    return isNaN(v) ? 0 : Math.max(0, v);
  }

  function filterDataByMinEdges(data, minEdges) {
    const d = data || { nodes: [], edges: [] };
    if (!minEdges || minEdges <= 0) return d;
    const degree = new Map();
    (d.edges || []).forEach((e) => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    const nodeSet = new Set();
    const nodes = (d.nodes || []).filter((n) => {
      const deg = degree.get(n.id) || 0;
      if (deg >= minEdges) { nodeSet.add(n.id); return true; }
      return false;
    });
    const edges = (d.edges || []).filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
    return { nodes, edges };
  }

  async function fetchGraph() {
    const min = Math.max(1, parseInt(el('graphMinCount')?.value || '2', 10) || 2);
    const u = new URL('/api/performers/graph', window.location.origin);
    u.searchParams.set('min_count', String(min));
    u.searchParams.set('limit_videos_per_edge', '6');
    const r = await fetch(u.toString());
    const j = await r.json();
    return (j && (j.data || j)) || {nodes: [], edges: []};
  }

  function initCy() {
    if (!window.cytoscape) {
      notify('Graph engine not loaded', 'error');
      return;
    }
    ensurePlugins();
    const container = el('cyGraph');
    if (!container) return;
    cy = window.cytoscape({
      container,
      elements: [],
      style: [
        {
          selector: 'node',
            style: {
            'background-color': '#3b82f6',
            'label': 'data(label)',
            'color': '#eaf0ff',
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': 'data(textW)',
            'text-outline-color': '#0b1220',
            'text-outline-width': 3,
            'min-zoomed-font-size': 8,
            'shape': 'round-rectangle',
            'width': 'data(w)',
            'height': 'data(h)',
          }
        },
        {
          selector: 'edge',
          style: {
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'width': 'data(width)',
            'curve-style': 'straight',
            'opacity': 0.75,
          }
        },
        {
          selector: '.faded',
          style: { 'opacity': 0.15 }
        },
        {
          selector: '.dim',
          style: { 'opacity': 0.18 }
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#e5e7eb' }
        },
        {
          selector: '.highlight',
          style: { 'border-width': 3, 'border-color': '#fff' }
        },
      ],
      wheelSensitivity: 0.2,
      pixelRatio: 1,
    });
    try {
      if (typeof cy.panzoom === 'function') cy.panzoom({});
     }
    catch (_) {}

  // Apply preferred edge curvature (straight is default)
  applyEdgeCurve(straightPrefGet());

    // Hover magnify + neighbor highlight
    cy.on('mouseover', 'node', (evt) => {
      const n = evt.target;
      const bw = Number(n.data('w') || n.data('size') || 48);
      const bh = Number(n.data('h') || n.data('size') || 28);
      try { n.stop(true); n.animate({ style: { width: bw * 1.15, height: bh * 1.15 } }, { duration: 120 }); }
      catch (_) {}
      const neigh = n.closedNeighborhood();
      cy.elements().addClass('faded');
      neigh.removeClass('faded');
    });
    cy.on('mouseout', 'node', (evt) => {
      const n = evt.target;
      const bw = Number(n.data('w') || n.data('size') || 48);
      const bh = Number(n.data('h') || n.data('size') || 28);
      try {
        n.stop(true);
        n.animate({
          style: {
            width: bw,
            height: bh
          }
        }, {
          duration: 120
        });
      }
      catch (_) {}
      cy.elements().removeClass('faded');
    });

    // Edge tooltip with sample videos
    const tooltip = el('graphTooltip');
    function hideTooltipSoon() {
      if (!tooltip) return;
      tooltip.setAttribute('hidden', '');
    }
    function showTooltipForEdge(edge, pos) {
      if (!tooltip || !edge) return;
      const vids = edge.data('videos') || [];
      const a = edge.data('a') || '';
      const b = edge.data('b') || '';
      const items = vids.slice(0, 6).map((p) => ({ path: p, thumb: `/api/thumbnail?path=${encodeURIComponent(p)}` }));
      const frag = document.createDocumentFragment();
      const title = document.createElement('div');
      title.className = 'gt-title';
      const cnt = edge.data('count') || items.length;
      title.textContent = `${a} + ${b} — ${cnt} video${cnt === 1 ? '' : 's'}`;
      frag.appendChild(title);
      const list = document.createElement('div');
      list.className = 'gt-list';
      items.forEach((it) => {
        const wrap = document.createElement('a');
        wrap.className = 'gt-item';
        const enc = encodeURIComponent(it.path);
        // Use hash link so Shift/Cmd/Ctrl click opens a new tab correctly
        wrap.href = `#player/v/${enc}`;
        wrap.title = it.path;
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = it.thumb;
        const cap = document.createElement('div');
        cap.textContent = it.path.split('/').pop();
        wrap.appendChild(img);
        wrap.appendChild(cap);
        list.appendChild(wrap);
      });
      tooltip.innerHTML = '';
      tooltip.appendChild(frag);
      tooltip.appendChild(list);
      tooltip.removeAttribute('hidden');
      const x = Math.round(pos.x + 12);
      const y = Math.round(pos.y + 12);
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    }
    cy.on('mouseover', 'edge', (evt) => {
      try {
        const pos = evt.renderedPosition || evt.position || { x: 0, y: 0 };
        showTooltipForEdge(evt.target, pos);
      }
      catch (_) {}
    });
    cy.on('mouseout', 'edge', () => hideTooltipSoon());
    document.addEventListener('scroll', hideTooltipSoon, true);

    // Context menu actions
    try {
      if (typeof cy.cxtmenu === 'function') {
        cy.cxtmenu({ selector: 'node', commands: [
          { content: 'Open in Library', select: (ele) => openInLibrary([ele.data('label')]) },
          { content: 'Play random', select: (ele) => playRandomForPerformers([ele.data('label')]) },
          { content: 'Reveal neighborhood', select: (ele) => revealNeighborhood(ele) },
        ]});
        cy.cxtmenu({ selector: 'edge', commands: [
          { content: 'Open both in Library', select: (ele) => openInLibrary([ele.data('a'), ele.data('b')]) },
          { content: 'Play random co-appearance', select: (ele) => playRandomFromEdge(ele) },
        ]});
      }
    }
    catch (_) {}

    // Click to select a node
    cy.on('tap', 'node', (evt) => {
      try { cy.nodes(':selected').unselect(); }
      catch (_) {}
      try { evt.target.select(); }
      catch (_) {}
    });
  }

  function applyEdgeCurve(straight) {
    if (!cy) return;
    const mode = straight ? 'straight' : 'unbundled-bezier';
    try { cy.style().selector('edge').style('curve-style', mode).update(); }
    catch (_) {}
  }

  function applyLayout(kind) {
    if (!cy) return;
    const k = (kind || 'fcose').toLowerCase();
    let layout;
    if (k === 'random') layout = { name: 'random', padding: 20 };
    else if (k === 'circle') layout = { name: 'circle', padding: 20 };
    else if (k === 'grid') layout = { name: 'grid', padding: 20 };
    else if (k === 'cose') {
      layout = {
        name: 'cose',
        animate: 'end',
        animationDuration: 600,
        fit: true,
        padding: 40,
        nodeOverlap: 10,
        nodeRepulsion: 8000,
        idealEdgeLength: (edge) => {
          const c = Number(edge.data('count') || 1);
          return Math.max(60, 140 - Math.log2(1 + c) * 20);
        },
        gravity: 80,
        componentSpacing: 80,
      };
    }
    else {
      layout = {
        name: 'fcose',
        quality: 'default',
        randomize: false,
        animate: 'end',
        animationDuration: 700,
        animationEasing: 'ease-out-cubic',
        fit: true,
        padding: 50,
        nodeSeparation: 30,
        nodeDimensionsIncludeLabels: true,
        packComponents: true,
        idealEdgeLength: (edge) => {
          const c = Number(edge.data('count') || 1);
          return Math.max(50, 140 - Math.log2(1 + c) * 22);
        },
        edgeElasticity: (edge) => {
          const c = Number(edge.data('count') || 1);
          return Math.max(0.2, 0.9 - Math.min(0.6, Math.log2(1 + c) * 0.1));
        },
        nodeRepulsion: (node) => {
          const count = Number(node.data('count') || 1);
          return 6000 + Math.sqrt(count) * 400;
        },
      };
    }
    try { cy.layout(layout).run(); }
    catch (_) {}
  }

  function setStatus(text) {
    const s = el(STATUS_ID);
    if (s) s.textContent = text || '';
  }

  async function loadGraph() {
    try {
      __origPositions = null;
      __neighborhoodView = false;
      setStatus('Loading…');
      const data = await fetchGraph();
      lastData = data || {nodes: [], edges: []};
      refreshGraphFromCurrentData(true);
    }
    catch (err) {
      notify('Failed to load graph', 'error');
      setStatus('Error loading');
    }
  }

  function refreshGraphFromCurrentData(isFreshLoad = false) {
    const filtered = filterDataByMinEdges(lastData, getMinEdges());
    const elements = toElements(filtered);
    if (!cy) initCy();
    if (!cy) return;
    cy.elements().remove();
    cy.add(elements);
    applyLayout(el('graphLayoutSelect')?.value || 'fcose');
    const n = (filtered.nodes || []).length;
    const m = (filtered.edges || []).length;
    if (n > 0) setStatus(`${n} performer${n===1?'':'s'}, ${m} link${m===1?'':'s'}`);
    else {
      const mv = (parseInt(el('graphMinCount')?.value || '2',10)||2) > 1;
      const me = getMinEdges() > 0;
      setStatus(`No data${mv ? ' (lower Min videos)' : ''}${me ? (mv ? ' and Min edges' : ' (lower Min edges)') : ''}`);
    }
    const pad = 30;
    setTimeout(() => {
      try { cy.resize(); cy.fit(null, pad); }
    catch (_) {} }, isFreshLoad ? 80 : 10);
  }

  function openInLibrary(perfNames) {
    try {
      const names = (perfNames || []).filter(Boolean);
      if (!names.length) return;
      // Switch to library tab and apply filters
      const tab = document.querySelector('[data-tab="library"]');
      if (tab) tab.click();
      window.libraryPerformerFilters = names;
      try { setLocalStorageJSON('filters.performers', names); }
      catch (_) {}
      if (typeof window.renderUnifiedFilterChips === 'function') window.renderUnifiedFilterChips();
      if (typeof window.loadLibrary === 'function') window.loadLibrary();
      if (typeof window.updateLibraryUrlFromState === 'function') window.updateLibraryUrlFromState();
    }
    catch (_) {}
  }

  async function playRandomForPerformers(perfNames) {
    const names = (perfNames || []).filter(Boolean);
    if (!names.length) return;
    try {
      const u = new URL('/api/library', window.location.origin);
      u.searchParams.set('page', '1');
      u.searchParams.set('page_size', '200');
      u.searchParams.set('performers', names.join(','));
      const r = await fetch(u.toString());
      const j = await r.json();
      const files = (j && (j.data && j.data.files ? j.data.files : j.files)) || [];
      if (!files.length) {
        notify('No videos for selection', 'info');
        return;
      }
      const pick = files[Math.floor(Math.random() * files.length)];
      const enc = encodeURIComponent(pick.path || pick.name);
      window.location.hash = `#player/v/${enc}`;
    }
    catch (_) {
      notify('Failed to pick random', 'error');
    }
  }

  function playRandomFromEdge(edge) {
    try {
      const vids = edge && Array.isArray(edge.data('videos')) ? edge.data('videos') : [];
      if (!vids.length) {
        notify('No videos for pair', 'info');
        return;
      }
      const p = vids[Math.floor(Math.random() * vids.length)];
      const enc = encodeURIComponent(p);
      window.location.hash = `#player/v/${enc}`;
    }
    catch (_) { notify('Failed to play', 'error'); }
  }

  let __origPositions = null;
  let __neighborhoodView = false;

  function storePositionsOnce() {
    if (!cy || __origPositions) return;
    __origPositions = new Map();
    cy.nodes().forEach((n) => {
      __origPositions.set(n.id(), {
        x: n.position('x'),
        y: n.position('y')
      });
    });
  }

  function restorePositions() {
    if (!cy || !__origPositions) {
      clearHighlights();
      return;
    }
    const anims = [];
    cy.nodes().forEach((n) => {
      const p = __origPositions.get(n.id());
      if (p) {
        try {
          n.unlock();
          anims.push(n.animate({
            position: p
          }, {
            duration: 250
          }));
        }
        catch (_) {}
      }
      else {
        try { n.unlock(); }
        catch (_) {}
      }
    });
    __origPositions = null;
    __neighborhoodView = false;
    cy.elements().removeClass('dim');
    cy.elements().removeClass('faded');
    try { cy.fit(null, 30); }
    catch (_) {}
  }

  function revealNeighborhood(anchor) {
    if (!cy) return;
    let base = null;
    let centerNode = null;
    if (anchor && anchor.closedNeighborhood) {
      base = anchor.closedNeighborhood();
      centerNode = anchor;
    }
    else {
      const q = String(el('graphSearchInput')?.value || '').trim().toLowerCase();
      if (q) {
        const matches = cy.nodes().filter((n) => String(n.data('label') || '').toLowerCase().includes(q));
        base = matches.closedNeighborhood();
        centerNode = matches[0] || null;
      }
    }
    if (!base || base.length === 0) return;

    // Remember current layout once, then focus just the neighborhood
    storePositionsOnce();
    __neighborhoodView = true;

    const subNodes = base.nodes();
    const otherNodes = cy.nodes().not(subNodes);
    otherNodes.lock();
    cy.elements().addClass('dim');
    base.removeClass('dim');

    // Arrange neighborhood in a compact concentric layout with the anchor centered
    let concentricFn = (n) => (centerNode && n.id() === centerNode.id() ? 2 : 1);
    const layout = subNodes.layout({
      name: 'concentric',
      animate: 'end',
      concentric: concentricFn,
      levelWidth: () => 1,
      spacingFactor: 1.25,
      fit: true,
      padding: 60,
    });
    try {
      layout.run();
    }
    catch (_) {
      try {
        cy.fit(base, 40);
      }
      catch (_) {}
    }
  }

  function clearHighlights() {
    if (!cy) return;
    if (__neighborhoodView) {
      restorePositions();
      return;
    }
    cy.elements().removeClass('faded');
    cy.elements().removeClass('dim');
    try { cy.fit(null, 30); }
    catch (_) {}
    const s = el('graphSearchInput'); if (s) s.value = '';
  }

  function wireControlsOnce() {
    const refreshBtn = el('graphRefreshBtn');
    if (refreshBtn && !refreshBtn._wired) { refreshBtn._wired = true; refreshBtn.addEventListener('click', loadGraph); }
    const layoutSel = el('graphLayoutSelect');
    if (layoutSel && !layoutSel._wired) { layoutSel._wired = true; layoutSel.addEventListener('change', () => applyLayout(layoutSel.value)); }
    const fitBtn = el('graphFitBtn');
    if (fitBtn && !fitBtn._wired) { fitBtn._wired = true; fitBtn.addEventListener('click', () => {
      try { cy && cy.fit(null, 30); }
    catch (_) {} }); }
    const nbBtn = el('graphNeighborhoodBtn');
    if (nbBtn && !nbBtn._wired) { nbBtn._wired = true; nbBtn.addEventListener('click', () => revealNeighborhood()); }
    const clrBtn = el('graphClearBtn');
    if (clrBtn && !clrBtn._wired) { clrBtn._wired = true; clrBtn.addEventListener('click', clearHighlights); }
    const minInput = el('graphMinCount');
    if (minInput && !minInput._wired) { minInput._wired = true; minInput.addEventListener('change', loadGraph); }
    const minEdgesInput = el('graphMinEdges');
    if (minEdgesInput && !minEdgesInput._wired) {
      minEdgesInput._wired = true;
      const onChange = () => refreshGraphFromCurrentData(false);
      minEdgesInput.addEventListener('input', onChange);
      minEdgesInput.addEventListener('change', onChange);
    }
    const searchInput = el('graphSearchInput');
    if (searchInput && !searchInput._wired) {
      searchInput._wired = true;
      const on = debounce(() => {
        const q = String(searchInput.value || '').trim().toLowerCase();
        if (!cy) return;
        cy.elements().removeClass('highlight');
        if (!q) { cy.elements().removeClass('faded'); return; }
        const matches = cy.nodes().filter((n) => String(n.data('label') || '').toLowerCase().includes(q));
        cy.elements().addClass('faded');
        matches.removeClass('faded');
        matches.connectedEdges().removeClass('faded');
        matches.addClass('highlight');
        try { cy.fit(matches.closedNeighborhood(), 40); }
        catch (_) {}
      }, 200);
      searchInput.addEventListener('input', on);
    }
    const straightCb = el('graphStraightEdges');
    if (straightCb && !straightCb._wired) {
      straightCb._wired = true;
      // Initialize from pref
      try { straightCb.checked = !!straightPrefGet(); }
      catch (_) {}
      straightCb.addEventListener('change', () => {
        const useStraight = !!straightCb.checked;
        straightPrefSet(useStraight);
        applyEdgeCurve(useStraight);
      });
    }
  }

  function show() {
    if (initialized) return;
    initialized = true;
    wireControlsOnce();
    setTimeout(loadGraph, 30);
  }

  function resizeFit() {
    try { if (cy) { cy.resize(); cy.fit(null, 30); } }
    catch (_) {}
  }

  window.Graph = { show, resizeFit };
})();

// Initialize Graph tab lazily on activation
window.addEventListener('tabchange', (e) => {
  try {
    if (e && e.detail && e.detail.activeTab === 'graph' && window.Graph && typeof window.Graph.show === 'function') {
      setTimeout(() => { window.Graph.show(); window.Graph.resizeFit && window.Graph.resizeFit(); }, 40);
    }
  }
  catch (_) {}
});

// Fallbacks: initialize on tab button click and if Graph is already active on load
document.addEventListener('DOMContentLoaded', () => {
  try {
    const btn = document.getElementById('graph-tab');
    if (btn && !btn._wiredGraphInit) {
      btn._wiredGraphInit = true;
      btn.addEventListener('click', () => {
        try { window.Graph && window.Graph.show && window.Graph.show(); }
      catch (_) {} });
    }
    const panel = document.getElementById('graph-panel');
    if (panel && !panel.hasAttribute('hidden')) {
      try { window.Graph && window.Graph.show && window.Graph.show(); }
      catch (_) {}
    }
  }
  catch (_) {}
});

// --- API Explorer Tab ---
(function setupApiExplorer() {
  let apiSpecLoaded = false;
  let lastFetchedRoutes = [];
  function fmt(obj) {
    try { return JSON.stringify(obj, null, 2); }
    catch (_) { return String(obj); }
  }
  function parseJsonOrEmpty(text) {
    const t = (text || '').trim();
    if (!t) return null;
    try { return JSON.parse(t); }
    catch (_) { return null; }
  }
  async function fetchRoutes() {
    // Try to introspect available endpoints via the FastAPI openapi or app.routes fallback
    // Preferred: /api/routes (comprehensive listing). Fallback: OpenAPI specs, then minimal list.
    try {
      const r = await fetch('/api/routes', {cache: 'no-store'});
      if (r.ok) {
        const j = await r.json();
        return buildFromOpenAPI(j);
      }
    }
    catch (_) { }
    // Try standard OpenAPI endpoints
    try {
      const r = await fetch('/openapi.json', {cache: 'no-store'});
      if (r.ok) {
        const j = await r.json();
        return buildFromOpenAPI(j);
      }
    }
    catch (_) { }
    // Secondary try: some deployments mount OpenAPI under /api
    try {
      const r2 = await fetch('/api/openapi.json', {cache: 'no-store'});
      if (r2.ok) {
        const j2 = await r2.json();
        return buildFromOpenAPI(j2);
      }
    }
    catch (_) { }
    // Fallback minimal list of known endpoints
    return [
      {method: 'GET', path: '/api/health', summary: 'Server health'},
      {method: 'GET', path: '/config', summary: 'Server config (unprefixed)'},
      {method: 'GET', path: '/api/config', summary: 'Server config'},
      {method: 'GET', path: '/api/library', summary: 'List library files'},
      {method: 'GET', path: '/api/duplicates', summary: 'Similar (pHash) pairs'},
      {method: 'GET', path: '/api/tags', summary: 'Tags registry'},
      {method: 'GET', path: '/api/tags/summary', summary: 'Tags summary'},
    ];
  }
  function buildFromOpenAPI(spec) {
    const out = [];
    try {
      const paths = spec && spec.paths || {};
      Object.keys(paths).forEach((p) => {
        const ops = paths[p] || {};
        ['get','post','put','patch','delete'].forEach((m) => {
          if (ops[m]) {
            out.push({
              method: m.toUpperCase(),
              path: p,
              summary: ops[m].summary || '',
              description: ops[m].description || ''
            });
          }
        });
      });
    }
    catch (_) { }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }
  function buildTree(routes) {
    // Build a nested tree: { name, children: Map, endpoints: [] }
    const root = { name: '/', children: new Map(), endpoints: [] };
    const arr = Array.isArray(routes) ? routes : [];
    arr.forEach((r) => {
      if (!r || !r.path) return;
      const path = String(r.path || '/');
      let segs = path.split('/').filter(Boolean);

      // Group non-API routes under "app" node
      if (!path.startsWith('/api')) {
        // Create "app" as the first segment for non-API routes
        segs = ['app', ...segs];
      }
      else {
        // For API routes, flatten to just api > category, put endpoints directly under category
        if (segs[0] === 'api' && segs.length > 2) {
          // Keep only api + category (first level grouping)
          segs = ['api', segs[1]];
        }
      }

      let node = root;
      segs.forEach((seg) => {
        if (!node.children.has(seg)) node.children.set(seg, { name: seg, children: new Map(), endpoints: [] });
        node = node.children.get(seg);
      });
      node.endpoints.push(r);
    });
    return root;
  }
  function renderTree(container, tree) {
  const tplGroup = document.getElementById('apiGroupTemplate');
  const tplEp = document.getElementById('apiEndpointTemplate');

    // Helper function to recursively expand/collapse all children
    const toggleAllChildren = (groupEl, expand) => {
      const bodyEl = groupEl.querySelector('.api-group__body');
      if (!bodyEl) return;

      // Find all child groups within this body
      const childGroups = bodyEl.querySelectorAll(':scope > .api-group');
      try { console.debug('[API] toggleAllChildren', { expand, childGroups: childGroups.length }); }
      catch (_) {}
      childGroups.forEach(childGroup => {
        childGroup.setAttribute('data-open', expand ? '1' : '0');
        const childBody = childGroup.querySelector('.api-group__body');
        if (childBody) {
          childBody.style.display = expand ? '' : 'none';
        }
        // Keep aria-expanded in sync for a11y
        const childHeader = childGroup.querySelector(':scope > .api-group__header');
        if (childHeader) childHeader.setAttribute('aria-expanded', expand ? 'true' : 'false');
        // Recursively apply to grandchildren
        toggleAllChildren(childGroup, expand);
      });

      // Also toggle all endpoint details within this group's subtree
      const endpoints = bodyEl.querySelectorAll('.api-endpoint');
      try { console.debug('[API] toggleAllChildren endpoints', { expand, endpoints: endpoints.length }); }
      catch (_) {}
      endpoints.forEach((ep) => {
        ep.setAttribute('data-open', expand ? '1' : '0');
        const epBody = ep.querySelector(':scope > .api-endpoint__body');
        if (epBody) {
          if (expand) epBody.classList.remove('hidden');
          else epBody.classList.add('hidden');
        }
        const toggleBtn = ep.querySelector(':scope > .api-endpoint__header .api-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', expand ? 'true' : 'false');
      });
    };

    const renderNode = (parentEl, node) => {
      // Create group for this node (skip creating a visual group for root if it has only one top-level child)
      const groupEl = (tplGroup && tplGroup.content) ? tplGroup.content.firstElementChild.cloneNode(true) : (() => {
        const s = document.createElement('section'); s.className = 'api-group'; s.setAttribute('data-open', '1');
        const h = document.createElement('header'); h.className = 'api-group__header'; s.appendChild(h);
        const title = document.createElement('h3'); title.className = 'api-group__title'; h.appendChild(title);
        const count = document.createElement('span'); count.className = 'ml-auto hint-sm api-group__count'; h.appendChild(count);
        const b = document.createElement('div'); b.className = 'api-group__body'; s.appendChild(b);
        return s;
      })();
      const titleEl = groupEl.querySelector('.api-group__title');
      const countEl = groupEl.querySelector('.api-group__count');
      const bodyEl = groupEl.querySelector('.api-group__body');
      // In case the template path is missing (fallback DOM path), create a button
      let expandAllBtn = groupEl.querySelector('.api-group__expand-all');
      if (!expandAllBtn) {
        const btn = document.createElement('button');
        btn.className = 'btn-xs api-group__expand-all';
        btn.title = 'Expand/collapse all children';
        btn.textContent = '±';
        const header = groupEl.querySelector('.api-group__header') || groupEl;
        header.appendChild(btn);
        expandAllBtn = btn;
      }
      // Ensure caret exists in fallback groups for proper rotation visuals
      let caretEl = groupEl.querySelector('.api-group__caret');
      if (!caretEl) {
        const header = groupEl.querySelector('.api-group__header') || groupEl;
        const caret = document.createElement('span');
        caret.className = 'api-group__caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><use href="#icon-caret"></use></svg>';
        header.insertBefore(caret, header.firstChild);
        caretEl = caret;
      }

      if (titleEl) titleEl.textContent = node.name;
      // Count includes immediate endpoints + number of child groups
      const childCount = node.endpoints.length + [...node.children.values()].reduce((a, c) => a + c.endpoints.length, 0);
      if (countEl) countEl.textContent = String(childCount);

      // Show expand/collapse all button only if this node has children
      const hasChildren = node.children.size > 0;
      if (expandAllBtn && hasChildren) {
        expandAllBtn.style.display = '';
        expandAllBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent triggering the header toggle
          // Determine if we should expand or collapse based on current state of first child
          const firstChild = bodyEl.querySelector('.api-group');
          const shouldExpand = !firstChild || firstChild.getAttribute('data-open') === '0';
          try { console.debug('[API] Group ± clicked', { group: titleEl ? titleEl.textContent : '', shouldExpand }); }
          catch (_) {}
          toggleAllChildren(groupEl, shouldExpand);
        });
      }
      else if (expandAllBtn) {
        // Hide button if no children
        expandAllBtn.style.display = 'none';
      }

      const headerEl = groupEl.querySelector('.api-group__header');
      if (headerEl) {
        const toggle = () => {
          const open = groupEl.getAttribute('data-open') === '1';
          try { console.debug('[API] Group header toggle', { group: titleEl ? titleEl.textContent : '', wasOpen: open, nowOpen: !open }); }
          catch (_) {}
          groupEl.setAttribute('data-open', open ? '0' : '1');
          bodyEl.style.display = open ? 'none' : '';
          // Sync aria-expanded for accessibility
          headerEl.setAttribute('aria-expanded', open ? 'false' : 'true');
        };
        headerEl.addEventListener('click', (e) => {
          // Don't trigger if the expand all button was clicked
          if (e.target && e.target.closest('.api-group__expand-all')) return;
          toggle();
        });
        headerEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        // Initialize aria-expanded based on current state
        const isOpen = groupEl.getAttribute('data-open') === '1';
        headerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      // Render endpoints at this level
      // Order endpoints by method priority first (GET < POST < DELETE < others), then by path
      const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
      node.endpoints.sort((a, b) => {
        const am = methodOrder[String(a.method).toUpperCase()] || 99;
        const bm = methodOrder[String(b.method).toUpperCase()] || 99;
        const byMethod = am - bm;
        if (byMethod !== 0) return byMethod;
        const byPath = a.path.localeCompare(b.path);
        // try {
        //   console.log('[API] Tree sort:', { methodA: a.method, methodB: b.method, priorityA: am, priorityB: bm, pathA: a.path, pathB: b.path, result: byMethod || byPath });
        // }
        // catch (_) {}
        return byPath;
      });
      node.endpoints.forEach((r) => {
        const epEl = (tplEp && tplEp.content) ? tplEp.content.firstElementChild.cloneNode(true) : (() => { const d = document.createElement('div'); d.className = 'card api-endpoint'; return d; })();
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
          badge.textContent = r.method;
          badge.className = `method-badge ${r.method.toLowerCase()}`;
        }
        if (code) code.textContent = r.path;
        if (summary) {
          const descFirst = (r.description || '').trim();
          const sum = (r.summary || '').trim();
          let show = descFirst || sum || '';
          if (show && show === `${r.method} ${r.path}`) show = '';
          summary.textContent = show || 'No description available';
        }
        const toggleDetails = () => {
          const open = epEl.getAttribute('data-open') === '1';
          try { console.debug('[API] Endpoint toggle', { method: r.method, path: r.path, wasOpen: open, nowOpen: !open }); }
          catch (_) {}
          epEl.setAttribute('data-open', open ? '0' : '1');
          body.classList.toggle('hidden', open);
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (headerRow) headerRow.setAttribute('aria-expanded', open ? 'false' : 'true');
        };
        if (toggleBtn && body) toggleBtn.addEventListener('click', toggleDetails);
        if (headerRow && body) headerRow.addEventListener('click', (e) => {
          if (e.target && (e.target.closest('.api-toggle'))) return;
          toggleDetails();
        });
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
              const opts = { method, headers: { 'Accept': 'application/json' } };
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
              try {
                parsed = JSON.parse(text);
              }
              catch (_) { }
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
    // Guard against environments where classList may be unavailable on container
    try {
      if (container && container.classList && typeof container.classList.add === 'function') {
        container.classList.add('api-groups');
      }
    }
    catch (_) {}
    [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((child) => renderNode(container, child));
  }
  function renderEndpoints(routes) {
    const list = document.getElementById('apiEndpointsList');
    if (!list) {
      try {
        console.warn('[API] renderEndpoints: #apiEndpointsList not found');
      }
      catch (_) { }
      return;
    }
    // Defensive: ensure routes is an array; fall back to lastFetchedRoutes if not
    const safeRoutes = Array.isArray(routes) ? routes : (lastFetchedRoutes || []);
    const treeToggle = document.getElementById('apiTreeToggle');
    const isTreeView = !treeToggle || treeToggle.checked;
    try {
      console.debug('[API] renderEndpoints start', {
        isTreeView,
        routeCount: Array.isArray(safeRoutes) ? safeRoutes.length : 0
      });
    }
    catch (_) {}

    if (isTreeView) {
      const tree = buildTree(safeRoutes);
      renderTree(list, tree);
      try {
        const gCount = list.querySelectorAll('.api-group').length;
        const eCount = list.querySelectorAll('.api-endpoint').length;
        console.debug('[API] renderEndpoints tree rendered', { groups: gCount, endpoints: eCount });
      }
      catch (_) {}
    }
    else {
      renderFlat(list, safeRoutes);
      try {
        const eCount = list.querySelectorAll('.api-endpoint').length;
        console.debug('[API] renderEndpoints flat rendered', { endpoints: eCount });
      }
      catch (_) {}
    }
    // Reset the Endpoints header toggle button label after re-render
    const hdrToggle = document.getElementById('apiEndpointsToggleAllBtn');
    if (hdrToggle) {
      hdrToggle.textContent = 'Expand All';
      try {
        hdrToggle.setAttribute('aria-expanded', 'false');
      }
      catch (_) { }
      try {
        console.debug('[API] renderEndpoints reset toggle-all button');
      }
      catch (_) {}
    }
  }

  function renderFlat(container, routes) {
    if (!container) return;
    const tplEp = document.getElementById('apiEndpointTemplate');
    try {
      container.innerHTML = '';
    }
    catch (_) { return; }
    // Be extra defensive when toggling classes on the container
    try {
      const cl = container && container.classList;
      if (cl && typeof cl.remove === 'function') cl.remove('api-groups');
      if (cl && typeof cl.add === 'function') cl.add('api-endpoints-list');
    }
    catch (_) { }

    // Sort routes by method priority first (GET < POST < DELETE < others), then by path
    const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
    const baseRoutes = Array.isArray(routes) ? routes : [];
    const sortedRoutes = [...baseRoutes].sort((a, b) => {
      const am = methodOrder[String(a?.method || '').toUpperCase()] || 99;
      const bm = methodOrder[String(b?.method || '').toUpperCase()] || 99;
      const byMethod = am - bm;
      if (byMethod !== 0) return byMethod;
      const byPath = String(a?.path || '').localeCompare(String(b?.path || ''));
      try {
        console.log('[API] Flat sort:', { methodA: a?.method, methodB: b?.method, priorityA: am, priorityB: bm, pathA: a?.path, pathB: b?.path, result: byMethod || byPath });
      }
      catch (_) {}
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
      if (headerRow && body) headerRow.addEventListener('click', (e) => {
        if (e.target && (e.target.closest('.api-toggle'))) return;
        toggleDetails();
      });
      if (headerRow && body && !headerRow._kbd) {
        headerRow._kbd = true;
        headerRow.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDetails(); } });
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
        const opts = { method, headers: { 'Accept': 'application/json' } };
        if (body && (method !== 'GET' && method !== 'HEAD')) {
          opts.headers['Content-Type'] = 'application/json';
          opts.body = JSON.stringify(body);
        }
        const res = await fetch(url.toString(), opts);
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); }
        catch (_) { }
        status.textContent = `${res.status} ${res.statusText || ''}`.trim();
        out.textContent = parsed ? fmt(parsed) : text;
      }
      catch (e) {
        status.textContent = 'Error'; out.textContent = String(e);
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
      try { endpointsToggleAll.dataset.wired = '1'; }
      catch (_) {}
      // try { console.log('[API] Expand/Collapse All: wiring click handler'); }
      // catch (_) {}
      // Capture basic clicks for extra observability
      try {
        endpointsToggleAll.addEventListener('pointerdown', (ev) => {
          try { console.log('[API] Expand/Collapse All: pointerdown', { x: ev.clientX, y: ev.clientY, btn: ev.button }); }
          catch (_) {}
        }, { passive: true });
      }
      catch (_) {}
      endpointsToggleAll.addEventListener('click', (ev) => {
        try { console.log('[API] Expand/Collapse All: click', { text: endpointsToggleAll.textContent, aria: endpointsToggleAll.getAttribute('aria-expanded') }); }
        catch (_) {}
        const list = document.getElementById('apiEndpointsList');
        if (!list) {
          try { console.warn('[API] ToggleAll click: #apiEndpointsList not found'); }
        catch (_) {} return; }
        const treeToggle = document.getElementById('apiTreeToggle');
        const isTree = !treeToggle || treeToggle.checked;
        const isExpand = endpointsToggleAll.textContent.toLowerCase().includes('expand');
        try { console.log('[API] Expand/Collapse All: state', { isTree, isExpand }); }
        catch (_) {}
        // In tree view, toggle all groups recursively
        if (isTree) {
          const allGroups = list.querySelectorAll('.api-group');
          try { console.log('[API] Expand/Collapse All: groups found', allGroups.length); }
          catch (_) {}
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
        try { console.log('[API] Expand/Collapse All: endpoints found', allEndpoints.length); }
        catch (_) {}
        allEndpoints.forEach((ep) => {
          ep.setAttribute('data-open', isExpand ? '1' : '0');
          const body = ep.querySelector(':scope > .api-endpoint__body');
          if (body) {
            if (isExpand) body.classList.remove('hidden'); else body.classList.add('hidden');
          }
          const toggleBtn = ep.querySelector(':scope > .api-endpoint__header .api-toggle');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
          const epHdr = ep.querySelector(':scope > .api-endpoint__header');
          if (epHdr) epHdr.setAttribute('aria-expanded', isExpand ? 'true' : 'false');
        });
        // Flip button label
        endpointsToggleAll.textContent = isExpand ? 'Collapse All' : 'Expand All';
        try { endpointsToggleAll.setAttribute('aria-expanded', isExpand ? 'true' : 'false'); }
        catch (_) { }
        try { console.log('[API] Expand/Collapse All: done', { newLabel: endpointsToggleAll.textContent, aria: endpointsToggleAll.getAttribute('aria-expanded') }); }
        catch (_) {}
      });
    }
    // Old header expand/collapse buttons removed in HTML; no wiring needed.

    const treeToggle = document.getElementById('apiTreeToggle');
    if (treeToggle && !treeToggle._wired) {
      treeToggle._wired = true;
      treeToggle.addEventListener('change', () => {
        try { console.debug('[API] Tree toggle changed', { checked: treeToggle.checked }); }
        catch (_) {}
        renderEndpoints(lastFetchedRoutes || []);
        const hdrToggle = document.getElementById('apiEndpointsToggleAllBtn');
        if (hdrToggle) { hdrToggle.textContent = 'Expand All'; try { hdrToggle.setAttribute('aria-expanded', 'false'); }
        catch (_) { } }
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
    // Load on init, when tab becomes active, or if deep-linked
    loadSpecAndRender();
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
  let btnCC;
  let btnPip;
  let btnFullscreen;
  // New controls
  let btnSeekBack30;
  let btnSeekFwd30;
  let btnPrevFrame;
  let btnNextFrame;
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
    try {
      // Some browsers reject play() if another play/pause/seek is pending.
      // Await and swallow errors per recommended guidance.
      await v.play();
    }
    catch (e) {
      // ignore AbortError / NotAllowedError etc. Keep UX stable.
    }
  };
  // Await next 'seeked' event (or timeout) for a given video element.
  const awaitSeekEvent = (v, timeout = 1200) => new Promise((res) => {
    if (!v) return res();
    let done = false;
    const onSeek = () => {
      if (done) return;
      done = true;
      try {
        v.removeEventListener('seeked', onSeek);
      }
      catch (_) { }
      res();
    };
    try {
      v.addEventListener('seeked', onSeek);
    }
    catch (_) { }
    setTimeout(() => {
      if (!done) {
        done = true;
        try {
          v.removeEventListener('seeked', onSeek);
        }
        catch (_) { }
        res();
      }
    }, timeout);
  });
  // Compact artifact badges
  let badgeHeatmap;
  let badgeScenes;
  let badgeSubtitles;
  let badgeSprites;
  let badgeFaces;
  let badgePreview;
  let badgePhash;
  let badgeHeatmapStatus;
  let badgeScenesStatus;
  let badgeSubtitlesStatus;
  let badgeSpritesStatus;
  let badgeFacesStatus;
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
  let scenes = [];
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
  let scrubberScenesLayer = null;
  // ---- Progress persistence (localStorage) ----
  const LS_PREFIX = 'mediaPlayer';
  // Pending override seek time (seconds) applied on next loadedmetadata
  let resumeOverrideTime = null;
  const keyForVideo = (path) => `${LS_PREFIX}:video:${path}`;
  const keyLastVideoObj = () => `${LS_PREFIX}:last`;
  const keyLastVideoPathLegacy = () => `${LS_PREFIX}:lastVideo`;
  function saveProgress(path, data) {
    try {
      if (!path) return;
      const payload = JSON.stringify({
        t: Math.max(0, Number(data?.t ?? 0) || 0),
        d: Math.max(0, Number(data?.d ?? 0) || 0),
        paused: Boolean(data?.paused),
        rate: Number.isFinite(data?.rate) ? Number(data.rate) : undefined,
        ts: Date.now(),
      });
      localStorage.setItem(keyForVideo(path), payload);
      // Store compact last object {path, time}
      try {
        localStorage.setItem(
          keyLastVideoObj(),
          JSON.stringify({
            path: path,
            time: Math.max(0, Number(data?.t) || 0),
            ts: Date.now(),
          }),
        );
      }
      catch (_) { }
      // Legacy key for backward compatibility
      try {
        localStorage.setItem(keyLastVideoPathLegacy(), path);
      }
      catch (_) { }
    }
    catch (_) { }
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
    // Prefer new object key;
    // fallback to legacy path only
    try {
      const raw = localStorage.getItem(keyLastVideoObj());
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object' && j.path) return j;
      }
    }
    catch (_) { }
    try {
      const legacy = localStorage.getItem(keyLastVideoPathLegacy());
      if (legacy) return {path: legacy, time: 0};
    }
    catch (_) { }
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
          try {
            await loadScenes();
          }
          catch (_) { }
          try {
            renderMarkers();
          }
          catch (_) { }
          try {
            renderMarkersList();
          }
          catch (_) { }
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
          try {
            renderMarkers();
          }
          catch (_) { }
          try {
            renderMarkersList();
          }
          catch (_) { }
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
    if (videoEl && !videoEl._dblWired) {
      videoEl._dblWired = true;
      videoEl.addEventListener('dblclick', async (e) => {
        try {
          const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
          if (!document.fullscreenElement) await container.requestFullscreen();
          else await document.exitFullscreen();
        }
        catch (_) { }
      });
    }
    // subtitle overlay element (in-video textual captions rendered by JS)
    subtitleOverlayEl = qs('subtitleOverlay');
    if (overlayBarEl && (!titleEl || !titleEl.textContent.trim())) {
      overlayBarEl.dataset.empty = '1';
    }
    // Scrubber
    scrubberEl = qs('playerScrubber');
    scrubberTrackEl = qs('playerScrubberTrack');
    scrubberProgressEl = qs('playerScrubberProgress');
    scrubberBufferEl = qs('playerScrubberBuffer');
    scrubberTimeEl = qs('playerScrubberTime');
    if (scrubberTrackEl && !scrubberHandleEl) {
      scrubberHandleEl = document.createElement('div');
      scrubberHandleEl.className = 'scrubber-handle';
      scrubberTrackEl.appendChild(scrubberHandleEl);
    }
    if (scrubberTrackEl && !scrubberScenesLayer) {
      scrubberScenesLayer = document.createElement('div');
      scrubberScenesLayer.className = 'scrubber-scenes';
      scrubberTrackEl.appendChild(scrubberScenesLayer);
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
    badgeScenes = qs('badgeScenes');
    badgeSubtitles = qs('badgeSubtitles');
    badgeSprites = qs('badgeSprites');
    badgeFaces = qs('badgeFaces');
    badgePreview = qs('badgePreview');
    badgePhash = qs('badgePhash');
    badgeHeatmapStatus = qs('badgeHeatmapStatus');
    badgeScenesStatus = qs('badgeScenesStatus');
    badgeSubtitlesStatus = qs('badgeSubtitlesStatus');
    badgeSpritesStatus = qs('badgeSpritesStatus');
    badgeFacesStatus = qs('badgeFacesStatus');
    badgePreviewStatus = qs('badgePreviewStatus');
    badgePhashStatus = qs('badgePhashStatus');
    // Support new hyphenated badge IDs (preferred) with fallback to legacy camelCase if present
    const pick = (id1, id2, id3) => document.getElementById(id1) || (id2 ? document.getElementById(id2) : null) || (id3 ? document.getElementById(id3) : null);
    // Note: heatmap badge in markup uses plural "badge-heatmaps"; support both
    badgeHeatmap = pick('badge-heatmaps', 'badge-heatmap', 'badgeHeatmap');
    badgeScenes = pick('badge-scenes', 'badgeScenes');
    badgeSubtitles = pick('badge-subtitles', 'badgeSubtitles');
    badgeSprites = pick('badge-sprites', 'badgeSprites');
    badgeFaces = pick('badge-faces', 'badgeFaces');
    badgePreview = pick('badge-preview', 'badgePreview');
    badgePhash = pick('badge-phash', 'badgePhash');
    badgeHeatmapStatus = pick('badge-heatmaps-status', 'badge-heatmap-status', 'badgeHeatmapStatus');
    badgeScenesStatus = pick('badge-scenes-status', 'badgeScenesStatus');
    badgeSubtitlesStatus = pick('badge-subtitles-status', 'badgeSubtitlesStatus');
    badgeSpritesStatus = pick('badge-sprites-status', 'badgeSpritesStatus');
    badgeFacesStatus = pick('badge-faces-status', 'badgeFacesStatus');
    badgePreviewStatus = pick('badge-preview-status', 'badgePreviewStatus');
    badgePhashStatus = pick('badge-phash-status', 'badgePhashStatus');
    // Extra resilience: if a status element wasn't found but the badge exists, try to locate a child span ending with -status
    if (!badgeScenesStatus && badgeScenes) {
      try {
        badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
      }
      catch (_) { }
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
    btnCC = qs('btnCC');
    btnPip = qs('btnPip');
    btnFullscreen = qs('btnFullscreen');
  // New controls
  btnSeekBack30 = qs('btnSeekBack30');
  btnSeekFwd30 = qs('btnSeekFwd30');
  btnPrevFrame = qs('btnPrevFrame');
  btnNextFrame = qs('btnNextFrame');
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
        try {
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
            try {
              input.style.height = 'auto';
              input.style.height = Math.min(200, input.scrollHeight) + 'px';
            }
            catch (_) { }
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
            try {
              if (videoEl) {
                resumeT = videoEl.currentTime || 0;
                wasPaused = videoEl.paused;
              }
            }
            catch (_) { }
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
              // Immediately swap textarea back to static text before reopening to avoid lingering edit state
              try {
                fiPathEl.textContent = newRel;
              }
              catch (_) { }
              open(newRel);
              // will set new metadata + title (overwrites value again safely)
              if (!wasPaused) {
                setTimeout(() => {
                  try {
                    if (videoEl && videoEl.paused) safePlay(videoEl);
                  }
                  catch (_) { }
                }, 800);
              }
              // Refresh library grid entry names later
              setTimeout(() => {
                try {
                  loadLibrary();
                }
                catch (_) { }
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
        }
        catch (_) { }
      });
    }
    // Wire basic events
    if (videoEl) {
      videoEl.addEventListener('timeupdate', () => {
        const t = videoEl.currentTime || 0;
        if (curEl) curEl.textContent = fmtTime(t);
        if (duration > 0 && progressEl) {
          const pct = Math.max(0, Math.min(100, (t / duration) * 100));
          try {
            progressEl.style.width = pct + '%';
          }
          catch (_) { }
        }
        // Throttled periodic save of progress (every ~5s or on near-end)
        try {
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
        }
        catch (_) { }
      });
      videoEl.addEventListener('loadedmetadata', async () => {
        duration = Number(videoEl.duration) || 0;
        if (totalEl) totalEl.textContent = fmtTime(duration);
        syncControls();
        // Attempt restore if we have saved progress
        try {
          const saved = currentPath ? loadProgress(currentPath) : null;
          const override = resumeOverrideTime;
          // helper: set currentTime and await seek completion (or timeout)
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
                try {
                  videoEl.removeEventListener('seeked', onSeek);
                }
                catch (_) { }
                res();
              }
            }
            // fallback timeout
            setTimeout(() => {
              if (!done) {
                done = true;
                try {
                  videoEl.removeEventListener('seeked', onSeek);
                }
                catch (_) { }
                res();
              }
            }, timeout);
          });
          // use Player-level safePlay(videoEl) to attempt playback and swallow rejections
          if (saved && Number.isFinite(saved.t)) {
            const target = Math.max(0, Math.min(duration || 0, Number(saved.t)));
            if (target && Math.abs(target - (videoEl.currentTime || 0)) > 0.5) {
              await awaitSeek(target);
            }
            if (saved.rate && Number.isFinite(saved.rate)) {
              videoEl.playbackRate = Number(saved.rate);
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
            // No saved progress or explicit override — optionally start at intro end
            try {
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
                // prefer localStorage per-path key first, then server-provided introEnd
                try {
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
                catch (_) { }
              }
            }
            catch (_) { }
          }
          resumeOverrideTime = null;
        }
        catch (_) { }
      });
      // keep overlay cleared on metadata load
      try {
        if (subtitleOverlayEl) {
          subtitleOverlayEl.textContent = '';
          hide(subtitleOverlayEl);
        }
      }
      catch (_) { }
      videoEl.addEventListener('play', syncControls);
      videoEl.addEventListener('pause', () => {
        syncControls();
        try {
          if (currentPath) {
            const t = Math.max(0, videoEl.currentTime || 0);
            saveProgress(currentPath, {
              t: t,
              d: duration,
              paused: true,
              rate: videoEl.playbackRate,
            });
          }
        }
        catch (_) { }
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
    // Also enable sprite hover when moving across the detached heatmap band area
    try {
      const heatBand = document.getElementById('scrubberHeatmapBand');
      if (heatBand && !heatBand._hoverWired) {
        heatBand._hoverWired = true;
        heatBand.addEventListener('mouseenter', () => {
          spriteHoverEnabled = true;
        });
        heatBand.addEventListener('mouseleave', () => {
          spriteHoverEnabled = false; hideSprite();
        });
        heatBand.addEventListener('mousemove', (e) => handleSpriteHover(e));
      }
    }
    catch (_) { }
    if (btnSetThumbnail && !btnSetThumbnail._wired) {
      btnSetThumbnail._wired = true;
      btnSetThumbnail.addEventListener('click', async () => {
        // THUMBNAIL_ASYNC: PLAYER BUTTON HANDLER start – triggers thumbnail generation (inline attempt + fallback) and initiates refresh logic
        const activePath = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
        if (!videoEl || !activePath) return;
        try {
          const t = Math.max(0, videoEl.currentTime || 0);
          let immediateShown = false;
          try {
            const iu = new URL('/api/thumbnail/create/sync', window.location.origin);
            iu.searchParams.set('path', activePath);
            iu.searchParams.set('t', t.toFixed(3));
            iu.searchParams.set('overwrite', 'true');
            const ir = await fetch(iu.toString(), {method: 'POST' });
            if (ir.ok && ir.headers.get('Content-Type')?.includes('image')) {
              const blob = await ir.blob();
              const obj = URL.createObjectURL(blob);
              try {
                if (fiThumbnailImg) fiThumbnailImg.src = obj;
                const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
                if (card) {
                  const img = card.querySelector('img.thumbnail-img');
                  if (img) img.src = obj;
                }
              }
              catch (_) { }
              immediateShown = true;
              notify('Thumbnail updated', 'success');
            }
          }
          catch (_) { }
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
            // Optimistic: assign a unique-busted thumbnail URL immediately (old-index behavior)
            try {
              const bust = Date.now() + Math.floor(Math.random() * 10000);
              const fresh = `/api/thumbnail?path=${encodeURIComponent(activePath)}&cb=${bust}`;
              const fi = document.getElementById('fiThumbnail');
              if (fi) fi.src = fresh;
              const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
              if (card) {
                const img = card.querySelector('img.thumbnail-img');
                if (img) img.src = fresh;
              }
            }
            catch (_) { }
            // Robust finalization: probe until the new file is truly there, then set a second busted URL to defeat any race with stale cache
            try {
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
            }
            catch (_) { }
            try {
              const bust = Date.now() + Math.floor(Math.random() * 10000);
              const fresh = `/api/thumbnail?path=${encodeURIComponent(activePath)}&cb=${bust}`;
              if (fiThumbnailImg) {
                fiThumbnailImg.src = fresh;
              }
              const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
              if (card) {
                const img = card.querySelector('img.thumbnail-img');
                if (img) {
                  img.src = fresh;
                }
              }
            }
            catch (_) { }
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
            try {
              const card = document.querySelector(`.card[data-path="${activePath.replace(/"/g, '\\"')}"]`);
              if (card) card.classList.add('thumbnail-updated');
              setTimeout(() => {
                if (card) {
                  card.classList.remove('thumbnail-updated');
                }
              }, 1200);
            }
            catch (_) { }
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
    if (btnCC && !btnCC._wired) {
      btnCC._wired = true;
      btnCC.addEventListener('click', () => {
        try {
          const tracks = videoEl ? Array.from(videoEl.querySelectorAll('track')) : [];
          const anyShowing = tracks.some((t) => t.mode === 'showing');
          tracks.forEach((t) => (t.mode = anyShowing ? 'disabled' : 'showing'));
          syncControls();
        }
        catch (_) { }
      });
    }
    if (btnPip && !btnPip._wired) {
      btnPip._wired = true;
      btnPip.addEventListener('click', async () => {
        try {
          if (!document.pictureInPictureElement) await videoEl.requestPictureInPicture();
          else await document.exitPictureInPicture();
        }
        catch (_) { }
      });
    }
    if (btnFullscreen && !btnFullscreen._wired) {
      btnFullscreen._wired = true;
      btnFullscreen.addEventListener('click', async () => {
        try {
          const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
          if (!document.fullscreenElement) await container.requestFullscreen();
          else await document.exitFullscreen();
        }
        catch (_) { }
      });
    }
    // ---- New: Seek ±30s helpers & wiring ----
    const clampTime = (t) => Math.max(0, Math.min(Number(videoEl?.duration) || 0, t || 0));
    const approxFps = () => {
      // Prefer a user setting if present; fallback to 30fps
      try {
        const s = localStorage.getItem('setting.frameStepFps');
        const v = Number(s);
        if (Number.isFinite(v) && v > 1 && v < 144) return v;
      }
      catch (_) {}
      return 30;
    };
    const seekBy = async (delta) => {
      if (!videoEl) return;
      const wasPaused = videoEl.paused;
      try {
        const cur = Number(videoEl.currentTime || 0);
        const next = clampTime(cur + delta);
        if (!Number.isFinite(next)) return;
        videoEl.currentTime = next;
        await awaitSeekEvent(videoEl, 1200);
        if (!wasPaused) await safePlay(videoEl);
      }
      catch (_) {}
      showOverlayBar();
    };
    const stepFrame = async (dir) => {
      if (!videoEl) return;
      const wasPaused = videoEl.paused;
      try { if (!wasPaused) videoEl.pause(); }
      catch (_) {}
      const fps = approxFps();
      const step = 1 / Math.max(1, fps);
      try {
        const cur = Number(videoEl.currentTime || 0);
        const next = clampTime(cur + (dir > 0 ? step : -step));
        videoEl.currentTime = next;
        await awaitSeekEvent(videoEl, 1200);
        if (!wasPaused) await safePlay(videoEl);
      }
      catch (_) {}
      showOverlayBar();
    };
    const openByIndexDelta = (dir) => {
      try {
        if (!currentPath) return;
        const cards = Array.from(document.querySelectorAll('.card[data-path]'));
        if (!cards.length) return;
        const idx = cards.findIndex((c) => (c?.dataset?.path || '') === currentPath);
        if (idx === -1) return;
        const nextIdx = Math.max(0, Math.min(cards.length - 1, idx + dir));
        if (nextIdx === idx) return;
        const p = cards[nextIdx]?.dataset?.path;
        if (p) open(p);
      }
      catch (_) {}
    };
    if (btnSeekBack30 && !btnSeekBack30._wired) {
      btnSeekBack30._wired = true;
      btnSeekBack30.addEventListener('click', () => seekBy(-30));
    }
    if (btnSeekFwd30 && !btnSeekFwd30._wired) {
      btnSeekFwd30._wired = true;
      btnSeekFwd30.addEventListener('click', () => seekBy(30));
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
          await loadScenes();
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
      try {
        const tasksTab = document.querySelector('[data-tab="tasks"]');
        if (tasksTab) tasksTab.click();
      }
      catch (_) {}
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
            body: JSON.stringify({ path: currentPath, start: s, end: e })
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
            body: JSON.stringify({ path: currentPath, every })
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const j = await resp.json();
          if (j && j.id) { notify('Split queued', 'success'); ensureTasksTab(); }
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
            const p = card.dataset.path; if (sel.has(p)) ordered.push(p);
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
            body: JSON.stringify({ paths, out_name: outName.trim() || undefined })
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const j = await resp.json();
          if (j && j.id) { notify('Concat queued', 'success'); ensureTasksTab(); }
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
    try {
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
        // First check artifact status for quick validation
        window.__artifactStatus = window.__artifactStatus || {};
        if (window.__artifactStatus[p]) {
          exists = true;
        }
        else {
          // Check artifact status endpoint
          const su = new URL('/api/artifacts/status', window.location.origin);
          su.searchParams.set('path', p);
          const sr = await fetch(su.toString());
          if (sr.ok) {
            const sj = await sr.json();
            const sd = sj && (sj.data || sj);
            if (sd) {
              window.__artifactStatus[p] = sd;
              exists = true;
            }
          }
        }

        // Double-check by probing the actual video file
        if (exists) {
          const encPath = p.split('/').map(encodeURIComponent).join('/');
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
    catch (_) { }
  }
  // Wrap existing initial load hook
  const _origInit = window.addEventListener;
  window.addEventListener('load', () => {
    try {
      const wasSkipped = (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1');
      if (wasSkipped) {
        // Remove any lingering last keys and per-video progress stored during the previous session
        try {
          // remove exact last keys
          lsRemove(keyLastVideoObj());
        }
        catch (_) { }
        try {
          lsRemove(keyLastVideoPathLegacy());
        }
        catch (_) { }
        try {
          // remove any mediaPlayer:video:* entries
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.indexOf(`${LS_PREFIX}:video:`) === 0) toRemove.push(k);
            if (/last/i.test(k)) toRemove.push(k);
          }
          toRemove.forEach((k) => {
            try {
              lsRemove(k);
            }
            catch (_) { }
          });
        }
        catch (_) { }
      }
    }
    catch (_) { }
    try {
      const wasSkippedFlag = (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1');
      // If skip flag present, do NOT auto-resume; defer clearing until after decision
      if (!wasSkippedFlag) {
        lsRemove('mediaPlayer:skipSaveOnUnload');
        setTimeout(tryAutoResumeLast, 800);
      }
      else {
        devLog('info', 'autoResume', 'suppressed due to skip flag after reset');
        // Clear flag after a short delay so future sessions resume normally
        setTimeout(() => {
          try { lsRemove('mediaPlayer:skipSaveOnUnload'); }
          catch (_) {}
        }, 1500);
      }
    }
    catch (_) { }
    // slight delay to allow initial directory list
  });
  window.addEventListener('beforeunload', () => {
    try {
      // If a recent Reset was performed we set a marker to avoid re-saving
      try {
        if (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1') return;
      }
      catch (_) { }
      if (currentPath && videoEl) {
        const t = Math.max(0, videoEl.currentTime || 0);
        saveProgress(currentPath, {
          t: t,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      }
    }
    catch (_) { }
  });
  function syncControls() {
    try {
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
      if (btnCC) {
        const tracks = Array.from(videoEl.querySelectorAll('track'));
        const anyShowing = tracks.some((t) => t.mode === 'showing');
        btnCC.classList.toggle('active', anyShowing);
        // Hide overlay if CC is off
        try {
          if (subtitleOverlayEl && !anyShowing) {
            hide(subtitleOverlayEl);
          }
        }
        catch (_) { }
      }
    }
    catch (_) { }
  }
  // Volume keyboard shortcuts (ArrowUp / ArrowDown)
  if (!window._volKeysBound) {
    window._volKeysBound = true;
    document.addEventListener('keydown', (e) => {
      if (!videoEl) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const inForm = /INPUT|TEXTAREA|SELECT|BUTTON/.test(tag);
      // Prevent page scroll when focused on body and using space/arrow keys for player
      if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!inForm) {
          try {
            e.preventDefault();
          }
          catch (_) { }
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
      // Seek left/right (5s)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (inForm) return;
        const delta = (e.key === 'ArrowLeft') ? -5 : 5;
        try {
          const cur = Number(videoEl.currentTime || 0);
          const dur = Number(videoEl.duration || 0) || 0;
          const next = Math.max(0, Math.min(dur || 9e9, cur + delta));
          videoEl.currentTime = next;
        }
        catch (_) { }
        markKeyboardActive();
        showOverlayBar();
        return;
      }
      // Space toggles play/pause
      if ((e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') && !inForm) {
        try {
          if (videoEl.paused) {
            safePlay(videoEl);
          }
          else {
            videoEl.pause();
          }
        }
        catch (_) { }
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
    try {
      // THUMBNAIL_ASYNC: REFRESH FUNCTION start – attempts to resolve & load latest thumbnail image for sidebar + grid
      if (!fiThumbnailWrap || !fiThumbnailImg || !path) return;
      let updated = false;
      // 1. If the grid already rendered a card for this path, reuse its <img src> directly.
      try {
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
      catch (_) { }
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
            // Also update any grid card image for this path so library view reflects change immediately
            try {
              const card = document.querySelector(`.card[data-path="${path.replace(/"/g, '\\"')}"]`);
              if (card) {
                const cardImg = card.querySelector('img.thumbnail-img');
                if (cardImg) cardImg.src = url;
              }
            }
            catch (_) { }
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
    catch (_) { }
  }
  // Expose for SSE / external triggers
  try {
    window.refreshSidebarThumbnail = refreshSidebarThumbnail;
  }
  catch (_) { }
  // Clicking the sidebar thumbnail should asynchronously reload it (cache-busted)
  if (fiThumbnailImg && !fiThumbnailImg._reloadWired) {
    fiThumbnailImg._reloadWired = true;
    fiThumbnailImg.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!currentPath) return;
      // attempt refresh with new cache-buster
      try {
        await refreshSidebarThumbnail(currentPath);
      }
      catch (_) { }
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
    const favCtrl = document.getElementById('btnFavorite');
    // Reset UI defaults
    if (group) setStarsVisual(0);
    if (desc) {
      try {
        desc.textContent = ' '; desc.setAttribute('data-empty', '1');
      }
      catch (_) { }
    }
    // Fetch from backend
    let ratingServer = null; let description = null; let favorite = false;
    try {
      const u = new URL('/api/media/info', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString());
      if (r.ok) {
        const j = await r.json();
        const d = j?.data || j || {};
        const nr = Number(d.rating);
        if (Number.isFinite(nr) && nr >= 0 && nr <= 5) ratingServer = nr;
        if (typeof d.description === 'string') description = d.description;
        if (typeof d.favorite === 'boolean') favorite = !!d.favorite;
      }
    }
    catch (_) { }
    // Apply UI (allow 0 rating explicitly)
    try {
      if (group) {
        const rv = Number.isFinite(ratingServer) ? Number(ratingServer) : 0;
        group._currentRating = rv;
        setStarsVisual(rv);
      }
      if (desc && typeof description === 'string') {
        try {
          const trimmed = (description || '').trim();
          const empty = trimmed.length === 0;
          desc.textContent = empty ? ' ' : description;
          desc.setAttribute('data-empty', empty ? '1' : '0');
        }
        catch (_) { }
      }
      const updateFav = (on) => {
        try {
          if (favBtn) { favBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); favBtn.classList.toggle('active', !!on); }
        }
        catch (_) {}
        try {
          if (favCtrl) { favCtrl.setAttribute('aria-pressed', on ? 'true' : 'false'); favCtrl.classList.toggle('active', !!on); }
        }
        catch (_) {}
      };
      if (favBtn || favCtrl) {
        try {
          updateFav(favorite);
        }
        catch (_) { }
      }
    }
    catch (_) { }
  }
  async function saveRating(r) {
    if (!currentPath || !Number.isFinite(r)) return;
    let saved = false;
    try {
      const u = new URL('/api/media/rating', window.location.origin);
      u.searchParams.set('path', currentPath);
      u.searchParams.set('rating', String(Math.max(0, Math.min(5, r))));
      const resp = await fetch(u.toString(), {method: 'POST' });
      if (resp.ok) saved = true;
    }
    catch (_) { }
    // If not saved, keep UI as-is; a later refresh will reconcile
  }
  async function saveDescription(text) {
    if (!currentPath) return;
    let saved = false;
    try {
      const u = new URL('/api/media/description', window.location.origin);
      u.searchParams.set('path', currentPath);
      const resp = await fetch(u.toString(), {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({description: text || '' }) });
      if (resp.ok) saved = true;
    }
    catch (_) { }
    // If not saved, UI remains but will reconcile on next load
  }
  async function saveFavorite(on) {
    if (!currentPath) return;
    try {
      const u = new URL('/api/media/favorite', window.location.origin);
      u.searchParams.set('path', currentPath);
      const resp = await fetch(u.toString(), {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({favorite: !!on})});
      if (!resp.ok) throw new Error('favorite save failed');
    }
    catch (_) { /* leave UI; user can retry */ }
  }
  // Wire rating UI (hover preview, keyboard, click commit)
  if (ratingGroup && !ratingGroup._wired) {
    ratingGroup._wired = true;
    // Ensure basic ARIA roles on child stars
    Array.from(ratingGroup.querySelectorAll('.star')).forEach((b) => {
      try {
        b.setAttribute('role', 'radio');
      }
      catch (_) { }
      try {
        if (!b.hasAttribute('tabindex')) b.setAttribute('tabindex', '0');
      }
      catch (_) { }
      // SVG icons already present in markup
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
        e.preventDefault(); cur = Math.min(max, cur + 1); setStarsVisual(cur); ratingGroup._currentRating = cur; saveRating(cur);
      }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault(); cur = Math.max(0, cur - 1); setStarsVisual(cur); ratingGroup._currentRating = cur; saveRating(cur);
      }
      else if (e.key === 'Home') {
        e.preventDefault(); cur = 0; setStarsVisual(cur); ratingGroup._currentRating = cur; saveRating(cur);
      }
      else if (e.key === 'End') {
        e.preventDefault(); cur = max; setStarsVisual(cur); ratingGroup._currentRating = cur; saveRating(cur);
      }
    });
  }
  // Wire description input (contenteditable div)
  if (descInput && !descInput._wired) {
    descInput._wired = true;
    // Start read-only (contenteditable=false); double-click to edit; blur to exit edit mode
    try {
      if (!descInput.hasAttribute('contenteditable')) descInput.setAttribute('contenteditable', 'false');
    }
    catch (_) { }
    try {
      descInput.title = 'Double-click to edit';
    }
    catch (_) { }
    // Ensure a visible click target even when empty
    const ensureSpace = () => {
      try {
        const empty = !descInput.textContent || descInput.textContent.trim().length === 0;
        if (empty) {
          descInput.textContent = ' '; descInput.setAttribute('data-empty', '1');
        }
        else descInput.setAttribute('data-empty', '0');
      }
      catch (_) { }
    };
    ensureSpace();
    const getDesc = () => (descInput.textContent || '').replace(/\s+/g, ' ').trim();
    const persist = debounce(() => saveDescription(getDesc()), 500);
    const placeCaretEnd = (el) => {
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      catch (_) { }
    };
    const beginEdit = () => {
      try {
        descInput.setAttribute('contenteditable', 'true');
      }
      catch (_) { }
      try {
        descInput.focus(); placeCaretEnd(descInput);
      }
      catch (_) { }
    };
    const endEdit = () => {
      try {
        descInput.setAttribute('contenteditable', 'false');
      }
      catch (_) { }
      saveDescription(getDesc());
      ensureSpace();
    };
    descInput.addEventListener('dblclick', beginEdit);
    descInput.addEventListener('blur', endEdit);
    // Prevent Enter from creating multi-line; commit instead
    descInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); descInput.blur();
      }
    });
    // While editing, still debounce-save on input
    descInput.addEventListener('input', () => {
      try {
        descInput.setAttribute('data-empty', getDesc().length ? '0' : '1');
      }
      catch (_) { } persist();
    });
  }
  // If the DOM wasn't ready when this module executed, wire up once it's loaded
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const group = document.getElementById('videoRating');
      if (group && !group._wired) {
        group._wired = true;
        Array.from(group.querySelectorAll('.star')).forEach((b) => {
          try {
            b.setAttribute('role', 'radio');
          }
          catch (_) { }
          try {
            if (!b.hasAttribute('tabindex')) b.setAttribute('tabindex', '0');
          }
          catch (_) { }
          // SVG icons already present in markup
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
            e.preventDefault(); cur = Math.min(max, cur + 1); setStarsVisual(cur); group._currentRating = cur; saveRating(cur);
          }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault(); cur = Math.max(0, cur - 1); setStarsVisual(cur); group._currentRating = cur; saveRating(cur);
          }
          else if (e.key === 'Home') {
            e.preventDefault(); cur = 0; setStarsVisual(cur); group._currentRating = cur; saveRating(cur);
          }
          else if (e.key === 'End') {
            e.preventDefault(); cur = max; setStarsVisual(cur); group._currentRating = cur; saveRating(cur);
          }
        });
      }
    }
    catch (_) { }
    try {
      const fav = document.getElementById('videoFavorite');
      const favCtrlBtn = document.getElementById('btnFavorite');
      const wireFavBtn = (btn) => {
        if (!btn || btn._wired) return;
        btn._wired = true;
        btn.addEventListener('click', () => {
          const cur = btn.getAttribute('aria-pressed') === 'true';
          const next = !cur;
          try { btn.setAttribute('aria-pressed', next ? 'true' : 'false'); btn.classList.toggle('active', next); }
          catch(_) { }
          // Keep both buttons in sync
          try {
            const other = btn === fav ? favCtrlBtn : fav;
            if (other) { other.setAttribute('aria-pressed', next ? 'true' : 'false'); other.classList.toggle('active', next); }
          }
          catch(_) { }
          saveFavorite(next);
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
        });
      };
      wireFavBtn(fav);
      wireFavBtn(favCtrlBtn);
      const di = document.getElementById('videoDescription');
      if (di && !di._wired) {
        di._wired = true;
        try {
          if (!di.hasAttribute('contenteditable')) di.setAttribute('contenteditable', 'false');
        }
        catch (_) { }
        try {
          di.title = 'Double-click to edit';
        }
        catch (_) { }
        const ensureSpace = () => {
          try {
            const empty = !di.textContent || di.textContent.trim().length === 0;
            if (empty) {
              di.textContent = ' '; di.setAttribute('data-empty', '1');
            }
            else di.setAttribute('data-empty', '0');
          }
          catch (_) { }
        };
        ensureSpace();
        const getDesc = () => (di.textContent || '').replace(/\s+/g, ' ').trim();
        const persist = debounce(() => saveDescription(getDesc()), 500);
        const placeCaretEnd = (el) => {
          try {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          catch (_) { }
        };
        const beginEdit = () => {
          try {
            di.setAttribute('contenteditable', 'true'); di.focus(); placeCaretEnd(di);
          }
          catch (_) { }
        };
        const endEdit = () => {
          try {
            di.setAttribute('contenteditable', 'false');
          }
          catch (_) { } saveDescription(getDesc()); ensureSpace();
        };
        di.addEventListener('dblclick', beginEdit);
        di.addEventListener('blur', endEdit);
        di.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); di.blur();
          }
        });
        di.addEventListener('input', () => {
          try {
            di.setAttribute('data-empty', getDesc().length ? '0' : '1');
          }
          catch (_) { } persist();
        });
      }
    }
    catch (_) { }
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
          try { /* optional: mark card as freshly updated */
            const card = document.querySelector(`.card[data-path="${currentPath.replace(/"/g, '\\"')}"]`);
            if (card) card.classList.add('thumbnail-updated');
            setTimeout(() => {
              if (card) card.classList.remove('thumbnail-updated');
            }, 1200);
          }
          catch (_) { }
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
      const pad = (x, n=2) => String(x).padStart(n, '0');
      return (H ? pad(H) + '-' : '') + pad(m) + '-' + pad(s) + '-' + pad(ms, 3);
    })();
    const nameBase = (() => {
      try {
        const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
        const fn = (p || '').split('/').pop() || 'frame';
        return fn.replace(/\.[^.]+$/, '');
      }
      catch (_) { return 'frame'; }
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
        try { URL.revokeObjectURL(url); }
        catch (_) {}
        try { a.remove(); }
        catch (_) {}
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
            catch (e) { reject(e); }
          }, mime, format === 'jpeg' ? 0.92 : 1.0);
        }
        catch (e) { reject(e); }
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
        try { a.remove(); }
      catch (_) {} }, 100);
      return true;
    }
  }
  // Submit a background job via Jobs API
  async function submitJob(task, params = {}, directory = null, recursive = false, force = false) {
    try {
      const res = await fetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, params, directory, recursive, force })
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
    try {
      if (!overlayBarEl) overlayBarEl = document.getElementById('playerOverlayBar');
      if (!overlayBarEl) return;
      overlayBarEl.classList.remove('fading');
      if (scrubberEl) scrubberEl.classList.remove('fading');
      if (overlayHideTimer) {
        clearTimeout(overlayHideTimer);
        overlayHideTimer = null;
      }
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const shouldDefer = (overlayBarEl.matches(':hover') || (scrubberEl && scrubberEl.matches(':hover')) || scrubberDragging || now < overlayKbActiveUntil);
      // Always schedule a fade check, but only apply if conditions allow
      overlayHideTimer = setTimeout(() => {
        try {
          const n = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const stillDefer = (overlayBarEl.matches(':hover') || (scrubberEl && scrubberEl.matches(':hover')) || scrubberDragging || n < overlayKbActiveUntil);
          if (stillDefer) {
            // Re-arm visibility without fading; try again shortly after the main delay window
            showOverlayBar();
            return;
          }
          if (overlayBarEl) overlayBarEl.classList.add('fading');
          if (scrubberEl) scrubberEl.classList.add('fading');
        }
        catch (_) { }
      }, OVERLAY_FADE_DELAY);
    }
    catch (_) { }
  }
  function wireOverlayInteractions() {
    try {
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
        // Keep overlay visible while interacting with controls/scrubber
        try {
          el.addEventListener('mouseenter', () => showOverlayBar(), {passive: true});
          el.addEventListener('mousemove', () => showOverlayBar(), {passive: true});
          el.addEventListener('mouseleave', () => showOverlayBar(), {passive: true});
        }
        catch (_) { }
      });
    }
    catch (_) { }
    // End wireOverlayInteractions
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
      try {
        const buf = videoEl.buffered;
        if (buf && buf.length) {
          const end = buf.end(buf.length - 1);
          const pctB = videoEl.duration ? (end / videoEl.duration) * 100 : 0;
          scrubberBufferEl.style.width = pctB + '%';
        }
      }
      catch (_) { }
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
      try {
        videoEl.currentTime = t;
      }
      catch (_) { }
    }
  }
  function wireScrubberInteractions() {
    if (!scrubberTrackEl || scrubberTrackEl._wired) return;
    scrubberTrackEl._wired = true;
    const onDown = (e) => {
      if (!videoEl) return;
      try {
        e.preventDefault();
      }
      catch (_) { }
      showOverlayBar();
      scrubberDragging = true;
      scrubberWasPaused = videoEl.paused;
      if (!scrubberWasPaused) {
        try {
          videoEl.pause();
        }
        catch (_) { }
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
      try {
        if (e.cancelable) e.preventDefault();
      }
      catch (_) { }
      seekToClientX(e.touches ? e.touches[0].clientX : e.clientX);
    };
    const onUp = async () => {
      scrubberDragging = false;
      try {
        if (videoEl && scrubberWasPaused === false) {
          // wait a short while for the browser to settle the currentTime change
          await awaitSeekEvent(videoEl, 1200);
          try {
            await safePlay(videoEl);
          }
          catch (_) { }
        }
      }
      catch (_) { }
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
  function renderSceneTicks() {
    if (!scrubberScenesLayer || !Array.isArray(scenes) || !videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
    scrubberScenesLayer.innerHTML = '';
    const dur = videoEl.duration;
    scenes.forEach((sc) => {
      const time = Number(sc?.time ?? sc?.t ?? sc?.start ?? sc?.s);
      if (!Number.isFinite(time) || time <= 0 || time >= dur) return;
      const span = document.createElement('span');
      span.style.left = (time / dur * 100) + '%';
      scrubberScenesLayer.appendChild(span);
    });
    // Draw intro-end marker on scrubber (localStorage preferred, then server introEnd)
    try {
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
        scrubberScenesLayer.appendChild(s);
      }
    }
    catch (_) { }
  }
  function open(path) {
    try { devLog('debug', 'player', 'Player.open called', {path, suppressionUntil: playerResetSuppressAutoResumeUntil, now: Date.now()}); }
    catch (_) {}
    initDom();
    wireOverlayInteractions();
    currentPath = path;
    try {
      if (typeof refreshSidebarThumbnail === 'function') refreshSidebarThumbnail(currentPath);
    }
    catch (_) { }
    // Load rating/description for this file (non-blocking)
    try {
      if (typeof loadRatingAndDescription === 'function') loadRatingAndDescription();
    }
    catch (_) { }
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
      try { devLog('info', 'player', 'setting video src', {path: path, encPath: encPath, url: finalUrl}); }
      catch (_) {}
      videoEl.src = finalUrl;
      try { devLog('debug', 'player', 'src assigned', {currentSrc: videoEl.currentSrc}); }
      catch (_) {}
      // Fire a HEAD probe (non-blocking) to validate existence/MIME and surface status in logs
      try {
        const urlNoBust = src.toString();
        fetch(urlNoBust, {method: 'HEAD' })
        .then((r) => {
          try { devLog('info', 'player', 'HEAD /files status', {status: r.status, contentType: r.headers.get('content-type')}); }
        catch (_) {} })
        .catch((e) => {
          try { devLog('error', 'player', 'HEAD /files failed', e); }
        catch (_) {} });
      }
      catch (_) { }
      // Debug media lifecycle once
      if (!videoEl._dbgWired) {
        videoEl._dbgWired = true;
        const logEvt = (evt) => {
          try {
            console.debug('[player:event]', evt.type, {
              readyState: videoEl.readyState,
              networkState: videoEl.networkState,
              currentSrc: videoEl.currentSrc || videoEl.src || '',
            });
          }
          catch (_) { }
        };
        ['loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'suspend', 'abort', 'emptied', 'waiting', 'seeking', 'seeked', 'ended'].forEach((t) => { videoEl.addEventListener(t, logEvt); });
      }
      if (!videoEl._errWired) {
        videoEl._errWired = true;
        videoEl.addEventListener('error', (e) => {
          try {
            const err = (videoEl.error ? {code: videoEl.error.code, message: videoEl.error.message} : null);
            console.error('[player:error] Video failed to load', {
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
                // Clear the last video entry from localStorage
                try {
                  lsRemove(keyLastVideoObj());
                  lsRemove(keyLastVideoPathLegacy());
                  devLog('info', 'player', 'cleared missing video from localStorage', {path: path});
                }
                catch (_) {}

                // Show user-friendly toast
                notify(`Video file "${path}" is no longer available and has been removed from recent files.`, 'error');

                // Redirect to library grid after a brief delay
                setTimeout(() => {
                  try {
                    // Reset player to clear any lingering state
                    resetPlayer({ full: true });

                    // Switch to library tab if not already there
                    const libraryTab = document.querySelector('[data-target="library"]');
                    if (libraryTab) {
                      libraryTab.click();
                    }

                    devLog('info', 'player', 'redirected to library after missing video', {path: path});
                  }
                  catch (_) {}
                }, 1500);
              }
            }
          }
          catch (_) { }
        });
      }
      // Defer autoplay decision to loadedmetadata restore
      // Attempt to keep lastVideo reference for convenience
      saveProgress(path, {t: 0, d: 0, paused: true, rate: 1});
      startScrubberLoop();
      videoEl.addEventListener('ended', () => stopScrubberLoop(), {once: true});
      wireScrubberInteractions();
      // When metadata arrives, we can now safely render scene ticks if scenes already loaded
      videoEl.addEventListener('loadedmetadata', () => {
        try {
          renderSceneTicks();
        }
        catch (_) { }
        // Also, on initial load, if an intro-end exists, seek there so the scrubber shows the correct start position.
        try {
          (function () {
            try {
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
                  try {
                    videoEl.removeEventListener('seeked', onSeek);
                  }
                  catch (_) { } try {
                    updateScrubber();
                  }
                  catch (_) { }
                };
                try {
                  videoEl.addEventListener('seeked', onSeek);
                  videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, t));
                }
                catch (_) {
                  try {
                    updateScrubber();
                  }
                  catch (_) { }
                }
                // ensure scrubber updates even if seeked not fired
                setTimeout(() => {
                  try {
                    updateScrubber();
                  }
                  catch (_) { }
                }, 250);
              }
            }
            catch (_) { }
          })();
        }
        catch (_) { }
      }, {once: true});
    }
    // Update floating title bar if present
    try {
      const titleTarget = document.getElementById('playerTitle');
      if (titleTarget) {
        const rawName = path.split('/').pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
        titleTarget.textContent = baseName;
        if (overlayBarEl && baseName) delete overlayBarEl.dataset.empty;
        if (typeof showOverlayBar === 'function') showOverlayBar();
      }
    }
    catch (_) { }
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
        // sidebar title removed
        // Populate file info table
        try {
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
        catch (_) { }
      }
      catch (_) {
        const rawName = path.split('/').pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
        if (titleEl) titleEl.textContent = baseName;
        if (overlayBarEl && baseName) delete overlayBarEl.dataset.empty;
        // sidebar title removed
        try {
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
        catch (_) { }
      }
    })();
    // Artifacts: load consolidated status first, then conditional loaders
    (async () => {
      try {
        await loadArtifactStatuses();
      }
      catch (_) { }
      // Now that cache is warm, only invoke loaders that might need full data
      loadHeatmaps();
      loadSprites();
      loadScenes();
      loadSubtitles();
      try {
        loadVideoChips();
      }
      catch (_) { }
    })();
    wireBadgeActions();
  }
  // Expose globally for Random Play
  try {
    window.__playerOpen = open;
  }
  catch (_) { }
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
    try {
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
    }
    catch (_) { }
    renderChipSet(perfListEl, performers, 'performer');
    renderChipSet(tagListEl, tags, 'tag');
    // Update label counts (e.g., "Performers (2)", "Tags (5)")
    try {
      const perfLabel = document.querySelector('#videoPerformersGroup .chips-label');
      const tagLabel = document.querySelector('#videoTagsGroup .chips-label');
      if (perfLabel) perfLabel.textContent = `Performers (${performers.length})`;
      if (tagLabel) tagLabel.textContent = `Tags (${tags.length})`;
    }
    catch (_) { }
    wireChipInputs();

    // Suggestions based on registry names matched in the filename (case-insensitive, simple heuristic)
    try {
      const base = (currentPath.split('/').pop() || currentPath).replace(/\.[^.]+$/, '');
      const baseLower = base.toLowerCase();
      // cache registries
      window.__REG = window.__REG || {};
      if (!window.__REG.performers) {
        try {
          const r = await fetch('/api/registry/performers');
          if (r.ok) {
            const j = await r.json();
            window.__REG.performers = Array.isArray(j?.data?.performers) ? j.data.performers : (Array.isArray(j?.performers) ? j.performers : []);
          }
        }
        catch (_) { window.__REG.performers = []; }
      }
      if (!window.__REG.tags) {
        try {
          const r = await fetch('/api/registry/tags');
          if (r.ok) {
            const j = await r.json();
            window.__REG.tags = Array.isArray(j?.data?.tags) ? j.data.tags : (Array.isArray(j?.tags) ? j.tags : []);
          }
        }
        catch (_) { window.__REG.tags = []; }
      }
      const perfNames = (window.__REG.performers || []).map((p) => p?.name).filter(Boolean);
      const tagNames = (window.__REG.tags || []).map((t) => t?.name).filter(Boolean);
      const havePerf = new Set((performers || []).map((x) => String(x).toLowerCase()));
      const haveTag = new Set((tags || []).map((x) => String(x).toLowerCase()));
      // match helper: check word-ish match by collapsing non-alnum to spaces
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const baseNorm = ' ' + norm(baseLower) + ' ';
      const containsWord = (needle) => {
        const n = ' ' + norm(needle) + ' ';
        // require each token of needle to appear in base in order
        return n.trim().split(/\s+/).every((tok) => baseNorm.includes(' ' + tok + ' '));
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
        if (!arr || !arr.length) { el.innerHTML = ''; return; }
        const frag = document.createDocumentFragment();
        const label = document.createElement('div');
        label.className = 'hint-sm hint-sm--muted mb-4';
        label.textContent = 'Suggestions:';
        frag.appendChild(label);
        arr.forEach((name) => {
          const chip = document.createElement('span');
          chip.className = 'chip chip-suggest';
          chip.title = 'Click to add';
          chip.textContent = name;
          chip.addEventListener('click', () => addChip(kind, name));
          frag.appendChild(chip);
        });
        el.innerHTML = '';
        el.appendChild(frag);
      };
      renderSuggestions(perfSugEl, perfSuggestions, 'performer');
      renderSuggestions(tagSugEl, tagSuggestions, 'tag');
    }
    catch (_) { /* suggestions best-effort */ }
  }
  function renderChipSet(container, items, kind) {
    if (!container) return;
    container.innerHTML = '';
    (items || []).forEach((item) => {
      if (!item || typeof item !== 'string') return;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.nameLower = String(item).toLowerCase();
      const label = document.createElement('span');
      label.className = 'chip-label';
      label.textContent = item;
      label.title = 'View in Library';
      label.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          const tab = document.querySelector('[data-tab="library"]');
          if (tab) tab.click();
          if (kind === 'tag') {
            libraryTagFilters = [ _slugify(item) ];
          }
          else {
            libraryPerformerFilters = [ item ];
          }
          try { setLocalStorageJSON('filters.tags', libraryTagFilters); }
          catch(_) { }
          try { setLocalStorageJSON('filters.performers', libraryPerformerFilters); }
          catch(_) { }
          if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
          if (typeof loadLibrary === 'function') loadLibrary();
          if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
        }
        catch(_) { }
      });
      const rm = document.createElement('span');
      rm.className = 'remove';
      rm.setAttribute('role', 'button');
      rm.setAttribute('aria-label', 'Remove');
      rm.title = 'Remove';
      rm.textContent = '×';
      rm.addEventListener('click', (ev) => { ev.stopPropagation(); removeChip(kind, item); });
      chip.appendChild(label);
      chip.appendChild(rm);
      container.appendChild(chip);
    });
  }
  function wireChipInputs() {
    const perfInput = document.getElementById('videoPerformerInput');
    const tagInput = document.getElementById('videoTagInput');
    // Helper to ensure registries are loaded and cached
    async function ensureRegistries() {
      window.__REG = window.__REG || {};
      if (!window.__REG.performers) {
        try {
          const r = await fetch('/api/registry/performers');
          if (r.ok) {
            const j = await r.json();
            window.__REG.performers = Array.isArray(j?.data?.performers) ? j.data.performers : (Array.isArray(j?.performers) ? j.performers : []);
          }
          else {
            window.__REG.performers = [];
          }
        }
        catch (_) { window.__REG.performers = []; }
      }
      if (!window.__REG.tags) {
        try {
          const r = await fetch('/api/registry/tags');
          if (r.ok) {
            const j = await r.json();
            window.__REG.tags = Array.isArray(j?.data?.tags) ? j.data.tags : (Array.isArray(j?.tags) ? j.tags : []);
          }
          else {
            window.__REG.tags = [];
          }
        }
        catch (_) { window.__REG.tags = []; }
      }
    }
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
      await ensureRegistries();
      const regNames = (kind === 'performer' ? (window.__REG.performers || []) : (window.__REG.tags || []))
        .map((x) => x?.name)
        .filter(Boolean);
      // Exclude already assigned chips
      const assigned = new Set(Array.from(document.querySelectorAll(`#${kind === 'performer' ? 'videoPerformers' : 'videoTags'} .chip`)).map((n) => (n.dataset.nameLower || n.querySelector('.chip-label')?.textContent || '').toLowerCase()))
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
        const chip = document.createElement('span');
        chip.className = 'chip chip-suggest';
        chip.title = 'Click to add';
        chip.textContent = name;
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
  // Run browser-side face detection using the FaceDetector API and upload results to server
  async function detectAndUploadFacesBrowser(opts) {
    try {
      initDom();
      if (!currentPath || !videoEl) {
        notify('Open a video in the Player first, then try again.', 'error');
        // Removed auto-switch: only switch when user initiates face detection from Player context.
        // if (window.tabSystem) window.tabSystem.switchToTab('player');
        return;
      }
      // Feature check
      const Supported = 'FaceDetector' in window && typeof window.FaceDetector === 'function';
      if (!Supported) {
        notify('FaceDetector API not available in this browser. Try Chrome/Edge desktop.', 'error');
        return;
      }
      // Options from UI
      const intervalSec = Math.max(0.2, parseFloat(document.getElementById('faceInterval')?.value || '1.0'));
      const minSizeFrac = Math.max(0.01, Math.min(0.9, parseFloat(document.getElementById('faceMinSize')?.value || '0.10')));
      const maxSamples = 300;
      // safety cap
      // Ensure metadata is ready
      if (!Number.isFinite(duration) || duration <= 0) {
        await new Promise((res) => {
          const onMeta = () => {
            videoEl.removeEventListener('loadedmetadata', onMeta);
            res();
          };
          videoEl.addEventListener('loadedmetadata', onMeta);
        });
      }
      const W = Math.max(1, videoEl.videoWidth || 0);
      const H = Math.max(1, videoEl.videoHeight || 0);
      // Prepare canvas
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', {willReadFrequently: false});
      if (!ctx) {
        notify('Canvas not available for capture.', 'error');
        return;
      }
      const detector = new window.FaceDetector({
        fastMode: true,
        maxDetectedFaces: 10,
      });
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
      try {
        videoEl.pause();
      }
      catch (_) { }
      notify(`Browser face detection: sampling ${samples.length} frame(s)...`, 'info');
      const faces = [];
      // Helper: precise seek
      const seekTo = (t) =>
        new Promise((res) => {
        const onSeek = () => {
          videoEl.removeEventListener('seeked', onSeek);
          res();
        };
        videoEl.addEventListener('seeked', onSeek);
        try {
          videoEl.currentTime = Math.max(0, Math.min(total, t));
        }
        catch (_) {
          res();
        }
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
            faces.push({
              time: Number(t.toFixed(3)),
              box: [x, y, w, h],
              score: 1.0,
            });
          }
        }
        catch (err) { }
      }
      // Restore playback position/state
      try {
        videoEl.currentTime = prevT;
      }
      catch (_) { }
      try {
        if (!wasPaused) await safePlay(videoEl);
      }
      catch (_) { }
      if (faces.length === 0) {
        notify('No faces detected in sampled frames.', 'error');
        return;
      }
      // If an existing faces.json is present, confirm overwrite
      let overwrite = true;
      try {
        const head = await fetch('/api/faces?path=' + encodeURIComponent(currentPath), {method: 'HEAD' });
        if (head.ok) {
          overwrite = confirm('faces.json already exists for this video. Replace it with browser-detected faces?');
          if (!overwrite) return;
        }
      }
      catch (_) { }
      // Upload
      const payload = {faces: faces, backend: 'browser-facedetector', stub: false};
      const url = new URL('/api/faces/upload', window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set('compute_embeddings', 'true');
      url.searchParams.set('overwrite', overwrite ? 'true' : 'false');
      const r = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      const j = await r.json();
      if (j?.status === 'success') {
        notify(`Uploaded ${faces.length} face(s) from browser detection.`, 'success');
        // Refresh indicators
        try {
          if (window.tasksManager) window.tasksManager.loadCoverage();
        }
        catch (_) { }
        try {
          await loadArtifactStatuses();
        }
        catch (_) { }
      }
      else {
        throw new Error(j?.message || 'Upload failed');
      }
    }
    catch (e) {
      notify('Browser detection failed: ' + (e && e.message ? e.message : 'error'), 'error');
    }
  }
  async function loadHeatmaps() {
    if (!currentPath) return;
    try {
      try {
        const st = window.__artifactStatus && window.__artifactStatus[currentPath];
        if (st && st.heatmaps === false) {
          if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = '✗';
          if (badgeHeatmap) badgeHeatmap.dataset.present = '0';
          applyTimelineDisplayToggles();
          return;
        }
      }
      catch (_) { }
      // Prefer JSON + canvas rendering for higher fidelity
      let renderedViaJson = false;
      try {
        const ju = new URL('/api/heatmaps', window.location.origin);
        ju.searchParams.set('path', currentPath);
        const jr = await fetch(ju.toString(), {
          headers: {Accept: 'application/json' },
        });
        if (jr.ok) {
          const jj = await jr.json();
          const hm = jj?.data?.heatmaps || jj?.heatmaps || jj;
          const samples = Array.isArray(hm?.samples) ? hm.samples : [];
          if (samples.length && heatmapCanvasEl) {
            drawHeatmapCanvas(samples);
            // Clear any PNG bg under it
            heatmapEl.style.backgroundImage = '';
            hasHeatmap = true;
            renderedViaJson = true;
          }
        }
      }
      catch (_) { }
      if (!renderedViaJson) {
        const url = '/api/heatmaps?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
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
          // Sidebar heatmap preview
          try {
            const img = document.getElementById('sidebarHeatmapImage');
            const box = document.getElementById('sidebarHeatmapPreview');
            if (img && box) {
              img.src = url; box.classList.remove('hidden');
            }
          }
          catch (_) { }
        }
        else {
          heatmapEl.style.backgroundImage = '';
          if (heatmapCanvasEl) clearHeatmapCanvas();
          hasHeatmap = false;
          try {
            const box = document.getElementById('sidebarHeatmapPreview');
            if (box) box.classList.add('hidden');
          }
          catch (_) { }
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
      try {
        const box = document.getElementById('sidebarHeatmapPreview');
        if (box) box.classList.add('hidden');
      }
      catch (_) { }
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
      return lerpColor([79, 140, 255, 0.85], [255, 122, 89, 0.95], t);
    }
  }
  function lerpColor(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    const al = (a[3] + (b[3] - a[3]) * t).toFixed(3);
    return `rgba(${r},${g},${bl},${al})`;
  }
  // Render heatmap samples (array of numbers 0..1) onto the canvas spanning full duration
  function drawHeatmapCanvas(samples) {
    try {
      if (!heatmapCanvasEl) return;
      const ctx = heatmapCanvasEl.getContext('2d', {willReadFrequently: false});
      if (!ctx) return;
      const w = heatmapCanvasEl.width = heatmapCanvasEl.clientWidth || heatmapCanvasEl.offsetWidth || 800;
      const h = heatmapCanvasEl.height = heatmapCanvasEl.clientHeight || heatmapCanvasEl.offsetHeight || 24;
      ctx.clearRect(0, 0, w, h);
      if (!Array.isArray(samples) || !samples.length) return;
      // Normalize samples: accept [number] or [{v, t? }] or mixed
      const values = samples.map((s) => {
        if (typeof s === 'number') return s;
        if (s && typeof s === 'object') {
          // prefer 'v'; fallback to common aliases
          const cand = (s.v != null ? s.v : (s.value != null ? s.value : s.y));
          const num = Number(cand);
          return Number.isFinite(num) ? num : NaN;
        }
        return NaN;
      });
      // Build a smooth, white area graph across the width
      const n = values.length;
      const padTop = 1;
      const padBottom = 1;
      // Resample to at most one sample per horizontal pixel for smoother curves
      const m = Math.max(1, Math.min(w, n));
      const resampled = new Array(m);
      if (n <= m) {
        // spread original points across width
        for (let i = 0; i < m; i++) {
          const srcIdx = Math.min(n - 1, Math.round((i / Math.max(1, m - 1)) * (n - 1)));
          const v = Number(values[srcIdx]);
          resampled[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
        }
      }
      else {
        // bucket-average when there are more samples than pixels
        for (let i = 0; i < m; i++) {
          const start = Math.floor((i / m) * n);
          const end = Math.floor(((i + 1) / m) * n);
          let sum = 0; let cnt = 0;
          for (let j = start; j < Math.max(start + 1, end); j++) {
            const v = Number(values[j]);
            if (Number.isFinite(v)) {
              sum += v; cnt++;
            }
          }
          const avg = cnt ? (sum / cnt) : 0;
          resampled[i] = Math.max(0, Math.min(1, avg));
        }
      }
      // Dynamic normalization: robust percentile scaling + gentle gamma to reveal detail
      const norm = (() => {
        try {
          const copy = resampled.slice()
          .filter((x) => Number.isFinite(x))
          .sort((a, b) => a - b);
          if (!copy.length) return resampled;
          const q = (p) => copy[Math.max(0, Math.min(copy.length - 1, Math.round(p * (copy.length - 1))))];
          let lo = q(0.05);
          let hi = q(0.95);
          if (!(hi > lo)) {
            lo = copy[0];
            hi = copy[copy.length - 1];
          }
          const rng = Math.max(1e-6, hi - lo);
          const gamma = 0.75; // <1 brightens mid-tones to boost subtle peaks
          return resampled.map((v) => {
            let x = (v - lo) / rng;
            x = x < 0 ? 0 : x > 1 ? 1 : x;
            return Math.pow(x, gamma);
          });
        }
        catch (_) {
          return resampled;
        }
      })();
      // Convert to canvas coordinates
      const xs = new Array(m);
      const ys = new Array(m);
      for (let i = 0; i < m; i++) {
        xs[i] = m === 1 ? 0 : (i / (m - 1)) * (w - 1);
        const v = norm[i];
        // invert Y so higher values are taller
        ys[i] = padTop + (1 - v) * Math.max(1, (h - padTop - padBottom));
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (m === 1) {
        // Single sample: draw a flat area proportional to value
        const y = ys[0];
        ctx.beginPath();
        ctx.moveTo(0, h - padBottom);
        ctx.lineTo(0, y);
        ctx.lineTo(w, y);
        ctx.lineTo(w, h - padBottom);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      else {
        // Smooth curve via quadratic midpoints
        ctx.beginPath();
        ctx.moveTo(0, h - padBottom);
        ctx.lineTo(xs[0], ys[0]);
        for (let i = 1; i < m; i++) {
          const xc = (xs[i - 1] + xs[i]) / 2;
          const yc = (ys[i - 1] + ys[i]) / 2;
          ctx.quadraticCurveTo(xs[i - 1], ys[i - 1], xc, yc);
        }
        // last segment to the last point
        ctx.lineTo(xs[m - 1], ys[m - 1]);
        // close the area to the bottom
        ctx.lineTo(xs[m - 1], h - padBottom);
        ctx.closePath();
        // Fill and stroke in white
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    }
    catch (_) { }
  }
  function clearHeatmapCanvas() {
    try {
      if (!heatmapCanvasEl) return;
      const ctx = heatmapCanvasEl.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, heatmapCanvasEl.width, heatmapCanvasEl.height);
    }
    catch (_) { }
  }
  async function loadSprites() {
    // initialize
    sprites = null;
    if (!currentPath) return;
    try {
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.sprites === false) {
        if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✗';
        if (badgeSprites) badgeSprites.dataset.present = '0';
        return;
      }
    }
    catch (_) { }
    try {
      const u = new URL('/api/sprites/json', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u);
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      const data = await r.json();
      const index = data?.data?.index;
      const sheet = data?.data?.sheet;
      if (index && sheet) {
        sprites = {index, sheet};
        if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✓';
        if (badgeSprites) badgeSprites.dataset.present = '1';
        // Sidebar sprite sheet preview
        try {
          const img = document.getElementById('sidebarSpriteImage');
          const box = document.getElementById('sidebarSpritePreview');
          const sheetUrl = typeof sheet === 'string' ? sheet : (sheet?.url || sheet?.path || '');
          if (img && box && sheetUrl) {
            img.src = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            box.classList.remove('hidden');
          }
        }
        catch (_) { }
      }
    }
    catch (_) {
      sprites = null;
    }
    if (!sprites) {
      if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✗';
      if (badgeSprites) badgeSprites.dataset.present = '0';
      try {
        const box = document.getElementById('sidebarSpritePreview');
        if (box) box.classList.add('hidden');
      }
      catch (_) { }
    }
  }
  async function loadScenes() {
    scenes = [];
    if (!currentPath) return;
    try {
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.markers === false) {
        // Scenes artifact absent; continue anyway to load manual markers via /api/markers
        if (!badgeScenesStatus && badgeScenes) {
          try {
            badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
          }
          catch (_) { }
        }
        // Don't early return; we'll set the real count after fetching markers
      }
    }
    catch (_) { }
    try {
      // Prefer markers API (manual points); share same backing store
      let u = new URL('/api/markers', window.location.origin);
      u.searchParams.set('path', currentPath);
      let r = await fetch(u);
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      let data = await r.json();
      let d = data?.data || data || {};
      // Normalize markers array
      let arr = Array.isArray(d.markers) ? d.markers : (Array.isArray(d.scenes) ? d.scenes : []);
      // Intro/Outro: prefer new consolidated keys, fall back to legacy when present
      if (typeof d.intro !== 'undefined') {
        const iv = Number(d.intro);
        introEnd = Number.isFinite(iv) ? iv : null;
      }
      else if (typeof d.intro_end !== 'undefined') {
        const iv = Number(d.intro_end);
        introEnd = Number.isFinite(iv) ? iv : null;
      }
      else {
        introEnd = null;
      }
      if (typeof d.outro !== 'undefined') {
        const ob = Number(d.outro);
        outroBegin = Number.isFinite(ob) ? ob : null;
      }
      else if (typeof d.outro_begin !== 'undefined') {
        const ob = Number(d.outro_begin);
        outroBegin = Number.isFinite(ob) ? ob : null;
      }
      else {
        outroBegin = null;
      }
      scenes = arr
        .map((s) => ({ time: Number(s.time || s.t || s.start || 0) }))
        .filter((s) => Number.isFinite(s.time));
      // No legacy fallback: markers are canonical
      renderMarkers();
      // If the exact status element wasn't resolved early, try to locate it once more now
      if (!badgeScenesStatus && badgeScenes) {
        try {
          badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
        }
        catch (_) { }
      }
      if (badgeScenesStatus) badgeScenesStatus.textContent = scenes.length ? String(scenes.length) : '0';
      if (badgeScenes) badgeScenes.dataset.present = scenes.length ? '1' : '0';
      applyTimelineDisplayToggles();
      // Scene ticks may depend on duration;
      // schedule retries until duration known
      if (scenes.length) scheduleSceneTicksRetry();
    }
    catch (_) {
      scenes = [];
      renderMarkers();
      if (!badgeScenesStatus && badgeScenes) {
        try {
          badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
        }
        catch (_) { }
      }
      if (badgeScenesStatus) badgeScenesStatus.textContent = '0';
      if (badgeScenes) badgeScenes.dataset.present = '0';
    }
    applyTimelineDisplayToggles();
  }
  let sceneTickRetryTimer = null;
  function scheduleSceneTicksRetry(attempt = 0) {
    if (sceneTickRetryTimer) {
      clearTimeout(sceneTickRetryTimer);
      sceneTickRetryTimer = null;
    }
    if (!videoEl || !Array.isArray(scenes) || !scenes.length) return;
    const ready = Number.isFinite(videoEl.duration) && videoEl.duration > 0;
    if (ready) {
      try {
        renderSceneTicks();
      }
      catch (_) { } return;
    }
    if (attempt > 12) return;
    // ~3s max (12 * 250ms)
    sceneTickRetryTimer = setTimeout(() => scheduleSceneTicksRetry(attempt + 1), 250);
  }
  async function loadSubtitles() {
    subtitlesUrl = null;
    if (!currentPath || !videoEl) return;
    try {
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.subtitles === false) {
        if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✗';
        if (badgeSubtitles) badgeSubtitles.dataset.present = '0';
        return;
      }
    }
    catch (_) { }
    // Remove existing tracks and their cue listeners
    Array.from(videoEl.querySelectorAll('track')).forEach((t) => {
      try {
        const tt = t.track || null;
        if (tt && t._cueHandler) {
          try {
            tt.removeEventListener && tt.removeEventListener('cuechange', t._cueHandler);
          }
          catch (_) { }
        }
      }
      catch (_) { }
      try {
        t.remove();
      }
      catch (_) { }
    });
    try {
      // Prefer a lightweight HEAD probe to avoid double-fetching subtitle data
      const head = await fetch('/api/subtitles?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
      if (head.ok) {
        const src = '/api/subtitles?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
        subtitlesUrl = src;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Subtitles';
        track.srclang = 'en';
        track.default = true;
        track.src = src;
        // browser will parse SRT in many cases;
        // if not, still downloadable
        videoEl.appendChild(track);
        // If browser exposes textTracks, listen for cue changes and render into overlay
        try {
          const tt = track.track || Array.from(videoEl.textTracks || []).find((t) => t.kind === 'subtitles');
          if (tt) {
            // ensure track mode is showing only when toggled;
            // start disabled to let CC button control display
            if (typeof tt.mode !== 'undefined') tt.mode = 'disabled';
            const onCueChange = () => {
              try {
                const active = Array.from(tt.activeCues || []).map((c) => c.text)
                .join('\n');
                if (subtitleOverlayEl) {
                  if (active && active.trim()) {
                    subtitleOverlayEl.textContent = active.replace(/\r?\n/g, '\n');
                    show(subtitleOverlayEl);
                  }
                  else {
                    subtitleOverlayEl.textContent = '';
                    hide(subtitleOverlayEl);
                  }
                }
              }
              catch (_) { }
            };
            // store reference to remove later if needed
            track._cueHandler = onCueChange;
            try {
              tt.addEventListener('cuechange', onCueChange);
            }
            catch (_) { }
          }
        }
        catch (_) { }
        if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✓';
        if (badgeSubtitles) badgeSubtitles.dataset.present = '1';
      }
    }
    catch (_) {

      /* ignore */
    }
    if (!subtitlesUrl) {
      if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✗';
      if (badgeSubtitles) badgeSubtitles.dataset.present = '0';
    }
  }
  function renderMarkers() {
    if (!markersEl) return;
    markersEl.innerHTML = '';
    const haveScenes = Array.isArray(scenes) && scenes.length > 0;
    // Always refresh sidebar list even before metadata duration is known
    try {
      renderMarkersList();
    }
    catch (_) { }
    if (!haveScenes) return;
    // nothing else to draw yet
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    // wait for loadedmetadata
    for (const s of scenes) {
      const t = Math.max(0, Math.min(duration, Number(s.time)));
      if (!Number.isFinite(t) || t <= 0 || t >= duration) continue;
      const pct = (t / duration) * 100;
      const mark = document.createElement('div');
      mark.className = 'marker-tick';
      mark.style.left = `calc(${pct}% - 2px)`;
      mark.title = fmtTime(t);
      markersEl.appendChild(mark);
    }
    // Draw intro end marker if available and in-range
    try {
      if (introEnd && Number.isFinite(Number(introEnd)) && duration && introEnd > 0 && introEnd < duration) {
        const pct = (introEnd / duration) * 100;
        const im = document.createElement('div');
        im.className = 'intro-marker-tick';
        im.style.left = `calc(${pct}% - 3px)`;
        im.title = 'Intro: ' + fmtTime(introEnd);
        markersEl.appendChild(im);
      }
      if (typeof outroBegin !== 'undefined' && Number.isFinite(Number(outroBegin)) && duration && outroBegin > 0 && outroBegin < duration) {
        const pct = (outroBegin / duration) * 100;
        const om = document.createElement('div');
        om.className = 'outro-marker-tick';
        om.style.left = `calc(${pct}% - 3px)`;
        om.title = 'Outro: ' + fmtTime(outroBegin);
        markersEl.appendChild(om);
      }
    }
    catch (_) { }
  }
  // Sidebar Markers List DOM rendering
  function renderMarkersList() {
    const list = document.getElementById('markersList');
    if (!list) return;
    list.innerHTML = '';
    const tpl = document.getElementById('markerRowTemplate');
    if (!tpl || !tpl.content) {
      // Template is required by repo policy; if missing, show a simple notice and bail
      const n = document.createElement('div');
      n.className = 'markers-empty';
      n.textContent = 'Markers unavailable (template missing)';
      list.appendChild(n);
      return;
    }
    // Small helper to clone the row template and fill fields
    function buildRow(options) {
      const {label, timeSec, variantClass, editableName, editableTime, onJump, onDelete, strongLabel} = options;
      const frag = tpl.content.cloneNode(true);
      const row = frag.querySelector('.marker-row');
      if (!row) return null;
      if (variantClass) {
        row.classList.add(variantClass);
      }
      const nameLabel = row.querySelector('.marker-name-label');
      const timeLabel = row.querySelector('.marker-time-label');
      const jumpBtn = row.querySelector('.marker-jump');
      const delBtn = row.querySelector('.marker-remove');
      if (nameLabel) {
        nameLabel.textContent = label;
        if (strongLabel) {
          nameLabel.classList.add('marker-label-strong', 'flex-1');
        }
        if (editableName) {
          nameLabel.title = 'Click to edit marker name';
          nameLabel.tabIndex = 0;
          nameLabel.addEventListener('click', () => startMarkerNameEdit(nameLabel, editableName));
          nameLabel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startMarkerNameEdit(nameLabel, editableName);
            }
          });
        }
        else {
          nameLabel.title = '';
          nameLabel.removeAttribute('tabindex');
          nameLabel.classList.remove('marker-name-label--editable');
        }
      }
      if (timeLabel) {
        timeLabel.textContent = fmtTime(Number(timeSec) || 0);
        if (editableTime) {
          timeLabel.title = 'Click to edit time';
          timeLabel.tabIndex = 0;
          timeLabel.addEventListener('click', () => startMarkerTimeEdit(timeLabel, editableTime));
          timeLabel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startMarkerTimeEdit(timeLabel, editableTime);
            }
          });
        }
        else {
          timeLabel.title = '';
          timeLabel.removeAttribute('tabindex');
          timeLabel.classList.remove('marker-time-label--editable');
        }
      }
      if (jumpBtn && typeof onJump === 'function') {
        jumpBtn.addEventListener('click', onJump);
      }
      if (delBtn && typeof onDelete === 'function') {
        delBtn.addEventListener('click', onDelete);
      }
      return frag;
    }
    // Special markers: Intro end
    try {
      let it = null;
      if (introEnd && Number.isFinite(Number(introEnd))) {
        it = Number(introEnd);
      }
      else {
        const introKeyNew = `${LS_PREFIX}:intro:${currentPath}`;
        const introKeyOld = `${LS_PREFIX}:introEnd:${currentPath}`;
        const rawIntro = currentPath ? (getLocalStorageItem(introKeyNew) ?? getLocalStorageItem(introKeyOld)) : null;
        if (rawIntro && Number.isFinite(Number(rawIntro))) it = Number(rawIntro);
      }
      if (it !== null && Number.isFinite(it)) {
        const frag = buildRow({
          label: 'Intro',
          timeSec: it,
          variantClass: 'marker-row--intro',
          editableName: null,
          editableTime: null,
          strongLabel: true,
          onJump: () => {
            if (videoEl) videoEl.currentTime = Math.min(duration, Math.max(0, it));
          },
          onDelete: async () => {
            try {
              try { lsRemove(`${LS_PREFIX}:intro:${currentPath}`); }
              catch (_) { }
              try { lsRemove(`${LS_PREFIX}:introEnd:${currentPath}`); }
              catch (_) { }
              // also remove server-side
              try {
                const mu = new URL('/api/markers', window.location.origin);
                mu.searchParams.set('path', currentPath);
                mu.searchParams.set('special', 'intro');
                await fetch(mu.toString(), { method: 'DELETE' });
              }
              catch (_) { }
              notify('Intro cleared', 'success');
              await loadScenes();
              renderMarkersList();
            }
            catch (_) {
              notify('Failed to clear intro', 'error');
            }
          },
        });
        if (frag) {
          // style icon buttons for special markers
          const tmp = frag.querySelector('.marker-jump');
          if (tmp) tmp.classList.add('marker-btn-icon');
          const tmp2 = frag.querySelector('.marker-remove');
          if (tmp2) {
            tmp2.classList.add('marker-btn-icon'); tmp2.title = 'Clear';
          }
          list.appendChild(frag);
        }
      }
      // Outro begin
      let ot = null;
      if (outroBegin && Number.isFinite(Number(outroBegin))) {
        ot = Number(outroBegin);
      }
      else {
        const outroKeyNew = `${LS_PREFIX}:outro:${currentPath}`;
        const outroKeyOld = `${LS_PREFIX}:outroBegin:${currentPath}`;
        const rawOutro = currentPath ? (getLocalStorageItem(outroKeyNew) ?? getLocalStorageItem(outroKeyOld)) : null;
        if (rawOutro && Number.isFinite(Number(rawOutro))) ot = Number(rawOutro);
      }
      if (ot !== null && Number.isFinite(ot)) {
        const frag = buildRow({
          label: 'Outro',
          timeSec: ot,
          variantClass: 'marker-row--outro',
          editableName: null,
          editableTime: null,
          strongLabel: true,
          onJump: () => {
            if (videoEl) videoEl.currentTime = Math.min(duration, Math.max(0, ot));
          },
          onDelete: async () => {
            try {
              try { lsRemove(`${LS_PREFIX}:outro:${currentPath}`); }
              catch (_) { }
              try { lsRemove(`${LS_PREFIX}:outroBegin:${currentPath}`); }
              catch (_) { }
              // also remove server-side
              try {
                const mu = new URL('/api/markers', window.location.origin);
                mu.searchParams.set('path', currentPath);
                mu.searchParams.set('special', 'outro');
                await fetch(mu.toString(), { method: 'DELETE' });
              }
              catch (_) { }
              notify('Outro cleared', 'success');
              outroBegin = null;
              renderMarkers();
              renderMarkersList();
            }
            catch (_) {
              notify('Failed to clear outro', 'error');
            }
          },
        });
        if (frag) {
          const tmp = frag.querySelector('.marker-jump');
          if (tmp) tmp.classList.add('marker-btn-icon');
          const tmp2 = frag.querySelector('.marker-remove');
          if (tmp2) {
            tmp2.classList.add('marker-btn-icon'); tmp2.title = 'Clear';
          }
          list.appendChild(frag);
        }
      }
    }
    catch (_) { /* no-op */ }
    if (!Array.isArray(scenes) || scenes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'markers-empty';
      empty.textContent = 'No markers';
      list.appendChild(empty);
      return;
    }
    // Regular markers (sorted by time)
    const sorted = scenes.slice().sort((a, b) => (a.time || 0) - (b.time || 0));
    sorted.forEach((sc, idx) => {
      const t = Number(sc.time) || 0;
      const fallbackName = sc.label ? String(sc.label) : `#${idx + 1}`;
      const frag = buildRow({
        label: fallbackName,
        timeSec: t,
        variantClass: null,
        editableName: sc,
        editableTime: sc,
        strongLabel: false,
        onJump: () => {
          if (videoEl) videoEl.currentTime = Math.min(duration, Math.max(0, sc.time || 0));
        },
        onDelete: () => removeMarker(sc),
      });
      if (frag) list.appendChild(frag);
    });
  }
  // (parseTimeString moved to utils.js)
  async function commitTimeEdit(input, sceneObj) {
    const raw = input.value.trim();
    const seconds = parseTimeString(raw);
    if (!Number.isFinite(seconds) || seconds < 0) {
      input.classList.add('is-error');
      setTimeout(() => input.classList.remove('is-error'), 1200);
      input.value = fmtTime(Number(sceneObj.time || 0));
      return;
    }
    const clamped = Math.min(Math.max(0, seconds), Math.max(0, duration || 0));
    if (Math.abs(clamped - (sceneObj.time || 0)) < 0.01) {
      input.value = fmtTime(clamped);
      return;
    }
    try {
      const url = new URL('/api/markers', window.location.origin);
      url.searchParams.set('path', currentPath || '');
      url.searchParams.set('old_time', String(sceneObj.time || 0));
      url.searchParams.set('new_time', String(clamped));
      const r = await fetch(url.toString(), {method: 'POST' });
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      sceneObj.time = clamped;
      // Refresh scenes from server for authoritative order
      await loadScenes();
      renderMarkersList();
    }
    catch (e) {
      notify('Failed to update marker', 'error');
      input.value = fmtTime(Number(sceneObj.time || 0));
    }
  }
  // Swap static time label to editable input for a regular marker
  function startMarkerTimeEdit(labelEl, sceneObj) {
    if (!labelEl || labelEl._editing) return;
    labelEl._editing = true;
    const parent = labelEl.parentElement;
    if (!parent) return;
    const original = labelEl.textContent || fmtTime(Number(sceneObj.time || 0));
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'marker-time-input';
    input.value = original;
    input.setAttribute('aria-label', 'Edit marker time');
    // Replace label with input
    parent.replaceChild(input, labelEl);
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTimeEdit(input, sceneObj);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', () => commitTimeEdit(input, sceneObj));
    function cancel() {
      // restore label
      const restored = document.createElement('div');
      restored.className = 'marker-time-label marker-time-label--editable';
      restored.textContent = fmtTime(Number(sceneObj.time || 0));
      restored.title = 'Click to edit time';
      restored.tabIndex = 0;
      restored.addEventListener('click', () => startMarkerTimeEdit(restored, sceneObj));
      restored.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startMarkerTimeEdit(restored, sceneObj);
        }
      });
      try {
        parent.replaceChild(restored, input);
      }
      catch (_) { }
    }
  }
  // Swap static name label to editable input for a regular marker
  function startMarkerNameEdit(labelEl, sceneObj) {
    if (!labelEl || labelEl._editing) return;
    labelEl._editing = true;
    const parent = labelEl.parentElement;
    if (!parent) return;
    const original = labelEl.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'marker-name-input';
    input.value = original;
    input.setAttribute('aria-label', 'Edit marker name');
    parent.replaceChild(input, labelEl);
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNameEdit(input, sceneObj, original);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', () => commitNameEdit(input, sceneObj, original));
    function cancel() {
      restoreLabel(sceneObj);
    }
    function restoreLabel(sobj) {
      const restored = document.createElement('div');
      restored.className = 'marker-name-label marker-name-label--editable';
      const fb = sobj.label ? String(sobj.label) : original || `#${Math.max(1, Math.round((sobj.time || 0)))}`;
      restored.textContent = fb;
      restored.title = 'Click to edit marker name';
      restored.tabIndex = 0;
      restored.addEventListener('click', () => startMarkerNameEdit(restored, sobj));
      restored.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startMarkerNameEdit(restored, sobj);
        }
      });
      try {
        parent.replaceChild(restored, input);
      }
      catch (_) { }
    }
  }
  async function commitNameEdit(input, sceneObj, original) {
    const raw = (input.value || '').trim();
    const newLabel = raw === '' ? null : raw;
    // allow clearing
    // If unchanged
    if ((sceneObj.label || '') === (newLabel || '')) {
      // restore without network
      replaceWithLabel();
      return;
    }
    try {
      const url = new URL('/api/markers', window.location.origin);
      url.searchParams.set('path', currentPath || '');
      url.searchParams.set('old_time', String(sceneObj.time || 0));
      url.searchParams.set('new_time', String(sceneObj.time || 0));
      url.searchParams.set('type', sceneObj.type || 'scene');
      if (newLabel !== null) url.searchParams.set('label', newLabel);
      const r = await fetch(url.toString(), {method: 'POST' });
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      sceneObj.label = newLabel;
      await loadScenes();
      // refresh for canonical order/labels
      renderMarkersList();
    }
    catch (e) {
      notify('Failed to update marker name', 'error');
      replaceWithLabel();
    }
    function replaceWithLabel() {
      const parent = input.parentElement;
      if (!parent) return;
      const restored = document.createElement('div');
      restored.className = 'marker-name-label marker-name-label--editable';
      const fb = sceneObj.label ? String(sceneObj.label) : (original || `#${Math.max(1, Math.round((sceneObj.time || 0)))}`);
      restored.textContent = fb;
      restored.title = 'Click to edit marker name';
      restored.tabIndex = 0;
      restored.addEventListener('click', () => startMarkerNameEdit(restored, sceneObj));
      restored.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startMarkerNameEdit(restored, sceneObj);
        }
      });
      try {
        parent.replaceChild(restored, input);
      }
      catch (_) { }
    }
  }
  async function removeMarker(sceneObj) {
    try {
      const url = new URL('/api/markers', window.location.origin);
      url.searchParams.set('path', currentPath || '');
      url.searchParams.set('time', String(sceneObj.time || 0));
      if (sceneObj.type) url.searchParams.set('type', String(sceneObj.type));
      const r = await fetch(url.toString(), {method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // Reload scenes
      await loadScenes();
      renderMarkersList();
      notify('Marker removed', 'success');
    }
    catch (e) {
      notify('Failed to remove marker', 'error');
    }
  }
  // Add marker button (sidebar)
  (function wireAddMarkerButton() {
    const btn = document.getElementById('btnAddMarker');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      if (!currentPath || !videoEl) return;
      const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
      try {
        const url = new URL('/api/markers', window.location.origin);
        url.searchParams.set('path', currentPath);
        url.searchParams.set('time', String(t.toFixed(3)));
        const r = await fetch(url.toString(), {method: 'POST' });
        if (!r.ok) {
          throw new Error('HTTP ' + r.status);
        }
        await loadScenes();
        renderMarkersList();
        notify('Marker added', 'success');
      }
      catch (e) {
        notify('Failed to add marker', 'error');
      }
    });
  })();
  let spriteHoverEnabled = false;
  async function loadArtifactStatuses() {
    if (!currentPath) return;
    // Lazy acquire (in case of markup changes) without assuming globals exist
    const badgeThumbnail = window.badgeThumbnail || document.getElementById('badge-thumbnail');
    const badgeThumbnailStatus = window.badgeThumbnailStatus || document.getElementById('badge-thumbnail-status');
    const badgePreview = window.badgePreview || document.getElementById('badge-preview');
    const badgePreviewStatus = window.badgePreviewStatus || document.getElementById('badge-preview-status');
    const badgeSprites = window.badgeSprites || document.getElementById('badge-sprites');
    const badgeSpritesStatus = window.badgeSpritesStatus || document.getElementById('badge-sprites-status');
    const badgeScenes = window.badgeScenes || document.getElementById('badge-scenes');
    const badgeScenesStatus = window.badgeScenesStatus || document.getElementById('badge-scenes-status');
    const badgeSubtitles = window.badgeSubtitles || document.getElementById('badge-subtitles');
    const badgeSubtitlesStatus = window.badgeSubtitlesStatus || document.getElementById('badge-subtitles-status');
    const badgeFaces = window.badgeFaces || document.getElementById('badge-faces');
    const badgeFacesStatus = window.badgeFacesStatus || document.getElementById('badge-faces-status');
    const badgePhash = window.badgePhash || document.getElementById('badge-phash');
    const badgePhashStatus = window.badgePhashStatus || document.getElementById('badge-phash-status');
    const badgeHeatmap = window.badgeHeatmap || document.getElementById('badge-heatmaps');
    const badgeHeatmapStatus = window.badgeHeatmapStatus || document.getElementById('badge-heatmaps-status');
    const badgeMeta = window.badgeMeta || document.getElementById('badge-metadata');
    const badgeMetaStatus = window.badgeMetaStatus || document.getElementById('badge-metadata-status');
    try {
      const u = new URL('/api/artifacts/status', window.location.origin);
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString());
      if (!r.ok) {
        throw new Error('artifact status ' + r.status);
      }
      const j = await r.json();
      const d = j && (j.data || j);
      // cache
      window.__artifactStatus = window.__artifactStatus || {};
      window.__artifactStatus[currentPath] = d;
      const set = (present, badgeEl, statusEl) => {
        if (statusEl) statusEl.textContent = present ? '✓' : '✗';
        if (badgeEl) badgeEl.dataset.present = present ? '1' : '0';
      };
      // Backend returns `thumbnail` and `heatmap` (singular).
      set(Boolean(d.thumbnail), badgeThumbnail, badgeThumbnailStatus);
      set(Boolean(d.preview ?? d.hover), badgePreview, badgePreviewStatus);
      set(Boolean(d.sprites), badgeSprites, badgeSpritesStatus);
      set(Boolean(d.markers), badgeScenes, badgeScenesStatus);
      set(Boolean(d.subtitles), badgeSubtitles, badgeSubtitlesStatus);
      set(Boolean(d.faces), badgeFaces, badgeFacesStatus);
      set(Boolean(d.phash), badgePhash, badgePhashStatus);
      set(Boolean(d.heatmaps ?? d.heatmap), badgeHeatmap, badgeHeatmapStatus);
      set(Boolean(d.metadata), badgeMeta, badgeMetaStatus);
    }
    catch (_) {
      // On failure, mark unknowns as missing (do not spam console)
      const badges = [
        [badgeThumbnail, badgeThumbnailStatus],
        [badgePreview, badgePreviewStatus],
        [badgeSprites, badgeSpritesStatus],
        [badgeScenes, badgeScenesStatus],
        [badgeSubtitles, badgeSubtitlesStatus],
        [badgeFaces, badgeFacesStatus],
        [badgePhash, badgePhashStatus],
        [badgeHeatmap, badgeHeatmapStatus],
        [badgeMeta, badgeMetaStatus],
      ];
      for (const [b, s] of badges) {
        if (s) s.textContent = '✗';
        if (b) b.dataset.present = '0';
      }
    }
  }
  function wireBadgeActions() {
    const gen = async (kind) => {
      if (!currentPath) return;
      // Capability gating: map kind -> operation type
      try {
        const caps = (window.tasksManager && window.tasksManager.capabilities) || window.__capabilities || {};
        const needsFfmpeg = new Set([
          'heatmaps',
          'markers',
          'sprites',
          'previews',
          'phash',
        ]);
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
      }
      catch (_) { }
      try {
        let url;
        if (kind === 'heatmaps') url = new URL('/api/heatmaps/create', window.location.origin);
        else if (kind === 'markers') url = new URL('/api/markers/detect', window.location.origin);
        else if (kind === 'subtitles') url = new URL('/api/subtitles/create', window.location.origin);
        else if (kind === 'sprites') url = new URL('/api/sprites/create', window.location.origin);
        else if (kind === 'faces') url = new URL('/api/faces/create', window.location.origin);
        else if (kind === 'previews') url = new URL('/api/preview', window.location.origin);
        else if (kind === 'phash') url = new URL('/api/phash', window.location.origin);
        else return;
        url.searchParams.set('path', currentPath);
        // Mark badge loading before request to give immediate feedback
        const badgeEl = document.getElementById(`badge-${kind}`) || document.getElementById(`badge-${kind.toLowerCase()}`);
        if (badgeEl) {
          badgeEl.dataset.loading = '1';
        }
        const r = await fetch(url.toString(), {method: 'POST' });
        if (!r.ok) {
          throw new Error('HTTP ' + r.status);
        }
        notify(kind + ' generation started', 'success');
        // Poll artifact status until present; do not clear spinner on a fixed timeout.
        // This keeps the spinner visible until the job actually completes.
        const POLL_INTERVAL = 1200;
        const pathAtStart = currentPath;
        const poll = async () => {
          // If there's no active path or the selection changed, stop and clear spinner.
          if (!currentPath || currentPath !== pathAtStart) return finish();
          try {
            await loadArtifactStatuses();
            // Determine presence based on kind
            const st = window.__artifactStatus && window.__artifactStatus[currentPath];
            let present = false;
            if (st) {
              if (kind === 'heatmaps') present = Boolean(st.heatmaps);
              else if (kind === 'markers') present = Boolean(st.markers);
              else if (kind === 'subtitles') present = Boolean(st.subtitles);
              else if (kind === 'sprites') present = Boolean(st.sprites);
              else if (kind === 'faces') present = Boolean(st.faces);
              else if (kind === 'previews') present = Boolean(st.preview ?? st.hover);
              else if (kind === 'phash') present = Boolean(st.phash);
            }
            if (present) {
              // Load any richer data renderers once present
              if (kind === 'heatmaps') await loadHeatmaps();
              else if (kind === 'markers') await loadScenes();
              else if (kind === 'sprites') await loadSprites();
              else if (kind === 'subtitles') await loadSubtitles();
              return finish();
            }
          }
          catch (_) { }
          // Keep polling until present; avoid clearing spinner prematurely.
          setTimeout(poll, POLL_INTERVAL);
        };
        const finish = () => {
          if (badgeEl) delete badgeEl.dataset.loading;
        };
        setTimeout(poll, 500);
      }
      catch (e) {
        notify('Failed to start ' + kind + ' job', 'error');
        const badgeEl = document.getElementById(`badge-${kind}`) || document.getElementById(`badge-${kind.toLowerCase()}`);
        if (badgeEl) delete badgeEl.dataset.loading;
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
    // Resolve current badge elements (hyphenated IDs preferred)
    const bHeat = document.getElementById('badge-heatmaps') || badgeHeatmap;
    const bScenes = document.getElementById('badge-scenes') || badgeScenes;
    const bSubs = document.getElementById('badge-subtitles') || badgeSubtitles;
    const bSprites = document.getElementById('badge-sprites') || badgeSprites;
    const bFaces = document.getElementById('badge-faces') || badgeFaces;
    const bPreview = document.getElementById('badge-preview') || badgePreview;
    const bPhash = document.getElementById('badge-phash') || badgePhash;
    attach(bHeat, 'heatmaps');
    attach(bScenes, 'markers');
    attach(bSubs, 'subtitles');
    attach(bSprites, 'sprites');
    attach(bFaces, 'faces');
    attach(bPreview, 'previews');
    attach(bPhash, 'phash');
  }
  function handleSpriteHover(evt) {
    if (!sprites || !sprites.index || !sprites.sheet) {
      hideSprite();
      return;
    }
    if (!spriteHoverEnabled) {
      hideSprite();
      return;
    }
    const targetTrack = scrubberTrackEl || timelineEl;
    if (!targetTrack) {
      hideSprite();
      return;
    }
    // Prefer the element actually under the cursor (heatmap band or scrubber track)
    const srcEl = (evt && evt.currentTarget && typeof evt.currentTarget.getBoundingClientRect === 'function') ? evt.currentTarget : targetTrack;
    const rect = srcEl.getBoundingClientRect();
    // Tooltip now lives under the controls container below the video
    const container = spriteTooltipEl && spriteTooltipEl.parentElement ? spriteTooltipEl.parentElement : videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
    const containerRect = container.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    if (x < 0 || x > rect.width) {
      hideSprite();
      return;
    }
    const pct = x / rect.width;
    const vidDur = (Number.isFinite(duration) && duration > 0) ? duration : (videoEl && Number.isFinite(videoEl.duration) ? videoEl.duration : 0);
    if (!vidDur) {
      hideSprite();
      return;
    }
    const t = pct * vidDur;
    // Position tooltip
    // Determine tile width/height for placement
    let tw = 240;
    let th = 135;
    try {
      const idx = sprites.index;
      tw = Number(idx.tile_width || (idx.tile && idx.tile[0]) || tw);
      th = Number(idx.tile_height || (idx.tile && idx.tile[1]) || th);
    }
    catch (_) { }
    // Scale preview to avoid being too large;
    // cap width to 180px
    const scale = Math.min(1, 180 / Math.max(1, tw));
    const twS = Math.max(1, Math.round(tw * scale));
    const thS = Math.max(1, Math.round(th * scale));
    const halfW = Math.max(1, Math.floor(twS / 2));
    const baseLeft = rect.left - containerRect.left + x - halfW;
    // center on cursor
    const clampedLeft = Math.max(8, Math.min(containerRect.width - (twS + 8), baseLeft));
    // Compute vertical placement so the preview sits just above the scrubber track
    const gap = 8;
    // px gap between preview bottom and scrubber top
    const previewTop = (rect.top - containerRect.top) - gap - thS;
    // rect.top relative to container
    spriteTooltipEl.style.left = clampedLeft + 'px';
    spriteTooltipEl.style.top = Math.max(0, previewTop) + 'px';
    spriteTooltipEl.style.bottom = 'auto';
    spriteTooltipEl.style.transform = 'none';
    spriteTooltipEl.style.zIndex = '9999';
    showAs(spriteTooltipEl, 'block');
    // Compute background position based on sprite metadata
    try {
      const idx = sprites.index;
      const cols = Number(idx.cols || (idx.grid && idx.grid[0]) || 0);
      const rows = Number(idx.rows || (idx.grid && idx.grid[1]) || 0);
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
        hideSprite();
        return;
      }
      const interval = Number(idx.interval || 0);
      // Support both numeric frame count and array of frame metadata with timestamps
      const framesMeta = Array.isArray(idx.frames) ? idx.frames : null;
      let totalFrames = cols * rows;
      if (framesMeta && framesMeta.length) {
        totalFrames = framesMeta.length;
      }
      else if (Number.isFinite(Number(idx.frames))) {
        totalFrames = Math.max(1, Number(idx.frames));
      }
      const metaDur = Number(idx.duration || idx.video_duration || (framesMeta && framesMeta.length ? (Number(framesMeta[framesMeta.length - 1]?.t ?? framesMeta[framesMeta.length - 1]?.time ?? 0) || 0) : 0) || vidDur || 0);
      // Choose a frame index based on available metadata
      let frame = 0;
      if (framesMeta && framesMeta.length) {
        // framesMeta is usually small (<= 100). Linear search for nearest is fine and avoids per-move allocations.
        let nearest = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < framesMeta.length; i++) {
          const ft = Number(framesMeta[i]?.t ?? framesMeta[i]?.time ?? (i * (metaDur / Math.max(1, framesMeta.length - 1))));
          const d = Math.abs(ft - t);
          if (d < bestDiff) {
            bestDiff = d; nearest = i;
            if (d === 0) break;
          }
        }
        frame = nearest;
      }
      else if (interval > 0 && Number.isFinite(interval)) {
        frame = Math.floor(t / interval);
        // If interval-based mapping badly undershoots coverage, fallback to proportional mapping
        if (metaDur && interval * (totalFrames - 1) < metaDur * 0.6) {
          frame = Math.floor((t / metaDur) * (totalFrames - 1));
        }
      }
      else if (metaDur > 0) {
        frame = Math.floor((t / metaDur) * (totalFrames - 1));
      }
      else {
        frame = Math.floor((t / Math.max(0.1, vidDur)) * (totalFrames - 1));
      }
      frame = Math.min(totalFrames - 1, Math.max(0, frame));
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      // Use integer-scaled tile dimensions to avoid subpixel rounding artifacts
      const xOff = -(col * twS);
      const yOff = -(row * thS);
      spriteTooltipEl.style.width = twS + 'px';
      spriteTooltipEl.style.height = thS + 'px';
      // Cache-bust sheet URL lightly in case a new sheet was generated while hovering
      const sheetUrl = `${sprites.sheet}${sprites.sheet.includes('?') ? '&' : '?'}t=${Date.now()}`;
      spriteTooltipEl.style.backgroundImage = `url('${sheetUrl}')`;
      spriteTooltipEl.style.backgroundPosition = `${xOff}px ${yOff}px`;
      // Set both shorthand and axis-specific positions for robustness across browsers
      try {
        spriteTooltipEl.style.backgroundPositionX = `${xOff}px`;
      }
      catch (_) { }
      try {
        spriteTooltipEl.style.backgroundPositionY = `${yOff}px`;
      }
      catch (_) { }
      // Scale the full sheet using integer tile sizes to align exactly
      const sheetW = twS * cols;
      const sheetH = thS * rows;
      spriteTooltipEl.style.backgroundSize = `${sheetW}px ${sheetH}px`;
      spriteTooltipEl.style.opacity = '0.8';
    }
    catch (_) {
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
        if (videoEl.paused) safePlay(videoEl);
        else videoEl.pause();
      }
    }
    catch (_) { }
  });
  // Persist on unload as a final safeguard
  window.addEventListener('beforeunload', () => {
    try {
      if (videoEl && currentPath) {
        saveProgress(currentPath, {
          t: videoEl.currentTime || 0,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      }
    }
    catch (_) { }
  });
  function hideSprite() {
    hide(spriteTooltipEl);
  }
  // Apply show/hide for heatmap and markers based on settings
  function applyTimelineDisplayToggles() {
    try {
      const band = document.getElementById('scrubberHeatmapBand');
      if (band) {
        if (showHeatmap && hasHeatmap) band.classList.remove('hidden');
        else band.classList.add('hidden');
      }
      if (markersEl) {
        if (showScenes && scenes && scenes.length > 0) show(markersEl);
        else hide(markersEl);
      }
      renderSceneTicks();
    }
    catch (_) { }
  }
  // Public API
  function getPath() {
    return currentPath;
  }
  return {open, showOverlayBar, detectAndUploadFacesBrowser, getPath};
})();
window.Player = Player;
// Player module assigned to window
// -----------------------------
// Global: Pause video when leaving Player tab
// -----------------------------
(function setupTabPause() {
  function pauseIfNotActive(activeId) {
    try {
      if (!window.Player) return;
      const v = document.getElementById('playerVideo');
      if (!v) return;
      const active = activeId || (window.tabSystem && window.tabSystem.getActiveTab && window.tabSystem.getActiveTab());
      if (active !== 'player' && !v.paused && !v.ended) {
        try {
          v.pause();
        }
        catch (_) { }
      }
    }
    catch (_) { }
  }
  // Hook custom tabSystem event style if it exposes on/subscribe
  try {
    const ts = window.tabSystem;
    if (ts && typeof ts.on === 'function') {
      ts.on('switch', (id) => pauseIfNotActive(id));
    }
    else if (ts && typeof ts.addEventListener === 'function') {
      ts.addEventListener('switch', (e) => pauseIfNotActive(e.detail));
    }
  }
  catch (_) { }
  // MutationObserver fallback watching player panel visibility/class changes
  try {
    const panel = document.getElementById('player-panel');
    if (panel && !panel._pauseObserver) {
      const obs = new MutationObserver(() => pauseIfNotActive());
      obs.observe(panel, {attributes: true, attributeFilter: ['hidden', 'class'] });
      panel._pauseObserver = obs;
    }
  }
  catch (_) { }
  // Also pause on document hidden (tab/background)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseIfNotActive('not-player');
  });
})();
// -----------------------------
// Player Enhancements: Sidebar collapse + Effects (filters/transforms)
// -----------------------------
// Sidebar + Effects Enhancements
function initPlayerEnhancements() {
  const sidebar = document.getElementById('playerSidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const accordionRoot = document.getElementById('sidebarAccordion');
  const stage = document.getElementById('videoStage') || document.querySelector('.player-stage-simple');
  const playerLayout = document.getElementById('playerLayout');
  const filterRanges = document.querySelectorAll( '#effectsPanel input[type=range][data-fx]');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  // Removed transform controls
  const presetButtons = document.querySelectorAll('#effectsPanel .fx-preset');
  const valueSpans = document.querySelectorAll('#effectsPanel [data-fx-val]');
  const COLOR_MATRIX_NODE = document.getElementById('playerColorMatrixValues');
  // Sidebar collapse persistence
  const LS_KEY_SIDEBAR = 'mediaPlayer:sidebarCollapsed';
  function applySidebarCollapsed(fromLoad = false) {
    if (!sidebar || !toggleBtn) return;
    const collapsed = localStorage.getItem(LS_KEY_SIDEBAR) === '1';
    sidebar.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    if (playerLayout) playerLayout.setAttribute('data-sidebar-collapsed', collapsed ? 'true' : 'false');
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    // Arrow glyph semantics: show chevron pointing toward where the sidebar will appear when expanded.
    // Using single angle characters for compactness.
    toggleBtn.textContent = collapsed ? '»' : '«';
    if (accordionRoot) accordionRoot.style.removeProperty('display');
    if (!fromLoad) {
      /* hook for future animation sync if needed */
    }
  }
  // If simplified layout removed sidebar entirely, still allow effects + drawer to function
  if (!sidebar || !toggleBtn) {
    // Initialize slim effects if present then exit early for collapse wiring
    try {
      loadState();
      renderValues();
    }
    catch (_) { }
    const infoToggle = document.getElementById('infoToggle');
    const infoDrawer = document.getElementById('infoDrawer');
    if (infoToggle && infoDrawer && !infoToggle._wired) {
      infoToggle._wired = true;
      infoToggle.addEventListener('click', () => {
        const open = infoDrawer.hasAttribute('hidden');
        if (open) {
          infoDrawer.removeAttribute('hidden');
          infoToggle.setAttribute('aria-expanded', 'true');
        }
        else {
          infoDrawer.setAttribute('hidden', '');
          infoToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
    return;
  }
  // Auto-collapse on first load for narrower viewports (no stored preference)
  try {
    if (!getLocalStorageItem(LS_KEY_SIDEBAR) && window.innerWidth < 1500) {
      setLocalStorageItem(LS_KEY_SIDEBAR, '1');
    }
  }
  catch (_) { }
  applySidebarCollapsed(true);
  if (toggleBtn && !toggleBtn._wired) {
    toggleBtn._wired = true;
    toggleBtn.addEventListener('click', () => toggleSidebar());
  }
  const LS_KEY_EFFECTS = 'mediaPlayer:effects';
  const state = {r: 1, g: 1, b: 1, blur: 0};
  function loadState() {
    try {
      const saved = JSON.parse(getLocalStorageItem(LS_KEY_EFFECTS) || '{}');
      if (saved && typeof saved === 'object') {
        // Only apply known keys;
        // ignore corruption
        ['r', 'g', 'b', 'blur'].forEach((k) => {
          if (k in saved && typeof saved[k] === 'number') state[k] = saved[k];
        });
      }
    }
    catch (_) { }
    // apply to inputs
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) r.value = state[k];
    });
    applyEffects();
  }
  function saveState() {
    try {
      setLocalStorageItem(LS_KEY_EFFECTS, JSON.stringify(state));
    }
    catch (_) { }
  }
  function applyEffects() {
    if (!stage) return;
    if (COLOR_MATRIX_NODE) {
      const {r, g, b} = state;
      const matrix = [
        r, 0, 0, 0, 0,
        0, g, 0, 0, 0,
        0, 0, b, 0, 0,
        0, 0, 0, 1, 0,
      ].join(' ');
      COLOR_MATRIX_NODE.setAttribute('values', matrix);
    }
    const blurStr = state.blur > 0 ? ` blur(${state.blur}px)` : '';
    stage.style.filter = `url(#playerColorMatrix)${blurStr}`.trim();
    stage.style.transform = '';
  }
  function onSlider(e) {
    const el = e.target;
    const k = el.dataset.fx;
    if (!k) return;
    const v = parseFloat(el.value);
    state[k] = isFinite(v) ? v : state[k];
    applyEffects();
    saveState();
    renderValues();
  }
  function resetFilters() {
    state.r = 1;
    state.g = 1;
    state.b = 1;
    state.blur = 0;
    // Reflect defaults into inputs if present
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) r.value = state[k];
    });
    applyEffects();
    saveState();
  }
  // On each save, if values are default set remove from storage to avoid stale persistence overriding reset on reload
  // (merged into earlier saveState definition)
  function renderValues() {
    valueSpans.forEach((sp) => {
      const k = sp.getAttribute('data-fx-val');
      if (!(k in state)) return;
      let val = state[k];
      let txt;
      if (['r', 'g', 'b'].includes(k)) txt = val.toFixed(2);
      else txt = String(val);
      sp.textContent = txt;
    });
  }
  function applyPreset(name) {
    switch (name) {
      case 'cinematic':
      state.r = 1.05;
      state.g = 1.02;
      state.b = 0.96;
      state.blur = 0;
      break;
      case 'warm':
      state.r = 1.15;
      state.g = 1.05;
      state.b = 0.9;
      state.blur = 0;
      break;
      case 'cool':
      state.r = 0.92;
      state.g = 1.02;
      state.b = 1.12;
      state.blur = 0;
      break;
      case 'dreamy':
      state.r = 1.05;
      state.g = 1.05;
      state.b = 1.05;
      state.blur = 4;
      break;
      case 'flat':
      default:
      state.r = 1;
      state.g = 1;
      state.b = 1;
      state.blur = 0;
      break;
    }
    applyEffects();
    // reflect state into inputs without relying on external helper
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) r.value = state[k];
    });
    renderValues();
    saveState();
  }
    function toggleSidebar() {
      if (!sidebar || !toggleBtn) return;
      const collapsed = sidebar.getAttribute('data-collapsed') === 'true';
      const next = !collapsed;
      try {
        setLocalStorageItem(LS_KEY_SIDEBAR, next ? '1' : '0');
      }
      catch (_) { }
      applySidebarCollapsed();
    }
    // Wire events
    // Key shortcut: Shift+S toggles sidebar
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'S' || e.key === 's')) toggleSidebar();
    });
    filterRanges.forEach((r) => r.addEventListener('input', onSlider));
    if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetFilters);
    // removed transform reset binding
    presetButtons.forEach((pb) => pb.addEventListener('click', () => applyPreset(pb.dataset.preset)),
  );
  // (Removed duplicate Shift+S listener)
  loadState();
  renderValues();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayerEnhancements, {
    once: true,
  });
}
else {
  initPlayerEnhancements();
}
// Simplified player drawer wiring (independent of legacy sidebar)
function wireSimplePlayerDrawer() {
  const infoToggle = document.getElementById('infoToggle');
  const infoDrawer = document.getElementById('infoDrawer');
  if (!infoToggle || !infoDrawer || infoToggle._wired) return;
  infoToggle._wired = true;
  function toggle() {
    const isHidden = infoDrawer.hasAttribute('hidden');
    if (isHidden) {
      infoDrawer.removeAttribute('hidden');
      infoToggle.setAttribute('aria-expanded', 'true');
      infoToggle.classList.add('active');
    }
    else {
      infoDrawer.setAttribute('hidden', '');
      infoToggle.setAttribute('aria-expanded', 'false');
      infoToggle.classList.remove('active');
    }
  }
  infoToggle.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Avoid interfering with inputs
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      toggle();
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireSimplePlayerDrawer, {
    once: true,
  });
}
else {
  wireSimplePlayerDrawer();
}
// -----------------------------
// Performers Module
// -----------------------------
const Performers = (() => {
  let gridEl;
  let searchEl;
  let countEl;
  let addBtn;
  let importBtn;
  let importImagesBtn;
  let mergeBtn;
  let renameBtn;
  let deleteBtn;
  let autoMatchBtn;
  let dropZone;
  let statusEl;
  let spinnerEl;
  let performers = [];
  let selected = new Set();
  let searchTerm = '';
  // Sort state (default: by count desc)
  let sortBy = 'count'; // 'count' | 'name'
  // sortDir UI flag (mapping to server order happens in fetch):
  // We treat sortDir === 1 as the default for count (meaning server 'desc'), and -1 for asc.
  let sortDir = 1;
  // Pagination state
  let page = 1;
  let pageSize = 32;
  // Server pagination meta (set after fetch)
  let srvTotal = 0;
  let srvTotalPages = 1;
  let srvPage = 1;
  // Server debug snapshot (fast_mode, scan status, etc.)
  let lastDebug = null;
  // Polling timer while a background scan is in progress
  let scanPollTimer = null;
  // Force a server refresh on first load (and after mutations) so cache reflects latest tags
  let needRefresh = true;
  // selection navigation helpers (parity with performers)
  let lastFocusedIndex = -1;
  let shiftAnchor = null;
  let tagsSpinnerEl = null;
  let pager = null;
  let prevBtn = null;
  let nextBtn = null;
  let pageInfo = null;
  let pageSizeSel = null;
  // Bottom pager mirrors
  let pagerB = null;
  let prevBtnB = null;
  let nextBtnB = null;
  let pageInfoB = null;
  let pageSizeSelB = null;
  // Browser face-detection cache (per image URL) to avoid repeated work
  const faceBoxCache = new Map(); // url -> [x,y,w,h]
  const FaceDetectSupported = (typeof window !== 'undefined' && 'FaceDetector' in window && typeof window.FaceDetector === 'function');

  // Lazy loader for TensorFlow.js + BlazeFace (only if FaceDetector is unavailable or returns no faces).
  // Previous implementation allowed multiple concurrent loads (race) causing repeated dynamic imports
  // when several images triggered fallback simultaneously. We now guard with a cached Promise so at most
  // one load occurs. On failure, we clear the promise to allow retry.
  let __blazeFaceModel = null;            // resolved model instance (once loaded)
  let __blazeFaceModelPromise = null;     // in-flight promise (guards concurrent calls)
  async function loadBlazeFaceModel() {
    if (__blazeFaceModel) return __blazeFaceModel;          // fast path after successful load
    if (__blazeFaceModelPromise) return __blazeFaceModelPromise; // reuse in-flight promise
    // Create guarded promise
    __blazeFaceModelPromise = (async () => {
      try {
        // Dynamically import tfjs and blazeface via ESM CDN. Pin versions for stability.
        if (!window.tf) {
          await import('https://esm.sh/@tensorflow/tfjs@4.14.0');
        }
        const blazeface = await import('https://esm.sh/@tensorflow-models/blazeface@0.0.7');
        const model = await blazeface.load();
        // Optional light warm-up: run a dummy inference to JIT kernels (tiny 4x4 canvas)
        try {
          const warm = document.createElement('canvas');
          warm.width = 4; warm.height = 4; const c2 = warm.getContext('2d');
          if (c2) c2.fillRect(0,0,4,4);
          await model.estimateFaces(warm, false);
        } catch(_) { /* ignore warm-up errors */ }
        __blazeFaceModel = model;
        try { console.info('[FaceBox] BlazeFace model loaded (singleton)'); } catch(_) {}
        return __blazeFaceModel;
      }
      catch (e) {
        // Clear promise so subsequent attempts can retry
        __blazeFaceModelPromise = null;
        try { console.warn('[FaceBox] Failed to load TFJS/BlazeFace', e); } catch(_) {}
        return null;
      }
    })();
    return __blazeFaceModelPromise;
  }

  // Pixel-based square + padding helper (mirrors backend _square_pad_face_box_px)
  // MediaPipe-style framing rationale:
  // - side = max(w,h) ensures smallest encompassing square around raw detector box.
  // - pad (default 0.35) expands the square uniformly: sidePadded = side * (1 + 2*pad)
  //   giving ~70% growth and capturing forehead/chin context similar to MediaPipe demo.
  // - biasUp (default 0.10) shifts the square upward so eyes sit slightly below center;
  //   this yields more natural avatar crops (less empty space under chin).
  // - Result is clamped fully within image bounds then normalized to [0,1].
  // Tuning guidance:
  //   * Reduce pad (<0.25) for tighter thumbnails (risk: forehead cut off).
  //   * Increase pad (>0.45) to include shoulders (risk: reduced facial emphasis).
  //   * Adjust biasUp to 0 for symmetric framing; >0.15 often over-lifts on short foreheads.
  function squarePadFaceBoxPx(x, y, w, h, W, H, pad = 0.35, biasUp = 0.10) {
    x = Math.max(0, Math.min(W - 1, x));
    y = Math.max(0, Math.min(H - 1, y));
    w = Math.max(1, Math.min(W - x, w));
    h = Math.max(1, Math.min(H - y, h));
    const side = Math.max(w, h);
    let sidePadded = side * (1 + pad * 2);
    if (sidePadded > W) sidePadded = W;
    if (sidePadded > H) sidePadded = H;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    let sx = cx - sidePadded * 0.5;
    let sy = cy - sidePadded * 0.5 - (biasUp * sidePadded);
    if (sx < 0) sx = 0; if (sy < 0) sy = 0;
    if (sx + sidePadded > W) sx = Math.max(0, W - sidePadded);
    if (sy + sidePadded > H) sy = Math.max(0, H - sidePadded);
    let nx = sx / W;
    let ny = sy / H;
    let nw = sidePadded / W;
    let nh = sidePadded / H;
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    nw = Math.max(0, Math.min(1, nw));
    nh = Math.max(0, Math.min(1, nh));
    return [nx, ny, nw, nh];
  }

  async function detectFaceBoxWithTF(canvas, W, H) {
    try {
      const model = await loadBlazeFaceModel();
      if (!model) return null;
      const preds = await model.estimateFaces(canvas, false);
      let best = null, bestA = -1;
      for (const p of preds || []) {
        const tl = p.topLeft || [0,0];
        const br = p.bottomRight || [0,0];
        const x = Math.max(0, Math.floor(tl[0]));
        const y = Math.max(0, Math.floor(tl[1]));
        const w = Math.max(0, Math.floor((br[0] - tl[0])));
        const h = Math.max(0, Math.floor((br[1] - tl[1])));
        if (w <= 1 || h <= 1) continue;
        const area = w * h;
        if (area > bestA) { bestA = area; best = [x, y, w, h]; }
      }
      if (!best) {
        if (faceDebugEnabled()) { try { console.info('[FaceBox][TFJS] no face predictions'); } catch(_) {} }
        return null;
      }
      const [x, y, w, h] = best;
      const box = squarePadFaceBoxPx(x, y, w, h, W, H); // returns normalized square padded box
      if (faceDebugEnabled()) {
        try { console.info('[FaceBox][TFJS] raw px=['+x+','+y+','+w+','+h+'] final norm=['+box.map(v=>v.toFixed(3)).join(',')+']'); } catch(_) {}
      }
      return box;
    } catch (e) {
      if (faceDebugEnabled()) { try { console.warn('[FaceBox][TFJS] error', e); } catch(_) {} }
      return null;
    }
  }

  function faceDebugEnabled() {
    try {
      // Enable via localStorage 'mediaPlayer:faceDebug' or ?faceDebug=1
      const ls = localStorage.getItem('mediaPlayer:faceDebug');
      if (ls === '1' || ls === 'true') return true;
      if (typeof window !== 'undefined' && window.location && window.location.search.includes('faceDebug=1')) return true;
    }
    catch(_) { }
    return false;
  }

  async function detectFaceBoxForImage(url) {
    try {
      if (!url) return null;
      if (faceBoxCache.has(url)) return faceBoxCache.get(url);
      if (faceDebugEnabled()) {
        try {
          console.info('[FaceBox] start url='+url);
        }
        catch(_) { }
      }
      // Load image
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = (e) => reject(e);
        im.src = url;
      });
      const W = Math.max(1, img.naturalWidth || img.width || 0);
      const H = Math.max(1, img.naturalHeight || img.height || 0);
      if (faceDebugEnabled()) {
        try {
          console.info('[FaceBox] loaded image dims', W, H);
        }
        catch(_) { }
      }
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) {
        if (faceDebugEnabled()) {
          try {
            console.warn('[FaceBox] 2d context unavailable');
          }
          catch(_) { }
        }
        return null;
      }
      ctx.drawImage(img, 0, 0, W, H);
      let box = null;
      // Native detector first if supported
      if (FaceDetectSupported) {
        try {
          const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          const dets = await detector.detect(canvas);
          if (faceDebugEnabled()) {
            try {
              console.info('[FaceBox][Native] detections='+(dets?dets.length:0));
            }
            catch(_) { }
          }
          let best = null; let bestA = -1;
          for (const d of dets || []) {
            const bb = d && d.boundingBox ? d.boundingBox : null;
            if (!bb) continue;
            const x = Math.max(0, Math.floor(bb.x || 0));
            const y = Math.max(0, Math.floor(bb.y || 0));
            const w = Math.max(0, Math.floor(bb.width || 0));
            const h = Math.max(0, Math.floor(bb.height || 0));
            if (w <= 1 || h <= 1) continue;
            const area = w * h;
            if (area > bestA) {
              bestA = area; best = [x, y, w, h];
            }
          }
          if (best) {
            const [x, y, w, h] = best;
            box = squarePadFaceBoxPx(x, y, w, h, W, H); // normalized square padded
            if (faceDebugEnabled()) {
              try { console.info('[FaceBox][Native] chosen px=['+x+','+y+','+w+','+h+'] norm=['+box.map(v=>v.toFixed(3)).join(',')+']'); }
              catch(_) {}
            }
          }
          else {
            if (faceDebugEnabled()) {
              try {
                console.info('[FaceBox][Native] no usable detections, will fallback');
              }
              catch(_) { }
            }
          }
        }
        catch (e) {
          if (faceDebugEnabled()) {
            try {
              console.warn('[FaceBox][Native] error, fallback to TFJS', e);
            }
            catch(_) { }
          }
        }
      }
      else {
        if (faceDebugEnabled()) {
          try {
            console.info('[FaceBox] FaceDetector unsupported; using TFJS fallback');
          }
          catch(_) { }
        }
      }
      // TFJS fallback if needed
      if (!box) {
        box = await detectFaceBoxWithTF(canvas, W, H);
      }
      if (!box) {
        faceBoxCache.set(url, null);
        if (faceDebugEnabled()) {
          try {
            console.info('[FaceBox] no face detected');
          }
          catch(_) { }
        }
        return null;
      }
      faceBoxCache.set(url, box);
      if (faceDebugEnabled()) {
        try {
          console.info('[FaceBox] final norm box', box);
        }
        catch(_) { }
      }
      return box;
    }
    catch (e) {
      if (faceDebugEnabled()) {
        try {
          console.warn('[FaceBox] error', e);
        }
        catch(_) { }
      }
      return null;
    }
  }
  // Debounced search trigger (shared helper)
  let searchTimer = null; // retained only if we decide to cancel externally (not used now)
  // Face Box Modal elements (lazy lookup)
  let fbModal = null, fbImg = null, fbOverlay = null, fbTitle = null, fbClose = null, fbUpload = null;
  function ensureFaceBoxModalEls() {
    if (fbModal) return true;
    fbModal = document.getElementById('faceBoxModal');
    if (!fbModal) return false;
    fbImg = document.getElementById('faceBoxImg');
    fbOverlay = document.getElementById('faceBoxOverlay');
    fbTitle = document.getElementById('faceBoxTitle');
    fbClose = document.getElementById('faceBoxClose');
    fbUpload = document.getElementById('faceBoxUploadBtn');
    if (fbClose) fbClose.addEventListener('click', () => { try { fbModal.hidden = true; } catch(_){} });
    return true;
  }

  async function openFaceBoxModal({ performer, imgUrl }) {
    if (!ensureFaceBoxModalEls()) return;
    try { fbModal.hidden = false; } catch(_){}
    if (fbTitle) fbTitle.textContent = performer && performer.name ? `${performer.name} — Image (Drag box to adjust)` : 'Image Preview';
    // Render external links
    try {
      const linksEl = document.getElementById('faceBoxLinks');
      if (linksEl && performer) {
        const slug = encodeURIComponent(String(performer.slug || performer.name || ''));
        const links = [
          { label: 'gaymaletube', href: `https://www.gaymaletube.com/pornstar/${slug}` },
          { label: 'boyfriendtv', href: `https://www.boyfriendtv.com/pornstars/?modelsearchSubmitCheck=FORM_SENDED&key=models&mode=model-search&q=${slug}&submitModelSearch=Search` },
          { label: 'xhamster', href: `https://xhamster.com/gay/pornstars/${slug}` },
        ];
        linksEl.innerHTML = links.map(l => `<a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join(' ');
        linksEl.classList.remove('hidden');
      }
    } catch(_) {}
    if (fbImg) {
      fbImg.src = imgUrl || '';
      fbImg.onload = async () => {
        // Decide on a box: prefer server, else client cache/detect
        let fb = null;
        try {
          if (Array.isArray(performer.image_face_box) && performer.image_face_box.length === 4) {
            fb = performer.image_face_box.map(Number);
          } else if (fbOverlay && fbOverlay.dataset && fbOverlay.dataset.box) {
            const parts = String(fbOverlay.dataset.box).split(',').map(Number);
            if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) fb = parts;
          } else if (imgUrl) {
            fb = await detectFaceBoxForImage(imgUrl);
          }
        } catch(_) {}
        if (!fbOverlay) return;
        const W = fbImg.clientWidth || fbImg.naturalWidth || 0;
        const H = fbImg.clientHeight || fbImg.naturalHeight || 0;
        if (Array.isArray(fb) && fb.length === 4 && W > 0 && H > 0) {
          // Ensure box is square+padded with slight upward bias for head coverage
          let [nx, ny, nw, nh] = fb.map(Number);
          if (Math.abs(nw - nh) > 1e-6 || Math.max(nw, nh) < 0.5) {
            ({ nx, ny, nw, nh } = (function squarePad(nx0, ny0, nw0, nh0) {
              let cx = nx0 + nw0 * 0.5; let cy = ny0 + nh0 * 0.5;
              let side = Math.max(nw0, nh0);
              const pad = 0.35; const biasUp = 0.10;
              let sidePadded = side * (1 + pad * 2);
              sidePadded = Math.max(0, Math.min(1, sidePadded));
              let sx = cx - sidePadded * 0.5;
              let sy = cy - sidePadded * 0.5 - (biasUp * sidePadded);
              if (sx < 0) sx = 0; if (sy < 0) sy = 0;
              if (sx + sidePadded > 1) sx = Math.max(0, 1 - sidePadded);
              if (sy + sidePadded > 1) sy = Math.max(0, 1 - sidePadded);
              return { nx: sx, ny: sy, nw: sidePadded, nh: sidePadded };
            })(nx, ny, nw, nh));
          }
          const x = Math.max(0, Math.round(nx * W));
          const y = Math.max(0, Math.round(ny * H));
          const w = Math.max(1, Math.round(nw * W));
          const h = Math.max(1, Math.round(nh * H));
          fbOverlay.style.left = x + 'px';
          fbOverlay.style.top = y + 'px';
          fbOverlay.style.width = w + 'px';
          fbOverlay.style.height = h + 'px';
          fbOverlay.hidden = false;
          try { fbOverlay.dataset.box = fb.join(','); } catch(_){}
          // Enable manual drag/resize (square locked)
          enableFaceBoxEditing({ performer, imgEl: fbImg, overlayEl: fbOverlay, W, H });
          const saveBtn = document.getElementById('faceBoxSaveBtn');
          if (saveBtn) saveBtn.disabled = false;
          // Auto-persist if server had no box yet or differs significantly from detected
          try {
            const had = Array.isArray(performer.image_face_box) && performer.image_face_box.length === 4 ? performer.image_face_box.map(Number) : null;
            const diff = !had || Math.abs(had[0]-nx) > 0.02 || Math.abs(had[1]-ny) > 0.02 || Math.abs(had[2]-nw) > 0.02 || Math.abs(had[3]-nh) > 0.02;
            if (diff) {
              const payload = { x: nx, y: ny, w: nw, h: nh };
              const url = new URL('/api/performers/face-box', window.location.origin);
              url.searchParams.set('slug', performer.slug || performer.name || '');
              try {
                const resp = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (resp && resp.ok) {
                  performer.image_face_box = [nx, ny, nw, nh];
                  try { updatePerformerAvatars(performer); } catch(_) {}
                }
              } catch(_) { /* ignore autosave errors */ }
            }
          } catch(_) {}
        } else {
          fbOverlay.hidden = true;
        }
      };
    }
    if (fbUpload) {
      fbUpload.onclick = () => {
        const fi = document.getElementById('performerSingleImageInput');
        if (!fi) return;
        if (performer) {
          fi.dataset.slug = performer.slug || '';
          fi.dataset.name = performer.name || '';
        }
        try { fi.click(); } catch(_){}
      };
    }
  }
  // Manual face box editing
  function enableFaceBoxEditing({ performer, imgEl, overlayEl, W, H }) {
    if (!overlayEl || !imgEl || !performer) return;
    // Allow re-wiring for different performer or reopen
    if (overlayEl._editingSlug === performer.slug) {
      return; // already wired for this performer
    }
    overlayEl._editingSlug = performer.slug;
    let dragState = null;
    const handle = overlayEl.querySelector('.handle');
    function currentNormBox() {
      const r = overlayEl.getBoundingClientRect();
      const imgR = imgEl.getBoundingClientRect();
      const ox = r.left - imgR.left;
      const oy = r.top - imgR.top;
      const w = r.width; const h = r.height;
      const iW = Math.max(1, imgEl.clientWidth || imgR.width || 1);
      const iH = Math.max(1, imgEl.clientHeight || imgR.height || 1);
      const nx = Math.max(0, Math.min(1, ox / iW));
      const ny = Math.max(0, Math.min(1, oy / iH));
      const side = Math.max(w, h);
      const nw = Math.max(1, side) / iW; // square box normalized to image width
      const nh = Math.max(1, side) / iH; // and height separately
      return [nx, ny, nw, nh];
    }
    function startDrag(e, mode) {
      e.preventDefault();
      const box = overlayEl.getBoundingClientRect();
      const imgBox = imgEl.getBoundingClientRect();
      dragState = {
        mode,
        sx: box.left,
        sy: box.top,
        sw: box.width,
        sh: box.height,
        mx: e.clientX,
        my: e.clientY,
        imgX: imgBox.left,
        imgY: imgBox.top,
        imgW: imgBox.width,
        imgH: imgBox.height,
      };
      overlayEl.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', endDrag);
    }
    function onMove(e) {
      if (!dragState) return;
      const dx = e.clientX - dragState.mx;
      const dy = e.clientY - dragState.my;
      let changed = false;
      if (dragState.mode === 'move') {
        let nx = dragState.sx + dx - dragState.imgX;
        let ny = dragState.sy + dy - dragState.imgY;
        // Clamp
        nx = Math.max(0, Math.min(dragState.imgW - dragState.sw, nx));
        ny = Math.max(0, Math.min(dragState.imgH - dragState.sh, ny));
        overlayEl.style.left = nx + 'px';
        overlayEl.style.top = ny + 'px';
        changed = true;
      } else if (dragState.mode === 'resize') {
        let side = Math.max(20, Math.min(dragState.imgW, dragState.sw + Math.max(dx, dy)));
        if (dragState.sx - dragState.imgX + side > dragState.imgW) side = dragState.imgW - (dragState.sx - dragState.imgX);
        if (dragState.sy - dragState.imgY + side > dragState.imgH) side = dragState.imgH - (dragState.sy - dragState.imgY);
        overlayEl.style.width = side + 'px';
        overlayEl.style.height = side + 'px';
        changed = true;
      }
      if (changed) scheduleAutoSave();
    }
    function endDrag() {
      if (!dragState) return;
      dragState = null;
      overlayEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', endDrag);
    }
    overlayEl.addEventListener('mousedown', (e) => {
      if (e.target === handle) return; // handle has its own
      startDrag(e, 'move');
    });
    if (handle) {
      handle.addEventListener('mousedown', (e) => startDrag(e, 'resize'));
    }
    const saveBtn = document.getElementById('faceBoxSaveBtn');
    if (saveBtn) {
      // Remove prior handler (clone trick) to avoid stacking
      if (!saveBtn._wired) {
        saveBtn.addEventListener('click', async () => {
          const [nx, ny, nw, nh] = currentNormBox();
          try {
            const payload = { x: nx, y: ny, w: nw, h: nh };
            const url = new URL('/api/performers/face-box', window.location.origin);
            url.searchParams.set('slug', performer.slug || performer.name || '');
            const r = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            (window.showToast||notify)('Face box saved', 'success');
            performer.image_face_box = [nx, ny, nw, nh];
            // Apply to any existing avatar tiles in-place
            try { updatePerformerAvatars(performer); } catch(_) {}
          } catch(e) {
            notify('Failed to save face box: ' + (e && e.message ? e.message : 'error'), 'error');
          }
        });
        saveBtn._wired = true;
      }
    }
    // Debounced autosave as user drags/resizes
    let autoSaveTimer = null;
    function scheduleAutoSave() {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        const [nx, ny, nw, nh] = currentNormBox();
        try {
          const payload = { x: nx, y: ny, w: nw, h: nh };
          const url = new URL('/api/performers/face-box', window.location.origin);
          url.searchParams.set('slug', performer.slug || performer.name || '');
          const r = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!r.ok) return;
          performer.image_face_box = [nx, ny, nw, nh];
          try { updatePerformerAvatars(performer); } catch(_) {}
        } catch(_) {}
      }, 600);
    }
  }
  function updatePerformerAvatars(performer) {
    if (!performer || !performer.image_face_box) return;
    const box = performer.image_face_box;
    // Target by slug first for reliability
    let targets = [];
    if (performer.slug) {
      try { targets = Array.from(document.querySelectorAll(`.perf-card[data-slug="${CSS.escape(String(performer.slug))}"]`)); } catch(_) {}
    }
    if (!targets.length) {
      const all = document.querySelectorAll('.perf-card');
      for (const c of all) {
        try {
          const nameEl = c.querySelector('h3 a, h3');
          const nm = nameEl ? nameEl.textContent.trim() : '';
          if (nm && nm.toLowerCase() === String(performer.name||'').toLowerCase()) targets.push(c);
        } catch(_) {}
      }
    }
    for (const c of targets) {
      try {
        const avatarEl = c.querySelector('.pc-avatar');
        if (!avatarEl) continue;
        const [fx, fy, fw, fh] = box;
        const cx = fx + fw/2; const cy = fy + fh/2;
        const px = Math.round(cx * 100); const py = Math.round(cy * 100);
        avatarEl.style.backgroundPosition = `${px}% ${py}%`;
        const TARGET_FRAC = 0.6;
        const safeFw = Math.max(0.05, Math.min(1, fw));
        const scaleW = Math.max(100, Math.round((TARGET_FRAC / safeFw) * 100));
        avatarEl.style.backgroundSize = `${scaleW}% auto`;
        avatarEl.dataset.faceBox = box.join(',');
      } catch(_) {}
    }
  }
  function initDom() {
    if (gridEl) return;
    try { console.log('[Performers:initDom]'); }
    catch(_) { }
    gridEl = document.getElementById('performersGrid');
    searchEl = document.getElementById('performerSearch');
    countEl = document.getElementById('performersCount');
    addBtn = document.getElementById('performerAddBtn');
    // Unified import controls
    const unifiedBtn = document.getElementById('performerUnifiedImportBtn');
    const unifiedFileInput = document.getElementById('performerUnifiedFileInput');
    const unifiedFolderInput = document.getElementById('performerUnifiedFolderInput');
    mergeBtn = document.getElementById('performerMergeBtn');
    renameBtn = document.getElementById('performerRenameBtn');
    deleteBtn = document.getElementById('performerDeleteBtn');
    autoMatchBtn = document.getElementById('performerAutoMatchBtn');
    dropZone = document.getElementById('performerDropZone');
    statusEl = document.getElementById('performersStatus');
    spinnerEl = document.getElementById('performersSpinner');
    pager = document.getElementById('performersPager');
    prevBtn = document.getElementById('perfPrev');
    nextBtn = document.getElementById('perfNext');
    pageInfo = document.getElementById('perfPageInfo');
    pageSizeSel = document.getElementById('perfPageSize');
    // Bottom pager
    pagerB = document.getElementById('performersPagerBottom');
    prevBtnB = document.getElementById('perfPrevBottom');
    nextBtnB = document.getElementById('perfNextBottom');
    pageInfoB = document.getElementById('perfPageInfoBottom');
    pageSizeSelB = document.getElementById('perfPageSizeBottom');
    wireEvents();
    // Unified import wiring
    try {
      function summarizeAndToast(data, kind) {
        try {
          const d = data && data.data ? data.data : data;
          if (kind === 'names') {
            const msg = `Imported ${d.imported||0} performer(s)`;
            (window.showToast || notify)(msg, 'success');
          }
          else {
            const msg = `Images: updated ${d.updated||0}, created ${d.created||0}, skipped ${d.skipped||0}`;
            (window.showToast || notify)(msg, 'success');
          }
        }
        catch (_) {}
      }
      async function handleFiles(files) {
        if (!files || !files.length) return;
        // Heuristics: if any .zip → upload-zip; else if any image or any file has webkitRelativePath → upload files; else treat as names list
        const list = Array.from(files);
        const hasZip = list.some((f) => /\.zip$/i.test(f.name));
        const hasImage = list.some((f) => (f.type && f.type.startsWith('image/')) || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
        const hasDirHints = list.some((f) => !!(f.webkitRelativePath));
        // Simple UI busy helpers
        const unifiedBtn = document.getElementById('performerUnifiedImportBtn');
        function startProcessing(msg = 'Working…') {
          try { setStatus(msg, true); }
          catch(_) { }
          if (spinnerEl) spinnerEl.hidden = false;
          const prev = {
            disabled: unifiedBtn ? unifiedBtn.disabled : false,
            hadBusy: unifiedBtn ? unifiedBtn.classList.contains('btn-busy') : false,
          };
          if (unifiedBtn) {
            unifiedBtn.disabled = true;
            unifiedBtn.classList.add('btn-busy');
          }
          return () => {
            try { setStatus('', false); }
            catch(_) { }
            if (spinnerEl) spinnerEl.hidden = true;
            if (unifiedBtn) {
              unifiedBtn.disabled = prev.disabled;
              if (!prev.hadBusy) unifiedBtn.classList.remove('btn-busy');
            }
          };
        }
        async function streamZipImport(fd) {
          const stop = startProcessing('Importing images…');
          try {
            const res = await fetch('/api/performers/images/upload-zip?replace=false&create_missing=true&stream=1', { method: 'POST', body: fd });
            const ct = (res.headers && res.headers.get('content-type')) || '';
            // Fallback to JSON if server didn't stream
            if (!res.body || !/ndjson|x-ndjson|json-seq/i.test(ct)) {
              const j = await res.json();
              if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
              return j;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            let lastTotals = null;
            const debouncedRefresh = (typeof debounce === 'function') ? debounce(() => {
              try {
                Performers._background = true;
                if (typeof fetchPerformers === 'function') fetchPerformers();
              }
              catch(_) { }
              finally { Performers._background = false; }
            }, 800) : (() => {
              try {
                Performers._background = true;
                if (typeof fetchPerformers === 'function') fetchPerformers();
              }
              catch(_) { }
              finally { Performers._background = false; }
            });
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line) continue;
                try {
                  const evt = JSON.parse(line);
                  if (evt.event === 'saved') {
                    try { setStatus(`Saving images… ${evt.index}/${evt.file_count}`, true); }
                    catch(_) { }
                    debouncedRefresh();
                  }
                  else if (evt.event === 'done') {
                    lastTotals = evt;
                  }
                }
                catch (_) { /* ignore parse issues */ }
              }
            }
            if (buf.trim()) {
              try {
                const evt = JSON.parse(buf.trim());
                if (evt && evt.event === 'done') lastTotals = evt;
              }
              catch(_) { }
            }
            // Ensure a final refresh after stream completion
            try {
              Performers._background = true;
              if (typeof fetchPerformers === 'function') fetchPerformers();
            }
            catch(_) { }
            finally { Performers._background = false; }
            return { data: lastTotals || {} };
          } finally {
            stop();
          }
        }
        try {
          console.log('[Performers:handleFiles]', { count: list.length, hasZip, hasImage, hasDirHints, names: list.map(f=>f.name) });
          if (hasZip && list.length === 1) {
            const fd = new FormData();
            fd.append('zip', list[0], list[0].name);
            // Prefer streaming progress if supported
            const j = await streamZipImport(fd);
            summarizeAndToast(j, 'images');
            await fetchPerformers();
            // Optional client-side face box persistence if backend lacks OpenCV
            try { await persistMissingFaceBoxesClientSide(); } catch(_) {}
            return;
          }
          if (hasImage || hasDirHints) {
            const stop = startProcessing('Uploading images…');
            try {
              const fd = new FormData();
              for (const f of list) {
                const name = (f && (f.webkitRelativePath || f.name)) || f.name;
                fd.append('files', f, name);
              }
              const res = await fetch('/api/performers/images/upload?replace=false&create_missing=true', { method: 'POST', body: fd });
              const j = await res.json();
              if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
              summarizeAndToast(j, 'images');
              await fetchPerformers();
              try { await persistMissingFaceBoxesClientSide(); } catch(_) {}
              return;
            } finally {
              stop();
            }
          }
          // Fallback: treat as names (read all as text)
          let combined = '';
          for (const f of list) {
            try { combined += (await f.text()) + '\n'; }
            catch(_) { }
          }
          const txt = combined.trim();
          if (!txt) return;
          // Prefer text/plain; server accepts JSON array too
          const r = await fetch('/api/performers/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: txt });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
          summarizeAndToast(j, 'names');
          await fetchPerformers();
        }
        catch (err) {
          console.error('Unified import failed:', err);
          (window.showToast || notify)((err && err.message) || 'Import failed', 'error');
        }
      }
      // Expose unified handler so drag & drop code outside this closure can reuse it
      window.__perfUnifiedHandleFiles = handleFiles;
      if (unifiedBtn && !unifiedBtn._wired) {
        unifiedBtn._wired = true;
        unifiedBtn.addEventListener('click', (ev) => {
          // Offer quick choice: if user holds Option, pick folder; else pick files
          // Can't detect modifier reliably after click, so provide both flows: prefer file chooser
          try {
            const preferFolder = !!(ev && (ev.shiftKey || ev.altKey));
            if (preferFolder && unifiedFolderInput) unifiedFolderInput.click();
            else if (unifiedFileInput) unifiedFileInput.click();
          }
          catch (_) {}
        });
      }
      if (unifiedFileInput && !unifiedFileInput._wired) {
        unifiedFileInput._wired = true;
        unifiedFileInput.addEventListener('change', async () => {
          const files = Array.from(unifiedFileInput.files || []);
          await handleFiles(files);
          try { unifiedFileInput.value = ''; }
          catch(_) { }
        });
      }
      if (unifiedFolderInput && !unifiedFolderInput._wired) {
        unifiedFolderInput._wired = true;
        unifiedFolderInput.addEventListener('change', async () => {
          const files = Array.from(unifiedFolderInput.files || []);
          await handleFiles(files);
          try { unifiedFolderInput.value = ''; }
          catch(_) { }
        });
      }
      // Make drop zone click open unified chooser
      if (dropZone && !dropZone._clickUnified) {
        dropZone._clickUnified = true;
        const openChooser = (preferFolder = false) => {
          try {
            if (preferFolder && unifiedFolderInput) unifiedFolderInput.click();
            else if (unifiedFileInput) unifiedFileInput.click();
          }
          catch(_) { }
        };
        dropZone.addEventListener('click', () => openChooser(false));
        dropZone.addEventListener('dblclick', () => openChooser(true));
        dropZone.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChooser(false); }
        });
      }
    }
    catch (_) {}
  }
  function setStatus(msg, showFlag = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    if (showFlag) showAs(statusEl, 'block');
    else hide(statusEl);
    if (spinnerEl) spinnerEl.hidden = !showFlag;
  }
  function tpl(id) {
    const t = document.getElementById(id);
    return t ? t.content.cloneNode(true) : null;
  }
  function render() {
    if (!gridEl) return;
    const r0 = performance.now ? performance.now() : Date.now();
    try {
      const withImg = performers.filter(p => p && p.image).length;
      console.log('[Performers:render:start]', { performers: performers.length, withImg, selected: selected.size });
    }
    catch(_){ }
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    // Trust server-side filtering/sorting/pagination: render given page as-is
    const filtered = performers;
    const pageItems = performers;
    if (addBtn) {
      const termLower = searchTerm.toLowerCase();
      const exact = performers.some((p) => (p.name || '').toLowerCase() === termLower);
      if (searchTerm && !exact) showAs(addBtn, 'inline-block');
      else hide(addBtn);
      addBtn.textContent = `Add '${searchTerm}'`;
      addBtn.disabled = !searchTerm;
    }
    if (countEl) {
      const total = Number.isFinite(srvTotal) ? srvTotal : performers.length;
      const shown = pageItems.length;
      // Show total performers (server authoritative); include "showing" hint when paginated
      countEl.textContent = total ? `${total} performer${total === 1 ? '' : 's'}${srvTotalPages > 1 ? ` • showing ${shown}` : ''}` : '0 performers';
    }
    if (filtered.length === 0) {
      const node = tpl('emptyHintTemplate');
      if (node) {
        const el = node.querySelector('.empty-hint');
        if (el) {
          if (searchTerm) {
            el.textContent = `No performers match “${searchTerm}”.`;
            try {
              const btn = document.createElement('button');
              btn.className = 'btn-sm';
              btn.textContent = 'Clear search';
              btn.style.marginLeft = '10px';
              btn.addEventListener('click', () => {
                if (searchEl) searchEl.value = '';
                searchTerm = '';
                page = 1;
                fetchPerformers();
              });
              el.appendChild(btn);
            }
            catch(_) { }
          }
          else if (lastDebug && (lastDebug.scan_in_progress || lastDebug.scan_scheduled || (lastDebug.fast_mode && lastDebug.cache_stale))) {
            el.textContent = 'Scanning media for performers… results will appear shortly.';
            try { setStatus('Scanning performers…', true); }
            catch(_) { }
          }
          else {
            el.textContent = 'No performers found.';
          }
        }
        gridEl.appendChild(node);
      }
    }
    else {
      let loopStart = performance.now ? performance.now() : Date.now();
      pageItems.forEach((p, idx) => {
        const node = tpl('performerCardTemplate');
        if (!node) return;
        const card = node.querySelector('.perf-card');
        const sel = node.querySelector('.card-checkbox');
        const nameEl = node.querySelector('.pc-name');
        const avatarEl = node.querySelector('.pc-avatar');
        const countEl = node.querySelector('.pc-count');
        const uploadBtn = node.querySelector('.pc-upload');
        if (card) {
          const key = p.slug;
          card.dataset.slug = key;
          if (selected.has(key)) card.dataset.selected = '1';
          card.tabIndex = 0;
          if (sel) {
            // Mirror Scenes behavior: overlay div with role checkbox
            try {
              sel.setAttribute('role', 'checkbox');
              sel.setAttribute('tabindex', '0');
              sel.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
            }
            catch (_) {}
            if (selected.has(key)) sel.classList.add('checked');
            else sel.classList.remove('checked');
            sel.addEventListener('click', (ev) => {
              ev.stopPropagation();
              // Support range selection with Shift
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
          card.onclick = (e) => {
            // If multi-select modifier is held, keep selection behavior
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              handleCardClick(e, p, filtered);
              return;
            }
            // Single click: jump to Library and filter by this performer
            try {
              // Set filters
              libraryPerformerFilters = [p.name];
              // Persist filters for parity
              try {
                setLocalStorageJSON('filters.performers', libraryPerformerFilters);
              }
              catch (_) { }
              // Switch tab to Library
              const libTab = document.querySelector('[data-tab="library"]');
              if (libTab) libTab.click();
              // Update chips and reload
              if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
              if (typeof loadLibrary === 'function') loadLibrary();
              if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
            }
            catch (_) { }
          };
          card.onkeydown = (e) => handleCardKey(e, p, filtered);
        }
        if (nameEl) {
          // Make performer name a link to Library filtered by performer
          try {
            nameEl.textContent = '';
            const a = document.createElement('a');
            const href = new URL(window.location.pathname, window.location.origin);
            href.searchParams.set('performers', p.name);
            a.href = href.toString();
            a.textContent = p.name;
            a.addEventListener('click', (ev) => {
              ev.preventDefault();
              try {
                libraryPerformerFilters = [p.name];
                setLocalStorageJSON('filters.performers', libraryPerformerFilters);
              }
              catch (_) {}
              const libTab = document.querySelector('[data-tab="library"]');
              if (libTab) libTab.click();
              if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
              if (typeof loadLibrary === 'function') loadLibrary();
              if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
            });
            nameEl.appendChild(a);
          }
          catch (_) { nameEl.textContent = p.name; }
        }
        if (avatarEl) {
          avatarEl.title = p.name;
          try {
            if (p.image) {
              // Use encoded URL and quote it to handle spaces and special chars reliably
              const imgUrl = typeof p.image === 'string' ? encodeURI(p.image) : '';
              avatarEl.style.backgroundImage = `url("${imgUrl}")`;
              try { avatarEl.dataset.imgUrl = imgUrl; } catch(_){}
              // Default cover + center, then adjust if we have a face box
              avatarEl.style.backgroundSize = 'cover';
              avatarEl.style.backgroundPosition = 'center';
              try {
                const fb = p.image_face_box;
                if (Array.isArray(fb) && fb.length === 4) {
                    let [fx, fy, fw, fh] = fb.map(Number);
                    // If server box is not square or appears tight (<0.5 side), attempt pixel-true correction using image dims
                    if (Math.abs(fw - fh) > 1e-6 || Math.max(fw, fh) < 0.5) {
                      // Load image dims (likely cached) and compute pixel-based square box, then update positioning
                      (async () => {
                        try {
                          const dims = await new Promise((resolve) => {
                            const im = new Image();
                            im.onload = () => resolve({ W: im.naturalWidth || im.width || 0, H: im.naturalHeight || im.height || 0 });
                            im.onerror = () => resolve({ W: 0, H: 0 });
                            im.src = imgUrl;
                          });
                          const W = Math.max(1, dims.W || 0);
                          const H = Math.max(1, dims.H || 0);
                          if (W > 0 && H > 0 && avatarEl && !avatarEl.dataset.faceBoxUpgraded) {
                            const x = Math.max(0, Math.round(fx * W));
                            const y = Math.max(0, Math.round(fy * H));
                            const w = Math.max(1, Math.round(fw * W));
                            const h = Math.max(1, Math.round(fh * H));
                            const [nnx, nny, nnw, nnh] = squarePadFaceBoxPx(x, y, w, h, W, H);
                            fx = nnx; fy = nny; fw = nnw; fh = nnh;
                            try { avatarEl.dataset.faceBoxUpgraded = '1'; } catch(_){}
                          }
                        } catch(_) {}
                        // Recompute focus/zoom after potential upgrade
                        const cx = fx + fw / 2;
                        const cy = fy + fh / 2;
                        const px = Math.round(cx * 100);
                        const py = Math.round(cy * 100);
                        avatarEl.style.backgroundPosition = `${px}% ${py}%`;
                        const TARGET_FRAC = 0.6;
                        const safeFw = Math.max(0.05, Math.min(1, fw));
                        const scaleW = Math.max(100, Math.round((TARGET_FRAC / safeFw) * 100));
                        avatarEl.style.backgroundSize = `${scaleW}% auto`;
                        try { avatarEl.dataset.faceBox = [fx, fy, fw, fh].join(','); } catch(_){}
                      })();
                    }
                  // Compute a focus point at face center (for initial paint)
                  const cx = fx + fw / 2;
                  const cy = fy + fh / 2;
                  // Because we're using background-size: cover on a square avatar with an arbitrary image aspect,
                  // a simple center shift works reasonably: convert cx,cy (0..1) into %.
                  const px = Math.round(cx * 100);
                  const py = Math.round(cy * 100);
                  avatarEl.style.backgroundPosition = `${px}% ${py}%`;
                  // Zoom so the face box roughly fills a target fraction of the avatar width
                  const TARGET_FRAC = 0.6; // face spans ~60% of avatar width
                  const safeFw = Math.max(0.05, Math.min(1, fw));
                  const scaleW = Math.max(100, Math.round((TARGET_FRAC / safeFw) * 100));
                  avatarEl.style.backgroundSize = `${scaleW}% auto`;
                  // Optionally, if face is small, we could zoom in slightly by switching to contain + scale.
                  // For now keep 'cover' to avoid letterboxing; future: adjust backgroundSize based on fw,fh.
                  avatarEl.dataset.faceBox = fb.join(',');
                }
                else if (!fb) {
                  // Attempt client-side detection only if no server box present
                  (async () => {
                    const box = await detectFaceBoxForImage(imgUrl);
                    if (box && avatarEl && !avatarEl.dataset.faceBox) {
                      const [fx, fy, fw, fh] = box;
                      const cx = fx + fw / 2; const cy = fy + fh / 2;
                      const px = Math.round(cx * 100); const py = Math.round(cy * 100);
                      avatarEl.style.backgroundPosition = `${px}% ${py}%`;
                      const TARGET_FRAC = 0.6;
                      const safeFw = Math.max(0.05, Math.min(1, fw));
                      const scaleW = Math.max(100, Math.round((TARGET_FRAC / safeFw) * 100));
                      avatarEl.style.backgroundSize = `${scaleW}% auto`;
                      avatarEl.dataset.faceBox = box.join(',');
                    }
                  })();
                }
              }
              catch(_e) {}
              avatarEl.classList.add('has-image');
            }
            else {
              avatarEl.style.removeProperty('background-image');
              avatarEl.classList.remove('has-image');
            }
          }
          catch (_) {}
          // Clicking the avatar triggers single-image upload for this performer
          avatarEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            // If shiftKey held: treat as upload action (legacy behavior)
            if (ev.shiftKey) {
              const fi = document.getElementById('performerSingleImageInput');
              if (fi) {
                fi.dataset.slug = p.slug;
                fi.dataset.name = p.name;
                try { fi.click(); } catch(_) {}
              }
              return;
            }
            // Otherwise open face box preview modal
            const url = (avatarEl && avatarEl.dataset && avatarEl.dataset.imgUrl)
              ? avatarEl.dataset.imgUrl
              : (typeof p.image === 'string' ? encodeURI(p.image) : '');
            openFaceBoxModal({ performer: p, imgUrl: url });
          });
          // Keyboard accessibility for avatar (Enter/Space)
          avatarEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              ev.stopPropagation();
              openFaceBoxModal({ performer: p, imgUrl: typeof p.image === 'string' ? encodeURI(p.image) : '' });
            }
          });
        }
        if (countEl) {
          const files = Number(p.count || 0);
          countEl.textContent = `${files}`;
          countEl.title = `${files} file${files === 1 ? '' : 's'}`;
        }
        // Legacy pc-upload button no longer present; avatar click handles uploads
        frag.appendChild(node);
        if ((idx + 1) % 16 === 0) {
          const now = performance.now ? performance.now() : Date.now();
          const batchMs = Math.round(now - loopStart);
          console.log('[Performers:render:batch]', { upTo: idx + 1, ms: batchMs });
          loopStart = now;
        }
      });
      gridEl.appendChild(frag);
      const r1 = performance.now ? performance.now() : Date.now();
      console.log('[Performers:render:append]', { items: pageItems.length, ms: Math.round(r1 - r0) });
    }
    // pager UI: use server meta exclusively
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
  updateSelectionUI();
  const r2 = performance.now ? performance.now() : Date.now();
  console.log('[Performers:render:done]', { totalMs: Math.round(r2 - r0) });
    // Ensure performers grid loads on page load (idempotent)
    if (!window.__perfAutoFetched) {
      window.__perfAutoFetched = true;
      window.addEventListener('DOMContentLoaded', () => {
        if (window.fetchPerformers) window.fetchPerformers();
      }, {once: true});
    }
  }
  function updateSelectionUI() {
    document.querySelectorAll('.perf-card').forEach((c) => {
      const key = c.dataset.slug;
      if (selected.has(key)) c.dataset.selected = '1';
      else c.removeAttribute('data-selected');
      const cb = c.querySelector && c.querySelector('.card-checkbox');
      if (cb) {
        try {
          if (selected.has(key)) cb.classList.add('checked'); else cb.classList.remove('checked');
          cb.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
        }
        catch (_) {}
      }
    });
    const multi = selected.size >= 2;
    if (mergeBtn) mergeBtn.disabled = !multi;
    if (renameBtn) renameBtn.disabled = selected.size !== 1;
    if (deleteBtn) deleteBtn.disabled = selected.size === 0;
  }
  function ensureControlsVisible() {
    try {
      const toolbar = document.querySelector('#performers-panel .perf-toolbar');
      const unifiedBtn = document.getElementById('performerUnifiedImportBtn');
      const elts = [toolbar, unifiedBtn, mergeBtn, deleteBtn, autoMatchBtn, dropZone, statusEl];
      elts.forEach((el) => {
        if (!el) return;
        try {
          el.hidden = false;
        }
        catch (_) { }
        try {
          el.classList.remove('d-none');
        }
        catch (_) { }
      });
    } catch(_) {}
  }
  // Client-side fallback: persist face boxes for performers that have images but no box yet.
  async function persistMissingFaceBoxesClientSide() {
    if (typeof Performers === 'undefined' || !Array.isArray(Performers.list)) return;
    const toUpdate = [];
    for (const p of Performers.list) {
      try {
        if (!p || !p.image || Array.isArray(p.image_face_box)) continue;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = typeof p.image === 'string' ? p.image : '';
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const W = img.naturalWidth; const H = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // eslint-disable-next-line no-await-in-loop
        let box = await detectFaceBoxForImage(canvas.toDataURL());
        if (!box) {
          // eslint-disable-next-line no-await-in-loop
          box = await detectFaceBoxWithTF(canvas, W, H);
        }
        if (Array.isArray(box) && box.length === 4) {
          toUpdate.push({ slug: p.slug || p.name, x: box[0], y: box[1], w: box[2], h: box[3] });
        }
      } catch(_) {}
    }
    if (toUpdate.length) {
      try {
        await fetch('/api/performers/face-boxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxes: toUpdate }) });
        for (const u of toUpdate) {
          const p = Performers.list.find(pp => (pp.slug||pp.name) === u.slug);
          if (p) {
            p.image_face_box = [u.x, u.y, u.w, u.h];
            try { updatePerformerAvatars(p); } catch(_) {}
          }
        }
      } catch(_) {}
    }
  }
  async function fetchPerformers() {
    initDom();
    ensureControlsVisible();
    try {
      // Guard: if a fetch is already in-flight (and not aborted), skip to avoid cascading loops
      if (Performers._inFlight) {
        try { console.log('[Performers:fetch] skip (in-flight)'); }
        catch(_){ }
        return;
      }
      const t0 = performance.now ? performance.now() : Date.now();
      // Cancel any in-flight fetch to avoid race conditions and extra work
      Performers._abort && Performers._abort.abort();
      Performers._abort = new AbortController();
      const signal = Performers._abort.signal;
      Performers._inFlight = true;
      // fetchPerformers called
      if (!Performers._background) {
        setStatus('Loading…', true);
        if (gridEl) gridEl.classList.add('loading');
      }
      const url = new URL('/api/performers', window.location.origin);
      if (searchTerm) url.searchParams.set('search', searchTerm);
      // Server-side pagination & sorting
      url.searchParams.set('page', String(page || 1));
      url.searchParams.set('page_size', String(pageSize || 32));
      const sortSel = document.getElementById('performerSort');
      const sortVal = sortSel ? (sortSel.value === 'name' ? 'name' : 'count') : (sortBy || 'count');
      url.searchParams.set('sort', sortVal);
      // Only send explicit order override when deviating from backend defaults (name->asc, count->desc)
      {
        const defaultOrder = sortVal === 'name' ? 'asc' : 'desc';
        const requestedOrder = (sortDir === 1 ? 'desc' : 'asc');
        if (requestedOrder !== defaultOrder) {
          url.searchParams.set('order', requestedOrder);
        }
      }
      // Enable server debug timings
      url.searchParams.set('debug', '1');
      const rStart = performance.now ? performance.now() : Date.now();
      const r = await fetch(url, { signal });
      const rEnd = performance.now ? performance.now() : Date.now();
      const hdrLen = r.headers ? (r.headers.get('content-length') || null) : null;
      const jStart = performance.now ? performance.now() : Date.now();
      const j = await r.json();
      const jEnd = performance.now ? performance.now() : Date.now();
      // performers response loaded
  const d = j?.data || {};
  performers = d.performers || [];
  lastDebug = d.debug || (j && j.debug) || null;
      // Lightweight UI feedback about scan trigger & empty counts
      try {
        const trigger = lastDebug && lastDebug.scan_trigger;
        const allZero = performers.length > 0 && performers.every(p => !Number(p.count || 0));
        if (trigger === 'full' && !allZero) {
          setStatus('Performers index updated', false);
        }
        else if (trigger === 'full' && allZero) {
          // Clarify why counts are zero when a full scan just ran
          setStatus('No performer-file associations found yet (all counts 0)', true);
        }
        else if (trigger === 'skipped_recent' && allZero) {
          setStatus('Counts unchanged (recent scan); add performers to files to see usage)', true);
        }
      }
      catch(_) { /* ignore UI hint errors */ }
      const t1 = performance.now ? performance.now() : Date.now();
      // Dump server timings if provided
      if (lastDebug) {
        console.log('[Performers:serverTimings]', lastDebug);
      }
      console.log('[Performers:fetchPerformers]', {
        url: url.toString(),
        total: d.total,
        page: d.page,
        received: performers.length,
        status: r.status,
        contentLength: hdrLen,
        netMs: Math.round(rEnd - rStart),
        parseMs: Math.round(jEnd - jStart),
        totalMs: Math.round(t1 - t0)
      });
      // console.log(performers);
      // Update pagination from server meta if present
      const total = Number(d.total || 0);
      const totalPages = Number(d.total_pages || 1);
      const curPage = Number(d.page || page || 1);
      srvTotal = total;
      srvTotalPages = totalPages;
      srvPage = curPage;
      // Update UI counters using server values
      if (pageInfo) {
        pageInfo.textContent = total ? `Page ${curPage} / ${totalPages} • ${total} total` : '—';
      }
      if (pageInfoB) {
        pageInfoB.textContent = total ? `Page ${curPage} / ${totalPages} • ${total} total` : '—';
      }
      if (prevBtn) prevBtn.disabled = curPage <= 1;
      if (nextBtn) nextBtn.disabled = curPage >= totalPages;
      if (prevBtnB) prevBtnB.disabled = curPage <= 1;
      if (nextBtnB) nextBtnB.disabled = curPage >= totalPages;
      page = curPage;
      if (!Performers._background && gridEl) gridEl.classList.remove('loading');
      // Decide status & polling logic based on scan/debug info
      try {
        const scanActive = !!(lastDebug && (lastDebug.scan_in_progress || lastDebug.scan_scheduled));
        const partial = !!(lastDebug && lastDebug.counts_partial);
        const allZero = performers.length > 0 && performers.every(p => !Number(p.count || 0));
        const empty = performers.length === 0;
        // Poll conditions: still scanning AND (empty list OR all counts zero during partial phase)
        const shouldPoll = !Performers._background && scanActive && (empty || (partial && allZero));
        // Backoff strategy: grow interval a bit to reduce load, cap at 10s
        if (!Performers._pollIntervalMs) Performers._pollIntervalMs = 1500;
        else Performers._pollIntervalMs = Math.min(10000, Math.round(Performers._pollIntervalMs * 1.4));
        if (shouldPoll && !scanPollTimer) {
          if (!Performers._background) setStatus(empty ? 'Scanning performers…' : 'Computing usage counts…', true);
          scanPollTimer = setTimeout(() => {
            scanPollTimer = null;
            // Reset in-flight flag before re-fetching
            Performers._inFlight = false;
            fetchPerformers();
          }, Performers._pollIntervalMs);
        }
        else if (!Performers._background && partial && allZero) {
          // Show computing counts message even if scan flag not set (defensive)
          setStatus('Computing usage counts…', true);
        }
        else {
          if (!Performers._background) setStatus('', false);
          // Reset poll interval so future cold starts use fast cadence
          Performers._pollIntervalMs = 0;
        }
      }
      catch(_) { setStatus('', false); }
      const r0 = performance.now ? performance.now() : Date.now();
      render();
      const r2 = performance.now ? performance.now() : Date.now();
      console.log('[Performers:renderTotal]', { items: performers.length, ms: Math.round(r2 - r0) });
    }
    catch (e) {
      if (e.name === 'AbortError') return;
      setStatus('Failed to load performers', true);
      if (gridEl) gridEl.classList.remove('loading');
      if (gridEl) {
        gridEl.innerHTML = '';
        const node = tpl('emptyHintTemplate');
        if (node) {
          const el = node.querySelector('.empty-hint');
          if (el) el.textContent = 'Error loading performers.';
          gridEl.appendChild(node);
        }
      }
      console.error(e);
    }
    finally {
      Performers._inFlight = false;
    }
  }
  // Attach public fetch for any early callers (render() previously tried window.fetchPerformers)
  window.fetchPerformers = fetchPerformers;
  const debounceSearch = debounce(fetchPerformers, 400);
  function toggleSelect(slug, opts = {range: false, anchor: false}) {
    if (opts.range && shiftAnchor) {
      // range selection
      const filtered = currentFiltered();
      const aIndex = filtered.findIndex((p) => p.slug === shiftAnchor);
      const bIndex = filtered.findIndex((p) => p.slug === slug);
      if (aIndex > -1 && bIndex > -1) {
        const [start, end] = aIndex < bIndex ? [aIndex, bIndex] : [bIndex, aIndex];
        for (let i = start; i <= end; i++) {
          selected.add(filtered[i].slug);
        }
        updateSelectionUI();
        return;
      }
    }
    if (selected.has(slug)) selected.delete(slug);
    else selected.add(slug);
    if (opts.anchor) shiftAnchor = slug;
    updateSelectionUI();
  }
  function currentFiltered() {
    const termLower = searchTerm.toLowerCase();
    return performers.filter((p) => !termLower || p.name.toLowerCase().includes(termLower));
  }
  function handleCardClick(e, p, filtered) {
    const norm = p.slug;
    if (e.shiftKey) {
      toggleSelect(norm, {range: true});
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggleSelect(norm, {anchor: true});
      return;
    }
    if (selected.size <= 1 && selected.has(norm)) {
      selected.delete(norm);
      shiftAnchor = norm;
    }
    else {
      selected.clear();
      selected.add(norm);
      shiftAnchor = norm;
    }
    updateSelectionUI();
    lastFocusedIndex = filtered.findIndex((x) => x.slug === norm);
  }
  function handleCardKey(e, p, filtered) {
    const norm = p.slug;
    const index = filtered.findIndex((x) => x.slug === norm);
    if (
      [
        'ArrowDown',
        'ArrowUp',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        ' ',
      ].includes(e.key) || (e.key === 'a' && (e.metaKey || e.ctrlKey))
    ) {
      e.preventDefault();
    }
    const cols = calcColumns();
    function focusAt(i) {
      if (i < 0 || i >= filtered.length) return;
      const card = gridEl.querySelector(`.perf-card[data-slug="${(filtered[i].slug)}"]`);
      if (card) {
        card.focus();
        lastFocusedIndex = i;
      }
    }
    switch (e.key) {
      case ' ':
      toggleSelect(norm, {anchor: true});
      break;
      case 'Enter':
      renamePrompt(p);
      break;
      case 'Delete':
      case 'Backspace':
      deleteSelected();
      break;
      case 'a':
      if (e.metaKey || e.ctrlKey) {
        selected = new Set(filtered.map((x) => x.slug));
        updateSelectionUI();
      }
      break;
      case 'ArrowRight':
      focusAt(index + 1);
      break;
      case 'ArrowLeft':
      focusAt(index - 1);
      break;
      case 'ArrowDown':
      focusAt(index + cols);
      break;
      case 'ArrowUp':
      focusAt(index - cols);
      break;
      case 'Home':
      focusAt(0);
      break;
      case 'End':
      focusAt(filtered.length - 1);
      break;
      case 'Shift':
      break;
      default:
      return;
    }
  }
  function calcColumns() {
    if (!gridEl) return 1;
    const style = getComputedStyle(gridEl);
    const template = style.gridTemplateColumns;
    if (!template) return 1;
    return template.split(' ').length;
  }
  async function addCurrent() {
    if (!searchTerm) return;
    try {
      await fetch('/api/performers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({name: searchTerm}),
      });
      await fetchPerformers();
    }
    catch (_) { }
  }
  async function importPrompt(e) {
    // Default behavior: open file chooser. Hold Alt/Option to fall back to manual paste prompt.
    if (e && e.altKey) {
      const txt = prompt('Paste newline-separated names or JSON array:');
      if (!txt) return;
      try {
        const r = await fetch('/api/performers/import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: txt,
        });
        if (!r.ok) {
          throw new Error('Import failed');
        }
        if (window.showToast) window.showToast('Performers imported', 'is-success');
        await fetchPerformers();
      }
      catch (err) {
        if (window.showToast) window.showToast(err.message || 'Import failed', 'is-error');
      }
      return;
    }
    // Always lookup the file input at call time in case DOM changed
    const fi = document.getElementById('performerFileInput');
    if (fi) {
      try {
        fi.click();
        return;
      }
      catch (_) { }
    }
    const txt = prompt('Paste newline-separated names or JSON array:');
    if (!txt) return;
    try {
      const r = await fetch('/api/performers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txt,
      });
      if (!r.ok) {
        throw new Error('Import failed');
      }
      if (window.showToast) window.showToast('Performers imported', 'is-success');
      await fetchPerformers();
    }
    catch (err) {
      if (window.showToast) window.showToast(err.message || 'Import failed', 'is-error');
    }
  }
  async function renamePrompt(p) {
    // Open modal-based rename for parity with Tags
    openRenameModal(p && p.name);
  }
  async function addTagPrompt(p) {
    const tag = prompt('Add tag for ' + p.name + ':');
    if (!tag) return;
    try {
      await fetch('/api/performers/tags/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({name: p.name, tag: tag}),
      });
      await fetchPerformers();
    }
    catch (_) { }
  }
  async function removeTag(p, tag) {
    if (!confirm(`Remove tag '${tag}' from ${p.name}?`)) return;
    try {
      await fetch('/api/performers/tags/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({name: p.name, tag: tag}),
      });
      await fetchPerformers();
    }
    catch (_) { }
  }
  async function mergeSelected() {
    if (selected.size < 2) return;
    openMergeModal();
  }
  async function deleteSelected() {
    if (!selected.size) return;
    // Respect Settings > Confirm delete preference; default is off
    if (confirmDeletesEnabled) {
      if (!confirm(`Delete ${selected.size} performer(s)?`)) return;
    }
    for (const slug of [...selected]) {
      const rec = performers.find((p) => p.slug === slug);
      if (!rec) continue;
      try {
        await fetch('/api/performers?name=' + encodeURIComponent(rec.name), {
          method: 'DELETE',
        });
      }
      catch (_) { }
    }
    selected.clear();
    await fetchPerformers();
  }
  function wireEvents() {
    if (searchEl && !searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', () => {
        searchTerm = searchEl.value.trim();
        page = 1;
        debounceSearch();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          searchTerm = '';
          page = 1;
          fetchPerformers();
        }
      });
    }
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', addCurrent);
    }
    // Remove legacy separate import button wiring (folded into unified)
    if (mergeBtn && !mergeBtn._wired) {
      mergeBtn._wired = true;
      mergeBtn.addEventListener('click', mergeSelected);
    }
    if (renameBtn && !renameBtn._wired) {
      renameBtn._wired = true;
      renameBtn.addEventListener('click', () => {
        if (selected.size !== 1) return;
        const slug = Array.from(selected)[0];
        const rec = performers.find((p) => p.slug === slug);
        openRenameModal(rec && rec.name);
      });
    }
    if (deleteBtn && !deleteBtn._wired) {
      deleteBtn._wired = true;
      deleteBtn.addEventListener('click', deleteSelected);
    }
    if (dropZone && !dropZone._wired) {
      dropZone._wired = true;
      wireDropZone();
    }
    // Sort controls
    const sortSel = document.getElementById('performerSort');
    const sortOrderBtn = document.getElementById('performerSortOrder');
    const applySortButtonLabel = () => {
      if (!sortOrderBtn) return;
      // With current mapping, sortDir === 1 maps to server 'desc' (descending)
      const isDesc = sortDir === 1;
      sortOrderBtn.textContent = isDesc ? '▼' : '▲';
      sortOrderBtn.setAttribute('aria-label', isDesc ? 'Descending' : 'Ascending');
      sortOrderBtn.title = isDesc ? 'Descending' : 'Ascending';
    };
    // Load persisted sort prefs
    try {
      const sb = localStorage.getItem('performers:sortBy');
      const sd = localStorage.getItem('performers:sortDir');
      if (sb === 'name' || sb === 'count') sortBy = sb;
      if (sd === '1' || sd === '-1') {
        sortDir = sd === '1' ? 1 : -1;
      }
      else {
        // default by sortBy: name → ascending, count → descending
  // sortDir flag semantics: 1 => requested 'desc', -1 => 'asc'. We omit the order param
  // when it matches backend defaults (name asc, count desc) to let server choose.
        sortDir = (sortBy === 'name') ? -1 : 1;
      }
    }
    catch (_) { }
    if (sortSel) {
      sortSel.value = sortBy;
      if (!sortSel._wired) {
        sortSel._wired = true;
        sortSel.addEventListener('change', async () => {
          sortBy = sortSel.value === 'name' ? 'name' : 'count';
          // Default dir: name asc, count desc (see mapping in fetchPerformers)
          sortDir = (sortBy === 'name') ? -1 : 1;
          try {
            localStorage.setItem('performers:sortBy', sortBy);
            localStorage.setItem('performers:sortDir', String(sortDir));
          }
          catch (_) { }
          applySortButtonLabel();
          page = 1;
          await fetchPerformers();
        });
      }
    }
    if (sortOrderBtn && !sortOrderBtn._wired) {
      sortOrderBtn._wired = true;
      // Initialize label
      applySortButtonLabel();
      sortOrderBtn.addEventListener('click', async () => {
        sortDir = sortDir === 1 ? -1 : 1;
        try {
          localStorage.setItem('performers:sortDir', String(sortDir));
        }
        catch (_) { }
        applySortButtonLabel();
        page = 1;
        await fetchPerformers();
      });
    }
    const handlePrev = async () => {
      if (page > 1) {
        page--;
        await fetchPerformers();
      }
    };
    const handleNext = async () => {
      page++;
      await fetchPerformers();
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
    const handlePageSizeChange = async (sel) => {
      const v = parseInt(sel.value, 10);
      if (Number.isFinite(v) && v > 0) {
        pageSize = v;
        // keep both selects in sync
        if (pageSizeSel && pageSizeSel !== sel) pageSizeSel.value = String(v);
        if (pageSizeSelB && pageSizeSelB !== sel) pageSizeSelB.value = String(v);
        page = 1;
        await fetchPerformers();
      }
    };
    if (pageSizeSel && !pageSizeSel._wired) {
      pageSizeSel._wired = true;
      const ps = parseInt(pageSizeSel.value, 10);
      if (Number.isFinite(ps)) pageSize = ps;
      pageSizeSel.addEventListener('change', () => handlePageSizeChange(pageSizeSel));
    }
    if (pageSizeSelB && !pageSizeSelB._wired) {
      pageSizeSelB._wired = true;
      const psb = parseInt(pageSizeSelB.value, 10);
      if (Number.isFinite(psb)) pageSize = psb;
      pageSizeSelB.addEventListener('change', () => handlePageSizeChange(pageSizeSelB));
    }
    document.addEventListener('keydown', globalKeyHandler);
  }
  // ----- Performer Merge/Rename Modals (parity with Tags) -----
  let mergePanel = null;
  let mergeCloseBtn = null;
  let mergeCancelBtn = null;
  let mergeConfirmBtn = null;
  let mergeIntoInput = null;
  let mergeSelectedWrap = null;
  let renamePanel = null;
  let renameCloseBtn = null;
  let renameCancelBtn = null;
  let renameConfirmBtn = null;
  let renameInput = null;
  let renameSelectedWrap = null;

  function ensureModalDom() {
    if (!mergePanel) {
      mergePanel = document.getElementById('performerMergeModal');
      mergeCloseBtn = document.getElementById('performerMergeClose');
      mergeCancelBtn = document.getElementById('performerMergeCancel');
      mergeConfirmBtn = document.getElementById('performerMergeConfirm');
      mergeIntoInput = document.getElementById('performerMergeInto');
      mergeSelectedWrap = document.getElementById('performerMergeSelected');
    }
    if (!renamePanel) {
      renamePanel = document.getElementById('performerRenameModal');
      renameCloseBtn = document.getElementById('performerRenameClose');
      renameCancelBtn = document.getElementById('performerRenameCancel');
      renameConfirmBtn = document.getElementById('performerRenameConfirm');
      renameInput = document.getElementById('performerRenameInput');
      renameSelectedWrap = document.getElementById('performerRenameSelected');
    }
  }
  function chipForName(name) {
    const span = document.createElement('span');
    span.className = 'chip';
    span.textContent = name;
    return span;
  }
  function openMergeModal() {
    ensureModalDom();
    if (!mergePanel) return;
    // Populate selected chips
    if (mergeSelectedWrap) {
      mergeSelectedWrap.innerHTML = '';
      const names = Array.from(selected).map((s) => performers.find((p) => p.slug === s)?.name || s);
      names.forEach((n) => mergeSelectedWrap.appendChild(chipForName(n)));
    }
    if (mergeIntoInput) {
      // Default to the first selected's name
      const first = performers.find((p) => p.slug === Array.from(selected)[0]);
      mergeIntoInput.value = first && first.name ? first.name : '';
    }
    if (mergeConfirmBtn) mergeConfirmBtn.disabled = !(mergeIntoInput && mergeIntoInput.value.trim());
    show(mergePanel);
    mergePanel.setAttribute('data-open', '1');
    // Wire once
    if (!mergePanel._wired) {
      mergePanel._wired = true;
      const close = () => { hide(mergePanel); mergePanel.removeAttribute('data-open'); };
      if (mergeCloseBtn) mergeCloseBtn.addEventListener('click', close);
      if (mergeCancelBtn) mergeCancelBtn.addEventListener('click', close);
      mergePanel.addEventListener('click', (e) => { if (e.target === mergePanel) close(); });
      if (mergeIntoInput) {
        mergeIntoInput.addEventListener('input', () => {
          if (mergeConfirmBtn) mergeConfirmBtn.disabled = !mergeIntoInput.value.trim();
        });
        mergeIntoInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && mergeConfirmBtn && !mergeConfirmBtn.disabled) mergeConfirmBtn.click();
        });
      }
      if (mergeConfirmBtn) {
        mergeConfirmBtn.addEventListener('click', async () => {
          const into = (mergeIntoInput && mergeIntoInput.value.trim()) || '';
          if (!into || selected.size < 2) return;
          const from = Array.from(selected).map((s) => performers.find((p) => p.slug === s)?.name || s);
          try {
            const r = await fetch('/api/performers/merge', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to: into }),
            });
            if (!r.ok) throw new Error('Merge failed');
            if (window.showToast) window.showToast(`Merged into '${into}'`, 'is-success');
            selected.clear();
            close();
            await fetchPerformers();
          }
          catch (err) {
            if (window.showToast) window.showToast(err.message || 'Merge failed', 'is-error');
          }
        });
      }
    }
    setTimeout(() => {
      try { mergeIntoInput && mergeIntoInput.focus(); }
    catch(_) { }
  }, 0);
  }
  function openRenameModal(currentName) {
    ensureModalDom();
    if (!renamePanel) return;
    if (renameSelectedWrap) {
      renameSelectedWrap.innerHTML = '';
      const name = currentName || (performers.find((p) => p.slug === Array.from(selected)[0])?.name || '');
      renameSelectedWrap.appendChild(chipForName(name));
    }
    if (renameInput) {
      renameInput.value = currentName || '';
      renameInput.select();
    }
    if (renameConfirmBtn) renameConfirmBtn.disabled = !(renameInput && renameInput.value.trim());
    show(renamePanel);
    renamePanel.setAttribute('data-open', '1');
    if (!renamePanel._wired) {
      renamePanel._wired = true;
      const close = () => { hide(renamePanel); renamePanel.removeAttribute('data-open'); };
      if (renameCloseBtn) renameCloseBtn.addEventListener('click', close);
      if (renameCancelBtn) renameCancelBtn.addEventListener('click', close);
      renamePanel.addEventListener('click', (e) => { if (e.target === renamePanel) close(); });
      if (renameInput) {
        renameInput.addEventListener('input', () => {
          if (renameConfirmBtn) renameConfirmBtn.disabled = !renameInput.value.trim();
        });
        renameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && renameConfirmBtn && !renameConfirmBtn.disabled) renameConfirmBtn.click();
        });
      }
      if (renameConfirmBtn) {
        renameConfirmBtn.addEventListener('click', async () => {
          const newName = (renameInput && renameInput.value.trim()) || '';
          const oldSlug = Array.from(selected)[0];
          const oldName = performers.find((p) => p.slug === oldSlug)?.name || currentName || '';
          if (!newName || !oldName || newName === oldName) { hide(renamePanel); renamePanel.removeAttribute('data-open'); return; }
          try {
            const r = await fetch('/api/performers/rename', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ old: oldName, new: newName }),
            });
            if (!r.ok) throw new Error('Rename failed');
            if (window.showToast) window.showToast('Renamed', 'is-success');
            selected.clear();
            hide(renamePanel); renamePanel.removeAttribute('data-open');
            await fetchPerformers();
          }
          catch (err) {
            if (window.showToast) window.showToast(err.message || 'Rename failed', 'is-error');
          }
        });
      }
    }
    setTimeout(() => {
      try { renameInput && renameInput.focus(); }
    catch(_) { }
  }, 0);
  }
  // Wire hidden file input fallback
  function wireFileInputOnce() {
    const fileInput = document.getElementById('performerFileInput');
    const singleImg = document.getElementById('performerSingleImageInput');
    if (!fileInput || fileInput._wired) return;
    fileInput._wired = true;
    fileInput.addEventListener('change', async () => {
      const files = [...(fileInput.files || [])];
      if (!files.length) return;
      let combined = '';
      for (const f of files) {
        try {
          combined += (await f.text()) + '\n';
        }
        catch (_) { }
      }
      if (!combined.trim()) return;
      // Parse performer names
      let rawNames = [];
      try {
        const trimmed = combined.trim();
        if (/^\s*\[/.test(trimmed)) {
          try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr)) rawNames = arr.map((x) => String(x));
          }
          catch (_) {
            rawNames = [];
          }
        }
        if (!rawNames.length) {
          rawNames = trimmed.split(/\r?\n|,|;|\t/).map((s) => s.trim())
          .filter(Boolean);
        }
        rawNames = Array.from(new Set(rawNames));
      }
      catch (_) { }
      // Show modal with would-be imports
      const modal = document.getElementById('performerImportPreviewModal');
      const list = document.getElementById('performerImportPreviewList');
      const closeBtn = document.getElementById('performerImportPreviewClose');
      const confirmBtn = document.getElementById('performerImportPreviewConfirm');
      if (!modal || !list || !confirmBtn || !closeBtn) return;
      list.innerHTML = '';
      rawNames.forEach((name) => {
        const div = document.createElement('div');
        div.className = 'chip';
        div.textContent = name;
        list.appendChild(div);
      });
      show(modal);
      function closeModal() {
        hide(modal);
        fileInput.value = '';
      }
      if (!closeBtn._wired) {
        closeBtn._wired = true;
        closeBtn.addEventListener('click', closeModal);
      }
      if (!confirmBtn._wired) {
        confirmBtn._wired = true;
        confirmBtn.addEventListener('click', async () => {
          hide(modal);
          setStatus('Importing…', true);
          let imported = false;
          let errorMsg = '';
          // Try text/plain first
          try {
            const r = await fetch('/api/performers/import', {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: rawNames.join('\n'),
            });
            if (r.ok) {
              imported = true;
              if (window.showToast) window.showToast('Performers imported', 'is-success');
              try {
                await fetchPerformers();
              }
              catch (_) { }
              setStatus('Imported performers', true);
              // Immediately offer filename auto-match preview scoped to imported names
              try {
                if (window.__openPerfAutoMatchWithList) {
                  window.__openPerfAutoMatchWithList(rawNames);
                }
              }
              catch (_) { }
            }
            else if (r.status === 422) {
              // Fallback to JSON
              const r2 = await fetch('/api/performers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({names: rawNames}),
              });
              const j2 = await r2.json();
              if (r2.ok) {
                imported = true;
                if (window.showToast) window.showToast('Performers imported', 'is-success');
                try {
                  await fetchPerformers();
                }
                catch (_) { }
                setStatus('Imported performers', true);
                try {
                  if (window.__openPerfAutoMatchWithList) {
                    window.__openPerfAutoMatchWithList(rawNames);
                  }
                }
                catch (_) { }
              }
              else {
                errorMsg = j2?.message || 'Import failed';
              }
            }
            else {
              const j = await r.json();
              errorMsg = j?.message || 'Import failed';
            }
          }
          catch (err) {
            errorMsg = err.message || 'Import failed';
          }
          finally {
            fileInput.value = '';
            if (!imported) {
              setStatus('Import failed', true);
              if (window.showToast) window.showToast(errorMsg, 'is-error');
            }
          }
        });
        // Observe player title and hide overlay when empty (compat for browsers without :has)
        (function watchPlayerTitle() {
          try {
            const title = document.getElementById('playerTitle');
            const overlay = document.getElementById('playerOverlayBar');
            if (!title || !overlay) return;
            const update = () => {
              const empty = !title.textContent || title.textContent.trim() === '';
              if (empty) hide(overlay);
              else show(overlay);
            };
            update();
            const mo = new MutationObserver(update);
            mo.observe(title, {childList: true, characterData: true, subtree: true});
            // also watch for attribute changes that may alter visibility
            mo.observe(overlay, {attributes: true});
          }
          catch (_) { }
        })();
      }
    });
    if (singleImg && !singleImg._wired) {
      singleImg._wired = true;
      singleImg.addEventListener('change', async () => {
        const files = [...(singleImg.files||[])];
        if (!files.length) return;
        const f = files[0];
        const name = singleImg.dataset.name || '';
        if (!name) return;
        try {
          const fd = new FormData();
            fd.append('file', f, f.name);
          const params = new URLSearchParams();
          params.set('name', name);
          params.set('replace', 'false');
          params.set('create_missing', 'true');
          const res = await fetch('/api/performers/image?' + params.toString(), { method: 'POST', body: fd });
          const j = await res.json().catch(()=>null);
          if (!res.ok) throw new Error(j && j.message || 'Upload failed');
          (window.showToast||notify)('Image uploaded', 'success');
          // If response returns performer.image as full URL, update in-memory performer before full reload
          if (j && j.data && j.data.performer && j.data.performer.image) {
            const imgUrl = j.data.performer.image;
            const slug = j.data.performer.slug;
            // Patch current in-memory list so user sees immediate update without waiting for network
            const rec = performers.find(p => p.slug === slug);
            if (rec) rec.image = imgUrl;
            render();
          }
          await fetchPerformers();
        }
        catch(err) {
          (window.showToast||notify)(err.message||'Upload failed', 'error');
        } finally {
          try { singleImg.value=''; }
          catch(_) { }
        }
      });
    }
  }
  // Wire file input at DOM ready and also opportunistically when tab is shown
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireFileInputOnce, {once: true});
  }
  else {
    wireFileInputOnce();
  }
  if (dropZone && !dropZone._clickWired) {
    dropZone._clickWired = true;
    dropZone.addEventListener('click', () => {
      const fi = document.getElementById('performerFileInput');
      if (fi) fi.click();
    });
    dropZone.addEventListener('dblclick', () => {
      const fi = document.getElementById('performerFileInput');
      if (fi) fi.click();
    });
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const fi = document.getElementById('performerFileInput');
        if (fi) fi.click();
      }
    });
  }
  function globalKeyHandler(e) {
    if (!isPanelActive()) return;
    if (e.key === 'Escape' && selected.size) {
      selected.clear();
      updateSelectionUI();
    }
  }
  function isPanelActive() {
    const panel = document.getElementById('performers-panel');
    return panel && !panel.hasAttribute('hidden');
  }
  function wireDropZone() {
    if (document._perfDndAttached) return;
    document._perfDndAttached = true;
    let over = false;
    let hoverTimer = null;
    function panelActive() {
      return isPanelActive();
    }
    function showHover() {
      if (!dropZone) return;
      dropZone.classList.add('drag-hover');
    }
    function clearHover() {
      if (!dropZone) return;
      dropZone.classList.remove('drag-hover');
    }
    async function readPayload(dt) {
      if (!dt) return '';
      let out = '';
      const items = dt.items ? [...dt.items] : [];
      for (const it of items) {
        if (it.kind === 'string') {
          try {
            out = await new Promise((r) => it.getAsString(r));
          }
          catch (_) { }
          if (out) return out;
        }
      }
      if (dt.files && dt.files.length) {
        for (const f of dt.files) {
          try {
            if (
              f.type.startsWith('text/') || /\.(txt|csv|json)$/i.test(f.name)
            ) {
              out = await f.text();
              if (out) return out;
            }
          }
          catch (_) { }
        }
        try {
          if (!out) out = await dt.files[0].text();
        }
        catch (_) { }
      }
      return out;
    }
    function wantsIntercept(dt) {
      if (!dt) return false;
      return (
        dt.types && (dt.types.includes('Files') || dt.types.includes('text/plain') || dt.files?.length)
      );
    }
    document.addEventListener(
      'dragover',
      (e) => {
        if (!panelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!over) {
          over = true;
          showHover();
        }
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      },
      true,
    );
    document.addEventListener(
      'dragenter',
      (e) => {
        if (!panelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        over = true;
        showHover();
      },
      true,
    );
    document.addEventListener(
      'dragleave',
      (e) => {
        if (!panelActive()) return;
        if (!over) return;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          over = false;
          clearHover();
        }, 60);
      },
      true,
    );
    document.addEventListener(
      'drop',
      async (e) => {
        if (!panelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        over = false;
        clearHover();
        try {
          // Prefer unified handler when files are dropped (images / zip / mixed)
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length && window.__perfUnifiedHandleFiles) {
            console.log('[Performers:DnD] handling files', dt.files.length);
            await window.__perfUnifiedHandleFiles(dt.files);
          }
          else {
            const text = await readPayload(e.dataTransfer);
            if (text) {
              setStatus('Importing…', true);
              await fetch('/api/performers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: text,
              });
              await fetchPerformers();
            }
          }
        }
        catch (err) {
          console.warn('performers drop failed', err);
          setStatus('Import failed', true);
          setTimeout(() => setStatus('', false), 1500);
        }
      },
      true,
    );
  }
  function openPanel() {
    // Just load performers; do not auto-open Auto‑Match modal.
    fetchPerformers();
  }
  return {show: openPanel};
})();
window.Performers = Performers;
// Hook tab switch to load performers when opened
// 1) Click on the Performers tab button
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-tab="performers"]');
  if (btn) {
    setTimeout(() => {
      if (window.Performers) window.Performers.show();
    }, 50);
  }
});
// 2) Router-driven activation (hash navigation and programmatic tab switches)
//    TabSystem dispatches a CustomEvent('tabchange', {detail: {activeTab} }) on window.
window.addEventListener('tabchange', (ev) => {
  try {
    const active = ev && ev.detail && ev.detail.activeTab;
    if (active === 'performers' && window.Performers) {
      // Defer slightly to allow panel DOM to settle
      setTimeout(() => window.Performers && window.Performers.show(), 30);
    }
  }
  catch (_) { /* no-op */ }
});
// 3) Direct load on #performers (refresh or deep-link)
window.addEventListener('DOMContentLoaded', () => {
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (hash === 'performers' && window.Performers) {
    setTimeout(() => window.Performers && window.Performers.show(), 50);
  }
});
// Fallback direct wiring: ensure clicking the import drop zone always opens file picker
// (In case module wiring hasn't run yet or was interrupted.)
(function ensurePerformerDropZoneClick() {
  function wire() {
    const dz = document.getElementById('performerDropZone');
    if (!dz || dz._directClick) return;
    dz._directClick = true;
    dz.addEventListener('click', (ev) => {
      // Ignore if text selection drag ended here
      const fi = document.getElementById('performerUnifiedFileInput') || document.getElementById('performerFileInput');
      if (fi && typeof fi.click === 'function') {
        try {
          fi.click();
        }
        catch (_) { }
      }
    });
    dz.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const fi = document.getElementById('performerUnifiedFileInput') || document.getElementById('performerFileInput');
        if (fi && typeof fi.click === 'function') {
          try {
            fi.click();
          }
          catch (_) { }
        }
      }
    });
  }
  // Defer wiring until DOM is ready so elements exist
  function wirePerformerAutoMatch() {
    function qs(id) {
      return document.getElementById(id);
    }
    const openBtn = qs('performerAutoMatchBtn');
    const modal = qs('performerAutoMatchModal');
    if (!modal) {
      // Required modal root missing; nothing to wire.
      return;
    }
    if (modal._wired) return;
    const closeBtn = qs('perfAutoMatchClose');
    const cancelBtn = qs('perfAutoCancelBtn');
    const applyBtnFooter = qs('perfAutoApplyBtnFooter');
    const statusEl = qs('perfAutoMatchStatus');
    const tbody = qs('perfAutoMatchTbody');
    let lastRows = [];
    // Local toast helper: prefer legacy window.showToast if present; otherwise use notify()
    function toast(message, type) {
      try {
        const normalized = (type && typeof type === 'string' && type.startsWith('is-')) ? type.slice(3) : (type || 'info');
        if (window.showToast) {
          // Keep original type for legacy showToast which expects 'is-success' etc.
          window.showToast(message, type || 'is-info');
        }
        else {
          // utils.notify expects 'success' | 'error' | 'info'
          notify(message, normalized);
        }
      }
      catch (_) { /* no-op */ }
    }
    function open() {
      show(modal);
      modal.setAttribute('data-open', '1');
      document.addEventListener('keydown', escListener);
    }
    function close() {
      hide(modal);
      modal.removeAttribute('data-open');
      document.removeEventListener('keydown', escListener);
    }
    function escListener(e) {
      if (e.key === 'Escape') close();
    }
    function setApplying(dis) {
      if (applyBtnFooter) applyBtnFooter.disabled = dis;
    }
    function enableApply(enabled) {
      setApplying(!enabled);
    }
    async function doPreview() {
      enableApply(false);
      if (statusEl) statusEl.textContent = 'Previewing…';
      if (tbody) tbody.innerHTML = '';
      lastRows = [];
      try {
        // Global preview: scan all videos from root, recursive, using registry performers
        const payload = {path: undefined, recursive: true, use_registry_performers: true, performers: [], tags: [], limit: 800};
        const r = await fetch('/api/autotag/preview', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.message || 'Preview failed');
        const rows = j?.data?.candidates || [];
        lastRows = rows;
        if (statusEl) statusEl.textContent = rows.length ? rows.length + ' match(es)' : 'No matches';
        rows.forEach((row) => {
          const tpl = document.getElementById('autotagRowTemplate');
          if (!tpl) return;
          const tr = tpl.content.firstElementChild.cloneNode(true);
          tr.querySelector('.file').textContent = row.file;
          tr.querySelector('.tags').textContent = (row.performers || []).join(', ');
          tbody && tbody.appendChild(tr);
        });
        enableApply(rows.length > 0);
      }
      catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Preview failed';
      }
    }
    async function doApply() {
      if (!lastRows.length) return;
      setApplying(true);
      if (statusEl) statusEl.textContent = 'Queuing job…';
      try {
        const payload = {path: undefined, recursive: true, use_registry_performers: true, performers: [], tags: [] };
        const r = await fetch('/api/autotag/scan', {method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          throw new Error((j && j.message) || 'Queue failed');
        }
        if (statusEl) statusEl.textContent = 'Job queued';
        toast('Auto‑match job queued', 'is-success');
        setTimeout(close, 800);
      }
      catch (err) {
        if (statusEl) statusEl.textContent = err.message || 'Queue failed';
        toast(err.message || 'Queue failed', 'is-error');
        enableApply(true);
      }
    }
    // Expose programmatic openers
    window.__openPerfAutoMatch = function () {
      if (!modal || !modal.hidden) return; // already open
      open();
      doPreview();
    };
    window.__openPerfAutoMatchWithList = function (_perfList) {
      // List input no longer used; we always use registry performers for preview
      open();
      doPreview();
    };
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        open();
        doPreview();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (applyBtnFooter) applyBtnFooter.addEventListener('click', doApply);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal._wired = true;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, {once: true});
    document.addEventListener('DOMContentLoaded', wirePerformerAutoMatch, {once: true});
  }
  else {
    wire();
    wirePerformerAutoMatch();
  }
})();

// -----------------------------
// Tags Module (list extant tags with counts; server-side pagination)
// -----------------------------
const Tags = (() => {
  let tags = [];
  let gridEl = null;
  let searchEl = null;
  let countEl = null;
  let statusEl = null;
  let tagsSpinnerEl = null;
  let importBtn = null;
  let mergeBtn = null;
  let renameBtn = null;
  let deleteBtn = null;
  let importFile = null;
  let dropZone = null;
  let autoTagBtn = null;
  // Manual Add UI
  let manualBtn = null;
  let manualPanel = null;
  let manualName = null;
  let manualPatterns = null;
  let manualPreviewBtn = null;
  let manualApplyAllBtn = null;
  let manualStatus = null;
  let manualResults = null;
  // Merge Modal UI
  let mergePanel = null;
  let mergeCloseBtn = null;
  let mergeCancelBtn = null;
  let mergeConfirmBtn = null;
  let mergeIntoInput = null;
  let mergeSelectedWrap = null;
  // Rename Modal UI
  let renamePanel = null;
  let renameCloseBtn = null;
  let renameCancelBtn = null;
  let renameConfirmBtn = null;
  let renameInput = null;
  let renameSelectedWrap = null;
  // selection state (by slug)
  let selected = new Set();
  let pager = null;
  let prevBtn = null;
  let nextBtn = null;
  let pageInfo = null;
  let pageSizeSel = null;
  let pagerB = null;
  let prevBtnB = null;
  let nextBtnB = null;
  let pageInfoB = null;
  let pageSizeSelB = null;
  let sortBy = 'count';
  // name → asc; count → desc
  let sortDir = 1; // 1 => desc (server mapping), -1 => asc
  let searchTerm = '';
  let page = 1;
  let pageSize = 32;
  let srvTotal = 0;
  let srvTotalPages = 1;
  let srvPage = 1;
  // Force a server refresh on first load (and after mutations) so cache reflects latest tags
  let needRefresh = true;
  // Track keyboard/selection anchors (mirrors Performers behavior)
  let lastFocusedIndex = -1;
  let shiftAnchor = null;
  function initDom() {
    if (gridEl) return;
    gridEl = document.getElementById('tagsGrid');
    searchEl = document.getElementById('tagSearch');
    countEl = document.getElementById('tagsCount');
    statusEl = document.getElementById('tagsStatus');
    pager = document.getElementById('tagsPager');
    tagsSpinnerEl = document.getElementById('tagsSpinner');
    prevBtn = document.getElementById('tagPrev');
    nextBtn = document.getElementById('tagNext');
    pageInfo = document.getElementById('tagPageInfo');
    pageSizeSel = document.getElementById('tagPageSize');
    pagerB = document.getElementById('tagsPagerBottom');
    prevBtnB = document.getElementById('tagPrevBottom');
    nextBtnB = document.getElementById('tagNextBottom');
    pageInfoB = document.getElementById('tagPageInfoBottom');
    pageSizeSelB = document.getElementById('tagPageSizeBottom');
    importBtn = document.getElementById('tagImportBtn');
    mergeBtn = document.getElementById('tagMergeBtn');
  renameBtn = document.getElementById('tagRenameBtn');
    deleteBtn = document.getElementById('tagDeleteBtn');
    importFile = document.getElementById('tagImportFile');
    dropZone = document.getElementById('tagDropZone');
    autoTagBtn = document.getElementById('tagAutoTagBtn');
    // Manual add controls
    manualBtn = document.getElementById('tagManualAddBtn');
    manualPanel = document.getElementById('tagManualModal');
    manualName = document.getElementById('manualTagName');
    manualPatterns = document.getElementById('manualTagPatterns');
    manualPreviewBtn = document.getElementById('manualPreviewBtn');
    manualApplyAllBtn = document.getElementById('manualApplyAllBtn');
    manualStatus = document.getElementById('manualStatus');
    manualResults = document.getElementById('manualResults');
    // Merge Modal elements
    mergePanel = document.getElementById('tagMergeModal');
    mergeCloseBtn = document.getElementById('tagMergeClose');
    mergeCancelBtn = document.getElementById('tagMergeCancel');
    mergeConfirmBtn = document.getElementById('tagMergeConfirm');
    mergeIntoInput = document.getElementById('tagMergeInto');
    mergeSelectedWrap = document.getElementById('tagMergeSelected');
    // Rename Modal elements
    renamePanel = document.getElementById('tagRenameModal');
    renameCloseBtn = document.getElementById('tagRenameClose');
    renameCancelBtn = document.getElementById('tagRenameCancel');
    renameConfirmBtn = document.getElementById('tagRenameConfirm');
    renameInput = document.getElementById('tagRenameInput');
    renameSelectedWrap = document.getElementById('tagRenameSelected');
    try {
      console.log('[Tags:initDom]', {
        gridEl: !!gridEl,
        mergeBtn: !!mergeBtn,
        mergePanel: !!mergePanel,
        mergeCloseBtn: !!mergeCloseBtn,
        mergeCancelBtn: !!mergeCancelBtn,
        mergeConfirmBtn: !!mergeConfirmBtn,
        mergeIntoInput: !!mergeIntoInput,
        mergeSelectedWrap: !!mergeSelectedWrap,
        renameBtn: !!renameBtn,
        renamePanel: !!renamePanel,
        renameConfirmBtn: !!renameConfirmBtn,
      });
    }
    catch (_) {}
    wireEvents();
  }
  function openMergeModal(fromName, otherName) {
    if (!mergePanel) return;
    try {
      console.log(`[Tags:openMergeModal] start from="${fromName}" other="${otherName}" hasPanel=${!!mergePanel}`);
      if (mergeSelectedWrap) {
        mergeSelectedWrap.innerHTML = '';
        const makeChip = (name) => {
          const span = document.createElement('span');
          span.className = 'chip chip-tag';
          const lab = document.createElement('span');
          lab.className = 'chip-label';
          lab.textContent = `#${name}`;
          span.appendChild(lab);
          return span;
        };
        mergeSelectedWrap.appendChild(makeChip(fromName));
        mergeSelectedWrap.appendChild(document.createTextNode(' + '));
        mergeSelectedWrap.appendChild(makeChip(otherName));
      }
      if (mergeIntoInput) {
        mergeIntoInput.value = fromName || '';
      }
      if (mergeConfirmBtn) {
        mergeConfirmBtn.disabled = !(mergeIntoInput && mergeIntoInput.value.trim());
      }
      show(mergePanel);
      mergePanel.setAttribute('data-open', '1');
      try {
        const rect = mergePanel.getBoundingClientRect();
        const cs = window.getComputedStyle ? getComputedStyle(mergePanel) : null;
        const hidden = mergePanel.hidden;
        const w = Math.round(rect.width), h = Math.round(rect.height);
        const disp = cs ? cs.display : 'n/a';
        const vis = cs ? cs.visibility : 'n/a';
        const zi = cs ? cs.zIndex : 'n/a';
        const cd = mergeConfirmBtn ? mergeConfirmBtn.disabled : 'n/a';
        console.log(`[Tags:openMergeModal] shown hidden=${hidden} rect=${w}x${h} display=${disp} visibility=${vis} zIndex=${zi} confirmDisabled=${cd}`);
      }
      catch(_) { console.log('[Tags:openMergeModal] shown'); }
      setTimeout(() => {
        try { mergeIntoInput && mergeIntoInput.focus(); }
      catch(_) { }
    }, 0);
    }
    catch (_) { }
  }
  function closeMergeModal() {
    if (!mergePanel) return;
    hide(mergePanel);
    mergePanel.removeAttribute('data-open');
    try { console.log('[Tags:closeMergeModal]'); }
    catch(_) { }
  }
  function openRenameModal(currentName) {
    if (!renamePanel) return;
    try {
      console.log('[Tags:openRenameModal] start');
      if (renameSelectedWrap) {
        renameSelectedWrap.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'chip chip-tag';
        const lab = document.createElement('span');
        lab.className = 'chip-label';
        lab.textContent = `#${currentName}`;
        span.appendChild(lab);
        renameSelectedWrap.appendChild(span);
      }
      if (renameInput) {
        renameInput.value = currentName || '';
        renameInput.select();
      }
      if (renameConfirmBtn) renameConfirmBtn.disabled = !(renameInput && renameInput.value.trim());
      show(renamePanel);
      renamePanel.setAttribute('data-open', '1');
      setTimeout(() => {
        try { renameInput && renameInput.focus(); }
      catch(_) { }
    }, 0);
    }
    catch (_) {}
  }
  function closeRenameModal() {
    if (!renamePanel) return;
    hide(renamePanel);
    renamePanel.removeAttribute('data-open');
    try { console.log('[Tags:closeRenameModal]'); }
    catch(_) { }
  }
  function ensureControlsVisible() {
    try {
      const toolbar = document.querySelector('#tags-panel .perf-toolbar');
      const elts = [toolbar, importBtn, mergeBtn, deleteBtn, autoTagBtn, dropZone, statusEl, tagsSpinnerEl, pager, pagerB, gridEl, searchEl, countEl, pageSizeSel, pageSizeSelB, prevBtn, nextBtn, prevBtnB, nextBtnB];
      elts.forEach((el) => {
        if (!el) return;
        try {
          el.hidden = false;
        }
        catch (_) { }
        try {
          if (el.classList) el.classList.remove('d-none');
        }
        catch (_) { }
      });
    }
    catch (_) { }
  }
  function setStatus(msg, showFlag = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    if (showFlag) showAs(statusEl, 'block'); else hide(statusEl);
    if (tagsSpinnerEl) tagsSpinnerEl.hidden = !showFlag;
  }
  function tpl(id) {
    const t = document.getElementById(id);
    return t ? t.content.cloneNode(true) : null;
  }
  function applySortButtonLabel() {
    const sortOrderBtn = document.getElementById('tagSortOrder');
    if (!sortOrderBtn) return;
    const isDesc = sortDir === 1;
    sortOrderBtn.textContent = isDesc ? '▼' : '▲';
    sortOrderBtn.setAttribute('aria-label', isDesc ? 'Descending' : 'Ascending');
    sortOrderBtn.title = isDesc ? 'Descending' : 'Ascending';
  }
  function updateButtons() {
    if (mergeBtn) mergeBtn.disabled = selected.size !== 2;
    if (renameBtn) renameBtn.disabled = selected.size !== 1;
    if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    try {
      const md = mergeBtn ? mergeBtn.disabled : '?';
      const rd = renameBtn ? renameBtn.disabled : '?';
      const dd = deleteBtn ? deleteBtn.disabled : '?';
      console.log(`[Tags:updateButtons] size=${selected.size} mergeDisabled=${md} renameDisabled=${rd} deleteDisabled=${dd}`);
    }
    catch (_) {}
  }
  function updateSelectionUI() {
    if (!gridEl) return;
    try { console.log(`[Tags:updateSelectionUI] start size=${selected.size}`); }
    catch(_) { }
    gridEl.querySelectorAll('.perf-card').forEach((c) => {
      const key = c.dataset.slug;
      if (selected.has(key)) c.dataset.selected = '1';
      else c.removeAttribute('data-selected');
      const cb = c.querySelector && c.querySelector('.card-checkbox');
      if (cb) {
        try {
          if (selected.has(key)) cb.classList.add('checked'); else cb.classList.remove('checked');
          cb.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
        }
        catch (_) {}
      }
    });
    updateButtons();
    try { console.log(`[Tags:updateSelectionUI] end size=${selected.size}`); }
    catch(_) { }
  }
  function normKey(obj) {
    // Prefer the exact tag name to distinguish case variants (e.g., 'vintage' vs 'Vintage')
    // Fallback to slug only if name is missing
    return (obj && obj.name) ? String(obj.name) : (obj.slug || _slugify(obj.name || ''));
  }
  function toggleSelect(slug, opts = { range: false, anchor: false }) {
  try { console.log(`[Tags:toggleSelect] before slug="${slug}" size=${selected.size} range=${!!opts.range} anchor=${!!opts.anchor} shiftAnchor=${shiftAnchor??''}`); }
  catch(_) { }
    if (opts.range && shiftAnchor) {
      const arr = tags;
      const idxA = arr.findIndex((t) => normKey(t) === shiftAnchor);
      const idxB = arr.findIndex((t) => normKey(t) === slug);
      if (idxA > -1 && idxB > -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        for (let i = start; i <= end; i++) selected.add(normKey(arr[i]));
        updateSelectionUI();
        try { console.log(`[Tags:toggleSelect] range-add start=${Math.min(idxA, idxB)} end=${Math.max(idxA, idxB)} size=${selected.size}`); }
        catch(_) { }
        return;
      }
    }
    if (selected.has(slug)) selected.delete(slug);
    else selected.add(slug);
  if (opts.anchor) shiftAnchor = slug;
    updateSelectionUI();
    try { console.log(`[Tags:toggleSelect] after slug="${slug}" size=${selected.size} shiftAnchor=${shiftAnchor??''}`); }
    catch(_) { }
  }
  function openLibraryForTag(tagObj) {
    try {
  const slug = normKey(tagObj);
      // Use human-readable tag name for filters/URL (parity with performers)
      // Fallback to slug only if name is missing
      const name = (tagObj && tagObj.name) ? String(tagObj.name) : slug;
      libraryTagFilters = [name];
      try { setLocalStorageJSON('filters.tags', libraryTagFilters); }
      catch (_) { }
      const libTab = document.querySelector('[data-tab="library"]');
      if (libTab) libTab.click();
      if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
      if (typeof loadLibrary === 'function') loadLibrary();
      if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
    }
    catch (_) { }
  }
  function handleCardClick(e, tagObj) {
    const slug = normKey(tagObj);
    // If the name link was clicked, let that handler navigate
    const a = e.target && e.target.closest && e.target.closest('a');
    if (a) return; // separate handler will navigate
    // Click behavior: open Library for this tag by default; use modifiers to select for merge
    if (e.shiftKey) return toggleSelect(slug, { range: true });
    if (e.metaKey || e.ctrlKey) return toggleSelect(slug, { anchor: true });
    openLibraryForTag(tagObj);
  }
  function handleCardKey(e, tagObj) {
    const slug = normKey(tagObj);
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      toggleSelect(slug, { anchor: true });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      openLibraryForTag(tagObj);
    }
  }
  function render() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    if (!tags.length) {
      const node = tpl('emptyHintTemplate');
      if (node) {
        const el = node.querySelector('.empty-hint');
        if (el) el.textContent = 'No tags found.';
        gridEl.appendChild(node);
      }
    }
    else {
      tags.forEach((t) => {
        const node = tpl('tagCardTemplate');
        if (!node) return;
  const card = node.querySelector('.perf-card');
  const sel = node.querySelector('.card-checkbox');
        const nameEl = node.querySelector('.pc-name');
        const countEl = node.querySelector('.pc-count');
        if (nameEl) {
          // Make tag name a link to Library filtered by tag
          try {
            nameEl.textContent = '';
            const a = document.createElement('a');
            const slug = t.slug || _slugify(t.name || '');
            const href = new URL(window.location.pathname, window.location.origin);
            // Use display name in URL for consistency with performers
            href.searchParams.set('tags', t.name || slug);
            a.href = href.toString();
            a.textContent = t.name;
            a.addEventListener('click', (ev) => { ev.preventDefault(); openLibraryForTag(t); });
            nameEl.appendChild(a);
          }
          catch (_) { nameEl.textContent = t.name; }
        }
        if (countEl) {
          const c = Number(t.count || 0);
          countEl.textContent = String(c);
          countEl.title = `${c} file${c === 1 ? '' : 's'}`;
        }
        if (card) {
          const key = (t && t.name) ? String(t.name) : (t.slug || _slugify(t.name || ''));
          card.dataset.slug = key;
          if (selected.has(key)) card.dataset.selected = '1'; else card.removeAttribute('data-selected');
          card.tabIndex = 0;
          if (sel) {
            try {
              sel.setAttribute('role', 'checkbox');
              sel.setAttribute('tabindex', '0');
              sel.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
            }
            catch (_) {}
            if (selected.has(key)) sel.classList.add('checked'); else sel.classList.remove('checked');
            sel.addEventListener('click', (ev) => {
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
          card.ondblclick = () => openLibraryForTag(t);
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
      page = curPage;
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
      console.error(e);
    }
  }
  const debounceSearch = debounce(fetchTags, 400);
  function wireEvents() {
    if (searchEl && !searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', () => {
        searchTerm = searchEl.value.trim();
        page = 1;
        debounceSearch();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          searchTerm = '';
          page = 1;
          fetchTags();
        }
      });
    }
    // Rename wiring
    if (renameBtn && !renameBtn._wired) {
      renameBtn._wired = true;
      renameBtn.addEventListener('click', () => {
        if (selected.size !== 1) return;
        const oldName = Array.from(selected)[0];
        openRenameModal(oldName);
      });
    }
    if (renamePanel && !renamePanel._wired) {
      renamePanel._wired = true;
      const onInput = () => {
        if (!renameConfirmBtn || !renameInput) return;
        const can = !!renameInput.value.trim();
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
      renamePanel.addEventListener('click', (e) => { if (e.target === renamePanel) closeRenameModal(); });
    }
    const sortSel = document.getElementById('tagSort');
    const sortOrderBtn = document.getElementById('tagSortOrder');
    if (sortSel && !sortSel._wired) {
      sortSel._wired = true;
      sortSel.addEventListener('change', async () => {
        sortBy = sortSel.value === 'name' ? 'name' : 'count';
        sortDir = (sortBy === 'name') ? -1 : 1;
        applySortButtonLabel();
        page = 1;
        await fetchTags();
      });
    }
    if (sortOrderBtn && !sortOrderBtn._wired) {
      sortOrderBtn._wired = true;
      applySortButtonLabel();
      sortOrderBtn.addEventListener('click', async () => {
        sortDir = sortDir === 1 ? -1 : 1;
        applySortButtonLabel();
        page = 1;
        await fetchTags();
      });
    }
    const handlePrev = async () => {
      if (page > 1) {
        page--;
        await fetchTags();
      }
    };
    const handleNext = async () => {
      page++;
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
    // Manual Add modal open/close
    function openManualModal() {
      if (!manualPanel) return;
      show(manualPanel);
      manualPanel.setAttribute('data-open', '1');
      document.addEventListener('keydown', escListener);
    }
    function closeManualModal() {
      if (!manualPanel) return;
      hide(manualPanel);
      manualPanel.removeAttribute('data-open');
      document.removeEventListener('keydown', escListener);
    }
    function escListener(e) {
      if (e.key === 'Escape') closeManualModal();
    }
    if (manualBtn && !manualBtn._wired) {
      manualBtn._wired = true;
      manualBtn.addEventListener('click', openManualModal);
    }
    if (manualPanel && !manualPanel._wired) {
      manualPanel._wired = true;
      const closeBtn = document.getElementById('tagManualClose');
      if (closeBtn) closeBtn.addEventListener('click', closeManualModal);
      // backdrop click to close
      manualPanel.addEventListener('click', (e) => {
        if (e.target === manualPanel) closeManualModal();
      });
    }
    const setManualStatus = (msg) => {
      if (manualStatus) manualStatus.textContent = msg || '';
    };
    const renderManualResults = (candidates, tagName) => {
      if (!manualResults) return;
      manualResults.innerHTML = '';
      if (!Array.isArray(candidates) || !candidates.length) {
        const div = document.createElement('div');
        div.className = 'hint-sm';
        div.textContent = 'No matches.';
        manualResults.appendChild(div);
        return;
      }
      const list = document.createElement('div');
      list.className = 'manual-results-list';
      const tpl = document.getElementById('manualTagRowTemplate');
      for (const c of candidates) {
        const node = tpl ? tpl.content.cloneNode(true) : null;
        if (!node) continue;
        const row = node.querySelector('.manual-result-row');
        const fileEl = node.querySelector('.file');
        const btn = node.querySelector('button.apply');
        if (fileEl) fileEl.textContent = c.file;
        if (btn) {
          btn.addEventListener('click', async () => {
            try {
              const url = `/api/media/tags/add?path=${encodeURIComponent(c.file)}&tag=${encodeURIComponent(tagName)}`;
              const r = await fetch(url, {method: 'POST'});
              if (!r.ok) throw new Error('Failed');
              btn.textContent = '✔';
              btn.disabled = true;
              needRefresh = true;
            }
            catch (_) {
              if (window.showToast) window.showToast('Apply failed', 'is-error');
            }
          });
        }
        list.appendChild(node);
      }
      manualResults.appendChild(list);
    };
    // Manual Preview
    if (manualPreviewBtn && !manualPreviewBtn._wired) {
      manualPreviewBtn._wired = true;
      manualPreviewBtn.addEventListener('click', async () => {
        const tagName = (manualName && manualName.value || '').trim();
        const patternsRaw = (manualPatterns && manualPatterns.value || '').trim();
        if (!tagName || !patternsRaw) {
          setManualStatus('Enter a tag name and at least one match string.');
          return;
        }
        const pats = patternsRaw
        .split(/[\r\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
        setManualStatus('Previewing…');
        try {
          const body = { path: null, recursive: true, tags: pats, use_registry_tags: false, limit: 500 };
          const r = await fetch('/api/autotag/preview', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
          const j = await r.json();
          const candidates = (j && j.data && j.data.candidates) || [];
          // Transform: we want to apply tagName to every candidate
          renderManualResults(candidates.map((c) => ({file: c.file})), tagName);
          setManualStatus(`${candidates.length} match${candidates.length === 1 ? '' : 'es'} found`);
        }
        catch (e) {
          setManualStatus('Preview failed');
        }
      });
    }
    // Manual Apply All
    if (manualApplyAllBtn && !manualApplyAllBtn._wired) {
      manualApplyAllBtn._wired = true;
      manualApplyAllBtn.addEventListener('click', async () => {
        const tagName = (manualName && manualName.value || '').trim();
        if (!tagName || !manualResults) return;
        const rows = manualResults.querySelectorAll('.manual-result-row');
        let ok = 0;
        for (const row of rows) {
          const file = row.querySelector('.file')?.textContent || '';
          const btn = row.querySelector('button.apply');
          if (!file || !btn || btn.disabled) continue;
          try {
            const url = `/api/media/tags/add?path=${encodeURIComponent(file)}&tag=${encodeURIComponent(tagName)}`;
            const r = await fetch(url, {method: 'POST'});
            if (!r.ok) throw new Error('fail');
            btn.textContent = '✔';
            btn.disabled = true;
            ok++;
            needRefresh = true;
          }
          catch (_) { }
        }
        if (window.showToast) window.showToast(`Applied to ${ok} file(s)`, 'is-success');
      });
    }
    // Close wiring handled above via tagManualClose and backdrop
    // Drop zone wiring (drag/drop and click-to-open)
    if (dropZone && !dropZone._wired) {
      dropZone._wired = true;
      // click, dblclick, keydown just open file input
      const openFile = () => {
        const fi = document.getElementById('tagImportFile');
        if (fi && typeof fi.click === 'function') {
          try {
            fi.click();
          }
          catch (_) { }
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
            try {
              out = await new Promise((r) => it.getAsString(r));
            }
            catch (_) { }
            if (out) return out;
          }
        }
        if (dt.files && dt.files.length) {
          for (const f of dt.files) {
            try {
              if (f.type.startsWith('text/') || /\.(txt|csv|json)$/i.test(f.name)) {
                out = await f.text();
                if (out) return out;
              }
            }
            catch (_) { }
          }
        }
        return out;
      }
      document.addEventListener('dragover', (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault(); e.stopPropagation();
        if (!over) {
          over = true;
          showHover();
        }
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      }, true);
      document.addEventListener('dragenter', (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault(); e.stopPropagation();
        over = true; showHover();
      }, true);
      document.addEventListener('dragleave', (e) => {
        if (!isPanelActive()) return;
        if (!over) return;
        over = false; clearHover();
      }, true);
      document.addEventListener('drop', async (e) => {
        if (!isPanelActive()) return;
        if (!wantsIntercept(e.dataTransfer)) return;
        e.preventDefault(); e.stopPropagation();
        over = false; clearHover();
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
          console.warn('tags drop failed', err);
          setStatus('Import failed', true);
          setTimeout(() => setStatus('', false), 1500);
        }
      }, true);
    }
    if (autoTagBtn && !autoTagBtn._wired) {
      autoTagBtn._wired = true;
      autoTagBtn.addEventListener('click', () => {
        try {
          const tasksTab = document.querySelector('[data-tab="tasks"]');
          if (tasksTab) tasksTab.click();
          setTimeout(() => {
            const el = document.getElementById('autotagTagsSection');
            if (el && el.scrollIntoView) {
              el.scrollIntoView({behavior: 'smooth', block: 'start'});
            }
          }, 60);
        }
        catch (_) { }
      });
    }
    const handlePageSizeChange = async (sel) => {
      const v = parseInt(sel.value, 10);
      if (Number.isFinite(v) && v > 0) {
        pageSize = v;
        if (pageSizeSel && pageSizeSel !== sel) pageSizeSel.value = String(v);
        if (pageSizeSelB && pageSizeSelB !== sel) pageSizeSelB.value = String(v);
        page = 1;
        await fetchTags();
      }
    };
    if (pageSizeSel && !pageSizeSel._wired) {
      pageSizeSel._wired = true;
      const ps = parseInt(pageSizeSel.value, 10);
      if (Number.isFinite(ps)) pageSize = ps;
      pageSizeSel.addEventListener('change', () => handlePageSizeChange(pageSizeSel));
    }
    if (pageSizeSelB && !pageSizeSelB._wired) {
      pageSizeSelB._wired = true;
      const psb = parseInt(pageSizeSelB.value, 10);
      if (Number.isFinite(psb)) pageSize = psb;
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
          try {
            e.target.value = '';
          }
          catch (_) { }
        }
      });
    }
    if (mergeBtn && !mergeBtn._wired) {
      mergeBtn._wired = true;
      mergeBtn.addEventListener('click', async () => {
        try { console.log(`[Tags:mergeBtn:click] size=${selected.size} selected=${Array.from(selected).join(',')}`); }
        catch(_) { }
        if (selected.size !== 2) {
          try { console.log('[Tags:mergeBtn:click] not-enough-selected'); }
        catch(_) { } return; }
        const arr = [...selected];
        // Show custom merge modal instead of prompt
        const a = arr[0];
        const b = arr[1];
        try { console.log(`[Tags:mergeBtn:click] opening-modal a="${a}" b="${b}"`); }
        catch(_) { }
        openMergeModal(a, b);
      });
    }
    // Wire Merge modal interactions once
    if (mergePanel && !mergePanel._wired) {
      mergePanel._wired = true;
      const escHandler = (e) => { if (e.key === 'Escape') closeMergeModal(); };
      mergePanel.addEventListener('click', (e) => { if (e.target === mergePanel) closeMergeModal(); });
      if (mergeCloseBtn) mergeCloseBtn.addEventListener('click', closeMergeModal);
      if (mergeCancelBtn) mergeCancelBtn.addEventListener('click', closeMergeModal);
      if (mergeIntoInput) {
        mergeIntoInput.addEventListener('input', () => {
          const v = (mergeIntoInput && mergeIntoInput.value || '').trim();
          if (mergeConfirmBtn) mergeConfirmBtn.disabled = !v;
          try { console.log(`[Tags:mergeModal:input] value="${v}" confirmDisabled=${mergeConfirmBtn ? mergeConfirmBtn.disabled : 'n/a'}`); }
          catch(_) { }
        });
        mergeIntoInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const can = (mergeConfirmBtn && !mergeConfirmBtn.disabled);
            try { console.log(`[Tags:mergeModal:keydown Enter] canConfirm=${!!can}`); }
            catch(_) { }
            if (can) mergeConfirmBtn.click();
          }
        });
      }
      if (mergeConfirmBtn) {
        mergeConfirmBtn.addEventListener('click', async () => {
          try {
            try { console.log(`[Tags:mergeModal:confirm:click] start size=${selected.size} selected=${Array.from(selected).join(',')}`); }
            catch(_) { }
            if (selected.size !== 2) {
              try { console.log('[Tags:mergeModal:confirm] wrong-selected-size'); }
            catch(_) { } closeMergeModal(); return; }
            const arr = [...selected];
            const intoName = (mergeIntoInput && mergeIntoInput.value.trim()) || '';
            if (!intoName) return;
            const fromName = arr.find((s) => s !== intoName) || arr[0];
            const url = `/api/registry/tags/merge?from_name=${encodeURIComponent(fromName)}&into_name=${encodeURIComponent(intoName)}`;
            try { console.log(`[Tags:mergeModal:confirm] request url=${url} from="${fromName}" into="${intoName}"`); }
            catch(_) { }
            const r = await fetch(url, {method: 'POST'});
            try { console.log(`[Tags:mergeModal:confirm] response ok=${r.ok} status=${r.status}`); }
            catch(_) { }
            if (!r.ok) throw new Error('Merge failed');
            if (window.showToast) window.showToast(`Merged '${fromName}' into '${intoName}'`, 'is-success');
            closeMergeModal();
            selected.clear();
            needRefresh = true;
            await fetchTags();
          }
          catch (err) {
            try { console.warn(`[Tags:mergeModal:confirm] error ${err && err.message ? err.message : err}`); }
            catch(_) { }
            if (window.showToast) window.showToast(err.message || 'Merge failed', 'is-error');
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
          for (const slug of Array.from(selected)) {
            const name = slugToName(slug);
            await fetch('/api/registry/tags/delete', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name})});
          }
          selected.clear();
          needRefresh = true;
          await fetchTags();
          if (window.showToast) window.showToast('Deleted', 'is-success');
        }
        catch (_) {
          if (window.showToast) window.showToast('Delete failed', 'is-error');
        }
      });
    }
  }
  async function doRenameConfirm() {
    if (!renameInput) return;
    const oldName = Array.from(selected)[0] || '';
    const newName = (renameInput.value || '').trim();
    try { console.log(`[Tags:renameConfirm] old="${oldName}" new="${newName}"`); }
    catch(_) { }
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
        try { console.log(`[Tags:renameConfirm] error ${msg}`); }
        catch(_) { }
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
    page = page || 1;
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
      console.groupCollapsed('All tags (name, count)');
      try {
        console.table(rows);
      }
      catch (_) {
        console.log(rows);
      }
      console.log(`Total tags: ${total}, total file refs across tags: ${sum}`);
      console.groupEnd();
    }
    catch (e) {
      console.warn('Failed to retrieve all tags', e);
    }
  }
  function debugMerge(a = 'Vintage', b = 'vintage') {
    try {
      console.log('[Tags:debugMerge] attempting to open modal', { a, b });
      initDom();
      ensureControlsVisible();
      openMergeModal(a, b);
    }
    catch (e) { console.warn('[Tags:debugMerge] failed', e); }
  }
  function debugState() {
    try {
      const btn = typeof mergeBtn !== 'undefined' ? mergeBtn : document.getElementById('tagMergeBtn');
      const del = typeof deleteBtn !== 'undefined' ? deleteBtn : document.getElementById('tagDeleteBtn');
      const panel = typeof mergePanel !== 'undefined' ? mergePanel : document.getElementById('tagMergeModal');
      console.log('[Tags:debugState]', {
        selected: Array.from(selected || []),
        mergeDisabled: btn ? btn.disabled : undefined,
        deleteDisabled: del ? del.disabled : undefined,
        hasPanel: !!panel,
        panelHidden: panel ? panel.hidden : undefined
      });
    }
    catch (e) { console.warn('[Tags:debugState] failed', e); }
  }
  return {show: showTags, logAll, debugMerge, debugState};
})();
window.Tags = Tags;
// Hook tab switch to load tags when opened
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-tab="tags"]');
  if (!btn) return;
  try {
    if (window.Tags) window.Tags.show();
  }
  catch (_) { }
});
window.addEventListener('tabchange', (ev) => {
  const active = ev && ev.detail && ev.detail.activeTab;
  if (active === 'tags' && window.Tags) {
    setTimeout(() => window.Tags && window.Tags.show(), 30);
  }
});
// Direct load on #tags
try {
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (hash === 'tags' && window.Tags) {
    setTimeout(() => window.Tags && window.Tags.show(), 50);
  }
}
catch (_) { }
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
        try {
          fi.click();
        }
        catch (_) { }
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

// Fallback: ensure the Tags "Add…" button opens the manual modal even if module wiring hasn't run yet
(function ensureTagManualAddButtonClick() {
  function wire() {
    const btn = document.getElementById('tagManualAddBtn');
    const modal = document.getElementById('tagManualModal');
    const closeBtn = document.getElementById('tagManualClose');
    if (!btn || !modal || btn._directClick) return;
    btn._directClick = true;
    btn.addEventListener('click', () => {
      try {
        show(modal);
      }
      catch (_) { }
    });
    if (closeBtn && !closeBtn._directClick) {
      closeBtn._directClick = true;
      closeBtn.addEventListener('click', () => {
        try {
          hide(modal);
        }
        catch (_) { }
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, {once: true});
  }
  else {
    wire();
  }
})();
// Tasks System
class TasksManager {
  constructor () {
    this.jobs = new Map();
    this.coverage = {};
    this.orphanFiles = [];
    this._lastRepairPreview = [];
    this._repairStreamController = null;
    // Capabilities loaded from /config
    this.capabilities = {
      ffmpeg: true,
      ffprobe: true,
      subtitles_enabled: true,
      faces_enabled: true,
    };
    // Multi-select filters: empty set means "no filtering" (show all). User can narrow by toggling cards.
    // This also ensures completed / failed history is visible immediately on first load.
    this.activeFilters = new Set();
    this._jobRows = new Map();
    // id -> tr element for stable rendering
    this.init();
  }
  init() {
    this.initEventListeners();
    // SSE job events deferred until /config confirms capability (prevents 404 noise)
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
    // Wire browser faces button (idempotent)
    setTimeout(() => this.wireBrowserFacesButton(), 0);
    // Fetch server defaults, then hydrate option inputs (with local overrides) & add validation/tooltips
    setTimeout(() => this.loadDefaultsAndHydrate(), 0);
    // Persist changes on any option input change
    setTimeout(() => this.wireOptionPersistence(), 0);
    // One-shot early jobs fetch: if any active jobs exist, surface Tasks tab immediately
    this._initialActiveCheck();
    // Local elapsed time updater: refresh end-time (elapsed) display every second while viewing Tasks
    if (!this._elapsedTimer) {
      this._elapsedTimer = setInterval(() => {
        try {
          const activeTab = window.tabSystem && window.tabSystem.getActiveTab ? window.tabSystem.getActiveTab() : null;
          if (activeTab === 'tasks') {
            this.updateRunningVisuals();
          }
        }
        catch (_) { /* ignore */ }
      }, 1000);
    }
    // Initialize pause/resume controls
    setTimeout(() => this.initPauseResumeControls(), 0);
  }
  async _initialActiveCheck() {
    try {
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
        // Open tasks tab so queue is visible
        try {
          window.tabSystem.switchToTab('tasks');
        }
        catch (_) { }
      }
      // Update display immediately so user sees queue without waiting for first interval tick
      if (Array.isArray(jobs) && jobs.length) {
        this.updateJobsDisplay(jobs);
        const stats = j?.data?.stats;
        if (stats) this.updateJobStats(stats);
      }
      // Kick one immediate poll (non-blocking) to ensure freshness
      try {
        this.refreshJobs();
      }
      catch (_) { }
    }
    catch (_) { }
  }
  async loadConfigAndApplyGates() {
    try {
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
        // Now that we know if SSE exists, decide whether to attach
        if (window.__JOBS_SSE_ENABLED && feats.jobs_sse && !window.__JOBS_SSE_UNAVAILABLE) {
          this.initJobEvents();
        }
        else {
          window.__JOBS_SSE_UNAVAILABLE = true;
        }
        this.capabilities.subtitles_enabled = Boolean(
          caps.subtitles_enabled ?? true,
        );
        this.capabilities.faces_enabled = Boolean(caps.faces_enabled ?? true);
        // Expose for other modules (Player badge actions)
        try {
          window.__capabilities = { ...this.capabilities};
        }
        catch (_) { }
      }
    }
    catch (_) { }
    this.applyCapabilityGates();
    // Re-evaluate and wire browser faces button when caps are known
    this.wireBrowserFacesButton();
    this.updateCapabilityBanner();
  }
  canRunOperation(op) {
    // Accept full op (e.g., "thumbnails-missing") or base (e.g., "thumbnails")
    const base = String(op || '').replace(/-(all|missing)$/, '');
    const caps = this.capabilities || {};
    const needsFfmpeg = new Set([
      'thumbnails',
      'previews',
      'sprites',
      'markers',
      'heatmaps',
      'phash',
    ]);
    if (needsFfmpeg.has(base)) return Boolean(caps.ffmpeg);
    if (base === 'subtitles') return Boolean(caps.subtitles_enabled);
    if (base === 'faces' || base === 'embed') return Boolean(caps.faces_enabled);
    // metadata and others default to allowed
    return true;
  }
  async loadDefaultsAndHydrate() {
    try {
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
      try {
        saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      }
      catch (_) { }
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
        thumbnails: {offset: 'thumbnailOffset' },
        sprites: {interval: 'spriteInterval', width: 'spriteWidth', cols: 'spriteCols', rows: 'spriteRows', quality: 'spriteQuality' },
        previews: {segments: 'previewSegments', duration: 'previewDuration', width: 'previewWidth' },
        phash: {frames: 'phashFrames', algorithm: 'phashAlgo' },
  markers: {threshold: 'sceneThreshold', limit: 'sceneLimit' },
        heatmaps: {interval: 'heatmapInterval', mode: 'heatmapMode', png: 'heatmapPng' },
        subtitles: {model: 'subtitleModel', language: 'subtitleLang' },
        faces: {interval: 'faceInterval', min_size_frac: 'faceMinSize', backend: 'faceBackend', scale_factor: 'faceScale', min_neighbors: 'faceMinNeighbors', sim_thresh: 'faceSimThresh' },
        embed: {interval: 'embedInterval', min_size_frac: 'embedMinSize', backend: 'embedBackend', sim_thresh: 'embedSimThresh' },
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
    catch (_) {
      // Silently ignore;
      // UI will use baked-in defaults
    }
  }
  wireOptionPersistence() {
    const LS_KEY = 'mediaPlayer:artifactOptions';
    let cache = {};
    try {
      cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
    }
    catch (_) { }
    const persist = () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
      }
      catch (_) { }
    };
  const sel = '#spritesOptions input, #previewsOptions input, #thumbnailsOptions input, #phashOptions select, #phashOptions input, #markersOptions input, #heatmapsOptions input, #heatmapsOptions select, #subtitlesOptions select, #subtitlesOptions input, #facesOptions input, #facesOptions select, #embedOptions input, #embedOptions select';
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
      faceInterval: 'Seconds between sampled frames for face detection.',
      faceMinSize: 'Minimum face bounding box size as a fraction of frame dimension.',
      faceScale: 'Scale factor for cascade / detector; lower detects more, slower.',
      faceMinNeighbors: 'Min neighbors (cascade) to keep a detection; higher = stricter.',
      faceSimThresh: 'Similarity threshold when clustering deduplicated faces.',
      embedSimThresh: 'Similarity threshold for re-embedding / clustering.',
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
      'sceneThreshold',
      'sceneLimit',
      'heatmapInterval',
      'thumbnailOffset',
      'faceInterval',
      'faceMinSize',
      'faceScale',
      'faceMinNeighbors',
      'faceSimThresh',
      'embedInterval',
      'embedMinSize',
      'embedSimThresh',
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
      disableIf('[data-operation="thumbnails-missing"], [data-operation="thumbnails-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="previews-missing"], [data-operation="previews-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="sprites-missing"], [data-operation="sprites-all"]', true, 'Disabled: FFmpeg not detected');
  disableIf('[data-operation="markers-missing"], [data-operation="markers-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="heatmaps-missing"], [data-operation="heatmaps-all"]', true, 'Disabled: FFmpeg not detected');
      disableIf('[data-operation="phash-missing"], [data-operation="phash-all"]', true, 'Disabled: FFmpeg not detected');
      // Player badges
  ['badgeHeatmap', 'badgeScenes', 'badgeSprites', 'badgePreview', 'badgePhash'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = true;
          el.title = 'Disabled: FFmpeg not detected';
        }
      });
    }
    // Subtitles
    if (!caps.subtitles_enabled) {
      disableIf(
        '[data-operation="subtitles-missing"], [data-operation="subtitles-all"]',
        true,
        'Disabled: no subtitles backend available',
      );
      const el = document.getElementById('badgeSubtitles');
      if (el) {
        el.disabled = true;
        el.title = 'Disabled: no subtitles backend available';
      }
    }
    // Faces/Embeddings
    if (!caps.faces_enabled) {
      disableIf('[data-operation="faces-missing"], [data-operation="faces-all"]', true, 'Disabled: face backends not available');
      disableIf('[data-operation="embed-missing"], [data-operation="embed-all"]', true, 'Disabled: face backends not available');
      const bf = document.getElementById('badgeFaces');
      if (bf) {
        bf.disabled = true;
        bf.title = 'Disabled: face backends not available';
      }
    }
    // Browser-side faces button gating: requires FaceDetector OR a server path to compute embeddings may still work
    const fb = document.getElementById('facesBrowserBtn');
    if (fb) {
      const hasFD = 'FaceDetector' in window && typeof window.FaceDetector === 'function';
      // We require either FaceDetector availability (client) AND at least one embedding path on server (ffmpeg or faces backend)
      const serverOk = Boolean(caps.ffmpeg) || Boolean(caps.faces_enabled);
      fb.disabled = !(hasFD && serverOk);
      fb.title = fb.disabled ? !hasFD ? 'Disabled: FaceDetector API not available in this browser' : 'Disabled: no server embedding path available' : 'Detect faces in your browser and upload';
    }
  }
  updateCapabilityBanner() {
    const caps = this.capabilities || {};
    const issues = [];
    const facesMsg = 'Face backends unavailable — face detection and embeddings are disabled.';
    if (!caps.ffmpeg) {
      issues.push(
  'FFmpeg not detected — thumbnails, previews, sprites, markers, heatmaps, and pHash are disabled.',
      );
    }
    if (!caps.subtitles_enabled) {
      issues.push('Subtitles backend unavailable — subtitles generation is disabled.',
      );
    }
    if (!caps.faces_enabled) {
      issues.push(facesMsg);
    }
    let banner = document.getElementById('capabilityBanner');
    // Where to insert: top of the tasks panel container
    const tasksPanel = document.getElementById('tasks-panel');
    const container = tasksPanel ? tasksPanel.querySelector('.tasks-container') : null;
    if (!container) return;
    // If the only issue is faces, suppress the banner entirely (we still gate actions);
    // advanced users can enable faces later without being nagged.
    const facesOnly = issues.length === 1 && issues[0] === facesMsg;
    if (facesOnly) {
      if (banner) banner.remove();
      return;
    }
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
    // Add a small dismiss control. If only faces warning, persist the dismissal; otherwise hide once.
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn btn-link btn-dismiss';
    dismiss.textContent = 'Dismiss';
    dismiss.style.marginLeft = '0.5rem';
    dismiss.addEventListener('click', () => {
      try {
        if (facesOnly) localStorage.setItem('mediaPlayer:dismissFacesNotice', '1');
      }
      catch (_) { /* ignore */ }
      banner.remove();
    });
    banner.appendChild(dismiss);
  }
  initJobEvents() {
    // New approach: avoid any preflight fetches that can 404. Attempt primary EventSource;
    // on immediate failure, try alias once.
    if (window.__JOBS_SSE_UNAVAILABLE) return;
    const primary = '/jobs/events';
    const fallback = '/api/jobs/events';
    const throttle = 400;
    const attach = (url, isFallback) => {
      let es;
      try {
        es = new EventSource(url);
      }
      catch (_) {
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
        try {
          const payload = JSON.parse(e.data);
          if (payload.event) doRefresh();
        }
        catch (_) { }
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
        try {
          if (evt && evt.data) {
            const payload = JSON.parse(evt.data);
            const art = (payload.artifact || '').toLowerCase();
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
                  try {
                    window.__activeArtifactSpinners?.delete?.(`${file}::${art}`);
                  }
                  catch (_) { }
                  // Refresh statuses to flip ✓ quickly
                  try {
                    loadArtifactStatuses?.();
                  }
                  catch (_) { }
                  // If a thumbnail job just finished for the currently open file, refresh sidebar thumbnail immediately.
                  if (art === 'thumbnail') {
                    (async () => {
                      try {
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
                      }
                      catch (_) { }
                    })();
                  }
                }
              }
            }
          }
        }
        catch (_) { }
        doRefresh();
      }));
      es.onopen = () => {
        if (typeof this._onJobEventsConnected === 'function') {
          this._onJobEventsConnected();
        }
      };
      let triedFallback = false;
      es.onerror = () => {
        // If primary fails very early, attempt fallback exactly once.
        if (!isFallback && !triedFallback && es.readyState === EventSource.CLOSED) {
          triedFallback = true;
          try {
            es.close();
          }
          catch (_) { }
          attach(fallback, true);
          return;
        }
        try {
          es.close();
        }
        catch (_) { }
        window.__JOBS_SSE_UNAVAILABLE = true;
        try {
          localStorage.setItem('jobs:sse', 'off');
        }
        catch (_) { }
      };
      this._jobEventSource = es;
      return true;
    };
    // Try primary;
    // if it throws synchronously, attempt fallback.
    if (!attach(primary, false)) {
      attach(fallback, true);
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
      // Load stats lazily when the stats tab is shown
      if (e.detail.activeTab === 'stats') {
        try {
          if (typeof loadStats === 'function') loadStats();
        }
        catch (_) { }
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
  // Wire facesBrowserBtn to run browser detection on the currently open video
  wireBrowserFacesButton() {
    const btn = document.getElementById('facesBrowserBtn');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      try {
        // Switch to player tab if needed so the user can see progress and allow playback controls
        // Suppress implicit tab switch;
        // user will already be on Player when meaningful.
        // if (window.tabSystem && window.tabSystem.getActiveTab() !== 'player') window.tabSystem.switchToTab('player');
        // Delegate to Player module
        if (window.Player && typeof window.Player.detectAndUploadFacesBrowser === 'function') {
          await window.Player.detectAndUploadFacesBrowser();
        }
        else {
          this.showNotification(
            'Player not ready for browser detection.',
            'error',
          );
        }
      }
      catch (e) {
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
      const r = await fetch(url, {headers: {Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pl = await r.json();
      const file = (pl?.data?.files || [])[0];
      if (!file || !file.path) {
        this.showNotification('No videos found in this folder to preview.', 'error');
        return;
      }
      const path = file.path;
      // Ensure heatmap exists;
      // try a GET probe;
      // if missing, trigger create and poll briefly
  const headUrl = new URL('/api/heatmaps', window.location.origin);
      headUrl.searchParams.set('path', path);
      let ok = false;
      for (let i = 0; i < 10; i++) {
        // ~10 quick tries
        const h = await fetch(headUrl.toString(), {method: 'HEAD' });
        if (h.status === 200) {
          ok = true;
          break;
        }
        // Trigger creation once at the beginning
        if (i === 0) {
          const createUrl = new URL('/api/heatmaps/create', window.location.origin);
          createUrl.searchParams.set('path', path);
          createUrl.searchParams.set('interval', String(parseFloat(document.getElementById('heatmapInterval')?.value || '5.0')));
          createUrl.searchParams.set('mode', document.getElementById('heatmapMode')?.value || 'both');
          createUrl.searchParams.set('png', 'true');
          try {
            await fetch(createUrl, {method: 'POST' });
          }
          catch (_) { }
        }
        await new Promise((res) => setTimeout(res, 300));
      }
      if (!ok) {
        this.showNotification('Heatmap PNG not ready yet.', 'error');
        return;
      }
      // Show modal
  const imgUrl = new URL('/api/heatmaps', window.location.origin);
      imgUrl.searchParams.set('path', path);
      imgModalImage.src = imgUrl.toString() + `&t=${Date.now()}`;
      show(imgModal);
    }
    catch (e) {
      this.showNotification('Failed to preview heatmap.', 'error');
    }
  }
  async handleBatchOperation(operation) {
    try {
      // Derive base operation and mode from the button's data-operation value
      let base = String(operation || '').trim();
      let mode = 'missing';
      let isClear = false;
      if (base.endsWith('-missing')) {
        base = base.replace(/-missing$/, '');
        mode = 'missing';
      }
      else if (base.endsWith('-all')) {
        base = base.replace(/-all$/, '');
        mode = 'all';
      }
      else if (base.endsWith('-clear')) {
        base = base.replace(/-clear$/, '');
        isClear = true;
        mode = 'clear';
      }
      // Capability gate (skip for clear which only deletes existing files)
      if (!isClear && !this.canRunOperation(base)) {
        const why = base === 'subtitles' ? 'No subtitles backend available.' : base === 'faces' || base === 'embed' ? 'Face backends unavailable.' : 'FFmpeg not detected.';
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
      if (isClear) {
        if (confirmDeletesEnabled) {
          const confirmed = confirm(`Clear all ${base} artifacts? This cannot be undone.`);
          if (!confirmed) return;

        }
        // Attempt scoped clear if selected-only chosen and supported
        try {
          // Map frontend artifact keys to backend delete endpoints
          const endpointMap = {
            thumbnails: '/api/thumbnail', // (if batch not supported this will be per-file later)
            previews: '/api/preview',
            sprites: '/api/sprites/delete',
            phash: '/api/phash',
            heatmaps: '/api/heatmaps/delete',
            metadata: '/api/metadata/delete',
            subtitles: '/api/subtitles/delete/batch', // batch variant
            scenes: '/api/markers/clear',
            faces: '/api/faces/delete',
            // embeddings live in faces.json; reuse faces delete endpoint for clear
            embed: '/api/faces/delete',
          };
          const mapped = endpointMap[base] || `/api/artifacts/${base}`;
          const clearUrl = new URL(mapped, window.location.origin);
          const selPaths = fileSelection === 'selected' ? Array.from(selectedItems || []) : null;
          let resp;
          if (selPaths && selPaths.length) {
            resp = await fetch(clearUrl.toString(), {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({paths: selPaths}),
            });
          }
          else {
            resp = await fetch(clearUrl.toString(), {method: 'DELETE' });
          }
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          this.showNotification(`${base} cleared`, 'success');
          await this.loadCoverage();
        }
        catch (e) {
          this.showNotification(`Failed to clear ${base}: ${(e && e.message) || e}`, 'error');
        }
        return;
        // Done
      }
      else {
        const params = this.getOperationParams(base) || {};
        if (mode === 'all') {
          params.force = true;
          params.overwrite = true;
        }
        const payload = {
          operation: base,
          mode: mode,
          fileSelection: fileSelection,
          params: params,
          path: rel,
        };
        // When scoping to selected files, include explicit selected paths so the server can filter
        if (fileSelection === 'selected' && selectedItems && selectedItems.size) {
          try {
            payload.selectedPaths = Array.from(selectedItems);
          }
          catch (_) { /* ignore */ }
        }
        const response = await fetch('/api/tasks/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        let result;
        if (!response.ok) {
          let detail = '';
          try {
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const j = await response.json();
              detail = j.message || j.error || JSON.stringify(j);
            }
            else {
              detail = (await response.text()).slice(0, 4000);
            }
          }
          catch (_) { }
          throw new Error(`HTTP ${response.status}${detail ? ': ' + detail : ''}`);
        }
        else {
          try {
            result = await response.json();
          }
          catch (parseErr) {
            throw new Error('Invalid JSON response');
          }
        }
        if (result.status === 'success') {
          this.showNotification(`Started ${base} (${mode}) for ${result.data.fileCount} files`, 'success');
          // Ensure job queue is visible immediately after starting a batch generation
          try {
            if (window.tabSystem && window.tabSystem.switchToTab) {
              window.tabSystem.switchToTab('tasks');
            }
          }
          catch (_) { }
          this.refreshJobs();
          this.loadCoverage();
        }
        else {
          throw new Error(result.message || 'Operation failed');
        }
      }
    }
    catch (error) {
      console.error('Batch operation failed:', {operation, error});
      this.showNotification(`Failed to start ${operation}: ${error.message}`, 'error');
    }
  }
  // Wire Generate All button: queue all missing artifacts in fast-first order
  wireGenerateAll() {
    const btn = document.getElementById('generateAllBtn');
    if (!btn) return;
    if (btn._wired) return;
    btn._wired = true;
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
      ].filter((op) => this.canRunOperation(op));
      if (ops.length === 0) {
        this.showNotification(
          'No compatible operations available. Check the Tools notice above.',
          'error',
        );
        return;
      }
      btn.disabled = true;
      btn.classList.add('btn-busy');
      try {
        for (const op of ops) {
          await this.handleBatchOperation(op);
          await new Promise((r) => setTimeout(r, 80));
        }
        this.showNotification('Queued all missing artifacts (fast-first).', 'success');
      }
      catch (e) {
        this.showNotification('Failed to queue one or more operations.', 'error');
      }
      finally {
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
    if (generateBtn) showAs(generateBtn, 'block');
    if (recomputeBtn) hide(recomputeBtn);
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
      params.rows = document.getElementById('spriteRows')?.value || 10;
      params.quality = document.getElementById('spriteQuality')?.value || 4;
      break;
      case 'previews':
      params.segments = document.getElementById('previewSegments')?.value || 9;
      params.duration = document.getElementById('previewDuration')?.value || 1.0;
      params.width = document.getElementById('previewWidth')?.value || 320;
      break;
      case 'heatmaps':
      params.interval = parseFloat(document.getElementById('heatmapInterval')?.value || '5.0');
      // Accept legacy 'both' plus new modes
      params.mode = document.getElementById('heatmapMode')?.value || 'both';
      // Use checkbox to control PNG generation (default true)
      params.png = document.getElementById('heatmapPng')?.checked !== false;
      break;
      case 'subtitles': {
        params.model = document.getElementById('subtitleModel')?.value || 'small';
        const langVal = (document.getElementById('subtitleLang')?.value || '').trim();
        params.language = langVal || 'auto';
        // translate option not exposed in UI;
        // default false
        params.translate = false;
        break;
      }
  case 'markers':
      params.threshold = parseFloat(document.getElementById('sceneThreshold')?.value || '0.4');
      params.limit = parseInt(document.getElementById('sceneLimit')?.value || '0', 10);
      break;
      case 'faces':
      params.interval = parseFloat(document.getElementById('faceInterval')?.value || '1.0');
      params.min_size_frac = parseFloat(document.getElementById('faceMinSize')?.value || '0.10');
      // Advanced tunables (parity with legacy FaceLab)
      params.backend = document.getElementById('faceBackend')?.value || 'auto';
      // Only some backends use these;
      // harmless to pass through
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
        // Single source of truth for both the tiles and the jobs table
        this.coverage = data.data.coverage;
        this._coverageLoaded = true;
        // Update tiles first, then ensure jobs table re-renders so the synthetic metadata row
        // reflects the same percentage concurrently.
        this.updateCoverageDisplay();
        try {
          if (typeof this.renderJobsTable === 'function') {
            this.renderJobsTable();
          }
        }
        catch (_) { }
        try {
          if (currentPath) refreshSidebarThumbnail(currentPath);
        }
        catch (_) { }
      }
    }
    catch (error) {
      // Quiet failure during polling
    }
    // Load orphan data
    await this.loadOrphanData();
  }
  updateCoverageDisplay() {
    // If coverage not loaded yet, keep buttons hidden
    if (!this._coverageLoaded) return;
    const artifacts = [
      'metadata',
      'thumbnails',
      'sprites',
      'previews',
  'phash',
  'markers',
      'heatmaps',
      'subtitles',
      'faces',
    ];
    artifacts.forEach((artifact) => {
      const data = this.coverage[artifact] || {
        processed: 0,
        missing: 0,
        total: 0,
      };
      const percentage = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
      // Update percentage
      const percentageEl = document.getElementById(`${artifact}Coverage`);
      if (percentageEl) {
        // Show actual ratio (processed/total) plus percentage for clarity
        const processed = data.processed || 0;
        const total = data.total || 0;
        const ratio = `${processed}/${total}`;
        // Format: "X/Y (Z%)";
        // if total is 0 keep previous style
        if (total > 0) {
          percentageEl.textContent = `${ratio} (${percentage}%)`;
        }
        else {
          percentageEl.textContent = `${ratio} (0%)`;
        }
        // Add attributes for potential future styling / tooltips
        percentageEl.dataset.processed = String(processed);
        percentageEl.dataset.total = String(total);
        percentageEl.title = `Processed ${processed} of ${total} (${percentage}%)`;
      }
      // Update progress bar
      const fillEl = document.getElementById(`${artifact}Fill`);
      if (fillEl) {
        fillEl.style.width = `${percentage}%`;
      }
      // Adaptive single-button behavior:
      // 0% => Generate All, partial => Generate Missing, 100% => Clear All
      const genMissingBtn = document.querySelector(`[data-operation="${artifact}-missing"]`);
      const recomputeAllBtn = document.querySelector(`[data-operation="${artifact}-all"]`);
      const clearBtn = document.querySelector(`[data-operation="${artifact}-clear"]`);
      [genMissingBtn, recomputeAllBtn, clearBtn].forEach((b) => {
        if (!b) return;
        b.classList.add('hidden');
        b.classList.remove('btn-danger');
        b.removeAttribute('data-state');
      });
      let active = null;
      const processed = data.processed || 0;
      const total = data.total || 0;
      if (total === 0 || processed === 0) {
        active = recomputeAllBtn || genMissingBtn || clearBtn;
        if (active) {
          active.textContent = 'Generate All';
          active.title = 'Generate all artifacts';
          if (!active.dataset.operation.endsWith('-all')) {
            active.dataset.operation = `${artifact}-all`;
          }
          active.dataset.state = 'all';
        }
      }
      else if (processed > 0 && processed < total) {
        active = genMissingBtn || recomputeAllBtn || clearBtn;
        if (active) {
          active.textContent = 'Generate Missing';
          active.title = 'Generate only missing artifacts';
          if (!active.dataset.operation.endsWith('-missing')) {
            active.dataset.operation = `${artifact}-missing`;
          }
          active.dataset.state = 'missing';
        }
      }
      else if (processed >= total) {
        active = clearBtn || recomputeAllBtn || genMissingBtn;
        if (active) {
          active.textContent = 'Clear All';
          active.title = 'Delete all generated artifacts';
          if (!active.dataset.operation.endsWith('-clear')) {
            active.dataset.operation = `${artifact}-clear`;
          }
          active.classList.add('btn-danger');
          active.dataset.state = 'clear';
        }
      }
      if (active) {
        active.classList.remove('hidden', 'd-none');
        // Metadata uses same adaptive control: Generate All -> Generate Missing -> Clear All
      }
    });
    // Mirror faces coverage to embeddings UI (embeddings share faces.json presence)
    const facesData = this.coverage.faces || {processed: 0, total: 0};
    const embedProcessed = facesData.processed || 0;
    const embedTotal = facesData.total || 0;
    const embedPct = embedTotal > 0 ? Math.round((embedProcessed / embedTotal) * 100) : 0;
    const embedPctEl = document.getElementById('embedCoverage');
    const embedFillEl = document.getElementById('embedFill');
    if (embedPctEl) embedPctEl.textContent = `${embedPct}%`;
    if (embedFillEl) embedFillEl.style.width = `${embedPct}%`;
    const embedGen = document.querySelector('[data-operation="embed-missing"]');
    const embedRe = document.querySelector('[data-operation="embed-all"]');
    const embedClear = document.querySelector('[data-operation="embed-clear"]');
    [embedGen, embedRe, embedClear].forEach((b) => {
      if (!b) return;
      b.classList.add('hidden');
      b.classList.remove('btn-danger');
      b && b.removeAttribute('data-state');
    });
    let embedActive = null;
    if (embedTotal === 0 || embedProcessed === 0) {
      embedActive = embedRe || embedGen || embedClear;
      if (embedActive) {
        embedActive.textContent = 'Generate All';
        if (!embedActive.dataset.operation.endsWith('-all')) {
          embedActive.dataset.operation = 'embed-all';
        }
        embedActive.dataset.state = 'all';
      }
    }
    else if (embedProcessed > 0 && embedProcessed < embedTotal) {
      embedActive = embedGen || embedRe || embedClear;
      if (embedActive) {
        embedActive.textContent = 'Generate Missing';
        if (!embedActive.dataset.operation.endsWith('-missing')) {
          embedActive.dataset.operation = 'embed-missing';
        }
        embedActive.dataset.state = 'missing';
      }
    }
    else if (embedProcessed >= embedTotal) {
      embedActive = embedClear || embedRe || embedGen;
      if (embedActive) {
        embedActive.textContent = 'Clear All';
        if (!embedActive.dataset.operation.endsWith('-clear')) {
          embedActive.dataset.operation = 'embed-clear';
        }
        embedActive.classList.add('btn-danger');
        embedActive.dataset.state = 'clear';
      }
    }
    if (embedActive) {
      embedActive.classList.remove('hidden', 'd-none');
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
        return data.data.jobs;
      }
    }
    catch (error) { }
    return null;
  }
  updateJobsDisplay(jobs) {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    const activeTab = window.tabSystem && window.tabSystem.getActiveTab ? window.tabSystem.getActiveTab() : null;
    const tabIsTasks = activeTab === 'tasks';
    let sawActive = false;
    // Update internal job cache and keep existing rows when possible (reduce thrash)
    const now = Date.now();
    const ids = new Set();
    for (const job of jobs) {
      ids.add(job.id);
      this.jobs.set(job.id, job);
      if (!tabIsTasks) {
        const st = (job.state || '').toLowerCase();
        if (st === 'running' || st === 'queued' || st === 'pending' || st === 'starting') {
          sawActive = true;
        }
      }
    }
    // Remove rows for jobs not present anymore (skip synthetic rows)
    for (const [id, tr] of Array.from(this._jobRows.entries())) {
      if (!ids.has(id)) {
        if (tr && tr.dataset && tr.dataset.synthetic === '1') continue;
        if (tr && tr.parentElement) tr.parentElement.removeChild(tr);
        this._jobRows.delete(id);
        this.jobs.delete(id);
      }
    }
    // Also purge any stale entries in the jobs map that never had rows (e.g., filtered out),
    // so stats like Errored count reflect the current server state immediately.
    for (const id of Array.from(this.jobs.keys())) {
      if (!ids.has(id)) {
        this.jobs.delete(id);
      }
    }
    // Render/update visible rows
    this.renderJobsTable();
    // Ensure container height expands if it was measured before rows existed
    this.ensureJobTableShowsSomeRows();
    // Enable/disable Clear Completed based on whether any completed jobs exist
    const hasClearable = jobs.some((j) => {
      const s = this.normalizeStatus(j);
      return s === 'completed' || s === 'failed' || s === 'canceled';
    });
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn) {
      if (hasClearable) show(clearBtn);
      else hide(clearBtn);
      // Adjust button label depending on composition (pure canceled vs mixed)
      if (hasClearable) {
        const hasNonCanceled = jobs.some((j) => {
          const s = this.normalizeStatus(j);
          return s === 'completed' || s === 'failed';
        });
        clearBtn.textContent = hasNonCanceled ? 'Clear Finished' : 'Clear Canceled';
      }
    }
    const failedEl = document.getElementById('failedJobsCount');
    if (failedEl) failedEl.textContent = jobs.filter((j) => j.status === 'failed').length;
    if (sawActive && !tabIsTasks && window.tabSystem && window.tabSystem.switchToTab) {
      try {
        window.tabSystem.switchToTab('tasks');
      }
      catch (_) { }
    }
    // Artifact spinner reconciliation: keep sidebar badge spinners active while related jobs are queued/running
    try {
      window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
      // Build quick lookup of active job states by (path, artifact)
      const activeStates = new Set();
      // Resolve currently open file path once for comparisons
      const activePath = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : (window.currentPath || currentPath));
      // Helper: normalize backend artifact names to sidebar badge keys
      const normArt = (k) => {
        if (!k) return '';
        k = String(k).toLowerCase();
  if (k === 'previews' || k === 'preview') return 'preview';
        if (k === 'thumbnails' || k === 'covers' || k === 'cover' || k === 'thumb' || k === 'thumbs') return 'thumbnail';
        if (k === 'heatmap' || k === 'heatmaps') return 'heatmaps';
        return k;
      };
      for (const job of jobs) {
        const st = (job.state || '').toLowerCase();
        const isActive = st === 'running' || st === 'queued' || st === 'pending' || st === 'starting';
        if (!isActive) continue;
        // Prefer explicit artifact field from backend; fallback to heuristic only if absent
        let artifact = normArt(job.artifact || '');
        if (!artifact) {
          const task = (job.task || '').toLowerCase();
          if (/scene/.test(task)) artifact = 'markers';
          else if (/sprite/.test(task)) artifact = 'sprites';
          else if (/preview/.test(task)) artifact = 'preview';
          else if (/heatmap/.test(task)) artifact = 'heatmaps';
          else if (/subtitle|caption/.test(task)) artifact = 'subtitles';
          else if (/face/.test(task)) artifact = 'faces';
          else if (/phash/.test(task)) artifact = 'phash';
          else if (/meta/.test(task)) artifact = 'metadata';
          else if (/cover|thumb/.test(task)) artifact = 'thumbnail';
        }
        if (!artifact) continue;
        const path = job.target || job.file || job.path || '';
        if (!path) continue;
        // Only reflect spinner for the currently open file
        if (!activePath || path !== activePath) continue;
        const key = `${path}::${artifact}`;
        activeStates.add(key);
        if (!window.__activeArtifactSpinners.has(key)) {
          window.__activeArtifactSpinners.set(key, {
            path: path,
            artifact: artifact,
            since: Date.now(),
            manual: false,
          });
          setArtifactSpinner(artifact, true);
        }
        else {
          // Ensure spinner is shown (in case user reloaded mid-job)
          setArtifactSpinner(artifact, true);
        }
      }
      // Clear spinners for keys no longer active (job finished) after verifying artifact presence or job terminal state
      for (const [key, rec] of Array.from(window.__activeArtifactSpinners.entries())) {
        if (activeStates.has(key)) continue; // still active
        const {artifact, path} = rec;
        // Determine if job ended: absence from active set means ended; hide spinner.
        setArtifactSpinner(artifact, false);
        window.__activeArtifactSpinners.delete(key);
        // Optionally refresh statuses lazily (cheap fetch) only for recently ended artifacts
        try {
          if (path === activePath) {
            // Only refresh statuses for currently open file to reduce noise
            loadArtifactStatuses?.();
          }
        }
        catch (_) { }
      }
    }
    catch (_) { /* silent spinner reconciliation errors */ }
  }
  renderJobsTable() {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    const all = Array.from(this.jobs.values());
    // Aggregate metadata jobs into a single synthetic row with progress based on coverage
    let forRender = all;
    try {
      const metaJobs = all.filter((j) => (j.artifact || '').toLowerCase() === 'metadata' || /meta/.test((j.task || '').toLowerCase()));
      if (metaJobs && metaJobs.length) {
        const anyRunning = metaJobs.some((j) => this.normalizeStatus(j) === 'running');
        const anyQueued = metaJobs.some((j) => this.normalizeStatus(j) === 'queued');
        const active = anyRunning || anyQueued;
        if (active) {
          // Compute progress from coverage if available
          const cov = (this.coverage && this.coverage.metadata) ? this.coverage.metadata : {processed: 0, total: 0};
          const processed = Number(cov.processed || 0);
          const total = Number(cov.total || 0);
          const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
          const createdTime = metaJobs.reduce((acc, j) => Math.min(acc || Infinity, j.createdTime || Infinity), Infinity);
          const startTime = metaJobs.reduce((acc, j) => Math.min(acc || Infinity, j.startTime || Infinity), Infinity);
          const synthetic = {
            id: '__meta_aggregate',
            task: 'Metadata (batch)',
            file: '',
            status: anyRunning ? 'running' : 'queued',
            progress: pct,
            createdTime: Number.isFinite(createdTime) ? createdTime : 0,
            startTime: Number.isFinite(startTime) ? startTime : 0,
            totalRaw: total,
            processedRaw: processed,
            artifact: 'metadata',
            _synthetic: true,
          };
          forRender = all.filter((j) => !metaJobs.includes(j)).concat([synthetic]);
        }
        else {
          // When not active, hide metadata per-file rows (they tend to be noisy)
          forRender = all.filter((j) => !metaJobs.includes(j));
        }
      }
    }
    catch (_) { /* ignore aggregation errors */ }
    // Filtering policy: when NO toggles are selected, show NO rows.
    // Selecting any toggle(s) displays only jobs whose normalized status matches a selected toggle.
    // (Reversed from prior behavior where empty selection meant "show all").
    let visible = [];
    if (this.activeFilters && this.activeFilters.size > 0) {
      visible = forRender.filter((j) => this.activeFilters.has(this.normalizeStatus(j)));
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
      const tb = b.startTime || b.endedTime || b.createdTime || 0;
      const ta = a.startTime || a.endedTime || a.createdTime || 0;
      return tb - ta;
    });
    // Build/update rows
    const seen = new Set();
    for (const job of visible) {
      seen.add(job.id);
      let tr = this._jobRows.get(job.id);
      if (!tr) {
        tr = this.createJobRow(job);
        if (job._synthetic) {
          tr.dataset.synthetic = '1';
        }
        this._jobRows.set(job.id, tr);
      }
      else {
        // Update existing row fields
        this.updateJobRow(tr, job);
      }
      // Always append in the current sorted order;
      // this moves existing rows
      tbody.appendChild(tr);
    }
    // Hide rows that don't match filter
    for (const [id, tr] of this._jobRows.entries()) {
      if (!seen.has(id)) hide(tr);
      else show(tr);
    }
    this.updateRunningVisuals();
    // Toggle action buttons based on current state
    const clearBtn = document.getElementById('clearCompletedBtn');
    const cancelQueuedBtn = document.getElementById('cancelQueuedBtn');
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (clearBtn) {
      const hasFinished = Array.from(this.jobs.values()).some((j) => {
        const s = this.normalizeStatus(j);
        return s === 'completed' || s === 'failed' || s === 'canceled';
      });
      if (hasFinished) showAs(clearBtn, 'inline-block');
      else hide(clearBtn);
      if (hasFinished) {
        const hasNonCanceled = Array.from(this.jobs.values()).some((j) => {
          const s = this.normalizeStatus(j);
          return s === 'completed' || s === 'failed';
        });
        clearBtn.textContent = hasNonCanceled ? 'Clear Finished' : 'Clear Canceled';
      }
    }
    if (cancelQueuedBtn) {
      const hasQueued = Array.from(this.jobs.values()).some(
        (j) => (j.status || '') === 'queued',
      );
      if (hasQueued) showAs(cancelQueuedBtn, 'inline-block');
      else hide(cancelQueuedBtn);
    }
    if (cancelAllBtn) {
      const hasAny = Array.from(this.jobs.values()).some(
        (j) => (j.status || '') === 'queued' || (j.status || '') === 'running',
      );
      if (hasAny) showAs(cancelAllBtn, 'inline-block');
      else hide(cancelAllBtn);
    }
    // Clamp container height to content so it never grows beyond the table needs
    const container = document.getElementById('jobTableContainer');
    if (container) {
      const table = container.querySelector('table');
      if (table) {
        const maxContent = table.scrollHeight + 8;
        // small padding
        const current = container.getBoundingClientRect().height;
        if (current > maxContent) {
          container.style.height = maxContent + 'px';
        }
      }
    }
  }
  updateRunningVisuals(jobs) {
    // Add animated stripes to each running job's progress bar
    const rows = document.querySelectorAll('#jobTableBody tr');
    rows.forEach((tr, idx) => {
      const id = tr?.dataset?.jobId;
      const job = id ? this.jobs.get(id) : null;
      const status = job ? this.normalizeStatus(job) : '';
      const isPaused = Boolean(job && job.paused);
      const bar = tr.querySelector('.job-progress');
      if (bar) {
        bar.classList.toggle('running', status === 'running' && !isPaused);
      }
      // End time / elapsed updater
      const endCell = tr.querySelector('.cell-time-end');
      const startCell = tr.querySelector('.cell-time-start');
      if (endCell && startCell) {
        if (status === 'running' && !isPaused) {
          const startTs = (job?.startTime || job?.createdTime || 0) * 1000;
          if (startTs) {
            const ms = Date.now() - startTs;
            const sec = Math.max(0, Math.floor(ms / 1000));
            // Reuse fmtTime if available on window; otherwise show mm:ss
            let text = '';
            try {
              if (typeof window.fmtTime === 'function') {
                text = window.fmtTime(sec);
              }
              else {
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                text = `${m}:${String(s).padStart(2, '0')}`;
              }
            }
            catch (_) { /* no-op */ }
            endCell.textContent = text;
            endCell.title = 'Elapsed time';
          }
          else {
            endCell.textContent = '—';
          }
        }
        else if (status === 'completed' || status === 'failed' || status === 'canceled') {
          const endTs = (job?.endedTime || job?.endTime || 0) * 1000;
          if (endTs) {
            try {
              endCell.textContent = new Date(endTs).toLocaleTimeString();
              endCell.title = 'End time';
            }
            catch (_) {
              endCell.textContent = '—';
            }
          }
          else {
            endCell.textContent = '—';
          }
        }
        else {
          endCell.textContent = '—';
        }
      }
    });
  }
  // Map internal status keys to user-facing labels that match the filter toggle cards
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
    if (typeof status === 'string' && status.length) return status.charAt(0).toUpperCase() + status.slice(1);
    return '';
  }
  createJobRow(job) {
    const tpl = document.getElementById('jobRowTemplate');
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.jobId = job.id;
    this.updateJobRow(row, job);
    return row;
  }
  updateJobRow(row, job) {
    const status = this.normalizeStatus(job);
    const isQueued = status === 'queued';
    const tstamp = isQueued ? (job.createdTime || 0) : (job.startTime || job.createdTime || 0);
    const startTime = tstamp ? new Date(tstamp * 1000).toLocaleTimeString() : 'N/A';
    const baseName = (p) => (p || '').split('/').filter(Boolean)
    .pop() || '';
    const fileName = baseName(job.target) || baseName(job.file);
    const startCell = row.querySelector('.cell-time-start');
    if (startCell) {
      startCell.textContent = startTime;
      if (isQueued) startCell.title = 'Enqueued time';
      else startCell.title = startTime && startTime !== 'N/A' ? 'Start time' : '';
    }
    const endCell = row.querySelector('.cell-time-end');
    if (endCell) {
      if (status === 'running') {
        // Will be filled by updateRunningVisuals timer as elapsed
        endCell.textContent = '0:00';
        endCell.title = 'Elapsed time';
      }
      else if (status === 'completed' || status === 'failed' || status === 'canceled') {
        const endTs = (job.endedTime || job.endTime || 0) * 1000;
        endCell.textContent = endTs ? new Date(endTs).toLocaleTimeString() : '—';
        endCell.title = endTs ? 'End time' : '';
      }
      else {
        endCell.textContent = '—';
        endCell.title = '';
      }
    }
    row.querySelector('.cell-task').textContent = job.task;
    const fileCell = row.querySelector('.cell-file');
    fileCell.textContent = fileName;
    fileCell.title = job.target || job.file || '';
    // Status
    const statusEl = row.querySelector('.job-status');
    const pauseDot = row.querySelector('.job-paused-dot');
    const isPaused = Boolean(job.paused);
    statusEl.className = 'job-status ' + (isPaused && status === 'queued' ? 'paused' : status);
    statusEl.textContent = isPaused && status === 'queued' ? 'Paused' : this.displayStatusLabel(status);
    if (pauseDot) {
      if (isPaused && status === 'queued') pauseDot.hidden = false;
      else pauseDot.hidden = true;
    }
    // Progress: prefer server-provided value;
    // only fall back to raw counters when missing
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
    // Queued shows 0% normally; allow synthetic rows to display their computed pct
    if (status === 'queued' && !job._synthetic) pct = 0;
    if (status === 'completed') pct = 100;
    const bar = row.querySelector('.job-progress-fill');
    // Canceled explicitly shows 0% and "Canceled"
    if (status === 'canceled') {
      bar.style.width = '0%';
    }
    else {
      // For synthetic rows, always reflect computed pct; otherwise keep queued at 0%
      bar.style.width = ((status !== 'queued' || job._synthetic) ? pct : 0) + '%';
    }
    // For synthetic rows, prefer percentage text even when queued
    const pctEl = row.querySelector('.pct');
    if (job._synthetic) {
      pctEl.textContent = status === 'canceled' ? 'Canceled' : `${pct}%`;
    }
    else {
      if (isPaused && status === 'queued') {
        pctEl.textContent = 'Paused';
      }
      else {
        pctEl.textContent = status === 'queued' ? 'Queued' : status === 'completed' ? '100%' : status === 'canceled' ? 'Canceled' : `${pct}%`;
      }
    }

    /*
    const fname = row.querySelector(".fname");
    // Show the target path when available for non-queued states
    const targetPath = job && typeof job.target === "string" && job.target ? job.target : "";
    fname.textContent = status === "queued" ? "" : targetPath || "";
    */
    // Action
    const action = row.querySelector('.cell-action');
    action.innerHTML = '';
    if (status === 'running') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    }
    else if (status === 'queued') {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = 'Cancel';
      btn.addEventListener('click', () => this.cancelJob(job.id));
      action.appendChild(btn);
    }
    else if (status === 'canceled') {
      // No actions for canceled
    }
    else if (status === 'failed') {
      // Click row to view error details
      const errText = job && job.error ? String(job.error) : '';
      if (errText) {
        row.style.cursor = 'pointer';
        row.title = 'Click to view error details';
        row.addEventListener('click', () => this.showErrorModal(errText, job), {
          once: true,
        });
      }
    }
  }
  initJobQueueResizer() {
    const container = document.getElementById('jobTableContainer');
    const handle = document.getElementById('jobResizeHandle');
    if (!container || !handle) return;
    // Avoid double wiring
    if (handle._wired) return;
    handle._wired = true;
    // Clear any lingering max-height from older logic
    container.style.maxHeight = '';
    let startY = 0;
    let startHeight = 0;
    const MIN = 120;
    // minimum usable height
    const contentMax = () => {
      const table = container.querySelector('table');
      if (!table) return window.innerHeight - 160;
      // scrollHeight of table (plus small padding)
      return Math.min(table.scrollHeight + 8, window.innerHeight - 160);
    };
    const clamp = (h) => {
      const max = contentMax();
      return Math.min(Math.max(h, MIN), max);
    };
    const onMove = (e) => {
      const dy = e.clientY - startY;
      const newH = clamp(startHeight + dy);
      container.style.height = newH + 'px';
      container.style.overflow = 'auto';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-job-table');
    };
    handle.addEventListener('mousedown', (e) => {
      // Only left button
      if (e.button !== 0) return;
      startY = e.clientY;
      startHeight = container.getBoundingClientRect().height;
      container._userResized = true;
      // mark explicit user intent
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.classList.add('resizing-job-table');
      e.preventDefault();
    });
    // Double-click: auto-fit height to show all current visible rows (up to viewport cap)
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const rows = Array.from(document.querySelectorAll('#jobTableBody tr'))
      .filter((r) => r.style.display !== 'none');
      const table = container.querySelector('table');
      if (!rows.length || !table) return;
      const headerExtra = 42;
      // header + padding approximation
      const sample = rows.find((r) => r.offsetParent !== null) || rows[0];
      const rh = sample.getBoundingClientRect().height || 28;
      const desired = Math.min(window.innerHeight - 160, table.scrollHeight + 8, (rh * rows.length) + headerExtra);
      container.style.height = desired + 'px';
      container.style.overflow = 'auto';
      // Mark as user resized (so auto heuristics stop fighting it)
      container._userResized = true;
    });
    // Responsive safety: if window shrinks below chosen height, clamp down
    window.addEventListener('resize', () => {
      const rect = container.getBoundingClientRect();
      container.style.height = clamp(rect.height) + 'px';
    });
    // Auto adjust after initial job render (allow full content if small)
    setTimeout(() => {
      const table = container.querySelector('table');
      if (!table) return;
      const desired = clamp(table.scrollHeight + 8);
      container.style.height = desired + 'px';
    }, 50);
  }
  // Ensure that after changing filters (or initial render) the job table is tall enough to show a few rows
  ensureJobTableShowsSomeRows() {
    const container = document.getElementById('jobTableContainer');
    if (!container) return;
    // Respect explicit user resizing unless container is extremely small (<100px)
    if (container._userResized && container.getBoundingClientRect().height > 100) return;
    const rows = Array.from(document.querySelectorAll('#jobTableBody tr'))
    .filter((r) => r.style.display !== 'none');
    if (!rows.length) return;
    // nothing to show
    const sample = rows.find((r) => r.offsetParent !== null) || rows[0];
    const rh = sample.getBoundingClientRect().height || 28;
    const wantRows = Math.min(rows.length, 4);
    // show up to 4 rows if available
    // Extra for header + padding
    const baseExtra = 42;
    const desired = (rh * wantRows) + baseExtra;
    const current = container.getBoundingClientRect().height;
    // Compute max allowed similar to resizer logic
    const table = container.querySelector('table');
    const contentHeight = table ? table.scrollHeight + 8 : desired;
    const viewportCap = window.innerHeight - 160;
    const cap = Math.min(contentHeight, viewportCap);
    if (current + 6 < desired) {
      container.style.height = Math.min(desired, cap) + 'px';
    }
  }
  // Normalize backend status to UI status names
  normalizeStatus(job) {
    // Prefer explicit status, fallback to state (backend may expose either)
    let s = (job.status || job.state || '').toLowerCase();
    // If backend uses 'done', treat as completed when not actually failed
    if (s === 'done') s = 'completed';
    // Treat 'restored' (used on restore or when queue is paused) as queued for filtering/display
    if (s === 'restored') s = 'queued';
    // Surface explicit error field as failed regardless of state label
    if (job.error) return 'failed';
    // Hover / other jobs may embed result.status (ok | partial | failed)
    const resultStatus = (job.result && (job.result.status || job.result.state)) ? (job.result.status || job.result.state).toLowerCase() : null;
    if (resultStatus === 'failed') return 'failed';
    // Treat 'partial' as failed for visibility (until/if UI adds distinct styling)
    if (resultStatus === 'partial') return 'failed';
    if (s === 'failed') return 'failed';
    if (s === 'canceled') return 'canceled';
    if (s === 'running') return 'running';
    if (s === 'queued' || s === 'pending' || s === 'starting') return 'queued';
    if (s === 'completed') return 'completed';
    return s || 'unknown';
  }
  showErrorModal(message, job) {
    const modal = document.getElementById('errorModal');
    if (!modal) {
      throw new Error('errorModal element missing');
    }
    const pre = modal.querySelector('#errorModalText');
    if (!pre) {
      throw new Error('errorModalText element missing');
    }
    pre.textContent = message || 'Unknown error';
    show(modal);
  }
  updateJobStats(stats) {
    // Recompute ALL counters locally based on the jobs currently loaded.
    // Requirement: counts reflect everything that "shows up in the list" (i.e., jobs payload),
    // not a time-windowed subset like completedToday.
    const jobs = Array.from(this.jobs.values());
    const norm = (j) => this.normalizeStatus(j);
    const activeCount = jobs.filter((j) => norm(j) === 'running').length;
    const queuedCount = jobs.filter((j) => norm(j) === 'queued').length;
    const completedCount = jobs.filter((j) => norm(j) === 'completed').length;
    const failedCount = jobs.filter((j) => norm(j) === 'failed').length;
    const activeEl = document.getElementById('activeJobsCount');
    const queuedEl = document.getElementById('queuedJobsCount');
    const completedEl = document.getElementById('completedJobsCount');
    const failedEl = document.getElementById('failedJobsCount');
    if (activeEl) activeEl.textContent = activeCount;
    if (queuedEl) queuedEl.textContent = queuedCount;
    if (completedEl) completedEl.textContent = completedCount;
    if (failedEl) failedEl.textContent = failedCount;
  }
  async cancelJob(jobId) {
    try {
      const response = await fetch(`/api/tasks/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          this.showNotification('Job canceled', 'success');
          this.refreshJobs();
        }
      }
      else {
        throw new Error('Failed to cancel job');
      }
    }
    catch (error) {
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
      }
      else {
        countEl.textContent = '0';
      }
    }
  }
  startJobPolling() {
    // Adaptive polling with passive mode while tasks tab hidden
    const FAST = 1500;
    const PASSIVE = 6000;
    const SLOW = 15000;
    const MAX_BACKOFF = 60000;
    if (this._jobPollTimer) clearInterval(this._jobPollTimer);
    this._jobPollInFlight = this._jobPollInFlight || {jobs: false, coverage: false};
    this._jobPollFailures = 0;
    let passiveMode = true;
    // until user views tasks or active job causes auto-switch
    let currentInterval = PASSIVE;
    const restartTimer = (ms) => {
      if (!Number.isFinite(ms) || ms <= 0) return;
      if (ms === currentInterval && this._jobPollTimer) return;
      currentInterval = ms;
      if (this._jobPollTimer) clearInterval(this._jobPollTimer);
      this._jobPollTimer = setInterval(tick, currentInterval);
    };
    const doPoll = async () => {
      const activeTab = tabSystem && tabSystem.getActiveTab ? tabSystem.getActiveTab() : null;
      const tabIsTasks = activeTab === 'tasks';
      // Skip overlap
      if (this._jobPollInFlight.jobs || this._jobPollInFlight.coverage) return;
      try {
        this._jobPollInFlight.jobs = true;
        const jobs = await this.refreshJobs();
        if (!tabIsTasks && jobs && Array.isArray(jobs)) {
          const hasActive = jobs.some((j) => {
            const st = (j.state || '').toLowerCase();
            return st === 'running' || st === 'queued' || st === 'pending' || st === 'starting';
          });
          if (hasActive) {
            try {
              tabSystem.switchToTab('tasks');
              passiveMode = false;
              restartTimer(FAST);
            }
            catch (_) { }
          }
        }
      }
      catch (_) {
        this._jobPollFailures++;
      }
      finally {
        this._jobPollInFlight.jobs = false;
      }
      if (tabIsTasks) {
        passiveMode = false;
        try {
          this._jobPollInFlight.coverage = true;
          await this.loadCoverage();
        }
        catch (_) { /* ignore */ }
        finally {
          this._jobPollInFlight.coverage = false;
        }
        // Ensure we are in FAST mode while viewing tasks
        restartTimer(FAST);
      }
      // Backoff on repeated failures
      if (this._jobPollFailures >= 2) {
        const next = Math.min(currentInterval * 2, MAX_BACKOFF);
        restartTimer(next);
        this._jobPollFailures = 0;
        // apply once per adjustment
      }
      else if (!passiveMode && currentInterval !== FAST) {
        restartTimer(FAST);
      }
    };
    const tick = () => {
      doPoll();
    };
    this._jobPollTimer = setInterval(tick, currentInterval);
    // Wrap refreshJobs to adapt interval dynamically
    const origRefresh = this.refreshJobs.bind(this);
    this.refreshJobs = async (...args) => {
      const result = await origRefresh(...args);
      // Adjust timer if interval changed
      const activeTab = tabSystem && tabSystem.getActiveTab ? tabSystem.getActiveTab() : null;
      if (activeTab === 'tasks' && !passiveMode && currentInterval !== FAST) {
        restartTimer(FAST);
      }
      return result;
    };
    this._onJobEventsConnected = () => {
      // When SSE connected, relax to SLOW but only if user is on tasks tab (otherwise keep passive)
      if (!this._jobPollTimer) return;
      const activeTab = tabSystem && tabSystem.getActiveTab ? tabSystem.getActiveTab() : null;
      if (activeTab === 'tasks') {
        restartTimer(SLOW);
      }
    };
  }
  showNotification(message, type = 'info') {
    // Host container (idempotent)
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'success') el.classList.add('is-success');
    else if (type === 'error') el.classList.add('is-error');
    else el.classList.add('is-info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    el.textContent = message;
    host.appendChild(el);
    // Auto fade + remove
    const lifespan = 5000;
    const fadeMs = 250;
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), fadeMs + 30);
    }, lifespan - fadeMs);
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
    }
    catch (error) {
      // Quiet failure during polling
      // Reset display on error
      this.updateOrphanDisplay({orphaned: 0, orphaned_files: [] });
    }
  }
  updateOrphanDisplay(orphanData) {
    const orphanCount = orphanData.orphaned || 0;
    const orphanCountEl = document.getElementById('orphanCount');
    const cleanupBtn = document.getElementById('cleanupOrphansBtn');
    const previewBtn = document.getElementById('previewOrphansBtn');
    const previewRepairsBtn = document.getElementById('previewRepairsBtn');
    const orphanDetails = document.getElementById('orphanDetails');
    const orphanList = document.getElementById('orphanList');
    const orphanRenames = document.getElementById('orphanRenames');
    const orphanRenamesList = document.getElementById('orphanRenamesList');
    const applyRepairsBtn = document.getElementById('applyRepairsBtn');
    if (orphanCountEl) {
      orphanCountEl.textContent = orphanCount;
    }
    // Enable/disable buttons based on orphan count
    // Apply buttons are controlled by preview state; keep them hidden until preview is shown/completed
    if (cleanupBtn) {
      // Only enable when there are orphans AND the preview list is visible
      const previewVisible = !!document.getElementById('orphanDetails') && !document.getElementById('orphanDetails').classList.contains('d-none');
      cleanupBtn.disabled = orphanCount === 0 || !previewVisible;
      cleanupBtn.classList.toggle('d-none', !previewVisible);
    }
    if (previewBtn) {
      previewBtn.disabled = orphanCount === 0;
    }
    if (previewRepairsBtn) {
      previewRepairsBtn.disabled = orphanCount === 0;
    }
    if (applyRepairsBtn) {
      // Repairs apply button appears only after a repairs preview has completed at least one suggestion fetch
      const repairsVisible = !!document.getElementById('orphanRenames') && !document.getElementById('orphanRenames').classList.contains('d-none');
      // If visible but no preview items yet, keep disabled; display is handled in previewRepairs flow
      const hasPreviewItems = Array.isArray(this._lastRepairPreview) && this._lastRepairPreview.length > 0;
      applyRepairsBtn.disabled = orphanCount === 0 || !repairsVisible || !hasPreviewItems;
      applyRepairsBtn.classList.toggle('d-none', !repairsVisible);
    }
    // Store orphan data for preview
    this.orphanFiles = orphanData.orphaned_files || [];
    // If preview currently visible, refresh its contents
    if (orphanDetails && !orphanDetails.classList.contains('d-none') && orphanList) {
      // Rebuild orphan list using DOM nodes (avoid innerHTML)
      while (orphanList.firstChild) orphanList.removeChild(orphanList.firstChild);
      if (this.orphanFiles && this.orphanFiles.length) {
        const frag = document.createDocumentFragment();
        this.orphanFiles.forEach((file) => {
          const d = document.createElement('div');
          d.className = 'orphan-file';
          d.textContent = file;
          frag.appendChild(d);
        });
        orphanList.appendChild(frag);
      }
      else {
        const d = document.createElement('div');
        d.className = 'orphan-file empty';
        d.textContent = 'No orphaned files';
        orphanList.appendChild(d);
      }
    }
    // If repair preview visible and we have cached results, re-render
    if (orphanRenames && !orphanRenames.classList.contains('d-none') && orphanRenamesList) {
      this.renderRepairPreview();
    }
  }
  async previewOrphans() {
    const orphanDetails = document.getElementById('orphanDetails');
    const orphanList = document.getElementById('orphanList');
    if (!orphanDetails || !orphanList) return;
    const btn = document.getElementById('previewOrphansBtn');
    const isHidden = orphanDetails.classList.contains('d-none');
    if (isHidden) {
      // Show: populate orphanList using DOM nodes
      while (orphanList.firstChild) orphanList.removeChild(orphanList.firstChild);
      if (this.orphanFiles && this.orphanFiles.length) {
        const frag = document.createDocumentFragment();
        this.orphanFiles.forEach((file) => {
          const d = document.createElement('div');
          d.className = 'orphan-file';
          d.textContent = file;
          frag.appendChild(d);
        });
        orphanList.appendChild(frag);
      }
      else {
        const d = document.createElement('div');
        d.className = 'orphan-file empty';
        d.textContent = 'No orphaned files';
        orphanList.appendChild(d);
      }
      orphanDetails.classList.remove('d-none');
      orphanDetails.removeAttribute('hidden');
      if (btn) btn.textContent = 'Hide';
      // Reveal Apply Cleanup now that preview is visible
      const applyBtn = document.getElementById('cleanupOrphansBtn');
      if (applyBtn) {
        applyBtn.classList.remove('d-none');
        applyBtn.disabled = !this.orphanFiles || this.orphanFiles.length === 0;
      }
    }
    else {
      // Hide
      orphanDetails.classList.add('d-none');
      if (btn) btn.textContent = 'Preview';
      // Hide Apply Cleanup while preview is hidden
      const applyBtn = document.getElementById('cleanupOrphansBtn');
      if (applyBtn) {
        applyBtn.classList.add('d-none');
      }
    }
  }
  async cleanupOrphans() {
    if (!confirm(`Are you sure you want to delete ${this.orphanFiles.length} orphaned artifact files? This action cannot be undone.`)) {
      return;
    }
    try {
      // Use empty path to cleanup the current root directory
      const response = await fetch('/api/artifacts/cleanup?dry_run=false&keep_orphans=false', {method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'success') {
        this.showNotification('Cleanup started successfully', 'success');
        // Refresh orphan data after cleanup starts
        setTimeout(() => this.loadOrphanData(), 2000);
      }
      else {
        throw new Error(data.message || 'Cleanup failed');
      }
    }
    catch (error) {
      console.error('Failed to start cleanup:', error);
      this.showNotification('Failed to start cleanup: ' + error.message, 'error');
    }
  }
  async previewRepairs() {
    const renamesWrap = document.getElementById('orphanRenames');
    const renamesList = document.getElementById('orphanRenamesList');
    const btn = document.getElementById('previewRepairsBtn');
    if (!renamesWrap || !renamesList) return;
    const isHidden = renamesWrap.classList.contains('d-none');
    // Toggle off if open
    if (!isHidden) {
      // Abort any in-flight streaming request
      try { this._repairStreamController && this._repairStreamController.abort(); }
      catch (_) {}
      renamesWrap.classList.add('d-none');
      if (btn) btn.textContent = 'Preview Repairs';
      // Hide Apply Repairs when preview is hidden
      const applyBtn = document.getElementById('applyRepairsBtn');
      if (applyBtn) applyBtn.classList.add('d-none');
      return;
    }
    // Show container immediately and progressively stream results
    while (renamesList.firstChild) renamesList.removeChild(renamesList.firstChild);
    renamesWrap.classList.remove('d-none');
    renamesWrap.removeAttribute('hidden');
    this._lastRepairPreview = [];
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Computing… (0)'; }
      const controller = new AbortController();
      this._repairStreamController = controller;
      const streamUrl = '/api/artifacts/repair-preview/stream';
      const res = await fetch(streamUrl, { method: 'POST', signal: controller.signal });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let count = 0;
        // Ensure Apply Repairs stays hidden/disabled until we have results
        const applyBtn = document.getElementById('applyRepairsBtn');
        if (applyBtn) {
          applyBtn.classList.remove('d-none');
          applyBtn.disabled = true;
        }
        const appendItem = (it) => {
          try {
            const row = document.createElement('div');
            row.className = 'orphan-file';
            const from = String(it.from || '');
            const to = String(it.to || '');
            const conf = typeof it.confidence === 'number' ? Math.round(it.confidence * 100) : null;
            const confText = conf != null ? ` (${conf}%)` : '';
            row.textContent = `${from} → ${to}${confText}`;
            row.title = 'strategy: ' + (it.strategy || '');
            renamesList.appendChild(row);
          }
          catch (_) {}
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const s = line.trim();
            if (!s) continue;
            let msg = null;
            try { msg = JSON.parse(s); }
            catch (_) { continue; }
            if (!msg) continue;
            if (msg.type === 'item') {
              this._lastRepairPreview.push(msg);
              appendItem(msg);
              count += 1;
              if (btn) btn.textContent = `Computing… (${count})`;
              if (applyBtn) applyBtn.disabled = false;
            }
            else if (msg.type === 'progress') {
              if (btn && typeof msg.processed === 'number' && typeof msg.total === 'number') {
                btn.textContent = `Computing… (${count}/${msg.total})`;
              }
            }
            else if (msg.type === 'error') {
              console.error('repair-preview stream error:', msg.message);
            }
          }
        }
        // Flush any remaining buffered line
        if (buf.trim()) {
          try {
            const msg = JSON.parse(buf.trim());
            if (msg && msg.type === 'item') {
              this._lastRepairPreview.push(msg);
              appendItem(msg);
              count += 1;
            }
          }
          catch (_) {}
        }
        if (btn) btn.textContent = 'Hide Repairs';
        // Finalize Apply Repairs visibility/state
        const applyBtn2 = document.getElementById('applyRepairsBtn');
        if (applyBtn2) {
          applyBtn2.classList.remove('d-none');
          applyBtn2.disabled = !(Array.isArray(this._lastRepairPreview) && this._lastRepairPreview.length > 0);
        }
      }
      else {
        // Fallback to non-streaming request
        const url = '/api/artifacts/repair-preview';
        const r = await fetch(url, { method: 'POST' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const data = j && j.data ? j.data : {};
        const renamed = Array.isArray(data.renamed) ? data.renamed : [];
        this._lastRepairPreview = renamed;
        this.renderRepairPreview();
        if (btn) btn.textContent = 'Hide Repairs';
        const applyBtn = document.getElementById('applyRepairsBtn');
        if (applyBtn) {
          applyBtn.classList.remove('d-none');
          applyBtn.disabled = !(Array.isArray(renamed) && renamed.length > 0);
        }
      }
    }
    catch (err) {
      if (err && err.name === 'AbortError') {
        // silent on hide
      }
      else {
        console.error('Failed to preview repairs:', err);
        (this.showNotification || notify)('Failed to compute repair suggestions', 'error');
      }
    }
    finally {
      if (btn) btn.disabled = false;
      this._repairStreamController = null;
    }
  }
  async applyRepairs() {
    const btn = document.getElementById('applyRepairsBtn');
    const hadPreview = Array.isArray(this._lastRepairPreview) && this._lastRepairPreview.length > 0;
    const countHint = hadPreview ? ` (${this._lastRepairPreview.length} suggested moves)` : '';
    if (!confirm(`Apply artifact repairs now${countHint}?\n\nThis will move artifact files next to the best-matched media. Unmatched orphans will be kept.`)) {
      return;
    }
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Applying…'; }
      // Use cleanup endpoint in repair mode: perform moves, keep unmatched orphans
      // Hint the server to reuse the most recent preview to avoid recomputation
      const url = '/api/artifacts/cleanup?dry_run=false&keep_orphans=true&reassociate=true&local_only=true&use_preview=true';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j && j.status === 'success') {
        (this.showNotification || notify)('Repairs started', 'success');
        // Optionally collapse preview; refresh orphan data shortly after
        setTimeout(() => this.loadOrphanData && this.loadOrphanData(), 2000);
      }
      else {
        throw new Error(j && j.message ? j.message : 'Failed to start repairs');
      }
    }
    catch (err) {
      console.error('Failed to apply repairs:', err);
      (this.showNotification || notify)('Failed to apply repairs', 'error');
    }
    finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply Repairs'; }
    }
  }
  renderRepairPreview() {
    const renamesWrap = document.getElementById('orphanRenames');
    const renamesList = document.getElementById('orphanRenamesList');
    if (!renamesWrap || !renamesList) return;
    while (renamesList.firstChild) renamesList.removeChild(renamesList.firstChild);
    const items = Array.isArray(this._lastRepairPreview) ? this._lastRepairPreview : [];
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'orphan-file empty';
      d.textContent = 'No repair suggestions';
      renamesList.appendChild(d);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'orphan-file';
      const from = String(it.from || '');
      const to = String(it.to || '');
      const conf = typeof it.confidence === 'number' ? Math.round(it.confidence * 100) : null;
      const confText = conf != null ? ` (${conf}%)` : '';
      row.textContent = `${from} → ${to}${confText}`;
      row.title = 'strategy: ' + (it.strategy || '');
      frag.appendChild(row);
    }
    renamesList.appendChild(frag);
  }
}
// Initialize tasks manager when DOM is ready
let tasksManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    tasksManager = new TasksManager();
    try {
      window.tasksManager = tasksManager;
    }
    catch (_) { }
  });
}
else {
  // Script likely loaded with defer, DOM is ready;
  // safe to init now
  tasksManager = new TasksManager();
  try {
    window.tasksManager = tasksManager;
  }
  catch (_) { }
  const previewBtn = document.getElementById('previewOrphansBtn');
  const cleanupBtn = document.getElementById('cleanupOrphansBtn');
  const previewRepairsBtn = document.getElementById('previewRepairsBtn');
  const applyRepairsBtn = document.getElementById('applyRepairsBtn');
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
  if (previewRepairsBtn) {
    previewRepairsBtn.addEventListener('click', () => {
      if (tasksManager) {
        tasksManager.previewRepairs();
      }
    });
  }
  if (applyRepairsBtn) {
    applyRepairsBtn.addEventListener('click', () => {
      if (tasksManager) {
        tasksManager.applyRepairs();
      }
    });
  }
  // Heatmap preview button removed per redesign.
}
// -----------------------------
// Sidebar toggle: non-intrusive handle between sidebar and player
// -----------------------------
(function wireSidebarToggle() {
  const toggle = document.getElementById('sidebarToggle');
  const root = document.documentElement || document.body;
  const STORAGE_KEY = 'mediaPlayer:sidebarCollapsed';
  function isCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    }
    catch (_) {
      return false;
    }
  }
  function setCollapsed(v, save = true) {
    if (v) {
      root.classList.add('has-sidebar-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
    else {
      root.classList.remove('has-sidebar-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
      }
      catch (_) { }
    }
  }
  if (!toggle) return;
  // nothing to wire
  // initialize from storage
  setCollapsed(isCollapsed(), false);
  toggle.addEventListener('click', (e) => {
    const now = !root.classList.contains('has-sidebar-collapsed');
    setCollapsed(now, true);
    // small accessibility hint: focus the toggle after action
    toggle.focus();
  });
  // Allow keyboard toggle via Space/Enter when focused
  toggle.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle.click();
    }
  });
})();

// =============================================================
// Fire TV / Android TV Mode Support
// =============================================================
(function initFireTVMode() {
  const isFireTV = document.documentElement.classList.contains('firetv');
  if (!isFireTV) return;

  console.log('Fire TV mode activated');

  // Grid navigation state
  let currentFocusIndex = 0;
  let gridItems = [];
  let headerHideTimer = null;
  let lastActivityTime = Date.now();

  // Update grid items reference
  function updateGridItems() {
    gridItems = Array.from(document.querySelectorAll('.grid .card'));
    gridItems.forEach((item, index) => {
      item.setAttribute('tabindex', index === currentFocusIndex ? '0' : '-1');
    });
  }

  // Focus management
  function focusItem(index) {
    if (index < 0 || index >= gridItems.length) return;

    gridItems[currentFocusIndex]?.setAttribute('tabindex', '-1');
    currentFocusIndex = index;
    gridItems[currentFocusIndex]?.setAttribute('tabindex', '0');
    gridItems[currentFocusIndex]?.focus();
  }

  // Calculate grid dimensions for navigation
  function getGridDimensions() {
    if (!gridItems.length) return { cols: 0, rows: 0 };

    const container = document.querySelector('.grid');
    const containerRect = container.getBoundingClientRect();
    const firstItem = gridItems[0];
    const firstItemRect = firstItem.getBoundingClientRect();

    // Calculate approximate columns based on item width and container width
    const itemWidth = firstItemRect.width;
    const containerWidth = containerRect.width;
    const gap = 20; // From CSS
    const cols = Math.floor((containerWidth + gap) / (itemWidth + gap));

    return {
      cols: Math.max(1, cols),
      rows: Math.ceil(gridItems.length / cols)
    };
  }

  // Header auto-hide functionality
  function showHeader() {
    const header = document.querySelector('header');
    if (header) {
      header.classList.remove('hidden');
    }
  }

  function hideHeader() {
    const header = document.querySelector('header');
    if (header) {
      header.classList.add('hidden');
    }
  }

  function resetHeaderTimer() {
    lastActivityTime = Date.now();
    showHeader();

    clearTimeout(headerHideTimer);
    headerHideTimer = setTimeout(() => {
      if (Date.now() - lastActivityTime >= 3000) {
        hideHeader();
      }
    }, 3000);
  }

  // D-pad navigation
  function handleDPadNavigation(e) {
    if (!gridItems.length) return;
    // Don't steal keys while typing in inputs/textareas/selects/contenteditable
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) {
      return;
    }

    const { cols } = getGridDimensions();
    let newIndex = currentFocusIndex;

    switch (e.key) {
      case 'ArrowUp':
        newIndex = Math.max(0, currentFocusIndex - cols);
      break;
      case 'ArrowDown':
        newIndex = Math.min(gridItems.length - 1, currentFocusIndex + cols);
      break;
      case 'ArrowLeft':
        if (currentFocusIndex % cols !== 0) {
          newIndex = currentFocusIndex - 1;
        }
      break;
      case 'ArrowRight':
        if ((currentFocusIndex + 1) % cols !== 0 && currentFocusIndex + 1 < gridItems.length) {
          newIndex = currentFocusIndex + 1;
        }
      break;
      case 'Enter':
      case ' ':
        // Activate current item
        gridItems[currentFocusIndex]?.click();
      return;
      case 'Escape':
      case 'Backspace':
        // Exit focus mode: blur current item and reveal header
        try { gridItems[currentFocusIndex]?.blur(); }
        catch (_) {}
        showHeader();
      return;
      default:
      return;
    }

    if (newIndex !== currentFocusIndex) {
      e.preventDefault();
      focusItem(newIndex);
      resetHeaderTimer();
    }
  }

  // Initialize Fire TV mode
  function initializeFireTV() {
    // Set up initial grid state
    updateGridItems();

    // Focus first item if available
    if (gridItems.length > 0) {
      focusItem(0);
    }

    // Start header timer
    resetHeaderTimer();

    // Global keydown handler for D-pad navigation
    document.addEventListener('keydown', (e) => {
      resetHeaderTimer();
      handleDPadNavigation(e);
    });

    // Update grid items when library changes
    const observer = new MutationObserver(() => {
      const newGridItems = Array.from(document.querySelectorAll('.grid .card'));
      if (newGridItems.length !== gridItems.length) {
        updateGridItems();
        // Reset focus to first item if current focus is out of bounds
        if (currentFocusIndex >= gridItems.length) {
          currentFocusIndex = 0;
          if (gridItems.length > 0) {
            focusItem(0);
          }
        }
      }
    });

    observer.observe(document.querySelector('.grid') || document.body, {
      childList: true,
      subtree: true
    });

    // Reset activity on any user interaction
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, resetHeaderTimer, { passive: true });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFireTV, { once: true });
  }
  else {
    initializeFireTV();
  }
})();
