import {business} from './business-context.js';
import {requireLedgerSession} from './cloud-session.js?v=app-20261018-working-mobile-02';
import {loadFunds,fundWrite,won,today,el,fillAccountSelect} from './restaurant-fund-api.js?v=receipt-sync-01';
const $=id=>document.getElementById(id);let state,editing=null,accountId=null,entryId=null,busy=false;
const kinds={in:'입금',out:'출금·카드사용',transfer:'계좌이체·카드대금 납부',purchase:'매입대금 지불'};
$('fund-from').value=today().slice(0,7)+'-01';$('fund-to').value=today();
function draw(){
 const accounts=new Map(state.accounts.map(a=>[a.id,a]));
 const available=state.accounts.filter(a=>a.kind!=='card').reduce((s,a)=>s+Number(a.balance),0);
 const debt=state.accounts.filter(a=>a.kind==='card').reduce((s,a)=>s+Math.max(0,-Number(a.balance)),0);
 $('fund-total').textContent='현재 보유자금 '+won(available)+' · 카드 미결제금 '+won(debt);
 $('fund-accounts').replaceChildren();
 for(const a of state.accounts){
  const card=el('article','','fund-card');card.append(el('h3',a.name+(a.archived?' · 사용 중지':'')));
  card.append(el('small',a.kind==='card'?'미결제금':'현재 잔액'),el('strong',won(a.kind==='card'?Math.max(0,-a.balance):a.balance)));
  if(a.kind==='card'&&a.balance>0)card.append(el('small','선납 잔액 '+won(a.balance)));
  const edit=el('button','수정');edit.type='button';edit.onclick=()=>openAccount(a);card.append(edit);$('fund-accounts').append(card);
 }
 if(!state.accounts.length)$('fund-accounts').append(el('p','계좌·카드를 등록하면 잔액을 관리할 수 있습니다.','fund-note'));
 const selected=$('fund-account-filter').value;$('fund-account-filter').replaceChildren(new Option('전체',''));
 for(const a of state.accounts)$('fund-account-filter').add(new Option(a.name,a.id));$('fund-account-filter').value=selected;
 if(!$('fund-filter').reportValidity()||$('fund-from').value>$('fund-to').value){$('fund-status').textContent='조회 기간을 확인해 주세요.';return}
 const from=$('fund-from').value,to=$('fund-to').value,account=$('fund-account-filter').value;
 const entries=state.entries.filter(e=>e.date>=from&&e.date<=to&&(!account||e.account_id===account||e.to_account_id===account));
 $('fund-list').replaceChildren();
 for(const e of entries){
  const row=el('article','','fund-row'+(e.cancelled_at?' cancelled':''));
  const name=el('div',kinds[e.kind]);name.append(el('small',(accounts.get(e.account_id)?.name||'계좌')+(e.to_account_id?' → '+(accounts.get(e.to_account_id)?.name||'계좌'):'')+(e.memo?' · '+e.memo:'')));
  if(e.kind==='purchase')name.append(el('small',e.linked_source==='butcher'?'정육점 수금 자동 반영':'이전 지불 기록'));
  if(e.before_opening)name.append(el('small','시작일 이전 내역 · 현재 잔액에서 제외'));
  if(e.linked_source==='butcher'&&!e.account_id)name.append(el('small','결제수단 확인 필요 · 계좌 잔액에서 제외'));
  if(Number(e.discount_amount))name.append(el('small','할인 '+won(e.discount_amount)));
  row.append(el('time',e.date),name,el('strong',won(e.amount)));
  if(e.cancelled_at)row.append(el('small','취소됨'));
  else if(e.linked_source==='butcher')row.append(el('small','정육점에서 수정·취소'));
  else {const cancel=el('button','취소');cancel.type='button';cancel.disabled=busy;cancel.onclick=()=>cancelEntry(e);row.append(cancel)}
  $('fund-list').append(row);
 }
 $('fund-status').textContent=entries.length?entries.length+'건 · 자동 반영된 지불은 정육점에서 수정·취소해 주세요.':'조회 기간에 내역이 없습니다.';
}
function openAccount(a=null){
 if(busy)return;editing=a;accountId=a?.id||crypto.randomUUID();$('account-form').reset();
 $('account-title').textContent=a?'계좌·카드 수정':'계좌·카드 등록';
 $('account-name').value=a?.name||'';$('account-kind').value=a?.kind||'bank';$('account-date').value=a?.opening_date||today();$('account-date').max=today();
 $('account-opening').value=a?.opening_balance||0;$('account-active').value=a?.archived?'archived':'active';
 $('account-active').disabled=!a;$('account-error').textContent='';$('account-editor').showModal();
}
function updateKind(){
 const transfer=$('fund-kind').value==='transfer';$('fund-destination-label').hidden=!transfer;$('fund-destination').required=transfer;
 $('fund-source-label').textContent=transfer?'출금통장·현금':'계좌·카드';
}
function openEntry(kind){
 if(busy)return;entryId=crypto.randomUUID();$('fund-form').reset();$('fund-kind').value=kind;
 $('fund-date').value=today();$('fund-date').max=today();fillAccountSelect($('fund-source'),state.accounts);fillAccountSelect($('fund-destination'),state.accounts);
 updateKind();$('fund-error').textContent='';$('fund-editor').showModal();
}
async function save(form,errorId,action,data,dialog){
 if(busy)return;busy=true;for(const x of form.querySelectorAll('button'))x.disabled=true;
 try{state=await fundWrite(action,data);dialog.close();draw();$('fund-status').textContent='저장되었습니다.'}
 catch(e){$(errorId).textContent=e.message}
 finally{busy=false;for(const x of form.querySelectorAll('button'))x.disabled=false}
}
async function cancelEntry(e){
 if(busy||!confirm(e.kind==='purchase'?'이 지불을 취소할까요? 식당 출금과 정육점 수금도 함께 취소됩니다.':'이 자금 기록을 취소할까요? 잔액에 반영된 금액도 되돌립니다.'))return;
 busy=true;draw();try{state=await fundWrite('cancel',{id:e.id})}catch(error){busy=false;draw();$('fund-status').textContent=error.message;return}busy=false;draw();
}
$('account-new').onclick=()=>openAccount();$('entry-new').onclick=()=>openEntry('in');$('transfer-new').onclick=()=>openEntry('transfer');
$('fund-kind').onchange=updateKind;
$('account-close').onclick=()=>{if(!busy)$('account-editor').close()};$('fund-close').onclick=()=>{if(!busy)$('fund-editor').close()};
for(const id of ['account-editor','fund-editor'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('account-form').onsubmit=e=>{e.preventDefault();if(!$('account-form').reportValidity())return;save($('account-form'),'account-error','account',{id:accountId,version:editing?.version,name:$('account-name').value.trim(),kind:$('account-kind').value,opening_date:$('account-date').value,opening_balance:Number($('account-opening').value),archived:$('account-active').value==='archived'},$('account-editor'))};
$('fund-form').onsubmit=e=>{e.preventDefault();if(!$('fund-form').reportValidity())return;const kind=$('fund-kind').value;save($('fund-form'),'fund-error','post',{id:entryId,kind,date:$('fund-date').value,account_id:$('fund-source').value,to_account_id:kind==='transfer'?$('fund-destination').value:null,amount:Number($('fund-amount').value),memo:$('fund-memo').value.trim()},$('fund-editor'))};
$('fund-filter').onsubmit=e=>{e.preventDefault();if(state)draw()};$('fund-account-filter').onchange=()=>{if(state)draw()};
$('fund-refresh').onclick=()=>location.reload();
try{if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');state=await requireLedgerSession(loadFunds);draw();for(const id of ['account-new','entry-new','transfer-new'])$(id).disabled=false}catch(e){$('fund-status').textContent=e.message}
