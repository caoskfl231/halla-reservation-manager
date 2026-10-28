import { rpc, session, loginRedirect } from './cloud-session.js?v=app-20261018-working-mobile-02';
// Existing authenticated read RPC only; no writes or schema changes.
export async function readSnapshot() {
 if (!session()?.access_token) { loginRedirect(); throw new Error('LOGIN_REQUIRED'); }
 const state=await rpc('halla_ledger_read');
 const s=state?.snapshot?.stores;
 if(!s || !Array.isArray(s.customers) || !Array.isArray(s.cashflow_items) || !Array.isArray(s.transactions)) throw new Error('최신 장부 조회에 실패했습니다.');
 return {customers:s.customers,accounts:s.cashflow_items,transactions:s.transactions};
}
