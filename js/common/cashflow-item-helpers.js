import { getCashflowItems } from '../db.js?v=app-20261010-6';
import { stripCodePrefix } from './util.js?v=app-20261010-6';

function looksLikeCashflowTypeCode(code) {
  return /^A\d{2}$/.test(String(code || '').trim());
}

export async function resolveCashflowItemSelectionOrThrow({
  accountCode,
  accountLabel,
  actionLabel = '결제',
}) {
  const codeStr = String(accountCode || '').trim();
  if (!codeStr) throw new Error('accountCode is required');

  let pickedItemCode = '';
  let pickedItemName = '';

  try {
    const items = await getCashflowItems();
    const list = Array.isArray(items) ? items : [];
    const hit = list.find((it) => it && String(it.code || '') === codeStr);
    if (hit) {
      pickedItemCode = String(hit.code || '').trim();
      pickedItemName = String(hit.name || '').trim();
    }
  } catch (_) {
    // 무시: 조회 실패 시 아래에서 코드 형태로 판정
  }

  if (!pickedItemCode) {
    if (looksLikeCashflowTypeCode(codeStr)) {
      throw new Error('장부구분이 아니라 장부명(예: A0001)을 선택해 주세요.');
    }
    throw new Error(`${actionLabel}에 사용할 장부명을 선택해 주세요.`);
  }

  if (!pickedItemName) {
    const label = String(accountLabel || codeStr);
    pickedItemName = stripCodePrefix(label).trim();
  }

  return { code: pickedItemCode, name: pickedItemName };
}

