import {initMenuStore} from './restaurant-menu-store.js';
import {calculate} from './restaurant-margin-math.mjs';
import {forecast} from './restaurant-forecast-math.mjs';
const $=id=>document.getElementById(id),money=n=>Math.round(n).toLocaleString('ko-KR')+'원';
const fixedIds=['rent','wages','utilities','misc'];let key=null,menus=[];
function input(value,type,min,step){const el=document.createElement('input');el.type=type;el.value=value;el.required=true;if(min!==undefined)el.min=min;if(step)el.step=step;return el;}
function addRow(r){
 const tr=document.createElement('tr');
 for(const [field,type,min,step] of [['name','text'],['price','number',0.01,'any'],['cost','number',0,'any'],['fee','number',0,'any'],['qty','number',0,'1']]){
 const td=document.createElement('td'),el=input(r[field],type,min,step);el.dataset.field=field;el.setAttribute('aria-label',({name:'메뉴명',price:'판매가',cost:'재료원가',fee:'수수료율',qty:'하루 판매수량'})[field]);if(field==='fee')el.max=99.99;td.append(el);tr.append(td);
 }
 const total=document.createElement('td');total.className='row-total';tr.append(total);
 const td=document.createElement('td'),del=document.createElement('button');del.type='button';del.className='remove';del.textContent='제거';del.onclick=()=>{tr.remove();render();dirty()};td.append(del);tr.append(td);$('rows').append(tr);render();
}
function data(){return [...$('rows').children].map(tr=>Object.fromEntries([...tr.querySelectorAll('input')].map(el=>[el.dataset.field,el.dataset.field==='name'?el.value.trim():el.value===''?NaN:Number(el.value)])))}
function costs(){const values=fixedIds.map(id=>$(id).value===''?NaN:Number($(id).value));if(values.some(n=>!Number.isFinite(n)||n<0))throw Error('月 고정비는 0 이상으로 입력해 주세요.'.replace('月','월'));return values.reduce((a,b)=>a+b,0);}
function result(id,entries){$(id).replaceChildren();for(const [label,value] of entries){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$(id).append(dt,dd)}}
function render(){
 $('empty').hidden=$('rows').children.length>0;
 try{
 const rows=data(),fixed=costs(),r=forecast(rows,Number($('days').value),fixed);
 [...$('rows').children].forEach((tr,i)=>tr.querySelector('.row-total').textContent=money(rows[i].price*rows[i].qty));
 result('daily',[['예상매출',money(r.revenue)],['재료비',money(r.materials)],['카드수수료',money(r.fees)],['고정비 차감 전 이익',money(r.contribution)]]);
 result('monthly',[['예상매출',money(r.monthlyRevenue)],['재료비',money(r.monthlyMaterials)],['카드수수료',money(r.monthlyFees)],['고정비',money(fixed)],['예상 이익',money(r.profit)],['이익률',r.margin===null?'—':r.margin.toFixed(2)+'%'],['손익분기 월매출',r.breakEven===null?'계산 불가':money(r.breakEven)]]);
 $('monthly').classList.toggle('negative',r.profit<0);$('error').textContent='';return true;
 }catch(e){$('daily').replaceChildren();$('monthly').replaceChildren();for(const cell of document.querySelectorAll('.row-total'))cell.textContent='—';$('error').textContent=e.message;return false}
}
function dirty(){$('save-status').textContent='변경한 내용은 아직 저장되지 않았습니다.'}
$('forecast').addEventListener('input',()=>{render();dirty()});
$('add-manual').onclick=()=>{addRow({name:'',price:0,cost:0,fee:0,qty:0});dirty()};
$('add-menu').onclick=()=>{const menu=menus.find(m=>m.id===$('menu-picker').value);if(!menu)return;try{const r=calculate(menu.v,menu.mode);addRow({name:menu.v.menu,price:r.price,cost:r.total,fee:menu.v.fee,qty:0});dirty()}catch{$('menu-status').textContent='이 메뉴의 원가·판매가를 먼저 수정해 주세요.'}};
$('forecast').onsubmit=e=>{e.preventDefault();if(!render()||!$('forecast').reportValidity()||!key)return;try{localStorage.setItem(key,JSON.stringify({rows:data(),days:Number($('days').value),fixed:Object.fromEntries(fixedIds.map(id=>[id,Number($(id).value)]))}));$('save-status').textContent='이 기기에 예상매출표를 저장했습니다.'}catch{$('save-status').textContent='저장하지 못했습니다. 기기 저장공간을 확인해 주세요.'}};
render();
try{
 menus=await initMenuStore();
 const {sessionIdentity}=await import('./cloud-session.js?v=app-20261018-working-mobile-02');
 key='halla.restaurant.forecast.v1:'+JSON.stringify(sessionIdentity());
 $('menu-picker').replaceChildren(new Option('메뉴를 선택하세요',''));for(const m of menus)$('menu-picker').add(new Option(m.v.menu,m.id));
 $('add-menu').disabled=false;$('menu-status').textContent=menus.length?'저장한 메뉴 '+menus.length+'개':'저장된 메뉴가 없습니다. 직접 입력하거나 마진 계산에서 메뉴를 저장하세요.';
 const raw=localStorage.getItem(key);
 if(raw){const saved=JSON.parse(raw);if(!Array.isArray(saved.rows)||!saved.fixed)throw Error('invalid saved forecast');$('days').value=saved.days;fixedIds.forEach(id=>$(id).value=saved.fixed[id]??0);saved.rows.forEach(addRow);$('save-status').textContent='저장한 예상매출표를 불러왔습니다.'}
 $('save').disabled=false;render();
}catch{$('save-status').textContent='저장내역을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.'}
