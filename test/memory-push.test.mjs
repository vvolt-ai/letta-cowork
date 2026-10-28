import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import http from 'node:http';
import {pushMemoryCommit} from '../dist-electron/services/memfs/memory-push.js';
import {createScopedMemory} from '../dist-electron/services/memfs/scoped-memory.js';
import {executeAgentMemory} from '../dist-electron/services/memfs/agent-memory-access.js';
const exec=promisify(execFile),AGENT='agent-11111111-1111-1111-1111-111111111111',A='a'.repeat(40),B='b'.repeat(40);
function fake(options={}){
 let remote=options.before??A,changed=false;const calls=[];
 const git=async(args,authenticated=false)=>{
  calls.push({args,authenticated});let stdout='';
  if(args[0]==='config')stdout=options.config??'core.repositoryformatversion\nremote.origin.url';
  if(args[0]==='remote')stdout='https://fixture.invalid/v1/git/'+AGENT+'/state.git';
  if(args[0]==='status')stdout=options.dirty?' M fixture.md\0':'';
  if(args[0]==='symbolic-ref')stdout='refs/heads/main';
  if(args[0]==='rev-parse')stdout=args[1]==='--show-toplevel'?'/fixture':args[1]==='--absolute-git-dir'?'/fixture/.git':args[1]==='--git-common-dir'?'.git':args[2]==='FETCH_HEAD'?remote:B;
  if(args[0]==='rev-list')stdout=options.behind??'0';
  if(args[0]==='push'){if(options.changeScopeAfterPush)changed=true;if(options.accept!==false)remote=B;if(options.failPush)throw Error('fake acknowledgment lost');}
  if(args[0]==='ls-remote'){if(options.failRead)throw Error('fake read failed');stdout=remote+'\trefs/heads/main';}
  return {stdout};
 };
 return {calls,run:()=>pushMemoryCommit({agentId:AGENT,path:'/fixture',remote:'https://fixture.invalid/v1/git/'+AGENT+'/state.git',expectedRevision:B,git,guard:()=>{if(options.badScope||changed)throw Error('MEMORY_PUSH_AUTH_CHANGED');}})};
}
test('confirmed publication helper is exact-ref, no force/tag/hook commands and verifies remote',async()=>{
 const f=fake();const receipt=await f.run();assert.equal(receipt.state,'pushed');assert.equal(receipt.verified,true);const push=f.calls.filter(c=>c.args[0]==='push');assert.equal(push.length,1);assert.deepEqual(push[0].args,['push','--porcelain','--no-follow-tags','--recurse-submodules=no','--','https://fixture.invalid/v1/git/'+AGENT+'/state.git',B+':refs/heads/main']);assert.equal(push[0].authenticated,true);assert(!f.calls.some(c=>['merge','reset','rebase','stash','commit'].includes(c.args[0])));
});
test('a lost push acknowledgment is not replayed and can be verified by exact remote ref',async()=>{
 const f=fake({failPush:true});assert.equal((await f.run()).state,'pushed');assert.equal(f.calls.filter(c=>c.args[0]==='push').length,1);
});
test('failed or uncertain push stays unverified without retry or data loss',async()=>{
 const f=fake({accept:false,failPush:true});assert.equal((await f.run()).state,'unverified');assert.equal(f.calls.filter(c=>c.args[0]==='push').length,1);
});
test('changed actor after dispatch gets unknown outcome without another credentialed operation',async()=>{const f=fake({changeScopeAfterPush:true});assert.equal((await f.run()).state,'unverified');assert.equal(f.calls.filter(c=>c.args[0]==='push').length,1);assert(!f.calls.some(c=>c.args[0]==='ls-remote'));});
test('already synchronized commit is read-verified without another push',async()=>{
 const f=fake({before:B});assert.equal((await f.run()).state,'up_to_date');assert(!f.calls.some(c=>c.args[0]==='push'));
});
for(const [label,options,code] of [['dirty',{dirty:true},'LOCAL_CHANGES_PRESERVED'],['remote changed',{behind:'1'},'MEMORY_PUSH_REMOTE_CHANGES_PRESERVED'],['URL rewrite',{config:'url.https://else.invalid/.insteadof'},'MEMORY_PUSH_UNSAFE_LOCAL_CONFIG'],['scope changed',{badScope:true},'MEMORY_PUSH_AUTH_CHANGED']])test('push preserves state when '+label,async()=>{const f=fake(options);await assert.rejects(f.run(),new RegExp(code));assert(!f.calls.some(c=>c.args[0]==='push'));});
test('tool requires confirmation, primary target and matching runtime identity before publication',async()=>{
 const publish=async()=>{throw Error('should not execute');};const access={snapshot:async()=>({agentId:AGENT}),refresh:async()=>({agentId:AGENT}),push:publish};
 await assert.rejects(executeAgentMemory({action:'push',expectedRevision:B},access,AGENT),/CONFIRMATION/);
 await assert.rejects(executeAgentMemory({action:'push',confirm:true,repository:'core_system',expectedRevision:B},access,AGENT),/SHARED_MEMORY/);
 await assert.rejects(executeAgentMemory({action:'push',confirm:true,expectedRevision:B},access,'agent-22222222-2222-2222-2222-222222222222'),/IDENTITY/);
});

async function repositoryFixture(){
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'memory-publication-fixture-'));
 const bare=join(root,'v1','git',AGENT,'state.git'),seed=join(root,'seed');await fs.mkdir(bare,{recursive:true});await fs.mkdir(seed);
 const local=async(cwd,...args)=>(await exec('git',args,{cwd,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0'},timeout:20000})).stdout.trim();
 await local(bare,'init','--bare','--initial-branch=main');await local(bare,'config','http.receivepack','true');await local(seed,'init','--initial-branch=main');await local(seed,'config','user.name','Fixture');await local(seed,'config','user.email','fixture@example.invalid');await fs.writeFile(join(seed,'fixture.md'),'---\ndescription: Synthetic fixture\n---\nInitial');await local(seed,'add','.');await local(seed,'commit','-m','synthetic seed');await local(seed,'push',bare,'main');
 const backend=join((await exec('git',['--exec-path'])).stdout.trim(),'git-http-backend');const apiKey='synthetic-memory-key',calls=[];
 const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://fixture.invalid');const expected=url.pathname.includes('/repositories')?'Bearer '+apiKey:'Basic '+Buffer.from('letta:'+apiKey).toString('base64');calls.push({path:url.pathname,method:request.method,authorized:request.headers.authorization===expected});
  if(request.headers.authorization!==expected){response.writeHead(401,{'WWW-Authenticate':'Basic realm="fixture"'});response.end();return;}
  if(url.pathname.endsWith('/repositories')){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({repositories:[]}));return;}
  const child=spawn(backend,[],{env:{...process.env,GIT_PROJECT_ROOT:root,GIT_HTTP_EXPORT_ALL:'1',REMOTE_USER:'fixture',PATH_INFO:url.pathname,QUERY_STRING:url.search.slice(1),REQUEST_METHOD:request.method,CONTENT_TYPE:request.headers['content-type']||'',CONTENT_LENGTH:request.headers['content-length']||'',SERVER_PROTOCOL:'HTTP/1.1'},stdio:['pipe','pipe','pipe']});let prelude=Buffer.alloc(0),started=false;
  child.stdout.on('data',chunk=>{if(started){response.write(chunk);return;}prelude=Buffer.concat([prelude,chunk]);const split=prelude.indexOf('\r\n\r\n');if(split<0)return;for(const line of prelude.subarray(0,split).toString().split('\r\n')){const colon=line.indexOf(':');if(colon<0)continue;const name=line.slice(0,colon),value=line.slice(colon+1).trim();if(name.toLowerCase()==='status')response.statusCode=Number(value.split(' ')[0]);else response.setHeader(name,value);}started=true;response.write(prelude.subarray(split+4));});child.stderr.resume();child.on('error',()=>{response.statusCode=500;response.end();});child.on('close',()=>response.end());request.pipe(child.stdin);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const memory=createScopedMemory({agentId:AGENT,baseURL:origin,apiKey,cacheRoot:join(root,'cache')});const initial=await memory.sync();assert.equal(initial.state,'ready');const path=initial.memoryDir;await local(path,'config','user.name','Fixture');await local(path,'config','user.email','fixture@example.invalid');
 return {root,path,memory,calls,apiKey,bare,seed,local,async commit(){await fs.appendFile(join(path,'fixture.md'),'\nLocal fixture');await local(path,'add','fixture.md');await local(path,'-c','core.hooksPath='+join(root,'no-hooks'),'commit','-m','synthetic local');return local(path,'rev-parse','HEAD');},async cleanup(){await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}};
}
test('real Git HTTP: local commits survive sync then publish with ephemeral scoped auth',{skip:process.platform==='win32'},async()=>{
 const f=await repositoryFixture();try{
  const head=await f.commit();const preserved=await f.memory.sync();assert.equal(preserved.repositories[0].errorCode,'UNPUSHED_COMMITS_PRESERVED');assert.equal(await f.local(f.path,'rev-parse','HEAD'),head);
  await f.local(f.path,'config','push.followTags','true');await f.local(f.path,'config','push.recurseSubmodules','on-demand');await f.local(f.path,'tag','-a','fixture-never-publish','-m','synthetic private tag');
  const hookMarker=join(f.root,'hook-must-not-run');await fs.writeFile(join(f.path,'.git','hooks','pre-push'),'#!/bin/sh\nprintf bad > "'+hookMarker+'"\n',{mode:0o755});
  const receipt=await f.memory.push({confirm:true,expectedRevision:head});
  await assert.rejects(fs.access(hookMarker));
  assert.equal(await f.local(f.bare,'for-each-ref','--format=%(refname)','refs/tags'),'');assert.equal(receipt.state,'pushed');assert.equal(receipt.verified,true);assert.equal(await f.local(f.bare,'rev-parse','refs/heads/main'),head);assert.equal((await f.memory.snapshot()).repositories[0].state,'cached');assert.equal((await f.memory.push({confirm:true,expectedRevision:head})).state,'up_to_date');
  assert(f.calls.some(c=>c.path.endsWith('git-receive-pack')&&c.authorized));assert(!(await fs.readFile(join(f.path,'.git','config'),'utf8')).includes(f.apiKey));assert(!JSON.stringify(f.calls).includes(f.apiKey));
 }finally{await f.cleanup();}
});
test('real Git HTTP: stale confirmation, dirty files and remote divergence never push',{skip:process.platform==='win32'},async()=>{
 const f=await repositoryFixture();try{
  const head=await f.commit();await assert.rejects(f.memory.push({confirm:true,expectedRevision:A}),/REVISION_CHANGED/);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(f.memory.push({confirm:true,expectedRevision:head,signal:cancelled.signal}),/MEMORY_PUSH_CANCELLED/);
  await fs.writeFile(join(f.path,'uncommitted.txt'),'preserve');await assert.rejects(f.memory.push({confirm:true,expectedRevision:head}),/LOCAL_CHANGES_PRESERVED/);await fs.unlink(join(f.path,'uncommitted.txt'));
  await fs.appendFile(join(f.seed,'fixture.md'),'\nIndependent remote fixture');await f.local(f.seed,'add','.');await f.local(f.seed,'commit','-m','synthetic remote');await f.local(f.seed,'push',f.bare,'main');
  await assert.rejects(f.memory.push({confirm:true,expectedRevision:head}),/REMOTE_CHANGES_PRESERVED/);assert.equal(await f.local(f.path,'rev-parse','HEAD'),head);assert(!f.calls.some(c=>c.path.endsWith('git-receive-pack')));
 }finally{await f.cleanup();}
});
