import { fmtSize, fmtDuration, parseTimeString, debounce, hide, show, showAs, isHidden, showMessageModal, isAbsolutePath, notify, lsGet, lsSet, lsRemove, lsGetJSON, lsSetJSON, lsGetBool, lsSetBool, lsRemovePrefix } from './utils.js';
// Lightweight no-op placeholders to avoid no-undef when optional helpers are not wired
const loadArtifactStatuses = (..._args) => {};
const refreshSidebarThumbnail = (..._args) => {};
// Local slugify for tag/name normalization where needed
const _slugify = (s) => String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
// Back-compat toast shim: provide a module-scoped showToast used throughout this file.
// If a legacy global window.showToast exists, use it; otherwise fallback to utils.notify().
// Accepts legacy Bulma-like classes ('is-success'|'is-error'|'is-info') or plain types ('success'|'error'|'info').
const showToast = (message, type = 'is-info') => {
    try {
        if (window && typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
    }
    catch (_) { /* ignore access errors */ }
    // Normalize type for notify()
    const normalized = (typeof type === 'string' && type.startsWith('is-')) ? type.slice(3) : (type || 'info');
    try {
        notify(message, normalized);
    }
    catch (_) { /* no-op */ }
};
// Reset Player logic (sanitized)
window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnResetPlayer');
    const video = document.getElementById('playerVideo');
    const title = document.getElementById('playerTitle');
    if (btn && video) {
        btn.addEventListener('click', () => {
            try {
                video.pause();
            }
            catch (_) { }
            try {
                video.removeAttribute('src');
            }
            catch (_) { }
            try {
                video.load();
            }
            catch (_) { }
            if (title) {
                title.textContent = '';
                hide(title);
            }
            // Mark that a reset occurred so unload handlers won't re-save state during a following refresh
            try {
                lsSet('mediaPlayer:skipSaveOnUnload', '1');
            }
            catch (_) { }
            // Clear last played video from localStorage so no movie auto-loads after refresh
            try {
                ['mediaPlayer:last', 'mediaPlayer:lastVideo', 'mediaPlayer:lastSelected'].forEach((k) => {
                    try {
                        lsRemove(k);
                    }
                    catch (_) { }
                });
            }
            catch (_) { }
            // Clear file info fields
            [
                'fiPath', 'fiDuration', 'fiResolution', 'fiVideoCodec', 'fiAudioCodec', 'fiBitrate', 'fiVBitrate', 'fiABitrate', 'fiSize', 'fiModified',
            ].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.textContent = '—';
            });
            // Also clear currentPath and resumeOverrideTime if possible
            try {
                if (window.Player) {
                    if ('currentPath' in window.Player) window.Player.currentPath = null;
                    if ('resumeOverrideTime' in window.Player) window.Player.resumeOverrideTime = null;
                }
            }
            catch (_) { }
            // Clear module-level path is handled by Player unload; do not assign to currentPath (function name)
            // Remove per-video persistence keys (mediaPlayer:video:*) so progress/last entries don't rehydrate
            try {
                const removals = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) {
                        continue;
                    }
                    // remove per-video keys and any 'last' keys that might trigger auto-resume
                    if (k.indexOf('mediaPlayer:video:') === 0) removals.push(k);
                    if (/last/i.test(k)) removals.push(k);
                    if (/lastSelected/i.test(k)) removals.push(k);
                }
                removals.forEach((k) => {
                    try {
                        lsRemove(k);
                    }
                    catch (_) { }
                });
            }
            catch (_) { }
            // Clear common sidebar UI elements so no stale info remains
            try {
                ['artifactBadgesSidebar', 'videoPerformers', 'videoTags', 'markersList', 'performerImportPreviewList'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (!el) {
                        return;
                    }
                    if (el.tagName === 'DIV' || el.tagName === 'UL' || el.tagName === 'OL') el.innerHTML = '';
                    else el.textContent = '';
                });
                // Clear selection state and UI
                try {
                    selectedItems = new Set();
                    const selCount = document.getElementById('selectionCount');
                    if (selCount) selCount.textContent = '0';
                    document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
                }
                catch (_) { }
                // Attempt to unload the Player module if available
                try {
                    if (window.Player && typeof window.Player.unload === 'function') {
                        window.Player.unload();
                    }
                    else if (typeof Player !== 'undefined' && Player && typeof Player.unload === 'function') {
                        Player.unload();
                    }
                }
                catch (_) { }
                // Do not change active tab on reset — preserve user's current tab
            }
            catch (_) { }
        });
    }
});
const grid = document.getElementById('grid');
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
let adjState = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
try {
    const raw = lsGet(ADJ_LS_KEY);
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
    if (!v) {
        return;
    }
    const { brightness, contrast, saturation, hue } = adjState;
    v.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`;
}
function persistAdjustments() {
    try {
        lsSetJSON(ADJ_LS_KEY, adjState);
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
        if (!el) {
            return;
        }
        if (el._wired) {
            return;
        }
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
            adjState = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
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
// Hover controls (Settings) unified naming (was hoverPreviewsEnabled)
let hoverEnabled = false;
// playback on hover
let hoverOnDemandEnabled = false;
// generation on hover
let confirmDeletesEnabled = false;
// user preference for delete confirmations
// Feature flag for on-demand hover generation. Was previously false which prevented
// persistence of the "Generate hover previews on demand" checkbox even when the
// user enabled it. Enable it so the UI state persists across reloads.
const FEATURE_HOVER_ON_DEMAND = true;
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
// Bottom-trigger infinite scroll enhancements
// Strict mode (requested): ONLY load when user reaches/overscrolls the real bottom.
// No prefill auto-loading;
// if first page doesn't create overflow, user must resize or change density.
const INFINITE_SCROLL_BOTTOM_THRESHOLD = 32; // tighter threshold for "at bottom"
let infiniteScrollLastTriggerHeight = 0; // scrollHeight at last successful trigger
let stablePageSize = null; // locked page size for current browsing session (resets when page=1)
let selectedItems = new Set();
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
// Ensure a hover (preview) artifact exists for a video record;
// returns a blob URL or empty string.
async function ensureHover(v) {
    // Goal: avoid generating any 404 network entries. We first consult unified
    // artifact status (cheap, should never 404). Only if it reports hover=true
    // do we attempt to fetch the blob. If hover is absent but on‑demand
    // generation is enabled, we trigger creation and poll status (not the blob)
    // until it reports present, then fetch. No HEAD probes.
    const path = (v && (v.path || v.name)) || '';
    if (!path) return '';
    if (v && v.hover_url) return v.hover_url;
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
    if (status && status.hover) {
        // Fetch the blob directly (GET). If this 404s (race), we just abort silently.
        try {
            const r = await fetch(`/api/hover/get?path=${qp}`);
            if (!r.ok) return '';
            const blob = await r.blob();
            if (!blob || !blob.size) return '';
            const obj = URL.createObjectURL(blob);
            v.hover_url = obj;
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
        status = { hover: false };
    }
    // If hover is missing but on-demand generation is enabled, trigger creation
    try {
        if (hoverOnDemandEnabled) {
            // Mark UI state for generation
            try {
                const card = document.querySelector(`.card[data-path="${path}"]`);
                if (card) card.classList.add('hover-generating');
            }
            catch (_) { }
            // Trigger creation endpoint if available
            try {
                const u = new URL('/api/hover/create', window.location.origin);
                u.searchParams.set('path', path);
                // fire-and-forget, but wait briefly and poll status
                await fetch(u.toString(), { method: 'POST' });
                // Poll status up to ~6s
                const deadline = Date.now() + 6000;
                while (Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 600));
                    const s = await refreshStatus();
                    if (s && s.hover) {
                        try {
                            const r = await fetch(`/api/hover/get?path=${qp}`);
                            if (!r.ok) {
                                break;
                            }
                            const blob = await r.blob();
                            if (blob && blob.size) {
                                const obj = URL.createObjectURL(blob);
                                v.hover_url = obj;
                                try {
                                    const card = document.querySelector(`.card[data-path="${path}"]`);
                                    if (card) card.classList.remove('hover-generating');
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
                    if (card) card.classList.remove('hover-generating');
                }
                catch (_) { }
            }
        }
    }
    catch (_) { }
    return '';
}
// (fmtDuration moved to utils.js)
// Clean up any existing hover preview videos except an optional tile we want to keep active
function stopAllTileHovers(exceptTile) {
    try {
        const tiles = document.querySelectorAll('.card');
        tiles.forEach((t) => {
            if (exceptTile && t === exceptTile) {
                return;
            }
            const video = t.querySelector('video.hover-video');
            if (video) {
                try {
                    video.pause();
                    video.src = '';
                    video.load();
                    video.remove();
                }
                catch (_) { }
            }
            t._hovering = false;
            t._hoverToken = (t._hoverToken || 0) + 1;
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
    const imgSrc = v.thumbnail || '';
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
    // Always start with placeholder visible until the image truly loads to avoid blank flashes.
    img.alt = v.title || v.name;
    const placeholderSvg = el.querySelector('svg.thumbnail-placeholder');
    // Placeholder is now absolutely positioned overlay; class toggles handle fade.
    function markLoaded(success) {
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
        if (!img.naturalWidth) {
            markLoaded(false);
            return;
        }
        markLoaded(true);
    });
    img.addEventListener('error', () => markLoaded(false));
    // Defer assigning src for non-eager tiles to reduce main thread contention.
    // We attach data attributes for deferred meta computation as well.
    el.dataset.w = String(v.width || '');
    el.dataset.h = String(v.height || '');
    el.dataset.name = String(v.title || v.name || '');
    if (imgSrc) {
        if (window.__TILE_EAGER_COUNT === undefined) window.__TILE_EAGER_COUNT = 0;
        const eagerLimit = window.__TILE_EAGER_LIMIT || 16; // configurable global
        const eager = window.__TILE_EAGER_COUNT < eagerLimit;
        if (eager) {
            window.__TILE_EAGER_COUNT++;
            img.src = imgSrc;
        }
        else {
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
        markLoaded(false);
    }
    // Resolution / quality badge: prefer height (common convention)
    // Defer quality / resolution overlay population until element intersects viewport (reduces synchronous cost).
    el._needsMeta = true;
    // Add video hover preview functionality
    el.addEventListener('mouseenter', async () => {
        if (!hoverEnabled) {
            return;
        }
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
        if (!el._hovering || el._hoverToken !== token) {
            return;
        }
        // Double-check no other tiles are showing hover previews
        stopAllTileHovers(el);
        const video = document.createElement('video');
        // Use updated class naming so sizing rules (thumbnail-img) still apply to the hover element.
        // Keep a distinct marker class for potential styling (.hover-video) without relying on removed .thumb class.
        video.className = 'thumbnail-img hover-video';
        video.src = url;
        video.muted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.style.pointerEvents = 'none';
        // Replace the thumbnail with the video
        if (img) img.replaceWith(video);
        try {
            await video.play();
        }
        catch (_) { }
    });
    function restoreThumbnail() {
        const vid = el.querySelector('video.hover-video');
        if (!vid) {
            return;
        }
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
        el._hovering = false;
        el._hoverToken = (el._hoverToken || 0) + 1;
        if (el._hoverTimer) {
            clearTimeout(el._hoverTimer);
            el._hoverTimer = null;
        }
        restoreThumbnail();
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
                card._metaApplied = true;
            }
            catch (_) { }
        };
        window.__computeTileMeta = computeTileMeta;
        window.__tileIO = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                const node = e.target;
                const card = node.closest('.card');
                if (card && card._needsMeta) computeTileMeta(card);
                if (node.dataset && node.dataset.src && !node.src) {
                    node.src = node.dataset.src;
                }
                try {
                    window.__tileIO.unobserve(node);
                }
                catch (_) { }
            }
        }, { root: document.getElementById('library-panel') || null, rootMargin: '200px 0px', threshold: 0.01 });
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
async function loadLibrary() {
    try {
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
            stablePageSize = pageSize;
        }
        else {
            // Still update columns (visual responsiveness) but ignore new dynamic size
            applyColumnsAndComputePageSize();
            pageSize = stablePageSize;
        }
        params.set('page', String(currentPage));
        // In infinite scroll mode, still request page-sized chunks (server handles page param)
        params.set('page_size', String(pageSize));
        params.set('sort', sortSelect.value || 'date');
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
        const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (payload?.status !== 'success') {
            throw new Error(payload?.message || 'Unexpected response');
        }
        const data = payload.data || {};
        let files = Array.isArray(data.files) ? data.files : [];
        const dirs = Array.isArray(data.dirs) ? data.dirs : [];
        // Update pagination info (backend may currently return all files due to pagination regression)
        const effectivePageSize = pageSize; // keep consistent with request
        // If backend reported counts, trust them;
        // else derive client-side
        if (data.total_pages && data.total_files) {
            totalPages = data.total_pages;
            totalFiles = data.total_files;
            currentPage = data.page || currentPage;
        }
        else {
            totalFiles = files.length;
            totalPages = Math.max(1, Math.ceil(totalFiles / effectivePageSize));
            // Clamp currentPage within bounds
            if (currentPage > totalPages) currentPage = totalPages;
            const start = (currentPage - 1) * effectivePageSize;
            const end = start + effectivePageSize;
            files = files.slice(start, end);
        }
        // If backend returned more than requested (pagination disabled server-side), trim client-side.
        if (files.length > effectivePageSize) {
            files = files.slice(0, effectivePageSize);
        }
        // Update pagination / infinite scroll UI
        if (infiniteScrollEnabled) {
            const effectiveSize = stablePageSize || applyColumnsAndComputePageSize();
            const shown = Math.min(totalFiles, currentPage * effectiveSize);
            pageInfo.textContent = `Showing ${shown} of ${totalFiles}`;
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        }
        else {
            pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalFiles} files)`;
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = currentPage >= totalPages;
        }
        if (!infiniteScrollEnabled || currentPage === 1) {
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
                        if (!dpath) {
                            return;
                        }
                        try {
                            const u = new URL('/api/library', window.location.origin);
                            u.searchParams.set('path', dpath);
                            u.searchParams.set('page', '1');
                            u.searchParams.set('page_size', String(Math.min(48, MAX_TILES)));
                            u.searchParams.set('sort', curSort);
                            u.searchParams.set('order', curOrder);
                            // Include resolution filter in fallback fetches
                            const resSel = document.getElementById('resSelect');
                            const resVal = resSel ? String(resSel.value || '') : '';
                            if (resVal) u.searchParams.set('res_min', resVal);
                            const r = await fetch(u, {
                                headers: { Accept: 'application/json' },
                            });
                            if (!r.ok) {
                                return;
                            }
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
                    if (shown >= MAX_TILES) {
                        break;
                    }
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
                statusEl.textContent = searchVal ? 'No results match your search.' : 'No videos found.';
                showAs(statusEl, 'block');
                hide(grid);
                return;
            }
        }
        // Progressive tile insertion (improves responsiveness for large sets)
        const nodes = files.map(videoCard);
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
                    requestIdleCallback(insertBatch, { timeout: 120 });
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
                        if (h && isFinite(h) && h > 50) lastCardHeight = h;
                    }
                    enforceGridSideSpacing();
                    finishInsertion();
                    // Finished inserting; do not auto-trigger next page. User must reach bottom again.
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
        }
        else {
            if (window.requestIdleCallback) requestIdleCallback(insertBatch, { timeout: 80 });
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
}
// One-time capability check to decide if we should attempt SSE at all (avoids blind 404 probes)
(async () => {
    if (!window.__JOBS_SSE_ENABLED) {
        return;
    }
    if (window.__JOBS_SSE_UNAVAILABLE) {
        return;
    }
    // already decided
    try {
        const res = await fetch('/config', { cache: 'no-store' });
        if (!res.ok) {
            return;
        }
        const cfg = await res.json();
        const has = Boolean(cfg && cfg.features && cfg.features.jobs_sse);
        if (!has) {
            window.__JOBS_SSE_UNAVAILABLE = true;
        }
    }
    catch (_) {
        // Silent;
        // fallback polling continues
    }
})();
// -----------------------------
// Simple Accordion Wiring (robust, minimal)
// Ensures the sidebar accordion works even when other modules aren't active.
(function wireSimpleAccordion() {
    function init() {
        const root = document.getElementById('sidebarAccordion');
        if (!root) {
            return;
        }
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
            if (!hdr || !panel) {
                return;
            }
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
            if (hdr._simpleAccordionWired) {
                return;
            }
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
                        if (other === it) {
                            return;
                        }
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
                if (ev.button !== 0) {
                    return;
                } // left only
                // Execute immediately and skip the ensuing click to avoid double toggle flicker.
                hdr._skipNextClick = true;
                toggleAccordionHeader();
                ev.preventDefault();
            });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
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
            const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
            if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
            }
            const pl = await r.json();
            const f = (pl?.data?.files || [])[0];
            if (!f || !f.path) {
                showMessageModal('No video found for random play.', { title: 'Random Play' });
                return;
            }
            if (typeof window.__playerOpen === 'function') {
                window.__playerOpen(f.path);
                // Switch to player tab now (explicit user action)
                if (window.tabSystem) window.tabSystem.switchToTab('player');
            }
        }
        catch (e) {
            showMessageModal('Random play failed.', { title: 'Random Play' });
        }
    });
}
// Persist auto-random setting
function loadAutoRandomSetting() {
    try {
        autoRandomEnabled = lsGetBool('setting.autoRandom');
    }
    catch (_) {
        autoRandomEnabled = false;
    }
}
function saveAutoRandomSetting() {
    try {
        lsSetBool('setting.autoRandom', autoRandomEnabled);
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
    const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const pl = await r.json();
    const f = (pl?.data?.files || [])[0];
    return f && f.path ? f.path : null;
}
// Auto-random listener on player video end
function installAutoRandomListener() {
    try {
        const v = document.getElementById('playerVideo');
        if (!v || v._autoRandomWired) {
            return;
        }
        v._autoRandomWired = true;
        v.addEventListener('ended', async () => {
            if (!autoRandomEnabled) {
                return;
            }
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
    if (!isAtBottom()) return; // not actually at bottom
    const sc = getScrollContainer();
    if (sc && sc.scrollHeight === infiniteScrollLastTriggerHeight) {
        // Already triggered at this height; require a scroll height change and another bottom reach.
        return;
    }
    infiniteScrollLastTriggerHeight = sc ? sc.scrollHeight : 0;
    infiniteScrollLoading = true;
    currentPage += 1;
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
    // Do not auto-trigger; bottom overscroll check happens via sentinel/intersection.
}
function setupInfiniteScrollSentinel() {
    if (!infiniteScrollEnabled) return;
    const panel = document.getElementById('library-panel');
    if (!panel) return;
    // Mark when user actually scrolls (prevents immediate auto-trigger on load)
    if (!panel._infiniteScrollScrollWired) {
        panel._infiniteScrollScrollWired = true;
        panel.addEventListener('scroll', markUserScrolled, { passive: true });
        // Also listen on the window/document in case the body (not panel) is the scrolling element.
        window.addEventListener('scroll', markUserScrolled, { passive: true });
        window.addEventListener('wheel', markUserScrolled, { passive: true });
        window.addEventListener('touchmove', markUserScrolled, { passive: true });
        window.addEventListener('keydown', (e) => {
            // Keys that commonly initiate scroll/navigation; we can just mark on any keydown for simplicity.
            // This avoids over-specific logic missing an edge case.
            markUserScrolled();
        }, { passive: true });
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
            }, { root: null, rootMargin: '0px 0px', threshold: 0.01 });
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
        lsSetJSON('filters.tags', libraryTagFilters);
        lsSetJSON('filters.performers', libraryPerformerFilters);
        lsSetJSON('filters.searchTerms', librarySearchTerms);
    }
    catch (_) { }
}
function loadLibraryFilters() {
    try {
        const t = lsGetJSON('filters.tags', []);
        const p = lsGetJSON('filters.performers', []);
        const s = lsGetJSON('filters.searchTerms', []);
        if (Array.isArray(t)) libraryTagFilters = t.filter(Boolean);
        if (Array.isArray(p)) libraryPerformerFilters = p.filter(Boolean);
        if (Array.isArray(s)) librarySearchTerms = s.filter(Boolean);
    }
    catch (_) { }
}
function renderUnifiedFilterChips() {
    if (!unifiedChipsEl) {
        return;
    }
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
}
function commitUnifiedInputToken(raw) {
    if (!raw) {
        return false;
    }
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
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
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
        if (!body || body.status !== 'success') {
            return;
        }
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
    });
}
sortSelect.addEventListener('change', () => {
    // Reset to sensible default per sort (ASC for name, DESC otherwise)
    applyDefaultOrderForSort(false);
    currentPage = 1;
    loadLibrary();
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
    if (selectedItems && selectedItems.size > 0) {
        return Array.from(selectedItems)[0];
    }
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
        showMessageModal('No file selected.', { title: 'Generate Artifact' });
        return;
    }
    setArtifactSpinner(artifact, true);
    // Record an optimistic active spinner state keyed by path+artifact so TasksManager can reconcile later
    try {
        window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
        window.__activeArtifactSpinners.set(`${filePath}::${artifact}`, { path: filePath, artifact: artifact, since: Date.now(), manual: true });
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
        showMessageModal('Unknown artifact type.', { title: 'Generate Artifact' });
        return;
    }
    try {
        const res = await fetch(endpoint + params, { method: 'POST' });
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
        showMessageModal(`Failed to generate ${artifact}: ${e.message}`, { title: 'Generate Artifact' });
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
    currentPage = 1;
    loadLibrary();
});
// Apply density once on startup so initial load uses correct columns
updateDensity();
// Settings wiring for hover video previews (canonical key 'setting.hover')
function loadHoverSetting() {
    try {
        const raw = lsGet('setting.hover');
        hoverEnabled = raw === '1';
    }
    catch (_) {
        hoverEnabled = false;
    }
}
function saveHoverSetting() {
    try {
        lsSet('setting.hover', hoverEnabled ? '1' : '0');
    }
    catch (_) { }
}
function loadHoverOnDemandSetting() {
    try {
        const raw = lsGet('setting.hoverOnDemand');
        // Respect stored value when present; default to false when absent.
        // FEATURE_HOVER_ON_DEMAND controls only whether the UI/behavior is active,
        // not whether we remember prior intent.
        const stored = raw ? raw === '1' : false;
        hoverOnDemandEnabled = FEATURE_HOVER_ON_DEMAND ? stored : false;
    }
    catch (_) {
        hoverOnDemandEnabled = false;
    }
}
function saveHoverOnDemandSetting() {
    try {
        lsSet('setting.hoverOnDemand', hoverOnDemandEnabled ? '1' : '0');
    }
    catch (_) { }
}
// Settings for timeline display toggles
function loadShowHeatmapSetting() {
    try {
        const raw = lsGet('setting.showHeatmap');
        // Default to ON when unset
        showHeatmap = raw == null ? true : raw === '1';
    }
    catch (_) {
        showHeatmap = true;
    }
}
function saveShowHeatmapSetting() {
    try {
        lsSet('setting.showHeatmap', showHeatmap ? '1' : '0');
    }
    catch (_) { }
}
function loadShowScenesSetting() {
    try {
        const raw = lsGet('setting.showScenes');
        showScenes = raw == null ? true : raw === '1';
    }
    catch (_) {
        showScenes = true;
    }
}
function saveShowScenesSetting() {
    try {
        lsSet('setting.showScenes', showScenes ? '1' : '0');
    }
    catch (_) { }
}
function wireSettings() {
    // Backward compatibility: JS previously looked for #settingHover while HTML uses #settingHoverPreviews.
    const cbPlay = document.getElementById('settingHoverPreviews') || document.getElementById('settingHover');
    const cbDemand = document.getElementById('settingHoverOnDemand');
    const cbConfirmDeletes = document.getElementById('settingConfirmDeletes');
    const concurrencyInput = document.getElementById('settingConcurrency');
    const ffmpegConcurrencyInput = document.getElementById('settingFfmpegConcurrency');
    const ffmpegThreadsInput = document.getElementById('settingFfmpegThreads');
    const ffmpegTimelimitInput = document.getElementById('settingFfmpegTimelimit');
    const cbAutoplayResume = document.getElementById('settingAutoplayResume');
    const cbShowHeatmap = document.getElementById('settingShowHeatmap');
    const cbShowScenes = document.getElementById('settingShowScenes');
    const cbInfinite = document.getElementById('settingInfiniteScroll');
    loadHoverSetting();
    loadHoverOnDemandSetting();
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
        cbPlay.checked = Boolean(hoverEnabled);
        cbPlay.addEventListener('change', () => {
            hoverEnabled = Boolean(cbPlay.checked);
            saveHoverSetting();
            if (!hoverEnabled) stopAllTileHovers();
        });
    }
    if (cbDemand) {
        cbDemand.checked = Boolean(hoverOnDemandEnabled);
        cbDemand.addEventListener('change', () => {
            hoverOnDemandEnabled = Boolean(cbDemand.checked);
            saveHoverOnDemandSetting();
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
            return lsGet('setting.autoplayResume') === '1';
        }
        catch (_) {
            return false;
        }
    };
    const saveAutoplayResume = (v) => {
        try {
            lsSet('setting.autoplayResume', v ? '1' : '0');
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
            const v = lsGet('setting.startAtIntro');
            if (v === null || v === undefined) return true;
            return v === '1';
        }
        catch (_) {
            return true;
        }
    };
    const saveStartAtIntro = (v) => {
        try {
            lsSet('setting.startAtIntro', v ? '1' : '0');
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
        if (!ffmpegConcurrencyInput && !ffmpegThreadsInput && !ffmpegTimelimitInput) {
            return;
        }
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
                const r = await fetch(`/api/tasks/concurrency?value=${raw}`, { method: 'POST' });
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
                const r = await fetch(`/api/settings/ffmpeg?${params.toString()}`, { method: 'POST' });
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
            if (!el) {
                return;
            }
            el.addEventListener('change', debouncedFfmpeg);
            el.addEventListener('input', debouncedFfmpeg);
        };
        attach(ffmpegConcurrencyInput);
        attach(ffmpegThreadsInput);
        attach(ffmpegTimelimitInput);
    }
    // Insert Health/Config read-only JSON panels
    try {
        const settingsPanel = document.getElementById('settings-panel');
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
                const r = await fetch('/api/tasks/jobs/clear-completed', { method: 'POST' });
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
                const res = await fetch('/api/tasks/jobs/cancel-queued', { method: 'POST' });
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
                const res = await fetch('/api/tasks/jobs/cancel-all', { method: 'POST' });
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
        document
            .querySelectorAll('.artifact-card.menu-open')
            .forEach((card) => card.classList.remove('menu-open'));
    });
    // Open corresponding tooltip for clicked options button
    document.querySelectorAll('.btn-options[data-artifact]').forEach((btn) => {
        if (btn._optsWired) {
            return;
        }
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
            document
                .querySelectorAll('.artifact-card.menu-open')
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
    root.style.setProperty('--columns', String(columns));
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
    document.documentElement.style.setProperty('--columns', String(columns));
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
    const size = columns * rows;
    return size;
}
// Dynamically add horizontal spacing (margins) to the grid only until vertical
// overflow (page scroll) is removed or we reach a max side spacing. This keeps
// global layout untouched per user request.
function enforceGridSideSpacing() {
    if (!grid || grid.hidden) {
        return;
    }
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
        if (cw < minCardWidth) {
            break;
        }
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
    if (startIdx === -1 || endIdx === -1) {
        return;
    }
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
            try {
                checkbox.setAttribute('aria-checked', 'true');
            }
            catch (_) { }
        }
        else {
            checkbox.classList.remove('checked');
            try {
                checkbox.setAttribute('aria-checked', 'false');
            }
            catch (_) { }
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
    document
        .querySelectorAll('.card-checkbox')
        .forEach((cb) => cb.classList.add('checked'));
});
selectNoneBtn.addEventListener('click', () => {
    selectedItems.clear();
    updateSelectionUI();
    document
        .querySelectorAll('.card-checkbox')
        .forEach((cb) => cb.classList.remove('checked'));
});
// Folder picker
async function fetchDirs(path = '') {
    const url = new URL('/api/library', window.location.origin);
    if (path) url.searchParams.set('path', path);
    url.searchParams.set('page', '1');
    // Large page_size to avoid server-side file pagination affecting perceived results
    url.searchParams.set('page_size', '500');
    // we only need dirs;
    // dirs are not paginated server-side
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.status !== 'success') {
        throw new Error(payload?.message || 'Unexpected response');
    }
    const data = payload.data || {};
    const dirs = Array.isArray(data.dirs) ? data.dirs : [];
    return { cwd: String(data.cwd || ''), dirs: dirs };
}
function renderCrumbs(path) {
    if (!crumbsEl) {
        return;
    }
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
        const { dirs } = await fetchDirs(path);
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
                        if (listEl) {
                            return;
                        }
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
                        if (!listEl) {
                            return;
                        }
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
                        if (!name) {
                            return;
                        }
                        const r = await fetch('/api/registry/tags/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                        if (r.ok) {
                            showToast('Tag added', 'is-success');
                            fetchTags();
                        }
                        else showToast('Failed', 'is-error');
                    }
                    async function rename(t) {
                        const nn = prompt('Rename tag', t.name);
                        if (!nn || nn === t.name) {
                            return;
                        }
                        const r = await fetch('/api/registry/tags/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: t.name, new_name: nn }) });
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
                        if (selected.size !== 2) {
                            return;
                        }
                        const arr = [...selected];
                        const into = prompt('Merge: tag that remains', arr[0]);
                        if (!into) {
                            return;
                        }
                        const from = arr.find((s) => s !== _slugify(into)) || arr[0];
                        const url = `/api/registry/tags/merge?from_name=${encodeURIComponent(from)}&into_name=${encodeURIComponent(into)}`;
                        const r = await fetch(url, { method: 'POST' });
                        if (r.ok) {
                            showToast('Merged', 'is-success');
                            selected.clear();
                            fetchTags();
                        }
                        else showToast('Merge failed', 'is-error');
                    }
                    async function rewrite() {
                        const r = await fetch('/api/registry/tags/rewrite-sidecars', { method: 'POST' });
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
                            const blob = new Blob([JSON.stringify({ tags: j.data.tags }, null, 2)], { type: 'application/json' });
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
                        if (!f) {
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = async () => {
                            try {
                                const json = JSON.parse(reader.result);
                                const payload = { tags: json.tags || json, replace: Boolean(importReplace?.checked) };
                                const r = await fetch('/api/registry/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
                    return { ensure: ensure, fetch: fetchTags };
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
                    if (!btn) {
                        return;
                    }
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
    if (!rootVal) {
        return;
    }
    if (!isAbsolutePath(rootVal)) {
        notify('Please enter an absolute path (e.g., /Volumes/Media or ~/Movies).', 'error');
        return;
    }
    try {
        // Validate path first to prevent 400s
        const tp = await fetch('/api/testpath?' + new URLSearchParams({ path: rootVal }), { method: 'POST' });
        if (!tp.ok) {
            throw new Error('Path check failed (HTTP ' + tp.status + ')');
        }
        const tj = await tp.json();
        const tdata = tj?.data || {};
        if (!tdata.exists || !tdata.is_dir) {
            throw new Error('Path does not exist or is not a directory');
        }
        // Set root on the server
        const sr = await fetch('/api/setroot?' + new URLSearchParams({ root: rootVal }), { method: 'POST' });
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
    if (e.key !== 'Enter') {
        return;
    }
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
            const saved = lsGet('activeTab');
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
        const hash = window.location.hash.slice(1);
        // Remove the # symbol
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
        }
        else if (!this.tabSystem.tabs.has(tabId) && hash) {
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
                detail: { activeTab: tabId, previousTab: previousTab },
            }),
        );
        // Persist active tab (ignore failures in private modes)
        try {
            lsSet('activeTab', tabId);
        }
        catch (e) {

            /* ignore */
        }
    }
    getActiveTab() {
        return this.activeTab;
    }
    addTab(tabId, buttonText, panelContent) {
        // Method to programmatically add tabs if needed
        const tabNav = document.querySelector('.tab-nav');
        const tabPanels = document.querySelector('.tab-panels');
        if (!tabNav || !tabPanels) {
            return;
        }
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
        setupViewportFitPlayer();
    });
}
else {
    tabSystem = new TabSystem();
    wireSettings();
    setupViewportFitPlayer();
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
    if (!playerPanel || !playerBar || !vid || !videoStage) {
        return;
    }
    function recompute() {
        // If panel is hidden (inactive tab), defer sizing until it's shown to avoid 0 height measurements
        if (playerPanel.hasAttribute('hidden') || playerPanel.classList.contains('hidden')) {
            return;
        }
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
    // Default column definitions (id, label, width px, visible, accessor)
    const DEFAULT_COLS = [
        { id: 'name', label: 'Name', width: 260, visible: true, get: (f) => f.name || f.title || '' },
        { id: 'path', label: 'Path', width: 320, visible: true, get: (f) => f.path || '' },
        { id: 'duration', label: 'Duration', width: 90, visible: true, get: (f) => fmtDuration(Number(f.duration)) },
        { id: 'size', label: 'Size', width: 90, visible: true, get: (f) => fmtSize(Number(f.size)) },
        { id: 'res', label: 'Resolution', width: 110, visible: true, get: (f) => (f.width && f.height) ? `${f.width}×${f.height}` : '' },
        { id: 'mtime', label: 'Modified', width: 140, visible: true, get: (f) => f.mtime ? new Date(f.mtime * 1000).toLocaleString() : '' },
        { id: 'codec', label: 'Video Codec', width: 130, visible: false, get: (f) => f.video_codec || '' },
        { id: 'acodec', label: 'Audio Codec', width: 130, visible: false, get: (f) => f.audio_codec || '' },
    ];
    function loadCols() {
        try {
            const raw = lsGet(COL_LS_KEY, { type: 'json', fallback: null });
            if (!raw) return DEFAULT_COLS.map((c) => ({ ...c }));
            // Merge to keep future default additions
            const map = new Map(raw.map((c) => [c.id, c]));
            return DEFAULT_COLS.map((d) => ({ ...d, ...(map.get(d.id) || {}) }));
        }
        catch (_) {
            return DEFAULT_COLS.map((c) => ({ ...c }));
        }
    }
    function saveCols(cols) {
        try {
            lsSet(String(COL_LS_KEY), cols, {type: 'json'});
        }
        catch (_) { }
    }
    function addListTab(ts) {
        const tpl = document.getElementById('listTabTemplate');
        const { panel } = ts.addTab('list', 'List', tpl || '#listTabTemplate');
        const headRow = panel.querySelector('#listHeadRow');
        const tbody = panel.querySelector('#listTbody');
        const table = panel.querySelector('#listTable');
        const pagerPrev = panel.querySelector('#listPrevBtn');
        const pagerNext = panel.querySelector('#listNextBtn');
        const pageInfo = panel.querySelector('#listPageInfo');
        const colsBtn = panel.querySelector('#listColumnsBtn');
        const rotateBtn = panel.querySelector('#listRotateHeadersToggle');
        const colsPanel = panel.querySelector('#listColumnsPanel');
        const rotateBtnPanel = panel.querySelector('#listRotateHeadersTogglePanel');
        const colsClose = panel.querySelector('#listColumnsClose');
        const colsBody = panel.querySelector('#listColumnsBody');
        const cellTpl = document.getElementById('listCellTemplate');
        const itemTpl = document.getElementById('listColumnItemTemplate');
        let cols = loadCols();
        let page = 1;
        let total = 0;
        let pageSize = 100; // compact list view default
        let filesCache = [];
        let draggingCol = null;
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
                if (wrapEl) wrapEl.textContent = c.label;
                th.style.width = (c.width || 120) + 'px';
                th.dataset.colId = c.id;
                let startX = 0;
                let startW = c.width || 120;
                const onMove = (ev) => {
                    const dx = ev.clientX - startX;
                    const nw = Math.max(60, startW + dx);
                    th.style.width = nw + 'px';
                };
                const onUp = (ev) => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    const rect = th.getBoundingClientRect();
                    const nw = Math.max(60, Math.round(rect.width));
                    const idx = cols.findIndex((x) => x.id === c.id);
                    if (idx >= 0) {
                        cols[idx] = { ...cols[idx], width: nw };
                        saveCols(cols);
                    }
                };
                rz && rz.addEventListener('mousedown', (ev) => {
                    startX = ev.clientX;
                    startW = th.getBoundingClientRect().width;
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                    ev.preventDefault();
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
                th.addEventListener('drop', (e) => {
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
                    renderHead();
                    renderBody(filesCache);
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
            const frag = document.createDocumentFragment();
            const rowTpl = document.getElementById('listRowTemplate');
            files.forEach((f) => {
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
                    td.textContent = (c.get && typeof c.get === 'function') ? (c.get(f) ?? '') : String(f[c.id] ?? '');
                    tr.appendChild(td);
                });
                frag.appendChild(tr);
            });
            tbody.appendChild(frag);
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
                item.addEventListener('drop', (e) => {
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
                    renderHead();
                    renderBody(filesCache);
                });
                colsBody.appendChild(item);
            });
        }
        async function loadPage() {
            // Build request from current library filters to stay consistent
            const url = new URL('/api/library', window.location.origin);
            url.searchParams.set('page', String(page));
            url.searchParams.set('page_size', String(pageSize));
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
            const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
            if (!r.ok) {
                tbody.innerHTML = '';
                pageInfo.textContent = 'Failed';
                return;
            }
            const payload = await r.json();
            const data = payload?.data || {};
            filesCache = Array.isArray(data.files) ? data.files : [];
            total = Number(data.total_files || filesCache.length || 0);
            renderHead();
            renderBody(filesCache);
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            pageInfo.textContent = `Page ${Math.min(page, totalPages)} of ${totalPages} (${total} files)`;
            pagerPrev.disabled = page <= 1;
            pagerNext.disabled = page >= totalPages;
        }
        // Wire controls
        pagerPrev.addEventListener('click', () => {
            if (page > 1) {
                page--;
                loadPage();
            }
        });
        pagerNext.addEventListener('click', () => {
            page++;
            loadPage();
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
        // Rotate headers toggle
        function applyRotateHeadersUI() {
            const on = localStorage.getItem('mediaPlayer:list:rotateHeaders') === '1';
            if (rotateBtn) {
                rotateBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
                rotateBtn.textContent = `Rotate headers: ${on ? 'On' : 'Off'}`;
            }
            if (rotateBtnPanel) {
                rotateBtnPanel.setAttribute('aria-pressed', on ? 'true' : 'false');
                rotateBtnPanel.textContent = `Rotate headers: ${on ? 'On' : 'Off'}`;
            }
            if (table) table.classList.toggle('rotate-headers', on);
        }
        if (rotateBtn) {
            applyRotateHeadersUI();
            rotateBtn.addEventListener('click', () => {
                const cur = localStorage.getItem('mediaPlayer:list:rotateHeaders') === '1';
                localStorage.setItem('mediaPlayer:list:rotateHeaders', cur ? '0' : '1');
                applyRotateHeadersUI();
            });
        }
        if (rotateBtnPanel) {
            applyRotateHeadersUI();
            rotateBtnPanel.addEventListener('click', () => {
                const cur = localStorage.getItem('mediaPlayer:list:rotateHeaders') === '1';
                localStorage.setItem('mediaPlayer:list:rotateHeaders', cur ? '0' : '1');
                applyRotateHeadersUI();
            });
        }
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
        return { panel };
    }
    const tryInstall = () => {
        const ts = window.tabSystem;
        if (!ts || typeof ts.addTab !== 'function') return false;
        addListTab(ts); return true;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
        tryInstall();
    }, { once: true });
    else if (!tryInstall()) setTimeout(tryInstall, 0);
})();
// --- Similar Tab (pHash duplicates) ---
// Minimal tab that lists similar pairs from /api/duplicates/list with quick Play A/B
(function setupSimilarTab() {
    const controlsHTML = (
        '<div class="task-section">' + '  <div class="section-header">' + '    <h2>Similar (pHash)</h2>' + '    <div class="section-actions">' + '      <label class="hint-sm">Threshold <input id="similarThresh" type="number" min="0" max="1" step="0.01" value="0.90" class="w-120" /></label>' + '      <label class="hint-sm">Limit <input id="similarLimit" type="number" min="1" step="1" value="50" class="w-120" /></label>' + '      <label class="hint-sm"><input id="similarRecursive" type="checkbox" /> Recursive</label>' + '      <button id="similarRefreshBtn" class="btn-sm">Refresh</button>' + '    </div>' + '  </div>' + '  <div id="similarStatus" class="hint-sm hint-sm--muted">—</div>' + '  <div id="similarResults" class="mt-12"></div>' + '</div>'
    );
    function install(ts) {
        if (!ts || typeof ts.addTab !== 'function') return null;
        const { panel } = ts.addTab('similar', 'Similar', controlsHTML);
        function persistSettings(thresh, limit, rec) {
            try {
                lsSet('similar:thresh', String(thresh));
            }
            catch (_) { }
            try {
                lsSet('similar:limit', String(limit));
            }
            catch (_) { }
            try {
                lsSet('similar:rec', rec ? '1' : '0');
            }
            catch (_) { }
        }
        function restoreSettings() {
            const tEl = document.getElementById('similarThresh');
            const lEl = document.getElementById('similarLimit');
            const rEl = document.getElementById('similarRecursive');
            if (tEl) {
                const raw = lsGet('similar:thresh');
                if (raw != null && raw !== '') tEl.value = raw;
            }
            if (lEl) {
                const raw = lsGet('similar:limit');
                if (raw != null && raw !== '') lEl.value = raw;
            }
            if (rEl) {
                const raw = lsGet('similar:rec');
                rEl.checked = raw === '1';
            }
        }
        async function loadSimilar() {
            const statusEl = document.getElementById('similarStatus');
            const resultsEl = document.getElementById('similarResults');
            const tEl = document.getElementById('similarThresh');
            const lEl = document.getElementById('similarLimit');
            const rEl = document.getElementById('similarRecursive');
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
                const res = await fetch('/api/duplicates/list?' + qs.toString(), { headers: { Accept: 'application/json' } });
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
                pairs.forEach((p) => {
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.style.padding = '12px';
                    card.style.marginBottom = '8px';
                    const row = document.createElement('div');
                    row.className = 'row';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';
                    const title = document.createElement('strong');
                    title.textContent = `${Math.round(((p && p.similarity) || 0) * 100)}% similar`;
                    const actions = document.createElement('div');
                    actions.className = 'row gap-10';
                    const mkBtn = (label, path) => {
                        const b = document.createElement('button');
                        b.className = 'btn-sm';
                        b.textContent = label;
                        b.addEventListener('click', () => {
                            try {
                                ts.switchToTab('player');
                            }
                            catch (_) { }
                            try {
                                if (window.Player && typeof window.Player.open === 'function') window.Player.open(path);
                                else if (typeof Player !== 'undefined' && Player && typeof Player.open === 'function') Player.open(path);
                            }
                            catch (_) { }
                        });
                        return b;
                    };
                    actions.appendChild(mkBtn('Play A', p && p.a));
                    actions.appendChild(mkBtn('Play B', p && p.b));
                    row.appendChild(title);
                    row.appendChild(actions);
                    card.appendChild(row);
                    const paths = document.createElement('div');
                    paths.className = 'hint-sm';
                    paths.style.marginTop = '6px';
                    const pa = document.createElement('div');
                    pa.textContent = p && p.a ? p.a : '';
                    const pb = document.createElement('div');
                    pb.textContent = p && p.b ? p.b : '';
                    paths.appendChild(pa); paths.appendChild(pb);
                    card.appendChild(paths);
                    frag.appendChild(card);
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
        return { panel };
    }
    const tryInstall = () => {
        const ts = window.tabSystem;
        if (!ts || typeof ts.addTab !== 'function') return false;
        const res = install(ts);
        return Boolean(res);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            tryInstall();
        }, { once: true });
    }
    else {
        if (!tryInstall()) {
            // In case tabSystem is assigned slightly later, retry once on next tick
            setTimeout(tryInstall, 0);
        }
    }
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
        if (!v) {
            return;
        }
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
            if (done) {
                return;
            }
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
    let badgeHover;
    let badgePhash;
    let badgeHeatmapStatus;
    let badgeScenesStatus;
    let badgeSubtitlesStatus;
    let badgeSpritesStatus;
    let badgeFacesStatus;
    let badgeHoverStatus;
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
    // { index, sheet }
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
            if (!path) {
                return;
            }
            const payload = JSON.stringify({
                t: Math.max(0, Number(data?.t ?? 0) || 0),
                d: Math.max(0, Number(data?.d ?? 0) || 0),
                paused: Boolean(data?.paused),
                rate: Number.isFinite(data?.rate) ? Number(data.rate) : undefined,
                ts: Date.now(),
            });
            localStorage.setItem(keyForVideo(path), payload);
            // Store compact last object { path, time }
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
            if (legacy) return { path: legacy, time: 0 };
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
        // Intro end button
        if (btnSetIntroEnd && !btnSetIntroEnd._wired) {
            btnSetIntroEnd._wired = true;
            btnSetIntroEnd.addEventListener('click', async () => {
                if (!currentPath || !videoEl) {
                    return;
                }
                const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
                try {
                    // Try server persistence first
                    try {
                        const mu = new URL('/api/scenes/intro', window.location.origin);
                        mu.searchParams.set('path', currentPath);
                        mu.searchParams.set('time', String(t.toFixed(3)));
                        const mr = await fetch(mu.toString(), { method: 'POST' });
                        if (!mr.ok) {
                            throw new Error('server');
                        }
                    }
                    catch (_) {
                        // Fallback to localStorage
                        const key = `${LS_PREFIX}:introEnd:${currentPath}`;
                        localStorage.setItem(key, String(Number(t.toFixed(3))));
                    }
                    notify('Intro end set at ' + fmtTime(t), 'success');
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
                    notify('Failed to set intro end', 'error');
                }
            });
        }
        // Outro begin button
        if (btnSetOutroBegin && !btnSetOutroBegin._wired) {
            btnSetOutroBegin._wired = true;
            btnSetOutroBegin.addEventListener('click', async () => {
                if (!currentPath || !videoEl) {
                    return;
                }
                const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
                try {
                    localStorage.setItem(`${LS_PREFIX}:outroBegin:${currentPath}`, String(t));
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
                    notify('Failed to set outro begin', 'error');
                }
            });
        }
    }
    function initDom() {
        // Resolve button elements (grouped)
        // (intro/outro buttons already resolved earlier in initDom)
        // Wire marker intro/outro actions via helper
        wireIntroOutroButtons();
        if (videoEl) {
            return;
        }
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
        badgeHover = qs('badgeHover');
        badgePhash = qs('badgePhash');
        badgeHeatmapStatus = qs('badgeHeatmapStatus');
        badgeScenesStatus = qs('badgeScenesStatus');
        badgeSubtitlesStatus = qs('badgeSubtitlesStatus');
        badgeSpritesStatus = qs('badgeSpritesStatus');
        badgeFacesStatus = qs('badgeFacesStatus');
        badgeHoverStatus = qs('badgeHoverStatus');
        badgePhashStatus = qs('badgePhashStatus');
        // Support new hyphenated badge IDs (preferred) with fallback to legacy camelCase if present
        const pick = (id1, id2, id3) => document.getElementById(id1) || (id2 ? document.getElementById(id2) : null) || (id3 ? document.getElementById(id3) : null);
        // Note: heatmap badge in markup uses plural "badge-heatmaps"; support both
        badgeHeatmap = pick('badge-heatmaps', 'badge-heatmap', 'badgeHeatmap');
        badgeScenes = pick('badge-scenes', 'badgeScenes');
        badgeSubtitles = pick('badge-subtitles', 'badgeSubtitles');
        badgeSprites = pick('badge-sprites', 'badgeSprites');
        badgeFaces = pick('badge-faces', 'badgeFaces');
        badgeHover = pick('badge-hover', 'badgeHover');
        badgePhash = pick('badge-phash', 'badgePhash');
        badgeHeatmapStatus = pick('badge-heatmaps-status', 'badge-heatmap-status', 'badgeHeatmapStatus');
        badgeScenesStatus = pick('badge-scenes-status', 'badgeScenesStatus');
        badgeSubtitlesStatus = pick('badge-subtitles-status', 'badgeSubtitlesStatus');
        badgeSpritesStatus = pick('badge-sprites-status', 'badgeSpritesStatus');
        badgeFacesStatus = pick('badge-faces-status', 'badgeFacesStatus');
        badgeHoverStatus = pick('badge-hover-status', 'badgeHoverStatus');
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
                    if (!currentPath) {
                        return;
                    }
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
                        if (committing) {
                            return;
                        }
                        // Restore plain text content
                        fiPathEl.textContent = origRel;
                    };
                    const commit = async () => {
                        if (committing) {
                            return;
                        }
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
                            const r = await fetch(u.toString(), { method: 'POST' });
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
                    if (!currentPath) {
                        return;
                    }
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
                            if (done) {
                                return;
                            }
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
                                    const raw = lsGet(key);
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
                if (e.target !== videoEl) {
                    return;
                }
                if (videoEl.paused) safePlay(videoEl);
                else videoEl.pause();
            });
        }
        if (timelineEl || scrubberTrackEl) {
            const seekTo = (evt) => {
                if (!duration || !videoEl) {
                    return;
                }
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
                if (!videoEl || !activePath) {
                    return;
                }
                try {
                    const t = Math.max(0, videoEl.currentTime || 0);
                    let immediateShown = false;
                    try {
                        const iu = new URL('/api/thumbnail/create_inline', window.location.origin);
                        iu.searchParams.set('path', activePath);
                        iu.searchParams.set('t', t.toFixed(3));
                        iu.searchParams.set('overwrite', 'true');
                        const ir = await fetch(iu.toString(), { method: 'POST' });
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
                        const u = new URL('/api/thumbnail/create', window.location.origin);
                        u.searchParams.set('path', activePath);
                        u.searchParams.set('t', t.toFixed(3));
                        u.searchParams.set('overwrite', 'true');
                        const r = await fetch(u, { method: 'POST' });
                        if (!r.ok) {
                            throw new Error('HTTP ' + r.status);
                        }
                        notify('Thumbnail updated', 'success');
                        // Optimistic: assign a unique-busted cover URL immediately (old-index behavior)
                        try {
                            const bust = Date.now() + Math.floor(Math.random() * 10000);
                            const fresh = `/api/thumbnail/get?path=${encodeURIComponent(activePath)}&cb=${bust}`;
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
                                const headUrl = new URL('/api/thumbnail/get', window.location.origin);
                                headUrl.searchParams.set('path', activePath);
                                headUrl.searchParams.set('cb', Date.now().toString());
                                const hr = await fetch(headUrl.toString(), { method: 'HEAD', cache: 'no-store' });
                                if (hr.ok) {
                                    const bust2 = Date.now() + Math.floor(Math.random() * 10000);
                                    const finalUrl = `/api/thumbnail/get?path=${encodeURIComponent(activePath)}&cb=${bust2}`;
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
                            const fresh = `/api/thumbnail/get?path=${encodeURIComponent(activePath)}&cb=${bust}`;
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
                if (!videoEl) {
                    return;
                }
                if (videoEl.paused) safePlay(videoEl);
                else videoEl.pause();
            });
        }
        if (btnMute && !btnMute._wired) {
            btnMute._wired = true;
            btnMute.addEventListener('click', () => {
                if (!videoEl) {
                    return;
                }
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
                if (!videoEl) {
                    return;
                }
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
        if (btnAddMarker && !btnAddMarker._wired) {
            btnAddMarker._wired = true;
            btnAddMarker.addEventListener('click', async () => {
                if (!currentPath || !videoEl) {
                    return;
                }
                const t = Math.max(0, videoEl.currentTime || 0);
                try {
                    const url = new URL('/api/marker', window.location.origin);
                    url.searchParams.set('path', currentPath);
                    url.searchParams.set('time', String(t.toFixed(3)));
                    const r = await fetch(url, { method: 'POST' });
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
    }
    // Auto-restore last played video on initial load if:
    // - No video currently open
    // - Library tab is still active (user hasn't explicitly opened a file yet)
    // - A valid last entry exists and file still appears in current listing fetch
    async function tryAutoResumeLast() {
        try {
            if (currentPath) {
                return;
            }
            // something already playing/selected
            const last = getLastVideoEntry();
            if (!last || !last.path) {
                return;
            }
            // Defer until at least one library load attempt has happened (totalFiles initialized)
            if (typeof totalFiles === 'undefined') {
                setTimeout(tryAutoResumeLast, 600);
                return;
            }
            // Attempt a HEAD on metadata to validate existence
            const p = last.path;
            // Use existing metadata endpoint (was /api/videos/meta, which doesn't exist and triggered 404s)
            const metaUrl = '/api/metadata/get?path=' + encodeURIComponent(p);
            // Avoid generating 404s: consult unified artifact status instead of probing cover directly.
            let exists = false;
            try {
                window.__artifactStatus = window.__artifactStatus || {};
                if (window.__artifactStatus[p]) {
                    exists = true;
                    // path known (even if cover missing) -> we still attempt open;
                    // player logic will guard loaders
                }
                else {
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
            }
            catch (_) { }
            if (!exists) {
                return;
            }
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
                        if (!k) {
                            continue;
                        }
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
            lsRemove('mediaPlayer:skipSaveOnUnload');
        }
        catch (_) { }
        setTimeout(tryAutoResumeLast, 800);
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
            if (!videoEl) {
                return;
            }
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
            if (!videoEl) {
                return;
            }
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
        }, { passive: false });
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
            // THUMBNAIL_ASYNC: REFRESH FUNCTION start – attempts to resolve & load latest cover image for sidebar + grid
            if (!fiThumbnailWrap || !fiThumbnailImg || !path) {
                return;
            }
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
            // Prefer API cover endpoint (abstracts artifact location) then fallback direct artifact paths
            const parts = path.split('/');
            const fname = parts.pop();
            if (!fname) {
                return;
            }
            const parent = parts.join('/');
            const stem = fname.replace(/\.[^.]+$/, '');
            const coverAPI = `/api/thumbnail/get?path=${encodeURIComponent(path)}&cb=${Date.now()}`;
            const enc = (p) => p.split('/').filter(Boolean)
                .map(encodeURIComponent)
                .join('/');
            const parentEnc = enc(parent);
            const artPath = ['/files', parentEnc, '.artifacts', stem + '.thumbnail.jpg'].filter(Boolean).join('/');
            const sibPath = ['/files', parentEnc, stem + '.thumbnail.jpg'].filter(Boolean).join('/');
            const candidates = [coverAPI, (artPath.startsWith('/') ? artPath : '/' + artPath), (sibPath.startsWith('/') ? sibPath : '/' + sibPath)];
            let loaded = false;
            for (const c of candidates) {
                if (loaded) {
                    break;
                }
                // If candidate is the cover API we already have cache bust param.
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
                if (!c.startsWith('/api/thumbnail/get')) {
                    try {
                        const head = await fetch(base.replace(/\?(?=[^?]*$).*/, (m) => m), { method: 'HEAD', cache: 'no-store' });
                        if (!head.ok) {
                            continue;
                        }
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
    // Rating (1..5) and Description (text) wiring
    // -----------------------------
    const RD_LS_PREFIX = 'mediaPlayer:meta:'; // fallback persistence
    function keyRating(p) {
        return `${RD_LS_PREFIX}rating:${p}`;
    }
    function keyDesc(p) {
        return `${RD_LS_PREFIX}desc:${p}`;
    }
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
            try {
                b.textContent = on ? '★' : '☆';
            }
            catch (_) { }
        });
    }
    async function loadRatingAndDescription() {
        if (!currentPath) return;
        // Resolve elements each call (script loads before DOM)
        const group = document.getElementById('videoRating');
        const desc = document.getElementById('videoDescription');
        // Reset UI defaults
        if (group) setStarsVisual(0);
        if (desc) {
            try {
                desc.textContent = ' '; desc.setAttribute('data-empty', '1');
            }
            catch (_) { }
        }
        // Try backend unified info and local fallback; prefer localStorage if present
        let ratingServer = null; let ratingLocal = null; let description = null;
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
            }
        }
        catch (_) { }
        // Also check localStorage (client preference wins if present)
        try {
            const v = Number(localStorage.getItem(keyRating(currentPath)));
            if (Number.isFinite(v) && v >= 0 && v <= 5) ratingLocal = v;
        }
        catch (_) { }
        if (description == null) {
            try {
                const v = localStorage.getItem(keyDesc(currentPath));
                if (typeof v === 'string') description = v;
            }
            catch (_) { }
        }
        // Apply UI (allow 0 rating explicitly)
        try {
            if (group) {
                const chosen = (ratingLocal != null ? ratingLocal : ratingServer);
                const rv = Number.isFinite(chosen) ? Number(chosen) : 0;
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
        }
        catch (_) { }
    }
    async function saveRating(r) {
        if (!currentPath || !Number.isFinite(r)) return;
        // Special case: 0 means "clear/unset" — persist locally and skip server if unsupported
        if (r === 0) {
            try {
                localStorage.removeItem(keyRating(currentPath));
            }
            catch (_) { }
            // Update UI immediately (already done by caller via setStarsVisual)
            return;
        }
        let saved = false;
        try {
            const u = new URL('/api/media/rating', window.location.origin);
            u.searchParams.set('path', currentPath);
            u.searchParams.set('rating', String(Math.max(1, Math.min(5, r))));
            const resp = await fetch(u.toString(), { method: 'POST' });
            if (resp.ok) saved = true;
        }
        catch (_) { }
        if (!saved) {
            try {
                localStorage.setItem(keyRating(currentPath), String(r));
            }
            catch (_) { }
        }
    }
    async function saveDescription(text) {
        if (!currentPath) return;
        let saved = false;
        try {
            const u = new URL('/api/media/description', window.location.origin);
            u.searchParams.set('path', currentPath);
            const resp = await fetch(u.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: text || '' }) });
            if (resp.ok) saved = true;
        }
        catch (_) { }
        if (!saved) {
            try {
                localStorage.setItem(keyDesc(currentPath), text || '');
            }
            catch (_) { }
        }
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
            // Initialize with outline until load applies actual rating
            if (!b.textContent || /[^★☆]/.test(b.textContent)) {
                try {
                    b.textContent = '☆';
                }
                catch (_) { }
            }
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
                    if (!b.textContent || /[^★☆]/.test(b.textContent)) {
                        try {
                            b.textContent = '☆';
                        }
                        catch (_) { }
                    }
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
            // THUMBNAIL_ASYNC: SIDEBAR BUTTON HANDLER start – generates cover then polls refreshSidebarThumbnail
            if (!videoEl || !currentPath) {
                return;
            }
            try {
                const t = Math.max(0, videoEl.currentTime || 0);
                const u = new URL('/api/thumbnail/create', window.location.origin);
                u.searchParams.set('path', currentPath);
                u.searchParams.set('t', t.toFixed(3));
                u.searchParams.set('overwrite', 'true');
                const r = await fetch(u, { method: 'POST' });
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
    // Hook: whenever currentPath changes elsewhere, caller should invoke refreshSidebarThumbnail(currentPath)
    // Lightweight mutation watcher on video src to refresh automatically
    function _maybeRefreshThumb() {
        const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : currentPath);
        if (p) refreshSidebarThumbnail(p);
    }
    if (window.MutationObserver && videoEl && !videoEl._thumbWatch) {
        const mo = new MutationObserver(_maybeRefreshThumb);
        mo.observe(videoEl, { attributes: true, attributeFilter: ['src'] });
        videoEl._thumbWatch = mo;
    }
    // -----------------------------
    // Floating overlay title bar logic
    // -----------------------------
    function showOverlayBar() {
        try {
            if (!overlayBarEl) overlayBarEl = document.getElementById('playerOverlayBar');
            if (!overlayBarEl) {
                return;
            }
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
            if (!videoEl) {
                return;
            }
            const main = videoEl.parentElement;
            // Click to commit
            if (!main || main._overlayWired) {
                return;
            }
            main._overlayWired = true;
            ['mousemove', 'touchstart'].forEach((ev) => {
                main.addEventListener(ev, () => showOverlayBar(), { passive: true });
            });
            [overlayBarEl, scrubberEl].forEach((el) => {
                if (!el) {
                    return;
                }
                // Keep overlay visible while interacting with controls/scrubber
                try {
                    el.addEventListener('mouseenter', () => showOverlayBar(), { passive: true });
                    el.addEventListener('mousemove', () => showOverlayBar(), { passive: true });
                    el.addEventListener('mouseleave', () => showOverlayBar(), { passive: true });
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
        if (!videoEl || !scrubberEl) {
            return;
        }
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
        if (!scrubberEl || scrubberRAF) {
            return;
        }
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
        if (!videoEl || !scrubberTrackEl) {
            return;
        }
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
        if (!scrubberTrackEl || scrubberTrackEl._wired) {
            return;
        }
        scrubberTrackEl._wired = true;
        const onDown = (e) => {
            if (!videoEl) {
                return;
            }
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
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('mouseup', onUp, { once: true });
            window.addEventListener('touchend', onUp, { once: true });
            e.preventDefault();
        };
        const onMove = (e) => {
            if (!scrubberDragging) {
                return;
            }
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
        scrubberTrackEl.addEventListener('touchstart', onDown, { passive: true });
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
            try {
                console.info('[player] setting video src', { path: path, encPath: encPath, url: finalUrl });
            }
            catch (_) { }
            videoEl.src = finalUrl;
            // Fire a HEAD probe (non-blocking) to validate existence/MIME and surface status in logs
            try {
                const urlNoBust = src.toString();
                fetch(urlNoBust, { method: 'HEAD' })
                    .then((r) => {
                        try {
                            console.info('[player] HEAD /files status', r.status, r.headers.get('content-type'));
                        }
                        catch (_) { }
                    })
                    .catch((e) => {
                        try {
                            console.error('[player] HEAD /files failed', e);
                        }
                        catch (_) { }
                    });
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
                ['loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'suspend', 'abort', 'emptied', 'waiting', 'seeking', 'seeked', 'ended'].forEach((t) => {
                    videoEl.addEventListener(t, logEvt);
                });
            }
            if (!videoEl._errWired) {
                videoEl._errWired = true;
                videoEl.addEventListener('error', (e) => {
                    try {
                        const err = (videoEl.error ? { code: videoEl.error.code, message: videoEl.error.message } : null);
                        console.error('[player:error] Video failed to load', {
                            currentSrc: videoEl.currentSrc || videoEl.src,
                            readyState: videoEl.readyState,
                            networkState: videoEl.networkState,
                            error: err,
                        });
                    }
                    catch (_) { }
                });
            }
            // Defer autoplay decision to loadedmetadata restore
            // Attempt to keep lastVideo reference for convenience
            saveProgress(path, { t: 0, d: 0, paused: true, rate: 1 });
            startScrubberLoop();
            videoEl.addEventListener('ended', () => stopScrubberLoop(), { once: true });
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
                            if (!startAtIntro) {
                                return;
                            }
                            // prefer localStorage per-path key first
                            const key = `${LS_PREFIX}:introEnd:${path}`;
                            const raw = lsGet(key);
                            let t = null;
                            if (raw && Number.isFinite(Number(raw))) t = Number(raw);
                            else if (typeof introEnd !== 'undefined' && introEnd && Number.isFinite(Number(introEnd))) t = Number(introEnd);
                            if (t !== null && Number.isFinite(t) && t > 0 && videoEl.duration && t < videoEl.duration) {
                                let done = false;
                                const onSeek = () => {
                                    if (done) {
                                        return;
                                    }
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
            }, { once: true });
        }
        // Update floating title bar if present
        try {
            const titleTarget = document.getElementById('playerTitle');
            if (titleTarget) {
                const rawName = path.split('/').pop() || path;
                const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
                titleTarget.textContent = baseName;
                if (overlayBarEl && baseName) {
                    delete overlayBarEl.dataset.empty;
                }
                if (typeof showOverlayBar === 'function') showOverlayBar();
            }
        }
        catch (_) { }
        // Metadata and title
        (async () => {
            try {
                const url = new URL('/api/metadata/get', window.location.origin);
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
                if (overlayBarEl && baseName) {
                    delete overlayBarEl.dataset.empty;
                }
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
        if (!currentPath) {
            return;
        }
        const perfListEl = document.getElementById('videoPerformers');
        const tagListEl = document.getElementById('videoTags');
        if (!perfListEl || !tagListEl) {
            return;
        }
        perfListEl.innerHTML = '';
        tagListEl.innerHTML = '';
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
    }
    function renderChipSet(container, items, kind) {
        if (!container) {
            return;
        }
        container.innerHTML = '';
        (items || []).forEach((item) => {
            if (!item || typeof item !== 'string') {
                return;
            }
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = item;
            const rm = document.createElement('span');
            rm.className = 'remove';
            rm.textContent = '×';
            chip.appendChild(rm);
            chip.title = 'Remove ' + kind;
            chip.addEventListener('click', () => removeChip(kind, item));
            container.appendChild(chip);
        });
    }
    function wireChipInputs() {
        const perfInput = document.getElementById('videoPerformerInput');
        const tagInput = document.getElementById('videoTagInput');
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
        }
    }
    async function addChip(kind, value) {
        if (!currentPath || !value) {
            return;
        }
        try {
            const ep = kind === 'performer' ? '/api/media/performers/add' : '/api/media/tags/add';
            const url = new URL(ep, window.location.origin);
            url.searchParams.set('path', currentPath);
            url.searchParams.set(kind, value);
            const r = await fetch(url.toString(), { method: 'POST' });
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
        if (!currentPath || !value) {
            return;
        }
        try {
            const ep = kind === 'performer' ? '/api/media/performers/remove' : '/api/media/tags/remove';
            const url = new URL(ep, window.location.origin);
            url.searchParams.set('path', currentPath);
            url.searchParams.set(kind, value);
            const r = await fetch(url.toString(), { method: 'POST' });
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
            const ctx = canvas.getContext('2d', { willReadFrequently: false });
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
                        if (!bb) {
                            continue;
                        }
                        let x = Math.max(0, Math.floor(bb.x || 0));
                        let y = Math.max(0, Math.floor(bb.y || 0));
                        let w = Math.max(0, Math.floor(bb.width || 0));
                        let h = Math.max(0, Math.floor(bb.height || 0));
                        if (w <= 1 || h <= 1) {
                            continue;
                        }
                        const minFrac = Math.min(w / W, h / H);
                        if (minFrac < minSizeFrac) {
                            continue;
                        }
                        faces.push({
                            time: Number(t.toFixed(3)),
                            box: [x, y, w, h],
                            score: 1.0,
                        });
                    }
                }
                catch (err) {
                    // continue on errors
                }
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
                const head = await fetch('/api/faces/get?path=' + encodeURIComponent(currentPath), { method: 'HEAD' });
                if (head.ok) {
                    overwrite = confirm('faces.json already exists for this video. Replace it with browser-detected faces?');
                    if (!overwrite) {
                        return;
                    }
                }
            }
            catch (_) { }
            // Upload
            const payload = { faces: faces, backend: 'browser-facedetector', stub: false };
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
        if (!currentPath) {
            return;
        }
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
                const ju = new URL('/api/heatmaps/json', window.location.origin);
                ju.searchParams.set('path', currentPath);
                const jr = await fetch(ju.toString(), {
                    headers: { Accept: 'application/json' },
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
            catch (_) {

                /* ignore and fallback to PNG probe */
            }
            if (!renderedViaJson) {
                const url = '/api/heatmaps/png?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
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
            if (!heatmapCanvasEl) {
                return;
            }
            const ctx = heatmapCanvasEl.getContext('2d', { willReadFrequently: false });
            if (!ctx) {
                return;
            }
            const w = heatmapCanvasEl.width = heatmapCanvasEl.clientWidth || heatmapCanvasEl.offsetWidth || 800;
            const h = heatmapCanvasEl.height = heatmapCanvasEl.clientHeight || heatmapCanvasEl.offsetHeight || 24;
            ctx.clearRect(0, 0, w, h);
            if (!Array.isArray(samples) || !samples.length) return;
            // Normalize samples: accept [number] or [{ v, t? }] or mixed
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
                    const copy = resampled.slice().filter((x) => Number.isFinite(x))
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
            if (!heatmapCanvasEl) {
                return;
            }
            const ctx = heatmapCanvasEl.getContext('2d');
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, heatmapCanvasEl.width, heatmapCanvasEl.height);
        }
        catch (_) { }
    }
    async function loadSprites() {
        // initialize
        sprites = null;
        if (!currentPath) {
            return;
        }
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
                sprites = { index, sheet };
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
        if (!currentPath) {
            return;
        }
        try {
            const st = window.__artifactStatus && window.__artifactStatus[currentPath];
            if (st && st.scenes === false) {
                if (!badgeScenesStatus && badgeScenes) {
                    try {
                        badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
                    }
                    catch (_) { }
                }
                if (badgeScenesStatus) badgeScenesStatus.textContent = '0';
                if (badgeScenes) badgeScenes.dataset.present = '0';
                applyTimelineDisplayToggles();
                return;
            }
        }
        catch (_) { }
        try {
            const u = new URL('/api/scenes/get', window.location.origin);
            u.searchParams.set('path', currentPath);
            const r = await fetch(u);
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            const data = await r.json();
            const d = data?.data || {};
            const arr = d.scenes && Array.isArray(d.scenes) ? d.scenes : d.markers || [];
            // intro_end may be present as a top-level numeric field
            introEnd = Number.isFinite(Number(d.intro_end)) ? Number(d.intro_end) : null;
            scenes = arr
                .map((s) => ({ time: Number(s.time || s.t || s.start || 0) }))
                .filter((s) => Number.isFinite(s.time));
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
        if (attempt > 12) {
            return;
        }
        // ~3s max (12 * 250ms)
        sceneTickRetryTimer = setTimeout(() => scheduleSceneTicksRetry(attempt + 1), 250);
    }
    async function loadSubtitles() {
        subtitlesUrl = null;
        if (!currentPath || !videoEl) {
            return;
        }
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
            const test = await fetch('/api/subtitles/get?path=' + encodeURIComponent(currentPath));
            if (test.ok) {
                const src = '/api/subtitles/get?path=' + encodeURIComponent(currentPath) + `&t=${Date.now()}`;
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
        if (!markersEl) {
            return;
        }
        markersEl.innerHTML = '';
        const haveScenes = Array.isArray(scenes) && scenes.length > 0;
        // Always refresh sidebar list even before metadata duration is known
        try {
            renderMarkersList();
        }
        catch (_) { }
        if (!haveScenes) {
            return;
        }
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
                im.title = 'Intro end: ' + fmtTime(introEnd);
                markersEl.appendChild(im);
            }
            if (typeof outroBegin !== 'undefined' && Number.isFinite(Number(outroBegin)) && duration && outroBegin > 0 && outroBegin < duration) {
                const pct = (outroBegin / duration) * 100;
                const om = document.createElement('div');
                om.className = 'outro-marker-tick';
                om.style.left = `calc(${pct}% - 3px)`;
                om.title = 'Outro begin: ' + fmtTime(outroBegin);
                markersEl.appendChild(om);
            }
        }
        catch (_) { }
    }
    // Sidebar Markers List DOM rendering
    function renderMarkersList() {
        const list = document.getElementById('markersList');
        if (!list) {
            return;
        }
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
            const { label, timeSec, variantClass, editableName, editableTime, onJump, onDelete, strongLabel } = options;
            const frag = tpl.content.cloneNode(true);
            const row = frag.querySelector('.marker-row');
            if (!row) {
                return null;
            }
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
                            e.preventDefault(); startMarkerNameEdit(nameLabel, editableName);
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
                            e.preventDefault(); startMarkerTimeEdit(timeLabel, editableTime);
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
                const introKey = `${LS_PREFIX}:introEnd:${currentPath}`;
                const rawIntro = currentPath ? lsGet(introKey) : null;
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
                            try {
                                lsRemove(`${LS_PREFIX}:introEnd:${currentPath}`);
                            }
                            catch (_) { }
                            // also remove server-side
                            try {
                                const mu = new URL('/api/scenes/intro', window.location.origin);
                                mu.searchParams.set('path', currentPath);
                                await fetch(mu.toString(), { method: 'DELETE' });
                            }
                            catch (_) { }
                            notify('Intro end cleared', 'success');
                            await loadScenes();
                            renderMarkersList();
                        }
                        catch (_) {
                            notify('Failed to clear intro end', 'error');
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
                const outroKey = `${LS_PREFIX}:outroBegin:${currentPath}`;
                const rawOutro = currentPath ? lsGet(outroKey) : null;
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
                            try {
                                lsRemove(`${LS_PREFIX}:outroBegin:${currentPath}`);
                            }
                            catch (_) { }
                            notify('Outro begin cleared', 'success');
                            outroBegin = null;
                            renderMarkers();
                            renderMarkersList();
                        }
                        catch (_) {
                            notify('Failed to clear outro begin', 'error');
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
            const url = new URL('/api/marker/update', window.location.origin);
            url.searchParams.set('path', currentPath || '');
            url.searchParams.set('old_time', String(sceneObj.time || 0));
            url.searchParams.set('new_time', String(clamped));
            const r = await fetch(url.toString(), { method: 'POST' });
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
        if (!labelEl || labelEl._editing) {
            return;
        }
        labelEl._editing = true;
        const parent = labelEl.parentElement;
        if (!parent) {
            return;
        }
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
        if (!labelEl || labelEl._editing) {
            return;
        }
        labelEl._editing = true;
        const parent = labelEl.parentElement;
        if (!parent) {
            return;
        }
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
            const url = new URL('/api/marker/update', window.location.origin);
            url.searchParams.set('path', currentPath || '');
            url.searchParams.set('old_time', String(sceneObj.time || 0));
            url.searchParams.set('new_time', String(sceneObj.time || 0));
            url.searchParams.set('type', sceneObj.type || 'scene');
            if (newLabel !== null) url.searchParams.set('label', newLabel);
            const r = await fetch(url.toString(), { method: 'POST' });
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
            if (!parent) {
                return;
            }
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
            const url = new URL('/api/marker/delete', window.location.origin);
            url.searchParams.set('path', currentPath || '');
            url.searchParams.set('time', String(sceneObj.time || 0));
            const r = await fetch(url.toString(), { method: 'POST' });
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
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
        if (!btn || btn._wired) {
            return;
        }
        btn._wired = true;
        btn.addEventListener('click', async () => {
            if (!currentPath || !videoEl) {
                return;
            }
            const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
            try {
                const url = new URL('/api/marker', window.location.origin);
                url.searchParams.set('path', currentPath);
                url.searchParams.set('time', String(t.toFixed(3)));
                const r = await fetch(url.toString(), { method: 'POST' });
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
    function renderSidebarScenes() {

        /* list removed in compact sidebar */
    }
    let spriteHoverEnabled = false;
    async function loadArtifactStatuses() {
        if (!currentPath) {
            return;
        }
        // Lazy acquire (in case of markup changes) without assuming globals exist
        const badgeThumbnail = window.badgeThumbnail || document.getElementById('badge-thumbnail');
        const badgeThumbnailStatus = window.badgeThumbnailStatus || document.getElementById('badge-thumbnail-status');
        const badgeHover = window.badgeHover || document.getElementById('badge-hover');
        const badgeHoverStatus = window.badgeHoverStatus || document.getElementById('badge-hover-status');
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
            // Backend returns `cover` (thumbnail) and `heatmap` (singular). Support both shapes.
            set(Boolean(d.thumbnail ?? d.cover), badgeThumbnail, badgeThumbnailStatus);
            set(Boolean(d.hover), badgeHover, badgeHoverStatus);
            set(Boolean(d.sprites), badgeSprites, badgeSpritesStatus);
            set(Boolean(d.scenes), badgeScenes, badgeScenesStatus);
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
                [badgeHover, badgeHoverStatus],
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
            if (!currentPath) {
                return;
            }
            // Capability gating: map kind -> operation type
            try {
                const caps = (window.tasksManager && window.tasksManager.capabilities) || window.__capabilities || {};
                const needsFfmpeg = new Set([
                    'heatmaps',
                    'scenes',
                    'sprites',
                    'hover',
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
                else if (kind === 'scenes') url = new URL('/api/scenes/create', window.location.origin);
                else if (kind === 'subtitles') url = new URL('/api/subtitles/create', window.location.origin);
                else if (kind === 'sprites') url = new URL('/api/sprites/create', window.location.origin);
                else if (kind === 'faces') url = new URL('/api/faces/create', window.location.origin);
                else if (kind === 'hover') url = new URL('/api/hover/create', window.location.origin);
                else if (kind === 'phash') url = new URL('/api/phash/create', window.location.origin);
                else return;
                url.searchParams.set('path', currentPath);
                // Mark badge loading before request to give immediate feedback
                const badgeEl = document.getElementById(`badge-${kind}`) || document.getElementById(`badge-${kind.toLowerCase()}`);
                if (badgeEl) {
                    badgeEl.dataset.loading = '1';
                }
                const r = await fetch(url.toString(), { method: 'POST' });
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
                            else if (kind === 'scenes') present = Boolean(st.scenes);
                            else if (kind === 'subtitles') present = Boolean(st.subtitles);
                            else if (kind === 'sprites') present = Boolean(st.sprites);
                            else if (kind === 'faces') present = Boolean(st.faces);
                            else if (kind === 'hover') present = Boolean(st.hover);
                            else if (kind === 'phash') present = Boolean(st.phash);
                        }
                        if (present) {
                            // Load any richer data renderers once present
                            if (kind === 'heatmaps') await loadHeatmaps();
                            else if (kind === 'scenes') await loadScenes();
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
            if (!btn || btn._wired) {
                return;
            }
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
        const bHover = document.getElementById('badge-hover') || badgeHover;
        const bPhash = document.getElementById('badge-phash') || badgePhash;
        attach(bHeat, 'heatmaps');
        attach(bScenes, 'scenes');
        attach(bSubs, 'subtitles');
        attach(bSprites, 'sprites');
        attach(bFaces, 'faces');
        attach(bHover, 'hover');
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
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                return;
            }
            if (e.code === 'Space') {
                e.preventDefault();
                if (!videoEl) {
                    return;
                }
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
    return { open, showOverlayBar, detectAndUploadFacesBrowser, getPath };
})();
window.Player = Player;
// Player module assigned to window
// -----------------------------
// Global: Pause video when leaving Player tab
// -----------------------------
(function setupTabPause() {
    function pauseIfNotActive(activeId) {
        try {
            if (!window.Player) {
                return;
            }
            const v = document.getElementById('playerVideo');
            if (!v) {
                return;
            }
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
            obs.observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] });
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
    const filterRanges = document.querySelectorAll(
        '#effectsPanel input[type=range][data-fx]',
    );
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    // Removed transform controls
    const presetButtons = document.querySelectorAll('#effectsPanel .fx-preset');
    const valueSpans = document.querySelectorAll('#effectsPanel [data-fx-val]');
    const COLOR_MATRIX_NODE = document.getElementById('playerColorMatrixValues');
    // Sidebar collapse persistence
    const LS_KEY_SIDEBAR = 'mediaPlayer:sidebarCollapsed';
    function applySidebarCollapsed(fromLoad = false) {
        if (!sidebar || !toggleBtn) {
            return;
        }
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
        if (!lsGet(LS_KEY_SIDEBAR) && window.innerWidth < 1500) {
            lsSet(LS_KEY_SIDEBAR, '1');
        }
    }
    catch (_) { }
    applySidebarCollapsed(true);
    if (toggleBtn && !toggleBtn._wired) {
        toggleBtn._wired = true;
        toggleBtn.addEventListener('click', () => toggleSidebar());
    }
    const LS_KEY_EFFECTS = 'mediaPlayer:effects';
    const state = { r: 1, g: 1, b: 1, blur: 0 };
    function loadState() {
        try {
            const saved = JSON.parse(lsGet(LS_KEY_EFFECTS) || '{}');
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
            lsSet(LS_KEY_EFFECTS, JSON.stringify(state));
        }
        catch (_) { }
    }
    function applyEffects() {
        if (!stage) {
            return;
        }
        if (COLOR_MATRIX_NODE) {
            const { r, g, b } = state;
            const matrix = [
                r,
                0,
                0,
                0,
                0,
                0,
                g,
                0,
                0,
                0,
                0,
                0,
                b,
                0,
                0,
                0,
                0,
                0,
                1,
                0,
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
        if (!k) {
            return;
        }
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
        if (!sidebar || !toggleBtn) {
            return;
        }
        const collapsed = sidebar.getAttribute('data-collapsed') === 'true';
        const next = !collapsed;
        try {
            lsSet(LS_KEY_SIDEBAR, next ? '1' : '0');
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
    if (!infoToggle || !infoDrawer || infoToggle._wired) {
        return;
    }
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
            if (
                a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
            ) {
                return;
            }
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
// Sidepanel collapse (new simplified sidebar replacement)
function wireSidepanel() {
    // Sidebar removed;
    // function retained as a no-op for backward compatibility.
    return;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSidepanel, { once: true });
}
else {
    wireSidepanel();
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
    let mergeBtn;
    let deleteBtn;
    let dropZone;
    let statusEl;
    let performers = [];
    let selected = new Set();
    let searchTerm = '';
    // Sort state (default: by count desc)
    let sortBy = 'count'; // 'count' | 'name'
    // sortDir: 1 = ascending, -1 = descending
    let sortDir = -1;
    // Pagination state
    let page = 1;
    let pageSize = 32;
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
    // Debounced search trigger (shared helper)
    let searchTimer = null; // retained only if we decide to cancel externally (not used now)
    let lastFocusedIndex = -1;
    // for keyboard navigation
    let shiftAnchor = null;
    // for shift range selection
    function initDom() {
        if (gridEl) {
            return;
        }
        gridEl = document.getElementById('performersGrid');
        searchEl = document.getElementById('performerSearch');
        countEl = document.getElementById('performersCount');
        addBtn = document.getElementById('performerAddBtn');
        importBtn = document.getElementById('performerImportBtn');
        mergeBtn = document.getElementById('performerMergeBtn');
        deleteBtn = document.getElementById('performerDeleteBtn');
        dropZone = document.getElementById('performerDropZone');
        statusEl = document.getElementById('performersStatus');
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
    }
    function setStatus(msg, showFlag = true) {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = msg || '';
        if (showFlag) showAs(statusEl, 'block');
        else hide(statusEl);
    }
    function tpl(id) {
        const t = document.getElementById(id);
        return t ? t.content.cloneNode(true) : null;
    }
    function render() {
        if (!gridEl) {
            return;
        }
        gridEl.innerHTML = '';
        const frag = document.createDocumentFragment();
        const termLower = searchTerm.toLowerCase();
        // Filter by search text
        let filtered = performers.filter(
            (p) => !termLower || p.name.toLowerCase().includes(termLower),
        );
        // Apply sort
        const cmp = (a, b) => {
            if (sortBy === 'name') {
                const an = (a.name || '').toLowerCase();
                const bn = (b.name || '').toLowerCase();
                if (an < bn) return -1;
                if (an > bn) return 1;
                // tie-breaker: count desc then norm
                const cd = (b.count || 0) - (a.count || 0);
                if (cd !== 0) return cd;
                return (a.norm || '').localeCompare(b.norm || '');
            }
            // default count
            const cd = (b.count || 0) - (a.count || 0);
            if (cd !== 0) return cd;
            return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        };
        filtered.sort((a, b) => sortDir * cmp(a, b));
        // setup pagination
        const total = filtered.length || 0;
        const pages = total ? Math.max(1, Math.ceil(total / pageSize)) : 1;
        if (page > pages) page = pages;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageItems = filtered.slice(start, end);
        if (addBtn) {
            const exact = filtered.some((p) => p.name.toLowerCase() === termLower);
            if (searchTerm && !exact) showAs(addBtn, 'inline-block');
            else hide(addBtn);
            addBtn.textContent = `Add '${searchTerm}'`;
            addBtn.disabled = !searchTerm;
        }
        if (countEl) {
            const total = performers.length;
            countEl.textContent = filtered.length === total ? `${total} performer${total === 1 ? '' : 's'}` : `${filtered.length} of ${total}`;
        }
        if (filtered.length === 0) {
            const node = tpl('emptyHintTemplate');
            if (node) {
                const el = node.querySelector('.empty-hint');
                if (el) el.textContent = 'No performers found.';
                gridEl.appendChild(node);
            }
        }
        else {
            pageItems.forEach((p) => {
                const node = tpl('performerCardTemplate');
                if (!node) return;
                const card = node.querySelector('.perf-card');
                const nameEl = node.querySelector('.pc-name');
                const avatarEl = node.querySelector('.pc-avatar');
                const countEl = node.querySelector('.pc-count');
                if (card) {
                    card.dataset.norm = p.norm;
                    if (selected.has(p.norm)) card.dataset.selected = '1';
                    card.tabIndex = 0;
                    card.onclick = (e) => handleCardClick(e, p, filtered);
                    card.onkeydown = (e) => handleCardKey(e, p, filtered);
                }
                if (nameEl) nameEl.textContent = p.name;
                if (avatarEl) avatarEl.title = p.name;
                if (countEl) {
                    countEl.textContent = `${p.count}`;
                    countEl.title = `${p.count} file${p.count === 1 ? '' : 's'}`;
                }
                frag.appendChild(node);
            });
            gridEl.appendChild(frag);
        }
        // pager UI
        const infoText = total ? `Page ${page} / ${pages} • ${total} total` : '—';
        if (pager && pageInfo && prevBtn && nextBtn) {
            pageInfo.textContent = infoText;
            prevBtn.disabled = page <= 1;
            nextBtn.disabled = page >= pages;
        }
        if (pagerB && pageInfoB && prevBtnB && nextBtnB) {
            pageInfoB.textContent = infoText;
            prevBtnB.disabled = page <= 1;
            nextBtnB.disabled = page >= pages;
        }
        updateSelectionUI();
        // Ensure performers grid loads on page load (idempotent)
        if (!window.__perfAutoFetched) {
            window.__perfAutoFetched = true;
            window.addEventListener('DOMContentLoaded', () => {
                if (window.fetchPerformers) window.fetchPerformers();
            }, { once: true });
        }
    }
    function updateSelectionUI() {
        document.querySelectorAll('.perf-card').forEach((c) => {
            if (selected.has(c.dataset.norm)) c.dataset.selected = '1';
            else c.removeAttribute('data-selected');
        });
        const multi = selected.size >= 2;
        if (mergeBtn) mergeBtn.disabled = !multi;
        if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    }
    async function fetchPerformers() {
        initDom();
        try {
            // fetchPerformers called
            setStatus('Loading…', true);
            const url = new URL('/api/performers', window.location.origin);
            if (searchTerm) url.searchParams.set('search', searchTerm);
            // Add debug=true to print detailed counts and index/cache info in the server log while we troubleshoot 0 counts
            url.searchParams.set('debug', 'true');
            const r = await fetch(url);
            const j = await r.json();
            // performers response loaded
            performers = j?.data?.performers || [];
            setStatus('', false);
            // Reset to first page on new fetch to keep UX sane
            page = 1;
            render();
        }
        catch (e) {
            setStatus('Failed to load performers', true);
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
    }
    const debounceSearch = debounce(fetchPerformers, 400);
    function toggleSelect(norm, opts = { range: false, anchor: false }) {
        if (opts.range && shiftAnchor) {
            // range selection
            const filtered = currentFiltered();
            const aIndex = filtered.findIndex((p) => p.norm === shiftAnchor);
            const bIndex = filtered.findIndex((p) => p.norm === norm);
            if (aIndex > -1 && bIndex > -1) {
                const [start, end] = aIndex < bIndex ? [aIndex, bIndex] : [bIndex, aIndex];
                for (let i = start; i <= end; i++) {
                    selected.add(filtered[i].norm);
                }
                updateSelectionUI();
                return;
            }
        }
        if (selected.has(norm)) selected.delete(norm);
        else selected.add(norm);
        if (opts.anchor) shiftAnchor = norm;
        updateSelectionUI();
    }
    function currentFiltered() {
        const termLower = searchTerm.toLowerCase();
        return performers.filter((p) => !termLower || p.name.toLowerCase().includes(termLower));
    }
    function handleCardClick(e, p, filtered) {
        const norm = p.norm;
        if (e.shiftKey) {
            toggleSelect(norm, { range: true });
            return;
        }
        if (e.metaKey || e.ctrlKey) {
            toggleSelect(norm, { anchor: true });
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
        lastFocusedIndex = filtered.findIndex((x) => x.norm === norm);
    }
    function handleCardKey(e, p, filtered) {
        const norm = p.norm;
        const index = filtered.findIndex((x) => x.norm === norm);
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
            if (i < 0 || i >= filtered.length) {
                return;
            }
            const card = gridEl.querySelector(`.perf-card[data-norm="${filtered[i].norm}"]`);
            if (card) {
                card.focus();
                lastFocusedIndex = i;
            }
        }
        switch (e.key) {
        case ' ':
            toggleSelect(norm, { anchor: true });
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
                selected = new Set(filtered.map((x) => x.norm));
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
        if (!searchTerm) {
            return;
        }
        try {
            await fetch('/api/performers/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: searchTerm }),
            });
            await fetchPerformers();
        }
        catch (_) { }
    }
    async function importPrompt(e) {
        // Default behavior: open file chooser. Hold Alt/Option to fall back to manual paste prompt.
        if (e && e.altKey) {
            const txt = prompt('Paste newline-separated names or JSON array:');
            if (!txt) {
                return;
            }
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
        if (!txt) {
            return;
        }
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
        const val = prompt('Rename performer:', p.name);
        if (!val || val === p.name) {
            return;
        }
        try {
            await fetch('/api/performers/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old: p.name, new: val }),
            });
            await fetchPerformers();
        }
        catch (_) { }
    }
    async function addTagPrompt(p) {
        const tag = prompt('Add tag for ' + p.name + ':');
        if (!tag) {
            return;
        }
        try {
            await fetch('/api/performers/tags/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: p.name, tag: tag }),
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
                body: JSON.stringify({ name: p.name, tag: tag }),
            });
            await fetchPerformers();
        }
        catch (_) { }
    }
    async function mergeSelected() {
        if (selected.size < 2) {
            return;
        }
        const list = [...selected];
        const target = prompt('Merge into (target name):', '');
        if (!target) {
            return;
        }
        try {
            await fetch('/api/performers/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: list.map((n) => performers.find((p) => p.norm === n)?.name || n),
                    to: target,
                }),
            });
            selected.clear();
            await fetchPerformers();
        }
        catch (_) { }
    }
    async function deleteSelected() {
        if (!selected.size) {
            return;
        }
        if (!confirm(`Delete ${selected.size} performer(s)?`)) return;
        for (const norm of [...selected]) {
            const rec = performers.find((p) => p.norm === norm);
            if (!rec) {
                continue;
            }
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
                debounceSearch();
            });
            searchEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchEl.value = '';
                    searchTerm = '';
                    fetchPerformers();
                }
            });
        }
        if (addBtn && !addBtn._wired) {
            addBtn._wired = true;
            addBtn.addEventListener('click', addCurrent);
        }
        if (importBtn && !importBtn._wired) {
            importBtn._wired = true;
            importBtn.addEventListener('click', importPrompt);
        }
        if (mergeBtn && !mergeBtn._wired) {
            mergeBtn._wired = true;
            mergeBtn.addEventListener('click', mergeSelected);
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
            const asc = sortDir === 1;
            sortOrderBtn.textContent = asc ? '▲' : '▼';
            sortOrderBtn.setAttribute('aria-label', asc ? 'Ascending' : 'Descending');
            sortOrderBtn.title = asc ? 'Ascending' : 'Descending';
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
                // default by sortBy
                sortDir = (sortBy === 'name') ? 1 : -1;
            }
        }
        catch (_) { }
        if (sortSel) {
            sortSel.value = sortBy;
            if (!sortSel._wired) {
                sortSel._wired = true;
                sortSel.addEventListener('change', () => {
                    sortBy = sortSel.value === 'name' ? 'name' : 'count';
                    // Default dir: name asc (1), count desc (-1)
                    sortDir = (sortBy === 'name') ? 1 : -1;
                    try {
                        localStorage.setItem('performers:sortBy', sortBy);
                        localStorage.setItem('performers:sortDir', String(sortDir));
                    }
                    catch (_) { }
                    applySortButtonLabel();
                    page = 1;
                    render();
                });
            }
        }
        if (sortOrderBtn && !sortOrderBtn._wired) {
            sortOrderBtn._wired = true;
            // Initialize label
            applySortButtonLabel();
            sortOrderBtn.addEventListener('click', () => {
                sortDir = sortDir === 1 ? -1 : 1;
                try {
                    localStorage.setItem('performers:sortDir', String(sortDir));
                }
                catch (_) { }
                applySortButtonLabel();
                page = 1;
                render();
            });
        }
        const handlePrev = () => {
            if (page > 1) {
                page--; render();
            }
        };
        const handleNext = () => {
            const termLower = searchTerm.toLowerCase();
            const total = performers.filter((p) => !termLower || p.name.toLowerCase().includes(termLower)).length;
            const pages = Math.max(1, Math.ceil(total / pageSize));
            if (page < pages) {
                page++;
                render();
            }
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
        const handlePageSizeChange = (sel) => {
            const v = parseInt(sel.value, 10);
            if (Number.isFinite(v) && v > 0) {
                pageSize = v;
                // keep both selects in sync
                if (pageSizeSel && pageSizeSel !== sel) pageSizeSel.value = String(v);
                if (pageSizeSelB && pageSizeSelB !== sel) pageSizeSelB.value = String(v);
                page = 1;
                render();
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
    // Wire hidden file input fallback
    function wireFileInputOnce() {
        const fileInput = document.getElementById('performerFileInput');
        if (!fileInput || fileInput._wired) return;
        fileInput._wired = true;
        fileInput.addEventListener('change', async () => {
            const files = [...(fileInput.files || [])];
            if (!files.length) {
                return;
            }
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
            if (!modal || !list || !confirmBtn || !closeBtn) {
                return;
            }
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
                                body: JSON.stringify({ names: rawNames }),
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
                        if (!title || !overlay) {
                            return;
                        }
                        const update = () => {
                            const empty = !title.textContent || title.textContent.trim() === '';
                            if (empty) hide(overlay);
                            else show(overlay);
                        };
                        update();
                        const mo = new MutationObserver(update);
                        mo.observe(title, { childList: true, characterData: true, subtree: true });
                        // also watch for attribute changes that may alter visibility
                        mo.observe(overlay, { attributes: true });
                    }
                    catch (_) { }
                })();
            }
        });
    }
    // Wire file input at DOM ready and also opportunistically when tab is shown
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireFileInputOnce, { once: true });
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
        if (document._perfDndAttached) {
            return;
        }
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
                if (!over) {
                    return;
                }
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
    return { show: openPanel };
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
//    TabSystem dispatches a CustomEvent('tabchange', { detail: { activeTab } }) on window.
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
        if (!dz || dz._directClick) {
            return;
        }
        dz._directClick = true;
        dz.addEventListener('click', (ev) => {
            // Ignore if text selection drag ended here
            const fi = document.getElementById('performerFileInput');
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
                const fi = document.getElementById('performerFileInput');
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
                const payload = { path: undefined, recursive: true, use_registry_performers: true, performers: [], tags: [], limit: 800 };
                const r = await fetch('/api/autotag/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
                const payload = { path: undefined, recursive: true, use_registry_performers: true, performers: [], tags: [] };
                const r = await fetch('/api/autotag/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        if (openBtn) openBtn.addEventListener('click', () => {
            open();
            doPreview();
        });
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if (applyBtnFooter) applyBtnFooter.addEventListener('click', doApply);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        modal._wired = true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire, { once: true });
        document.addEventListener('DOMContentLoaded', wirePerformerAutoMatch, { once: true });
    }
    else {
        wire();
        wirePerformerAutoMatch();
    }
})();
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
                catch (_) { /* no-op */ }
            }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire, { once: true });
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
            const r = await fetch('/api/tasks/jobs', { headers: { Accept: 'application/json' }, cache: 'no-store' });
            if (!r.ok) {
                return;
            }
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
        catch (_) { /* silent */ }
    }
    async loadConfigAndApplyGates() {
        try {
            const r = await fetch('/config', {
                headers: { Accept: 'application/json' },
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
                    window.__capabilities = { ...this.capabilities };
                }
                catch (_) { }
            }
        }
        catch (_) {
            // Keep defaults if /config fails
        }
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
            'scenes',
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
                if (!el) {
                    return;
                }
                if (saved && saved[id] !== undefined) {
                    return;
                }
                // user override
                if (el.type === 'checkbox') el.checked = Boolean(val);
                else el.value = val;
            };
            // Mapping artifact -> input ids
            const map = {
                thumbnails: { offset: 'thumbnailOffset' },
                sprites: { interval: 'spriteInterval', width: 'spriteWidth', cols: 'spriteCols', rows: 'spriteRows', quality: 'spriteQuality' },
                previews: { segments: 'previewSegments', duration: 'previewDuration', width: 'previewWidth' },
                phash: { frames: 'phashFrames', algorithm: 'phashAlgo' },
                scenes: { threshold: 'sceneThreshold', limit: 'sceneLimit' },
                heatmaps: { interval: 'heatmapInterval', mode: 'heatmapMode', png: 'heatmapPng' },
                subtitles: { model: 'subtitleModel', language: 'subtitleLang' },
                faces: { interval: 'faceInterval', min_size_frac: 'faceMinSize', backend: 'faceBackend', scale_factor: 'faceScale', min_neighbors: 'faceMinNeighbors', sim_thresh: 'faceSimThresh' },
                embed: { interval: 'embedInterval', min_size_frac: 'embedMinSize', backend: 'embedBackend', sim_thresh: 'embedSimThresh' },
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
        const sel = '#spritesOptions input, #previewsOptions input, #thumbnailsOptions input, #phashOptions select, #phashOptions input, #scenesOptions input, #heatmapsOptions input, #heatmapsOptions select, #subtitlesOptions select, #subtitlesOptions input, #facesOptions input, #facesOptions select, #embedOptions input, #embedOptions select';
        document.querySelectorAll(sel).forEach((el) => {
            if (el._persistWired) {
                return;
            }
            el._persistWired = true;
            const handler = () => {
                const id = el.id;
                if (!id) {
                    return;
                }
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
            'spriteInterval', 'spriteWidth', 'spriteCols', 'spriteRows', 'spriteQuality', 'previewSegments', 'previewDuration', 'previewWidth', 'phashFrames', 'sceneThreshold', 'sceneLimit', 'heatmapInterval', 'thumbnailOffset', 'faceInterval', 'faceMinSize', 'faceScale', 'faceMinNeighbors', 'faceSimThresh', 'embedInterval', 'embedMinSize', 'embedSimThresh',
        ];
        numericIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el._valWired) {
                return;
            }
            el._valWired = true;
            el.addEventListener('blur', () => this.validateNumericInput(el));
        });
    }
    validateNumericInput(el) {
        if (!el) {
            return;
        }
        if (el.type !== 'number') {
            return;
        }
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
            disableIf(
                '[data-operation="thumbnails-missing"], [data-operation="thumbnails-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            disableIf(
                '[data-operation="previews-missing"], [data-operation="previews-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            disableIf(
                '[data-operation="sprites-missing"], [data-operation="sprites-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            disableIf(
                '[data-operation="scenes-missing"], [data-operation="scenes-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            disableIf(
                '[data-operation="heatmaps-missing"], [data-operation="heatmaps-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            disableIf(
                '[data-operation="phash-missing"], [data-operation="phash-all"]',
                true,
                'Disabled: FFmpeg not detected',
            );
            // Player badges
            [
                'badgeHeatmap',
                'badgeScenes',
                'badgeSprites',
                'badgeHover',
                'badgePhash',
            ].forEach((id) => {
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
            disableIf(
                '[data-operation="faces-missing"], [data-operation="faces-all"]',
                true,
                'Disabled: face backends not available',
            );
            disableIf(
                '[data-operation="embed-missing"], [data-operation="embed-all"]',
                true,
                'Disabled: face backends not available',
            );
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
                'FFmpeg not detected — thumbnails, previews, sprites, scenes, heatmaps, and pHash are disabled.',
            );
        }
        if (!caps.subtitles_enabled) {
            issues.push(
                'Subtitles backend unavailable — subtitles generation is disabled.',
            );
        }
        if (!caps.faces_enabled) {
            issues.push(facesMsg);
        }
        let banner = document.getElementById('capabilityBanner');
        // Where to insert: top of the tasks panel container
        const tasksPanel = document.getElementById('tasks-panel');
        const container = tasksPanel ? tasksPanel.querySelector('.tasks-container') : null;
        if (!container) {
            return;
        }
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
        if (window.__JOBS_SSE_UNAVAILABLE) {
            return;
        }
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
                                        window.__activeArtifactSpinners.set(key, { path: file, artifact: art, since: Date.now(), manual: false });
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
            if (btn._opHandlerAttached) {
                return;
            }
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
                if (!el) {
                    return;
                }
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
                    const r = await fetch('/api/tasks/jobs/clear-completed', { method: 'POST' });
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
        const r = await fetch(url.toString(), { method: 'POST' });
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
        if (!btn || btn._wired) {
            return;
        }
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
            const r = await fetch(url, { headers: { Accept: 'application/json' } });
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
            const headUrl = new URL('/api/heatmaps/png', window.location.origin);
            headUrl.searchParams.set('path', path);
            let ok = false;
            for (let i = 0; i < 10; i++) {
                // ~10 quick tries
                const h = await fetch(headUrl.toString(), { method: 'HEAD' });
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
                        await fetch(createUrl, { method: 'POST' });
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
            const imgUrl = new URL('/api/heatmaps/png', window.location.origin);
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
                    if (!confirmed) {
                        return;
                    }
                }
                // Attempt scoped clear if selected-only chosen and supported
                try {
                    // Map frontend artifact keys to backend delete endpoints
                    const endpointMap = {
                        thumbnails: '/api/thumbnail/delete', // (if batch not supported this will be per-file later)
                        previews: '/api/hover/delete',
                        sprites: '/api/sprites/delete',
                        phash: '/api/phash/delete',
                        heatmaps: '/api/heatmaps/delete',
                        metadata: '/api/metadata/delete',
                        subtitles: '/api/subtitles/delete/batch', // batch variant
                        scenes: '/api/scenes/delete',
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
                            body: JSON.stringify({ paths: selPaths }),
                        });
                    }
                    else {
                        resp = await fetch(clearUrl.toString(), { method: 'DELETE' });
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
            console.error('Batch operation failed:', { operation, error });
            this.showNotification(`Failed to start ${operation}: ${error.message}`, 'error');
        }
    }
    // Wire Generate All button: queue all missing artifacts in fast-first order
    wireGenerateAll() {
        const btn = document.getElementById('generateAllBtn');
        if (!btn) {
            return;
        }
        if (btn._wired) {
            return;
        }
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
        case 'scenes':
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
        if (!this._coverageLoaded) {
            return;
        }
        const artifacts = [
            'metadata',
            'thumbnails',
            'sprites',
            'previews',
            'phash',
            'scenes',
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
                if (!b) {
                    return;
                }
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
        const facesData = this.coverage.faces || { processed: 0, total: 0 };
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
            if (!b) {
                return;
            }
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
        catch (error) {
            // Quiet failure during polling
        }
        return null;
    }
    updateJobsDisplay(jobs) {
        const tbody = document.getElementById('jobTableBody');
        if (!tbody) {
            return;
        }
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
                if (tr && tr.dataset && tr.dataset.synthetic === '1') {
                    continue;
                }
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
                if (k === 'previews' || k === 'preview') return 'hover';
                if (k === 'thumbnails' || k === 'covers' || k === 'cover' || k === 'thumb' || k === 'thumbs') return 'thumbnail';
                if (k === 'heatmap' || k === 'heatmaps') return 'heatmaps';
                return k;
            };
            for (const job of jobs) {
                const st = (job.state || '').toLowerCase();
                const isActive = st === 'running' || st === 'queued' || st === 'pending' || st === 'starting';
                if (!isActive) {
                    continue;
                }
                // Prefer explicit artifact field from backend; fallback to heuristic only if absent
                let artifact = normArt(job.artifact || '');
                if (!artifact) {
                    const task = (job.task || '').toLowerCase();
                    if (/scene/.test(task)) artifact = 'scenes';
                    else if (/sprite/.test(task)) artifact = 'sprites';
                    else if (/hover/.test(task)) artifact = 'hover';
                    else if (/heatmap/.test(task)) artifact = 'heatmaps';
                    else if (/subtitle|caption/.test(task)) artifact = 'subtitles';
                    else if (/face/.test(task)) artifact = 'faces';
                    else if (/phash/.test(task)) artifact = 'phash';
                    else if (/meta/.test(task)) artifact = 'metadata';
                    else if (/cover|thumb/.test(task)) artifact = 'thumbnail';
                }
                if (!artifact) {
                    continue;
                }
                const path = job.target || job.file || job.path || '';
                if (!path) {
                    continue;
                }
                // Only reflect spinner for the currently open file
                if (!activePath || path !== activePath) {
                    continue;
                }
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
                const { artifact, path } = rec;
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
        if (!tbody) {
            return;
        }
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
                    const cov = (this.coverage && this.coverage.metadata) ? this.coverage.metadata : { processed: 0, total: 0 };
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
        if (typeof status === 'string' && status.length) {
            return status.charAt(0).toUpperCase() + status.slice(1);
        }
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
        if (!container || !handle) {
            return;
        }
        // Avoid double wiring
        if (handle._wired) {
            return;
        }
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
            if (e.button !== 0) {
                return;
            }
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
            if (!rows.length || !table) {
                return;
            }
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
            if (!table) {
                return;
            }
            const desired = clamp(table.scrollHeight + 8);
            container.style.height = desired + 'px';
        }, 50);
    }
    // Ensure that after changing filters (or initial render) the job table is tall enough to show a few rows
    ensureJobTableShowsSomeRows() {
        const container = document.getElementById('jobTableContainer');
        if (!container) {
            return;
        }
        // Respect explicit user resizing unless container is extremely small (<100px)
        if (container._userResized && container.getBoundingClientRect().height > 100) return;
        const rows = Array.from(document.querySelectorAll('#jobTableBody tr'))
            .filter((r) => r.style.display !== 'none');
        if (!rows.length) {
            return;
        }
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
        this._jobPollInFlight = this._jobPollInFlight || { jobs: false, coverage: false };
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
            if (this._jobPollInFlight.jobs || this._jobPollInFlight.coverage) {
                return;
            }
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
            if (!this._jobPollTimer) {
                return;
            }
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
            this.updateOrphanDisplay({ orphaned: 0, orphaned_files: [] });
        }
    }
    updateOrphanDisplay(orphanData) {
        const orphanCount = orphanData.orphaned || 0;
        const orphanCountEl = document.getElementById('orphanCount');
        const cleanupBtn = document.getElementById('cleanupOrphansBtn');
        const previewBtn = document.getElementById('previewOrphansBtn');
        const orphanDetails = document.getElementById('orphanDetails');
        const orphanList = document.getElementById('orphanList');
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
    }
    async previewOrphans() {
        const orphanDetails = document.getElementById('orphanDetails');
        const orphanList = document.getElementById('orphanList');
        if (!orphanDetails || !orphanList) {
            return;
        }
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
        }
        else {
            // Hide
            orphanDetails.classList.add('d-none');
            if (btn) btn.textContent = 'Preview';
        }
    }
    async cleanupOrphans() {
        if (!confirm(`Are you sure you want to delete ${this.orphanFiles.length} orphaned artifact files? This action cannot be undone.`)) {
            return;
        }
        try {
            // Use empty path to cleanup the current root directory
            const response = await fetch('/api/artifacts/cleanup?dry_run=false&keep_orphans=false', { method: 'POST' });
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
    if (!toggle) {
        return;
    }
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
