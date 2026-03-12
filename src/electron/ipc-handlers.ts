import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent } from "./types.js";
import { runLetta, type RunnerHandle, getCurrentAgentId } from "./libs/runner.js";
import type { PendingPermission } from "./libs/runtime-state.js";
import {
  createRuntimeSession,
  getSession,
  updateSession,
  deleteSession,
} from "./libs/runtime-state.js";
import { Letta } from "@letta-ai/letta-client";
import {
  getStoredSessions,
  addStoredSession,
  removeStoredSession,
  type StoredSession,
} from "./settings.js";

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
      status: getSession(session.id)?.status || "idle",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
    emit({ type: "session.list", payload: { sessions } });
    return;
  }

  if (event.type === "session.history") {
    // Fetch messages from Letta API
    const conversationId = event.payload.sessionId;
    const limit = event.payload.limit || 20;
    const before = event.payload.before || undefined;
    const status = getSession(conversationId)?.status || "idle";
    
    const lettaClient = createLettaClient();
    if (!lettaClient) {
      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, messages: [], error: "Letta client not available" },
      });
      return;
    }
    
    try {
      // Fetch messages from Letta
      const response = await lettaClient.conversations.messages.list(conversationId, {
        limit,
        order: "asc", // Oldest first - so we can append newer messages at the end
        order_by: 'created_at',
        after: before
      });
      
      // Get messages from the paginated response - cast to any to handle Letta's complex types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = response.items;
      
      // Convert Letta messages to SDK message format for the UI
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];

      console.log(items);
      for (const msg of items) {
        // Map Letta message types to SDK message types
        const msgType = msg.message_type || msg.type;
        
        // Filter out non-display message types
        // system_message = agent's system prompt/instructions
        // reasoning_message = internal agent thinking
        // approval_request_message = requests to run tools (Skill/Bash)
        // approval_response_message = approval responses
        // tool_return_message = tool execution results
        if (msgType === "system_message" || 
            msgType === "reasoning_message" || 
            msgType === "approval_request_message" ||
            msgType === "approval_response_message" ||
            msgType === "tool_return_message" ||
            msgType === "tool_call" || 
            msgType === "tool_use" ||
            msgType === "tool_result") {
          continue;
        }

        // Letta uses: user_message, agent_message, assistant_message, etc.
        // SDK expects: init, assistant, reasoning, tool_call, tool_result
        // Map accordingly
        if (msgType === "user_message") {
          const content = msg.content;
          // Handle Letta's content format: array of {type: "text", text: string} blocks
          // Get only the last message from the array
          let promptText = "";
          if (Array.isArray(content) && content.length > 0) {
            const lastBlock = content[content.length - 1];
            promptText = lastBlock?.text || "";
          } else if (typeof content === "string") {
            promptText = content;
          } else if (content) {
            promptText = JSON.stringify(content);
          }
          
          messages.push({
            id: msg.id || msg.message_id,
            type: "user_prompt", // Use local user_prompt type
            prompt: promptText,
            createdAt: msg.created_at || Date.now(),
          });
          continue;
        }
        
        // For agent/assistant messages - also get only the last message
        const agentContent = msg.content;
        let agentText = "";
        if (Array.isArray(agentContent) && agentContent.length > 0) {
          const lastBlock = agentContent[agentContent.length - 1];
          agentText = lastBlock?.text || "";
        } else if (typeof agentContent === "string") {
          agentText = agentContent;
        } else if (agentContent) {
          agentText = JSON.stringify(agentContent);
        }
        
        // Skip empty assistant messages
        if (!agentText || agentText.trim() === "") {
          continue;
        }
        
        messages.push({
          id: msg.id || msg.message_id,
          type: "assistant",
          role: "assistant",
          content: agentText,
          createdAt: msg.created_at || Date.now(),
        });
      }
      
      emit({
        type: "session.history",
        payload: { 
          sessionId: conversationId, 
          status, 
          messages,
          hasMore: items.length === limit,
          before: items.length > 0 ? items[items.length - 1].id : undefined, // For asc order, this is the newest message
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
    debug("session.start: starting new session", { prompt: event.payload.prompt.slice(0, 50), cwd: event.payload.cwd });
    const pendingPermissions = new Map<string, PendingPermission>();
    let conversationId: string | null = null;
    let handle: RunnerHandle | null = null;
    
    try {
      debug("session.start: calling runLetta");
      handle = await runLetta({
        prompt: event.payload.prompt,
        preferredAgentId: event.payload.agentId,
        session: {
          id: "pending",
          title: event.payload.title,
          status: "running",
          cwd: event.payload.cwd,
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
        onSessionUpdate: (updates) => {
          // Called when session is initialized with conversationId
          debug("session.start: onSessionUpdate called", { updates });
          if (updates.lettaConversationId && !conversationId) {
            conversationId = updates.lettaConversationId;
            debug("session.start: session initialized", { conversationId });
            
            createRuntimeSession(conversationId);
            updateSession(conversationId, { status: "running" });
            
            // Store session in electron-store for persistence
            const agentId = event.payload.agentId || process.env.LETTA_AGENT_ID || "";
            addStoredSession({
              id: conversationId,
              agentId,
              title: event.payload.title || conversationId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            
            // Store handle with the correct conversationId and remove pending key
            if (handle) {
              runnerHandles.delete("pending");
              runnerHandles.set(conversationId, handle);
            }
            
            // Emit session.status to unblock UI - use conversationId as title
            emit({
              type: "session.status",
              payload: { sessionId: conversationId, status: "running", title: conversationId, cwd: event.payload.cwd },
            });
            emit({
              type: "stream.user_prompt",
              payload: { sessionId: conversationId, prompt: event.payload.prompt },
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
    const conversationId = event.payload.sessionId;
    debug("session.continue: continuing session", { conversationId, prompt: event.payload.prompt.slice(0, 50) });
    
    let runtimeSession = getSession(conversationId);
    
    if (!runtimeSession) {
      debug("session.continue: no runtime session found, creating new one");
      runtimeSession = createRuntimeSession(conversationId);
    } else {
      debug("session.continue: found existing runtime session", { status: runtimeSession.status });
    }

    updateSession(conversationId, { status: "running" });
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "running" },
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: conversationId, prompt: event.payload.prompt },
    });

    try {
      debug("session.continue: calling runLetta", { conversationId });
      let actualConversationId = conversationId;
      
      const handle = await runLetta({
        prompt: event.payload.prompt,
        session: {
          id: conversationId,
          title: conversationId,
          status: "running",
          cwd: event.payload.cwd,
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
                cwd: event.payload.cwd 
              },
            });
            // Re-emit the user prompt for the new session
            emit({
              type: "stream.user_prompt",
              payload: { sessionId: actualConversationId, prompt: event.payload.prompt },
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

export async function cleanupAllSessions(): Promise<void> {
  const abortPromises: Promise<void>[] = [];
  for (const [, handle] of runnerHandles) {
    abortPromises.push(handle.abort());
  }
  await Promise.all(abortPromises);
  runnerHandles.clear();
}
