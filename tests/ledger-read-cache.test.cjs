const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const data=new Map();let unavailable=false;
 const indexedDB={open(){const req={};setImmediate(()=>{
  if(unavailable){req.error=Error('disk unavailable');req.onerror();return;}
  req.result={createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {
   get:k=>request(()=>data.get(k)),put:(v,k)=>request(()=>{data.set(k,structuredClone(v));}),clear:()=>request(()=>data.clear())
  };}};function request(fn){const r={};setImmediate(()=>{r.result=structuredClone(fn());r.onsuccess();setImmediate(()=>tx.oncomplete());});return r;}return tx;}};
  req.onsuccess();
 });return req;}};
 const context=vm.createContext({console,Error,Map,Set,JSON,Number,Object,indexedDB});
 const m=new vm.SourceTextModule(fs.readFileSync('js/ledger-read-cache.js','utf8'),{context});await m.link(()=>{});await m.evaluate();const c=m.namespace;
 const initial={full:true,cursor:3,revision:1,role:'owner',snapshot:{meta:{dbName:'hallapa_db'},stores:{transactions:[{id:1,total:10},{id:2,total:20}],item_groups:[{code:'A',name:'old'}]}},row_versions:[{store:'transactions',key:1,version:1},{store:'transactions',key:2,version:2},{store:'item_groups',key:'A',version:3}]};
 const cursors=[];let reply=initial;
 const rpc=async(name,args)=>{assert.equal(name,'halla_ledger_sync');cursors.push(args.p_cursor);if(reply instanceof Error)throw reply;return structuredClone(reply);};
 await c.loadSyncedLedger(rpc,'owner');assert.equal(cursors.at(-1),null);
 reply={full:false,cursor:7,revision:2,role:'editor',meta:{dbName:'hallapa_db'},changes:[{store:'transactions',key:1,data:{id:1,total:15},version:4},{store:'transactions',key:2,data:null,version:5},{store:'transactions',key:3,data:{id:3,total:30},version:6},{store:'item_groups',key:'A',data:{code:'A',name:'new'},version:7}]};
 const next=await c.loadSyncedLedger(rpc,'owner');assert.equal(cursors.at(-1),3);assert.equal(next.snapshot.stores.transactions.length,2);assert.equal(next.snapshot.stores.transactions.find(r=>r.id===1).total,15);assert.equal(next.snapshot.stores.item_groups[0].name,'new');assert.equal(next.row_versions.find(r=>r.key===2).version,5,'tombstone version kept');assert.equal(next.role,'editor');
 reply=Error('network offline');await assert.rejects(c.loadSyncedLedger(rpc,'owner'),/offline/,'never display cached data without server authorization');
 reply=initial;await c.loadSyncedLedger(rpc,'another-user');assert.equal(cursors.at(-1),null,'different account cannot reuse old data');
 await c.clearReadCache();assert.equal(data.size,0);
 unavailable=true;await c.loadSyncedLedger(rpc,'owner');assert.equal(cursors.at(-1),null,'blocked disk storage safely falls back to full read');
 console.log('PASS: cross-page cached read, update/add/delete/code-key deltas, current role, no offline bypass, account isolation, logout cleanup, storage fallback');
})().catch(error=>{console.error(error);process.exitCode=1;});
