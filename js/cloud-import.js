// Stage bounded batches; the live ledger changes only after explicit finalization.
export function importChunks(snapshot, maxRows = 200, maxBytes = 180000) {
  const chunks = [];
  const encoder = new TextEncoder();
  for (const [store, rows] of Object.entries(snapshot.stores)) {
    let batch = [], bytes = 2;
    for (const row of rows) {
      const size = encoder.encode(JSON.stringify(row)).length + 1;
      if (size > maxBytes) throw new Error('한 항목의 크기가 너무 큽니다: ' + store);
      if (batch.length && (batch.length >= maxRows || bytes + size > maxBytes)) {
        chunks.push({ store, rows: batch }); batch = []; bytes = 2;
      }
      batch.push(row); bytes += size;
    }
    if (batch.length) chunks.push({ store, rows: batch });
  }
  return chunks;
}
export async function uploadSnapshot(snapshot, revision, action, rpc, progress = () => {}) {
  const chunks = importChunks(snapshot);
  const id = crypto.randomUUID();
  const counts = Object.fromEntries(Object.entries(snapshot.stores).map(([store, rows]) => [store, rows.length]));
  progress('백업 전송 준비 중…');
  await rpc('halla_ledger_import_start', { p_id: id, p_meta: snapshot.meta, p_counts: counts, p_chunks: chunks.length, p_revision: revision, p_action: action });
  for (let i = 0; i < chunks.length; i++) {
    progress('백업 전송 중 · ' + (i + 1) + '/' + chunks.length + ' 묶음');
    await rpc('halla_ledger_import_chunk', { p_id: id, p_chunk: i, p_store: chunks[i].store, p_rows: chunks[i].rows });
  }
  progress('전송 완료 · 장부에 반영 중… 창을 닫지 마세요.');
  await rpc('halla_ledger_import_finish', { p_id: id });
  progress('서버 저장 완료 · 자료 확인 중…');
  return rpc('halla_ledger_read');
}
