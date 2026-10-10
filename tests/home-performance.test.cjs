const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const context=vm.createContext({console,Set,Map,Number,String,Array,Math});
  async function moduleOf(path){const m=new vm.SourceTextModule(fs.readFileSync(path,'utf8'),{context});await m.link(()=>{});await m.evaluate();return m.namespace;}
  const compute=await moduleOf('js/home-compute.js'),pager=await moduleOf('js/home-pagination.js');
  const rows=Array.from({length:17000},(_,i)=>({date:'2026-10-10',vendor:'거래처'+String(i).padStart(5,'0'),type:'매출',group:'식당',sales:100,receipt:10,purchase:20,pay:5,expense:0,inn:30,out:2,__src:'transaction'}));
  const result=compute.prepareHomeTable(rows,null,'');assert.equal(result.length,17000);
  assert.equal(result.reduce((sum,row)=>sum+row.sales-row.receipt,0),17000*90);
  assert.equal(result.reduce((sum,row)=>sum+row.pay-row.purchase,0),17000*(-15));
  assert.equal(result.reduce((sum,row)=>sum+row.inn-row.out,0),17000*28);
  let count=0;for(let p=0;p<170;p++){const page=pager.pageSlice(result,p);assert(page.rows.length<=100);count+=page.rows.length;assert.equal(page.rows[0].sales,100);assert.equal(page.rows[0].receipt,10);}assert.equal(count,17000);
  assert.equal(pager.pageSlice(result,10000).page,169);
  assert.equal(compute.prepareHomeTable(rows,null,'거래처00001').length,1);
  assert.equal(compute.prepareHomeTable(rows,{mode:'ledgerAll'},'').length,0);
  assert.equal(compute.prepareHomeTable(rows,{mode:'types',types:['매입']},'').length,0);
  assert.equal(compute.filterDates(rows,'2026-10-11','',true).length,0);
  assert.equal(compute.filterDates(rows,'2026-10-01','2026-10-10',true).length,17000);
  const duplicate=compute.prepareHomeTable([rows[0],rows[0]],null,'');assert.equal(duplicate.length,1);assert.equal(duplicate[0].sales,200);
  const periodRows = [
    { ...rows[0], date:'2026-09-30', sales:999 },
    { ...rows[0], date:'2026-10-01', sales:100 },
    { ...rows[0], date:'2026-10-10', sales:200 },
    { ...rows[0], date:'2026-10-11', sales:999 },
    { ...rows[1], date:'2026-10-05', sales:50 },
  ];
  const period=compute.computeJob({kind:'table',rows:periodRows,from:'2026-10-01',to:'2026-10-10'});
  assert.equal(period.length,2,'multiple dates combine into one row per customer');
  assert.equal(period[0].sales,300,'both endpoints included; outside dates excluded');
  assert.equal(period[0].receipt,20);
  assert.equal(period[1].sales,50,'customers remain separate');
  assert.equal(period[0].date,'2026-10-01 ~ 2026-10-10');
  assert.equal(compute.computeJob({kind:'table',rows:periodRows,from:'2026-10-10',to:'2026-10-10'})[0].sales,200);
  assert.equal(compute.computeJob({kind:'table',rows:periodRows,from:'2026-11-01',to:'2026-11-10'}).length,0);
  assert.equal(compute.computeJob({kind:'table',rows:periodRows,from:'2026-10-01',to:'2026-10-10',query:'거래처00000'}).length,1);
  const sameVendor=compute.prepareHomeTable([
    { ...rows[0], date:'2026-10-01', __src:'transaction' },
    { ...rows[0], date:'2026-10-10', __src:'ledger', sales:0, receipt:0, inn:50, out:5 },
  ],null,'',{from:'2026-10-01',to:'2026-10-10'});
  assert.equal(sameVendor.length,1);assert.equal(sameVendor[0].sales,100);assert.equal(sameVendor[0].inn,80);
  const ledgerOnly=compute.prepareHomeTable([
    { ...rows[0], date:'2026-10-01', __src:'transaction' },
    { ...rows[0], date:'2026-10-10', __src:'ledger', sales:0, receipt:0, inn:50, out:5 },
  ],{mode:'ledgerAll'},'',{from:'2026-10-01',to:'2026-10-10'});
  assert.equal(ledgerOnly[0].sales,0);assert.equal(ledgerOnly[0].inn,50,'card filter applies before aggregation');
  const labels=compute.prepareHomeTable([
    { ...rows[0], type:'매출', __supplierId:'00123' },
    { ...rows[0], type:'매출', __supplierId:'00123', date:'2026-10-01' },
    { ...rows[1], type:'매입', __supplierId:'00234' },
    { ...rows[2], type:'지출', __supplierId:'00345' },
    { ...rows[3], type:'입금', __src:'ledger', __supplierId:'' },
  ],null,'');
  assert.equal(labels[0].code,'00123','leading zeros in customer codes preserved');
  assert.equal(labels[0].type,'매출처');
  assert.equal(labels[1].type,'매입처');
  assert.equal(labels[2].type,'지출처');
  assert.equal(labels[3].type,'입출금 장부');
  assert.equal(labels[3].code,'','unknown customer code is not a ledger account code');
  const mixed=compute.prepareHomeTable([{...rows[0],type:'매출',__supplierId:'00123'},{...rows[0],type:'매입',__supplierId:'00123'}],null,'');
  assert.equal(mixed[0].type,'매출처 / 매입처');assert.equal(mixed[0].code,'00123');
  new vm.SourceTextModule(fs.readFileSync('js/main.js','utf8'),{context});
  assert(fs.readFileSync('js/main.js','utf8').includes('listBody.innerHTML = pageRows'));
  assert(fs.readFileSync('js/main.js','utf8').includes('signedAmountCell(rowSalesBalance(r))'));
  assert(!fs.readFileSync('js/main.js','utf8').includes('r.__runningSales'));
  console.log('PASS: 17,000 customers, 100-row pages, date-range aggregation, inclusive endpoints, independent customer balances, search/card filters and main syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
