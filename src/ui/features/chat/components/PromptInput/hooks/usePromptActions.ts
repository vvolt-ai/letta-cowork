/**
 * Hook for managing prompt actions (send, stop, slash commands).
 */

import { useCallback, useEffect, useRef } from "react";
import type { ChatAttachment, ClientEvent, MessageContentItem } from "../../../../../types";
import { useAppStore } from "../../../../../store/useAppStore";
import { generateSessionTitle } from "../../../../../utils/session";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash";

export interface SendMessageOptions {
  text?: string;
  content?: MessageContentItem[];
  attachments?: ChatAttachment[];
}

export interface UsePromptActionsOptions {
  sendEvent: (event: ClientEvent) => void;
  onOpenMemory?: () => void;
  overrideSessionId?: string;
}

export interface UsePromptActionsResult {
  prompt: string;
  setPrompt: (prompt: string) => void;
  isRunning: boolean;
  handleSend: (options?: SendMessageOptions) => Promise<void>;
  handleStop: () => void;
  handleSlashCommand: (rawPrompt: string) => Promise<boolean>;
  handleStartFromModal: () => void;
}

export function usePromptActions(
  sendEvent: (event: ClientEvent) => void,
  onOpenMemory?: () => void,
  overrideSessionId?: string
): UsePromptActionsResult {
  const prompt = useAppStore((state) => state.prompt);
  const cwd = useAppStore((state) => state.cwd);
  const pendingStart = useAppStore((state) => state.pendingStart);
  const globalActiveSessionId = useAppStore((state) => state.activeSessionId);
  const activeSessionId = overrideSessionId ?? globalActiveSessionId;
  const activeSession = useAppStore((state) =>
    activeSessionId ? state.sessions[activeSessionId] : undefined
  );
  const selectedModel = useAppStore((state) => state.selectedModel);
  const setPrompt = useAppStore((state) => state.setPrompt);
  const setPendingStart = useAppStore((state) => state.setPendingStart);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const startTimeoutRef = useRef<number | null>(null);

  // Check if the agent is actively processing
  const agentStatus = activeSession?.ephemeral?.status;
  const isRunning =
    activeSession?.status === "running" ||
    agentStatus === "thinking" ||
    agentStatus === "running_tool" ||
    agentStatus === "generating" ||
    agentStatus === "waiting_approval";

  const handleSend = useCallback(
    async (options?: SendMessageOptions) => {
      const text = options?.text ?? prompt;
      const trimmedText = text.trim();
      const hasAttachments = (options?.attachments?.length ?? 0) > 0;

      if (!trimmedText && !hasAttachments) {
        return;
      }

      if (!activeSessionId) {
        setPendingStart(true);
        const derivedTitle = generateSessionTitle(text, options?.attachments ?? []);
        sendEvent({
          type: "session.start",
          payload: {
            title: derivedTitle,
            prompt: text,
            content: options?.content,
            attachments: options?.attachments,
            cwd: cwd.trim() || undefined,
            allowedTools: DEFAULT_ALLOWED_TOOLS,
            model: selectedModel.trim() || undefined,
          },
        });
        if (!hasAttachments) {
          setPrompt("");
        }
      } else {
        if (activeSession?.status === "running") {
          setGlobalError("Session is still running. Please wait for it to finish.");
          return;
        }
        sendEvent({
          type: "session.continue",
          payload: {
            sessionId: activeSessionId,
            prompt: text,
            content: options?.content,
            attachments: options?.attachments,
            cwd: overrideSessionId ? undefined : activeSession?.cwd,
            model: selectedModel.trim() || undefined,
          },
        });
        setPrompt("");
      }
    },
    [
      activeSession,
      activeSessionId,
      cwd,
      overrideSessionId,
      prompt,
      selectedModel,
      sendEvent,
      setGlobalError,
      setPendingStart,
      setPrompt,
    ]
  );

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent]);

  const handleSlashCommand = useCallback(
    async (rawPrompt: string): Promise<boolean> => {
      const trimmed = rawPrompt.trim();
      if (!trimmed.startsWith("/")) return false;

      const [rawCommand, ...argParts] = trimmed.split(/\s+/);
      const normalized = rawCommand.toLowerCase();
      const args = argParts.join(" ").trim();

      switch (normalized) {
        case "/new":
        case "/clear": {
          setActiveSessionId(null, false);
          setPrompt(args);
          setGlobalError(
            normalized === "/clear"
              ? "Started a fresh conversation context."
              : "Opened a new conversation."
          );
          return true;
        }
        case "/memory": {
          onOpenMemory?.();
          return true;
        }
        case "/search": {
          setGlobalError(
            args
              ? `Message search UI is not wired yet in Vera Cowork. Requested search: ${args}`
              : "Message search UI is not wired yet in Vera Cowork."
          );
          return true;
        }
        case "/remember": {
          if (!args) {
            setGlobalError("Usage: /remember <text>");
            return true;
          }
          await handleSend({ text: `Please remember this for future conversations:\n\n${args}` });
          return true;
        }
        case "/description": {
          if (!args) {
            setGlobalError("Usage: /description <text>");
            return true;
          }
          await handleSend({
            text: `Please update the current agent description to:\n\n${args}`,
          });
          return true;
        }
        case "/context": {
          await handleSend({
            text: "Show the current context window usage and explain how full it is.",
          });
          return true;
        }
        case "/usage": {
          await handleSend({
            text: "Show current usage statistics and balance information if available.",
          });
          return true;
        }
        case "/feedback": {
          await handleSend({
            text: `Please help me prepare feedback for the Letta team about this issue or idea:\n\n${
              args || "<add feedback details here>"
            }`,
          });
          return true;
        }
        case "/bg": {
          await handleSend({
            text: "Show any background shell or agent processes that are currently running, if available.",
          });
          return true;
        }
        default: {
          setGlobalError(
            `Command ${normalized} is not yet supported directly in Vera Cowork.`
          );
          return true;
        }
      }
    },
    [handleSend, onOpenMemory, setActiveSessionId, setGlobalError, setPrompt]
  );

  const handleStartFromModal = useCallback(() => {
    if (!cwd.trim()) {
      setGlobalError("Working Directory is required to start a session.");
      return;
    }
    handleSend();
  }, [cwd, handleSend, setGlobalError]);

  useEffect(() => {
    if (!pendingStart) {
      if (startTimeoutRef.current) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      return;
    }

    startTimeoutRef.current = window.setTimeout(() => {
      const state = useAppStore.getState();
      const hasRunningSession = Object.values(state.sessions).some(
        (session) => session.status === "running"
      );

      // Only show the error if the session truly hasn't appeared yet.
      // The Letta API can sometimes take >15s to respond; giving it 45s
      // prevents false "Failed to start" errors when the server is just slow.
      if (state.pendingStart && !state.activeSessionId && !hasRunningSession) {
        state.setPendingStart(false);
        state.setGlobalError("Failed to start session. Please try again.");
      }

      startTimeoutRef.current = null;
    }, 45000);

    return () => {
      if (startTimeoutRef.current) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, [pendingStart, setGlobalError, setPendingStart]);

  return {
    prompt,
    setPrompt,
    isRunning,
    handleSend,
    handleStop,
    handleSlashCommand,
    handleStartFromModal,
  };
}
