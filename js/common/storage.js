// 공통: localStorage 간단 래퍼

export function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function setStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // ignore
  }
}

export function getStoredString(key, fallback = "") {
  const v = getStoredJson(key, fallback);
  if (v == null) return String(fallback ?? "");
  return String(v);
}

export function setStoredString(key, value) {
  const v = String(value ?? "");
  setStoredJson(key, v);
}
