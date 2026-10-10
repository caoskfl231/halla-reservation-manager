const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('payment deletion submits linked transactions and transfer rows once, then renders once',async()=>{
 const context=vm.createContext({console});
 const dialogs=new vm.SyntheticModule(['confirmDialog','showToast','warningDialog'],function(){this.setExport('confirmDialog',async()=>true);this.setExport('showToast',()=>{});this.setExport('warningDialog',async()=>{});},{context});
 const mod=new vm.SourceTextModule(fs.readFileSync('js/payment-manage/payment-actions-manager.js','utf8'),{context});
 await mod.link(()=>dialogs);await mod.evaluate();
 const button={},calls=[];let renders=0;
 mod.namespace.bindPaymentActions({
  btnPaymentDelete:button,getSelectedMainRowId:()=> 'transfer-out',
  getAllLedgerTx:async()=>[{id:'transfer-out',kind:'이체',flow:'out',groupId:'group'},{id:'transfer-in',kind:'이체',flow:'in',groupId:'group'},{id:'unrelated'}],
  getTransactions:async()=>[{id:1,ledgerTxId:'transfer-out',fromPayment:true},{id:2,ledgerTxId:'other',fromPayment:true}],
  isPaymentLinkedTransaction:row=>row.fromPayment,
  saveTransactionBatch:async batch=>calls.push(JSON.parse(JSON.stringify(batch))),
  deleteTransaction:()=>assert.fail('per-row delete'),deleteLedgerTxById:()=>assert.fail('per-row ledger delete'),
  render:async()=>{renders++},refreshCashflowSummary:()=>assert.fail('render already refreshes the summary'),
 });
 await button.onclick();
 assert.deepEqual(calls,[{remove:[1],removeLedger:['transfer-out','transfer-in']}]);assert.equal(renders,1);
});
test('modified page modules and database wrappers parse',()=>{
 for(const path of ['js/db-cloud.js','js/indexeddb-adapter.js','js/sales-manage.js','js/purchase-manage.js','js/expense-manage.js','js/payment-manage.js']) new vm.SourceTextModule(fs.readFileSync(path,'utf8'));
});
