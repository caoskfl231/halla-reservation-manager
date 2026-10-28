import { parseCommand, findCustomers, buildPreview } from './common/command-rules.js?v=app-20261018-working-mobile-02';
const form = document.querySelector('#command-form');
const input = document.querySelector('#command');
const output = document.querySelector('#command-result');
let generation = 0;
input.addEventListener('input', () => { generation++; output.replaceChildren(); });
function line(text) { const p = document.createElement('p'); p.textContent = text; output.append(p); }
form.addEventListener('submit', async event => {
  event.preventDefault();
  const request = ++generation;
  output.replaceChildren();
  const command = parseCommand(input.value);
  if (!command.ok) { line(command.message); return; }
  line('거래처를 조회하고 있습니다…');
  try {
    // Lazy import keeps syntax help available without starting the DB session.
    const { getCustomers } = await import('./db.js?v=app-20261018-working-mobile-02');
    const customers = await getCustomers();
    if (request !== generation) return;
    const candidates = findCustomers(customers, command.customerQuery);
    output.replaceChildren();
    if (!candidates.length) { line('일치하는 거래처가 없습니다. 이름 또는 거래처 코드를 확인해 주세요.'); return; }
    line(`조회 결과 ${candidates.length}곳 · 사용할 거래처를 직접 선택해 주세요.`);
    for (const customer of candidates) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${customer.name} (${customer.id}) · ${customer.type || '구분 없음'} · ${customer.group || '미분류'} · ${customer.status || '상태 미확인'}`;
      output.append(button);
      button.addEventListener('click', () => {
        if (request !== generation) return;
        const old = output.querySelector('section'); old?.remove();
        const section = document.createElement('section'); output.append(section);
        const p = document.createElement('p'); section.append(p);
        if (command.intent === 'customer_lookup') { p.textContent = `선택한 거래처: ${customer.name} (${customer.id})`; return; }
        try {
          const preview = buildPreview(command, customer);
          p.textContent = `수금 미리보기 · ${preview.date}${command.dateDefaulted ? ' (오늘 자동 적용)' : ''} · ${preview.supplierName} (${preview.supplierId}) · ${preview.payment.toLocaleString('ko-KR')}원 · ${preview.paymentMethod || '결제수단 미지정'} · 입금 장부/계좌 미선택 · 저장되지 않았습니다.`;
        } catch (error) { p.textContent = error.message; }
      });
    }
  } catch { if (request === generation) { output.replaceChildren(); line('거래처 조회에 실패했습니다. 로그인과 연결 상태를 확인한 뒤 다시 시도해 주세요.'); } }
});
