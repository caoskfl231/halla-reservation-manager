const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync('js/db-cloud-cache.js', 'utf8');
const prefix = 'hallapa_cloud_cache_locked_v1_';
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ unsupported = false, enumerationFailure = false, lockFailure = false } = {}) {
  const held = new Set(), deleted = [], names = new Set(['hallapa_db', 'other', 'hallapa_cloud_cache_legacy', prefix + 'orphan']);
  let id = 0;
  const locks = { async request(name, options, callback) {
    if (lockFailure) throw Error('locks unavailable');
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
  const indexedDB = { deleteDatabase(name) { deleted.push(name); names.delete(name); const request = {}; queueMicrotask(() => request.onsuccess?.()); return request; } };
  if (!unsupported) indexedDB.databases = async () => {
    if (enumerationFailure) throw Error('enumeration denied');
    return Array.from(names, name => ({ name }));
  };
  async function load(sessionValues = new Map()) {
    const events = {}, state = {};
    const context = vm.createContext({ sessionStorage: { getItem: key => sessionValues.get(key) || null, setItem: (key,value) => sessionValues.set(key,value), removeItem: key => sessionValues.delete(key) }, navigator: { locks }, crypto: { randomUUID: () => String(++id) }, indexedDB, window: { addEventListener(name, cb) { events[name] = cb; } } });
    const adapter = new vm.SyntheticModule(['createIndexedDbAdapter'], function () {
      this.setExport('createIndexedDbAdapter', options => { state.name = options.databaseName; names.add(state.name); return { close() { state.closed = true; }, async restoreHallapaDbSnapshot(snapshot) { state.restores = (state.restores || 0) + 1; state.snapshot = snapshot; } }; });
    }, { context });
    const mod = new vm.SourceTextModule(source, { context });
    await mod.link(() => adapter); await mod.evaluate(); await flush();
    return { state, api: mod.namespace, close: () => events.pagehide() };
  }
  return { held, deleted, names, load };
}
test('orphan cleanup preserves active tabs, local DB and legacy caches', async () => {
  const f = fixture(), first = await f.load();
  assert.deepEqual(f.deleted, [prefix + 'orphan']);
  const second = await f.load();
  assert.ok(!f.deleted.includes(first.state.name));
  // 강제 종료로 페이지 잠금만 사라지고 DB는 남은 상황을 재현한다.
  f.held.delete(first.state.name);
  const third = await f.load();
  assert.ok(f.deleted.includes(first.state.name));
  assert.ok(!f.deleted.includes(second.state.name));
  for (const name of ['hallapa_db', 'other', 'hallapa_cloud_cache_legacy']) assert.ok(f.names.has(name));
  second.close(); third.close(); await flush();
  assert.ok(second.state.closed);
  assert.ok(!f.held.has(second.state.name));
});
for (const options of [{ unsupported: true }, { enumerationFailure: true }, { lockFailure: true }]) {
  test('unsupported or denied cleanup does not prevent adapter startup ' + JSON.stringify(options), async () => {
    const f = fixture(options), page = await f.load();
    assert.ok(page.state.name);
    assert.deepEqual(f.deleted, []);
    if (options.lockFailure) assert.ok(!page.state.name.startsWith(prefix));
    page.close(); await flush();
  });
}

test('menu return reuses approved unchanged cache; changes, dirty writes and account switches restore it', async () => {
 const f=fixture(), session=new Map();
 const state={revision:7,cursor:17000,snapshot:{stores:{transactions:[{id:1}]}}};
 const first=await f.load(session);
 assert.equal((await first.api.prepareCloudCache(state,'owner')).reused,false);
 assert.equal(first.state.restores,1);
 first.close();await flush();assert(f.names.has(first.state.name));
 const next=await f.load(session);assert.equal(next.state.name,first.state.name);
 assert.equal((await next.api.prepareCloudCache(state,'owner')).reused,true);
 assert.equal(next.state.restores,undefined);
 assert.equal((await next.api.prepareCloudCache({...state,revision:8,cursor:17001},'owner')).reused,false);
 assert.equal(next.state.restores,1);
 next.api.invalidateCloudCache();
 await next.api.prepareCloudCache({...state,revision:8,cursor:17001},'owner');assert.equal(next.state.restores,2);
 await next.api.prepareCloudCache(state,'different-owner');assert.equal(next.state.restores,3);
 next.api.closeCloudCache();await flush();assert(!f.names.has(next.state.name));assert.equal(session.size,0);
});
test('duplicated tabs isolate work caches and missing caches never reuse a ready marker', async () => {
 const f=fixture(),session=new Map(),state={revision:1,cursor:1,snapshot:{stores:{}}};
 const first=await f.load(session);await first.api.prepareCloudCache(state,'owner');
 const second=await f.load(new Map(session));assert.notEqual(second.state.name,first.state.name);
 assert.equal((await second.api.prepareCloudCache(state,'owner')).reused,false);
 first.close();await flush();f.names.delete(first.state.name);
 const next=await f.load(session);f.names.delete(next.state.name);assert.equal((await next.api.prepareCloudCache(state,'owner')).reused,false);
 second.api.closeCloudCache();next.api.closeCloudCache();await flush();
});
