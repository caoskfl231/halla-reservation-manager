// A short-lived, same-origin draft. No database calls or submit events.
const KEY='halla_collection_input_draft_v1';
export function validateDraft(raw,now=Date.now()) {
 if(!raw || raw.version!==1 || !Number.isFinite(raw.createdAt) || now-raw.createdAt>600000 || raw.createdAt>now+60000) throw Error('수금 입력 준비 시간이 지났습니다. 명령을 다시 확인해 주세요.');
 const d=raw.draft;
 if(!d || !Number.isSafeInteger(d.payment) || d.payment<=0 || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !d.supplierId || !d.accountCode) throw Error('수금 입력값을 확인해 주세요.');
 const date=new Date(d.date+'T00:00:00Z');
 if(!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10)!==d.date) throw Error('수금일을 확인해 주세요.');
 return {date:d.date,supplierId:String(d.supplierId),payment:d.payment,accountCode:String(d.accountCode)};
}
export function storeDraft(draft,storage=sessionStorage,now=Date.now()) {
 const value={version:1,createdAt:now,draft};validateDraft(value,now);storage.setItem(KEY,JSON.stringify(value));
}
export function consumeDraft(storage=sessionStorage,now=Date.now()) {
 const raw=storage.getItem(KEY);if(!raw)return null;
 storage.removeItem(KEY);return validateDraft(JSON.parse(raw),now);
}
export function fillCollectionFields(root,draft) {
 const account=root.querySelector('#sales-payment-account');
 if(!Array.from(account?.options||[]).some(o=>o.value===draft.accountCode))throw Error('선택한 입금 장부를 찾을 수 없습니다.');
 const values={'sales-payment-date':draft.date,'sales-payment-supplier':draft.supplierId,'sales-payment-supplier-select':draft.supplierId,'sales-payment-account':draft.accountCode,'sales-payment-account-code':draft.accountCode,'sales-payment-amount':String(draft.payment),'sales-payment-discount':'0','sales-payment-memo':'업무명령 수금'};
 for(const [id,value] of Object.entries(values)){const node=root.querySelector('#'+id);if(node)node.value=value;}
}
