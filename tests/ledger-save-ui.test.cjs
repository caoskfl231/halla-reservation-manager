const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 for(const file of ['js/sales-manage.js','js/purchase-manage.js']){
  const source=fs.readFileSync(file,'utf8');
  new vm.SourceTextModule(source);
  const normal=source.slice(source.indexOf('async function saveCurrentPurchaseImpl'),source.indexOf('form.addEventListener("submit"'));
  const pasted=source.slice(source.indexOf('async function saveImportRecordsImpl'),source.indexOf('if (btnImportParse'));
  assert(!/await addTransaction\(purchase\)/.test(normal+pasted),'no per-row network saves');
  assert(!/await deleteTransaction\(Number\(id\)\)/.test(normal),'replacement deletes join same commit');
  assert(normal.includes('saveTransactionBatch({ add: batchAdd, remove: batchRemove })'));
  assert(pasted.includes('saveTransactionBatch({ add: batchAdd })'));
  const buttons=[{disabled:false},{disabled:false},{disabled:false},{disabled:false}];
  let alerts=0,release,calls=0;
  const context=vm.createContext({btnSaveContinue:buttons[0],btnImportSave:buttons[1],btnImportContinue:buttons[2],form:{querySelector:()=>buttons[3]},alert:()=>alerts++});
  vm.runInContext(source.slice(source.indexOf('let transactionSaveBusy = false;'),source.indexOf('async function saveCurrentPurchase(options)')),context);
  const pending=context.guardTransactionSave(async()=>{calls++;await new Promise(resolve=>release=resolve);});
  assert(buttons.every(b=>b.disabled));
  await context.guardTransactionSave(async()=>calls++);
  assert.equal(calls,1,'double click blocked');release();await pending;
  assert(buttons.every(b=>!b.disabled));
  await context.guardTransactionSave(async()=>{throw Error('failed');});
  assert.equal(alerts,1);assert(buttons.every(b=>!b.disabled));
 }
 console.log('PASS: sales/purchase atomic entry paths, replacement, duplicate-click guard, error release, syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
