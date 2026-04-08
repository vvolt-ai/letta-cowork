/**
 * PromptInput - Main component for chat input with attachments, slash commands, and model selection.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ChatAttachment, ClientEvent, MessageContentItem } from "../../../../types";
import { useAppStore, type AppState } from "../../../../store/useAppStore";

import { AttachmentPreview } from "./AttachmentPreview";
import { SlashCommandSuggestions } from "./SlashCommandSuggestions";
import { ModelSelector } from "./ModelSelector";
import { PromptTextArea } from "./PromptTextArea";
import { useAttachments } from "./hooks/useAttachments";
import { useModels } from "./hooks/useModels";
import { usePromptActions } from "./hooks/usePromptActions";
import { useSlashSuggestions } from "./hooks/useSlashCommands";
import { buildTextWithLinks } from "./utils/formatPrompt";

const MAX_HEIGHT = 12 * 21;
const MIN_HEIGHT = 52;

interface PromptInputProps {
  sendEvent: (event: ClientEvent) => void;
  onSendMessage?: () => void;
  disabled?: boolean;
  onOpenMemory?: () => void;
  fullWidth?: boolean;
  overrideSessionId?: string;
}

export const PromptInput = memo(function PromptInput({
  sendEvent,
  onSendMessage,
  disabled = false,
  onOpenMemory,
  fullWidth = false,
  overrideSessionId,
}: PromptInputProps) {
  const { prompt, setPrompt, isRunning, handleSend, handleStop, handleSlashCommand } = usePromptActions(
    sendEvent, onOpenMemory, overrideSessionId
  );

  const selectedModel = useAppStore((state: AppState) => state.selectedModel);
  const setSelectedModel = useAppStore((state: AppState) => state.setSelectedModel);
  const showReasoningInChat = useAppStore((state: AppState) => state.showReasoningInChat);
  const setShowReasoningInChat = useAppStore((state: AppState) => state.setShowReasoningInChat);
  const setGlobalError = useAppStore((state: AppState) => state.setGlobalError);
  const activeSessionId = useAppStore((state: AppState) => state.activeSessionId);
  const activeAgentId = useAppStore((state: AppState) =>
    activeSessionId ? state.sessions[activeSessionId]?.agentId : undefined
  );
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // Get default agent ID from env
  useEffect(() => {
    let cancelled = false;
    window.electron.getLettaEnv()
      .then((env) => {
        if (cancelled) return;
        const id = env?.LETTA_AGENT_ID?.trim();
        setDefaultAgentId(id && id.length > 0 ? id : null);
      }).catch((error) => console.error("Failed to load Vera environment:", error));
    return () => { cancelled = true; };
  }, []);

  const agentIdForModels = activeAgentId ?? defaultAgentId ?? undefined;

  // Models hook
  const { models, modelsLoading, hasSelectedModelOption, setModelTouched } = useModels({
    agentId: agentIdForModels, selectedModel, setSelectedModel,
  });

  // Attachments hook
  const {
    attachments, attachmentsRef, dragActive, isUploading: attachmentsUploading,
    removeAttachment, handleFileInputChange, handleDragEnter, handleDragOver, handleDragLeave,
    handleDrop, handlePaste, hasReadyAttachments, hasBlockingErrors, hasPendingUploads,
    cleanupAllAttachments, clearAllAttachments, fileInputRef, triggerFilePicker,
  } = useAttachments({ disabled, isRunning, onUploadError: setGlobalError });

  // Slash suggestions
  const { slashSuggestions } = useSlashSuggestions(prompt);

  // Auto-resize textarea
  useEffect(() => {
    if (!promptRef.current) return;
    const textarea = promptRef.current;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const height = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = height === MAX_HEIGHT ? "auto" : "hidden";
  }, [prompt]);

  const canSend = !attachmentsUploading && !hasPendingUploads && !hasBlockingErrors &&
    (prompt.trim().length > 0 || hasReadyAttachments) && !(disabled && !isRunning);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (disabled && !isRunning) return;
    if (isRunning) { handleStop(); return; }
    if (attachmentsUploading) return;

    const trimmedPrompt = prompt.trim();
    const currentAttachments = attachmentsRef.current;
    const pendingUploads = currentAttachments.some((a) => a.status === "pending" || a.status === "uploading");
    const blockingErrors = currentAttachments.some((a) => a.status === "error" && !a.uploaded);
    const readyToSend = currentAttachments.filter((a) => a.status === "uploaded" && a.uploaded);

    if (!trimmedPrompt && readyToSend.length === 0) return;
    if (blockingErrors) { setGlobalError("Remove or replace invalid attachments before sending."); return; }
    if (pendingUploads) { setGlobalError("Please wait for attachments to finish uploading."); return; }

    setGlobalError(null);
    setIsUploading(true);
    if (!overrideSessionId) onSendMessage?.();

    try {
      const attachmentMetadata: ChatAttachment[] = readyToSend.map((a) => ({
        id: a.uploaded!.fileId, name: a.uploaded!.fileName || a.file.name,
        mimeType: a.uploaded!.mimeType || a.file.type || "application/octet-stream",
        size: a.uploaded!.size || a.file.size, url: a.uploaded!.url, kind: a.kind,
        previewUrl: a.previewUrl ?? (a.kind === "image" || (a.uploaded!.mimeType || a.file.type || "").startsWith("image/") ? a.uploaded!.url : undefined),
      }));

      let textToSend = buildTextWithLinks(prompt, attachmentMetadata);
      const messageContent: MessageContentItem[] = [];
      if (textToSend.trim()) messageContent.push({ type: "text", text: textToSend });
      for (const attachment of attachmentMetadata) {
        if (attachment.kind === "image") {
          messageContent.push({ type: "image", source: { type: "url", url: attachment.url } } as unknown as MessageContentItem);
        }
      }

      const handledAsCommand = attachmentMetadata.length === 0 ? await handleSlashCommand(textToSend) : false;
      if (!handledAsCommand) await handleSend({ text: textToSend, content: messageContent, attachments: attachmentMetadata });

      cleanupAllAttachments(currentAttachments);
      attachmentsRef.current = [];
      clearAllAttachments();
      setPrompt("");
    } catch (error) {
      if (!(error instanceof Error)) setGlobalError("Failed to send message.");
    } finally { setIsUploading(false); }
  }, [attachmentsRef, attachmentsUploading, cleanupAllAttachments, clearAllAttachments, disabled, handleSend, handleSlashCommand, handleStop, isRunning, onSendMessage, overrideSessionId, prompt, setGlobalError, setPrompt]);

  // Apply slash suggestion
  const applySlashSuggestion = useCallback((suggestion: { command: string; insertText?: string }) => {
    setPrompt(suggestion.insertText ?? suggestion.command);
    setSelectedSlashIndex(0);
    window.requestAnimationFrame(() => {
      promptRef.current?.focus();
      const length = (suggestion.insertText ?? suggestion.command).length;
      promptRef.current?.setSelectionRange(length, length);
    });
  }, [setPrompt]);

  // Keyboard handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled && !isRunning) return;
    if (slashSuggestions.length > 0) {
      if (event.key === "ArrowDown") { event.preventDefault(); setSelectedSlashIndex((c) => (c + 1) % slashSuggestions.length); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelectedSlashIndex((c) => (c - 1 + slashSuggestions.length) % slashSuggestions.length); return; }
      if (event.key === "Tab") { event.preventDefault(); applySlashSuggestion(slashSuggestions[selectedSlashIndex] ?? slashSuggestions[0]); return; }
    }
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && !isRunning) { event.preventDefault(); void handleSubmit(); return; }
    if (slashSuggestions.length > 0) { event.preventDefault(); applySlashSuggestion(slashSuggestions[selectedSlashIndex] ?? slashSuggestions[0]); return; }
    event.preventDefault();
    if (isRunning) { handleStop(); return; }
    void handleSubmit();
  }, [applySlashSuggestion, disabled, handleStop, handleSubmit, isRunning, selectedSlashIndex, slashSuggestions]);

  return (
    <section
      className="sticky bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)] to-transparent px-2 pb-[5px] pt-[5px] lg:px-3"
      onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      <div className={`${fullWidth ? "w-full" : "mx-auto w-full max-w-5xl"} rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/98 px-3 py-[5px] shadow-[0_12px_28px_rgba(15,23,42,0.07)] backdrop-blur-sm transition ${dragActive ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]/60" : ""}`}>
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
        <ModelSelector models={models} selectedModel={selectedModel} hasSelectedModelOption={hasSelectedModelOption} modelsLoading={modelsLoading} showReasoningInChat={showReasoningInChat}
          onSelectModel={(model) => { setModelTouched(true); setSelectedModel(model); }}
          onToggleReasoning={() => setShowReasoningInChat(!showReasoningInChat)} />
        <SlashCommandSuggestions suggestions={slashSuggestions} selectedIndex={selectedSlashIndex} onSelect={applySlashSuggestion} />
        <PromptTextArea prompt={prompt} disabled={disabled} isRunning={isRunning} isUploading={isUploading} canSend={canSend}
          placeholder={disabled ? "Waiting for approval…" : "Ask Vera anything…"} promptRef={promptRef}
          onPromptChange={setPrompt} onKeyDown={handleKeyDown} onPaste={handlePaste}
          onAttach={triggerFilePicker} onSend={handleSubmit} onStop={handleStop} />
        {isUploading && <div className="mt-2 text-xs text-muted">Uploading attachments…</div>}
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
    </section>
  );
});

export { usePromptActions } from "./hooks/usePromptActions";
export type { SendMessageOptions } from "./hooks/usePromptActions";
