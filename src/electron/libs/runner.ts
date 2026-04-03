import {
  createSession,
  resumeSession,
  type Session as LettaSession,
  type SDKMessage,
  type CanUseToolResponse,
  type MessageContentItem,
} from "@letta-ai/letta-code-sdk";
import { Letta } from "@letta-ai/letta-client";
import type { ServerEvent } from "../types.js";
import type { PendingPermission } from "./runtime-state.js";
import { getLettaAgent } from "../lettaAgents.js";

// Create Letta client for direct server communication (for cancel operations)
function createLettaClient(): Letta | null {
  try {
    const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
    const apiKey = (process.env.LETTA_API_KEY || "").trim();
    if (!apiKey) return null;
    return new Letta({
      baseURL,
      apiKey: apiKey || null,
    });
  } catch {
    return null;
  }
}

// Track all active sessions for abort handling
const activeSessions = new Map<string, LettaSession>();

// Simplified session type for runner
export type RunnerSession = {
  id: string;
  title: string;
  status: string;
  cwd?: string;
  pendingPermissions: Map<string, PendingPermission>;
};

export type RunnerOptions = {
  prompt: string;
  content?: MessageContentItem[];
  session: RunnerSession;
  resumeConversationId?: string;
  preferredAgentId?: string;
  model?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void;
};

export type RunnerHandle = {
  abort: () => Promise<void>;
  sessionId: string;
};

const DEFAULT_CWD = process.cwd();
const DEBUG = process.env.LETTA_DEBUG === "true" || process.env.NODE_ENV === "development";

// Simple timing helper
const timing = {
  start: Date.now(),
  mark: (label: string) => {
    const elapsed = Date.now() - timing.start;
    console.log(`[timing] ${elapsed}ms: ${label}`);
  }
};

// Simple logger for runner
const log = (msg: string, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [runner] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [runner] ${msg}`);
  }
};

// Debug-only logging (verbose)
const debug = (msg: string, data?: Record<string, unknown>) => {
  if (DEBUG) {
    log(msg, data);
  }
};

// Store active Letta sessions for abort handling
let activeLettaSession: LettaSession | null = null;

// Store the current abort controller for external access
let currentAbortController: AbortController | null = null;

// Store agentId for reuse across conversations
let cachedAgentId: string | null = null;

// Cache agent names by agentId to support multiple agents
const agentNameCache = new Map<string, string>();

// Clear the agent cache (call when starting a new session with a different agent)
export function clearAgentCache(): void {
  cachedAgentId = null;
  // Don't clear the name cache - it's keyed by agentId so it's safe to keep
  debug("agent cache cleared (name cache preserved with " + agentNameCache.size + " entries)");
}

// Helper to get agent name from agentId (uses cache keyed by agentId)
async function getAgentName(agentId: string | null | undefined): Promise<string | undefined> {
  if (!agentId) return undefined;

  // Return cached name if available for this specific agentId
  const cachedName = agentNameCache.get(agentId);
  if (cachedName) {
    debug("getAgentName: using cached name", { agentId, cachedName });
    return cachedName;
  }

  debug("getAgentName: fetching from API", { agentId });
  try {
    const agent = await getLettaAgent(agentId);
    if (agent) {
      agentNameCache.set(agentId, agent.name);
      debug("getAgentName: fetched and cached", { agentId, agentName: agent.name });
      return agent.name;
    }
  } catch (err) {
    console.log("[runner] Failed to get agent name:", err);
  }
  return undefined;
}

export function getCurrentAgentId(): string | null {
  return activeLettaSession?.agentId ?? cachedAgentId;
}

// Abort all active sessions
export async function abortAllSessions(): Promise<void> {
  console.log("[runner] abortAllSessions called, active sessions:", activeSessions.size);
  for (const [sessionId, lettaSession] of activeSessions) {
    try {
      console.log(`[runner] aborting session: ${sessionId}`);
      await lettaSession.abort();
    } catch (err) {
      console.log(`[runner] error aborting session ${sessionId}:`, err);
    }
  }
  activeSessions.clear();
}

// Abort a specific session by conversationId
export async function abortSessionById(conversationId: string): Promise<boolean> {
  console.log("[runner] abortSessionById called:", conversationId, "active sessions:", activeSessions.size);
  
  // Try to find the session by exact match
  let sessionToAbort = activeSessions.get(conversationId);
  
  // If not found, try to find by prefix match (e.g., "pending-" prefix)
  if (!sessionToAbort) {
    for (const [key, session] of activeSessions) {
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
      activeSessions.delete(conversationId);
      console.log("[runner] session aborted successfully:", conversationId);
      return true;
    } catch (err) {
      console.log("[runner] error aborting session:", err);
      // Still remove from map
      activeSessions.delete(conversationId);
      return false;
    }
  }
  
  // Also try to abort via current abort controller
  if (currentAbortController && !currentAbortController.signal.aborted) {
    console.log("[runner] no session found, aborting via currentAbortController");
    currentAbortController.abort();
    return true;
  }
  
  console.log("[runner] no session found to abort for:", conversationId);
  return false;
}

export async function runLetta(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, content, session, resumeConversationId, preferredAgentId, model, onEvent, onSessionUpdate } = options;
  const targetAgentId = preferredAgentId?.trim() || undefined;
  
  // Create AbortController for stopping the session
  const abortController = new AbortController();
  const signal = abortController.signal;
  
  // Store abort controller globally for external access
  currentAbortController = abortController;
  
  // Session key - will be set when session is created
  let sessionKey: string = `pending-${Date.now()}`;
  let lettaSessionRef: LettaSession | null = null;
  
  const promptPreview = (prompt ?? "").slice(0, 100);
  debug("runLetta called", {
    prompt: promptPreview + ((prompt ?? "").length > 100 ? "..." : ""),
    hasContent: Array.isArray(content),
    contentItems: content?.length ?? 0,
    sessionId: session.id,
    resumeConversationId,
    preferredAgentId: targetAgentId,
    cachedAgentId,
    cwd: session.cwd,
  });

  // Mutable sessionId - starts as session.id, updated when conversationId is available
  let currentSessionId = session.id;

  const sendMessage = (message: SDKMessage) => {
    // Send all messages - UI will handle showing/hiding background messages
    onEvent({
      type: "stream.message",
      payload: { sessionId: currentSessionId, message }
    });
  };

  const sendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: currentSessionId, toolUseId, toolName, input }
    });
  };

  // Start the query in the background
  (async () => {
    try {
      // Common options for canUseTool
      const canUseTool = async (toolName: string, input: unknown) => {
        // For AskUserQuestion, we need to wait for user response
        if (toolName === "AskUserQuestion") {
          const toolUseId = crypto.randomUUID();
          sendPermissionRequest(toolUseId, toolName, input);
          return new Promise<CanUseToolResponse>((resolve) => {
            session.pendingPermissions.set(toolUseId, {
              toolUseId,
              toolName,
              input,
              resolve: (result) => {
                session.pendingPermissions.delete(toolUseId);
                resolve(result);
              }
            });
          });
        }
        return { behavior: "allow" as const };
      };

      // Session options
      const sessionOptions = {
        cwd: session.cwd ?? DEFAULT_CWD,
        permissionMode: "bypassPermissions" as const,
        canUseTool,
        systemInfoReminder: false,
        model: model,
        memfs: true,
        memfsStartup: 'background' as any
      };

      // Create or resume session
      let lettaSession: LettaSession;

      // Validate that resumeConversationId looks like a valid Letta ID
      // Valid IDs are: agent-xxx, conv-xxx, conversation-xxx, or UUIDs
      const isValidLettaId = (id: string | undefined): boolean => {
        if (!id) return false;
        // Check for known prefixes or UUID format
        return /^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(id);
      };

      if (resumeConversationId && isValidLettaId(resumeConversationId)) {
        // Resume specific conversation
        debug("creating session: resumeSession with conversationId", { resumeConversationId });
        lettaSession = resumeSession(resumeConversationId, sessionOptions);
      } else if (resumeConversationId && !isValidLettaId(resumeConversationId)) {
        // Invalid ID provided - log warning and fall back to cachedAgentId
        log("WARNING: invalid resumeConversationId, falling back", { 
          invalidId: resumeConversationId, 
          fallbackTo: targetAgentId ? "preferredAgentId" : cachedAgentId ? "cachedAgentId" : "createSession"
        });
        if (targetAgentId) {
          debug("creating session: createSession with preferredAgentId (fallback)", { preferredAgentId: targetAgentId });
          lettaSession = createSession(targetAgentId, sessionOptions);
        } else if (cachedAgentId) {
          debug("creating session: resumeSession with cachedAgentId (fallback)", { cachedAgentId });
          lettaSession = resumeSession(cachedAgentId, sessionOptions);
        } else {
          debug("creating session: createSession (new agent, fallback)");
          lettaSession = createSession(process.env.LETTA_AGENT_ID, sessionOptions);
        }
      } else if (targetAgentId) {
        // Start on explicit agent
        debug("creating session: createSession with preferredAgentId", { preferredAgentId: targetAgentId });
        lettaSession = createSession(targetAgentId, sessionOptions);
      } else if (cachedAgentId) {
        // Create new conversation on existing agent
        debug("creating session: resumeSession with cachedAgentId", { cachedAgentId });
        lettaSession = createSession(cachedAgentId, sessionOptions);
      } else {
        // First time - create new agent and session
        debug("creating session: createSession (new agent)");
        lettaSession = createSession(process.env.LETTA_AGENT_ID, sessionOptions);
      }
      debug("session created successfully");

      // CRITICAL: Store session for abort handling BEFORE send() is called
      // This ensures we can abort even if user clicks stop immediately after starting
      // Use resumeConversationId if available (for continued sessions), otherwise use conversationId or temp key
      sessionKey = resumeConversationId || lettaSession.conversationId || `temp-${Date.now()}`;
      activeSessions.set(sessionKey, lettaSession);
      activeLettaSession = lettaSession;
      lettaSessionRef = lettaSession;
      debug("session stored in activeSessions for abort handling", { sessionKey });

      // Send the prompt (triggers init internally)
      debug("calling send()");
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

      // Now initialized - update sessionId and cache agentId
      if (lettaSession.conversationId) {
        currentSessionId = lettaSession.conversationId;
        debug("session initialized", { conversationId: lettaSession.conversationId, agentId: lettaSession.agentId });
        onSessionUpdate?.({ lettaConversationId: lettaSession.conversationId });
      } else {
        log("WARNING: no conversationId available after send()");
      }

      // Cache agentId for future conversations
      if (lettaSession.agentId && !cachedAgentId) {
        cachedAgentId = lettaSession.agentId;
        debug("cached agentId for future conversations", { agentId: cachedAgentId });
      }

      // Get agent name for display (uses cache if available)
      let agentName: string | undefined = 'Unknown Agent';
      try {
        getAgentName(lettaSession.agentId || cachedAgentId || targetAgentId || undefined).then(name => {
          agentName = name || agentName;
        });
      } catch (e) {
        console.log("[runner] Failed to get agent name:", e);
      }

      // Stream messages
      debug("starting stream", { conversationId: currentSessionId });
      let messageCount = 0;
      
      // Check abort signal before starting stream
      if (signal.aborted) {
        debug("session aborted before stream started");
        onEvent({
          type: "session.status",
          payload: { sessionId: currentSessionId, status: "idle", title: currentSessionId, agentName }
        });
        activeSessions.delete(sessionKey);
        return;
      }
      
      try {
        for await (const message of lettaSession.stream()) {
          // Check if abort was requested
          if (signal.aborted) {
            debug("stream aborted, stopping message processing");
            onEvent({
              type: "session.status",
              payload: { sessionId: currentSessionId, status: "idle", title: currentSessionId, agentName }
            });
            break;
          }
          
          messageCount++;
          debug("received message", {
            message: message,
            type: message.type,
            count: messageCount,
            toolName: (message as any).toolName ?? (message as any).name ?? (message as any).tool_name,
            toolCallId: (message as any).toolCallId ?? (message as any).tool_call_id,
            inputPreview: (() => {
              const raw = (message as any).toolInput ?? (message as any).input ?? (message as any).arguments ?? (message as any).rawArguments;
              try {
                return typeof raw === "string" ? raw.slice(0, 120) : raw ? JSON.stringify(raw).slice(0, 120) : undefined;
              } catch {
                return undefined;
              }
            })(),
            outputPreview: (() => {
              const raw = (message as any).tool_return ?? (message as any).output ?? (message as any).result ?? (message as any).content;
              try {
                return typeof raw === "string" ? raw.slice(0, 120) : raw ? JSON.stringify(raw).slice(0, 120) : undefined;
              } catch {
                return undefined;
              }
            })(),
          });
          if (message.type === "tool_call" || message.type === "tool_result") {
            debug("tool payload detail", {
              type: message.type,
              keys: Object.keys((message as unknown as Record<string, unknown>) ?? {}),
              payload: (() => {
                try {
                  return JSON.parse(JSON.stringify(message));
                } catch {
                  return { failedToSerialize: true };
                }
              })(),
            });
          }
          
          // Send message directly to frontend (no transform needed)
          sendMessage(message);

          // Check for result to update session status
          if (message.type === "result") {
            const status = message.success ? "completed" : "error";
            debug("result received", { success: message.success, status });
            onEvent({
              type: "session.status",
              payload: { sessionId: currentSessionId, status, title: currentSessionId, agentName }
            });
          }
        }
      } catch (streamError) {
        // Check if this was an abort error
        if (signal.aborted || (streamError as Error).name === "AbortError") {
          debug("stream aborted (caught error)");
          onEvent({
            type: "session.status",
            payload: { sessionId: currentSessionId, status: "idle", title: currentSessionId, agentName }
          });
        } else {
          // Re-throw non-abort errors
          throw streamError;
        }
      }
      debug("stream ended", { totalMessages: messageCount });

      // Query completed normally
      if (session.status === "running") {
        debug("query completed normally");
        onEvent({
          type: "session.status",
          payload: { sessionId: currentSessionId, status: "completed", title: currentSessionId, agentName }
        });
      }
    } catch (error) {
      // Check if this was an abort
      if (signal.aborted || (error as Error).name === "AbortError") {
        // Session was aborted, don't treat as error
        debug("session aborted (caught)");
        onEvent({
          type: "session.status",
          payload: { sessionId: currentSessionId, status: "idle", title: currentSessionId }
        });
        return;
      }

      // Log detailed error info for debugging
      const errorDetails = {
        error: String(error),
        name: (error as Error).name,
        stack: (error as Error).stack,
        agentId: targetAgentId || cachedAgentId || process.env.LETTA_AGENT_ID,
        baseURL: process.env.LETTA_BASE_URL,
        apiKeyMasked: process.env.LETTA_API_KEY ? process.env.LETTA_API_KEY.substring(0, 10) + "..." : "not set",
      };
      log("ERROR in runLetta", errorDetails);

      // Cancel all active sessions on error
      debug("cancelling all active sessions due to error");
      for (const [key, session] of activeSessions) {
        try {
          await session.abort();
          activeSessions.delete(key);
        } catch (err) {
          debug("error aborting session", { key, error: String(err) });
        }
      }

      // Send detailed error to UI
      const errorMessage = `Failed to start session: ${String(error)}\n\nAgent ID: ${errorDetails.agentId}\nBase URL: ${errorDetails.baseURL}\nAPI Key: ${errorDetails.apiKeyMasked}`;

      onEvent({
        type: "session.status",
        payload: { sessionId: currentSessionId, status: "error", title: currentSessionId, error: errorMessage }
      });
    } finally {
      debug("runLetta finally block");
      // Remove from active sessions
      if (sessionKey) {
        activeSessions.delete(sessionKey);
      }
      if (lettaSessionRef && activeLettaSession === lettaSessionRef) {
        activeLettaSession = null;
      }
      currentAbortController = null;
    }
  })();

  return {
    abort: async () => {
      console.log("[runner] abort called for session:", sessionKey);
      debug("abort called", { sessionKey, hasActiveSession: !!activeLettaSession, activeSessionsCount: activeSessions.size });
      
      // Get the agent ID and conversation ID if available for cancel operations
      const agentId = lettaSessionRef?.agentId || activeLettaSession?.agentId || null;
      const conversationId = lettaSessionRef?.conversationId || activeLettaSession?.conversationId || sessionKey;
      
      // First, call abort on the Letta session (SDK) - try multiple approaches
      let sessionToAbort = activeSessions.get(sessionKey);
      
      // If not found by sessionKey, try to find any active session
      if (!sessionToAbort) {
        console.log("[runner] session not found by sessionKey, searching all sessions");
        for (const [, s] of activeSessions) {
          if (s) {
            sessionToAbort = s;
            break;
          }
        }
      }
      
      // Fallback to lettaSessionRef or activeLettaSession
      if (!sessionToAbort) {
        sessionToAbort = lettaSessionRef ?? activeLettaSession ?? undefined;
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
      // Use the actual conversation ID from the session if available
      const effectiveConversationId = conversationId && /^conv-/.test(conversationId) ? conversationId : sessionKey;
      
      const lettaClient = createLettaClient();
      
      // Try to cancel using conversation ID (if valid)
      if (effectiveConversationId && /^conv-/.test(effectiveConversationId)) {
        if (lettaClient) {
          try {
            console.log("[runner] attempting to cancel via Letta client API with conversationId:", effectiveConversationId);
            // Try to cancel using conversation ID
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
      if (currentAbortController && !currentAbortController.signal.aborted) {
        console.log("[runner] calling currentAbortController.abort()");
        currentAbortController.abort();
      }
      
      // Abort our AbortController to stop any streaming
      console.log("[runner] calling abortController.abort()");
      abortController.abort();
      console.log("[runner] abortController.abort() called");
    },
    sessionId: sessionKey
  };
}
