const codeStores = new Set(['customer_types','customer_groups','item_groups','cashflow_items','cashflow_types','cashflow_groups']);
export function recordToken(store, key) { return JSON.stringify([store, key]); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function sameValue(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
export function indexRecords(snapshot) {
  const result = new Map();
  for (const [store, rows] of Object.entries(snapshot.stores || {})) {
    const field = codeStores.has(store) ? 'code' : 'id';
    for (const data of rows) {
      const key = data[field];
      result.set(recordToken(store, key), { store, key, data });
    }
  }
  return result;
}
export function versionMap(rows = []) {
  return new Map(rows.map(row => [recordToken(row.store, row.key), row.version]));
}
export function changedRecords(before, after, versions) {
  const prev = indexRecords(before), next = indexRecords(after), changes = [];
  for (const token of new Set([...prev.keys(), ...next.keys()])) {
    const old = prev.get(token), row = next.get(token);
    if (sameValue(old?.data, row?.data)) continue;
    const identity = row || old;
    changes.push({ store: identity.store, key: identity.key, expected_version: versions.get(token) || 0, data: row?.data || null });
  }
  return changes;
}
export function sameRecords(a, b) {
  const prev = indexRecords(a), next = indexRecords(b);
  if (prev.size !== next.size) return false;
  for (const [token, row] of prev) if (!sameValue(row.data, next.get(token)?.data)) return false;
  return true;
}
