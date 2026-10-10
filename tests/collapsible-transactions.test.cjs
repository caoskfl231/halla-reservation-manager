const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
test('transaction panels start hidden and open only after user actions',async()=>{
 const context=vm.createContext({});
 const module=new vm.SourceTextModule(fs.readFileSync('js/common/collapsible-transactions.js','utf8'),{context});
 await module.link(()=>{});await module.evaluate();
 const buttons=[];
 function panel(label,id){return {id,dataset:{collapsibleTransactions:label},hidden:false,before(button){buttons.push(button)},listeners:{},addEventListener(name,cb){this.listeners[name]=cb},contains(row){return row.source===this}}}
 const summary=panel('거래내역','summary'),detail=panel('상세내역','detail');summary.dataset.opensTransactionDetail='detail';
 const root={querySelectorAll(selector){return selector==='[data-collapsible-transactions]'?[summary,detail]:[summary]},getElementById(id){return id==='detail'?detail:summary},createElement(){return {attributes:{},listeners:{},setAttribute(name,value){this.attributes[name]=value},addEventListener(name,cb){this.listeners[name]=cb}}}};
 module.namespace.initCollapsibleTransactions(root);
 assert.ok(summary.hidden&&detail.hidden);assert.equal(buttons[0].attributes['aria-expanded'],'false');
 buttons[0].listeners.click();assert.equal(summary.hidden,false);assert.equal(detail.hidden,true);
 const carry={source:summary,dataset:{isCarryOver:'1'}};summary.listeners.click({target:{closest:()=>carry}});assert.equal(detail.hidden,true);
 const row={source:summary,dataset:{isCarryOver:'0'}};summary.listeners.click({target:{closest:()=>row}});assert.equal(detail.hidden,false);assert.equal(buttons[1].attributes['aria-expanded'],'true');
 buttons[1].listeners.click();assert.equal(detail.hidden,true);
 module.namespace.initCollapsibleTransactions(root);assert.equal(buttons.length,2,'no duplicate controls or reset on repeated bootstrap');
 for(const path of ['index.html','sales-manage.html','purchase-manage.html','expense-manage.html','payment-manage.html','transaction-report.html'])assert.match(fs.readFileSync(path,'utf8'),/data-collapsible-transactions="[^"]+"[^>]*hidden/);
 const sales=fs.readFileSync('js/sales-manage.js','utf8');
 assert.ok(!sales.includes('let picked = selectable.find'),'first sales voucher no longer auto-selects');
});
