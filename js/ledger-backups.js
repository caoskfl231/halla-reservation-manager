import { rpc, friendlyError } from './cloud-session.js?v=ledger-load-20261010-1';
import { installHistoryPanel } from './ledger-history.js?v=ledger-load-20261010-1';

export function installBackupPanel(restore, owner) {
  if (document.body.dataset.mode !== 'home') return;
  installHistoryPanel(owner);
  const open = document.createElement('button');
  open.type = 'button'; open.textContent = '자동백업';
  document.getElementById('ledger-cloud-bar').append(open);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-backups-title"><section class="card"><div class="modal-header"><h2 id="ledger-backups-title">자동백업</h2><button type="button" class="modal-close-x" aria-label="닫기">×</button></div><p>매일 새벽 3시(한국 시간)에 서버에 보관합니다. 최근 30일분을 확인할 수 있습니다.</p><p>복구하면 장부 전체가 선택한 날짜의 내용으로 바뀝니다. 먼저 내려받아 자료를 확인하세요. 복구 직전 장부는 서버에 따로 보관됩니다.</p><div class="backup-list"></div><p class="backup-status" role="status"></p></section></div>';
  document.body.append(overlay);
  const list = overlay.querySelector('.backup-list');
  const status = overlay.querySelector('.backup-status');
  let busy = false;
  const close = () => { if (!busy) { overlay.classList.remove('is-open'); open.focus(); } };
  overlay.querySelector('.modal-close-x').onclick = close;
  overlay.onclick = event => { if (event.target === overlay) close(); };
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('button:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  const run = async work => {
    if (busy) return;
    busy = true; status.textContent = '처리 중…';
    overlay.querySelectorAll('.backup-list button').forEach(b => b.disabled = true);
    try { await work(); status.textContent = '완료'; }
    catch (error) { status.textContent = friendlyError(error); }
    finally {
      busy = false;
      overlay.querySelectorAll('.backup-list button').forEach(b => b.disabled = false);
    }
  };
  open.onclick = async () => {
    overlay.classList.add('is-open'); overlay.querySelector('.modal-close-x').focus();
    list.replaceChildren(); status.textContent = '백업 목록 확인 중…';
    try {
      const backups = await rpc('halla_ledger_backups');
      status.textContent = backups.length ? '' : '아직 백업이 없습니다. 처음 장부자료를 옮기면 첫 백업이 생성됩니다.';
      for (const backup of backups) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid #d5dbe5';
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:180px';
        label.textContent = backup.date + ' · ' + backup.item_count.toLocaleString('ko-KR') + '개 항목';
        row.append(label);
        const download = document.createElement('button');
        download.type = 'button'; download.className = 'btn-secondary'; download.textContent = '내려받기';
        download.onclick = () => run(async () => {
          const snapshot = await rpc('halla_ledger_backup', { p_date: backup.date });
          const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)], { type:'application/json' }));
          const link = document.createElement('a');
          link.href = url; link.download = 'hallapa-auto-backup-' + backup.date + '.json';
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        });
        row.append(download);
        if (owner) {
          const recover = document.createElement('button');
          recover.type = 'button'; recover.className = 'btn-secondary'; recover.textContent = '이 날짜로 복구';
          recover.onclick = () => {
            if (!window.confirm(backup.date + ' 백업으로 장부 전체를 바꿀까요? 이후 입력된 내용은 현재 장부에서 사라집니다. 먼저 전체백업으로 현재 자료를 보관해 주세요.')) return;
            run(async () => {
              const snapshot = await rpc('halla_ledger_backup', { p_date: backup.date });
              await restore(snapshot); location.reload();
            });
          };
          row.append(recover);
        }
        list.append(row);
      }
    } catch (error) { status.textContent = friendlyError(error); }
  };
}
