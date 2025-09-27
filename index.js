const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const spinner = document.getElementById("spinner");
const refreshBtn = document.getElementById("refresh");
const folderInput = document.getElementById("folderInput");

// Grid controls
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const orderToggle = document.getElementById("orderToggle");
const densitySlider = document.getElementById("densitySlider");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");

// Hover controls (Settings)
let hoverPreviewsEnabled = false; // playback on hover
let hoverOnDemandEnabled = false; // generation on hover
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

// Simple density configurations: [pageSize, columns, label]
// Just controls how many columns are visible
const densityConfigs = [
  [200, 20, "Tiny"], // 1 - 20 columns (very small tiles)
  [180, 18, "Tiny+"], // 2
  [160, 16, "Small--"], // 3
  [140, 14, "Small-"], // 4
  [120, 12, "Small"], // 5
  [100, 10, "Small+"], // 6
  [90, 9, "Medium--"], // 7
  [80, 8, "Medium-"], // 8
  [70, 7, "Medium"], // 9
  [60, 6, "Medium+"], // 10
  [50, 5, "Large--"], // 11
  [45, 4, "Large-"], // 12 - Default: 4 columns
  [40, 3, "Large"], // 13
  [35, 2, "Large+"], // 14
  [30, 1, "Largest"], // 15 - 1 column (largest tiles)
];

// Compute columns/page-size from currentDensity and set CSS var
function applyColumnsAndComputePageSize() {
  const [, columns] = densityConfigs[currentDensity - 1] || [60, 6];
  document.documentElement.style.setProperty("--columns", String(columns));

  // Estimate rows that fit: tile aspect 16/9 + meta (~54px)
  const gridWidth = grid.clientWidth || window.innerWidth - 128; // margins 64px each side
  const colWidth = Math.max(120, Math.floor(gridWidth / Math.max(1, columns))); // min width safeguard
  const tileHeight = Math.round((colWidth * 9) / 16) + 54; // image + meta
  const usableHeight = Math.max(200, window.innerHeight - 220); // header + controls padding
  const rows = Math.max(2, Math.floor(usableHeight / tileHeight) + 1); // +1 buffer row
  return columns * rows;
}

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
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
const modal = document.createElement("div");
modal.className = "modal";
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
const crumbsEl = modal.querySelector("#crumbs");
const dirlistEl = modal.querySelector("#dirlist");
const chooseBtn = modal.querySelector("#chooseBtn");
const cancelBtn = modal.querySelector("#cancelBtn");
let pickerPath = "";

// Lightweight image modal for previews
const imgModal = document.createElement("div");
imgModal.className = "modal";
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
const imgModalClose = imgModal.querySelector("#imgModalClose");
const imgModalImage = imgModal.querySelector("#imgModalImage");
imgModal.addEventListener("click", (e) => {
  if (e.target === imgModal) {
    imgModal.hidden = true;
  }
});
imgModalClose.addEventListener("click", () => (imgModal.hidden = true));

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

  const imgSrc = v.cover || PLACEHOLDER_IMG;
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
  img.src = imgSrc;
  img.alt = v.title || v.name;
  img.dataset.fallback = PLACEHOLDER_IMG;
  img.onerror = function () {
    this.onerror = null;
    this.src = this.dataset.fallback;
  };

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
      newImg.src = imgSrc;
      newImg.alt = v.title || v.name;
      newImg.dataset.fallback = PLACEHOLDER_IMG;
      newImg.onerror = function () {
        this.onerror = null;
        this.src = this.dataset.fallback;
      };
      video.replaceWith(newImg);
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

refreshBtn.addEventListener("click", loadLibrary);

// Grid control event listeners
searchInput.addEventListener("input", () => {
  currentPage = 1;
  loadLibrary();
});
sortSelect.addEventListener("change", () => {
  currentPage = 1;
  loadLibrary();
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
    hoverOnDemandEnabled = raw ? raw === "1" : false;
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
      const up = document.createElement("div");
      up.className = "dir";
      up.innerHTML = `<div class="icon"></div><div>.. (up)</div>`;
      up.addEventListener("click", () => {
        const segs = path.split("/").filter(Boolean);
        segs.pop();
        goTo(segs.join("/"));
      });
      dirlistEl.appendChild(up);
    }
    dirs.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    for (const d of dirs) {
      const item = document.createElement("div");
      item.className = "dir";
      const name = d.name || String(d);
      const dpath = d.path || (path ? `${path}/${name}` : name);
      item.innerHTML = `<div class="icon"></div><div>${name}</div>`;
      item.addEventListener("click", () => goTo(dpath));
      item.addEventListener("dblclick", () => choose(dpath));
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

    // Create panel
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.role = "tabpanel";
    panel.setAttribute("aria-labelledby", `${tabId}-tab`);
    panel.id = `${tabId}-panel`;
    panel.hidden = true;
    panel.innerHTML = panelContent;
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
  let hasHeatmap = false;
  let subtitlesUrl = null;
  let timelineMouseDown = false;
  // Overlay auto-hide timer
  let overlayHideTimer = null;
  const OVERLAY_FADE_DELAY = 2500; // ms before fading overlay bar
  // Scrubber elements
  let scrubberEl = null,
    scrubberTrackEl = null,
    scrubberProgressEl = null,
    scrubberBufferEl = null,
    scrubberTimeEl = null;
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
    if (videoEl) return; // already
    videoEl = qs("playerVideo");
    titleEl = qs("playerTitle");
    overlayBarEl = qs("playerOverlayBar");
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
    timelineEl = qs("timeline");
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
    btnSetThumb = qs("btnSetThumb");
    btnAddMarker = qs("btnAddMarker");
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

    // Sidebar accordion wiring (id: sidebarAccordion)
    try {
      const accRoot = document.getElementById("sidebarAccordion");
      if (accRoot && !accRoot._wired) {
        accRoot._wired = true;
        const LS_KEY = "mediaPlayer:sidebarCollapsed";
        const loadState = () => {
          try {
            return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
          } catch (_) {
            return {};
          }
        };
        const saveState = (st) => {
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(st));
          } catch (_) {}
        };
        let state = loadState();
        const items = Array.from(accRoot.querySelectorAll(".acc-item"));
        // Initialize panels with animated height
        items.forEach((it) => {
          const hdr = it.querySelector(".acc-header");
          const panel = it.querySelector(".acc-panel");
          if (!hdr || !panel) return;
          const key = it.getAttribute("data-key") || items.indexOf(it);
          const open =
            state[key] !== undefined
              ? !!state[key]
              : hdr.getAttribute("aria-expanded") === "true";
          hdr.setAttribute("aria-expanded", open ? "true" : "false");
          panel.style.display = "block";
          panel.classList.add("anim");
          panel.style.height = "auto";
          const h = panel.scrollHeight;
          panel.style.height = open ? h + "px" : "0px";
          if (!open) panel.style.paddingTop = panel.style.paddingBottom = "0";
          else panel.style.removeProperty("padding-top");
        });
        function closeAll() {
          items.forEach((it) => toggleItem(it, false, true));
          persist();
        }
        function persist() {
          const out = {};
          items.forEach((it) => {
            const key = it.getAttribute("data-key") || items.indexOf(it);
            const hdr = it.querySelector(".acc-header");
            if (hdr) out[key] = hdr.getAttribute("aria-expanded") === "true";
          });
          state = out;
          saveState(state);
        }
        function toggleItem(it, toOpen, instant = false) {
          const hdr = it.querySelector(".acc-header");
          const panel = it.querySelector(".acc-panel");
          if (!hdr || !panel) return;
          const currentlyOpen = hdr.getAttribute("aria-expanded") === "true";
          const target = typeof toOpen === "boolean" ? toOpen : !currentlyOpen;
          if (target === currentlyOpen) return;
          hdr.setAttribute("aria-expanded", target ? "true" : "false");
          panel.style.display = "block";
          panel.classList.add("transitioning");
          const startH = panel.scrollHeight;
          if (target) {
            // Opening: from 0 -> auto height
            panel.style.height = "0px";
            panel.style.paddingTop = "";
            panel.style.paddingBottom = "";
            requestAnimationFrame(() => {
              const fullH = panel.scrollHeight;
              panel.style.height = fullH + "px";
            });
          } else {
            // Closing: from current height -> 0, then hide padding
            panel.style.height = startH + "px";
            requestAnimationFrame(() => {
              panel.style.height = "0px";
              panel.style.paddingTop = panel.style.paddingBottom = "0";
            });
          }
          if (instant) {
            panel.style.transition = "none";
            panel.style.height = target ? panel.scrollHeight + "px" : "0px";
            setTimeout(() => {
              panel.style.transition = "";
              if (!target) panel.style.display = "block";
            }, 0);
          }
          panel.addEventListener(
            "transitionend",
            (ev) => {
              if (ev.propertyName === "height") {
                panel.classList.remove("transitioning");
                if (hdr.getAttribute("aria-expanded") === "true") {
                  panel.style.height = panel.scrollHeight + "px"; // lock
                } else {
                  panel.style.display = "block"; // keep for measurement
                }
              }
            },
            { once: true }
          );
        }
        accRoot.addEventListener("click", (e) => {
          const hdr = e.target.closest(".acc-header");
          if (!hdr) return;
          const item = hdr.parentElement;
          // Modifier click (meta/ctrl) -> close all
          if (e.metaKey || e.ctrlKey || e.altKey) {
            closeAll();
            return;
          }
          const alreadyOpen = hdr.getAttribute("aria-expanded") === "true";
          // True accordion: close others first if opening a new one
          if (!alreadyOpen) {
            items.forEach((it) => {
              if (it !== item) toggleItem(it, false);
            });
          }
          toggleItem(item, !alreadyOpen);
          persist();
        });
        // Double click background area to close all
        accRoot.addEventListener("dblclick", (e) => {
          if (e.target === accRoot) {
            closeAll();
          }
        });
      }
    } catch (_) {}

    // Wire basic events
    if (videoEl) {
      videoEl.addEventListener("timeupdate", () => {
        const t = videoEl.currentTime || 0;
        curEl.textContent = fmtTime(t);
        if (duration > 0) {
          const pct = Math.max(0, Math.min(100, (t / duration) * 100));
          progressEl.style.width = pct + "%";
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
      videoEl.addEventListener("loadedmetadata", () => {
        duration = Number(videoEl.duration) || 0;
        totalEl.textContent = fmtTime(duration);
        syncControls();
        // Attempt restore if we have saved progress
        try {
          const saved = currentPath ? loadProgress(currentPath) : null;
          const override = resumeOverrideTime;
          if (saved && Number.isFinite(saved.t)) {
            const target = Math.max(
              0,
              Math.min(duration || 0, Number(saved.t))
            );
            if (target && Math.abs(target - (videoEl.currentTime || 0)) > 0.5) {
              videoEl.currentTime = target;
            }
            if (saved.rate && Number.isFinite(saved.rate)) {
              videoEl.playbackRate = Number(saved.rate);
            }
            const autoplayResume =
              localStorage.getItem("setting.autoplayResume") === "1";
            if (!(saved.paused || !autoplayResume)) {
              videoEl.play().catch(() => {});
            }
          } else if (override && Number.isFinite(override)) {
            const t = Math.max(0, Math.min(duration || 0, Number(override)));
            if (t && Math.abs(t - (videoEl.currentTime || 0)) > 0.25)
              videoEl.currentTime = t;
            const autoplayResume =
              localStorage.getItem("setting.autoplayResume") === "1";
            if (autoplayResume) videoEl.play().catch(() => {});
          }
          resumeOverrideTime = null;
        } catch (_) {}
      });
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
          if (videoEl.paused) videoEl.play();
          else videoEl.pause();
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
        saveProgress(currentPath, {
          t,
          d: duration,
          paused: videoEl.paused,
          rate: videoEl.playbackRate,
        });
      };
      timelineEl.addEventListener("mousedown", (e) => {
        timelineMouseDown = true;
        seekTo(e);
      });
      window.addEventListener("mousemove", (e) => {
        if (timelineMouseDown) seekTo(e);
      });
      window.addEventListener("mouseup", () => {
        timelineMouseDown = false;
      });
      timelineEl.addEventListener("mouseenter", () => {
        spriteHoverEnabled = true;
      });
      timelineEl.addEventListener("mouseleave", () => {
        spriteHoverEnabled = false;
        hideSprite();
      });
      timelineEl.addEventListener("mousemove", (e) => handleSpriteHover(e));
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
        } catch (e) {
          notify("Failed to set thumbnail", "error");
        }
      });
    }
    // Wire custom controls
    if (btnPlayPause && !btnPlayPause._wired) {
      btnPlayPause._wired = true;
      btnPlayPause.addEventListener("click", () => {
        if (!videoEl) return;
        if (videoEl.paused) videoEl.play();
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
    setTimeout(tryAutoResumeLast, 800); // slight delay to allow initial directory list
  });
  window.addEventListener("beforeunload", () => {
    try {
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
    const onUp = () => {
      scrubberDragging = false;
      if (videoEl && scrubberWasPaused === false) { try { videoEl.play(); } catch(_){} }
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
        try { renderSceneTicks(); } catch(_){}
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
    })();
    wireBadgeActions();
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
        if (!wasPaused) await videoEl.play();
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
    // Remove existing tracks
    Array.from(videoEl.querySelectorAll("track")).forEach((t) => t.remove());
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
    if (!duration || !scenes || scenes.length === 0) return;
    const rect = timelineEl.getBoundingClientRect();
    for (const s of scenes) {
      const t = Math.max(0, Math.min(duration, Number(s.time)));
      const pct = (t / duration) * 100;
      const mark = document.createElement("div");
      mark.style.position = "absolute";
      mark.style.left = `calc(${pct}% - 2px)`;
      mark.style.top = "0";
      mark.style.width = "4px";
      mark.style.height = "100%";
      mark.style.background = "rgba(255,255,255,0.7)";
      mark.style.mixBlendMode = "screen";
      mark.title = fmtTime(t);
      markersEl.appendChild(mark);
    }
  }

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
        const r = await fetch(url.toString(), { method: "POST" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        notify(kind + " generation started", "success");
        setTimeout(() => {
          if (kind === "heatmap") loadHeatmap();
          else if (kind === "scenes") loadScenes();
          else if (kind === "subtitles") loadSubtitles();
          else if (kind === "sprites") loadSprites();
          else if (kind === "faces" || kind === "hover" || kind === "phash")
            loadArtifactStatuses();
        }, 400);
      } catch (e) {
        notify("Failed to start " + kind + " job", "error");
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
    attach(badgeHeatmap, "heatmap");
    attach(badgeScenes, "scenes");
    attach(badgeSubtitles, "subtitles");
    attach(badgeSprites, "sprites");
    attach(badgeFaces, "faces");
    attach(badgeHover, "hover");
    attach(badgePhash, "phash");
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
        if (videoEl.paused) videoEl.play();
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
      if (heatmapEl)
        heatmapEl.style.display = showHeatmap && hasHeatmap ? "" : "none";
      if (heatmapCanvasEl)
        heatmapCanvasEl.style.display = showHeatmap && hasHeatmap ? "" : "none";
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
    state.blur = 0;
    syncInputs();
    applyEffects();
    saveState();
  }
  function syncInputs() {
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) {
        r.value = state[k];
      }
    });
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
    if (!gridEl) return;
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
    updateSelectionUI();
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
      setStatus("Loading…", true);
      const url = new URL("/api/performers", window.location.origin);
      if (searchTerm) url.searchParams.set("search", searchTerm);
      const r = await fetch(url);
      const j = await r.json();
      performers = j?.data?.performers || [];
      setStatus("", false);
      render();
    } catch (e) {
      setStatus("Failed to load performers", true);
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
        await fetch("/api/performers/import", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: txt,
        });
        await fetchPerformers();
      } catch (_) {}
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
      await fetch("/api/performers/import", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: txt,
      });
      await fetchPerformers();
    } catch (_) {}
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
      try {
        let combined = "";
        for (const f of files) {
          try {
            combined += (await f.text()) + "\n";
          } catch (_) {}
        }
        if (combined.trim()) {
          setStatus("Importing…", true);
          await fetch("/api/performers/import", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: combined,
          });
          await fetchPerformers();
          setStatus("Imported performers", true);
          setTimeout(() => setStatus("", false), 1200);
        }
      } catch (err) {
        console.warn("file input import failed", err);
        setStatus("Import failed", true);
        setTimeout(() => setStatus("", false), 1500);
      } finally {
        fileInput.value = "";
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
    fetchPerformers();
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
    banner.innerHTML = "<strong>Tools notice:</strong> " + issues.join(" ");
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
        } catch (_) {
          /* ignore */
        }
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
          this.showNotification("Queued jobs cancelled", "success");
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
        break;
      case "previews":
        params.segments =
          document.getElementById("previewSegments")?.value || 9;
        params.duration =
          document.getElementById("previewDuration")?.value || 1.0;
        break;
      case "heatmaps":
        params.interval = parseFloat( document.getElementById("heatmapInterval")?.value || "5.0" );
        params.mode = document.getElementById("heatmapMode")?.value || "both";
        // default to true PNG generation for better visual feedback
        params.png = true;
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
          this.showNotification("Queued jobs cancelled", "success");
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
    const row = document.createElement("tr");
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
    if (s === "done" || s === "completed") return "completed";
    if (s === "running") return "running";
    if (s === "queued") return "queued";
    if (s === "failed" || s === "error" || s === "errored") return "failed";
    if (s === "canceled" || s === "cancelled" || s === "cancel_requested")
      return "canceled";
    return s || "unknown";
  }

  showErrorModal(message, job) {
    let modal = document.getElementById("errorModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "errorModal";
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:720px;">
          <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <h3 style="margin:0;">Job Error</h3>
            <button class="btn" id="errorModalClose">Close</button>
          </div>
          <pre id="errorModalText" style="white-space:pre-wrap; background:#111; color:#f88; padding:12px; border-radius:6px; max-height:50vh; overflow:auto;"></pre>
        </div>`;
      document.body.appendChild(modal);
      const close = () => {
        modal.hidden = true;
      };
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
      modal.querySelector("#errorModalClose").addEventListener("click", close);
    }
    const pre = modal.querySelector("#errorModalText");
    pre.textContent = message || "Unknown error";
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
          this.showNotification("Job cancelled", "success");
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
      orphanList.innerHTML = this.orphanFiles.length
        ? this.orphanFiles
            .map((file) => `<div class="orphan-file">${file}</div>`)
            .join("")
        : '<div class="orphan-file empty">No orphaned files</div>';
    }
  }

  async previewOrphans() {
    const orphanDetails = document.getElementById("orphanDetails");
    const orphanList = document.getElementById("orphanList");
    if (!orphanDetails || !orphanList) return;
    const btn = document.getElementById("previewOrphansBtn");
    const isHidden = orphanDetails.classList.contains("d-none");
    if (isHidden) {
      // Show
      orphanList.innerHTML = this.orphanFiles.length
        ? this.orphanFiles
            .map((file) => `<div class="orphan-file">${file}</div>`)
            .join("")
        : '<div class="orphan-file empty">No orphaned files</div>';
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
