import {business} from './business-context.js';
import {menuPrice,actualMargin,latestKgPurchases} from './restaurant-menu-calc.js?v=menu-02';
const $=id=>document.getElementById(id),money=n=>Math.round(n).toLocaleString('ko-KR')+'원',SOURCE='restaurant-menu-prices';
const listPage=location.pathname.endsWith('/restaurant-menus.html');
let db,menus=[],purchases=[],editing=null,busy=false,manualPrice=false,last=null,linked=null;
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e};
function per100g(price,grams){const p=Number(price),g=Number(grams);return Number.isFinite(p)&&p>0&&Number.isFinite(g)&&g>0?money(p*100/g):'—'}
function input(){return {costPerKg:Number($('cost').value),grams:Number($('grams').value),margin:Number($('margin').value)}}
function actual(){if(!last)return;const a=actualMargin(Number($('applied').value),last.cost);$('applied-per100g').textContent=per100g($('applied').value,$('grams').value);for(const key of ['supply','vat','profit'])$(key).textContent=money(a[key]);$('actual-margin').textContent=a.actualMargin.toFixed(2)+'%';$('actual-margin').classList.toggle('negative',a.actualMargin+1e-8<last.margin);return a}
function clearActual(){for(const k of ['supply','vat','profit','actual-margin','applied-per100g'])$(k).textContent='—'}
function calculate(){
 try{last=menuPrice(input());$('result-cost').textContent=money(last.cost);$('without-vat').textContent=money(last.withoutVat);$('price').textContent=money(last.price);$('price-per100g').textContent=per100g(last.price,$('grams').value);if(!manualPrice)$('applied').value=last.price;actual();$('error').textContent=''}
 catch(e){last=null;for(const k of ['result-cost','without-vat','price','price-per100g'])$(k).textContent='—';clearActual();$('error').textContent=$('cost').value?e.message:''}
}
function reset(){if(busy)return;editing=null;linked=null;manualPrice=false;$('calculator').reset();$('form-title').textContent='판매가 계산';$('source-note').textContent='';calculate()}
function open(r){if(busy)return;editing=r;linked=r.linkedPurchase||null;$('purchase').value='';$('item-name').value=r.ingredientName||'';$('menu-name').value=r.name||'';for(const [id,key] of [['cost','costPerKg'],['grams','grams'],['margin','margin']])$(id).value=r[key]??3;$('applied').value=r.sellingPrice;manualPrice=true;$('form-title').textContent='메뉴 수정';$('source-note').textContent=linked?'저장 당시 매입단가입니다. 최신 단가는 매입품목에서 다시 선택해 주세요.':'';calculate();$('calculator').scrollIntoView({behavior:'smooth'})}
async function reload(){menus=(await db.getItems()).filter(r=>r.source===SOURCE);draw()}
function draw(){
 if(!listPage)return;
 $('menus').replaceChildren();
 if(!menus.length){$('menus').append(el('p','저장한 메뉴가 없습니다. 계산 후 메뉴 저장을 눌러 주세요.','note'));return}
 for(const r of menus){
  const row=el('details','','menu-row'),top=el('summary','','menu-top');top.append(el('strong',r.name),el('strong',money(r.sellingPrice)));
  row.append(top,el('p','100g당 판매가 '+per100g(r.sellingPrice,r.grams),'note'),el('p',(r.ingredientName||'')+' · '+r.grams+'g · 매입단가 '+money(r.costPerKg)+'/kg','note'));
  try{const c=menuPrice({costPerKg:r.costPerKg,grams:r.grams,margin:r.margin});const a=actualMargin(r.sellingPrice,c.cost);row.append(el('p','원가 = '+money(r.costPerKg)+' × '+r.grams+'g ÷ 1,000 = '+money(c.cost),'note'),el('p','기준 판매가 = '+money(c.cost)+' ÷ (1 − '+r.margin+'%) = '+money(c.withoutVat),'note'),el('p','부가세 포함 권장가 = '+money(c.withoutVat)+' × 1.1 = '+money(c.price),'note'),el('p','적용 판매가 '+money(r.sellingPrice)+' ÷ 1.1 = 부가세 제외 '+money(a.supply)+' · 부가세 '+money(a.vat),'note'),el('p','남는 금액 = '+money(a.supply)+' − '+money(c.cost)+' = '+money(a.profit),'note'),el('p','실제 마진율 = 남는 금액 ÷ 부가세 제외 매출 × 100','note'),el('p','목표 '+r.margin+'% · 실제 '+a.actualMargin.toFixed(2)+'% · 남는 금액 '+money(a.profit),'note'))}catch{row.append(el('p','계산값을 확인해 주세요.','note'))}
  const actions=el('div','','actions'),edit=el('button','수정'),remove=el('button','삭제','secondary');edit.type=remove.type='button';edit.disabled=remove.disabled=busy;edit.onclick=()=>location.href='restaurant-menu-prices.html?business=restaurant&edit='+encodeURIComponent(r.id);remove.onclick=()=>{if(!busy&&confirm('저장한 메뉴를 삭제할까요?'))mutate(()=>db.deleteItem(r.id),r.id)};actions.append(edit,remove);row.append(actions);$('menus').append(row);
 }
}
async function mutate(fn,removeId=null){
 if(busy)return;busy=true;for(const c of $('calculator').querySelectorAll('input,select,button'))c.disabled=true;draw();let saved=false;
 try{await fn();saved=true;if(!removeId){location.assign('restaurant-menus.html?business=restaurant&saved=1');return}if(!removeId||editing?.id===removeId){editing=null;linked=null;manualPrice=false;$('calculator').reset();$('form-title').textContent='판매가 계산';$('source-note').textContent=''}await reload();$('status').textContent=removeId?'메뉴를 삭제했습니다.':'메뉴를 저장했습니다. 아래 저장한 메뉴에서 확인할 수 있습니다.'}
 catch(e){$('status').textContent=saved?'저장은 완료되었으나 목록을 불러오지 못했습니다. 새로고침해 주세요.':e.message}
 finally{busy=false;for(const c of $('calculator').querySelectorAll('input,select,button'))c.disabled=false;calculate();draw()}
}
$('purchase').onchange=()=>{const r=purchases[Number($('purchase').value)];if($('purchase').value===''||!r){linked=null;$('source-note').textContent='';return}linked={id:r.id,date:r.date,itemId:r.itemId||null};$('item-name').value=r.itemName||'';if(!$('menu-name').value)$('menu-name').value=r.itemName||'';$('cost').value=Number(r.unitPrice);$('source-note').textContent=r.date+' 매입 · '+(r.supplierName||'')+' · 1kg '+money(Number(r.unitPrice));calculate()};
for(const id of ['cost','grams','margin'])$(id).addEventListener('input',calculate);
$('applied').oninput=()=>{manualPrice=true;calculate()};
$('use-price').onclick=()=>{manualPrice=false;calculate()};$('reset').onclick=reset;
$('calculator').onsubmit=e=>{
 e.preventDefault();if(busy||!db||!$('calculator').reportValidity())return;
 try{
 const c=menuPrice(input()),sellingPrice=Number($('applied').value);if(!Number.isSafeInteger(sellingPrice))throw Error('판매가는 원 단위로 입력해 주세요.');
 actualMargin(sellingPrice,c.cost);const name=$('menu-name').value.trim(),ingredientName=$('item-name').value.trim();if(!name||!ingredientName)throw Error('품명과 메뉴명을 입력해 주세요.');
 const row={...editing,id:editing?.id||'restaurant-menu-'+crypto.randomUUID(),source:SOURCE,group:'식당 메뉴',name,ingredientName,...input(),sellingPrice,linkedPurchase:linked,updatedAt:new Date().toISOString()};
 delete row.configuredCardRate;delete row.useCard;delete row.cardRate;
 mutate(()=>editing?db.updateItem(row):db.addItemMaster(row));
 }catch(e){$('error').textContent=e.message}
};
try{
 if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');
 db=await import('./db.js?v=app-20261018-working-mobile-02');
 const [items,transactions]=await Promise.all([db.getItems(),db.getTransactions()]);
 menus=items.filter(r=>r.source===SOURCE);purchases=latestKgPurchases(transactions);
 for(const [i,r] of purchases.entries())$('purchase').add(new Option((r.itemGroup?r.itemGroup+' · ':'')+r.itemName+' · '+money(Number(r.unitPrice))+'/kg',String(i)));
 draw();const editId=new URL(location.href).searchParams.get('edit');if(!listPage&&editId){const row=menus.find(r=>String(r.id)===editId);if(row)open(row)}$('save').disabled=false;$('status').textContent='저장한 메뉴 페이지에서 메뉴를 누르면 계산 상세가 펼쳐집니다.';
}catch(e){$('status').textContent='메뉴를 불러오지 못했습니다. '+e.message}
calculate();
