import {rpc} from './cloud-session.js?v=app-20261018-working-mobile-02';
const box=document.getElementById('order-price-sync-status');
if(box){
 const status=box.querySelector('[data-status]');let busy=false;
 box.addEventListener('toggle',async()=>{
  if(!box.open||busy)return;busy=true;status.textContent='연결 상태 확인 중…';
  try{
   const data=await rpc('halla_price_sync_summary',{});
   status.textContent='연결 '+Number(data.connected)+'개 · 자동 반영 '+Number(data.enabled)+'개'+(data.attention?' · 주문서에서 확인 필요 '+Number(data.attention)+'개':'');
  }catch(e){status.textContent='주문서 관리자와 장부 소유자 권한이 함께 있는 계정에서 연결 상태를 확인할 수 있습니다.';}
  finally{busy=false;}
 });
}
