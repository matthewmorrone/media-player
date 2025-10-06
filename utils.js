// Shared utility functions extracted from index.js
// Keep this file free of DOM-manipulating logic (pure or narrowly scoped helpers only)

export function fmtSize(bytes) {
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

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
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

// Generic debounce (not previously extracted explicitly; added for future use)
export function debounce(fn, wait = 120) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// DOM visibility helpers (UI helpers kept lightweight & side-effect-scoped)
export function hide(el) {
  if (!el) return;
  el.classList.add('hidden');
}
export function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.removeProperty('display');
}
export function showAs(el, display) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = display;
}
export function isHidden(el) {
  return !el || el.classList.contains('hidden');
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
  if (type === 'success') el.classList.add('is-success');
  else if (type === 'error') el.classList.add('is-error');
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
// localStorage helper wrappers (resilient to quota / private mode failures)
// -----------------------------
export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key); return v === null ? fallback : v;
  }
  catch (_) {
    return fallback;
  }
}
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value); return true;
  }
  catch (_) {
    return false;
  }
}
export function lsRemove(key) {
  try {
    localStorage.removeItem(key); return true;
  }
  catch (_) {
    return false;
  }
}
export function lsGetJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  }
  catch (_) {
    return fallback;
  }
}
export function lsSetJSON(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj)); return true;
  }
  catch (_) {
    return false;
  }
}
export function lsGetBool(key, defaultVal = false) {
  const v = lsGet(key, defaultVal ? '1' : '0');
  return v === '1';
}
export function lsSetBool(key, val) {
  lsSet(key, val ? '1' : '0');
}
export function lsKeysWithPrefix(prefix) {
  const out = []; try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k);
    }
  }
  catch (_) { }
  return out;
}
export function lsRemovePrefix(prefix) {
  lsKeysWithPrefix(prefix).forEach((k) => lsRemove(k));
}
