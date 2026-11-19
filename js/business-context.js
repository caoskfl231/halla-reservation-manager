const KEY='halla_business_v1';
const url=new URL(location.href);
let saved;try{saved=localStorage.getItem(KEY)}catch{}
if(location.pathname.endsWith('/restaurant-margin.html'))url.searchParams.set('business','restaurant');
export const business=url.searchParams.get('business')==='restaurant'?'restaurant':url.searchParams.get('business')==='butcher'?'butcher':saved==='restaurant'?'restaurant':'butcher';
export const businessName=business==='restaurant'?'할라정육식당관리':'할라정육점관리';
try{localStorage.setItem(KEY,business)}catch{}
url.searchParams.set('business',business);history.replaceState(null,'',url);
export function installBusinessSwitch(){
 if(document.getElementById('business-switch'))return;
 const bar=document.createElement('nav');bar.id='business-switch';bar.setAttribute('aria-label','사업장 선택');bar.style.cssText='display:flex;gap:8px;padding:12px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:100001';
 for(const [id,title] of [['butcher','할라정육점관리'],['restaurant','할라정육식당관리']]){
 const a=document.createElement('a');a.textContent=title;a.href='index.html?business='+id;a.style.cssText='flex:1;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font:bold 16px system-ui;background:'+(business===id?'#08764e;color:white':'#edf2ef;color:#234');
 if(business===id)a.setAttribute('aria-current','page');
 a.onclick=e=>{if(business!==id&&!confirm('입력 중인 내용은 저장되지 않습니다. 사업장을 전환할까요?'))e.preventDefault()};
 bar.append(a)}
 for(const a of document.querySelectorAll('a[href*="restaurant-margin.html"]')){if(business!=='restaurant')a.remove();else a.href='restaurant-margin.html?business=restaurant';}
 document.body.prepend(bar);document.title=businessName+' · '+document.title;
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin===location.origin&&/\.html$/.test(u.pathname)&&!u.searchParams.has('business')){u.searchParams.set('business',business);a.href=u.href}},true);
}
