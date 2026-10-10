import { rpc, friendlyError } from './cloud-session.js?v=app-20261010-11';
const names = {transactions:'거래',customers:'거래처',items:'품목',ledger_tx:'입출금',users:'사용자',customer_types:'거래처 구분',customer_groups:'거래처 분류',item_groups:'품목 분류',cashflow_items:'장부',cashflow_types:'장부 구분',cashflow_groups:'장부 분류'};
export function installHistoryPanel(owner) {
  const open = document.createElement('button');
  open.type='button'; open.textContent='수정·삭제 기록';
  document.getElementById('ledger-cloud-bar').append(open);
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML='<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-history-title"><section class="card"><div class="modal-header"><h2 id="ledger-history-title">수정·삭제 기록</h2><button type="button" class="modal-close-x" aria-label="닫기">×</button></div><p>수정·삭제 직전의 내용입니다. 이전 내용으로 복구하면 선택한 기록 하나만 바뀝니다. 여러 기록을 함께 변경했다면 관련 기록도 확인해 주세요.</p><div class="history-list"></div><button type="button" class="btn-secondary history-more" hidden>이전 기록 더 보기</button><p class="history-status" role="status"></p></section></div>';
  document.body.append(overlay);
  const list=overlay.querySelector('.history-list'), status=overlay.querySelector('.history-status'), more=overlay.querySelector('.history-more');
  let busy=false,cursor=null;
  const close=()=>{if(!busy){overlay.classList.remove('is-open');open.focus();}};
  overlay.querySelector('.modal-close-x').onclick=close;
  overlay.onclick=e=>{if(e.target===overlay)close();};
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape')close();
    if(e.key==='Tab'){
      const controls=[...overlay.querySelectorAll('button:not(:disabled):not([hidden])')],first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
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
      const row=document.createElement('div');
      row.style.cssText='padding:12px 0;border-bottom:1px solid #d5dbe5';
      const label=document.createElement('p');
      label.style.cssText='margin:0 0 8px;overflow-wrap:anywhere';
      label.textContent=new Date(entry.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+(entry.action==='delete'?'삭제':'수정')+' · '+(names[entry.store_name]||entry.store_name)+' '+String(entry.record_key)+(entry.label?' · '+entry.label:'');
      const preview=document.createElement('pre');
      preview.hidden=true;
      preview.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f9;padding:12px;font-size:14px';
      const inspect=document.createElement('button');
      inspect.type='button';inspect.className='btn-secondary';inspect.textContent='이전 내용 확인';
      let selected=null;
      inspect.onclick=()=>work(async()=>{
        selected=await rpc('halla_ledger_history_record',{p_id:entry.id});
        preview.textContent=JSON.stringify(selected.data,null,2);preview.hidden=false;
        if(recover)recover.hidden=false;
      });
      let recover=null;
      if(owner){
        recover=document.createElement('button');
        recover.type='button';recover.className='btn-secondary';recover.textContent='이 기록만 복구';recover.hidden=true;
        recover.style.marginLeft='8px';
        recover.onclick=()=>{
          if(!selected||!window.confirm('확인한 이전 내용으로 이 기록 하나를 복구할까요? 현재 내용도 수정 기록에 보관됩니다.'))return;
          work(async()=>{
            await rpc('halla_ledger_recover_record',{p_id:entry.id,p_expected_version:selected.expected_version});
            location.reload();
          });
        };
      }
      row.append(label,inspect);if(recover)row.append(recover);row.append(preview);list.append(row);
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
