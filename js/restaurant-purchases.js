import {business} from './business-context.js';
import {initPurchasePayments,openPurchasePayment,paidFor,dueFor} from './restaurant-purchase-payments.js?v=funds-01';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
let records=[],items=new Map(),ready=false,funds=null;
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
  for(const [i,label] of ['매입처','분류','품명','단위','수량','단가','매입금액','지불금액','미지급금','지불'].entries()){const th=document.createElement('th');th.scope='col';th.textContent=label;if(i>=4)th.className='num';headRow.append(th)}
  head.append(headRow);table.append(head,body);
  for(const r of rows){
   const tr=document.createElement('tr');
   const values=[r.supplierName||'—',groupOf(r),r.itemName||'—',r.unit||'—',Number(r.quantity||0).toLocaleString('ko-KR'),money(r.unitPrice),money(r.amount),funds?money(paidFor(funds,r.id)):'—',funds?money(dueFor(funds,r)):'—'];
   values.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i>=4)td.className='num';tr.append(td)});
   const action=document.createElement('td'),pay=document.createElement('button');pay.type='button';pay.textContent=funds&&dueFor(funds,r)===0?'완료':'지불';pay.disabled=!funds||r.source!=='butcher-sales'||dueFor(funds,r)===0;pay.onclick=()=>openPurchasePayment([r]);action.append(pay);tr.append(action);body.append(tr);
  }
  wrap.append(table);details.append(summary);
  if(funds){
   const bar=document.createElement('div');bar.className='purchase-payment-bar';
   const info=document.createElement('span');info.textContent='지불 '+money(rows.reduce((s,r)=>s+paidFor(funds,r.id),0))+' · 미지급 '+money(rows.reduce((s,r)=>s+dueFor(funds,r),0));
   const pay=document.createElement('button');pay.type='button';pay.textContent='이 날짜 지불';pay.disabled=!rows.some(r=>r.source==='butcher-sales'&&dueFor(funds,r)>0);pay.onclick=()=>openPurchasePayment(rows);bar.append(info,pay);details.append(bar);
  }
  details.append(wrap);$('rows').append(details);
 }

 if(funds)$('purchase-payment-summary').textContent='조회 매입 '+money(total)+' · 지불 '+money(shown.reduce((s,r)=>s+paidFor(funds,r.id),0))+' · 미지급 '+money(shown.reduce((s,r)=>s+dueFor(funds,r),0))+' / 정육점 전체 미수금 '+money(funds.butcher_receivable);
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
 try{funds=await initPurchasePayments(value=>{funds=value;render()});render()}catch(error){$('status').textContent='지불정보를 불러오지 못했습니다. '+error.message}
}catch{$('status').textContent='식당 매입내역을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'}
