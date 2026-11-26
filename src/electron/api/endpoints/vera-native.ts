import {CALLER_SESSION_ONLY_TOOLS} from '../../services/remote-access/caller-session-tools.js';
import { redactRuntimeSecrets } from '../../services/client-tools/runners/_shared/runtime-secrets.js';
import type { BaseHttpClient } from '../client/base-client.js';
import type { McpToolRunResult } from './mcp.js';
export type VeraDiscoveryInput = { area?: 'all' | 'native' | 'configured_connectors' | 'remote' | 'channels' | 'email' | 'schedules' | 'knowledge' | 'graph' | 'identity'; serverSlug?: string; query?: string; limit?: number; offset?: number; searchAllConnectors?: boolean ;};
type Tool = { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> ;};
type Catalog = 'native' | 'graph';
const endpoints = { native: '/mcp', graph: '/neo4j-mcp' } as const;
function diagnostic(error: unknown) { const status = (error as { httpStatus?: number ;})?.httpStatus; return { status: 'unavailable', reason: (error as Error)?.name === 'AbortError' ? 'cancelled' : status === 401 ? 'not_authenticated' : status === 403 ? 'permission_or_policy_denied' : status === 404 ? 'endpoint_unavailable_or_not_visible' : status === 429 ? 'rate_limited' : (error as Error)?.message === 'API_AUTH_STATE_CHANGED' ? 'session_changed' : 'server_or_network_error', ...(status ? { httpStatus: status } : {}), detail: 'No credential or identity fallback was attempted. Resource permission, sharing and machine readiness are checked separately at invocation.' }; }
async function rpc(client: BaseHttpClient, catalog: Catalog, method: 'tools/list' | 'tools/call', params: Record<string, unknown>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const result = await client.request<{ result?: any; error?: { code?: number ;} ;}>(endpoints[catalog], { method: 'POST', signal, accept: 'application/json, text/event-stream', rejectRedirects: true, retryAuthentication: method === 'tools/list', body: { jsonrpc: '2.0', id: 'cowork-native', method, params } });
  if (result?.error || !result || result.result === undefined) throw Object.assign(Error('Native MCP returned no usable result'), { rpcCode: result?.error?.code });
  return result.result;
}
async function catalog(client: BaseHttpClient, source: Catalog, signal?: AbortSignal) {
  const tools: Tool[] = []; let cursor: string | undefined; const seen = new Set<string>();
  for (let page = 0; page < 30; page++) {
    const result = await rpc(client, source, 'tools/list', cursor ? { cursor } : {}, signal);
    if (!Array.isArray(result.tools)) throw Error('Invalid native catalog');
    for (const tool of result.tools) { if (typeof tool?.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object') throw Error('Invalid native definition'); const valid = source === 'native' ? /^vera_[a-z0-9_]+$/i : /^neo4j_[a-z0-9_]+$/i; if (!valid.test(tool.name) || tool.name.includes('__')) continue; tools.push(tool); if (tools.length > 2000) throw Error('Native catalog exceeds safety bound'); }
    cursor = result.nextCursor; if (!cursor) return tools; if (typeof cursor !== 'string' || seen.has(cursor)) throw Error('Invalid native catalog cursor'); seen.add(cursor);
  }
  throw Error('Native catalog pagination incomplete');
}
function matchesArea(tool: Tool, area: string) { if (['all', 'native', 'graph'].includes(area)) return true; const text = (tool.name + ' ' + (tool.description ?? '')).toLowerCase(); if (area === 'identity') return tool.name === 'vera_whoami'; if (area === 'remote') return tool.name.includes('_remote_'); return text.includes(area === 'channels' ? 'channel' : area === 'schedules' ? 'schedule' : area); }
/** Explicitly reports incomplete catalog coverage. Discovery is not a resource
 * grant: native handlers retain their ACL, sharing and confirmation checks. */
export async function fetchVeraTools(client: BaseHttpClient, input: VeraDiscoveryInput, configured: (args: VeraDiscoveryInput) => Promise<McpToolRunResult>, signal?: AbortSignal): Promise<McpToolRunResult> {
  const area = input.area ?? (input.serverSlug && !['vera_native', 'vera_graph'].includes(input.serverSlug) ? 'configured_connectors' : 'all');
  if (area === 'configured_connectors') return configured({ ...input, area: undefined });
  if (input.serverSlug && ((!['vera_native', 'vera_graph'].includes(input.serverSlug)) || (input.serverSlug === 'vera_graph' && !['all', 'graph'].includes(area)) || (input.serverSlug === 'vera_native' && area === 'graph'))) return { isError: true, output: JSON.stringify({ code: 'DISCOVERY_AREA_CONFLICT', executed: false, detail: 'Select the native/graph catalog or an explicit configured connector; conflicting selectors are not rerouted.' }) };
  if (!client.isAuthenticated()) return { isError: true, output: JSON.stringify({ code: 'VERA_NOT_AUTHENTICATED', searchedCatalogs: [], diagnostics: [{ reason: 'not_authenticated' }], executed: false }) };
  const selected: Catalog[] = area === 'graph' || input.serverSlug === 'vera_graph' ? ['graph'] : input.serverSlug === 'vera_native' || area !== 'all' ? ['native'] : ['native', 'graph'];
  const session = client.authContextRevision, identity = client.currentUser?.id;
  const query = input.query?.replace(/^(?:vera_native|vera_graph)__/, '');
  const results = await Promise.allSettled([...selected.map(source => catalog(client, source, signal)), ...(area === 'all' && !input.serverSlug ? [configured({ ...input, area: undefined, offset: 0, limit: 50 })] : [])]);
  if (signal?.aborted) return { isError: true, output: JSON.stringify({ code: 'VERA_DISCOVERY_CANCELLED', executed: false }) };
  if (client.authContextRevision !== session || client.currentUser?.id !== identity) return { isError: true, output: JSON.stringify({ code: 'VERA_SESSION_CHANGED', executed: false }) };
  const catalogs: Record<string, unknown>[] = []; const tools: Record<string, unknown>[] = []; let connectors: unknown[] = []; let configuredResult: unknown = null;
  for (let i = 0; i < selected.length; i++) { const source = selected[i], result = results[i]; if (result.status === 'rejected') { catalogs.push({ catalog: source, ...diagnostic(result.reason) }); continue; } const definitions = result.value as Tool[]; catalogs.push({ catalog: source, status: 'listed', toolCount: definitions.length, authorization: 'enforced_at_invocation' }); for (const tool of definitions) if (matchesArea(tool, area) && (!query || (tool.name + ' ' + (tool.description ?? '')).toLowerCase().includes(query.toLowerCase()))) tools.push({ name: tool.name, toolName: tool.name, nativeName: tool.name, serverSlug: source === 'native' ? 'vera_native' : 'vera_graph', catalog: source, description: tool.description ?? '', inputSchema: tool.inputSchema, annotations: tool.annotations }); }
  const configuredPage = results[selected.length];
  if (configuredPage) { if (configuredPage.status === 'rejected') catalogs.push({ catalog: 'configured_connectors', ...diagnostic(configuredPage.reason) }); else { const result = configuredPage.value as McpToolRunResult; try { const parsed = JSON.parse(result.output); configuredResult = { code: parsed.code, nextOffset: parsed.nextOffset, truncated: parsed.truncated, totalMatching: parsed.totalMatching, selectionRequired: parsed.selectionRequired }; connectors = parsed.connectors ?? []; if (Array.isArray(parsed.tools)) tools.push(...parsed.tools); catalogs.push({ catalog: 'configured_connectors', status: result.isError ? 'reported_error' : parsed.truncated ? 'partial' : 'listed', code: parsed.code, connectorCount: connectors.length }); } catch { catalogs.push({ catalog: 'configured_connectors', status: 'unavailable', reason: 'invalid_catalog_response' }); } } }
  const offset = Math.max(0, input.offset ?? 0), limit = Math.max(1, Math.min(50, input.limit ?? 20)), page = tools.slice(offset, offset + limit);
  return { isError: !catalogs.some(c => c.status === 'listed' || c.status === 'partial'), output: JSON.stringify({ observedAt: new Date().toISOString(), selectionRequired: !!(configuredResult as { selectionRequired?: boolean ;} | null)?.selectionRequired, originalQuery: input.query, normalizedNativeQuery: query, catalogs, searchedCatalogs: catalogs.map(c => c.catalog), coverage: catalogs.every(c => c.status === 'listed') ? 'complete_for_selected_catalogs' : 'partial', connectors, tools: page, returned: page.length, totalMatching: tools.length, truncated: offset + page.length < tools.length, nextOffset: offset + page.length < tools.length ? offset + page.length : null, configuredResult, accessNote: 'Listed definitions are not proof of resource access or execution. Permissions, sharing, agent policy, confirmation and remote readiness remain enforced. Server-hidden tools cannot be enumerated by this client.', instruction: 'Use area=remote for native remote tools, area=graph for governed graph tools, or area=configured_connectors plus an explicit serverSlug for connectors. Call only exact returned toolName/schema. No catalog match is not an access denial.' }) };
}
export async function callVeraTool(client: BaseHttpClient, name: string, args: Record<string, unknown>, configured: () => Promise<McpToolRunResult>, signal?: AbortSignal): Promise<McpToolRunResult> {
  const source: Catalog | undefined = !name.includes('__') && /^vera_[a-z0-9_]+$/i.test(name) ? 'native' : !name.includes('__') && /^neo4j_[a-z0-9_]+$/i.test(name) ? 'graph' : undefined;
  if (!source) return configured();
  if (!client.isAuthenticated()) return { isError: true, output: JSON.stringify({ code: 'VERA_NOT_AUTHENTICATED', toolName: name, executed: false }) };
  if(name==='vera_run_remote_tool'&&CALLER_SESSION_ONLY_TOOLS.has(String(args.toolName)))return{isError:true,output:JSON.stringify({code:'VERIFIED_CALLER_SESSION_REQUIRED',toolName:name,requestedRemoteTool:args.toolName,executed:false,detail:'Do not invoke caller-session Vera API tools through a remote machine owner login.'})};
  let attempted = false;
  try {
    const session = client.authContextRevision, identity = client.currentUser?.id; const tools = await catalog(client, source, signal);
    // A successful refresh can replace the token; identity must not change. The
    // base client also rejects responses crossing a login/logout generation.
    if (session !== client.authContextRevision || identity !== client.currentUser?.id) throw Error('API_AUTH_STATE_CHANGED');
    if (!tools.some(t => t.name === name)) return { isError: true, output: JSON.stringify({ code: 'TOOL_NOT_IN_CURRENT_CATALOG', catalog: source, toolName: name, executed: false, detail: 'Not listed for this session. This does not prove a resource is nonexistent or permissions were denied.' }) };
    if (!client.accessToken || session !== client.authContextRevision) throw Error('API_AUTH_STATE_CHANGED');
    signal?.throwIfAborted(); const sentToken = client.accessToken; attempted = true; const result = await rpc(client, source, 'tools/call', { name, arguments: args }, signal);
    const output = Array.isArray(result.content) ? result.content.filter((c: any) => c.type === 'text' && typeof c.text === 'string').map((c: any) => c.text).join('\n') : '';
    return { isError: result.isError === true, output: JSON.stringify({ observedAt: new Date().toISOString(), catalog: source, toolName: name, status: result.isError ? 'tool_reported_error' : 'result_returned', execution: 'inspect_tool_receipt', output: redactRuntimeSecrets(output, undefined, [sentToken, client.accessToken]), nonTextContentTypes: Array.isArray(result.content) ? result.content.filter((c: any) => c.type !== 'text').map((c: any) => c.type) : [], detail: 'A tool response is not proof of business completion. No automatic retry was made.' }) };
  } catch (error) { return { isError: true, output: JSON.stringify({ observedAt: new Date().toISOString(), catalog: source, toolName: name, ...diagnostic(error), execution: attempted ? 'unconfirmed' : 'not_started', attempted, retried: false, detail: attempted ? 'Inspect the original operation receipt before retrying.' : 'Native discovery did not authorize an invocation.' }) }; }
}
