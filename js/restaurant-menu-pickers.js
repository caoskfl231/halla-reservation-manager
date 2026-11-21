export function installMenuPickers(getPurchases) {
 const form=document.getElementById('calculator');
 const dialog=document.createElement('dialog');dialog.className='menu-picker';dialog.setAttribute('aria-labelledby','menu-picker-title');
 dialog.innerHTML='<header><button type="button" class="picker-back" hidden>분류 목록</button><h2 id="menu-picker-title" tabindex="-1"></h2><button type="button" class="picker-close">닫기</button></header><div class="picker-options"></div>';
 document.body.append(dialog);
 const title=dialog.querySelector('h2'),list=dialog.querySelector('.picker-options'),back=dialog.querySelector('.picker-back');
 const controls=new Map();let active=null,opener=null;
 const group=r=>String(r.itemGroup||'').trim()||'미분류';
 const money=n=>Number(n).toLocaleString('ko-KR')+'원/kg';
 function button(text,action,selected=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.className='picker-option';b.setAttribute('aria-pressed',String(selected));b.onclick=action;list.append(b);return b;}
 function sync(){for(const [id,{select,trigger}] of controls){trigger.textContent=select.selectedOptions[0]?.textContent||(id==='purchase'?'직접 입력':'분류 선택');}}
 function choose(value){const {select}=controls.get(active);select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();dialog.close();}
 function items(category){title.textContent=category+' · 품목 선택';back.hidden=false;list.replaceChildren();for(const [i,r] of getPurchases().entries()){if(group(r)!==category)continue;button(r.itemName+' · '+money(r.unitPrice),()=>choose(String(i)),controls.get(active).select.value===String(i));}title.focus();}
 function categories(){list.replaceChildren();back.hidden=true;
  if(active==='purchase'){
   title.textContent='매입품목 · 분류 선택';button('직접 입력',()=>choose(''),controls.get(active).select.value==='');
   const counts=new Map();for(const r of getPurchases())counts.set(group(r),(counts.get(group(r))||0)+1);
   for(const [name,count] of counts)button(name+' · '+count+'개',()=>items(name));
   if(!counts.size){const p=document.createElement('p');p.textContent='불러올 kg 단위 매입품목이 없습니다.';list.append(p);}
  }else{title.textContent='메뉴 분류 선택';for(const option of controls.get(active).select.options){if(option.value)button(option.textContent,()=>choose(option.value),option.selected);}}
 }
 function show(id){active=id;opener=controls.get(id).trigger;categories();if(!dialog.open)dialog.showModal();opener.setAttribute('aria-expanded','true');title.focus();}
 for(const id of ['purchase','menu-category']){
  const select=document.getElementById(id),trigger=document.createElement('button');
  trigger.type='button';trigger.className='menu-picker-trigger';trigger.id=id+'-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',id==='purchase'?'매입품목 불러오기':'메뉴 분류 선택');
  select.hidden=true;select.after(trigger);trigger.onclick=()=>show(id);controls.set(id,{select,trigger});
  select.addEventListener('change',sync);select.addEventListener('invalid',e=>{e.preventDefault();show(id);});
 }
 back.onclick=()=>{categories();title.focus();};dialog.querySelector('.picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{opener?.setAttribute('aria-expanded','false');opener?.focus();});
 form.addEventListener('reset',()=>queueMicrotask(sync));sync();return sync;
}
