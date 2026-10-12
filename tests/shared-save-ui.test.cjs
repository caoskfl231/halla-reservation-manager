const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plain=x=>JSON.parse(JSON.stringify(x));
async function importModule(path,context,dependencies={}){
 const module=new vm.SourceTextModule(fs.readFileSync(path,'utf8'),{context});
 await module.link(name=>{const values=dependencies[name.split('?')[0]];if(!values)throw Error(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await module.evaluate();return module.namespace;
}
const types=[{code:'A01',name:'법인통장'},{code:'A02',name:'현금'}],items=[{code:'A0001',name:'법인통장',typeCode:'A01'},{code:'A0002',name:'현금',typeCode:'A02'}];
test('payment import submits normal linked records and both transfer sides in one batch; failure retains input',async()=>{
 for(const fail of [false,true]){
  let sequence=0,calls=[],renders=0,closed=0,warnings=0;
  const context=vm.createContext({console,crypto:{randomUUID:()=>String(++sequence)},Date});
  const module=await importModule('js/payment-manage/payment-import-manager.js',context,{'../common/dialogs.js':{confirmDialog:async()=>true,showToast:()=>{},warningDialog:async()=>warnings++}});
  let records=[{date:'2026-10-12',flow:'out',mode:'out',category:'매입결제',supplierId:'s',customerId:'s',amount:100,vendor:'매입처'},{date:'2026-10-11',flow:'in',mode:'in',category:'매출',customerId:'c',amount:200,vendor:'매출처'},{date:'2026-10-10',flow:'out',mode:'transfer',category:'기타',transferLedgerCode:'A0002',amount:300,vendor:'현금'}];
  const button={};module.bindPaymentImportManager({btnPaymentImportSave:button,IMPORT_MODE_NORMAL:'normal',IMPORT_MODE_TRANSFER:'transfer',getImportRecords:()=>records,setImportRecords:r=>records=r,getSelectedCashflowTypeForEntry:()=> 'A01',getSelectedCashflowItemForEntry:()=> 'A0001',cashflowTypes:types,cashflowItems:items,
   getCustomers:async()=>[{id:'s',name:'매입처',type:'매입처'},{id:'c',name:'매출처',type:'매출처'}],getAllLedgerTx:async()=>[],getTransactions:async()=>[],ensureLedgerTxKeys:x=>x,inferLedgerPaymentMethod:()=> 'bank',normalizeVendorName:x=>x,buildLinkedTransactionMemo:({memo})=>memo||'',findSupplierForVendor:()=>null,findCustomerForVendor:()=>null,
   saveTransactionBatch:async batch=>{calls.push(plain(batch));if(fail)throw Error('network response lost');},addTransaction:()=>assert.fail('per-row add'),putLedgerTx:()=>assert.fail('per-row ledger save'),
   getImportVendorPrefs:()=>({}),saveImportVendorPrefs:()=>{},renderPaymentImportTable:()=>{},render:async()=>renders++,refreshCashflowSummary:()=>assert.fail('duplicate summary'),closePaymentImportModal:()=>closed++,paymentImportModalManager:{markClean(){}},
   findAnyDuplicateLedgerBatchesBeforeSave:async()=>null,findAnyDuplicateSimplePaymentTransactionsBeforeSave:async()=>null,
  });
  await button.onclick();assert.equal(calls.length,1);assert.equal(calls[0].ledger.length,4);assert.equal(calls[0].add.length,2);
  const transfer=calls[0].ledger.filter(x=>x.kind==='이체');assert.equal(transfer.length,2);assert.equal(transfer[0].groupId,transfer[1].groupId);assert.equal(calls[0].add[0].ledgerTxId,calls[0].ledger[0].id);
  assert.equal(records.length,fail?3:0);assert.equal(renders,fail?0:1);assert.equal(closed,fail?0:1);assert.equal(warnings,fail?1:0);assert.equal(button.disabled,false);
 }
});
test('manual payment updates the ledger and replaces linked invoices in one batch',async()=>{
 let sequence=0,renders=0;const calls=[],elements=new Map();
 for(const [id,value]of Object.entries({'payment-entry-date':'2026-10-12','payment-ledger-type-code':'A01','payment-cashflow-item-code':'A0001','payment-cashflow-item-name':'법인통장','payment-entry-amount':'100','payment-entry-counterparty':'supplier','payment-entry-counterparty-code':'supplier','payment-entry-memo':'메모'}))elements.set(id,{value,addEventListener(){}});
 const context=vm.createContext({console,crypto:{randomUUID:()=>String(++sequence)},Date,document:{getElementById:id=>elements.get(id)}});
 const module=await importModule('js/payment-manage/payment-form-manager.js',context,{'../common/dialogs.js':{showToast:()=>{},warningDialog:async()=>{}},'../common/util.js':{resolveDefaultCashflowNameByCode:x=>x}});
 const form={};module.bindPaymentForm({paymentForm:form,getEditId:()=> 'existing-ledger',setEditId:()=>{},getSelectedPaymentFlow:()=> 'out',cashflowTypes:types,cashflowItems:items,getEntryCounterpartyLedgerCode:()=>'',getEntryCounterpartyLedgerLabel:()=>'',inferLedgerPaymentMethod:()=> 'bank',ensureLedgerTxKeys:x=>x,parseNumber:Number,getSelectedOptionText:()=> '매입처',stripCodePrefix:x=>x,todayYMD:()=> '2026-10-12',getTransactions:async()=>[{id:10,ledgerTxId:'existing-ledger'}],deleteTransaction:()=>assert.fail('per-row delete'),putLedgerTx:()=>assert.fail('separate ledger save'),
  saveVendorTransactionIfMatched:async options=>options.transactionsToSave.push({amount:0,payment:options.amount,ledgerTxId:options.ledgerTxId}),saveTransactionBatch:async batch=>calls.push(plain(batch)),render:async()=>renders++,refreshCashflowSummary:()=>assert.fail('duplicate summary'),closePaymentModal:()=>{},confirmDuplicateLedgerBatchBeforeSave:async()=>true,
 });
 await Promise.all([form.onsubmit({preventDefault(){}}),form.onsubmit({preventDefault(){}})]);assert.equal(calls.length,1);assert.equal(calls[0].ledger.length,1);assert.equal(calls[0].ledger[0].id,'existing-ledger');assert.deepEqual(calls[0].remove,[10]);assert.equal(calls[0].add[0].ledgerTxId,'existing-ledger');assert.equal(renders,1);
});
test('shared receipt/payment/expense helper submits both records together',async()=>{
 const calls=[];const context=vm.createContext({crypto:{randomUUID:()=> 'shared-ledger'},Date});
 const module=await importModule('js/common/cashflow-payment-record.js',context,{'../db.js':{saveTransactionBatch:async batch=>calls.push(plain(batch))},'./ledger-tx-normalizer.js':{ensureLedgerTxKeys:x=>x},'./cashflow-item-helpers.js':{resolveCashflowItemSelectionOrThrow:async()=>({code:'A0001',name:'법인통장'})},'./payment-ledger-helpers.js':{inferLedgerPaymentMethod:()=> 'bank'},'./util.js':{buildLedgerMemoFields:()=>({}),stripCodePrefix:x=>x}});
 await module.saveCashflowLedgerLinkedPaymentRecord({actionLabel:'지불',date:'2026-10-12',supplierId:'s',supplierName:'매입처',accountCode:'A0001',amount:100,ledgerFlow:'out',ledgerEventType:'purchase_payment',ledgerSource:'purchase',transactionType:'expense',transactionCategory:'purchase',transactionSource:'purchase'});
 assert.equal(calls.length,1);assert.equal(calls[0].ledger[0].id,calls[0].add[0].ledgerTxId);assert.equal(calls[0].add[0].payment,100);
});
