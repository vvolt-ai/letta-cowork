import { create } from 'zustand';
import type { ServerEvent, ClientEvent, SessionStatus, StreamMessage } from "../types";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
  hasMoreHistory?: boolean;
  historyBefore?: string;
  isLoadingHistory?: boolean;
};

export type CoworkSettings = {
  showWhatsApp: boolean;
  showTelegram: boolean;
  showSlack: boolean;
  showDiscord: boolean;
  showEmailAutomation: boolean;
  showLettaEnv: boolean;
};

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
  // IPC function reference
  ipcSendEvent: ((event: ClientEvent) => void) | null;

  setIPCSendEvent: (sendEvent: (event: ClientEvent) => void) => void;
  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null, fetchHistory?: boolean) => void;
  fetchSessionHistory: (sessionId: string, limit?: number, before?: string) => void;
  setEmailSessionId: (id: string) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  setCoworkSettings: (settings: CoworkSettings) => void;
  handleServerEvent: (event: ServerEvent) => void;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", messages: [], permissionRequests: [], hydrated: false };
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
  ipcSendEvent: null,

  setIPCSendEvent: (sendEvent) => set({ ipcSendEvent: sendEvent }),

  fetchSessionHistory: (sessionId, limit = 20, before) => {
    const state = get();
    const session = state.sessions[sessionId];
    if (!session || session.isLoadingHistory) return;
    
    // Update loading state
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...session, isLoadingHistory: true }
      }
    }));
    
    // Send IPC event to fetch history
    if (state.ipcSendEvent) {
      state.ipcSendEvent({
        type: "session.history",
        payload: { sessionId, limit, before }
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
            payload: { sessionId: id, limit: 20 }
          });
        }
      }, 0);
    }
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

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  handleServerEvent: (event) => {
    const state = get();

    switch (event.type) {
      case "session.list": {
        const nextSessions: Record<string, SessionView> = {};
        for (const session of event.payload.sessions) {
          const existing = state.sessions[session.id] ?? createSession(session.id);
          nextSessions[session.id] = {
            ...existing,
            status: session.status,
            title: session.title,
            cwd: session.cwd,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          };
        }

        set({ sessions: nextSessions, sessionsLoaded: true });

        const hasSessions = event.payload.sessions.length > 0;
        set({ showStartModal: !hasSessions });

        if (!hasSessions) {
          get().setActiveSessionId(null);
        }

        if (!state.activeSessionId && event.payload.sessions.length > 0) {
          const sorted = [...event.payload.sessions].sort((a, b) => {
            const aTime = a.updatedAt ?? a.createdAt ?? 0;
            const bTime = b.updatedAt ?? b.createdAt ?? 0;
            return aTime - bTime;
          });
          const latestSession = sorted[sorted.length - 1];
          if (latestSession) {
            get().setActiveSessionId(latestSession.id);
          }
        } else if (state.activeSessionId) {
          const stillExists = event.payload.sessions.some(
            (session) => session.id === state.activeSessionId
          );
          if (!stillExists) {
            get().setActiveSessionId(null);
          }
        }
        break;
      }

      case "session.history": {
        const { sessionId, messages: historyMessages, status, hasMore, before } = event.payload as any;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // With order: "asc" (oldest first), we append newer messages at the end
          // For pagination (loading more), we append new messages to existing ones
          const mergedMessages = before 
            ? [...existing.messages, ...historyMessages] // Loading more (append at end)
            : [...existing.messages, ...historyMessages]; // Initial load
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { 
                ...existing, 
                status, 
                messages: mergedMessages, 
                hydrated: true,
                hasMoreHistory: hasMore,
                historyBefore: before,
                isLoadingHistory: false,
              }
            }
          };
        });
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd, error } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                updatedAt: Date.now()
              }
            }
          };
        });

        if (state.pendingStart) {
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
          showStartModal: !hasRemaining
        });

        if (state.activeSessionId === sessionId) {
          const remaining = Object.values(nextSessions).sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          );
          get().setActiveSessionId(remaining[0]?.id ?? null);
        }
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const messages = [...existing.messages];
          
          // Get message ID (uuid for SDK messages)
          const msgId = 'uuid' in message ? message.uuid : undefined;
          const msgType = message.type;
          
          if (msgId) {
            // Find existing message with same ID
            const existingIdx = messages.findIndex(
              (m) => 'uuid' in m && m.uuid === msgId
            );
            if (existingIdx >= 0) {
              // For streaming messages, ACCUMULATE content (SDK sends deltas)
              if (msgType === "reasoning" || msgType === "assistant") {
                const existingMsg = messages[existingIdx];
                const existingContent = 'content' in existingMsg ? existingMsg.content : "";
                const newContent = 'content' in message ? message.content : "";
                messages[existingIdx] = {
                  ...message,
                  content: existingContent + newContent
                } as StreamMessage;
              } else {
                // Other messages: replace
                messages[existingIdx] = message;
              }
            } else {
              messages.push(message);
            }
          } else {
            messages.push(message);
          }
          
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, messages }
            }
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const newMessages = [...existing.messages, { type: "user_prompt" as const, prompt }];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: newMessages
              }
            }
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
                permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }]
              }
            }
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
