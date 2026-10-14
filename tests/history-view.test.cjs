const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.textContent='';}
 setAttribute(k,v){this[k]=v;}
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
 assert.equal(walk(container).find(n=>n.className==='history-filter').hidden,false);
 v.renderHistoryComparison(container,{store:'items',action:'update',data:{price:100}});assert(walk(container).some(n=>n.textContent==='확인 불가'));
});
test('deleted transaction shows a compact summary and one deletion badge while retaining full details',async()=>{
 const v=await view(),container=new Node('div');
 const data={id:1000000000751,date:'2026-10-14',supplierName:'남원 추어탕',itemName:'상품',quantity:1,amount:3000,unit:'팩',memo:'',type:'입금',itemCode:'250133',source:'sales',taxType:'없음',batchKey:1791931237703};
 v.renderHistoryComparison(container,{store:'transactions',action:'delete',data,after_data:null});
 const nodes=walk(container),body=nodes.find(n=>n.tagName==='tbody');
 assert(body.children.length<=6,'main comparison remains compact');
 assert.equal(nodes.filter(n=>n.textContent==='삭제됨').length,1,'do not repeat deletion state in every row');
 assert(nodes.some(n=>n.tagName==='dd' && n.textContent==='1000000000751'),'full code remains available in additional information');
 assert(nodes.some(n=>n.tagName==='dd' && n.textContent==='매출'),'source is translated');
});

test('change summary is clickable and top filter exposes a group synchronization callback',async()=>{
 const v=await view(),container=new Node('div');let clicked=0,lastFilter;
 const api=v.renderHistoryComparison(container,{store:'items',action:'update',data:{price:21000,unit:'kg'},after_data:{price:22000,unit:'kg'}},{onSummaryClick:()=>clicked++,onFilterChange:checked=>lastFilter=checked});
 const nodes=walk(container),summary=nodes.find(n=>n.className==='history-change-summary');assert.equal(summary.tagName,'button');summary.onclick();assert.equal(clicked,1);
 const toggle=nodes.find(n=>n.tagName==='input');toggle.checked=false;toggle.onchange();assert.equal(lastFilter,false);
 api.setChangedOnly(true);assert.equal(api.isChangedOnly(),true);
 const headings=nodes.find(n=>n.tagName==='thead').children[0].children.map(n=>n.textContent);assert.deepEqual(headings,['항목','수정 전','수정 후']);
});
