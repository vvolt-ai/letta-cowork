/**
 * Session creation, resumption, and lifecycle management.
 */

import {
  createSession,
  resumeSession,
  type Session as LettaSession,
} from "@letta-ai/letta-code-sdk";
import { log, debug } from "./logger.js";
import { DEFAULT_CWD, storeSession, removeSession, setActiveLettaSession, getCachedAgentId, setCachedAgentId, getActiveLettaSession } from "./state.js";
import type { RunnerSession, RunnerOptions } from "./types.js";
import type { CanUseToolResponse } from "@letta-ai/letta-code-sdk";
import type { SendPermissionRequest } from "./permission-handler.js";

/**
 * Session options for creating/resuming sessions.
 */
export type SessionOptions = {
  cwd: string;
  permissionMode: "bypassPermissions";
  canUseTool: (toolName: string, input: unknown) => Promise<CanUseToolResponse>;
  systemInfoReminder: boolean;
  model?: string;
  memfs: boolean;
  memfsStartup: "background";
};

/**
 * Validate that resumeConversationId looks like a valid Letta ID.
 * Valid IDs are: agent-xxx, conv-xxx, conversation-xxx, or UUIDs
 */
export function isValidLettaId(id: string | undefined): boolean {
  if (!id) return false;
  return /^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(id);
}

/**
 * Create session options object.
 */
export function createSessionOptions(
  session: RunnerSession,
  model: string | undefined,
  canUseTool: (toolName: string, input: unknown) => Promise<CanUseToolResponse>
): SessionOptions {
  return {
    cwd: session.cwd ?? DEFAULT_CWD,
    permissionMode: "bypassPermissions" as const,
    canUseTool,
    systemInfoReminder: false,
    model: model,
    memfs: true,
    memfsStartup: "background" as const,
  };
}

/**
 * Create or resume a Letta session based on options.
 */
export function createOrResumeSession(
  options: RunnerOptions,
  canUseTool: (toolName: string, input: unknown) => Promise<CanUseToolResponse>
): LettaSession {
  const { session, resumeConversationId, preferredAgentId, model } = options;
  const targetAgentId = preferredAgentId?.trim() || undefined;
  const cachedAgentId = getCachedAgentId();
  const sessionOptions = createSessionOptions(session, model, canUseTool);

  if (resumeConversationId && isValidLettaId(resumeConversationId)) {
    // Resume specific conversation
    debug("creating session: resumeSession with conversationId", { resumeConversationId });
    return resumeSession(resumeConversationId, sessionOptions);
  } else if (resumeConversationId && !isValidLettaId(resumeConversationId)) {
    // Invalid ID provided - log warning and fall back to cachedAgentId
    log("WARNING: invalid resumeConversationId, falling back", {
      invalidId: resumeConversationId,
      fallbackTo: targetAgentId ? "preferredAgentId" : cachedAgentId ? "cachedAgentId" : "createSession"
    });
    if (targetAgentId) {
      debug("creating session: createSession with preferredAgentId (fallback)", { preferredAgentId: targetAgentId });
      return createSession(targetAgentId, sessionOptions);
    } else if (cachedAgentId) {
      debug("creating session: resumeSession with cachedAgentId (fallback)", { cachedAgentId });
      return createSession(cachedAgentId, sessionOptions);
    } else {
      debug("creating session: createSession (new agent, fallback)");
      return createSession(process.env.LETTA_AGENT_ID, sessionOptions);
    }
  } else if (targetAgentId) {
    // Start on explicit agent
    debug("creating session: createSession with preferredAgentId", { preferredAgentId: targetAgentId });
    return createSession(targetAgentId, sessionOptions);
  } else if (cachedAgentId) {
    // Create new conversation on existing agent
    debug("creating session: createSession with cachedAgentId", { cachedAgentId });
    return createSession(cachedAgentId, sessionOptions);
  } else {
    // First time - create new agent and session
    debug("creating session: createSession (new agent)");
    return createSession(process.env.LETTA_AGENT_ID, sessionOptions);
  }
}

/**
 * Initialize session after creation.
 */
export function initializeSession(
  lettaSession: LettaSession,
  resumeConversationId: string | undefined,
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void
): { sessionKey: string; currentSessionId: string } {
  // Store session for abort handling
  const sessionKey = resumeConversationId || lettaSession.conversationId || `temp-${Date.now()}`;
  storeSession(sessionKey, lettaSession);

  // Update sessionId if conversationId is available
  let currentSessionId = sessionKey;
  if (lettaSession.conversationId) {
    currentSessionId = lettaSession.conversationId;
    debug("session initialized", { conversationId: lettaSession.conversationId, agentId: lettaSession.agentId });
    onSessionUpdate?.({ lettaConversationId: lettaSession.conversationId });
  } else {
    log("WARNING: no conversationId available after send()");
  }

  // Cache agentId for future conversations
  if (lettaSession.agentId && !getCachedAgentId()) {
    setCachedAgentId(lettaSession.agentId);
    debug("cached agentId for future conversations", { agentId: lettaSession.agentId });
  }

  return { sessionKey, currentSessionId };
}

/**
 * Cleanup session after completion or error.
 */
export function cleanupSession(
  sessionKey: string,
  lettaSessionRef: LettaSession | null
): void {
  debug("runLetta finally block");
  if (sessionKey) {
    removeSession(sessionKey);
  }
  if (lettaSessionRef && getActiveLettaSession() === lettaSessionRef) {
    setActiveLettaSession(null);
  }
}

/**
 * Get the active Letta session (re-exported from state).
 */
export { getActiveLettaSession } from "./state.js";
