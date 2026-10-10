import { generateItemId } from "./item-utils.js?v=ledger-chunks-20261010-1";
import {
  formatPercent,
  calcShrinkPrice,
  calcPriceFromMargin,
  calcMarginFromPrice,
} from "./price-utils.js?v=ledger-chunks-20261010-1";
import { warningDialog } from "../common/dialogs.js?v=ledger-chunks-20261010-1";

export function createItemFormManager(options) {
  const DEFAULT_SHRINK_PERCENT = 10;
  const DEFAULT_SALE_MARGIN = 60;
  const DEFAULT_DELIVERY_MARGIN = 35;

  const {
    formEl,
    idModeSelect,
    idInput,
    groupSelect,
    groupInput,
    groupInputRow,
    nameInput,
    specInput,
    unitInput,
    priceInput,
    shrinkPercentInput,
    shrinkPriceInput,
    avgPriceInput,
    saleMarginInput,
    salePriceInput,
    deliveryMarginInput,
    deliveryPriceInput,
    statusInput,
    memoInput,
    getItems,
    addItemMaster,
    updateItem,
    renameItem,
    onPreviewNextId,
    onReloadList,
    onCloseModal,
    onDirtyMark,
    getSubmitMode,
    onAfterSubmit,
  } = options || {};

  let currentEditingId = null;

  function loadToForm(item) {
    currentEditingId = item.id;

    if (idModeSelect) idModeSelect.value = "manual";
    if (idInput) {
      idInput.readOnly = false;
      idInput.value = item.id || "";
    }

    if (groupInput) groupInput.value = item.group || "";
    if (groupSelect) {
      const value = item.group || "";
      const hasOption = Array.from(groupSelect.options || []).some(
        (opt) => opt.value === value,
      );
      groupSelect.value = hasOption ? value : "";
    }
    if (groupInputRow) groupInputRow.classList.add("is-hidden");

    if (nameInput) nameInput.value = item.name || "";
    if (specInput) specInput.value = item.spec || "";
    if (unitInput) unitInput.value = item.unit || "";
    if (priceInput) priceInput.value = item.price ?? 0;
    if (shrinkPercentInput)
      shrinkPercentInput.value = formatPercent(item.shrinkPercent ?? 0);
    if (shrinkPriceInput) shrinkPriceInput.value = item.shrinkPrice ?? 0;
    if (avgPriceInput) avgPriceInput.value = item.avgPrice ?? 0;
    if (saleMarginInput)
      saleMarginInput.value = formatPercent(item.saleMargin ?? 0);
    if (salePriceInput) salePriceInput.value = item.salePrice ?? 0;
    if (deliveryMarginInput)
      deliveryMarginInput.value = formatPercent(item.deliveryMargin ?? 0);
    if (deliveryPriceInput) deliveryPriceInput.value = item.deliveryPrice ?? 0;
    if (statusInput) statusInput.value = item.status || "active";
    if (memoInput) memoInput.value = item.memo || "";

    // 기존에 등록된 품목이라도 감량율/마진율이 비어있거나 0이면 기본값을 채운다.
    // (이미 값이 있는 품목은 그대로 유지)
    if (shrinkPercentInput) {
      const v = Number(shrinkPercentInput.value || "0");
      if (!Number.isFinite(v) || v <= 0) {
        shrinkPercentInput.value = formatPercent(DEFAULT_SHRINK_PERCENT);
      }
    }
    if (saleMarginInput) {
      const v = Number(saleMarginInput.value || "0");
      if (!Number.isFinite(v) || v <= 0) {
        saleMarginInput.value = formatPercent(DEFAULT_SALE_MARGIN);
      }
    }
    if (deliveryMarginInput) {
      const v = Number(deliveryMarginInput.value || "0");
      if (!Number.isFinite(v) || v <= 0) {
        deliveryMarginInput.value = formatPercent(DEFAULT_DELIVERY_MARGIN);
      }
    }

    // 저장된 가격/원가 조합에 따라 마진율이 음수가 될 수도 있다.
    // 기존에는 음수 마진을 표시하지 않아 '계산이 안 맞는' 것처럼 보일 수 있으므로
    // 폼 로딩 시 현재 값 기준으로 마진율을 동기화한다(저장 전 화면 표시만).
    recalcMarginFromSaleAndDeliveryPrice();
  }

  function resetForm(resetOptions) {
    const { skipDirtyMark = false } = resetOptions || {};
    currentEditingId = null;
    if (formEl) formEl.reset();
    if (statusInput) statusInput.value = "active";
    if (groupSelect) groupSelect.value = "";
    if (groupInput) groupInput.value = "";
    if (groupInputRow) groupInputRow.classList.add("is-hidden");
    if (priceInput) priceInput.value = 0;
    if (shrinkPercentInput)
      shrinkPercentInput.value = formatPercent(DEFAULT_SHRINK_PERCENT);
    if (shrinkPriceInput) shrinkPriceInput.value = 0;
    if (avgPriceInput) avgPriceInput.value = 0;
    if (saleMarginInput) saleMarginInput.value = formatPercent(DEFAULT_SALE_MARGIN);
    if (salePriceInput) salePriceInput.value = 0;
    if (deliveryMarginInput)
      deliveryMarginInput.value = formatPercent(DEFAULT_DELIVERY_MARGIN);
    if (deliveryPriceInput) deliveryPriceInput.value = 0;
    if (idInput) idInput.value = "";
    if (idModeSelect) idModeSelect.value = "auto";
    if (idInput) idInput.readOnly = true;
    if (!skipDirtyMark && typeof onDirtyMark === "function") {
      onDirtyMark();
    }
  }

  function restoreForContinue(preserved) {
    const {
      group = "",
      spec = "",
      unit = "",
      status = "active",
    } = preserved || {};

    if (statusInput) statusInput.value = status || "active";

    if (groupInput) groupInput.value = group;
    if (groupSelect) {
      const hasOption = Array.from(groupSelect.options || []).some(
        (opt) => opt.value === group,
      );
      groupSelect.value = hasOption ? group : "";
    }
    if (groupInputRow) groupInputRow.classList.add("is-hidden");

    if (specInput) specInput.value = spec;
    if (unitInput) unitInput.value = unit;
  }

  function recalcShrinkPrice() {
    if (!priceInput || !shrinkPercentInput || !shrinkPriceInput) return;
    const price = Number(priceInput.value || "0");
    const percent = Number(shrinkPercentInput.value || "0");

    if (!Number.isFinite(price) || !Number.isFinite(percent)) return;

    shrinkPriceInput.value = calcShrinkPrice(price, percent);

    recalcSaleAndDeliveryPrice();
  }

  function getPricingBase() {
    // 품목관리 폼의 소매/납품가 계산 기준은 평균가(avgPrice)가 아니라
    // 감량원가(감량율 기반) 또는 매입가를 사용한다.
    const price = Number(priceInput?.value || "0");
    const percent = Number(shrinkPercentInput?.value || "0");
    const shrink = Number(shrinkPriceInput?.value || "0");
    if (Number.isFinite(shrink) && shrink > 0) return shrink;
    const derived = calcShrinkPrice(price, percent);
    if (Number.isFinite(derived) && derived > 0) return derived;
    if (Number.isFinite(price) && price > 0) return price;
    return 0;
  }

  function recalcSaleAndDeliveryPrice() {
    if (!priceInput || !shrinkPriceInput) return;
    const costBase = getPricingBase();

    if (saleMarginInput && salePriceInput) {
      const saleMargin = Number(saleMarginInput.value || "0");
      const v = calcPriceFromMargin(costBase, saleMargin);
      if (Number.isFinite(v) && v >= 0) {
        salePriceInput.value = v;
      }
    }

    if (deliveryMarginInput && deliveryPriceInput) {
      const deliveryMargin = Number(deliveryMarginInput.value || "0");
      const v = calcPriceFromMargin(costBase, deliveryMargin);
      if (Number.isFinite(v) && v >= 0) {
        deliveryPriceInput.value = v;
      }
    }
  }

  function recalcMarginFromSaleAndDeliveryPrice() {
    if (!priceInput || !shrinkPriceInput) return;
    const costBase = getPricingBase();
    if (costBase <= 0) return;

    if (salePriceInput && saleMarginInput) {
      const salePrice = Number(salePriceInput.value || "0");
      const m = calcMarginFromPrice(costBase, salePrice);
      if (Number.isFinite(m)) {
        saleMarginInput.value = formatPercent(Math.max(0, m));
      }
    }

    if (deliveryPriceInput && deliveryMarginInput) {
      const deliveryPrice = Number(deliveryPriceInput.value || "0");
      const m = calcMarginFromPrice(costBase, deliveryPrice);
      if (Number.isFinite(m)) {
        deliveryMarginInput.value = formatPercent(Math.max(0, m));
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const items = await getItems();

    const name = nameInput?.value.trim() || "";
    const group = groupSelect?.value.trim() || "";
    const spec = specInput?.value.trim() || "";
    const unit = unitInput?.value.trim() || "";

    if (!name) {
      await warningDialog("품목명을 입력하세요.");
      nameInput?.focus();
      return;
    }
    if (!group) {
      await warningDialog("분류를 선택하세요. (분류 추가/수정은 왼쪽 분류에서 하세요)");
      groupSelect?.focus();
      return;
    }
    if (!spec) {
      await warningDialog("원산지를 입력하세요.");
      specInput?.focus();
      return;
    }
    if (!unit) {
      await warningDialog("단위를 입력하세요.");
      unitInput?.focus();
      return;
    }

    const inputId = (idInput?.value || "").trim();
    const item = {
      id: inputId,
      group,
      name,
      spec,
      unit,
      status: statusInput?.value,
      price: Number(priceInput?.value || "0"),
      shrinkPercent: Number(shrinkPercentInput?.value || "0"),
      shrinkPrice: Number(shrinkPriceInput?.value || "0"),
      avgPrice: Number(avgPriceInput?.value || "0"),
      saleMargin: Number(saleMarginInput?.value || "0"),
      salePrice: Number(salePriceInput?.value || "0"),
      deliveryMargin: Number(deliveryMarginInput?.value || "0"),
      deliveryPrice: Number(deliveryPriceInput?.value || "0"),
      memo: memoInput?.value,
    };

    if (!currentEditingId) {
      if (idModeSelect && idModeSelect.value === "manual") {
        if (!item.id) {
          await warningDialog("코드를 입력하세요.");
          idInput?.focus();
          return;
        }
        const exists = items.some((it) => it.id === item.id);
        if (exists) {
          await warningDialog("이미 사용 중인 코드입니다. 다른 코드를 입력하세요.");
          idInput?.focus();
          return;
        }
      } else {
        item.id = generateItemId(items);
      }
      await addItemMaster(item);
    } else {
      if (!item.id) {
        await warningDialog("코드를 입력하세요.");
        idInput?.focus();
        return;
      }
      const others = items.filter((it) => it.id !== currentEditingId);
      const exists = others.some((it) => it.id === item.id);
      if (exists) {
        await warningDialog("이미 사용 중인 코드입니다. 다른 코드를 입력하세요.");
        idInput?.focus();
        return;
      }

      if (item.id !== currentEditingId && typeof renameItem === "function") {
        await renameItem(currentEditingId, item);
        currentEditingId = item.id;
      } else {
        // (키 변경 불가 또는 동일 코드) 일반 업데이트
        item.id = currentEditingId;
        await updateItem(item);
      }
    }

    const submitMode = typeof getSubmitMode === "function" ? getSubmitMode() : "close";

    if (submitMode === "continue") {
      const preserved = {
        idMode: idModeSelect?.value || "auto",
        group: groupInput?.value || "",
        spec: specInput?.value || "",
        unit: unitInput?.value || "",
        status: statusInput?.value || "active",
      };

      resetForm({ skipDirtyMark: true });
      restoreForContinue(preserved);

      if (idModeSelect) idModeSelect.value = preserved.idMode || "auto";
      if (idInput) {
        if (idModeSelect && idModeSelect.value === "manual") {
          idInput.readOnly = false;
          idInput.value = "";
        } else {
          idInput.readOnly = true;
        }
      }

      if (idModeSelect && idModeSelect.value === "auto") {
        if (typeof onPreviewNextId === "function") {
          onPreviewNextId();
        }
      }

      if (typeof onDirtyMark === "function") {
        onDirtyMark();
      }

      if (typeof onReloadList === "function") {
        await onReloadList();
      }

      if (typeof onAfterSubmit === "function") {
        onAfterSubmit("continue");
      }

      nameInput?.focus();
      return;
    }

    resetForm();
    if (typeof onCloseModal === "function") {
      onCloseModal();
    }
    if (typeof onReloadList === "function") {
      await onReloadList();
    }

    if (typeof onAfterSubmit === "function") {
      onAfterSubmit("close");
    }
  }

  if (formEl) {
    formEl.addEventListener("submit", handleSubmit);
  }

  if (priceInput && shrinkPercentInput && shrinkPriceInput) {
    priceInput.addEventListener("input", recalcShrinkPrice);
    shrinkPercentInput.addEventListener("input", recalcShrinkPrice);
  }

  if (shrinkPriceInput && (saleMarginInput || deliveryMarginInput)) {
    shrinkPriceInput.addEventListener("input", recalcSaleAndDeliveryPrice);
  }

  if (saleMarginInput) {
    saleMarginInput.addEventListener("input", recalcSaleAndDeliveryPrice);
  }

  if (deliveryMarginInput) {
    deliveryMarginInput.addEventListener("input", recalcSaleAndDeliveryPrice);
  }

  if (salePriceInput) {
    salePriceInput.addEventListener(
      "input",
      recalcMarginFromSaleAndDeliveryPrice,
    );
  }

  if (deliveryPriceInput) {
    deliveryPriceInput.addEventListener(
      "input",
      recalcMarginFromSaleAndDeliveryPrice,
    );
  }

  if (groupSelect) {
    groupSelect.addEventListener("change", () => {
      if (groupInput) groupInput.value = groupSelect.value || "";
      if (groupInputRow) groupInputRow.classList.add("is-hidden");
      if (typeof onPreviewNextId === "function") {
        onPreviewNextId();
      }
    });
  }

  if (idModeSelect) {
    idModeSelect.addEventListener("change", () => {
      if (idModeSelect.value === "auto") {
        if (idInput) idInput.readOnly = true;
        if (typeof onPreviewNextId === "function") {
          onPreviewNextId();
        }
      } else {
        if (idInput) {
          idInput.readOnly = false;
          idInput.value = "";
          idInput.focus();
        }
      }
    });
    if (idModeSelect.value === "auto" && idInput) {
      idInput.readOnly = true;
    }
  }

  return {
    loadToForm,
    resetForm,
    getCurrentEditingId: () => currentEditingId,
  };
}

