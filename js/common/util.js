// 공통 유틸 함수 모음 (날짜/숫자/포맷 등)

// 오늘 날짜를 YYYY-MM-DD 문자열로 반환
export function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 날짜(Date 또는 Date로 변환 가능한 값)를 YYYY-MM-DD 문자열로 포맷
export function formatYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 날짜 문자열(YYYY-MM-DD)을 요일 텍스트("(월요일)" 형태)로 변환
export function formatWeekdayLabel(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return '';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `(${days[d.getDay()]}요일)`;
}

// 금액 포맷: 숫자를 로케일에 맞게 1,234 형태 문자열로 변환
export function formatMoney(value, locale = 'ko-KR') {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString(locale) : '0';
}

// 금액/잔액 등 부호에 따른 공통 클래스
// - 음수: amount-minus (빨강)
// - 양수: amount-plus  (파랑)
// - 0/NaN: amount-zero (회색)
export function amountClassBySign(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return 'amount-zero';
  return num < 0 ? 'amount-minus' : 'amount-plus';
}

// 수량 포맷: 소수점이 있으면 2~3자리까지, 없으면 정수로 표시
export function formatQuantity(value, locale = 'ko-KR') {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  const hasDecimal = !Number.isInteger(num);
  return num.toLocaleString(locale, {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: 3,
  });
}

// 문자열/값을 안전하게 숫자로 변환(천 단위 구분 기호 등 제거)
// - 공백 제거, 콤마 제거 후 Number() 적용
// - 변환 실패 시 0 반환
export function parseNumber(value) {
  if (value == null) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// 기간 빠른 선택: key 에 따라 from/to(YYYY-MM-DD)를 계산
// - today, yesterday, thisWeek, lastWeek, thisMonth, lastMonth,
//   thisQuarter, lastQuarter, thisHalf, lastHalf, thisYear, lastYear, all
export function getQuickRange(key) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based
  const d = today.getDate();

  const fmt = (dt) => formatYMD(dt);

  const startOfWeek = (base) => {
    const dt = new Date(base);
    const day = dt.getDay(); // 0=일
    const diff = (day === 0 ? -6 : 1) - day; // 월요일 기준
    dt.setDate(dt.getDate() + diff);
    return dt;
  };

  const startOfMonth = (year, monthIndex) => new Date(year, monthIndex, 1);
  const endOfMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0);

  const quarterIndex = Math.floor(m / 3); // 0~3
  const halfIndex = m < 6 ? 0 : 1; // 0:상반기,1:하반기

  switch (key) {
    case 'today': {
      const t = fmt(today);
      return { from: t, to: t };
    }
    case 'yesterday': {
      const yst = new Date(y, m, d - 1);
      const t = fmt(yst);
      return { from: t, to: t };
    }
    case 'thisWeek': {
      const s = startOfWeek(today);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(today);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = startOfWeek(lastWeekEnd);
      return { from: fmt(lastWeekStart), to: fmt(lastWeekEnd) };
    }
    case 'thisMonth': {
      const s = startOfMonth(y, m);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'lastMonth': {
      const lmYear = m === 0 ? y - 1 : y;
      const lmMonth = m === 0 ? 11 : m - 1;
      const s = startOfMonth(lmYear, lmMonth);
      const e = endOfMonth(lmYear, lmMonth);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'thisQuarter': {
      const qm = quarterIndex * 3;
      const s = startOfMonth(y, qm);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'lastQuarter': {
      let q = quarterIndex - 1;
      let qYear = y;
      if (q < 0) {
        q = 3;
        qYear -= 1;
      }
      const qm = q * 3;
      const s = startOfMonth(qYear, qm);
      const e = endOfMonth(qYear, qm + 2);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'thisHalf': {
      const hm = halfIndex === 0 ? 0 : 6;
      const s = startOfMonth(y, hm);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'lastHalf': {
      let h = halfIndex - 1;
      let hYear = y;
      if (h < 0) {
        h = 1;
        hYear -= 1;
      }
      const hm = h === 0 ? 0 : 6;
      const s = startOfMonth(hYear, hm);
      const e = endOfMonth(hYear, hm + 5);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'thisYear': {
      const s = new Date(y, 0, 1);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'lastYear': {
      const s = new Date(y - 1, 0, 1);
      const e = new Date(y - 1, 11, 31);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

// 거래처/벤더 이름 정규화: 공백/괄호/법인표기를 제거해 비교용 문자열 생성
export function normalizeVendorName(str) {
  return (str || '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/주식회사|\(주\)|㈜/g, '')
    .trim();
}

// 소문자 포함 검색(부분 일치), null/undefined 안전 처리
export function includesIgnoreCase(value, keyword) {
  const q = (keyword || '').toLowerCase().trim();
  if (!q) return true;
  return (value || '').toLowerCase().includes(q);
}

// 통합결제 화면에서 자동 생성된 전표 여부를 메모/소스 정보로 판별
export function isPaymentLinkedTransaction(tx) {
  if (!tx) return false;
  if (String(tx.source || '') === 'payment') return true;
  const memo = String(tx.memo || '').trim();
  return memo.startsWith('[통합결제]') || memo.startsWith('[입출금]');
}

// "A01 법인통장"처럼 앞에 코드가 붙은 라벨에서 코드 부분을 제거
// - 예: "A01 법인통장" -> "법인통장"
// - 예: "A0001 국민은행" -> "국민은행"
// - 예: "B12 카드" -> "카드"
export function stripCodePrefix(label) {
  const text = String(label || '').trim();
  if (!text) return '';
  const m = text.match(/^([A-Z]{1,2}\d{2,})\s+(.+)$/);
  if (m) return m[2];
  return text;
}

// 기본 입출금(장부) 코드에 대한 이름 fallback
// - DB 마스터(cashflow_types/items)가 비어있는 경우에도 최소한의 표시 품질을 보장한다.
// - 예: 'A01' -> '법인통장', 'A0001' -> '법인통장'
export function resolveDefaultCashflowNameByCode(code) {
  const raw = String(code || '');
  if (!raw) return '';

  // 화면/DB에 코드만 남는 경우가 있어 토큰을 강하게 추출한다.
  // - 예: 'A01', 'A01\u00A0', 'A01,', '[입출금] A01' 등
  const token = (raw.match(/[A-Za-z]{1,2}\d{2,4}/) || [])[0] || '';
  const c = token.toUpperCase();
  if (!c) return '';

  const map = {
    // types
    A01: '법인통장',
    A02: '신용카드',
    A03: '체크카드',
    A04: '현금',
    A05: '미수금',
    // items
    A0001: '법인통장',
    A0002: '신용카드',
    A0003: '체크카드',
    A0004: '현금',
    A0005: '미수금',
  };

  return map[c] || '';
}

// 메모 입력값을 Ledger(tx)용 필드로 정규화
// - memo: 표시/검색에 쓰는 문자열
// - entryMemo: 사용자가 입력한 원문(비어있을 수 있음)
// - preferEntryMemo: entryMemo를 우선 표시할지 여부
export function buildLedgerMemoFields(memoText, fallbackMemo = '') {
  const entryMemo = String(memoText || '').trim();
  const memo = entryMemo ? entryMemo : String(fallbackMemo || '').trim();
  return {
    memo,
    entryMemo: entryMemo || '',
    preferEntryMemo: !!entryMemo,
  };
}


// HTML 특수문자 이스케이프 (innerHTML 템플릿에서 안전하게 표시)
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
