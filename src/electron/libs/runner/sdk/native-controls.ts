import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { LettaCodeSocketConstructor } from '@letta-ai/letta-agent-sdk';

type Frame = Record<string, any>; // Validated, narrowly consumed native wire boundary.
export class DesktopNativeControls {
  readonly messageId = randomUUID();
  readonly ownedRuns = new Set<string>();
  private readonly terminals = new Set<string>();
  private readonly reasons = new Map<string, string>();
  get stopReason() {
    let reason: string | undefined;
    for (const id of this.ownedRuns) if (this.reasons.has(id)) reason = this.reasons.get(id);
    return reason;
  }
  private submitted = false;
  private rejected = false;
  private mixed = false;
  private requestId?: string;
  private revision = 0;
  private aliases: string[] = [];
  private fault?: string;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly agentId: string,
    readonly conversationId: string,
    private readonly maxTurns?: number,
  ) {}
  get scope() {
    return { agent_id: this.agentId, conversation_id: this.conversationId };
  }
  get hasSubmitted() {
    return this.submitted;
  }
  private same(m: Frame) {
    return (
      m.runtime?.agent_id === this.agentId && m.runtime?.conversation_id === this.conversationId
    );
  }
  outgoing(text: string): string {
    const m: Frame = JSON.parse(text);
    if (m.type === 'runtime_start') {
      if (
        m.agent_id !== this.agentId ||
        m.conversation_id !== this.conversationId ||
        m.create_agent ||
        m.create_conversation
      )
        throw Error('SDK_RUNTIME_SCOPE_MISMATCH');
      m.recover_approvals = false;
      m.wait_for_replay = true;
      const aliases: string[] = [];
      for (const group of m.external_tools ?? [])
        for (const tool of group.tools ?? []) {
          aliases.push(tool.name);
          tool.auto_background = false;
          tool.timeout_ms = 300000;
        }
      this.aliases = aliases;
      if (this.maxTurns !== undefined) {
        // Native step limits activate headless mode. Only exact callbacks may
        // pass that gate; actual user approval remains inside Cowork execution.
        m.execution_settings = {
          allowed_tools: aliases,
          disallowed_tools: [],
          max_turns: this.maxTurns,
          disable_memory_guard: false,
        };
      }
    }
    if (m.type === 'input' && m.payload?.kind === 'create_message') {
      if (
        !this.same(m) ||
        this.submitted ||
        m.payload.messages?.length !== 1 ||
        m.payload.messages[0]?.client_message_id !== this.messageId
      )
        throw Error('SDK_INPUT_CORRELATION_MISMATCH');
      this.requestId = m.request_id;
      this.submitted = true;
    }
    return JSON.stringify(m);
  }
  incoming(text: string): string {
    const m: Frame = JSON.parse(text);
    if (m.type === 'runtime_start_response' && m.success && this.maxTurns !== undefined) {
      const s = m.execution_settings;
      if (
        !this.same(m) ||
        !s ||
        s.max_turns !== this.maxTurns ||
        s.disable_memory_guard !== false ||
        !Array.isArray(s.allowed_tools) ||
        s.allowed_tools.length !== this.aliases.length ||
        s.allowed_tools.some((name: unknown) => !this.aliases.includes(String(name))) ||
        !Array.isArray(s.disallowed_tools) ||
        s.disallowed_tools.length
      ) {
        this.fault = 'SDK_NATIVE_BUDGET_NOT_ACKNOWLEDGED';
        return JSON.stringify({ ...m, success: false, error: this.fault });
      }
    }
    if (m.type === 'external_tool_call_request' && !this.same(m))
      return JSON.stringify({ ...m, tool_name: 'invalid_scope', input: {} });
    if (!this.same(m)) return text;
    if (m.type === 'input_accepted' && m.request_id === this.requestId && m.accepted === false) {
      if (this.ownedRuns.size) this.mixed = true;
      else this.rejected = true;
      this.revision++;
    }
    if (m.type === 'update_loop_status' && this.submitted) {
      const map = m.loop_status?.client_message_ids_by_run_id;
      if (map && typeof map === 'object')
        for (const [id, ids] of Object.entries(map)) {
          if (!Array.isArray(ids)) continue;
          if (this.ownedRuns.has(id) && ids.some((x) => x !== this.messageId)) this.mixed = true;
          if (!ids.includes(this.messageId)) continue;
          if (this.rejected || ids.some((x) => x !== this.messageId)) {
            this.mixed = true;
            continue;
          }
          if (/^run-[a-zA-Z0-9-]+$/.test(id) && !this.ownedRuns.has(id)) {
            this.ownedRuns.add(id);
            this.revision++;
          }
        }
    }
    if (
      m.type === 'turn_finished' &&
      this.submitted &&
      typeof m.run_id === 'string' &&
      typeof m.turn_id === 'string' &&
      m.turn_id &&
      typeof m.stop_reason === 'string' &&
      m.stop_reason
    ) {
      this.terminals.add(m.run_id);
      this.reasons.set(m.run_id, m.stop_reason);
    }
    for (const listener of this.listeners) listener();
    return text;
  }
  assertExclusive() {
    if (this.fault) throw Error(this.fault);
    if (this.mixed) throw Error('SDK_INPUT_OWNERSHIP_MIXED');
  }
  hasTerminalProof() {
    return !this.mixed && [...this.ownedRuns].some((id) => this.terminals.has(id));
  }
  snapshot() {
    this.assertExclusive();
    if (!this.hasTerminalProof() && !(this.rejected && !this.ownedRuns.size))
      throw Error('SDK_STOP_UNVERIFIED');
    return { runs: [...this.ownedRuns].sort(), rejected: this.rejected, revision: this.revision };
  }
  assertSnapshot(snapshot: ReturnType<DesktopNativeControls['snapshot']>) {
    const current = this.snapshot();
    if (
      current.revision !== snapshot.revision ||
      current.rejected !== snapshot.rejected ||
      current.runs.join(',') !== snapshot.runs.join(',')
    )
      throw Error('SDK_SETTLEMENT_CHANGED');
  }
  async wait(terminal: boolean, timeout = 30000): Promise<void> {
    const complete = () =>
      this.rejected || (terminal ? this.hasTerminalProof() : this.ownedRuns.size > 0);
    this.assertExclusive();
    if (complete()) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      const check = () => {
        if (this.mixed) {
          cleanup();
          reject(Error('SDK_INPUT_OWNERSHIP_MIXED'));
        } else if (complete()) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('SDK_STOP_UNVERIFIED'));
      }, timeout);
      this.listeners.add(check);
      check();
    });
  }
  socketConstructor(): LettaCodeSocketConstructor {
    const outgoing = (text: string) => this.outgoing(text);
    const incoming = (text: string) => this.incoming(text);
    return class extends WebSocket {
      constructor(url: string, options?: { headers?: Record<string, string> }) {
        super(url, options);
        this.on('message', () => undefined);
      }
      send(data: WebSocket.Data, ...args: any[]): void {
        const value = typeof data === 'string' ? outgoing(data) : data;
        super.send(value, ...args);
      }
      emit(event: string | symbol, ...args: any[]): boolean {
        if (event === 'message') {
          try {
            args[0] = Buffer.from(incoming(String(args[0])));
          } catch {
            this.close();
            return false;
          }
        }
        return super.emit(event, ...args);
      }
    } as unknown as LettaCodeSocketConstructor;
  }
}
