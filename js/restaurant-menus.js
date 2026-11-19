import {initMenuStore,readMenus,deleteMenu} from './restaurant-menu-store.js';
import {calculate} from './restaurant-margin-math.mjs';
const money=n=>Math.round(n).toLocaleString('ko-KR')+'원';
const status=document.getElementById('status'),list=document.getElementById('menus');
function render(){
 const rows=readMenus();list.replaceChildren();
 status.textContent=rows.length?'저장한 메뉴 '+rows.length+'개':'저장한 메뉴가 없습니다. 판매가·마진 계산에서 첫 메뉴를 저장하세요.';
 for(const row of rows){
 const section=document.createElement('section'),title=document.createElement('h2');title.textContent=row.v.menu;section.append(title);
 const dl=document.createElement('dl');
 try{
 const r=calculate(row.v,row.mode);
 const entries=[['품명',row.v.name||'—'],['판매중량',row.v.weight+'g'],['매입단가',money(row.v.cost)],['매입 기준중량',row.v.base+'g'],['감량률',row.v.loss+'%'],['반찬 · 야채',money(row.v.side)],['소스 · 양념',money(row.v.sauce)],['기타 재료',money(row.v.other)],['총 재료원가',money(r.total)],['판매가격',money(r.price)],['카드수수료',money(r.card)],['예상 이익',money(r.profit)],['마진율',r.margin.toFixed(2)+'%']];
 for(const [label,value] of entries){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd)}
 }catch{const p=document.createElement('p');p.textContent='계산값을 확인하려면 수정해 주세요.';section.append(p)}
 section.append(dl);
 const note=document.createElement('small');note.textContent='1인분 기준 · 인건비·월세·세금 차감 전';section.append(note);
 const actions=document.createElement('div');actions.className='actions';
 const edit=document.createElement('a');edit.textContent='수정';edit.href='restaurant-margin.html?business=restaurant&edit='+encodeURIComponent(row.id);edit.style.cssText='flex:1;padding:12px;text-align:center';
 const del=document.createElement('button');del.textContent='삭제';del.style.width='100px';
 del.onclick=()=>{if(!confirm('이 메뉴를 삭제할까요?'))return;try{deleteMenu(row.id);render()}catch{status.textContent='삭제하지 못했습니다. 다시 시도해 주세요.'}};
 actions.append(edit,del);section.append(actions);list.append(section);
 }
}
try{await initMenuStore();render()}catch{status.textContent='저장한 메뉴를 불러오지 못했습니다. 새로고침해 주세요.'}
window.addEventListener('storage',()=>{try{render()}catch{status.textContent='목록을 새로고침해 주세요.'}});
