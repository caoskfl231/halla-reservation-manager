import {
  bindClickRowSelect,
  createScrollToBottomOnce,
} from "../common/ui-helpers.js?v=app-20261010-7";

// 목록이 갱신될 때 최신 거래가 보이도록 스크롤(결제관리 패턴 공통화)
const paymentMainAutoScroll = createScrollToBottomOnce();
import { resolveDefaultCashflowNameByCode } from "../common/util.js?v=app-20261010-7";

function normalizeDateKey(tx) {
  const raw = String(tx?.dateTime || tx?.date || "").trim();
  if (!raw) return "";

  // Accept:
  // - YYYY-MM-DD
  // - YYYY-MM-DD HH:mm(:ss)
  // - YYYY/M/D, YYYY.M.D (with optional time)
  const m = raw.match(
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/, 
  );
  if (!m) return raw;

  const y = m[1];
  const mm = String(m[2]).padStart(2, "0");
  const dd = String(m[3]).padStart(2, "0");
  const hh = String(m[4] ?? "00").padStart(2, "0");
  const mi = String(m[5] ?? "00").padStart(2, "0");
  const ss = String(m[6] ?? "00").padStart(2, "0");
  return `${y}-${mm}-${dd} ${hh}:${mi}:${ss}`;
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
  return (
    normalizeYmd(tx.date) ||
    normalizeYmd(tx.dateTime) ||
    ""
  );
}

function compareTxIdAsc(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""), "ko");
}

function compareTxIdDesc(a, b) {
  return -compareTxIdAsc(a, b);
}

export async function renderPaymentMainTable(options = {}) {
  const {
    txAll,
    state,
    cashflowTypes,
    cashflowItems,
    filterCode,
    inRange,
    matchQ,
    stripCodePrefix,
    findCustomerForVendor,
    fmt,
    applyAmountColoring,
    paymentMainCountSpan,
    paymentMainTotalInnSpan,
    paymentMainTotalOutSpan,
    paymentMainTotalBalanceSpan,
    tbody,
    allCustomers,
  } = options;

  if (!Array.isArray(txAll) || !tbody) return;

  const dateFrom = String(state?.dateFrom || "").trim();
  const dateTo = String(state?.dateTo || "").trim();

  const baseFiltered = txAll
    .filter((tx) =>
      state?.methodTab === "all" ? true : tx.paymentMethod === state.methodTab,
    )
    .filter(matchQ);

  let filtered = baseFiltered.filter(inRange);

  if (filterCode) {
    const code = String(filterCode || "").trim();
    const typeCodes = new Set(
      (Array.isArray(cashflowTypes) ? cashflowTypes : []).map((t) =>
        String(t.code || "").trim(),
      ),
    );
    const itemTypeByCode = new Map(
      (Array.isArray(cashflowItems) ? cashflowItems : [])
        .filter(Boolean)
        .map((it) => [
          String(it.code || "").trim(),
          String(it.typeCode || "").trim(),
        ]),
    );
    const itemNameByCode = new Map(
      (Array.isArray(cashflowItems) ? cashflowItems : [])
        .filter(Boolean)
        .map((it) => [
          String(it.code || "").trim(),
          String(it.name || "").trim(),
        ]),
    );

    const isTypeCode = typeCodes.has(code) || /^A\d{2}$/.test(code);

    if (isTypeCode) {
      filtered = filtered.filter((tx) => {
        const accountId = String(tx.accountId || "").trim();
        const cashflowCode = String(tx.cashflowCode || "").trim();
        const cashflowItemCode = String(tx.cashflowItemCode || "").trim();

        if (accountId && accountId === code) return true;
        if (cashflowCode && cashflowCode === code) return true;

        const candidateItemCode = cashflowItemCode || cashflowCode || accountId;
        const mappedTypeCode = itemTypeByCode.get(candidateItemCode) || "";
        return mappedTypeCode === code;
      });
    } else {
      const selectedItemNameRaw = itemNameByCode.get(code) || "";
      const selectedItemName =
        typeof stripCodePrefix === "function"
          ? String(stripCodePrefix(selectedItemNameRaw) || "").trim()
          : String(selectedItemNameRaw || "").trim();

      filtered = filtered.filter((tx) => {
        const accountId = String(tx.accountId || "").trim();
        const cashflowCode = String(tx.cashflowCode || "").trim();
        const cashflowItemCode = String(tx.cashflowItemCode || "").trim();
        const txItemNameRaw = String(tx.cashflowItemName || "").trim();
        const txItemName =
          typeof stripCodePrefix === "function"
            ? String(stripCodePrefix(txItemNameRaw) || "").trim()
            : txItemNameRaw;
        return (
          accountId === code ||
          cashflowCode === code ||
          cashflowItemCode === code ||
          (selectedItemName && txItemName && txItemName === selectedItemName)
        );
      });
    }
  }

  const selectedFilterCode = String(filterCode || "").trim();
  const isItemFilterCode = /^A\d{4}$/.test(selectedFilterCode);
  const isTypeFilterCode = /^A\d{2}$/.test(selectedFilterCode);
  const resolveLedgerItemKey = (tx) => {
    if (!tx) return "";
    const cashflowItemCode = String(tx.cashflowItemCode || "").trim();
    if (cashflowItemCode) return cashflowItemCode;
    const cashflowCode = String(tx.cashflowCode || "").trim();
    if (/^A\d{4}$/.test(cashflowCode)) return cashflowCode;
    return "";
  };

  const buildBalKey = (tx) => {
    // 장부목록(항목) 필터일 때는 잔액/이월을 항목 코드 기준으로 계산해야
    // '이월'이 전체 합산으로 보이는 문제를 피할 수 있다.
    if (isItemFilterCode) {
      // 레거시 데이터는 항목 코드가 accountId/name 등에 섞여있을 수 있어
      // 한 화면(필터)에서는 선택한 항목 1개로 잔액이 누적되도록 키를 고정한다.
      return selectedFilterCode || resolveLedgerItemKey(tx) || "__GLOBAL__";
    }

    // 장부구분(타입) 필터일 때는, 표에 여러 장부목록(항목)이 섞여 나오므로
    // 타입(accountId=A01)로 잔액을 누적하면 합산 잔액처럼 보인다.
    // -> 가능한 경우 항목코드를 키로 사용해 장부목록별 잔액이 누적되게 한다.
    if (isTypeFilterCode) {
      const itemKey = resolveLedgerItemKey(tx);
      if (itemKey) return itemKey;
    }

    return tx.accountId != null && tx.accountId !== ""
      ? String(tx.accountId)
      : tx.cashflowCode != null && tx.cashflowCode !== ""
        ? String(tx.cashflowCode)
        : tx.accountName != null && tx.accountName !== ""
          ? String(tx.accountName)
          : "__GLOBAL__";
  };

  const debugTypeFilterBalanceKeysIfNeeded = () => {
    if (!isTypeFilterCode) return;
    // 키가 1개면(정상적으로 한 장부로 귀속) 굳이 출력하지 않는다.
    const counts = new Map();
    const samplesForFallbackToType = [];

    for (const tx of asc) {
      const key = buildBalKey(tx);
      counts.set(key, (counts.get(key) || 0) + 1);

      // 타입 필터에서 key가 타입코드로 잡힌 경우는 보통 항목코드를 못 찾은 레거시/누락 데이터다.
      if (key === selectedFilterCode) {
        const itemKey = resolveLedgerItemKey(tx);
        if (!itemKey) {
          if (samplesForFallbackToType.length < 8) {
            samplesForFallbackToType.push({
              id: tx?.id,
              date: tx?.date,
              dateTime: tx?.dateTime,
              flow: tx?.flow,
              kind: tx?.kind,
              amount: tx?.amount,
              accountId: tx?.accountId,
              cashflowCode: tx?.cashflowCode,
              cashflowItemCode: tx?.cashflowItemCode,
              cashflowItemName: tx?.cashflowItemName,
              accountName: tx?.accountName,
              item: tx?.item,
              vendor: tx?.vendor,
              source: tx?.source,
            });
          }
        }
      }
    }

    if (counts.size <= 1) return;

    const rows = Array.from(counts.entries())
      .map(([key, count]) => ({
        balKey: String(key),
        count,
        isTypeKey: String(key) === selectedFilterCode,
      }))
      .sort((a, b) => b.count - a.count);

    console.groupCollapsed(
      `[payment] 타입(${selectedFilterCode}) 필터에서 잔액 누적 키가 여러 개입니다 (keys=${counts.size}). 국민통장 1개만 있어야 한다면, 아래 fallback 샘플 거래의 cashflowItemCode/date를 확인하세요.`,
    );
    console.table(rows);
    if (samplesForFallbackToType.length) {
      console.log(
        `[payment] 항목코드가 없어 타입(${selectedFilterCode})으로 묶인 거래 샘플(최대 8건):`,
      );
      console.table(samplesForFallbackToType);
    }
    console.groupEnd();
  };

  // 푸터의 "총 잔액"은 화면에 표시되는 잔액(계정별 누적)과 일치하도록,
  // 계정(장부)별 종료 잔액을 합산해서 계산한다.
  // - 필터가 없더라도 openingBalance가 누락되지 않게 한다.
  const openingKeysForTotal = new Set();
  if (!filterCode) {
    for (const tx of baseFiltered) {
      const key = buildBalKey(tx);
      if (key) openingKeysForTotal.add(String(key));
    }

    // 거래가 전혀 없는 경우에도 openingBalance 합계를 보여준다.
    if (openingKeysForTotal.size === 0 && Array.isArray(cashflowItems)) {
      for (const it of cashflowItems) {
        const code = String(it?.code || "").trim();
        if (code) openingKeysForTotal.add(code);
      }
    }
  }

  // openingBalance(기초/이월) 준비
  const openingByItem = new Map();
  const openingByType = new Map();
  if (Array.isArray(cashflowItems)) {
    for (const it of cashflowItems) {
      if (!it) continue;
      const code = String(it.code || "").trim();
      if (!code) continue;
      const opening = Number(it.openingBalance != null ? it.openingBalance : 0) || 0;
      openingByItem.set(code, opening);

      const typeCode = String(it.typeCode || "").trim();
      if (typeCode) {
        const prev = openingByType.get(typeCode) || 0;
        openingByType.set(typeCode, prev + opening);
      }
    }
  }

  const openingForKey = (key) => {
    const k = String(key || "").trim();
    if (!k) return 0;
    if (openingByItem.has(k)) return Number(openingByItem.get(k)) || 0;
    if (openingByType.has(k)) return Number(openingByType.get(k)) || 0;
    return 0;
  };

  // 기간 조회(시작일) 시, 시작일 이전 잔액(이월)을 계산한다.
  // - 이월 = openingBalance + (시작일 이전 거래 누적)
  const carryByAccount = new Map();
  if (dateFrom) {
    // 필터(계정/검색/결제수단)는 그대로 적용, 날짜만 제외
    const baseNoRange = [...baseFiltered];
    if (filterCode) {
      // filterCode 로직을 그대로 재사용하기 위해, 임시로 filtered 로직과 동일한 방식으로 재필터링
      // (중복 코드를 피하려면 구조 변경이 커져서, 여기서는 최소 변경으로 유지)
      let temp = baseNoRange;
      const code = String(filterCode || "").trim();
      const typeCodes = new Set(
        (Array.isArray(cashflowTypes) ? cashflowTypes : []).map((t) =>
          String(t.code || "").trim(),
        ),
      );
      const itemTypeByCode = new Map(
        (Array.isArray(cashflowItems) ? cashflowItems : [])
          .filter(Boolean)
          .map((it) => [
            String(it.code || "").trim(),
            String(it.typeCode || "").trim(),
          ]),
      );
      const itemNameByCode = new Map(
        (Array.isArray(cashflowItems) ? cashflowItems : [])
          .filter(Boolean)
          .map((it) => [
            String(it.code || "").trim(),
            String(it.name || "").trim(),
          ]),
      );
      const isTypeCode = typeCodes.has(code) || /^A\d{2}$/.test(code);
      if (isTypeCode) {
        temp = temp.filter((tx) => {
          const accountId = String(tx.accountId || "").trim();
          const cashflowCode = String(tx.cashflowCode || "").trim();
          const cashflowItemCode = String(tx.cashflowItemCode || "").trim();

          if (accountId && accountId === code) return true;
          if (cashflowCode && cashflowCode === code) return true;

          const candidateItemCode = cashflowItemCode || cashflowCode || accountId;
          const mappedTypeCode = itemTypeByCode.get(candidateItemCode) || "";
          return mappedTypeCode === code;
        });
      } else {
        const selectedItemNameRaw = itemNameByCode.get(code) || "";
        const selectedItemName =
          typeof stripCodePrefix === "function"
            ? String(stripCodePrefix(selectedItemNameRaw) || "").trim()
            : String(selectedItemNameRaw || "").trim();

        temp = temp.filter((tx) => {
          const accountId = String(tx.accountId || "").trim();
          const cashflowCode = String(tx.cashflowCode || "").trim();
          const cashflowItemCode = String(tx.cashflowItemCode || "").trim();
          const txItemNameRaw = String(tx.cashflowItemName || "").trim();
          const txItemName =
            typeof stripCodePrefix === "function"
              ? String(stripCodePrefix(txItemNameRaw) || "").trim()
              : txItemNameRaw;

          return (
            accountId === code ||
            cashflowCode === code ||
            cashflowItemCode === code ||
            (selectedItemName && txItemName && txItemName === selectedItemName)
          );
        });
      }

      // temp 목록으로 carry 계산
      for (const tx of temp) {
        const d = ymdFromTx(tx);
        if (!d || d >= dateFrom) continue;
        const balKey = buildBalKey(tx);
        if (!carryByAccount.has(balKey)) {
          carryByAccount.set(balKey, openingForKey(balKey));
        }
        const prev = Number(carryByAccount.get(balKey)) || 0;
        const amount = Number(tx.amount) || 0;
        const next = tx.flow === "in" ? prev + amount : prev - amount;
        carryByAccount.set(balKey, next);
      }
    } else {
      for (const tx of baseNoRange) {
        const d = ymdFromTx(tx);
        if (!d || d >= dateFrom) continue;
        const balKey = buildBalKey(tx);
        if (!carryByAccount.has(balKey)) {
          carryByAccount.set(balKey, openingForKey(balKey));
        }
        const prev = Number(carryByAccount.get(balKey)) || 0;
        const amount = Number(tx.amount) || 0;
        const next = tx.flow === "in" ? prev + amount : prev - amount;
        carryByAccount.set(balKey, next);
      }
    }

    // 시작일 이전 거래가 하나도 없더라도, 계정 필터가 있으면 openingBalance만이라도 보여준다.
    if (filterCode && carryByAccount.size === 0) {
      const code = String(filterCode || "").trim();
      const opening = openingForKey(code);
      if (opening) {
        carryByAccount.set(code, opening);
      }
    }
  }

  const computeCarryDisplay = () => {
    if (!dateFrom) return 0;

    // 1) 장부목록(항목) 필터면 해당 항목의 이월만
    if (filterCode && isItemFilterCode) {
      return carryByAccount.has(selectedFilterCode)
        ? Number(carryByAccount.get(selectedFilterCode)) || 0
        : openingForKey(selectedFilterCode);
    }

    // 2) 장부구분(타입) 필터면(또는 기타 필터 코드) carryByAccount 누적 합
    if (filterCode) {
      if (carryByAccount.size) {
        let sum = 0;
        for (const v of carryByAccount.values()) sum += Number(v) || 0;
        return sum;
      }
      return openingForKey(filterCode);
    }

    // 3) 필터가 없으면: 화면의 검색/결제수단 필터(baseFiltered)는 적용하고,
    // 시작일 이전 전체 거래의 순증감만 이월로 표시(여러 장부 키 합산/중복 문제 회피)
    let sum = 0;
    for (const tx of baseFiltered) {
      const d = ymdFromTx(tx);
      if (!d || d >= dateFrom) continue;
      const amount = Number(tx.amount) || 0;
      sum += tx.flow === "in" ? amount : -amount;
    }
    return sum;
  };

  // 1) 날짜/시간 기준으로 안정적인 정렬(포맷 혼재 대비)
  // 2) 잔액은 반드시 과거→현재(asc) 순서로 누적 계산한다.
  const asc = [...filtered].sort((a, b) => {
    const ka = normalizeDateKey(a);
    const kb = normalizeDateKey(b);

    if (ka && kb) {
      const d = ka.localeCompare(kb, "ko");
      if (d) return d;
    } else if (ka && !kb) {
      return 1;
    } else if (!ka && kb) {
      return -1;
    }

    // 같은 날짜(또는 날짜 없음)에서는 id를 숫자 우선으로 정렬
    return compareTxIdAsc(a?.id, b?.id);
  });
  const desc = asc.slice().reverse();
  tbody.innerHTML = "";

  // 행 선택(하이라이트) 공통 위임: 렌더링마다 호출돼도 가드로 1회만 바인딩된다.
  bindClickRowSelect(tbody, {
    rowSelector: 'tr',
  });

  const cfItemMap = new Map();
  if (Array.isArray(cashflowItems)) {
    cashflowItems.forEach((it) => {
      if (!it || it.code == null) return;
      cfItemMap.set(String(it.code), it);
    });
  }

  const cfTypeMap = new Map();
  if (Array.isArray(cashflowTypes)) {
    cashflowTypes.forEach((t) => {
      if (!t || t.code == null) return;
      cfTypeMap.set(String(t.code), t);
    });
  }

  const cfItemsByTypeCode = new Map();
  if (Array.isArray(cashflowItems)) {
    for (const it of cashflowItems) {
      if (!it) continue;
      const tCode = String(it.typeCode || "").trim();
      if (!tCode) continue;
      const arr = cfItemsByTypeCode.get(tCode) || [];
      arr.push(it);
      cfItemsByTypeCode.set(tCode, arr);
    }
  }

  const transferByGroupId = new Map();
  const transferByHeuristicKey = new Map();
  const transferByDateAmtMemoKey = new Map();
  const transferByDateAmtKey = new Map();
  if (Array.isArray(txAll)) {
    for (const tx of txAll) {
      if (!tx || tx.kind !== "이체") continue;

      const dateKey = String(tx.date || "").trim();
      const amtKey = String(Math.abs(Number(tx.amount) || 0));
      const vendorKey = String(tx.vendor || "").trim();
      const memoKeyRaw = String(tx.memo || tx.entryMemo || "").trim();
      const memoKey = memoKeyRaw.replace(/^\[[^\]]+\]\s*/, "");
      const heuristicKey = `${dateKey}__${amtKey}__${vendorKey}__${memoKey}`;
      if (dateKey && amtKey && vendorKey) {
        const rec2 = transferByHeuristicKey.get(heuristicKey) || {};
        if (tx.flow === "in") rec2.in = (rec2.in || []).concat([tx]);
        if (tx.flow === "out") rec2.out = (rec2.out || []).concat([tx]);
        transferByHeuristicKey.set(heuristicKey, rec2);
      }

      // 레거시(수기 이체 등): vendor/item이 양쪽에서 다를 수 있어, 더 느슨한 키도 준비한다.
      // - memo가 있으면 date+amount+memo 우선
      // - memo도 없으면 date+amount(리스크 높지만 마지막 수단)
      if (dateKey && amtKey && memoKey) {
        const k = `${dateKey}__${amtKey}__${memoKey}`;
        const rec3 = transferByDateAmtMemoKey.get(k) || {};
        if (tx.flow === "in") rec3.in = (rec3.in || []).concat([tx]);
        if (tx.flow === "out") rec3.out = (rec3.out || []).concat([tx]);
        transferByDateAmtMemoKey.set(k, rec3);
      }
      if (dateKey && amtKey) {
        const k2 = `${dateKey}__${amtKey}`;
        const rec4 = transferByDateAmtKey.get(k2) || {};
        if (tx.flow === "in") rec4.in = (rec4.in || []).concat([tx]);
        if (tx.flow === "out") rec4.out = (rec4.out || []).concat([tx]);
        transferByDateAmtKey.set(k2, rec4);
      }

      const gid = String(tx.groupId || "").trim();
      if (!gid) continue;
      const rec = transferByGroupId.get(gid) || {};
      if (tx.flow === "in") rec.in = tx;
      if (tx.flow === "out") rec.out = tx;
      transferByGroupId.set(gid, rec);
    }
  }

  const findTransferPeer = (tx) => {
    if (!tx || tx.kind !== "이체") return null;

    // 1) groupId 짝(정상 데이터)
    const gid = String(tx.groupId || "").trim();
    if (gid) {
      const rec = transferByGroupId.get(gid);
      if (rec) {
        return tx.flow === "out" ? rec.in || null : rec.out || null;
      }
    }

    // 2) groupId 없는 레거시 데이터: 휴리스틱으로 짝 찾기
    const dateKey = String(tx.date || "").trim();
    const amtKey = String(Math.abs(Number(tx.amount) || 0));
    const vendorKey = String(tx.vendor || "").trim();
    const memoKeyRaw = String(tx.memo || tx.entryMemo || "").trim();
    const memoKey = memoKeyRaw.replace(/^\[[^\]]+\]\s*/, "");
    const heuristicKey = `${dateKey}__${amtKey}__${vendorKey}__${memoKey}`;

    const selfId = tx.id != null ? String(tx.id) : "";
    const selfAccountId = String(tx.accountId || "").trim();
    const selfItemCode = String(tx.cashflowItemCode || tx.cashflowCode || "").trim();
    const selfMemo = memoKey;
    const selfVendor = vendorKey;
    const selfItemSeed = String(tx.item || "").trim();

    const pickBestPeer = (list) => {
      if (!Array.isArray(list) || !list.length) return null;

      const candidates = list.filter((p) => {
        if (!p) return false;
        if (!selfId) return true;
        const pid = p.id != null ? String(p.id) : "";
        return !pid || pid !== selfId;
      });
      if (!candidates.length) return null;

      let best = null;
      let bestScore = -1;
      for (const p of candidates) {
        let score = 0;
        const pAccountId = String(p.accountId || "").trim();
        const pItemCode = String(p.cashflowItemCode || p.cashflowCode || "").trim();
        const pMemoRaw = String(p.memo || p.entryMemo || "").trim();
        const pMemo = pMemoRaw.replace(/^\[[^\]]+\]\s*/, "");
        const pVendor = String(p.vendor || "").trim();
        const pItem = String(p.item || "").trim();

        if (selfAccountId && pAccountId && selfAccountId !== pAccountId) score += 5;
        if (selfItemCode && pItemCode && selfItemCode !== pItemCode) score += 3;
        if (selfMemo && pMemo && selfMemo === pMemo) score += 2;

        if (selfVendor && pVendor && selfVendor === pVendor) score += 1;
        if (selfItemSeed && pVendor && selfItemSeed === pVendor) score += 1;
        if (selfVendor && pItem && selfVendor === pItem) score += 1;

        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }

      // 느슨한 키(date+amount 등)에서는 충돌이 있을 수 있으므로,
      // 여러 후보가 있는데도 구분 단서가 전혀 없으면(peer를 잘못 잡을 리스크)
      // peer를 확정하지 않고 null로 돌려 fallback 라벨 표시를 사용한다.
      if (candidates.length > 1 && bestScore <= 0) return null;

      return best || candidates[0] || null;
    };

    // 2-1) 가장 엄격한 키(date+amount+vendor+memo)
    const bucket1 = transferByHeuristicKey.get(heuristicKey);
    if (bucket1) {
      const list1 = tx.flow === "out" ? bucket1.in : bucket1.out;
      const picked1 = pickBestPeer(list1);
      if (picked1) return picked1;
    }

    // 2-2) vendor가 양쪽에서 다를 수 있는 케이스(date+amount+memo)
    if (dateKey && amtKey && memoKey) {
      const k = `${dateKey}__${amtKey}__${memoKey}`;
      const bucket2 = transferByDateAmtMemoKey.get(k);
      if (bucket2) {
        const list2 = tx.flow === "out" ? bucket2.in : bucket2.out;
        const picked2 = pickBestPeer(list2);
        if (picked2) return picked2;
      }
    }

    // 2-3) 마지막 수단(date+amount)
    if (dateKey && amtKey) {
      const k2 = `${dateKey}__${amtKey}`;
      const bucket3 = transferByDateAmtKey.get(k2);
      if (bucket3) {
        const list3 = tx.flow === "out" ? bucket3.in : bucket3.out;
        const picked3 = pickBestPeer(list3);
        if (picked3) return picked3;
      }
    }

    return null;
  };

  const resolveLedgerItemLabelForTx = (tx) => {
    if (!tx) return "";
    const explicitItemName = String(tx.cashflowItemName || "").trim();
    if (explicitItemName) return explicitItemName;

    const preferredItemCode = String(
      tx.cashflowItemCode || tx.cashflowCode || "",
    ).trim();
    if (preferredItemCode && cfItemMap.size && cfItemMap.has(preferredItemCode)) {
      const it = cfItemMap.get(preferredItemCode);
      return String(it?.name || it?.code || "").trim();
    }

    // 레거시 이체 등에서 cashflowCode/accountId가 "구분 코드(A01)"로만 남아있는 경우:
    // - 해당 타입 아래 항목이 1개면 그 항목을 표시
    // - 여러 개인데 항목을 특정할 단서가 없으면(구분명으로 뭉뚱그리기 방지) 빈 값으로 돌려
    //   호출부에서 tx.item/vendor 등 더 구체적인 값으로 fallback 하게 한다.
    const typeCodeCandidate = String(tx.accountId || tx.cashflowCode || "").trim();
    if (/^A\d{2}$/.test(typeCodeCandidate)) {
      const list = cfItemsByTypeCode.get(typeCodeCandidate) || [];
      if (list.length === 1) {
        const only = list[0];
        return String(only?.name || only?.code || "").trim();
      }

      const seedRaw = String(tx.accountName || "").trim();
      const seed =
        typeof stripCodePrefix === "function"
          ? String(stripCodePrefix(seedRaw) || "").trim()
          : seedRaw;
      if (seed) {
        const matches = list.filter((it) => {
          const nRaw = String(it?.name || "").trim();
          const n =
            typeof stripCodePrefix === "function"
              ? String(stripCodePrefix(nRaw) || "").trim()
              : nRaw;
          return n && n === seed;
        });
        if (matches.length === 1) {
          const picked = matches[0];
          return String(picked?.name || picked?.code || "").trim();
        }
      }

      return "";
    }

    const fallback = String(tx.accountName || tx.accountId || "").trim();
    if (!fallback) return "";
    return normalizeMaybeCodeLabel(fallback);
  };

  const resolveLedgerLabelFromCode = (code) => {
    const c = String(code || "").trim();
    if (!c) return "";

    // 1) 장부목록(항목) 코드 우선
    if (cfItemMap && cfItemMap.size && cfItemMap.has(c)) {
      const it = cfItemMap.get(c);
      return String(it?.name || it?.code || c).trim();
    }
    // 2) 장부구분(타입) 코드
    if (cfTypeMap && cfTypeMap.size && cfTypeMap.has(c)) {
      const t = cfTypeMap.get(c);
      return String(t?.name || t?.code || c).trim();
    }
    return resolveDefaultCashflowNameByCode(c) || "";
  };

  const normalizeMaybeCodeLabel = (seed) => {
    const raw = String(seed || "").trim();
    if (!raw) return "";
    const mapped = resolveLedgerLabelFromCode(raw);
    if (mapped) return mapped;
    const stripped =
      typeof stripCodePrefix === "function"
        ? String(stripCodePrefix(raw) || "").trim()
        : raw;
    return stripped || raw;
  };

  let totalInn = 0;
  let totalOut = 0;
  const balanceByAccount = new Map();
  const rowBalanceByTx = new WeakMap();

  const fmtAbs = (n) => fmt(Math.abs(Number(n ?? 0) || 0));

  // 잔액/합계는 asc(시간순) 기준으로 먼저 계산
  asc.forEach((tx) => {
    const amount = Number(tx.amount) || 0;
    if (tx.flow === "in") {
      totalInn += amount;
    } else {
      totalOut += amount;
    }

    const balKey = buildBalKey(tx);

    // 첫 등장 계정은 openingBalance + (시작일 이전 이월)로 초기화
    let prevBal = 0;
    if (balanceByAccount.has(balKey)) {
      prevBal = Number(balanceByAccount.get(balKey)) || 0;
    } else if (dateFrom) {
      prevBal = carryByAccount.has(balKey)
        ? Number(carryByAccount.get(balKey)) || 0
        : openingForKey(balKey);
    } else {
      prevBal = openingForKey(balKey);
    }

    const nextBal = tx.flow === "in" ? prevBal + amount : prevBal - amount;
    balanceByAccount.set(balKey, nextBal);
    rowBalanceByTx.set(tx, nextBal);
  });

  // 진단: 타입 필터에서 누적 키가 여러 개인 경우 원인 거래를 콘솔에 출력
  debugTypeFilterBalanceKeysIfNeeded();

  // 이월 행 표시(기간 조회 시)
  if (dateFrom) {
    const carryDisplay = computeCarryDisplay();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>이월</td>
      <td></td>
      <td>${dateFrom}</td>
      <td></td>
      <td></td>
      <td class="right" data-amount-color="1" data-amount-value="0"></td>
      <td class="right" data-amount-color="1" data-amount-value="0" data-amount-force="minus"></td>
      <td class="right" data-amount-color="1" data-amount-value="${carryDisplay}">${fmt(carryDisplay)}</td>
    `;
    tbody.appendChild(tr);
  }

  // 화면 표시는 시간순(asc)
  asc.forEach((tx) => {
    const tr = document.createElement("tr");

    let ledgerItemLabel = "";

    const explicitItemName = String(tx.cashflowItemName || "").trim();
    const preferredItemCode = String(
      tx.cashflowItemCode || tx.cashflowCode || "",
    ).trim();
    const preferredItem =
      preferredItemCode && cfItemMap.size
        ? cfItemMap.get(preferredItemCode)
        : null;

    if (preferredItem) {
      ledgerItemLabel =
        explicitItemName || preferredItem.name || preferredItem.code || "";
    } else if (tx.cashflowCode && cfItemMap.size) {
      const it = cfItemMap.get(String(tx.cashflowCode));
      if (it) {
        ledgerItemLabel = explicitItemName || it.name || it.code || "";
      }
    }

    if (!ledgerItemLabel) {
      ledgerItemLabel =
        explicitItemName || tx.accountName || tx.accountId || "";
    }

    // 장부명(항목명) 표시 정규화
    // - 코드(A01/A0001)만 들어있는 경우: 마스터 이름으로 매핑
    // - "A01 법인통장" 같은 라벨: 코드 접두 제거
    ledgerItemLabel = normalizeMaybeCodeLabel(ledgerItemLabel);

    let flowLabel = "";
    if (tx.kind === "이체") {
      flowLabel = tx.flow === "out" ? "이체출금" : "이체입금";
    } else if (tx.flow === "in") {
      flowLabel = "입금";
    } else if (tx.flow === "out") {
      flowLabel = "출금";
    }


    const vendorSeed = String(tx.vendor || "").trim();
    const vendorRawLabel = normalizeMaybeCodeLabel(stripCodePrefix(vendorSeed));
    let vendorLabel = vendorRawLabel;

    let customerLabel = "";
    let matchedCustomer = null;
    if (allCustomers && Array.isArray(allCustomers)) {
      if (tx.supplierId) {
        matchedCustomer = allCustomers.find(
          (c) => String(c.id) === String(tx.supplierId),
        );
      } else if (
        tx.source === "purchase" ||
        tx.source === "sales" ||
        tx.source === "expense" ||
        tx.source === "payment"
      ) {
        matchedCustomer = findCustomerForVendor(allCustomers, vendorRawLabel);
      }
    }

    if (matchedCustomer) {
      const baseName = stripCodePrefix(matchedCustomer.name || "");
      const typeRaw = String(matchedCustomer.type || "")
        .split(",")[0]
        .trim();
      const typeName = typeRaw
        ? typeRaw.endsWith("처")
          ? typeRaw
          : `${typeRaw}처`
        : "";

      customerLabel = baseName || vendorRawLabel;
      const baseForVendor = vendorRawLabel || baseName;
      const showTypeTag = tx.source && tx.source !== "payment";
      vendorLabel =
        showTypeTag && typeName
          ? `[${typeName}] ${baseForVendor}`.trim()
          : baseForVendor;
    }

    if (
      tx.kind !== "이체" &&
      (tx.source === "purchase" ||
        tx.source === "sales" ||
        tx.source === "expense")
    ) {
      const entryMemoText = (tx.entryMemo || "").trim();
      const memoText = (tx.memo || "").trim();
      const preferred = entryMemoText || memoText;
      if (preferred) {
        const sourceTag =
          tx.source === "purchase"
            ? "{매입}"
            : tx.source === "sales"
              ? "{매출}"
              : "{지출}";
        vendorLabel = `${sourceTag} ${preferred}`.trim();
      }
    }

    if (tx.source === "payment") {
      if (tx.preferEntryMemo === true) {
        if (tx.kind !== "이체") {
          if (!customerLabel) {
            customerLabel = vendorRawLabel;
          }
        }

        const memoText = (tx.entryMemo || "").trim();
        if (memoText) {
          vendorLabel = memoText;
        } else if (tx.kind !== "이체") {
          vendorLabel = "";
        }
      }
    }

    if (tx.kind === "이체") {
      const peer = findTransferPeer(tx);
      const peerLabel = normalizeMaybeCodeLabel(
        stripCodePrefix(resolveLedgerItemLabelForTx(peer)),
      );
      if (peerLabel) {
        customerLabel = peerLabel;
      } else {
        const counterpartySeed = String(tx.item || "").trim();
        const counterpartyLabel = normalizeMaybeCodeLabel(
          stripCodePrefix(counterpartySeed),
        );
        if (counterpartyLabel) {
          customerLabel = counterpartyLabel;
        }
      }
    }

    if (!customerLabel) customerLabel = vendorLabel || vendorRawLabel;
    if (tx.source !== "payment" && !vendorLabel) {
      vendorLabel = vendorRawLabel || customerLabel;
    }

    const rowBalance = rowBalanceByTx.get(tx) || 0;

    const displayInn = tx.flow === "in" ? fmtAbs(tx.amount) : fmtAbs(0);
    const displayOut = tx.flow === "out" ? fmtAbs(tx.amount) : fmtAbs(0);
    const amountAbs = Math.abs(Number(tx.amount) || 0);
    tr.innerHTML = `
      <td>${flowLabel}</td>
      <td>${ledgerItemLabel}</td>
      <td>${tx.date}</td>
      <td>${customerLabel}</td>
      <td>${vendorLabel}</td>
      <td class="right" data-amount-color="1" data-amount-value="${tx.flow === "in" ? amountAbs : 0}">${displayInn}</td>
      <td class="right" data-amount-color="1" data-amount-value="${tx.flow === "out" ? amountAbs : 0}" data-amount-force="minus">${displayOut}</td>
      <td class="right" data-amount-color="1" data-amount-value="${rowBalance}">${fmt(rowBalance)}</td>
    `;
    if (tx.id !== undefined && tx.id !== null) {
      tr.dataset.id = String(tx.id);
    }
    tbody.appendChild(tr);
  });

  // 최신 거래가 바로 보이도록 스크롤을 아래로 이동
  paymentMainAutoScroll.scroll(tbody);

  if (paymentMainCountSpan) {
    paymentMainCountSpan.textContent = String(desc.length);
  }
  if (paymentMainTotalInnSpan) {
    paymentMainTotalInnSpan.textContent = fmt(totalInn);
    paymentMainTotalInnSpan.dataset.amountColor = "1";
    paymentMainTotalInnSpan.dataset.amountValue = String(totalInn);
    delete paymentMainTotalInnSpan.dataset.amountForce;
  }
  if (paymentMainTotalOutSpan) {
    paymentMainTotalOutSpan.textContent = fmtAbs(totalOut);
    paymentMainTotalOutSpan.dataset.amountColor = "1";
    paymentMainTotalOutSpan.dataset.amountValue = String(totalOut);
    paymentMainTotalOutSpan.dataset.amountForce = "minus";
  }
  if (paymentMainTotalBalanceSpan) {
    const net = totalInn - totalOut;
    let finalBal = net;

    if (filterCode) {
      // 선택된 계정/구분/항목의 종료 잔액
      // - 기간 조회: carry(= opening + 시작일 이전 누적) + 기간 내 net
      // - 전체기간: opening + net
      if (dateFrom) {
        finalBal = computeCarryDisplay() + net;
      } else {
        // 기간 필터가 없어도, 계정/구분 필터에서는 openingBalance를 포함해야
        // 행별 잔액(누적)과 푸터 잔액이 일치한다.
        finalBal = openingForKey(selectedFilterCode) + net;
      }
    } else {
      // 전체 보기(필터 없음): 기간 조회 여부와 상관없이
      // '계정별 종료 잔액'을 합산해서 푸터 잔액을 만든다.
      // (마지막 행 잔액은 특정 계정의 누적일 수 있어, 단순 carry+net은 의미가 달라질 수 있음)
      let sum = 0;
      for (const key of openingKeysForTotal) {
        if (!key) continue;
        if (balanceByAccount.has(key)) {
          sum += Number(balanceByAccount.get(key)) || 0;
          continue;
        }
        if (dateFrom) {
          sum += carryByAccount.has(key)
            ? Number(carryByAccount.get(key)) || 0
            : openingForKey(key);
        } else {
          sum += openingForKey(key);
        }
      }
      finalBal = sum;
    }
    paymentMainTotalBalanceSpan.textContent = fmt(finalBal);
    paymentMainTotalBalanceSpan.dataset.amountColor = "1";
    paymentMainTotalBalanceSpan.dataset.amountValue = String(finalBal);
    delete paymentMainTotalBalanceSpan.dataset.amountForce;
  }

  applyAmountColoring(document);
}

