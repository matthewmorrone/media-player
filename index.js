// Inlined utilities (merged from utils.js)
// Keep this section free of app-specific state; pure or narrowly scoped helpers only.

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
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
  let h = 0;
  let m = 0;
  let s = 0;

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
  el.style.removeProperty('display');
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
  return !el || el.classList.contains('hidden') || el.classList.contains('d-none') || el.hasAttribute('hidden');
}

function enhanceSegmentedSelect(select, opts = {}) {
  if (!select || select._segmentedInit) return null;
  const options = Array.from(select.options || []);
  if (!options.length) return null;
  select._segmentedInit = true;
  const labelText = opts.label || select.dataset.segmentedLabel || select.getAttribute('aria-label') || select.name || 'Options';
  select.classList.add('sr-only');
  select.setAttribute('aria-hidden', 'true');
  select.setAttribute('tabindex', '-1');
  const control = document.createElement('div');
  control.className = 'segmented-control';
  control.setAttribute('role', 'group');
  if (labelText) control.setAttribute('aria-label', labelText);
  if (select.id) control.dataset.segmentedFor = select.id;
  const buttons = [];
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmented-control__btn';
    btn.dataset.value = opt.value;
    btn.textContent = opt.dataset.chip || opt.textContent.trim();
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (select.disabled || opt.disabled) return;
      if (select.value === opt.value) return;
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    control.appendChild(btn);
    buttons.push(btn);
  });
  select.insertAdjacentElement('afterend', control);
  const sync = () => {
    const current = select.value;
    buttons.forEach((btn) => {
      const active = btn.dataset.value === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.disabled = Boolean(select.disabled);
      if (btn.disabled) btn.removeAttribute('tabindex');
    });
    control.classList.toggle('is-disabled', Boolean(select.disabled));
  };
  select._segmentedSync = sync;
  const proto = Object.getPrototypeOf(select);
  const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && !select._segmentedValuePatched && typeof desc.get === 'function' && typeof desc.set === 'function') {
    Object.defineProperty(select, 'value', {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return desc.get.call(this);
      },
      set(v) {
        const prev = desc.get.call(this);
        desc.set.call(this, v);
        if (prev !== v && typeof this._segmentedSync === 'function') {
          this._segmentedSync();
        }
      },
    });
    select._segmentedValuePatched = true;
  }
  select.addEventListener('change', sync);
  const observer = new MutationObserver(sync);
  observer.observe(select, { attributes: true, attributeFilter: ['disabled'] });
  select._segmentedObserver = observer;
  sync();
  return control;
}

function bootstrapSegmentedFilters() {
  const targets = [
    { id: 'resSelect', label: 'Resolution filter' },
    { id: 'sortSelect', label: 'Library sort' },
    { id: 'performerImageFilter', label: 'Performer image filter' },
    { id: 'performerFaceFilter', label: 'Performer face filter' },
    { id: 'performerSort', label: 'Performer sort' },
  ];
  targets.forEach((cfg) => {
    const el = document.getElementById(cfg.id);
    if (el) enhanceSegmentedSelect(el, cfg);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapSegmentedFilters, { once: true });
}
else {
  bootstrapSegmentedFilters();
}

function getOpenModals() {
  try {
    return Array.from(document.querySelectorAll('.modal')).filter((modal) => !isHidden(modal));
  }
  catch (_) {
    return [];
  }
}

function requestModalClose(modal, reason = 'manual') {
  if (!modal) return false;
  let evt = null;
  evt = new CustomEvent('modal:requestClose', {
    cancelable: true,
    detail: { reason },
  });
  modal.dispatchEvent(evt);
  if (!evt || !evt.defaultPrevented) {
    hide(modal);
  }
  return true;
}

function closeTopmostModal(reason = 'manual') {
  const open = getOpenModals().filter((modal) => String(modal?.dataset?.escDisabled) !== '1');
  if (!open.length) return false;
  const modal = open[open.length - 1];
  requestModalClose(modal, reason);
  return true;
}

function wireBackdrop(modal) {
  if (!modal || modal.__backdropWired) return;
  modal.__backdropWired = true;
  modal.addEventListener('click', (event) => {
    if (event.target !== modal) return;
    requestModalClose(modal, 'backdrop');
  });
}

document.addEventListener('keydown', (event) => {
  const key = event.key || event.code;
  if (key !== 'Escape' && key !== 'Esc') return;
  if (closeTopmostModal('escape')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true });

function showMessageModal(message, opts = {}) {
  const modal = document.getElementById('messageModal');
  if (!modal) throw new Error('messageModal element missing');
  const titleEl = document.getElementById('messageModalTitle');
  const bodyEl = document.getElementById('messageModalBody');
  const closeBtn = document.getElementById('messageModalClose');
  const okBtn = document.getElementById('messageModalOk');
  if (titleEl && opts.title) titleEl.textContent = opts.title;
  if (bodyEl) bodyEl.textContent = message || '';
  const close = () => {
    hide(modal);
  };
  if (closeBtn && !closeBtn._wired) {
    closeBtn._wired = true;
    closeBtn.addEventListener('click', close);
  }
  if (okBtn && !okBtn._wired) {
    okBtn._wired = true;
    okBtn.addEventListener('click', close);
  }
  if (!modal._bgWired) {
    modal._bgWired = true;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }
  if (!modal._escWire) {
    modal._escWire = true;
    modal.addEventListener('modal:requestClose', (ev) => {
      ev.preventDefault();
      close();
    });
  }
  show(modal);
}

(function wireErrorModal() {
  const modal = document.getElementById('errorModal');
  if (!modal || modal._escWire) return;
  const closeBtn = document.getElementById('errorModalClose');
  const close = () => hide(modal);
  if (closeBtn && !closeBtn._wired) {
    closeBtn._wired = true;
    closeBtn.addEventListener('click', close);
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  modal.addEventListener('modal:requestClose', (ev) => {
    ev.preventDefault();
    close();
  });
  modal._escWire = true;
})();

function isAbsolutePath(p) {
  if (!p) return false;
  return p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:[\\/]/.test(p);
}

function notify(message, type = 'info') {
  if (window.tasksManager && typeof window.tasksManager.showNotification === 'function') {
    window.tasksManager.showNotification(message, type);
    return;
  }
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
  const lifespan = 5000;
  const fadeMs = 250;
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), fadeMs + 30);
  }, lifespan - fadeMs);
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
        try {
          return JSON.parse(raw);
        }
        catch (_) {
          return fallback;
        }
      case 'bool':
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
        return fallback;
      case 'number': {
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
      }
      default: {
        return raw;
      }
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
      case 'json':
        stored = JSON.stringify(value);
      break;
      case 'bool':
        stored = value ? '1' : '0';
      break;
      case 'number':
        stored = Number.isFinite(value) ? String(value) : '0';
      break;
      case 'string':
      default:
        stored = value == null ? '' : String(value);
      break;
    }
    localStorage.setItem(key, stored);
    return true;
  }
  catch (_) {
    return false;
  }
}

function lsKeysWithPrefix(prefix) {
  const out = [];
  for (let i = 0;
    i < localStorage.length;
    i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  }
  catch (_) {
    return false;
  }
}
function lsRemovePrefix(prefix) {
  lsKeysWithPrefix(prefix).forEach((k) => lsRemove(k));
}

function getLocalStorageJSON(key, fallback = null) {
  return getLocalStorageItem(key, { type: 'json', fallback });
}
function setLocalStorageJSON(key, value) {
  return setLocalStorageItem(key, value, { type: 'json' });
}
function getLocalStorageBoolean(key, fallback = false) {
  return getLocalStorageItem(key, { type: 'bool', fallback });
}
function setLocalStorageBoolean(key, value) {
  return setLocalStorageItem(key, value, { type: 'bool' });
}

// Global drag/drop interception guard
let __dropInterceptSuspended = false;
function setDropInterceptSuspended(state) {
  __dropInterceptSuspended = Boolean(state);
  const body = document.body;
  if (body) body.classList.toggle('drop-intercept-suspended', __dropInterceptSuspended);
}
function isDropInterceptSuspended() {
  return __dropInterceptSuspended;
}

function loadToggleSetting(name, defaultValue = false) {
  try {
    const raw = getLocalStorageItem(`setting.${name}`);
    if (raw == null) return defaultValue;
    return raw === '1';
  }
  catch (_) {
    return defaultValue;
  }
}
function saveToggleSetting(name, value) {
  setLocalStorageItem(`setting.${name}`, value ? '1' : '0');
}
// Attach to window for any legacy non-module access patterns (defensive)
window.loadToggleSetting = window.loadToggleSetting || loadToggleSetting;
window.saveToggleSetting = window.saveToggleSetting || saveToggleSetting;

function devLog(level, scope, ...args) {
  const validLevels = new Set(['debug', 'info', 'warn', 'error', 'log']);
  let lv = typeof level === 'string' ? level.toLowerCase() : 'log';
  let rest = Array.isArray(args) ? args.slice() : [];
  let sc = scope;
  if (!validLevels.has(lv)) {
    if (typeof scope !== 'undefined') rest.unshift(scope);
    if (typeof level !== 'undefined') rest.unshift(level);
    sc = 'app';
    lv = 'log';
  }
  if (typeof sc !== 'string' || !sc.trim() || /\s/.test(sc)) {
    if (typeof sc !== 'undefined') rest.unshift(sc);
    sc = 'app';
  }
  else {
    const trimmed = sc.trim();
    const cleaned = trimmed
      .replace(/^\[/, '')
      .replace(/]$/, '');
    sc = cleaned || 'app';
  }
  rest = rest.filter((entry) => typeof entry !== 'undefined');
  let enabled = false;
  try {
    if (typeof window !== 'undefined') {
      const hasUrlDebug = /(^|[?&#])debug=1(?!\d)/.test(window.location.search) || /(^|[?&#])debug=1(?!\d)/.test(window.location.hash);
      if (hasUrlDebug && !window.__DEBUG_LOGS) {
        window.__DEBUG_LOGS = true;
        localStorage.setItem('setting.debugLogs', '1');
      }
      enabled = Boolean(window.__DEBUG_LOGS) || loadToggleSetting('debugLogs', false);
    }
  }
  catch (_) {
    enabled = false;
  }
  if (!enabled && lv !== 'error') return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${sc || 'app'}]`;
  if (lv === 'debug' && console.debug) return console.debug(prefix, ...rest);
  if (lv === 'info' && console.info) return console.info(prefix, ...rest);
  if (lv === 'warn' && console.warn) return console.warn(prefix, ...rest);
  if (lv === 'error' && console.error) return console.error(prefix, ...rest);
  return console.log(prefix, ...rest);
}
// Suppress console errors for expected 404s on thumbnail/artifact requests
// This prevents browser noise when thumbnails or media info don't exist yet
(function suppressExpected404s() {
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const message = args.join(' ');
    // Skip logging 404 errors for expected missing artifacts
    if (message.includes('404') && (
      message.includes('/api/thumbnail') || message.includes('/api/media/info') || message.includes('/files/') || message.includes('Failed to load resource')
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
(function suppress3pFocusErrors() {
  const isKnownExtError = (message, source) => {
    const msg = String(message || '').toLowerCase();
    const src = String(source || '').toLowerCase();
    // Some extensions throw when reading element.control on focusin
    // Loosen match to message only so we catch Promise rejections too
    return msg.includes("reading 'control'");
  };
  window.addEventListener('error', (e) => {
    if (isKnownExtError(e?.message, e?.filename)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e && e.reason;
    const msg = reason && (reason.message || String(reason));
    const src = reason && (reason.fileName || reason.sourceURL || reason.stack || '');
    if (isKnownExtError(msg, src)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of Array.from(m.addedNodes || [])) {
        if (n && n.nodeType === 1) {
          const el = n;
          if (el.classList && el.classList.contains('modal')) wireBackdrop(el);
          el.querySelectorAll && el.querySelectorAll('.modal').forEach(wireBackdrop);
        }
      }
    }
  });
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  window.__modalDismissObserver = mo;
})();
// Lightweight no-op placeholders to avoid no-undef when optional helpers are not wired
const loadArtifactStatuses = (..._args) => {};
const refreshSidebarThumbnail = (..._args) => {};
// Default SSE to unavailable until /config explicitly enables it (prevents 404 probes)
if (typeof window !== 'undefined') window.__JOBS_SSE_UNAVAILABLE = true;

// ============================================================
// Network Request Logging & Tracking
// ============================================================
(function initNetworkLogging() {
  // Track call counts per endpoint
  window.__networkCallCounts = window.__networkCallCounts || {};
  window.__networkTotalCalls = window.__networkTotalCalls || 0;

  // Intercept native fetch
  const nativeFetch = window.fetch;
  window.fetch = function(...args) {
    const [resource, options = {}] = args;
    // Derive URL safely. Only log/track if resource is a string or URL instance.
    const method = options.method || 'GET';
    let url = null;
    if (typeof resource === 'string') {
      url = resource;
    }
    else if (resource instanceof URL) {
      url = resource.toString();
    }
    else if (resource && typeof resource === 'object' && typeof resource.url === 'string') {
      // Some Request-like objects expose a url property
      url = resource.url;
    }

    if (!url) {
      // Invalid / non-standard fetch target (e.g., Request object without url yet). Don't mutate, just pass through.
      return nativeFetch.apply(this, args);
    }

    if (url === 'undefined') {
      // Explicit undefined string – treat as invalid and pass through without attempting to normalize.
      devLog('error', 'Fetch', 'Undefined URL string passed to fetch. skipping logging.');
      return nativeFetch.apply(this, args);
    }

    // Extract endpoint (pathname only, without query params for cleaner grouping)
    let endpoint = url;
    try {
      const urlObj = new URL(url, window.location.origin);
      endpoint = urlObj.pathname;
    }
    catch (_) {
      // If URL parsing fails, use as-is (best effort)
      try {
        endpoint = String(url).split('?')[0];
      }
      catch (__) {
        endpoint = String(url);
      }
    }

    // Track call count
    const key = `${method} ${endpoint}`;
    window.__networkCallCounts[key] = (window.__networkCallCounts[key] || 0) + 1;
    window.__networkTotalCalls++;

    // Extract payload
    let payload = null;
    if (options.body) {
      try {
        payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      }
      catch (_) {
        payload = options.body;
      }
    }

    const logEntry = {
      method,
      endpoint,
      fullUrl: url !== endpoint ? url : undefined,
      perEndpointCall: window.__networkCallCounts[key],
      totalCalls: window.__networkTotalCalls,
    };
    if (payload) logEntry.payload = payload;
    if (options.headers && Object.keys(options.headers).length > 0) logEntry.headers = options.headers;
    devLog('debug', 'Fetch', 'request', logEntry);

    // Call original fetch
    return nativeFetch.apply(this, args);
  };

  devLog('info', 'Fetch', 'Network logging enabled');
})();

// Global lightweight metadata cache used across views (List, chips, etc.)
// Returns parsed metadata JSON for a file or null. Caches responses and in-flight requests.
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
        delete window.__metadataInflight[path];
        return d;
      });
    window.__metadataInflight[path] = p;
    return p;
  }
  catch (_) {
    return Promise.resolve(null);
  }
}

// Lightweight /api/media/info cache so repeated lookups for tags/performers avoid duplicate requests
async function fetchMediaInfoCached(path) {
  try {
    if (!path) return null;
    window.__mediaInfoCache = window.__mediaInfoCache || {};
    window.__mediaInfoInflight = window.__mediaInfoInflight || {};
    if (window.__mediaInfoCache[path]) return window.__mediaInfoCache[path];
    if (window.__mediaInfoInflight[path]) return window.__mediaInfoInflight[path];
    const u = new URL('/api/media/info', window.location.origin);
    u.searchParams.set('path', path);
    const p = fetch(u.toString(), { headers: { Accept: 'application/json' } })
      .then((resp) => resp.ok ? resp.json() : null)
      .then((json) => {
        const data = json?.data || json || null;
        if (data) window.__mediaInfoCache[path] = data;
        return data;
      })
      .catch(() => null)
      .then((data) => {
        delete window.__mediaInfoInflight[path];
        return data;
      });
    window.__mediaInfoInflight[path] = p;
    return p;
  }
  catch (_) {
    return null;
  }
}

async function fetchMediaInfoBulk(paths = [], opts = {}) {
  try {
    const unique = Array.from(new Set((paths || []).filter(Boolean)));
    if (!unique.length) return [];
    window.__mediaInfoCache = window.__mediaInfoCache || {};
    const cached = [];
    const missing = [];
    unique.forEach((path) => {
      const hit = window.__mediaInfoCache[path];
      if (hit) cached.push(hit);
      else missing.push(path);
    });
    const results = [...cached];
    const chunkSize = Math.max(1, Number(opts.chunkSize) || 100);
    const includeSidecar = opts.includeSidecar !== undefined ? Boolean(opts.includeSidecar) : false;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const slice = missing.slice(i, i + chunkSize);
      if (!slice.length) continue;
      const resp = await fetch('/api/media/info/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: slice, include_sidecar: includeSidecar }),
      });
      if (!resp.ok) continue;
      const json = await resp.json().catch(() => null);
      const rows = Array.isArray(json?.data?.items) ? json.data.items : (Array.isArray(json?.items) ? json.items : []);
      rows.forEach((row) => {
        if (!row || !row.path) return;
        window.__mediaInfoCache[row.path] = row;
        results.push(row);
      });
    }
    return results;
  }
  catch (_) {
    return [];
  }
}

// Shared registry loader with caching + inflight coalescing for performers/tags
const REGISTRY_ENDPOINTS = {
  performers: '/api/registry/performers',
  tags: '/api/registry/tags',
};

function getRegistryEntries(kind) {
  try {
    window.__REG = window.__REG || {};
    const data = window.__REG[kind];
    return Array.isArray(data) ? data : [];
  }
  catch (_) {
    return [];
  }
}

async function loadRegistry(kind) {
  try {
    window.__REG = window.__REG || {};
    window.__REG_PROMISES = window.__REG_PROMISES || {};
    window.__REG_STATE = window.__REG_STATE || {};
    if (window.__REG_STATE[kind] === 'loaded') {
      return getRegistryEntries(kind);
    }
    if (window.__REG_PROMISES[kind]) {
      return window.__REG_PROMISES[kind];
    }
    const endpoint = REGISTRY_ENDPOINTS[kind];
    if (!endpoint) return getRegistryEntries(kind);
    const p = fetch(endpoint)
      .then((resp) => resp.ok ? resp.json() : null)
      .then((json) => {
        const arr = Array.isArray(json?.data?.[kind]) ? json.data[kind] : (Array.isArray(json?.[kind]) ? json[kind] : []);
        window.__REG[kind] = Array.isArray(arr) ? arr : [];
        window.__REG_STATE[kind] = 'loaded';
        return getRegistryEntries(kind);
      })
      .catch(() => {
        window.__REG[kind] = [];
        window.__REG_STATE[kind] = 'loaded';
        return getRegistryEntries(kind);
      })
      .finally(() => {
        delete window.__REG_PROMISES[kind];
      });
    window.__REG_PROMISES[kind] = p;
    return p;
  }
  catch (_) {
    return [];
  }
}

async function loadRegistries(kinds = ['performers', 'tags']) {
  const uniq = Array.from(new Set((kinds || []).filter(Boolean)));
  if (!uniq.length) return {};
  await Promise.all(uniq.map((kind) => loadRegistry(kind)));
  const out = {};
  for (const kind of uniq) {
    out[kind] = getRegistryEntries(kind);
  }
  return out;
}

// Local slugify for tag/name normalization where needed
const _slugify = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/\s+/g, '-');

function _slugifyName(name) {
  try {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  catch (_) {
    return '';
  }
}

function guessPerformerImagePath(name) {
  const slug = _slugifyName(name);
  if (!slug) return '';
  return `/files/.artifacts/performers/${slug}/${slug}.jpg`;
}

const EDGE_WIDTH_PRESETS = {
  graph(count) {
    const n = Math.max(1, Number(count) || 1);
    return Math.max(1, Math.min(8, 1 + Math.log2(1 + n)));
  },
  connections(count) {
    const n = Math.max(0, Number(count) || 0);
    const width = 1.5 + Math.min(10, n) * 0.85;
    return Number(width.toFixed(2));
  },
};

function edgeWidthForCount(count, preset = 'graph') {
  const fn = EDGE_WIDTH_PRESETS[preset] || EDGE_WIDTH_PRESETS.graph;
  return fn(count);
}

// Local toast helper: prefer existing window.showToast if present, otherwise use notify()
const legacyShowToast = (typeof window !== 'undefined' && typeof window.showToast === 'function') ? window.showToast : null;
const showToast = (message, type) => {
  if (legacyShowToast) {
    legacyShowToast(message, type || 'is-info');
  }
  else {
    const map = { 'is-error': 'error', 'is-success': 'success' };
    notify(message, map[type] || 'info');
  }
};
if (typeof window !== 'undefined' && typeof window.showToast !== 'function') {
  window.showToast = (message, type) => showToast(message, type);
}
const grid = document.getElementById('grid');
devLog('info', 'app', 'script loaded build=reset-debug-1', {ts: Date.now()});
// Artifact filters state is consumed before the deferred library setup runs, so declare early.
let libraryArtifactFilters = {};

// Artifact Filters Popover (Library Grid)
(function wireArtifactFiltersUI() {
  const btn = document.getElementById('artifactFiltersBtn');
  const menu = document.getElementById('artifactFiltersMenu');
  const menuBody = document.getElementById('artifactFilterMenuBody');
  const rowTemplate = document.getElementById('artifactFilterRowTemplate');
  const applyBtn = document.getElementById('artifactFiltersApplyBtn');
  const clearBtn = document.getElementById('artifactFiltersClearBtn');
  if (!btn || !menu || !menuBody || !rowTemplate || !applyBtn || !clearBtn) return;
  // @todo copilot redundant
  const artDefs = [
    ['metadata', 'Metadata'],
    ['thumbnail', 'Thumbnail'],
    ['sprites', 'Sprites'],
    ['markers', 'Scenes'],
    ['subtitles', 'Subtitles'],
    ['heatmaps', 'Heatmaps'],
    ['faces', 'Faces'],
    ['preview', 'Preview'],
  ];
  const renderRows = () => {
    menuBody.innerHTML = '';
    artDefs.forEach(([key, label]) => {
      const frag = rowTemplate.content.cloneNode(true);
      const nameEl = frag.querySelector('.artifact-filter-name');
      const selectEl = frag.querySelector('.artifact-filter-select');
      if (nameEl) nameEl.textContent = label;
      if (selectEl) {
        selectEl.dataset.key = key;
        const current = libraryArtifactFilters[key];
        selectEl.value = current === true ? 'yes' : current === false ? 'no' : '';
      }
      menuBody.appendChild(frag);
    });
  };
  const collectSelections = () => {
    const selections = {};
    const selects = menu.querySelectorAll('.artifact-filter-select');
    selects.forEach((select) => {
      const key = select.dataset.key;
      if (!key) return;
      if (select.value === 'yes') selections[key] = true;
      else if (select.value === 'no') selections[key] = false;
    });
    return selections;
  };
  const applyFilters = async (nextFilters) => {
    libraryArtifactFilters = nextFilters;
    saveLibraryArtifactFilters(libraryArtifactFilters);
    hideMenu();
    currentPage = 1;
    await loadLibrary();
    renderArtifactFilterChips();
  };
  const positionMenu = () => {
    const br = btn.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    menu.style.left = (br.left + scrollX) + 'px';
    menu.style.top = (br.bottom + scrollY + 6) + 'px';
  };
  const showMenu = () => {
    renderRows();
    positionMenu();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', onDocumentClick, true), 0);
  };
  function hideMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocumentClick, true);
  }
  const onDocumentClick = (event) => {
    if (menu.contains(event.target) || event.target === btn) return;
    hideMenu();
  };
  clearBtn.addEventListener('click', async () => {
    await applyFilters({});
  });
  applyBtn.addEventListener('click', async () => {
    const selections = collectSelections();
    await applyFilters(selections);
  });
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    if (menu.hidden) showMenu();
    else hideMenu();
  });
})();

// Render artifact filter chips next to Artifacts button
function renderArtifactFilterChips() {
  const host = document.getElementById('artifactFilterChips');
  const tpl = document.getElementById('artifactFilterChipTemplate');
  if (!host || !tpl) return;
  host.innerHTML = '';
  const labels = {
    metadata: 'Metadata',
    thumbnail: 'Thumbnail',
    sprites: 'Sprites',
    markers: 'Scenes',
    subtitles: 'Subtitles',
    heatmaps: 'Heatmaps',
    faces: 'Faces',
    preview: 'Preview',
  };
  const entries = Object.entries(libraryArtifactFilters || {}).filter(([k, v]) => v === true || v === false);
  if (!entries.length) {
    host.hidden = true;
    return;
  }
  entries.forEach(([k, v]) => {
    const fragment = tpl.content.cloneNode(true);
    const chip = fragment.querySelector('.chip');
    const labelEl = fragment.querySelector('.artifact-filter-chip-label');
    const removeBtn = fragment.querySelector('.artifact-filter-chip-remove');
    const friendly = labels[k] || k;
    if (labelEl) labelEl.textContent = `${friendly}:${v ? 'Y' : 'N'}`;
    if (chip) {
      chip.title = v ? (`Has ${friendly}`) : (`Missing ${friendly}`);
      chip.addEventListener('click', (event) => {
        if (event.target && event.target.closest('.artifact-filter-chip-remove')) return;
        event.preventDefault();
        const trigger = document.getElementById('artifactFiltersBtn');
        if (trigger) trigger.click();
      });
    }
    if (removeBtn) {
      removeBtn.setAttribute('aria-label', 'Remove ' + friendly + ' artifact filter');
      removeBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        delete libraryArtifactFilters[k];
        saveLibraryArtifactFilters(libraryArtifactFilters);
        currentPage = 1;
        await loadLibrary();
        renderArtifactFilterChips();
      });
    }
    host.appendChild(fragment);
  });
  const clearFragment = tpl.content.cloneNode(true);
  const clearChip = clearFragment.querySelector('.chip');
  const clearLabel = clearFragment.querySelector('.artifact-filter-chip-label');
  const clearBtn = clearFragment.querySelector('.artifact-filter-chip-remove');
  if (clearChip) {
    clearChip.classList.add('chip--clear');
    clearChip.title = 'Clear all artifact filters';
  }
  if (clearLabel) clearLabel.textContent = 'Clear Artifacts';
  if (clearBtn) {
    clearBtn.setAttribute('aria-label', 'Clear all artifact filters');
    clearBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      libraryArtifactFilters = {};
      saveLibraryArtifactFilters(libraryArtifactFilters);
      currentPage = 1;
      await loadLibrary();
      renderArtifactFilterChips();
    });
  }
  host.appendChild(clearFragment);
  host.hidden = false;
}
renderArtifactFilterChips();

// --------------------------------------------------
// Global Player Reset (moved to top-level so it's definitely defined & wired)
// --------------------------------------------------
function resetPlayer(opts = {}) {
  try {
    devLog('info', 'player', 'resetPlayer invoked', {opts});
    const vid = document.getElementById('playerVideo');
    if (vid) {
      vid.pause();
      vid.currentTime = 0;
      if (opts.unload !== false) {
        try {
          vid.removeAttribute('src');
          vid.load();
          devLog('debug', 'player', 'video src removed. currentSrc after load()', {currentSrc: vid.currentSrc});
        }
        catch (e) {
          devLog('warn', '[resetPlayer] error unloading video', e);
        }
      }
    }
    // Remove transient preview videos
    document.querySelectorAll('.tile video.preview-video').forEach((v) => {
      v.pause();
      v.remove();
    });
    const titleEl = document.getElementById('playerTitle');
    if (titleEl) titleEl.textContent = '';
    const overlayBar = document.getElementById('playerOverlayBar');
    if (overlayBar) overlayBar.dataset.empty = '1';
    const markersHost = document.getElementById('timelineMarkers');
    if (markersHost) {
      markersHost.innerHTML = '';
      markersHost.setAttribute('aria-hidden', 'true');
    }
    const heatEl = document.getElementById('timelineHeatmap');
    if (heatEl) {
      heatEl.innerHTML = '';
      heatEl.setAttribute('aria-hidden', 'true');
      heatEl.style.backgroundImage = '';
    }
    const heatCanvas = document.getElementById('timelineHeatmapCanvas');
    if (heatCanvas && typeof heatCanvas.getContext === 'function') {
      const ctx = heatCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, heatCanvas.width || 0, heatCanvas.height || 0);
      heatCanvas.setAttribute('aria-hidden', 'true');
    }
    const scrubberProgress = document.getElementById('playerScrubberProgress');
    if (scrubberProgress) scrubberProgress.style.width = '0%';
    const scrubberBuffer = document.getElementById('playerScrubberBuffer');
    if (scrubberBuffer) scrubberBuffer.style.width = '0%';
    const scrubberHandle = document.querySelector('.scrubber-handle');
    if (scrubberHandle) scrubberHandle.style.left = '0%';
    const subtitleOverlay = document.getElementById('subtitleOverlay');
    if (subtitleOverlay) {
      subtitleOverlay.textContent = '';
      subtitleOverlay.hidden = true;
    }
    const spritePreview = document.getElementById('spritePreview');
    if (spritePreview) spritePreview.style.display = 'none';
    if (selectedItems && selectedItems.size) selectedItems.clear();
    if (typeof updateSelectionUI === 'function') updateSelectionUI();
    if (typeof lastSelectedPath !== 'undefined') lastSelectedPath = null;
    document.querySelectorAll('.card .card-checkbox.checked').forEach((cb) => cb.classList.remove('checked'));
    const selectionBarEl = typeof selectionBar !== 'undefined' ? selectionBar : document.getElementById('selectionBar');
    if (selectionBarEl) selectionBarEl.hidden = true;
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
    playerResetSuppressAutoResumeUntil = Date.now() + 1500;
    devLog('debug', 'player', 'suppression window set', {until: playerResetSuppressAutoResumeUntil});
    // Purge persisted last video so a full page refresh doesn't auto-load it again
    try {
      localStorage.removeItem('mediaPlayer:last');
      localStorage.removeItem('mediaPlayer:lastVideo'); // legacy key
      // Optionally also remove per-video progress for the video we just cleared
      if (typeof currentPath === 'string' && currentPath) {
        localStorage.removeItem('mediaPlayer:video:' + currentPath);
      }
      // Set an explicit one-shot skip flag that survives a reload exactly once
      localStorage.setItem('mediaPlayer:skipSaveOnUnload', '1');
      devLog('info', 'player', 'cleared last video persistence + set skip flag');
    }
    catch (e) {
      devLog('warn', '[resetPlayer] failed clearing last video keys', e);
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
// Removed delegated document-level reset handler to prevent double-fire
window.resetPlayer = resetPlayer;
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
function applyVideoAdjustments() {
  const v = document.getElementById('playerVideo');
  if (!v) return;
  const {brightness, contrast, saturation, hue} = adjState;
  v.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`;
}
function persistAdjustments() {
  setLocalStorageJSON(ADJ_LS_KEY, adjState);
}
function updateAdjUI(fromLoad = false) {
  if (adjBrightness) adjBrightness.value = String(adjState.brightness);
  if (adjContrast) adjContrast.value = String(adjState.contrast);
  if (adjSaturation) adjSaturation.value = String(adjState.saturation);
  if (adjHue) adjHue.value = String(adjState.hue);
  if (adjVals.brightness) adjVals.brightness.textContent = adjState.brightness.toFixed(2) + 'x';
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
  const v = document.getElementById('playerVideo');
  if (v && !v._adjMetadataWired) {
    v._adjMetadataWired = true;
    v.addEventListener('loadedmetadata', () => applyVideoAdjustments());
  }
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
// Artifact presence filters for grid (Yes/No). Keys map to server artifact flags.
const LIB_ART_FILTERS_LS_KEY = 'library.artifact.filters.v1';
libraryArtifactFilters = (() => {
  try {
    const raw = getLocalStorageJSON(LIB_ART_FILTERS_LS_KEY, {}) || {};
    const cleaned = {};
    let mutated = false;
    Object.entries(raw).forEach(([k, v]) => {
      const canon = normalizeArtifactKey(k);
      if (!canon) {
        mutated = true;
        return;
      }
      cleaned[canon] = v;
      if (canon !== k) mutated = true;
    });
    if (mutated) {
      setLocalStorageJSON(LIB_ART_FILTERS_LS_KEY, cleaned);
    }
    return cleaned;
  }
  catch (_) {
    return {};
  }
})();
function saveLibraryArtifactFilters(obj) {
  setLocalStorageJSON(LIB_ART_FILTERS_LS_KEY, obj || {});
}
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
if (imgModal) {
  imgModal.addEventListener('modal:requestClose', (ev) => {
    ev.preventDefault();
    hide(imgModal);
  });
}
// (fmtSize moved to utils.js)
// Ensure a preview artifact exists for a video record;
// returns a blob URL or empty string.
async function ensurePreview(v) {
  const path = (v && (v.path || v.name)) || '';
  if (!path) return '';
  if (v && v.preview_url) return v.preview_url;

  const qp = encodeURIComponent(path);
  const preferredFmt = 'mp4';
  const fetchPreviewBlob = async (bypassCache = false) => {
    try {
      const cacheBust = bypassCache ? `&cb=${Date.now()}` : '';
      const resp = await fetch(`/api/preview?path=${qp}&fmt=${encodeURIComponent(preferredFmt)}${cacheBust}`, { cache: 'no-store' });
      if (!resp.ok) return '';
      const blob = await resp.blob();
      if (!blob || !blob.size) return '';
      const obj = URL.createObjectURL(blob);
      v.preview_url = obj;
      return obj;
    }
    catch (_) {
      return '';
    }
  };

  const existing = await fetchPreviewBlob();
  if (existing) return existing;
  if (!previewOnDemandEnabled) return '';

  window.__previewInflight = window.__previewInflight || Object.create(null);
  if (window.__previewInflight[path]) return window.__previewInflight[path];

  const inflightPromise = (async () => {
    const card = document.querySelector(`.card[data-path="${path}"]`);
    if (card) card.classList.add('preview-generating');
    try {
      await fetch(`/api/preview?path=${qp}`, { method: 'POST' }).catch(() => null);
      const deadline = Date.now() + 12000;
      const backoffSeq = [600, 900, 1300, 1800, 2200];
      let attempt = 0;
      while (Date.now() < deadline) {
        if (card && (!card.isConnected || !card._previewing || document.hidden)) break;
        const sleepMs = backoffSeq[Math.min(attempt, backoffSeq.length - 1)];
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
        const refreshed = await fetchPreviewBlob(true);
        if (refreshed) return refreshed;
      }
      return '';
    }
    catch (_) {
      return '';
    }
    finally {
      if (card) card.classList.remove('preview-generating');
      delete window.__previewInflight[path];
    }
  })();

  window.__previewInflight[path] = inflightPromise;
  return inflightPromise;
}
// (fmtDuration moved to utils.js)
// Clean up any existing preview videos except an optional tile we want to keep active
function stopAllTilePreviews(exceptTile) {
  const tiles = document.querySelectorAll('.card');
  tiles.forEach((t) => {
    if (exceptTile && t === exceptTile) return;
    const video = t.querySelector('video.preview-video');
    if (video) {
      video.pause();
      video.src = '';
      video.load();
      video.remove();
    }
    t._previewing = false;
    t._previewToken = (t._previewToken || 0) + 1;
    if (t._previewTimer) {
      clearTimeout(t._previewTimer);
      t._previewTimer = null;
    }
  });
}
function videoCard(v) {
  const template = document.getElementById('cardTemplate');
  const el = template.content.cloneNode(true).querySelector('.card');
  // Resolve thumbnail URL: prefer payload-provided URL; fall back to canonical endpoint
  // Filter out undefined/null values explicitly
  const thumbUrl = v?.thumbnail ?? v?.thumb ?? v?.thumbnail_url;
  const imgSrc = (thumbUrl && thumbUrl !== 'undefined') ? thumbUrl : (v && v.path ? `/api/thumbnail?path=${encodeURIComponent(v.path)}` : '');
  // Duration/size: accept multiple field shapes for robustness
  const durationSecRaw = (v && (v.duration ?? v.dur ?? v.length ?? (v.metadata && v.metadata.duration) ?? (v.info && v.info.duration))) ?? null;
  const durationSec = Number(durationSecRaw);
  const dur = fmtDuration(Number.isFinite(durationSec) ? durationSec : NaN);
  const sizeRaw = (v && (v.size ?? v.bytes ?? v.filesize)) ?? null;
  const size = fmtSize(Number(sizeRaw));
  const isSelected = selectedItems.has(v.path);
  el.dataset.path = v.path;
  const checkbox = el.querySelector('.card-checkbox');
  if (isSelected) checkbox.classList.add('checked');
  // Make the overlay checkbox interactive and accessible
  checkbox.setAttribute('role', 'checkbox');
  checkbox.setAttribute('tabindex', '0');
  checkbox.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  // Clicking the checkbox should always toggle selection (no modifiers required)
  checkbox.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // Support Shift-click range selection via checkbox as well
    if (ev.shiftKey) {
      if (lastSelectedPath) {
        selectRange(lastSelectedPath, v.path);
        lastSelectedPath = v.path;
        return;
      }
      // No prior anchor: select current and set anchor
      if (!selectedItems.has(v.path)) {
        selectedItems.add(v.path);
        updateCardSelection(v.path);
        updateSelectionUI();
      }
      lastSelectedPath = v.path;
      return;
    }
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
  // Small helper: ensure /api/thumbnail exists;
  // if not, generate and return cb URL
  async function ensureThumbUrlIfNeeded(url, pathRel) {
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
      const m = window.__LIB_LAST_METRICS;
      if (m) m.thumbGen = (m.thumbGen || 0) + 1;
      const u = new URL(`/api/thumbnail?path=${encodeURIComponent(pathRel)}`, window.location.origin);
      u.searchParams.set('cb', Date.now());
      return u.pathname + '?' + u.searchParams.toString();
    }
    return url;
  }
  // Always start with placeholder visible until the image truly loads to avoid blank flashes.
  img.alt = v.title || v.name;
  const placeholderSvg = el.querySelector('svg.thumbnail-placeholder');
  // Placeholder is now absolutely positioned overlay; class toggles handle fade.
  function markLoaded(el, success) {
    if (success) el.classList.add('loaded');
    else el.classList.remove('loaded');
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
    const m = window.__LIB_LAST_METRICS;
    if (m) {
      m.imgLoaded = (m.imgLoaded || 0) + 1;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (m.firstImgMs == null) m.firstImgMs = Math.max(0, Math.round(now - m.t0));
      const exp = m.imgExpected || 0;
      if (exp && (m.imgLoaded + (m.imgError || 0)) >= exp && m.allImgsMs == null) {
        m.allImgsMs = Math.max(0, Math.round(now - m.t0));
        devLog('info', 'library', 'images', { page: m.page, expected: exp, loaded: m.imgLoaded, errors: (m.imgError || 0), firstMs: m.firstImgMs, allMs: m.allImgsMs, requested: m.requested, returned: m.returned, total: m.total });
      }
    }
  });
  img.addEventListener('error', async () => {
    markLoaded(el, false);
    let m = window.__LIB_LAST_METRICS;
    if (m) m.imgError = (m.imgError || 0) + 1;
    // Attempt on-demand thumbnail generation once per card to heal 404s
    if (el._thumbGenTried) return;
    el._thumbGenTried = true;
    const p = el.dataset.path || v.path || '';
    if (!p) return;
    const enc = encodeURIComponent(p);
    // Generate thumbnail synchronously (server endpoint performs work inline)
    const genUrl = `/api/thumbnail?path=${enc}&t=middle&quality=2&overwrite=0`;
    const r = await fetch(genUrl, { method: 'POST' }).catch(() => ({ ok: false }));
    if (!r.ok) return;
    m = window.__LIB_LAST_METRICS;
    if (m) m.thumbGen = (m.thumbGen || 0) + 1;
    // Retry load with cache buster (suppress console error if still 404)
    const base = `/api/thumbnail?path=${enc}`;
    const retry = `${base}&cb=${Date.now()}`;
    img.loading = 'eager';
    // Set a flag to suppress error logging for this retry attempt
    img._retryAttempt = true;
    img.src = retry;
  });
  // Defer assigning src for non-eager tiles to reduce main thread contention.
  // We attach data attributes for deferred metadata computation as well.
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
      img.loading = 'eager';
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
        window.__tileIO.observe(img);
      }
    }
  }
  else {
    markLoaded(el, false);
  }
  // Resolution / quality badge: prefer height (common convention)
  // Defer quality / resolution overlay population until element intersects viewport (reduces synchronous cost).
  el._needsMetadata = true;
  // Debounced hover preview functionality
  const PREVIEW_HOVER_DEBOUNCE_MS = 160;
  el.addEventListener('mouseenter', () => {
    if (!previewEnabled) return;
    // Increment token and schedule deferred start
    const token = (el._previewToken || 0) + 1;
    el._previewToken = token;
    el._previewing = true; // mark intent; may be canceled before timer fires
    if (el._previewTimer) {
      clearTimeout(el._previewTimer);
      el._previewTimer = null;
    }
    el._previewTimer = setTimeout(async () => {
      el._previewTimer = null;
      // Abort if state changed or preview disabled or grid hidden
      if (!previewEnabled || !el._previewing || el._previewToken !== token || (typeof grid !== 'undefined' && grid && isHidden(grid)) || document.hidden) {
        return;
      }
      // Stop previews in other tiles now that we are committing
      stopAllTilePreviews(el);
      const url = await ensurePreview(v);
      if (!url || !el._previewing || el._previewToken !== token) return;
      // Final check grid not hidden
      if ((typeof grid !== 'undefined' && grid && isHidden(grid)) || document.hidden) return;
      stopAllTilePreviews(el);
      const video = document.createElement('video');
      video.className = 'thumbnail-img preview-video';
      video.src = url;
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.disablePictureInPicture = true;
      video.style.pointerEvents = 'none';
      if (img) img.replaceWith(video);
      await video.play();
    }, PREVIEW_HOVER_DEBOUNCE_MS);
  });
  function restoreThumbnail() {
    const vid = el.querySelector('video.preview-video');
    if (!vid) return;
    vid.pause();
    vid.src = '';
    vid.load();
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
  const enc = encodeURIComponent(v.path || '');
  const href = `#player/v/${enc}`;
  // Wrap thumbnail area in a link
  if (thumbWrap && !thumbWrap.closest('a')) {
    const aImg = document.createElement('a');
    aImg.href = href;
    aImg.className = 'tile-link tile-link--image';
    // Stop bubbling to card click/selection, but allow default navigation
    aImg.addEventListener('click', (e) => {
      e.stopPropagation();
    });
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
    aTitle.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    // Replace title's text with the anchor
    title.textContent = '';
    title.appendChild(aTitle);
  }
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
  const computeTileMetadata = (card) => {
    if (!card || !card._needsMetadata) return;
    card._needsMetadata = false;
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
      q.setAttribute('aria-hidden', label ? 'false' : 'true');
    }
    if (overlay && overlayRes) {
      if (label) {
        overlayRes.textContent = label;
        showAs(overlay, 'inline-flex');
        overlay.setAttribute('aria-hidden', 'false');
      }
      else {
        hide(overlay);
        overlay.setAttribute('aria-hidden', 'true');
      }
    }

    {
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
              window.__durPending.delete(path);
            });
        }
      }
    }

    card._metadataApplied = true;
  };
  window.__computeTileMetadata = computeTileMetadata;
  // Prefer viewport root for broad compatibility. If the library panel is an actual
  // scroll container (content taller than its client height), use it; otherwise fall back
  // to the viewport so mobile/body scrolling still triggers intersections.
  let rootEl = null;
  const rp = document.getElementById('library-panel');
  if (rp && rp.scrollHeight > (rp.clientHeight + 4)) rootEl = rp;
  window.__tileIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const node = e.target;
      const card = node.closest('.card');
      if (card && card._needsMetadata) computeTileMetadata(card);
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
                  exists = Boolean(headResp.ok);
                }
              }
              catch (_) {
                exists = Boolean(headResp.ok);
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
          catch (_) {
            node.src = src;
          }
        };
        setSrc();
      }
      window.__tileIO.unobserve(node);
    }
  }, {root: rootEl, rootMargin: '250px 0px', threshold: 0.01});
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
  // Run only when Library tab is active; otherwise do nothing
  if (!window.tabSystem || window.tabSystem.getActiveTab() !== 'library') {
    return;
  }
  if (__libLoading) {
    devLog('debug', 'library', 'coalesce');
    __libReloadRequested = true;
    return;
  }
  __libLoading = true;
  try {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Initialize a fresh metrics batch for this load (console-visible)
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
        // @todo copilot refactor
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
      if (window.__LIB_LAST_METRICS) window.__LIB_LAST_METRICS.requested = pageSize;
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
    catch (_) {
      pageSize = 12;
    }
    params.set('page', String(currentPage));
    // In infinite scroll mode, still request page-sized chunks (server handles page param)
    params.set('page_size', String(pageSize));
    // Honor server-supported sorts chosen via header double-click even if not present in <select>
    // @todo copilot redundant
    const SERVER_SORT_MAP = {
      name: 'name', size: 'size', mtime: 'date', date: 'date', created: 'created',
      width: 'width', height: 'height', duration: 'duration', bitrate: 'bitrate', vcodec: 'vcodec', acodec: 'acodec', format: 'format', ext: 'ext',
    };
    const overrideFromSortState = (() => {
      try {
        return (sortState && sortState.id && SERVER_SORT_MAP[sortState.id]) ? SERVER_SORT_MAP[sortState.id] : null;
      }
      catch (_) {
        return null;
      }
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
    // Only set a relative path;
    // ignore absolute values (those represent the root itself)
    if (val && !isAbsolutePath(val) && p) params.set('path', p);
    // Tag / performer filter chips
    if (libraryTagFilters.length) {
      params.set('tags', libraryTagFilters.join(','));
    }
    if (libraryPerformerFilters.length) {
      params.set('performers', libraryPerformerFilters.join(','));
    }
    // Artifact filters: build filters object compatible with list tab format
    // @todo copilot redundant
    const artKeys = ['metadata', 'thumbnail', 'sprites', 'markers', 'subtitles', 'heatmaps', 'faces', 'preview'];
    const artFilterPayload = {};
    for (const k of artKeys) {
      const v = libraryArtifactFilters[k];
      if (v === true) artFilterPayload[k] = { bool: true };
      else if (v === false) artFilterPayload[k] = { bool: false };
    }
    if (Object.keys(artFilterPayload).length) {
      params.set('filters', JSON.stringify(artFilterPayload));
    }
    const endpoint = '/api/library' + (params.toString() ? ('?' + params.toString()) : '');
    devLog('info', 'library', 'request', { page: currentPage, pageSize, path: (currentPath() || ''), sort: (overrideFromSortState || sortSelect.value || 'date'), order: (orderToggle.dataset.order || 'desc') });
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
      //   Do NOT recompute totals from this page;
      // instead, infer whether there
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
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = Math.max(0, Math.round(t1 - t0));
    const total = Number.isFinite(data.total_files) ? data.total_files : (Array.isArray(data.files) ? data.files.length : 0);
    devLog('info', 'library', 'response', { page: currentPage, requested: effectivePageSize, returned: (files ? files.length : 0), total, elapsedMs: elapsed });
    if (window.__LIB_LAST_METRICS) {
      window.__LIB_LAST_METRICS.returned = (files ? files.length : 0);
      window.__LIB_LAST_METRICS.total = total;
    }
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
          for (let i = combined.length - 1;
            i > 0;
            i--) {
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
          const sp2 = new URLSearchParams();
          sp2.set('page', '1');
          sp2.set('page_size', String(Math.max(24, applyColumnsAndComputePageSize() || 24)));
          const override2 = (sortState && sortState.id && SERVER_SORT_MAP[sortState.id]) ? SERVER_SORT_MAP[sortState.id] : null;
          sp2.set('sort', override2 || (sortSelect.value || 'date'));
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
            const opt = resSel.options[resSel.selectedIndex];
            if (opt && opt.text) label = opt.text;
            activeFilters.push(label);
          }
          const hasFilters = activeFilters.length > 0;
          const msg = searchVal ? 'No results match your search.' : 'No videos found.';
          const chips = hasFilters ? `<div class="empty-filters" aria-label="Active filters">${activeFilters.map((f) => `<span class="empty-chip">${f}</span>`).join('')}</div>` : '';
          const btn = hasFilters ? '<div class="mt-12"><button id="clearFiltersBtn" class="btn-sm" type="button" aria-label="Clear filters">Clear filters</button></div>' : '';
          statusEl.innerHTML = `<div class="empty-state">${msg}${chips}${btn}</div>`;
          showAs(statusEl, 'block');
          // Wire the button once
          const clearBtn = document.getElementById('clearFiltersBtn');
          if (clearBtn && !clearBtn._wired) {
            clearBtn._wired = true;
            clearBtn.addEventListener('click', () => {
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
    if (window.__LIB_LAST_METRICS) {
      window.__LIB_LAST_METRICS.imgExpected = nodes.length;
      const mRef = window.__LIB_LAST_METRICS;
      // If all images haven't loaded within 10s, emit a timeout summary for diagnostics
      setTimeout(() => {
        if (!mRef) return;
        const exp = mRef.imgExpected || 0;
        const done = (mRef.imgLoaded || 0) + (mRef.imgError || 0);
        if (exp && !mRef.allImgsMs && done < exp) {
          devLog('warn', 'library', 'images-timeout', { page: mRef.page, expected: exp, loaded: (mRef.imgLoaded || 0), errors: (mRef.imgError || 0), requested: mRef.requested, returned: mRef.returned, total: mRef.total, timeoutMs: 10000 });
        }
      }, 10000);
    }
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
        grid._resolveInsertion();
        delete grid._resolveInsertion;
      }
      infiniteScrollPendingInsertion = null;
    }
    function insertBatch() {
      const frag = document.createDocumentFragment();
      const start = i;
      for (;
        i < nodes.length && i < start + BATCH;
        i++) {
        frag.appendChild(nodes[i]);
      }
      grid.appendChild(frag);
      // Ensure initially visible cards get their metadata overlays immediately (e.g., 1080p labels)
      const cards = Array.from(grid.querySelectorAll('.card'));
      const vh = (typeof window !== 'undefined') ? window.innerHeight : 0;
      const computeMeta = window.__computeTileMetadata || null;
      if (computeMeta && vh) {
        for (const c of cards) {
          if (!c || !c._needsMetadata) continue;
          const r = c.getBoundingClientRect();
          if (r.top < vh && r.bottom > 0) computeMeta(c);
        }
      }
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
              loadLibrary();
            }, 0);
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
      // One-shot immediate metadata for visible cards
      const cards = Array.from(grid.querySelectorAll('.card'));
      const vh = (typeof window !== 'undefined') ? window.innerHeight : 0;
      const computeMeta = window.__computeTileMetadata || null;
      if (computeMeta && vh) {
        for (const c of cards) {
          if (!c || !c._needsMetadata) continue;
          const r = c.getBoundingClientRect();
          if (r.top < vh && r.bottom > 0) computeMeta(c);
        }
      }
      requestAnimationFrame(() => enforceGridSideSpacing());
      finishInsertion();
      // Do not auto-trigger; wait for explicit bottom overscroll.
      // Bounded prefill (single-batch path)
      if (infiniteScrollEnabled && densityReloadPending && !hasVerticalScroll() && currentPage < totalPages && autoFillAfterLayoutChangeBudget > 0) {
        autoFillAfterLayoutChangeBudget -= 1;
        currentPage += 1;
        setTimeout(() => {
          loadLibrary();
        }, 0);
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
    devLog('error', 'Library loading error:', e);
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
        loadLibrary();
      }, 0);
    }
  }
}
// One-time capability check to decide if we should attempt SSE at all (avoids blind 404 probes)
(async () => {
  if (!window.__JOBS_SSE_ENABLED) return;
  if (window.__JOBS_SSE_UNAVAILABLE) return;
  // already decided
  const res = await fetch('/config', {cache: 'no-store' });
  if (!res.ok) return;
  const cfg = await res.json();
  const has = Boolean(cfg && cfg.features && cfg.features.jobs_sse);
  if (!has) window.__JOBS_SSE_UNAVAILABLE = true;
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
      localStorage.setItem(LS_KEY, JSON.stringify(st));
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
          hdr._skipNextClick = false;
          return;
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
  setLocalStorageBoolean('setting.autoRandom', autoRandomEnabled);
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
  const v = document.getElementById('playerVideo');
  if (!v || v._autoRandomWired) return;
  v._autoRandomWired = true;
  v.addEventListener('ended', async () => {
    if (!autoRandomEnabled) return;
    const p = await fetchRandomFilePath();
    if (p && typeof window.__playerOpen === 'function') {
      window.__playerOpen(p);
      if (window.tabSystem) window.tabSystem.switchToTab('player');
    }
  });
}
installAutoRandomListener();
// -----------------------------
// Infinite Scroll Helpers
// -----------------------------
function teardownInfiniteScroll() {
  if (infiniteScrollIO && infiniteScrollSentinel) {
    infiniteScrollIO.unobserve(infiniteScrollSentinel);
  }
  if (infiniteScrollSentinel && infiniteScrollSentinel.parentNode) {
    infiniteScrollSentinel.remove();
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
  const lastScrollAt = Number(window.__INF_LAST_USER_SCROLL_AT || 0);
  const lastLoadAt = Number(window.__INF_LAST_LOAD_AT || 0);
  if (lastScrollAt <= lastLoadAt) return;
  if (!isAtBottom()) return; // not actually at bottom
  const sc = getScrollContainer();
  if (sc && sc.scrollHeight === infiniteScrollLastTriggerHeight) {
    // Already triggered at this height; require a scroll height change and another bottom reach.
    return;
  }
  infiniteScrollLastTriggerHeight = sc ? sc.scrollHeight : 0;
  infiniteScrollLoading = true;
  currentPage += 1;
  window.__INF_LAST_LOAD_AT = Date.now();
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
  window.__INF_LAST_USER_SCROLL_AT = Date.now();
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
  // Keep the sentinel inside the grid to avoid impacting siblings (e.g., sticky controls panel)
  const gridParent = grid || panel;
  if (!infiniteScrollSentinel.parentNode) {
    gridParent.appendChild(infiniteScrollSentinel);
  }
  else {
    // Ensure it is last child
    gridParent.appendChild(infiniteScrollSentinel);
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
  infiniteScrollIO.observe(infiniteScrollSentinel);
}
// -----------------------------
// Unified search + filter chips (#tag, @performer, plain text tokens)
// -----------------------------
function persistLibraryFilters() {
  setLocalStorageJSON('filters.tags', libraryTagFilters);
  setLocalStorageJSON('filters.performers', libraryPerformerFilters);
  setLocalStorageJSON('filters.searchTerms', librarySearchTerms);
}
// Helper: whether any Library filters/search are active
function hasAnyLibraryFiltersActive() {
  try {
    const resSel = document.getElementById('resSelect');
    const resVal = resSel ? String(resSel.value || '') : '';
    const live = (unifiedInput && unifiedInput.value || '').trim();
    return Boolean((libraryTagFilters && libraryTagFilters.length) || (libraryPerformerFilters && libraryPerformerFilters.length) || (librarySearchTerms && librarySearchTerms.length) || resVal || (live && !live.startsWith('#') && !live.startsWith('@')));
  }
  catch (_) {
    return false;
  }
}
function updateClearFiltersBtnState() {
  if (!clearFiltersTopBtn) return;
  const on = hasAnyLibraryFiltersActive();
  clearFiltersTopBtn.disabled = !on;
}
function clearAllLibraryFilters() {
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
  currentPage = 1;
  loadLibrary();
}
if (clearFiltersTopBtn && !clearFiltersTopBtn._wired) {
  clearFiltersTopBtn._wired = true;
  clearFiltersTopBtn.addEventListener('click', clearAllLibraryFilters);
  updateClearFiltersBtnState();
}
function loadLibraryFilters() {
  const t = getLocalStorageJSON('filters.tags', []);
  const p = getLocalStorageJSON('filters.performers', []);
  const s = getLocalStorageJSON('filters.searchTerms', []);
  if (Array.isArray(t)) libraryTagFilters = t.filter(Boolean);
  if (Array.isArray(p)) libraryPerformerFilters = p.filter(Boolean);
  if (Array.isArray(s)) librarySearchTerms = s.filter(Boolean);
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
  const url = new URL(window.location.href);
  // Search as chips (split by whitespace)
  const s = (url.searchParams.get('search') || '').trim();
  librarySearchTerms = s ? s.split(/\s+/).filter(Boolean) : [];
  if (unifiedInput) unifiedInput.value = '';
  // Tags and performers as comma-separated
  const tags = (url.searchParams.get('tags') || '').trim();
  libraryTagFilters = tags ? tags.split(',').map((t) => t.trim())
    .filter(Boolean) : [];
  const perfs = (url.searchParams.get('performers') || '').trim();
  libraryPerformerFilters = perfs ? perfs.split(',').map((p) => p.trim())
    .filter(Boolean) : [];
  // Resolution
  const resSel = document.getElementById('resSelect');
  const resMin = (url.searchParams.get('res_min') || '').trim();
  if (resSel) resSel.value = resMin;
  // Sort and order
  const sortVal = (url.searchParams.get('sort') || '').trim();
  if (sortVal && sortSelect) sortSelect.value = sortVal;
  const ord = (url.searchParams.get('order') || '').trim();
  if (ord) {
    orderToggle.dataset.order = ord.toLowerCase() === 'asc' ? 'asc' : 'desc';
    syncOrderToggleArrow();
  }
  // Path (relative path within root)
  const p = (url.searchParams.get('path') || '').trim();
  if (folderInput) folderInput.value = p;
  persistLibraryFilters();
  renderUnifiedFilterChips();
  updateClearFiltersBtnState();
}
// Apply URL state once on load and when navigating history
window.addEventListener('DOMContentLoaded', () => {
  applyLibraryStateFromUrl();
  currentPage = 1;
  loadLibrary();
});
window.addEventListener('popstate', () => {
  applyLibraryStateFromUrl();
  currentPage = 1;
  loadLibrary();
});
// Keep the browser URL in sync with current Library filters and search
function updateLibraryUrlFromState() {
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
  const entries = Object.entries(dataObj || {}).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.4;
  ctx.clearRect(0, 0, w, h);
  if (!entries.length || !total) {
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
  entries.forEach(([, v], i) => {
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
// Lazy load Stats: only when Stats tab becomes active
// (initial eager load removed to avoid loading inactive tab content)
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
  const p = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : null;
  if (p) return p;
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
  window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
  window.__activeArtifactSpinners.set(`${filePath}::${artifact}`, {path: filePath, artifact: artifact, since: Date.now(), manual: true});
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
    window.__activeArtifactSpinners?.delete?.(`${filePath}::${artifact}`);
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

// @todo copilot redundant
// List chips: trigger the same artifact actions scoped to that row's file
function resolveArtifactRequest(artifact, filePath) {
  const a = String(artifact || '').trim().toLowerCase();
  const qp = encodeURIComponent(filePath || '');
  switch (a) {
  case 'metadata':
    return { url: `/api/metadata?path=${qp}`, method: 'POST' };
  case 'thumbnail':
    return { url: `/api/thumbnail?path=${qp}&t=middle&quality=2&overwrite=0`, method: 'POST' };
  case 'preview':
    return { url: `/api/preview?path=${qp}`, method: 'POST' };
  case 'sprites':
    return { url: `/api/sprites/create?path=${qp}`, method: 'POST' };
  case 'markers':
    return { url: `/api/markers/detect?path=${qp}&priority=1`, method: 'POST' };
  case 'subtitles':
    return { url: `/api/subtitles/create?path=${qp}`, method: 'POST' };
  case 'heatmaps':
    return { url: `/api/heatmaps/create?path=${qp}`, method: 'POST' };
  case 'phash':
    return { url: `/api/phash?path=${qp}`, method: 'POST' };
  default:
    return null;
  }
}

// @todo copilot redundant
const CANONICAL_ARTIFACT_KEYS = new Set([
  'metadata',
  'thumbnail',
  'preview',
  'sprites',
  'markers',
  'subtitles',
  'faces',
  'phash',
  'heatmaps',
]);

// @todo copilot redundant
// Unified artifact chip renderer used by both Sidebar and List
function normalizeArtifactKey(key) {
  const k = String(key ?? '').trim().toLowerCase();
  if (k === 'previews') return 'preview';
  if (k === 'heatmap') return 'heatmaps';
  return CANONICAL_ARTIFACT_KEYS.has(k) ? k : '';
}

// @todo copilot redundant
const ARTIFACT_DEFS = [
  { key: 'metadata', label: 'Metadata', statusKey: 'metadata' },
  { key: 'thumbnail', label: 'Thumbnail', statusKey: 'thumbnail' },
  { key: 'preview', label: 'Preview', statusKey: 'preview' },
  { key: 'sprites', label: 'Sprites', statusKey: 'sprites' },
  { key: 'markers', label: 'Scenes', statusKey: 'markers' },
  { key: 'subtitles', label: 'Subtitles', statusKey: 'subtitles' },
  { key: 'heatmaps', label: 'Heatmaps', statusKey: 'heatmaps' },
  { key: 'faces', label: 'Faces', statusKey: 'faces' },
  { key: 'phash', label: 'pHash', statusKey: 'phash' },
];

function getArtifactDefs(keys) {
  if (Array.isArray(keys) && keys.length) {
    const want = new Set(keys.map((k) => normalizeArtifactKey(k)).filter(Boolean));
    return ARTIFACT_DEFS.filter((d) => want.has(d.key));
  }
  return ARTIFACT_DEFS;
}

// --- Chip sync helpers: keep list and sidebar chips in sync for a given file ---
function setChipLoadingFor(path, chipKey, loading = true) {
  const domKey = normalizeArtifactKey(chipKey);
  if (!domKey) return;
  const selSafe = (s) => s.replace(/\"/g, '\\"');
  const row = document.querySelector(`[data-path="${selSafe(path || '')}"]`);
  if (row) {
    const c = row.querySelector(`.chips-list [data-key="${domKey}"]`);
    if (c) {
      if (loading) c.dataset.loading = '1';
      else c.removeAttribute('data-loading');
    }
  }
  const side = document.querySelector(`#artifactBadgesSidebar [data-key="${domKey}"]`);
  if (side) {
    if (loading) side.dataset.loading = '1';
    else side.removeAttribute('data-loading');
  }
}

function setChipPresentFor(path, chipKey) {
  const domKey = normalizeArtifactKey(chipKey);
  if (!domKey) return;
  const selSafe = (s) => s.replace(/\"/g, '\\"');
  const row = document.querySelector(`[data-path="${selSafe(path || '')}"]`);
  if (row) {
    const c = row.querySelector(`.chips-list [data-key="${domKey}"]`);
    if (c) applyChipPresent(c);
  }
  const side = document.querySelector(`#artifactBadgesSidebar [data-key="${domKey}"]`);
  if (side) applyChipPresent(side);
}

function makeArtifactEl(style, def, present) {
  // Unify visuals: both styles use "artifact-chip" badge with state attributes
  const el = document.createElement('div');
  el.className = 'badge-pill artifact-chip';
  el.dataset.key = def.key;
  const lab = document.createElement('span');
  lab.className = 'label';
  lab.textContent = def.label;
  const st = document.createElement('span');
  st.className = 'status';
  st.setAttribute('aria-hidden', 'true');
  st.textContent = present ? '✓' : '✗';
  el.dataset.present = present ? '1' : '0';
  el.appendChild(lab);
  el.appendChild(st);
  return el;
}

async function renderArtifactChips(container, filePath, opts = {}) {
  if (!container) return;
  const style = opts.style || 'chip'; // 'chip' or 'badge'
  const defList = getArtifactDefs(opts.keys);
  let status = opts.status || null;
  if (!status) status = await fetchArtifactStatusForPath(filePath);
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const def of defList) {
    let present = Boolean(status && status[def.statusKey]);
    const el = makeArtifactEl(style, def, present);
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerArtifactForPath(filePath, def.key, el);
    });
    // Metadata verification (list-friendly): we already have status from above,
    // so just confirm via /api/metadata if status is absent (avoid duplicate status call)
    if (!present && def.key === 'metadata' && filePath) {
      // Status already fetched above, so skip the redundant fetchArtifactStatusForPath call.
      // Just check /api/metadata endpoint as fallback (cheaper than re-fetching status)
      fetchMetadataCached(filePath).then((d) => {
        if (!d) return;
        applyChipPresent(el);
        setChipPresentFor(filePath, 'metadata');
        // Update cache so subsequent calls don't repeat this check
        if (window.__artifactStatus && window.__artifactStatus[filePath]) {
          window.__artifactStatus[filePath].metadata = true;
        }
      }).catch(() => {});
    }
    frag.appendChild(el);
  }
  container.appendChild(frag);
}

async function triggerArtifactForPath(filePath, artifact, chipEl = null) {
  if (!filePath || !artifact) {
    showMessageModal('No file or artifact specified.', { title: 'Generate Artifact' });
    return;
  }
  const req = resolveArtifactRequest(artifact, filePath);
  if (!req) {
    showMessageModal(`Unknown artifact: ${artifact}`, { title: 'Generate Artifact' });
    return;
  }
  // Set loading on both the clicked chip and its counterpart (list/sidebar)
  setChipLoadingFor(filePath, artifact, true);
  if (chipEl) {
    if (chipEl.classList.contains('artifact-chip')) {
      chipEl.dataset.loading = '1';
    }
    else {
      chipEl.classList.add('btn-busy');
    }
  }
  try {
    const r = await fetch(req.url, { method: req.method || 'POST' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Lightly poll artifacts/status to flip the chip to ✓ when done
    pollArtifactStatusAndUpdateChip(filePath, artifact, chipEl);
  }
  catch (e) {
    showMessageModal(`Failed to generate ${artifact}: ${e.message || e}`, { title: 'Generate Artifact' });
  }
}

// Map chip key to artifacts/status payload key
function mapChipKeyToStatusKey(key) {
  return normalizeArtifactKey(key) || '';
}

function applyChipPresent(chip) {
  if (!chip) return;
  // Unified badge style
  if (chip.classList.contains('artifact-chip') || chip.classList.contains('badge-pill')) {
    chip.dataset.present = '1';
    chip.classList.remove('btn-busy');
    chip.removeAttribute('data-loading');
    const st = chip.querySelector('.status');
    if (st) st.textContent = '✓';
    return;
  }
}

async function fetchArtifactStatusForPath(path, skipCache = false) {
  try {
    window.__artifactStatus = window.__artifactStatus || {};
    window.__artifactStatusInflight = window.__artifactStatusInflight || {};
    window.__artifactStatusLast = window.__artifactStatusLast || {};
    window.__artifactStatusLastBypass = window.__artifactStatusLastBypass || {};
    // Return cached value unless explicitly bypassed
    if (!skipCache && window.__artifactStatus[path]) {
      devLog('debug', 'Artifacts', 'status cache hit', { path });
      return window.__artifactStatus[path];
    }

    if (skipCache && window.__artifactStatus[path]) {
      devLog('debug', 'Artifacts', 'status cache bypass', { path });
      const now = Date.now();
      const lastBy = Number(window.__artifactStatusLastBypass[path] || 0);
      if (lastBy && (now - lastBy) < 600) {
        // Return cached snapshot to avoid hammering the endpoint
        return window.__artifactStatus[path];
      }
    }
    else {
      devLog('debug', 'Artifacts', 'status cache miss', { path });
    }

    // Reuse in-flight request if one exists (coalesce concurrent callers)
    if (window.__artifactStatusInflight[path]) {
      return window.__artifactStatusInflight[path];
    }

    const u = new URL('/api/artifacts/status', window.location.origin);
    u.searchParams.set('path', path);
    if (skipCache) window.__artifactStatusLastBypass[path] = Date.now();
    const p = (async () => {
      const r = await fetch(u.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const raw = (j && (j.data || j)) || null;
      if (raw) {
        window.__artifactStatus[path] = raw;
        window.__artifactStatusLast[path] = Date.now();
        devLog('debug', 'Artifacts', 'status cached', { path });
        return raw;
      }
      return raw;
    })();
    window.__artifactStatusInflight[path] = p;
    const d = await p;
    delete window.__artifactStatusInflight[path];
    return d;
  }
  catch (_) {
    return null;
  }
}

// Poll status for up to ~60s, updating the provided chip when ready
function pollArtifactStatusAndUpdateChip(path, chipKey, chipEl) {
  window.__statusPollers = window.__statusPollers || {};
  const key = `${path}|${chipKey}`;
  if (window.__statusPollers[key]) return;
  window.__statusPollers[key] = true;
  const statusKey = mapChipKeyToStatusKey(chipKey);
  if (!statusKey) {
    if (window.__statusPollers) {
      delete window.__statusPollers[`${path}|${chipKey}`];
    }
    return;
  }
  const rowEl = (() => {
    try {
      return document.querySelector(`[data-path="${(path || '').replace(/"/g, '\\"')}"]`);
    }
    catch (_) {
      return null;
    }
  })();
  const start = Date.now();
  const maxMs = 60000; // 60s cap
  const intervalMs = 2000;
  let stop = false;
  const timer = setInterval(async () => {
    if (stop) return;
    if (!document.contains(chipEl) && rowEl && !document.contains(rowEl)) {
      // Row no longer in DOM; stop polling
      clearInterval(timer);
      stop = true;
      return;
    }
    if (Date.now() - start > maxMs) {
      clearInterval(timer);
      stop = true;
      return;
    }
    const st = await fetchArtifactStatusForPath(path, true); // bypass cache when polling
    if (!st) return;
    if (st[statusKey]) {
      setChipPresentFor(path, chipKey);
      if (chipEl) applyChipPresent(chipEl);
      clearInterval(timer);
      stop = true;
      delete window.__statusPollers[`${path}|${chipKey}`];
    }
  }, intervalMs);
  // Safety stop to clear registry on cap
  setTimeout(() => {
    if (!stop) {
      delete window.__statusPollers[`${path}|${chipKey}`];
    }
  }, maxMs + 2500);
}
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
    localStorage.setItem('filter.res_min', resSelect.value || '');
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
  window.__INF_LAST_LOAD_AT = Date.now();
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
  setLocalStorageItem('setting.preview', previewEnabled ? '1' : '0');
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
  setLocalStorageItem('setting.previewOnDemand', previewOnDemandEnabled ? '1' : '0');
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
  setLocalStorageItem('setting.showHeatmap', showHeatmap ? '1' : '0');
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
  setLocalStorageItem('setting.showScenes', showScenes ? '1' : '0');
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
    // Seek jump seconds setting
    // Distinct forward/back jump settings
    const jumpBackInput = document.getElementById('settingJumpBackSeconds');
    const jumpFwdInput = document.getElementById('settingJumpFwdSeconds');
    const legacy = localStorage.getItem('setting.jumpSeconds');
    const backRaw = localStorage.getItem('setting.jumpBackSeconds');
    const fwdRaw = localStorage.getItem('setting.jumpFwdSeconds');
    const legacyVal = Number(legacy);
    if (legacy && (!backRaw || !fwdRaw) && Number.isFinite(legacyVal) && legacyVal >= 1 && legacyVal <= 600) {
      if (!backRaw) localStorage.setItem('setting.jumpBackSeconds', legacy);
      if (!fwdRaw) localStorage.setItem('setting.jumpFwdSeconds', legacy);
    }
    const wireJumpInput = (el, key, defVal) => {
      if (!el || el._wired) return;
      el._wired = true;
      const raw = localStorage.getItem(key);
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 1 && v <= 600) el.value = String(v);
      const onChange = () => {
        const v = Number(el.value);
        const val = (Number.isFinite(v) && v >= 1 && v <= 600) ? Math.round(v) : defVal;
        localStorage.setItem(key, String(val));
        el.value = String(val);
      };
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    };
    wireJumpInput(jumpBackInput, 'setting.jumpBackSeconds', 30);
    wireJumpInput(jumpFwdInput, 'setting.jumpFwdSeconds', 30);
    // Reflect configured jump seconds on seek buttons (visual + a11y)
    const updateJumpButtons = () => {
      const backRaw = localStorage.getItem('setting.jumpBackSeconds');
      const fwdRaw = localStorage.getItem('setting.jumpFwdSeconds');
      let back = Number(backRaw);
      if (!Number.isFinite(back) || back < 1 || back > 600) back = 30;
      let fwd = Number(fwdRaw);
      if (!Number.isFinite(fwd) || fwd < 1 || fwd > 600) fwd = 30;
      const backBtn = document.getElementById('btnSeekBack30');
      const fwdBtn = document.getElementById('btnSeekFwd30');
      if (backBtn) {
        backBtn.textContent = `-${back}s`;
        backBtn.title = `Back ${back} seconds`;
        backBtn.setAttribute('aria-label', `Back ${back} seconds`);
      }
      if (fwdBtn) {
        fwdBtn.textContent = `+${fwd}s`;
        fwdBtn.title = `Forward ${fwd} seconds`;
        fwdBtn.setAttribute('aria-label', `Forward ${fwd} seconds`);
      }
    };
    updateJumpButtons();
    // Re-run label update whenever inputs change
    [jumpBackInput, jumpFwdInput].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', updateJumpButtons);
      el.addEventListener('input', updateJumpButtons);
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
        localStorage.setItem('setting.infiniteScroll', infiniteScrollEnabled ? '1' : '0');
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
      localStorage.setItem('setting.confirmDeletes', confirmDeletesEnabled ? '1' : '0');
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
    setLocalStorageItem('setting.autoplayResume', v ? '1' : '0');
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
    setLocalStorageItem('setting.startAtIntro', v ? '1' : '0');
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
      if (!(settingsPanel.hasAttribute('hidden') || settingsPanel.classList.contains('hidden'))) {
        maybeInit('settings');
      }
      // Also react to tab changes
      window.addEventListener('tabchange', (e) => {
        maybeInit(e?.detail?.activeTab);
      });
    }
  }
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
    } finally {
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
        clearBtn.disabled = true;
        clearBtn.classList.add('btn-busy');
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
  const closeTooltip = (tooltip) => {
    if (!tooltip) return;
    hide(tooltip);
    tooltip.classList.add('d-none');
  };
  const openTooltip = (tooltip) => {
    if (!tooltip) return;
    tooltip.classList.remove('d-none');
    showAs(tooltip, 'block');
  };
  const closeAllTooltips = () => {
    document.querySelectorAll('.options-tooltip').forEach((tt) => {
      closeTooltip(tt);
    });
    document.querySelectorAll('.artifact-card.menu-open')
      .forEach((card) => card.classList.remove('menu-open'));
  };
  // Close any open tooltip when clicking outside
  document.addEventListener('click', () => {
    closeAllTooltips();
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
        if (tt !== tooltip) closeTooltip(tt);
      });
      document.querySelectorAll('.artifact-card.menu-open')
        .forEach((c) => {
          if (c !== card) c.classList.remove('menu-open');
        });
        if (tooltip) {
        const willOpen = isHidden(tooltip);
        if (willOpen) openTooltip(tooltip);
        else closeTooltip(tooltip);
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
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  const gridEl = document.getElementById('grid');
  const containerW = gridEl ? gridEl.clientWidth : window.innerWidth;
  const minCard = 160; // match CSS mobile minmax
  const gap = 12;
  if (isMobile && containerW) {
    const fitCols = Math.max(1, Math.floor((containerW + gap) / (minCard + gap)));
    columns = Math.min(columns, fitCols);
  }
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
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  const gridEl = document.getElementById('grid');
  const containerW = gridEl ? gridEl.clientWidth : window.innerWidth;
  const minCard = 160;
  const gap = 12;
  if (isMobile && containerW) {
    const fitCols = Math.max(1, Math.floor((containerW + gap) / (minCard + gap)));
    columns = Math.min(columns, fitCols);
  }
  document.documentElement.style.setProperty('--columns', String(Math.max(1, columns)));
  // Estimate rows that fit without vertical scroll (soft limit); allow fallback large page if unknown
  let rowGap = 12;
  if (gridEl) {
    const st = window.getComputedStyle(gridEl);
    const g = parseFloat(st.rowGap || st.gap || '12');
    if (isFinite(g) && g >= 0) rowGap = g;
  }
  const baseHeight = lastCardHeight || 230;
  let available = window.innerHeight;
  if (gridEl) {
    const rect = gridEl.getBoundingClientRect();
    available = Math.max(200, window.innerHeight - rect.top - 8);
  }
  let rows = Math.max(1, Math.floor((available + rowGap) / (baseHeight + rowGap)));
  if (rows > 20) rows = 20; // hard safety cap
  let size = columns * rows;
  if (isMobile) size = Math.max(size, 24);
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
    if (event.shiftKey) {
      // Shift-click: select range if we have an anchor; otherwise set anchor by selecting current
      if (lastSelectedPath) {
        selectRange(lastSelectedPath, path);
        lastSelectedPath = path;
        return;
      }
      // No anchor yet: select current and set anchor
      if (!selectedItems.has(path)) {
        selectedItems.add(path);
        updateCardSelection(path);
        updateSelectionUI();
      }
      lastSelectedPath = path;
      return;
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
    // Update URL to a unique per-video route
    const enc = encodeURIComponent(path || '');
    const route = `#player/v/${enc}`;
    if (window.location.hash !== route) window.location.hash = route;
    if (window.tabSystem && typeof window.tabSystem.switchToTab === 'function') {
      window.tabSystem.switchToTab('player');
    }
  }
}
function selectRange(startPath, endPath) {
  const cards = Array.from(document.querySelectorAll('.card[data-path]'));
  const startIdx = cards.findIndex((card) => card.dataset.path === startPath);
  const endIdx = cards.findIndex((card) => card.dataset.path === endPath);
  if (startIdx === -1 || endIdx === -1) return;
  const start = Math.min(startIdx, endIdx);
  const end = Math.max(startIdx, endIdx);
  for (let i = start;
    i <= end;
    i++) {
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
  lastSelectedPath = path;
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
  if (window.tasksManager && typeof window.tasksManager.updateSelectedFileCount === 'function') {
    window.tasksManager.updateSelectedFileCount();
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
// Shift-click support when clicking directly on card checkboxes (range select)
document.addEventListener('click', (e) => {
  const box = e.target.closest('.card-checkbox');
  if (!box) return;
  const card = box.closest('.card[data-path]');
  if (!card) return;
  const path = card.dataset.path || '';
  if (!path) return;
  if (e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (!lastSelectedPath) {
      if (!selectedItems.has(path)) selectedItems.add(path);
      updateCardSelection(path);
      updateSelectionUI();
      lastSelectedPath = path;
      return;
    }
    selectRange(lastSelectedPath, path);
    lastSelectedPath = path;
  }
});
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
      bulkValueInput.focus();
    }
  });
  const ensureBulkRegistries = () => loadRegistries(['performers', 'tags']);
  function renderBulkSuggestions(kind, query) {
    if (!bulkSuggestions) return;
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      bulkSuggestions.innerHTML = '';
      return;
    }
    const src = (kind === 'performer' ? (window.__REG?.performers || []) : (window.__REG?.tags || [])).map((x) => x?.name).filter(Boolean);
    const matches = [];
    for (const name of src) {
      const low = String(name).toLowerCase();
      const idx = low.indexOf(q);
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
      chip.title = 'Click to use';
      chip.textContent = name;
      chip.addEventListener('click', () => {
        bulkValueInput.value = name;
        bulkSuggestions.innerHTML = '';
        bulkValueInput.focus();
      });
      frag.appendChild(chip);
    });
    bulkSuggestions.innerHTML = '';
    bulkSuggestions.appendChild(frag);
  }
  bulkValueInput.addEventListener('input', async () => {
    await ensureBulkRegistries();
    const kind = (bulkKindSelect && bulkKindSelect.value) || 'tag';
    renderBulkSuggestions(kind, bulkValueInput.value);
  });
  if (bulkKindSelect) {
    bulkKindSelect.addEventListener('change', () => renderBulkSuggestions(bulkKindSelect.value, bulkValueInput.value));
  }
  async function bulkApply(kind, op, name) {
    const val = String(name || '').trim();
    if (!val) {
      notify('Enter a name to apply', 'error');
      return;
    }
    const paths = Array.from(selectedItems || []);
    if (!paths.length) {
      notify('No items selected', 'error');
      return;
    }
    let ok = 0;
    let fail = 0;
    const epBase = kind === 'performer' ? '/api/media/performers' : '/api/media/tags';
    await Promise.all(paths.map(async (p) => {
      try {
        const url = new URL(`${epBase}/${op === 'remove' ? 'remove' : 'add'}`, window.location.origin);
        url.searchParams.set('path', p);
        url.searchParams.set(kind, val);
        const r = await fetch(url.toString(), { method: 'POST' });
        if (r.ok) ok++;
        else fail++;
      }
      catch (_) {
        fail++;
      }
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
          return (val || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
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
modal.addEventListener('modal:requestClose', (ev) => {
  ev.preventDefault();
  closeFolderPicker();
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
    if (tabId === 'player' && segs[1] === 'v' && segs[2]) {
      const enc = segs[2];
      const path = decodeURIComponent(enc);
      if (path && window.Player && typeof window.Player.open === 'function') {
        window.Player.open(path);
      }
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
      this.updateUrl(tabId); // The hashchange event will trigger the tab switch
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
      if (panel) this.tabs.set(tabId, {button, panel});
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
    setLocalStorageItem('activeTab', tabId);
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
// Lightweight lazy-init manager for tabs: run setup on first visible
(function initLazyTabs() {
  const loaded = new Set();
  const inits = new Map();
  const ensure = (tabId) => {
    if (!tabId || loaded.has(tabId)) return;
    // Mark as loaded BEFORE running init to avoid re-entrant loops
    loaded.add(tabId);
    const fn = inits.get(tabId);
    if (typeof fn === 'function') {
      fn();
    }
  };
  const register = (tabId, fn) => {
    if (tabId && typeof fn === 'function') inits.set(tabId, fn);
  };
  window.__LazyTabs = { register, ensure };
  // Run init for the active tab once the first switch occurs
  window.addEventListener('tabchange', (e) => {
    ensure(e && e.detail && e.detail.activeTab);
  });
  // In case the initial tab is already visible before any tabchange
  const runInitial = () => {
    const ts = window.tabSystem;
    const id = ts && typeof ts.getActiveTab === 'function' ? ts.getActiveTab() : null;
    if (id) ensure(id);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitial, { once: true });
  }
  else {
    setTimeout(runInitial, 0);
  }
})();
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
    if (e && e.detail && e.detail.activeTab === 'player') {
      // run twice (immediate + after potential layout/scrollbars settle)
      setTimeout(recompute, 0);
      setTimeout(recompute, 120);
    }
  });
  // Slight delay to allow fonts/layout settle
  // Only attempt initial measurements if the player tab is already active (rare on first load)
  if (!(playerPanel.hasAttribute('hidden') || playerPanel.classList.contains('hidden'))) {
    setTimeout(recompute, 0);
    setTimeout(recompute, 150);
  }
}
// --- List Tab (compact table view) ---
function setupListTab() {
  const COL_LS_KEY = 'mediaPlayer:list:columns';
  const SORT_LS_KEY = 'mediaPlayer:list:sort';
  const WRAP_LS_KEY = 'mediaPlayer:list:wrap';
  const PAGE_SIZE_LS_KEY = 'mediaPlayer:list:pageSize';
  const AUTOSIZED_ONCE_LS_KEY = 'mediaPlayer:list:autosizedOnce';
  const MAX_LIST_PAGE_SIZE = 500;
  let listLoadPageRef = null;
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
        delete window.__metadataInflight[path];
        return d;
      });
      window.__metadataInflight[path] = p;
      return p;
    }
    catch (_) {
      return Promise.resolve(null);
    }
  }
  // Compute natural width for a column based on body cell textual/content width only.
  // Uses an off-DOM measurement element for more accurate sizing unaffected by table layout.
  function computeAutoWidth(panel, colId) {
    let textProbe = null;
    let cloneHost = null;
    try {
      const tds = Array.from(panel.querySelectorAll(`#listTable td.col-${colId}`));
      if (!tds.length || typeof document === 'undefined') return null;
      textProbe = document.createElement('div');
      textProbe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:-9999px;white-space:nowrap;font:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;';
      document.body.appendChild(textProbe);
      cloneHost = document.createElement('div');
      cloneHost.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:-9999px;';
      document.body.appendChild(cloneHost);
      const extraPadding = (td) => (td.classList.contains('col-artifacts') || td.classList.contains('col-performers') || td.classList.contains('col-tags')) ? 36 : 24;
      let max = 0;
      for (const td of tds) {
        let width = 0;
        if (td.children.length) {
          const cloneWrapper = document.createElement('div');
          cloneWrapper.style.display = 'inline-block';
          cloneWrapper.style.whiteSpace = td.classList.contains('col-artifacts') ? 'nowrap' : 'normal';
          if (typeof window !== 'undefined' && window.getComputedStyle) {
            cloneWrapper.style.font = window.getComputedStyle(td).font;
          }
          Array.from(td.childNodes).forEach((node) => {
            cloneWrapper.appendChild(node.cloneNode(true));
          });
          cloneHost.appendChild(cloneWrapper);
          width = Math.ceil(cloneWrapper.getBoundingClientRect().width);
          cloneHost.removeChild(cloneWrapper);
        }
        else {
          textProbe.textContent = td.textContent || '';
          width = Math.ceil(textProbe.scrollWidth);
        }
        max = Math.max(max, width + extraPadding(td));
      }
      return Math.max(60, max);
    }
    catch (_) {
      return null;
    }
    finally {
      if (textProbe && textProbe.parentNode) {
        textProbe.parentNode.removeChild(textProbe);
      }
      if (cloneHost && cloneHost.parentNode) {
        cloneHost.parentNode.removeChild(cloneHost);
      }
    }
  }
  // Default column definitions (id, label, width px, default visibility, accessor)
  let listLastAnchorIndex = null; // anchor for shift-click range selection in list
  const LIST_COLUMN_DEFS = buildListColumnDefs();
  const DEFAULT_COLS = LIST_COLUMN_DEFS.map((col) => ({ ...col, visible: col.defaultVisible }));

  function buildListColumnDefs() {
    const columns = [
      {
        id: 'select',
        label: '',
        width: 34,
        defaultVisible: true,
        render: (td, f) => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'list-row-checkbox';
      cb.setAttribute('aria-label', 'Select row');
      const path = f.path || '';
      cb.checked = selectedItems.has(path);
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!path) return;
        // Shift-click range selection for checkboxes: extend from anchor to current
        if (e.shiftKey) {
          const rowsAll = Array.from(document.querySelectorAll('#listTable tbody tr[data-path]'));
          const currentTr = cb.closest('tr');
          const idx = rowsAll.indexOf(currentTr);
          if (idx !== -1) {
            if (listLastAnchorIndex == null) {
              listLastAnchorIndex = idx;
            }
            else {
              const targetChecked = cb.checked;
              const a = Math.min(listLastAnchorIndex, idx);
              const b = Math.max(listLastAnchorIndex, idx);
              for (let i = a;
                i <= b;
                i++) {
                const p = rowsAll[i].dataset.path || '';
                if (!p) continue;
                if (targetChecked) selectedItems.add(p);
                else selectedItems.delete(p);
                const rowCb = rowsAll[i].querySelector('.list-row-checkbox');
                if (rowCb) rowCb.checked = targetChecked;
                rowsAll[i].setAttribute('data-selected', targetChecked ? '1' : '0');
              }
              listLastAnchorIndex = idx;
              if (typeof updateSelectionUI === 'function') updateSelectionUI();
              if (typeof window.__updateListSelectionUI === 'function') window.__updateListSelectionUI();
              return; // done handling shift range
            }
          }
        }
        if (cb.checked) selectedItems.add(path);
        else selectedItems.delete(path);
        if (typeof updateSelectionUI === 'function') updateSelectionUI();
        if (typeof window.__updateListSelectionUI === 'function') window.__updateListSelectionUI();
      });
        td.appendChild(cb);
      }},
      {
        id: 'name',
        label: 'Name',
        width: 260,
        defaultVisible: true,
        render: (td, f) => {
          let s = f.title || f.name || f.path || '';
          const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
          if (slash >= 0) s = s.slice(slash + 1);
          const dot = s.lastIndexOf('.');
          if (dot > 0) s = s.slice(0, dot);
          const a = document.createElement('a');
          a.href = '#player/v/' + encodeURIComponent(f.path || '');
          a.textContent = s;
          a.setAttribute('aria-label', 'Open "' + s + '" in player');
          a.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.tabSystem) window.tabSystem.switchToTab('player');
            if (window.Player?.open) window.Player.open(f.path);
          });
          td.appendChild(a);
        }
      },
      {
        id: 'path',
        label: 'Path',
        width: 320,
        defaultVisible: true,
        get: (f) => f.path || ''
      },
      {
        id: 'duration',
        label: 'Duration',
        width: 90,
        defaultVisible: true,
        render: (td, f) => {
          const v = Number(f.duration);
          td.textContent = Number.isFinite(v) && v > 0 ? fmtDuration(v) : '';
          if ((!Number.isFinite(v) || v <= 0) && f.path) {
            fetchMetadataCached(f.path).then((d) => {
              if (!d || !td.isConnected) return;
              const sec = Number(d.duration);
              if (Number.isFinite(sec) && sec > 0) td.textContent = fmtDuration(sec);
            });
          }
        }
      },
      {
        id: 'size',
        label: 'Size',
         width: 90,
         defaultVisible: true,
         get: (f) => fmtSize(Number(f.size))
      },
      {
        id: 'width',
        label: 'Width',
        width: 90,
        defaultVisible: true,
        render: (td, f) => {
          const w = Number(f.width);
          td.textContent = Number.isFinite(w) && w > 0 ? `${w} px` : '';
          if ((!Number.isFinite(w) || w <= 0) && f.path) {
            fetchMetadataCached(f.path).then((d) => {
              if (!d || !td.isConnected) return;
              const val = Number(d.width);
              if (Number.isFinite(val) && val > 0) td.textContent = `${val} px`;
            });
          }
        }
      },
      {
        id: 'height',
        label: 'Height',
        width: 90,
        defaultVisible: true,
        render: (td, f) => {
          const h = Number(f.height);
          td.textContent = Number.isFinite(h) && h > 0 ? `${h} px` : '';
          if ((!Number.isFinite(h) || h <= 0) && f.path) {
            fetchMetadataCached(f.path).then((d) => {
              if (!d || !td.isConnected) return;
              const val = Number(d.height);
              if (Number.isFinite(val) && val > 0) td.textContent = `${val} px`;
            });
          }
        }
      },
      {
        id: 'created',
        label: 'Created',
        width: 160,
        defaultVisible: false,
        get: (f) => {
          const t = Number(f.ctime) || Number(f.birthtime) || Number(f.mtime) || 0;
          return formatDateTime(t);
        }},
      {
        id: 'mtime',
        label: 'Modified',
        width: 160,
        defaultVisible: true,
        get: (f) => formatDateTime(f.mtime)
      },
      {
        id: 'codec',
        label: 'Video Codec',
        width: 130,
        defaultVisible: false,
        render: (td, f) => {
          const initial = (f.video_codec || f.vcodec || f.vcodec_name || f.codec || f.codec_name || '').toString();
          td.textContent = initial || '—';
          if (!initial && f.path) {
            fetchMetadataCached(f.path).then((d) => {
              if (!d || !td.isConnected) return;
              const v = (d.vcodec || d.video_codec || '').toString();
              if (v) td.textContent = v;
            });
          }
        }
      },
      {
        id: 'acodec',
        label: 'Audio Codec',
        width: 130,
        defaultVisible: false,
        render: (td, f) => {
          const initial = (f.audio_codec || f.acodec || f.acodec_name || f.audio_codec_name || '').toString();
          td.textContent = initial || '—';
          if (!initial && f.path) {
            fetchMetadataCached(f.path).then((d) => {
              if (!d || !td.isConnected) return;
              const v = (d.acodec || d.audio_codec || '').toString();
              if (v) td.textContent = v;
            });
          }
        }
      },
      {
        id: 'format',
        label: 'Format',
        width: 90,
        defaultVisible: true,
        get: (f) => {
      const p = f.path || f.name || '';
      const m = /\.([^.\/]+)$/.exec(p);
      return m ? m[1].toLowerCase() : '';
      }},
      {
        id: 'bitrate',
        label: 'Bitrate',
        width: 110,
        defaultVisible: false,
        render: (td, f) => {
      const renderBps = (bps) => {
        const mbps = bps / 1_000_000;
        return mbps >= 0.1 ? `${mbps.toFixed(2)} Mbps` : `${Math.round(bps / 1000)} kbps`;
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
              const dur2 = Number(d.duration) || 0;
              const size2 = Number(d.size) || size;
              if (dur2 > 0 && size2 > 0) td.textContent = renderBps((size2 * 8) / dur2);
            }
          });
        }
      }
    }},
    ];

    const artifactStatusColumns = [
      {id: 'art-metadata', label: 'Metadata', keys: ['has_metadata', 'metadata'], width: 54},
      {id: 'art-thumbnail', label: 'Thumbnail', keys: ['has_thumbnail', 'thumbnail', 'thumbnails'], width: 78},
      {id: 'art-sprites', label: 'Sprites', keys: ['has_sprites', 'sprites'], width: 64},
      {id: 'art-preview', label: 'Preview', keys: ['has_preview', 'preview', 'previewUrl'], width: 60},
      {id: 'art-scenes', label: 'Scenes', keys: ['has_scenes', 'scenes', 'markers'], width: 60},
      {id: 'art-phash', label: 'pHash', keys: ['has_phash', 'phash'], width: 60},
      {id: 'art-heatmaps', label: 'Heatmaps', keys: ['has_heatmaps', 'heatmaps'], width: 74},
    ].map((ac) => ({
      id: ac.id,
      label: ac.label,
      width: ac.width,
      defaultVisible: false,
      render: (td, f) => {
        let present = hasArtifact(f, ac.keys);
        const span = document.createElement('span');
        const apply = (ok) => {
          span.className = ok ? 'status status--present' : 'status status--missing';
          span.title = ok ? `${ac.label} present` : `${ac.label} missing`;
          span.textContent = ok ? '✓' : '✕';
        };
        apply(present);
        if (!present && ac.id === 'art-metadata' && f && f.path) {
          fetchMetadataCached(f.path).then((d) => {
            if (!td.isConnected) return;
            apply(Boolean(d));
          });
        }
        td.appendChild(span);
      },
    }));

    columns.push(...artifactStatusColumns);

    columns.push({
      id: 'artifacts',
      label: 'Artifacts',
      width: 520,
      defaultVisible: true,
      render: (td, f) => {
        const cont = document.createElement('div');
        cont.className = 'chips-list';
        td.appendChild(cont);
        const status = {};
        const pres = (keys) => hasArtifact(f, keys);
        status.metadata = pres(['has_metadata', 'metadata']);
        status.thumbnail = pres(['has_thumbnail', 'thumbnail', 'thumbnails']);
        status.sprites = pres(['has_sprites', 'sprites']);
        status.preview = pres(['has_preview', 'preview', 'previewUrl']);
        status.markers = pres(['has_scenes', 'scenes', 'markers']);
        status.heatmaps = pres(['has_heatmaps', 'heatmaps']);
        status.phash = pres(['has_phash', 'phash']);
        const keys = ['metadata', 'thumbnail', 'sprites', 'preview', 'markers', 'heatmaps', 'phash'];
        renderArtifactChips(cont, f.path || '', { style: 'chip', keys, status });
      }});

    columns.push({
      id: 'performers',
      label: 'Performers',
      width: 340,
      defaultVisible: true,
      render: (td, f) => {
        const cont = document.createElement('div');
        cont.className = 'chips-list performers-chips';
        td.appendChild(cont);
        let currentPerformerNames = [];
        const apply = (names) => {
          cont.innerHTML = '';
          const arr = Array.isArray(names) ? names.filter(Boolean) : [];
          currentPerformerNames = arr.map((n) => typeof n === 'object' && n ? (n.name || n.label || String(n)) : String(n));
          arr.forEach((entry) => {
            const isObj = entry && typeof entry === 'object';
            const name = isObj ? (entry.name || entry.label || String(entry)) : String(entry);
            const isUnconfirmed = Boolean(isObj && (entry.suggested || entry.unconfirmed || entry.confirmed === false));
            const chip = document.createElement('span');
            chip.className = 'chip chip--performer' + (isUnconfirmed ? ' chip--pending' : '');
            chip.textContent = name;
            if (isUnconfirmed) {
              chip.title = `Confirm performer: ${name}`;
              chip.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = new URL('/api/media/performers/add', window.location.origin);
                url.searchParams.set('path', f.path || '');
                url.searchParams.set('performer', name);
                const resp = await fetch(url.toString(), {method: 'POST'});
                if (resp.ok) {
                  const j = await resp.json();
                  const list = j?.data?.performers || j?.performers || [];
                  apply(list);
                }
              });
            }
            else {
              chip.title = `Filter by performer: ${name}`;
              chip.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!libraryPerformerFilters.includes(name)) libraryPerformerFilters.push(name);
                setLocalStorageJSON('filters.performers', libraryPerformerFilters);
                if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
                if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
                currentPage = 1;
                loadLibrary();
              });
            }
            cont.appendChild(chip);
          });
          ensurePerformerRegistry().then(() => renderSuggestions('performer', arr));
        };
        function startEdit() {
          if (!f.path || td._editing) return;
          td._editing = true;
          apply(f.performers || currentPerformerNames);
          const input = document.createElement('span');
          input.className = 'chip-input';
          input.contentEditable = 'true';
          input.setAttribute('role', 'textbox');
          input.setAttribute('aria-label', 'Add performers');
          input.dataset.placeholder = 'Add performer…';
          cont.appendChild(input);

          async function commitTokens(tokens) {
            const parts = (tokens || []).map((s) => String(s || '').trim()).filter(Boolean);
            if (!parts.length) return;
            for (const p of parts) {
              const url = new URL('/api/media/performers/add', window.location.origin);
              url.searchParams.set('path', f.path);
              url.searchParams.set('performer', p);
              await fetch(url.toString(), {method: 'POST'});
            }
            const d = await fetchMetadataCached(f.path).catch(() => null);
            if (!td.isConnected) return;
            apply(d?.performers || d?.perfs || d?.actors || []);
            if (td._editing) {
              cont.appendChild(input);
              placeCaretAtEnd(input);
            }
          }
          // @todo copilot move to utils
          function placeCaretAtEnd(el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          // @todo copilot move to utils
          function tokenize(str) {
            return String(str || '').split(/[\,\n]+/) .map((s) => s.trim()) .filter(Boolean);
          }

          input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              const raw = input.textContent || '';
              input.textContent = '';
              commitTokens(tokenize(raw));
            }
            else if (e.key === ',') {
              e.preventDefault();
              const raw = input.textContent || '';
              input.textContent = '';
              commitTokens(tokenize(raw));
            }
            else if (e.key === 'Escape') {
              e.preventDefault();
              td._editing = false;
              apply(f.performers || currentPerformerNames);
            }
          });
          input.addEventListener('blur', () => {
            if (!td._editing) return;
            const raw = (input.textContent || '').trim();
            td._editing = false;
            if (raw) commitTokens(tokenize(raw));
            else apply(f.performers || currentPerformerNames);
          });
          input.focus();
        }
        td.addEventListener('dblclick', (e) => {
          if (e.target.closest('.chip') || e.target.closest('.chip-suggest')) return;
          startEdit();
        });
        const ensurePerformerRegistry = () => loadRegistry('performers');
        const renderSuggestions = (kind, existing) => {
          const baseName = (f?.name || (f?.path ? f.path.split('/').pop() : '') || '').replace(/\.[^.]+$/, '');
          const baseLower = baseName.toLowerCase();
          const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const baseNorm = ' ' + norm(baseLower) + ' ';
          const containsWord = (needle) => {
            const n = ' ' + norm(needle) + ' ';
            return n.trim().split(/\s+/).every((tok) => baseNorm.includes(' ' + tok + ' '));
          };
          const names = (window.__REG.performers || []).map((p) => p?.name).filter(Boolean);
          const have = new Set((existing || []).map((x) => String(x).toLowerCase()));
          const sug = [];
          for (const nm of names) {
            const low = String(nm).toLowerCase();
            if (have.has(low)) continue;
            if (containsWord(low)) sug.push(nm);
            if (sug.length >= 6) break;
          }
          if (!sug.length) return;
          const wrap = document.createElement('div');
          wrap.className = 'chips-suggestions-inline';
          sug.forEach((nm) => {
            const chip = document.createElement('span');
            chip.className = 'chip chip-suggest';
            chip.textContent = nm;
            chip.title = 'Add performer';
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              const url = new URL('/api/media/performers/add', window.location.origin);
              url.searchParams.set('path', f.path || '');
              url.searchParams.set('performer', nm);
              const resp = await fetch(url.toString(), {method: 'POST'});
              if (resp.ok) {
                const j = await resp.json();
                const list = j?.data?.performers || j?.performers || [];
                apply(list);
              }
            });
            wrap.appendChild(chip);
          });
          cont.appendChild(wrap);
        };
        let initial = f && (f.performers || f.perfs || f.actors);
        if (Array.isArray(initial)) {
          ensurePerformerRegistry().then(() => apply(initial));
        }
        else if (f && f.path) {
          ensurePerformerRegistry().then(() => {
            fetchMetadataCached(f.path).then((d) => {
              if (!td.isConnected) return;
              apply(d && (d.performers || d.perfs || d.actors || []));
            });
          });
        }
        else {
          ensurePerformerRegistry().then(() => apply([]));
        }
      }});

    columns.push({
      id: 'tags',
      label: 'Tags',
      width: 340,
      defaultVisible: true,
      render: (td, f) => {
        const cont = document.createElement('div');
        cont.className = 'chips-list tags-chips';
        td.appendChild(cont);
        let currentTagNames = [];
        const apply = (tags) => {
          cont.innerHTML = '';
          const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
          currentTagNames = arr.map((t) => typeof t === 'object' && t ? (t.name || t.label || String(t)) : String(t));
          arr.forEach((entry) => {
            const isObj = entry && typeof entry === 'object';
            const tag = isObj ? (entry.name || entry.label || String(entry)) : String(entry);
            const isUnconfirmed = Boolean(isObj && (entry.suggested || entry.unconfirmed || entry.confirmed === false));
            const chip = document.createElement('span');
            chip.className = 'chip chip--tag' + (isUnconfirmed ? ' chip--pending' : '');
            chip.textContent = tag;
            if (isUnconfirmed) {
              chip.title = `Confirm tag: ${tag}`;
              chip.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = new URL('/api/media/tags/add', window.location.origin);
                url.searchParams.set('path', f.path || '');
                url.searchParams.set('tag', tag);
                const resp = await fetch(url.toString(), {method: 'POST'});
                if (resp.ok) {
                  const j = await resp.json();
                  const list = j?.data?.tags || j?.tags || [];
                  apply(list);
                }
              });
            }
            else {
              chip.title = `Filter by tag: ${tag}`;
              chip.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!libraryTagFilters.includes(tag)) libraryTagFilters.push(tag);
                setLocalStorageJSON('filters.tags', libraryTagFilters);
                if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
                if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
                currentPage = 1;
                loadLibrary();
              });
            }
            cont.appendChild(chip);
          });
          ensureTagRegistry().then(() => renderSuggestions('tag', arr));
        };
        function startEdit() {
          if (!f.path || td._editing) return;
          td._editing = true;
          apply(f.tags || currentTagNames);
          const input = document.createElement('span');
          input.className = 'chip-input';
          input.contentEditable = 'true';
          input.setAttribute('role', 'textbox');
          input.setAttribute('aria-label', 'Add tags');
          input.dataset.placeholder = 'Add tag…';
          cont.appendChild(input);

          async function commitTokens(tokens) {
            const parts = (tokens || []).map((s) => String(s || '').trim()).filter(Boolean);
            if (!parts.length) return;
            for (const p of parts) {
              const url = new URL('/api/media/tags/add', window.location.origin);
              url.searchParams.set('path', f.path);
              url.searchParams.set('tag', p);
              await fetch(url.toString(), {method: 'POST'});
            }
            const d = await fetchMetadataCached(f.path).catch(() => null);
            if (!td.isConnected) return;
            apply(d?.tags || d?.tag_names || []);
            if (td._editing) {
              cont.appendChild(input);
              placeCaretAtEnd(input);
            }
          }

          function placeCaretAtEnd(el) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          function tokenize(str) {
            return String(str || '').split(/[\,\n]+/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
          input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              const raw = input.textContent || '';
              input.textContent = '';
              commitTokens(tokenize(raw));
            }
            else if (e.key === ',') {
              e.preventDefault();
              const raw = input.textContent || '';
              input.textContent = '';
              commitTokens(tokenize(raw));
            }
            else if (e.key === 'Escape') {
              e.preventDefault();
              td._editing = false;
              apply(f.tags || currentTagNames);
            }
          });
          input.addEventListener('blur', () => {
            if (!td._editing) return;
            const raw = (input.textContent || '').trim();
            td._editing = false;
            if (raw) commitTokens(tokenize(raw));
            else apply(f.tags || currentTagNames);
          });
          input.focus();
        }
        td.addEventListener('dblclick', (e) => {
          if (e.target.closest('.chip') || e.target.closest('.chip-suggest')) return;
          startEdit();
        });
        const ensureTagRegistry = () => loadRegistry('tags');
        const renderSuggestions = (kind, existing) => {
          const baseName = (f?.name || (f?.path ? f.path.split('/').pop() : '') || '').replace(/\.[^.]+$/, '');
          const baseLower = baseName.toLowerCase();
          const norm = (s) => String(s || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
          const baseNorm = ' ' + norm(baseLower) + ' ';
          const containsWord = (needle) => {
            const n = ' ' + norm(needle) + ' ';
            return n.trim().split(/\s+/) .every((tok) => baseNorm.includes(' ' + tok + ' '));
          };
          const names = (window.__REG.tags || []).map((t) => t?.name).filter(Boolean);
          const have = new Set((existing || []).map((x) => String(x).toLowerCase()));
          const sug = [];
          for (const nm of names) {
            const low = String(nm).toLowerCase();
            if (have.has(low)) continue;
            if (containsWord(low)) sug.push(nm);
            if (sug.length >= 6) break;
          }
          if (!sug.length) return;
          const wrap = document.createElement('div');
          wrap.className = 'chips-suggestions-inline';
          sug.forEach((nm) => {
            const chip = document.createElement('span');
            chip.className = 'chip chip-suggest';
            chip.textContent = nm;
            chip.title = 'Add tag';
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              const url = new URL('/api/media/tags/add', window.location.origin);
              url.searchParams.set('path', f.path || '');
              url.searchParams.set('tag', nm);
              const resp = await fetch(url.toString(), {method: 'POST'});
              if (resp.ok) {
                const j = await resp.json();
                const list = j?.data?.tags || j?.tags || [];
                apply(list);
              }
            });
            wrap.appendChild(chip);
          });
          cont.appendChild(wrap);
        };
        let initial = f && (f.tags || f.tag_names);
        if (Array.isArray(initial)) {
          ensureTagRegistry().then(() => apply(initial));
        }
        else if (f && f.path) {
          ensureTagRegistry().then(() => {
            fetchMetadataCached(f.path).then((d) => {
              if (!td.isConnected) return;
              apply(d && (d.tags || d.tag_names || []));
            });
          });
        }
        else {
          ensureTagRegistry().then(() => apply([]));
        }
      }});

    return columns;
  }
  // Artifact/sidecar presence helpers
  function hasArtifact(f, keys) {
    for (const k of keys) {
      if (f && f[k]) {
        return true;
      }
    }
    const art = f && f.artifacts || {};
    for (const k of keys) {
      if (art && art[k]) return true;
    }
    const sc = f && f.sidecars;
    if (Array.isArray(sc)) {
      for (const k of keys) {
        if (sc.includes(k)) return true;
      }
    }
    return false;
  }
  // todo @copilot redundant
  const ART_COLS = [
    {id: 'art-metadata', label: 'Metadata', keys: ['has_metadata', 'metadata'], width: 54},
    {id: 'art-thumbnail', label: 'Thumbnail', keys: ['has_thumbnail', 'thumbnail', 'thumbnails'], width: 78},
    {id: 'art-sprites', label: 'Sprites', keys: ['has_sprites', 'sprites'], width: 64},
    {id: 'art-preview', label: 'Preview', keys: ['has_preview', 'preview', 'previewUrl'], width: 60},
    {id: 'art-scenes', label: 'Scenes', keys: ['has_scenes', 'scenes', 'markers'], width: 60},
    {id: 'art-phash', label: 'pHash', keys: ['has_phash', 'phash'], width: 60},
    {id: 'art-heatmaps', label: 'Heatmaps', keys: ['has_heatmaps', 'heatmaps'], width: 74},
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
        if (!present && ac.id === 'art-metadata' && f && f.path) {
          fetchMetadataCached(f.path).then((d) => {
            if (!td.isConnected) return;
            apply(Boolean(d));
          });
        }
        td.appendChild(span);
      }});
  }
  // Merged Artifacts column using chips UI (visible by default)
  // Widen merged Artifacts column default width so chips do not wrap by default
  DEFAULT_COLS.push({ id: 'artifacts', label: 'Artifacts', width: 520, visible: true,
    render: (td, f) => {
      const cont = document.createElement('div');
      cont.className = 'chips-list';
      td.appendChild(cont);
      const status = {};
      const pres = (keys) => hasArtifact(f, keys);
      // todo @copilot redundant
      status.metadata = pres(['has_metadata', 'metadata']);
      status.thumbnail = pres(['has_thumbnail', 'thumbnail', 'thumbnails']);
      status.sprites = pres(['has_sprites', 'sprites']);
      status.preview = pres(['has_preview', 'preview', 'previewUrl']);
      status.markers = pres(['has_scenes', 'scenes', 'markers']);
      status.heatmaps = pres(['has_heatmaps', 'heatmaps']);
      status.phash = pres(['has_phash', 'phash']);
      const keys = ['metadata', 'thumbnail', 'sprites', 'preview', 'markers', 'heatmaps', 'phash'];
      renderArtifactChips(cont, f.path || '', { style: 'chip', keys, status });
    }});

  // Performers column (chips). Visible by default; wide to avoid wrapping.
  DEFAULT_COLS.push({ id: 'performers', label: 'Performers', width: 340, visible: true,
    render: (td, f) => {
      const cont = document.createElement('div');
      cont.className = 'chips-list performers-chips';
      td.appendChild(cont);
      let currentPerformerNames = [];
      const apply = (names) => {
        cont.innerHTML = '';
        const arr = Array.isArray(names) ? names.filter(Boolean) : [];
        currentPerformerNames = arr.map((n) => typeof n === 'object' && n ? (n.name || n.label || String(n)) : String(n));
        arr.forEach((entry) => {
          const isObj = entry && typeof entry === 'object';
          const name = isObj ? (entry.name || entry.label || String(entry)) : String(entry);
          const isUnconfirmed = Boolean(isObj && (entry.suggested || entry.unconfirmed || entry.confirmed === false));
          const chip = document.createElement('span');
          chip.className = 'chip chip--performer' + (isUnconfirmed ? ' chip--pending' : '');
          chip.textContent = name;
          if (isUnconfirmed) {
            chip.title = `Confirm performer: ${name}`;
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              const url = new URL('/api/media/performers/add', window.location.origin);
              url.searchParams.set('path', f.path || '');
              url.searchParams.set('performer', name);
              const resp = await fetch(url.toString(), {method: 'POST'});
              if (resp.ok) {
                const j = await resp.json();
                const list = j?.data?.performers || j?.performers || [];
                apply(list);
              }
            });
          }
          else {
            chip.title = `Filter by performer: ${name}`;
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              if (!libraryPerformerFilters.includes(name)) libraryPerformerFilters.push(name);
              setLocalStorageJSON('filters.performers', libraryPerformerFilters);
              if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
              if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
              currentPage = 1;
              loadLibrary();
            });
          }
          cont.appendChild(chip);
        });
        // Suggestions (show even if some present, limited, exclude existing)
        ensurePerformerRegistry().then(() => renderSuggestions('performer', arr));
      };
      // Inline edit using contentEditable chip input (keeps chips visible)
      function startEdit() {
        if (!f.path || td._editing) return;
        td._editing = true;
        // Render current chips (and suggestions) then append an inline chip-input
        apply(f.performers || currentPerformerNames);
        const input = document.createElement('span');
        input.className = 'chip-input';
        input.contentEditable = 'true';
        input.setAttribute('role', 'textbox');
        input.setAttribute('aria-label', 'Add performers');
        input.dataset.placeholder = 'Add performer…';
        cont.appendChild(input);

        async function commitTokens(tokens) {
          const parts = (tokens || []).map((s) => String(s || '').trim()).filter(Boolean);
          if (!parts.length) return;
          for (const p of parts) {
            const url = new URL('/api/media/performers/add', window.location.origin);
            url.searchParams.set('path', f.path);
            url.searchParams.set('performer', p);
            await fetch(url.toString(), {method: 'POST'});
          }
          // Refresh chips; remain in edit if td still editing
          const d = await fetchMetadataCached(f.path).catch(() => null);
          if (!td.isConnected) return;
          apply(d?.performers || d?.perfs || d?.actors || []);
          if (td._editing) {
            cont.appendChild(input);
            placeCaretAtEnd(input);
          }
        }

        function placeCaretAtEnd(el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }

        function tokenize(str) {
          return String(str || '').split(/[,\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }

        input.addEventListener('keydown', (e) => {
          // Keep typing isolated from global shortcuts (space, arrows, etc.)
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            const raw = input.textContent || '';
            input.textContent = '';
            commitTokens(tokenize(raw));
          }
          else if (e.key === ',') {
            e.preventDefault();
            const raw = input.textContent || '';
            input.textContent = '';
            commitTokens(tokenize(raw));
          }
          else if (e.key === 'Escape') {
            e.preventDefault();
            td._editing = false;
            apply(f.performers || currentPerformerNames);
          }
        });
        input.addEventListener('blur', () => {
          if (!td._editing) return;
          const raw = (input.textContent || '').trim();
          td._editing = false;
          if (raw) commitTokens(tokenize(raw));
          else apply(f.performers || currentPerformerNames);
        });
        input.focus();
      }
      td.addEventListener('dblclick', (e) => {
        if (e.target.closest('.chip') || e.target.closest('.chip-suggest')) return; // avoid edit when clicking existing chips
        startEdit();
      });
      const ensurePerformerRegistry = () => loadRegistry('performers');
      const renderSuggestions = (kind, existing) => {
        const baseName = (f?.name || (f?.path ? f.path.split('/').pop() : '') || '').replace(/\.[^.]+$/, '');
        const baseLower = baseName.toLowerCase();
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const baseNorm = ' ' + norm(baseLower) + ' ';
        const containsWord = (needle) => {
          const n = ' ' + norm(needle) + ' ';
          return n.trim().split(/\s+/).every((tok) => baseNorm.includes(' ' + tok + ' '));
        };
        const names = (window.__REG.performers || []).map((p) => p?.name).filter(Boolean);
        const have = new Set((existing || []).map((x) => String(x).toLowerCase()));
        const sug = [];
        for (const nm of names) {
          const low = String(nm).toLowerCase();
          if (have.has(low)) continue;
          if (containsWord(low)) sug.push(nm);
          if (sug.length >= 6) break;
        }
        if (!sug.length) return;
        // Append suggestions block
        const wrap = document.createElement('div');
        wrap.className = 'chips-suggestions-inline';
        sug.forEach((nm) => {
          const chip = document.createElement('span');
          chip.className = 'chip chip-suggest';
          chip.textContent = nm;
          chip.title = 'Add performer';
          chip.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = new URL('/api/media/performers/add', window.location.origin);
            url.searchParams.set('path', f.path || '');
            url.searchParams.set('performer', nm);
            const resp = await fetch(url.toString(), {method: 'POST'});
            if (resp.ok) {
              const j = await resp.json();
              const list = j?.data?.performers || j?.performers || [];
              apply(list);
            }
          });
          wrap.appendChild(chip);
        });
        cont.appendChild(wrap);
      };
      // Prefer direct row data; fallback to metadata fetch
      let initial = f && (f.performers || f.perfs || f.actors);
      if (Array.isArray(initial)) {
        ensurePerformerRegistry().then(() => apply(initial));
      }
      else if (f && f.path) {
        ensurePerformerRegistry().then(() => {
          fetchMetadataCached(f.path).then((d) => {
            if (!td.isConnected) return;
            apply(d && (d.performers || d.perfs || d.actors || []));
          });
        });
      }
      else {
        ensurePerformerRegistry().then(() => apply([]));
      }
    }});

  // Tags column (chips). Visible by default; wide to avoid wrapping.
  DEFAULT_COLS.push({ id: 'tags', label: 'Tags', width: 340, visible: true,
    render: (td, f) => {
      const cont = document.createElement('div');
      cont.className = 'chips-list tags-chips';
      td.appendChild(cont);
      let currentTagNames = [];
      const apply = (tags) => {
        cont.innerHTML = '';
        const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
        currentTagNames = arr.map((t) => typeof t === 'object' && t ? (t.name || t.label || String(t)) : String(t));
        arr.forEach((entry) => {
          const isObj = entry && typeof entry === 'object';
          const tag = isObj ? (entry.name || entry.label || String(entry)) : String(entry);
          const isUnconfirmed = Boolean(isObj && (entry.suggested || entry.unconfirmed || entry.confirmed === false));
          const chip = document.createElement('span');
          chip.className = 'chip chip--tag' + (isUnconfirmed ? ' chip--pending' : '');
          chip.textContent = tag;
          if (isUnconfirmed) {
            chip.title = `Confirm tag: ${tag}`;
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              const url = new URL('/api/media/tags/add', window.location.origin);
              url.searchParams.set('path', f.path || '');
              url.searchParams.set('tag', tag);
              const resp = await fetch(url.toString(), {method: 'POST'});
              if (resp.ok) {
                const j = await resp.json();
                const list = j?.data?.tags || j?.tags || [];
                apply(list);
              }
            });
          }
          else {
            chip.title = `Filter by tag: ${tag}`;
            chip.addEventListener('click', async (e) => {
              e.stopPropagation();
              if (!libraryTagFilters.includes(tag)) libraryTagFilters.push(tag);
              setLocalStorageJSON('filters.tags', libraryTagFilters);
              if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
              if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
              currentPage = 1;
              loadLibrary();
            });
          }
          cont.appendChild(chip);
        });
        ensureTagRegistry().then(() => renderSuggestions('tag', arr));
      };
      function startEdit() {
        if (!f.path || td._editing) return;
        td._editing = true;
        // Render current chips then append contentEditable chip-input
        apply(f.tags || currentTagNames);
        const input = document.createElement('span');
        input.className = 'chip-input';
        input.contentEditable = 'true';
        input.setAttribute('role', 'textbox');
        input.setAttribute('aria-label', 'Add tags');
        input.dataset.placeholder = 'Add tag…';
        cont.appendChild(input);

        async function commitTokens(tokens) {
          const parts = (tokens || []).map((s) => String(s || '').trim()).filter(Boolean);
          if (!parts.length) return;
          for (const p of parts) {
            const url = new URL('/api/media/tags/add', window.location.origin);
            url.searchParams.set('path', f.path);
            url.searchParams.set('tag', p);
            await fetch(url.toString(), {method: 'POST'});
          }
          const d = await fetchMetadataCached(f.path).catch(() => null);
          if (!td.isConnected) return;
          apply(d?.tags || d?.tag_names || []);
          if (td._editing) {
            cont.appendChild(input);
            placeCaretAtEnd(input);
          }
        }

        function placeCaretAtEnd(el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
        function tokenize(str) {
          return String(str || '').split(/[,\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
        input.addEventListener('keydown', (e) => {
          // Keep typing isolated from global shortcuts
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            const raw = input.textContent || '';
            input.textContent = '';
            commitTokens(tokenize(raw));
          }
          else if (e.key === ',') {
            e.preventDefault();
            const raw = input.textContent || '';
            input.textContent = '';
            commitTokens(tokenize(raw));
          }
          else if (e.key === 'Escape') {
            e.preventDefault();
            td._editing = false;
            apply(f.tags || currentTagNames);
          }
        });
        input.addEventListener('blur', () => {
          if (!td._editing) return;
          const raw = (input.textContent || '').trim();
          td._editing = false;
          if (raw) commitTokens(tokenize(raw));
          else apply(f.tags || currentTagNames);
        });
        input.focus();
      }
      td.addEventListener('dblclick', (e) => {
        if (e.target.closest('.chip') || e.target.closest('.chip-suggest')) return;
        startEdit();
      });
      const ensureTagRegistry = () => loadRegistry('tags');
      const renderSuggestions = (kind, existing) => {
        const baseName = (f?.name || (f?.path ? f.path.split('/').pop() : '') || '').replace(/\.[^.]+$/, '');
        const baseLower = baseName.toLowerCase();
        const norm = (s) => String(s || '').toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        const baseNorm = ' ' + norm(baseLower) + ' ';
        const containsWord = (needle) => {
          const n = ' ' + norm(needle) + ' ';
          return n.trim().split(/\s+/)
            .every((tok) => baseNorm.includes(' ' + tok + ' '));
        };
        const names = (window.__REG.tags || []).map((t) => t?.name).filter(Boolean);
        const have = new Set((existing || []).map((x) => String(x).toLowerCase()));
        const sug = [];
        for (const nm of names) {
          const low = String(nm).toLowerCase();
          if (have.has(low)) continue;
          if (containsWord(low)) sug.push(nm);
          if (sug.length >= 6) break;
        }
        if (!sug.length) return;
        const wrap = document.createElement('div');
        wrap.className = 'chips-suggestions-inline';
        sug.forEach((nm) => {
          const chip = document.createElement('span');
          chip.className = 'chip chip-suggest';
          chip.textContent = nm;
          chip.title = 'Add tag';
          chip.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = new URL('/api/media/tags/add', window.location.origin);
            url.searchParams.set('path', f.path || '');
            url.searchParams.set('tag', nm);
            const resp = await fetch(url.toString(), {method: 'POST'});
            if (resp.ok) {
              const j = await resp.json();
              const list = j?.data?.tags || j?.tags || [];
              apply(list);
            }
          });
          wrap.appendChild(chip);
        });
        cont.appendChild(wrap);
      };
      let initial = f && (f.tags || f.tag_names);
      if (Array.isArray(initial)) {
        ensureTagRegistry().then(() => apply(initial));
      }
      else if (f && f.path) {
        ensureTagRegistry().then(() => {
          fetchMetadataCached(f.path).then((d) => {
            if (!td.isConnected) return;
            apply(d && (d.tags || d.tag_names || []));
          });
        });
      }
      else {
        ensureTagRegistry().then(() => apply([]));
      }
    }});
  // @todo copilot: these functions should be with utils
  function pad2(n) {
    n = Number(n) || 0;
    return n < 10 ? '0' + n : String(n);
  }
  function formatDateTime(sec) {
    const t = Number(sec) || 0;
    if (!t) return '';
    const d = new Date(t * 1000);
    const Y = d.getFullYear();
    const M = pad2(d.getMonth() + 1);
    const D = pad2(d.getDate());
    const h = pad2(d.getHours());
    const m = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    return `${Y}/${M}/${D} ${h}:${m}:${s}`;
  }
  function loadCols() {
    try {
      const raw = getLocalStorageItem(COL_LS_KEY, {type: 'json', fallback: null});
      if (!Array.isArray(raw) || !raw.length) {
        return DEFAULT_COLS.map((c) => ({ ...c }));
      }
      // Preserve saved order: merge each saved entry with current default (if exists)
      const defMap = new Map(DEFAULT_COLS.map((d) => [d.id, d]));
      const seen = new Set();
      const merged = [];
      for (const r of raw) {
        if (!r || !r.id) continue;
        const def = defMap.get(r.id);
        if (def) {
          merged.push({ ...def, ...r });
          seen.add(r.id);
        }
        else {
          // Unknown (legacy or removed) column id: keep minimal structure
          merged.push({ ...r });
        }
      }
      // Append any new default columns not present in saved set, preserving their relative default order
      for (const d of DEFAULT_COLS) {
        if (!seen.has(d.id)) merged.push({ ...d });
      }
      // Ensure the select checkbox column stays first if present
      const selIdx = merged.findIndex((c) => c.id === 'select');
      if (selIdx > 0) {
        const [sel] = merged.splice(selIdx, 1);
        merged.unshift(sel);
      }
      return merged;
    }
    catch (_) {
      return DEFAULT_COLS.map((c) => ({ ...c}));
    }
  }
  function saveCols(cols) {
    setLocalStorageItem(String(COL_LS_KEY), cols, {type: 'json'});
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
    const colsReset = panel.querySelector('#listColumnsReset');
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
      try {
        const raw = getLocalStorageItem(PAGE_SIZE_LS_KEY);
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return Math.min(MAX_LIST_PAGE_SIZE, n);
        return 50;
      }
      catch (_) {
        return 50;
      }
    })();
    // List filters state and helpers (persisted per tab)
    const LIST_FILTERS_LS_KEY = 'list.filters.v1';
    function loadListFilters() {
      try {
        return getLocalStorageJSON(LIST_FILTERS_LS_KEY, {}) || {};
      }
      catch (_) {
        return {};
      }
    }
    function saveListFilters(obj) {
      setLocalStorageJSON(LIST_FILTERS_LS_KEY, obj || {});
    }
    let listFilters = loadListFilters();
    function hasAnyFilters(obj) {
      return obj && Object.keys(obj).length > 0;
    }
    // Wrap toggle helpers
    function wrapEnabled() {
      try {
        return getLocalStorageBoolean(WRAP_LS_KEY, true);
      }
      catch (_) {
        return true;
      }
    }
    function setWrapEnabled(v) {
      setLocalStorageBoolean(WRAP_LS_KEY, Boolean(v));
    }
    function applyWrapUI() {
      const enabled = wrapEnabled();
      if (table) table.classList.toggle('nowrap', !enabled);
      if (wrapBtn) {
        wrapBtn.textContent = `Wrap: ${enabled ? 'On' : 'Off'}`;
        wrapBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      }
    }
    if (wrapBtn) {
      applyWrapUI();
      wrapBtn.addEventListener('click', () => {
        setWrapEnabled(!wrapEnabled());
        applyWrapUI();
      });
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
          if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
          }
        });
        return out.sort();
      }
      catch (_) {
        return [];
      }
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
      // todo @copilot redundant
      const keys = ['metadata', 'thumbnail', 'sprites', 'markers', 'subtitles', 'heatmaps', 'faces', 'preview'];
      return keys.some((k) => listFilters && listFilters[k]);
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
      // todo @copilot redundant
      const keyMap = { format: 'format', codec: 'vcodec', vcodec: 'vcodec', acodec: 'acodec', bitrate: 'bitrate', duration: 'duration', size: 'size', width: 'width', height: 'height', mtime: 'mtime', created: 'ctime', artifacts: 'artifacts', tags: 'tags', performers: 'performers' };
      const key = keyMap[colId] || null;
      function row(el) {
        const r = document.createElement('div');
        r.className = 'row';
        if (el) r.appendChild(el);
        return r;
      }
      function btn(label) {
        const b = document.createElement('button');
        b.className = 'btn-sm';
        b.textContent = label;
        return b;
      }
      if (key === 'format' || key === 'vcodec' || key === 'acodec') {
        const values = key === 'format' ? uniqueValues(filesCache, (f) => {
          const p = f.path || f.name || '';
          const m = /\.([^.\/]+)$/.exec(p);
          return m ? m[1].toLowerCase() : '';
        }) : (key === 'vcodec'
          ? uniqueValues(filesCache, (f) => f.video_codec || f.vcodec || f.vcodec_name || '')
          : uniqueValues(filesCache, (f) => f.audio_codec || f.acodec || f.acodec_name || ''));
        const selected = (listFilters[key] && Array.isArray(listFilters[key].in)) ? new Set(listFilters[key].in.map(String)) : new Set();
        const wrap = document.createElement('div');
        wrap.className = 'values';
        values.slice(0, 50).forEach((val) => {
          const lab = document.createElement('label');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = selected.has(val);
          cb.value = val;
          const sp = document.createElement('span');
          sp.textContent = val || '—';
          lab.appendChild(cb);
          lab.appendChild(sp);
          wrap.appendChild(lab);
        });
        menu.appendChild(wrap);
        const footer = document.createElement('div');
        footer.className = 'footer';
        const clearB = btn('Clear');
        const applyB = btn('Apply');
        clearB.addEventListener('click', async () => {
          delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        applyB.addEventListener('click', async () => {
          const vals = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
          if (vals.length) setFilterForKey(key, { in: vals });
          else delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        footer.appendChild(clearB);
        footer.appendChild(applyB);
        menu.appendChild(footer);
      }
      else if (key === 'bitrate' || key === 'duration' || key === 'size' || key === 'width' || key === 'height') {
        const cur = listFilters[key] || {};
        const sel = document.createElement('select');
        sel.className = 'control-select';
        // todo @copilot refactor
        sel.innerHTML = '<option value="">—</option><option value="gt">&gt;</option><option value="ge">≥</option><option value="lt">&lt;</option><option value="le">≤</option><option value="eq">=</option>';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'chips-input';
        inp.placeholder = 'value';
        const op = cur.gt != null ? 'gt' : cur.ge != null ? 'ge' : cur.lt != null ? 'lt' : cur.le != null ? 'le' : cur.eq != null ? 'eq' : '';
        if (op) sel.value = op;
        const vv = (cur.gt ?? cur.ge ?? cur.lt ?? cur.le ?? cur.eq);
        if (vv != null) inp.value = String(vv);
        const r = document.createElement('div');
        r.className = 'row';
        r.appendChild(sel);
        r.appendChild(inp);
        menu.appendChild(r);
        const footer = document.createElement('div');
        footer.className = 'footer';
        const clearB = btn('Clear');
        const applyB = btn('Apply');
        clearB.addEventListener('click', async () => {
          delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        applyB.addEventListener('click', async () => {
          const op = sel.value;
          const v = Number(inp.value);
          if (op && Number.isFinite(v)) setFilterForKey(key, { [op]: v });
          else delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        footer.appendChild(clearB);
        footer.appendChild(applyB);
        menu.appendChild(footer);
      }
      else if (key === 'mtime' || key === 'ctime') {
        const cur = listFilters[key] || {};
        const mkInp = (val) => {
          const i = document.createElement('input');
          i.type = 'datetime-local';
          i.className = 'chips-input';
          if (val) {
            const d = new Date(val * 1000);
            const pad = (n) => String(n).padStart(2, '0');
            i.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          } return i;
        };
        const afterInp = mkInp(cur.after);
        const beforeInp = mkInp(cur.before);
        const wrap = document.createElement('div');
        wrap.className = 'row';
        wrap.appendChild(afterInp);
        const span = document.createElement('span');
        span.className = 'hint-sm';
        span.textContent = 'to';
        wrap.appendChild(span);
        wrap.appendChild(beforeInp);
        menu.appendChild(wrap);
        const footer = document.createElement('div');
        footer.className = 'footer';
        const clearB = btn('Clear');
        const applyB = btn('Apply');
        clearB.addEventListener('click', async () => {
          delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        applyB.addEventListener('click', async () => {
          const toEpoch = (el) => {
            const v = el.value;
            if (!v) return null;
            const t = new Date(v).getTime();
            return Number.isFinite(t) ? Math.floor(t / 1000) : null;
          };
          const a = toEpoch(afterInp);
          const b = toEpoch(beforeInp);
          const obj = {};
          if (a != null) obj.after = a;
          if (b != null) obj.before = b;
          if (Object.keys(obj).length) setFilterForKey(key, obj);
          else delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        footer.appendChild(clearB);
        footer.appendChild(applyB);
        menu.appendChild(footer);
      }
      else if (colId === 'artifacts') {
        // todo @copilot redundant
        const items = [
          { k: 'metadata', label: 'Metadata' },
          { k: 'thumbnail', label: 'Thumbnail' },
          { k: 'sprites', label: 'Sprites' },
          { k: 'markers', label: 'Scenes' },
          { k: 'subtitles', label: 'Subtitles' },
          { k: 'heatmaps', label: 'Heatmaps' },
          { k: 'phash', label: 'pHash' },
          { k: 'preview', label: 'Preview' },
        ];
        const wrap = document.createElement('div');
        wrap.className = 'values';
        items.forEach(({k, label}) => {
          const lab = document.createElement('label');
          const sel = document.createElement('select');
          sel.className = 'control-select';
          sel.dataset.key = k;
          sel.innerHTML = '<option value="">Any</option><option value="yes">Yes</option><option value="no">No</option>';
          const cur = listFilters[k];
          if (cur && 'bool' in cur) sel.value = cur.bool === true ? 'yes' : (cur.bool === false ? 'no' : '');
          const sp = document.createElement('span');
          sp.textContent = label;
          lab.appendChild(sp);
          lab.appendChild(sel);
          wrap.appendChild(lab);
          sel.addEventListener('change', async () => {
            const v = sel.value;
            if (v === 'yes') listFilters[k] = { bool: true };
            else if (v === 'no') listFilters[k] = { bool: false };
            else delete listFilters[k];
            saveListFilters(listFilters);
            page = 1;
            await loadPage();
          });
        });
        menu.appendChild(wrap);
        const footer = document.createElement('div');
        footer.className = 'footer';
        const clearB = btn('Clear');
        clearB.addEventListener('click', async () => {
          items.forEach(({k}) => {
            delete listFilters[k];
          });
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        footer.appendChild(clearB);
        menu.appendChild(footer);
      }
      else if (key === 'tags' || key === 'performers') {
        const isTags = key === 'tags';
        const values = uniqueValues(filesCache, (f) => {
          const arr = isTags ? (f.tags || f.tag_names || []) : (f.performers || f.perfs || f.actors || []);
          return Array.isArray(arr) ? arr.map(String).join('|') : '';
        }).flatMap((s) => (s ? s.split('|') : []));
        const uniq = Array.from(new Set(values.filter(Boolean))).sort();
        const cur = listFilters[key] || {};
        const selIn = new Set(Array.isArray(cur.in) ? cur.in.map(String) : []);
        const selNot = new Set(Array.isArray(cur.not_in) ? cur.not_in.map(String) : []);
        const mkGroup = (title, selectedSet) => {
          const wrap = document.createElement('div');
          wrap.className = 'values';
          const hdr = document.createElement('div');
          hdr.className = 'hint-sm';
          hdr.textContent = title;
          hdr.style.margin = '4px 0 2px';
          menu.appendChild(hdr);
          uniq.slice(0, 200).forEach((val) => {
            const lab = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selectedSet.has(val);
            cb.value = val;
            const sp = document.createElement('span');
            sp.textContent = val;
            lab.appendChild(cb);
            lab.appendChild(sp);
            wrap.appendChild(lab);
          });
          return wrap;
        };
        const incWrap = mkGroup('Include any of', selIn);
        const excWrap = mkGroup('Exclude any of', selNot);
        menu.appendChild(incWrap);
        menu.appendChild(excWrap);
        const footer = document.createElement('div');
        footer.className = 'footer';
        const clearB = btn('Clear');
        const applyB = btn('Apply');
        clearB.addEventListener('click', async () => {
          delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        applyB.addEventListener('click', async () => {
          const valsIn = Array.from(incWrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
          const valsNot = Array.from(excWrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
          const obj = {};
          if (valsIn.length) obj.in = valsIn;
          if (valsNot.length) obj.not_in = valsNot;
          if (Object.keys(obj).length) setFilterForKey(key, obj);
          else delete listFilters[key];
          saveListFilters(listFilters);
          closeFilterMenu();
          page = 1;
          await loadPage();
        });
        footer.appendChild(clearB);
        footer.appendChild(applyB);
        menu.appendChild(footer);
      }
      else {
        const p = document.createElement('div');
        p.className = 'row';
        const s = document.createElement('span');
        s.className = 'hint-sm';
        s.textContent = 'No filters for this column';
        p.appendChild(s);
        menu.appendChild(p);
      }
      // Position near header
      const rect = anchorTh.getBoundingClientRect();
      const hostRect = panel.getBoundingClientRect();
      menu.style.left = `${Math.max(0, rect.left - hostRect.left)}px`;
      menu.style.top = `${Math.max(0, rect.bottom - hostRect.top + 4)}px`;
      panel.appendChild(menu);
      filterMenuEl = menu;
      setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    }
    if (pageSizeSelect) {
      pageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, Number(pageSize) || 50));
      pageSizeSelect.value = String(pageSize);
      pageSizeSelect.addEventListener('change', () => {
        let v = Number(pageSizeSelect.value);
        if (!Number.isFinite(v) || v <= 0) v = pageSize;
        const safe = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, v));
        if (String(safe) !== pageSizeSelect.value) {
          pageSizeSelect.value = String(safe);
        }
        pageSize = safe;
        setLocalStorageItem(PAGE_SIZE_LS_KEY, safe);
        page = 1;
        loadPage();
      });
    }
    let sortState = (() => {
      try {
        return getLocalStorageJSON(SORT_LS_KEY, null) || null;
      }
      catch (_) {
        return null;
      }
    })();
    // Drop sort state for unknown/removed columns (e.g., legacy 'res')
    const KNOWN_COL_IDS = new Set(DEFAULT_COLS.map((c) => c.id));
    if (sortState && !KNOWN_COL_IDS.has(sortState.id)) {
      sortState = null;
      setLocalStorageJSON(SORT_LS_KEY, null);
    }
    function saveSortState() {
      setLocalStorageJSON(SORT_LS_KEY, sortState || null);
    }
    function sortKey(colId, f) {
      // @todo copilot redundant
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
      case 'format': {
        const p = f.path || f.name || '';
        const m = /\.([^.\/]+)$/.exec(p);
        return m ? m[1].toLowerCase() : '';
      }
      case 'bitrate': {
        const dur = Number(f.duration) || 0;
        const size = Number(f.size) || 0;
        return (dur > 0 && size > 0) ? (size * 8 / dur) : 0;
      }
      case 'created': return Number(f.ctime) || Number(f.birthtime) || Number(f.mtime) || 0;
      default: return String(f[colId] ?? '').toLowerCase();
      }
    }
    function sortFiles(files) {
      if (!sortState || !sortState.id) return files;
      const id = sortState.id;
      const asc = sortState.asc !== false;
      const arr = files.slice();
      arr.sort((a, b) => {
        const va = sortKey(id, a);
        const vb = sortKey(id, b);
        const na = typeof va === 'number';
        const nb = typeof vb === 'number';
        let cmp = 0;
        if (na && nb) cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb));
        return asc ? cmp : -cmp;
      });
      return arr;
    }
    function renderHead() {
      headRow.innerHTML = '';
      const visibleIds = cols.filter((col) => col.visible).map((col) => col.id);
      devLog('debug', 'list-cols', 'renderHead', visibleIds);
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
        // Ensure drag handle lives inside the wrap so it stays inline with title
        const dragHandle = th.querySelector('.col-drag-handle');
        if (dragHandle && wrapEl && !wrapEl.contains(dragHandle)) {
          wrapEl.prepend(dragHandle);
        }
        const rz = th.querySelector('.col-resizer');
        if (wrapEl) {
          if (c.id === 'select') {
            const master = document.createElement('input');
            master.type = 'checkbox';
            master.id = 'listSelectAll';
            master.setAttribute('aria-label', 'Select all on page');
            wrapEl.appendChild(master);
            // Remove drag and resize affordances from the select column header
            const dh = th.querySelector('.col-drag-handle');
            if (dh) dh.remove();
            if (rz) rz.remove();
          }
          else {
            const title = document.createElement('span');
            title.className = 'list-head-title';
            title.textContent = c.label;
            wrapEl.appendChild(title);
          }
          if (sortState && sortState.id === c.id) {
            const ind = document.createElement('span');
            ind.className = 'sort-ind';
            ind.style.marginLeft = '6px';
            ind.textContent = (sortState.asc !== false) ? '▲' : '▼';
            wrapEl.appendChild(ind);
          }
          // Column filter trigger
          const keyMap = {
            format: 'format',
            codec: 'vcodec',
            vcodec: 'vcodec',
            acodec: 'acodec',
            bitrate: 'bitrate',
            duration: 'duration',
            size: 'size',
            width: 'width',
            height: 'height',
            mtime: 'mtime',
            created: 'ctime',
            artifacts: 'artifacts',
            tags: 'tags',
            performers: 'performers'
          };
          const fkey = keyMap[c.id] || (c.id === 'artifacts' ? 'artifacts' : null);
          if (fkey) {
            const trig = document.createElement('span');
            trig.className = 'col-filter-trigger';
            trig.textContent = '▾';
            if ((fkey === 'artifacts' && isArtifactsFilterActive()) || (fkey !== 'artifacts' && isFilterActiveForKey(fkey))) {
              trig.style.color = '#bbf7d0';
            }
            trig.addEventListener('click', (ev) => {
              ev.stopPropagation();
              openFilterMenu(th, c.id);
            });
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
        if (c.id !== 'select' && rz) {
          rz.addEventListener('mousedown', (ev) => {
            startX = ev.clientX;
            startW = th.getBoundingClientRect().width;
            colTds = Array.from(panel.querySelectorAll(`#listTable td.col-${c.id}`));
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            ev.preventDefault();
          });
        }
        // Double-click on the resizer: auto-size column to fit the widest non-wrapping content
        if (c.id !== 'select' && rz) {
          rz.addEventListener('dblclick', (ev) => {
            ev.stopPropagation(); // prevent triggering sort on header dblclick
            const target = computeAutoWidth(panel, c.id);
            if (target) {
              const idx = cols.findIndex((x) => x.id === c.id);
              if (idx >= 0) {
                cols[idx] = { ...cols[idx], width: target };
                saveCols(cols);
                applyColumnWidths();
              }
            }
          });
        }
        th.addEventListener('dblclick', async (ev) => {
          if (c.id === 'select') return; // disable sorting for checkbox column
          if (ev.target && (ev.target.closest('.col-resizer') || ev.target.closest('.col-drag-handle'))) return;
          const numericCols = new Set(['duration', 'size', 'width', 'height', 'mtime', 'bitrate', 'created']);
          // 3-state cycle: unset -> asc/desc(default) -> opposite -> unset
          if (sortState && sortState.id === c.id) {
            if (sortState.asc === true) {
              sortState.asc = false; // asc -> desc
            }
            else if (sortState.asc === false) {
              sortState = null; // desc -> unset
            }
            else {
              sortState = { id: c.id, asc: !numericCols.has(c.id) }; // fallback
            }
          }
          else {
            // initial apply: non-numeric asc, numeric desc to match previous behavior
            sortState = { id: c.id, asc: !numericCols.has(c.id) };
          }
          saveSortState();
          // Use backend for supported sorts;
          // else fetch all pages and sort client-side
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
          const serverKey = sortState ? SERVER_SORT_MAP[c.id] : null;
          if (serverKey) {
            if (sortSelect) sortSelect.value = serverKey;
            if (orderToggle && orderToggle.dataset) {
              orderToggle.dataset.order = (sortState.asc !== false) ? 'asc' : 'desc';
              if (typeof syncOrderToggleArrow === 'function') syncOrderToggleArrow();
            }
            page = 1;
            listClientAllMode = false;
            await loadPage();
          }
          else if (sortState) {
            const CLIENT_SORT_LIMIT = 1000;
            if (Number(total) > CLIENT_SORT_LIMIT) {
              notify('Sorting by this column is not supported server-side for large libraries. Use filters or choose a supported sort.', 'info');
              return;
            }
            await loadAllAndRender();
          }
          else {
            // Unset: revert to server default sort select value
            page = 1;
            listClientAllMode = false;
            await loadPage();
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
          const path = f.path || '';
          if (!path) return;
          if (e.target && e.target.closest('.list-row-checkbox')) return; // ignore direct checkbox clicks
          // Shift-click range selection for rows
          const rowsAll = Array.from(tbody.querySelectorAll('tr[data-path]'));
          const idx = rowsAll.indexOf(tr);
          if (e.shiftKey && idx !== -1) {
            if (listLastAnchorIndex == null) {
              listLastAnchorIndex = idx;
            }
            else {
              selectedItems.clear();
              const a = Math.min(listLastAnchorIndex, idx);
              const b = Math.max(listLastAnchorIndex, idx);
              for (let i = a; i <= b; i++) {
                const p = rowsAll[i].dataset.path || '';
                if (p) selectedItems.add(p);
              }
              listLastAnchorIndex = idx;
              if (typeof updateSelectionUI === 'function') updateSelectionUI();
              if (typeof window.__updateListSelectionUI === 'function') window.__updateListSelectionUI();
              return;
            }
          }
          if (e.metaKey || e.ctrlKey) {
            if (selectedItems.has(path)) selectedItems.delete(path);
            else selectedItems.add(path);
          }
          else {
            selectedItems.clear();
            selectedItems.add(path);
            if (idx !== -1) listLastAnchorIndex = idx; // update anchor on plain click
          }
          if (typeof updateSelectionUI === 'function') updateSelectionUI();
          if (typeof window.__updateListSelectionUI === 'function') window.__updateListSelectionUI();
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
      if (typeof window.__updateListSelectionUI === 'function') window.__updateListSelectionUI();
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
    // Sync list selection UI (rows + master checkbox)
    function updateListSelectionUI() {
      const rows = Array.from(tbody.querySelectorAll('tr[data-path]'));
      let selectedOnPage = 0;
      rows.forEach((tr) => {
        const p = tr.dataset.path || '';
        const sel = selectedItems.has(p);
        if (sel) selectedOnPage++;
        tr.setAttribute('data-selected', sel ? '1' : '0');
        const cb = tr.querySelector('.list-row-checkbox');
        if (cb) cb.checked = sel;
      });
      const master = headRow.querySelector('#listSelectAll');
      if (master) {
        if (!rows.length) {
          master.checked = false;
          master.indeterminate = false;
        }
        else if (selectedOnPage === 0) {
          master.checked = false;
          master.indeterminate = false;
        }
        else if (selectedOnPage === rows.length) {
          master.checked = true;
          master.indeterminate = false;
        }
        else {
          master.checked = false;
          master.indeterminate = true;
        }
        if (!master._wired) {
          master._wired = true;
          master.addEventListener('change', () => {
            const rowsNow = Array.from(tbody.querySelectorAll('tr[data-path]'));
            if (master.checked) {
              rowsNow.forEach((r) => {
                const p = r.dataset.path;
                if (p) selectedItems.add(p);
              });
            }
            else {
              rowsNow.forEach((r) => {
                const p = r.dataset.path;
                if (p) selectedItems.delete(p);
              });
            }
            if (typeof updateSelectionUI === 'function') updateSelectionUI();
            updateListSelectionUI();
          });
        }
      }
    }
    window.__updateListSelectionUI = updateListSelectionUI;
    // Filter chips rendering helpers
    function describeFilter(key, val) {
      if (!val) return null;
      if (val.in && Array.isArray(val.in)) return key + ':' + val.in.join(',');
      if (val.not_in && Array.isArray(val.not_in)) {
        const inc = (val.in && Array.isArray(val.in) && val.in.length) ? ('+' + val.in.join(',')) : '';
        const exc = (val.not_in.length ? ('-' + val.not_in.join(',')) : '');
        return key + ':' + [inc, exc].filter(Boolean).join(' ');
      }
      if (val.bool === true) return key + ':yes';
      if (val.bool === false) return key + ':no';
      for (const op of ['gt', 'ge', 'lt', 'le', 'eq']) {
        if (val[op] != null) {
          const sym = op === 'gt' ? '>' : op === 'ge' ? '≥' : op === 'lt' ? '<' : op === 'le' ? '≤' : '=';
          return key + ':' + sym + ' ' + val[op];
        }
      }
      if (val.after != null || val.before != null) {
        const a = val.after ? 'after ' + new Date(val.after * 1000).toISOString()
          .slice(0, 16)
          .replace('T', ' ') : '';
        const b = val.before ? 'before ' + new Date(val.before * 1000).toISOString()
          .slice(0, 16)
          .replace('T', ' ') : '';
        return key + ':' + [a, b].filter(Boolean).join(' ');
      }
      return key;
    }
    function renderFilterChips() {
      const host = panel.querySelector('#listFilterChips');
      if (!host) return;
      host.innerHTML = '';
      const keys = Object.keys(listFilters || {}).filter((k) => listFilters[k] && Object.keys(listFilters[k]).length);
      if (!keys.length) {
        host.hidden = true;
        return;
      }
      keys.forEach((k) => {
        const val = listFilters[k];
        const label = describeFilter(k, val);
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.textContent = label || k;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Clear filter ' + k);
        btn.textContent = '×';
        btn.addEventListener('click', async () => {
          delete listFilters[k];
          saveListFilters(listFilters);
          page = 1;
          await loadPage();
        });
        chip.appendChild(btn);
        host.appendChild(chip);
      });
      // Clear all chip
      const clearAll = document.createElement('span');
      clearAll.className = 'filter-chip filter-chip--indicator';
      clearAll.textContent = 'Clear All';
      const btnAll = document.createElement('button');
      btnAll.textContent = '×';
      btnAll.type = 'button';
      btnAll.setAttribute('aria-label', 'Clear all filters');
      btnAll.addEventListener('click', async () => {
        listFilters = {};
        saveListFilters(listFilters);
        page = 1;
        await loadPage();
      });
      clearAll.appendChild(btnAll);
      host.appendChild(clearAll);
      host.hidden = false;
    }
    function renderColumnsPanel() {
      colsBody.innerHTML = '';
      cols.forEach((c, idx) => {
        // Skip showing the visibility toggle entry for the selection checkbox column
        if (c.id === 'select') return;
        let item;
        if (itemTpl && itemTpl.content) item = itemTpl.content.firstElementChild.cloneNode(true);
        else {
          item = document.createElement('div');
          item.className = 'list-col-item';
          const h = document.createElement('span');
          h.className = 'drag-handle';
          h.textContent = '⋮⋮';
          h.setAttribute('draggable', 'true');
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
        const handle = item.querySelector('.drag-handle');
        if (cb) {
          cb.checked = Boolean(c.visible);
          cb.addEventListener('change', () => {
            const nextVisible = Boolean(cb.checked);
            devLog('debug', 'list-cols', 'toggle', c.id, { visible: nextVisible });
            c.visible = nextVisible;
            saveCols(cols);
            renderHead();
            renderBody(filesCache);
            applyColumnWidths();
            if (c.visible) {
              const w = computeAutoWidth(panel, c.id);
              const idx = cols.findIndex((x) => x.id === c.id);
              if (w && idx >= 0) {
                cols[idx] = { ...cols[idx], width: w };
                saveCols(cols);
                applyColumnWidths();
                devLog('debug', 'list-cols', 'autosized', c.id, { width: w });
              }
            }
          });
        }
        if (lab) lab.textContent = c.label;
        if (handle) {
          handle.setAttribute('draggable', 'true');
          handle.addEventListener('dragstart', () => {
            draggingCol = c.id;
            item.classList.add('dragging');
          });
          handle.addEventListener('dragend', () => {
            draggingCol = null;
            item.classList.remove('dragging');
            item.classList.remove('drop-before');
            item.classList.remove('drop-after');
          });
        }
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
          devLog('debug', 'list-cols', 'reorder', { from: src, to: dst, before });
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
      let requestedSize = Number(size);
      if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
        requestedSize = Number(pageSize) || 50;
      }
      const safeSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, requestedSize));
      url.searchParams.set('page_size', String(safeSize));
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
        url.searchParams.set('filters', JSON.stringify(listFilters));
      }
      return url;
    }
    async function loadAllAndRender() {
      if (spinner) show(spinner);
      if (pageInfo) pageInfo.textContent = 'Loading…';
      pagerPrev.disabled = true;
      pagerNext.disabled = true;
      const perPage = 500;
      const url1 = buildLibraryURL(1, perPage);
      const r1 = await fetch(url1.toString(), {headers: {Accept: 'application/json' } });
      if (!r1.ok) {
        tbody.innerHTML = '';
        pageInfo.textContent = 'Failed';
        return;
      }
      const pl1 = await r1.json();
      const d1 = pl1?.data || {};
      const page1 = Array.isArray(d1.files) ? d1.files : [];
      const totalCount = Number(d1.total_files || page1.length || 0);
      const totalPagesGuess = totalCount ? Math.max(1, Math.ceil(totalCount / perPage)) : (page1.length === perPage ? 2 : 1);
      const all = [...page1];
      const seen = new Set(all.map((f) => f.path || ''));
      for (let pn = 2; pn <= totalPagesGuess; pn++) {
        const url = buildLibraryURL(pn, perPage);
        const r = await fetch(url.toString(), {headers: {Accept: 'application/json' } });
        if (!r.ok) break;
        const pl = await r.json();
        const d = pl?.data || {};
        const files = Array.isArray(d.files) ? d.files : [];
        for (const f of files) {
          const k = f.path || '';
          if (k && !seen.has(k)) {
            seen.add(k);
            all.push(f);
          }
        }
        if (!totalCount && files.length < perPage) break;
      }
      filesCache = all;
      total = all.length;
      listClientAllMode = true;
      renderHead();
      renderBody(filesCache);
      applyColumnWidths();
      if (!getLocalStorageItem(AUTOSIZED_ONCE_LS_KEY)) {
        const visible = cols.filter((c) => c.visible);
        for (const c of visible) {
          const w = computeAutoWidth(panel, c.id);
          const idx = cols.findIndex((x) => x.id === c.id);
          if (w && idx >= 0) cols[idx] = { ...cols[idx], width: w };
        }
        saveCols(cols);
        applyColumnWidths();
        setLocalStorageItem(AUTOSIZED_ONCE_LS_KEY, '1');
      }
      const shown = Array.isArray(filesCache) ? filesCache.length : 0;
      const totalPages = 1;
      page = 1; // logical page when showing all
      pageInfo.textContent = `Page ${page} of ${totalPages}, ${shown} files shown of ${total} total`;
      pagerPrev.disabled = true;
      pagerNext.disabled = true;
      if (spinner) hide(spinner);
      updateListSelectionUI();
      renderFilterChips();
    }
    async function loadPage() {
      if (spinner) show(spinner);
      if (pageInfo) pageInfo.textContent = 'Loading…';
      pagerPrev.disabled = true;
      pagerNext.disabled = true;
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
      if (!getLocalStorageItem(AUTOSIZED_ONCE_LS_KEY)) {
        const visible = cols.filter((c) => c.visible);
        for (const c of visible) {
          const w = computeAutoWidth(panel, c.id);
          const idx = cols.findIndex((x) => x.id === c.id);
          if (w && idx >= 0) cols[idx] = { ...cols[idx], width: w };
        }
        saveCols(cols);
        applyColumnWidths();
        setLocalStorageItem(AUTOSIZED_ONCE_LS_KEY, '1');
      }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const shown = Array.isArray(filesCache) ? filesCache.length : 0;
      pageInfo.textContent = `Page ${Math.min(page, totalPages)} of ${totalPages}, ${shown} files shown of ${total} total`;
      pagerPrev.disabled = page <= 1;
      pagerNext.disabled = page >= totalPages;
      // Bottom pager sync + hide logic
      const pageInfoBottom = panel.querySelector('#listPageInfoBottom');
      if (pageInfoBottom) pageInfoBottom.textContent = pageInfo.textContent;
      const pagerPrevBottom = panel.querySelector('#listPrevBtnBottom');
      const pagerNextBottom = panel.querySelector('#listNextBtnBottom');
      if (pagerPrevBottom) pagerPrevBottom.disabled = pagerPrev.disabled;
      if (pagerNextBottom) pagerNextBottom.disabled = pagerNext.disabled;
      const topPager = panel.querySelector('#listPagerTop');
      const bottomPager = panel.querySelector('#listPagerBottom');
      if (totalPages <= 1) {
        if (topPager) topPager.style.display = 'none';
        if (bottomPager) bottomPager.style.display = 'none';
      }
      else {
        if (topPager) topPager.style.display = 'flex';
        if (bottomPager) bottomPager.style.display = 'flex';
      }
      if (spinner) hide(spinner);
      updateListSelectionUI();
      renderFilterChips();
    }
    listLoadPageRef = loadPage;
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
    // Bottom pager wiring
    const pagerPrevBottom = panel.querySelector('#listPrevBtnBottom');
    const pagerNextBottom = panel.querySelector('#listNextBtnBottom');
    if (pagerPrevBottom) {
      pagerPrevBottom.addEventListener('click', () => {
        if (!listClientAllMode && page > 1) {
          page--;
          loadPage();
        }
      });
    }
    if (pagerNextBottom) {
      pagerNextBottom.addEventListener('click', () => {
        if (!listClientAllMode) {
          page++;
          loadPage();
        }
      });
    }
    colsBtn.addEventListener('click', () => {
      const open = isHidden(colsPanel);
      if (open) {
        renderColumnsPanel();
        showAs(colsPanel, 'block');
        const btnRect = colsBtn.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        let left = btnRect.left - panelRect.left;
        let top = btnRect.bottom - panelRect.top + 6;
        if (left + colsPanel.offsetWidth > panelRect.width - 8) left = Math.max(8, panelRect.width - colsPanel.offsetWidth - 8);
        colsPanel.style.left = left + 'px';
        colsPanel.style.top = top + 'px';
        colsPanel.style.right = 'auto';
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
    if (colsReset) {
      colsReset.addEventListener('click', () => {
        cols = DEFAULT_COLS.map((col) => ({ ...col }));
        saveCols(cols);
        renderColumnsPanel();
        renderHead();
        renderBody(filesCache);
        applyColumnWidths();
        devLog('info', 'list-cols', 'reset-defaults');
      });
    }
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
      staticBtn.addEventListener('click', (e) => {
        e.preventDefault();
        ts.switchToTab('list');
      });
    }
    addListTab(ts);
    return true;
  };
  const maybeAutoLoadList = () => {
    if (typeof listLoadPageRef !== 'function') return;
    if (!(window.tabSystem && typeof window.tabSystem.getActiveTab === 'function')) return;
    if (window.tabSystem.getActiveTab() !== 'list') return;
    setTimeout(() => {
      listLoadPageRef();
      if (typeof window.__updateListSelectionUI === 'function') {
        window.__updateListSelectionUI();
      }
    }, 0);
  };
  if (!tryInstall()) {
    setTimeout(() => {
      if (tryInstall()) {
        maybeAutoLoadList();
      }
    }, 0);
  }
  else {
    maybeAutoLoadList();
  }
}
window.__LazyTabs && window.__LazyTabs.register('list', setupListTab);
// --- Similar Tab (pHash duplicates) ---
// Minimal tab that lists similar pairs from /api/duplicates with quick Play A/B
// --- Similar Tab (pHash duplicates) ---
function setupSimilarTab() {
  function install(ts) {
    // Require existing static panel
    const panel = document.getElementById('similar-panel');
    if (!panel) return null;
    const btn = document.getElementById('similar-tab');
    if (btn && !ts.tabs.has('similar')) {
      ts.tabs.set('similar', {button: btn, panel});
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        ts.switchToTab('similar');
      });
    }
    function persistSettings(thresh, limit, rec) {
      setLocalStorageItem('similar:thresh', String(thresh));
      setLocalStorageItem('similar:limit', String(limit));
      setLocalStorageItem('similar:rec', rec ? '1' : '0');
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
            const pa = document.createElement('button');
            pa.className = 'btn-sm play-a';
            pa.textContent = 'Play A';
            const pb = document.createElement('button');
            pb.className = 'btn-sm play-b';
            pb.textContent = 'Play B';
            act.appendChild(pa);
            act.appendChild(pb);
            top.appendChild(act);
            rowEl.appendChild(top);
            const hint = document.createElement('div');
            hint.className = 'hint-sm mt-6';
            const a = document.createElement('div');
            a.className = 'path-a';
            const b = document.createElement('div');
            b.className = 'path-b';
            hint.appendChild(a);
            hint.appendChild(b);
            rowEl.appendChild(hint);
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
            ts.switchToTab('player');
            if (window.Player && typeof window.Player.open === 'function') window.Player.open(path);
            else if (typeof Player !== 'undefined' && Player && typeof Player.open === 'function') Player.open(path);
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
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash === 'similar') {
      restoreSettings();
      const cur = (window.tabSystem && typeof window.tabSystem.getActiveTab === 'function') ? window.tabSystem.getActiveTab() : null;
      if (cur !== 'similar') {
        setTimeout(() => {
          ts.switchToTab('similar');
        }, 0);
      }
      setTimeout(() => {
        loadSimilar();
      }, 0);
    }
    return {panel};
  }
  const tryInstall = () => {
    const ts = window.tabSystem;
    if (!ts) return false;
    const res = install(ts);
    return Boolean(res);
  };
  if (!tryInstall()) setTimeout(tryInstall, 0);
  if (window.tabSystem && typeof window.tabSystem.getActiveTab === 'function' && window.tabSystem.getActiveTab() === 'similar') {
    setTimeout(() => {
      restoreSettings();
      loadSimilar();
    }, 0);
  }
}
window.__LazyTabs && window.__LazyTabs.register('similar', setupSimilarTab);

// =============================
// Performers Graph (Cytoscape)
// =============================
(function GraphModule() {
  let cy = null;
  let initialized = false;
  let lastData = { nodes: [], edges: [] };
  let usingPlugins = false;
  const STATUS_ID = 'graphStatus';

  function ensurePlugins() {
    if (usingPlugins) return;
    try {
      if (window.cytoscape && window.cytoscapeFcose) {
        window.cytoscape.use(window.cytoscapeFcose);
      }
      if (window.cytoscape && window.cxtmenu) {
        window.cytoscape.use(window.cxtmenu);
      }
      if (window.cytoscape && window.cytoscapePanzoom) {
        window.cytoscape.use(window.cytoscapePanzoom);
      }
      // panzoom plugin adds cy.panzoom function
      usingPlugins = true;
    }
    catch (_) {
      usingPlugins = true;
    }
  }

  function el(id) {
    return document.getElementById(id);
  }

  // Slider helpers (Edge length / Node repulsion)
  function getEdgeLen() {
    const v = parseInt(el('graphEdgeLen')?.value || '120', 10);
    if (!Number.isFinite(v)) return 120;
    return Math.max(20, Math.min(600, v));
  }
  function getNodeRepulsion() {
    const v = parseInt(el('graphRepulsion')?.value || '50000', 10);
    if (!Number.isFinite(v)) return 50000;
    return Math.max(500, Math.min(200000, v));
  }

  function straightPrefGet() {
    try {
      return getLocalStorageBoolean('graph:straightEdges', true);
    }
    catch (_) {
      return true;
    }
  }
  function straightPrefSet(v) {
    setLocalStorageBoolean('graph:straightEdges', Boolean(v));
  }

  function nodeSizeForCount(c) {
    const n = Math.max(1, Number(c) || 1);
    // sqrt scale to tame large counts
    return Math.max(18, Math.min(90, 14 + Math.sqrt(n) * 8));
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
    const nodes = (data.nodes || []).map((n) => {
      const slug = _slugifyName(n && n.name);
      const guessed = guessPerformerImagePath(n && n.name);
      // Unified performer image accessor: prefer images[0]; fallback to legacy image
      const provided = (n && Array.isArray(n.images) && n.images.length ? n.images[0] : (n && typeof n.image === 'string' ? n.image : '')) || '';
      let img = guessed;
      if (provided) {
        const lower = provided.toLowerCase();
        const isHttp = /^https?:\/\//i.test(provided);
        const hasSpace = /\s/.test(provided);
        const okNested = slug && lower === `/files/.artifacts/performers/${slug}/${slug}.jpg`;
        const badDup = slug && lower.includes(`/${slug}-${slug}.`);
        if (badDup || hasSpace) img = guessed;
        else if (isHttp) img = provided;
        else if (okNested) img = provided;
        else img = guessed;
      }
      devLog('[Graph] node image', { id: n && n.id, name: n && n.name, image: img, provided, guessed });
      return {
        data: {
          id: n.id,
          label: n.name,
          count: Number(n.count || 0),
          // Prefer provided image path;
          // else guess a direct artifact path by name
          image: img,
        },
      };
    });
    const edges = (data.edges || []).map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        count: Number(e.count || 0),
        width: edgeWidthForCount(e.count, 'graph'),
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
      if (deg >= minEdges) {
        nodeSet.add(n.id);
        return true;
      }
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
            shape: 'ellipse',
            'background-color': '#22324c',
            'background-image': 'data(image)',
            'background-fit': 'cover',
            'background-opacity': 1,
            'border-width': 2,
            'border-color': '#93c5fd',
            label: 'data(label)',
            color: '#eaf0ff',
            'font-size': 10,
            'text-wrap': 'wrap',
            'text-max-width': 80,
            'text-outline-color': '#0b1220',
            'text-outline-width': 2,
            'min-zoomed-font-size': 8,
            width: 64,
            height: 64,
            'text-valign': 'bottom',
            'text-margin-y': 8,
          },
        },
        {
          selector: 'edge',
          style: {
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            width: 'data(width)',
            'curve-style': 'straight',
            opacity: 0.75,
          },
        },
        {
          selector: '.faded',
          style: { opacity: 0.15 },
        },
        {
          selector: '.dim',
          style: { opacity: 0.18 },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#ffffff' },
        },
        {
          selector: '.highlight',
          style: { 'border-width': 3, 'border-color': '#fff' },
        },
      ],
      wheelSensitivity: 0.2,
      pixelRatio: 1,
    });
    if (typeof cy.panzoom === 'function') cy.panzoom({});

    // Apply preferred edge curvature (straight is default)
    applyEdgeCurve(straightPrefGet());

    // Hover magnify + neighbor highlight
    cy.on('mouseover', 'node', (evt) => {
      const n = evt.target;
      const bw = Number(n.data('w') || n.data('size') || 48);
      const bh = Number(n.data('h') || n.data('size') || 28);
      n.stop(true);
      n.animate({ style: { width: bw * 1.15, height: bh * 1.15 } }, { duration: 120 });
      const neigh = n.closedNeighborhood();
      cy.elements().addClass('faded');
      neigh.removeClass('faded');
    });
    cy.on('mouseout', 'node', (evt) => {
      const n = evt.target;
      const bw = Number(n.data('w') || n.data('size') || 48);
      const bh = Number(n.data('h') || n.data('size') || 28);
      n.stop(true);
      n.animate({
        style: {
          width: bw,
          height: bh,
        },
      }, {
        duration: 120,
      });
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
      const pos = evt.renderedPosition || evt.position || { x: 0, y: 0 };
      showTooltipForEdge(evt.target, pos);
    });
    cy.on('mouseout', 'edge', () => hideTooltipSoon());
    document.addEventListener('scroll', hideTooltipSoon, true);

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

    // Click to select a node
    cy.on('tap', 'node', (evt) => {
      cy.nodes(':selected').unselect();
      evt.target.select();
    });
  }

  function applyEdgeCurve(straight) {
    if (!cy) return;
    const mode = straight ? 'straight' : 'unbundled-bezier';
    cy.style().selector('edge')
      .style('curve-style', mode)
      .update();
  }

  function applyLayout(kind) {
    if (!cy) return;
    const k = (kind || 'fcose').toLowerCase();
    const EDGE_LEN_BASE = getEdgeLen();
    const REPULSION_BASE = getNodeRepulsion();
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
        nodeRepulsion: REPULSION_BASE,
        idealEdgeLength: (edge) => {
          const c = Number(edge.data('count') || 1);
          // Use slider as baseline and compress dense edges slightly
          return Math.max(30, EDGE_LEN_BASE - Math.log2(1 + c) * 20);
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
          return Math.max(40, EDGE_LEN_BASE - Math.log2(1 + c) * 22);
        },
        edgeElasticity: (edge) => {
          const c = Number(edge.data('count') || 1);
          return Math.max(0.2, 0.9 - Math.min(0.6, Math.log2(1 + c) * 0.1));
        },
        nodeRepulsion: (_node) => REPULSION_BASE,
      };
    }
    cy.layout(layout).run();
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
    if (n > 0) setStatus(`${n} performer${n === 1 ? '' : 's'}, ${m} link${m === 1 ? '' : 's'}`);
    else {
      const mv = (parseInt(el('graphMinCount')?.value || '2', 10) || 2) > 1;
      const me = getMinEdges() > 0;
      setStatus(`No data${mv ? ' (lower Min videos)' : ''}${me ? (mv ? ' and Min edges' : ' (lower Min edges)') : ''}`);
    }
    const pad = 30;
    setTimeout(() => {
      cy.resize();
      cy.fit(null, pad);
    }, isFreshLoad ? 80 : 10);
  }

  function openInLibrary(perfNames) {
    const names = (perfNames || []).filter(Boolean);
    if (!names.length) return;
    // Switch to library tab and apply filters
    const tab = document.querySelector('[data-tab="library"]');
    if (tab) tab.click();
    window.libraryPerformerFilters = names;
    setLocalStorageJSON('filters.performers', names);
    if (typeof window.renderUnifiedFilterChips === 'function') window.renderUnifiedFilterChips();
    if (typeof window.loadLibrary === 'function') window.loadLibrary();
    if (typeof window.updateLibraryUrlFromState === 'function') window.updateLibraryUrlFromState();
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
    catch (_) {
      notify('Failed to play', 'error');
    }
  }

  let __origPositions = null;
  let __neighborhoodView = false;

  function storePositionsOnce() {
    if (!cy || __origPositions) return;
    __origPositions = new Map();
    cy.nodes().forEach((n) => {
      __origPositions.set(n.id(), {
        x: n.position('x'),
        y: n.position('y'),
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
        n.unlock();
        anims.push(n.animate({
          position: p,
        }, {
          duration: 250,
        }));
      }
      else {
        n.unlock();
      }
    });
    __origPositions = null;
    __neighborhoodView = false;
    cy.elements().removeClass('dim');
    cy.elements().removeClass('faded');
    cy.fit(null, 30);
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
      cy.fit(base, 40);
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
    cy.fit(null, 30);
    const s = el('graphSearchInput');
    if (s) s.value = '';
  }

  function wireControlsOnce() {
    const refreshBtn = el('graphRefreshBtn');
    if (refreshBtn && !refreshBtn._wired) {
      refreshBtn._wired = true;
      refreshBtn.addEventListener('click', loadGraph);
    }
    const layoutSel = el('graphLayoutSelect');
    if (layoutSel && !layoutSel._wired) {
      layoutSel._wired = true;
      layoutSel.addEventListener('change', () => applyLayout(layoutSel.value));
    }
    const fitBtn = el('graphFitBtn');
    if (fitBtn && !fitBtn._wired) {
      fitBtn._wired = true;
      fitBtn.addEventListener('click', () => {
      cy && cy.fit(null, 30);
    });
    }
    const nbBtn = el('graphNeighborhoodBtn');
    if (nbBtn && !nbBtn._wired) {
      nbBtn._wired = true;
      nbBtn.addEventListener('click', () => revealNeighborhood());
    }
    const clrBtn = el('graphClearBtn');
    if (clrBtn && !clrBtn._wired) {
      clrBtn._wired = true;
      clrBtn.addEventListener('click', clearHighlights);
    }
    const minInput = el('graphMinCount');
    if (minInput && !minInput._wired) {
      minInput._wired = true;
      minInput.addEventListener('change', loadGraph);
    }
    const minEdgesInput = el('graphMinEdges');
    if (minEdgesInput && !minEdgesInput._wired) {
      minEdgesInput._wired = true;
      const onChange = () => refreshGraphFromCurrentData(false);
      minEdgesInput.addEventListener('input', onChange);
      minEdgesInput.addEventListener('change', onChange);
    }
    // Edge length / Repulsion sliders → re-run current layout (debounced)
    const edgeLenInput = el('graphEdgeLen');
    if (edgeLenInput && !edgeLenInput._wired) {
      edgeLenInput._wired = true;
      const on = debounce(() => applyLayout(layoutSel?.value || 'fcose'), 200);
      edgeLenInput.addEventListener('input', on);
      edgeLenInput.addEventListener('change', on);
    }
    const repInput = el('graphRepulsion');
    if (repInput && !repInput._wired) {
      repInput._wired = true;
      const on = debounce(() => applyLayout(layoutSel?.value || 'fcose'), 200);
      repInput.addEventListener('input', on);
      repInput.addEventListener('change', on);
    }
    const searchInput = el('graphSearchInput');
    if (searchInput && !searchInput._wired) {
      searchInput._wired = true;
      const on = debounce(() => {
        const q = String(searchInput.value || '').trim().toLowerCase();
        if (!cy) return;
        cy.elements().removeClass('highlight');
        if (!q) {
          cy.elements().removeClass('faded');
          return;
        }
        const matches = cy.nodes().filter((n) => String(n.data('label') || '').toLowerCase().includes(q));
        cy.elements().addClass('faded');
        matches.removeClass('faded');
        matches.connectedEdges().removeClass('faded');
        matches.addClass('highlight');
        cy.fit(matches.closedNeighborhood(), 40);
      }, 200);
      searchInput.addEventListener('input', on);
    }
    const straightCb = el('graphStraightEdges');
    if (straightCb && !straightCb._wired) {
      straightCb._wired = true;
      straightCb.checked = Boolean(straightPrefGet());
      straightCb.addEventListener('change', () => {
        const useStraight = Boolean(straightCb.checked);
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
    if (cy) {
      cy.resize();
      cy.fit(null, 30);
    }
  }

  window.Graph = { show, resizeFit };
})();

// Initialize Graph tab lazily on activation
window.addEventListener('tabchange', (e) => {
  if (e && e.detail && e.detail.activeTab === 'graph' && window.Graph && typeof window.Graph.show === 'function') {
    setTimeout(() => {
      window.Graph.show();
      window.Graph.resizeFit && window.Graph.resizeFit();
    }, 40);
  }
});

// Fallbacks: initialize on tab button click and if Graph is already active on load
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('graph-tab');
  if (btn && !btn._wiredGraphInit) {
    btn._wiredGraphInit = true;
    btn.addEventListener('click', () => {
      window.Graph && window.Graph.show && window.Graph.show();
    });
  }
  const panel = document.getElementById('graph-panel');
  if (panel && !panel.hasAttribute('hidden')) {
    window.Graph && window.Graph.show && window.Graph.show();
  }
});

// =============================
// Connections Graph (Performer nodes with images)
// =============================
(function ConnectionsModule() {
  const PREF_KEY = 'mediaPlayer:connectionsShowImageless';
  const FILTER_PREF_KEY = 'mediaPlayer:connectionsFilters';
  const NODE_BASE_SIZE = 64;
  const NODE_MINI_SIZE = 26;
  const INITIALS_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#7c3aed', '#f97316', '#dc2626'];
  const INITIALS_TEXT = '#f8fafc';
  let cy = null;
  let initialized = false;
  let controlsBound = false;
  let showImageless = readTogglePref();
  let lastGraphData = null;
  let loadSeq = 0;
  const DEFAULT_GRAPH_PARAMS = Object.freeze({ maxVideosPerEdge: 6 });
  const DEFAULT_FILTERS = Object.freeze({
    minPerformerVideos: 1,
    minEdgeVideos: 1,
    showOrphans: true,
    variableThickness: true,
  });
  const FILTER_BOUNDS = Object.freeze({
    minPerformerVideos: { min: 1, max: 500 },
    minEdgeVideos: { min: 1, max: 500 },
  });
  const EDGE_BASE_WIDTH = 2.6;
  let filterState = loadFilterSettings();

  // @todo copilot refactor
  const CONSOLE_PREFIX = '[Connections]';
  const log = (level, ...args) => {
    devLog(level, 'connections', ...args);
  };
  const consoleLog = (level, msg, payload) => {
    const fn = console?.[level] || console?.log;
    if (typeof fn === 'function') fn(CONSOLE_PREFIX, msg, payload || '');
  };

  const FACE_CROP_CACHE = new Map();
  const FACE_CROP_INFLIGHT = new Map();
  const FACE_CROP_OUTPUT_SIZE = 256;
  const FACE_CROP_CONCURRENCY = 3;

  const clampUnit01 = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
  };

  const clampRange = (val, min, max) => {
    if (!Number.isFinite(val)) return min;
    if (val < min) return min;
    if (val > max) return max;
    return val;
  };

  function clampInt(val, bounds, fallback) {
    const min = Number(bounds?.min ?? 0);
    const max = Number(bounds?.max ?? Number.MAX_SAFE_INTEGER);
    const n = Number(val);
    if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : min;
    if (n < min) return min;
    if (n > max) return max;
    return Math.round(n);
  }

  function normalizeFilterState(raw) {
    const next = { ...DEFAULT_FILTERS };
    if (!raw || typeof raw !== 'object') return next;
    next.minPerformerVideos = clampInt(raw.minPerformerVideos, FILTER_BOUNDS.minPerformerVideos, DEFAULT_FILTERS.minPerformerVideos);
    next.minEdgeVideos = clampInt(raw.minEdgeVideos, FILTER_BOUNDS.minEdgeVideos, DEFAULT_FILTERS.minEdgeVideos);
    next.showOrphans = raw.showOrphans !== false;
    next.variableThickness = raw.variableThickness !== false;
    return next;
  }

  function loadFilterSettings() {
    try {
      const raw = localStorage.getItem(FILTER_PREF_KEY);
      if (!raw) return { ...DEFAULT_FILTERS };
      const parsed = JSON.parse(raw);
      return normalizeFilterState(parsed);
    }
    catch (_) {
      return { ...DEFAULT_FILTERS };
    }
  }

  function persistFilterSettings() {
    localStorage.setItem(FILTER_PREF_KEY, JSON.stringify(filterState));
  }

  function syncFilterControls() {
    const minVideosInput = document.getElementById('connectionsMinVideos');
    if (minVideosInput) minVideosInput.value = filterState.minPerformerVideos;
    const minEdgeInput = document.getElementById('connectionsMinEdgeVideos');
    if (minEdgeInput) minEdgeInput.value = filterState.minEdgeVideos;
    const showOrphansToggle = document.getElementById('connectionsShowOrphans');
    if (showOrphansToggle) showOrphansToggle.checked = Boolean(filterState.showOrphans);
    const varWidthToggle = document.getElementById('connectionsVariableThickness');
    if (varWidthToggle) varWidthToggle.checked = Boolean(filterState.variableThickness);
  }

  function updateFilterState(key, value, opts = {}) {
    if (!(key in filterState)) return;
    if (filterState[key] === value) return;
    filterState = { ...filterState, [key]: value };
    persistFilterSettings();
    syncFilterControls();
    if (opts.requiresFetch) {
      loadConnections();
      return;
    }
    applyFiltersAndRender();
  }

  function parseFaceBoxInput(raw) {
    if (!raw) return null;
    if (Array.isArray(raw) && raw.length === 4) {
      const arr = raw.map((n) => Number(n));
      if (arr.every((n) => Number.isFinite(n))) return arr;
      return null;
    }
    if (typeof raw === 'string') {
      const parts = raw.split(/[;,\s]+/).map((n) => Number(n)).filter((n) => Number.isFinite(n));
      if (parts.length === 4) return parts;
      return null;
    }
    if (typeof raw === 'object') {
      const keys = ['x', 'y', 'w', 'h'];
      const arr = keys.map((k) => Number(raw[k]));
      if (arr.every((n) => Number.isFinite(n))) return arr;
    }
    return null;
  }

  function normalizeFaceBox(raw) {
    const parsed = parseFaceBoxInput(raw);
    if (!parsed) return null;
    const normalized = parsed.map((n) => clampUnit01(n));
    if (typeof coerceSquareBox === 'function') {
      try {
        return coerceSquareBox(normalized);
      }
      catch (err) {
        devLog('debug', 'coerceSquareBox failed for Connections face box', err);
      }
    }
    return normalized;
  }

  function sanitizeImageCandidate(candidate, slug) {
    if (!candidate) return '';
    const trimmed = String(candidate).trim();
    if (!trimmed) return '';
    if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    const hasSpace = /\s/.test(trimmed);
    const badDup = slug && lower.includes(`/${slug}-${slug}.`);
    if (badDup || hasSpace) return '';
    const isHttp = /^https?:\/\//i.test(trimmed);
    const okNested = slug && lower === `/files/.artifacts/performers/${slug}/${slug}.jpg`;
    if (isHttp || okNested || trimmed.startsWith('/')) return trimmed;
    return '';
  }

  function buildNodeViewModel(node) {
    if (!node) return null;
    const rawName = typeof node.name === 'string' ? node.name : '';
    const safeName = rawName.trim() || node.slug || node.id || 'Performer';
    const prefId = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : '';
    const prefSlug = typeof node.slug === 'string' && node.slug.trim() ? node.slug.trim() : '';
    const normalizedId = prefId || prefSlug || _slugifyName(safeName) || safeName;
    const slug = prefSlug || normalizedId;
    const guessedImage = guessPerformerImagePath(safeName);
    const primaryCandidate = (Array.isArray(node.images) && node.images.length ? node.images[0] : (typeof node.image === 'string' ? node.image : '')) || '';
    const providedImage = sanitizeImageCandidate(primaryCandidate, slug);
    const faceBox = normalizeFaceBox(node.image_face_box || node.face_box || node.faceBox);
    return {
      safeName,
      normalizedId,
      slug,
      guessedImage,
      providedImage,
      hasProvided: Boolean(primaryCandidate),
      rawImageCandidate: primaryCandidate,
      initials: initialsFromName(safeName),
      count: Number(node.count || 0),
      faceBox,
    };
  }

  function faceCropCacheKey(url, box) {
    return `${url}::${box.map((n) => Number(n).toFixed(5)).join(',')}`;
  }

  function canCropImageUrl(url) {
    if (!url) return false;
    if (/^data:/i.test(url) || /^blob:/i.test(url)) return false;
    if (url.startsWith('/')) return true;
    try {
      const target = new URL(url, window.location.origin);
      return target.origin === window.location.origin;
    }
    catch (_) {
      return false;
    }
  }

  function loadImageElementForCrop(url) {
    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined') {
        reject(new Error('Image constructor unavailable'));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.referrerPolicy = 'same-origin';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
  }

  async function generateFaceCropDataUrl(url, faceBox) {
    try {
      const img = await loadImageElementForCrop(url);
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      if (!width || !height) return null;
      const normalizedBox = (typeof coerceSquareBox === 'function') ? coerceSquareBox(faceBox, { width, height }) : faceBox;
      const nx = clampUnit01(normalizedBox[0]);
      const ny = clampUnit01(normalizedBox[1]);
      const nw = clampUnit01(normalizedBox[2]);
      const nh = clampUnit01(normalizedBox[3]);
      const pxWidth = Math.max(1, Math.round(nw * width));
      const pxHeight = Math.max(1, Math.round(nh * height));
      const sidePx = Math.max(1, Math.min(Math.min(width, height), Math.max(pxWidth, pxHeight)));
      const maxX = Math.max(0, width - sidePx);
      const maxY = Math.max(0, height - sidePx);
      const startX = clampRange(Math.round(nx * width), 0, maxX);
      const startY = clampRange(Math.round(ny * height), 0, maxY);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      canvas.width = FACE_CROP_OUTPUT_SIZE;
      canvas.height = FACE_CROP_OUTPUT_SIZE;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, startX, startY, sidePx, sidePx, 0, 0, FACE_CROP_OUTPUT_SIZE, FACE_CROP_OUTPUT_SIZE);
      return canvas.toDataURL('image/jpeg', 0.92);
    }
    catch (err) {
      devLog('debug', 'generateFaceCropDataUrl failed', { url, err });
      return null;
    }
  }

  async function getOrCreateFaceCrop(url, faceBox) {
    const key = faceCropCacheKey(url, faceBox);
    if (FACE_CROP_CACHE.has(key)) {
      const cached = FACE_CROP_CACHE.get(key);
      return cached || null;
    }
    if (FACE_CROP_INFLIGHT.has(key)) {
      try {
        return await FACE_CROP_INFLIGHT.get(key);
      }
      catch (_) {
        return null;
      }
    }
    const inflight = generateFaceCropDataUrl(url, faceBox)
      .then((result) => {
        FACE_CROP_CACHE.set(key, result || '');
        FACE_CROP_INFLIGHT.delete(key);
        return result || null;
      })
      .catch((err) => {
        FACE_CROP_CACHE.set(key, '');
        FACE_CROP_INFLIGHT.delete(key);
        devLog('debug', 'face crop generation error', err);
        return null;
      });
    FACE_CROP_INFLIGHT.set(key, inflight);
    return inflight;
  }

  function scheduleConnectionsFaceCrops(rawNodes) {
    if (!Array.isArray(rawNodes) || !rawNodes.length) return;
    const jobs = rawNodes.map((node) => {
      const meta = buildNodeViewModel(node);
      if (!meta || !meta.faceBox || !meta.providedImage) return null;
      if (!canCropImageUrl(meta.providedImage)) return null;
      return { meta, faceBox: meta.faceBox.slice() };
    }).filter(Boolean);
    if (!jobs.length) return;
    setTimeout(() => {
      processFaceCropQueue(jobs).catch((err) => devLog('warn', 'face crop queue error', err));
    }, 0);
  }

  async function processFaceCropQueue(jobs, concurrency = FACE_CROP_CONCURRENCY) {
    if (!Array.isArray(jobs) || !jobs.length) return;
    const queue = jobs.slice();
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) break;
        try {
          await cropNodePortrait(job);
        }
        catch (err) {
          devLog('debug', 'face crop job failed', err);
        }
      }
    };
    const workers = [];
    const slots = Math.max(1, Math.min(concurrency, queue.length));
    for (let i = 0; i < slots; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  async function cropNodePortrait(job) {
    if (!job || !job.meta || !job.faceBox) return;
    const { meta, faceBox } = job;
    if (!meta.providedImage) return;
    const cropped = await getOrCreateFaceCrop(meta.providedImage, faceBox);
    if (!cropped) return;
    applyFaceCropToGraphNode(meta.normalizedId, cropped);
  }

  function applyFaceCropToGraphNode(nodeId, dataUrl) {
    if (!cy || !nodeId || !dataUrl) return;
    let node = null;
    try {
      node = cy.getElementById(nodeId);
    }
    catch (err) {
      devLog('debug', 'getElementById failed', err);
      return;
    }
    if (!node || node.empty()) return;
    try {
      const current = node.data('image');
      if (current === dataUrl) return;
      node.data('image', dataUrl);
      node.data('hasImage', 1);
      if (node.hasClass('conn-node--initials')) node.removeClass('conn-node--initials');
    }
    catch (err) {
      devLog('debug', 'applyFaceCropToGraphNode error', err);
    }
  }

  devLog('debug', 'module init');

  function ensurePlugins() {
    try {
      devLog('debug', 'ensurePlugins start', { hasCy: Boolean(window.cytoscape), hasFcose: Boolean(window.cytoscapeFcose) });
      if (window.cytoscape && window.cytoscapeFcose) {
        try {
          window.cytoscape.use(window.cytoscapeFcose);
          devLog('debug', 'fcose plugin registered');
        }
        catch (err) {
          devLog('warn', 'fcose plugin register failed', err);
        }
      }
    }
    catch (err) {
      devLog('error', 'ensurePlugins error', err);
    }
  }

  function readTogglePref() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw === null) return true;
      return raw !== 'false';
    }
    catch (_) {
      return true;
    }
  }

  function syncToggleUI() {
    const toggle = document.getElementById('connectionsShowImageless');
    if (toggle) toggle.checked = Boolean(showImageless);
  }

  function persistTogglePref(nextVal) {
    showImageless = Boolean(nextVal);
    localStorage.setItem(PREF_KEY, showImageless ? 'true' : 'false');
    devLog('debug', 'persist toggle', { showImageless });
    syncToggleUI();
    applyImagelessVisibility({ animate: true });
  }

  function initialsFromName(name) {
    try {
      const parts = String(name || '').trim() .split(/\s+/) .filter(Boolean);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      const first = parts[0][0] || '';
      const last = parts[parts.length - 1][0] || '';
      return (first + last).toUpperCase();
    }
    catch (_) {
      return '?';
    }
  }

  function initialsColorSeed(name) {
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return INITIALS_COLORS[hash % INITIALS_COLORS.length];
  }

  function initialsDataUri(initials, seedSource) {
    const safeText = (initials || '?').replace(/[^A-Z0-9]/gi, '').slice(0, 3) || '?';
    const bg = initialsColorSeed(seedSource || safeText);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${bg}"/><text x="50%" y="54%" text-anchor="middle" font-family="'Inter','Segoe UI',sans-serif" font-size="56" font-weight="700" fill="${INITIALS_TEXT}" dominant-baseline="middle">${safeText}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function setConnectionsLoading(isLoading) {
    const btn = document.getElementById('connectionsRefreshBtn');
    devLog('debug', 'setConnectionsLoading', { isLoading: Boolean(isLoading), hasButton: Boolean(btn) });
    if (btn) {
      btn.disabled = Boolean(isLoading);
      btn.textContent = isLoading ? 'Loading...' : 'Refresh';
    }
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    devLog('debug', 'bindControls');
    syncToggleUI();
    syncFilterControls();
    const toggle = document.getElementById('connectionsShowImageless');
    if (toggle && !toggle._wiredConnToggle) {
      toggle._wiredConnToggle = true;
      toggle.addEventListener('change', (e) => {
        devLog('debug', 'imageless toggle change', { checked: Boolean(e?.target?.checked) });
        persistTogglePref(Boolean(e?.target?.checked));
      });
    }
    const minVideosInput = document.getElementById('connectionsMinVideos');
    if (minVideosInput && !minVideosInput._wiredConnMinVideos) {
      minVideosInput._wiredConnMinVideos = true;
      minVideosInput.addEventListener('change', (e) => {
        const nextVal = clampInt(e?.target?.value, FILTER_BOUNDS.minPerformerVideos, filterState.minPerformerVideos);
        e.target.value = nextVal;
        updateFilterState('minPerformerVideos', nextVal, { requiresFetch: true });
      });
    }
    const minEdgeInput = document.getElementById('connectionsMinEdgeVideos');
    if (minEdgeInput && !minEdgeInput._wiredConnMinEdges) {
      minEdgeInput._wiredConnMinEdges = true;
      minEdgeInput.addEventListener('change', (e) => {
        const nextVal = clampInt(e?.target?.value, FILTER_BOUNDS.minEdgeVideos, filterState.minEdgeVideos);
        e.target.value = nextVal;
        updateFilterState('minEdgeVideos', nextVal);
      });
    }
    const showOrphansToggle = document.getElementById('connectionsShowOrphans');
    if (showOrphansToggle && !showOrphansToggle._wiredConnOrphans) {
      showOrphansToggle._wiredConnOrphans = true;
      showOrphansToggle.addEventListener('change', (e) => {
        updateFilterState('showOrphans', Boolean(e?.target?.checked));
      });
    }
    const varWidthToggle = document.getElementById('connectionsVariableThickness');
    if (varWidthToggle && !varWidthToggle._wiredConnVarWidth) {
      varWidthToggle._wiredConnVarWidth = true;
      varWidthToggle.addEventListener('change', (e) => {
        updateFilterState('variableThickness', Boolean(e?.target?.checked));
      });
    }
    const refreshBtn = document.getElementById('connectionsRefreshBtn');
    if (refreshBtn && !refreshBtn._wiredConnRefresh) {
      refreshBtn._wiredConnRefresh = true;
      refreshBtn.addEventListener('click', () => {
        devLog('debug', 'refresh clicked');
        loadConnections();
      });
    }
  }

  async function fetchConnectionsGraphData() {
    try {
      const url = new URL('/api/performers/graph', window.location.origin);
      const minCount = clampInt(filterState.minPerformerVideos, FILTER_BOUNDS.minPerformerVideos, DEFAULT_FILTERS.minPerformerVideos);
      url.searchParams.set('min_count', String(minCount));
      url.searchParams.set('limit_videos_per_edge', String(DEFAULT_GRAPH_PARAMS.maxVideosPerEdge));
      devLog('info', 'fetchConnectionsGraphData start', { url: url.toString() });
      consoleLog('info', 'fetch start', { url: url.toString() });
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const payload = (json && (json.data || json)) || {};
      const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      const edges = Array.isArray(payload.edges) ? payload.edges : [];
      devLog('info', 'fetchConnectionsGraphData success', { nodeCount: nodes.length, edgeCount: edges.length });
      consoleLog('info', 'fetch success', { nodeCount: nodes.length, edgeCount: edges.length });
      return { nodes, edges };
    }
    catch (err) {
      devLog('error', 'graph fetch failed', err);
      consoleLog('error', 'fetch failed', err);
      return { nodes: [], edges: [] };
    }
  }

  function toElements(graphData, currentFilters = filterState) {
    const filters = normalizeFilterState(currentFilters);
    const minNodeCount = clampInt(filters.minPerformerVideos, FILTER_BOUNDS.minPerformerVideos, DEFAULT_FILTERS.minPerformerVideos);
    const minEdgeCount = clampInt(filters.minEdgeVideos, FILTER_BOUNDS.minEdgeVideos, DEFAULT_FILTERS.minEdgeVideos);
    const showOrphans = Boolean(filters.showOrphans);
    const variableThickness = Boolean(filters.variableThickness);
    const rawNodes = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
    const rawEdges = Array.isArray(graphData?.edges) ? graphData.edges : [];
    const filteredRawNodes = rawNodes.filter((p) => Number(p?.count || 0) >= minNodeCount);
    const filteredRawEdges = rawEdges.filter((edge) => Number(edge?.count || 0) >= minEdgeCount);
    const nodeIdSet = new Set();
    let nodes = filteredRawNodes
      .map((p) => {
        const meta = buildNodeViewModel(p);
        if (!meta) return null;
        nodeIdSet.add(meta.normalizedId);
        const faceCrop = (p && typeof p._faceCroppedImage === 'string') ? p._faceCroppedImage : '';
        const activeFaceBox = (p && Array.isArray(p._faceCropBox) && p._faceCropBox.length === 4)
          ? p._faceCropBox.slice()
          : (meta.faceBox ? meta.faceBox.slice() : null);
        const hasPortrait = Boolean(meta.hasProvided || faceCrop);
        let img = faceCrop || meta.providedImage || meta.guessedImage;
        if (!hasPortrait) {
          img = initialsDataUri(meta.initials, meta.safeName);
        }
        const node = {
          data: {
            id: meta.normalizedId,
            slug: meta.slug,
            label: meta.safeName,
            image: img,
            hasImage: hasPortrait ? 1 : 0,
            initials: meta.initials,
            count: meta.count,
          },
        };
        if (activeFaceBox) {
          node.data.faceBox = activeFaceBox.join(',');
        }
        if (!hasPortrait) node.classes = 'conn-node--initials';
        return node;
      })
      .filter(Boolean);

    let edges = filteredRawEdges
      .filter((edge) => edge && edge.source && edge.target)
      .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
      .map((edge) => ({
        data: {
          id: edge.id || `${edge.source}->${edge.target}`,
          source: edge.source,
          target: edge.target,
          count: Number(edge.count || 0),
          width: variableThickness ? edgeWidthForCount(edge.count || 0, 'connections') : EDGE_BASE_WIDTH,
          videos: Array.isArray(edge.videos) ? edge.videos : [],
        },
      }));
    if (!showOrphans) {
      const connectedIds = new Set();
      edges.forEach((edge) => {
        connectedIds.add(edge.data.source);
        connectedIds.add(edge.data.target);
      });
      if (connectedIds.size === 0) {
        nodes = [];
        edges = [];
      }
      else {
        nodes = nodes.filter((node) => connectedIds.has(node.data.id));
        const allowedIds = new Set(nodes.map((node) => node.data.id));
        edges = edges.filter((edge) => allowedIds.has(edge.data.source) && allowedIds.has(edge.data.target));
      }
    }
    const elementCount = nodes.length + edges.length;
    devLog('debug', 'toElements complete', { rawNodes: rawNodes.length, nodes: nodes.length, rawEdges: rawEdges.length, edges: edges.length, elementCount });
    consoleLog('debug', 'elements prepared', { nodes: nodes.length, edges: edges.length });
    return [...nodes, ...edges];
  }

  function applyDefaultLayout() {
    if (!cy) {
      devLog('warn', 'applyDefaultLayout skipped (no cy instance)');
      return;
    }
    let layout = { name: 'fcose', fit: true, padding: 50, animate: 'end', animationDuration: 600 };
    try {
      devLog('debug', 'layout run', { layout: layout.name });
      cy.layout(layout).run();
    }
    catch (err) {
      devLog('warn', 'fcose layout failed, falling back', err);
      try {
        devLog('debug', 'layout fallback', { layout: 'cose' });
        cy.layout({ name: 'cose', fit: true, padding: 40 }).run();
      }
      catch (err2) {
        devLog('warn', 'cose layout failed, falling back', err2);
        try {
          devLog('debug', 'layout fallback', { layout: 'grid' });
          cy.layout({ name: 'grid', padding: 20 }).run();
        }
        catch (err3) {
          devLog('error', 'grid layout failed', err3);
        }
      }
    }
  }

  function initCy() {
    devLog('debug', 'initCy start');
    if (!window.cytoscape) {
      devLog('error', 'initCy aborted (cytoscape missing)');
      notify('Graph engine not loaded', 'error');
      return;
    }
    ensurePlugins();
    const container = document.getElementById('cyConnections');
    if (!container) {
      devLog('error', 'initCy aborted (container missing)');
      return;
    }
    if (cy) {
      devLog('debug', 'initCy reusing existing instance');
      return;
    }
    devLog('debug', 'initCy creating instance');
    cy = window.cytoscape({
      container,
      elements: [],
      style: [
        { selector: 'node', style: {
          shape: 'ellipse',
          'background-color': '#1b2538',
          'background-image': 'data(image)',
          'background-fit': 'cover',
          'background-opacity': 1,
          'border-width': 2,
          'border-color': '#93c5fd',
          label: '',
          width: NODE_BASE_SIZE,
          height: NODE_BASE_SIZE,
          'transition-property': 'background-color, border-color, opacity, width, height',
          'transition-duration': '200ms',
        }},
        { selector: 'node.conn-node--initials', style: {
          'border-color': '#64748b',
          'background-color': '#0f172a',
        }},
        { selector: 'edge', style: {
          'line-color': '#475569',
          width: 'data(width)',
          'curve-style': 'straight',
          opacity: 0.6,
          'line-cap': 'round',
          'target-arrow-shape': 'none',
        }},
      ],
      wheelSensitivity: 0.2,
      pixelRatio: 1,
    });
    devLog('info', 'cytoscape instance ready');
  }

  async function loadConnections() {
    const token = ++loadSeq;
    devLog('info', 'loadConnections start', { token });
    consoleLog('info', 'load start', { token });
    setConnectionsLoading(true);
    try {
      const graphData = await fetchConnectionsGraphData();
      devLog('debug', 'loadConnections data received', { token, nodeCount: graphData.nodes.length, edgeCount: graphData.edges.length });
      consoleLog('info', 'data received', { token, nodeCount: graphData.nodes.length, edgeCount: graphData.edges.length });
      if (token !== loadSeq) return;
      renderGraphFromData(graphData, { animateImageless: true, token });
    }
    catch (err) {
      devLog('error', 'loadConnections failed', err);
      consoleLog('error', 'load failed', err);
    }
    finally {
      if (token === loadSeq) setConnectionsLoading(false);
    }
  }

  function autoEnableImagelessIfNeeded() {
    if (!cy || showImageless) return false;
    const nodes = cy.nodes();
    if (!nodes || !nodes.length) return false;
    const imagelessNodes = cy.nodes('[hasImage = 0], [!hasImage], .conn-node--initials');
    if (imagelessNodes.length === nodes.length) {
      devLog('info', 'auto enabling imageless performers (no portraits found)');
      consoleLog('info', 'auto enabling imageless performers');
      notify('Connections: showing imageless performers (no portraits detected).', 'info');
      showImageless = true;
      localStorage.setItem(PREF_KEY, 'true');
      syncToggleUI();
      return true;
    }
    return false;
  }

  function applyImagelessVisibility(options = {}) {
    if (!cy) return;
    const { animate = false } = options;
    const imagelessNodes = cy.nodes('[hasImage = 0], [!hasImage]');
    if (!imagelessNodes || !imagelessNodes.length) {
      devLog('debug', 'applyImagelessVisibility skipped (no imageless nodes)');
      return;
    }
    devLog('debug', 'applyImagelessVisibility', { showImageless, imagelessCount: imagelessNodes.length, animate });
    const toggleEdges = (edges, visible) => {
      if (!edges || !edges.length) return;
      edges.forEach((edge) => {
        edge.stop();
        if (visible) {
          edge.style('display', 'element');
          if (!animate) {
            edge.style('opacity', 0.6);
          }
          else {
            edge.style('opacity', 0);
            edge.animate({ style: { opacity: 0.6 } }, { duration: 180, easing: 'ease-out' });
          }
        }
        else {
          const hideEdge = () => {
            edge.style('display', 'none');
          };
          if (!animate) {
            edge.style('opacity', 0);
            hideEdge();
          }
          else {
            edge.animate({ style: { opacity: 0 } }, { duration: 180, easing: 'ease-in', complete: hideEdge });
          }
        }
      });
    };
    if (showImageless) {
      imagelessNodes.forEach((n) => {
        n.style('display', 'element');
        toggleEdges(n.connectedEdges(), true);
        if (!animate) {
          n.style('opacity', 1);
          n.style('width', NODE_BASE_SIZE);
          n.style('height', NODE_BASE_SIZE);
          return;
        }
        n.stop();
        n.style('opacity', 0);
        n.style('width', NODE_MINI_SIZE);
        n.style('height', NODE_MINI_SIZE);
        n.animate({ style: { opacity: 1, width: NODE_BASE_SIZE, height: NODE_BASE_SIZE } }, { duration: 220, easing: 'ease-out' });
      });
      return;
    }
    imagelessNodes.forEach((n) => {
      n.stop();
      const hideNow = () => {
        n.style('display', 'none');
      };
      const hideEdges = () => toggleEdges(n.connectedEdges(), false);
      if (!animate) {
        n.style('opacity', 0);
        hideEdges();
        hideNow();
        return;
      }
      hideEdges();
      n.animate({ style: { opacity: 0, width: NODE_MINI_SIZE, height: NODE_MINI_SIZE } }, {
        duration: 220,
        easing: 'ease-in',
        complete: hideNow,
      });
    });
  }

  function renderGraphFromData(graphData, options = {}) {
    if (!graphData) {
      devLog('warn', 'renderGraphFromData skipped (no data)');
      return;
    }
    lastGraphData = graphData;
    const elements = toElements(graphData, filterState);
    if (!cy) initCy();
    if (!cy) {
      devLog('error', 'renderGraphFromData abort (cy missing)');
      consoleLog('error', 'render aborted (cy missing)');
      return;
    }
    cy.elements().remove();
    devLog('debug', 'renderGraphFromData cleared elements');
    consoleLog('debug', 'elements cleared');
    cy.add(elements);
    devLog('debug', 'renderGraphFromData added elements', { elementCount: elements.length });
    consoleLog('info', 'elements added', { nodes: cy.nodes().length, edges: cy.edges().length });
    scheduleConnectionsFaceCrops(graphData.nodes);
    const autoToggle = autoEnableImagelessIfNeeded();
    applyDefaultLayout();
    const animateImageless = options.animateImageless !== false && !autoToggle;
    applyImagelessVisibility({ animate: animateImageless });
    setTimeout(() => {
      try {
        cy.resize();
        cy.fit(null, 30);
        devLog('debug', 'post-layout resize/fit complete');
      }
      catch (err) {
        devLog('warn', 'post-layout resize/fit failed', err);
      }
    }, 40);
    devLog('info', 'renderGraphFromData complete', { token: options.token, nodes: cy.nodes().length, edges: cy.edges().length });
  }

  function applyFiltersAndRender(options = {}) {
    if (!lastGraphData) {
      devLog('debug', 'applyFiltersAndRender no cache, triggering load');
      loadConnections();
      return;
    }
    renderGraphFromData(lastGraphData, options);
  }

  function show() {
    devLog('info', 'Connections.show invoked', { initialized });
    bindControls();
    if (!initialized) {
      initialized = true;
      devLog('debug', 'Connections.show initial load scheduled');
      setTimeout(loadConnections, 30);
      return;
    }
    resizeFit();
  }

  function resizeFit() {
    try {
      if (cy) {
        cy.resize();
        cy.fit(null, 30);
        devLog('debug', 'resizeFit applied');
      }
      else {
        devLog('debug', 'resizeFit skipped (cy missing)');
      }
    }
    catch (err) {
      devLog('warn', 'resizeFit failed', err);
    }
  }

  window.Connections = { show, resizeFit, refresh: loadConnections };
})();

// Initialize Connections tab lazily on activation
window.addEventListener('tabchange', (e) => {
  if (e && e.detail && e.detail.activeTab === 'connections' && window.Connections && typeof window.Connections.show === 'function') {
    setTimeout(() => {
      window.Connections.show();
      window.Connections.resizeFit && window.Connections.resizeFit();
    }, 40);
  }
});

// Fallbacks: initialize on tab button click and if Connections is already active on load
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('connections-tab');
  if (btn && !btn._wiredConnInit) {
    btn._wiredConnInit = true;
    btn.addEventListener('click', () => {
      window.Connections && window.Connections.show && window.Connections.show();
    });
  }
  const panel = document.getElementById('connections-panel');
  if (panel && !panel.hasAttribute('hidden')) {
    window.Connections && window.Connections.show && window.Connections.show();
  }
});

// --- API Explorer Tab ---
(function setupApiExplorer() {
  let apiSpecLoaded = false;
  let lastFetchedRoutes = [];
  function fmt(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    }
    catch (_) {
      return String(obj);
    }
  }
  function parseJsonOrEmpty(text) {
    const t = (text || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    }
    catch (_) {
      return null;
    }
  }
  async function fetchRoutes() {
    const r = await fetch('/api/routes', {cache: 'no-store'});
    if (r.ok) {
      const j = await r.json();
      return buildFromOpenAPI(j);
    }
    const rOpenapi = await fetch('/openapi.json', {cache: 'no-store'});
    if (rOpenapi.ok) {
      const j = await rOpenapi.json();
      return buildFromOpenAPI(j);
    }
    const rApiOpenapi = await fetch('/api/openapi.json', {cache: 'no-store'});
    if (rApiOpenapi.ok) {
      const j2 = await rApiOpenapi.json();
      return buildFromOpenAPI(j2);
    }
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
    const paths = spec && spec.paths || {};
    Object.keys(paths).forEach((p) => {
      const ops = paths[p] || {};
      ['get', 'post', 'put', 'patch', 'delete'].forEach((m) => {
        if (ops[m]) {
          out.push({
            method: m.toUpperCase(),
            path: p,
            summary: ops[m].summary || '',
            description: ops[m].description || '',
          });
        }
      });
    });
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
      devLog('debug', '[API] toggleAllChildren', { expand, childGroups: childGroups.length });
      childGroups.forEach((childGroup) => {
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
      devLog('debug', '[API] toggleAllChildren endpoints', { expand, endpoints: endpoints.length });
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
        const s = document.createElement('section');
        s.className = 'api-group';
        s.setAttribute('data-open', '1');
        const h = document.createElement('header');
        h.className = 'api-group__header';
        s.appendChild(h);
        const title = document.createElement('h3');
        title.className = 'api-group__title';
        h.appendChild(title);
        const count = document.createElement('span');
        count.className = 'ml-auto hint-sm api-group__count';
        h.appendChild(count);
        const b = document.createElement('div');
        b.className = 'api-group__body';
        s.appendChild(b);
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
          devLog('debug', '[API] Group ± clicked', { group: titleEl ? titleEl.textContent : '', shouldExpand });
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
          devLog('debug', '[API] Group header toggle', { group: titleEl ? titleEl.textContent : '', wasOpen: open, nowOpen: !open });
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
        headerEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
        // Initialize aria-expanded based on current state
        const isOpen = groupEl.getAttribute('data-open') === '1';
        headerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      // Render endpoints at this level
      // Order endpoints by method priority first (GET < POST < DELETE < others), then by path
      const methodOrder = { GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5 };
      node.endpoints.sort((a, b) => {
        const am = methodOrder[String(a.method).toUpperCase()] || 99;
        const bm = methodOrder[String(b.method).toUpperCase()] || 99;
        const byMethod = am - bm;
        if (byMethod !== 0) return byMethod;
        const byPath = a.path.localeCompare(b.path);
        // try {
        //   devLog('log', '[API] Tree sort:', { methodA: a.method, methodB: b.method, priorityA: am, priorityB: bm, pathA: a.path, pathB: b.path, result: byMethod || byPath });
        // }
        // catch (_) {}
        return byPath;
      });
      node.endpoints.forEach((r) => {
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
          await loadScenes();
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
      badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
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
              videoEl.removeEventListener('seeked', onSeek);
              res();
            }
          }
          // fallback timeout
          setTimeout(() => {
            if (!done) {
              done = true;
              videoEl.removeEventListener('seeked', onSeek);
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
    if (btnCC && !btnCC._wired) {
      btnCC._wired = true;
      btnCC.addEventListener('click', () => {
        const tracks = videoEl ? Array.from(videoEl.querySelectorAll('track')) : [];
        const anyShowing = tracks.some((t) => t.mode === 'showing');
        tracks.forEach((t) => (t.mode = anyShowing ? 'disabled' : 'showing'));
        syncControls();
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
    if (btnCC) {
      const tracks = Array.from(videoEl.querySelectorAll('track'));
      const anyShowing = tracks.some((t) => t.mode === 'showing');
      btnCC.classList.toggle('active', anyShowing);
      if (subtitleOverlayEl && !anyShowing) {
        hide(subtitleOverlayEl);
      }
    }
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
    const favCtrl = document.getElementById('btnFavorite');
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
      if (favCtrl) {
        favCtrl.setAttribute('aria-pressed', on ? 'true' : 'false');
        favCtrl.classList.toggle('active', Boolean(on));
      }
    };
    if (favBtn || favCtrl) {
      updateFav(favorite);
    }
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
    const favCtrlBtn = document.getElementById('btnFavorite');
    const wireFavBtn = (btn) => {
      if (!btn || btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', () => {
        const cur = btn.getAttribute('aria-pressed') === 'true';
        const next = !cur;
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        btn.classList.toggle('active', next);
        const other = btn === fav ? favCtrlBtn : fav;
        if (other) {
          other.setAttribute('aria-pressed', next ? 'true' : 'false');
          other.classList.toggle('active', next);
        }
        saveFavorite(next);
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    };
    wireFavBtn(fav);
    wireFavBtn(favCtrlBtn);
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
      // When metadata arrives, we can now safely render scene ticks if scenes already loaded
      videoEl.addEventListener('loadedmetadata', () => {
        renderSceneTicks();
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
      if (typeof showHeatmap !== 'undefined' && showHeatmap) loadHeatmaps();
      if (typeof showScenes !== 'undefined' && showScenes) loadScenes();
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
      const rm = document.createElement('span');
      rm.className = 'remove';
      rm.setAttribute('role', 'button');
      rm.setAttribute('aria-label', 'Remove');
      rm.title = 'Remove';
      rm.textContent = '×';
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeChip(kind, item);
      });
      chip.appendChild(label);
      chip.appendChild(rm);
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
          const onMetadata = () => {
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
        for (let t = 0; t <= total; t += step) {
          samples.push(t);
        }
        if (samples.length > maxSamples) {
          const ratio = samples.length / maxSamples;
          const out = [];
          for (let i = 0; i < samples.length; i += Math.ceil(ratio)) {
            out.push(samples[i]);
          }
          samples = out;
        }
      }
      if (samples.length === 0) samples = [0];
      // Pause and remember state
      const wasPaused = videoEl.paused;
      const prevT = videoEl.currentTime || 0;
      videoEl.pause();
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
      for (let i = 0;
        i < samples.length;
        i++) {
        const t = samples[i];
        await seekTo(t);
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
      videoEl.currentTime = prevT;
      if (!wasPaused) await safePlay(videoEl);
      if (faces.length === 0) {
        notify('No faces detected in sampled frames.', 'error');
        return;
      }
      // If an existing faces.json is present, confirm overwrite
      let overwrite = true;
      const head = await fetch('/api/faces?path=' + encodeURIComponent(currentPath), {method: 'HEAD' });
      if (head.ok) {
        overwrite = confirm('faces.json already exists for this video. Replace it with browser-detected faces?');
        if (!overwrite) return;
      }
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
        if (window.tasksManager) window.tasksManager.loadCoverage();
        await loadArtifactStatuses();
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
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.heatmaps === false) {
        if (badgeHeatmapStatus) badgeHeatmapStatus.textContent = '✗';
        if (badgeHeatmap) badgeHeatmap.dataset.present = '0';
        applyTimelineDisplayToggles();
        return;
      }
      // Prefer JSON + canvas rendering for higher fidelity
      let renderedViaJson = false;
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
      for (let i = 0;
        i < m;
        i++) {
        const srcIdx = Math.min(n - 1, Math.round((i / Math.max(1, m - 1)) * (n - 1)));
        const v = Number(values[srcIdx]);
        resampled[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      }
    }
    else {
      // bucket-average when there are more samples than pixels
      for (let i = 0;
        i < m;
        i++) {
        const start = Math.floor((i / m) * n);
        const end = Math.floor(((i + 1) / m) * n);
        let sum = 0;
        let cnt = 0;
        for (let j = start; j < Math.max(start + 1, end); j++) {
          const v = Number(values[j]);
          if (Number.isFinite(v)) {
            sum += v;
            cnt++;
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
      for (let i = 1;
        i < m;
        i++) {
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
  function clearHeatmapCanvas() {
    if (!heatmapCanvasEl) return;
    const ctx = heatmapCanvasEl.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, heatmapCanvasEl.width, heatmapCanvasEl.height);
  }
  async function loadSprites() {
    // initialize
    sprites = null;
    if (!currentPath) return;
    const st = window.__artifactStatus && window.__artifactStatus[currentPath];
    if (st && st.sprites === false) {
      if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✗';
      if (badgeSprites) badgeSprites.dataset.present = '0';
      return;
    }
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
        const img = document.getElementById('sidebarSpriteImage');
        const box = document.getElementById('sidebarSpritePreview');
        const sheetUrl = typeof sheet === 'string' ? sheet : (sheet?.url || sheet?.path || '');
        // Only set img.src if we have a valid non-empty URL
        if (img && box && sheetUrl && sheetUrl.trim().length > 0) {
          img.src = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
          box.classList.remove('hidden');
        }
      }
    }
    catch (_) {
      sprites = null;
    }
    if (!sprites) {
      if (badgeSpritesStatus) badgeSpritesStatus.textContent = '✗';
      if (badgeSprites) badgeSprites.dataset.present = '0';
      const box = document.getElementById('sidebarSpritePreview');
      if (box) box.classList.add('hidden');
    }
  }
  async function loadScenes() {
    scenes = [];
    if (!currentPath) return;
    const st = window.__artifactStatus && window.__artifactStatus[currentPath];
    if (st && st.markers === false) {
      // Scenes artifact absent; continue anyway to load manual markers via /api/markers
      if (!badgeScenesStatus && badgeScenes) {
        badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
      }
      // Don't early return; we'll set the real count after fetching markers
    }
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
        badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
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
        badgeScenesStatus = badgeScenes.querySelector('span[id$="-status"]') || null;
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
      renderSceneTicks();
      return;
    }
    if (attempt > 12) return;
    // ~3s max (12 * 250ms)
    sceneTickRetryTimer = setTimeout(() => scheduleSceneTicksRetry(attempt + 1), 250);
  }
  async function loadSubtitles() {
    subtitlesUrl = null;
    if (!currentPath || !videoEl) return;
    const st = window.__artifactStatus && window.__artifactStatus[currentPath];
    if (st && st.subtitles === false) {
      if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✗';
      if (badgeSubtitles) badgeSubtitles.dataset.present = '0';
      return;
    }
    // Remove existing tracks and their cue listeners
    Array.from(videoEl.querySelectorAll('track')).forEach((t) => {
      const tt = t.track || null;
      if (tt && t._cueHandler) {
        tt.removeEventListener && tt.removeEventListener('cuechange', t._cueHandler);
      }
      t.remove();
    });
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
      const tt = track.track || Array.from(videoEl.textTracks || []).find((t) => t.kind === 'subtitles');
      if (tt) {
        // ensure track mode is showing only when toggled;
        // start disabled to let CC button control display
        if (typeof tt.mode !== 'undefined') tt.mode = 'disabled';
        const onCueChange = () => {
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
        };
        // store reference to remove later if needed
        track._cueHandler = onCueChange;
        tt.addEventListener('cuechange', onCueChange);
      }
      if (badgeSubtitlesStatus) badgeSubtitlesStatus.textContent = '✓';
      if (badgeSubtitles) badgeSubtitles.dataset.present = '1';
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
    renderMarkersList();
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
  // Sidebar Markers List DOM rendering
  function renderMarkersList() {
    const list = document.getElementById('markersList');
    if (!list) return;
    list.innerHTML = '';
    const tpl = document.getElementById('markerRowTemplate');
    if (!tpl || !tpl.content) {
      // Template is required by repo policy;
      // if missing, show a simple notice and bail
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
            lsRemove(`${LS_PREFIX}:intro:${currentPath}`);
            lsRemove(`${LS_PREFIX}:introEnd:${currentPath}`);
            const mu = new URL('/api/markers', window.location.origin);
            mu.searchParams.set('path', currentPath);
            mu.searchParams.set('special', 'intro');
            await fetch(mu.toString(), { method: 'DELETE' });
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
          tmp2.classList.add('marker-btn-icon');
          tmp2.title = 'Clear';
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
            lsRemove(`${LS_PREFIX}:outro:${currentPath}`);
            lsRemove(`${LS_PREFIX}:outroBegin:${currentPath}`);
            const mu = new URL('/api/markers', window.location.origin);
            mu.searchParams.set('path', currentPath);
            mu.searchParams.set('special', 'outro');
            await fetch(mu.toString(), { method: 'DELETE' });
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
          tmp2.classList.add('marker-btn-icon');
          tmp2.title = 'Clear';
        }
        list.appendChild(frag);
      }
    }
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
      parent.replaceChild(restored, input);
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
      parent.replaceChild(restored, input);
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
      parent.replaceChild(restored, input);
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
    const cont = document.getElementById('artifactBadgesSidebar');
    if (!cont) return;
    const d = await fetchArtifactStatusForPath(currentPath);
    window.__artifactStatus = window.__artifactStatus || {};
    window.__artifactStatus[currentPath] = d || {};
    const keys = ['metadata', 'thumbnail', 'preview', 'phash', 'sprites', 'heatmaps', 'subtitles', 'markers', 'faces'];
    await renderArtifactChips(cont, currentPath, { style: 'badge', keys, status: d || {} });
  }
  function wireBadgeActions() {
    const gen = async (kind) => {
      if (!currentPath) return;
      const caps = (window.tasksManager && window.tasksManager.capabilities) || window.__capabilities || {};
      const needsFfmpeg = new Set([
        'heatmaps',
        'markers',
        'sprites',
        'preview',
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
      try {
        let url;
        if (kind === 'heatmaps') url = new URL('/api/heatmaps/create', window.location.origin);
        else if (kind === 'markers') url = new URL('/api/markers/detect', window.location.origin);
        else if (kind === 'subtitles') url = new URL('/api/subtitles/create', window.location.origin);
        else if (kind === 'sprites') url = new URL('/api/sprites/create', window.location.origin);
        else if (kind === 'faces') url = new URL('/api/faces/create', window.location.origin);
        else if (kind === 'preview') url = new URL('/api/preview', window.location.origin);
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
            else if (kind === 'preview') present = Boolean(st.preview ?? st.hover);
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
    attach(bPreview, 'preview');
    attach(bPhash, 'phash');
  }
  function handleSpriteHover(evt) {
    if ((!sprites || !sprites.index || !sprites.sheet) && currentPath) {
      const st = window.__artifactStatus && window.__artifactStatus[currentPath];
      if (st && st.sprites && !window.__spritesRequested) {
        window.__spritesRequested = true;
        loadSprites && loadSprites();
      }
    }
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
    const idx = sprites.index;
    tw = Number(idx.tile_width || (idx.tile && idx.tile[0]) || tw);
    th = Number(idx.tile_height || (idx.tile && idx.tile[1]) || th);
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
      const framesMetadata = Array.isArray(idx.frames) ? idx.frames : null;
      let totalFrames = cols * rows;
      if (framesMetadata && framesMetadata.length) {
        totalFrames = framesMetadata.length;
      }
      else if (Number.isFinite(Number(idx.frames))) {
        totalFrames = Math.max(1, Number(idx.frames));
      }
      const metaDur = Number(idx.duration || idx.video_duration || (framesMetadata && framesMetadata.length ? (Number(framesMetadata[framesMetadata.length - 1]?.t ?? framesMetadata[framesMetadata.length - 1]?.time ?? 0) || 0) : 0) || vidDur || 0);
      // Choose a frame index based on available metadata
      let frame = 0;
      if (framesMetadata && framesMetadata.length) {
        // framesMetadata is usually small (<= 100). Linear search for nearest is fine and avoids per-move allocations.
        let nearest = 0;
        let bestDiff = Infinity;
        for (let i = 0;
          i < framesMetadata.length;
          i++) {
          const ft = Number(framesMetadata[i]?.t ?? framesMetadata[i]?.time ?? (i * (metaDur / Math.max(1, framesMetadata.length - 1))));
          const d = Math.abs(ft - t);
          if (d < bestDiff) {
            bestDiff = d;
            nearest = i;
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
      // Cache and prefetch sprite sheet once per video to avoid cache-busting latency
      if (!window.__spriteSheetUrlCache || window.__spriteSheetUrlCacheBase !== sprites.sheet) {
        window.__spriteSheetUrlCacheBase = sprites.sheet;
        window.__spriteSheetUrlCache = sprites.sheet; // no timestamp; allow browser caching
        const preImg = new Image();
        preImg.decoding = 'async';
        preImg.loading = 'eager';
        preImg.src = window.__spriteSheetUrlCache;
      }
      const sheetUrl = window.__spriteSheetUrlCache;
      if (!sheetUrl) {
        hideSprite();
        return;
      }
      if (!spriteTooltipEl.style.backgroundImage) {
        // Show neutral placeholder immediately while sheet loads
        spriteTooltipEl.style.backgroundColor = 'rgba(0,0,0,0.55)';
      }
      spriteTooltipEl.style.backgroundImage = `url('${sheetUrl}')`;
      spriteTooltipEl.style.backgroundPosition = `${xOff}px ${yOff}px`;
      spriteTooltipEl.style.backgroundPositionX = `${xOff}px`;
      spriteTooltipEl.style.backgroundPositionY = `${yOff}px`;
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
  // Persist on unload as a final safeguard
  window.addEventListener('beforeunload', () => {
    if (videoEl && currentPath) {
      saveProgress(currentPath, {
        t: videoEl.currentTime || 0,
        d: duration,
        paused: videoEl.paused,
        rate: videoEl.playbackRate,
      });
    }
  });
  function hideSprite() {
    hide(spriteTooltipEl);
  }
  // Apply show/hide for heatmap and markers based on settings
  function applyTimelineDisplayToggles() {
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
    if (!window.Player) return;
    const v = document.getElementById('playerVideo');
    if (!v) return;
    const active = activeId || (window.tabSystem && window.tabSystem.getActiveTab && window.tabSystem.getActiveTab());
    if (active !== 'player' && !v.paused && !v.ended) {
      v.pause();
    }
  }
  const ts = window.tabSystem;
  if (ts && typeof ts.on === 'function') {
    ts.on('switch', (id) => pauseIfNotActive(id));
  }
  else if (ts && typeof ts.addEventListener === 'function') {
    ts.addEventListener('switch', (e) => pauseIfNotActive(e.detail));
  }
  const panel = document.getElementById('player-panel');
  if (panel && !panel._pauseObserver) {
    const obs = new MutationObserver(() => pauseIfNotActive());
    obs.observe(panel, {attributes: true, attributeFilter: ['hidden', 'class'] });
    panel._pauseObserver = obs;
  }
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
  const filterRanges = document.querySelectorAll('#effectsPanel input[type=range][data-fx]');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  // Removed transform controls
  const presetButtons = document.querySelectorAll('#effectsPanel .fx-preset');
  const valueSpans = document.querySelectorAll('#effectsPanel [data-fx-val]');
  const COLOR_MATRIX_NODE = document.getElementById('playerColorMatrixValues');
  const LS_KEY_EFFECTS = 'mediaPlayer:effects';
  const state = {r: 1, g: 1, b: 1, blur: 0};
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
    loadState();
    renderValues();
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
  if (!getLocalStorageItem(LS_KEY_SIDEBAR) && window.innerWidth < 1500) {
    setLocalStorageItem(LS_KEY_SIDEBAR, '1');
  }
  applySidebarCollapsed(true);
  if (toggleBtn && !toggleBtn._wired) {
    toggleBtn._wired = true;
    toggleBtn.addEventListener('click', () => toggleSidebar());
  }
  function loadState() {
    const saved = JSON.parse(getLocalStorageItem(LS_KEY_EFFECTS) || '{}');
    if (saved && typeof saved === 'object') {
      // Only apply known keys;
      // ignore corruption
      ['r', 'g', 'b', 'blur'].forEach((k) => {
        if (k in saved && typeof saved[k] === 'number') state[k] = saved[k];
      });
    }
    // apply to inputs
    filterRanges.forEach((r) => {
      const k = r.dataset.fx;
      if (k in state) r.value = state[k];
    });
    applyEffects();
  }
  function saveState() {
    setLocalStorageItem(LS_KEY_EFFECTS, JSON.stringify(state));
  }
  function applyEffects() {
    if (!stage) return;
    if (COLOR_MATRIX_NODE) {
      const {r, g, b} = state;
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
    setLocalStorageItem(LS_KEY_SIDEBAR, next ? '1' : '0');
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
  const PERF_PAGE_LS_KEY = 'mediaPlayer:performers.page.v1';
  const PERF_PAGE_SIZE_LS_KEY = 'mediaPlayer:performers.pageSize.v1';
  const PERF_IMAGE_FILTER_LS_KEY = 'mediaPlayer:performers.imageFilter.v1';
  const PERF_FACE_FILTER_LS_KEY = 'mediaPlayer:performers.faceFilter.v1';
  const IMAGE_FILTER_VALUES = ['all', 'with', 'without'];
  const FACE_FILTER_VALUES = ['all', 'with', 'without'];
  function sanitizePositiveInt(value, fallback) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return fallback;
    return n;
  }
  function loadPagerValue(key, fallback) {
    try {
      const raw = (typeof getLocalStorageItem === 'function') ? getLocalStorageItem(key, { type: 'number', fallback }) : fallback;
      return sanitizePositiveInt(raw, fallback);
    }
    catch (_) {
      return fallback;
    }
  }
  function persistPagerValue(key, value, fallback) {
    const normalized = sanitizePositiveInt(value, fallback);
    if (typeof setLocalStorageItem === 'function') setLocalStorageItem(key, normalized, { type: 'number' });
    else localStorage.setItem(key, String(normalized));
  }
  function normalizeImageFilter(value, fallback = 'all') {
    const val = String(value || '').toLowerCase();
    return IMAGE_FILTER_VALUES.includes(val) ? val : fallback;
  }
  function loadImageFilter() {
    try {
      const raw = (typeof getLocalStorageItem === 'function') ? getLocalStorageItem(PERF_IMAGE_FILTER_LS_KEY) : (localStorage.getItem ? localStorage.getItem(PERF_IMAGE_FILTER_LS_KEY) : null);
      return normalizeImageFilter(raw);
    }
    catch (_) {
      return 'all';
    }
  }
  function persistImageFilter(value) {
    const normalized = normalizeImageFilter(value);
    if (typeof setLocalStorageItem === 'function') setLocalStorageItem(PERF_IMAGE_FILTER_LS_KEY, normalized);
    else if (localStorage && typeof localStorage.setItem === 'function') localStorage.setItem(PERF_IMAGE_FILTER_LS_KEY, normalized);
    return normalized;
  }
  function normalizeFaceFilter(value, fallback = 'all') {
    const val = String(value || '').toLowerCase();
    return FACE_FILTER_VALUES.includes(val) ? val : fallback;
  }
  function loadFaceFilter() {
    try {
      const raw = (typeof getLocalStorageItem === 'function') ? getLocalStorageItem(PERF_FACE_FILTER_LS_KEY) : (localStorage.getItem ? localStorage.getItem(PERF_FACE_FILTER_LS_KEY) : null);
      return normalizeFaceFilter(raw);
    }
    catch (_) {
      return 'all';
    }
  }
  function persistFaceFilter(value) {
    const normalized = normalizeFaceFilter(value);
    if (typeof setLocalStorageItem === 'function') setLocalStorageItem(PERF_FACE_FILTER_LS_KEY, normalized);
    else if (localStorage && typeof localStorage.setItem === 'function') localStorage.setItem(PERF_FACE_FILTER_LS_KEY, normalized);
    return normalized;
  }
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
  let detectAllBtn;
  let autoMatchRunning = false;
  let dropZone;
  let statusEl;
  let spinnerEl;
  let performers = [];
  let selected = new Set();
  let searchTerm = '';
  let imageFilter = loadImageFilter();
  let faceFilter = loadFaceFilter();
  // Sort state (default: by count desc)
  let sortBy = 'count'; // 'count' | 'name'
  // sortDir UI flag (mapping to server order happens in fetch):
  // We treat sortDir === 1 as the default for count (meaning server 'desc'), and -1 for asc.
  let sortDir = 1;
  // Pagination state
  let page = loadPagerValue(PERF_PAGE_LS_KEY, 1);
  let pageSize = loadPagerValue(PERF_PAGE_SIZE_LS_KEY, 32);
  // Server pagination metadata (set after fetch)
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
  let imageFilterSel = null;
  let faceFilterSel = null;
  let detectAllRunning = false;
  // Bottom pager mirrors
  let pagerB = null;
  let prevBtnB = null;
  let nextBtnB = null;
  let pageInfoB = null;
  let pageSizeSelB = null;
  function persistPageState(value = page) {
    persistPagerValue(PERF_PAGE_LS_KEY, value, 1);
  }
  function persistPageSizeState(value = pageSize) {
    persistPagerValue(PERF_PAGE_SIZE_LS_KEY, value, 32);
  }
  function updatePage(newValue) {
    page = sanitizePositiveInt(newValue, 1);
    persistPageState();
  }
  function goToFirstPage() {
    updatePage(1);
  }
  function updatePageSize(newValue) {
    pageSize = sanitizePositiveInt(newValue, 32);
    persistPageSizeState();
  }
  function syncPageSizeSelectors() {
    const target = String(pageSize);
    let matched = false;
    [pageSizeSel, pageSizeSelB].forEach((sel) => {
      if (!sel) return;
      const opts = Array.from(sel.options || []);
      const has = opts.some((opt) => opt.value === target);
      if (has) {
        sel.value = target;
        matched = true;
      }
    });
    if (!matched) {
      const fallbackSel = pageSizeSel || pageSizeSelB;
      const fallbackVal = (fallbackSel && fallbackSel.options && fallbackSel.options.length) ? fallbackSel.options[0].value : '32';
      [pageSizeSel, pageSizeSelB].forEach((sel) => {
        if (sel) sel.value = fallbackVal;
      });
      updatePageSize(fallbackVal);
    }
  }
  // Browser face-detection cache (per image URL) to avoid repeated work
  const faceBoxCache = new Map(); // url -> [x,y,w,h]
  const imageMetricsCache = new Map(); // url -> {width,height}
  const FaceDetectSupported = (typeof window !== 'undefined' && 'FaceDetector' in window && typeof window.FaceDetector === 'function');

  function setPagerVisibility(show) {
    const toggle = (el) => {
      if (!el) return;
      if (show) {
        el.hidden = false;
        el.removeAttribute('aria-hidden');
        if (el.classList) el.classList.remove('d-none');
        if (el.style) el.style.removeProperty('display');
      }
      else {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        if (el.classList) el.classList.add('d-none');
        if (el.style) el.style.display = 'none';
      }
    };
    toggle(pager);
    toggle(pagerB);
  }

  function shouldShowPager(total) {
    const sizeCandidates = [pageSize, pageSizeSel && Number(pageSizeSel.value), pageSizeSelB && Number(pageSizeSelB.value)];
    const effectiveSize = sizeCandidates.find((n) => Number.isFinite(n) && n > 0) || 0;
    if (!effectiveSize) return total > 0 && srvTotalPages > 1;
    return total > effectiveSize;
  }

  function scrollPerformersPager(position = 'top') {
    if (typeof window === 'undefined') return;
    const panel = document.getElementById('performers-panel');
    if (!panel || panel.hasAttribute('hidden')) return;
    const anchor = position === 'top'
      ? (document.getElementById('performersPager') || gridEl || panel)
      : (document.getElementById('performersPagerBottom') || gridEl || panel);
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const rect = anchor.getBoundingClientRect();
    const scrollEl = document.scrollingElement || document.documentElement || document.body;
    if (!scrollEl) return;
    const current = window.pageYOffset || scrollEl.scrollTop || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let targetTop = current + rect.top;
    if (position === 'top') {
      targetTop = Math.max(0, targetTop - 16);
    }
    else {
      const desired = current + rect.bottom - viewportHeight + 16;
      targetTop = Math.max(0, desired);
    }
    if (typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    else if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    else {
      scrollEl.scrollTop = targetTop;
    }
  }

  // Lazy loader for TensorFlow.js + BlazeFace (only if FaceDetector is unavailable or returns no faces).
  // Previous implementation allowed multiple concurrent loads (race) causing repeated dynamic imports
  // when several images triggered fallback simultaneously. We now guard with a cached Promise so at most
  // one load occurs. On failure, we clear the promise to allow retry.
  let __blazeFaceModel = null; // resolved model instance (once loaded)
  let __blazeFaceModelPromise = null; // in-flight promise (guards concurrent calls)
  async function loadBlazeFaceModel() {
    if (__blazeFaceModel) return __blazeFaceModel; // fast path after successful load
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
        const warm = document.createElement('canvas');
        warm.width = 4;
        warm.height = 4;
        const c2 = warm.getContext('2d');
        if (c2) c2.fillRect(0, 0, 4, 4);
        await model.estimateFaces(warm, false);
        __blazeFaceModel = model;
        devLog('debug', '[FaceBox] BlazeFace model loaded (singleton)');
        return __blazeFaceModel;
      }
      catch (e) {
        // Clear promise so subsequent attempts can retry
        __blazeFaceModelPromise = null;
        devLog('warn', '[FaceBox] Failed to load TFJS/BlazeFace', e);
        return null;
      }
    })();
    return __blazeFaceModelPromise;
  }

  // Square/padding helper removed: we now use raw detector rectangles normalized to [0,1].

  async function detectFaceBoxWithTF(canvas, W, H) {
    try {
      const model = await loadBlazeFaceModel();
      if (!model) return null;
      const preds = await model.estimateFaces(canvas, false);
      let best = null;
      let bestA = -1;
      for (const p of preds || []) {
        const tl = p.topLeft || [0, 0];
        const br = p.bottomRight || [0, 0];
        const x = Math.max(0, Math.floor(tl[0]));
        const y = Math.max(0, Math.floor(tl[1]));
        const w = Math.max(0, Math.floor((br[0] - tl[0])));
        const h = Math.max(0, Math.floor((br[1] - tl[1])));
        if (w <= 1 || h <= 1) continue;
        const area = w * h;
        if (area > bestA) {
          bestA = area;
          best = [x, y, w, h];
        }
      }
      if (!best) {
        if (faceDebugEnabled()) {
          devLog('info', '[FaceBox][TFJS] no face predictions');
        }
        return null;
      }
      const [x, y, w, h] = best;
      const box = [x / W, y / H, w / W, h / H].map((v) => Math.max(0, Math.min(1, v)));
      if (faceDebugEnabled()) {
        devLog('info', '[FaceBox][TFJS] raw px=[' + x + ',' + y + ',' + w + ',' + h + '] final norm=[' + box.map((v) => v.toFixed(3)).join(',') + ']');
      }
      return box;
    }
    catch (e) {
      if (faceDebugEnabled()) {
        devLog('warn', '[FaceBox][TFJS] error', e);
      }
      return null;
    }
  }

  function debugEnabled() {
    // Enable via localStorage 'mediaPlayer:debug' or ?debug=1
    const ls = localStorage.getItem('mediaPlayer:debug');
    if (ls === '1' || ls === 'true') return true;
    if (typeof window !== 'undefined' && window.location && window.location.search.includes('debug=1')) return true;
    return false;
  }

  function faceDebugEnabled() {
    // Enable via localStorage 'mediaPlayer:faceDebug' or ?faceDebug=1
    const ls = localStorage.getItem('mediaPlayer:faceDebug');
    if (ls === '1' || ls === 'true') return true;
    if (typeof window !== 'undefined' && window.location && window.location.search.includes('faceDebug=1')) return true;
    return false;
  }

  function rememberImageMetrics(url, metrics) {
    if (!url || !metrics) return;
    const width = Math.max(1, Number(metrics.width) || 0);
    const height = Math.max(1, Number(metrics.height) || 0);
    imageMetricsCache.set(url, { width, height });
  }

  function getCachedImageMetrics(url) {
    return url ? imageMetricsCache.get(url) || null : null;
  }

  async function measureImageDimensions(url) {
    if (!url) return null;
    if (imageMetricsCache.has(url)) return imageMetricsCache.get(url);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const width = Math.max(1, img.naturalWidth || img.width || 0);
      const height = Math.max(1, img.naturalHeight || img.height || 0);
      rememberImageMetrics(url, { width, height });
      return { width, height };
    }
    catch (_) {
      return null;
    }
  }

  async function detectFaceBoxForImage(url, opts = {}) {
    try {
      if (!url) return null;
      const force = Boolean(opts && opts.force);
      if (!force && faceBoxCache.has(url)) return faceBoxCache.get(url);
      if (force && faceBoxCache.has(url)) faceBoxCache.delete(url);
      if (faceDebugEnabled()) {
        devLog('info', '[FaceBox] start url=' + url);
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
      rememberImageMetrics(url, { width: W, height: H });
      if (faceDebugEnabled()) {
        devLog('info', '[FaceBox] loaded image dims', W, H);
      }
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) {
        if (faceDebugEnabled()) {
          devLog('warn', '[FaceBox] 2d context unavailable');
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
            devLog('info', '[FaceBox][Native] detections=' + (dets ? dets.length : 0));
          }
          let best = null;
          let bestA = -1;
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
              bestA = area;
              best = [x, y, w, h];
            }
          }
          if (best) {
            const [x, y, w, h] = best;
            box = [x / W, y / H, w / W, h / H].map((v) => Math.max(0, Math.min(1, v)));
            if (faceDebugEnabled()) {
              devLog('info', '[FaceBox][Native] chosen px=[' + x + ',' + y + ',' + w + ',' + h + '] norm=[' + box.map((v) => v.toFixed(3)).join(',') + ']');
            }
          }
          else {
            if (faceDebugEnabled()) {
              devLog('info', '[FaceBox][Native] no usable detections, will fallback');
            }
          }
        }
        catch (e) {
          if (faceDebugEnabled()) {
            devLog('warn', '[FaceBox][Native] error, fallback to TFJS', e);
          }
        }
      }
      else {
        if (faceDebugEnabled()) {
          devLog('info', '[FaceBox] FaceDetector unsupported; using TFJS fallback');
        }
      }
      // TFJS fallback if needed
      if (!box) {
        box = await detectFaceBoxWithTF(canvas, W, H);
      }
      if (!box) {
        faceBoxCache.set(url, null);
        if (faceDebugEnabled()) {
          devLog('info', '[FaceBox] no face detected');
        }
        return null;
      }
      faceBoxCache.set(url, box);
      if (faceDebugEnabled()) {
        devLog('info', '[FaceBox] final norm box', box);
      }
      return box;
    }
    catch (e) {
      if (faceDebugEnabled()) {
        devLog('warn', '[FaceBox] error', e);
      }
      return null;
    }
  }
  // Debounced search trigger (shared helper)
  let searchTimer = null; // retained only if we decide to cancel externally (not used now)
  // Face Box Modal elements (lazy lookup)
  let fbModal = null;
  let fbImg = null;
  let fbOverlay = null;
  let fbTitle = null;
  let fbClose = null;
  let fbUpload = null;
  let fbDetect = null;
  function ensureFaceBoxModalEls() {
    if (fbModal) return true;
    fbModal = document.getElementById('faceBoxModal');
    if (!fbModal) return false;
    const preventModalDnD = (e) => {
      if (!fbModal || fbModal.hidden) return;
      e.preventDefault();
      e.stopPropagation();
    };
    fbModal.addEventListener('dragover', preventModalDnD, true);
    fbModal.addEventListener('drop', preventModalDnD, true);
    if (typeof MutationObserver !== 'undefined' && !fbModal._dropGuardObserver) {
      const obs = new MutationObserver(() => setDropInterceptSuspended(!fbModal.hidden));
      obs.observe(fbModal, { attributes: true, attributeFilter: ['hidden'] });
      fbModal._dropGuardObserver = obs;
      setDropInterceptSuspended(!fbModal.hidden);
    }
    else {
      setDropInterceptSuspended(!fbModal.hidden);
    }
    fbImg = document.getElementById('faceBoxImg');
    fbOverlay = document.getElementById('faceBoxOverlay');
    fbTitle = document.getElementById('faceBoxTitle');
    fbClose = document.getElementById('faceBoxClose');
    fbUpload = document.getElementById('faceBoxUploadBtn');
    fbDetect = document.getElementById('faceBoxDetectBtn');
    if (fbImg) {
      fbImg.setAttribute('draggable', 'false');
      const haltImgDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      fbImg.addEventListener('dragstart', haltImgDrag);
      fbImg.addEventListener('drop', haltImgDrag);
    }
    if (fbClose) {
      fbClose.addEventListener('click', () => closeFaceBoxModal());
    }
    if (!fbModal._escWire) {
      fbModal._escWire = true;
      fbModal.addEventListener('modal:requestClose', (ev) => {
        ev.preventDefault();
        closeFaceBoxModal();
      });
    }
    return true;
  }

  function closeFaceBoxModal() {
    if (!fbModal) return;
    fbModal.hidden = true;
    resetFaceBoxOverlayState();
    devLog('debug', 'FaceBox', 'close modal', {
      overlayBox: fbOverlay && fbOverlay.dataset ? fbOverlay.dataset.box : null,
    });
    setDropInterceptSuspended(false);
  }

  function resetFaceBoxOverlayState() {
    if (!fbOverlay) return;
    fbOverlay.hidden = true;
    fbOverlay.style.width = '0px';
    fbOverlay.style.height = '0px';
    fbOverlay.style.left = '0px';
    fbOverlay.style.top = '0px';
    delete fbOverlay.dataset.box;
    delete fbOverlay.dataset.faceBox;
    if (typeof fbOverlay._faceBoxCleanup === 'function') {
      fbOverlay._faceBoxCleanup();
    }
  }


  function getAvatarImgEl(avatarEl) {
    if (!avatarEl) return null;
    return avatarEl.querySelector('.pc-avatar-img');
  }

  function getFaceIndicatorEl(avatarEl) {
    if (!avatarEl) return null;
    const card = typeof avatarEl.closest === 'function' ? avatarEl.closest('.perf-card') : null;
    if (card) {
      const indicator = card.querySelector('.pc-face-indicator');
      if (indicator) return indicator;
    }
    return avatarEl.querySelector ? avatarEl.querySelector('.pc-face-indicator') : null;
  }

  function resetAvatarImageCrop(avatarEl) {
    const imgEl = getAvatarImgEl(avatarEl);
    if (!imgEl) return;
    imgEl.style.width = '100%';
    imgEl.style.height = '100%';
    imgEl.style.top = '0';
    imgEl.style.left = '0';
    imgEl.style.right = 'auto';
    imgEl.style.bottom = 'auto';
    imgEl.style.objectFit = 'cover';
    imgEl.style.transform = 'none';
    imgEl.style.maxWidth = 'none';
    imgEl.style.maxHeight = 'none';
    imgEl._pendingFaceBox = null;
  }

  function setAvatarImageOnCard(avatarEl, performer, imgUrl) {
    if (!avatarEl) return;
    const imgEl = getAvatarImgEl(avatarEl);
    if (!imgEl) return;
    const performerName = performer && performer.name ? performer.name : '';
    if (performerName) avatarEl.dataset.performerName = performerName;
    if (imgUrl) {
      resetAvatarImageCrop(avatarEl);
      imgEl.src = imgUrl;
      imgEl.alt = performer && performer.name ? performer.name : 'Performer image';
      imgEl.hidden = false;
      avatarEl.classList.add('has-image');
      avatarEl.dataset.imgUrl = imgUrl;
    }
    else {
      resetAvatarImageCrop(avatarEl);
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      avatarEl.classList.remove('has-image');
      delete avatarEl.dataset.imgUrl;
    }
    const hasFaceBox = Array.isArray(performer && performer.image_face_box) && performer.image_face_box.length === 4;
    updateAvatarFaceIndicator(avatarEl, { hasImage: Boolean(imgUrl), hasFaceBox, name: performerName });
  }

  function updateAvatarFaceIndicator(avatarEl, opts = {}) {
    if (!avatarEl) return;
    const indicator = getFaceIndicatorEl(avatarEl);
    const hasImage = typeof opts.hasImage === 'boolean' ? opts.hasImage : avatarEl.classList.contains('has-image');
    const hasFaceBox = Boolean(opts.hasFaceBox);
    const performerName = (opts.name || avatarEl.dataset.performerName || '').trim();
    const labelPrefix = performerName ? performerName + ': ' : '';
    const baseUploadHint = 'Click to upload or adjust the image.';
    if (!indicator) {
      if (performerName) avatarEl.setAttribute('aria-label', performerName);
      return;
    }
    if (!hasImage) {
      indicator.hidden = true;
      indicator.removeAttribute('data-state');
      indicator.removeAttribute('title');
      avatarEl.setAttribute('aria-label', labelPrefix + 'No image. ' + baseUploadHint);
      return;
    }
    indicator.hidden = false;
    indicator.dataset.state = hasFaceBox ? 'present' : 'missing';
    const statusText = hasFaceBox ? 'Face crop saved.' : 'Face crop missing.';
    indicator.title = statusText.replace(/\.$/, '');
    avatarEl.setAttribute('aria-label', labelPrefix + statusText + ' ' + baseUploadHint);
  }

  function applyFaceBoxToAvatar(avatarEl, box) {
    if (!avatarEl) return;
    const imgEl = getAvatarImgEl(avatarEl);
    if (!imgEl) return;
    if (!Array.isArray(box) || box.length !== 4) {
      resetAvatarImageCrop(avatarEl);
      delete avatarEl.dataset.faceBox;
      updateAvatarFaceIndicator(avatarEl, { hasFaceBox: false });
      return;
    }
    const normalized = box.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
    const applyCrop = () => {
      const naturalWidth = imgEl.naturalWidth;
      const naturalHeight = imgEl.naturalHeight;
      if (!naturalWidth || !naturalHeight) return false;
      const squareBox = coerceSquareBox(normalized, { width: naturalWidth, height: naturalHeight }) || normalized;
      const [nx, ny, nw, nh] = squareBox;
      avatarEl.dataset.faceBox = squareBox.join(',');
      const avatarSize = Math.max(1, Math.min(avatarEl.clientWidth || 0, avatarEl.clientHeight || 0) || 56);
      const boxWidthPx = nw * naturalWidth;
      const boxHeightPx = nh * naturalHeight;
      if (boxWidthPx <= 0 || boxHeightPx <= 0) {
        return false;
      }
      const dimsSimilar = Math.abs(boxWidthPx - boxHeightPx) <= Math.max(boxWidthPx, boxHeightPx) * 0.05;
      const scale = dimsSimilar
        ? (avatarSize / boxWidthPx)
        : (avatarSize / Math.max(boxWidthPx, boxHeightPx));
      const displayWidth = naturalWidth * scale;
      const displayHeight = naturalHeight * scale;
      const offsetX = -(nx * naturalWidth * scale);
      const offsetY = -(ny * naturalHeight * scale);
      imgEl.style.width = `${displayWidth}px`;
      imgEl.style.height = `${displayHeight}px`;
      imgEl.style.left = `${offsetX}px`;
      imgEl.style.top = `${offsetY}px`;
      imgEl.style.right = 'auto';
      imgEl.style.bottom = 'auto';
      imgEl.style.objectFit = 'contain';
      imgEl.style.transform = 'none';
      imgEl.style.maxWidth = 'none';
      imgEl.style.maxHeight = 'none';
      imgEl._pendingFaceBox = null;
      return true;
    };
    if (!applyCrop()) {
      imgEl._pendingFaceBox = normalized;
      if (!imgEl._avatarLoadListener) {
        const handler = () => {
          imgEl._avatarLoadListener = null;
          const pending = imgEl._pendingFaceBox || normalized;
          imgEl._pendingFaceBox = null;
          applyFaceBoxToAvatar(avatarEl, pending);
        };
        imgEl._avatarLoadListener = handler;
        imgEl.addEventListener('load', handler, { once: true });
      }
    }
    updateAvatarFaceIndicator(avatarEl, { hasFaceBox: true });
  }

  function getPerformerSlug(performer) {
    if (!performer) return '';
    return String(performer.slug || performer.name || '').trim();
  }

  function getPerformerPrimaryImage(performer) {
    if (!performer) return '';
    if (typeof performer.image === 'string' && performer.image.trim()) {
      return performer.image.trim();
    }
    if (Array.isArray(performer.images)) {
      const hit = performer.images.find((img) => typeof img === 'string' && img.trim());
      if (hit) return hit.trim();
    }
    return '';
  }

  function coerceSquareBox(box, dims = null) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const clampUnit = (val) => Math.max(0, Math.min(1, Number.isFinite(val) ? Number(val) : 0));
    let [x, y, w, h] = box;
    x = clampUnit(x);
    y = clampUnit(y);
    w = clampUnit(w);
    h = clampUnit(h);
    let imgW = 1;
    let imgH = 1;
    if (dims && Number.isFinite(dims.width) && Number(dims.width) > 0) imgW = Number(dims.width);
    if (dims && Number.isFinite(dims.height) && Number(dims.height) > 0) imgH = Number(dims.height);
    if (imgH <= 0) imgH = imgW || 1;
    if (imgW <= 0) imgW = imgH || 1;
    const pxX = x * imgW;
    const pxY = y * imgH;
    const pxW = Math.max(1, w * imgW);
    const pxH = Math.max(1, h * imgH);
    const cx = pxX + pxW / 2;
    const cy = pxY + pxH / 2;
    const maxSidePx = Math.min(imgW, imgH);
    let sidePx = Math.max(pxW, pxH);
    sidePx = Math.max(1, Math.min(sidePx, maxSidePx));
    const clampSpan = (val, rangeMax) => Math.max(0, Math.min(rangeMax, val));
    const leftPx = clampSpan(cx - sidePx / 2, imgW - sidePx);
    const topPx = clampSpan(cy - sidePx / 2, imgH - sidePx);
    const nx = Math.max(0, Math.min(1, leftPx / imgW));
    const ny = Math.max(0, Math.min(1, topPx / imgH));
    const nw = Math.max(0, Math.min(1, sidePx / imgW));
    const nh = Math.max(0, Math.min(1, sidePx / imgH));
    return [nx, ny, nw, nh];
  }

  function boxesAlmostEqual(a, b, eps = 1e-4) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) return false;
    for (let i = 0; i < 4; i += 1) {
      if (Math.abs(Number(a[i]) - Number(b[i])) > eps) return false;
    }
    return true;
  }

  async function persistFaceBox({ performer, box, toastOnSuccess = false, toastOnError = false, imageMetrics = null } = {}) {
    if (!performer || !Array.isArray(box) || box.length !== 4) return null;
    const slug = getPerformerSlug(performer);
    if (!slug) {
      if (toastOnError) {
        notify('Cannot save face box: missing performer slug', 'error');
      }
      return null;
    }
    const primaryImage = getPerformerPrimaryImage(performer);
    if (!primaryImage) {
      if (toastOnError) {
        notify('Upload a primary image before saving a face box', 'error');
      }
      return null;
    }
    if (!performer.image && primaryImage) {
      performer.image = primaryImage;
    }
    const normalized = coerceSquareBox(box, imageMetrics);
    if (!normalized) return null;
    const payload = { x: normalized[0], y: normalized[1], w: normalized[2], h: normalized[3] };
    try {
      const url = new URL('/api/performers/face-box', window.location.origin);
      url.searchParams.set('slug', slug);
      const resp = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        let body = null;
        try {
          body = await resp.json();
        }
        catch (_) {
          body = null;
        }
        const msg = body && body.detail && body.detail.message ? body.detail.message : (body && body.message ? body.message : `HTTP ${resp.status}`);
        throw new Error(msg);
      }
      performer.image_face_box = normalized.slice();
      updatePerformerAvatars(performer);
      if (toastOnSuccess) {
        (window.showToast || notify)('Face box saved', 'success');
      }
      return normalized.slice();
    }
    catch (err) {
      if (toastOnError) {
        const msg = err && err.message ? err.message : 'error';
        notify('Failed to save face box: ' + msg, 'error');
      }
      return null;
    }
  }

  async function openFaceBoxModal({ performer, imgUrl }) {
    if (!ensureFaceBoxModalEls()) return;
    devLog('debug', 'FaceBox', 'open modal', {
      slug: performer && performer.slug,
      name: performer && performer.name,
      serverBox: performer && performer.image_face_box,
      existingOverlayBox: fbOverlay && fbOverlay.dataset ? fbOverlay.dataset.box : null,
    });
    fbModal.hidden = false;
    setDropInterceptSuspended(true);
    resetFaceBoxOverlayState();
    if (fbTitle) fbTitle.textContent = performer && performer.name ? `${performer.name} — Image (Drag box to adjust)` : 'Image Preview';
    const linksEl = document.getElementById('faceBoxLinks');
    if (linksEl && performer) {
      const slug = encodeURIComponent(String(performer.slug || performer.name || ''));
      const links = [
        { label: 'gaymaletube', href: `https://www.gaymaletube.com/pornstar/${slug}` },
        { label: 'boyfriendtv', href: `https://www.boyfriendtv.com/pornstars/?modelsearchSubmitCheck=FORM_SENDED&key=models&mode=model-search&q=${slug}&submitModelSearch=Search` },
        { label: 'xhamster', href: `https://xhamster.com/gay/pornstars/${slug}` },
      ];
      linksEl.innerHTML = links.map((l) => `<a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join(' ');
      linksEl.classList.remove('hidden');
    }
    if (fbDetect) {
      fbDetect.disabled = true;
      fbDetect.classList.remove('btn-busy');
    }
    if (fbImg) {
      fbImg.src = imgUrl || '';
      fbImg.onload = async () => {
        // Decide on a box: prefer server, else client cache/detect
        let fb = null;
        if (Array.isArray(performer.image_face_box) && performer.image_face_box.length === 4) {
          fb = performer.image_face_box.map(Number);
        }
        else if (fbOverlay && fbOverlay.dataset && fbOverlay.dataset.box) {
          const parts = String(fbOverlay.dataset.box).split(',')
            .map(Number);
          if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) fb = parts;
        }
        else if (imgUrl) {
          fb = await detectFaceBoxForImage(imgUrl);
        }
        if (!fbOverlay) return;
        const hideOverlay = () => {
          fbOverlay.hidden = true;
          fbOverlay.style.width = '0px';
          fbOverlay.style.height = '0px';
          fbOverlay.style.left = '0px';
          fbOverlay.style.top = '0px';
          delete fbOverlay.dataset.box;
        };

        const renderBox = async (rawBox, opts = {}) => {
          const { persistMode = 'diff', toastOnPersist = false } = opts || {};
          if (!Array.isArray(rawBox) || rawBox.length !== 4) return null;
          const metrics = {
            width: fbImg.clientWidth || fbImg.naturalWidth || 0,
            height: fbImg.clientHeight || fbImg.naturalHeight || 0,
          };
          if (!metrics.width || !metrics.height) return null;
          const normalizedFb = coerceSquareBox(rawBox, metrics) || rawBox;
          const [nx, ny, nw, nh] = normalizedFb;
          const x = Math.max(0, Math.round(nx * metrics.width));
          const y = Math.max(0, Math.round(ny * metrics.height));
          const w = Math.max(1, Math.round(nw * metrics.width));
          const h = Math.max(1, Math.round(nh * metrics.height));
          fbOverlay.style.left = x + 'px';
          fbOverlay.style.top = y + 'px';
          fbOverlay.style.width = w + 'px';
          fbOverlay.style.height = h + 'px';
          fbOverlay.hidden = false;
          fbOverlay.dataset.box = normalizedFb.join(',');
          devLog('debug', 'FaceBox', 'modal load box', { box: normalizedFb });
          let savedBox = null;
          const had = Array.isArray(performer.image_face_box) && performer.image_face_box.length === 4 ? performer.image_face_box.map(Number) : null;
          const shouldPersist = persistMode === 'always' || (persistMode === 'diff' && (!had || !boxesAlmostEqual(had, normalizedFb, 0.01)));
          if (persistMode !== 'never' && shouldPersist) {
            savedBox = await persistFaceBox({
              performer,
              box: normalizedFb,
              imageMetrics: metrics,
              toastOnSuccess: toastOnPersist,
              toastOnError: toastOnPersist,
            });
          }
          return savedBox || normalizedFb;
        };

        const initialApplied = Array.isArray(fb) && fb.length === 4
          ? await renderBox(fb, { persistMode: 'diff' })
          : null;
        if (!initialApplied) {
          hideOverlay();
        }

        if (fbDetect) {
          if (fbDetect._faceBoxHandler) {
            fbDetect.removeEventListener('click', fbDetect._faceBoxHandler);
          }
          const handler = async () => {
            if (!imgUrl) {
              notify('Image not available for detection', 'error');
              return;
            }
            fbDetect.disabled = true;
            fbDetect.classList.add('btn-busy');
            try {
              const detected = await detectFaceBoxForImage(imgUrl, { force: true });
              if (Array.isArray(detected) && detected.length === 4) {
                const applied = await renderBox(detected, { persistMode: 'always', toastOnPersist: true });
                if (!applied) {
                  notify('Detected face box could not be applied', 'warn');
                }
              }
              else {
                notify('No face detected in this image', 'warn');
              }
            }
            catch (err) {
              const msg = err && err.message ? err.message : 'error';
              notify('Face detection failed: ' + msg, 'error');
            }
            finally {
              fbDetect.classList.remove('btn-busy');
              fbDetect.disabled = false;
            }
          };
          fbDetect.addEventListener('click', handler);
          fbDetect._faceBoxHandler = handler;
          fbDetect.disabled = false;
        }

        // Enable manual draw/drag editing after initial positioning
        enableFaceBoxEditing({ performer, imgEl: fbImg, overlayEl: fbOverlay });
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
        fi.click();
      };
    }
  }
  // Manual face box editing
  function enableFaceBoxEditing({ performer, imgEl, overlayEl }) {
    if (!overlayEl || !imgEl || !performer) return;
    if (typeof overlayEl._faceBoxCleanup === 'function') {
      overlayEl._faceBoxCleanup();
    }
    const editingKey = performer.slug || performer.name || '';
    overlayEl._editingSlug = editingKey;
    const cleanupFns = [];
    overlayEl._faceBoxCleanup = () => {
      cleanupFns.splice(0).forEach((fn) => {
        fn();
      });
    };
    const handle = overlayEl.querySelector('.handle');
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const getImageMetrics = () => {
      const rect = imgEl.getBoundingClientRect();
      const width = Math.max(1, imgEl.clientWidth || rect.width || imgEl.naturalWidth || 1);
      const height = Math.max(1, imgEl.clientHeight || rect.height || imgEl.naturalHeight || 1);
      return { width, height };
    };
    let dragState = null;
    let manualDrawState = null;
    let autoSaveTimer = null;

    function currentNormBox() {
      const r = overlayEl.getBoundingClientRect();
      const imgR = imgEl.getBoundingClientRect();
      const ox = r.left - imgR.left;
      const oy = r.top - imgR.top;
      const w = r.width;
      const h = r.height;
      const metrics = getImageMetrics();
      const iW = metrics.width;
      const iH = metrics.height;
      const nx = Math.max(0, Math.min(1, ox / iW));
      const ny = Math.max(0, Math.min(1, oy / iH));
      const nw = Math.max(1, w) / iW;
      const nh = Math.max(1, h) / iH;
      return coerceSquareBox([nx, ny, nw, nh], metrics) || [nx, ny, nw, nh];
    }

    async function saveBox(box, opts = {}) {
      if (!Array.isArray(box) || box.length !== 4) return null;
      const metrics = getImageMetrics();
      return persistFaceBox({ performer, box, toastOnSuccess: opts.toastOnSuccess, toastOnError: opts.toastOnError, imageMetrics: metrics });
    }

    function startDrag(e, mode) {
      e.preventDefault();
      const box = overlayEl.getBoundingClientRect();
      const imgBox = imgEl.getBoundingClientRect();
      const side = Math.max(box.width, box.height);
      overlayEl.style.width = side + 'px';
      overlayEl.style.height = side + 'px';
      dragState = {
        mode,
        offsetX: box.left - imgBox.left,
        offsetY: box.top - imgBox.top,
        side,
        mx: e.clientX,
        my: e.clientY,
        imgX: imgBox.left,
        imgY: imgBox.top,
        imgW: imgBox.width,
        imgH: imgBox.height,
        minSide: 20,
      };
      dragState.maxSide = Math.min(dragState.imgW - dragState.offsetX, dragState.imgH - dragState.offsetY);
      overlayEl.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', endDrag);
      devLog('debug', 'FaceBox', 'mousedown', { mode, box: currentNormBox() });
    }

    function onMove(e) {
      if (!dragState) return;
      const dx = e.clientX - dragState.mx;
      const dy = e.clientY - dragState.my;
      let changed = false;
      if (dragState.mode === 'move') {
        let nx = dragState.offsetX + dx;
        let ny = dragState.offsetY + dy;
        nx = Math.max(0, Math.min(dragState.imgW - dragState.side, nx));
        ny = Math.max(0, Math.min(dragState.imgH - dragState.side, ny));
        overlayEl.style.left = nx + 'px';
        overlayEl.style.top = ny + 'px';
        changed = true;
      }
      else if (dragState.mode === 'resize') {
        const pointerX = clamp(e.clientX - dragState.imgX, dragState.offsetX, dragState.imgW);
        const pointerY = clamp(e.clientY - dragState.imgY, dragState.offsetY, dragState.imgH);
        const deltaX = pointerX - dragState.offsetX;
        const deltaY = pointerY - dragState.offsetY;
        const maxSide = Math.max(20, Math.min(dragState.imgW - dragState.offsetX, dragState.imgH - dragState.offsetY));
        let newSide = Math.max(deltaX, deltaY);
        newSide = Math.max(dragState.minSide, Math.min(maxSide, newSide));
        overlayEl.style.width = newSide + 'px';
        overlayEl.style.height = newSide + 'px';
        dragState.side = newSide;
        changed = true;
      }
      if (changed) {
        const boxNow = currentNormBox();
        if (Array.isArray(boxNow) && boxNow.length === 4) {
          // No-op; live avatar preview removed for accuracy
          overlayEl.dataset.box = boxNow.join(',');
        }
        scheduleAutoSave();
      }
    }

    function endDrag() {
      if (!dragState) return;
      dragState = null;
      overlayEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', endDrag);
      devLog('debug', 'FaceBox', 'mouseup', { box: currentNormBox() });
    }

    const overlayMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target === handle) return;
      startDrag(e, 'move');
    };
    overlayEl.addEventListener('mousedown', overlayMouseDown);
    cleanupFns.push(() => overlayEl.removeEventListener('mousedown', overlayMouseDown));
    if (handle) {
      const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        startDrag(e, 'resize');
      };
      handle.addEventListener('mousedown', handleMouseDown);
      cleanupFns.push(() => handle.removeEventListener('mousedown', handleMouseDown));
    }

    function scheduleAutoSave() {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        const box = currentNormBox();
        if (box) {
          const saved = await saveBox(box);
          if (Array.isArray(saved) && saved.length === 4) {
            overlayEl.dataset.box = saved.join(',');
          }
        }
      }, 600);
    }

    cleanupFns.push(() => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
    });


    function wireManualDrawCreation() {
      const manualMouseDown = (e) => {
        if (e.button !== 0) return;
        if (manualDrawState) return;
        if (!overlayEl.hidden && !e.altKey) return;
        if (e.target && e.target.closest && e.target.closest('.facebox-overlay')) return;
        const rect = imgEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        e.preventDefault();
        const startX = clamp(e.clientX - rect.left, 0, rect.width);
        const startY = clamp(e.clientY - rect.top, 0, rect.height);
        manualDrawState = { rect, startX, startY };
        overlayEl.hidden = false;
        overlayEl.removeAttribute('hidden');
        overlayEl.style.left = startX + 'px';
        overlayEl.style.top = startY + 'px';
        overlayEl.style.width = '1px';
        overlayEl.style.height = '1px';
        overlayEl.classList.add('drawing');
        const onManualMove = (evt) => {
          if (!manualDrawState) return;
          const curX = clamp(evt.clientX - rect.left, 0, rect.width);
          const curY = clamp(evt.clientY - rect.top, 0, rect.height);
          let size = Math.max(1, Math.max(Math.abs(curX - manualDrawState.startX), Math.abs(curY - manualDrawState.startY)));
          let left = curX >= manualDrawState.startX ? manualDrawState.startX : manualDrawState.startX - size;
          let top = curY >= manualDrawState.startY ? manualDrawState.startY : manualDrawState.startY - size;
          if (left < 0) {
            size += left;
            left = 0;
          }
          if (top < 0) {
            size += top;
            top = 0;
          }
          if (left + size > rect.width) size = Math.max(1, rect.width - left);
          if (top + size > rect.height) size = Math.max(1, rect.height - top);
          overlayEl.style.left = left + 'px';
          overlayEl.style.top = top + 'px';
          overlayEl.style.width = size + 'px';
          overlayEl.style.height = size + 'px';
          const boxNow = currentNormBox();
          if (Array.isArray(boxNow) && boxNow.length === 4) {
            // No-op; live avatar preview removed for accuracy
          }
        };
        const finish = async () => {
          document.removeEventListener('mousemove', onManualMove);
          document.removeEventListener('mouseup', finish);
          overlayEl.classList.remove('drawing');
          manualDrawState = null;
          const box = currentNormBox();
          if (!Array.isArray(box) || box[2] <= 0.01 || box[3] <= 0.01) {
            overlayEl.hidden = true;
            overlayEl.style.width = '0px';
            overlayEl.style.height = '0px';
            return;
          }
          const saved = await saveBox(box);
          const refBox = saved || box;
          const joined = refBox.join(',');
          overlayEl.dataset.box = joined;
          overlayEl.dataset.faceBox = joined;
        };
        document.addEventListener('mousemove', onManualMove);
        document.addEventListener('mouseup', finish);
      };
      imgEl.addEventListener('mousedown', manualMouseDown);
      cleanupFns.push(() => imgEl.removeEventListener('mousedown', manualMouseDown));
    }

    wireManualDrawCreation();
  }
  function updatePerformerAvatars(performer) {
    if (!performer || !performer.image_face_box) return;
    const box = performer.image_face_box;
    // Target by slug first for reliability
    let targets = [];
    if (performer.slug) {
      targets = Array.from(document.querySelectorAll(`.perf-card[data-slug="${CSS.escape(String(performer.slug))}"]`));
    }
    if (!targets.length) {
      const all = document.querySelectorAll('.perf-card');
      for (const c of all) {
        const nameEl = c.querySelector('h3 a, h3');
        const nm = nameEl ? nameEl.textContent.trim() : '';
        if (nm && nm.toLowerCase() === String(performer.name || '').toLowerCase()) targets.push(c);
      }
    }
    for (const c of targets) {
      const avatarEl = c.querySelector('.pc-avatar');
      if (!avatarEl) continue;
      applyFaceBoxToAvatar(avatarEl, box);
    }
  }
  function initDom() {
    if (gridEl) return;
    if (debugEnabled()) {
      devLog('[Performers:initDom]');
    }
    gridEl = document.getElementById('performersGrid');
    searchEl = document.getElementById('performerSearch');
    imageFilterSel = document.getElementById('performerImageFilter');
    faceFilterSel = document.getElementById('performerFaceFilter');
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
    detectAllBtn = document.getElementById('performerDetectAllBtn');
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
    syncPageSizeSelectors();
    if (imageFilterSel) {
      const normalized = normalizeImageFilter(imageFilter);
      imageFilter = normalized;
      imageFilterSel.value = normalized;
    }
    if (faceFilterSel) {
      const normalizedFace = normalizeFaceFilter(faceFilter);
      faceFilter = normalizedFace;
      faceFilterSel.value = normalizedFace;
    }
    wireEvents();
    function summarizeAndToast(data, kind) {
      const d = data && data.data ? data.data : data;
      if (kind === 'names') {
        const msg = `Imported ${d.imported || 0} performer(s)`;
        (window.showToast || notify)(msg, 'success');
      }
      else {
        const msg = `Images: updated ${d.updated || 0}, created ${d.created || 0}, skipped ${d.skipped || 0}`;
        (window.showToast || notify)(msg, 'success');
      }
    }
    async function handleFiles(files) {
      if (!files || !files.length) return;
      // Heuristics: if any .zip → upload-zip;
      // else if any image or any file has webkitRelativePath → upload files;
      // else treat as names list
      const list = Array.from(files);
      const hasZip = list.some((f) => /\.zip$/i.test(f.name));
      const hasImage = list.some((f) => (f.type && f.type.startsWith('image/')) || /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
      const hasDirHints = list.some((f) => Boolean(f.webkitRelativePath));
      // Simple UI busy helpers
      const unifiedBtn = document.getElementById('performerUnifiedImportBtn');
      function startProcessing(msg = 'Working…') {
        setStatus(msg, true);
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
          setStatus('', false);
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
            } finally {
              Performers._background = false;
            }
          }, 800) : (() => {
            try {
              Performers._background = true;
              if (typeof fetchPerformers === 'function') fetchPerformers();
            } finally {
              Performers._background = false;
            }
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
              const evt = JSON.parse(line);
              if (evt.event === 'saved') {
                setStatus(`Saving images… ${evt.index}/${evt.file_count}`, true);
                debouncedRefresh();
              }
              else if (evt.event === 'done') {
                lastTotals = evt;
              }
            }
          }
          if (buf.trim()) {
            const evt = JSON.parse(buf.trim());
            if (evt && evt.event === 'done') lastTotals = evt;
          }
          try {
            Performers._background = true;
            if (typeof fetchPerformers === 'function') fetchPerformers();
          } finally {
            Performers._background = false;
          }
          return { data: lastTotals || {} };
        }
        finally {
          stop();
        }
      }
      try {
        devLog('log', '[Performers:handleFiles]', { count: list.length, hasZip, hasImage, hasDirHints, names: list.map((f) => f.name) });
        if (hasZip && list.length === 1) {
          const fd = new FormData();
          fd.append('zip', list[0], list[0].name);
          // Prefer streaming progress if supported
          const j = await streamZipImport(fd);
          summarizeAndToast(j, 'images');
          await fetchPerformers({ forceRefresh: true });
          await persistMissingFaceBoxesClientSide();
          return;
        }
        if (hasImage || hasDirHints) {
          const stop = startProcessing('Uploading images…');
          try {
            const fd = new FormData();
            for (const f of list) {
              const name = (f && (f.webkitRelativePath || f.name)) || f.name;
              // Use existing _slugifyName utility to avoid duplication
              let finalName = name;
              const parts = name.split('/');
              const leaf = parts.pop() || name;
              const dotIdx = leaf.lastIndexOf('.');
              let base = leaf;
              let ext = '';
              if (dotIdx > 0) {
                base = leaf.slice(0, dotIdx);
                ext = leaf.slice(dotIdx + 1);
              }
              const slugBase = _slugifyName(base);
              if (slugBase) {
                const slugFile = ext ? `${slugBase}.${ext.toLowerCase()}` : slugBase;
                finalName = (parts.length ? parts.join('/') + '/' : '') + slugFile;
                if (finalName !== name) {
                  const wrapped = new File([f], slugFile, { type: f.type });
                  fd.append('files', wrapped, finalName);
                  continue;
                }
              }
              fd.append('files', f, finalName);
            }
            const res = await fetch('/api/performers/images/upload?replace=false&create_missing=true', { method: 'POST', body: fd });
            const j = await res.json();
            if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
            summarizeAndToast(j, 'images');
            await fetchPerformers({ forceRefresh: true });
            await persistMissingFaceBoxesClientSide();
            return;
          }
          finally {
            stop();
          }
        }
        // Fallback: treat as names (read all as text)
        let combined = '';
        for (const f of list) {
          combined += (await f.text()) + '\n';
        }
        const txt = combined.trim();
        if (!txt) return;
        // Prefer text/plain; server accepts JSON array too
        const r = await fetch('/api/performers/import', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: txt });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
        summarizeAndToast(j, 'names');
        await fetchPerformers({ forceRefresh: true });
      }
      catch (err) {
        devLog('error', 'Unified import failed:', err);
        (window.showToast || notify)((err && err.message) || 'Import failed', 'error');
      }
    }
    // Expose unified handler so drag & drop code outside this closure can reuse it
    window.__perfUnifiedHandleFiles = handleFiles;
    if (unifiedBtn && !unifiedBtn._wired) {
      unifiedBtn._wired = true;
      unifiedBtn.addEventListener('click', (ev) => {
        const preferFolder = Boolean(ev && (ev.shiftKey || ev.altKey));
        if (preferFolder && unifiedFolderInput) unifiedFolderInput.click();
        else if (unifiedFileInput) unifiedFileInput.click();
      });
    }
    if (unifiedFileInput && !unifiedFileInput._wired) {
      unifiedFileInput._wired = true;
      unifiedFileInput.addEventListener('change', async () => {
        const files = Array.from(unifiedFileInput.files || []);
        await handleFiles(files);
        unifiedFileInput.value = '';
      });
    }
    if (unifiedFolderInput && !unifiedFolderInput._wired) {
      unifiedFolderInput._wired = true;
      unifiedFolderInput.addEventListener('change', async () => {
        const files = Array.from(unifiedFolderInput.files || []);
        await handleFiles(files);
        unifiedFolderInput.value = '';
      });
    }
    // Make drop zone click open unified chooser
    if (dropZone && !dropZone._clickUnified) {
      dropZone._clickUnified = true;
      const openChooser = (preferFolder = false) => {
        if (preferFolder && unifiedFolderInput) unifiedFolderInput.click();
        else if (unifiedFileInput) unifiedFileInput.click();
      };
      dropZone.addEventListener('click', () => openChooser(false));
      dropZone.addEventListener('dblclick', () => openChooser(true));
      dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openChooser(false);
        }
      });
    }
  }
  function setStatus(msg, showFlag = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    if (showFlag) showAs(statusEl, 'block');
    else hide(statusEl);
    if (spinnerEl) spinnerEl.hidden = !showFlag;
  }
  function withButtonBusy(btn, label = '') {
    if (!btn) return () => {};
    const prev = {
      text: btn.textContent,
      disabled: btn.disabled,
      hadBusy: btn.classList.contains('btn-busy'),
    };
    btn.disabled = true;
    btn.classList.add('btn-busy');
    if (label) btn.textContent = label;
    return () => {
      btn.disabled = prev.disabled;
      if (!prev.hadBusy) btn.classList.remove('btn-busy');
      btn.textContent = typeof prev.text === 'string' ? prev.text : '';
    };
  }
  function tpl(id) {
    const t = document.getElementById(id);
    return t ? t.content.cloneNode(true) : null;
  }
  function render() {
    if (!gridEl) return;
    const r0 = performance.now ? performance.now() : Date.now();
    // Count performers that have at least one image in unified images array (fallback legacy field)
    const withImg = performers.filter((p) => p && ((Array.isArray(p.images) && p.images.length) || p.image)).length;
    devLog('log', '[Performers:render:start]', { performers: performers.length, withImg, selected: selected.size });
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    // Trust server-side filtering/sorting/pagination: render given page as-is
    const filtered = performers;
    const pageItems = performers;
    if (addBtn) {
      showAs(addBtn, 'inline-block');
      addBtn.disabled = false;
      addBtn.textContent = 'Add';
    }
    if (countEl) {
      const total = Number.isFinite(srvTotal) ? srvTotal : performers.length;
      const shown = pageItems.length;
      // Show total performers (server authoritative);
      // include "showing" hint when paginated
      countEl.textContent = total ? `${total} performer${total === 1 ? '' : 's'}${srvTotalPages > 1 ? ` • showing ${shown}` : ''}` : '0 performers';
    }
    if (filtered.length === 0) {
      const node = tpl('emptyHintTemplate');
      if (node) {
        const el = node.querySelector('.empty-hint');
        if (el) {
          if (searchTerm) {
            el.textContent = `No performers match “${searchTerm}”.`;
            const btn = document.createElement('button');
            btn.className = 'btn-sm';
            btn.textContent = 'Clear search';
            btn.style.marginLeft = '10px';
            btn.addEventListener('click', () => {
              if (searchEl) searchEl.value = '';
              searchTerm = '';
              goToFirstPage();
              fetchPerformers();
            });
            el.appendChild(btn);
          }
          else if (lastDebug && (lastDebug.scan_in_progress || lastDebug.scan_scheduled || (lastDebug.fast_mode && lastDebug.cache_stale))) {
            el.textContent = 'Scanning media for performers… results will appear shortly.';
            setStatus('Scanning performers…', true);
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
            sel.setAttribute('role', 'checkbox');
            sel.setAttribute('tabindex', '0');
            sel.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
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
          card.addEventListener('click', (e) => {
            if (e.defaultPrevented) return;
            if (e.target.closest('.pc-name a')) return;
            if (e.target.closest('.pc-avatar')) return;
            if (e.target.closest('.card-checkbox')) return;
            handleCardClick(e, p, filtered);
          });
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
              libraryPerformerFilters = [p.name];
              setLocalStorageJSON('filters.performers', libraryPerformerFilters);
              const libTab = document.querySelector('[data-tab="library"]');
              if (libTab) libTab.click();
              if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
              if (typeof loadLibrary === 'function') loadLibrary();
              if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
            });
            nameEl.appendChild(a);
          }
          catch (_) {
            nameEl.textContent = p.name;
          }
        }
        if (avatarEl) {
          avatarEl.title = p.name;
          const primaryImage = (Array.isArray(p.images) && p.images.length ? p.images[0] : (typeof p.image === 'string' ? p.image : '')) || '';
          const imgUrl = primaryImage ? encodeURI(primaryImage) : '';
          setAvatarImageOnCard(avatarEl, p, imgUrl);
          const fb = Array.isArray(p.image_face_box) && p.image_face_box.length === 4 ? p.image_face_box.map(Number) : null;
          if (fb) {
            applyFaceBoxToAvatar(avatarEl, fb);
          }
          else {
            applyFaceBoxToAvatar(avatarEl, null);
            if (imgUrl && !avatarEl.dataset.faceDetectPending) {
              avatarEl.dataset.faceDetectPending = '1';
              (async () => {
                try {
                  const box = await detectFaceBoxForImage(imgUrl);
                  if (box && avatarEl && !avatarEl.dataset.faceBox) {
                    applyFaceBoxToAvatar(avatarEl, box);
                    const hasServerBox = Array.isArray(p.image_face_box) && p.image_face_box.length === 4;
                    if (!hasServerBox && !p._autoFacePersistPending) {
                      p._autoFacePersistPending = true;
                      try {
                        const metrics = getCachedImageMetrics(imgUrl) || null;
                        await persistFaceBox({ performer: p, box, toastOnSuccess: false, toastOnError: false, imageMetrics: metrics });
                      }
                      catch (err) {
                        devLog('warn', '[Performers] auto face persist failed', err);
                      }
                      finally {
                        p._autoFacePersistPending = false;
                      }
                    }
                  }
                }
                catch (err) {
                  devLog('warn', '[Performers] auto face detect failed', err);
                }
                finally {
                  delete avatarEl.dataset.faceDetectPending;
                }
              })();
            }
          }
          // Clicking the avatar triggers single-image upload for this performer
          avatarEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            // If shiftKey held: treat as upload action (legacy behavior)
            if (ev.shiftKey) {
              const fi = document.getElementById('performerSingleImageInput');
              if (fi) {
                fi.dataset.slug = p.slug;
                fi.dataset.name = p.name;
                fi.click();
              }
              return;
            }
            // Otherwise open face box preview modal
            const url = (avatarEl && avatarEl.dataset && avatarEl.dataset.imgUrl) ? avatarEl.dataset.imgUrl : (typeof p.image === 'string' ? encodeURI(p.image) : '');
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
          devLog('log', '[Performers:render:batch]', { upTo: idx + 1, ms: batchMs });
          loopStart = now;
        }
      });
      gridEl.appendChild(frag);
      const r1 = performance.now ? performance.now() : Date.now();
      devLog('log', '[Performers:render:append]', { items: pageItems.length, ms: Math.round(r1 - r0) });
    }
    // pager UI: use server metadata exclusively
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
    updateSelectionUI();
    const r2 = performance.now ? performance.now() : Date.now();
    devLog('log', '[Performers:render:done]', { totalMs: Math.round(r2 - r0) });
    const perfPanel = document.getElementById('performers-panel');
    const initiallyVisible = perfPanel && !perfPanel.hasAttribute('hidden');
    if (initiallyVisible && !window.__perfAutoFetched) {
      window.__perfAutoFetched = true;
      window.addEventListener('DOMContentLoaded', () => {
        if (window.fetchPerformers) window.fetchPerformers();
      }, { once: true });
    }
  }
  function updateActionButtons() {
    const multi = selected.size >= 2;
    if (mergeBtn) mergeBtn.disabled = !multi;
    if (renameBtn) renameBtn.disabled = selected.size !== 1;
    if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    if (autoMatchBtn) {
      if (!autoMatchBtn._idleLabel) {
        const lbl = (autoMatchBtn.textContent || '').trim();
        autoMatchBtn._idleLabel = lbl || 'Match';
      }
      autoMatchBtn.disabled = autoMatchRunning || selected.size === 0;
      if (!autoMatchRunning && autoMatchBtn._idleLabel) {
        autoMatchBtn.textContent = autoMatchBtn._idleLabel;
      }
      else if (autoMatchRunning) {
        autoMatchBtn.textContent = 'Matching…';
      }
    }
  }
  function updateSelectionUI() {
    document.querySelectorAll('.perf-card').forEach((c) => {
      const key = c.dataset.slug;
      if (selected.has(key)) c.dataset.selected = '1';
      else c.removeAttribute('data-selected');
      const cb = c.querySelector && c.querySelector('.card-checkbox');
      if (cb) {
        if (selected.has(key)) cb.classList.add('checked');
        else cb.classList.remove('checked');
        cb.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
      }
    });
    updateActionButtons();
  }
  function ensureControlsVisible() {
    const toolbar = document.querySelector('#performers-panel .perf-toolbar');
    const unifiedBtn = document.getElementById('performerUnifiedImportBtn');
    const elts = [toolbar, unifiedBtn, addBtn, mergeBtn, deleteBtn, autoMatchBtn, dropZone, statusEl];
    elts.forEach((el) => {
      if (!el) return;
      el.hidden = false;
      el.classList.remove('d-none');
    });
  }
  // Client-side fallback: persist face boxes for performers that have images but no box yet.
  async function persistMissingFaceBoxesClientSide() {
    if (typeof Performers === 'undefined' || !Array.isArray(Performers.list)) return;
    const toUpdate = [];
    for (const p of Performers.list) {
      if (!p || !p.image || Array.isArray(p.image_face_box)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = typeof p.image === 'string' ? p.image : '';

      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      let box = await detectFaceBoxForImage(canvas.toDataURL());
      if (!box) {

        box = await detectFaceBoxWithTF(canvas, W, H);
      }
      if (Array.isArray(box) && box.length === 4) {
        toUpdate.push({ slug: p.slug || p.name, x: box[0], y: box[1], w: box[2], h: box[3] });
      }
    }
    if (toUpdate.length) {
      await fetch('/api/performers/face-boxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxes: toUpdate }) });
      for (const u of toUpdate) {
        const p = Performers.list.find((pp) => (pp.slug || pp.name) === u.slug);
        if (p) {
          p.image_face_box = [u.x, u.y, u.w, u.h];
          updatePerformerAvatars(p);
        }
      }
    }
  }
  async function detectFacesForVisiblePerformers() {
    if (detectAllRunning) {
      const toast = window.showToast || notify;
      toast('Face detection already running…', 'info');
      return;
    }
    const toast = window.showToast || notify;
    const list = Array.isArray(performers) ? performers.slice() : [];
    const targets = list.map((perf) => {
      const raw = getPerformerPrimaryImage(perf);
      if (!raw) return null;
      let imgUrl = raw;
      imgUrl = encodeURI(raw);
      return { performer: perf, imgUrl };
    }).filter(Boolean);
    if (!targets.length) {
      toast('No visible performers have images to detect.', 'info');
      return;
    }
    detectAllRunning = true;
    const restoreBtn = withButtonBusy(detectAllBtn, 'Detecting…');
    let detected = 0;
    let missing = 0;
    let failed = 0;
    try {
      setStatus(`Detecting faces… 0/${targets.length}`, true);
      for (let i = 0;
        i < targets.length;
        i += 1) {
        const { performer, imgUrl } = targets[i];
        try {
          const box = await detectFaceBoxForImage(imgUrl, { force: true });
          if (!Array.isArray(box) || box.length !== 4) {
            missing += 1;
          }
          else {
            const metrics = getCachedImageMetrics(imgUrl) || (await measureImageDimensions(imgUrl));
            const saved = await persistFaceBox({ performer, box, imageMetrics: metrics || undefined });
            if (Array.isArray(saved) && saved.length === 4) {
              performer.image_face_box = saved.slice();
              updatePerformerAvatars(performer);
              detected += 1;
            }
            else {
              failed += 1;
            }
          }
        }
        catch (err) {
          failed += 1;
          devLog('warn', '[Performers] detect-all failed', { slug: performer && performer.slug, err });
        }
        setStatus(`Detecting faces… ${i + 1}/${targets.length}`, true);
      }
      const parts = [`${detected}/${targets.length} updated`];
      if (missing) parts.push(`${missing} no-face`);
      if (failed) parts.push(`${failed} failed`);
      toast(`Performer detection complete (${parts.join(', ')})`, detected ? 'success' : 'warn');
    }
    finally {
      detectAllRunning = false;
      if (typeof restoreBtn === 'function') restoreBtn();
      setStatus('', false);
    }
  }
  async function fetchPerformers(opts = {}) {
    initDom();
    ensureControlsVisible();
    let forceRefresh = false;
    try {
      if (opts && typeof opts === 'object') {
        const maybeEvent = /** @type {any} */ (opts);
        if (typeof maybeEvent?.preventDefault === 'function' && typeof maybeEvent?.isTrusted === 'boolean') {
          maybeEvent.preventDefault();
          if (typeof maybeEvent.stopPropagation === 'function') maybeEvent.stopPropagation();
          opts = {};
        }
      }
      if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        forceRefresh = Boolean(opts.forceRefresh);
      }
    }
    catch (_) {
      forceRefresh = false;
    }
    try {
      const t0 = performance.now ? performance.now() : Date.now();
      if (Performers._inFlight && Performers._abort) {
        Performers._abort.abort();
      }
      const controller = new AbortController();
      Performers._abort = controller;
      const signal = controller.signal;
      Performers._inFlight = true;
      // fetchPerformers called
      if (!Performers._background) {
        setStatus('Loading…', true);
        if (gridEl) gridEl.classList.add('loading');
      }
      const url = new URL('/api/performers', window.location.origin);
      if (forceRefresh) {
        url.searchParams.set('refresh', '1');
      }
      if (forceRefresh) {
        url.searchParams.set('refresh', '1');
      }
      if (searchTerm) url.searchParams.set('search', searchTerm);
      // Server-side pagination & sorting
      url.searchParams.set('page', String(page || 1));
      url.searchParams.set('page_size', String(pageSize || 32));
      if (imageFilter && imageFilter !== 'all') {
        url.searchParams.set('image', imageFilter);
      }
      if (faceFilter && faceFilter !== 'all') {
        url.searchParams.set('face', faceFilter);
      }
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
      const serverImageFilter = normalizeImageFilter(d.image_filter || imageFilter);
      if (serverImageFilter !== imageFilter) {
        imageFilter = serverImageFilter;
        if (imageFilterSel) imageFilterSel.value = imageFilter;
        persistImageFilter(imageFilter);
      }
      const serverFaceFilter = normalizeFaceFilter(d.face_filter || faceFilter);
      if (serverFaceFilter !== faceFilter) {
        faceFilter = serverFaceFilter;
        if (faceFilterSel) faceFilterSel.value = faceFilter;
        persistFaceFilter(faceFilter);
      }
      const trigger = lastDebug && lastDebug.scan_trigger;
      const allZero = performers.length > 0 && performers.every((p) => !Number(p.count || 0));
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

      const t1 = performance.now ? performance.now() : Date.now();
      // Dump server timings if provided
      if (debugEnabled()) {
        if (lastDebug) {
          devLog('[Performers:serverTimings]', lastDebug);
        }
        devLog('[Performers:fetchPerformers]', {
          url: url.toString(),
          total: d.total,
          page: d.page,
          received: performers.length,
          status: r.status,
          contentLength: hdrLen,
          netMs: Math.round(rEnd - rStart),
          parseMs: Math.round(jEnd - jStart),
          totalMs: Math.round(t1 - t0),
        });
      }
      // devLog(performers);
      // Update pagination from server metadata if present
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
      updatePage(curPage);
      if (!Performers._background && gridEl) gridEl.classList.remove('loading');
      // Decide status & polling logic based on scan/debug info
      try {
        const scanActive = Boolean(lastDebug && (lastDebug.scan_in_progress || lastDebug.scan_scheduled));
        const partial = Boolean(lastDebug && lastDebug.counts_partial);
        const allZero = performers.length > 0 && performers.every((p) => !Number(p.count || 0));
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
      catch (_) {
        setStatus('', false);
      }
      const r0 = performance.now ? performance.now() : Date.now();
      render();
      const r2 = performance.now ? performance.now() : Date.now();
      devLog('log', '[Performers:renderTotal]', { items: performers.length, ms: Math.round(r2 - r0) });
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
      devLog('error', e);
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
        for (let i = start;
          i <= end;
          i++) {
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
  function selectedPerformerNames() {
    const unique = new Set();
    const names = [];
    selected.forEach((slug) => {
      const rec = performers.find((p) => p.slug === slug);
      const name = rec && rec.name ? rec.name.trim() : '';
      if (name && !unique.has(name.toLowerCase())) {
        unique.add(name.toLowerCase());
        names.push(name);
      }
    });
    return names;
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
  function setAutoMatchBusy(flag) {
    autoMatchRunning = Boolean(flag);
    updateActionButtons();
  }
  window.__setPerformersAutoMatchBusy = setAutoMatchBusy;
  function calcColumns() {
    if (!gridEl) return 1;
    const style = getComputedStyle(gridEl);
    const template = style.gridTemplateColumns;
    if (!template) return 1;
    return template.split(' ').length;
  }
  async function addCurrent() {
    const raw = prompt('New performer name:', searchTerm || '');
    const name = raw ? raw.trim() : '';
    if (!name) return;
    try {
      await fetch('/api/performers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await fetchPerformers();
      if (window.showToast) window.showToast('Performer added', 'is-success');
    }
    catch (_) {
      if (window.showToast) window.showToast('Failed to add performer', 'is-error');
    }
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
      fi.click();
      return;
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
    await fetch('/api/performers/tags/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({name: p.name, tag: tag}),
    });
    await fetchPerformers();
  }
  async function removeTag(p, tag) {
    if (!confirm(`Remove tag '${tag}' from ${p.name}?`)) return;
    await fetch('/api/performers/tags/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({name: p.name, tag: tag}),
    });
    await fetchPerformers();
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
      await fetch('/api/performers?name=' + encodeURIComponent(rec.name), {
        method: 'DELETE',
      });
    }
    selected.clear();
    await fetchPerformers();
  }
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
          fetchPerformers();
        }
      });
    }
    if (imageFilterSel && !imageFilterSel._wired) {
      imageFilterSel._wired = true;
      imageFilterSel.addEventListener('change', async () => {
        const next = normalizeImageFilter(imageFilterSel.value, 'all');
        if (next === imageFilter) return;
        imageFilter = persistImageFilter(next);
        goToFirstPage();
        await fetchPerformers();
      });
    }
    if (faceFilterSel && !faceFilterSel._wired) {
      faceFilterSel._wired = true;
      faceFilterSel.addEventListener('change', async () => {
        const next = normalizeFaceFilter(faceFilterSel.value, 'all');
        if (next === faceFilter) return;
        faceFilter = persistFaceFilter(next);
        goToFirstPage();
        await fetchPerformers();
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
    if (autoMatchBtn && !autoMatchBtn._wired) {
      autoMatchBtn._wired = true;
      autoMatchBtn.addEventListener('click', () => {
        const names = selectedPerformerNames();
        if (!names.length) {
          if (window.showToast) window.showToast('Select at least one performer to match', 'is-info');
          else if (typeof notify === 'function') notify('Select at least one performer to match', 'info');
          return;
        }
        if (typeof window.__openPerfAutoMatchWithList === 'function') {
          window.__openPerfAutoMatchWithList(names);
          return;
        }
        if (typeof window.__openPerfAutoMatch === 'function') {
          window.__openPerfAutoMatch();
        }
      });
    }
    if (detectAllBtn && !detectAllBtn._wired) {
      detectAllBtn._wired = true;
      detectAllBtn.addEventListener('click', () => {
        detectFacesForVisiblePerformers();
      });
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
    if (sortSel) {
      sortSel.value = sortBy;
      if (!sortSel._wired) {
        sortSel._wired = true;
        sortSel.addEventListener('change', async () => {
          sortBy = sortSel.value === 'name' ? 'name' : 'count';
          // Default dir: name asc, count desc (see mapping in fetchPerformers)
          sortDir = (sortBy === 'name') ? -1 : 1;
          localStorage.setItem('performers:sortBy', sortBy);
          localStorage.setItem('performers:sortDir', String(sortDir));
          applySortButtonLabel();
          goToFirstPage();
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
        localStorage.setItem('performers:sortDir', String(sortDir));
        applySortButtonLabel();
        goToFirstPage();
        await fetchPerformers();
      });
    }
    const handlePrev = async () => {
      if (page > 1) {
        updatePage(page - 1);
        scrollPerformersPager('bottom');
        await fetchPerformers();
      }
    };
    const handleNext = async () => {
      updatePage(page + 1);
      scrollPerformersPager('top');
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
        updatePageSize(v);
        syncPageSizeSelectors();
        goToFirstPage();
        await fetchPerformers();
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
      const close = () => {
        hide(mergePanel);
        mergePanel.removeAttribute('data-open');
      };
      if (!mergePanel._escWire) {
        mergePanel._escWire = true;
        mergePanel.addEventListener('modal:requestClose', (ev) => {
          ev.preventDefault();
          close();
        });
      }
      if (mergeCloseBtn) mergeCloseBtn.addEventListener('click', close);
      if (mergeCancelBtn) mergeCancelBtn.addEventListener('click', close);
      mergePanel.addEventListener('click', (e) => {
        if (e.target === mergePanel) close();
      });
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
      mergeIntoInput && mergeIntoInput.focus();
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
      const close = () => {
        hide(renamePanel);
        renamePanel.removeAttribute('data-open');
      };
      if (!renamePanel._escWire) {
        renamePanel._escWire = true;
        renamePanel.addEventListener('modal:requestClose', (ev) => {
          ev.preventDefault();
          close();
        });
      }
      if (renameCloseBtn) renameCloseBtn.addEventListener('click', close);
      if (renameCancelBtn) renameCancelBtn.addEventListener('click', close);
      renamePanel.addEventListener('click', (e) => {
        if (e.target === renamePanel) close();
      });
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
          if (!newName || !oldName || newName === oldName) {
            hide(renamePanel);
            renamePanel.removeAttribute('data-open');
            return;
          }
          try {
            const r = await fetch('/api/performers/rename', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ old: oldName, new: newName }),
            });
            if (!r.ok) throw new Error('Rename failed');
            if (window.showToast) window.showToast('Renamed', 'is-success');
            selected.clear();
            hide(renamePanel);
            renamePanel.removeAttribute('data-open');
            await fetchPerformers();
          }
          catch (err) {
            if (window.showToast) window.showToast(err.message || 'Rename failed', 'is-error');
          }
        });
      }
    }
    setTimeout(() => {
      renameInput && renameInput.focus();
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
        combined += (await f.text()) + '\n';
      }
      if (!combined.trim()) return;
      // Parse performer names
      let rawNames = [];
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
        rawNames = trimmed.split(/\r?\n|,|;|\t/).map((s) => s.trim()).filter(Boolean);
      }
      rawNames = Array.from(new Set(rawNames));
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
      if (!modal._escWire) {
        modal._escWire = true;
        modal.addEventListener('modal:requestClose', (ev) => {
          ev.preventDefault();
          closeModal();
        });
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
              await fetchPerformers();
              setStatus('Imported performers', true);
              if (window.__openPerfAutoMatchWithList) {
                window.__openPerfAutoMatchWithList(rawNames);
              }
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
                await fetchPerformers();
                setStatus('Imported performers', true);
                if (window.__openPerfAutoMatchWithList) {
                  window.__openPerfAutoMatchWithList(rawNames);
                }
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
        })();
      }
    });
    if (singleImg && !singleImg._wired) {
      singleImg._wired = true;
      singleImg.addEventListener('change', async () => {
        const files = [...(singleImg.files || [])];
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
          const j = await res.json().catch(() => null);
          if (!res.ok) throw new Error(j && j.message || 'Upload failed');
          (window.showToast || notify)('Image uploaded', 'success');
          // If response returns performer.image as full URL, update in-memory performer before full reload
          if (j && j.data && j.data.performer && j.data.performer.image) {
            const imgUrl = j.data.performer.image;
            const slug = j.data.performer.slug;
            // Patch current in-memory list so user sees immediate update without waiting for network
            const rec = performers.find((p) => p.slug === slug);
            if (rec) rec.image = imgUrl;
            render();
          }
          await fetchPerformers();
        }
        catch (err) {
          (window.showToast || notify)(err.message || 'Upload failed', 'error');
        }
        finally {
          singleImg.value = '';
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
          out = await new Promise((r) => it.getAsString(r));
          if (out) return out;
        }
      }
      if (dt.files && dt.files.length) {
        for (const f of dt.files) {
          if (
            f.type.startsWith('text/') || /\.(txt|csv|json)$/i.test(f.name)
          ) {
            out = await f.text();
            if (out) return out;
          }
        }
        if (!out) out = await dt.files[0].text();
      }
      return out;
    }
    function wantsIntercept(dt) {
      if (isDropInterceptSuspended()) return false;
      if (isDropInterceptSuspended()) return false;
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
            devLog('log', '[Performers:DnD] handling files', dt.files.length);
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
          devLog('warn', 'performers drop failed', err);
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
  const active = ev && ev.detail && ev.detail.activeTab;
  if (active === 'performers' && window.Performers) {
    // Defer slightly to allow panel DOM to settle
    setTimeout(() => window.Performers && window.Performers.show(), 30);
  }
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
        fi.click();
      }
    });
    dz.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const fi = document.getElementById('performerUnifiedFileInput') || document.getElementById('performerFileInput');
        if (fi && typeof fi.click === 'function') {
          fi.click();
        }
      }
    });
  }
  // Defer wiring until DOM is ready so elements exist
  function wirePerformerAutoMatch() {
    function qs(id) {
      return document.getElementById(id);
    }
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
    let scopedPerformers = [];
    // Local toast helper: prefer legacy window.showToast if present; otherwise use notify()
    function toast(message, type) {
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
    function normalizePerformers(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set();
      return list
        .map((name) => String(name || '').trim())
        .filter((name) => {
          if (!name) return false;
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    function describeScope() {
      if (!scopedPerformers.length) return 'all performers';
      if (scopedPerformers.length === 1) return scopedPerformers[0];
      return `${scopedPerformers.length} performers`;
    }
    function markBusy(flag) {
      if (typeof window.__setPerformersAutoMatchBusy === 'function') {
        window.__setPerformersAutoMatchBusy(flag);
      }
    }
    function open(list = []) {
      scopedPerformers = normalizePerformers(list);
      show(modal);
      modal.setAttribute('data-open', '1');
    }
    function close() {
      hide(modal);
      modal.removeAttribute('data-open');
      markBusy(false);
    }
    function setApplying(dis) {
      if (applyBtnFooter) applyBtnFooter.disabled = dis;
    }
    function enableApply(enabled) {
      setApplying(!enabled);
    }
    async function doPreview() {
      enableApply(false);
      markBusy(true);
      if (statusEl) statusEl.textContent = `Previewing ${describeScope()}…`;
      if (tbody) tbody.innerHTML = '';
      lastRows = [];
      try {
        const payload = {
          path: undefined,
          recursive: true,
          use_registry_performers: scopedPerformers.length === 0,
          performers: scopedPerformers,
          tags: [],
          limit: 800,
        };
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
      finally {
        markBusy(false);
      }
    }
    async function doApply() {
      if (!lastRows.length) return;
      setApplying(true);
      if (statusEl) statusEl.textContent = 'Queuing job…';
      markBusy(true);
      try {
        const payload = {
          path: undefined,
          recursive: true,
          use_registry_performers: scopedPerformers.length === 0,
          performers: scopedPerformers,
          tags: [],
        };
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
      finally {
        markBusy(false);
      }
    }
    // Expose programmatic openers
    window.__openPerfAutoMatch = function () {
      if (!modal || !modal.hidden) return; // already open
      open([]);
      doPreview();
    };
    window.__openPerfAutoMatchWithList = function (list) {
      if (!modal || !modal.hidden) return;
      open(Array.isArray(list) ? list : []);
      doPreview();
    };
    if (!modal._escWire) {
      modal._escWire = true;
      modal.addEventListener('modal:requestClose', (ev) => {
        ev.preventDefault();
        close();
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
  const TAGS_PAGE_LS_KEY = 'mediaPlayer:tags.page.v1';
  const TAGS_PAGE_SIZE_LS_KEY = 'mediaPlayer:tags.pageSize.v1';
  function sanitizePositiveInt(value, fallback) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return fallback;
    return n;
  }
  function loadPagerValue(key, fallback) {
    try {
      const raw = (typeof getLocalStorageItem === 'function') ? getLocalStorageItem(key, { type: 'number', fallback }) : fallback;
      return sanitizePositiveInt(raw, fallback);
    }
    catch (_) {
      return fallback;
    }
  }
  function persistPagerValue(key, value, fallback) {
    const normalized = sanitizePositiveInt(value, fallback);
    if (typeof setLocalStorageItem === 'function') setLocalStorageItem(key, normalized, { type: 'number' });
    else localStorage.setItem(key, String(normalized));
  }
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
  let addTagBtn = null;
  // Auto-match button state
  let autoMatchBtn = null;
  let autoMatchRunning = false;
  // Merge Modal UI
  let mergePanel = null;
  let mergeCloseBtn = null;
  let mergeCancelBtn = null;
  let mergeConfirmBtn = null;
  let mergeChoiceList = null;
  let mergeSelectedWrap = null;
  let mergeChoiceValue = '';
  let mergeChoiceIdCounter = 0;
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
  let page = loadPagerValue(TAGS_PAGE_LS_KEY, 1);
  let pageSize = loadPagerValue(TAGS_PAGE_SIZE_LS_KEY, 32);
  let srvTotal = 0;
  let srvTotalPages = 1;
  let srvPage = 1;
  // Force a server refresh on first load (and after mutations) so cache reflects latest tags
  let needRefresh = true;
  // Track keyboard/selection anchors (mirrors Performers behavior)
  let lastFocusedIndex = -1;
  let shiftAnchor = null;

  function setPagerVisibility(show) {
    const toggle = (el) => {
      if (!el) return;
      if (show) {
        el.hidden = false;
        el.removeAttribute('aria-hidden');
        if (el.classList) el.classList.remove('d-none');
        if (el.style) el.style.removeProperty('display');
      }
      else {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        if (el.classList) el.classList.add('d-none');
        if (el.style) el.style.display = 'none';
      }
    };
    toggle(pager);
    toggle(pagerB);
  }

  function shouldShowPager(total) {
    const sizeCandidates = [pageSize, pageSizeSel && Number(pageSizeSel.value), pageSizeSelB && Number(pageSizeSelB.value)];
    const effectiveSize = sizeCandidates.find((n) => Number.isFinite(n) && n > 0) || 0;
    if (!effectiveSize) return total > 0 && srvTotalPages > 1;
    return total > effectiveSize;
  }

  function ensureMergeModalElements() {
    const doc = document;
    if (!mergePanel) mergePanel = doc.getElementById('tagMergeModal');
    if (!mergeCloseBtn) mergeCloseBtn = doc.getElementById('tagMergeClose');
    if (!mergeCancelBtn) mergeCancelBtn = doc.getElementById('tagMergeCancel');
    if (!mergeConfirmBtn) mergeConfirmBtn = doc.getElementById('tagMergeConfirm');
    if (!mergeChoiceList) mergeChoiceList = doc.getElementById('tagMergeChoiceList');
    if (!mergeSelectedWrap) mergeSelectedWrap = doc.getElementById('tagMergeSelected');
    if (mergePanel && !mergePanel._escWire) {
      mergePanel._escWire = true;
      mergePanel.addEventListener('modal:requestClose', (ev) => {
        ev.preventDefault();
        closeMergeModal();
      });
    }
  }

  function ensureRenameModalElements() {
    const doc = document;
    if (!renamePanel) renamePanel = doc.getElementById('tagRenameModal');
    if (!renameCloseBtn) renameCloseBtn = doc.getElementById('tagRenameClose');
    if (!renameCancelBtn) renameCancelBtn = doc.getElementById('tagRenameCancel');
    if (!renameConfirmBtn) renameConfirmBtn = doc.getElementById('tagRenameConfirm');
    if (!renameInput) renameInput = doc.getElementById('tagRenameInput');
    if (!renameSelectedWrap) renameSelectedWrap = doc.getElementById('tagRenameSelected');
    if (renamePanel && !renamePanel._escWire) {
      renamePanel._escWire = true;
      renamePanel.addEventListener('modal:requestClose', (ev) => {
        ev.preventDefault();
        closeRenameModal();
      });
    }
  }

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
    syncPageSizeSelectors();
    importBtn = document.getElementById('tagImportBtn');
    mergeBtn = document.getElementById('tagMergeBtn');
    renameBtn = document.getElementById('tagRenameBtn');
    deleteBtn = document.getElementById('tagDeleteBtn');
    importFile = document.getElementById('tagImportFile');
    dropZone = document.getElementById('tagDropZone');
    addTagBtn = document.getElementById('tagAddBtn');
    autoMatchBtn = document.getElementById('tagAutoMatchBtn');
    if (autoMatchBtn && !autoMatchBtn._idleLabel) {
      const txt = (autoMatchBtn.textContent || '').trim();
      autoMatchBtn._idleLabel = txt || 'Auto Match';
    }
    // Merge Modal elements
    ensureMergeModalElements();
    ensureRenameModalElements();
    devLog('log', '[Tags:initDom]', {
      gridEl: Boolean(gridEl),
      mergeBtn: Boolean(mergeBtn),
      mergePanel: Boolean(mergePanel),
      mergeCloseBtn: Boolean(mergeCloseBtn),
      mergeCancelBtn: Boolean(mergeCancelBtn),
      mergeConfirmBtn: Boolean(mergeConfirmBtn),
      mergeChoiceList: Boolean(mergeChoiceList),
      mergeSelectedWrap: Boolean(mergeSelectedWrap),
      renameBtn: Boolean(renameBtn),
      renamePanel: Boolean(renamePanel),
      renameConfirmBtn: Boolean(renameConfirmBtn),
    });
    wireEvents();
  }

  function updateMergeConfirmState() {
    if (mergeConfirmBtn) mergeConfirmBtn.disabled = !mergeChoiceValue;
  }

  function highlightMergeChoice(label) {
    if (!mergeChoiceList) return;
    mergeChoiceList.querySelectorAll('.merge-choice').forEach((node) => {
      node.removeAttribute('data-checked');
    });
    if (label) label.dataset.checked = '1';
  }

  function resetMergeChoiceState() {
    mergeChoiceValue = '';
    if (mergeChoiceList) mergeChoiceList.innerHTML = '';
    updateMergeConfirmState();
  }

  function renderMergeChoices(names) {
    if (!mergeChoiceList) {
      mergeChoiceValue = names[0] || '';
      updateMergeConfirmState();
      return;
    }
    mergeChoiceList.innerHTML = '';
    mergeChoiceValue = '';
    names.forEach((name, idx) => {
      const label = document.createElement('label');
      label.className = 'merge-choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'tagMergeChoice';
      input.value = name;
      input.id = `tagMergeChoice-${++mergeChoiceIdCounter}`;
      const span = document.createElement('span');
      span.textContent = `#${name}`;
      label.appendChild(input);
      label.appendChild(span);
      mergeChoiceList.appendChild(label);
      input.addEventListener('change', () => {
        if (input.checked) {
          mergeChoiceValue = name;
          highlightMergeChoice(label);
          updateMergeConfirmState();
        }
      });
      if (idx === 0) {
        input.checked = true;
        mergeChoiceValue = name;
        highlightMergeChoice(label);
      }
    });
    updateMergeConfirmState();
  }

  function openMergeModal(selectedNames = []) {
    ensureMergeModalElements();
    if (!mergePanel) {
      devLog('warn', '[Tags:openMergeModal] merge modal unavailable');
      toastTags('Merge dialog is still loading. Try again in a moment.', 'is-info');
      return;
    }
    const names = (selectedNames || [])
      .map((name) => (name || '').trim())
      .filter(Boolean);
    devLog('log', names);
    if (!names.length) return;
    devLog('log', '[Tags:openMergeModal] start', { names, hasPanel: Boolean(mergePanel) });
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
      names.forEach((name, idx) => {
        mergeSelectedWrap.appendChild(makeChip(name));
        if (idx < names.length - 1) {
          mergeSelectedWrap.appendChild(document.createTextNode(' + '));
        }
      });
    }
    renderMergeChoices(names);
    show(mergePanel);
    mergePanel.setAttribute('data-open', '1');
    try {
      const rect = mergePanel.getBoundingClientRect();
      const cs = window.getComputedStyle ? getComputedStyle(mergePanel) : null;
      const hidden = mergePanel.hidden;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const disp = cs ? cs.display : 'n/a';
      const vis = cs ? cs.visibility : 'n/a';
      const zi = cs ? cs.zIndex : 'n/a';
      const cd = mergeConfirmBtn ? mergeConfirmBtn.disabled : 'n/a';
      devLog('log', `[Tags:openMergeModal] shown hidden=${hidden} rect=${w}x${h} display=${disp} visibility=${vis} zIndex=${zi} confirmDisabled=${cd}`);
    }
    catch (_) {
      devLog('log', '[Tags:openMergeModal] shown');
    }
    setTimeout(() => {
      const target = mergeChoiceList && mergeChoiceList.querySelector('input[type="radio"]:checked');
      if (target) target.focus();
    }, 0);
  }
  function closeMergeModal() {
    if (!mergePanel) return;
    hide(mergePanel);
    mergePanel.removeAttribute('data-open');
    resetMergeChoiceState();
    devLog('log', '[Tags:closeMergeModal]');
  }
  function openRenameModal(currentName) {
    ensureRenameModalElements();
    if (!renamePanel) {
      devLog('warn', '[Tags:openRenameModal] rename modal unavailable');
      toastTags('Rename dialog is still loading. Try again in a moment.', 'is-info');
      return;
    }
    devLog('log', '[Tags:openRenameModal] start');
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
      renameInput && renameInput.focus();
    }, 0);
  }
  function closeRenameModal() {
    if (!renamePanel) return;
    hide(renamePanel);
    renamePanel.removeAttribute('data-open');
    devLog('log', '[Tags:closeRenameModal]');
  }
  function ensureControlsVisible() {
    const toolbar = document.querySelector('#tags-panel .perf-toolbar');
    const elts = [toolbar, importBtn, addTagBtn, autoMatchBtn, mergeBtn, deleteBtn, dropZone, statusEl, tagsSpinnerEl, pager, pagerB, gridEl, searchEl, countEl, pageSizeSel, pageSizeSelB, prevBtn, nextBtn, prevBtnB, nextBtnB];
    elts.forEach((el) => {
      if (!el) return;
      el.hidden = false;
      if (el.classList) el.classList.remove('d-none');
    });
  }
  function setStatus(msg, showFlag = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    if (showFlag) showAs(statusEl, 'block');
    else hide(statusEl);
    if (tagsSpinnerEl) tagsSpinnerEl.hidden = !showFlag;
  }
  function toastTags(message, type = 'is-info') {
    const normalized = (type && typeof type === 'string' && type.startsWith('is-')) ? type.slice(3) : (type || 'info');
    if (window.showToast) {
      window.showToast(message, type || 'is-info');
    }
    else if (typeof notify === 'function') {
      notify(message, normalized);
    }
  }
  function buildAutoMatchPairs(selectedNames, candidates) {
    const tagLookup = new Map();
    selectedNames.forEach((name) => {
      if (!name) return;
      tagLookup.set(String(name).toLowerCase(), name);
    });
    const dedupe = new Set();
    const pairs = [];
    candidates.forEach((row) => {
      const file = String(row && row.file || '').trim();
      if (!file) return;
      const hits = Array.isArray(row && row.tags) ? row.tags : [];
      hits.forEach((rawTag) => {
        if (!rawTag) return;
        const normalized = String(rawTag).toLowerCase();
        const tagName = tagLookup.get(normalized);
        if (!tagName) return;
        const key = `${file}|||${tagName}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        pairs.push({ file, tag: tagName });
      });
    });
    return pairs;
  }
  function partitionPairsByExistingTags(pairs, infoByPath) {
    const pending = [];
    let skipped = 0;
    const localSets = new Map();
    const getInfo = (path) => {
      if (!path) return null;
      if (localSets.has(path)) return localSets.get(path);
      let info = null;
      if (infoByPath) {
        if (typeof infoByPath.get === 'function') info = infoByPath.get(path);
        else if (infoByPath[path]) info = infoByPath[path];
      }
      const tags = Array.isArray(info?.tags) ? info.tags : [];
      const set = new Set(tags.map((t) => String(t).toLowerCase()));
      localSets.set(path, set);
      return set;
    };
    pairs.forEach((pair) => {
      const file = pair && pair.file;
      const tagName = pair && pair.tag;
      if (!file || !tagName) return;
      const set = getInfo(file) || new Set();
      if (!localSets.has(file)) localSets.set(file, set);
      const key = String(tagName).toLowerCase();
      if (set.has(key)) {
        skipped++;
        return;
      }
      set.add(key);
      pending.push(pair);
    });
    return { pending, skipped };
  }
  async function summarizeAutoMatchTargets(files) {
    const unique = Array.from(new Set((files || []).filter(Boolean)));
    if (!unique.length) return { total: 0, untagged: 0, infoByPath: new Map() };
    const rows = await fetchMediaInfoBulk(unique, { includeSidecar: false });
    const infoByPath = new Map();
    rows.forEach((row) => {
      if (row && row.path) infoByPath.set(row.path, row);
    });
    let untagged = 0;
    unique.forEach((path) => {
      const info = infoByPath.get(path);
      const tags = Array.isArray(info?.tags) ? info.tags : [];
      if (!tags.length) untagged++;
    });
    return { total: unique.length, untagged, infoByPath };
  }
  async function applyAutoMatchPairs(pairs) {
    const pending = Array.isArray(pairs) ? pairs.filter((p) => p && p.file && p.tag) : [];
    if (!pending.length) return 0;
    let applied = 0;
    const chunkSize = 200;
    for (let i = 0; i < pending.length; i += chunkSize) {
      const batch = pending.slice(i, i + chunkSize);
      const updates = batch
        .map((item) => ({ path: item.file, tag: item.tag }))
        .filter((u) => u.path && u.tag);
        if (!updates.length) continue;
      const resp = await fetch('/api/media/tags/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!resp.ok) continue;
      const json = await resp.json().catch(() => null);
      const delta = Number(json?.data?.updated ?? json?.updated ?? 0) || 0;
      if (delta) applied += delta;
      if (window.__mediaInfoCache) {
        updates.forEach(({ path, tag }) => {
          const entry = window.__mediaInfoCache[path];
          if (!entry) return;
          entry.tags = Array.isArray(entry.tags) ? entry.tags : [];
          const exists = entry.tags.some((t) => String(t).toLowerCase() === String(tag).toLowerCase());
          if (!exists) entry.tags.push(tag);
        });
      }
    }
    return applied;
  }
  async function runAutoMatch() {
    if (autoMatchRunning) return;
    const selectedNames = Array.from(selected);
    if (!selectedNames.length) {
      toastTags('Select at least one tag to auto match', 'is-info');
      return;
    }
    autoMatchRunning = true;
    updateButtons();
    setStatus('Scanning filenames for selected tags…', true);
    try {
      const payload = { path: null, recursive: true, tags: selectedNames, use_registry_tags: false, limit: 800 };
      const resp = await fetch('/api/autotag/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error((json && json.message) || 'Preview failed');
      }
      const candidates = (json && json.data && Array.isArray(json.data.candidates)) ? json.data.candidates : [];
      const pairs = buildAutoMatchPairs(selectedNames, candidates);
      if (!pairs.length) {
        toastTags('No matches found for those tags', 'is-info');
        return;
      }
      setStatus('Collecting tag stats…', true);
      const targetStats = await summarizeAutoMatchTargets(pairs.map((p) => p.file));
      const infoByPath = targetStats.infoByPath || new Map();
      const { pending, skipped } = partitionPairsByExistingTags(pairs, infoByPath);
      if (!pending.length) {
        toastTags('Those files already have the selected tag(s)', 'is-info');
        return;
      }
      const statsLabel = `${targetStats.untagged} untagged, ${targetStats.total} total`;
      const pendingFileCount = new Set(pending.map((p) => p.file)).size;
      const skippedLabel = skipped ? `, ${skipped} already tagged` : '';
      const summaryDetails = `${statsLabel}${skippedLabel}`;
      setStatus(`Applying matches to ${pendingFileCount} video${pendingFileCount === 1 ? '' : 's'} (${summaryDetails})…`, true);
      const applied = await applyAutoMatchPairs(pending);
      if (applied > 0) {
        needRefresh = true;
        await fetchTags();
        toastTags(`Auto-matched ${applied} tag update${applied === 1 ? '' : 's'} (${summaryDetails})`, 'is-success');
      }
      else {
        toastTags(`No files were updated (${summaryDetails})`, 'is-info');
      }
    }
    catch (err) {
      const msg = (err && err.message) ? err.message : 'Auto-match failed';
      toastTags(msg, 'is-error');
    }
    finally {
      autoMatchRunning = false;
      setStatus('', false);
      updateButtons();
    }
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
    if (mergeBtn) mergeBtn.disabled = selected.size < 2;
    if (renameBtn) renameBtn.disabled = selected.size !== 1;
    if (deleteBtn) deleteBtn.disabled = selected.size === 0;
    if (autoMatchBtn) {
      if (!autoMatchBtn._idleLabel) {
        const lbl = (autoMatchBtn.textContent || '').trim();
        autoMatchBtn._idleLabel = lbl || 'Auto Match';
      }
      autoMatchBtn.disabled = autoMatchRunning || selected.size === 0;
      if (!autoMatchRunning && autoMatchBtn._idleLabel) {
        autoMatchBtn.textContent = autoMatchBtn._idleLabel;
      }
      else if (autoMatchRunning) {
        autoMatchBtn.textContent = 'Auto Matching…';
      }
    }
    const md = mergeBtn ? mergeBtn.disabled : '?';
    const rd = renameBtn ? renameBtn.disabled : '?';
    const dd = deleteBtn ? deleteBtn.disabled : '?';
    devLog('log', `[Tags:updateButtons] size=${selected.size} mergeDisabled=${md} renameDisabled=${rd} deleteDisabled=${dd}`);
  }
  function updateSelectionUI() {
    if (!gridEl) return;
    devLog('log', `[Tags:updateSelectionUI] start size=${selected.size}`);
    gridEl.querySelectorAll('.perf-card').forEach((c) => {
      const key = c.dataset.slug;
      if (selected.has(key)) c.dataset.selected = '1';
      else c.removeAttribute('data-selected');
      const cb = c.querySelector && c.querySelector('.card-checkbox');
      if (cb) {
        if (selected.has(key)) cb.classList.add('checked');
        else cb.classList.remove('checked');
        cb.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
      }
    });
    updateButtons();
    devLog('log', `[Tags:updateSelectionUI] end size=${selected.size}`);
  }
  function normKey(obj) {
    // Prefer the exact tag name to distinguish case variants (e.g., 'vintage' vs 'Vintage')
    // Fallback to slug only if name is missing
    return (obj && obj.name) ? String(obj.name) : (obj.slug || _slugify(obj.name || ''));
  }
  function toggleSelect(slug, opts = { range: false, anchor: false }) {
    devLog('log', `[Tags:toggleSelect] before slug="${slug}" size=${selected.size} range=${Boolean(opts.range)} anchor=${Boolean(opts.anchor)} shiftAnchor=${shiftAnchor ?? ''}`);
    if (opts.range && shiftAnchor) {
      const arr = tags;
      const idxA = arr.findIndex((t) => normKey(t) === shiftAnchor);
      const idxB = arr.findIndex((t) => normKey(t) === slug);
      if (idxA > -1 && idxB > -1) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        for (let i = start;
          i <= end;
          i++) selected.add(normKey(arr[i]));
        updateSelectionUI();
        devLog('log', `[Tags:toggleSelect] range-add start=${Math.min(idxA, idxB)} end=${Math.max(idxA, idxB)} size=${selected.size}`);
        return;
      }
    }
    if (selected.has(slug)) selected.delete(slug);
    else selected.add(slug);
    if (opts.anchor) shiftAnchor = slug;
    updateSelectionUI();
    devLog('log', `[Tags:toggleSelect] after slug="${slug}" size=${selected.size} shiftAnchor=${shiftAnchor ?? ''}`);
  }
  function openLibraryForTag(tagObj) {
    const slug = normKey(tagObj);
    // Use human-readable tag name for filters/URL (parity with performers)
    // Fallback to slug only if name is missing
    const name = (tagObj && tagObj.name) ? String(tagObj.name) : slug;
    if (!name) return;
    libraryTagFilters = [name];
    if (typeof persistLibraryFilters === 'function') persistLibraryFilters();
    else {
      setLocalStorageJSON('filters.tags', libraryTagFilters);
    }
    const showInSearch = () => {
      if (!unifiedInput) return;
      unifiedInput.value = `#${name}`;
    };
    showInSearch();
    requestAnimationFrame(showInSearch);
    setTimeout(showInSearch, 150);
    if (typeof renderUnifiedFilterChips === 'function') renderUnifiedFilterChips();
    if (typeof updateClearFiltersBtnState === 'function') updateClearFiltersBtnState();
    if (typeof updateLibraryUrlFromState === 'function') updateLibraryUrlFromState();
    const libTab = document.querySelector('[data-tab="library"]');
    if (libTab) {
      const alreadySelected = libTab.getAttribute('aria-selected') === 'true';
      if (!alreadySelected) libTab.click();
    }
    currentPage = 1;
    if (typeof loadLibrary === 'function') loadLibrary();
  }
  function handleCardClick(e, tagObj) {
    const slug = normKey(tagObj);
    // If the name link was clicked, let that handler navigate
    const a = e.target && e.target.closest && e.target.closest('a');
    if (a) return; // separate handler will navigate
    // Click behavior: default to selection unless modifier dictates range/anchor
    if (e.shiftKey) {
      e.preventDefault();
      return toggleSelect(slug, { range: true });
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      return toggleSelect(slug, { anchor: true });
    }
    e.preventDefault();
    toggleSelect(slug, { anchor: true });
  }
  function handleCardKey(e, tagObj) {
    const slug = normKey(tagObj);
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      toggleSelect(slug, { anchor: true });
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
        const openBtn = node.querySelector('.tag-open-library-btn');
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
            a.addEventListener('click', (ev) => {
              ev.preventDefault();
              openLibraryForTag(t);
            });
            nameEl.appendChild(a);
          }
          catch (_) {
            nameEl.textContent = t.name;
          }
        }
        if (countEl) {
          const c = Number(t.count || 0);
          countEl.textContent = String(c);
          countEl.title = `${c} file${c === 1 ? '' : 's'}`;
        }
        if (openBtn) {
          const readableName = t?.name || normKey(t);
          openBtn.setAttribute('aria-label', `Filter Library by ${readableName}`);
          openBtn.title = `Filter Library by ${readableName}`;
          openBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openLibraryForTag(t);
          });
        }
        if (card) {
          const key = (t && t.name) ? String(t.name) : (t.slug || _slugify(t.name || ''));

          card.dataset.slug = key;
          if (selected.has(key)) card.dataset.selected = '1';
          else card.removeAttribute('data-selected');
          card.tabIndex = 0;
          if (sel) {
            sel.setAttribute('role', 'checkbox');
            sel.setAttribute('tabindex', '0');
            sel.setAttribute('aria-checked', selected.has(key) ? 'true' : 'false');
            if (selected.has(key)) sel.classList.add('checked');
            else sel.classList.remove('checked');
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
      subtitles_enabled: true,
      faces_enabled: true,
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
    // Wire browser faces button (idempotent)
    setTimeout(() => this.wireBrowserFacesButton(), 0);
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
      this.capabilities.subtitles_enabled = Boolean(
        caps.subtitles_enabled ?? true,
      );
      this.capabilities.faces_enabled = Boolean(caps.faces_enabled ?? true);
      window.__capabilities = { ...this.capabilities};
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
  wireOptionPersistence() {
    const LS_KEY = 'mediaPlayer:artifactOptions';
    let cache = {};
    cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
    const persist = () => {
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
    };
    const sel = '#spritesOptions input, #previewOptions input, #thumbnailOptions input, #phashOptions select, #phashOptions input, #markersOptions input, #heatmapsOptions input, #heatmapsOptions select, #subtitlesOptions select, #subtitlesOptions input, #facesOptions input, #facesOptions select, #embedOptions input, #embedOptions select';
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
      if (facesOnly) localStorage.setItem('mediaPlayer:dismissFacesNotice', '1');
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
      for (let i = 0;
        i < 10;
        i++) {
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
          await fetch(createUrl, {method: 'POST' });
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
          const endpointMap = {
            thumbnails: '/api/thumbnail',
            previews: '/api/preview',
            sprites: '/api/sprites/delete',
            phash: '/api/phash',
            heatmaps: '/api/heatmaps/delete',
            metadata: '/api/metadata/delete',
            subtitles: '/api/subtitles/delete/batch',
            scenes: '/api/markers/clear',
            markers: '/api/markers/clear',
            faces: '/api/faces/delete',
            embed: '/api/faces/delete',
          };
          const mapped = endpointMap[base] || `/api/artifacts/${base}`;
          const clearUrl = new URL(mapped, window.location.origin);
          const selPaths = fileSelection === 'selected' ? Array.from(selectedItems || []) : null;
          const requestInit = {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          };
          if (fileSelection === 'selected') {
            if (!selPaths || selPaths.length === 0) {
              this.showNotification('Select at least one file to clear.', 'error');
              return;
            }
            requestInit.body = JSON.stringify({ paths: selPaths });
          }
          const resp = await fetch(clearUrl.toString(), requestInit);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          this.showNotification(`${base} cleared`, 'success');
          await this.loadCoverage({ force: true });
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
          payload.selectedPaths = Array.from(selectedItems);
        }
        const response = await fetch('/api/tasks/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        let result;
        if (!response.ok) {
          let detail = '';
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await response.json();
            detail = j.message || j.error || JSON.stringify(j);
          }
          else {
            detail = (await response.text()).slice(0, 4000);
          }
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
          if (window.tabSystem && window.tabSystem.switchToTab) {
            window.tabSystem.switchToTab('tasks');
          }
          this.refreshJobs();
          this.loadCoverage({force: true});
        }
        else {
          throw new Error(result.message || 'Operation failed');
        }
      }
    }
    catch (error) {
      devLog('error', 'Batch operation failed:', {operation, error});
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
  async loadCoverage(opts = {}) {
    const force = Boolean(opts.force);
    const now = Date.now();
    if (!force) {
      if (this._coverageInflight) {
        return this._coverageInflight;
      }
      if (this._coverageCooldownUntil && now < this._coverageCooldownUntil && this._coverageLoaded) {
        return this.coverage;
      }
    }
    const run = (async () => {
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
          if (typeof this.renderJobsTable === 'function') {
            this.renderJobsTable();
          }
          if (currentPath) refreshSidebarThumbnail(currentPath);
        }
      } finally {
        this._coverageInflight = null;
        this._coverageCooldownUntil = Date.now() + 1500;
        // Load orphan data in the background (throttled to avoid repeated heavy scans)
        this.loadOrphanData().catch(() => {});
      }
    })();
    this._coverageInflight = run;
    return run;
  }
  updateCoverageDisplay() {
    // If coverage not loaded yet, keep buttons hidden
    if (!this._coverageLoaded) return;
    // Determine if we should scope coverage to the current selection
    const selectedRadio = document.querySelector('input[name="fileSelection"]:checked');
    const useSelected = selectedRadio && selectedRadio.value === 'selected' && selectedItems && selectedItems.size > 0;
    // Helper to compute selected-only coverage using cached per-file artifact status
    const computeSelectedCoverage = () => {
      const cov = {
        metadata: {processed: 0, total: 0, missing: 0},
        thumbnails: {processed: 0, total: 0, missing: 0},
        sprites: {processed: 0, total: 0, missing: 0},
        previews: {processed: 0, total: 0, missing: 0},
        phash: {processed: 0, total: 0, missing: 0},
        markers: {processed: 0, total: 0, missing: 0},
        heatmaps: {processed: 0, total: 0, missing: 0},
        subtitles: {processed: 0, total: 0, missing: 0},
        faces: {processed: 0, total: 0, missing: 0},
      };
      const statusCache = (window.__artifactStatus || {});
      const total = selectedItems.size;
      const presentFor = (st, key) => {
        if (!st) return false;
        switch (key) {
        case 'metadata': return Boolean(st.metadata);
        case 'thumbnails': return Boolean(st.thumbnail || st.thumbnails);
        case 'sprites': return Boolean(st.sprites);
        case 'previews': return Boolean(st.preview != null ? st.preview : st.hover);
        case 'phash': return Boolean(st.phash);
        case 'markers': return Boolean(st.markers);
        case 'heatmaps': return Boolean(st.heatmaps);
        case 'subtitles': return Boolean(st.subtitles);
        case 'faces': return Boolean(st.faces);
        default: return false;
        }
      };
      const keys = Object.keys(cov);
      // Initialize totals
      keys.forEach((k) => {
        cov[k].total = total;
      });
      // Tally processed from cache (unknown -> treated as missing)
      for (const p of selectedItems) {
        const st = statusCache[p];
        keys.forEach((k) => {
          if (presentFor(st, k)) cov[k].processed++;
        });
      }
      // Compute missing as remainder (non-negative)
      keys.forEach((k) => {
        cov[k].missing = Math.max(0, (cov[k].total || 0) - (cov[k].processed || 0));
      });
      return cov;
    };
    const selectedCoverage = useSelected ? computeSelectedCoverage() : null;
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
      const dataSource = useSelected && selectedCoverage ? selectedCoverage : this.coverage;
      const data = (dataSource && dataSource[artifact]) || {
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
      // Hide generate buttons; keep clear visible independently
      [genMissingBtn, recomputeAllBtn].forEach((b) => {
        if (!b) return;
        b.classList.add('hidden');
        b.classList.remove('btn-danger');
        b.removeAttribute('data-state');
      });
      if (clearBtn) {
        const processedTmp = data.processed || 0;
        if (processedTmp > 0) {
          clearBtn.classList.remove('hidden', 'd-none', 'disabled');
          clearBtn.textContent = 'Clear All';
          clearBtn.title = 'Delete all generated artifacts';
          clearBtn.dataset.operation = `${artifact}-clear`;
          clearBtn.classList.add('btn-danger');
        }
        else {
          // Hide when nothing generated yet
          clearBtn.classList.add('hidden', 'd-none');
        }
      }
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
        // All generated; no change needed for Clear All (already visible). Keep active null to avoid duplicate text changes.
        active = null;
      }
      if (active) {
        active.classList.remove('hidden', 'd-none');
        // Metadata uses same adaptive control: Generate All -> Generate Missing -> Clear All
      }
    });
    // Mirror faces coverage to embeddings UI (embeddings share faces.json presence)
    const facesData = (useSelected && selectedCoverage ? selectedCoverage.faces : (this.coverage.faces || {processed: 0, total: 0})) || {processed: 0, total: 0};
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
    [embedGen, embedRe].forEach((b) => {
      if (!b) return;
      b.classList.add('hidden');
      b.classList.remove('btn-danger');
      b && b.removeAttribute('data-state');
    });
    if (embedClear) {
      if (embedProcessed > 0) {
        embedClear.classList.remove('hidden', 'd-none', 'disabled');
        embedClear.textContent = 'Clear All';
        embedClear.title = 'Delete all generated embeddings';
        embedClear.dataset.operation = 'embed-clear';
        embedClear.classList.add('btn-danger');
      }
      else {
        embedClear.classList.add('hidden', 'd-none');
      }
    }
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
      embedActive = null; // Clear All already visible
    }
    if (embedActive) {
      embedActive.classList.remove('hidden', 'd-none');
    }
  }
  async refreshJobs() {
    const response = await fetch('/api/tasks/jobs');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.status === 'success') {
      const jobs = data.data.jobs || [];
      this.updateJobsDisplay(jobs);
      this.updateJobStats(data.data.stats);
      this._updatePollingModeFromJobs(jobs);
      return jobs;
    }
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
    // Remove rows for jobs not present anymore
    for (const [id, tr] of Array.from(this._jobRows.entries())) {
      if (!ids.has(id)) {
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
    window.__activeArtifactSpinners = window.__activeArtifactSpinners || new Map();
    // Build quick lookup of active job states by (path, artifact)
    const activeStates = new Set();
    // Resolve currently open file path once for comparisons
    const activePath = (window.Player && typeof window.Player.getPath === 'function') ? window.Player.getPath() : (typeof currentPath === 'function' ? currentPath() : (window.currentPath || currentPath));
    // Helper: normalize backend artifact names to sidebar badge keys
    const normArt = (k) => normalizeArtifactKey(k) || '';
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
        else if (/metadata/.test(task)) artifact = 'metadata';
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
      if (path === activePath) {
        // Only refresh statuses for currently open file to reduce noise
        loadArtifactStatuses?.();
      }
    }
  }
  renderJobsTable() {
    const tbody = document.getElementById('jobTableBody');
    if (!tbody) return;
    // Render all jobs directly; no synthetic aggregation row.
    const forRender = Array.from(this.jobs.values());
    // Filtering policy: if no toggles selected, show ALL rows.
    // When toggles selected, restrict to those statuses.
    let visible = [];
    if (this.activeFilters && this.activeFilters.size > 0) {
      visible = forRender.filter((j) => this.activeFilters.has(this.normalizeStatus(j)));
    }
    else {
      visible = forRender;
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
            if (typeof window.fmtTime === 'function') {
              text = window.fmtTime(sec);
            }
            else {
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              text = `${m}:${String(s).padStart(2, '0')}`;
            }
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
            endCell.title = 'End time';
          }
        }
        else {
          endCell.textContent = '—';
          endCell.title = 'End time';
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
        const startTs = (job.startTime || job.createdTime || 0) * 1000;
        if (startTs && endTs && endTs >= startTs) {
          const sec = Math.max(0, Math.floor((endTs - startTs) / 1000));
          let text = '';
          try {
            if (typeof window.fmtTime === 'function') text = window.fmtTime(sec);
            else {
              const m = Math.floor(sec / 60);
              const s = sec % 60;
              text = `${m}:${String(s).padStart(2, '0')}`;
            }
          }
          catch (_) {
            text = sec + 's';
          }
          endCell.textContent = text;
          endCell.title = 'Total duration';
        }
        else {
          endCell.textContent = endTs ? new Date(endTs).toLocaleTimeString() : '—';
          endCell.title = endTs ? 'End time' : '';
        }
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
    // Queued shows 0% normally
    if (status === 'queued') pct = 0;
    if (status === 'completed') pct = 100;
    const bar = row.querySelector('.job-progress-fill');
    // Canceled explicitly shows 0% and "Canceled"
    if (status === 'canceled') {
      bar.style.width = '0%';
    }
    else {
      bar.style.width = ((status !== 'queued') ? pct : 0) + '%';
    }
    const pctEl = row.querySelector('.pct');
    if (isPaused && status === 'queued') {
      pctEl.textContent = 'Paused';
    }
    else {
      pctEl.textContent = status === 'queued' ? 'Queued' : status === 'completed' ? '100%' : status === 'canceled' ? 'Canceled' : `${pct}%`;
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
    const tasksTab = document.getElementById('tasks-tab');
    if (tasksTab) {
      // Always show active count in parentheses per requirement
      tasksTab.textContent = `Tasks (${activeCount})`;
    }
  }
  // Lightweight off-tab active count updater (SSE events maintain jobs map)
  updateTasksTabCountLight() {
    const tasksTab = document.getElementById('tasks-tab');
    if (!tasksTab) return;
    let active = 0;
    for (const job of this.jobs.values()) {
      const st = (job.state || '').toLowerCase();
      if (st === 'running') active++;
    }
    tasksTab.textContent = `Tasks (${active})`;
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
      devLog('error', 'Failed to cancel job:', error);
      this.showNotification('Failed to cancel job', 'error');
    }
  }
  updateSelectedFileCount() {
    const selectedRadio = document.querySelector('input[name="fileSelection"]:checked');
    const countEl = document.getElementById('selectedFileCount');
    if (selectedRadio && countEl) {
      // Always show the current selection count, even when not selected
      const n = (selectedItems && selectedItems.size) ? selectedItems.size : 0;
      countEl.textContent = String(n);
      // If "Selected files" mode is active, re-render coverage tiles to reflect scoped counts
      if (selectedRadio.value === 'selected') {
        this.updateCoverageDisplay();
      }
    }
  }
  startJobPolling() {
    // Poll only while Tasks tab is active; stop entirely when hidden
    const INTERVAL = 1500;
    if (this._jobPollTimer) clearInterval(this._jobPollTimer);
    this._jobPollInFlight = this._jobPollInFlight || {jobs: false, coverage: false};
    const doPoll = async () => {
      if (this._activePollSuspended) return;
      // Skip overlap
      if (this._jobPollInFlight.jobs || this._jobPollInFlight.coverage) return;
      try {
        this._jobPollInFlight.jobs = true;
        await this.refreshJobs();
      } finally {
        this._jobPollInFlight.jobs = false;
      }
      if (this._activePollSuspended) return;
      try {
        this._jobPollInFlight.coverage = true;
        await this.loadCoverage();
      } finally {
        this._jobPollInFlight.coverage = false;
      }
    };
    const tick = () => {
      doPoll();
    };
    this._startPollingNow = () => {
      if (this._activePollSuspended) return;
      if (this._jobPollTimer) return;
      this._jobPollTimer = setInterval(tick, INTERVAL);
      // Kick an immediate fetch on start
      tick();
    };
    this._stopPollingNow = () => {
      if (this._jobPollTimer) {
        clearInterval(this._jobPollTimer);
        this._jobPollTimer = null;
      }
    };
    // Do not start automatically here; tabchange handler in init() will control lifecycle
  }
  _isJobActive(job) {
    if (!job) return false;
    const state = (job.state || job.status || '').toLowerCase();
    if (ACTIVE_JOB_STATES.has(state)) return true;
    return false;
  }
  _jobsHaveActiveState(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) return false;
    return jobs.some((job) => this._isJobActive(job));
  }
  _updatePollingModeFromJobs(jobs) {
    if (this._jobsHaveActiveState(jobs)) {
      this._exitIdlePollingMode();
    }
    else {
      this._enterIdlePollingMode();
    }
  }
  _enterIdlePollingMode() {
    if (this._activePollSuspended) {
      this._scheduleIdlePing();
      return;
    }
    this._activePollSuspended = true;
    if (typeof this._stopPollingNow === 'function') {
      this._stopPollingNow();
    }
    this._scheduleIdlePing();
  }
  _exitIdlePollingMode() {
    if (!this._activePollSuspended) return;
    this._activePollSuspended = false;
    this._cancelIdlePing();
    this._idlePollBackoffMs = 15000;
    const tabActive = window.tabSystem && typeof window.tabSystem.getActiveTab === 'function' && window.tabSystem.getActiveTab() === 'tasks';
    if (tabActive && typeof this._startPollingNow === 'function') {
      this._startPollingNow();
    }
  }
  _scheduleIdlePing(delay) {
    if (!this._activePollSuspended) return;
    if (window.__JOBS_SSE_ENABLED && !window.__JOBS_SSE_UNAVAILABLE) return;
    if (this._idlePollTimer) return;
    const base = typeof delay === 'number' ? delay : (this._idlePollBackoffMs || 15000);
    const wait = Math.max(5000, Math.min(base, 60000));
    this._idlePollBackoffMs = wait;
    this._idlePollTimer = setTimeout(async () => {
      this._idlePollTimer = null;
      if (!this._activePollSuspended) {
        this._idlePollBackoffMs = 15000;
        return;
      }
      await this.refreshJobs();
      await this.loadCoverage();
      if (this._activePollSuspended) {
        const next = Math.min(Math.round(wait * 1.5), 60000);
        this._idlePollBackoffMs = next;
        this._scheduleIdlePing(next);
      }
      else {
        this._idlePollBackoffMs = 15000;
      }
    }, wait);
  }
  _cancelIdlePing() {
    if (this._idlePollTimer) {
      clearTimeout(this._idlePollTimer);
      this._idlePollTimer = null;
    }
    this._idlePollBackoffMs = 15000;
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
  async loadOrphanData(options = {}) {
    const {force = false, silent = true} = options;
    const now = Date.now();
    const TTL = 60 * 1000;
    if (!force) {
      if (this._orphanFetchPromise) return this._orphanFetchPromise;
      if (this._lastOrphanFetch && now - this._lastOrphanFetch < TTL && this._lastOrphanData) {
        this.updateOrphanDisplay(this._lastOrphanData);
        return this._lastOrphanData;
      }
    }
    const runner = (async () => {
      try {
        const response = await fetch('/api/artifacts/orphans');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const payload = data && data.status === 'success' ? (data.data || {orphaned: 0, orphaned_files: [] }) : {orphaned: 0, orphaned_files: [] };
        this._lastOrphanFetch = Date.now();
        this._lastOrphanData = payload;
        this.updateOrphanDisplay(payload);
        return payload;
      }
      catch (error) {
        if (!silent) {
          devLog('error', 'Failed to load orphan data:', error);
          this.showNotification?.('Failed to load orphan summary', 'error');
        }
        throw error;
      }
    })();
    const guarded = runner.catch((err) => {
      if (silent) {
        // Quiet failure during passive polling; keep previous display if available
        if (!this._lastOrphanData) this.updateOrphanDisplay({orphaned: 0, orphaned_files: [] });
      }
      return Promise.reject(err);
    });
    this._orphanFetchPromise = guarded;
    guarded.finally(() => {
      if (this._orphanFetchPromise === guarded) {
        this._orphanFetchPromise = null;
      }
    });
    return guarded;
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
      const previewVisible = Boolean(document.getElementById('orphanDetails')) && !document.getElementById('orphanDetails').classList.contains('d-none');
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
      const repairsVisible = Boolean(document.getElementById('orphanRenames')) && !document.getElementById('orphanRenames').classList.contains('d-none');
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
      if (btn) {
        btn.disabled = true;
        btn.classList.add('btn-busy');
      }
      try {
        await this.loadOrphanData({silent: false});
      }
      catch (_) {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('btn-busy');
        }
        return;
      }
      finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('btn-busy');
        }
      }
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
    const orphanCount = Array.isArray(this.orphanFiles) ? this.orphanFiles.length : 0;
    if (!confirm(`Are you sure you want to delete ${orphanCount} orphaned artifact files? This action cannot be undone.`)) {
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
        setTimeout(() => this.loadOrphanData({force: true, silent: false}).catch(() => {}), 2000);
      }
      else {
        throw new Error(data.message || 'Cleanup failed');
      }
    }
    catch (error) {
      devLog('error', 'Failed to start cleanup:', error);
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
      this._repairStreamController && this._repairStreamController.abort();
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
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Computing… (0)';
      }
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
          const row = document.createElement('div');
          row.className = 'orphan-file';
          const from = String(it.from || '');
          const to = String(it.to || '');
          const conf = typeof it.confidence === 'number' ? Math.round(it.confidence * 100) : null;
          const confText = conf != null ? ` (${conf}%)` : '';
          row.textContent = `${from} → ${to}${confText}`;
          row.title = 'strategy: ' + (it.strategy || '');
          renamesList.appendChild(row);
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
            try {
              msg = JSON.parse(s);
            }
            catch (_) {
              continue;
            }
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
              devLog('error', 'repair-preview stream error:', msg.message);
            }
          }
        }
        // Flush any remaining buffered line
        if (buf.trim()) {
          const msg = JSON.parse(buf.trim());
          if (msg && msg.type === 'item') {
            this._lastRepairPreview.push(msg);
            appendItem(msg);
            count += 1;
          }
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
        devLog('error', 'Failed to preview repairs:', err);
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
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Applying…';
      }
      // Use cleanup endpoint in repair mode: perform moves, keep unmatched orphans
      // Hint the server to reuse the most recent preview to avoid recomputation
      const url = '/api/artifacts/cleanup?dry_run=false&keep_orphans=true&reassociate=true&local_only=true&use_preview=true';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j && j.status === 'success') {
        (this.showNotification || notify)('Repairs started', 'success');
        // Optionally collapse preview, refresh orphan data shortly after
        setTimeout(() => this.loadOrphanData && this.loadOrphanData({force: true, silent: false}).catch(() => {}), 2000);
      }
      else {
        throw new Error(j && j.message ? j.message : 'Failed to start repairs');
      }
    }
    catch (err) {
      devLog('error', 'Failed to apply repairs:', err);
      (this.showNotification || notify)('Failed to apply repairs', 'error');
    }
    finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Apply Repairs';
      }
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
// Lazy initialize Tasks tab only when activated
let tasksManager;
function __initTasksTabOnce() {
  if (tasksManager) return;
  tasksManager = new TasksManager();
  window.tasksManager = tasksManager;
  const previewBtn = document.getElementById('previewOrphansBtn');
  const cleanupBtn = document.getElementById('cleanupOrphansBtn');
  const previewRepairsBtn = document.getElementById('previewRepairsBtn');
  const applyRepairsBtn = document.getElementById('applyRepairsBtn');
  if (previewBtn && !previewBtn._wiredLazy) {
    previewBtn._wiredLazy = true;
    previewBtn.addEventListener('click', () => tasksManager && tasksManager.previewOrphans());
  }
  if (cleanupBtn && !cleanupBtn._wiredLazy) {
    cleanupBtn._wiredLazy = true;
    cleanupBtn.addEventListener('click', () => tasksManager && tasksManager.cleanupOrphans());
  }
  if (previewRepairsBtn && !previewRepairsBtn._wiredLazy) {
    previewRepairsBtn._wiredLazy = true;
    previewRepairsBtn.addEventListener('click', () => tasksManager && tasksManager.previewRepairs());
  }
  if (applyRepairsBtn && !applyRepairsBtn._wiredLazy) {
    applyRepairsBtn._wiredLazy = true;
    applyRepairsBtn.addEventListener('click', () => tasksManager && tasksManager.applyRepairs());
  }
}

// Global lazy tab initializers
(function setupLazyTabInits() {
  const initFor = (tab) => {
    if (tab === 'tasks') __initTasksTabOnce();
    if (tab === 'stats') {
      loadStats && loadStats();
    }
    if (tab === 'player') {
      setTimeout(() => {
        window.__tryAutoResumeLast && window.__tryAutoResumeLast();
      }, 200);
    }
  };
  const initActiveNow = () => {
    if (window.tabSystem && window.tabSystem.getActiveTab) {
      const t = window.tabSystem.getActiveTab();
      initFor(t);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize for currently active tab only
      setTimeout(initActiveNow, 0);
    }, {once: true});
  }
  else {
    setTimeout(initActiveNow, 0);
  }
  // Initialize when a new tab becomes active (once per tab)
  window.addEventListener('tabchange', (e) => {
    const tab = e && e.detail && e.detail.activeTab;
    initFor(tab);
  });
})();
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
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
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
// Temporarily disabled due to syntax recovery: will re-enable after grid is stable.
