let key=null;
export async function initMenuStore(){
 await import('./db.js?v=app-20261018-working-mobile-02');
 const {sessionIdentity}=await import('./cloud-session.js?v=app-20261018-working-mobile-02');
 key='halla.restaurant.v1:'+JSON.stringify(sessionIdentity());
 const rows=readMenus();let changed=false;
 for(const r of rows){if(!r.id){r.id=crypto.randomUUID();changed=true}}
 if(changed)writeMenus(rows);
 return rows;
}
export function readMenus(){
 if(!key)throw Error('로그인 확인이 필요합니다.');
 const rows=JSON.parse(localStorage.getItem(key)||'[]');
 if(!Array.isArray(rows))throw Error('메뉴 저장내역을 확인해 주세요.');
 return rows;
}
function writeMenus(rows){localStorage.setItem(key,JSON.stringify(rows))}
export function saveMenu(v,mode,id){
 const rows=readMenus(),index=id?rows.findIndex(r=>r.id===id):-1;
 if(id&&index<0)throw Error('이 메뉴가 삭제되었습니다. 새 메뉴로 다시 입력해 주세요.');
 const record={v,mode,id:id||crypto.randomUUID(),updatedAt:new Date().toISOString()};
 if(index>=0)rows[index]=record;else rows.push(record);
 writeMenus(rows);return record;
}
export function deleteMenu(id){writeMenus(readMenus().filter(r=>r.id!==id))}
