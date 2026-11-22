import {business} from './business-context.js';
import {requireLedgerSession} from './cloud-session.js?v=app-20261018-working-mobile-02';
import {loadFunds,fundWrite,won,today,el,fillAccountSelect} from './restaurant-fund-api.js?v=receipt-sync-01';
const $=id=>document.getElementById(id);let state,editing=null,accountId=null,entryId=null,busy=false,accountTab='bank';
const kinds={in:'입금',out:'출금·카드사용',transfer:'계좌이체·카드대금 납부',purchase:'매입대금 지불'};
$('fund-from').value=today().slice(0,7)+'-01';$('fund-to').value=today();
function draw(){
 const accounts=new Map(state.accounts.map(a=>[a.id,a]));
 const available=state.accounts.filter(a=>a.kind!=='card').reduce((s,a)=>s+Number(a.balance),0);
 const debt=state.accounts.filter(a=>a.kind==='card').reduce((s,a)=>s+Math.max(0,-Number(a.balance)),0);
 $('fund-available').textContent=won(available);$('fund-debt').textContent=won(debt);$('fund-debt-line').textContent=won(debt);
 $('fund-accounts').replaceChildren();
 const shown=state.accounts.filter(a=>accountTab==='card'?a.kind==='card':a.kind!=='card');
 for(const a of shown){
  const row=el('article','','fund-account-row'),front=el('button','','fund-account-front');
  front.type='button';const name=el('span','','fund-account-name');name.append(el('b',a.name+(a.archived?' · 사용 중지':'')),el('small',a.kind==='card'?'미결제금':'현재 잔액'));
  const amount=el('span','','fund-account-amount');amount.append(el('strong',won(a.kind==='card'?Math.max(0,-a.balance):a.balance)));
  if(a.kind==='card'&&a.balance>0)amount.append(el('small','선납 '+won(a.balance)));
  front.append(name,amount);const edit=el('button','수정','fund-account-edit');edit.type='button';edit.inert=true;edit.onclick=()=>openAccount(a);
  const remove=el('button','삭제','fund-account-delete');remove.type='button';remove.inert=true;remove.onclick=()=>deleteAccount(a);
  row.append(edit,remove,front);$('fund-accounts').append(row);
  let start=null,suppress=0;
  const reveal=value=>{for(const other of $('fund-accounts').querySelectorAll('.revealed')){other.classList.remove('revealed');for(const button of other.querySelectorAll('.fund-account-edit,.fund-account-delete'))button.inert=true;}row.classList.toggle('revealed',value);edit.inert=!value;remove.inert=!value;};
  front.setAttribute('aria-label',a.name+' '+amount.textContent+' · 클릭하면 내역 조회, 왼쪽으로 밀면 수정·삭제');
  front.onpointerdown=e=>{if(e.button===0)start={x:e.clientX,y:e.clientY};};
  front.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){start=null;return}if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)*1.3){reveal(dx<0);suppress=Date.now()+500;start=null;}};
  for(const event of ['pointerup','pointercancel','pointerleave'])front.addEventListener(event,()=>{start=null;});
  front.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();reveal(e.key==='ArrowLeft');}};
  front.onclick=()=>{if(Date.now()<suppress)return;if(row.classList.contains('revealed')){reveal(false);return}$('fund-account-filter').value=a.id;draw();$('fund-filter').scrollIntoView({block:'start',behavior:'smooth'});};
 }
 if(!shown.length)$('fund-accounts').append(el('p',accountTab==='card'?'등록된 카드가 없습니다.':'등록된 통장·현금 계좌가 없습니다.','fund-account-empty'));
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
async function deleteAccount(a){
 if(busy)return;
 if(a.receipt_method){alert('정육점 수금과 연결된 계좌·카드는 삭제할 수 없습니다.');return;}
 if(state.entries.some(e=>e.account_id===a.id||e.to_account_id===a.id)){alert('거래내역이 있는 계좌·카드는 삭제할 수 없습니다. 수정에서 사용 중지해 주세요.');return;}
 if(!confirm(a.name+'을(를) 삭제할까요?'+(Number(a.opening_balance)?' 시작잔액 '+won(a.opening_balance)+'도 함께 제거됩니다.':'')))return;
 busy=true;
 try{state=await fundWrite('delete_account',{id:a.id,version:a.version});draw();$('fund-status').textContent='삭제되었습니다.';}
 catch(error){$('fund-status').textContent=error.message;alert(error.message);}
 finally{busy=false;}
}
function openAccount(a=null){
 if(busy)return;editing=a;accountId=a?.id||crypto.randomUUID();$('account-form').reset();
 $('account-title').textContent=a?'계좌·카드 수정':'계좌·카드 등록';
 $('account-name').value=a?.name||'';$('account-kind').value=a?.kind||(accountTab==='card'?'card':'bank');$('account-date').value=a?.opening_date||today();$('account-date').max=today();
 $('account-opening').value=a?.opening_balance||0;$('account-active').value=a?.archived?'archived':'active';
 $('account-active').disabled=!a;$('account-error').textContent='';$('account-editor').showModal();
}
function updateKind(){
 const transfer=$('fund-kind').value==='transfer';$('fund-destination-label').hidden=!transfer;$('fund-destination').required=transfer;
 $('fund-source-label').textContent=transfer?'출금통장·현금':'계좌·카드';
}
function openEntry(kind,cardPayment=false){
 if(busy)return;entryId=crypto.randomUUID();$('fund-form').reset();$('fund-kind').value=kind;
 $('fund-date').value=today();$('fund-date').max=today();fillAccountSelect($('fund-source'),state.accounts);fillAccountSelect($('fund-destination'),state.accounts);
 if(cardPayment){const card=state.accounts.find(a=>a.kind==='card'&&!a.archived);if(card)$('fund-destination').value=card.id;}
 $('fund-title').textContent=cardPayment?'카드대금 납부':kind==='transfer'?'계좌이체':'입금·출금 등록';
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
$('card-payment-new').onclick=()=>openEntry('transfer',true);
function selectTab(kind){
 accountTab=kind;
 for(const [id,value] of [['bank-tab','bank'],['card-tab','card']]){const active=kind===value;$(id).setAttribute('aria-selected',String(active));$(id).tabIndex=active?0:-1;}
 $('fund-section-title').textContent=kind==='card'?'카드':'통장·현금';$('fund-accounts').setAttribute('aria-labelledby',kind==='card'?'card-tab':'bank-tab');
 if(state)draw();
}
for(const [id,kind] of [['bank-tab','bank'],['card-tab','card']]){$(id).onclick=()=>selectTab(kind);$(id).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'bank':e.key==='End'?'card':kind==='bank'?'card':'bank';selectTab(next);$(next==='bank'?'bank-tab':'card-tab').focus();}};}
$('fund-kind').onchange=updateKind;
$('account-close').onclick=()=>{if(!busy)$('account-editor').close()};$('fund-close').onclick=()=>{if(!busy)$('fund-editor').close()};
for(const id of ['account-editor','fund-editor'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('account-form').onsubmit=e=>{e.preventDefault();if(!$('account-form').reportValidity())return;save($('account-form'),'account-error','account',{id:accountId,version:editing?.version,name:$('account-name').value.trim(),kind:$('account-kind').value,opening_date:$('account-date').value,opening_balance:Number($('account-opening').value),archived:$('account-active').value==='archived'},$('account-editor'))};
$('fund-form').onsubmit=e=>{e.preventDefault();if(!$('fund-form').reportValidity())return;const kind=$('fund-kind').value;save($('fund-form'),'fund-error','post',{id:entryId,kind,date:$('fund-date').value,account_id:$('fund-source').value,to_account_id:kind==='transfer'?$('fund-destination').value:null,amount:Number($('fund-amount').value),memo:$('fund-memo').value.trim()},$('fund-editor'))};
$('fund-filter').onsubmit=e=>{e.preventDefault();if(state)draw()};$('fund-account-filter').onchange=()=>{if(state)draw()};
$('fund-refresh').onclick=()=>location.reload();
try{if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');state=await requireLedgerSession(loadFunds);draw();for(const id of ['account-new','entry-new','transfer-new','card-payment-new'])$(id).disabled=false}catch(e){$('fund-status').textContent=e.message}
