export function pageSlice(rows, page, size=100) {
  const pages=Math.max(1,Math.ceil(rows.length/size));
  const current=Math.max(0,Math.min(page,pages-1));
  return {rows:rows.slice(current*size,(current+1)*size),page:current,pages,start:current*size,total:rows.length};
}
export function createHomePager(tableBody, size=100) {
  let rows=[],page=0,paint;
  const nav=document.createElement('nav'); nav.setAttribute('aria-label','거래내역 페이지');
  nav.style.cssText='display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:16px';
  const previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
  previous.textContent='이전 100건';next.textContent='다음 100건';
  for(const button of [previous,next]) {button.type='button';button.className='btn-secondary';button.style.minHeight='44px';}
  label.setAttribute('aria-live','polite');nav.append(previous,label,next);
  tableBody.closest('.table-box').after(nav);
  function render() {
    const slice=pageSlice(rows,page,size);page=slice.page;
    paint(slice.rows);
    previous.disabled=page===0;next.disabled=page>=slice.pages-1;
    label.textContent=rows.length ? `${slice.start+1}–${slice.start+slice.rows.length} / ${rows.length.toLocaleString('ko-KR')}건 · ${page+1}/${slice.pages}페이지` : '0건';
  }
  previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
  return {set(newRows,renderer){rows=newRows;page=0;paint=renderer;render();}};
}
