import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  createFormDirtyTracker,
  wrapDirtyClose,
  enableTableArrowNavigation,
  bindDblClickRowEdit,
  bindClickRowSelect,
} from "../common/ui-helpers.js?v=app-20261010-14";
import { confirmDialog, warningDialog } from "../common/dialogs.js?v=app-20261010-14";
import { getNextItemGroupCode } from "./item-utils.js?v=app-20261010-14";

export function createItemGroupManager(options) {
  const {
    listEl,
    formEl,
    idModeSelect,
    codeInput,
    nameInput,
    modalEl,
    btnOpen,
    btnClose,
    btnSaveContinue,
    btnEdit,
    btnDelete,
    groupSelect,
    groupInputRow,
    searchInput,
    getItemGroups,
    addItemGroup,
    updateItemGroup,
    deleteItemGroup,
    getItems,
    renameItemGroupNameInItems,
    onReloadList,
  } = options || {};

  let selectedItemGroupCode = null;
  let selectedItemGroupName = null;
  let editingItemGroupCode = null;
  let itemGroupModalEscOff = null;
  let submitMode = "close";

  const itemGroupModalDirty = createFormDirtyTracker(() => ({
    code: codeInput ? codeInput.value : "",
    name: nameInput ? nameInput.value : "",
  }));

  const closeItemGroupModalWithConfirm = wrapDirtyClose(
    itemGroupModalDirty,
    baseCloseItemGroupModal,
  );

  function baseCloseItemGroupModal() {
    if (modalEl) {
      closeModalOverlay(modalEl);
      if (typeof itemGroupModalEscOff === "function") {
        itemGroupModalEscOff();
        itemGroupModalEscOff = null;
      }
    }
  }

  function openItemGroupModal() {
    if (modalEl) {
      openModalOverlay(modalEl);
      itemGroupModalDirty.markClean();
      if (typeof itemGroupModalEscOff === "function") itemGroupModalEscOff();
      itemGroupModalEscOff = registerModalEscClose(
        modalEl,
        closeItemGroupModalWithConfirm,
      );
    }
  }

  function closeItemGroupModal() {
    closeItemGroupModalWithConfirm();
  }

  async function generateItemGroupCode() {
    const groups = await getItemGroups();
    return getNextItemGroupCode(groups);
  }

  async function previewNextItemGroupCode() {
    if (!codeInput) return;
    if (editingItemGroupCode) return;
    if (idModeSelect && idModeSelect.value === "manual") return;
    const next = await generateItemGroupCode();
    codeInput.value = next;
  }

  async function loadItemGroups() {
    const groups = await getItemGroups();
    if (listEl) {
      listEl.innerHTML = "";
      groups.forEach((g) => {
        const tr = document.createElement("tr");
        tr.dataset.code = g.code;
        tr.dataset.name = g.name;
        tr.innerHTML = `
          <td>${g.code}</td>
          <td>${g.name}</td>
        `;
        listEl.appendChild(tr);
      });

      bindClickRowSelect(listEl, {
        rowSelector: 'tr[data-code]',
        onSelect: async (row) => {
          selectedItemGroupCode = String(row?.dataset?.code || '');
          selectedItemGroupName = String(row?.dataset?.name || '');
          if (searchInput) searchInput.value = String(row?.dataset?.name || '');
          if (typeof onReloadList === 'function') {
            await onReloadList();
          }
        },
      });

      enableTableArrowNavigation(listEl, {
        onSelect: (row) => row.click(),
        enableEnter: true,
      });

      bindDblClickRowEdit(listEl, {
        rowSelector: 'tr[data-code]',
        editButton: btnEdit,
      });
    }

    if (groupSelect) {
      groupSelect.innerHTML = '<option value="">선택</option>';
      groups.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.name;
        opt.textContent = g.name;
        groupSelect.appendChild(opt);
      });
      if (groupInputRow) groupInputRow.hidden = true;
    }
  }

  if (btnOpen) {
    btnOpen.addEventListener("click", async () => {
      editingItemGroupCode = null;
      if (formEl) formEl.reset();
      if (idModeSelect) {
        idModeSelect.value = "auto";
        idModeSelect.disabled = false;
      }
      if (codeInput) codeInput.readOnly = true;
      await previewNextItemGroupCode();
      openItemGroupModal();
      if (nameInput) nameInput.focus();
    });
  }

  if (idModeSelect) {
    idModeSelect.addEventListener("change", async () => {
      if (idModeSelect.value === "auto") {
        if (codeInput) codeInput.readOnly = true;
        await previewNextItemGroupCode();
      } else {
        if (codeInput) {
          codeInput.readOnly = false;
          codeInput.value = "";
          codeInput.focus();
        }
      }
    });
    if (idModeSelect.value === "auto" && codeInput) {
      codeInput.readOnly = true;
    }
  }

  if (btnClose) {
    btnClose.addEventListener("click", () => {
      // reset을 먼저 하면 dirty-tracker가 변경으로 인식해
      // "변경사항이 저장되지 않았습니다" confirm이 불필요하게 뜰 수 있다.
      closeItemGroupModal();
      // 모달이 실제로 닫힌 경우에만 폼을 초기화한다(Dirty 확인 취소 시에는 호출되지 않음)
      if (modalEl && !modalEl.classList.contains("is-open")) {
        if (formEl) formEl.reset();
      }
    });
  }

  if (btnSaveContinue && formEl) {
    btnSaveContinue.addEventListener("click", () => {
      submitMode = "continue";
      if (typeof formEl.requestSubmit === "function") formEl.requestSubmit();
      else formEl.querySelector('button[type="submit"]')?.click();
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      let code = (codeInput?.value || "").trim();
      const name = (nameInput?.value || "").trim();

      if (!editingItemGroupCode && idModeSelect && idModeSelect.value === "auto") {
        code = await generateItemGroupCode();
        if (codeInput) codeInput.value = code;
      }

      if (!code) {
        await warningDialog("분류코드를 입력하세요.");
        codeInput?.focus();
        return;
      }
      if (!name) {
        await warningDialog("분류 이름을 입력하세요.");
        nameInput?.focus();
        return;
      }

      const groups = await getItemGroups();
      const prevGroup = editingItemGroupCode
        ? groups.find((g) => g.code === editingItemGroupCode)
        : null;
      const prevName = prevGroup ? String(prevGroup.name || "").trim() : "";

      const others = editingItemGroupCode
        ? groups.filter((g) => g.code !== editingItemGroupCode)
        : groups;
      if (others.some((g) => g.code === code)) {
        await warningDialog("이미 사용 중인 분류코드입니다. 다른 코드를 입력하세요.");
        codeInput?.focus();
        return;
      }

      if (!editingItemGroupCode) {
        await addItemGroup({ code, name });
      } else {
        if (editingItemGroupCode !== code) {
          await deleteItemGroup(editingItemGroupCode);
          await addItemGroup({ code, name });
        } else {
          await updateItemGroup({ code, name });
        }
      }

      // 분류명 변경 시, 해당 분류를 사용하는 품목들의 분류명도 함께 갱신
      if (prevName && prevName !== name && typeof renameItemGroupNameInItems === "function") {
        try {
          await renameItemGroupNameInItems(prevName, name);
        } catch (err) {
          console.error("품목 분류명 일괄 갱신 실패:", err);
        }
      }

      await loadItemGroups();
      if (typeof onReloadList === "function") {
        await onReloadList();
      }
      // 저장이 완료된 상태이므로 닫을 때 dirty confirm이 뜨지 않도록 clean 처리
      if (itemGroupModalDirty?.markClean) itemGroupModalDirty.markClean();

      if (submitMode === "continue") {
        submitMode = "close";
        const keepMode = idModeSelect ? idModeSelect.value : "auto";
        editingItemGroupCode = null;
        if (formEl) formEl.reset();
        if (idModeSelect) {
          idModeSelect.value = keepMode || "auto";
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
        if (idModeSelect && idModeSelect.value === "auto") {
          await previewNextItemGroupCode();
        }
        if (itemGroupModalDirty?.markClean) itemGroupModalDirty.markClean();
        nameInput?.focus();
        return;
      }

      submitMode = "close";
      closeItemGroupModal();
      if (modalEl && !modalEl.classList.contains("is-open")) {
        if (formEl) formEl.reset();
      }
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener("click", async () => {
      if (!selectedItemGroupCode) {
        await warningDialog("먼저 수정할 분류를 왼쪽 목록에서 선택하세요.");
        return;
      }
      const groups = await getItemGroups();
      const target = groups.find((g) => g.code === selectedItemGroupCode);
      if (!target) {
        await warningDialog("선택한 분류를 찾을 수 없습니다.");
        return;
      }
      editingItemGroupCode = target.code;
      if (idModeSelect) {
        idModeSelect.value = "manual";
        idModeSelect.disabled = true;
      }
      if (codeInput) codeInput.value = target.code;
      if (codeInput) codeInput.readOnly = false;
      if (nameInput) nameInput.value = target.name;
      openItemGroupModal();
      if (nameInput) nameInput.focus();
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      if (!selectedItemGroupCode) {
        await warningDialog("먼저 삭제할 분류를 왼쪽 목록에서 선택하세요.");
        return;
      }

      const items = await getItems();
      const groups = await getItemGroups();
      const target = groups.find((g) => g.code === selectedItemGroupCode);
      const usingItems = target
        ? items.filter((it) => it.group === target.name)
        : [];

      if (usingItems.length > 0) {
        await warningDialog("해당 분류를 사용하는 품목이 있어 삭제할 수 없습니다.");
        return;
      }

      const ok = await confirmDialog("선택한 분류를 삭제하시겠습니까?", {
        title: "삭제 확인",
        okText: "삭제",
        cancelText: "취소",
        tone: "danger",
      });
      if (!ok) return;

      await deleteItemGroup(selectedItemGroupCode);
      selectedItemGroupCode = null;
      selectedItemGroupName = null;
      await loadItemGroups();
    });
  }

  return {
    loadItemGroups,
    getSelectedItemGroupName: () => selectedItemGroupName,
  };
}

