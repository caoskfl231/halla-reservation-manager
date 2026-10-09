const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/db-cloud.js','utf8');
const exportedNames = [...source.matchAll(/export const (\w+)/g)].map(m=>m[1]);
const snapshot = () => ({meta:{dbName:'hallapa_db',dbVersion:13,exportedAt:new Date().toISOString(),app:'hallapa'},stores:{transactions:[],items:[],customers:[]}});
const copy = x=>structuredClone(x);
let remote={snapshot:snapshot(),revision:1,role:'owner',updated_at:new Date().toISOString()}, loseResponse=false;
async function client(){
 let local;
 const elements = new Map();
 function el(){return {style:{},remove(){},after(){},prepend(){},innerHTML:'',textContent:'',addEventListener(){}};}
 const context=vm.createContext({console,Set,Map,Date,JSON,Promise,Error,Object,Array,String,Number,setInterval(){},document:{visibilityState:'visible',body:el(),createElement:el,getElementById(id){if(!elements.has(id))elements.set(id,el());return elements.get(id);}},window:{confirm(){return true;}},location:{reload(){}},indexedDB:{},structuredClone});
 const cacheFns=Object.fromEntries(exportedNames.map(name=>[name,async(...args)=>{
  if(name==='restoreHallapaDbSnapshot'){local=copy(args[0]);return;}
  if(name==='exportHallapaDbSnapshot')return copy(local);
  if(name==='getTransactions')return copy(local.stores.transactions||[]);
  if(name==='getItems')return copy(local.stores.items||[]);
  if(name==='getCustomers')return copy(local.stores.customers||[]);
  if(name==='addTransaction'){let row=copy(args[0]);row.id=row.id||local.stores.transactions.length+1;local.stores.transactions.push(row);return;}
  if(name==='updateTransaction'){let row=copy(args[0]);local.stores.transactions=local.stores.transactions.map(x=>x.id===row.id?row:x);return;}
  if(name==='deleteTransaction'){local.stores.transactions=local.stores.transactions.filter(x=>x.id!==args[0]);return;}
  if(name.startsWith('get'))return [];
 }]));
 cacheFns.closeCloudCache=()=>{};
 const sessionFns={requireLedgerSession:async()=>copy(remote),friendlyError:e=>e.message,signOut:async()=>{},rpc:async(name,body)=>{
  if(name==='halla_ledger_read')return copy(remote);
  if(body.p_revision!==remote.revision)throw Error('LEDGER_CONFLICT');
  remote={...remote,snapshot:copy(body.p_snapshot),revision:remote.revision+1};
  if(loseResponse){loseResponse=false;throw Error('network response lost');}
  return copy(remote);
 }};
 function moduleOf(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});}
 const modules={'./db-cloud-cache.js':moduleOf(cacheFns),'./cloud-session.js':moduleOf(sessionFns),'./common/app-events.js':moduleOf({emitAppEvent(){}})};
 const m=new vm.SourceTextModule(source,{context});await m.link(name=>modules[name]);await m.evaluate();return m.namespace;
}
(async()=>{
 const a=await client(),b=await client();
 await a.addTransaction({date:'2026-10-09',totalAmount:1000});
 assert.equal(remote.snapshot.stores.transactions.length,1);
 await assert.rejects(b.addTransaction({totalAmount:2000}),/LEDGER_CONFLICT/);
 assert.equal(remote.snapshot.stores.transactions.length,1);
 assert.equal((await b.getTransactions()).length,0,'failed mutation rolls back');
 await assert.rejects(b.addTransaction({totalAmount:2000}),/최신/);
 await a.updateTransaction({id:1,totalAmount:1500});
 assert.equal(remote.snapshot.stores.transactions[0].totalAmount,1500);
 const c=await client();assert.equal((await c.getTransactions())[0].totalAmount,1500,'new device reads saved ledger');
 loseResponse=true;
 await assert.rejects(c.addTransaction({totalAmount:3000}),/network/);
 assert.equal(remote.snapshot.stores.transactions.length,2,'committed but lost response');
 await assert.rejects(c.addTransaction({totalAmount:3000}),/최신/);
 assert.equal(remote.snapshot.stores.transactions.length,2,'no automatic duplicate retry');
 remote={snapshot:snapshot(),revision:0,role:'owner',updated_at:new Date().toISOString()};
 const d=await client();await assert.rejects(d.addTransaction({totalAmount:1}),/먼저/);
 const bad=snapshot();bad.stores.transactions=[{id:1},{id:1}];
 await assert.rejects(d.restoreHallapaDbSnapshot(bad),/중복/);assert.equal(remote.revision,0);
 const valid=snapshot();valid.stores.transactions=[{id:7,totalAmount:1234}];
 await d.restoreHallapaDbSnapshot(valid);assert.equal(remote.revision,1);assert.equal(remote.snapshot.stores.transactions[0].id,7);
 console.log('PASS: cross-device reads, CRUD, conflict rollback, lost-response duplicate prevention, initial import, invalid backup rejection');
})().catch(error=>{console.error(error);process.exitCode=1;});
