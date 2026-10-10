const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

// In-memory IDB request/transaction model; this is not a browser engine test.
function mockIndexedDb() {
  const databases = new Map(), opened = [];
  let failRead = false, failPut = false;
  function transaction(db) {
    const before = structuredClone(db.stores);
    const tx = { pending: 0, aborted: false, completed: false, error: null };
    function finish() { setImmediate(() => { if (!tx.pending && !tx.aborted && !tx.completed) { tx.completed = true; tx.oncomplete?.(); } }); }
    tx.abort = () => { tx.aborted = true; db.stores = before; tx.error = Error('aborted'); setImmediate(() => tx.onabort?.()); };
    tx.objectStore = name => {
      const data = db.stores.get(name);
      if (!data) throw Error('missing store');
      function request(work) {
        const req = {}; tx.pending++;
        setImmediate(() => {
          if (!tx.aborted) {
            try { req.result = structuredClone(work()); req.onsuccess?.(); }
            catch (error) { req.error = error; req.onerror?.({ preventDefault() {}, stopPropagation() {} }); }
          }
          tx.pending--; finish();
        });
        return req;
      }
      function put(value, add) {
        if (failPut) throw Error('put failed');
        return request(() => {
          const row = structuredClone(value);
          let key = row[data.keyPath];
          if (key == null && data.autoIncrement) key = row[data.keyPath] = ++data.next;
          if (key == null) throw Error('missing key');
          if (add && data.rows.has(key)) throw Error('duplicate key');
          for (const index of data.indexes.values()) {
            const value = row[index.keyPath];
            if (!index.unique || value == null) continue;
            if ([...data.rows.entries()].some(([otherKey, otherRow]) => otherKey !== key && otherRow[index.keyPath] === value)) throw Error('unique index violation');
          }
          data.rows.set(key, row); return key;
        });
      }
      return {
        keyPath: data.keyPath, autoIncrement: data.autoIncrement,
        indexNames: { contains(name) { return data.indexes.has(name); } },
        createIndex(name, keyPath, options = {}) {
          if (data.indexes.has(name)) throw Error('duplicate index');
          data.indexes.set(name, { keyPath, ...options });
        },
        add: value => put(value, true), put: value => put(value, false),
        get: key => request(() => data.rows.get(key)),
        getAll() { if (failRead) throw Error('read failed'); return request(() => [...data.rows.values()]); },
        clear: () => request(() => data.rows.clear()),
        delete: key => request(() => data.rows.delete(key)), count: () => request(() => data.rows.size),
      };
    };
    finish(); return tx;
  }
  function seed(name, version, stores = {}) {
    const db = { version, stores: new Map(), closed: false, close() { this.closed = true; } };
    Object.defineProperty(db, 'objectStoreNames', { get() { const names = [...db.stores.keys()]; names.contains = name => db.stores.has(name); return names; } });
    db.transaction = () => transaction(db);
    for (const [storeName, options] of Object.entries(stores)) {
      const keyPath = options.keyPath;
      db.stores.set(storeName, { keyPath, autoIncrement: !!options.autoIncrement, next: 0, indexes: new Map(), rows: new Map((options.rows || []).map(row => [row[keyPath], structuredClone(row)])) });
    }
    databases.set(name, db);
    return db;
  }
  return {
    databases, opened, seed, setFailRead(value) { failRead = value; }, setFailPut(value) { failPut = value; },
    open(name, version = 1) {
      opened.push(name); const req = {};
      setImmediate(() => {
        let db = databases.get(name);
        const oldVersion = db?.version ?? 0;
        if (!db) db = seed(name, 0);
        req.result = db;
        if (oldVersion > version) { req.error = Error('VersionError'); req.onerror?.(); return; }
        if (oldVersion === version) { req.onsuccess?.(); return; }
        req.transaction = transaction(db);
        db.createObjectStore = (name, options) => {
          if (db.stores.has(name)) throw Error('duplicate store');
          db.stores.set(name, { ...options, next: 0, rows: new Map(), indexes: new Map() });
          return req.transaction.objectStore(name);
        };
        // Open resolves only after asynchronous upgrade requests complete.
        req.transaction.oncomplete = () => { db.version = version; req.onsuccess?.(); };
        req.transaction.onabort = () => { req.error = req.transaction.error; req.onerror?.(); };
        try { req.onupgradeneeded?.({ target: req, oldVersion, newVersion: version }); }
        catch (error) { req.transaction.abort(); }
      });
      return req;
    },
  };
}

(async () => {
  const indexedDB = mockIndexedDb();
  const context = vm.createContext({ indexedDB, console, setTimeout, clearTimeout, structuredClone });
  const module = new vm.SourceTextModule(fs.readFileSync('js/indexeddb-adapter.js', 'utf8'), { context });
  await module.link(() => {}); await module.evaluate();
  const create = module.namespace.createIndexedDbAdapter;
  const events = [];
  const local = create({ emitAppEvent: (...args) => events.push(args) });
  const cloud = create({ databaseName: 'cloud-one', reuseConnection: true, includeSalesQuotes: true, strictSnapshotErrors: true });
  const other = create({ databaseName: 'cloud-two', reuseConnection: true, includeSalesQuotes: true, strictSnapshotErrors: true });
  await local.addTransaction({ id: 10, amount: 100 });
  await cloud.addTransaction({ id: 20, amount: 200 });
  assert.equal((await local.getTransactions())[0].amount, 100);
  assert.equal((await cloud.getTransactionById(20)).amount, 200);
  assert.equal((await other.getTransactions()).length, 0, 'separate cache does not see another cache');
  const snapshot = await cloud.exportHallapaDbSnapshot();
  assert.equal(snapshot.meta.dbName, 'hallapa_db', 'backup identity is preserved');
  assert.ok(Array.isArray(snapshot.stores.sales_quotes));
  const localSnapshot = await local.exportHallapaDbSnapshot();
  assert.equal(localSnapshot.stores.sales_quotes, undefined, 'legacy schema is not silently expanded');
  snapshot.stores.sales_quotes = [{ id: 'q1', value: 'keep' }];
  await other.restoreHallapaDbSnapshot(snapshot);
  assert.equal((await other.exportHallapaDbSnapshot()).stores.sales_quotes[0].value, 'keep');
  assert.equal((await other.getTransactions())[0].amount, 200);
  const opens = indexedDB.opened.filter(name => name === 'cloud-one').length;
  await cloud.getTransactions(); assert.equal(indexedDB.opened.filter(name => name === 'cloud-one').length, opens, 'cache reuses its connection');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(events.length, 1, 'local change emits event; cache writes do not');
  const chunked = create({ databaseName: 'cloud-chunked', reuseConnection: true, strictSnapshotErrors: true, snapshotWriteBatchSize: 250 });
  const large = structuredClone(snapshot);
  large.stores.transactions = Array.from({length: 1700}, (_, id) => ({ id: id + 1, amount: id }));
  const progress = [];
  await chunked.restoreHallapaDbSnapshot(large, { onProgress: detail => progress.push(detail) });
  assert.equal(progress[0].completed, 0);
  assert(progress.length > 7, "report actual completed batches");
  assert.equal(progress.at(-1).completed, progress.at(-1).total);
  assert(progress.every((p, i) => !i || p.completed >= progress[i - 1].completed));
  const chunkRows = await chunked.getTransactions();
  assert.equal(chunkRows.length, 1700, 'all restoration batches finish before ready');
  assert.equal(chunkRows[1699].amount, 1699, 'last batch is retained in the same transaction');
  await chunked.restoreHallapaDbSnapshot(snapshot);
  assert.equal((await chunked.getTransactions()).length, 1, 'clear-first overwrite removes all prior batches');
  await cloud.putLedgerTx({id:7,amount:100});
  await cloud.putLedgerTx({id:'7',amount:200});
  await cloud.saveTransactionBatch({remove:['20'],removeLedger:['7'],add:[{id:30,amount:300}]});
  assert.equal(await cloud.getTransactionById(20),null);
  assert.equal((await cloud.getTransactionById(30)).amount,300);
  assert.equal((await cloud.getAllLedgerTx()).length,0,'mixed-key linked ledger rows deleted');
  await cloud.putLedgerTx({id:'keep',amount:400});
  await assert.rejects(cloud.saveTransactionBatch({remove:[30],removeLedger:['keep'],add:[{id:99},{id:99}]}));
  assert.equal((await cloud.getTransactionById(30)).amount,300,'failed batch restores deleted transaction');
  assert.equal((await cloud.getLedgerTxById('keep')).amount,400,'failed batch restores linked ledger');
  assert.equal(await cloud.getTransactionById(99),null,'failed batch removes partial additions');
  indexedDB.setFailRead(true);
  await assert.rejects(cloud.exportHallapaDbSnapshot(), /read failed/);
  assert.equal((await local.exportHallapaDbSnapshot()).stores.transactions.length, 0, 'legacy read-error policy retained');
  indexedDB.setFailRead(false);
  indexedDB.setFailPut(true);
  await assert.rejects(other.restoreHallapaDbSnapshot(snapshot), /put failed/);
  indexedDB.setFailPut(false);
  assert.equal((await other.getTransactions())[0].amount, 200, 'aborted overwrite keeps previous state');
  cloud.close(); assert.ok(indexedDB.databases.get('cloud-one').closed);
  console.log('PASS: isolated stores, unchanged backup identity, quotes preserved, connection reuse, local-only events, error policies and abort');
})().catch(error => { console.error(error); process.exitCode = 1; });

async function createMigrationFixture(version, stores = {}) {
  const indexedDB = mockIndexedDb();
  const name = 'migration-case';
  if (version != null) indexedDB.seed(name, version, stores);
  const context = vm.createContext({ indexedDB, console, setTimeout, clearTimeout, structuredClone });
  const module = new vm.SourceTextModule(fs.readFileSync('js/indexeddb-adapter.js', 'utf8'), { context });
  await module.link(() => {}); await module.evaluate();
  const adapter = module.namespace.createIndexedDbAdapter({ databaseName: name, reuseConnection: true });
  await adapter.getTransactions();
  const db = indexedDB.databases.get(name);
  return { adapter, db, rows: store => [...db.stores.get(store).rows.values()] };
}
test('fresh version 0 creates default masters and unique fingerprint index', async () => {
  const f = await createMigrationFixture(null);
  assert.equal(f.db.version, 13);
  assert.equal(f.rows('customer_groups').find(row => row.code === '001').type, '매출처');
  assert.equal(f.rows('cashflow_types').length, 5);
  assert.equal(f.rows('cashflow_items').length, 5);
  assert.equal(f.db.stores.get('ledger_tx').indexes.get('fingerprint').unique, true);
});
for (const version of [3, 4]) {
  test('customer group type migration boundary at oldVersion ' + version, async () => {
    const f = await createMigrationFixture(version, { customer_groups: { keyPath: 'code', rows: [
      { code: '1', name: '식당' }, { code: '2', name: '야채' }, { code: '3', name: '급여' },
      { code: '4', name: '사용자분류' }, { code: '5', name: '식당', type: '사용자구분' },
    ] } });
    const rows = f.rows('customer_groups');
    assert.deepEqual(rows.slice(0, 4).map(row => row.type), version < 4 ? ['매출처', '매입처', '지출처', ''] : [undefined, undefined, undefined, undefined]);
    assert.equal(rows[4].type, '사용자구분');
  });
}
for (const version of [9, 10]) {
  test('direction-only items migrate to groups boundary at oldVersion ' + version, async () => {
    const f = await createMigrationFixture(version, {
      cashflow_items: { keyPath: 'code', rows: [
        { code: 'A100', name: '이전분류', direction: 'out', memo: '메모' },
        { code: 'A101', name: '기존분류', direction: 'in' },
        { code: 'A0001', name: '통장', typeCode: 'A01' },
      ] },
      cashflow_groups: { keyPath: 'code', rows: [{ code: 'A101', name: '사용자이름', direction: 'out' }] },
    });
    const migrated = f.rows('cashflow_groups').find(row => row.code === 'A100');
    assert.equal(!!migrated, version < 10);
    if (migrated) assert.deepEqual(migrated, { code: 'A100', name: '이전분류', direction: 'out', memo: '메모' });
    assert.equal(f.rows('cashflow_groups').find(row => row.code === 'A101').name, '사용자이름');
    assert.equal(f.rows('cashflow_items').some(row => row.code === 'A100'), version >= 10);
    assert.equal(f.rows('cashflow_items').some(row => row.code === 'A101'), version >= 10);
    assert.ok(f.rows('cashflow_items').some(row => row.code === 'A0001'));
  });
}
for (const ledgerOccupied of [false, true]) {
  test('v11 defaults correction preserves names when ledger has data: ' + ledgerOccupied, async () => {
    const f = await createMigrationFixture(11, {
      cashflow_types: { keyPath: 'code', rows: [{ code: 'A01', name: '사용자통장' }, { code: 'A02', name: '신용카드' }, { code: 'A03', name: '현금' }] },
      cashflow_items: { keyPath: 'code', rows: [{ code: 'A0004', name: '현금', typeCode: 'A04' }] },
      ledger_tx: { keyPath: 'id', rows: ledgerOccupied ? [{ id: 'existing', amount: 100 }] : [] },
    });
    assert.equal(f.rows('cashflow_types').length, 5);
    assert.equal(f.rows('cashflow_types').find(row => row.code === 'A03').name, ledgerOccupied ? '현금' : '체크카드');
    assert.equal(f.rows('cashflow_types').find(row => row.code === 'A01').name, ledgerOccupied ? '사용자통장' : '법인통장');
    assert.equal(f.rows('ledger_tx').length, ledgerOccupied ? 1 : 0);
  });
}
test('v11 adds missing defaults without replacing custom names outside legacy-three condition', async () => {
  const f = await createMigrationFixture(11, { cashflow_types: { keyPath: 'code', rows: [{ code: 'A01', name: '맞춤통장' }] } });
  assert.equal(f.rows('cashflow_types').length, 5);
  assert.equal(f.rows('cashflow_types').find(row => row.code === 'A01').name, '맞춤통장');
});
test('v12 adds unique fingerprint index without rerunning earlier migrations', async () => {
  const f = await createMigrationFixture(12, {
    cashflow_types: { keyPath: 'code', rows: [{ code: 'A01', name: '맞춤통장' }] },
    ledger_tx: { keyPath: 'id', rows: [{ id: 'existing', fingerprint: 'fp-1', amount: 300 }] },
  });
  const index = f.db.stores.get('ledger_tx').indexes.get('fingerprint');
  assert.deepEqual(index, { keyPath: 'fingerprint', unique: true });
  assert.equal(f.rows('cashflow_types').length, 1);
  await assert.rejects(f.adapter.putLedgerTx({ id: 'duplicate', fingerprint: 'fp-1' }), /unique index violation/);
  await f.adapter.putLedgerTx({ id: 'new', fingerprint: 'fp-2' });
  assert.equal(f.rows('ledger_tx').find(row => row.id === 'existing').amount, 300);
  assert.equal(f.rows('ledger_tx').length, 2);
});
