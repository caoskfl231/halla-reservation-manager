// Integration code only. The development preview never imports this module.
import { saveCashflowLedgerLinkedPaymentRecord } from './common/cashflow-payment-record.js?v=app-20261018-working-mobile-02';
export async function writeCollection(draft) {
 return saveCashflowLedgerLinkedPaymentRecord({
  actionLabel:'수금', date:draft.date, supplierId:draft.supplierId,
  supplierName:draft.supplierName, supplierGroupName:draft.supplierGroupName,
  accountCode:draft.accountCode, accountLabel:draft.accountLabel,
  amount:draft.payment, paymentDiscount:0, memoText:'업무명령 수금',
  ledgerFlow:'in', ledgerEventType:'sales_payment', ledgerSource:'sales',
  ledgerCustomerId:String(draft.supplierId), ledgerSupplierId:'',
  transactionType:'income', transactionCategory:'sales', transactionSource:'sales',
  includeLedgerName:true, memoFallback:''
 });
}
