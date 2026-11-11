import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import dotenv from 'dotenv';
import Store from 'electron-store';

// Synthetic fixtures only: never open app userData, actual credentials or .env.
test('dotenv 18 preserves explicit environment precedence and parses isolated input',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cowork-env-compat-'));
 try{const path=join(root,'fixture.env');await writeFile(path,'FIXTURE_EXISTING=from-file\nFIXTURE_QUOTED="hello # world"\nFIXTURE_NUMBER=42\n');const env={FIXTURE_EXISTING:'from-parent'};const result=dotenv.config({path,processEnv:env,quiet:true});assert.ifError(result.error);assert.equal(env.FIXTURE_EXISTING,'from-parent');assert.equal(env.FIXTURE_QUOTED,'hello # world');assert.equal(env.FIXTURE_NUMBER,'42');}
 finally{await rm(root,{recursive:true,force:true});}
});
test('electron-store 12 retains legacy JSON values and path without touching real app settings',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cowork-store-compat-'));
 try{const file=join(root,'fixture-settings.json');const original={theme:'dark',selectedAgentId:'agent-fixture',nested:{keep:true}};await writeFile(file,JSON.stringify(original));const store=new Store({cwd:root,name:'fixture-settings',watch:false});assert.equal(store.path,file);assert.equal(store.get('theme'),'dark');assert.equal(store.get('selectedAgentId'),'agent-fixture');store.set('theme','light');const next=JSON.parse(await readFile(file,'utf8'));assert.equal(next.selectedAgentId,original.selectedAgentId);assert.deepEqual(next.nested,original.nested);assert.equal(next.theme,'light');}
 finally{await rm(root,{recursive:true,force:true});}
});
const require=createRequire(import.meta.url);
test('updated Electron keeps the installed PTY native binding executable',{skip:!process.versions.electron},async()=>{
 assert.equal(process.versions.electron,'45.3.0');assert.equal(process.versions.modules,'150');
 const pty=require('node-pty');await new Promise((resolve,reject)=>{let output='';const windows=process.platform==='win32';const child=pty.spawn(windows?'cmd.exe':'/bin/sh',windows?['/c','echo PTY_DEPENDENCY_OK']:['-c','printf PTY_DEPENDENCY_OK'],{cwd:tmpdir(),env:{PATH:process.env.PATH??'/usr/bin:/bin'}});const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic PTY did not exit'));},5000);child.onData(chunk=>output+=chunk);child.onExit(({exitCode})=>{clearTimeout(timer);try{assert.equal(exitCode,0);assert.match(output,/PTY_DEPENDENCY_OK/);resolve();}catch(error){reject(error);}});});
});
test('updated Electron can execute Sharp image processing',{skip:!process.versions.electron},async()=>{
 const sharp=require('sharp');const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#008000'}}).png().toBuffer();const image=await sharp(bytes).metadata();assert.equal(image.width,2);assert.equal(image.height,2);
});
