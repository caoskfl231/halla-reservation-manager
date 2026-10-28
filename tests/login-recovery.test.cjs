const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness({readFailure=false}={}){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,disabled:false,textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},focus(){}});return elements.get(id);};
 let stored=null,clears=0,requests=0,resolveRequest;const redirects=[];
 const context=vm.createContext({document:{getElementById:get},sessionStorage:{getItem(){return null;},removeItem(){}},location:{replace(url){redirects.push(url);}},
 request:async()=>{requests++;return new Promise(resolve=>resolveRequest=resolve);},keepSession:v=>stored=v,clearSession:()=>{clears++;stored=null;},rpc:async()=>{if(readFailure)throw Error('network failure');return {};},nextPage:()=> 'index.html',friendlyError:e=>e.message,friendlyLoadError:e=>e.message,sessionRejected:()=>false,accessToken:async()=> 'token',session:()=>stored,autoLoginEnabled:()=>false,setAutoLogin(){},savedEmail:()=>'',rememberEmail(){}});
 const source=fs.readFileSync('js/ledger-login.js','utf8').replace(/^import[^\n]+\n/,'');vm.runInContext(source,context);
 return {get,run:()=>get('login-form').handlers.submit({preventDefault(){}}),resolve:()=>resolveRequest({access_token:'test',user:{}}),stats:()=>({stored,clears,requests,redirects})};
}
test('password success + ledger failure preserves session and offers retry',async()=>{const h=harness({readFailure:true});const p=h.run();h.resolve();await p;assert(h.stats().stored);assert.equal(h.stats().clears,0);assert.equal(h.get('resume-button').hidden,false);assert.match(h.get('error').textContent,/로그인은 성공/);assert.equal(h.get('login-button').disabled,false);});
test('concurrent submit issues one password request',async()=>{const h=harness();const first=h.run();await h.run();assert.equal(h.stats().requests,1);h.resolve();await first;assert.equal(h.stats().redirects.length,1);});
test('resume rechecks ledger and preserves login on network failure',async()=>{const h=harness({readFailure:true});const p=h.run();h.resolve();await p;await h.get('resume-button').handlers.click();assert(h.stats().stored);assert.equal(h.stats().redirects.length,0);assert.equal(h.get('resume-button').hidden,false);});
