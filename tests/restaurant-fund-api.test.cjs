const assert=require('node:assert/strict');const vm=require('node:vm');
(async()=>{
 let mode='ok',calls=0;const saved=new Map();
 const context={Intl,Date,Number,JSON,String,Math,Error,sessionIdentity:()=> 'u',sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},rpc:async(name,body)=>{calls++;if(mode==='network')throw Error('network');if(mode==='reject'){const e=Error('rejected');e.status=400;throw e}return {entries:[]}}};
 vm.createContext(context);vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/restaurant-fund-api.js'),'utf8').split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)).replaceAll('export ',''),context);
 assert.equal(vm.runInContext("paidFor({allocations:[{purchase_id:-1,amount:200000}]},-1)",context),200000);
 assert.equal(vm.runInContext("dueFor({allocations:[{purchase_id:-1,amount:200000}]},{id:-1,amount:360500})",context),160500);
 mode='network';await assert.rejects(vm.runInContext("fundWrite('post',{id:'same',amount:1})",context));assert.equal(saved.size,1);
 await assert.rejects(vm.runInContext("fundWrite('post',{id:'different',amount:1})",context));assert.equal(calls,1);
 mode='ok';await vm.runInContext('loadFunds()',context);assert.equal(saved.size,0);assert.equal(calls,2);
 mode='reject';await assert.rejects(vm.runInContext("fundWrite('post',{id:'bad',amount:1})",context));assert.equal(saved.size,0);
 console.log('PASS: outstanding amount and durable same-request retry; distinct retry blocked; rejected request cleared.');
})().catch(e=>{console.error(e);process.exit(1)});
