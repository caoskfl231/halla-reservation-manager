import { confirmDialog, showToast, warningDialog } from "../common/dialogs.js?v=app-20261010-9";

export function bindPaymentActions(options = {}) {
  const {
    btnPaymentNew,
    btnPaymentEdit,
    btnPaymentDelete,
    btnPaymentImport,
    getSelectedMainRowId,
    setEditId,
    primePaymentEntrySelectData,
    populatePaymentLedgerSelectOptions,
    populatePaymentCounterpartySelectOptions,
    getSelectedPaymentFlow,
    openPaymentModal,
    resetFilters,
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
    getSelectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry,
    messages = {},
  } = options;

  const {
    needSelectEdit = "먼저 수정할 거래를 선택하세요.",
    notFoundTx = "거래 데이터를 찾을 수 없습니다.",
    transferEditBlocked = "이체 거래는 수정이 어렵습니다.\n삭제 후 다시 등록해 주세요.",
    needSelectDelete = "먼저 삭제할 거래를 선택하세요.",
    foreignLinkedBlocked = "이 거래는 매입/지출 등 다른 화면에서 등록된 전표와 연결되어 있습니다.\n원 거래 화면에서 먼저 전표를 삭제해 주세요.",
    transferDeleteBlocked = "이체 거래는 보낸 통장 쪽에서만 삭제할 수 있습니다.",
    confirmDelete = "선택한 거래를 삭제하시겠습니까?",
    importNeedAccount = "좌측 장부관리에서 계정을 먼저 선택해 주세요.",
    importNeedLedgerItem = "저장을 위해 좌측 장부목록에서 출금 장부를 선택해 주세요.",
  } = messages;

  if (btnPaymentNew) {
    btnPaymentNew.onclick = async () => {
      if (typeof setEditId === "function") setEditId(null);
      if (typeof primePaymentEntrySelectData === "function") {
        await primePaymentEntrySelectData();
      }
      if (typeof populatePaymentLedgerSelectOptions === "function") {
        populatePaymentLedgerSelectOptions({ keepValue: true });
      }
      if (typeof populatePaymentCounterpartySelectOptions === "function") {
        populatePaymentCounterpartySelectOptions(getSelectedPaymentFlow(), {
          keepValue: true,
        });
      }
      if (typeof openPaymentModal === "function") {
        openPaymentModal(false);
      }
    };
  }

  if (btnPaymentEdit) {
    btnPaymentEdit.onclick = async () => {
      const id =
        typeof getSelectedMainRowId === "function"
          ? getSelectedMainRowId()
          : null;
      if (!id) {
        showToast(needSelectEdit, { tone: "error" });
        return;
      }
      const txList = await getAllLedgerTx();
      const tx = txList.find((t) => String(t.id) === String(id));
      if (!tx) {
        showToast(notFoundTx, { tone: "error" });
        return;
      }
      if (tx.kind === "이체") {
        await warningDialog(transferEditBlocked, { title: "수정 불가" });
        return;
      }
      if (typeof setEditId === "function") setEditId(String(tx.id));

      await primePaymentEntrySelectData();
      populatePaymentLedgerSelectOptions({ keepValue: false });
      populatePaymentCounterpartySelectOptions(
        tx.flow || getSelectedPaymentFlow(),
        {
          keepValue: false,
        },
      );
      setPaymentFormFromTx(tx);
      openPaymentModal(true);
    };
  }

  if (btnPaymentDelete) {
    btnPaymentDelete.onclick = async () => {
      const id =
        typeof getSelectedMainRowId === "function"
          ? getSelectedMainRowId()
          : null;
      if (!id) {
        showToast(needSelectDelete, { tone: "error" });
        return;
      }

      const ledgerAll = await getAllLedgerTx();
      const selectedTx = ledgerAll.find((t) => String(t.id) === String(id));
      if (!selectedTx) {
        showToast(notFoundTx, { tone: "error" });
        return;
      }

      if (selectedTx.kind === "이체") {
        const isOrigin =
          selectedTx.isOrigin === true || selectedTx.flow === "out";
        if (!isOrigin) {
          await warningDialog(transferDeleteBlocked, { title: "삭제 불가" });
          return;
        }
      }

      let linked = [];
      try {
        const txList = await getTransactions();
        linked = txList.filter(
          (t) => t.ledgerTxId && String(t.ledgerTxId) === String(id),
        );
      } catch (e) {
        console.error("연결된 전표 조회 중 오류:", e);
      }

      const hasForeignLinked = linked.some(
        (row) => !isPaymentLinkedTransaction(row),
      );
      if (hasForeignLinked) {
        await warningDialog(foreignLinkedBlocked, { title: "삭제 불가" });
        return;
      }

      const ok = await confirmDialog(confirmDelete, {
        title: "삭제 확인",
        okText: "삭제",
        cancelText: "취소",
        tone: "danger",
      });
      if (!ok) return;

      if (selectedTx.kind === "이체" && selectedTx.groupId) {
        const groupId = selectedTx.groupId;
        const toDelete = ledgerAll.filter(
          (t) => t.groupId && String(t.groupId) === String(groupId),
        );
        for (const row of toDelete) {
          await deleteLedgerTxById(row.id);
        }
      } else {
        await deleteLedgerTxById(id);
      }

      try {
        for (const row of linked) {
          if (isPaymentLinkedTransaction(row)) {
            await deleteTransaction(row.id);
          }
        }
      } catch (e) {
        console.error("연결된 전표 삭제 중 오류:", e);
      }

      await render();
      await refreshCashflowSummary();
    };
  }

  if (btnPaymentImport) {
    btnPaymentImport.onclick = async () => {
      if (typeof loadImportVendorPrefs === "function") loadImportVendorPrefs();
      if (paymentImportTextarea) paymentImportTextarea.value = "";
      if (paymentImportResultBody) paymentImportResultBody.innerHTML = "";
      if (paymentImportCountSpan) paymentImportCountSpan.textContent = "0";
      if (paymentImportStatus) paymentImportStatus.textContent = "";

      updatePaymentImportSelectedAccountLabel();
      openPaymentImportModal();

      const selectedTypeCode = String(
        (typeof getSelectedCashflowTypeForEntry === "function"
          ? getSelectedCashflowTypeForEntry()
          : "") ||
          "",
      ).trim();
      const selectedItemCode = String(
        (typeof getSelectedCashflowItemForEntry === "function"
          ? getSelectedCashflowItemForEntry()
          : "") ||
          "",
      ).trim();

      const hasAccount = !!selectedTypeCode;
      const hasLedgerItem = !!selectedItemCode;

      // 인식하기(①)는 계정(구분) 선택만으로도 가능하도록 유지
      if (btnPaymentImportParse) btnPaymentImportParse.disabled = !hasAccount;
      // 저장(②)은 출금 장부(항목) 선택이 필수
      if (btnPaymentImportSave) btnPaymentImportSave.disabled = !hasLedgerItem;

      if (!hasAccount) {
        if (paymentImportStatus) paymentImportStatus.textContent = importNeedAccount;
        return;
      }
      if (!hasLedgerItem) {
        if (paymentImportStatus) paymentImportStatus.textContent = importNeedLedgerItem;
        // 계정은 선택된 상태이므로 거래처 피커 로딩은 진행해도 무방하지만,
        // UX상 사용자가 장부부터 선택하도록 여기서 종료한다.
        return;
      }

      await ensureCustomersForPickerLoaded();
    };
  }
}

