import { getCashflowItems, getCashflowTypes } from '../db.js?v=app-20261010-4';

let inflightCashflowOptionListPromise = null;

async function fetchCashflowOptionList() {
  // 1순위: 입출금 코드/항목(cashflow_items)
  try {
    const items = await getCashflowItems();
    if (Array.isArray(items) && items.length) {
      return items
        .filter((it) => it && it.code && String(it.status || 'active') === 'active')
        .map((it) => ({ code: String(it.code), name: String(it.name || it.code) }));
    }
  } catch (_) {
    // 무시: 아래 types fallback
  }

  // fallback: 구분 코드(cashflow_types)
  try {
    const types = await getCashflowTypes();
    if (Array.isArray(types) && types.length) {
      return types
        .filter((t) => t && t.code && String(t.status || 'active') === 'active')
        .map((t) => ({ code: String(t.code), name: String(t.name || t.code) }));
    }
  } catch (_) {
    // 무시
  }

  return [];
}

export async function loadCashflowLedgerOptionsIntoSelects(selectElements, { placeholder = '통장 선택' } = {}) {
  const targets = (Array.isArray(selectElements) ? selectElements : [selectElements]).filter(Boolean);
  if (!targets.length) return;

  if (!inflightCashflowOptionListPromise) {
    inflightCashflowOptionListPromise = fetchCashflowOptionList();
  }
  const options = await inflightCashflowOptionListPromise;
  inflightCashflowOptionListPromise = null;
  const html = `<option value="">${placeholder}</option>` +
    options.map((o) => `<option value="${o.code}">${o.name}</option>`).join('');

  for (const sel of targets) {
    const prevValue = String(sel.value || '');
    const prevLabel = prevValue
      ? String(sel.options?.[sel.selectedIndex]?.text || prevValue)
      : '';

    sel.innerHTML = html;

    if (prevValue) {
      const exists = Array.from(sel.options || []).some(
        (o) => String(o.value) === prevValue,
      );
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = prevValue;
        opt.textContent = prevLabel || prevValue;
        sel.appendChild(opt);
      }
      sel.value = prevValue;
    }
  }
}

