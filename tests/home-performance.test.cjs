const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const context=vm.createContext({console,Set,Map,Number,String,Array,Math});
  async function moduleOf(path){const m=new vm.SourceTextModule(fs.readFileSync(path,'utf8'),{context});await m.link(()=>{});await m.evaluate();return m.namespace;}
  const compute=await moduleOf('js/home-compute.js'),pager=await moduleOf('js/home-pagination.js');
  const rows=Array.from({length:17000},(_,i)=>({date:'2026-10-10',vendor:'거래처'+String(i).padStart(5,'0'),type:'매출',group:'식당',sales:100,receipt:10,purchase:20,pay:5,expense:0,inn:30,out:2,__src:'transaction'}));
  const result=compute.prepareHomeTable(rows,null,'');assert.equal(result.length,17000);
  assert.equal(result.at(-1).__runningSales,17000*90);assert.equal(result.at(-1).__runningPurchase,17000*(-15));
  assert.equal(result.at(-1).__runningBalance,17000*28);
  let count=0;for(let p=0;p<170;p++){const page=pager.pageSlice(result,p);assert(page.rows.length<=100);count+=page.rows.length;assert.equal(page.rows[0].__runningSales,(p*100+1)*90);}assert.equal(count,17000);
  assert.equal(pager.pageSlice(result,10000).page,169);
  assert.equal(compute.prepareHomeTable(rows,null,'거래처00001').length,1);
  assert.equal(compute.prepareHomeTable(rows,{mode:'ledgerAll'},'').length,0);
  assert.equal(compute.prepareHomeTable(rows,{mode:'types',types:['매입']},'').length,0);
  assert.equal(compute.filterDates(rows,'2026-10-11','',true).length,0);
  assert.equal(compute.filterDates(rows,'2026-10-01','2026-10-10',true).length,17000);
  const duplicate=compute.prepareHomeTable([rows[0],rows[0]],null,'');assert.equal(duplicate.length,1);assert.equal(duplicate[0].sales,200);
  new vm.SourceTextModule(fs.readFileSync('js/main.js','utf8'),{context});
  assert(fs.readFileSync('js/main.js','utf8').includes('listBody.innerHTML = pageRows'));
  console.log('PASS: 17,000 rows, 100-row pages, exact totals, continuous balances, date/search/card filters, aggregation, main syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
