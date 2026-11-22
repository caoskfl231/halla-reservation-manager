export function installMenuPickers(getPurchases,categoryStore) {
 const form=document.getElementById('calculator');
 const dialog=document.createElement('dialog');dialog.className='menu-picker';dialog.setAttribute('aria-labelledby','menu-picker-title');
 dialog.innerHTML='<header><button type="button" class="picker-back" hidden>분류 목록</button><h2 id="menu-picker-title" tabindex="-1"></h2><button type="button" class="picker-close">닫기</button></header><div class="picker-options"></div>';
 document.body.append(dialog);
 const title=dialog.querySelector('h2'),list=dialog.querySelector('.picker-options'),back=dialog.querySelector('.picker-back');
 const controls=new Map();let active=null,opener=null,saving=false;
 const group=r=>String(r.itemGroup||'').trim()||'미분류';
 const money=(n,unit)=>Number(n).toLocaleString('ko-KR')+'원/'+(String(unit||'').trim()||'개');
 function button(text,action,selected=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.className='picker-option';b.setAttribute('aria-pressed',String(selected));b.onclick=action;list.append(b);return b;}
 function sync(){for(const [id,{select,trigger}] of controls){trigger.textContent=select.selectedOptions[0]?.textContent||(id==='purchase'?'직접 입력':'분류 선택');}}
 function choose(value){const {select}=controls.get(active);select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();dialog.close();}
 function items(category){title.textContent=category+' · 품목 선택';back.hidden=false;list.replaceChildren();for(const [i,r] of getPurchases().entries()){if(group(r)!==category)continue;button(r.itemName+' · '+money(r.unitPrice,r.unit),()=>choose(String(i)),controls.get(active).select.value===String(i));}if(!list.children.length){const p=document.createElement('p');p.textContent='이 분류에 등록된 매입품목이 없습니다.';list.append(p);}title.focus();}
 function categoryButton(name,label,action,selected=false){
 const front=button(label,action,selected),row=document.createElement('div'),remove=document.createElement('button');
 row.className='picker-swipe';front.replaceWith(row);row.append(front,remove);remove.type='button';remove.className='picker-delete';remove.textContent='삭제';remove.inert=true;
 let start=null,suppress=0;
 function reveal(value){for(const other of list.querySelectorAll('.picker-swipe.revealed')){other.classList.remove('revealed');other.querySelector('.picker-delete').inert=true;}row.classList.toggle('revealed',value);remove.inert=!value;}
 front.setAttribute('aria-label',label+' · 왼쪽으로 밀거나 왼쪽 화살표 키로 삭제');
 front.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};});
 front.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){start=null;return;}if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)*1.3){reveal(dx<0);suppress=Date.now()+600;start=null;}});
 for(const type of ['pointerup','pointercancel','pointerleave'])front.addEventListener(type,()=>{start=null;});
 front.onclick=()=>{if(Date.now()<suppress)return;if(row.classList.contains('revealed')){reveal(false);return;}action();};
 front.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();reveal(e.key==='ArrowLeft');}};
 remove.onclick=async()=>{if(saving||!confirm('「'+name+'」 분류를 삭제할까요?'))return;await saveCategory(name,true);};
 }
 async function saveCategory(name,remove){
 if(saving)return;saving=true;const kind=active==='purchase'?'purchase':'menu';
 for(const b of dialog.querySelectorAll('button,input'))b.disabled=true;
 try{await categoryStore.change(kind,name,remove);categories();}
 catch(e){dialog.querySelector('.picker-error').textContent=e.message;}
 finally{saving=false;for(const b of dialog.querySelectorAll('button,input'))b.disabled=false;}
 }
 function categories(){list.replaceChildren();back.hidden=true;
 const add=document.createElement('form'),input=document.createElement('input'),submit=document.createElement('button'),error=document.createElement('p');
 add.className='picker-add';input.placeholder='새 분류명';input.setAttribute('aria-label','새 분류명');input.maxLength=40;input.required=true;submit.textContent='추가';submit.type='submit';add.append(input,submit);add.onsubmit=e=>{e.preventDefault();saveCategory(input.value,false);};error.className='picker-error';error.setAttribute('role','alert');list.append(add,error);
  if(active==='purchase'){
   title.textContent='매입품목 · 분류 선택';button('직접 입력',()=>choose(''),controls.get(active).select.value==='');
   const counts=new Map();for(const r of getPurchases())counts.set(group(r),(counts.get(group(r))||0)+1);
   for(const name of categoryStore.names('purchase'))categoryButton(name,name+' · '+(counts.get(name)||0)+'개',()=>items(name));
   if(!counts.size){const p=document.createElement('p');p.textContent='불러올 매입품목이 없습니다.';list.append(p);}
  }else{title.textContent='메뉴 분류 선택';for(const option of controls.get(active).select.options){if(option.value)categoryButton(option.value,option.textContent,()=>choose(option.value),option.selected);}}
 }
 function show(id){active=id;opener=controls.get(id).trigger;categories();if(!dialog.open)dialog.showModal();opener.setAttribute('aria-expanded','true');title.focus();}
 for(const id of ['purchase','menu-category']){
  const select=document.getElementById(id),trigger=document.createElement('button');
  trigger.type='button';trigger.className='menu-picker-trigger';trigger.id=id+'-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',id==='purchase'?'매입품목 불러오기':'메뉴 분류 선택');
  select.hidden=true;select.after(trigger);trigger.onclick=()=>show(id);controls.set(id,{select,trigger});
  select.addEventListener('change',sync);select.addEventListener('invalid',e=>{e.preventDefault();show(id);});
 }
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 back.onclick=()=>{categories();title.focus();};dialog.querySelector('.picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{opener?.setAttribute('aria-expanded','false');opener?.focus();});
 form.addEventListener('reset',()=>queueMicrotask(sync));sync();return sync;
}

