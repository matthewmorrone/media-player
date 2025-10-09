// Shared utility functions extracted from index.js
// Keep this file free of DOM-manipulating logic (pure or narrowly scoped helpers only)

export function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
}

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) { return ''; }
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
}

// General (H:)MM:SS formatter (parallel to fmtDuration but returns 00:00 when invalid)
export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// Compact time (same logic; alias for clarity in scrubber usage)
export function fmtShortTime(sec) {
  return fmtTime(sec);
}

export function parseTimeString(str) {
  if (!str) return 0;
  const parts = str.trim().split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => !/^[0-9]{1,2}$/.test(p))) return NaN;
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = +parts[0];
    m = +parts[1];
    s = +parts[2];
  }
  else if (parts.length === 2) {
    m = +parts[0];
    s = +parts[1];
  }
  else if (parts.length === 1) {
    s = +parts[0];
  }
  return (h * 3600) + (m * 60) + s;
}

// Internal color interpolation (not exported)
function lerpColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  const al = (a[3] + (b[3] - a[3]) * t).toFixed(3);
  return `rgba(${r},${g},${bl},${al})`;
}

// Heatmap gradient 0..1 → rgba()
export function heatColor(v) {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  v = clamp(v);
  if (v < 0.5) {
    const t = v / 0.5;
    return lerpColor([11, 16, 32, 0.5], [79, 140, 255, 0.85], t);
  }
  else {
    const t = (v - 0.5) / 0.5;
    return lerpColor([79, 140, 255, 0.85], [255, 122, 89, 0.95], t);
  }
}

// Generic debounce (not previously extracted explicitly; added for future use)
export function debounce(fn, wait = 120) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// DOM visibility helpers
// Visibility Contract (2025-10):
// - Preferred mechanism is the 'hidden' class (CSS sets display:none).
// - We are deprecating use of the native 'hidden' attribute for dynamic panels/elements
//   because mixing both caused race conditions (e.g., thumbnail placeholder masking).
// - For backward compatibility, hide() will still add the attribute ONLY if the caller
//   hasn't explicitly opted-out via data-keep-attr="0". New code should not rely on
//   the attribute for state checks; instead use isHidden(el) or classList.contains('hidden').
// - A future cleanup pass can remove attribute usage entirely once legacy checks are migrated.
export function hide(el) {
  if (!el) return;
  el.classList.add('hidden');
  // Transitional: only set attribute if legacy code might still check it and element
  // hasn't opted out. Opt-out by setting data-keep-attr="0" on the node.
  if (el.getAttribute('data-keep-attr') !== '0') {
    if (!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
  }
  try { el.style.removeProperty('display'); } catch (_) { }
}
export function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.removeProperty('display');
  if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
export function showAs(el, display) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = display;
  if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
export function isHidden(el) {
  // Primary source of truth: the hidden class.
  // Attribute considered legacy and ignored for new logic, but we still treat it as hidden until migration completes.
  return !el || el.classList.contains('hidden') || el.hasAttribute('hidden');
}

// Generic message modal helper (strict: requires markup to exist)
export function showMessageModal(message, opts = {}) {
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
    closeBtn._wired = true; closeBtn.addEventListener('click', close);
  }
  if (okBtn && !okBtn._wired) {
    okBtn._wired = true; okBtn.addEventListener('click', close);
  }
  if (!modal._bgWired) {
    modal._bgWired = true;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }
  show(modal);
}

// Path helper: detect absolute or home/drive rooted paths
export function isAbsolutePath(p) {
  if (!p) return false;
  return p.startsWith('/') || p.startsWith('~') || /^[A-Za-z]:[\\/]/.test(p);
}

// Lightweight toast notifier (defers to TasksManager if available)
export function notify(message, type = 'info') {
  try {
    if (window.tasksManager && typeof window.tasksManager.showNotification === 'function') {
      window.tasksManager.showNotification(message, type);
      return;
    }
  }
  catch (_) { }
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  if (type === 'success') { el.classList.add('is-success'); }
  else if (type === 'error') { el.classList.add('is-error'); }
  else el.classList.add('is-info');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.textContent = message;
  host.appendChild(el);
  const lifespan = 5000, fadeMs = 250;
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), fadeMs + 30);
  }, lifespan - fadeMs);
}

// -----------------------------
// localStorage helper wrappers (unified typed API)
// -----------------------------
export function lsGet(key, opts = null) {
  // Overloads:
  // lsGet(key, fallback) → string mode with fallback
  // lsGet(key, { type: 'json'|'bool'|'number'|'string', fallback })
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
      case 'string':
      default:
        return raw;
    }
  }
  catch (_) {
    return fallback;
  }
}

export function lsSet(key, value, opts = null) {
  // Overloads:
  // lsSet(key, value) → string
  // lsSet(key, value, 'json'|'bool'|'number'|'string')
  // lsSet(key, value, { type: 'json'|'bool'|'number'|'string' })
  let type = 'string';
  if (typeof opts === 'string') { type = opts; }
  else if (opts && typeof opts === 'object') { type = opts.type || 'string'; }

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
    }
    localStorage.setItem(key, stored);
    return true;
  }
  catch (_) {
    return false;
  }
}

export function lsKeysWithPrefix(prefix) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) { out.push(k); }
    }
  }
  catch (_) { }
  return out;
}

export function lsRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  }
  catch (_) {
    return false;
  }
}

export function lsRemovePrefix(prefix) {
  lsKeysWithPrefix(prefix).forEach((k) => lsRemove(k));
}

// ---------------------------------------------------------------------------
// Legacy wrapper aliases (maintain backward compatibility with existing code)
// These were previously removed but index.js (and possibly other modules) still
// import/use them. Keep them thin delegators over the unified lsGet/lsSet API.
// ---------------------------------------------------------------------------
export function lsGetJSON(key, fallback = null) {
  return lsGet(key, { type: 'json', fallback });
}
export function lsSetJSON(key, value) {
  return lsSet(key, value, { type: 'json' });
}
export function lsGetBool(key, fallback = false) {
  return lsGet(key, { type: 'bool', fallback });
}
export function lsSetBool(key, value) {
  return lsSet(key, value, { type: 'bool' });
}

// Generic boolean setting helpers (toggle-type; stored as '1' / '0' under setting.<name>)
export function loadToggleSetting(name, defaultValue = false) {
  try {
    const raw = lsGet(`setting.${name}`);
    if (raw == null) return defaultValue;
    return raw === '1';
  }
  catch (_) {
    return defaultValue;
  }
}

export function saveToggleSetting(name, value) {
  try {
    lsSet(`setting.${name}`, value ? '1' : '0');
  }
  catch (_) { }
}

// Attach to window for any legacy non-module access patterns (defensive)
try {
  window.loadToggleSetting = window.loadToggleSetting || loadToggleSetting;
  window.saveToggleSetting = window.saveToggleSetting || saveToggleSetting;
}
catch (_) { }

// (Removed deprecated helpers: lsGetJSON, lsSetJSON, lsGetBool, lsSetBool)
// Usage examples:
// lsSet('mediaPlayer:flag', true, 'bool');
// const flag = lsGet('mediaPlayer:flag', { type: 'bool', fallback: false });
// lsSet('mediaPlayer:prefs', prefsObj, { type: 'json' });
// const prefs = lsGet('mediaPlayer:prefs', { type: 'json', fallback: {} });
