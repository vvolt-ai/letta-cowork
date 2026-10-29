import { randomUUID } from 'node:crypto';
export type TimingStage = 'request_received' | 'queue_wait' | 'session_object_created' | 'initialization' | 'conversation_create' | 'conversation_lookup' | 'previous_cleanup' | 'model_update' | 'model_confirm' | 'model_unchanged' | 'memory_checkpoint' | 'memory_refresh_deferred' | 'runtime_env' | 'tools_registered' | 'native_launch' | 'native_connect' | 'native_ready' | 'input_queued' | 'first_stream_event' | 'first_assistant_text' | 'first_tool_call' | 'agent_name' | 'turn_finished';
export type TimingOutcome = 'ok' | 'error' | 'deferred' | 'skipped';
export interface TimingEvent { traceId: string; stage: TimingStage; event: 'start' | 'finish' | 'milestone'; elapsedMs: number; durationMs?: number; outcome?: TimingOutcome; }
/** Request-local monotonic timing. Only fixed phase names and numeric timing
 * are emitted: no prompts, IDs, keys, URLs, error bodies or environment data. */
export class StartupTiming {
  readonly traceId = randomUUID();
  private readonly start: number;
  private readonly starts = new Map<TimingStage, number>();
  private readonly once = new Set<TimingStage>();
  constructor(private readonly sink: (event: TimingEvent) => void = event => console.log('[performance]', JSON.stringify(event)), private readonly clock: () => number = () => performance.now()) { this.start = clock(); }
  private emit(stage: TimingStage, event: TimingEvent['event'], extra: Partial<TimingEvent> = {}) { try { this.sink({ traceId: this.traceId, stage, event, elapsedMs: Math.max(0, Math.round(this.clock() - this.start)), ...extra }); } catch {/* diagnostics cannot break execution */ } }
  mark(stage: TimingStage) { this.emit(stage, 'milestone'); }
  markOnce(stage: TimingStage) { if (this.once.has(stage)) return; this.once.add(stage); this.mark(stage); }
  begin(stage: TimingStage) { this.starts.set(stage, this.clock()); this.emit(stage, 'start'); }
  finish(stage: TimingStage, outcome: TimingOutcome = 'ok') { const at = this.starts.get(stage); this.starts.delete(stage); this.emit(stage, 'finish', { outcome, ...(at !== undefined ? { durationMs: Math.max(0, Math.round(this.clock() - at)) } : {}) }); }
  async measure<T>(stage: TimingStage, work: () => Promise<T>): Promise<T> { this.begin(stage); try { const result = await work(); this.finish(stage); return result; } catch (error) { this.finish(stage, 'error'); throw error; } }
}
/** Read-only setup can stop waiting without replaying or borrowing another
 * principal. Observe late rejection even if cancellation wins the race. */
export function abortableSetupRead<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => { const abort = () => reject(Error('SDK_SETUP_READ_ABORTED')); if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)); });
}
