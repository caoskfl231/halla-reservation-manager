const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('common automatic refresh avoids an extra initial load and overlapping renders, retaining later changes',async()=>{
 const receivers=new Set();class Channel{addEventListener(name,fn){this.fn=fn;receivers.add(fn);}removeEventListener(){receivers.delete(this.fn);}close(){receivers.delete(this.fn);}}
 const context=vm.createContext({console,Date,JSON,setTimeout,clearTimeout,BroadcastChannel:Channel,document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}}});
 const module=new vm.SourceTextModule(fs.readFileSync('js/common/app-events.js','utf8'),{context});await module.link(()=>{});await module.evaluate();
 let release,calls=0,active=0,maxActive=0;const gate=new Promise(resolve=>release=resolve);
 const dispose=module.namespace.installDbAutoRefresh({debounceMs:1,retryMs:2,refresh:async()=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1)await gate;active--;}});
 await delay(5);assert.equal(calls,0,'caller already initialized the page');
 const change=()=>receivers.forEach(fn=>fn({data:{type:'db:changed',payload:{stores:['transactions']}}}));
 change();await delay(5);assert.equal(calls,1);change();await delay(5);assert.equal(calls,1,'second render waits');release();await delay(12);assert.equal(calls,2);assert.equal(maxActive,1);dispose();
});
