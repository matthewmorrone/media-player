// Reset Player logic
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnResetPlayer');
  const video = document.getElementById('playerVideo');
  if (btn && video) {
    btn.addEventListener('click', () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      // Optionally clear title and overlays
      const title = document.getElementById('playerTitle');
      if (title) {
        title.textContent = '';
        title.style.display = 'none';
      }
      // Mark that a reset occurred so unload handlers won't re-save state during a following refresh
      try { localStorage.setItem('mediaPlayer:skipSaveOnUnload', '1'); } catch(_) {}
      // Clear last played video from localStorage so no movie auto-loads after refresh
      try {
        localStorage.removeItem('mediaPlayer:last');
        localStorage.removeItem('mediaPlayer:lastVideo');
      } catch(_) {}
      // Utility to set player title and handle visibility
      function setPlayerTitle(text) {
        const title = document.getElementById('playerTitle');
        if (!title) return;
        if (text && String(text).trim()) {
          title.textContent = text;
          title.style.display = '';
        } else {
          title.textContent = '';
          title.style.display = 'none';
        }
      }
      // Clear file info fields
      [
        'fiPath','fiDuration','fiResolution','fiVideoCodec','fiAudioCodec','fiBitrate','fiVBitrate','fiABitrate','fiSize','fiModified'
      ].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
      // Also clear currentPath and resumeOverrideTime if possible
      try {
        if (window.Player) {
          if ('currentPath' in window.Player) window.Player.currentPath = null;
          if ('resumeOverrideTime' in window.Player) window.Player.resumeOverrideTime = null;
        }
      } catch(_) {}
      // Clear module-level currentPath (prevents UI from thinking a file is selected)
      try { currentPath = null; } catch(_) {}

      // Remove per-video persistence keys (mediaPlayer:video:*) so progress/last entries don't rehydrate
      try {
        const removals = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          // remove per-video keys and any 'last' keys that might trigger auto-resume
          if (k.indexOf('mediaPlayer:video:') === 0) removals.push(k);
          if (/last/i.test(k)) removals.push(k);
          if (/lastSelected/i.test(k)) removals.push(k);
        }
        removals.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
      } catch(_) {}

      // Clear common sidebar UI elements so no stale info remains
      try {
        ['artifactBadgesSidebar','videoPerformers','videoTags','markersList','performerImportPreviewList'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.tagName === 'DIV' || el.tagName === 'UL' || el.tagName === 'OL') el.innerHTML = '';
          else el.textContent = '';
        });
        // Clear selection state and UI
        try {
          selectedItems = new Set();
          const selCount = document.getElementById('selectionCount'); if (selCount) selCount.textContent = '0';
          document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        } catch(_) {}
        // Attempt to unload the Player module if available
        try {
          if (window.Player && typeof window.Player.unload === 'function') {
            window.Player.unload();
          } else if (typeof Player !== 'undefined' && Player && typeof Player.unload === 'function') {
            Player.unload();
          }
        } catch(_) {}
        // Do not change active tab on reset — preserve user's current tab
      } catch(_) {}
    });
  }
});
const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const spinner = document.getElementById("spinner");
const refreshBtn = document.getElementById("refresh");
const folderInput = document.getElementById("folderInput");

// Grid controls
const searchInput = document.getElementById("searchInput");
const randomPlayBtn = document.getElementById("randomPlayBtn");
const randomAutoBtn = document.getElementById("randomAutoBtn");
const sortSelect = document.getElementById("sortSelect");
const orderToggle = document.getElementById("orderToggle");
const densitySlider = document.getElementById("densitySlider");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");

// Hover controls (Settings)
let hoverPreviewsEnabled = false; // playback on hover
let hoverOnDemandEnabled = false; // generation on hover
// Feature flag: keep on-demand hover generation code present but disabled by default.
// Flip to true (e.g., via build-time replace or future settings exposure) to allow user toggle to function.
const FEATURE_HOVER_ON_DEMAND = false;
// Player timeline display toggles (Settings)
let showHeatmap = true; // default ON
let showScenes = true; // default ON

// Selection
const selectionBar = document.getElementById("selectionBar");
const selectionCount = document.getElementById("selectionCount");
const selectAllBtn = document.getElementById("selectAllBtn");
const selectNoneBtn = document.getElementById("selectNoneBtn");

// State
let currentPage = 1;
let totalPages = 1;
let totalFiles = 0;
let selectedItems = new Set();
let currentDensity = 12; // Default to 12 (maps to 4 columns)
// Library filter chips state
let libraryTagFilters = [];
let libraryPerformerFilters = [];
let autoRandomEnabled = false;

// Simple density configurations: [pageSize, columns, label]
// Just controls how many columns are visible
const densityConfigs = [
  [200, 20], // 1 - 20 columns
  [180, 18], // 2
  [160, 16], // 3
  [140, 14], // 4
  [120, 12], // 5
  [100, 10], // 6
  [90, 9], // 7
  [80, 8], // 8
  [70, 7], // 9
  [60, 6], // 10
  [50, 5], // 11
  [45, 4], // 12 - Default: 4 columns
  [40, 3], // 13
  [35, 2], // 14
  [30, 1], // 15 - 1 column
];

// Compute columns/page-size from currentDensity and set CSS var
function applyColumnsAndComputePageSize() {
  const [, columns] = densityConfigs[currentDensity - 1] || [45, 4];
  document.documentElement.style.setProperty("--columns", String(columns));

  // Estimate rows that fit: tile aspect 16/9 + meta (~54px)
  const gridWidth = grid.clientWidth || window.innerWidth - 128; // margins 64px each side
  const colWidth = Math.max(120, Math.floor(gridWidth / Math.max(1, columns))); // min width safeguard
  const tileHeight = Math.round((colWidth * 9) / 16) + 54; // image + meta
  const usableHeight = Math.max(200, window.innerHeight - 220); // header + controls padding
  const rows = Math.max(2, Math.floor(usableHeight / tileHeight) + 1); // +1 buffer row
  return columns * rows;
}

// Use the centralized inline SVG sprite for placeholders. The DOM contains
// an SVG <use href="#icon-placeholder"> inside each card template; JS will
// toggle visibility of the <img.thumb> and the <svg.thumb-placeholder> as needed.

// Determine when the sidebar accordion fills available vertical space.
// If it does, mark the accordion with `.accordion--fills` so internal
// lists (like .markers-list) can scroll without affecting the page.
function updateAccordionFillState() {
  try {
    const sidebar = document.querySelector('.player-split .player-sidebar');
    const accordion = sidebar ? sidebar.querySelector('.accordion') : null;
    if (!sidebar || !accordion) return;

    // Compute the vertical space available inside the sidebar for the accordion
    const sidebarStyles = window.getComputedStyle(sidebar);
    const sidebarPaddingTop = parseFloat(sidebarStyles.paddingTop) || 0;
    const sidebarPaddingBottom = parseFloat(sidebarStyles.paddingBottom) || 0;
    const available = sidebar.clientHeight - sidebarPaddingTop - sidebarPaddingBottom;

    // Total height of accordion content
    const accRect = accordion.getBoundingClientRect();
    const accHeight = accRect.height;

    const fills = accHeight >= Math.max(available - 4, 0); // small tolerance
    accordion.classList.toggle('accordion--fills', !!fills);

    // If it fills, constrain markers-list to the remaining space below other
    // accordion items (compute precise available height for markers-list).
    const markers = accordion.querySelector('.markers-list');
    if (markers && fills) {
      // Find the top offset of markers relative to the sidebar
      const sidebarRect = sidebar.getBoundingClientRect();
      const markersRect = markers.getBoundingClientRect();
      const topOffset = markersRect.top - sidebarRect.top;
      // Reserve 12px padding at bottom
      const space = Math.max(sidebar.clientHeight - topOffset - 12, 80);
      markers.style.maxHeight = `${space}px`;
      markers.style.overflowY = 'auto';
    } else if (markers) {
      markers.style.maxHeight = '';
      markers.style.overflowY = '';
    }
  } catch (e) {
    // ignore in older browsers
  }
}

// Debounce helper
function debounce(fn, wait = 120) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

const debouncedUpdateAccordionFillState = debounce(updateAccordionFillState, 140);

// Run on load and on resize/tab changes
window.addEventListener('load', debouncedUpdateAccordionFillState);
window.addEventListener('resize', debouncedUpdateAccordionFillState);
window.addEventListener('tabchange', (e) => { debouncedUpdateAccordionFillState(); });

// Also observe mutations in the accordion in case content changes dynamically
try {
  const sidebarRoot = document.querySelector('.player-split .player-sidebar');
  if (sidebarRoot) {
    const mo = new MutationObserver(debouncedUpdateAccordionFillState);
    mo.observe(sidebarRoot, { childList: true, subtree: true, attributes: true });
  }
} catch (_) {}

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
    if (e.target === imgModal) {
      imgModal.hidden = true;
    }
  });
}
if (imgModalClose) {
  imgModalClose.addEventListener('click', () => { imgModal.hidden = true; });
}

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 ? 1 : 0) + " " + units[i];
}

// Ensure a hover (preview) artifact exists for a video record; returns a blob URL or empty string.
async function ensureHover(v) {
  // Goal: avoid generating any 404 network entries. We first consult unified
  // artifact status (cheap, should never 404). Only if it reports hover=true
  // do we attempt to fetch the blob. If hover is absent but on‑demand
  // generation is enabled, we trigger creation and poll status (not the blob)
  // until it reports present, then fetch. No HEAD probes.
  const path = (v && (v.path || v.name)) || "";
  if (!path) return "";
  if (v && v.hover_url) return v.hover_url;
  const qp = encodeURIComponent(path);
  const getStatusForPath = async () => {
    try {
      window.__artifactStatus = window.__artifactStatus || {};
      if (window.__artifactStatus[path]) return window.__artifactStatus[path];
      const u = new URL("/api/artifacts/status", window.location.origin);
      u.searchParams.set("path", path);
      const r = await fetch(u.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && (j.data || j);
      if (d) window.__artifactStatus[path] = d;
      return d || null;
    } catch (_) {
      return null;
    }
  };
  const refreshStatus = async () => {
    try {
      const u = new URL("/api/artifacts/status", window.location.origin);
      u.searchParams.set("path", path);
      const r = await fetch(u.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && (j.data || j);
      if (d) window.__artifactStatus[path] = d;
      return d || null;
    } catch (_) {
      return null;
    }
  };
  let status = await getStatusForPath();
  if (status && status.hover) {
    // Fetch the blob directly (GET). If this 404s (race), we just abort silently.
    try {
      const r = await fetch(`/api/hover/get?path=${qp}`);
      if (!r.ok) return "";
      const blob = await r.blob();
      if (!blob || !blob.size) return "";
      const obj = URL.createObjectURL(blob);
      v.hover_url = obj;
      return obj;
    } catch (_) {
      return "";
    }
  }
  // Not present yet.
  if (!status) {
    // Status unknown (not cached); treat as absent for now.
    status = { hover: false };
  }

  // If hover is missing but on-demand generation is enabled, trigger creation
  try {
    if (hoverOnDemandEnabled) {
      // Mark UI state for generation
      try {
        const card = document.querySelector(`.card[data-path="${path}"]`);
        if (card) card.classList.add('hover-generating');
      } catch (_) {}
      // Trigger creation endpoint if available
      try {
        const u = new URL('/api/hover/create', window.location.origin);
        u.searchParams.set('path', path);
        // fire-and-forget, but wait briefly and poll status
        await fetch(u.toString(), { method: 'POST' });
        // Poll status up to ~6s
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 600));
          const s = await refreshStatus();
          if (s && s.hover) {
            try {
              const r = await fetch(`/api/hover/get?path=${qp}`);
              if (!r.ok) break;
              const blob = await r.blob();
              if (blob && blob.size) {
                const obj = URL.createObjectURL(blob);
                v.hover_url = obj;
                try { const card = document.querySelector(`.card[data-path="${path}"]`); if (card) card.classList.remove('hover-generating'); } catch(_){}
                return obj;
              }
            } catch(_) { break; }
          }
        }
      } catch(_) {
        /* ignore failures */
      } finally {
        try { const card = document.querySelector(`.card[data-path="${path}"]`); if (card) card.classList.remove('hover-generating'); } catch(_){}
      }
    }
  } catch(_) {}

  return "";
}

// Format seconds (can be float) into H:MM:SS or M:SS
function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return (
    h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0")
  );
  return m + ":" + String(s).padStart(2, "0");
}
// Clean up any existing hover preview videos except an optional tile we want to keep active
function stopAllTileHovers(exceptTile) {
  try {
    const tiles = document.querySelectorAll(".card");
    tiles.forEach((t) => {
      if (exceptTile && t === exceptTile) return;
      const video = t.querySelector("video.hover-video");
      if (video) {
        try {
          video.pause();
          video.src = "";
          video.load();
          video.remove();
        } catch (_) {}
      }
      t._hovering = false;
      t._hoverToken = (t._hoverToken || 0) + 1;
      if (t._hoverTimer) {
        clearTimeout(t._hoverTimer);
        t._hoverTimer = null;
      }
    });
  } catch (_) {}
}

function videoCard(v) {
  const template = document.getElementById("cardTemplate");
  const el = template.content.cloneNode(true).querySelector(".card");

  const imgSrc = v.cover || "";
  const dur = fmtDuration(Number(v.duration));
  const size = fmtSize(Number(v.size));
  const isSelected = selectedItems.has(v.path);

  el.dataset.path = v.path;

  const checkbox = el.querySelector(".card-checkbox");
  if (isSelected) checkbox.classList.add("checked");
  // Make the overlay checkbox interactive and accessible
  try {
    checkbox.setAttribute("role", "checkbox");
    checkbox.setAttribute("tabindex", "0");
    checkbox.setAttribute("aria-checked", isSelected ? "true" : "false");
  } catch (_) {}
  // Clicking the checkbox should always toggle selection (no modifiers required)
  checkbox.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleSelection(ev, v.path);
  });
  // Keyboard support for accessibility
  checkbox.addEventListener("keydown", (ev) => {
    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      ev.stopPropagation();
      toggleSelection(ev, v.path);
    }
  });

  const img = el.querySelector(".thumb");
  img.src = imgSrc || "";
  img.alt = v.title || v.name;
  // Use the inline placeholder when no thumbnail present or image fails.
  const placeholderSvg = el.querySelector('svg.thumb-placeholder');
  function showPlaceholder() {
    if (img) img.style.display = 'none';
    if (placeholderSvg) placeholderSvg.style.display = '';
  }
  function hidePlaceholder() {
    if (img) img.style.display = '';
    if (placeholderSvg) placeholderSvg.style.display = 'none';
  }
  if (!imgSrc) showPlaceholder(); else hidePlaceholder();
  img.addEventListener('error', () => { showPlaceholder(); });

  // Resolution / quality badge: prefer height (common convention)
  try {
    const q = el.querySelector(".quality-badge");
    const overlay = el.querySelector(".overlay-info");
    const overlayRes = el.querySelector(".overlay-resolution");
    // duration overlay is removed per request
    const w = Number(v.width);
    const h = Number(v.height);
    let label = "";
    // Map common tiers by height first, then by width if height missing
    const pickByHeight = (hh) => {
      if (!Number.isFinite(hh) || hh <= 0) return "";
      if (hh >= 2160) return "2160p";
      if (hh >= 1440) return "1440p";
      if (hh >= 1080) return "1080p";
      if (hh >= 720) return "720p";
      if (hh >= 480) return "480p";
      if (hh >= 360) return "360p";
      if (hh >= 240) return "240p";
      return "";
    };
    const pickByWidth = (ww) => {
      if (!Number.isFinite(ww) || ww <= 0) return "";
      if (ww >= 3840) return "2160p";
      if (ww >= 2560) return "1440p";
      if (ww >= 1920) return "1080p";
      if (ww >= 1280) return "720p";
      if (ww >= 854) return "480p";
      if (ww >= 640) return "360p";
      if (ww >= 426) return "240p";
      return "";
    };
    label = pickByHeight(h) || pickByWidth(w);
    // Fallback: guess from filename tokens (e.g., 2160p, 4k, 1080p)
    if (!label) {
      const name = String(v.name || v.title || "");
      const lower = name.toLowerCase();
      if (/\b(2160p|4k|uhd)\b/.test(lower)) label = "2160p";
      else if (/\b1440p\b/.test(lower)) label = "1440p";
      else if (/\b1080p\b/.test(lower)) label = "1080p";
      else if (/\b720p\b/.test(lower)) label = "720p";
      else if (/\b480p\b/.test(lower)) label = "480p";
      else if (/\b360p\b/.test(lower)) label = "360p";
      else if (/\b240p\b/.test(lower)) label = "240p";
    }
    if (q) {
      // We now prefer the bottom-left overlay; hide the top-right badge to avoid duplication
      q.textContent = label || "";
      q.style.display = "none";
      try {
        q.setAttribute("aria-hidden", label ? "false" : "true");
      } catch (_) {}
    }

    // Populate Stash-like bottom-left overlay info (resolution + duration)
    if (overlay) {
      const hasRes = !!label;
      // (Removed accidental SSE logic injection here)
      if (hasRes) {
        overlay.style.display = "inline-flex";
        try {
          overlay.setAttribute("aria-hidden", "false");
        } catch (_) {}
      } else {
        overlay.style.display = "none";
        try {
          overlay.setAttribute("aria-hidden", "true");
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Add video hover preview functionality
  el.addEventListener("mouseenter", async () => {
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
    } catch (_) {}


  });

  el.addEventListener("mouseleave", () => {
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
      newImg.src = imgSrc || "";
      newImg.alt = v.title || v.name;
      // restore placeholder or image visibility after hover
      const newPlaceholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newPlaceholder.className.baseVal = 'thumb-placeholder';
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#icon-placeholder');
      newPlaceholder.appendChild(use);
      // If image loads, hide placeholder
      newImg.addEventListener('load', () => {
        newImg.style.display = '';
        if (newPlaceholder) newPlaceholder.style.display = 'none';
      });
      newImg.addEventListener('error', () => {
        newImg.style.display = 'none';
        if (newPlaceholder) newPlaceholder.style.display = '';
      });
      // Replace video with img and placeholder (img first)
      video.replaceWith(newImg);
      newImg.insertAdjacentElement('afterend', newPlaceholder);
    }
  });

  const title = el.querySelector(".title");
  title.textContent = v.title || v.name;
  title.title = v.title || v.name;

  el.querySelector(".duration").textContent = dur;
  el.querySelector(".size").textContent = size;
  el.addEventListener("click", (event) => {
    handleCardClick(event, v.path);
  });
  return el;
}

function dirCard(d) {
  const template = document.getElementById("dirTemplate");
  const el = template.content.cloneNode(true).querySelector(".card");

  const name = d.name || String(d);
  const dpath = d.path || name;

  el.querySelector(".dir-name").textContent = name;
  el.querySelector(".title").textContent = name;
  el.querySelector(".title").title = name;

  el.addEventListener("click", () => {
    folderInput.value = dpath;
    currentPage = 1; // Reset to first page when navigating to a folder
    loadLibrary();
  });
  el.addEventListener("dblclick", () => {
    folderInput.value = dpath;
    currentPage = 1; // Reset to first page when navigating to a folder
    loadLibrary();
  });

  return el;
}

function currentPath() {
  const v = (folderInput.value || "").trim();
  // When the input contains an absolute path (root), do not treat it as a relative folder
  if (isAbsolutePath(v)) return "";
  return v.replace(/^\/+|\/+$/g, "");
}

async function loadLibrary() {
  try {
    statusEl.style.display = "none";
    spinner.style.display = "block";
    grid.hidden = true;

    const url = new URL("/api/library", window.location.origin);
    url.searchParams.set("page", String(currentPage));
    url.searchParams.set("page_size", String(applyColumnsAndComputePageSize()));
    url.searchParams.set("sort", sortSelect.value || "date");
    url.searchParams.set("order", orderToggle.dataset.order || "desc");
    // Resolution filter
    const resSel = document.getElementById("resSelect");
    const resVal = resSel ? String(resSel.value || "") : "";
    if (resVal) url.searchParams.set("res_min", resVal);

    // Add search and filter parameters
    const searchVal = searchInput.value.trim();
    if (searchVal) url.searchParams.set("search", searchVal);

    const val = (folderInput.value || "").trim();
    const p = currentPath();
    // Only set a relative path; ignore absolute values (those represent the root itself)
    if (val && !isAbsolutePath(val) && p) url.searchParams.set("path", p);

    // Tag / performer filter chips
    if (libraryTagFilters.length) {
      url.searchParams.set("tags", libraryTagFilters.join(","));
    }
    if (libraryPerformerFilters.length) {
      url.searchParams.set("performers", libraryPerformerFilters.join(","));
    }

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.status !== "success")
      throw new Error(payload?.message || "Unexpected response");

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

    grid.innerHTML = "";
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
        const curSort = sortSelect.value || "date";
        const curOrder = orderToggle.dataset.order || "desc";
        // Kick off fetches in parallel
        await Promise.all(
          subdirs.map(async (d) => {
            const dpath = d.path || d.name || "";
            if (!dpath) return;
            try {
              const u = new URL("/api/library", window.location.origin);
              u.searchParams.set("path", dpath);
              u.searchParams.set("page", "1");
              u.searchParams.set("page_size", String(Math.min(48, MAX_TILES)));
              u.searchParams.set("sort", curSort);
              u.searchParams.set("order", curOrder);
              // Include resolution filter in fallback fetches
              const resSel = document.getElementById("resSelect");
              const resVal = resSel ? String(resSel.value || "") : "";
              if (resVal) u.searchParams.set("res_min", resVal);
              const r = await fetch(u, {
                headers: { Accept: "application/json" },
              });
              if (!r.ok) return;
              const pl = await r.json();
              const f2 = Array.isArray(pl?.data?.files) ? pl.data.files : [];
              for (const f of f2) combined.push(f);
            } catch (_) {
              /* ignore sub-errors */
            }
          })
        );

        // Client-side sort across aggregated results for a consistent order
        const rev = curOrder === "desc";
        if (curSort === "name") {
          combined.sort(
            (a, b) =>
              (a.name || "")
            .toLowerCase()
            .localeCompare((b.name || "").toLowerCase()) * (rev ? -1 : 1)
          );
        } else if (curSort === "size") {
          combined.sort(
            (a, b) => ((a.size || 0) - (b.size || 0)) * (rev ? -1 : 1)
          );
        } else if (curSort === "random") {
          for (let i = combined.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [combined[i], combined[j]] = [combined[j], combined[i]];
          }
        } else {
          // date or default
          combined.sort(
            (a, b) => ((a.mtime || 0) - (b.mtime || 0)) * (rev ? -1 : 1)
          );
        }

        // Render up to MAX_TILES
        let shown = 0;
        for (const f of combined) {
          if (shown >= MAX_TILES) break;
          grid.appendChild(videoCard(f));
          shown++;
        }

        spinner.style.display = "none";
        grid.hidden = false;
        return;
      } else {
        spinner.style.display = "none";
        statusEl.className =
        files.length === 0 && searchVal ? "empty" : "empty";
        statusEl.textContent = searchVal
        ? "No results match your search."
        : "No videos found.";
        statusEl.style.display = "block";
        grid.hidden = true;
        return;
      }
    }
    for (const f of files) {
      grid.appendChild(videoCard(f));
    }

    // Always hide status and show grid if we got here without errors
    statusEl.style.display = "none";
    statusEl.style.display = "none";
    spinner.style.display = "none";
    grid.hidden = false;
  } catch (e) {
    console.error("Library loading error:", e);
    spinner.style.display = "none";
    statusEl.className = "error";
    statusEl.textContent = "Failed to load library.";
    statusEl.style.display = "block";
    grid.hidden = true;
  }
}

// One-time capability check to decide if we should attempt SSE at all (avoids blind 404 probes)
;(async () => {
  if (!window.__JOBS_SSE_ENABLED) return;
  if (window.__JOBS_SSE_UNAVAILABLE) return; // already decided
  try {
    const res = await fetch('/config', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = await res.json();
    const has = !!(cfg && cfg.features && cfg.features.jobs_sse);
    if (!has) {
      window.__JOBS_SSE_UNAVAILABLE = true;
    }
  } catch (_) {
    // Silent; fallback polling continues
  }
})();

// -----------------------------
// Simple Accordion Wiring (robust, minimal)
// Ensures the sidebar accordion works even when other modules aren't active.
(function wireSimpleAccordion(){
  function init(){
    const root = document.getElementById('sidebarAccordion');
    if (!root) return;
    const LS_KEY = 'mediaPlayer:sidebarAccordionState';
    const items = Array.from(root.querySelectorAll('.acc-item'));
    const loadState = () => {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch(_) { return {}; }
    };
    const saveState = (st) => { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(_) {} };
    let state = loadState();

    items.forEach((it, idx) => {
      const hdr = it.querySelector('.acc-header');
      const panel = it.querySelector('.acc-panel');
      if (!hdr || !panel) return;
      // (SVG caret is embedded in the HTML markup now; no runtime injection required)
      const key = it.getAttribute('data-key') || String(idx);
      const open = Object.prototype.hasOwnProperty.call(state, key)
      ? !!state[key]
      : hdr.getAttribute('aria-expanded') === 'true';
      hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.classList.toggle('hidden', !open);

      // Idempotent guard
      if (hdr._simpleAccordionWired) return;
      hdr._simpleAccordionWired = true;

      hdr.addEventListener('click', (e) => {
        // When opening one, close others (true-accordion behavior)
        const currentlyOpen = hdr.getAttribute('aria-expanded') === 'true';
        if (!currentlyOpen) {
          items.forEach((other) => {
            if (other === it) return;
            const oh = other.querySelector('.acc-header');
            const op = other.querySelector('.acc-panel');
            if (oh && op) {
              oh.setAttribute('aria-expanded','false');
              op.classList.add('hidden');
              other.classList.remove('open');
              op.classList.remove('open');
            }
          });
        }

        const now = !currentlyOpen;
        hdr.setAttribute('aria-expanded', now ? 'true' : 'false');
        panel.classList.toggle('hidden', !now);

        // Toggle .open to trigger CSS transitions defined in index.css
        it.classList.toggle('open', now);
        panel.classList.toggle('open', now);

        // Persist state
        const out = {};
        items.forEach((ii, j) => {
          const k = ii.getAttribute('data-key') || String(j);
          const h = ii.querySelector('.acc-header');
          if (h) out[k] = h.getAttribute('aria-expanded') === 'true';
        });
        saveState(out);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

refreshBtn.addEventListener("click", loadLibrary);
if (randomPlayBtn) {
  randomPlayBtn.addEventListener("click", async () => {
    try {
      // Fetch one random page (page_size=1 sort=random) with current filters applied
      const url = new URL("/api/library", window.location.origin);
      url.searchParams.set("page", "1");
      url.searchParams.set("page_size", "1");
      url.searchParams.set("sort", "random");
      url.searchParams.set("order", orderToggle.dataset.order || "desc");
      const resSel = document.getElementById("resSelect");
      const resVal = resSel ? String(resSel.value || "") : "";
      if (resVal) url.searchParams.set("res_min", resVal);
      const searchVal = searchInput.value.trim();
      if (searchVal) url.searchParams.set("search", searchVal);
      const val = (folderInput.value || "").trim();
      const p = currentPath();
      if (val && !isAbsolutePath(val) && p) url.searchParams.set("path", p);
      if (libraryTagFilters.length) url.searchParams.set("tags", libraryTagFilters.join(","));
      if (libraryPerformerFilters.length) url.searchParams.set("performers", libraryPerformerFilters.join(","));
      const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pl = await r.json();
      const f = (pl?.data?.files || [])[0];
      if (!f || !f.path) {
        alert("No video found for random play.");
        return;
      }
      if (typeof window.__playerOpen === "function") {
        window.__playerOpen(f.path);
        // Switch to player tab now (explicit user action)
        if (window.tabSystem) window.tabSystem.switchToTab("player");
      }
    } catch (e) {
      alert("Random play failed.");
    }
  });
}

// Persist auto-random setting
function loadAutoRandomSetting() {
  try { autoRandomEnabled = localStorage.getItem('setting.autoRandom') === '1'; } catch(_) { autoRandomEnabled = false; }
}
function saveAutoRandomSetting() {
  try { localStorage.setItem('setting.autoRandom', autoRandomEnabled ? '1':'0'); } catch(_) {}
}
loadAutoRandomSetting();
if (randomAutoBtn) {
  const syncBtn = () => {
    randomAutoBtn.classList.toggle('btn-active', autoRandomEnabled);
    randomAutoBtn.setAttribute('aria-pressed', autoRandomEnabled ? 'true':'false');
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
  const url = new URL("/api/library", window.location.origin);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "1");
  url.searchParams.set("sort", "random");
  url.searchParams.set("order", orderToggle?.dataset?.order || "desc");
  const resSel = document.getElementById("resSelect");
  const resVal = resSel ? String(resSel.value || "") : "";
  if (resVal) url.searchParams.set("res_min", resVal);
  const searchVal = searchInput.value.trim();
  if (searchVal) url.searchParams.set("search", searchVal);
  const val = (folderInput.value || "").trim();
  const p = currentPath();
  if (val && !isAbsolutePath(val) && p) url.searchParams.set("path", p);
  if (libraryTagFilters.length) url.searchParams.set("tags", libraryTagFilters.join(","));
  if (libraryPerformerFilters.length) url.searchParams.set("performers", libraryPerformerFilters.join(","));
  const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
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
      } catch(_) {}
    });
  } catch(_) {}

}
installAutoRandomListener();


// -----------------------------
// Library tag/performer filter chips
// -----------------------------
const libTagInput = document.getElementById("libraryTagFilterInput");
const libTagList = document.getElementById("libraryTagFilters");
const libPerfInput = document.getElementById("libraryPerformerFilterInput");
const libPerfList = document.getElementById("libraryPerformerFilters");

function persistLibraryFilters() {
  try {
    localStorage.setItem("filters.tags", JSON.stringify(libraryTagFilters));
    localStorage.setItem("filters.performers", JSON.stringify(libraryPerformerFilters));
  } catch (_) {}
}
function loadLibraryFilters() {
  try {
    const t = JSON.parse(localStorage.getItem("filters.tags") || "[]");
    const p = JSON.parse(localStorage.getItem("filters.performers") || "[]");
    if (Array.isArray(t)) libraryTagFilters = t.filter(Boolean);
    if (Array.isArray(p)) libraryPerformerFilters = p.filter(Boolean);
  } catch (_) {}
}
function renderLibraryChips() {
  if (libTagList) {
    libTagList.innerHTML = "";
    libraryTagFilters.forEach((tag, idx) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      chip.title = `Tag filter: ${tag} (click to remove)`;
      chip.addEventListener("click", () => {
        libraryTagFilters.splice(idx, 1);
        persistLibraryFilters();
        renderLibraryChips();
        currentPage = 1;
        loadLibrary();
      });
      libTagList.appendChild(chip);
    });
  }
  if (libPerfList) {
    libPerfList.innerHTML = "";
    libraryPerformerFilters.forEach((name, idx) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = name;
      chip.title = `Performer filter: ${name} (click to remove)`;
      chip.addEventListener("click", () => {
        libraryPerformerFilters.splice(idx, 1);
        persistLibraryFilters();
        renderLibraryChips();
        currentPage = 1;
        loadLibrary();
      });
      libPerfList.appendChild(chip);
    });
  }
}
function handleLibraryFilterInput(e, kind) {
  const val = (e.target.value || "").trim();
  if (!val) return;
  if (e.key === "Enter") {
    if (kind === "tag") {
      if (!libraryTagFilters.includes(val)) libraryTagFilters.push(val);
    } else if (kind === "perf") {
      if (!libraryPerformerFilters.includes(val)) libraryPerformerFilters.push(val);
    }
    e.target.value = "";
    persistLibraryFilters();
    renderLibraryChips();
    currentPage = 1;
    loadLibrary();
  } else if (e.key === "Escape") {
    e.target.value = "";
  }
}
if (libTagInput) libTagInput.addEventListener("keydown", (e) => handleLibraryFilterInput(e, "tag"));
if (libPerfInput) libPerfInput.addEventListener("keydown", (e) => handleLibraryFilterInput(e, "perf"));
loadLibraryFilters();
renderLibraryChips();

// Grid control event listeners

// -----------------------------
// Library Stats Panel
// -----------------------------
function drawPieChart(canvas, dataObj) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const entries = Object.entries(dataObj).filter(([,v]) => Number(v) > 0);
  const total = entries.reduce((s, [,v]) => s + Number(v), 0);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w/2;
  const cy = h/2;
  const radius = Math.min(w,h) * 0.4;
  ctx.clearRect(0,0,w,h);
  if (total === 0) {
    // draw placeholder
    ctx.fillStyle = '#222';
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No data', cx, cy);
    return;
  }
  const colors = ["#4dc9f6","#f67019","#f53794","#537bc4","#acc236","#166a8f","#00a950","#58595b"];
  let start = -Math.PI/2;
  entries.forEach(([k,v], i) => {
    const frac = Number(v)/total;
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
  entries.forEach(([k,v], i) => {
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
    if (!res.ok) throw new Error('failed');
    const body = await res.json();
    if (!body || body.status !== 'success') return;
    const d = body.data || {};
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val === null || val === undefined) ? '—' : val; };
    setText('statsNumFiles', d.num_files ?? '—');
    setText('statsTotalSize', (typeof d.total_size === 'number') ? fmtSize(d.total_size) : '—');
    setText('statsTotalDuration', (typeof d.total_duration === 'number') ? fmtDuration(d.total_duration) : '—');
    setText('statsNumTags', d.tags ?? '—');
    setText('statsNumPerformers', d.performers ?? '—');

    const resCanvas = document.getElementById('statsResChart');
    const durCanvas = document.getElementById('statsDurationChart');
    if (resCanvas && d.res_buckets) drawPieChart(resCanvas, d.res_buckets);
    if (durCanvas && d.duration_buckets) drawPieChart(durCanvas, d.duration_buckets);
  } catch (e) {
    // silent
  }
}

// run on initial load
window.addEventListener('DOMContentLoaded', () => { setTimeout(loadStats, 500); });
searchInput.addEventListener("input", () => {
  currentPage = 1;
  loadLibrary();
});
sortSelect.addEventListener("change", () => {
  currentPage = 1;
  loadLibrary();
});
// Wire up sidebar artifact generation buttons
function getSelectedFilePath() {
  // Use the currently selected file in the grid, or fallback to the first file
  if (selectedItems.size > 0) {
    return Array.from(selectedItems)[0];
  }
  // Fallback: try to get the first card in the grid
  const card = document.querySelector('.card[data-path]');
  return card ? card.dataset.path : null;
}

function setArtifactSpinner(artifact, spinning) {
  const btn = document.querySelector(`.artifact-gen-btn[data-artifact="${artifact}"]`);
  if (!btn) return;
  const spinner = btn.querySelector('.artifact-spinner');
  const label = btn.querySelector('.artifact-btn-label');
  if (spinning) {
    spinner.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="3" fill="none" stroke-dasharray="60" stroke-dashoffset="0"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
    spinner.hidden = false;
    if (label) label.style.opacity = '0.5';
    btn.disabled = true;
  } else {
    spinner.innerHTML = '';
    spinner.hidden = true;
    if (label) label.style.opacity = '';
    btn.disabled = false;
  }
}

async function triggerArtifactJob(artifact) {
  const filePath = getSelectedFilePath();
  if (!filePath) {
    alert('No file selected.');
    return;
  }
  setArtifactSpinner(artifact, true);
  let endpoint = '';
  let params = '';
  switch (artifact) {
    case 'metadata':
    endpoint = '/api/metadata/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'heatmap':
    endpoint = '/api/heatmaps/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'scenes':
    endpoint = '/api/scenes/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'sprites':
    endpoint = '/api/sprites/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'hover':
    endpoint = '/api/hover/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'subtitles':
    endpoint = '/api/subtitles/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'faces':
    endpoint = '/api/faces/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    case 'phash':
    endpoint = '/api/phash/create';
    params = `?path=${encodeURIComponent(filePath)}`;
    break;
    default:
    setArtifactSpinner(artifact, false);
    alert('Unknown artifact type.');
    return;
  }
  try {
    const res = await fetch(endpoint + params, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Optionally update badge status/checkmark here
    setArtifactSpinner(artifact, false);
    // Optionally show a checkmark or success indicator
    // Job will appear in Tasks tab automatically via SSE
  } catch (e) {
    setArtifactSpinner(artifact, false);
    alert(`Failed to generate ${artifact}: ${e.message}`);
  }
}

document.querySelectorAll('.artifact-gen-btn[data-artifact]').forEach(btn => {
  btn.addEventListener('click', () => {
    const artifact = btn.getAttribute('data-artifact');
    triggerArtifactJob(artifact);
  });
});
orderToggle.addEventListener("click", () => {
  const isDesc = orderToggle.dataset.order === "desc";
  orderToggle.dataset.order = isDesc ? "asc" : "desc";
  orderToggle.textContent = isDesc ? "▲" : "▼";
  currentPage = 1;
  loadLibrary();
});

// Resolution filter change
const resSelect = document.getElementById("resSelect");
if (resSelect) {
  resSelect.addEventListener("change", () => {
    // Persist selection
    try {
      localStorage.setItem("filter.res_min", resSelect.value || "");
    } catch (_) {}
    currentPage = 1;
    loadLibrary();
  });
}

// Pagination
prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadLibrary();
  }
});
nextBtn.addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadLibrary();
  }
});

// Density slider
densitySlider.addEventListener("input", () => {
  currentDensity = parseInt(densitySlider.value);
  updateDensity();
  currentPage = 1;
  loadLibrary();
});

// Settings wiring for hover previews
function loadHoverSetting() {
  try {
    const raw = localStorage.getItem("setting.hoverPreviews");
    hoverPreviewsEnabled = raw ? raw === "1" : false;
  } catch (_) {
    hoverPreviewsEnabled = false;
  }
}

function saveHoverSetting() {
  try {
    localStorage.setItem(
      "setting.hoverPreviews",
      hoverPreviewsEnabled ? "1" : "0"
    );
  } catch (_) {}
}

function loadHoverOnDemandSetting() {
  try {
    const raw = localStorage.getItem("setting.hoverOnDemand");
    // Default remains false; do not auto-enable when feature flag is off.
    hoverOnDemandEnabled = FEATURE_HOVER_ON_DEMAND && raw ? raw === "1" : false;
  } catch (_) {
    hoverOnDemandEnabled = false;
  }
}

function saveHoverOnDemandSetting() {
  try {
    localStorage.setItem(
      "setting.hoverOnDemand",
      hoverOnDemandEnabled ? "1" : "0"
    );
  } catch (_) {}
}

// Settings for timeline display toggles
function loadShowHeatmapSetting() {
  try {
    const raw = localStorage.getItem("setting.showHeatmap");
    // Default to ON when unset
    showHeatmap = raw == null ? true : raw === "1";
  } catch (_) {
    showHeatmap = true;
  }
}
function saveShowHeatmapSetting() {
  try {
    localStorage.setItem("setting.showHeatmap", showHeatmap ? "1" : "0");
  } catch (_) {}
}
function loadShowScenesSetting() {
  try {
    const raw = localStorage.getItem("setting.showScenes");
    showScenes = raw == null ? true : raw === "1";
  } catch (_) {
    showScenes = true;
  }
}
function saveShowScenesSetting() {
  try {
    localStorage.setItem("setting.showScenes", showScenes ? "1" : "0");
  } catch (_) {}
}

function wireSettings() {
  const cbPlay = document.getElementById("settingHoverPreviews");
  const cbDemand = document.getElementById("settingHoverOnDemand");
  const concurrencyInput = document.getElementById("settingConcurrency");
  const cbAutoplayResume = document.getElementById("settingAutoplayResume");
  const cbShowHeatmap = document.getElementById("settingShowHeatmap");
  const cbShowScenes = document.getElementById("settingShowScenes");
  loadHoverSetting();
  loadHoverOnDemandSetting();
  loadShowHeatmapSetting();
  loadShowScenesSetting();
  if (cbPlay) {
    cbPlay.checked = !!hoverPreviewsEnabled;
    cbPlay.addEventListener("change", () => {
      hoverPreviewsEnabled = !!cbPlay.checked;
      saveHoverSetting();
      if (!hoverPreviewsEnabled) stopAllTileHovers();
    });
  }
  if (cbDemand) {
    cbDemand.checked = !!hoverOnDemandEnabled;
    cbDemand.addEventListener("change", () => {
      hoverOnDemandEnabled = !!cbDemand.checked;
      saveHoverOnDemandSetting();
    });
  }

  // Timeline display toggles
  if (cbShowHeatmap) {
    cbShowHeatmap.checked = !!showHeatmap;
    cbShowHeatmap.addEventListener("change", () => {
      showHeatmap = !!cbShowHeatmap.checked;
      saveShowHeatmapSetting();
      applyTimelineDisplayToggles();
    });
  }
  if (cbShowScenes) {
    cbShowScenes.checked = !!showScenes;
    cbShowScenes.addEventListener("change", () => {
      showScenes = !!cbShowScenes.checked;
      saveShowScenesSetting();
      applyTimelineDisplayToggles();
    });
  }

  // Autoplay resume setting
  const loadAutoplayResume = () => {
    try {
      return localStorage.getItem("setting.autoplayResume") === "1";
    } catch (_) {
      return false;
    }
  };
  const saveAutoplayResume = (v) => {
    try {
      localStorage.setItem("setting.autoplayResume", v ? "1" : "0");
    } catch (_) {}
  };
  if (cbAutoplayResume) {
    cbAutoplayResume.checked = loadAutoplayResume();
    cbAutoplayResume.addEventListener("change", () =>
      saveAutoplayResume(!!cbAutoplayResume.checked)
  );
}

// Start at Intro End setting (default ON)
const loadStartAtIntro = () => {
  try {
    // default to on if not set
    const v = localStorage.getItem("setting.startAtIntro");
    if (v === null || v === undefined) return true;
    return v === "1";
  } catch (_) {
    return true;
  }
};
const saveStartAtIntro = (v) => {
  try {
    localStorage.setItem("setting.startAtIntro", v ? "1" : "0");
  } catch (_) {}
};
const cbStartAtIntro = document.getElementById("settingStartAtIntro");
if (cbStartAtIntro) {
  cbStartAtIntro.checked = loadStartAtIntro();
  cbStartAtIntro.addEventListener("change", () => saveStartAtIntro(!!cbStartAtIntro.checked));
}

// Concurrency setting
(async () => {
  try {
    const r = await fetch("/api/tasks/concurrency");
    if (r.ok) {
      const data = await r.json();
      const val = Number(data?.data?.maxConcurrency) || 4;
      if (concurrencyInput) concurrencyInput.value = String(val);
    } else if (concurrencyInput) {
      concurrencyInput.value = String(
        Number(localStorage.getItem("setting.maxConcurrency")) || 4
      );
    }
  } catch (_) {
    if (concurrencyInput)
      concurrencyInput.value = String(
      Number(localStorage.getItem("setting.maxConcurrency")) || 4
    );
  }
})();
// Debounced autosave on change
if (concurrencyInput) {
  let t;
  const push = async (val) => {
    try {
      const r = await fetch(`/api/tasks/concurrency?value=${val}`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      localStorage.setItem("setting.maxConcurrency", String(val));
      const data = await r.json();
      const applied = Number(data?.data?.maxConcurrency) || val;
      if (concurrencyInput) concurrencyInput.value = String(applied);
      tasksManager?.showNotification(
        `Max concurrency set to ${applied}`,
        "success"
      );
    } catch (e) {
      tasksManager?.showNotification("Failed to set concurrency", "error");
    }
  };
  const debounced = (val) => {
    clearTimeout(t);
    t = setTimeout(() => push(val), 400);
  };
  const handle = () => {
    const val = Math.max(
      1,
      Math.min(128, Number(concurrencyInput.value || 4))
    );
    debounced(val);
  };
  concurrencyInput.addEventListener("change", handle);
  concurrencyInput.addEventListener("input", handle);
}
}

// (Removed: simple Enter handler; replaced below with unified behavior)
folderInput.addEventListener("dblclick", () => openFolderPicker());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadLibrary();
});
window.addEventListener("load", () => {
  // Initialize density
  updateDensity();

  // Initialize resolution filter from storage (persisted across sessions)
  try {
    const savedRes = localStorage.getItem("filter.res_min");
    const sel = document.getElementById("resSelect");
    if (sel) {
      const validValues = ["", "2160", "1440", "1080", "720", "480"];
      if (savedRes && validValues.includes(savedRes)) sel.value = savedRes;
      else if (!savedRes) sel.value = "";
    }
  } catch (_) {}

  // Prefill placeholder with current root value, but keep input empty for relative navigation
  fetch("/api/root")
  .then((r) => r.json())
  .then((p) => {
    if (p?.status === "success" && p?.data?.root) {
      folderInput.placeholder = `Root: ${String(
        p.data.root
      )} — type a relative path to browse, or an absolute path to change root`;
      folderInput.value = "";
    } else {
      folderInput.value = "";
    }
  })
  .catch(() => {
    folderInput.value = "";
  })
  .finally(loadLibrary);

  // Ensure job action buttons can be toggled by JS even if residual d-none class remains
  ["cancelAllBtn", "cancelQueuedBtn", "clearCompletedBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.classList.contains("d-none")) el.classList.remove("d-none");
  });

  // Initialize per-artifact options menus
  initArtifactOptionsMenus();
});

// Utility: toggled tooltip menus for artifact options
function initArtifactOptionsMenus() {
  // Close any open tooltip when clicking outside
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".options-tooltip").forEach((tt) => {
      // hide all; specific handlers will re-open targeted one
      tt.style.display = "none";
    });
    // also drop raised stacking on any cards
    document
    .querySelectorAll(".artifact-card.menu-open")
    .forEach((card) => card.classList.remove("menu-open"));
  });
  // Open corresponding tooltip for clicked options button
  document.querySelectorAll(".btn-options[data-artifact]").forEach((btn) => {
    if (btn._optsWired) return;
    btn._optsWired = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const artifact = btn.getAttribute("data-artifact");
      const tooltip = document.getElementById(`${artifact}Options`);
      const card = btn.closest(".artifact-card");
      // Toggle: hide others, then toggle this
      document.querySelectorAll(".options-tooltip").forEach((tt) => {
        if (tt !== tooltip) tt.style.display = "none";
      });
      document
      .querySelectorAll(".artifact-card.menu-open")
      .forEach((c) => c.classList.remove("menu-open"));
      if (tooltip) {
        const willOpen =
        tooltip.style.display === "none" || !tooltip.style.display;
        tooltip.style.display = willOpen ? "block" : "none";
        if (card) {
          if (willOpen) card.classList.add("menu-open");
          else card.classList.remove("menu-open");
        }
        // Prevent global click handler from immediately closing it
        e.stopPropagation();
      }
    });
  });
}

// Density function
function updateDensity() {
  const config = densityConfigs[currentDensity - 1];
  const [pageSize, columns, label] = config;

  const root = document.documentElement;
  root.style.setProperty("--columns", String(columns));
}

// Enhanced selection functions
let lastSelectedPath = null; // For shift-click range selection

function handleCardClick(event, path) {
  // If any items are selected, or if Ctrl/Shift is pressed, handle as selection
  if (
    selectedItems.size > 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
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
    try {
      if (window.tabSystem && typeof window.tabSystem.switchToTab === 'function') {
        window.tabSystem.switchToTab('player');
      }
    } catch (_) {}
  }
}

function selectRange(startPath, endPath) {
  const cards = Array.from(document.querySelectorAll(".card[data-path]"));
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
    const checkbox = card.querySelector(".card-checkbox");
    if (selectedItems.has(path)) {
      checkbox.classList.add("checked");
      try {
        checkbox.setAttribute("aria-checked", "true");
      } catch (_) {}
    } else {
      checkbox.classList.remove("checked");
      try {
        checkbox.setAttribute("aria-checked", "false");
      } catch (_) {}
    }
  }
}

// Selection controls
selectAllBtn.addEventListener("click", () => {
  document.querySelectorAll(".card[data-path]").forEach((card) => {
    const path = card.dataset.path;
    if (path) selectedItems.add(path);
  });
  updateSelectionUI();
  document
  .querySelectorAll(".card-checkbox")
  .forEach((cb) => cb.classList.add("checked"));
});

selectNoneBtn.addEventListener("click", () => {
  selectedItems.clear();
  updateSelectionUI();
  document
  .querySelectorAll(".card-checkbox")
  .forEach((cb) => cb.classList.remove("checked"));
});

// Folder picker
async function fetchDirs(path = "") {
  const url = new URL("/api/library", window.location.origin);
  if (path) url.searchParams.set("path", path);
  url.searchParams.set("page", "1");
  // Large page_size to avoid server-side file pagination affecting perceived results
  url.searchParams.set("page_size", "500"); // we only need dirs; dirs are not paginated server-side
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (payload?.status !== "success")
    throw new Error(payload?.message || "Unexpected response");
  const data = payload.data || {};
  const dirs = Array.isArray(data.dirs) ? data.dirs : [];
  return { cwd: String(data.cwd || ""), dirs };
}

function renderCrumbs(path) {
  crumbsEl.innerHTML = "";
  const segs = path.split("/").filter(Boolean);
  const mkSeg = (label, p) => {
    const s = document.createElement("span");
    s.className = "seg";
    s.textContent = label;
    s.addEventListener("click", () => goTo(p));
    return s;
  };
  const divider = document.createTextNode(" / ");
  crumbsEl.appendChild(mkSeg("root", ""));
  let acc = "";
  for (const seg of segs) {
    crumbsEl.appendChild(divider.cloneNode());
    acc = acc ? acc + "/" + seg : seg;
    crumbsEl.appendChild(mkSeg(seg, acc));
  }
}

async function renderDir(path) {
  pickerPath = path;
  renderCrumbs(path);
  dirlistEl.innerHTML = "";
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
          let listEl, statusEl, searchEl, addBtn, mergeBtn, deleteBtn, rewriteBtn, exportBtn, importBtn, importFile, importReplace;
          let tags = [];
          let selected = new Set();
          function initDom(){
            if(listEl) return;
            listEl=document.getElementById("tagsRegistryList");
            statusEl=document.getElementById("tagsRegistryStatus");
            searchEl=document.getElementById("tagsRegistrySearch");
            addBtn=document.getElementById("tagsRegistryAddBtn");
            mergeBtn=document.getElementById("tagsRegistryMergeBtn");
            deleteBtn=document.getElementById("tagsRegistryDeleteBtn");
            rewriteBtn=document.getElementById("tagsRegistryRewriteBtn");
            exportBtn=document.getElementById("tagsRegistryExportBtn");
            importBtn=document.getElementById("tagsRegistryImportBtn");
            importFile=document.getElementById("tagsRegistryImportFile");
            importReplace=document.getElementById("tagsRegistryImportReplace");
            wire();
          }
          function setStatus(msg){ if(statusEl) statusEl.textContent=msg; }
          function render(){ if(!listEl) return; listEl.innerHTML=""; const term=(searchEl?.value||"").toLowerCase(); tags.filter(t=>!term||t.name.toLowerCase().includes(term)).forEach(t=>{ const div=document.createElement("div"); div.className="registry-item"; if(selected.has(t.slug)) div.dataset.selected="1"; div.textContent=t.name; div.onclick=()=>{ toggle(t.slug); }; div.ondblclick=()=>rename(t); listEl.appendChild(div); }); updateButtons(); }
          function updateButtons(){ if(mergeBtn) mergeBtn.disabled=selected.size!==2; if(deleteBtn) deleteBtn.disabled=selected.size===0; }
          async function fetchTags(){ initDom(); setStatus("Loading…"); try{ const r=await fetch("/api/registry/tags"); const j=await r.json(); tags=j?.data?.tags||[]; setStatus(`${tags.length} tag(s)`); render(); }catch(e){ setStatus("Failed"); } }
          function toggle(slug){ if(selected.has(slug)) selected.delete(slug); else selected.add(slug); render(); }
          async function add(){ const name=prompt("New tag name:"); if(!name) return; const r=await fetch("/api/registry/tags/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})}); if(r.ok){ showToast("Tag added","is-success"); fetchTags(); } else showToast("Failed","is-error"); }
          async function rename(t){ const nn=prompt("Rename tag", t.name); if(!nn||nn===t.name) return; const r=await fetch("/api/registry/tags/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:t.name,new_name:nn})}); if(r.ok){ showToast("Renamed","is-success"); fetchTags(); } else showToast("Rename failed","is-error"); }
          async function del(){ if(!confirm(`Delete ${selected.size} tag(s)?`)) return; for(const slug of Array.from(selected)){ await fetch("/api/registry/tags/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:slug})}); } selected.clear(); fetchTags(); }
          async function merge(){ if(selected.size!==2) return; const arr=[...selected]; const into=prompt("Merge: tag that remains", arr[0]); if(!into) return; const from=arr.find(s=>s!==_slugify(into))||arr[0]; const url=`/api/registry/tags/merge?from_name=${encodeURIComponent(from)}&into_name=${encodeURIComponent(into)}`; const r=await fetch(url,{method:"POST"}); if(r.ok){ showToast("Merged","is-success"); selected.clear(); fetchTags(); } else showToast("Merge failed","is-error"); }
          async function rewrite(){ const r=await fetch("/api/registry/tags/rewrite-sidecars",{method:"POST"}); if(r.ok) showToast("Rewritten","is-success"); else showToast("Rewrite failed","is-error"); }
          function exportJson(){ fetch("/api/registry/export").then(r=>r.json()).then(j=>{ const blob=new Blob([JSON.stringify({tags:j.data.tags},null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="tags-registry.json"; a.click(); }); }
          function importJson(){ importFile?.click(); }
          function handleImport(e){ const f=e.target.files?.[0]; if(!f) return; const reader=new FileReader(); reader.onload=async()=>{ try{ const json=JSON.parse(reader.result); const payload={ tags: json.tags || json, replace: !!importReplace?.checked }; const r=await fetch("/api/registry/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); if(r.ok){ showToast("Imported","is-success"); fetchTags(); } else showToast("Import failed","is-error"); }catch(err){ showToast("Invalid JSON","is-error"); } }; reader.readAsText(f); }
          function wire(){ searchEl?.addEventListener("input", render); addBtn?.addEventListener("click", add); mergeBtn?.addEventListener("click", merge); deleteBtn?.addEventListener("click", del); rewriteBtn?.addEventListener("click", rewrite); exportBtn?.addEventListener("click", exportJson); importBtn?.addEventListener("click", importJson); importFile?.addEventListener("change", handleImport); }
          function ensure(){ initDom(); }
          return { ensure, fetch: fetchTags };
        })();

        // -------------------------------------------------
        // Performers Registry Module (re-using existing performers tab if needed later)
        // -------------------------------------------------
        // Placeholder for future dedicated performers registry (already have performers tab)

        // -------------------------------------------------
        // Embedded Auto-Tag logic (Performers & Tags)
        // -------------------------------------------------
        function _parseList(val){ return (val||"").split(/[\,\n]/).map(s=>s.trim()).filter(Boolean); }
        async function _autotagPreview(opts){
          const payload={
            path: opts.path || undefined,
            recursive: !!opts.recursive,
            use_registry_performers: !!opts.useRegistryPerformers,
            use_registry_tags: !!opts.useRegistryTags,
            performers: opts.performers || [],
            tags: opts.tags || [],
            limit: opts.limit || 500
          };
          const r = await fetch("/api/autotag/preview", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)});
          const j = await r.json();
          if(!r.ok) throw new Error(j?.message||"Preview failed");
          return j?.data || {};
        }
        async function _autotagScan(opts){
          const payload={
            path: opts.path || undefined,
            recursive: !!opts.recursive,
            use_registry_performers: !!opts.useRegistryPerformers,
            use_registry_tags: !!opts.useRegistryTags,
            performers: opts.performers || [],
            tags: opts.tags || []
          };
          const r = await fetch("/api/autotag/scan", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)});
          if(!r.ok){ try{ const j=await r.json(); throw new Error(j?.message||"Scan failed"); }catch(e){ throw e; } }
          return true;
        }

        function wireEmbeddedAutotag(){
          // Tags panel elements only (performer autotag removed)
          const tPath = document.getElementById("autotagPathTags");
          const tRec = document.getElementById("autotagRecursiveTags");
          const tUse = document.getElementById("autotagUseRegTagsOnly");
          const tExtra = document.getElementById("autotagExtraTags");
          const tPrev = document.getElementById("autotagPreviewTagsBtn");
          const tScan = document.getElementById("autotagScanTagsBtn");
          const tStatus = document.getElementById("autotagTagResultsStatus");
          const tBody = document.getElementById("autotagTagResultsBody");
          if(tPrev){
            tPrev.addEventListener("click", async ()=>{
              tStatus.textContent="Previewing…"; tBody.innerHTML=""; tScan.disabled=true;
              try {
                const data = await _autotagPreview({ path: tPath.value.trim(), recursive: tRec.checked, useRegistryTags: tUse.checked, tags: _parseList(tExtra.value) });
                const rows = data.candidates || [];
                tStatus.textContent = rows.length? `${rows.length} match(es)`: "No matches";
                rows.forEach(rw=>{
                  const tpl = document.getElementById('autotagRowTemplate');
                  const tr = tpl.content.firstElementChild.cloneNode(true);
                  tr.querySelector('.file').textContent = rw.file;
                  tr.querySelector('.tags').textContent = (rw.tags||[]).join(', ');
                  tBody.appendChild(tr);
                });
                tScan.disabled = rows.length===0;
              } catch(err){ tStatus.textContent = err.message || "Preview failed"; }
            });
          }
          if(tScan){
            tScan.addEventListener("click", async ()=>{ tScan.disabled=true; try { await _autotagScan({ path: tPath.value.trim(), recursive: tRec.checked, useRegistryTags: tUse.checked, tags: _parseList(tExtra.value) }); showToast("Auto‑tag job queued","is-success"); } catch(err){ showToast(err.message||"Queue failed","is-error"); } });
          }
        }

        // Hook tab activation to load registries / autotag lazily
        document.addEventListener("click", (e)=>{
          const btn = e.target.closest && e.target.closest(".tab-button");
          if(!btn) return;
          const tab = btn.getAttribute("data-tab");
          if(tab === "tags"){ TagsRegistry.ensure(); TagsRegistry.fetch(); wireEmbeddedAutotag(); }
        });
      });
      dirlistEl.appendChild(up);
    }
    dirs.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
  );
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
    const none = document.createElement("div");
    none.className = "dir muted";
    const icon = document.createElement("div");
    icon.className = "icon dim";
    const label = document.createElement("div");
    label.textContent = "No folders here";
    none.appendChild(icon);
    none.appendChild(label);
    dirlistEl.appendChild(none);
  }
} catch (e) {
  const err = document.createElement("div");
  err.className = "dir";
  err.textContent = "Failed to list directories.";
  dirlistEl.appendChild(err);
}
}

function openFolderPicker() {
  modal.hidden = false;
  const val = (folderInput.value || "").trim();
  const start = isAbsolutePath(val) ? "" : currentPath();
  renderDir(start);
}
function closeFolderPicker() {
  modal.hidden = true;
}
function goTo(path) {
  renderDir(path);
}
function choose(path) {
  folderInput.value = path || "";
  closeFolderPicker();
  loadLibrary();
}
chooseBtn.addEventListener("click", () => choose(pickerPath));
cancelBtn.addEventListener("click", () => closeFolderPicker());
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeFolderPicker();
});

// Root setter merged into the single input
function isAbsolutePath(p) {
  if (!p) return false;
  // Allow Unix absolute (/...) and home (~), and Windows drive (C:\\ or C:/)
  return p.startsWith("/") || p.startsWith("~") || /^[A-Za-z]:[\\/]/.test(p);
}

// Lightweight global notifier so we can show toasts outside TasksManager too
function notify(message, type = "info") {
  try {
    if (
      window.tasksManager &&
      typeof window.tasksManager.showNotification === "function"
    ) {
      window.tasksManager.showNotification(message, type);
      return;
    }
  } catch (_) {}
  // Fallback toast using same host/classes (no inline styles)
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast";
  if (type === "success") el.classList.add("is-success");
  else if (type === "error") el.classList.add("is-error");
  else el.classList.add("is-info");
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  el.textContent = message;
  host.appendChild(el);
  const lifespan = 5000, fadeMs = 250;
  setTimeout(() => { el.classList.add("fade-out"); setTimeout(() => el.remove(), fadeMs + 30); }, lifespan - fadeMs);
}

async function setRoot(val) {
  const rootVal = (val || "").trim();
  if (!rootVal) return;
  if (!isAbsolutePath(rootVal)) {
    notify(
      "Please enter an absolute path (e.g., /Volumes/Media or ~/Movies).",
      "error"
    );
    return;
  }
  try {
    // Validate path first to prevent 400s
    const tp = await fetch(
      "/api/testpath?" + new URLSearchParams({ path: rootVal }),
      { method: "POST" }
    );
    if (!tp.ok) throw new Error("Path check failed (HTTP " + tp.status + ")");
    const tj = await tp.json();
    const tdata = tj?.data || {};
    if (!tdata.exists || !tdata.is_dir)
      throw new Error("Path does not exist or is not a directory");

    // Set root on the server
    const sr = await fetch(
      "/api/setroot?" + new URLSearchParams({ root: rootVal }),
      { method: "POST" }
    );
    if (!sr.ok) throw new Error("HTTP " + sr.status);
    const sjson = await sr.json();
    if (sjson?.status !== "success")
      throw new Error(sjson?.message || "Failed to set root");

    // After setting root, clear the input so it's ready for relative paths
    const newRoot = String(sjson.data.root || rootVal);
    folderInput.value = "";
    folderInput.placeholder = `Root: ${newRoot} — type a relative path to browse, or an absolute path to change root`;
    currentPage = 1;
    notify(`Root set to ${newRoot}`, "success");
    await loadLibrary();
  } catch (err) {
    notify(
      `Failed to set root: ${
        err && err.message
        ? err.message
        : "Ensure the directory exists and is accessible."
      }`,
      "error"
    );
  }
}

// Single-input behavior: Enter applies relative browse or sets root if absolute
folderInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const val = (folderInput.value || "").trim();
  currentPage = 1; // Reset to first page when changing folders
  if (!val) {
    await loadLibrary();
    return;
  }
  if (isAbsolutePath(val)) {
    await setRoot(val);
  } else {
    await loadLibrary();
  }
});

// Optional pick root button (present only in Settings panel after header removal)
const pickRootBtn = document.getElementById("pickRootBtn");
if (pickRootBtn) {
  pickRootBtn.addEventListener("click", () => openFolderPicker());
}

// Tab Router for URL-based navigation
class TabRouter {
  constructor(tabSystem) {
    this.tabSystem = tabSystem;
    // Persist last active tab across reloads; fall back to library.
    try {
      const saved = localStorage.getItem("activeTab");
      this.defaultTab = saved || "library";
    } catch (e) {
      this.defaultTab = "library";
    }
    this.history = [];
  }

  init() {
    // Listen for hash changes (back/forward navigation)
    window.addEventListener("hashchange", () => {
      this.handleRouteChange();
    });

    // Handle initial route on page load
    this.handleRouteChange();
  }

  handleRouteChange() {
    const hash = window.location.hash.slice(1); // Remove the # symbol
    const tabId = hash || this.defaultTab;

    // Track navigation history
    if (
      this.history.length === 0 ||
      this.history[this.history.length - 1] !== tabId
    ) {
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
    this.activeTab = "library";
    this.tabs = new Map();
    this.router = new TabRouter(this);
    this.init();
  }

  init() {
    // Find all tab buttons and panels
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanels = document.querySelectorAll(".tab-panel");

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
      tab.button.addEventListener("click", (e) => {
        e.preventDefault();
        this.switchToTab(tabId);
      });
    });
  }

  initKeyboardNavigation() {
    const tabButtons = Array.from(document.querySelectorAll(".tab-button"));

    tabButtons.forEach((button, index) => {
      button.addEventListener("keydown", (e) => {
        let targetIndex = index;

        switch (e.key) {
          case "ArrowLeft":
          e.preventDefault();
          targetIndex = index > 0 ? index - 1 : tabButtons.length - 1;
          break;
          case "ArrowRight":
          e.preventDefault();
          targetIndex = index < tabButtons.length - 1 ? index + 1 : 0;
          break;
          case "Home":
          e.preventDefault();
          targetIndex = 0;
          break;
          case "End":
          e.preventDefault();
          targetIndex = tabButtons.length - 1;
          break;
          case "Enter":
          case " ":
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
      tab.button.classList.toggle("active", isActive);
      tab.button.setAttribute("aria-selected", isActive);

      // Update panel visibility
      tab.panel.classList.toggle("active", isActive);
      tab.panel.hidden = !isActive;
    });

    // Focus management for accessibility
    const activeTab = this.tabs.get(tabId);
    if (activeTab && document.activeElement !== activeTab.button) {
      // Don't steal focus unless user is navigating with keyboard
      if (
        document.activeElement &&
        document.activeElement.classList.contains("tab-button")
      ) {
        activeTab.button.focus();
      }
    }

    // Update URL if requested
    if (updateUrl) {
      this.router.updateUrl(tabId);
    }

    // Trigger custom event for other components to react
    window.dispatchEvent(
      new CustomEvent("tabchange", {
        detail: { activeTab: tabId, previousTab: previousTab },
      })
    );

    // Persist active tab (ignore failures in private modes)
    try {
      localStorage.setItem("activeTab", tabId);
    } catch (e) {
      /* ignore */
    }
  }

  getActiveTab() {
    return this.activeTab;
  }

  addTab(tabId, buttonText, panelContent) {
    // Method to programmatically add tabs if needed
    const tabNav = document.querySelector(".tab-nav");
    const tabPanels = document.querySelector(".tab-panels");

    if (!tabNav || !tabPanels) return;

    // Create button
    const button = document.createElement("button");
    button.className = "tab-button";
    button.role = "tab";
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-controls", `${tabId}-panel`);
    button.id = `${tabId}-tab`;
    button.dataset.tab = tabId;
    button.textContent = buttonText;
    tabNav.appendChild(button);

    // Create panel. Accept either:
    // - a template id string (e.g. '#myTemplate') to clone
    // - a HTML string (panelContent) which will be set as innerHTML (fallback)
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.role = "tabpanel";
    panel.setAttribute("aria-labelledby", `${tabId}-tab`);
    panel.id = `${tabId}-panel`;
    panel.hidden = true;
    // If caller passed a template reference (string '#id' or element), prefer cloning
    try {
      let tpl = null;
      if (typeof panelContent === 'string' && panelContent.startsWith('#')) {
        tpl = document.getElementById(panelContent.slice(1));
        if (tpl && tpl.tagName === 'TEMPLATE') {
          panel.appendChild(tpl.content.cloneNode(true));
        } else {
          // fallback: treat as HTML id not found -> leave empty
          panel.innerHTML = '';
        }
      } else if (panelContent && panelContent.tagName === 'TEMPLATE') {
        panel.appendChild(panelContent.content.cloneNode(true));
      } else if (typeof panelContent === 'string') {
        // backward-compat: accept raw HTML string
        panel.innerHTML = panelContent;
      } else {
        // unknown type: leave empty
        panel.innerHTML = '';
      }
    } catch (e) {
      panel.innerHTML = typeof panelContent === 'string' ? panelContent : '';
    }
    tabPanels.appendChild(panel);

    // Register the new tab
    this.tabs.set(tabId, { button, panel });

    // Add event listeners
    button.addEventListener("click", (e) => {
      e.preventDefault();
      this.switchToTab(tabId);
    });

    return { button, panel };
  }
}

// Initialize tab system when DOM is ready
let tabSystem;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    tabSystem = new TabSystem();
    wireSettings();
    setupViewportFitPlayer();
  });
} else {
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
  const playerPanel = document.getElementById("player-panel");
  const playerBar = document.getElementById("playerBar");
  const videoStage = document.getElementById("videoStage");
  const vid = document.getElementById("playerVideo");
  if (!playerPanel || !playerBar || !vid || !videoStage) return;

  function recompute() {
    // Panel height already excludes header (sticky header outside main scroll)
    const panelH = playerPanel.getBoundingClientRect().height;
    // Overlay bar sits over video; treat bar height negligible for layout
    const spare = 20; // minimal gap/padding reserve
    const maxH = panelH - spare;
    // Maintain 16:9 aspect by width
    const stageWidth = videoStage.getBoundingClientRect().width;
    const ideal = stageWidth / (16 / 9);
    const finalH = Math.min(ideal, maxH);
    document.documentElement.style.setProperty("--player-max-h", finalH + "px");
  }
  ["resize", "orientationchange"].forEach((ev) =>
    window.addEventListener(ev, recompute)
);
vid.addEventListener("loadedmetadata", recompute);
// Slight delay to allow fonts/layout settle
setTimeout(recompute, 0);
setTimeout(recompute, 150);
}

// -----------------------------
// Player Manager
// -----------------------------
const Player = (() => {
  // DOM refs
  let videoEl,
  titleEl,
  curEl,
  totalEl,
  timelineEl,
  heatmapEl,
  heatmapCanvasEl,
  progressEl,
  markersEl,
  spriteTooltipEl,
  overlayBarEl; // floating translucent title bar
  let subtitleOverlayEl;
  // Custom controls
  let btnPlayPause,
  btnMute,
  volSlider,
  rateSelect,
  btnCC,
  btnPip,
  btnFullscreen;
  // Sidebar refs
  // Sidebar title removed; retain variable for backward compatibility but unused
  let sbFileNameEl;
  // File info table fields
  let fiDurationEl,
  fiResolutionEl,
  fiVideoCodecEl,
  fiAudioCodecEl,
  fiBitrateEl,
  fiVBitrateEl,
  fiABitrateEl,
  fiSizeEl,
  fiModifiedEl,
  fiPathEl;
  // Playback helpers (avoid unhandled play() rejections)
  const safePlay = async (v) => {
    if (!v) return;
    try {
      // Some browsers reject play() if another play/pause/seek is pending.
      // Await and swallow errors per recommended guidance.
      await v.play();
    } catch (e) {
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
      try { v.removeEventListener('seeked', onSeek); } catch(_){}
      res();
    };
    try {
      v.addEventListener('seeked', onSeek);
    } catch (_) {}
    setTimeout(() => { if (!done) { done = true; try { v.removeEventListener('seeked', onSeek); } catch(_){} res(); } }, timeout);
  });
  // Compact artifact badges
  let badgeHeatmap,
  badgeScenes,
  badgeSubtitles,
  badgeSprites,
  badgeFaces,
  badgeHover,
  badgePhash;
  let badgeHeatmapStatus,
  badgeScenesStatus,
  badgeSubtitlesStatus,
  badgeSpritesStatus,
  badgeFacesStatus,
  badgeHoverStatus,
  badgePhashStatus;
  let btnSetThumb, btnAddMarker;

  // State
  let currentPath = null; // relative path from /api library
  let duration = 0;
  let sprites = null; // { index, sheet }
  let scenes = [];
  let introEnd = null;
  let outroBegin = null;
  let hasHeatmap = false;
  let subtitlesUrl = null;
  let timelineMouseDown = false;
  // Overlay auto-hide timer
  let overlayHideTimer = null;
  // @TODO copilot: make this configurable in a setting
  const OVERLAY_FADE_DELAY = 2500; // ms before fading overlay bar
  // Scrubber elements
  let scrubberEl = null,
  scrubberTrackEl = null,
  scrubberProgressEl = null,
  scrubberBufferEl = null,
  scrubberTimeEl = null;
  let btnSetIntroEnd = null;
  let scrubberRAF = null;
  let scrubberDragging = false;
  let scrubberWasPaused = null;
  let scrubberHandleEl = null;
  let scrubberScenesLayer = null;

  // ---- Progress persistence (localStorage) ----
  const LS_PREFIX = "mediaPlayer";
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
      // Store compact last object { path, time }
      try {
        localStorage.setItem(
          keyLastVideoObj(),
          JSON.stringify({
            path,
            time: Math.max(0, Number(data?.t) || 0),
            ts: Date.now(),
          })
        );
      } catch (_) {}
      // Legacy key for backward compatibility
      try {
        localStorage.setItem(keyLastVideoPathLegacy(), path);
      } catch (_) {}
    } catch (_) {}
  }
  function loadProgress(path) {
    try {
      const raw = localStorage.getItem(keyForVideo(path));
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return null;
      return j;
    } catch (_) {
      return null;
    }
  }
  function getLastVideoEntry() {
    // Prefer new object key; fallback to legacy path only
    try {
      const raw = localStorage.getItem(keyLastVideoObj());
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === "object" && j.path) return j;
      }
    } catch (_) {}
    try {
      const legacy = localStorage.getItem(keyLastVideoPathLegacy());
      if (legacy) return { path: legacy, time: 0 };
    } catch (_) {}
    return null;
  }

  function qs(id) {
    return document.getElementById(id);
  }
  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return (
      (h ? h + ":" : "") +
      String(m).padStart(2, "0") +
      ":" +
      String(s).padStart(2, "0")
    );
  }

  function initDom() {
    btnSetOutroBegin = qs("btnSetOutroBegin");
    if (btnSetOutroBegin && !btnSetOutroBegin._wired) {
      btnSetOutroBegin._wired = true;
      btnSetOutroBegin.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, Math.min(duration || 0, videoEl.currentTime || 0));
        try {
          // Save to localStorage for now; backend support can be added
          localStorage.setItem(`${LS_PREFIX}:outroBegin:${currentPath}`, String(t));
          outroBegin = t;
          notify('Outro set','success');
          renderMarkers();
          renderMarkersList();
        } catch(e) {
          notify('Failed to set outro begin','error');
        }
      });
    }
    if (videoEl) return; // already
    videoEl = qs("playerVideo");
    titleEl = qs("playerTitle");
    overlayBarEl = qs("playerOverlayBar");
    if (videoEl && !videoEl._dblWired) {
      videoEl._dblWired = true;
      videoEl.addEventListener('dblclick', async (e) => {
        try {
          const container = videoEl && videoEl.parentElement ? videoEl.parentElement : document.body;
          if (!document.fullscreenElement) await container.requestFullscreen();
          else await document.exitFullscreen();
        } catch (_) {}
      });
    }
    // subtitle overlay element (in-video textual captions rendered by JS)
    subtitleOverlayEl = qs('subtitleOverlay');
    if (overlayBarEl && (!titleEl || !titleEl.textContent.trim())) {
      overlayBarEl.dataset.empty = '1';
    }
    // Scrubber
    scrubberEl = qs("playerScrubber");
    scrubberTrackEl = qs("playerScrubberTrack");
    scrubberProgressEl = qs("playerScrubberProgress");
    scrubberBufferEl = qs("playerScrubberBuffer");
    scrubberTimeEl = qs("playerScrubberTime");
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
    curEl = qs("curTime");
    totalEl = qs("totalTime");
    timelineEl = qs("timeline"); // legacy element (may be missing)
    heatmapEl = qs("timelineHeatmap");
    heatmapCanvasEl = qs("timelineHeatmapCanvas");
    progressEl = qs("timelineProgress");
    markersEl = qs("timelineMarkers");
    spriteTooltipEl = qs("spritePreview");
    if (!spriteTooltipEl) {
      // Fallback in case markup changed; create ephemeral element
      spriteTooltipEl = document.createElement('div');
      spriteTooltipEl.id = 'spritePreview';
      spriteTooltipEl.style.position = 'absolute';
      spriteTooltipEl.style.display = 'none';
      (videoEl && videoEl.parentElement ? videoEl.parentElement : document.body).appendChild(spriteTooltipEl);
    }
    badgeHeatmap = qs("badgeHeatmap");
    badgeScenes = qs("badgeScenes");
    badgeSubtitles = qs("badgeSubtitles");
    badgeSprites = qs("badgeSprites");
    badgeFaces = qs("badgeFaces");
    badgeHover = qs("badgeHover");
    badgePhash = qs("badgePhash");
    badgeHeatmapStatus = qs("badgeHeatmapStatus");
    badgeScenesStatus = qs("badgeScenesStatus");
    badgeSubtitlesStatus = qs("badgeSubtitlesStatus");
    badgeSpritesStatus = qs("badgeSpritesStatus");
    badgeFacesStatus = qs("badgeFacesStatus");
    badgeHoverStatus = qs("badgeHoverStatus");
    badgePhashStatus = qs("badgePhashStatus");

    // Support new hyphenated badge IDs (preferred) with fallback to legacy camelCase if present
    const pick = (hyphen, legacy) => document.getElementById(hyphen) || document.getElementById(legacy);
    badgeHeatmap = pick('badge-heatmap', 'badgeHeatmap');
    badgeScenes = pick('badge-scenes', 'badgeScenes');
    badgeSubtitles = pick('badge-subtitles', 'badgeSubtitles');
    badgeSprites = pick('badge-sprites', 'badgeSprites');
    badgeFaces = pick('badge-faces', 'badgeFaces');
    badgeHover = pick('badge-hover', 'badgeHover');
    badgePhash = pick('badge-phash', 'badgePhash');
    badgeHeatmapStatus = pick('badge-heatmap-status', 'badgeHeatmapStatus');
    badgeScenesStatus = pick('badge-scenes-status', 'badgeScenesStatus');
    badgeSubtitlesStatus = pick('badge-subtitles-status', 'badgeSubtitlesStatus');
    badgeSpritesStatus = pick('badge-sprites-status', 'badgeSpritesStatus');
    badgeFacesStatus = pick('badge-faces-status', 'badgeFacesStatus');
    badgeHoverStatus = pick('badge-hover-status', 'badgeHoverStatus');
    badgePhashStatus = pick('badge-phash-status', 'badgePhashStatus');
    btnSetThumb = qs("btnSetThumb");
    btnAddMarker = qs("btnAddMarker");
    btnSetIntroEnd = qs("btnSetIntroEnd");
    btnSetOutroBegin = qs("btnSetOutroBegin");
    // Controls
    btnPlayPause = qs("btnPlayPause");
    btnMute = qs("btnMute");
    volSlider = qs("volSlider");
    rateSelect = qs("rateSelect");
    btnCC = qs("btnCC");
    btnPip = qs("btnPip");
    btnFullscreen = qs("btnFullscreen");

    // Sidebar
    sbFileNameEl = null; // removed from DOM
    fiDurationEl = qs("fiDuration");
    fiResolutionEl = qs("fiResolution");
    fiVideoCodecEl = qs("fiVideoCodec");
    fiAudioCodecEl = qs("fiAudioCodec");
    fiBitrateEl = qs("fiBitrate");
    fiVBitrateEl = qs("fiVBitrate");
    fiABitrateEl = qs("fiABitrate");
    fiSizeEl = qs("fiSize");
    fiModifiedEl = qs("fiModified");
    fiPathEl = qs("fiPath");
    // Allow inline rename of the current file by double‑clicking the Path value
    if (fiPathEl && !fiPathEl._renameWired) {
      fiPathEl._renameWired = true;
      fiPathEl.title = 'Double‑click to rename file (artifacts move with it)';
      fiPathEl.style.cursor = 'text';
      fiPathEl.addEventListener('dblclick', () => {
        try {
          if (!currentPath) return;
          if (fiPathEl.querySelector('input')) return; // already editing
          const origRel = currentPath; // e.g. folder/name.mp4
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
            wordBreak: 'break-all'
          });
          // Replace content
          fiPathEl.textContent = '';
          fiPathEl.appendChild(input);
          input.focus();
          input.select();
          // Auto-resize height to fit content (cap at 5 lines / ~200px)
          const autoresize = () => {
            try { input.style.height = 'auto'; input.style.height = Math.min(200, input.scrollHeight) + 'px'; } catch(_) {}
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
            if (committing) return; committing = true;
            let newName = (input.value || '').replace(/[\r\n]+/g, ' ').trim();
            if (!newName) { cancel(); return; }
            // Disallow path separators for now (rename only, no move) per UX request
            if (/[\\/]/.test(newName)) {
              notify('Name cannot contain "/"', 'error');
              committing = false; input.focus(); return;
            }
            if (newName === origName) { cancel(); return; }
            // Preserve original extension enforcement (server also validates)
            const origExt = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '';
            const newExt = newName.includes('.') ? newName.slice(newName.lastIndexOf('.')) : '';
            if (origExt.toLowerCase() !== newExt.toLowerCase()) {
              notify('Extension must remain ' + origExt, 'error');
              committing = false; input.focus(); return;
            }
            // Save current playback position to restore after reopen
            let resumeT = 0; let wasPaused = true;
            try { if (videoEl) { resumeT = videoEl.currentTime || 0; wasPaused = videoEl.paused; } } catch(_){}
            fiPathEl.classList.add('renaming');
            try {
              const u = new URL('/api/media/rename', window.location.origin);
              u.searchParams.set('path', origRel);
              u.searchParams.set('new_name', newName);
              const r = await fetch(u.toString(), { method: 'POST' });
              if (!r.ok) {
                try { const j = await r.json(); notify('Rename failed: ' + (j?.error || r.status), 'error'); } catch(_) { notify('Rename failed', 'error'); }
                cancel(); return;
              }
              const dirPrefix = dir ? dir + '/' : '';
              const newRel = dirPrefix + newName;
              notify('Renamed to ' + newName, 'success');
              // Update path + reopen video to keep playback position
              currentPath = newRel;
              // Attempt to restore playback after reopen
              resumeOverrideTime = resumeT;
              // Immediately swap textarea back to static text before reopening to avoid lingering edit state
              try { fiPathEl.textContent = newRel; } catch(_){}
              open(newRel); // will set new metadata + title (overwrites value again safely)
              if (!wasPaused) { setTimeout(() => { try { if (videoEl && videoEl.paused) safePlay(videoEl); } catch(_){} }, 800); }
              // Refresh library grid entry names later
              setTimeout(() => { try { loadLibrary(); } catch(_){} }, 400);
            } catch(err) {
              notify('Rename error', 'error');
              cancel();
            } finally {
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
        } catch(_) {}
      });
    }



    // Wire basic events
    if (videoEl) {
      videoEl.addEventListener("timeupdate", () => {
        const t = videoEl.currentTime || 0;
        if (curEl) curEl.textContent = fmtTime(t);
        if (duration > 0 && progressEl) {
          const pct = Math.max(0, Math.min(100, (t / duration) * 100));
          try { progressEl.style.width = pct + "%"; } catch(_) {}
        }
        // Throttled periodic save of progress (every ~5s or on near-end)
        try {
          if (!currentPath) return;
          const now = Date.now();
          if (
            !videoEl._lastPersist ||
            now - videoEl._lastPersist > 5000 ||
            (duration && duration - t < 2)
          ) {
            saveProgress(currentPath, {
              t,
              d: duration,
              paused: videoEl.paused,
              rate: videoEl.playbackRate,
            });
            videoEl._lastPersist = now;
          }
        } catch (_) {}
      });
      videoEl.addEventListener("loadedmetadata", async () => {
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
            } catch (_) {
              if (!done) { done = true; try { videoEl.removeEventListener('seeked', onSeek); } catch(_){} res(); }
            }
            // fallback timeout
            setTimeout(() => { if (!done) { done = true; try { videoEl.removeEventListener('seeked', onSeek); } catch(_){} res(); } }, timeout);
          });
          // use Player-level safePlay(videoEl) to attempt playback and swallow rejections
          if (saved && Number.isFinite(saved.t)) {
            const target = Math.max(
              0,
              Math.min(duration || 0, Number(saved.t))
            );
            if (target && Math.abs(target - (videoEl.currentTime || 0)) > 0.5) {
              await awaitSeek(target);
            }
            if (saved.rate && Number.isFinite(saved.rate)) {
              videoEl.playbackRate = Number(saved.rate);
            }
            const autoplayResume =
            localStorage.getItem("setting.autoplayResume") === "1";
            if (!(saved.paused || !autoplayResume)) {
              await safePlay(videoEl);
            }
          } else if (override && Number.isFinite(override)) {
            const t = Math.max(0, Math.min(duration || 0, Number(override)));
            if (t && Math.abs(t - (videoEl.currentTime || 0)) > 0.25) await awaitSeek(t);
            const autoplayResume = localStorage.getItem("setting.autoplayResume") === "1";
            if (autoplayResume) await safePlay(videoEl);
          } else {
            // No saved progress or explicit override — optionally start at intro end
            try {
              const startAtIntro = (function(){ try { const cb = document.getElementById('settingStartAtIntro'); if(cb) return !!cb.checked; return localStorage.getItem('setting.startAtIntro') !== '0'; } catch(_) { return true; } })();
              if (startAtIntro) {
                // prefer localStorage per-path key first, then server-provided introEnd
                try {
                  const key = `${LS_PREFIX}:introEnd:${currentPath}`;
                  const raw = localStorage.getItem(key);
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
                } catch(_) {}
              }
            } catch (_) {}
          }
          resumeOverrideTime = null;
        } catch (_) {}
      });
      // keep overlay cleared on metadata load
      try { if (subtitleOverlayEl) { subtitleOverlayEl.textContent = ''; subtitleOverlayEl.hidden = true; } } catch(_) {}
      videoEl.addEventListener("play", syncControls);
      videoEl.addEventListener("pause", () => {
        syncControls();
        try {
          if (currentPath) {
            const t = Math.max(0, videoEl.currentTime || 0);
            saveProgress(currentPath, {
              t,
              d: duration,
              paused: true,
              rate: videoEl.playbackRate,
            });
          }
        } catch (_) {}
      });
      videoEl.addEventListener("ended", () => {
        syncControls();
        try {
          if (currentPath) {
            const t = Math.max(0, videoEl.currentTime || 0);
            saveProgress(currentPath, {
              t,
              d: duration,
              paused: true,
              rate: videoEl.playbackRate,
            });
          }
        } catch (_) {}
      });
      videoEl.addEventListener("volumechange", syncControls);
      videoEl.addEventListener("ratechange", syncControls);
      videoEl.addEventListener("enterpictureinpicture", syncControls);
      videoEl.addEventListener("leavepictureinpicture", syncControls);
      // Click anywhere on the video toggles play/pause
      if (!videoEl._clickToggleWired) {
        videoEl._clickToggleWired = true;
        videoEl.addEventListener("click", (e) => {
          // Only toggle when clicking the video surface itself
          if (e.target !== videoEl) return;
          if (videoEl.paused) safePlay(videoEl);
          else videoEl.pause();
        });
      }
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
          t,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      };
      (timelineEl || scrubberTrackEl).addEventListener("mousedown", (e) => {
        timelineMouseDown = true;
        seekTo(e);
      });
      window.addEventListener("mousemove", (e) => {
        if (timelineMouseDown) seekTo(e);
      });
      window.addEventListener("mouseup", () => {
        timelineMouseDown = false;
      });
      (timelineEl || scrubberTrackEl).addEventListener("mouseenter", () => {
        spriteHoverEnabled = true;
      });
      (timelineEl || scrubberTrackEl).addEventListener("mouseleave", () => {
        spriteHoverEnabled = false;
        hideSprite();
      });
      (timelineEl || scrubberTrackEl).addEventListener("mousemove", (e) => handleSpriteHover(e));
    }
    if (btnSetThumb && !btnSetThumb._wired) {
      btnSetThumb._wired = true;
      btnSetThumb.addEventListener("click", async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, videoEl.currentTime || 0);
        try {
          const url = new URL("/api/cover/create", window.location.origin);
          url.searchParams.set("path", currentPath);
          url.searchParams.set("t", String(t.toFixed(3)));
          url.searchParams.set("overwrite", "true");
          const r = await fetch(url, { method: "POST" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          notify("Cover updated from current frame.", "success");
          // Refresh library tile if visible by reloading page 1 quickly
          setTimeout(() => loadLibrary(), 200);
          // Also add a marker at this time if not already very close to an existing one
          try {
            const epsilon = 0.25; // seconds tolerance
            const exists = Array.isArray(scenes) && scenes.some(s => Math.abs((s.time||0) - t) <= epsilon);
            if (!exists) {
              const mu = new URL('/api/marker', window.location.origin);
              mu.searchParams.set('path', currentPath);
              mu.searchParams.set('time', String(t.toFixed(3)));
              const mr = await fetch(mu.toString(), { method:'POST' });
              if (mr.ok) {
                // Reload scenes + markers so UI reflects new tick & list entry
                await loadScenes();
                try { renderMarkers(); } catch(_) {}
              }
            }
          } catch(_){ /* ignore marker add errors silently */ }
        } catch (e) {
          notify("Failed to set thumbnail", "error");
        }
      });
    }
    if (btnSetIntroEnd && !btnSetIntroEnd._wired) {
      btnSetIntroEnd._wired = true;
      btnSetIntroEnd.addEventListener('click', async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, Math.min(duration||0, videoEl.currentTime||0));
        try {
          // Attempt to persist server-side first
          try {
            const mu = new URL('/api/scenes/intro', window.location.origin);
            mu.searchParams.set('path', currentPath);
            mu.searchParams.set('time', String(t.toFixed(3)));
            const mr = await fetch(mu.toString(), { method: 'POST' });
            if (!mr.ok) throw new Error('server');
          } catch (e) {
            // Fallback to localStorage if server fails
            const key = `${LS_PREFIX}:introEnd:${currentPath}`;
            localStorage.setItem(key, String(Number(t.toFixed(3))));
          }
          notify('Intro end set at ' + fmtTime(t), 'success');
          try { await loadScenes(); } catch(_){ }
          try { renderMarkers(); } catch(_){ }
        } catch (e) {
          notify('Failed to set intro end', 'error');
        }
      });
    }
    // Wire custom controls
    if (btnPlayPause && !btnPlayPause._wired) {
      btnPlayPause._wired = true;
      btnPlayPause.addEventListener("click", () => {
        if (!videoEl) return;
        if (videoEl.paused) safePlay(videoEl);
        else videoEl.pause();
      });
    }
    if (btnMute && !btnMute._wired) {
      btnMute._wired = true;
      btnMute.addEventListener("click", () => {
        if (videoEl) videoEl.muted = !videoEl.muted;
      });
    }
    if (volSlider && !volSlider._wired) {
      volSlider._wired = true;
      volSlider.addEventListener("input", () => {
        if (videoEl)
          videoEl.volume = Math.max(
          0,
          Math.min(1, parseFloat(volSlider.value))
        );
      });
    }
    if (rateSelect && !rateSelect._wired) {
      rateSelect._wired = true;
      rateSelect.addEventListener("change", () => {
        if (videoEl) videoEl.playbackRate = parseFloat(rateSelect.value || "1");
      });
    }
    if (btnCC && !btnCC._wired) {
      btnCC._wired = true;
      btnCC.addEventListener("click", () => {
        try {
          const tracks = videoEl
          ? Array.from(videoEl.querySelectorAll("track"))
          : [];
          const anyShowing = tracks.some((t) => t.mode === "showing");
          tracks.forEach((t) => (t.mode = anyShowing ? "disabled" : "showing"));
          syncControls();
        } catch (_) {}
      });
    }
    if (btnPip && !btnPip._wired) {
      btnPip._wired = true;
      btnPip.addEventListener("click", async () => {
        try {
          if (!document.pictureInPictureElement)
            await videoEl.requestPictureInPicture();
          else await document.exitPictureInPicture();
        } catch (_) {}
      });
    }
    if (btnFullscreen && !btnFullscreen._wired) {
      btnFullscreen._wired = true;
      btnFullscreen.addEventListener("click", async () => {
        try {
          const container =
          videoEl && videoEl.parentElement
          ? videoEl.parentElement
          : document.body;
          if (!document.fullscreenElement) await container.requestFullscreen();
          else await document.exitFullscreen();
        } catch (_) {}
      });
    }
    if (btnAddMarker && !btnAddMarker._wired) {
      btnAddMarker._wired = true;
      btnAddMarker.addEventListener("click", async () => {
        if (!currentPath || !videoEl) return;
        const t = Math.max(0, videoEl.currentTime || 0);
        try {
          const url = new URL("/api/marker", window.location.origin);
          url.searchParams.set("path", currentPath);
          url.searchParams.set("time", String(t.toFixed(3)));
          const r = await fetch(url, { method: "POST" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          notify("Marker added", "success");
          await loadScenes();
          renderMarkers();
        } catch (e) {
          notify("Failed to add marker", "error");
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
      if (currentPath) return; // something already playing/selected
      const last = getLastVideoEntry();
      if (!last || !last.path) return;
      // Defer until at least one library load attempt has happened (totalFiles initialized)
      if (typeof totalFiles === "undefined") {
        setTimeout(tryAutoResumeLast, 600);
        return;
      }
      // Attempt a HEAD on metadata to validate existence
      const p = last.path;
      // Use existing metadata endpoint (was /api/videos/meta, which doesn't exist and triggered 404s)
      const metaUrl = "/api/metadata/get?path=" + encodeURIComponent(p);
      // Avoid generating 404s: consult unified artifact status instead of probing cover directly.
      let exists = false;
      try {
        window.__artifactStatus = window.__artifactStatus || {};
        if (window.__artifactStatus[p]) {
          exists = true; // path known (even if cover missing) -> we still attempt open; player logic will guard loaders
        } else {
          const su = new URL("/api/artifacts/status", window.location.origin);
          su.searchParams.set("path", p);
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
      } catch (_) {}
      if (!exists) return; // status endpoint failed entirely
      // Switch to player tab and load via Player module
      resumeOverrideTime = Number.isFinite(last.time)
      ? Number(last.time)
      : null;
      if (window.Player && typeof window.Player.open === "function") {
        window.Player.open(p);
      } else if (
        typeof Player !== "undefined" &&
        Player &&
        typeof Player.open === "function"
      ) {
        Player.open(p);
      }
      // Do NOT auto-switch tab here; resume should be passive unless user opted in explicitly.
    } catch (_) {}
  }

  // Wrap existing initial load hook
  const _origInit = window.addEventListener;
  window.addEventListener("load", () => {
    try {
      const wasSkipped = (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1');
      if (wasSkipped) {
        // Remove any lingering last keys and per-video progress stored during the previous session
        try {
          // remove exact last keys
          localStorage.removeItem(keyLastVideoObj());
        } catch(_) {}
        try {
          localStorage.removeItem(keyLastVideoPathLegacy());
        } catch(_) {}
        try {
          // remove any mediaPlayer:video:* entries
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.indexOf(`${LS_PREFIX}:video:`) === 0) toRemove.push(k);
            if (/last/i.test(k)) toRemove.push(k);
          }
          toRemove.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
        } catch(_) {}
      }
    } catch(_) {}
    try { localStorage.removeItem('mediaPlayer:skipSaveOnUnload'); } catch(_) {}
    setTimeout(tryAutoResumeLast, 800); // slight delay to allow initial directory list
  });
  window.addEventListener("beforeunload", () => {
    try {
      // If a recent Reset was performed we set a marker to avoid re-saving
      try {
        if (localStorage.getItem('mediaPlayer:skipSaveOnUnload') === '1') return;
      } catch (_) {}
      if (currentPath && videoEl) {
        const t = Math.max(0, videoEl.currentTime || 0);
        saveProgress(currentPath, {
          t,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      }
    } catch (_) {}
  });

  function syncControls() {
    try {
      if (!videoEl) return;
      // Play/Pause swap
      if (btnPlayPause) {
        const playIcon = btnPlayPause.querySelector(".icon-play");
        const pauseIcon = btnPlayPause.querySelector(".icon-pause");
        if (playIcon && pauseIcon) {
          if (videoEl.paused) {
            playIcon.hidden = false;
            pauseIcon.hidden = true;
          } else {
            playIcon.hidden = true;
            pauseIcon.hidden = false;
          }
        }
      }
      // Volume swap
      if (btnMute) {
        const vol = btnMute.querySelector(".icon-vol");
        const muted = btnMute.querySelector(".icon-muted");
        if (vol && muted) {
          if (videoEl.muted || videoEl.volume === 0) {
            vol.hidden = true;
            muted.hidden = false;
          } else {
            vol.hidden = false;
            muted.hidden = true;
          }
        }
      }
      if (volSlider && typeof videoEl.volume === "number")
        volSlider.value = String(videoEl.volume);
      if (rateSelect) rateSelect.value = String(videoEl.playbackRate || 1);
      if (btnCC) {
        const tracks = Array.from(videoEl.querySelectorAll("track"));
        const anyShowing = tracks.some((t) => t.mode === "showing");
        btnCC.classList.toggle("active", anyShowing);
        // Hide overlay if CC is off
        try {
          if (subtitleOverlayEl && !anyShowing) { subtitleOverlayEl.hidden = true; }
        } catch(_) {}
      }
    } catch (_) {}
  }

  // -----------------------------
  // Floating overlay title bar logic
  // -----------------------------
  function showOverlayBar() {
    try {
      if (!overlayBarEl) overlayBarEl = document.getElementById("playerOverlayBar");
      if (!overlayBarEl) return;
      overlayBarEl.classList.remove("fading");
      if (scrubberEl) scrubberEl.classList.remove("fading");
      if (overlayHideTimer) {
        clearTimeout(overlayHideTimer);
        overlayHideTimer = null;
      }
      const defer = (overlayBarEl.matches(':hover') || (scrubberEl && scrubberEl.matches(':hover')) || scrubberDragging);
      if (defer) return;
      overlayHideTimer = setTimeout(() => {
        try {
          if (overlayBarEl) overlayBarEl.classList.add('fading');
          if (scrubberEl) scrubberEl.classList.add('fading');
        } catch(_){}
      }, OVERLAY_FADE_DELAY);
    } catch (_) {}
  }

  function wireOverlayInteractions() {
    try {
      if (!videoEl) return;
      const main = videoEl.parentElement; // .player-main
      if (!main || main._overlayWired) return;
      main._overlayWired = true;
      ["mousemove", "touchstart"].forEach((ev) => {
        main.addEventListener(ev, () => showOverlayBar(), { passive: true });
      });
      ;[overlayBarEl, scrubberEl].forEach(el => {
        if (!el) return;
        el.addEventListener('mouseenter', () => {
          if (overlayHideTimer) { clearTimeout(overlayHideTimer); overlayHideTimer = null; }
          overlayBarEl && overlayBarEl.classList.remove('fading');
          scrubberEl && scrubberEl.classList.remove('fading');
        });
        el.addEventListener('mouseleave', () => {
          if (!scrubberDragging) showOverlayBar();
        });
      });
      // Initial show on first wire
      showOverlayBar();
    } catch (_) {}
  }

  // -----------------------------
  // Scrubber (progress + buffered) rendering
  // -----------------------------
  function fmtShortTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  function updateScrubber() {
    if (!videoEl || !scrubberEl) return;
    if (scrubberProgressEl) {
      const pct = videoEl.duration ? (videoEl.currentTime / videoEl.duration) * 100 : 0;
      scrubberProgressEl.style.width = pct + "%";
      if (scrubberHandleEl) scrubberHandleEl.style.left = pct + '%';
    }
    if (scrubberBufferEl) {
      try {
        const buf = videoEl.buffered;
        if (buf && buf.length) {
          const end = buf.end(buf.length - 1);
          const pctB = videoEl.duration ? (end / videoEl.duration) * 100 : 0;
          scrubberBufferEl.style.width = pctB + "%";
        }
      } catch(_){}
    }
    if (scrubberTimeEl) {
      scrubberTimeEl.textContent = `${fmtShortTime(videoEl.currentTime||0)} / ${fmtShortTime(videoEl.duration||0)}`;
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
    if (Number.isFinite(t)) { try { videoEl.currentTime = t; } catch(_){} }
  }
  function wireScrubberInteractions() {
    if (!scrubberTrackEl || scrubberTrackEl._wired) return;
    scrubberTrackEl._wired = true;
    const onDown = (e) => {
      if (!videoEl) return;
      showOverlayBar();
      scrubberDragging = true;
      scrubberWasPaused = videoEl.paused;
      if (!scrubberWasPaused) { try { videoEl.pause(); } catch(_){} }
      seekToClientX(e.touches ? e.touches[0].clientX : e.clientX);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('mouseup', onUp, { once: true });
      window.addEventListener('touchend', onUp, { once: true });
      e.preventDefault();
    };
    const onMove = (e) => { if (!scrubberDragging) return; seekToClientX(e.touches ? e.touches[0].clientX : e.clientX); };
    const onUp = async () => {
      scrubberDragging = false;
      try {
        if (videoEl && scrubberWasPaused === false) {
          // wait a short while for the browser to settle the currentTime change
          await awaitSeekEvent(videoEl, 1200);
          try { await safePlay(videoEl); } catch(_){}
        }
      } catch(_) {}
      scrubberWasPaused = null;
      showOverlayBar();
    };
    scrubberTrackEl.addEventListener('mousedown', onDown);
    scrubberTrackEl.addEventListener('touchstart', onDown, { passive: true });
    // Hover sprite previews via existing logic
    scrubberTrackEl.addEventListener('mouseenter', () => { spriteHoverEnabled = true; });
    scrubberTrackEl.addEventListener('mouseleave', () => { spriteHoverEnabled = false; hideSprite(); });
    scrubberTrackEl.addEventListener('mousemove', (e) => handleSpriteHover(e));
  }

  function renderSceneTicks() {
    if (!scrubberScenesLayer || !Array.isArray(scenes) || !videoEl || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
    scrubberScenesLayer.innerHTML = '';
    const dur = videoEl.duration;
    scenes.forEach(sc => {
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
    } catch(_) {}
  }

  function open(path) {
    initDom();
    wireOverlayInteractions();
    currentPath = path;
    // Switch to Player tab only when user explicitly opens a video via a card click (handled upstream).
    // Avoid forcing tab switch here to respect persisted tab preference.
    if (window.tabSystem && window.tabSystem.getActiveTab() !== "player") {
      // (Intentionally NOT auto-switching to prevent unexpected delayed jumps)
      // window.tabSystem.switchToTab('player');
    }
    // Load video source
    if (videoEl) {
      const src = new URL("/files/" + path, window.location.origin);
      // Cache-bust on change
      videoEl.src = src.toString() + `?t=${Date.now()}`;
      // Defer autoplay decision to loadedmetadata restore
      // Attempt to keep lastVideo reference for convenience
      saveProgress(path, { t: 0, d: 0, paused: true, rate: 1 });
      startScrubberLoop();
      videoEl.addEventListener("ended", () => stopScrubberLoop(), { once: true });
      wireScrubberInteractions();
      // When metadata arrives, we can now safely render scene ticks if scenes already loaded
      videoEl.addEventListener('loadedmetadata', () => {
        try { renderSceneTicks(); } catch(_){ }
        // Also, on initial load, if an intro-end exists, seek there so the scrubber shows the correct start position.
        try {
          (function(){
            try {
              const startAtIntro = (function(){ try { const cb = document.getElementById('settingStartAtIntro'); if(cb) return !!cb.checked; return localStorage.getItem('setting.startAtIntro') !== '0'; } catch(_) { return true; } })();
              if (!startAtIntro) return;
              // prefer localStorage per-path key first
              const key = `${LS_PREFIX}:introEnd:${path}`;
              const raw = localStorage.getItem(key);
              let t = null;
              if (raw && Number.isFinite(Number(raw))) t = Number(raw);
              else if (typeof introEnd !== 'undefined' && introEnd && Number.isFinite(Number(introEnd))) t = Number(introEnd);
              if (t !== null && Number.isFinite(t) && t > 0 && videoEl.duration && t < videoEl.duration) {
                let done = false;
                const onSeek = () => { if (done) return; done = true; try { videoEl.removeEventListener('seeked', onSeek); } catch(_){} try { updateScrubber(); } catch(_){} };
                try { videoEl.addEventListener('seeked', onSeek); videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, t)); }
                catch(_) { try { updateScrubber(); } catch(_){} }
                // ensure scrubber updates even if seeked not fired
                setTimeout(() => { try { updateScrubber(); } catch(_){} }, 250);
              }
            } catch(_){}
          })();
        } catch(_){}
      }, { once: true });
    }
    // Update floating title bar if present
    try {
      const titleTarget = document.getElementById('playerTitle');
      if (titleTarget) {
        const rawName = path.split('/').pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, '') || rawName;
        titleTarget.textContent = baseName;
        if (overlayBarEl && baseName) { delete overlayBarEl.dataset.empty; }
        if (typeof showOverlayBar === 'function') showOverlayBar();
      }
    } catch(_){}
    // Metadata and title
    (async () => {
      try {
        const url = new URL("/api/metadata/get", window.location.origin);
        url.searchParams.set("path", path);
        const r = await fetch(url);
        const j = await r.json();
        const d = j?.data || {};
        const rawName = path.split("/").pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, "") || rawName;
        if (titleEl) titleEl.textContent = baseName;
        if (overlayBarEl && baseName) { delete overlayBarEl.dataset.empty; }
        // sidebar title removed
        // Populate file info table
        try {
          if (fiDurationEl)
            fiDurationEl.textContent = fmtTime(Number(d.duration) || 0) || "—";
          if (fiResolutionEl)
            fiResolutionEl.textContent =
          d.width && d.height ? `${d.width}x${d.height}` : "—";
          if (fiVideoCodecEl) fiVideoCodecEl.textContent = d.vcodec || "—";
          if (fiAudioCodecEl) fiAudioCodecEl.textContent = d.acodec || "—";
          if (fiBitrateEl)
            fiBitrateEl.textContent = d.bitrate
          ? Number(d.bitrate) >= 1000
          ? Number(d.bitrate / 1000).toFixed(0) + " kbps"
          : d.bitrate + " bps"
          : "—";
          if (fiVBitrateEl)
            fiVBitrateEl.textContent = d.vbitrate
          ? Number(d.vbitrate) >= 1000
          ? Number(d.vbitrate / 1000).toFixed(0) + " kbps"
          : d.vbitrate + " bps"
          : "—";
          if (fiABitrateEl)
            fiABitrateEl.textContent = d.abitrate
          ? Number(d.abitrate) >= 1000
          ? Number(d.abitrate / 1000).toFixed(0) + " kbps"
          : d.abitrate + " bps"
          : "—";
          if (fiSizeEl)
            fiSizeEl.textContent = d.size ? fmtSize(Number(d.size)) : "—";
          if (fiModifiedEl) {
            if (d.modified) {
              try {
                fiModifiedEl.textContent = new Date(
                  Number(d.modified) * 1000
                ).toLocaleString();
              } catch (_) {
                fiModifiedEl.textContent = "—";
              }
            } else fiModifiedEl.textContent = "—";
          }
          if (fiPathEl) fiPathEl.textContent = path || "—";
        } catch (_) {}
      } catch (_) {
        const rawName = path.split("/").pop() || path;
        const baseName = rawName.replace(/\.[^.]+$/, "") || rawName;
        if (titleEl) titleEl.textContent = baseName;
        if (overlayBarEl && baseName) { delete overlayBarEl.dataset.empty; }
        // sidebar title removed
        try {
          if (fiDurationEl) fiDurationEl.textContent = "—";
          if (fiResolutionEl) fiResolutionEl.textContent = "—";
          if (fiVideoCodecEl) fiVideoCodecEl.textContent = "—";
          if (fiAudioCodecEl) fiAudioCodecEl.textContent = "—";
          if (fiBitrateEl) fiBitrateEl.textContent = "—";
          if (fiVBitrateEl) fiVBitrateEl.textContent = "—";
          if (fiABitrateEl) fiABitrateEl.textContent = "—";
          if (fiSizeEl) fiSizeEl.textContent = "—";
          if (fiModifiedEl) fiModifiedEl.textContent = "—";
          if (fiPathEl) fiPathEl.textContent = path || "—";
        } catch (_) {}
      }
    })();
    // Artifacts: load consolidated status first, then conditional loaders
    (async () => {
      try {
        await loadArtifactStatuses();
      } catch (_) {}
      // Now that cache is warm, only invoke loaders that might need full data
      loadHeatmap();
      loadSprites();
      loadScenes();
      loadSubtitles();
      try { loadVideoChips(); } catch(_){}
    })();
    wireBadgeActions();
  }
  // Expose globally for Random Play
  try { window.__playerOpen = open; } catch(_) {}

  // -----------------------------
  // Video performers & tags chips
  // -----------------------------
  async function loadVideoChips() {
    if (!currentPath) return;
    const perfListEl = document.getElementById('videoPerformers');
    const tagListEl = document.getElementById('videoTags');
    if (!perfListEl || !tagListEl) return;
    perfListEl.innerHTML = '';
    tagListEl.innerHTML = '';
    // Fetch metadata that might contain tags/performers (extendable). If not present, fallback to dedicated endpoints if exist.
    let performers = []; let tags = [];
    try {
      const u = new URL('/api/media/info', window.location.origin); // backend media info endpoint (prefixed)
      u.searchParams.set('path', currentPath);
      const r = await fetch(u.toString());
      if (r.ok) {
        const j = await r.json();
        const d = j?.data || j;
        if (Array.isArray(d?.performers)) performers = d.performers.filter(x=>!!x).slice(0,200);
        if (Array.isArray(d?.tags)) tags = d.tags.filter(x=>!!x).slice(0,400);
      }
    } catch(_){ /* ignore; fallback empty */ }
    renderChipSet(perfListEl, performers, 'performer');
    renderChipSet(tagListEl, tags, 'tag');
    wireChipInputs();
  }

  function renderChipSet(container, items, kind) {
    if (!container) return;
    container.innerHTML = '';
    (items||[]).forEach(item => {
      if (!item || typeof item !== 'string') return;
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
          const val = (perfInput.value||'').trim();
          if (val) { addChip('performer', val); perfInput.value=''; }
        }
      });
    }
    if (tagInput && !tagInput._wired) {
      tagInput._wired = true;
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = (tagInput.value||'').trim();
          if (val) { addChip('tag', val); tagInput.value=''; }
        }
      });
    }
  }

  async function addChip(kind, value) {
    if (!currentPath || !value) return;
    try {
      const ep = kind === 'performer' ? '/api/media/performers/add' : '/api/media/tags/add';
      const url = new URL(ep, window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set(kind, value);
      const r = await fetch(url.toString(), { method:'POST' });
      if (!r.ok) throw new Error('HTTP '+r.status);
      loadVideoChips();
    } catch(_) { notify('Failed to add '+kind, 'error'); }
  }

  async function removeChip(kind, value) {
    if (!currentPath || !value) return;
    try {
      const ep = kind === 'performer' ? '/api/media/performers/remove' : '/api/media/tags/remove';
      const url = new URL(ep, window.location.origin);
      url.searchParams.set('path', currentPath);
      url.searchParams.set(kind, value);
      const r = await fetch(url.toString(), { method:'POST' });
      if (!r.ok) throw new Error('HTTP '+r.status);
      loadVideoChips();
    } catch(_) { notify('Failed to remove '+kind, 'error'); }
  }

  // Run browser-side face detection using the FaceDetector API and upload results to server
  async function detectAndUploadFacesBrowser(opts) {
    try {
      initDom();
      if (!currentPath || !videoEl) {
        notify("Open a video in the Player first, then try again.", "error");
        // Removed auto-switch: only switch when user initiates face detection from Player context.
        // if (window.tabSystem) window.tabSystem.switchToTab('player');
        return;
      }
      // Feature check
      const Supported =
      "FaceDetector" in window && typeof window.FaceDetector === "function";
      if (!Supported) {
        notify(
          "FaceDetector API not available in this browser. Try Chrome/Edge desktop.",
          "error"
        );
        return;
      }
      // Options from UI
      const intervalSec = Math.max(
        0.2,
        parseFloat(document.getElementById("faceInterval")?.value || "1.0")
      );
      const minSizeFrac = Math.max(
        0.01,
        Math.min(
          0.9,
          parseFloat(document.getElementById("faceMinSize")?.value || "0.10")
        )
      );
      const maxSamples = 300; // safety cap
      // Ensure metadata is ready
      if (!Number.isFinite(duration) || duration <= 0) {
        await new Promise((res) => {
          const onMeta = () => {
            videoEl.removeEventListener("loadedmetadata", onMeta);
            res();
          };
          videoEl.addEventListener("loadedmetadata", onMeta);
        });
      }
      const W = Math.max(1, videoEl.videoWidth || 0);
      const H = Math.max(1, videoEl.videoHeight || 0);
      // Prepare canvas
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: false });
      if (!ctx) {
        notify("Canvas not available for capture.", "error");
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
          for (let i = 0; i < samples.length; i += Math.ceil(ratio))
            out.push(samples[i]);
          samples = out;
        }
      }
      if (samples.length === 0) samples = [0];
      // Pause and remember state
      const wasPaused = videoEl.paused;
      const prevT = videoEl.currentTime || 0;
      try {
        videoEl.pause();
      } catch (_) {}
      notify(
        `Browser face detection: sampling ${samples.length} frame(s)...`,
        "info"
      );
      const faces = [];
      // Helper: precise seek
      const seekTo = (t) =>
        new Promise((res) => {
        const onSeek = () => {
          videoEl.removeEventListener("seeked", onSeek);
          res();
        };
        videoEl.addEventListener("seeked", onSeek);
        try {
          videoEl.currentTime = Math.max(0, Math.min(total, t));
        } catch (_) {
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
        } catch (err) {
          // continue on errors
        }
      }
      // Restore playback position/state
      try {
        videoEl.currentTime = prevT;
      } catch (_) {}
      try {
        if (!wasPaused) await safePlay(videoEl);
      } catch (_) {}
      if (faces.length === 0) {
        notify("No faces detected in sampled frames.", "error");
        return;
      }
      // If an existing faces.json is present, confirm overwrite
      let overwrite = true;
      try {
        const head = await fetch(
          "/api/faces/get?path=" + encodeURIComponent(currentPath),
          { method: "HEAD" }
        );
        if (head.ok) {
          overwrite = confirm(
            "faces.json already exists for this video. Replace it with browser-detected faces?"
          );
          if (!overwrite) return;
        }
      } catch (_) {}
      // Upload
      const payload = { faces, backend: "browser-facedetector", stub: false };
      const url = new URL("/api/faces/upload", window.location.origin);
      url.searchParams.set("path", currentPath);
      url.searchParams.set("compute_embeddings", "true");
      url.searchParams.set("overwrite", overwrite ? "true" : "false");
      const r = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j?.status === "success") {
        notify(
          `Uploaded ${faces.length} face(s) from browser detection.`,
          "success"
        );
        // Refresh indicators
        try {
          if (window.tasksManager) window.tasksManager.loadCoverage();
        } catch (_) {}
        try {
          await loadArtifactStatuses();
        } catch (_) {}
      } else {
        throw new Error(j?.message || "Upload failed");
      }
    } catch (e) {
      notify(
        "Browser detection failed: " + (e && e.message ? e.message : "error"),
        "error"
      );
    }
  }

  async function loadHeatmap() {
    if (!currentPath) return;
    try {
      try {
        const st =
        window.__artifactStatus && window.__artifactStatus[currentPath];
        if (st && st.heatmap === false) {
          if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = "✗";
          if (badgeHeatmap) badgeHeatmap.dataset.present = "0";
          applyTimelineDisplayToggles();
          return;
        }
      } catch (_) {}
      // Prefer JSON + canvas rendering for higher fidelity
      let renderedViaJson = false;
      try {
        const ju = new URL("/api/heatmaps/json", window.location.origin);
        ju.searchParams.set("path", currentPath);
        const jr = await fetch(ju.toString(), {
          headers: { Accept: "application/json" },
        });
        if (jr.ok) {
          const jj = await jr.json();
          const hm = jj?.data?.heatmaps || jj?.heatmaps || jj;
          const samples = Array.isArray(hm?.samples) ? hm.samples : [];
          if (samples.length && heatmapCanvasEl) {
            drawHeatmapCanvas(samples);
            // Clear any PNG bg under it
            heatmapEl.style.backgroundImage = "";
            hasHeatmap = true;
            renderedViaJson = true;
          }
        }
      } catch (_) {
        /* ignore and fallback to PNG probe */
      }

      if (!renderedViaJson) {
        const url =
        "/api/heatmaps/png?path=" +
        encodeURIComponent(currentPath) +
        `&t=${Date.now()}`;
        // Try to load an image to detect availability
        await new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => {
            resolve(true);
          };
          probe.onerror = () => {
            resolve(false);
          };
          probe.src = url;
        }).then((ok) => {
          if (ok) {
            heatmapEl.style.backgroundImage = `url('${url}')`;
            if (heatmapCanvasEl) {
              clearHeatmapCanvas();
            }
            hasHeatmap = true;
            if (sbHeatmapImg) sbHeatmapImg.src = url;
          } else {
            heatmapEl.style.backgroundImage = "";
            if (heatmapCanvasEl) {
              clearHeatmapCanvas();
            }
            hasHeatmap = false;
          }
        });
      }

      // Badge update
      if (badgeHeatmapStatus)
        badgeHeatmapStatus.textContent = hasHeatmap ? "✓" : "✗";
      if (badgeHeatmap) badgeHeatmap.dataset.present = hasHeatmap ? "1" : "0";
      // Respect display toggle immediately
      applyTimelineDisplayToggles();
    } catch (_) {
      heatmapEl.style.backgroundImage = "";
      if (heatmapCanvasEl) {
        clearHeatmapCanvas();
      }
      hasHeatmap = false;
      if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = "✗";
      if (badgeHeatmap) badgeHeatmap.dataset.present = "0";
      applyTimelineDisplayToggles();
    }
  }

  function heatColor(v) {
    // Map 0..1 to a pleasing gradient
    // 0 -> #0b1020 transparentish, 0.5 -> #4f8cff, 1 -> #ff7a59
    const clamp = (x) => Math.max(0, Math.min(1, x));
    v = clamp(v);
    // Blend between three stops
    if (v < 0.5) {
      const t = v / 0.5; // 0..1
      return lerpColor([11, 16, 32, 0.5], [79, 140, 255, 0.85], t);
    } else {
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
      const ctx = heatmapCanvasEl.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;
      const w = heatmapCanvasEl.width = heatmapCanvasEl.clientWidth || heatmapCanvasEl.offsetWidth || 800;
      const h = heatmapCanvasEl.height = heatmapCanvasEl.clientHeight || heatmapCanvasEl.offsetHeight || 24;
      ctx.clearRect(0,0,w,h);
      if (!Array.isArray(samples) || !samples.length) return;
      // Determine bar width; ensure we cover entire width even if samples fewer than pixels.
      const n = samples.length;
      const barW = Math.max(1, Math.floor(w / n));
      for (let i=0;i<n;i++) {
        const v = Number(samples[i]);
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = heatColor(v);
        const x = Math.floor(i / (n-1) * (w - barW));
        ctx.fillRect(x, 0, barW+1, h); // +1 to avoid gaps
      }
      // Optional subtle top/bottom fade overlay for aesthetics
      const grad = ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0, 'rgba(0,0,0,0.35)');
      grad.addColorStop(0.15, 'rgba(0,0,0,0)');
      grad.addColorStop(0.85, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    } catch(_) {}
  }

  function clearHeatmapCanvas() {
    try {
      if (!heatmapCanvasEl) return;
      const ctx = heatmapCanvasEl.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0,0,heatmapCanvasEl.width, heatmapCanvasEl.height);
    } catch(_) {}
  }

  async function loadSprites() {
    // initialize
    sprites = null;
    if (!currentPath) return;
    try {
      const st =
      window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.sprites === false) {
        if (badgeSpritesStatus) badgeSpritesStatus.textContent = "✗";
        if (badgeSprites) badgeSprites.dataset.present = "0";
        return;
      }
    } catch (_) {}
    try {
      const u = new URL("/api/sprites/json", window.location.origin);
      u.searchParams.set("path", currentPath);
      const r = await fetch(u);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const index = data?.data?.index;
      const sheet = data?.data?.sheet;
      if (index && sheet) {
        sprites = { index, sheet };
        if (badgeSpritesStatus) badgeSpritesStatus.textContent = "✓";
        if (badgeSprites) badgeSprites.dataset.present = "1";
      }
    } catch (_) {
      sprites = null;
    }
    if (!sprites) {
      if (badgeSpritesStatus) badgeSpritesStatus.textContent = "✗";
      if (badgeSprites) badgeSprites.dataset.present = "0";
    }
  }

  async function loadScenes() {
    scenes = [];
    if (!currentPath) return;
    try {
      const st =
      window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.scenes === false) {
        if (badgeScenesStatus) badgeScenesStatus.textContent = "✗";
        if (badgeScenes) badgeScenes.dataset.present = "0";
        applyTimelineDisplayToggles();
        return;
      }
    } catch (_) {}
    try {
      const u = new URL("/api/scenes/get", window.location.origin);
      u.searchParams.set("path", currentPath);
      const r = await fetch(u);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const d = data?.data || {};
      const arr =
      d.scenes && Array.isArray(d.scenes) ? d.scenes : d.markers || [];
      // intro_end may be present as a top-level numeric field
      introEnd = Number.isFinite(Number(d.intro_end)) ? Number(d.intro_end) : null;
      scenes = arr
      .map((s) => ({ time: Number(s.time || s.t || s.start || 0) }))
      .filter((s) => Number.isFinite(s.time));
      renderMarkers();
      if (badgeScenesStatus)
        badgeScenesStatus.textContent = scenes.length ? "✓" : "✗";
      if (badgeScenes) badgeScenes.dataset.present = scenes.length ? "1" : "0";
      applyTimelineDisplayToggles();
      // Scene ticks may depend on duration; schedule retries until duration known
      if (scenes.length) scheduleSceneTicksRetry();
    } catch (_) {
      scenes = [];
      renderMarkers();
      if (badgeScenesStatus) badgeScenesStatus.textContent = "✗";
      if (badgeScenes) badgeScenes.dataset.present = "0";
    }
    applyTimelineDisplayToggles();
  }

  let sceneTickRetryTimer = null;
  function scheduleSceneTicksRetry(attempt=0) {
    if (sceneTickRetryTimer) { clearTimeout(sceneTickRetryTimer); sceneTickRetryTimer = null; }
    if (!videoEl || !Array.isArray(scenes) || !scenes.length) return;
    const ready = Number.isFinite(videoEl.duration) && videoEl.duration > 0;
    if (ready) { try { renderSceneTicks(); } catch(_){} return; }
    if (attempt > 12) return; // ~3s max (12 * 250ms)
    sceneTickRetryTimer = setTimeout(() => scheduleSceneTicksRetry(attempt+1), 250);
  }

  async function loadSubtitles() {
    subtitlesUrl = null;
    if (!currentPath || !videoEl) return;
    try {
      const st =
      window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.subtitles === false) {
        if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = "✗";
        if (badgeSubtitles) badgeSubtitles.dataset.present = "0";
        return;
      }
    } catch (_) {}
    // Remove existing tracks and their cue listeners
    Array.from(videoEl.querySelectorAll("track")).forEach((t) => {
      try {
        const tt = t.track || null;
        if (tt && t._cueHandler) {
          try { tt.removeEventListener && tt.removeEventListener('cuechange', t._cueHandler); } catch(_) {}
        }
      } catch(_) {}
      try { t.remove(); } catch(_) {}
    });
    try {
      const test = await fetch(
        "/api/subtitles/get?path=" + encodeURIComponent(currentPath)
      );
      if (test.ok) {
        const src =
        "/api/subtitles/get?path=" +
        encodeURIComponent(currentPath) +
        `&t=${Date.now()}`;
        subtitlesUrl = src;
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = "Subtitles";
        track.srclang = "en";
        track.default = true;
        track.src = src; // browser will parse SRT in many cases; if not, still downloadable
        videoEl.appendChild(track);
        // If browser exposes textTracks, listen for cue changes and render into overlay
        try {
          const tt = track.track || Array.from(videoEl.textTracks || []).find(t => t.kind === 'subtitles');
          if (tt) {
            // ensure track mode is showing only when toggled; start disabled to let CC button control display
            if (typeof tt.mode !== 'undefined') tt.mode = 'disabled';
            const onCueChange = () => {
              try {
                const active = Array.from(tt.activeCues || []).map(c => c.text).join('\n');
                if (subtitleOverlayEl) {
                  if (active && active.trim()) {
                    subtitleOverlayEl.textContent = active.replace(/\r?\n/g, '\n');
                    subtitleOverlayEl.hidden = false;
                  } else {
                    subtitleOverlayEl.textContent = '';
                    subtitleOverlayEl.hidden = true;
                  }
                }
              } catch(_) {}
            };
            // store reference to remove later if needed
            track._cueHandler = onCueChange;
            try { tt.addEventListener('cuechange', onCueChange); } catch(_) {}
          }
        } catch(_) {}
        if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = "✓";
        if (badgeSubtitles) badgeSubtitles.dataset.present = "1";
      }
    } catch (_) {
      /* ignore */
    }
    if (!subtitlesUrl) {
      if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = "✗";
      if (badgeSubtitles) badgeSubtitles.dataset.present = "0";
    }
  }

  function renderMarkers() {
    if (!markersEl) return;
    markersEl.innerHTML = "";
    const haveScenes = Array.isArray(scenes) && scenes.length > 0;
    // Always refresh sidebar list even before metadata duration is known
    try { renderMarkersList(); } catch(_) {}
    if (!haveScenes) return; // nothing else to draw yet
    if (!duration || !Number.isFinite(duration) || duration <= 0) return; // wait for loadedmetadata
    for (const s of scenes) {
      const t = Math.max(0, Math.min(duration, Number(s.time)));
      if (!Number.isFinite(t) || t <= 0 || t >= duration) continue;
      const pct = (t / duration) * 100;
      const mark = document.createElement("div");
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
    } catch(_) {}
  }

  // Sidebar Markers List DOM rendering
  function renderMarkersList() {
    const list = document.getElementById('markersList');
    if (!list) return;
    list.innerHTML = '';
    // Show intro-end and outro-begin markers if set for this file
    try {
      let it = null;
      if (introEnd && Number.isFinite(Number(introEnd))) {
        it = Number(introEnd);
      } else {
        const introKey = `${LS_PREFIX}:introEnd:${currentPath}`;
        const rawIntro = currentPath ? localStorage.getItem(introKey) : null;
        if (rawIntro && Number.isFinite(Number(rawIntro))) it = Number(rawIntro);
      }
      if (it !== null && Number.isFinite(it)) {
        const introRow = document.createElement('div');
        introRow.className = 'marker-row marker-row--intro';
        const label = document.createElement('div');
        label.textContent = 'Intro';
        label.style.flex = '1';
        label.style.fontWeight = '700';
        const timeLabel = document.createElement('div');
        timeLabel.textContent = fmtTime(it);
        timeLabel.className = 'marker-time-label';
        timeLabel.style.marginRight = '8px';
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'marker-jump';
        jump.textContent = 'Jump';
        jump.addEventListener('click', ()=> { if(videoEl){ videoEl.currentTime = Math.min(duration, Math.max(0, it)); }});
        const clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'marker-remove';
        clr.textContent = 'Clear';
        clr.addEventListener('click', async ()=> { try {
          try { localStorage.removeItem(`${LS_PREFIX}:introEnd:${currentPath}`); } catch(_){}
          // also remove server-side
          try { const mu = new URL('/api/scenes/intro', window.location.origin); mu.searchParams.set('path', currentPath); await fetch(mu.toString(), { method: 'DELETE' }); } catch(_){ }
          notify('Intro end cleared','success');
          await loadScenes(); renderMarkersList();
        } catch(_) { notify('Failed to clear intro end','error'); } });
        introRow.appendChild(label);
        introRow.appendChild(timeLabel);
        introRow.appendChild(jump);
        introRow.appendChild(clr);
        list.appendChild(introRow);
      }
      // Outro begin
      let ot = null;
      if (outroBegin && Number.isFinite(Number(outroBegin))) {
        ot = Number(outroBegin);
      } else {
        const outroKey = `${LS_PREFIX}:outroBegin:${currentPath}`;
        const rawOutro = currentPath ? localStorage.getItem(outroKey) : null;
        if (rawOutro && Number.isFinite(Number(rawOutro))) ot = Number(rawOutro);
      }
      if (ot !== null && Number.isFinite(ot)) {
        const outroRow = document.createElement('div');
        outroRow.className = 'marker-row marker-row--outro';
        const label = document.createElement('div');
        label.textContent = 'Outro';
        label.style.flex = '1';
        label.style.fontWeight = '700';
        const timeLabel = document.createElement('div');
        timeLabel.textContent = fmtTime(ot);
        timeLabel.className = 'marker-time-label';
        timeLabel.style.marginRight = '8px';
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'marker-jump';
        jump.textContent = 'Jump';
        jump.addEventListener('click', ()=> { 
          if(videoEl){ 
            videoEl.currentTime = Math.min(duration, Math.max(0, ot));
          }
        });
        const clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'marker-remove';
        clr.textContent = 'Clear';
        clr.addEventListener('click', async ()=> { try {
          try { localStorage.removeItem(`${LS_PREFIX}:outroBegin:${currentPath}`); } catch(_){}
          notify('Outro begin cleared','success');
          outroBegin = null;
          renderMarkers();
          renderMarkersList();
        } catch(_) { notify('Failed to clear outro begin','error'); } });
        outroRow.appendChild(label);
        outroRow.appendChild(timeLabel);
        outroRow.appendChild(jump);
        outroRow.appendChild(clr);
        list.appendChild(outroRow);
      }
    } catch(_) {}
    if (!Array.isArray(scenes) || scenes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'markers-empty';
      empty.textContent = 'No markers';
      list.appendChild(empty);
      return;
    }
    // Sort by time
    const sorted = scenes.slice().sort((a,b)=> (a.time||0)-(b.time||0));
    sorted.forEach((sc, idx) => {
      const row = document.createElement('div');
      row.className = 'marker-row';
      const t = Number(sc.time)||0;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'marker-time-input';
      input.value = fmtTime(t).padStart(5,'0');
      input.setAttribute('aria-label', 'Marker time');
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); commitTimeEdit(input, sc);} });
      input.addEventListener('blur', ()=> commitTimeEdit(input, sc));
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'marker-jump';
      jump.textContent = 'Jump';
      jump.addEventListener('click', ()=> { if(videoEl){ videoEl.currentTime = Math.min(duration, Math.max(0, sc.time||0)); }});
      const del = document.createElement('button');
      del.type='button';
      del.className='marker-remove';
      del.setAttribute('aria-label','Remove marker');
      del.textContent='×';
      del.addEventListener('click', ()=> removeMarker(sc));
      row.appendChild(input);
      row.appendChild(jump);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function parseTimeString(str){
    if(!str) return 0;
    const parts = str.trim().split(':').map(p=>p.trim()).filter(Boolean);
    if(parts.some(p=>!/^[0-9]{1,2}$/.test(p))) return NaN;
    let h=0,m=0,s=0;
    if(parts.length===3){ h=+parts[0]; m=+parts[1]; s=+parts[2]; }
    else if(parts.length===2){ m=+parts[0]; s=+parts[1]; }
    else if(parts.length===1){ s=+parts[0]; }
    return (h*3600)+(m*60)+s;
  }

  async function commitTimeEdit(input, sceneObj){
    const raw = input.value.trim();
    const seconds = parseTimeString(raw);
    if(!Number.isFinite(seconds) || seconds < 0){
      input.classList.add('is-error');
      setTimeout(()=>input.classList.remove('is-error'), 1200);
      input.value = fmtTime(Number(sceneObj.time||0));
      return;
    }
    const clamped = Math.min(Math.max(0, seconds), Math.max(0, duration || 0));
    if(Math.abs(clamped - (sceneObj.time||0)) < 0.01){
      input.value = fmtTime(clamped);
      return;
    }
    try {
      const url = new URL('/api/marker/update', window.location.origin);
      url.searchParams.set('path', currentPath||'');
      url.searchParams.set('old_time', String(sceneObj.time||0));
      url.searchParams.set('new_time', String(clamped));
      const r = await fetch(url.toString(), { method:'POST' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      sceneObj.time = clamped;
      // Refresh scenes from server for authoritative order
      await loadScenes();
      renderMarkersList();
    } catch(e){
      notify('Failed to update marker', 'error');
      input.value = fmtTime(Number(sceneObj.time||0));
    }
  }

  async function removeMarker(sceneObj){
    try {
      const url = new URL('/api/marker/delete', window.location.origin);
      url.searchParams.set('path', currentPath||'');
      url.searchParams.set('time', String(sceneObj.time||0));
      const r = await fetch(url.toString(), { method:'POST' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      // Reload scenes
      await loadScenes();
      renderMarkersList();
      notify('Marker removed','success');
    } catch(e){
      notify('Failed to remove marker','error');
    }
  }

  // Add marker button (sidebar)
  (function wireAddMarkerButton(){
    const btn = document.getElementById('btnAddMarker');
    if(!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', async () => {
      if(!currentPath || !videoEl) return;
      const t = Math.max(0, Math.min(duration||0, videoEl.currentTime||0));
      try {
        const url = new URL('/api/marker', window.location.origin);
        url.searchParams.set('path', currentPath);
        url.searchParams.set('time', String(t.toFixed(3)));
        const r = await fetch(url.toString(), { method:'POST' });
        if(!r.ok) throw new Error('HTTP '+r.status);
        await loadScenes();
        renderMarkersList();
        notify('Marker added','success');
      } catch(e){
        notify('Failed to add marker','error');
      }
    });
  })();

  function renderSidebarScenes() {
    /* list removed in compact sidebar */
  }

  let spriteHoverEnabled = false;

  async function loadArtifactStatuses() {
    if (!currentPath) return;
    // Lazy acquire (in case of markup changes) without assuming globals exist
    const badgeCover =
    window.badgeCover || document.getElementById("badge-cover");
    const badgeCoverStatus =
    window.badgeCoverStatus || document.getElementById("badge-cover-status");
    const badgeHover =
    window.badgeHover || document.getElementById("badge-hover");
    const badgeHoverStatus =
    window.badgeHoverStatus || document.getElementById("badge-hover-status");
    const badgeSprites =
    window.badgeSprites || document.getElementById("badge-sprites");
    const badgeSpritesStatus =
    window.badgeSpritesStatus ||
    document.getElementById("badge-sprites-status");
    const badgeScenes =
    window.badgeScenes || document.getElementById("badge-scenes");
    const badgeScenesStatus =
    window.badgeScenesStatus ||
    document.getElementById("badge-scenes-status");
    const badgeSubtitles =
    window.badgeSubtitles || document.getElementById("badge-subtitles");
    const badgeSubtitlesStatus =
    window.badgeSubtitlesStatus ||
    document.getElementById("badge-subtitles-status");
    const badgeFaces =
    window.badgeFaces || document.getElementById("badge-faces");
    const badgeFacesStatus =
    window.badgeFacesStatus || document.getElementById("badge-faces-status");
    const badgePhash =
    window.badgePhash || document.getElementById("badge-phash");
    const badgePhashStatus =
    window.badgePhashStatus || document.getElementById("badge-phash-status");
    const badgeHeatmap =
    window.badgeHeatmap || document.getElementById("badge-heatmap");
    const badgeHeatmapStatus =
    window.badgeHeatmapStatus ||
    document.getElementById("badge-heatmap-status");
    const badgeMeta =
    window.badgeMeta || document.getElementById("badge-metadata");
    const badgeMetaStatus =
    window.badgeMetaStatus ||
    document.getElementById("badge-metadata-status");
    try {
      const u = new URL("/api/artifacts/status", window.location.origin);
      u.searchParams.set("path", currentPath);
      const r = await fetch(u.toString());
      if (!r.ok) {
        throw new Error("artifact status " + r.status);
      }
      const j = await r.json();
      const d = j && (j.data || j);
      // cache
      window.__artifactStatus = window.__artifactStatus || {};
      window.__artifactStatus[currentPath] = d;
      const set = (present, badgeEl, statusEl) => {
        if (statusEl) statusEl.textContent = present ? "✓" : "✗";
        if (badgeEl) badgeEl.dataset.present = present ? "1" : "0";
      };
      set(!!d.cover, badgeCover, badgeCoverStatus);
      set(!!d.hover, badgeHover, badgeHoverStatus);
      set(!!d.sprites, badgeSprites, badgeSpritesStatus);
      set(!!d.scenes, badgeScenes, badgeScenesStatus);
      set(!!d.subtitles, badgeSubtitles, badgeSubtitlesStatus);
      set(!!d.faces, badgeFaces, badgeFacesStatus);
      set(!!d.phash, badgePhash, badgePhashStatus);
      set(!!d.heatmap, badgeHeatmap, badgeHeatmapStatus);
      set(!!d.metadata, badgeMeta, badgeMetaStatus);
    } catch (_) {
      // On failure, mark unknowns as missing (do not spam console)
      const badges = [
        [badgeCover, badgeCoverStatus],
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
        if (s) s.textContent = "✗";
        if (b) b.dataset.present = "0";
      }
    }
  }

  function wireBadgeActions() {
    const gen = async (kind) => {
      if (!currentPath) return;
      // Capability gating: map kind -> operation type
      try {
        const caps =
        (window.tasksManager && window.tasksManager.capabilities) ||
        window.__capabilities ||
        {};
        const needsFfmpeg = new Set([
          "heatmap",
          "scenes",
          "sprites",
          "hover",
          "phash",
        ]);
        if (needsFfmpeg.has(kind) && caps.ffmpeg === false) {
          notify("Cannot start: FFmpeg not detected", "error");
          return;
        }
        if (kind === "subtitles" && caps.subtitles_enabled === false) {
          notify("Cannot start subtitles: no backend available", "error");
          return;
        }
        if (kind === "faces" && caps.faces_enabled === false) {
          notify("Cannot start faces: face backends unavailable", "error");
          return;
        }
      } catch (_) {}
      try {
        let url;
        if (kind === "heatmap")
          url = new URL("/api/heatmaps/create", window.location.origin);
        else if (kind === "scenes")
          url = new URL("/api/scenes/create", window.location.origin);
        else if (kind === "subtitles")
          url = new URL("/api/subtitles/create", window.location.origin);
        else if (kind === "sprites")
          url = new URL("/api/sprites/create", window.location.origin);
        else if (kind === "faces")
          url = new URL("/api/faces/create", window.location.origin);
        else if (kind === "hover")
          url = new URL("/api/hover/create", window.location.origin);
        else if (kind === "phash")
          url = new URL("/api/phash/create", window.location.origin);
        else return;
        url.searchParams.set("path", currentPath);
        // Mark badge loading before request to give immediate feedback
        const badgeEl = document.getElementById(`badge-${kind}`) || document.getElementById(`badge-${kind.toLowerCase()}`);
        if (badgeEl) {
          badgeEl.dataset.loading = '1';
        }
        const r = await fetch(url.toString(), { method: "POST" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        notify(kind + " generation started", "success");
        // Poll artifact status until present or timeout
        const startedAt = Date.now();
        const TIMEOUT_MS = 60_000; // 1 min fallback
        const POLL_INTERVAL = 1200;
        const poll = async () => {
          if (!currentPath) return finish();
          try {
            await loadArtifactStatuses();
            // Determine presence based on kind
            const st = window.__artifactStatus && window.__artifactStatus[currentPath];
            let present = false;
            if (st) {
              if (kind === 'heatmap') present = !!st.heatmap;
              else if (kind === 'scenes') present = !!st.scenes;
              else if (kind === 'subtitles') present = !!st.subtitles;
              else if (kind === 'sprites') present = !!st.sprites;
              else if (kind === 'faces') present = !!st.faces;
              else if (kind === 'hover') present = !!st.hover;
              else if (kind === 'phash') present = !!st.phash;
            }
            if (present) {
              // Load any richer data renderers once present
              if (kind === 'heatmap') await loadHeatmap();
              else if (kind === 'scenes') await loadScenes();
              else if (kind === 'sprites') await loadSprites();
              else if (kind === 'subtitles') await loadSubtitles();
              return finish();
            }
          } catch(_) {}
          if (Date.now() - startedAt < TIMEOUT_MS) {
            setTimeout(poll, POLL_INTERVAL);
          } else finish();
        };
        const finish = () => {
          if (badgeEl) delete badgeEl.dataset.loading;
        };
        setTimeout(poll, 500);
      } catch (e) {
        notify("Failed to start " + kind + " job", "error");
        const badgeEl = document.getElementById(`badge-${kind}`) || document.getElementById(`badge-${kind.toLowerCase()}`);
        if (badgeEl) delete badgeEl.dataset.loading;
      }
    };
    const attach = (btn, kind) => {
      if (!btn || btn._wired) return;
      btn._wired = true;
      btn.addEventListener("click", () => {
        const present = btn.dataset.present === "1";
        if (!present) gen(kind);
      });
    };
    // Resolve current badge elements (hyphenated IDs preferred)
    const bHeat = document.getElementById('badge-heatmap') || badgeHeatmap;
    const bScenes = document.getElementById('badge-scenes') || badgeScenes;
    const bSubs = document.getElementById('badge-subtitles') || badgeSubtitles;
    const bSprites = document.getElementById('badge-sprites') || badgeSprites;
    const bFaces = document.getElementById('badge-faces') || badgeFaces;
    const bHover = document.getElementById('badge-hover') || badgeHover;
    const bPhash = document.getElementById('badge-phash') || badgePhash;
    attach(bHeat, "heatmap");
    attach(bScenes, "scenes");
    attach(bSubs, "subtitles");
    attach(bSprites, "sprites");
    attach(bFaces, "faces");
    attach(bHover, "hover");
    attach(bPhash, "phash");
  }

  function handleSpriteHover(evt) {
    if (!sprites || !sprites.index || !sprites.sheet) { hideSprite(); return; }
    if (!spriteHoverEnabled) { hideSprite(); return; }
    const targetTrack = scrubberTrackEl || timelineEl;
    if (!targetTrack) { hideSprite(); return; }
    const rect = targetTrack.getBoundingClientRect();
    // Tooltip now lives under the controls container below the video
    const container =
    spriteTooltipEl && spriteTooltipEl.parentElement
    ? spriteTooltipEl.parentElement
    : videoEl && videoEl.parentElement
    ? videoEl.parentElement
    : document.body;
    const containerRect = container.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    if (x < 0 || x > rect.width) {
      hideSprite();
      return;
    }
    const pct = x / rect.width;
    const vidDur = (Number.isFinite(duration) && duration > 0) ? duration : (videoEl && Number.isFinite(videoEl.duration) ? videoEl.duration : 0);
    if (!vidDur) { hideSprite(); return; }
    const t = pct * vidDur;
    // Position tooltip
    // Determine tile width/height for placement
    let tw = 240,
    th = 135;
    try {
      const idx = sprites.index;
      tw = Number(idx.tile_width || (idx.tile && idx.tile[0]) || tw);
      th = Number(idx.tile_height || (idx.tile && idx.tile[1]) || th);
    } catch (_) {}
    // Scale preview to avoid being too large; cap width to 180px
    const scale = Math.min(1, 180 / Math.max(1, tw));
    const twS = Math.max(1, Math.round(tw * scale));
    const thS = Math.max(1, Math.round(th * scale));
    const halfW = Math.max(1, Math.floor(twS / 2));
    const baseLeft = rect.left - containerRect.left + x - halfW; // center on cursor
    const clampedLeft = Math.max(8, Math.min(containerRect.width - (twS + 8), baseLeft));
    // Compute vertical placement so the preview sits just above the scrubber track
    const gap = 8; // px gap between preview bottom and scrubber top
    const previewTop = (rect.top - containerRect.top) - gap - thS; // rect.top relative to container
    spriteTooltipEl.style.left = clampedLeft + 'px';
    spriteTooltipEl.style.top = Math.max(0, previewTop) + 'px';
    spriteTooltipEl.style.bottom = 'auto';
    spriteTooltipEl.style.transform = 'none';
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
      // Choose the nearest frame rather than always floor for a tighter temporal match
      const frame = Math.min(totalFrames - 1, Math.round(t / Math.max(0.1, interval)));
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      const xOff = -(col * tw) * scale;
      const yOff = -(row * th) * scale;
      spriteTooltipEl.style.width = twS + "px";
      spriteTooltipEl.style.height = thS + "px";
      spriteTooltipEl.style.backgroundImage = `url('${sprites.sheet}')`;
      spriteTooltipEl.style.backgroundPosition = `${xOff}px ${yOff}px`;
      spriteTooltipEl.style.backgroundSize = `${tw * cols * scale}px ${
        th * rows * scale
      }px`;
      spriteTooltipEl.style.opacity = "0.8";
    } catch (_) {
      // If anything goes wrong, hide the preview gracefully
      hideSprite();
    }
  }

  // Spacebar toggles play/pause when player tab is active
  document.addEventListener("keydown", (e) => {
    try {
      if (window.tabSystem?.getActiveTab() !== "player") return;
      // Ignore if typing into inputs/selects
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!videoEl) return;
        if (videoEl.paused) safePlay(videoEl);
        else videoEl.pause();
      }
    } catch (_) {}
  });

  // Persist on unload as a final safeguard
  window.addEventListener("beforeunload", () => {
    try {
      if (videoEl && currentPath) {
        saveProgress(currentPath, {
          t: videoEl.currentTime || 0,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      }
    } catch (_) {}
  });

  function hideSprite() {
    if (spriteTooltipEl) spriteTooltipEl.style.display = "none";
  }

  // Apply show/hide for heatmap and markers based on settings
  function applyTimelineDisplayToggles() {
    try {
      const band = document.getElementById('scrubberHeatmapBand');
      if (band) {
        if (showHeatmap && hasHeatmap) band.classList.remove('hidden');
        else band.classList.add('hidden');
      }
      if (markersEl)
        markersEl.style.display =
      showScenes && scenes && scenes.length > 0 ? "" : "none";
      renderSceneTicks();
    } catch (_) {}
  }

  // Public API
  return { open, showOverlayBar, detectAndUploadFacesBrowser };
})();

window.Player = Player;
// Player module assigned to window

// -----------------------------
// Global: Pause video when leaving Player tab
// -----------------------------
(function setupTabPause(){
  function pauseIfNotActive(activeId){
    try {
      if (!window.Player) return;
      const v = document.getElementById('playerVideo');
      if (!v) return;
      const active = activeId || (window.tabSystem && window.tabSystem.getActiveTab && window.tabSystem.getActiveTab());
      if (active !== 'player' && !v.paused && !v.ended) { try { v.pause(); } catch(_){} }
    } catch(_){}
  }
  // Hook custom tabSystem event style if it exposes on/subscribe
  try {
    const ts = window.tabSystem;
    if (ts && typeof ts.on === 'function') {
      ts.on('switch', (id) => pauseIfNotActive(id));
    } else if (ts && typeof ts.addEventListener === 'function') {
      ts.addEventListener('switch', (e) => pauseIfNotActive(e.detail));
    }
  } catch(_){}
  // MutationObserver fallback watching player panel visibility/class changes
  try {
    const panel = document.getElementById('player-panel');
    if (panel && !panel._pauseObserver) {
      const obs = new MutationObserver(() => pauseIfNotActive());
      obs.observe(panel, { attributes:true, attributeFilter:['hidden','class'] });
      panel._pauseObserver = obs;
    }
  } catch(_){}
  // Also pause on document hidden (tab/background)
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIfNotActive('not-player'); });
})();

// -----------------------------
// Player Enhancements: Sidebar collapse + Effects (filters/transforms)
// -----------------------------
// Sidebar + Effects Enhancements
function initPlayerEnhancements() {
  const sidebar = document.getElementById("playerSidebar");
  const toggleBtn = document.getElementById("sidebarToggle");
  const accordionRoot = document.getElementById("sidebarAccordion");

  const stage =
  document.getElementById("videoStage") ||
  document.querySelector(".player-stage-simple");
  const playerLayout = document.getElementById("playerLayout");
  const filterRanges = document.querySelectorAll(
    "#effectsPanel input[type=range][data-fx]"
  );
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  // Removed transform controls
  const presetButtons = document.querySelectorAll("#effectsPanel .fx-preset");
  const valueSpans = document.querySelectorAll("#effectsPanel [data-fx-val]");
  const COLOR_MATRIX_NODE = document.getElementById("playerColorMatrixValues");
  // Sidebar collapse persistence
  const LS_KEY_SIDEBAR = "mediaPlayer:sidebarCollapsed";
  function applySidebarCollapsed(fromLoad = false) {
    if (!sidebar || !toggleBtn) return;
    const collapsed = localStorage.getItem(LS_KEY_SIDEBAR) === "1";
    sidebar.setAttribute("data-collapsed", collapsed ? "true" : "false");
    if (playerLayout)
      playerLayout.setAttribute(
      "data-sidebar-collapsed",
      collapsed ? "true" : "false"
    );
    toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    // Arrow glyph semantics: show chevron pointing toward where the sidebar will appear when expanded.
    // Using single angle characters for compactness.
    toggleBtn.textContent = collapsed ? "»" : "«";
    if (accordionRoot) accordionRoot.style.removeProperty("display");
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
    } catch (_) {}
    const infoToggle = document.getElementById("infoToggle");
    const infoDrawer = document.getElementById("infoDrawer");
    if (infoToggle && infoDrawer && !infoToggle._wired) {
      infoToggle._wired = true;
      infoToggle.addEventListener("click", () => {
        const open = infoDrawer.hasAttribute("hidden");
        if (open) {
          infoDrawer.removeAttribute("hidden");
          infoToggle.setAttribute("aria-expanded", "true");
        } else {
          infoDrawer.setAttribute("hidden", "");
          infoToggle.setAttribute("aria-expanded", "false");
        }
      });
    }
    return;
  }
  // Auto-collapse on first load for narrower viewports (no stored preference)
  try {
    if (!localStorage.getItem(LS_KEY_SIDEBAR) && window.innerWidth < 1500) {
      localStorage.setItem(LS_KEY_SIDEBAR, "1");
    }
  } catch (_) {}
  applySidebarCollapsed(true);
  if (toggleBtn && !toggleBtn._wired) {
    toggleBtn._wired = true;
    toggleBtn.addEventListener("click", () => toggleSidebar());
  }

  const LS_KEY_EFFECTS = "mediaPlayer:effects";

  const state = { r: 1, g: 1, b: 1, blur: 0 };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY_EFFECTS) || "{}");
      if (saved && typeof saved === "object") {
        // Only apply known keys; ignore corruption
        ["r", "g", "b", "blur"].forEach((k) => {
          if (k in saved && typeof saved[k] === "number") state[k] = saved[k];
        });
      }
    } catch (_) {}
    // apply to inputs
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) r.value = state[k];
    });
    applyEffects();
  }
  function saveState() {
    try {
      localStorage.setItem(LS_KEY_EFFECTS, JSON.stringify(state));
    } catch (_) {}
  }
  function applyEffects() {
    if (!stage) return;
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
      ].join(" ");
      COLOR_MATRIX_NODE.setAttribute("values", matrix);
    }
    const blurStr = state.blur > 0 ? ` blur(${state.blur}px)` : "";
    stage.style.filter = `url(#playerColorMatrix)${blurStr}`.trim();
    stage.style.transform = "";
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
    const rect = (timelineEl || scrubberTrackEl).getBoundingClientRect();
    syncInputs();
    applyEffects();
    saveState();
    const mark = document.createElement("div");
    mark.className = 'marker-tick';
    mark.style.left = `calc(${pct}% - 2px)`;
  }
  // On each save, if values are default set remove from storage to avoid stale persistence overriding reset on reload
  function saveState() {
    const defaults = { r: 1, g: 1, b: 1, blur: 0 };
    const isDefault = Object.keys(defaults).every(
      (k) => state[k] === defaults[k]
    );
    try {
      if (isDefault) localStorage.removeItem(LS_KEY_EFFECTS);
      else localStorage.setItem(LS_KEY_EFFECTS, JSON.stringify(state));
    } catch (_) {}
  }
  function renderValues() {
    valueSpans.forEach((sp) => {
      const k = sp.getAttribute("data-fx-val");
      if (!(k in state)) return;
      let val = state[k];
      let txt;
      if (["r", "g", "b"].includes(k)) txt = val.toFixed(2);
      else txt = String(val);
      sp.textContent = txt;
    });
  }
  function applyPreset(name) {
    switch (name) {
      case "cinematic":
      state.r = 1.05;
      state.g = 1.02;
      state.b = 0.96;
      state.blur = 0;
      break;
      case "warm":
      state.r = 1.15;
      state.g = 1.05;
      state.b = 0.9;
      state.blur = 0;
      break;
      case "cool":
      state.r = 0.92;
      state.g = 1.02;
      state.b = 1.12;
      state.blur = 0;
      break;
      case "dreamy":
      state.r = 1.05;
      state.g = 1.05;
      state.b = 1.05;
      state.blur = 4;
      break;
      case "flat":
      default:
      state.r = 1;
      state.g = 1;
      state.b = 1;
      state.blur = 0;
      break;
    }
    applyEffects();
    syncInputs();
    renderValues();
    saveState();
  }
  function toggleSidebar() {
    if (!sidebar || !toggleBtn) return;
    const collapsed = sidebar.getAttribute("data-collapsed") === "true";
    const next = !collapsed;
    try {
      localStorage.setItem(LS_KEY_SIDEBAR, next ? "1" : "0");
    } catch (_) {}
    applySidebarCollapsed();
  }

  // Wire events
  // Key shortcut: Shift+S toggles sidebar
  document.addEventListener("keydown", (e) => {
    if (e.shiftKey && (e.key === "S" || e.key === "s")) toggleSidebar();
  });
  filterRanges.forEach((r) => r.addEventListener("input", onSlider));
  if (resetFiltersBtn) resetFiltersBtn.addEventListener("click", resetFilters);
  // removed transform reset binding
  presetButtons.forEach((pb) =>
    pb.addEventListener("click", () => applyPreset(pb.dataset.preset))
);
// (Removed duplicate Shift+S listener)
loadState();
renderValues();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayerEnhancements, {
    once: true,
  });
} else {
  initPlayerEnhancements();
}

// Simplified player drawer wiring (independent of legacy sidebar)
function wireSimplePlayerDrawer() {
  const infoToggle = document.getElementById("infoToggle");
  const infoDrawer = document.getElementById("infoDrawer");
  if (!infoToggle || !infoDrawer || infoToggle._wired) return;
  infoToggle._wired = true;
  function toggle() {
    const isHidden = infoDrawer.hasAttribute("hidden");
    if (isHidden) {
      infoDrawer.removeAttribute("hidden");
      infoToggle.setAttribute("aria-expanded", "true");
      infoToggle.classList.add("active");
    } else {
      infoDrawer.setAttribute("hidden", "");
      infoToggle.setAttribute("aria-expanded", "false");
      infoToggle.classList.remove("active");
    }
  }
  infoToggle.addEventListener("click", toggle);
  document.addEventListener("keydown", (e) => {
    if (e.key === "i" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Avoid interfering with inputs
      const a = document.activeElement;
      if (
        a &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          a.isContentEditable)
        )
        return;
        toggle();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireSimplePlayerDrawer, {
      once: true,
    });
  } else {
    wireSimplePlayerDrawer();
  }

  // Sidepanel collapse (new simplified sidebar replacement)
  function wireSidepanel() {
    // Sidebar removed; function retained as a no-op for backward compatibility.
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireSidepanel, { once: true });
  } else {
    wireSidepanel();
  }

  // -----------------------------
  // Performers Module
  // -----------------------------
  const Performers = (() => {
    let gridEl,
    searchEl,
    addBtn,
    importBtn,
    mergeBtn,
    deleteBtn,
    dropZone,
    statusEl;
    let performers = [];
    let selected = new Set();
    let searchTerm = "";
    let searchTimer = null;
    let lastFocusedIndex = -1; // for keyboard navigation
    let shiftAnchor = null; // for shift range selection

    function initDom() {
      if (gridEl) return;
      gridEl = document.getElementById("performersGrid");
      searchEl = document.getElementById("performerSearch");
      addBtn = document.getElementById("performerAddBtn");
      importBtn = document.getElementById("performerImportBtn");
      mergeBtn = document.getElementById("performerMergeBtn");
      deleteBtn = document.getElementById("performerDeleteBtn");
      dropZone = document.getElementById("performerDropZone");
      statusEl = document.getElementById("performersStatus");
      wireEvents();
    }
    function setStatus(msg, show = true) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.style.display = show ? "block" : "none";
    }
    function render() {
      if (!gridEl) { return; }
      gridEl.innerHTML = "";
      const frag = document.createDocumentFragment();
      const termLower = searchTerm.toLowerCase();
      const filtered = performers.filter(
        (p) => !termLower || p.name.toLowerCase().includes(termLower)
      );
      if (addBtn) {
        const exact = filtered.some((p) => p.name.toLowerCase() === termLower);
        addBtn.style.display = searchTerm && !exact ? "inline-block" : "none";
        addBtn.textContent = `Add '${searchTerm}'`;
        addBtn.disabled = !searchTerm;
      }
      if (filtered.length === 0) {
        const msg = document.createElement("div");
        msg.className = "hint-sm";
        msg.style.opacity = ".7";
        msg.style.padding = "24px 0";
        msg.textContent = "No performers found.";
        gridEl.appendChild(msg);
      } else {
        filtered.forEach((p) => {
          const card = document.createElement("div");
          card.className = "perf-card";
          card.dataset.norm = p.norm;
          if (selected.has(p.norm)) card.dataset.selected = "1";
          const h = document.createElement("h3");
          h.textContent = p.name;
          const count = document.createElement("div");
          count.className = "count";
          count.textContent = `${p.count} file${p.count === 1 ? "" : "s"}`;
          const actions = document.createElement("div");
          actions.className = "actions";
          const btnRename = document.createElement("button");
          btnRename.className = "btn-xs";
          btnRename.textContent = "Rename";
          btnRename.onclick = () => renamePrompt(p);
          const tagsWrap = document.createElement("div");
          tagsWrap.className = "tags";
          (p.tags || []).forEach((tag) => {
            const tEl = document.createElement("span");
            tEl.className = "tag";
            tEl.textContent = tag;
            tEl.title = "Click to remove";
            tEl.onclick = (ev) => {
              ev.stopPropagation();
              removeTag(p, tag);
            };
            tagsWrap.appendChild(tEl);
          });
          const addTagBtn = document.createElement("button");
          addTagBtn.className = "btn-xs";
          addTagBtn.textContent = "+";
          addTagBtn.title = "Add tag";
          addTagBtn.onclick = (ev) => {
            ev.stopPropagation();
            addTagPrompt(p);
          };
          actions.appendChild(btnRename);
          actions.appendChild(addTagBtn);
          card.appendChild(h);
          card.appendChild(count);
          card.appendChild(tagsWrap);
          card.appendChild(actions);
          card.tabIndex = 0; // focusable
          card.onclick = (e) => handleCardClick(e, p, filtered);
          card.onkeydown = (e) => handleCardKey(e, p, filtered);
          frag.appendChild(card);
        });
        gridEl.appendChild(frag);
      }
      updateSelectionUI();
      // Ensure performers grid loads on page load
      window.addEventListener('DOMContentLoaded', () => {
        if (window.fetchPerformers) window.fetchPerformers();
      });
    }
    function updateSelectionUI() {
      document.querySelectorAll(".perf-card").forEach((c) => {
        if (selected.has(c.dataset.norm)) c.dataset.selected = "1";
        else c.removeAttribute("data-selected");
      });
      const multi = selected.size >= 2;
      if (mergeBtn) mergeBtn.disabled = !multi;
      if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    }
    async function fetchPerformers() {
      initDom();
      try {
        // fetchPerformers called
        setStatus("Loading…", true);
        const url = new URL("/api/performers", window.location.origin);
        if (searchTerm) url.searchParams.set("search", searchTerm);
        const r = await fetch(url);
        const j = await r.json();
        // performers response loaded
        performers = j?.data?.performers || [];
        setStatus("", false);
        render();
      } catch (e) {
        setStatus("Failed to load performers", true);
        if (gridEl) {
          gridEl.innerHTML = "";
          const msg = document.createElement("div");
          msg.className = "hint-sm";
          msg.style.opacity = ".7";
          msg.style.padding = "24px 0";
          msg.style.color = "#e44";
          msg.textContent = "Error loading performers.";
          gridEl.appendChild(msg);
        }
        console.error(e);
      }
    }
    function debounceSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(fetchPerformers, 400);
    }
    function toggleSelect(norm, opts = { range: false, anchor: false }) {
      if (opts.range && shiftAnchor) {
        // range selection
        const filtered = currentFiltered();
        const aIndex = filtered.findIndex((p) => p.norm === shiftAnchor);
        const bIndex = filtered.findIndex((p) => p.norm === norm);
        if (aIndex > -1 && bIndex > -1) {
          const [start, end] =
          aIndex < bIndex ? [aIndex, bIndex] : [bIndex, aIndex];
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
      return performers.filter(
        (p) => !termLower || p.name.toLowerCase().includes(termLower)
      );
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
      } else {
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
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          " ",
        ].includes(e.key) ||
        (e.key === "a" && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault();
      }
      const cols = calcColumns();
      function focusAt(i) {
        if (i < 0 || i >= filtered.length) return;
        const card = gridEl.querySelector(
          `.perf-card[data-norm="${filtered[i].norm}"]`
        );
        if (card) {
          card.focus();
          lastFocusedIndex = i;
        }
      }
      switch (e.key) {
        case " ":
        toggleSelect(norm, { anchor: true });
        break;
        case "Enter":
        renamePrompt(p);
        break;
        case "Delete":
        case "Backspace":
        deleteSelected();
        break;
        case "a":
        if (e.metaKey || e.ctrlKey) {
          selected = new Set(filtered.map((x) => x.norm));
          updateSelectionUI();
        }
        break;
        case "ArrowRight":
        focusAt(index + 1);
        break;
        case "ArrowLeft":
        focusAt(index - 1);
        break;
        case "ArrowDown":
        focusAt(index + cols);
        break;
        case "ArrowUp":
        focusAt(index - cols);
        break;
        case "Home":
        focusAt(0);
        break;
        case "End":
        focusAt(filtered.length - 1);
        break;
        case "Shift":
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
      return template.split(" ").length;
    }
    async function addCurrent() {
      if (!searchTerm) return;
      try {
        await fetch("/api/performers/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: searchTerm }),
        });
        await fetchPerformers();
      } catch (_) {}
    }
    async function importPrompt(e) {
      // Default behavior: open file chooser. Hold Alt/Option to fall back to manual paste prompt.
      if (e && e.altKey) {
        const txt = prompt("Paste newline-separated names or JSON array:");
        if (!txt) return;
        try {
          const r = await fetch("/api/performers/import", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: txt,
          });
          if (!r.ok) throw new Error("Import failed");
          if (window.showToast) window.showToast("Performers imported", "is-success");
          await fetchPerformers();
        } catch (err) {
          if (window.showToast) window.showToast(err.message || "Import failed", "is-error");
        }
        return;
      }
      if (fileInput) {
        try {
          fileInput.click();
          return;
        } catch (_) {
          /* fallback to prompt below */
        }
      }
      const txt = prompt("Paste newline-separated names or JSON array:");
      if (!txt) return;
      try {
        const r = await fetch("/api/performers/import", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: txt,
        });
        if (!r.ok) throw new Error("Import failed");
        if (window.showToast) window.showToast("Performers imported", "is-success");
        await fetchPerformers();
      } catch (err) {
        if (window.showToast) window.showToast(err.message || "Import failed", "is-error");
      }
    }
    async function renamePrompt(p) {
      const val = prompt("Rename performer:", p.name);
      if (!val || val === p.name) return;
      try {
        await fetch("/api/performers/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ old: p.name, new: val }),
        });
        await fetchPerformers();
      } catch (_) {}
    }
    async function addTagPrompt(p) {
      const tag = prompt("Add tag for " + p.name + ":");
      if (!tag) return;
      try {
        await fetch("/api/performers/tags/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, tag }),
        });
        await fetchPerformers();
      } catch (_) {}
    }
    async function removeTag(p, tag) {
      if (!confirm(`Remove tag '${tag}' from ${p.name}?`)) return;
      try {
        await fetch("/api/performers/tags/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, tag }),
        });
        await fetchPerformers();
      } catch (_) {}
    }
    async function mergeSelected() {
      if (selected.size < 2) return;
      const list = [...selected];
      const target = prompt("Merge into (target name):", "");
      if (!target) return;
      try {
        await fetch("/api/performers/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: list.map(
              (n) => performers.find((p) => p.norm === n)?.name || n
            ),
            to: target,
          }),
        });
        selected.clear();
        await fetchPerformers();
      } catch (_) {}
    }
    async function deleteSelected() {
      if (!selected.size) return;
      if (!confirm(`Delete ${selected.size} performer(s)?`)) return;
      for (const norm of [...selected]) {
        const rec = performers.find((p) => p.norm === norm);
        if (!rec) continue;
        try {
          await fetch("/api/performers?name=" + encodeURIComponent(rec.name), {
            method: "DELETE",
          });
        } catch (_) {}
      }
      selected.clear();
      await fetchPerformers();
    }
    function wireEvents() {
      if (searchEl && !searchEl._wired) {
        searchEl._wired = true;
        searchEl.addEventListener("input", () => {
          searchTerm = searchEl.value.trim();
          debounceSearch();
        });
        searchEl.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            searchEl.value = "";
            searchTerm = "";
            fetchPerformers();
          }
        });
      }
      if (addBtn && !addBtn._wired) {
        addBtn._wired = true;
        addBtn.addEventListener("click", addCurrent);
      }
      if (importBtn && !importBtn._wired) {
        importBtn._wired = true;
        importBtn.addEventListener("click", importPrompt);
      }
      if (mergeBtn && !mergeBtn._wired) {
        mergeBtn._wired = true;
        mergeBtn.addEventListener("click", mergeSelected);
      }
      if (deleteBtn && !deleteBtn._wired) {
        deleteBtn._wired = true;
        deleteBtn.addEventListener("click", deleteSelected);
      }
      if (dropZone && !dropZone._wired) {
        dropZone._wired = true;
        wireDropZone();
      }
      document.addEventListener("keydown", globalKeyHandler);
    }
    // Wire hidden file input fallback
    const fileInput = document.getElementById("performerFileInput");
    if (fileInput && !fileInput._wired) {
      fileInput._wired = true;
      fileInput.addEventListener("change", async (e) => {
        const files = [...(fileInput.files || [])];
        if (!files.length) return;
        let combined = "";
        for (const f of files) {
          try {
            combined += (await f.text()) + "\n";
          } catch (_) {}
        }
        if (!combined.trim()) return;
        // Parse performer names
        let rawNames = [];
        try {
          const trimmed = combined.trim();
          if (/^\s*\[/.test(trimmed)) {
            try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) rawNames = arr.map(x=>String(x)); } catch(_){ rawNames = []; }
          }
          if (!rawNames.length) {
            rawNames = trimmed.split(/\r?\n|,|;|\t/).map(s=>s.trim()).filter(Boolean);
          }
          rawNames = Array.from(new Set(rawNames));
        } catch(_) {}
        // Show modal with would-be imports
        const modal = document.getElementById('performerImportPreviewModal');
        const list = document.getElementById('performerImportPreviewList');
        const closeBtn = document.getElementById('performerImportPreviewClose');
        const confirmBtn = document.getElementById('performerImportPreviewConfirm');
        if (!modal || !list || !confirmBtn || !closeBtn) return;
        list.innerHTML = '';
        rawNames.forEach(name => {
          const div = document.createElement('div');
          div.className = 'chip';
          div.textContent = name;
          list.appendChild(div);
        });
        modal.hidden = false;
        function closeModal(){ modal.hidden = true; fileInput.value = ""; }
        if (!closeBtn._wired) { closeBtn._wired = true; closeBtn.addEventListener('click', closeModal); }
        if (!confirmBtn._wired) {
          confirmBtn._wired = true;
          confirmBtn.addEventListener('click', async () => {
            modal.hidden = true;
            setStatus("Importing…", true);
            let imported = false, errorMsg = "";
            // Try text/plain first
            try {
              const r = await fetch("/api/performers/import", {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: rawNames.join("\n")
              });
              if (r.ok) {
                imported = true;
                if (window.showToast) window.showToast("Performers imported", "is-success");
                if (window.fetchPerformers) window.fetchPerformers();
                setStatus("Imported performers", true);
              } else if (r.status === 422) {
                // Fallback to JSON
                const r2 = await fetch("/api/performers/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ names: rawNames })
                });
                const j2 = await r2.json();
                if (r2.ok) {
                  imported = true;
                  if (window.showToast) window.showToast("Performers imported", "is-success");
                  if (window.fetchPerformers) window.fetchPerformers();
                  setStatus("Imported performers", true);
                } else {
                  errorMsg = j2?.message || "Import failed";
                }
              } else {
                const j = await r.json();
                errorMsg = j?.message || "Import failed";
              }
            } catch (err) {
              errorMsg = err.message || "Import failed";
            } finally {
              fileInput.value = "";
              if (!imported) {
                setStatus("Import failed", true);
                if (window.showToast) window.showToast(errorMsg, "is-error");
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
                overlay.style.display = empty ? 'none' : '';
              };
              update();
              const mo = new MutationObserver(update);
              mo.observe(title, { childList: true, characterData: true, subtree: true });
              // also watch for attribute changes that may alter visibility
              mo.observe(overlay, { attributes: true });
            } catch (_) {}
          })();
        }
      });
    }
    if (dropZone && !dropZone._clickWired) {
      dropZone._clickWired = true;
      dropZone.addEventListener("click", () => {
        if (fileInput) fileInput.click();
      });
      dropZone.addEventListener("dblclick", () => {
        if (fileInput) fileInput.click();
      });
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (fileInput) fileInput.click();
        }
      });
    }
    function globalKeyHandler(e) {
      if (!isPanelActive()) return;
      if (e.key === "Escape" && selected.size) {
        selected.clear();
        updateSelectionUI();
      }
    }
    function isPanelActive() {
      const panel = document.getElementById("performers-panel");
      return panel && !panel.hasAttribute("hidden");
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
        dropZone.classList.add("drag-hover");
        dropZone.style.background = "rgba(79,140,255,0.18)";
        dropZone.style.outline = "2px dashed rgba(79,140,255,0.55)";
      }
      function clearHover() {
        if (!dropZone) return;
        dropZone.classList.remove("drag-hover");
        dropZone.style.background = "";
        dropZone.style.outline = "";
      }
      async function readPayload(dt) {
        if (!dt) return "";
        let out = "";
        const items = dt.items ? [...dt.items] : [];
        for (const it of items) {
          if (it.kind === "string") {
            try {
              out = await new Promise((r) => it.getAsString(r));
            } catch (_) {}
            if (out) return out;
          }
        }
        if (dt.files && dt.files.length) {
          for (const f of dt.files) {
            try {
              if (
                f.type.startsWith("text/") ||
                /\.(txt|csv|json)$/i.test(f.name)
              ) {
                out = await f.text();
                if (out) return out;
              }
            } catch (_) {}
          }
          try {
            if (!out) out = await dt.files[0].text();
          } catch (_) {}
        }
        return out;
      }
      function wantsIntercept(dt) {
        if (!dt) return false;
        return (
          dt.types &&
          (dt.types.includes("Files") ||
          dt.types.includes("text/plain") ||
          dt.files?.length)
        );
      }
      document.addEventListener(
        "dragover",
        (e) => {
          if (!panelActive()) return;
          if (!wantsIntercept(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          if (!over) {
            over = true;
            showHover();
          }
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        },
        true
      );
      document.addEventListener(
        "dragenter",
        (e) => {
          if (!panelActive()) return;
          if (!wantsIntercept(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          over = true;
          showHover();
        },
        true
      );
      document.addEventListener(
        "dragleave",
        (e) => {
          if (!panelActive()) return;
          if (!over) return;
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            over = false;
            clearHover();
          }, 60);
        },
        true
      );
      document.addEventListener(
        "drop",
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
              setStatus("Importing…", true);
              await fetch("/api/performers/import", {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: text,
              });
              await fetchPerformers();
            }
          } catch (err) {
            console.warn("performers drop failed", err);
            setStatus("Import failed", true);
            setTimeout(() => setStatus("", false), 1500);
          }
        },
        true
      );
    }
    function show() {
      const p = fetchPerformers();
      let attempts = 0;
      const maxAttempts = 40; // up to ~2s
      function attemptOpen(){
        if (window.__openPerfAutoMatch) {
          try { window.__openPerfAutoMatch(); } catch(_) {}
          return;
        }
        if (++attempts <= maxAttempts) setTimeout(attemptOpen, 50);
      }
      setTimeout(attemptOpen, 80);
    }
    return { show };
  })();
  window.Performers = Performers;

  // Hook tab switch to load performers when opened
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest('[data-tab="performers"]');
    if (btn) {
      setTimeout(() => {
        if (window.Performers) window.Performers.show();
      }, 50);
    }
  });

  // Fallback direct wiring: ensure clicking the import drop zone always opens file picker
  // (In case module wiring hasn't run yet or was interrupted.)
  (function ensurePerformerDropZoneClick() {
    function wire() {
      const dz = document.getElementById('performerDropZone');
      const fi = document.getElementById('performerFileInput');
      if (!dz || !fi || dz._directClick) return;
      dz._directClick = true;
      dz.addEventListener('click', (ev) => {
        // Ignore if text selection drag ended here
        if (fi && typeof fi.click === 'function') {
          try { fi.click(); } catch(_) {}
        }
      });
      dz.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          if (fi && typeof fi.click === 'function') {
            try { fi.click(); } catch(_) {}
          }
        }
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wire, { once: true });

      // -----------------------------
      // Performer Auto-Match Modal (Preview + Apply)
      // -----------------------------
      (function wirePerformerAutoMatch(){
        function qs(id){ return document.getElementById(id); }
        const openBtn = qs('performerAutoMatchBtn');
        const modal = qs('performerAutoMatchModal');
        if(!openBtn || !modal || modal._wired) return; modal._wired=true;
        const closeBtn = qs('perfAutoMatchClose');
        const cancelBtn = qs('perfAutoCancelBtn');
        const applyBtn = qs('perfAutoApplyBtn');
        const applyBtnFooter = qs('perfAutoApplyBtnFooter');
        const previewBtn = qs('perfAutoPreviewBtn');
        const statusEl = qs('perfAutoMatchStatus');
        const tbody = qs('perfAutoMatchTbody');
        const pathEl = qs('perfAutoPath');
        const recEl = qs('perfAutoRecursive');
        const useEl = qs('perfAutoUseRegistry');
        const extraEl = qs('perfAutoExtra');
        let lastRows = [];

        function open(){ modal.hidden=false; modal.setAttribute('data-open','1'); pathEl && pathEl.focus(); document.addEventListener('keydown', escListener); }
        function close(){ modal.hidden=true; modal.removeAttribute('data-open'); document.removeEventListener('keydown', escListener); }
        function escListener(e){ if(e.key==='Escape'){ close(); } }
        function setApplying(dis){ if(applyBtn) applyBtn.disabled=dis; if(applyBtnFooter) applyBtnFooter.disabled=dis; }
        function enableApply(enabled){ setApplying(!enabled); }
        async function doPreview(){
          enableApply(false);
          statusEl.textContent='Previewing…'; tbody.innerHTML=''; lastRows=[];
          try {
            const payload={ path: (pathEl.value||'').trim() || undefined, recursive: !!recEl.checked, use_registry_performers: !!useEl.checked, performers: _parseList(extraEl.value), tags:[], limit: 800 };
            const r = await fetch('/api/autotag/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            const j = await r.json();
            if(!r.ok) throw new Error(j?.message||'Preview failed');
            const rows = j?.data?.candidates || [];
            lastRows = rows;
            statusEl.textContent = rows.length ? rows.length + ' match(es)' : 'No matches';
            rows.forEach(row=>{
              const tpl = document.getElementById('autotagRowTemplate');
              const tr = tpl.content.firstElementChild.cloneNode(true);
              tr.querySelector('.file').textContent = row.file;
              tr.querySelector('.tags').textContent = (row.performers||[]).join(', ');
              tbody.appendChild(tr);
            });
            enableApply(rows.length>0);
          } catch(err){ statusEl.textContent = err.message || 'Preview failed'; }
        }
        async function doApply(){ if(!lastRows.length) return; setApplying(true); statusEl.textContent='Queuing job…'; try { const payload={ path: (pathEl.value||'').trim() || undefined, recursive: !!recEl.checked, use_registry_performers: !!useEl.checked, performers: _parseList(extraEl.value), tags:[] };
        const r = await fetch('/api/autotag/scan', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if(!r.ok){ try { const j=await r.json(); throw new Error(j?.message||'Queue failed'); } catch(e){ throw e; } }
        statusEl.textContent='Job queued'; showToast && showToast('Auto‑match job queued','is-success'); setTimeout(close, 800);
      } catch(err){ statusEl.textContent= err.message || 'Queue failed'; showToast && showToast(err.message||'Queue failed','is-error'); enableApply(true); }
    }
    // Expose programmatic opener that auto-previews only first time per open
    window.__openPerfAutoMatch = function(){
      if(!modal || !modal.hidden) return; // already open
      open();
      // Trigger preview automatically when opened programmatically
      if(previewBtn && !previewBtn._autoRan){ previewBtn._autoRan = true; doPreview(); }
    };
    if(openBtn) openBtn.addEventListener('click', () => { open(); doPreview(); });
    if(closeBtn) closeBtn.addEventListener('click', close);
    if(cancelBtn) cancelBtn.addEventListener('click', close);
    if(previewBtn) previewBtn.addEventListener('click', doPreview);
    if(applyBtn) applyBtn.addEventListener('click', doApply);
    if(applyBtnFooter) applyBtnFooter.addEventListener('click', doApply);
    modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
  })();

} else {
  wire();
}
})();

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
    this.activeFilters = new Set(["running", "queued"]);
    this._jobRows = new Map(); // id -> tr element for stable rendering
    this.init();
  }

  init() {
    this.initEventListeners();
    // SSE job events deferred until /config confirms capability (prevents 404 noise)
    this.startJobPolling();
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
  }

  async loadConfigAndApplyGates() {
    try {
      const r = await fetch("/config", {
        headers: { Accept: "application/json" },
      });
      if (r.ok) {
        const j = await r.json();
        const data = j?.data || j || {};
        const deps = data.deps || {};
        const caps = data.capabilities || {};
        // Normalize booleans, fallback to /health-style top-level if present
        this.capabilities.ffmpeg = Boolean(deps.ffmpeg ?? data.ffmpeg ?? true);
        this.capabilities.ffprobe = Boolean(
          deps.ffprobe ?? data.ffprobe ?? true
        );
        // Now that we know if SSE exists, decide whether to attach
        if (window.__JOBS_SSE_ENABLED && feats.jobs_sse && !window.__JOBS_SSE_UNAVAILABLE) {
          this.initJobEvents();
        } else {
          window.__JOBS_SSE_UNAVAILABLE = true;
        }
        this.capabilities.subtitles_enabled = Boolean(
          caps.subtitles_enabled ?? true
        );
        this.capabilities.faces_enabled = Boolean(caps.faces_enabled ?? true);
        // Expose for other modules (Player badge actions)
        try {
          window.__capabilities = { ...this.capabilities };
        } catch (_) {}
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
    const base = String(op || "").replace(/-(all|missing)$/, "");
    const caps = this.capabilities || {};
    const needsFfmpeg = new Set([
      "thumbnails",
      "previews",
      "sprites",
      "scenes",
      "heatmaps",
      "phash",
    ]);
    if (needsFfmpeg.has(base)) return !!caps.ffmpeg;
    if (base === "subtitles") return !!caps.subtitles_enabled;
    if (base === "faces" || base === "embed") return !!caps.faces_enabled;
    // metadata and others default to allowed
    return true;
  }

  async loadDefaultsAndHydrate() {
    try {
      const r = await fetch('/api/tasks/defaults');
      if (!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      const data = j?.data || j || {};
      this.defaults = data;
      // For each artifact defaults entry, set inputs if not locally overridden
      const LS_KEY = 'mediaPlayer:artifactOptions';
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; } catch(_) {}
      const applyVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (saved && saved[id] !== undefined) return; // user override
        if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
      };
      // Mapping artifact -> input ids
      const map = {
        thumbnails: { offset: 'thumbnailOffset' },
        sprites: { interval:'spriteInterval', width:'spriteWidth', cols:'spriteCols', rows:'spriteRows', quality:'spriteQuality' },
        previews: { segments:'previewSegments', duration:'previewDuration', width:'previewWidth' },
        phash: { frames:'phashFrames', algorithm:'phashAlgo' },
        scenes: { threshold:'sceneThreshold', limit:'sceneLimit' },
        heatmaps: { interval:'heatmapInterval', mode:'heatmapMode', png:'heatmapPng' },
        subtitles: { model:'subtitleModel', language:'subtitleLang' },
        faces: { interval:'faceInterval', min_size_frac:'faceMinSize', backend:'faceBackend', scale_factor:'faceScale', min_neighbors:'faceMinNeighbors', sim_thresh:'faceSimThresh' },
        embed: { interval:'embedInterval', min_size_frac:'embedMinSize', backend:'embedBackend', sim_thresh:'embedSimThresh' }
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
    } catch(_) {
      // Silently ignore; UI will use baked-in defaults
    }
  }

  wireOptionPersistence() {
    const LS_KEY = 'mediaPlayer:artifactOptions';
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; } catch(_) {}
    const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch(_) {} };
    const sel = '#spritesOptions input, #previewsOptions input, #thumbnailsOptions input, #phashOptions select, #phashOptions input, #scenesOptions input, #heatmapsOptions input, #heatmapsOptions select, #subtitlesOptions select, #subtitlesOptions input, #facesOptions input, #facesOptions select, #embedOptions input, #embedOptions select';
    document.querySelectorAll(sel).forEach(el => {
      if (el._persistWired) return;
      el._persistWired = true;
      const handler = () => {
        const id = el.id; if (!id) return;
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
      spriteWidth: 'Scaled width for each captured frame before compositing.'
    };
    Object.entries(tips).forEach(([id, tip]) => {
      const el = document.getElementById(id);
      if (el && !el.title) el.title = tip;
    });
  }

  attachOptionValidators() {
    const numericIds = [
      'spriteInterval','spriteWidth','spriteCols','spriteRows','spriteQuality','previewSegments','previewDuration','previewWidth','phashFrames','sceneThreshold','sceneLimit','heatmapInterval','thumbnailOffset','faceInterval','faceMinSize','faceScale','faceMinNeighbors','faceSimThresh','embedInterval','embedMinSize','embedSimThresh'
    ];
    numericIds.forEach(id => {
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
    if (isNaN(val)) { if (min !== null) val = min; else return; }
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
        btn.disabled = !!disable;
        if (title) btn.title = title;
      });
    };
    // FFmpeg-dependent
    const ffmpegMissing = !caps.ffmpeg;
    if (ffmpegMissing) {
      disableIf(
        '[data-operation="thumbnails-missing"], [data-operation="thumbnails-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      disableIf(
        '[data-operation="previews-missing"], [data-operation="previews-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      disableIf(
        '[data-operation="sprites-missing"], [data-operation="sprites-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      disableIf(
        '[data-operation="scenes-missing"], [data-operation="scenes-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      disableIf(
        '[data-operation="heatmaps-missing"], [data-operation="heatmaps-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      disableIf(
        '[data-operation="phash-missing"], [data-operation="phash-all"]',
        true,
        "Disabled: FFmpeg not detected"
      );
      // Player badges
      [
        "badgeHeatmap",
        "badgeScenes",
        "badgeSprites",
        "badgeHover",
        "badgePhash",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = true;
          el.title = "Disabled: FFmpeg not detected";
        }
      });
    }
    // Subtitles
    if (!caps.subtitles_enabled) {
      disableIf(
        '[data-operation="subtitles-missing"], [data-operation="subtitles-all"]',
        true,
        "Disabled: no subtitles backend available"
      );
      const el = document.getElementById("badgeSubtitles");
      if (el) {
        el.disabled = true;
        el.title = "Disabled: no subtitles backend available";
      }
    }
    // Faces/Embeddings
    if (!caps.faces_enabled) {
      disableIf(
        '[data-operation="faces-missing"], [data-operation="faces-all"]',
        true,
        "Disabled: face backends not available"
      );
      disableIf(
        '[data-operation="embed-missing"], [data-operation="embed-all"]',
        true,
        "Disabled: face backends not available"
      );
      const bf = document.getElementById("badgeFaces");
      if (bf) {
        bf.disabled = true;
        bf.title = "Disabled: face backends not available";
      }
    }
    // Browser-side faces button gating: requires FaceDetector OR a server path to compute embeddings may still work
    const fb = document.getElementById("facesBrowserBtn");
    if (fb) {
      const hasFD =
      "FaceDetector" in window && typeof window.FaceDetector === "function";
      // We require either FaceDetector availability (client) AND at least one embedding path on server (ffmpeg or faces backend)
      const serverOk = !!caps.ffmpeg || !!caps.faces_enabled;
      fb.disabled = !(hasFD && serverOk);
      fb.title = fb.disabled
      ? !hasFD
      ? "Disabled: FaceDetector API not available in this browser"
      : "Disabled: no server embedding path available"
      : "Detect faces in your browser and upload";
    }
  }

  updateCapabilityBanner() {
    const caps = this.capabilities || {};
    const issues = [];
    if (!caps.ffmpeg)
      issues.push(
      "FFmpeg not detected — thumbnails, previews, sprites, scenes, heatmaps, and pHash are disabled."
    );
    if (!caps.subtitles_enabled)
      issues.push(
      "Subtitles backend unavailable — subtitles generation is disabled."
    );
    if (!caps.faces_enabled)
      issues.push(
      "Face backends unavailable — face detection and embeddings are disabled."
    );
    let banner = document.getElementById("capabilityBanner");
    // Where to insert: top of the tasks panel container
    const tasksPanel = document.getElementById("tasks-panel");
    const container = tasksPanel
    ? tasksPanel.querySelector(".tasks-container")
    : null;
    if (!container) return;
    if (issues.length === 0) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "capabilityBanner";
      banner.className = "capability-banner";
      container.insertBefore(banner, container.firstChild);
    }
    // Populate banner content safely
    banner.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Tools notice:';
    banner.appendChild(strong);
    banner.appendChild(document.createTextNode(' ' + issues.join(' ')));
  }

  initJobEvents() {
    // New approach: avoid any preflight fetches that can 404. Attempt primary EventSource; on immediate failure, try alias once.
    if (window.__JOBS_SSE_UNAVAILABLE) return;
    const primary = "/jobs/events";
    const fallback = "/api/jobs/events";
    const throttle = 400;
    const attach = (url, isFallback) => {
      let es;
      try {
        es = new EventSource(url);
      } catch (_) {
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
        } catch (_) { }
      };
      [
        "created",
        "queued",
        "started",
        "progress",
        "current",
        "finished",
        "result",
        "cancel",
      ].forEach((type) => es.addEventListener(type, () => doRefresh()));
      es.onopen = () => {
        if (typeof this._onJobEventsConnected === "function") {
          this._onJobEventsConnected();
        }
      };
      let triedFallback = false;
      es.onerror = () => {
        // If primary fails very early, attempt fallback exactly once.
        if (!isFallback && !triedFallback && es.readyState === EventSource.CLOSED) {
          triedFallback = true;
          try { es.close(); } catch (_) {}
          attach(fallback, true);
          return;
        }
        try { es.close(); } catch (_) {}
        window.__JOBS_SSE_UNAVAILABLE = true;
        try { localStorage.setItem("jobs:sse", "off"); } catch (_) {}
      };
      this._jobEventSource = es;
      return true;
    };
    // Try primary; if it throws synchronously, attempt fallback.
    if (!attach(primary, false)) {
      attach(fallback, true);
    }
  }

  initEventListeners() {
    // Batch operation buttons
    document.querySelectorAll("[data-operation]").forEach((btn) => {
      // Avoid attaching duplicate listeners
      if (btn._opHandlerAttached) return;
      btn._opHandlerAttached = true;
      btn.addEventListener("click", async (e) => {
        const button = e.currentTarget;
        const operation = button.dataset.operation;
        await this.handleBatchOperation(operation);
      });
    });

    // File selection change
    document
    .querySelectorAll('input[name="fileSelection"]')
    .forEach((radio) => {
      radio.addEventListener("change", () => this.updateSelectedFileCount());
    });

    // Listen for tab changes to update selected file count and load initial data
    window.addEventListener("tabchange", (e) => {
      if (e.detail.activeTab === "tasks") {
        this.updateSelectedFileCount();
        // Load coverage and jobs when switching to tasks tab
        this.loadCoverage();
        this.refreshJobs();
      }
      // Load stats lazily when the stats tab is shown
      if (e.detail.activeTab === "stats") {
        try {
          if (typeof loadStats === 'function') loadStats();
        }
        catch(_) {}
      }
    });

    // Job stat filters
    const filterActive = document.getElementById("filterActive");
    const filterQueued = document.getElementById("filterQueued");
    const filterCompleted = document.getElementById("filterCompleted");
    const filterErrored = document.getElementById("filterErrored");
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
        el.classList.toggle("active", this.activeFilters.has(key));
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
      this.ensureJobTableShowsSomeRows();
    };
    if (filterActive)
      filterActive.addEventListener("click", () => toggle("running"));
    if (filterQueued)
      filterQueued.addEventListener("click", () => toggle("queued"));
    if (filterCompleted)
      filterCompleted.addEventListener("click", () => toggle("completed"));
    if (filterErrored)
      filterErrored.addEventListener("click", () => toggle("failed"));
    // Set initial visual state: running+queued active, completed inactive
    refreshCardStates();

    // Clear Completed button
    const clearBtn = document.getElementById("clearCompletedBtn");
    if (clearBtn && !clearBtn._wired) {
      clearBtn._wired = true;
      clearBtn.addEventListener("click", async () => {
        try {
          clearBtn.disabled = true;
          clearBtn.classList.add("btn-busy");
          const r = await fetch("/api/tasks/jobs/clear-completed", {
            method: "POST",
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          this.showNotification(
            `Removed ${data?.data?.removed ?? 0} completed job(s)`,
            "success"
          );
          await this.refreshJobs();
        } catch (e) {
          this.showNotification("Failed to clear completed jobs", "error");
        } finally {
          clearBtn.classList.remove("btn-busy");
          clearBtn.disabled = false;
        }
      });
    }

    // Explicitly wire Cancel Queued / Cancel All once
    const cancelQueuedBtn = document.getElementById("cancelQueuedBtn");
    if (cancelQueuedBtn && !cancelQueuedBtn._wired) {
      cancelQueuedBtn._wired = true;
      cancelQueuedBtn.addEventListener("click", async () => {
        try {
          cancelQueuedBtn.disabled = true;
          cancelQueuedBtn.classList.add("btn-busy");
          const res = await fetch("/api/tasks/jobs/cancel-queued", {
            method: "POST",
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          this.showNotification("Queued jobs canceled", "success");
          await this.refreshJobs();
        } catch (e) {
          this.showNotification("Failed to cancel queued jobs", "error");
        } finally {
          cancelQueuedBtn.classList.remove("btn-busy");
          cancelQueuedBtn.disabled = false;
        }
      });
    }
    const cancelAllBtn = document.getElementById("cancelAllBtn");
    if (cancelAllBtn && !cancelAllBtn._wired) {
      cancelAllBtn._wired = true;
      cancelAllBtn.addEventListener("click", async () => {
        try {
          cancelAllBtn.disabled = true;
          cancelAllBtn.classList.add("btn-busy");
          const res = await fetch("/api/tasks/jobs/cancel-all", {
            method: "POST",
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          this.showNotification(
            "All pending and running jobs asked to cancel",
            "success"
          );
          await this.refreshJobs();
        } catch (e) {
          this.showNotification("Failed to cancel all jobs", "error");
        } finally {
          cancelAllBtn.classList.remove("btn-busy");
          cancelAllBtn.disabled = false;
        }
      });
    }
  }

  // Wire facesBrowserBtn to run browser detection on the currently open video
  wireBrowserFacesButton() {
    const btn = document.getElementById("facesBrowserBtn");
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", async () => {
      try {
        // Switch to player tab if needed so the user can see progress and allow playback controls
        // Suppress implicit tab switch; user will already be on Player when meaningful.
        // if (window.tabSystem && window.tabSystem.getActiveTab() !== 'player') window.tabSystem.switchToTab('player');
        // Delegate to Player module
        if (
          window.Player &&
          typeof window.Player.detectAndUploadFacesBrowser === "function"
        ) {
          await window.Player.detectAndUploadFacesBrowser();
        } else {
          this.showNotification(
            "Player not ready for browser detection.",
            "error"
          );
        }
      } catch (e) {
        this.showNotification(
          "Browser faces failed: " + (e && e.message ? e.message : "error"),
          "error"
        );
      }
    });
  }

  async previewHeatmapSample() {
    try {
      // Find first video in current folder
      const val = (folderInput.value || "").trim();
      const rel = isAbsolutePath(val) ? "" : currentPath();
      const url = new URL("/api/library", window.location.origin);
      if (rel) url.searchParams.set("path", rel);
      url.searchParams.set("page", "1");
      url.searchParams.set("page_size", "1");
      url.searchParams.set("sort", "date");
      url.searchParams.set("order", "desc");
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const pl = await r.json();
      const file = (pl?.data?.files || [])[0];
      if (!file || !file.path) {
        this.showNotification(
          "No videos found in this folder to preview.",
          "error"
        );
        return;
      }
      const path = file.path;
      // Ensure heatmap exists; try a GET probe; if missing, trigger create and poll briefly
      const headUrl = new URL("/api/heatmaps/png", window.location.origin);
      headUrl.searchParams.set("path", path);
      let ok = false;
      for (let i = 0; i < 10; i++) {
        // ~10 quick tries
        const h = await fetch(headUrl.toString());
        if (h.ok) {
          ok = true;
          break;
        }
        // Trigger creation once at the beginning
        if (i === 0) {
          const createUrl = new URL(
            "/api/heatmaps/create",
            window.location.origin
          );
          createUrl.searchParams.set("path", path);
          createUrl.searchParams.set(
            "interval",
            String(
              parseFloat(
                document.getElementById("heatmapInterval")?.value || "5.0"
              )
            )
          );
          createUrl.searchParams.set(
            "mode",
            document.getElementById("heatmapMode")?.value || "both"
          );
          createUrl.searchParams.set("png", "true");
          try {
            await fetch(createUrl, { method: "POST" });
          } catch (_) {}
        }
        await new Promise((res) => setTimeout(res, 300));
      }
      if (!ok) {
        this.showNotification("Heatmap PNG not ready yet.", "error");
        return;
      }
      // Show modal
      const imgUrl = new URL("/api/heatmaps/png", window.location.origin);
      imgUrl.searchParams.set("path", path);
      imgModalImage.src = imgUrl.toString() + `&t=${Date.now()}`;
      imgModal.hidden = false;
    } catch (e) {
      this.showNotification("Failed to preview heatmap.", "error");
    }
  }

  async handleBatchOperation(operation) {
    try {
      // Derive base operation and mode from the button's data-operation value
      let base = String(operation || "").trim();
      let mode = "missing";
      let isClear = false;
      if (base.endsWith("-missing")) {
        base = base.replace(/-missing$/, "");
        mode = "missing";
      } else if (base.endsWith("-all")) {
        base = base.replace(/-all$/, "");
        mode = "all";
      } else if (base.endsWith("-clear")) {
        base = base.replace(/-clear$/, "");
        isClear = true;
        mode = "clear";
      }

      // Capability gate (skip for clear which only deletes existing files)
      if (!isClear && !this.canRunOperation(base)) {
        const why =
        base === "subtitles"
        ? "No subtitles backend available."
        : base === "faces" || base === "embed"
        ? "Face backends unavailable."
        : "FFmpeg not detected.";
        this.showNotification(
          `Cannot start ${base} (${mode}). ${why}`,
          "error"
        );
        return;
      }

      // Scope: all vs selected files
      const selectedRadio = document.querySelector(
        'input[name="fileSelection"]:checked'
      );
      const fileSelection = selectedRadio ? selectedRadio.value : "all";

      // Folder path (relative to root unless absolute provided)
      const val = (folderInput.value || "").trim();
      const rel = isAbsolutePath(val) ? "" : currentPath();

      // Collect params for this operation
      if (isClear) {
        const confirmed = confirm(
          `Clear all ${base} artifacts? This cannot be undone.`
        );
        if (!confirmed) return;
        // Attempt scoped clear if selected-only chosen and supported
        try {
          const clearUrl = new URL(
            `/api/artifacts/${base}`,
            window.location.origin
          );
          const selPaths =
          fileSelection === "selected"
          ? Array.from(selectedItems || [])
          : null;
          let resp;
          if (selPaths && selPaths.length) {
            resp = await fetch(clearUrl.toString(), {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paths: selPaths }),
            });
          } else {
            resp = await fetch(clearUrl.toString(), { method: "DELETE" });
          }
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          this.showNotification(`${base} cleared`, "success");
          await this.loadCoverage();
        } catch (e) {
          this.showNotification(
            `Failed to clear ${base}: ${(e && e.message) || e}`,
            "error"
          );
        }
        return; // Done
      } else {
        const params = this.getOperationParams(base) || {};
        if (mode === "all") {
          params.force = true;
          params.overwrite = true;
        }
        const payload = {
          operation: base,
          mode,
          fileSelection,
          params,
          path: rel,
        };
        const response = await fetch("/api/tasks/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.status === "success") {
          this.showNotification(
            `Started ${base} (${mode}) for ${result.data.fileCount} files`,
            "success"
          );
          this.refreshJobs();
          this.loadCoverage();
        } else {
          throw new Error(result.message || "Operation failed");
        }
      }
    } catch (error) {
      console.error("Batch operation failed:", error);
      this.showNotification(
        `Failed to start ${operation}: ${error.message}`,
        "error"
      );
    }
  }

  // Wire Generate All button: queue all missing artifacts in fast-first order
  wireGenerateAll() {
    const btn = document.getElementById("generateAllBtn");
    if (!btn) return;
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", async () => {
      const ops = [
        "metadata-missing",
        "phash-missing",
        "thumbnails-missing",
        "previews-missing",
        "sprites-missing",
        "heatmaps-missing",
        "scenes-missing",
        "faces-missing",
        "embed-missing",
        "subtitles-missing",
      ].filter((op) => this.canRunOperation(op));
      if (ops.length === 0) {
        this.showNotification(
          "No compatible operations available. Check the Tools notice above.",
          "error"
        );
        return;
      }
      btn.disabled = true;
      btn.classList.add("btn-busy");
      try {
        for (const op of ops) {
          await this.handleBatchOperation(op);
          await new Promise((r) => setTimeout(r, 80));
        }
        this.showNotification(
          "Queued all missing artifacts (fast-first).",
          "success"
        );
      } catch (e) {
        this.showNotification(
          "Failed to queue one or more operations.",
          "error"
        );
      } finally {
        btn.classList.remove("btn-busy");
        btn.disabled = false;
      }
    });
  }

  resetCoverageDisplay(artifactType) {
    // Reset the display for a specific artifact type to show 0%
    const percentageEl = document.getElementById(`${artifactType}Coverage`);
    const fillEl = document.getElementById(`${artifactType}Fill`);

    if (percentageEl) {
      percentageEl.textContent = "0%";
    }

    if (fillEl) {
      fillEl.style.width = "0%";
    }

    // Update button visibility for 0% coverage
    const generateBtn = document.querySelector(
      `[data-operation="${artifactType}-missing"]`
    );
    const recomputeBtn = document.querySelector(
      `[data-operation="${artifactType}-all"]`
    );

    if (generateBtn) generateBtn.style.display = "block";
    if (recomputeBtn) recomputeBtn.style.display = "none";
  }

  getOperationParams(type) {
    const params = {};

    switch (type) {
      case "thumbnails":
      params.offset = document.getElementById("thumbnailOffset")?.value || 10;
      break;
      case "phash":
      params.frames = document.getElementById("phashFrames")?.value || 5;
      params.algorithm =
      document.getElementById("phashAlgo")?.value || "ahash";
      break;
      case "sprites":
      params.interval =
      document.getElementById("spriteInterval")?.value || 10;
      params.width = document.getElementById("spriteWidth")?.value || 320;
      params.cols = document.getElementById("spriteCols")?.value || 10;
      params.rows = document.getElementById("spriteRows")?.value || 10;
      params.quality = document.getElementById("spriteQuality")?.value || 4;
      break;
      case "previews":
      params.segments =
      document.getElementById("previewSegments")?.value || 9;
      params.duration =
      document.getElementById("previewDuration")?.value || 1.0;
      params.width = document.getElementById("previewWidth")?.value || 320;
      break;
      case "heatmaps":
      params.interval = parseFloat( document.getElementById("heatmapInterval")?.value || "5.0" );
      // Accept legacy 'both' plus new modes
      params.mode = document.getElementById("heatmapMode")?.value || "both";
      // Use checkbox to control PNG generation (default true)
      params.png = document.getElementById("heatmapPng")?.checked !== false;
      break;
      case "subtitles":
      params.model =
      document.getElementById("subtitleModel")?.value || "small";
      {
        const langVal = (
          document.getElementById("subtitleLang")?.value || ""
        ).trim();
        params.language = langVal || "auto";
      }
      // translate option not exposed in UI; default false
      params.translate = false;
      break;
      case "scenes":
      params.threshold = parseFloat( document.getElementById("sceneThreshold")?.value || "0.4" );
      params.limit = parseInt( document.getElementById("sceneLimit")?.value || "0", 10 );
      break;
      case "faces":
      params.interval = parseFloat( document.getElementById("faceInterval")?.value || "1.0" );
      params.min_size_frac = parseFloat( document.getElementById("faceMinSize")?.value || "0.10" );
      // Advanced tunables (parity with legacy FaceLab)
      params.backend =
      document.getElementById("faceBackend")?.value || "auto";
      // Only some backends use these; harmless to pass through
      params.scale_factor = parseFloat( document.getElementById("faceScale")?.value || "1.1" );
      params.min_neighbors = parseInt( document.getElementById("faceMinNeighbors")?.value || "5", 10 );
      params.sim_thresh = parseFloat( document.getElementById("faceSimThresh")?.value || "0.9" );
      break;
      case "embed":
      params.interval = parseFloat( document.getElementById("embedInterval")?.value || "1.0" );
      params.min_size_frac = parseFloat( document.getElementById("embedMinSize")?.value || "0.10" );
      params.backend = document.getElementById("embedBackend")?.value || "auto";
      params.sim_thresh = parseFloat( document.getElementById("embedSimThresh")?.value || "0.9" );
      break;
    }

    return params;
  }

  async loadCoverage() {
    try {
      // Request coverage for the current folder (relative to root)
      const val = (folderInput.value || "").trim();
      const rel = isAbsolutePath(val) ? "" : currentPath();
      const url = new URL("/api/tasks/coverage", window.location.origin);
      if (rel) url.searchParams.set("path", rel);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
        this.coverage = data.data.coverage;
        this._coverageLoaded = true;
        this.updateCoverageDisplay();
      }
    } catch (error) {
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
      "metadata",
      "thumbnails",
      "sprites",
      "previews",
      "phash",
      "scenes",
      "heatmaps",
      "subtitles",
      "faces",
    ];

    artifacts.forEach((artifact) => {
      const data = this.coverage[artifact] || {
        processed: 0,
        missing: 0,
        total: 0,
      };
      const percentage =
      data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;

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

      // Adaptive single-button behavior:
      // 0% => Generate All, partial => Generate Missing, 100% => Clear All
      const genMissingBtn = document.querySelector(`[data-operation="${artifact}-missing"]`);
      const recomputeAllBtn = document.querySelector(`[data-operation="${artifact}-all"]`);
      const clearBtn = document.querySelector(`[data-operation="${artifact}-clear"]`);

      [genMissingBtn, recomputeAllBtn, clearBtn].forEach(b => {
        if (!b) return;
        b.classList.add("hidden");
        b.classList.remove("btn-danger");
        b.removeAttribute("data-state");
      });

      let active = null;
      if (percentage === 0) {
        active = recomputeAllBtn || genMissingBtn || clearBtn;
        if (active) {
          active.textContent = "Generate All";
          active.title = "Generate all artifacts";
          if (!active.dataset.operation.endsWith('-all')) {
            active.dataset.operation = `${artifact}-all`;
          }
          active.dataset.state = "all";
        }
      } else if (percentage > 0 && percentage < 100) {
        active = genMissingBtn || recomputeAllBtn || clearBtn;
        if (active) {
          active.textContent = "Generate Missing";
          active.title = "Generate only missing artifacts";
          if (!active.dataset.operation.endsWith('-missing')) {
            active.dataset.operation = `${artifact}-missing`;
          }
          active.dataset.state = "missing";
        }
      } else if (percentage === 100) {
        active = clearBtn || recomputeAllBtn || genMissingBtn;
        if (active) {
          active.textContent = "Clear All";
          active.title = "Delete all generated artifacts";
          if (!active.dataset.operation.endsWith('-clear')) {
            active.dataset.operation = `${artifact}-clear`;
          }
          active.classList.add("btn-danger");
          active.dataset.state = "clear";
        }
      }
      if (active) {
        active.classList.remove("hidden", "d-none");
        // Metadata uses same adaptive control: Generate All -> Generate Missing -> Clear All
      }
    });

    // Mirror faces coverage to embeddings UI (embeddings share faces.json presence)
    const facesData = this.coverage["faces"] || { processed: 0, total: 0 };
    const embedPct =
    facesData.total > 0
    ? Math.round((facesData.processed / facesData.total) * 100)
    : 0;
    const embedPctEl = document.getElementById("embedCoverage");
    const embedFillEl = document.getElementById("embedFill");
    if (embedPctEl) embedPctEl.textContent = `${embedPct}%`;
    if (embedFillEl) embedFillEl.style.width = `${embedPct}%`;
    const embedGen = document.querySelector('[data-operation="embed-missing"]');
    const embedRe = document.querySelector('[data-operation="embed-all"]');
    const embedClear = document.querySelector('[data-operation="embed-clear"]');
    [embedGen, embedRe, embedClear].forEach(b => { if (!b) return; b.classList.add('hidden'); b.classList.remove('btn-danger'); b && b.removeAttribute('data-state'); });
    let embedActive = null;
    if (embedPct === 0) {
      embedActive = embedRe || embedGen || embedClear;
      if (embedActive) {
        embedActive.textContent = 'Generate All';
        if (!embedActive.dataset.operation.endsWith('-all')) {
          embedActive.dataset.operation = 'embed-all';
        }
        embedActive.dataset.state = 'all';
      }
    } else if (embedPct > 0 && embedPct < 100) {
      embedActive = embedGen || embedRe || embedClear;
      if (embedActive) {
        embedActive.textContent = 'Generate Missing';
        if (!embedActive.dataset.operation.endsWith('-missing')) {
          embedActive.dataset.operation = 'embed-missing';
        }
        embedActive.dataset.state = 'missing';
      }
    } else if (embedPct === 100) {
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
      const response = await fetch("/api/tasks/jobs");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
        this.updateJobsDisplay(data.data.jobs);
        this.updateJobStats(data.data.stats);
      }
    } catch (error) {
      // Quiet failure during polling
    }
  }

  updateJobsDisplay(jobs) {
    const tbody = document.getElementById("jobTableBody");
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
    const hasCompleted = jobs.some(
      (j) => this.normalizeStatus(j) === "completed"
    );
    const clearBtn = document.getElementById("clearCompletedBtn");
    if (clearBtn) clearBtn.style.display = hasCompleted ? "" : "none";
    const failedEl = document.getElementById("failedJobsCount");
    if (failedEl)
      failedEl.textContent = jobs.filter((j) => j.status === "failed").length;
  }

  renderJobsTable() {
    const tbody = document.getElementById("jobTableBody");
    if (!tbody) return;
    const all = Array.from(this.jobs.values());
    // Filtering: when no filters are active, show no rows (user explicitly hid all)
    let visible = [];
    if (this.activeFilters && this.activeFilters.size > 0) {
      visible = all.filter((j) => this.activeFilters.has(this.normalizeStatus(j)));
    }
    // Sort with explicit priority: running > queued > others, then by time desc
    const prio = (j) => {
      const s = this.normalizeStatus(j);
      if (s === "running") return 2;
      if (s === "queued") return 1;
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
        tr.style.display = "none";
      } else {
        tr.style.display = "";
      }
    }
    this.updateRunningVisuals();
    // Toggle action buttons based on current state
    const clearBtn = document.getElementById("clearCompletedBtn");
    const cancelQueuedBtn = document.getElementById("cancelQueuedBtn");
    const cancelAllBtn = document.getElementById("cancelAllBtn");
    if (clearBtn) {
      const hasCompletedOrFailed = Array.from(this.jobs.values()).some(
        (j) => {
          const s = this.normalizeStatus(j);
          return s === "completed" || s === "failed";
        }
      );
      clearBtn.style.display = hasCompletedOrFailed ? "inline-block" : "none";
    }
    if (cancelQueuedBtn) {
      const hasQueued = Array.from(this.jobs.values()).some(
        (j) => (j.status || "") === "queued"
      );
      cancelQueuedBtn.style.display = hasQueued ? "inline-block" : "none";
      cancelQueuedBtn.onclick = async () => {
        try {
          const res = await fetch("/api/tasks/jobs/cancel-queued", {
            method: "POST",
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          this.showNotification("Queued jobs canceled", "success");
          this.refreshJobs();
        } catch (e) {
          this.showNotification("Failed to cancel queued jobs", "error");
        }
      };
    }
    if (cancelAllBtn) {
      const hasAny = Array.from(this.jobs.values()).some(
        (j) => (j.status || "") === "queued" || (j.status || "") === "running"
      );
      cancelAllBtn.style.display = hasAny ? "inline-block" : "none";
      cancelAllBtn.onclick = async () => {
        try {
          const res = await fetch("/api/tasks/jobs/cancel-all", {
            method: "POST",
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          this.showNotification(
            "All pending and running jobs asked to cancel",
            "success"
          );
          this.refreshJobs();
        } catch (e) {
          this.showNotification("Failed to cancel all jobs", "error");
        }
      };
    }

    // Clamp container height to content so it never grows beyond the table needs
    const container = document.getElementById('jobTableContainer');
    if (container) {
      const table = container.querySelector('table');
      if (table) {
        const maxContent = table.scrollHeight + 8; // small padding
        const current = container.getBoundingClientRect().height;
        if (current > maxContent) {
          container.style.height = maxContent + 'px';
        }
      }
    }
  }

  updateRunningVisuals(jobs) {
    // Add animated stripes to each running job's progress bar
    const rows = document.querySelectorAll("#jobTableBody tr");
    rows.forEach((tr, idx) => {
      const id = tr?.dataset?.jobId;
      const job = id ? this.jobs.get(id) : null;
      const status = job ? this.normalizeStatus(job) : "";
      const bar = tr.querySelector(".job-progress");
      if (bar) {
        bar.classList.toggle("running", status === "running");
      }
    });
  }

  // Map internal status keys to user-facing labels that match the filter toggle cards
  displayStatusLabel(status) {
    const map = {
      running: "Active",
      queued: "Queued",
      completed: "Completed",
      failed: "Errored",
      canceled: "Canceled",
    };
    if (status in map) return map[status];
    // Fallback: capitalize unknown status keys
    if (typeof status === "string" && status.length) {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
    return "";
  }

  createJobRow(job) {
    const tpl = document.getElementById('jobRowTemplate');
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.jobId = job.id;
    this.updateJobRow(row, job);
    return row;
  }

  updateJobRow(row, job) {
    const tstamp = job.startTime || job.createdTime || 0;
    const startTime = tstamp
    ? new Date(tstamp * 1000).toLocaleTimeString()
    : "N/A";
    const baseName = (p) => (p || "").split("/").filter(Boolean).pop() || "";
    const fileName = baseName(job.target) || baseName(job.file);
    row.querySelector(".cell-time").textContent = startTime;
    row.querySelector(".cell-task").textContent = job.task;
    const fileCell = row.querySelector(".cell-file");
    fileCell.textContent = fileName;
    fileCell.title = job.target || job.file || "";
    // Status
    let status = this.normalizeStatus(job);
    const statusEl = row.querySelector(".job-status");
    statusEl.className = "job-status " + status;
    statusEl.textContent = this.displayStatusLabel(status);
    // Progress: prefer server-provided value; only fall back to raw counters when missing
    let pct = 0;
    const totalRaw = job.totalRaw;
    const processedRaw = job.processedRaw;
    if (typeof job.progress === "number" && Number.isFinite(job.progress)) {
      pct = job.progress;
    }
    // If not completed and server didn't provide a value, derive from raw counters
    if (
      status !== "completed" &&
      status !== "canceled" &&
      (pct == null || pct <= 0)
    ) {
      if (
        typeof totalRaw === "number" &&
        totalRaw > 0 &&
        typeof processedRaw === "number"
      ) {
        const calc = Math.max(
          0,
          Math.min(100, Math.floor((processedRaw / totalRaw) * 100))
        );
        if (calc > 0) pct = calc;
      }
    }
    // Queued shows 0%; completed always shows 100%
    if (status === "queued") pct = 0;
    if (status === "completed") pct = 100;
    const bar = row.querySelector(".job-progress-fill");
    // Canceled explicitly shows 0% and "Canceled"
    if (status === "canceled") {
      bar.style.width = "0%";
    } else {
      bar.style.width = (status !== "queued" ? pct : 0) + "%";
    }
    row.querySelector(".pct").textContent =
    status === "queued"
    ? "Queued"
    : status === "completed"
    ? "100%"
    : status === "canceled"
    ? "Canceled"
    : `${pct}%`;
    const fname = row.querySelector(".fname");
    // Show the target path when available for non-queued states
    const targetPath =
    job && typeof job.target === "string" && job.target ? job.target : "";
    fname.textContent = status === "queued" ? "" : targetPath || "";
    // Action
    const action = row.querySelector(".cell-action");
    action.innerHTML = "";
    if (status === "running") {
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.textContent = "Cancel";
      btn.addEventListener("click", () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === "queued") {
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.textContent = "Cancel";
      btn.addEventListener("click", () => this.cancelJob(job.id));
      action.appendChild(btn);
    } else if (status === "canceled") {
      // No actions for canceled
    } else if (status === "failed") {
      // Click row to view error details
      const errText = job && job.error ? String(job.error) : "";
      if (errText) {
        row.style.cursor = "pointer";
        row.title = "Click to view error details";
        row.addEventListener("click", () => this.showErrorModal(errText, job), {
          once: true,
        });
      }
    }
  }

  initJobQueueResizer() {
    const container = document.getElementById("jobTableContainer");
    const handle = document.getElementById("jobResizeHandle");
    if (!container || !handle) return;
    // Avoid double wiring
    if (handle._wired) return;
    handle._wired = true;

    // Clear any lingering max-height from older logic
    container.style.maxHeight = "";

    let startY = 0;
    let startHeight = 0;
    const MIN = 120; // minimum usable height
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
      container.style.height = newH + "px";
      container.style.overflow = 'auto';
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("resizing-job-table");
    };
    handle.addEventListener("mousedown", (e) => {
      // Only left button
      if (e.button !== 0) return;
      startY = e.clientY;
      startHeight = container.getBoundingClientRect().height;
      container._userResized = true; // mark explicit user intent
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.classList.add("resizing-job-table");
      e.preventDefault();
    });
    // Responsive safety: if window shrinks below chosen height, clamp down
    window.addEventListener("resize", () => {
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
    .filter(r => r.style.display !== 'none');
    if (!rows.length) return; // nothing to show
    const sample = rows.find(r => r.offsetParent !== null) || rows[0];
    const rh = sample.getBoundingClientRect().height || 28;
    const wantRows = Math.min(rows.length, 4); // show up to 4 rows if available
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
    // Map server states directly; do not infer running from progress for queued
    let s = (job.status || "").toLowerCase();
    if (s === "completed") return "completed";
    if (s === "running") return "running";
    if (s === "queued") return "queued";
    if (s === "failed") return "failed";
    if (s === "canceled") return "canceled";
    return s || "unknown";
  }

  showErrorModal(message, job) {
    let modal = document.getElementById("errorModal");
    if (!modal) {
      // As a fallback only: create the modal structure using DOM APIs (no template strings)
      modal = document.createElement("div");
      modal.id = "errorModal";
      modal.className = "modal";
      const content = document.createElement('div');
      content.className = 'modal-content';
      content.style.maxWidth = '720px';
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '12px';
      const h3 = document.createElement('h3'); h3.style.margin = '0'; h3.textContent = 'Job Error';
      const closeBtn = document.createElement('button'); closeBtn.className = 'btn'; closeBtn.id = 'errorModalClose'; closeBtn.textContent = 'Close';
      header.appendChild(h3); header.appendChild(closeBtn);
      const pre = document.createElement('pre'); pre.id = 'errorModalText'; pre.style.whiteSpace = 'pre-wrap'; pre.style.background = '#111'; pre.style.color = '#f88'; pre.style.padding = '12px'; pre.style.borderRadius = '6px'; pre.style.maxHeight = '50vh'; pre.style.overflow = 'auto';
      content.appendChild(header); content.appendChild(pre); modal.appendChild(content);
      document.body.appendChild(modal);
      const close = () => { modal.hidden = true; };
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
      closeBtn.addEventListener('click', close);
    }
    const pre = modal.querySelector('#errorModalText');
    if (pre) pre.textContent = message || 'Unknown error';
    modal.hidden = false;
  }

  updateJobStats(stats) {
    // Recompute ALL counters locally based on the jobs currently loaded.
    // Requirement: counts reflect everything that "shows up in the list" (i.e., jobs payload),
    // not a time-windowed subset like completedToday.
    const jobs = Array.from(this.jobs.values());
    const norm = (j) => this.normalizeStatus(j);
    const activeCount = jobs.filter((j) => norm(j) === "running").length;
    const queuedCount = jobs.filter((j) => norm(j) === "queued").length;
    const completedCount = jobs.filter((j) => norm(j) === "completed").length;
    const failedCount = jobs.filter((j) => norm(j) === "failed").length;

    const activeEl = document.getElementById("activeJobsCount");
    const queuedEl = document.getElementById("queuedJobsCount");
    const completedEl = document.getElementById("completedJobsCount");
    const failedEl = document.getElementById("failedJobsCount");

    if (activeEl) activeEl.textContent = activeCount;
    if (queuedEl) queuedEl.textContent = queuedCount;
    if (completedEl) completedEl.textContent = completedCount;
    if (failedEl) failedEl.textContent = failedCount;
  }

  async cancelJob(jobId) {
    try {
      const response = await fetch(`/api/tasks/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          this.showNotification("Job canceled", "success");
          this.refreshJobs();
        }
      } else {
        throw new Error("Failed to cancel job");
      }
    } catch (error) {
      console.error("Failed to cancel job:", error);
      this.showNotification("Failed to cancel job", "error");
    }
  }

  updateSelectedFileCount() {
    const selectedRadio = document.querySelector(
      'input[name="fileSelection"]:checked'
    );
    const countEl = document.getElementById("selectedFileCount");

    if (selectedRadio && countEl) {
      if (selectedRadio.value === "selected") {
        // Get count from library selection
        countEl.textContent = selectedItems.size;
      } else {
        countEl.textContent = "0";
      }
    }
  }

  startJobPolling() {
    // Adaptive polling: fast (1s) until SSE (if any) attaches; then slow (15s) fallback.
    const FAST = 1000;
    const SLOW = 15000;
    if (this._jobPollTimer) clearInterval(this._jobPollTimer);
    let interval = FAST;
    const tick = () => {
      if (tabSystem && tabSystem.getActiveTab && tabSystem.getActiveTab() === "tasks") {
        this.refreshJobs();
        this.loadCoverage();
      }
    };
    this._jobPollTimer = setInterval(tick, interval);
    // If SSE later connects, we expose a hook to downgrade polling frequency
    this._onJobEventsConnected = () => {
      if (!this._jobPollTimer) return;
      clearInterval(this._jobPollTimer);
      this._jobPollTimer = setInterval(tick, SLOW); // keep a light safety net
    };
  }

  showNotification(message, type = "info") {
    // Host container (idempotent)
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      document.body.appendChild(host);
    }

    const el = document.createElement("div");
    el.className = "toast";
    if (type === "success") el.classList.add("is-success");
    else if (type === "error") el.classList.add("is-error");
    else el.classList.add("is-info");
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    el.textContent = message;
    host.appendChild(el);

    // Auto fade + remove
    const lifespan = 5000;
    const fadeMs = 250;
    setTimeout(() => {
      el.classList.add("fade-out");
      setTimeout(() => el.remove(), fadeMs + 30);
    }, lifespan - fadeMs);
  }

  async loadOrphanData() {
    try {
      // Use empty path to scan the current root directory
      const response = await fetch("/api/artifacts/orphans");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
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
    const orphanCountEl = document.getElementById("orphanCount");
    const cleanupBtn = document.getElementById("cleanupOrphansBtn");
    const previewBtn = document.getElementById("previewOrphansBtn");
    const orphanDetails = document.getElementById("orphanDetails");
    const orphanList = document.getElementById("orphanList");

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
    if (
      orphanDetails &&
      !orphanDetails.classList.contains("d-none") &&
      orphanList
    ) {
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
      } else {
        const d = document.createElement('div');
        d.className = 'orphan-file empty';
        d.textContent = 'No orphaned files';
        orphanList.appendChild(d);
      }
    }
  }

  async previewOrphans() {
    const orphanDetails = document.getElementById("orphanDetails");
    const orphanList = document.getElementById("orphanList");
    if (!orphanDetails || !orphanList) return;
    const btn = document.getElementById("previewOrphansBtn");
    const isHidden = orphanDetails.classList.contains("d-none");
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
      } else {
        const d = document.createElement('div');
        d.className = 'orphan-file empty';
        d.textContent = 'No orphaned files';
        orphanList.appendChild(d);
      }
      orphanDetails.classList.remove("d-none");
      orphanDetails.removeAttribute("hidden");
      if (btn) btn.textContent = "Hide";
    } else {
      // Hide
      orphanDetails.classList.add("d-none");
      if (btn) btn.textContent = "Preview";
    }
  }

  async cleanupOrphans() {
    if (
      !confirm(
        `Are you sure you want to delete ${this.orphanFiles.length} orphaned artifact files? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      // Use empty path to cleanup the current root directory
      const response = await fetch(
        "/api/artifacts/cleanup?dry_run=false&keep_orphans=false",
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
        this.showNotification("Cleanup started successfully", "success");
        // Refresh orphan data after cleanup starts
        setTimeout(() => this.loadOrphanData(), 2000);
      } else {
        throw new Error(data.message || "Cleanup failed");
      }
    } catch (error) {
      console.error("Failed to start cleanup:", error);
      this.showNotification(
        "Failed to start cleanup: " + error.message,
        "error"
      );
    }
  }
}

// Initialize tasks manager when DOM is ready
let tasksManager;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    tasksManager = new TasksManager();
    try {
      window.tasksManager = tasksManager;
    } catch (_) {}
  });
} else {
  // Script likely loaded with defer, DOM is ready; safe to init now
  tasksManager = new TasksManager();
  try {
    window.tasksManager = tasksManager;
  } catch (_) {}
  const previewBtn = document.getElementById("previewOrphansBtn");
  const cleanupBtn = document.getElementById("cleanupOrphansBtn");

  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      if (tasksManager) {
        tasksManager.previewOrphans();
      }
    });
  }

  if (cleanupBtn) {
    cleanupBtn.addEventListener("click", () => {
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
(function wireSidebarToggle(){
  const toggle = document.getElementById('sidebarToggle');
  const root = document.documentElement || document.body;
  const STORAGE_KEY = 'mediaPlayer:sidebarCollapsed';

  function isCollapsed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(_) { return false; }
  }

  function setCollapsed(v, save = true) {
    if (v) {
      root.classList.add('has-sidebar-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded','false');
    } else {
      root.classList.remove('has-sidebar-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded','true');
    }
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch(_) {}
    }
  }

  if (!toggle) return; // nothing to wire

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
