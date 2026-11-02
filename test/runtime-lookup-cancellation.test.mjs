import test from 'node:test';
import assert from 'node:assert/strict';
import {createVeraRuntimeFetch} from '../dist-electron/services/letta-runtime/index.js';
import {readWithDeadline} from '../dist-electron/services/letta-runtime/read-deadline.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const apiFixture=()=>({apiBaseUrl:'https://fixture.invalid',currentUser:{id:'fixture-a',organizationId:'fixture-org'},accessToken:'fixture-original',request:async()=>{}});

test('pre-aborted canonical read never starts network work',async()=>{
 const c=new AbortController();c.abort();let calls=0;await assert.rejects(readWithDeadline(async()=>{calls++;},c.signal,20,'FIXTURE_TIMEOUT'),/aborted/i);assert.equal(calls,0);
});
test('read deadline retains its own timeout reason even if transport ignores cancellation',async()=>{
 const pending=defer(),c=new AbortController();let signal;const work=readWithDeadline(s=>{signal=s;return pending.promise;},c.signal,10,'FIXTURE_LOOKUP_TIMEOUT');await assert.rejects(work,/FIXTURE_LOOKUP_TIMEOUT/);assert(signal.aborted);assert.equal(c.signal.aborted,false);pending.reject(Error('late transport error'));await tick();
});
test('pre-aborted runtime adapter never fetches or refreshes',async()=>{
 const original=globalThis.fetch,api=apiFixture(),c=new AbortController();let calls=0;c.abort();globalThis.fetch=async()=>{calls++;throw Error('Unexpected fixture network');};api.request=async()=>{calls++;};
 try{await assert.rejects(createVeraRuntimeFetch(()=>api)('https://fixture.invalid/conversations/fixture',{signal:c.signal}),/aborted/i);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('runtime lookup abort propagates into auth probe and forbids a late retry',async()=>{
 const original=globalThis.fetch,api=apiFixture(),refresh=defer(),c=new AbortController();let calls=0,probeSignal;
 globalThis.fetch=async()=>{calls++;return Response.json({}, {status:401});};api.request=async(_path,options)=>{probeSignal=options.signal;await refresh.promise;api.accessToken='fixture-rotated';};
 try{const work=createVeraRuntimeFetch(()=>api)('https://fixture.invalid/conversations/fixture',{signal:c.signal});await tick();assert.equal(probeSignal,c.signal);c.abort();await assert.rejects(work,/aborted/i);refresh.resolve();await tick();assert.equal(calls,1);}finally{refresh.resolve();globalThis.fetch=original;}
});
test('aborting one lookup does not cancel another reader sharing authentication refresh',async()=>{
 const original=globalThis.fetch,api=apiFixture(),refresh=defer(),a=new AbortController(),b=new AbortController();let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;return new Headers(options.headers).get('Authorization')==='Bearer fixture-rotated'?Response.json({ok:true}):Response.json({}, {status:401});};api.request=async()=>{await refresh.promise;api.accessToken='fixture-rotated';};
 try{const adapter=createVeraRuntimeFetch(()=>api),first=adapter('https://fixture.invalid/first',{signal:a.signal}),second=adapter('https://fixture.invalid/second',{signal:b.signal});await tick();a.abort();await assert.rejects(first,/aborted/i);assert.equal(b.signal.aborted,false);refresh.resolve();assert.deepEqual(await(await second).json(),{ok:true});assert.equal(calls,3);}finally{refresh.resolve();globalThis.fetch=original;}
});
test('Request-carried cancellation reaches auth probe and suppresses replay',async()=>{
 const original=globalThis.fetch,api=apiFixture(),refresh=defer(),c=new AbortController();let calls=0,probeSignal;
 globalThis.fetch=async()=>{calls++;return Response.json({}, {status:401});};api.request=async(_path,options)=>{probeSignal=options.signal;await refresh.promise;api.accessToken='fixture-rotated';};
 try{const work=createVeraRuntimeFetch(()=>api)(new Request('https://fixture.invalid/fixture',{signal:c.signal}));await tick();c.abort();await assert.rejects(work,/aborted/i);assert(probeSignal.aborted);refresh.resolve();await tick();assert.equal(calls,1);}finally{refresh.resolve();globalThis.fetch=original;}
});
test('account switch during auth recovery cannot retry as a different actor',async()=>{
 const original=globalThis.fetch,api=apiFixture(),refresh=defer();let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({}, {status:401});};api.request=async()=>{await refresh.promise;};
 try{const work=createVeraRuntimeFetch(()=>api)('https://fixture.invalid/fixture');await tick();api.currentUser={id:'fixture-b',organizationId:'fixture-org'};api.accessToken='fixture-other';refresh.resolve();await assert.rejects(work,/LETTA_RUNTIME_ACTOR_CHANGED/);assert.equal(calls,1);}finally{refresh.resolve();globalThis.fetch=original;}
});
