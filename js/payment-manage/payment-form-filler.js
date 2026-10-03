export function setPaymentFormFromTx(options = {}) {
  const {
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
    allCustomers,
  } = options;

  if (!tx) return;

  // 구분(입금/출금/이체)
  if (paymentFlowRadios && paymentFlowRadios.length) {
    paymentFlowRadios.forEach((r) => {
      r.checked = r.value === (tx.flow || "in");
    });
  }

  // 거래일자
  const headerDateInput = document.getElementById("payment-entry-date");
  if (headerDateInput) headerDateInput.value = tx.date || "";
  updatePaymentDateWeekday();

  // 장부구분 코드(입출금 구분)는 hidden에 저장
  const ledgerTypeCodeInput = document.getElementById(
    "payment-ledger-type-code",
  );
  if (ledgerTypeCodeInput) ledgerTypeCodeInput.value = tx.accountId || "";

  // 상단 장부 셀렉트/잔액 표시를 통일된 헬퍼로 세팅
  try {
    // 편집 시에는 tx.cashflowCode(분류항목 코드)가 있으면 함께 반영
    const flow = tx.flow || getSelectedPaymentFlow();
    const rawItemCode = String(tx.cashflowCode || "").trim();
    const itemCode =
      flow !== "transfer" &&
      rawItemCode &&
      rawItemCode !== String(tx.accountId || "").trim()
        ? rawItemCode
        : "";

    let itemName = "";
    if (itemCode && Array.isArray(cashflowItems) && cashflowItems.length) {
      const found = cashflowItems.find(
        (it) => String(it.code || "") === String(itemCode),
      );
      if (found) itemName = String(found.name || "").trim();
    }

    applyPaymentLedgerSelection(
      tx.accountId || "",
      tx.accountName || "",
      0,
      itemCode,
      itemName,
    );
  } catch (e) {
    // 편집 시 장부 선택이 꼭 필요하므로, 오류가 나더라도 앱이 죽지 않게만 처리
    console.warn("편집 모달 장부 세팅 중 오류:", e);
  }

  // 현재잔액(수정 시에는 그대로)
  const ledgerBalanceInput = document.getElementById("payment-ledger-balance");
  if (ledgerBalanceInput) ledgerBalanceInput.value = "";

  // 거래처(출금/입금 상대)
  const itemInput = document.getElementById("payment-entry-counterparty");
  if (itemInput) {
    const flow = tx.flow || "in";
    try {
      populatePaymentCounterpartySelectOptions(flow, { keepValue: false });
    } catch (e) {}

    if (flow === "transfer") {
      const toCode = String(tx.accountId || "");
      const toType = (cashflowTypes || []).find(
        (t) => String(t.code || "") === toCode,
      );
      ensureSelectHasOption(
        itemInput,
        toCode,
        toType ? `${toCode} ${toType.name || ""}`.trim() : toCode,
      );
      itemInput.value = toCode;
    } else {
      const vendorName = String(tx.vendor || "").trim();
      const customers = Array.isArray(allCustomers) ? allCustomers : [];
      const matched = customers.find(
        (c) => String(c.name || "").trim() === vendorName,
      );
      if (matched) {
        itemInput.value = String(matched.id || "");
      } else {
        const pseudoId = vendorName ? `__name__:${vendorName}` : "";
        if (pseudoId) {
          ensureSelectHasOption(itemInput, pseudoId, vendorName);
          itemInput.value = pseudoId;
        } else {
          itemInput.value = "";
        }
      }
    }
  }

  const itemCodeInput = document.getElementById(
    "payment-entry-counterparty-code",
  );
  if (itemCodeInput)
    itemCodeInput.value = itemInput
      ? String(itemInput.value || "")
      : tx.supplierId || tx.customerId || "";

  const amountInput = document.getElementById("payment-entry-amount");
  if (amountInput) amountInput.value = tx.amount ? formatMoney(tx.amount) : "";

  try {
    updatePaymentSupplierBalance();
  } catch (e) {
    // 잔액 표시 실패는 치명적이지 않으므로 무시
  }
}
