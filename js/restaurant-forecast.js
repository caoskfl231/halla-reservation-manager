import {monthlyBalance} from './restaurant-monthly-balance.mjs';
const $=id=>document.getElementById(id),costIds=["wages","meatPurchase","vegPurchase","foodPurchase","rent","utilities","monthlyFee","misc"],fixedIds=['rent','wages','utilities','misc'],directIds=['sales','meatPurchase','vegPurchase','foodPurchase','monthlyFee'];
let key=null;
const amount=id=>$(id).value===''?NaN:Number($(id).value),money=n=>Math.round(n).toLocaleString('ko-KR')+'원',percent=n=>n===null?'—':n.toFixed(2)+'%';
function render(){
 try{
 const sales=amount('sales'),r=monthlyBalance(sales,costIds.map(amount),amount('savings'));
 costIds.forEach((id,i)=>$(id+'-ratio').textContent=percent(r.ratios[i]));
 for(const [id,value] of Object.entries({'sales-total':money(sales),'expense-total':money(r.total),'expense-summary':money(r.total),'expense-ratio':percent(r.totalRatio),'balance':money(r.balance),'balance-ratio':percent(r.balanceRatio),'savings-ratio':percent(r.savingsRatio),'after-savings':money(r.remaining),'after-savings-ratio':percent(r.remainingRatio)}))$(id).textContent=value;
 $('balance').classList.toggle('negative',r.balance<0);$('after-savings').classList.toggle('negative',r.remaining<0);
 $('error').textContent='';return true;
 }catch(e){
 for(const id of [...costIds.map(id=>id+'-ratio'),'sales-total','expense-total','expense-summary','expense-ratio','balance','balance-ratio','savings-ratio','after-savings','after-savings-ratio'])$(id).textContent='—';
 $('error').textContent=e.message;return false;
 }
}
$('forecast').addEventListener('input',()=>{render();$('save-status').textContent='변경한 내용은 아직 저장되지 않았습니다.'});
$('forecast').onsubmit=e=>{
 e.preventDefault();if(!key||!render()||!$('forecast').reportValidity())return;
 try{
 const previous=JSON.parse(localStorage.getItem(key)||'{}');
 const saved={...previous,method:'direct',direct:Object.fromEntries(directIds.map(id=>[id,amount(id)])),fixed:Object.fromEntries(fixedIds.map(id=>[id,amount(id)])),savings:amount('savings'),rows:previous.rows||[],days:previous.days||26};
 localStorage.setItem(key,JSON.stringify(saved));$('save-status').textContent='이 기기에 계산표를 저장했습니다.';
 }catch{$('save-status').textContent='저장하지 못했습니다. 다시 시도해 주세요.'}
};
render();
try{
 await import('./db.js?v=app-20261018-working-mobile-02');
 const {sessionIdentity}=await import('./cloud-session.js?v=app-20261018-working-mobile-02');
 key='halla.restaurant.forecast.v1:'+JSON.stringify(sessionIdentity());
 const raw=localStorage.getItem(key);
 if(raw){
 const saved=JSON.parse(raw);if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('invalid');
 directIds.forEach(id=>$(id).value=saved.direct?.[id]??0);
 fixedIds.forEach(id=>$(id).value=saved.fixed?.[id]??0);$('savings').value=saved.savings??0;
 $('save-status').textContent=saved.method==='direct'?'저장한 월 금액을 불러왔습니다.':'기존 메뉴별 예상값은 보관되어 있습니다. 총 월매출액과 지출금액을 직접 입력해 주세요.';
 }
 $('save').disabled=false;render();
}catch{$('save-status').textContent='저장내역을 불러오지 못했습니다. 새로고침해 주세요.'}
