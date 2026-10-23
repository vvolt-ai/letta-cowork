import type { Letta } from '@letta-ai/letta-client';
import type { ToolRunContext } from '../../client-tools/types.js';

/** Delegation policy only. The parent's protected SDK capability owns the
 * child's model loop, account, tools, memory and cancellation. */
export interface RunSubagentOptions {
  parentAgentId: string;
  prompt: string;
  description: string;
  agentId?: string;
  conversationId?: string;
  signal: AbortSignal;
  toolContext?: ToolRunContext;
}
export interface RunSubagentResult {
  conversationId: string;
  finalText: string;
  toolCallCount: number;
  turnCount: number;
  durationMs: number;
}
let active = 0;
function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
export async function runSubagent(
  client: Letta,
  options: RunSubagentOptions,
): Promise<RunSubagentResult> {
  const capability = options.toolContext?.sdkSubagent;
  if (!capability || !client || client !== options.toolContext?.lettaClient)
    throw Error(
      'SDK_SUBAGENT_SCOPE_UNAVAILABLE: delegation requires the active parent SDK context.',
    );
  const agentId = options.agentId || options.parentAgentId;
  if (!agentId) throw Error('SDK_SUBAGENT_AGENT_REQUIRED');
  options.signal.throwIfAborted();
  if (active >= limit('COWORK_MAX_CONCURRENT_SUBAGENTS', 10))
    throw Error('SDK_SUBAGENT_CAPACITY: wait for active delegated work.');
  active++;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) ctrl.abort();
  let timedOut = false;
  const timeoutMs = limit('COWORK_SUBAGENT_TIMEOUT_MS', 180000);
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    // Cancellation remains awaited: a timeout is not permission to abandon a
    // still-running child or release its native execution ownership.
    const result = await capability({
      agentId,
      conversationId: options.conversationId,
      prompt: options.prompt,
      description: options.description,
      signal: ctrl.signal,
    });
    if (timedOut) throw Error(`Subagent timed out after ${timeoutMs} ms.`);
    options.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', abort);
    active--;
  }
}
