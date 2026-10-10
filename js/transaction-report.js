import {
  getTransactions,
  getCustomerGroups,
  getCustomers,
  getCustomerTypes,
  getItems,
  getCashflowTypes,
  getCashflowItems,
  getAllLedgerTx,
} from './db.js?v=ledger-load-20261010-1';
import { formatMoney, includesIgnoreCase, todayYMD, formatWeekdayLabel } from './common/util.js?v=ledger-load-20261010-1';
import { initDateFilter } from './common/date-filter.js?v=ledger-load-20261010-1';
import { openModalOverlay, closeModalOverlay, registerModalEscClose, applyAmountColoring, bindDblClickRowConfirm } from './common/ui-helpers.js?v=ledger-load-20261010-1';
import { bootstrapPageCommon } from './common/page-bootstrap.js?v=ledger-load-20261010-1';
import { getStoredJson, setStoredJson } from './common/storage.js?v=ledger-load-20261010-1';
import { installDbAutoRefresh } from './common/app-events.js?v=ledger-load-20261010-1';

bootstrapPageCommon({ page: 'transaction-report', todayYMD, formatWeekdayLabel });

const state = {
  mode: 'all', // all | sales | purchase | expense
  viewMode: 'byItem', // detail | bySupplier | byGroup | byItem | byMonth | byMonthLedger
  dateFrom: '',
  dateTo: '',
  supplierId: '',
  supplierIds: [], // 다중 선택(거래처)
  supplierType: '',
  supplierTypes: [], // 다중 선택(구분)
  supplierGroup: '',
  supplierGroups: [], // 다중 선택(분류)
  supplierQ: '',
  itemCode: '',
  itemCodes: [], // 다중 선택(품목)
  itemGroup: '',
  itemGroups: [], // 다중 선택(분류)
  q: '',
};

const REPORT_TYPE_GROUP_FILTER_STORAGE_KEY = 'hallapa.report.typeGroupFilter.v1';

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 200);
}

function loadStoredTypeGroupFilter() {
  const saved = getStoredJson(REPORT_TYPE_GROUP_FILTER_STORAGE_KEY, null);
  if (!saved || typeof saved !== 'object') return;

  const supplierTypes = normalizeStringArray(saved.supplierTypes);
  const supplierGroups = normalizeStringArray(saved.supplierGroups);
  const supplierType = String(saved.supplierType || '').trim();
  const supplierGroup = String(saved.supplierGroup || '').trim();

  // multi 우선
  state.supplierTypes = supplierTypes.length > 1 ? supplierTypes : [];
  state.supplierType = supplierTypes.length === 1 ? supplierTypes[0] : (supplierType || '');

  state.supplierGroups = supplierGroups.length > 1 ? supplierGroups : [];
  state.supplierGroup = supplierGroups.length === 1 ? supplierGroups[0] : (supplierGroup || '');

  // 구분이 1개로 명확할 때만 mode를 동기화(기존 commitSupplierPickerDraftAndQuery와 동일 정책)
  const pickedTypes = state.supplierTypes.length
    ? state.supplierTypes
    : (state.supplierType ? [state.supplierType] : []);
  if (pickedTypes.length === 1) {
    const t = String(pickedTypes[0] || '').trim();
    if (t === '매출처') state.mode = 'sales';
    else if (t === '매입처') state.mode = 'purchase';
    else if (t === '지출처') state.mode = 'expense';
    else state.mode = 'all';
  } else {
    state.mode = 'all';
  }
}

function saveStoredTypeGroupFilter() {
  setStoredJson(REPORT_TYPE_GROUP_FILTER_STORAGE_KEY, {
    supplierType: String(state.supplierType || '').trim(),
    supplierTypes: normalizeStringArray(state.supplierTypes),
    supplierGroup: String(state.supplierGroup || '').trim(),
    supplierGroups: normalizeStringArray(state.supplierGroups),
  });
}

// 초기 로드(화면 전환/렌더 전에 state에 반영)
loadStoredTypeGroupFilter();

// 금액은 소수점 없이 표시(반올림)
const fmt = (n) => formatMoney(Math.round(Number(n || 0)), 'ko-KR');
const fmtAbs = (n) => fmt(Math.abs(Number(n ?? 0) || 0));
const fmtQty = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  const hasDecimal = !Number.isInteger(num);
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: 2,
  });
};

// 감량수량은 항상 소수점 2자리 고정
const fmtQty2 = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtPct = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '';
  return (
    num.toLocaleString('ko-KR', {
      maximumFractionDigits: 2,
    }) + '%'
  );
};

function renderFoot(html) {
  if (!tableFoot) return;
  tableFoot.innerHTML = html;
}

const dateFromInput = document.getElementById('trn-date-from');
const dateToInput = document.getElementById('trn-date-to');
const btnDateQuick = document.getElementById('btn-trn-date-quick');
const btnDateSearch = document.getElementById('btn-trn-date-search');
const dateQuickModal = document.getElementById('trn-date-quick-modal');
const btnDateQuickAll = document.getElementById('btn-trn-date-quick-all');
const btnDateQuickClose = document.getElementById('btn-trn-date-quick-close');
// (deprecated) legacy select UI는 현재 HTML에 없음(버튼 기반 UI로 대체)
const modeSelect = null;
const viewModeSelect = null;
const viewModeButtons = document.querySelectorAll('.trn-view-mode-btn');
// (deprecated) legacy 거래처 필터 UI는 현재 HTML에 없음(피커 모달/숨김 select로 대체)
const supplierGroupSelect = null;
const supplierQInput = null;
const supplierSelect = document.getElementById('trn-supplier-select');
const supplierPickerOpenButton = document.getElementById('btn-trn-supplier-picker-open');
const supplierPickerWrap = document.getElementById('trn-supplier-picker-wrap');
const itemPickerOpenButton = document.getElementById('btn-trn-item-picker-open');
const itemPickerWrap = document.getElementById('trn-item-picker-wrap');
const typeGroupWrap = document.getElementById('trn-type-group-wrap');
const typeGroupPickerOpenButton = document.getElementById('btn-trn-type-group-picker-open');
const typeSelect = document.getElementById('trn-type-select');
const groupSelect = document.getElementById('trn-group-select');
const qInput = document.getElementById('trn-q');
// (deprecated) 수동 새로고침 버튼은 현재 HTML에 없음
const refreshButton = null;

// 거래처 선택 모달(3단 리스트)
const supplierPickerModal = document.getElementById('trn-supplier-picker-modal');
const supplierPickerTitle = document.getElementById('trn-supplier-picker-title');
const supplierPickerActionText = supplierPickerModal ? supplierPickerModal.querySelector('.table-action-text') : null;
const supplierPickerGroupBox = supplierPickerModal ? supplierPickerModal.querySelector('.payment-import-group-box') : null;
const supplierPickerCustomerBox = supplierPickerModal ? supplierPickerModal.querySelector('.payment-import-customer-box') : null;
const supplierPickerSearch = document.getElementById('trn-supplier-picker-search');
const btnSupplierPickerConfirm = document.getElementById('btn-trn-supplier-picker-confirm');
const btnSupplierPickerReset = document.getElementById('btn-trn-supplier-picker-reset');
const btnSupplierPickerClose = document.getElementById('btn-trn-supplier-picker-close');
const supplierPickerTypeListBody = document.getElementById('trn-supplier-picker-type-list');
const supplierPickerGroupListBody = document.getElementById('trn-supplier-picker-group-list');
const supplierPickerCustomerListBody = document.getElementById('trn-supplier-picker-customer-list');

// 품목 선택 모달(분류/품목 2단)
const itemPickerModal = document.getElementById('trn-item-picker-modal');
const itemPickerSearch = document.getElementById('trn-item-picker-search');
const itemPickerActionText = document.getElementById('trn-item-picker-action-text');
const btnItemPickerConfirm = document.getElementById('btn-trn-item-picker-confirm');
const btnItemPickerReset = document.getElementById('btn-trn-item-picker-reset');
const btnItemPickerClose = document.getElementById('btn-trn-item-picker-close');
const itemPickerGroupListBody = document.getElementById('trn-item-picker-group-list');
const itemPickerItemListBody = document.getElementById('trn-item-picker-item-list');

// (deprecated) 요약 표시 영역(trn-sum-*/trn-count)은 현재 HTML에 없음
const sumSalesSpan = null;
const sumExpenseSpan = null;
const sumProfitSpan = null;
const countSpan = null;

const tableHead = document.getElementById('trn-table-head');
const tableBody = document.getElementById('trn-table-body');
const tableFoot = document.getElementById('trn-table-foot');

let allTransactions = [];
let supplierMap = new Map(); // id -> {name, group}
let suppliers = [];
let itemInfoMap = new Map(); // itemId -> { code, name, group, spec, unit, avgPrice, shrinkPercent, shrinkPrice }
let isRefreshingTransactions = false;

let customerGroupMasters = [];
let supplierGroupCodeByKey = new Map(); // `${type}::${name}` -> code
let supplierGroupCodeByName = new Map(); // name -> code

let supplierPickerBalanceById = new Map();
let supplierPickerBalanceCacheKey = '';

let hasEnteredByGroupOnce = false;

let cashflowLedgerCacheKey = '';
let cashflowLedgerCache = null;

function isLedgerTypeCode(code) {
  return /^A\d{2}$/.test(String(code || '').trim());
}

function isLedgerItemCode(code) {
  return /^A\d{4}$/.test(String(code || '').trim());
}

function findTypeCodesByNameIncludes(nameByType, keyword) {
  const key = String(keyword || '').trim();
  if (!key || !nameByType || typeof nameByType.forEach !== 'function') return [];
  const out = [];
  nameByType.forEach((name, code) => {
    const n = String(name || '').trim();
    const c = String(code || '').trim();
    if (!c) return;
    if (n.includes(key)) out.push(c);
  });
  return out;
}

function uniqueCodes(codes) {
  const arr = Array.isArray(codes) ? codes.map((c) => String(c || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(arr));
}

function findBalanceSumByName(balanceByType, nameByType, keyword) {
  const key = String(keyword || '').trim();
  if (!key) return 0;
  let sum = 0;
  balanceByType.forEach((bal, code) => {
    const name = nameByType.get(String(code)) || '';
    if (String(name || '').includes(key)) {
      sum += Number(bal) || 0;
    }
  });
  return sum;
}

function sumBalancesByDisplayLabelIncludes(balanceByType, nameByType, keywords) {
  const list = Array.isArray(keywords)
    ? keywords.map((k) => String(k ?? '').trim()).filter(Boolean)
    : [];
  if (!list.length || !balanceByType || typeof balanceByType.forEach !== 'function') return 0;

  let sum = 0;
  balanceByType.forEach((bal, code) => {
    const codeKey = String(code ?? '').trim();
    if (!codeKey) return;
    const displayLabel = String((nameByType && typeof nameByType.get === 'function' ? nameByType.get(codeKey) : '') || codeKey).trim();
    if (!displayLabel) return;
    if (list.some((kw) => displayLabel.includes(kw))) {
      sum += Number(bal) || 0;
    }
  });
  return sum;
}

function getLedgerTxTypeCode(ltx, itemTypeByItemCode) {
  const accountId = String(ltx?.accountId || '').trim();
  const cashflowCode = String(ltx?.cashflowCode || '').trim();
  const cashflowItemCode = String(ltx?.cashflowItemCode || '').trim();

  if (isLedgerTypeCode(accountId)) return accountId;
  if (isLedgerTypeCode(cashflowCode)) return cashflowCode;

  const itemCode = isLedgerItemCode(cashflowItemCode)
    ? cashflowItemCode
    : isLedgerItemCode(accountId)
      ? accountId
      : isLedgerItemCode(cashflowCode)
        ? cashflowCode
        : '';

  if (itemCode && itemTypeByItemCode && itemTypeByItemCode.has(itemCode)) {
    return String(itemTypeByItemCode.get(itemCode) || '').trim();
  }
  return '';
}

function getMonthEndDate(monthKey) {
  const mk = String(monthKey || '').trim();
  if (!mk || mk.length < 7) return '';
  const y = Number(mk.slice(0, 4));
  const m = Number(mk.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !(m >= 1 && m <= 12)) return '';
  const d = new Date(y, m, 0).getDate();
  return `${mk}-${String(d).padStart(2, '0')}`;
}

async function ensureCashflowLedgerCache() {
  const nextKey = 'v1';
  if (cashflowLedgerCache && cashflowLedgerCacheKey === nextKey) return cashflowLedgerCache;

  let cashflowTypes = [];
  let cashflowItems = [];
  let ledgerAll = [];

  try {
    cashflowTypes = (await getCashflowTypes()) || [];
  } catch (_) {
    cashflowTypes = [];
  }
  try {
    cashflowItems = (await getCashflowItems()) || [];
  } catch (_) {
    cashflowItems = [];
  }
  try {
    ledgerAll = (await getAllLedgerTx()) || [];
  } catch (_) {
    ledgerAll = [];
  }

  const openingByType = new Map();
  (cashflowItems || []).forEach((it) => {
    const typeCode = it && it.typeCode ? String(it.typeCode).trim() : '';
    if (!typeCode) return;
    const opening = Number(it.openingBalance != null ? it.openingBalance : 0) || 0;
    openingByType.set(typeCode, (openingByType.get(typeCode) || 0) + opening);
  });

  const itemTypeByItemCode = new Map();
  (cashflowItems || []).forEach((it) => {
    const code = it && it.code != null ? String(it.code).trim() : '';
    const typeCode = it && it.typeCode ? String(it.typeCode).trim() : '';
    if (!code || !typeCode) return;
    itemTypeByItemCode.set(code, typeCode);
  });

  const nameByType = new Map();
  (cashflowTypes || []).forEach((t) => {
    const code = t && t.code != null ? String(t.code).trim() : '';
    if (!code) return;
    nameByType.set(code, String(t.name || '').trim());
  });

  const ledgerEntries = (ledgerAll || [])
    .map((tx) => {
      const date = String(tx?.date || '').trim();
      if (!date) return null;
      const amount = Number(tx?.amount || 0) || 0;
      if (!(amount > 0)) return null;
      const flow = String(tx?.flow || '').trim();
      const sign = flow === 'in' ? 1 : flow === 'out' ? -1 : 0;
      if (!sign) return null;
      const typeCode = getLedgerTxTypeCode(tx, itemTypeByItemCode);
      if (!typeCode) return null;
      return {
        date,
        month: getMonthKey(date),
        typeCode,
        delta: sign * amount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date), 'ko'));

  const allTypeCodes = new Set();
  openingByType.forEach((_, code) => allTypeCodes.add(String(code)));
  ledgerEntries.forEach((e) => allTypeCodes.add(String(e.typeCode)));
  nameByType.forEach((_, code) => allTypeCodes.add(String(code)));

  const monthDeltaByType = new Map();
  ledgerEntries.forEach((e) => {
    const mk = String(e.month || '').trim();
    const tc = String(e.typeCode || '').trim();
    if (!mk || !tc) return;
    if (!monthDeltaByType.has(mk)) monthDeltaByType.set(mk, new Map());
    const map = monthDeltaByType.get(mk);
    map.set(tc, (map.get(tc) || 0) + (Number(e.delta) || 0));
  });

  cashflowLedgerCache = {
    openingByType,
    nameByType,
    allTypeCodes,
    ledgerEntries,
    monthDeltaByType,
  };
  cashflowLedgerCacheKey = nextKey;
  return cashflowLedgerCache;
}

let supplierPickerTypes = [];
let supplierPickerGroups = [];
let supplierPickerFilterType = '';
let supplierPickerFilterGroup = '';
let supplierPickerModalEscOff = null;
let supplierPickerContext = 'full'; // 'full' | 'typeOnly' | 'typeGroup'
let supplierPickerDraftIds = new Set();
let supplierPickerDraftTypes = new Set();
let supplierPickerDraftGroupKeys = new Set();
let supplierPickerMultiEnabled = false;
let supplierPickerLastClickedId = '';
let supplierPickerLastClickedType = '';
let supplierPickerLastClickedGroupKey = '';

function setSingleSelectedRow(tbody, row) {
  if (!tbody) return;
  tbody.querySelectorAll('tr.selected').forEach((el) => el.classList.remove('selected'));
  if (row) row.classList.add('selected');
}

function updateSupplierPickerMultiButtonUI() {
  if (!btnSupplierPickerConfirm) return;
  // 다중선택 모드: primary(강조), 기본 모드: secondary(비강조)
  btnSupplierPickerConfirm.classList.remove('btn-primary', 'btn-secondary');
  btnSupplierPickerConfirm.classList.add(supplierPickerMultiEnabled ? 'btn-primary' : 'btn-secondary');
  btnSupplierPickerConfirm.setAttribute('aria-pressed', supplierPickerMultiEnabled ? 'true' : 'false');
  btnSupplierPickerConfirm.title = supplierPickerMultiEnabled
    ? '다중 선택 모드(켜짐)'
    : '다중 선택을 켜려면 클릭';
}

function isSupplierPickerGroupEnabled() {
  if (!supplierPickerMultiEnabled) return true;
  // 다중선택 모드: 구분이 정확히 1개일 때만 분류 선택 가능
  return supplierPickerDraftTypes instanceof Set && supplierPickerDraftTypes.size === 1;
}

function isSupplierPickerCustomerEnabled() {
  if (!supplierPickerMultiEnabled) return true;
  // 다중선택 모드: 구분 1개 + 분류 1개일 때만 거래처 선택 가능
  return (
    supplierPickerDraftTypes instanceof Set && supplierPickerDraftTypes.size === 1 &&
    supplierPickerDraftGroupKeys instanceof Set && supplierPickerDraftGroupKeys.size === 1
  );
}

function enforceSupplierPickerHierarchy() {
  if (!supplierPickerMultiEnabled) return;

  // 구분이 1개가 아니면 분류/거래처 선택은 불가 → draft 비움
  if (!(supplierPickerDraftTypes instanceof Set) || supplierPickerDraftTypes.size !== 1) {
    supplierPickerDraftGroupKeys = new Set();
    supplierPickerDraftIds = new Set();
    return;
  }

  // 구분 1개일 때, 현재 구분에 맞지 않는 분류 key는 제거
  const onlyType = Array.from(supplierPickerDraftTypes)[0] || '';
  if (supplierPickerDraftGroupKeys instanceof Set && supplierPickerDraftGroupKeys.size) {
    const next = new Set();
    supplierPickerDraftGroupKeys.forEach((k) => {
      const key = String(k || '').trim();
      if (!key) return;
      const type = key.split('::')[0] || '';
      if (type === onlyType) next.add(key);
    });
    supplierPickerDraftGroupKeys = next;
  }

  // 분류가 정확히 1개가 아니면 거래처 선택은 불가 → 거래처 draft 비움
  if (!(supplierPickerDraftGroupKeys instanceof Set) || supplierPickerDraftGroupKeys.size !== 1) {
    supplierPickerDraftIds = new Set();
  }
}

function updateSupplierPickerHierarchyUI() {
  // 비활성화(클릭 차단) UI
  if (supplierPickerGroupBox) {
    supplierPickerGroupBox.classList.toggle('picker-disabled', !isSupplierPickerGroupEnabled());
  }
  if (supplierPickerCustomerBox) {
    supplierPickerCustomerBox.classList.toggle('picker-disabled', !isSupplierPickerCustomerEnabled());
  }

  // 안내 문구(다중 모드일 때만)
  if (!supplierPickerActionText) return;
  if (!supplierPickerMultiEnabled) {
    supplierPickerActionText.textContent = '거래처를 선택하세요.';
    return;
  }

  const typeCount = supplierPickerDraftTypes instanceof Set ? supplierPickerDraftTypes.size : 0;
  const groupCount = supplierPickerDraftGroupKeys instanceof Set ? supplierPickerDraftGroupKeys.size : 0;

  if (typeCount === 0) {
    supplierPickerActionText.textContent = '다중 선택: 구분을 1개 선택하세요.';
    return;
  }
  if (typeCount >= 2) {
    supplierPickerActionText.textContent = '다중 선택: 구분이 2개 이상이면 분류/거래처를 선택할 수 없습니다.';
    return;
  }
  // typeCount === 1
  if (groupCount === 0) {
    supplierPickerActionText.textContent = '다중 선택: 분류를 선택하면 거래처를 선택할 수 있습니다. (분류 1개일 때만)';
    return;
  }
  if (groupCount >= 2) {
    supplierPickerActionText.textContent = '다중 선택: 분류가 2개 이상이면 거래처를 선택할 수 없습니다.';
    return;
  }
  supplierPickerActionText.textContent = '다중 선택: 거래처를 여러 개 선택할 수 있습니다.';
}

function commitSupplierPickerDraftAndQuery() {
  const ids = Array.from(supplierPickerDraftIds instanceof Set ? supplierPickerDraftIds : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

  const types = Array.from(supplierPickerDraftTypes instanceof Set ? supplierPickerDraftTypes : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

  const groupKeys = Array.from(supplierPickerDraftGroupKeys instanceof Set ? supplierPickerDraftGroupKeys : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const groups = Array.from(new Set(groupKeys.map((k) => k.split('::').slice(1).join('::')).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

  // 우선순위: 거래처(직접 선택) > 분류 > 구분
  if (ids.length) {
    state.supplierId = ids.length === 1 ? ids[0] : '';
    state.supplierIds = ids.length > 1 ? ids : [];
    state.supplierType = '';
    state.supplierTypes = [];
    state.supplierGroup = '';
    state.supplierGroups = [];
  } else if (groups.length) {
    state.supplierId = '';
    state.supplierIds = [];
    state.supplierGroup = groups.length === 1 ? groups[0] : '';
    state.supplierGroups = groups.length > 1 ? groups : [];
    state.supplierType = types.length === 1 ? types[0] : '';
    state.supplierTypes = types.length > 1 ? types : [];
  } else if (types.length) {
    state.supplierId = '';
    state.supplierIds = [];
    state.supplierType = types.length === 1 ? types[0] : '';
    state.supplierTypes = types.length > 1 ? types : [];
    state.supplierGroup = '';
    state.supplierGroups = [];
  } else {
    // 아무것도 선택하지 않으면 전체
    state.supplierId = '';
    state.supplierIds = [];
    state.supplierType = '';
    state.supplierTypes = [];
    state.supplierGroup = '';
    state.supplierGroups = [];
  }

  // 구분이 하나로 명확할 때만 mode 동기화(복수/없음이면 all)
  const pickedTypes = Array.isArray(state.supplierTypes) && state.supplierTypes.length
    ? state.supplierTypes
    : (state.supplierType ? [state.supplierType] : []);
  if (pickedTypes.length === 1) {
    const t = String(pickedTypes[0] || '').trim();
    if (t === '매출처') state.mode = 'sales';
    else if (t === '매입처') state.mode = 'purchase';
    else if (t === '지출처') state.mode = 'expense';
    else state.mode = 'all';
  } else {
    state.mode = 'all';
  }

  if (supplierSelect) supplierSelect.value = '';
  if (typeSelect) typeSelect.value = '';
  if (groupSelect) groupSelect.value = '';
  updateSupplierSelectedLabel();
  updateTypeGroupPickerButtonLabel();
  saveStoredTypeGroupFilter();
  render();
  closeSupplierPickerModal();
}

function keepOnlyOneInSet(setLike, preferred) {
  const set = setLike instanceof Set ? setLike : new Set();
  if (set.size <= 1) return set;
  const pick = preferred && set.has(preferred) ? preferred : Array.from(set)[0];
  return new Set(pick ? [pick] : []);
}

let itemPickerFilterGroup = '';
let itemPickerModalEscOff = null;
let itemPickerDraftCodes = new Set();
let itemPickerMultiEnabled = false;
let itemPickerLastClickedCode = '';
let itemPickerDraftGroups = new Set();
let itemPickerLastClickedGroup = '';

function getItemPickerItemBoxEl() {
  return itemPickerItemListBody?.closest('.table-box') || null;
}

function isItemPickerItemEnabled() {
  if (!itemPickerMultiEnabled) return true;
  // 거래처 피커와 동일 패턴: (다중모드에서) 상위 단계가 정확히 1개일 때만 하위 선택 가능
  return itemPickerDraftGroups instanceof Set && itemPickerDraftGroups.size === 1;
}

function enforceItemPickerHierarchy() {
  if (!itemPickerMultiEnabled) return;
  // 분류가 1개가 아니면 품목 선택 불가 → draft 비움
  if (!(itemPickerDraftGroups instanceof Set) || itemPickerDraftGroups.size !== 1) {
    itemPickerDraftCodes = new Set();
  }
}

function updateItemPickerHierarchyUI() {
  const itemBox = getItemPickerItemBoxEl();
  const enabled = isItemPickerItemEnabled();
  if (itemBox) itemBox.classList.toggle('picker-disabled', !enabled);

  if (itemPickerSearch) itemPickerSearch.disabled = !enabled;

  if (!itemPickerActionText) return;
  if (!itemPickerMultiEnabled) {
    itemPickerActionText.textContent = '품목을 선택하세요.';
    return;
  }

  if (!enabled) {
    itemPickerActionText.textContent = '다중 선택: 분류를 1개 선택하면 품목 선택이 가능합니다.';
    return;
  }
  itemPickerActionText.textContent = '다중 선택: 품목을 여러 개 선택할 수 있습니다.';
}

function updateItemPickerMultiButtonUI() {
  if (!btnItemPickerConfirm) return;
  btnItemPickerConfirm.classList.remove('btn-primary', 'btn-secondary');
  btnItemPickerConfirm.classList.add(itemPickerMultiEnabled ? 'btn-primary' : 'btn-secondary');
  btnItemPickerConfirm.setAttribute('aria-pressed', itemPickerMultiEnabled ? 'true' : 'false');
  btnItemPickerConfirm.title = itemPickerMultiEnabled
    ? '다중 선택 모드(켜짐)'
    : '다중 선택을 켜려면 클릭';
}

function commitItemPickerDraftAndQuery() {
  const codes = Array.from(itemPickerDraftCodes instanceof Set ? itemPickerDraftCodes : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'));
  const groupList = Array.from(itemPickerDraftGroups instanceof Set ? itemPickerDraftGroups : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'));

  // 우선순위: 품목(직접 선택) > 분류
  if (codes.length) {
    if (codes.length <= 1) {
      state.itemCode = codes[0] || '';
      state.itemCodes = [];
    } else {
      state.itemCode = '';
      state.itemCodes = codes;
    }
    state.itemGroup = '';
    state.itemGroups = [];
  } else if (groupList.length) {
    state.itemCode = '';
    state.itemCodes = [];
    state.itemGroup = groupList.length === 1 ? groupList[0] : '';
    state.itemGroups = groupList.length > 1 ? groupList : [];
  } else {
    state.itemGroup = '';
    state.itemGroups = [];
    state.itemCode = '';
    state.itemCodes = [];
  }

  updateItemPickerButtonLabel();
  render();
  closeItemPickerModal();
}

function updateTypeGroupPickerButtonLabel() {
  if (!typeGroupPickerOpenButton) return;
  const types = Array.isArray(state.supplierTypes) ? state.supplierTypes.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const groups = Array.isArray(state.supplierGroups) ? state.supplierGroups.map((v) => String(v || '').trim()).filter(Boolean) : [];

  if (types.length || groups.length) {
    const parts = [];
    if (types.length) parts.push(`구분 ${types.length}개`);
    if (groups.length) parts.push(`분류 ${groups.length}개`);
    typeGroupPickerOpenButton.textContent = parts.join(' / ');
    return;
  }

  const t = String(state.supplierType || '').trim();
  const g = String(state.supplierGroup || '').trim();
  if (t && g) typeGroupPickerOpenButton.textContent = `${t} / ${g}`;
  else if (t) typeGroupPickerOpenButton.textContent = t;
  else typeGroupPickerOpenButton.textContent = '구분/분류 선택';
}

function setSupplierPickerContext(next) {
  supplierPickerContext = next === 'typeOnly'
    ? 'typeOnly'
    : (next === 'typeGroup' ? 'typeGroup' : 'full');

  const isTypeOnly = supplierPickerContext === 'typeOnly';
  const isTypeGroup = supplierPickerContext === 'typeGroup';

  if (supplierPickerTitle) {
    supplierPickerTitle.textContent = isTypeOnly
      ? '구분 선택'
      : (isTypeGroup ? '구분/분류 선택' : '거래처 선택');
  }
  if (supplierPickerActionText) {
    supplierPickerActionText.textContent = isTypeOnly
      ? '구분을 선택하세요.'
      : (isTypeGroup ? '구분/분류를 선택하세요.' : '거래처를 선택하세요.');
  }

  if (supplierPickerSearch) {
    const hideSearch = isTypeOnly || isTypeGroup;
    supplierPickerSearch.style.display = hideSearch ? 'none' : '';
    if (hideSearch) supplierPickerSearch.value = '';
  }

  // typeOnly: 구분만
  // typeGroup: 구분+분류만
  if (supplierPickerGroupBox) supplierPickerGroupBox.style.display = isTypeOnly ? 'none' : '';
  if (supplierPickerCustomerBox) supplierPickerCustomerBox.style.display = (isTypeOnly || isTypeGroup) ? 'none' : '';
}

function filterByMode(tx) {
  // mode(매출/매입/지출/전체)는 현재 UI에서 byGroup(구분별 분류조회)에서만 의미가 있다.
  // 다른 탭에서는 숨은 상태값 때문에 0건이 되는 혼란을 막기 위해 적용하지 않는다.
  if (state.viewMode !== 'byGroup') return true;
  if (state.mode === 'all') return true;
  // category: 'sales' | 'purchase' | 'expense'
  return String(tx.category || '').toLowerCase() === state.mode;
}

function filterByDate(tx) {
  // 월별조회(byMonth)는 항상 '선택된 연도'의 1~12월 전체를 대상으로 한다.
  // - dateFrom/dateTo가 일부만 선택돼도 해당 연도의 01-01 ~ 12-31로 확장
  // - 값이 없으면 오늘 기준 연도
  if (state.viewMode === 'byMonth' || state.viewMode === 'byMonthLedger') {
    const seed = String(state.dateFrom || state.dateTo || todayYMD() || '').trim();
    const year = seed && seed.length >= 4 ? seed.slice(0, 4) : '';
    if (!year) return true;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    if (tx.date && tx.date < from) return false;
    if (tx.date && tx.date > to) return false;
    return true;
  }
  if (!state.dateFrom && !state.dateTo) return true;
  if (state.dateFrom && tx.date < state.dateFrom) return false;
  if (state.dateTo && tx.date > state.dateTo) return false;
  return true;
}

function filterBySupplierGroup(tx) {
  // 구분/분류 필터는 구분별(byGroup) + 거래처 기반(detail/bySupplier) 조회에서 의미가 있다.
  // (거래처 선택 모달에서 구분/분류만 선택하고 '조회'를 누르는 UX를 지원)
  if (!(state.viewMode === 'byGroup' || state.viewMode === 'detail' || state.viewMode === 'bySupplier')) return true;
  const groups = Array.isArray(state.supplierGroups) ? state.supplierGroups : [];
  const single = String(state.supplierGroup || '').trim();
  const selected = groups.length ? groups : (single ? [single] : []);
  if (!selected.length) return true;
  const g = String(getSupplierGroupName(tx) || '').trim();
  return selected.some((x) => String(x || '').trim() === g);
}

function filterBySupplierType(tx) {
  // 구분/분류 필터는 구분별(byGroup) + 거래처 기반(detail/bySupplier) 조회에서 의미가 있다.
  if (!(state.viewMode === 'byGroup' || state.viewMode === 'detail' || state.viewMode === 'bySupplier')) return true;
  const types = Array.isArray(state.supplierTypes) ? state.supplierTypes : [];
  const single = String(state.supplierType || '').trim();
  const selected = types.length ? types : (single ? [single] : []);
  if (!selected.length) return true;
  const t = String(getSupplierType(tx) || '').trim();
  return selected.some((x) => String(x || '').trim() === t);
}

function getMonthKey(dateStr) {
  const d = String(dateStr || '').trim();
  if (!d) return '';
  // YYYY-MM-DD -> YYYY-MM
  if (d.length >= 7) return d.slice(0, 7);
  return d;
}

function renderTableByMonth(list) {
  tableHead.innerHTML = `
    <tr>
      <th colspan="1">날짜</th>
      <th colspan="3">매출합계</th>
      <th colspan="3">매입합계</th>
      <th colspan="1">지출합계</th>
      <th colspan="1">차액</th>
    </tr>
    <tr>
      <th>월별</th>
      <th>매출</th>
      <th>수금</th>
      <th>미수금</th>
      <th>매입</th>
      <th>지불</th>
      <th>미지급금</th>
      <th>지출</th>
      <th>손익</th>
    </tr>
  `;

  const seed = String(state.dateFrom || state.dateTo || todayYMD() || '').trim();
  const year = seed && seed.length >= 4 ? seed.slice(0, 4) : '';
  const months = year
    ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    : [];

  function getMonthEndDate(monthKey) {
    const mk = String(monthKey || '').trim();
    if (!mk || mk.length < 7) return '';
    const y = Number(mk.slice(0, 4));
    const m = Number(mk.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !(m >= 1 && m <= 12)) return '';
    const d = new Date(y, m, 0).getDate();
    return `${mk}-${String(d).padStart(2, '0')}`;
  }

  // 홈 요약현황 규칙과 동일: 미수/미지급은 월말(누적) 잔액 기준
  const selectedSupplierIds = Array.isArray(state.supplierIds) && state.supplierIds.length
    ? state.supplierIds.map((v) => String(v || '').trim()).filter(Boolean)
    : (state.supplierId ? [String(state.supplierId || '').trim()].filter(Boolean) : []);
  const supplierIdSet = selectedSupplierIds.length ? new Set(selectedSupplierIds) : null;

  const selectedGroups = Array.isArray(state.supplierGroups) && state.supplierGroups.length
    ? state.supplierGroups
    : (state.supplierGroup ? [state.supplierGroup] : []);
  const groupSet = null; // byMonth: 요약현황 기준(구분/분류 필터 미적용)

  const selectedTypes = Array.isArray(state.supplierTypes) && state.supplierTypes.length
    ? state.supplierTypes
    : (state.supplierType ? [state.supplierType] : []);
  const typeSet = null; // byMonth: 요약현황 기준(구분/분류 필터 미적용)

  function isCustomerIncludedByTypeGroup(c) {
    if (!c) return false;
    const id = String(c.id || '').trim();
    if (!id) return false;
    if (supplierIdSet && !supplierIdSet.has(id)) return false;
    if (groupSet) {
      const g = String(c.group || '').trim();
      if (!groupSet.has(g)) return false;
    }
    if (typeSet) {
      const t = String(c.type || '').trim();
      if (!typeSet.has(t)) return false;
    }
    return true;
  }

  const salesCustomerIds = new Set(
    (suppliers || [])
      .filter((c) => isCustomerIncludedByTypeGroup(c) && String(c.type || '').includes('매출'))
      .map((c) => String(c.id || '').trim())
      .filter(Boolean)
  );

  const purchaseCustomerIds = new Set(
    (suppliers || [])
      .filter((c) => isCustomerIncludedByTypeGroup(c) && String(c.type || '').includes('매입'))
      .map((c) => String(c.id || '').trim())
      .filter(Boolean)
  );

  function resolveTxSupplierId(tx) {
    const direct = String(tx?.supplierId || '').trim();
    if (direct) return direct;
    const legacy = String(tx?.supplierName || '').trim();
    if (legacy && supplierMap && supplierMap.has(legacy)) return legacy;
    return '';
  }

  function shouldIncludeForBalance(tx) {
    // date는 여기서 cutoff로 제어
    return (
      filterByMode(tx) &&
      filterBySupplierId(tx) &&
      filterBySupplierType(tx) &&
      filterBySupplierGroup(tx) &&
      filterBySupplierQ(tx) &&
      filterByItemGroup(tx) &&
      filterByItem(tx) &&
      filterByQ(tx)
    );
  }

  // supplier별 누적 잔액 계산 준비 (월말 cut-off를 반복 적용)
  const salesTxBySupplier = new Map();
  const purchaseTxBySupplier = new Map();

  (allTransactions || []).forEach((tx) => {
    if (!tx || !tx.date) return;
    if (!shouldIncludeForBalance(tx)) return;

    const cat = String(tx.category || '').trim();
    if (cat !== 'sales' && cat !== 'purchase') return;

    const sid = resolveTxSupplierId(tx);
    if (!sid) return;

    if (cat === 'sales') {
      if (!salesCustomerIds.has(sid)) return;
      const prev = salesTxBySupplier.get(sid) || [];
      prev.push(tx);
      salesTxBySupplier.set(sid, prev);
      return;
    }

    if (cat === 'purchase') {
      if (!purchaseCustomerIds.has(sid)) return;
      const prev = purchaseTxBySupplier.get(sid) || [];
      prev.push(tx);
      purchaseTxBySupplier.set(sid, prev);
    }
  });

  // 날짜 오름차순 정렬
  Array.from(salesTxBySupplier.entries()).forEach(([id, arr]) => {
    arr.sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''), 'ko'));
    salesTxBySupplier.set(id, arr);
  });
  Array.from(purchaseTxBySupplier.entries()).forEach(([id, arr]) => {
    arr.sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''), 'ko'));
    purchaseTxBySupplier.set(id, arr);
  });

  const salesRunning = new Map();
  const salesIndex = new Map();
  salesCustomerIds.forEach((id) => {
    const opening = Number(supplierMap.get(id)?.openingBalance ?? 0) || 0;
    salesRunning.set(id, opening);
    salesIndex.set(id, 0);
  });

  const purchaseRunning = new Map();
  const purchaseIndex = new Map();
  purchaseCustomerIds.forEach((id) => {
    const opening = Number(supplierMap.get(id)?.openingBalance ?? 0) || 0;
    purchaseRunning.set(id, opening);
    purchaseIndex.set(id, 0);
  });

  const balanceByMonthKey = new Map();
  (months.length ? months : Array.from(groupBy(list, (tx) => getMonthKey(tx.date)).keys()).filter(Boolean))
    .slice()
    .sort((a, b) => String(a).localeCompare(String(b), 'ko'))
    .forEach((monthKey) => {
      const cutoff = getMonthEndDate(monthKey);
      if (!cutoff) {
        balanceByMonthKey.set(monthKey, { ar: 0, ap: 0 });
        return;
      }

      salesCustomerIds.forEach((id) => {
        const arr = salesTxBySupplier.get(id) || [];
        let idx = Number(salesIndex.get(id) || 0) || 0;
        let running = Number(salesRunning.get(id) || 0) || 0;
        while (idx < arr.length) {
          const t = arr[idx];
          const d = String(t?.date || '');
          if (!d || d > cutoff) break;
          const a = Number(t?.amount) || 0;
          const p = Number(t?.payment || 0) || 0;
          running += a;
          running -= p;
          idx += 1;
        }
        salesIndex.set(id, idx);
        salesRunning.set(id, running);
      });

      purchaseCustomerIds.forEach((id) => {
        const arr = purchaseTxBySupplier.get(id) || [];
        let idx = Number(purchaseIndex.get(id) || 0) || 0;
        let running = Number(purchaseRunning.get(id) || 0) || 0;
        while (idx < arr.length) {
          const t = arr[idx];
          const d = String(t?.date || '');
          if (!d || d > cutoff) break;
          const a = Number(t?.amount) || 0;
          const p = Number(t?.payment || 0) || 0;
          // 매입 화면 규칙: 잔액 = 기초 - 매입합계 + 지불합계
          running -= a;
          running += p;
          idx += 1;
        }
        purchaseIndex.set(id, idx);
        purchaseRunning.set(id, running);
      });

      let ar = 0;
      salesCustomerIds.forEach((id) => {
        const v = Number(salesRunning.get(id) || 0) || 0;
        if (v > 0) ar += v;
      });

      let ap = 0;
      purchaseCustomerIds.forEach((id) => {
        const v = Number(purchaseRunning.get(id) || 0) || 0;
        if (v < 0) ap += Math.abs(v);
      });

      balanceByMonthKey.set(monthKey, { ar, ap });
    });

  const grouped = groupBy(list, (tx) => getMonthKey(tx.date));
  const pairs = months.length
    ? months.map((m) => [m, grouped.get(m) || []])
    : Array.from(grouped.entries()).filter(([key]) => key);

  const rows = pairs
    .map(([key, arr]) => {
      let salesAmount = 0;
      let receipt = 0;
      let receiptAsSales = 0;
      let purchase = 0;
      let pay = 0;
      let expense = 0;
      const hasData = Array.isArray(arr) && arr.length > 0;
      const cashSaleGroups = new Set(['매장', '온라인']);

      arr.forEach((tx) => {
        const cat = String(tx.category || '').trim();
        const amount = Number(tx.amount || 0) || 0;
        const payment = Number(tx.payment || 0) || 0;

        if (cat === 'sales') {
          // 홈 요약현황과 동일
          if (amount) salesAmount += amount;
          if (payment > 0) receipt += payment;

          // 매장/온라인 payment-only는 매출로 추가 집계
          if (payment > 0 && !(amount > 0)) {
            const g = String(getSupplierGroupName(tx) || '').trim();
            if (cashSaleGroups.has(g)) receiptAsSales += payment;
          }
        } else if (cat === 'purchase') {
          if (amount > 0) purchase += amount;
          if (payment > 0) pay += payment;
        } else if (cat === 'expense') {
          // 지출 화면/통합결제 연동은 payment 중심(지출 전표 amount=0, payment>0)이 많다.
          if (payment > 0) expense += payment;
          else if (amount > 0) expense += amount;
        }
      });

      const sales = salesAmount + receiptAsSales;
      const salesOutstanding = hasData
        ? (Number(balanceByMonthKey.get(String(key || '').trim())?.ar || 0) || 0)
        : 0;
      const purchaseOutstanding = hasData
        ? (Number(balanceByMonthKey.get(String(key || '').trim())?.ap || 0) || 0)
        : 0;
      const profit = sales - (purchase + expense);

      return {
        month: String(key || '').trim(),
        hasData,
        sales,
        salesPay: receipt,
        salesOutstanding,
        purchase,
        purchasePay: pay,
        purchaseOutstanding,
        expense,
        profit,
      };
    })
    .sort((a, b) => String(a.month).localeCompare(String(b.month), 'ko'));

  // "기록이 없는 달"(거래 0건)은 숨김
  const visibleRows = rows.filter((r) => r && r.hasData);
  if (!visibleRows.length) {
    tableBody.innerHTML = '<tr><td colspan="9">데이터가 없습니다.</td></tr>';
    renderFoot('');
    return;
  }

  const totalSales = visibleRows.reduce((acc, r) => acc + (Number(r.sales) || 0), 0);
  const totalSalesPay = visibleRows.reduce((acc, r) => acc + (Number(r.salesPay) || 0), 0);
  const lastWithData = visibleRows.slice().reverse().find((r) => r && r.hasData);
  const totalSalesOutstanding = lastWithData ? (Number(lastWithData.salesOutstanding) || 0) : 0;
  const totalPurchase = visibleRows.reduce((acc, r) => acc + (Number(r.purchase) || 0), 0);
  const totalPurchasePay = visibleRows.reduce((acc, r) => acc + (Number(r.purchasePay) || 0), 0);
  const totalPurchaseOutstanding = lastWithData ? (Number(lastWithData.purchaseOutstanding) || 0) : 0;
  const totalExpense = visibleRows.reduce((acc, r) => acc + (Number(r.expense) || 0), 0);
  const totalProfit = visibleRows.reduce((acc, r) => acc + (Number(r.profit) || 0), 0);

  renderFoot(`
    <tr>
      <td class="total-cell-label">Count=&nbsp;${visibleRows.length}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSales}">${fmt(totalSales)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSalesPay}">${fmt(totalSalesPay)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSalesOutstanding}">${fmt(totalSalesOutstanding)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchase}">${fmtAbs(totalPurchase)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchasePay}">${fmtAbs(totalPurchasePay)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchaseOutstanding}">${fmtAbs(totalPurchaseOutstanding)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalExpense}">${fmtAbs(totalExpense)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalProfit}">${fmt(totalProfit)}</td>
    </tr>
  `);

  const rowsHtml = visibleRows
    .map((row) => `
      <tr>
        <td>${row.month || ''}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.sales}">${fmt(row.sales)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesPay}">${fmt(row.salesPay)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesOutstanding}">${fmt(row.salesOutstanding)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchase}">${fmtAbs(row.purchase)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchasePay}">${fmtAbs(row.purchasePay)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchaseOutstanding}">${fmtAbs(row.purchaseOutstanding)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.expense}">${fmtAbs(row.expense)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.profit}">${fmt(row.profit)}</td>
      </tr>
    `)
    .join('');

  tableBody.innerHTML = rowsHtml || '<tr><td colspan="9">데이터가 없습니다.</td></tr>';
}

async function renderTableByMonthLedger() {
  const seed = String(state.dateFrom || state.dateTo || todayYMD() || '').trim();
  const year = seed && seed.length >= 4 ? seed.slice(0, 4) : '';
  const months = year
    ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    : [];

  tableHead.innerHTML = `
    <tr>
      <th colspan="1">날짜</th>
      <th colspan="6">장부현황(월말 잔액)</th>
      <th colspan="1">손익변동</th>
      <th colspan="1">회사자금</th>
    </tr>
    <tr>
      <th>월별</th>
      <th>법인통장</th>
      <th>현금</th>
      <th>신용카드</th>
      <th>적금</th>
      <th>채권금액</th>
      <th>카드미수금</th>
      <th>손익변동</th>
      <th>회사자금</th>
    </tr>
  `;

  if (!months.length) {
    tableBody.innerHTML = '<tr><td colspan="9">데이터가 없습니다.</td></tr>';
    renderFoot('');
    return;
  }

  // 회사자금에 포함되는 거래처 미수/미지급(월말 누적)
  const salesCustomers = (suppliers || []).filter((c) => String(c?.type || '').includes('매출'));
  const purchaseCustomers = (suppliers || []).filter((c) => String(c?.type || '').includes('매입'));

  function resolveTxSupplierId(tx) {
    const direct = String(tx?.supplierId || '').trim();
    if (direct) return direct;
    const legacy = String(tx?.supplierName || '').trim();
    if (legacy && supplierMap && supplierMap.has(legacy)) return legacy;
    return '';
  }

  const salesTxBySupplier = new Map();
  const purchaseTxBySupplier = new Map();
  (allTransactions || []).forEach((tx) => {
    const date = String(tx?.date || '').trim();
    if (!date) return;
    const cat = String(tx?.category || '').trim();
    if (cat !== 'sales' && cat !== 'purchase') return;
    const sid = resolveTxSupplierId(tx);
    if (!sid) return;
    if (cat === 'sales') {
      const prev = salesTxBySupplier.get(sid) || [];
      prev.push(tx);
      salesTxBySupplier.set(sid, prev);
      return;
    }
    const prev = purchaseTxBySupplier.get(sid) || [];
    prev.push(tx);
    purchaseTxBySupplier.set(sid, prev);
  });

  Array.from(salesTxBySupplier.entries()).forEach(([id, arr]) => {
    arr.sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''), 'ko'));
    salesTxBySupplier.set(id, arr);
  });
  Array.from(purchaseTxBySupplier.entries()).forEach(([id, arr]) => {
    arr.sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''), 'ko'));
    purchaseTxBySupplier.set(id, arr);
  });

  const salesRunning = new Map();
  const salesIndex = new Map();
  (salesCustomers || []).forEach((c) => {
    const id = String(c?.id || '').trim();
    if (!id) return;
    const opening = Number(c?.openingBalance ?? 0) || 0;
    salesRunning.set(id, opening);
    salesIndex.set(id, 0);
  });

  const purchaseRunning = new Map();
  const purchaseIndex = new Map();
  (purchaseCustomers || []).forEach((c) => {
    const id = String(c?.id || '').trim();
    if (!id) return;
    const opening = Number(c?.openingBalance ?? 0) || 0;
    purchaseRunning.set(id, opening);
    purchaseIndex.set(id, 0);
  });

  function computeArApAsOf(cutoff) {
    let ar = 0;
    let apAbs = 0;

    (salesCustomers || []).forEach((c) => {
      const id = String(c?.id || '').trim();
      if (!id) return;
      const arr = salesTxBySupplier.get(id) || [];
      let idx = Number(salesIndex.get(id) || 0) || 0;
      let running = Number(salesRunning.get(id) || 0) || 0;
      while (idx < arr.length) {
        const t = arr[idx];
        const d = String(t?.date || '').trim();
        if (!d || d > cutoff) break;
        const a = Number(t?.amount) || 0;
        const p = Number(t?.payment || 0) || 0;
        running += a;
        running -= p;
        idx += 1;
      }
      salesIndex.set(id, idx);
      salesRunning.set(id, running);
      if (running > 0) ar += running;
    });

    (purchaseCustomers || []).forEach((c) => {
      const id = String(c?.id || '').trim();
      if (!id) return;
      const arr = purchaseTxBySupplier.get(id) || [];
      let idx = Number(purchaseIndex.get(id) || 0) || 0;
      let running = Number(purchaseRunning.get(id) || 0) || 0;
      while (idx < arr.length) {
        const t = arr[idx];
        const d = String(t?.date || '').trim();
        if (!d || d > cutoff) break;
        const a = Number(t?.amount) || 0;
        const p = Number(t?.payment || 0) || 0;
        running -= a;
        running += p;
        idx += 1;
      }
      purchaseIndex.set(id, idx);
      purchaseRunning.set(id, running);
      if (running < 0) apAbs += Math.abs(running);
    });

    return { ar, apAbs };
  }

  const cache = await ensureCashflowLedgerCache();
  const { openingByType, nameByType, allTypeCodes, ledgerEntries, monthDeltaByType } = cache;

  // "기록이 없는 달"은 행 자체를 숨김
  // - 거래 전표(매출/매입/지출)가 1건이라도 있거나
  // - 원장(ledger) 변동이 1건이라도 있는 달만 표시
  const txGroupedByMonth = groupBy(allTransactions || [], (tx) => getMonthKey(tx?.date));
  const hasLedgerDeltaByMonth = new Map();
  (monthDeltaByType || new Map()).forEach((m, mk) => {
    let hasDelta = false;
    if (m && typeof m.forEach === 'function') {
      m.forEach((v) => {
        if (!hasDelta && (Number(v) || 0) !== 0) hasDelta = true;
      });
    }
    hasLedgerDeltaByMonth.set(String(mk || '').trim(), hasDelta);
  });
  const hasAnyRecord = (mk) => {
    const key = String(mk || '').trim();
    if (!key) return false;
    const txArr = txGroupedByMonth.get(key);
    if (Array.isArray(txArr) && txArr.length) return true;
    return Boolean(hasLedgerDeltaByMonth.get(key));
  };

  const bankTypeCodes = new Set(uniqueCodes(findTypeCodesByNameIncludes(nameByType, '통장')));
  const cashTypeCodes = new Set(uniqueCodes(findTypeCodesByNameIncludes(nameByType, '현금')));
  const creditTypeCodes = new Set(uniqueCodes(findTypeCodesByNameIncludes(nameByType, '신용카드')));

  let ledgerIdx = 0;
  const runningDeltaByType = new Map();

  function buildBalanceByType() {
    const out = new Map();
    allTypeCodes.forEach((code) => {
      const opening = Number(openingByType.get(code) || 0) || 0;
      const delta = Number(runningDeltaByType.get(code) || 0) || 0;
      out.set(code, opening + delta);
    });
    return out;
  }

  const rows = months.map((mk) => {
    const cutoff = getMonthEndDate(mk);
    while (ledgerIdx < ledgerEntries.length) {
      const e = ledgerEntries[ledgerIdx];
      const d = String(e?.date || '').trim();
      if (!d || d > cutoff) break;
      const tc = String(e?.typeCode || '').trim();
      if (tc) runningDeltaByType.set(tc, (runningDeltaByType.get(tc) || 0) + (Number(e?.delta) || 0));
      ledgerIdx += 1;
    }

    const balanceByType = buildBalanceByType();

    const bankBalance = findBalanceSumByName(balanceByType, nameByType, '통장');
    const cashBalance = findBalanceSumByName(balanceByType, nameByType, '현금');
    const creditCardBalance = findBalanceSumByName(balanceByType, nameByType, '신용카드');
    const savingsBalance = findBalanceSumByName(balanceByType, nameByType, '적금');
    const cardReceivableBalance = findBalanceSumByName(balanceByType, nameByType, '카드미수금');
    const bondBalance = sumBalancesByDisplayLabelIncludes(balanceByType, nameByType, ['채권금액', '채권', '체권금액', '체권']);

    const monthMap = monthDeltaByType.get(mk) || new Map();
    let profitDelta = 0;
    monthMap.forEach((delta, tc) => {
      const code = String(tc || '').trim();
      if (!code) return;
      if (bankTypeCodes.has(code) || cashTypeCodes.has(code) || creditTypeCodes.has(code)) {
        profitDelta += Number(delta) || 0;
      }
    });

    const { ar, apAbs } = computeArApAsOf(cutoff);
    const payableSigned = -(Number(apAbs) || 0);
    const cashAndBank = (Number(bankBalance) || 0) + (Number(cashBalance) || 0);
    const companyFunds =
      cashAndBank +
      (Number(bondBalance) || 0) +
      (Number(savingsBalance) || 0) +
      (Number(creditCardBalance) || 0) +
      (Number(cardReceivableBalance) || 0) +
      (Number(ar) || 0) +
      payableSigned;

    return {
      month: mk,
      bankBalance,
      cashBalance,
      creditCardBalance,
      savingsBalance,
      bondBalance,
      cardReceivableBalance,
      profitDelta,
      companyFunds,
    };
  });

  const visibleRows = rows.filter((r) => r && hasAnyRecord(r.month));
  if (!visibleRows.length) {
    tableBody.innerHTML = '<tr><td colspan="9">데이터가 없습니다.</td></tr>';
    renderFoot('');
    return;
  }

  const totalProfitDelta = visibleRows.reduce((acc, r) => acc + (Number(r.profitDelta) || 0), 0);
  const lastRow = visibleRows.length ? visibleRows[visibleRows.length - 1] : null;

  renderFoot(`
    <tr>
      <td class="total-cell-label">Count=&nbsp;${visibleRows.length}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.bankBalance : 0}">${fmt(lastRow ? lastRow.bankBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.cashBalance : 0}">${fmt(lastRow ? lastRow.cashBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.creditCardBalance : 0}">${fmt(lastRow ? lastRow.creditCardBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.savingsBalance : 0}">${fmt(lastRow ? lastRow.savingsBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.bondBalance : 0}">${fmt(lastRow ? lastRow.bondBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.cardReceivableBalance : 0}">${fmt(lastRow ? lastRow.cardReceivableBalance : 0)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalProfitDelta}">${fmt(totalProfitDelta)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${lastRow ? lastRow.companyFunds : 0}">${fmt(lastRow ? lastRow.companyFunds : 0)}</td>
    </tr>
  `);

  tableBody.innerHTML = visibleRows
    .map((r) => `
      <tr>
        <td>${r.month}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.bankBalance}">${fmt(r.bankBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.cashBalance}">${fmt(r.cashBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.creditCardBalance}">${fmt(r.creditCardBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.savingsBalance}">${fmt(r.savingsBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.bondBalance}">${fmt(r.bondBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.cardReceivableBalance}">${fmt(r.cardReceivableBalance)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.profitDelta}">${fmt(r.profitDelta)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${r.companyFunds}">${fmt(r.companyFunds)}</td>
      </tr>
    `)
    .join('') || '<tr><td colspan="9">데이터가 없습니다.</td></tr>';

  applyAmountColoring(document);
}

function filterBySupplierId(tx) {
  if (state.viewMode === 'byGroup') return true;
  const ids = Array.isArray(state.supplierIds) ? state.supplierIds : [];
  const single = String(state.supplierId || '').trim();
  const selectedIds = ids.length ? ids : (single ? [single] : []);
  if (!selectedIds.length) return true;

  const txSupplierId = String(tx.supplierId || '').trim();
  const txSupplierName = String(tx.supplierName || '').trim();

  for (const id of selectedIds) {
    const sid = String(id || '').trim();
    if (!sid) continue;
    if (txSupplierId && txSupplierId === sid) return true;

    // 레거시: supplierId 없이 supplierName에 코드가 들어간 경우
    if (!txSupplierId && txSupplierName && txSupplierName === sid) return true;

    const selectedName = supplierMap.get(sid)?.name || '';
    if (selectedName && txSupplierName === String(selectedName)) return true;
  }

  return false;
}

function filterByItem(tx) {
  const codes = Array.isArray(state.itemCodes) ? state.itemCodes : [];
  const single = String(state.itemCode || '').trim();
  const selectedCodes = codes.length ? codes : (single ? [single] : []);
  if (!selectedCodes.length) return true;

  const itemKey = String(tx.itemCode || tx.itemId || '').trim();
  const name = String(tx.itemName || '').trim();

  for (const code of selectedCodes) {
    const c = String(code || '').trim();
    if (!c) continue;

    if (itemKey) {
      if (itemKey === c) return true;
      continue;
    }

    // 레거시: itemCode가 없고 itemName만 있는 경우(마스터 매칭)
    const info = itemInfoMap.get(c);
    if (name && info?.name && name === String(info.name || '').trim()) return true;
  }

  return false;
}

function filterByItemGroup(tx) {
  const groups = Array.isArray(state.itemGroups) ? state.itemGroups : [];
  const single = String(state.itemGroup || '').trim();
  const selectedGroups = groups.length ? groups : (single ? [single] : []);
  if (!selectedGroups.length) return true;

  const itemKey = String(tx.itemCode || tx.itemId || '').trim();
  const info = itemKey ? itemInfoMap.get(itemKey) : null;
  const g = String(info?.group || '').trim();
  if (g) return selectedGroups.some((x) => String(x || '').trim() === g);

  // itemCode가 없거나 마스터 매칭이 안 되는 경우는 제외(정확도를 우선)
  return false;
}

function filterBySupplierQ(tx) {
  const q = state.supplierQ.trim();
  if (!q) return true;
  return includesIgnoreCase(tx.supplierName, q);
}
function filterByQ(tx) {
  const q = state.q.trim();
  if (!q) return true;

  const itemKey = String(tx.itemCode || '').trim();
  const info = itemKey ? itemInfoMap.get(itemKey) : null;
  const masterName = info?.name || '';
  const masterGroup = info?.group || '';

  const supplierId = String(tx.supplierId || '').trim();
  const supplierType = String(getSupplierType(tx) || '').trim();
  const supplierGroupName = String(getSupplierGroupName(tx) || '').trim();
  const supplierGroupCode =
    supplierGroupCodeByKey.get(`${supplierType}::${supplierGroupName}`) ||
    supplierGroupCodeByName.get(supplierGroupName) ||
    '';

  const haystacks = [
    supplierId,
    tx.supplierName,
    supplierGroupName,
    supplierGroupCode,
    tx.memo,
    tx.itemName,
    masterName,
    masterGroup,
    itemKey,
  ];

  // 공백으로 여러 단어를 입력하면 AND 조건으로 필터링
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    const t = tokens[0] || q;
    return haystacks.some((h) => includesIgnoreCase(h, t));
  }
  return tokens.every((t) => haystacks.some((h) => includesIgnoreCase(h, t)));
}

function getFiltered() {
  return allTransactions.filter((tx) =>
    filterByMode(tx) &&
    filterByDate(tx) &&
    filterBySupplierId(tx) &&
    filterBySupplierType(tx) &&
    filterBySupplierGroup(tx) &&
    filterBySupplierQ(tx) &&
    filterByItemGroup(tx) &&
    filterByItem(tx) &&
    filterByQ(tx)
  );
}

function getSupplierType(tx) {
  // 보고서에서는 transactions.category가 “거래 성격”의 1차 기준이다.
  // (거래처 마스터의 구분은 나중에 변경될 수 있어 과거 전표 분류가 뒤섞일 수 있음)
  const cat = String(tx.category || '').trim().toLowerCase();
  if (cat === 'sales') return '매출처';
  if (cat === 'purchase') return '매입처';
  if (cat === 'expense') return '지출처';

  const id = String(tx.supplierId || '').trim();
  if (id) {
    const t = supplierMap.get(id)?.type || '';
    if (t) return t;
  }

  const legacyId = !id && tx.supplierName && supplierMap.has(String(tx.supplierName))
    ? String(tx.supplierName)
    : '';
  if (legacyId) {
    const t = supplierMap.get(legacyId)?.type || '';
    if (t) return t;
  }

  return '';
}

function getSupplierGroupName(tx) {
  // 레거시/다른 화면에서 저장된 필드까지 폭넓게 지원
  const direct = String(
    tx?.supplierGroup ||
    tx?.supplierGroupName ||
    tx?.group ||
    ''
  ).trim();
  if (direct) return direct;
  const id = String(tx.supplierId || '').trim();
  if (id) return String(supplierMap.get(id)?.group || '').trim();
  const legacyId = tx.supplierName && supplierMap.has(String(tx.supplierName))
    ? String(tx.supplierName)
    : '';
  if (legacyId) return String(supplierMap.get(legacyId)?.group || '').trim();
  return '';
}

function updateLeftFilterUI() {
  const isByGroup = state.viewMode === 'byGroup';
  const isByItem = state.viewMode === 'byItem';

  if (itemPickerWrap) {
    itemPickerWrap.style.display = isByItem ? '' : 'none';
  }

  if (supplierPickerWrap) {
    supplierPickerWrap.style.display = (isByGroup || isByItem) ? 'none' : '';
  }
  // fallback: 래퍼가 없는 경우에도 버튼을 직접 숨긴다.
  if (!supplierPickerWrap && supplierPickerOpenButton) {
    supplierPickerOpenButton.style.display = (isByGroup || isByItem) ? 'none' : '';
  }

  if (typeGroupWrap) {
    typeGroupWrap.style.display = isByGroup ? 'inline-flex' : 'none';
  }

  updateTypeGroupPickerButtonLabel();
  updateItemPickerButtonLabel();
}

function updateItemPickerButtonLabel() {
  if (!itemPickerOpenButton) return;
  const codes = Array.isArray(state.itemCodes) ? state.itemCodes.filter(Boolean) : [];
  if (codes.length > 1) {
    itemPickerOpenButton.textContent = `품목 ${codes.length}개 선택`;
    return;
  }
  if (codes.length === 1) {
    const code = String(codes[0] || '').trim();
    const info = code ? itemInfoMap.get(code) : null;
    const name = String(info?.name || '').trim();
    itemPickerOpenButton.textContent = name ? name : (code || '품목 선택');
    return;
  }

  const groups = Array.isArray(state.itemGroups)
    ? state.itemGroups.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  if (groups.length > 1) {
    itemPickerOpenButton.textContent = `분류 ${groups.length}개 선택`;
    return;
  }
  if (groups.length === 1) {
    itemPickerOpenButton.textContent = groups[0] || '품목 선택';
    return;
  }

  const group = String(state.itemGroup || '').trim();
  const code = String(state.itemCode || '').trim();
  if (!code && group) {
    itemPickerOpenButton.textContent = group;
    return;
  }
  if (!code) {
    itemPickerOpenButton.textContent = '품목 선택';
    return;
  }
  const info = itemInfoMap.get(code);
  const name = String(info?.name || '').trim();
  itemPickerOpenButton.textContent = name ? name : code;
}

function renderItemPickerGroupList() {
  if (!itemPickerGroupListBody) return;
  const groups = new Set();
  itemInfoMap.forEach((info) => {
    const g = String(info.group || '').trim();
    if (g) groups.add(g);
  });

  const list = Array.from(groups).sort((a, b) => String(a).localeCompare(String(b), 'ko'));
  const selectedGroups = itemPickerDraftGroups instanceof Set ? itemPickerDraftGroups : new Set();

  itemPickerGroupListBody.innerHTML = list
    .map((g) => {
      const label = g;
      const active = selectedGroups.has(g);
      return `
        <tr data-group="${g}" class="${active ? 'selected' : ''}">
          <td>${label}</td>
        </tr>
      `;
    })
    .join('');
}

function renderItemPickerItemList() {
  if (!itemPickerItemListBody) return;
  const q = String(itemPickerSearch?.value || '').trim().toLowerCase();
  const selectedGroups = itemPickerDraftGroups instanceof Set ? itemPickerDraftGroups : new Set();
  const groupFilterOn = selectedGroups.size > 0;
  const selectedCodes = itemPickerDraftCodes instanceof Set ? itemPickerDraftCodes : new Set();

  const items = [];
  itemInfoMap.forEach((info, code) => {
    const id = String(code || '').trim();
    if (!id) return;
    const g = String(info.group || '').trim();
    if (groupFilterOn && !selectedGroups.has(g)) return;
    const name = String(info.name || '').trim();
    const label = name;
    if (q) {
      const hay = `${id} ${name} ${g}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    items.push({ id, label });
  });

  items.sort((a, b) => String(a.label).localeCompare(String(b.label), 'ko'));

  itemPickerItemListBody.innerHTML = items
    .map((it) => {
      const active = selectedCodes.has(it.id);
      return `
        <tr data-id="${it.id}" class="${active ? 'selected' : ''}">
          <td class="col-name">${it.label || it.id}</td>
        </tr>
      `;
    })
    .join('');
}

function closeItemPickerModal() {
  closeModalOverlay(itemPickerModal);
  itemPickerDraftCodes = new Set();
  itemPickerDraftGroups = new Set();
  itemPickerMultiEnabled = false;
  updateItemPickerMultiButtonUI();
  updateItemPickerHierarchyUI();
  if (itemPickerModalEscOff) {
    itemPickerModalEscOff();
    itemPickerModalEscOff = null;
  }
}

function openItemPickerModal() {
  if (!itemPickerModal) return;
  const committedGroups = Array.isArray(state.itemGroups)
    ? state.itemGroups.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  itemPickerFilterGroup = committedGroups.length === 1
    ? committedGroups[0]
    : String(state.itemGroup || '').trim();

  if (committedGroups.length) itemPickerDraftGroups = new Set(committedGroups);
  else if (itemPickerFilterGroup) itemPickerDraftGroups = new Set([itemPickerFilterGroup]);
  else itemPickerDraftGroups = new Set();

  const committed = Array.isArray(state.itemCodes) ? state.itemCodes : [];
  const seed = committed.length
    ? committed
    : (state.itemCode ? [state.itemCode] : []);
  itemPickerDraftCodes = new Set(seed.map((v) => String(v || '').trim()).filter(Boolean));
  itemPickerMultiEnabled = false;
  updateItemPickerMultiButtonUI();
  updateItemPickerHierarchyUI();
  if (itemPickerSearch) itemPickerSearch.value = '';
  renderItemPickerGroupList();
  renderItemPickerItemList();
  openModalOverlay(itemPickerModal);
  itemPickerModalEscOff = registerModalEscClose(itemPickerModal, closeItemPickerModal);
  if (itemPickerSearch) itemPickerSearch.focus();
}

function renderTypeSelectOptions() {
  if (!typeSelect) return;
  const list = (supplierPickerTypes || []).slice();
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

  const options = ['<option value="">구분선택</option>']
    .concat(
      list
        .map((t) => {
          const name = String(t.name || '').trim();
          if (!name) return '';
          return `<option value="${name}">${name}</option>`;
        })
        .filter(Boolean)
    )
    .join('');

  typeSelect.innerHTML = options;
  typeSelect.value = state.supplierType || '';
}

function renderGroupSelectOptions() {
  if (!groupSelect) return;
  const groups = (supplierPickerGroups || []).filter((g) => {
    if (!state.supplierType) return true;
    return String(g.type || '') === state.supplierType;
  });
  groups.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

  const options = ['<option value="">분류선택</option>']
    .concat(
      groups
        .map((g) => {
          const name = String(g.name || '').trim();
          if (!name) return '';
          return `<option value="${name}">${name}</option>`;
        })
        .filter(Boolean)
    )
    .join('');

  groupSelect.innerHTML = options;
  groupSelect.value = state.supplierGroup || '';
}

function renderSummary(list) {
  let sumSales = 0;
  let sumPurchase = 0;
  let sumExpense = 0;

  // 홈(index) 집계와 동일 기준
  // - 매출: amount 우선, (매장/온라인) payment-only는 매출로 포함
  // - 매입: amount만 합산(지불/payment는 매입합계에 포함하지 않음)
  // - 지출: payment 우선(없으면 amount)
  const cashSaleGroups = new Set(['매장', '온라인']);

  list.forEach((tx) => {
    const cat = String(tx.category || '').trim();
    const amount = Number(tx.amount || 0) || 0;
    const payment = Number(tx.payment || 0) || 0;

    if (cat === 'sales') {
      // 매출 금액은 음수(조정/반품)도 있을 수 있으므로 그대로 합산한다.
      if (amount) sumSales += amount;

      // 매장/온라인은 수금등록(payment-only) 자체를 매출로 집계하는 케이스가 있어,
      // amount가 없는 수금(payment)만 매출합계에 추가로 포함한다.
      if (payment > 0 && !(amount > 0)) {
        const g = String(getSupplierGroupName(tx) || '').trim();
        if (cashSaleGroups.has(g)) sumSales += payment;
      }
      return;
    }

    if (cat === 'purchase') {
      if (amount > 0) sumPurchase += amount;
      return;
    }

    if (cat === 'expense') {
      const out = payment > 0 ? payment : (amount > 0 ? amount : 0);
      if (out > 0) sumExpense += out;
    }
  });

  if (sumSalesSpan) {
    sumSalesSpan.textContent = fmt(sumSales);
    sumSalesSpan.dataset.amountColor = '1';
    sumSalesSpan.dataset.amountValue = String(sumSales);
    delete sumSalesSpan.dataset.amountForce;
  }
  if (sumExpenseSpan) {
    const sumAllExpense = sumPurchase + sumExpense;
    sumExpenseSpan.textContent = fmtAbs(sumAllExpense);
    sumExpenseSpan.dataset.amountColor = '1';
    sumExpenseSpan.dataset.amountValue = String(sumAllExpense);
    sumExpenseSpan.dataset.amountForce = 'minus';
  }
  if (sumProfitSpan) {
    const profit = sumSales - (sumPurchase + sumExpense);
    sumProfitSpan.textContent = fmt(profit);
    sumProfitSpan.dataset.amountColor = '1';
    sumProfitSpan.dataset.amountValue = String(profit);
    delete sumProfitSpan.dataset.amountForce;
  }
  if (countSpan) countSpan.textContent = String(list.length);
}

function renderTableDetail(list) {
  // 거래처별 품목 매출 요약: 기간 내 '판매수량/원가/이익/마진'
  tableHead.innerHTML = `
    <tr>
      <th colspan="7">거래처/품목</th>
      <th colspan="3">매출</th>
      <th colspan="3">매입원가</th>
      <th colspan="2">이익</th>
    </tr>
    <tr>
      <th>거래처</th>
      <th class="col-group">분류</th>
      <th class="col-code">코드</th>
      <th class="col-name">품명</th>
      <th class="col-name">규격</th>
      <th class="col-unit">단위</th>
      <th class="col-unit">감량률</th>
      <th class="col-sales-qty">수량</th>
      <th class="col-sales-amt">금액</th>
      <th class="col-sales-avg">평균가</th>
      <th class="col-shrink-qty">감량</th>
      <th class="col-cost-qty">수량</th>
      <th class="col-cost-amt">금액</th>
      <th class="col-profit-amt">이익액</th>
      <th class="col-profit-rate">마진</th>
    </tr>
  `;

  // 기간(날짜) 조건만 적용한 매입 평균가(품목별) 계산
  const purchaseAggByItem = new Map(); // itemKey -> { qty, amt }
  (allTransactions || []).forEach((tx) => {
    if (!filterByDate(tx)) return;
    const cat = String(tx.category || '');
    if (cat !== 'purchase') return;
    const itemKey = String(tx.itemCode || tx.itemName || '').trim();
    if (!itemKey) return;
    const qty = Number(tx.quantity || 0);
    if (!(qty > 0)) return;

    const baseAmount = Number(tx.amount || 0);
    const basePayment = Number(tx.payment || 0);
    const eff = baseAmount - basePayment < 0 ? Math.abs(basePayment) : Math.abs(baseAmount);

    const prev = purchaseAggByItem.get(itemKey) || { qty: 0, amt: 0 };
    prev.qty += qty;
    prev.amt += eff;
    purchaseAggByItem.set(itemKey, prev);
  });

  const salesTx = (list || []).filter((tx) => {
    const cat = String(tx.category || '');
    if (cat !== 'sales') return false;
    const itemKey = String(tx.itemCode || tx.itemName || '').trim();
    return Boolean(itemKey);
  });

  const supplierGroups = groupBy(salesTx, (tx) => tx.supplierId || tx.supplierName || '');
  const rows = [];

  supplierGroups.forEach((arr, supplierKey) => {
    if (!arr || !arr.length) return;
    const supplierId = String(arr[0]?.supplierId || '').trim();
    const supplierNameRaw = String(arr[0]?.supplierName || '').trim();
    const legacyId = !supplierId && supplierNameRaw && supplierMap.has(supplierNameRaw)
      ? supplierNameRaw
      : '';
    const mappedName = supplierId
      ? (supplierMap.get(supplierId)?.name || '')
      : legacyId
        ? (supplierMap.get(legacyId)?.name || '')
        : '';
    const supplierName = mappedName || supplierNameRaw || supplierKey;

    const itemGroups = groupBy(arr, (tx) => (tx.itemCode || tx.itemName || '').trim());
    itemGroups.forEach((itemArr, itemKey) => {
      if (!itemKey || !itemArr || !itemArr.length) return;

      let salesQty = 0;
      let salesAmt = 0;
      itemArr.forEach((tx) => {
        const qty = Number(tx.quantity || 0);
        salesQty += qty;

        const baseAmount = Number(tx.amount || 0);
        const basePayment = Number(tx.payment || 0);
        const eff = baseAmount - basePayment < 0 ? Math.abs(basePayment) : Math.abs(baseAmount);
        salesAmt += eff;
      });

      const info = itemInfoMap.get(itemKey) || {};
      const name = info.name || itemArr[0]?.itemName || itemKey;
      const spec = String(info.spec || '').trim();
      const groupName = info.group || '';
      const unit = info.unit || '';
      const itemCode = info.code || itemKey;

      const salesAvg = salesQty > 0 ? (salesAmt / salesQty) : 0;
      const masterShrinkPercent = Number(info.shrinkPercent || 0);
      const masterShrinkPrice = Number(info.shrinkPrice || 0);
      const masterAvg = Number(info.avgPrice || 0);

      const p = purchaseAggByItem.get(itemKey);
      const purchaseAvg = p && p.qty > 0 ? (p.amt / p.qty) : 0;

      const costUnitPrice = purchaseAvg > 0
        ? purchaseAvg
        : (masterShrinkPrice > 0 ? masterShrinkPrice : masterAvg);

      const percent = Number.isFinite(masterShrinkPercent) ? masterShrinkPercent : 0;
      const shrinkRatio = percent > 0 && percent < 100 ? (percent / 100) : 0;
      const shrinkQty = salesQty > 0 ? (salesQty * shrinkRatio) : 0;
      const costQty = salesQty + shrinkQty;
      const costAmt = costQty * costUnitPrice;
      const profitAmt = salesAmt - costAmt;
      const profitRate = salesAmt > 0 ? (profitAmt / salesAmt) * 100 : 0;

      rows.push({
        supplierName,
        itemCode,
        groupName,
        name,
        spec,
        unit,
        shrinkPercent: percent,
        salesQty,
        salesAmt,
        salesAvg,
        shrinkQty,
        costQty,
        costAmt,
        profitAmt,
        profitRate,
      });
    });
  });

  rows.sort((a, b) => {
    const s = String(a.supplierName || '').localeCompare(String(b.supplierName || ''), 'ko');
    if (s !== 0) return s;
    return b.salesAmt - a.salesAmt;
  });

  const sumSalesQty = rows.reduce((acc, r) => acc + (Number(r.salesQty) || 0), 0);
  const sumSalesAmt = rows.reduce((acc, r) => acc + (Number(r.salesAmt) || 0), 0);
  const sumShrinkQty = rows.reduce((acc, r) => acc + (Number(r.shrinkQty) || 0), 0);
  const sumCostQty = rows.reduce((acc, r) => acc + (Number(r.costQty) || 0), 0);
  const sumCostAmt = rows.reduce((acc, r) => acc + (Number(r.costAmt) || 0), 0);
  const sumProfitAmt = rows.reduce((acc, r) => acc + (Number(r.profitAmt) || 0), 0);
  const avgProfitRate = sumSalesAmt > 0 ? (sumProfitAmt / sumSalesAmt) * 100 : NaN;

  // 합계줄(15열): 거래처~규격(5칸)=Count, 단위 칸에 '합계', 감량률/평균가는 공란
  renderFoot(`
    <tr>
      <td colspan="5" class="total-cell-label">Count=&nbsp;${rows.length}</td>
      <td class="total-cell-label">합계</td>
      <td class="right"></td>
      <td class="right">${fmtQty(sumSalesQty)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${sumSalesAmt}">${fmt(sumSalesAmt)}</td>
      <td class="right"></td>
      <td class="right">${fmtQty2(sumShrinkQty)}</td>
      <td class="right">${fmtQty2(sumCostQty)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${sumCostAmt}">${fmt(sumCostAmt)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${sumProfitAmt}">${fmt(sumProfitAmt)}</td>
      <td class="right">${Number.isFinite(avgProfitRate) ? avgProfitRate.toFixed(1) + '%' : ''}</td>
    </tr>
  `);

  const rowsHtml = rows
    .map((row) => `
      <tr>
        <td>${row.supplierName || ''}</td>
        <td class="col-group">${row.groupName || ''}</td>
        <td class="col-code">${row.itemCode || ''}</td>
        <td class="col-name">${row.name || ''}</td>
        <td class="col-name">${row.spec || ''}</td>
        <td class="col-unit">${row.unit || ''}</td>
        <td class="col-unit">${fmtPct(row.shrinkPercent)}</td>
        <td class="amount-cell">${fmtQty(row.salesQty)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesAmt}">${fmt(row.salesAmt)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesAvg}">${fmt(row.salesAvg)}</td>
        <td class="amount-cell">${fmtQty2(row.shrinkQty)}</td>
        <td class="amount-cell">${fmtQty2(row.costQty)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.costAmt}">${fmt(row.costAmt)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.profitAmt}">${fmt(row.profitAmt)}</td>
        <td class="amount-cell">${Number.isFinite(row.profitRate) ? row.profitRate.toFixed(1) + '%' : ''}</td>
      </tr>
    `)
    .join('');

  tableBody.innerHTML = rowsHtml || '<tr><td colspan="15">데이터가 없습니다.</td></tr>';
}

function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((tx) => {
    const key = keyFn(tx);
    if (!key) return;
    const prev = map.get(key) || [];
    prev.push(tx);
    map.set(key, prev);
  });
  return map;
}

async function applyViewMode(mode) {
  const nextMode = mode;
  state.viewMode = nextMode;
  if (viewModeSelect && viewModeSelect.value !== mode) {
    viewModeSelect.value = mode;
  }
  if (viewModeButtons && viewModeButtons.length) {
    viewModeButtons.forEach((btn) => {
      const v = btn.dataset.view;
      const isActive = v === mode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  // byGroup(구분별 분류조회)에서는 좌측 필터가 구분/분류 2개 셀렉트이므로,
  // 모달을 열지 않아도 옵션이 바로 보이도록 메타를 보강 로딩한다.
  if (nextMode === 'byGroup') {
    // 페이지 로드 후 byGroup 첫 진입은 항상 "전체"가 기본이 되도록 한다.
    // (저장된 다중 선택 필터가 자동 적용되면 첫 화면에서 전체가 안 보이는 혼란이 생김)
    if (!hasEnteredByGroupOnce) {
      hasEnteredByGroupOnce = true;
      state.mode = 'all';
      state.supplierType = '';
      state.supplierTypes = [];
      state.supplierGroup = '';
      state.supplierGroups = [];
      if (typeSelect) typeSelect.value = '';
      if (groupSelect) groupSelect.value = '';
      updateTypeGroupPickerButtonLabel();
    }

    try {
      await ensureSupplierPickerMetaLoaded();
      // 전환 중에 다른 모드로 바뀐 경우(빠른 연타 등)라면 중단
      if (state.viewMode !== nextMode) return;
      renderTypeSelectOptions();
      renderGroupSelectOptions();
    } catch (_) {
      // 메타 로딩 실패 시에도 화면은 그대로 렌더(빈 옵션 상태)
    }
  }

  updateLeftFilterUI();

  // 월별조회/월별장부조회는 항상 해당 연도의 1/1~12/31 범위를 기본으로 한다.
  if (nextMode === 'byMonth' || nextMode === 'byMonthLedger') {
    const seed = String(state.dateFrom || state.dateTo || todayYMD() || '').trim();
    const year = seed && seed.length >= 4 ? seed.slice(0, 4) : '';
    if (year) {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      state.dateFrom = from;
      state.dateTo = to;
      if (dateFromInput && dateFromInput.value !== from) dateFromInput.value = from;
      if (dateToInput && dateToInput.value !== to) dateToInput.value = to;
    }
  }
  render();
}

function renderTableBySupplier(list) {
  tableHead.innerHTML = `
    <tr>
      <th colspan="6">거래처</th>
      <th colspan="2">매출금액</th>
      <th colspan="2">매입금액</th>
      <th colspan="1">지출금액</th>
      <th colspan="1">현잔액</th>
      <th colspan="1">최종거래일</th>
    </tr>
    <tr>
      <th>상태</th>
      <th>구분</th>
      <th class="col-group">분류</th>
      <th>코드</th>
      <th>거래처명</th>
      <th>이전잔액</th>
      <th>매출액</th>
      <th>수금액</th>
      <th>매입액</th>
      <th>지불액</th>
      <th>지출액</th>
      <th>현잔액</th>
      <th>매출/매입</th>
    </tr>
  `;

  const statusLabel = {
    active: '활성',
    inactive: '중지',
  };

  // 이전잔액/현잔액 계산은 현재 mode(매출/매입/지출/전체) 기준으로 동일하게 맞춘다.
  const baseForBalance = allTransactions.filter((tx) => filterByMode(tx));
  const dateFrom = String(state.dateFrom || '').trim();

  function getSupplierKey(tx) {
    return String(tx.supplierId || tx.supplierName || '').trim();
  }

  function resolveSupplierId(key, arr) {
    const direct = String(arr?.[0]?.supplierId || '').trim();
    if (direct) return direct;

    const k = String(key || '').trim();
    if (k && supplierMap.has(k)) return k;

    const name = String(arr?.[0]?.supplierName || k || '').trim();
    if (!name) return '';
    const found = (suppliers || []).find((c) => String(c.name || '').trim() === name);
    return found ? String(found.id || '').trim() : '';
  }

  function applyBalanceChange(running, tx) {
    const cat = String(tx.category || '');
    const amount = Number(tx.amount || 0) || 0;
    const payment = Number(tx.payment || 0) || 0;
    if (cat === 'sales') return running + amount - payment;
    if (cat === 'purchase' || cat === 'expense') return running - amount + payment;
    return running;
  }

  function computePrevBalance(supplierId) {
    const opening = Number(supplierMap.get(supplierId)?.openingBalance ?? 0) || 0;
    if (!dateFrom) return opening;

    let running = opening;
    baseForBalance
      .filter((tx) => {
        const sid = String(tx.supplierId || '').trim();
        if (sid) return sid === supplierId;
        return String(tx.supplierName || '').trim() === supplierId;
      })
      .filter((tx) => tx.date && String(tx.date) < dateFrom)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''), 'ko'))
      .forEach((tx) => {
        running = applyBalanceChange(running, tx);
      });
    return running;
  }

  function getDisplayAmount(tx) {
    const amount = Math.abs(Number(tx.amount || 0) || 0);
    const payment = Math.abs(Number(tx.payment || 0) || 0);
    if (amount === 0 && payment !== 0) return payment;
    return amount;
  }

  const grouped = groupBy(list, (tx) => getSupplierKey(tx));
  const rows = Array.from(grouped.entries())
    .map(([key, arr]) => {
      const supplierId = resolveSupplierId(key, arr);
      const meta = supplierId ? supplierMap.get(supplierId) : null;

      let salesAmt = 0;
      let salesPay = 0;
      let purchaseAmt = 0;
      let purchasePay = 0;
      let expenseAmt = 0;
      let lastSalesDate = '';
      let lastPurchaseDate = '';

      arr.forEach((tx) => {
        const cat = String(tx.category || '');
        const date = String(tx.date || '').trim();
        const amount = Number(tx.amount || 0) || 0;
        const payment = Math.abs(Number(tx.payment || 0) || 0);

        if (cat === 'sales') {
          // 매출은 음수(조정/반품)도 있을 수 있으므로 부호를 유지한다.
          salesAmt += amount;
          salesPay += payment;
          if (date && (!lastSalesDate || date > lastSalesDate)) lastSalesDate = date;
        } else if (cat === 'purchase') {
          purchaseAmt += Math.abs(amount);
          purchasePay += payment;
          if (date && (!lastPurchaseDate || date > lastPurchaseDate)) lastPurchaseDate = date;
        } else if (cat === 'expense') {
          expenseAmt += getDisplayAmount(tx);
        }
      });

      const prevBalance = supplierId ? computePrevBalance(supplierId) : 0;
      let currentBalance = prevBalance;
      arr
        .slice()
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''), 'ko'))
        .forEach((tx) => {
          currentBalance = applyBalanceChange(currentBalance, tx);
        });

      const type = meta?.type || getSupplierType(arr[0] || {});
      const groupName = meta?.group || getSupplierGroupName(arr[0] || {});
      const status = meta?.status || '';
      const name = meta?.name || arr[0]?.supplierName || key;

      return {
        key,
        supplierId,
        statusLabel: statusLabel[status] || status || '',
        type: type || '',
        groupName: String(groupName || '').trim(),
        name: String(name || '').trim(),
        prevBalance,
        salesAmt,
        salesPay,
        purchaseAmt,
        purchasePay,
        expenseAmt,
        currentBalance,
        lastSalesDate,
        lastPurchaseDate,
        count: arr.length,
      };
    })
    .sort((a, b) => {
      const at = (Number(a.salesAmt) || 0) + (Number(a.purchaseAmt) || 0) + (Number(a.expenseAmt) || 0);
      const bt = (Number(b.salesAmt) || 0) + (Number(b.purchaseAmt) || 0) + (Number(b.expenseAmt) || 0);
      return bt - at;
    });

  // 거래처별 조회에서도 “구분/분류 선택” 결과를 반영해야 한다.
  // (기존에는 byGroup 탭에서만 필터링되어, 매출처를 선택해도 전체가 보이는 문제가 있었다)
  const pickedTypes = Array.isArray(state.supplierTypes) && state.supplierTypes.length
    ? state.supplierTypes
    : (state.supplierType ? [state.supplierType] : []);
  const pickedGroups = Array.isArray(state.supplierGroups) && state.supplierGroups.length
    ? state.supplierGroups
    : (state.supplierGroup ? [state.supplierGroup] : []);

  const nextRows = rows.filter((r) => {
    if (pickedTypes.length) {
      const t = String(r.type || '').trim();
      if (!pickedTypes.some((x) => String(x || '').trim() === t)) return false;
    }
    if (pickedGroups.length) {
      const g = String(r.groupName || '').trim();
      if (!pickedGroups.some((x) => String(x || '').trim() === g)) return false;
    }
    return true;
  });

  const totalPrev = nextRows.reduce((acc, r) => acc + (Number(r.prevBalance) || 0), 0);
  const totalSalesAmt = nextRows.reduce((acc, r) => acc + (Number(r.salesAmt) || 0), 0);
  const totalSalesPay = nextRows.reduce((acc, r) => acc + (Number(r.salesPay) || 0), 0);
  const totalPurchaseAmt = nextRows.reduce((acc, r) => acc + (Number(r.purchaseAmt) || 0), 0);
  const totalPurchasePay = nextRows.reduce((acc, r) => acc + (Number(r.purchasePay) || 0), 0);
  const totalExpenseAmt = nextRows.reduce((acc, r) => acc + (Number(r.expenseAmt) || 0), 0);
  const totalCurrent = nextRows.reduce((acc, r) => acc + (Number(r.currentBalance) || 0), 0);

  renderFoot(`
    <tr>
      <td class="total-cell-label">Count=&nbsp;${nextRows.length}</td>
      <td class="total-cell-label">합계</td>
      <td></td>
      <td></td>
      <td></td>
      <td class="right" data-amount-color="1" data-amount-value="${totalPrev}">${fmt(totalPrev)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSalesAmt}">${fmt(totalSalesAmt)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSalesPay}">${fmt(totalSalesPay)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchaseAmt}">${fmtAbs(totalPurchaseAmt)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchasePay}">${fmtAbs(totalPurchasePay)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalExpenseAmt}">${fmtAbs(totalExpenseAmt)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalCurrent}">${fmt(totalCurrent)}</td>
      <td></td>
    </tr>
  `);

  const rowsHtml = nextRows
    .map((row) => {
      const id = row.supplierId || '';
      const last = row.lastSalesDate && row.lastPurchaseDate
        ? `${row.lastSalesDate} / ${row.lastPurchaseDate}`
        : row.lastSalesDate || row.lastPurchaseDate || '';
      return `
        <tr>
          <td>${row.statusLabel || ''}</td>
          <td>${row.type || ''}</td>
          <td class="col-group">${row.groupName || ''}</td>
          <td>${id || ''}</td>
          <td>${row.name || ''}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-value="${row.prevBalance}">${fmt(row.prevBalance)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesAmt}">${fmt(row.salesAmt)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-value="${row.salesPay}">${fmt(row.salesPay)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchaseAmt}">${fmtAbs(row.purchaseAmt)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchasePay}">${fmtAbs(row.purchasePay)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.expenseAmt}">${fmtAbs(row.expenseAmt)}</td>
          <td class="amount-cell" data-amount-color="1" data-amount-value="${row.currentBalance}">${fmt(row.currentBalance)}</td>
          <td>${last}</td>
        </tr>
      `;
    })
    .join('');

  tableBody.innerHTML = rowsHtml || '<tr><td colspan="13">데이터가 없습니다.</td></tr>';
}

function renderTableByGroup(list) {
  tableHead.innerHTML = `
    <tr>
      <th>구분</th>
      <th>분류명</th>
      <th>매출합계</th>
      <th>매입합계</th>
      <th>지출합계</th>
      <th>차액</th>
      <th>건수</th>
    </tr>
  `;

  const grouped = groupBy(list, (tx) => {
    const type = getSupplierType(tx);
    const groupName = getSupplierGroupName(tx);
    return `${type}||${groupName}`;
  });
  const rows = Array.from(grouped.entries())
    .map(([key, arr]) => {
      let sales = 0;
      let purchase = 0;
      let expense = 0;
      const cashSaleGroups = new Set(['매장', '온라인']);

      function getDisplayAmount(tx) {
        const amount = Math.abs(Number(tx?.amount || 0) || 0);
        const payment = Math.abs(Number(tx?.payment || 0) || 0);
        if (amount === 0 && payment !== 0) return payment;
        return amount;
      }

      arr.forEach((tx) => {
        const cat = String(tx.category || '').trim();
        const amount = Number(tx.amount || 0) || 0;
        const payment = Number(tx.payment || 0) || 0;

        if (cat === 'sales') {
          // 매출 금액은 음수(조정/반품)도 있을 수 있으므로 그대로 합산한다.
          if (amount) sales += amount;

          // 매장/온라인 payment-only는 매출로 추가 집계
          if (payment > 0 && !(amount > 0)) {
            const g = String(getSupplierGroupName(tx) || '').trim();
            if (cashSaleGroups.has(g)) sales += payment;
          }
        } else if (cat === 'purchase') {
          if (amount) purchase += Math.abs(amount);
        } else if (cat === 'expense') {
          expense += getDisplayAmount(tx);
        }
      });

      const [type, groupName] = String(key || '').split('||');
      return {
        type: type || '',
        name: groupName || '',
        sales,
        purchase,
        expense,
        count: arr.length,
      };
    })

    .sort((a, b) => {
      const order = ['매출처', '매입처', '지출처'];
      const ai = order.indexOf(a.type);
      const bi = order.indexOf(b.type);
      const ao = ai === -1 ? 999 : ai;
      const bo = bi === -1 ? 999 : bi;
      if (ao !== bo) return ao - bo;
      const at = (Number(a.sales) || 0) + (Number(a.purchase) || 0) + (Number(a.expense) || 0);
      const bt = (Number(b.sales) || 0) + (Number(b.purchase) || 0) + (Number(b.expense) || 0);
      return bt - at;
    });

  const totalSales = rows.reduce((acc, r) => acc + (Number(r.sales) || 0), 0);
  const totalPurchase = rows.reduce((acc, r) => acc + (Number(r.purchase) || 0), 0);
  const totalExpense = rows.reduce((acc, r) => acc + (Number(r.expense) || 0), 0);
  const totalTxCount = rows.reduce((acc, r) => acc + (Number(r.count) || 0), 0);

  renderFoot(`
    <tr>
      <td class="total-cell-label">Count=&nbsp;${rows.length}</td>
      <td class="total-cell-label">합계</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSales}">${fmt(totalSales)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalPurchase}">${fmtAbs(totalPurchase)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${totalExpense}">${fmtAbs(totalExpense)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${totalSales - (totalPurchase + totalExpense)}">${fmt(totalSales - (totalPurchase + totalExpense))}</td>
      <td class="right">${totalTxCount}</td>
    </tr>
  `);

  const rowsHtml = rows
    .map((row) => `
      <tr>
        <td>${row.type || ''}</td>
        <td>${row.name || ''}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.sales}">${fmt(row.sales)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchase}">${fmtAbs(row.purchase)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.expense}">${fmtAbs(row.expense)}</td>
        <td class="amount-cell" data-amount-color="1" data-amount-value="${row.sales - (row.purchase + row.expense)}">${fmt(row.sales - (row.purchase + row.expense))}</td>
        <td class="amount-cell">${row.count}</td>
      </tr>
    `)
    .join('');

  tableBody.innerHTML = rowsHtml || '<tr><td colspan="7">데이터가 없습니다.</td></tr>';
}

function render() {
  const filtered = getFiltered();
  renderSummary(filtered);

  if (state.viewMode === 'bySupplier') {
    renderTableBySupplier(filtered);
  } else if (state.viewMode === 'byMonthLedger') {
    void renderTableByMonthLedger();
  } else if (state.viewMode === 'byMonth') {
    renderTableByMonth(filtered);
  } else if (state.viewMode === 'byGroup') {
    renderTableByGroup(filtered);
  } else if (state.viewMode === 'byItem') {
    renderTableByItem(filtered);
  } else {
    renderTableDetail(filtered);
  }

  // data-amount-* 기반으로 금액 색상 적용(요약/테이블 모두)
  applyAmountColoring(document);
}

function renderTableByItem(list) {
  tableHead.innerHTML = `
    <tr>
      <th colspan="6">품목</th>
      <th colspan="3">매입</th>
      <th colspan="3">매출</th>
      <th colspan="3">매입원가</th>
      <th colspan="2">이익</th>
      <th colspan="3">현재고</th>
    </tr>
    <tr>
      <th class="col-code">코드</th>
      <th class="col-group">분류</th>
      <th class="col-name">품명</th>
      <th class="col-spec">규격</th>
      <th class="col-unit">단위</th>
      <th class="col-shrink-percent">감량율</th>
      <th class="col-purchase-qty">수량</th>
      <th class="col-purchase-amt">금액</th>
      <th class="col-purchase-avg">평균가</th>
      <th class="col-sales-qty">수량</th>
      <th class="col-sales-amt">금액</th>
      <th class="col-sales-avg">평균가</th>
      <th class="col-shrink-qty">감량</th>
      <th class="col-cost-qty">수량</th>
      <th class="col-cost-amt">금액</th>
      <th class="col-profit-amt">이익액</th>
      <th class="col-profit-rate">이익률</th>
      <th class="col-stock-qty">남은재고</th>
      <th class="col-stock-unit">단가</th>
      <th class="col-stock-amt">합계</th>
    </tr>
  `;

  const grouped = groupBy(list, (tx) => (tx.itemCode || tx.itemId || tx.itemName || '').trim());
  const rows = Array.from(grouped.entries())
    .filter(([key]) => key)
    .map(([key, arr]) => {
      let salesQty = 0;
      let salesAmt = 0;
      let purchaseQty = 0;
      let purchaseAmt = 0;
      let itemCode = '';
      let itemId = '';

      arr.forEach((tx) => {
        const cat = String(tx.category || '');
        const baseAmount = Number(tx.amount || 0);
        const basePayment = Number(tx.payment || 0);
        const baseDiscount = Number(tx.paymentDiscount || 0);
        const isPaymentOnly = baseAmount === 0 && ((basePayment !== 0) || (baseDiscount !== 0));
        // 품목 리포트에서는 결제(지불) 전표는 제외하고, 매입/매출 금액은 저장된 부호 그대로 합산한다.
        const eff = isPaymentOnly ? 0 : baseAmount;

        if (!itemCode && tx.itemCode) itemCode = tx.itemCode;
        if (!itemId && tx.itemCode) itemId = tx.itemCode;

        if (cat === 'sales') {
          salesQty += Number(tx.quantity || 0);
          salesAmt += eff;
        } else if (cat === 'purchase') {
          purchaseQty += Number(tx.quantity || 0);
          purchaseAmt += eff;
        }
      });

      const info = itemInfoMap.get(itemId || itemCode) || {};
      const name = info.name || arr[0]?.itemName || key;
      const groupName = info.group || '';
      const spec = info.spec || '';
      const unit = info.unit || '';

      const purchaseAvg = purchaseQty > 0 ? purchaseAmt / purchaseQty : 0;
      const masterShrinkPercent = Number(info.shrinkPercent || 0);
      const masterShrinkPrice = Number(info.shrinkPrice || 0);
      const salesAvg = salesQty > 0 ? salesAmt / salesQty : 0;

      // 원가 계산 기준 단가: 사용자가 요청한 대로 '매입 평균가'를 우선 사용
      // (평균가가 0이면 품목 마스터 감량원가/평균가를 보조로 사용)
      const masterAvg = Number(info.avgPrice || 0);
      const costUnitPrice = purchaseAvg > 0
        ? purchaseAvg
        : (masterShrinkPrice > 0 ? masterShrinkPrice : masterAvg);

      // 감량수량/원가수량: 감량율(%) 기반
      // 예) 매출 1kg, 감량율 10% => 감량 0.1kg, 원가수량 1.1kg
      const percent = Number.isFinite(masterShrinkPercent) ? masterShrinkPercent : 0;
      const shrinkRatio = percent > 0 && percent < 100 ? (percent / 100) : 0;
      const shrinkQty = salesQty > 0 ? (salesQty * shrinkRatio) : 0;
      const costQty = salesQty + shrinkQty;
      const shrinkAmt = shrinkQty * costUnitPrice;
      const costAmt = costQty * costUnitPrice;
      const profitAmt = salesAmt - costAmt;
      const profitRate = salesAmt > 0 ? (profitAmt / salesAmt) * 100 : 0;

      // 현재고(남은재고): 매입수량 - 원가수량(매출수량+감량수량)
      // 단가: 원가단가(costUnitPrice)
      // 합계: 남은재고 * 단가
      const stockQty = purchaseQty - costQty;
      const stockUnitPrice = costUnitPrice;
      const stockAmt = stockQty * stockUnitPrice;

      return {
        itemCode,
        name,
        groupName,
        spec,
        unit,
        shrinkPercent: masterShrinkPercent,
        salesQty,
        salesAmt,
        purchaseQty,
        purchaseAmt,
        purchaseAvg,
        salesAvg,
        shrinkQty,
        shrinkAmt,
        costQty,
        costAmt,
        profitAmt,
        profitRate,
        stockQty,
        stockUnitPrice,
        stockAmt,
        count: arr.length,
      };
    })
    .sort((a, b) => (b.salesAmt + b.purchaseAmt) - (a.salesAmt + a.purchaseAmt));

  const sumPurchaseQty = rows.reduce((acc, r) => acc + (Number(r.purchaseQty) || 0), 0);
  const sumPurchaseAmt = rows.reduce((acc, r) => acc + (Number(r.purchaseAmt) || 0), 0);
  const sumSalesQty = rows.reduce((acc, r) => acc + (Number(r.salesQty) || 0), 0);
  const sumSalesAmt = rows.reduce((acc, r) => acc + (Number(r.salesAmt) || 0), 0);
  const sumShrinkQty = rows.reduce((acc, r) => acc + (Number(r.shrinkQty) || 0), 0);
  const sumCostQty = rows.reduce((acc, r) => acc + (Number(r.costQty) || 0), 0);
  const sumCostAmt = rows.reduce((acc, r) => acc + (Number(r.costAmt) || 0), 0);
  const sumProfitAmt = rows.reduce((acc, r) => acc + (Number(r.profitAmt) || 0), 0);
  const avgProfitRate = sumSalesAmt > 0 ? (sumProfitAmt / sumSalesAmt) * 100 : NaN;
  const sumStockQty = rows.reduce((acc, r) => acc + (Number(r.stockQty) || 0), 0);
  const sumStockAmt = rows.reduce((acc, r) => acc + (Number(r.stockAmt) || 0), 0);

  // 합계줄(20열): 코드~단위(5칸) = Count, 감량율 칸에 '합계' 라벨, 평균가/이익률/단가 등은 의미가 없어 공란
  renderFoot(`
    <tr>
      <td colspan="5" class="total-cell-label">Count=&nbsp;${rows.length}</td>
      <td class="total-cell-label">합계</td>
      <td class="right">${fmtQty(sumPurchaseQty)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${sumPurchaseAmt}">${fmtAbs(sumPurchaseAmt)}</td>
      <td class="right"></td>
      <td class="right">${fmtQty(sumSalesQty)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${sumSalesAmt}">${fmt(sumSalesAmt)}</td>
      <td class="right"></td>
      <td class="right">${fmtQty2(sumShrinkQty)}</td>
      <td class="right">${fmtQty2(sumCostQty)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${sumCostAmt}">${fmt(sumCostAmt)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${sumProfitAmt}">${fmt(sumProfitAmt)}</td>
      <td class="right">${Number.isFinite(avgProfitRate) ? avgProfitRate.toFixed(1) + '%' : ''}</td>
      <td class="right">${fmtQty2(sumStockQty)}</td>
      <td class="right"></td>
      <td class="right" data-amount-color="1" data-amount-value="${sumStockAmt}">${fmt(sumStockAmt)}</td>
    </tr>
  `);

  const rowsHtml = rows
    .map((row) => `
      <tr>
        <td class="col-code">${row.itemCode || ''}</td>
        <td class="col-group">${row.groupName || ''}</td>
        <td class="col-name">${row.name}</td>
        <td class="col-spec">${row.spec || ''}</td>
        <td class="col-unit">${row.unit || ''}</td>
        <td class="col-shrink-percent amount-cell">${Number.isFinite(row.shrinkPercent) ? row.shrinkPercent.toFixed(1) + '%' : ''}</td>
        <td class="col-purchase-qty amount-cell">${fmtQty(row.purchaseQty)}</td>
        <td class="col-purchase-amt amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchaseAmt}">${fmtAbs(row.purchaseAmt)}</td>
        <td class="col-purchase-avg amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.purchaseAvg}">${fmtAbs(row.purchaseAvg)}</td>
        <td class="col-sales-qty amount-cell">${fmtQty(row.salesQty)}</td>
        <td class="col-sales-amt amount-cell" data-amount-color="1" data-amount-value="${row.salesAmt}">${fmt(row.salesAmt)}</td>
        <td class="col-sales-avg amount-cell" data-amount-color="1" data-amount-value="${row.salesAvg}">${fmt(row.salesAvg)}</td>
        <td class="col-shrink-qty amount-cell">${fmtQty2(row.shrinkQty)}</td>
        <td class="col-cost-qty amount-cell">${fmtQty2(row.costQty)}</td>
        <td class="col-cost-amt amount-cell" data-amount-color="1" data-amount-force="minus" data-amount-value="${row.costAmt}">${fmt(row.costAmt)}</td>
        <td class="col-profit-amt amount-cell" data-amount-color="1" data-amount-value="${row.profitAmt}">${fmt(row.profitAmt)}</td>
        <td class="col-profit-rate amount-cell">${Number.isFinite(row.profitRate) ? row.profitRate.toFixed(1) + '%' : ''}</td>
        <td class="col-stock-qty amount-cell">${fmtQty2(row.stockQty)}</td>
        <td class="col-stock-unit amount-cell" data-amount-color="1" data-amount-value="${row.stockUnitPrice}">${fmt(row.stockUnitPrice)}</td>
        <td class="col-stock-amt amount-cell" data-amount-color="1" data-amount-value="${row.stockAmt}">${fmt(row.stockAmt)}</td>
      </tr>
    `)
    .join('');

  tableBody.innerHTML = rowsHtml || '<tr><td colspan="20">데이터가 없습니다.</td></tr>';
}

async function loadSupplierGroups() {
  try {
    const groups = await getCustomerGroups();

    customerGroupMasters = groups || [];
    supplierGroupCodeByKey = new Map();
    supplierGroupCodeByName = new Map();
    (customerGroupMasters || []).forEach((g) => {
      const type = String(g?.type || '').trim();
      const name = String(g?.name || '').trim();
      const code = String(g?.code || '').trim();
      if (!name || !code) return;

      if (type) supplierGroupCodeByKey.set(`${type}::${name}`, code);
      if (!supplierGroupCodeByName.has(name)) supplierGroupCodeByName.set(name, code);
    });

    const options = ['<option value="">전체</option>']
      .concat(
        (groups || []).map((g) => `<option value="${g.name}">${g.name}</option>`)
      )
      .join('');
    if (supplierGroupSelect) supplierGroupSelect.innerHTML = options;
  } catch (_) {
    // ignore
  }
}

async function loadSuppliers() {
  try {
    const customers = await getCustomers();
    suppliers = customers || [];
    supplierMap = new Map();
    (customers || []).forEach((c) => {
      supplierMap.set(c.id, {
        name: c.name,
        group: c.group || '',
        type: c.type || '',
        status: c.status || '',
        openingBalance: Number(c.openingBalance ?? 0) || 0,
      });
    });
  } catch (_) {
    suppliers = [];
    supplierMap = new Map();
  }
}

function renderSupplierSelectOptions() {
  if (!supplierSelect) return;

  const list = (suppliers || []).slice();
  list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'ko'));

  const options = ['<option value="">거래처 선택</option>']
    .concat(
      list.map((c) => {
        const id = String(c.id || '').trim();
        const name = String(c.name || '').trim();
        if (!id && !name) return '';
        const label = name || id;
        const value = id || name;
        return `<option value="${value}">${label}</option>`;
      })
    )
    .filter(Boolean)
    .join('');

  supplierSelect.innerHTML = options;
  supplierSelect.value = state.supplierId || '';
  updateSupplierSelectedLabel();
}

function updateSupplierSelectedLabel() {
  if (!supplierPickerOpenButton) return;
  const ids = Array.isArray(state.supplierIds) ? state.supplierIds.map((v) => String(v || '').trim()).filter(Boolean) : [];
  if (ids.length > 1) {
    supplierPickerOpenButton.textContent = `거래처 ${ids.length}개 선택`;
    return;
  }
  const id = ids.length === 1 ? ids[0] : String(state.supplierId || '').trim();
  if (!id) {
    supplierPickerOpenButton.textContent = '거래처 선택';
    return;
  }
  const name = supplierMap.get(id)?.name || '';
  supplierPickerOpenButton.textContent = name || id || '거래처 선택';
}

async function ensureSupplierPickerMetaLoaded() {
  // suppliers는 loadSuppliers()에서 로딩되지만, 안전하게 보강한다.
  try {
    if (!suppliers || !suppliers.length) {
      const customers = await getCustomers();
      suppliers = customers || [];
    }
  } catch (_) {
    suppliers = suppliers || [];
  }

  try {
    if (!supplierPickerTypes.length) {
      supplierPickerTypes = (await getCustomerTypes()) || [];
    }
  } catch (_) {
    supplierPickerTypes = [];
  }

  try {
    if (!supplierPickerGroups.length) {
      supplierPickerGroups = (await getCustomerGroups()) || [];
    }
  } catch (_) {
    supplierPickerGroups = [];
  }

  // fallback: 코드 스토어가 비어 있는 경우 customers에서 유도
  if (!supplierPickerTypes.length) {
    const uniq = new Map();
    (suppliers || []).forEach((c) => {
      const name = String(c.type || '').trim();
      if (!name) return;
      if (!uniq.has(name)) uniq.set(name, { code: '', name });
    });
    supplierPickerTypes = Array.from(uniq.values());
  }

  if (!supplierPickerGroups.length) {
    const uniq = new Map();
    (suppliers || []).forEach((c) => {
      const name = String(c.group || '').trim();
      const type = String(c.type || '').trim();
      if (!name) return;
      const key = `${type}::${name}`;
      if (!uniq.has(key)) uniq.set(key, { code: '', type, name });
    });
    supplierPickerGroups = Array.from(uniq.values());
  }
}

function renderSupplierPickerTypeList() {
  if (!supplierPickerTypeListBody) return;

  const rows = [];
  (supplierPickerTypes || []).forEach((t) => {
    const name = String(t.name || '').trim();
    if (!name) return;
    const active = supplierPickerDraftTypes instanceof Set && supplierPickerDraftTypes.has(name);
    rows.push(`
      <tr data-type="${name}" class="${active ? 'selected' : ''}">
        <td>${name}</td>
      </tr>
    `);
  });

  supplierPickerTypeListBody.innerHTML = rows.join('');
}

function renderSupplierPickerGroupList() {
  if (!supplierPickerGroupListBody) return;

  const rows = [];
  const groups = (supplierPickerGroups || []).filter((g) => {
    const gt = String(g.type || '').trim();
    if (!(supplierPickerDraftTypes instanceof Set) || supplierPickerDraftTypes.size === 0) return true;
    return supplierPickerDraftTypes.has(gt);
  });

  groups.forEach((g) => {
    const name = String(g.name || '').trim();
    if (!name) return;
    const type = String(g.type || '').trim();
    const key = `${type}::${name}`;
    const active = supplierPickerDraftGroupKeys instanceof Set && supplierPickerDraftGroupKeys.has(key);
    rows.push(`
      <tr data-group="${name}" data-type="${type}" data-key="${key}" class="${active ? 'selected' : ''}">
        <td>${name}</td>
      </tr>
    `);
  });

  supplierPickerGroupListBody.innerHTML = rows.join('');
}

function renderSupplierPickerCustomerList() {
  if (!supplierPickerCustomerListBody) return;

  const q = (supplierPickerSearch?.value || '').trim().toLowerCase();
  const selectedId = String(state.supplierId || '').trim();
  const selectedIds = supplierPickerDraftIds instanceof Set ? supplierPickerDraftIds : new Set();

  const balById = buildSupplierPickerBalanceById();
  const getBalance = (id) => {
    if (!id) return 0;
    const v = balById instanceof Map ? balById.get(String(id)) : 0;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  };

  const list = (suppliers || []).filter((c) => {
    const ct = String(c.type || '').trim();
    const cg = String(c.group || '').trim();
    if (supplierPickerDraftTypes instanceof Set && supplierPickerDraftTypes.size > 0) {
      if (!supplierPickerDraftTypes.has(ct)) return false;
    }
    if (supplierPickerDraftGroupKeys instanceof Set && supplierPickerDraftGroupKeys.size > 0) {
      const key = `${ct}::${cg}`;
      if (!supplierPickerDraftGroupKeys.has(key)) return false;
    }

    if (!q) return true;
    const name = String(c.name || '').toLowerCase();
    const code = String(c.id || '').toLowerCase();
    const type = String(c.type || '').toLowerCase();
    const group = String(c.group || '').toLowerCase();
    return name.includes(q) || code.includes(q) || type.includes(q) || group.includes(q);
  });

  supplierPickerCustomerListBody.innerHTML = list
    .map((c) => {
      const id = String(c.id || '').trim();
      const name = String(c.name || '').trim();
      const label = name || id;
      const checked = selectedIds.has(id);
      const active = (id && selectedId && id === selectedId) || checked;
      const bal = getBalance(id);
      return `
        <tr data-id="${id}" class="${active ? 'selected' : ''}">
          <td class="col-name">${label}</td>
          <td class="col-balance" data-amount-color="1" data-amount-value="${bal}">${fmt(bal)}</td>
        </tr>
      `;
    })
    .join('');

  applyAmountColoring(supplierPickerModal || document);
}

function applySupplierPickerBalanceChange(running, tx) {
  const cat = String(tx?.category || '');
  const amount = Number(tx?.amount || 0) || 0;
  const payment = Number(tx?.payment || 0) || 0;
  if (cat === 'sales') return running + amount - payment;
  if (cat === 'purchase' || cat === 'expense') return running - amount + payment;
  return running;
}

function buildSupplierPickerBalanceById() {
  const modeKey = String(state.mode || '');
  const dateTo = String(state.dateTo || '').trim();
  const key = `${modeKey}|${dateTo}|${String(allTransactions?.length || 0)}|${String(supplierMap?.size || 0)}|${String(suppliers?.length || 0)}`;
  if (supplierPickerBalanceCacheKey === key && supplierPickerBalanceById instanceof Map) {
    return supplierPickerBalanceById;
  }

  const map = new Map();

  const nameToId = new Map();
  (suppliers || []).forEach((c) => {
    const id = String(c.id || '').trim();
    const name = String(c.name || '').trim();
    if (id) {
      const opening = Number(supplierMap.get(id)?.openingBalance ?? c.openingBalance ?? 0) || 0;
      map.set(id, opening);
    }
    if (name && id && !nameToId.has(name)) nameToId.set(name, id);
  });

  const base = (allTransactions || [])
    .filter((tx) => filterByMode(tx))
    .filter((tx) => {
      if (!dateTo) return true;
      const d = String(tx?.date || '').trim();
      return d && d <= dateTo;
    })
    .slice()
    .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || ''), 'ko'));

  base.forEach((tx) => {
    const directId = String(tx?.supplierId || '').trim();
    const fallbackId = nameToId.get(String(tx?.supplierName || '').trim()) || '';
    const id = directId || fallbackId;
    if (!id) return;

    const running = Number(map.get(id) ?? (supplierMap.get(id)?.openingBalance ?? 0)) || 0;
    map.set(id, applySupplierPickerBalanceChange(running, tx));
  });

  supplierPickerBalanceById = map;
  supplierPickerBalanceCacheKey = key;
  return map;
}

function closeSupplierPickerModal() {
  setSupplierPickerContext('full');
  closeModalOverlay(supplierPickerModal);
  supplierPickerDraftIds = new Set();
  supplierPickerDraftTypes = new Set();
  supplierPickerDraftGroupKeys = new Set();
  supplierPickerMultiEnabled = false;
  supplierPickerLastClickedId = '';
  supplierPickerLastClickedType = '';
  supplierPickerLastClickedGroupKey = '';
  updateSupplierPickerMultiButtonUI();
  if (supplierPickerModalEscOff) {
    supplierPickerModalEscOff();
    supplierPickerModalEscOff = null;
  }
}

async function openSupplierPickerModal(options = {}) {
  if (!supplierPickerModal) return;
  setSupplierPickerContext(options.context || 'full');
  await ensureSupplierPickerMetaLoaded();

  // 처음 열었을 때는 '기존처럼'(단일 선택) 동작
  supplierPickerMultiEnabled = false;
  supplierPickerLastClickedId = '';
  supplierPickerLastClickedType = '';
  supplierPickerLastClickedGroupKey = '';
  updateSupplierPickerMultiButtonUI();

  // draft seed (구분/분류/거래처)
  const committedIds = Array.isArray(state.supplierIds) ? state.supplierIds : [];
  const seedIds = committedIds.length ? committedIds : (state.supplierId ? [state.supplierId] : []);
  supplierPickerDraftIds = new Set(seedIds.map((v) => String(v || '').trim()).filter(Boolean));

  const committedTypes = Array.isArray(state.supplierTypes) ? state.supplierTypes : [];
  const seedTypes = committedTypes.length ? committedTypes : (state.supplierType ? [state.supplierType] : []);
  supplierPickerDraftTypes = new Set(seedTypes.map((v) => String(v || '').trim()).filter(Boolean));

  const committedGroups = Array.isArray(state.supplierGroups) ? state.supplierGroups : [];
  const seedGroups = committedGroups.length ? committedGroups : (state.supplierGroup ? [state.supplierGroup] : []);
  const seedGroupNames = new Set(seedGroups.map((v) => String(v || '').trim()).filter(Boolean));
  supplierPickerDraftGroupKeys = new Set();
  (supplierPickerGroups || []).forEach((g) => {
    const name = String(g.name || '').trim();
    const type = String(g.type || '').trim();
    if (!name) return;
    if (!seedGroupNames.has(name)) return;
    if (supplierPickerDraftTypes.size > 0 && !supplierPickerDraftTypes.has(type)) return;
    supplierPickerDraftGroupKeys.add(`${type}::${name}`);
  });

  // 컨텍스트별로 보이지 않는 선택은 seed에서 제외(확인 우선순위 충돌 방지)
  if (supplierPickerContext === 'typeOnly') {
    supplierPickerDraftIds = new Set();
    supplierPickerDraftGroupKeys = new Set();
  } else if (supplierPickerContext === 'typeGroup') {
    supplierPickerDraftIds = new Set();
  }

  enforceSupplierPickerHierarchy();

  const currentId = (Array.isArray(state.supplierIds) && state.supplierIds.length)
    ? String(state.supplierIds[0] || '').trim()
    : String(state.supplierId || '').trim();
  const current = currentId ? (suppliers || []).find((c) => String(c.id) === currentId) : null;
  if (!options.keepFilters) {
    supplierPickerFilterType = current ? String(current.type || '').trim() : '';
    supplierPickerFilterGroup = current ? String(current.group || '').trim() : '';
  }

  if (supplierPickerContext === 'typeOnly') {
    supplierPickerFilterType = '';
    supplierPickerFilterGroup = '';
  }
  if (supplierPickerContext === 'typeGroup') {
    supplierPickerFilterType = String(state.supplierType || '').trim();
    supplierPickerFilterGroup = String(state.supplierGroup || '').trim();
  }

  renderSupplierPickerTypeList();
  renderSupplierPickerGroupList();
  renderSupplierPickerCustomerList();
  updateSupplierPickerHierarchyUI();

  openModalOverlay(supplierPickerModal);
  supplierPickerModalEscOff = registerModalEscClose(supplierPickerModal, closeSupplierPickerModal);

  if (supplierPickerSearch && supplierPickerSearch.style.display !== 'none') supplierPickerSearch.focus();
}

async function loadItems() {
  try {
    const items = await getItems();
    itemInfoMap = new Map();

    (items || []).forEach((it) => {
      const id = String(it.id || it.code || '').trim();
      if (!id) return;

      const avgPrice = Number(it.avgPrice ?? it.price ?? 0) || 0;
      const shrinkPercent = Number(it.shrinkPercent ?? 0) || 0;
      const shrinkPrice = Number(it.shrinkPrice ?? 0) || 0;

      itemInfoMap.set(id, {
        code: id,
        name: it.name || '',
        group: it.group || '',
        spec: it.spec || '',
        unit: it.unit || '',
        avgPrice,
        shrinkPercent,
        shrinkPrice,
      });
    });
  } catch (_) {
    itemInfoMap = new Map();
  }
}

async function loadTransactions() {
  const all = await getTransactions();
  // type/category, date, supplier 쪽 필드만 사용하는 단순 조회
  allTransactions = (all || []).map((tx) => ({
    id: tx.id,
    type: tx.type || '',
    category: tx.category || '',
    date: tx.date || '',
    supplierId: tx.supplierId || '',
    supplierName: tx.supplierName || '',
    amount: Number(tx.amount || 0),
    payment: Number(tx.payment || 0),
    supplierGroup: tx.supplierGroup || '',
    itemCode: tx.itemCode || tx.itemId || '',
    itemName: tx.itemName || '',
    quantity: Number(tx.quantity || 0),
    memo: tx.memo || '',
  }));
}

async function refreshTransactionsAndRender() {
  if (isRefreshingTransactions) return;
  isRefreshingTransactions = true;
  try {
    await loadTransactions();
    render();
  } catch (err) {
    console.error('거래 목록 새로 고침 실패', err);
  } finally {
    isRefreshingTransactions = false;
  }
}

function bindEvents() {
  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      state.mode = modeSelect.value;
      render();
    });
  }

  if (viewModeSelect) {
    viewModeSelect.addEventListener('change', () => {
      applyViewMode(viewModeSelect.value);
    });
  }

  // 날짜 필터는 공통 모듈(date-filter.js)에서 바인딩

  if (supplierPickerOpenButton) {
    supplierPickerOpenButton.addEventListener('click', () => {
      openSupplierPickerModal({ context: 'full' });
    });
  }

  if (itemPickerOpenButton) {
    itemPickerOpenButton.addEventListener('click', () => {
      openItemPickerModal();
    });
  }

  if (typeGroupPickerOpenButton) {
    typeGroupPickerOpenButton.addEventListener('click', () => {
      openSupplierPickerModal({ context: 'typeGroup' });
    });
  }

  if (btnSupplierPickerClose) {
    btnSupplierPickerClose.onclick = closeSupplierPickerModal;
  }

  if (btnItemPickerClose) {
    btnItemPickerClose.onclick = closeItemPickerModal;
  }

  if (btnItemPickerReset) {
    btnItemPickerReset.onclick = () => {
      commitItemPickerDraftAndQuery();
    };
  }

  // 기존 '전체' 버튼을 '조회'로 사용: 이 버튼을 눌렀을 때만 state에 반영 + 조회(render)
  if (btnSupplierPickerReset) {
    btnSupplierPickerReset.onclick = () => {
      commitSupplierPickerDraftAndQuery();
    };
  }

  if (supplierPickerSearch) {
    supplierPickerSearch.oninput = () => {
      renderSupplierPickerCustomerList();
    };
  }

  if (itemPickerSearch) {
    itemPickerSearch.oninput = () => {
      renderItemPickerItemList();
    };
  }

  if (itemPickerGroupListBody) {
    itemPickerGroupListBody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-group]');
      if (!tr) return;
      const g = String(tr.dataset.group || '').trim();
      itemPickerLastClickedGroup = g;
      if (!(itemPickerDraftGroups instanceof Set)) itemPickerDraftGroups = new Set();

      if (!itemPickerMultiEnabled) {
        // 단일 모드: 같은 분류를 다시 클릭하면 해제(0개 선택 허용)
        const isOnlyOne = itemPickerDraftGroups.size === 1 && itemPickerDraftGroups.has(g);
        itemPickerFilterGroup = g;
        itemPickerDraftGroups = isOnlyOne ? new Set() : new Set([g]);
        setSingleSelectedRow(itemPickerGroupListBody, isOnlyOne ? null : tr);
        // 분류가 선택되면 품목 선택은 불가 → 품목 선택 상태 초기화
        itemPickerDraftCodes = new Set();
        renderItemPickerItemList();
        updateItemPickerHierarchyUI();
        return;
      }

      // 다중 모드: 분류 토글(0개 선택도 허용)
      if (itemPickerDraftGroups.has(g)) itemPickerDraftGroups.delete(g);
      else itemPickerDraftGroups.add(g);

      enforceItemPickerHierarchy();

      // DOM 재렌더 없이 선택 표시만 갱신(더블클릭 방해 방지)
      itemPickerGroupListBody.querySelectorAll('tr[data-group]').forEach((row) => {
        const rg = String(row.dataset.group || '').trim();
        row.classList.toggle('selected', itemPickerDraftGroups.has(rg));
      });
      renderItemPickerItemList();
      updateItemPickerHierarchyUI();
    });

    bindDblClickRowConfirm(itemPickerGroupListBody, {
      rowSelector: 'tr[data-group]',
      selectOnDblClick: false,
      onConfirm: (tr) => {
        if (itemPickerMultiEnabled) return;
        const g = String(tr?.dataset?.group || '').trim();
        if (!g) return;
        itemPickerLastClickedGroup = g;
        itemPickerFilterGroup = g;

        // 단일 모드: 분류 더블클릭이면 분류로 바로 조회(품목 선택은 비움)
        itemPickerDraftCodes = new Set();
        itemPickerDraftGroups = new Set([g]);
        commitItemPickerDraftAndQuery();
      },
    });
  }

  if (itemPickerItemListBody) {
    itemPickerItemListBody.addEventListener('click', (e) => {
      if (!isItemPickerItemEnabled()) return;

      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;

      const id = String(tr.dataset.id || '').trim();
      if (!id) return;
      itemPickerLastClickedCode = id;
      if (!(itemPickerDraftCodes instanceof Set)) itemPickerDraftCodes = new Set();

      if (!itemPickerMultiEnabled) {
        itemPickerDraftCodes = new Set([id]);
        setSingleSelectedRow(itemPickerItemListBody, tr);
        return;
      }

      // 다중 모드: 토글
      if (itemPickerDraftCodes.has(id)) itemPickerDraftCodes.delete(id);
      else itemPickerDraftCodes.add(id);
      tr.classList.toggle('selected', itemPickerDraftCodes.has(id));
    });

    bindDblClickRowConfirm(itemPickerItemListBody, {
      rowSelector: 'tr[data-id]',
      selectOnDblClick: false,
      onConfirm: (tr) => {
        if (!isItemPickerItemEnabled()) return;
        if (itemPickerMultiEnabled) return;
        const id = String(tr?.dataset?.id || '').trim();
        if (!id) return;
        itemPickerLastClickedCode = id;
        itemPickerDraftCodes = new Set([id]);
        commitItemPickerDraftAndQuery();
      },
    });
  }

  if (btnItemPickerConfirm) {
    btnItemPickerConfirm.onclick = () => {
      // 다중선택 모드 토글(ON/OFF)
      itemPickerMultiEnabled = !itemPickerMultiEnabled;

      enforceItemPickerHierarchy();

      // 단일 모드로 돌아갈 때는 마지막 클릭 1개만 유지
      if (!itemPickerMultiEnabled) {
        itemPickerDraftCodes = keepOnlyOneInSet(itemPickerDraftCodes, itemPickerLastClickedCode);
        itemPickerDraftGroups = keepOnlyOneInSet(itemPickerDraftGroups, itemPickerLastClickedGroup);
      }
      updateItemPickerMultiButtonUI();
      renderItemPickerItemList();
      renderItemPickerGroupList();
      updateItemPickerHierarchyUI();
    };
  }

  if (supplierPickerTypeListBody) {
    supplierPickerTypeListBody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-type]');
      if (!tr) return;
      const type = String(tr.dataset.type || '').trim();
      if (!type) return;

      supplierPickerLastClickedType = type;
      if (!(supplierPickerDraftTypes instanceof Set)) supplierPickerDraftTypes = new Set();
      if (!supplierPickerMultiEnabled) {
        supplierPickerDraftTypes = new Set([type]);
      } else {
        if (supplierPickerDraftTypes.has(type)) supplierPickerDraftTypes.delete(type);
        else supplierPickerDraftTypes.add(type);
      }

      enforceSupplierPickerHierarchy();

      if (!supplierPickerMultiEnabled) {
        // 단일 모드: 클릭한 리스트는 재렌더하지 않고(더블클릭 유지), 하위 리스트만 갱신
        setSingleSelectedRow(supplierPickerTypeListBody, tr);
        renderSupplierPickerGroupList();
        renderSupplierPickerCustomerList();
        updateSupplierPickerHierarchyUI();
        return;
      }

      // 선택 상태가 바뀌면 하위 리스트도 갱신
      renderSupplierPickerTypeList();
      renderSupplierPickerGroupList();
      renderSupplierPickerCustomerList();
      updateSupplierPickerHierarchyUI();
    });

    bindDblClickRowConfirm(supplierPickerTypeListBody, {
      rowSelector: 'tr[data-type]',
      selectOnDblClick: false,
      onConfirm: (tr) => {
        if (supplierPickerMultiEnabled) return;
        const type = String(tr?.dataset?.type || '').trim();
        if (!type) return;
        supplierPickerLastClickedType = type;
        supplierPickerDraftTypes = new Set([type]);
        commitSupplierPickerDraftAndQuery();
      },
    });
  }

  if (supplierPickerGroupListBody) {
    supplierPickerGroupListBody.addEventListener('click', (e) => {
      if (!isSupplierPickerGroupEnabled()) return;
      const tr = e.target.closest('tr[data-key]');
      if (!tr) return;
      const key = String(tr.dataset.key || '').trim();
      if (!key) return;

      supplierPickerLastClickedGroupKey = key;
      if (!(supplierPickerDraftGroupKeys instanceof Set)) supplierPickerDraftGroupKeys = new Set();
      if (!supplierPickerMultiEnabled) {
        supplierPickerDraftGroupKeys = new Set([key]);
      } else {
        if (supplierPickerDraftGroupKeys.has(key)) supplierPickerDraftGroupKeys.delete(key);
        else supplierPickerDraftGroupKeys.add(key);
      }

      enforceSupplierPickerHierarchy();

      if (!supplierPickerMultiEnabled) {
        setSingleSelectedRow(supplierPickerGroupListBody, tr);
        renderSupplierPickerCustomerList();
        updateSupplierPickerHierarchyUI();
        return;
      }

      renderSupplierPickerGroupList();
      renderSupplierPickerCustomerList();
      updateSupplierPickerHierarchyUI();
    });

    bindDblClickRowConfirm(supplierPickerGroupListBody, {
      rowSelector: 'tr[data-key]',
      selectOnDblClick: false,
      onConfirm: (tr) => {
        if (supplierPickerMultiEnabled) return;
        if (!isSupplierPickerGroupEnabled()) return;
        const key = String(tr?.dataset?.key || '').trim();
        if (!key) return;
        supplierPickerLastClickedGroupKey = key;
        supplierPickerDraftGroupKeys = new Set([key]);
        commitSupplierPickerDraftAndQuery();
      },
    });
  }

  if (supplierPickerCustomerListBody) {
    supplierPickerCustomerListBody.addEventListener('click', (e) => {
      if (!isSupplierPickerCustomerEnabled()) return;
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (supplierPickerContext === 'typeOnly' || supplierPickerContext === 'typeGroup') return;

      const id = String(tr.dataset.id || '').trim();
      if (!id) return;

      supplierPickerLastClickedId = id;
      if (!(supplierPickerDraftIds instanceof Set)) supplierPickerDraftIds = new Set();
      if (!supplierPickerMultiEnabled) {
        supplierPickerDraftIds = new Set([id]);
      } else {
        if (supplierPickerDraftIds.has(id)) supplierPickerDraftIds.delete(id);
        else supplierPickerDraftIds.add(id);
      }

      enforceSupplierPickerHierarchy();

      if (!supplierPickerMultiEnabled) {
        // 단일 모드에서는 리스트를 다시 그리지 않고 현재 행만 하이라이트(더블클릭 유지)
        setSingleSelectedRow(supplierPickerCustomerListBody, tr);
        updateSupplierPickerHierarchyUI();
        return;
      }

      renderSupplierPickerCustomerList();
      updateSupplierPickerHierarchyUI();
    });

    bindDblClickRowConfirm(supplierPickerCustomerListBody, {
      rowSelector: 'tr[data-id]',
      selectOnDblClick: false,
      onConfirm: (tr) => {
        if (supplierPickerMultiEnabled) return;
        if (!isSupplierPickerCustomerEnabled()) return;
        if (supplierPickerContext === 'typeOnly' || supplierPickerContext === 'typeGroup') return;
        const id = String(tr?.dataset?.id || '').trim();
        if (!id) return;
        supplierPickerLastClickedId = id;
        supplierPickerDraftIds = new Set([id]);
        commitSupplierPickerDraftAndQuery();
      },
    });
  }

  if (btnSupplierPickerConfirm) {
    btnSupplierPickerConfirm.onclick = () => {
      // 다중선택 모드 토글(ON/OFF)
      supplierPickerMultiEnabled = !supplierPickerMultiEnabled;

      // 단일 모드로 돌아갈 때는 마지막 클릭 1개만 유지
      if (!supplierPickerMultiEnabled) {
        if (supplierPickerContext === 'full') {
          supplierPickerDraftIds = keepOnlyOneInSet(supplierPickerDraftIds, supplierPickerLastClickedId);
        }
        supplierPickerDraftTypes = keepOnlyOneInSet(supplierPickerDraftTypes, supplierPickerLastClickedType);
        supplierPickerDraftGroupKeys = keepOnlyOneInSet(supplierPickerDraftGroupKeys, supplierPickerLastClickedGroupKey);
        renderSupplierPickerTypeList();
        renderSupplierPickerGroupList();
        renderSupplierPickerCustomerList();
      } else {
        enforceSupplierPickerHierarchy();
        renderSupplierPickerTypeList();
        renderSupplierPickerGroupList();
        renderSupplierPickerCustomerList();
      }
      updateSupplierPickerMultiButtonUI();
      updateSupplierPickerHierarchyUI();
    };
  }

  if (supplierGroupSelect) {
    supplierGroupSelect.addEventListener('change', () => {
      state.supplierGroup = supplierGroupSelect.value || '';
      saveStoredTypeGroupFilter();
      render();
    });
  }

  if (supplierQInput) {
    supplierQInput.addEventListener('input', () => {
      state.supplierQ = supplierQInput.value || '';
      render();
    });
  }

  if (qInput) {
    qInput.addEventListener('input', () => {
      state.q = qInput.value || '';
      render();
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      state.supplierType = typeSelect.value || '';
      // 구분을 바꾸면 분류는 초기화
      state.supplierGroup = '';
      renderGroupSelectOptions();
      saveStoredTypeGroupFilter();
      render();
    });
  }

  if (groupSelect) {
    groupSelect.addEventListener('change', () => {
      state.supplierGroup = groupSelect.value || '';
      saveStoredTypeGroupFilter();
      render();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshTransactionsAndRender();
    });
  }

  if (viewModeButtons && viewModeButtons.length) {
    viewModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view || 'detail';
        applyViewMode(mode);
      });
    });
  }
}

async function init() {
  await Promise.all([
    loadSupplierGroups(),
    loadSuppliers(),
    loadItems(),
    loadTransactions(),
  ]);

  renderSupplierSelectOptions();

  initDateFilter({
    fromInputId: 'trn-date-from',
    toInputId: 'trn-date-to',
    quickBtnId: 'btn-trn-date-quick',
    searchBtnId: 'btn-trn-date-search',
    modalId: 'trn-date-quick-modal',
    allBtnId: 'btn-trn-date-quick-all',
    closeBtnId: 'btn-trn-date-quick-close',
    defaultRangeKey: 'thisMonth',
    onApply: ({ from, to }) => {
      state.dateFrom = from || '';
      state.dateTo = to || '';
      render();
    },
  });

  bindEvents();

  installDbAutoRefresh({
    refresh: refreshTransactionsAndRender,
    isBusy: () => document.body.classList.contains('modal-open'),
  });
  await applyViewMode(state.viewMode || 'detail');
}

init().catch((err) => {
  console.error('전표 조회 초기화 실패', err);
});

