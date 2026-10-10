import { bindClickRowSelect } from "../common/ui-helpers.js?v=ledger-delta-20261010-1";

let currentCashflowSummarySelectRef = null;

function normalizeYmd(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/^\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return "";
  const y = m[1];
  const mm = String(m[2]).padStart(2, "0");
  const dd = String(m[3]).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function ymdFromTx(tx) {
  if (!tx) return "";
  return (
    normalizeYmd(tx.date) ||
    normalizeYmd(tx.dateTime) ||
    ""
  );
}

function looksLikeItemCode(v) {
  const s = String(v ?? "").trim();
  return /^A\d{4,}$/.test(s);
}

function looksLikeTypeCode(v) {
  const s = String(v ?? "").trim();
  return /^A\d{2}$/.test(s);
}

function normalizeItemNameSeed(v) {
  let s = String(v ?? "").trim();
  if (!s) return "";
  // "A0002 매장현금" / "A02 현금" 같은 라벨에서 코드 접두를 제거
  s = s.replace(/^A\d{2,4}[\s-]+/, "");
  s = s.replace(/\s+/g, "");
  return s;
}

function buildItemCodeByName(items) {
  const next = new Map();
  const dup = new Set();
  (items || []).forEach((it) => {
    const code = String(it?.code || "").trim();
    const name = normalizeItemNameSeed(it?.name);
    if (!code || !name) return;
    if (next.has(name)) dup.add(name);
    else next.set(name, code);
  });
  dup.forEach((k) => next.delete(k));
  return next;
}

function resolveLedgerItemOrTypeCode(tx, itemCodeByName) {
  const itemCode = String(tx?.cashflowItemCode || "").trim();
  if (looksLikeItemCode(itemCode)) return itemCode;

  const cashflowCode = String(tx?.cashflowCode || "").trim();
  if (looksLikeItemCode(cashflowCode)) return cashflowCode;

  const accountId = String(tx?.accountId || "").trim();
  if (looksLikeItemCode(accountId)) return accountId;

  const byNameSeed =
    normalizeItemNameSeed(tx?.cashflowItemName) ||
    normalizeItemNameSeed(tx?.item) ||
    normalizeItemNameSeed(tx?.accountName);
  if (byNameSeed && itemCodeByName && itemCodeByName.has(byNameSeed)) {
    return String(itemCodeByName.get(byNameSeed) || "");
  }

  return cashflowCode || accountId || "";
}

export function updateCashflowTypeButtons(options = {}) {
  const { cashflowTypeSwitchButtons, cashflowSummaryFlowFilter } = options;
  if (!cashflowTypeSwitchButtons || !cashflowTypeSwitchButtons.length) return;
  cashflowTypeSwitchButtons.forEach((btn) => {
    const flow = btn.dataset.flow;
    const isActive = flow === cashflowSummaryFlowFilter;
    btn.classList.toggle("is-active", Boolean(isActive));
    btn.setAttribute("aria-pressed", String(Boolean(isActive)));
  });
}

export async function renderCashflowSummaryTable(options = {}) {
  const {
    cashflowListBody,
    cashflowTotalSpan,
    cashflowTypes,
    cashflowItems,
    selectedCashflowCodeFilter,
    selectedCashflowTypeForEntry,
    cutoffDate,
    methodTab,
    setSelectedCashflowTypeForEntry,
    setSelectedCashflowCurrentBalance,
    setMainTxFilterCode,
    getAllLedgerTx,
    render,
  } = options;

  if (!cashflowListBody) return;

  currentCashflowSummarySelectRef = {
    setSelectedCashflowTypeForEntry,
    setSelectedCashflowCurrentBalance,
    setMainTxFilterCode,
    render,
  };

  bindClickRowSelect(cashflowListBody, {
    rowSelector: 'tr[data-code]',
    onSelect: async (row) => {
      const ref = currentCashflowSummarySelectRef;
      if (!ref) return;

      const code = String(row?.dataset?.code || '');
      const bal = Number(row?.dataset?.balance ?? 0) || 0;

      if (typeof ref.setSelectedCashflowTypeForEntry === 'function') {
        ref.setSelectedCashflowTypeForEntry(code);
      }
      if (typeof ref.setSelectedCashflowCurrentBalance === 'function') {
        ref.setSelectedCashflowCurrentBalance(bal);
      }

      if (typeof ref.setMainTxFilterCode === 'function') {
        ref.setMainTxFilterCode(code);
      }
      if (typeof ref.render === 'function') {
        await ref.render();
      }
    },
  });

  const types =
    Array.isArray(cashflowTypes) && cashflowTypes.length
      ? cashflowTypes.slice()
      : [];

  // 선택된 구분(계정) 필터
  let list = types;
  if (selectedCashflowCodeFilter) {
    list = list.filter(
      (t) => String(t.code) === String(selectedCashflowCodeFilter),
    );
  }

  // 방향(출금/입금/이체) 기준으로 사용할 입출금 항목/거래 집계 준비
  const items = cashflowItems || [];
  const itemByCode = new Map(
    (items || []).map((it) => [String(it?.code || ""), it]).filter(([k]) => k),
  );
  const itemCodeByName = buildItemCodeByName(items || []);

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
  const cutoff = String(cutoffDate || "").trim();
  const cutoffYmd = normalizeYmd(cutoff);
  const method = String(methodTab || "").trim();

  (txAll || []).forEach((tx) => {
    if (!tx) return;
    // 결제수단 탭이 선택된 경우 메인표와 동일하게 필터링
    if (method && method !== "all") {
      if (String(tx.paymentMethod || "").trim() !== method) return;
    }
    // 종료일이 있으면 해당 날짜까지 누적(잔액은 '현재'가 아니라 '조회 종료일 기준')
    if (cutoffYmd) {
      const d = ymdFromTx(tx);
      if (!d || d > cutoffYmd) return;
    }

    const resolved = resolveLedgerItemOrTypeCode(tx, itemCodeByName);
    if (!resolved) return;
    const amount = Number(tx.amount) || 0;
    if (!(amount > 0)) return;

    let typeCode = "";
    const item = itemByCode.get(String(resolved));
    if (item) typeCode = item.typeCode || "";
    else if (looksLikeTypeCode(resolved)) typeCode = String(resolved);
    else {
      // 항목이 지워졌거나 레거시 코드가 섞인 경우, 원장에 남아있는 구분코드로 최대한 귀속
      const aid = String(tx?.accountId || "").trim();
      const cfc = String(tx?.cashflowCode || "").trim();
      if (looksLikeTypeCode(aid)) typeCode = aid;
      else if (looksLikeTypeCode(cfc)) typeCode = cfc;
      else typeCode = "";
    }
    if (!typeCode) return;
    const sign = tx.flow === "in" ? 1 : -1;
    const prev = sumByType.get(typeCode) || 0;
    sumByType.set(typeCode, prev + sign * amount);
  });

  cashflowListBody.innerHTML = "";
  let total = 0;
  // 현재 선택된 구분의 잔액(법인통장 등)을 기억해 두었다가,
  // 거래 인식 모달 푸터 계산에 사용한다.
  if (typeof setSelectedCashflowCurrentBalance === "function") {
    setSelectedCashflowCurrentBalance(0);
  }

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="3">해당 조건의 입출금 계정이 없습니다.</td>';
    cashflowListBody.appendChild(tr);
    if (cashflowTotalSpan) cashflowTotalSpan.textContent = "0";
    return;
  }

  const sorted = list.slice().sort((a, b) => {
    const ac = String(a.code || "");
    const bc = String(b.code || "");
    // 코드 안의 숫자(예: A01, A05)를 기준으로 정렬
    const an = Number((ac.match(/(\d+)/) || [, "0"])[1]);
    const bn = Number((bc.match(/(\d+)/) || [, "0"])[1]);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) {
      return an - bn;
    }
    return ac.localeCompare(bc, "ko");
  });

  sorted.forEach((t) => {
    const opening = openingByType.get(t.code) || 0;
    const delta = sumByType.get(t.code) || 0;
    const bal = opening + delta;
    total += bal;

    if (String(selectedCashflowTypeForEntry || "") === String(t.code || "")) {
      if (typeof setSelectedCashflowCurrentBalance === "function") {
        setSelectedCashflowCurrentBalance(bal);
      }
    }

    const tr = document.createElement("tr");
    tr.dataset.code = String(t.code || "");
    tr.dataset.balance = String(bal);
    const isMinus = bal < 0;
    tr.innerHTML = `
        <td>${t.code || ""}</td>
        <td>${t.name || ""}</td>
        <td class="right${isMinus ? " minus" : ""}">${bal.toLocaleString()}</td>
      `;

    // 선택 상태 표시
    if (String(selectedCashflowTypeForEntry || "") === String(t.code || "")) {
      tr.classList.add("selected");
    }

    cashflowListBody.appendChild(tr);
  });

  if (cashflowTotalSpan) {
    cashflowTotalSpan.textContent = total.toLocaleString();
  }
}

export async function rebuildCashflowSummaryOptions(options = {}) {
  const {
    getCashflowTypes,
    getCashflowItems,
    setCashflowTypes,
    setCashflowItems,
    cashflowSelect,
    selectedCashflowCodeFilter,
    setSelectedCashflowCodeFilter,
    renderCashflowSummaryTable,
  } = options;

  let types = [];
  let items = [];

  try {
    types = await getCashflowTypes();
  } catch (e) {
    types = [];
  }

  try {
    items = await getCashflowItems();
  } catch (e) {
    items = [];
  }

  if (typeof setCashflowTypes === "function") setCashflowTypes(types);
  if (typeof setCashflowItems === "function") setCashflowItems(items);

  const baseList = types.slice();

  if (
    selectedCashflowCodeFilter &&
    !baseList.some((t) => String(t.code) === String(selectedCashflowCodeFilter))
  ) {
    if (typeof setSelectedCashflowCodeFilter === "function") {
      setSelectedCashflowCodeFilter("");
    }
  }

  // 상단 셀렉트가 있을 때만 옵션을 구성한다.
  if (cashflowSelect) {
    cashflowSelect.innerHTML =
      '<option value="">전체 구분</option>' +
      baseList
        .map((t) => {
          const code = t.code || "";
          const name = t.name || "";
          const label = code ? `${code} ${name}` : name;
          return `<option value="${code}">${label}</option>`;
        })
        .join("");

    if (selectedCashflowCodeFilter) {
      cashflowSelect.value = selectedCashflowCodeFilter;
    }
  }

  await renderCashflowSummaryTable();
}

export async function refreshCashflowSummary(options = {}) {
  const { rebuildCashflowSummaryOptions } = options;
  await rebuildCashflowSummaryOptions();
}

export function bindCashflowSummaryEvents(options = {}) {
  const {
    cashflowTypeSwitchButtons,
    cashflowSelect,
    btnCashflowReset,
    getCashflowSummaryFlowFilter,
    setCashflowSummaryFlowFilter,
    setSelectedCashflowCodeFilter,
    setSelectedCashflowTypeForEntry,
    setMainTxFilterCode,
    updateCashflowTypeButtons,
    rebuildCashflowSummaryOptions,
    render,
  } = options;

  // 좌측 입출금 분류 요약 박스: 방향 탭/콤보/전체보기 버튼 이벤트
  if (cashflowTypeSwitchButtons && cashflowTypeSwitchButtons.length) {
    cashflowTypeSwitchButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextFlow = btn.dataset.flow || "";
        if (!nextFlow || nextFlow === getCashflowSummaryFlowFilter()) return;
        setCashflowSummaryFlowFilter(nextFlow);
        setSelectedCashflowCodeFilter("");
        setSelectedCashflowTypeForEntry("");
        setMainTxFilterCode("");
        if (cashflowSelect) cashflowSelect.value = "";
        updateCashflowTypeButtons();
        await rebuildCashflowSummaryOptions();
        await render();
      });
    });
  }

  if (cashflowSelect) {
    cashflowSelect.addEventListener("change", async () => {
      setSelectedCashflowCodeFilter(cashflowSelect.value || "");
      setSelectedCashflowTypeForEntry("");
      setMainTxFilterCode("");
      await rebuildCashflowSummaryOptions();
      await render();
    });
  }

  if (btnCashflowReset) {
    btnCashflowReset.addEventListener("click", async () => {
      setSelectedCashflowCodeFilter("");
      setSelectedCashflowTypeForEntry("");
      setMainTxFilterCode("");
      if (cashflowSelect) cashflowSelect.value = "";
      await rebuildCashflowSummaryOptions();
      await render();
    });
  }
}

