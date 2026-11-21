import {business} from './business-context.js';
import {summarizeRestaurant,salesRatio} from './restaurant-statistics-calc.js?v=statistics-01';
const $=id=>document.getElementById(id),money=n=>n.toLocaleString('ko-KR')+'원';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
$('from').value=today.slice(0,7)+'-01';$('to').value=today;
let transactions=[],items=[],groups=[],ready=false;
const element=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e};
function percent(n,gross){const p=salesRatio(n,gross);return p===null?'—':p.toLocaleString('ko-KR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%'}
function breakdown(target,rows,gross,bars=false){
 const root=$(target);root.replaceChildren();
 if(!rows.length){root.append(element('p','조회 기간에 등록된 내역이 없습니다.','empty'));return}
 for(const [label,value] of rows){
  const block=element('div'),row=element('div','','detail-row');
  row.append(element('span',label,'label'),element('strong',money(value)),element('small',percent(value,gross)));block.append(row);
  if(bars){const track=element('div','','track'),fill=element('div','','fill');fill.style.width=Math.min(100,Math.max(0,salesRatio(value,gross)||0))+'%';track.append(fill);track.setAttribute('aria-hidden','true');block.append(track)}
  root.append(block);
 }
}
function render(){
 if(!ready)return;
 if(!$('filters').reportValidity()||$('from').value>$('to').value){$('status').textContent='시작일과 종료일을 확인해 주세요.';return}
 const s=summarizeRestaurant(transactions,items,groups,$('from').value,$('to').value);
 for(const k of ['gross','purchase','expense','remaining','adjusted']){$(k).textContent=money(s[k]);$(k+'-ratio').textContent='매출 대비 '+percent(s[k],s.gross)}
 $('remaining-card').classList.toggle('loss',s.remaining<0);$('adjusted').classList.toggle('negative',s.adjusted<0);
 breakdown('purchase-groups',s.purchases,s.gross,true);breakdown('expense-groups',s.expenses,s.gross,true);
 breakdown('deductions',[['매입·지출 차감 후',s.remaining],['부가세',s.vat],['카드수수료',s.fee]],s.gross);
 $('status').textContent=$('from').value+' ~ '+$('to').value+' · 매출 '+s.salesCount+'건 · 매입 '+s.purchaseCount+'건 · 지출 '+s.expenseCount+'건'+(s.gross===0?' · 매출이 없어 비율을 계산하지 않습니다.':'');
}
$('filters').onsubmit=e=>{e.preventDefault();render()};$('refresh').onclick=()=>location.reload();
try{
 if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');
 const db=await import('./db.js?v=app-20261018-working-mobile-02');
 [transactions,items,groups]=await Promise.all([db.getTransactions(),db.getItems(),db.getCashflowGroups()]);
 ready=true;$('query').disabled=false;render();
}catch(e){$('status').textContent='통계를 불러오지 못했습니다. '+e.message}
