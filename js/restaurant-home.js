import {summarizeRestaurant,salesRatio} from './restaurant-statistics-calc.js?v=statistics-01';
const $=id=>document.getElementById(id);
const month=$('home-month');
month.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,7);
let rows=null;
function render(){
 if(!rows||!month.value||!month.validity.valid)return;
 const s=summarizeRestaurant(rows,[],[],month.value+'-01',month.value+'-31');
 const money=n=>n.toLocaleString('ko-KR')+'원';
 for(const k of ['gross','purchase','expense'])$('home-'+k).textContent=money(s[k]);
 const ratio=salesRatio(s.remaining,s.gross);
 $('home-remaining').textContent=money(s.remaining)+' · '+(ratio===null?'—':ratio.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%');
 $('home-remaining').classList.toggle('negative',s.remaining<0);
 $('home-status').textContent=month.value.replace('-','년 ')+'월 · 매출 '+s.salesCount+'건 · 매입 '+s.purchaseCount+'건 · 지출 '+s.expenseCount+'건';
}
month.addEventListener('change',render);
try{const db=await import('./db.js?v=app-20261018-working-mobile-02');rows=await db.getTransactions();render();}
catch(error){$('home-status').textContent='자료를 불러오지 못했습니다. 전체메뉴에서 최신 자료를 불러와 주세요.';}
