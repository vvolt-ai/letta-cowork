import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ServerEvent,
  ClientEvent,
  SessionStatus,
  StreamMessage,
  SDKAssistantMessage,
  CliResultMessage,
} from "../types";
import { mergeConversationHistory, getConversationMessageId, type ConversationStreamMessage } from "../utils/conversation";
import { truncateInput } from "../utils/chat";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  source?: "live" | "recovered";
  runId?: string;
  conversationId?: string;
  isStuckRun?: boolean;
  requestedAt?: number;
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
  output?: string;
  updates: string[];
};

export type EphemeralState = {
  assistantDraft?: SDKAssistantMessage;
  reasoning: ReasoningStep[];
  tools: ToolExecution[];
  cliResults: CliResultMessage[];
  status: AgentDisplayStatus;
  lastUpdated: number;
  errorMessage?: string;
};

function initialEphemeralState(): EphemeralState {
  return {
    reasoning: [],
    tools: [],
    cliResults: [],
    status: "idle",
    lastUpdated: Date.now(),
  };
}

function formatToolInput(raw: unknown): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") {
      return undefined;
    }
    return trimmed;
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const preferredKeys = ["command", "file_path", "query", "pattern", "url", "description", "input", "text", "message", "prompt", "raw", "display"];
    for (const key of preferredKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }

    try {
      const serialized = JSON.stringify(raw, null, 2);
      const trimmed = serialized.trim();
      if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") {
        return undefined;
      }
      return trimmed;
    } catch {
      // fall through
    }
  }

  const truncated = truncateInput(raw, 160);
  const trimmed = truncated.trim();
  if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") {
    return undefined;
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatToolOutput(raw: unknown): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") {
      return undefined;
    }
    return trimmed;
  }

  try {
    const serialized = JSON.stringify(raw, null, 2);
    const trimmed = serialized.trim();
    if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") {
      return undefined;
    }
    return serialized;
  } catch {
    const fallback = String(raw ?? "").trim();
    if (!fallback || fallback === "}" || fallback === "\"}" || fallback === "{}") {
      return undefined;
    }
    return fallback;
  }
}

function mergeToolOutput(existing?: string, incoming?: string): string | undefined {
  const nextExisting = existing?.trim();
  const nextIncoming = incoming?.trim();

  if (!nextIncoming) return nextExisting;
  if (!nextExisting) return nextIncoming;

  if (nextExisting === nextIncoming) return nextExisting;
  if (nextExisting.includes(nextIncoming)) return nextExisting;
  if (nextIncoming.includes(nextExisting)) return nextIncoming;

  return `${nextExisting}\n${nextIncoming}`;
}

function mergeToolLogs(existing: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return existing;
  return Array.from(new Set([...existing, ...incoming]));
}

function extractToolChunk(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if (Object.keys(record).length === 1 && typeof record.raw === "string") {
      return record.raw;
    }
  }
  return undefined;
}

function mergeToolChunk(existing?: string, incoming?: string): string | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing === incoming) return existing;
  if (existing.includes(incoming)) return existing;
  if (incoming.includes(existing)) return incoming;
  return `${existing}${incoming}`;
}

function mergeToolInputValue(existing: unknown, incoming: unknown): unknown {
  if (isPlaceholderToolInput(incoming)) return existing;

  const existingChunk = extractToolChunk(existing);
  const incomingChunk = extractToolChunk(incoming);
  if (existingChunk !== undefined || incomingChunk !== undefined) {
    const merged = mergeToolChunk(existingChunk, incomingChunk);
    if (merged === undefined) return existing ?? incoming;

    const prefersRawObject =
      (existing && typeof existing === "object" && !Array.isArray(existing) && Object.keys(existing as Record<string, unknown>).length === 1 && typeof (existing as Record<string, unknown>).raw === "string") ||
      (incoming && typeof incoming === "object" && !Array.isArray(incoming) && Object.keys(incoming as Record<string, unknown>).length === 1 && typeof (incoming as Record<string, unknown>).raw === "string");

    return prefersRawObject ? { raw: merged } : merged;
  }

  return incoming ?? existing;
}

function mergeToolCallMessage(existingMessage: StreamMessage, incomingMessage: StreamMessage): StreamMessage {
  const existingRaw = existingMessage as any;
  const incomingRaw = incomingMessage as any;
  const merged: any = {
    ...existingRaw,
    ...incomingRaw,
  };

  const resolvedName = isPlaceholderToolName(incomingRaw.toolName ?? incomingRaw.name)
    ? existingRaw.toolName ?? existingRaw.name ?? incomingRaw.toolName ?? incomingRaw.name
    : incomingRaw.toolName ?? incomingRaw.name;

  if (typeof resolvedName === "string" && resolvedName.trim().length > 0) {
    merged.toolName = resolvedName;
    if ("name" in existingRaw || "name" in incomingRaw) {
      merged.name = resolvedName;
    }
  }

  const mergedRawArguments = mergeToolChunk(
    extractToolChunk(existingRaw.rawArguments),
    extractToolChunk(incomingRaw.rawArguments),
  );
  if (mergedRawArguments !== undefined) {
    merged.rawArguments = mergedRawArguments;
  }

  const mergedInput = mergeToolInputValue(
    existingRaw.toolInput ?? existingRaw.input ?? existingRaw.arguments,
    incomingRaw.toolInput ?? incomingRaw.input ?? incomingRaw.arguments,
  );
  if (mergedInput !== undefined) {
    if ("toolInput" in existingRaw || "toolInput" in incomingRaw || (!('input' in existingRaw) && !('arguments' in existingRaw) && !('input' in incomingRaw) && !('arguments' in incomingRaw))) {
      merged.toolInput = mergedInput;
    }
    if ("input" in existingRaw || "input" in incomingRaw) {
      merged.input = mergedInput;
    }
    if ("arguments" in existingRaw || "arguments" in incomingRaw) {
      merged.arguments = mergedInput;
    }
  }

  const existingNested = existingRaw.tool_call && typeof existingRaw.tool_call === "object" ? existingRaw.tool_call : {};
  const incomingNested = incomingRaw.tool_call && typeof incomingRaw.tool_call === "object" ? incomingRaw.tool_call : {};
  if (Object.keys(existingNested).length > 0 || Object.keys(incomingNested).length > 0) {
    merged.tool_call = {
      ...existingNested,
      ...incomingNested,
    };

    const mergedNestedName = isPlaceholderToolName(incomingNested.name)
      ? existingNested.name ?? resolvedName
      : incomingNested.name ?? resolvedName;
    if (typeof mergedNestedName === "string" && mergedNestedName.trim().length > 0) {
      merged.tool_call.name = mergedNestedName;
    }

    const mergedNestedArguments = mergeToolInputValue(existingNested.arguments, incomingNested.arguments);
    if (mergedNestedArguments !== undefined) {
      merged.tool_call.arguments = mergedNestedArguments;
    }
  }

  if (typeof existingRaw.createdAt === "number") {
    merged.createdAt = existingRaw.createdAt;
  }

  return merged as StreamMessage;
}

function isPlaceholderToolName(name: unknown): boolean {
  return typeof name !== "string" || name.trim().length === 0 || name.trim() === "?";
}

function isPlaceholderToolInput(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length === 0 || trimmed === "{}" || trimmed === "\"}" || trimmed === "}";
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) return true;
    if (keys.length === 1 && keys[0] === "raw" && typeof record.raw === "string") {
      const raw = record.raw.trim();
      return raw.length === 0 || raw === "," || raw === "." || raw === "}" || raw === "\"}";
    }
  }
  return false;
}

function shouldIgnoreToolCallFragment(rawMessage: any, _formattedInput: string | undefined, existingTool?: ToolExecution): boolean {
  const placeholderName = isPlaceholderToolName(rawMessage.toolName ?? rawMessage.name);
  const placeholderInput = isPlaceholderToolInput(rawMessage.toolInput ?? rawMessage.rawArguments ?? rawMessage.input ?? rawMessage.arguments);
  return placeholderName && placeholderInput && !existingTool;
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
  const nestedToolCall = rawMessage.tool_call ?? {};
  const id = rawMessage.toolCallId ?? nestedToolCall.tool_call_id ?? rawMessage.toolUseId ?? rawMessage.tool_call_id ?? rawMessage.id ?? ("uuid" in message ? message.uuid : `${Date.now()}`);
  const now = Date.now();
  const rawInput = nestedToolCall.arguments ?? rawMessage.rawArguments ?? rawMessage.toolInput ?? rawMessage.input ?? rawMessage.arguments ?? rawMessage.params;
  const existingTool = ephemeral.tools.find((tool) => tool.id === id);
  const mergedInput = mergeToolInputValue(existingTool?.input, rawInput);
  const formattedInput = formatToolInput(mergedInput);

  if (message.type === "tool_call") {
    if (shouldIgnoreToolCallFragment(rawMessage, formattedInput, existingTool)) {
      return ephemeral;
    }

    const resolvedName = isPlaceholderToolName(rawMessage.toolName ?? nestedToolCall.name)
      ? existingTool?.name ?? "tool"
      : rawMessage.toolName ?? nestedToolCall.name ?? existingTool?.name ?? "tool";

    const newTool: ToolExecution = {
      id,
      name: resolvedName,
      input: formattedInput ?? existingTool?.input,
      status: "running",
      startedAt: existingTool?.startedAt ?? now,
      finishedAt: undefined,
      error: undefined,
      output: existingTool?.output,
      updates: existingTool?.updates ?? [],
    };

    return {
      ...ephemeral,
      tools: [...ephemeral.tools.filter((tool) => tool.id !== id), newTool],
      lastUpdated: now,
    };
  }

  if (message.type === "tool_result") {
    const logs = [
      ...(Array.isArray(rawMessage.logs) ? rawMessage.logs.map((log: unknown) => String(log)) : []),
      ...(Array.isArray(rawMessage.stdout) ? rawMessage.stdout.map((log: unknown) => `stdout: ${String(log)}`) : typeof rawMessage.stdout === "string" ? [`stdout: ${rawMessage.stdout}`] : []),
      ...(Array.isArray(rawMessage.stderr) ? rawMessage.stderr.map((log: unknown) => `stderr: ${String(log)}`) : typeof rawMessage.stderr === "string" ? [`stderr: ${rawMessage.stderr}`] : []),
    ];
    const outputValue = rawMessage.tool_return ?? rawMessage.output ?? rawMessage.result ?? rawMessage.content ?? null;
    const formattedOutput = formatToolOutput(outputValue);
    let errorText: string | undefined;

    if (message.isError || rawMessage.status === "error") {
      errorText = formattedOutput;
    }

    const updatedTool: ToolExecution = {
      id,
      name: rawMessage.toolName ?? nestedToolCall.name ?? existingTool?.name ?? "tool",
      input: formattedInput ?? existingTool?.input,
      status: message.isError || rawMessage.status === "error" ? "failed" : "completed",
      startedAt: existingTool?.startedAt ?? now,
      finishedAt: now,
      error: errorText,
      output: mergeToolOutput(existingTool?.output, formattedOutput),
      updates: mergeToolLogs(existingTool?.updates ?? [], logs),
    };

    return {
      ...ephemeral,
      tools: [...ephemeral.tools.filter((tool) => tool.id !== id), updatedTool],
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
    cliResults: [],
    assistantDraft: undefined,
    status,
    errorMessage,
    lastUpdated: Date.now(),
  };
}

function settleCompletedTools(tools: ToolExecution[]): ToolExecution[] {
  const finishedAt = Date.now();
  return tools.map((tool) => {
    if (tool.status !== "running") {
      return tool;
    }

    const hasTranscript = Boolean(tool.output?.trim()) || tool.updates.length > 0;
    return {
      ...tool,
      status: "completed",
      finishedAt,
      updates: hasTranscript
        ? tool.updates
        : [...tool.updates, "Tool finished. Syncing output from conversation history..."],
    };
  });
}

function extractRunId(message: StreamMessage): string | undefined {
  const raw = message as Record<string, unknown>;
  const directRunId = raw.runId ?? raw.run_id;
  if (typeof directRunId === "string" && directRunId.trim().length > 0) {
    return directRunId;
  }

  const runIds = raw.runIds;
  if (Array.isArray(runIds)) {
    const firstRunId = runIds.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (firstRunId) {
      return firstRunId;
    }
  }

  return undefined;
}

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function waitForRunToSettle(runId: string, maxAttempts: number = 8, delayMs: number = 400): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const run = await window.electron.getRunStatus(runId);
      const status = typeof run?.status === "string" ? run.status.toLowerCase() : undefined;
      if ((status && TERMINAL_RUN_STATUSES.has(status)) || run?.completedAt) {
        return true;
      }
    } catch (error) {
      console.warn("[useAppStore] Failed to retrieve run status", { runId, attempt, error });
    }

    if (attempt < maxAttempts - 1) {
      await delay(delayMs);
    }
  }

  return false;
}

function withMessageTimestamp<T extends StreamMessage>(message: T, fallback: number = Date.now()): T {
  const existingCreatedAt = (message as { createdAt?: number }).createdAt;
  if (typeof existingCreatedAt === "number" && Number.isFinite(existingCreatedAt)) {
    return message;
  }

  return {
    ...message,
    createdAt: fallback,
  } as T;
}

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  agentName?: string;
  agentId?: string;
  latestRunId?: string;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
  hasMoreHistory?: boolean;
  totalFetchedCount?: number;
  totalDisplayableCount?: number;
  isEmailSession?: boolean;
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

const APP_PREFERENCES_STORAGE_KEY = "letta:app-preferences";

export interface AppState {
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
  showReasoningInChat: boolean;
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
  setShowReasoningInChat: (show: boolean) => void;
  handleServerEvent: (event: ServerEvent) => void;
  appendCliResult: (sessionId: string, result: CliResultMessage) => void;
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

export const useAppStore = create<AppState>()(persist((set, get) => ({
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
  selectedModel: "",
  showReasoningInChat: true,
  ipcSendEvent: null,

  setIPCSendEvent: (sendEvent) => set({ ipcSendEvent: sendEvent }),

  fetchSessionHistory: (sessionId, limit = 50, before) => {
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
    // NOTE: Do NOT stop running sessions on conversation switch.
    // Background sessions should continue running while the user browses other conversations.

    set((state) => {
      // Clear messages from inactive sessions to free memory,
      // but NEVER clear a session that is currently running (it may be processing in background).
      const updatedSessions: Record<string, SessionView> = {};
      
      for (const [sessionId, sess] of Object.entries(state.sessions)) {
        if (sessionId === id) {
          updatedSessions[sessionId] = sess;
        } else if (sess.status === "running") {
          // Keep running sessions fully intact — they are processing in background
          updatedSessions[sessionId] = sess;
        } else {
          // Only clear idle/stopped sessions to free memory
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

        // Auto-resume: if the session is idle/completed (not actively running),
        // reset its ephemeral status to "idle" so it appears ready for new messages
        // without the user needing to do any manual resume action.
        if (session && session.status !== "running" && state.ipcSendEvent) {
          set((s) => {
            const sess = s.sessions[id];
            if (!sess) return s;
            if (sess.ephemeral.status === "idle") return s; // already ready
            return {
              sessions: {
                ...s.sessions,
                [id]: {
                  ...sess,
                  ephemeral: {
                    ...sess.ephemeral,
                    status: "idle",
                    errorMessage: undefined,
                  },
                },
              },
            };
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
  },

  setShowReasoningInChat: (show) => {
    set({ showReasoningInChat: show });
  },


  appendCliResult: (sessionId, result) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return state;
      const ephemeral = existing.ephemeral ?? initialEphemeralState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            ephemeral: {
              ...ephemeral,
              cliResults: [...(ephemeral.cliResults ?? []), result],
              lastUpdated: Date.now(),
            },
          },
        },
      };
    });
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
            // Preserve local title if server sends null/empty (happens on new sessions)
            title: session.title || existing.title,
            agentName: session.agentName || existing.agentName,
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
          totalFetchedCount,
          totalDisplayableCount,
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
                totalFetchedCount,
                totalDisplayableCount,
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
        const { sessionId, status, title, cwd, error, agentName, agentId, background, isEmailSession } = event.payload;
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
          // When the backend goes idle (e.g. after session.stop), reset display status immediately
          if (status === "idle") {
            nextEphemeral.status = "idle";
            nextEphemeral.errorMessage = undefined;
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
                isEmailSession: isEmailSession ?? existing.isEmailSession,
                updatedAt: Date.now(),
                ephemeral: nextEphemeral,
              },
            },
          };
        });

        // "Completed" stays visible in the sidebar until the user sends the next message.
        // It is cleared back to "idle" when a new prompt is submitted (see handleSend).

        // Switch to this session if it's the one we were waiting for
        if (rootState.pendingStart && !background) {
          if (status === "running") {
            get().setActiveSessionId(sessionId);
            set({ pendingStart: false, showStartModal: false, prompt: "", globalError: null });
          } else {
            set({
              pendingStart: false,
              showStartModal: true,
              ...(status === "error" ? { globalError: error ?? "Failed to start session." } : {}),
            });
          }
        } else if (
          // Late arrival: session arrived after the 45s timeout fired.
          // If the user sees "Failed to start session" but the session IS now running,
          // auto-navigate to it and clear the error.
          !background &&
          status === "running" &&
          !rootState.activeSessionId &&
          rootState.globalError?.includes("Failed to start session")
        ) {
          get().setActiveSessionId(sessionId);
          set({ showStartModal: false, prompt: "", globalError: null });
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
        if (message.type === "tool_call" || message.type === "tool_result") {
          console.debug("[ui] received tool message", {
            sessionId,
            type: message.type,
            keys: Object.keys((message as unknown as Record<string, unknown>) ?? {}),
            payload: message,
          });
        }
        if (message.type === "stream_event") {
          // Partial token deltas are rendered by local UI state in useMessageWindow.
          // Skipping the global store update prevents full sessions tree churn per token.
          break;
        }
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const currentEphemeral = existing.ephemeral ?? initialEphemeralState();
          const messageRunId = extractRunId(message);
          let messages = existing.messages;
          let ephemeral = currentEphemeral;
          let status: AgentDisplayStatus = currentEphemeral.status;
          const eventTimestamp = Date.now();

          switch (message.type) {
            case "reasoning": {
              ephemeral = updateReasoning(currentEphemeral, message);
              status = "thinking";
              break;
            }
            case "tool_call": {
              const toolCall = withMessageTimestamp(message as StreamMessage, eventTimestamp);
              const toolCallId = (toolCall as any).toolCallId ?? (toolCall as any).id ?? (toolCall as any).uuid;
              const existingIndex = typeof toolCallId !== "undefined"
                ? messages.findIndex(
                    (msg) =>
                      msg.type === "tool_call" &&
                      ((msg as any).toolCallId ?? (msg as any).id ?? (msg as any).uuid) === toolCallId,
                  )
                : -1;
              if (existingIndex >= 0) {
                messages = messages.map((msg, idx) => (
                  idx === existingIndex ? mergeToolCallMessage(msg, toolCall) : msg
                ));
              } else {
                messages = [...messages, toolCall];
              }

              ephemeral = upsertToolExecution(currentEphemeral, message);
              status = "running_tool";
              break;
            }
            case "tool_result": {
              const toolResult = withMessageTimestamp(message as StreamMessage, eventTimestamp);
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
                  const finalMessage: StreamMessage = withMessageTimestamp({
                    ...draft,
                    content: draft.content ?? "",
                  } as StreamMessage, eventTimestamp);
                  messages = existingIndex >= 0
                    ? messages.map((msg, idx) => (idx === existingIndex ? finalMessage : msg))
                    : [...messages, finalMessage];
                }
                status = "completed";
                ephemeral = {
                  ...clearEphemeral(currentEphemeral, "completed"),
                  tools: settleCompletedTools(currentEphemeral.tools),
                };
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
                latestRunId: messageRunId ?? existing.latestRunId,
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

        if (message.type === "result" && message.success) {
          void (async () => {
            const settledSession = get().sessions[sessionId];
            const latestRunId = settledSession?.latestRunId;

            if (latestRunId) {
              await waitForRunToSettle(latestRunId);
              await delay(150);
            } else {
              await delay(250);
            }

            const latestState = get();
            const latestSession = latestState.sessions[sessionId];
            if (!latestSession || latestSession.isLoadingHistory) {
              return;
            }
            latestState.fetchSessionHistory(sessionId, 100);
          })();
        }
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt, attachments, content } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const newMessages = [
            ...existing.messages,
            withMessageTimestamp({ type: "user_prompt" as const, prompt, attachments, content }, Date.now()),
          ];
          const nextEphemeral = clearEphemeral(existing.ephemeral ?? initialEphemeralState(), "thinking");
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: newMessages,
                lastPrompt: prompt,
                latestRunId: undefined,
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
}), {
  name: APP_PREFERENCES_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    selectedModel: state.selectedModel,
    showReasoningInChat: state.showReasoningInChat,
  }),
}));
