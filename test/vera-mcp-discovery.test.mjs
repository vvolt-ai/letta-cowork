import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/electron/services/client-tools/runners/veraMcp.ts',import.meta.url),'utf8');
function load(client){const module={exports:{}};const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(id=>{assert.ok(id.includes('api/index.js'));return {getVeraCoworkApiClient:()=>client};},module,module.exports);return module.exports.veraMcpTools;}
test('desktop preserves structured unavailable-connector errors and suggestions',async()=>{
 const payload={code:'CONNECTOR_NOT_AVAILABLE',suggestedTools:[{toolName:'stage__odoo_search',name:'stage__odoo_search',serverSlug:'stage'}],selectionRequired:true,executed:false};let input;
 const tools=load({mcpFetchVisibleTools:async args=>{input=args;return {isError:true,output:JSON.stringify(payload)};}});const result=await tools.find(tool=>tool.name==='VeraMcpListTools').run({serverSlug:'odoo',query:'odoo__odoo_search'},{});assert.equal(result.isError,true);assert.deepEqual(JSON.parse(result.output),payload);assert.equal(input.serverSlug,'odoo');
});
test('desktop global results retain exact names and paging without double prefixes',async()=>{
 let input;const tools=load({mcpFetchVisibleTools:async args=>{input=args;return {output:JSON.stringify({tools:[{name:'prod__odoo_search',toolName:'prod__odoo_search',nativeName:'odoo_search',serverSlug:'prod',inputSchema:{type:'object'}}],nextOffset:5,truncated:true,totalMatching:10,selectionRequired:true})};}});
 const result=await tools.find(tool=>tool.name==='VeraMcpListTools').run({query:'odoo__odoo_search',searchAllConnectors:true,limit:5,offset:0},{});const payload=JSON.parse(result.output);assert.equal(payload.tools[0].name,'prod__odoo_search');assert.deepEqual(payload.tools[0].parameters,{type:'object'});assert.equal(payload.nextOffset,5);assert.equal(payload.selectionRequired,true);assert.equal(input.searchAllConnectors,true);
});
test('desktop stale invocation calls only the exact original namespace and preserves errors',async()=>{
 const calls=[];const tools=load({mcpInvokeVisibleTool:async(name,args)=>{calls.push({name,args});return {isError:true,output:JSON.stringify({code:'CONNECTOR_NOT_AVAILABLE',suggestedTools:[],executed:false})};}});const result=await tools.find(tool=>tool.name==='VeraMcpCallTool').run({toolName:'odoo__odoo_search',args:{}},{});assert.deepEqual(calls,[{name:'odoo__odoo_search',args:{}}]);assert.equal(result.isError,true);assert.equal(JSON.parse(result.output).executed,false);
});
