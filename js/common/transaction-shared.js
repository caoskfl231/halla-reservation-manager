import { getAllLedgerTx, getTransactions } from "../db.js?v=app-20261010-3";
import { confirmDialog } from "./dialogs.js?v=app-20261010-3";

export function getActiveCustomersByType(allCustomers, typeLabel) {
  const isActiveStatus = (v) => String(v || "active") === "active";
  const base = (allCustomers || []).filter((c) => isActiveStatus(c?.status));
  if (!typeLabel) return base;

  const wanted = String(typeLabel || "").trim();
  if (!wanted) return base;

  // 타입 표기는 데이터/화면별로 '매출처' vs '매출'처럼 다를 수 있어
  // 사용자가 기대하는 결과(매장매출/온라인매출 등)를 놓치지 않도록 별칭을 허용한다.
  const aliases = new Set([wanted]);
  if (wanted.endsWith("처") && wanted.length > 1) {
    aliases.add(wanted.slice(0, -1));
  }
  if (wanted === "매출처") aliases.add("매출");
  if (wanted === "매입처") aliases.add("매입");
  if (wanted === "지출처") aliases.add("지출");

  return base.filter((c) => {
    const t = String(c?.type || "").trim();
    if (!t) return false;
    for (const a of aliases) {
      if (a && t.includes(a)) return true;
    }
    return false;
  });
}

export function parseNumberLike(str) {
  if (str == null) return 0;
  const cleaned = String(str).replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLedgerLineSignature(row) {
  const flow = String(row?.flow || "").trim();
  const accountId = String(row?.accountId || "").trim();
  const cashflowItemCode = String(row?.cashflowItemCode || "").trim();
  const amount = Math.abs(Number(row?.amount || 0) || 0);
  const vendor = String(row?.vendor || row?.item || "").trim();
  const eventType = String(row?.eventType || "").trim();
  return `${flow}__${accountId}__${cashflowItemCode}__${amount}__${vendor}__${eventType}`;
}

function buildLedgerBatchSignature(rows) {
  const keys = (rows || []).map(normalizeLedgerLineSignature).filter(Boolean).sort();
  return { keys, sig: keys.join("||"), count: keys.length };
}

function groupLedgerRowsForDuplicateCheck({ rows = [], candidateCount = 1 } = {}) {
  const map = new Map();
  for (const t of rows || []) {
    if (!t) continue;
    const groupId = String(t.groupId || "").trim();
    // 후보가 2건 이상(이체 등)인 경우는 groupId가 있는 묶음만 비교 대상으로 본다.
    if (candidateCount > 1 && !groupId) continue;
    const key = groupId ? `GROUP__${groupId}` : `SINGLE__${String(t.id ?? "")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return map;
}

export async function findAnyDuplicateLedgerBatchesBeforeSave({
  source = "",
  batches = [],
  ignoreLedgerIds = [],
} = {}) {
  const list = Array.isArray(batches) ? batches : [];
  if (!list.length) return null;

  let all = [];
  try {
    all = (await getAllLedgerTx()) || [];
  } catch {
    return null;
  }

  const safeSource = String(source || "").trim();
  const ignoreSet = new Set((ignoreLedgerIds || []).map((v) => String(v)));

  const baseAll = (all || []).filter((t) => {
    if (!t) return false;
    if (safeSource && String(t.source || "").trim() !== safeSource) return false;
    if (ignoreSet.size && ignoreSet.has(String(t.id))) return false;
    return true;
  });
  if (!baseAll.length) return null;

  const byDate = new Map();
  for (const t of baseAll) {
    const d = String(t?.date || "").trim();
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(t);
  }

  for (const batchRows of list) {
    const rows = Array.isArray(batchRows) ? batchRows : [];
    if (!rows.length) continue;

    const safeDate = String(rows[0]?.date || "").trim();
    if (!safeDate) continue;

    const { sig: candidateSig, count: candidateCount } = buildLedgerBatchSignature(rows);
    if (!candidateSig || candidateCount <= 0) continue;

    const base = byDate.get(safeDate) || [];
    if (!base.length) continue;

    const grouped = groupLedgerRowsForDuplicateCheck({ rows: base, candidateCount });
    for (const [, existingRows] of grouped.entries()) {
      if (!existingRows || existingRows.length !== candidateCount) continue;
      const { sig: existingSig } = buildLedgerBatchSignature(existingRows);
      if (existingSig && existingSig === candidateSig) {
        return { kind: "ledger", date: safeDate, count: candidateCount };
      }
    }
  }

  return null;
}

export async function confirmDuplicateLedgerBatchBeforeSave({
  source = "",
  date = "",
  rows = [],
  ignoreLedgerIds = [],
} = {}) {
  const safeDate = String(date || "").trim();
  if (!safeDate) return true;

  const { sig: candidateSig, count: candidateCount } = buildLedgerBatchSignature(rows);
  if (!candidateSig || candidateCount <= 0) return true;

  let all = [];
  try {
    all = (await getAllLedgerTx()) || [];
  } catch {
    return true;
  }

  const safeSource = String(source || "").trim();
  const ignoreSet = new Set((ignoreLedgerIds || []).map((v) => String(v)));

  const base = all.filter((t) => {
    if (!t) return false;
    if (String(t.date || "").trim() !== safeDate) return false;
    if (safeSource && String(t.source || "").trim() !== safeSource) return false;
    if (ignoreSet.size && ignoreSet.has(String(t.id))) return false;
    return true;
  });
  if (!base.length) return true;

  const grouped = groupLedgerRowsForDuplicateCheck({ rows: base, candidateCount });
  for (const [, list] of grouped.entries()) {
    if (!list || list.length !== candidateCount) continue;
    const { sig: existingSig } = buildLedgerBatchSignature(list);
    if (existingSig && existingSig === candidateSig) {
      const msg =
        `중복 저장 경고\n` +
        `같은 입출금 내역이 이미 저장되어 있을 수 있습니다.\n` +
        `날짜:${safeDate} / ${candidateCount}건\n\n` +
        `그래도 저장할까요?`;
      return await confirmDialog(msg);
    }
  }

  return true;
}

export async function confirmAnyDuplicateLedgerBatchesBeforeSave({
  source = "",
  batches = [],
  ignoreLedgerIds = [],
} = {}) {
  const dup = await findAnyDuplicateLedgerBatchesBeforeSave({
    source,
    batches,
    ignoreLedgerIds,
  });
  if (!dup) return true;
  const msg =
    `중복 저장 경고\n` +
    `인식 저장 목록에 이미 저장된 입출금 내역이 포함되어 있을 수 있습니다.\n` +
    `첫 중복: 날짜:${dup.date} / ${dup.count}건\n\n` +
    `그래도 전체를 저장할까요?`;
  return await confirmDialog(msg);
}

export async function confirmDuplicateSimplePaymentTransactionBeforeSave({
  source = "",
  category = "",
  type = "",
  date = "",
  supplierId = "",
  accountCode = "",
  payment = 0,
  ignoreTransactionIds = [],
} = {}) {
  const safeDate = String(date || "").trim();
  if (!safeDate) return true;
  const safeSupplierId = String(supplierId || "").trim();
  const safeAccount = String(accountCode || "").trim();
  const safePayment = Math.abs(Number(payment || 0) || 0);
  if (!(safePayment > 0)) return true;

  let all = [];
  try {
    all = (await getTransactions()) || [];
  } catch {
    return true;
  }

  const ignoreSet = new Set((ignoreTransactionIds || []).map((v) => String(v)));
  const safeSource = String(source || "").trim();
  const safeCategory = String(category || "").trim();
  const safeType = String(type || "").trim();

  const dup = (all || []).find((t) => {
    if (!t) return false;
    if (ignoreSet.size && ignoreSet.has(String(t.id))) return false;
    if (String(t.date || "").trim() !== safeDate) return false;
    if (safeSource && String(t.source || "").trim() !== safeSource) return false;
    if (safeCategory && String(t.category || "").trim() !== safeCategory) return false;
    if (safeType && String(t.type || "").trim() !== safeType) return false;
    if (safeSupplierId && String(t.supplierId || "").trim() !== safeSupplierId) return false;
    const p = Math.abs(Number(t.payment || 0) || 0);
    if (p !== safePayment) return false;
    if (safeAccount) {
      const ledgerName = String(t.ledgerName || "").trim();
      // ledgerName은 화면 표시용이라 완전일치가 아닐 수 있음. 그래도 계정/통장 기반 중복을 잡기 위해
      // 코드가 포함되어 있거나(예: 'A01 법인통장') 코드 자체면 중복으로 본다.
      if (!(ledgerName === safeAccount || ledgerName.includes(safeAccount))) return false;
    }
    return true;
  });

  if (!dup) return true;
  const supplierPart = safeSupplierId ? ` / 거래처:${safeSupplierId}` : "";
  const accountPart = safeAccount ? ` / 통장:${safeAccount}` : "";
  const msg =
    `중복 저장 경고\n` +
    `같은 지불/지출 내역이 이미 저장되어 있을 수 있습니다.\n` +
    `날짜:${safeDate}${supplierPart}${accountPart}\n` +
    `금액:${safePayment.toLocaleString()}\n\n` +
    `그래도 저장할까요?`;
  return await confirmDialog(msg);
}

export async function confirmAnyDuplicateSimplePaymentTransactionsBeforeSave({
  source = "",
  candidates = [],
  ignoreTransactionIds = [],
} = {}) {
  const dup = await findAnyDuplicateSimplePaymentTransactionsBeforeSave({
    source,
    candidates,
    ignoreTransactionIds,
  });
  if (!dup) return true;
  const supplierPart = dup.supplierId ? ` / 거래처:${dup.supplierId}` : "";
  const accountPart = dup.accountCode ? ` / 통장:${dup.accountCode}` : "";
  const msg =
    `중복 저장 경고\n` +
    `인식 저장 목록에 이미 저장된 전표(지출/매입결제/수금)가 포함되어 있을 수 있습니다.\n` +
    `첫 중복: 날짜:${dup.date}${supplierPart}${accountPart}\n` +
    `금액:${dup.payment.toLocaleString()}\n\n` +
    `그래도 전체를 저장할까요?`;
  return await confirmDialog(msg);
}

export async function findAnyDuplicateSimplePaymentTransactionsBeforeSave({
  source = "",
  candidates = [],
  ignoreTransactionIds = [],
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return null;

  let all = [];
  try {
    all = (await getTransactions()) || [];
  } catch {
    return null;
  }

  const safeSource = String(source || "").trim();
  const ignoreSet = new Set((ignoreTransactionIds || []).map((v) => String(v)));

  const baseAll = (all || []).filter((t) => {
    if (!t) return false;
    if (ignoreSet.size && ignoreSet.has(String(t.id))) return false;
    if (safeSource && String(t.source || "").trim() !== safeSource) return false;
    return true;
  });
  if (!baseAll.length) return null;

  const byDate = new Map();
  for (const t of baseAll) {
    const d = String(t?.date || "").trim();
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(t);
  }

  for (const c of list) {
    const safeDate = String(c?.date || "").trim();
    if (!safeDate) continue;
    const safeCategory = String(c?.category || "").trim();
    const safeType = String(c?.type || "").trim();
    const safeSupplierId = String(c?.supplierId || "").trim();
    const safeAccount = String(c?.accountCode || c?.ledgerName || "").trim();
    const safePayment = Math.abs(Number(c?.payment || 0) || 0);
    if (!(safePayment > 0)) continue;

    const rows = byDate.get(safeDate) || [];
    if (!rows.length) continue;

    const dup = rows.find((t) => {
      if (!t) return false;
      if (safeCategory && String(t.category || "").trim() !== safeCategory) return false;
      if (safeType && String(t.type || "").trim() !== safeType) return false;
      if (safeSupplierId && String(t.supplierId || "").trim() !== safeSupplierId) return false;
      const p = Math.abs(Number(t.payment || 0) || 0);
      if (p !== safePayment) return false;
      if (safeAccount) {
        const ledgerName = String(t.ledgerName || "").trim();
        if (!(ledgerName === safeAccount || ledgerName.includes(safeAccount))) return false;
      }
      return true;
    });

    if (dup) {
      return {
        kind: "tx",
        date: safeDate,
        payment: safePayment,
        supplierId: safeSupplierId,
        accountCode: safeAccount,
        type: safeType,
        category: safeCategory,
      };
    }
  }

  return null;
}

function normalizeLineSignature(row) {
  const itemKey = String(
    row?.itemCode || row?.itemId || row?.code || row?.itemName || row?.name || "",
  ).trim();

  const qtyRaw =
    row?.quantity != null
      ? row.quantity
      : row?.qty != null
        ? row.qty
        : 0;
  const qty = Number(qtyRaw) || 0;

  const unitPrice = Number(row?.unitPrice) || 0;
  const amountRaw =
    row?.amount != null
      ? row.amount
      : row?.total != null
        ? row.total
        : 0;
  const amount = Math.abs(Number(amountRaw) || 0);

  return `${itemKey}__${qty}__${unitPrice}__${amount}`;
}

function buildBatchSignature(rows) {
  const keys = (rows || []).map(normalizeLineSignature).filter(Boolean).sort();
  return { keys, sig: keys.join("||"), count: keys.length };
}

/**
 * 같은 날짜/거래처/품목+수량+단가+합계/건수의 전표(묶음)가 이미 저장되어 있으면
 * 저장 전에 confirm 경고를 1번 띄운다.
 *
 * @returns {Promise<boolean>} true=계속 저장, false=저장 취소
 */
export async function confirmDuplicateBatchBeforeSave({
  source = "",
  date = "",
  supplierId = "",
  rows = [],
  ignoreBatchKey = "",
} = {}) {
  const safeDate = String(date || "").trim();
  if (!safeDate) return true;

  const { sig: candidateSig, count: candidateCount } = buildBatchSignature(rows);
  if (!candidateSig || candidateCount <= 0) return true;

  let all = [];
  try {
    all = (await getTransactions()) || [];
  } catch {
    return true;
  }

  const safeSupplierId = String(supplierId || "").trim();
  const safeSource = String(source || "").trim();
  const safeIgnore = String(ignoreBatchKey || "").trim();

  const base = all.filter((t) => {
    if (!t) return false;
    if (String(t.date || "").trim() !== safeDate) return false;
    if (safeSource && String(t.source || "").trim() !== safeSource) return false;
    if (safeSupplierId && String(t.supplierId || "").trim() !== safeSupplierId) return false;
    if (safeIgnore && String(t.batchKey || "").trim() === safeIgnore) return false;
    return true;
  });

  if (!base.length) return true;

  const groupMap = new Map();
  for (const t of base) {
    const bk = String(t.batchKey || "").trim();
    // 건수(여러 줄) 비교는 batchKey가 있는 전표만 대상으로 한다.
    if (candidateCount > 1 && !bk) continue;
    const groupKey = bk ? `BATCH__${bk}` : `SINGLE__${String(t.id ?? "")}`;
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey).push(t);
  }

  for (const [groupKey, list] of groupMap.entries()) {
    if (!list || list.length !== candidateCount) continue;
    const { sig: existingSig } = buildBatchSignature(list);
    if (existingSig && existingSig === candidateSig) {
      const supplierPart = safeSupplierId ? ` / 거래처:${safeSupplierId}` : "";
      const msg =
        `중복 저장 경고\n` +
        `같은 전표가 이미 저장되어 있을 수 있습니다.\n` +
        `날짜:${safeDate}${supplierPart}\n` +
        `품목/수량/단가/합계 ${candidateCount}건이 모두 동일합니다.\n\n` +
        `그래도 저장할까요?`;
      return await confirmDialog(msg);
    }
  }

  return true;
}

