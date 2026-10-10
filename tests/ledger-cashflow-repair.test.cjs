const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

(async () => {
  const items = [{ code: 'A0001', name: '통장', typeCode: 'A01' }, { code: 'A0002', name: '중복', typeCode: 'A02' }, { code: 'A0003', name: '중복', typeCode: 'A02' }];
  const rows = [
    { id: 'valid', cashflowItemCode: 'A0001', cashflowItemName: '통장' },
    { id: 'name', cashflowItemCode: 'A0001' },
    { id: 'type', accountId: 'A01' },
    { id: 'ambiguous', accountName: '중복' },
  ];
  const writes = [], storage = new Map();
  const context = vm.createContext({ console, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  function synthetic(values) { const mod = new vm.SyntheticModule(Object.keys(values), function () { for (const [name, value] of Object.entries(values)) this.setExport(name, value); }, { context }); return mod; }
  const dependencies = {
    db: synthetic({ getCashflowItems: async () => items, getCashflowTypes: async () => [{ code: 'A01', name: '법인통장' }], getAllLedgerTx: async () => rows, putLedgerTx: async row => writes.push(structuredClone(row)) }),
    keys: synthetic({ ensureLedgerTxKeys: row => row }),
    util: synthetic({ stripCodePrefix: text => String(text).replace(/^A\d+\s*/, '') }),
  };
  const module = new vm.SourceTextModule(fs.readFileSync('js/common/ledger-tx-cashflowitem-repair.js', 'utf8'), { context });
  await module.link(specifier => specifier.includes('db.js') ? dependencies.db : specifier.includes('normalizer') ? dependencies.keys : dependencies.util);
  await module.evaluate();
  const repair = module.namespace.repairLedgerTxCashflowItemFieldsIfNeeded;
  await repair();
  assert.ok(!writes.some(row => row.id === 'valid'), 'valid row remains untouched');
  assert.equal(rows.find(row => row.id === 'name').cashflowItemName, '통장');
  assert.equal(rows.find(row => row.id === 'type').cashflowItemCode, 'A0001');
  assert.equal(rows.find(row => row.id === 'ambiguous').cashflowItemCode, undefined, 'duplicate names never select an arbitrary code');
  rows.push({ id: 'later', cashflowCode: 'A0001' });
  await repair(); assert.equal(rows.at(-1).cashflowItemCode, 'A0001', 'later missing rows still repair after completion marker');
  // 다른 누락 레코드가 스캔을 통과시키지 않도록 코드 이름 레코드만 남긴다.
  for (const name of ['A0001', 'A05', '  A0001  ', '']) {
    rows.splice(0, rows.length, { id: 'code-only', cashflowItemCode: 'A0001', cashflowItemName: name });
    writes.length = 0;
    await repair();
    assert.equal(rows[0].cashflowItemName, '통장', 'code-only names repair after completion marker: ' + name);
    assert.equal(writes.length, 1);
    writes.length = 0;
    await repair();
    assert.equal(writes.length, 0, 'repaired names are left unchanged on later scans');
  }
  const payment = fs.readFileSync('js/payment-manage.js', 'utf8');
  assert.ok(payment.includes('await repairLedgerTxCashflowItemFieldsIfNeeded({ debug: DEBUG_BACKFILL })'));
  assert.ok(!payment.includes('function backfillLedgerTxCashflowItemFieldsIfMissing'));
  console.log('PASS: shared payment repair, valid rows unchanged, missing code/name, ambiguous names and later imports');
})().catch(error => { console.error(error); process.exitCode = 1; });
