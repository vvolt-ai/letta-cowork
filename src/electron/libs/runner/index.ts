/**
 * Main runner module - orchestrates Letta session execution.
 */

import { readFile } from "node:fs/promises";

import { createAbortHandler } from "./abort-handler.js";
import {wasUserCancellation,waitForSessionInitialization} from './session-error-display.js';
import { getAgentName } from "./client.js";
import {
  createMessageSender,
  sendSessionStatus,
  logMessageDetails,
  handleResultMessage,
} from "./event-handler.js";
import { log, debug, timing } from "./logger.js";
import { createCanUseToolHandler } from "./permission-handler.js";
import {
  createOrResumeSession,
  initializeSession,
  cleanupSession,
} from "./session-manager.js";
import {
  setCurrentAbortController,
  getCurrentAbortController,
  getCachedAgentId,
} from "./state.js";

import type { SendPermissionRequest } from "./permission-handler.js";
import type { RunnerLettaSession as LettaSession , RunnerOptions, RunnerHandle } from "./types.js";



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
  let userStopRequested=false;

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
  const sendPermissionRequest: SendPermissionRequest = (toolUseId, toolName, input) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: currentSessionId, toolUseId, toolName, input },
    });
  };

  // Promise to resolve when we have a real conversation ID
  let resolveConversationId!: (id: string) => void;
  let rejectConversationId!: (error: Error) => void;
  const conversationIdPromise = new Promise<string>((resolve, reject) => {
    resolveConversationId = resolve;
    rejectConversationId = reject;
  });

  // Start the query in the background and retain its settlement promise.
  // Callers use this as the per-conversation ownership lease.
  const runPromise = (async () => {
    try {
      // Create canUseTool handler
      const canUseTool = createCanUseToolHandler(session, sendPermissionRequest, options.permissionMode,(toolUseId)=>onEvent({type:'permission.cancelled',payload:{sessionId:currentSessionId,toolUseId}}));

      // Create or resume session
      const lettaSession = createOrResumeSession(options, canUseTool);
      lettaSessionRef = lettaSession;
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

      // ── Plan-mode bridge ──────────────────────────────────────────
      // The SDK lifecycle adapter exposes a per-session
      // PlanModeManager. Subscribe to mode changes and forward as
      // `plan_mode_state` events; when the agent ExitPlanMode'd, also
      // read the plan file body and emit `plan_mode_plan`. The UI
      // surfaces the banner + plan viewer from these events.
      try {
        const planMode = lettaSession.planMode;
        if (planMode && typeof planMode.onChange === "function") {
          planMode.onChange((state) => {
            onEvent({
              type: "plan_mode_state",
              payload: {
                sessionId: currentSessionId,
                mode: state.mode,
                planFilePath: state.planFilePath ?? null,
              },
            });
            if (state.mode === "unrestricted" && state.planFilePath) {
              // Plan was just finalized — surface the body for the UI.
              const planFilePath = state.planFilePath; // narrow capture
              void readFile(planFilePath, "utf-8")
                .then((body) => {
                  onEvent({
                    type: "plan_mode_plan",
                    payload: {
                      sessionId: currentSessionId,
                      planFilePath,
                      body,
                    },
                  });
                })
                .catch(() => {
                  // No plan file or read failed — skip silently.
                });
            }
          });
        }
      } catch (e) {
        debug("plan-mode subscription skipped", { error: String(e) });
      }

      // Resolve with the real conversation ID
      resolveConversationId(currentSessionId);

      // Update senders with correct session ID
      const sendMessageWithId = createMessageSender(currentSessionId, onEvent);

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
        const name = await getAgentName(
          lettaSession.agentId || getCachedAgentId() || targetAgentId || undefined,
          options.lettaConnectionId,
        );
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

          // Error/approval-conflict results may need backend recovery.
          // Successful result messages already drive the UI via stream.message;
          // sending a second session.status=completed here can race with a newer
          // user turn and make a busy/retrying conversation look completed.
          if (message.type === "result" && !(message as { success?: boolean }).success) {
            handleResultMessage(
              message as Parameters<typeof handleResultMessage>[0],
              currentSessionId,
              onEvent,
              agentName,
              lettaSession.agentId,
              lettaSession.conversationId
            );
          }
        }
      } catch (streamError) {
        // Check if this was an abort error
        if (wasUserCancellation(signal.aborted||userStopRequested,streamError)) {
          debug("stream aborted (caught error)");
          sendSessionStatus(currentSessionId, "idle", onEvent, agentName);
        } else {
          throw streamError;
        }
      }
      debug("stream ended", { totalMessages: messageCount });

      // Normal completion is emitted as a stamped stream.message result by
      // the SDK adapter. Do not send an additional unstamped session.status=completed;
      // it can arrive after the next prompt starts and overwrite the live state.
    } catch (error) {
      const userCancelled=wasUserCancellation(signal.aborted||userStopRequested,error);
      // Also reject failures before initializeSession's inner try (e.g. missing
      // connection settings); otherwise the IPC caller can wait forever.
      rejectConversationId(error instanceof Error?error:new Error(String(error)));
      const reportFailure=(message:string)=>{
        if(currentSessionId==='pending')onEvent({type:'runner.error',payload:{message}});
        else sendSessionStatus(currentSessionId,'error',onEvent,undefined,message);
      };
      if(!userCancelled)reportFailure(String(error));
      // Show the original failure immediately, but retain ownership until the
      // failed initialization/run has actually completed its owned cleanup.
      if(lettaSessionRef&&!signal.aborted){
        try{await lettaSessionRef.abort();abortController.abort();}
        catch(stopError){reportFailure('SDK_STOP_NOT_VERIFIED: '+(stopError instanceof Error?stopError.message:'Owned stop could not be verified.'));return;}
      }
      // Check if this was an abort
      if (userCancelled) {
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
        localApiKeyConfigured: Boolean(process.env.LETTA_API_KEY?.trim()),
      };
      log("ERROR in runLetta", errorDetails);

      // NOTE: do NOT call abortAllSessions() here. A single failed run
      // (e.g. one scheduled task timing out on init against api.letta.com)
      // must not nuke every other active conversation in the runtime.
      // The caller (scheduler or UI) handles its own session's failure
      // via the "error" status we send below. May 15 cascade incident.

      // Failure was already reported before cleanup; do not emit a second
      // unstamped terminal event after a newer turn could have started.
    } finally {
      if (sessionKey) {
        cleanupSession(sessionKey, lettaSessionRef);
      }
      if (getCurrentAbortController() === abortController) {
        setCurrentAbortController(null);
      }
    }
  })();

  // Wait for the real conversation ID before returning
  const realConversationId = await waitForSessionInitialization(conversationIdPromise,runPromise);

  return {
    abort: createAbortHandler(realConversationId, lettaSessionRef, abortController,()=>{userStopRequested=true;}),
    sessionId: realConversationId,
    done: runPromise,
  };
}
