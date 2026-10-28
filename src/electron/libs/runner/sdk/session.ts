import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  LettaAgentClient,
  type LettaCodeSession,
  type SDKMessage,
  type SDKInitMessage,
  type SendMessage,
  type CanUseToolResponse,
  type AnyAgentTool,
} from '@letta-ai/letta-agent-sdk';
import type { Letta } from '@letta-ai/letta-client';
import { getVeraCoworkApiClient } from '../../../api/index.js';
import {
  createLettaRuntimeClient,
  getLettaRuntimeConfig,
  getLettaConnectionScope,
  type LettaRuntimeConfig,
} from '../../../services/letta-runtime/index.js';
import {
  startDesktopAppServer,
  type DesktopNativeBinding,
  type DesktopNativeOptions,
} from '../../../services/letta-runtime/native-host.js';
import {
  createScopedMemory,
  type SessionMemoryAccess,
} from '../../../services/memfs/scoped-memory.js';
import { getClientToolsForWire, runClientTool } from '../../../services/client-tools/index.js';
import type { ToolRunContext } from '../../../services/client-tools/types.js';
import { SdkToolScheduler } from './tool-scheduler.js';
import { redactRuntimeSecrets } from '../../../services/client-tools/runners/_shared/runtime-secrets.js';
import { PlanModeManager } from '../plan-mode/mode-manager.js';
import { buildTurnReminders, createReminderState } from '../plan-mode/reminders.js';
import { DesktopNativeControls } from './native-controls.js';
import {delegatedToolNames} from './tool-grants.js';
import {ODOO_ATTACHMENT_TOOL} from '../../../services/client-tools/runners/_shared/attachmentApproval.js';
import { classifyStreamTermination } from './terminal-stop.js';

export interface DesktopSdkScope {
  config: LettaRuntimeConfig;
  client: Letta;
  key: string;
  assertCurrent(): void;
}
export interface DesktopSdkSessionOptions {
  agentId?: string;
  conversationId?: string;
  cwd?: string;
  model?: string;
  lettaConnectionId?: string;
  permissionMode?: 'standard' | 'acceptEdits' | 'unrestricted' | 'strict';
  canUseTool?: (name: string, input: unknown, signal?: AbortSignal) => Promise<CanUseToolResponse>;
  memoryDisabled?: boolean;
  scope?: DesktopSdkScope;
  inheritedContext?: ToolRunContext;
  tools?: readonly string[];
  maxTurns?: number;
}
export interface DesktopSdkDependencies {
  launch?: (options: DesktopNativeOptions) => Promise<DesktopNativeBinding>;
  open?: (
    binding: DesktopNativeBinding,
    controls: DesktopNativeControls,
  ) => Promise<LettaAgentClient>;
}
const owners = new Map<string, DesktopSdkSession>();
const sessions = new Set<DesktopSdkSession>();
const schedulers = new WeakMap<DesktopSdkScope, SdkToolScheduler>();
function actor() {
  const api = getVeraCoworkApiClient();
  return JSON.stringify([api.apiBaseUrl, api.currentUser?.id, api.currentUser?.organizationId]);
}
export function captureDesktopSdkScope(connectionId?: string): DesktopSdkScope {
  const config = getLettaRuntimeConfig(connectionId);
  const identity = actor();
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        config.source,
        config.baseURL,
        getLettaConnectionScope(connectionId),
        config.source === 'local' ? config.apiKey : identity,
      ]),
    )
    .digest('hex');
  const assertCurrent = () => {
    const current = getLettaRuntimeConfig(connectionId);
    if (
      current.source !== config.source ||
      current.baseURL !== config.baseURL ||
      (config.source === 'local' ? current.apiKey !== config.apiKey : actor() !== identity)
    )
      throw Error('SDK_ACCOUNT_SCOPE_CHANGED');
  };
  assertCurrent();
  return { config, key, assertCurrent, client: createLettaRuntimeClient(connectionId) };
}
export function getOwnedDesktopSdkSessions(conversationId?: string): DesktopSdkSession[] {
  return [...sessions].filter(
    (session) => !conversationId || session.conversationId === conversationId,
  );
}
async function openSdk(
  binding: DesktopNativeBinding,
  controls: DesktopNativeControls,
): Promise<LettaAgentClient> {
  const { createAppServerClient } = await import('@letta-ai/letta-code/app-server-client');
  const probe = createAppServerClient({
    url: binding.url,
    authToken: binding.authToken,
    requestTimeoutMs: 10000,
  });
  try {
    await probe.connect();
    const info = await probe.info({ timeoutMs: 10000 });
    if (
      info.backend !== 'api' ||
      info.protocol_version !== 1 ||
      info.letta_code_version !== '0.34.26' ||
      !info.capabilities.runtime_start
    )
      throw Error('SDK_NATIVE_HOST_INCOMPATIBLE');
  } finally {
    probe.close();
  }
  return new LettaAgentClient({
    backend: 'remote',
    url: binding.url,
    authToken: binding.authToken,
    // requestTimeoutMs also bounds the entire SDK turn, including human/tool
    // waits. Keep it unset here; probe/control requests have explicit deadlines.
    WebSocket: controls.socketConstructor(),
  });
}
function json(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(json).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + json(v))
      .join(',') +
    '}'
  );
}
async function bounded(
  work: Promise<unknown>,
  milliseconds: number,
  message: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Native SDK owns model execution. This class supplies scoped product tools,
 * UI approvals, memory context, canonical lifecycle and owned-stop proof only. */
export class DesktopSdkSession {
  readonly planMode = new PlanModeManager();
  readonly options: DesktopSdkSessionOptions;
  private readonly ctrl = new AbortController();
  private readonly reminderState = createReminderState();
  private readonly aliasPrefix = 'cowork_' + randomUUID().replace(/-/g, '').slice(0, 10) + '_';
  private readonly aliases = new Map<string, string>();
  private readonly permissions = new Map<
    string,
    { identity: string; decision: CanUseToolResponse }
  >();
  private readonly receipts = new Map<
    string,
    {
      identity: string;
      work: Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }>;
    }
  >();
  private readonly work = new Set<Promise<unknown>>();
  private readonly children = new Set<DesktopSdkSession>();
  private scope?: DesktopSdkScope;
  private binding?: DesktopNativeBinding;
  private native?: LettaCodeSession;
  private sdk?: LettaAgentClient;
  private controls?: DesktopNativeControls;
  private memory?: ReturnType<typeof createScopedMemory>;
  private memoryAccess?: SessionMemoryAccess;
  private runtimeEnv: Readonly<Record<string, string>> = {};
  private init?: Promise<SDKInitMessage>;
  private sendSettled?: Promise<void>;
  private stop?: Promise<void>;
  private stopRequested = false;
  private stoppedVerified = false;
  private proof?: ReturnType<DesktopNativeControls['snapshot']>;
  private closed = false;
  private sent = false;
  private streaming = false;
  private ownerKey?: string;
  private cwd: string;
  private model = '';
  private scheduler!: SdkToolScheduler;
  private _agentId: string | null;
  private _conversationId: string | null;
  constructor(
    options: DesktopSdkSessionOptions,
    private readonly dependencies: DesktopSdkDependencies = {},
  ) {
    this.options = options;
    this._agentId = options.agentId?.trim() || null;
    this._conversationId = options.conversationId?.trim() || null;
    this.cwd = options.cwd ?? process.cwd();
    if (sessions.size >= 16) throw Error('SDK_DESKTOP_RUNTIME_CAPACITY');
    sessions.add(this);
  }
  get agentId() {
    return this._agentId;
  }
  get conversationId() {
    return this._conversationId;
  }
  get cancellationRequested() {
    return this.stopRequested;
  }
  get accountScopeKey() {
    return this.scope?.key;
  }
  get isVerified() {
    return Boolean(this.proof || this.stoppedVerified);
  }
  private checkOpen() {
    if (this.closed || this.ctrl.signal.aborted) throw Error('SDK_SESSION_CLOSED');
    this.scope?.assertCurrent();
  }
  private safe(text: string) {
    return redactRuntimeSecrets(text, this.runtimeEnv, [
      this.scope?.config.apiKey,
      this.binding?.authToken,
      ...(this.binding?.secretValues ?? []),
    ]);
  }
  initialize(): Promise<SDKInitMessage> {
    if (!this.init)
      this.init = this.initializeOnce().catch((error) => {
        this.close();
        throw Error(
          this.safe(error instanceof Error ? error.message : 'SDK_INITIALIZATION_FAILED'),
        );
      });
    return this.init;
  }
  private async initializeOnce(): Promise<SDKInitMessage> {
    this.checkOpen();
    this.scope = this.options.scope ?? captureDesktopSdkScope(this.options.lettaConnectionId);
    this.scheduler = schedulers.get(this.scope) ?? new SdkToolScheduler();
    schedulers.set(this.scope, this.scheduler);
    // A process default selects an agent only when creating a conversation.
    // Existing conversations resolve their canonical owner in the selected
    // account; an explicitly supplied agent still must match that owner.
    if (!this._conversationId) this._agentId ??= process.env.LETTA_AGENT_ID?.trim() || null;
    if (!this._agentId && !this._conversationId) throw Error('SDK_AGENT_ID_REQUIRED');
    const client = this.scope.client;
    if (!this._conversationId) {
      const created = await client.conversations.create({
        agent_id: this._agentId!,
        ...(this.options.model ? { model: this.options.model } : {}),
      });
      this._conversationId = created.id;
    }
    this.checkOpen();
    const conversation = await client.conversations.retrieve(this._conversationId!);
    if (this._agentId && conversation.agent_id !== this._agentId)
      throw Error('SDK_CONVERSATION_AGENT_MISMATCH');
    this._agentId = conversation.agent_id;
    if (!this._agentId) throw Error('SDK_CANONICAL_AGENT_REQUIRED');
    this.model = this.options.model ?? conversation.model ?? '';
    this.checkOpen();
    this.ownerKey = this.scope.key + ':' + this._conversationId;
    const previous = owners.get(this.ownerKey);
    if (previous) {
      if (!previous.isVerified) throw Error('SDK_CONVERSATION_ALREADY_OWNED');
      await bounded(previous.dispose(), 30000, 'SDK_PREVIOUS_CLEANUP_UNVERIFIED');
      this.checkOpen();
    }
    if (owners.has(this.ownerKey)) throw Error('SDK_CONVERSATION_ALREADY_OWNED');
    owners.set(this.ownerKey, this);
    if (this.options.model) {
      await client.conversations.update(this._conversationId!, { model: this.options.model });
      this.checkOpen();
      const confirmed = await client.conversations.retrieve(this._conversationId!);
      this.checkOpen();
      if (confirmed.model && confirmed.model !== this.options.model)
        throw Error('SDK_CONVERSATION_MODEL_NOT_CONFIRMED');
      this.model = confirmed.model ?? this.options.model;
    }
    try {
      if (this.options.inheritedContext?.agentMemory)
        this.memoryAccess = this.options.inheritedContext.agentMemory;
      else {
        this.memory = createScopedMemory({
          agentId: this._agentId,
          baseURL: this.scope.config.baseURL,
          apiKey: this.scope.config.apiKey,
          fetch: this.scope.config.fetch,
          connectionId: this.options.lettaConnectionId,
          disabled: this.options.memoryDisabled,
          getApiKey:
            this.scope.config.source === 'vera'
              ? () => getVeraCoworkApiClient().accessToken || undefined
              : undefined,
        });
        this.memoryAccess = {
          snapshot: () => this.memory!.snapshot(),
          refresh: () => this.memory!.sync(),
          withRead: (name, read) => this.memory!.withRead(name, read),
        };
        const refresh = this.memoryAccess.refresh();
        void refresh.catch(() => undefined);
        await Promise.race([
          refresh,
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 8000);
            timer.unref?.();
          }),
        ]);
      }
    } catch {
      this.memoryAccess = undefined;
    }
    try {
      this.runtimeEnv = Object.freeze({
        ...(this.options.inheritedContext?.runtimeEnv ??
          (await getVeraCoworkApiClient().getAgentSecretRuntimeEnv(this._agentId))),
      });
    } catch {
      this.runtimeEnv = Object.freeze({});
    }
    this.checkOpen();
    const definitions = getClientToolsForWire().filter(
      (tool) => !this.options.tools || this.options.tools.includes(tool.name),
    );
    const tools: AnyAgentTool[] = definitions.map((tool, index) => {
      const alias =
        this.aliasPrefix + tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 38) + '_' + index;
      this.aliases.set(alias, tool.name);
      return {
        name: alias,
        label: tool.name,
        description: 'Cowork tool ' + tool.name + '. ' + tool.description,
        parameters: tool.parameters,
        execute: (id, input, signal) => this.executeTool(id, alias, input, signal),
      };
    });
    this.controls = new DesktopNativeControls(
      this._agentId,
      this._conversationId!,
      this.options.maxTurns,
    );
    this.binding = await (this.dependencies.launch ?? startDesktopAppServer)({
      agentId: this._agentId,
      conversationId: this._conversationId!,
      cwd: this.cwd,
      provider: this.scope.config,
      assertCurrent: () => this.scope!.assertCurrent(),
      authorizeCancellation: (agentId, ids) => {
        this.scope!.assertCurrent();
        this.controls!.assertExclusive();
        return (
          agentId === this._agentId &&
          ids.length > 0 &&
          ids.every((id) => this.controls!.ownedRuns.has(id))
        );
      },
      signal: this.ctrl.signal,
    });
    this.checkOpen();
    this.sdk = await (this.dependencies.open ?? openSdk)(this.binding, this.controls);
    this.checkOpen();
    this.native = this.sdk.resumeSession(this._conversationId!, {
      cwd: this.cwd,
      tools,
      toolset: { base: 'none' },
      skillSources: [],
      stateless: true,
      // All registered aliases ask the SDK callback first. User-selected modes
      // are enforced by Cowork's policy, including AskUserQuestion in auto mode.
      permissionMode: 'standard',
      canUseTool: async (alias, input, context) => {
        const name = this.aliases.get(alias);
        if (!name || !context?.toolCallId)
          return {
            behavior: 'deny',
            message: 'Only registered, correlated Cowork tools are available.',
          };
        const decision = await this.permission(name, input);
        this.permissions.set(context.toolCallId, {
          identity:
            alias +
            ':' +
            json(decision.behavior === 'allow' ? (decision.updatedInput ?? input) : input),
          decision,
        });
        return decision;
      },
    });
    const ready = await this.native.ready();
    this.checkOpen();
    if (ready.agentId !== this._agentId || ready.conversationId !== this._conversationId)
      throw Error('SDK_RUNTIME_IDENTITY_MISMATCH');
    return {
      type: 'init',
      agentId: this._agentId,
      conversationId: this._conversationId!,
      sessionId: this._conversationId!,
      model: this.model,
    };
  }
  private permission(name: string, input: unknown): Promise<CanUseToolResponse> {
    const operation = this.requestPermission(name, input);
    this.work.add(operation);
    void operation.finally(() => this.work.delete(operation)).catch(() => undefined);
    return operation;
  }
  private async requestPermission(name: string, input: unknown): Promise<CanUseToolResponse> {
    this.checkOpen();
    const plan = this.planMode.checkPermission(name, input as Record<string, unknown>);
    if (plan.decision === 'deny')
      return { behavior: 'deny', message: plan.reason ?? 'Plan mode denied this tool.' };
    if (!this.options.canUseTool)
      return { behavior: 'deny', message: 'Cowork approval policy is unavailable.' };
    let abort: () => void = () => undefined;
    const cancelled = new Promise<CanUseToolResponse>((resolve) => {
      if (this.ctrl.signal.aborted) resolve({ behavior: 'deny', message: 'Cancelled.' });
      else {
        abort = () => resolve({ behavior: 'deny', message: 'Cancelled.' });
        this.ctrl.signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      const result = await Promise.race([
        this.options.canUseTool(name, input, this.ctrl.signal),
        cancelled,
      ]);
      this.checkOpen();
      return result;
    } finally {
      this.ctrl.signal.removeEventListener('abort', abort);
    }
  }
  private executeTool(id: string, alias: string, input: unknown, signal?: AbortSignal) {
    const identity = alias + ':' + json(input);
    const existing = this.receipts.get(id);
    if (existing) {
      if (existing.identity !== identity)
        return Promise.resolve({
          content: [
            { type: 'text' as const, text: 'Tool call identity changed; nothing was executed.' },
          ],
          isError: true,
        });
      return existing.work;
    }
    const operation = (async () => {
      try {
        this.checkOpen();
        if (!this.sent || !this.controls?.hasSubmitted) throw Error('SDK_TOOL_HAS_NO_OWNED_INPUT');
        if (this.proof || this.controls.hasTerminalProof())
          throw Error('SDK_TOOL_AFTER_TERMINAL_DENIED');
        await this.controls.wait(false, 10000);
        this.controls.assertExclusive();
        if (!this.controls.ownedRuns.size) throw Error('SDK_TOOL_HAS_NO_OWNED_RUN');
        if (signal?.aborted) throw Error('Tool cancelled.');
        const name = this.aliases.get(alias);
        if (!name) throw Error('Unregistered tool.');
        const cached = this.permissions.get(id);
        if (cached && cached.identity !== identity) throw Error('Approval input identity changed.');
        const decision = cached?.decision ?? (await this.permission(name, input));
        this.checkOpen();
        if (decision.behavior !== 'allow')
          return {
            content: [{ type: 'text' as const, text: decision.message ?? 'Tool denied.' }],
            isError: true,
          };
        const args = decision.updatedInput ?? (input as Record<string, unknown>);
        const executionSignal = signal
          ? AbortSignal.any([this.ctrl.signal, signal])
          : this.ctrl.signal;
        executionSignal.throwIfAborted();
        const context: ToolRunContext = {
          ...this.options.inheritedContext,
          signal: executionSignal,
          agentId: this._agentId!,
          conversationId: this._conversationId!,
          toolCallId: id,
          workingDirectory: this.cwd,
          setWorkingDirectory: (directory) => {
            this.cwd = resolve(directory);
          },
          workingDirectoryOwnerConversationId: this._conversationId!,
          lettaClient: this.scope!.client,
          lettaConnectionId: getLettaConnectionScope(this.options.lettaConnectionId),
          runtimeEnv: this.runtimeEnv,
          // Preserve the incoming single-use exact human approval, not a model
          // field or an inherited parent decision. All other tools get none.
          attachmentApproval:name===ODOO_ATTACHMENT_TOOL?decision:undefined,
          planMode: this.planMode,
          agentMemory: this.memoryAccess,
          memoryDir: (await this.memoryAccess?.snapshot())?.memoryDir ?? undefined,
          sdkSubagent: (request) => this.runChild(request),
        };
        const result = await this.scheduler.run(name, args, this.cwd, () => {
          this.checkOpen();
          executionSignal.throwIfAborted();
          if (this.proof || this.controls!.hasTerminalProof())
            throw Error('SDK_TOOL_AFTER_TERMINAL_DENIED');
          const plan = this.planMode.checkPermission(name, args);
          if (plan.decision === 'deny') throw Error(plan.reason ?? 'Plan mode denied this tool.');
          return runClientTool(name, args, context);
        });
        return {
          content: [{ type: 'text' as const, text: this.safe(result.output) }],
          isError: result.isError,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: this.safe(error instanceof Error ? error.message : 'Cowork tool failed.'),
            },
          ],
          isError: true,
        };
      }
    })();
    this.receipts.set(id, { identity, work: operation });
    this.work.add(operation);
    void operation.finally(() => this.work.delete(operation));
    return operation;
  }
  private async runChild(
    request: NonNullable<ToolRunContext['sdkSubagent']> extends (request: infer T) => unknown
      ? T
      : never,
  ) {
    const { childMemoryContext } = await import('../../../services/memfs/agent-memory-access.js');
    const parentContext: ToolRunContext = {
      signal: this.ctrl.signal,
      agentId: this._agentId!,
      memoryDir: (await this.memoryAccess?.snapshot())?.memoryDir ?? undefined,
      agentMemory: this.memoryAccess,
      prepareAgentMemory: async (agentId) => {
        if (agentId === this._agentId && this.memoryAccess) return this.memoryAccess;
        if (!this.memory?.scopeId()) throw Error('CHILD_MEMORY_SCOPE_UNAVAILABLE');
        const memory = createScopedMemory({
          agentId,
          baseURL: this.scope!.config.baseURL,
          apiKey: this.scope!.config.apiKey,
          fetch: this.scope!.config.fetch,
          connectionId: this.options.lettaConnectionId,
          expectedScopeId: this.memory.scopeId(),
          getApiKey:
            this.scope!.config.source === 'vera'
              ? () => getVeraCoworkApiClient().accessToken || undefined
              : undefined,
        });
        const access = {
          snapshot: () => memory.snapshot(),
          refresh: () => memory.sync(),
          withRead: <T>(
            name: string,
            read: (s: Awaited<ReturnType<SessionMemoryAccess['snapshot']>>) => Promise<T>,
          ) => memory.withRead(name, read),
        };
        await access.refresh();
        return access;
      },
    };
    const inherited = await childMemoryContext(parentContext, request.agentId);
    const child = new DesktopSdkSession(
      {
        ...this.options,
        scope: this.scope,
        agentId: request.agentId,
        conversationId: request.conversationId,
        inheritedContext: {
          ...inherited,
          signal: request.signal,
          runtimeEnv: request.agentId === this._agentId ? this.runtimeEnv : undefined,
        },
        tools: delegatedToolNames(getClientToolsForWire().map(tool=>tool.name),this.options.tools),
        maxTurns: 25,
      },
      this.dependencies,
    );
    this.children.add(child);
    const abort = () => {
      void child.abort().catch(() => undefined);
    };
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    let finalText = '',
      toolCallCount = 0;
    const started = Date.now();
    try {
      await child.send(request.prompt);
      for await (const message of child.stream()) {
        if (message.type === 'assistant') finalText += message.content;
        if (message.type === 'tool_call') toolCallCount++;
        if (message.type === 'result' && !message.success)
          throw Error(message.error ?? 'Child SDK run failed.');
      }
      return {
        conversationId: child.conversationId!,
        finalText,
        toolCallCount,
        turnCount: child.controls?.ownedRuns.size ?? 0,
        durationMs: Date.now() - started,
      };
    } finally {
      request.signal.removeEventListener('abort', abort);
      await child.abort();
      if (child.isVerified) this.children.delete(child);
    }
  }
  async send(message: SendMessage): Promise<void> {
    this.checkOpen();
    if (this.sent || this.sendSettled) throw Error('SDK_SESSION_ACCEPTS_ONE_LOGICAL_TURN');
    let complete!: () => void;
    this.sendSettled = new Promise((resolve) => {
      complete = resolve;
    });
    try {
      await this.initialize();
      this.checkOpen();
      const memoryNotice =
        this.memory?.notice() ??
        'Scoped local/shared memory status is separate from already-loaded prompt blocks.';
      const context = [
        memoryNotice,
        buildTurnReminders({
          planMode: this.planMode,
          state: this.reminderState,
          workingDirectory: this.cwd,
        }),
      ]
        .filter(Boolean)
        .join('\n\n');
      const payload: SendMessage =
        typeof message === 'string'
          ? context + '\n\n' + message
          : [{ type: 'text', text: context }, ...message];
      this.checkOpen();
      this.sent = true;
      await this.native!.send(payload, { otid: this.controls!.messageId });
      this.checkOpen();
    } finally {
      complete();
    }
  }
  private async sync() {
    await this.native?.sendCommand(
      {
        type: 'sync',
        runtime: this.controls!.scope,
        recover_approvals: false,
        force_device_status: true,
      },
      { responseType: 'sync_response', timeoutMs: 10000 },
    );
  }
  private async verifyBackend(runs: readonly string[]): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      this.scope!.assertCurrent();
      const states = await Promise.all(runs.map((id) => this.scope!.client.runs.retrieve(id)));
      if (
        states.every(
          (run, i) =>
            run.id === runs[i] && ['completed', 'failed', 'cancelled'].includes(run.status ?? ''),
        )
      )
        return;
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw Error('SDK_OWNED_RUNS_NOT_VERIFIED_TERMINAL');
  }
  private async settle(timeout = 30000) {
    if (!this.controls!.hasTerminalProof()) {
      await this.sync();
      await this.controls!.wait(true, timeout);
    }
    const snapshot = this.controls!.snapshot();
    await bounded(Promise.allSettled([...this.work]), timeout, 'SDK_TOOL_WORK_UNVERIFIED');
    for (const child of this.children) {
      if (!child.isVerified) throw Error('SDK_CHILD_WORK_UNVERIFIED');
    }
    if (!snapshot.rejected) await this.verifyBackend(snapshot.runs);
    this.controls!.assertSnapshot(snapshot);
    this.proof = snapshot;
  }
  async *stream(): AsyncGenerator<SDKMessage> {
    this.checkOpen();
    if (!this.sent || this.streaming) throw Error('SDK_STREAM_UNAVAILABLE');
    this.streaming = true;
    let terminal = false;
    let nativeFailure: string | undefined;
    try {
      for await (const message of this.native!.stream()) {
        this.checkOpen();
        const value = { ...message } as SDKMessage & { clientRunId?: string; turnSeq?: number };
        if (value.type === 'tool_call')
          value.toolName = this.aliases.get(value.toolName) ?? value.toolName;
        if ('content' in value && typeof value.content === 'string')
          value.content = this.safe(value.content);
        if ('error' in value && typeof value.error === 'string')
          value.error = this.safe(value.error);
        if ('errorDetail' in value && typeof value.errorDetail === 'string')
          value.errorDetail = this.safe(value.errorDetail);
        if ('message' in value && typeof value.message === 'string')
          value.message = this.safe(value.message);
        if (value.type === 'error') nativeFailure = value.message || value.errorDetail;
        if (value.type === 'result') {
          if (!value.success) nativeFailure = value.errorDetail || value.error || nativeFailure;
          try {
            await this.settle();
          } catch (error) {
            const verification = this.safe(
              error instanceof Error ? error.message : 'SDK_STOP_UNVERIFIED',
            );
            throw Error(
              nativeFailure
                ? `${nativeFailure}; execution settlement unverified: ${verification}`
                : verification,
              { cause: error },
            );
          }
          if (classifyStreamTermination(this.controls?.stopReason) === 'error') {
            value.success = false;
            value.errorCode =
              this.controls?.stopReason === 'llm_api_error' ? 'llm_api_error' : 'error';
            value.error = 'Native execution stopped: ' + this.controls?.stopReason;
          }
          terminal = true;
        }
        value.clientRunId = this.controls!.messageId;
        value.turnSeq = 1;
        yield value;
        if (value.type === 'result') break;
      }
      if (!terminal) throw Error('SDK_STREAM_ENDED_WITHOUT_VERIFIED_RESULT');
    } finally {
      this.streaming = false;
    }
  }
  abort(): Promise<void> {
    if (this.stop) return this.stop;
    this.stopRequested = true;
    this.ctrl.abort();
    const operation = (async () => {
      const preparation =
        this.sendSettled ??
        this.init?.then(
          () => undefined,
          () => undefined,
        );
      if (preparation) await bounded(preparation, 30000, 'SDK_SEND_SETTLEMENT_UNVERIFIED');
      for (const child of this.children) await child.abort();
      if (this.sent && this.controls?.hasSubmitted) {
        await this.sync();
        this.controls.assertExclusive();
        if (!this.controls.hasTerminalProof()) {
          await this.controls.wait(false);
          for (const id of this.controls.ownedRuns)
            await this.native!.sendCommand(
              { type: 'abort_message', runtime: this.controls.scope, run_id: id },
              { responseType: 'abort_message_response', timeoutMs: 10000 },
            );
        }
        await this.settle();
      } else await bounded(Promise.allSettled([...this.work]), 30000, 'SDK_TOOL_WORK_UNVERIFIED');
      this.stoppedVerified = true;
      await this.dispose();
    })();
    const attempt: Promise<void> = operation.catch((error) => {
      if (!this.closed && this.stop === attempt) this.stop = undefined;
      throw Error(this.safe(error instanceof Error ? error.message : 'SDK_STOP_UNVERIFIED'));
    });
    this.stop = attempt;
    return attempt;
  }
  close() {
    if (!this.isVerified) {
      void this.abort().catch(() => undefined);
      return;
    }
    void this.dispose().catch(() => undefined);
  }
  private shutdown?: Promise<void>;
  private dispose(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true;
    this.shutdown = (async () => {
      if (this.proof) this.controls!.assertSnapshot(this.proof);
      this.native?.close();
      await this.sdk?.close();
      await this.binding?.close();
      if (this.proof) this.controls!.assertSnapshot(this.proof);
      if (this.isVerified) {
        if (this.ownerKey && owners.get(this.ownerKey) === this) owners.delete(this.ownerKey);
        sessions.delete(this);
      }
    })();
    return this.shutdown;
  }
}
export function createDesktopSdkSession(options: DesktopSdkSessionOptions): DesktopSdkSession {
  return new DesktopSdkSession(options);
}
