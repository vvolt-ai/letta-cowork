/**
 * Abort/cancellation logic for the runner.
 */

import type { Session as LettaSession } from "@letta-ai/letta-code-sdk";
import { log, debug } from "./logger.js";
import { createLettaClient } from "./client.js";
import {
  getActiveSessions,
  getSession,
  removeSession,
  getActiveLettaSession,
  setActiveLettaSession,
  getCurrentAbortController,
  setCurrentAbortController,
  clearActiveSessions,
} from "./state.js";

/**
 * Abort all active sessions.
 */
export async function abortAllSessions(): Promise<void> {
  console.log("[runner] abortAllSessions called, active sessions:", getActiveSessions().size);
  for (const [sessionId, lettaSession] of getActiveSessions()) {
    try {
      console.log(`[runner] aborting session: ${sessionId}`);
      await lettaSession.abort();
    } catch (err) {
      console.log(`[runner] error aborting session ${sessionId}:`, err);
    }
  }
  clearActiveSessions();
}

/**
 * Abort a specific session by conversationId.
 */
export async function abortSessionById(conversationId: string): Promise<boolean> {
  console.log("[runner] abortSessionById called:", conversationId, "active sessions:", getActiveSessions().size);

  // Try to find the session by exact match
  let sessionToAbort = getSession(conversationId);

  // If not found, try to find by prefix match (e.g., "pending-" prefix)
  if (!sessionToAbort) {
    for (const [key, session] of getActiveSessions()) {
      if (key === conversationId || key.includes(conversationId) || conversationId.includes(key)) {
        sessionToAbort = session;
        console.log("[runner] found session by partial match:", key);
        break;
      }
    }
  }

  if (sessionToAbort) {
    try {
      console.log("[runner] aborting session:", conversationId);
      await sessionToAbort.abort();
      removeSession(conversationId);
      console.log("[runner] session aborted successfully:", conversationId);
      return true;
    } catch (err) {
      console.log("[runner] error aborting session:", err);
      // Still remove from map
      removeSession(conversationId);
      return false;
    }
  }

  // Also try to abort via current abort controller
  const currentAbortController = getCurrentAbortController();
  if (currentAbortController && !currentAbortController.signal.aborted) {
    console.log("[runner] no session found, aborting via currentAbortController");
    currentAbortController.abort();
    return true;
  }

  console.log("[runner] no session found to abort for:", conversationId);
  return false;
}

/**
 * Create an abort function for a runner handle.
 */
export function createAbortHandler(
  sessionKey: string,
  lettaSessionRef: LettaSession | null,
  abortController: AbortController
): () => Promise<void> {
  return async () => {
    console.log("[runner] abort called for session:", sessionKey);
    debug("abort called", {
      sessionKey,
      hasActiveSession: !!getActiveLettaSession(),
      activeSessionsCount: getActiveSessions().size
    });

    // Get the agent ID and conversation ID if available for cancel operations
    const activeSession = getActiveLettaSession();
    const agentId = lettaSessionRef?.agentId || activeSession?.agentId || null;
    const conversationId = lettaSessionRef?.conversationId || activeSession?.conversationId || sessionKey;

    // First, call abort on the Letta session (SDK) - try multiple approaches
    let sessionToAbort = getSession(sessionKey);

    // If not found by sessionKey, try to find any active session
    if (!sessionToAbort) {
      console.log("[runner] session not found by sessionKey, searching all sessions");
      for (const [, s] of getActiveSessions()) {
        if (s) {
          sessionToAbort = s;
          break;
        }
      }
    }

    // Fallback to lettaSessionRef or activeLettaSession
    if (!sessionToAbort) {
      sessionToAbort = lettaSessionRef ?? activeSession ?? undefined;
    }

    if (sessionToAbort) {
      try {
        console.log("[runner] calling lettaSession.abort() (SDK)");
        await sessionToAbort.abort();
        console.log("[runner] lettaSession.abort() completed");
      } catch (err) {
        console.log("[runner] lettaSession.abort() error", err);
        debug("lettaSession.abort() error", { error: String(err) });
      }
    } else {
      console.log("[runner] no activeLettaSession to abort via SDK");
    }

    // Also try to cancel via Letta client API directly (more reliable)
    const effectiveConversationId = conversationId && /^conv-/.test(conversationId) ? conversationId : sessionKey;
    const lettaClient = createLettaClient();

    // Try to cancel using conversation ID (if valid)
    if (effectiveConversationId && /^conv-/.test(effectiveConversationId)) {
      if (lettaClient) {
        try {
          console.log("[runner] attempting to cancel via Letta client API with conversationId:", effectiveConversationId);
          await lettaClient.conversations.cancel(effectiveConversationId);
          console.log("[runner] Letta client cancel successful");
        } catch (err) {
          console.log("[runner] Letta client cancel error:", err);
        }
      } else {
        console.log("[runner] no Letta client available");
      }
    } else {
      console.log("[runner] no valid conversationId to cancel via Letta client API, trying agent-level stop");
    }

    // Always try to cancel using agent ID if available (independent of conversationId)
    if (agentId) {
      const lettaClientForAgent = createLettaClient();
      if (lettaClientForAgent) {
        try {
          console.log("[runner] attempting to cancel via Letta agent messages API with agentId:", agentId);
          await lettaClientForAgent.agents.messages.cancel(agentId);
          console.log("[runner] Letta agent messages cancel successful");
        } catch (err) {
          console.log("[runner] Letta agent messages cancel error:", err);
        }
      } else {
        console.log("[runner] no Letta client available for agent cancel");
      }
    } else {
      console.log("[runner] no agentId available for cancel");
    }

    // Also try currentAbortController for global abort
    const currentAbort = getCurrentAbortController();
    if (currentAbort && !currentAbort.signal.aborted) {
      console.log("[runner] calling currentAbortController.abort()");
      currentAbort.abort();
    }

    // Abort our AbortController to stop any streaming
    console.log("[runner] calling abortController.abort()");
    abortController.abort();
    console.log("[runner] abortController.abort() called");
  };
}
