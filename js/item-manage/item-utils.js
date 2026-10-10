import { sortByKey } from "../common/sortTable.js?v=app-20261010-16";
import { parseNumber } from "../common/util.js?v=app-20261010-16";
import { calcShrinkPrice, getCostBase } from "./price-utils.js?v=app-20261010-16";

export function generateItemId(existing) {
  const nums = (existing || [])
    .map((it) => Number(it?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(nextNum).padStart(6, "0");
}

export function getNextItemGroupCode(groups) {
  const nums = (groups || [])
    .map((g) => Number(g?.code))
    .filter((n) => Number.isFinite(n) && n > 0);
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(nextNum).padStart(5, "0");
}

export function getItemProfitValues(item) {
  const avgPrice = parseNumber(item?.avgPrice ?? 0) || 0;
  const shrinkPrice = parseNumber(item?.shrinkPrice ?? 0) || 0;
  const price = parseNumber(item?.price ?? 0) || 0;
  const shrinkPercent = parseNumber(item?.shrinkPercent ?? 0) || 0;

  const costBase = getCostBase({ avgPrice, shrinkPrice, price });
  const derivedShrinkPrice =
    shrinkPrice > 0 ? shrinkPrice : calcShrinkPrice(price, shrinkPercent);

  // 품목관리 '이익가'는 감량가(감량원가) 기준으로 본다.
  // 감량가가 없으면 (단가,감량%)로 계산한 값을 사용하고, 그것도 어려우면 기존 costBase로 폴백.
  const profitBase = derivedShrinkPrice > 0 ? derivedShrinkPrice : costBase;

  const salePrice = parseNumber(item?.salePrice ?? 0) || 0;
  const deliveryPrice = parseNumber(item?.deliveryPrice ?? 0) || 0;
  const saleProfit = salePrice - profitBase;
  const deliveryProfit = deliveryPrice - profitBase;
  const saleProfitRateSales =
    salePrice > 0 ? (saleProfit / salePrice) * 100 : 0;
  const deliveryProfitRateSales =
    deliveryPrice > 0 ? (deliveryProfit / deliveryPrice) * 100 : 0;
  return {
    costBase,
    profitBase,
    saleProfit,
    deliveryProfit,
    saleProfitRateSales,
    deliveryProfitRateSales,
  };
}

export function sortItems(items, sortState) {
  if (!sortState?.key) return items;
  const withProfit = (items || []).map((it) => {
    const {
      saleProfit,
      deliveryProfit,
      saleProfitRateSales,
      deliveryProfitRateSales,
    } = getItemProfitValues(it);
    return {
      ...it,
      saleProfit,
      deliveryProfit,
      saleProfitRateSales,
      deliveryProfitRateSales,
    };
  });
  return sortByKey(withProfit, sortState.key, sortState.direction, [
    "price",
    "shrinkPercent",
    "shrinkPrice",
    "saleMargin",
    "salePrice",
    "saleProfit",
    "saleProfitRateSales",
    "deliveryMargin",
    "deliveryPrice",
    "deliveryProfit",
    "deliveryProfitRateSales",
    "avgPrice",
  ]);
}

