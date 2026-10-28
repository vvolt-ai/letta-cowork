import {test,expect} from 'bun:test';
import {registerTools} from './tools.js';
import {VeraClient} from './client.js';
function harness(client){const tools=new Map();registerTools({capabilities:{tools:true},tools:{register(tool){tools.set(tool.name,tool);return()=>{};}}},client);return tools;}
const suggestion={name:'verivolt_prod__odoo_search',toolName:'verivolt_prod__odoo_search',nativeName:'odoo_search',serverSlug:'verivolt_prod',inputSchema:{type:'object',properties:{domain:{type:'array'}}}};
test('namespaced searches use authoritative configured discovery and preserve actual suggestions',async()=>{
 const inputs=[];const tools=harness({async fetchMcpTools(input){inputs.push(input);return {isError:true,output:JSON.stringify({code:'CONNECTOR_NOT_AVAILABLE',suggestedTools:[suggestion],selectionRequired:true,executed:false})};},async listMcpTools(){throw Error('Must not use local stale filtering');}});
 const result=await tools.get('vera_mcp_list_tools').run({args:{serverSlug:'odoo',query:'odoo__odoo_search',includeSchemas:true}});const payload=JSON.parse(result.content);expect(result.isError).toBe(true);expect(inputs[0].serverSlug).toBe('odoo');expect(payload.suggestedTools[0]).toMatchObject({name:suggestion.name,parameters:suggestion.inputSchema});expect(payload.executed).toBe(false);
});
test('configured area query and default-area namespaced query opt into global search',async()=>{
 const inputs=[];const tools=harness({async fetchMcpTools(input){inputs.push(input);return {output:JSON.stringify({tools:[suggestion],truncated:false})};}});
 for(const args of [{area:'configured_connectors',query:'odoo_search'},{query:'odoo__odoo_search'}]){const text=await tools.get('vera_mcp_list_tools').run({args});const payload=JSON.parse(text);expect(payload.tools[0].name).toBe(suggestion.name);expect(payload.tools[0].parameters).toBeUndefined();}
 expect(inputs.every(input=>input.searchAllConnectors===true)).toBe(true);
});
test('a stale invocation forwards exactly the original name for authoritative rejection, never a suggested alternative',async()=>{
 const calls=[];const tools=harness({async invokeMcpTool(name,args){calls.push({name,args});return {isError:true,output:JSON.stringify({code:'CONNECTOR_NOT_AVAILABLE',suggestedTools:[suggestion],executed:false})};}});
 const result=await tools.get('vera_mcp_call_tool').run({args:{toolName:'odoo__odoo_search',args:{domain:[]}}});expect(calls).toEqual([{name:'odoo__odoo_search',args:{domain:[]}}]);expect(JSON.parse(result.content).suggestedTools).toHaveLength(1);
});
test('client posts catalog query fields intact through the authenticated request path',async()=>{
 const calls=[];const input={query:'odoo__odoo_search',searchAllConnectors:true,offset:10,limit:5};await VeraClient.prototype.fetchMcpTools.call({request:async(path,options)=>{calls.push({path,options});return {};}},input);expect(calls[0]).toMatchObject({path:'/mcp/tools/fetch',options:{method:'POST',body:input}});
});
