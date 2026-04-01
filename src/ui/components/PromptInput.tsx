import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, ClientEvent, MessageContentItem } from "../types";
import { useAppStore } from "../store/useAppStore";
import { uploadFileToManager, type UploadedFile } from "../services/fileUploads";
import { generateSessionTitle } from "../utils/session";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash";
const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;
const MIN_HEIGHT = 52;

interface ModelOption {
  name: string;
  display_name?: string | null;
  provider_type: string;
}

interface SlashCommandSuggestion {
  command: string;
  description: string;
  insertText?: string;
  status: "supported" | "info";
}

const SLASH_COMMAND_SUGGESTIONS: SlashCommandSuggestion[] = [
  { command: "/doctor", description: "Audit and refine your memory structure", insertText: "/doctor ", status: "info" },
  { command: "/remember", description: "Remember something from the conversation", insertText: "/remember ", status: "supported" },
  { command: "/skill", description: "Enter skill creation mode", insertText: "/skill ", status: "info" },
  { command: "/memory", description: "View your agent’s memory blocks", insertText: "/memory", status: "supported" },
  { command: "/search", description: "Search messages (defaults to the current agent)", insertText: "/search ", status: "supported" },
  { command: "/new", description: "Start a new conversation, optionally with a name", insertText: "/new ", status: "supported" },
  { command: "/clear", description: "Clear in-context messages", insertText: "/clear", status: "supported" },
  { command: "/compact", description: "Summarize conversation history (compaction)", insertText: "/compact ", status: "info" },
  { command: "/pin", description: "Pin current agent globally (-l for local only)", insertText: "/pin ", status: "info" },
  { command: "/unpin", description: "Unpin current agent (-l for local only)", insertText: "/unpin ", status: "info" },
  { command: "/description", description: "Update the current agent’s description", insertText: "/description ", status: "supported" },
  { command: "/export", description: "Export AgentFile (.af)", insertText: "/export ", status: "info" },
  { command: "/toolset", description: "Switch toolset (default/codex/gemini)", insertText: "/toolset ", status: "info" },
  { command: "/server", description: "Start local server listener mode", insertText: "/server ", status: "info" },
  { command: "/mcp", description: "Manage MCP servers", insertText: "/mcp ", status: "info" },
  { command: "/secret", description: "Manage secrets (set, list, unset)", insertText: "/secret ", status: "info" },
  { command: "/skills", description: "Browse available skills by source", insertText: "/skills", status: "info" },
  { command: "/statusline", description: "Configure CLI footer status lines", insertText: "/statusline ", status: "info" },
  { command: "/sleeptime", description: "Configure reflection trigger settings", insertText: "/sleeptime ", status: "info" },
  { command: "/recompile", description: "Recompile the current agent and conversation", insertText: "/recompile", status: "info" },
  { command: "/context", description: "Show context window usage", insertText: "/context", status: "supported" },
  { command: "/usage", description: "Show session usage statistics and balance", insertText: "/usage", status: "supported" },
  { command: "/feedback", description: "Send feedback to the Letta team", insertText: "/feedback ", status: "supported" },
  { command: "/connect chatgpt", description: "Connect ChatGPT Pro/Plus", insertText: "/connect chatgpt", status: "info" },
  { command: "/disconnect chatgpt", description: "Disconnect ChatGPT Pro/Plus", insertText: "/disconnect chatgpt", status: "info" },
  { command: "/bg", description: "Show background shell processes", insertText: "/bg", status: "supported" },
  { command: "/exit", description: "Exit this session to support with our chat", insertText: "/exit", status: "info" },
];

interface PromptInputProps {
  sendEvent: (event: ClientEvent) => void;
  onSendMessage?: () => void;
  disabled?: boolean;
  onOpenMemory?: () => void;
  fullWidth?: boolean;
}

export interface SendMessageOptions {
  text?: string;
  content?: MessageContentItem[];
  attachments?: ChatAttachment[];
}

type AttachmentStatus = "pending" | "uploading" | "uploaded" | "error";

interface AttachmentDraft {
  id: string;
  file: File;
  kind: "image" | "file";
  previewUrl?: string;
  status: AttachmentStatus;
  progress: number;
  error?: string;
  uploaded?: UploadedFile;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

const createAttachmentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isImageFile = (file: File): boolean => file.type.startsWith("image/");

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const MODEL_KEY_REGEX = /model/i;

function collectModelStrings(value: unknown, set: Set<string>, force = false): void {
  if (!value) return;

  if (typeof value === "string") {
    if (force) {
      const trimmed = value.trim();
      if (trimmed) set.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectModelStrings(entry, set, force);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextForce = force || MODEL_KEY_REGEX.test(key);
      collectModelStrings(nested, set, nextForce);
    }
  }
}

function extractAgentModelNames(agent: any): string[] {
  if (!agent) return [];
  const set = new Set<string>();

  collectModelStrings(agent?.model, set, true);
  collectModelStrings(agent?.models, set, true);
  collectModelStrings(agent?.availableModels, set, true);
  collectModelStrings(agent?.available_models, set, true);
  collectModelStrings(agent?.inferenceConfig?.models, set, true);
  collectModelStrings(agent?.inference_config?.models, set, true);
  collectModelStrings(agent?.metadata, set, false);

  return Array.from(set);
}

function guessProviderType(modelName: string): string {
  if (!modelName) return "custom";
  if (modelName.includes("/")) {
    return modelName.split("/")[0] ?? "custom";
  }
  if (modelName.includes(":")) {
    return modelName.split(":")[0] ?? "custom";
  }
  return "custom";
}

function mapModelNamesToOptions(names: string[], catalog: ModelOption[]): ModelOption[] {
  if (!names.length) return catalog;
  const catalogMap = new Map(catalog.map((model) => [model.name, model]));
  const unique = Array.from(new Set(names));
  return unique.map((name) => {
    const match = catalogMap.get(name);
    if (match) return match;
    return {
      name,
      display_name: name,
      provider_type: guessProviderType(name),
    } satisfies ModelOption;
  });
}

function mergeModelOptions(primary: ModelOption[], secondary: ModelOption[]): ModelOption[] {
  const merged: ModelOption[] = [];
  const seen = new Set<string>();
  for (const model of [...primary, ...secondary]) {
    if (!seen.has(model.name)) {
      merged.push(model);
      seen.add(model.name);
    }
  }
  return merged;
}

const validateFile = (file: File): string | null => {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File exceeds the 25 MB upload limit.";
  }
  if (!file.size) {
    return "File is empty.";
  }
  return null;
};

export function usePromptActions(sendEvent: (event: ClientEvent) => void, onOpenMemory?: () => void) {
  const prompt = useAppStore((state) => state.prompt);
  const cwd = useAppStore((state) => state.cwd);
  const pendingStart = useAppStore((state) => state.pendingStart);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const activeSession = useAppStore((state) => (activeSessionId ? state.sessions[activeSessionId] : undefined));
  const selectedModel = useAppStore((state) => state.selectedModel);
  const setPrompt = useAppStore((state) => state.setPrompt);
  const setPendingStart = useAppStore((state) => state.setPendingStart);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const startTimeoutRef = useRef<number | null>(null);

  const isRunning = activeSession?.status === "running";

  const handleSend = useCallback(async (options?: SendMessageOptions) => {
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
        }
      });
      // Do not clear prompt immediately; wait for modal closure to avoid flicker
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
          cwd: activeSession?.cwd,
          model: selectedModel.trim() || undefined,
        }
      });
      setPrompt("");
    }
  }, [activeSession, activeSessionId, cwd, prompt, selectedModel, sendEvent, setGlobalError, setPendingStart, setPrompt]);

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent]);

  const handleSlashCommand = useCallback(async (rawPrompt: string): Promise<boolean> => {
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
        setGlobalError(normalized === "/clear" ? "Started a fresh conversation context." : "Opened a new conversation.");
        return true;
      }
      case "/memory": {
        onOpenMemory?.();
        return true;
      }
      case "/search": {
        setGlobalError(args
          ? `Message search UI is not wired yet in Vera Cowork. Requested search: ${args}`
          : "Message search UI is not wired yet in Vera Cowork.");
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
        await handleSend({ text: `Please update the current agent description to:\n\n${args}` });
        return true;
      }
      case "/context": {
        await handleSend({ text: "Show the current context window usage and explain how full it is." });
        return true;
      }
      case "/usage": {
        await handleSend({ text: "Show current usage statistics and balance information if available." });
        return true;
      }
      case "/feedback": {
        await handleSend({ text: `Please help me prepare feedback for the Letta team about this issue or idea:\n\n${args || "<add feedback details here>"}` });
        return true;
      }
      case "/bg": {
        await handleSend({ text: "Show any background shell or agent processes that are currently running, if available." });
        return true;
      }
      default: {
        setGlobalError(`Command ${normalized} is not yet supported directly in Vera Cowork.`);
        return true;
      }
    }
  }, [handleSend, onOpenMemory, setActiveSessionId, setGlobalError, setPrompt]);

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
      const hasRunningSession = Object.values(state.sessions).some((session) => session.status === "running");

      if (state.pendingStart && !state.activeSessionId && !hasRunningSession) {
        state.setPendingStart(false);
        state.setGlobalError("Failed to start session. Please try again.");
      }

      startTimeoutRef.current = null;
    }, 15000);

    return () => {
      if (startTimeoutRef.current) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, [pendingStart, setGlobalError, setPendingStart]);

  return { prompt, setPrompt, isRunning, handleSend, handleStop, handleSlashCommand, handleStartFromModal };
}

export const PromptInput = memo(function PromptInput({ sendEvent, onSendMessage, disabled = false, onOpenMemory, fullWidth = false }: PromptInputProps) {
  const { prompt, setPrompt, isRunning, handleSend, handleStop, handleSlashCommand } = usePromptActions(sendEvent, onOpenMemory);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const setSelectedModel = useAppStore((state) => state.setSelectedModel);
  const showReasoningInChat = useAppStore((state) => state.showReasoningInChat);
  const setShowReasoningInChat = useAppStore((state) => state.setShowReasoningInChat);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const activeAgentId = useAppStore((state) => (activeSessionId ? state.sessions[activeSessionId]?.agentId : undefined));
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const attachmentsRef = useRef<AttachmentDraft[]>(attachments);
  const uploadingAttachmentIds = useRef<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelTouched, setModelTouched] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  const agentIdForModels = activeAgentId ?? defaultAgentId ?? undefined;

  const hasSelectedModelOption = selectedModel
    ? !models.some((model) => model.name === selectedModel)
    : false;

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getLettaEnv()
      .then((env) => {
        if (cancelled) return;
        const id = env?.LETTA_AGENT_ID?.trim();
        setDefaultAgentId(id && id.length > 0 ? id : null);
      })
      .catch((error) => {
        console.error("Failed to load Vera environment:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    setModelTouched(false);
  }, [agentIdForModels]);

  useEffect(() => {
    let cancelled = false;

    const fetchCatalog = async () => {
      try {
        const fetched = await window.electron.listLettaModels();
        if (cancelled) return;
        if (Array.isArray(fetched)) {
          setAllModels(fetched);
          setModels((current) => (current.length > 0 ? current : fetched));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load models:", error);
        }
      }
    };

    fetchCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyModels = async () => {
      if (!agentIdForModels) {
        setModels(allModels);
        setModelsLoading(false);
        return;
      }

      if (!window.electron.getLettaAgent) {
        setModels(allModels);
        setModelsLoading(false);
        return;
      }

      setModelsLoading(true);
      try {
        const agent = await window.electron.getLettaAgent(agentIdForModels);
        if (cancelled) return;
        const names = extractAgentModelNames(agent);
        const derived = mapModelNamesToOptions(names, allModels);
        const nextModels = mergeModelOptions(derived, allModels);
        setModels(nextModels);

        const preferred = typeof agent?.model === "string" && agent.model?.trim()
          ? agent.model.trim()
          : names[0];

        if (!modelTouched) {
          if (preferred && preferred !== selectedModel) {
            setSelectedModel(preferred);
          } else if (!preferred && !selectedModel && nextModels[0]) {
            setSelectedModel(nextModels[0].name);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load agent models:", error);
          setModels(allModels);
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    };

    applyModels();

    return () => {
      cancelled = true;
    };
  }, [agentIdForModels, allModels, modelTouched, selectedModel, setSelectedModel]);

  useEffect(() => {
    if (modelTouched) return;
    if (selectedModel) return;
    if (models.length === 0) return;
    setSelectedModel(models[0].name);
  }, [modelTouched, models, selectedModel, setSelectedModel]);

  useEffect(() => {
    if (!promptRef.current) return;
    const textarea = promptRef.current;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const height = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = height === MAX_HEIGHT ? "auto" : "hidden";
  }, [prompt]);

  const updateAttachment = useCallback(
    (id: string, updater: (attachment: AttachmentDraft) => AttachmentDraft) => {
      setAttachments((prev) => prev.map((attachment) => (attachment.id === id ? updater(attachment) : attachment)));
    },
    []
  );

  const cleanupAttachment = useCallback((attachment: AttachmentDraft) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  const cleanupAllAttachments = useCallback(
    (list: AttachmentDraft[]) => {
      list.forEach(cleanupAttachment);
    },
    [cleanupAttachment]
  );

  useEffect(
    () => () => {
      cleanupAllAttachments(attachmentsRef.current);
      uploadingAttachmentIds.current.clear();
    },
    [cleanupAllAttachments]
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (disabled && !isRunning) {
        console.debug("[PromptInput] ignoring files because input is disabled", {
          count: (fileList as unknown as { length?: number })?.length ?? 0,
        });
        return;
      }

      const files = Array.from(fileList as Iterable<File>);
      if (!files.length) return;

      console.debug("[PromptInput] adding attachments", files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })));

      setAttachments((prev) => {
        const next = [...prev];
        for (const file of files) {
          const error = validateFile(file);
          const kind = isImageFile(file) ? "image" : "file";
          const previewUrl = kind === "image" && !error ? URL.createObjectURL(file) : undefined;
          if (error) {
            console.warn("[PromptInput] attachment validation failed", { name: file.name, error });
          }
          next.push({
            id: createAttachmentId(),
            file,
            kind,
            previewUrl,
            status: error ? "error" : "pending",
            progress: 0,
            error: error || undefined,
          });
        }
        return next;
      });

      setDragActive(false);
    },
    [disabled, isRunning]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (files && files.length > 0) {
        addFiles(files);
      }
      event.target.value = "";
    },
    [addFiles]
  );

  const removeAttachment = useCallback(
    (id: string) => {
      console.debug("[PromptInput] removing attachment", { id });
      uploadingAttachmentIds.current.delete(id);
      setAttachments((prev) => {
        const target = prev.find((attachment) => attachment.id === id);
        if (target) {
          cleanupAttachment(target);
        }
        return prev.filter((attachment) => attachment.id !== id);
      });
    },
    [cleanupAttachment]
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      setDragActive(true);
      console.debug("[PromptInput] drag enter", {
        items: event.dataTransfer?.items?.length ?? 0,
      });
    },
    [disabled, isRunning]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled, isRunning]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setDragActive(false);
    console.debug("[PromptInput] drag leave");
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      setDragActive(false);
      const { files } = event.dataTransfer;
      if (files && files.length > 0) {
        console.debug("[PromptInput] drop received", { count: files.length });
        addFiles(files);
      }
    },
    [addFiles, disabled, isRunning]
  );

  const processClipboardItems = useCallback(
    (items?: DataTransferItemList | null) => {
      if (!items) return false;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file && isImageFile(file)) {
            files.push(file);
          }
        }
      }
      if (files.length > 0) {
        console.debug("[PromptInput] clipboard provided images", files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        })));
        addFiles(files);
        return true;
      }
      return false;
    },
    [addFiles]
  );

  const startAttachmentUpload = useCallback(
    (attachment: AttachmentDraft) => {
      if (attachment.status !== "pending" || attachment.error) {
        return;
      }
      if (uploadingAttachmentIds.current.has(attachment.id)) {
        return;
      }

      uploadingAttachmentIds.current.add(attachment.id);
      console.debug("[PromptInput] starting attachment upload", {
        id: attachment.id,
        name: attachment.file.name,
      });

      updateAttachment(attachment.id, (current) => ({
        ...current,
        status: "uploading",
        progress: 0,
        error: undefined,
      }));

      void (async () => {
        try {
          const uploaded = await uploadFileToManager(attachment.file, {
            onProgress: ({ percent }) => {
              updateAttachment(attachment.id, (current) => ({
                ...current,
                progress: percent,
              }));
            },
          });

          updateAttachment(attachment.id, (current) => ({
            ...current,
            status: "uploaded",
            progress: 100,
            uploaded,
            previewUrl:
              (uploaded.mimeType && uploaded.mimeType.toLowerCase().startsWith("image/"))
                ? uploaded.url
                : current.previewUrl,
          }));

          console.debug("[PromptInput] attachment upload complete", {
            id: attachment.id,
            url: uploaded.url,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          updateAttachment(attachment.id, (current) => ({
            ...current,
            status: "error",
            progress: 0,
            error: message,
          }));
          console.error("[PromptInput] attachment upload failed", {
            id: attachment.id,
            error,
          });
          setGlobalError(message);
        } finally {
          uploadingAttachmentIds.current.delete(attachment.id);
        }
      })();
    },
    [setGlobalError, updateAttachment]
  );

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachment.status === "pending" && !attachment.error) {
        startAttachmentUpload(attachment);
      }
    });
  }, [attachments, startAttachmentUpload]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled && !isRunning) return;
      const handled = processClipboardItems(event.clipboardData?.items ?? null);
      if (handled) {
        event.preventDefault();
      }
    },
    [disabled, isRunning, processClipboardItems]
  );

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (disabled && !isRunning) return;
      if (event.defaultPrevented) return;
      if (promptRef.current && event.target === promptRef.current) {
        return;
      }
      const handled = processClipboardItems(event.clipboardData?.items ?? null);
      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [disabled, isRunning, processClipboardItems]);

  const handleInput = useCallback((event: React.FormEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  }, []);

  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "uploaded" && attachment.uploaded),
    [attachments]
  );
  const hasReadyAttachments = readyAttachments.length > 0;
  const hasBlockingErrors = useMemo(
    () => attachments.some((attachment) => attachment.status === "error" && !attachment.uploaded),
    [attachments]
  );
  const hasPendingUploads = useMemo(
    () => attachments.some((attachment) => attachment.status === "pending" || attachment.status === "uploading"),
    [attachments]
  );

  const canSend =
    !isUploading &&
    !hasPendingUploads &&
    !hasBlockingErrors &&
    (prompt.trim().length > 0 || hasReadyAttachments) &&
    !(disabled && !isRunning);

  const slashQuery = useMemo(() => {
    const trimmed = prompt.trimStart();
    if (!trimmed.startsWith("/")) return "";
    const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
    return firstLine.slice(1).toLowerCase();
  }, [prompt]);

  const slashSuggestions = useMemo(() => {
    if (!slashQuery && !prompt.trimStart().startsWith("/")) return [];
    return SLASH_COMMAND_SUGGESTIONS.filter((item) => item.command.slice(1).toLowerCase().includes(slashQuery)).slice(0, 8);
  }, [prompt, slashQuery]);

  const buildTextWithLinks = useCallback((baseText: string, metas: ChatAttachment[]): string => {
    let text = baseText;
    const nonImages = metas.filter((meta) => meta.kind === "file");
    if (nonImages.length > 0) {
      const appendix = `Attached files:\n${nonImages.map((meta) => `- ${meta.name}: ${meta.url}`).join("\n")}`;
      text = text ? `${text}\n\n${appendix}` : appendix;
    }
    if (!text.trim() && metas.length > 0) {
      text = metas
        .map((meta) => `${meta.kind === "image" ? "Image" : "File"}: ${meta.url}`)
        .join("\n");
    }
    return text;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (disabled && !isRunning) return;
    if (isRunning) {
      handleStop();
      return;
    }
    if (isUploading) return;

    const trimmedPrompt = prompt.trim();
    const currentAttachments = attachmentsRef.current;

    const pendingUploads = currentAttachments.some(
      (attachment) => attachment.status === "pending" || attachment.status === "uploading"
    );
    const blockingErrors = currentAttachments.some(
      (attachment) => attachment.status === "error" && !attachment.uploaded
    );
    const readyToSend = currentAttachments.filter(
      (attachment) => attachment.status === "uploaded" && attachment.uploaded
    );

    if (!trimmedPrompt && readyToSend.length === 0) {
      return;
    }
    if (blockingErrors) {
      setGlobalError("Remove or replace invalid attachments before sending.");
      return;
    }
    if (pendingUploads) {
      setGlobalError("Please wait for attachments to finish uploading.");
      return;
    }

    console.debug("[PromptInput] submitting message", {
      hasText: Boolean(trimmedPrompt),
      attachments: currentAttachments.length,
    });

    setGlobalError(null);
    setIsUploading(true);
    onSendMessage?.();

    try {
      const attachmentMetadata: ChatAttachment[] = readyToSend.map((attachment) => ({
        id: attachment.uploaded!.fileId,
        name: attachment.uploaded!.fileName || attachment.file.name,
        mimeType: attachment.uploaded!.mimeType || attachment.file.type || "application/octet-stream",
        size: attachment.uploaded!.size || attachment.file.size,
        url: attachment.uploaded!.url,
        kind: attachment.kind,
        previewUrl:
          attachment.previewUrl ??
          (attachment.kind === "image" || (attachment.uploaded!.mimeType || attachment.file.type || "").startsWith("image/")
            ? attachment.uploaded!.url
            : undefined),
      }));

      let textToSend = buildTextWithLinks(prompt, attachmentMetadata);

      const messageContent: MessageContentItem[] = [];
      if (textToSend.trim()) {
        messageContent.push({ type: "text", text: textToSend });
      }

      for (const attachment of attachmentMetadata) {
        if (attachment.kind === "image") {
          const imageContent = {
            type: "image",
            source: {
              type: "url",
              url: attachment.url,
            },
          } as unknown as MessageContentItem;
          messageContent.push(imageContent);
        }
      }

      try {
        const handledAsCommand = attachmentMetadata.length === 0
          ? await handleSlashCommand(textToSend)
          : false;
        if (!handledAsCommand) {
          await handleSend({ text: textToSend, content: messageContent, attachments: attachmentMetadata });
        }
        console.debug("[PromptInput] message sent", {
          attachmentCount: attachmentMetadata.length,
          hadText: Boolean(textToSend.trim()),
          handledAsCommand,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[PromptInput] failed to send message", { error });
        setGlobalError(message);
        throw error;
      }

      cleanupAllAttachments(currentAttachments);
      attachmentsRef.current = [];
      uploadingAttachmentIds.current.clear();
      setAttachments([]);
      setPrompt("");
    } catch (error) {
      if (!(error instanceof Error)) {
        console.error("[PromptInput] submit failed", { error });
        setGlobalError("Failed to send message.");
      }
    } finally {
      setIsUploading(false);
    }
  }, [
    buildTextWithLinks,
    cleanupAllAttachments,
    disabled,
    handleSend,
    handleSlashCommand,
    handleStop,
    isRunning,
    isUploading,
    onSendMessage,
    prompt,
    setGlobalError,
    setPrompt,
  ]);

  const applySlashSuggestion = useCallback((suggestion: SlashCommandSuggestion) => {
    setPrompt(suggestion.insertText ?? suggestion.command);
    setSelectedSlashIndex(0);
    window.requestAnimationFrame(() => {
      promptRef.current?.focus();
      const length = (suggestion.insertText ?? suggestion.command).length;
      promptRef.current?.setSelectionRange(length, length);
    });
  }, [setPrompt]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled && !isRunning) return;

      if (slashSuggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSlashIndex((current) => (current + 1) % slashSuggestions.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSlashIndex((current) => (current - 1 + slashSuggestions.length) % slashSuggestions.length);
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          applySlashSuggestion(slashSuggestions[selectedSlashIndex] ?? slashSuggestions[0]);
          return;
        }
      }

      if (event.key !== "Enter") return;
      if (event.shiftKey || event.altKey) return;
      if ((event.metaKey || event.ctrlKey) && !isRunning) {
        event.preventDefault();
        void handleSubmit();
        return;
      }
      if (slashSuggestions.length > 0) {
        event.preventDefault();
        applySlashSuggestion(slashSuggestions[selectedSlashIndex] ?? slashSuggestions[0]);
        return;
      }
      event.preventDefault();
      if (isRunning) {
        handleStop();
        return;
      }
      void handleSubmit();
    },
    [applySlashSuggestion, disabled, handleStop, handleSubmit, isRunning, selectedSlashIndex, slashSuggestions]
  );

  const handleButtonClick = useCallback(() => {
    if (disabled && !isRunning) return;
    if (isRunning) {
      handleStop();
      return;
    }
    void handleSubmit();
  }, [disabled, handleStop, handleSubmit, isRunning]);

  const triggerFilePicker = useCallback(() => {
    if (disabled && !isRunning) return;
    fileInputRef.current?.click();
  }, [disabled, isRunning]);

  return (
    <section
      className="sticky bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)] to-transparent px-2 pb-[5px] pt-[5px] lg:px-3"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`${fullWidth ? "w-full" : "mx-auto w-full max-w-5xl"} rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/98 px-3 py-[5px] shadow-[0_12px_28px_rgba(15,23,42,0.07)] backdrop-blur-sm transition ${
          dragActive ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]/60" : ""
        }`}
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={`group flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs shadow-sm ${
                  attachment.status === "error"
                    ? "border-[var(--color-status-error)]/30 bg-[var(--color-status-error)]/5 text-[var(--color-status-error)]"
                    : attachment.status === "uploaded"
                      ? "border-[var(--color-status-completed)]/30 bg-[var(--color-status-completed)]/5 text-ink-700"
                      : "border-[var(--color-attachment-border)] bg-[var(--color-attachment-bg)] text-ink-700"
                }`}
              >
                {attachment.previewUrl ? (
                  <span className="flex h-8 w-8 overflow-hidden rounded-lg border border-[var(--color-attachment-border)] bg-white">
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.file.name}
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : null}
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {attachment.kind === "image" ? "Image" : "File"}
                </span>
                <span className="font-medium text-ink-800">
                  {attachment.file.name}
                </span>
                <span className="text-muted">{formatBytes(attachment.file.size)}</span>
                {attachment.status === "uploading" ? (
                  <span className="text-[var(--color-accent)]">
                    {attachment.progress > 0
                      ? `Uploading ${Math.round(attachment.progress)}%`
                      : "Uploading…"}
                  </span>
                ) : null}
                {attachment.status === "error" ? (
                  <span className="text-[var(--color-status-error)]">Failed</span>
                ) : null}
                {attachment.status === "uploaded" ? (
                  <span className="text-[var(--color-status-completed)]">Ready</span>
                ) : null}
                <button
                  type="button"
                  className="ml-1 text-muted transition hover:text-ink-900"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {(modelsLoading || models.length > 0) && (
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-500">
            <div className="flex items-center gap-2 min-w-0">
              <select
                className="h-6 min-w-[140px] rounded-full border border-[var(--color-border)] bg-transparent px-2 text-[11px] text-ink-600 transition hover:border-[var(--color-accent)] focus:border-[var(--color-border)] focus:outline-none focus:ring-0"
                value={selectedModel}
                onChange={(event) => {
                  const value = event.target.value;
                  setModelTouched(true);
                  setSelectedModel(value);
                }}
                disabled={modelsLoading}
                aria-label="Select model"
              >
                <option value="">Default (agent model)</option>
                {hasSelectedModelOption ? (
                  <option value={selectedModel}>{selectedModel}</option>
                ) : null}
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {(model.display_name || model.name) + (model.provider_type ? ` · ${model.provider_type}` : "")}
                  </option>
                ))}
              </select>
              {modelsLoading ? <span className="text-muted">Loading…</span> : null}
            </div>
            <button
              type="button"
              onClick={() => setShowReasoningInChat(!showReasoningInChat)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                showReasoningInChat
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-600"
              }`}
              aria-pressed={showReasoningInChat}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  showReasoningInChat ? "bg-[var(--color-accent)]" : "bg-ink-400"
                }`}
              />
              Reasoning
            </button>
          </div>
        )}

        {slashSuggestions.length > 0 ? (
          <div className="mt-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/70 p-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Commands</div>
            <div className="space-y-1">
              {slashSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.command}
                  type="button"
                  onClick={() => applySlashSuggestion(suggestion)}
                  className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition ${
                    index === selectedSlashIndex
                      ? "bg-[var(--color-accent)]/10 text-ink-800"
                      : "hover:bg-white/80 text-ink-700"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {suggestion.command}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      suggestion.status === "supported"
                        ? "bg-[var(--color-status-completed)]/10 text-[var(--color-status-completed)]"
                        : "bg-ink-900/6 text-muted"
                    }`}>
                      {suggestion.status === "supported" ? "Live" : "Info"}
                    </span>
                  </span>
                  <span className="ml-3 text-[11px] text-muted">{suggestion.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex items-end gap-2">
          <button
            type="button"
            onClick={triggerFilePicker}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-ink-600 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            disabled={disabled && !isRunning}
            aria-label="Attach files"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M16.5 6.5l-7.1 7.1a3 3 0 104.2 4.2l6-6a4 4 0 10-5.7-5.7l-6.3 6.3" />
            </svg>
          </button>
          <textarea
            rows={1}
            className="flex-1 min-h-[52px] resize-none rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/70 px-3.5 py-2.5 text-sm leading-5 text-ink-800 placeholder:text-muted focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/10 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={disabled ? "Waiting for approval…" : "Ask Vera anything…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            ref={promptRef}
            disabled={disabled && !isRunning}
          />
          <button
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isRunning ? "bg-[var(--color-status-error)] text-white hover:bg-[var(--color-status-error)]/90" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
            }`}
            onClick={handleButtonClick}
            aria-label={isRunning ? "Stop session" : "Send prompt"}
            disabled={(disabled && !isRunning) || (!isRunning && (!canSend || isUploading))}
          >
            {isRunning ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            ) : isUploading ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" />
                <path className="opacity-75" d="M4 12a8 8 0 018-8" stroke="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        {isUploading && (
          <div className="mt-2 text-xs text-muted">Uploading attachments…</div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </section>
  );
});
