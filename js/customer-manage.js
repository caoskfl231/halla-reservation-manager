import { getCustomers, getTransactions, addCustomer, updateCustomer, deleteCustomer, bulkInsertCustomers, bulkReplaceCustomerTypes, bulkReplaceCustomerGroups, getCustomerTypes, addCustomerType, updateCustomerType, deleteCustomerType, getCustomerGroups, addCustomerGroup, updateCustomerGroup, deleteCustomerGroup, renameCustomerTypeNameEverywhere, renameCustomerGroupNameEverywhere } from './db.js?v=ledger-records-20261010-1';
import { installDbAutoRefresh } from './common/app-events.js?v=ledger-records-20261010-1';
import { sortByKey } from './common/sortTable.js?v=ledger-records-20261010-1';
import { getStoredJson, setStoredJson } from './common/storage.js?v=ledger-records-20261010-1';
import { openModalOverlay, closeModalOverlay, registerModalEscClose, createFormDirtyTracker, wrapDirtyClose, enableTableArrowNavigation, bindDblClickRowEdit, bindClickRowSelect, attachSearchInput } from './common/ui-helpers.js?v=ledger-records-20261010-1';
import { bootstrapPageCommon } from './common/page-bootstrap.js?v=ledger-records-20261010-1';
import { escapeHtml } from './common/util.js?v=ledger-records-20261010-1';

bootstrapPageCommon({
  page: 'customer',
  injectPickerModals: false,
  bindModalChrome: true,
  enableDateWeekdayAuto: false,
});

const alert = (message) => {
  const g = typeof window !== 'undefined' ? window.__hallaDialogs : null;
  const text = String(message ?? '');
  if (g && typeof g.alertDialog === 'function') {
    void g.alertDialog(text);
    return;
  }
  window.alert(text);
};

async function confirmAsync(message, options = {}) {
  const g = typeof window !== 'undefined' ? window.__hallaDialogs : null;
  const text = String(message ?? '');
  if (g && typeof g.confirmDialog === 'function') {
    return await g.confirmDialog(text, options);
  }
  return window.confirm(text);
}

const form = document.getElementById('customer-form');
const idModeSelect = document.getElementById('cust-id-mode');
const idInput = document.getElementById('cust-id');
const typeInput = document.getElementById('cust-type');
const groupSelect = document.getElementById('cust-group-select');
const groupInput = document.getElementById('cust-group');
const nameInput = document.getElementById('cust-name');
const statusInput = document.getElementById('cust-status');
const payInput = document.getElementById('cust-pay');
const openingInput = document.getElementById('cust-opening');
const termInput = document.getElementById('cust-term');
const memoInput = document.getElementById('cust-memo');
const btnFormClose = document.getElementById('btn-form-close');
const btnFormSaveContinue = document.getElementById('btn-form-save-continue');
const customerModal = document.getElementById('customer-modal');

// 구분 코드 추가 모달 관련 요소
const typeModal = document.getElementById('cust-type-modal');
const btnTypeOpen = document.getElementById('btn-open-cust-type-modal');
const btnTypeClose = document.getElementById('btn-cust-type-close');
const btnTypeSaveContinue = document.getElementById('btn-cust-type-save-continue');

// 분류 코드 추가 모달 관련 요소
const groupModal = document.getElementById('cust-group-modal');
const btnGroupModalClose = document.getElementById('btn-cust-group-close');
const btnGroupSaveContinue = document.getElementById('btn-cust-group-save-continue');

const btnLoadJson = document.getElementById('btn-load-json');
const btnBackupJson = document.getElementById('btn-customer-backup');
const btnRestoreJson = document.getElementById('btn-customer-restore');
const restoreFileInput = document.getElementById('customer-restore-file');
const btnRowNew = document.getElementById('btn-row-new');
const btnRowEdit = document.getElementById('btn-row-edit');
const btnRowDelete = document.getElementById('btn-row-delete');

const listBody = document.getElementById('customer-list');
const tableHeader = document.querySelector('.customer-main-card .tx-table thead');
const searchInput = document.getElementById('customer-search');
const countSpan = document.getElementById('customer-count');
const sumSpan = document.getElementById('customer-sum');

// 오른쪽 구분 코드 관리 박스 요소들
const typeList = document.getElementById('cust-type-list');
const typeForm = document.getElementById('cust-type-form');
const typeCodeInput = document.getElementById('cust-type-code');
const typeNameInput = document.getElementById('cust-type-name');
const typeIdModeSelect = document.getElementById('cust-type-id-mode');
const btnTypeEdit = document.getElementById('btn-cust-type-edit');
const btnTypeDelete = document.getElementById('btn-cust-type-delete');

// 분류 마스터 카드 요소들
const groupList = document.getElementById('cust-group-master-list');
const btnGroupOpen = document.getElementById('btn-open-cust-group-modal');
const btnGroupEdit = document.getElementById('btn-cust-group-edit');
const btnGroupDelete = document.getElementById('btn-cust-group-delete');
const groupForm = document.getElementById('cust-group-form');
const groupCodeInput = document.getElementById('cust-group-code');
const groupNameInput = document.getElementById('cust-group-name');
const groupTypeSelect = document.getElementById('cust-group-type');
const groupIdModeSelect = document.getElementById('cust-group-id-mode');

let currentEditingId = null;
let currentSort = { key: 'id', direction: 'asc' };
let selectedTypeCode = null;
let selectedGroupCode = null;
let editingTypeCode = null; // null이면 새로 추가, 값이 있으면 수정
let editingGroupCode = null;
let editingTypePrevName = null;
let editingGroupPrevName = null;
let cachedTypes = [];
let cachedGroups = [];
let customersById = new Map();
let customerModalEscOff = null;
let typeModalEscOff = null;
let groupModalEscOff = null;
let customerModalMouseDownIsOverlay = false;
let customerSubmitMode = 'close';
let customerTypeSubmitMode = 'close';
let customerGroupSubmitMode = 'close';
const customerModalDirty = createFormDirtyTracker(() => ({
  id: idInput ? idInput.value : '',
  type: typeInput ? typeInput.value : '',
  group: groupInput ? groupInput.value : '',
  name: nameInput ? nameInput.value : '',
  status: statusInput ? statusInput.value : '',
  pay: payInput ? payInput.value : '',
  opening: openingInput ? openingInput.value : '',
  term: termInput ? termInput.value : '',
  memo: memoInput ? memoInput.value : '',
}));
const customerTypeModalDirty = createFormDirtyTracker(() => ({
  code: typeCodeInput ? typeCodeInput.value : '',
  name: typeNameInput ? typeNameInput.value : '',
}));
const customerGroupModalDirty = createFormDirtyTracker(() => ({
  code: groupCodeInput ? groupCodeInput.value : '',
  name: groupNameInput ? groupNameInput.value : '',
  type: groupTypeSelect ? groupTypeSelect.value : '',
}));

const CUSTOMER_TERM_STORAGE_KEY = 'hallapa.customer.lastSettlementTerm';
const CUSTOMER_TERM_BY_TYPE_STORAGE_KEY = 'hallapa.customer.lastSettlementTermByType';

function rememberSettlementTerm({ typeName, term }) {
  const t = String(term ?? '').trim();
  if (!t) return;
  setStoredJson(CUSTOMER_TERM_STORAGE_KEY, t);
  if (typeName) {
    const map = getStoredJson(CUSTOMER_TERM_BY_TYPE_STORAGE_KEY, {});
    map[String(typeName)] = t;
    setStoredJson(CUSTOMER_TERM_BY_TYPE_STORAGE_KEY, map);
  }
}

function suggestSettlementTerm(typeName) {
  const map = getStoredJson(CUSTOMER_TERM_BY_TYPE_STORAGE_KEY, {});
  const byType = typeName ? map[String(typeName)] : '';
  if (byType) return String(byType);
  const last = getStoredJson(CUSTOMER_TERM_STORAGE_KEY, '');
  return String(last || '');
}
function closeCustomerModalCore() {
  resetForm();
  baseCloseCustomerModal();
}

const closeCustomerModalWithConfirm = wrapDirtyClose(customerModalDirty, closeCustomerModalCore);
const closeTypeModalWithConfirm = wrapDirtyClose(customerTypeModalDirty, baseCloseTypeModal);
const closeGroupModalWithConfirm = wrapDirtyClose(customerGroupModalDirty, baseCloseGroupModal);

function baseCloseCustomerModal() {
  if (customerModal) {
    closeModalOverlay(customerModal);
    if (typeof customerModalEscOff === 'function') {
      customerModalEscOff();
      customerModalEscOff = null;
    }
  }
}

function openCustomerModal() {
  if (customerModal) {
    openModalOverlay(customerModal);
    customerModalDirty.markClean();
    if (typeof customerModalEscOff === 'function') customerModalEscOff();
    customerModalEscOff = registerModalEscClose(customerModal, closeCustomerModalWithConfirm);
  }
}

function closeCustomerModal() {
  closeCustomerModalWithConfirm();
}

function openTypeModal() {
  if (typeModal) {
    openModalOverlay(typeModal);
    customerTypeModalDirty.markClean();
    if (typeof typeModalEscOff === 'function') typeModalEscOff();
    typeModalEscOff = registerModalEscClose(typeModal, closeTypeModalWithConfirm);
  }
}

function openGroupModal() {
  if (groupModal) {
    openModalOverlay(groupModal);
    customerGroupModalDirty.markClean();
    if (typeof groupModalEscOff === 'function') groupModalEscOff();
    groupModalEscOff = registerModalEscClose(groupModal, closeGroupModalWithConfirm);
  }
}

function baseCloseGroupModal() {
  if (groupModal) {
    closeModalOverlay(groupModal);
    if (typeof groupModalEscOff === 'function') {
      groupModalEscOff();
      groupModalEscOff = null;
    }
  }
}

function closeGroupModal() {
  closeGroupModalWithConfirm();
}

function baseCloseTypeModal() {
  if (typeModal) {
    closeModalOverlay(typeModal);
    if (typeof typeModalEscOff === 'function') {
      typeModalEscOff();
      typeModalEscOff = null;
    }
  }
}

function closeTypeModal() {
  closeTypeModalWithConfirm();
}

// 코드 규칙:
// 거래처 코드는 0001, 0002, ... 처럼 4자리 숫자로 공통 사용
function generateId(type, group, existing) {
  const nums = existing
    .map(c => {
      const id = String(c.id || '');
      const m = id.match(/(\d+)/); // 안에 숫자만 뽑아서 사용
      return m ? Number(m[1]) : NaN;
    })
    .filter(n => !Number.isNaN(n));

  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(nextNum).padStart(4, '0');
}

async function previewNextTypeCode() {
  if (!typeCodeInput) return;
  if (editingTypeCode) return;
  if (typeIdModeSelect && typeIdModeSelect.value === 'manual') return;

  const types = await getCustomerTypes();
  const nums = types
    .map(t => Number(t.code || '0'))
    .filter(n => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  typeCodeInput.value = String(next).padStart(2, '0');
}

async function previewNextGroupCode() {
  if (!groupCodeInput) return;
  if (editingGroupCode) return;
  if (groupIdModeSelect && groupIdModeSelect.value === 'manual') return;

  const groups = await getCustomerGroups();
  const nums = groups
    .map(g => Number(g.code || '0'))
    .filter(n => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  groupCodeInput.value = String(next).padStart(3, '0');
}

function renderList(customers, keyword) {
  customersById = new Map((customers || []).filter(Boolean).map((c) => [String(c.id || ''), c]));
  listBody.innerHTML = '';

  const statusLabel = {
    active: '활성',
    inactive: '중지',
  };

  let visibleCount = 0;
  let totalBalance = 0;

  customers
    .filter(c => {
      if (!keyword) return true;

      const q = keyword.toLowerCase().trim();

      const id = (c.id || '').toLowerCase();
      const typeName = String(c.type || '').split(',')[0].trim();
      const type = typeName.toLowerCase();
      const name = (c.name || '').toLowerCase();
      const groupName = String(c.group || '').trim();
      const group = groupName.toLowerCase();
      const memo = (c.memo || '').toLowerCase();
      const bal = String(Number(c.currentBalance ?? c.openingBalance ?? 0));

      const typeCode = String(
        (cachedTypes || []).find((t) => String(t?.name || '').trim() === typeName)?.code ||
        ''
      ).toLowerCase();

      const groupCode = String(
        (cachedGroups || []).find((g) => {
          const gn = String(g?.name || '').trim();
          if (!gn || gn !== groupName) return false;
          const gt = String(g?.type || '').trim();
          return !typeName || !gt || gt === typeName;
        })?.code ||
        (cachedGroups || []).find((g) => String(g?.name || '').trim() === groupName)?.code ||
        ''
      ).toLowerCase();

      // t: 로 시작하면 type 정확 검색 (예: "t:매출처")
      if (q.startsWith('t:')) {
        const tq = q.slice(2).trim();
        return type === tq || typeCode === tq;
      }

      // g: 로 시작하면 group 정확 검색 (예: "g:식당")
      if (q.startsWith('g:')) {
        const gq = q.slice(2).trim();
        return group === gq || groupCode === gq;
      }

      // 기본은 지금처럼 폭넓게 검색
      return (
        id.includes(q) ||
        type.includes(q) ||
        typeCode.includes(q) ||
        name.includes(q) ||
        group.includes(q) ||
        groupCode.includes(q) ||
        memo.includes(q) ||
        bal.includes(q)
      );
    })
    .forEach(c => {
      visibleCount += 1;
      totalBalance += Number(c.currentBalance ?? c.openingBalance ?? 0);
      const tr = document.createElement('tr');
      tr.dataset.id = c.id;
      const rawAmount = Number(c.currentBalance ?? c.openingBalance ?? 0);
      const amount = Number.isNaN(rawAmount) ? 0 : rawAmount;
      const amountClass = amount > 0 ? 'amount-plus' : amount < 0 ? 'amount-minus' : 'amount-zero';
      const absAmount = Math.abs(amount);
      const amountText = `${amount < 0 ? '-' : ''}${absAmount.toLocaleString()}`;
      tr.innerHTML = `
          <td>${statusLabel[c.status] || c.status || ''}</td>
          <td>${c.type}</td>
          <td>${escapeHtml(c.group || '')}</td>
          <td>${c.id || ''}</td>
          <td>${escapeHtml(c.name)}</td>
          <td>${
            c.payMethod === 'card' ? '카드결제'
            : c.payMethod === 'cash' ? '현금결제'
            : c.payMethod === 'transfer' ? '계좌이체'
            : c.payMethod === 'mixed' ? '복합/기타'
            : ''
          }</td>
          <td class="right ${amountClass}">${amountText}</td>
          <td>${escapeHtml(c.memo || '')}</td>
        `;
      listBody.appendChild(tr);
    });

  if (countSpan) {
    countSpan.textContent = visibleCount.toLocaleString();
  }
  if (sumSpan) {
    sumSpan.textContent = totalBalance.toLocaleString();
  }
}

// 메인 고객 목록: 방향키로 선택 행을 위/아래로 이동
if (listBody) {
  bindClickRowSelect(listBody, {
    rowSelector: 'tr[data-id]',
    onSelect: (row) => {
      const id = String(row?.dataset?.id || '');
      const customer = customersById.get(id);
      if (customer) loadToForm(customer);
    },
  });

  enableTableArrowNavigation(listBody, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });

  bindDblClickRowEdit(listBody, {
    rowSelector: 'tr[data-id]',
    editButton: btnRowEdit,
  });
}

function loadToForm(customer) {
  currentEditingId = customer.id;

  // 코드 필드: 항상 직접입력 모드로 전환해 수정 가능하게
  if (idModeSelect) idModeSelect.value = 'manual';
  if (idInput) {
    idInput.readOnly = false;
    idInput.value = customer.id || '';
  }

  // 구분/분류는 마스터값 기준으로 셀렉트와 동기화
  typeInput.value = customer.type || '매출처';
  // 선택된 구분에 맞게 분류 옵션을 먼저 재구성
  refreshGroupSelect();

  groupInput.value = customer.group || '';
  if (groupSelect) {
    const values = Array.from(groupSelect.options).map(o => o.value);
    if (values.includes(customer.group)) {
      groupSelect.value = customer.group;
    } else {
      groupSelect.value = '';
    }
  }
  nameInput.value = customer.name || '';
  statusInput.value = customer.status || 'active';
  payInput.value = customer.payMethod || 'card';
  openingInput.value = customer.openingBalance ?? 0;
  termInput.value = customer.settlementTerm || '';
  memoInput.value = customer.memo || '';
}

function sortCustomers(customers) {
  if (!currentSort.key) return customers;
  return sortByKey(customers, currentSort.key, currentSort.direction, ['openingBalance', 'currentBalance']);
}

function normalizeCustomerTypeToCategory(typeName) {
  const t = String(typeName || '').trim();
  if (!t) return '';
  if (t.includes('매출')) return 'sales';
  if (t.includes('매입')) return 'purchase';
  if (t.includes('지출')) return 'expense';
  return '';
}

function applyBalanceChange(running, tx) {
  const cat = String(tx?.category || '');
  const amount = Number(tx?.amount || 0) || 0;
  const payment = Number(tx?.payment || 0) || 0;
  const discount = Number(tx?.paymentDiscount || 0) || 0;
  if (cat === 'sales') return running + amount - (payment + discount);
  if (cat === 'purchase' || cat === 'expense') return running - amount + (payment + discount);
  return running;
}

function computeCustomerCurrentBalances(customers, transactions) {
  const txBySupplierId = new Map();
  const txBySupplierName = new Map();

  (transactions || []).filter(Boolean).forEach((tx) => {
    const supplierId = String(tx?.supplierId || '').trim();
    const supplierName = String(tx?.supplierName || '').trim();
    if (supplierId) {
      const arr = txBySupplierId.get(supplierId) || [];
      arr.push(tx);
      txBySupplierId.set(supplierId, arr);
      return;
    }
    if (supplierName) {
      const arr = txBySupplierName.get(supplierName) || [];
      arr.push(tx);
      txBySupplierName.set(supplierName, arr);
    }
  });

  const result = new Map();
  (customers || []).filter(Boolean).forEach((c) => {
    const id = String(c?.id || '').trim();
    if (!id) return;

    const typeName = String(c?.type || '').split(',')[0].trim();
    const targetCategory = normalizeCustomerTypeToCategory(typeName);

    const opening = Number(c?.openingBalance ?? 0) || 0;
    let running = opening;

    const related = [];
    const byId = txBySupplierId.get(id);
    if (byId && byId.length) related.push(...byId);

    const name = String(c?.name || '').trim();
    const byName = name ? txBySupplierName.get(name) : null;
    if (byName && byName.length) related.push(...byName);

    related.forEach((tx) => {
      if (targetCategory && String(tx?.category || '') !== targetCategory) return;
      running = applyBalanceChange(running, tx);
    });

    result.set(id, running);
  });

  return result;
}

async function reloadList() {
  const [customers, txs] = await Promise.all([getCustomers(), getTransactions()]);
  if (btnLoadJson) {
    btnLoadJson.hidden = (customers || []).length > 0;
  }

  const balanceMap = computeCustomerCurrentBalances(customers, txs);
  (customers || []).forEach((c) => {
    const id = String(c?.id || '').trim();
    if (!id) {
      c.currentBalance = Number(c?.openingBalance ?? 0) || 0;
      return;
    }
    c.currentBalance = balanceMap.has(id)
      ? Number(balanceMap.get(id) || 0)
      : Number(c?.openingBalance ?? 0) || 0;
  });

  const keyword = searchInput ? searchInput.value.trim() : '';
  const sorted = sortCustomers(customers);
  renderList(sorted, keyword);
}

// 거래처 구분 코드 목록 로딩 및 폼/셀렉트 반영
async function loadCustomerTypes() {
  const types = await getCustomerTypes();
  cachedTypes = types;

  // 리스트 표시 (테이블 tbody)
  if (typeList) {
    typeList.innerHTML = '';
    types.forEach(t => {
      const tr = document.createElement('tr');
      tr.dataset.code = t.code;
      tr.dataset.name = t.name;
      tr.innerHTML = `<td>${t.code}</td><td>${t.name}</td>`;
      typeList.appendChild(tr);
    });

    bindClickRowSelect(typeList, {
      rowSelector: 'tr[data-code]',
      onSelect: async (row) => {
        selectedTypeCode = String(row?.dataset?.code || '');
        const name = String(row?.dataset?.name || '');
        if (searchInput) searchInput.value = name;
        // 구분을 선택하면 왼쪽 분류 목록도 해당 구분만 보이도록 필터링
        renderGroupMasterList(name);
        await reloadList();
      },
    });

    // 구분 코드 리스트도 방향키/엔터로 이동 가능하게 처리
    enableTableArrowNavigation(typeList, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });

    bindDblClickRowEdit(typeList, {
      rowSelector: 'tr[data-code]',
      editButton: btnTypeEdit,
    });
  }

  // 메인 폼의 구분 셀렉트 옵션 구성 (값은 이름, 표시에는 코드 포함)
  if (typeInput) {
    typeInput.innerHTML = [
      '<option value="">구분 선택</option>',
      ...types.map(t => `<option value="${t.name}">${t.code} - ${t.name}</option>`),
    ].join('');
  }

  // 분류 모달의 "적용 구분" 셀렉트도 동일한 구분 목록으로 구성
  if (groupTypeSelect) {
    groupTypeSelect.innerHTML = [
      '<option value="">전체</option>',
      ...types.map(t => `<option value="${t.name}">${t.name}</option>`),
    ].join('');
  }

  // 새 구분코드 미리보기: 가장 큰 코드 + 1
  if (typeCodeInput) {
    const nums = types
      .map(t => Number(t.code || '0'))
      .filter(n => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    typeCodeInput.value = String(next).padStart(2, '0');
  }
}

// 분류 코드 목록(왼쪽 카드) 렌더링: 선택된 구분(type)에 따라 필터 가능
function renderGroupMasterList(filterTypeName = '') {
  if (!groupList) return;

  groupList.innerHTML = '';

  const safeFilter = String(filterTypeName || '').trim();
  const groupsToShow = (cachedGroups || []).filter((g) => {
    if (!safeFilter) return true;
    return String(g?.type || '').trim() === safeFilter;
  });

  groupsToShow.forEach(g => {
    const tr = document.createElement('tr');
    tr.dataset.code = g.code;
    tr.dataset.name = g.name;
    tr.innerHTML = `<td>${g.type || ''}</td><td>${g.code}</td><td>${g.name}</td>`;
    groupList.appendChild(tr);
  });

  bindClickRowSelect(groupList, {
    rowSelector: 'tr[data-code]',
    onSelect: async (row) => {
      selectedGroupCode = String(row?.dataset?.code || '');
      const name = String(row?.dataset?.name || '');
      if (searchInput) searchInput.value = name;
      await reloadList();
    },
  });
}

// 분류 코드 목록 로딩
async function loadCustomerGroups() {
  const groups = await getCustomerGroups();

  // 혹시 예전 데이터에 type(적용 구분)이 비어 있으면 이름 기준으로 보정
  const toPatch = [];
  groups.forEach(g => {
    if (g.type) return;
    let t = '';
    switch (g.name) {
      case '식당':
      case '매장':
      case '온라인':
        t = '매출처';
        break;
      case '정육':
      case '기타식품':
      case '야채':
        t = '매입처';
        break;
      case '가게경비':
      case '고정경비':
      case '급여':
        t = '지출처';
        break;
      default:
        t = '';
        break;
    }
    if (t) {
      g.type = t;
      toPatch.push(g);
    }
  });

  if (toPatch.length) {
    await Promise.all(toPatch.map(updateCustomerGroup));
  }

  cachedGroups = groups;

  if (groupList) {
    // 기본은 전체 분류를 보여주고, 구분 클릭 시 renderGroupMasterList에서 필터링
    renderGroupMasterList();

    // 분류 마스터 리스트도 방향키/엔터로 이동 가능하게 처리
    enableTableArrowNavigation(groupList, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });

    bindDblClickRowEdit(groupList, {
      rowSelector: 'tr[data-code]',
      editButton: btnGroupEdit,
    });
  }
  refreshGroupSelect();
}

// 현재 선택된 구분(type)에 맞게 거래처 폼의 분류 셀렉트 옵션 구성
function refreshGroupSelect() {
  if (!groupSelect) return;
  const currentType = String(typeInput ? typeInput.value : '').trim();
  const prev = groupSelect.value;

  const available = (cachedGroups || []).filter((g) => {
    // 구분을 아직 선택하지 않았으면 전체 분류를 보여주고,
    // 구분을 선택한 뒤에는 해당 구분(type)에 맞는 분류만 보여줌
    if (!currentType) return true;
    const t = String(g?.type || '').trim();
    return !t || t === currentType;
  });

  groupSelect.innerHTML = [
    '<option value="">분류 선택</option>',
    ...available.map((g) => {
      const code = String(g?.code || '').trim();
      const name = String(g?.name || '').trim();
      return `<option value="${name}">${code} - ${name}</option>`;
    }),
  ].join('');

  if (prev && available.some(g => g.name === prev)) {
    groupSelect.value = prev;
  } else {
    groupSelect.value = '';
  }
}

async function previewNextId() {
  if (!idInput) return;
  if (idModeSelect && idModeSelect.value === 'manual') return; // 수동 모드에서는 미리보기 안 함

  const seq = ++previewNextIdSeq;
  const customers = await getCustomers();
  const tempType = typeInput.value;
  const tempGroup = groupInput.value;
  const nextId = generateId(tempType, tempGroup, customers);
  if (seq !== previewNextIdSeq) return;
  idInput.value = nextId;
}

let previewNextIdSeq = 0;

// customers.json에서 불러온 거래처 목록을 기준으로
// 구분 / 분류 마스터에 빠진 항목을 자동으로 추가
async function syncMastersFromCustomers(customers) {
  // 1) 거래처에서 사용된 구분(type) 목록
  const typeNames = Array.from(
    new Set(customers.map(c => c.type).filter(Boolean))
  );

  // 2) 거래처에서 사용된 분류(group) 목록 + 해당 구분 정보
  const groupMap = new Map(); // name -> { name, type }
  customers.forEach(c => {
    if (!c.group) return;
    if (!groupMap.has(c.group)) {
      groupMap.set(c.group, { name: c.group, type: c.type || '' });
    }
  });

  // 기존 구분/분류 마스터 조회
  const existingTypes = await getCustomerTypes();
  const existingGroups = await getCustomerGroups();

  const existingTypeNames = new Set(existingTypes.map(t => t.name));
  const existingGroupNames = new Set(existingGroups.map(g => g.name));

  let nextTypeCodeNum = existingTypes
    .map(t => Number(t.code || '0'))
    .filter(n => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);

  let nextGroupCodeNum = existingGroups
    .map(g => Number(g.code || '0'))
    .filter(n => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);

  // 빠진 구분 자동 추가
  for (const typeName of typeNames) {
    if (existingTypeNames.has(typeName)) continue;
    nextTypeCodeNum += 1;
    const code = String(nextTypeCodeNum).padStart(2, '0');
    await addCustomerType({ code, name: typeName });
    existingTypeNames.add(typeName);
  }

  // 빠진 분류 자동 추가
  for (const { name, type } of groupMap.values()) {
    if (existingGroupNames.has(name)) continue;
    nextGroupCodeNum += 1;
    const code = String(nextGroupCodeNum).padStart(3, '0');
    await addCustomerGroup({ code, name, type: type || '' });
    existingGroupNames.add(name);
  }
}

async function loadCustomersFromJson() {
  try {
    const res = await fetch('data/customers.json');
    if (!res.ok) {
      alert('customers.json을 불러오지 못했습니다.');
      return;
    }
    const data = await res.json();
    await bulkInsertCustomers(data);

    // JSON 데이터 기준으로 구분/분류 마스터 자동 동기화
    await syncMastersFromCustomers(data);

    // 화면 갱신
    await loadCustomerTypes();
    await loadCustomerGroups();

    alert('JSON 거래처 데이터를 불러왔습니다.');
    resetForm();
    await reloadList();
  } catch (err) {
    console.error(err);
    alert('JSON 불러오기 중 오류가 발생했습니다.');
  }
}
function resetForm() {
  currentEditingId = null;
  form.reset();
  statusInput.value = 'active';
  groupSelect.value = '';
  payInput.value = 'card';
  openingInput.value = 0;
  if (idInput) idInput.value = '';
  if (idModeSelect) idModeSelect.value = 'auto';
  // 폼을 비울 때는 다시 자동 모드 + 읽기전용으로 되돌림
  if (idInput) idInput.readOnly = true;
}

if (btnFormClose) {
  btnFormClose.addEventListener('click', () => {
    closeCustomerModal();
  });
}

if (btnFormSaveContinue && form) {
  btnFormSaveContinue.addEventListener('click', () => {
    customerSubmitMode = 'continue';
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.querySelector('button[type="submit"]')?.click();
  });
}

// 모달 바깥 영역 클릭으로는 닫히지 않도록 한다.
// 닫기는 모달 내부 버튼과 ESC 키로만 처리.
if (customerModal) {
  // 의도적으로 배경 클릭 이벤트를 사용하지 않음
}

if (typeModal) {
  // 의도적으로 배경 클릭 이벤트를 사용하지 않음
}

if (groupModal) {
  // 의도적으로 배경 클릭 이벤트를 사용하지 않음
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const customers = await getCustomers();

  const name = nameInput.value.trim();
  const type = typeInput.value.trim();
  const group = groupInput.value.trim();

  if (!name) {
    alert('거래처명을 입력하세요.');
    nameInput.focus();
    return;
  }
  if (!type) {
    alert('구분을 선택하세요.');
    typeInput.focus();
    return;
  }
  if (!group) {
    alert('분류를 입력하세요.');
    groupInput.focus();
    return;
  }

  const customer = {
    id: currentEditingId || '',
    group,
    name,
    type,
    status: statusInput.value,
    payMethod: payInput.value,
    openingBalance: Number(openingInput.value || '0'),
    settlementTerm: termInput.value,
    memo: memoInput.value,
  };

  // 정산조건은 저장 시 최근값을 기억해 다음 연속 입력에 자동 추천한다.
  rememberSettlementTerm({ typeName: customer.type, term: customer.settlementTerm });

  if (!currentEditingId) {
    if (idModeSelect && idModeSelect.value === 'manual') {
      customer.id = (idInput.value || '').trim();
      if (!customer.id) {
        alert('코드를 입력하세요.');
        idInput.focus();
        return;
      }
      const exists = customers.some(c => c.id === customer.id);
      if (exists) {
        alert('이미 사용 중인 코드입니다. 다른 코드를 입력하세요.');
        idInput.focus();
        return;
      }
    } else {
      customer.id = generateId(customer.type, customer.group, customers);
    }
    await addCustomer(customer);
  } else {
    // 수정 시에도 코드가 비어 있으면 막기
    if (!customer.id) {
      alert('코드를 입력하세요.');
      if (idInput) idInput.focus();
      return;
    }
    // 다른 거래처와 코드 중복인지 확인
    const others = customers.filter(c => c.id !== currentEditingId);
    const exists = others.some(c => c.id === customer.id);
    if (exists) {
      alert('이미 사용 중인 코드입니다. 다른 코드를 입력하세요.');
      if (idInput) idInput.focus();
      return;
    }
    await updateCustomer(customer);
  }

  if (customerSubmitMode === 'continue') {
    customerSubmitMode = 'close';
    const keepIdMode = idModeSelect ? idModeSelect.value : 'auto';
    const keepType = typeInput ? typeInput.value : '';
    const keepGroupSelect = groupSelect ? groupSelect.value : '';
    const keepPay = payInput ? payInput.value : '';
    const keepStatus = statusInput ? statusInput.value : 'active';

    resetForm();

    // 기본정보 유지: 코드 모드 / 구분 / 분류 / 결제수단 / 상태 / 정산조건
    if (idModeSelect) idModeSelect.value = keepIdMode || 'auto';
    if (idInput) {
      if (idModeSelect && idModeSelect.value === 'manual') {
        idInput.readOnly = false;
        idInput.value = '';
      } else {
        idInput.readOnly = true;
      }
    }

    if (typeInput && keepType) typeInput.value = keepType;
    refreshGroupSelect();
    if (groupSelect) {
      const hasOption = Array.from(groupSelect.options || []).some(
        (o) => o.value === keepGroupSelect,
      );
      groupSelect.value = hasOption ? keepGroupSelect : '';
      const evt = new Event('change', { bubbles: true });
      groupSelect.dispatchEvent(evt);
    }

    if (payInput && keepPay) payInput.value = keepPay;
    if (statusInput) statusInput.value = keepStatus || 'active';
    // 정산조건: 빈값으로 두지 않고 최근 사용값을 자동 추천(자동 채움)
    if (termInput) termInput.value = suggestSettlementTerm(keepType);

    if (idModeSelect && idModeSelect.value === 'auto') {
      await previewNextId();
    }
    if (customerModalDirty) customerModalDirty.markClean();
    await reloadList();
    nameInput?.focus();
    return;
  }

  customerSubmitMode = 'close';
  resetForm();
  baseCloseCustomerModal();
  await reloadList();
});

// 분류 선택 시 입력칸에 자동 반영
groupSelect.addEventListener('change', () => {
  if (groupSelect.value) {
    groupInput.value = groupSelect.value;
  } else {
    groupInput.value = '';
  }
  previewNextId();
});

// 테이블 위 '수정' 버튼: 선택된 거래처를 수정 모드로 전환
if (btnRowEdit) {
  btnRowEdit.addEventListener('click', () => {
    if (!currentEditingId) {
      alert('먼저 수정할 거래처 행을 클릭해서 선택하세요.');
      return;
    }
    openCustomerModal();
    nameInput.focus();
  });
}

// 테이블 위 '삭제' 버튼: 선택된 거래처를 바로 삭제
if (btnRowDelete) {
  btnRowDelete.addEventListener('click', async () => {
    if (!currentEditingId) {
      alert('먼저 삭제할 거래처 행을 클릭해서 선택하세요.');
      return;
    }

    const customerId = String(currentEditingId || '').trim();
    if (!customerId) return;

    // 거래가 없으면 완전 삭제, 거래가 있으면 비활성(미사용) 처리
    let hasRelatedTx = false;
    try {
      const txs = await getTransactions();
      hasRelatedTx = (txs || []).some(
        (tx) => String(tx?.supplierId || '').trim() === customerId,
      );
    } catch (_) {
      hasRelatedTx = true;
    }

    if (!hasRelatedTx) {
      const ok = await confirmAsync(
        '이 거래처는 거래 내역이 없습니다. 완전 삭제할까요?\n\n- 삭제 후 복구할 수 없습니다',
        { title: '삭제 확인', okText: '삭제', cancelText: '취소', tone: 'danger' },
      );
      if (!ok) return;
      await deleteCustomer(customerId);
      resetForm();
      await reloadList();
      return;
    }

    const ok = await confirmAsync(
      '선택한 거래처를 비활성(미사용) 처리할까요?\n\n- 과거 거래는 유지됩니다\n- 신규 거래 입력/선택에서는 숨김 처리됩니다',
      { title: '비활성 확인', okText: '확인', cancelText: '취소', tone: 'danger' },
    );
    if (!ok) return;

    // 삭제 대신 비활성 처리
    const customers = await getCustomers();
    const target = (customers || []).find(
      (c) => String(c?.id || '') === String(customerId),
    );
    if (target) {
      target.status = 'inactive';
      await updateCustomer(target);
    }
    resetForm();
    await reloadList();
  });
}

// 테이블 위 '신규등록' 버튼: 폼을 리셋하고 새 입력 모드로 전환
if (btnRowNew) {
  btnRowNew.addEventListener('click', async () => {
    resetForm();

    // 왼쪽 "구분" 카드에서 선택된 구분이 있으면 해당 구분을 기본값으로 설정
    let defaultTypeName = '';
    if (selectedTypeCode && cachedTypes && cachedTypes.length) {
      const t = cachedTypes.find(type => type.code === selectedTypeCode);
      if (t && t.name) {
        defaultTypeName = t.name;
      }
    }

    // 왼쪽 "분류" 카드에서 선택된 분류가 있으면, 그 분류의 구분/이름을 우선으로 사용
    let defaultGroupName = '';
    if (selectedGroupCode && cachedGroups && cachedGroups.length) {
      const g = cachedGroups.find(group => group.code === selectedGroupCode);
      if (g) {
        if (g.type) {
          defaultTypeName = g.type;
        }
        defaultGroupName = g.name || '';
      }
    }

    // 구분 기본값 적용
    if (typeInput && defaultTypeName) {
      typeInput.value = defaultTypeName;
    }

    // 선택된 구분에 맞춰 분류 셀렉트 옵션 재구성
    refreshGroupSelect();

    // 분류 기본값 적용 (옵션에 있을 때만)
    if (groupSelect && defaultGroupName) {
      const hasOption = Array.from(groupSelect.options).some(o => o.value === defaultGroupName);
      if (hasOption) {
        groupSelect.value = defaultGroupName;
        // change 이벤트를 강제로 발생시켜 hidden input 및 코드 미리보기까지 동기화
        const evt = new Event('change', { bubbles: true });
        groupSelect.dispatchEvent(evt);
      }
    }

    await previewNextId();
    openCustomerModal();
    nameInput.focus();
  });
}

// 구분 코드 추가 버튼: 모달 열기
if (btnTypeOpen) {
  btnTypeOpen.addEventListener('click', () => {
    editingTypeCode = null;
    editingTypePrevName = null;
    if (typeIdModeSelect) {
      typeIdModeSelect.value = 'auto';
      typeIdModeSelect.disabled = false;
    }
    if (typeCodeInput) typeCodeInput.readOnly = true;
    previewNextTypeCode();
    openTypeModal();
    typeNameInput?.focus();
  });
}

// 구분 코드 모달 닫기 버튼
if (btnTypeClose) {
  btnTypeClose.addEventListener('click', () => {
    if (typeNameInput) typeNameInput.value = '';
    closeTypeModal();
  });
}

// 분류 코드 추가 버튼: 모달 열기 (추가 모드)
if (btnGroupOpen) {
  btnGroupOpen.addEventListener('click', () => {
    editingGroupCode = null;
    editingGroupPrevName = null;
    if (groupNameInput) groupNameInput.value = '';
    if (groupIdModeSelect) {
      groupIdModeSelect.value = 'auto';
      groupIdModeSelect.disabled = false;
    }
    if (groupCodeInput) groupCodeInput.readOnly = true;
    previewNextGroupCode();

    // 기본 적용 구분: 현재 거래처 폼의 구분 값으로 설정, 없으면 전체
    if (groupTypeSelect) {
      groupTypeSelect.value = typeInput ? typeInput.value : '';
    }

    openGroupModal();
    groupNameInput?.focus();
  });
}

// 분류 코드 모달 닫기 버튼
if (btnGroupModalClose) {
  btnGroupModalClose.addEventListener('click', () => {
    if (groupNameInput) groupNameInput.value = '';
    closeGroupModal();
  });
}

// 코드 입력 모드 변경 시
if (idModeSelect) {
  idModeSelect.addEventListener('change', () => {
    if (idModeSelect.value === 'auto') {
      if (idInput) idInput.readOnly = true;
      previewNextId();
    } else {
      if (idInput) {
        idInput.readOnly = false;
        idInput.value = '';
        idInput.focus();
      }
    }
  });
  // 초기 상태: 자동 모드이면 읽기 전용 + 미리보기
  if (idModeSelect.value === 'auto' && idInput) {
    idInput.readOnly = true;
  }
}

if (typeIdModeSelect) {
  typeIdModeSelect.addEventListener('change', () => {
    if (typeIdModeSelect.value === 'auto') {
      if (typeCodeInput) typeCodeInput.readOnly = true;
      previewNextTypeCode();
    } else {
      if (typeCodeInput) {
        typeCodeInput.readOnly = false;
        typeCodeInput.value = '';
        typeCodeInput.focus();
      }
    }
  });
  if (typeIdModeSelect.value === 'auto' && typeCodeInput) {
    typeCodeInput.readOnly = true;
  }
}

if (groupIdModeSelect) {
  groupIdModeSelect.addEventListener('change', () => {
    if (groupIdModeSelect.value === 'auto') {
      if (groupCodeInput) groupCodeInput.readOnly = true;
      previewNextGroupCode();
    } else {
      if (groupCodeInput) {
        groupCodeInput.readOnly = false;
        groupCodeInput.value = '';
        groupCodeInput.focus();
      }
    }
  });
  if (groupIdModeSelect.value === 'auto' && groupCodeInput) {
    groupCodeInput.readOnly = true;
  }
}

// 구분(type) 변경 시, 현재 타입에 맞게 분류 옵션을 다시 구성
typeInput.addEventListener('change', () => {
  refreshGroupSelect();
  if (groupSelect) groupSelect.value = '';
  groupInput.value = '';
  previewNextId();
});

if (btnLoadJson) {
  btnLoadJson.addEventListener('click', async () => {
    const ok = await confirmAsync('현재 거래처 데이터를 모두 지우고 JSON에서 다시 불러옵니다. 계속할까요?', {
      title: '불러오기 확인',
      okText: '계속',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!ok) return;
    await loadCustomersFromJson();
  });
}

if (btnBackupJson) {
  btnBackupJson.addEventListener('click', async () => {
    try {
      const types = await getCustomerTypes();
      const groups = await getCustomerGroups();
      const customers = await getCustomers();
      const payload = { types, groups, customers };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      a.href = url;
      a.download = `customer-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('거래처 백업(JSON) 중 오류가 발생했습니다.');
    }
  });
}

if (btnRestoreJson) {
  btnRestoreJson.addEventListener('click', () => {
    // 일부 환경에서 동적 input.click()이 차단될 수 있어, HTML에 미리 둔 input을 사용한다.
    if (!restoreFileInput) {
      alert('복원용 파일 선택기를 찾지 못했습니다.');
      return;
    }
    restoreFileInput.value = '';
    restoreFileInput.click();
  });
}

if (restoreFileInput) {
  restoreFileInput.addEventListener('change', async () => {
    if (!restoreFileInput.files || !restoreFileInput.files[0]) return;
    const file = restoreFileInput.files[0];

    const ok = await confirmAsync(
      '현재 거래처/구분/분류 데이터를 모두 지우고 백업 파일로 복원합니다. 계속할까요?',
      { title: '복원 확인', okText: '복원', cancelText: '취소', tone: 'danger' },
    );
    if (!ok) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const isArray = Array.isArray(data);
      const hasTypesKey =
        !isArray &&
        data &&
        typeof data === 'object' &&
        Object.prototype.hasOwnProperty.call(data, 'types');
      const hasGroupsKey =
        !isArray &&
        data &&
        typeof data === 'object' &&
        Object.prototype.hasOwnProperty.call(data, 'groups');

      const customers = isArray
        ? data
        : Array.isArray(data?.customers)
          ? data.customers
          : [];
      const types = hasTypesKey && Array.isArray(data?.types) ? data.types : [];
      const groups = hasGroupsKey && Array.isArray(data?.groups) ? data.groups : [];

      if (!Array.isArray(customers)) {
        alert('복원 파일 형식이 올바르지 않습니다.');
        return;
      }

      await bulkInsertCustomers(customers);

      if (hasTypesKey) {
        await bulkReplaceCustomerTypes(types);
      }

      if (hasGroupsKey) {
        await bulkReplaceCustomerGroups(groups);
      }

      if (!hasTypesKey || !hasGroupsKey) {
        await syncMastersFromCustomers(customers);
      }

      await loadCustomerTypes();
      await loadCustomerGroups();
      resetForm();
      await reloadList();
      alert('거래처 데이터를 백업 파일로 복원했습니다.');
    } catch (err) {
      console.error(err);
      alert('거래처 복원(JSON) 중 오류가 발생했습니다.');
    }
  });
}

if (searchInput) {
  attachSearchInput(searchInput, () => {
    reloadList();
  });
}

// 헤더 클릭으로 정렬: data-sort-key가 있는 열만 정렬
if (tableHeader) {
  tableHeader.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;

    const key = th.dataset.sortKey;
    if (!key) return; // data-sort-key가 없는 열은 무시

    if (currentSort.key === key) {
      currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort.key = key;
      currentSort.direction = 'asc';
    }

    reloadList();
  });
}
reloadList();
previewNextId();

installDbAutoRefresh({
  refresh: async () => {
    await loadCustomerTypes();
    await loadCustomerGroups();
    await reloadList();
    previewNextId();
  },
  isBusy: () => document.body.classList.contains('modal-open'),
});

// 구분 코드 관리 폼 이벤트
if (typeForm) {
  typeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (typeNameInput?.value || '').trim();
    const codeInput = (typeCodeInput?.value || '').trim();
    if (!name) {
      alert('구분 이름을 입력하세요.');
      typeNameInput?.focus();
      return;
    }

    const types = await getCustomerTypes();

    // 이름 중복 방지 (현재 수정 중인 코드 제외)
    const existsName = types.some(t => t.name === name && t.code !== editingTypeCode);
    if (existsName) {
      alert('이미 등록된 구분입니다.');
      typeNameInput?.focus();
      return;
    }
    // 코드 값 결정 및 중복 검사
    const mode = typeIdModeSelect ? typeIdModeSelect.value : '';
    let code = codeInput;
    if (!editingTypeCode && mode === 'auto') {
      const nums = types
        .map(t => Number(t.code || '0'))
        .filter(n => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      code = String(next).padStart(2, '0');
      if (typeCodeInput) typeCodeInput.value = code;
    } else if (!editingTypeCode && !code) {
      const nums = types
        .map(t => Number(t.code || '0'))
        .filter(n => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      code = String(next).padStart(2, '0');
    }
    if (!code) {
      alert('구분코드를 입력하세요.');
      typeCodeInput?.focus();
      return;
    }

    const existsCode = types.some(t => t.code === code && t.code !== editingTypeCode);
    if (existsCode) {
      alert('이미 사용 중인 구분코드입니다. 다른 코드를 입력하세요.');
      typeCodeInput?.focus();
      return;
    }

    const prevName = editingTypeCode ? String(editingTypePrevName || '').trim() : '';

    if (!editingTypeCode) {
      await addCustomerType({ code, name });
    } else {
      // 코드가 바뀌면 기존 레코드를 삭제 후 새 코드로 추가
      if (code !== editingTypeCode) {
        await deleteCustomerType(editingTypeCode);
        await addCustomerType({ code, name });
      } else {
        await updateCustomerType({ code, name });
      }
    }

    // 구분 이름이 바뀌면 customers.type / customer_groups.type / transactions.supplierType까지 같이 치환
    // (구분은 마스터에서만 수정, 실데이터는 따라오게)
    if (prevName && prevName !== name) {
      try {
        await renameCustomerTypeNameEverywhere(prevName, name);
      } catch (err) {
        console.error(err);
        alert('구분명 변경 동기화 중 오류가 발생했습니다.');
      }
    }

    if (typeNameInput) typeNameInput.value = '';
    await loadCustomerTypes();
    // 구분 변경은 분류(필터)와 거래처 목록에도 영향
    await loadCustomerGroups();
    await reloadList();
    refreshGroupSelect();

    if (customerTypeSubmitMode === 'continue') {
      customerTypeSubmitMode = 'close';
      const keepMode = typeIdModeSelect ? typeIdModeSelect.value : 'auto';
      editingTypeCode = null;
      editingTypePrevName = null;
      if (typeIdModeSelect) {
        typeIdModeSelect.value = keepMode || 'auto';
        typeIdModeSelect.disabled = false;
      }
      if (typeCodeInput) {
        if (typeIdModeSelect && typeIdModeSelect.value === 'manual') {
          typeCodeInput.readOnly = false;
          typeCodeInput.value = '';
        } else {
          typeCodeInput.readOnly = true;
          typeCodeInput.value = '';
        }
      }
      if (typeNameInput) typeNameInput.value = '';
      if (typeIdModeSelect && typeIdModeSelect.value === 'auto') {
        await previewNextTypeCode();
      }
      if (customerTypeModalDirty) customerTypeModalDirty.markClean();
      typeNameInput?.focus();
      return;
    }

    customerTypeSubmitMode = 'close';
    closeTypeModal();
  });
}

// 분류 코드 관리 폼 이벤트
if (groupForm) {
  groupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (groupNameInput?.value || '').trim();
    const codeInput = (groupCodeInput?.value || '').trim();
    if (!name) {
      alert('분류 이름을 입력하세요.');
      groupNameInput?.focus();
      return;
    }

    const groups = await getCustomerGroups();

    // 이름 중복 방지 (현재 수정 중인 코드 제외)
    const existsName = groups.some(g => g.name === name && g.code !== editingGroupCode);
    if (existsName) {
      alert('이미 등록된 분류입니다.');
      groupNameInput?.focus();
      return;
    }
    const type = groupTypeSelect ? groupTypeSelect.value : '';

    // 코드 값 결정 및 중복 검사
    const mode = groupIdModeSelect ? groupIdModeSelect.value : '';
    let code = codeInput;
    if (!editingGroupCode && mode === 'auto') {
      const nums = groups
        .map(g => Number(g.code || '0'))
        .filter(n => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      code = String(next).padStart(3, '0');
      if (groupCodeInput) groupCodeInput.value = code;
    } else if (!editingGroupCode && !code) {
      const nums = groups
        .map(g => Number(g.code || '0'))
        .filter(n => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      code = String(next).padStart(3, '0');
    }
    if (!code) {
      alert('분류코드를 입력하세요.');
      groupCodeInput?.focus();
      return;
    }

    const existsCode = groups.some(g => g.code === code && g.code !== editingGroupCode);
    if (existsCode) {
      alert('이미 사용 중인 분류코드입니다. 다른 코드를 입력하세요.');
      groupCodeInput?.focus();
      return;
    }

    const prevName = editingGroupCode ? String(editingGroupPrevName || '').trim() : '';

    if (!editingGroupCode) {
      await addCustomerGroup({ code, name, type });
    } else {
      // 코드가 바뀌면 기존 레코드를 삭제 후 새 코드로 추가
      if (code !== editingGroupCode) {
        await deleteCustomerGroup(editingGroupCode);
        await addCustomerGroup({ code, name, type });
      } else {
        await updateCustomerGroup({ code, name, type });
      }
    }

    // 분류 이름이 바뀌면 customers.group / transactions.supplierGroup까지 같이 치환
    if (prevName && prevName !== name) {
      try {
        await renameCustomerGroupNameEverywhere(prevName, name);
      } catch (err) {
        console.error(err);
        alert('분류명 변경 동기화 중 오류가 발생했습니다.');
      }
    }

    if (groupNameInput) groupNameInput.value = '';
    await loadCustomerGroups();
    await reloadList();
    refreshGroupSelect();

    if (customerGroupSubmitMode === 'continue') {
      customerGroupSubmitMode = 'close';
      const keepMode = groupIdModeSelect ? groupIdModeSelect.value : 'auto';
      const keepGroupType = groupTypeSelect ? groupTypeSelect.value : '';
      editingGroupCode = null;
      editingGroupPrevName = null;
      if (groupIdModeSelect) {
        groupIdModeSelect.value = keepMode || 'auto';
        groupIdModeSelect.disabled = false;
      }
      if (groupCodeInput) {
        if (groupIdModeSelect && groupIdModeSelect.value === 'manual') {
          groupCodeInput.readOnly = false;
          groupCodeInput.value = '';
        } else {
          groupCodeInput.readOnly = true;
          groupCodeInput.value = '';
        }
      }
      if (groupNameInput) groupNameInput.value = '';
      if (groupTypeSelect) groupTypeSelect.value = keepGroupType;
      if (groupIdModeSelect && groupIdModeSelect.value === 'auto') {
        await previewNextGroupCode();
      }
      if (customerGroupModalDirty) customerGroupModalDirty.markClean();
      groupNameInput?.focus();
      return;
    }

    customerGroupSubmitMode = 'close';
    closeGroupModal();
  });
}

if (btnTypeSaveContinue && typeForm) {
  btnTypeSaveContinue.addEventListener('click', () => {
    customerTypeSubmitMode = 'continue';
    if (typeof typeForm.requestSubmit === 'function') typeForm.requestSubmit();
    else typeForm.querySelector('button[type="submit"]')?.click();
  });
}

if (btnGroupSaveContinue && groupForm) {
  btnGroupSaveContinue.addEventListener('click', () => {
    customerGroupSubmitMode = 'continue';
    if (typeof groupForm.requestSubmit === 'function') groupForm.requestSubmit();
    else groupForm.querySelector('button[type="submit"]')?.click();
  });
}

// 구분 수정 버튼
if (btnTypeEdit) {
  btnTypeEdit.addEventListener('click', () => {
    if (!selectedTypeCode) {
      alert('먼저 수정할 구분을 선택하세요.');
      return;
    }
    const target = cachedTypes.find(t => t.code === selectedTypeCode);
    if (!target) return;
    editingTypeCode = target.code;
    editingTypePrevName = target.name || '';
    if (typeIdModeSelect) {
      typeIdModeSelect.value = 'manual';
      typeIdModeSelect.disabled = true;
    }
    if (typeCodeInput) {
      typeCodeInput.readOnly = false;
      typeCodeInput.value = target.code;
    }
    if (typeNameInput) typeNameInput.value = target.name;
    openTypeModal();
    typeNameInput?.focus();
  });
}

// 구분 삭제 버튼
if (btnTypeDelete) {
  btnTypeDelete.addEventListener('click', async () => {
    if (!selectedTypeCode) {
      alert('먼저 삭제할 구분을 선택하세요.');
      return;
    }

    // 선택된 구분 정보 찾기
    const targetType = cachedTypes.find(t => t.code === selectedTypeCode);
    const typeName = targetType ? targetType.name : '';

    // 1단계: 이 구분을 사용하는 분류가 있는지 확인
    const groupsUsingType = (await getCustomerGroups()).filter(g => g.type === typeName);
    if (groupsUsingType.length > 0) {
      alert('이 구분을 사용하는 분류가 있어서 삭제할 수 없습니다.\n먼저 해당 분류들을 삭제하세요.');
      return;
    }

    // 2단계: 이 구분을 사용하는 거래처가 있는지 확인
    const customersUsingType = (await getCustomers()).filter(c => c.type === typeName);
    if (customersUsingType.length > 0) {
      alert('이 구분을 사용하는 거래처가 있어서 삭제할 수 없습니다.\n먼저 해당 거래처들을 삭제하거나 구분을 변경하세요.');
      return;
    }

    const ok = await confirmAsync('선택한 구분을 삭제하시겠습니까?', {
      title: '삭제 확인',
      okText: '삭제',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteCustomerType(selectedTypeCode);
    selectedTypeCode = null;
    await loadCustomerTypes();
  });
}

// 분류 수정 버튼
if (btnGroupEdit) {
  btnGroupEdit.addEventListener('click', () => {
    if (!selectedGroupCode) {
      alert('먼저 수정할 분류를 선택하세요.');
      return;
    }
    const target = cachedGroups.find(g => g.code === selectedGroupCode);
    if (!target) return;
    editingGroupCode = target.code;
    editingGroupPrevName = target.name || '';
    if (groupIdModeSelect) {
      groupIdModeSelect.value = 'manual';
      groupIdModeSelect.disabled = true;
    }
    if (groupCodeInput) {
      groupCodeInput.readOnly = false;
      groupCodeInput.value = target.code;
    }
    if (groupNameInput) groupNameInput.value = target.name;
    if (groupTypeSelect) groupTypeSelect.value = target.type || '';
    openGroupModal();
    groupNameInput?.focus();
  });
}

// 분류 삭제 버튼
if (btnGroupDelete) {
  btnGroupDelete.addEventListener('click', async () => {
    if (!selectedGroupCode) {
      alert('먼저 삭제할 분류를 선택하세요.');
      return;
    }

    // 선택된 분류 정보 찾기 (이름 기준으로 거래처 사용 여부 확인)
    const targetGroup = cachedGroups.find(g => g.code === selectedGroupCode);
    const groupName = targetGroup ? targetGroup.name : '';

    // 이 분류를 사용하는 거래처가 있는지 확인
    const customersUsingGroup = (await getCustomers()).filter(c => c.group === groupName);
    if (customersUsingGroup.length > 0) {
      alert('이 분류를 사용하는 거래처가 있어서 삭제할 수 없습니다.\n먼저 해당 거래처들을 삭제하거나 분류를 변경하세요.');
      return;
    }

    const ok = await confirmAsync('선택한 분류를 삭제하시겠습니까?', {
      title: '삭제 확인',
      okText: '삭제',
      cancelText: '취소',
      tone: 'danger',
    });
    if (!ok) return;
    await deleteCustomerGroup(selectedGroupCode);
    selectedGroupCode = null;
    await loadCustomerGroups();
  });
}

// 초기 구분/분류 코드 목록 로딩
loadCustomerTypes();
loadCustomerGroups();
