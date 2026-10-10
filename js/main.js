import { buildSalesCustomerBalances } from './common/sales-customer-balance.js?v=app-20261010-11';
import { runHomeJob } from './home-worker-client.js?v=app-20261010-11';
import { createHomePager } from './home-pagination.js?v=app-20261010-11';
import { getTransactions, updateTransaction, getAllLedgerTx, getCashflowTypes, getCashflowItems, getCustomers, exportHallapaDbSnapshot, restoreHallapaDbSnapshot } from './db.js?v=app-20261010-11';
import { initDateFilter } from './common/date-filter.js?v=app-20261010-11';
import { applyAmountColoring, openModalOverlay, closeModalOverlay, registerModalEscClose, attachSearchInput } from './common/ui-helpers.js?v=app-20261010-11';
import { formatWeekdayLabel, getQuickRange, includesIgnoreCase } from './common/util.js?v=app-20261010-11';
import { initDateWeekdayAuto } from './common/date-weekday-box.js?v=app-20261010-11';
import { installDbAutoRefresh } from './common/app-events.js?v=app-20261010-11';
import { bootstrapPageCommon } from './common/page-bootstrap.js?v=app-20261010-11';

const btnDbBackup = document.getElementById('btn-home-db-backup');
const btnDbRestore = document.getElementById('btn-home-db-restore');
const restoreFileInput = document.getElementById('home-db-restore-file');

const EXPECTED_DB_NAME = 'hallapa_db';
const EXPECTED_APP_NAME = 'hallapa';

bootstrapPageCommon({
  page: 'home',
  injectPickerModals: false,
  bindModalChrome: true,
  enableDateWeekdayAuto: false,
});

function alert(message, options) {
  const api = window.__hallaDialogs;
  if (api && typeof api.alertDialog === 'function') {
    api.alertDialog(String(message ?? ''), options);
    return;
  }
  window.alert(message);
}

async function confirmAsync(message, options) {
  const api = window.__hallaDialogs;
  if (api && typeof api.confirmDialog === 'function') {
    return await api.confirmDialog(String(message ?? ''), options);
  }
  return window.confirm(message);
}

async function promptAsync(message, options) {
  const api = window.__hallaDialogs;
  if (api && typeof api.promptDialog === 'function') {
    return await api.promptDialog(String(message ?? ''), options);
  }
  return window.prompt(message);
}

function pad2(n) {
  const v = Number(n) || 0;
  return String(v).padStart(2, '0');
}

function makeBackupFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `hallapa-backup-${y}${m}${dd}-${hh}${mm}${ss}.json`;
}

function makePreRestoreBackupFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `hallapa-pre-restore-${y}${m}${dd}-${hh}${mm}${ss}.json`;
}

function downloadJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isHallapaDbSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (!snapshot.stores || typeof snapshot.stores !== 'object') return false;
  const meta = snapshot.meta;
  if (!meta || typeof meta !== 'object') return false;

  const dbName = String(meta.dbName || '').trim();
  if (!dbName) return false;
  if (dbName !== EXPECTED_DB_NAME) return false;

  if (typeof meta.dbVersion === 'undefined' || meta.dbVersion === null) return false;

  const exportedAt = String(meta.exportedAt || meta.exportedAtIso || '').trim();
  if (!exportedAt) return false;

  return true;
}

function buildHallapaSnapshotSummary(snapshot) {
  const meta = snapshot && snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta : {};
  const stores = snapshot && snapshot.stores && typeof snapshot.stores === 'object' ? snapshot.stores : {};

  const dbName = String(meta.dbName || '').trim();
  const dbVersion = meta.dbVersion;
  const exportedAt = String(meta.exportedAt || meta.exportedAtIso || '').trim();
  const app = String(meta.app || '').trim();

  const storeNames = Object.keys(stores).sort((a, b) => a.localeCompare(b));
  const lines = [];

  lines.push('백업 파일 요약');
  if (dbName) lines.push(`- DB: ${dbName}`);
  if (typeof dbVersion !== 'undefined' && dbVersion !== null && String(dbVersion).trim() !== '') {
    lines.push(`- 버전: ${dbVersion}`);
  }
  if (exportedAt) lines.push(`- 백업시각: ${exportedAt}`);
  if (app) lines.push(`- 앱: ${app}`);
  lines.push('');
  lines.push('스토어별 건수');

  let total = 0;
  for (const name of storeNames) {
    const rows = stores[name];
    const count = Array.isArray(rows) ? rows.length : 0;
    total += count;
    lines.push(`- ${name}: ${count.toLocaleString()}`);
  }
  lines.push('');
  lines.push(`총합: ${total.toLocaleString()}건`);

  return lines.join('\n');
}

async function handleDbBackupClick() {
  try {
    const snapshot = await exportHallapaDbSnapshot();
    downloadJson(makeBackupFilename(), snapshot);
  } catch (e) {
    console.error(e);
    alert('백업 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
  }
}

async function handleDbRestoreFile(file) {
  if (!file) return;

  let text = '';
  try {
    text = await file.text();
  } catch (e) {
    console.error(e);
    alert('파일을 읽을 수 없습니다. 다시 시도해 주세요.');
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    alert('JSON 파일을 읽을 수 없습니다. 파일 형식을 확인해 주세요.');
    return;
  }

  if (!isHallapaDbSnapshot(parsed)) {
    alert('백업 파일 형식이 올바르지 않습니다. (meta/stores/dbName/dbVersion/exportedAt 구조를 확인해 주세요)');
    return;
  }

  // app 필드는 운영 실수 방지용(구버전 백업과의 호환을 위해 없으면 경고만 한다)
  const appName = String(parsed?.meta?.app || '').trim();
  if (appName && appName !== EXPECTED_APP_NAME) {
    alert(`백업 파일 app 값이 다릅니다. (파일: ${appName})\n복구를 중단합니다.`);
    return;
  }

  const summary = buildHallapaSnapshotSummary(parsed);
  const okStart = await confirmAsync(
    `${summary}\n\n전체 복구를 진행할까요?\n\n- 덮어쓰기 복구: 기존 데이터 삭제 후 복구\n- 추가(병합) 복구: 기존 데이터는 유지하고, 없는 데이터만 추가\n\n복구 후 화면이 새로고침됩니다`,
    { title: '복구 확인', okText: '계속', cancelText: '취소', tone: 'warning' },
  );
  if (!okStart) return;

  // 복구 전 현재 DB 자동 백업(다운로드) 시도
  try {
    const currentSnapshot = await exportHallapaDbSnapshot();
    downloadJson(makePreRestoreBackupFilename(), currentSnapshot);
  } catch (e) {
    console.error(e);
  }

  const typed = await promptAsync('정말로 복구(덮어쓰기)를 실행하려면 "복구" 라고 입력해 주세요.', {
    title: '복구 확인',
    okText: '확인',
    cancelText: '취소',
    tone: 'danger',
    placeholder: '복구',
  });
  if (String(typed || '').trim() !== '복구') {
    alert('복구가 취소되었습니다.');
    return;
  }

  try {
    await restoreHallapaDbSnapshot(parsed, { mode: 'overwrite', clearFirst: true });
    alert('복구가 완료되었습니다. 확인을 누르면 새로고침됩니다.');
    location.reload();
  } catch (e) {
    console.error(e);
    alert('복구 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
  }
}

if (btnDbBackup) {
  btnDbBackup.addEventListener('click', async () => {
    await handleDbBackupClick();
  });
}

if (btnDbRestore) {
  btnDbRestore.addEventListener('click', () => {
    if (restoreFileInput) {
      restoreFileInput.value = '';
      restoreFileInput.click();
    }
  });
}

if (restoreFileInput) {
  restoreFileInput.addEventListener('change', async (e) => {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    await handleDbRestoreFile(file);
  });
}

const listBody = document.getElementById('tx-list');
const homePager = createHomePager(listBody, 100);
let homeRenderGeneration = 0;
const homeTxCountEl = document.getElementById('home-tx-count');
const homeTxTotalSalesEl = document.getElementById('home-tx-total-sales');
const homeTxTotalReceiptEl = document.getElementById('home-tx-total-receipt');
const homeTxTotalPurchaseEl = document.getElementById('home-tx-total-purchase');
const homeTxTotalPayEl = document.getElementById('home-tx-total-pay');
const homeTxTotalExpenseEl = document.getElementById('home-tx-total-expense');
const homeTxTotalInEl = document.getElementById('home-tx-total-in');
const homeTxTotalOutEl = document.getElementById('home-tx-total-out');
const homeTxTotalSalesBalanceEl = document.getElementById('home-tx-total-sales-balance');
const homeTxTotalPurchaseBalanceEl = document.getElementById('home-tx-total-purchase-balance');
const homeTxTotalBalanceEl = document.getElementById('home-tx-total-balance');
const summaryCards = document.getElementById('home-summary-cards');
const moneyCards = document.getElementById('home-money-cards');
const workingCards = document.getElementById('home-working-cards');

const homeSearchInput = document.getElementById('home-search');
let homeSearchQuery = '';
let homeSearchTimer = null;

let breakdownModalEl = document.getElementById('home-breakdown-modal');
let breakdownModalTitleEl = document.getElementById('home-breakdown-title');
let breakdownModalContentEl = document.getElementById('home-breakdown-content');

let breakdownModalEscOff = null;

// 홈 대시보드(하단 테이블) 필터: 요약카드/상세 항목 클릭 시 적용
let homeDashboardFilter = null;
// 요약 카드는 표시하되 거래 목록은 항목/전체보기 선택 후에만 만든다.
let homeTransactionViewRequested = false;

// 과거 데이터(거래처 코드 누락)를 페이지 로드 후 1회만 자동 보정한다.
let hasRepairedMissingSuppliersOnce = false;

function pickSummaryLabel(values, hasMissing) {
  const arr = Array.from(values || [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'));

  const uniqueCount = arr.length;
  const totalKinds = uniqueCount + (hasMissing ? 1 : 0);
  if (totalKinds <= 0) return '';

  if (totalKinds === 1) {
    if (uniqueCount === 1) return arr[0];
    return '(미지정)';
  }

  const first = uniqueCount > 0 ? arr[0] : '(미지정)';
  return `${first} 외 ${totalKinds - 1}`;
}

async function repairMissingSupplierIdsOnce(transactions, customers) {
  if (hasRepairedMissingSuppliersOnce) return 0;
  hasRepairedMissingSuppliersOnce = true;

  const list = Array.isArray(transactions) ? transactions : [];
  const custList = Array.isArray(customers) ? customers : [];

  const byId = new Map(custList.map((c) => [String(c?.id ?? '').trim(), c]));
  const byName = new Map();
  for (const c of custList) {
    const name = String(c?.name ?? '').trim();
    const id = String(c?.id ?? '').trim();
    if (!name || !id) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(c);
  }

  let repaired = 0;
  for (const tx of list) {
    if (!tx) continue;
    const currentSupplierId = String(tx?.supplierId ?? '').trim();
    if (currentSupplierId) continue;

    const seed = String(tx?.supplierName ?? '').trim();
    if (!seed) continue;

    let resolved = null;
    // supplierName이 코드(거래처ID)로 저장된 레거시 케이스
    if (byId.has(seed)) {
      resolved = byId.get(seed);
    } else if (byName.has(seed)) {
      const matches = byName.get(seed) || [];
      if (matches.length === 1) resolved = matches[0];
    }

    if (!resolved || resolved.id == null) continue;

    const next = { ...tx, supplierId: String(resolved.id) };
    if (!String(next?.supplierName || '').trim()) {
      next.supplierName = String(resolved.name || resolved.id || '').trim();
    }

    try {
      await updateTransaction(next);
      // 로컬 리스트도 즉시 반영(리렌더 시 재조회 비용 최소화)
      tx.supplierId = next.supplierId;
      if (next.supplierName) tx.supplierName = next.supplierName;
      repaired += 1;
    } catch (_) {
      // ignore
    }
  }

  return repaired;
}

function normalizeDashboardTypeLabel(typeLabel) {
  const t = String(typeLabel || '').trim();
  // 화면 표시 라벨과 동일하게 맞춘다.
  if (t === '매출' || t === '매입' || t === '지출' || t === '입금' || t === '출금') return t;
  return t;
}

function getDashboardFilterFromLedgerCard(key, label) {
  const k = String(key || '').trim();
  const name = String(label || '').trim();
  if (!k) return null;

  // 손익변동(장부현황): 통장/현금/신용카드의 기간 내 변동(입금-출금) 합계
  if (k === 'profit') {
    return { mode: 'ledgerTypeNames', keywords: ['통장', '현금', '신용카드'], label: name || '손익변동' };
  }

  // 회사자금: 자금 변동은 입출금(ledger) 라인이므로 입금/출금만 표시
  if (k === 'companyFunds') {
    return { mode: 'ledgerAll', label: name || '회사자금' };
  }

  // ledger 카드 key는 typeCode(A01 등)
  return { mode: 'ledgerType', typeCode: k, typeName: name || k };
}

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

function getDashboardFilterFromSummaryKey(summaryKey, groupName) {
  const key = String(summaryKey || '').trim();
  const group = String(groupName || '').trim();

  // column: 값이 있는 행만 남기고 싶을 때 사용(예: 수금/지불)
  if (key === 'sales') return { type: '매출', group, column: '' };
  if (key === 'receipt') return { type: '매출', group, column: 'receipt' };
  if (key === 'ar') return { type: '매출', group, column: '' };
  if (key === 'purchase') return { type: '매입', group, column: '' };
  if (key === 'pay') return { type: '매입', group, column: 'pay' };
  if (key === 'ap') return { type: '매입', group, column: '' };
  if (key === 'expense') return { type: '지출', group, column: '' };
  return null;
}

async function applyHomeDashboardFilter(filter) {
  homeTransactionViewRequested = true;
  homeDashboardFilter = filter;
  await renderList();
  const table = document.getElementById('home-main-table');
  if (table && table.scrollIntoView) table.scrollIntoView({ block: 'start' });
}

async function applyHomeDashboardFilterFromCard(section, key, label) {
  const s = String(section || '').trim();
  const k = String(key || '').trim();
  if (s === 'summary') {
    const filter = getDashboardFilterFromSummaryKey(k, '');
    if (!filter) return;
    await applyHomeDashboardFilter({ mode: 'summary', ...filter });
    return;
  }

  if (s === 'ledger') {
    const f = getDashboardFilterFromLedgerCard(k, String(label || '').trim());
    if (!f) return;
    await applyHomeDashboardFilter(f);
    return;
  }
}

async function applyHomeDashboardFilterFromBreakdownRow(rowEl) {
  if (!rowEl) return;
  const kind = String(rowEl.dataset.homeFilterKind || '').trim();
  const key = String(rowEl.dataset.homeFilterKey || '').trim();
  const group = String(rowEl.dataset.homeFilterGroup || '').trim();
  if (kind === 'summary') {
    const filter = getDashboardFilterFromSummaryKey(key, group);
    if (!filter) return;
    await applyHomeDashboardFilter({ mode: 'summary', ...filter });
    closeHomeBreakdownModal();
    return;
  }

  if (kind === 'ledgerTypeNames') {
    const keywords = String(key || '')
      .split('|')
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    await applyHomeDashboardFilter({ mode: 'ledgerTypeNames', keywords, label: group || '' });
    closeHomeBreakdownModal();
    return;
  }

  if (kind === 'ledgerTypes') {
    const typeCodes = String(key || '')
      .split(',')
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    await applyHomeDashboardFilter({ mode: 'ledgerTypes', typeCodes, label: group || '' });
    closeHomeBreakdownModal();
    return;
  }

  if (kind === 'types') {
    const types = String(key || '')
      .split('|')
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    await applyHomeDashboardFilter({ mode: 'types', types, label: group || '' });
    closeHomeBreakdownModal();
    return;
  }

  if (kind === 'ledger') {
    // ledger 상세에서는 group에 표시명을 넣어 필터링한다.
    const name = group || '';
    if (!name) return;
    await applyHomeDashboardFilter({ mode: 'ledger', ledgerName: name });
    closeHomeBreakdownModal();
  }
}

function closeHomeBreakdownModal() {
  if (!breakdownModalEl) breakdownModalEl = document.getElementById('home-breakdown-modal');
  if (!breakdownModalEl) return;
  closeModalOverlay(breakdownModalEl);
  if (typeof breakdownModalEscOff === 'function') {
    breakdownModalEscOff();
    breakdownModalEscOff = null;
  }
}

function openHomeBreakdownModal(titleText) {
  if (!breakdownModalEl) breakdownModalEl = document.getElementById('home-breakdown-modal');
  if (!breakdownModalTitleEl) breakdownModalTitleEl = document.getElementById('home-breakdown-title');
  if (!breakdownModalContentEl) breakdownModalContentEl = document.getElementById('home-breakdown-content');
  if (!breakdownModalEl) return;
  if (breakdownModalTitleEl) breakdownModalTitleEl.textContent = String(titleText || '상세');
  openModalOverlay(breakdownModalEl);
  if (typeof breakdownModalEscOff === 'function') breakdownModalEscOff();
  breakdownModalEscOff = registerModalEscClose(breakdownModalEl, closeHomeBreakdownModal);
}

let dateFrom = '';
let dateTo = '';

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 날짜 입력 옆 요일 박스(있는 경우) 자동 갱신
initDateWeekdayAuto({ todayYMD, formatWeekdayLabel });

function filterByDate(tx) {
  if (!dateFrom && !dateTo) return true;
  const d = String(tx.date || '');
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

function filterUpToDate(tx, cutoff) {
  if (!cutoff) return true;
  const d = String(tx.date || '');
  if (!d) return false;
  return d <= cutoff;
}

function normalizeCategory(tx) {
  const cat = String(tx.category || '').trim();
  if (cat) return cat;
  const legacy = String(tx.type || '').trim();
  if (legacy === 'income') return 'sales';
  if (legacy === 'expense') return 'expense';
  return '';
}

function getCategoryLabel(cat) {
  if (cat === 'sales') return '매출';
  if (cat === 'purchase') return '매입';
  if (cat === 'expense') return '지출';
  return '';
}

async function computeCashflowBalancesAsOf(cutoff) {
  let cashflowTypes = [];
  let cashflowItems = [];
  let ledgerAll = [];

  try {
    cashflowTypes = await getCashflowTypes();
  } catch (_) {
    cashflowTypes = [];
  }
  try {
    cashflowItems = await getCashflowItems();
  } catch (_) {
    cashflowItems = [];
  }
  try {
    ledgerAll = await getAllLedgerTx();
  } catch (_) {
    ledgerAll = [];
  }

  const openingByType = new Map();
  (cashflowItems || []).forEach((it) => {
    const typeCode = it && it.typeCode ? String(it.typeCode) : '';
    if (!typeCode) return;
    const opening = Number(it.openingBalance != null ? it.openingBalance : 0) || 0;
    const prev = openingByType.get(typeCode) || 0;
    openingByType.set(typeCode, prev + opening);
  });

  const itemByCode = new Map();
  (cashflowItems || []).forEach((it) => {
    if (!it || it.code == null) return;
    itemByCode.set(String(it.code), it);
  });

  const deltaByType = new Map();
  (ledgerAll || [])
    .filter((tx) => filterUpToDate(tx, cutoff))
    .forEach((tx) => {
      let code = tx && tx.cashflowCode ? String(tx.cashflowCode) : '';
      if (!code && tx && tx.accountId) code = String(tx.accountId);
      if (!code) return;
      const amount = Number(tx.amount) || 0;
      if (!(amount > 0)) return;

      let typeCode = '';
      const item = itemByCode.get(code);
      if (item) {
        typeCode = item.typeCode ? String(item.typeCode) : '';
      } else {
        // cashflow_items에 없으면 코드 자체를 구분(code)로 사용
        typeCode = code;
      }
      if (!typeCode) return;
      const sign = tx.flow === 'in' ? 1 : -1;
      const prev = deltaByType.get(typeCode) || 0;
      deltaByType.set(typeCode, prev + sign * amount);
    });

  const nameByType = new Map();
  (cashflowTypes || []).forEach((t) => {
    if (!t || t.code == null) return;
    nameByType.set(String(t.code), String(t.name || '').trim());
  });

  const balanceByType = new Map();
  (cashflowTypes || []).forEach((t) => {
    if (!t || t.code == null) return;
    const code = String(t.code);
    const opening = openingByType.get(code) || 0;
    const delta = deltaByType.get(code) || 0;
    balanceByType.set(code, opening + delta);
  });

  // cashflow_types에 없는 코드가 ledger에만 있는 경우도 보정
  deltaByType.forEach((delta, code) => {
    if (balanceByType.has(code)) return;
    const opening = openingByType.get(code) || 0;
    balanceByType.set(code, opening + delta);
  });
  openingByType.forEach((opening, code) => {
    if (balanceByType.has(code)) return;
    const delta = deltaByType.get(code) || 0;
    balanceByType.set(code, opening + delta);
  });

  return { balanceByType, nameByType, itemByCode };
}

function findBalanceSumByName(balanceByType, nameByType, keyword) {
  const key = String(keyword || '').trim();
  if (!key) return 0;
  let sum = 0;
  balanceByType.forEach((bal, code) => {
    const name = nameByType.get(String(code)) || '';
    if (name.includes(key)) {
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

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clampPositive(n) {
  const v = Number(n) || 0;
  return v > 0 ? v : 0;
}

function toRoundedNumber(n) {
  return Math.round(Number(n) || 0);
}

function formatWonRounded(n) {
  return toRoundedNumber(n).toLocaleString('ko-KR') + '원';
}

function formatWonAbsRounded(n) {
  return Math.abs(toRoundedNumber(n)).toLocaleString('ko-KR') + '원';
}

function amountStrong(amountValue, options = {}) {
  const value = toRoundedNumber(amountValue);
  const force = String(options.force || '').trim();
  const showAbs = Boolean(options.showAbs);
  const label = showAbs ? formatWonAbsRounded(value) : formatWonRounded(value);
  const forceAttr = force ? ` data-amount-force="${force}"` : '';
  return `<strong class="home-amount" data-amount-color="1" data-amount-value="${value}"${forceAttr}>${label}</strong>`;
}

function sumMapValue(map, key) {
  return Number(map.get(String(key)) || 0) || 0;
}

function uniqueSorted(arr) {
  const set = new Set();
  (arr || []).forEach((v) => {
    const s = String(v || '').trim();
    if (!s) return;
    set.add(s);
  });
  return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'ko'));
}

function getCustomerGroupName(c) {
  const g = String(c?.group || '').trim();
  return g || '미분류';
}

function renderToggleCard({ section, key, label, amountHtml, controlsId }) {
  void controlsId;
  return `
    <button type="button" class="home-summary-card" data-home-section="${section}" data-home-key="${escapeHtml(key)}" data-home-label="${escapeHtml(label)}" aria-haspopup="dialog">
      <span class="home-summary-card-left">
        <span class="home-summary-card-label">${escapeHtml(label)}</span>
        <span class="home-summary-toggle-caret" aria-hidden="true">▾</span>
      </span>
      ${amountHtml}
    </button>
  `;
}

function renderSalesBreakdown({ containerEl, salesByGroup }) {
  if (!containerEl) return;

  const groups = [
    { key: '매장', label: '매장매출 합계' },
    { key: '식당', label: '식당매출 합계' },
    { key: '온라인', label: '온라인매출 합계' },
  ];

  containerEl.innerHTML = `
    <div class="home-summary-breakdown-title">매출 분류별 합계</div>
    <div class="home-summary-breakdown-rows">
      ${groups
        .map((g) => {
          const v = sumMapValue(salesByGroup, g.key);
          return `
            <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="sales" data-home-filter-group="${escapeHtml(g.key)}">
              <span class="label">${g.label}</span>
              <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(v)}">${toRoundedNumber(v).toLocaleString('ko-KR')}원</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderSummaryBreakdown({ containerEl, selectedKey, breakdownMaps }) {
  if (!containerEl) return;
  const key = String(selectedKey || '');
  if (!key) {
    containerEl.innerHTML = '';
    return;
  }

  if (key === 'sales') {
    renderSalesBreakdown({ containerEl, salesByGroup: breakdownMaps.salesByGroup });
    return;
  }

  const titleByKey = {
    receipt: '수금 분류별 합계',
    ar: '미수 분류별 합계',
    purchase: '매입 분류별 합계',
    pay: '지불 분류별 합계',
    ap: '미지급금 분류별 합계',
    expense: '지출 분류별 합계',
    profit: '손익 구성',
  };
  const title = titleByKey[key] || '상세';

  if (key === 'profit') {
    const { salesTotalForDashboard, sumPurchaseAmount, sumExpenseOut } = breakdownMaps;
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">${escapeHtml(title)}</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="sales" data-home-filter-group=""><span class="label">매출합계</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(salesTotalForDashboard)}">${toRoundedNumber(salesTotalForDashboard).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="purchase" data-home-filter-group=""><span class="label">매입합계</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(-Math.abs(sumPurchaseAmount))}" data-amount-force="minus">${toRoundedNumber(Math.abs(sumPurchaseAmount)).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="expense" data-home-filter-group=""><span class="label">지출합계</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(-Math.abs(sumExpenseOut))}" data-amount-force="minus">${toRoundedNumber(Math.abs(sumExpenseOut)).toLocaleString('ko-KR')}원</span></div>
      </div>
    `;
    return;
  }

  const mapByKey = {
    receipt: breakdownMaps.receiptByGroup,
    ar: breakdownMaps.receivableByGroup,
    purchase: breakdownMaps.purchaseByGroup,
    pay: breakdownMaps.payByGroup,
    ap: breakdownMaps.payableByGroup,
    expense: breakdownMaps.expenseByGroup,
  };
  const map = mapByKey[key];

  const groupListByKey = {
    receipt: breakdownMaps.salesGroups,
    ar: breakdownMaps.salesGroups,
    purchase: breakdownMaps.purchaseGroups,
    pay: breakdownMaps.purchaseGroups,
    ap: breakdownMaps.purchaseGroups,
    expense: breakdownMaps.expenseGroups,
  };
  let groups = (groupListByKey[key] || []).slice();
  if (!groups.length && map) {
    groups = uniqueSorted(Array.from(map.keys()));
  }
  if (!groups.length) groups = ['미분류'];

  containerEl.innerHTML = `
    <div class="home-summary-breakdown-title">${escapeHtml(title)}</div>
    <div class="home-summary-breakdown-rows">
      ${groups
        .map((g) => {
          const amt = map ? sumMapValue(map, g) : 0;
          return `
            <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="${escapeHtml(key)}" data-home-filter-group="${escapeHtml(String(g || '미분류'))}">
              <span class="label">${escapeHtml(String(g || '미분류'))}</span>
              <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(amt)}">${toRoundedNumber(amt).toLocaleString('ko-KR')}원</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

async function computeCashflowItemBalancesAsOf(cutoff) {
  let cashflowItems = [];
  let ledgerAll = [];
  try {
    cashflowItems = await getCashflowItems();
  } catch (_) {
    cashflowItems = [];
  }
  try {
    ledgerAll = await getAllLedgerTx();
  } catch (_) {
    ledgerAll = [];
  }

  const itemByCode = new Map();
  (cashflowItems || []).forEach((it) => {
    if (!it || it.code == null) return;
    itemByCode.set(String(it.code), it);
  });

  const openingByCode = new Map();
  (cashflowItems || []).forEach((it) => {
    if (!it || it.code == null) return;
    const code = String(it.code);
    openingByCode.set(code, Number(it.openingBalance != null ? it.openingBalance : 0) || 0);
  });

  const deltaByCode = new Map();
  (ledgerAll || [])
    .filter((tx) => filterUpToDate(tx, cutoff))
    .forEach((tx) => {
      // 장부목록(항목) 상세는 itemCode(A0002...) 기준으로 집계해야 한다.
      // ledger_tx에는 cashflowCode(장부구분 A02 등)와 cashflowItemCode(항목 A0002 등)가
      // 함께 들어갈 수 있으므로, 항목 코드를 최우선으로 사용한다.
      let code = '';
      const itemCode = String(tx?.cashflowItemCode || '').trim();
      if (itemCode && itemByCode.has(itemCode)) {
        code = itemCode;
      } else {
        const cashflowCode = String(tx?.cashflowCode || '').trim();
        const accountId = String(tx?.accountId || '').trim();
        if (cashflowCode && itemByCode.has(cashflowCode)) code = cashflowCode;
        else if (accountId && itemByCode.has(accountId)) code = accountId;
      }

      if (!code) return;
      const amount = Number(tx.amount) || 0;
      if (!(amount > 0)) return;
      const sign = tx.flow === 'in' ? 1 : -1;
      deltaByCode.set(code, (Number(deltaByCode.get(code)) || 0) + sign * amount);
    });

  return { cashflowItems, itemByCode, openingByCode, deltaByCode };
}

function renderLedgerBreakdown({ containerEl, selectedKey, ledgerContext }) {
  if (!containerEl) return;
  const key = String(selectedKey || '');
  if (!key) {
    containerEl.innerHTML = '';
    return;
  }

  if (key === 'profit') {
    const {
      profit,
      profitDeltaBank,
      profitDeltaCash,
      profitDeltaCredit,
      profitTypeNameKeywords,
    } = ledgerContext;
    const keywords = Array.isArray(profitTypeNameKeywords) && profitTypeNameKeywords.length
      ? profitTypeNameKeywords
      : ['통장', '현금', '신용카드'];

    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">손익변동</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="통장" data-home-filter-group="통장">
          <span class="label">통장</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(profitDeltaBank)}">${toRoundedNumber(profitDeltaBank).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="현금" data-home-filter-group="현금">
          <span class="label">현금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(profitDeltaCash)}">${toRoundedNumber(profitDeltaCash).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="신용카드" data-home-filter-group="신용카드">
          <span class="label">신용카드</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(profitDeltaCredit)}">${toRoundedNumber(profitDeltaCredit).toLocaleString('ko-KR')}원</span>
        </div>
      </div>
    `;
    return;
  }

  if (key === 'companyFunds') {
    const {
      cashAndBankBalance,
      bondBalance,
      savingsBalance,
      creditCardBalance,
      cardReceivableBalance,
      receivableByCustomer,
      payableSigned,
    } = ledgerContext;

    // 요청: 펼침 패널 안에서는 마지막 합계(회사자금)는 생략(카드에 이미 표시됨)
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">회사자금 구성</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="통장|현금" data-home-filter-group="통장+현금">
          <span class="label">통장+현금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(cashAndBankBalance)}">${toRoundedNumber(cashAndBankBalance).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="채권|채권금액|체권|체권금액" data-home-filter-group="채권금액">
          <span class="label">채권금액</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(bondBalance)}">${toRoundedNumber(bondBalance).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="적금" data-home-filter-group="적금">
          <span class="label">적금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(savingsBalance)}">${toRoundedNumber(savingsBalance).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="신용카드" data-home-filter-group="신용카드">
          <span class="label">신용카드</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(creditCardBalance)}">${toRoundedNumber(creditCardBalance).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledgerTypeNames" data-home-filter-key="카드미수금" data-home-filter-group="카드미수금">
          <span class="label">카드미수금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(cardReceivableBalance)}">${toRoundedNumber(cardReceivableBalance).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="ar" data-home-filter-group="">
          <span class="label">미수금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(receivableByCustomer)}">${toRoundedNumber(receivableByCustomer).toLocaleString('ko-KR')}원</span>
        </div>
        <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="summary" data-home-filter-key="ap" data-home-filter-group="">
          <span class="label">미지급금</span>
          <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(payableSigned)}">${toRoundedNumber(payableSigned).toLocaleString('ko-KR')}원</span>
        </div>
      </div>
    `;
    return;
  }

  // cashflow_types code
  const typeCode = key;
  const typeName = (ledgerContext.nameByType.get(String(typeCode)) || String(typeCode)).trim();
  const items = (ledgerContext.cashflowItems || []).filter((it) => String(it?.typeCode || '') === String(typeCode));

  if (!items.length) {
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">${escapeHtml(typeName)} 상세</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row"><span class="label">항목 없음</span><span class="amount">0원</span></div>
      </div>
    `;
    return;
  }

  const rows = items
    .map((it) => {
      const code = String(it?.code ?? '');
      const name = String(it?.name || it?.title || it?.accountName || it?.memo || code).trim() || code;
      const opening = Number(ledgerContext.openingByCode.get(code)) || 0;
      const delta = Number(ledgerContext.deltaByCode.get(code)) || 0;
      const bal = opening + delta;
      return { code, name, bal };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));

  containerEl.innerHTML = `
    <div class="home-summary-breakdown-title">${escapeHtml(typeName)} 상세</div>
    <div class="home-summary-breakdown-rows">
      ${rows
        .map((r) => {
          const v = Number(r.bal) || 0;
          return `
            <div class="home-summary-breakdown-row" role="button" tabindex="0" data-home-filter-kind="ledger" data-home-filter-key="${escapeHtml(String(typeCode))}" data-home-filter-group="${escapeHtml(r.name)}">
              <span class="label">${escapeHtml(r.name)}</span>
              <span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(v)}">${toRoundedNumber(v).toLocaleString('ko-KR')}원</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderWorkingBreakdown({ containerEl, selectedKey, workingContext }) {
  if (!containerEl) return;
  const key = String(selectedKey || '');
  if (!key) {
    containerEl.innerHTML = '';
    return;
  }

  const {
    holdingFunds,
    totalReceivable,
    totalPayable,
    totalAssets,
    bankBalance,
    cashBalance,
    receivableByCustomer,
    cardReceivableBalance,
    payableSigned,
    creditCardBalance,
  } = workingContext;

  if (key === 'holdingFunds') {
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">보유자금 구성</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row"><span class="label">통장</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(bankBalance)}">${toRoundedNumber(bankBalance).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row"><span class="label">현금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(cashBalance)}">${toRoundedNumber(cashBalance).toLocaleString('ko-KR')}원</span></div>
      </div>
    `;
    return;
  }

  if (key === 'totalReceivable') {
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">총미수금 구성</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row"><span class="label">미수금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(receivableByCustomer)}">${toRoundedNumber(receivableByCustomer).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row"><span class="label">카드미수금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(cardReceivableBalance)}">${toRoundedNumber(cardReceivableBalance).toLocaleString('ko-KR')}원</span></div>
      </div>
    `;
    return;
  }

  if (key === 'totalPayable') {
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">총미지급금 구성</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row"><span class="label">미지급금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(payableSigned)}">${toRoundedNumber(payableSigned).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row"><span class="label">신용카드</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(creditCardBalance)}">${toRoundedNumber(creditCardBalance).toLocaleString('ko-KR')}원</span></div>
      </div>
    `;
    return;
  }

  if (key === 'totalAssets') {
    containerEl.innerHTML = `
      <div class="home-summary-breakdown-title">총자산 구성</div>
      <div class="home-summary-breakdown-rows">
        <div class="home-summary-breakdown-row"><span class="label">보유자금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(holdingFunds)}">${toRoundedNumber(holdingFunds).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row"><span class="label">총미수금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(totalReceivable)}">${toRoundedNumber(totalReceivable).toLocaleString('ko-KR')}원</span></div>
        <div class="home-summary-breakdown-row"><span class="label">총미지급금</span><span class="amount" data-amount-color="1" data-amount-value="${toRoundedNumber(totalPayable)}">${toRoundedNumber(totalPayable).toLocaleString('ko-KR')}원</span></div>
      </div>
    `;
    return;
  }

  containerEl.innerHTML = '';
}

let lastSnapshot = null;

async function openHomeBreakdownFor(section, key, label) {
  const s = String(section || '').trim();
  const k = String(key || '').trim();
  const title = String(label || '').trim() || '상세';
  if (!s || !k) return;

  if (!lastSnapshot) {
    await renderList();
  }
  if (!lastSnapshot) return;

  openHomeBreakdownModal(title);
  if (breakdownModalContentEl) {
    breakdownModalContentEl.innerHTML = '';
  }

  if (s === 'summary') {
    renderSummaryBreakdown({
      containerEl: breakdownModalContentEl,
      selectedKey: k,
      breakdownMaps: lastSnapshot.summary,
    });
    applyAmountColoring(breakdownModalEl || document);
    return;
  }

  if (s === 'working') {
    renderWorkingBreakdown({
      containerEl: breakdownModalContentEl,
      selectedKey: k,
      workingContext: lastSnapshot.working,
    });
    applyAmountColoring(breakdownModalEl || document);
    return;
  }

  if (s === 'ledger') {
    if (!breakdownModalContentEl) return;

    // profit/companyFunds는 즉시 렌더 가능
    if (k === 'profit' || k === 'companyFunds') {
      renderLedgerBreakdown({
        containerEl: breakdownModalContentEl,
        selectedKey: k,
        ledgerContext: lastSnapshot.ledger,
      });
      applyAmountColoring(breakdownModalEl || document);
      return;
    }

    breakdownModalContentEl.innerHTML = '<div class="home-summary-breakdown-row"><span class="label">불러오는 중...</span><span class="amount"> </span></div>';
    if (!lastSnapshot.ledger.itemBalances) {
      lastSnapshot.ledger.itemBalances = await computeCashflowItemBalancesAsOf(lastSnapshot.ledger.balanceCutoff);
    }

    renderLedgerBreakdown({
      containerEl: breakdownModalContentEl,
      selectedKey: k,
      ledgerContext: {
        ...lastSnapshot.ledger,
        cashflowItems: lastSnapshot.ledger.itemBalances.cashflowItems,
        openingByCode: lastSnapshot.ledger.itemBalances.openingByCode,
        deltaByCode: lastSnapshot.ledger.itemBalances.deltaByCode,
      },
    });
    applyAmountColoring(breakdownModalEl || document);
    return;
  }
}

async function renderList() {
  const generation = ++homeRenderGeneration;
  const list = await getTransactions();
  const rows = await runHomeJob({kind:'dates',rows:list || [],from:dateFrom,to:dateTo,sorted:true});
  if (generation !== homeRenderGeneration) return;

  let ledgerAll = [];
  try {
    ledgerAll = await getAllLedgerTx();
  } catch (_) {
    ledgerAll = [];
  }
  const ledgerRows = await runHomeJob({kind:'dates',rows:ledgerAll || [],from:dateFrom,to:dateTo});
  if (generation !== homeRenderGeneration) return;

  // 장부 타입(A01 등) 필터가 걸린 경우: cashflow_items를 로드해 itemCode->typeCode 매핑을 만든다.
  let itemTypeByItemCode = null;
  if (homeDashboardFilter && String(homeDashboardFilter.mode || '').trim() === 'ledgerType') {
    try {
      const cashflowItems = await getCashflowItems();
      itemTypeByItemCode = new Map((cashflowItems || []).map((it) => [String(it?.code || '').trim(), String(it?.typeCode || '').trim()]));
    } catch (_) {
      itemTypeByItemCode = null;
    }
  }

  let customers = [];
  try {
    customers = await getCustomers();
  } catch (_) {
    customers = [];
  }

  // 홈 화면에서 보이는 거래(기간 무관) 중 거래처 코드 누락을 1회 자동 보정
  // (저장 당시 거래처를 선택하지 않고 입력만 해서 생긴 데이터)
  await repairMissingSupplierIdsOnce(list, customers);
  const supplierGroupById = new Map(
    (customers || []).map((c) => [String(c?.id ?? ''), String(c?.group ?? '')]),
  );
  const cashSaleGroups = new Set(['매장', '온라인']);

  const salesCustomers = (customers || []).filter((c) => String(c?.type || '').includes('매출'));
  const purchaseCustomers = (customers || []).filter((c) => String(c?.type || '').includes('매입'));
  const expenseCustomers = (customers || []).filter((c) => String(c?.type || '').includes('지출'));

  const salesGroups = uniqueSorted((salesCustomers || []).map(getCustomerGroupName));
  const purchaseGroups = uniqueSorted((purchaseCustomers || []).map(getCustomerGroupName));
  const expenseGroups = uniqueSorted((expenseCustomers || []).map(getCustomerGroupName));

  const salesByGroup = new Map();
  const receiptByGroup = new Map();
  const purchaseByGroup = new Map();
  const payByGroup = new Map();
  const expenseByGroup = new Map();

  // 기간 합계 (기간 필터 적용)
  let sumSalesAmount = 0;
  let sumSalesReceipt = 0;
  let sumSalesReceiptAsSales = 0;
  let sumPurchaseAmount = 0;
  let sumPurchasePay = 0;
  let sumExpenseOut = 0;
  let sumSalesArDelta = 0;

  // 잔액 기준일(기간 종료일이 있으면 그 날짜, 없으면 오늘)
  const balanceCutoff = dateTo || todayYMD();

  const customerIdsByName = new Map();
  for (const c of customers) {
    const name = String(c?.name || '').trim();
    if (!name || c?.id == null) continue;
    if (!customerIdsByName.has(name)) customerIdsByName.set(name, []);
    customerIdsByName.get(name).push(String(c.id));
  }
  function resolveCustomerId(id, name) {
    if (id != null && String(id).trim()) return String(id).trim();
    const ids = customerIdsByName.get(String(name || '').trim()) || [];
    return ids.length === 1 ? ids[0] : '';
  }

  const displayRows = [];
  rows.forEach((tx) => {
      const cat = normalizeCategory(tx);
      const amount = Number(tx.amount || 0) || 0;
      const payment = Number(tx.payment || 0) || 0;
      const supplierId = tx && tx.supplierId != null ? String(tx.supplierId) : '';
      const supplierGroup =
        String(tx?.supplierGroup || tx?.supplierGroupName || tx?.group || '').trim() ||
        (supplierId ? String(supplierGroupById.get(supplierId) || '').trim() : '');
      const supplier = String(tx.supplierName || '').trim();

      if (cat === 'sales') {
        // 매출 금액은 음수(조정/반품)도 있을 수 있으므로 그대로 합산한다.
        // (양수만 합산하면 매출관리 합계와 불일치할 수 있음)
        if (amount) sumSalesAmount += amount;
        if (payment > 0) sumSalesReceipt += payment;

        if (supplierGroup) {
          if (amount) {
            salesByGroup.set(supplierGroup, sumMapValue(salesByGroup, supplierGroup) + amount);
          }
          if (payment > 0) {
            receiptByGroup.set(supplierGroup, sumMapValue(receiptByGroup, supplierGroup) + payment);
          }
          // 매장/온라인 payment-only는 매출로 추가 집계
          if (payment > 0 && !(amount > 0) && cashSaleGroups.has(supplierGroup)) {
            salesByGroup.set(supplierGroup, sumMapValue(salesByGroup, supplierGroup) + payment);
          }
        }

        // 매장/온라인은 수금등록(payment-only) 자체를 매출로 집계하는 케이스가 있어,
        // amount가 없는 수금(payment)만 매출합계에 추가로 포함한다.
        if (payment > 0 && !(amount > 0) && cashSaleGroups.has(supplierGroup)) {
          sumSalesReceiptAsSales += payment;
        }
        sumSalesArDelta += amount - payment;
      } else if (cat === 'purchase') {
        if (amount > 0) sumPurchaseAmount += amount;
        if (payment > 0) sumPurchasePay += payment;

        if (supplierGroup) {
          if (amount > 0) purchaseByGroup.set(supplierGroup, sumMapValue(purchaseByGroup, supplierGroup) + amount);
          if (payment > 0) payByGroup.set(supplierGroup, sumMapValue(payByGroup, supplierGroup) + payment);
        }
      } else if (cat === 'expense') {
        // 지출 화면/통합결제 연동은 payment 중심(지출 전표 amount=0, payment>0)이 많다.
        if (payment > 0) sumExpenseOut += payment;
        else if (amount > 0) sumExpenseOut += amount;

        if (supplierGroup) {
          const out = payment > 0 ? payment : amount > 0 ? amount : 0;
          if (out > 0) expenseByGroup.set(supplierGroup, sumMapValue(expenseByGroup, supplierGroup) + out);
        }
      }

      const outExpense = cat === 'expense'
        ? (payment > 0 ? payment : amount > 0 ? amount : 0)
        : 0;

      if (homeTransactionViewRequested) displayRows.push({
        date: String(tx.date || ''),
        type: getCategoryLabel(cat) || '',
        group: supplierGroup || '',
        vendor: supplier || '',
        __supplierId: resolveCustomerId(supplierId, supplier),
        sales: cat === 'sales' ? amount : 0,
        receipt: cat === 'sales' && payment > 0 ? payment : 0,
        purchase: cat === 'purchase' && amount > 0 ? amount : 0,
        pay: cat === 'purchase' && payment > 0 ? payment : 0,
        expense: outExpense,
        inn: 0,
        out: 0,
      });
    });

  ledgerRows.forEach((ltx) => {
    const amount = Number(ltx?.amount || 0) || 0;
    if (!(amount > 0)) return;

    const flow = String(ltx?.flow || '').trim();
    const type = flow === 'in' ? '입금' : flow === 'out' ? '출금' : '';
    if (!type) return;

    const accountIdRaw = String(ltx?.accountId || '').trim();
    const cashflowCodeRaw = String(ltx?.cashflowCode || '').trim();
    const cashflowItemCodeRaw = String(ltx?.cashflowItemCode || '').trim();

    const accountName = String(ltx?.accountName || '').trim();
    const cashflowItemName = String(ltx?.cashflowItemName || '').trim();
    const group = String(accountName || cashflowItemName || ltx?.cashflowCode || ltx?.accountId || '').trim();
    const vendor = String(ltx?.vendor || ltx?.item || '').trim();
    const typeCode = getLedgerTxTypeCode(ltx, itemTypeByItemCode);

    if (homeTransactionViewRequested) displayRows.push({
      date: String(ltx?.date || ''),
      type,
      group,
      vendor,
      __src: 'ledger',
      __supplierId: resolveCustomerId(ltx?.supplierId || ltx?.customerId, vendor),
      __ledgerAccountId: accountIdRaw,
      __ledgerCashflowCode: cashflowCodeRaw,
      __ledgerCashflowItemCode: cashflowItemCodeRaw,
      __ledgerAccountName: accountName,
      __ledgerItemName: cashflowItemName,
      __ledgerTypeCode: typeCode,
      sales: 0,
      receipt: 0,
      purchase: 0,
      pay: 0,
      expense: 0,
      inn: flow === 'in' ? amount : 0,
      out: flow === 'out' ? amount : 0,
    });
  });

  const displayForTable = homeTransactionViewRequested
    ? await runHomeJob({kind:'table',rows:displayRows,filter:homeDashboardFilter,query:homeSearchQuery,from:dateFrom,to:dateTo})
    : [];
  if (generation !== homeRenderGeneration) return;

  // 기간 합계와 별개로, 매출처 화면과 같은 원장 잔액을 가져온다.
  const salesBalanceByCustomer = buildSalesCustomerBalances(
    salesCustomers, (list || []).filter(tx => normalizeCategory(tx) === 'sales'), dateTo,
  );
  const salesIdsByName = new Map();
  for (const customer of salesCustomers) {
    const name = String(customer?.name || '').trim();
    if (!name) continue;
    if (!salesIdsByName.has(name)) salesIdsByName.set(name, []);
    salesIdsByName.get(name).push(String(customer.id));
  }
  for (const row of displayForTable) {
    let ids = (row.__supplierIds || []).filter(id => salesBalanceByCustomer.has(id));
    if (!ids.length && !row.__supplierIds?.length) {
      const matching = salesIdsByName.get(row.vendor) || [];
      if (matching.length === 1) ids = matching;
    }
    row.remainingSalesBalance = ids.length
      ? ids.reduce((sum, id) => sum + salesBalanceByCustomer.get(id), 0)
      : (Number(row.sales) || 0) - (Number(row.receipt) || 0);
  }

  function amountCell(value, options = {}) {
    const v = Number(value) || 0;
    if (!(v > 0)) return '<td class="right"></td>';
    const force = String(options.force || '').trim();
    const forceAttr = force ? ` data-amount-force="${force}"` : '';
    const rounded = toRoundedNumber(v);
    return `<td class="right" data-amount-color="1" data-amount-value="${rounded}"${forceAttr}>${rounded.toLocaleString('ko-KR')}</td>`;
  }

  function signedAmountCell(value, options = {}) {
    const v = Number(value) || 0;
    if (!v) return '<td class="right"></td>';
    const force = String(options.force || '').trim();
    const forceAttr = force ? ` data-amount-force="${force}"` : '';
    const rounded = toRoundedNumber(v);
    return `<td class="right" data-amount-color="1" data-amount-value="${rounded}"${forceAttr}>${rounded.toLocaleString('ko-KR')}</td>`;
  }

  function rowSalesBalance(r) {
    if (r?.remainingSalesBalance != null) return r.remainingSalesBalance;
    const sales = Number(r?.sales || 0) || 0;
    const receipt = Number(r?.receipt || 0) || 0;
    return sales - receipt;
  }

  // 계산용(총잔액 반영): 매입-지불
  function rowPurchaseDelta(r) {
    const purchase = Number(r?.purchase || 0) || 0;
    const pay = Number(r?.pay || 0) || 0;
    return purchase - pay;
  }

  // 표시용(매입처 잔액 컬럼): 지불-매입
  // - 매입이 더 크면 음수(빨강, -표시)
  // - 지불이 더 크면 양수(파랑)
  function rowPurchaseDisplayBalance(r) {
    return -rowPurchaseDelta(r);
  }

  function rowTotalBalance(r) {
    const inn = Number(r?.inn || 0) || 0;
    const out = Number(r?.out || 0) || 0;
    // 요청: "입출금 뒤 잔액"은 입출금(입금-출금)만 누계로 계산
    return inn - out;
  }

  homePager.set(displayForTable, (pageRows) => {
  listBody.innerHTML = '';
  if (!homeTransactionViewRequested) {
    listBody.innerHTML = '<tr><td colspan="14">현황 항목을 선택하거나 전체보기를 누르면 내역을 조회합니다.</td></tr>';
  } else if (!pageRows.length) {
    listBody.innerHTML = '<tr><td colspan="14" style="text-align:center;">거래 내역 없음</td></tr>';
  } else {
    // 각 거래처의 조회 기간 합계로 잔액을 표시한다.
    listBody.innerHTML = pageRows
      .map((r) => {
        return `
          <tr>
            <td>${escapeHtml(r.code || '—')}</td>
            <td>${escapeHtml(r.type || '')}</td>
            <td>${escapeHtml(r.group || '')}</td>
            <td>${escapeHtml(r.vendor || '')}</td>
            ${signedAmountCell(r.sales)}
            ${amountCell(r.receipt, { force: 'minus' })}
            ${signedAmountCell(rowSalesBalance(r))}
            ${amountCell(r.purchase, { force: 'minus' })}
            ${amountCell(r.pay)}
            ${signedAmountCell(rowPurchaseDisplayBalance(r))}
            ${amountCell(r.expense, { force: 'minus' })}
            ${amountCell(r.inn)}
            ${amountCell(r.out, { force: 'minus' })}
            ${signedAmountCell(rowTotalBalance(r))}
          </tr>
        `;
      })
      .join('');
  }

  applyAmountColoring(listBody);
  });

  // 하단 합계(tfoot): 현재 표시중인 행 기준
  const totals = {
    sales: 0,
    receipt: 0,
    purchase: 0,
    pay: 0,
    expense: 0,
    inn: 0,
    out: 0,
    balance: 0,
    salesBalance: 0,
    purchaseBalance: 0,
  };
  (displayForTable || []).forEach((r) => {
    totals.sales += Number(r?.sales || 0) || 0;
    totals.receipt += Number(r?.receipt || 0) || 0;
    totals.purchase += Number(r?.purchase || 0) || 0;
    totals.pay += Number(r?.pay || 0) || 0;
    totals.expense += Number(r?.expense || 0) || 0;
    totals.inn += Number(r?.inn || 0) || 0;
    totals.out += Number(r?.out || 0) || 0;
    totals.salesBalance += rowSalesBalance(r);
    totals.purchaseBalance += rowPurchaseDisplayBalance(r);
    totals.balance += rowTotalBalance(r);
  });

  const count = (displayForTable || []).length;
  if (homeTxCountEl) homeTxCountEl.textContent = String(count);

  function setTotal(el, value, options = {}) {
    if (!el) return;
    const v = Number(value) || 0;
    const rounded = toRoundedNumber(v);
    const td = el.closest ? el.closest('td') : null;
    if (td && td.dataset) {
      td.dataset.amountValue = String(rounded);
      if (options.force) td.dataset.amountForce = String(options.force);
      else delete td.dataset.amountForce;
    }
    el.textContent = rounded.toLocaleString('ko-KR');
  }

  setTotal(homeTxTotalSalesEl, totals.sales);
  setTotal(homeTxTotalReceiptEl, totals.receipt, { force: 'minus' });
  setTotal(homeTxTotalPurchaseEl, totals.purchase, { force: 'minus' });
  setTotal(homeTxTotalPayEl, totals.pay);
  setTotal(homeTxTotalExpenseEl, totals.expense, { force: 'minus' });
  setTotal(homeTxTotalInEl, totals.inn);
  setTotal(homeTxTotalOutEl, totals.out, { force: 'minus' });
  setTotal(homeTxTotalSalesBalanceEl, totals.salesBalance);
  setTotal(homeTxTotalPurchaseBalanceEl, totals.purchaseBalance);
  setTotal(homeTxTotalBalanceEl, totals.balance);

  // 채권/미수: 거래처(매출처) 기준 잔액 합계 (기초 + 매출 - 수금) 을 양수만 합산

  let receivableByCustomer = 0;
  const receivableByGroup = new Map();
  salesCustomers.forEach((c) => {
    const supplierId = String(c?.id ?? '');
    if (!supplierId) return;
    const v = clampPositive(salesBalanceByCustomer.get(supplierId) || 0);
    const groupName = String(c?.group || '').trim() || '미분류';
    receivableByCustomer += v;
    if (v > 0) receivableByGroup.set(groupName, sumMapValue(receivableByGroup, groupName) + v);
  });

  // 미지급금: 매입처 기준 잔액(기초 - 매입 + 지불)에서 음수(지급해야 할 금액)만 합산
  const purchaseTxUpTo = (list || [])
    .filter((tx) => normalizeCategory(tx) === 'purchase')
    .filter((tx) => filterUpToDate(tx, balanceCutoff));
  const purchaseTxBySupplier = new Map();
  purchaseTxUpTo.forEach((tx) => {
    const supplierId = tx && tx.supplierId != null ? String(tx.supplierId) : '';
    if (!supplierId) return;
    const prev = purchaseTxBySupplier.get(supplierId) || [];
    prev.push(tx);
    purchaseTxBySupplier.set(supplierId, prev);
  });

  let payableByCustomer = 0;
  const payableByGroup = new Map();
  purchaseCustomers.forEach((c) => {
    const supplierId = c && c.id != null ? String(c.id) : '';
    if (!supplierId) return;
    const opening = Number(c.openingBalance ?? 0) || 0;
    const groupName = String(c?.group || '').trim() || '미분류';
    const related = purchaseTxBySupplier.get(supplierId) || [];
    if (!related.length) {
      if (opening < 0) {
        const v = Math.abs(opening);
        payableByCustomer += v;
        payableByGroup.set(groupName, sumMapValue(payableByGroup, groupName) + v);
      }
      return;
    }

    let running = opening;
    related
      .filter((t) => t && t.date)
      .sort((a, b) => {
        const ad = String(a.date || '');
        const bd = String(b.date || '');
        if (ad < bd) return -1;
        if (ad > bd) return 1;
        return 0;
      })
      .forEach((t) => {
        const a = Number(t.amount) || 0;
        const p = Number(t.payment || 0);
        // 매입 화면 규칙: 잔액 = 기초 - 매입합계 + 지불합계
        running -= a;
        running += p;
      });

    if (running < 0) {
      const v = Math.abs(running);
      payableByCustomer += v;
      payableByGroup.set(groupName, sumMapValue(payableByGroup, groupName) + v);
    }
  });

  // 표시/순자금 계산용: 미지급금은 부채이므로 음수로 취급
  const payableSigned = -(Number(payableByCustomer) || 0);

  // 통장/회사자금/채권(장부): ledger_tx + cashflow 마스터 기반 잔액
  const { balanceByType, nameByType, itemByCode } = await computeCashflowBalancesAsOf(balanceCutoff);
  const bankBalance = findBalanceSumByName(balanceByType, nameByType, '통장');
  const cashBalance = findBalanceSumByName(balanceByType, nameByType, '현금');

  // 채권금액(장부현황): 마스터 타입명/코드에 '채권금액' 또는(오타 포함) '체권금액'이 들어간 경우도 합산
  const bondBalance = sumBalancesByDisplayLabelIncludes(balanceByType, nameByType, ['채권금액', '채권', '체권금액', '체권']);
  const savingsBalance = findBalanceSumByName(balanceByType, nameByType, '적금');
  const creditCardBalance = findBalanceSumByName(balanceByType, nameByType, '신용카드');
  const cardReceivableBalance = findBalanceSumByName(balanceByType, nameByType, '카드미수금');
  const cashAndBankBalance = bankBalance + cashBalance;
  const salesTotalForDashboard = sumSalesAmount + sumSalesReceiptAsSales;
  const profitByTransactions = salesTotalForDashboard - (sumPurchaseAmount + sumExpenseOut);

  // 장부현황 손익변동: 통장/현금/신용카드의 기간 내 변동(입금-출금) 합계
  function getLedgerTxTypeCodeFromItemMap(tx) {
    let code = tx && tx.cashflowCode ? String(tx.cashflowCode).trim() : '';
    if (!code && tx && tx.accountId) code = String(tx.accountId).trim();
    if (!code) return '';

    if (isLedgerTypeCode(code)) return code;

    const item = itemByCode && typeof itemByCode.get === 'function' ? itemByCode.get(code) : null;
    if (item && item.typeCode) return String(item.typeCode).trim();

    if (isLedgerItemCode(code)) return String(code).slice(0, 3);
    return '';
  }

  function sumLedgerDeltaByTypeCodes(typeCodes) {
    const list = ledgerRows || [];
    const codes = Array.isArray(typeCodes) ? typeCodes.map((c) => String(c || '').trim()).filter(Boolean) : [];
    if (!codes.length) return 0;
    const set = new Set(codes);
    let sum = 0;
    list.forEach((tx) => {
      const amount = Number(tx?.amount || 0) || 0;
      if (!(amount > 0)) return;
      const flow = String(tx?.flow || '').trim();
      const sign = flow === 'in' ? 1 : flow === 'out' ? -1 : 0;
      if (!sign) return;
      const tc = getLedgerTxTypeCodeFromItemMap(tx);
      if (!tc) return;
      if (!set.has(tc)) return;
      sum += sign * amount;
    });
    return sum;
  }

  const bankTypeCodes = uniqueCodes(findTypeCodesByNameIncludes(nameByType, '통장'));
  const cashTypeCodes = uniqueCodes(findTypeCodesByNameIncludes(nameByType, '현금'));
  const creditTypeCodes = uniqueCodes(findTypeCodesByNameIncludes(nameByType, '신용카드'));

  const ledgerProfitDeltaBank = sumLedgerDeltaByTypeCodes(bankTypeCodes);
  const ledgerProfitDeltaCash = sumLedgerDeltaByTypeCodes(cashTypeCodes);
  const ledgerProfitDeltaCredit = sumLedgerDeltaByTypeCodes(creditTypeCodes);
  const ledgerProfitDeltaTotal = ledgerProfitDeltaBank + ledgerProfitDeltaCash + ledgerProfitDeltaCredit;

  if (summaryCards) {
    summaryCards.innerHTML = `
      ${renderToggleCard({ section: 'summary', key: 'sales', label: '매출합계', amountHtml: amountStrong(salesTotalForDashboard), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'receipt', label: '수금합계', amountHtml: amountStrong(sumSalesReceipt, { force: 'minus', showAbs: true }), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'ar', label: '미수합계', amountHtml: amountStrong(receivableByCustomer), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'purchase', label: '매입합계', amountHtml: amountStrong(Math.abs(sumPurchaseAmount), { force: 'minus', showAbs: true }), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'pay', label: '지불합계', amountHtml: amountStrong(sumPurchasePay, { showAbs: true }), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'ap', label: '미지급금', amountHtml: amountStrong(Math.abs(payableSigned), { force: 'minus', showAbs: true }), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'expense', label: '지출합계', amountHtml: amountStrong(sumExpenseOut, { force: 'minus', showAbs: true }), controlsId: 'home-summary-breakdown' })}
      ${renderToggleCard({ section: 'summary', key: 'profit', label: '손익합계', amountHtml: amountStrong(profitByTransactions), controlsId: 'home-summary-breakdown' })}
    `;
  }

  if (workingCards) {
    const holdingFunds = (Number(bankBalance) || 0) + (Number(cashBalance) || 0);
    const totalReceivable = (Number(receivableByCustomer) || 0) + (Number(cardReceivableBalance) || 0);
    // 미지급금(부채=음수) + 신용카드(보통 음수)
    const totalPayable = (Number(payableSigned) || 0) + (Number(creditCardBalance) || 0);
    const totalAssets = holdingFunds + totalReceivable + totalPayable;

    workingCards.innerHTML = `
      ${renderToggleCard({ section: 'working', key: 'holdingFunds', label: '보유자금', amountHtml: amountStrong(holdingFunds), controlsId: 'home-working-breakdown' })}
      ${renderToggleCard({ section: 'working', key: 'totalReceivable', label: '총미수금', amountHtml: amountStrong(totalReceivable), controlsId: 'home-working-breakdown' })}
      ${renderToggleCard({ section: 'working', key: 'totalPayable', label: '총미지급금', amountHtml: amountStrong(Math.abs(totalPayable), { force: 'minus', showAbs: true }), controlsId: 'home-working-breakdown' })}
      ${renderToggleCard({ section: 'working', key: 'totalAssets', label: '총자산', amountHtml: amountStrong(totalAssets), controlsId: 'home-working-breakdown' })}
    `;
  }

  // 회사자금(대시보드용): 통장/현금 + 적금 + 신용카드 + 카드미수금 + (미수금 + 미지급금[음수])
  // - 신용카드는 보통 잔액이 음수(부채)로 누적되므로 그대로 더하면 회사자금에서 차감됩니다.
  const companyFunds =
    cashAndBankBalance +
    bondBalance +
    savingsBalance +
    creditCardBalance +
    cardReceivableBalance +
    (Number(receivableByCustomer) || 0) +
    payableSigned;

  if (moneyCards) {

    const typeCards = [];
    Array.from(balanceByType.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ko', { numeric: true }))
      .forEach(([code, bal]) => {
        const v = Number(bal) || 0;
        const name = (nameByType.get(String(code)) || String(code)).trim();
        typeCards.push(renderToggleCard({ section: 'ledger', key: String(code), label: name, amountHtml: amountStrong(v), controlsId: 'home-ledger-breakdown' }));
      });

    typeCards.push(renderToggleCard({ section: 'ledger', key: 'profit', label: '손익변동', amountHtml: amountStrong(ledgerProfitDeltaTotal), controlsId: 'home-ledger-breakdown' }));
    typeCards.push(renderToggleCard({ section: 'ledger', key: 'companyFunds', label: '회사자금', amountHtml: amountStrong(companyFunds), controlsId: 'home-ledger-breakdown' }));

    moneyCards.innerHTML = typeCards.join('');
  }

  // 모달 상세용 스냅샷(클릭 시 즉시 렌더)
  lastSnapshot = {
    summary: {
      salesByGroup,
      receiptByGroup,
      receivableByGroup,
      purchaseByGroup,
      payByGroup,
      payableByGroup,
      expenseByGroup,
      salesGroups,
      purchaseGroups,
      expenseGroups,
      salesTotalForDashboard,
      sumPurchaseAmount,
      sumExpenseOut,
    },
    working: {
      holdingFunds: (Number(bankBalance) || 0) + (Number(cashBalance) || 0),
      totalReceivable: (Number(receivableByCustomer) || 0) + (Number(cardReceivableBalance) || 0),
      totalPayable: (Number(payableSigned) || 0) + (Number(creditCardBalance) || 0),
      totalAssets:
        ((Number(bankBalance) || 0) + (Number(cashBalance) || 0)) +
        ((Number(receivableByCustomer) || 0) + (Number(cardReceivableBalance) || 0)) +
        ((Number(payableSigned) || 0) + (Number(creditCardBalance) || 0)),
      bankBalance,
      cashBalance,
      receivableByCustomer,
      cardReceivableBalance,
      payableSigned,
      creditCardBalance,
    },
    ledger: {
      balanceCutoff,
      nameByType,
      cashAndBankBalance,
      bondBalance,
      savingsBalance,
      creditCardBalance,
      cardReceivableBalance,
      receivableByCustomer,
      payableSigned,
      profit: ledgerProfitDeltaTotal,
      profitDeltaBank: ledgerProfitDeltaBank,
      profitDeltaCash: ledgerProfitDeltaCash,
      profitDeltaCredit: ledgerProfitDeltaCredit,
      profitTypeNameKeywords: ['통장', '현금', '신용카드'],
      companyFunds,
      itemBalances: null,
    },
  };

  // 홈 카드/테이블에 공통 금액 색상 적용
  applyAmountColoring(document);
}

function initHomeSummaryToggles() {
  const containers = [summaryCards, moneyCards, workingCards].filter(Boolean);
  containers.forEach((root) => {
    root.addEventListener('click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button.home-summary-card[data-home-section][data-home-key]') : null;
      if (!btn) return;
      e.preventDefault();
      await applyHomeDashboardFilterFromCard(btn.dataset.homeSection, btn.dataset.homeKey, btn.dataset.homeLabel);
      await openHomeBreakdownFor(btn.dataset.homeSection, btn.dataset.homeKey, btn.dataset.homeLabel);
    });
    root.addEventListener('keydown', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button.home-summary-card[data-home-section][data-home-key]') : null;
      if (!btn) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await applyHomeDashboardFilterFromCard(btn.dataset.homeSection, btn.dataset.homeKey, btn.dataset.homeLabel);
        await openHomeBreakdownFor(btn.dataset.homeSection, btn.dataset.homeKey, btn.dataset.homeLabel);
      }
    });
  });
}

function initHomeBreakdownRowFiltering() {
  if (!breakdownModalContentEl) return;

  breakdownModalContentEl.addEventListener('click', async (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.home-summary-breakdown-row[data-home-filter-kind][data-home-filter-key]') : null;
    if (!row) return;
    e.preventDefault();
    await applyHomeDashboardFilterFromBreakdownRow(row);
  });

  breakdownModalContentEl.addEventListener('keydown', async (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.home-summary-breakdown-row[data-home-filter-kind][data-home-filter-key]') : null;
    if (!row) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await applyHomeDashboardFilterFromBreakdownRow(row);
    }
  });
}

// 초기 렌더링
const homeDateFilter = initDateFilter({
  fromInputId: 'home-date-from',
  toInputId: 'home-date-to',
  quickBtnId: 'btn-home-date-quick',
  searchBtnId: 'btn-home-date-search',
  modalId: 'home-date-quick-modal',
  allBtnId: 'btn-home-date-quick-all',
  closeBtnId: 'btn-home-date-quick-close',
  defaultRangeKey: 'thisMonth',
  onApply: ({ from, to }) => {
    dateFrom = from;
    dateTo = to;
    renderList();
  },
});

// 홈 전역 검색(#home-search)은 상단 global-search-input과 동기화된다.
// 입력 변화는 간단 디바운스로 처리해 과도한 IndexedDB 재조회 빈도를 줄인다.
if (homeSearchInput) {
  attachSearchInput(homeSearchInput, (kw) => {
    homeSearchQuery = String(kw || '');
    if (homeSearchTimer) {
      clearTimeout(homeSearchTimer);
      homeSearchTimer = null;
    }
    homeSearchTimer = setTimeout(() => {
      homeSearchTimer = null;
      renderList();
    }, 150);
  });
}

// 인라인 빠른 날짜 버튼(어제/오늘/지난달/이번달/작년/올해) - 운전자금 제목 옆
try {
  const inlineButtons = document.querySelectorAll('#home-date-quick-inline .date-quick-btn[data-range]');
  const setActiveInlineButton = (activeKey) => {
    const key = String(activeKey || '').trim();
    inlineButtons.forEach((b) => {
      const k = String(b.dataset.range || '').trim();
      const isActive = !!key && k === key;
      b.classList.toggle('is-active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  // 초기값(thisMonth)과 버튼 표시를 맞춘다.
  setActiveInlineButton('thisMonth');

  inlineButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = String(btn.dataset.range || '').trim();
      if (!key) return;
      setActiveInlineButton(key);
      const range = getQuickRange(key);
      const from = range.from || range.start || '';
      const to = range.to || range.end || '';
      if (homeDateFilter && typeof homeDateFilter.setRange === 'function') {
        homeDateFilter.setRange(from, to, 'inline:' + key);
      }
    });
  });
} catch (_) {
  // ignore
}

document.getElementById('btn-home-view-all')?.addEventListener('click', async () => {
  await applyHomeDashboardFilter(null);
});

renderList();
initHomeSummaryToggles();
initHomeBreakdownRowFiltering();

installDbAutoRefresh({
  refresh: async () => {
    await renderList();
  },
  isBusy: () => document.body.classList.contains('modal-open'),
});

