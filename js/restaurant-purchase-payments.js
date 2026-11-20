import {loadFunds,fundWrite,won,today,paidFor,dueFor,fillAccountSelect} from './restaurant-fund-api.js?v=funds-01';
export {paidFor,dueFor};
let state,selected=[],busy=false,requestId=null;
const dialog=document.createElement('dialog');dialog.className='fund-dialog';dialog.setAttribute('aria-labelledby','pay-title');
dialog.innerHTML=`<form id="pay-form"><h2 id="pay-title" tabindex="-1" autofocus>매입대금 지불</h2><p id="pay-selection"></p><div class="fund-summary" id="pay-summary"></div><p class="fund-note">실제 송금 후 지불 내역을 기록해 주세요.</p><div class="fund-fields"><label>지불일<input id="pay-date" type="date" required></label><label>식당 출금통장·카드<select id="pay-account" required></select></label><label>정육점 입금통장<select id="pay-butcher" required></select></label><label>지불금액(원)<input id="pay-amount" type="number" min="1" step="1" required inputmode="numeric"></label><label>메모<input id="pay-memo" maxlength="1000"></label></div><p id="pay-error" role="alert"></p><div class="fund-actions"><button id="pay-save">지불 저장</button><button type="button" id="pay-close" class="secondary">닫기</button></div><a href="restaurant-funds.html?business=restaurant">자금관리에서 계좌 등록·지불내역 확인</a></form>`;
document.body.append(dialog);
const $=id=>document.getElementById(id);let onSaved=()=>{};
export async function initPurchasePayments(callback){onSaved=callback;state=await loadFunds();return state}
export async function openPurchasePayment(rows){
 try{
 state=await loadFunds();onSaved(state);
 selected=rows.filter(r=>r.source==='butcher-sales'&&dueFor(state,r)>0);
 if(!selected.length)throw Error('선택한 매입내역에 미지급금이 없습니다.');
 requestId=crypto.randomUUID();$('pay-form').reset();
 const amount=selected.reduce((sum,r)=>sum+dueFor(state,r),0);
 $('pay-selection').textContent=selected.length===1?selected[0].date+' · '+selected[0].itemName:selected[0].date+' · '+selected.length+'개 매입항목';
 $('pay-summary').textContent='선택 미지급금 '+won(amount);
 $('pay-date').value=today();$('pay-date').max=today();$('pay-date').min=selected.reduce((max,r)=>r.date>max?r.date:max,'');
 fillAccountSelect($('pay-account'),state.accounts);
 $('pay-butcher').replaceChildren(new Option('정육점에서 입금받은 통장 선택',''));
 for(const a of state.butcher_accounts)$('pay-butcher').add(new Option(a.name,a.code));
 $('pay-amount').value=amount;$('pay-amount').max=amount;
 $('pay-error').textContent=state.accounts.some(a=>!a.archived)?'':'먼저 자금관리에서 식당 계좌를 등록해 주세요.';
 dialog.showModal();
 }catch(e){$('status').textContent=e.message}
}
$('pay-close').onclick=()=>{if(!busy)dialog.close()};
dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('pay-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!$('pay-form').reportValidity())return;
 busy=true;for(const x of $('pay-form').querySelectorAll('input,select,button'))x.disabled=true;
 try{
 state=await fundWrite('post',{id:requestId,kind:'purchase',date:$('pay-date').value,account_id:$('pay-account').value,amount:Number($('pay-amount').value),butcher_account:$('pay-butcher').value,purchase_ids:selected.map(r=>r.id),memo:$('pay-memo').value.trim()});
 onSaved(state);dialog.close();$('status').textContent='지불을 저장했습니다. 식당 출금과 정육점 수금이 함께 반영되었습니다.';
 }catch(error){$('pay-error').textContent=error.message}
 finally{busy=false;for(const x of $('pay-form').querySelectorAll('input,select,button'))x.disabled=false}
};
