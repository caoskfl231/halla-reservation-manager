const emitAppEvent = () => {};
const CACHE_NAME = "hallapa_cloud_cache_" + crypto.randomUUID();
let cacheConnection;
export function closeCloudCache() {
  if (cacheConnection) cacheConnection.close();
  indexedDB.deleteDatabase(CACHE_NAME);
}
window.addEventListener("pagehide", closeCloudCache);

const DEFAULT_CASHFLOW_TYPES = [
  { code: "A01", name: "법인통장" },
  { code: "A02", name: "신용카드" },
  { code: "A03", name: "체크카드" },
  { code: "A04", name: "현금" },
  { code: "A05", name: "미수금" },
];

const DEFAULT_CASHFLOW_ITEMS = [
  {
    code: "A0001",
    name: "법인통장",
    typeCode: "A01",
    openingBalance: 0,
    memo: "",
  },
  {
    code: "A0002",
    name: "신용카드",
    typeCode: "A02",
    openingBalance: 0,
    memo: "",
  },
  {
    code: "A0003",
    name: "체크카드",
    typeCode: "A03",
    openingBalance: 0,
    memo: "",
  },
  { code: "A0004", name: "현금", typeCode: "A04", openingBalance: 0, memo: "" },
  {
    code: "A0005",
    name: "미수금",
    typeCode: "A05",
    openingBalance: 0,
    memo: "",
  },
];

const DEFAULT_CASHFLOW_GROUPS = [
  { code: "A001", name: "고정비", direction: "out" },
  { code: "A002", name: "변동비", direction: "out" },
  { code: "A003", name: "기타수입", direction: "in" },
];

// [임시] 마스터 데이터 강제 삽입 유틸 (개발용, 필요시 수동 호출)
export async function ensureDefaultCashflowMasters() {
  const db = await openDb();
  const waitTx = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  // cashflow_types
  const tx1 = db.transaction("cashflow_types", "readwrite");
  const store1 = tx1.objectStore("cashflow_types");
  DEFAULT_CASHFLOW_TYPES.forEach((t) => store1.put(t));
  await waitTx(tx1);

  // cashflow_items (예시)
  const tx2 = db.transaction("cashflow_items", "readwrite");
  const store2 = tx2.objectStore("cashflow_items");
  DEFAULT_CASHFLOW_ITEMS.forEach((i) => store2.put(i));
  await waitTx(tx2);

  // cashflow_groups (예시)
  const tx3 = db.transaction("cashflow_groups", "readwrite");
  const store3 = tx3.objectStore("cashflow_groups");
  DEFAULT_CASHFLOW_GROUPS.forEach((g) => store3.put(g));
  await waitTx(tx3);
  return true;
}

async function ensureCashflowMastersIfEmpty() {
  // 기본 마스터 자동 주입은 운영 환경에서 데이터 혼입 위험이 있어 비활성화.
  // 필요 시 개발/관리자 기능에서 ensureDefaultCashflowMasters()를 수동 호출하세요.
  return false;
}
// IndexedDB 기반 간단 DB 모듈

const DB_NAME = "hallapa_db";
const DB_VERSION = 13;
const STORE_TRANSACTIONS = "transactions";
const STORE_USERS = "users";
const STORE_CUSTOMERS = "customers";
const STORE_ITEMS = "items";
const STORE_CUSTOMER_TYPES = "customer_types";
const STORE_CUSTOMER_GROUPS = "customer_groups";
const STORE_ITEM_GROUPS = "item_groups";
const STORE_CASHFLOW_ITEMS = "cashflow_items";
const STORE_CASHFLOW_TYPES = "cashflow_types";
const STORE_CASHFLOW_GROUPS = "cashflow_groups";
const STORE_LEDGER_TX = "ledger_tx";

let _dbChangedTimer = null;
const _dbChangedStores = new Set();

function queueDbChanged(storeName) {
  if (storeName) _dbChangedStores.add(String(storeName));

  if (_dbChangedTimer) return;
  _dbChangedTimer = setTimeout(() => {
    _dbChangedTimer = null;
    const stores = Array.from(_dbChangedStores);
    _dbChangedStores.clear();
    try {
      emitAppEvent("db:changed", { stores });
    } catch (_) {
      // ignore
    }
  }, 0);
}

function openDb() {
  if (cacheConnection) return Promise.resolve(cacheConnection);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion || 0;
      if (!db.objectStoreNames.contains('sales_quotes')) {
        db.createObjectStore('sales_quotes', { keyPath:'id' });
      }

      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        db.createObjectStore(STORE_TRANSACTIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
        db.createObjectStore(STORE_CUSTOMERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOMER_TYPES)) {
        const store = db.createObjectStore(STORE_CUSTOMER_TYPES, {
          keyPath: "code",
        });
        // 기본 구분 코드: 01=매출처, 02=매입처, 03=지출처
        store.add({ code: "01", name: "매출처" });
        store.add({ code: "02", name: "매입처" });
        store.add({ code: "03", name: "지출처" });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOMER_GROUPS)) {
        const gstore = db.createObjectStore(STORE_CUSTOMER_GROUPS, {
          keyPath: "code",
        });
        // 기본 분류 코드: 001~009 (각각 적용 구분 포함)
        gstore.add({ code: "001", name: "식당", type: "매출처" });
        gstore.add({ code: "002", name: "매장", type: "매출처" });
        gstore.add({ code: "003", name: "온라인", type: "매출처" });
        gstore.add({ code: "004", name: "정육", type: "매입처" });
        gstore.add({ code: "005", name: "기타식품", type: "매입처" });
        gstore.add({ code: "006", name: "야채", type: "매입처" });
        gstore.add({ code: "007", name: "가게경비", type: "지출처" });
        gstore.add({ code: "008", name: "고정경비", type: "지출처" });
        gstore.add({ code: "009", name: "급여", type: "지출처" });
      } else if (oldVersion < 4) {
        // 기존 분류 스토어에 type 필드가 없다면 이름 기준으로 기본 매핑 추가
        const tx = event.target.transaction;
        const gstore = tx.objectStore(STORE_CUSTOMER_GROUPS);
        const req = gstore.getAll();
        req.onsuccess = () => {
          const all = req.result || [];
          all.forEach((g) => {
            if (g.type) return;
            let t = "";
            switch (g.name) {
              case "식당":
              case "매장":
              case "온라인":
                t = "매출처";
                break;
              case "정육":
              case "기타식품":
              case "야채":
                t = "매입처";
                break;
              case "가게경비":
              case "고정경비":
              case "급여":
                t = "지출처";
                break;
              default:
                // 사용자가 추가한 분류는 전체 구분에서 사용 가능하도록 빈 값 유지
                t = "";
                break;
            }
            g.type = t;
            gstore.put(g);
          });
        };
      }

      // 품목 분류 스토어 (코드 00001~)
      if (!db.objectStoreNames.contains(STORE_ITEM_GROUPS)) {
        const ig = db.createObjectStore(STORE_ITEM_GROUPS, { keyPath: "code" });
        // 기본 품목 분류: items.json 기준
        ig.add({ code: "00001", name: "한돈" });
        ig.add({ code: "00002", name: "한우" });
        ig.add({ code: "00003", name: "야채" });
        ig.add({ code: "00004", name: "부가상품" });
        ig.add({ code: "00005", name: "정육부품" });
      }

      // 입출금 계정 항목 스토어 (코드 A0001~)
      if (!db.objectStoreNames.contains(STORE_CASHFLOW_ITEMS)) {
        const cf = db.createObjectStore(STORE_CASHFLOW_ITEMS, {
          keyPath: "code",
        });
        // 기본 계정 항목
        DEFAULT_CASHFLOW_ITEMS.forEach((row) => cf.add(row));
      }

      // 입출금 구분 스토어 (코드 A01~)
      if (!db.objectStoreNames.contains(STORE_CASHFLOW_TYPES)) {
        const ct = db.createObjectStore(STORE_CASHFLOW_TYPES, {
          keyPath: "code",
        });
        // 기본 구분 코드 (items의 typeCode와 의미를 맞춘다)
        DEFAULT_CASHFLOW_TYPES.forEach((row) => ct.add(row));
      }

      // 입출금 분류 스토어 (코드 A001~)
      if (!db.objectStoreNames.contains(STORE_CASHFLOW_GROUPS)) {
        const cg = db.createObjectStore(STORE_CASHFLOW_GROUPS, {
          keyPath: "code",
        });
        // 기본 분류 코드
        DEFAULT_CASHFLOW_GROUPS.forEach((row) => cg.add(row));
      }

      // 통합결제/입출금 원장(ledger)용 스토어
      if (!db.objectStoreNames.contains(STORE_LEDGER_TX)) {
        const lt = db.createObjectStore(STORE_LEDGER_TX, { keyPath: "id" });
        lt.createIndex("date", "date", { unique: false });
        lt.createIndex("paymentMethod", "paymentMethod", { unique: false });
        lt.createIndex("accountId", "accountId", { unique: false });
      }

      if (oldVersion < 10) {
        const tx = event.target.transaction;
        const itemStore = tx.objectStore(STORE_CASHFLOW_ITEMS);
        const groupStore = tx.objectStore(STORE_CASHFLOW_GROUPS);

        const itemsReq = itemStore.getAll();
        itemsReq.onsuccess = () => {
          const items = itemsReq.result || [];
          const groupsReq = groupStore.getAll();
          groupsReq.onsuccess = () => {
            const groups = groupsReq.result || [];
            const groupCodes = new Set(
              groups.map((g) => String(g?.code || "")),
            );

            items.forEach((it) => {
              const hasTypeCode = !!it?.typeCode;
              const hasDirection = !!it?.direction;
              const code = String(it?.code || "");
              if (!code) return;

              if (!hasTypeCode && hasDirection) {
                if (!groupCodes.has(code)) {
                  groupStore.put({
                    code,
                    name: it?.name || "",
                    direction: it?.direction || "",
                    memo: it?.memo || "",
                  });
                  groupCodes.add(code);
                }
                itemStore.delete(code);
              }
            });
          };
        };
      }

      // v12: cashflow_types 기본 코드 누락/불일치 보완
      // - 운영 중 사용자가 수정한 타입명은 최대한 건드리지 않는다.
      // - 단, ledger_tx가 비어 있고 타입 구성이 "기본 3개(A01/A02/A03)" 형태면 DEFAULT_CASHFLOW_TYPES로 정리한다.
      if (oldVersion < 12) {
        const tx = event.target.transaction;
        try {
          const typeStore = tx.objectStore(STORE_CASHFLOW_TYPES);
          const itemStore = tx.objectStore(STORE_CASHFLOW_ITEMS);
          const ledgerStore = tx.objectStore(STORE_LEDGER_TX);

          const ledgerCountReq = ledgerStore.count();
          ledgerCountReq.onsuccess = () => {
            const ledgerCount = Number(ledgerCountReq.result || 0) || 0;

            const typesReq = typeStore.getAll();
            typesReq.onsuccess = () => {
              const types = typesReq.result || [];

              const itemsReq = itemStore.getAll();
              itemsReq.onsuccess = () => {
                const items = itemsReq.result || [];

                const byCode = new Map(
                  (types || []).map((t) => [String(t?.code || ""), t]),
                );

                // 최소 보완: 누락된 타입코드는 추가만 한다(기존 이름은 유지)
                DEFAULT_CASHFLOW_TYPES.forEach((row) => {
                  const code = String(row?.code || "");
                  if (!code) return;
                  if (!byCode.has(code)) typeStore.put(row);
                });

                // 안전 조건: ledger_tx가 비어 있고, 타입이 A01/A02/A03만 있으며,
                // A03이 "현금"으로 들어가 있는(과거 기본 시드 버그) 경우에만 DEFAULT로 정리한다.
                if (ledgerCount > 0) return;

                const typeCodes = Array.from(byCode.keys()).filter(Boolean);
                const onlyLegacy3 =
                  typeCodes.length === 3 &&
                  typeCodes.includes("A01") &&
                  typeCodes.includes("A02") &&
                  typeCodes.includes("A03");
                const a03Name = String(byCode.get("A03")?.name || "");

                // items에 A04/A05가 존재하면, DEFAULT 체계를 쓰는 환경일 가능성이 높다.
                const itemTypeCodes = new Set(
                  (items || [])
                    .map((it) => String(it?.typeCode || ""))
                    .filter(Boolean),
                );
                const looksLikeDefaultSet =
                  itemTypeCodes.has("A04") || itemTypeCodes.has("A05");

                if (onlyLegacy3 && a03Name === "현금" && looksLikeDefaultSet) {
                  DEFAULT_CASHFLOW_TYPES.forEach((row) => typeStore.put(row));
                }
              };
            };
          };
        } catch (_) {
          // 마이그레이션 실패 시에도 앱이 계속 동작하도록 조용히 무시
        }
      }

      // v13: ledger_tx 중복 저장 최종 방어용 fingerprint 유니크 인덱스 추가
      if (oldVersion < 13) {
        const tx = event.target.transaction;
        try {
          const ledgerStore = tx.objectStore(STORE_LEDGER_TX);
          // 이미 존재하면 재생성하지 않는다.
          if (!ledgerStore.indexNames.contains('fingerprint')) {
            ledgerStore.createIndex('fingerprint', 'fingerprint', { unique: true });
          }
        } catch (_) {
          // 마이그레이션 실패 시에도 앱이 계속 동작하도록 조용히 무시
        }
      }
    };

    request.onsuccess = () => {
      cacheConnection = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function addItem(storeName, item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.add(item);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearAllTransactions() {
  await clearStore(STORE_TRANSACTIONS);
}

// 통합결제 / 입출금 원장(ledger_tx) 관련
async function getAllLedgerTx() {
  return getAll(STORE_LEDGER_TX);
}

async function putLedgerTx(tx) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_LEDGER_TX, "readwrite");
    const store = t.objectStore(STORE_LEDGER_TX);
    const request = store.put(tx);
    request.onsuccess = () => {
      queueDbChanged(STORE_LEDGER_TX);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function getLedgerTxById(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_LEDGER_TX, "readonly");
    const store = t.objectStore(STORE_LEDGER_TX);
    // 레거시 DB 마이그레이션 데이터는 id가 숫자일 수 있으므로,
    // 전달된 id 타입 그대로 우선 조회한다.
    const key = typeof id === "number" ? id : String(id);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteLedgerTxById(id) {
  if (!id) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_LEDGER_TX, "readwrite");
    const store = t.objectStore(STORE_LEDGER_TX);
    // key 타입(숫자/문자)와 무관하게, id 필드 값이
    // 전달된 id와 같은 모든 레코드를 커서로 찾아 삭제한다.
    const targetId = String(id);
    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const value = cursor.value || {};
      if (String(value.id) === targetId) {
        cursor.delete();
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    t.oncomplete = () => {
      queueDbChanged(STORE_LEDGER_TX);
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}

async function clearAllLedgerTx() {
  await clearStore(STORE_LEDGER_TX);
}

// 거래 관련
async function getTransactions() {
  return getAll(STORE_TRANSACTIONS);
}

async function getTransactionById(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TRANSACTIONS, 'readonly');
    const request = transaction.objectStore(STORE_TRANSACTIONS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function getCustomerById(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMERS, "readonly");
    const store = tx.objectStore(STORE_CUSTOMERS);
    const key = String(id);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function shouldAutoFillSupplierName(currentName, supplierId) {
  const name = String(currentName || "").trim();
  const id = String(supplierId || "").trim();
  if (!id) return false;
  if (!name) return true;
  if (name === id) return true;
  // 이름 자리에 코드(숫자만)가 들어간 레거시 데이터 보정
  if (/^\d+$/.test(name)) return true;
  return false;
}

async function normalizeTransactionSupplierName(tx) {
  if (!tx) return tx;
  const supplierId = tx.supplierId;
  if (!supplierId) return tx;
  if (!shouldAutoFillSupplierName(tx.supplierName, supplierId)) return tx;

  try {
    const cust = await getCustomerById(supplierId);
    if (cust && cust.name) {
      tx.supplierName = cust.name;
    }
  } catch (_) {
    // ignore
  }
  return tx;
}

async function addTransaction(tx) {
  await normalizeTransactionSupplierName(tx);
  await addItem(STORE_TRANSACTIONS, tx);
  queueDbChanged(STORE_TRANSACTIONS);
}

async function saveTransactionBatch({ add = [], remove = [] } = {}) {
  for (const id of remove) await deleteTransaction(id);
  for (const row of add) await addTransaction(row);
}

async function updateTransaction(tx) {
  await normalizeTransactionSupplierName(tx);
  if (tx && tx.id != null) {
    const raw = String(tx.id).trim();
    if (raw && /^\d+$/.test(raw)) {
      tx.id = Number(raw);
    }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TRANSACTIONS, "readwrite");
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    const request = store.put(tx);
    request.onsuccess = () => {
      queueDbChanged(STORE_TRANSACTIONS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteTransaction(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_TRANSACTIONS, "readwrite");
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    let key = id;
    if (key != null) {
      const raw = String(key).trim();
      if (raw && /^\d+$/.test(raw)) key = Number(raw);
    }
    const request = store.delete(key);
    request.onsuccess = () => {
      queueDbChanged(STORE_TRANSACTIONS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 사용자 관련
async function getUsers() {
  return getAll(STORE_USERS);
}

async function addUser(user) {
  await addItem(STORE_USERS, user);
}

// 거래처 관련 (매출처/매입처/지출처 포함)
async function getCustomers() {
  return getAll(STORE_CUSTOMERS);
}

async function addCustomer(customer) {
  await addItem(STORE_CUSTOMERS, customer);
  queueDbChanged(STORE_CUSTOMERS);
}

async function updateCustomer(customer) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMERS, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMERS);
    const request = store.put(customer);

    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMERS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCustomer(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMERS, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMERS);
    const request = store.delete(id);

    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMERS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function bulkInsertCustomers(list) {
  const db = await openDb();
  const rows = Array.isArray(list) ? list : [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMERS, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMERS);

    try {
      store.clear();
    } catch (_) {}

    rows.forEach((c) => {
      try {
        store.put(c);
      } catch (_) {}
    });

    tx.oncomplete = () => {
      queueDbChanged(STORE_CUSTOMERS);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function bulkReplaceStore(storeName, list) {
  const db = await openDb();
  const rows = Array.isArray(list) ? list : [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    try {
      store.clear();
    } catch (_) {}

    rows.forEach((row) => {
      try {
        store.put(row);
      } catch (_) {}
    });

    tx.oncomplete = () => {
      queueDbChanged(storeName);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function bulkReplaceCustomerTypes(list) {
  return bulkReplaceStore(STORE_CUSTOMER_TYPES, list);
}

async function bulkReplaceCustomerGroups(list) {
  return bulkReplaceStore(STORE_CUSTOMER_GROUPS, list);
}

async function bulkReplaceCashflowTypes(list) {
  return bulkReplaceStore(STORE_CASHFLOW_TYPES, list);
}

async function bulkReplaceCashflowItems(list) {
  return bulkReplaceStore(STORE_CASHFLOW_ITEMS, list);
}

async function bulkReplaceCashflowGroups(list) {
  return bulkReplaceStore(STORE_CASHFLOW_GROUPS, list);
}

// 거래처 구분 코드 관련
async function getCustomerTypes() {
  return getAll(STORE_CUSTOMER_TYPES);
}

async function addCustomerType(type) {
  await addItem(STORE_CUSTOMER_TYPES, type);
  queueDbChanged(STORE_CUSTOMER_TYPES);
}

async function updateCustomerType(type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMER_TYPES, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMER_TYPES);
    const request = store.put(type);
    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMER_TYPES);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCustomerType(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMER_TYPES, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMER_TYPES);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMER_TYPES);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 거래처 분류 코드 관련
async function getCustomerGroups() {
  return getAll(STORE_CUSTOMER_GROUPS);
}

async function addCustomerGroup(group) {
  await addItem(STORE_CUSTOMER_GROUPS, group);
  queueDbChanged(STORE_CUSTOMER_GROUPS);
}

async function updateCustomerGroup(group) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMER_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMER_GROUPS);
    const request = store.put(group);
    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMER_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCustomerGroup(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CUSTOMER_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_CUSTOMER_GROUPS);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_CUSTOMER_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 거래처 마스터(구분/분류)는 name 문자열을 customers/transactions에 그대로 저장하는 구조다.
// 따라서 name 변경 시 customers/transactions(및 customer_groups.type)까지 같이 치환해 일관성을 유지한다.
async function renameCustomerTypeNameEverywhere(prevName, nextName) {
  const from = String(prevName || "").trim();
  const to = String(nextName || "").trim();
  if (!from) return { customersChanged: 0, groupsChanged: 0, txChanged: 0 };
  if (!to) return { customersChanged: 0, groupsChanged: 0, txChanged: 0 };
  if (from === to) return { customersChanged: 0, groupsChanged: 0, txChanged: 0 };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_CUSTOMERS, STORE_CUSTOMER_GROUPS, STORE_TRANSACTIONS],
      "readwrite",
    );
    const customersStore = tx.objectStore(STORE_CUSTOMERS);
    const groupsStore = tx.objectStore(STORE_CUSTOMER_GROUPS);
    const txStore = tx.objectStore(STORE_TRANSACTIONS);

    let customersChanged = 0;
    let groupsChanged = 0;
    let txChanged = 0;

    const reqCustomers = customersStore.getAll();
    reqCustomers.onerror = () => reject(reqCustomers.error);
    reqCustomers.onsuccess = () => {
      const customers = reqCustomers.result || [];
      customers.forEach((c) => {
        const type = String(c?.type || "").trim();
        if (type !== from) return;
        try {
          customersStore.put({ ...(c || {}), type: to });
          customersChanged += 1;
        } catch (_) {
          // ignore
        }
      });

      const reqGroups = groupsStore.getAll();
      reqGroups.onerror = () => reject(reqGroups.error);
      reqGroups.onsuccess = () => {
        const groups = reqGroups.result || [];
        groups.forEach((g) => {
          const t = String(g?.type || "").trim();
          if (t !== from) return;
          try {
            groupsStore.put({ ...(g || {}), type: to });
            groupsChanged += 1;
          } catch (_) {
            // ignore
          }
        });

        const reqTx = txStore.getAll();
        reqTx.onerror = () => reject(reqTx.error);
        reqTx.onsuccess = () => {
          const rows = reqTx.result || [];
          rows.forEach((row) => {
            const supplierType = String(row?.supplierType || "").trim();
            if (supplierType !== from) return;
            try {
              txStore.put({ ...(row || {}), supplierType: to });
              txChanged += 1;
            } catch (_) {
              // ignore
            }
          });

          tx.oncomplete = () => {
            if (customersChanged > 0) queueDbChanged(STORE_CUSTOMERS);
            if (groupsChanged > 0) queueDbChanged(STORE_CUSTOMER_GROUPS);
            if (txChanged > 0) queueDbChanged(STORE_TRANSACTIONS);
            resolve({ customersChanged, groupsChanged, txChanged });
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
      };
    };
  });
}

async function renameCustomerGroupNameEverywhere(prevName, nextName) {
  const from = String(prevName || "").trim();
  const to = String(nextName || "").trim();
  if (!from) return { customersChanged: 0, txChanged: 0 };
  if (!to) return { customersChanged: 0, txChanged: 0 };
  if (from === to) return { customersChanged: 0, txChanged: 0 };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CUSTOMERS, STORE_TRANSACTIONS], "readwrite");
    const customersStore = tx.objectStore(STORE_CUSTOMERS);
    const txStore = tx.objectStore(STORE_TRANSACTIONS);

    let customersChanged = 0;
    let txChanged = 0;

    const reqCustomers = customersStore.getAll();
    reqCustomers.onerror = () => reject(reqCustomers.error);
    reqCustomers.onsuccess = () => {
      const customers = reqCustomers.result || [];
      customers.forEach((c) => {
        const group = String(c?.group || "").trim();
        if (group !== from) return;
        try {
          customersStore.put({ ...(c || {}), group: to });
          customersChanged += 1;
        } catch (_) {
          // ignore
        }
      });

      const reqTx = txStore.getAll();
      reqTx.onerror = () => reject(reqTx.error);
      reqTx.onsuccess = () => {
        const rows = reqTx.result || [];
        rows.forEach((row) => {
          const supplierGroup = String(row?.supplierGroup || "").trim();
          if (supplierGroup !== from) return;
          try {
            txStore.put({ ...(row || {}), supplierGroup: to });
            txChanged += 1;
          } catch (_) {
            // ignore
          }
        });

        tx.oncomplete = () => {
          if (customersChanged > 0) queueDbChanged(STORE_CUSTOMERS);
          if (txChanged > 0) queueDbChanged(STORE_TRANSACTIONS);
          resolve({ customersChanged, txChanged });
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
    };
  });
}

// 품목 관련
async function getItems() {
  return getAll(STORE_ITEMS);
}

async function addItemMaster(item) {
  await addItem(STORE_ITEMS, item);
  queueDbChanged(STORE_ITEMS);
}

async function updateItem(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    const request = store.put(item);

    request.onsuccess = () => {
      queueDbChanged(STORE_ITEMS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 품목 코드(id)는 STORE_ITEMS의 keyPath이므로 단순 put으로는 "코드 변경"이 불가능하다.
// 코드 변경(키 변경)이 필요할 때는 신규 키로 저장 후 기존 키를 삭제하고,
// 거래내역(STORE_TRANSACTIONS)의 itemId/itemCode도 함께 치환한다.
async function renameItem(oldId, nextItem) {
  const prevId = String(oldId || "").trim();
  const newId = String(nextItem?.id || "").trim();
  if (!prevId) throw new Error("renameItem: oldId is required");
  if (!newId) throw new Error("renameItem: nextItem.id is required");

  // 동일 코드면 일반 업데이트로 처리
  if (prevId === newId) {
    await updateItem({ ...(nextItem || {}), id: prevId });
    return;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ITEMS, STORE_TRANSACTIONS], "readwrite");
    const itemsStore = tx.objectStore(STORE_ITEMS);
    const txStore = tx.objectStore(STORE_TRANSACTIONS);

    const reqPrev = itemsStore.get(prevId);
    reqPrev.onerror = () => reject(reqPrev.error);
    reqPrev.onsuccess = () => {
      const prevItem = reqPrev.result;
      if (!prevItem) {
        reject(new Error("기존 품목을 찾지 못했습니다."));
        try {
          tx.abort();
        } catch (_) {}
        return;
      }

      const reqNext = itemsStore.get(newId);
      reqNext.onerror = () => reject(reqNext.error);
      reqNext.onsuccess = () => {
        if (reqNext.result) {
          reject(new Error("이미 사용 중인 코드입니다."));
          try {
            tx.abort();
          } catch (_) {}
          return;
        }

        // 1) 신규 코드로 저장
        const putReq = itemsStore.put({ ...(nextItem || {}), id: newId });
        putReq.onerror = () => reject(putReq.error);
        putReq.onsuccess = () => {
          // 2) 기존 코드 삭제
          const delReq = itemsStore.delete(prevId);
          delReq.onerror = () => reject(delReq.error);
          delReq.onsuccess = () => {
            // 3) 거래내역의 itemId/itemCode 치환
            try {
              const cursorReq = txStore.openCursor();
              cursorReq.onerror = () => reject(cursorReq.error);
              cursorReq.onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (!cursor) {
                  return;
                }
                const row = cursor.value;
                const rowItemId = String(row?.itemId || "").trim();
                const rowItemCode = String(row?.itemCode || "").trim();

                let changed = false;
                if (rowItemId && rowItemId === prevId) {
                  row.itemId = newId;
                  changed = true;
                }
                if (rowItemCode && rowItemCode === prevId) {
                  row.itemCode = newId;
                  changed = true;
                }

                if (!changed) {
                  cursor.continue();
                  return;
                }

                const updateReq = cursor.update(row);
                updateReq.onerror = () => reject(updateReq.error);
                updateReq.onsuccess = () => cursor.continue();
              };
            } catch (err) {
              reject(err);
            }
          };
        };
      };
    };

    tx.oncomplete = () => {
      queueDbChanged(STORE_ITEMS);
      queueDbChanged(STORE_TRANSACTIONS);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deleteItem(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    const request = store.delete(id);

    request.onsuccess = () => {
      queueDbChanged(STORE_ITEMS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function bulkInsertItems(list) {
  const db = await openDb();
  const rows = Array.isArray(list) ? list : [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);

    try {
      store.clear();
    } catch (_) {}

    rows.forEach((it) => {
      try {
        store.put(it);
      } catch (_) {}
    });

    tx.oncomplete = () => {
      queueDbChanged(STORE_ITEMS);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function bulkReplaceItemGroups(list) {
  return bulkReplaceStore(STORE_ITEM_GROUPS, list);
}

// 품목 분류 코드 관련
async function getItemGroups() {
  return getAll(STORE_ITEM_GROUPS);
}

async function addItemGroup(group) {
  await addItem(STORE_ITEM_GROUPS, group);
  queueDbChanged(STORE_ITEM_GROUPS);
}

async function updateItemGroup(group) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEM_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_ITEM_GROUPS);
    const request = store.put(group);
    request.onsuccess = () => {
      queueDbChanged(STORE_ITEM_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteItemGroup(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEM_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_ITEM_GROUPS);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_ITEM_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 품목 마스터에 저장된 분류명(item.group)을 일괄 치환
async function renameItemGroupNameInItems(prevName, nextName) {
  const from = String(prevName || "").trim();
  const to = String(nextName || "").trim();
  if (!from) return 0;
  if (!to) return 0;
  if (from === to) return 0;

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_ITEMS);

    const reqAll = store.getAll();
    reqAll.onerror = () => reject(reqAll.error);
    reqAll.onsuccess = () => {
      const items = reqAll.result || [];
      let changed = 0;
      items.forEach((it) => {
        const group = String(it?.group || "").trim();
        if (group !== from) return;
        try {
          store.put({ ...(it || {}), group: to });
          changed += 1;
        } catch (_) {
          // ignore
        }
      });

      tx.oncomplete = () => {
        if (changed > 0) queueDbChanged(STORE_ITEMS);
        resolve(changed);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  });
}

// 입출금 구분 코드 관련
async function getCashflowTypes() {
  return getAll(STORE_CASHFLOW_TYPES);
}

async function addCashflowType(type) {
  await addItem(STORE_CASHFLOW_TYPES, type);
  queueDbChanged(STORE_CASHFLOW_TYPES);
}

async function updateCashflowType(type) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_TYPES, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_TYPES);
    const request = store.put(type);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_TYPES);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCashflowType(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_TYPES, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_TYPES);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_TYPES);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 입출금 코드/항목 관련
async function getCashflowItems() {
  return getAll(STORE_CASHFLOW_ITEMS);
}

async function addCashflowItem(item) {
  await addItem(STORE_CASHFLOW_ITEMS, item);
  queueDbChanged(STORE_CASHFLOW_ITEMS);
}

async function updateCashflowItem(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_ITEMS);
    const request = store.put(item);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_ITEMS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCashflowItem(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_ITEMS, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_ITEMS);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_ITEMS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 입출금 분류 코드 관련
async function getCashflowGroups() {
  return getAll(STORE_CASHFLOW_GROUPS);
}

async function addCashflowGroup(group) {
  await addItem(STORE_CASHFLOW_GROUPS, group);
  queueDbChanged(STORE_CASHFLOW_GROUPS);
}

async function updateCashflowGroup(group) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_GROUPS);
    const request = store.put(group);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteCashflowGroup(code) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CASHFLOW_GROUPS, "readwrite");
    const store = tx.objectStore(STORE_CASHFLOW_GROUPS);
    const request = store.delete(code);
    request.onsuccess = () => {
      queueDbChanged(STORE_CASHFLOW_GROUPS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// 레거시 원장 DB(halla_ledger_db_v1)는 더 이상 사용하지 않는다.
// 기존 코드와의 호환성을 위해 함수는 그대로 두되, 아무 작업도 하지 않고 바로 종료한다.
async function migrateLegacyLedgerTxIfNeeded() {
  return;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    if (!request) return resolve(undefined);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===== 전체 백업/복구 (운영용) =====
// - 같은 DB(hallapa_db) 안의 모든 object store를 1개의 JSON으로 export/import
// - 주의: 복구(import)는 기본적으로 기존 데이터를 모두 덮어쓴다(clear 후 put)

async function exportHallapaDbSnapshot() {
  const db = await openDb();
  const storeNames = Array.from(db.objectStoreNames || []);

  const tx = db.transaction(storeNames, "readonly");
  const stores = {};

  await Promise.all(
    storeNames.map(async (name) => {
      try {
        const store = tx.objectStore(name);
        const rows = await requestToPromise(store.getAll());
        stores[name] = Array.isArray(rows) ? rows : [];
      } catch (error) {
        throw error;
      }
    }),
  );

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return {
    meta: {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      app: "hallapa",
    },
    stores,
  };
}

async function restoreHallapaDbSnapshot(snapshot, options = {}) {
  const {
    clearFirst = true,
    mode = clearFirst ? "overwrite" : "merge",
    allowStores = null,
  } = options || {};

  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  const meta = snapshot?.meta;
  if (!meta || typeof meta !== "object") {
    throw new Error("백업 파일 meta 정보가 없습니다.");
  }

  const metaName = meta?.dbName;
  if (!metaName) {
    throw new Error("백업 파일 meta.dbName이 없습니다.");
  }
  if (String(metaName) !== String(DB_NAME)) {
    throw new Error(
      `다른 DB의 백업입니다. (파일: ${String(metaName)}, 현재: ${String(DB_NAME)})`,
    );
  }

  // meta.dbVersion / meta.exportedAt / meta.app는 운영 안전장치로 검사만 한다.
  // (이전 백업과의 호환성을 위해 app/exportedAt 형식은 엄격하게 막지 않는다.)
  if (typeof meta.dbVersion === "undefined" || meta.dbVersion === null) {
    throw new Error("백업 파일 meta.dbVersion이 없습니다.");
  }
  const exportedAt = meta.exportedAt || meta.exportedAtIso;
  if (!exportedAt) {
    throw new Error("백업 파일 meta.exportedAt이 없습니다.");
  }

  const storesData = snapshot.stores;
  if (!storesData || typeof storesData !== "object") {
    throw new Error("백업 파일에 stores 데이터가 없습니다.");
  }

  const restoreMode = String(mode || "").trim() === "merge" ? "merge" : "overwrite";
  const db = await openDb();

  const incomingNames = Object.keys(storesData);
  const dbStoreNames = Array.from(db.objectStoreNames || []);

  // overwrite(덮어쓰기): DB에 존재하는 모든 스토어를 대상으로 clear 후 복구한다.
  // merge(병합): 기본적으로 customers/items만 허용(거래/원장은 병합 금지)
  let storeNames = [];
  if (restoreMode === "overwrite") {
    storeNames = dbStoreNames;
  } else {
    const defaultAllow = [STORE_CUSTOMERS, STORE_ITEMS];
    const allowed = Array.isArray(allowStores) && allowStores.length ? allowStores : defaultAllow;
    storeNames = incomingNames
      .filter((name) => db.objectStoreNames.contains(name))
      .filter((name) => allowed.includes(name));
  }

  if (!storeNames.length) {
    throw new Error("복구할 스토어가 없습니다.");
  }

  const tx = db.transaction(storeNames, "readwrite");

  storeNames.forEach((name) => {
    const store = tx.objectStore(name);

    if (restoreMode === "overwrite") {
      if (clearFirst) {
        try {
          store.clear();
        } catch (_) {}
      }

      const rows = Array.isArray(storesData[name]) ? storesData[name] : [];
      rows.forEach((row) => {
        try {
          store.put(row);
        } catch (error) { tx.abort(); throw error; }
      });
      return;
    }

    // merge 모드: 기존 데이터는 유지하고, 새 데이터만 추가한다.
    // - autoIncrement 스토어는 key 충돌을 피하기 위해 keyPath 필드를 제거한 뒤 add
    // - 그 외 스토어는 add로 넣고, 중복 키(ConstraintError)는 건너뜀
    const rows = Array.isArray(storesData[name]) ? storesData[name] : [];
    const keyPath = store && store.keyPath != null ? store.keyPath : null;
    const keyField = typeof keyPath === "string" && keyPath ? keyPath : null;
    const isAuto = !!store.autoIncrement;

    rows.forEach((row) => {
      try {
        const valueToAdd = isAuto && keyField && row && typeof row === "object" ? (() => {
          const cloned = { ...row };
          delete cloned[keyField];
          return cloned;
        })() : row;

        const req = store.add(valueToAdd);
        // 중복 키 등으로 인한 request error가 트랜잭션 전체를 abort시키지 않도록 방지
        if (req) {
          req.onerror = (ev) => {
            try {
              if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
              if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
            } catch (_) {}
          };
        }
      } catch (_) {
        // add()가 즉시 throw하는 케이스는 무시
      }
    });
  });

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return true;
}

export {
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
};

