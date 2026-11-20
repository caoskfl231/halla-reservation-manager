import {business} from './business-context.js';
const $=id=>document.getElementById(id),money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
let db,records=[],editing=null,busy=false;
const defaults=[['인건비','직원급여'],['인건비','일당'],['임대료','월세'],['임대료','관리비'],['공과금','전기요금'],['공과금','수도요금'],['공과금','가스요금'],['소모품','세제'],['소모품','휴지'],['소모품','청소용품']].map(([group,name],i)=>({code:'restaurant-expense-default-'+i,group,name,source:'restaurant-expense-items'}));
let expenseItems=[],masterEditing=null,masterBusy=false,expenseGroups=[],groupBusy=false;
async function loadItems(){const saved=(await db.getCashflowItems()).filter(r=>r.source==='restaurant-expense-items');const map=new Map(defaults.map(r=>[r.code,r]));for(const r of saved)map.set(r.code,r);expenseItems=[...map.values()].filter(r=>!r.archived);fillItems();await loadGroups()}

function groupNames(){return [...new Set(['인건비','임대료','공과금','소모품','수수료','기타',...expenseGroups.map(r=>r.name),...expenseItems.map(r=>r.group),...records.map(r=>r.expenseGroup)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'))}
function fillGroups(selected=$('item-group').value){$('item-group').replaceChildren(new Option('분류 선택',''));for(const name of groupNames())$('item-group').add(new Option(name,name));$('item-group').value=selected}
async function loadGroups(){expenseGroups=(await db.getCashflowGroups()).filter(r=>r.source==='restaurant-expense-groups');fillGroups()}
$('group-add').onclick=()=>{$('group-form').reset();$('group-error').textContent='';$('group-dialog').showModal()};
$('group-cancel').onclick=()=>{if(!groupBusy)$('group-dialog').close()};
$('group-dialog').addEventListener('cancel',e=>{if(groupBusy)e.preventDefault()});
$('group-form').onsubmit=async e=>{e.preventDefault();if(groupBusy)return;const name=$('group-name').value.trim().normalize('NFC');if(!name){$('group-error').textContent='분류명을 입력해 주세요.';return}if(groupNames().some(n=>n.normalize('NFC').toLowerCase()===name.toLowerCase())){$('group-error').textContent='이미 등록된 분류입니다.';return}groupBusy=true;$('group-save').disabled=true;$('group-cancel').disabled=true;try{await db.addCashflowGroup({code:'restaurant-expense-group-'+encodeURIComponent(name.toLowerCase()),name,source:'restaurant-expense-groups'});await loadGroups();fillGroups(name);$('group-dialog').close();$('item-name').focus()}catch(error){$('group-error').textContent=error.message}finally{groupBusy=false;$('group-save').disabled=false;$('group-cancel').disabled=false}};

function fillItems(selected=''){const select=$('entry-item');select.replaceChildren(new Option('항목 선택',''));for(const r of expenseItems)select.add(new Option(r.group+' · '+r.name,r.code));if(selected&&!expenseItems.some(r=>r.code===selected)&&editing)select.add(new Option((editing.expenseGroup||'기타')+' · '+(editing.expenseItemName||editing.itemName)+' (기존 항목)',selected));select.value=selected}
function itemTotal(item){
 return records.reduce((sum,r)=>{
 if(r.date<$('from').value||r.date>$('to').value)return sum;
 const matches=r.expenseItemCode?r.expenseItemCode===item.code:
 (r.expenseGroup===item.group&&(r.expenseItemName||r.itemName)===item.name);
 return sum+(matches?(Number(r.amount)||0):0);
 },0);
}
function drawItems(){
 $('items-list').replaceChildren();
 $('items-period').textContent=$('from').value+' ~ '+$('to').value+' · 지출 합계';
 for(const r of expenseItems){
 const row=element('div','','item-swipe'),front=element('div','','item-front'),label=element('div','','item-label');
 label.append(element('small',r.group),element('strong',r.name));
 front.append(label,element('strong',money(itemTotal(r)),'item-amount'));
 front.tabIndex=0;front.setAttribute('role','button');front.setAttribute('aria-label',r.name+' 수정·삭제 버튼 보기');front.setAttribute('aria-expanded','false');
 const actions=element('div','','item-swipe-actions'),edit=element('button','수정'),remove=element('button','삭제');
 for(const b of [edit,remove]){b.type='button';b.disabled=masterBusy;b.tabIndex=-1}
 remove.className='item-delete';actions.setAttribute('aria-hidden','true');actions.append(edit,remove);
 function reveal(show){row.classList.toggle('revealed',show);front.setAttribute('aria-expanded',String(show));actions.setAttribute('aria-hidden',String(!show));for(const b of [edit,remove])b.tabIndex=show?0:-1}
 let origin=null,moved=false;
 front.style.touchAction='pan-y';
 front.onpointerdown=e=>{if(masterBusy||e.button!==0)return;origin={x:e.clientX,y:e.clientY};moved=false};
 front.onpointermove=e=>{if(!origin)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y;if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)*1.3){moved=true;reveal(dx<0)}};
 front.onpointerup=()=>{origin=null};
 front.onpointercancel=()=>{origin=null};
 front.onclick=()=>{if(!masterBusy&&!moved)reveal(!row.classList.contains('revealed'));moved=false};
 front.onkeydown=e=>{if(['Enter',' ','ArrowLeft','ArrowRight','Escape'].includes(e.key)){e.preventDefault();reveal(e.key==='ArrowRight'||e.key==='Escape'?false:e.key==='ArrowLeft'?true:!row.classList.contains('revealed'))}};
 edit.onclick=()=>{masterEditing=r;$('item-group').value=r.group;$('item-name').value=r.name;$('item-title').textContent='항목 수정';reveal(false);$('item-name').focus()};
 remove.onclick=()=>{if(confirm('항목을 삭제할까요? 기존 지출내역은 유지됩니다.'))saveItem({...r,archived:true})};
 row.append(actions,front);$('items-list').append(row);
 }
}
async function saveItem(row){if(masterBusy)return;masterBusy=true;drawItems();for(const b of $('item-form').querySelectorAll('button'))b.disabled=true;try{await db.updateCashflowItem(row);await loadItems();masterEditing=null;$('item-form').reset();$('item-title').textContent='항목 추가';$('items-error').textContent='저장되었습니다.'}catch(e){$('items-error').textContent=e.message}finally{masterBusy=false;drawItems();for(const b of $('item-form').querySelectorAll('button'))b.disabled=false}}
$('manage-items').onclick=()=>{if(!$('filters').reportValidity()||$('from').value>$('to').value){$('status').textContent='조회 기간을 확인해 주세요.';return}fillGroups();drawItems();$('items-error').textContent='';$('items-dialog').showModal()};
$('items-close').onclick=()=>{if(!masterBusy)$('items-dialog').close()};
$('items-dialog').addEventListener('cancel',e=>{if(masterBusy)e.preventDefault()});
$('item-reset').onclick=()=>{masterEditing=null;$('item-form').reset();$('item-title').textContent='항목 추가'};
$('item-form').onsubmit=e=>{e.preventDefault();const group=$('item-group').value.trim(),name=$('item-name').value.trim();if(!group||!name)return;if(expenseItems.some(r=>r.code!==masterEditing?.code&&r.group===group&&r.name===name)){$('items-error').textContent='같은 항목이 이미 있습니다.';return}saveItem({...masterEditing,code:masterEditing?.code||'restaurant-expense-'+crypto.randomUUID(),group,name,source:'restaurant-expense-items',archived:false})};
function selectedExpenseGroup(){const code=$('entry-item').value;const item=expenseItems.find(r=>r.code===code);return item?.group||(editing&&code===(editing.expenseItemCode||'legacy-'+editing.id)?editing.expenseGroup:'')||''}
function showExpenseGroup(){$('entry-group-label').textContent=selectedExpenseGroup()}
$('entry-item').onchange=showExpenseGroup;

$('from').value=today.slice(0,7)+'-01';$('to').value=today;
function element(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e}
async function reload(){records=(await db.getTransactions()).filter(r=>r.category==='expense');const selected=$('group').value;$('group').replaceChildren(new Option('전체',''));for(const g of [...new Set(records.map(r=>r.expenseGroup||'기타'))].sort())$('group').add(new Option(g,g));$('group').value=selected;render()}
function render(){
 if(!$('filters').reportValidity()||$('from').value>$('to').value){$('status').textContent='조회 기간을 확인해 주세요.';return}
 const q=$('search').value.trim().toLowerCase(),g=$('group').value;
 const rows=records.filter(r=>r.date>=$('from').value&&r.date<=$('to').value&&(!g||(r.expenseGroup||'기타')===g)&&(!q||[r.supplierName,r.itemName,r.expenseItemName,r.memo].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date));
 const opened=new Set([...$('rows').querySelectorAll('details[open]')].map(e=>e.dataset.date));$('rows').replaceChildren();
 const days=new Map();for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r)}
 for(const [date,list] of days){const d=element('details','','purchase-day');d.dataset.date=date;d.open=opened.has(date);const s=element('summary','');s.append(element('span',date,'day-date'),element('span',list.length+'건','day-count'),element('span',money(list.reduce((n,r)=>n+Number(r.amount),0)),'day-total'));d.append(s);
 for(const r of list){const row=element('div','','expense-row'),name=element('div',r.itemName||r.supplierName||'—');name.append(element('small',(r.expenseGroup||'기타')+' · '+(r.expenseItemName||'')+' · '+(r.paymentMethod||'기타')+(r.memo?' · '+r.memo:'')));const edit=element('button','수정');edit.type='button';edit.onclick=()=>open(r);row.append(element('div',r.expenseGroup||'기타','classification'),name,element('div',r.paymentMethod||'기타','payment'),element('div',money(r.amount),'amount'),edit);d.append(row)}$('rows').append(d)}
 $('total').textContent=money(rows.reduce((n,r)=>n+Number(r.amount),0));$('count').textContent=rows.length+'건';$('empty').hidden=!!rows.length;$('status').textContent='날짜를 누르면 상세내역이 펼쳐집니다.';
}
function open(r=null){editing=r;$('entry').reset();fillItems(r?.expenseItemCode||(r?'legacy-'+r.id:''));$('entry-date').value=r?.date||today;showExpenseGroup();$('entry-amount').value=r?.amount||'';$('entry-payment').value=r?.paymentMethod||'계좌이체';$('entry-memo').value=r?.memo||'';$('remove').hidden=!r;$('entry-error').textContent='';$('editor-title').textContent=r?'지출 수정':'지출 등록';$('editor').showModal()}
async function mutate(fn){if(busy)return;busy=true;for(const b of $('entry').querySelectorAll('button'))b.disabled=true;try{await fn();$('editor').close();await reload()}catch(e){$('entry-error').textContent=e.message;$('status').textContent=e.message}finally{busy=false;for(const b of $('entry').querySelectorAll('button'))b.disabled=false}}
$('entry').onsubmit=e=>{e.preventDefault();if(!$('entry').reportValidity())return;const amount=Number($('entry-amount').value),group=selectedExpenseGroup().trim();const item=expenseItems.find(r=>r.code===$('entry-item').value);if(!Number.isSafeInteger(amount)||amount<=0||!group||(!item&&!editing))return;
 const row={...editing,date:$('entry-date').value,type:'expense',category:'expense',expenseGroup:group,expenseItemCode:item?.code||editing?.expenseItemCode,expenseItemName:item?.name||editing?.expenseItemName||editing?.itemName,itemName:editing?.itemName||item?.name||editing?.expenseItemName,supplierName:editing?.supplierName||'',amount,paymentMethod:$('entry-payment').value,memo:$('entry-memo').value.trim(),source:'restaurant-expenses'};
 mutate(()=>editing?db.updateTransaction(row):db.addTransaction(row))};
$('remove').onclick=()=>{if(editing&&confirm('이 지출내역을 삭제할까요?'))mutate(()=>db.deleteTransaction(editing.id))};
$('cancel').onclick=()=>{if(!busy)$('editor').close()};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
$('add').onclick=()=>open();$('filters').onsubmit=e=>{e.preventDefault();render()};$('search').oninput=()=>{if(db)render()};$('group').onchange=()=>{if(db)render()};$('refresh').onclick=()=>location.reload();
try{if(business!=='restaurant')throw Error('식당 사업장을 선택해 주세요.');db=await import('./db.js?v=app-20261018-working-mobile-02');await loadItems();await reload();$('add').disabled=false;$('manage-items').disabled=false}catch(e){$('status').textContent='지출내역을 불러오지 못했습니다. '+e.message}
