import {rpc,sessionIdentity} from './cloud-session.js?v=app-20261018-working-mobile-02';
export const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const pendingKey=()=> 'halla_restaurant_fund_pending:'+sessionIdentity();
export async function loadFunds(){
 const raw=sessionStorage.getItem(pendingKey());
 if(raw){const pending=JSON.parse(raw);if(pending.p_action==='post'&&pending.p_data?.kind==='purchase'){sessionStorage.removeItem(pendingKey());return rpc('halla_restaurant_funds')}try{const result=await rpc('halla_restaurant_funds',pending);sessionStorage.removeItem(pendingKey());return result}catch(e){if(e.status>=400&&e.status<500)sessionStorage.removeItem(pendingKey());throw e}}
 return rpc('halla_restaurant_funds');
}
export async function fundWrite(action,data){
 const key=pendingKey(),body={p_action:action,p_data:data};
 if(action==='post'){
  const raw=sessionStorage.getItem(key);
  if(raw&&raw!==JSON.stringify(body))throw Error('이전 저장 결과를 먼저 확인해야 합니다. 새로고침해 주세요.');
  sessionStorage.setItem(key,JSON.stringify(body));
 }
 try{const result=await rpc('halla_restaurant_funds',body);if(action==='post')sessionStorage.removeItem(key);return result}
 catch(e){if(action==='post'&&e.status>=400&&e.status<500)sessionStorage.removeItem(key);throw e}
}
export function paidFor(state,id){return (state.allocations||[]).filter(a=>String(a.purchase_id)===String(id)).reduce((sum,a)=>sum+Number(a.amount),0)}
export function dueFor(state,r){return Math.max(0,Number(r.amount||0)-paidFor(state,r.id))}
export function el(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
export function fillAccountSelect(select,accounts){select.replaceChildren(new Option('선택해 주세요',''));for(const a of accounts.filter(a=>!a.archived))select.add(new Option(a.name+' · '+won(a.balance),a.id))}
