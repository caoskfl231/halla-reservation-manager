const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const page of ['sales', 'purchase', 'expense']) {
  test(`${page}: opening and automatic refresh do not query transactions; explicit selection enables querying`, async () => {
    const source = fs.readFileSync(`js/${page}-manage.js`, 'utf8');
    const name = page === 'expense' ? 'reloadExpenseTransactions' : 'reloadPurchaseList';
    // Exercise the actual production query entry, stopping at the first DB read.
    const start = source.indexOf(`async function ${name}() {`);
    const read = source.indexOf(page === 'expense' ? '  try {' : '  const [list,', start);
    const gate = source.slice(start, read);
    let reads = 0;
    let renders = 0;
    const context = vm.createContext({
      transactionViewRequested: false,
      refreshSummaryAndDetail: () => renders++,
      refreshExpenseView: () => renders++,
      readDatabase: () => reads++,
    });
    vm.runInContext(`${gate} readDatabase(); }`, context);
    await context[name]();
    await context[name](); // background refresh before selection
    assert.equal(reads, 0);
    assert.equal(renders, 2);
    context.transactionViewRequested = true; // customer click or 전체보기
    await context[name]();
    assert.equal(reads, 1);
    const customerHandler = source.slice(source.indexOf('// 왼쪽 거래처 목록:'));
    assert.match(customerHandler, /currentSupplierFilterId = id;\s*transactionViewRequested = true;/);
    const reset = source.slice(source.indexOf('if (btnGroupReset) {'));
    assert.match(reset, /currentSupplierFilterId = "";\s*transactionViewRequested = true;/);
    assert.match(reset, new RegExp(`await ${name}\\(\\)`));
  });
}

test('payment starts with a prompt, defers legacy repair, and enables querying on ledger selection or 전체보기', async () => {
  const source = fs.readFileSync('js/payment-manage.js', 'utf8');
  const start = source.indexOf('async function render() {');
  const end = source.indexOf('  if (!transactionPreparation)', start);
  const tbody = { innerHTML: '' };
  let reads = 0;
  const context = vm.createContext({ transactionViewRequested: false, $: () => tbody, readDatabase: () => reads++ });
  vm.runInContext(`${source.slice(start, end)} readDatabase(); }`, context);
  await context.render();
  assert.equal(reads, 0);
  assert.match(tbody.innerHTML, /전체보기/);
  context.transactionViewRequested = true;
  await context.render();
  assert.equal(reads, 1);
  const init = source.slice(source.indexOf('(async function init()'));
  assert.doesNotMatch(init, /await (?:migrateLegacy|backfillLedger|repairLedger)/);
  assert.match(source, /window\._mainTxFilterCode = code;\s*transactionViewRequested = true;/);
  assert.match(source, /btnCashflowReset\.addEventListener\("click", \(\) => \{ transactionViewRequested = true;/);
});

test('cashflow initial and automatic refresh leave the ledger list empty without reading ledger data', async () => {
  const source = fs.readFileSync('js/cashflow-manage.js', 'utf8');
  const start = source.indexOf('async function reloadList() {');
  const end = source.indexOf('  try {', start);
  let reads = 0;
  const body = { innerHTML: '' };
  const context = vm.createContext({ transactionViewRequested: false, listBody: body, renderList: () => {}, readDatabase: () => reads++ });
  vm.runInContext(`${source.slice(start, end)} readDatabase(); }`, context);
  await context.reloadList();
  await context.reloadList();
  assert.equal(reads, 0);
  assert.match(body.innerHTML, /전체보기/);
  context.transactionViewRequested = true;
  await context.reloadList();
  assert.equal(reads, 1);
  const init = source.slice(source.indexOf('async function init()'));
  assert.doesNotMatch(init, /await repairLedgerTx/);
  assert.match(source, /selectedTypeCode = String\(row\?\.dataset\?\.code \|\| ''\);\s*transactionViewRequested = true;/);
  assert.match(source, /btn-cashflow-view-all/);
});

test('expense renders only a prompt with zero totals until a supplier or all is selected', () => {
  const source = fs.readFileSync('js/expense-manage.js', 'utf8');
  const start = source.indexOf('function refreshExpenseView() {');
  const end = source.indexOf('  const keyword', start);
  const body = { innerHTML: '' };
  const totals = Array.from({ length: 4 }, () => ({ textContent: '999' }));
  let rendered = 0;
  const context = vm.createContext({ transactionViewRequested: false, purchaseSummaryBody: body, countSpan: totals[0], summaryTotalAmountSpan: totals[1], summaryTotalPaymentSpan: totals[2], summaryTotalBalanceSpan: totals[3], renderRows: () => rendered++ });
  vm.runInContext(`${source.slice(start, end)} renderRows(); }`, context);
  context.refreshExpenseView();
  assert.equal(rendered, 0);
  assert.match(body.innerHTML, /지출처/);
  assert(totals.every(el => el.textContent === '0'));
  context.transactionViewRequested = true;
  context.refreshExpenseView();
  assert.equal(rendered, 1);
});

test('home skips the transaction-table job initially; selecting an item or all enables it', async () => {
  const source = fs.readFileSync('js/main.js', 'utf8');
  const start = source.indexOf('  const displayForTable = homeTransactionViewRequested');
  const end = source.indexOf('  if (generation', start);
  const jobs = [];
  const context = vm.createContext({ homeTransactionViewRequested: false, displayRows: [{ vendor: '연경' }], homeDashboardFilter: { mode: 'summary', type: '매출' }, homeSearchQuery: '', dateFrom: '2026-10-01', dateTo: '2026-10-10', runHomeJob: async job => { jobs.push(job); return job.rows; } });
  vm.runInContext(`async function tableRows() { ${source.slice(start, end)} return displayForTable; }`, context);
  assert.equal((await context.tableRows()).length, 0);
  assert.equal(jobs.length, 0);
  context.homeTransactionViewRequested = true;
  assert.equal((await context.tableRows()).length, 1);
  assert.equal(jobs[0].filter.type, '매출');
  context.homeDashboardFilter = null; // 전체보기
  await context.tableRows();
  assert.equal(jobs[1].filter, null);
  assert.match(source, /async function applyHomeDashboardFilter\(filter\) \{\s*homeTransactionViewRequested = true;/);
  assert.match(source, /btn-home-view-all[\s\S]*await applyHomeDashboardFilter\(null\)/);
});
