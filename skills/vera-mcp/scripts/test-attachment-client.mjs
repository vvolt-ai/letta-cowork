// Synthetic localhost protocol fixtures only; no provider/customer or real tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./call-mcp.mjs', import.meta.url));
async function run(name,args,url,directory) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,name],{env:{PATH:process.env.PATH??'',HOME:directory,VERA_COWORK_ENV_PATH:join(directory,'missing.env'),COWORK_TOKEN:'synthetic-not-real',VERA_COWORK_API_URL:url,VERA_MCP_URL:url}});
  let stdout='',stderr=''; child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));child.stdin.end(JSON.stringify(args));
 });
}
test('attachmentRef-only and artifact reader pass through the allowlisted fallback',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'skill-attachment-client-'));const calls=[];
 const server=createServer(async(req,res)=>{let data='';for await(const part of req)data+=part;const parsed=JSON.parse(data);calls.push(parsed.params);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({synthetic:true})}]}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const url=`http://127.0.0.1:${server.address().port}/mcp`;
  const ref={attachmentRef:'A'.repeat(64)};const download=await run('vera_get_email_attachment',ref,url,directory);
  assert.equal(download.code,0);assert.deepEqual(calls[0],{name:'vera_get_email_attachment',arguments:ref});
  const artifact={artifactId:'11111111-1111-4111-8111-111111111111',offset:0,maxBytes:4096};const read=await run('vera_read_artifact',artifact,url,directory);
  assert.equal(read.code,0);assert.deepEqual(calls[1],{name:'vera_read_artifact',arguments:artifact});
  const rejected=await run('arbitrary_unlisted_tool',{},url,directory);assert.notEqual(rejected.code,0);assert.equal(calls.length,2);
  assert.ok(!download.stdout.includes('synthetic-not-real'));
 }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
test('native guide requires scoped refs, re-listing and separate inspection',async()=>{
 const vera=await readFile(new URL('../SKILL.md',import.meta.url),'utf8');
 assert.ok(vera.includes('attachmentRef'));assert.ok(vera.includes('15 minutes'));assert.ok(vera.includes('re-list'));
 assert.ok(vera.includes('downloaded does not mean inspected'));assert.ok(vera.includes('do not combine it with channel/message/account/folder/raw attachment fields'));
});
