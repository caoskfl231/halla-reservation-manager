const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const context=vm.createContext({console,Error,Map,Set,JSON,Number,Object,setTimeout});
 const m=new vm.SourceTextModule(fs.readFileSync('js/ledger-read-cache.js','utf8'),{context});await m.link(()=>{});await m.evaluate();const c=m.namespace;
 const rows=Array.from({length:17000},(_,i)=>({key:i+1,data:{id:i+1,date:i<10000?'2026-09-10':'2026-10-10'},version:i+1}));
 const manifest={chunked:true,full:true,revision:20,cursor:17001,role:'owner',stores:['transactions','items'],meta:{dbName:'hallapa_db'},periods:[{store:'transactions',period:'2026-10',count:7000},{store:'transactions',period:'2026-09',count:10000},{store:'items',period:'',count:1}]};
 let requests=0,maxRows=0;
 const rpc=async(name,p)=>{
  if(name==='halla_ledger_sync_v2')return {revision:20,changes:[]};
  assert.equal(name,'halla_ledger_period_page');assert.equal(p.p_revision,20);requests++;
  const source=p.p_store==='items'?[{key:9,data:null,version:17001}]:rows.filter(r=>r.data.date.startsWith(p.p_period));
  const page=source.filter(r=>r.version>p.p_after).slice(0,p.p_limit);maxRows=Math.max(maxRows,page.length);
  return {revision:20,rows:page,next:page.at(-1)?.version||p.p_after,count:page.length};
 };
 const state=await c.loadPeriodLedger(rpc,manifest);assert.equal(state.snapshot.stores.transactions.length,17000);assert.equal(state.row_versions.length,17001);assert.equal(state.snapshot.stores.items.length,0);assert(maxRows<=500);assert(requests>=35);
 await assert.rejects(c.loadPeriodLedger(async(name,p)=>name==='halla_ledger_sync_v2'?{revision:21,changes:[]}:rpc(name,p),manifest),/LEDGER_READ_CHANGED/);
 await assert.rejects(c.loadPeriodLedger(async()=>({revision:20,rows:[],next:0}),manifest),/INVALID_LEDGER_PAGE/);
 console.log('PASS: 17,000 rows, monthly bounded pages, complete tombstones, concurrent-change rejection, interrupted-load safety');
})().catch(e=>{console.error(e);process.exitCode=1;});
