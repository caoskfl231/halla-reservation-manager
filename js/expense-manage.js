import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  getCustomers,
  getCustomerGroups,
  putLedgerTx,
  getLedgerTxById,
  deleteLedgerTxById,
  getAllLedgerTx,
  getCashflowItems,
  getCashflowTypes,
} from "./db.js?v=ledger-history-20261010-1";
import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  createFormDirtyTracker,
  wrapDirtyClose,
  resetFieldsAndFocus,
  attachSearchInput,
  bindDblClickRowEdit,
  bindDblClickRowConfirm,
  bindClickRowSelect,
  createScrollToBottomOnce,
} from "./common/ui-helpers.js?v=ledger-history-20261010-1";
import {
  todayYMD,
  formatWeekdayLabel,
  formatMoney,
  includesIgnoreCase,
  stripCodePrefix,
  resolveDefaultCashflowNameByCode,
  buildLedgerMemoFields,
} from "./common/util.js?v=ledger-history-20261010-1";
import { applySupplierGroupFilter } from "./common/supplier-group-filter.js?v=ledger-history-20261010-1";
import { getStoredString, setStoredString } from "./common/storage.js?v=ledger-history-20261010-1";
import { installDbAutoRefresh } from "./common/app-events.js?v=ledger-history-20261010-1";
import { confirmDuplicateSimplePaymentTransactionBeforeSave } from "./common/transaction-shared.js?v=ledger-history-20261010-1";
import { loadCashflowLedgerOptionsIntoSelects } from "./common/cashflow-ledger-options.js?v=ledger-history-20261010-1";
import { initDateFilter } from "./common/date-filter.js?v=ledger-history-20261010-1";
import { bootstrapPageCommon } from "./common/page-bootstrap.js?v=ledger-history-20261010-1";
import { openLedgerPicker } from "./common/ledger-picker.js?v=ledger-history-20261010-1";
import { repairLedgerTxCashflowItemFieldsIfNeeded } from "./common/ledger-tx-cashflowitem-repair.js?v=ledger-history-20261010-1";
import { ensureLedgerTxKeys } from "./common/ledger-tx-normalizer.js?v=ledger-history-20261010-1";
import { sortByKey } from "./common/sortTable.js?v=ledger-history-20261010-1";
import {
  inferLedgerPaymentMethod,
  isLockedByPaymentLedger,
} from "./common/payment-ledger-helpers.js?v=ledger-history-20261010-1";
import { resolveCashflowItemSelectionOrThrow } from "./common/cashflow-item-helpers.js?v=ledger-history-20261010-1";
import { saveCashflowLedgerLinkedPaymentRecord } from "./common/cashflow-payment-record.js?v=ledger-history-20261010-1";

bootstrapPageCommon({ page: "expense", todayYMD, formatWeekdayLabel });

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

// ===== 페이지 공통 상태/요소 =====

const searchInput = document.getElementById("purchase-search");
const countSpan = document.getElementById("purchase-count");
const summaryTotalAmountSpan = document.getElementById("purchase-total-amount");
const summaryTotalPaymentSpan = document.getElementById(
  "purchase-total-payment",
);
const summaryTotalBalanceSpan = document.getElementById(
  "purchase-total-balance",
);
const tableHeader = document.querySelector(".purchase-table thead");

const btnNew = document.getElementById("btn-purchase-new");
const btnEdit = document.getElementById("btn-purchase-edit");
const btnDelete = document.getElementById("btn-purchase-delete");

const modal = document.getElementById("purchase-modal");
const modalTitle = document.getElementById("purchase-modal-title");
const form = document.getElementById("purchase-form");
const btnModalClose = document.getElementById("btn-purchase-form-close");
const btnSaveContinue = document.getElementById("btn-purchase-save-continue");
const btnModalDelete = document.getElementById("btn-purchase-delete-modal");

const dateInput = document.getElementById("purchase-date");
const dateWeekdaySpan = document.getElementById("purchase-date-weekday");
const supplierSelect = document.getElementById("purchase-supplier-select");
const supplierInput = document.getElementById("purchase-supplier");

// 인라인 지출 결제 박스
const inlineLedgerNameSelect = document.getElementById(
  "purchase-inline-ledger-name",
);
const inlineLedgerCodeInput = document.getElementById(
  "purchase-inline-ledger-code",
);
const inlineLedgerAmountInput = document.getElementById(
  "purchase-inline-ledger-amount",
);
const expenseMemoInput = document.getElementById("purchase-expense-memo");

// 거래처 선택 모달(분류/거래처 2단)
const supplierPickerModal = document.getElementById(
  "purchase-supplier-picker-modal",
);
const supplierPickerGroupListBody = document.getElementById(
  "purchase-supplier-picker-group-list",
);
const supplierPickerListBody = document.getElementById(
  "purchase-supplier-picker-list",
);
const btnSupplierPickerConfirm = document.getElementById(
  "btn-purchase-supplier-picker-confirm",
);
const btnSupplierPickerClose = document.getElementById(
  "btn-purchase-supplier-picker-close",
);

// 왼쪽 거래처 분류 영역
const groupSelect = document.getElementById("purchase-group-select");
const supplierListBody = document.getElementById("purchase-supplier-list");
const supplierListHeader = document.querySelector(
  "table.purchase-supplier-table thead",
);
const btnGroupReset = document.getElementById("btn-purchase-group-reset");
const typeSwitchButtons = document.querySelectorAll(
  ".purchase-type-switch .type-switch-btn",
);

// 상단 요약 박스
const purchaseSummaryBody = document.getElementById("purchase-summary-body");

// 결제관리처럼 "특정 액션 직후 1회" 최신 내역이 보이도록 강제 스크롤
const summaryAutoScroll = createScrollToBottomOnce();

// 요약 목록: 더블클릭으로 수정 모달 열기
if (purchaseSummaryBody) {
  bindDblClickRowEdit(purchaseSummaryBody, {
    rowSelector: 'tr[data-tx-id]',
    editButton: btnEdit,
  });

  // 요약 목록: 클릭으로 선택 줄 표시 + currentEditingId 반영(위임)
  bindClickRowSelect(purchaseSummaryBody, {
    rowSelector: 'tr[data-tx-id]',
    onSelect: (row) => {
      const txIdStr = row.getAttribute('data-tx-id') || '';
      const txIdNum = Number(txIdStr);
      currentEditingId = Number.isFinite(txIdNum) ? txIdNum : null;
    },
  });
}

// 왼쪽 거래처 목록: 클릭 선택(위임)
if (supplierListBody) {
  bindClickRowSelect(supplierListBody, {
    rowSelector: 'tr[data-id]',
    onSelect: (row) => {
      const id = row.getAttribute('data-id') || '';
      if (!id) return;

      currentSupplierFilterId = id;

      const sup = expenseSuppliers.find((s) => s && s.id === id);
      if (supplierInput) {
        // 코드 입력칸에는 지출처 코드(id)를 보여준다.
        supplierInput.value = sup ? sup.id || '' : '';
      }
      if (supplierSelect) {
        supplierSelect.value = sup ? sup.id || '' : '';
      }

      // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정
      currentSort = { key: "date", direction: "asc" };

      // 거래처(항목) 클릭 시에는 최신 내역이 바로 보이도록 1회 강제 스크롤
      summaryAutoScroll.forceNext();
      refreshExpenseView();
    },
  });
}

// 날짜 필터/빠른선택
const dateFilterFromInput = document.getElementById("purchase-date-from");
const dateFilterToInput = document.getElementById("purchase-date-to");
const btnDateSearch = document.getElementById("btn-purchase-date-search");
const btnDateQuick = document.getElementById("btn-purchase-date-quick");
const dateQuickModal = document.getElementById("purchase-date-quick-modal");

// 통합결제 Ledger DB(tx)는 hallapa_db의 ledger_tx 스토어를 사용한다.

// (공통 모듈) inferLedgerPaymentMethod / isLockedByPaymentLedger

// 지출 화면에서 사용할 통장(입출금 코드) 목록을 인라인 박스에 채운다.
async function loadExpenseLedgerOptions() {
  const jobs = [];
  if (inlineLedgerNameSelect) {
    jobs.push(
      loadCashflowLedgerOptionsIntoSelects(inlineLedgerNameSelect, {
        placeholder: "통장 선택",
      }),
    );
  }
  await Promise.all(jobs);
}

// 지출 결제 1건을 Ledger DB + hallapa_db.transactions에 동시에 기록
async function saveExpensePaymentRecord({
  date,
  supplierId,
  supplierName,
  supplierGroupName,
  accountCode,
  accountLabel,
  amount,
  memoText,
}) {
  await saveCashflowLedgerLinkedPaymentRecord({
    actionLabel: "지출",

    date,
    supplierId,
    supplierName,
    supplierGroupName,
    accountCode,
    accountLabel,
    amount,
    memoText,

    ledgerFlow: "out",
    ledgerEventType: "expense_payment",
    ledgerSource: "expense",
    ledgerSupplierId: String(supplierId),

    transactionType: "expense",
    transactionCategory: "expense",
    transactionSource: "expense",
    includeLedgerName: false,
    memoFallback: "accountNameOnly",
  });
}

// 폼 dirty 상태 추적
const expenseModalDirty = createFormDirtyTracker(() => ({
  date: dateInput ? dateInput.value : "",
  supplierId: supplierSelect ? supplierSelect.value : "",
  supplierName: supplierInput ? supplierInput.value : "",
  ledgerCode: inlineLedgerCodeInput ? inlineLedgerCodeInput.value : "",
  ledgerAmount: inlineLedgerAmountInput ? inlineLedgerAmountInput.value : "",
  memoText: expenseMemoInput ? expenseMemoInput.value : "",
}));
const closeExpenseModalWithConfirm = wrapDirtyClose(
  expenseModalDirty,
  baseCloseModal,
  "변경사항이 저장되지 않았습니다. 닫으시겠습니까?",
);

function baseCloseModal() {
  if (!modal) return;
  closeModalOverlay(modal);
  // 모달을 닫을 때 편집 상태를 초기화한다.
  editingExpenseTx = null;
  editingLedgerTx = null;
}

function openModal(isEdit = false) {
  if (!modal) return;
  openModalOverlay(modal);

  if (modalTitle) {
    modalTitle.textContent = isEdit ? "지출 수정" : "지출 등록";
  }
  if (btnModalDelete) {
    btnModalDelete.style.display = isEdit ? "" : "none";
  }

  expenseModalDirty.markClean();
  if (typeof expenseModalEscOff === "function") expenseModalEscOff();
  expenseModalEscOff = registerModalEscClose(
    modal,
    closeExpenseModalWithConfirm,
  );
}

function closeModal() {
  closeExpenseModalWithConfirm();
}

let expenseModalEscOff = null;

// 데이터/상태
let allCustomers = [];
let customerGroupMasters = [];
let expenseSuppliers = [];
let allTransactions = [];
let expenseTransactions = [];
let currentSupplierFilterId = "";

// 왼쪽 거래처 목록 정렬(코드/거래처명)
let supplierListSort = { key: "id", direction: "asc" };
const EXPENSE_GROUP_FILTER_STORAGE_KEY = "hallapa.expense.selectedGroup";
let selectedGroup = getStoredString(EXPENSE_GROUP_FILTER_STORAGE_KEY, "");
let dateFilterFrom = "";
let dateFilterTo = "";
// 결제관리와 동일하게: 과거 → 현재(asc) 순서로 보여서 최신이 아래에 오도록 한다.
let currentSort = { key: "date", direction: "asc" };
let editingExpenseTx = null;
let editingLedgerTx = null;
let ledgerTxMap = new Map();

let supplierPickerEscOff = null;
let supplierPickerSelectedGroupName = "";
let supplierPickerSelectedSupplierId = "";

function getExpenseSupplierGroups() {
  // 지출처 분류는 customer_groups(마스터)를 우선 사용해
  // 거래처가 아직 없는 분류도 선택 가능하게 한다.
  const wantedType = "지출처";
  const masters = (Array.isArray(customerGroupMasters) ? customerGroupMasters : [])
    .filter((g) => g && g.name)
    .filter((g) => {
      const t = String(g.type || "").trim();
      if (!t) return true; // 공통 분류
      return t === wantedType;
    })
    .map((g) => String(g.name || "").trim())
    .filter(Boolean);

  const legacy = Array.from(
    new Set((expenseSuppliers || []).map((s) => String(s.group || "미분류").trim() || "미분류")),
  ).filter(Boolean);

  const names = Array.from(new Set([...masters, ...legacy]));
  names.sort((a, b) => a.localeCompare(b, "ko"));
  return names;
}

function renderSupplierPickerGroups() {
  if (!supplierPickerGroupListBody) return;
  supplierPickerGroupListBody.innerHTML = "";

  const groups = getExpenseSupplierGroups();
  if (!groups.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td>분류가 없습니다.</td>';
    supplierPickerGroupListBody.appendChild(tr);
    return;
  }

  groups.forEach((name) => {
    const tr = document.createElement("tr");
    tr.dataset.groupName = name;
    tr.innerHTML = `<td>${name}</td>`;
    if (name === supplierPickerSelectedGroupName) tr.classList.add("selected");
    supplierPickerGroupListBody.appendChild(tr);
  });
}

function renderSupplierPickerSuppliers() {
  if (!supplierPickerListBody) return;
  supplierPickerListBody.innerHTML = "";

  const targetGroup = supplierPickerSelectedGroupName || "";
  const baseList = Array.isArray(expenseSuppliers) ? expenseSuppliers : [];
  const filtered = targetGroup
    ? baseList.filter((c) => (c.group || "미분류") === targetGroup)
    : baseList;

  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="3">해당 분류의 거래처가 없습니다.</td>';
    supplierPickerListBody.appendChild(tr);
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"))
    .forEach((c) => {
      const tr = document.createElement("tr");
      tr.dataset.supplierId = c.id || "";
      const bal = Number(c && c.openingBalance != null ? c.openingBalance : 0) || 0;
      tr.innerHTML = `
        <td>${c.id || ""}</td>
        <td>${c.name || ""}</td>
        <td class="col-balance right" data-amount-color="1" data-amount-value="${bal}">${formatMoney(bal)}</td>
      `;
      if (c.id && c.id === supplierPickerSelectedSupplierId) {
        tr.classList.add("selected");
      }
      supplierPickerListBody.appendChild(tr);
    });
}

// 거래처 선택 모달: 더블클릭=확정(공통 위임)
if (supplierPickerListBody) {
  bindDblClickRowConfirm(supplierPickerListBody, {
    rowSelector: 'tr[data-supplier-id]',
    onConfirm: (row) => {
      supplierPickerSelectedSupplierId = String(row?.dataset?.supplierId || '');
      confirmSupplierPickerSelection();
    },
  });

  // 거래처 선택 모달: 클릭=선택(공통 위임)
  bindClickRowSelect(supplierPickerListBody, {
    rowSelector: 'tr[data-supplier-id]',
    onSelect: (row) => {
      supplierPickerSelectedSupplierId = String(row?.dataset?.supplierId || '');
    },
  });
}

// 거래처 선택 모달(좌측 분류): 클릭=선택(공통 위임)
if (supplierPickerGroupListBody) {
  bindClickRowSelect(supplierPickerGroupListBody, {
    rowSelector: 'tr[data-group-name]',
    onSelect: (row) => {
      supplierPickerSelectedGroupName = String(row?.dataset?.groupName || '');
      supplierPickerSelectedSupplierId = '';
      renderSupplierPickerGroups();
      renderSupplierPickerSuppliers();
    },
  });
}

function closeSupplierPickerModal() {
  if (!supplierPickerModal) return;
  closeModalOverlay(supplierPickerModal);
  if (typeof supplierPickerEscOff === "function") supplierPickerEscOff();
  supplierPickerEscOff = null;
}

function confirmSupplierPickerSelection() {
  if (!supplierPickerSelectedSupplierId) {
    closeSupplierPickerModal();
    return;
  }

  const supplier = (expenseSuppliers || []).find(
    (s) => String(s.id) === String(supplierPickerSelectedSupplierId),
  );
  if (!supplier) {
    closeSupplierPickerModal();
    return;
  }

  const groupName = supplier.group || "미분류";
  selectedGroup = groupName;
  currentSupplierFilterId = supplier.id || "";
  if (groupSelect) groupSelect.value = groupName;

  rebuildSupplierSelectForCurrentKind(groupName);
  if (supplierSelect) supplierSelect.value = supplier.id || "";
  applySupplierFromSelect();
  closeSupplierPickerModal();
}

function openSupplierPickerModal() {
  if (!supplierPickerModal) return;

  // 초기 선택값: 전체(필터 없음) + 현재 거래처(있으면 강조)
  supplierPickerSelectedGroupName = "";
  supplierPickerSelectedSupplierId =
    supplierSelect?.value || currentSupplierFilterId || "";

  renderSupplierPickerGroups();
  renderSupplierPickerSuppliers();

  openModalOverlay(supplierPickerModal);
  if (typeof supplierPickerEscOff === "function") supplierPickerEscOff();
  supplierPickerEscOff = registerModalEscClose(
    supplierPickerModal,
    closeSupplierPickerModal,
  );
}

// 왼쪽 거래처 목록 렌더링
function renderSupplierList() {
  if (!supplierListBody) return;

  const list = expenseSuppliers
    .filter((s) => {
      if (!selectedGroup) return true;
      return (s.group || "미분류") === selectedGroup;
    })
    .slice();

  const sortKey = supplierListSort?.key || "id";
  const sortDir = supplierListSort?.direction || "asc";
  const sorted = sortByKey(list, sortKey, sortDir);

  supplierListBody.innerHTML = sorted
    .map((s) => {
      const cls =
        currentSupplierFilterId && currentSupplierFilterId === s.id
          ? ' class="selected"'
          : "";
      return `<tr data-id="${s.id}"${cls}>
			<td>${s.id || ""}</td>
			<td>${s.name || ""}</td>
		</tr>`;
    })
    .join("");
}

// 왼쪽 거래처 목록 헤더 클릭 정렬
if (supplierListHeader) {
  supplierListHeader.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;

    if (supplierListSort.key === key) {
      supplierListSort.direction =
        supplierListSort.direction === "asc" ? "desc" : "asc";
    } else {
      supplierListSort.key = key;
      supplierListSort.direction = "asc";
    }
    renderSupplierList();
  });
}

function rebuildGroupSelect() {
  summaryAutoScroll.scroll(purchaseSummaryBody);
  const groups = getExpenseSupplierGroups();

  const options = ['<option value="">전체</option>'].concat(
    groups.map((g) => `<option value="${g}">${g}</option>`),
  );
  groupSelect.innerHTML = options.join("");
  groupSelect.value = selectedGroup || "";
}

function updateDateWeekday() {
  if (!dateInput || !dateWeekdaySpan) return;
  const v = dateInput.value || todayYMD();
  dateWeekdaySpan.textContent = formatWeekdayLabel(v);
}

// 필터 적용 후 지출 요약/상세 렌더링
function refreshExpenseView() {
  const keyword = searchInput ? searchInput.value || "" : "";

  let rows = expenseTransactions.slice();

  // 날짜 필터
  rows = rows.filter((tx) => {
    if (!tx.date) return false;
    if (dateFilterFrom && tx.date < dateFilterFrom) return false;
    if (dateFilterTo && tx.date > dateFilterTo) return false;
    return true;
  });

  // 분류(그룹) 필터: 왼쪽 분류를 선택하면 해당 분류의 지출 내역만 표시
  rows = applySupplierGroupFilter(rows, {
    enabled: Boolean(selectedGroup),
    selectedGroupName: selectedGroup,
    getGroupNameForRow: (tx) => {
      if (tx && tx.supplierGroup) return tx.supplierGroup;
      const supplierId = tx ? tx.supplierId || "" : "";
      if (!supplierId) return "";
      const sup = (expenseSuppliers || []).find(
        (s) => s && String(s.id) === String(supplierId),
      );
      return sup ? sup.group || "미분류" : "";
    },
  });

  // 거래처 필터
  if (currentSupplierFilterId) {
    rows = rows.filter(
      (tx) => String(tx.supplierId || "") === String(currentSupplierFilterId),
    );
  }

  // 검색어 필터(거래처/메모)
  const q = (keyword || "").trim().toLowerCase();
  if (q) {
    const groupCodeByName = new Map(
      (Array.isArray(customerGroupMasters) ? customerGroupMasters : [])
        .filter((g) => g && g.name)
        .filter((g) => {
          const t = String(g.type || "").trim();
          if (!t) return true;
          return t === "지출처";
        })
        .map((g) => [String(g.name || "").trim(), String(g.code || "").trim()]),
    );

    rows = rows.filter((tx) => {
      const supplierId = String(tx?.supplierId || "").trim();
      const supplierName = String(tx?.supplierName || "").trim();
      const memo = String(tx?.memo || "").trim();

      const sup = supplierId
        ? (expenseSuppliers || []).find((s) => String(s?.id || "") === supplierId)
        : null;
      const groupName = String(
        tx?.supplierGroup ||
          tx?.supplierGroupName ||
          tx?.group ||
          (sup ? sup.group : ""),
      )
        .trim() || "";
      const groupCode = groupName ? groupCodeByName.get(groupName) || "" : "";

      return (
        includesIgnoreCase(supplierId, q) ||
        includesIgnoreCase(supplierName, q) ||
        includesIgnoreCase(groupName, q) ||
        includesIgnoreCase(groupCode, q) ||
        includesIgnoreCase(memo, q)
      );
    });
  }

  // 정렬
  rows.sort((a, b) => {
    const dir = currentSort.direction === "asc" ? 1 : -1;
    const key = currentSort.key;

    if (key === "date") {
      const ad = String(a?.date || "");
      const bd = String(b?.date || "");
      if (ad < bd) return -1 * dir;
      if (ad > bd) return 1 * dir;

      // 같은 날짜는 id 오름차순으로 안정화(결제관리와 유사한 누적/표시 순서)
      const ai = Number(a?.id);
      const bi = Number(b?.id);
      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) {
        return (ai - bi) * dir;
      }
      return 0;
    }

    const ka = a[key] ?? "";
    const kb = b[key] ?? "";
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    return 0;
  });

  renderSummary(rows);
}

function renderSummary(rows) {
  if (
    !purchaseSummaryBody ||
    !summaryTotalAmountSpan ||
    !summaryTotalPaymentSpan ||
    !summaryTotalBalanceSpan
  )
    return;

  // 건별(전표별) 목록을 그대로 요약 테이블에 표시한다.
  // Count 값도 여기서 같이 업데이트한다.
  if (countSpan) {
    countSpan.textContent = String(rows.length || 0);
  }

  let totalAmount = 0;
  let totalPayment = 0;
  let totalBalance = 0;

  // 매입 요약과 비슷하게, 지출처별로 거래일 순서대로 누적 잔액을 계산한다.
  // 1) 지출처별로 행을 묶는다.
  const bySupplier = new Map(); // supplierId -> tx[]
  rows.forEach((tx) => {
    const supplierId = tx.supplierId || "";
    if (!supplierId) return;
    if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, []);
    bySupplier.get(supplierId).push(tx);
  });

  // 2) 각 지출처별로 거래일 오름차순으로 정렬해서 running balance 를 계산한다.
  const balanceByTxId = new Map(); // tx.id -> running balance
  const lastBalanceBySupplier = new Map(); // supplierId -> 마지막 잔액

  bySupplier.forEach((list, supplierId) => {
    const sup = expenseSuppliers.find(
      (s) => String(s.id) === String(supplierId),
    );
    const opening =
      Number(sup && sup.openingBalance != null ? sup.openingBalance : 0) || 0;

    const sorted = list.slice().sort((a, b) => {
      const ad = a.date || "";
      const bd = b.date || "";
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      return 0;
    });

    let running = opening;
    sorted.forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      const payment = Number(tx.payment || 0);
      // 잔액 = 기초 - 지출금액 + 결제금액 (지출 화면에서는 amount는 대부분 0)
      running -= amount;
      running += payment;
      if (tx.id != null) {
        balanceByTxId.set(tx.id, running);
      }
    });

    lastBalanceBySupplier.set(supplierId, running);
  });

  // 3) 하단 합계 잔액은 지출처별 마지막 잔액을 합산한다.
  lastBalanceBySupplier.forEach((bal) => {
    const num = Number(bal) || 0;
    totalBalance += num;
  });

  purchaseSummaryBody.innerHTML = rows
    .map((tx) => {
      const amount = Number(tx.amount) || 0;
      const payment = Number(tx.payment || 0);
      const supplierId = tx.supplierId || "";
      const supplierName = tx.supplierName || supplierId;
      const date = tx.date || "";
      let memo = tx.memo || "";
      let ledgerLabel = "";
      const isSelected =
        currentEditingId != null && Number(currentEditingId) === Number(tx.id);
      const cls = isSelected ? ' class="selected"' : "";

      totalAmount += amount;
      totalPayment += payment;

      let bal = 0;
      if (tx.id != null && balanceByTxId.has(tx.id)) {
        bal = balanceByTxId.get(tx.id) || 0;
      } else if (supplierId) {
        // 혹시 누락된 경우에는 지출처별 마지막 잔액으로 fallback
        bal = lastBalanceBySupplier.get(supplierId) || 0;
      }

      // 1순위: Ledger DB 에 연결된 거래가 있으면, 해당 Ledger 전표의 계좌명을 장부명으로 사용한다.
      if (tx.ledgerTxId && ledgerTxMap && ledgerTxMap.size) {
        const ledgerTx = ledgerTxMap.get(String(tx.ledgerTxId));
        if (ledgerTx) {
          // 가능한 경우 cashflow 항목명/구분명을 우선 사용한다.
          const fromCashflow =
            String(ledgerTx.cashflowItemName || "").trim() ||
            resolveLedgerLabelFromCode(
              ledgerTx.cashflowItemCode || ledgerTx.cashflowCode,
            ) ||
            resolveLedgerLabelFromCode(ledgerTx.accountId);

          if (fromCashflow) {
            ledgerLabel = fromCashflow;
          } else {
            const label = ledgerTx.accountName || ledgerTx.accountId || "";
            const parts = String(label || "")
              .trim()
              .split(/\s+/);
            ledgerLabel = parts.length > 1 ? parts.slice(1).join(" ") : label;
          }
        }
      }

      // 2순위(과거 데이터 등): Ledger 연결이 없으면 메모에서 장부명을 분리해 사용한다.
      if (!ledgerLabel && typeof memo === "string" && memo) {
        // 예: "[지출결제] A01 법인통장" 같은 패턴이 들어올 수 있으므로
        // 앞의 대괄호 태그와 코드(A01)를 제거하고 남는 부분을 장부명으로 사용한다.
        let cleaned = memo.replace(/^\[[^\]]+\]\s*/, "");
        cleaned = cleaned.replace(/^[A-Za-z0-9]+\s+/, "");
        ledgerLabel = cleaned;
      }

      // 최종 fallback: 남은 값이 코드(A03 등)면 이름으로 매핑
      if (ledgerLabel) {
        const trimmed = String(ledgerLabel).trim();
        const looksLikeCode = /^[A-Za-z]\d{2,4}$/.test(trimmed);
        if (looksLikeCode) {
          const mapped = resolveLedgerLabelFromCode(trimmed);
          if (mapped) ledgerLabel = mapped;
        }
      }

      return `<tr data-supplier-id="${supplierId}" data-tx-id="${tx.id}"${cls}>
			<td>지출</td>
			<td>${supplierName}</td>
			<td>${date}</td>
			<td>${ledgerLabel}</td>
			<td>${memo}</td>
			<td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${amount}">${formatMoney(amount, "ko-KR")}</td>
			<td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${payment}">${formatMoney(payment, "ko-KR")}</td>
			<td class="right" data-amount-color="1" data-amount-value="${bal}">${formatMoney(bal, "ko-KR")}</td>
		</tr>`;
    })
    .join("");

  // 최신 거래가 바로 보이도록 스크롤을 아래로 이동
  summaryAutoScroll.scroll(purchaseSummaryBody);

  // 행 클릭 시 선택 줄 표시
  summaryTotalAmountSpan.textContent = formatMoney(totalAmount, "ko-KR");
  summaryTotalPaymentSpan.textContent = formatMoney(totalPayment, "ko-KR");
  summaryTotalBalanceSpan.textContent = formatMoney(totalBalance, "ko-KR");

  // 합계 색상(공통 엔진): 값(data-amount-value) + 규칙(force)
  summaryTotalAmountSpan.dataset.amountColor = "1";
  summaryTotalAmountSpan.dataset.amountForce = "minus";
  summaryTotalAmountSpan.dataset.amountValue = String(totalAmount);

  summaryTotalPaymentSpan.dataset.amountColor = "1";
  summaryTotalPaymentSpan.dataset.amountForce = "minus";
  summaryTotalPaymentSpan.dataset.amountValue = String(totalPayment);

  summaryTotalBalanceSpan.dataset.amountColor = "1";
  delete summaryTotalBalanceSpan.dataset.amountForce;
  summaryTotalBalanceSpan.dataset.amountValue = String(totalBalance);
}

let currentEditingId = null;

let cashflowItemNameByCode = new Map();
let cashflowTypeNameByCode = new Map();

function resolveLedgerLabelFromCode(code) {
  const c = String(code || "").trim();
  if (!c) return "";

  // 1) 항목(A0001~)
  if (cashflowItemNameByCode && cashflowItemNameByCode.has(c)) {
    return String(cashflowItemNameByCode.get(c) || "").trim();
  }
  // 2) 구분(A01~)
  if (cashflowTypeNameByCode && cashflowTypeNameByCode.has(c)) {
    return String(cashflowTypeNameByCode.get(c) || "").trim();
  }
  return resolveDefaultCashflowNameByCode(c) || "";
}

async function reloadExpenseTransactions() {
  try {
    await repairLedgerTxCashflowItemFieldsIfNeeded();
  } catch (_) {
    // 보정 실패는 치명적이지 않으므로 무시
  }

  const [list, ledgerAll, cashflowItems, cashflowTypes] = await Promise.all([
    getTransactions(),
    getAllLedgerTx(),
    getCashflowItems(),
    getCashflowTypes(),
  ]);

  cashflowItemNameByCode = new Map(
    (cashflowItems || [])
      .filter((it) => it && it.code)
      .map((it) => [String(it.code), String(it.name || it.code)]),
  );
  cashflowTypeNameByCode = new Map(
    (cashflowTypes || [])
      .filter((t) => t && t.code)
      .map((t) => [String(t.code), String(t.name || t.code)]),
  );
  allTransactions = list || [];
  expenseTransactions = allTransactions
    .filter((tx) => tx && tx.category === "expense")
    .map((tx) => ({ ...tx }));

  // Ledger 거래를 ID 기준으로 빠르게 조회할 수 있도록 맵으로 캐시한다.
  ledgerTxMap = new Map();
  (ledgerAll || []).forEach((ltx) => {
    if (ltx && ltx.id != null) {
      ledgerTxMap.set(String(ltx.id), ltx);
    }
  });

  refreshExpenseView();
  renderSupplierList();
}

async function loadSuppliers() {
  allCustomers = await getCustomers();
  const isActiveStatus = (v) => String(v || "active") === "active";

  try {
    customerGroupMasters = (await getCustomerGroups()) || [];
  } catch (_) {
    customerGroupMasters = [];
  }

  expenseSuppliers = (allCustomers || []).filter(
    (c) => (c.type || "").includes("지출") && isActiveStatus(c?.status),
  );
  rebuildGroupSelect();
  renderSupplierList();
  rebuildSupplierSelectForCurrentKind();
}

function rebuildSupplierSelectForCurrentKind(targetGroupOverride = "") {
  if (!supplierSelect) return;

  const overrideGroup = String(targetGroupOverride || "").trim();
  const pickedSupplier = currentSupplierFilterId
    ? expenseSuppliers.find((s) => s.id === currentSupplierFilterId)
    : null;

  const targetGroup = String(
    overrideGroup || pickedSupplier?.group || selectedGroup || "",
  ).trim();

  const baseList = expenseSuppliers.slice();
  const filtered = targetGroup
    ? baseList.filter((c) => (c.group || "미분류") === targetGroup)
    : baseList;

  const previousValue = supplierSelect.value;

  supplierSelect.innerHTML =
    '<option value="">직접입력</option>' +
    filtered.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  let nextValue = "";
  if (
    currentSupplierFilterId &&
    filtered.some((s) => s.id === currentSupplierFilterId)
  ) {
    nextValue = currentSupplierFilterId;
  } else if (previousValue && filtered.some((s) => s.id === previousValue)) {
    nextValue = previousValue;
  }

  supplierSelect.value = nextValue;
  applySupplierFromSelect();
}

function applySupplierFromSelect() {
  if (!supplierSelect || !supplierInput) return;

  const id = supplierSelect.value || "";
  const sup = expenseSuppliers.find((s) => s.id === id);

  if (sup) {
    // 코드 입력칸에는 지출처 코드(id)를 채운다.
    supplierInput.value = sup.id || "";
    currentSupplierFilterId = sup.id || "";
  }

}

// 거래처(코드) 영역 클릭 시 거래처 선택 모달 오픈(네이티브 select 대신)
function bindSupplierPickerTriggers() {
  const openIfPossible = (e) => {
    if (!supplierPickerModal) return;
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    openSupplierPickerModal();
  };

  if (supplierSelect) {
    supplierSelect.addEventListener("mousedown", openIfPossible);
    supplierSelect.addEventListener("keydown", (e) => {
      if (!e) return;
      if (e.key === "Enter" || e.key === " ") {
        openIfPossible(e);
      }
    });
  }

  if (supplierInput) {
    supplierInput.addEventListener("click", openIfPossible);
    supplierInput.addEventListener("keydown", (e) => {
      if (!e) return;
      if (e.key === "Enter" || e.key === " ") {
        openIfPossible(e);
      }
    });
  }
}

function ensureSelectOption(selectEl, value, label) {
  if (!selectEl || !value) return;
  const exists = Array.from(selectEl.options || []).some(
    (o) => String(o.value) === String(value),
  );
  if (exists) return;
  const opt = document.createElement("option");
  opt.value = String(value);
  opt.textContent = String(label || value);
  selectEl.appendChild(opt);
}

async function openLedgerPickerForSelect(selectEl) {
  const picked = await openLedgerPicker({
    title: "장부 선택",
    showAllItemsInitially: true,
  });
  if (!picked) return;

  const code = String(picked.itemCode || "").trim();
  const name = String(picked.itemName || code).trim();
  if (!code) {
    alert("장부명(예: A0001)을 선택해 주세요.");
    return;
  }

  ensureSelectOption(selectEl, code, name);
  selectEl.value = code;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
}

async function saveCurrentExpense({ keepOpen = false } = {}) {
  if (!dateInput || !dateInput.value) {
    alert("거래일을 선택하세요.");
    dateInput && dateInput.focus();
    return;
  }

  const supplierId = String(
    (supplierSelect && supplierSelect.value) ||
      (supplierInput && supplierInput.value) ||
      "",
  ).trim();
  if (!supplierId) {
    alert("지출처를 선택/입력하세요.");
    (supplierSelect || supplierInput) && (supplierSelect || supplierInput).focus();
    return;
  }

  const matchedSupplier = expenseSuppliers.find(
    (s) => String(s.id) === String(supplierId),
  );
  const supplierName = String(
    matchedSupplier
      ? matchedSupplier.name || supplierId
      : (supplierSelect &&
          supplierSelect.selectedOptions &&
          supplierSelect.selectedOptions[0] &&
          supplierSelect.selectedOptions[0].textContent) ||
          supplierId,
  ).trim();
  const supplierGroupName = matchedSupplier
    ? matchedSupplier.group || "미분류"
    : "미분류";

  const accountCode = String(
    (inlineLedgerCodeInput && inlineLedgerCodeInput.value) ||
      (inlineLedgerNameSelect && inlineLedgerNameSelect.value) ||
      "",
  ).trim();
  if (!accountCode) {
    alert("통장을 선택하세요.");
    (inlineLedgerNameSelect || inlineLedgerCodeInput) &&
      (inlineLedgerNameSelect || inlineLedgerCodeInput).focus();
    return;
  }

  const accountLabel = String(
    (inlineLedgerNameSelect &&
      inlineLedgerNameSelect.selectedOptions &&
      inlineLedgerNameSelect.selectedOptions[0] &&
      inlineLedgerNameSelect.selectedOptions[0].textContent) ||
      accountCode,
  ).trim();

  const amountRaw = Number(
    String(
      (inlineLedgerAmountInput && inlineLedgerAmountInput.value) || "0",
    ).replace(/,/g, ""),
  );
  const amount = Math.abs(amountRaw);
  if (!(amount > 0)) {
    alert("금액을 입력하세요.");
    inlineLedgerAmountInput && inlineLedgerAmountInput.focus();
    return;
  }

  const memoText = String((expenseMemoInput && expenseMemoInput.value) || "");
  const wasEditing = Boolean(editingExpenseTx && editingExpenseTx.id != null);

  try {
    if (wasEditing) {
      const baseTx = editingExpenseTx;

      if (await isLockedByPaymentLedger(baseTx)) {
        alert(
          "이 지출 내역은 통합결제 화면에서 자동 등록된 전표입니다.\n지출 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
        );
        return;
      }

      const updatedTx = {
        ...baseTx,
        date: dateInput.value,
        supplierId,
        supplierName,
        supplierGroup: supplierGroupName,
        payment: Math.abs(amount),
        memo: memoText && memoText.trim() ? memoText.trim() : baseTx.memo,
      };

      if (baseTx.ledgerTxId) {
        let ledgerTx = editingLedgerTx;
        if (!ledgerTx) {
          ledgerTx =
            ledgerTxMap.get(String(baseTx.ledgerTxId)) ||
            (await getLedgerTxById(baseTx.ledgerTxId));
        }
        if (ledgerTx) {
          const nowTs = Date.now();
          const accountNameOnly = stripCodePrefix(accountLabel || accountCode);
          const method = inferLedgerPaymentMethod(accountNameOnly || accountCode);
          const memoFields = buildLedgerMemoFields(
            memoText,
            `지출 결제 - ${supplierName}`,
          );
          const { code: pickedItemCode, name: pickedItemName } =
            await resolveCashflowItemSelectionOrThrow({
              accountCode,
              accountLabel: accountLabel || accountCode,
              actionLabel: "결제",
            });

          const nextLedger = {
            ...ledgerTx,
            date: dateInput.value,
            paymentMethod: method,
            accountId: accountCode,
            accountName: accountLabel || accountCode,
            cashflowCode: pickedItemCode,
            cashflowItemCode: pickedItemCode,
            cashflowItemName: pickedItemName,
            amount: amount,
            vendor: supplierName,
            item: supplierName,
            supplierId: String(supplierId),
            customerId: "",
            memo: memoFields.memo,
            entryMemo: memoFields.entryMemo,
            preferEntryMemo: memoFields.preferEntryMemo,
            updatedAt: nowTs,
          };
          await putLedgerTx(ensureLedgerTxKeys(nextLedger));
          editingLedgerTx = nextLedger;
        }
      }

      await updateTransaction(updatedTx);
      if (!keepOpen) alert("지출 결제가 수정되었습니다.");
    } else {
      // 동일한 지출(날짜/지출처/금액/통장)이 이미 저장돼 있으면 저장 전 1회 경고
      try {
        const ok = await confirmDuplicateSimplePaymentTransactionBeforeSave({
          source: "expense",
          category: "expense",
          type: "expense",
          date: dateInput.value,
          supplierId,
          accountCode,
          payment: amount,
        });
        if (!ok) return;
      } catch {
        // ignore
      }

      await saveExpensePaymentRecord({
        date: dateInput.value,
        supplierId,
        supplierName,
        supplierGroupName,
        accountCode,
        accountLabel,
        amount,
        memoText,
      });
      if (!keepOpen) alert("지출 결제가 저장되었습니다.");
    }
  } catch (e) {
    console.error("지출 결제 저장/수정 중 오류:", e);
    alert("지출 결제 저장/수정 중 오류가 발생했습니다.");
    return;
  }

  // keepOpen(연속)인 경우에는 편집/신규 여부와 무관하게
  // 다음 항목 입력을 위해 금액/메모만 초기화한다.
  if (keepOpen) {
    resetFieldsAndFocus({
      fields: [
        [inlineLedgerAmountInput, "0"],
        [expenseMemoInput, ""],
      ],
      focus: inlineLedgerAmountInput,
      select: true,
    });
  }

  expenseModalDirty.markClean();
  if (!keepOpen) closeModal();

  editingExpenseTx = null;
  editingLedgerTx = null;

  // 저장/수정 직후에는 최신 내역이 바로 보이도록 1회 강제 스크롤
  summaryAutoScroll.forceNext();
  await reloadExpenseTransactions();
}

// 수정 모드에서 Enter를 누르면 "연속"처럼 동작(저장 후 새 항목 입력 준비)
function bindEnterToContinueInEditMode(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("keydown", async (e) => {
    if (!e) return;
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    // 모달이 열려 있고, 수정 모드(편집 대상이 존재)일 때만 적용
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;
    if (!(editingExpenseTx && editingExpenseTx.id != null)) return;
    e.preventDefault();
    await saveCurrentExpense({ keepOpen: true });
  });
}

function resetForm() {
  if (!form) return;
  form.reset();

  if (dateInput) {
    dateInput.value = todayYMD();
    updateDateWeekday();
  }

  if (inlineLedgerAmountInput) {
    inlineLedgerAmountInput.value = "0";
  }
  if (expenseMemoInput) {
    expenseMemoInput.value = "";
  }
}

function applyDefaultSupplierForNewExpense() {
  if (!supplierSelect || !supplierInput) return;

  if (!currentSupplierFilterId) return;
  const sup = expenseSuppliers.find((s) => s.id === currentSupplierFilterId);
  if (!sup) return;

  // 현재 선택된 지출처의 분류(그룹)에 맞춰 모달 거래처 콤보를 재구성
  rebuildSupplierSelectForCurrentKind(sup.group || "");

  supplierSelect.value = sup.id || "";
  // 코드 입력칸에는 지출처 코드(id)를 채운다.
  supplierInput.value = sup.id || "";
}

// 상단 유형 스위치: 다른 페이지로 이동
if (typeSwitchButtons.length) {
  typeSwitchButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextType = btn.dataset.groupType;
      if (!nextType) return;

      if (nextType === "매출처") {
        window.location.href = "sales-manage.html";
        return;
      }
      if (nextType === "매입처") {
        window.location.href = "purchase-manage.html";
        return;
      }
      if (nextType === "지출처") {
        window.location.href = "expense-manage.html";
        return;
      }
    });
  });
}

// 이벤트 바인딩
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveCurrentExpense({ keepOpen: false });
  });
}

bindSupplierPickerTriggers();

if (btnSupplierPickerClose) {
  btnSupplierPickerClose.addEventListener("click", closeSupplierPickerModal);
}
if (btnSupplierPickerConfirm) {
  btnSupplierPickerConfirm.addEventListener(
    "click",
    confirmSupplierPickerSelection,
  );
}

if (btnSaveContinue) {
  btnSaveContinue.addEventListener("click", async () => {
    await saveCurrentExpense({ keepOpen: true });
  });
}

bindEnterToContinueInEditMode(inlineLedgerAmountInput);
bindEnterToContinueInEditMode(expenseMemoInput);

if (btnModalClose) {
  btnModalClose.addEventListener("click", () => {
    closeModal();
  });
}

if (btnModalDelete) {
  btnModalDelete.addEventListener("click", async () => {
    if (!editingExpenseTx || editingExpenseTx.id == null) {
      alert("삭제할 지출 내역이 선택되지 않았습니다.");
      return;
    }
    // 통합결제에서 자동 등록된 지출 전표는 지출 화면에서 삭제할 수 없도록 제한
    if (await isLockedByPaymentLedger(editingExpenseTx)) {
      alert(
        "이 지출 내역은 통합결제 화면에서 자동 등록된 전표입니다.\n지출 화면에서는 삭제할 수 없고, 통합결제 화면에서만 삭제할 수 있습니다.",
      );
      return;
    }
    const ok = await confirmAsync(
      "현재 지출 내역을 삭제하시겠습니까?",
      { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
    );
    if (!ok) return;

    const baseTx = editingExpenseTx;
    try {
      // 1) hallapa_db.transactions 에서 ledgerTxId 로 연결된 전표 모두 삭제
      const all = await getTransactions();
      if (baseTx.ledgerTxId) {
        const linked = all.filter(
          (t) =>
            t.ledgerTxId && String(t.ledgerTxId) === String(baseTx.ledgerTxId),
        );
        for (const row of linked) {
          await deleteTransaction(Number(row.id));
        }
      } else {
        await deleteTransaction(Number(baseTx.id));
      }
      // 2) Ledger DB 거래 삭제
      if (baseTx.ledgerTxId) {
        await deleteLedgerTxById(baseTx.ledgerTxId);
      }
    } catch (e) {
      console.error("지출 결제 삭제 중 오류:", e);
      alert("지출 결제 삭제 중 오류가 발생했습니다.");
      return;
    }

    editingExpenseTx = null;
    editingLedgerTx = null;
    currentEditingId = null;
    closeModal();
    await reloadExpenseTransactions();
  });
}

// 모달 바깥 영역 클릭으로는 닫히지 않도록 한다.
// 닫기는 모달 내부 버튼과 ESC 키로만 처리.
if (modal) {
  // 의도적으로 배경 클릭 이벤트를 사용하지 않음
}

if (btnNew) {
  btnNew.addEventListener("click", () => {
    resetForm();
    rebuildSupplierSelectForCurrentKind();
    applyDefaultSupplierForNewExpense();
    openModal(false);
  });
}

if (btnEdit) {
  btnEdit.addEventListener("click", async () => {
    if (!currentEditingId) {
      alert("먼저 수정할 지출 내역을 선택하세요.");
      return;
    }
    const tx = expenseTransactions.find(
      (t) => Number(t.id) === Number(currentEditingId),
    );
    if (!tx) {
      alert("선택한 지출 내역을 찾을 수 없습니다.");
      return;
    }
    // 통합결제에서 자동 등록된 지출 전표는 지출 화면에서 수정할 수 없도록 제한
    if (await isLockedByPaymentLedger(tx)) {
      alert(
        "이 지출 내역은 통합결제 화면에서 자동 등록된 전표입니다.\n지출 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
      );
      return;
    }

    editingExpenseTx = { ...tx };
    editingLedgerTx = null;

    // 날짜
    if (dateInput) {
      dateInput.value = tx.date || todayYMD();
      updateDateWeekday();
    }

    // 지출처/분류 설정
    const sup = expenseSuppliers.find(
      (s) => String(s.id) === String(tx.supplierId),
    );
    if (sup) {
      if (groupSelect && sup.group) {
        selectedGroup = sup.group;
        groupSelect.value = sup.group;
      }
      currentSupplierFilterId = sup.id || "";
      rebuildSupplierSelectForCurrentKind();
      if (supplierSelect) supplierSelect.value = sup.id || "";
      if (supplierInput) supplierInput.value = sup.id || "";
    }

    // Ledger/금액/메모 설정
    if (tx.ledgerTxId) {
      try {
        const ledgerTx = await getLedgerTxById(tx.ledgerTxId);
        editingLedgerTx = ledgerTx;
        if (ledgerTx && inlineLedgerNameSelect) {
          const code = ledgerTx.accountId || ledgerTx.cashflowCode || "";
          inlineLedgerNameSelect.value = code;
          if (inlineLedgerCodeInput) inlineLedgerCodeInput.value = code;
        }
        if (inlineLedgerAmountInput) {
          const amt =
            Number(tx.payment || (ledgerTx && ledgerTx.amount) || 0) || 0;
          inlineLedgerAmountInput.value = String(amt);
        }
        if (expenseMemoInput) {
          const m = tx.memo || (ledgerTx && ledgerTx.memo) || "";
          expenseMemoInput.value = m;
        }
      } catch (e) {
        console.error("지출 편집용 Ledger 데이터 로딩 오류:", e);
      }
    } else {
      if (inlineLedgerAmountInput)
        inlineLedgerAmountInput.value = String(tx.payment || 0);
      if (expenseMemoInput) expenseMemoInput.value = tx.memo || "";
    }

    openModal(true);
  });
}

if (btnDelete) {
  btnDelete.addEventListener("click", async () => {
    if (!currentEditingId) {
      alert("먼저 삭제할 지출 내역을 선택하세요.");
      return;
    }
    const tx = expenseTransactions.find(
      (t) => Number(t.id) === Number(currentEditingId),
    );
    if (!tx) {
      alert("선택한 지출 내역을 찾을 수 없습니다.");
      return;
    }
    // 통합결제에서 자동 등록된 지출 전표는 지출 화면에서 삭제할 수 없도록 제한
    if (await isLockedByPaymentLedger(tx)) {
      alert(
        "이 지출 내역은 통합결제 화면에서 자동 등록된 전표입니다.\n지출 화면에서는 삭제할 수 없고, 통합결제 화면에서만 삭제할 수 있습니다.",
      );
      return;
    }
    const ok = await confirmAsync(
      "선택한 지출 내역을 삭제하시겠습니까?",
      { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
    );
    if (!ok) return;

    try {
      const all = await getTransactions();
      if (tx.ledgerTxId) {
        const linked = all.filter(
          (t) => t.ledgerTxId && String(t.ledgerTxId) === String(tx.ledgerTxId),
        );
        for (const row of linked) {
          await deleteTransaction(Number(row.id));
        }
        await deleteLedgerTxById(tx.ledgerTxId);
      } else {
        await deleteTransaction(Number(tx.id));
      }
    } catch (e) {
      console.error("지출 결제 삭제 중 오류:", e);
      alert("지출 결제 삭제 중 오류가 발생했습니다.");
      return;
    }

    currentEditingId = null;
    summaryAutoScroll.forceNext();
    await reloadExpenseTransactions();
  });
}

if (supplierSelect) {
  supplierSelect.addEventListener("change", () => {
    applySupplierFromSelect();
  });
}

if (groupSelect) {
  groupSelect.addEventListener("change", () => {
    selectedGroup = groupSelect.value || "";
    setStoredString(EXPENSE_GROUP_FILTER_STORAGE_KEY, selectedGroup);
    // 분류 콤보를 바꾸면 개별 거래처 필터는 해제
    currentSupplierFilterId = "";
    renderSupplierList();
    rebuildSupplierSelectForCurrentKind();

    // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정
    currentSort = { key: "date", direction: "asc" };

    // 분류 변경 시 최신 내역이 바로 보이도록 1회 강제 스크롤
    summaryAutoScroll.forceNext();
    refreshExpenseView();
  });
}

if (btnGroupReset) {
  btnGroupReset.addEventListener("click", () => {
    selectedGroup = "";
    setStoredString(EXPENSE_GROUP_FILTER_STORAGE_KEY, "");
    currentSupplierFilterId = "";
    if (groupSelect) groupSelect.value = "";
    renderSupplierList();

    // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정
    currentSort = { key: "date", direction: "asc" };

    // 분류 초기화 시 최신 내역이 바로 보이도록 1회 강제 스크롤
    summaryAutoScroll.forceNext();
    refreshExpenseView();
  });
}


if (inlineLedgerNameSelect) {
  loadExpenseLedgerOptions().catch((e) => {
    console.error("지출 통장 목록 로딩 오류:", e);
  });

  inlineLedgerNameSelect.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    openLedgerPickerForSelect(inlineLedgerNameSelect).catch(() => {});
  });

  inlineLedgerNameSelect.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openLedgerPickerForSelect(inlineLedgerNameSelect).catch(() => {});
    }
  });

  inlineLedgerNameSelect.addEventListener("change", () => {
    const code = inlineLedgerNameSelect.value || "";
    if (inlineLedgerCodeInput) {
      inlineLedgerCodeInput.value = code;
    }
  });
}


if (searchInput) {
  attachSearchInput(searchInput, () => {
    refreshExpenseView();
  });
}

if (btnDateSearch) {
  // 날짜 필터는 공통 모듈(date-filter.js)이 담당
}

if (btnDateQuick) {
  // 날짜 필터는 공통 모듈(date-filter.js)이 담당
}

if (dateQuickModal) {
  // 날짜 필터는 공통 모듈(date-filter.js)이 담당
}

if (tableHeader) {
  tableHeader.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const key = th.dataset.sortKey;
    if (!key) return;
    if (currentSort.key === key) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort = { key, direction: "asc" };
    }
    refreshExpenseView();
  });
}

async function init() {
  await loadSuppliers();
  initDateFilter({
    fromInputId: "purchase-date-from",
    toInputId: "purchase-date-to",
    quickBtnId: "btn-purchase-date-quick",
    searchBtnId: "btn-purchase-date-search",
    modalId: "purchase-date-quick-modal",
    allBtnId: "btn-date-quick-all",
    closeBtnId: "btn-date-quick-close",
    defaultRangeKey: "thisMonth",
    onApply: ({ from, to, source }) => {
      dateFilterFrom = from || "";
      dateFilterTo = to || "";
      if (String(source || "").startsWith("init:")) return;

      // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정
      currentSort = { key: "date", direction: "asc" };

      // 기간 조회 적용 시 최신 내역이 바로 보이도록 1회 강제 스크롤
      summaryAutoScroll.forceNext();
      refreshExpenseView();
    },
  });
  updateDateWeekday();
  await reloadExpenseTransactions();

  installDbAutoRefresh({
    refresh: async () => {
      await loadSuppliers();
      await reloadExpenseTransactions();
    },
    isBusy: () => document.body.classList.contains("modal-open"),
  });
}

init();

