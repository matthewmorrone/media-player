// Shared utility functions extracted from index.js
// Keep this file free of DOM-manipulating logic (pure or narrowly scoped helpers only)

export function fmtSize(bytes) {
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

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  return m + ":" + String(s).padStart(2, "0");
}

export function parseTimeString(str) {
  if (!str) return 0;
  const parts = str.trim().split(':').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => !/^[0-9]{1,2}$/.test(p))) return NaN;
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
