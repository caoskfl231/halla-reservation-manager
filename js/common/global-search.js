// 공통 상단 검색창(global-search-input)을 각 화면의 기존 검색 input과 동기화
// - body[data-global-search="1"]: 활성화
// - body[data-global-search-target]: 대상 input selector

const GLOBAL_SEARCH_STORAGE_KEY = 'hallapa.globalSearch.query.v1';

function safeGetSessionValue() {
  try {
    return sessionStorage.getItem(GLOBAL_SEARCH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function safeSetSessionValue(value) {
  try {
    sessionStorage.setItem(GLOBAL_SEARCH_STORAGE_KEY, String(value ?? ''));
  } catch {
    // ignore
  }
}

function tryClickActionButton() {
  const sel = document.body?.dataset?.globalSearchAction;
  if (!sel) return false;
  const el = document.querySelector(sel);
  if (!el) return false;
  if (el instanceof HTMLButtonElement) {
    el.click();
    return true;
  }
  if (el instanceof HTMLElement) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }
  return false;
}

export function initGlobalSearch() {
  const container = document.querySelector('.global-search-container');
  const globalInput = document.getElementById('global-search-input');
  if (!container || !globalInput) return;

  const enabled = document.body?.dataset?.globalSearch === '1';
  if (!enabled) {
    container.style.display = 'none';
    return;
  }

  const targetSelector = document.body?.dataset?.globalSearchTarget;
  let targetInput = null;

  if (targetSelector) {
    targetInput = document.querySelector(targetSelector);
  }

  if (!targetInput) {
    targetInput = document.querySelector('.card h2 .search-wrapper input');
  }

  if (!targetInput) {
    // 활성화는 했지만 대상이 없으면 숨김 처리
    container.style.display = 'none';
    return;
  }

  const localWrapper = targetInput.closest('.search-wrapper');
  if (localWrapper) {
    localWrapper.style.display = 'none';
  }

  globalInput.placeholder = targetInput.getAttribute('placeholder') || '검색';

  // 페이지 이동 간에도 검색어를 유지할 수 있도록 sessionStorage에 저장한다.
  const stored = safeGetSessionValue();
  const initial = String(targetInput.value || '').trim() || String(stored || '').trim();
  if (initial) {
    targetInput.value = initial;
    globalInput.value = initial;
    // 최초 로드시에도 필터가 적용되도록 input 이벤트를 한 번 발생시킨다.
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    globalInput.value = '';
  }

  // 이미 초기화된 경우 중복 바인딩 방지
  if (globalInput.dataset.bound === '1') return;
  globalInput.dataset.bound = '1';

  globalInput.addEventListener('input', () => {
    targetInput.value = globalInput.value;
    safeSetSessionValue(globalInput.value);
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Enter = 조회(페이지별 조회 버튼을 누르는 동작)
  globalInput.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key !== 'Enter') return;
    // 검색어 저장/동기화는 input 이벤트로 이미 처리되지만,
    // IME 입력 직후 Enter에서 누락되는 것을 막기 위해 한 번 더 저장한다.
    safeSetSessionValue(globalInput.value);
    // 조회 버튼이 정의된 화면에서만 클릭
    const clicked = tryClickActionButton();
    if (clicked) {
      e.preventDefault();
    }
  });

  const icon = container.querySelector('.search-icon');
  if (icon) {
    icon.addEventListener('click', () => {
      globalInput.focus();
    });
  }
}
