export function bindPaymentEntryPicker(options = {}) {
  const {
    btnPaymentEntryChooseCustomer,
    btnPaymentEntryChooseLedger,
    btnPaymentEntryChoiceClose,
    paymentEntryDisplayButton,
    btnPaymentLedgerPicker,
    headerDateInput,
    paymentLedgerSelect,
    entrySelect,
    paymentFlowRadios,
    paymentLedgerTypeCodeInput,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    cashflowTypes,
    closePaymentEntryChoiceModal,
    openPaymentEntryChoiceModal,
    openPaymentLedgerModalForLedgerSelect,
    ensureCustomersForPickerLoaded,
    updatePaymentImportCurrentRecord,
    renderPaymentImportTypeList,
    renderPaymentImportGroupList,
    renderPaymentImportCustomerList,
    openPaymentImportCustomerModal,
    updatePaymentDateWeekday,
    syncPaymentEntryDateTime,
    getSelectedPaymentFlow,
    primePaymentEntrySelectData,
    populatePaymentCounterpartySelectOptions,
    syncCounterpartyCodeFromSelect,
    updatePaymentLedgerTitleByFlow,
    updateLedgerRowsByFlow,
    syncLedgerCodeFromSelect,
    ensureSelectHasOption,
    setCustomerPickerMode,
    setEntryItemTargetInput,
    setTransferFromLedgerInput,
    setTransferToLedgerInput,
    setEntryCounterpartyLedgerCode,
    setEntryCounterpartyLedgerLabel,
    setImportCustomerFilterType,
    setImportCustomerFilterGroup,
    setSelectedCashflowItemForEntry,
  } = options;

  // 거래 입력용 선택 모달에서 "거래처 선택" / "장부 선택" 버튼 동작 정의
  if (btnPaymentEntryChooseCustomer) {
    btnPaymentEntryChooseCustomer.onclick = async () => {
      closePaymentEntryChoiceModal();
      // 거래처 선택 모달 오픈
      setCustomerPickerMode("entry");
      // 거래 입력 모달의 하단 거래처(select)를 명시적으로 타깃으로 지정
      // (선택 모달을 어떤 트리거로 열었든, 거래처 선택 결과가 항상 반영되게)
        setEntryItemTargetInput(document.getElementById("payment-entry-counterparty"));
      // 출금처를 장부가 아닌 일반 거래처로 사용할 것이므로
      // 기존에 선택된 출금처 장부 정보는 초기화한다.
      setEntryCounterpartyLedgerCode("");
      setEntryCounterpartyLedgerLabel("");
      await ensureCustomersForPickerLoaded();
      setImportCustomerFilterType("");
      setImportCustomerFilterGroup("");
      const search = document.getElementById("payment-import-customer-search");
      if (search) search.value = "";
      updatePaymentImportCurrentRecord(null);
      renderPaymentImportTypeList();
      renderPaymentImportGroupList();
      renderPaymentImportCustomerList();
      openPaymentImportCustomerModal();
    };
  }

  if (btnPaymentEntryChooseLedger) {
    btnPaymentEntryChooseLedger.onclick = async () => {
      closePaymentEntryChoiceModal();
      // 아래 출금처 입력칸을 "장부"로 사용하는 경우:
      // - 표시 버튼과 코드 칸, hidden 값까지 모두 장부 기준으로 채운다.
      setTransferToLedgerInput(
        document.getElementById("payment-entry-counterparty"),
      );
      setTransferFromLedgerInput(null);
      // 장부명을 hidden 출금처 필드에도 함께 저장할 수 있도록 타깃을 지정해 둔다.
      setEntryItemTargetInput(
        document.getElementById("payment-entry-counterparty"),
      );
      await openPaymentLedgerModalForLedgerSelect();
    };
  }

  if (btnPaymentEntryChoiceClose) {
    btnPaymentEntryChoiceClose.onclick = () => {
      closePaymentEntryChoiceModal();
    };
  }

  // 거래 입력 모달의 "..." 버튼을 눌렀을 때도 동일한 거래처 선택 모달을 사용해
  // 하단 거래처(출금처) 표시 버튼을 클릭하면
  // 거래처/장부 선택 모달을 띄워서 값을 채운다.
  if (paymentEntryDisplayButton) {
    paymentEntryDisplayButton.onclick = async () => {
      const flow = getSelectedPaymentFlow();

      // 이체: 아래 버튼은 "입금 장부" 선택용으로 장부 모달을 연다.
      if (flow === "transfer") {
        setTransferToLedgerInput(paymentEntryDisplayButton);
        setTransferFromLedgerInput(null);
        await openPaymentLedgerModalForLedgerSelect();
        return;
      }

      // 입금/출금: 새로운 선택 모달(거래처/장부)을 연다.
      setTransferFromLedgerInput(null);
      setTransferToLedgerInput(null);
      setEntryItemTargetInput(
        document.getElementById("payment-entry-counterparty"),
      );
      openPaymentEntryChoiceModal(paymentEntryDisplayButton);
    };
  }

  // 장부명 선택 버튼 클릭 시, 장부 선택 모달을 연다.
  if (btnPaymentLedgerPicker) {
    btnPaymentLedgerPicker.onclick = async () => {
      const flow = getSelectedPaymentFlow();

      // 이체: 위 버튼은 "출금 장부" 선택
      if (flow === "transfer") {
        setTransferFromLedgerInput(
          document.getElementById("payment-ledger-select"),
        );
        setTransferToLedgerInput(null);
        await openPaymentLedgerModalForLedgerSelect();
        return;
      }

      // 입금/출금: 기존 장부 선택 (출금/입금 공용)
      setTransferFromLedgerInput(null);
      setTransferToLedgerInput(null);
      setEntryItemTargetInput(null);
      await openPaymentLedgerModalForLedgerSelect();
    };
  }

  // 상단 거래일이 바뀌면 하단 "거래일시" 칸도 함께 맞춘다.
  if (headerDateInput) {
    headerDateInput.addEventListener("change", () => {
      syncPaymentEntryDateTime();
      updatePaymentDateWeekday();
    });
  }

  // 거래등록 모달: 장부/거래처 드롭다운 변경 시 코드 입력칸 동기화
  if (paymentLedgerSelect) {
    // 장부는 기존 UX처럼 "모달에서 선택"하도록 유지
    // - 네이티브 select 드롭다운은 열리지 않게 막고
    // - 클릭/키보드(Enter/Space) 시 장부 선택 모달을 연다.
    const openLedgerPicker = async () => {
      await primePaymentEntrySelectData();
      // 이체일 때 위 선택은 "출금 장부"로 취급
      const flow = getSelectedPaymentFlow();
      if (flow === "transfer") {
        setTransferFromLedgerInput(paymentLedgerSelect);
        setTransferToLedgerInput(null);
      } else {
        setTransferFromLedgerInput(null);
        setTransferToLedgerInput(null);
      }
      setEntryItemTargetInput(null);
      await openPaymentLedgerModalForLedgerSelect();
      try {
        paymentLedgerSelect.blur();
      } catch (e) {}
    };

    paymentLedgerSelect.addEventListener("mousedown", (e) => {
      // 기본 드롭다운 열기 방지
      e.preventDefault();
      openLedgerPicker();
    });

    paymentLedgerSelect.addEventListener("keydown", (e) => {
      const key = e.key || "";
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        openLedgerPicker();
      }
    });
  }

  if (entrySelect) {
    // 거래처도 기존 UX처럼 "모달에서 선택"하도록 유지
    // - 단, 이체 모드에서는 하단이 "입금 장부"이므로 장부 모달을 연다.
    const openEntryPicker = async () => {
      const flow = getSelectedPaymentFlow();

      if (flow === "transfer") {
        // 이체: 아래는 "입금 장부" 선택
        await primePaymentEntrySelectData();
        setTransferToLedgerInput(entrySelect);
        // 입금 장부 선택에서는 출금 타깃을 세팅하면 안 된다.
        // (applyPaymentLedgerSelection에서 transferFrom이 우선 처리되어 입금 선택이 무시될 수 있음)
        setTransferFromLedgerInput(null);
        setEntryItemTargetInput(null);
        await openPaymentLedgerModalForLedgerSelect();
        try {
          entrySelect.blur();
        } catch (e) {}
        return;
      }

      // 입금/출금: 예전처럼 "거래처 선택 / 장부 선택" 선택 모달을 먼저 연다.
      setEntryItemTargetInput(entrySelect);
      openPaymentEntryChoiceModal(entrySelect);
      try {
        entrySelect.blur();
      } catch (e) {}
    };

    // 거래처 칸은 예전 UX처럼 "거래처 선택 / 장부 선택" 2중선택을 유지한다.
    // (이체 모드에서는 openEntryPicker 내부에서 자동으로 장부 선택으로 분기)
    entrySelect.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openEntryPicker();
    });

    entrySelect.addEventListener("keydown", (e) => {
      const key = e.key || "";
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        openEntryPicker();
      }
    });

    entrySelect.addEventListener("change", () => {
      syncCounterpartyCodeFromSelect();
    });
  }

  // 구분 라디오 변경 시 장부 제목 변경
  if (paymentFlowRadios && paymentFlowRadios.length) {
    paymentFlowRadios.forEach((r) => {
      r.addEventListener("change", () => {
        updatePaymentLedgerTitleByFlow();
        updateLedgerRowsByFlow();
        const flow = r.value;
        const itemInput = document.getElementById("payment-entry-counterparty");
        const itemCodeInput = document.getElementById("payment-entry-counterparty-code");
        const itemLabelEl = document.querySelector(".item-label");

        if (flow === "transfer") {
          // 이체: 아래 입력란은 "입금 장부" 전용으로 사용, 직접 입력 불가
          setEntryItemTargetInput(null);
          setTransferFromLedgerInput(null);
          setTransferToLedgerInput(null);

          // 이체에서도 출금 장부(장부목록 item)는 필요하므로,
          // 기존 선택(입금/출금에서 선택된 장부)을 유지한다.
          if (itemInput) {
            itemInput.value = "";
          }
          if (itemCodeInput) {
            itemCodeInput.value = "";
          }
          if (itemLabelEl) itemLabelEl.textContent = "입금장부";
        } else {
          // 입금/출금: 일반 "거래처" 모드
          setTransferFromLedgerInput(null);
          setTransferToLedgerInput(null);
          if (itemCodeInput) {
            // 거래처 모드에서는 코드 입력칸은 읽기 전용 유지
            itemCodeInput.readOnly = true;
          }
          if (itemLabelEl) itemLabelEl.textContent = "거래처";
        }

        // 장부명/코드 표시 규칙도 구분에 맞게 맞춘다.
        try {
          if (paymentLedgerSelect) {
            if (flow === "transfer") {
              // 이체의 상단(출금장부) 선택은 항상 장부목록(itemCode) 기반으로 유지한다.
              const fromItemCode = String(
                paymentCashflowItemCodeInput
                  ? paymentCashflowItemCodeInput.value || ""
                  : "",
              ).trim();
              const fromItemName = String(
                paymentCashflowItemNameInput
                  ? paymentCashflowItemNameInput.value || ""
                  : "",
              ).trim();
              if (fromItemCode) {
                ensureSelectHasOption(
                  paymentLedgerSelect,
                  fromItemCode,
                  fromItemName || fromItemCode,
                );
                paymentLedgerSelect.value = fromItemCode;
              } else {
                paymentLedgerSelect.value = "";
              }
            } else {
              const iCode = String(
                paymentCashflowItemCodeInput
                  ? paymentCashflowItemCodeInput.value || ""
                  : "",
              ).trim();
              const iName = String(
                paymentCashflowItemNameInput
                  ? paymentCashflowItemNameInput.value || ""
                  : "",
              ).trim();
              if (iCode) {
                ensureSelectHasOption(
                  paymentLedgerSelect,
                  iCode,
                  iName || iCode,
                );
                paymentLedgerSelect.value = iCode;
              }
            }
          }
          syncLedgerCodeFromSelect();
        } catch (e) {
          // ignore
        }

        // 구분 변경에 따라 하단 드롭다운 옵션을 다시 구성
        try {
          populatePaymentCounterpartySelectOptions(flow, { keepValue: false });
          syncCounterpartyCodeFromSelect();
        } catch (e) {
          // ignore
        }
      });
    });
  }
}
