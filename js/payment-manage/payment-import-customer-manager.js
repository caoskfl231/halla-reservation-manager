export function bindPaymentImportCustomerPicker(options = {}) {
  const {
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
    getCustomerPickerMode,
    setCustomerPickerMode,
    applyImportCustomerSelection,
    getEntryItemTargetInput,
    setEntryItemTargetInput,
    importCustomers,
    getImportCustomers,
    ensureSelectHasOption,
    updatePaymentSupplierBalance,
    setImportCustomerFilterType,
    setImportCustomerFilterGroup,
  } = options;

  const resolvedBtnClose =
    btnPaymentImportCustomerClose ||
    document.getElementById("btn-payment-import-customer-close");
  const resolvedBtnReset =
    btnPaymentImportCustomerReset ||
    document.getElementById("btn-payment-import-customer-reset");
  const resolvedSearch =
    paymentImportCustomerSearch ||
    document.getElementById("payment-import-customer-search");
  const resolvedCustomerListBody =
    paymentImportCustomerListBody ||
    document.getElementById("payment-import-customer-list");
  const resolvedTypeListBody =
    paymentImportTypeListBody ||
    document.getElementById("payment-import-type-list");
  const resolvedGroupListBody =
    paymentImportGroupListBody ||
    document.getElementById("payment-import-group-list");

  if (resolvedBtnClose) {
    resolvedBtnClose.onclick = () => {
      closePaymentImportCustomerModal();
      updatePaymentImportCurrentRecord(null);
    };
  }

  if (resolvedBtnReset) {
    resolvedBtnReset.onclick = () => {
      setImportCustomerFilterType("");
      setImportCustomerFilterGroup("");
      if (resolvedSearch) {
        resolvedSearch.value = "";
      }
      renderPaymentImportTypeList();
      renderPaymentImportGroupList();
      renderPaymentImportCustomerList();
    };
  }

  if (resolvedSearch) {
    resolvedSearch.oninput = () => {
      renderPaymentImportCustomerList();
    };
  }

  if (resolvedCustomerListBody) {
    resolvedCustomerListBody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const id = tr.dataset.id || "";

      const customers =
        typeof getImportCustomers === "function"
          ? getImportCustomers()
          : importCustomers;
      // 거래 인식 모드: 기존 로직 유지
      if (getCustomerPickerMode() === "import") {
        applyImportCustomerSelection(id);
        return;
      }

      // 거래 입력 모달(entry): 거래처 select/value/code 갱신
      const targetSelect =
          getEntryItemTargetInput() || document.getElementById("payment-entry-counterparty");
      const cust = (customers || []).find(
        (c) => String(c.id) === String(id),
      );
      if (targetSelect && cust) {
        ensureSelectHasOption(
          targetSelect,
          cust.id || "",
          cust.name || cust.id || "",
        );
        targetSelect.value = String(cust.id || "");
          const codeInput = document.getElementById("payment-entry-counterparty-code");
        if (codeInput) codeInput.value = String(cust.id || "");

        // mousedown에서 네이티브 드롭다운을 막고 있으므로,
        // 선택 결과를 확실히 반영하기 위해 change 이벤트를 수동으로 발생시킨다.
        try {
          targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
          // ignore
        }
        try {
          updatePaymentSupplierBalance();
        } catch (e) {
          // 잔액 표시 실패는 무시
        }
      }
      closePaymentImportCustomerModal();
      updatePaymentImportCurrentRecord(null);
      setCustomerPickerMode("import");
      setEntryItemTargetInput(null);
    });
  }

  if (resolvedTypeListBody) {
    resolvedTypeListBody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-type]");
      if (!tr) return;
      setImportCustomerFilterType(tr.dataset.type || "");
      // 구분을 바꾸면 분류 선택은 초기화
      setImportCustomerFilterGroup("");
      renderPaymentImportTypeList();
      renderPaymentImportGroupList();
      renderPaymentImportCustomerList();
    });
  }

  if (resolvedGroupListBody) {
    resolvedGroupListBody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-group]");
      if (!tr) return;
      setImportCustomerFilterGroup(tr.dataset.group || "");
      renderPaymentImportGroupList();
      renderPaymentImportCustomerList();
    });
  }
}
