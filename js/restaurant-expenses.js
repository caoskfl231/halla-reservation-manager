import {business} from './business-context.js';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
let db,records=[],editing=null,busy=false;
$('from').value=today.slice(0,7)+'-01';$('to').value=today;
function element(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
async function reload(){records=(await db.getTransactions()).filter(r=>r.category==='expense');const selected=$('group').value;$('group').replaceChildren(new Option('전체',''));for(const g of [...new Set(records.map(r=>r.expenseGroup||'기타'))].sort())$('group').add(new Option(g,g));$('group').value=selected;render()}
function render(){
 if(!$('filters').reportValidity()||$('from').value>$('to').value){$('status').textContent='조회 기간을 확인해 주세요.';return}
 const q=$('search').value.trim().toLowerCase(),g=$('group').value;
 const rows=records.filter(r=>r.date>=$('from').value&&r.date<=$('to').value&&(!g||(r.expenseGroup||'기타')===g)&&(!q||[r.supplierName,r.itemName,r.memo].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date));
 const opened=new Set([...$('rows').querySelectorAll('details[open]')].map(e=>e.dataset.date));$('rows').replaceChildren();
 const days=new Map();for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r)}
 for(const [date,list] of days){const d=element('details','','purchase-day');d.dataset.date=date;d.open=opened.has(date);const s=element('summary','');s.append(element('span',date,'day-date'),element('span',list.length+'건','day-count'),element('span',money(list.reduce((n,r)=>n+Number(r.amount),0)),'day-total'));d.append(s);
 for(const r of list){const row=element('div','','expense-row'),name=element('div',r.itemName||r.supplierName||'—');name.append(element('small',(r.expenseGroup||'기타')+' · '+(r.paymentMethod||'기타')+(r.memo?' · '+r.memo:'')));const edit=element('button','수정');edit.type='button';edit.onclick=()=>open(r);row.append(element('div',r.expenseGroup||'기타','classification'),name,element('div',r.paymentMethod||'기타','payment'),element('div',money(r.amount),'amount'),edit);d.append(row)}$('rows').append(d)}
 $('total').textContent=money(rows.reduce((n,r)=>n+Number(r.amount),0));$('count').textContent=rows.length+'건';$('empty').hidden=!!rows.length;$('status').textContent='날짜를 누르면 상세내역이 펼쳐집니다.';
}
function open(r=null){editing=r;$('entry').reset();$('entry-date').value=r?.date||today;$('entry-group').value=r?.expenseGroup||'';$('entry-name').value=r?.itemName||r?.supplierName||'';$('entry-amount').value=r?.amount||'';$('entry-payment').value=r?.paymentMethod||'계좌이체';$('entry-memo').value=r?.memo||'';$('remove').hidden=!r;$('entry-error').textContent='';$('editor-title').textContent=r?'지출 수정':'지출 등록';$('editor').showModal()}
async function mutate(fn){if(busy)return;busy=true;for(const b of $('entry').querySelectorAll('button'))b.disabled=true;try{await fn();$('editor').close();await reload()}catch(e){$('entry-error').textContent=e.message;$('status').textContent=e.message}finally{busy=false;for(const b of $('entry').querySelectorAll('button'))b.disabled=false}}
$('entry').onsubmit=e=>{e.preventDefault();if(!$('entry').reportValidity())return;const amount=Number($('entry-amount').value),group=$('entry-group').value.trim(),name=$('entry-name').value.trim();if(!Number.isSafeInteger(amount)||amount<=0||!group||!name)return;
 const row={...editing,date:$('entry-date').value,type:'expense',category:'expense',expenseGroup:group,itemName:name,supplierName:name,amount,paymentMethod:$('entry-payment').value,memo:$('entry-memo').value.trim(),source:'restaurant-expenses'};
 mutate(()=>editing?db.updateTransaction(row):db.addTransaction(row))};
$('remove').onclick=()=>{if(editing&&confirm('이 지출내역을 삭제할까요?'))mutate(()=>db.deleteTransaction(editing.id))};
$('cancel').onclick=()=>{if(!busy)$('editor').close()};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('add').onclick=()=>open();$('filters').onsubmit=e=>{e.preventDefault();render()};$('search').oninput=()=>{if(db)render()};$('group').onchange=()=>{if(db)render()};$('refresh').onclick=()=>location.reload();
try{if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');db=await import('./db.js?v=app-20261018-working-mobile-02');await reload();$('add').disabled=false}catch(e){$('status').textContent='지출내역을 불러오지 못했습니다. '+e.message}
