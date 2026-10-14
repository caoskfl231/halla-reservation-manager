const labels = {
  id:'코드번호', code:'코드번호', name:'이름', spec:'규격·원산지', unit:'단위', group:'분류', type:'구분', status:'사용 상태',
  price:'단가', avgPrice:'평균단가', salePrice:'판매가격', saleMargin:'판매 마진율', shrinkPrice:'감량원가',
  shrinkPercent:'감량률', deliveryPrice:'납품가격', deliveryMargin:'납품 마진율',
  date:'거래일', time:'시간', customerId:'거래처 코드', customerName:'거래처명', supplierId:'거래처 코드', supplierName:'거래처명',
  itemId:'품목 코드', itemCode:'품목 코드', itemName:'품목명', quantity:'수량', qty:'수량', weight:'중량', unitPrice:'단가',
  amount:'금액', totalAmount:'합계금액', discount:'할인금액', discountAmount:'할인금액', paidAmount:'결제금액',
  balance:'잔액', memo:'메모', note:'비고', phone:'전화번호', tel:'전화번호', address:'주소', email:'이메일',
  businessNumber:'사업자번호', businessNo:'사업자번호', ownerName:'대표자명', contact:'연락처', contactName:'담당자',
  flow:'입출금 방향', accountId:'계좌 코드', accountName:'계좌명', cashflowItemCode:'장부 코드', cashflowItemName:'장부명',
  cashflowTypeCode:'장부 구분 코드', cashflowTypeName:'장부 구분', cashflowGroupCode:'장부 분류 코드', cashflowGroupName:'장부 분류',
  vendor:'거래처', item:'내용', eventType:'거래 종류', paymentMethod:'결제방법', method:'결제방법',
  ledgerTxId:'연결 입출금 번호', groupId:'묶음번호', invoiceId:'전표번호', invoiceNo:'전표번호',
  category:'분류', typeCode:'구분 코드', groupCode:'분류 코드', typeName:'구분명', groupName:'분류명',
  createdAt:'등록일시', updatedAt:'수정일시', order:'표시 순서', sortOrder:'표시 순서', isActive:'사용 여부',
  fingerprint:'중복 확인 번호', transferId:'이체번호', linkedId:'연결번호', source:'입력 경로', sourceType:'입력 구분',
  approvalNo:'승인번호', cardNo:'카드번호', cashflowCode:'장부 코드', dateTime:'거래일시', entryMemo:'입력 메모',
  isOrigin:'원본 여부', kind:'거래 구분', preferEntryMemo:'입력 메모 우선 사용', batchKey:'묶음번호', itemSpec:'품목 규격',
  ledgerName:'장부명', paymentDiscount:'결제 할인금액', supplierGroup:'거래처 분류', supplyAmount:'공급가액',
  taxAmount:'세액', taxType:'과세 구분', warehouse:'창고',
  carryOver:'이월금액', openingBalance:'기초잔액', receipt:'수금', payment:'지불', sales:'매출', purchase:'매입', expense:'지출',
};
const money = new Set(['price','avgPrice','salePrice','shrinkPrice','deliveryPrice','unitPrice','amount','totalAmount','discount','discountAmount','paymentDiscount','supplyAmount','taxAmount','paidAmount','balance','carryOver','openingBalance','receipt','payment','sales','purchase','expense']);
const percent = new Set(['saleMargin','shrinkPercent','deliveryMargin']);
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 6 });
const values = {active:'사용 중',inactive:'사용 안 함',deleted:'삭제됨',in:'입금',out:'출금',income:'입금',outcome:'출금',sale:'매출',sales:'매출',purchase:'매입',expense:'지출',receipt:'수금',payment:'지불',transfer:'이체',cash:'현금',card:'카드',bank:'계좌이체'};
export function fieldLabel(key, store) {
  if (key==='name' && store==='items') return '품목명';
  if (key==='name' && store==='customers') return '거래처명';
  if ((key==='id'||key==='code') && store==='items') return '품목 코드';
  return labels[key] || `추가 정보 (${key})`;
}
export function formatHistoryValue(key, value, store) {
  if (value===undefined) return '—';
  if (value===null || value==='') return '미입력';
  if (typeof value==='boolean') return value?'예':'아니요';
  if (Array.isArray(value)) return value.length ? value.map(v=>formatHistoryValue(key,v,store)).join('\n') : '없음';
  if (typeof value==='object') return Object.entries(value).map(([k,v])=>`${fieldLabel(k,store)}: ${formatHistoryValue(k,v,store)}`).join('\n') || '없음';
  const numeric = typeof value==='number' || (typeof value==='string' && /^-?\d+(\.\d+)?$/.test(value));
  if (numeric && (money.has(key)||percent.has(key))) return number.format(Number(value))+(percent.has(key)?'%':'원');
  if (typeof value==='number') return /id|code|number|no|fingerprint/i.test(key)?String(value):number.format(value);
  if (['status','flow','eventType','paymentMethod','method','type','source'].includes(key)) return values[value] || String(value);
  return String(value);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function historyComparison(record) {
  const before=record.data || {}, available=Object.hasOwn(record,'after_data');
  const after=record.after_data || {};
  const keys=[...new Set([...Object.keys(before),...Object.keys(after)])];
  return { available, deleted:available && record.after_data===null,
    rows:keys.map(key=>({ key, label:fieldLabel(key,record.store),
      before:formatHistoryValue(key,before[key],record.store),
      after:available ? record.after_data===null ? '삭제됨' : formatHistoryValue(key,after[key],record.store) : '확인 불가',
      changed:available && (record.after_data===null || JSON.stringify(canonical(before[key]))!==JSON.stringify(canonical(after[key])))
    })) };
}
