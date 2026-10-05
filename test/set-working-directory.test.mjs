import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setWorkingDirectoryTool } from '../dist-electron/services/client-tools/runners/setWorkingDirectory.js';

test('directory switch updates only the owning session, not process CWD', async()=>{
 const root=await mkdtemp(join(tmpdir(),'owned-cwd-'));
 try {
  await mkdir(join(root,'child'));
  let current=root; const original=process.cwd();
  const ctx={signal:new AbortController().signal,workingDirectory:current,setWorkingDirectory:(dir)=>{current=dir;}};
  const result=await setWorkingDirectoryTool.run({path:'child'},ctx);
  assert.equal(result.isError,false); assert.equal(current,join(root,'child')); assert.equal(process.cwd(),original);
  const missing=await setWorkingDirectoryTool.run({path:'missing'}, {...ctx,workingDirectory:current});
  assert.equal(missing.isError,true); assert.equal(current,join(root,'child'));
  const unsupported=await setWorkingDirectoryTool.run({path:root},{signal:ctx.signal,workingDirectory:root});
  assert.equal(unsupported.isError,true);
  const child=await setWorkingDirectoryTool.run({path:root},{...ctx,conversationId:'child',workingDirectoryOwnerConversationId:'parent'});
  assert.equal(child.isError,true); assert.match(child.output,/Inherited parent/); assert.equal(current,join(root,'child'));
 } finally {await rm(root,{recursive:true,force:true});}
});
