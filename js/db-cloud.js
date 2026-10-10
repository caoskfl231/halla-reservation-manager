import * as cache from './db-cloud-cache.js?v=ledger-atomic-20261010-1';
import { rpc, requireLedgerSession, friendlyError, signOut } from './cloud-session.js?v=ledger-atomic-20261010-1';
import { emitAppEvent } from './common/app-events.js?v=ledger-atomic-20261010-1';
import { changedRecords, recordToken, versionMap } from './cloud-records.js?v=ledger-atomic-20261010-1';
import { installBackupPanel } from './ledger-backups.js?v=ledger-atomic-20261010-1';
import { uploadSnapshot } from './cloud-import.js?v=ledger-atomic-20261010-1';
let state = await requireLedgerSession();
await cache.restoreHallapaDbSnapshot(state.snapshot);
let versions = versionMap(state.row_versions);
let pendingRemote = false;
let queue = Promise.resolve(), uncertain = false, observedRevision = state.revision;
let restoring = false;
const reads = new Set(Object.keys(cache).filter(name => name.startsWith('get')));
['exportHallapaDbSnapshot','ensureCashflowMastersIfEmpty','migrateLegacyLedgerTxIfNeeded'].forEach(name => reads.add(name));
function serial(work) {
  const result = queue.then(work); queue = result.catch(() => {}); return result;
}
function notice(text, warning = false) {
  const el = document.getElementById('ledger-cloud-status');
  if (el) { el.textContent = text; el.style.color = warning ? '#b42318' : '#126537'; }
}
function validate(snapshot) {
  if (snapshot?.meta?.dbName !== 'hallapa_db' || !snapshot?.meta?.dbVersion || !snapshot?.meta?.exportedAt ||
      !snapshot.stores || typeof snapshot.stores !== 'object' || Array.isArray(snapshot.stores))
    throw new Error('할라 장부 전체백업 JSON 파일을 선택해 주세요.');
  const codes = new Set(['customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']);
  const ids = new Set(['transactions','users','customers','items','ledger_tx','sales_quotes']);
  for (const [name, rows] of Object.entries(snapshot.stores)) {
    if (!codes.has(name) && !ids.has(name)) throw new Error('알 수 없는 장부 항목: ' + name);
    if (!Array.isArray(rows)) throw new Error('백업 항목 형식이 올바르지 않습니다: ' + name);
    const key = codes.has(name) ? 'code' : 'id', seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !['string','number'].includes(typeof row[key]) || row[key] === '')
        throw new Error('백업 항목의 코드가 없습니다: ' + name);
      const id = JSON.stringify(row[key]);
      if (seen.has(id)) throw new Error('중복 코드가 있는 백업입니다: ' + name);
      seen.add(id);
    }
  }
}
async function cloudCall(name, args) {
  const restore = name === 'restoreHallapaDbSnapshot';
  if (restore && restoring) throw new Error('자료 가져오기가 진행 중입니다. 완료될 때까지 기다려 주세요.');
  if (restore) restoring = true;
  const operation = serial(async () => {
    if (reads.has(name)) return cache[name](...args);
    if (uncertain) throw new Error('최신 불러오기를 눌러 저장 결과를 확인한 뒤 다시 시도해 주세요.');
    if (state.revision === 0 && name !== 'restoreHallapaDbSnapshot')
      throw new Error('먼저 전체백업 파일이나 이 PC의 자료를 공용 장부로 옮겨 주세요.');
    if (name === 'restoreHallapaDbSnapshot') validate(args[0]);
    try {
      if (name === 'addTransaction') {
        // IDs must be unique across devices, including devices sharing one login.
        const id = await rpc('halla_ledger_reserve_transaction_id');
        if (!Number.isSafeInteger(id)) throw new Error('거래 번호를 발급하지 못했습니다. 다시 시도해 주세요.');
        args[0] = { ...args[0], id };
      }
      if (name === 'saveTransactionBatch') {
        const batch = args[0] || {}, rows = [];
        for (const row of batch.add || []) {
          const id = await rpc('halla_ledger_reserve_transaction_id');
          if (!Number.isSafeInteger(id)) throw new Error('거래 번호를 발급하지 못했습니다.');
          rows.push({ ...row, id });
        }
        args[0] = { ...batch, add: rows };
      }
      const result = await cache[name](...args);
      const snapshot = await cache.exportHallapaDbSnapshot();
      validate(snapshot); notice('인터넷에 저장 중…');
      const action = name === 'restoreHallapaDbSnapshot' ? (state.revision === 0 ? 'initialize' : 'restore') : 'edit';
      const changes = changedRecords(state.snapshot, snapshot, versions);
      try {
        if (action === 'edit') {
          if (!changes.length) { notice('저장할 변경 내용이 없습니다.'); return result; }
          const next = await rpc('halla_ledger_patch_compact', { p_changes: changes });
          const nextVersions = versionMap(next.row_versions);
          for (const change of changes) {
            const token = recordToken(change.store, change.key);
            versions.set(token, nextVersions.get(token));
          }
          // Preserve untouched baselines. An unrelated save must not silently
          // approve a stale edit of another record still open in the UI.
          pendingRemote = pendingRemote || next.previous_revision !== state.revision;
          state = { ...state, ...next, snapshot };
        } else {
          state = await uploadSnapshot(snapshot, state.revision, action, rpc, notice);
          versions = versionMap(state.row_versions);
          pendingRemote = false;
        }
      } catch (error) {
        // A response can be lost after commit. Never replay a save automatically.
        uncertain = !/LEDGER_RECORD_CONFLICT|LEDGER_CONFLICT|DUPLICATE_LEDGER_FINGERPRINT|OWNER_REQUIRED|INVALID_/.test(error.message);
        throw error;
      }
      observedRevision = state.revision;
      notice('인터넷 저장 완료 · ' + new Date(state.updated_at).toLocaleTimeString('ko-KR'));
      if (pendingRemote) notice('저장 완료 · 다른 기기의 새 내용은 최신 불러오기로 확인하세요.');
      document.getElementById('ledger-first-import')?.remove();
      emitAppEvent('db:changed', { stores: Object.keys(snapshot.stores) }); return result;
    } catch (error) {
      await cache.restoreHallapaDbSnapshot(state.snapshot);
      notice(friendlyError(error) + ' · 최신 불러오기로 확인해 주세요.', true);
      throw new Error(friendlyError(error));
    }
  });
  try { return await operation; }
  finally { if (restore) restoring = false; }
}
const bar = document.createElement('div');
bar.id = 'ledger-cloud-bar';
bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#eef6ff;border-bottom:1px solid #c6d7ea;padding:12px 18px;font:14px system-ui;position:relative;z-index:10';
bar.innerHTML = '<strong>공용 장부</strong><span id="ledger-cloud-status" role="status" style="flex:1;min-width:160px">인터넷 연결됨</span><button type="button" id="ledger-cloud-reload">최신 불러오기</button><button type="button" id="ledger-cloud-logout">로그아웃</button>';
document.body.prepend(bar);
installBackupPanel(snapshot => cloudCall('restoreHallapaDbSnapshot', [snapshot]), state.role === 'owner');
document.getElementById('ledger-cloud-reload').onclick = () => {
  if (window.confirm('입력 중인 내용은 사라질 수 있습니다. 최신 장부를 불러올까요?')) location.reload();
};
document.getElementById('ledger-cloud-logout').onclick = async () => {
  if (window.confirm('로그아웃할까요?')) { cache.closeCloudCache(); await signOut(); }
};
if (state.revision === 0 && state.role === 'owner') {
  const panel = document.createElement('section');
  panel.id = 'ledger-first-import';
  panel.style.cssText = 'background:#fff8e8;border-bottom:1px solid #efd398;padding:18px;font:16px system-ui;line-height:1.7';
  panel.innerHTML = '<strong>처음 연결: 기존 장부자료 옮기기</strong><p>전체백업 JSON 파일을 선택하거나, 기존 장부를 사용한 PC에서 자료를 옮겨 주세요.</p><button type="button" id="ledger-import-file">백업 파일 선택</button> <button type="button" id="ledger-import-local">이 PC의 자료 옮기기</button><input type="file" id="ledger-import-input" accept=".json,application/json" hidden>';
  bar.after(panel);
  const upload = async snapshot => {
    validate(snapshot);
    const count = Object.values(snapshot.stores).reduce((n,rows) => n + rows.length, 0);
    if (!count) throw new Error('선택한 자료에 기록이 없습니다. 전체백업 파일을 확인해 주세요.');
    if (!window.confirm('총 ' + count.toLocaleString('ko-KR') + '개 항목을 공용 장부로 옮길까요?')) return;
    await cloudCall('restoreHallapaDbSnapshot', [snapshot]); location.reload();
  };
  document.getElementById('ledger-import-file').onclick = () => document.getElementById('ledger-import-input').click();
  document.getElementById('ledger-import-input').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 25000000) throw new Error('백업 파일이 너무 큽니다. 관리자에게 문의해 주세요.');
      await upload(JSON.parse(await file.text()));
    } catch (error) { window.alert(friendlyError(error)); }
    finally { event.target.value = ''; }
  };
  document.getElementById('ledger-import-local').onclick = async () => {
    try {
      if (!indexedDB.databases) throw new Error('이 브라우저에서는 전체백업 파일을 선택해 주세요.');
      if (!(await indexedDB.databases()).some(db => db.name === 'hallapa_db')) throw new Error('이 기기에 기존 장부자료가 없습니다. 전체백업 파일을 선택해 주세요.');
      const local = await import('./db-local.js?v=ledger-atomic-20261010-1'); await upload(await local.exportHallapaDbSnapshot());
    } catch (error) { window.alert(friendlyError(error)); }
  };
}
if (state.role !== 'owner') {
  document.getElementById('btn-home-db-restore')?.remove();
  document.getElementById('home-db-restore-file')?.remove();
}
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  serial(async () => {
    try {
      const latest = await rpc('halla_ledger_status');
      if (latest.revision !== observedRevision) {
        pendingRemote = true;
        observedRevision = latest.revision;
        notice('다른 기기에서 변경됨 · 최신 불러오기를 눌러 주세요.', true);
      }
    } catch (error) { notice(friendlyError(error), true); }
  });
}, 15000);
export const getTransactions = (...args) => cloudCall('getTransactions', args);
export const addTransaction = (...args) => cloudCall('addTransaction', args);
export const saveTransactionBatch = (...args) => cloudCall('saveTransactionBatch', args);
export const updateTransaction = (...args) => cloudCall('updateTransaction', args);
export const deleteTransaction = (...args) => cloudCall('deleteTransaction', args);
export const clearAllTransactions = (...args) => cloudCall('clearAllTransactions', args);
export const getUsers = (...args) => cloudCall('getUsers', args);
export const addUser = (...args) => cloudCall('addUser', args);
export const getCustomers = (...args) => cloudCall('getCustomers', args);
export const addCustomer = (...args) => cloudCall('addCustomer', args);
export const updateCustomer = (...args) => cloudCall('updateCustomer', args);
export const deleteCustomer = (...args) => cloudCall('deleteCustomer', args);
export const bulkInsertCustomers = (...args) => cloudCall('bulkInsertCustomers', args);
export const bulkReplaceCustomerTypes = (...args) => cloudCall('bulkReplaceCustomerTypes', args);
export const bulkReplaceCustomerGroups = (...args) => cloudCall('bulkReplaceCustomerGroups', args);
export const getCustomerTypes = (...args) => cloudCall('getCustomerTypes', args);
export const addCustomerType = (...args) => cloudCall('addCustomerType', args);
export const updateCustomerType = (...args) => cloudCall('updateCustomerType', args);
export const deleteCustomerType = (...args) => cloudCall('deleteCustomerType', args);
export const getCustomerGroups = (...args) => cloudCall('getCustomerGroups', args);
export const addCustomerGroup = (...args) => cloudCall('addCustomerGroup', args);
export const updateCustomerGroup = (...args) => cloudCall('updateCustomerGroup', args);
export const deleteCustomerGroup = (...args) => cloudCall('deleteCustomerGroup', args);
export const renameCustomerTypeNameEverywhere = (...args) => cloudCall('renameCustomerTypeNameEverywhere', args);
export const renameCustomerGroupNameEverywhere = (...args) => cloudCall('renameCustomerGroupNameEverywhere', args);
export const getItems = (...args) => cloudCall('getItems', args);
export const addItemMaster = (...args) => cloudCall('addItemMaster', args);
export const updateItem = (...args) => cloudCall('updateItem', args);
export const renameItem = (...args) => cloudCall('renameItem', args);
export const deleteItem = (...args) => cloudCall('deleteItem', args);
export const bulkInsertItems = (...args) => cloudCall('bulkInsertItems', args);
export const bulkReplaceItemGroups = (...args) => cloudCall('bulkReplaceItemGroups', args);
export const getItemGroups = (...args) => cloudCall('getItemGroups', args);
export const addItemGroup = (...args) => cloudCall('addItemGroup', args);
export const updateItemGroup = (...args) => cloudCall('updateItemGroup', args);
export const deleteItemGroup = (...args) => cloudCall('deleteItemGroup', args);
export const renameItemGroupNameInItems = (...args) => cloudCall('renameItemGroupNameInItems', args);
export const getCashflowTypes = (...args) => cloudCall('getCashflowTypes', args);
export const addCashflowType = (...args) => cloudCall('addCashflowType', args);
export const updateCashflowType = (...args) => cloudCall('updateCashflowType', args);
export const deleteCashflowType = (...args) => cloudCall('deleteCashflowType', args);
export const bulkReplaceCashflowTypes = (...args) => cloudCall('bulkReplaceCashflowTypes', args);
export const getCashflowItems = (...args) => cloudCall('getCashflowItems', args);
export const addCashflowItem = (...args) => cloudCall('addCashflowItem', args);
export const updateCashflowItem = (...args) => cloudCall('updateCashflowItem', args);
export const deleteCashflowItem = (...args) => cloudCall('deleteCashflowItem', args);
export const bulkReplaceCashflowItems = (...args) => cloudCall('bulkReplaceCashflowItems', args);
export const getCashflowGroups = (...args) => cloudCall('getCashflowGroups', args);
export const addCashflowGroup = (...args) => cloudCall('addCashflowGroup', args);
export const updateCashflowGroup = (...args) => cloudCall('updateCashflowGroup', args);
export const deleteCashflowGroup = (...args) => cloudCall('deleteCashflowGroup', args);
export const bulkReplaceCashflowGroups = (...args) => cloudCall('bulkReplaceCashflowGroups', args);
export const getAllLedgerTx = (...args) => cloudCall('getAllLedgerTx', args);
export const putLedgerTx = (...args) => cloudCall('putLedgerTx', args);
export const getLedgerTxById = (...args) => cloudCall('getLedgerTxById', args);
export const deleteLedgerTxById = (...args) => cloudCall('deleteLedgerTxById', args);
export const clearAllLedgerTx = (...args) => cloudCall('clearAllLedgerTx', args);
export const migrateLegacyLedgerTxIfNeeded = (...args) => cloudCall('migrateLegacyLedgerTxIfNeeded', args);
export const ensureCashflowMastersIfEmpty = (...args) => cloudCall('ensureCashflowMastersIfEmpty', args);
export const exportHallapaDbSnapshot = (...args) => cloudCall('exportHallapaDbSnapshot', args);
export const restoreHallapaDbSnapshot = (...args) => cloudCall('restoreHallapaDbSnapshot', args);
export const ensureDefaultCashflowMasters = (...args) => cloudCall('ensureDefaultCashflowMasters', args);

