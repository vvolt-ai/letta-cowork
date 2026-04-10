/**
 * Main runner module - orchestrates Letta session execution.
 */

import type { Session as LettaSession } from "@letta-ai/letta-code-sdk";
import { log, debug, timing } from "./logger.js";
import { getAgentName } from "./client.js";
import {
  setCurrentAbortController,
  getCachedAgentId,
} from "./state.js";
import { createCanUseToolHandler } from "./permission-handler.js";
import { createAbortHandler, abortAllSessions, abortSessionById } from "./abort-handler.js";
import {
  createOrResumeSession,
  initializeSession,
  cleanupSession,
} from "./session-manager.js";
import {
  createMessageSender,
  createPermissionRequestSender,
  sendSessionStatus,
  logMessageDetails,
  handleResultMessage,
} from "./event-handler.js";
import type { RunnerOptions, RunnerHandle } from "./types.js";

// Re-export types
export type { RunnerSession, RunnerOptions, RunnerHandle } from "./types.js";

// Re-export functions for external use
export { clearAgentCache, getCurrentAgentId } from "./state.js";
export { abortAllSessions, abortSessionById } from "./abort-handler.js";

/**
 * Run a Letta session with the given options.
 * Returns a handle once the session has a real Letta conversation ID.
 */
export async function runLetta(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, content, session, resumeConversationId, preferredAgentId, model, onEvent, onSessionUpdate } = options;
  const targetAgentId = preferredAgentId?.trim() || undefined;

  // Create AbortController for stopping the session
  const abortController = new AbortController();
  const signal = abortController.signal;

  // Store abort controller globally for external access
  setCurrentAbortController(abortController);

  // Will be set when Letta provides a real conversation ID
  let sessionKey: string = "";
  let lettaSessionRef: LettaSession | null = null;

  const promptPreview = (prompt ?? "").slice(0, 100);
  debug("runLetta called", {
    prompt: promptPreview + ((prompt ?? "").length > 100 ? "..." : ""),
    hasContent: Array.isArray(content),
    contentItems: content?.length ?? 0,
    sessionId: session.id,
    resumeConversationId,
    preferredAgentId: targetAgentId,
    cachedAgentId: getCachedAgentId(),
    cwd: session.cwd,
  });

  // Mutable sessionId - starts as session.id, updated when conversationId is available
  let currentSessionId = session.id;

  // Create message and permission request senders
  const sendMessage = createMessageSender(currentSessionId, onEvent);
  const sendPermissionRequest = createPermissionRequestSender(currentSessionId, onEvent);

  // Promise to resolve when we have a real conversation ID
  let resolveConversationId!: (id: string) => void;
  let rejectConversationId!: (error: Error) => void;
  const conversationIdPromise = new Promise<string>((resolve, reject) => {
    resolveConversationId = resolve;
    rejectConversationId = reject;
  });

  // Start the query in the background
  (async () => {
    try {
      // Create canUseTool handler
      const canUseTool = createCanUseToolHandler(session, sendPermissionRequest);

      // Create or resume session
      const lettaSession = createOrResumeSession(options, canUseTool);
      debug("session created successfully");

      // Initialize session - async wait for real conversation ID from Letta
      let initResult;
      try {
        initResult = await initializeSession(lettaSession, resumeConversationId, (updates) => {
          onSessionUpdate?.(updates);
        });
      } catch (initError) {
        // Session initialization failed
        rejectConversationId(initError as Error);
        throw initError;
      }

      sessionKey = initResult.sessionKey;
      currentSessionId = initResult.currentSessionId;
      lettaSessionRef = lettaSession;

      // Resolve with the real conversation ID
      resolveConversationId(currentSessionId);

      // Update senders with correct session ID
      const sendMessageWithId = createMessageSender(currentSessionId, onEvent);
      const sendPermissionRequestWithId = createPermissionRequestSender(currentSessionId, onEvent);

      // Send the prompt (session is already initialized above)
      debug("calling send()");
      timing.mark("before send()");
      const sendStartTime = Date.now();
      const payload = Array.isArray(content) && content.length > 0 ? content : prompt;
      await lettaSession.send(payload);
      const sendDuration = Date.now() - sendStartTime;
      debug("send() completed", {
        conversationId: lettaSession.conversationId,
        agentId: lettaSession.agentId,
        sendDurationMs: sendDuration,
      });
      if (sendDuration > 5000) {
        console.log(`[runner] WARNING: send() took ${sendDuration}ms - this is slow!`);
      }

      // Get agent name for display (uses cache if available)
      let agentName: string | undefined = "Unknown Agent";
      try {
        const name = await getAgentName(lettaSession.agentId || getCachedAgentId() || targetAgentId || undefined);
        agentName = name || agentName;
      } catch (e) {
        console.log("[runner] Failed to get agent name:", e);
      }

      // Stream messages
      debug("starting stream", { conversationId: currentSessionId });
      let messageCount = 0;

      // Check abort signal before starting stream
      if (signal.aborted) {
        debug("session aborted before stream started");
        sendSessionStatus(currentSessionId, "idle", onEvent, agentName);
        return;
      }

      try {
        for await (const message of lettaSession.stream()) {
          // Check if abort was requested
          if (signal.aborted) {
            debug("stream aborted, stopping message processing");
            sendSessionStatus(currentSessionId, "idle", onEvent, agentName);
            break;
          }

          messageCount++;
          logMessageDetails(message, messageCount);

          // Send message directly to frontend
          sendMessageWithId(message);

          // Check for result to update session status
          if (message.type === "result") {
            handleResultMessage(
              message as Parameters<typeof handleResultMessage>[0],
              currentSessionId,
              onEvent,
              agentName
            );
          }
        }
      } catch (streamError) {
        // Check if this was an abort error
        if (signal.aborted || (streamError as Error).name === "AbortError") {
          debug("stream aborted (caught error)");
          sendSessionStatus(currentSessionId, "idle", onEvent, agentName);
        } else {
          throw streamError;
        }
      }
      debug("stream ended", { totalMessages: messageCount });

      // Query completed normally
      if (session.status === "running") {
        debug("query completed normally");
        sendSessionStatus(currentSessionId, "completed", onEvent, agentName);
      }
    } catch (error) {
      // Check if this was an abort
      if (signal.aborted || (error as Error).name === "AbortError") {
        debug("session aborted (caught)");
        sendSessionStatus(currentSessionId, "idle", onEvent);
        return;
      }

      // Log detailed error info for debugging
      const errorDetails = {
        error: String(error),
        name: (error as Error).name,
        stack: (error as Error).stack,
        agentId: targetAgentId || getCachedAgentId() || process.env.LETTA_AGENT_ID,
        baseURL: process.env.LETTA_BASE_URL,
        apiKeyMasked: process.env.LETTA_API_KEY ? process.env.LETTA_API_KEY.substring(0, 10) + "..." : "not set",
      };
      log("ERROR in runLetta", errorDetails);

      // Cancel all active sessions on error
      debug("cancelling all active sessions due to error");
      await abortAllSessions();

      // Send detailed error to UI
      const errorMessage = `Failed to start session: ${String(error)}\n\nAgent ID: ${errorDetails.agentId}\nBase URL: ${errorDetails.baseURL}\nAPI Key: ${errorDetails.apiKeyMasked}`;
      sendSessionStatus(currentSessionId, "error", onEvent, undefined, errorMessage);
    } finally {
      if (sessionKey) {
        cleanupSession(sessionKey, lettaSessionRef);
      }
      setCurrentAbortController(null);
    }
  })();

  // Wait for the real conversation ID before returning
  const realConversationId = await conversationIdPromise;

  return {
    abort: createAbortHandler(realConversationId, lettaSessionRef, abortController),
    sessionId: realConversationId
  };
}
