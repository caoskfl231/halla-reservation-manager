import { warningDialog } from "../common/dialogs.js?v=app-20261010-18";

export function applyPaymentLedgerSelection(options = {}) {
  const {
    code,
    name,
    balance,
    cashflowItemCode,
    cashflowItemName,
    fmt,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex,
    setCurrentImportLedgerIndex,
    importRecords,
    renderPaymentImportTable,
    getTransferFromLedgerInput,
    getTransferToLedgerInput,
    setTransferFromLedgerInput,
    setTransferToLedgerInput,
    setSelectedCashflowTypeForEntry,
    setSelectedCashflowCurrentBalance,
    setSelectedCashflowItemForEntry,
    paymentLedgerTypeCodeInput,
    paymentLedgerBalanceInput,
    paymentLedgerSelect,
    paymentLedgerNameInput,
    paymentLedgerCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    ensureSelectHasOption,
    closePaymentLedgerModal,
    setEntryCounterpartyLedgerCode,
    setEntryCounterpartyLedgerLabel,
  } = options;

  let labelName = (name || code || "").trim();
  const codeStr = String(code || "").trim();
  // 이름이 이미 "코드 이름" 형태(A01 법인통장)로 들어온 경우 코드 중복 제거
  if (codeStr && labelName.startsWith(codeStr + " ")) {
    labelName = labelName.slice(codeStr.length + 1);
  }
  const label = codeStr ? `${codeStr} ${labelName}`.trim() : labelName;

  // 공통 모달(ledger-picker)에서 선택된 장부명/코드
  // - 화면 표시/입력칸에는 장부명만(코드는 별도 칸)
  // - 저장 로직에서 필요한 장부구분 코드는 별도 hidden/전역 상태에 유지
  const itemCodeRaw = String(cashflowItemCode || "").trim();
  const itemNameRaw = String(cashflowItemName || "").trim();

  const flow = getSelectedPaymentFlow();
  const currentImportLedgerIndex = getCurrentImportLedgerIndex();
  const transferFromLedgerInput = getTransferFromLedgerInput();
  const transferToLedgerInput = getTransferToLedgerInput();
  const isTransferTarget = Boolean(
    currentImportLedgerIndex != null ||
    transferFromLedgerInput ||
    transferToLedgerInput ||
    flow === "transfer",
  );
  const itemCodeStr = String(cashflowItemCode || "").trim();
  const itemNameStr = String(cashflowItemName || "").trim();
  const displayItemName = itemNameStr;

  // 거래 인식 모달의 이체 모드에서, 행별 장부 선택에 사용
  if (currentImportLedgerIndex != null) {
    const rec = importRecords[currentImportLedgerIndex];
    if (rec) {
      // 이체 인식행: 상대 장부도 장부목록(itemCode) 기반으로 통일
      // - transferLedgerCode: itemCode (예: A0001)
      // - transferLedgerTypeCode: typeCode (예: A01) (저장/표시 보조)
      rec.transferLedgerCode = itemCodeRaw;
      rec.transferLedgerTypeCode = codeStr;
      rec.transferLedgerItemCode = itemCodeRaw;
      rec.transferLedgerItemName = itemNameRaw;
      rec.transferLedgerLabel = itemNameRaw || labelName || label;
    }
    setCurrentImportLedgerIndex(null);
    renderPaymentImportTable();
    closePaymentLedgerModal();
    return;
  }

  // 위의 분기에서 return 되지 않았다면, 상단/일반 장부 선택에 사용되는 경우이므로
  // 현재 선택된 장부 코드와 잔액을 전역 상태에도 반영한다.
  setSelectedCashflowTypeForEntry(codeStr || "");
  setSelectedCashflowCurrentBalance(Number(balance) || 0);
  setSelectedCashflowItemForEntry(itemCodeStr);

  const applyToTopLedger = () => {
    // 장부구분 코드(좌측)는 별도 hidden에 저장
    if (paymentLedgerTypeCodeInput) paymentLedgerTypeCodeInput.value = codeStr;
    if (paymentLedgerBalanceInput)
      paymentLedgerBalanceInput.value = fmt(balance || 0);

    // 이체 포함: 장부 선택은 항상 itemCode 기반
    if (paymentLedgerSelect) {
      ensureSelectHasOption(
        paymentLedgerSelect,
        itemCodeStr,
        displayItemName || itemCodeStr,
      );
      paymentLedgerSelect.value = itemCodeStr;
    }
    if (paymentLedgerNameInput)
      paymentLedgerNameInput.value = displayItemName || "";
    if (paymentLedgerCodeInput)
      paymentLedgerCodeInput.value = itemCodeStr || "";
    if (paymentCashflowItemNameInput)
      paymentCashflowItemNameInput.value = displayItemName || "";
    if (paymentCashflowItemCodeInput)
      paymentCashflowItemCodeInput.value = itemCodeStr || "";
  };

  // 이체 - 출금 장부 선택
  if (transferFromLedgerInput) {
    applyToTopLedger();
    setTransferFromLedgerInput(null);
    setTransferToLedgerInput(null);
    closePaymentLedgerModal();
    return;
  }

  // 이체 - 입금 장부 선택 (아래 항목 입력란)
  if (transferToLedgerInput) {
    // 아래 입력란/출금처 쪽에 장부를 채우는 경우
    // - 표시 버튼을 사용하는 경우: 버튼 텍스트와 코드 칸, hidden 값까지 모두 갱신
    // - 일반 input 인 경우: value 에 라벨만 채운다.
    // 출금처/입금장부 표시 규칙:
    // - 장부명 칸: 장부명만
    // - 코드 칸: 장부명 코드(없으면 장부구분 코드)
    // - 저장 로직용 장부구분 코드는 entryCounterpartyLedgerCode에 별도로 보관
    const displayName = itemNameRaw || labelName || "";
    const displayCode = itemCodeRaw || codeStr;

    if (transferToLedgerInput.tagName === "BUTTON") {
      transferToLedgerInput.textContent = displayName || "선택";
    } else if (transferToLedgerInput.tagName === "SELECT") {
      ensureSelectHasOption(
        transferToLedgerInput,
        displayCode,
        displayName || displayCode,
      );
      transferToLedgerInput.value = displayCode;
    } else {
      transferToLedgerInput.value = displayName || label;
    }

    // 출금처 행의 코드/hidden 값도 함께 채운다.
    const entryCodeInput = document.getElementById("payment-entry-counterparty-code");
    if (entryCodeInput) entryCodeInput.value = displayCode;
    const entryHidden = document.getElementById("payment-entry-counterparty");
    if (entryHidden) {
      if (entryHidden.tagName === "SELECT") {
        ensureSelectHasOption(
          entryHidden,
          displayCode,
          displayName || displayCode,
        );
        entryHidden.value = displayCode;
      } else {
        entryHidden.value = displayName || label;
      }
    }

    // 출금처 장부구분 코드/라벨을 따로 기억해 두었다가,
    // '입금+출금처(장부) 이체' 저장 로직에서 사용한다.
    setEntryCounterpartyLedgerCode(codeStr);
    setEntryCounterpartyLedgerLabel(displayName || label);
    setTransferFromLedgerInput(null);
    setTransferToLedgerInput(null);
    closePaymentLedgerModal();
    return;
  }

  // 일반 입금/출금: 상단 장부만 갱신
  applyToTopLedger();
  closePaymentLedgerModal();
}

export async function openPaymentLedgerModalForLedgerSelect(options = {}) {
  const {
    openLedgerPicker,
    getSelectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemCodeInput,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex,
    setCurrentImportLedgerIndex,
    getTransferFromLedgerInput,
    getTransferToLedgerInput,
    setTransferFromLedgerInput,
    setTransferToLedgerInput,
    applyPaymentLedgerSelection,
  } = options;

  // 공통 장부 선택 모달로 전환
  const initialTypeCode = String(
    getSelectedCashflowTypeForEntry() ||
      (paymentLedgerTypeCodeInput ? paymentLedgerTypeCodeInput.value : "") ||
      "",
  ).trim();

  const initialItemCode = String(
    getSelectedCashflowItemForEntry() ||
      (paymentCashflowItemCodeInput
        ? paymentCashflowItemCodeInput.value
        : "") ||
      "",
  ).trim();

  const picked = await openLedgerPicker({
    title: "장부 선택",
    initialTypeCode,
    initialItemCode,
    showAllItemsInitially: true,
  });

  if (!picked) {
    // 사용자가 장부 선택을 취소한 경우에도
    // (특히 인식 결과의 이체 행 선택 타깃) 상태가 남아 다음 선택에 영향을 주지 않게 정리한다.
    if (typeof setCurrentImportLedgerIndex === "function") {
      setCurrentImportLedgerIndex(null);
    }
    if (typeof setTransferFromLedgerInput === "function") {
      setTransferFromLedgerInput(null);
    }
    if (typeof setTransferToLedgerInput === "function") {
      setTransferToLedgerInput(null);
    }
    return;
  }

  const typeCode = String(picked.typeCode || "").trim();
  const typeName = String(picked.typeName || "").trim();

  const flow = getSelectedPaymentFlow();
  const isTransferTarget = Boolean(
    getCurrentImportLedgerIndex() != null ||
    getTransferFromLedgerInput() ||
    getTransferToLedgerInput() ||
    flow === "transfer",
  );

  // 일반 입금/출금은 장부명(항목) 선택 필수
  let itemCode = String(picked.itemCode || "").trim();
  let itemName = String(picked.itemName || "").trim();

  // 요구사항: 이체 포함 항상 장부명(항목) 선택 필수
  if (!itemCode) {
    await warningDialog("장부구분이 아니라 장부명(예: A0001)을 선택해 주세요.");
    return;
  }

  // applyPaymentLedgerSelection(code, name, balance, cashflowItemCode, cashflowItemName)
  applyPaymentLedgerSelection({
    code: typeCode,
    name: typeName,
    balance: 0,
    cashflowItemCode: itemCode,
    cashflowItemName: itemName,
  });
}

