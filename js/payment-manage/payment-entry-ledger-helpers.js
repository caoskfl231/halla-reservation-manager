export function updatePaymentLedgerTitleByFlow(options = {}) {
  const {
    getSelectedPaymentFlow,
    paymentLedgerTitle,
    paymentLedgerNameLabel,
    paymentCounterpartyTitle,
  } = options;
  const flow =
    typeof getSelectedPaymentFlow === "function"
      ? getSelectedPaymentFlow()
      : "in";
  if (paymentLedgerTitle) {
    paymentLedgerTitle.textContent = flow === "transfer" ? "출금장부" : "장부";
  }
  if (paymentLedgerNameLabel) {
    paymentLedgerNameLabel.textContent =
      flow === "transfer" ? "출금장부" : "장부명";
  }
  if (paymentCounterpartyTitle) {
    paymentCounterpartyTitle.textContent =
      flow === "transfer" ? "입금장부(코드)" : "거래처(코드)";
  }
}

export function updateLedgerRowsByFlow() {
  // 현재 UI에서는 별도 행 숨김 없이 레이블만 변경하므로 noop
}

export function syncLedgerCodeFromSelect(options = {}) {
  const {
    paymentLedgerSelect,
    getSelectedPaymentFlow,
    cashflowTypes,
    cashflowItems,
    paymentLedgerTypeCodeInput,
    paymentLedgerNameInput,
    paymentLedgerCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    setSelectedCashflowTypeForEntry,
    setSelectedCashflowItemForEntry,
  } = options;

  if (!paymentLedgerSelect) return;
  const selectedValue = String(paymentLedgerSelect.value || "");

  // 빈값("선택")으로 바뀐 경우: 입력값만 초기화하고,
  // 장부구분(타입) 선택 상태는 여기서 건드리지 않는다.
  // (장부구분 클릭 시 하단 장부목록 필터가 풀리는 문제 방지)
  if (!selectedValue.trim()) {
    if (paymentLedgerTypeCodeInput) paymentLedgerTypeCodeInput.value = "";
    if (paymentLedgerNameInput) paymentLedgerNameInput.value = "";
    if (paymentLedgerCodeInput) paymentLedgerCodeInput.value = "";
    if (paymentCashflowItemNameInput) paymentCashflowItemNameInput.value = "";
    if (paymentCashflowItemCodeInput) paymentCashflowItemCodeInput.value = "";
    if (typeof setSelectedCashflowItemForEntry === "function") {
      setSelectedCashflowItemForEntry("");
    }
    return;
  }

  const item = (cashflowItems || []).find(
    (it) => String(it.code || "") === selectedValue,
  );
  const itemName = item ? String(item.name || "") : "";
  const typeCode = item ? String(item.typeCode || "") : "";

  if (paymentLedgerTypeCodeInput) paymentLedgerTypeCodeInput.value = typeCode;
  if (paymentLedgerNameInput) paymentLedgerNameInput.value = itemName;
  if (paymentLedgerCodeInput) paymentLedgerCodeInput.value = selectedValue;
  if (paymentCashflowItemNameInput)
    paymentCashflowItemNameInput.value = itemName;
  if (paymentCashflowItemCodeInput)
    paymentCashflowItemCodeInput.value = selectedValue;

  if (typeof setSelectedCashflowTypeForEntry === "function") {
    setSelectedCashflowTypeForEntry(typeCode);
  }
  if (typeof setSelectedCashflowItemForEntry === "function") {
    setSelectedCashflowItemForEntry(selectedValue);
  }
}

export function populatePaymentLedgerSelectOptions(options = {}) {
  const {
    paymentLedgerSelect,
    cashflowTypes,
    cashflowItems,
    getSelectedPaymentFlow,
    syncLedgerCodeFromSelect,
    keepValue = false,
  } = options;

  if (!paymentLedgerSelect) return;
  const prev = keepValue ? String(paymentLedgerSelect.value || "") : "";

  const list = Array.isArray(cashflowItems) ? cashflowItems : [];
  paymentLedgerSelect.innerHTML =
    '<option value="">선택</option>' +
    list
      .map((it) => {
        const code = String(it.code || "");
        const name = String(it.name || "").trim();
        const label = name || code;
        return `<option value="${code}">${label}</option>`;
      })
      .join("");
  if (prev && list.some((it) => String(it.code || "") === prev)) {
    paymentLedgerSelect.value = prev;
  }

  if (typeof syncLedgerCodeFromSelect === "function") {
    syncLedgerCodeFromSelect();
  }
}

export function populatePaymentCounterpartySelectOptions(options = {}) {
  const {
    flow,
    cashflowTypes,
    cashflowItems,
    customers,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemCodeInput,
    selectEl,
    codeInput,
    keepValue = false,
  } = options;

  if (!selectEl) return;
  const prev = keepValue ? String(selectEl.value || "") : "";
  const isTransfer = String(flow || "") === "transfer";

  if (isTransfer) {
    // 이체: 상대(입금) 장부도 장부목록(item)에서 선택
    const fromItemCode = String(
      paymentCashflowItemCodeInput
        ? paymentCashflowItemCodeInput.value || ""
        : "",
    ).trim();
    const list = (Array.isArray(cashflowItems) ? cashflowItems : []).filter(
      (it) => String(it.code || "").trim() !== fromItemCode,
    );
    selectEl.innerHTML =
      '<option value="">선택</option>' +
      list
        .map((it) => {
          const code = String(it.code || "");
          const name = String(it.name || "").trim();
          const label = name || code;
          return `<option value="${code}">${label}</option>`;
        })
        .join("");

    if (prev && list.some((it) => String(it.code || "") === prev)) {
      selectEl.value = prev;
    }
  } else {
    const list = Array.isArray(customers) ? customers : [];
    selectEl.innerHTML =
      '<option value="">선택</option>' +
      list
        .map((c) => {
          const id = String(c.id || "");
          const name = String(c.name || "").trim();
          const label = name || id;
          return `<option value="${id}">${label}</option>`;
        })
        .join("");

    if (prev && list.some((c) => String(c.id || "") === prev)) {
      selectEl.value = prev;
    }
  }

  if (codeInput) {
    codeInput.value = String(selectEl.value || "");
    codeInput.readOnly = true;
  }
}

export function syncCounterpartyCodeFromSelect(options = {}) {
  const { selectEl, codeInput } = options;
  if (!selectEl || !codeInput) return;
  codeInput.value = String(selectEl.value || "");
}
