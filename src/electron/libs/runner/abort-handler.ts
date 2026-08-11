/**
 * Abort/cancellation logic for the runner.
 */

import { createLettaClient } from "./client.js";
import { debug } from "./logger.js";
import {
  getActiveSessions,
  getSession,
  removeSession,
  getActiveLettaSession,
  getCurrentAbortController,
  clearActiveSessions,
} from "./state.js";

import type { RunnerLettaSession as LettaSession } from "./types.js";

/**
 * Abort all active sessions.
 *
 * Called from legitimate paths only (user "stop all" button, app shutdown).
 * Do NOT call this from a per-run error handler - one failed run shouldn't
 * tear down every other active session. See May 15 cascade incident.
 *
 * Robust against SDK shape drift: not every Session object exposes .abort().
 * We try it if it exists, then fall back to the currentAbortController and
 * to the Letta server-side cancel APIs (conversations/agents).
 */
export async function abortAllSessions(): Promise<void> {
  console.log("[runner] abortAllSessions called, active sessions:", getActiveSessions().size);

  const lettaClient = createLettaClient();

  for (const [sessionId, lettaSession] of getActiveSessions()) {
    console.log(`[runner] aborting session: ${sessionId}`);

    // 1. SDK-side abort if the method exists on this Session instance.
    const maybeAbort = (lettaSession as unknown as { abort?: () => Promise<void> }).abort;
    if (typeof maybeAbort === "function") {
      try {
        await maybeAbort.call(lettaSession);
      } catch (err) {
        console.log(`[runner] lettaSession.abort() error for ${sessionId}:`, err);
      }
    }

    // 2. Server-side cancel by conversationId (most reliable).
    const convId = lettaSession.conversationId;
    if (lettaClient && convId && /^conv-/.test(convId)) {
      try {
        await lettaClient.conversations.cancel(convId);
      } catch (err) {
        console.log(`[runner] conversations.cancel error for ${sessionId}:`, err);
      }
    }

    // 3. Agent-level cancel as a final safety net.
    const agentId = lettaSession.agentId;
    if (lettaClient && agentId) {
      try {
        await lettaClient.agents.messages.cancel(agentId);
      } catch (err) {
        console.log(`[runner] agents.messages.cancel error for ${sessionId}:`, err);
      }
    }
  }

  // 4. Trip the global abort controller in case any stream is still consuming it.
  const currentAbort = getCurrentAbortController();
  if (currentAbort && !currentAbort.signal.aborted) {
    currentAbort.abort();
  }

  clearActiveSessions();
}

/**
 * Abort a specific session by conversationId.
 * Only works with real Letta conversation IDs.
 */
export async function abortSessionById(conversationId: string): Promise<boolean> {
  console.log("[runner] abortSessionById called:", conversationId, "active sessions:", getActiveSessions().size);

  const sessionToAbort = getSession(conversationId);
  if (sessionToAbort) {
    try {
      console.log("[runner] aborting session:", conversationId);
      await sessionToAbort.abort();
      console.log("[runner] session aborted successfully:", conversationId);
      return true;
    } catch (err) {
      console.log("[runner] error aborting session:", err);
      return false;
    } finally {
      removeSession(conversationId);
    }
  }

  // The local handle may already have been cleaned up while the backend run
  // is still settling. Cancel only this conversation; never trip the global
  // controller, which may belong to an unrelated concurrent session.
  const lettaClient = createLettaClient();
  if (lettaClient && /^conv-/.test(conversationId)) {
    try {
      await lettaClient.conversations.cancel(conversationId);
      return true;
    } catch (err) {
      console.log("[runner] direct conversation cancel error:", err);
      return false;
    }
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

    // Get IDs only from the matching session. Legacy activeSession is global
    // and may belong to a newer concurrent conversation.
    const activeSession = getActiveLettaSession();
    const activeSessionMatches =
      activeSession?.conversationId === sessionKey ? activeSession : undefined;
    const agentId = lettaSessionRef?.agentId || activeSessionMatches?.agentId || null;
    const conversationId =
      lettaSessionRef?.conversationId || activeSessionMatches?.conversationId || sessionKey;

    // Abort only the matching session. Falling back to an arbitrary active
    // session can cancel a different conversation when turns overlap.
    const sessionToAbort =
      getSession(sessionKey) ?? lettaSessionRef ?? activeSessionMatches;

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

    // Try to cancel using conversation ID (if valid). Agent-level cancel is
    // only a fallback because it can stop another conversation on that agent.
    let conversationCancelled = false;
    if (effectiveConversationId && /^conv-/.test(effectiveConversationId)) {
      if (lettaClient) {
        try {
          console.log("[runner] attempting to cancel via Letta client API with conversationId:", effectiveConversationId);
          await lettaClient.conversations.cancel(effectiveConversationId);
          conversationCancelled = true;
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

    if (!conversationCancelled && agentId) {
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
    } else if (!conversationCancelled) {
      console.log("[runner] no agentId available for cancel");
    }

    // Abort only this runner's controller. The global controller is shared
    // legacy state and may point at a newer, unrelated turn.
    console.log("[runner] calling abortController.abort()");
    abortController.abort();
    removeSession(sessionKey);
    console.log("[runner] abortController.abort() called");
  };
}
