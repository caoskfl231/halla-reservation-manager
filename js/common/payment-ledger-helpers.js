import { getLedgerTxById, deleteLedgerTxById } from '../db.js?v=app-20261010-7';
import { isPaymentLinkedTransaction } from './util.js?v=app-20261010-7';

export function inferLedgerPaymentMethod(label) {
	const str = String(label || '').toLowerCase();
	if (str.includes('카드')) return 'card';
	if (str.includes('현금')) return 'cash';
	return 'bank';
}

export async function isLockedByPaymentLedger(tx) {
	if (!tx || !tx.ledgerTxId) return false;
	if (!isPaymentLinkedTransaction(tx)) return false;
	try {
		const ledger = await getLedgerTxById(tx.ledgerTxId);
		return Boolean(ledger);
	} catch (_) {
		return false;
	}
}

export async function hasLockedPaymentEntries(list) {
	for (const tx of list || []) {
		if (await isLockedByPaymentLedger(tx)) return true;
	}
	return false;
}

export async function deleteLinkedLedgerTxIfAny(tx) {
	if (!tx || !tx.ledgerTxId) return;
	// 통합결제 화면에서 생성된 전표는 여기서 삭제하지 않는다.
	if (isPaymentLinkedTransaction(tx)) return;
	try {
		await deleteLedgerTxById(tx.ledgerTxId);
	} catch (_) {
		// ledger 쪽 삭제 실패는 사용자 경험을 해치지 않도록 무시하고 진행
	}
}

