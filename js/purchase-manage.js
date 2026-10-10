import {
  getTransactions,
  addTransaction,
  saveTransactionBatch,
  updateTransaction,
  deleteTransaction,
  getCustomers,
  getCustomerGroups,
  getItems,
  getItemGroups,
  updateItem,
  getLedgerTxById,
  putLedgerTx,
  deleteLedgerTxById,
  getCashflowItems,
  getCashflowTypes,
} from "./db.js?v=app-20261010-18";
import { sortByKey } from "./common/sortTable.js?v=app-20261010-18";
import { applySupplierGroupFilter } from "./common/supplier-group-filter.js?v=app-20261010-18";
import { getStoredString, setStoredString } from "./common/storage.js?v=app-20261010-18";
import { installDbAutoRefresh } from "./common/app-events.js?v=app-20261010-18";
import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  createFormDirtyTracker,
  wrapDirtyClose,
  enableTableArrowNavigation,
  bindDblClickRowEdit,
  bindDblClickRowConfirm,
  bindClickRowSelect,
  attachSearchInput,
  bindPickerOpenTriggers,
  applyPickedSupplierSelectionToContext,
  resetFieldsAndFocus,
  createScrollToBottomOnce,
} from "./common/ui-helpers.js?v=app-20261010-18";
import {
  todayYMD,
  formatWeekdayLabel,
  formatMoney,
  formatQuantity,
  includesIgnoreCase,
  isPaymentLinkedTransaction,
  stripCodePrefix,
  resolveDefaultCashflowNameByCode,
  buildLedgerMemoFields,
  amountClassBySign,
} from "./common/util.js?v=app-20261010-18";
import { initDateFilter } from "./common/date-filter.js?v=app-20261010-18";
import { bootstrapPageCommon } from "./common/page-bootstrap.js?v=app-20261010-18";
import { ensureLedgerTxKeys } from "./common/ledger-tx-normalizer.js?v=app-20261010-18";
import { repairLedgerTxCashflowItemFieldsIfNeeded } from "./common/ledger-tx-cashflowitem-repair.js?v=app-20261010-18";
import { openLedgerPicker } from "./common/ledger-picker.js?v=app-20261010-18";
import {
  isLockedByPaymentLedger,
  hasLockedPaymentEntries,
  deleteLinkedLedgerTxIfAny,
} from "./common/payment-ledger-helpers.js?v=app-20261010-18";
import {
  isPaymentOnlyTransaction,
  makeSummaryKeyForTransaction,
} from "./common/transaction-summary-key.js?v=app-20261010-18";
import { loadCashflowLedgerOptionsIntoSelects } from "./common/cashflow-ledger-options.js?v=app-20261010-18";
import { resolveCashflowItemSelectionOrThrow } from "./common/cashflow-item-helpers.js?v=app-20261010-18";
import { saveCashflowLedgerLinkedPaymentRecord } from "./common/cashflow-payment-record.js?v=app-20261010-18";
import {
  bindExcelDropdown,
  requireXLSXOrAlert,
  ymdCompact,
  safeSheetName,
} from "./common/excel-export.js?v=app-20261010-18";
import {
  getActiveCustomersByType,
  parseNumberLike,
  confirmDuplicateBatchBeforeSave,
} from "./common/transaction-shared.js?v=app-20261010-18";
import { createEntryTableManager } from "./common/entry-table-manager.js?v=app-20261010-18";

bootstrapPageCommon({ page: "purchase", todayYMD, formatWeekdayLabel });

let cashflowItemNameByCode = new Map();
let cashflowTypeNameByCode = new Map();

function resolveLedgerLabelFromCode(code) {
  const c = String(code || "").trim();
  if (!c) return "";
  if (cashflowItemNameByCode && cashflowItemNameByCode.has(c)) {
    return String(cashflowItemNameByCode.get(c) || "").trim();
  }
  if (cashflowTypeNameByCode && cashflowTypeNameByCode.has(c)) {
    return String(cashflowTypeNameByCode.get(c) || "").trim();
  }
  return resolveDefaultCashflowNameByCode(c) || "";
}

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

// 이 스크립트는 "매입 관리" 화면 전용 스크립트이다.
const pageMode = "purchase";
// 거래 카테고리: 매입 페이지는 purchase 고정
const transactionCategory = "purchase";

// 거래처 타입 라벨 (매입처)
const supplierTypeLabel = "매입처";

const listBody = document.getElementById("purchase-list");
const searchInput = document.getElementById("purchase-search");
const countSpan = document.getElementById("purchase-count");
const summaryTotalAmountSpan = document.getElementById("purchase-total-amount");
const summaryTotalPaymentSpan = document.getElementById(
  "purchase-total-payment",
);
const summaryTotalBalanceSpan = document.getElementById(
  "purchase-total-balance",
);
const entryCountSpan = document.getElementById("purchase-entry-count");
const entryQtySumSpan = document.getElementById("purchase-entry-qty-sum");
const entryAmountSumSpan = document.getElementById("purchase-entry-amount-sum");
const tableHeader = document.querySelector(".purchase-table thead");

// 저장/조회 등으로 목록이 갱신될 때, 필요 시 1회만 강제 스크롤(결제관리 패턴 공통화)
const purchaseListAutoScroll = createScrollToBottomOnce();

// 금액 색상 공통 처리(부호/강제 규칙)
if (summaryTotalAmountSpan) {
  summaryTotalAmountSpan.dataset.amountColor = "1";
  summaryTotalAmountSpan.dataset.amountForce = "minus";
}
if (summaryTotalPaymentSpan) {
  summaryTotalPaymentSpan.dataset.amountColor = "1";
  summaryTotalPaymentSpan.dataset.amountForce = "minus";
}
if (summaryTotalBalanceSpan) {
  summaryTotalBalanceSpan.dataset.amountColor = "1";
}
if (entryAmountSumSpan) {
  entryAmountSumSpan.dataset.amountColor = "1";
  entryAmountSumSpan.dataset.amountForce = "minus";
}

const btnNew = document.getElementById("btn-purchase-new");
const btnImportOpen = document.getElementById("btn-purchase-import");
const btnExcelToggle = document.getElementById("btn-purchase-excel-toggle");
const btnPaymentNew = document.getElementById("btn-purchase-payment");
const btnEdit = document.getElementById("btn-purchase-edit");
const btnDelete = document.getElementById("btn-purchase-delete");

const excelDropdownWrap = document.getElementById("purchase-excel-dropdown");
const excelMenu = document.getElementById("purchase-excel-menu");
const btnExcelExportScreen = document.getElementById(
  "btn-purchase-excel-export-screen",
);

const modal = document.getElementById("purchase-modal");
const modalTitle = document.getElementById("purchase-modal-title");
const btnModalClose = document.getElementById("btn-purchase-form-close");
const btnSaveContinue = document.getElementById("btn-purchase-save-continue");
const btnModalDelete = document.getElementById("btn-purchase-delete-modal");
const form = document.getElementById("purchase-form");
const dateInput = document.getElementById("purchase-date");
const dateWeekdaySpan = document.getElementById("purchase-date-weekday");
// (deprecated) purchase-date-inline 입력은 현재 HTML에 없음
const dateInlineInput = null;
const supplierSelect = document.getElementById("purchase-supplier-select");
const supplierInput = document.getElementById("purchase-supplier");
const itemSelect = document.getElementById("purchase-item-select");
// 매입 품목 입력 테이블은 행별 동일 마크업(view+edit)이며,
// 현재 선택된 행(is-active)의 컨트롤을 아래 전역 변수에 바인딩해 기존 로직을 재사용한다.
let itemInput = null;
let itemCodeInput = null;
let specInput = null;
let unitInput = null;
let qtyInput = null;
let unitPriceInput = null;
let shrinkPercentInput = null;
let shrinkPriceInput = null;
let marginInput = null;
let marginRateInput = null;
const taxTypeSelect = document.getElementById("purchase-tax-type");
let amountInput = null;
const warehouseInput = document.getElementById("purchase-warehouse");
// (deprecated) purchase-memo 입력은 현재 HTML에 없음
const memoInput = null;
const supplierBalanceInput = document.getElementById(
  "purchase-supplier-balance",
);
// (deprecated) 좌측 분류/힌트 테이블 UI는 select 기반으로 변경됨
const groupListBody = null;
const groupHint = null;
const btnGroupReset = document.getElementById("btn-purchase-group-reset");
const groupSelect = document.getElementById("purchase-group-select");
const supplierListBody = document.getElementById("purchase-supplier-list");
const supplierListHeader = document.querySelector(
  "table.purchase-supplier-table thead",
);
// (deprecated) 거래처 합계 표시 요소는 현재 HTML에 없음
const supplierTotalSpan = null;
const typeSwitchButtons = document.querySelectorAll(
  ".purchase-type-switch .type-switch-btn",
);
const importModal = document.getElementById("purchase-import-modal");
const importTextarea = document.getElementById("purchase-import-raw");
const btnImportParse = document.getElementById("btn-purchase-import-parse");
const btnImportSave = document.getElementById("btn-purchase-import-save");
const btnImportContinue = document.getElementById(
  "btn-purchase-import-continue",
);
const btnImportClose = document.getElementById("btn-purchase-import-close");
const btnImportDelete = document.getElementById("btn-purchase-import-delete");
const importResultBody = document.getElementById("purchase-import-result-body");
const importTable = document.querySelector("table.purchase-import-table");
const importCountSpan = document.getElementById("purchase-import-count");
const importQtySpan = document.getElementById("purchase-import-qty");
const importAmountSpan = document.getElementById("purchase-import-amount");
const importStatus = document.getElementById("purchase-import-status");

if (importAmountSpan) {
  importAmountSpan.dataset.amountColor = "1";
  importAmountSpan.dataset.amountForce = "minus";
}
// 매입 인식 모달 상단 헤더용 요소들
const importDateInput = document.getElementById("purchase-import-date");
const importDateWeekdaySpan = document.getElementById(
  "purchase-import-date-weekday",
);
// (deprecated) purchase-import-kind select는 현재 HTML에 없음
const importKindSelect = null;
const importSupplierSelect = document.getElementById(
  "purchase-import-supplier-select",
);
const importSupplierInput = document.getElementById("purchase-import-supplier");
const importSupplierBalanceInput = document.getElementById(
  "purchase-import-supplier-balance",
);

// 거래처 입력칸은 직접 입력 대신 모달 선택을 사용한다.
if (supplierInput) supplierInput.readOnly = true;
if (importSupplierInput) importSupplierInput.readOnly = true;
const entryBody = document.getElementById("purchase-entry-body");
const entryWrapper = document.querySelector(
  "#purchase-modal .purchase-entry-box .table-wrapper",
);
const entryRowTemplate = document.getElementById("purchase-entry-row-template");
// 품목 선택 모달(purchase-item-*)은 ensureCommonPickerModals()가 동적으로 주입한다.
const itemSelectModal = document.getElementById("purchase-item-modal");
const itemSelectListBody = document.getElementById("purchase-item-list");
const itemGroupListBody = document.getElementById("purchase-item-group-list");
const itemSelectSearchInput = document.getElementById("purchase-item-search");
const btnItemSelectConfirm = document.getElementById("btn-purchase-item-confirm");
const btnItemSelectClose = document.getElementById("btn-purchase-item-close");
let btnItemPicker = null;
let itemHistorySelect = null;

// 매입 인식 모달 상단(매입처 선택) - 거래처 선택 모달(분류/거래처 2단)
const importSupplierPickerModal = document.getElementById(
  "purchase-supplier-picker-modal",
);
const importSupplierPickerGroupListBody = document.getElementById(
  "purchase-supplier-picker-group-list",
);
const importSupplierPickerListBody = document.getElementById(
  "purchase-supplier-picker-list",
);
const btnImportSupplierPickerConfirm = document.getElementById(
  "btn-purchase-supplier-picker-confirm",
);
const btnImportSupplierPickerClose = document.getElementById(
  "btn-purchase-supplier-picker-close",
);
const dateFilterFromInput = document.getElementById("purchase-date-from");
const dateFilterToInput = document.getElementById("purchase-date-to");
const btnDateSearch = document.getElementById("btn-purchase-date-search");
const btnDateQuick = document.getElementById("btn-purchase-date-quick");
const dateQuickModal = document.getElementById("purchase-date-quick-modal");

// 상단 "이 내역" 요약 박스 요소들 (전표 목록용)
const purchaseSummaryBox = document.querySelector(".purchase-summary-box");
const purchaseSummaryBody = document.getElementById("purchase-summary-body");

// 상단 요약표도 결제관리처럼 "필요 시 1회" 최신 내역이 보이도록 강제 스크롤
const purchaseSummaryAutoScroll = createScrollToBottomOnce();

// 요약 목록: 더블클릭으로 수정 모달/전표 수정 진입(공통 위임)
if (purchaseSummaryBody) {
  bindDblClickRowEdit(purchaseSummaryBody, {
    rowSelector: 'tr.purchase-summary-has-data',
    onEdit: async (row) => {
      if (String(row?.dataset?.isCarryOver || '') === '1') return;
      // row.click()으로 currentSummaryKey/currentSummaryBatchKey 등이 먼저 세팅된 뒤 실행된다.
      if (currentSummaryKey && currentSummaryKey.startsWith('PAY__')) {
        // 지불 전표 수정
        if (typeof btnEdit?.click === 'function') {
          btnEdit.click();
        }
        return;
      }
      await startBatchEditFromSummary();
    },
  });
}

// 매입 화면 전용 지불등록 모달 요소들
const purchasePaymentModal = document.getElementById("purchase-payment-modal");
const purchasePaymentModalTitle = document.getElementById(
  "purchase-payment-modal-title",
);
const purchasePaymentForm = document.getElementById("purchase-payment-form");
const purchasePaymentDateInput = document.getElementById(
  "purchase-payment-date",
);
const purchasePaymentSupplierSelect = document.getElementById(
  "purchase-payment-supplier-select",
);
const purchasePaymentSupplierInput = document.getElementById(
  "purchase-payment-supplier",
);
const purchasePaymentAccountSelect = document.getElementById(
  "purchase-payment-account",
);
const purchasePaymentAccountCodeInput = document.getElementById(
  "purchase-payment-account-code",
);
const purchasePaymentAmountInput = document.getElementById(
  "purchase-payment-amount",
);
const purchasePaymentDiscountInput = document.getElementById(
  "purchase-payment-discount",
);
const purchasePaymentMemoInput = document.getElementById(
  "purchase-payment-memo",
);
const btnPurchasePaymentClose = document.getElementById(
  "btn-purchase-payment-close",
);
const btnPurchasePaymentSaveContinue = document.getElementById(
  "btn-purchase-payment-save-continue",
);

// 매입 등록 모달 상단 인라인 지불 박스 요소들
const inlineLedgerNameSelect = document.getElementById(
  "purchase-inline-ledger-name",
);
const inlineLedgerCodeInput = document.getElementById(
  "purchase-inline-ledger-code",
);
const inlineLedgerAmountInput = document.getElementById(
  "purchase-inline-ledger-amount",
);
const inlineLedgerMemoInput = document.getElementById(
  "purchase-inline-ledger-memo",
);

// 왼쪽 거래처 목록에서 현재 선택된 매입처/분류를 기억해 두었다가
// "매입 등록" 모달을 열 때 기본값으로 사용한다.
let currentSelectedSupplierId = "";
let currentSelectedSupplierGroupName = "";

// 상단 요약 박스와 상세내역 간 연동 상태
let currentSummaryBatchKey = "";
let currentSummaryDateForFilter = "";
let currentSummarySupplierIdForFilter = "";
let currentSummaryKey = "";
let isSummaryFilterActive = false;

// 지불(결제) 모달 수정 모드에서 사용하는 편집 대상 전표 id
let currentPurchasePaymentEditingId = null;

function syncPurchasePaymentAccountEnablement() {
  const amount = Number(purchasePaymentAmountInput?.value || 0);
  const discount = Number(purchasePaymentDiscountInput?.value || 0);
  const isDiscountOnly = !(amount > 0) && discount > 0;

  if (purchasePaymentAccountSelect) {
    purchasePaymentAccountSelect.disabled = isDiscountOnly;
    if (isDiscountOnly) {
      purchasePaymentAccountSelect.value = "";
    }
  }
  if (purchasePaymentAccountCodeInput) {
    purchasePaymentAccountCodeInput.disabled = isDiscountOnly;
    if (isDiscountOnly) {
      purchasePaymentAccountCodeInput.value = "";
    }
  }
}

if (purchasePaymentAmountInput) {
  purchasePaymentAmountInput.addEventListener("input", () => {
    syncPurchasePaymentAccountEnablement();
  });
}

if (purchasePaymentDiscountInput) {
  purchasePaymentDiscountInput.addEventListener("input", () => {
    syncPurchasePaymentAccountEnablement();
  });
}

function syncPurchasePaymentSupplierUI({ supplierId, supplierName } = {}) {
  const code = supplierId == null ? "" : String(supplierId).trim();
  const name = supplierName == null ? "" : String(supplierName).trim();

  if (purchasePaymentSupplierInput) {
    purchasePaymentSupplierInput.value = code;
    purchasePaymentSupplierInput.readOnly = Boolean(code);
  }

  if (!purchasePaymentSupplierSelect) return;

  const hasDirect = Array.from(purchasePaymentSupplierSelect.options || []).some(
    (o) => String(o.value) === "",
  );
  if (!hasDirect) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "직접입력";
    purchasePaymentSupplierSelect.insertBefore(
      opt,
      purchasePaymentSupplierSelect.firstChild || null,
    );
  }

  if (code) {
    const exists = Array.from(purchasePaymentSupplierSelect.options || []).some(
      (o) => String(o.value) === code,
    );
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name || code;
      purchasePaymentSupplierSelect.appendChild(opt);
    }
    purchasePaymentSupplierSelect.value = code;
  } else {
    purchasePaymentSupplierSelect.value = "";
  }
}

// 전표(묶음) 요약 목록 캐시
let purchaseSummaries = [];
// 전체 내역(거래처 필터 없음) + 시작일 필터 사용 시,
// 기간 종료 기준 "모든 거래처 잔액 합계"를 별도로 계산해 tfoot 잔액에 사용한다.
let overallSummaryFinalBalanceTotal = null;

// 왼쪽 거래처 선택으로 상세/요약을 필터링할 때 사용할 현재 거래처 ID
let currentSupplierFilterId = "";
// 거래처 또는 전체보기를 클릭하기 전에는 거래내역을 조회하지 않는다.
let transactionViewRequested = false;

// 왼쪽 거래처 목록 정렬(코드/거래처명)
let supplierListSort = { key: "id", direction: "asc" };

let purchases = [];
let allCustomers = [];
let customerGroupMasters = [];
let suppliers = [];
let items = [];
let currentEditingId = null;
// 결제관리와 동일하게: 과거 → 현재(asc) 순서로 보여서 최신이 아래에 오도록 한다.
let currentSort = { key: "date", direction: "asc" };
const supplierGroupMap = new Map();
let supplierGroups = [];
const PURCHASE_GROUP_FILTER_STORAGE_KEY = "hallapa.purchase.selectedSupplierGroup";
let selectedSupplierGroup = getStoredString(
  PURCHASE_GROUP_FILTER_STORAGE_KEY,
  "",
);
// 기본 거래처 유형은 페이지 모드에 따라 결정
let groupTypeFilter = supplierTypeLabel;
let importRecords = [];

// 매입 인식 결과(표) 편집: 수정모드 스타일 재사용(cell-view/cell-edit + 활성셀)
let importEditorBound = false;
let importActiveIndex = -1;
let importActiveField = "code";

function ensureImportTableEditStyle() {
  if (!importTable) return;
  importTable.classList.add("purchase-entry-table");
  importTable.classList.add("tx-entry-table");
}

function getImportFieldOrder() {
  return ["code", "name", "spec", "unit", "qty", "unitPrice", "total"];
}

function normalizeImportNumberSigned(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function normalizeImportNumberAbs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n);
}

function syncImportCellByModel(tr, rec, field) {
  if (!tr || !rec) return;
  const td = tr.querySelector(`td[data-field="${field}"]`);
  if (!td) return;

  const view = td.querySelector(`[data-view="${field}"]`) || td.querySelector(".cell-view");
  const input = td.querySelector(`[data-field="${field}"]`);

  const viewText = () => {
    if (field === "qty") return formatQuantity(rec.qty);
    if (field === "unitPrice") return formatMoney(rec.unitPrice);
    if (field === "total") return formatMoney(rec.total);
    return String(rec[field] ?? "");
  };

  if (view) view.textContent = viewText();
  if (input instanceof HTMLInputElement) {
    if (field === "qty") input.value = String(Number(rec.qty || 0));
    else if (field === "unitPrice") input.value = String(Number(rec.unitPrice || 0));
    else if (field === "total") input.value = String(Number(rec.total || 0));
    else input.value = String(rec[field] ?? "");
  }
}

function applyImportActiveStyles() {
  if (!importResultBody) return;
  const rows = Array.from(importResultBody.querySelectorAll("tr.purchase-entry-row"));
  if (!rows.length) return;

  const safeIndex = Math.max(0, Math.min(importActiveIndex, rows.length - 1));
  importActiveIndex = safeIndex;
  const fieldOrder = getImportFieldOrder();
  if (!fieldOrder.includes(importActiveField)) importActiveField = fieldOrder[0];

  rows.forEach((tr, i) => {
    const isActive = i === importActiveIndex;
    tr.classList.toggle("is-active", isActive);
    tr.classList.toggle("is-selected", isActive);
    tr.querySelectorAll("td.is-cell-active").forEach((td) => td.classList.remove("is-cell-active"));
    if (!isActive) return;
    const td = tr.querySelector(`td[data-field="${importActiveField}"]`);
    if (td) td.classList.add("is-cell-active");
  });

  const activeTr = rows[importActiveIndex];
  const tdActive = activeTr?.querySelector("td.is-cell-active") || null;
  const focusable = tdActive?.querySelector("input, select, button") || null;
  if (focusable instanceof HTMLInputElement) {
    setTimeout(() => {
      try {
        focusable.focus();
        focusable.select();
      } catch {
        // ignore
      }
    }, 0);
  }
}

function bindImportTableEditor() {
  if (importEditorBound) return;
  if (!importResultBody) return;
  importEditorBound = true;

  importResultBody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tr = target.closest("tr.purchase-entry-row");
    if (!tr) return;
    const idx = Number(tr.dataset.entryIndex || tr.dataset.index || "0");
    if (!Number.isFinite(idx)) return;

    // 품목 선택(...) 버튼: 인식 결과 행에 품목 마스터를 쉽게 반영
    if (target.closest(".js-item-picker")) {
      importActiveIndex = idx;
      importActiveField = "name";
      applyImportActiveStyles();
      try {
        openItemSelectModal("import", idx);
      } catch {
        // ignore
      }
      return;
    }

    const td = target.closest("td[data-field]");
    if (!td) return;
    const field = String(td.dataset.field || "");
    if (!field) return;

    importActiveIndex = idx;
    importActiveField = field;
    applyImportActiveStyles();
  });

  importResultBody.addEventListener("input", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!(target instanceof HTMLInputElement)) return;
    const field = String(target.dataset.field || "").trim();
    if (!field) return;

    const tr = target.closest("tr.purchase-entry-row");
    if (!tr) return;
    const idx = Number(tr.dataset.entryIndex || tr.dataset.index || "0");
    if (!Number.isFinite(idx) || idx < 0) return;
    const rec = importRecords && importRecords[idx] ? importRecords[idx] : null;
    if (!rec) return;

    if (field === "code") rec.code = String(target.value || "").trim();
    else if (field === "name") rec.name = String(target.value || "").trim();
    else if (field === "spec") rec.spec = String(target.value || "").trim();
    else if (field === "unit") rec.unit = String(target.value || "").trim();
    else if (field === "qty") rec.qty = normalizeImportNumberSigned(target.value);
    else if (field === "unitPrice") rec.unitPrice = normalizeImportNumberAbs(target.value);
    else if (field === "total") {
      rec.total = normalizeImportNumberSigned(target.value);
      rec._totalManual = true;
    }

    const editedKey = field;
    const qty = Number(rec.qty || 0);
    const total = Number(rec.total || 0);

    const shouldInferFromTotal =
      editedKey === "total" || (editedKey === "qty" && rec._totalManual);
    if (shouldInferFromTotal) {
      const inferred = inferRowFromAmount(qty, total, rec.taxType) || {};
      rec.unitPrice = Number(inferred.unitPrice ?? 0) || 0;
      rec.supplyAmount = Number(inferred.supplyAmount ?? 0) || 0;
      rec.taxAmount = Number(inferred.taxAmount ?? 0) || 0;
    } else if (editedKey === "qty" || editedKey === "unitPrice") {
      rec._totalManual = false;
      const amounts = calculateRowAmounts(qty, rec.unitPrice, rec.taxType) || {};
      rec.supplyAmount = Number(amounts.supplyAmount ?? 0) || 0;
      rec.taxAmount = Number(amounts.taxAmount ?? 0) || 0;
      rec.total = normalizeImportNumber(amounts.amount);
    }

    // 입력 중인 필드는 value를 덮어쓰면(예: "0." -> 0) 소수점 입력이 불가능해진다.
    // 편집 중인 필드는 제외하고 나머지만 동기화하고, 편집 필드는 focusout 시점에 동기화한다.
    const keys = ["code", "name", "spec", "unit", "qty", "unitPrice", "total"];
    keys.forEach((k) => {
      if (k === editedKey) return;
      syncImportCellByModel(tr, rec, k);
    });

    refreshImportRowMissingState(tr, rec);
    updateImportSummary(importRecords);
  });

  // 편집 칸에서 포커스가 빠질 때, 해당 칸의 view/value를 최종 동기화한다.
  importResultBody.addEventListener(
    "focusout",
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!(target instanceof HTMLInputElement)) return;
      const field = String(target.dataset.field || "").trim();
      if (!field) return;

      const tr = target.closest("tr.purchase-entry-row");
      if (!tr) return;
      const idx = Number(tr.dataset.entryIndex || tr.dataset.index || "0");
      if (!Number.isFinite(idx) || idx < 0) return;
      const rec = importRecords && importRecords[idx] ? importRecords[idx] : null;
      if (!rec) return;

      syncImportCellByModel(tr, rec, field);
      refreshImportRowMissingState(tr, rec);
      updateImportSummary(importRecords);
    },
    true,
  );

  importResultBody.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.classList.contains("js-item-history")) return;

    const payloadStr = String(target.value || "");
    if (!payloadStr) return;

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return;
    }

    const tr = target.closest("tr.purchase-entry-row");
    if (!tr) return;
    const idx = Number(tr.dataset.entryIndex || tr.dataset.index || "0");
    if (!Number.isFinite(idx) || idx < 0) return;
    const rec = importRecords && importRecords[idx] ? importRecords[idx] : null;
    if (!rec) return;

    importActiveIndex = idx;
    importActiveField = "name";
    applyImportActiveStyles();

    rec.code = String(payload?.itemId || payload?.itemCode || "").trim();
    rec.name = String(payload?.itemName || "").trim();
    rec.spec = String(payload?.itemSpec || "").trim();
    rec.unit = String(payload?.unit || "").trim();
    rec.unitPrice = normalizeImportNumberAbs(payload?.unitPrice);

    if (!(Number(rec.qty) > 0)) rec.qty = 1;
    rec._totalManual = false;

    const qty = Number(rec.qty || 0);
    const amounts = calculateRowAmounts(qty, rec.unitPrice, rec.taxType) || {};
    rec.supplyAmount = Number(amounts.supplyAmount ?? 0) || 0;
    rec.taxAmount = Number(amounts.taxAmount ?? 0) || 0;
    rec.total = normalizeImportNumberSigned(amounts.amount);

    syncImportCellByModel(tr, rec, "code");
    syncImportCellByModel(tr, rec, "name");
    syncImportCellByModel(tr, rec, "spec");
    syncImportCellByModel(tr, rec, "unit");
    syncImportCellByModel(tr, rec, "qty");
    syncImportCellByModel(tr, rec, "unitPrice");
    syncImportCellByModel(tr, rec, "total");

    refreshImportRowMissingState(tr, rec);
    updateImportSummary(importRecords);
  });

  importResultBody.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (e.key !== "Tab") return;
    const tr = target.closest("tr.purchase-entry-row");
    if (!tr) return;
    const td = target.closest("td[data-field]");
    if (!td) return;
    const curField = String(td.dataset.field || "").trim();
    if (!curField) return;

    const fieldOrder = getImportFieldOrder();
    const pos = fieldOrder.indexOf(curField);
    if (pos === -1) return;
    e.preventDefault();

    const idx = Number(tr.dataset.entryIndex || tr.dataset.index || "0");
    if (!Number.isFinite(idx)) return;

    const delta = e.shiftKey ? -1 : 1;
    let nextIndex = idx;
    let nextPos = pos + delta;
    const maxIndex = Math.max(0, (importRecords?.length || 1) - 1);

    if (nextPos < 0) {
      nextIndex = Math.max(0, idx - 1);
      nextPos = fieldOrder.length - 1;
    } else if (nextPos >= fieldOrder.length) {
      nextIndex = Math.min(maxIndex, idx + 1);
      nextPos = 0;
    }

    importActiveIndex = nextIndex;
    importActiveField = fieldOrder[nextPos] || fieldOrder[0];
    applyImportActiveStyles();
  });
}
let pendingEntries = [];
let entryActiveIndex = -1; // 0..pendingEntries.length (마지막은 신규 입력행)
let entryDraftRow = null;
let selectedItemIdForEntry = "";
let itemGroups = [];
let selectedItemGroupFilter = "";
let editingEntryIndex = -1; // 위 임시 행 중 인라인 편집 중인 행 인덱스
let itemApplyMode = "input"; // 품목 선택 모달이 값을 반영할 대상: 'input' | 'inline' | 'import'
let itemApplyEntryIndex = -1; // 'inline' 모드일 때 어느 행에 반영할지 인덱스
let dateFilterFrom = "";
let dateFilterTo = "";
let isBatchEditMode = false; // 상단 전표(요약) 기준 여러 행 수정 모드 여부
let editingBatchOriginalIds = []; // 여러 행 수정 시, 기존 전표에 속한 행들의 id 목록
let editingBatchKey = ""; // 여러 행 수정 시 사용할 batchKey (기존 전표 유지용)
let showInputRowInBatchEdit = false; // 전표 수정 모드에서 맨 아래 새 입력행을 보일지 여부
let purchaseModalEscOff = null;
let purchaseImportModalEscOff = null;

let importSupplierPickerEscOff = null;
let importSupplierPickerSelectedGroupName = "";
let importSupplierPickerSelectedSupplierId = "";
let importSupplierPickerContext = "import"; // 'import' | 'main'

function getImportSupplierPickerBaseList() {
  // 인식 모달은 '매입처'만 선택 대상으로 사용한다.
  return (suppliers || []).filter((c) => (c?.type || "").includes("매입"));
}

function renderImportSupplierPickerGroups() {
  if (!importSupplierPickerGroupListBody) return;
  importSupplierPickerGroupListBody.innerHTML = "";

  const base = getImportSupplierPickerBaseList();
  const names = Array.from(
    new Set(base.map((s) => String(s?.group || "미분류").trim())),
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  if (!names.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>분류가 없습니다.</td>";
    importSupplierPickerGroupListBody.appendChild(tr);
    return;
  }

  names.forEach((name) => {
    const tr = document.createElement("tr");
    tr.dataset.groupName = name;
    tr.innerHTML = `<td>${name}</td>`;
    if (name === importSupplierPickerSelectedGroupName) {
      tr.classList.add("selected");
    }
    importSupplierPickerGroupListBody.appendChild(tr);
  });
}

function renderImportSupplierPickerSuppliers() {
  if (!importSupplierPickerListBody) return;
  importSupplierPickerListBody.innerHTML = "";

  const base = getImportSupplierPickerBaseList();
  const targetGroup = importSupplierPickerSelectedGroupName || "";
  const filtered = targetGroup
    ? base.filter((c) => (c.group || "미분류") === targetGroup)
    : base;

  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="3">해당 분류의 거래처가 없습니다.</td>';
    importSupplierPickerListBody.appendChild(tr);
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"))
    .forEach((c) => {
      const tr = document.createElement("tr");
      tr.dataset.supplierId = c.id || "";
      const bal = getSupplierCurrentBalance(c.id || "");
      const safeBal = Number.isFinite(bal) ? bal : 0;
      tr.innerHTML = `
        <td>${c.id || ""}</td>
        <td>${c.name || ""}</td>
        <td class="col-balance right" data-amount-color="1" data-amount-value="${safeBal}">${formatMoney(safeBal)}</td>
      `;
      if (c.id && c.id === importSupplierPickerSelectedSupplierId) {
        tr.classList.add("selected");
      }
      importSupplierPickerListBody.appendChild(tr);
    });
}

function closeImportSupplierPickerModal() {
  if (!importSupplierPickerModal) return;
  closeModalOverlay(importSupplierPickerModal);
  if (typeof importSupplierPickerEscOff === "function") {
    importSupplierPickerEscOff();
  }
  importSupplierPickerEscOff = null;
}

function confirmImportSupplierPickerSelection() {
  if (!importSupplierPickerSelectedSupplierId) {
    closeImportSupplierPickerModal();
    return;
  }

  const supplier = getImportSupplierPickerBaseList().find(
    (s) => String(s.id) === String(importSupplierPickerSelectedSupplierId),
  );
  if (!supplier) {
    closeImportSupplierPickerModal();
    return;
  }

  const groupName = supplier.group || "미분류";

  if (importSupplierPickerContext === "main") {
    // 메인(매입등록) 헤더에 반영
    // 주의: supplierSelect는 (현재 분류/좌측 선택) 기준으로 옵션이 필터링될 수 있어,
    // 다른 분류의 거래처를 선택하면 value가 옵션에 없어 빈 값으로 떨어질 수 있다.
    // 확정 시에는 선택한 거래처의 분류로 옵션을 재구성한 뒤 값을 반영한다.
    applyPickedSupplierSelectionToContext({
      groupName,
      supplierId: String(supplier.id || ""),
      rebuildSelectOptions: rebuildSupplierSelectForCurrentKind,
      supplierSelect,
      applyFromSelect: applySupplierFromSelect,
    });

    // 지불 모달이 열려있는 경우에도 거래처 표시를 동기화(코드/표시)
    syncPurchasePaymentSupplierUI({
      supplierId: supplier.id || "",
      supplierName: supplier.name || supplier.id || "",
    });

    // 인식 모달에도 같이 맞춰둠(다음에 열었을 때 선택값 유지)
    applyPickedSupplierSelectionToContext({
      groupName,
      supplierId: String(supplier.id || ""),
      kindSelect: importKindSelect,
      rebuildSelectOptions: rebuildImportSupplierSelectForCurrentKind,
      supplierSelect: importSupplierSelect,
      applyFromSelect: applyImportSupplierFromSelect,
    });
  } else {
    // 인식 모달에 반영(기존 동작)
    applyPickedSupplierSelectionToContext({
      groupName,
      supplierId: String(supplier.id || ""),
      kindSelect: importKindSelect,
      rebuildSelectOptions: rebuildImportSupplierSelectForCurrentKind,
      supplierSelect: importSupplierSelect,
      applyFromSelect: applyImportSupplierFromSelect,
    });
  }

  closeImportSupplierPickerModal();
}

// 매입처 선택 모달: 더블클릭=확정(공통 위임)
if (importSupplierPickerListBody) {
  bindDblClickRowConfirm(importSupplierPickerListBody, {
    rowSelector: 'tr[data-supplier-id]',
    onConfirm: (row) => {
      importSupplierPickerSelectedSupplierId = String(row?.dataset?.supplierId || '');
      confirmImportSupplierPickerSelection();
    },
  });

  // 매입처 선택 모달: 클릭=선택(공통 위임)
  bindClickRowSelect(importSupplierPickerListBody, {
    rowSelector: 'tr[data-supplier-id]',
    onSelect: (row) => {
      importSupplierPickerSelectedSupplierId = String(row?.dataset?.supplierId || '');
    },
  });
}

// 매입처 선택 모달(좌측 분류): 클릭=선택(공통 위임)
if (importSupplierPickerGroupListBody) {
  bindClickRowSelect(importSupplierPickerGroupListBody, {
    rowSelector: 'tr[data-group-name]',
    onSelect: (row) => {
      importSupplierPickerSelectedGroupName = String(row?.dataset?.groupName || '');
      importSupplierPickerSelectedSupplierId = '';
      renderImportSupplierPickerGroups();
      renderImportSupplierPickerSuppliers();
    },
  });
}

function openImportSupplierPickerModal() {
  if (!importSupplierPickerModal) return;

  importSupplierPickerContext = "import";

  // 초기 선택값: 현재 인식 모달의 분류/거래처
  importSupplierPickerSelectedGroupName =
    (importKindSelect?.value || "").toString().trim();
  importSupplierPickerSelectedSupplierId =
    (importSupplierSelect?.value || "").toString().trim();

  renderImportSupplierPickerGroups();
  renderImportSupplierPickerSuppliers();

  openModalOverlay(importSupplierPickerModal);
  if (typeof importSupplierPickerEscOff === "function") importSupplierPickerEscOff();
  importSupplierPickerEscOff = registerModalEscClose(
    importSupplierPickerModal,
    closeImportSupplierPickerModal,
  );
}

function openMainSupplierPickerModal() {
  if (!importSupplierPickerModal) return;

  importSupplierPickerContext = "main";

  const selectedId = (supplierSelect?.value || "").toString().trim();
  const selectedSupplier = selectedId
    ? suppliers.find((s) => String(s.id) === String(selectedId))
    : null;
  const seedGroupName = selectedSupplier
    ? String(selectedSupplier.group || "미분류")
    : String(currentSelectedSupplierGroupName || "").trim();

  importSupplierPickerSelectedGroupName = seedGroupName;
  importSupplierPickerSelectedSupplierId = selectedId;

  renderImportSupplierPickerGroups();
  renderImportSupplierPickerSuppliers();

  openModalOverlay(importSupplierPickerModal);
  if (typeof importSupplierPickerEscOff === "function") importSupplierPickerEscOff();
  importSupplierPickerEscOff = registerModalEscClose(
    importSupplierPickerModal,
    closeImportSupplierPickerModal,
  );
}

// 통합결제 Ledger DB(tx)는 hallapa_db의 ledger_tx 스토어를 사용한다.

// (공통 모듈) inferLedgerPaymentMethod / isLockedByPaymentLedger / hasLockedPaymentEntries / deleteLinkedLedgerTxIfAny

// 매입 화면 지불용 통장(입출금 코드) 목록을 모달/인라인 박스에 채우는 공통 헬퍼
async function loadPurchaseLedgerOptions() {
  return loadCashflowLedgerOptionsIntoSelects(
    [purchasePaymentAccountSelect, inlineLedgerNameSelect],
    { placeholder: "통장 선택" },
  );
}

// 매입 화면에서 사용하는 지불 공통 저장 로직
// - 통합결제 Ledger DB(tx)
// - hallapa_db.transactions(매입 결제 전표)
async function savePurchasePaymentRecord({
  date,
  supplierId,
  supplierName,
  supplierGroupName,
  accountCode,
  accountLabel,
  amount,
  paymentDiscount,
  memoText,
}) {
  await saveCashflowLedgerLinkedPaymentRecord({
    actionLabel: "지불",

    date,
    supplierId,
    supplierName,
    supplierGroupName,
    accountCode,
    accountLabel,
    amount,
    paymentDiscount,
    memoText,

    ledgerFlow: "out",
    ledgerEventType: "purchase_payment",
    ledgerSource: "purchase",
    ledgerSupplierId: String(supplierId),

    transactionType: "expense",
    transactionCategory: transactionCategory,
    transactionSource: "purchase",
    includeLedgerName: true,
    memoFallback: "",
  });
}

// 상단 인라인 지불 박스에 값이 들어있으면,
// 현재 매입 모달의 매입처/거래일/통장 정보를 기준으로
// 지불 전표를 함께 저장한다.
async function saveInlinePaymentIfNeeded() {
  if (!inlineLedgerNameSelect || !inlineLedgerAmountInput) return;

  const accountCode = inlineLedgerNameSelect.value || "";
  const amount = Number(inlineLedgerAmountInput.value || "0");

  // 통장과 금액이 모두 제대로 입력되지 않은 경우에는
  // 아무 작업도 하지 않고 조용히 빠져나간다.
  if (!accountCode || !(amount > 0)) return;

  // 매입 모달 상단의 매입처(헤더)를 우선 사용하고,
  // 비어 있으면 왼쪽 거래처 목록에서 선택한 매입처를 fallback 으로 사용한다.
  const headerSupplierId = supplierSelect ? supplierSelect.value || "" : "";
  const supplierId = headerSupplierId || currentSelectedSupplierId || "";

  if (!supplierId) {
    alert("매입처를 먼저 선택한 후 지불을 입력해 주세요.");
    return;
  }

  const supplier = suppliers.find((s) => String(s.id) === String(supplierId));
  const supplierName = supplier
    ? supplier.name || supplier.id || ""
    : supplierInput
      ? supplierInput.value.trim()
      : "";
  const supplierGroupName = supplier ? supplier.group || "미분류" : "미분류";

  const accountLabel = inlineLedgerNameSelect
    ? inlineLedgerNameSelect.options[inlineLedgerNameSelect.selectedIndex]
        ?.text || accountCode
    : accountCode;

  const date = dateInput && dateInput.value ? dateInput.value : todayYMD();

  const memoText = inlineLedgerMemoInput
    ? inlineLedgerMemoInput.value || ""
    : "";

  await savePurchasePaymentRecord({
    date,
    supplierId,
    supplierName,
    supplierGroupName,
    accountCode,
    accountLabel,
    amount,
    memoText,
  });

  alert("지불 내역이 저장되었습니다.");

  // 한 번 저장한 뒤에는 금액을 0으로 초기화해서
  // 중복 저장을 방지한다.
  inlineLedgerAmountInput.value = "0";
  if (inlineLedgerMemoInput) inlineLedgerMemoInput.value = "";
}
const purchaseModalDirty = createFormDirtyTracker(() => ({
  id: currentEditingId,
  date: dateInput ? dateInput.value : "",
  dateInline: dateInlineInput ? dateInlineInput.value : "",
  supplierId: supplierSelect ? supplierSelect.value : "",
  supplierName: supplierInput ? supplierInput.value : "",
  itemId: itemSelect ? itemSelect.value : "",
  itemCode: itemCodeInput ? itemCodeInput.value : "",
  itemName: itemInput ? itemInput.value : "",
  spec: specInput ? specInput.value : "",
  unit: unitInput ? unitInput.value : "",
  qty: qtyInput ? qtyInput.value : "",
  unitPrice: unitPriceInput ? unitPriceInput.value : "",
  taxType: taxTypeSelect ? taxTypeSelect.value : "",
  amount: amountInput ? amountInput.value : "",
  warehouse: warehouseInput ? warehouseInput.value : "",
  memo: memoInput ? memoInput.value : "",
}));
const closePurchaseModalWithConfirm = wrapDirtyClose(
  purchaseModalDirty,
  baseCloseModal,
);

// 매입 인식(붙여넣기) 모달 dirty 추적용
const purchaseImportModalDirty = createFormDirtyTracker(() => ({
  raw: importTextarea ? importTextarea.value : "",
  date: importDateInput ? importDateInput.value : "",
  kind: importKindSelect ? importKindSelect.value : "",
  supplierId: importSupplierSelect ? importSupplierSelect.value : "",
  supplierName: importSupplierInput ? importSupplierInput.value : "",
  records: Array.isArray(importRecords) ? importRecords : [],
}));

function baseCloseImportModal() {
  if (!importModal) return;
  closeModalOverlay(importModal);
  if (typeof purchaseImportModalEscOff === "function") {
    purchaseImportModalEscOff();
    purchaseImportModalEscOff = null;
  }
}

const closeImportModalWithConfirm = wrapDirtyClose(
  purchaseImportModalDirty,
  baseCloseImportModal,
  "붙여넣기 인식 결과가 저장되지 않았습니다. 닫으시겠습니까?",
);

// 특정 품목의 평균가(avgPrice)를 "누적 매입 공급가 합계 / 누적 수량 합계"로 재계산해
// 품목 마스터에 반영한다.
async function recomputeItemAveragePrice(itemId) {
  const safeId = String(itemId || "");
  if (!safeId) return;

  const idx = items.findIndex((it) => String(it.id) === safeId);
  if (idx === -1) return;

  const current = items[idx];
  let avgPrice = Number(current.avgPrice ?? 0) || 0;

  try {
    const allTx = await getTransactions();
    const related = allTx.filter(
      (tx) =>
        tx &&
        tx.category === transactionCategory &&
        String(tx.itemId || "") === safeId,
    );

    let totalQty = 0;
    let totalSupply = 0;
    for (const tx of related) {
      const q = Number(tx.quantity || 0);
      if (!(q > 0)) continue;
      const supplyRaw =
        tx.supplyAmount != null
          ? Number(tx.supplyAmount)
          : Number(tx.unitPrice || 0) * q;
      if (!Number.isFinite(supplyRaw)) continue;
      totalQty += q;
      totalSupply += supplyRaw;
    }

    if (totalQty > 0 && Number.isFinite(totalSupply) && totalSupply > 0) {
      avgPrice = Math.round(totalSupply / totalQty);
    } else {
      avgPrice = 0;
    }
  } catch (e) {
    console.error("평균가 계산 중 오류:", e);
  }

  const updated = { ...current, avgPrice };
  await updateItem(updated);
  items[idx] = updated;
}

// 매입에서 사용된 최종 단가를 품목 마스터(품목관리)에도 반영한다.
// - purchase.itemId 가 있는 경우에만 동작
// - 단가가 0 이하이거나 기존 값과 동일하면 갱신하지 않음
// - 단가가 바뀌면 감량가/소매가/납품가도 현재 감량율·마진율을 기준으로 다시 계산한다.
async function applyPurchasePriceToItemMaster(purchase) {
  if (!purchase || !purchase.itemId) return;

  const itemId = String(purchase.itemId);
  const unitPrice = Number(purchase.unitPrice || 0);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;

  const idx = items.findIndex((it) => String(it.id) === itemId);
  if (idx === -1) return;

  const current = items[idx];
  const currentPrice = Number(current.price ?? 0);
  const purchaseShrinkPercentRaw =
    purchase.shrinkPercent != null ? Number(purchase.shrinkPercent) : null;
  const purchaseShrinkPriceRaw =
    purchase.shrinkPrice != null ? Number(purchase.shrinkPrice) : null;

  // 단가/감량값이 모두 동일하면 갱신하지 않는다.
  // (단, purchase에 감량값이 들어온 경우에는 감량 반영을 위해 단가가 같아도 갱신할 수 있다.)
  const hasIncomingShrink =
    purchase.shrinkPercent != null || purchase.shrinkPrice != null;
  if (currentPrice === unitPrice && !hasIncomingShrink) return;

  // purchase에서 감량율/감량가를 같이 저장하도록 확장했기 때문에,
  // 저장된 값이 있으면 그것을 우선 반영하고, 없으면 기존 마스터 값을 유지한다.
  let shrinkPercent = Number(current.shrinkPercent ?? 0) || 0;
  if (purchaseShrinkPercentRaw != null && Number.isFinite(purchaseShrinkPercentRaw)) {
    // 0은 유효한 값이므로 null/undefined만 제외
    shrinkPercent = purchaseShrinkPercentRaw;
  }

  // 감량가: purchase에 명시값이 있으면 우선, 아니면 (단가, 감량율)로 계산
  let shrinkPrice;
  if (purchaseShrinkPriceRaw != null && Number.isFinite(purchaseShrinkPriceRaw) && purchaseShrinkPriceRaw > 0) {
    shrinkPrice = Math.round(purchaseShrinkPriceRaw);
  } else if (
    Number.isFinite(shrinkPercent) &&
    shrinkPercent > 0 &&
    shrinkPercent < 100
  ) {
    const ratio = 1 - shrinkPercent / 100;
    shrinkPrice = Math.round(unitPrice / ratio);
  } else {
    shrinkPrice = unitPrice;
  }

  const costBase = shrinkPrice > 0 ? shrinkPrice : unitPrice;

  const saleMargin = Number(current.saleMargin ?? 0) || 0;
  const deliveryMargin = Number(current.deliveryMargin ?? 0) || 0;

  const calcPriceFromMargin = (base, margin) => {
    const b = Number(base || 0);
    const m = Number(margin || 0);
    if (!Number.isFinite(b) || b <= 0) return 0;
    if (!Number.isFinite(m)) return b;
    return Math.round(b * (1 + m / 100));
  };

  const salePrice = calcPriceFromMargin(costBase, saleMargin);
  const deliveryPrice = calcPriceFromMargin(costBase, deliveryMargin);

  const updated = {
    ...current,
    price: unitPrice,
    shrinkPercent,
    shrinkPrice,
    salePrice,
    deliveryPrice,
  };

  await updateItem(updated);
  items[idx] = updated;

  // 평균가는 전체 매입 이력을 기준으로 별도 재계산
  await recomputeItemAveragePrice(itemId);
}

// 특정 거래처의 현재 잔액(기초잔액 + 모든 매입/결제 반영)을 계산한다.
// 매입 금액은 잔액을 증가(+), 결제 금액은 감소(-)시키는 규칙을 사용한다.
function getSupplierCurrentBalance(supplierId) {
  if (!supplierId) return 0;

  const sup = suppliers.find((s) => s.id === supplierId);
  const opening =
    Number(sup && sup.openingBalance != null ? sup.openingBalance : 0) || 0;

  const related = purchases.filter((p) => p && p.supplierId === supplierId);
  if (!related.length) return opening;

  let running = opening;
  related
    .filter((p) => p.date)
    .sort((a, b) => {
      const ad = a.date || "";
      const bd = b.date || "";
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      return 0;
    })
    .forEach((p) => {
      const amount = Number(p.amount) || 0;
      const payment = Number(p.payment || 0);
      const discount = Number(p.paymentDiscount || 0);
      // 잔액 = 기초 - 매입합계 + 결제합계
      running -= amount;
      running += payment + discount;
    });

  return running;
}

function baseCloseModal() {
  if (!modal) return;
  closeModalOverlay(modal);

  if (btnModalDelete) {
    btnModalDelete.style.display = "none";
  }

  if (typeof purchaseModalEscOff === "function") {
    purchaseModalEscOff();
    purchaseModalEscOff = null;
  }
}

function openModal(isEdit = false) {
  if (!modal) return;
  openModalOverlay(modal);
  if (modalTitle) {
    modalTitle.textContent = isEdit ? "매입 수정" : "매입 등록";
  }

  // 수정 모드일 때만 모달 안의 삭제 버튼을 노출
  if (btnModalDelete) {
    btnModalDelete.style.display = isEdit ? "" : "none";
  }

  purchaseModalDirty.markClean();
  if (typeof purchaseModalEscOff === "function") purchaseModalEscOff();
  purchaseModalEscOff = registerModalEscClose(
    modal,
    closePurchaseModalWithConfirm,
  );
}

function closeModal() {
  closePurchaseModalWithConfirm();
}

function resetForm() {
  currentEditingId = null;
  editingEntryIndex = -1;
  entryActiveIndex = -1;
  isBatchEditMode = false;
  editingBatchOriginalIds = [];
  editingBatchKey = "";
  showInputRowInBatchEdit = false;
  if (!form) return;
  form.reset();
  dateInput.value = todayYMD();
  if (dateInlineInput) dateInlineInput.value = dateInput.value;
  updateDateWeekday();
  supplierSelect.value = "";
  supplierInput.value = "";
  if (itemSelect) itemSelect.value = "";
  taxTypeSelect.value = "면세";
  warehouseInput.value = "기본창고";
  if (memoInput) memoInput.value = "";
  if (supplierBalanceInput) {
    supplierBalanceInput.value = "0";
    supplierBalanceInput.classList.remove(
      "amount-plus",
      "amount-minus",
      "amount-zero",
    );
    supplierBalanceInput.classList.add("amount-zero");
  }
  updateAmountFields();

  // 입력행으로 쌓인 임시 행들 초기화
  pendingEntries = [];
  entryDraftRow = buildEmptyEntryDraft();
  renderPendingEntryRows();
  updateEntrySummary();
}

function buildEmptyEntryDraft() {
  return {
    date: (dateInlineInput && dateInlineInput.value) || (dateInput && dateInput.value) || todayYMD(),
    itemId: "",
    itemCode: "",
    itemName: "",
    itemSpec: "",
    unit: "",
    quantity: 1,
    unitPrice: 0,
    taxType: taxTypeSelect ? taxTypeSelect.value : "면세",
    supplyAmount: 0,
    taxAmount: 0,
    amount: 0,
    memo: memoInput ? memoInput.value.trim() : "",
  };
}

// 하단 입력 테이블 한 행(tr) 안에서 필드들을 공통 규칙(data-field)으로 찾기 위한 헬퍼
function getEntryFieldsFromRow(tr) {
  if (!tr) return {};
  return {
    itemCode: tr.querySelector('[data-field="itemCode"]'),
    itemName: tr.querySelector('[data-field="itemName"]'),
    spec: tr.querySelector('[data-field="spec"]'),
    unit: tr.querySelector('[data-field="unit"]'),
    qty: tr.querySelector('[data-field="qty"]'),
    unitPrice: tr.querySelector('[data-field="unitPrice"]'),
    amount: tr.querySelector('[data-field="amount"]'),
  };
}

function getTaxRate(type) {
  switch (type) {
    case "과세10%":
      return 0.1;
    default:
      return 0;
  }
}

function updateAmountFields() {
  if (!qtyInput || !unitPriceInput || !amountInput) return;

  const qty = Number(qtyInput.value || "0");
  const unitPrice = Number(unitPriceInput.value || "0");
  const taxType = taxTypeSelect ? taxTypeSelect.value : "면세";
  const { supplyAmount, taxAmount, amount } = calculateRowAmounts(qty, unitPrice, taxType);

  const idx = entryActiveIndex === -1 ? pendingEntries.length : entryActiveIndex;
  const row = getEntryRowModelByIndex(idx);
  if (row) {
    row.quantity = Number.isFinite(qty) ? qty : 0;
    row.unitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
    row.taxType = taxType;
    row.supplyAmount = Number.isFinite(supplyAmount) ? supplyAmount : 0;
    row.taxAmount = Number.isFinite(taxAmount) ? taxAmount : 0;
    row._amountManual = false;
    row.amount = Number.isFinite(amount) ? amount : 0;
  }

  amountInput.value = Number.isFinite(amount) ? amount : 0;
}

function updateEntrySummary() {
  if (!entryCountSpan || !entryQtySumSpan || !entryAmountSumSpan) return;
  const count = pendingEntries.length;
  const sumQty = pendingEntries.reduce(
    (acc, row) => acc + (Number(row.quantity) || 0),
    0,
  );
  const sumAmount = pendingEntries.reduce(
    (acc, row) => acc + (Number(row.amount) || 0),
    0,
  );
  entryCountSpan.textContent = count.toLocaleString();
  entryQtySumSpan.textContent = formatQuantity(sumQty);
  entryAmountSumSpan.textContent = formatMoney(sumAmount);
  entryAmountSumSpan.dataset.amountValue = String(sumAmount);
}
// 현재 하단 입력행에 값이 어느 정도 들어있는지(미저장 상태인지) 판단
function hasCurrentEntryRowData() {
  if (!entryDraftRow) return false;
  return (
    String(entryDraftRow.itemName || "").trim() ||
    String(entryDraftRow.itemCode || "").trim() ||
    String(entryDraftRow.itemSpec || "").trim() ||
    String(entryDraftRow.unit || "").trim() ||
    Number(entryDraftRow.quantity || 0) !== 0 ||
    Number(entryDraftRow.unitPrice || 0) !== 0
  );
}

function getEntryRowModelByIndex(index) {
  if (index === pendingEntries.length) {
    if (!entryDraftRow) entryDraftRow = buildEmptyEntryDraft();
    return entryDraftRow;
  }
  return pendingEntries[index];
}

function setActiveEntryIndex(index) {
  entryTableManager?.setActiveIndex(index);
}

// 하단 임시 행 사이를 방향키로 이동할 때 사용
function movePendingEntrySelection(delta) {
  const total = pendingEntries.length + 1;
  if (!total) return;

  let index = entryActiveIndex;
  if (index === -1) index = pendingEntries.length;
  index += Number(delta) || 0;

  if (index < 0) index = total - 1;
  if (index >= total) index = 0;

  setActiveEntryIndex(index);
}

// 인라인 편집 행에서 수량/단가 변경 시 금액 재계산용 헬퍼
function calculateRowAmounts(quantity, unitPrice, taxType) {
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);
  const supply = Math.round(qty * price);
  const taxRate = getTaxRate(taxType || taxTypeSelect.value);
  const tax = Math.round(supply * taxRate);
  const amount = supply + tax;
  return { supplyAmount: supply, taxAmount: tax, amount };
}

// 합계액(amount=공급가+세액)과 수량을 입력했을 때 단가를 역산
function inferUnitPriceFromAmount(quantity, amount, taxType) {
  const qty = Number(quantity || 0);
  const amt = Number(amount || 0);
  if (!(qty !== 0) || !(amt !== 0)) return 0;
  const taxRate = getTaxRate(taxType || taxTypeSelect.value);
  const denom = 1 + (Number.isFinite(taxRate) ? taxRate : 0);
  const supply = denom > 0 ? Math.round(Math.abs(amt) / denom) : Math.round(Math.abs(amt));
  const unit = supply / Math.abs(qty);
  return Number.isFinite(unit) ? Math.round(unit) : 0;
}

// 합계액(amount)을 입력한 값 그대로 유지하면서 공급가/세액/단가를 역산
function inferRowFromAmount(quantity, amount, taxType) {
  const qty = Number(quantity || 0);
  const amt = Number(amount || 0);
  if (!(qty !== 0) || !(amt !== 0)) {
    return { unitPrice: 0, supplyAmount: 0, taxAmount: 0 };
  }

  const taxRate = getTaxRate(taxType || taxTypeSelect.value);
  const rate = Number.isFinite(taxRate) ? taxRate : 0;
  const denom = 1 + rate;
  const sign = qty < 0 || amt < 0 ? -1 : 1;
  const absAmt = Math.abs(amt);
  const supply = denom > 0 ? Math.round(absAmt / denom) : Math.round(absAmt);
  const tax = Math.round(absAmt - supply);
  const unit = supply / Math.abs(qty);
  return {
    unitPrice: Number.isFinite(unit) ? Math.round(unit) : 0,
    supplyAmount: Number.isFinite(supply) ? sign * supply : 0,
    taxAmount: Number.isFinite(tax) ? sign * tax : 0,
  };
}

function getMissingEntryFieldKeys(row) {
  if (!row) return [];

  // 완전 공란(=입력 시작 전)은 표시하지 않는다.
  const hasAny =
    String(row.itemName || "").trim() ||
    String(row.itemCode || "").trim() ||
    String(row.itemSpec || "").trim() ||
    String(row.unit || "").trim() ||
    Number(row.quantity || 0) !== 0 ||
    Number(row.unitPrice || 0) !== 0 ||
    Number(row.amount || 0) !== 0;
  if (!hasAny) return [];

  const missing = [];
  if (!String(row.itemName || "").trim()) missing.push("itemName");
  if (!String(row.itemSpec || "").trim()) missing.push("spec");
  if (!String(row.unit || "").trim()) missing.push("unit");
  if (Number(row.quantity || 0) === 0) missing.push("qty");
  if (!(Number(row.unitPrice || 0) > 0)) missing.push("unitPrice");
  return missing;
}

// 하단 입력행 위에 쌓이는 임시 행들을 현재 pendingEntries 기준으로 다시 렌더링
// editingEntryIndex에 해당하는 행 바로 아래로 입력행이 올라오도록 배치한다.
function renderPendingEntryRows() {
  entryTableManager?.render();
}

// 공통 엔트리 테이블 매니저(매입/매출 공통)
const entryTableManager = createEntryTableManager({
  entryBody,
  entryRowTemplate,
  getPendingEntries: () => pendingEntries,
  getEntryDraftRow: () => entryDraftRow,
  setEntryDraftRow: (v) => {
    entryDraftRow = v;
  },
  getEntryActiveIndex: () => entryActiveIndex,
  setEntryActiveIndex: (v) => {
    entryActiveIndex = v;
  },
  getShouldRenderDraftRow: () => {
    // 수정 모드에서는 기본적으로 신규 입력(draft) 행을 숨긴다.
    // - 전표 수정(여러 행)에서는 필요 시 showInputRowInBatchEdit로만 허용
    if (isBatchEditMode) return !!showInputRowInBatchEdit;
    if (currentEditingId) return false;
    return true;
  },
  onRequestRenderDraftRow: () => {
    if (!isBatchEditMode) return false;
    if (showInputRowInBatchEdit) return false;
    showInputRowInBatchEdit = true;
    return true;
  },
  buildEmptyEntryDraft,
  getTaxType: () => (taxTypeSelect ? taxTypeSelect.value : "면세"),
  calculateRowAmounts,
  inferUnitPriceFromAmount,
  inferRowFromAmount,
  normalizeAmount: (n) => Number(n) || 0,
  formatMoney,
  formatQuantity,
  getMissingFieldKeys: (row) => getMissingEntryFieldKeys(row),
  getIsBatchEditMode: () => isBatchEditMode,
  isDraftFilled: () => isEntryRowFilled(),
  onConfirmDraft: () => {
    addEntryRowFromInputs();
  },
  onEnterConfirm: () => {
    addEntryRowFromInputs();
  },
  onOpenItemPicker: (idx) => {
    openItemSelectModal("inline", idx);
  },
  onBindActiveControls: ({ fields, itemPickerButton, itemHistorySelect: hist }) => {
    itemCodeInput = fields.itemCode || null;
    itemInput = fields.itemName || null;
    specInput = fields.spec || null;
    unitInput = fields.unit || null;
    qtyInput = fields.qty || null;
    unitPriceInput = fields.unitPrice || null;
    amountInput = fields.amount || null;
    shrinkPercentInput = fields.shrinkPercent || null;
    shrinkPriceInput = fields.shrinkPrice || null;
    marginInput = fields.margin || null;
    marginRateInput = fields.marginRate || null;
    btnItemPicker = itemPickerButton || null;
    itemHistorySelect = hist || null;

    const row = getEntryRowModelByIndex(entryActiveIndex);
    if (itemSelect) itemSelect.value = row && row.itemId ? row.itemId : "";
    if (row) {
      if (amountInput) amountInput.value = Number(row.amount || 0);
    }
  },
  onAfterRenderActive: ({ activeIndex }) => {
    populateActiveRowItemHistorySelect(activeIndex);
  },
  onUpdateSummary: () => {
    updateEntrySummary();
  },
  onHistoryPayload: ({ index, payload }) => {
    const row = getEntryRowModelByIndex(index);
    if (!row) return;
    row.itemId = String(payload.itemId || row.itemId || "");
    row.itemCode = String(payload.itemCode || row.itemCode || "");
    row.itemName = String(payload.itemName || "");
    row.itemSpec = String(payload.itemSpec || "");
    row.unit = String(payload.unit || "");
    row.unitPrice = Number(payload.unitPrice ?? 0) || 0;
    if (payload.shrinkPercent != null) {
      row.shrinkPercent = Number(payload.shrinkPercent) || 0;
    }
    if (payload.marginRate != null) {
      row.marginRate = Number(payload.marginRate) || 0;
    }
    renderPendingEntryRows();
    setActiveEntryIndex(index);
  },
});

// 거래일이 바뀌면 하단 행의 날짜 칸에도 자동 반영되도록 동기화
if (dateInput) {
  if (dateInlineInput) {
    dateInlineInput.readOnly = true;
    dateInlineInput.value = dateInput.value || todayYMD();
  }
  updateDateWeekday();
  dateInput.addEventListener("change", () => {
    if (dateInlineInput) {
      dateInlineInput.value = dateInput.value || todayYMD();
    }
    updateDateWeekday();
  });
}

// 상단 요약 박스(이 내역)에 한 번의 매입 입력 묶음을 표시
// 전표(묶음) 단위 요약 목록을 계산
function buildPurchaseSummaries(keyword = "") {
  const q = String(keyword || "").toLowerCase().trim();
  const map = new Map();

  const shouldFilterByGroup =
    groupTypeFilter === "매입처" && Boolean(selectedSupplierGroup);
  const supplierIdsInSelectedGroup = shouldFilterByGroup
    ? new Set(
        (suppliers || [])
          .filter((s) => (s?.type || "").includes("매입"))
          .filter(
            (s) => (s?.group || "미분류") === String(selectedSupplierGroup),
          )
          .map((s) => String(s.id || ""))
          .filter(Boolean),
      )
    : null;

  const supplierGroupCodeByName = new Map(
    (Array.isArray(supplierGroups) ? supplierGroups : [])
      .filter((g) => g && g.name)
      .map((g) => [String(g.name || "").trim(), String(g.code || "").trim()]),
  );

  // 전체 내역(거래처 필터 없음)에서는 이월 행을 거래처별로 여러 줄 표시하지 않고,
  // 모든 거래처의 이월 잔액을 합산해 1줄만 표시한다.
  const isOverallView = !currentSupplierFilterId;
  let carryOverTotalAllSuppliers = 0;
  let carryOverYmAllSuppliers = "";
  let finalBalanceTotalAllSuppliers = null;
  if (dateFilterFrom && isOverallView) {
    finalBalanceTotalAllSuppliers = 0;
  }

  // 현재 거래처 필터가 있으면 해당 거래처 내역만 요약 대상으로 사용
  const source = currentSupplierFilterId
    ? purchases.filter((p) => p.supplierId === currentSupplierFilterId)
    : purchases;

  const sourceFilteredByGroup = shouldFilterByGroup
    ? applySupplierGroupFilter(source, {
        enabled: true,
        selectedGroupName: selectedSupplierGroup,
        getGroupNameForRow: (p) => getSupplierGroupNameForRow(p),
      })
    : source;

  // 1) 전표(배치) 단위로 합계 요약 생성
  //    - 매입 행(금액>0)은 batchKey(없으면 날짜+거래처) 기준으로 묶어서 한 줄
  //    - 지불 전표(금액=0, payment>0)는 개별 거래별로 한 줄(type='지불')
  sourceFilteredByGroup.forEach((p) => {
    if (!p) return;

    const amount = Number(p.amount) || 0;
    const payment = Number(p.payment) || 0;
    const discount = Number(p.paymentDiscount || 0);
    const isPaymentOnly = isPaymentOnlyTransaction(p);
    const isDiscountOnly = isPaymentOnly && !(payment > 0) && discount > 0;

    // 요약 선택/상세내역 필터가 섞이지 않도록 summaryKey 를 명확히 분리한다.
    const key = makeSummaryKeyForTransaction(p);
    if (!key) return;

    if (!map.has(key)) {
      const supplierGroupName = getSupplierGroupNameForRow(p);
      map.set(key, {
        summaryKey: key,
        batchKey: isPaymentOnly ? "" : p.batchKey || "",
        date: p.date || "",
        supplierId: p.supplierId || "",
        supplierName: p.supplierName || "",
        type: isDiscountOnly ? "할인" : isPaymentOnly ? "지불" : "매입",
        groupName: supplierGroupName,
        // 지불 전표: firstItemName(적요)는 memo(사용자 입력 항목)를 사용
        firstItemName: isPaymentOnly ? p.memo || "" : p.itemName || "",
        // 지불 전표: 장부명은 ledgerName(통장/장부명)을 사용
        ledgerName: isDiscountOnly ? "" : isPaymentOnly ? p.ledgerName || "" : "",
        // 검색(상단 입력) 매칭 정보: 전표 내에서 검색어가 포함된 품목/메모를 '적요'에 보여주기 위함
        hasSearchMatch: true,
        searchMatchedCount: 0,
        searchFirstMatchedName: "",
        count: 0,
        totalAmount: 0,
        payment: 0,
        discount: 0,
        balance: 0,
      });
    }

    const summary = map.get(key);
    summary.count += 1;
    summary.totalAmount += amount;
    summary.payment += payment;
    summary.discount += discount;

    if (q) {
      const groupNameForRow = getSupplierGroupNameForRow(p);
      const groupCodeForRow = supplierGroupCodeByName.get(groupNameForRow) || "";

      const isMatch =
        // 거래처
        includesIgnoreCase(p.supplierId, q) ||
        includesIgnoreCase(p.supplierName, q) ||
        // 품목
        includesIgnoreCase(p.itemId, q) ||
        includesIgnoreCase(p.itemCode, q) ||
        includesIgnoreCase(p.itemName, q) ||
        // 분류(이름/코드)
        includesIgnoreCase(groupNameForRow, q) ||
        includesIgnoreCase(groupCodeForRow, q) ||
        // 장부/메모
        includesIgnoreCase(p.ledgerName, q) ||
        includesIgnoreCase(p.memo, q);

      if (isMatch) {
        summary.searchMatchedCount += 1;
        if (!summary.searchFirstMatchedName) {
          summary.searchFirstMatchedName = isPaymentOnly
            ? String(p.memo || "")
            : String(p.itemName || "");
        }
      }
    }
  });

  if (q) {
    map.forEach((summary) => {
      summary.hasSearchMatch = (Number(summary.searchMatchedCount) || 0) > 0;
    });
  }

  const baseList = Array.from(map.values());

  // 2) 매입처별로 정렬 후, 월단위 이월 행 + 누적 잔액 계산
  const bySupplier = new Map();
  baseList.forEach((s) => {
    const sid = s.supplierId || "";
    if (!bySupplier.has(sid)) bySupplier.set(sid, []);
    bySupplier.get(sid).push(s);
  });

  const result = [];

  const supplierIdsWithAnyTx = new Set();

  bySupplier.forEach((rows, supplierId) => {
    supplierIdsWithAnyTx.add(String(supplierId));
    const supplier = suppliers.find((s) => s.id === supplierId);
    const opening =
      Number(
        supplier && supplier.openingBalance != null
          ? supplier.openingBalance
          : 0,
      ) || 0;
    const supplierName = supplier
      ? supplier.name || supplier.id || ""
      : (rows.find((r) => String(r?.supplierName || "").trim())?.supplierName || "(미지정)");

    // 날짜 범위의 시작일이 지정된 경우:
    //   1) 초기잔액 + 시작일 이전 모든 거래를 하나의 "이월" 행으로 합산
    //   2) 조회 범위(시작일~종료일)의 전표만 날짜/금액/잔액을 표시한다.
    if (dateFilterFrom) {
      const sortedRows = [...rows].sort((a, b) => {
        const ad = a.date || "";
        const bd = b.date || "";
        if (ad < bd) return -1;
        if (ad > bd) return 1;
        return 0;
      });

      // 1) 시작일 이전 거래를 모두 반영해 "조회 시작 시점 잔액"(이월 잔액)을 만든다.
      let runningStart = opening;
      const groupNameFallback =
        (sortedRows[0] && sortedRows[0].groupName) ||
        (supplier && (supplier.group || "미분류")) ||
        "";

      sortedRows.forEach((row) => {
        const d = row.date || "";
        const amount = Number(row.totalAmount) || 0;
        const payment = Number(row.payment) || 0;
        const discount = Number(row.discount) || 0;
        if (d && d < dateFilterFrom) {
          // 잔액 = 기초 - 매입합계 + 결제합계
          runningStart -= amount;
          runningStart += payment + discount;
        }
      });

      // 2) 이월 행 표시
      if (isOverallView) {
        carryOverTotalAllSuppliers += runningStart;
      } else {
        // 거래처 필터가 걸린 경우(거래처 1개 뷰)는 이월을 1줄로 항상 표시(0이어도 0 표시)
        result.push({
          batchKey: "",
          date: "", // 이월 행은 날짜를 표시하지 않는다.
          supplierId,
          supplierName,
          type: "이월",
          groupName: groupNameFallback,
          firstItemName: "전월 이월",
          hasSearchMatch: true,
          count: 0,
          totalAmount: 0,
          payment: 0,
          balance: runningStart,
          isCarryOver: true,
        });
      }

      // 3) 조회 범위 내 전표만 표시하며 잔액을 계산한다.
      let running = runningStart;
      sortedRows.forEach((row) => {
        const d = row.date || "";
        if (!d || d < dateFilterFrom) return;
        if (dateFilterTo && d > dateFilterTo) return;

        const amount = Number(row.totalAmount) || 0;
        const payment = Number(row.payment) || 0;
        const discount = Number(row.discount) || 0;
        running -= amount;
        running += payment + discount;
        row.balance = running;
        result.push(row);
      });

      // 전체 내역에서는 각 거래처의 기간 종료 잔액을 합산한다.
      if (finalBalanceTotalAllSuppliers != null) {
        finalBalanceTotalAllSuppliers += running;
      }

      return;
    }

    // 조회 시작일이 없을 때는 기존 월별 이월 + 전체 흐름을 그대로 사용한다.
    let filteredRows = rows;
    if (dateFilterTo) {
      filteredRows = rows.filter((r) => {
        const d = r.date || "";
        if (!d) return false;
        if (dateFilterTo && d > dateFilterTo) return false;
        return true;
      });
      if (!filteredRows.length) return;
    }

    filteredRows.sort((a, b) => {
      const ad = a.date || "";
      const bd = b.date || "";
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      return 0;
    });

    let running = opening;
    let currentYm = "";
    let openingCarryOverPushed = false;

    filteredRows.forEach((row) => {
      const ym = (row.date || "").slice(0, 7); // YYYY-MM
      // 사용자 화면에서 '이월'이 여러 번 반복되어 혼동되는 문제를 방지하기 위해,
      // 조회 시작일이 없는 기본 화면에서는 월별 이월을 반복 표시하지 않고 최초 1회만 표시한다.
      if (!openingCarryOverPushed) {
        if (ym) {
          if (isOverallView) {
            carryOverTotalAllSuppliers += running;
            if (!carryOverYmAllSuppliers || ym < carryOverYmAllSuppliers) {
              carryOverYmAllSuppliers = ym;
            }
          } else if (running !== 0) {
            result.push({
              batchKey: "",
              date: `${ym}-01`,
              supplierId,
              supplierName,
              type: "이월",
              groupName: row.groupName,
              firstItemName: "전월 이월",
              hasSearchMatch: true,
              count: 0,
              totalAmount: running,
              payment: 0,
              balance: running,
              isCarryOver: true,
            });
          }
        }
        openingCarryOverPushed = true;
        currentYm = ym;
      } else if (ym && ym !== currentYm) {
        currentYm = ym;
      }

      const amount = Number(row.totalAmount) || 0;
      const payment = Number(row.payment) || 0;
      const discount = Number(row.discount) || 0;
      // 잔액 = 기초 - 매입합계 + 결제합계
      running -= amount;
      running += payment + discount;
      row.balance = running;
      result.push(row);
    });
  });

  // 전체 내역(거래처 필터 없음) + 시작일 필터에서는
  // 거래가 한 번도 없는 거래처도 "이월(시작일 직전 잔액)"과 "기간 종료 잔액" 합계에 포함한다.
  // 이 값은 이월 1줄(balance)에 직접 반영되므로, 이월 행을 추가하기 전에 먼저 보정한다.
  if (dateFilterFrom && isOverallView) {
    suppliers.forEach((sup) => {
      const sid = sup && sup.id != null ? String(sup.id) : "";
      if (!sid) return;
      if (supplierIdsInSelectedGroup && !supplierIdsInSelectedGroup.has(sid)) {
        return;
      }
      if (supplierIdsWithAnyTx.has(sid)) return;
      const opening =
        Number(sup && sup.openingBalance != null ? sup.openingBalance : 0) || 0;
      carryOverTotalAllSuppliers += opening;
      if (finalBalanceTotalAllSuppliers != null) {
        finalBalanceTotalAllSuppliers += opening;
      }
    });
  }

  // 3) 전체를 날짜 오름차순으로 정렬하여 화면에 표시
  if (!dateFilterFrom && isOverallView && carryOverYmAllSuppliers) {
    // 전체 기본 조회(시작일 미지정)에서도 이월을 1줄만 표시한다.
    // (기존 거래처별 최초 1회 이월 행을 합산)
    result.push({
      batchKey: "",
      date: `${carryOverYmAllSuppliers}-01`,
      supplierId: "",
      supplierName: "",
      type: "이월",
      groupName: "전체",
      firstItemName: "전월 이월",
      hasSearchMatch: true,
      count: 0,
      totalAmount: carryOverTotalAllSuppliers,
      payment: 0,
      discount: 0,
      balance: carryOverTotalAllSuppliers,
      isCarryOver: true,
    });
  }
  if (dateFilterFrom && isOverallView) {
    // 전체 내역에서는 이월을 1줄만 표시한다(0이어도 0 표시).
    result.push({
      batchKey: "",
      date: "",
      supplierId: "",
      supplierName: "",
      type: "이월",
      groupName: "전체",
      firstItemName: "전월 이월",
      hasSearchMatch: true,
      count: 0,
      totalAmount: 0,
      payment: 0,
      balance: carryOverTotalAllSuppliers,
      isCarryOver: true,
    });
  }

  result.sort((a, b) => {
    const ad = a.date || "";
    const bd = b.date || "";
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    return 0;
  });

  // 검색어가 있으면, 해당 검색어가 포함된 전표만 상단에 남긴다.
  // 단, 전표를 클릭해서 보는 하단 상세내역에서는 전표 내 다른 품목을 제거하지 않는다.
  const resultAll = result;
  const resultFiltered = q
    ? resultAll.filter((s) => s && (s.isCarryOver || s.hasSearchMatch))
    : resultAll;

  purchaseSummaries = resultFiltered;
  overallSummaryFinalBalanceTotal = finalBalanceTotalAllSuppliers;
}

function ensureDefaultSummarySelection() {
  const base = purchaseSummaries || [];

  // 요약 렌더링과 동일하게: 기간조회(dateFilterFrom)용 빈 날짜 이월 행은 항상 최상단
  const hasBlankDateCarryOver = base.some(
    (s) => s && s.isCarryOver && !(s.date || "").trim(),
  );
  const ordered = hasBlankDateCarryOver
    ? [
        ...base.filter((s) => s && s.isCarryOver && !(s.date || "").trim()),
        ...base.filter((s) => !(s && s.isCarryOver && !(s.date || "").trim())),
      ]
    : base;

  const selectable = ordered.filter((s) => s && !s.isCarryOver && s.summaryKey);
  if (!selectable.length) {
    isSummaryFilterActive = false;
    currentSummaryKey = "";
    currentSummaryBatchKey = "";
    currentSummaryDateForFilter = "";
    currentSummarySupplierIdForFilter = "";
    return;
  }

  const isValidCurrent =
    currentSummaryKey &&
    selectable.some((s) => String(s.summaryKey) === String(currentSummaryKey));
  if (isValidCurrent) {
    isSummaryFilterActive = true;
    return;
  }

  // 하단 상세내역은 상단 전표를 클릭했을 때만 조회되게 한다.
  // (검색/기간조회 등으로 목록이 갱신되어도 자동으로 첫 전표를 선택하지 않는다.)
  currentEditingId = null;
  currentSummaryKey = "";
  currentSummaryBatchKey = "";
  currentSummaryDateForFilter = "";
  currentSummarySupplierIdForFilter = "";
  isSummaryFilterActive = false;
}

function refreshSummaryAndDetail(keyword = "") {
  buildPurchaseSummaries(keyword);
  ensureDefaultSummarySelection();
  renderPurchaseSummaryList();
  renderList(keyword);

  if (purchaseSummaryBody) {
    const selected = purchaseSummaryBody.querySelector("tr.selected");
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest" });
    }
  }
}

// 현재 상단 요약(전표) 선택 상태에 해당하는 모든 거래 행을 가져오는 헬퍼
function getCurrentSummaryGroupTransactions() {
  if (!purchases || !purchases.length) return [];

  // summaryKey 우선(없으면 기존 변수로 유도)
  let key = currentSummaryKey || "";
  if (!key) {
    if (currentSummaryBatchKey) {
      key = `BATCH__${currentSummaryBatchKey}`;
    } else if (
      currentSummaryDateForFilter &&
      currentSummarySupplierIdForFilter
    ) {
      key = `DATE__${currentSummaryDateForFilter}__${currentSummarySupplierIdForFilter}`;
    }
  }

  if (!key) return [];

  if (key.startsWith("PAY__")) {
    const id = key.replace(/^PAY__/, "");
    return purchases.filter(
      (p) => p && String(p.id) === String(id) && isPaymentOnlyTransaction(p),
    );
  }

  if (key.startsWith("BATCH__")) {
    const batchKey = key.replace(/^BATCH__/, "");
    return purchases.filter(
      (p) =>
        p &&
        String(p.batchKey || "") === String(batchKey) &&
        !isPaymentOnlyTransaction(p),
    );
  }

  if (key.startsWith("DATE__")) {
    const rest = key.replace(/^DATE__/, "");
    const [date, supplierId] = rest.split("__");
    // supplierId가 비어있는 전표도(과거 데이터) 날짜 기준으로 묶여 있을 수 있다.
    if (!date) return [];
    return purchases.filter(
      (p) =>
        p &&
        !isPaymentOnlyTransaction(p) &&
        !p.batchKey &&
        String(p.date || "") === String(date) &&
        String(p.supplierId || "") === String(supplierId),
    );
  }

  return [];
}

// 상단 요약 박스(이 내역)에 전표 목록을 렌더링
function renderPurchaseSummaryList() {
  if (!purchaseSummaryBody) return;

  const q = String(searchInput ? searchInput.value : "")
    .toLowerCase()
    .trim();
  const useSearchMatchMemo = Boolean(q);

  purchaseSummaryBody.innerHTML = "";

  if (!purchaseSummaries.length) {
    // 조회 결과가 없으면, 요약 하단 합계도 0으로 초기화한다.
    // (이전 조회/선택 상태의 합계가 남아 "Count=1" 같은 오해를 유발하는 것을 방지)
    if (countSpan) {
      countSpan.textContent = "0";
    }
    if (summaryTotalAmountSpan) {
      summaryTotalAmountSpan.textContent = "0";
      summaryTotalAmountSpan.dataset.amountValue = "0";
    }
    if (summaryTotalPaymentSpan) {
      summaryTotalPaymentSpan.textContent = "0";
      summaryTotalPaymentSpan.dataset.amountValue = "0";
    }
    if (summaryTotalBalanceSpan) {
      summaryTotalBalanceSpan.textContent = "0";
      summaryTotalBalanceSpan.dataset.amountValue = "0";
    }

    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "등록된 매입 내역이 없습니다.";
    tr.appendChild(td);
    purchaseSummaryBody.appendChild(tr);

    if (purchaseSummaryBox) {
      purchaseSummaryBox.style.display = "";
    }
    return;
  }

  // 기간조회(dateFilterFrom)용 이월 행은 date가 공란이다.
  // 이 경우 화면에서 항상 최상단에 보이도록 렌더링 순서를 보정한다.
  const hasBlankDateCarryOver = purchaseSummaries.some(
    (s) => s && s.isCarryOver && !(s.date || "").trim(),
  );
  const summariesToRender = hasBlankDateCarryOver
    ? [
        ...purchaseSummaries.filter(
          (s) => s && s.isCarryOver && !(s.date || "").trim(),
        ),
        ...purchaseSummaries.filter(
          (s) => !(s && s.isCarryOver && !(s.date || "").trim()),
        ),
      ]
    : purchaseSummaries;

  summariesToRender.forEach((summary) => {
    const tr = document.createElement("tr");
    tr.classList.add("purchase-summary-row", "purchase-summary-has-data");
    tr.dataset.isCarryOver = summary.isCarryOver ? '1' : '0';
    tr.dataset.batchKey = summary.batchKey;
    tr.dataset.date = summary.date;
    tr.dataset.supplierId = summary.supplierId;
    if (summary.summaryKey) {
      tr.dataset.summaryKey = summary.summaryKey;
    }

    const isSelected =
      !summary.isCarryOver &&
      summary.summaryKey &&
      summary.summaryKey === currentSummaryKey;
    if (isSelected) {
      tr.classList.add("selected");
    }

    const effectiveCount = Number(summary.count) || 0;
    const effectiveFirst = useSearchMatchMemo && summary.searchFirstMatchedName
      ? String(summary.searchFirstMatchedName || "")
      : String(summary.firstItemName || "");

    const others = Math.max(0, effectiveCount - 1);
    const memoBase =
      others > 0
        ? `${effectiveFirst} 외 ${others}`
        : effectiveFirst;

    const typeText = summary.isCarryOver ? "이월" : summary.type;
    let ledgerLabel = summary.ledgerName || "";
    let desc = summary.isCarryOver
      ? "전월 이월"
      : memoBase ||
          (summary.type === "지불"
            ? "지불"
            : summary.type === "할인"
              ? "할인"
              : memoBase);
    // 분류 컬럼에는 거래처명을 우선 표시한다.
    // 1순위: suppliers 목록에서 supplierId 로 찾은 거래처명
    // 2순위: summary.supplierName (단, 전부 숫자인 코드값이면 제외)
    // 3순위: 기존 분류명(groupName)
    let displaySupplier = "";
    if (summary.supplierId) {
      const sup = suppliers.find(
        (s) => String(s.id) === String(summary.supplierId),
      );
      if (sup && sup.name) {
        displaySupplier = sup.name;
      }
    }
    if (!displaySupplier && summary.supplierName) {
      const raw = String(summary.supplierName);
      if (!/^\d+$/.test(raw.trim())) {
        displaySupplier = raw;
      }
    }
    if (!displaySupplier) {
      // 거래처 정보가 전혀 없으면 '(미지정)'으로 표시해 누락 데이터를 바로 인지할 수 있게 한다.
      displaySupplier = summary.supplierId || summary.supplierName ? summary.groupName : "(미지정)";
    }

    // 지불 전표의 장부명/적요 처리(레거시 호환)
    // - 신규 데이터: ledgerName(장부명)이 있으면 그대로 사용하고, 적요(desc)는 memo(항목)를 사용한다.
    // - 과거 데이터: memo 에 "[입출금] ..." 또는 "[지불] ..." 형태로 섞여 저장된 경우가 있어,
    //   ledgerName 이 비어 있을 때만 기존 파싱 규칙을 적용한다.
    if (
      !summary.isCarryOver &&
      summary.type === "지불" &&
      typeof desc === "string" &&
      !ledgerLabel
    ) {
      const rawDesc = desc;
      if (/^\[입출금\]/.test(rawDesc)) {
        let cleaned = rawDesc.replace(/^\[입출금\]\s*/, "");
        cleaned = cleaned.replace(/^[A-Za-z0-9]+\s+/, "");
        ledgerLabel = cleaned;
        desc = rawDesc;
      } else {
        let cleaned = rawDesc.replace(/^\[지불\]\s*/, "");
        cleaned = cleaned.replace(/^[A-Za-z0-9]+\s+/, "");
        ledgerLabel = cleaned;
        desc = "지불";
      }
    }

    // 최종 fallback: 장부명이 코드(A01/A0001 등)로만 들어온 경우 마스터 이름으로 표시
    if (ledgerLabel) {
      const trimmed = String(ledgerLabel).trim();
      const stripped = stripCodePrefix(trimmed);
      const candidate = stripped || trimmed;
      if (/^[A-Za-z]{1,2}\d{2,4}$/.test(String(candidate).trim())) {
        const mapped = resolveLedgerLabelFromCode(candidate);
        ledgerLabel = mapped || candidate;
      } else {
        ledgerLabel = candidate;
      }
    }

    // 매입/지불은 출금 계열이므로 빨강 고정(표시는 양수)
    // 이월 행은 금액을 잔액 칸에만 표시하고, 거래/결제 칸은 공란으로 둔다.
    const displayAmount = summary.isCarryOver ? 0 : Number(summary.totalAmount || 0);
    const displayPayment = summary.isCarryOver
      ? 0
      : Math.abs(
          (Number(summary.payment || 0) || 0) +
            (Number(summary.discount || 0) || 0),
        );
    const balanceValue = Number(summary.balance || 0);
    const amountText = summary.isCarryOver ? "" : formatMoney(displayAmount);
    const paymentText = summary.isCarryOver ? "" : formatMoney(displayPayment);

    tr.innerHTML = `
      <td>${typeText}</td>
      <td>${displaySupplier}</td>
      <td>${summary.date}</td>
      <td>${ledgerLabel}</td>
      <td>${desc}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${displayAmount}">${amountText}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus" data-amount-value="${displayPayment}">${paymentText}</td>
      <td class="right" data-amount-color="1" data-amount-value="${balanceValue}">${formatMoney(balanceValue)}</td>
    `;

    purchaseSummaryBody.appendChild(tr);
  });

  // 요약 하단 합계 박스: 전표 건수, 거래/결제/잔액 합계 표시
  let totalCount = 0;
  let totalAmount = 0;
  let totalPayment = 0;
  // 거래처별 최종 잔액(기초 - 매입 + 지불)을 모아 전체 잔액 합계 계산
  const finalBalanceBySupplier = new Map();

  purchaseSummaries.forEach((summary) => {
    if (summary.isCarryOver) return; // 이월 행은 합계에서 제외
    totalCount += 1;
    totalAmount += Number(summary.totalAmount) || 0;
    totalPayment +=
      (Number(summary.payment) || 0) + (Number(summary.discount) || 0);

    // 각 거래처별로 마지막 요약 행의 balance 값을 기억해 둔다.
    if (summary.supplierId) {
      const bal = Number(summary.balance) || 0;
      finalBalanceBySupplier.set(String(summary.supplierId), bal);
    }
  });

  if (countSpan) {
    countSpan.textContent = totalCount.toLocaleString();
  }
  if (summaryTotalAmountSpan) {
    summaryTotalAmountSpan.textContent = totalAmount.toLocaleString();
    summaryTotalAmountSpan.dataset.amountValue = String(totalAmount);
  }
  if (summaryTotalPaymentSpan) {
    summaryTotalPaymentSpan.textContent = totalPayment.toLocaleString();
    summaryTotalPaymentSpan.dataset.amountValue = String(totalPayment);
  }
  if (summaryTotalBalanceSpan) {
    // 전체내역 + 시작일 필터(dateFilterFrom)에서는
    // "기간 종료 기준 모든 거래처 잔액 합계"를 별도로 계산해 사용한다.
    // (이월을 합계에 더하면 중복 계산 위험)
    let balanceTotal = 0;
    if (
      dateFilterFrom &&
      !currentSupplierFilterId &&
      typeof overallSummaryFinalBalanceTotal === "number"
    ) {
      balanceTotal = overallSummaryFinalBalanceTotal;
    } else {
      // 기본: 각 거래처의 최종 잔액을 합산
      finalBalanceBySupplier.forEach((bal) => {
        balanceTotal += bal;
      });
    }

    summaryTotalBalanceSpan.textContent = balanceTotal.toLocaleString();
    summaryTotalBalanceSpan.dataset.amountValue = String(balanceTotal);
  }

  // 전표 건수가 10건 미만이면, 표 높이를 일정하게 유지하기 위해
  // 나머지 줄은 빈 행으로 채운다.
  const maxRows = 10;
  const fillerCount = Math.max(0, maxRows - purchaseSummaries.length);
  for (let i = 0; i < fillerCount; i += 1) {
    const emptyTr = document.createElement("tr");
    emptyTr.classList.add("purchase-summary-row", "purchase-summary-empty");

    // 요약 테이블은 8열(구분~잔액)이다.
    // colspan으로 빈 행을 채우면 세로 구분선이 사라져 "표시줄"이 어색해 보일 수 있어
    // 열 개수만큼 빈 셀을 생성한다.
    for (let c = 0; c < 8; c += 1) {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      emptyTr.appendChild(td);
    }
    purchaseSummaryBody.appendChild(emptyTr);
  }

  if (purchaseSummaryBox) {
    purchaseSummaryBox.style.display = "";
  }

  // 최신 전표가 바로 보이도록 스크롤을 아래로 이동
  purchaseSummaryAutoScroll.scroll(purchaseSummaryBody);
}

function normalizeTaxType(value) {
  const allowed = ["면세", "과세10%", "영세", "없음"];
  return allowed.includes(value) ? value : "면세";
}

function updateDateWeekday() {
  if (!dateInput || !dateWeekdaySpan) return;
  const value = dateInput.value || todayYMD();
  dateWeekdaySpan.textContent = formatWeekdayLabel(value);
}

function updateImportDateWeekday() {
  if (!importDateInput || !importDateWeekdaySpan) return;
  const value = importDateInput.value || todayYMD();
  importDateWeekdaySpan.textContent = formatWeekdayLabel(value);
}

function applySupplierFromSelect() {
  const selectedId = supplierSelect.value;
  if (!selectedId) {
    supplierInput.value = "";
    if (supplierBalanceInput) supplierBalanceInput.value = "0";
    // 활성행의 이전 품목 목록도 비움
    if (entryActiveIndex >= 0) {
      populateActiveRowItemHistorySelect(entryActiveIndex);
    }
    return;
  }
  const supplier = suppliers.find((s) => s.id === selectedId);
  if (supplier) {
    const code = supplier.id || "";
    supplierInput.value = code;
    if (supplierBalanceInput) {
      const bal = getSupplierCurrentBalance(supplier.id || "");
      const safeBal = Number.isFinite(bal) ? bal : 0;
      supplierBalanceInput.value = safeBal.toLocaleString();
      supplierBalanceInput.classList.remove(
        "amount-plus",
        "amount-minus",
        "amount-zero",
      );
      supplierBalanceInput.classList.add(amountClassBySign(safeBal));
    }
  }

  // 거래처가 바뀌면 활성행의 이전 품목 목록을 갱신
  if (entryActiveIndex >= 0) {
    populateActiveRowItemHistorySelect(entryActiveIndex);
  }
}

function clearActiveEntryRow() {
  if (!entryBody) return;
  entryActiveIndex = -1;
  itemInput = null;
  itemCodeInput = null;
  specInput = null;
  unitInput = null;
  qtyInput = null;
  unitPriceInput = null;
  amountInput = null;
  btnItemPicker = null;
  itemHistorySelect = null;

  entryBody.querySelectorAll("tr.purchase-entry-row").forEach((tr) => {
    tr.classList.remove("is-active");
    tr.querySelectorAll(".cell-edit input, .cell-edit select, .cell-edit button").forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
        el.disabled = true;
      }
    });
  });
}

function setupEntryRowOutsideClickHandler() {
  // 전역 1회 바인딩
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // 매입 모달이 열려있을 때만 처리
    if (!modal || modal.getAttribute("aria-hidden") === "true") return;
    // 품목 선택 모달이 열려있으면 해제하지 않음
    if (itemSelectModal && itemSelectModal.classList.contains("is-open")) return;

    // 엔트리 테이블 내부 클릭이면 무시
    if (target.closest(".purchase-entry-table")) return;

    // 모달 오버레이(배경) 클릭 시에만 활성행 해제
    const overlay = target.closest("#purchase-modal");
    if (!overlay) return;
    if (target.closest(".modal-dialog")) return;
    clearActiveEntryRow();
  });
}

function buildItemHistoryOptionsForSupplier() {
  const supplierId = supplierSelect ? String(supplierSelect.value || "").trim() : "";
  if (!supplierId) return [];

  const candidates = (purchases || [])
    .filter((tx) => {
      if (!tx) return false;
      if (String(tx.category || "") !== transactionCategory) return false;
      if (String(tx.supplierId || "") !== supplierId) return false;
      const amount = Number(tx.amount) || 0;
      if (!(amount > 0)) return false; // 지불 전표 제외
      const name = String(tx.itemName || "").trim();
      return Boolean(name);
    })
    .sort((a, b) => {
      const ad = String(a.date || "");
      const bd = String(b.date || "");
      if (ad < bd) return 1;
      if (ad > bd) return -1;
      // 최신이 먼저 오도록 id도 보조 정렬
      const ai = Number(a.id) || 0;
      const bi = Number(b.id) || 0;
      return bi - ai;
    });

  const seen = new Set();
  const result = [];
  for (const tx of candidates) {
    const itemId = String(tx.itemId || "").trim();
    const itemCode = String(tx.itemCode || itemId).trim();
    const itemName = String(tx.itemName || "").trim();
    const itemSpec = String(tx.itemSpec || "").trim();
    const unit = String(tx.unit || "").trim();
    const unitPrice = Number(tx.unitPrice ?? 0) || 0;

    const key = itemId
      ? `ID:${itemId}`
      : `N:${itemName}|S:${itemSpec}|U:${unit}|P:${unitPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const payload = {
      itemId: itemId || "",
      itemCode: itemCode || "",
      itemName,
      itemSpec,
      unit,
      unitPrice,
    };
    result.push(payload);
    if (result.length >= 30) break;
  }
  return result;
}

function populateActiveRowItemHistorySelect(index) {
  if (!entryBody) return;
  const tr = entryBody.querySelector(
    `tr.purchase-entry-row[data-entry-index="${Number(index)}"]`,
  );
  if (!tr) return;
  const select = tr.querySelector(".js-item-history");
  if (!(select instanceof HTMLSelectElement)) return;

  const options = buildItemHistoryOptionsForSupplier();
  select.innerHTML = '<option value="">이전 품목 선택</option>';
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = JSON.stringify(opt);
    const specPart = opt.itemSpec ? ` (${opt.itemSpec})` : "";
    const unitPart = opt.unit ? ` ${opt.unit}` : "";
    const codePart = opt.itemCode ? `${opt.itemCode} ` : "";
    const pricePart = opt.unitPrice ? ` / ${opt.unitPrice.toLocaleString()}` : "";
    o.textContent = `${codePart}${opt.itemName}${specPart}${unitPart}${pricePart}`.trim();
    select.appendChild(o);
  }
}

function populateImportItemHistorySelects() {
  if (!importResultBody) return;

  const options = buildItemHistoryOptionsForSupplier();
  const selects = Array.from(importResultBody.querySelectorAll("select.js-item-history"));
  if (!selects.length) return;

  selects.forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    select.innerHTML = '<option value="">이전 품목 선택</option>';
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = JSON.stringify(opt);
      const specPart = opt.itemSpec ? ` (${opt.itemSpec})` : "";
      const unitPart = opt.unit ? ` ${opt.unit}` : "";
      const codePart = opt.itemCode ? `${opt.itemCode} ` : "";
      const pricePart = opt.unitPrice ? ` / ${opt.unitPrice.toLocaleString()}` : "";
      o.textContent = `${codePart}${opt.itemName}${specPart}${unitPart}${pricePart}`.trim();
      select.appendChild(o);
    }
  });
}

function applyImportSupplierFromSelect() {
  if (!importSupplierSelect) return;
  const selectedId = importSupplierSelect.value;
  if (!selectedId) {
    if (importSupplierInput) importSupplierInput.value = "";
    if (importSupplierBalanceInput) importSupplierBalanceInput.value = "0";
    // 메인 모달과도 동기화
    if (supplierSelect) supplierSelect.value = "";
    applySupplierFromSelect();
    populateImportItemHistorySelects();
    return;
  }

  const supplier = suppliers.find((s) => s.id === selectedId);
  if (supplier) {
    const code = supplier.id || "";
    if (importSupplierInput) importSupplierInput.value = code;
    if (importSupplierBalanceInput) {
      const bal = getSupplierCurrentBalance(supplier.id || "");
      const safeBal = Number.isFinite(bal) ? bal : 0;
      importSupplierBalanceInput.value = safeBal.toLocaleString();
      importSupplierBalanceInput.classList.remove(
        "amount-plus",
        "amount-minus",
        "amount-zero",
      );
      importSupplierBalanceInput.classList.add(amountClassBySign(safeBal));
    }

    // 메인 매입 등록 헤더와 값 동기화
    if (supplierSelect) {
      supplierSelect.value = supplier.id || "";
      applySupplierFromSelect();
    }
  }

  // 인식 결과표의 이전 품목 선택 목록도 갱신
  populateImportItemHistorySelects();
}

function applyItemFromSelect() {
  const selectedId = itemSelect.value;
  if (!selectedId) {
    if (itemInput) itemInput.value = "";
    if (itemCodeInput) itemCodeInput.value = "";
    if (specInput) specInput.value = "";
    if (unitInput) unitInput.value = "";
    if (unitPriceInput) unitPriceInput.value = "0";
    if (shrinkPercentInput) shrinkPercentInput.value = "0";
    if (marginRateInput) marginRateInput.value = "0";
    updateAmountFields();
    if (unitPriceInput) {
      unitPriceInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return;
  }
  const item = items.find((it) => it.id === selectedId);
  if (item) {
    if (itemInput) itemInput.value = item.name || "";
    if (itemCodeInput) itemCodeInput.value = item.id || "";
    if (specInput) specInput.value = item.spec || "";
    if (unitInput) unitInput.value = item.unit || "";
    if (unitPriceInput) unitPriceInput.value = item.price ?? 0;
    if (shrinkPercentInput)
      shrinkPercentInput.value = String(Number(item.shrinkPercent ?? 0) || 0);
    if (marginRateInput)
      marginRateInput.value = String(
        Number(item.deliveryMargin ?? item.saleMargin ?? 0) || 0,
      );
    updateAmountFields();

    // view/모델 동기화는 input 이벤트로 재사용
    if (unitPriceInput) {
      unitPriceInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (shrinkPercentInput) {
      shrinkPercentInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (marginRateInput) {
      marginRateInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 품목 선택이 끝나면 바로 수량 입력칸으로 이동
    if (qtyInput) {
      qtyInput.focus();
      qtyInput.select();
    }
  }
}

// 전표(row)에 저장된 supplierGroup(스냅샷)이 있더라도,
// supplierId가 현재 거래처 마스터에 존재하면 마스터 분류를 우선한다.
// (거래처 분류 변경 시 과거 전표도 화면/필터에서 즉시 따라가도록)
function getSupplierGroupNameForRow(row) {
  const supplierId = String(row?.supplierId || "").trim();
  if (supplierId && supplierGroupMap.has(supplierId)) {
    return supplierGroupMap.get(supplierId) || "미분류";
  }
  const snapshot = String(row?.supplierGroup || "").trim();
  if (snapshot) return snapshot;
  return "미분류";
}

function buildPurchaseSupplierMap() {
  supplierGroupMap.clear();
  suppliers.forEach((supplier) => {
    if (!supplier || !supplier.id) return;
    supplierGroupMap.set(supplier.id, supplier.group || "미분류");
  });
}

function getTypeShortLabel(typeLabel) {
  switch (typeLabel) {
    case "매출처":
      return "매출";
    case "매입처":
      return "매입";
    default:
      return typeLabel || "전체";
  }
}

function getCurrentFilteredPurchases(keyword = "") {
  const q = String(keyword || "").toLowerCase().trim();
  const keywordFiltered = purchases.filter((p) => {
    if (!q) return true;
    return (
      includesIgnoreCase(p.supplierName, q) ||
      includesIgnoreCase(p.itemName, q) ||
      includesIgnoreCase(p.memo, q)
    );
  });

  const groupFiltered = applySupplierGroupFilter(keywordFiltered, {
    enabled: groupTypeFilter === "매입처" && Boolean(selectedSupplierGroup),
    selectedGroupName: selectedSupplierGroup,
    getGroupNameForRow: (p) => getSupplierGroupNameForRow(p),
  });

  const supplierFiltered = currentSupplierFilterId
    ? groupFiltered.filter((p) => p.supplierId === currentSupplierFilterId)
    : groupFiltered;

  let baseFiltered = supplierFiltered;
  if (dateFilterFrom || dateFilterTo) {
    baseFiltered = baseFiltered.filter((p) => {
      const d = p.date || "";
      if (!d) return false;
      if (dateFilterFrom && d < dateFilterFrom) return false;
      if (dateFilterTo && d > dateFilterTo) return false;
      return true;
    });
  }

  baseFiltered = baseFiltered.filter((p) => !isPaymentOnlyTransaction(p));

  let summaryFiltered = baseFiltered;
  if (isSummaryFilterActive) {
    let key = currentSummaryKey || "";
    if (!key) {
      if (currentSummaryBatchKey) {
        key = `BATCH__${currentSummaryBatchKey}`;
      } else if (currentSummaryDateForFilter && currentSummarySupplierIdForFilter) {
        key = `DATE__${currentSummaryDateForFilter}__${currentSummarySupplierIdForFilter}`;
      }
    }

    if (key && key.startsWith("PAY__")) {
      summaryFiltered = [];
    } else if (key && key.startsWith("BATCH__")) {
      const batchKey = key.replace(/^BATCH__/, "");
      summaryFiltered = baseFiltered.filter(
        (p) => String(p.batchKey || "") === String(batchKey),
      );
    } else if (key && key.startsWith("DATE__")) {
      const rest = key.replace(/^DATE__/, "");
      const [d, sid] = rest.split("__");
      summaryFiltered = baseFiltered.filter(
        (p) =>
          !p.batchKey &&
          String(p.date || "") === String(d || "") &&
          String(p.supplierId || "") === String(sid || ""),
      );
    }
  }

  const numericKeys = ["quantity", "unitPrice", "amount"];
  const sorted = currentSort.key
    ? sortByKey(summaryFiltered, currentSort.key, currentSort.direction, numericKeys)
    : summaryFiltered;
  return sorted;
}

function downloadPurchasesAsXlsx() {
  const XLSX = requireXLSXOrAlert();
  if (!XLSX) return;

  const keyword = searchInput ? searchInput.value : "";
  const rows = getCurrentFilteredPurchases(keyword).map((p) => {
    const quantity = Number(p.quantity ?? 0);
    const unitPrice = Number(p.unitPrice ?? 0);
    const fallbackSupply = Math.round(quantity * unitPrice);
    const supplyAmount =
      p.supplyAmount != null ? Number(p.supplyAmount) : fallbackSupply;
    const taxAmount =
      p.taxAmount != null
        ? Number(p.taxAmount)
        : Math.max(0, Number(p.amount ?? 0) - supplyAmount);
    const totalAmount = Number(p.amount ?? supplyAmount + taxAmount);

    return {
      id: p.id ?? "",
      date: p.date || "",
      supplierId: p.supplierId || "",
      supplierName: p.supplierName || "",
      supplierGroup: getSupplierGroupNameForRow(p),
      batchKey: p.batchKey || "",
      itemId: p.itemId || "",
      itemCode: p.itemCode || p.itemId || "",
      itemName: p.itemName || "",
      itemSpec: p.itemSpec || "",
      unit: p.unit || "",
      taxType: normalizeTaxType(p.taxType),
      quantity,
      unitPrice,
      supplyAmount,
      taxAmount,
      amount: Number.isFinite(totalAmount) ? totalAmount : 0,
      warehouse: p.warehouse || "",
      memo: p.memo || "",
      ledgerTxId: p.ledgerTxId || "",
      ledgerName: p.ledgerName || "",
      source: p.source || "",
    };
  });

  const headerMap = {
    id: "ID",
    date: "날짜",
    supplierId: "거래처코드",
    supplierName: "거래처명",
    supplierGroup: "거래처분류",
    batchKey: "전표키",
    itemId: "품목ID",
    itemCode: "품목코드",
    itemName: "품명",
    itemSpec: "규격",
    unit: "단위",
    taxType: "과세구분",
    quantity: "수량",
    unitPrice: "단가",
    supplyAmount: "공급가",
    taxAmount: "세액",
    amount: "합계",
    warehouse: "창고",
    memo: "비고",
    ledgerTxId: "장부TX",
    ledgerName: "장부명",
    source: "source",
  };
  const orderedKeys = Object.keys(headerMap);
  const aoa = [orderedKeys.map((k) => headerMap[k])];
  rows.forEach((r) => {
    aoa.push(orderedKeys.map((k) => (r[k] == null ? "" : r[k])));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName("매입내역"));

  const from = ymdCompact(dateFilterFrom);
  const to = ymdCompact(dateFilterTo);
  const rangeLabel = from || to ? `_${from || ""}-${to || ""}` : "";
  const filename = `매입내역${rangeLabel}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function parsePurchaseImport(rawText) {
  const lines = (rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const records = [];

  for (const line of lines) {
    if (line.startsWith("거래구분") || line.startsWith("구분")) continue;

    const cols = parseImportLineToCols(line);
    if (cols.length < 12) {
      console.warn("열 개수가 부족한 행:", line, cols);
      while (cols.length < 12) cols.push("");
    }

    const rawType = cols[0];
    const code = cols[1];
    const name = cols[2];
    const spec = cols[3];
    let unit = cols[4];
    const taxType = cols[5] || "";
    let qty = parseNumberLike(cols[6]);
    let unitPrice = parseNumberLike(cols[7]);
    let supplyAmount = parseNumberLike(cols[8]);
    let taxAmount = parseNumberLike(cols[9]);
    let total = parseNumberLike(cols[10]);
    const warehouse = cols[11] || "";

    // 반품/환출 계열은 음수로 통일(수량/금액 부호를 맞춘다)
    const isReturnType = /환출|반품|취소/.test(String(rawType || ""));
    const sign = (isReturnType || qty < 0 || total < 0) ? -1 : 1;
    if (sign < 0) {
      if (Number.isFinite(qty) && qty > 0) qty = -qty;
      if (Number.isFinite(total) && total > 0) total = -total;
      if (Number.isFinite(supplyAmount) && supplyAmount > 0) supplyAmount = -supplyAmount;
      if (Number.isFinite(taxAmount) && taxAmount > 0) taxAmount = -taxAmount;
    }

    if (unit === "근") {
      unit = "kg";
      const qtyKg = qty * 0.6;
      const priceKg = qtyKg ? Math.round(Math.abs(total) / Math.abs(qtyKg)) : unitPrice;
      qty = qtyKg;
      unitPrice = priceKg;
    }

    // 합계가 비어있으면 공급가+세액으로 보정
    if ((!Number.isFinite(total) || total === 0) && (supplyAmount || taxAmount)) {
      const inferred = (Number(supplyAmount) || 0) + (Number(taxAmount) || 0);
      // 공급가/세액이 양수인데 반품(수량 음수)인 케이스를 고려해 부호를 맞춘다.
      total = qty < 0 ? -Math.abs(inferred) : inferred;
    }

    // 합계/수량으로 단가를 재환산해 불일치(또는 단가 누락)면 단가를 보정
    if (Number.isFinite(total) && Number.isFinite(qty) && Math.abs(total) > 0 && Math.abs(qty) > 0) {
      const expectedUnitPrice = Math.round(Math.abs(total) / Math.abs(qty));
      const product = (Number(unitPrice) || 0) * Math.abs(qty);
      const mismatch = Math.abs(product - Math.abs(total)) >= 1;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0 || mismatch) {
        unitPrice = expectedUnitPrice;
      }
    }

    records.push({
      rawType,
      code,
      name,
      spec,
      unit,
      taxType,
      qty,
      unitPrice,
      supplyAmount,
      taxAmount,
      total,
      warehouse,
    });
  }

  return records;
}

function getImportMissingFieldKeys(rec) {
  if (!rec) return [];

  const hasAny =
    String(rec?.code || "").trim() ||
    String(rec?.name || "").trim() ||
    String(rec?.spec || "").trim() ||
    String(rec?.unit || "").trim() ||
    Number(rec?.qty || 0) !== 0 ||
    Number(rec?.unitPrice || 0) !== 0 ||
    Number(rec?.total || 0) !== 0;
  if (!hasAny) return [];

  const missing = [];
  if (!String(rec?.code || "").trim()) missing.push("code");
  if (!String(rec?.name || "").trim()) missing.push("name");
  if (!String(rec?.spec || "").trim()) missing.push("spec");
  if (!String(rec?.unit || "").trim()) missing.push("unit");
  if (Number(rec?.qty || 0) === 0) missing.push("qty");
  if (!(Number(rec?.unitPrice) > 0)) missing.push("unitPrice");
  if (Number(rec?.total || 0) === 0) missing.push("total");
  return missing;
}

function refreshImportRowMissingState(tr, rec) {
  if (!tr) return;
  const missing = new Set(getImportMissingFieldKeys(rec));
  tr.querySelectorAll("td[data-field]").forEach((td) => {
    const key = String(td.dataset.field || "");
    td.classList.toggle("is-missing", missing.has(key));
  });
}

function renderImportTable(records) {
  if (!importResultBody) return;
  ensureImportTableEditStyle();
  bindImportTableEditor();
  importResultBody.innerHTML = "";

  const makeCell = ({
    field,
    viewText,
    inputType = "text",
    right = false,
    step = null,
    min = null,
    amountMinus = false,
  }) => {
    const td = document.createElement("td");
    td.dataset.field = field;
    if (right) td.classList.add("right");
    if (amountMinus) {
      td.classList.add("amount-minus");
      td.dataset.amountColor = "1";
      td.dataset.amountForce = "minus";
    }

    const cell = document.createElement("div");
    cell.className = "cell";

    const view = document.createElement("span");
    view.className = "cell-view";
    view.dataset.view = field;
    if (amountMinus) {
      view.dataset.amountColor = "1";
      view.dataset.amountForce = "minus";
    }
    view.textContent = viewText;

    const edit = document.createElement("span");
    edit.className = "cell-edit";

    const input = document.createElement("input");
    input.type = inputType;
    input.dataset.field = field;
    if (step != null) input.step = String(step);
    if (min != null) input.min = String(min);
    input.value =
      inputType === "number" ? String(parseNumberLike(viewText) || 0) : String(viewText ?? "");

    // 품목명(name) 칸은 '...' 버튼으로 품목 선택 모달을 열 수 있게 한다.
    if (field === "name") {
      edit.classList.add("purchase-item-cell", "tx-item-cell");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-btn tx-item-btn js-item-picker";
      btn.setAttribute("aria-label", "품목 선택");
      btn.textContent = "...";

      const historySelect = document.createElement("select");
      historySelect.className = "item-history-select tx-item-history-select js-item-history";
      historySelect.setAttribute("aria-label", "이전 품목 선택");
      historySelect.innerHTML = '<option value="">이전 품목 선택</option>';

      edit.appendChild(input);
      edit.appendChild(btn);
      edit.appendChild(historySelect);
    } else {
      edit.appendChild(input);
    }
    cell.appendChild(view);
    cell.appendChild(edit);
    td.appendChild(cell);
    return td;
  };

  (records || []).forEach((rec, index) => {
    const tr = document.createElement("tr");
    tr.classList.add("purchase-entry-row");
    tr.dataset.index = String(index);
    tr.dataset.entryIndex = String(index);

    const tdType = document.createElement("td");
    tdType.classList.add("center");
    tdType.innerHTML =
      '<div class="cell"><span class="cell-view">' +
      String(rec?.rawType || "매입") +
      '</span><span class="cell-edit">' +
      String(rec?.rawType || "매입") +
      "</span></div>";
    tr.appendChild(tdType);

    tr.appendChild(
      makeCell({ field: "code", viewText: String(rec?.code ?? ""), inputType: "text" }),
    );
    tr.appendChild(
      makeCell({ field: "name", viewText: String(rec?.name ?? ""), inputType: "text" }),
    );
    tr.appendChild(
      makeCell({ field: "spec", viewText: String(rec?.spec ?? ""), inputType: "text" }),
    );
    tr.appendChild(
      makeCell({ field: "unit", viewText: String(rec?.unit ?? ""), inputType: "text" }),
    );
    tr.appendChild(
      makeCell({
        field: "qty",
        viewText: formatQuantity(rec?.qty),
        inputType: "number",
        right: true,
        step: "0.01",
      }),
    );
    tr.appendChild(
      makeCell({
        field: "unitPrice",
        viewText: formatMoney(rec?.unitPrice),
        inputType: "number",
        right: true,
        step: "1",
        min: "0",
      }),
    );
    tr.appendChild(
      makeCell({
        field: "total",
        viewText: formatMoney(rec?.total),
        inputType: "number",
        right: true,
        step: "1",
        amountMinus: true,
      }),
    );

    // number input은 포맷(1,000) 대신 실제 숫자를 value에 넣는다.
    syncImportCellByModel(tr, rec, "qty");
    syncImportCellByModel(tr, rec, "unitPrice");
    syncImportCellByModel(tr, rec, "total");

    refreshImportRowMissingState(tr, rec);
    importResultBody.appendChild(tr);
  });

  // 인식 결과표의 ▼(이전 품목 선택) 옵션 채우기
  populateImportItemHistorySelects();

  if (records && records.length) {
    if (importActiveIndex < 0 || importActiveIndex >= records.length) {
      importActiveIndex = 0;
    }
    const order = getImportFieldOrder();
    if (!order.includes(importActiveField)) importActiveField = order[0];
    applyImportActiveStyles();
  } else {
    importActiveIndex = -1;
  }
}

function updateImportSummary(records) {
  if (!importCountSpan || !importQtySpan || !importAmountSpan) return;
  if (!records || !records.length) {
    importCountSpan.textContent = "0";
    importQtySpan.textContent = "0";
    importAmountSpan.textContent = "0";
    importAmountSpan.dataset.amountValue = "0";
    return;
  }

  const count = records.length;
  const sumQty = records.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
  const sumAmount = records.reduce((acc, r) => acc + (Number(r.total) || 0), 0);

  importCountSpan.textContent = count.toLocaleString();
  importQtySpan.textContent = formatQuantity(sumQty);
  importAmountSpan.textContent = formatMoney(sumAmount);
  importAmountSpan.dataset.amountValue = String(sumAmount);
}

function setImportStatus(text) {
  if (!importStatus) return;
  importStatus.textContent = text || "";
}

function splitImportLinePreserveEmpty(line) {
  const raw = String(line || "");
  if (raw.includes("\t")) {
    // 탭 구분은 빈 칸(\t\t)도 열로 유지해야 한다.
    return raw.split("\t").map((c) => String(c ?? "").trim());
  }
  // 탭이 없으면 공백 기반으로 fallback(빈 칸은 복원 불가)
  return raw.trim().split(/\s+/).map((c) => String(c ?? "").trim());
}

function isTaxTypeToken(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  if (s === "면세") return true;
  if (s === "과세" || s === "과세10%" || s === "과세 10%") return true;
  if (s.startsWith("과세")) return true;
  return false;
}

function isNumberToken(v) {
  const cleaned = String(v ?? "").replace(/,/g, "").trim();
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function looksLikeCodeToken(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  return /^\d{3,}$/.test(s);
}

// 탭이 없는(공백 복사) 행을 12칸(구분~창고)으로 최대한 복원
function parseImportLineHeuristicToCols(line) {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  let end = tokens.length - 1;
  let warehouse = "";
  if (end >= 0 && !isNumberToken(tokens[end]) && !isTaxTypeToken(tokens[end])) {
    warehouse = tokens[end];
    end -= 1;
  }

  const nums = [];
  while (end >= 0 && nums.length < 5) {
    if (!isNumberToken(tokens[end])) break;
    nums.push(tokens[end]);
    end -= 1;
  }
  if (nums.length < 3) return null;

  const total = nums[0] ?? "";
  const taxAmount = nums[1] ?? "";
  const supplyAmount = nums[2] ?? "";
  const unitPrice = nums[3] ?? "";
  const qty = nums[4] ?? "";

  let taxType = "";
  if (end >= 0 && isTaxTypeToken(tokens[end])) {
    taxType = tokens[end];
    end -= 1;
  }

  let unit = "";
  if (end >= 0 && !isNumberToken(tokens[end]) && !isTaxTypeToken(tokens[end])) {
    unit = tokens[end];
    end -= 1;
  }

  const head = tokens.slice(0, end + 1);
  if (!head.length) return null;

  const rawType = head[0] || "";
  let code = "";
  let name = "";
  let spec = "";

  const rest = head.slice(1);
  if (rest.length && looksLikeCodeToken(rest[0])) {
    code = rest[0] || "";
    name = rest[1] || "";
    spec = rest.slice(2).join(" ");
  } else {
    name = rest[0] || "";
    spec = rest.slice(1).join(" ");
  }

  return [
    rawType,
    code,
    name,
    spec,
    unit,
    taxType,
    qty,
    unitPrice,
    supplyAmount,
    taxAmount,
    total,
    warehouse,
  ];
}

function parseImportLineToCols(line) {
  const raw = String(line || "");
  if (raw.includes("\t")) return splitImportLinePreserveEmpty(raw);
  return parseImportLineHeuristicToCols(raw) || splitImportLinePreserveEmpty(raw);
}

function normalizeImportTextHeader(rawText) {
  const text = String(rawText || "");
  if (!text) return text;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "");
    if (!line.trim()) continue;
    // 사용자가 붙여넣는 레거시 헤더를 새 표기(구분)로 정규화
    if (line.trimStart().startsWith("거래구분")) {
      lines[i] = line.replace(/^(\s*)거래구분/, "$1구분");
    }
    break;
  }
  return lines.join("\n");
}

function normalizeImportTextColumns(rawText) {
  const text = String(rawText || "");
  if (!text) return text;

  const lines = text.split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineRaw = String(lines[i] || "");
    if (!lineRaw.trim()) continue;

    // 헤더는 그대로 유지(헤더 문구 치환은 normalizeImportTextHeader에서 처리)
    if (lineRaw.trimStart().startsWith("구분") || lineRaw.trimStart().startsWith("거래구분")) {
      out.push(lineRaw.trim());
      continue;
    }

    const cols = parseImportLineToCols(lineRaw);
    while (cols.length < 12) cols.push("");

    const fixed = cols.slice(0, 12);
    if (cols.length > 12) {
      fixed[11] = [fixed[11], ...cols.slice(12)].filter(Boolean).join(" ");
    }

    out.push(fixed.join("\t"));
  }

  return out.join("\n");
}

function normalizeImportText(rawText) {
  const headerNormalized = normalizeImportTextHeader(rawText);
  return normalizeImportTextColumns(headerNormalized);
}

function openImportModal() {
  if (!importModal) return;
  // 인식 모달을 열 때 기본 날짜/분류/매입처를 현재 상태와 동기화
  if (importDateInput) {
    const baseDate =
      dateInput && dateInput.value ? dateInput.value : todayYMD();
    importDateInput.value = baseDate;
    updateImportDateWeekday();
  }

  if (importKindSelect) {
    // 왼쪽 거래처에서 선택한 분류가 있으면 우선 적용
    if (currentSelectedSupplierGroupName) {
      importKindSelect.value = currentSelectedSupplierGroupName;
    }
  }

  // 분류에 맞는 매입처 목록 구성 및 기본 매입처 선택
  rebuildImportSupplierSelectForCurrentKind();

  openModalOverlay(importModal);
  purchaseImportModalDirty.markClean();
  if (typeof purchaseImportModalEscOff === "function")
    purchaseImportModalEscOff();
  purchaseImportModalEscOff = registerModalEscClose(
    importModal,
    closeImportModalWithConfirm,
  );
}

function closeImportModal() {
  closeImportModalWithConfirm();
}

function updateTypeSwitchButtons() {
  if (!typeSwitchButtons || !typeSwitchButtons.length) return;
  typeSwitchButtons.forEach((btn) => {
    const targetType = btn.dataset.groupType;
    const isActive = targetType === groupTypeFilter;
    btn.classList.toggle("is-active", Boolean(isActive));
    btn.setAttribute("aria-pressed", String(Boolean(isActive)));
  });
}

function getTargetSupplierGroupForModal() {
  // 1) 왼쪽 거래처 목록에서 선택한 거래처가 있으면 그 거래처의 분류를 우선
  if (currentSelectedSupplierGroupName) return currentSelectedSupplierGroupName;
  // 2) 왼쪽 분류(그룹) 선택이 있으면 그 값을 사용
  if (selectedSupplierGroup) return selectedSupplierGroup;
  return "";
}

function rebuildSupplierGroups() {
  const baseList = getActiveCustomersByType(allCustomers, groupTypeFilter);

  // 1) 현재 유형(매출처/매입처/지출처)에 해당하는 분류 마스터를 우선 반영
  const wantedType = String(groupTypeFilter || "").trim();
  const masters = (Array.isArray(customerGroupMasters) ? customerGroupMasters : [])
    .filter((g) => g && g.name)
    .filter((g) => {
      const t = String(g.type || "").trim();
      if (!t) return true; // 공통 분류(구분 미지정)
      return t === wantedType;
    });

  // 2) 실제 거래처가 사용하는 분류 count 집계
  const counts = new Map();
  baseList.forEach((customer) => {
    if (!customer) return;
    const groupName = String(customer.group || "미분류").trim() || "미분류";
    counts.set(groupName, (counts.get(groupName) || 0) + 1);
  });

  // 3) 마스터 + 레거시 분류명 합치기
  const map = new Map();
  masters.forEach((g) => {
    const name = String(g.name || "").trim();
    if (!name) return;
    map.set(name, {
      name,
      code: String(g.code || "").trim(),
      count: counts.get(name) || 0,
    });
  });
  counts.forEach((count, name) => {
    if (!name) return;
    if (map.has(name)) return;
    map.set(name, { name, code: "", count });
  });

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const ac = String(a.code || "").trim();
    const bc = String(b.code || "").trim();
    if (ac && bc) return ac.localeCompare(bc, "ko");
    if (ac && !bc) return -1;
    if (!ac && bc) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "ko");
  });

  // 코드가 없으면 화면용 순번 코드(001, 002, ...) 자동 부여
  supplierGroups = list.map((g, index) => ({
    ...g,
    code: String(g.code || "").trim() || String(index + 1).padStart(3, "0"),
  }));

  if (
    selectedSupplierGroup &&
    !supplierGroups.some((g) => g.name === selectedSupplierGroup)
  ) {
    selectedSupplierGroup = "";
  }
  // 콤보박스 옵션 갱신
  if (groupSelect) {
    groupSelect.innerHTML =
      '<option value="">전체</option>' +
      supplierGroups
        .map((g) => `<option value="${g.name}">${g.name}</option>`)
        .join("");
    if (selectedSupplierGroup) {
      groupSelect.value = selectedSupplierGroup;
    }
  }
  // 매입 인식 모달 상단 분류 콤보박스도 동일한 목록으로 구성
  if (importKindSelect) {
    importKindSelect.innerHTML = supplierGroups
      .map((g) => `<option value="${g.name}">${g.name}</option>`)
      .join("");
  }
  renderSupplierGroups();
  renderSuppliersForSelectedGroup();
}

function renderSupplierGroups() {
  if (groupHint) {
    const typeText = getTypeShortLabel(groupTypeFilter);
    if (selectedSupplierGroup) {
      groupHint.textContent = `현재 선택: ${selectedSupplierGroup}`;
    } else {
      groupHint.textContent =
        groupTypeFilter === "매입처"
          ? "분류를 선택하면 아래에 해당 분류의 매입 거래처가 표시됩니다."
          : groupTypeFilter === "매출처"
            ? "분류를 선택하면 아래에 해당 분류의 매출 거래처가 표시됩니다."
            : `${typeText} 분류는 목록 확인용입니다.`;
    }
  }
}

function renderSuppliersForSelectedGroup() {
  if (!supplierListBody) return;
  const baseList = getActiveCustomersByType(allCustomers, groupTypeFilter);
  const targetGroup = selectedSupplierGroup || "";

  const filtered = baseList.filter((c) => {
    if (!c) return false;
    if (!targetGroup) return true;
    return (c.group || "미분류") === targetGroup;
  });

  supplierListBody.innerHTML = "";

  if (!filtered.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="2">해당 분류의 매입 거래처가 없습니다.</td>';
    supplierListBody.appendChild(tr);
    if (supplierTotalSpan) supplierTotalSpan.textContent = "0";
    return;
  }

  const sortKey = supplierListSort?.key || "id";
  const sortDir = supplierListSort?.direction || "asc";
  const sorted = sortByKey(filtered, sortKey, sortDir);

  sorted.forEach((c) => {
      const tr = document.createElement("tr");
      if (currentSupplierFilterId && String(c.id) === String(currentSupplierFilterId)) {
        tr.classList.add("selected");
      }
      tr.innerHTML = `
        <td>${c.id || ""}</td>
        <td>${c.name || ""}</td>
      `;
      const supplierGroupName = c.group || "미분류";

      tr.dataset.id = c.id || "";
      tr.dataset.groupName = supplierGroupName;
      supplierListBody.appendChild(tr);
    });
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
    renderSuppliersForSelectedGroup();
  });
}

// 왼쪽 거래처 목록: 방향키/엔터로 거래처를 선택/신규 매입 입력 모달 열기
if (supplierListBody) {
  // 클릭 선택(선택 표시 + 필터 반영) 공통 위임
  bindClickRowSelect(supplierListBody, {
    rowSelector: 'tr[data-id]',
    onSelect: async (row) => {
      // 키보드 방향키로도 이동할 수 있도록 tbody에 포커스를 준다.
      if (typeof supplierListBody.focus === 'function') {
        supplierListBody.focus();
      }

      const id = row.dataset.id || '';
      if (!id) return;
      const groupName = row.dataset.groupName || '미분류';

      currentSelectedSupplierId = id;
      currentSelectedSupplierGroupName = groupName;

      // 왼쪽 거래처 선택 시, 상단/하단 모두 해당 거래처 내역만 보이도록 필터
      currentSupplierFilterId = id;
      transactionViewRequested = true;

      // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정 + 1회 강제 스크롤
      currentSort = { key: "date", direction: "asc" };
      purchaseListAutoScroll.forceNext();
      purchaseSummaryAutoScroll.forceNext();
      purchaseSummaryAutoScroll.forceNext();

      // 거래처 필터가 우선: 이전에 선택해 둔 요약/상세 선택 상태는 초기화한다.
      currentEditingId = null;
      currentSummaryKey = '';
      currentSummaryBatchKey = '';
      currentSummaryDateForFilter = '';
      currentSummarySupplierIdForFilter = '';
      await reloadPurchaseList();
    },
  });

  // 방향키 이동 및 Enter 처리를 공통 헬퍼로 처리
  enableTableArrowNavigation(supplierListBody, {
    onSelect: (row) => row.click(),
    enableEnter: true,
    onEnter: () => {
      if (typeof btnNew?.click === "function") {
        btnNew.click();
      }
    },
  });
}

// 상단 전표 요약: 방향키로 위/아래 전표를 선택할 수 있게 처리
if (purchaseSummaryBody) {
  // 클릭 선택(요약 선택 + 상세 필터 반영) 공통 위임
  bindClickRowSelect(purchaseSummaryBody, {
    rowSelector: 'tr.purchase-summary-has-data[data-is-carry-over="0"]',
    onSelect: (row) => {
      if (purchaseSummaryBody && typeof purchaseSummaryBody.focus === 'function') {
        purchaseSummaryBody.focus();
      }

      currentEditingId = null;
      currentSummaryKey = row.dataset.summaryKey || '';

      // 지불 요약 선택 시에는 legacy 필터 값이 섞이지 않도록 비워 둔다.
      if (currentSummaryKey && currentSummaryKey.startsWith('PAY__')) {
        currentSummaryBatchKey = '';
        currentSummaryDateForFilter = '';
        currentSummarySupplierIdForFilter = '';
      } else {
        currentSummaryBatchKey = row.dataset.batchKey || '';
        currentSummaryDateForFilter = row.dataset.date || '';
        currentSummarySupplierIdForFilter = row.dataset.supplierId || '';
      }
      isSummaryFilterActive = true;
      renderList(searchInput ? searchInput.value : '');
    },
  });

  enableTableArrowNavigation(purchaseSummaryBody, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });
}

// 하단 상세내역 테이블: 방향키로 위/아래 상세 행을 선택할 수 있게 처리
if (listBody) {
  // 클릭 선택(상세 선택 + 요약 하이라이트 동기화) 공통 위임
  bindClickRowSelect(listBody, {
    rowSelector: 'tr[data-id]',
    onSelect: (row) => {
      if (typeof listBody.focus === 'function') {
        listBody.focus();
      }

      const idRaw = row.dataset.id || '';
      const idNum = Number(idRaw);
      currentEditingId = Number.isFinite(idNum) ? idNum : idRaw || null;

      currentSummaryKey = row.dataset.summaryKey || '';
      currentSummaryBatchKey = row.dataset.batchKey || '';
      currentSummaryDateForFilter = row.dataset.date || '';
      currentSummarySupplierIdForFilter = row.dataset.supplierId || '';
      isSummaryFilterActive = true;

      const summaryRows = document.querySelectorAll(
        '.purchase-summary-table tbody tr',
      );
      summaryRows.forEach((r) => r.classList.remove('selected'));
      summaryRows.forEach((r) => {
        if (
          r &&
          r.dataset &&
          r.dataset.summaryKey &&
          r.dataset.summaryKey === currentSummaryKey
        ) {
          r.classList.add('selected');
        }
      });
    },
  });

  enableTableArrowNavigation(listBody, {
    onSelect: (row) => row.click(),
    enableEnter: true,
  });
}

// 왼쪽 거래처 목록에서 선택해 둔 매입처/분류를
// "매입 등록" 모달의 분류/매입처 필드 기본값으로 적용한다.
function applyDefaultSupplierForNewPurchase() {
  if (!currentSelectedSupplierId) return;

  // 현재 분류에 맞는 거래처 목록으로 매입처 콤보박스를 다시 구성하고,
  // 가능하면 왼쪽에서 선택한 거래처를 기본 선택으로 둔다.
  rebuildSupplierSelectForCurrentKind(getTargetSupplierGroupForModal());
}

function renderList(keyword = "") {
  if (!listBody) return;
  // 하단 상세내역은 상단 전표를 선택(클릭)했을 때만 보여준다.
  if (!isSummaryFilterActive) {
    listBody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.textContent = "상단 전표를 선택하면 상세내역이 표시됩니다.";
    tr.appendChild(td);
    listBody.appendChild(tr);
    return;
  }

  // 상세내역에서는 검색어로 전표 내 다른 품목을 제거하지 않는다.
  // (검색어는 상단 요약의 적요 우선 표시/전표 찾기 용도)
  const groupFiltered = applySupplierGroupFilter(purchases, {
    enabled: groupTypeFilter === "매입처" && Boolean(selectedSupplierGroup),
    selectedGroupName: selectedSupplierGroup,
    getGroupNameForRow: (p) => getSupplierGroupNameForRow(p),
  });

  // 왼쪽 거래처 목록에서 특정 거래처를 선택했다면, 해당 거래처 내역만 남긴다.
  const supplierFiltered = currentSupplierFilterId
    ? groupFiltered.filter((p) => p.supplierId === currentSupplierFilterId)
    : groupFiltered;

  // 날짜 범위 필터 적용
  let baseFiltered = supplierFiltered;
  if (dateFilterFrom || dateFilterTo) {
    baseFiltered = baseFiltered.filter((p) => {
      const d = p.date || "";
      if (!d) return false;
      if (dateFilterFrom && d < dateFilterFrom) return false;
      if (dateFilterTo && d > dateFilterTo) return false;
      return true;
    });
  }

  // 하단 상세내역은 '매입 품목' 중심으로 보여준다.
  // 지불 전표(금액=0, payment>0)는 요약에서만 선택/삭제/수정하도록 상세 목록에서 제외한다.
  baseFiltered = baseFiltered.filter((p) => !isPaymentOnlyTransaction(p));

  // 상단 요약 칸에서 필터가 활성화된 경우, summaryKey 기반으로 해당 그룹만 보여준다.
  let summaryFiltered = baseFiltered;
  if (isSummaryFilterActive) {
    let key = currentSummaryKey || "";
    if (!key) {
      if (currentSummaryBatchKey) {
        key = `BATCH__${currentSummaryBatchKey}`;
      } else if (
        currentSummaryDateForFilter &&
        currentSummarySupplierIdForFilter
      ) {
        key = `DATE__${currentSummaryDateForFilter}__${currentSummarySupplierIdForFilter}`;
      }
    }

    if (key && key.startsWith("PAY__")) {
      // 지불을 선택한 경우 하단 상세내역은 비운다.
      summaryFiltered = [];
    } else if (key && key.startsWith("BATCH__")) {
      const batchKey = key.replace(/^BATCH__/, "");
      summaryFiltered = baseFiltered.filter(
        (p) => String(p.batchKey || "") === String(batchKey),
      );
    } else if (key && key.startsWith("DATE__")) {
      const rest = key.replace(/^DATE__/, "");
      const [d, sid] = rest.split("__");
      summaryFiltered = baseFiltered.filter(
        (p) =>
          !p.batchKey &&
          String(p.date || "") === String(d || "") &&
          String(p.supplierId || "") === String(sid || ""),
      );
    }
  }

  const numericKeys = ["quantity", "unitPrice", "amount"];
  const sorted = (() => {
    if (currentSort.key !== "date") {
      return currentSort.key
        ? sortByKey(
            summaryFiltered,
            currentSort.key,
            currentSort.direction,
            numericKeys,
          )
        : summaryFiltered;
    }

    const dir = currentSort.direction === "asc" ? 1 : -1;
    return (summaryFiltered || []).slice().sort((a, b) => {
      const ad = String(a?.date || "");
      const bd = String(b?.date || "");

      if (ad && bd) {
        if (ad < bd) return -1 * dir;
        if (ad > bd) return 1 * dir;
      } else if (ad && !bd) {
        return 1 * dir;
      } else if (!ad && bd) {
        return -1 * dir;
      }

      const ai = Number(a?.id);
      const bi = Number(b?.id);
      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) {
        return (ai - bi) * dir;
      }
      return 0;
    });
  })();

  listBody.innerHTML = "";
  let sum = 0;
  let sumQty = 0;

  sorted.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id;
    tr.dataset.batchKey = p.batchKey || '';
    tr.dataset.date = p.date || '';
    tr.dataset.supplierId = p.supplierId || '';
    tr.dataset.summaryKey = makeSummaryKeyForTransaction(p);
    const quantity = Number(p.quantity ?? 0);
    const unitPrice = Number(p.unitPrice ?? 0);
    const fallbackSupply = Math.round(quantity * unitPrice);
    const supplyAmount =
      p.supplyAmount != null ? Number(p.supplyAmount) : fallbackSupply;
    const taxAmount =
      p.taxAmount != null
        ? Number(p.taxAmount)
        : Math.max(0, Number(p.amount ?? 0) - supplyAmount);
    const totalAmount = Number(p.amount ?? supplyAmount + taxAmount);
    sum += Number.isFinite(totalAmount) ? totalAmount : 0;
    sumQty += Number.isFinite(quantity) ? quantity : 0;
    const code = p.itemCode || p.itemId || "";
    const spec = p.itemSpec || "";
    tr.innerHTML = `
      <td>${p.date || ""}</td>
      <td>매입</td>
      <td>${code}</td>
      <td>${p.itemName || ""}</td>
      <td>${spec}</td>
      <td>${p.unit || ""}</td>
      <td class="right">${formatQuantity(quantity)}</td>
      <td class="right">${formatMoney(unitPrice)}</td>
      <td class="right" data-amount-color="1" data-amount-force="minus">${formatMoney(totalAmount)}</td>
      <td>${p.memo || ""}</td>
    `;
    listBody.appendChild(tr);
  });

  // 최신 거래가 바로 보이도록 스크롤을 아래로 이동
  purchaseListAutoScroll.scroll(listBody);
}

async function reloadPurchaseList() {
  if (!transactionViewRequested) {
    refreshSummaryAndDetail();
    return;
  }
  const [list, cashflowItems, cashflowTypes] = await Promise.all([
    getTransactions(),
    getCashflowItems(),
    getCashflowTypes(),
  ]);

  cashflowItemNameByCode = new Map(
    (cashflowItems || [])
      .filter((it) => it && it.code)
      .map((it) => [String(it.code).trim(), String(it.name || it.code).trim()]),
  );
  cashflowTypeNameByCode = new Map(
    (cashflowTypes || [])
      .filter((t) => t && t.code)
      .map((t) => [String(t.code).trim(), String(t.name || t.code).trim()]),
  );

  // 과거/특정 플로우에서 supplierId가 비어 저장되는 경우가 있어,
  // supplierName에 거래처 코드(id) 또는 거래처명(name)이 들어있는 레코드는 자동 복구한다.
  // (supplierId가 비면 요약/상세 로직에서 전표가 아예 제외되어 화면에 안 보일 수 있음)
  try {
    if (Array.isArray(list) && Array.isArray(suppliers) && suppliers.length) {
      const supplierById = new Map(
        suppliers
          .map((s) => [String(s?.id ?? '').trim(), s])
          .filter(([id]) => Boolean(id)),
      );
      const supplierByName = new Map(
        suppliers
          .map((s) => [String(s?.name ?? '').trim().toLowerCase(), s])
          .filter(([name]) => Boolean(name)),
      );

      const resolveSupplierFromText = (rawText) => {
        const text = String(rawText || '').trim();
        if (!text) return null;
        // 코드(cashflowItemCode/cashflowCode/accountId) -> 현재 마스터 라벨만 사용한다.
        // 레거시 텍스트(cashflowItemName/accountName)는 일절 사용하지 않는다.
        if (direct) return direct;

        // 2) "0003 강원축산" 같은 형태: 첫 토큰을 코드로 시도
        const head = text.split(/\s+/).filter(Boolean)[0];
        if (head) {
          const byHead = supplierById.get(head);
          if (byHead) return byHead;
        }

        // 3) 본문 중 4자리 숫자 코드가 있는 경우(거래처 코드 규칙: 0001 등)
        const m = text.match(/\b\d{4}\b/);
        if (m && m[0]) {
          const byDigits = supplierById.get(m[0]);
          if (byDigits) return byDigits;
        }

        // 4) 거래처명 정확히 일치(대소문자 무시)
        const byName = supplierByName.get(text.toLowerCase());
        if (byName) return byName;

        return null;
      };

      for (const tx of list) {
        if (!tx) continue;
        if (tx.category !== transactionCategory) continue;
        if (String(tx.supplierId || '').trim()) continue;
        const seed = String(tx.supplierName || '').trim();
        if (!seed) continue;

        const sup = resolveSupplierFromText(seed);
        if (!sup) continue;

        const shouldReplaceName = !seed || seed === String(sup.id ?? '').trim();
        const fixed = {
          ...tx,
          supplierId: String(sup.id || seed),
          supplierName: shouldReplaceName
            ? String(sup.name || sup.id || seed)
            : String(tx.supplierName || '').trim(),
          supplierGroup: tx.supplierGroup || sup.group || '미분류',
        };
        await updateTransaction(fixed);
        Object.assign(tx, fixed);
      }
    }
  } catch (_) {
    // 복구 실패는 치명적이지 않으므로 무시
  }

  purchases = list
    .filter((tx) => tx && tx.category === transactionCategory)
    .map((tx) => {
      const supplierGroup = getSupplierGroupNameForRow(tx);
      return { ...tx, id: tx.id, supplierGroup };
    });

  // 레거시 지불 전표 보정:
  // 과거에는 지불 전표의 memo(항목/적요)만 저장하고 ledgerName(장부명)이 비어있는 경우가 있어
  // 화면에서 항목이 "장부명" 칸으로 파싱되어 표시된다.
  // ledgerTxId 로 연결된 ledger_tx 에서 통장/장부명을 가져와 ledgerName 을 채운다.
  try {
    try {
      await repairLedgerTxCashflowItemFieldsIfNeeded();
    } catch (_) {
      // 보정 실패는 치명적이지 않으므로 무시
    }

    const cache = new Map();
    const looksLikeCodeToken = (token) => {
      const t = String(token || "").trim();
      if (!t) return false;
      // 예: A0001, A01 등
      if (/^A\d{2,4}$/.test(t)) return true;
      // 예: 영문+숫자 조합 코드
      if (/^[A-Za-z]+\d+$/.test(t)) return true;
      return false;
    };
    const extractLedgerName = (ledgerTx) => {
      if (!ledgerTx) return "";
      // fallback 완전 제거: 코드로 매핑 가능한 경우에만 표시한다.
      const codeCandidate = String(
        ledgerTx.cashflowItemCode || ledgerTx.cashflowCode || ledgerTx.accountId || "",
      ).trim();
      if (!codeCandidate) return "";
      return resolveLedgerLabelFromCode(codeCandidate) || "";
    };

    const candidates = purchases.filter((tx) => {
      if (!tx) return false;
      const amount = Number(tx.amount) || 0;
      const payment = Number(tx.payment) || 0;
      if (!(amount === 0 && payment > 0)) return false; // 지불 전표
      if (tx.source !== "purchase") return false;
      if (!tx.ledgerTxId) return false;
      // ledgerName 이 이미 있어도, 결제관리에서 장부명이 변경됐을 수 있으므로
      // ledger_tx 의 최신 값을 기준으로 다시 동기화한다.
      return true;
    });

    for (const tx of candidates) {
      const ledgerId = String(tx.ledgerTxId || "").trim();
      if (!ledgerId) continue;
      let ledgerTx = cache.get(ledgerId);
      if (ledgerTx === undefined) {
        ledgerTx = await getLedgerTxById(ledgerId);
        cache.set(ledgerId, ledgerTx || null);
      }
      const ledgerName = extractLedgerName(ledgerTx);
      if (!ledgerName) continue;

      const prev = String(tx.ledgerName || "").trim();
      const next = String(ledgerName || "").trim();
      if (prev === next) continue;

      const nextTx = { ...tx, ledgerName: next };
      await updateTransaction(nextTx);
      Object.assign(tx, { ledgerName: next });
    }
  } catch (_) {
    // 보정 실패는 치명적이지 않으므로 무시
  }

  // 상단 요약 + 하단 상세를 함께 갱신(기본 전표 자동 선택 포함)
  refreshSummaryAndDetail(searchInput ? searchInput.value : "");

  // 거래 내역이 바뀌었으므로 왼쪽 거래처별 잔액 표도 다시 계산해 표시
  renderSuppliersForSelectedGroup();
}

async function loadSuppliersAndItems() {
  allCustomers = await getCustomers();
  const isActiveStatus = (v) => String(v || "active") === "active";

  // 거래처 분류 마스터를 함께 로드해, 거래처가 없는 분류도 UI에 표시
  try {
    customerGroupMasters = (await getCustomerGroups()) || [];
  } catch (_) {
    customerGroupMasters = [];
  }

  // 매입 페이지 기본 대상 거래처는 '매입처'
  suppliers = getActiveCustomersByType(allCustomers, supplierTypeLabel).filter(
    (c) => isActiveStatus(c?.status),
  );
  buildPurchaseSupplierMap();
  rebuildSupplierGroups();
  updateTypeSwitchButtons();

  items = await getItems();
  items = (items || []).filter((it) => isActiveStatus(it?.status));
  if (itemSelect) {
    itemSelect.innerHTML =
      '<option value="">직접입력</option>' +
      (items || [])
        .map((it) => `<option value="${it.id}">${it.name}</option>`)
        .join("");
  }

  // 품목 선택 모달용 분류 목록 로드
  try {
    itemGroups = await getItemGroups();
  } catch (e) {
    itemGroups = [];
  }
  // 분류 전용 박스(왼쪽에 따로 있는 분류 리스트) 렌더링
  renderItemGroupList();
}

// 매입 등록 모달에서 매입처 콤보박스(supplierSelect)에 표시할 거래처 목록을
// (왼쪽에서 선택한 거래처/분류) 기준으로 자동 필터링한다.
function rebuildSupplierSelectForCurrentKind(targetGroupOverride = null) {
  if (!supplierSelect) return;

  const targetGroup =
    targetGroupOverride != null ? targetGroupOverride : getTargetSupplierGroupForModal();

  const baseList = suppliers.filter((c) => (c.type || "").includes("매입"));
  const filtered = targetGroup
    ? baseList.filter((c) => (c.group || "미분류") === targetGroup)
    : baseList;

  const previousValue = supplierSelect.value;

  supplierSelect.innerHTML =
    '<option value="">직접입력</option>' +
    filtered.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  // 가능한 경우, 현재 선택된 거래처 또는 기존 값 유지
  let nextValue = "";
  if (
    currentSelectedSupplierId &&
    filtered.some((s) => s.id === currentSelectedSupplierId)
  ) {
    nextValue = currentSelectedSupplierId;
  } else if (previousValue && filtered.some((s) => s.id === previousValue)) {
    nextValue = previousValue;
  }

  supplierSelect.value = nextValue;
  applySupplierFromSelect();
}

// 매입 인식 모달 상단 분류에 따라 매입처 콤보박스를 구성
function rebuildImportSupplierSelectForCurrentKind() {
  if (!importSupplierSelect) return;

  const targetGroup = importKindSelect ? importKindSelect.value : "";
  const baseList = suppliers.filter((c) => (c.type || "").includes("매입"));
  const filtered = targetGroup
    ? baseList.filter((c) => (c.group || "미분류") === targetGroup)
    : baseList;

  importSupplierSelect.innerHTML =
    '<option value="">직접입력</option>' +
    filtered.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");

  let nextValue = "";
  if (
    currentSelectedSupplierId &&
    filtered.some((s) => s.id === currentSelectedSupplierId)
  ) {
    nextValue = currentSelectedSupplierId;
  }

  importSupplierSelect.value = nextValue;
  applyImportSupplierFromSelect();
}

function validateForm() {
  // 입력 컨트롤이 아직 바인딩되지 않았다면 마지막 신규행을 활성화한다.
  if (!itemInput || !specInput || !unitInput || !qtyInput || !unitPriceInput) {
    setActiveEntryIndex(pendingEntries.length);
  }
  if (!itemInput || !specInput || !unitInput || !qtyInput || !unitPriceInput) {
    alert("품목 입력행을 먼저 선택하세요.");
    return false;
  }

  if (!dateInput.value) {
    alert("거래일을 선택하세요.");
    dateInput.focus();
    return false;
  }
  if (!supplierInput.value.trim()) {
    alert("매입처를 입력하세요.");
    supplierInput.focus();
    return false;
  }
  // 거래처 입력칸에 코드가 있더라도, supplierId(select)가 비어 있으면
  // 저장 시 전표가 누락되어 보일 수 있으므로 반드시 선택(코드 확정)되도록 강제한다.
  if (!String(supplierSelect?.value || "").trim()) {
    alert("매입처를 선택하세요.");
    try {
      openMainSupplierPickerModal();
    } catch (_) {
      // ignore
    }
    supplierInput.focus();
    return false;
  }
  if (!itemInput.value.trim()) {
    alert("품목을 입력하세요.");
    itemInput.focus();
    return false;
  }
  if (!specInput.value.trim()) {
    alert("규격을 입력하세요.");
    specInput.focus();
    return false;
  }
  if (!unitInput.value.trim()) {
    alert("단위를 입력하세요.");
    unitInput.focus();
    return false;
  }
  const qty = Number(qtyInput.value || "0");
  if (qty <= 0) {
    alert("수량을 입력하세요.");
    qtyInput.focus();
    return false;
  }
  const price = Number(unitPriceInput.value || "0");
  if (price <= 0) {
    alert("단가를 입력하세요.");
    unitPriceInput.focus();
    return false;
  }
  return true;
}

// 하단 임시 행 추가용 간단 검증: 품목, 수량, 단가만 필수
function validateEntryRow() {
  // 신규 입력행(마지막 행) 기준으로 검증
  if (entryActiveIndex !== pendingEntries.length) {
    setActiveEntryIndex(pendingEntries.length);
  }
  if (!itemInput || !qtyInput || !unitPriceInput) {
    alert("품목 입력행을 먼저 선택하세요.");
    return false;
  }

  // 완전 공란은 행으로 확정하지 않는다(실수로 엔터 눌러도 추가되지 않게)
  const hasAny =
    String(itemInput.value || "").trim() ||
    String(itemCodeInput?.value || "").trim() ||
    String(specInput?.value || "").trim() ||
    String(unitInput?.value || "").trim() ||
    Number(qtyInput.value || "0") !== 0 ||
    Number(unitPriceInput.value || "0") !== 0 ||
    Number(amountInput?.value || "0") !== 0;
  if (!hasAny) return false;

  // 일부 값이 비어 있어도 임시행(pending)으로는 추가한다.
  // 저장 시에는 pending 전체를 다시 검증해 누락이 있으면 막는다.
  return true;
}

function validatePendingEntriesForSave() {
  if (!pendingEntries || !pendingEntries.length) return true;

  for (let i = 0; i < pendingEntries.length; i += 1) {
    const row = pendingEntries[i];
    const missing = getMissingEntryFieldKeys(row);
    if (missing && missing.length) {
      try {
        setActiveEntryIndex(i);
        renderPendingEntryRows();
      } catch (_) {
        // ignore
      }
      alert("빈 칸(빨간색)이 있는 품목 행이 있습니다. 먼저 채운 후 저장하세요.");
      return false;
    }
  }
  return true;
}

function addEntryRowFromInputs() {
  if (!entryBody) return;
  // 신규 입력행(마지막 행)만 확정 대상으로 한다.
  if (entryActiveIndex !== pendingEntries.length) {
    setActiveEntryIndex(pendingEntries.length);
    return;
  }

  updateAmountFields();
  // 여러 행 입력용이므로 전체 폼이 아니라 하단 행만 간단 검증
  if (!validateEntryRow()) return;

  const row = {
    date: (dateInlineInput && dateInlineInput.value) || dateInput.value,
    itemId: itemSelect.value || "",
    itemCode: itemCodeInput.value.trim(),
    itemName: itemInput.value.trim(),
    itemSpec: specInput.value.trim(),
    unit: unitInput.value.trim(),
    quantity: Number(qtyInput.value || "0"),
    unitPrice: Number(unitPriceInput.value || "0"),
    taxType: taxTypeSelect.value,
    supplyAmount: Number(entryDraftRow?.supplyAmount ?? 0) || 0,
    taxAmount: Number(entryDraftRow?.taxAmount ?? 0) || 0,
    amount: Number(amountInput.value || "0"),
    shrinkPercent: shrinkPercentInput ? Number(shrinkPercentInput.value || "0") || 0 : 0,
    shrinkPrice: shrinkPriceInput ? Number(shrinkPriceInput.value || "0") || 0 : 0,
    memo: memoInput ? memoInput.value.trim() : "",
  };

  // 매입 등록에서 입력한 단가/감량율/감량가를 품목 마스터(품목 관리)에 반영
  // - itemId가 없으면 itemCode로 fallback
  // - 단가가 0 이하인 경우는 업데이트하지 않음
  (async () => {
    try {
      const itemId = String(row.itemId || row.itemCode || "").trim();
      if (!itemId) return;
      const price = Number(row.unitPrice || 0) || 0;
      if (price <= 0) return;

      const idx = items.findIndex((it) => String(it?.id || "") === itemId);
      if (idx < 0) return;

      const current = items[idx] || {};
      const updated = {
        ...current,
        id: current.id,
        price,
        shrinkPercent: Number(row.shrinkPercent ?? 0) || 0,
        shrinkPrice: Number(row.shrinkPrice ?? 0) || 0,
      };
      await updateItem(updated);
      items[idx] = updated;
    } catch {
      // 품목 마스터 반영 실패는 입력 UX를 막지 않음
    }
  })();

  pendingEntries.push(row);

  // 신규행(draft) 초기화
  entryDraftRow = buildEmptyEntryDraft();
  entryActiveIndex = pendingEntries.length;
  renderPendingEntryRows();

  // 새로 추가된 행이 항상 보이도록 스크롤을 맨 아래로 이동
  if (entryWrapper) {
    entryWrapper.scrollTop = entryWrapper.scrollHeight;
  }

  // 다음 행 입력을 위해 선택값 초기화(모달 선택 호환용)
  if (itemSelect) itemSelect.value = "";

  updateEntrySummary();

  // 다음 새 항목 입력을 바로 품명 칸에서 시작
  const activeTr = entryBody.querySelector(
    `tr.purchase-entry-row[data-entry-index="${entryActiveIndex}"]`,
  );
  if (activeTr) {
    const fields = getEntryFieldsFromRow(activeTr);
    if (fields.itemName) {
      fields.itemName.focus();
      fields.itemName.select();
    }
  }
}

if (groupSelect) {
  groupSelect.addEventListener("change", () => {
    selectedSupplierGroup = groupSelect.value || "";
    setStoredString(PURCHASE_GROUP_FILTER_STORAGE_KEY, selectedSupplierGroup);
    // 분류 콤보를 바꾸면 개별 거래처 필터는 해제
    currentSupplierFilterId = "";
    transactionViewRequested = false;
    purchases = [];
    currentSummaryKey = "";
    isSummaryFilterActive = false;

    // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정 + 1회 강제 스크롤
    currentSort = { key: "date", direction: "asc" };
    purchaseListAutoScroll.forceNext();
    purchaseSummaryAutoScroll.forceNext();

    renderSupplierGroups();
    renderSuppliersForSelectedGroup();
    refreshSummaryAndDetail(searchInput ? searchInput.value : "");
  });
}

function isEntryRowFilled() {
  if (!entryDraftRow) return false;
  const hasItem = String(entryDraftRow.itemName || "").trim();
  const qty = Number(entryDraftRow.quantity || 0);
  const price = Number(entryDraftRow.unitPrice || 0);
  return !!(hasItem && qty > 0 && price > 0);
}

function renderItemSelectList(keyword = "") {
  if (!itemSelectListBody) return;
  const q = keyword.toLowerCase().trim();
  itemSelectListBody.innerHTML = "";

  items
    .filter((it) => {
      const code = String(it.id || "").toLowerCase();
      const name = String(it.name || "").toLowerCase();
      const spec = String(it.spec || "").toLowerCase();
      const unit = String(it.unit || "").toLowerCase();
      const group = String(it.group || "").toLowerCase();

      const groupFilter = String(selectedItemGroupFilter || "").toLowerCase();

      const matchKeyword =
        !q ||
        code.includes(q) ||
        name.includes(q) ||
        spec.includes(q) ||
        unit.includes(q);

      const matchGroup = !groupFilter || group === groupFilter;

      return matchKeyword && matchGroup;
    })
    .forEach((it) => {
      const tr = document.createElement("tr");
      tr.dataset.id = it.id;
      tr.innerHTML = `
        <td>${it.id || ""}</td>
        <td>${it.name || ""}</td>
        <td>${it.spec || ""}</td>
        <td>${it.unit || ""}</td>
        <td class="right">${Number(it.price ?? 0).toLocaleString()}</td>
      `;
      itemSelectListBody.appendChild(tr);
    });
}

// 품목 선택 모달: 더블클릭=확정(공통 위임)
if (itemSelectListBody) {
  bindDblClickRowConfirm(itemSelectListBody, {
    rowSelector: 'tr[data-id]',
    onConfirm: (row) => {
      selectedItemIdForEntry = String(row?.dataset?.id || '');
      applyItemFromModal();
    },
  });

  // 품목 선택 모달: 클릭=선택(공통 위임)
  bindClickRowSelect(itemSelectListBody, {
    rowSelector: 'tr[data-id]',
    onSelect: (row) => {
      selectedItemIdForEntry = String(row?.dataset?.id || '');
    },
  });
}

// 품목 선택 모달(좌측 분류): 클릭=선택(공통 위임)
if (itemGroupListBody) {
  bindClickRowSelect(itemGroupListBody, {
    rowSelector: 'tr[data-value]',
    onSelect: (row) => {
      selectedItemGroupFilter = String(row?.dataset?.value || '');
      highlightItemGroupSelection(selectedItemGroupFilter);
      renderItemSelectList(itemSelectSearchInput ? itemSelectSearchInput.value : '');
    },
  });
}

function highlightItemGroupSelection(selectedValue) {
  if (!itemGroupListBody) return;
  const selectedKey = String(selectedValue || "");
  itemGroupListBody.querySelectorAll("tr").forEach((tr) => {
    const value = String(tr.dataset.value || "");
    if (value === selectedKey) {
      tr.classList.add("selected");
    } else {
      tr.classList.remove("selected");
    }
  });
}

function renderItemGroupList() {
  if (!itemGroupListBody) return;
  itemGroupListBody.innerHTML = "";

  const currentFilter = selectedItemGroupFilter || "";

  // "전체" 행
  const allRow = document.createElement("tr");
  allRow.dataset.value = "";
  allRow.innerHTML = "<td>전체</td>";
  itemGroupListBody.appendChild(allRow);

  (itemGroups || []).forEach((g) => {
    const value = g.name || "";
    const tr = document.createElement("tr");
    tr.dataset.value = value;
    tr.innerHTML = `<td>${value}</td>`;
    itemGroupListBody.appendChild(tr);
  });

  highlightItemGroupSelection(currentFilter);
}

function openItemSelectModal(mode = "input", entryIndex = -1) {
  if (!itemSelectModal) return;

  itemApplyMode = mode;
  itemApplyEntryIndex = entryIndex;

  if (mode === "inline" && entryIndex >= 0) {
    if (entryIndex < pendingEntries.length && pendingEntries[entryIndex]) {
      selectedItemIdForEntry = pendingEntries[entryIndex].itemId || "";
    } else if (entryIndex === pendingEntries.length) {
      if (!entryDraftRow) entryDraftRow = buildEmptyEntryDraft();
      selectedItemIdForEntry = entryDraftRow.itemId || "";
    } else {
      selectedItemIdForEntry = "";
    }
  } else if (mode === "import" && entryIndex >= 0) {
    const rec = importRecords && importRecords[entryIndex] ? importRecords[entryIndex] : null;
    selectedItemIdForEntry = rec ? String(rec.code || "").trim() : "";
  } else if (itemSelect) {
    selectedItemIdForEntry = itemSelect.value || "";
  } else {
    selectedItemIdForEntry = "";
  }

  openModalOverlay(itemSelectModal);
  renderItemSelectList(
    itemSelectSearchInput ? itemSelectSearchInput.value : "",
  );

  // 모달을 열면 검색창에 포커스를 주어, 바로 방향키/Enter를 사용할 수 있게 한다.
  if (
    itemSelectSearchInput &&
    typeof itemSelectSearchInput.focus === "function"
  ) {
    itemSelectSearchInput.focus();
    itemSelectSearchInput.select();
  }
}

function closeItemSelectModal() {
  if (!itemSelectModal) return;
  closeModalOverlay(itemSelectModal);
}

// 상단 전표(요약)에서 선택한 건을 기준으로 여러 행 수정 모드로 진입
async function startBatchEditFromSummary() {
  const group = getCurrentSummaryGroupTransactions();
  if (!group.length) {
    alert("먼저 수정할 전표를 선택하세요.");
    return;
  }

  // 통합결제 화면에서 자동 등록된 매입 결제(통합결제 source 또는 [통합결제]/[입출금] 메모)가
  // 포함된 전표는 매입 화면에서 수정할 수 없도록 막는다.
  const hasImported = await hasLockedPaymentEntries(group);
  if (hasImported) {
    alert(
      "이 매입 결제 전표에는 통합결제 화면에서 자동 등록된 내역이 포함되어 있습니다.\n매입 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
    );
    return;
  }

  // 폼을 초기화한 뒤, 선택된 전표 정보를 다시 채운다.
  resetForm();

  isBatchEditMode = true;
  showInputRowInBatchEdit = false;
  editingBatchOriginalIds = group
    .map((p) => p.id)
    .filter((id) => id !== undefined && id !== null);
  editingBatchKey = group[0].batchKey || "";

  const first = group[0];

  // 상단 기본 정보 채우기
  if (dateInput) {
    dateInput.value = first.date || todayYMD();
  }
  if (dateInlineInput) {
    dateInlineInput.value = dateInput.value;
  }
  updateDateWeekday();

  // 전표의 거래처/분류를 기준으로 분류 셀렉트와 거래처 콤보를 다시 구성한다.
  const matchedSupplier = suppliers.find(
    (s) => s.id === (first.supplierId || ""),
  );
  const supplierGroupName = matchedSupplier
    ? matchedSupplier.group || "미분류"
    : first.supplierGroup || "미분류";

  // 선택된 분류 기준으로 매입처 콤보박스를 다시 채운 뒤, 해당 거래처를 선택
  rebuildSupplierSelectForCurrentKind(supplierGroupName);

  if (supplierSelect) {
    supplierSelect.value = first.supplierId || "";
  }

  if (supplierInput) {
    const code = matchedSupplier
      ? matchedSupplier.id || ""
      : first.supplierId || "";
    supplierInput.value = code;
  }

  if (supplierBalanceInput) {
    const bal = getSupplierCurrentBalance(first.supplierId || "");
    const safeBal = Number.isFinite(bal) ? bal : 0;
    supplierBalanceInput.value = safeBal.toLocaleString();
    supplierBalanceInput.classList.remove(
      "amount-plus",
      "amount-minus",
      "amount-zero",
    );
    supplierBalanceInput.classList.add(amountClassBySign(safeBal));
  }
  if (warehouseInput) {
    warehouseInput.value =
      first.warehouse || warehouseInput.value || "기본창고";
  }
  if (taxTypeSelect) {
    taxTypeSelect.value = normalizeTaxType(first.taxType);
  }
  if (memoInput) {
    memoInput.value = first.memo || "";
  }

  // 전표에 포함된 모든 품목 행을 하단 임시행(pendingEntries)으로 구성
  pendingEntries = group.map((p) => {
    const quantity = Number(p.quantity) || 0;
    const unitPrice = Number(p.unitPrice) || 0;

    const matchedItem = items.find(
      (it) =>
        String(it.id || "") === String(p.itemId || "") ||
        String(it.id || "") === String(p.itemCode || ""),
    );
    const shrinkPercent =
      p.shrinkPercent != null
        ? Number(p.shrinkPercent) || 0
        : Number(matchedItem && matchedItem.shrinkPercent != null ? matchedItem.shrinkPercent : 0) || 0;
    const shrinkPrice =
      p.shrinkPrice != null
        ? Number(p.shrinkPrice) || 0
        : Number(matchedItem && matchedItem.shrinkPrice != null ? matchedItem.shrinkPrice : 0) || 0;
    const marginRate =
      p.marginRate != null
        ? Number(p.marginRate) || 0
        : Number(
            matchedItem &&
              (matchedItem.deliveryMargin != null
                ? matchedItem.deliveryMargin
                : matchedItem.saleMargin != null
                  ? matchedItem.saleMargin
                  : 0),
          ) || 0;

    const rawSupply = Number(p.supplyAmount);
    const rawTax = Number(p.taxAmount);

    const hasSupply = Number.isFinite(rawSupply) && !Number.isNaN(rawSupply);
    const hasTax = Number.isFinite(rawTax) && !Number.isNaN(rawTax);

    const computedSupply = Number.isFinite(quantity * unitPrice)
      ? Math.round(quantity * unitPrice)
      : 0;
    const taxRate = getTaxRate(normalizeTaxType(p.taxType));
    const computedTax = Math.round(computedSupply * taxRate);

    const supplyAmount = hasSupply ? rawSupply : computedSupply;
    const taxAmount = hasTax ? rawTax : computedTax;

    return {
      itemId: p.itemId || "",
      itemCode: p.itemCode || "",
      itemName: p.itemName || "",
      itemSpec: p.itemSpec || "",
      unit: p.unit || "",
      quantity,
      unitPrice,
      shrinkPercent,
      shrinkPrice,
      marginRate,
      supplyAmount,
      taxAmount,
      amount: Number(p.amount) || supplyAmount + taxAmount,
      memo: p.memo || "",
    };
  });

  editingEntryIndex = -1;
  entryDraftRow = buildEmptyEntryDraft();
  entryActiveIndex = pendingEntries.length;
  renderPendingEntryRows();
  updateEntrySummary();

  openModal(true);
}

function applyItemFromModal() {
  if (!selectedItemIdForEntry) return;

  if (itemApplyMode === "inline" && itemApplyEntryIndex >= 0) {
    const item = items.find((it) => it.id === selectedItemIdForEntry);
    if (item) {
      const target =
        itemApplyEntryIndex === pendingEntries.length
          ? (entryDraftRow || (entryDraftRow = buildEmptyEntryDraft()))
          : pendingEntries[itemApplyEntryIndex];

      if (target) {
        target.itemId = item.id || "";
        target.itemCode = item.id || "";
        target.itemName = item.name || "";
        target.itemSpec = item.spec || "";
        target.unit = item.unit || "";
        target.unitPrice = Number(item.price ?? 0);
        target.shrinkPercent = Number(item.shrinkPercent ?? 0) || 0;
        target.marginRate = Number(item.deliveryMargin ?? item.saleMargin ?? 0) || 0;
        // 감량가/마진은 공통 매니저가 자동 계산한다.
        if (!Number(target.quantity || 0)) target.quantity = 1;
        const { supplyAmount, taxAmount, amount } = calculateRowAmounts(
          target.quantity,
          target.unitPrice,
          target.taxType,
        );
        target.supplyAmount = supplyAmount;
        target.taxAmount = taxAmount;
        target.amount = Math.abs(Number(amount) || 0);
      }
    }

    renderPendingEntryRows();
    setActiveEntryIndex(itemApplyEntryIndex);
    updateEntrySummary();

    // 품목 선택 완료 후 다음 입력(수량) 칸으로 바로 이동
    setTimeout(() => {
      const tr = entryBody?.querySelector(
        `tr.purchase-entry-row[data-entry-index="${itemApplyEntryIndex}"]`,
      );
      const tdQty = tr?.querySelector('[data-field="qty"]')?.closest('td') || null;
      if (!tdQty) return;
      tdQty.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, 0);
  } else if (itemApplyMode === "import" && itemApplyEntryIndex >= 0) {
    const item = items.find((it) => it.id === selectedItemIdForEntry);
    const rec = importRecords && importRecords[itemApplyEntryIndex] ? importRecords[itemApplyEntryIndex] : null;

    if (item && rec) {
      const prevQty = Number(rec.qty || 0);
      const prevUnitPrice = Number(rec.unitPrice || 0);

      rec.code = String(item.id || "");
      rec.name = String(item.name || "");
      rec.spec = String(item.spec || "");
      rec.unit = String(item.unit || "");

      // 인식 값이 이미 있으면 존중하고, 비어 있을 때만 마스터 기본값으로 채운다.
      if (!(Number(rec.unitPrice || 0) > 0)) {
        rec.unitPrice = Math.abs(Number(item.price ?? 0) || 0);
      }
      if (!(Number(rec.qty || 0) > 0)) {
        rec.qty = 1;
      }

      const qty = Number(rec.qty || 0);
      const total = Number(rec.total || 0);

      // 기존에 합계를 수동으로 맞춘 상태면(총액 기준) 총액을 유지하고 단가를 재계산
      if (rec._totalManual && total > 0) {
        const inferred = inferRowFromAmount(qty, total, rec.taxType) || {};
        rec.unitPrice = Number(inferred.unitPrice ?? rec.unitPrice ?? 0) || 0;
        rec.supplyAmount = Number(inferred.supplyAmount ?? 0) || 0;
        rec.taxAmount = Number(inferred.taxAmount ?? 0) || 0;
      } else {
        // 수량/단가 기본값을 채운 경우에만 합계를 재계산(기존 인식값이 있으면 최대한 유지)
        const changed = qty !== prevQty || Number(rec.unitPrice || 0) !== prevUnitPrice;
        if (changed) {
          const amounts = calculateRowAmounts(qty, rec.unitPrice, rec.taxType) || {};
          rec.supplyAmount = Number(amounts.supplyAmount ?? 0) || 0;
          rec.taxAmount = Number(amounts.taxAmount ?? 0) || 0;
          rec.total = normalizeImportNumber(amounts.amount);
          rec._totalManual = false;
        }
      }
    }

    const tr =
      importResultBody?.querySelector(
        `tr.purchase-entry-row[data-entry-index="${itemApplyEntryIndex}"]`,
      ) ||
      importResultBody?.querySelector(
        `tr.purchase-entry-row[data-index="${itemApplyEntryIndex}"]`,
      );

    if (tr && rec) {
      syncImportCellByModel(tr, rec, "code");
      syncImportCellByModel(tr, rec, "name");
      syncImportCellByModel(tr, rec, "spec");
      syncImportCellByModel(tr, rec, "unit");
      syncImportCellByModel(tr, rec, "qty");
      syncImportCellByModel(tr, rec, "unitPrice");
      syncImportCellByModel(tr, rec, "total");
      refreshImportRowMissingState(tr, rec);
    }

    updateImportSummary(importRecords);

    // 품목 선택 후에는 수량 입력으로 이동
    importActiveIndex = itemApplyEntryIndex;
    importActiveField = "qty";
    applyImportActiveStyles();
  } else if (itemSelect) {
    itemSelect.value = selectedItemIdForEntry;
    applyItemFromSelect();
  }

  closeItemSelectModal();
}
let transactionSaveBusy = false;
async function applySavedBatchPrices(rows) {
  try { for (const purchase of rows) await applyPurchasePriceToItemMaster(purchase); }
  catch (error) { alert('매입 전표는 모두 저장됐지만 품목의 최근 매입가 갱신에 실패했습니다. 전표를 다시 저장하지 말고 최신 불러오기로 확인해 주세요.'); }
}
async function guardTransactionSave(work) {
  if (transactionSaveBusy) return;
  transactionSaveBusy = true;
  const buttons = [btnSaveContinue, btnImportSave, btnImportContinue, form?.querySelector('[type="submit"]')].filter(Boolean);
  const disabled = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  try { return await work(); }
  catch (error) { alert(error.message || "저장 결과를 확인해 주세요."); }
  finally { buttons.forEach((button, i) => { button.disabled = disabled[i]; }); transactionSaveBusy = false; }
}
async function saveCurrentPurchase(options) {
  return guardTransactionSave(() => saveCurrentPurchaseImpl(options));
}
async function saveImportRecords(options) {
  return guardTransactionSave(() => saveImportRecordsImpl(options));
}

async function saveCurrentPurchaseImpl({ keepOpen = false } = {}) {
  const batchAdd = [], batchRemove = [];
  // 상단 전표 기준 여러 행 수정 모드
  if (isBatchEditMode) {
    if (!dateInput.value) {
      alert("거래일을 선택하세요.");
      dateInput.focus();
      return;
    }
    if (!supplierInput.value.trim()) {
      alert("매입처를 입력하세요.");
      supplierInput.focus();
      return;
    }
    if (!String(supplierSelect?.value || "").trim()) {
      alert("매입처를 선택하세요.");
      try {
        openMainSupplierPickerModal();
      } catch (_) {
        // ignore
      }
      supplierInput.focus();
      return;
    }

    // 아직 엔터로 추가하지 않은 현재 입력행이 있고, 값이 완성되어 있으면 저장 전에 한 번 더 확정한다.
    // (pendingEntries가 이미 있어도 마지막 입력행이 누락되지 않게)
    if (hasCurrentEntryRowData() && isEntryRowFilled()) {
      addEntryRowFromInputs();
    }

    if (!pendingEntries.length) {
      alert("추가된 품목 행이 없습니다. 먼저 행을 추가하세요.");
      return;
    }

    if (!validatePendingEntriesForSave()) return;

    const matchedSupplier = suppliers.find(
      (s) => s.id === (supplierSelect.value || ""),
    );
    const supplierGroupName = matchedSupplier
      ? matchedSupplier.group || "미분류"
      : "미분류";
    const batchKey = editingBatchKey || String(Date.now());

    const base = {
      type: "expense",
      category: transactionCategory,
      date: dateInput.value,
      supplierId: supplierSelect.value || "",
      supplierName: supplierInput.value.trim(),
      taxType: taxTypeSelect.value,
      warehouse: warehouseInput.value.trim(),
      supplierGroup: supplierGroupName,
      batchKey,
    };

    // 기존 전표에 속한 행 전부 삭제
    for (const id of editingBatchOriginalIds) {
      batchRemove.push(Number(id));
    }

    // 새로 입력한 행들로 다시 저장
    for (const row of pendingEntries) {
      const purchase = {
        ...base,
        itemId: row.itemId || "",
        itemCode: row.itemCode || "",
        itemName: row.itemName || "",
        itemSpec: row.itemSpec || "",
        unit: row.unit || "",
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unitPrice) || 0,
        shrinkPercent: Number(row.shrinkPercent) || 0,
        shrinkPrice: Number(row.shrinkPrice) || 0,
        marginRate: Number(row.marginRate) || 0,
        taxType: normalizeTaxType(row.taxType || base.taxType),
        supplyAmount: Number(row.supplyAmount) || 0,
        taxAmount: Number(row.taxAmount) || 0,
        amount: Number(row.amount) || 0,
        warehouse: row.warehouse || base.warehouse || "기본창고",
        memo: row.memo || "",
        source: "purchase",
      };

      batchAdd.push(purchase);
      
    }

    // 요약 필터 상태를 방금 저장한 전표 기준으로 맞춰 둔다.
    currentSummaryBatchKey = batchKey;
    currentSummaryDateForFilter = base.date;
    currentSummarySupplierIdForFilter = base.supplierId;
    currentSummaryKey = `BATCH__${batchKey}`;
    isSummaryFilterActive = true;
  } else if (currentEditingId) {
    // 단일 행 수정 모드
    updateAmountFields();
    if (!validateForm()) return;

    const linked = purchases.find(
      (p) => Number(p.id) === Number(currentEditingId),
    );
    if (linked && (await isLockedByPaymentLedger(linked))) {
      alert(
        "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
      );
      return;
    }

    const matchedSupplier = suppliers.find(
      (s) => s.id === (supplierSelect.value || ""),
    );
    const supplierGroupName = matchedSupplier
      ? matchedSupplier.group || "미분류"
      : "미분류";
    const existing = purchases.find(
      (p) => Number(p.id) === Number(currentEditingId),
    );
    const existingBatchKey = existing ? existing.batchKey : undefined;

    const activeRow = getEntryRowModelByIndex(entryActiveIndex);
    const computed = calculateRowAmounts(
      Number(qtyInput.value || "0"),
      Number(unitPriceInput.value || "0"),
      taxTypeSelect.value,
    );

    const purchase = {
      id: Number(currentEditingId),
      type: "expense",
      category: transactionCategory,
      date: dateInput.value,
      supplierId: supplierSelect.value || "",
      supplierName: supplierInput.value.trim(),
      itemId: itemSelect.value || "",
      itemCode: itemCodeInput.value.trim(),
      itemName: itemInput.value.trim(),
      itemSpec: specInput.value.trim(),
      unit: unitInput.value.trim(),
      quantity: Number(qtyInput.value || "0"),
      unitPrice: Number(unitPriceInput.value || "0"),
      shrinkPercent: shrinkPercentInput ? Number(shrinkPercentInput.value) || 0 : 0,
      shrinkPrice: shrinkPriceInput ? Number(shrinkPriceInput.value) || 0 : 0,
      marginRate: marginRateInput ? Number(marginRateInput.value) || 0 : 0,
      taxType: taxTypeSelect.value,
      supplyAmount: Number(activeRow?.supplyAmount ?? computed.supplyAmount) || 0,
      taxAmount: Number(activeRow?.taxAmount ?? computed.taxAmount) || 0,
      amount: Number(amountInput.value || "0"),
      warehouse: warehouseInput.value.trim(),
      supplierGroup: supplierGroupName,
      batchKey: existingBatchKey,
      memo: memoInput ? memoInput.value.trim() : "",
    };

    await updateTransaction(purchase);
    
  } else {
    // 신규 등록일 때는 엔터로 쌓인 여러 행을 한 번에 저장
    if (!dateInput.value) {
      alert("거래일을 선택하세요.");
      dateInput.focus();
      return;
    }
    if (!supplierInput.value.trim()) {
      alert("매입처를 입력하세요.");
      supplierInput.focus();
      return;
    }
    if (!String(supplierSelect?.value || "").trim()) {
      alert("매입처를 선택하세요.");
      try {
        openMainSupplierPickerModal();
      } catch (_) {
        // ignore
      }
      supplierInput.focus();
      return;
    }

    // 아직 엔터로 추가하지 않은 현재 입력행이 있고, 값이 완성되어 있으면 저장 전에 한 번 더 확정한다.
    // (pendingEntries가 이미 있어도 마지막 입력행이 누락되지 않게)
    if (hasCurrentEntryRowData() && isEntryRowFilled()) {
      addEntryRowFromInputs();
    }

    if (!pendingEntries.length) {
      alert("추가된 품목 행이 없습니다. 먼저 행을 추가하세요.");
      return;
    }

    if (!validatePendingEntriesForSave()) return;

    const matchedSupplier = suppliers.find(
      (s) => s.id === (supplierSelect.value || ""),
    );
    const supplierGroupName = matchedSupplier
      ? matchedSupplier.group || "미분류"
      : "미분류";
    const batchKey = String(Date.now());
    const base = {
      type: "expense",
      category: transactionCategory,
      date: dateInput.value,
      supplierId: supplierSelect.value || "",
      supplierName: supplierInput.value.trim(),
      taxType: taxTypeSelect.value,
      warehouse: warehouseInput.value.trim(),
      supplierGroup: supplierGroupName,
      batchKey,
    };

    // 동일 전표 중복 저장 방지 경고(저장 직전에 1회만)
    try {
      const ok = await confirmDuplicateBatchBeforeSave({
        source: "purchase",
        date: base.date,
        supplierId: base.supplierId,
        rows: pendingEntries,
      });
      if (!ok) return;
    } catch {
      // ignore
    }

    // 하단 임시행(pendingEntries)에 쌓인 구조(itemCode/itemName/quantity 등)를 그대로 사용해 저장한다.
    for (const row of pendingEntries) {
      const purchase = {
        ...base,
        itemId: row.itemId || "",
        itemCode: row.itemCode || "",
        itemName: row.itemName || "",
        itemSpec: row.itemSpec || "",
        unit: row.unit || "",
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unitPrice) || 0,
        shrinkPercent: Number(row.shrinkPercent) || 0,
        shrinkPrice: Number(row.shrinkPrice) || 0,
        marginRate: Number(row.marginRate) || 0,
        taxType: normalizeTaxType(row.taxType || base.taxType),
        supplyAmount: Number(row.supplyAmount) || 0,
        taxAmount: Number(row.taxAmount) || 0,
        amount: Number(row.amount) || 0,
        warehouse: row.warehouse || base.warehouse || "기본창고",
        memo: row.memo || "",
        source: "purchase",
      };
      batchAdd.push(purchase);
      
    }
  }

  if (batchAdd.length || batchRemove.length) {
    await saveTransactionBatch({ add: batchAdd, remove: batchRemove });
    await applySavedBatchPrices(batchAdd);
  }
  // 매입 전표 저장과 동시에, 상단 인라인 지불 박스에
  // 통장/금액이 입력되어 있으면 같은 조건으로 지불 전표도 함께 저장한다.
  try {
    await saveInlinePaymentIfNeeded();
  } catch (e) {
    console.error("인라인 지불 저장 중 오류:", e);
    alert("지불 저장 중 오류가 발생했습니다. 통장 내역을 확인해 주세요.");
  }

  resetForm();
  // 저장 직후 상태를 기준으로 dirty 스냅샷을 다시 맞춰, 닫을 때 불필요한 경고가 뜨지 않게 한다.
  if (
    purchaseModalDirty &&
    typeof purchaseModalDirty.markClean === "function"
  ) {
    purchaseModalDirty.markClean();
  }
  if (!keepOpen) {
    closeModal();
  }

  // 저장 직후에는 최신 내역이 바로 보이도록 1회 강제 스크롤
  purchaseListAutoScroll.forceNext();
  purchaseSummaryAutoScroll.forceNext();
  await reloadPurchaseList();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveCurrentPurchase({ keepOpen: false });
});

if (btnSaveContinue) {
  btnSaveContinue.addEventListener("click", async () => {
    await saveCurrentPurchase({ keepOpen: true });
  });
}

btnModalClose.addEventListener("click", () => {
  closeModal();
});

if (btnModalDelete) {
  btnModalDelete.addEventListener("click", async () => {
    // 전표 수정 모드: 현재 선택/편집 중인 한 줄만 삭제
    if (isBatchEditMode) {
      if (entryActiveIndex < 0 || entryActiveIndex >= pendingEntries.length) {
        alert("삭제할 행을 먼저 클릭해서 선택해 주세요.");
        return;
      }

      const ok = await confirmAsync(
        "현재 선택한 품목 한 줄을 삭제하시겠습니까?",
        { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;

      const removedIndex = entryActiveIndex;
      pendingEntries.splice(removedIndex, 1);

      // 삭제 후 draft가 남아있어 저장 시 다시 추가되는 것을 방지
      entryDraftRow = buildEmptyEntryDraft();
      entryActiveIndex = Math.min(removedIndex, pendingEntries.length);

      // 전표 수정 모드에서 한 줄 삭제는 아직 저장 전 단계이므로,
      // 화면의 임시 행과 합계만 갱신해 주고 실제 DB 저장은 사용자가 "저장"을 눌렀을 때 반영된다.
      renderPendingEntryRows();
      updateEntrySummary();
      return;
    }

    // 단일 행 수정 모드인 경우: 해당 행만 바로 삭제
    if (currentEditingId) {
      const existing = purchases.find(
        (p) => Number(p.id) === Number(currentEditingId),
      );
      if (existing && (await isLockedByPaymentLedger(existing))) {
        alert(
          "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 삭제할 수 없고, 통합결제 화면에서만 삭제할 수 있습니다.",
        );
        return;
      }
      const ok = await confirmAsync(
        "현재 매입 내역을 삭제하시겠습니까?",
        { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;

      const itemIdForAvg = existing ? existing.itemId : null;
      await deleteTransaction(Number(currentEditingId));
      await deleteLinkedLedgerTxIfAny(existing);
      currentEditingId = null;
      resetForm();
      if (
        purchaseModalDirty &&
        typeof purchaseModalDirty.markClean === "function"
      ) {
        purchaseModalDirty.markClean();
      }
      closeModal();
      if (itemIdForAvg) {
        await recomputeItemAveragePrice(itemIdForAvg);
      }
      await reloadPurchaseList();
      return;
    }

    alert(
      "삭제할 매입 내역이 선택되지 않았습니다. 먼저 삭제할 행을 선택해 주세요.",
    );
  });
}

// 모달 바깥 영역 클릭으로는 닫히지 않도록 한다.
// 닫기는 모달 내부 버튼과 ESC 키로만 처리.
if (modal) {
  // 의도적으로 배경 클릭 이벤트를 사용하지 않음
}

btnNew.addEventListener("click", () => {
  resetForm();
  // 왼쪽 거래처 분류 영역에서 선택해 둔 거래처/분류가 있으면
  // 모달의 기본값으로 먼저 반영한다.
  applyDefaultSupplierForNewPurchase();
  openModal(false);
  // 모달을 새로 열 때는 바로 품명 입력칸에 포커스
  if (itemInput) {
    itemInput.focus();
    itemInput.select();
  }
});
// 매입 내역 화면에서 직접 지불 등록 모달 열기
async function openPurchasePaymentModal() {
  if (!purchasePaymentModal || !purchasePaymentForm) return;

  currentPurchasePaymentEditingId = null;
  if (purchasePaymentModalTitle) {
    purchasePaymentModalTitle.textContent = "지불 등록";
  }

  const supplier = currentSelectedSupplierId
    ? suppliers.find((s) => String(s.id) === String(currentSelectedSupplierId))
    : null;
  syncPurchasePaymentSupplierUI({
    supplierId: supplier ? supplier.id || "" : "",
    supplierName: supplier ? supplier.name || supplier.id || "" : "",
  });

  if (purchasePaymentDateInput) {
    purchasePaymentDateInput.value = todayYMD();
  }

  // 통장(입출금 코드) 목록을 모달/인라인 지불 박스 모두에 적용
  try {
    await loadPurchaseLedgerOptions();
  } catch (e) {
    console.error("통장(입출금 코드) 목록을 불러오는 중 오류:", e);
  }

  if (purchasePaymentAccountSelect) {
    try {
      purchasePaymentAccountSelect.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    } catch (_) {}
  }

  if (purchasePaymentAmountInput) {
    purchasePaymentAmountInput.value = "";
  }
  if (purchasePaymentDiscountInput) {
    purchasePaymentDiscountInput.value = "";
  }
  if (purchasePaymentMemoInput) {
    purchasePaymentMemoInput.value = "";
  }

  syncPurchasePaymentAccountEnablement();

  openModalOverlay(purchasePaymentModal);
  if (typeof registerModalEscClose === "function") {
    registerModalEscClose(purchasePaymentModal, () => {
      closeModalOverlay(purchasePaymentModal);
    });
  }
}

async function openPurchasePaymentModalForEdit(txId) {
  if (!purchasePaymentModal || !purchasePaymentForm) return;
  const targetId = String(txId || "").trim();
  if (!targetId) {
    alert("수정할 지불 내역이 선택되지 않았습니다.");
    return;
  }

  // purchases 배열에서 지불 전표를 찾는다(없으면 전체 조회 fallback)
  let tx = purchases.find((p) => p && String(p.id) === targetId);
  if (!tx) {
    try {
      const all = await getTransactions();
      tx = (all || []).find((p) => p && String(p.id) === targetId);
    } catch (_) {
      tx = null;
    }
  }

  if (!tx || !isPaymentOnlyTransaction(tx)) {
    alert("선택한 내역이 지불 전표가 아닙니다.");
    return;
  }

  if (tx && (await isLockedByPaymentLedger(tx))) {
    alert(
      "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
    );
    return;
  }

  currentPurchasePaymentEditingId = String(tx.id);
  if (purchasePaymentModalTitle) {
    purchasePaymentModalTitle.textContent = "지불 수정";
  }

  // 모달 기본값
  const supplier = suppliers.find(
    (s) => String(s.id) === String(tx.supplierId || ""),
  );
  syncPurchasePaymentSupplierUI({
    supplierId: supplier
      ? supplier.id || ""
      : String(tx.supplierId || ""),
    supplierName: supplier
      ? supplier.name || supplier.id || ""
      : String(tx.supplierName || tx.supplierId || ""),
  });
  if (purchasePaymentDateInput) {
    purchasePaymentDateInput.value = tx.date || todayYMD();
  }

  // 통장/장부 선택 옵션 로드
  try {
    await loadPurchaseLedgerOptions();
  } catch (_) {}

  if (purchasePaymentAccountSelect) {
    try {
      purchasePaymentAccountSelect.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    } catch (_) {}
  }

  // ledger_tx에서 실제 accountId/금액/메모를 읽어서 채운다.
  if (tx.ledgerTxId) {
    try {
      const ledger = await getLedgerTxById(tx.ledgerTxId);
      if (ledger) {
        const code = String(ledger.accountId || "");
        const name = String(
          ledger.cashflowItemName || ledger.accountName || code,
        );
        if (purchasePaymentAccountSelect && code) {
          const exists = Array.from(
            purchasePaymentAccountSelect.options || [],
          ).some((o) => String(o.value) === String(code));
          if (!exists) {
            const opt = document.createElement("option");
            opt.value = String(code);
            opt.textContent = String(name || code);
            purchasePaymentAccountSelect.appendChild(opt);
          }
          purchasePaymentAccountSelect.value = code;
          if (purchasePaymentAccountCodeInput) {
            purchasePaymentAccountCodeInput.value = code;
          }
        }
        if (purchasePaymentAmountInput) {
          purchasePaymentAmountInput.value = String(
            Number(ledger.amount || 0) || "",
          );
        }
        if (purchasePaymentDiscountInput) {
          purchasePaymentDiscountInput.value = String(
            Number(tx.paymentDiscount || 0) || "",
          );
        }
        if (purchasePaymentMemoInput) {
          const m = String(ledger.entryMemo || tx.memo || "").trim();
          purchasePaymentMemoInput.value = m;
        }
      }
    } catch (_) {
      // 무시하고 transaction 값으로 최소 세팅
      if (purchasePaymentAmountInput) {
        purchasePaymentAmountInput.value = String(
          Number(tx.payment || 0) || "",
        );
      }
      if (purchasePaymentDiscountInput) {
        purchasePaymentDiscountInput.value = String(
          Number(tx.paymentDiscount || 0) || "",
        );
      }
      if (purchasePaymentMemoInput) {
        purchasePaymentMemoInput.value = String(tx.memo || "");
      }
    }
  }
  // 할인 단독 전표 등으로 ledgerTxId가 없는 경우: transactions 값으로 최소 세팅
  if (!tx.ledgerTxId) {
    if (purchasePaymentAmountInput) {
      purchasePaymentAmountInput.value = String(Number(tx.payment || 0) || "");
    }
    if (purchasePaymentDiscountInput) {
      purchasePaymentDiscountInput.value = String(
        Number(tx.paymentDiscount || 0) || "",
      );
    }
    if (purchasePaymentMemoInput) {
      purchasePaymentMemoInput.value = String(tx.memo || "");
    }
    if (purchasePaymentAccountSelect) {
      purchasePaymentAccountSelect.value = "";
    }
    if (purchasePaymentAccountCodeInput) {
      purchasePaymentAccountCodeInput.value = "";
    }
  }

  syncPurchasePaymentAccountEnablement();

  openModalOverlay(purchasePaymentModal);
  if (typeof registerModalEscClose === "function") {
    registerModalEscClose(purchasePaymentModal, () => {
      closeModalOverlay(purchasePaymentModal);
    });
  }
}

if (btnPaymentNew) {
  btnPaymentNew.addEventListener("click", () => {
    openPurchasePaymentModal();
  });
}

if (btnPurchasePaymentClose && purchasePaymentModal) {
  btnPurchasePaymentClose.addEventListener("click", () => {
    currentPurchasePaymentEditingId = null;
    if (purchasePaymentModalTitle) {
      purchasePaymentModalTitle.textContent = "지불 등록";
    }
    closeModalOverlay(purchasePaymentModal);
  });
}

btnEdit.addEventListener("click", async () => {
  // 지불(PAY) vs 매입 전표(묶음) 선택 상태에 따라 동작을 분리한다.
  const key = currentSummaryKey || "";
  if (!key) {
    alert("먼저 수정할 전표를 선택하세요.");
    return;
  }

  if (key.startsWith("PAY__")) {
    const id = key.replace(/^PAY__/, "");
    await openPurchasePaymentModalForEdit(id);
    return;
  }

  // 매입 전표(묶음) 단위 수정
  const group = getCurrentSummaryGroupTransactions();
  if (!group.length) {
    alert("먼저 수정할 전표를 선택하세요.");
    return;
  }
  await startBatchEditFromSummary();
});

btnDelete.addEventListener("click", async () => {
  // 하단 상세 행이 선택된 경우: 해당 한 행만 삭제
  if (currentEditingId) {
    const existing = purchases.find(
      (p) => Number(p.id) === Number(currentEditingId),
    );
    if (existing && isPaymentOnlyTransaction(existing)) {
      const ok = await confirmAsync(
        "선택한 지불 내역을 삭제하시겠습니까?",
        { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
      );
      if (!ok) return;
      await deleteTransaction(Number(currentEditingId));
      await deleteLinkedLedgerTxIfAny(existing);
      currentEditingId = null;
      resetForm();
      await reloadPurchaseList();
      return;
    }
    if (existing && (await isLockedByPaymentLedger(existing))) {
      alert(
        "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 삭제할 수 없고, 통합결제 화면에서만 삭제할 수 있습니다.",
      );
      return;
    }
    const ok = await confirmAsync(
      "선택한 매입 내역을 삭제하시겠습니까?",
      { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
    );
    if (!ok) return;
    const itemIdForAvg = existing ? existing.itemId : null;
    await deleteTransaction(Number(currentEditingId));
    await deleteLinkedLedgerTxIfAny(existing);
    currentEditingId = null;
    resetForm();
    if (itemIdForAvg) {
      await recomputeItemAveragePrice(itemIdForAvg);
    }
    await reloadPurchaseList();
    return;
  }

  // 하단에서 행을 선택하지 않았더라도, 상단 전표가 선택되어 있다면
  // 그 전표에 속한 모든 품목 행을 한 번에 삭제한다.
  const group = getCurrentSummaryGroupTransactions();
  if (!group.length) {
    alert("먼저 삭제할 전표를 선택하세요.");
    return;
  }

  // 지불 요약(PAY) 선택 시: 지불 전표 1건만 삭제한다.
  if (currentSummaryKey && currentSummaryKey.startsWith("PAY__")) {
    const tx = group[0];
    if (!tx) {
      alert("삭제할 지불 내역을 찾지 못했습니다.");
      return;
    }
    if (tx && (await isLockedByPaymentLedger(tx))) {
      alert(
        "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 삭제할 수 없고, 통합결제 화면에서만 삭제할 수 있습니다.",
      );
      return;
    }
    const ok = await confirmAsync(
      "선택한 지불 내역을 삭제하시겠습니까?",
      { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
    );
    if (!ok) return;
    await deleteTransaction(Number(tx.id));
    await deleteLinkedLedgerTxIfAny(tx);
    currentEditingId = null;
    currentSummaryKey = "";
    currentSummaryBatchKey = "";
    currentSummaryDateForFilter = "";
    currentSummarySupplierIdForFilter = "";
    isSummaryFilterActive = false;
    resetForm();
    await reloadPurchaseList();
    return;
  }

  const hasImported = await hasLockedPaymentEntries(group);
  if (hasImported) {
    alert(
      "선택한 전표 중 통합결제 화면에서 자동 등록된 매입 결제가 포함되어 있습니다.\n이 전표는 매입 화면에서 일괄 삭제할 수 없습니다.\n통합결제 화면에서 해당 거래를 삭제해 주세요.",
    );
    return;
  }

  const ok = await confirmAsync(
    `선택한 전표의 품목 ${group.length}건을 모두 삭제하시겠습니까?`,
    { title: "삭제 확인", okText: "삭제", cancelText: "취소", tone: "danger" },
  );
  if (!ok) return;

  const affectedItemIds = new Set();
  const ledgerIdsToDelete = new Set();
  for (const tx of group) {
    if (tx && tx.id !== undefined && tx.id !== null) {
      if (tx.itemId) {
        affectedItemIds.add(String(tx.itemId));
      }
      if (tx.ledgerTxId && !isPaymentLinkedTransaction(tx)) {
        ledgerIdsToDelete.add(String(tx.ledgerTxId));
      }

    }
  }

  await saveTransactionBatch({
    remove: group.filter(tx => tx && tx.id != null).map(tx => Number(tx.id)),
    removeLedger: [...ledgerIdsToDelete],
  });

  currentEditingId = null;
  resetForm();
  for (const id of affectedItemIds) {
    await recomputeItemAveragePrice(id);
  }
  await reloadPurchaseList();
});

supplierSelect.addEventListener("change", applySupplierFromSelect);
itemSelect.addEventListener("change", applyItemFromSelect);
taxTypeSelect.addEventListener("change", () => {
  // 활성행 금액 재계산 + 모델/view 동기화는 input 이벤트 핸들러를 재사용
  updateAmountFields();
  if (unitPriceInput) {
    unitPriceInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

// 상단 인라인 지불 박스: 통장 선택/완납 버튼 동작
if (inlineLedgerNameSelect) {
  // 초기 통장 목록 로딩 (모달과 동일한 데이터 사용)
  loadPurchaseLedgerOptions().catch((e) => {
    console.error("인라인 지불 통장 목록 로딩 오류:", e);
  });

  const ensureSelectOption = (selectEl, value, label) => {
    if (!selectEl || !value) return;
    const exists = Array.from(selectEl.options || []).some(
      (o) => String(o.value) === String(value),
    );
    if (exists) return;
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = String(label || value);
    selectEl.appendChild(opt);
  };

  const openInlineLedgerPicker = async () => {
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

    // 기존 UI는 select를 사용하므로, 옵션이 없으면 추가해 표시가 깨지지 않게 한다.
    ensureSelectOption(inlineLedgerNameSelect, code, name);
    inlineLedgerNameSelect.value = code;

    // 기존 change 로직(코드 칸 동기화 등)을 그대로 재사용
    inlineLedgerNameSelect.dispatchEvent(
      new Event("change", { bubbles: true }),
    );
  };

  // select 드롭다운 대신 공통 모달을 열도록 가로챈다.
  inlineLedgerNameSelect.addEventListener("mousedown", (e) => {
    // 좌클릭만 처리
    if (e.button !== 0) return;
    e.preventDefault();
    openInlineLedgerPicker().catch(() => {});
  });

  inlineLedgerNameSelect.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInlineLedgerPicker().catch(() => {});
    }
  });

  inlineLedgerNameSelect.addEventListener("change", () => {
    const code = inlineLedgerNameSelect.value || "";
    if (inlineLedgerCodeInput) {
      inlineLedgerCodeInput.value = code;
    }
  });
}

// 지불등록 폼의 통장(계좌) select도 공통 모달로 통일
if (purchasePaymentAccountSelect) {
  const syncPurchasePaymentAccountCode = (code) => {
    if (!purchasePaymentAccountCodeInput) return;
    purchasePaymentAccountCodeInput.value = String(code || "");
  };

  const ensureSelectOption = (selectEl, value, label) => {
    if (!selectEl || !value) return;
    const exists = Array.from(selectEl.options || []).some(
      (o) => String(o.value) === String(value),
    );
    if (exists) return;
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = String(label || value);
    selectEl.appendChild(opt);
  };

  const openPaymentAccountPicker = async () => {
    if (purchasePaymentAccountSelect?.disabled) return;
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

    ensureSelectOption(purchasePaymentAccountSelect, code, name);
    purchasePaymentAccountSelect.value = code;
    try {
      purchasePaymentAccountSelect.dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    } catch (_) {
      syncPurchasePaymentAccountCode(code);
    }
  };

  purchasePaymentAccountSelect.addEventListener("mousedown", (e) => {
    if (purchasePaymentAccountSelect.disabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    openPaymentAccountPicker().catch(() => {});
  });

  purchasePaymentAccountSelect.addEventListener("keydown", (e) => {
    if (purchasePaymentAccountSelect.disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPaymentAccountPicker().catch(() => {});
    }
  });

  purchasePaymentAccountSelect.addEventListener("change", () => {
    syncPurchasePaymentAccountCode(purchasePaymentAccountSelect.value || "");
  });

  // 초기 상태 반영(편집 모달 등에서 value가 먼저 세팅되는 경우 대비)
  syncPurchasePaymentAccountCode(purchasePaymentAccountSelect.value || "");
}

// 지불등록 폼 저장 처리: Ledger DB + 매입 장부에 동시에 기록
if (purchasePaymentForm) {
  const submitPurchasePayment = async ({ keepOpen }) => {
    const isEdit = !!currentPurchasePaymentEditingId;
    let editingTx = null;
    if (isEdit) {
      const id = String(currentPurchasePaymentEditingId);
      editingTx = purchases.find((p) => p && String(p.id) === id) || null;
      if (!editingTx) {
        try {
          const all = await getTransactions();
          editingTx = (all || []).find((p) => p && String(p.id) === id) || null;
        } catch (_) {
          editingTx = null;
        }
      }
      if (!editingTx || !isPaymentOnlyTransaction(editingTx)) {
        alert("수정할 지불 내역을 찾지 못했습니다.");
        return;
      }
    } else {
      const typedSupplierCode = String(
        purchasePaymentSupplierInput ? purchasePaymentSupplierInput.value || "" : "",
      ).trim();
      if (!currentSelectedSupplierId && !typedSupplierCode) {
        openMainSupplierPickerModal();
        return;
      }
    }

    const date =
      purchasePaymentDateInput && purchasePaymentDateInput.value
        ? purchasePaymentDateInput.value
        : todayYMD();

    const typedSupplierCode = String(
      purchasePaymentSupplierInput ? purchasePaymentSupplierInput.value || "" : "",
    ).trim();
    const supplierIdForSave = isEdit
      ? String(editingTx.supplierId || "")
      : String(currentSelectedSupplierId || typedSupplierCode || "");
    const supplier = suppliers.find(
      (s) => String(s.id) === String(supplierIdForSave),
    );
    const supplierName = supplier
      ? supplier.name || supplier.id || ""
      : isEdit
        ? String(editingTx.supplierName || editingTx.supplierId || supplierIdForSave)
        : supplierIdForSave;
    const supplierGroupName = supplier ? supplier.group || "미분류" : "미분류";

    if (!supplierIdForSave || !supplier) {
      if (!isEdit) {
        openMainSupplierPickerModal();
        return;
      }
    }

    const amountRaw = purchasePaymentAmountInput
      ? purchasePaymentAmountInput.value
      : "";
    const amount = Number(amountRaw || "0");

    const discountRaw = purchasePaymentDiscountInput
      ? purchasePaymentDiscountInput.value
      : "";
    const paymentDiscount = Number(discountRaw || "0");
    if (Number.isNaN(paymentDiscount) || paymentDiscount < 0) {
      alert("지불할인은 0 이상의 숫자로 입력하세요.");
      return;
    }

    if (!(amount > 0) && !(paymentDiscount > 0)) {
      alert("지불금액 또는 지불할인 중 하나는 입력하세요.");
      return;
    }

    const accountCode = purchasePaymentAccountSelect
      ? purchasePaymentAccountSelect.value
      : "";
    // 할인만 입력한 경우에는 통장(계좌)/원장 기록이 없으므로 계좌를 강제하지 않는다.
    if (amount > 0 && !accountCode) {
      alert("지불에 사용할 통장(계좌)을 선택하세요.");
      return;
    }
    const accountLabel = purchasePaymentAccountSelect
      ? purchasePaymentAccountSelect.options[
          purchasePaymentAccountSelect.selectedIndex
        ]?.text || accountCode
      : accountCode;

    try {
      const memoText =
        purchasePaymentMemoInput && purchasePaymentMemoInput.value
          ? purchasePaymentMemoInput.value.trim()
          : "";

      if (!isEdit) {
        if (amount > 0) {
          await savePurchasePaymentRecord({
            date,
            supplierId: supplierIdForSave,
            supplierName,
            supplierGroupName,
            accountCode,
            accountLabel,
            amount,
            paymentDiscount,
            memoText,
          });
        } else {
          // 할인 단독: ledger_tx 없이 transactions(지불 전표)만 기록
          await addTransaction({
            type: "expense",
            category: transactionCategory,
            date,
            supplierId: supplierIdForSave,
            supplierName,
            amount: 0,
            payment: 0,
            paymentDiscount: Math.abs(Number(paymentDiscount) || 0),
            taxType: "",
            warehouse: "",
            supplierGroup: supplierGroupName,
            memo: memoText && memoText.trim() ? memoText.trim() : "",
            source: "purchase",
          });
        }
        if (!keepOpen) alert("지불 내역이 저장되었습니다.");
      } else {
        // 수정: ledger_tx + transactions 를 함께 업데이트
        if (editingTx && (await isLockedByPaymentLedger(editingTx))) {
          alert(
            "이 매입 결제는 통합결제 화면에서 자동 등록된 내역입니다.\n매입 화면에서는 수정할 수 없고, 통합결제 화면에서만 수정/삭제할 수 있습니다.",
          );
          return;
        }

        const ledgerTxId = editingTx ? String(editingTx.ledgerTxId || "") : "";

        // 1) 할인 단독(또는 지불금액 0)으로 저장하는 경우: ledger_tx는 삭제(있으면)하고 transactions만 업데이트
        if (!(amount > 0) && paymentDiscount > 0) {
          if (ledgerTxId) {
            try {
              await deleteLedgerTxById(ledgerTxId);
            } catch (_) {}
          }

          const paymentTx = {
            id: Number(editingTx.id),
            type: "expense",
            category: transactionCategory,
            date,
            supplierId: supplierIdForSave,
            supplierName: supplierName || editingTx.supplierName || "",
            amount: 0,
            payment: 0,
            paymentDiscount: Math.abs(Number(paymentDiscount) || 0),
            taxType: "",
            warehouse: "",
            supplierGroup: supplierGroupName,
            memo: memoText && memoText.trim() ? memoText.trim() : "",
            source: "purchase",
            ledgerTxId: "",
            ledgerName: "",
          };
          await updateTransaction(paymentTx);

          if (!keepOpen) alert("지불 내역이 수정되었습니다.");
        } else {
          // 2) 실제 지불금액(amount>0)이 있는 경우: 기존과 동일하게 ledger_tx + transactions 업데이트
          if (!ledgerTxId) {
            alert(
              "이 할인 전표에는 연결된 통장(원장) 기록이 없어 지불금액을 추가할 수 없습니다.\n삭제 후 다시 등록해 주세요.",
            );
            return;
          }

          const ledger = await getLedgerTxById(ledgerTxId);
          if (!ledger) {
            alert(
              "연결된 입출금 원장(ledger_tx)을 찾을 수 없어 수정할 수 없습니다.",
            );
            return;
          }

        // 계좌 라벨에서 통장명만 추출(코드가 포함될 수 있음)
        const label = accountLabel || accountCode;
        const accountNameOnly = stripCodePrefix(label);

        const { code: pickedItemCode, name: pickedItemName } =
          await resolveCashflowItemSelectionOrThrow({
            accountCode,
            accountLabel: label,
            actionLabel: "지불",
          });

        const memoFields = buildLedgerMemoFields(memoText, ledger.memo || "");
        const now = Date.now();
          const updatedLedger = {
            ...ledger,
            date,
            accountId: accountCode,
            accountName: label,
            cashflowCode: pickedItemCode,
            cashflowItemCode: pickedItemCode,
            cashflowItemName: pickedItemName,
            amount: Math.abs(Number(amount) || 0),
            vendor: supplierName || ledger.vendor,
            item: supplierName || ledger.item,
            memo: memoFields.memo,
            entryMemo: memoFields.entryMemo,
            preferEntryMemo: memoFields.preferEntryMemo,
            supplierId: supplierIdForSave,
            updatedAt: now,
          };
          await putLedgerTx(ensureLedgerTxKeys(updatedLedger));

          const paymentTx = {
            id: Number(editingTx.id),
            type: "expense",
            category: transactionCategory,
            date,
            supplierId: supplierIdForSave,
            supplierName: supplierName || editingTx.supplierName || "",
            amount: 0,
            payment: Math.abs(Number(amount) || 0),
            paymentDiscount: Math.abs(Number(paymentDiscount) || 0),
            taxType: "",
            warehouse: "",
            supplierGroup: supplierGroupName,
            ledgerName: accountNameOnly,
            memo: memoText && memoText.trim() ? memoText.trim() : "",
            source: "purchase",
            ledgerTxId: String(ledgerTxId),
          };
          await updateTransaction(paymentTx);

          if (!keepOpen) alert("지불 내역이 수정되었습니다.");
        }
      }

      await reloadPurchaseList();

      if (keepOpen) {
        currentPurchasePaymentEditingId = null;
        if (purchasePaymentModalTitle)
          purchasePaymentModalTitle.textContent = "지불 등록";
        resetFieldsAndFocus({
          fields: [
            [purchasePaymentAmountInput, ""],
            [purchasePaymentDiscountInput, ""],
            [purchasePaymentMemoInput, ""],
          ],
          focus: purchasePaymentAmountInput,
          select: true,
        });
        return;
      }

      closeModalOverlay(purchasePaymentModal);
    } catch (err) {
      console.error("지불 등록 중 오류:", err);
      alert("지불 등록 중 오류가 발생했습니다.");
    }
  };

  purchasePaymentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitPurchasePayment({ keepOpen: false });
  });

  if (btnPurchasePaymentSaveContinue) {
    btnPurchasePaymentSaveContinue.addEventListener("click", async () => {
      await submitPurchasePayment({ keepOpen: true });
    });
  }
}

if (itemSelectSearchInput) {
  itemSelectSearchInput.addEventListener("input", () => {
    renderItemSelectList(itemSelectSearchInput.value || "");
  });
}

if (btnItemSelectConfirm) {
  btnItemSelectConfirm.addEventListener("click", () => {
    applyItemFromModal();
  });
}

if (btnItemSelectClose) {
  btnItemSelectClose.addEventListener("click", () => {
    closeItemSelectModal();
  });
}

if (itemSelectModal) {
  // 품목 선택 모달도 배경 클릭으로는 닫히지 않도록 함
}

// 품목 선택 모달 안에서 방향키/Enter로 분류 및 품목을 선택 가능하게 한다.
function handleItemSelectKeydown(e) {
  if (
    !itemSelectModal ||
    itemSelectModal.getAttribute("aria-hidden") === "true"
  )
    return;

  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  const inGroupList = !!target.closest("#purchase-item-group-list");
  const inItemList = !!target.closest("#purchase-item-list");

  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    const delta = e.key === "ArrowDown" ? 1 : -1;
    e.preventDefault();

    if (inGroupList && itemGroupListBody) {
      enableTableArrowNavigation(itemGroupListBody, {
        onSelect: (row) => row.click(),
        enableEnter: true,
      });
    } else if (itemSelectListBody) {
      enableTableArrowNavigation(itemSelectListBody, {
        onSelect: (row) => row.click(),
        enableEnter: true,
      });
    }
    return;
  }

  if (e.key === "Enter") {
    if (inGroupList) {
      const tr = target.closest("tr");
      if (tr) {
        e.preventDefault();
        tr.click();
      }
      return;
    }

    // 분류 리스트가 아닌 상태에서 Enter를 누르면
    // 어디에 포커스가 있든(품목 리스트, 검색창, 버튼 등)
    // 현재 선택된 품목을 확정한다.
    e.preventDefault();
    applyItemFromModal();
  }
}

document.addEventListener("keydown", handleItemSelectKeydown);

// 매입 "수정" 모달(전표 여러 행 편집 모드)에서
// 방향키(위/아래)로 하단 임시 행 사이를 항상 이동할 수 있게 전역 처리
function handleEntryArrowKeydown(e) {
  if (!modal || modal.getAttribute("aria-hidden") === "true") return;

  // 품목 선택 모달이 열려 있을 때는 품목 모달 쪽 방향키를 우선한다.
  if (itemSelectModal && itemSelectModal.getAttribute("aria-hidden") !== "true")
    return;
  // 날짜 빠른 선택 모달이 열려 있을 때도 이쪽 방향키는 막는다.
  if (dateQuickModal && dateQuickModal.getAttribute("aria-hidden") !== "true")
    return;

  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  // 매입 모달 안에서 눌린 방향키거나, 포커스가 body 에 있으면서
  // 매입 모달이 떠 있는 경우에만 처리한다.
  if (!entryBody) return;
  const inModal = !!target.closest("#purchase-modal");
  const isBody = target === document.body;
  if (!inModal && !isBody) return;
  if (!pendingEntries.length) return;

  e.preventDefault();
  const delta = e.key === "ArrowDown" ? 1 : -1;
  movePendingEntrySelection(delta);
}

document.addEventListener("keydown", handleEntryArrowKeydown);

// 행 추가는 자동(blur)으로 하지 않고, 사용자가 Enter로 명시적으로 추가하도록 제한

if (typeSwitchButtons.length) {
  typeSwitchButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextType = btn.dataset.groupType;
      if (!nextType) return;

      // 매출/매입/지출 전용 페이지가 따로 있으므로,
      // 현재 페이지 모드와 다른 유형을 클릭하면 해당 페이지로 이동한다.
      if (nextType === "매출처" && pageMode !== "sales") {
        window.location.href = "sales-manage.html?v=" + encodeURIComponent(new URL(import.meta.url).searchParams.get("v") || "");
        return;
      }
      if (nextType === "매입처" && pageMode !== "purchase") {
        window.location.href = "purchase-manage.html?v=" + encodeURIComponent(new URL(import.meta.url).searchParams.get("v") || "");
        return;
      }
      if (nextType === "지출처") {
        window.location.href = "expense-manage.html?v=" + encodeURIComponent(new URL(import.meta.url).searchParams.get("v") || "");
        return;
      }

      // 현재 페이지 모드와 같은 유형을 다시 클릭한 경우에는
      // 기존처럼 이 페이지 안에서 분류/잔액 목록만 필터링한다.
      if (nextType === groupTypeFilter) return;
      groupTypeFilter = nextType;
      selectedSupplierGroup = "";
      setStoredString(PURCHASE_GROUP_FILTER_STORAGE_KEY, "");
      updateTypeSwitchButtons();
      rebuildSupplierGroups();
      refreshSummaryAndDetail(searchInput ? searchInput.value : "");
    });
  });
}

if (btnGroupReset) {
  btnGroupReset.addEventListener("click", async () => {
    selectedSupplierGroup = "";
    setStoredString(PURCHASE_GROUP_FILTER_STORAGE_KEY, "");
    currentSupplierFilterId = "";
    transactionViewRequested = true;
    currentSummaryKey = "";
    isSummaryFilterActive = false;
    renderSupplierGroups();
    await reloadPurchaseList();
  });
}

if (btnImportOpen && importModal) {
  btnImportOpen.addEventListener("click", () => {
    if (importTextarea) importTextarea.value = "";
    importRecords = [];
    renderImportTable(importRecords);
    updateImportSummary(importRecords);
    setImportStatus("");
    openImportModal();
  });
}

if (btnImportClose && importModal) {
  btnImportClose.addEventListener("click", () => {
    closeImportModal();
  });
}

if (btnImportDelete && importModal) {
  btnImportDelete.addEventListener("click", () => {
    if (importTextarea) importTextarea.value = "";
    importRecords = [];
    renderImportTable(importRecords);
    updateImportSummary(importRecords);
    setImportStatus("");
    purchaseImportModalDirty.markClean();
    if (importTextarea) importTextarea.focus();
  });
}

if (importModal) {
  // 매입 인식 모달도 배경 클릭으로는 닫히지 않도록 함
}

// 매입 인식 모달 상단 헤더와 메인 헤더 간 동기화
if (importDateInput) {
  // 초기값은 오늘 또는 메인 모달의 날짜
  importDateInput.value =
    dateInput && dateInput.value ? dateInput.value : todayYMD();
  updateImportDateWeekday();

  importDateInput.addEventListener("change", () => {
    updateImportDateWeekday();
    // 메인 매입 등록 헤더 날짜도 함께 변경
    if (dateInput) {
      dateInput.value = importDateInput.value;
      updateDateWeekday();
    }
  });
}

if (importKindSelect) {
  importKindSelect.addEventListener("change", () => {
    rebuildImportSupplierSelectForCurrentKind();
  });
}

if (importSupplierSelect) {
  importSupplierSelect.addEventListener("change", () => {
    applyImportSupplierFromSelect();
  });
}

// 매입 인식 모달: 거래처명 입력/선택은 네이티브 드롭다운 대신 모달을 사용
function bindImportSupplierPickerTriggers() {
  if (!importSupplierSelect && !importSupplierInput) return;

  // 모달이 없으면 네이티브 select 동작을 막지 않는다.
  if (!importSupplierPickerModal) return;

  const openIfPossible = () => openImportSupplierPickerModal();

  if (importSupplierSelect) {
    bindPickerOpenTriggers(importSupplierSelect, openIfPossible, {
      capture: true,
      schedule: true,
      events: ["pointerdown", "mousedown", "click"],
      keys: ["Enter", " ", "ArrowDown", "F4"],
    });
  }

  if (importSupplierInput) {
    bindPickerOpenTriggers(importSupplierInput, openIfPossible, {
      capture: false,
      schedule: true,
      events: ["click"],
      keys: ["Enter", " "],
    });
  }

  if (btnImportSupplierPickerClose) {
    btnImportSupplierPickerClose.addEventListener(
      "click",
      closeImportSupplierPickerModal,
    );
  }
  if (btnImportSupplierPickerConfirm) {
    btnImportSupplierPickerConfirm.addEventListener(
      "click",
      confirmImportSupplierPickerSelection,
    );
  }
}

// 매입 등록 모달: 거래처 선택은 네이티브 드롭다운 대신 모달 사용
function bindMainSupplierPickerTriggers() {
  if (!supplierSelect && !supplierInput) return;
  if (!importSupplierPickerModal) return;

  const openIfPossible = () => openMainSupplierPickerModal();

  if (supplierSelect) {
    bindPickerOpenTriggers(supplierSelect, openIfPossible, {
      capture: true,
      schedule: true,
      events: ["pointerdown", "mousedown", "click"],
      keys: ["Enter", " ", "ArrowDown", "F4"],
    });
  }

  if (supplierInput) {
    // 입력 자체를 완전히 막지는 않고, 클릭/스페이스/엔터에서는 모달을 연다.
    bindPickerOpenTriggers(supplierInput, openIfPossible, {
      capture: false,
      schedule: true,
      events: ["click"],
      keys: ["Enter", " "],
    });
  }
}

bindImportSupplierPickerTriggers();
bindMainSupplierPickerTriggers();

// 지불 등록 모달 거래처: select 클릭으로 모달 오픈, input은 직접입력 지원
if (purchasePaymentSupplierSelect) {
  bindPickerOpenTriggers(
    purchasePaymentSupplierSelect,
    () => openMainSupplierPickerModal(),
    {
      capture: true,
      schedule: true,
      events: ["pointerdown", "mousedown", "click"],
      keys: ["Enter", " ", "ArrowDown", "F4"],
    },
  );
}

if (purchasePaymentSupplierInput) {
  purchasePaymentSupplierInput.addEventListener("keydown", (e) => {
    if (e.key === "F4") {
      e.preventDefault();
      openMainSupplierPickerModal();
    }
  });

  purchasePaymentSupplierInput.addEventListener("input", () => {
    const code = String(purchasePaymentSupplierInput.value || "").trim();
    if (!code) {
      syncPurchasePaymentSupplierUI({ supplierId: "", supplierName: "" });
      purchasePaymentSupplierInput.readOnly = false;
      return;
    }
    const supplier = suppliers.find((s) => String(s.id) === String(code));
    if (supplier) {
      syncPurchasePaymentSupplierUI({
        supplierId: supplier.id || code,
        supplierName: supplier.name || supplier.id || code,
      });
    } else {
      if (purchasePaymentSupplierInput) purchasePaymentSupplierInput.readOnly = false;
      if (purchasePaymentSupplierSelect) purchasePaymentSupplierSelect.value = "";
    }
  });
}

async function saveImportRecordsImpl(options = {}) {
  const { keepOpen = false } = options;

  if (!importRecords || !importRecords.length) {
    const text = importTextarea ? importTextarea.value || "" : "";
    if (text) {
      importRecords = parsePurchaseImport(text);
    }
  }

  if (!importRecords || !importRecords.length) {
    setImportStatus("저장할 인식 결과가 없습니다.");
    return;
  }

  // 매입 입력과 동일하게 전표(묶음) 단위로 저장하기 위해
  // 동일한 batchKey와 supplierGroup을 사용한다.
  const baseDate =
    (importDateInput && importDateInput.value) ||
    (dateInput && dateInput.value) ||
    todayYMD();
  const baseSupplierIdRaw =
    (importSupplierSelect && importSupplierSelect.value) ||
    (supplierSelect && supplierSelect.value) ||
    "";
  // header의 input은 보통 '코드' 표시용이라 이름이 아닐 수 있어, 기본값은 그대로 두고 아래에서 보정한다.
  const baseSupplierNameRaw =
    (importSupplierInput && importSupplierInput.value.trim()) ||
    (supplierInput && supplierInput.value.trim()) ||
    "";

  // 인식 저장 시 거래처가 비어 저장되면 화면에서 전표가 누락될 수 있어,
  // 현재 선택된 거래처(좌측 선택/필터)를 우선적으로 fallback으로 사용한다.
  let resolvedSupplierId =
    String(baseSupplierIdRaw || "").trim() ||
    String(currentSupplierFilterId || "").trim() ||
    String(currentSelectedSupplierId || "").trim();

  // 셀렉트 값이 비었지만, 헤더 입력칸에 거래처명이 표시되는 케이스가 있어
  // 이름(정확히 일치)으로도 거래처 코드를 역추적한다.
  if (!resolvedSupplierId) {
    const seedName = String(baseSupplierNameRaw || "").trim();
    if (seedName) {
      const byName = suppliers.find((s) => String(s?.name || "").trim() === seedName);
      if (byName && byName.id != null) {
        resolvedSupplierId = String(byName.id);
      }
    }
  }

  const resolvedSupplier = resolvedSupplierId
    ? suppliers.find((s) => String(s.id) === String(resolvedSupplierId))
    : null;

  const baseSupplierId = resolvedSupplierId;
  // supplierName은 검색/표시 보조용. 가능하면 실제 거래처명을 채운다.
  const baseSupplierName = resolvedSupplier
    ? String(resolvedSupplier.name || resolvedSupplier.id || '')
    : String(baseSupplierNameRaw || '').trim();

  const matchedSupplier = suppliers.find(
    (s) => String(s.id) === String(baseSupplierId || ""),
  );
  const supplierGroupName = matchedSupplier
    ? matchedSupplier.group || "미분류"
    : "미분류";
  const batchKey = String(Date.now());

  if (!baseSupplierId) {
    setImportStatus("매입처를 선택하세요.");
    // 저장 버튼 클릭 시 모달이 갑자기 뜨는 것을 방지하고,
    // 사용자가 의도적으로 거래처 선택을 하도록 입력/셀렉트에 포커스만 준다.
    try {
      if (importSupplierSelect) importSupplierSelect.focus();
      else if (importSupplierInput) importSupplierInput.focus();
    } catch {
      // ignore
    }
    return;
  }

  if (!baseSupplierName) {
    setImportStatus("매입처를 선택하세요.");
    try {
      if (importSupplierSelect) importSupplierSelect.focus();
      else if (importSupplierInput) importSupplierInput.focus();
    } catch {
      // ignore
    }
    return;
  }

  // 인식 결과에 누락이 있으면 저장을 막고(빨간 칸 표시), 사용자가 표에서 직접 수정하도록 유도한다.
  const invalidIndex = importRecords.findIndex(
    (rec) => getImportMissingFieldKeys(rec).length > 0,
  );
  if (invalidIndex >= 0) {
    renderImportTable(importRecords);
    setImportStatus(
      "빈 칸(빨간색)이 있습니다. 표에서 값을 채운 뒤 다시 저장해 주세요.",
    );
    return;
  }

  // 동일한 전표(날짜/거래처/품목+수량+단가+합계/건수)가 이미 저장돼 있으면 저장 전 1회 경고
  try {
    const ok = await confirmDuplicateBatchBeforeSave({
      source: "purchase",
      date: baseDate,
      supplierId: baseSupplierId,
      rows: importRecords,
    });
    if (!ok) {
      setImportStatus("저장을 취소했습니다.");
      return;
    }
  } catch {
    // ignore
  }

  const batchAdd = [];
  for (const rec of importRecords) {
    const purchase = {
      type: "expense",
      category: transactionCategory,
      date: baseDate,
      supplierId: baseSupplierId,
      supplierName: baseSupplierName,
      supplierGroup: supplierGroupName,
      batchKey,
      itemId: rec.code || "",
      itemCode: rec.code || "",
      itemName: rec.name || "",
      itemSpec: rec.spec || "",
      unit: rec.unit || "",
      quantity: Number(rec.qty) || 0,
      unitPrice: Number(rec.unitPrice) || 0,
      taxType: normalizeTaxType(rec.taxType),
      supplyAmount: Number(rec.supplyAmount) || 0,
      taxAmount: Number(rec.taxAmount) || 0,
      amount: Number(rec.total) || 0,
      warehouse: rec.warehouse || "기본창고",
      memo: "",
      source: "purchase",
    };

    batchAdd.push(purchase);


  }

  await saveTransactionBatch({ add: batchAdd });
  await applySavedBatchPrices(batchAdd);
  setImportStatus(`인식된 ${batchAdd.length}건을 저장했습니다.`);
  await reloadPurchaseList();

  // 저장 완료 상태를 기준으로 dirty 스냅샷을 갱신해
  // 닫기 버튼에서 '저장되지 않음' 경고가 불필요하게 뜨지 않도록 한다.
  purchaseImportModalDirty.markClean();

  if (keepOpen) {
    if (importTextarea) {
      importTextarea.value = "";
      importTextarea.focus();
    }
    importRecords = [];
    renderImportTable(importRecords);
    updateImportSummary(importRecords);

    // 화면을 초기화한 상태를 clean 으로 간주
    purchaseImportModalDirty.markClean();
    return;
  }

  closeImportModal();
}

if (btnImportParse && importTextarea) {
  btnImportParse.addEventListener("click", () => {
    const raw = importTextarea.value || "";
    const text = normalizeImportText(raw);
    if (text !== raw) importTextarea.value = text;
    importRecords = parsePurchaseImport(text);
    renderImportTable(importRecords);
    updateImportSummary(importRecords);
    // 인식 결과는 표/합계로만 확인하고, 별도 행 수 문구는 표시하지 않는다.
    setImportStatus("");
  });
}

// 붙여넣기 직후: 빈 칸(탭 2개)을 포함해 12칸 정렬로 정규화
if (importTextarea) {
  importTextarea.addEventListener("paste", () => {
    setTimeout(() => {
      const raw = importTextarea.value || "";
      const next = normalizeImportText(raw);
      if (next !== raw) importTextarea.value = next;
    }, 0);
  });
}

if (btnImportSave && importTextarea) {
  btnImportSave.addEventListener("click", async () => {
    await saveImportRecords({ keepOpen: false });
  });
}

if (btnImportContinue && importTextarea) {
  btnImportContinue.addEventListener("click", async () => {
    await saveImportRecords({ keepOpen: true });
  });
}

const purchaseExcelDropdown = bindExcelDropdown({
  toggleButton: btnExcelToggle,
  menuEl: excelMenu,
  dropdownWrap: excelDropdownWrap,
});

if (btnExcelExportScreen) {
  btnExcelExportScreen.addEventListener("click", () => {
    downloadPurchasesAsXlsx();
    purchaseExcelDropdown?.setOpen(false);
  });
}

if (searchInput) {
  attachSearchInput(searchInput, (keyword) => {
    refreshSummaryAndDetail(keyword);
  });
}

// 날짜 범위 조회 버튼

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
    renderList(searchInput ? searchInput.value : "");
  });
}

async function init() {
  await loadSuppliersAndItems();
  resetForm();
  setupEntryRowOutsideClickHandler();
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

      // init 단계에서는 reloadPurchaseList가 렌더를 담당
      if (String(source || "").startsWith("init:")) return;

      // 결제관리처럼 최신이 아래로 보이도록 날짜 오름차순으로 고정 + 1회 강제 스크롤
      currentSort = { key: "date", direction: "asc" };
      purchaseListAutoScroll.forceNext();

      // 날짜 필터를 변경하면 상단 요약 선택 기반 상세 필터는 해제
      refreshSummaryAndDetail(searchInput ? searchInput.value : "");
    },
  });
  await reloadPurchaseList();
  entryTableManager.bind();

  installDbAutoRefresh({
    refresh: async () => {
      await loadSuppliersAndItems();
      await reloadPurchaseList();
    },
    isBusy: () => document.body.classList.contains("modal-open"),
  });
}

init();

