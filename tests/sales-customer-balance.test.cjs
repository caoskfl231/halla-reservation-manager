const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
test('dashboard uses sales customer remaining balances including carryover and discounts', async () => {
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(fs.readFileSync('js/common/sales-customer-balance.js', 'utf8'), { context });
  await module.link(() => {}); await module.evaluate();
  const { buildSalesCustomerBalances, getSalesCustomerRemainingBalance } = module.namespace;
  const customers = [{ id:'one', name:'같은이름', openingBalance:100000 }, { id:'two', name:'같은이름', openingBalance:70000 }, { id:'zero', openingBalance:30000 }];
  const tx = [
    { supplierId:'one', date:'2026-09-30', amount:50000, payment:10000 },
    { supplierId:'one', date:'2026-10-01', amount:20000 },
    { supplierId:'one', date:'2026-10-10', payment:30000, paymentDiscount:5000 },
    { supplierId:'one', date:'2026-10-11', amount:999999 },
    { supplierId:'two', date:'2026-10-05', payment:20000 },
    { supplierId:'zero', date:'2026-10-05', payment:30000 },
    { supplierId:'one', amount:999999 },
  ];
  const balances = buildSalesCustomerBalances(customers, tx, '2026-10-10');
  assert.equal(balances.get('one'),125000,'includes opening, prior transactions, end date and discount');
  assert.equal(balances.get('two'),50000,'identical names do not mix customer IDs');
  assert.equal(balances.get('zero'),0,'fully paid customer has zero remaining balance');
  assert.equal(balances.get('one'),getSalesCustomerRemainingBalance(customers[0],tx.filter(row=>row.supplierId==='one'),'2026-10-10'));
  assert.equal(buildSalesCustomerBalances(customers,tx).get('one'),1124999,'no end date uses current balance as sales page does');
  assert.equal(getSalesCustomerRemainingBalance({openingBalance:-10000},[{date:'2026-10-01',payment:1000}]),-11000,'credit balances retain sign');
  const main=fs.readFileSync('js/main.js','utf8');
  const sales=fs.readFileSync('js/sales-manage.js','utf8');
  assert.ok(main.includes('buildSalesCustomerBalances('));
  assert.ok(main.includes('if (r?.remainingSalesBalance != null) return r.remainingSalesBalance;'));
  assert.ok(sales.includes('return getSalesCustomerRemainingBalance(sup, related);'));
  new vm.SourceTextModule(main,{context}); new vm.SourceTextModule(sales,{context});
});
