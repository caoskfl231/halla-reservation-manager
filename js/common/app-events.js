const APP_EVENT_CHANNEL = "hallapa_app_events_v1";
const APP_EVENT_STORAGE_KEY = "hallapa_app_events_v1";

function nowTs() {
  return Date.now();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function tryPostBroadcast(message) {
  try {
    const bc = new BroadcastChannel(APP_EVENT_CHANNEL);
    bc.postMessage(message);
    bc.close();
    return true;
  } catch (_) {
    return false;
  }
}

function tryPostStorage(message) {
  try {
    localStorage.setItem(APP_EVENT_STORAGE_KEY, JSON.stringify(message));
    // 같은 탭에서는 storage 이벤트가 안 뜨므로 즉시 삭제해도 무방
    localStorage.removeItem(APP_EVENT_STORAGE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

export function emitAppEvent(type, payload = {}) {
  const message = {
    type: String(type || ""),
    payload: payload || {},
    ts: nowTs(),
  };

  const posted = tryPostBroadcast(message);
  if (!posted) {
    tryPostStorage(message);
  }
  return message;
}

export function onAppEvent(handler) {
  if (typeof handler !== "function") {
    return () => {};
  }

  let bc = null;
  let onBcMessage = null;

  try {
    bc = new BroadcastChannel(APP_EVENT_CHANNEL);
    onBcMessage = (event) => {
      const data = event && event.data;
      if (!data || !data.type) return;
      handler(data);
    };
    bc.addEventListener("message", onBcMessage);
  } catch (_) {
    // ignore (BroadcastChannel 미지원 환경)
  }

  const onStorage = (event) => {
    if (!event) return;
    if (event.key !== APP_EVENT_STORAGE_KEY) return;
    const data = safeJsonParse(event.newValue);
    if (!data || !data.type) return;
    handler(data);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);

    if (bc && onBcMessage) {
      try {
        bc.removeEventListener("message", onBcMessage);
      } catch (_) {}
    }

    if (bc) {
      try {
        bc.close();
      } catch (_) {}
    }
  };
}

function createDebounced(fn, waitMs) {
  let timer = null;
  let pending = false;

  const run = async () => {
    timer = null;
    if (!pending) return;
    pending = false;
    await fn();
  };

  return {
    schedule: () => {
      pending = true;
      if (timer) return;
      timer = setTimeout(run, Math.max(0, Number(waitMs) || 0));
    },
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      pending = false;
      await fn();
    },
  };
}

export function installDbAutoRefresh(options) {
  const refresh = options && options.refresh;
  const isBusy = (options && options.isBusy) || (() => false);
  const debounceMs = (options && options.debounceMs) ?? 150;
  const retryMs = (options && options.retryMs) ?? 500;

  if (typeof refresh !== "function") {
    return () => {};
  }

  let destroyed = false;
  let dirty = false;
  let retryTimer = null;

  const scheduleRetry = () => {
    if (destroyed) return;
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (destroyed) return;
      if (!dirty) return;
      debounced.schedule();
    }, Math.max(0, Number(retryMs) || 0));
  };

  const debounced = createDebounced(async () => {
    if (destroyed) return;
    if (document.visibilityState !== "visible") return;
    if (isBusy()) {
      scheduleRetry();
      return;
    }

    try {
      await refresh();
      dirty = false;
    } catch (_) {
      // ignore
    }
  }, debounceMs);

  const markDirty = () => {
    dirty = true;
    debounced.schedule();
  };

  const unsubscribe = onAppEvent((evt) => {
    if (!evt || evt.type !== "db:changed") return;
    markDirty();
  });

  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    if (!dirty) return;
    debounced.schedule();
  };

  const onFocus = () => {
    if (!dirty) return;
    debounced.schedule();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);

  // 처음 진입 직후에도 한번 실행해 두면, "다른 탭에서 미리 바뀐 데이터"가 반영됨
  debounced.schedule();

  return () => {
    destroyed = true;
    try {
      unsubscribe();
    } catch (_) {}
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
