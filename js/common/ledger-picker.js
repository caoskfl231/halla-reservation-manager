import { getCashflowItems, getCashflowTypes, getAllLedgerTx } from '../db.js?v=app-20261010-3';
import {
  applyAmountColoring,
  closeModalOverlay,
  enableTableArrowNavigation,
  openModalOverlay,
  registerModalEscClose,
} from './ui-helpers.js?v=app-20261010-3';
import { formatMoney } from './util.js?v=app-20261010-3';

const MODAL_ID = 'ledger-picker-modal';

function ensureModalExists() {
  let modalEl = document.getElementById(MODAL_ID);
  if (modalEl) return modalEl;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
  <div id="${MODAL_ID}" class="modal-overlay picker-modal picker-modal--ledger" aria-hidden="true">
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-picker-title">
      <section class="card">
        <h2 id="ledger-picker-title">장부 선택</h2>

        <div class="ledger-picker-box picker-layout picker-box">
          <div class="table-box purchase-supplier-table-box ledger-picker-col picker-left">
            <div class="table-wrapper purchase-supplier-table-wrapper">
              <table class="tx-table tx-table-small">
                <colgroup>
                  <col class="col-code" />
                  <col class="col-ledger-type" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="col-code">코드</th>
                    <th class="col-ledger-type">장부구분</th>
                  </tr>
                </thead>
                <tbody id="ledger-picker-type-list"></tbody>
              </table>
            </div>
          </div>

          <div class="table-box purchase-supplier-table-box ledger-picker-col picker-right">
            <div class="table-wrapper purchase-supplier-table-wrapper">
              <table class="tx-table tx-table-small">
                <colgroup>
                  <col class="col-code" />
                  <col class="col-name" />
                  <col class="col-balance" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="col-code">코드</th>
                    <th class="col-name">장부명</th>
                    <th class="col-balance">잔액</th>
                  </tr>
                </thead>
                <tbody id="ledger-picker-item-list"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="form-button-row">
          <button type="button" class="btn-primary" data-ledger-picker-confirm>선택</button>
          <button type="button" class="btn-secondary" data-ledger-picker-cancel>닫기</button>
        </div>
      </section>
    </div>
  </div>`;

  modalEl = wrapper.firstElementChild;
  document.body.appendChild(modalEl);
  return modalEl;
}

function normalizeKeyword(v) {
  return String(v || '').trim().toLowerCase();
}

function includesKeyword(text, keyword) {
  if (!keyword) return true;
  return String(text || '').toLowerCase().includes(keyword);
}

function clearSelection(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('tr.selected').forEach(tr => tr.classList.remove('selected'));
}

function selectRow(tr) {
  if (!tr) return;
  const tbody = tr.closest('tbody');
  if (tbody) clearSelection(tbody);
  tr.classList.add('selected');
  tr.scrollIntoView?.({ block: 'nearest' });
}

async function loadMasters() {
  const [types, items] = await Promise.all([
    getCashflowTypes().catch(() => []),
    getCashflowItems().catch(() => []),
  ]);

  const safeTypes = Array.isArray(types) ? types : [];
  const safeItems = Array.isArray(items) ? items : [];

  const typeMap = new Map(safeTypes.map(t => [String(t.code || ''), t]));

  // items에 typeCode가 없거나 잘못된 경우를 대비해, typeMap 기준으로 정리
  const normalizedItems = safeItems.map(it => {
    const code = String(it.code || '');
    const name = String(it.name || '');
    const typeCode = String(it.typeCode || '');
    const type = typeMap.get(typeCode);
    return {
      code,
      name,
      typeCode: type ? String(type.code || '') : typeCode,
      openingBalance: Number(it.openingBalance || 0) || 0,
      status: String(it.status || 'active'),
    };
  });

  // 항목별 현재 잔액 = 기초잔액 + ledger_tx 입출금 누적
  let txAll = [];
  try {
    txAll = await getAllLedgerTx();
  } catch (_) {
    txAll = [];
  }

  const itemCodeSet = new Set(normalizedItems.map((it) => String(it.code || '')));
  const deltaByItem = new Map();

  (txAll || []).forEach((tx) => {
    if (!tx) return;
    const amount = Number(tx.amount) || 0;
    if (!(amount > 0)) return;
    const sign = tx.flow === 'in' ? 1 : -1;

    // 잔액 집계용 코드가 아이템 코드(A0001~)로 들어갈 수 있어 둘 다 지원
    const candidate = String(tx.cashflowItemCode || tx.cashflowCode || '').trim();
    if (!candidate) return;
    if (!itemCodeSet.has(candidate)) return;
    const prev = deltaByItem.get(candidate) || 0;
    deltaByItem.set(candidate, prev + sign * amount);
  });

  const withBalance = normalizedItems.map((it) => {
    const delta = deltaByItem.get(String(it.code || '')) || 0;
    const currentBalance = (Number(it.openingBalance) || 0) + delta;
    return { ...it, currentBalance };
  });

  return {
    types: safeTypes.map((t) => ({ ...t, status: String(t?.status || 'active') })),
    items: withBalance,
  };
}

function isActiveStatus(v) {
  const s = String(v || 'active');
  return !s || s === 'active';
}

function renderTypeList({ tbody, types, keyword, selectedTypeCode }) {
  if (!tbody) return;
  const kw = normalizeKeyword(keyword);

  const filtered = (types || []).filter((t) => {
    const code = String(t.code || '');
    const name = String(t.name || '');
    // 기본: 사용(active)만 노출, 단 이미 선택된 구분은 유지
    if (!isActiveStatus(t?.status) && String(selectedTypeCode || '') !== code) {
      return false;
    }
    return includesKeyword(code, kw) || includesKeyword(name, kw);
  });

  tbody.innerHTML = filtered.map(t => {
    const code = String(t.code || '');
    const name = String(t.name || '');
    const selected = String(selectedTypeCode || '') === code;
    return `<tr data-code="${code}" data-name="${name}" class="${selected ? 'selected' : ''}">
      <td>${code || ''}</td>
      <td>${name}</td>
    </tr>`;
  }).join('');
}

function renderItemList({ tbody, items, keyword, selectedTypeCode, showAllItems, selectedItemCode }) {
  if (!tbody) return;
  const kw = normalizeKeyword(keyword);
  const typeCode = String(selectedTypeCode || '').trim();
  const useAll = showAllItems || !typeCode;

  const filtered = (items || []).filter((it) => {
    // 기본: 사용(active)만 노출, 단 이미 선택된 항목은 유지
    if (!isActiveStatus(it?.status) && String(selectedItemCode || '') !== String(it?.code || '')) {
      return false;
    }
    if (!useAll) {
      if (String(it.typeCode || '') !== typeCode) return false;
    }
    return includesKeyword(it.code, kw) || includesKeyword(it.name, kw);
  });

  tbody.innerHTML = filtered.map(it => {
    const code = String(it.code || '');
    const name = String(it.name || '');
    const tCode = String(it.typeCode || '');
    const bal = Number(it.currentBalance != null ? it.currentBalance : it.openingBalance) || 0;
    const selected = String(selectedItemCode || '') === code;
    return `<tr data-code="${code}" data-name="${name}" data-type-code="${tCode}" data-balance="${bal}" class="${selected ? 'selected' : ''}">
      <td class="col-code">${code}</td>
      <td class="col-name">${name}</td>
      <td class="col-balance" data-amount-color="1" data-amount-value="${bal}">${formatMoney(bal)}</td>
    </tr>`;
  }).join('');
}

function findTypeName(types, code) {
  const str = String(code || '');
  const t = (types || []).find(x => String(x.code || '') === str);
  return t ? String(t.name || '') : '';
}

// 공통 장부 선택 모달을 열고 결과를 Promise 로 반환한다.
// - 선택 취소 시 null 반환
//
// options:
// - title: 모달 타이틀(기본 "장부 선택")
// - initialTypeCode: 초기 선택 장부구분 코드
// - initialItemCode: 초기 선택 장부명 코드
// - showAllItemsInitially: true면 장부구분을 누르기 전에도 장부명 전체를 보여줌(기본 true)
export async function openLedgerPicker(options = {}) {
  const modalEl = ensureModalExists();

  const titleEl = modalEl.querySelector('#ledger-picker-title');
  if (titleEl) titleEl.textContent = options.title || '장부 선택';

  const typeTbody = modalEl.querySelector('#ledger-picker-type-list');
  const itemTbody = modalEl.querySelector('#ledger-picker-item-list');
  const btnConfirm = modalEl.querySelector('[data-ledger-picker-confirm]');
  const btnCancel = modalEl.querySelector('[data-ledger-picker-cancel]');

  const { types, items } = await loadMasters();

  let selectedTypeCode = String(options.initialTypeCode || '').trim();
  let selectedItemCode = String(options.initialItemCode || '').trim();

  // 초기에는 전체 보기(요구사항: 초기 분류 전체 보기)
  let showAllItems = options.showAllItemsInitially !== false;

  function refreshLists() {
    renderTypeList({
      tbody: typeTbody,
      types,
      keyword: '',
      selectedTypeCode,
    });

    renderItemList({
      tbody: itemTbody,
      items,
      keyword: '',
      selectedTypeCode,
      showAllItems,
      selectedItemCode,
    });

    try {
      applyAmountColoring(modalEl);
    } catch (_) {
      // ignore
    }
  }

  function applyTypeSelection(code) {
    selectedTypeCode = String(code || '').trim();
    // 장부구분을 선택하면 해당 구분에 맞춰 필터링
    showAllItems = false;
    selectedItemCode = '';
    refreshLists();

    // 키보드 네비게이션이 자연스럽게 이어지도록 장부명 리스트로 포커스 이동
    if (itemTbody) itemTbody.focus?.();
  }

  function applyItemSelection(code, { skipRender = false } = {}) {
    selectedItemCode = String(code || '').trim();
    // 클릭 시 매번 재렌더링하면 DOM이 교체되어 dblclick 이벤트가 성립하지 않을 수 있다.
    // (필터/타입 변경 등 필요할 때만 refreshLists를 호출)
    if (!skipRender) refreshLists();
  }

  refreshLists();

  const offEsc = registerModalEscClose(modalEl, () => finish(null));

  function cleanup() {
    offEsc?.();
    openLedgerPicker._active = false;

    typeTbody?.removeEventListener('click', onTypeClick);
    itemTbody?.removeEventListener('click', onItemClick);
    itemTbody?.removeEventListener('dblclick', onItemDblClick);

    btnConfirm?.removeEventListener('click', onConfirm);
    btnCancel?.removeEventListener('click', onCancel);
  }

  function buildResult() {
    const item = items.find(it => String(it.code || '') === String(selectedItemCode || ''));
    if (item) {
      const tCode = String(item.typeCode || '');
      const balance =
        Number(item.currentBalance != null ? item.currentBalance : item.openingBalance) || 0;
      return {
        typeCode: tCode,
        typeName: findTypeName(types, tCode),
        itemCode: String(item.code || ''),
        itemName: String(item.name || ''),
        balance,
      };
    }

    const tCode = String(selectedTypeCode || '');
    if (!tCode) return null;

    return {
      typeCode: tCode,
      typeName: findTypeName(types, tCode),
      itemCode: '',
      itemName: '',
      balance: 0,
    };
  }

  let resolver = null;

  function finish(result) {
    closeModalOverlay(modalEl);
    cleanup();
    if (typeof resolver === 'function') resolver(result);
    resolver = null;
  }

  function onTypeClick(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    selectRow(tr);
    const code = tr.dataset.code || '';
    applyTypeSelection(code);
  }

  function onItemClick(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    selectRow(tr);
    applyItemSelection(tr.dataset.code || '', { skipRender: true });
  }

  function onItemDblClick(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    selectRow(tr);
    applyItemSelection(tr.dataset.code || '', { skipRender: true });
    const res = buildResult();
    finish(res);
  }

  function onConfirm() {
    const res = buildResult();
    if (!res) {
      const g = typeof window !== 'undefined' ? window.__hallaDialogs : null;
      const msg = '장부명(또는 장부구분)을 선택해 주세요.';
      if (g && typeof g.warningDialog === 'function') {
        void g.warningDialog(msg);
      } else {
        alert(msg);
      }
      return;
    }
    finish(res);
  }

  function onCancel() {
    finish(null);
  }

  // 테이블 키보드 네비게이션
  enableTableArrowNavigation(typeTbody, {
    onSelect: (tr) => {
      if (!tr) return;
      selectRow(tr);
      applyTypeSelection(tr.dataset.code || '');
    },
  });

  enableTableArrowNavigation(itemTbody, {
    enableEnter: true,
    onSelect: (tr) => {
      if (!tr) return;
      selectRow(tr);
      applyItemSelection(tr.dataset.code || '');
    },
    onEnter: () => {
      const res = buildResult();
      if (!res) return;
      finish(res);
    },
  });

  typeTbody?.addEventListener('click', onTypeClick);
  itemTbody?.addEventListener('click', onItemClick);

  // dblclick 확정은 세션별 상태(resolver/items/selectedItemCode)를 사용해야 하므로
  // 공통 위임 헬퍼(1회 바인딩) 대신 여기서 직접 바인딩/해제한다.
  itemTbody?.addEventListener('dblclick', onItemDblClick);

  btnConfirm?.addEventListener('click', onConfirm);
  btnCancel?.addEventListener('click', onCancel);

  openModalOverlay(modalEl);

  // 초점: 장부명 리스트로 시작
  setTimeout(() => {
    try { itemTbody?.focus?.(); } catch (e) {}
  }, 0);

  return new Promise((resolve) => {
    resolver = resolve;
  });
}

