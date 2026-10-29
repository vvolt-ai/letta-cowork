import test from 'node:test';
import assert from 'node:assert/strict';
import {DesktopSdkSession} from '../dist-electron/libs/runner/sdk/session.js';
import {executeAgentMemory} from '../dist-electron/services/memfs/agent-memory-access.js';
import {StartupTiming,abortableSetupRead} from '../dist-electron/libs/runner/sdk/startup-timing.js';
const A='agent-11111111-1111-1111-1111-111111111111',C='conv-22222222-2222-2222-2222-222222222222';
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));let counter=0;
function fixture(options={},dependencies={}){
 const events=[],calls=[];let current=true,model='fixture-model';
 const scope={key:'startup-fixture-'+(++counter),config:{source:'local',baseURL:'https://fixture.invalid',apiKey:'PRIVATE_FIXTURE_KEY'},assertCurrent:()=>{if(!current)throw Error('SDK_ACCOUNT_SCOPE_CHANGED');},client:{conversations:{retrieve:async()=>{calls.push('lookup');return{id:C,agent_id:A,model};},update:async(_id,body)=>{calls.push('update');model=body.model;return{id:C,agent_id:A,model};}},agents:{retrieve:async()=>({id:A,name:'Fixture display'})}}};
 const native={ready:async()=>{calls.push('ready');return{agentId:A,conversationId:C};},send:async()=>{calls.push('send');},stream:async function*(){yield{type:'loop_status'};yield{type:'assistant',content:'Synthetic fixture text',uuid:'fixture-message'};},close:()=>{calls.push('native-close');}};
 const session=new DesktopSdkSession({agentId:A,conversationId:C,scope,memoryDisabled:true,inheritedContext:{signal:new AbortController().signal,runtimeEnv:{}},tools:[],timing:new StartupTiming(event=>events.push(event)),...options},{launch:async()=>{calls.push('launch');return{url:'ws://127.0.0.1:1',authToken:'PRIVATE_FIXTURE_RELAY',close:async()=>{calls.push('binding-close');}};},open:async()=>({resumeSession:()=>native,close:async()=>{}}),...dependencies});
 return{session,scope,events,calls,native,invalidate:()=>{current=false;}};
}
test('unchanged model retains canonical lookup but makes no PATCH or redundant confirmation request',async()=>{
 const f=fixture({model:'fixture-model'});try{await f.session.initialize();assert.deepEqual(f.calls.filter(c=>c==='lookup'||c==='update'),['lookup']);assert(f.events.some(e=>e.stage==='model_unchanged'));}finally{await f.session.abort();}
});
test('changed model is updated once then re-read and confirmed',async()=>{
 const f=fixture({model:'new-fixture-model'});try{await f.session.initialize();assert.deepEqual(f.calls.filter(c=>c==='lookup'||c==='update'),['lookup','update','lookup']);}finally{await f.session.abort();}
});
test('chat startup constructs manual memory access without refreshing or waiting for Git',async()=>{
 const memory=defer(),env=defer();let refreshes=0,envStarted=false;
 const f=fixture({inheritedContext:undefined,memoryDisabled:false},{runtimeActor:()=> 'fixture-actor',createMemory:()=>({sync:()=>{refreshes++;return memory.promise;},snapshot:async()=>({agentId:A,state:'unavailable',memoryDir:null,repositories:[]}),notice:()=>'',withRead:async()=>{},push:async()=>{}}),loadRuntimeEnv:async()=>{envStarted=true;return env.promise;}});
 try{const init=f.session.initialize();await tick();assert.equal(refreshes,0);assert.equal(envStarted,true);assert(!f.calls.includes('launch'));env.resolve({FIXTURE_VALUE:'private fixture'});await init;assert(f.calls.includes('launch'));assert.equal(refreshes,0);assert(f.events.some(e=>e.stage==='memory_checkpoint'&&e.outcome==='skipped'));assert.equal(f.session.runtimeEnv.FIXTURE_VALUE,'private fixture');const explicit=f.session.memoryAccess.refresh();assert.equal(refreshes,1);memory.resolve({state:'ready'});await explicit;assert(!JSON.stringify(f.events).includes('private fixture'));}finally{memory.resolve({});env.resolve({});await f.session.abort();}
});
test('real memory helper is inert at startup and reports explicit sync required',async()=>{
 const originalFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('No real network permitted');};const f=fixture({memoryDisabled:false});
 try{await f.session.initialize();assert.equal(requests,0);const memory=await f.session.memoryAccess.snapshot();assert.equal(memory.memoryDir,null);assert.equal(memory.errorCode,'MEMORY_SYNC_REQUIRED');await assert.rejects(executeAgentMemory({action:'read',path:'reference/fixture.md'},f.session.memoryAccess,A),/MEMORY_SYNC_REQUIRED/);assert.equal(requests,0);}finally{globalThis.fetch=originalFetch;await f.session.abort();}
});
test('deadline ignores late secret results and does not leak or borrow environment data',async()=>{
 const pending=defer();let observedSignal;const keepAlive=setTimeout(()=>{},1000);
 const f=fixture({inheritedContext:undefined},{runtimeActor:()=> 'fixture-actor',runtimeEnvTimeoutMs:20,createMemory:()=>({sync:async()=>({state:'disabled'}),notice:()=>''}),loadRuntimeEnv:async(_agent,signal)=>{observedSignal=signal;return pending.promise;}});
 try{await f.session.initialize();assert.equal(observedSignal.aborted,true);assert.deepEqual(f.session.runtimeEnv,{});pending.resolve({LEAK:'late private fixture'});await tick();assert.deepEqual(f.session.runtimeEnv,{});assert(f.events.some(e=>e.stage==='runtime_env'&&e.outcome==='error'));}finally{clearTimeout(keepAlive);pending.resolve({});await f.session.abort();}
});
test('actor switch cannot apply a completed runtime-env read',async()=>{
 const env=defer();let actor='first-fixture';const f=fixture({inheritedContext:undefined},{runtimeActor:()=>actor,createMemory:()=>({sync:async()=>({state:'ready'}),notice:()=>''}),loadRuntimeEnv:async()=>env.promise});
 try{const init=f.session.initialize();await tick();actor='second-fixture';env.resolve({LEAK:'wrong actor data'});await init;assert.deepEqual(f.session.runtimeEnv,{});}finally{env.resolve({});await f.session.abort();}
});
test('cancelled setup cannot later launch native host after its reads resolve',async()=>{
 const memory=defer(),env=defer();const f=fixture({inheritedContext:undefined},{runtimeActor:()=> 'fixture-actor',createMemory:()=>({sync:()=>memory.promise,notice:()=>''}),loadRuntimeEnv:async()=>env.promise});
 const init=f.session.initialize();await tick();const stop=f.session.abort();await assert.rejects(init,/SDK_SESSION_CLOSED/);await stop;memory.resolve({});env.resolve({PRIVATE:'late'});await tick();assert(!f.calls.includes('launch'));assert.deepEqual(f.session.runtimeEnv,{});
});
test('display-name lookup does not hold send/stream, and first stream is not confused with first assistant text',async()=>{
 const name=defer();const f=fixture();f.scope.client.agents.retrieve=async()=>name.promise;
 try{await f.session.initialize();const lookup=f.session.getDisplayName();await f.session.send('Synthetic fixture input');const stream=f.session.stream();const status=await stream.next();assert.equal(status.value.type,'loop_status');assert(f.events.some(e=>e.stage==='first_stream_event'));assert(!f.events.some(e=>e.stage==='first_assistant_text'));const text=await stream.next();assert.equal(text.value.type,'assistant');assert.equal(f.events.filter(e=>e.stage==='first_assistant_text').length,1);name.resolve({id:A,name:'Fixture late name'});assert.equal(await lookup,'Fixture late name');await stream.return();assert(!JSON.stringify(f.events).includes('Synthetic fixture input'));assert(!JSON.stringify(f.events).includes('Synthetic fixture text'));}finally{name.resolve({id:A,name:'Fixture'});await f.session.abort();}
});
test('display-name cache is actor/account-scoped and does not bypass current scope validation',async()=>{
 const first=fixture(),second=fixture();let calls=0;first.scope.client.agents.retrieve=async()=>{calls++;return{id:A,name:'First fixture'};};second.scope.client.agents.retrieve=async()=>({id:A,name:'Second fixture'});
 try{await first.session.initialize();await second.session.initialize();assert.equal(await first.session.getDisplayName(),'First fixture');assert.equal(await first.session.getDisplayName(),'First fixture');assert.equal(calls,1);assert.equal(await second.session.getDisplayName(),'Second fixture');first.invalidate();await assert.rejects(first.session.getDisplayName(),/ACCOUNT_SCOPE_CHANGED/);}finally{await first.session.abort().catch(()=>{});await second.session.abort();}
});
test('timing baseline is per request and telemetry never serializes failure detail',async()=>{
 let now=100;const events=[];const first=new StartupTiming(e=>events.push(e),()=>now);now=120;first.begin('conversation_lookup');now=145;first.finish('conversation_lookup');const end=events.at(-1);assert.equal(end.durationMs,25);assert.equal(end.elapsedMs,45);const second=new StartupTiming(e=>events.push(e),()=>now);now=150;second.mark('request_received');assert.notEqual(first.traceId,second.traceId);assert.equal(events.at(-1).elapsedMs,5);await assert.rejects(first.measure('native_ready',async()=>{throw Error('PRIVATE_FIXTURE_ERROR');}));assert(!JSON.stringify(events).includes('PRIVATE_FIXTURE_ERROR'));
});
test('aborted setup observes late rejection without replay',async()=>{
 const pending=defer(),controller=new AbortController();const work=abortableSetupRead(pending.promise,controller.signal);controller.abort();await assert.rejects(work,/SDK_SETUP_READ_ABORTED/);pending.reject(Error('late fixture'));await tick();
});
