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
  const delta = await rpc('halla_ledger_sync',{p_cursor:previous?.cursor ?? null});
  let state;
  try { state = mergeLedgerDelta(previous,delta); }
  catch { previous = null; state = await rpc('halla_ledger_sync',{p_cursor:null}); }
  if (!state?.snapshot?.stores || !Array.isArray(state.row_versions)) throw new Error('INVALID_LEDGER_RESPONSE');
  if (user) try { await storage('readwrite',store => store.put({format:1,user,state},'current')); } catch {}
  return state;
}
