import test from 'node:test';
import assert from 'node:assert/strict';
import Letta from '@letta-ai/letta-client';
import {readFileSync} from 'node:fs';
import {observeMetadataFetch} from '../dist-electron/services/letta-runtime/metadata-fetch.js';
const C='conv-11111111-1111-1111-1111-111111111111';
const url='https://fixture.invalid/v1/conversations/'+C;

test('metadata tracing preserves input/options/response and does not consume or log bodies, headers or URLs',async()=>{
 const events=[],controller=new AbortController();let now=0,calls=0;
 const input='https://private-user:private-password@fixture.invalid/v1/conversations/'+C+'?token=private-query';
 const init={signal:controller.signal,headers:{Authorization:'Bearer private-bearer','x-private':'private-header'}},response=Response.json({private:'private-body'});
 const fetch=observeMetadataFetch(async(i,o)=>{calls++;assert.equal(i,input);assert.equal(o,init);now=77;return response;},'local',e=>events.push(e),()=>now);
 const result=await fetch(input,init);assert.equal(result,response);assert.equal(result.bodyUsed,false);assert.equal(calls,1);assert.deepEqual(events.map(e=>e.stage),['start','headers']);assert.equal(events[1].elapsedMs,77);assert.equal(events[1].status,200);assert.equal(events[1].conversationId,C);assert.equal(events[1].source,'local');
 const serialized=JSON.stringify(events);for(const value of ['private-user','private-password','private-query','private-bearer','private-header','private-body','fixture.invalid','Authorization'])assert(!serialized.includes(value));await result.body.cancel();
});
test('mutations, messages, stream calls and other paths remain unobserved passthroughs',async()=>{
 const events=[];let calls=0;const fetch=observeMetadataFetch(async()=>{calls++;return new Response(null,{status:204});},'vera',e=>events.push(e));
 await fetch(url,{method:'POST'});await fetch(url+'/messages');await fetch('https://fixture.invalid/v1/agents/fixture');await fetch('relative-invalid-input');assert.equal(calls,4);assert.deepEqual(events,[]);
});
test('invalid conversation identifiers are classified without leaking their text',async()=>{
 const events=[],fetch=observeMetadataFetch(async()=>Response.json({}),'vera',e=>events.push(e));await fetch('https://fixture.invalid/v1/conversations/private-customer-value');assert(events.every(e=>e.idKind==='other'&&!e.conversationId));assert(!JSON.stringify(events).includes('private-customer-value'));await fetch('https://fixture.invalid/v1/conversations/default');assert.equal(events.at(-1).idKind,'default');assert.equal(events.at(-1).request,2);
});
test('Request-carried signals are observed without altering cancellation or replaying reads',async()=>{
 const events=[],controller=new AbortController();let complete,calls=0;const pending=new Promise(resolve=>{complete=resolve;});const request=new Request(url,{signal:controller.signal});const fetch=observeMetadataFetch(async(i,init)=>{calls++;assert.equal(i,request);assert.equal(init,undefined);return pending;},'local',e=>events.push(e));
 const work=fetch(request);controller.abort(Error('private abort reason'));assert.equal(events.at(-1).stage,'abort');assert.equal(events.at(-1).aborted,true);complete(Response.json({}));const response=await work;assert.equal(calls,1);assert.equal(events.at(-1).stage,'headers');assert.equal(events.at(-1).aborted,true);assert(!JSON.stringify(events).includes('private abort reason'));await response.body.cancel();
});
test('network errors are rethrown unchanged and arbitrary error details never enter diagnostics',async()=>{
 const events=[],error=new TypeError('private error body and URL');error.cause={code:'PRIVATE_CODE',secret:'private cause'};const fetch=observeMetadataFetch(async()=>{throw error;},'local',e=>events.push(e));await assert.rejects(fetch(url),e=>e===error);assert.equal(events.at(-1).errorKind,'network');assert(!JSON.stringify(events).includes('private'));
});
test('a broken diagnostics sink cannot break a successful request',async()=>{
 const response=Response.json({ok:true}),fetch=observeMetadataFetch(async()=>response,'local',()=>{throw Error('fixture sink failure');});assert.equal(await fetch(url),response);await response.body.cancel();
});
test('installed SDK retry attempts become visible but diagnostics initiate no retries',async()=>{
 const events=[];let calls=0;const fetch=observeMetadataFetch(async()=>{calls++;return calls===1?Response.json({error:'fixture transient failure'},{status:503,headers:{'retry-after-ms':'1'}}):Response.json({id:C});},'local',e=>events.push(e));const client=new Letta({apiKey:'fixture-only-not-real',baseURL:'https://fixture.invalid',fetch,maxRetries:1});assert.equal((await client.conversations.retrieve(C)).id,C);assert.equal(calls,2);assert.deepEqual(events.filter(e=>e.stage==='headers').map(e=>e.status),[503,200]);assert.deepEqual(events.filter(e=>e.stage==='start').map(e=>e.request),[1,2]);assert.equal(new Set(events.map(e=>e.clientId)).size,1);
});
test('runtime factory instruments the selected transport rather than choosing a fallback account',()=>{
 const source=readFileSync(new URL('../src/electron/services/letta-runtime/index.ts',import.meta.url),'utf8');assert(source.includes('observeMetadataFetch(config.fetch ?? fetch, config.source)'));assert(source.includes('defaultHeaders: config.defaultHeaders'));
});
