import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopAppServerPool,desktopPoolBoundary} from '../dist-electron/services/letta-runtime/desktop-app-server-pool.js';
import {DesktopNativeControls} from '../dist-electron/libs/runner/sdk/native-controls.js';
import {DesktopSdkSession,desktopSdkScopeKey} from '../dist-electron/libs/runner/sdk/session.js';
import {veraRuntimeActorIdentity} from '../dist-electron/services/letta-runtime/index.js';
const A='agent-11111111-1111-1111-1111-111111111111';
const cid=n=>'conv-22222222-2222-2222-2222-'+String(n).padStart(12,'0');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function request(n=1,extra={}){const ctrl=new AbortController(),conversationId=cid(n),controls=new DesktopNativeControls(A,conversationId);return{agentId:A,conversationId,cwd:'/fixture/'+n,scopeKey:'fixture-account',provider:{source:'local',baseURL:'https://fixture.invalid/v1',apiKey:'fixture-not-real'},assertCurrent:()=>{},signal:ctrl.signal,controls,authorizeCancellation:(_agent,ids)=>ids.every(id=>controls.ownedRuns.has(id)),ctrl,...extra};}
function submitted(r,run='run-fixture-'+r.conversationId){r.controls.outgoing(JSON.stringify({type:'input',runtime:r.controls.scope,request_id:'reused-local-request',payload:{kind:'create_message',messages:[{client_message_id:r.controls.messageId}]}}));r.controls.incoming(JSON.stringify({type:'update_loop_status',runtime:r.controls.scope,loop_status:{client_message_ids_by_run_id:{[run]:[r.controls.messageId]}}}));return run;}
function hostFixture(){const calls=[],hosts=[];const launch=async options=>{calls.push(options);const state={closed:0,alive:true};hosts.push(state);return{url:'ws://127.0.0.1:'+hosts.length,authToken:'fixture-capability',isAlive:()=>state.alive,close:async()=>{state.closed++;state.alive=false;}};};return{calls,hosts,launch};}

test('many concurrent leases share one startup and later turns reuse the idle process',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch);const leases=await Promise.all(Array.from({length:12},(_,i)=>pool.acquire(request(i+1))));assert.equal(f.calls.length,1);assert.equal(new Set(leases.map(l=>l.url)).size,1);await Promise.all(leases.map(l=>l.release(true)));assert.equal(f.hosts[0].closed,0);const next=await pool.acquire(request(1));assert.equal(f.calls.length,1);await next.release(true);await pool.shutdown();assert.equal(f.hosts[0].closed,1);
});
test('one cancelled startup waiter cannot kill the neighbour or its shared startup',async()=>{
 const start=deferred(),f=hostFixture(),pool=new DesktopAppServerPool(async o=>{await start.promise;return f.launch(o);});const a=request(1),b=request(2),first=pool.acquire(a),second=pool.acquire(b);await tick();a.ctrl.abort();await assert.rejects(first,/ACQUIRE_CANCELLED/);start.resolve();const lease=await second;assert.equal(f.calls.length,1);assert.equal(f.calls[0].signal.aborted,false);await lease.release(true);await pool.shutdown();
});
test('account, provider path, direct credential, connection and native-memory-off agent policies partition hosts',()=>{
 const r=request(),base=desktopPoolBoundary(r);for(const changed of [request(2,{scopeKey:'different-actor'}),request(2,{provider:{...r.provider,baseURL:'https://fixture.invalid/other/v1'}}),request(2,{provider:{...r.provider,apiKey:'different-fixture'}}),request(2,{provider:{...r.provider,defaultHeaders:{'x-letta-connection-id':'other'}}}),request(2,{agentId:'agent-99999999-9999-9999-9999-999999999999'})])assert.notEqual(desktopPoolBoundary(changed),base);assert.equal(desktopPoolBoundary(request(2)),base);assert(!base.includes('fixture-not-real'));
});
test('Vera token refresh keeps the same boundary but an auth epoch/instance change does not',()=>{
 const r=request();r.provider={...r.provider,source:'vera'};assert.equal(desktopPoolBoundary(r),desktopPoolBoundary({...r,provider:{...r.provider,apiKey:'rotated-fixture-jwt'}}));
 const api={apiBaseUrl:'https://fixture.invalid',currentUser:{id:'fixture-user',organizationId:'fixture-org'},authContextRevision:1,accessToken:'first'};const first=veraRuntimeActorIdentity(api);api.accessToken='second';assert.equal(veraRuntimeActorIdentity(api),first);api.authContextRevision++;assert.notEqual(veraRuntimeActorIdentity(api),first);assert.notEqual(veraRuntimeActorIdentity({...api}),veraRuntimeActorIdentity(api));
});
test('same runtime cannot be controlled across different process boundaries and unknown input remains fenced',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),r=request(),lease=await pool.acquire(r);submitted(r);await assert.rejects(pool.acquire(request(1,{scopeKey:'another-actor'})),/ALREADY_OWNED/);await lease.release(false);await assert.rejects(pool.acquire(request()),/ALREADY_OWNED/);const neighbour=await pool.acquire(request(2));await neighbour.release(true);assert.equal(f.hosts[0].closed,0);await pool.shutdown();await assert.rejects(pool.acquire(request()),/CLOSED/);
});
test('failed client close fences even a runtime that never submitted model input',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),lease=await pool.acquire(request());await lease.release(false,false);await assert.rejects(pool.acquire(request()),/ALREADY_OWNED/);await pool.shutdown();
});
test('relay rejects stopped/unknown model inputs and mixed or foreign cancellation, without harming B',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),a=request(1),b=request(2),la=await pool.acquire(a),lb=await pool.acquire(b);const ra=submitted(a),rb=submitted(b),relay=f.calls[0].authorizeRelayRequest,bytes=x=>Buffer.from(JSON.stringify(x));
 relay('POST','/v1/conversations/'+b.conversationId+'/messages',bytes({}));a.ctrl.abort();assert.throws(()=>relay('POST','/v1/conversations/'+a.conversationId+'/messages',bytes({})));relay('POST','/v1/conversations/'+b.conversationId+'/messages',bytes({}));assert.throws(()=>relay('POST','/v1/agents/'+A+'/messages',bytes({})),/UNVERIFIED/);assert.throws(()=>relay('POST','/v1/agents/'+A+'/messages/cancel',bytes({run_ids:[ra,rb]})),/DENIED/);assert.throws(()=>relay('POST','/v1/runs/run-foreign/cancel',bytes({})),/DENIED/);relay('POST','/v1/agents/'+A+'/messages/cancel',bytes({run_ids:[ra]}));await la.release(true);assert.throws(()=>relay('POST','/v1/agents/'+A+'/messages/cancel',bytes({run_ids:[ra]})),/DENIED/);relay('POST','/v1/runs/'+rb+'/cancel',bytes({}));await lb.release(true);await pool.shutdown();
});
test('dead process can be replaced for B while A retains its unknown-backend fence',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),a=request(1),la=await pool.acquire(a);submitted(a);f.hosts[0].alive=false;const lb=await pool.acquire(request(2));assert.equal(f.calls.length,2);assert.equal(f.hosts[0].closed,1);await la.release(false);await assert.rejects(pool.acquire(request(1)),/ALREADY_OWNED/);await lb.release(true);await pool.shutdown();
});
test('idle auth-invalid boundary retires before cache capacity is reused',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch,1);let current=true;const lease=await pool.acquire(request(1,{assertCurrent:()=>{if(!current)throw Error('actor changed');}}));await lease.release(true);current=false;const next=await pool.acquire(request(2,{scopeKey:'new-actor'}));assert.equal(f.hosts[0].closed,1);assert.equal(f.calls.length,2);await next.release(true);await pool.shutdown();
});
test('pool teardown cannot terminate a host while another conversation still leases it',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),a=await pool.acquire(request(1)),b=await pool.acquire(request(2));await a.release(true);await assert.rejects(pool.shutdown(),/ACTIVE_LEASES/);assert.equal(f.hosts[0].closed,0);await b.release(true);await pool.shutdown();assert.equal(f.hosts[0].closed,1);
});
test('capacity counts starting hosts and shutdown handles coalesced startup exactly once',async()=>{
 const gate=deferred(),f=hostFixture(),pool=new DesktopAppServerPool(async o=>{await gate.promise;return f.launch(o);},1),first=pool.acquire(request());await tick();await assert.rejects(pool.acquire(request(2,{scopeKey:'other'})),/CAPACITY/);const stop=pool.shutdown();gate.resolve();await assert.rejects(first,/CLOSED/);await stop;assert.equal(f.hosts[0].closed,1);
});
test('a failed tree cleanup is not treated as capacity or boundary release',async()=>{
 let valid=true;const pool=new DesktopAppServerPool(async()=>({url:'ws://fixture',authToken:'fixture',close:async()=>{throw Error('fixture tree proof failed');}}),1);const lease=await pool.acquire(request(1,{assertCurrent:()=>{if(!valid)throw Error('retired');}}));await lease.release(true);valid=false;await assert.rejects(pool.acquire(request(2,{scopeKey:'other'})),/CAPACITY/);await assert.rejects(pool.shutdown(),/SHUTDOWN_UNVERIFIED/);
});
test('direct model routing still fences changed Cowork tool actors while same-actor JWT refresh is stable',()=>{
 const local={source:'local',baseURL:'https://fixture.invalid',apiKey:'fixture-key'},vera={...local,source:'vera'};assert.notEqual(desktopSdkScopeKey(local,'actor-one'),desktopSdkScopeKey(local,'actor-two'));assert.equal(desktopSdkScopeKey(vera,'same-actor'),desktopSdkScopeKey({...vera,apiKey:'rotated-jwt'},'same-actor'));assert.notEqual(desktopSdkScopeKey(local,'same-actor','first'),desktopSdkScopeKey(local,'same-actor','second'));
});
test('a terminal lease cannot admit another model POST before its client closes',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),r=request(),lease=await pool.acquire(r),run=submitted(r);r.controls.incoming(JSON.stringify({type:'turn_finished',runtime:r.controls.scope,run_id:run,turn_id:'fixture-turn',stop_reason:'end_turn'}));assert.throws(()=>f.calls[0].authorizeRelayRequest('POST','/v1/conversations/'+r.conversationId+'/messages',Buffer.from('{}')),/AFTER_TERMINAL/);await lease.release(true);const next=await pool.acquire(request());assert.equal(next.poolReused,true);await next.release(true);await pool.shutdown();
});
test('stale double release cannot unlock a replacement controller',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),first=await pool.acquire(request());await first.release(true);const second=await pool.acquire(request());await first.release(true);await assert.rejects(pool.acquire(request()),/ALREADY_OWNED/);await second.release(true);await pool.shutdown();
});
test('failed cleanup in an unrelated idle boundary does not stop a healthy neighbour',async()=>{
 let oldValid=true,closed=0;const pool=new DesktopAppServerPool(async o=>({url:'ws://fixture',authToken:'fixture',close:async()=>{closed++;if(o.scopeKey==='old')throw Error('old tree unverified');}}));const old=await pool.acquire(request(1,{scopeKey:'old',assertCurrent:()=>{if(!oldValid)throw Error('retired');}}));const healthy=await pool.acquire(request(2,{scopeKey:'healthy'}));await old.release(true);await healthy.release(true);oldValid=false;const next=await pool.acquire(request(3,{scopeKey:'healthy'}));await next.release(true);assert.equal(closed,1);await assert.rejects(pool.shutdown(),/SHUTDOWN_UNVERIFIED/);
});
test('DesktopSdkSession closes its client before releasing the shared runtime lease',async()=>{
 const f=hostFixture(),pool=new DesktopAppServerPool(f.launch),closing=deferred(),r=request(),scope={key:r.scopeKey,config:r.provider,assertCurrent:()=>{},client:{conversations:{retrieve:async()=>({id:cid(1),agent_id:A})}}};let closingStarted=false;
 const session=new DesktopSdkSession({agentId:A,conversationId:cid(1),scope,memoryDisabled:true,inheritedContext:{signal:new AbortController().signal,runtimeEnv:{}},tools:[]},{acquire:o=>pool.acquire(o),open:async()=>({resumeSession:()=>({ready:async()=>({agentId:A,conversationId:cid(1)}),close:()=>{}}),close:async()=>{closingStarted=true;await closing.promise;}})});
 await session.initialize();const stop=session.abort();await tick();assert(closingStarted);await assert.rejects(pool.acquire(request(1)),/ALREADY_OWNED/);closing.resolve();await stop;const next=await pool.acquire(request(1));await next.release(true);assert.equal(f.calls.length,1);await pool.shutdown();
});
