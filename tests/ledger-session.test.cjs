const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const values=new Map();let refreshes=0;
 const context=vm.createContext({console,Date,JSON,Error,AbortSignal,URLSearchParams,sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{search:'?next=https://evil.example',pathname:'/index.html',replace(){}},fetch:async(url,options)=>{assert(!options.headers.Authorization||options.headers.Authorization.startsWith('Bearer '));if(url.includes('refresh_token')){refreshes++;return {ok:true,json:async()=>({access_token:'renewed',refresh_token:'r2',expires_in:3600})};}return {ok:true,json:async()=>({snapshot:{},revision:1})};}});
 const m=new vm.SourceTextModule(fs.readFileSync('js/cloud-session.js','utf8'),{context});await m.link(()=>{});await m.evaluate();const c=m.namespace;
 c.keepSession({access_token:'one',refresh_token:'r',expires_in:3600});assert((await c.accessToken())==='one');assert(c.session().expires_at>Date.now()/1000);assert.equal(c.nextPage(),'index.html','external redirect rejected');
 c.keepSession({access_token:'expired',refresh_token:'r',expires_at:1});const tokens=await Promise.all([c.accessToken(),c.accessToken()]);assert.deepEqual(tokens,['renewed','renewed']);assert.equal(refreshes,1);assert(!JSON.stringify([...values]).includes('password'));
 const timeouts=[];context.AbortSignal={timeout:ms=>{timeouts.push(ms);return AbortSignal.timeout(ms);}};
 await c.rpc('halla_ledger_save',{});await c.rpc('halla_ledger_read');await c.rpc('halla_ledger_patch_compact',{});
 assert.deepEqual(timeouts,[120000,30000,120000],'restore and atomic save have bounded timeouts');
 assert(c.friendlyError(new Error('signal timed out')).includes('저장 결과'),'timeout asks user to verify uncertain save');
 c.clearSession();assert.equal(c.session(),null);
 console.log('PASS: isolated token storage, REST expiry normalization, concurrent refresh, safe login redirect');
})().catch(e=>{console.error(e);process.exitCode=1;});
