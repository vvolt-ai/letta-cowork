import { create } from 'zustand';
import type {
  ServerEvent,
  ClientEvent,
  SessionStatus,
  StreamMessage,
  SDKAssistantMessage,
} from "../types";
import { mergeConversationHistory, getConversationMessageId, type ConversationStreamMessage } from "../utils/conversation";
import { truncateInput } from "../utils/chat";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

export type AgentDisplayStatus =
  | "idle"
  | "thinking"
  | "running_tool"
  | "waiting_approval"
  | "generating"
  | "completed"
  | "error";

export type ReasoningStep = {
  id: string;
  content: string;
  updatedAt: number;
};

export type ToolExecution = {
  id: string;
  name: string;
  input: unknown;
  status: "running" | "completed" | "failed";
  startedAt: number;
  finishedAt?: number;
  error?: string;
  updates: string[];
};

export type EphemeralState = {
  assistantDraft?: SDKAssistantMessage;
  reasoning: ReasoningStep[];
  tools: ToolExecution[];
  status: AgentDisplayStatus;
  lastUpdated: number;
  errorMessage?: string;
};

function initialEphemeralState(): EphemeralState {
  return {
    reasoning: [],
    tools: [],
    status: "idle",
    lastUpdated: Date.now(),
  };
}

function formatToolInput(raw: unknown): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const candidateKeys = ["query", "input", "text", "message", "prompt", "raw", "display"];
    for (const key of candidateKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  const truncated = truncateInput(raw, 160);
  return truncated.length > 0 ? truncated : undefined;
}

function updateReasoning(ephemeral: EphemeralState, message: StreamMessage): EphemeralState {
  if (message.type !== "reasoning" || !("uuid" in message)) {
    return ephemeral;
  }

  const id = message.uuid;
  const existingIndex = ephemeral.reasoning.findIndex((step) => step.id === id);
  const delta = typeof (message as any).content === "string" ? (message as any).content : "";
  const previousContent = existingIndex >= 0 ? ephemeral.reasoning[existingIndex].content : "";
  const updatedStep: ReasoningStep = {
    id,
    content: previousContent + delta,
    updatedAt: Date.now(),
  };

  const nextReasoning = [...ephemeral.reasoning];
  if (existingIndex >= 0) {
    nextReasoning[existingIndex] = updatedStep;
  } else {
    nextReasoning.push(updatedStep);
  }

  return {
    ...ephemeral,
    reasoning: nextReasoning,
    lastUpdated: Date.now(),
  };
}

function upsertToolExecution(ephemeral: EphemeralState, message: StreamMessage): EphemeralState {
  if (message.type !== "tool_call" && message.type !== "tool_result") {
    return ephemeral;
  }

  const rawMessage: any = message;
  const id = rawMessage.toolCallId ?? ("uuid" in message ? message.uuid : `${Date.now()}`);
  const now = Date.now();
  const formattedInput = formatToolInput(rawMessage.toolInput ?? rawMessage.input ?? rawMessage.arguments);

  if (message.type === "tool_call") {
    const newTool: ToolExecution = {
      id,
      name: rawMessage.toolName ?? "tool",
      input: formattedInput,
      status: "running",
      startedAt: now,
      updates: [],
    };

    return {
      ...ephemeral,
      tools: [newTool],
      lastUpdated: now,
    };
  }

  if (message.type === "tool_result") {
    const logs = Array.isArray(rawMessage.logs)
      ? rawMessage.logs.map((log: unknown) => String(log))
      : [];
    const output = rawMessage.output ?? rawMessage.result ?? null;
    let errorText: string | undefined;

    if (message.isError && output) {
      try {
        errorText = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      } catch {
        errorText = String(output);
      }
    }

    const updatedTool: ToolExecution = {
      id,
      name: rawMessage.toolName ?? "tool",
      input: formattedInput ?? formatToolInput(output),
      status: message.isError ? "failed" : "completed",
      startedAt: now,
      finishedAt: now,
      error: errorText,
      updates: logs,
    };

    return {
      ...ephemeral,
      tools: [updatedTool],
      lastUpdated: now,
    };
  }

  return ephemeral;
}

function updateAssistantDraft(ephemeral: EphemeralState, message: StreamMessage): EphemeralState {
  if (message.type !== "assistant") {
    return ephemeral;
  }

  const now = Date.now();
  const existingDraft = ephemeral.assistantDraft;
  const delta = typeof (message as any).content === "string" ? (message as any).content : "";

  if (existingDraft && "uuid" in message && existingDraft.uuid === message.uuid) {
    return {
      ...ephemeral,
      assistantDraft: {
        ...existingDraft,
        ...message,
        content: (existingDraft.content || "") + delta,
      } as SDKAssistantMessage,
      lastUpdated: now,
    };
  }

  return {
    ...ephemeral,
    assistantDraft: {
      ...(message as SDKAssistantMessage),
      content: delta,
    },
    lastUpdated: now,
  };
}

function clearEphemeral(_ephemeral: EphemeralState, status: AgentDisplayStatus = "idle", errorMessage?: string): EphemeralState {
  return {
    reasoning: [],
    tools: [],
    assistantDraft: undefined,
    status,
    errorMessage,
    lastUpdated: Date.now(),
  };
}

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  agentName?: string;
  agentId?: string;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
  hasMoreHistory?: boolean;
  oldestMessageId?: string | null;
  isLoadingHistory?: boolean;
  ephemeral: EphemeralState;
};

export type CoworkSettings = {
  showWhatsApp: boolean;
  showTelegram: boolean;
  showSlack: boolean;
  showDiscord: boolean;
  showEmailAutomation: boolean;
  showLettaEnv: boolean;
};

const SELECTED_MODEL_STORAGE_KEY = "letta:selected-model";

interface AppState {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  emailSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionsLoaded: boolean;
  showStartModal: boolean;
  historyRequested: Set<string>;
  coworkSettings: CoworkSettings;
  selectedModel: string;
  // IPC function reference
  ipcSendEvent: ((event: ClientEvent) => void) | null;

  setIPCSendEvent: (sendEvent: (event: ClientEvent) => void) => void;
  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null, fetchHistory?: boolean) => void;
  renameSession: (sessionId: string, title: string) => void;
  fetchSessionHistory: (sessionId: string, limit?: number, before?: string) => void;
  setEmailSessionId: (id: string) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  setCoworkSettings: (settings: CoworkSettings) => void;
  setSelectedModel: (model: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
}

function createSession(id: string): SessionView {
  return {
    id,
    title: "",
    status: "idle",
    messages: [],
    permissionRequests: [],
    hydrated: false,
    hasMoreHistory: false,
    oldestMessageId: null,
    ephemeral: initialEphemeralState(),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  emailSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionsLoaded: false,
  showStartModal: false,
  historyRequested: new Set(),
  coworkSettings: {
    showWhatsApp: false,
    showTelegram: false,
    showSlack: false,
    showDiscord: false,
    showEmailAutomation: false,
    showLettaEnv: false,
  },
  selectedModel: (() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  })(),
  ipcSendEvent: null,

  setIPCSendEvent: (sendEvent) => set({ ipcSendEvent: sendEvent }),

  fetchSessionHistory: (sessionId, limit = 200, before) => {
    const state = get();
    const session = state.sessions[sessionId];
    if (!session || session.isLoadingHistory) return;

    const cursor = before ?? session.oldestMessageId ?? undefined;
    console.debug("[useAppStore] fetchSessionHistory", {
      sessionId,
      limit,
      cursor,
      hydrated: session.hydrated,
    });

    set((current) => ({
      sessions: {
        ...current.sessions,
        [sessionId]: { ...session, isLoadingHistory: true },
      },
    }));

    if (state.ipcSendEvent) {
      state.ipcSendEvent({
        type: "session.history",
        payload: {
          sessionId,
          limit,
          ...(cursor ? { before: cursor } : {}),
        },
      });
    }
  },

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setActiveSessionId: (id, fetchHistory = true) => {
    set((state) => {
      // Clear messages from other sessions when switching to improve performance
      const updatedSessions: Record<string, SessionView> = {};
      
      for (const [sessionId, sess] of Object.entries(state.sessions)) {
        if (sessionId === id) {
          updatedSessions[sessionId] = sess;
        } else {
          // Keep session but clear messages to free memory
          updatedSessions[sessionId] = {
            ...sess,
            messages: [],
            hydrated: false,
            hasMoreHistory: false,
            oldestMessageId: null,
            ephemeral: initialEphemeralState(),
          };
        }
      }
      
      return { activeSessionId: id, sessions: updatedSessions };
    });
    
    // Always try to fetch history - the useEffect will also try, but this ensures it happens
    // We don't clear historyRequested here anymore to avoid race conditions
    if (fetchHistory && id) {
      // Use setTimeout to ensure state is updated first
      setTimeout(() => {
        const state = get();
        const session = state.sessions[id];
        // Only fetch if session exists, not hydrated, and not currently loading
        if (session && !session.hydrated && !session.isLoadingHistory && state.ipcSendEvent) {
          state.ipcSendEvent({
            type: "session.history",
            payload: { sessionId: id }
          });
        }
      }, 0);
    }
  },

  renameSession: (sessionId, title) => {
    const state = get();
    const session = state.sessions[sessionId];
    if (!session) return;

    set((current) => ({
      sessions: {
        ...current.sessions,
        [sessionId]: {
          ...current.sessions[sessionId],
          title,
          updatedAt: Date.now(),
        },
      },
    }));

    state.ipcSendEvent?.({
      type: "session.rename",
      payload: { sessionId, title },
    });
  },

  setEmailSessionId: (id: string) => set({ emailSessionId: id }),

  markHistoryRequested: (sessionId) => {
    set((state) => {
      const next = new Set(state.historyRequested);
      next.add(sessionId);
      return { historyRequested: next };
    });
  },

  setCoworkSettings: (settings) => {
    set({ coworkSettings: settings });
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
    if (typeof window !== "undefined") {
      try {
        if (model) {
          window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, model);
        } else {
          window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
        }
      } catch {
        // ignore storage errors
      }
    }
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      const remaining = existing.permissionRequests.filter((req) => req.toolUseId !== toolUseId);
      const nextStatus: AgentDisplayStatus = remaining.length === 0 ? "generating" : existing.ephemeral.status;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: remaining,
            ephemeral: {
              ...existing.ephemeral,
              status: nextStatus,
              lastUpdated: Date.now(),
            },
          },
        },
      };
    });
  },

  handleServerEvent: (event) => {
    const rootState = get();

    switch (event.type) {
      case "session.list": {
        const nextSessions: Record<string, SessionView> = {};
        for (const session of event.payload.sessions) {
          const existing = rootState.sessions[session.id] ?? createSession(session.id);
          nextSessions[session.id] = {
            ...existing,
            status: session.status,
            title: session.title,
            agentName: session.agentName,
            agentId: session.agentId ?? existing.agentId,
            cwd: session.cwd,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            ephemeral: existing.ephemeral ?? initialEphemeralState(),
          };
        }

        set({ sessions: nextSessions, sessionsLoaded: true, showStartModal: event.payload.sessions.length === 0 });

        if (event.payload.sessions.length === 0) {
          get().setActiveSessionId(null);
          break;
        }

        if (!rootState.activeSessionId) {
          const sorted = [...event.payload.sessions].sort((a, b) => {
            const aTime = a.updatedAt ?? a.createdAt ?? 0;
            const bTime = b.updatedAt ?? b.createdAt ?? 0;
            return aTime - bTime;
          });
          const latestSession = sorted[sorted.length - 1];
          if (latestSession) {
            get().setActiveSessionId(latestSession.id);
          }
        } else {
          const stillExists = event.payload.sessions.some((session) => session.id === rootState.activeSessionId);
          if (!stillExists) {
            get().setActiveSessionId(null);
          }
        }
        break;
      }

      case "session.history": {
        const {
          sessionId,
          messages: historyMessages,
          status,
          hasMore,
          nextBefore,
          requestedBefore,
          error: historyError,
        } = event.payload as any;

        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const existingMessages = (existing.messages as ConversationStreamMessage[]) ?? [];
          const incoming = (historyMessages as ConversationStreamMessage[]) ?? [];

          const mergedMessages = requestedBefore
            ? mergeConversationHistory(incoming, existingMessages)
            : mergeConversationHistory(existingMessages, incoming);

          const oldestMessageId = nextBefore ?? (mergedMessages[0] ? getConversationMessageId(mergedMessages[0]) ?? null : null);

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                messages: mergedMessages,
                hydrated: true,
                hasMoreHistory: hasMore,
                oldestMessageId: oldestMessageId ?? null,
                isLoadingHistory: false,
                ephemeral: clearEphemeral(
                  existing.ephemeral ?? initialEphemeralState(),
                  status === "completed" ? "completed" : "idle"
                ),
              },
            },
          };
        });

        if (historyError) {
          set({ globalError: String(historyError) });
        }
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd, error, agentName, agentId } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const nextEphemeral = { ...existing.ephemeral };
          if (status === "completed") {
            nextEphemeral.status = "completed";
            nextEphemeral.errorMessage = undefined;
          }
          if (status === "error") {
            nextEphemeral.status = "error";
            nextEphemeral.errorMessage = error ?? "Unknown error";
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                agentName: agentName ?? existing.agentName,
                agentId: agentId ?? existing.agentId,
                updatedAt: Date.now(),
                ephemeral: nextEphemeral,
              },
            },
          };
        });

        if (rootState.pendingStart) {
          if (status === "running") {
            get().setActiveSessionId(sessionId);
            set({ pendingStart: false, showStartModal: false, prompt: "" });
          } else {
            set({
              pendingStart: false,
              showStartModal: true,
              ...(status === "error" ? { globalError: error ?? "Failed to start session." } : {}),
            });
          }
        }
        break;
      }

      case "session.deleted": {
        const { sessionId } = event.payload;
        const state = get();
        const nextSessions = { ...state.sessions };
        delete nextSessions[sessionId];

        const nextHistoryRequested = new Set(state.historyRequested);
        nextHistoryRequested.delete(sessionId);

        const hasRemaining = Object.keys(nextSessions).length > 0;

        set({
          sessions: nextSessions,
          historyRequested: nextHistoryRequested,
          showStartModal: !hasRemaining,
        });

        if (state.activeSessionId === sessionId) {
          const remaining = Object.values(nextSessions).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          get().setActiveSessionId(remaining[0]?.id ?? null);
        }
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const currentEphemeral = existing.ephemeral ?? initialEphemeralState();
          let messages = existing.messages;
          let ephemeral = currentEphemeral;
          let status: AgentDisplayStatus = currentEphemeral.status;

          switch (message.type) {
            case "stream_event": {
              // handled separately for partial content, keep UI responsive
              return {
                sessions: {
                  ...state.sessions,
                  [sessionId]: {
                    ...existing,
                    messages,
                    ephemeral,
                  },
                },
              };
            }
            case "reasoning": {
              ephemeral = updateReasoning(currentEphemeral, message);
              status = "thinking";
              break;
            }
            case "tool_call": {
              const toolCall = message as StreamMessage;
              const toolCallId = (toolCall as any).toolCallId ?? (toolCall as any).id ?? (toolCall as any).uuid;
              const existingIndex = typeof toolCallId !== "undefined"
                ? messages.findIndex(
                    (msg) =>
                      msg.type === "tool_call" &&
                      ((msg as any).toolCallId ?? (msg as any).id ?? (msg as any).uuid) === toolCallId,
                  )
                : -1;
              if (existingIndex >= 0) {
                messages = messages.map((msg, idx) => (idx === existingIndex ? toolCall : msg));
              } else {
                messages = [...messages, toolCall];
              }

              ephemeral = upsertToolExecution(currentEphemeral, message);
              status = "running_tool";
              break;
            }
            case "tool_result": {
              const toolResult = message as StreamMessage;
              const toolCallId = (toolResult as any).toolCallId ?? (toolResult as any).id ?? (toolResult as any).uuid;
              const existingIndex = typeof toolCallId !== "undefined"
                ? messages.findIndex(
                    (msg) =>
                      msg.type === "tool_result" &&
                      ((msg as any).toolCallId ?? (msg as any).id ?? (msg as any).uuid) === toolCallId,
                  )
                : -1;
              if (existingIndex >= 0) {
                messages = messages.map((msg, idx) => (idx === existingIndex ? toolResult : msg));
              } else {
                messages = [...messages, toolResult];
              }

              ephemeral = upsertToolExecution(currentEphemeral, message);
              const hasRunning = ephemeral.tools.some((tool) => tool.status === "running");
              status = message.isError ? "error" : hasRunning ? "running_tool" : "generating";
              if (message.isError) {
                const raw = message as any;
                const candidate = raw.output ?? raw.result ?? raw.error ?? raw.message;
                let errorText = "Tool execution failed";
                if (candidate) {
                  try {
                    errorText = typeof candidate === "string" ? candidate : JSON.stringify(candidate, null, 2);
                  } catch {
                    errorText = String(candidate);
                  }
                }
                ephemeral = {
                  ...ephemeral,
                  errorMessage: errorText,
                };
              }
              break;
            }
            case "assistant": {
              const updatedDraft = updateAssistantDraft(currentEphemeral, message);
              ephemeral = {
                ...updatedDraft,
                tools: [],
              };
              status = "generating";
              break;
            }
            case "result": {
              if (message.success) {
                const draft = currentEphemeral.assistantDraft;
                if (draft) {
                  const existingIndex = messages.findIndex(
                    (m) => m.type === "assistant" && "uuid" in m && "uuid" in draft && m.uuid === draft.uuid
                  );
                  const finalMessage: StreamMessage = {
                    ...draft,
                    content: draft.content ?? "",
                  } as StreamMessage;
                  messages = existingIndex >= 0
                    ? messages.map((msg, idx) => (idx === existingIndex ? finalMessage : msg))
                    : [...messages, finalMessage];
                }
                status = "completed";
                ephemeral = clearEphemeral(currentEphemeral, "completed");
              } else {
                status = "error";
                ephemeral = clearEphemeral(currentEphemeral, "error", message.error ?? "Assistant failed to respond");
              }
              break;
            }
            case "init": {
              status = "thinking";
              ephemeral = {
                ...currentEphemeral,
                status,
                lastUpdated: Date.now(),
              };
              break;
            }
            default: {
              break;
            }
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages,
                ephemeral: {
                  ...ephemeral,
                  status,
                  lastUpdated: Date.now(),
                },
              },
            },
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt, attachments, content } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const newMessages = [
            ...existing.messages,
            { type: "user_prompt" as const, prompt, attachments, content },
          ];
          const nextEphemeral = clearEphemeral(existing.ephemeral ?? initialEphemeralState(), "thinking");
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: newMessages,
                lastPrompt: prompt,
                ephemeral: nextEphemeral,
              },
            },
          };
        });
        break;
      }

      case "permission.request": {
        const { sessionId, toolUseId, toolName, input } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }],
                ephemeral: {
                  ...existing.ephemeral,
                  status: "waiting_approval",
                  lastUpdated: Date.now(),
                },
              },
            },
          };
        });
        break;
      }

      case "runner.error": {
        set({ globalError: event.payload.message, pendingStart: false, showStartModal: true });
        break;
      }
    }
  }
}));
