// 공통 UI 헬퍼 모음
import { formatMoney } from './util.js?v=app-20261010-17';

function parseSignedNumberFromText(text) {
  let t = String(text || '').trim();
  if (!t) return null;

  // 퍼센트/비율 등은 대상에서 제외
  if (/%\s*$/.test(t)) return null;

  // 통화/단위 제거
  t = t.replace(/\s+/g, '').replace(/원/g, '');
  if (!t) return null;

  // (1,234) 형태는 음수로 해석
  let sign = 1;
  if (t.startsWith('(') && t.endsWith(')')) {
    sign = -1;
    t = t.slice(1, -1);
  }

  // 콤마 제거 후 숫자 변환(빈 문자열/NaN 방지)
  const raw = t.replace(/,/g, '').trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return sign * num;
}

// data-amount-color="1" 이 붙은 요소에 대해
// 텍스트(예: 1,234 / -1,234 / 1,234원)를 파싱해 amount-plus/minus/zero 클래스를 자동 부여한다.
// - data-amount-force="minus" 를 주면 부호와 무관하게 항상 빨강(0 제외)
// - data-amount-force="plus" 를 주면 부호와 무관하게 항상 파랑(0 제외)
export function applyAmountColoring(root = document) {
  if (typeof document === 'undefined') return;
  const base = root && (root instanceof Element || root instanceof Document) ? root : document;
  const nodes = base.querySelectorAll('[data-amount-color="1"]');
  nodes.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    // data-amount-value 가 있으면(권장) 그 값을 우선 사용한다.
    // 없으면 기존 텍스트 파싱 방식으로 하위 호환한다.
    let num = null;
    const hasValueAttr = Object.prototype.hasOwnProperty.call(el.dataset, 'amountValue');
    if (hasValueAttr) {
      const raw = String(el.dataset.amountValue ?? '').trim();
      if (raw !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          num = parsed;
        }
      }
    }
    if (num == null) {
      num = parseSignedNumberFromText(el.textContent);
    }
    if (num == null) return;

    const force = String(el.dataset.amountForce || '').trim();
    el.classList.remove('amount-plus', 'amount-minus', 'amount-zero');

    if (num === 0) {
      el.classList.add('amount-zero');
      return;
    }
    if (force === 'minus') {
      el.classList.add('amount-minus');
      return;
    }
    if (force === 'plus') {
      el.classList.add('amount-plus');
      return;
    }
    el.classList.add(num < 0 ? 'amount-minus' : 'amount-plus');
  });
}

// 작은 팝업형 모달을 기준 요소 바로 아래에 배치하는 헬퍼
// - modalEl: .modal-dialog 를 자식으로 가진 모달 오버레이 요소
// - triggerEl: 위치 기준이 되는 버튼/입력 요소
// - options.offsetY: 기준 요소 아래로 얼마나 띄울지(px, 기본 8)
export function positionModalBelowElement(modalEl, triggerEl, options = {}) {
  if (!modalEl || !triggerEl) return;

  const dialog = modalEl.querySelector('.modal-dialog');
  if (!dialog) return;

  const rect = triggerEl.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;

  const offsetY = typeof options.offsetY === 'number' ? options.offsetY : 8;
  const padding = 8;

  // 팝업형으로 동작하도록 position 고정 및 기본 마진 제거
  dialog.style.position = 'fixed';
  dialog.style.marginTop = '0';
  dialog.style.marginLeft = '0';

  // 먼저 화면 안에서 보이도록 임시 배치 후 실제 크기 측정
  dialog.style.left = padding + 'px';
  dialog.style.top = padding + 'px';

  const width = dialog.offsetWidth || 260;
  const height = dialog.offsetHeight || 200;

  // 가로는 클릭한 요소의 중앙을 기준으로 맞춘다.
  let left = rect.left + (rect.width - width) / 2;
  if (left + width + padding > vw) {
    left = Math.max(padding, vw - width - padding);
  }

  let top = rect.bottom + offsetY;
  if (top + height + padding > vh) {
    top = Math.max(padding, vh - height - padding);
  }

  dialog.style.left = left + 'px';
  dialog.style.top = top + 'px';
}

function findNearestScrollableContainer(el) {
  let cur = el instanceof Element ? el : null;
  while (cur) {
    const style = window.getComputedStyle(cur);
    const oy = String(style?.overflowY || '').toLowerCase();
    const isScrollable = /(auto|scroll|overlay)/.test(oy);
    // 렌더 직후에는 레이아웃이 아직 완전히 계산되기 전이라
    // scrollHeight/clientHeight 비교가 일시적으로 부정확할 수 있다.
    // 따라서 "스크롤 컨테이너" 판정은 overflowY 기준으로 우선 선택한다.
    if (isScrollable) return cur;
    cur = cur.parentElement;
  }
  return null;
}

const __scrollStateByEl = new WeakMap();

function isNearBottom(el, thresholdPx) {
  const threshold = Number.isFinite(Number(thresholdPx)) ? Number(thresholdPx) : 32;
  const remain = el.scrollHeight - (el.scrollTop + el.clientHeight);
  return remain <= threshold;
}

function ensureScrollState(el) {
  if (!el || !(el instanceof Element)) return null;
  if (__scrollStateByEl.has(el)) return __scrollStateByEl.get(el);

  const state = {
    hasUserScrolled: false,
    ignoreNextScrollEvent: false,
  };

  el.addEventListener(
    'scroll',
    () => {
      if (state.ignoreNextScrollEvent) {
        state.ignoreNextScrollEvent = false;
        return;
      }
      // 사용자가 스크롤을 건드린 상태로 간주
      state.hasUserScrolled = true;
    },
    { passive: true },
  );

  __scrollStateByEl.set(el, state);
  return state;
}

// 거래내역 표 렌더링 후, 최신 거래가 바로 보이도록 스크롤을 아래로 내린다.
// 기본 동작:
// - 첫 렌더(사용자 스크롤 전)에는 자동으로 아래로 이동
// - 사용자가 위로 스크롤해서 과거 내역을 보고 있으면(아래쪽이 아니면) 강제로 내리지 않음
// - 사용자가 이미 아래쪽에 있을 때만(near bottom) 계속 따라감
// options:
// - nearestScrollable: 가장 가까운 스크롤 컨테이너를 찾아 적용(기본 true)
// - behavior: 'auto' | 'smooth'
// - thresholdPx: near bottom 판정 여유(px)
// - force: true면 사용자 스크롤 여부와 무관하게 항상 아래로 이동
export function scrollToBottom(targetEl, options = {}) {
  if (typeof window === 'undefined') return;
  if (!targetEl) return;

  const nearestScrollable = options.nearestScrollable !== false;
  const behavior = String(options.behavior || 'auto');
  const thresholdPx =
    options.thresholdPx != null ? Number(options.thresholdPx) : 32;
  const force = options.force === true;

  const target = nearestScrollable
    ? findNearestScrollableContainer(targetEl) || targetEl
    : targetEl;
  if (!target || !(target instanceof Element)) return;

  const state = ensureScrollState(target);
  const shouldFollow =
    force ||
    !state ||
    !state.hasUserScrolled ||
    isNearBottom(target, thresholdPx);
  if (!shouldFollow) return;

  // 렌더 직후 레이아웃이 아직 확정되기 전일 수 있어 rAF로 한 프레임 미룬다.
  window.requestAnimationFrame(() => {
    try {
      if (state) state.ignoreNextScrollEvent = true;
      if (typeof target.scrollTo === 'function') {
        target.scrollTo({ top: target.scrollHeight, behavior });
      } else {
        target.scrollTop = target.scrollHeight;
      }
    } catch (_) {
      // ignore
    }
  });
}

// scrollToBottom을 "다음 1회만 강제로" 실행할 수 있게 해주는 컨트롤러.
// - 페이지별 shouldForceScroll... 같은 플래그를 만들지 않고 재사용하기 위함
// 사용 예:
//   const autoScroll = createScrollToBottomOnce();
//   autoScroll.forceNext(); // 저장/필터 등 특정 액션 직후 1회만
//   autoScroll.scroll(tbody);
export function createScrollToBottomOnce(defaultOptions = {}) {
  let shouldForceOnce = false;

  return {
    forceNext() {
      shouldForceOnce = true;
    },
    scroll(targetEl, options = {}) {
      const force = shouldForceOnce || options.force === true;
      shouldForceOnce = false;
      scrollToBottom(targetEl, { ...defaultOptions, ...options, force });
    },
  };
}

// 검색 입력 공통 헬퍼
// - inputEl: 검색 인풋 요소
// - onChange: (keyword: string) => void
//   - input 이벤트, Enter, ESC(초기화) 시 모두 호출
// - options:
//   - trim: 앞뒤 공백 제거 여부(기본 true)
//   - triggerOnEnterOnly: true 이면 input 대신 Enter 에서만 onChange 호출
export function attachSearchInput(inputEl, onChange, options = {}) {
  if (!inputEl || typeof onChange !== 'function') return;

  const { trim = true, triggerOnEnterOnly = false } = options;

  const getValue = () => {
    const v = inputEl.value ?? '';
    return trim ? v.trim() : v;
  };

  if (!triggerOnEnterOnly) {
    inputEl.addEventListener('input', () => {
      onChange(getValue());
    });
  }

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onChange(getValue());
      return;
    }
    if (e.key === 'Escape') {
      if (inputEl.value) {
        inputEl.value = '';
        onChange('');
      }
    }
  });

  // 검색 아이콘(🔍) 클릭 시에도 동일하게 검색 실행
  const wrapper = inputEl.closest('.search-wrapper');
  if (wrapper) {
    const icon = wrapper.querySelector('.search-icon');
    if (icon) {
      icon.addEventListener('click', () => {
        inputEl.focus();
        onChange(getValue());
      });
    }
  }
}

// 테이블 안에서 선택 행(.selected)을 위/아래로 이동시키는 헬퍼
export function moveTableSelection(tbody, delta, options = {}) {
  if (!tbody || !delta) return;

  const {
    rowSelector = 'tr',
    loop = true,
    onSelect,
  } = options;

  const rows = Array.from(tbody.querySelectorAll(rowSelector));
  if (!rows.length) return;

  let index = rows.findIndex(tr => tr.classList.contains('selected'));

  if (index === -1) {
    index = delta > 0 ? 0 : rows.length - 1;
  } else {
    index += delta;
    if (loop) {
      if (index < 0) index = rows.length - 1;
      if (index >= rows.length) index = 0;
    } else {
      if (index < 0) index = 0;
      if (index >= rows.length) index = rows.length - 1;
    }
  }

  const target = rows[index];
  if (!target) return;

  if (typeof onSelect === 'function') {
    onSelect(target);
  } else if (typeof target.click === 'function') {
    target.click();
  }

  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'nearest' });
  }
}

// tbody에 방향키(↑/↓)로 행 이동 기능을 붙이는 공통 헬퍼
// - 기본적으로 tabIndex를 0으로 설정해 포커스를 받을 수 있게 하고,
// - ArrowUp/ArrowDown 입력 시 moveTableSelection을 호출한다.
// - options는 moveTableSelection에 그대로 전달된다.
export function enableTableArrowNavigation(tbody, options = {}) {
  if (!tbody) return;

  // 이미 바인딩된 경우에도 최신 옵션을 반영할 수 있도록 저장한다.
  // (예: 같은 tbody를 재사용하는 피커 모달에서 open마다 콜백이 달라지는 경우)
  try {
    tbody.__arrowNavOptions = options;
  } catch (_) {
    // ignore
  }

  // 이미 바인딩된 경우 중복으로 이벤트를 추가하지 않는다.
  if (tbody.dataset && tbody.dataset.arrowNavBound === '1') {
    return;
  }
  if (tbody.dataset) {
    tbody.dataset.arrowNavBound = '1';
  }

  if (!tbody.hasAttribute('tabindex')) {
    tbody.tabIndex = 0;
  }

  tbody.addEventListener('keydown', (e) => {
    const opts = tbody.__arrowNavOptions || options || {};
    const { onEnter, enableEnter = false } = opts || {};

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      e.preventDefault();
      moveTableSelection(tbody, delta, opts);
      return;
    }

    if (enableEnter && e.key === 'Enter') {
      const selected = tbody.querySelector('tr.selected');
      if (!selected) return;
      e.preventDefault();
      if (typeof onEnter === 'function') {
        onEnter(selected, e);
      } else if (typeof selected.click === 'function') {
        selected.click();
      }
    }
  });
}

// select/input 등의 네이티브 동작(드롭다운)을 막고, 공통 모달/피커를 열기 위한 트리거 바인딩
// - <select>는 pointerdown/mousedown 단계에서 preventDefault를 걸어 드롭다운이 뜨지 않게 한다.
// - 같은 프레임에서 열면 브라우저 기본 동작과 충돌할 수 있어 기본값은 다음 tick(setTimeout 0)에서 openFn을 호출한다.
// - 반환값은 unbind 함수(필요 시 바인딩 해제)
export function bindPickerOpenTriggers(targetEl, openFn, options = {}) {
  if (!targetEl || typeof openFn !== 'function') return () => {};

  const {
    isEnabled,
    capture = true,
    schedule = true,
    blurTarget = true,
    preventDefault = true,
    stopPropagation = true,
    events = ['pointerdown', 'mousedown', 'click'],
    keys = ['Enter', ' ', 'ArrowDown', 'F4'],
  } = options || {};

  const invoke = (e) => {
    if (typeof isEnabled === 'function' && !isEnabled()) return;

    if (e && preventDefault && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (e && stopPropagation && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }

    if (blurTarget) {
      const t = e && e.target ? e.target : null;
      if (t && typeof t.blur === 'function') {
        try {
          t.blur();
        } catch {
          // ignore
        }
      }
    }

    const run = () => {
      try {
        openFn(e);
      } catch {
        // ignore
      }
    };

    if (schedule) {
      setTimeout(run, 0);
    } else {
      run();
    }
  };

  const onKeydown = (e) => {
    if (!e) return;
    if (!keys || !Array.isArray(keys) || keys.includes(e.key)) {
      invoke(e);
    }
  };

  const boundEvents = Array.isArray(events) ? events : [];
  boundEvents.forEach((ev) => {
    if (!ev) return;
    targetEl.addEventListener(ev, invoke, capture);
  });
  targetEl.addEventListener('keydown', onKeydown);

  return () => {
    boundEvents.forEach((ev) => {
      if (!ev) return;
      targetEl.removeEventListener(ev, invoke, capture);
    });
    targetEl.removeEventListener('keydown', onKeydown);
  };
}

// select value를 세팅하고 change 이벤트를 발생시킨다.
// - Event 생성/dispatch가 막히는 환경이면 applyFn(옵션)을 호출해 하위호환한다.
export function setSelectValueAndApply(selectEl, value, applyFn) {
  if (!selectEl) {
    if (typeof applyFn === 'function') applyFn();
    return;
  }
  selectEl.value = value == null ? '' : String(value);
  try {
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {
    if (typeof applyFn === 'function') applyFn();
  }
}

export function setInputValue(inputEl, value) {
  if (!inputEl) return;
  inputEl.value = value == null ? '' : String(value);
}

// 거래처(또는 유사 엔티티) 선택 확정 시 UI 반영 패턴 공통화
// - 분류(kind) 세팅(옵션)
// - 분류 코드 등 부가 동기화(afterKindSet, 옵션)
// - select 옵션 재구성(rebuildSelectOptions, 옵션)
// - select value 반영 + change dispatch (setSelectValueAndApply)
export function applyPickedSupplierSelectionToContext({
  groupName,
  supplierId,
  kindSelect,
  afterKindSet,
  rebuildSelectOptions,
  supplierSelect,
  applyFromSelect,
} = {}) {
  const g = groupName == null ? '' : String(groupName);
  const id = supplierId == null ? '' : String(supplierId);

  if (kindSelect) {
    kindSelect.value = g;
  }
  if (typeof afterKindSet === 'function') {
    afterKindSet(g);
  }
  if (typeof rebuildSelectOptions === 'function') {
    rebuildSelectOptions(g);
  }
  setSelectValueAndApply(supplierSelect, id, applyFromSelect);
}

const _delegatedRowEventBound = new WeakMap();

function markDelegatedRowEventBound(container, key) {
  if (!container) return false;
  const k = String(key || 'default');
  const existed = _delegatedRowEventBound.get(container);
  if (existed && existed.has(k)) return false;
  const set = existed || new Set();
  set.add(k);
  _delegatedRowEventBound.set(container, set);
  return true;
}

function isInteractiveElementForRowEdit(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (
    tag === 'button' ||
    tag === 'a' ||
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    tag === 'label'
  ) {
    return true;
  }
  if (el.getAttribute && el.getAttribute('role') === 'button') return true;
  if (el.isContentEditable) return true;
  return false;
}

// 테이블/리스트 행을 더블클릭하면 공통으로 편집 동작을 수행하는 이벤트 위임 헬퍼
// - container: tbody 또는 tr들을 직접 가진 컨테이너 요소
// - options.rowSelector: 더블클릭 대상 행 선택자(기본 tr[data-id])
// - options.onEdit: (rowEl, event) => void | Promise<void>
// - options.editButton: HTMLElement | (() => HTMLElement | null)
//   - onEdit가 없으면 editButton.click()을 실행한다.
// - options.selectOnDblClick: 기본 true (먼저 row.click()으로 선택/로드를 유도)
// - options.ignoreInteractive: 기본 true (버튼/인풋 등 위에서 dblclick은 무시)
export function bindDblClickRowEdit(container, options = {}) {
  if (!container) return;
  if (!markDelegatedRowEventBound(container, 'rowEdit')) return;

  const {
    rowSelector = 'tr[data-id]',
    onEdit,
    editButton,
    selectOnDblClick = true,
    ignoreInteractive = true,
  } = options;

  container.addEventListener('dblclick', async (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;
    if (ignoreInteractive && isInteractiveElementForRowEdit(target)) return;

    const row = target.closest(rowSelector);
    if (!row || !container.contains(row)) return;

    if (selectOnDblClick && typeof row.click === 'function') {
      row.click();
    }

    if (typeof onEdit === 'function') {
      await onEdit(row, e);
      return;
    }

    const btn = typeof editButton === 'function' ? editButton() : editButton;
    if (btn && typeof btn.click === 'function') {
      btn.click();
    }
  });
}

// 테이블/리스트 행을 더블클릭하면 공통으로 "선택 확정"(apply/confirm) 동작을 수행하는 이벤트 위임 헬퍼
// - container: tbody 또는 tr들을 직접 가진 컨테이너 요소
// - options.rowSelector: 더블클릭 대상 행 선택자(기본 tr[data-id])
// - options.onConfirm: (rowEl, event) => void | Promise<void>
// - options.confirmButton: HTMLElement | (() => HTMLElement | null)
//   - onConfirm가 없으면 confirmButton.click()을 실행한다.
// - options.selectOnDblClick: 기본 true (먼저 row.click()으로 선택/로드를 유도)
// - options.ignoreInteractive: 기본 true (버튼/인풋 등 위에서 dblclick은 무시)
export function bindDblClickRowConfirm(container, options = {}) {
  if (!container) return;
  if (!markDelegatedRowEventBound(container, 'rowConfirm')) return;

  const {
    rowSelector = 'tr[data-id]',
    onConfirm,
    confirmButton,
    selectOnDblClick = true,
    ignoreInteractive = true,
  } = options;

  container.addEventListener('dblclick', async (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;
    if (ignoreInteractive && isInteractiveElementForRowEdit(target)) return;

    const row = target.closest(rowSelector);
    if (!row || !container.contains(row)) return;

    if (selectOnDblClick && typeof row.click === 'function') {
      row.click();
    }

    if (typeof onConfirm === 'function') {
      await onConfirm(row, e);
      return;
    }

    const btn = typeof confirmButton === 'function' ? confirmButton() : confirmButton;
    if (btn && typeof btn.click === 'function') {
      btn.click();
    }
  });
}

// 테이블/리스트 행을 클릭하면 공통으로 선택 표시(.selected 등)를 갱신하는 이벤트 위임 헬퍼
// - container: tbody 또는 tr들을 직접 가진 컨테이너 요소
// - options.rowSelector: 클릭 대상 행 선택자(기본 tr)
// - options.selectedClass: 선택 클래스명(기본 'selected')
// - options.clearAll: 기본 true (같은 컨테이너 내 기존 선택을 해제)
// - options.onSelect: (rowEl, event) => void
// - options.ignoreInteractive: 기본 true (버튼/인풋 등 클릭은 무시)
export function bindClickRowSelect(container, options = {}) {
  if (!container) return;
  if (!markDelegatedRowEventBound(container, 'rowSelect')) return;

  const {
    rowSelector = 'tr',
    selectedClass = 'selected',
    clearAll = true,
    onSelect,
    ignoreInteractive = true,
  } = options;

  container.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;
    if (ignoreInteractive && isInteractiveElementForRowEdit(target)) return;

    const row = target.closest(rowSelector);
    if (!row || !container.contains(row)) return;

    if (clearAll) {
      container
        .querySelectorAll(`${rowSelector}.${selectedClass}`)
        .forEach((r) => r.classList.remove(selectedClass));
    }
    row.classList.add(selectedClass);

    if (typeof onSelect === 'function') {
      onSelect(row, e);
    }
  });
}

// 모달 오버레이 열기: is-open 클래스와 aria-hidden, body 스크롤 잠금 처리
export function openModalOverlay(modalEl) {
  if (!modalEl) return;

  // 닫힐 때 포커스를 원래 위치로 복귀시키기 위해 저장
  // (aria-hidden 적용 시 포커스가 숨겨진 subtree에 남아있으면 접근성 경고/차단 발생)
  try {
    const active = document && document.activeElement;
    // 이미 모달 내부에 포커스가 있다면(재호출 등) 복귀 타깃으로 저장하지 않는다.
    modalEl.__hallapaRestoreFocusEl =
      active instanceof HTMLElement && !modalEl.contains(active) ? active : null;
  } catch (_) {
    modalEl.__hallapaRestoreFocusEl = null;
  }

  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
  // 열린 상태에서는 상호작용/포커스 허용
  try {
    modalEl.removeAttribute('inert');
  } catch (_) {
    // ignore
  }
  document.body.classList.add('modal-open');

  // 모달이 열릴 때마다: 닫기X/드래그 기능이 항상 활성화되도록 보장
  // (페이지별 스크립트에서 bind 함수를 깜빡해도 동작하도록)
  try {
    bindModalCloseX(modalEl);
    bindModalOverlayOutsideClickClose();
    bindModalHeaderDrag(modalEl);
  } catch (_) {
    // ignore
  }

  // 드래그 등으로 position:fixed + left/top 이 설정된 모달이
  // 화면 바깥으로 나가 있으면 열 때 화면 안으로 보정한다.
  try {
    const dialog = modalEl.querySelector('.modal-dialog');
    if (dialog && dialog instanceof HTMLElement) {
      const pos = (dialog.style.position || '').trim();
      if (pos === 'fixed') {
        const padding = 8;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const rect = dialog.getBoundingClientRect();

        let left = rect.left;
        let top = rect.top;
        const width = rect.width;
        const height = rect.height;

        // left/top이 설정되어 있지 않으면(예: 다른 레이아웃) 보정하지 않는다.
        if (Number.isFinite(left) && Number.isFinite(top) && width > 0 && height > 0) {
          if (left + width + padding > vw) left = Math.max(padding, vw - width - padding);
          if (top + height + padding > vh) top = Math.max(padding, vh - height - padding);
          if (left < padding) left = padding;
          if (top < padding) top = padding;
          dialog.style.left = left + 'px';
          dialog.style.top = top + 'px';
        }
      }
    }
  } catch (_) {
    // ignore
  }
}

// 모달 오버레이(배경) 클릭 닫기(옵션)
// - 기본값: 닫지 않음
// - overlay에 data-overlay-close="on" 가 있을 때만 닫는다.
// - dialog 내부 클릭은 닫지 않음
// - 가능하면 .modal-close-x 를 클릭해 기존 닫기/confirm 흐름을 재사용
export function bindModalOverlayOutsideClickClose() {
  if (typeof document === 'undefined') return;

  const g = globalThis;
  if (g.__hallapaModalOverlayOutsideClickDelegated) return;
  g.__hallapaModalOverlayOutsideClickDelegated = true;

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // 배경 클릭만 처리: overlay 요소 자체를 클릭한 경우에만 닫기
      if (!target.classList.contains('modal-overlay')) return;
      const overlay = target;

      if (!overlay.classList.contains('is-open')) return;
      if ((overlay.getAttribute('data-overlay-close') || '').toLowerCase() !== 'on') return;

      e.preventDefault();
      e.stopPropagation();

      // 닫기 X가 있으면 그걸 클릭해서 기존 로직(data-click/dirty confirm 포함)을 탄다.
      const closeX = overlay.querySelector('.modal-close-x');
      if (closeX && typeof closeX.click === 'function') {
        closeX.click();
        return;
      }

      closeModalOverlay(overlay);
    },
    true,
  );
}

// 모달 오버레이 닫기: is-open 제거 및 body 스크롤 복원
export function closeModalOverlay(modalEl) {
  if (!modalEl) return;

  // aria-hidden="true"를 걸기 전에, 포커스가 모달 내부에 있으면 밖으로 이동시킨다.
  // 가능한 경우: 열기 직전 activeElement로 복귀
  try {
    const active = document && document.activeElement;
    if (active instanceof HTMLElement && modalEl.contains(active)) {
      const restoreEl = modalEl.__hallapaRestoreFocusEl;
      if (
        restoreEl &&
        restoreEl instanceof HTMLElement &&
        restoreEl.isConnected &&
        !modalEl.contains(restoreEl) &&
        typeof restoreEl.focus === 'function'
      ) {
        restoreEl.focus();
      } else if (typeof active.blur === 'function') {
        active.blur();
      }
    }
  } catch (_) {
    // ignore
  }

  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
  // 닫힌 상태에서는 포커스/클릭이 들어가지 않게 inert 처리(지원 브라우저에 한해)
  try {
    modalEl.setAttribute('inert', '');
  } catch (_) {
    // ignore
  }
  document.body.classList.remove('modal-open');
}

// .modal-close-x 버튼에 공통 동작을 부여한다.
// - data-click="CSS_SELECTOR" 가 있으면 해당 요소를 클릭해서 기존 닫기 로직을 재사용한다.
// - 없거나 대상이 없으면 가장 가까운 .modal-overlay 를 닫는다.
export function bindModalCloseX(root = document) {
  if (typeof document === 'undefined') return;

  // 한 번만(문서 위임) 등록: 모달이 나중에 DOM에 추가돼도 항상 동작
  const g = globalThis;
  if (!g.__hallapaModalCloseXDelegated) {
    g.__hallapaModalCloseXDelegated = true;

    document.addEventListener(
      'click',
      (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest('.modal-close-x');
      if (!(btn instanceof HTMLElement)) return;

      e.preventDefault();
      e.stopPropagation();

      const selector = btn.getAttribute('data-click');
      if (selector) {
        const linked = document.querySelector(selector);
        if (linked && typeof linked.click === 'function') {
          linked.click();
          return;
        }
      }

      const overlay = btn.closest('.modal-overlay');
      if (overlay) {
        closeModalOverlay(overlay);
      }
      },
      true,
    );
  }

  const base =
    root && (root instanceof Element || root instanceof Document) ? root : document;
  const buttons = base.querySelectorAll('.modal-close-x');

  buttons.forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    if (btn.dataset.modalCloseXBound === '1') return;
    btn.dataset.modalCloseXBound = '1';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const selector = btn.getAttribute('data-click');
      if (selector) {
        const target = document.querySelector(selector);
        if (target && typeof target.click === 'function') {
          target.click();
          return;
        }
      }

      const overlay = btn.closest('.modal-overlay');
      if (overlay) {
        closeModalOverlay(overlay);
      }
    });
  });
}

// .modal-header 를 드래그 핸들로 사용해 .modal-dialog 를 이동시킨다.
// - pointer events 기반(마우스/터치/펜 공통)
// - 헤더 안의 버튼/입력 등 조작 요소를 눌렀을 때는 드래그를 시작하지 않는다.
export function bindModalHeaderDrag(root = document) {
  if (typeof document === 'undefined') return;

  // 한 번만(문서 위임) 등록: 모달이 나중에 DOM에 추가돼도 항상 동작
  const g = globalThis;
  if (!g.__hallapaModalHeaderDragDelegated) {
    g.__hallapaModalHeaderDragDelegated = true;

    let dragging = null;

    const endDrag = () => {
      if (!dragging) return;
      const { dialog } = dragging;
      if (dialog) dialog.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
      dragging = null;
    };

    const onMove = (ev) => {
      if (!dragging) return;
      const { startX, startY, startLeft, startTop, rect, dialog } = dragging;
      if (!dialog) return;

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const width = dialog.offsetWidth || rect.width || 0;
      const height = dialog.offsetHeight || rect.height || 0;

      const padding = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;

      let left = startLeft + dx;
      let top = startTop + dy;

      if (vw && width) {
        left = Math.min(vw - width - padding, Math.max(padding, left));
      } else {
        left = Math.max(padding, left);
      }
      if (vh && height) {
        top = Math.min(vh - height - padding, Math.max(padding, top));
      } else {
        top = Math.max(padding, top);
      }

      dialog.style.left = left + 'px';
      dialog.style.top = top + 'px';
    };

    document.addEventListener(
      'pointerdown',
      (e) => {
      const rawTarget = e.target;
      const target = rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement;
      if (!(target instanceof Element)) return;
      const header = target.closest('.modal-dialog .modal-header');
      if (!(header instanceof HTMLElement)) return;

      // 왼쪽 버튼/주 포인터만
      if (e.button != null && e.button !== 0) return;
      if (e.isPrimary === false) return;

      // 헤더 안의 조작 요소는 제외
      if (target.closest('button, a, input, select, textarea, label')) return;

      // 텍스트 선택/기본 드래그(이미지 등) 방지
      e.preventDefault();

      const dialog = header.closest('.modal-dialog');
      if (!(dialog instanceof HTMLElement)) return;

      const rect = dialog.getBoundingClientRect();
      dialog.style.position = 'fixed';
      dialog.style.marginTop = '0';
      dialog.style.marginLeft = '0';
      dialog.style.left = rect.left + 'px';
      dialog.style.top = rect.top + 'px';
      dialog.classList.add('is-dragging');

      dragging = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        rect,
        dialog,
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', endDrag);
      },
      true,
    );
  }

  const base =
    root && (root instanceof Element || root instanceof Document) ? root : document;
  const headers = base.querySelectorAll('.modal-dialog .modal-header');

  headers.forEach((header) => {
    if (!(header instanceof HTMLElement)) return;
    if (header.dataset.modalDragBound === '1') return;
    header.dataset.modalDragBound = '1';

    header.addEventListener('pointerdown', (e) => {
      // 왼쪽 버튼/주 포인터만
      if (e.button != null && e.button !== 0) return;
      if (e.isPrimary === false) return;

      const target = e.target;
      if (target instanceof Element) {
        // 헤더 안의 조작 요소는 제외
        if (target.closest('button, a, input, select, textarea, label')) return;
      }

      const dialog = header.closest('.modal-dialog');
      if (!(dialog instanceof HTMLElement)) return;

      // 텍스트 선택/기본 드래그 방지
      e.preventDefault();

      // fixed + left/top 기준으로 이동
      const rect = dialog.getBoundingClientRect();
      dialog.style.position = 'fixed';
      dialog.style.marginTop = '0';
      dialog.style.marginLeft = '0';
      dialog.style.left = rect.left + 'px';
      dialog.style.top = rect.top + 'px';

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;

      const padding = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;

      // 이동 중에는 텍스트 선택 방지
      dialog.classList.add('is-dragging');

      try {
        header.setPointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const width = dialog.offsetWidth || rect.width || 0;
        const height = dialog.offsetHeight || rect.height || 0;

        let left = startLeft + dx;
        let top = startTop + dy;

        // 화면 바깥으로 나가지 않게 보정
        if (vw && width) {
          left = Math.min(vw - width - padding, Math.max(padding, left));
        } else {
          left = Math.max(padding, left);
        }
        if (vh && height) {
          top = Math.min(vh - height - padding, Math.max(padding, top));
        } else {
          top = Math.max(padding, top);
        }

        dialog.style.left = left + 'px';
        dialog.style.top = top + 'px';
      };

      const end = () => {
        dialog.classList.remove('is-dragging');
        header.removeEventListener('pointermove', onMove);
        header.removeEventListener('pointerup', end);
        header.removeEventListener('pointercancel', end);
      };

      header.addEventListener('pointermove', onMove);
      header.addEventListener('pointerup', end);
      header.addEventListener('pointercancel', end);
    });
  });
}

// ESC 키로 모달을 닫는 공통 핸들러를 등록하고, 제거용 함수를 반환한다.
// 사용 예시:
//   const escOff = registerModalEscClose(modalEl, closeFn);
//   ... 모달 닫을 때 escOff();
export function registerModalEscClose(modalEl, closeFn) {
  if (!modalEl || typeof closeFn !== 'function') return () => {};

  const handler = (e) => {
    if (e.key !== 'Escape') return;
    // ESC 키를 누른 채로 있으면 keydown이 반복 발생할 수 있다.
    // dirty-confirm과 결합될 때 대화상자 반복 경고("계속 반복하시겠습니까?")를 유발하므로 무시한다.
    if (e.repeat) return;
    if (!modalEl.classList.contains('is-open')) return;
    e.preventDefault();
    try {
      const ret = closeFn();
      if (ret && typeof ret.then === 'function') {
        ret.catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  document.addEventListener('keydown', handler);
  return () => {
    document.removeEventListener('keydown', handler);
  };
}

// 폼 입력값 변경 여부 추적용 헬퍼
// getSnapshot: 현재 폼 상태를 {필드명: 값} 객체로 반환하는 함수
// markClean() 호출 시점을 기준으로 이후 스냅샷과 비교해 isDirty() 결과를 낸다.
export function createFormDirtyTracker(getSnapshot) {
  let cleanSnapshot = null;

  function safeSnapshot() {
    if (typeof getSnapshot !== 'function') return null;
    try {
      return getSnapshot() || null;
    } catch (e) {
      return null;
    }
  }

  function markClean() {
    cleanSnapshot = safeSnapshot();
  }

  function isDirty() {
    if (!cleanSnapshot) return false;
    const current = safeSnapshot();
    if (!current) return false;
    try {
      return JSON.stringify(current) !== JSON.stringify(cleanSnapshot);
    } catch (e) {
      return false;
    }
  }

  return { markClean, isDirty };
}

// dirty 트래커와 실제 close 함수를 받아, 공통 confirm 로직을 적용해 주는 래퍼
// - ESC 핸들러 중복 등록 등으로 confirm이 연속 호출되면 브라우저가
//   "계속 반복하시겠습니까?"(대화상자 과다) 경고를 띄울 수 있어
//   짧은 시간 내 중복 confirm을 방지한다.
let __lastDirtyConfirmAt = 0;
export function wrapDirtyClose(dirtyTracker, closeFn, message = '변경사항이 저장되지 않았습니다. 닫으시겠습니까?') {
  if (!dirtyTracker || typeof closeFn !== 'function') return closeFn;
  const hasIsDirty = typeof dirtyTracker.isDirty === 'function';
  const hasMarkClean = typeof dirtyTracker.markClean === 'function';
  const wrapped = async () => {
    const dirty = hasIsDirty && dirtyTracker.isDirty();
    if (dirty) {
      const now = Date.now();
      if (now - __lastDirtyConfirmAt < 800) return;
      __lastDirtyConfirmAt = now;

      // 공용 dialogs가 전역으로 설치되어 있으면 우선 사용한다.
      // (없으면 기존 confirm으로 하위 호환)
      const g = typeof window !== 'undefined' ? window.__hallaDialogs : null;
      if (g && typeof g.confirmDialog === 'function') {
        const ok = await g.confirmDialog(message, {
          title: '닫기 확인',
          okText: '닫기',
          cancelText: '취소',
          tone: 'danger',
        });
        if (!ok) return;
      } else {
        if (!confirm(message)) return;
      }
    }
    closeFn();
  };
  wrapped.markClean = hasMarkClean ? () => dirtyTracker.markClean() : () => {};
  wrapped.isDirty = hasIsDirty ? () => dirtyTracker.isDirty() : () => false;
  return wrapped;
}

// 입력값 초기화 + 포커스/전체선택 공통 헬퍼
// - fields: [el, value] 튜플 배열 또는 요소 배열
// - focus: 마지막에 포커스 줄 요소
// - select: focus 대상에서 select() 실행 여부
export function resetFieldsAndFocus({ fields = [], focus = null, select = true } = {}) {
  const list = Array.isArray(fields) ? fields : [fields];

  for (const entry of list) {
    if (!entry) continue;
    if (Array.isArray(entry)) {
      const el = entry[0];
      const value = entry.length > 1 ? entry[1] : '';
      if (el && 'value' in el) {
        el.value = value == null ? '' : String(value);
      }
      continue;
    }
    if ('value' in entry) {
      entry.value = '';
    }
  }

  if (focus && typeof focus.focus === 'function') {
    focus.focus();
    if (select && typeof focus.select === 'function') {
      focus.select();
    }
  }
}

// ==== 전체 페이지 숫자 입력 공통 동작 ====
// 모든 input[type="number"]에 대해:
// - 포커스 시 값이 정확히 '0'이면 비워서 바로 입력해도 앞에 0이 붙지 않도록 함
// - blur 시 값이 비어있지 않으면 Number()로 변환해 선행 0을 제거(01111 -> 1111)
// - data-number-normalize="off" 가 지정된 입력은 제외
function normalizeNumberInputValue(input) {
  if (!input || input.dataset.numberNormalize === 'off') return;
  const raw = (input.value || '').trim();
  if (!raw) return;
  const n = Number(raw.replace(/,/g, ''));
  if (Number.isNaN(n)) return;
  input.value = String(n);
}

// 금액 입력 공통 동작(data-money-input="1"):
// - 포커스 시 내부 값에서 콤마를 제거해 순수 숫자만 남김
// - 입력/blur 시 숫자를 파싱해 다시 천 단위 구분 기호를 붙여 표시
function normalizeMoneyInputOnFocus(input) {
  if (!input || input.dataset.moneyInput !== '1') return;
  const raw = (input.value || '').replace(/,/g, '').trim();
  if (!raw) {
    input.value = '';
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    input.value = '';
    return;
  }
  input.value = String(n);
}

function formatMoneyInputDisplay(input) {
  if (!input || input.dataset.moneyInput !== '1') return;
  const raw = (input.value || '').replace(/,/g, '').trim();
  if (!raw) {
    input.value = '';
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    input.value = '';
    return;
  }
  input.value = formatMoney(n);
}

if (typeof document !== 'undefined') {
  // 공통 모달 템플릿: 헤더의 X 버튼 지원
  // - data-click="#btn-xxx" 가 있으면 기존 닫기 버튼을 클릭해 dirty-confirm 흐름을 그대로 탄다.
  // - 없으면 오버레이를 직접 닫는다.
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    const btn = target.closest('.modal-close-x');
    if (!btn) return;
    e.preventDefault();

    const selector = btn.getAttribute('data-click') || '';
    if (selector) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
        return;
      }
    }

    const overlay = btn.closest('.modal-overlay');
    if (overlay) {
      closeModalOverlay(overlay);
    }
  });

  // 공통 모달 템플릿: 헤더를 잡고 모달 이동(드래그)
  // - .modal-header 가 있는 모달만 대상
  // - 닫기(X) 버튼/폼 요소 클릭은 드래그 시작하지 않음
  // - data-drag="off" 가 overlay 또는 dialog 에 있으면 제외
  try {
    if (!window.__modalHeaderDragInstalled) {
      window.__modalHeaderDragInstalled = true;

      const state = {
        active: false,
        pointerId: null,
        headerEl: null,
        dialogEl: null,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        dialogWidth: 0,
        dialogHeight: 0,
      };

      const isInteractive = (el) => {
        if (!el || !(el instanceof Element)) return false;
        return !!el.closest('button, a, input, select, textarea, label, [role="button"], .modal-close-x');
      };

      const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

      const stop = () => {
        if (!state.active) return;
        state.active = false;
        if (state.dialogEl) {
          state.dialogEl.classList.remove('is-dragging');
        }
        try {
          if (state.headerEl && state.pointerId != null && typeof state.headerEl.releasePointerCapture === 'function') {
            state.headerEl.releasePointerCapture(state.pointerId);
          }
        } catch (_) {
          // ignore
        }
        state.pointerId = null;
        state.headerEl = null;
        state.dialogEl = null;
      };

      document.addEventListener('pointerdown', (e) => {
        // 좌클릭/터치만
        if (e.button != null && e.button !== 0) return;
        const target = e.target;
        if (!target || !(target instanceof Element)) return;

        const header = target.closest('.modal-header');
        if (!header) return;
        if (isInteractive(target)) return;

        const dialog = header.closest('.modal-dialog');
        if (!dialog || !(dialog instanceof HTMLElement)) return;

        const overlay = dialog.closest('.modal-overlay');
        if (!overlay || !(overlay instanceof HTMLElement)) return;
        if (!overlay.classList.contains('is-open')) return;
        if (overlay.dataset.drag === 'off' || dialog.dataset.drag === 'off') return;

        const rect = dialog.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const padding = 8;

        // 드래그 가능한 형태로 전환(기존 flex 중앙정렬 영향 제거)
        dialog.style.position = 'fixed';
        dialog.style.marginTop = '0';
        dialog.style.marginLeft = '0';
        dialog.style.transform = 'none';
        dialog.style.left = rect.left + 'px';
        dialog.style.top = rect.top + 'px';

        state.active = true;
        state.pointerId = e.pointerId;
        state.headerEl = header;
        state.dialogEl = dialog;
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.startLeft = rect.left;
        state.startTop = rect.top;
        state.dialogWidth = rect.width;
        state.dialogHeight = rect.height;

        dialog.classList.add('is-dragging');

        // 시작 시점에 이미 화면 밖이면 먼저 보정
        const maxLeft = Math.max(padding, vw - state.dialogWidth - padding);
        const maxTop = Math.max(padding, vh - state.dialogHeight - padding);
        const initLeft = clamp(state.startLeft, padding, maxLeft);
        const initTop = clamp(state.startTop, padding, maxTop);
        dialog.style.left = initLeft + 'px';
        dialog.style.top = initTop + 'px';
        state.startLeft = initLeft;
        state.startTop = initTop;

        try {
          if (typeof header.setPointerCapture === 'function') {
            header.setPointerCapture(e.pointerId);
          }
        } catch (_) {
          // ignore
        }

        e.preventDefault();
      }, { passive: false });

      document.addEventListener('pointermove', (e) => {
        if (!state.active || !state.dialogEl) return;
        if (state.pointerId != null && e.pointerId != null && e.pointerId !== state.pointerId) return;

        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const padding = 8;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;

        let left = state.startLeft + dx;
        let top = state.startTop + dy;

        const maxLeft = Math.max(padding, vw - state.dialogWidth - padding);
        const maxTop = Math.max(padding, vh - state.dialogHeight - padding);

        left = clamp(left, padding, maxLeft);
        top = clamp(top, padding, maxTop);

        state.dialogEl.style.left = left + 'px';
        state.dialogEl.style.top = top + 'px';
      });

      document.addEventListener('pointerup', stop);
      document.addEventListener('pointercancel', stop);
      document.addEventListener('blur', stop, true);

          // 더블클릭: 모달을 화면 중앙으로 리셋
          document.addEventListener('dblclick', (e) => {
            const target = e.target;
            if (!target || !(target instanceof Element)) return;

            const header = target.closest('.modal-header');
            if (!header) return;
            if (isInteractive(target)) return;

            const dialog = header.closest('.modal-dialog');
            if (!dialog || !(dialog instanceof HTMLElement)) return;

            const overlay = dialog.closest('.modal-overlay');
            if (!overlay || !(overlay instanceof HTMLElement)) return;
            if (!overlay.classList.contains('is-open')) return;
            if (overlay.dataset.drag === 'off' || dialog.dataset.drag === 'off') return;

            const padding = 8;
            const vw = window.innerWidth || document.documentElement.clientWidth || 0;
            const vh = window.innerHeight || document.documentElement.clientHeight || 0;

            // 중앙 배치를 위해 fixed 로 전환
            const rect = dialog.getBoundingClientRect();
            dialog.style.position = 'fixed';
            dialog.style.marginTop = '0';
            dialog.style.marginLeft = '0';
            dialog.style.transform = 'none';

            const width = rect.width || dialog.offsetWidth || 0;
            const height = rect.height || dialog.offsetHeight || 0;

            const maxLeft = Math.max(padding, vw - width - padding);
            const maxTop = Math.max(padding, vh - height - padding);

            const left = clamp((vw - width) / 2, padding, maxLeft);
            const top = clamp((vh - height) / 2, padding, maxTop);

            dialog.style.left = left + 'px';
            dialog.style.top = top + 'px';
            dialog.classList.remove('is-dragging');

            e.preventDefault();
          }, { passive: false });
    }
  } catch (_) {
    // ignore
  }

  // focusin: 기본값 0 이면 비워 주기
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target || !(target instanceof HTMLInputElement)) return;

    // 일반 숫자 입력
    if (target.type === 'number') {
      if (target.dataset.numberNormalize === 'off') return;
      if (target.value === '0') {
        target.value = '';
      }
      return;
    }

    // 금액 입력(텍스트형)
    if (target.dataset.moneyInput === '1') {
      normalizeMoneyInputOnFocus(target);
    }
  });

  // input/blur: 숫자 정규화 및 금액 포맷 적용
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || !(target instanceof HTMLInputElement)) return;
    if (target.dataset.moneyInput === '1') {
      // 사용자가 입력하는 동안에도 천 단위 콤마를 함께 표시한다.
      // (커서는 항상 끝으로 이동하지만, 가독성을 우선한다.)
      let digits = (target.value || '').replace(/[^0-9]/g, '');
      if (!digits) {
        target.value = '';
        return;
      }
      const n = Number(digits);
      if (!Number.isFinite(n)) {
        target.value = '';
        return;
      }
      const formatted = formatMoney(n);
      target.value = formatted;
      try {
        const len = formatted.length;
        target.setSelectionRange(len, len);
      } catch (e2) {
        // 일부 환경에서 setSelectionRange 미지원일 수 있으므로 무시
      }
    }
  });

  document.addEventListener('focusout', (e) => {
    const target = e.target;
    if (!target || !(target instanceof HTMLInputElement)) return;

    // 일반 숫자 입력
    if (target.type === 'number') {
      if (target.dataset.numberNormalize === 'off') return;
      normalizeNumberInputValue(target);
      return;
    }

    // 금액 입력(텍스트형)
    if (target.dataset.moneyInput === '1') {
      formatMoneyInputDisplay(target);
    }
  });

  // 금액 색상 자동 적용: data-amount-color="1" 가 붙은 요소만 대상으로 한다.
  // - 각 화면에서 렌더링 시 해당 속성만 붙이면 공통 규칙으로 색상이 적용된다.
  try {
    if (!window.__amountColorObserverInstalled) {
      window.__amountColorObserverInstalled = true;
      applyAmountColoring(document);
      const obs = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          (m.addedNodes || []).forEach((node) => {
            if (node instanceof Element) {
              applyAmountColoring(node);
            }
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  } catch (_) {
    // ignore
  }
}

