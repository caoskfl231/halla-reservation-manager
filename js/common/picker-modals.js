const PURCHASE_ITEM_MODAL_ID = 'purchase-item-modal';
const PURCHASE_SUPPLIER_PICKER_MODAL_ID = 'purchase-supplier-picker-modal';
const SALES_ITEM_MODAL_ID = 'sales-item-modal';
const SALES_SUPPLIER_PICKER_MODAL_ID = 'sales-supplier-picker-modal';
const PAYMENT_IMPORT_CUSTOMER_MODAL_ID = 'payment-import-customer-modal';
const PAYMENT_ENTRY_CHOICE_MODAL_ID = 'payment-entry-choice-modal';
const TRN_SUPPLIER_PICKER_MODAL_ID = 'trn-supplier-picker-modal';
const TRN_ITEM_PICKER_MODAL_ID = 'trn-item-picker-modal';

const PURCHASE_ITEM_MODAL_HTML = `
<div id="purchase-item-modal" class="modal-overlay picker-modal picker-modal--tall" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-item-modal-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="purchase-item-modal-title">품목 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-purchase-item-close">×</button>
      </div>

      <div class="table-action-box">
        <div class="table-action-buttons">
          <input type="text" id="purchase-item-search" placeholder="코드/품명/규격 검색" class="customer-search-input" />
          <button type="button" id="btn-purchase-item-confirm" class="btn-primary">선택</button>
          <button type="button" id="btn-purchase-item-close" class="btn-secondary">닫기</button>
        </div>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-item-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table purchase-item-group-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="purchase-item-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box purchase-item-list-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table purchase-item-table">
              <colgroup>
                <col class="col-code" />
                <col class="col-name" />
                <col class="col-name" />
                <col class="col-unit" />
                <col class="col-price" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-code">코드</th>
                  <th class="col-name">품명</th>
                  <th class="col-name">규격</th>
                  <th class="col-unit">단위</th>
                  <th class="col-price">매입가</th>
                </tr>
              </thead>
              <tbody id="purchase-item-list"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;

const SALES_ITEM_MODAL_HTML = `
<div id="sales-item-modal" class="modal-overlay picker-modal picker-modal--tall" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-item-modal-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="sales-item-modal-title">품목 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-sales-item-close">×</button>
      </div>

      <div class="table-action-box">
        <div class="table-action-buttons">
          <input type="text" id="sales-item-search" placeholder="코드/품명/규격 검색" class="customer-search-input" />
          <button type="button" id="btn-sales-item-confirm" class="btn-primary">선택</button>
          <button type="button" id="btn-sales-item-close" class="btn-secondary">닫기</button>
        </div>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-item-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table purchase-item-group-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="sales-item-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box purchase-item-list-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table purchase-item-table">
              <colgroup>
                <col class="col-code" />
                <col class="col-name" />
                <col class="col-name" />
                <col class="col-unit" />
                <col class="col-price" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-code">코드</th>
                  <th class="col-name">품명</th>
                  <th class="col-name">규격</th>
                  <th class="col-unit">단위</th>
                  <th class="col-price">매입가</th>
                </tr>
              </thead>
              <tbody id="sales-item-list"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;

const PURCHASE_SUPPLIER_PICKER_MODAL_HTML = `
<div id="purchase-supplier-picker-modal" class="modal-overlay picker-modal" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-supplier-picker-modal-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="purchase-supplier-picker-modal-title">거래처 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-purchase-supplier-picker-close">×</button>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-supplier-picker-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table purchase-supplier-picker-group-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="purchase-supplier-picker-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box purchase-supplier-picker-list-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table purchase-supplier-picker-table">
              <colgroup>
                <col class="col-code" />
                <col class="col-name" />
                <col class="col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-code">코드</th>
                  <th class="col-name">거래처명</th>
                  <th class="col-balance">잔액</th>
                </tr>
              </thead>
              <tbody id="purchase-supplier-picker-list"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="form-button-row">
        <button type="button" id="btn-purchase-supplier-picker-confirm" class="btn-secondary">선택</button>
        <button type="button" id="btn-purchase-supplier-picker-close" class="btn-secondary">닫기</button>
      </div>
    </section>
  </div>
</div>
`;

const SALES_SUPPLIER_PICKER_MODAL_HTML = `
<div id="sales-supplier-picker-modal" class="modal-overlay picker-modal" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sales-supplier-picker-modal-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="sales-supplier-picker-modal-title">거래처 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-sales-supplier-picker-close">×</button>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-supplier-picker-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table purchase-supplier-picker-group-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="sales-supplier-picker-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box purchase-supplier-picker-list-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table purchase-supplier-picker-table">
              <colgroup>
                <col class="col-code" />
                <col class="col-name" />
                <col class="col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-code">코드</th>
                  <th class="col-name">거래처명</th>
                  <th class="col-balance">잔액</th>
                </tr>
              </thead>
              <tbody id="sales-supplier-picker-list"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="form-button-row">
        <button type="button" id="btn-sales-supplier-picker-confirm" class="btn-secondary">선택</button>
        <button type="button" id="btn-sales-supplier-picker-close" class="btn-secondary">닫기</button>
      </div>
    </section>
  </div>
</div>
`;

const PAYMENT_IMPORT_CUSTOMER_MODAL_HTML = `
<div
  id="payment-import-customer-modal"
  class="modal-overlay picker-modal"
  aria-hidden="true"
>
  <div
    class="modal-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="payment-import-customer-title"
  >
    <section class="card">
      <div class="modal-header">
        <h2 id="payment-import-customer-title">거래처 선택</h2>
        <button
          type="button"
          class="modal-close-x"
          aria-label="닫기"
          data-click="#btn-payment-import-customer-close"
        >
          ×
        </button>
      </div>

      <div class="table-action-box">
        <span class="table-action-text">거래처를 선택하세요.</span>
        <div class="table-action-buttons">
          <input
            type="text"
            id="payment-import-customer-search"
            placeholder="검색: 거래처"
            class="customer-search-input"
          />
          <button
            type="button"
            id="btn-payment-import-customer-reset"
            class="btn-secondary"
          >
            전체
          </button>
          <button
            type="button"
            id="btn-payment-import-customer-close"
            class="btn-secondary"
          >
            닫기
          </button>
        </div>
      </div>

      <div
        id="payment-import-current-record"
        class="payment-import-current-record"
      ></div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-item-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table">
              <thead>
                <tr>
                  <th>구분</th>
                </tr>
              </thead>
              <tbody id="payment-import-type-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box payment-import-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="payment-import-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box payment-import-customer-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table">
              <colgroup>
                <col class="col-name" />
                <col class="col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-name">항목</th>
                  <th class="col-balance">잔액</th>
                </tr>
              </thead>
              <tbody id="payment-import-customer-list"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;

const PAYMENT_ENTRY_CHOICE_MODAL_HTML = `
<div id="payment-entry-choice-modal" class="modal-overlay picker-modal" aria-hidden="true">
  <div
    class="modal-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="payment-entry-choice-title"
  >
    <section class="card">
      <div class="modal-header">
        <h2 id="payment-entry-choice-title">선택</h2>
        <button
          type="button"
          id="btn-payment-entry-choice-close"
          class="modal-close-x"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <div class="center-button-row">
        <button type="button" id="btn-payment-entry-choose-customer" class="btn-primary">
          거래처 선택
        </button>
        <button type="button" id="btn-payment-entry-choose-ledger" class="btn-secondary">
          장부 선택
        </button>
      </div>
    </section>
  </div>
</div>
`;

const TRN_SUPPLIER_PICKER_MODAL_HTML = `
<div id="trn-supplier-picker-modal" class="modal-overlay picker-modal" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="trn-supplier-picker-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="trn-supplier-picker-title">거래처 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-trn-supplier-picker-close">×</button>
      </div>

      <div class="table-action-box">
        <span class="table-action-text">거래처를 선택하세요.</span>
        <div class="table-action-buttons picker-actions--nowrap">
          <input type="text" id="trn-supplier-picker-search" placeholder="검색: 거래처" class="customer-search-input" />
          <button type="button" id="btn-trn-supplier-picker-confirm" class="btn-primary">선택</button>
          <button type="button" id="btn-trn-supplier-picker-reset" class="btn-secondary">조회</button>
          <button type="button" id="btn-trn-supplier-picker-close" class="btn-secondary">닫기</button>
        </div>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-item-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table">
              <thead>
                <tr>
                  <th>구분</th>
                </tr>
              </thead>
              <tbody id="trn-supplier-picker-type-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box payment-import-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="trn-supplier-picker-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box payment-import-customer-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table">
              <colgroup>
                <col class="col-name" />
                <col class="col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-name">거래처</th>
                  <th class="col-balance">현잔액</th>
                </tr>
              </thead>
              <tbody id="trn-supplier-picker-customer-list"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;

const TRN_ITEM_PICKER_MODAL_HTML = `
<div id="trn-item-picker-modal" class="modal-overlay picker-modal" aria-hidden="true">
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="trn-item-picker-title">
    <section class="card">
      <div class="modal-header">
        <h2 id="trn-item-picker-title">품목 선택</h2>
        <button type="button" class="modal-close-x" aria-label="닫기" data-click="#btn-trn-item-picker-close">×</button>
      </div>

      <div class="table-action-box">
        <span id="trn-item-picker-action-text" class="table-action-text">품목을 선택하세요.</span>
        <div class="table-action-buttons picker-actions--nowrap">
          <input type="text" id="trn-item-picker-search" placeholder="검색: 품목" class="customer-search-input" />
          <button type="button" id="btn-trn-item-picker-confirm" class="btn-primary">선택</button>
          <button type="button" id="btn-trn-item-picker-reset" class="btn-secondary">조회</button>
          <button type="button" id="btn-trn-item-picker-close" class="btn-secondary">닫기</button>
        </div>
      </div>

      <div class="purchase-item-layout picker-layout picker-box">
        <div class="table-box purchase-item-group-box picker-left">
          <div class="table-wrapper">
            <table class="tx-table">
              <thead>
                <tr>
                  <th>분류</th>
                </tr>
              </thead>
              <tbody id="trn-item-picker-group-list"></tbody>
            </table>
          </div>
        </div>

        <div class="table-box payment-import-customer-box picker-right">
          <div class="table-wrapper">
            <table class="tx-table">
              <colgroup>
                <col class="col-name" />
              </colgroup>
              <thead>
                <tr>
                  <th class="col-name">품목</th>
                </tr>
              </thead>
              <tbody id="trn-item-picker-item-list"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;

function appendHtmlToBody(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(html || '').trim();
  const el = wrapper.firstElementChild;
  if (!el) return null;
  document.body.appendChild(el);
  return el;
}

function ensureHtmlExistsById(id, html) {
  if (typeof document === 'undefined') return null;
  if (document.getElementById(id)) return document.getElementById(id);
  return appendHtmlToBody(html);
}

export function ensurePurchaseItemModalExists() {
  return ensureHtmlExistsById(PURCHASE_ITEM_MODAL_ID, PURCHASE_ITEM_MODAL_HTML);
}

export function ensurePurchaseSupplierPickerModalExists() {
  return ensureHtmlExistsById(
    PURCHASE_SUPPLIER_PICKER_MODAL_ID,
    PURCHASE_SUPPLIER_PICKER_MODAL_HTML,
  );
}

export function ensureSalesItemModalExists() {
  return ensureHtmlExistsById(SALES_ITEM_MODAL_ID, SALES_ITEM_MODAL_HTML);
}

export function ensureSalesSupplierPickerModalExists() {
  return ensureHtmlExistsById(
    SALES_SUPPLIER_PICKER_MODAL_ID,
    SALES_SUPPLIER_PICKER_MODAL_HTML,
  );
}

export function ensurePaymentImportCustomerModalExists() {
  return ensureHtmlExistsById(
    PAYMENT_IMPORT_CUSTOMER_MODAL_ID,
    PAYMENT_IMPORT_CUSTOMER_MODAL_HTML,
  );
}

export function ensurePaymentEntryChoiceModalExists() {
  return ensureHtmlExistsById(
    PAYMENT_ENTRY_CHOICE_MODAL_ID,
    PAYMENT_ENTRY_CHOICE_MODAL_HTML,
  );
}

export function ensureTrnSupplierPickerModalExists() {
  return ensureHtmlExistsById(
    TRN_SUPPLIER_PICKER_MODAL_ID,
    TRN_SUPPLIER_PICKER_MODAL_HTML,
  );
}

export function ensureTrnItemPickerModalExists() {
  return ensureHtmlExistsById(
    TRN_ITEM_PICKER_MODAL_ID,
    TRN_ITEM_PICKER_MODAL_HTML,
  );
}

// 피커 모달들을 "HTML 한 덩어리"로 공통화해서 한 번에 주입하는 진입점
// - 필요 없는 모달이 DOM에 있어도 동작에는 영향이 없고(aria-hidden),
//   중복 ID만 피하면 된다.
export function ensureCommonPickerModals(options = {}) {
  const page = String(options?.page || '').trim().toLowerCase();

  // 기본값: 전체 주입(기존 동작 유지)
  if (!page) {
    ensurePurchaseItemModalExists();
    ensurePurchaseSupplierPickerModalExists();
    ensurePaymentImportCustomerModalExists();
    ensurePaymentEntryChoiceModalExists();
    ensureTrnSupplierPickerModalExists();
    ensureTrnItemPickerModalExists();
    return;
  }

  // 페이지별 필요한 것만 주입
  switch (page) {
    case 'sales':
      ensureSalesItemModalExists();
      ensureSalesSupplierPickerModalExists();
      return;
    case 'purchase':
      ensurePurchaseItemModalExists();
      ensurePurchaseSupplierPickerModalExists();
      return;
    case 'expense':
      ensurePurchaseSupplierPickerModalExists();
      return;
    case 'payment':
      ensurePaymentImportCustomerModalExists();
      ensurePaymentEntryChoiceModalExists();
      return;
    case 'transaction-report':
    case 'transaction_report':
    case 'report':
      ensureTrnSupplierPickerModalExists();
      ensureTrnItemPickerModalExists();
      return;
    default:
      // 알 수 없는 값이면 안전하게 전체 주입
      ensurePurchaseItemModalExists();
      ensurePurchaseSupplierPickerModalExists();
      ensurePaymentImportCustomerModalExists();
      ensurePaymentEntryChoiceModalExists();
      ensureTrnSupplierPickerModalExists();
      ensureTrnItemPickerModalExists();
      return;
  }
}
