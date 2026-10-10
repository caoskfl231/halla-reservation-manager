import {
  getCashflowTypes,
  addCashflowType,
  updateCashflowType,
  deleteCashflowType,
  bulkReplaceCashflowTypes,
  getCashflowItems,
  addCashflowItem,
  updateCashflowItem,
  deleteCashflowItem,
  bulkReplaceCashflowItems,
  getCashflowGroups,
  addCashflowGroup,
  updateCashflowGroup,
  deleteCashflowGroup,
  bulkReplaceCashflowGroups,
  getAllLedgerTx,
  putLedgerTx,
} from "./db.js?v=ledger-import-20261010-2";
import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  createFormDirtyTracker,
  wrapDirtyClose,
  enableTableArrowNavigation,
  attachSearchInput,
  bindDblClickRowEdit,
  bindClickRowSelect,
} from "./common/ui-helpers.js?v=ledger-import-20261010-2";
import { sortByKey } from "./common/sortTable.js?v=ledger-import-20261010-2";
import { formatMoney } from "./common/util.js?v=ledger-import-20261010-2";
import { installDbAutoRefresh } from "./common/app-events.js?v=ledger-import-20261010-2";
import { repairLedgerTxCashflowItemFieldsIfNeeded } from "./common/ledger-tx-cashflowitem-repair.js?v=ledger-import-20261010-2";

// 숫자 포맷 헬퍼
const fmt = (n) => formatMoney(n, "ko-KR");

function alert(message, options) {
  const api = window.__hallaDialogs;
  if (api && typeof api.alertDialog === "function") {
    api.alertDialog(String(message ?? ""), options);
    return;
  }
  window.alert(message);
}

async function confirmAsync(message, options) {
  const api = window.__hallaDialogs;
  if (api && typeof api.confirmDialog === "function") {
    return await api.confirmDialog(String(message ?? ""), options);
  }
  return window.confirm(message);
}

// 항목 상태(입금/출금) 표시용
const directionLabel = {
  in: "입금",
  out: "출금",
};

function normalizeStr(v) {
  return String(v ?? "").trim();
}

function looksLikeItemCode(v) {
  const s = String(v ?? "").trim();
  return /^A\d{4,}$/.test(s);
}

function normalizeItemNameSeed(v) {
  let s = String(v ?? "").trim();
  if (!s) return "";
  // "A0002 매장현금" / "A02 현금" 같은 라벨에서 코드 접두를 제거
  s = s.replace(/^A\d{2,4}[\s-]+/, "");
  // 공백은 비교에서 의미 없게 처리
  s = s.replace(/\s+/g, "");
  return s;
}

function rebuildCashflowItemCodeByName(items) {
  const next = new Map();
  const dup = new Set();
  (items || []).forEach((it) => {
    const code = String(it?.code || "").trim();
    const name = normalizeItemNameSeed(it?.name);
    if (!code || !name) return;
    if (next.has(name)) dup.add(name);
    else next.set(name, code);
  });
  // 중복 이름은 자동 매핑에서 제외(오매핑 방지)
  dup.forEach((k) => next.delete(k));
  cashflowItemCodeByName = next;
}

function resolveLedgerItemOrTypeCode(tx) {
  // ledger_tx는 저장 경로에 따라 다음처럼 섞여 들어올 수 있다.
  // - cashflowItemCode: A0002 (항목)
  // - cashflowCode: A02(구분) 또는 A0002(항목)
  // - accountId: A02(구분) 또는 A0002(항목)
  // 항목 집계가 누락되지 않도록 "항목 코드처럼 보이는 값"을 우선 선택한다.
  const itemCode = String(tx?.cashflowItemCode || "").trim();
  if (looksLikeItemCode(itemCode)) return itemCode;

  const cashflowCode = String(tx?.cashflowCode || "").trim();
  if (looksLikeItemCode(cashflowCode)) return cashflowCode;

  const accountId = String(tx?.accountId || "").trim();
  if (looksLikeItemCode(accountId)) return accountId;

  // 코드가 없더라도, 이름이 항목명과 유일하게 매칭되면 항목 코드로 집계
  const byNameSeed =
    normalizeItemNameSeed(tx?.cashflowItemName) ||
    normalizeItemNameSeed(tx?.item) ||
    normalizeItemNameSeed(tx?.accountName);
  if (byNameSeed && cashflowItemCodeByName && cashflowItemCodeByName.has(byNameSeed)) {
    return String(cashflowItemCodeByName.get(byNameSeed) || "");
  }

  return cashflowCode || accountId || "";
}

function ledgerTxUsesCode(tx, code) {
  const c = normalizeStr(code);
  if (!c) return false;
  const accountId = normalizeStr(tx?.accountId);
  const cashflowCode = normalizeStr(tx?.cashflowCode);
  const cashflowItemCode = normalizeStr(tx?.cashflowItemCode);
  return accountId === c || cashflowCode === c || cashflowItemCode === c;
}

async function hasAnyLedgerTxForCode(code) {
  try {
    const rows = await getAllLedgerTx();
    return (rows || []).some((tx) => ledgerTxUsesCode(tx, code));
  } catch (_) {
    return true;
  }
}

// 통합 결제용 Ledger DB(tx)는 hallapa_db의 ledger_tx 스토어를 사용한다.

// 입출금 코드/항목 폼 요소
const form = document.getElementById("cashflow-form");
const idModeSelect = document.getElementById("cashflow-id-mode");
const codeInput = document.getElementById("cashflow-code");
const typeSelectForItem = document.getElementById("cashflow-type-select");
const nameInput = document.getElementById("cashflow-name");
const statusSelect = document.getElementById("cashflow-status");
const openingInput = document.getElementById("cashflow-opening");
const memoInput = document.getElementById("cashflow-memo");
const btnFormClose = document.getElementById("btn-cashflow-form-close");
const btnFormSaveContinue = document.getElementById(
  "btn-cashflow-form-save-continue",
);
const modal = document.getElementById("cashflow-modal");

const btnNew = document.getElementById("btn-cashflow-new");
const btnEdit = document.getElementById("btn-cashflow-edit");
const btnDelete = document.getElementById("btn-cashflow-delete");
const btnInitDefaults = document.getElementById("btn-cashflow-init-defaults");
const btnBackup = document.getElementById("btn-cashflow-backup");
const btnRestore = document.getElementById("btn-cashflow-restore");

const listBody = document.getElementById("cashflow-list");
const tableHeader = document.querySelector(".cashflow-table thead");
const searchInput = document.getElementById("cashflow-search");
const countSpan = document.getElementById("cashflow-count");
const totalInnSpan = document.getElementById("cashflow-total-inn");
const totalOutSpan = document.getElementById("cashflow-total-out");
const totalBalSpan = document.getElementById("cashflow-total-bal");

// 입출금 구분 코드 관련 요소
const typeList = document.getElementById("cashflow-type-list");
const typeForm = document.getElementById("cashflow-type-form");
const typeCodeInput = document.getElementById("cashflow-type-code");
const typeNameInput = document.getElementById("cashflow-type-name");
const typeStatusSelect = document.getElementById("cashflow-type-status");
const typeModalTitle = document.getElementById("cashflow-type-modal-title");
const typeModal = document.getElementById("cashflow-type-modal");
const typeIdModeSelect = document.getElementById("cashflow-type-id-mode");
const btnTypeOpen = document.getElementById("btn-open-cashflow-type-modal");
const btnTypeClose = document.getElementById("btn-cashflow-type-close");
const btnTypeSaveContinue = document.getElementById(
  "btn-cashflow-type-save-continue",
);
const btnTypeEdit = document.getElementById("btn-cashflow-type-edit");
const btnTypeDelete = document.getElementById("btn-cashflow-type-delete");

// 입출금 분류 코드 관련 요소 (왼쪽 카드 박스는 삭제됨, 모달만 사용)
// (deprecated) cashflow-group-list는 현재 HTML에 없음(좌측 카드 삭제)
const groupList = null;
const groupModal = document.getElementById("cashflow-group-modal");
const groupForm = document.getElementById("cashflow-group-form");
const groupCodeInput = document.getElementById("cashflow-group-code");
const groupStatusSelect = document.getElementById("cashflow-group-status");
const groupDirectionSelect = document.getElementById(
  "cashflow-group-direction",
);
const groupItemSelect = document.getElementById("cashflow-group-item");
const groupIdModeSelect = document.getElementById("cashflow-group-id-mode");
// (deprecated) 그룹 모달 open/edit/delete 버튼은 현재 HTML에 없음
const btnGroupOpen = null;
const btnGroupClose = document.getElementById("btn-cashflow-group-close");
const btnGroupSaveContinue = document.getElementById(
  "btn-cashflow-group-save-continue",
);
const btnGroupEdit = null;
const btnGroupDelete = null;
const btnGroupImportItems = document.getElementById(
  "btn-cashflow-group-import-items",
);

let currentEditingCode = null;
let currentSort = { key: null, direction: "asc" };
let cachedItems = [];
let cachedItemsAll = [];
let cachedTypes = [];
let cachedGroups = [];
let selectedTypeCode = null;

function updateCashflowJsonRestoreButtonVisibility() {
  // '복원(JSON)'은 백업 파일을 덮어써서 복원하는 기능이다.
  // 거래처/품목의 'JSON 불러오기(초기 데이터 주입)'와 성격이 다르므로,
  // 데이터 존재 여부로 숨기지 않고 항상 노출한다.
  if (!btnRestore) return;
  btnRestore.hidden = false;
}

function updateCashflowInitDefaultsButtonVisibility() {
  if (!btnInitDefaults) return;
  const hasAnyMasterData =
    (cachedTypes || []).length +
      (cachedGroups || []).length +
      (cachedItemsAll || []).length >
    0;
  // 기본코드 불러오기는 초기 세팅용(데이터 0건)일 때만 노출
  btnInitDefaults.hidden = hasAnyMasterData;
}
let selectedGroupCode = null;
let editingTypeCode = null;
let editingGroupCode = null;
let cashflowItemSubmitMode = "close";
let cashflowTypeSubmitMode = "close";
let cashflowGroupSubmitMode = "close";

function normalizeCode(v) {
  return String(v ?? "").trim();
}

async function renameCashflowTypeCode(
  oldCodeRaw,
  newCodeRaw,
  newNameRaw,
  newStatusRaw,
) {
  const oldCode = normalizeCode(oldCodeRaw);
  const newCode = normalizeCode(newCodeRaw);
  const newName = String(newNameRaw ?? "").trim();
  const newStatus = String(newStatusRaw || "active");
  if (!oldCode || !newCode) throw new Error("코드가 비었습니다.");

  // 1) 새 코드로 구분 저장(put)
  await updateCashflowType({ code: newCode, name: newName, status: newStatus });

  // 2) 항목(cashflow_items)의 typeCode 마이그레이션
  let items = [];
  try {
    items = await getCashflowItems();
  } catch (_) {
    items = [];
  }
  for (const it of items || []) {
    if (!it) continue;
    if (normalizeCode(it.typeCode) !== oldCode) continue;
    await updateCashflowItem({ ...it, typeCode: newCode });
  }

  // 3) 분류(cashflow_groups)의 direction(=구분코드) 마이그레이션
  let groups = [];
  try {
    groups = await getCashflowGroups();
  } catch (_) {
    groups = [];
  }
  for (const g of groups || []) {
    if (!g) continue;
    if (normalizeCode(g.direction) !== oldCode) continue;
    await updateCashflowGroup({ ...g, direction: newCode });
  }

  // 4) 원장(ledger_tx)의 accountId/cashflowCode 마이그레이션
  let ledgerAll = [];
  try {
    ledgerAll = await getAllLedgerTx();
  } catch (_) {
    ledgerAll = [];
  }
  const now = Date.now();
  for (const tx of ledgerAll || []) {
    if (!tx) continue;
    const next = { ...tx };
    let changed = false;

    if (normalizeCode(next.accountId) === oldCode) {
      next.accountId = newCode;
      changed = true;
    }
    if (normalizeCode(next.cashflowCode) === oldCode) {
      next.cashflowCode = newCode;
      changed = true;
    }

    if (changed) {
      next.updatedAt = now;
      // cashflow_type의 이름 변경이 있을 수 있으므로, accountName도 같이 맞춘다.
      if (normalizeCode(next.accountId) === newCode && newName) {
        next.accountName = newName;
      }
      await putLedgerTx(next);
    }
  }

  // 5) 기존 코드 삭제
  await deleteCashflowType(oldCode);
}

// 항목별 집계(입금/출금/잔액)
let itemStatsByCode = new Map();
// 전체 항목 집계(필터와 무관)
let itemStatsAllByCode = new Map();

// 구분별 잔액(Map<typeCode, number>)
let typeBalances = new Map();
let orphanLedgerCodeStats = new Map();
let ledgerCodeStats = new Map();
let lastAuditSignature = "";
let cashflowItemCodeByName = new Map();
let mainModalEscOff = null;
let typeModalEscOff = null;
let groupModalEscOff = null;
const cashflowModalDirty = createFormDirtyTracker(() => ({
  code: codeInput ? codeInput.value : "",
  typeForItem: typeSelectForItem ? typeSelectForItem.value : "",
  name: nameInput ? nameInput.value : "",
  opening: openingInput ? openingInput.value : "",
  memo: memoInput ? memoInput.value : "",
}));
const cashflowTypeModalDirty = createFormDirtyTracker(() => ({
  code: typeCodeInput ? typeCodeInput.value : "",
  name: typeNameInput ? typeNameInput.value : "",
}));
const cashflowGroupModalDirty = createFormDirtyTracker(() => ({
  code: groupCodeInput ? groupCodeInput.value : "",
  direction: groupDirectionSelect ? groupDirectionSelect.value : "",
  item: groupItemSelect ? groupItemSelect.value : "",
}));
const closeCashflowModalWithConfirm = wrapDirtyClose(
  cashflowModalDirty,
  baseCloseModal,
);
const closeCashflowTypeModalWithConfirm = wrapDirtyClose(
  cashflowTypeModalDirty,
  baseCloseTypeModal,
);
const closeCashflowGroupModalWithConfirm = wrapDirtyClose(
  cashflowGroupModalDirty,
  baseCloseGroupModal,
);

function buildTypeBalances(items, types, txAll) {
  rebuildCashflowItemCodeByName(items || []);
  const openingByType = new Map();
  (items || []).forEach((it) => {
    const typeCode = it?.typeCode || "";
    if (!typeCode) return;
    const opening = Number(it.openingBalance != null ? it.openingBalance : 0) || 0;
    openingByType.set(typeCode, (openingByType.get(typeCode) || 0) + opening);
  });

  const sumByType = new Map();
  (txAll || []).forEach((tx) => {
    const code = resolveLedgerItemOrTypeCode(tx);
    if (!code) return;
    const amount = Number(tx?.amount) || 0;
    if (!(amount > 0)) return;

    let typeCode = "";
    const item = (items || []).find((it) => String(it?.code) === String(code));
    if (item) typeCode = item.typeCode || "";
    else typeCode = code;
    if (!typeCode) return;

    const sign = tx?.flow === "in" ? 1 : -1;
    sumByType.set(typeCode, (sumByType.get(typeCode) || 0) + sign * amount);
  });

  const nextMap = new Map();
  (types || []).forEach((t) => {
    const code = t?.code || "";
    if (!code) return;
    const opening = openingByType.get(code) || 0;
    const delta = sumByType.get(code) || 0;
    nextMap.set(code, opening + delta);
  });
  return nextMap;
}

function updateTypeBalanceCells() {
  if (!typeList) return;
  const rows = typeList.querySelectorAll('tr[data-code]');
  rows.forEach((row) => {
    const code = String(row?.dataset?.code || "");
    if (!code) return;
    const balance = typeBalances.get(code) || 0;
    const cells = row.querySelectorAll('td');
    const balCell = cells && cells.length ? cells[cells.length - 1] : null;
    if (!balCell) return;
    balCell.classList.add('right');
    balCell.setAttribute('data-amount-color', '1');
    balCell.setAttribute('data-amount-value', String(balance));
    balCell.textContent = fmt(balance);
  });
}

function auditCashflowBalanceMismatches() {
  try {
    const items = cachedItemsAll || [];
    const types = cachedTypes || [];

    const sumItemBalByType = new Map();
    items.forEach((it) => {
      const typeCode = String(it?.typeCode || "");
      if (!typeCode) return;
      const code = String(it?.code || "");
      const stats = itemStatsAllByCode.get(code);
      const bal = Number(stats?.bal) || 0;
      sumItemBalByType.set(typeCode, (sumItemBalByType.get(typeCode) || 0) + bal);
    });

    const mismatches = [];
    (types || []).forEach((t) => {
      const typeCode = String(t?.code || "");
      if (!typeCode) return;
      const left = Number(typeBalances.get(typeCode) || 0) || 0;
      const right = Number(sumItemBalByType.get(typeCode) || 0) || 0;
      const diff = left - right;
      if (diff !== 0) {
        const direct = ledgerCodeStats.get(typeCode);
        const hasDirectTx = !!direct && ((Number(direct.inn) || 0) + (Number(direct.out) || 0) > 0);
        mismatches.push({
          typeCode,
          typeName: String(t?.name || ""),
          typeBalance: left,
          sumItems: right,
          diff,
          hint: direct
            ? (hasDirectTx
                ? '구분코드로 직접 입력된 원장거래가 포함된 것으로 보입니다.'
                : '원장 코드 매칭 누락/초기 로딩 실패 가능성이 있습니다.')
            : '원장 코드 매칭 누락/초기 로딩 실패 가능성이 있습니다.',
        });
      }
    });

    const typeCodes = new Set((cachedTypes || []).map((t) => String(t?.code || '')).filter(Boolean));
    const itemCodes = new Set((cachedItemsAll || []).map((it) => String(it?.code || '')).filter(Boolean));
    const orphanOnly = Array.from(orphanLedgerCodeStats.entries())
      .filter(([code]) => !typeCodes.has(String(code)) && !itemCodes.has(String(code)))
      .map(([code, v]) => ({ code, ...v }));

    // 같은 결과가 연속으로 나오면 로그를 중복 출력하지 않는다.
    const signature = JSON.stringify({ mismatches, orphanOnly });
    if (signature === lastAuditSignature) return;
    lastAuditSignature = signature;

    if (mismatches.length || orphanOnly.length) {
      if (mismatches.length) {
        const brief = mismatches.map((m) => ({
          typeCode: m.typeCode,
          diff: m.diff,
        }));
        console.warn('[cashflow] 구분/장부 잔액 불일치 요약', brief);
      }
      console.groupCollapsed(
        `[cashflow] 잔액 점검: 불일치 ${mismatches.length}건, 고아코드 ${orphanOnly.length}건`,
      );
      if (mismatches.length) {
        console.table(mismatches);
      }
      if (orphanOnly.length) {
        console.table(orphanOnly);
      }
      console.groupEnd();
    }
  } catch (e) {
    // 진단 실패는 UX에 영향 없도록 조용히 무시
  }
}

// cashflow_items의 기초잔액 + ledger tx의 입금/출금을 합산해 구분별 잔액을 계산
async function rebuildTypeBalances() {
  try {
    const items = await getCashflowItems();
    let types = cachedTypes;
    if (!types || !types.length) {
      types = await getCashflowTypes();
    }
    let txAll = [];
    try {
      txAll = await getAllLedgerTx();
    } catch (_) {
      txAll = [];
    }

    typeBalances = buildTypeBalances(items, types, txAll);
  } catch (e) {
    // 계산 실패 시 잔액 정보를 초기화하되, 화면 동작은 유지
    typeBalances = new Map();
  }
}

function baseCloseModal() {
  if (modal) {
    closeModalOverlay(modal);
    if (typeof mainModalEscOff === "function") {
      mainModalEscOff();
      mainModalEscOff = null;
    }
  }
}

function openModal() {
  if (modal) {
    openModalOverlay(modal);
    cashflowModalDirty.markClean();
    if (typeof mainModalEscOff === "function") mainModalEscOff();
    mainModalEscOff = registerModalEscClose(
      modal,
      closeCashflowModalWithConfirm,
    );
  }
}

function closeModal() {
  closeCashflowModalWithConfirm();
}

// ===== 입출금 구분 모달 제어 =====

function baseCloseTypeModal() {
  if (typeModal) {
    closeModalOverlay(typeModal);
    if (typeof typeModalEscOff === "function") {
      typeModalEscOff();
      typeModalEscOff = null;
    }
  }

  // 모달이 실제로 닫힌 경우에만 폼 상태를 초기화한다(Dirty 확인 취소 시에는 호출되지 않음)
  resetTypeForm();
}

function openTypeModal() {
  if (typeModal) {
    openModalOverlay(typeModal);
    cashflowTypeModalDirty.markClean();
    if (typeof typeModalEscOff === "function") typeModalEscOff();
    typeModalEscOff = registerModalEscClose(
      typeModal,
      closeCashflowTypeModalWithConfirm,
    );
  }
}

function closeTypeModal() {
  closeCashflowTypeModalWithConfirm();
}

// ===== 입출금 분류 모달 제어 =====

function baseCloseGroupModal() {
  if (groupModal) {
    closeModalOverlay(groupModal);
    if (typeof groupModalEscOff === "function") {
      groupModalEscOff();
      groupModalEscOff = null;
    }
  }
}

function openGroupModal() {
  if (groupModal) {
    openModalOverlay(groupModal);
    cashflowGroupModalDirty.markClean();
    if (typeof groupModalEscOff === "function") groupModalEscOff();
    groupModalEscOff = registerModalEscClose(
      groupModal,
      closeCashflowGroupModalWithConfirm,
    );
  }
}

function closeGroupModal() {
  closeCashflowGroupModalWithConfirm();
}

function resetTypeForm() {
  editingTypeCode = null;
  if (typeModalTitle) typeModalTitle.textContent = "구분 추가";
  if (typeIdModeSelect) typeIdModeSelect.value = "auto";
  if (typeIdModeSelect) typeIdModeSelect.disabled = false;
  if (typeCodeInput) {
    typeCodeInput.readOnly = true;
    typeCodeInput.value = "";
  }
  if (typeNameInput) typeNameInput.value = "";
  if (typeStatusSelect) typeStatusSelect.value = "active";

  // 자동 모드면 바로 코드 미리보기
  previewNextTypeCode();
}

function resetGroupForm() {
  editingGroupCode = null;
  if (groupIdModeSelect) groupIdModeSelect.value = "auto";
  if (groupIdModeSelect) groupIdModeSelect.disabled = false;
  if (groupCodeInput) {
    groupCodeInput.readOnly = true;
    groupCodeInput.value = "";
  }
  if (groupStatusSelect) groupStatusSelect.value = "active";
  if (groupDirectionSelect) groupDirectionSelect.value = "";
  if (groupItemSelect) groupItemSelect.value = "";

  // 자동 모드면 바로 코드 미리보기
  previewNextGroupCode();
}

function resetForm() {
  currentEditingCode = null;
  if (idModeSelect) idModeSelect.value = "auto";
  if (idModeSelect) idModeSelect.disabled = false;
  if (codeInput) {
    codeInput.readOnly = true;
    codeInput.value = "";
  }
  if (nameInput) nameInput.value = "";
  if (statusSelect) statusSelect.value = "active";
  if (openingInput) openingInput.value = "0";
  if (memoInput) memoInput.value = "";
  if (typeSelectForItem) typeSelectForItem.value = "";

  // 자동 모드면 바로 코드 미리보기
  previewNextItemCode();
}

let previewNextItemSeq = 0;
async function previewNextItemCode() {
  if (!codeInput) return;
  if (currentEditingCode) return;
  if (idModeSelect && idModeSelect.value === "manual") return;

  const seq = ++previewNextItemSeq;
  const allItems = await getCashflowItems();
  const next = generateCode(allItems || []);
  if (seq !== previewNextItemSeq) return;
  codeInput.value = next;
}

function previewNextTypeCode() {
  if (!typeCodeInput) return;
  if (editingTypeCode) return;
  if (typeIdModeSelect && typeIdModeSelect.value === "manual") return;

  const nums = (cachedTypes || [])
    .map((t) => {
      const m = String(t.code || "").match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  typeCodeInput.value = "A" + String(nextNum).padStart(2, "0");
}

function previewNextGroupCode() {
  if (!groupCodeInput) return;
  if (editingGroupCode) return;
  if (groupIdModeSelect && groupIdModeSelect.value === "manual") return;

  const nums = (cachedGroups || [])
    .map((g) => {
      const m = String(g.code || "").match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  groupCodeInput.value = "A" + String(nextNum).padStart(3, "0");
}

// 코드 규칙: 001, 002 ... (3자리 숫자)
function generateCode(existing) {
  const nums = existing
    .map((it) => {
      const m = String(it.code || "").match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => !Number.isNaN(n));
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return "A" + String(nextNum).padStart(4, "0");
}

function renderList(items, keyword) {
  listBody.innerHTML = "";

  let visibleCount = 0;
  let totalInn = 0;
  let totalOut = 0;
  let totalBal = 0;

  items
    .filter((it) => {
      if (!keyword) return true;
      const q = keyword.toLowerCase().trim();
      const type = cachedTypes.find(
        (t) => String(t.code) === String(it.typeCode),
      );
      const typeName = type ? String(type.name || "") : "";
      const typeCode = String(it.typeCode || "").toLowerCase();
      const code = (it.code || "").toLowerCase();
      const name = (it.name || "").toLowerCase();
      const memo = (it.memo || "").toLowerCase();
      const dir = (directionLabel[it.direction] || "").toLowerCase();
      const typeLower = typeName.toLowerCase();
      return (
        typeCode.includes(q) ||
        code.includes(q) ||
        name.includes(q) ||
        memo.includes(q) ||
        dir.includes(q) ||
        typeLower.includes(q)
      );
    })
    .forEach((it) => {
      visibleCount += 1;
      const type = cachedTypes.find(
        (t) => String(t.code) === String(it.typeCode),
      );
      const typeName = type ? type.name : "";

      const stats = itemStatsByCode.get(String(it.code || "")) || {
        inn: 0,
        out: 0,
        bal: 0,
      };
      const inn = Number(stats.inn) || 0;
      const out = Number(stats.out) || 0;
      const bal = Number(stats.bal) || 0;

      totalInn += inn;
      totalOut += out;
      totalBal += bal;

      const tr = document.createElement("tr");
      tr.dataset.code = it.code;
      const status = String(it?.status || "active");
      if (status && status !== "active") tr.classList.add("is-inactive");
      tr.innerHTML = `
        <td>${typeName}</td>
        <td>${it.code || ""}</td>
        <td>${it.name || ""}</td>
        <td class="right" data-amount-color="1" data-amount-value="${inn}">${fmt(inn)}</td>
        <td class="right" data-amount-color="1" data-amount-value="${out}" data-amount-force="minus">${fmt(out)}</td>
        <td class="right" data-amount-color="1" data-amount-value="${bal}">${fmt(bal)}</td>
        <td>${it.memo || ""}</td>
      `;
      listBody.appendChild(tr);
    });

  if (countSpan) {
    countSpan.textContent = String(visibleCount);
  }

  if (totalInnSpan) totalInnSpan.textContent = fmt(totalInn);
  if (totalOutSpan) totalOutSpan.textContent = fmt(totalOut);
  if (totalBalSpan) totalBalSpan.textContent = fmt(totalBal);
}

function renderTypeList(types) {
  if (!typeList) return;
  typeList.innerHTML = "";

  types.forEach((t) => {
    const tr = document.createElement("tr");
    tr.dataset.code = t.code;
    const status = String(t?.status || "active");
    if (status && status !== "active") tr.classList.add("is-inactive");
    const balance = typeBalances.get(t.code) || 0;
    tr.innerHTML = `
      <td>${t.code || ""}</td>
      <td>${t.name || ""}</td>
      <td class="right" data-amount-color="1" data-amount-value="${balance}">${fmt(balance)}</td>
    `;
    typeList.appendChild(tr);
  });

  bindClickRowSelect(typeList, {
    rowSelector: 'tr[data-code]',
    onSelect: (row) => {
      selectedTypeCode = String(row?.dataset?.code || '');
      // 선택한 구분에 따라 우측 항목 목록을 필터링
      reloadList();
    },
  });

  // 구분 리스트도 방향키/엔터로 이동 가능하게 처리
  enableTableArrowNavigation(typeList, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });

  bindDblClickRowEdit(typeList, {
    rowSelector: 'tr[data-code]',
    editButton: btnTypeEdit,
  });
}

function renderGroupList(groups) {
  if (!groupList) return;
  groupList.innerHTML = "";

  groups.forEach((g) => {
    const tr = document.createElement("tr");
    tr.dataset.code = g.code;
    const status = String(g?.status || "active");
    if (status && status !== "active") tr.classList.add("is-inactive");
    const type = (cachedTypes || []).find(
      (t) => String(t.code) === String(g.direction),
    );
    const typeName = type ? String(type.name || "") : "";
    tr.innerHTML = `
      <td>${typeName}</td>
      <td>${g.code || ""}</td>
      <td>${g.name || ""}</td>
    `;
    groupList.appendChild(tr);
  });

  bindClickRowSelect(groupList, {
    rowSelector: 'tr[data-code]',
    onSelect: (row) => {
      selectedGroupCode = String(row?.dataset?.code || '');
    },
  });

  // 그룹 리스트도 방향키/엔터로 이동 가능하게 처리
  enableTableArrowNavigation(groupList, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });

  bindDblClickRowEdit(groupList, {
    rowSelector: 'tr[data-code]',
    editButton: btnGroupEdit,
  });
}

// 목록에서 방향키로 선택 행 이동
if (listBody) {
  bindClickRowSelect(listBody, {
    rowSelector: 'tr[data-code]',
    onSelect: (row) => {
      const code = String(row?.dataset?.code || '');
      if (!code) return;
      const item = (cachedItems || []).find((it) => String(it.code) === code);
      if (item) loadToForm(item);
    },
  });

  // 목록에서 방향키/엔터로 선택 행 이동
  enableTableArrowNavigation(listBody, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });

  bindDblClickRowEdit(listBody, {
    rowSelector: 'tr[data-code]',
    editButton: btnEdit,
  });
}

function loadToForm(item) {
  currentEditingCode = item.code;

  if (idModeSelect) {
    idModeSelect.value = "manual";
    idModeSelect.disabled = true;
  }
  if (codeInput) {
    codeInput.readOnly = false;
    codeInput.value = item.code || "";
  }
  if (nameInput) nameInput.value = item.name || "";
  if (statusSelect) statusSelect.value = item.status || "active";
  if (openingInput)
    openingInput.value =
      item.openingBalance != null ? String(item.openingBalance) : "0";
  if (memoInput) memoInput.value = item.memo || "";
  if (typeSelectForItem) typeSelectForItem.value = item.typeCode || "";
}

async function reloadList() {
  cachedItemsAll = await getCashflowItems();
  cachedItems = [...(cachedItemsAll || [])];
  rebuildCashflowItemCodeByName(cachedItemsAll || []);
  updateCashflowJsonRestoreButtonVisibility();
  updateCashflowInitDefaultsButtonVisibility();

  // 왼쪽에서 구분이 선택되어 있으면 해당 구분(typeCode)에 속한 항목만 표시
  if (selectedTypeCode) {
    cachedItems = cachedItems.filter(
      (it) => String(it.typeCode) === String(selectedTypeCode),
    );
  }

  // 항목별 입금/출금 합계 및 잔액 계산
  // - ledger_tx는 cashflowItemCode(항목 코드)를 우선 사용한다.
  // - 없으면 cashflowCode(구분/레거시), 그 다음 accountId를 사용
  // - 항목 코드(it.code)와 일치하는 거래만 집계
  const sumByItem = new Map();
  orphanLedgerCodeStats = new Map();
  ledgerCodeStats = new Map();
  let txAll = [];
  try {
    txAll = await getAllLedgerTx();
  } catch (e) {
    txAll = [];
  }

  const knownItemCodes = new Set(
    (cachedItemsAll || [])
      .map((it) => String(it?.code || ""))
      .filter(Boolean),
  );
  const knownTypeCodes = new Set(
    (cachedTypes || []).map((t) => String(t?.code || "")).filter(Boolean),
  );

  txAll.forEach((tx) => {
    const code = resolveLedgerItemOrTypeCode(tx);
    if (!code) return;
    const amount = Number(tx.amount) || 0;
    if (!(amount > 0)) return;
    const key = String(code);
    const prev = sumByItem.get(key) || { inn: 0, out: 0 };
    if (tx.flow === "in") prev.inn += amount;
    else prev.out += amount;
    sumByItem.set(key, prev);

    ledgerCodeStats.set(key, { inn: prev.inn, out: prev.out });

    // 진단용: 타입/항목으로 매칭되지 않는 코드가 있는지 기록
    const isKnownItem = knownItemCodes.has(key);
    const isKnownType = knownTypeCodes.has(key);
    if (!isKnownItem && !isKnownType) {
      const diag = orphanLedgerCodeStats.get(key) || { inn: 0, out: 0, count: 0 };
      if (tx.flow === 'in') diag.inn += amount;
      else diag.out += amount;
      diag.count += 1;
      orphanLedgerCodeStats.set(key, diag);
    }
  });

  // 전체 항목 기준으로 stats 계산 (좌측 합계/진단에 사용)
  itemStatsAllByCode = new Map();
  (cachedItemsAll || []).forEach((it) => {
    const code = String(it?.code || "");
    if (!code) return;
    const sums = sumByItem.get(code) || { inn: 0, out: 0 };
    const opening = Number(it?.openingBalance != null ? it.openingBalance : 0) || 0;
    const bal = opening + (Number(sums.inn) || 0) - (Number(sums.out) || 0);
    itemStatsAllByCode.set(code, {
      inn: Number(sums.inn) || 0,
      out: Number(sums.out) || 0,
      bal,
    });
  });

  // 화면에 표시되는(필터된) 항목에만 매핑
  itemStatsByCode = new Map();
  cachedItems.forEach((it) => {
    const code = String(it?.code || "");
    const stats = itemStatsAllByCode.get(code) || { inn: 0, out: 0, bal: 0 };
    itemStatsByCode.set(code, stats);
    // 정렬을 위해 임시 키도 부여
    it.__inn = stats.inn;
    it.__out = stats.out;
    it.__bal = stats.bal;
  });

  // 좌측 구분 잔액도 같은 txAll 기준으로 갱신(초기 로딩 시 원장 조회 실패로 인한 불일치 방지)
  try {
    const types = cachedTypes && cachedTypes.length ? cachedTypes : await getCashflowTypes();
    typeBalances = buildTypeBalances(cachedItemsAll || [], types, txAll || []);
    updateTypeBalanceCells();
    auditCashflowBalanceMismatches();
  } catch (_) {
    // ignore
  }

  if (currentSort.key) {
    cachedItems = sortByKey(
      cachedItems,
      currentSort.key,
      currentSort.direction,
    );
  }

  const keyword = searchInput ? searchInput.value : "";
  renderList(cachedItems, keyword);
}

async function reloadTypes() {
  cachedTypes = await getCashflowTypes();
  updateCashflowJsonRestoreButtonVisibility();
  updateCashflowInitDefaultsButtonVisibility();
  await rebuildTypeBalances();
  renderTypeList(cachedTypes);

  // 구분 선택 콤보박스도 함께 채운다.
  if (typeSelectForItem) {
    const prev = typeSelectForItem.value;
    const activeTypes = (cachedTypes || []).filter(
      (t) => String(t?.status || "active") === "active",
    );
    typeSelectForItem.innerHTML =
      '<option value="">(선택)</option>' +
      activeTypes
        .map((t) => `<option value="${t.code}">${t.code} ${t.name}</option>`)
        .join("");
    if ([...typeSelectForItem.options].some((o) => o.value === prev)) {
      typeSelectForItem.value = prev;
    }
  }
}

async function reloadGroups() {
  cachedGroups = await getCashflowGroups();
  updateCashflowJsonRestoreButtonVisibility();
  updateCashflowInitDefaultsButtonVisibility();
  renderGroupList(cachedGroups);
}

function populateGroupTypeSelect() {
  if (!groupDirectionSelect) return;
  const prev = groupDirectionSelect.value;
  groupDirectionSelect.innerHTML =
    '<option value="">(선택)</option>' +
    cachedTypes
      .filter((t) => String(t?.status || "active") === "active")
      .map((t) => `<option value="${t.code}">${t.code} ${t.name}</option>`)
      .join("");
  if (prev && [...groupDirectionSelect.options].some((o) => o.value === prev)) {
    groupDirectionSelect.value = prev;
  }
}

function populateGroupItemSelect() {
  if (!groupItemSelect) return;
  const currentType = groupDirectionSelect ? groupDirectionSelect.value : "";
  const prev = groupItemSelect.value;

  const available = (cachedItems || []).filter((it) => {
    if (String(it?.status || "active") !== "active") return false;
    if (!currentType) return true;
    return String(it.typeCode || "") === String(currentType);
  });

  groupItemSelect.innerHTML =
    '<option value="">(선택)</option>' +
    available
      .map((it) => `<option value="${it.code}">${it.code} ${it.name}</option>`)
      .join("");

  if (prev && available.some((it) => it.code === prev)) {
    groupItemSelect.value = prev;
  } else {
    groupItemSelect.value = "";
  }
}

function bindEvents() {
  if (btnNew) {
    btnNew.addEventListener("click", () => {
      resetForm();
      // 왼쪽에서 선택한 구분이 있으면 신규 등록 폼에도 기본값으로 반영
      if (selectedTypeCode && typeSelectForItem) {
        typeSelectForItem.value = selectedTypeCode;
      }
      openModal();
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      const selected = listBody ? listBody.querySelector("tr.selected") : null;
      if (!selected) {
        alert("수정할 항목을 선택하세요.");
        return;
      }
      const code = selected.dataset.code;
      const item = cachedItems.find((it) => String(it.code) === String(code));
      if (!item) {
        alert("선택한 항목을 찾을 수 없습니다.");
        return;
      }
      loadToForm(item);
      openModal();
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      const selected = listBody ? listBody.querySelector("tr.selected") : null;
      if (!selected) {
        alert("삭제할 항목을 선택하세요.");
        return;
      }
      const code = selected.dataset.code;
      if (!code) return;

      const codeStr = normalizeStr(code);
      const usedByLedger = await hasAnyLedgerTxForCode(codeStr);

      // 분류(cashflow_groups)에서 itemCode로 참조 중이면 완전 삭제는 금지
      let usedByGroup = false;
      try {
        const groups = await getCashflowGroups();
        usedByGroup = (groups || []).some(
          (g) => normalizeStr(g?.itemCode) === codeStr,
        );
      } catch (_) {
        usedByGroup = true;
      }

      if (!usedByLedger && !usedByGroup) {
        const ok = await confirmAsync(
          "이 장부는 거래 내역이 없습니다. 완전 삭제할까요?\n\n- 삭제 후 복구할 수 없습니다",
          { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
        );
        if (!ok) return;
        await deleteCashflowItem(codeStr);
        await reloadList();
        return;
      }

      const ok = await confirmAsync(
        "선택한 장부는 거래/참조 내역이 있어 완전 삭제할 수 없습니다.\n비활성(미사용) 처리할까요?\n\n- 과거 거래는 유지됩니다\n- 신규 선택에서는 숨김 처리됩니다",
        { title: "비활성 처리", okText: "비활성", cancelText: "취소", tone: "warning" },
      );
      if (!ok) return;

      const target = (cachedItems || []).find(
        (it) => normalizeStr(it?.code) === codeStr,
      );
      if (target) {
        target.status = "inactive";
        await updateCashflowItem(target);
      }
      await reloadList();
    });
  }

  if (btnFormClose) {
    btnFormClose.addEventListener("click", () => {
      closeModal();
    });
  }

  if (btnFormSaveContinue && form) {
    btnFormSaveContinue.addEventListener("click", () => {
      cashflowItemSubmitMode = "continue";
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.querySelector('button[type="submit"]')?.click();
    });
  }

  // 구분 코드 모달 열기
  if (btnTypeOpen) {
    btnTypeOpen.addEventListener("click", () => {
      resetTypeForm();
      openTypeModal();
    });
  }

  if (btnTypeClose) {
    btnTypeClose.addEventListener("click", () => {
      closeTypeModal();
    });
  }

  if (btnTypeSaveContinue && typeForm) {
    btnTypeSaveContinue.addEventListener("click", () => {
      cashflowTypeSubmitMode = "continue";
      if (typeof typeForm.requestSubmit === "function") typeForm.requestSubmit();
      else typeForm.querySelector('button[type="submit"]')?.click();
    });
  }

  if (btnTypeEdit) {
    btnTypeEdit.addEventListener("click", () => {
      if (!selectedTypeCode) {
        alert("수정할 구분을 선택하세요.");
        return;
      }
      const t = cachedTypes.find(
        (x) => String(x.code) === String(selectedTypeCode),
      );
      if (!t) {
        alert("선택한 구분을 찾을 수 없습니다.");
        return;
      }
      editingTypeCode = normalizeCode(t.code);
      if (typeModalTitle) typeModalTitle.textContent = "구분 수정";
      // 수정 모드: 코드 변경을 허용하되, 저장 시에는 리네임(마이그레이션)으로 처리한다.
      if (typeIdModeSelect) {
        typeIdModeSelect.value = "manual";
        typeIdModeSelect.disabled = true;
      }
      if (typeCodeInput) {
        typeCodeInput.readOnly = false;
        typeCodeInput.value = editingTypeCode;
      }
      if (typeNameInput) typeNameInput.value = t.name || "";
      if (typeStatusSelect) typeStatusSelect.value = t.status || "active";
      openTypeModal();
    });
  }

  if (btnTypeDelete) {
    btnTypeDelete.addEventListener("click", async () => {
      if (!selectedTypeCode) {
        alert("삭제할 구분을 선택하세요.");
        return;
      }

      const codeStr = normalizeStr(selectedTypeCode);
      const usedByLedger = await hasAnyLedgerTxForCode(codeStr);

      // 구분에 속한 장부명이 남아있으면 완전 삭제 불가(고아 데이터 방지)
      let hasChildItems = false;
      try {
        const items = await getCashflowItems();
        hasChildItems = (items || []).some(
          (it) => normalizeStr(it?.typeCode) === codeStr,
        );
      } catch (_) {
        hasChildItems = true;
      }

      if (!usedByLedger && !hasChildItems) {
        const ok = await confirmAsync(
          "이 구분은 거래 내역이 없고, 속한 장부명이 없습니다. 완전 삭제할까요?\n\n- 삭제 후 복구할 수 없습니다",
          { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
        );
        if (!ok) return;
        await deleteCashflowType(codeStr);
        selectedTypeCode = null;
        await reloadTypes();
        return;
      }

      const ok = await confirmAsync(
        "선택한 구분은 거래/참조 내역이 있어 완전 삭제할 수 없습니다.\n비활성(미사용) 처리할까요?\n\n- 과거 거래는 유지됩니다\n- 신규 선택에서는 숨김 처리됩니다",
        { title: "비활성 처리", okText: "비활성", cancelText: "취소", tone: "warning" },
      );
      if (!ok) return;

      const target = (cachedTypes || []).find(
        (t) => normalizeStr(t?.code) === codeStr,
      );
      if (target) {
        target.status = "inactive";
        await updateCashflowType({
          code: target.code,
          name: target.name,
          status: target.status,
        });
      }
      selectedTypeCode = null;
      await reloadTypes();
    });
  }

  // 분류 코드 모달 열기
  if (btnGroupOpen) {
    btnGroupOpen.addEventListener("click", () => {
      resetGroupForm();
      // 구분/구분 항목 셀렉트는 모달을 열 때 최신 데이터로 채운다.
      populateGroupTypeSelect();
      populateGroupItemSelect();
      openGroupModal();
    });
  }

  // 항목 목록을 분류 목록으로 한 번에 넣기 (복사)
  if (btnGroupImportItems) {
    btnGroupImportItems.addEventListener("click", async () => {
      const scopeLabel = selectedTypeCode ? "선택한 구분" : "전체";
      const ok = await confirmAsync(
        `${scopeLabel} 항목을 분류로 넣을까요?\n(이미 있는 분류 코드는 건너뜁니다)`,
        { title: "확인", okText: "실행", cancelText: "취소" },
      );
      if (!ok) return;

      let allItems = [];
      let groups = [];
      try {
        allItems = await getCashflowItems();
      } catch (_) {
        allItems = [];
      }
      try {
        groups = await getCashflowGroups();
      } catch (_) {
        groups = [];
      }

      const existingCodes = new Set(
        (groups || []).map((g) => String(g?.code || "")).filter(Boolean),
      );
      const targets = (allItems || []).filter((it) => {
        if (!it || it.code == null) return false;
        if (selectedTypeCode)
          return String(it.typeCode || "") === String(selectedTypeCode);
        return true;
      });

      let added = 0;
      let skipped = 0;
      for (const it of targets) {
        const code = String(it.code || "").trim();
        if (!code) continue;
        if (existingCodes.has(code)) {
          skipped += 1;
          continue;
        }
        const group = {
          code,
          name: String(it.name || ""),
          direction: String(it.typeCode || ""),
          itemCode: code,
        };
        try {
          await updateCashflowGroup(group);
          existingCodes.add(code);
          added += 1;
        } catch (e) {
          console.error(e);
        }
      }

      await reloadGroups();
      alert(`완료: ${added}건 추가, ${skipped}건 건너뜀`);
    });
  }

  if (btnGroupClose) {
    btnGroupClose.addEventListener("click", () => {
      closeGroupModal();
    });
  }

  if (btnGroupSaveContinue && groupForm) {
    btnGroupSaveContinue.addEventListener("click", () => {
      cashflowGroupSubmitMode = "continue";
      if (typeof groupForm.requestSubmit === "function") groupForm.requestSubmit();
      else groupForm.querySelector('button[type="submit"]')?.click();
    });
  }

  if (btnGroupEdit) {
    btnGroupEdit.addEventListener("click", () => {
      if (!selectedGroupCode) {
        alert("수정할 분류를 선택하세요.");
        return;
      }
      const g = cachedGroups.find(
        (x) => String(x.code) === String(selectedGroupCode),
      );
      if (!g) {
        alert("선택한 분류를 찾을 수 없습니다.");
        return;
      }
      (async () => {
        editingGroupCode = g.code;
        if (groupIdModeSelect) {
          groupIdModeSelect.value = "manual";
          groupIdModeSelect.disabled = true;
        }
        if (groupCodeInput) {
          groupCodeInput.readOnly = false;
          groupCodeInput.value = g.code || "";
        }

        if (groupStatusSelect) groupStatusSelect.value = g.status || "active";

        // 셀렉트는 항상 최신 데이터로 채우고, 편집 대상 값으로 맞춘다.
        try {
          cachedItems = await getCashflowItems();
        } catch (_) {
          cachedItems = cachedItems || [];
        }
        populateGroupTypeSelect();
        if (groupDirectionSelect)
          groupDirectionSelect.value = g.direction || "";
        populateGroupItemSelect();
        if (groupItemSelect) groupItemSelect.value = g.itemCode || "";

        openGroupModal();
      })();
    });
  }

  if (btnGroupDelete) {
    btnGroupDelete.addEventListener("click", async () => {
      if (!selectedGroupCode) {
        alert("삭제할 분류를 선택하세요.");
        return;
      }

      const codeStr = normalizeStr(selectedGroupCode);

      // cashflow_groups는 현재 다른 거래 데이터에서 직접 참조되지 않으므로,
      // 완전 삭제를 기본 허용하되, 사용자 보호를 위해 확인을 한 번 더 한다.
      const ok = await confirmAsync(
        "이 분류를 완전 삭제할까요?\n\n- 삭제 후 복구할 수 없습니다\n- 관련 화면에서 분류 목록에서 사라집니다",
        { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;
      await deleteCashflowGroup(codeStr);
      selectedGroupCode = null;
      await reloadGroups();
    });
  }

  if (typeForm) {
    typeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      let code = typeCodeInput ? typeCodeInput.value.trim() : "";
      const name = typeNameInput ? typeNameInput.value.trim() : "";
      const status = typeStatusSelect ? typeStatusSelect.value : "active";

      if (!name) {
        alert("장부구분을 입력하세요.");
        return;
      }

      const mode = typeIdModeSelect ? typeIdModeSelect.value : "auto";

      // 코드 자동생성 모드: A01, A02 ... (2자리 숫자 + A)
      if (mode === "auto") {
        const nums = cachedTypes
          .map((t) => {
            const m = String(t.code || "").match(/(\d+)/);
            return m ? Number(m[1]) : NaN;
          })
          .filter((n) => !Number.isNaN(n));
        const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
        code = "A" + String(nextNum).padStart(2, "0");
      } else if (!code) {
        alert("코드를 입력하세요.");
        return;
      }

      if (editingTypeCode) {
        const oldCode = normalizeCode(editingTypeCode);
        const newCode = normalizeCode(code);

        // 동일 코드면 일반 업데이트
        if (oldCode === newCode) {
          await updateCashflowType({ code: oldCode, name, status });
        } else {
          const exists = (cachedTypes || []).some(
            (t) => normalizeCode(t?.code) === newCode,
          );
          if (exists) {
            alert("이미 존재하는 코드입니다.");
            return;
          }
          const ok = await confirmAsync(
            `구분코드를 ${oldCode} → ${newCode} 로 변경할까요?\n\n- 장부명/분류/입출금 원장 기록도 함께 변경됩니다.`,
            { title: "코드 변경", okText: "변경", cancelText: "취소", tone: "warning" },
          );
          if (!ok) {
            return;
          }
          await renameCashflowTypeCode(oldCode, newCode, name, status);
        }
      } else {
        await addCashflowType({ code, name, status });
      }

      await reloadTypes();

      if (cashflowTypeSubmitMode === "continue") {
        cashflowTypeSubmitMode = "close";
        const keepMode = typeIdModeSelect ? typeIdModeSelect.value : "auto";
        resetTypeForm();
        if (typeIdModeSelect) {
          typeIdModeSelect.value = keepMode || "auto";
          typeIdModeSelect.disabled = false;
        }
        if (typeCodeInput) {
          if (typeIdModeSelect && typeIdModeSelect.value === "manual") {
            typeCodeInput.readOnly = false;
            typeCodeInput.value = "";
          } else {
            typeCodeInput.readOnly = true;
          }
        }
        if (typeIdModeSelect && typeIdModeSelect.value === "auto") {
          previewNextTypeCode();
        }
        if (cashflowTypeModalDirty) cashflowTypeModalDirty.markClean();
        typeNameInput?.focus();
        return;
      }

      cashflowTypeSubmitMode = "close";
      closeTypeModal();
    });
  }

  if (idModeSelect && codeInput) {
    idModeSelect.addEventListener("change", () => {
      if (idModeSelect.value === "auto") {
        codeInput.readOnly = true;
        codeInput.value = "";
        previewNextItemCode();
      } else {
        codeInput.readOnly = false;
        codeInput.value = "";
        codeInput.focus();
      }
    });
  }

  if (typeIdModeSelect && typeCodeInput) {
    typeIdModeSelect.addEventListener("change", () => {
      if (typeIdModeSelect.value === "auto") {
        typeCodeInput.readOnly = true;
        typeCodeInput.value = "";
        previewNextTypeCode();
      } else {
        typeCodeInput.readOnly = false;
        typeCodeInput.value = "";
        typeCodeInput.focus();
      }
    });
  }

  if (groupIdModeSelect && groupCodeInput) {
    groupIdModeSelect.addEventListener("change", () => {
      if (groupIdModeSelect.value === "auto") {
        groupCodeInput.readOnly = true;
        groupCodeInput.value = "";
        previewNextGroupCode();
      } else {
        groupCodeInput.readOnly = false;
        groupCodeInput.value = "";
        groupCodeInput.focus();
      }
    });
  }

  // ===== JSON 백업 / 복원 =====
  if (btnInitDefaults) {
    btnInitDefaults.addEventListener("click", async () => {
      const hasAnyMasterData =
        (cachedTypes || []).length +
          (cachedGroups || []).length +
          (cachedItemsAll || []).length >
        0;
      if (hasAnyMasterData) {
        alert("이미 구분/분류/항목 데이터가 있어 JSON 불러오기를 실행하지 않습니다.");
        return;
      }

      try {
        const res = await fetch("data/cashflow-defaults.json");
        if (!res.ok) {
          alert("cashflow-defaults.json을 불러오지 못했습니다.");
          return;
        }
        const data = await res.json();
        const types = Array.isArray(data?.types) ? data.types : [];
        const items = Array.isArray(data?.items) ? data.items : [];
        const groups = Array.isArray(data?.groups) ? data.groups : [];

        await bulkReplaceCashflowTypes(types);
        await bulkReplaceCashflowItems(items);
        await bulkReplaceCashflowGroups(groups);

        await reloadTypes();
        await reloadGroups();
        await reloadList();
        alert("기본코드(구분/항목/분류)를 JSON에서 불러왔습니다.");
      } catch (err) {
        console.error(err);
        alert("JSON 불러오기 중 오류가 발생했습니다.");
      }
    });
  }

  if (btnBackup) {
    btnBackup.addEventListener("click", async () => {
      try {
        const types = await getCashflowTypes();
        const items = await getCashflowItems();
        const groups = await getCashflowGroups();
        const payload = { types, items, groups };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        a.href = url;
        a.download = `cashflow-backup-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        alert("입출금 코드 백업(JSON) 중 오류가 발생했습니다.");
      }
    });
  }

  if (btnRestore) {
    btnRestore.addEventListener("click", async () => {
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.onchange = async () => {
          if (!input.files || !input.files[0]) return;
          const file = input.files[0];
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const types = Array.isArray(data.types) ? data.types : [];
            const items = Array.isArray(data.items) ? data.items : [];
            const groups = Array.isArray(data.groups) ? data.groups : [];

            await bulkReplaceCashflowTypes(types);
            await bulkReplaceCashflowItems(items);
            await bulkReplaceCashflowGroups(groups);

            await reloadTypes();
            await reloadGroups();
            await reloadList();
            alert("입출금 코드/구분/분류 데이터를 백업 파일로 복원했습니다.");
          } catch (err) {
            console.error(err);
            alert("입출금 코드 복원(JSON) 중 오류가 발생했습니다.");
          }
        };
        input.click();
      } catch (err) {
        console.error(err);
        alert("입출금 코드 복원(JSON) 준비 중 오류가 발생했습니다.");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      let code = codeInput ? codeInput.value.trim() : "";
      const name = nameInput ? nameInput.value.trim() : "";
      const openingRaw = openingInput ? openingInput.value.trim() : "";
      const memo = memoInput ? memoInput.value.trim() : "";
      const typeCode = typeSelectForItem ? typeSelectForItem.value : "";
      const status = statusSelect ? statusSelect.value : "active";

      if (!name) {
        alert("항목명을 입력하세요.");
        return;
      }

      // 구분은 선택 안 해도 저장은 가능하도록 둔다.

      if (idModeSelect && idModeSelect.value === "auto") {
        // 구분별로 필터된 cachedItems를 쓰면 비어있는 구분에서 A0001이 반복 생성되어
        // 다른 구분의 기존 항목과 코드가 충돌할 수 있다. 전체 항목 기준으로 유니크 코드 생성.
        const allItems = await getCashflowItems();
        code = generateCode(allItems || []);
      }

      if (!code) {
        alert("코드를 입력하세요.");
        return;
      }

      const openingBalance = openingRaw ? Number(openingRaw) || 0 : 0;

      const item = {
        code,
        typeCode,
        name,
        openingBalance,
        memo,
        status,
      };

      try {
        if (currentEditingCode) {
          // 수정
          await updateCashflowItem(item);
        } else {
          // 신규
          await addCashflowItem(item);
        }

        await reloadList();

        if (cashflowItemSubmitMode === "continue") {
          cashflowItemSubmitMode = "close";
          const keepIdMode = idModeSelect ? idModeSelect.value : "auto";
          const keepTypeCode = typeSelectForItem ? typeSelectForItem.value : "";
          resetForm();

          // 기본정보 유지: 코드 모드 / 구분
          if (idModeSelect) {
            idModeSelect.value = keepIdMode || "auto";
            idModeSelect.disabled = false;
          }
          if (codeInput) {
            if (idModeSelect && idModeSelect.value === "manual") {
              codeInput.readOnly = false;
              codeInput.value = "";
            } else {
              codeInput.readOnly = true;
            }
          }
          if (typeSelectForItem && keepTypeCode) {
            typeSelectForItem.value = keepTypeCode;
          }
          if (idModeSelect && idModeSelect.value === "auto") {
            await previewNextItemCode();
          }
          if (cashflowModalDirty) cashflowModalDirty.markClean();
          nameInput?.focus();
          return;
        }

        // 저장 성공 시 변경사항이 반영되었으므로 더티 상태를 초기화하고
        // 확인창 없이 모달을 닫는다.
        cashflowItemSubmitMode = "close";
        if (cashflowModalDirty) cashflowModalDirty.markClean();
        baseCloseModal();
      } catch (err) {
        console.error(err);
        alert("저장 중 오류가 발생했습니다. (코드 중복일 수 있습니다)");
      }
    });
  }

  if (groupForm) {
    groupForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      let code = groupCodeInput ? groupCodeInput.value.trim() : "";
      const typeCode = groupDirectionSelect ? groupDirectionSelect.value : "";
      const itemCode = groupItemSelect ? groupItemSelect.value : "";
      const mode = groupIdModeSelect ? groupIdModeSelect.value : "auto";
      const status = groupStatusSelect ? groupStatusSelect.value : "active";

      if (!typeCode) {
        alert("구분을 선택하세요.");
        return;
      }

      if (!itemCode) {
        alert("구분 항목을 선택하세요.");
        return;
      }

      // 코드 자동생성 모드: A001, A002 ... (3자리 숫자 + A)
      if (mode === "auto") {
        const nums = cachedGroups
          .map((g) => {
            const m = String(g.code || "").match(/(\d+)/);
            return m ? Number(m[1]) : NaN;
          })
          .filter((n) => !Number.isNaN(n));
        const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
        code = "A" + String(nextNum).padStart(3, "0");
      } else if (!code) {
        alert("코드를 입력하세요.");
        return;
      }

      // 구분 항목 이름은 현재 항목 목록에서 찾아서 저장
      const targetItem = (cachedItems || []).find(
        (it) => String(it.code) === String(itemCode),
      );
      const name = targetItem ? targetItem.name : "";

      const group = { code, name, direction: typeCode, itemCode, status };

      if (editingGroupCode) {
        await updateCashflowGroup(group);
      } else {
        await addCashflowGroup(group);
      }

      await reloadGroups();

      if (cashflowGroupSubmitMode === "continue") {
        cashflowGroupSubmitMode = "close";
        const keepMode = groupIdModeSelect ? groupIdModeSelect.value : "auto";
        const keepDirection = groupDirectionSelect
          ? groupDirectionSelect.value
          : "";
        resetGroupForm();

        if (groupIdModeSelect) {
          groupIdModeSelect.value = keepMode || "auto";
          groupIdModeSelect.disabled = false;
        }
        if (groupCodeInput) {
          if (groupIdModeSelect && groupIdModeSelect.value === "manual") {
            groupCodeInput.readOnly = false;
            groupCodeInput.value = "";
          } else {
            groupCodeInput.readOnly = true;
          }
        }

        populateGroupTypeSelect();
        if (groupDirectionSelect && keepDirection) {
          groupDirectionSelect.value = keepDirection;
        }
        populateGroupItemSelect();
        if (groupIdModeSelect && groupIdModeSelect.value === "auto") {
          previewNextGroupCode();
        }
        if (cashflowGroupModalDirty) cashflowGroupModalDirty.markClean();
        groupItemSelect?.focus();
        return;
      }

      cashflowGroupSubmitMode = "close";
      closeGroupModal();
    });
  }

  if (searchInput) {
    attachSearchInput(searchInput, (keyword) => {
      renderList(cachedItems, keyword);
    });
  }

  if (tableHeader) {
    tableHeader.addEventListener("click", (e) => {
      const th = e.target.closest("th");
      if (!th) return;
      const key = th.dataset.sortKey;
      if (!key) return;

      if (currentSort.key === key) {
        currentSort.direction =
          currentSort.direction === "asc" ? "desc" : "asc";
      } else {
        currentSort.key = key;
        currentSort.direction = "asc";
      }

      cachedItems = sortByKey(
        cachedItems,
        currentSort.key,
        currentSort.direction,
      );
      const keyword = searchInput ? searchInput.value : "";
      renderList(cachedItems, keyword);
    });
  }
}

async function init() {
  // 결제/지출/매입 화면과 동일하게, ledger_tx의 cashflowItemCode 누락을 1회 자동 보정한다.
  // (장부목록 잔액 집계가 cashflowItemCode 기준이므로, 누락 시 잔액이 맞지 않는다.)
  try {
    await repairLedgerTxCashflowItemFieldsIfNeeded({ debug: false });
  } catch (_) {
    // ignore
  }

  await reloadTypes();
  await reloadGroups();
  await reloadList();
  bindEvents();

  installDbAutoRefresh({
    refresh: async () => {
      await reloadTypes();
      await reloadGroups();
      await reloadList();
    },
    isBusy: () => document.body.classList.contains("modal-open"),
  });
}

init().catch((err) => {
  console.error("입출금 관리 초기화 오류", err);
});

