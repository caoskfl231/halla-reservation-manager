// 거래 표는 페이지를 열 때 접어 두고, 사용자가 눌렀을 때만 펼친다.
export function initCollapsibleTransactions(root = document) {
  const controls = new Map();
  root.querySelectorAll('[data-collapsible-transactions]').forEach((panel, index) => {
    if (panel.dataset.collapseBound) return;
    panel.dataset.collapseBound = '1';
    panel.hidden = true;
    if (!panel.id) panel.id = `transaction-panel-${index}`;
    const label = panel.dataset.collapsibleTransactions || '거래내역';
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary transaction-panel-toggle';
    button.setAttribute('aria-controls', panel.id);
    function show(open) {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.textContent = `${label} ${open ? '접기 ▴' : '보기 ▾'}`;
    }
    button.addEventListener('click', () => show(panel.hidden));
    panel.before(button);
    show(false);
    controls.set(panel, show);
  });
  // 상세 영역을 열기 위해 첫 전표를 자동 선택하지 않는다.
  root.querySelectorAll('[data-opens-transaction-detail]').forEach(source => {
    if (source.dataset.detailOpenBound) return;
    source.dataset.detailOpenBound = '1';
    source.addEventListener('click', event => {
      const row = event.target?.closest('tbody tr');
      if (!row || !source.contains(row) || row.dataset.isCarryOver === '1') return;
      const panel = root.getElementById(source.dataset.opensTransactionDetail);
      controls.get(panel)?.(true);
    });
  });
}
