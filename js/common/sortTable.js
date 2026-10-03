// 공통 테이블 정렬 함수
// list: 정렬할 배열
// key: 정렬 기준 키 (예: 'id', 'name')
// direction: 'asc' | 'desc'
// numericKeys: 숫자로 비교할 키 이름 배열 (예: ['openingBalance'])
export function sortByKey(list, key, direction = 'asc', numericKeys = []) {
  if (!key) return list;

  // 코드(예: 0001, A0001)처럼 보이는 값을 숫자 기준으로 정렬하기 위한 파서
  // - prefix(숫자 앞 문자열) + number(연속 숫자) 형태만 code-like로 취급
  // - suffix(숫자 뒤 추가 문자열)가 있으면 일반 문자열로 fallback
  const parseCodeLike = (value) => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const m = raw.match(/^([^0-9]*)([0-9]+)([^0-9]*)$/);
    if (!m) return null;
    const prefix = (m[1] || '').toLowerCase();
    const digits = m[2] || '';
    const suffix = (m[3] || '').trim();
    // 숫자 뒤에 다른 문자가 붙는 형태(예: 12-3)는 일반 문자열로 처리
    if (suffix) return null;
    const num = Number(digits);
    if (!Number.isFinite(num)) return null;
    return { prefix, num, digitsLen: digits.length, raw };
  };

  const compareCodeLike = (a, b, dir) => {
    const pa = parseCodeLike(a);
    const pb = parseCodeLike(b);
    if (!pa || !pb) return null;

    if (pa.prefix < pb.prefix) return -1 * dir;
    if (pa.prefix > pb.prefix) return 1 * dir;
    if (pa.num < pb.num) return -1 * dir;
    if (pa.num > pb.num) return 1 * dir;
    // 같은 숫자면 자리수(leading zero)까지 고려해 안정적으로 정렬
    if (pa.digitsLen < pb.digitsLen) return -1 * dir;
    if (pa.digitsLen > pb.digitsLen) return 1 * dir;
    if (pa.raw < pb.raw) return -1 * dir;
    if (pa.raw > pb.raw) return 1 * dir;
    return 0;
  };

  const sorted = [...list];
  const dir = direction === 'asc' ? 1 : -1;
  const isNumeric = numericKeys.includes(key);

  sorted.sort((a, b) => {
    let va = a[key];
    let vb = b[key];

    if (isNumeric) {
      va = Number(va ?? 0);
      vb = Number(vb ?? 0);
      return (va - vb) * dir;
    }

    va = (va ?? '').toString().toLowerCase();
    vb = (vb ?? '').toString().toLowerCase();

    // 코드처럼 생긴 값은 숫자 기준으로 정렬(예: 2 < 10, 0002 < 0010)
    const codeCmp = compareCodeLike(va, vb, dir);
    if (codeCmp != null) return codeCmp;

    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  return sorted;
}
