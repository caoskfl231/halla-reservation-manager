import { createIndexedDbAdapter } from './indexeddb-adapter.js?v=app-20261010-16';

const CACHE_PREFIX = 'hallapa_cloud_cache_';
// 잠금 프로토콜을 쓰는 DB만 자동 정리한다. 구버전 탭의 캐시는 건드리지 않는다.
const MANAGED_CACHE_PREFIX = CACHE_PREFIX + 'locked_v1_';
const locks = globalThis.navigator?.locks;
let releaseCacheLock = () => {};

async function acquireCacheLock(name) {
  if (typeof locks?.request !== 'function') return false;
  let release;
  const lifetime = new Promise(resolve => { release = resolve; });
  return new Promise(resolve => {
    try {
      Promise.resolve(locks.request(name, { mode: 'exclusive' }, async lock => {
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
const managedName = MANAGED_CACHE_PREFIX + uuid;
const hasCacheLock = await acquireCacheLock(managedName);
const CACHE_NAME = hasCacheLock ? managedName : CACHE_PREFIX + uuid;

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
export function closeCloudCache() {
  adapter.close();
  try {
    indexedDB.deleteDatabase(CACHE_NAME);
  } finally {
    releaseCacheLock();
  }
}
window.addEventListener('pagehide', closeCloudCache);
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
