import { formatMoney } from "../common/util.js?v=app-20261010-10";
import { sortItems, getItemProfitValues } from "./item-utils.js?v=app-20261010-10";
import {
  attachSearchInput,
  enableTableArrowNavigation,
  bindClickRowSelect,
} from "../common/ui-helpers.js?v=app-20261010-10";

export function createItemListManager(options) {
  const {
    listEl,
    tableHeaderEl,
    searchInput,
    getItems,
    getItemGroups,
    onSelectItem,
  } =
    options || {};

  let currentSort = { key: "id", direction: "asc" };
  let itemById = new Map();
  let groupCodeByName = new Map();
  let groupLoaded = false;

  async function ensureGroupCodeMap() {
    if (groupLoaded) return;
    groupLoaded = true;
    groupCodeByName = new Map();

    if (typeof getItemGroups !== "function") return;
    try {
      const groups = await getItemGroups();
      (groups || []).forEach((g) => {
        const name = String(g?.name || "").trim();
        const code = String(g?.code || "").trim();
        if (!name || !code) return;
        if (!groupCodeByName.has(name)) groupCodeByName.set(name, code);
      });
    } catch (_) {
      // ignore
    }
  }

  function formatRatePercent(value) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return "0.0";
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function renderList(items, keyword) {
    if (!listEl) return;
    listEl.innerHTML = "";
    itemById = new Map();

    const statusLabel = {
      active: "활성",
      inactive: "중지",
    };

    (items || [])
      .filter((it) => {
        if (!keyword) return true;

        const q = keyword.toLowerCase().trim();
        const id = (it.id || "").toLowerCase();
        const name = (it.name || "").toLowerCase();
        const groupName = String(it.group || "").trim();
        const group = groupName.toLowerCase();
        const groupCode = String(groupCodeByName.get(groupName) || "").toLowerCase();
        const spec = (it.spec || "").toLowerCase();
        const unit = (it.unit || "").toLowerCase();
        const memo = (it.memo || "").toLowerCase();
        const price = String(Number(it.price ?? 0));
        const shrinkPercent = String(Number(it.shrinkPercent ?? 0));
        const shrinkPriceStr = String(Number(it.shrinkPrice ?? 0));
        const saleMargin = String(Number(it.saleMargin ?? 0));
        const salePrice = String(Number(it.salePrice ?? 0));
        const deliveryMargin = String(Number(it.deliveryMargin ?? 0));
        const deliveryPrice = String(Number(it.deliveryPrice ?? 0));
        const {
          saleProfit,
          deliveryProfit,
          saleProfitRateSales,
          deliveryProfitRateSales,
        } = getItemProfitValues(it);
        const avgPrice = Number(it.avgPrice ?? 0) || 0;

        return (
          id.includes(q) ||
          name.includes(q) ||
          group.includes(q) ||
          groupCode.includes(q) ||
          spec.includes(q) ||
          unit.includes(q) ||
          memo.includes(q) ||
          price.includes(q) ||
          shrinkPercent.includes(q) ||
          shrinkPriceStr.includes(q) ||
          saleMargin.includes(q) ||
          String(avgPrice).includes(q) ||
          salePrice.includes(q) ||
          String(saleProfit).includes(q) ||
          String(saleProfitRateSales).includes(q) ||
          deliveryMargin.includes(q) ||
          deliveryPrice.includes(q) ||
          String(deliveryProfit).includes(q) ||
          String(deliveryProfitRateSales).includes(q)
        );
      })
      .forEach((it) => {
        itemById.set(String(it.id || ""), it);
        const {
          saleProfit,
          deliveryProfit,
          saleProfitRateSales,
          deliveryProfitRateSales,
        } = getItemProfitValues(it);

        const tr = document.createElement("tr");
        tr.dataset.id = it.id;
        tr.innerHTML = `
          <td class="col-status">${statusLabel[it.status] || it.status || ""}</td>
          <td class="col-id">${it.id || ""}</td>
          <td class="col-group">${it.group || ""}</td>
          <td class="col-name">${it.name || ""}</td>
          <td class="col-origin">${it.spec || ""}</td>
          <td class="col-unit">${it.unit || ""}</td>
          <td class="col-price right">${formatMoney(it.price ?? 0)}</td>
          <td class="col-shrink-percent right">${formatMoney(it.shrinkPercent ?? 0)}</td>
          <td class="col-shrink-price right">${formatMoney(it.shrinkPrice ?? 0)}</td>
          <td class="col-sale-margin right">${formatMoney(it.saleMargin ?? 0)}</td>
          <td class="col-sale-price right">${formatMoney(it.salePrice ?? 0)}</td>
          <td class="col-sale-profit right">${formatMoney(saleProfit)}</td>
          <td class="col-sale-profit-rate right">${formatRatePercent(saleProfitRateSales)}%</td>
          <td class="col-delivery-margin right">${formatMoney(it.deliveryMargin ?? 0)}</td>
          <td class="col-delivery-price right">${formatMoney(it.deliveryPrice ?? 0)}</td>
          <td class="col-profit-price right">${formatMoney(deliveryProfit)}</td>
          <td class="col-delivery-profit-rate right">${formatRatePercent(deliveryProfitRateSales)}%</td>
        `;
        listEl.appendChild(tr);
      });
  }

  async function reloadList() {
    if (!getItems) return;
    await ensureGroupCodeMap();
    const items = await getItems();
    const keyword = searchInput ? searchInput.value.trim() : "";
    const sorted = sortItems(items, currentSort);
    renderList(sorted, keyword);
  }

  if (listEl) {
    bindClickRowSelect(listEl, {
      rowSelector: 'tr[data-id]',
      onSelect: async (row) => {
        const id = String(row?.dataset?.id || '');
        const item = itemById.get(id);
        if (!item) return;
        if (typeof onSelectItem === 'function') {
          await onSelectItem(item);
        }
      },
    });

    enableTableArrowNavigation(listEl, {
      onSelect: (row) => row.click(),
      enableEnter: true,
    });
  }

  if (searchInput) {
    attachSearchInput(searchInput, () => {
      reloadList();
    });
  }

  if (tableHeaderEl) {
    tableHeaderEl.addEventListener("click", (e) => {
      const th = e.target.closest("th");
      if (!th) return;

      const key = th.dataset.sortKey;
      if (!key) return;

      if (currentSort.key === key) {
        currentSort.direction =
          currentSort.direction === "asc" ? "desc" : "asc";
      } else {
        currentSort.key = key;
        currentSort.direction = "asc";
      }

      reloadList();
    });
  }

  return {
    reloadList,
  };
}

