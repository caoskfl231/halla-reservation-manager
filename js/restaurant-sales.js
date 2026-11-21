import {business} from './business-context.js';
import {calculateSale} from './restaurant-sales-calc.js?v=sales-01';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
let db,records=[],editing=null,busy=false;
const element=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e};
$('from').value=today().slice(0,7)+'-01';$('to').value=today();
function totals(rows){return rows.reduce((s,r)=>{for(const k of ['amount','vat','cardFee','netSales'])s[k]+=Number(r[k])||0;return s},{amount:0,vat:0,cardFee:0,netSales:0})}
async function reload(){records=(await db.getTransactions()).filter(r=>r.source==='restaurant-sales');render()}
function render(){
 if(!$('filters').reportValidity()||$('from').value>$('to').value){$('status').textContent='조회 기간을 확인해 주세요.';return}
 const rows=records.filter(r=>r.date>=$('from').value&&r.date<=$('to').value).sort((a,b)=>b.date.localeCompare(a.date));
 const sum=totals(rows);for(const [id,key] of [['gross','amount'],['vat','vat'],['fee','cardFee'],['net','netSales']])$('total-'+id).textContent=money(sum[key]);
 const opened=new Set([...$('rows').querySelectorAll('details[open]')].map(e=>e.dataset.date));
 $('rows').replaceChildren();const days=new Map();
 for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r)}
 for(const [date,list] of days){
  const d=element('details','','purchase-day'),s=element('summary');d.dataset.date=date;d.open=opened.has(date);
  s.append(element('span',date,'day-date'),element('span',list.length+'건','day-count'),element('span','실매출 '+money(totals(list).netSales),'day-total'));d.append(s);
  for(const r of list){
   const row=element('article','','sale-row'),title=element('div','','sale-title'),edit=element('button','수정');
   edit.type='button';edit.onclick=()=>open(r);
   title.append(element('strong',r.paymentMethod+(r.paymentMethod==='카드'?' · 수수료 '+r.feeRate+'%':'')),edit);
   const breakdown=element('div','','sale-breakdown');
   for(const [label,key] of [['매출액','amount'],['부가세','vat'],['카드수수료','cardFee'],['실매출액','netSales']]){const cell=element('div');cell.append(element('span',label),element('strong',money(r[key])));breakdown.append(cell)}
   row.append(title,breakdown);if(r.memo)row.append(element('p',r.memo));d.append(row);
  }$('rows').append(d);
 }
 $('count').textContent=rows.length+'건';$('empty').hidden=rows.length>0;$('status').textContent='날짜를 누르면 상세내역이 펼쳐집니다.';
}
function preview(){
 $('entry-rate').disabled=busy||$('entry-payment').value!=='카드';
 try{const c=calculateSale($('entry-amount').value,$('entry-payment').value,$('entry-rate').value);
 for(const [id,key] of [['vat','vat'],['fee','cardFee'],['net','netSales']])$('preview-'+id).textContent=money(c[key]);$('entry-error').textContent='';
 }catch(e){for(const id of ['vat','fee','net'])$('preview-'+id).textContent='—';$('entry-error').textContent=e.message}
}
function open(r=null){editing=r;$('entry').reset();$('entry-date').value=r?.date||today();$('entry-payment').value=r?.paymentMethod||'카드';$('entry-amount').value=r?.amount??'';$('entry-rate').value=r?.paymentMethod==='카드'?r.feeRate:3;$('entry-memo').value=r?.memo||'';$('remove').hidden=!r;$('editor-title').textContent=r?'매출 수정':'매출 등록';preview();$('editor').showModal();$('editor-title').focus()}
async function mutate(fn){
 if(busy)return;busy=true;for(const b of $('entry').querySelectorAll('button,input,select,textarea'))b.disabled=true;
 let saved=false;
 try{await fn();saved=true;$('editor').close();await reload()}
 catch(e){if(saved){$('status').textContent='저장은 완료되었지만 목록을 불러오지 못했습니다. 새로고침해 주세요.'}else{$('entry-error').textContent=e.message}}
 finally{busy=false;for(const b of $('entry').querySelectorAll('button,input,select,textarea'))b.disabled=false;$('entry-rate').disabled=$('entry-payment').value!=='카드'}
}
$('entry').onsubmit=e=>{
 e.preventDefault();if(busy||!$('entry').reportValidity())return;
 try{
 const c=calculateSale($('entry-amount').value,$('entry-payment').value,$('entry-rate').value);if(c.amount<=0)throw Error('매출액을 입력해 주세요.');
 const row={...editing,...c,id:editing?.id||crypto.randomUUID(),date:$('entry-date').value,type:'income',category:'sales',source:'restaurant-sales',paymentMethod:$('entry-payment').value,itemName:'식당 매출',supplierName:'',memo:$('entry-memo').value.trim(),vatRate:10,vatIncluded:true};
 mutate(()=>editing?db.updateTransaction(row):db.addTransaction(row));
 }catch(e){$('entry-error').textContent=e.message}
};
$('remove').onclick=()=>{if(!busy&&editing&&confirm('이 매출내역을 삭제할까요?'))mutate(()=>db.deleteTransaction(editing.id))};
$('cancel').onclick=()=>{if(!busy)$('editor').close()};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
for(const id of ['entry-amount','entry-rate','entry-payment'])$(id).addEventListener('input',preview);
$('add').onclick=()=>open();$('filters').onsubmit=e=>{e.preventDefault();render()};$('refresh').onclick=()=>location.reload();
try{if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');db=await import('./db.js?v=app-20261018-working-mobile-02');await reload();$('add').disabled=false}catch(e){$('status').textContent='매출내역을 불러오지 못했습니다. '+e.message}
