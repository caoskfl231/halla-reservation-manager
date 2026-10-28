import { storeDraft } from './common/collection-draft.js?v=app-20261018-working-mobile-02';
import { inspectCollection, createCollectionWorkflow } from './common/collection-workflow.js?v=app-20261018-working-mobile-02';
import { readSnapshot } from './collection-read.js?v=app-20261018-working-mobile-02';
export async function mountCollectionConfirmation(section, draft, isCurrent) {
 const status=document.createElement('p'); section.append(status); status.textContent='입금 장부를 조회하고 있습니다…';
 try {
  const snapshot=await readSnapshot();
  if(!isCurrent() || !section.isConnected) return;
  const label=document.createElement('label'); label.textContent='입금 계좌·장부 '; section.append(label);
  const select=document.createElement('select'); label.append(select);
  select.add(new Option('입금 장부를 선택해 주세요',''));
  for(const a of snapshot.accounts.filter(a=>a.code && String(a.status||'active')==='active' && !/^A\d{2}$/.test(a.code))) select.add(new Option(`${a.code} ${a.name}`,a.code));
  const result=document.createElement('div'); section.append(result);status.textContent='개발 확인 단계 · 실제 저장되지 않습니다.';
  let version=0;
  select.addEventListener('change',async()=>{
   const request=++version;result.replaceChildren();
   if(!select.value)return;
   const working={...draft,accountCode:select.value};
   const message=document.createElement('p');result.append(message);message.textContent='최신 자료로 중복 수금과 잔액을 확인하고 있습니다…';
   try {
    const checked=inspectCollection(working,await readSnapshot());
    if(request!==version || !isCurrent() || !section.isConnected)return;
    message.textContent=`${checked.date} · ${checked.supplierName} · ${checked.payment.toLocaleString('ko-KR')}원 · ${checked.accountLabel} · ${checked.paymentMethod} / 수금 전 미수 ${checked.balance.toLocaleString('ko-KR')}원 → 수금 후 ${checked.remaining.toLocaleString('ko-KR')}원 (선택 날짜까지 기준)`;
    if(checked.remaining<0){const warning=document.createElement('p');warning.textContent='수금 후 잔액이 음수입니다. 선수금 또는 초과 수금 여부를 확인해 주세요.';result.append(warning);}
    if(checked.duplicates.length){const warning=document.createElement('p');warning.textContent=`동일 거래처·날짜·금액의 수금 ${checked.duplicates.length}건이 있어 진행을 중단했습니다. 기존 장부에서 확인해 주세요.`;result.append(warning);return;}
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox'; label.append(check,document.createTextNode('거래처·날짜·금액·입금 장부를 확인했습니다.'));result.append(label);
    const button=document.createElement('button');button.type='button';button.textContent='최종 확인 테스트 (저장 안 함)';button.disabled=true;result.append(button);
    check.addEventListener('change',()=>{button.disabled=!check.checked;});
    const submit=createCollectionWorkflow({readSnapshot,enabled:false});
    button.textContent='수금 입력창 열기 (저장 안 함)';
    button.addEventListener('click',async()=>{
     if(!isCurrent() || request!==version)return;
     button.disabled=true;check.disabled=true;select.disabled=true;
     try {const response=await submit(working,check.checked);if(!isCurrent() || !section.isConnected)return;storeDraft(response.checked);location.assign('sales-manage.html');}
     catch(error){if(isCurrent() && section.isConnected)message.textContent=error.message+' 다시 장부를 선택해 확인해 주세요.';}
     finally {select.disabled=false;}
    });
   }catch(error){if(request===version && isCurrent() && section.isConnected)message.textContent=error.message;}
  });
 }catch{if(isCurrent() && section.isConnected)status.textContent='입금 장부 조회에 실패했습니다. 로그인과 연결 상태를 확인해 주세요.';}
}
