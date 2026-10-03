export function parseMoney(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function getSelectedOptionText(selectEl) {
  if (!selectEl) return "";
  const idx = selectEl.selectedIndex;
  if (idx < 0) return "";
  const opt = selectEl.options ? selectEl.options[idx] : null;
  return opt ? String(opt.textContent || opt.innerText || "") : "";
}

export async function updatePaymentSupplierBalance(options = {}) {
  const { codeInput, balanceInput, getCustomers, getTransactions, fmt } =
    options;

  if (!codeInput || !balanceInput) return;

  const supplierId = (codeInput.value || "").trim();
  if (!supplierId) {
    balanceInput.value = "";
    return;
  }

  let customers = [];
  try {
    customers = await getCustomers();
  } catch (e) {
    customers = [];
  }

  const sup = customers.find((c) => String(c.id) === String(supplierId));
  const opening =
    Number(sup && sup.openingBalance != null ? sup.openingBalance : 0) || 0;

  let txList = [];
  try {
    txList = await getTransactions();
  } catch (e) {
    txList = [];
  }

  const related = txList
    .filter((tx) => tx && String(tx.supplierId || "") === String(supplierId))
    .filter((tx) => tx.category === "purchase" || tx.category === "expense");

  if (!related.length) {
    balanceInput.value = opening ? fmt(opening) : "";
    return;
  }

  let running = opening;
  related
    .filter((tx) => tx.date)
    .sort((a, b) => {
      const ad = a.date || "";
      const bd = b.date || "";
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      return 0;
    })
    .forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      const payment = Number(tx.payment || 0);
      // 매입/지출 전표와 동일 규칙: 잔액 = 기초 - 매입합계 + 결제합계
      running -= amount;
      running += payment;
    });

  balanceInput.value = fmt(running);
}

export function updatePaymentDateWeekday(options = {}) {
  const { headerDateInput, weekdaySpan, todayYMD, formatWeekdayLabel } =
    options;
  if (!headerDateInput || !weekdaySpan) return;
  const value = headerDateInput.value || todayYMD();
  weekdaySpan.textContent = formatWeekdayLabel(value);
}

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
  return normalizeYmd(tx.date) || normalizeYmd(tx.dateTime) || "";
}

export function inRange(tx, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const d = ymdFromTx(tx);
  if (!d) return false;
  const from = normalizeYmd(dateFrom);
  const to = normalizeYmd(dateTo);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function matchQ(tx, q, includesIgnoreCase) {
  const keyword = String(q || "")
    .trim()
    .toLowerCase();
  if (!keyword) return true;
  return (
    // 거래처/연동 코드
    includesIgnoreCase(tx.supplierId, keyword) ||
    includesIgnoreCase(tx.supplierName, keyword) ||
    includesIgnoreCase(tx.customerId, keyword) ||
    includesIgnoreCase(tx.customerName, keyword) ||
    includesIgnoreCase(tx.vendor, keyword) ||
    includesIgnoreCase(tx.memo, keyword) ||
    // 통합결제/장부 항목(코드/이름)
    includesIgnoreCase(tx.cashflowItemCode, keyword) ||
    includesIgnoreCase(tx.cashflowItemName, keyword) ||
    includesIgnoreCase(tx.cashflowCode, keyword) ||
    // 계정/장부명(표시용)
    includesIgnoreCase(tx.accountId, keyword) ||
    includesIgnoreCase(tx.accountName, keyword) ||
    // 기타 텍스트 필드(입력/백필/연동에 따라 존재)
    includesIgnoreCase(tx.entryMemo, keyword) ||
    includesIgnoreCase(tx.item, keyword) ||
    includesIgnoreCase(tx.counterparty, keyword)
  );
}
