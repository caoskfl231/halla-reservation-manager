const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function extract(source,name){const start=source.indexOf(name),end=source.indexOf('\n}',start)+2;assert(start>=0&&end>start);return source.slice(start,end);}
test('invoice deletion recalculates weighted averages for all affected items from one read',async()=>{
 const source=fs.readFileSync('js/purchase-manage.js','utf8');let reads=0,writes=0;
 const items=[{id:'1',price:200,avgPrice:0},{id:'2',price:300,avgPrice:90}];
 const transactions=[{category:'purchase',itemId:'1',quantity:2,unitPrice:100,supplyAmount:200},{category:'purchase',itemId:'1',quantity:1,unitPrice:150,supplyAmount:150},{category:'purchase',itemId:'1',quantity:-2,supplyAmount:-400},{category:'sales',itemId:'1',quantity:999,supplyAmount:99999},{category:'purchase',itemId:'2',quantity:2,unitPrice:90}];
 const context=vm.createContext({console,items,transactionCategory:'purchase',getTransactions:async()=>{reads++;return transactions;},updateItem:async()=>writes++});
 vm.runInContext(extract(source,'function calculatePurchaseAveragePrices')+extract(source,'async function recomputeItemAveragePrices('),context);
 await context.recomputeItemAveragePrices(['1','2','1','missing']);assert.equal(reads,1);assert.equal(writes,1);assert.equal(items[0].avgPrice,117);assert.equal(items[0].price,200);assert.equal(items[1].avgPrice,90);
 await context.recomputeItemAveragePrices(['1','2']);assert.equal(reads,2);assert.equal(writes,1,'unchanged average does not save again');
});
