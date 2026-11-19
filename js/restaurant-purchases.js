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
 $('rows').replaceChildren();let total=0;
 for(const r of shown){const tr=document.createElement('tr');const amount=Number(r.amount)||0;total+=amount;
 const values=[r.date,r.supplierName||'—',groupOf(r),r.itemName||'—',r.unit||'—',Number(r.quantity||0).toLocaleString('ko-KR'),money(r.unitPrice),money(amount)];
 values.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i>=5)td.className='num';tr.append(td)});$('rows').append(tr)}
 $('count').textContent=shown.length+'건';$('total').textContent=money(total);$('empty').hidden=shown.length>0;$('status').textContent='식당에 저장된 매입내역을 조회했습니다.';
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
