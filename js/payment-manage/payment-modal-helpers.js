export function openPaymentModal(options = {}) {
  const {
    paymentModal,
    paymentModalTitle,
    paymentModalManager,
    resetPaymentEntryFields,
    syncPaymentEntryDateTime,
    isEdit = false,
  } = options;

  if (!paymentModal) return;

  if (paymentModalTitle) {
    paymentModalTitle.textContent = isEdit ? "거래 수정" : "거래 등록";
  }

  if (!isEdit && typeof resetPaymentEntryFields === "function") {
    resetPaymentEntryFields();
  }

  try {
    if (typeof syncPaymentEntryDateTime === "function") {
      syncPaymentEntryDateTime();
    }
  } catch (e) {
    // ignore
  }

  if (paymentModalManager && typeof paymentModalManager.open === "function") {
    paymentModalManager.open();
  }
}

export function closePaymentModal(options = {}) {
  const { paymentModalManager } = options;
  if (paymentModalManager && typeof paymentModalManager.close === "function") {
    paymentModalManager.close();
  }
}

export function openPaymentImportModal(options = {}) {
  const {
    paymentImportModal,
    paymentImportModalManager,
    paymentImportTextarea,
  } = options;

  if (!paymentImportModal) return;
  if (
    paymentImportModalManager &&
    typeof paymentImportModalManager.open === "function"
  ) {
    paymentImportModalManager.open();
  }
  try {
    paymentImportTextarea?.focus?.();
  } catch (e) {
    // ignore
  }
}

export function closePaymentImportModal(options = {}) {
  const { paymentImportModalManager } = options;
  if (
    paymentImportModalManager &&
    typeof paymentImportModalManager.close === "function"
  ) {
    paymentImportModalManager.close();
  }
}

export function openPaymentImportCustomerModal(options = {}) {
  const {
    paymentImportCustomerModal,
    paymentImportCustomerModalManager,
    paymentImportCustomerSearch,
  } = options;

  if (!paymentImportCustomerModal) return;
  if (
    paymentImportCustomerModalManager &&
    typeof paymentImportCustomerModalManager.open === "function"
  ) {
    paymentImportCustomerModalManager.open();
  }
  try {
    if (paymentImportCustomerSearch) paymentImportCustomerSearch.focus();
  } catch (e) {
    // ignore
  }
}

export function closePaymentImportCustomerModal(options = {}) {
  const { paymentImportCustomerModalManager } = options;
  if (
    paymentImportCustomerModalManager &&
    typeof paymentImportCustomerModalManager.close === "function"
  ) {
    paymentImportCustomerModalManager.close();
  }
}
