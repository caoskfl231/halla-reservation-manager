export function isPaymentOnlyTransaction(tx) {
	if (!tx) return false;
	const amount = Number(tx.amount) || 0;
	const payment = Number(tx.payment) || 0;
	const discount = Number(tx.paymentDiscount) || 0;
	return amount === 0 && (payment > 0 || discount > 0);
}

export function makeSummaryKeyForTransaction(tx) {
	if (!tx) return '';
	if (isPaymentOnlyTransaction(tx) && tx.id != null) {
		return `PAY__${tx.id}`;
	}
	const bk = tx.batchKey || '';
	if (bk) return `BATCH__${bk}`;
	const d = tx.date || '';
	const sid = tx.supplierId || '';
	// supplierId가 비어도 날짜로는 묶일 수 있도록 한다.
	// (과거 데이터/특정 플로우에서 supplierId 누락 시 화면에서 전표가 완전히 숨겨지는 문제 방지)
	if (d) return `DATE__${d}__${sid}`;
	return '';
}
