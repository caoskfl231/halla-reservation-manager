// A disposable, user-scoped download cache. Never an authority or a backup.
const NAME = 'hallapa_ledger_download_v1';
const CODES = new Set(['customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']);
async function storage(mode, work) {
  const db = await new Promise((resolve,reject) => {
    const open = indexedDB.open(NAME,1);
    open.onupgradeneeded = () => open.result.createObjectStore('state');
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction('state',mode); const req = work(tx.objectStore('state'));
      let value; req.onsuccess = () => value = req.result;
      tx.oncomplete = () => resolve(value); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function clearReadCache() { try { await storage('readwrite',store => store.clear()); } catch {} }
export async function loadPeriodLedger(rpc, manifest) {
  if (!Array.isArray(manifest.stores) || !Array.isArray(manifest.periods)) throw new Error('INVALID_LEDGER_MANIFEST');
  const stores=Object.fromEntries(manifest.stores.map(name=>[name,[]]));
  const versions=[], seen=new Set();
  const total=manifest.periods.reduce((sum,part)=>sum+Number(part.count),0);
  let completed=0, nextPart=0, failed=false;
  async function consume() {
    while (!failed && nextPart<manifest.periods.length) {
      const part=manifest.periods[nextPart++];
      if (!Object.hasOwn(stores,part.store) || !Number.isSafeInteger(part.count) || part.count<0) throw new Error('INVALID_LEDGER_MANIFEST');
      let after=0, received=0;
      while (received<part.count) {
        if (failed) return;
        const page=await rpc('halla_ledger_period_page',{p_revision:manifest.revision,p_store:part.store,p_period:part.period,p_after:after,p_limit:500});
        if (page.revision!==manifest.revision || !Array.isArray(page.rows) || page.rows.length===0 || page.rows.length>500 || !Number.isSafeInteger(page.next) || page.next<=after) throw new Error('INVALID_LEDGER_PAGE');
        for (const row of page.rows) {
          const key=JSON.stringify([part.store,row.key]);
          if (seen.has(key) || !Number.isSafeInteger(row.version) || row.version<=after || row.version>manifest.cursor) throw new Error('INVALID_LEDGER_PAGE');
          seen.add(key);versions.push({store:part.store,key:row.key,version:row.version});
          if (row.data!==null) stores[part.store].push(row.data);
        }
        if (page.next!==Math.max(...page.rows.map(row=>row.version))) throw new Error('INVALID_LEDGER_PAGE');
        after=page.next;received+=page.rows.length;completed+=page.rows.length;
        if (received>part.count) throw new Error('INVALID_LEDGER_PAGE');
        globalThis.dispatchEvent?.(new CustomEvent('ledger:load-progress',{detail:{completed,total,period:part.period}}));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
  }
  // Three bounded downloads at a time; no full-snapshot 20MB response.
  const results=await Promise.allSettled(Array.from({length:Math.min(3,manifest.periods.length)},()=>consume().catch(error=>{failed=true;throw error;})));
  const failure=results.find(result=>result.status==='rejected');
  if (failure) throw failure.reason;
  // Check revision again, including the empty-ledger case, before publishing a complete cache.
  const verify=await rpc('halla_ledger_sync_v2',{p_cursor:manifest.cursor});
  if (verify.revision!==manifest.revision || verify.full || (verify.changes || []).length) throw new Error('LEDGER_READ_CHANGED');
  return {full:true,cursor:manifest.cursor,revision:manifest.revision,role:manifest.role,updated_at:manifest.updated_at,snapshot:{meta:manifest.meta,stores},row_versions:versions};
}
export function mergeLedgerDelta(previous, delta) {
  if (delta.full) return delta;
  if (!previous?.snapshot?.stores || !Number.isSafeInteger(delta.cursor) || delta.cursor < previous.cursor)
    throw new Error('INVALID_LEDGER_CACHE');
  const stores = {...previous.snapshot.stores};
  const versions = new Map(previous.row_versions.map(row => [JSON.stringify([row.store,row.key]),row]));
  const groups = new Map();
  for (const change of delta.changes) {
    if (!Object.hasOwn(stores,change.store)) throw new Error('INVALID_LEDGER_STORE');
    if (!groups.has(change.store)) groups.set(change.store,new Map());
    groups.get(change.store).set(JSON.stringify(change.key),change);
    versions.set(JSON.stringify([change.store,change.key]),{store:change.store,key:change.key,version:change.version});
  }
  for (const [name,changes] of groups) {
    const field = CODES.has(name) ? 'code' : 'id';
    stores[name] = stores[name].filter(row => !changes.has(JSON.stringify(row[field])));
    stores[name].push(...[...changes.values()].filter(c => c.data !== null).map(c => c.data));
  }
  return {snapshot:{meta:delta.meta,stores},row_versions:[...versions.values()],cursor:delta.cursor,
    revision:delta.revision,updated_at:delta.updated_at,role:delta.role};
}
export async function loadSyncedLedger(rpc, user) {
  let saved;
  if (user) try { saved = await storage('readonly',store => store.get('current')); } catch {}
  let previous = saved?.user === user && saved?.format === 1 && Number.isSafeInteger(saved?.state?.cursor)
    && saved.state.snapshot?.stores && Array.isArray(saved.state.row_versions) ? saved.state : null;
  // Never display cached data without a successful member + MFA checked RPC.
  let delta = await rpc('halla_ledger_sync_v2',{p_cursor:previous?.cursor ?? null});
  if (delta.chunked) delta=await loadPeriodLedger(rpc,delta);
  let state;
  try { state = mergeLedgerDelta(previous,delta); }
  catch { previous = null; const full=await rpc('halla_ledger_sync_v2',{p_cursor:null}); state=full.chunked ? await loadPeriodLedger(rpc,full) : full; }
  if (!state?.snapshot?.stores || !Array.isArray(state.row_versions)) throw new Error('INVALID_LEDGER_RESPONSE');
  if (user) try { await storage('readwrite',store => store.put({format:1,user,state},'current')); } catch {}
  return state;
}
