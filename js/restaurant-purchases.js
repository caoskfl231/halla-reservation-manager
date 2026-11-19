import {business} from './business-context.js';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
let records=[],items=new Map(),ready=false;
const today=new Date(),date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(today);
$('from').value=date.slice(0,7)+'-01';$('to').value=date;
const groupOf=r=>r.itemGroup||items.get(String(r.itemId))?.group||'미분류';
function render(){
 if(!ready)return;
 if(!$('from').value||!$('to').value||$('from').value>$('to').value){$('status').textContent='조회 기간을 확인해 주세요.';return}
 const query=$('search').value.trim().toLowerCase(),group=$('group').value;
 const shown=records.filter(r=>r.date>=$('from').value&&r.date<=$('to').value&&(!group||groupOf(r)===group)&&(!query||[r.supplierName,r.itemName].join(' ').toLowerCase().includes(query))).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));

 const openDates=new Set([...$('rows').querySelectorAll('details[open]')].map(el=>el.dataset.date));
 $('rows').replaceChildren();let total=0;
 const days=new Map();
 for(const r of shown){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r)}
 for(const [date,rows] of days){
  const dayTotal=rows.reduce((sum,r)=>sum+(Number(r.amount)||0),0);total+=dayTotal;
  const details=document.createElement('details');details.className='purchase-day';details.dataset.date=date;details.open=openDates.has(date);
  const summary=document.createElement('summary');
  for(const [text,cls] of [[date,'day-date'],[rows.length+'건','day-count'],[money(dayTotal),'day-total']]){
   const span=document.createElement('span');span.className=cls;span.textContent=text;summary.append(span);
  }
  const wrap=document.createElement('div');wrap.className='table-wrap';
  const table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr'),body=document.createElement('tbody');
  for(const [i,label] of ['매입처','분류','품명','단위','수량','단가','금액'].entries()){const th=document.createElement('th');th.scope='col';th.textContent=label;if(i>=4)th.className='num';headRow.append(th)}
  head.append(headRow);table.append(head,body);
  for(const r of rows){
   const tr=document.createElement('tr');
   const values=[r.supplierName||'—',groupOf(r),r.itemName||'—',r.unit||'—',Number(r.quantity||0).toLocaleString('ko-KR'),money(r.unitPrice),money(r.amount)];
   values.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i>=4)td.className='num';tr.append(td)});body.append(tr);
  }
  wrap.append(table);details.append(summary,wrap);$('rows').append(details);
 }

 $('count').textContent=shown.length+'건';$('total').textContent=money(total);$('empty').hidden=shown.length>0;$('status').textContent='날짜별 매입내역입니다. 날짜를 누르면 상세가 펼쳐집니다.';
}
$('refresh').onclick=()=>location.reload();
$('filters').onsubmit=e=>{e.preventDefault();render()};
$('group').onchange=render;$('search').oninput=render;
try{
 if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');
 const db=await import('./db.js?v=app-20261018-working-mobile-02');
 const [transactions,masters]=await Promise.all([db.getTransactions(),db.getItems()]);
 records=transactions.filter(r=>r&&r.category==='purchase');
 items=new Map(masters.map(r=>[String(r.id),r]));
 for(const group of [...new Set(records.map(groupOf))].sort())$('group').add(new Option(group,group));
 ready=true;render();
}catch{$('status').textContent='식당 매입내역을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'}
