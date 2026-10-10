import {
  getItems,
  getTransactions,
  addItemMaster,
  updateItem,
  renameItem,
  deleteItem,
  bulkInsertItems,
  bulkReplaceItemGroups,
  getItemGroups,
  addItemGroup,
  updateItemGroup,
  deleteItemGroup,
  renameItemGroupNameInItems,
} from "./db.js?v=ledger-atomic-20261010-1";
import { createItemGroupManager } from "./item-manage/item-group-manager.js?v=ledger-atomic-20261010-1";
import { createItemListManager } from "./item-manage/item-list-manager.js?v=ledger-atomic-20261010-1";
import { createItemFormManager } from "./item-manage/item-form-manager.js?v=ledger-atomic-20261010-1";
import { createItemActionsManager } from "./item-manage/item-actions-manager.js?v=ledger-atomic-20261010-1";
import { createModalManager } from "./common/modal-manager.js?v=ledger-atomic-20261010-1";
import { bindDblClickRowEdit } from "./common/ui-helpers.js?v=ledger-atomic-20261010-1";
import { bootstrapPageCommon } from "./common/page-bootstrap.js?v=ledger-atomic-20261010-1";
import { generateItemId, getNextItemGroupCode } from "./item-manage/item-utils.js?v=ledger-atomic-20261010-1";
import { loadItemsFromJson } from "./item-manage/item-data-loader.js?v=ledger-atomic-20261010-1";
import { installDbAutoRefresh } from "./common/app-events.js?v=ledger-atomic-20261010-1";

bootstrapPageCommon({
  page: "item",
  injectPickerModals: false,
  bindModalChrome: true,
  enableDateWeekdayAuto: false,
});

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

const form = document.getElementById("item-form");
const idModeSelect = document.getElementById("item-id-mode");
const idInput = document.getElementById("item-id");
const groupSelect = document.getElementById("item-group-select");
const groupInput = document.getElementById("item-group");
const groupInputRow = document.querySelector(".group-input-row");
const nameInput = document.getElementById("item-name");
const specInput = document.getElementById("item-spec");
const unitInput = document.getElementById("item-unit");
const priceInput = document.getElementById("item-price"); // 매입가
const shrinkPercentInput = document.getElementById("item-shrink-percent"); // 감량율(%)
const shrinkPriceInput = document.getElementById("item-shrink-price"); // 감량원가
const avgPriceInput = document.getElementById("item-avg-price"); // 평균가

const saleMarginInput = document.getElementById("item-sale-margin"); // 소매 마진%
const salePriceInput = document.getElementById("item-sale-price"); // 판매가
const deliveryMarginInput = document.getElementById("item-delivery-margin"); // 납품 마진%
const deliveryPriceInput = document.getElementById("item-delivery-price"); // 납품가
const statusInput = document.getElementById("item-status");
// (deprecated) item-memo 입력은 현재 HTML에 없음
const memoInput = null;
const btnFormClose = document.getElementById("btn-item-form-close");
const btnFormSaveContinue = document.getElementById(
  "btn-item-form-save-continue",
);
const itemModal = document.getElementById("item-modal");

const btnLoadJson = document.getElementById("btn-item-load-json");
const btnBackupJson = document.getElementById("btn-item-backup");
const btnRestoreJson = document.getElementById("btn-item-restore");
const restoreFileInput = document.getElementById("item-restore-file");
const btnRowNew = document.getElementById("btn-item-row-new");
const btnRowEdit = document.getElementById("btn-item-row-edit");
const btnRowDelete = document.getElementById("btn-item-row-delete");

const listBody = document.getElementById("item-list");
const tableHeader = document.querySelector(
  ".customer-main-card .tx-table thead",
);
const searchInput = document.getElementById("item-search");

async function updateItemJsonImportButtonVisibility() {
  if (!btnLoadJson) return;
  try {
    const items = await getItems();
    btnLoadJson.hidden = (items || []).length > 0;
  } catch (_) {
    // DB 조회 실패 시에는 버튼을 숨기지 않는다.
    btnLoadJson.hidden = false;
  }
}

async function reloadItemsAndUpdateImportButton() {
  await itemListManager.reloadList();
  await updateItemJsonImportButtonVisibility();
}

// 품목 분류 마스터 관련 요소
const itemGroupList = document.getElementById("item-group-master-list");
const itemGroupForm = document.getElementById("item-group-form");
const itemGroupCodeInput = document.getElementById("item-group-code");
const itemGroupNameInput = document.getElementById("item-group-name");
const itemGroupIdModeSelect = document.getElementById("item-group-id-mode");
const itemGroupModal = document.getElementById("item-group-modal");
const btnItemGroupOpen = document.getElementById("btn-open-item-group-modal");
const btnItemGroupClose = document.getElementById("btn-item-group-close");
const btnItemGroupSaveContinue = document.getElementById(
  "btn-item-group-save-continue",
);
const btnItemGroupEdit = document.getElementById("btn-item-group-edit");
const btnItemGroupDelete = document.getElementById("btn-item-group-delete");

const itemModalTitle = document.getElementById("item-modal-title");

let previewNextIdSeq = 0;
let itemSubmitMode = "close";
const itemModalManager = createModalManager({
  modalEl: itemModal,
  getSnapshot: () => ({
    id: idInput ? idInput.value : "",
    group: groupInput ? groupInput.value : "",
    name: nameInput ? nameInput.value : "",
    spec: specInput ? specInput.value : "",
    unit: unitInput ? unitInput.value : "",
    price: priceInput ? priceInput.value : "",
    shrinkPercent: shrinkPercentInput ? shrinkPercentInput.value : "",
    shrinkPrice: shrinkPriceInput ? shrinkPriceInput.value : "",
    avgPrice: avgPriceInput ? avgPriceInput.value : "",
    saleMargin: saleMarginInput ? saleMarginInput.value : "",
    salePrice: salePriceInput ? salePriceInput.value : "",
    deliveryMargin: deliveryMarginInput ? deliveryMarginInput.value : "",
    deliveryPrice: deliveryPriceInput ? deliveryPriceInput.value : "",
    status: statusInput ? statusInput.value : "",
    memo: memoInput ? memoInput.value : "",
  }),
});
let itemFormManager;

const itemListManager = createItemListManager({
  listEl: listBody,
  tableHeaderEl: tableHeader,
  searchInput,
  getItems,
  getItemGroups,
  onSelectItem: (item) => itemFormManager?.loadToForm(item),
});

// 품목 목록: 더블클릭으로 수정 모달 열기
if (listBody) {
  bindDblClickRowEdit(listBody, {
    rowSelector: 'tr[data-id]',
    editButton: btnRowEdit,
  });
}

itemFormManager = createItemFormManager({
  formEl: form,
  idModeSelect,
  idInput,
  groupSelect,
  groupInput,
  groupInputRow,
  nameInput,
  specInput,
  unitInput,
  priceInput,
  shrinkPercentInput,
  shrinkPriceInput,
  avgPriceInput,
  saleMarginInput,
  salePriceInput,
  deliveryMarginInput,
  deliveryPriceInput,
  statusInput,
  memoInput,
  getItems,
  addItemMaster,
  updateItem,
  renameItem,
  onPreviewNextId: previewNextId,
  onReloadList: reloadItemsAndUpdateImportButton,
  onCloseModal: itemModalManager.close,
  onDirtyMark: itemModalManager.markClean,
  getSubmitMode: () => itemSubmitMode,
  onAfterSubmit: () => {
    itemSubmitMode = "close";
  },
});

const itemGroupManager = createItemGroupManager({
  listEl: itemGroupList,
  formEl: itemGroupForm,
  idModeSelect: itemGroupIdModeSelect,
  codeInput: itemGroupCodeInput,
  nameInput: itemGroupNameInput,
  modalEl: itemGroupModal,
  btnOpen: btnItemGroupOpen,
  btnClose: btnItemGroupClose,
  btnSaveContinue: btnItemGroupSaveContinue,
  btnEdit: btnItemGroupEdit,
  btnDelete: btnItemGroupDelete,
  groupSelect,
  groupInputRow,
  searchInput,
  getItemGroups,
  addItemGroup,
  updateItemGroup,
  deleteItemGroup,
  getItems,
  renameItemGroupNameInItems,
  onReloadList: reloadItemsAndUpdateImportButton,
});

if (btnFormSaveContinue && form) {
  btnFormSaveContinue.addEventListener("click", () => {
    itemSubmitMode = "continue";
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.querySelector('button[type="submit"]')?.click();
  });
}

async function previewNextId() {
  if (!idInput) return;
  if (idModeSelect && idModeSelect.value === "manual") return;

  const seq = ++previewNextIdSeq;
  const items = await getItems();
  const nextId = generateItemId(items);
  if (seq !== previewNextIdSeq) return;
  idInput.value = nextId;
}

async function importItemsFromJson() {
  try {
    const imported = await loadItemsFromJson({
      url: "data/items.json",
      bulkInsertItems,
    });

    const addedGroups = await syncItemGroupsFromItems(imported);

    const msg = [
      "JSON 품목 데이터를 불러왔습니다.",
      addedGroups > 0 ? `분류 ${addedGroups}개도 함께 추가했습니다.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    alert(msg);
    itemFormManager.resetForm();
    await reloadItemsAndUpdateImportButton();
    await itemGroupManager.loadItemGroups();
  } catch (err) {
    console.error(err);
    alert("JSON 불러오기 중 오류가 발생했습니다.");
  }
}

async function backupItemsToJson() {
  try {
    const groups = await getItemGroups();
    const items = await getItems();
    const payload = { groups, items };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `item-backup-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("품목 백업(JSON) 중 오류가 발생했습니다.");
  }
}

async function syncItemGroupsFromItems(items) {
  const names = Array.from(
    new Set(
      (items || [])
        .map((it) => String(it?.group ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  if (!names.length) return 0;

  const existingGroups = await getItemGroups();
  const existingNames = new Set(
    (existingGroups || [])
      .map((g) => String(g?.name ?? "").trim())
      .filter(Boolean),
  );

  let groups = [...(existingGroups || [])];
  let added = 0;

  for (const name of names) {
    if (existingNames.has(name)) continue;
    const code = getNextItemGroupCode(groups);
    const group = { code, name };
    await addItemGroup(group);
    groups.push(group);
    existingNames.add(name);
    added += 1;
  }

  return added;
}

// 모달 바깥 영역 클릭으로는 닫히지 않도록 한다.
// 닫기는 [닫기] 버튼 클릭과 ESC 키만 사용.
if (itemModal) {
  // 의도적으로 바깥 클릭 시 아무 동작도 하지 않음
}

createItemActionsManager({
  btnFormClose,
  btnRowNew,
  btnRowEdit,
  btnRowDelete,
  btnLoadJson,
  nameInput,
  getEditingId: () => itemFormManager.getCurrentEditingId(),
  onOpenModal: () => {
    // 신규등록 모달을 열 때, 왼쪽 분류(마스터)에서 선택된 분류를 자동으로 채운다.
    // (수정 모드에서는 기존 품목의 분류를 유지)
    const editingId = itemFormManager?.getCurrentEditingId?.();
    if (!editingId) {
      const selectedGroupName = itemGroupManager?.getSelectedItemGroupName?.();
      if (selectedGroupName && groupSelect) {
        const hasOption = Array.from(groupSelect.options || []).some(
          (opt) => opt.value === selectedGroupName,
        );
        if (hasOption) {
          groupSelect.value = selectedGroupName;
          if (groupInput) groupInput.value = selectedGroupName;
          if (groupInputRow) groupInputRow.classList.add("is-hidden");
        }
      }
    }
    itemModalManager.open();
  },
  onCloseModal: itemModalManager.close,
  onResetForm: () => itemFormManager.resetForm(),
  onSetModalMode: (mode) => {
    if (!itemModalTitle) return;
    itemModalTitle.textContent = mode === "edit" ? "품목 수정" : "품목 추가";
  },
  onPreviewNextId: previewNextId,
  onReloadList: reloadItemsAndUpdateImportButton,
  onDeleteItem: async (id) => {
    const itemId = String(id || "").trim();
    if (!itemId) return;

    const items = await getItems();
    const target = (items || []).find(
      (it) => String(it?.id || "").trim() === itemId,
    );
    if (!target) return;

    // 거래가 없으면 완전 삭제, 거래가 있으면 비활성(미사용) 처리
    let hasRelatedTx = false;
    try {
      const txs = await getTransactions();
      hasRelatedTx = (txs || []).some((tx) => {
        const tid = String(tx?.itemId || "").trim();
        const tcode = String(tx?.itemCode || "").trim();
        return tid === itemId || tcode === itemId;
      });
    } catch (_) {
      hasRelatedTx = true;
    }

    if (!hasRelatedTx) {
      await deleteItem(itemId);
      return;
    }

    // 삭제 대신 비활성(미사용) 처리: 과거 거래는 유지
    target.status = "inactive";
    await updateItem(target);
  },
  onImportJson: importItemsFromJson,
  messages: {
    needSelectItem: "먼저 수정할 품목 행을 클릭해서 선택하세요.",
    needSelectItemDelete:
      "먼저 비활성(미사용) 처리할 품목 행을 클릭해서 선택하세요.",
    confirmDelete:
      "선택한 품목을 처리할까요?\n\n- 거래 내역이 없으면: 완전 삭제\n- 거래 내역이 있으면: 비활성(미사용) 처리(과거 거래 유지, 신규 선택 숨김)",
    confirmImport:
      "현재 품목 데이터를 모두 지우고 JSON에서 다시 불러옵니다. 계속할까요?",
  },
});

itemGroupManager.loadItemGroups();
reloadItemsAndUpdateImportButton();
previewNextId();

installDbAutoRefresh({
  refresh: async () => {
    await itemGroupManager.loadItemGroups();
    await reloadItemsAndUpdateImportButton();
    previewNextId();
  },
  isBusy: () => document.body.classList.contains("modal-open"),
});

if (btnBackupJson) {
  btnBackupJson.addEventListener("click", backupItemsToJson);
}
if (btnRestoreJson) {
  btnRestoreJson.addEventListener("click", () => {
    if (!restoreFileInput) {
      alert("복원용 파일 선택기를 찾지 못했습니다.");
      return;
    }
    restoreFileInput.value = "";
    restoreFileInput.click();
  });
}

if (restoreFileInput) {
  restoreFileInput.addEventListener("change", async () => {
    if (!restoreFileInput.files || !restoreFileInput.files[0]) return;
    const file = restoreFileInput.files[0];

    const ok = await confirmAsync(
      "현재 품목/분류 데이터를 모두 지우고 백업 파일로 복원합니다. 계속할까요?",
      { title: "복원 확인", okText: "복원", cancelText: "취소", tone: "danger" },
    );
    if (!ok) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const isArray = Array.isArray(data);
      const hasGroupsKey =
        !isArray &&
        data &&
        typeof data === "object" &&
        Object.prototype.hasOwnProperty.call(data, "groups");

      const items = isArray
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];
      const groups = hasGroupsKey && Array.isArray(data?.groups) ? data.groups : [];

      if (!Array.isArray(items)) {
        alert("복원 파일 형식이 올바르지 않습니다.");
        return;
      }

      await bulkInsertItems(items);

      if (hasGroupsKey) {
        await bulkReplaceItemGroups(groups);
      } else {
        await syncItemGroupsFromItems(items);
      }

      itemFormManager?.resetForm();
      await reloadItemsAndUpdateImportButton();
      await itemGroupManager.loadItemGroups();
      alert("품목 데이터를 백업 파일로 복원했습니다.");
    } catch (err) {
      console.error(err);
      alert("품목 복원(JSON) 중 오류가 발생했습니다.");
    }
  });
}

