import { rpc, friendlyError } from './cloud-session.js?v=app-20261014-history-spacing-07';
import { historyComparison } from './history-format.js?v=app-20261014-history-spacing-07';
const names = {transactions:'거래',customers:'거래처',items:'품목',ledger_tx:'입출금',users:'사용자',customer_types:'거래처 구분',customer_groups:'거래처 분류',item_groups:'품목 분류',cashflow_items:'장부',cashflow_types:'장부 구분',cashflow_groups:'장부 분류'};
function element(tag, className, text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export function renderHistoryComparison(container, record, options = {}) {
  const comparison=historyComparison(record), changed=comparison.rows.filter(row=>row.changed);
  container.replaceChildren();
  const summary=element(options.onSummaryClick?'button':'p','history-change-summary',!comparison.available?'수정 전 내용만 확인할 수 있습니다.':
    comparison.deleted?'삭제된 기록입니다. 이전 내용으로 복구할 수 있습니다.':
    changed.length?`${changed[0].label}${changed.length>1?' 등':''} ${changed.length}개 항목 변경`:'표시된 항목의 변경 내용이 없습니다.');
  summary.prepend(element('span','history-summary-icon','!'));
  if(options.onSummaryClick){summary.type='button';summary.setAttribute('aria-expanded','false');summary.append(element('span','history-summary-arrow','⌄'));summary.onclick=options.onSummaryClick;}
  container.append(summary);
  const toggleLabel=element('label','history-filter');
  const toggle=element('input');toggle.type='checkbox';toggle.checked=true;
  toggleLabel.append(element('span',null,'바뀐 항목만 보기'),toggle,element('span','history-switch'));
  toggleLabel.hidden=!comparison.available || !!options.hideFilter;
  container.append(toggleLabel);
  const box=element('div','history-table-box'), table=element('table','history-compare-table');
  const caption=element('caption','history-sr-only','기록 당시의 수정 전·후 비교');table.append(caption);
  const head=element('thead'), headings=element('tr');
  for(const text of ['항목','수정 전','수정 후']) {
    const th=element('th',null,text);th.scope='col';headings.append(th);
  }
  head.append(headings);table.append(head);
  const body=element('tbody');table.append(body);box.append(table);container.append(box);
  const unchanged=comparison.rows.filter(row=>!row.changed);
  const basicKeys=record.store==='items'?['avgPrice','shrinkPercent','spec','unit']:['date','supplierName','customerName','itemName','unit'];
  const basicsRows=unchanged.filter(row=>basicKeys.includes(row.key));
  const deleteKeys=['date','supplierName','customerName','vendor','itemName','name','quantity','amount','totalAmount','unit'];
  const deleteRows=deleteKeys.map(key=>comparison.rows.find(row=>row.key===key)).filter(row=>row && !['미입력','—'].includes(row.before)).slice(0,6);
  if(comparison.deleted && !deleteRows.length)deleteRows.push(...comparison.rows.filter(row=>!['id','code','fingerprint','groupId','batchKey'].includes(row.key)).slice(0,6));
  const otherRows=comparison.deleted?comparison.rows.filter(row=>!deleteRows.includes(row)):unchanged.filter(row=>!basicKeys.includes(row.key));
  const basics=element('details','history-basic-info'), basicsTitle=element('summary',null,`추가 정보 ${otherRows.length}개 보기`);
  const definitions=element('dl');
  for(const row of otherRows)definitions.append(element('dt',null,row.label),element('dd',null,row.before));
  basics.append(basicsTitle,definitions);container.append(basics);
  function appendRow(row) {
    const tr=element('tr',row.changed?'history-field-changed':'');
    const th=element('th',null,row.label);th.scope='row';
    tr.append(th,element('td','history-before',row.before),element('td','history-after',row.after));body.append(tr);
  }
  function draw() {
    body.replaceChildren();
    if(comparison.available && !comparison.deleted){
      changed.forEach(appendRow);
      const visibleBasics=toggle.checked?basicsRows:unchanged;
      if(visibleBasics.length){
        const divider=element('tr','history-basic-divider'),title=element('th',null,'기본 정보');title.colSpan=3;
        divider.append(title);body.append(divider);visibleBasics.forEach(appendRow);
      }
      if(!changed.length && !visibleBasics.length){
        const tr=element('tr'),td=element('td',null,'변경된 항목이 없습니다. 추가 정보를 확인해 주세요.');td.colSpan=3;tr.append(td);body.append(tr);
      }
    }else if(comparison.deleted){
      const rows=!toggle.checked?comparison.rows:deleteRows.length?deleteRows:comparison.rows.slice(0,1);
      for(const [index,row] of rows.entries()){
        const tr=element('tr','history-deleted-field'),th=element('th',null,row.label);th.scope='row';
        tr.append(th,element('td','history-before',row.before));
        if(index===0){const state=element('td','history-delete-state');state.rowSpan=rows.length;state.append(element('span','history-delete-badge','삭제됨'));tr.append(state);}
        body.append(tr);
      }
    }else comparison.rows.forEach(appendRow);
    basics.hidden=!comparison.available || !toggle.checked || !otherRows.length;
  }
  toggle.onchange=()=>{draw();options.onFilterChange?.(toggle.checked);};draw();
  const note=element('p','history-restore-note');note.append(element('span','history-note-icon','i'),element('span',null,'복구하면 선택한 기록의 수정·삭제 전 내용으로 돌아갑니다.'));container.append(note);
  return {setChangedOnly:checked=>{toggle.checked=checked;draw();},isChangedOnly:()=>toggle.checked};
}
export function installHistoryPanel(owner) {
  const open=element('button','btn-secondary','수정·삭제 기록');open.type='button';
  document.getElementById('ledger-cloud-bar').append(open);
  const overlay=element('div','modal-overlay ledger-history-overlay');
  overlay.innerHTML='<div class="modal-dialog modal-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="ledger-history-title"><section class="card history-panel"><div class="history-top"><div class="modal-header"><h2 id="ledger-history-title">수정·삭제 기록</h2><button type="button" class="modal-close-x" aria-label="닫기">×</button></div><p class="history-action-date" hidden></p></div><div class="history-scroll"><div class="history-list"></div><div class="history-selected" hidden></div><button type="button" class="btn-secondary history-more" hidden>이전 기록 더 보기</button></div><div class="history-footer"><div class="history-footer-note"></div><div class="history-recover-holder"></div><p class="history-status" role="status"></p><button type="button" class="btn-secondary history-close">닫기</button><button type="button" class="history-back" hidden>← 다른 기록 보기</button></div></section></div>';
  document.body.append(overlay);
  const list=overlay.querySelector('.history-list'), status=overlay.querySelector('.history-status'), more=overlay.querySelector('.history-more');
  const detail=overlay.querySelector('.history-selected'), back=overlay.querySelector('.history-back');
  const footerNote=overlay.querySelector('.history-footer-note');
  const recovery=overlay.querySelector('.history-recover-holder'),scroll=overlay.querySelector('.history-scroll'),dateLabel=overlay.querySelector('.history-action-date');
  let busy=false,cursor=null;
  const close=()=>{if(!busy){overlay.classList.remove('is-open');open.focus();}};
  overlay.querySelector('.modal-close-x').onclick=close;
  overlay.querySelector('.history-close').onclick=close;
  back.onclick=()=>{if(busy)return;dateLabel.hidden=true;footerNote.replaceChildren();recovery.replaceChildren();scroll.scrollTop=0;detail.replaceChildren();detail.hidden=true;back.hidden=true;list.hidden=false;more.hidden=!cursor?.hasMore;};
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
    overlay.querySelectorAll('.history-list button,.history-selected button,.history-recover-holder button,.history-back,.history-more').forEach(b=>b.disabled=true);
    try{await fn();status.textContent='';}catch(e){status.textContent=friendlyError(e);}
    finally{busy=false;overlay.querySelectorAll('.history-list button,.history-selected button,.history-recover-holder button,.history-back,.history-more').forEach(b=>b.disabled=false);}
  };
  const load=()=>work(async()=>{
    const rows=await rpc('halla_ledger_history',cursor?{p_before:cursor.changed_at,p_before_id:cursor.id}:{});
    for(const entry of rows){
      const kind=names[entry.store_name]||'기록';
      const row=element('article','history-entry');
      row.append(element('p','history-entry-kind',`${kind} ${entry.action==='delete'?'삭제':'수정'}`),
        element('h3','history-entry-title',entry.label || `${kind} ${String(entry.record_key)}`),
        element('p','history-entry-meta',`${kind} 코드 ${String(entry.record_key)} · ${new Date(entry.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`));
      const inspect=element('button','btn-secondary history-inspect','변경 내용 확인');inspect.type='button';
      inspect.onclick=()=>work(async()=>{
        const fetched=await rpc('halla_ledger_history_record',{p_id:entry.id});
        const preview=element('div','history-detail');
        dateLabel.textContent=new Date(fetched.changed_at || entry.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});dateLabel.hidden=false;
        const grouped=element('div','history-batch-list');grouped.hidden=true;
        const controllers=[];let offset=0,loaded=false;
        const groupMore=element('button','btn-secondary history-batch-more','묶음 내역 더 보기');groupMore.type='button';groupMore.hidden=true;
        const batchTitle=element('h3','history-batch-title');grouped.append(batchTitle);
        const batchRows=element('div');grouped.append(batchRows,groupMore);
        const loadBatch=()=>work(async()=>{
          const batch=await rpc('halla_ledger_history_batch',{p_id:entry.id,p_offset:offset});
          if(!Array.isArray(batch.rows)||!Number.isSafeInteger(batch.next)||!Number.isSafeInteger(batch.total)||batch.total<0||batch.next>batch.total||batch.next<=offset && batch.total>offset)throw Error('묶음 기록을 확인하지 못했습니다. 다시 시도해 주세요.');
          for(const rec of batch.rows){
            if(rec.id===entry.id)continue; // The selected record is already displayed above.
            const card=element('article','history-batch-entry'),groupKind=names[rec.store] || '기록';
            card.append(element('h4',null,`${groupKind} ${rec.action==='delete'?'삭제':'수정'}`),element('p','history-batch-name',rec.label || String(rec.key)));
            const comparison=element('div');card.append(comparison);batchRows.append(card);
            const api=renderHistoryComparison(comparison,rec,{hideFilter:true});api.setChangedOnly(selectedView.isChangedOnly());controllers.push(api);
          }
          offset=batch.next;loaded=true;grouped.hidden=false;groupMore.hidden=offset>=batch.total;
          batchTitle.textContent=batch.total>1?`함께 저장된 내역 총 ${batch.total}개 · 현재 기록 포함`:'함께 저장된 다른 기록이 없습니다.';
          summary.setAttribute('aria-expanded','true');scroll.scrollTop=0;
        });
        const selectedView=renderHistoryComparison(preview,fetched,{onSummaryClick:()=>{
          if(busy)return;
          if(!loaded){loadBatch();return;}
          grouped.hidden=!grouped.hidden;summary.setAttribute('aria-expanded',String(!grouped.hidden));
        },onFilterChange:checked=>controllers.forEach(api=>api.setChangedOnly(checked))});
        const summary=preview.querySelector('.history-change-summary');groupMore.onclick=loadBatch;
        const header=element('div','history-record-header'), icon=element('span','history-record-icon',entry.store_name==='items'?'🥩':entry.store_name==='customers'?'🏪':'📒');
        const info=element('div','history-record-info');
        info.append(element('h3','history-record-kind',`${kind} ${entry.action==='delete'?'삭제':'수정'}`),
          element('p','history-record-name',entry.label || `${kind} ${String(entry.record_key)}`),
          element('p','history-record-meta',String(entry.record_key).length<=12?`${kind} 코드 ${String(entry.record_key)}`:''));
        header.append(icon,info);detail.replaceChildren(header,preview,grouped);
        footerNote.replaceChildren(preview.querySelector('.history-restore-note'));
        recovery.replaceChildren();
        if(owner){
          const recover=element('button','btn-primary history-recover','이 기록만 복구');recover.type='button';
          recover.onclick=()=>{
            if(busy||!window.confirm('확인한 이전 내용으로 이 기록 하나를 복구할까요? 현재 내용도 수정 기록에 보관됩니다. 여러 기록을 함께 변경했다면 관련 기록도 확인해 주세요.'))return;
            work(async()=>{await rpc('halla_ledger_recover_record',{p_id:entry.id,p_expected_version:fetched.expected_version});location.reload();});
          };
          recovery.append(recover);
        }
        list.hidden=true;more.hidden=true;detail.hidden=false;back.hidden=false;
        scroll.scrollTop=0;overlay.scrollTop=0;overlay.querySelector('.modal-dialog').scrollTop=0;
      });
      row.append(inspect);
      list.append(row);
    }
    if(!rows.length&&!cursor)list.textContent='아직 수정·삭제 기록이 없습니다. 이 기능 적용 후 변경한 내용부터 보관됩니다.';
    cursor=rows.at(-1)||cursor;if(cursor)cursor.hasMore=rows.length>=50;more.hidden=rows.length<50;
  });
  more.onclick=load;
  open.onclick=()=>{
    if(busy)return;
    list.replaceChildren();list.hidden=false;dateLabel.hidden=true;footerNote.replaceChildren();recovery.replaceChildren();scroll.scrollTop=0;overlay.scrollTop=0;detail.replaceChildren();detail.hidden=true;back.hidden=true;cursor=null;more.hidden=true;
    overlay.classList.add('is-open');overlay.querySelector('.modal-close-x').focus();load();
  };
}
