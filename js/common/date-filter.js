import { getQuickRange } from './util.js?v=app-20261010-5';
import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  positionModalBelowElement,
} from './ui-helpers.js?v=app-20261010-5';

// 공통 날짜 범위 필터(시작/끝 + 📅 빠른선택 모달 + 조회 버튼)
//
// options:
// - fromInputId, toInputId: date input id
// - quickBtnId: 📅 버튼 id
// - searchBtnId: 조회 버튼 id
// - modalId: 빠른선택 모달 overlay id
// - allBtnId: '모두' 버튼 id
// - closeBtnId: '닫기' 버튼 id
// - defaultRangeKey: getQuickRange 키(기본 thisMonth)
// - onApply: ({from, to, source}) => void
export function initDateFilter(options = {}) {
  const {
    fromInputId,
    toInputId,
    quickBtnId,
    searchBtnId,
    modalId,
    allBtnId,
    closeBtnId,
    defaultRangeKey = 'thisMonth',
    onApply,
  } = options;

  const fromInput = fromInputId ? document.getElementById(fromInputId) : null;
  const toInput = toInputId ? document.getElementById(toInputId) : null;
  const quickBtn = quickBtnId ? document.getElementById(quickBtnId) : null;
  const searchBtn = searchBtnId ? document.getElementById(searchBtnId) : null;
  const modal = modalId ? document.getElementById(modalId) : null;
  const allBtn = allBtnId ? document.getElementById(allBtnId) : null;
  const closeBtn = closeBtnId ? document.getElementById(closeBtnId) : null;

  if (!fromInput || !toInput) {
    return {
      setRange: () => {},
      getRange: () => ({ from: '', to: '' }),
    };
  }

  let escOff = null;

  function safeApply(from, to, source) {
    if (typeof onApply === 'function') {
      onApply({ from: from || '', to: to || '', source: source || '' });
    }
  }

  function getRange() {
    return {
      from: fromInput.value || '',
      to: toInput.value || '',
    };
  }

  function setRange(from, to, source) {
    fromInput.value = from || '';
    toInput.value = to || '';
    safeApply(fromInput.value || '', toInput.value || '', source);
  }

  function openQuick() {
    if (!modal) return;
    openModalOverlay(modal);
    if (quickBtn) positionModalBelowElement(modal, quickBtn, { offsetY: 4 });

    if (typeof escOff === 'function') escOff();
    escOff = registerModalEscClose(modal, closeQuick);
  }

  function closeQuick() {
    if (!modal) return;
    closeModalOverlay(modal);
    if (typeof escOff === 'function') {
      escOff();
      escOff = null;
    }
  }

  if (quickBtn && modal) {
    quickBtn.addEventListener('click', () => {
      openQuick();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      closeQuick();
    });
  }

  if (allBtn) {
    allBtn.addEventListener('click', () => {
      setRange('', '', 'quick:all');
      closeQuick();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const { from, to } = getRange();
      safeApply(from, to, 'search');
    });
  }

  if (modal) {
    const quickButtons = modal.querySelectorAll('.date-quick-btn');
    quickButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.range || defaultRangeKey;
        const range = getQuickRange(key);
        setRange(range.from || range.start || '', range.to || range.end || '', 'quick:' + key);
        closeQuick();
      });
    });
  }

  // 기본 범위 세팅
  try {
    const range = getQuickRange(defaultRangeKey);
    setRange(range.from || range.start || '', range.to || range.end || '', 'init:' + defaultRangeKey);
  } catch (_) {
    // ignore
  }

  return {
    setRange,
    getRange,
  };
}

