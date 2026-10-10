const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('menu URLs have the current deployment version and retain the active menu indicator',async()=>{
 const {updateAssetVersions}=await import('../tools/update-asset-version.mjs');
 assert.equal(updateAssetVersions(process.cwd(),true).changed.length,0);
 const version=JSON.parse(fs.readFileSync('asset-version.json','utf8')).version;
 const nav=fs.readFileSync('common/nav.html','utf8');
 const links=[...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(links.length,9);assert(links.every(href=>href.endsWith('?v='+version)));
 const anchors=links.map(href=>({attrs:{href},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}}));
 const context=vm.createContext({URL,location:{pathname:'/halla-reservation-manager/sales-manage.html',href:'https://example.test/halla-reservation-manager/sales-manage.html?v='+version}});
 const source=fs.readFileSync('js/common/nav-include.js','utf8');
 const start=source.indexOf('function applyCurrentNavLink('),end=source.indexOf('async function initGlobalSearch',start);
 vm.runInContext(source.slice(start,end),context);
 context.applyCurrentNavLink({querySelector:()=>({querySelectorAll:()=>anchors})});
 assert.equal(anchors.filter(a=>a.attrs['aria-current']==='page').length,1);
 assert.equal(anchors[3].attrs['aria-current'],'page');
 assert.match(source,/fetch\(url, \{ cache: "no-store" \}\)/);
});

test('every ledger screen includes its menu before scripts or database requests finish',()=>{
 const nav=fs.readFileSync('common/nav.html','utf8');
 for(const match of nav.matchAll(/href="([^"?]+)\?v=/g)){
  const html=fs.readFileSync(match[1],'utf8');
  const menu=html.match(/<!-- navigation:start -->([\s\S]*?)<!-- navigation:end -->/);
  assert(menu,match[1]);
  assert.equal([...menu[1].matchAll(/<a href=/g)].length,9,match[1]);
  assert(html.indexOf('navigation:start')<html.indexOf('<main'),match[1]);
 }
});
