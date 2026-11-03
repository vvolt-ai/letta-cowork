import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import Letta from '@letta-ai/letta-client';
import {DesktopSdkSession} from '../dist-electron/libs/runner/sdk/session.js';
import {DesktopAppServerPool} from '../dist-electron/services/letta-runtime/desktop-app-server-pool.js';
import {startDesktopAppServer} from '../dist-electron/services/letta-runtime/native-host.js';
import {registerClientTool} from '../dist-electron/services/client-tools/index.js';
const require=createRequire(import.meta.url),electron=require('electron');
const A='agent-11111111-1111-1111-1111-111111111111',C=n=>'conv-22222222-2222-2222-2222-'+String(n).padStart(12,'0');
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const poll=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Fixture condition did not arrive');};
const agent={id:A,name:'Fixture',agent_type:'letta_v1_agent',model:'openai/gpt-test',tags:[],tools:[],tool_rules:[],system:'Fixture only',memory:{blocks:[]},llm_config:{model:'gpt-test',model_endpoint_type:'openai',context_window:32000},embedding_config:{embedding_model:'fixture',embedding_endpoint_type:'openai',embedding_dim:1536}};
const frame=(res,data)=>res.write('data: '+JSON.stringify(data)+'\n\n');

test('actual Electron App Server multiplexes scoped conversations, reuses a host and isolates cancellation', {timeout:90000},async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'cowork-shared-native-')),requests=[],paths=[],cancellations=[],runs=new Map(),steps=new Map(),streams=new Map(),toolEntries=[],permissionEntries=[],gates=new Map([[C(1),deferred()],[C(2),deferred()]]);let runNumber=0,starts=0;
 const finish=(id,reason='end_turn')=>{const item=streams.get(id);if(item&&!item.res.writableEnded){runs.set(id,{...runs.get(id),status:reason==='cancelled'?'cancelled':'completed'});frame(item.res,{message_type:'stop_reason',run_id:id,stop_reason:reason});item.res.end('data: [DONE]\n\n');}};
 const api=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://fixture').pathname;paths.push(req.method+' '+path);let raw='';for await(const data of req)raw+=data;const body=raw?JSON.parse(raw):{};
   if(path.endsWith('/cancel')){const ids=/\/runs\/([^/]+)\/cancel$/.exec(path);const selected=ids?[ids[1]]:body.run_ids;cancellations.push({path,ids:selected});for(const id of selected)finish(id,'cancelled');res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true}));return;}
   if(req.method==='POST'&&path.endsWith('/messages')){
    const cid=/\/conversations\/([^/]+)\/messages$/.exec(path)?.[1]??body.conversation_id;
    requests.push({path,cid,body});assert([C(1),C(2),C(3),C(4)].includes(cid),'Native payload must identify its canonical conversation');
    const n=(steps.get(cid)??0)+1;steps.set(cid,n);const run='run-44444444-4444-4444-4444-'+String(++runNumber).padStart(12,'0');runs.set(run,{id:run,status:'running',agent_id:A,conversation_id:cid});res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    if(cid===C(3)||cid===C(4)){streams.set(run,{res,cid});frame(res,{id:'message-start-'+run,message_type:'assistant_message',run_id:run,content:'Fixture inflight '+cid});return;}
    if(n===1){const tool=(body.client_tools??[]).find(t=>/PoolFixture[AB]/.test(t.name));assert(tool,'Scoped callback was supplied');frame(res,{id:'message-tool-'+run,message_type:'approval_request_message',run_id:run,tool_call:{tool_call_id:'same-tool-call-id',name:tool.name,arguments:JSON.stringify({tag:cid})}});runs.set(run,{...runs.get(run),status:'completed'});frame(res,{message_type:'stop_reason',run_id:run,stop_reason:'requires_approval'});}else{frame(res,{id:'message-final-'+run,message_type:'assistant_message',run_id:run,content:'Fixture final '+cid});runs.set(run,{...runs.get(run),status:'completed'});frame(res,{message_type:'stop_reason',run_id:run,stop_reason:'end_turn'});}res.end('data: [DONE]\n\n');return;
   }
   res.writeHead(200,{'content-type':'application/json'});
   const run=/\/runs\/([^/]+)$/.exec(path);if(run){res.end(JSON.stringify(runs.get(run[1])??{}));return;}
   const convo=/\/conversations\/([^/]+)$/.exec(path);if(convo){res.end(JSON.stringify({id:convo[1],agent_id:A,model:'openai/gpt-test',created_at:new Date().toISOString()}));return;}
   if(path.includes('/agents/'+A)){res.end(JSON.stringify(agent));return;}if(path.endsWith('/recompile')){res.end(JSON.stringify('Fixture prompt'));return;}if(path.includes('/models')){res.end(JSON.stringify({models:[]}));return;}res.end(JSON.stringify([]));
  }catch(error){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({error:String(error)}));}
 });api.listen(0,'127.0.0.1');await once(api,'listening');const baseURL='http://127.0.0.1:'+api.address().port,provider={source:'local',baseURL,apiKey:'fixture-only-not-real'};
 const pool=new DesktopAppServerPool(async opts=>{starts++;return startDesktopAppServer({...opts,profileRoot:root,executablePath:electron});});
 const owned=[],consumers=[];const track=p=>{consumers.push(p);void p.catch(()=>{});return p;};const removeA=registerClientTool({name:'PoolFixtureA',description:'Fixture A',parameters:{type:'object',properties:{tag:{type:'string'}}},run:async(input,ctx)=>{toolEntries.push({name:'A',input,ctx});return{output:'effect-A',isError:false};}}),removeB=registerClientTool({name:'PoolFixtureB',description:'Fixture B',parameters:{type:'object',properties:{tag:{type:'string'}}},run:async(input,ctx)=>{toolEntries.push({name:'B',input,ctx});return{output:'effect-B',isError:false};}});
 const scope={key:'shared-native:'+baseURL,config:provider,assertCurrent:()=>{},client:new Letta({apiKey:provider.apiKey,baseURL})};
 const make=(n)=>{const session=new DesktopSdkSession({agentId:A,conversationId:C(n),scope,cwd:join(root,'cwd-'+n),memoryDisabled:true,inheritedContext:{signal:new AbortController().signal,runtimeEnv:{FIXTURE_SCOPE:String(n)}},tools:n===1?['PoolFixtureA']:n===2?['PoolFixtureB']:[],permissionMode:n===1?'unrestricted':'strict',canUseTool:async(_name,input)=>{permissionEntries.push(input.tag);await gates.get(input.tag).promise;return{behavior:'allow'};}},{acquire:o=>pool.acquire(o)});owned.push(session);return session;};
 const consume=async(session)=>{let text='',terminal=false;for await(const m of session.stream()){if(m.type==='assistant')text+=m.content;if(m.type==='result'){assert(m.success);terminal=true;}}return{text,terminal};};
 try{
  const a=make(1),b=make(2);await Promise.all([a.send('fixture A'),b.send('fixture B')]);const sa=track(consume(a)),sb=track(consume(b));await poll(()=>permissionEntries.length===2);assert.equal(starts,1);
  gates.get(C(1)).resolve();assert((await sa).text.includes(C(1)));await a.abort();assert.equal(pool.hostCount,1);assert.equal(pool.leaseCount,1);gates.get(C(2)).resolve();assert((await sb).text.includes(C(2)));await b.abort();assert.equal(toolEntries.length,2);for(const entry of toolEntries){const n=entry.name==='A'?1:2;assert.equal(entry.ctx.conversationId,C(n));assert.equal(entry.input.tag,C(n));assert.equal(entry.ctx.workingDirectory,join(root,'cwd-'+n));assert.equal(entry.ctx.runtimeEnv.FIXTURE_SCOPE,String(n));}
  const again=make(1);await again.send('fixture next turn');assert((await consume(again)).terminal);await again.abort();assert.equal(starts,1);
  const x=make(3),y=make(4);await Promise.all([x.send('fixture X'),y.send('fixture Y')]);const sx=track(consume(x).catch(e=>({cancelled:String(e)}))),sy=track(consume(y));await poll(()=>[...streams.values()].filter(s=>!s.res.writableEnded).length===2);await x.abort();await sx;assert.equal(cancellations.length,1);assert(cancellations[0].ids.every(id=>runs.get(id).conversation_id===C(3)));const liveB=[...runs.values()].find(r=>r.conversation_id===C(4)&&r.status==='running');assert(liveB);assert.equal(starts,1);finish(liveB.id);assert((await sy).terminal);await y.abort();assert.equal(pool.leaseCount,0);assert.equal(starts,1);assert(!paths.some(p=>p.includes('/git/')));assert(requests.some(r=>JSON.stringify(r.body).includes('effect-A')));assert(requests.some(r=>JSON.stringify(r.body).includes('effect-B')));
 }catch(error){console.log('Fixture failure diagnostics',JSON.stringify({error:String(error),callbacks:toolEntries.map(e=>e.name),submissions:requests.map(r=>({cid:r.cid,path:r.path})),sessions:owned.map(s=>({cid:s.conversationId,runs:[...s.controls.ownedRuns],receipts:s.receipts.size}))}));throw error;}finally{
  for(const gate of gates.values())gate.resolve();for(const id of streams.keys())finish(id,'cancelled');await Promise.allSettled(owned.map(s=>s.abort()));await Promise.allSettled(consumers);await pool.shutdown();removeA();removeB();api.closeAllConnections();await new Promise(r=>api.close(r));await fs.rm(root,{recursive:true,force:true});
 }
});
