import { createIndexedDbAdapter } from './indexeddb-adapter.js?v=app-20261010-17';

const CACHE_PREFIX = 'hallapa_cloud_cache_';
// 잠금 프로토콜을 쓰는 DB만 자동 정리한다. 구버전 탭의 캐시는 건드리지 않는다.
const MANAGED_CACHE_PREFIX = CACHE_PREFIX + 'locked_v1_';
const locks = globalThis.navigator?.locks;
let releaseCacheLock = () => {};
const PAGE_CACHE_KEY = 'hallapa_page_cache_v1';
const CACHE_STAMP_KEY = 'hallapa_page_cache_ready_v1';
function sessionValue(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function saveSessionValue(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch {} }

async function acquireCacheLock(name) {
  if (typeof locks?.request !== 'function') return false;
  let release;
  const lifetime = new Promise(resolve => { release = resolve; });
  return new Promise(resolve => {
    try {
      Promise.resolve(locks.request(name, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { resolve(false); return; }
        releaseCacheLock = release;
        resolve(true);
        await lifetime;
      })).catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

const uuid = crypto.randomUUID();
const priorName = sessionValue(PAGE_CACHE_KEY);
let managedName = priorName?.startsWith(MANAGED_CACHE_PREFIX) ? priorName : MANAGED_CACHE_PREFIX + uuid;
let hasCacheLock = await acquireCacheLock(managedName);
// 복제된 탭도 같은 작업 DB를 공유하지 않는다.
if (!hasCacheLock && managedName === priorName) {
  managedName = MANAGED_CACHE_PREFIX + uuid;
  hasCacheLock = await acquireCacheLock(managedName);
}
const CACHE_NAME = hasCacheLock ? managedName : CACHE_PREFIX + uuid;
saveSessionValue(PAGE_CACHE_KEY, hasCacheLock ? CACHE_NAME : null);

async function cleanupOrphanedCaches() {
  if (!hasCacheLock || typeof indexedDB.databases !== 'function') return;
  try {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (!db.name?.startsWith(MANAGED_CACHE_PREFIX) || db.name === CACHE_NAME) continue;
      await locks.request(db.name, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) return; // 다른 탭에서 사용 중이면 삭제하지 않는다.
        await new Promise(resolve => {
          const request = indexedDB.deleteDatabase(db.name);
          request.onsuccess = resolve;
          request.onerror = resolve;
        });
      });
    }
  } catch {
    // 목록 조회나 삭제가 거부되어도 현재 페이지는 정상 작동한다.
  }
}
void cleanupOrphanedCaches();
const adapter = createIndexedDbAdapter({
  databaseName: CACHE_NAME,
  reuseConnection: true,
  includeSalesQuotes: true,
  strictSnapshotErrors: true,
  snapshotWriteBatchSize: 250,
});
export function invalidateCloudCache() { saveSessionValue(CACHE_STAMP_KEY, null); }
// 반드시 서버에서 계정/권한과 최신 revision을 승인한 뒤 호출한다.
export async function prepareCloudCache(state, user, options = {}) {
  const stamp = JSON.stringify({ name: CACHE_NAME, user, revision: state.revision, cursor: state.cursor });
  let exists = false;
  if (user && hasCacheLock && sessionValue(CACHE_STAMP_KEY) === stamp && typeof indexedDB.databases === 'function') {
    try { exists = (await indexedDB.databases()).some(db => db.name === CACHE_NAME); } catch {}
  }
  if (exists) return { reused: true };
  invalidateCloudCache();
  await adapter.restoreHallapaDbSnapshot(state.snapshot, options);
  if (user && hasCacheLock) saveSessionValue(CACHE_STAMP_KEY, stamp);
  return { reused: false };
}
export function closeCloudCache(discard = true) {
  adapter.close();
  try {
    if (discard) { invalidateCloudCache(); saveSessionValue(PAGE_CACHE_KEY, null); indexedDB.deleteDatabase(CACHE_NAME); }
  } finally {
    releaseCacheLock();
  }
}
window.addEventListener('pagehide', event => {
  // 브라우저 뒤로 가기용으로 보존된 페이지는 연결과 잠금도 유지한다.
  if (!event?.persisted) closeCloudCache(!hasCacheLock);
});
export const {
  ensureDefaultCashflowMasters,
  getTransactions,
  getTransactionById,
  addTransaction,
  saveTransactionBatch,
  updateTransaction,
  deleteTransaction,
  clearAllTransactions,
  getUsers,
  addUser,
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  bulkInsertCustomers,
  bulkReplaceCustomerTypes,
  bulkReplaceCustomerGroups,
  getCustomerTypes,
  addCustomerType,
  updateCustomerType,
  deleteCustomerType,
  getCustomerGroups,
  addCustomerGroup,
  updateCustomerGroup,
  deleteCustomerGroup,
  renameCustomerTypeNameEverywhere,
  renameCustomerGroupNameEverywhere,
  getItems,
  addItemMaster,
  updateItem,
  renameItem,
  deleteItem,
  bulkInsertItems,
  bulkReplaceItemGroups,
  getItemGroups,
  addItemGroup,
  updateItemGroup,
  deleteItemGroup,
  renameItemGroupNameInItems,
  getCashflowTypes,
  addCashflowType,
  updateCashflowType,
  deleteCashflowType,
  bulkReplaceCashflowTypes,
  getCashflowItems,
  addCashflowItem,
  updateCashflowItem,
  deleteCashflowItem,
  bulkReplaceCashflowItems,
  getCashflowGroups,
  addCashflowGroup,
  updateCashflowGroup,
  deleteCashflowGroup,
  bulkReplaceCashflowGroups,
  getAllLedgerTx,
  putLedgerTx,
  getLedgerTxById,
  deleteLedgerTxById,
  clearAllLedgerTx,
  migrateLegacyLedgerTxIfNeeded,
  ensureCashflowMastersIfEmpty,
  exportHallapaDbSnapshot,
  restoreHallapaDbSnapshot,
} = adapter;
