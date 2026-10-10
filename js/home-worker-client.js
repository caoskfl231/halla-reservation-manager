import { computeJob } from './home-compute.js?v=app-20261010-8';
let worker, next=0;
const pending=new Map();
function failWorker(error) {
  worker?.terminate(); worker=null;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
  pending.clear();
}
export async function runHomeJob(job) {
  if (typeof Worker === 'undefined') {
    await new Promise(resolve=>setTimeout(resolve,0));
    return computeJob(job);
  }
  if (!worker) {
    worker=new Worker(new URL('./home-worker.js?v=app-20261010-8',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const entry=pending.get(data.id); if (!entry) return;
      pending.delete(data.id); clearTimeout(entry.timer);
      data.error ? entry.reject(new Error(data.error)) : entry.resolve(data.result);
    };
    worker.onerror=()=>failWorker(new Error('거래 계산을 완료하지 못했습니다. 새로고침해 주세요.'));
  }
  return new Promise((resolve,reject)=>{
    const id=++next;
    const timer=setTimeout(()=>failWorker(new Error('거래 계산 시간이 초과됐습니다.')),60000);
    pending.set(id,{resolve,reject,timer});
    try { worker.postMessage({id,job}); } catch(error) { pending.delete(id);clearTimeout(timer);reject(error); }
  });
}
globalThis.addEventListener?.('pagehide',()=>failWorker(new Error('PAGE_CLOSED')));
