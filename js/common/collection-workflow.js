// Dependencies are injected so tests never contact or write to production.
export function inspectCollection(draft, snapshot) {
 const customer = snapshot.customers.find(c => String(c.id) === String(draft.supplierId));
 const account = snapshot.accounts.find(a => String(a.code) === String(draft.accountCode));
 if (!customer || customer.status !== 'active') throw new Error('사용 중인 거래처를 다시 선택해 주세요.');
 if (!account || String(account.status || 'active') !== 'active' || /^A\d{2}$/.test(account.code)) throw new Error('입금 장부명을 선택해 주세요.');
 if (!Number.isSafeInteger(draft.payment) || draft.payment <= 0) throw new Error('수금 금액을 확인해 주세요.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || new Date(draft.date+'T00:00:00Z').toISOString().slice(0,10) !== draft.date) throw new Error('수금 날짜를 확인해 주세요.');
 const method = /카드/.test(account.name) ? '카드' : /현금/.test(account.name) ? '현금' : '이체';
 if (draft.paymentMethod && (draft.paymentMethod === '계좌이체' ? '이체' : draft.paymentMethod) !== method) throw new Error('명령의 결제수단과 선택한 장부가 다릅니다. 장부 또는 명령을 확인해 주세요.');
 // Compare all sales receipts for the customer/day/amount, even across accounts.
 const duplicates = snapshot.transactions.filter(t => t.category === 'sales' && String(t.supplierId) === String(customer.id) && t.date === draft.date && Number(t.payment) === draft.payment);
 const balance = Number(customer.openingBalance || 0) + snapshot.transactions.filter(t => t.category === 'sales' && String(t.supplierId) === String(customer.id) && t.date <= draft.date).reduce((s,t)=>s+(Number(t.amount)||0)-(Number(t.payment)||0)-(Number(t.paymentDiscount)||0),0);
 return { ...draft, supplierName:customer.name, supplierGroupName:customer.group || '미분류', accountLabel:`${account.code} ${account.name}`, paymentMethod:method, duplicates, balance, remaining:balance-draft.payment };
}
export function createCollectionWorkflow({readSnapshot, write, enabled = false}) {
 let busy=false, completed=false, uncertain=false;
 return async function submit(draft, confirmed) {
  if (!confirmed) throw new Error('최종 확인에 체크해 주세요.');
  if (busy || completed || uncertain) throw new Error('이미 처리 중이거나 처리 결과 확인이 필요합니다.');
  busy=true;
  try {
   const checked=inspectCollection(draft,await readSnapshot());
   if(checked.duplicates.length) throw new Error('같은 거래처·날짜·금액의 수금이 있어 진행을 중단했습니다.');
   if(!enabled) return { simulated:true, saved:false, checked };
   // Mark uncertain before submitting: never automatically retry an ambiguous write.
   uncertain=true;
   await write(checked);
   completed=true; uncertain=false;
   return { simulated:false, saved:true, checked };
  } finally { busy=false; }
 };
}
