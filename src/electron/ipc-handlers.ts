import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent, StreamMessage } from "./types.js";
import { runLetta, type RunnerHandle, getCurrentAgentId, clearAgentCache } from "./libs/runner.js";
import type { PendingPermission } from "./libs/runtime-state.js";
import {
  createRuntimeSession,
  getSession,
  updateSession,
  deleteSession,
} from "./libs/runtime-state.js";
import { Letta } from "@letta-ai/letta-client";
import { normaliseHistoryBatch, type LettaMessage } from "./libs/conversation.js";
import {
  getStoredSessions,
  addStoredSession,
  removeStoredSession,
  updateStoredSession,
  type StoredSession,
} from "./settings.js";
import { getLettaAgent, getAgentRunApprovalCandidates, cancelAgentRunById } from "./lettaAgents.js";

const DEBUG = process.env.DEBUG_IPC === "true";

// Simple logger for IPC handlers
const log = (msg: string, data?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [ipc] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [ipc] ${msg}`);
  }
};

// Debug-only logging (verbose)
const debug = (msg: string, data?: Record<string, unknown>) => {
  console.log(`[${new Date().toISOString()}] [ipc] ${msg}`, data);
  if (!DEBUG) return;
  log(msg, data);
};

// Create Letta client helper
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

// Track active runner handles
const runnerHandles = new Map<string, RunnerHandle>();

function extractMessageText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content) && content.length > 0) {
    const lastBlock = content[content.length - 1] as any;
    if (lastBlock && typeof lastBlock.text === "string") {
      return lastBlock.text;
    }
    if (typeof lastBlock === "string") {
      return lastBlock;
    }
    try {
      return JSON.stringify(lastBlock);
    } catch {
      return String(lastBlock ?? "");
    }
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content ?? "");
    }
  }
  return String(content ?? "");
}

function mapLettaMessagesToStreamMessages(rawMessages: LettaMessage[]): StreamMessage[] {
  const sorted = [...rawMessages].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
  const messages: StreamMessage[] = [];

  for (const msg of sorted) {
    const msgType = (msg.message_type || msg.type || "").toLowerCase();

    if (msgType === "user_message") {
      const promptText = extractMessageText(msg.content).trim();
      if (!promptText) continue;
      messages.push({
        type: "user_prompt",
        prompt: promptText,
        attachments: undefined,
        content: undefined,
      });
      continue;
    }

    if (msgType === "assistant_message") {
      const agentText = extractMessageText(msg.content).trim();
      if (!agentText) continue;
      messages.push({
        type: "assistant",
        content: agentText,
      } as StreamMessage);
      continue;
    }
  }

  return messages;
}

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send("server-event", payload);
  }
}

function emit(event: ServerEvent) {
  // Update runtime state on status changes
  if (event.type === "session.status") {
    updateSession(event.payload.sessionId, { status: event.payload.status });
  }
  broadcast(event);
}

export async function handleClientEvent(event: ClientEvent) {
  debug(`handleClientEvent: ${event.type}`, { payload: 'payload' in event ? event.payload : undefined });
  
  if (event.type === "session.list") {
    // Return stored sessions from electron-store
    const storedSessions = getStoredSessions();
    const sessions = storedSessions.map((session: StoredSession) => ({
      id: session.id,
      title: session.title,
      agentName: session.agentName,
      agentId: session.agentId,
      status: getSession(session.id)?.status || "idle",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isEmailSession: session.isEmailSession ?? false,
    }));
    emit({ type: "session.list", payload: { sessions } });
    return;
  }

  if (event.type === "session.history") {
    const conversationId = event.payload.sessionId;
    const limit = event.payload.limit || 50;
    const requestedBefore = event.payload.before || undefined;
    const status = getSession(conversationId)?.status || "idle";
    
    const lettaClient = createLettaClient();
    debug("session.history: request", {
      conversationId,
      limit,
      requestedBefore,
    });
    if (!lettaClient) {
      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, messages: [], error: "Letta client not available" },
      });
      return;
    }
    
    try {
      const response = await lettaClient.conversations.messages.list(conversationId, {
        limit,
        ...(requestedBefore ? { before: requestedBefore } : {}),
      } as any);
      const items = (Array.isArray((response as any).items) ? (response as any).items : []) as unknown as LettaMessage[];

      const normalised = normaliseHistoryBatch(items, limit);
      const messages = normalised.messages.filter((msg) => (msg as any)?.type !== "reasoning");
      const totalFetchedCount = typeof (response as any)?.total === "number" ? (response as any).total : items.length;
      const totalDisplayableCount = normalised.allFiltered.length;
      const hasMore = typeof (response as any)?.has_more === "boolean"
        ? (response as any).has_more
        : normalised.hasMore;
      const nextBefore = ((response as any)?.next_before as string | undefined) ?? normalised.nextBefore;

      debug("session.history: response", {
        conversationId,
        requestedBefore,
        returned: messages.length,
        filteredTotal: normalised.allFiltered.length,
        totalFetchedCount,
        totalDisplayableCount,
        hasMore,
        nextBefore,
      });

      emit({
        type: "session.history",
        payload: {
          sessionId: conversationId,
          status,
          messages,
          hasMore,
          nextBefore,
          requestedBefore,
          totalFetchedCount,
          totalDisplayableCount,
        },
      });
    } catch (error) {
      console.error("Failed to fetch session history:", error);
      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, messages: [], error: String(error) },
      });
    }
    return;
  }

  if (event.type === "session.start") {
    const { prompt, content, attachments, cwd, agentId, model, title, background, isEmailSession } = event.payload;
    
    // Clear agent cache to ensure fresh agent name is fetched
    clearAgentCache();
    
    debug("session.start: starting new session", {
      prompt: (prompt ?? "").slice(0, 50),
      cwd,
      contentType: Array.isArray(content) ? "multimodal" : "text",
      attachments: attachments?.length ?? 0,
      background,
      isEmailSession,
    });
    const pendingPermissions = new Map<string, PendingPermission>();
    let conversationId: string | null = null;
    let handle: RunnerHandle | null = null;
    
    try {
      debug("session.start: calling runLetta");
      handle = await runLetta({
        prompt,
        content,
        preferredAgentId: agentId,
        model,
        session: {
          id: "pending",
          title,
          status: "running",
          cwd,
          pendingPermissions,
        },
        onEvent: (e) => {
          // Use conversationId for all events
          if (conversationId && "sessionId" in e.payload) {
            const payload = e.payload as { sessionId: string };
            payload.sessionId = conversationId;
          }
          emit(e);
        },
        onSessionUpdate: async (updates) => {
          // Called when session is initialized with conversationId
          debug("session.start: onSessionUpdate called", { updates });
          if (updates.lettaConversationId && !conversationId) {
            conversationId = updates.lettaConversationId;
            debug("session.start: session initialized", { conversationId });
            
            const sessionTitle = (title?.trim() ?? "") || conversationId;

            createRuntimeSession(conversationId);
            updateSession(conversationId, { status: "running", title: sessionTitle });
            
            // Store session in electron-store for persistence
            const resolvedAgentId = agentId || process.env.LETTA_AGENT_ID || "";
            
            // Get agent name for storage
            let agentName: string | undefined = undefined;
            try {
              console.log("[ipc] Getting agent name for agentId:", resolvedAgentId);
              const agent = await getLettaAgent(resolvedAgentId);
              console.log("[ipc] Got agent:", agent);
              if (agent) {
                agentName = agent.name;
              }
            } catch (e) {
              console.log("[ipc] Failed to get agent name:", e);
            }
            
            addStoredSession({
              id: conversationId,
              agentId: resolvedAgentId,
              agentName,
              title: sessionTitle,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              isEmailSession: isEmailSession ?? false,
            });
            
            // Store handle with the correct conversationId and remove pending key
            if (handle) {
              runnerHandles.delete("pending");
              runnerHandles.set(conversationId, handle);
            }
            
            // Emit session.status to unblock UI with resolved title
            // Include background flag so UI knows not to switch to this session
            emit({
              type: "session.status",
              payload: { sessionId: conversationId, status: "running", title: sessionTitle, cwd, agentName, agentId: resolvedAgentId, background, isEmailSession },
            });
            emit({
              type: "stream.user_prompt",
              payload: { sessionId: conversationId, prompt, attachments, content },
            });
          }
        },
      });
      
      // Store handle immediately after runLetta returns with a temporary key
      // This ensures we can abort even before onSessionUpdate is called
      if (handle) {
        runnerHandles.set("pending", handle);
      }
      debug("session.start: runLetta returned handle");
    } catch (error) {
      log("session.start: ERROR", { error: String(error) });
      console.error("Failed to start session:", error);
      emit({
        type: "runner.error",
        payload: { message: String(error) },
      });
    }
    return;
  }

  if (event.type === "session.continue") {
    const {
      sessionId: conversationId,
      prompt,
      content,
      attachments,
      cwd,
      model,
    } = event.payload;
    const previewPrompt = (prompt ?? "").slice(0, 50);
    debug("session.continue: continuing session", {
      conversationId,
      prompt: previewPrompt,
      contentType: Array.isArray(content) ? "multimodal" : "text",
      attachments: attachments?.length ?? 0,
    });
    
    let runtimeSession = getSession(conversationId);
    
    if (!runtimeSession) {
      debug("session.continue: no runtime session found, creating new one");
      runtimeSession = createRuntimeSession(conversationId);
    } else {
      debug("session.continue: found existing runtime session", { status: runtimeSession.status });
    }

    const storedSession = runtimeSession.title
      ? undefined
      : getStoredSessions().find((session) => session.id === conversationId);
    const resolvedTitle = runtimeSession.title ?? storedSession?.title ?? conversationId;

    runtimeSession = updateSession(conversationId, {
      status: "running",
      title: resolvedTitle,
    }) ?? runtimeSession;

    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "running", title: resolvedTitle },
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: conversationId, prompt, attachments, content },
    });

    try {
      debug("session.continue: calling runLetta", { conversationId });
      let actualConversationId = conversationId;
      
      const handle = await runLetta({
        prompt,
        content,
        model,
        session: {
          id: conversationId,
          title: resolvedTitle,
          status: "running",
          cwd,
          pendingPermissions: runtimeSession.pendingPermissions,
        },
        resumeConversationId: conversationId,
        onEvent: (e) => {
          // Update sessionId in events if we got a new conversationId
          if (actualConversationId !== conversationId && "sessionId" in e.payload) {
            const payload = e.payload as { sessionId: string };
            payload.sessionId = actualConversationId;
          }
          emit(e);
        },
        onSessionUpdate: (updates) => {
          // If we get a new conversationId (e.g., fallback from invalid ID), update everything
          if (updates.lettaConversationId && updates.lettaConversationId !== conversationId) {
            log("session.continue: received new conversationId from runner", { 
              old: conversationId, 
              new: updates.lettaConversationId 
            });
            actualConversationId = updates.lettaConversationId;
            
            // Delete the old invalid session from UI and runtime state
            deleteSession(conversationId);
            emit({ type: "session.deleted", payload: { sessionId: conversationId } });
            
            // Create new runtime session for the actual conversation
            createRuntimeSession(actualConversationId);
            updateSession(actualConversationId, { status: "running" });
            
            // Notify UI about the new session
            emit({
              type: "session.status",
              payload: { 
                sessionId: actualConversationId, 
                status: "running", 
                title: actualConversationId, 
                cwd,
              },
            });
            // Re-emit the user prompt for the new session
            emit({
              type: "stream.user_prompt",
              payload: { sessionId: actualConversationId, prompt, attachments, content },
            });
          }
        },
      });
      debug("session.continue: runLetta returned handle");
      runnerHandles.set(actualConversationId, handle);
    } catch (error) {
      log("session.continue: ERROR", { error: String(error) });
      updateSession(conversationId, { status: "error" });
      emit({
        type: "session.status",
        payload: { sessionId: conversationId, status: "error", error: String(error) },
      });
    }
    return;
  }

  if (event.type === "session.stop") {
    const conversationId = event.payload.sessionId;
    debug("session.stop: stopping session", { conversationId, availableHandles: Array.from(runnerHandles.keys()) });
    
    // Try to get handle by conversationId first, then by "pending" key
    let handle = runnerHandles.get(conversationId);
    if (!handle) {
      handle = runnerHandles.get("pending");
    }
    
    // Also try to find by sessionId property (new approach)
    if (!handle) {
      for (const [key, h] of runnerHandles) {
        if (h.sessionId === conversationId || h.sessionId === "pending") {
          handle = h;
          debug("session.stop: found handle by sessionId property", { key, sessionId: h.sessionId });
          break;
        }
      }
    }
    
    if (handle) {
      debug("session.stop: aborting handle");
      // Await the abort to ensure it completes
      await handle.abort();
      runnerHandles.delete(conversationId);
      runnerHandles.delete("pending");
      // Also delete by sessionId if different
      for (const [key, h] of runnerHandles) {
        if (h.sessionId === conversationId) {
          runnerHandles.delete(key);
        }
      }
    } else {
      debug("session.stop: no handle found");
    }
    updateSession(conversationId, { status: "idle" });
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "idle" },
    });
    return;
  }

  if (event.type === "session.delete") {
    const conversationId = event.payload.sessionId;
    const handle = runnerHandles.get(conversationId);
    if (handle) {
      handle.abort();
      runnerHandles.delete(conversationId);
    }
    
    // Also delete from Letta server
    const lettaClient = createLettaClient();
    if (lettaClient && conversationId) {
      try {
        await lettaClient.conversations.delete(conversationId);
      } catch (err) {
        console.error("Failed to delete conversation from Letta:", err);
      }
    }
    
    // Remove from electron-store
    deleteSession(conversationId);
    removeStoredSession(conversationId);
    
    emit({ type: "session.deleted", payload: { sessionId: conversationId } });
    return;
  }

  if (event.type === "session.rename") {
    const { sessionId, title } = event.payload;
    updateStoredSession(sessionId, { title, updatedAt: Date.now() });
    const runtime = updateSession(sessionId, { title }) ?? getSession(sessionId);
    emit({
      type: "session.status",
      payload: {
        sessionId,
        status: runtime?.status ?? "idle",
        title,
      },
    });
    return;
  }

  if (event.type === "permission.response") {
    const session = getSession(event.payload.sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) {
      pending.resolve(event.payload.result);
    }
    return;
  }
}

export async function recoverPendingApprovalsForSession(sessionId: string, agentId?: string) {
  const resolvedAgentId = agentId
    || getSession(sessionId)?.agentId
    || getStoredSessions().find((session) => session.id === sessionId)?.agentId;

  if (!resolvedAgentId) {
    return [];
  }

  try {
    const candidates = await getAgentRunApprovalCandidates(resolvedAgentId, sessionId);
    for (const candidate of candidates) {
      emit({
        type: "permission.request",
        payload: {
          sessionId,
          toolUseId: candidate.toolUseId,
          toolName: candidate.toolName,
          input: candidate.input,
          source: "recovered",
          runId: candidate.runId,
          conversationId: candidate.conversationId,
          isStuckRun: true,
          requestedAt: candidate.requestedAt,
        },
      });
    }
    return candidates;
  } catch (error) {
    console.warn("Failed to recover pending approvals for session", { sessionId, resolvedAgentId, error });
    return [];
  }
}

export async function cancelRecoveredRun(runId: string) {
  return cancelAgentRunById(runId);
}

export async function cleanupAllSessions(): Promise<void> {
  const abortPromises: Promise<void>[] = [];
  for (const [, handle] of runnerHandles) {
    abortPromises.push(handle.abort());
  }
  await Promise.all(abortPromises);
  runnerHandles.clear();
}
