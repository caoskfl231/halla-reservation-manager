export function updatePaymentImportSelectedAccountLabel(options = {}) {
  const {
    paymentImportSelectedAccountSpan,
    paymentImportSelectedLedgerSpan,
    selectedCashflowTypeForEntry,
    selectedCashflowItemForEntry,
    cashflowTypes,
    cashflowItems,
  } = options;

  if (!paymentImportSelectedAccountSpan && !paymentImportSelectedLedgerSpan)
    return;

  const typeCode = String(selectedCashflowTypeForEntry || "").trim();
  if (!typeCode) {
    if (paymentImportSelectedAccountSpan)
      paymentImportSelectedAccountSpan.textContent = "(미선택)";
    if (paymentImportSelectedLedgerSpan)
      paymentImportSelectedLedgerSpan.textContent = "(미선택)";
    return;
  }

  const found = Array.isArray(cashflowTypes)
    ? cashflowTypes.find((t) => String(t.code || "").trim() === typeCode)
    : null;
  const typeName = found ? String(found.name || "").trim() : "";

  const itemCode = String(selectedCashflowItemForEntry || "").trim();
  const itemFound =
    itemCode && Array.isArray(cashflowItems)
      ? cashflowItems.find((it) => String(it.code || "").trim() === itemCode)
      : null;
  const itemName = itemFound ? String(itemFound.name || "").trim() : "";

  if (paymentImportSelectedLedgerSpan) {
    // 장부목록(항목)이 단일 진실원천이므로, item 미선택이면 '(미선택)'으로 표시
    if (itemCode) paymentImportSelectedLedgerSpan.textContent = itemName || "(미선택)";
    else paymentImportSelectedLedgerSpan.textContent = "(미선택)";
  }

  // 계정(span)은 현재 UI에서 숨김 처리되어 있으나, 내부 로직 호환을 위해 값은 유지
  if (paymentImportSelectedAccountSpan) {
    paymentImportSelectedAccountSpan.textContent = typeName || typeCode || "";
  }
}

export function renderPaymentImportTable(options = {}) {
  const {
    paymentImportResultBody,
    importRecords,
    importCustomers,
    fmt,
    stripCodePrefix,
    IMPORT_MODE_TRANSFER,
    paymentImportCountSpan,
    paymentImportStatus,
    paymentImportTotalInnSpan,
    paymentImportTotalOutSpan,
    paymentImportTotalBalanceSpan,
    applyAmountColoring,
    paymentImportModal,
  } = options;

  if (!paymentImportResultBody) return;

  paymentImportResultBody.innerHTML = "";
  let totalInn = 0;
  let totalOut = 0;

  const fmtAbs = (n) => fmt(Math.abs(Number(n ?? 0) || 0));

  // 인식 모달의 시작 잔액은 현재 화면에서 별도 관리하지 않으므로 0 기준으로 계산
  const baseBal = 0;
  let running = baseBal;

  (importRecords || []).forEach((rec, recordIndex) => {
    const rowMode =
      rec.mode || (rec.flow === "in" ? "in" : rec.flow === "out" ? "out" : "");
    const inn = Number(rec.inn || 0) || 0;
    const out = Number(rec.out || 0) || 0;

    if (rowMode === "in") {
      totalInn += inn;
      running += inn;
    } else if (rowMode === "out") {
      totalOut += out;
      running -= out;
    } else {
      // transfer/미선택은 합계/잔액 변화에 반영하지 않는다.
    }

    const rowBalance = running;

    const cellLabel = (() => {
      // 이체 모드: 거래처 칸은 상대 장부 선택
      if (rowMode === IMPORT_MODE_TRANSFER) {
        if (rec.transferLedgerLabel)
          return stripCodePrefix(rec.transferLedgerLabel);
        return "장부 선택";
      }

      // 입금/출금 모드: 선택된 거래처명이 있으면 그것을 표시
      const cid = String(rec.customerId || "").trim();
      if (cid) {
        const c = (importCustomers || []).find((x) => String(x.id) === cid);
        if (c && c.name) return String(c.name);
      }

      return (
        rec.custName || rec.customerName || rec.vendorMatchedName || "선택"
      );
    })();

    const tr = document.createElement("tr");
    tr.dataset.index = String(recordIndex);

    if (rec && rec._dupCandidate) {
      tr.classList.add("dup-candidate");
      if (rec._dupReasonLabel) tr.title = String(rec._dupReasonLabel);
    }
    tr.innerHTML = `
      <td>
        <select class="payment-import-mode-select" data-index="${recordIndex}">
          <option value="" ${!rowMode ? "selected" : ""}>선택</option>
          <option value="in" ${rowMode === "in" ? "selected" : ""}>입금</option>
          <option value="out" ${rowMode === "out" ? "selected" : ""}>출금</option>
          <option value="transfer" ${rowMode === IMPORT_MODE_TRANSFER ? "selected" : ""}>이체</option>
        </select>
      </td>
      <td>
        <button type="button" class="btn-row-btn payment-import-select-customer" data-index="${recordIndex}">${cellLabel}</button>
      </td>
      <td>${(rec.dateTime || "").split(" ")[0]}</td>
      <td>${rec.vendor || ""}</td>
      <td class="right" data-amount-color="1" data-amount-value="${inn}">${fmt(inn)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${out}" data-amount-force="minus">${fmtAbs(out)}</td>
      <td class="right" data-amount-color="1" data-amount-value="${rowBalance}">${fmt(rowBalance)}</td>
    `;
    paymentImportResultBody.appendChild(tr);
  });

  if (paymentImportCountSpan) {
    paymentImportCountSpan.textContent = String((importRecords || []).length);
  }
  if (paymentImportStatus) {
    if (!importRecords || !importRecords.length) {
      paymentImportStatus.textContent =
        "인식된 거래가 없습니다. 붙여넣기 형식을 확인해 주세요.";
    } else {
      paymentImportStatus.textContent = `${importRecords.length}건을 인식했습니다.`;
    }
  }

  if (paymentImportTotalInnSpan) {
    paymentImportTotalInnSpan.textContent = fmt(totalInn);
    paymentImportTotalInnSpan.dataset.amountColor = "1";
    paymentImportTotalInnSpan.dataset.amountValue = String(totalInn);
    delete paymentImportTotalInnSpan.dataset.amountForce;
  }
  if (paymentImportTotalOutSpan) {
    paymentImportTotalOutSpan.textContent = fmtAbs(totalOut);
    paymentImportTotalOutSpan.dataset.amountColor = "1";
    paymentImportTotalOutSpan.dataset.amountValue = String(totalOut);
    paymentImportTotalOutSpan.dataset.amountForce = "minus";
  }
  if (paymentImportTotalBalanceSpan) {
    const finalBal = baseBal + (totalInn - totalOut);
    paymentImportTotalBalanceSpan.textContent = fmt(finalBal);
    paymentImportTotalBalanceSpan.dataset.amountColor = "1";
    paymentImportTotalBalanceSpan.dataset.amountValue = String(finalBal);
    delete paymentImportTotalBalanceSpan.dataset.amountForce;
  }

  if (typeof applyAmountColoring === "function") {
    applyAmountColoring(paymentImportModal || document);
  }
}

export function updatePaymentImportCurrentRecord(options = {}) {
  const { paymentImportCurrentRecord, rec, fmt } = options;
  if (!paymentImportCurrentRecord) return;
  if (!rec) {
    paymentImportCurrentRecord.textContent = "";
    return;
  }

  const datePart = (rec.dateTime || rec.date || "").split(" ")[0] || "";
  const vendor = rec.vendor || "";
  const outText = fmt(rec.out || 0);
  const inText = fmt(rec.inn || 0);

  const pieces = [];
  if (datePart) pieces.push(datePart);
  if (vendor) pieces.push(vendor);
  const amountParts = [];
  if (rec.out) amountParts.push(`출금 ${outText}`);
  if (rec.inn) amountParts.push(`입금 ${inText}`);

  const amountLabel = amountParts.join(" / ");
  if (amountLabel) pieces.push(`(${amountLabel})`);

  paymentImportCurrentRecord.textContent = pieces.join(" ");
}

export function renderPaymentImportCustomerList(options = {}) {
  const {
    paymentImportCustomerListBody,
    paymentImportCustomerSearch,
    importCustomers,
    importCustomerFilterType,
    importCustomerFilterGroup,
    importCustomerBalanceById,
    fmt,
    applyAmountColoring,
    paymentImportCustomerModal,
  } = options;

  if (!paymentImportCustomerListBody) return;

  const q = (paymentImportCustomerSearch?.value || "").trim().toLowerCase();

  const list = (importCustomers || []).filter((c) => {
    // 구분/분류 필터 적용
    if (importCustomerFilterType && (c.type || "") !== importCustomerFilterType)
      return false;
    if (
      importCustomerFilterGroup &&
      (c.group || "") !== importCustomerFilterGroup
    )
      return false;

    if (!q) return true;
    const name = (c.name || "").toLowerCase();
    const code = String(c.id || "").toLowerCase();
    const type = (c.type || "").toLowerCase();
    const group = (c.group || "").toLowerCase();
    return (
      name.includes(q) ||
      code.includes(q) ||
      type.includes(q) ||
      group.includes(q)
    );
  });

  const format = typeof fmt === "function" ? fmt : (n) => String(n ?? "");
  const getBalance = (id) => {
    if (!id) return 0;
    if (importCustomerBalanceById instanceof Map) {
      const v = importCustomerBalanceById.get(String(id));
      return Number.isFinite(Number(v)) ? Number(v) : 0;
    }
    const v = importCustomerBalanceById
      ? importCustomerBalanceById[String(id)]
      : 0;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  };

  paymentImportCustomerListBody.innerHTML = list
    .map((c) => {
      const bal = getBalance(c.id);
      return `
      <tr data-id="${c.id}">
        <td class="col-name">${c.name || ""}</td>
        <td class="col-balance right" data-amount-color="1" data-amount-value="${bal}">${format(bal)}</td>
      </tr>
    `;
    })
    .join("");

  if (typeof applyAmountColoring === "function") {
    applyAmountColoring(paymentImportCustomerModal || document);
  }
}

export function applyImportCustomerSelection(options = {}) {
  const {
    customerId,
    currentImportCustomerIndex,
    importRecords,
    importCustomers,
    updateImportRecordCategory,
  } = options;

  if (currentImportCustomerIndex == null) return false;
  const rec = importRecords[currentImportCustomerIndex];
  if (!rec) return false;
  const cust = (importCustomers || []).find(
    (c) => String(c.id) === String(customerId),
  );
  if (!cust) return false;

  rec.customerId = cust.id;
  rec.customerName = cust.name || "";
  rec.custName = cust.name || "";
  rec.custType = cust.type || "";
  rec.custGroup = cust.group || "";
  // 매입처(구분에 "매입" 포함)를 선택한 경우, 매입 연동용 supplierId 도 함께 지정해 준다.
  if ((cust.type || "").includes("매입")) {
    rec.supplierId = cust.id;
  } else {
    // 매출처/지출처 등 다른 구분을 선택한 경우에는
    // 기존에 남아 있던 supplierId 매핑을 제거한다.
    rec.supplierId = "";
  }
  if (typeof updateImportRecordCategory === "function") {
    updateImportRecordCategory(rec);
  }

  return true;
}

export function renderPaymentImportTypeList(options = {}) {
  const {
    paymentImportTypeListBody,
    importCustomerTypes,
    importCustomerFilterType,
  } = options;

  if (!paymentImportTypeListBody) return;

  const rows = [];
  (importCustomerTypes || []).forEach((t) => {
    const name = t.name || "";
    const active = importCustomerFilterType === name;
    rows.push(`
      <tr data-type="${name}" class="${active ? "is-active" : ""}">
        <td>${t.code || ""} ${name}</td>
      </tr>
    `);
  });

  paymentImportTypeListBody.innerHTML = rows.join("");
}

export function renderPaymentImportGroupList(options = {}) {
  const {
    paymentImportGroupListBody,
    importCustomerGroups,
    importCustomerFilterType,
    importCustomerFilterGroup,
  } = options;

  if (!paymentImportGroupListBody) return;

  const rows = [];
  const groups = (importCustomerGroups || []).filter((g) => {
    if (!importCustomerFilterType) return true;
    return g.type === importCustomerFilterType;
  });

  groups.forEach((g) => {
    const name = g.name || "";
    const active = importCustomerFilterGroup === name;
    rows.push(`
      <tr data-group="${name}" class="${active ? "is-active" : ""}">
        <td>${g.code || ""} ${name}</td>
      </tr>
    `);
  });

  paymentImportGroupListBody.innerHTML = rows.join("");
}
