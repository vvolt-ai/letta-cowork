import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codingTools } from '../dist-electron/services/client-tools/runners/coding.js';
import { projectContextTool } from '../dist-electron/services/client-tools/runners/productivity.js';
import { runWithRuntimeContext } from '../dist-electron/services/client-tools/runners/_shared/runtime-context.js';
const exec = promisify(execFile);
const ctx = { signal: new AbortController().signal };
async function invoke(name,args){const tool=name==='ProjectContext'?projectContextTool:codingTools.find(t=>t.name===name);assert.ok(tool);return tool.run(args,ctx);}
async function json(name,args){const result=await invoke(name,args);assert.equal(result.isError,false,result.output);return JSON.parse(result.output);}
async function fixture(fn){
 const temp=await mkdtemp(join(tmpdir(),'cowork scope '));const root=await realpath(temp);
 try{
  await exec('git',['init','-q'],{cwd:root});
  const service=join(root,'services','api');const src=join(service,'src');
  await mkdir(src,{recursive:true});await mkdir(join(root,'.cowork','memory'),{recursive:true});
  await mkdir(join(service,'docs'),{recursive:true});
  await writeFile(join(root,'package.json'),JSON.stringify({scripts:{rootOnly:'node -e "process.exit(99)"'}}));
  await writeFile(join(root,'pnpm-lock.yaml'),'lockfileVersion: 9\n');
  await writeFile(join(service,'package.json'),JSON.stringify({name:'nested-api',dependencies:{'@nestjs/core':'11'},scripts:{probe:`"${process.execPath}" -e "process.stdout.write(process.cwd())"`}}));
  await writeFile(join(src,'entry.ts'),'export const entry = true;\n');
  await writeFile(join(root,'.cowork','project.md'),'# Saved architecture\nSources are notes, not fresh verification.\n');
  await writeFile(join(root,'.cowork','memory','decisions.md'),'needle reuse the existing scheduler\n');
  await writeFile(join(service,'docs','README.md'),'needle doc duplicate\n');
  await fn({root,service,src});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('context and detection distinguish repo, package and existing memory roots',()=>fixture(async({root,service,src})=>{
 const result=await json('ProjectContext',{path:src});
 assert.equal(result.gitRoot,root);assert.equal(result.projectRoot,service);assert.equal(result.packageRoot,service);
 assert.ok(result.entries.includes('src'));assert.ok(!result.entries.includes('services'));
 assert.ok(result.scripts.probe);assert.equal(result.scripts.rootOnly,undefined);
 assert.equal(result.projectMemory.memoryRoot,root);assert.match(result.projectMemory.profileExcerpt,/Saved architecture/);
 const detected=await json('ProjectDetect',{path:join(src,'entry.ts')});
 assert.equal(detected.repoRoot,root);assert.equal(detected.projectRoot,service);assert.equal(detected.packageManager,'pnpm');assert.equal(detected.hasGit,true);
 assert.ok(detected.frameworks.includes('NestJS')||detected.frameworks.includes('nestjs')||detected.frameworks.includes('NestJS/Nest'));
 const map=await json('ProjectMap',{path:service});assert.equal(map.repoRoot,root);assert.equal(map.projectRoot,service);assert.ok(map.configs.includes('services/api/package.json'));
}));
test('scripts and diagnostics use service cwd, never a sibling/root script',()=>fixture(async({root,service,src})=>{
 await writeFile(join(service,'package-lock.json'),'{}');
 const result=await json('ProjectRunScript',{path:src,script:'probe'});
 assert.equal(result.status,'success');assert.equal(result.projectRoot,service);assert.ok(result.output.includes(service));
 const failed=await invoke('ProjectRunScript',{path:service,script:'rootOnly'});assert.equal(failed.isError,true);
 const diagnostics=await json('CodeDiagnostics',{path:src,script:'probe'});assert.equal(diagnostics.status,'success');assert.equal(diagnostics.repoRoot,root);
}));
test('memory lookup prioritizes saved notes and preserves existing profiles',()=>fixture(async({root,service})=>{
 const matches=await json('ProjectMemorySearch',{projectPath:service,query:'needle',limit:1});
 assert.equal(matches[0].file,'.cowork/memory/decisions.md');
 const status=await json('ProjectMemoryStatus',{projectPath:service});assert.equal(status.memoryRoot,root);assert.equal(status.projectRoot,service);
 const before=await readFile(join(root,'.cowork','project.md'),'utf8');
 const bootstrap=await json('ProjectMemoryBootstrap',{projectPath:service});assert.equal(bootstrap.status,'existing');
 assert.equal(await readFile(join(root,'.cowork','project.md'),'utf8'),before);
 const read=await invoke('ProjectMemoryRead',{projectPath:service,file:'memory/decisions.md'});assert.match(read.output,/existing scheduler/);
}));
test('explicit service-local memory takes precedence without rewriting parent notes',()=>fixture(async({root,service})=>{
 await mkdir(join(service,'.cowork'),{recursive:true});await writeFile(join(service,'.cowork','project.md'),'# local service\n');
 const status=await json('ProjectMemoryStatus',{projectPath:service});assert.equal(status.memoryRoot,service);assert.equal(status.repoRoot,root);
 const read=await invoke('ProjectMemoryRead',{projectPath:service,file:'project.md'});assert.match(read.output,/local service/);
 const write=await invoke('ProjectMemoryWrite',{projectPath:service,file:'memory/testing.md',content:'Use probe for this fixture.'});assert.equal(write.isError,false,write.output);
 assert.match(await readFile(join(service,'.cowork','memory','testing.md'),'utf8'),/probe/);
 assert.match(await readFile(join(root,'.cowork','project.md'),'utf8'),/Saved architecture/);
 assert.deepEqual(status.memoryRoots,[service,root]);
 const inherited=await json('ProjectMemorySearch',{projectPath:service,query:'existing scheduler'});
 assert.equal(inherited[0].file,'.cowork/memory/decisions.md');
}));
test('relative/default project paths follow concurrent trusted session cwd',()=>fixture(async({service,root})=>{
 const [a,b]=await Promise.all([runWithRuntimeContext({workingDirectory:service},()=>json('ProjectContext',{})),runWithRuntimeContext({workingDirectory:root},()=>json('ProjectContext',{}))]);
 assert.equal(a.projectRoot,service);assert.equal(b.projectRoot,root);
 const result=await runWithRuntimeContext({workingDirectory:service},()=>json('ProjectDetect',{path:'src'}));assert.equal(result.projectRoot,service);
}));
test('bounds profile output and rejects memory symlink escapes',()=>fixture(async({root,service})=>{
 await writeFile(join(root,'.cowork','project.md'),'x'.repeat(12000));
 const result=await json('ProjectContext',{path:service,includeScripts:false});assert.equal(result.scripts,undefined);assert.equal(result.projectMemory.profileTruncated,true);assert.ok(result.projectMemory.profileExcerpt.length<=8000);
 await symlink(join(service,'docs'),join(root,'.cowork','escape'),'dir');
 const read=await invoke('ProjectMemoryRead',{projectPath:service,file:'escape/README.md'});assert.equal(read.isError,true);
 const write=await invoke('ProjectMemoryWrite',{projectPath:service,file:'escape/new.md',content:'blocked'});assert.equal(write.isError,true);
}));
test('non-git directory remains valid and missing paths fail explicitly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nongit-project-'));
 try{await writeFile(join(root,'package.json'),JSON.stringify({name:'nongit'}));const result=await json('ProjectDetect',{path:root});assert.equal(result.hasGit,false);assert.equal(result.name,'nongit');const missing=await invoke('ProjectContext',{path:join(root,'missing')});assert.equal(missing.isError,true);}finally{await rm(root,{recursive:true,force:true});}
});
