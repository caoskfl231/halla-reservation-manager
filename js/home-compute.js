// Pure worker computation for date filters and period totals by customer.
function pickSummaryLabel(values, hasMissing) {
  const arr = Array.from(values || [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'));

  const uniqueCount = arr.length;
  const totalKinds = uniqueCount + (hasMissing ? 1 : 0);
  if (totalKinds <= 0) return '';

  if (totalKinds === 1) {
    if (uniqueCount === 1) return arr[0];
    return '(미지정)';
  }

  const first = uniqueCount > 0 ? arr[0] : '(미지정)';
  return `${first} 외 ${totalKinds - 1}`;
}

function normalizeDashboardTypeLabel(value) { return String(value || '').trim(); }
function includesIgnoreCase(value, q) { return String(value || '').toLowerCase().includes(String(q).toLowerCase()); }
export function prepareHomeTable(displayRows, homeDashboardFilter, homeSearchQuery, { from = '', to = '' } = {}) {
  displayRows = filterDates(displayRows, from, to);
  const periodLabel = from && to
    ? (from === to ? from : `${from} ~ ${to}`)
    : from ? `${from} 이후` : to ? `${to} 이전` : '전체 기간';
  displayRows.sort((a, b) => {
    const ad = String(a?.date || '');
    const bd = String(b?.date || '');
    if (ad < bd) return 1;
    if (ad > bd) return -1;
    return String(a?.type || '').localeCompare(String(b?.type || ''), 'ko');
  });

  // 요약카드/모달 클릭으로 설정된 필터가 있으면 하단 표에만 적용
  let displayForTable = displayRows;
  if (homeDashboardFilter && typeof homeDashboardFilter === 'object') {
    const mode = String(homeDashboardFilter.mode || '').trim();
    if (mode === 'ledger') {
      const name = String(homeDashboardFilter.ledgerName || '').trim();
      displayForTable = (displayRows || []).filter((r) => {
        if (String(r?.__src || '') !== 'ledger') return false;
        if (!name) return true;
        const g = String(r?.group || '').trim();
        const an = String(r?.__ledgerAccountName || '').trim();
        const iname = String(r?.__ledgerItemName || '').trim();
        return g === name || an === name || iname === name;
      });
    } else if (mode === 'ledgerTypeNames') {
      const keywords = Array.isArray(homeDashboardFilter.keywords)
        ? homeDashboardFilter.keywords.map((t) => String(t || '').trim()).filter(Boolean)
        : [];
      if (!keywords.length) {
        displayForTable = [];
      } else {
        displayForTable = (displayRows || []).filter((r) => {
          if (String(r?.__src || '') !== 'ledger') return false;
          const fields = [
            String(r?.group || '').trim(),
            String(r?.__ledgerAccountName || '').trim(),
            String(r?.__ledgerItemName || '').trim(),
          ];
          return keywords.some((kw) => fields.some((f) => f && f.includes(kw)));
        });
      }
    } else if (mode === 'ledgerTypes') {
      const typeCodes = Array.isArray(homeDashboardFilter.typeCodes)
        ? homeDashboardFilter.typeCodes.map((t) => String(t || '').trim()).filter(Boolean)
        : [];
      if (!typeCodes.length) {
        displayForTable = [];
      } else {
        const set = new Set(typeCodes);
        displayForTable = (displayRows || []).filter((r) => {
          if (String(r?.__src || '') !== 'ledger') return false;
          const tc = String(r?.__ledgerTypeCode || '').trim();
          if (tc && set.has(tc)) return true;

          // fallback: 데이터에 typeCode가 직접 들어있는 경우
          const aid = String(r?.__ledgerAccountId || '').trim();
          const cc = String(r?.__ledgerCashflowCode || '').trim();
          const cic = String(r?.__ledgerCashflowItemCode || '').trim();
          return set.has(aid) || set.has(cc) || set.has(cic);
        });
      }
    } else if (mode === 'ledgerType') {
      const typeCode = String(homeDashboardFilter.typeCode || '').trim();
      const typeName = String(homeDashboardFilter.typeName || '').trim();
      displayForTable = (displayRows || []).filter((r) => {
        if (String(r?.__src || '') !== 'ledger') return false;
        if (!typeCode) return true;
        const tc = String(r?.__ledgerTypeCode || '').trim();
        if (tc && tc === typeCode) return true;

        // fallback: 데이터에 typeCode가 직접 들어있는 경우(또는 이름만 남는 경우)
        const aid = String(r?.__ledgerAccountId || '').trim();
        const cc = String(r?.__ledgerCashflowCode || '').trim();
        const cic = String(r?.__ledgerCashflowItemCode || '').trim();
        if (aid === typeCode || cc === typeCode || cic === typeCode) return true;

        if (typeName) {
          const g = String(r?.group || '').trim();
          const an = String(r?.__ledgerAccountName || '').trim();
          const iname = String(r?.__ledgerItemName || '').trim();
          if (g === typeName || an === typeName || iname === typeName) return true;
        }
        return false;
      });
    } else if (mode === 'ledgerAll') {
      displayForTable = (displayRows || []).filter((r) => String(r?.__src || '') === 'ledger');
    } else if (mode === 'types') {
      const types = Array.isArray(homeDashboardFilter.types) ? homeDashboardFilter.types.map((t) => String(t || '').trim()).filter(Boolean) : [];
      if (!types.length) {
        displayForTable = displayRows;
      } else {
        const set = new Set(types);
        displayForTable = (displayRows || []).filter((r) => set.has(String(r?.type || '').trim()));
      }
    } else {
      const t = normalizeDashboardTypeLabel(homeDashboardFilter.type);
      const g = String(homeDashboardFilter.group || '').trim();
      const col = String(homeDashboardFilter.column || '').trim();
      displayForTable = (displayRows || []).filter((r) => {
        if (t && String(r?.type || '').trim() !== t) return false;
        if (g && String(r?.group || '').trim() !== g) return false;
        if (col) {
          const v = Number(r && r[col] != null ? r[col] : 0) || 0;
          if (!(v > 0)) return false;
        }
        return true;
      });
    }
  }

  // 전역 검색(홈): 거래처/분류/구분/날짜 등 텍스트 기준 필터
  const q = String(homeSearchQuery || '').trim().toLowerCase();
  if (q) {
    displayForTable = (displayForTable || []).filter((r) => {
      return (
        includesIgnoreCase(r?.vendor, q) ||
        includesIgnoreCase(r?.group, q) ||
        includesIgnoreCase(r?.type, q) ||
        includesIgnoreCase(r?.date, q)
      );
    });
  }

  // 선택한 조회 기간의 거래를 거래처별 한 줄로 합산한다.
  const aggregatedByVendor = new Map();
  (displayForTable || []).forEach((r) => {
    if (!r) return;
    const vendorKey = String(r.vendor || '').trim() || '(미지정)';
    const key = vendorKey;
    if (!aggregatedByVendor.has(key)) {
      aggregatedByVendor.set(key, {
        date: periodLabel,
        type: '',
        code: '',
        __types: new Set(),
        group: '',
        vendor: vendorKey,
        __supplierIds: new Set(),
        __groups: new Set(),
        __missingGroup: false,
        sales: 0,
        receipt: 0,
        purchase: 0,
        pay: 0,
        expense: 0,
        inn: 0,
        out: 0,
      });
    }
    const acc = aggregatedByVendor.get(key);
    if (r.__supplierId) acc.__supplierIds.add(String(r.__supplierId));
    const sourceType = r.__src === 'ledger' ? '입출금 장부'
      : r.type === '매출' ? '매출처' : r.type === '매입' ? '매입처'
      : r.type === '지출' ? '지출처' : String(r.type || '').trim();
    if (sourceType) acc.__types.add(sourceType);
    const g = String(r.group || '').trim();
    if (g) acc.__groups.add(g);
    else acc.__missingGroup = true;
    acc.sales += Number(r.sales || 0) || 0;
    acc.receipt += Number(r.receipt || 0) || 0;
    acc.purchase += Number(r.purchase || 0) || 0;
    acc.pay += Number(r.pay || 0) || 0;
    acc.expense += Number(r.expense || 0) || 0;
    acc.inn += Number(r.inn || 0) || 0;
    acc.out += Number(r.out || 0) || 0;
  });

  // 합계행의 분류는 실제 데이터 기반으로 요약 표시
  for (const acc of aggregatedByVendor.values()) {
    const groupLabel = pickSummaryLabel(acc.__groups, acc.__missingGroup);
    acc.__supplierIds = Array.from(acc.__supplierIds);
    acc.code = [...acc.__supplierIds].sort((a, b) => a.localeCompare(b, 'ko')).join(', ');
    const typeOrder = ['매출처', '매입처', '지출처', '입출금 장부'];
    acc.type = Array.from(acc.__types).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b)).join(' / ') || '(미지정)';
    delete acc.__types;
    acc.group = groupLabel || '(미지정)';
    delete acc.__groups;
    delete acc.__missingGroup;
  }

  // 날짜가 합산되므로 거래처 이름 순서로 표시한다.
  displayForTable = Array.from(aggregatedByVendor.values()).sort((a, b) => {
    return String(a?.vendor || '').localeCompare(String(b?.vendor || ''), 'ko');
  });

  return displayForTable;
}
export function filterDates(rows, from, to, sorted=false) {
 const selected=rows.filter(r => (!from || String(r.date || '') >= from) && (!to || String(r.date || '') <= to));
 return sorted ? selected.sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''),'ko')) : selected;
}
export function computeJob({kind, rows, from, to, sorted, filter, query}) {
 if (kind==='dates') return filterDates(rows,from,to,sorted);
 if (kind==='table') return prepareHomeTable(rows,filter,query,{from,to});
 throw new Error('UNKNOWN_HOME_JOB');
}
