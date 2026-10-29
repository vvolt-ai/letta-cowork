import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseHttpClient} from '../dist-electron/api/client/base-client.js';
import {abortableSetupRead} from '../dist-electron/libs/runner/sdk/startup-timing.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const auth=(id,organizationId='fixture-org',suffix='1')=>({accessToken:id+'-access-'+suffix,refreshToken:id+'-refresh-'+suffix,expiresIn:3600,user:{id,email:id+'@example.invalid',organizationId,role:'member'}});
function clientFixture(){
 // No constructor, credential files, shell/env writes or real network. Exercise
 // actual request/refresh/application code; persistence and logout IO are stubs.
 const client=Object.create(BaseHttpClient.prototype),persisted=[];let clears=0;
 Object.assign(client,{baseUrl:'https://fixture.invalid',tokens:auth('a'),authGeneration:0,lastAuthIdentity:undefined,refreshPromise:null});client.lastAuthIdentity=client.authIdentity();
 client.saveTokens=()=>{client.fenceAuthIdentity();persisted.push(client.tokens?.user.id);};
 client.clearTokens=()=>{clears++;client.resetAuthState();};
 return{client,persisted,get clears(){return clears;}};
}
test('cancelled setup plus logout cannot restore a late refresh or retry the protected read',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture(),controller=new AbortController();let requests=0,refreshes=0;
 globalThis.fetch=async(url,options)=>{assert(String(url).startsWith('https://fixture.invalid'));if(String(url).endsWith('/auth/refresh')){refreshes++;return refresh.promise;}requests++;assert.equal(options.signal,controller.signal);return Response.json({message:'fixture unauthorized'},{status:401});};
 try{const original=f.client.request('/agent-secrets/runtime-env',{method:'POST',body:{agentId:'fixture'},signal:controller.signal,suppressAuthExpired:false});const bounded=abortableSetupRead(original,controller.signal);await tick();assert.equal(refreshes,1);controller.abort();await assert.rejects(bounded,/SETUP_READ_ABORTED/);f.client.clearTokens();refresh.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(original,/AUTH_STATE_CHANGED/);assert.equal(f.client.tokens,null);assert.deepEqual(f.persisted,[]);assert.equal(requests,1);assert.equal(f.clears,1);}finally{globalThis.fetch=oldFetch;}
});
test('old refresh cannot replace a new login or clear it after a stale 401',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture();let reads=0;
 globalThis.fetch=async url=>String(url).endsWith('/auth/refresh')?refresh.promise:(reads++,Response.json({}, {status:401}));
 try{const work=f.client.request('/agent-secrets/runtime-env',{method:'POST',suppressAuthExpired:false});await tick();f.client.applyAuthResponse(auth('b'));refresh.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(work,/AUTH_STATE_CHANGED/);assert.equal(f.client.currentUser.id,'b');assert.deepEqual(f.persisted,['b']);assert.equal(f.clears,0);assert.equal(reads,1);}finally{globalThis.fetch=oldFetch;}
});
test('organization switch rejects the previous refresh even for the same user',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture();globalThis.fetch=async url=>String(url).endsWith('/auth/refresh')?refresh.promise:Response.json({}, {status:401});
 try{const work=f.client.request('/fixture');await tick();f.client.applyAuthResponse(auth('a','another-fixture-org'));refresh.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(work,/AUTH_STATE_CHANGED/);assert.equal(f.client.currentUser.organizationId,'another-fixture-org');assert.deepEqual(f.persisted,['a']);}finally{globalThis.fetch=oldFetch;}
});
test('profile-driven organization identity changes fence a pending refresh without writing host state',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture();globalThis.fetch=async url=>String(url).endsWith('/auth/refresh')?refresh.promise:Response.json({}, {status:401});
 try{const work=f.client.request('/fixture');await tick();f.client.tokens={...f.client.tokens,user:{...f.client.tokens.user,organizationId:'profile-changed-org'}};f.client.saveTokens();refresh.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(work,/AUTH_STATE_CHANGED/);assert.equal(f.client.currentUser.organizationId,'profile-changed-org');}finally{globalThis.fetch=oldFetch;}
});
test('retired API client cannot persist a late refresh after server-context replacement',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture();globalThis.fetch=async url=>String(url).endsWith('/auth/refresh')?refresh.promise:Response.json({}, {status:401});
 try{const work=f.client.request('/fixture');await tick();f.client.retireAuthenticationContext();refresh.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(work,/AUTH_STATE_CHANGED/);assert.deepEqual(f.persisted,[]);assert.throws(()=>f.client.applyAuthResponse(auth('a')),/AUTH_STATE_CHANGED/);}finally{globalThis.fetch=oldFetch;}
});
test('concurrent same-generation requests share one refresh and retry only under the same principal',async()=>{
 const oldFetch=globalThis.fetch,refresh=deferred(),f=clientFixture();let refreshes=0,retries=0;
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/auth/refresh')){refreshes++;return refresh.promise;}if(options.headers.Authorization==='Bearer a-access-2'){retries++;return Response.json({fixture:true});}return Response.json({}, {status:401});};
 try{const first=f.client.request('/first'),second=f.client.request('/second');await tick();assert.equal(refreshes,1);refresh.resolve(Response.json(auth('a','fixture-org','2')));assert.deepEqual(await first,{fixture:true});assert.deepEqual(await second,{fixture:true});assert.equal(retries,2);assert.deepEqual(f.persisted,['a']);}finally{globalThis.fetch=oldFetch;}
});
test('late old refresh finalizer cannot erase the new generation refresh promise',async()=>{
 const oldFetch=globalThis.fetch,a=deferred(),b=deferred(),f=clientFixture();let refreshes=0;
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/auth/refresh')){refreshes++;const body=JSON.parse(options.body);return body.refreshToken.startsWith('a-')?a.promise:b.promise;}return options.headers.Authorization==='Bearer b-access-2'?Response.json({fixture:true}):Response.json({}, {status:401});};
 try{const old=f.client.request('/old');await tick();f.client.applyAuthResponse(auth('b'));const first=f.client.request('/new-first');await tick();a.resolve(Response.json(auth('a','fixture-org','2')));await assert.rejects(old,/AUTH_STATE_CHANGED/);const second=f.client.request('/new-second');await tick();assert.equal(refreshes,2);b.resolve(Response.json(auth('b','fixture-org','2')));await Promise.all([first,second]);assert.equal(f.client.currentUser.id,'b');assert.deepEqual(f.persisted,['b','b']);}finally{globalThis.fetch=oldFetch;}
});
test('refresh response cannot switch principal silently',async()=>{
 const oldFetch=globalThis.fetch,f=clientFixture();globalThis.fetch=async url=>String(url).endsWith('/auth/refresh')?Response.json(auth('b')):Response.json({}, {status:401});
 try{await assert.rejects(f.client.request('/fixture'),/Authentication expired/);assert.equal(f.client.currentUser.id,'a');assert.deepEqual(f.persisted,[]);}finally{globalThis.fetch=oldFetch;}
});
