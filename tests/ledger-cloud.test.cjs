const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/db-cloud.js','utf8');
const exportedNames = [...source.matchAll(/export const (\w+)/g)].map(m=>m[1]);
const snapshot = () => ({meta:{dbName:'hallapa_db',dbVersion:13,exportedAt:new Date().toISOString(),app:'hallapa'},stores:{transactions:[],items:[],customers:[]}});
const copy = x=>structuredClone(x);
let remote={snapshot:snapshot(),revision:1,role:'owner',updated_at:new Date().toISOString()}, loseResponse=false;
let nextId=1000000000000, nextVersion=1, recordVersions=new Map();
function withVersions(){return copy({...remote,row_versions:[...recordVersions].map(([token,version])=>{const [store,key]=JSON.parse(token);return {store,key,version};})});}
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
 const sessionFns={requireLedgerSession:async()=>withVersions(),friendlyError:e=>e.message,signOut:async()=>{},rpc:async(name,body)=>{
  if(name==='halla_ledger_read')return withVersions();
  if(name==='halla_ledger_reserve_transaction_id')return nextId++;
  if(name==='halla_ledger_patch'){
   for(const change of body.p_changes){const token=JSON.stringify([change.store,change.key]);if((recordVersions.get(token)||0)!==change.expected_version)throw Error('LEDGER_RECORD_CONFLICT');}
   for(const change of body.p_changes){
    const keyField=['customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups'].includes(change.store)?'code':'id';
    const rows=remote.snapshot.stores[change.store]||[];
    const filtered=rows.filter(row=>JSON.stringify(row[keyField])!==JSON.stringify(change.key));
    if(change.data!==null)filtered.push(copy(change.data));
    remote.snapshot.stores[change.store]=filtered;
    recordVersions.set(JSON.stringify([change.store,change.key]),nextVersion++);
   }
   remote.revision++;
  }else{
   if(body.p_revision!==remote.revision)throw Error('LEDGER_CONFLICT');
   remote={...remote,snapshot:copy(body.p_snapshot),revision:remote.revision+1};
   recordVersions.clear();
   for(const [store,rows] of Object.entries(remote.snapshot.stores)){const keyField=['customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups'].includes(store)?'code':'id';for(const row of rows)recordVersions.set(JSON.stringify([store,row[keyField]]),nextVersion++);}
  }
  if(loseResponse){loseResponse=false;throw Error('network response lost');}
  return withVersions();
 }};
 function moduleOf(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});}
 const modules={'./ledger-backups.js':moduleOf({installBackupPanel(){}}),'./db-cloud-cache.js':moduleOf(cacheFns),'./cloud-session.js':moduleOf(sessionFns),'./common/app-events.js':moduleOf({emitAppEvent(){}}), './cloud-records.js':new vm.SourceTextModule(fs.readFileSync('js/cloud-records.js','utf8'),{context})};
 const m=new vm.SourceTextModule(source,{context});await m.link(name=>modules[name.split('?')[0]]);await m.evaluate();return m.namespace;
}
(async()=>{
 const a=await client(),b=await client();
 await a.addTransaction({date:'2026-10-10',totalAmount:1000});
 await b.addTransaction({date:'2026-10-10',totalAmount:2000});
 assert.equal(remote.snapshot.stores.transactions.length,2,'distinct concurrent inserts both save');
 assert.equal(new Set(remote.snapshot.stores.transactions.map(row=>row.id)).size,2,'IDs unique on shared login');
 let c=await client(),d=await client();
 const [first,second]=copy(remote.snapshot.stores.transactions);
 await c.updateTransaction({...first,totalAmount:1500});
 await d.updateTransaction({...second,totalAmount:2500});
 assert.equal(remote.snapshot.stores.transactions.find(row=>row.id===first.id).totalAmount,1500);
 assert.equal(remote.snapshot.stores.transactions.find(row=>row.id===second.id).totalAmount,2500,'unrelated edit merges');
 // d must retain the first row baseline even after saving its unrelated second row.
 await assert.rejects(d.updateTransaction({...first,totalAmount:9999}),/LEDGER_RECORD_CONFLICT/);
 assert.equal(remote.snapshot.stores.transactions.find(row=>row.id===first.id).totalAmount,1500,'stale same-row edit cannot overwrite');
 assert.equal((await d.getTransactions()).find(row=>row.id===first.id).totalAmount,1000,'conflict rolls local data back');
 // A record conflict does not block a different record.
 await d.updateTransaction({...second,totalAmount:2600});
 c=await client();d=await client();
 await c.deleteTransaction(first.id);
 await assert.rejects(d.updateTransaction({...first,totalAmount:9000}),/LEDGER_RECORD_CONFLICT/);
 assert(!remote.snapshot.stores.transactions.some(row=>row.id===first.id),'tombstone prevents resurrection');
 const e=await client();loseResponse=true;
 await assert.rejects(e.addTransaction({totalAmount:3000}),/network/);
 assert.equal(remote.snapshot.stores.transactions.length,2,'response lost after committed insert');
 await assert.rejects(e.addTransaction({totalAmount:3000}),/최신/);
 assert.equal(remote.snapshot.stores.transactions.length,2,'no automatic duplicate retry');
 remote={snapshot:snapshot(),revision:0,role:'owner',updated_at:new Date().toISOString()};recordVersions.clear();
 const f=await client();await assert.rejects(f.addTransaction({totalAmount:1}),/먼저/);
 const bad=snapshot();bad.stores.transactions=[{id:1},{id:1}];
 await assert.rejects(f.restoreHallapaDbSnapshot(bad),/중복/);assert.equal(remote.revision,0);
 const valid=snapshot();valid.stores.transactions=[{id:7,totalAmount:1234}];
 await f.restoreHallapaDbSnapshot(valid);assert.equal(remote.revision,1);assert.equal(remote.snapshot.stores.transactions[0].id,7);
 console.log('PASS: distinct-device inserts/edits, unique IDs, same-row conflicts, stale baseline after unrelated save, tombstones, lost-response retry prevention, initial import');
})().catch(error=>{console.error(error);process.exitCode=1;});
