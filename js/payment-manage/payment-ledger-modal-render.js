import { bindClickRowSelect, bindDblClickRowConfirm } from "../common/ui-helpers.js?v=app-20261010-6";

export async function renderPaymentLedgerModalTable(options = {}) {
  const {
    paymentLedgerTypeListBody,
    paymentLedgerListBody,
    cashflowTypes,
    cashflowItems,
    rebuildCashflowSummaryOptions,
    getAllLedgerTx,
    setSelectedLedgerCodeInModal,
    setSelectedLedgerTypeCodeInModal,
    setSelectedLedgerItemCodeInModal,
    getSelectedLedgerTypeCodeInModal,
    getSelectedCashflowTypeForEntry,
    paymentLedgerTypeCodeInput,
    paymentLedgerSelect,
    getSelectedCashflowItemForEntry,
    paymentCashflowItemCodeInput,
    getLedgerModalShowAllItems,
    setLedgerModalShowAllItems,
    paymentLedgerItemListBody,
    renderPaymentLedgerModalItemTable,
    paymentLedgerTotalSpan,
  } = options;

  const typeBody = paymentLedgerTypeListBody || paymentLedgerListBody;
  if (!typeBody) return;

  // 구분 테이블: 클릭=선택(공통 위임)
  bindClickRowSelect(typeBody, {
    rowSelector: 'tr[data-code]',
    onSelect: (row) => {
      const code = String(row?.dataset?.code || '').trim();
      if (!code) return;

      setSelectedLedgerCodeInModal(code);
      setSelectedLedgerTypeCodeInModal(code);

      // 사용자가 구분을 클릭한 순간부터는 분류항목을 해당 구분으로 필터링한다.
      setLedgerModalShowAllItems(false);

      // 구분이 바뀌면 분류항목 리스트를 새로 렌더
      if (paymentLedgerItemListBody) {
        renderPaymentLedgerModalItemTable({
          items,
          preferItemCode,
          showAll: false,
        });
      }
    },
  });

  // 좌측 요약 박스와 동일한 데이터(cashflowTypes/items, tx)를 사용한다.
  if (!cashflowTypes.length || !cashflowItems.length) {
    await rebuildCashflowSummaryOptions();
  }

  const types = (cashflowTypes || []).slice();
  const items = cashflowItems || [];

  const openingByType = new Map();
  items.forEach((it) => {
    const typeCode = it.typeCode || "";
    if (!typeCode) return;
    const opening =
      Number(it.openingBalance != null ? it.openingBalance : 0) || 0;
    const prev = openingByType.get(typeCode) || 0;
    openingByType.set(typeCode, prev + opening);
  });

  const txAll = await getAllLedgerTx();
  const sumByType = new Map();
  txAll.forEach((tx) => {
    const typeCode = tx.accountId || "";
    if (!typeCode) return;
    const amount = Number(tx.amount) || 0;
    if (!(amount > 0)) return;
    const sign = tx.flow === "in" ? 1 : -1;
    const prev = sumByType.get(typeCode) || 0;
    sumByType.set(typeCode, prev + sign * amount);
  });

  typeBody.innerHTML = "";
  setSelectedLedgerCodeInModal("");
  setSelectedLedgerTypeCodeInModal("");
  setSelectedLedgerItemCodeInModal("");
  let total = 0;

  const sorted = types.slice().sort((a, b) => {
    const ac = String(a.code || "");
    const bc = String(b.code || "");
    const an = Number((ac.match(/(\d+)/) || [, "0"])[1]);
    const bn = Number((bc.match(/(\d+)/) || [, "0"])[1]);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) {
      return an - bn;
    }
    return ac.localeCompare(bc, "ko");
  });

  // 모달에서 기본 선택값을 현재 상단 선택값으로 맞춘다.
  const preferTypeCode = String(
    getSelectedCashflowTypeForEntry() ||
      (paymentLedgerTypeCodeInput ? paymentLedgerTypeCodeInput.value : "") ||
      (paymentLedgerSelect ? paymentLedgerSelect.value : "") ||
      "",
  ).trim();
  const preferItemCode = String(
    getSelectedCashflowItemForEntry() ||
      (paymentCashflowItemCodeInput
        ? paymentCashflowItemCodeInput.value
        : "") ||
      "",
  ).trim();

  sorted.forEach((t) => {
    const opening = openingByType.get(t.code) || 0;
    const delta = sumByType.get(t.code) || 0;
    const bal = opening + delta;
    total += bal;

    const code = t.code || "";
    const name = t.name || "";

    const tr = document.createElement("tr");
    tr.dataset.code = code;
    tr.dataset.name = String(name || "");
    tr.dataset.balance = String(bal);
    tr.innerHTML = `
      <td>${code}</td>
      <td>${name}</td>
    `;

    if (preferTypeCode && String(preferTypeCode) === String(code)) {
      tr.classList.add("selected");
      setSelectedLedgerCodeInModal(code);
      setSelectedLedgerTypeCodeInModal(code);
    }

    typeBody.appendChild(tr);
  });

  if (!getSelectedLedgerTypeCodeInModal() && sorted.length && sorted[0].code) {
    setSelectedLedgerCodeInModal(sorted[0].code);
    setSelectedLedgerTypeCodeInModal(sorted[0].code);
    const firstRow = typeBody.querySelector("tr");
    if (firstRow) firstRow.classList.add("selected");
  }

  // 분류항목 테이블 렌더 (이체/특수 타깃에서는 숨김)
  if (paymentLedgerItemListBody) {
    renderPaymentLedgerModalItemTable({
      items,
      preferItemCode,
      showAll: getLedgerModalShowAllItems(),
    });
  }

  if (paymentLedgerTotalSpan) {
    paymentLedgerTotalSpan.textContent = total.toLocaleString();
  }
}

export function renderPaymentLedgerModalItemTable(options = {}) {
  const {
    paymentLedgerItemListBody,
    paymentLedgerItemWrap,
    getSelectedPaymentFlow,
    getCurrentImportLedgerIndex,
    getTransferFromLedgerInput,
    getTransferToLedgerInput,
    setSelectedLedgerItemCodeInModal,
    getSelectedLedgerTypeCodeInModal,
    getSelectedLedgerItemCodeInModal,
    setSelectedLedgerCodeInModal,
    setSelectedLedgerTypeCodeInModal,
    paymentLedgerTypeListBody,
    paymentLedgerListBody,
    applyPaymentLedgerSelection,
    items,
    preferItemCode,
    showAll = false,
  } = options;

  if (!paymentLedgerItemListBody) return;

  // 분류항목(장부) 선택 모달: 더블클릭=확정(공통 위임)
  bindDblClickRowConfirm(paymentLedgerItemListBody, {
    rowSelector: 'tr[data-code]',
    onConfirm: (row) => {
      const code = String(row?.dataset?.code || '').trim();
      const name = String(row?.dataset?.name || '').trim();
      const typeCode = String(row?.dataset?.typeCode || '').trim();

      // 분류 더블클릭: 전체보기 상태면 분류항목의 typeCode를 우선 사용해 구분과 함께 확정
      const typeBody = paymentLedgerTypeListBody || paymentLedgerListBody;
      const typeRows = typeBody ? Array.from(typeBody.querySelectorAll('tr')) : [];
      const preferredTypeRow = typeCode
        ? typeRows.find((r) => String(r.dataset.code || '') === String(typeCode))
        : null;
      const selectedTypeRow =
        preferredTypeRow || (typeBody ? typeBody.querySelector('tr.selected') : null);
      if (!selectedTypeRow) return;

      const tCode = selectedTypeRow.dataset.code || '';
      const tName = selectedTypeRow.dataset.name || '';
      const balance = Number(selectedTypeRow.dataset.balance || '0') || 0;
      applyPaymentLedgerSelection(tCode, tName, balance, code, name);
    },
  });

  // 분류항목(장부) 선택 모달: 클릭=선택(공통 위임)
  bindClickRowSelect(paymentLedgerItemListBody, {
    rowSelector: 'tr[data-code]',
    onSelect: (row) => {
      const code = String(row?.dataset?.code || '').trim();
      const typeCode = String(row?.dataset?.typeCode || '').trim();
      if (!code) return;

      setSelectedLedgerItemCodeInModal(code);

      // 전체보기 상태(showAll)에서는, 분류항목의 typeCode에 맞춰 구분도 자동 선택해 준다.
      if (showAll && typeCode) {
        const typeBody = paymentLedgerTypeListBody || paymentLedgerListBody;
        if (typeBody) {
          const rows = Array.from(typeBody.querySelectorAll('tr'));
          const match = rows.find(
            (r) => String(r.dataset.code || '') === String(typeCode),
          );
          if (match) {
            rows.forEach((r) => r.classList.remove('selected'));
            match.classList.add('selected');
            setSelectedLedgerCodeInModal(typeCode);
            setSelectedLedgerTypeCodeInModal(typeCode);
          }
        }
      }
    },
  });

  const flow = getSelectedPaymentFlow();
  const isTransferTarget = Boolean(
    getCurrentImportLedgerIndex() != null ||
    getTransferFromLedgerInput() ||
    getTransferToLedgerInput() ||
    flow === "transfer",
  );

  if (paymentLedgerItemWrap) {
    paymentLedgerItemWrap.style.display = isTransferTarget ? "none" : "";
  }
  paymentLedgerItemListBody.innerHTML = "";
  setSelectedLedgerItemCodeInModal("");

  if (isTransferTarget) return;
  if (!showAll && !getSelectedLedgerTypeCodeInModal()) return;

  const listAll = Array.isArray(items) ? items : [];
  const list = listAll.filter((it) => {
    if (!it) return false;
    if (
      !showAll &&
      String(it.typeCode || "") !== String(getSelectedLedgerTypeCodeInModal())
    )
      return false;
    return true;
  });

  const sorted = list.slice().sort((a, b) => {
    const ac = String(a.code || "");
    const bc = String(b.code || "");
    const an = Number((ac.match(/(\d+)/) || [, "0"])[1]);
    const bn = Number((bc.match(/(\d+)/) || [, "0"])[1]);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn;
    return ac.localeCompare(bc, "ko");
  });

  sorted.forEach((it) => {
    const code = String(it.code || "").trim();
    const name = String(it.name || "").trim();
    const typeCode = String(it.typeCode || "").trim();
    const tr = document.createElement("tr");
    tr.dataset.code = code;
    tr.dataset.name = name;
    tr.dataset.typeCode = typeCode;
    tr.innerHTML = `
      <td>${code}</td>
      <td>${name}</td>
    `;

    if (preferItemCode && String(preferItemCode) === String(code)) {
      tr.classList.add("selected");
      setSelectedLedgerItemCodeInModal(code);
    }

    paymentLedgerItemListBody.appendChild(tr);
  });

  // 자동 선택: 이전 값이 없으면 첫 번째 항목 선택
  if (!getSelectedLedgerItemCodeInModal() && sorted.length && sorted[0].code) {
    setSelectedLedgerItemCodeInModal(String(sorted[0].code));
    const firstRow = paymentLedgerItemListBody.querySelector("tr");
    if (firstRow) firstRow.classList.add("selected");
  }
}

