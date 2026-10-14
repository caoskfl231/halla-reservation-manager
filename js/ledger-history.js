import { rpc, friendlyError } from './cloud-session.js?v=app-20261014-history-02';
import { historyComparison } from './history-format.js?v=app-20261014-history-02';
const names = {transactions:'거래',customers:'거래처',items:'품목',ledger_tx:'입출금',users:'사용자',customer_types:'거래처 구분',customer_groups:'거래처 분류',item_groups:'품목 분류',cashflow_items:'장부',cashflow_types:'장부 구분',cashflow_groups:'장부 분류'};
function element(tag, className, text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export function renderHistoryComparison(container, record) {
  const comparison=historyComparison(record), changed=comparison.rows.filter(row=>row.changed);
  container.replaceChildren();
  const summary=element('p','history-change-summary',!comparison.available?'수정 전 내용만 확인할 수 있습니다.':
    comparison.deleted?'삭제된 기록입니다. 아래 내용으로 복구할 수 있습니다.':
    changed.length?`${changed[0].label}${changed.length>1?' 등':''} ${changed.length}개 항목 변경`:'표시된 항목의 변경 내용이 없습니다.');
  container.append(summary);
  const toggleLabel=element('label','history-filter');
  const toggle=element('input');toggle.type='checkbox';toggle.checked=true;
  toggleLabel.append(toggle,element('span',null,'바뀐 항목만 보기'));
  toggleLabel.hidden=!comparison.available || comparison.deleted;
  container.append(toggleLabel);
  const box=element('div','history-table-box'), table=element('table','history-compare-table');
  const caption=element('caption','history-sr-only','기록 당시의 수정 전·후 비교');table.append(caption);
  const head=element('thead'), headings=element('tr');
  for(const text of ['항목',record.action==='delete'?'삭제 전':'수정 전',record.action==='delete'?'삭제 후':'수정 후']) {
    const th=element('th',null,text);th.scope='col';headings.append(th);
  }
  head.append(headings);table.append(head);
  const body=element('tbody');table.append(body);box.append(table);container.append(box);
  const unchanged=comparison.rows.filter(row=>!row.changed);
  const basics=element('details','history-basic-info'), basicsTitle=element('summary',null,`기본 정보 ${unchanged.length}개 보기`);
  const definitions=element('dl');
  for(const row of unchanged)definitions.append(element('dt',null,row.label),element('dd',null,row.before));
  basics.append(basicsTitle,definitions);container.append(basics);
  function draw() {
    body.replaceChildren();
    const rows=comparison.available && !comparison.deleted && toggle.checked?changed:comparison.rows;
    for(const row of rows){
      const tr=element('tr',row.changed?'history-field-changed':'');
      const th=element('th',null,row.label);th.scope='row';
      tr.append(th,element('td','history-before',row.before),element('td','history-after',row.after));body.append(tr);
    }
    if(!rows.length){const tr=element('tr'),td=element('td',null,'변경된 항목이 없습니다. 기본 정보를 확인해 주세요.');td.colSpan=3;tr.append(td);body.append(tr);}
    basics.hidden=!comparison.available || comparison.deleted || !toggle.checked || !unchanged.length;
  }
  toggle.onchange=draw;draw();
  container.append(element('p','history-restore-note','복구하면 선택한 기록 하나가 수정·삭제 전 내용으로 돌아갑니다. 여러 기록을 함께 변경했다면 관련 기록도 확인해 주세요.'));
}
export function installHistoryPanel(owner) {
  const open=element('button','btn-secondary','수정·삭제 기록');open.type='button';
  document.getElementById('ledger-cloud-bar').append(open);
  const overlay=element('div','modal-overlay ledger-history-overlay');
  overlay.innerHTML='<div class="modal-dialog modal-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="ledger-history-title"><section class="card history-panel"><div class="modal-header"><h2 id="ledger-history-title">수정·삭제 기록</h2><button type="button" class="modal-close-x" aria-label="닫기">×</button></div><p class="history-intro">기록을 선택하면 당시의 수정 전·후 내용과 바뀐 항목을 확인할 수 있습니다.</p><div class="history-list"></div><button type="button" class="btn-secondary history-more" hidden>이전 기록 더 보기</button><p class="history-status" role="status"></p><button type="button" class="btn-secondary history-close">닫기</button></section></div>';
  document.body.append(overlay);
  const list=overlay.querySelector('.history-list'), status=overlay.querySelector('.history-status'), more=overlay.querySelector('.history-more');
  let busy=false,cursor=null;
  const close=()=>{if(!busy){overlay.classList.remove('is-open');open.focus();}};
  overlay.querySelector('.modal-close-x').onclick=close;
  overlay.querySelector('.history-close').onclick=close;
  overlay.onclick=e=>{if(e.target===overlay)close();};
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape')close();
    if(e.key==='Tab'){
      const controls=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(node=>!node.closest('[hidden]'));
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  const work=async fn=>{
    if(busy)return;
    busy=true;status.textContent='확인 중…';
    overlay.querySelectorAll('.history-list button,.history-more').forEach(b=>b.disabled=true);
    try{await fn();status.textContent='';}catch(e){status.textContent=friendlyError(e);}
    finally{busy=false;overlay.querySelectorAll('.history-list button,.history-more').forEach(b=>b.disabled=false);}
  };
  const load=()=>work(async()=>{
    const rows=await rpc('halla_ledger_history',cursor?{p_before:cursor.changed_at,p_before_id:cursor.id}:{});
    for(const entry of rows){
      const kind=names[entry.store_name]||'기록';
      const row=element('article','history-entry');
      row.append(element('p','history-entry-kind',`${kind} ${entry.action==='delete'?'삭제':'수정'}`),
        element('h3','history-entry-title',entry.label || `${kind} ${String(entry.record_key)}`),
        element('p','history-entry-meta',`${kind} 코드 ${String(entry.record_key)} · ${new Date(entry.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`));
      const preview=element('div','history-detail');preview.hidden=true;
      const inspect=element('button','btn-secondary history-inspect','변경 내용 확인');inspect.type='button';inspect.setAttribute('aria-expanded','false');
      let selected=null,recover=null;
      inspect.onclick=()=>{
        if(selected){preview.hidden=!preview.hidden;recover&&(recover.hidden=preview.hidden);inspect.setAttribute('aria-expanded',String(!preview.hidden));inspect.textContent=preview.hidden?'변경 내용 확인':'내용 접기';return;}
        work(async()=>{
          const fetched=await rpc('halla_ledger_history_record',{p_id:entry.id});
          renderHistoryComparison(preview,fetched);selected=fetched;preview.hidden=false;
          inspect.textContent='내용 접기';inspect.setAttribute('aria-expanded','true');
          if(recover)recover.hidden=false;
        });
      };
      row.append(inspect,preview);
      if(owner){
        recover=element('button','btn-primary history-recover','이 기록만 복구');recover.type='button';recover.hidden=true;
        recover.onclick=()=>{
          if(busy||!selected||!window.confirm('확인한 이전 내용으로 이 기록 하나를 복구할까요? 현재 내용도 수정 기록에 보관됩니다.'))return;
          work(async()=>{await rpc('halla_ledger_recover_record',{p_id:entry.id,p_expected_version:selected.expected_version});location.reload();});
        };
        row.append(recover);
      }
      list.append(row);
    }
    if(!rows.length&&!cursor)list.textContent='아직 수정·삭제 기록이 없습니다. 이 기능 적용 후 변경한 내용부터 보관됩니다.';
    cursor=rows.at(-1)||cursor;more.hidden=rows.length<50;
  });
  more.onclick=load;
  open.onclick=()=>{
    if(busy)return;
    list.replaceChildren();cursor=null;more.hidden=true;
    overlay.classList.add('is-open');overlay.querySelector('.modal-close-x').focus();load();
  };
}
