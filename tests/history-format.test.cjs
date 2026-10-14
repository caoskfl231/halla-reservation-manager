const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
async function formatter(){const m=new vm.SourceTextModule(fs.readFileSync('js/history-format.js','utf8'));await m.link(()=>{});await m.evaluate();return m.namespace;}
test('history uses Korean labels, currency and percentages while preserving codes and zeros',async()=>{
 const f=await formatter();assert.equal(f.formatHistoryValue('price',21000),'21,000원');assert.equal(f.formatHistoryValue('saleMargin',50.7),'50.7%');
 assert.equal(f.formatHistoryValue('id',250022),'250022');assert.equal(f.formatHistoryValue('amount',0),'0원');
 assert.equal(f.formatHistoryValue('status','active'),'사용 중');assert.equal(f.fieldLabel('name','items'),'품목명');
});
test('comparison highlights only actual edits including added/removed fields and nested structures',async()=>{
 const f=await formatter();const c=f.historyComparison({store:'items',data:{name:'삼겹',price:21000,avgPrice:19452,memo:'old',nested:{a:1,b:2}},after_data:{name:'삼겹',price:22000,avgPrice:19452,saleMargin:50,nested:{b:2,a:1}}});
 assert.deepEqual(Array.from(c.rows.filter(r=>r.changed),r=>r.key),['price','memo','saleMargin']);assert.equal(c.rows.find(r=>r.key==='price').after,'22,000원');
 assert.equal(c.rows.find(r=>r.key==='memo').after,'—');assert.equal(c.deleted,false);
});
test('deletion and unavailable historical comparison are explicit rather than invented values',async()=>{
 const f=await formatter();const deleted=f.historyComparison({store:'items',data:{id:'1',price:0},after_data:null,action:'delete'});
 assert.equal(deleted.deleted,true);assert(deleted.rows.every(r=>r.changed&&r.after==='삭제됨'));
 const legacy=f.historyComparison({store:'items',data:{price:21}});assert.equal(legacy.available,false);assert.equal(legacy.rows[0].after,'확인 불가');assert.equal(legacy.rows[0].changed,false);
 assert.equal(f.formatHistoryValue('unknown',{amount:100}),'금액: 100원');
});
