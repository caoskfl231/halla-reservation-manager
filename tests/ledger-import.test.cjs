const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const context=vm.createContext({TextEncoder,crypto:require('node:crypto').webcrypto});
 const module=new vm.SourceTextModule(fs.readFileSync('js/cloud-import.js','utf8'),{context});
 await module.link(()=>{throw Error('Unexpected import');});await module.evaluate();
 const {importChunks,uploadSnapshot}=module.namespace;
 const snapshot={meta:{dbName:'hallapa_db'},stores:{transactions:Array.from({length:1001},(_,id)=>({id,memo:'한글'.repeat(40)})),sales_quotes:[]}};
 const chunks=importChunks(snapshot);
 assert.equal(chunks.length,6);assert(chunks.every(c=>c.rows.length<=200));
 assert.deepEqual(JSON.parse(JSON.stringify(chunks.flatMap(c=>c.rows))),snapshot.stores.transactions);
 assert.throws(()=>importChunks({stores:{items:[{id:1,memo:'x'.repeat(180000)}]}}),/너무/);
 const calls=[],progress=[];
 const rpc=async(name,body)=>{calls.push({name,body});return name==='halla_ledger_read'?{revision:1}:{};};
 const result=await uploadSnapshot(snapshot,0,'initialize',rpc,text=>progress.push(text));
 assert.equal(result.revision,1);assert.equal(calls[0].name,'halla_ledger_import_start');
 assert.equal(calls[0].body.p_counts.transactions,1001);assert.equal(calls[0].body.p_counts.sales_quotes,0);
 assert.equal(calls.filter(c=>c.name==='halla_ledger_import_chunk').length,6);
 assert.equal(calls.at(-2).name,'halla_ledger_import_finish');assert.equal(calls.at(-1).name,'halla_ledger_read');
 let finish=false;
 await assert.rejects(uploadSnapshot(snapshot,0,'initialize',async(name)=>{
  if(name==='halla_ledger_import_chunk')throw Error('network interruption');
  if(name==='halla_ledger_import_finish')finish=true;
 }),/network/);assert.equal(finish,false,'interrupted uploads never finalize');
 console.log('PASS: bounded Unicode-safe batches, intact rows, empty stores, progress, interrupted-upload isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
