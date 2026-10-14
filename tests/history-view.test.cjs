const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.textContent='';}
 prepend(...nodes){this.children.unshift(...nodes);}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
}
async function view(){
 const context=vm.createContext({console,Intl,document:{createElement:tag=>new Node(tag)}});
 const source=new vm.SourceTextModule(fs.readFileSync('js/ledger-history.js','utf8'),{context});
 const formatting=new vm.SourceTextModule(fs.readFileSync('js/history-format.js','utf8'),{context});
 const session=new vm.SyntheticModule(['rpc','friendlyError'],function(){this.setExport('rpc',async()=>{});this.setExport('friendlyError',e=>e.message);},{context});
 await source.link(path=>path.includes('history-format')?formatting:session);await source.evaluate();return source.namespace;
}
const walk=node=>[node,...node.children.flatMap(walk)];
test('actual history renderer filters changes, expands all fields and safely displays user text',async()=>{
 const v=await view(),container=new Node('div');
 v.renderHistoryComparison(container,{store:'items',action:'update',data:{name:'<img onerror=alert(1)>',price:21000,salePrice:35163,unit:'kg'},after_data:{name:'<img onerror=alert(1)>',price:22000,salePrice:36000,unit:'kg'}});
 const find=tag=>walk(container).filter(n=>n.tagName===tag);
 assert.equal(find('tbody')[0].children.filter(n=>n.className==='history-field-changed').length,2);
 assert.equal(walk(container).find(n=>n.className==='history-change-summary').textContent,'단가 등 2개 항목 변경');
 const checkbox=find('input')[0];checkbox.checked=false;checkbox.onchange();assert.equal(find('tbody')[0].children.filter(n=>n.className!=='history-basic-divider').length,4);
 assert.equal(find('img').length,0);assert(find('td').some(n=>n.textContent==='<img onerror=alert(1)>'));
 checkbox.checked=true;checkbox.onchange();assert.equal(find('tbody')[0].children.filter(n=>n.className==='history-field-changed').length,2);
});
test('deleted rows show deletion state and legacy responses never pretend to have an after value',async()=>{
 const v=await view(),container=new Node('div');v.renderHistoryComparison(container,{store:'items',action:'delete',data:{price:0},after_data:null});
 assert(walk(container).some(n=>n.textContent==='삭제됨'));
 assert(walk(container).find(n=>n.className==='history-filter').hidden);
 v.renderHistoryComparison(container,{store:'items',action:'update',data:{price:100}});assert(walk(container).some(n=>n.textContent==='확인 불가'));
});
