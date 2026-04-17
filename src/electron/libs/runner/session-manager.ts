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
 * Will wait for Letta to provide a real conversationId by calling initialize().
 * For resumed sessions with existing conversationId, uses that directly.
 */
export async function initializeSession(
  lettaSession: LettaSession,
  resumeConversationId: string | undefined,
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void
): Promise<{ sessionKey: string; currentSessionId: string }> {
  // For resumed sessions with valid ID, use that
  if (resumeConversationId && isValidLettaId(resumeConversationId)) {
    const sessionKey = resumeConversationId;
    storeSession(sessionKey, lettaSession);

    debug("session initialized (resumed)", { conversationId: resumeConversationId, agentId: lettaSession.agentId });
    onSessionUpdate?.({ lettaConversationId: resumeConversationId });

    if (lettaSession.agentId && !getCachedAgentId()) {
      setCachedAgentId(lettaSession.agentId);
      debug("cached agentId for future conversations", { agentId: lettaSession.agentId });
    }

    return { sessionKey, currentSessionId: sessionKey };
  }

  // For new sessions, initialize and wait for real conversationId from SDK
  debug("initializing new Letta session, waiting for conversationId...");

  // The SDK's initialize() returns an init message with conversation_id
  // If already initialized, this is a no-op and we check conversationId directly
  let conversationId = lettaSession.conversationId;

  if (!conversationId) {
    // Call initialize() to trigger the init message from CLI
    // This sets _conversationId on the Session object
    //
    // Fix C: Wrap initialize() in an explicit timeout. Without this, an invalid
    // model override (or any other silent SDK failure) can cause initialize()
    // to hang forever — the UI eventually shows a generic "Failed to start
    // session" from its 45s timeout but the user has no idea why. With this
    // timeout, we return a descriptive error that includes the model override
    // so the failure mode is immediately diagnosable.
    const INIT_TIMEOUT_MS = 30_000;
    const selectedModel = (lettaSession as unknown as { _options?: { model?: string } })?._options?.model;

    try {
      const initPromise = lettaSession.initialize();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const modelHint = selectedModel
            ? ` (model override: "${selectedModel}" — this model may be unavailable or incompatible with the agent)`
            : "";
          reject(
            new Error(
              `Letta session initialize() timed out after ${INIT_TIMEOUT_MS / 1000}s${modelHint}`
            )
          );
        }, INIT_TIMEOUT_MS);
      });

      const initResult = await Promise.race([initPromise, timeoutPromise]);
      conversationId = initResult.conversationId;
      debug("session initialized via initialize()", { conversationId, agentId: initResult.agentId });
    } catch (initError) {
      const errMsg = String(initError);
      log("ERROR: failed to initialize Letta session", { error: errMsg, selectedModel });
      const modelContext = selectedModel ? ` [model: ${selectedModel}]` : "";
      throw new Error(`Session initialization failed${modelContext}: ${errMsg}`);
    }
  }

  // Now conversationId should be available
  if (!conversationId) {
    log("ERROR: no conversationId available after initialize()");
    throw new Error("Session initialization failed: no conversationId received from Letta");
  }

  // Store session for abort handling using the real conversation ID
  const sessionKey = conversationId;
  storeSession(sessionKey, lettaSession);

  debug("session initialized (new)", { conversationId, agentId: lettaSession.agentId });
  onSessionUpdate?.({ lettaConversationId: conversationId });

  // Cache agentId for future conversations
  if (lettaSession.agentId && !getCachedAgentId()) {
    setCachedAgentId(lettaSession.agentId);
    debug("cached agentId for future conversations", { agentId: lettaSession.agentId });
  }

  return { sessionKey, currentSessionId: sessionKey };
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
