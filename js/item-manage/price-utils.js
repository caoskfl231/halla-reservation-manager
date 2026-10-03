export function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function getCostBase({ avgPrice = 0, shrinkPrice = 0, price = 0 } = {}) {
  const avg = Number(avgPrice || 0) || 0;
  const shrink = Number(shrinkPrice || 0) || 0;
  const purchase = Number(price || 0) || 0;
  if (avg > 0) return avg;
  if (shrink > 0) return shrink;
  return purchase;
}

export function calcShrinkPrice(price, percent) {
  const p = Number(price || 0);
  const per = Number(percent || 0);
  if (!Number.isFinite(p) || !Number.isFinite(per)) return 0;
  if (per <= 0 || per >= 100) return p || 0;
  const ratio = 1 - per / 100;
  return Math.round(p / ratio);
}

export function calcPriceFromMargin(base, margin) {
  const b = Number(base || 0);
  const m = Number(margin || 0);
  if (!Number.isFinite(b) || b <= 0) return 0;
  if (!Number.isFinite(m)) return b;
  return Math.round(b * (1 + m / 100));
}

export function calcMarginFromPrice(base, price) {
  const b = Number(base || 0);
  const p = Number(price || 0);
  if (!Number.isFinite(b) || b <= 0) return 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  const ratio = p / b - 1;
  return Math.round(ratio * 10000) / 100; // 소수 둘째 자리까지
}
