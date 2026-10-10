const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
async function page(local=new Map(),temporary=new Map()){
 const nodes=new Map(),redirects=[];let passwords=0,badCode=false;
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,hidden:false,textContent:'',events:new Map(),focus(){},addEventListener(type,fn){this.events.set(type,fn);}});return nodes.get(id);};
 const context=vm.createContext({console,Date,JSON,Error,AbortSignal,URLSearchParams,sessionStorage:storage(temporary),localStorage:storage(local),document:{getElementById:element},location:{search:'',pathname:'/login.html',replace:url=>redirects.push(url)},fetch:async(url,options)=>{
  let data={snapshot:{},revision:1},ok=true;
  if(url.includes('grant_type=password')){passwords++;data={access_token:'password-token',refresh_token:'r',expires_in:3600,user:{factors:[{id:'factor',status:'verified',factor_type:'totp'}]}};}
  if(url.includes('/challenge'))data={id:'challenge'};
  if(url.includes('/verify')){ok=!badCode;data=badCode?{message:'Wrong code'}:{access_token:'mfa-token',refresh_token:'mfa-refresh',expires_in:3600};}
  return {ok,status:ok?200:400,json:async()=>data};
 }});
 const session=new vm.SourceTextModule(fs.readFileSync('js/cloud-session.js','utf8'),{context});await session.link(()=>{});await session.evaluate();
 const login=new vm.SourceTextModule(fs.readFileSync('js/ledger-login.js','utf8'),{context,importModuleDynamically:()=>session});await login.link(()=>session);await login.evaluate();
 return {element,local,temporary,redirects,session:session.namespace,setBadCode:v=>badCode=v,passwords:()=>passwords,flush:()=>new Promise(r=>setImmediate(r))};
}
(async()=>{
 const p=await page();p.element('email').value='owner@example.com';p.element('password').value='not-stored';p.element('auto-login').checked=true;p.element('save-email').checked=true;
 await p.element('login-form').events.get('submit')({preventDefault(){}});
 assert(!p.session.autoLoginEnabled(),'password-only session must not be persistent before MFA');assert.equal(p.session.savedEmail(),'');assert.equal(p.element('password').value,'');
 p.element('mfa-code').value='123456';p.setBadCode(true);await p.element('mfa-form').events.get('submit')({preventDefault(){}});
 assert(!p.session.autoLoginEnabled(),'failed MFA must not enable automatic login');
 p.setBadCode(false);await p.element('mfa-form').events.get('submit')({preventDefault(){}});
 assert(p.session.autoLoginEnabled());assert.equal(p.session.savedEmail(),'owner@example.com');assert.deepEqual(p.redirects,['index.html']);
 assert(!JSON.stringify([...p.local,...p.temporary]).includes('not-stored'),'password never persisted');
 const q=await page(p.local);await q.flush();assert.deepEqual(q.redirects,['index.html'],'new browser session opens ledger automatically');assert.equal(q.passwords(),0);assert.equal(q.element('email').value,'owner@example.com');
 q.element('save-email').checked=false;q.element('save-email').events.get('change')();assert.equal(q.session.savedEmail(),'');
 await q.session.signOut();const r=await page(p.local);await r.flush();assert.equal(r.redirects.length,0,'logout prevents automatic re-entry');
 console.log('PASS: opt-in automatic login after MFA, saved ID independent, no password storage, reopen and logout');
})().catch(error=>{console.error(error);process.exitCode=1;});
