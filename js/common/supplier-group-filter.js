// 공통: 거래(전표) 목록에서 거래처 분류(그룹)로 필터링
// - 매입/매출/지출 등 여러 화면에서 동일 로직을 재사용한다.

/**
 * @template T
 * @param {T[]} rows
 * @param {{
 *  enabled?: boolean,
 *  selectedGroupName?: string,
 *  getGroupNameForRow: (row: T) => string,
 * }} options
 * @returns {T[]}
 */
export function applySupplierGroupFilter(rows, options) {
  const list = Array.isArray(rows) ? rows : [];
  const enabled = Boolean(options && options.enabled);
  const target = String(options && options.selectedGroupName ? options.selectedGroupName : '').trim();

  if (!enabled) return list;
  if (!target) return list;
  if (!options || typeof options.getGroupNameForRow !== 'function') return list;

  return list.filter((row) => {
    const name = String(options.getGroupNameForRow(row) || '').trim();
    return name === target;
  });
}
