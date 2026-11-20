// Retired: restaurant purchase payments are read from butcher receipts.
export {paidFor,dueFor} from './restaurant-fund-api.js?v=receipt-sync-01';
export async function initPurchasePayments(){const {loadFunds}=await import('./restaurant-fund-api.js?v=receipt-sync-01');return loadFunds()}
export function openPurchasePayment(){const status=document.getElementById('status');if(status)status.textContent='정육점 매출에서 수금처리해 주세요. 식당에는 자동 반영됩니다.'}
