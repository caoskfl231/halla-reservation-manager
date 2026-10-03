// ledger_tx 레코드의 키 세트를 화면/저장 경로마다 다르게 만들지 않기 위한 공통 정규화 유틸
// - 번들 없이 ES module로 직접 import해서 사용한다.
// - 기존 값이 있으면 최대한 유지하고, 누락된 키만 기본값으로 채운다.

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toTimestamp(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function ensureLedgerTxKeys(tx, defaults = {}) {
  if (!tx || typeof tx !== 'object') return tx;

  const next = { ...tx };

  // 시간 필드: number(timestamp)로 통일
  // (과거 데이터가 ISO string 이더라도 저장 시점에 정규화되도록 변환)
  const now = Date.now();
  if (!hasOwn(next, 'createdAt')) {
    next.createdAt = now;
  } else {
    next.createdAt = toTimestamp(next.createdAt) ?? now;
  }
  if (!hasOwn(next, 'updatedAt')) {
    next.updatedAt = next.createdAt;
  } else {
    next.updatedAt = toTimestamp(next.updatedAt) ?? next.createdAt;
  }

  // 문자열 계열: 누락 시 빈 문자열
  const stringKeys = [
    'cashflowItemCode',
    'cashflowItemName',
    'entryMemo',
    'customerId',
    'supplierId',
  ];
  for (const key of stringKeys) {
    if (!hasOwn(next, key)) next[key] = '';
  }

  // boolean 계열: 누락 시 false
  if (!hasOwn(next, 'preferEntryMemo')) next.preferEntryMemo = false;

  // nullable 계열: 누락 시 null
  if (!hasOwn(next, 'groupId')) next.groupId = null;
  if (!hasOwn(next, 'isOrigin')) next.isOrigin = null;

  // 기본값 보정 (필요 시 overrides)
  for (const [k, v] of Object.entries(defaults || {})) {
    if (!hasOwn(next, k)) next[k] = v;
  }

  // cashflowCode 누락 방지
  if (!hasOwn(next, 'cashflowCode')) {
    next.cashflowCode = next.cashflowItemCode || next.accountId || '';
  }

  return next;
}
