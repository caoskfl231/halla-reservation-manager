const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

async function setup(mode = 'purchaseCost') {
  const handlers = {};
  let taxType = '면세';
  const row = { quantity: 2, unitPrice: 15000, amount: 30000, shrinkPercent: 10000, marginRate: 33.3 };
  const fields = {};
  const views = {};
  const tr = {
    dataset: { entryIndex: '0' },
    querySelector(selector) {
      for (const part of selector.split(',')) {
        const match = part.match(/data-(field|view)="([^"]+)"/);
        if (match) {
          const value = (match[1] === 'field' ? fields : views)[match[2]];
          if (value) return value;
        }
      }
      return null;
    },
  };
  class Element {}
  class Input extends Element {
    constructor(key, value) { super(); this.key = key; this.value = String(value); }
    getAttribute(name) { return name === 'data-field' ? this.key : null; }
    closest(selector) { return selector === 'tr.purchase-entry-row' ? tr : null; }
    setCustomValidity(message) { this.validationMessage = message; }
    reportValidity() { return !this.validationMessage; }
  }
  const initial = { itemCode:'beef', itemName:'한우', spec:'', unit:'kg', qty:2, unitPrice:15000, amount:30000, purchaseUnitCost:10000, purchaseTotalCost:20000, margin:10000, marginRate:33.3, shrinkPercent:10, shrinkPrice:0 };
  for (const [key,value] of Object.entries(initial)) {
    fields[key] = new Input(key,value);
    views[key] = { textContent:'' };
  }
  const context = vm.createContext({ HTMLElement:Element, HTMLInputElement:Input });
  const module = new vm.SourceTextModule(fs.readFileSync('js/common/entry-table-manager.js','utf8'), { context });
  await module.link(() => {}); await module.evaluate();
  const manager = module.namespace.createEntryTableManager({
    entryBody: { addEventListener(type, fn) { handlers[type] = fn; } }, entryRowTemplate: {},
    derivedMode:mode, getPendingEntries:()=>[], getEntryDraftRow:()=>row,
    getTaxType:()=>taxType,
    onMarginPriceChange:()=>{ taxType='면세'; },
    calculateRowAmounts(q,p,t) { const supplyAmount=Math.round(q*p); const taxAmount=t==='과세10%'?Math.round(supplyAmount*.1):0; return {supplyAmount,taxAmount,amount:supplyAmount+taxAmount}; },
    inferRowFromAmount(q,a) {return {unitPrice:a/q,supplyAmount:a,taxAmount:0};},
    formatMoney:String,formatQuantity:String,
  });
  manager.bind();
  return { row,fields,views, setTax(t){taxType=t;}, input(key,value) {fields[key].value=String(value);handlers.input({target:fields[key]});} };
}

test('sales target margin reprices without VAT, direct price and quantity recalculate results', async()=>{
  const s=await setup();
  s.setTax('과세10%');
  s.input('marginRate',50);
  assert.equal(s.row.unitPrice,20000);
  assert.equal(s.row.amount,40000);
  assert.equal(s.row.taxAmount,0);
  assert.equal(s.row.shrinkPrice,20000);
  assert.equal(s.row.margin,20000);
  assert.equal(s.views.margin.textContent,'20000');
  assert.equal(s.views.marginRate.textContent,'50%');
  s.input('unitPrice',25000);
  assert.equal(s.row.marginRate,60);
  s.input('qty',3);
  assert.equal(s.row.amount,75000);
  assert.equal(s.row.margin,45000);
  s.input('amount',60000);
  assert.equal(s.row.unitPrice,20000);
  assert.equal(s.row.marginRate,50);
  s.input('marginRate',40);
  assert.equal(s.row.unitPrice,16667);
  assert.equal(s.row.amount,50001);
  assert.equal(s.row._amountManual,false);
  s.input('marginRate',0);
  assert.equal(s.row.unitPrice,10000);
  assert.equal(s.row.margin,0);
});

test('invalid margin or missing cost does not overwrite selling price',async()=>{
  const s=await setup();
  for (const value of [100,101,-1,'']) {
    s.input('marginRate',value);
    assert.equal(s.row.unitPrice,15000);
    assert.ok(s.fields.marginRate.validationMessage);
  }
  s.input('purchaseUnitCost',0);
  s.input('marginRate',50);
  assert.equal(s.row.unitPrice,15000);
  assert.match(s.fields.marginRate.validationMessage,/매입가/);
  s.input('purchaseUnitCost',10000);
  s.input('marginRate',50);
  assert.equal(s.row.unitPrice,20000);
});

test('purchase shrink mode still calculates its original margin without repricing',async()=>{
  const s=await setup('shrink');
  s.input('marginRate',50);
  assert.equal(s.row.unitPrice,15000);
  assert.equal(s.row.shrinkPrice,16667);
  assert.equal(s.row.margin,8334);
});
