import {initMenuStore,saveMenu} from './restaurant-menu-store.js';
import {calculate} from './restaurant-margin-math.mjs';
const $=id=>document.getElementById(id), ids=['name','menu','cost','unit','base','weight','loss','side','sauce','other','fee','margin','price'];
let mode='margin',items=[],latest=new Map(),valid=false,storageReady=false,editingId=null;
const money=n=>Math.round(n).toLocaleString('ko-KR')+'원';
function values(){return Object.fromEntries(ids.map(id=>[id,['name','menu','unit'].includes(id)?$(id).value:$(id).value===''?NaN:Number($(id).value)]));}
function render(){try{const r=calculate(values(),mode);if(mode==='margin')$('price').value=r.price;else $('margin').value=r.margin.toFixed(4);$('result').replaceChildren();const dl=document.createElement('dl');for(const [k,v] of [['고기 원가',money(r.meat)],['총 재료원가',money(r.total)],['판매가격',money(r.price)],['카드수수료',money(r.card)],['예상 이익',money(r.profit)],['실제 마진율',r.margin.toFixed(2)+'%']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd)}$('result').append(dl);$('message').textContent='';valid=true}catch(e){valid=false;$('result').textContent='—';$('message').textContent=e.message}$('mode').textContent=mode==='margin'?'마진율 기준으로 판매가를 계산합니다.':'판매가격 기준으로 실제 마진율을 계산합니다.'}
$('form').addEventListener('input',e=>{if(e.target.id==='margin')mode='margin';if(e.target.id==='price')mode='price';render()});
$('unit').onchange=()=>{if($('unit').value!=='other')$('base').value=$('unit').value==='kg'?1000:1;else $('base').value='';render()};
function options(){const selected=$('group').value;$('item').replaceChildren(new Option('직접 입력',''));items.filter(i=>!selected||i.group===selected).forEach(i=>$('item').add(new Option(i.name+' · '+(i.spec||'')+' / '+i.unit,String(i.id))))}
$('group').onchange=options;
$('item').onchange=()=>{const i=items.find(i=>String(i.id)===$('item').value);if(!i)return;const unit=String(i.unit||'').trim().toLowerCase(),tx=latest.get(JSON.stringify([String(i.id).trim(),unit]));$('name').value=i.name;$('cost').value=tx?tx.unitPrice:i.price||0;$('loss').value=i.shrinkPercent||0;$('unit').value=['kg','g'].includes(unit)?unit:'other';$('base').value=unit==='kg'?1000:unit==='g'?1:'';$('source').textContent=tx?'최근 매입가 · '+tx.date+' / '+tx.unit:'등록 단가 / '+i.unit+' · 같은 단위의 매입 기록 없음';render()};
$('load').onclick=async()=>{ $('load').disabled=true;try{const [db,idx]=await Promise.all([import('./db.js?v=app-20261018-working-mobile-02'),import('./item-manage/item-list-manager.js?v=ledger-price-source-01')]);const {request,accessToken}=await import('./cloud-session.js?v=app-20261018-working-mobile-02');const {loadSyncedLedger}=await import('./ledger-read-cache.js?v=app-20261018-working-mobile-02');const token=await accessToken();const state=await loadSyncedLedger((name,body)=>request('/rest/v1/rpc/'+name,body,token,120000),null);const rows=state.snapshot.stores.items||[],txs=state.snapshot.stores.transactions||[];items=rows.filter(i=>i.status!=='inactive');latest=idx.indexLatestPurchases(txs);$('group').replaceChildren(new Option('전체',''));[...new Set(items.map(i=>i.group).filter(Boolean))].sort().forEach(g=>$('group').add(new Option(g,g)));options();$('source').textContent=items.length+'개 품목을 불러왔습니다. 품목을 선택하세요.'}catch(e){$('source').textContent='장부 불러오기 실패: 다시 시도해 주세요.'}finally{$('load').disabled=false}};
$('form').onsubmit=e=>{e.preventDefault();render();if(!valid||!$('form').reportValidity())return;if(!storageReady){$('message').textContent='로그인 확인이 끝난 후 저장해 주세요.';return}try{saveMenu(values(),mode,editingId);location.href='restaurant-menus.html?business=restaurant&saved=1'}catch(e){$('message').textContent='저장하지 못했습니다. '+e.message}};
$('form').onreset=()=>setTimeout(()=>{mode='margin';editingId=null;$('save-menu').disabled=false;$('save-menu').textContent='메뉴 저장';$('source').textContent='새 메뉴를 입력하세요.';render()},0);
render();
try{
 const records=await initMenuStore();storageReady=true;
 const edit=new URLSearchParams(location.search).get('edit');
 if(edit){const record=records.find(r=>r.id===edit);if(!record){$('save-menu').disabled=true;$('message').textContent='메뉴를 찾을 수 없습니다. 저장한 메뉴 페이지에서 다시 선택하세요.'}else{
 editingId=record.id;ids.forEach(id=>$(id).value=record.v[id]??'');mode=record.mode;render();$('save-menu').textContent='수정 내용 저장';$('source').textContent='저장한 메뉴를 수정하고 있습니다.';
 }}
}catch{$('message').textContent='로그인 또는 저장내역 확인에 실패했습니다. 새로고침해 주세요.'}
