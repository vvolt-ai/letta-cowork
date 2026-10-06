import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { downloadVeraArtifact } from './artifact-download.js';
import { VeraClient } from './client.js';
import { registerTools } from './tools.js';
const ID='11111111-1111-4111-8111-111111111111';
const digest=data=>createHash('sha256').update(data).digest('hex');
const chunk=(data,args)=>{const bytes=data.subarray(args.offset,args.offset+args.maxBytes);return {artifactId:ID,filename:'invoice.pdf',contentType:'application/pdf',size:data.length,sha256:digest(data),offset:args.offset,bytesRead:bytes.length,nextOffset:args.offset+bytes.length,eof:args.offset+bytes.length===data.length,encoding:'base64',data:bytes.toString('base64')};};
const clientFor=data=>({invokeMcpTool:async(name,args)=>{expect(name).toBe('vera_read_artifact');expect(args).not.toHaveProperty('token');return {isError:false,output:JSON.stringify(chunk(data,args))};}});
async function workspace(fn){const root=await mkdtemp(join(tmpdir(),'vera-artifact-download-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
describe('Local artifact download',()=>{
 test('uses real protected VeraClient MCP requests, preserves API prefix and saves exact bytes without model output',()=>workspace(async root=>{
  const data=Buffer.from(Array.from({length:95000},(_,i)=>i%256)),requests=[];
  const client=new VeraClient({fetch:async(url,options)=>{requests.push({url,options});const rpc=JSON.parse(options.body);return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{content:[{type:'text',text:JSON.stringify(chunk(data,rpc.params.arguments))}]}}),{headers:{'content-type':'application/json'}});}});
  client.getState=async()=>({serverUrl:'https://vera.fixture.example/api',auth:{accessToken:'fixture-secret'}});
  client.resolveAuthentication=async()=>({accessToken:'fixture-secret',serverUrl:'https://vera.fixture.example/api',source:'letta-code'});
  const result=await downloadVeraArtifact(client,{artifactId:ID,filePath:'invoice.pdf',expectedSha256:digest(data)},{cwd:root});
  expect(result.saved).toBe(true);expect(result.size).toBe(data.length);expect(result.sha256).toBe(digest(data));expect(await readFile(join(root,'invoice.pdf'))).toEqual(data);
  expect(requests.length).toBeGreaterThan(1);expect(requests.every(r=>r.url==='https://vera.fixture.example/api/mcp')).toBe(true);expect(requests.every(r=>new Headers(r.options.headers).get('authorization')==='Bearer fixture-secret')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('fixture-secret');expect(result).not.toHaveProperty('data');if(process.platform!=='win32')expect((await stat(join(root,'invoice.pdf'))).mode&0o777).toBe(0o600);expect((await readdir(root)).filter(f=>f.endsWith('.partial'))).toEqual([]);
 }));
 test('rejects escaping/existing destinations without touching existing data',()=>workspace(async root=>{
  const client=clientFor(Buffer.from('test'));await writeFile(join(root,'existing.pdf'),'keep');
  await expect(downloadVeraArtifact(client,{artifactId:ID,filePath:'../escape.pdf'},{cwd:root})).rejects.toThrow('approved workspace');
  await expect(downloadVeraArtifact(client,{artifactId:ID,filePath:'existing.pdf'},{cwd:root})).rejects.toThrow('already exists');expect(await readFile(join(root,'existing.pdf'),'utf8')).toBe('keep');
  await expect(downloadVeraArtifact(client,{artifactId:'https://untrusted.example',filePath:'new.pdf'},{cwd:root})).rejects.toThrow('UUID');
 }));
 test('rejects symlink destinations',()=>workspace(async root=>{
  if(process.platform==='win32')return;
  await symlink(tmpdir(),join(root,'link'),'dir');await expect(downloadVeraArtifact(clientFor(Buffer.from('x')),{artifactId:ID,filePath:'link/escape.pdf'},{cwd:root})).rejects.toThrow('symlinks');
 }));
 test('fails closed on digest corruption and cleans partial files',()=>workspace(async root=>{
  const data=Buffer.from('source'),client={invokeMcpTool:async(_name,args)=>({isError:false,output:JSON.stringify({...chunk(data,args),sha256:'0'.repeat(64)})})};
  await expect(downloadVeraArtifact(client,{artifactId:ID,filePath:'corrupt.pdf'},{cwd:root})).rejects.toThrow('SHA-256');expect(await readdir(root)).toEqual([]);
 }));
 test('enforces original digest, size bound and consistent offsets',()=>workspace(async root=>{
  const data=Buffer.alloc(20000,0x42);
  await expect(downloadVeraArtifact(clientFor(data),{artifactId:ID,filePath:'large.pdf',maxBytes:10},{cwd:root})).rejects.toThrow('size');
  await expect(downloadVeraArtifact(clientFor(data),{artifactId:ID,filePath:'wrong.pdf',expectedSha256:'0'.repeat(64)},{cwd:root})).rejects.toThrow('requested file');
  const invalid={invokeMcpTool:async(_name,args)=>({isError:false,output:JSON.stringify({...chunk(data,args),nextOffset:1})})};
  await expect(downloadVeraArtifact(invalid,{artifactId:ID,filePath:'offset.pdf'},{cwd:root})).rejects.toThrow('inconsistent');expect(await readdir(root)).toEqual([]);
 }));
 test('mid-transfer authorization/expiry errors never expose raw details or publish a partial file',()=>workspace(async root=>{
  const data=Buffer.alloc(20000,0x42);let calls=0;
  const client={invokeMcpTool:async(_name,args)=>++calls===1?{isError:false,output:JSON.stringify(chunk(data,args))}:{isError:true,output:'upstream fixture-secret'}};
  await expect(downloadVeraArtifact(client,{artifactId:ID,filePath:'expired.pdf'},{cwd:root})).rejects.toThrow('Verify the same user');expect(await readdir(root)).toEqual([]);
 }));
 test('destination created during transfer is never replaced',()=>workspace(async root=>{
  const data=Buffer.from('test');const client={invokeMcpTool:async(_name,args)=>{await writeFile(join(root,'contested.pdf'),'keep');return {isError:false,output:JSON.stringify(chunk(data,args))};}};
  await expect(downloadVeraArtifact(client,{artifactId:ID,filePath:'contested.pdf'},{cwd:root})).rejects.toThrow('no overwrite');expect(await readFile(join(root,'contested.pdf'),'utf8')).toBe('keep');expect((await readdir(root)).filter(f=>f.endsWith('.partial'))).toEqual([]);
 }));
 test('cancellation bounds a stalled client and removes partial data',()=>workspace(async root=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20);
  try{await expect(downloadVeraArtifact({invokeMcpTool:()=>new Promise(()=>{})},{artifactId:ID,filePath:'cancelled.pdf'},{cwd:root,signal:controller.signal})).rejects.toThrow('cancelled');expect(await readdir(root)).toEqual([]);}finally{clearTimeout(timer);}
 }));
 test('registered local tool requires approval and returns only completion metadata',()=>workspace(async root=>{
  const tools=new Map();registerTools({capabilities:{tools:true},tools:{register:t=>{tools.set(t.name,t);return()=>{};}}},clientFor(Buffer.alloc(0)));
  const tool=tools.get('vera_download_artifact');expect(tool.requiresApproval).toBe(true);expect(tool.parallelSafe).toBe(false);
  const result=JSON.parse(await tool.run({args:{artifactId:ID,filePath:'empty.bin'},cwd:root}));expect(result.saved).toBe(true);expect(await readFile(join(root,'empty.bin'))).toEqual(Buffer.alloc(0));expect(result).not.toHaveProperty('data');
 }));
});
