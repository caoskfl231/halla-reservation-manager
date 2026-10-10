// 매출처 화면과 대시보드가 함께 사용하는 미수 잔액 기준.
// 조회 시작일은 잔액을 초기화하지 않는다. 종료일이 있으면 그날까지 반영한다.
export function getSalesCustomerRemainingBalance(customer, transactions, to = '') {
  let balance = Number(customer?.openingBalance ?? 0) || 0;
  for (const tx of transactions || []) {
    if (!tx?.date || (to && String(tx.date) > to)) continue;
    balance += Number(tx.amount) || 0;
    balance -= (Number(tx.payment) || 0) + (Number(tx.paymentDiscount) || 0);
  }
  return balance;
}

export function buildSalesCustomerBalances(customers, salesTransactions, to = '') {
  const byCustomer = new Map();
  for (const tx of salesTransactions || []) {
    const id = String(tx?.supplierId ?? '');
    if (!id) continue;
    if (!byCustomer.has(id)) byCustomer.set(id, []);
    byCustomer.get(id).push(tx);
  }
  return new Map((customers || []).map(customer => {
    const id = String(customer?.id ?? '');
    return [id, getSalesCustomerRemainingBalance(customer, byCustomer.get(id), to)];
  }));
}
