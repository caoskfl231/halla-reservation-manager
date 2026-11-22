const page=location.pathname.split('/').pop();
const paths={home:'m3 10 9-7 9 7v11h-6v-7H9v7H3z',sales:'M4 20V12m5 8V8m5 12V4m5 16V2',purchase:'M2 3h3l3 12h11l3-9H6M9 21h.01M19 21h.01',expense:'M3 5h17v15H3zM3 8h17m-6 5h6',funds:'M4 6c0-5 16-5 16 0s-16 5-16 0m0 0v12c0 5 16 5 16 0V6M4 12c0 5 16 5 16 0',prices:'M5 2h14v20H5zM8 6h8M8 11h1m6 0h1m-8 5h1m6 0h1',menus:'M5 3h14v19l-7-4-7 4z',all:'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z',statistics:'m3 18 5-7 5 3 8-10M16 4h5v5'};
const icon=key=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+('<path d="'+paths[key]+'"/>')+'</svg>';
const links=[['sales','매출내역','restaurant-sales.html'],['purchase','매입내역','restaurant-purchases.html'],['expense','지출내역','restaurant-expenses.html'],['funds','자금관리','restaurant-funds.html'],['statistics','매출통계','restaurant-statistics.html'],['prices','메뉴 판매단가','restaurant-menu-prices.html'],['menus','저장한 메뉴','restaurant-menus.html']];
const link=(key,label,file)=>'<a href="'+file+'?business=restaurant">'+icon(key)+'<span>'+label+'</span></a>';
document.body.classList.add('restaurant-app');
const header=document.createElement('header');header.className='app-header';
header.innerHTML=(page==='restaurant-home.html'?'<strong>할라 식당장부</strong>':'<a class="home-back" href="restaurant-home.html?business=restaurant" aria-label="홈으로">〈</a><strong>'+ (links.find(x=>x[2]===page)?.[1]||'할라 식당장부')+'</strong>')+'<button type="button" class="all-menu-button" aria-label="전체메뉴" aria-haspopup="dialog">☰</button>';
document.body.prepend(header);
const dialog=document.createElement('dialog');dialog.className='app-menu';dialog.setAttribute('aria-labelledby','app-menu-title');
dialog.innerHTML='<div class="app-menu-header"><h2 id="app-menu-title" tabindex="-1">전체메뉴</h2><button type="button" class="app-menu-close">닫기</button></div><div class="app-menu-body"><h3>장부 관리</h3><div class="app-menu-group">'+links.slice(0,5).map(x=>link(...x)).join('')+'</div><h3>메뉴 관리</h3><div class="app-menu-group">'+links.slice(5).map(x=>link(...x)).join('')+link('all','메뉴 분류관리','restaurant-menu-prices.html').replace('?business=restaurant','?business=restaurant&categories=1')+'</div><h3>설정</h3><div id="app-settings" class="app-menu-group"><p class="settings-wait">연결 확인 중입니다.</p></div></div>';
document.body.append(dialog);
let opener;
function openMenu(e){opener=e.currentTarget;dialog.showModal();dialog.querySelector('h2').focus();}
header.querySelector('button').onclick=openMenu;
dialog.querySelector('.app-menu-close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>opener?.focus());
const nav=document.createElement('nav');nav.className='app-bottom-nav';nav.setAttribute('aria-label','주요 메뉴');
nav.innerHTML=[['home','홈','restaurant-home.html'],...links.slice(0,3).map(x=>[x[0],x[1].replace('내역',''),x[2]])].map(x=>link(...x)).join('')+'<button type="button" aria-haspopup="dialog">'+icon('all')+'<span>전체</span></button>';
nav.querySelector('button').onclick=openMenu;
for(const a of nav.querySelectorAll('a'))if(new URL(a.href).pathname.split('/').pop()===page)a.setAttribute('aria-current','page');
document.body.append(nav);
const shortcuts=document.getElementById('home-shortcuts');if(shortcuts)shortcuts.innerHTML=links.filter(x=>x[0]!=='statistics').map(x=>link(...x)).join('');
function integrate(){
 const business=document.getElementById('business-switch');
 if(business&&!business.classList.contains('app-switch')){business.classList.add('app-switch');header.after(business);for(const a of business.querySelectorAll('a'))a.textContent=a.href.includes('business=restaurant')?'식당':'정육점';}
 const bar=document.getElementById('ledger-cloud-bar');
 if(bar&&!bar.dataset.shell){bar.dataset.shell='1';const status=bar.querySelector('#ledger-cloud-status');if(status)header.append(status);const settings=dialog.querySelector('#app-settings');settings.replaceChildren();for(const button of bar.querySelectorAll('button'))settings.append(button);bar.hidden=true;}
 if(new URLSearchParams(location.search).get('categories')==='1'){const trigger=document.getElementById('menu-category-trigger');if(trigger&&!trigger.disabled){const url=new URL(location.href);url.searchParams.delete('categories');history.replaceState(null,'',url);trigger.click();}}
}
new MutationObserver(integrate).observe(document.body,{childList:true,subtree:true});integrate();
