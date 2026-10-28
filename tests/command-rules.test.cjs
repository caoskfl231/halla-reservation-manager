const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const rules = import('data:text/javascript;base64,' + fs.readFileSync('js/common/command-rules.js').toString('base64'));
test('Korean money, dates and KST boundary', async () => {
 const r = await rules;
 assert.equal(r.parseCommand('오늘 연경 30만원 이체 수금','2026-10-28').amount,300000);
 assert.equal(r.parseCommand('어제 연경 300,000원 현금 수금','2026-01-01').date,'2025-12-31');
 assert.equal(r.parseCommand('연경 1.5만원 수금','2026-10-28').amount,15000);
 assert.equal(r.seoulToday(new Date('2026-10-27T15:01:00Z')),'2026-10-28');
});
test('reject unsafe or ambiguous amounts, dates and compound commands', async () => {
 const r = await rules;
 for (const text of ['연경 0원 수금','연경 -10원 수금','연경 0.5원 수금','연경 30,00원 수금','연경 9007199254740992원 수금','2026-02-30 연경 10원 수금','연경 10원 수금 취소','연경 10원 수금 말고 20원 수금','연경 10원 수금; 연경 20원 수금']) assert.equal(r.parseCommand(text).ok,false,text);
});
test('customer duplicates retained, no empty lookup, safe preview without mutation', async () => {
 const r=await rules;
 const customers=[{id:'001',name:'연경',status:'active'},{id:'002',name:'연경',status:'active'},{id:'003',name:'연경 신점',status:'inactive'}];
 const before=JSON.stringify(customers);
 assert.equal(r.findCustomers(customers,'연경').length,2);
 assert.equal(r.findCustomers(customers,'001')[0].id,'001');
 assert.equal(r.findCustomers(customers,'').length,0);
 const command=r.parseCommand('연경 30만원 수금');
 assert.equal(r.buildPreview(command,customers[0]).saved,false);
 assert.throws(()=>r.buildPreview(command,customers[2]));
 assert.equal(JSON.stringify(customers),before);
 assert.equal(r.parseCommand('거래처 연경 조회').intent,'customer_lookup');
});
test('command page has no write/model dependency', () => {
 const source=fs.readFileSync('js/work-command.js','utf8');
 assert.doesNotMatch(source,/saveTransaction|saveCashflow|fetch\(|\.rpc\(|openai|anthropic|localStorage\.setItem/);
 assert.match(source,/getCustomers/);
 assert.match(source,/request !== generation/);
});
