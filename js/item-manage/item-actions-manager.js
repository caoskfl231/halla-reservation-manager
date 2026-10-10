import { confirmDialog, warningDialog } from "../common/dialogs.js?v=ledger-load-20261010-1";

export function createItemActionsManager(options = {}) {
  const {
    btnFormClose,
    btnRowNew,
    btnRowEdit,
    btnRowDelete,
    btnLoadJson,
    nameInput,
    getEditingId,
    onOpenModal,
    onCloseModal,
    onResetForm,
    onPreviewNextId,
    onReloadList,
    onDeleteItem,
    onImportJson,
    onSetModalMode,
    messages = {},
  } = options;

  const {
    needSelectItem = "먼저 수정할 품목 행을 클릭해서 선택하세요.",
    needSelectItemDelete = "먼저 삭제할 품목 행을 클릭해서 선택하세요.",
    confirmDelete = "선택한 품목을 삭제하시겠습니까?",
    confirmImport = "현재 품목 데이터를 모두 지우고 JSON에서 다시 불러옵니다. 계속할까요?",
  } = messages;

  if (btnFormClose) {
    btnFormClose.addEventListener("click", () => {
      if (typeof onCloseModal === "function") onCloseModal();
    });
  }

  if (btnRowEdit) {
    btnRowEdit.addEventListener("click", async () => {
      const currentId =
        typeof getEditingId === "function" ? getEditingId() : null;
      if (!currentId) {
        await warningDialog(needSelectItem);
        return;
      }
      if (typeof onSetModalMode === "function") onSetModalMode("edit");
      if (typeof onOpenModal === "function") onOpenModal();
      if (nameInput) nameInput.focus();
    });
  }

  if (btnRowDelete) {
    btnRowDelete.addEventListener("click", async () => {
      const currentId =
        typeof getEditingId === "function" ? getEditingId() : null;
      if (!currentId) {
        await warningDialog(needSelectItemDelete);
        return;
      }

      const ok = await confirmDialog(confirmDelete, {
        title: "삭제 확인",
        okText: "삭제",
        cancelText: "취소",
        tone: "danger",
      });
      if (!ok) return;

      if (typeof onDeleteItem === "function") {
        await onDeleteItem(currentId);
      }
      if (typeof onResetForm === "function") onResetForm();
      if (typeof onReloadList === "function") await onReloadList();
    });
  }

  if (btnRowNew) {
    btnRowNew.addEventListener("click", async () => {
      if (typeof onSetModalMode === "function") onSetModalMode("new");
      if (typeof onResetForm === "function") onResetForm();
      if (typeof onPreviewNextId === "function") await onPreviewNextId();
      if (typeof onOpenModal === "function") onOpenModal();
      if (nameInput) nameInput.focus();
    });
  }

  if (btnLoadJson) {
    btnLoadJson.addEventListener("click", async () => {
      const ok = await confirmDialog(confirmImport, {
        title: "불러오기 확인",
        okText: "계속",
        cancelText: "취소",
        tone: "danger",
      });
      if (!ok) return;
      if (typeof onImportJson === "function") await onImportJson();
    });
  }
}

