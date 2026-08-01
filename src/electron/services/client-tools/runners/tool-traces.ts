import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from '../types.js';
import { redactRuntimeSecrets } from './_shared/runtime-secrets.js';

const TRACE_VERSION = 1;
const TRACE_DIR = join(homedir(), '.letta', 'cowork-tools', 'tool-traces');
const RETENTION_DAYS = 30;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_ARG_CHARS = 8_000;
const MAX_OUTPUT_PREVIEW_CHARS = 2_000;
const MAX_SEARCH_OUTPUT_CHARS = 32_000;
const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|credential|password|passwd|private[_-]?key|secret|session|token|api[_-]?key|runtimeenv)/i;

export type ToolTraceStatus = 'success' | 'error' | 'denied';

export interface ToolTraceRecord {
  version: number;
  traceId: string;
  toolCallId: string;
  toolName: string;
  status: ToolTraceStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  agentId?: string;
  conversationId?: string;
  args: unknown;
  outputPreview: string;
  outputChars: number;
  isError: boolean;
}

export interface ToolTraceSearchOptions {
  query?: string;
  toolName?: string;
  status?: ToolTraceStatus;
  agentId?: string;
  conversationId?: string;
  since?: string;
  limit?: number;
}

let appendQueue: Promise<void> = Promise.resolve();
let lastCleanupDate = '';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function redactPatterns(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g,
      '[REDACTED]',
    )
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    );
}

function sanitizeValue(
  value: unknown,
  runtimeEnv: ToolRunContext['runtimeEnv'],
  depth = 0,
): unknown {
  if (depth > 8) return '[max depth]';
  if (typeof value === 'string') {
    return truncate(redactPatterns(redactRuntimeSecrets(value, runtimeEnv)), MAX_ARG_CHARS);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, runtimeEnv, depth + 1));
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      sanitized[key] = SECRET_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeValue(nested, runtimeEnv, depth + 1);
    }
    return sanitized;
  }
  return value;
}

function boundedArgs(
  args: Record<string, unknown>,
  runtimeEnv: ToolRunContext['runtimeEnv'],
): unknown {
  const sanitized = sanitizeValue(args, runtimeEnv);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_ARG_CHARS) return sanitized;
  return { summary: truncate(serialized, MAX_ARG_CHARS) };
}

function traceFileFor(isoTimestamp: string): string {
  return join(TRACE_DIR, `${isoTimestamp.slice(0, 10)}.ndjson`);
}

async function cleanupExpiredTraceFiles(now: Date): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  if (lastCleanupDate === today) return;
  lastCleanupDate = today;

  let files: string[];
  try {
    files = await fs.readdir(TRACE_DIR);
  } catch {
    return;
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await Promise.allSettled(
    files
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(file) && file.slice(0, 10) < cutoff)
      .map((file) => fs.unlink(join(TRACE_DIR, file))),
  );
}

export async function appendToolTrace(input: {
  traceId?: string;
  toolCallId?: string;
  toolName: string;
  status: ToolTraceStatus;
  startedAt: Date;
  endedAt?: Date;
  args: Record<string, unknown>;
  result: ToolRunResult;
  context: ToolRunContext;
}): Promise<void> {
  const endedAt = input.endedAt ?? new Date();
  const output = redactPatterns(
    redactRuntimeSecrets(input.result.output, input.context.runtimeEnv),
  );
  const traceId = input.traceId ?? randomUUID();
  const record: ToolTraceRecord = {
    version: TRACE_VERSION,
    traceId,
    toolCallId: input.toolCallId ?? input.context.toolCallId ?? traceId,
    toolName: input.toolName,
    status: input.status,
    startedAt: input.startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - input.startedAt.getTime()),
    agentId: input.context.agentId,
    conversationId: input.context.conversationId,
    args: boundedArgs(input.args, input.context.runtimeEnv),
    outputPreview: truncate(output, MAX_OUTPUT_PREVIEW_CHARS),
    outputChars: input.result.output.length,
    isError: input.result.isError,
  };

  appendQueue = appendQueue
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(TRACE_DIR, { recursive: true });
      await fs.appendFile(traceFileFor(record.endedAt), `${JSON.stringify(record)}\n`, 'utf-8');
      await cleanupExpiredTraceFiles(endedAt);
    });
  await appendQueue;
}

function parseSince(value: string | undefined): Date {
  if (!value) return new Date(Date.now() - DEFAULT_LOOKBACK_MS);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('since must be a valid ISO date/time');
  }
  return parsed;
}

export async function searchToolTraces(
  options: ToolTraceSearchOptions,
): Promise<ToolTraceRecord[]> {
  const since = parseSince(options.since);
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
  const query = options.query?.trim().toLowerCase();

  let files: string[];
  try {
    files = (await fs.readdir(TRACE_DIR))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(file))
      .filter((file) => file.slice(0, 10) >= since.toISOString().slice(0, 10))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const matches: ToolTraceRecord[] = [];
  for (const file of files) {
    const lines = (await fs.readFile(join(TRACE_DIR, file), 'utf-8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse();
    for (const line of lines) {
      let record: ToolTraceRecord;
      try {
        record = JSON.parse(line) as ToolTraceRecord;
      } catch {
        continue;
      }
      if (new Date(record.startedAt) < since) continue;
      if (options.toolName && record.toolName !== options.toolName) continue;
      if (options.status && record.status !== options.status) continue;
      if (options.agentId && record.agentId !== options.agentId) continue;
      if (options.conversationId && record.conversationId !== options.conversationId) {
        continue;
      }
      if (query && !JSON.stringify(record).toLowerCase().includes(query)) continue;
      matches.push(record);
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type RunTimelineEventKind = 'proposal' | 'regeneration' | 'patch_apply' | 'diagnostics' | 'test';

interface RunTimelineEvent {
  id: string;
  timestamp: string;
  kind: RunTimelineEventKind;
  toolName: string;
  status: string;
  summary: string;
  durationMs: number;
  conversationId?: string;
  repoRoot?: string;
  proposalId?: string;
  linkedProposalIds: string[];
  files: string[];
  details: Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseTraceOutput(record: ToolTraceRecord): Record<string, unknown> {
  try {
    return recordValue(JSON.parse(record.outputPreview));
  } catch {
    return {};
  }
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function tracePaths(args: Record<string, unknown>, output: Record<string, unknown>): string[] {
  return ['repoRoot', 'repoPath', 'projectPath', 'path']
    .flatMap((key) => [asOptionalString(output[key]), asOptionalString(args[key])])
    .filter((value): value is string => Boolean(value));
}

function pathsOverlap(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  const isWithin = (root: string, candidate: string) => {
    const path = relative(root, candidate);
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  return isWithin(a, b) || isWithin(b, a);
}

function timelineKind(record: ToolTraceRecord, args: Record<string, unknown>): RunTimelineEventKind | undefined {
  if (record.toolName === 'LiveProposePatch') return 'proposal';
  if (record.toolName === 'LiveRegeneratePatch') return 'regeneration';
  if (record.toolName === 'LiveApplyPatch') return 'patch_apply';
  if (record.toolName === 'CodeDiagnostics') return 'diagnostics';
  if (record.toolName === 'TestRunRelated' || record.toolName === 'TestRunByName') return 'test';
  if (record.toolName === 'ProjectRunScript' && /(?:test|spec|check|lint|typecheck|build)/i.test(asOptionalString(args.script) ?? '')) return 'diagnostics';
  return undefined;
}

function eventFiles(args: Record<string, unknown>, output: Record<string, unknown>): string[] {
  return [...new Set([
    ...stringValues(output.files),
    ...stringValues(output.sourceFiles),
    ...stringValues(output.testFiles),
    ...stringValues(args.files),
  ])].slice(0, 200);
}

function timelineSummary(kind: RunTimelineEventKind, args: Record<string, unknown>, output: Record<string, unknown>): string {
  if (kind === 'proposal') return asOptionalString(args.title) ?? 'Patch proposed';
  if (kind === 'regeneration') return asOptionalString(args.title) ?? 'Conflicted patch regenerated';
  if (kind === 'patch_apply') return `Patch ${asOptionalString(output.status) ?? 'application completed'}`;
  if (kind === 'test') {
    const runner = recordValue(output.runner);
    return `${asOptionalString(runner.kind) ?? 'Test'} run ${asOptionalString(output.status) ?? 'completed'}`;
  }
  const script = asOptionalString(args.script);
  return script ? `Validation script ${script}` : `Diagnostics ${asOptionalString(output.status) ?? 'completed'}`;
}

export async function buildRunTimeline(options: {
  projectPath: string;
  conversationId?: string;
  since?: string;
  limit?: number;
}): Promise<{ repoRoot: string; events: RunTimelineEvent[]; links: Array<{ from: string; to: string; type: string; proposalId?: string; reason: string }>; summary: Record<string, number> }> {
  const repoRoot = resolve(options.projectPath);
  const traces = (await searchToolTraces({
    conversationId: options.conversationId,
    since: options.since,
    limit: options.limit ?? 200,
  })).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const proposalRepos = new Map<string, string>();
  for (const trace of traces) {
    const args = recordValue(trace.args);
    const output = parseTraceOutput(trace);
    const proposalId = asOptionalString(output.proposalId);
    const previousProposalId = asOptionalString(args.proposalId);
    const directRepo = tracePaths(args, output).find((path) => pathsOverlap(repoRoot, path));
    const inferredRepo = directRepo ?? (previousProposalId ? proposalRepos.get(previousProposalId) : undefined);
    if (proposalId && inferredRepo) proposalRepos.set(proposalId, inferredRepo);
  }

  const events: RunTimelineEvent[] = [];
  for (const trace of traces) {
    const args = recordValue(trace.args);
    const output = parseTraceOutput(trace);
    const kind = timelineKind(trace, args);
    if (!kind) continue;
    const outputProposalId = asOptionalString(output.proposalId);
    const inputProposalId = asOptionalString(args.proposalId);
    const proposalId = outputProposalId ?? inputProposalId;
    const directRepo = tracePaths(args, output).find((path) => pathsOverlap(repoRoot, path));
    const eventRepo = directRepo ?? (proposalId ? proposalRepos.get(proposalId) : undefined);
    if (!eventRepo || !pathsOverlap(repoRoot, eventRepo)) continue;
    const status = asOptionalString(output.status) ?? trace.status;
    const details: Record<string, unknown> = {};
    for (const key of ['command', 'runner', 'script', 'name', 'count', 'errorCount', 'warningCount']) {
      if (output[key] !== undefined) details[key] = output[key];
      else if (args[key] !== undefined) details[key] = args[key];
    }
    events.push({
      id: trace.traceId,
      timestamp: trace.endedAt,
      kind,
      toolName: trace.toolName,
      status,
      summary: timelineSummary(kind, args, output),
      durationMs: trace.durationMs,
      conversationId: trace.conversationId,
      repoRoot: resolve(eventRepo),
      proposalId,
      linkedProposalIds: proposalId ? [proposalId] : [],
      files: eventFiles(args, output),
      details,
    });
  }

  const links: Array<{ from: string; to: string; type: string; proposalId?: string; reason: string }> = [];
  const proposalEvents = new Map<string, RunTimelineEvent>();
  const lastAppliedByContext = new Map<string, RunTimelineEvent>();
  for (const event of events) {
    if ((event.kind === 'proposal' || event.kind === 'regeneration') && event.proposalId) {
      proposalEvents.set(event.proposalId, event);
      if (event.kind === 'regeneration') {
        const trace = traces.find((candidate) => candidate.traceId === event.id);
        const previousId = asOptionalString(recordValue(trace?.args).proposalId);
        const previous = previousId ? proposalEvents.get(previousId) : undefined;
        if (previous && previousId) {
          event.linkedProposalIds = [...new Set([...event.linkedProposalIds, previousId])];
          links.push({ from: previous.id, to: event.id, type: 'superseded_by', proposalId: previousId, reason: 'Regeneration replaced a conflicted proposal' });
        }
      }
      continue;
    }
    if (event.kind === 'patch_apply' && event.proposalId) {
      const proposal = proposalEvents.get(event.proposalId);
      if (proposal) links.push({ from: proposal.id, to: event.id, type: 'applies', proposalId: event.proposalId, reason: 'Application targets this proposal' });
      if (/^(?:applied|partially_applied|success)$/i.test(event.status)) {
        lastAppliedByContext.set(`${event.conversationId ?? ''}:${event.repoRoot}`, event);
      }
      continue;
    }
    if (event.kind === 'diagnostics' || event.kind === 'test') {
      const applied = lastAppliedByContext.get(`${event.conversationId ?? ''}:${event.repoRoot}`);
      if (applied) {
        event.linkedProposalIds = [...new Set([...event.linkedProposalIds, ...applied.linkedProposalIds])];
        links.push({ from: applied.id, to: event.id, type: 'validates', proposalId: applied.proposalId, reason: event.kind === 'test' ? 'Test run followed the applied patch' : 'Diagnostics followed the applied patch' });
      }
    }
  }

  return {
    repoRoot,
    events,
    links,
    summary: {
      proposals: events.filter((event) => event.kind === 'proposal' || event.kind === 'regeneration').length,
      applications: events.filter((event) => event.kind === 'patch_apply').length,
      diagnostics: events.filter((event) => event.kind === 'diagnostics').length,
      tests: events.filter((event) => event.kind === 'test').length,
      failures: events.filter((event) => /^(?:failed|error|denied)$/i.test(event.status)).length,
    },
  };
}

export const runTimelineTool: ClientToolDefinition = {
  name: 'RunTimeline',
  description: 'Build a structured local timeline that links live patch proposals and applications to subsequent diagnostics and test runs in the same repository and conversation.',
  parameters: {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: 'Repository path. Defaults to the current working directory.' },
      conversationId: { type: 'string', description: 'Optional conversation filter. Defaults to all conversations.' },
      since: { type: 'string', description: 'ISO date/time; defaults to 24 hours ago.' },
      limit: { type: 'number', minimum: 1, maximum: 200, description: 'Maximum source traces to inspect. Default 200.' },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const timeline = await buildRunTimeline({
        projectPath: asOptionalString(args.projectPath) ?? process.cwd(),
        conversationId: asOptionalString(args.conversationId),
        since: asOptionalString(args.since),
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      const totalEvents = timeline.events.length;
      let response = { ...timeline, totalEvents, truncated: false };
      let output = JSON.stringify(response, null, 2);
      while (output.length > MAX_SEARCH_OUTPUT_CHARS && response.events.length > 1) {
        const events = response.events.slice(1);
        const retainedIds = new Set(events.map((event) => event.id));
        response = {
          ...response,
          events,
          links: response.links.filter((link) => retainedIds.has(link.from) && retainedIds.has(link.to)),
          truncated: true,
        };
        output = JSON.stringify(response, null, 2);
      }
      return { output, isError: false };
    } catch (error) {
      return { output: error instanceof Error ? error.message : String(error), isError: true };
    }
  },
};

export const toolTraceSearchTool: ClientToolDefinition = {
  name: 'ToolTraceSearch',
  description:
    'Search recent structured client-tool execution traces by text, tool, status, agent, conversation, or time. Traces are local, redacted, retained for 30 days, and default to the last 24 hours.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Case-insensitive text search across trace fields.' },
      toolName: { type: 'string' },
      status: { type: 'string', enum: ['success', 'error', 'denied'] },
      agentId: { type: 'string' },
      conversationId: { type: 'string' },
      since: { type: 'string', description: 'ISO date/time; defaults to 24 hours ago.' },
      limit: { type: 'number', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const records = await searchToolTraces({
        query: asOptionalString(args.query),
        toolName: asOptionalString(args.toolName),
        status: asOptionalString(args.status) as ToolTraceStatus | undefined,
        agentId: asOptionalString(args.agentId),
        conversationId: asOptionalString(args.conversationId),
        since: asOptionalString(args.since),
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      const output = JSON.stringify({ count: records.length, traces: records }, null, 2);
      return {
        output: truncate(output, MAX_SEARCH_OUTPUT_CHARS),
        isError: false,
      };
    } catch (error) {
      return {
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  },
};
