// Pure rules only: no network, persistence, model or API key.
export const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === s;
}
export function parseCommand(input, today = seoulToday()) {
  const text = String(input ?? '').trim();
  const fail = message => ({ ok:false, message });
  if (!text || text.length > 300) return fail('명령을 1~300자로 입력해 주세요.');
  const lookup = text.match(/^거래처\s+(.+?)\s+조회$/u);
  if (lookup) return { ok:true, intent:'customer_lookup', customerQuery:lookup[1] };
  // Explicit grammar prevents partial interpretation of compound or negated commands.
  let match = text.match(/^(?:(오늘|어제|\d{4}-\d{2}-\d{2})\s+)?(.+?)\s+([\d,]+(?:\.\d+)?)(만)?원?\s+(?:(현금|이체|계좌이체|카드)\s*)?수금(?:\s*미리보기)?$/u);
  // Also accept the customer's natural shorthand, with explicit anchors.
  if (!match) {
    const alternate = text.match(/^(?:(오늘|어제|\d{4}-\d{2}-\d{2})\s+)?(.+?)\s+(현금|이체|계좌이체|카드)\s*(?:수금|결제)\s+([\d,]+(?:\.\d+)?)(만)?원?$/u);
    if (alternate) match = [alternate[0], alternate[1], alternate[2], alternate[4], alternate[5], alternate[3]];
  }
  if (!match) {
    match = text.match(/^(?:(오늘|어제|\d{4}-\d{2}-\d{2})\s+)?(.+?)\s+([\d,]+(?:\.\d+)?)(만)?원?\s+(현금|이체|계좌이체|카드)\s*결제$/u);
  }
  if (!match) return fail('입력 예: 연경 카드수금 20만 / 연경 20만원 카드 수금 / 거래처 연경 조회');
  const [, dateToken, customerQuery, number, man, method] = match;
  if (/수금|결제|지불|삭제|취소|말고|하지|등록|원|\d+(?:만|원)|[;\n]/u.test(customerQuery)) return fail('한 번에 한 거래처의 수금만 입력해 주세요.');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(number)) return fail('금액의 쉼표 위치를 확인해 주세요.');
  const amount = Number(number.replaceAll(',', '')) * (man ? 10000 : 1);
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('금액은 1원 이상의 정수여야 합니다.');
  let date = dateToken || today;
  if (date === '오늘') date = today;
  if (date === '어제') { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-1); date = d.toISOString().slice(0,10); }
  if (!validDate(date)) return fail('실제 존재하는 날짜를 YYYY-MM-DD로 입력해 주세요.');
  return { ok:true, intent:'collection_preview', customerQuery, amount, date, dateDefaulted:!dateToken, paymentMethod:method || null };
}
export function findCustomers(customers, query) {
  const q = normalize(query);
  if (!q) return [];
  const rows = customers.filter(c => normalize(c.id) === q || normalize(c.name) === q);
  return (rows.length ? rows : customers.filter(c => normalize(c.name).includes(q))).map(c => ({ id:c.id, name:c.name, type:c.type, group:c.group, status:c.status }));
}
export function buildPreview(command, customer) {
  if (!command.ok || command.intent !== 'collection_preview') throw new Error('수금 명령이 필요합니다.');
  if (customer.status !== 'active') throw new Error('사용 중인 거래처만 수금 미리보기가 가능합니다.');
  return { date:command.date, supplierId:customer.id, supplierName:customer.name, payment:command.amount, amount:0, category:'sales', eventType:'sales_payment', flow:'in', paymentMethod:command.paymentMethod, saved:false };
}
