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
