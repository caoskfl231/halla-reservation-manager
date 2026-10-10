const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('payment type balances refresh from the displayed ledger snapshot and include every item through the cutoff', async () => {
  const context = vm.createContext({ document: { createElement: () => ({ dataset: {}, innerHTML: '', classList: { add() {} } }) } });
  const source = fs.readFileSync('js/payment-manage/payment-cashflow-summary.js', 'utf8');
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(async () => {
    const stub = new vm.SyntheticModule(['bindClickRowSelect'], function () { this.setExport('bindClickRowSelect', () => {}); }, { context });
    return stub;
  });
  await mod.evaluate();
  const rows = [];
  const body = { innerHTML: '', appendChild: row => rows.push(row) };
  const total = { textContent: '' };
  const txs = [
    { cashflowItemCode: 'A0002', flow: 'in', amount: 34172000, date: '2026-10-01' },
    { cashflowItemCode: 'A0002', flow: 'out', amount: 31329000, date: '2026-10-01' },
    { cashflowItemCode: 'A0006', flow: 'in', amount: 100000, date: '2025-12-31' },
    { cashflowItemCode: 'A0007', flow: 'out', amount: 50000, date: '2026-10-10' },
    { cashflowItemCode: 'A0002', flow: 'out', amount: 999999, date: '2026-10-11' },
  ];
  const options = {
    cashflowListBody: body, cashflowTotalSpan: total,
    cashflowTypes: [{ code: 'A02', name: '현금' }],
    cashflowItems: [
      { code: 'A0002', typeCode: 'A02', name: '매장현금', openingBalance: 0 },
      { code: 'A0006', typeCode: 'A02', name: '조해권현금', openingBalance: 0 },
      { code: 'A0007', typeCode: 'A02', name: '홍동국현금', openingBalance: 0 },
    ],
    ledgerTransactions: txs, cutoffDate: '2026-10-10', methodTab: 'all',
    getAllLedgerTx: () => { throw Error('Must reuse the displayed snapshot'); },
  };
  await mod.namespace.renderCashflowSummaryTable(options);
  assert.equal(rows[0].dataset.balance, '2893000', '2,843,000 + other cash ledger balances');
  assert.equal(total.textContent.replace(/,/g, ''), '2893000');
  rows.length = 0;
  await mod.namespace.renderCashflowSummaryTable({ ...options, balancesLoaded: false, ledgerTransactions: [] });
  assert.match(rows[0].innerHTML, /—/);
  assert.equal(total.textContent, '—', 'not-yet-loaded balances must not look like actual zeroes');
});

test('payment render refreshes left type balances with the same transaction object before rendering the right table', async () => {
  const source = fs.readFileSync('js/payment-manage.js', 'utf8');
  const start = source.indexOf('  const txAll = await getAllLedgerTx();', source.indexOf('async function render()'));
  const end = source.indexOf('  const tbody', start);
  const snapshot = [{ amount: 2843000 }];
  let reads = 0, seen;
  const context = vm.createContext({ getAllLedgerTx: async () => { reads++; return snapshot; }, renderCashflowSummaryTable: async txs => { seen = txs; } });
  vm.runInContext(`async function refresh() { ${source.slice(start, end)} }`, context);
  await context.refresh();
  assert.equal(reads, 1);
  assert.equal(seen, snapshot);
});
