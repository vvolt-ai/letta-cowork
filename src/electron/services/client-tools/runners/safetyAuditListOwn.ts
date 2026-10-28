import { getVeraCoworkApiClient } from '../../../api/index.js';
import type { ClientToolDefinition } from '../types.js';

interface AuditApi {
  readonly apiBaseUrl: string;
  readonly accessToken: string | null;
  readonly currentUser: { id: string; organizationId: string } | null;
  isAuthenticated(): boolean;
}
const ENUMS: Record<string, readonly string[]> = {
  source: ['desktop', 'api', 'channel', 'scheduler', 'email', 'remote-runner', 'tool', 'system'],
  severity: ['info', 'low', 'medium', 'high', 'critical'],
  status: ['allowed', 'blocked', 'flagged', 'failed'],
};
const STRINGS: Record<string, number> = {
  eventType: 96,
  category: 48,
  channelId: 128,
  conversationId: 128,
  agentId: 128,
  toolName: 128,
  from: 128,
  to: 128,
};
const EVENT_FIELDS = [
  'id',
  'createdAt',
  'actorType',
  'source',
  'eventType',
  'severity',
  'category',
  'status',
  'decision',
  'confidence',
  'summary',
  'redactedExcerpt',
  'channelId',
  'conversationId',
  'agentId',
  'toolName',
  'metadata',
];
function queryFor(args: Record<string, unknown>): URLSearchParams {
  const allowed = new Set(['page', 'pageSize', ...Object.keys(ENUMS), ...Object.keys(STRINGS)]);
  if (Object.keys(args).some((key) => !allowed.has(key))) throw Error('UNSUPPORTED_FILTER');
  const params = new URLSearchParams();
  for (const [key, fallback, max] of [
    ['page', 1, Number.MAX_SAFE_INTEGER],
    ['pageSize', 10, 25],
  ] as const) {
    const value = args[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max)
      throw Error('INVALID_FILTER');
    params.set(key, String(value));
  }
  for (const [key, values] of Object.entries(ENUMS))
    if (args[key] !== undefined) {
      if (typeof args[key] !== 'string' || !values.includes(args[key] as string))
        throw Error('INVALID_FILTER');
      params.set(key, args[key] as string);
    }
  for (const [key, max] of Object.entries(STRINGS))
    if (args[key] !== undefined) {
      const value = args[key];
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > max ||
        /[\x00-\x1f]/.test(value)
      )
        throw Error('INVALID_FILTER');
      if (
        (key === 'from' || key === 'to') &&
        (!/T.*(?:Z|[+-]\d\d:\d\d)$/i.test(value) || !Number.isFinite(Date.parse(value)))
      )
        throw Error('INVALID_FILTER');
      params.set(key, value.trim());
    }
  if (
    params.has('from') &&
    params.has('to') &&
    Date.parse(params.get('from')!) > Date.parse(params.get('to')!)
  )
    throw Error('INVALID_FILTER');
  return params;
}
/** Own-user JWT endpoint only. No model-supplied identity, admin fallback,
 * remote-machine login, raw database access or cached results. */
export function createSafetyAuditListOwnTool(
  resolveApi: () => AuditApi = getVeraCoworkApiClient,
  fetcher: typeof fetch = fetch,
): ClientToolDefinition {
  const properties: Record<string, unknown> = {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
  };
  for (const [key, values] of Object.entries(ENUMS))
    properties[key] = { type: 'string', enum: [...values] };
  for (const [key, maxLength] of Object.entries(STRINGS))
    properties[key] = {
      type: 'string',
      maxLength,
      ...(key === 'from' || key === 'to' ? { format: 'date-time' } : {}),
    };
  return {
    name: 'SafetyAuditListOwn',
    description:
      "Read the signed-in Vera user's own database-backed safety/tool-policy audit events. Filter by tool, agent, conversation, status or time. User and organization are fixed by the authenticated Vera session, never model arguments. Not raw server console logs: stdout/stderr may be omitted. Never execute on a shared remote machine.",
    parameters: { type: 'object', properties, additionalProperties: false },
    run: async (args, ctx) => {
      let params: URLSearchParams;
      try {
        params = queryFor(args);
      } catch {
        return {
          isError: true,
          output:
            'SafetyAuditListOwn: invalid or unsupported filter. User/organization overrides are forbidden; pageSize must be1–25.',
        };
      }
      try {
        ctx.signal.throwIfAborted();
        const api = resolveApi();
        const identity = () =>
          JSON.stringify([api.apiBaseUrl, api.currentUser?.id, api.currentUser?.organizationId]);
        if (
          !api.isAuthenticated() ||
          !api.accessToken ||
          !api.currentUser?.id ||
          !api.currentUser.organizationId
        )
          return {
            isError: true,
            output:
              'SafetyAuditListOwn requires a signed-in Vera user and organization. Sign in through Cowork; do not provide tokens in chat.',
          };
        const actor = identity();
        const url = new URL(api.apiBaseUrl.replace(/\/$/, '') + '/safety-audit-events/me');
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (url.protocol !== 'https:' &&
            !(
              url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            ))
        )
          throw Error('INVALID_VERA_ORIGIN');
        url.search = params.toString();
        const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(20000)]);
        const response = await fetcher(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${api.accessToken}`, Accept: 'application/json' },
          redirect: 'error',
          signal,
        });
        if (!response.ok)
          return {
            isError: true,
            output: `SafetyAuditListOwn: Vera returned HTTP ${response.status}. Verify login, access and filters; no alternate identity or admin endpoint was used.`,
          };
        const reader = response.body?.getReader();
        if (!reader) throw Error('INVALID_RESPONSE');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 256 * 1024) {
              await reader.cancel();
              throw Error('RESPONSE_LIMIT');
            }
            chunks.push(part.value);
          }
        } finally {
          reader.releaseLock();
        }
        signal.throwIfAborted();
        if (resolveApi() !== api || actor !== identity() || !api.isAuthenticated())
          throw Error('VERA_IDENTITY_CHANGED');
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          !Array.isArray(data.items) ||
          data.items.length > Number(params.get('pageSize')) ||
          !Number.isSafeInteger(data.total)
        )
          throw Error('INVALID_RESPONSE');
        const items = data.items.map((event: unknown) => {
          if (!event || typeof event !== 'object' || Array.isArray(event))
            throw Error('INVALID_RESPONSE');
          return Object.fromEntries(
            EVENT_FIELDS.filter((key) => Object.hasOwn(event, key)).map((key) => [
              key,
              (event as Record<string, unknown>)[key],
            ]),
          );
        });
        return {
          isError: false,
          output: JSON.stringify({
            items,
            total: data.total,
            page: data.page,
            pageSize: data.pageSize,
            totalPages: data.totalPages,
          }),
        };
      } catch {
        return {
          isError: true,
          output: ctx.signal.aborted
            ? 'SafetyAuditListOwn cancelled.'
            : 'SafetyAuditListOwn failed or its authenticated scope changed. Result discarded; no fallback was used.',
        };
      }
    },
  };
}
export const safetyAuditListOwnTool = createSafetyAuditListOwnTool();
