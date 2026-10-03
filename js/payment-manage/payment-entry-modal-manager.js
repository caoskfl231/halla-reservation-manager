export function resetPaymentEntryFields(options = {}) {
  const {
    paymentEntryDisplayButton,
    paymentCashflowItemNameInput,
    paymentCashflowItemCodeInput,
    setEntryCounterpartyLedgerCode,
    setEntryCounterpartyLedgerLabel,
    setSelectedCashflowItemForEntry,
  } = options;

  const itemInput = document.getElementById("payment-entry-counterparty");
  const itemCodeInput = document.getElementById("payment-entry-counterparty-code");
  const amountInput = document.getElementById("payment-entry-amount");
  const memoInput = document.getElementById("payment-entry-memo");
  const balanceInput = document.getElementById("payment-supplier-balance");

  if (itemInput) itemInput.value = "";
  if (paymentEntryDisplayButton) paymentEntryDisplayButton.textContent = "선택";
  if (itemCodeInput) itemCodeInput.value = "";
  if (amountInput) amountInput.value = "0";
  if (memoInput) memoInput.value = "";
  if (balanceInput) balanceInput.value = "";

  // 출금처 장부 선택 상태도 함께 초기화한다.
  if (typeof setEntryCounterpartyLedgerCode === "function")
    setEntryCounterpartyLedgerCode("");
  if (typeof setEntryCounterpartyLedgerLabel === "function")
    setEntryCounterpartyLedgerLabel("");

  // 분류항목도 초기화
  if (typeof setSelectedCashflowItemForEntry === "function")
    setSelectedCashflowItemForEntry("");
  if (paymentCashflowItemNameInput) paymentCashflowItemNameInput.value = "";
  if (paymentCashflowItemCodeInput) paymentCashflowItemCodeInput.value = "";
}

export function openPaymentEntryChoiceModal(options = {}) {
  const {
    paymentEntryChoiceModal,
    triggerEl,
    openModalOverlay,
    registerModalEscClose,
    closePaymentEntryChoiceModal,
    getPaymentEntryChoiceEscOff,
    setPaymentEntryChoiceEscOff,
  } = options;

  if (!paymentEntryChoiceModal) return;
  openModalOverlay(paymentEntryChoiceModal);

  // 클릭한 위치(트리거) 근처에 딱 붙도록 직접 위치를 계산한다.
  if (triggerEl) {
    const dialog = paymentEntryChoiceModal.querySelector(".modal-dialog");
    if (dialog) {
      const rect = triggerEl.getBoundingClientRect();
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      const vh =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const padding = 8;
      const offsetY = 2; // 트리거와 모달 사이 아주 작은 간격

      // 팝업형 고정 위치로 설정하고, 먼저 화면 안에서 보이도록 임시 배치 후 크기를 측정한다.
      dialog.style.position = "fixed";
      dialog.style.marginTop = "0";
      dialog.style.marginLeft = "0";
      dialog.style.left = padding + "px";
      dialog.style.top = padding + "px";

      const width = dialog.offsetWidth || 200;
      const height = dialog.offsetHeight || 60;

      // 가로는 트리거 좌측 기준으로 시작하고, 화면 밖으로 나가지 않게 보정
      let left = rect.left;
      if (left + width + padding > vw) {
        left = Math.max(padding, vw - width - padding);
      }
      if (left < padding) left = padding;

      // 세로는 "그 자리"에 가깝게: 트리거 상단에 맞춰 뜨게 한다.
      // 화면 밖으로 나가면 아래/위로만 최소 보정한다.
      let top = rect.top;
      if (top + height + padding > vh) {
        // 아래가 넘치면, 트리거의 하단에 맞춰 위로 올린다.
        top = rect.bottom - height;
      }
      // 그래도 위로 넘치면, 트리거 바로 아래로 내린다.
      if (top < padding) {
        top = rect.bottom + offsetY;
      }
      // 마지막 안전 보정
      if (top + height + padding > vh)
        top = Math.max(padding, vh - height - padding);
      if (top < padding) top = padding;

      dialog.style.left = `${left}px`;
      dialog.style.top = `${top}px`;
    }
  }

  const escOff =
    typeof getPaymentEntryChoiceEscOff === "function"
      ? getPaymentEntryChoiceEscOff()
      : null;
  if (typeof escOff === "function") escOff();
  if (typeof setPaymentEntryChoiceEscOff === "function") {
    setPaymentEntryChoiceEscOff(
      registerModalEscClose(
        paymentEntryChoiceModal,
        closePaymentEntryChoiceModal,
      ),
    );
  }
}

export function closePaymentEntryChoiceModal(options = {}) {
  const {
    paymentEntryChoiceModal,
    closeModalOverlay,
    getPaymentEntryChoiceEscOff,
    setPaymentEntryChoiceEscOff,
  } = options;

  if (!paymentEntryChoiceModal) return;
  closeModalOverlay(paymentEntryChoiceModal);

  const escOff =
    typeof getPaymentEntryChoiceEscOff === "function"
      ? getPaymentEntryChoiceEscOff()
      : null;
  if (typeof escOff === "function") {
    escOff();
    if (typeof setPaymentEntryChoiceEscOff === "function") {
      setPaymentEntryChoiceEscOff(null);
    }
  }
}
