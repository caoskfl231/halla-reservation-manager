import { repairLedgerTxCashflowItemFieldsIfNeeded } from "./common/ledger-tx-cashflowitem-repair.js?v=app-20261010-5";
import {
  getCustomers,
  getCustomerTypes,
  getCustomerGroups,
  getCashflowItems,
  getCashflowTypes,
  addTransaction,
  getTransactions,
  deleteTransaction,
  getAllLedgerTx,
  putLedgerTx,
  deleteLedgerTxById,
  migrateLegacyLedgerTxIfNeeded,
} from "./db.js?v=app-20261010-5";
import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  enableTableArrowNavigation,
  attachSearchInput,
  resetFieldsAndFocus,
  applyAmountColoring,
  bindDblClickRowEdit,
  bindClickRowSelect,
} from "./common/ui-helpers.js?v=app-20261010-5";
import { createModalManager } from "./common/modal-manager.js?v=app-20261010-5";
import {
  todayYMD,
  formatWeekdayLabel,
  formatMoney,
  normalizeVendorName,
  includesIgnoreCase,
  parseNumber,
  isPaymentLinkedTransaction,
  stripCodePrefix,
} from "./common/util.js?v=app-20261010-5";
import { initDateFilter } from "./common/date-filter.js?v=app-20261010-5";
import { bootstrapPageCommon } from "./common/page-bootstrap.js?v=app-20261010-5";
import { confirmDialog } from "./common/dialogs.js?v=app-20261010-5";
import { openLedgerPicker } from "./common/ledger-picker.js?v=app-20261010-5";
import { installDbAutoRefresh } from "./common/app-events.js?v=app-20261010-5";
import {
  confirmAnyDuplicateLedgerBatchesBeforeSave,
  confirmAnyDuplicateSimplePaymentTransactionsBeforeSave,
  confirmDuplicateLedgerBatchBeforeSave,
  findAnyDuplicateLedgerBatchesBeforeSave,
  findAnyDuplicateSimplePaymentTransactionsBeforeSave,
} from "./common/transaction-shared.js?v=app-20261010-5";
import { ensureLedgerTxKeys } from "./common/ledger-tx-normalizer.js?v=app-20261010-5";
import { inferLedgerPaymentMethod } from "./common/payment-ledger-helpers.js?v=app-20261010-5";
import { bindPaymentActions } from "./payment-manage/payment-actions-manager.js?v=app-20261010-5";
import { renderPaymentMainTable } from "./payment-manage/payment-main-table.js?v=app-20261010-5";
import { bindPaymentForm } from "./payment-manage/payment-form-manager.js?v=app-20261010-5";
import { bindPaymentImportManager } from "./payment-manage/payment-import-manager.js?v=app-20261010-5";
import { bindPaymentImportCustomerPicker } from "./payment-manage/payment-import-customer-manager.js?v=app-20261010-5";
import { setPaymentFormFromTx as setPaymentFormFromTxCore } from "./payment-manage/payment-form-filler.js?v=app-20261010-5";
import {
  updateCashflowTypeButtons as updateCashflowTypeButtonsCore,
  renderCashflowSummaryTable as renderCashflowSummaryTableCore,
  rebuildCashflowSummaryOptions as rebuildCashflowSummaryOptionsCore,
  refreshCashflowSummary as refreshCashflowSummaryCore,
  bindCashflowSummaryEvents,
} from "./payment-manage/payment-cashflow-summary.js?v=app-20261010-5";
import { bindPaymentFilters } from "./payment-manage/payment-filter-manager.js?v=app-20261010-5";
import { bindPaymentEntryPicker } from "./payment-manage/payment-entry-picker-manager.js?v=app-20261010-5";
import {
  resetPaymentEntryFields as resetPaymentEntryFieldsCore,
  openPaymentEntryChoiceModal as openPaymentEntryChoiceModalCore,
  closePaymentEntryChoiceModal as closePaymentEntryChoiceModalCore,
} from "./payment-manage/payment-entry-modal-manager.js?v=app-20261010-5";
import {
  applyPaymentLedgerSelection as applyPaymentLedgerSelectionCore,
  openPaymentLedgerModalForLedgerSelect as openPaymentLedgerModalForLedgerSelectCore,
} from "./payment-manage/payment-ledger-picker-manager.js?v=app-20261010-5";
import {
  renderPaymentLedgerModalTable as renderPaymentLedgerModalTableCore,
  renderPaymentLedgerModalItemTable as renderPaymentLedgerModalItemTableCore,
} from "./payment-manage/payment-ledger-modal-render.js?v=app-20261010-5";
import {
  updatePaymentImportSelectedAccountLabel as updatePaymentImportSelectedAccountLabelCore,
  renderPaymentImportTable as renderPaymentImportTableCore,
  updatePaymentImportCurrentRecord as updatePaymentImportCurrentRecordCore,
  renderPaymentImportCustomerList as renderPaymentImportCustomerListCore,
  applyImportCustomerSelection as applyImportCustomerSelectionCore,
  renderPaymentImportTypeList as renderPaymentImportTypeListCore,
  renderPaymentImportGroupList as renderPaymentImportGroupListCore,
} from "./payment-manage/payment-import-list.js?v=app-20261010-5";
import {
  updatePaymentLedgerTitleByFlow as updatePaymentLedgerTitleByFlowCore,
  updateLedgerRowsByFlow as updateLedgerRowsByFlowCore,
  syncLedgerCodeFromSelect as syncLedgerCodeFromSelectCore,
  populatePaymentLedgerSelectOptions as populatePaymentLedgerSelectOptionsCore,
  populatePaymentCounterpartySelectOptions as populatePaymentCounterpartySelectOptionsCore,
  syncCounterpartyCodeFromSelect as syncCounterpartyCodeFromSelectCore,
} from "./payment-manage/payment-entry-ledger-helpers.js?v=app-20261010-5";
import {
  parseMoney as parseMoneyCore,
  getSelectedOptionText as getSelectedOptionTextCore,
  updatePaymentSupplierBalance as updatePaymentSupplierBalanceCore,
  updatePaymentDateWeekday as updatePaymentDateWeekdayCore,
  inRange as inRangeCore,
  matchQ as matchQCore,
} from "./payment-manage/payment-utils.js?v=app-20261010-5";
import {
  openPaymentModal as openPaymentModalCore,
  closePaymentModal as closePaymentModalCore,
  openPaymentImportModal as openPaymentImportModalCore,
  closePaymentImportModal as closePaymentImportModalCore,
  openPaymentImportCustomerModal as openPaymentImportCustomerModalCore,
  closePaymentImportCustomerModal as closePaymentImportCustomerModalCore,
} from "./payment-manage/payment-modal-helpers.js?v=app-20261010-5";
import {
  bindExcelDropdown,
  exportTableToXlsx,
  ymdCompact,
} from "./common/excel-export.js?v=app-20261010-5";

// 공통 피커 모달(*-picker-*)은 ensureCommonPickerModals()가 동적으로 주입한다.

bootstrapPageCommon({
  page: "payment",
  todayYMD,
  formatWeekdayLabel,
  bindModalChrome: false,
});

// 운영 기본값: 백필 로그는 숨김(필요 시 true로 변경)
const DEBUG_BACKFILL = false;


function buildLinkedTransactionMemo({ vendor, memo }) {
  const vendorText = String(vendor || "").trim();
  const memoText = String(memo || "").trim();
  if (!vendorText && !memoText) return "";
  if (!memoText) return vendorText;
  if (!vendorText) return memoText;

  // memo 에 이미 vendor 정보가 들어간 경우에는 중복으로 붙이지 않는다.
  // (정규화 후 포함 관계로 완화 체크)
  const nv = normalizeVendorName(vendorText);
  const nm = normalizeVendorName(memoText);
  if (nv && nm && (nm.includes(nv) || nv.includes(nm))) {
    return memoText;
  }
  return `${vendorText} ${memoText}`.trim();
}

// 출금 거래 시 거래처 매칭 및 거래처 내역 자동 기록 (매입/지출)
// ledgerTxId: 통합결제 tx.id (연동/삭제용)
async function saveVendorTransactionIfMatched({
  date,
  amount,
  vendor,
  memo,
  ledgerName,
  ledgerTxId,
}) {
  if (!vendor || !amount) return;
  let customers = [];
  try {
    customers = await getCustomers();
  } catch (e) {
    customers = [];
  }
  customers = (customers || []).filter(
    (c) => String(c?.status || "active") === "active",
  );
  if (!customers.length) return;
  // 이름 완전일치 우선, 포함도 허용
  const norm = (s) =>
    (s || "")
      .replace(/\s+/g, "")
      .replace(/[()]/g, "")
      .replace(/주식회사|\(주\)|㈜/g, "")
      .trim();
  const base = norm(vendor);
  let cust = customers.find((c) => norm(c.name) === base);
  if (!cust)
    cust = customers.find(
      (c) => norm(c.name).includes(base) || base.includes(norm(c.name)),
    );
  if (!cust) return;
  const custType = String(cust.type || "");
  const isExpenseSupplier = custType.includes("지출");
  const isSalesCustomer = custType.includes("매출");

  if (isSalesCustomer && !isExpenseSupplier) {
    // 매출처로 처리해야 하는 출금(환불) 케이스
    // 환불은 음수 수금(이미 받은 돈을 다시 돌려줌)으로 기록
    const tx = {
      type: "income",
      category: "sales",
      date,
      supplierId: cust.id,
      supplierName: cust.name,
      amount: 0, // 환불은 매출이 아님
      payment: -Math.abs(amount), // 환불은 음수 수금으로 저장
      taxType: "",
      warehouse: "",
      supplierGroup: cust.group || "미분류",
      ledgerName: String(ledgerName || "").trim(),
      memo: buildLinkedTransactionMemo({ vendor, memo }),
      source: "payment",
      ledgerTxId: ledgerTxId ? String(ledgerTxId) : undefined,
    };
    await addTransaction(tx);
    return;
  }

  // 매입/지출 전표로 기록
  // - 고객 type 에 '지출' 이 포함되면 지출 전표(category='expense')
  // - 그 외(매입처 등)는 기존처럼 매입 결제(category='purchase')
  const category = isExpenseSupplier ? "expense" : "purchase";
  const tx = {
    type: isExpenseSupplier ? "expense" : "purchase",
    category,
    date,
    supplierId: cust.id,
    supplierName: cust.name,
    amount: 0,
    payment: Math.abs(amount), // 플러스로 저장
    taxType: "",
    warehouse: "",
    supplierGroup: cust.group || "미분류",
    // 장부명/적요 분리
    // - ledgerName: 통장/장부명(장부명 컬럼 표시용)
    // - memo: 적요(보낸분/거래인식 메모 등)
    ledgerName: String(ledgerName || "").trim(),
    memo: buildLinkedTransactionMemo({ vendor, memo }),
    source: "payment",
    ledgerTxId: ledgerTxId ? String(ledgerTxId) : undefined,
  };
  await addTransaction(tx);
}

// 입금 거래 시 매출처 매칭 및 매출 전표 자동 기록
// ledgerTxId: 통합결제 tx.id (연동/삭제용)
async function saveSalesTransactionIfMatched({
  date,
  amount,
  vendor,
  memo,
  ledgerName,
  ledgerTxId,
}) {
  if (!vendor || !amount) return;
  let customers = [];
  try {
    customers = await getCustomers();
  } catch (e) {
    customers = [];
  }
  customers = (customers || []).filter(
    (c) => String(c?.status || "active") === "active",
  );
  if (!customers.length) return;

  const norm = (s) =>
    (s || "")
      .replace(/\s+/g, "")
      .replace(/[()]/g, "")
      .replace(/주식회사|\(주\)|㈜/g, "")
      .trim();
  const base = norm(vendor);

  // type 에 '매출' 이 포함된 거래처만 대상으로 매칭
  const salesCustomers = customers.filter((c) =>
    String(c.type || "").includes("매출"),
  );
  if (!salesCustomers.length) return;

  let cust = salesCustomers.find((c) => norm(c.name) === base);
  if (!cust)
    cust = salesCustomers.find((c) => {
      const n = norm(c.name);
      return n && (n.includes(base) || base.includes(n));
    });
  if (!cust) return;

  const tx = {
    type: "income",
    category: "sales",
    date,
    supplierId: cust.id,
    supplierName: cust.name,
    amount: 0,
    payment: Math.abs(amount),
    taxType: "",
    warehouse: "",
    supplierGroup: cust.group || "미분류",
    ledgerName: String(ledgerName || "").trim(),
    memo: buildLinkedTransactionMemo({ vendor, memo }),
    source: "payment",
    ledgerTxId: ledgerTxId ? String(ledgerTxId) : undefined,
  };
  await addTransaction(tx);
}

/* =========================
   상태/유틸
========================= */
const state = {
  methodTab: "all",
  accountFilter: "all",
  q: "",
  dateFrom: "",
  dateTo: "",
  editId: null,
};

const fmt = (n) => formatMoney(n, "ko-KR");

function parseMoney(value) {
  return parseMoneyCore(value);
}

function getSelectedOptionText(selectEl) {
  return getSelectedOptionTextCore(selectEl);
}

function getSelectedPaymentFlow() {
  const selected = Array.from(paymentFlowRadios || []).find((r) => r.checked);
  return selected ? selected.value : "in";
}

function updatePaymentLedgerTitleByFlow() {
  updatePaymentLedgerTitleByFlowCore({
    getSelectedPaymentFlow,
    paymentLedgerTitle,
    paymentCounterpartyTitle,
  });
}

function updateLedgerRowsByFlow() {
  updateLedgerRowsByFlowCore();
}

function syncLedgerCodeFromSelect() {
  syncLedgerCodeFromSelectCore({
    paymentLedgerSelect,
    getSelectedPaymentFlow,
    cashflowTypes,
    cashflowItems,
    paymentLedgerTypeCodeInput,
    paymentLedgerNameInput,
    paymentLedgerCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    setSelectedCashflowTypeForEntry: (next) => {
      selectedCashflowTypeForEntry = next;
    },
    setSelectedCashflowItemForEntry: (next) => {
      selectedCashflowItemForEntry = next;
    },
  });

  // 모달에서 장부를 선택한 경우 좌측 장부목록 선택표시도 동기화한다.
  renderPaymentLedgerItemsCard();
}

async function primePaymentEntrySelectData() {
  if (!Array.isArray(cashflowTypes) || !cashflowTypes.length) {
    await rebuildCashflowSummaryOptions();
  }
  if (!Array.isArray(cashflowItems) || !cashflowItems.length) {
    await rebuildCashflowSummaryOptions();
  }
}

function populatePaymentLedgerSelectOptions({ keepValue = false } = {}) {
  populatePaymentLedgerSelectOptionsCore({
    paymentLedgerSelect,
    cashflowTypes,
    cashflowItems,
    getSelectedPaymentFlow,
    syncLedgerCodeFromSelect,
    keepValue,
  });
}

function populatePaymentCounterpartySelectOptions(
  flow,
  { keepValue = false } = {},
) {
  const selectEl = document.getElementById("payment-entry-counterparty");
  const codeInput = document.getElementById("payment-entry-counterparty-code");
  populatePaymentCounterpartySelectOptionsCore({
    flow,
    cashflowTypes,
    cashflowItems,
    customers: window._allCustomers,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemCodeInput,
    selectEl,
    codeInput,
    keepValue,
  });
}

function syncCounterpartyCodeFromSelect() {
  const selectEl = document.getElementById("payment-entry-counterparty");
  const codeInput = document.getElementById("payment-entry-counterparty-code");
  syncCounterpartyCodeFromSelectCore({ selectEl, codeInput });
}

function ensureSelectHasOption(selectEl, value, label) {
  if (!selectEl) return;
  const val = String(value ?? "").trim();
  if (!val) return;
  const exists = Array.from(selectEl.options || []).some(
    (opt) => String(opt.value) === val,
  );
  if (exists) return;
  const opt = document.createElement("option");
  opt.value = val;
  opt.textContent = String(label ?? val);
  selectEl.appendChild(opt);
}

// 거래 입력 모달: 선택된 출금 거래처의 현재 잔액을 계산해 표시
async function updatePaymentSupplierBalance() {
  const codeInput = document.getElementById("payment-entry-counterparty-code");
  const balanceInput = document.getElementById("payment-supplier-balance");
  await updatePaymentSupplierBalanceCore({
    codeInput,
    balanceInput,
    getCustomers,
    getTransactions,
    fmt,
  });
}

function updatePaymentDateWeekday() {
  const headerDateInput = document.getElementById("payment-entry-date");
  const weekdaySpan = document.getElementById("payment-entry-date-weekday");
  updatePaymentDateWeekdayCore({
    headerDateInput,
    weekdaySpan,
    todayYMD,
    formatWeekdayLabel,
  });
}

function inRange(tx) {
  return inRangeCore(tx, state.dateFrom, state.dateTo);
}

function matchQ(tx) {
  return matchQCore(tx, state.q, includesIgnoreCase);
}

const $ = (id) => document.getElementById(id);

// 모달 관련 요소
// - payment-modal: 거래 입력 모달 (현재는 UI만, 저장 로직 없음)
// - payment-import-*: 거래 인식 모달
const paymentModal = document.getElementById("payment-modal");
const paymentModalTitle = document.getElementById("payment-modal-title");
const btnPaymentFormClose = document.getElementById("btn-payment-form-close");
const btnPaymentSaveContinue = document.getElementById(
  "btn-payment-save-continue",
);

const paymentImportModal = document.getElementById("payment-import-modal");
const paymentImportSelectedLedgerSpan = document.getElementById(
  "payment-import-selected-ledger",
);
const paymentImportSelectedAccountSpan = document.getElementById(
  "payment-import-selected-account",
);
const paymentImportTextarea = document.getElementById("payment-import-raw");
const paymentImportResultBody = document.getElementById(
  "payment-import-result-body",
);
const paymentImportCountSpan = document.getElementById("payment-import-count");
const paymentImportTotalInnSpan = document.getElementById(
  "payment-import-total-inn",
);
const paymentImportTotalOutSpan = document.getElementById(
  "payment-import-total-out",
);
const paymentImportTotalBalanceSpan = document.getElementById(
  "payment-import-total-balance",
);
const paymentImportStatus = document.getElementById("payment-import-status");
const btnPaymentImportParse = document.getElementById(
  "btn-payment-import-parse",
);
const btnPaymentImportSave = document.getElementById("btn-payment-import-save");
const btnPaymentImportClose = document.getElementById(
  "btn-payment-import-close",
);
const btnPaymentImportDelete = document.getElementById(
  "btn-payment-import-delete",
);
const btnPaymentImportLedgerPicker = document.getElementById(
  "btn-payment-import-ledger-picker",
);
const paymentImportFlowRadios = document.querySelectorAll(
  'input[name="payment-import-mode"]',
);

// 중복 저장 경고 모달
const paymentDupWarningModal = document.getElementById(
  "payment-dup-warning-modal",
);
const paymentDupWarningText = document.getElementById(
  "payment-dup-warning-text",
);
const btnPaymentDupWarningConfirm = document.getElementById(
  "btn-payment-dup-warning-confirm",
);
const btnPaymentDupWarningDelete = document.getElementById(
  "btn-payment-dup-warning-delete",
);
const btnPaymentDupWarningCancel = document.getElementById(
  "btn-payment-dup-warning-cancel",
);
let paymentDupWarningEscOff = null;
let paymentDupWarningResolve = null;

function openPaymentDupWarningModal({ message = "" } = {}) {
  return new Promise((resolve) => {
    if (!paymentDupWarningModal) {
      // fallback: 커스텀 모달이 없으면 기존 confirm 사용
      (async () => {
        const ok = await confirmDialog(String(message || ""), {
          title: "중복 저장 경고",
          okText: "확인",
          cancelText: "취소",
          tone: "danger",
        });
        resolve(ok ? "confirm" : "cancel");
      })();
      return;
    }

    paymentDupWarningResolve = resolve;
    if (paymentDupWarningText) {
      paymentDupWarningText.textContent = String(message || "");
    }

    openModalOverlay(paymentDupWarningModal);

    if (typeof paymentDupWarningEscOff === "function") paymentDupWarningEscOff();
    paymentDupWarningEscOff = registerModalEscClose(
      paymentDupWarningModal,
      () => {
        closeModalOverlay(paymentDupWarningModal);
        if (typeof paymentDupWarningResolve === "function")
          paymentDupWarningResolve("cancel");
        paymentDupWarningResolve = null;
      },
    );

    const finish = (result) => {
      closeModalOverlay(paymentDupWarningModal);
      if (typeof paymentDupWarningEscOff === "function") paymentDupWarningEscOff();
      paymentDupWarningEscOff = null;
      if (typeof paymentDupWarningResolve === "function")
        paymentDupWarningResolve(result);
      paymentDupWarningResolve = null;
    };

    if (btnPaymentDupWarningConfirm) {
      btnPaymentDupWarningConfirm.onclick = () => finish("confirm");
    }
    if (btnPaymentDupWarningDelete) {
      btnPaymentDupWarningDelete.onclick = () => finish("delete");
    }
    if (btnPaymentDupWarningCancel) {
      btnPaymentDupWarningCancel.onclick = () => finish("cancel");
    }
  });
}
// 거래 인식 결과에서 사용할 거래처 선택 모달 요소
const paymentImportCustomerModal = document.getElementById(
  "payment-import-customer-modal",
);
const paymentImportCustomerListBody = document.getElementById(
  "payment-import-customer-list",
);
const paymentImportCustomerSearch = null;
const btnPaymentImportCustomerClose = document.getElementById(
  "btn-payment-import-customer-close",
);
const btnPaymentImportCustomerReset = document.getElementById(
  "btn-payment-import-customer-reset",
);
const paymentImportTypeListBody = document.getElementById(
  "payment-import-type-list",
);
const paymentImportGroupListBody = document.getElementById(
  "payment-import-group-list",
);
const paymentImportCurrentRecord = document.getElementById(
  "payment-import-current-record",
);

function updatePaymentImportSelectedAccountLabel() {
  updatePaymentImportSelectedAccountLabelCore({
    paymentImportSelectedAccountSpan,
    paymentImportSelectedLedgerSpan,
    selectedCashflowTypeForEntry,
    selectedCashflowItemForEntry,
    cashflowTypes,
    cashflowItems,
  });
}

// 거래 입력용: 거래처/장부 선택 방식 선택 모달
const paymentEntryChoiceModal = document.getElementById(
  "payment-entry-choice-modal",
);
const btnPaymentEntryChooseCustomer = document.getElementById(
  "btn-payment-entry-choose-customer",
);
const btnPaymentEntryChooseLedger = document.getElementById(
  "btn-payment-entry-choose-ledger",
);
const btnPaymentEntryChoiceClose = document.getElementById(
  "btn-payment-entry-choice-close",
);
const paymentEntryDisplayButton = document.getElementById(
  "btn-payment-entry-display",
);

// ESC 닫기 핸들러 해제용 (거래 입력/인식/선택 모달에서만 사용)
let paymentEntryChoiceEscOff = null;

// 거래 등록 상단 구분/장부 연동용 요소
const paymentFlowRadios = document.querySelectorAll(
  'input[name="payment-flow"]',
);
const paymentHeaderDateInput = document.getElementById("payment-entry-date");
const paymentLedgerTitle = document.getElementById("payment-ledger-title");
const paymentCounterpartyTitle = document.getElementById(
  "payment-counterparty-title",
);

// 거래 입력 모달 내 장부 선택용 요소
const paymentLedgerSelect = document.getElementById("payment-ledger-select");
const paymentLedgerNameInput = document.getElementById("payment-ledger-name");
const paymentLedgerCodeInput = document.getElementById("payment-ledger-code");
const paymentLedgerTypeCodeInput = document.getElementById(
  "payment-ledger-type-code",
);
const paymentLedgerBalanceInput = document.getElementById(
  "payment-ledger-balance",
);
const paymentCashflowItemNameInput = document.getElementById(
  "payment-cashflow-item-name",
);
const paymentCashflowItemCodeInput = document.getElementById(
  "payment-cashflow-item-code",
);

const paymentModalManager = createModalManager({
  modalEl: paymentModal,
  getSnapshot: () => ({
    flow:
      Array.from(paymentFlowRadios || []).find((r) => r.checked)?.value || "",
    date: paymentHeaderDateInput ? paymentHeaderDateInput.value : "",
    ledgerType: paymentLedgerTypeCodeInput
      ? paymentLedgerTypeCodeInput.value
      : paymentLedgerSelect
        ? paymentLedgerSelect.value
        : "",
    cashflowItem: paymentCashflowItemCodeInput
      ? paymentCashflowItemCodeInput.value
      : "",
  }),
});

const paymentImportModalManager = createModalManager({
  modalEl: paymentImportModal,
  getSnapshot: () => ({
    raw: paymentImportTextarea ? paymentImportTextarea.value : "",
    mode:
      Array.from(paymentImportFlowRadios || []).find((r) => r.checked)?.value ||
      "",
  }),
});

const paymentImportCustomerModalManager = createModalManager({
  modalEl: paymentImportCustomerModal,
});

let importRecords = [];
let importSuppliers = [];
let importCustomers = [];
let importCustomerTypes = [];
let importCustomerGroups = [];
let importVendorPrefs = {};
let cashflowItems = [];
let cashflowTypes = [];
let currentImportCustomerIndex = null;
let currentImportLedgerIndex = null; // 인식 결과 이체 모드에서 장부 선택 시 사용할 인덱스
// 행별 구분(입출금 / 이체)을 위한 상수
const IMPORT_MODE_NORMAL = "normal";
const IMPORT_MODE_TRANSFER = "transfer";
let importCustomerFilterType = "";
let importCustomerFilterGroup = "";
let importCustomerBalanceById = new Map();
let importCustomerBalancePromise = null;
// 거래 인식 외에, 거래 입력 모달에서 항목(품명) 선택에도 재사용하기 위한 모드/타겟
let customerPickerMode = "import"; // 'import' | 'entry'
let entryItemTargetInput = null;
// 이체 거래에서 장부 선택 시 사용할 출금/입금 장부 타깃
let transferFromLedgerInput = null; // 출금 장부
let transferToLedgerInput = null; // 입금 장부
// 입금/출금 모드에서 하단 입력란에 장부를 선택한 경우, 출금처 장부 정보를 기억해 둔다.
let entryCounterpartyLedgerCode = "";
let entryCounterpartyLedgerLabel = "";

// 통합 결제 페이지 좌측 "입출금 분류" 요약 박스용 상태/요소
const cashflowTypeSwitchButtons = document.querySelectorAll(
  ".payment-cashflow-type-switch .type-switch-btn",
);
// (정리) 상단 구분 필터(select)는 현재 화면에 없음
const cashflowSelect = null;
const cashflowListBody = document.getElementById("payment-cashflow-list");
const cashflowTotalSpan = document.getElementById("payment-cashflow-total");
const btnCashflowReset = document.getElementById("btn-payment-cashflow-reset");
const paymentLedgerItemsBody = document.getElementById(
  "payment-ledger-items-list",
);
const paymentLedgerItemsCountSpan = document.getElementById(
  "payment-ledger-items-count",
);
let cashflowSummaryFlowFilter = "out";
let selectedCashflowCodeFilter = "";
let selectedCashflowTypeForEntry = "";
let selectedCashflowCurrentBalance = 0;
let selectedCashflowItemForEntry = "";

function applySelectedLedgerItemToEntryAndImport() {
  // 좌측 하단 장부목록 선택값을 거래입력/거래인식 모달에 초기값으로 반영한다.

  const itemCode = String(selectedCashflowItemForEntry || "").trim();
  if (!itemCode) {
    // 선택 해제 시: 입력 필드도 비워서 저장을 못 하게 한다.
    if (paymentLedgerSelect) {
      paymentLedgerSelect.value = "";
      syncLedgerCodeFromSelect();
    }
    if (paymentCashflowItemCodeInput) paymentCashflowItemCodeInput.value = "";
    if (paymentCashflowItemNameInput) paymentCashflowItemNameInput.value = "";
    updatePaymentImportSelectedAccountLabel();
    return;
  }

  const item = Array.isArray(cashflowItems)
    ? cashflowItems.find((it) => String(it?.code || "").trim() === itemCode)
    : null;
  if (!item) {
    updatePaymentImportSelectedAccountLabel();
    return;
  }

  // item 선택 시 type도 같이 맞춘다(거래인식 표시/로직 호환용)
  selectedCashflowTypeForEntry = String(item.typeCode || "").trim();

  if (paymentLedgerSelect) {
    paymentLedgerSelect.value = itemCode;
    syncLedgerCodeFromSelect();
  } else {
    // 예외적으로 select가 없으면 hidden/input만 채운다.
    if (paymentLedgerTypeCodeInput) paymentLedgerTypeCodeInput.value = selectedCashflowTypeForEntry;
    if (paymentCashflowItemCodeInput) paymentCashflowItemCodeInput.value = itemCode;
    if (paymentCashflowItemNameInput) paymentCashflowItemNameInput.value = String(item.name || "").trim();
    if (paymentLedgerCodeInput) paymentLedgerCodeInput.value = itemCode;
    if (paymentLedgerNameInput) paymentLedgerNameInput.value = String(item.name || "").trim();
  }

  updatePaymentImportSelectedAccountLabel();
}

function renderPaymentLedgerItemsCard() {
  if (!paymentLedgerItemsBody) return;

  bindClickRowSelect(paymentLedgerItemsBody, {
    rowSelector: 'tr[data-code]',
    onSelect: async (row) => {
      const code = String(row?.dataset?.code || '').trim();
      if (!code) return;
      selectedCashflowItemForEntry = code;
      applySelectedLedgerItemToEntryAndImport();
      window._mainTxFilterCode = code;
      await render();
    },
  });

  const types = Array.isArray(cashflowTypes) ? cashflowTypes : [];
  const items = Array.isArray(cashflowItems) ? cashflowItems : [];

  // 메인 테이블 필터가 장부목록 코드(A####)로 설정되어 있는데,
  // 장부목록 카드 선택 상태가 비어 있으면(조회/리렌더 등) 선택 표시가 사라진다.
  // -> 렌더 시점에 한 번 동기화해서 항상 선택 색표기가 유지되게 한다.
  const mainFilterCode = String(window._mainTxFilterCode || "").trim();
  if (!selectedCashflowItemForEntry && /^A\d{4}$/.test(mainFilterCode)) {
    selectedCashflowItemForEntry = mainFilterCode;
    const it = items.find((x) => String(x?.code || "").trim() === mainFilterCode);
    if (it && it.typeCode != null && String(it.typeCode).trim()) {
      selectedCashflowTypeForEntry = String(it.typeCode).trim();
    }
  }

  const selectedType = String(selectedCashflowTypeForEntry || "").trim();
  let list = items.slice();

  if (selectedType) {
    list = list.filter(
      (it) => String(it?.typeCode || "").trim() === selectedType,
    );
  }

  const byTypeCode = new Map();
  types.forEach((t) => {
    const code = String(t?.code || "").trim();
    if (!code) return;
    byTypeCode.set(code, String(t?.name || "").trim());
  });

  const sortByCode = (a, b) => {
    const ac = String(a?.code || "");
    const bc = String(b?.code || "");
    const an = Number((ac.match(/(\d+)/) || [, "0"])[1]);
    const bn = Number((bc.match(/(\d+)/) || [, "0"])[1]);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn;
    return ac.localeCompare(bc, "ko");
  };

  paymentLedgerItemsBody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="2">표시할 장부가 없습니다.</td>';
    paymentLedgerItemsBody.appendChild(tr);
    if (paymentLedgerItemsCountSpan) paymentLedgerItemsCountSpan.textContent = "0";
    return;
  }

  list.sort(sortByCode).forEach((it) => {
    const tr = document.createElement("tr");
    const code = String(it?.code || "").trim();
    const name = String(it?.name || "").trim();
    const typeName = byTypeCode.get(String(it?.typeCode || "").trim()) || "";
    const label = typeName && name ? `${name}` : name;
    tr.dataset.code = code;
    if (String(selectedCashflowItemForEntry || "") === code) {
      tr.classList.add('selected');
    }
    tr.innerHTML = `
      <td>${code}</td>
      <td>${label}</td>
    `;
    paymentLedgerItemsBody.appendChild(tr);
  });

  if (paymentLedgerItemsCountSpan) {
    paymentLedgerItemsCountSpan.textContent = String(list.length);
  }
}

// 통합 결제 내역 메인 테이블 합계 표시용 요소
const paymentMainCountSpan = document.getElementById("payment-main-count");
const paymentMainTotalInnSpan = document.getElementById(
  "payment-main-total-inn",
);
const paymentMainTotalOutSpan = document.getElementById(
  "payment-main-total-out",
);
const paymentMainTotalBalanceSpan = document.getElementById(
  "payment-main-total-balance",
);

function findSupplierForVendor(customers, vendorRaw) {
  if (!vendorRaw || !Array.isArray(customers)) return null;
  const base = normalizeVendorName(vendorRaw);
  if (!base) return null;

  const suppliers = customers.filter((c) => (c.type || "").includes("매입"));
  if (!suppliers.length) return null;

  // 1순위: 완전 동일 매칭
  let found = suppliers.find((c) => normalizeVendorName(c.name) === base);
  if (found) return found;

  // 2순위: 포함 관계 매칭 (양쪽 방향)
  found = suppliers.find((c) => {
    const n = normalizeVendorName(c.name);
    return n && (n.includes(base) || base.includes(n));
  });
  return found || null;
}

// 전체 거래처 목록에서 이름으로 느슨하게 매칭 (구분/분류 무관)
function findCustomerForVendor(customers, vendorRaw) {
  if (!vendorRaw || !Array.isArray(customers)) return null;
  const base = normalizeVendorName(vendorRaw);
  if (!base) return null;

  // 1순위: 완전 동일
  let found = customers.find((c) => normalizeVendorName(c.name) === base);
  if (found) return found;

  // 2순위: 포함 관계
  found = customers.find((c) => {
    const n = normalizeVendorName(c.name);
    return n && (n.includes(base) || base.includes(n));
  });
  return found || null;
}

// 벤더별로 사용자가 마지막에 선택한 분류/매입처를 localStorage 에 저장/불러오기
function loadImportVendorPrefs() {
  try {
    const raw = localStorage.getItem("paymentImportVendorPrefs");
    importVendorPrefs = raw ? JSON.parse(raw) : {};
  } catch (e) {
    importVendorPrefs = {};
  }
}

function saveImportVendorPrefs() {
  try {
    localStorage.setItem(
      "paymentImportVendorPrefs",
      JSON.stringify(importVendorPrefs),
    );
  } catch (e) {
    // 무시
  }
}

// 거래 인식/거래 입력에서 공통으로 사용할 거래처/구분/분류 캐시를 로딩한다.
async function ensureCustomersForPickerLoaded() {
  if (
    importCustomers.length &&
    importCustomerTypes.length &&
    importCustomerGroups.length
  )
    return;
  try {
    const [allCustomers, allTypes, allGroups] = await Promise.all([
      getCustomers(),
      getCustomerTypes(),
      getCustomerGroups(),
    ]);
    importCustomers = allCustomers;
    importSuppliers = allCustomers.filter((c) =>
      (c.type || "").includes("매입"),
    );
    importCustomerTypes = allTypes;
    importCustomerGroups = allGroups;
  } catch (e) {
    importCustomers = [];
    importSuppliers = [];
    importCustomerTypes = [];
    importCustomerGroups = [];
  }
}

async function rebuildImportCustomerBalanceById() {
  // 거래처 목록이 비어있으면 먼저 로딩
  if (!importCustomers.length) {
    await ensureCustomersForPickerLoaded();
  }

  const baseCustomers = Array.isArray(importCustomers) ? importCustomers : [];
  const map = new Map();
  baseCustomers.forEach((c) => {
    const id = String(c && c.id != null ? c.id : "").trim();
    if (!id) return;
    const opening =
      Number(c && c.openingBalance != null ? c.openingBalance : 0) || 0;
    map.set(id, opening);
  });

  let txList = [];
  try {
    txList = await getTransactions();
  } catch (e) {
    txList = [];
  }

  // 카테고리별 잔액 규칙(화면별 함수들을 합친 형태)
  // - 매출: 잔액 = 기초 + 매출합계 - 수금합계
  // - 매입/지출: 잔액 = 기초 - 매입/지출합계 + 결제합계
  (txList || []).forEach((tx) => {
    if (!tx) return;
    const supplierId = String(tx.supplierId || "").trim();
    if (!supplierId) return;
    if (!map.has(supplierId)) return;

    const category = String(tx.category || "");
    const amount = Number(tx.amount) || 0;
    const payment = Number(tx.payment || 0);

    let running = Number(map.get(supplierId)) || 0;
    if (category === "sales") {
      running += amount;
      running -= payment;
    } else if (category === "purchase" || category === "expense") {
      running -= amount;
      running += payment;
    } else {
      return;
    }
    map.set(supplierId, running);
  });

  return map;
}

function scheduleRebuildImportCustomerBalances() {
  if (importCustomerBalancePromise) return importCustomerBalancePromise;
  importCustomerBalancePromise = (async () => {
    try {
      importCustomerBalanceById = await rebuildImportCustomerBalanceById();
    } finally {
      importCustomerBalancePromise = null;
    }

    // 모달이 열려있으면 즉시 다시 렌더링
    const isOpen =
      paymentImportCustomerModal &&
      paymentImportCustomerModal.getAttribute("aria-hidden") !== "true";
    if (isOpen) {
      renderPaymentImportCustomerList();
    }
  })();
  return importCustomerBalancePromise;
}

function guessImportCategory(name, out, inn, supplier) {
  if (supplier && out > 0) return "매입결제";
  if (out > 0 && /카드|모빌카드|삼성|롯데|KB|신한/.test(name))
    return "카드대금";
  if (inn > 0) return "입금";
  return "기타";
}

// 거래 인식 행의 내부 category 값을, 선택된 거래처 구분/흐름에 맞춰 자동 계산한다.
function updateImportRecordCategory(rec) {
  if (!rec) return;

  // 입금이면 무조건 입금으로 분류
  if (rec.flow === "in") {
    rec.category = "입금";
    return;
  }

  const t = rec.custType || "";
  if (t.includes("매입")) {
    rec.category = "매입결제";
  } else if (t.includes("카드")) {
    rec.category = "카드대금";
  } else {
    rec.category = rec.category || "기타";
  }
}

// 거래 등록 모달: 상단 거래일 입력값을 하단 "거래일시" 칸에 맞춰 준다.
function syncPaymentEntryDateTime() {
  // (정리) 현재 payment 화면에는 하단 "거래일시" 입력이 별도로 없어서 동작 없음
  // 필요해지면 HTML에 입력칸을 추가하고 여기서 동기화한다.
  return;
}

// 장부 선택 모달 열기/닫기 및 렌더링
async function renderPaymentLedgerModalTable() {
  await renderPaymentLedgerModalTableCore({
    paymentLedgerTypeListBody,
    paymentLedgerListBody,
    cashflowTypes,
    cashflowItems,
    rebuildCashflowSummaryOptions,
    getAllLedgerTx,
    setSelectedLedgerCodeInModal: (next) => {
      selectedLedgerCodeInModal = next;
    },
    setSelectedLedgerTypeCodeInModal: (next) => {
      selectedLedgerTypeCodeInModal = next;
    },
    setSelectedLedgerItemCodeInModal: (next) => {
      selectedLedgerItemCodeInModal = next;
    },
    getSelectedLedgerTypeCodeInModal: () => selectedLedgerTypeCodeInModal,
    getSelectedCashflowTypeForEntry: () => selectedCashflowTypeForEntry,
    paymentLedgerTypeCodeInput,
    paymentLedgerSelect,
    getSelectedCashflowItemForEntry: () => selectedCashflowItemForEntry,
    paymentCashflowItemCodeInput,
    getLedgerModalShowAllItems: () => ledgerModalShowAllItems,
    setLedgerModalShowAllItems: (next) => {
      ledgerModalShowAllItems = next;
    },
    paymentLedgerItemListBody,
    renderPaymentLedgerModalItemTable,
    paymentLedgerTotalSpan,
  });
}

function renderPaymentLedgerModalItemTable({
  items,
  preferItemCode,
  showAll = false,
} = {}) {
  renderPaymentLedgerModalItemTableCore({
    paymentLedgerItemListBody,
    paymentLedgerItemWrap,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex: () => currentImportLedgerIndex,
    getTransferFromLedgerInput: () => transferFromLedgerInput,
    getTransferToLedgerInput: () => transferToLedgerInput,
    setSelectedLedgerItemCodeInModal: (next) => {
      selectedLedgerItemCodeInModal = next;
    },
    getSelectedLedgerTypeCodeInModal: () => selectedLedgerTypeCodeInModal,
    getSelectedLedgerItemCodeInModal: () => selectedLedgerItemCodeInModal,
    setSelectedLedgerCodeInModal: (next) => {
      selectedLedgerCodeInModal = next;
    },
    setSelectedLedgerTypeCodeInModal: (next) => {
      selectedLedgerTypeCodeInModal = next;
    },
    paymentLedgerTypeListBody,
    paymentLedgerListBody,
    applyPaymentLedgerSelection,
    items,
    preferItemCode,
    showAll,
  });
}

function applyPaymentLedgerSelection(
  code,
  name,
  balance,
  cashflowItemCode,
  cashflowItemName,
) {
  applyPaymentLedgerSelectionCore({
    code,
    name,
    balance,
    cashflowItemCode,
    cashflowItemName,
    fmt,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex: () => currentImportLedgerIndex,
    setCurrentImportLedgerIndex: (next) => {
      currentImportLedgerIndex = next;
    },
    importRecords,
    renderPaymentImportTable,
    getTransferFromLedgerInput: () => transferFromLedgerInput,
    getTransferToLedgerInput: () => transferToLedgerInput,
    setTransferFromLedgerInput: (next) => {
      transferFromLedgerInput = next;
    },
    setTransferToLedgerInput: (next) => {
      transferToLedgerInput = next;
    },
    setSelectedCashflowTypeForEntry: (next) => {
      selectedCashflowTypeForEntry = next;
    },
    setSelectedCashflowCurrentBalance: (next) => {
      selectedCashflowCurrentBalance = next;
    },
    setSelectedCashflowItemForEntry: (next) => {
      selectedCashflowItemForEntry = next;
    },
    paymentLedgerTypeCodeInput,
    paymentLedgerBalanceInput,
    paymentLedgerSelect,
    paymentLedgerNameInput,
    paymentLedgerCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    ensureSelectHasOption,
    closePaymentLedgerModal,
    setEntryCounterpartyLedgerCode: (next) => {
      entryCounterpartyLedgerCode = next;
    },
    setEntryCounterpartyLedgerLabel: (next) => {
      entryCounterpartyLedgerLabel = next;
    },
  });

  // 장부 선택 모달에서 확정된 값이 인식 모달(선택한 장부 표기)에도 즉시 반영되도록 동기화
  try {
    updatePaymentImportSelectedAccountLabel();

    // 인식 모달 버튼 활성화 상태도 즉시 동기화
    const typeCode = String(selectedCashflowTypeForEntry || '').trim();
    const itemCode = String(selectedCashflowItemForEntry || '').trim();
    if (btnPaymentImportParse) btnPaymentImportParse.disabled = !typeCode;
    if (btnPaymentImportSave) btnPaymentImportSave.disabled = !itemCode;
    if (paymentImportStatus) {
      if (!typeCode) {
        paymentImportStatus.textContent =
          '좌측 장부관리에서 계정을 먼저 선택해 주세요.';
      } else if (!itemCode) {
        paymentImportStatus.textContent =
          '저장을 위해 좌측 장부목록에서 출금 장부를 선택해 주세요.';
      } else if (
        String(paymentImportStatus.textContent || '').includes('선택')
      ) {
        // 기존 안내 문구가 남아있는 경우에만 비운다.
        paymentImportStatus.textContent = '';
      }
    }
  } catch {
    // ignore
  }

  // UX 보정:
  // 신용카드 장부를 선택해 거래를 입력할 때는 기본 구분이 '출금'이 되는 것이 자연스럽다.
  // (기본값이 '입금'으로 체크되어 있어 사용자가 자주 실수하는 케이스 방지)
  try {
    const isMainLedgerPick =
      paymentLedgerTypeCodeInput &&
      String(paymentLedgerTypeCodeInput.value || '').trim() ===
        String(code || '').trim();
    if (isMainLedgerPick) {
      const flow = getSelectedPaymentFlow();
      const ledgerName = String(name || '').trim();
      if (flow === 'in' && ledgerName.includes('신용카드')) {
        const outRadio = Array.from(paymentFlowRadios || []).find(
          (r) => String(r?.value || '') === 'out',
        );
        if (outRadio) {
          outRadio.checked = true;
          updatePaymentLedgerTitleByFlow();
          updateLedgerRowsByFlow();
        }
      }
    }
  } catch {
    // ignore
  }
}

// 장부 선택 모달 열기 (타겟은 전역 transferFrom/ToLedgerInput 로 결정)
async function openPaymentLedgerModalForLedgerSelect() {
  await openPaymentLedgerModalForLedgerSelectCore({
    openLedgerPicker,
    getSelectedCashflowTypeForEntry: () => selectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry: () => selectedCashflowItemForEntry,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemCodeInput,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex: () => currentImportLedgerIndex,
    setCurrentImportLedgerIndex: (next) => {
      currentImportLedgerIndex = next;
    },
    getTransferFromLedgerInput: () => transferFromLedgerInput,
    getTransferToLedgerInput: () => transferToLedgerInput,
    setTransferFromLedgerInput: (next) => {
      transferFromLedgerInput = next;
    },
    setTransferToLedgerInput: (next) => {
      transferToLedgerInput = next;
    },
    applyPaymentLedgerSelection: ({
      code,
      name,
      balance,
      cashflowItemCode,
      cashflowItemName,
    }) => {
      applyPaymentLedgerSelection(
        code,
        name,
        balance,
        cashflowItemCode,
        cashflowItemName,
      );
    },
  });
}

function closePaymentLedgerModal() {}

// 거래 입력 모달에서 하단 입력란(거래처/금액/메모)을 새 입력용으로 초기화
function resetPaymentEntryFields() {
  resetPaymentEntryFieldsCore({
    paymentEntryDisplayButton,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    setEntryCounterpartyLedgerCode: (next) => {
      entryCounterpartyLedgerCode = next;
    },
    setEntryCounterpartyLedgerLabel: (next) => {
      entryCounterpartyLedgerLabel = next;
    },
    setSelectedCashflowItemForEntry: (next) => {
      selectedCashflowItemForEntry = next;
    },
  });
}

function openPaymentEntryChoiceModal(triggerEl) {
  openPaymentEntryChoiceModalCore({
    paymentEntryChoiceModal,
    triggerEl,
    openModalOverlay,
    registerModalEscClose,
    closePaymentEntryChoiceModal,
    getPaymentEntryChoiceEscOff: () => paymentEntryChoiceEscOff,
    setPaymentEntryChoiceEscOff: (next) => {
      paymentEntryChoiceEscOff = next;
    },
  });
}

function closePaymentEntryChoiceModal() {
  closePaymentEntryChoiceModalCore({
    paymentEntryChoiceModal,
    closeModalOverlay,
    getPaymentEntryChoiceEscOff: () => paymentEntryChoiceEscOff,
    setPaymentEntryChoiceEscOff: (next) => {
      paymentEntryChoiceEscOff = next;
    },
  });
}

// 거래 입력 모달 열기
// isEdit=true 이면 기존 거래 수정 모드로 열고, 폼 값은 setPaymentFormFromTx에서 이미 채워졌다고 가정한다.
function openPaymentModal(isEdit = false) {
  openPaymentModalCore({
    paymentModal,
    paymentModalTitle,
    paymentModalManager,
    resetPaymentEntryFields,
    syncPaymentEntryDateTime,
    isEdit,
  });
}

// 거래 인식 결과 테이블 렌더
function renderPaymentImportTable() {
  renderPaymentImportTableCore({
    paymentImportResultBody,
    importRecords,
    importCustomers,
    fmt,
    stripCodePrefix,
    IMPORT_MODE_TRANSFER,
    paymentImportCountSpan,
    paymentImportStatus,
    paymentImportTotalInnSpan,
    paymentImportTotalOutSpan,
    paymentImportTotalBalanceSpan,
    applyAmountColoring,
    paymentImportModal,
  });
}

function closePaymentModal() {
  closePaymentModalCore({ paymentModalManager });
}

function openPaymentImportModal() {
  openPaymentImportModalCore({
    paymentImportModal,
    paymentImportModalManager,
    paymentImportTextarea,
  });
}

function closePaymentImportModal() {
  closePaymentImportModalCore({ paymentImportModalManager });
}

function openPaymentImportCustomerModal() {
  openPaymentImportCustomerModalCore({
    paymentImportCustomerModal,
    paymentImportCustomerModalManager,
    paymentImportCustomerSearch,
  });

  // 잔액은 거래 내역 기반이므로, 모달 오픈 후 비동기로 캐시를 갱신해 다시 렌더한다.
  void (async () => {
    try {
      await ensureCustomersForPickerLoaded();
      await scheduleRebuildImportCustomerBalances();
    } catch (e) {
      // 잔액 계산 실패는 모달 동작에 영향 주지 않음
    }
  })();
}

function closePaymentImportCustomerModal() {
  closePaymentImportCustomerModalCore({
    paymentImportCustomerModalManager,
  });
}

// 거래 인식용 거래처 선택 모달 상단에, 현재 선택 중인 거래(은행/카드 행)를 표시
function updatePaymentImportCurrentRecord(rec) {
  updatePaymentImportCurrentRecordCore({
    paymentImportCurrentRecord,
    rec,
    fmt,
  });
}

function renderPaymentImportCustomerList() {
  renderPaymentImportCustomerListCore({
    paymentImportCustomerListBody,
    paymentImportCustomerSearch,
    importCustomers,
    importCustomerFilterType,
    importCustomerFilterGroup,
    importCustomerBalanceById,
    fmt,
    applyAmountColoring,
    paymentImportCustomerModal,
  });
}

function applyImportCustomerSelection(customerId) {
  const updated = applyImportCustomerSelectionCore({
    customerId,
    currentImportCustomerIndex,
    importRecords,
    importCustomers,
    updateImportRecordCategory,
  });
  if (!updated) return;
  renderPaymentImportTable();
  closePaymentImportCustomerModal();
}

function renderPaymentImportTypeList() {
  renderPaymentImportTypeListCore({
    paymentImportTypeListBody,
    importCustomerTypes,
    importCustomerFilterType,
  });
}

function renderPaymentImportGroupList() {
  renderPaymentImportGroupListCore({
    paymentImportGroupListBody,
    importCustomerGroups,
    importCustomerFilterType,
    importCustomerFilterGroup,
  });
}

function parsePaymentImportRaw() {
  try {
    const raw = (paymentImportTextarea?.value || "").trim();
    importRecords = [];
    if (paymentImportResultBody) paymentImportResultBody.innerHTML = "";
    if (paymentImportCountSpan) paymentImportCountSpan.textContent = "0";
    if (paymentImportStatus) paymentImportStatus.textContent = "";
    if (!raw) {
      if (paymentImportStatus)
        paymentImportStatus.textContent = "붙여넣은 내용이 없습니다.";
      return;
    }

    const splitLine = (line) => {
      // 엑셀/웹 표 붙여넣기(탭 구분)를 우선 지원한다.
      const tsv = String(line || "").split("\t");
      if (tsv.length >= 3) return tsv.map((v) => String(v || "").trim());
      return String(line || "")
        .split(/\s+/)
        .map((v) => String(v || "").trim())
        .filter(Boolean);
    };

    const hasCardApprovalHeader = /승인일/.test(raw) && /승인금액/.test(raw);

    const expandHeaderKeys = (s) => {
      const base = String(s || "").trim();
      if (!base) return [];
      const noSpace = base.replace(/\s+/g, "");
      const noParens = noSpace.replace(/\([^)]*\)/g, "");
      const noBrackets = noParens.replace(/\[[^\]]*\]/g, "");
      const noBraces = noBrackets.replace(/\{[^}]*\}/g, "");
      const stripped = noBraces.replace(/[()\[\]{}]/g, "");
      const out = new Set([noSpace, noParens, noBrackets, noBraces, stripped]);
      return [...out].map((k) => String(k || "").trim()).filter(Boolean);
    };

    const buildHeaderIndex = (headerLine) => {
      const cols = splitLine(headerLine);
      const idx = {};
      cols.forEach((h, i) => {
        const keys = expandHeaderKeys(h);
        for (const key of keys) {
          if (!key) continue;
          if (idx[key] == null) idx[key] = i;
        }
      });
      return Object.keys(idx).length ? idx : null;
    };

    // 카드 승인내역 헤더(탭 붙여넣기)를 감지하면 컬럼 인덱스를 만들어 둔다.
    const rawLinesForHeader = raw
      .split(/\r?\n/)
      .map((l) => String(l || "").trim())
      .filter((l) => l);
    const cardHeaderLine = rawLinesForHeader.find(
      (l) => l.includes("승인일") && l.includes("승인금액"),
    );
    const cardHeaderIndex = cardHeaderLine ? buildHeaderIndex(cardHeaderLine) : null;

    const getByHeader = (cols, headerKeys) => {
      if (!cardHeaderIndex) return "";
      const keys = Array.isArray(headerKeys) ? headerKeys : [headerKeys];
      for (const kRaw of keys) {
        const expanded = expandHeaderKeys(kRaw);
        for (const k of expanded) {
          if (!k) continue;
          const i = cardHeaderIndex[k];
          if (i == null) continue;
          const v = cols[i];
          if (v != null && String(v).trim() !== "") return String(v).trim();
        }
      }
      return "";
    };

    const tryParseCardApprovalLine = (line) => {
      const cols = splitLine(line).filter((v) => v !== "");
      if (cols.length < 6) return null;

      // 헤더 기반 우선 파싱 (컬럼 위치가 바뀌거나 컬럼이 추가된 경우 대응)
      const dateByHeader = getByHeader(cols, ["승인일", "승인일자"]);
      const timeByHeader = getByHeader(cols, ["승인시간"]);
      const merchantByHeader = getByHeader(cols, ["가맹점명", "가맹점"]);
      const amountByHeader = getByHeader(cols, ["승인금액", "이용금액", "결제금액"]);
      const statusByHeader = getByHeader(cols, ["승인구분", "승인상태", "구분"]);
      const deptNoByHeader = getByHeader(cols, ["부서번호"]);
      const deptNameByHeader = getByHeader(cols, ["부서명"]);
      const cardNoByHeader = getByHeader(cols, ["카드번호"]);
      const userNameByHeader = getByHeader(cols, ["이용자명", "사용자명"]);
      const bizNameByHeader = getByHeader(cols, ["업종명", "업종"]);
      const payMethodByHeader = getByHeader(cols, ["결제방법"]);
      const installmentByHeader = getByHeader(cols, ["할부개월수", "할부"]);
      const approvalNoByHeader = getByHeader(cols, [
        "승인번호",
        "전표번호",
        "거래번호",
        "승인No",
        "승인NO",
      ]);

      const datePart = dateByHeader || cols[0];
      const timePart = timeByHeader || cols[1];
      const merchantName = merchantByHeader || cols[6] || cols[2] || "";
      const amountStr = amountByHeader || cols[10] || cols[cols.length - 1] || "0";

      const dateOk = /^\d{4}[.-]\d{2}[.-]\d{2}$/.test(String(datePart || "").trim());
      const timeOk = /^\d{2}:\d{2}:\d{2}$/.test(String(timePart || "").trim());
      if (!dateOk || !timeOk) return null;

      const amountRaw = Number(parseMoney(amountStr)) || 0;
      const amountAbs = Math.abs(amountRaw);
      if (!merchantName || !(amountAbs >= 0)) return null;

      const statusText = String(statusByHeader || "").trim();
      const joined = cols.join(" ");
      const isRejected = /거절|실패/.test(statusText) || /거절|실패/.test(joined);
      if (isRejected) return null;
      const isCancel =
        amountRaw < 0 ||
        /취소|환불/.test(statusText) ||
        /승인취소|취소|환불/.test(joined);

      const dateParts = String(datePart).split(/[.-]/);
      const y = dateParts[0];
      const m = dateParts[1];
      const d = dateParts[2];
      const date = `${y}-${m}-${d}`;

      // 승인취소/환불은 반대 방향(입금)으로 처리한다.
      const flow = isCancel ? "in" : "out";
      const out = isCancel ? 0 : amountAbs;
      const inn = isCancel ? amountAbs : 0;
      const bal = 0;

      const deptNo = String(deptNoByHeader || cols[2] || "").trim();
      const deptName = String(deptNameByHeader || cols[3] || "").trim();
      const cardNo = String(cardNoByHeader || cols[4] || "").trim();
      const userName = String(userNameByHeader || cols[5] || "").trim();
      const bizName = String(bizNameByHeader || cols[7] || "").trim();
      const payMethod = String(payMethodByHeader || cols[8] || "").trim();
      const installment = String(installmentByHeader || cols[9] || "").trim();
      const approvalNo = String(approvalNoByHeader || "").trim();

      const memoParts = [];
      if (approvalNo) memoParts.push(`승인번호:${approvalNo}`);
      if (isCancel) memoParts.push("승인취소");
      if (statusText && !memoParts.includes(statusText)) memoParts.push(statusText);
      if (bizName) memoParts.push(`업종:${bizName}`);
      if (payMethod) memoParts.push(`결제:${payMethod}`);
      if (installment && installment !== "0") memoParts.push(`할부:${installment}`);
      if (userName) memoParts.push(`이용자:${userName}`);
      if (deptName || deptNo) memoParts.push(`부서:${deptName || deptNo}`);
      if (cardNo) memoParts.push(`카드:${cardNo}`);
      const rest = memoParts.join(" / ");

      return {
        dateTime: `${datePart} ${timePart}`,
        date,
        vendor: String(merchantName || "").trim(),
        flow,
        amount: amountAbs,
        out,
        inn,
        balance: bal,
        memo: rest,
        approvalNo,
        cardNo,
      };
    };

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l);
    for (const line of lines) {
      if (!/^\d{4}[.-]\d{2}[.-]\d{2}/.test(line)) continue; // 데이터 행만

      // 카드 승인내역(표 붙여넣기) 우선 시도
      const cardParsed = (hasCardApprovalHeader || line.includes("\t"))
        ? tryParseCardApprovalLine(line)
        : null;

      let datePart;
      let timePart;
      let name;
      let out;
      let inn;
      let bal;
      let flow;
      let amount;
      let date;
      let rest;

      if (cardParsed) {
        datePart = cardParsed.dateTime.split(" ")[0];
        timePart = cardParsed.dateTime.split(" ")[1] || "00:00:00";
        name = cardParsed.vendor;
        out = cardParsed.out;
        inn = cardParsed.inn;
        bal = cardParsed.balance;
        flow = cardParsed.flow;
        amount = cardParsed.amount;
        date = cardParsed.date;
        rest = cardParsed.memo || "";
      } else {
        const parts = splitLine(line).filter(Boolean);
        // 지원 형식
        // A) (탭 4열) 날짜시간 / 거래처 / 입금 / 출금
        //    예) 2026.01.31 14:17:46\t상대\t596000\t0
        // B) (기존) 날짜 / 시간 / 거래처 / 출금 / 입금 / (잔액?) / (메모...)

        if (parts.length < 4) continue;

        // A) 날짜시간이 한 칸으로 들어오는 경우
        if (parts.length === 4) {
          const dt = String(parts[0] || "").trim();
          const m = dt.match(
            /^(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}:\d{2}:\d{2})$/,
          );
          if (!m) continue;

          datePart = `${m[1]}.${m[2]}.${m[3]}`;
          timePart = m[4];
          name = parts[1];

          // (법인국민통장 붙여넣기) 4열은 (출금, 입금) 순서로 들어오는 케이스가 많다.
          const outStr = parts[2] || "0";
          const inStr = parts[3] || "0";
          out = parseMoney(outStr);
          inn = parseMoney(inStr);
          bal = 0;
          rest = "";

          flow = out > 0 ? "out" : "in";
          amount = out > 0 ? out : inn;
          const [y, mo, da] = String(datePart).split(/[.-]/);
          date = `${y}-${mo}-${da}`;
        } else {
          // B) 날짜/시간이 분리되어 들어오는 기존 형식
          // 최소 형식: 날짜 시간 이름 출금액 입금액 (잔액/메모는 없어도 됨)
          if (parts.length < 5) continue;

          datePart = parts[0];
          timePart = parts[1];
          name = parts[2];
          const outStr = parts[3] || "0";
          const inStr = parts[4] || "0";
          const balStr = parts[5] || "0";
          rest = parts.length > 6 ? parts.slice(6).join(" ") : "";

          out = parseMoney(outStr);
          inn = parseMoney(inStr);
          bal = parseMoney(balStr);
          flow = out > 0 ? "out" : "in";
          amount = out > 0 ? out : inn;
          const [y, mo, da] = String(datePart).split(/[.-]/);
          date = `${y}-${mo}-${da}`;
        }
      }

      // 매입처 후보 자동 매칭 및 기본 분류 추정 + 이전 선택값(분류/매입처/구분/이체 장부/거래처) 반영
      let supplier = findSupplierForVendor(importSuppliers, name);
      let customer = findCustomerForVendor(importCustomers, name);
      let category = guessImportCategory(name, out, inn, supplier);
      // 기본값: 금액 방향에 맞춰 입금/출금으로 설정(사용자가 따로 선택하지 않아도 저장 가능)
      let rowMode = flow === "out" ? "out" : "in";
      let transferLedgerCode = "";
      let transferLedgerLabel = "";
      let transferLedgerTypeCode = "";

      const prefKey = normalizeVendorName(name);
      const pref =
        prefKey && importVendorPrefs[prefKey]
          ? importVendorPrefs[prefKey]
          : null;
      if (pref) {
        if (pref.category) category = pref.category;
        if (pref.supplierId) {
          const byId = importSuppliers.find(
            (s) => String(s.id) === String(pref.supplierId),
          );
          if (byId) supplier = byId;
        }
        if (pref.customerId) {
          const custById = importCustomers.find(
            (c) => String(c.id) === String(pref.customerId),
          );
          if (custById) customer = custById;
        }
        const prefTransferItem = String(
          pref.transferLedgerItemCode || pref.transferLedgerCode || "",
        ).trim();

        if (pref.mode === "transfer" && prefTransferItem) {
          rowMode = IMPORT_MODE_TRANSFER;
          // 이체 상대 장부는 장부목록(itemCode) 기반
          const maybeItem = String(prefTransferItem).trim();
          if (/^A\d{4}$/.test(maybeItem)) {
            transferLedgerCode = maybeItem;
            const it = Array.isArray(cashflowItems)
              ? cashflowItems.find((x) => String(x?.code || "").trim() === maybeItem)
              : null;
            transferLedgerTypeCode = it ? String(it.typeCode || "").trim() : "";
          } else {
            transferLedgerCode = "";
            transferLedgerTypeCode = "";
          }
          transferLedgerLabel = pref.transferLedgerLabel || "";
        } else if (pref.mode === "normal") {
          // 이전에는 '일반'만 기억했으므로, 지금은 실제 금액 방향에 맞춰
          // 입금/출금 중 하나로 기본값을 정해 준다.
          rowMode = flow === "out" ? "out" : "in";
        }
      }

      importRecords.push({
        dateTime: `${datePart} ${timePart}`,
        date,
        vendor: name,
        flow,
        amount,
        out,
        inn,
        balance: bal,
        memo: rest,
        approvalNo: cardParsed ? cardParsed.approvalNo || "" : "",
        cardNo: cardParsed ? cardParsed.cardNo || "" : "",
        category,
        supplierId: supplier ? supplier.id : "",
        customerId: customer ? customer.id : "",
        custType: customer ? customer.type || "" : "",
        custGroup: customer ? customer.group || "" : "",
        transferLedgerCode,
        transferLedgerLabel,
        transferLedgerTypeCode,
        // 행별 구분(입출금 / 이체)
        mode: rowMode,
      });
    }
    renderPaymentImportTable();
  } catch (e) {
    console.error("거래 인식(파싱) 중 오류:", e);
    if (paymentImportStatus) {
      paymentImportStatus.textContent =
        "인식 중 오류가 발생했습니다. (붙여넣기 형식을 확인해 주세요)";
    }
  }
}

/* =========================
   좌측 입출금 분류 요약 박스
========================= */
function updateCashflowTypeButtons() {
  updateCashflowTypeButtonsCore({
    cashflowTypeSwitchButtons,
    cashflowSummaryFlowFilter,
  });
}

async function renderCashflowSummaryTable() {
  await renderCashflowSummaryTableCore({
    cashflowListBody,
    cashflowTotalSpan,
    cashflowTypes,
    cashflowItems,
    selectedCashflowCodeFilter,
    selectedCashflowTypeForEntry,
    cutoffDate: state.dateTo,
    methodTab: state.methodTab,
    setSelectedCashflowTypeForEntry: (value) => {
      selectedCashflowTypeForEntry = value;
      // 구분(타입)을 새로 선택하면, 하단 장부목록 선택은 초기화한다.
      selectedCashflowItemForEntry = "";
      applySelectedLedgerItemToEntryAndImport();
      renderPaymentLedgerItemsCard();
    },
    setSelectedCashflowCurrentBalance: (value) => {
      selectedCashflowCurrentBalance = value;
    },
    setMainTxFilterCode: (value) => {
      window._mainTxFilterCode = value;
    },
    getAllLedgerTx,
    render,
  });
}

async function rebuildCashflowSummaryOptions() {
  await rebuildCashflowSummaryOptionsCore({
    getCashflowTypes,
    getCashflowItems,
    setCashflowTypes: (next) => {
      cashflowTypes = next;
    },
    setCashflowItems: (next) => {
      cashflowItems = next;
    },
    cashflowSelect,
    selectedCashflowCodeFilter,
    setSelectedCashflowCodeFilter: (next) => {
      selectedCashflowCodeFilter = next;
    },
    renderCashflowSummaryTable,
  });
}

async function refreshCashflowSummary() {
  await refreshCashflowSummaryCore({
    rebuildCashflowSummaryOptions,
  });
  renderPaymentLedgerItemsCard();
  applySelectedLedgerItemToEntryAndImport();
}

let _ledgerStandardBackfillInFlight = false;
// payment 화면 전용: source="payment" 레코드의 표준 키와 메모 옵션을 보완한다.
// 공용 ledger-tx-cashflowitem-repair.js는 마스터를 조회해 장부 코드·이름을 보정한다.
async function backfillLedgerTxStandardKeysIfMissing() {
  if (_ledgerStandardBackfillInFlight) return;
  _ledgerStandardBackfillInFlight = true;
  try {
    const txAll = await getAllLedgerTx();
    if (!Array.isArray(txAll) || !txAll.length) return;

    let updated = 0;
    let skipped = 0;

    for (const tx of txAll) {
      if (!tx || typeof tx !== "object") continue;
      // payment 화면에서 생성/저장된 레코드만 표준 키 세트로 보정한다.
      if (String(tx.source || "") !== "payment") continue;

      const hadEntryMemoField = Object.prototype.hasOwnProperty.call(
        tx,
        "entryMemo",
      );
      let changed = false;

      if (!Object.prototype.hasOwnProperty.call(tx, "cashflowItemCode")) {
        tx.cashflowItemCode = "";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "cashflowItemName")) {
        tx.cashflowItemName = "";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "entryMemo")) {
        tx.entryMemo = "";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "preferEntryMemo")) {
        // 과거 데이터는 entryMemo 필드의 존재 여부로 수동 입력/인식 저장을 구분했으므로,
        // 그 규칙을 그대로 preferEntryMemo로 옮긴다.
        tx.preferEntryMemo = hadEntryMemoField;
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "customerId")) {
        tx.customerId = "";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "supplierId")) {
        tx.supplierId = "";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "groupId")) {
        tx.groupId = null;
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(tx, "isOrigin")) {
        tx.isOrigin = null;
        changed = true;
      }

      if (!changed) continue;
      tx.updatedAt = Date.now();
      try {
        await putLedgerTx(ensureLedgerTxKeys(tx));
        updated += 1;
      } catch (e) {
        skipped += 1;
      }
    }

    if (DEBUG_BACKFILL && (updated || skipped)) {
      console.log(
        `[payment] ledger_tx 표준 키 백필: updated=${updated}, skipped=${skipped}`,
      );
    }
  } finally {
    _ledgerStandardBackfillInFlight = false;
  }
}

let _ledgerFingerprintBackfillInFlight = false;
// payment 화면 전용: source="payment" 레코드의 중복 저장 방지 fingerprint를 생성·갱신한다.
// 공용 ledger-tx-cashflowitem-repair.js의 장부 코드·이름 보정과 역할이 다르다.
async function backfillLedgerTxFingerprintsIfMissing() {
  if (_ledgerFingerprintBackfillInFlight) return;
  _ledgerFingerprintBackfillInFlight = true;
  try {
    const normalizeText = (value) =>
      String(value || "")
        .replace(/\s+/g, "")
        .replace(/[()\-.,]/g, "")
        .trim()
        .toLowerCase();

    const normalizeIdToken = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, "")
        .replace(/[^0-9a-zA-Z]/g, "")
        .toUpperCase();

    const normalizeNumber = (value) => {
      if (typeof value === "number") return value;
      const s = String(value || "").replace(/,/g, "").trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizeDateTimeKey = (raw) => {
      const s = String(raw || "").trim();
      if (!s) return "";
      const m = s.match(
        /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/, // date + optional time
      );
      if (!m) return s.slice(0, 19);
      const y = m[1];
      const mm = String(m[2]).padStart(2, "0");
      const dd = String(m[3]).padStart(2, "0");
      const date = `${y}-${mm}-${dd}`;
      const hhRaw = m[4];
      if (!hhRaw) return date;
      const hh = String(hhRaw).padStart(2, "0");
      const mi = String(m[5] || "0").padStart(2, "0");
      const ss = String(m[6] || "0").padStart(2, "0");
      return `${date}T${hh}:${mi}:${ss}`;
    };

    const makeLedgerTxFingerprint = (tx) => {
      if (!tx) return "";
      const dateKey = normalizeDateTimeKey(tx.dateTime || tx.date || "");
      const flow = String(tx.flow || "").trim();
      const accountId = String(tx.accountId || "").trim();
      const cashflowItemCode = String(
        tx.cashflowItemCode || tx.cashflowCode || "",
      ).trim();
      const amount = Math.abs(normalizeNumber(tx.amount));
      const vendorKey = normalizeText(tx.vendor || tx.item || "");
      const memoKey = normalizeText(tx.memo || tx.entryMemo || "");
      const partyKey = vendorKey || memoKey;

      const approvalNo = normalizeIdToken(
        tx.approvalNo || tx.receiptNo || tx.referenceNo || tx.tradeNo || "",
      );
      const cardNo = normalizeIdToken(tx.cardNo || "");

      if (!dateKey || !flow || !(amount > 0)) return "";
      if (approvalNo) {
        return ["LEDGER", "REF", approvalNo, cardNo]
          .filter((v) => v !== "")
          .join("|");
      }

      return [
        "LEDGER",
        "BASE",
        dateKey,
        flow,
        accountId,
        cashflowItemCode,
        String(amount),
        partyKey,
      ]
        .filter((v) => v !== "")
        .join("|");
    };

    const txAll = await getAllLedgerTx();
    if (!Array.isArray(txAll) || !txAll.length) return;

    let updated = 0;
    let skipped = 0;

    for (const tx of txAll) {
      if (!tx || typeof tx !== "object") continue;
      if (String(tx.source || "") !== "payment") continue;

      const fingerprint = makeLedgerTxFingerprint(tx);
      if (!fingerprint) continue;

      const prev = String(tx.fingerprint || "").trim();
      if (prev === fingerprint) continue;

      tx.fingerprint = fingerprint;
      tx.updatedAt = Date.now();
      try {
        await putLedgerTx(ensureLedgerTxKeys(tx));
        updated += 1;
      } catch (e) {
        // 유니크 충돌(동일 fingerprint가 이미 존재) 등은 스킵
        tx.fingerprint = prev;
        skipped += 1;
      }
    }

    if (DEBUG_BACKFILL && (updated || skipped)) {
      console.log(
        `[payment] ledger_tx fingerprint 백필: updated=${updated}, skipped=${skipped}`,
      );
    }
  } finally {
    _ledgerFingerprintBackfillInFlight = false;
  }
}


/* =========================
   렌더(요약/표)
========================= */
async function render() {
  // 거래처 목록을 미리 캐싱 (최초 1회만)
  if (!window._allCustomers) {
    try {
      window._allCustomers = await getCustomers();
    } catch (e) {
      window._allCustomers = [];
    }
  }

  const txAll = await getAllLedgerTx();
  const tbody = $("tbody");
  await renderPaymentMainTable({
    txAll,
    state,
    cashflowTypes,
    cashflowItems,
    filterCode: window._mainTxFilterCode,
    inRange,
    matchQ,
    stripCodePrefix,
    findCustomerForVendor,
    fmt,
    applyAmountColoring,
    paymentMainCountSpan,
    paymentMainTotalInnSpan,
    paymentMainTotalOutSpan,
    paymentMainTotalBalanceSpan,
    tbody,
    allCustomers: window._allCustomers,
  });

  // 좌측 하단 장부목록 카드(선택된 구분에 따라 필터링)
  renderPaymentLedgerItemsCard();
}

/* =========================
   이벤트 바인딩
========================= */
function bind() {
  const btnPaymentNew = document.getElementById("btn-payment-new");
  const btnPaymentEdit = document.getElementById("btn-payment-edit");
  const btnPaymentDelete = document.getElementById("btn-payment-delete");
  const searchInput = document.getElementById("q");
  const dateFromInput = document.getElementById("payment-date-from");
  const dateToInput = document.getElementById("payment-date-to");
  const btnPaymentImport = document.getElementById("btn-payment-import");
  const headerDateInput = document.getElementById("payment-entry-date");

  // 거래입력/거래인식 모달에서도 장부 선택을 허용한다.

  const btnExcelToggle = document.getElementById("btn-payment-excel-toggle");
  const excelDropdownWrap = document.getElementById("payment-excel-dropdown");
  const excelMenu = document.getElementById("payment-excel-menu");
  const btnExcelExportScreen = document.getElementById(
    "btn-payment-excel-export-screen",
  );

  const paymentExcelDropdown = bindExcelDropdown({
    toggleButton: btnExcelToggle,
    menuEl: excelMenu,
    dropdownWrap: excelDropdownWrap,
  });

  function downloadPaymentsAsXlsx() {
    const tableEl = document.querySelector("table.payment-main-table");
    const from = ymdCompact(dateFromInput?.value);
    const to = ymdCompact(dateToInput?.value);
    const rangeLabel = from || to ? `_${from || ""}-${to || ""}` : "";
    exportTableToXlsx({
      tableEl,
      filename: `입출금내역${rangeLabel}.xlsx`,
      sheetName: "입출금내역",
    });
  }

  if (btnExcelExportScreen) {
    btnExcelExportScreen.addEventListener("click", () => {
      paymentExcelDropdown?.setOpen(false);
      downloadPaymentsAsXlsx();
    });
  }

  // 메인 내역/좌측 요약/모달 리스트들에 방향키 이동 기능 공통 적용
  const mainTbody = document.getElementById("tbody");
  if (mainTbody) {
    enableTableArrowNavigation(mainTbody, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });

    bindDblClickRowEdit(mainTbody, {
      rowSelector: 'tr[data-id]',
      editButton: btnPaymentEdit,
    });
  }
  if (cashflowListBody) {
    enableTableArrowNavigation(cashflowListBody, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });
  }
  if (paymentImportCustomerListBody) {
    enableTableArrowNavigation(paymentImportCustomerListBody, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });
  }
  if (paymentImportTypeListBody) {
    enableTableArrowNavigation(paymentImportTypeListBody, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });
  }
  if (paymentImportGroupListBody) {
    enableTableArrowNavigation(paymentImportGroupListBody, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });
  }

  // btnPaymentDateQuick / btnPaymentDateSearch 이벤트는 공통 모듈이 담당

  const setPaymentFormFromTx = (tx) =>
    setPaymentFormFromTxCore({
      tx,
      paymentFlowRadios,
      updatePaymentDateWeekday,
      getSelectedPaymentFlow,
      cashflowItems,
      cashflowTypes,
      applyPaymentLedgerSelection,
      populatePaymentCounterpartySelectOptions,
      ensureSelectHasOption,
      formatMoney,
      updatePaymentSupplierBalance,
      allCustomers: window._allCustomers,
    });

  bindPaymentActions({
    btnPaymentNew,
    btnPaymentEdit,
    btnPaymentDelete,
    btnPaymentImport,
    getSelectedMainRowId: () => {
      const tbody = document.getElementById("tbody");
      const selected = tbody ? tbody.querySelector("tr.selected") : null;
      return selected ? selected.dataset.id : null;
    },
    setEditId: (id) => {
      state.editId = id;
    },
    primePaymentEntrySelectData,
    populatePaymentLedgerSelectOptions,
    populatePaymentCounterpartySelectOptions,
    getSelectedPaymentFlow,
    openPaymentModal,
    resetFilters: () => {
      state.editId = null;
      window._mainTxFilterCode = "";
      selectedCashflowCodeFilter = "";
      selectedCashflowTypeForEntry = "";
    },
    render,
    refreshCashflowSummary,
    getAllLedgerTx,
    getTransactions,
    deleteLedgerTxById,
    deleteTransaction,
    isPaymentLinkedTransaction,
    setPaymentFormFromTx,
    loadImportVendorPrefs,
    updatePaymentImportSelectedAccountLabel,
    openPaymentImportModal,
    ensureCustomersForPickerLoaded,
    paymentImportTextarea,
    paymentImportResultBody,
    paymentImportCountSpan,
    paymentImportStatus,
    btnPaymentImportParse,
    btnPaymentImportSave,
    getSelectedCashflowTypeForEntry: () => selectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry: () => selectedCashflowItemForEntry,
  });

  const btnPaymentLedgerPicker = document.getElementById(
    "btn-payment-ledger-display",
  );
  const entrySelect = document.getElementById("payment-entry-counterparty");

  bindPaymentEntryPicker({
    btnPaymentEntryChooseCustomer,
    btnPaymentEntryChooseLedger,
    btnPaymentEntryChoiceClose,
    paymentEntryDisplayButton,
    btnPaymentLedgerPicker,
    headerDateInput,
    paymentLedgerSelect,
    entrySelect,
    paymentFlowRadios,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    cashflowTypes,
    closePaymentEntryChoiceModal,
    openPaymentEntryChoiceModal,
    openPaymentLedgerModalForLedgerSelect,
    ensureCustomersForPickerLoaded,
    updatePaymentImportCurrentRecord,
    renderPaymentImportTypeList,
    renderPaymentImportGroupList,
    renderPaymentImportCustomerList,
    openPaymentImportCustomerModal,
    updatePaymentDateWeekday,
    syncPaymentEntryDateTime,
    getSelectedPaymentFlow,
    primePaymentEntrySelectData,
    populatePaymentCounterpartySelectOptions,
    syncCounterpartyCodeFromSelect,
    updatePaymentLedgerTitleByFlow,
    updateLedgerRowsByFlow,
    syncLedgerCodeFromSelect,
    ensureSelectHasOption,
    setCustomerPickerMode: (next) => {
      customerPickerMode = next;
    },
    setEntryItemTargetInput: (next) => {
      entryItemTargetInput = next;
    },
    setTransferFromLedgerInput: (next) => {
      transferFromLedgerInput = next;
    },
    setTransferToLedgerInput: (next) => {
      transferToLedgerInput = next;
    },
    setEntryCounterpartyLedgerCode: (next) => {
      entryCounterpartyLedgerCode = next;
    },
    setEntryCounterpartyLedgerLabel: (next) => {
      entryCounterpartyLedgerLabel = next;
    },
    setImportCustomerFilterType: (next) => {
      importCustomerFilterType = next;
    },
    setImportCustomerFilterGroup: (next) => {
      importCustomerFilterGroup = next;
    },
    setSelectedCashflowItemForEntry: (next) => {
      selectedCashflowItemForEntry = next;
    },
  });

  // 모달 안의 "닫기" 버튼으로 거래 입력 모달을 닫는다.

  // 거래 입력 모달 저장(form submit) 이벤트 바인딩
  const paymentForm = document.getElementById("payment-form");
  bindPaymentForm({
    paymentForm,
    btnPaymentSaveContinue,
    btnPaymentFormClose,
    getEditId: () => state.editId,
    setEditId: (id) => {
      state.editId = id;
    },
    getSelectedPaymentFlow,
    cashflowTypes,
    cashflowItems,
    getEntryCounterpartyLedgerCode: () => entryCounterpartyLedgerCode,
    getEntryCounterpartyLedgerLabel: () => entryCounterpartyLedgerLabel,
    resetEntryCounterpartyLedger: () => {
      entryCounterpartyLedgerCode = "";
      entryCounterpartyLedgerLabel = "";
    },
    inferLedgerPaymentMethod,
    ensureLedgerTxKeys,
    putLedgerTx,
    getTransactions,
    deleteTransaction,
    saveVendorTransactionIfMatched,
    saveSalesTransactionIfMatched,
    confirmDuplicateLedgerBatchBeforeSave,
    parseNumber,
    getSelectedOptionText,
    stripCodePrefix,
    todayYMD,
    paymentModalManager,
    render,
    refreshCashflowSummary,
    resetFieldsAndFocus,
    closePaymentModal,
  });

  bindPaymentImportManager({
    paymentImportResultBody,
    btnPaymentImportParse,
    btnPaymentImportSave,
    btnPaymentImportClose,
    btnPaymentImportDelete,
    btnPaymentImportLedgerPicker,
    openLedgerPicker,
    IMPORT_MODE_NORMAL,
    IMPORT_MODE_TRANSFER,
    getImportRecords: () => importRecords,
    setImportRecords: (next) => {
      importRecords = next;
    },
    setCurrentImportLedgerIndex: (idx) => {
      currentImportLedgerIndex = idx;
    },
    setCurrentImportCustomerIndex: (idx) => {
      currentImportCustomerIndex = idx;
    },
    setCustomerPickerMode: (mode) => {
      customerPickerMode = mode;
    },
    setImportCustomerFilterType: (value) => {
      importCustomerFilterType = value;
    },
    setImportCustomerFilterGroup: (value) => {
      importCustomerFilterGroup = value;
    },
    openPaymentLedgerModalForLedgerSelect,
    openPaymentImportCustomerModal,
    updatePaymentImportCurrentRecord,
    renderPaymentImportTypeList,
    renderPaymentImportGroupList,
    renderPaymentImportCustomerList,
    renderPaymentImportTable,
    parsePaymentImportRaw,
    getSelectedCashflowTypeForEntry: () => selectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry: () => selectedCashflowItemForEntry,
    setSelectedCashflowTypeForEntry: (next) => {
      selectedCashflowTypeForEntry = next;
    },
    setSelectedCashflowItemForEntry: (next) => {
      selectedCashflowItemForEntry = next;
    },
    cashflowTypes,
    cashflowItems,
    getCustomers,
    addTransaction,
    putLedgerTx,
    ensureLedgerTxKeys,
    inferLedgerPaymentMethod,
    normalizeVendorName,
    buildLinkedTransactionMemo,
    findSupplierForVendor,
    findCustomerForVendor,
    getImportVendorPrefs: () => importVendorPrefs,
    setImportVendorPrefs: (next) => {
      importVendorPrefs = next;
    },
    saveImportVendorPrefs,
    render,
    refreshCashflowSummary,
    paymentImportModalManager,
    closePaymentImportModal,
    updatePaymentImportSelectedAccountLabel,
    paymentImportStatus,
    ensureCustomersForPickerLoaded,
    // 중복 저장 경고(커스텀 모달)
    openPaymentDupWarningModal,
    // 중복삭제(=중복 건 제외 저장)를 위해 기존 저장분 조회
    getAllLedgerTx,
    getTransactions,
    deleteLedgerTxById,
    deleteTransaction,
    confirmAnyDuplicateLedgerBatchesBeforeSave,
    confirmAnyDuplicateSimplePaymentTransactionsBeforeSave,
    findAnyDuplicateLedgerBatchesBeforeSave,
    findAnyDuplicateSimplePaymentTransactionsBeforeSave,
  });

  // 거래 인식용 거래처 선택 모달 이벤트
  bindPaymentImportCustomerPicker({
    btnPaymentImportCustomerClose,
    btnPaymentImportCustomerReset,
    paymentImportCustomerSearch,
    paymentImportCustomerListBody,
    paymentImportTypeListBody,
    paymentImportGroupListBody,
    closePaymentImportCustomerModal,
    updatePaymentImportCurrentRecord,
    renderPaymentImportTypeList,
    renderPaymentImportGroupList,
    renderPaymentImportCustomerList,
    getCustomerPickerMode: () => customerPickerMode,
    setCustomerPickerMode: (mode) => {
      customerPickerMode = mode;
    },
    applyImportCustomerSelection,
    getEntryItemTargetInput: () => entryItemTargetInput,
    setEntryItemTargetInput: (next) => {
      entryItemTargetInput = next;
    },
    importCustomers,
    getImportCustomers: () => importCustomers,
    ensureSelectHasOption,
    updatePaymentSupplierBalance,
    setImportCustomerFilterType: (value) => {
      importCustomerFilterType = value;
    },
    setImportCustomerFilterGroup: (value) => {
      importCustomerFilterGroup = value;
    },
  });

  const qInput = document.getElementById("q");
  bindPaymentFilters({
    qInput,
    dateFromInput,
    dateToInput,
    state,
    render,
    attachSearchInput,
    initDateFilter,
    dateFilterOptions: {
      fromInputId: "payment-date-from",
      toInputId: "payment-date-to",
      quickBtnId: "btn-payment-date-quick",
      searchBtnId: "btn-payment-date-search",
      modalId: "payment-date-quick-modal",
      allBtnId: "btn-payment-date-quick-all",
      closeBtnId: "btn-payment-date-quick-close",
      defaultRangeKey: "thisYear",
    },
  });

  bindCashflowSummaryEvents({
    cashflowTypeSwitchButtons,
    cashflowSelect,
    btnCashflowReset,
    getCashflowSummaryFlowFilter: () => cashflowSummaryFlowFilter,
    setCashflowSummaryFlowFilter: (value) => {
      cashflowSummaryFlowFilter = value;
    },
    setSelectedCashflowCodeFilter: (value) => {
      selectedCashflowCodeFilter = value;
    },
    setSelectedCashflowTypeForEntry: (value) => {
      selectedCashflowTypeForEntry = value;
      // 구분(타입)을 새로 선택하면, 하단 장부목록 선택은 초기화한다.
      selectedCashflowItemForEntry = "";
      applySelectedLedgerItemToEntryAndImport();
    },
    setMainTxFilterCode: (value) => {
      window._mainTxFilterCode = value;
    },
    updateCashflowTypeButtons,
    rebuildCashflowSummaryOptions,
    render,
  });

  // 통합 결제 - 기간 빠른 선택 모달 내부 버튼들은 공통 모듈(date-filter.js)이 담당
}
/* =========================
  시작
========================= */
(async function init() {
  bind();
  // 레거시 통합결제 DB(halla_ledger_db_v1)의 tx 데이터를
  // hallapa_db의 ledger_tx 스토어로 한 번만 옮긴다.
  await migrateLegacyLedgerTxIfNeeded();
  // 기본 마스터 입력은 수동 실행(관리/개발용)으로만 수행
  // payment 화면에서 생성된 ledger_tx 들의 키 세트를 표준화한다.
  await backfillLedgerTxStandardKeysIfMissing();
  // 수동 입력/인식 저장 모두 fingerprint로 중복을 막기 위해, 기존 데이터에도 fingerprint를 채운다.
  await backfillLedgerTxFingerprintsIfMissing();
  // 마스터 로드(장부구분/장부명)를 먼저 수행한 뒤,
  // 기존 데이터의 장부명(cashflowItem) 누락분을 가능한 범위에서 자동 보정한다.
  await refreshCashflowSummary();
  await repairLedgerTxCashflowItemFieldsIfNeeded({ debug: DEBUG_BACKFILL });
  await render();

  installDbAutoRefresh({
    refresh: async () => {
      await refreshCashflowSummary();
      await render();
    },
    isBusy: () => document.body.classList.contains("modal-open"),
  });
})();

