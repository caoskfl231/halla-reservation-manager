import {
  getAllLedgerTx,
  getCashflowItems,
  getCashflowTypes,
  putLedgerTx,
} from "../db.js?v=app-20261010-7";
import { ensureLedgerTxKeys } from "./ledger-tx-normalizer.js?v=app-20261010-7";
import { stripCodePrefix } from "./util.js?v=app-20261010-7";

// 결제관리에서 사용하던 백필과 동일 키/버전으로 맞춰, 어느 페이지에서든 1회만 수행되게 한다.
const BACKFILL_CASHFLOW_ITEM_VERSION = "2026-03-14-cashflowItem-repair-v1";
const BACKFILL_CASHFLOW_ITEM_KEY = "payment.backfill.cashflowItem";

let inFlight = false;

export async function repairLedgerTxCashflowItemFieldsIfNeeded({ debug = false } = {}) {
  if (inFlight) return;

  const cleanName = (s) => {
    const n = stripCodePrefix(String(s || "")).trim();
    // 코드만 덩그러니 들어온 값(A05, A0001 등)은 "이름"으로 취급하지 않는다.
    if (/^A\d{2}$/.test(n) || /^A\d{4,}$/.test(n)) return "";
    return n;
  };

  // localStorage로 "1회 실행"을 기록해도, 이후 신규 레코드에 cashflowItemCode 누락이
  // 생길 수 있으므로(과거/레거시/외부 import 등), 필요하면 다시 실행한다.
  // - done 상태면 먼저 빠른 스캔으로 "정말 보정할 게 없는지" 확인
  // - 보정 대상이 없으면 즉시 종료
  if (!debug) {
    let done = null;
    try {
      done = localStorage.getItem(BACKFILL_CASHFLOW_ITEM_KEY);
    } catch {
      done = null;
    }

    if (done === BACKFILL_CASHFLOW_ITEM_VERSION) {
      try {
        const [cashflowItemsRaw, txAllRaw] = await Promise.all([
          getCashflowItems().catch(() => []),
          getAllLedgerTx().catch(() => []),
        ]);

        const cashflowItems = Array.isArray(cashflowItemsRaw) ? cashflowItemsRaw : [];
        const txAll = Array.isArray(txAllRaw) ? txAllRaw : [];
        if (!cashflowItems.length || !txAll.length) return;

        const codeSet = new Set(
          cashflowItems
            .map((it) => String(it?.code || "").trim())
            .filter(Boolean),
        );

        const needsRepair = txAll.some((tx) => {
          if (!tx) return false;
          const rawItemCode = String(tx.cashflowItemCode || "").trim();
          const rawItemName = String(tx.cashflowItemName || "").trim();
          const hasValidItemCode = rawItemCode && codeSet.has(rawItemCode);
          const hasAnyItemName = !!cleanName(rawItemName);
          return !hasValidItemCode || !hasAnyItemName;
        });

        if (!needsRepair) return;
      } catch {
        // 스캔 실패 시에는 안전하게 보정 루틴을 계속 진행한다.
      }
    }
  }

  inFlight = true;
  try {
    const [cashflowItemsRaw, cashflowTypesRaw, txAllRaw] = await Promise.all([
      getCashflowItems().catch(() => []),
      getCashflowTypes().catch(() => []),
      getAllLedgerTx().catch(() => []),
    ]);

    const cashflowItems = Array.isArray(cashflowItemsRaw) ? cashflowItemsRaw : [];
    const cashflowTypes = Array.isArray(cashflowTypesRaw) ? cashflowTypesRaw : [];
    const txAll = Array.isArray(txAllRaw) ? txAllRaw : [];

    if (!cashflowItems.length || !txAll.length) {
      if (!debug) {
        try {
          localStorage.setItem(BACKFILL_CASHFLOW_ITEM_KEY, BACKFILL_CASHFLOW_ITEM_VERSION);
        } catch {
          // ignore
        }
      }
      return;
    }

    const byCode = new Map();
    const byTypeCode = new Map();
    cashflowItems.forEach((it) => {
      if (!it || it.code == null) return;
      const code = String(it.code).trim();
      if (!code) return;
      byCode.set(code, it);
      const tCode = String(it.typeCode || "").trim();
      if (!tCode) return;
      const arr = byTypeCode.get(tCode) || [];
      arr.push(it);
      byTypeCode.set(tCode, arr);
    });

    const typeNameByCode = new Map();
    cashflowTypes.forEach((t) => {
      if (!t || t.code == null) return;
      const c = String(t.code || "").trim();
      if (!c) return;
      typeNameByCode.set(c, String(t.name || "").trim() || c);
    });

    const isTypeCodeLike = (s) => {
      const v = String(s || "").trim();
      return !!v && /^A\d{2}$/.test(v);
    };

    const findUniqueItemByName = (name) => {
      const n = cleanName(name);
      if (!n) return null;
      const matches = cashflowItems.filter((it) => cleanName(it?.name) === n);
      if (matches.length === 1) return matches[0];
      return null;
    };

    let updated = 0;
    let skipped = 0;

    for (const tx of txAll) {
      if (!tx) continue;

      const rawItemCode = String(tx.cashflowItemCode || "").trim();
      const rawItemName = String(tx.cashflowItemName || "").trim();

      const hasValidItemCode = rawItemCode && byCode.has(rawItemCode);
      const hasAnyItemName = !!cleanName(rawItemName);

      // 정상: code도 유효하고 name도 있으면 스킵
      if (hasValidItemCode && hasAnyItemName) continue;

      // code는 유효하지만 name만 비어있으면 name만 채움
      if (hasValidItemCode && !hasAnyItemName) {
        const it = byCode.get(rawItemCode);
        if (it && it.name) {
          tx.cashflowItemName = String(it.name || "").trim();
          try {
            await putLedgerTx(ensureLedgerTxKeys(tx));
            updated += 1;
          } catch {
            skipped += 1;
          }
        }
        continue;
      }

      const txCashflowCode = String(tx.cashflowCode || "").trim();
      const txAccountId = String(tx.accountId || "").trim();
      const txAccountName = String(tx.accountName || "").trim();
      const txAccountNameClean = stripCodePrefix(txAccountName);

      let pickedItem = null;

      // 0) 기존 cashflowItemName 자체가 명확히 매칭되면 우선
      if (!pickedItem && rawItemName) {
        const byName = findUniqueItemByName(rawItemName);
        if (byName) pickedItem = byName;
      }

      // 1) cashflowCode가 항목 코드
      if (txCashflowCode && byCode.has(txCashflowCode)) {
        pickedItem = byCode.get(txCashflowCode);
      }

      // 2) accountId가 항목 코드
      if (!pickedItem && txAccountId && byCode.has(txAccountId)) {
        pickedItem = byCode.get(txAccountId);
      }

      // 3) cashflowCode/accountId가 타입 코드이고 해당 타입의 항목이 1개뿐이면 사용
      if (!pickedItem) {
        const byTypeFromCashflow = byTypeCode.get(txCashflowCode) || [];
        if (byTypeFromCashflow.length === 1) pickedItem = byTypeFromCashflow[0];
      }
      if (!pickedItem) {
        const byTypeFromAccount = byTypeCode.get(txAccountId) || [];
        if (byTypeFromAccount.length === 1) pickedItem = byTypeFromAccount[0];
      }

      // 4) accountName 텍스트로 직접 매칭(유일하게 매칭될 때만)
      if (!pickedItem && txAccountNameClean) {
        const byName = findUniqueItemByName(txAccountNameClean);
        if (byName) pickedItem = byName;
      }

      // 5) 잘못된 타입 코드(A05 등)가 cashflowItemCode로 들어온 케이스
      if (!pickedItem && (isTypeCodeLike(rawItemCode) || isTypeCodeLike(txCashflowCode))) {
        const tCode = isTypeCodeLike(rawItemCode) ? rawItemCode : txCashflowCode;
        const list = byTypeCode.get(String(tCode || "").trim()) || [];
        if (list.length === 1) pickedItem = list[0];
      }

      if (pickedItem) {
        tx.cashflowItemCode = String(pickedItem.code || "").trim();
        tx.cashflowItemName = String(pickedItem.name || "").trim();
        try {
          await putLedgerTx(ensureLedgerTxKeys(tx));
          updated += 1;
        } catch {
          skipped += 1;
        }
        continue;
      }

      // 애매한 케이스는 code를 건드리지 않고 name만 채워 화면 노출을 안정화
      const fallbackTypeName =
        typeNameByCode.get(rawItemCode) ||
        typeNameByCode.get(txAccountId) ||
        typeNameByCode.get(txCashflowCode) ||
        "";

      const fallbackName =
        cleanName(rawItemName) ||
        cleanName(txAccountNameClean) ||
        cleanName(tx.accountName) ||
        cleanName(fallbackTypeName);

      if (fallbackName && !cleanName(tx.cashflowItemName)) {
        tx.cashflowItemName = String(fallbackName).trim();
        try {
          await putLedgerTx(ensureLedgerTxKeys(tx));
          updated += 1;
        } catch {
          skipped += 1;
        }
      }
    }

    if (debug) {
      console.log(
        `[ledger_tx] cashflowItem 보정 완료: updated=${updated}, skipped=${skipped}`,
      );
    }

    if (!debug) {
      try {
        localStorage.setItem(BACKFILL_CASHFLOW_ITEM_KEY, BACKFILL_CASHFLOW_ITEM_VERSION);
      } catch {
        // ignore
      }
    }
  } finally {
    inFlight = false;
  }
}

