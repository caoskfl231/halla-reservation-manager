// 하단 입력 테이블(품목 행) 공통 매니저
// - purchase/sales 화면이 동일 UX(템플릿 + 활성행 view/edit 토글)를 공유하도록 공통화

export function createEntryTableManager(options = {}) {
  const {
    entryBody,
    entryRowTemplate,

    // 상태 접근자(페이지 전역 변수를 유지하면서 공통 매니저가 동기화)
    getPendingEntries,
    getEntryDraftRow,
    setEntryDraftRow,
    getEntryActiveIndex,
    setEntryActiveIndex,

    // 선택행(시각적 선택 유지) - 옵션 제공 시 페이지와 동기화
    getEntrySelectedIndex,
    setEntrySelectedIndex,

    // 페이지별 로직 주입
    buildEmptyEntryDraft,
    getTaxType,
    calculateRowAmounts,
    // 합계액(amount)과 수량(qty)을 입력했을 때 단가를 역산하는 페이지별 로직
    // - 예: 과세/면세 등 taxType에 따른 역산을 페이지에서 결정
    inferUnitPriceFromAmount,
    // 합계액(amount=공급가+세액)을 그대로 유지하면서 공급가/세액/단가를 역산하는 페이지별 로직
    // - 반환값: { unitPrice, supplyAmount, taxAmount }
    inferRowFromAmount,
    normalizeAmount = (n) => Math.abs(Number(n) || 0),
    formatMoney,
    formatQuantity,

    // 선택: 필수값 누락(빈 칸) 표시
    // - 반환: 누락된 field key 배열 (예: ['itemName','spec','unit','qty','unitPrice'])
    // - 빈 행(완전 공란)은 [] 를 반환해 표시하지 않는 패턴을 권장
    getMissingFieldKeys,

    // 활성행 컨트롤 바인딩(페이지에서 itemInput/qtyInput 등 참조 갱신)
    onBindActiveControls,

    // UI 액션 콜백
    onOpenItemPicker,
    onEnterConfirm,
    onAfterRenderActive,
    onUpdateSummary,
    onHistoryPayload,

    // draft 자동 확정(신규행에서 다른 행으로 이동 시)
    getIsBatchEditMode,
    // 신규 입력(draft) 행을 렌더할지 여부(옵션)
    // - 예: 전표/행 수정 모드에서는 false로 두어 빈 신규 입력행이 보이지 않게 할 수 있음
    getShouldRenderDraftRow,
    // draft 행을 숨기는 모드에서, 사용자가 Enter로 '새 행 추가'를 요청했을 때
    // 페이지가 내부 상태(예: showInputRowInBatchEdit)를 켜고 true를 반환하도록 훅 제공
    onRequestRenderDraftRow,
    isDraftFilled,
    onConfirmDraft,

    // 파생값(감량/마진) 계산 모드
    // - 'shrink'(기본): 감량율(%) + 감량가(단가 기준) + 마진(감량가 기준)
    // - 'purchaseCost'(매출 전용): 매입가(원가 단가) + 매입합계(수량×매입가) + 마진(매입가 기준)
    derivedMode = 'shrink',
  } = options;

  if (!entryBody || !entryRowTemplate) {
    return {
      render() {},
      setActiveIndex() {},
      getRowModelByIndex() {
        return null;
      },
      bind() {},
    };
  }

  let isBound = false;
  let selectedIndexInternal = null;
  let activeCellKeyInternal = 'itemName';

  function shouldRenderDraftRow(pendingEntries) {
    const pending = Array.isArray(pendingEntries) ? pendingEntries : [];
    // 완전 빈 목록이면 입력 자체가 불가해지므로 안전장치로 1행은 유지
    if (pending.length === 0) return true;
    if (typeof getShouldRenderDraftRow === 'function') {
      try {
        return !!getShouldRenderDraftRow();
      } catch {
        return true;
      }
    }
    return true;
  }

  function applyMissingIndicators(tr, row) {
    if (!tr) return;
    if (typeof getMissingFieldKeys !== 'function') return;

    tr.querySelectorAll('td.is-missing').forEach((td) => td.classList.remove('is-missing'));

    let keys = [];
    try {
      keys = getMissingFieldKeys(row) || [];
    } catch {
      keys = [];
    }
    if (!Array.isArray(keys) || keys.length === 0) return;

    keys.forEach((key) => {
      const k = String(key || '').trim();
      if (!k) return;
      // key는 페이지 코드에서 고정된 문자열만 넘긴다는 전제(예: itemName/spec/unit/qty...)
      const td =
        tr.querySelector(`[data-field="${k}"]`)?.closest('td') ||
        tr.querySelector(`[data-view="${k}"]`)?.closest('td') ||
        null;
      if (td) td.classList.add('is-missing');
    });
  }

  function getSelectedIndex() {
    if (typeof getEntrySelectedIndex === 'function') return getEntrySelectedIndex();
    return selectedIndexInternal;
  }

  function setSelectedIndex(index) {
    const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const total = pending.length + (shouldRenderDraftRow(pending) ? 1 : 0);
    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= total) {
      if (typeof setEntrySelectedIndex === 'function') setEntrySelectedIndex(null);
      selectedIndexInternal = null;
      return;
    }

    if (typeof setEntrySelectedIndex === 'function') setEntrySelectedIndex(idx);
    selectedIndexInternal = idx;
  }

  function setActiveCellKey(key) {
    const k = String(key || '').trim();
    if (!k) return;
    activeCellKeyInternal = k;
  }

  function getActiveCellKey() {
    return activeCellKeyInternal || 'itemName';
  }

  function applyCellActiveClass(tr, activeKey, isRowActive) {
    if (!tr) return null;
    tr.querySelectorAll('td.is-cell-active').forEach((td) => td.classList.remove('is-cell-active'));
    if (!isRowActive) return null;

    let tdActive = tr.querySelector(`[data-field="${activeKey}"]`)?.closest('td') || null;
    if (!tdActive) {
      tdActive = tr.querySelector('[data-field="itemName"]')?.closest('td') || null;
    }
    if (!tdActive) {
      tdActive = tr.querySelector('[data-field]')?.closest('td') || null;
    }
    if (tdActive) tdActive.classList.add('is-cell-active');
    return tdActive;
  }

  function applyControlDisableByActiveCell(tr, isRowActive, tdActive) {
    if (!tr) return;
    tr.querySelectorAll('.cell-edit input, .cell-edit select, .cell-edit button').forEach((el) => {
      if (
        !(
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLButtonElement
        )
      ) {
        return;
      }
      if (!isRowActive) {
        el.disabled = true;
        return;
      }

      // 품명 셀의 액션(품목 선택/이전 품목)은 셀 활성 여부와 무관하게 항상 사용 가능
      if (el.closest('.purchase-item-cell')) {
        if (el.classList.contains('js-item-picker') || el.classList.contains('js-item-history')) {
          el.disabled = false;
          return;
        }
      }

      if (!tdActive) {
        el.disabled = true;
        return;
      }
      el.disabled = !tdActive.contains(el);
    });
  }

  function focusActiveCellControl(activeTr) {
    if (!activeTr) return;
    const td = activeTr.querySelector('td.is-cell-active');
    if (!td) return;
    const focusable = td.querySelector('input, select, button');
    if (!focusable) return;
    if (focusable instanceof HTMLButtonElement) return;
    focusable.focus();
    if (focusable instanceof HTMLInputElement) {
      try {
        focusable.select();
      } catch {
        // ignore
      }
    }
  }

  function getFieldsFromRow(tr) {
    if (!tr) return {};
    return {
      itemCode: tr.querySelector('[data-field="itemCode"]'),
      itemName: tr.querySelector('[data-field="itemName"]'),
      spec: tr.querySelector('[data-field="spec"]'),
      unit: tr.querySelector('[data-field="unit"]'),
      qty: tr.querySelector('[data-field="qty"]'),
      unitPrice: tr.querySelector('[data-field="unitPrice"]'),
      amount: tr.querySelector('[data-field="amount"]'),
      shrinkPercent: tr.querySelector('[data-field="shrinkPercent"]'),
      shrinkPrice: tr.querySelector('[data-field="shrinkPrice"]'),
      margin: tr.querySelector('[data-field="margin"]'),
      marginRate: tr.querySelector('[data-field="marginRate"]'),
    };
  }

  function formatPercentValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    // 0은 공백으로 두지 않고 0으로 표시
    return String(n);
  }

  function calcShrinkPrice(unitPrice, shrinkPercent) {
    const price = Number(unitPrice || 0);
    const sp = Number(shrinkPercent || 0);
    if (!Number.isFinite(price) || price <= 0) return 0;
    if (!Number.isFinite(sp) || sp <= 0) return Math.round(price);
    if (sp >= 100) return Math.round(price);
    const ratio = 1 - sp / 100;
    if (ratio <= 0) return Math.round(price);
    return Math.round(price / ratio);
  }

  function calcMarginFromRate(shrinkPrice, marginRate) {
    const base = Number(shrinkPrice || 0);
    const mr = Number(marginRate || 0);
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (!Number.isFinite(mr) || mr <= 0) return 0;
    return Math.round(base * (mr / 100));
  }

  function applyDerivedFields(row, fields) {
    if (!row) return;

    if (derivedMode === 'purchaseCost') {
      // 매입가/매입합계 모드
      const costUnit = Number(row.shrinkPercent ?? 0) || 0;
      const qty = Number(row.quantity ?? 0) || 0;
      const salesTotal = Number(row.amount ?? 0) || 0;

      const purchaseTotal = Number.isFinite(costUnit * qty)
        ? Math.round(costUnit * qty)
        : 0;
      row.shrinkPrice = purchaseTotal;

      // 마진 = 매출합계 - 매입합계
      row.margin = Math.round(salesTotal - purchaseTotal);

      // 마진율 = (마진 / 매출합계) * 100
      const rate = salesTotal > 0 ? (row.margin / salesTotal) * 100 : 0;
      row.marginRate = Number.isFinite(rate) ? Math.round(rate * 10) / 10 : 0;
    } else {
      // 감량율/감량가 모드(기존)
      const marginRate = Number(row.marginRate ?? 0) || 0;
      const shrinkPercent = Number(row.shrinkPercent ?? 0) || 0;
      const unitPrice = Number(row.unitPrice ?? 0) || 0;

      const shrinkPrice = calcShrinkPrice(unitPrice, shrinkPercent);
      row.shrinkPrice = Number.isFinite(shrinkPrice) ? shrinkPrice : 0;

      const margin = calcMarginFromRate(row.shrinkPrice, marginRate);
      row.margin = Number.isFinite(margin) ? margin : 0;
    }

    if (fields && fields.shrinkPrice instanceof HTMLInputElement) {
      fields.shrinkPrice.value = String(row.shrinkPrice || 0);
    }
    if (fields && fields.margin instanceof HTMLInputElement) {
      fields.margin.value = String(row.margin || 0);
    }
    if (fields && fields.marginRate instanceof HTMLInputElement) {
      fields.marginRate.value = String(row.marginRate || 0);
    }
  }

  function formatShrinkPercentForView(row) {
    if (!row) return '';
    if (derivedMode === 'purchaseCost') {
      if (typeof formatMoney === 'function') return formatMoney(row.shrinkPercent);
      return row.shrinkPercent != null ? String(row.shrinkPercent) : '';
    }
    return row?.shrinkPercent != null ? `${formatPercentValue(row.shrinkPercent)}%` : '';
  }

  function ensureDraft() {
    const cur = getEntryDraftRow ? getEntryDraftRow() : null;
    if (cur) return cur;
    const next = typeof buildEmptyEntryDraft === 'function' ? buildEmptyEntryDraft() : null;
    if (next && typeof setEntryDraftRow === 'function') {
      setEntryDraftRow(next);
    }
    return next;
  }

  function getRowModelByIndex(index) {
    const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const idx = Number(index);
    if (!Number.isFinite(idx)) return null;
    if (idx === pending.length) {
      return ensureDraft();
    }
    return pending[idx] || null;
  }

  function bindActiveControls(tr) {
    const fields = getFieldsFromRow(tr);
    const itemPickerButton = tr.querySelector('.js-item-picker');
    const itemHistorySelect = tr.querySelector('.js-item-history');
    if (typeof onBindActiveControls === 'function') {
      onBindActiveControls({ tr, fields, itemPickerButton, itemHistorySelect });
    }
  }

  function applyActiveStylesAndDisable() {
    const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const total = pending.length + (shouldRenderDraftRow(pending) ? 1 : 0);
    let activeIndex = typeof getEntryActiveIndex === 'function' ? getEntryActiveIndex() : -1;
    let selectedIndex = getSelectedIndex();
    const activeKey = getActiveCellKey();
    if (activeIndex < 0 || activeIndex >= total) {
      activeIndex = total > 0 ? Math.max(0, total - 1) : 0;
      if (typeof setEntryActiveIndex === 'function') setEntryActiveIndex(activeIndex);
    }

    if (selectedIndex != null) {
      const s = Number(selectedIndex);
      if (!Number.isFinite(s) || s < 0 || s >= total) {
        selectedIndex = null;
        if (typeof setEntrySelectedIndex === 'function') setEntrySelectedIndex(null);
        selectedIndexInternal = null;
      }
    }

    entryBody.querySelectorAll('tr.purchase-entry-row').forEach((tr) => {
      const idx = Number(tr.dataset.entryIndex || '-1');
      const isActive = idx === activeIndex;
      const isSelected = selectedIndex != null && idx === Number(selectedIndex);
      tr.classList.toggle('is-active', isActive);
      tr.classList.toggle('is-selected', isSelected);
      const tdActive = applyCellActiveClass(tr, activeKey, isActive);
      applyControlDisableByActiveCell(tr, isActive, tdActive);
    });

    const activeTr = entryBody.querySelector(
      `tr.purchase-entry-row[data-entry-index="${activeIndex}"]`,
    );
    if (activeTr) {
      bindActiveControls(activeTr);
      // 렌더/활성화 직후에만 포커스(클릭/키보드 이동 UX 개선)
      setTimeout(() => focusActiveCellControl(activeTr), 0);
      if (typeof onAfterRenderActive === 'function') {
        onAfterRenderActive({ activeIndex, activeTr, totalRows: total });
      }
    }
  }

  function setActiveIndex(index) {
    const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const total = pending.length + (shouldRenderDraftRow(pending) ? 1 : 0);
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, total - 1));

    const currentActive = typeof getEntryActiveIndex === 'function' ? getEntryActiveIndex() : -1;
    const isDraftActive = currentActive === pending.length;
    const isBatch = typeof getIsBatchEditMode === 'function' ? !!getIsBatchEditMode() : false;

    // 신규 입력 모드에서는, draft가 채워진 상태로 다른 행을 누르면 먼저 확정
    if (!isBatch && isDraftActive && safeIndex !== pending.length) {
      const filled = typeof isDraftFilled === 'function' ? !!isDraftFilled() : false;
      if (filled && typeof onConfirmDraft === 'function') {
        onConfirmDraft();
      }
    }

    // onConfirmDraft()로 pending length가 바뀔 수 있으므로 다시 계산
    const pending2 = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const total2 = pending2.length + (shouldRenderDraftRow(pending2) ? 1 : 0);
    const safeIndex2 = Math.max(0, Math.min(Number(index) || 0, total2 - 1));

    if (typeof setEntryActiveIndex === 'function') setEntryActiveIndex(safeIndex2);
    applyActiveStylesAndDisable();
  }

  function render() {
    const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
    const renderDraft = shouldRenderDraftRow(pending);
    const draft = renderDraft ? ensureDraft() : null;

    const totalRows = pending.length + (renderDraft ? 1 : 0);
    let activeIndex = typeof getEntryActiveIndex === 'function' ? getEntryActiveIndex() : -1;
    let selectedIndex = getSelectedIndex();
    const activeKey = getActiveCellKey();
    if (activeIndex < 0 || activeIndex >= totalRows) {
      activeIndex = totalRows > 0 ? Math.max(0, totalRows - 1) : 0;
      if (typeof setEntryActiveIndex === 'function') setEntryActiveIndex(activeIndex);
    }

    if (selectedIndex != null) {
      const s = Number(selectedIndex);
      if (!Number.isFinite(s) || s < 0 || s >= totalRows) {
        selectedIndex = null;
        if (typeof setEntrySelectedIndex === 'function') setEntrySelectedIndex(null);
        selectedIndexInternal = null;
      }
    }

    const frag = document.createDocumentFragment();

    const fill = (tr, row, index) => {
      tr.classList.add('purchase-entry-row');
      tr.dataset.entryIndex = String(index);

      const viewItemCode = tr.querySelector('[data-view="itemCode"]');
      const viewItemName = tr.querySelector('[data-view="itemName"]');
      const viewSpec = tr.querySelector('[data-view="spec"]');
      const viewUnit = tr.querySelector('[data-view="unit"]');
      const viewQty = tr.querySelector('[data-view="qty"]');
      const viewUnitPrice = tr.querySelector('[data-view="unitPrice"]');
      const viewAmount = tr.querySelector('[data-view="amount"]');
      const viewShrinkPercent = tr.querySelector('[data-view="shrinkPercent"]');
      const viewShrinkPrice = tr.querySelector('[data-view="shrinkPrice"]');
      const viewMargin = tr.querySelector('[data-view="margin"]');
      const viewMarginRate = tr.querySelector('[data-view="marginRate"]');

      if (viewItemCode) viewItemCode.textContent = row?.itemCode || '';
      if (viewItemName) viewItemName.textContent = row?.itemName || '';
      if (viewSpec) viewSpec.textContent = row?.itemSpec || '';
      if (viewUnit) viewUnit.textContent = row?.unit || '';
      if (viewQty && typeof formatQuantity === 'function')
        viewQty.textContent = formatQuantity(row?.quantity);
      if (viewUnitPrice && typeof formatMoney === 'function')
        viewUnitPrice.textContent = formatMoney(row?.unitPrice);
      if (viewAmount && typeof formatMoney === 'function')
        viewAmount.textContent = formatMoney(row?.amount);

      if (viewShrinkPercent) viewShrinkPercent.textContent = formatShrinkPercentForView(row);
      if (viewShrinkPrice && typeof formatMoney === 'function')
        viewShrinkPrice.textContent = formatMoney(row?.shrinkPrice);
      if (viewMargin && typeof formatMoney === 'function') viewMargin.textContent = formatMoney(row?.margin);
      if (viewMarginRate)
        viewMarginRate.textContent = row?.marginRate != null ? `${formatPercentValue(row.marginRate)}%` : '';

      const fields = getFieldsFromRow(tr);
      if (fields.itemCode) fields.itemCode.value = row?.itemCode || '';
      if (fields.itemName) fields.itemName.value = row?.itemName || '';
      if (fields.spec) fields.spec.value = row?.itemSpec || '';
      if (fields.unit) fields.unit.value = row?.unit || '';
      if (fields.qty)
        fields.qty.value = row?.quantity != null ? String(row.quantity) : '1';
      if (fields.unitPrice)
        fields.unitPrice.value = row?.unitPrice != null ? String(row.unitPrice) : '0';
      if (fields.amount)
        fields.amount.value = row?.amount != null ? String(row.amount) : '0';

      if (fields.shrinkPercent)
        fields.shrinkPercent.value =
          row?.shrinkPercent != null ? String(row.shrinkPercent) : '0';
      if (fields.marginRate)
        fields.marginRate.value = row?.marginRate != null ? String(row.marginRate) : '0';

      // 계산 필드(감량가/마진)는 단가/감량율/마진율에 의해 자동 갱신
      applyDerivedFields(row, fields);

      if (fields.shrinkPrice)
        fields.shrinkPrice.value = row?.shrinkPrice != null ? String(row.shrinkPrice) : '0';
      if (fields.margin) fields.margin.value = row?.margin != null ? String(row.margin) : '0';

      const isActive = index === activeIndex;
      const isSelected = selectedIndex != null && index === Number(selectedIndex);
      tr.classList.toggle('is-active', isActive);
      tr.classList.toggle('is-selected', isSelected);
      const tdActive = applyCellActiveClass(tr, activeKey, isActive);
      applyControlDisableByActiveCell(tr, isActive, tdActive);

      applyMissingIndicators(tr, row);
    };

    pending.forEach((row, index) => {
      const tr = entryRowTemplate.content.firstElementChild.cloneNode(true);
      fill(tr, row, index);
      frag.appendChild(tr);
    });

    if (renderDraft) {
      const trNew = entryRowTemplate.content.firstElementChild.cloneNode(true);
      fill(trNew, draft, pending.length);
      frag.appendChild(trNew);
    }

    entryBody.innerHTML = '';
    entryBody.appendChild(frag);

    applyActiveStylesAndDisable();
    if (typeof onUpdateSummary === 'function') onUpdateSummary();
  }

  function bind() {
    if (isBound) return;
    isBound = true;

    // 클릭: 활성행 변경 + 품목 선택(...)
    entryBody.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const tr = target.closest('tr.purchase-entry-row');
      if (!tr) return;
      const idx = Number(tr.dataset.entryIndex || '0');

      // 어떤 칸을 눌렀는지(셀 단위 편집)
      const td = target.closest('td');
      const keyFromTdField = td?.querySelector('[data-field]')?.getAttribute('data-field');
      const keyFromTdView = td?.querySelector('[data-view]')?.getAttribute('data-view');
      const viewEl = target.closest('[data-view]');
      const fieldEl = target.closest('[data-field]');
      const key =
        (fieldEl instanceof HTMLElement && fieldEl.dataset.field) ||
        (viewEl instanceof HTMLElement && viewEl.dataset.view) ||
        keyFromTdField ||
        keyFromTdView ||
        (target.closest('.js-item-picker') ? 'itemName' : 'itemName');
      setActiveCellKey(key);

      // 선택은 유지(바깥 클릭으로 활성행이 해제돼도, 선택 색상은 남도록)
      setSelectedIndex(idx);
      setActiveIndex(idx);

      if (target.closest('.js-item-picker')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onOpenItemPicker === 'function') onOpenItemPicker(idx);
      }
    });

    // 입력: 모델 동기화 + 재계산 + view 텍스트 갱신
    entryBody.addEventListener('input', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const tr = target.closest('tr.purchase-entry-row');
      if (!tr) return;
      const idx = Number(tr.dataset.entryIndex || '0');

      const row = getRowModelByIndex(idx);
      if (!row) return;

      const editedKey =
        (target instanceof HTMLElement && target.getAttribute('data-field')) ||
        (target.closest('[data-field]') instanceof HTMLElement
          ? target.closest('[data-field]').getAttribute('data-field')
          : '');

      const fields = getFieldsFromRow(tr);
      row.itemCode = fields.itemCode ? fields.itemCode.value.trim() : '';
      row.itemName = fields.itemName ? fields.itemName.value.trim() : '';
      row.itemSpec = fields.spec ? fields.spec.value.trim() : '';
      row.unit = fields.unit ? fields.unit.value.trim() : '';
      row.quantity = fields.qty ? Number(fields.qty.value || '0') : 0;
      row.unitPrice = fields.unitPrice ? Number(fields.unitPrice.value || '0') : 0;
      row.taxType = typeof getTaxType === 'function' ? getTaxType() : row.taxType;

      // 합계액을 사용자가 직접 입력한 경우(또는 합계 기반 모드에서 수량을 바꾼 경우)
      // - amount -> unitPrice 를 먼저 역산한다.
      if (fields.amount) {
        const rawAmount = Number(fields.amount.value || '0') || 0;

        if (editedKey === 'amount') {
          row.amount = normalizeAmount(rawAmount);
          row._amountManual = true;
        }
        if (editedKey === 'unitPrice') {
          row._amountManual = false;
        }

        const shouldInferFromAmount = editedKey === 'amount' || (editedKey === 'qty' && row._amountManual);

        if (shouldInferFromAmount) {
          const safeAmount = row.amount ?? normalizeAmount(rawAmount);

          if (typeof inferRowFromAmount === 'function') {
            const inferred = inferRowFromAmount(row.quantity, safeAmount, row.taxType) || {};
            const inferredUnit = Number(inferred.unitPrice ?? 0);
            const inferredSupply = Number(inferred.supplyAmount ?? 0);
            const inferredTax = Number(inferred.taxAmount ?? 0);

            row.unitPrice = Number.isFinite(inferredUnit) ? inferredUnit : 0;
            row.supplyAmount = Number.isFinite(inferredSupply) ? inferredSupply : 0;
            row.taxAmount = Number.isFinite(inferredTax) ? inferredTax : 0;

            if (fields.unitPrice) fields.unitPrice.value = String(row.unitPrice || 0);
          } else if (typeof inferUnitPriceFromAmount === 'function') {
            const inferred = inferUnitPriceFromAmount(row.quantity, safeAmount, row.taxType);
            row.unitPrice = Number.isFinite(Number(inferred)) ? Number(inferred) : 0;
            if (fields.unitPrice) fields.unitPrice.value = String(row.unitPrice || 0);
          }
        }
      }

      if (fields.shrinkPercent) {
        row.shrinkPercent = Number(fields.shrinkPercent.value || '0') || 0;
      }
      if (fields.marginRate) {
        row.marginRate = Number(fields.marginRate.value || '0') || 0;
      }

      // 매출합계(row.amount)를 먼저 재계산한 뒤 파생값(매입합계/마진)을 계산한다.
      // (purchaseCost 모드의 마진은 row.amount(매출합계)에 의존)
      const isManualAmountActive = !!row._amountManual;
      const shouldKeepAmount = isManualAmountActive && (editedKey === 'amount' || editedKey === 'qty');

      if (!shouldKeepAmount && typeof calculateRowAmounts === 'function') {
        const { supplyAmount, taxAmount, amount } = calculateRowAmounts(
          row.quantity,
          row.unitPrice,
          row.taxType,
        );
        row.supplyAmount = supplyAmount;
        row.taxAmount = taxAmount;
        row.amount = normalizeAmount(amount);
        // 합계액을 직접 입력 중일 때는 입력값을 즉시 덮어쓰지 않아 커서가 튀지 않게 한다.
        if (fields.amount && editedKey !== 'amount') fields.amount.value = String(row.amount);
      }

      // 파생 값(감량가/마진) 갱신
      applyDerivedFields(row, fields);

      const viewItemCode = tr.querySelector('[data-view="itemCode"]');
      const viewItemName = tr.querySelector('[data-view="itemName"]');
      const viewSpec = tr.querySelector('[data-view="spec"]');
      const viewUnit = tr.querySelector('[data-view="unit"]');
      const viewQty = tr.querySelector('[data-view="qty"]');
      const viewUnitPrice = tr.querySelector('[data-view="unitPrice"]');
      const viewAmount = tr.querySelector('[data-view="amount"]');
      const viewShrinkPercent = tr.querySelector('[data-view="shrinkPercent"]');
      const viewShrinkPrice = tr.querySelector('[data-view="shrinkPrice"]');
      const viewMargin = tr.querySelector('[data-view="margin"]');
      const viewMarginRate = tr.querySelector('[data-view="marginRate"]');

      if (viewItemCode) viewItemCode.textContent = row.itemCode || '';
      if (viewItemName) viewItemName.textContent = row.itemName || '';
      if (viewSpec) viewSpec.textContent = row.itemSpec || '';
      if (viewUnit) viewUnit.textContent = row.unit || '';
      if (viewQty && typeof formatQuantity === 'function')
        viewQty.textContent = formatQuantity(row.quantity);
      if (viewUnitPrice && typeof formatMoney === 'function')
        viewUnitPrice.textContent = formatMoney(row.unitPrice);
      if (viewAmount && typeof formatMoney === 'function')
        viewAmount.textContent = formatMoney(row.amount);

      if (viewShrinkPercent) viewShrinkPercent.textContent = formatShrinkPercentForView(row);
      if (viewShrinkPrice && typeof formatMoney === 'function')
        viewShrinkPrice.textContent = formatMoney(row.shrinkPrice);
      if (viewMargin && typeof formatMoney === 'function') viewMargin.textContent = formatMoney(row.margin);
      if (viewMarginRate) viewMarginRate.textContent = `${formatPercentValue(row.marginRate)}%`;

      applyMissingIndicators(tr, row);

      if (typeof onUpdateSummary === 'function') onUpdateSummary();
    });

    // change: 이전 품목(▼)
    entryBody.addEventListener('change', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('js-item-history')) return;
      if (!(target instanceof HTMLSelectElement)) return;

      const tr = target.closest('tr.purchase-entry-row');
      if (!tr) return;
      const idx = Number(tr.dataset.entryIndex || '0');
      const raw = String(target.value || '');
      if (!raw) return;

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (typeof onHistoryPayload === 'function') {
        onHistoryPayload({ index: idx, payload });
      }

      // payload 적용 후 페이지 쪽에서 render()를 호출하는 패턴을 권장
    });

    // keydown: Enter/Arrow
    entryBody.addEventListener('keydown', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tr = target.closest('tr.purchase-entry-row');
      if (!tr) return;

      // Tab: 셀 단위로 다음/이전 칸으로 이동
      // - 활성 셀만 입력 가능(disabled 토글) 구조라 기본 Tab 순서가 깨지므로,
      //   표 편집 UX를 위해 Tab을 가로채서 셀 이동으로 처리한다.
      if (e.key === 'Tab') {
        e.preventDefault();

        const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
        const renderDraft = shouldRenderDraftRow(pending);
        const totalRows = pending.length + (renderDraft ? 1 : 0);
        const currentRowIndex = Number(tr.dataset.entryIndex || '0');

        // 현재 행에서 탭 순서(화면상 좌->우)
        const keysInRow = Array.from(tr.querySelectorAll('input[data-field], select[data-field]'))
          .map((el) => (el instanceof HTMLElement ? String(el.dataset.field || '').trim() : ''))
          .filter(Boolean)
          .filter((k, i, arr) => arr.indexOf(k) === i);

        if (!keysInRow.length) return;

        const keyFromTarget =
          String(target.getAttribute('data-field') || '') ||
          String((target.closest('[data-field]') instanceof HTMLElement
            ? target.closest('[data-field]').getAttribute('data-field')
            : '') || '');
        const currentKey = String(keyFromTarget || getActiveCellKey() || '').trim() || keysInRow[0];

        const delta = e.shiftKey ? -1 : 1;
        const pos = Math.max(0, keysInRow.indexOf(currentKey));
        let nextRowIndex = currentRowIndex;
        let nextKey = keysInRow[pos] || keysInRow[0];

        const isAtEnd = delta > 0 && pos >= keysInRow.length - 1;
        const isAtStart = delta < 0 && pos <= 0;

        if (isAtEnd) {
          // 다음 행으로 이동(가능하면)
          if (Number.isFinite(totalRows) && currentRowIndex < totalRows - 1) {
            nextRowIndex = currentRowIndex + 1;
            nextKey = keysInRow[0];
          } else {
            // 마지막 행이면 같은 행에서 유지
            nextRowIndex = currentRowIndex;
            nextKey = keysInRow[keysInRow.length - 1];
          }
        } else if (isAtStart) {
          // 이전 행으로 이동(가능하면)
          if (Number.isFinite(totalRows) && currentRowIndex > 0) {
            nextRowIndex = currentRowIndex - 1;
            nextKey = keysInRow[keysInRow.length - 1];
          } else {
            nextRowIndex = currentRowIndex;
            nextKey = keysInRow[0];
          }
        } else {
          nextRowIndex = currentRowIndex;
          nextKey = keysInRow[pos + delta] || keysInRow[0];
        }

        // 행 이동 시: 다음 행 DOM을 기준으로 키 목록을 재계산
        if (nextRowIndex !== currentRowIndex) {
          const trNext = entryBody.querySelector(
            `tr.purchase-entry-row[data-entry-index="${Number(nextRowIndex)}"]`,
          );
          if (trNext) {
            const nextKeys = Array.from(
              trNext.querySelectorAll('input[data-field], select[data-field]'),
            )
              .map((el) => (el instanceof HTMLElement ? String(el.dataset.field || '').trim() : ''))
              .filter(Boolean)
              .filter((k, i, arr) => arr.indexOf(k) === i);
            if (nextKeys.length) {
              nextKey = delta > 0 ? nextKeys[0] : nextKeys[nextKeys.length - 1];
            }
          }
        }

        setActiveCellKey(nextKey);
        setSelectedIndex(nextRowIndex);
        if (typeof setEntryActiveIndex === 'function') setEntryActiveIndex(nextRowIndex);
        applyActiveStylesAndDisable();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const pending = (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
        const renderDraft = shouldRenderDraftRow(pending);
        const total = pending.length + (renderDraft ? 1 : 0);
        let idx = typeof getEntryActiveIndex === 'function' ? getEntryActiveIndex() : total - 1;
        if (idx === -1) idx = total - 1;
        idx += e.key === 'ArrowDown' ? 1 : -1;
        if (idx < 0) idx = total - 1;
        if (idx >= total) idx = 0;
        if (total > 0) setActiveIndex(idx);
        return;
      }

      if (e.key !== 'Enter') return;
      e.preventDefault();

      // 배치 수정 모드에서 draft 행을 숨겼다면, Enter는 '새 행 추가'로 해석해
      // draft 행을 표시하고 그 행으로 이동한다.
      const pendingForEnter =
        (typeof getPendingEntries === 'function' ? getPendingEntries() : []) || [];
      const isBatchForEnter =
        typeof getIsBatchEditMode === 'function' ? !!getIsBatchEditMode() : false;
      const renderDraftForEnter = shouldRenderDraftRow(pendingForEnter);
      if (!renderDraftForEnter && isBatchForEnter) {
        const requested =
          typeof onRequestRenderDraftRow === 'function'
            ? !!onRequestRenderDraftRow()
            : false;
        if (requested) {
          try {
            setActiveCellKey('itemName');
          } catch {
            // ignore
          }
          render();
          setActiveIndex(pendingForEnter.length);
          return;
        }
      }

      // Enter 시 품목이 없으면 모달 열기
      const fields = getFieldsFromRow(tr);
      const hasItemOrCode =
        (fields.itemName && String(fields.itemName.value || '').trim() !== '') ||
        (fields.itemCode && String(fields.itemCode.value || '').trim() !== '');
      const idx = typeof getEntryActiveIndex === 'function' ? getEntryActiveIndex() : 0;
      if (!hasItemOrCode) {
        if (typeof onOpenItemPicker === 'function') onOpenItemPicker(idx);
        return;
      }

      if (typeof onEnterConfirm === 'function') {
        onEnterConfirm({ index: idx });
      }
    });
  }

  return {
    bind,
    render,
    setActiveIndex,
    getRowModelByIndex,
    bindActiveControls,
  };
}
