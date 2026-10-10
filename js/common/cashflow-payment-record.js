import { addTransaction, putLedgerTx } from "../db.js?v=app-20261010-8";
import { ensureLedgerTxKeys } from "./ledger-tx-normalizer.js?v=app-20261010-8";
import { resolveCashflowItemSelectionOrThrow } from "./cashflow-item-helpers.js?v=app-20261010-8";
import { inferLedgerPaymentMethod } from "./payment-ledger-helpers.js?v=app-20261010-8";
import { buildLedgerMemoFields, stripCodePrefix } from "./util.js?v=app-20261010-8";

/**
 * Ledger DB(ledger_tx) + hallapa_db.transactions 를 동시에 기록하는 공통 결제 저장 함수.
 *
 * 수금/지불/지출 결제 등 “통장 선택 + 금액” 형태의 모달/인라인 결제 UI에서 재사용한다.
 */
export async function saveCashflowLedgerLinkedPaymentRecord({
  // UI/검증
  actionLabel, // 예: '수금' | '지불' | '지출'

  // 입력
  date,
  supplierId,
  supplierName,
  supplierGroupName,
  accountCode,
  accountLabel,
  amount,
  paymentDiscount = 0,
  memoText,

  // Ledger 저장 설정
  ledgerFlow, // 'in' | 'out'
  ledgerEventType, // 예: 'sales_payment' | 'purchase_payment' | 'expense_payment'
  ledgerSource, // 예: 'sales' | 'purchase' | 'expense'
  ledgerCustomerId = "",
  ledgerSupplierId = "",

  // Transactions 저장 설정
  transactionType, // 예: 'income' | 'expense'
  transactionCategory, // 예: 'sales' | 'purchase' | 'expense'
  transactionSource, // 예: 'sales' | 'purchase' | 'expense'
  includeLedgerName = false,
  memoFallback = "", // '' | 'accountNameOnly'
}) {
  if (!supplierId) throw new Error("supplierId is required");
  if (!accountCode) throw new Error("accountCode is required");
  if (!(Number(amount) > 0)) throw new Error("amount must be positive");
  if (Number(paymentDiscount) < 0) throw new Error("paymentDiscount must be >= 0");
  if (!ledgerFlow) throw new Error("ledgerFlow is required");
  if (!ledgerEventType) throw new Error("ledgerEventType is required");
  if (!ledgerSource) throw new Error("ledgerSource is required");
  if (!transactionType) throw new Error("transactionType is required");
  if (!transactionCategory) throw new Error("transactionCategory is required");
  if (!transactionSource) throw new Error("transactionSource is required");

  const safeSupplierName = supplierName || "";
  const safeGroupName = supplierGroupName || "미분류";
  const label = accountLabel || accountCode;
  const accountNameOnly = stripCodePrefix(label);

  // 결제 저장은 장부명/항목(A0001...) 선택을 필수로 한다.
  const { code: pickedItemCode, name: pickedItemName } =
    await resolveCashflowItemSelectionOrThrow({
      accountCode,
      accountLabel: label,
      actionLabel: actionLabel || "결제",
    });

  const ledgerId = crypto.randomUUID();
  const now = Date.now();
  const method = inferLedgerPaymentMethod(accountNameOnly || accountCode);
  const memoFields = buildLedgerMemoFields(
    memoText,
    `${actionLabel || "결제"} - ${safeSupplierName}`,
  );

  const ledgerTx = {
    id: ledgerId,
    date,
    flow: ledgerFlow,
    kind: "기타",
    eventType: ledgerEventType,
    source: ledgerSource,
    paymentMethod: method,
    accountId: accountCode,
    // Ledger DB 쪽에는 코드+이름 전체 라벨을 저장
    accountName: label,
    cashflowCode: pickedItemCode,
    cashflowItemCode: pickedItemCode,
    cashflowItemName: pickedItemName,
    amount: Number(amount),
    vendor: safeSupplierName,
    item: safeSupplierName,
    memo: memoFields.memo,
    entryMemo: memoFields.entryMemo,
    preferEntryMemo: memoFields.preferEntryMemo,
    customerId: ledgerCustomerId,
    supplierId: ledgerSupplierId,
    groupId: null,
    isOrigin: null,
    createdAt: now,
    updatedAt: now,
  };

  await putLedgerTx(ensureLedgerTxKeys(ledgerTx));

  const trimmedMemo = memoText && String(memoText).trim() ? String(memoText).trim() : "";
  const memo =
    trimmedMemo || (memoFallback === "accountNameOnly" ? accountNameOnly : "");

  const paymentTx = {
    type: transactionType,
    category: transactionCategory,
    date,
    supplierId,
    supplierName: safeSupplierName,
    amount: 0,
    payment: Math.abs(Number(amount)),
    paymentDiscount: Math.abs(Number(paymentDiscount) || 0),
    taxType: "",
    warehouse: "",
    supplierGroup: safeGroupName,
    ...(includeLedgerName ? { ledgerName: accountNameOnly } : {}),
    memo,
    source: transactionSource,
    ledgerTxId: String(ledgerId),
  };

  await addTransaction(paymentTx);

  return { ledgerId: String(ledgerId), accountNameOnly, paymentTx, ledgerTx };
}

