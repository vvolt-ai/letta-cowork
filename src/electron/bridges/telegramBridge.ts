import { mkdirSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { LettaResponder } from "./lettaResponder.js";
import type { TelegramBridgeConfig } from "./channelConfig.js";
import { attachFilesToAgentFolder } from "../services/filesystem/index.js";

type TelegramStatusState = "stopped" | "starting" | "connected" | "reconnecting" | "error";

export type TelegramBridgeStatus = {
  state: TelegramStatusState;
  connected: boolean;
  botId: number;
  botUsername: string;
  message: string;
  lastError: string;
  updatedAt: number;
};

type StatusListener = (status: TelegramBridgeStatus) => void;

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  user?: TelegramUser;
};

type TelegramPhotoSize = {
  file_id: string;
  file_size?: number;
};

type TelegramDocument = {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramGetFileResponse = {
  ok: boolean;
  result?: {
    file_path?: string;
  };
  description?: string;
};

type TelegramGetMeResponse = {
  ok: boolean;
  result?: {
    id: number;
    username?: string;
  };
  description?: string;
};

const TELEGRAM_API_BASE = "https://api.telegram.org";
const ONE_MINUTE = 60 * 1000;
const RECENT_OUTBOUND_TTL_MS = 10 * ONE_MINUTE;
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const normalizeAllowedUsers = (allowedUsers: string[]): Set<string> =>
  new Set(allowedUsers.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0));

const isGroupChat = (chatType: string): boolean => chatType === "group" || chatType === "supergroup";

export class TelegramBridge {
  private status: TelegramBridgeStatus = {
    state: "stopped",
    connected: false,
    botId: 0,
    botUsername: "",
    message: "Stopped",
    lastError: "",
    updatedAt: Date.now(),
  };
  private shouldRun = false;
  private config: TelegramBridgeConfig | null = null;
  private offset = 0;
  private pollingController: AbortController | null = null;
  private pollingTask: Promise<void> | null = null;
  private readonly statusListener: StatusListener;
  private readonly lettaResponder = new LettaResponder();
  private readonly recentOutboundMessageIds = new Map<string, number>();
  private readonly startEpochSeconds = Math.floor(Date.now() / 1000);
  private readonly logPrefix = "[telegram-bridge]";

  constructor(statusListener: StatusListener) {
    this.statusListener = statusListener;
  }

  getStatus(): TelegramBridgeStatus {
    return this.status;
  }

  private setStatus(next: Partial<TelegramBridgeStatus>): void {
    this.status = { ...this.status, ...next, updatedAt: Date.now() };
    this.statusListener(this.status);
  }

  private log(message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`${timestamp} ${this.logPrefix} ${message}`, data);
      return;
    }
    console.log(`${timestamp} ${this.logPrefix} ${message}`);
  }

  private getBotToken(): string {
    return (this.config?.botToken || "").trim();
  }

  private getApiUrl(path: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.getBotToken()}/${path}`;
  }

  private async apiCall<T>(path: string, init?: RequestInit): Promise<T> {
    const url = this.getApiUrl(path);
    const response = await fetch(url, init);
    const json = (await response.json()) as T;
    return json;
  }

  async start(config: TelegramBridgeConfig): Promise<TelegramBridgeStatus> {
    this.log("start requested", {
      enabled: config.enabled,
      autoStart: config.autoStart,
      respondToGroups: config.respondToGroups,
      respondOnlyWhenMentioned: config.respondOnlyWhenMentioned,
      allowedUsersCount: config.allowedUsers.length,
      hasToken: config.botToken.trim().length > 0,
      defaultAgentId: config.defaultAgentId || "(empty)",
    });

    this.config = config;
    if (!config.enabled) {
      this.config = { ...config, enabled: true };
    }
    if (!this.getBotToken()) {
      this.setStatus({
        state: "error",
        connected: false,
        message: "Telegram bot token is missing.",
        lastError: "Missing bot token",
      });
      return this.status;
    }

    this.shouldRun = true;
    this.setStatus({
      state: "starting",
      connected: false,
      message: "Starting Telegram bridge...",
      lastError: "",
    });

    const me = await this.apiCall<TelegramGetMeResponse>("getMe");
    if (!me.ok || !me.result) {
      const reason = me.description || "Failed to get bot profile";
      this.setStatus({
        state: "error",
        connected: false,
        message: "Failed to start Telegram bridge.",
        lastError: reason,
      });
      return this.status;
    }

    this.setStatus({
      state: "connected",
      connected: true,
      botId: me.result.id,
      botUsername: me.result.username || "",
      message: "Telegram connected.",
      lastError: "",
    });

    this.pollingController?.abort();
    this.pollingController = new AbortController();
    this.pollingTask = this.pollLoop(this.pollingController.signal);
    return this.status;
  }

  async stop(): Promise<TelegramBridgeStatus> {
    this.log("stop requested");
    this.shouldRun = false;
    this.pollingController?.abort();
    this.pollingController = null;
    this.pollingTask = null;
    this.setStatus({
      state: "stopped",
      connected: false,
      message: "Stopped",
      lastError: "",
    });
    return this.status;
  }

  private async pollLoop(signal: AbortSignal): Promise<void> {
    while (this.shouldRun && !signal.aborted) {
      try {
        const body = JSON.stringify({
          offset: this.offset,
          timeout: 25,
          allowed_updates: ["message", "edited_message"],
        });
        const updates = await this.apiCall<{ ok: boolean; result?: TelegramUpdate[]; description?: string }>(
          "getUpdates",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal,
          }
        );

        if (!updates.ok) {
          const reason = updates.description || "getUpdates failed";
          this.log("getUpdates error", { reason });
          this.setStatus({
            state: "reconnecting",
            connected: false,
            message: "Telegram polling failed. Retrying...",
            lastError: reason,
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (this.shouldRun) {
            this.setStatus({
              state: "connected",
              connected: true,
              message: "Telegram connected.",
            });
          }
          continue;
        }

        const result = updates.result || [];
        for (const update of result) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update);
        }
      } catch (error) {
        if (signal.aborted) return;
        const reason = error instanceof Error ? error.message : String(error);
        this.log("poll loop error", { error: reason });
        this.setStatus({
          state: "reconnecting",
          connected: false,
          message: "Telegram polling interrupted. Retrying...",
          lastError: reason,
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (this.shouldRun) {
          this.setStatus({
            state: "connected",
            connected: true,
            message: "Telegram connected.",
          });
        }
      }
    }
  }

  private shouldProcessMessage(message: TelegramMessage): boolean {
    if (!this.config) return false;

    if ((message.date || 0) < this.startEpochSeconds) {
      this.log("skip message: old historical message", { messageId: message.message_id });
      return false;
    }

    const messageKey = `${message.chat.id}:${message.message_id}`;
    if (this.recentOutboundMessageIds.has(messageKey)) {
      this.log("skip message: recently sent by bot", { messageKey });
      this.recentOutboundMessageIds.delete(messageKey);
      return false;
    }

    const from = message.from;
    if (!from) {
      this.log("skip message: missing from");
      return false;
    }
    if (from.is_bot) {
      this.log("skip message: from bot", { fromId: from.id });
      return false;
    }

    const chat = message.chat;
    if (chat.type === "channel") {
      this.log("skip message: channel post", { chatId: chat.id });
      return false;
    }

    if (isGroupChat(chat.type)) {
      if (!this.config.respondToGroups) {
        this.log("skip message: groups disabled", { chatId: chat.id });
        return false;
      }
      if (this.config.respondOnlyWhenMentioned && !this.isMentioned(message)) {
        this.log("skip message: group message without mention", {
          chatId: chat.id,
          messageId: message.message_id,
        });
        return false;
      }
      return true;
    }

    const allowedUsers = normalizeAllowedUsers(this.config.allowedUsers);
    if (allowedUsers.size === 0) return true;
    const senderId = String(from.id);
    const allowed = allowedUsers.has(senderId);
    if (!allowed) {
      this.log("skip message: sender not in allowlist", { senderId });
    }
    return allowed;
  }

  private isMentioned(message: TelegramMessage): boolean {
    const username = this.status.botUsername?.toLowerCase();
    const botId = this.status.botId;
    const text = message.text || message.caption || "";
    const entities = [...(message.entities || []), ...(message.caption_entities || [])];

    for (const entity of entities) {
      if (entity.type === "text_mention" && entity.user?.id === botId) {
        return true;
      }
      if (entity.type === "mention" && username) {
        const chunk = text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
        if (chunk === `@${username}`) return true;
      }
    }
    return false;
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message || update.edited_message;
    if (!message) return;
    if (!this.shouldProcessMessage(message)) return;

    const senderId = String(message.from?.id || "");
    let text = (message.text || message.caption || "").trim();
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    const hasDocument = Boolean(message.document);
    if (!text && hasPhoto) {
      text = "User sent an image without caption. Acknowledge receipt and ask what they want help with.";
      this.log("image-only telegram message detected; using fallback text", {
        chatId: message.chat.id,
        messageId: message.message_id,
      });
    }
    if (!text && hasDocument) {
      const fileName = message.document?.file_name || "unknown";
      const mimeType = message.document?.mime_type || "unknown";
      text = `User sent a document (${fileName}, ${mimeType}) without caption. Acknowledge receipt and ask what they want help with regarding this document.`;
      this.log("document-only telegram message detected; using fallback text", {
        chatId: message.chat.id,
        messageId: message.message_id,
        fileName,
        mimeType,
      });
    }
    if (!text) {
      this.log("skip message: no text");
      return;
    }

    let attachmentNote = "";
    if (hasPhoto) {
      attachmentNote = await this.handlePhotoAttachment(message, senderId);
    } else if (hasDocument) {
      attachmentNote = await this.handleDocumentAttachment(message, senderId);
    }
    const contextLabel = hasPhoto ? "[Telegram image context]" : hasDocument ? "[Telegram document context]" : "";
    const composedText = attachmentNote ? `${text}\n\n${contextLabel}\n${attachmentNote}` : text;

    try {
      this.log("calling Letta responder", { chatId: message.chat.id, messageId: message.message_id });

      // Send typing indicator if enabled
      if (this.config?.typingIndicator) {
        await this.sendChatAction(message.chat.id, "typing");
      }

      const reply = await this.lettaResponder.respond({
        channel: "telegram",
        senderId,
        text: composedText,
        agentId: this.config?.defaultAgentId || "",
      });
      await this.sendReply(message.chat.id, reply, message.message_id);
      this.setStatus({
        state: "connected",
        connected: true,
        message: `Reply sent to chat ${message.chat.id}`,
        lastError: "",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log("failed while processing message", { error: reason });
      this.setStatus({
        state: "connected",
        connected: true,
        message: "Failed while handling an incoming Telegram message.",
        lastError: reason,
      });
    }
  }

  private async sendReply(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    });
    const result = await this.apiCall<{ ok: boolean; result?: { message_id: number }; description?: string }>(
      "sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
    if (!result.ok || !result.result) {
      throw new Error(result.description || "Telegram sendMessage failed");
    }
    const messageKey = `${chatId}:${result.result.message_id}`;
    this.recentOutboundMessageIds.set(messageKey, Date.now());
    this.cleanupRecentOutbound();
  }

  private async sendChatAction(chatId: number, action: string): Promise<void> {
    try {
      await this.apiCall<{ ok: boolean; description?: string }>("sendChatAction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
      this.log("sent chat action", { chatId, action });
    } catch (error) {
      this.log("failed to send chat action", {
        chatId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private cleanupRecentOutbound(): void {
    const now = Date.now();
    for (const [key, createdAt] of this.recentOutboundMessageIds) {
      if (now - createdAt > RECENT_OUTBOUND_TTL_MS) {
        this.recentOutboundMessageIds.delete(key);
      }
    }
  }

  private async handlePhotoAttachment(message: TelegramMessage, senderId: string): Promise<string> {
    if (!this.config) return "";
    const token = this.getBotToken();
    const photos = message.photo || [];
    if (photos.length === 0) return "";

    const largest = photos.slice().sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
    try {
      const fileResp = await this.apiCall<TelegramGetFileResponse>("getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: largest.file_id }),
      });
      if (!fileResp.ok || !fileResp.result?.file_path) {
        return `Image received, but Telegram file lookup failed: ${fileResp.description || "unknown error"}`;
      }

      const filePath = fileResp.result.file_path;
      const downloadUrl = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        return `Image received, but Telegram file download failed (${fileRes.status}).`;
      }

      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      const ext = extname(filePath).toLowerCase() || ".jpg";
      const mediaDir = join(process.cwd(), "data", "telegram-media");
      mkdirSync(mediaDir, { recursive: true });
      const localFilePath = join(mediaDir, `tg_${Date.now()}_${message.message_id}${ext}`);
      writeFileSync(localFilePath, Buffer.from(bytes));
      this.log("photo downloaded", { localFilePath, size: bytes.byteLength });

      const targetAgentId = (this.config.defaultAgentId || process.env.LETTA_AGENT_ID || "").trim();
      if (!targetAgentId) {
        return `Image downloaded to ${localFilePath}, but no default agent ID is configured.`;
      }

      if (!UNSUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
        const directUpload = await attachFilesToAgentFolder({
          agentId: targetAgentId,
          filePaths: [localFilePath],
          folderNamePrefix: `telegram_${senderId}_${message.message_id}`,
        });
        if (directUpload.status === "attached") {
          return `Image uploaded to Letta folder ${directUpload.folderName} (${directUpload.folderId}).`;
        }
      }

      const sidecarPath = join(mediaDir, `tg_${Date.now()}_${message.message_id}.md`);
      const sidecarContent = [
        "# Telegram Image Attachment",
        `- Message ID: ${message.message_id}`,
        `- Sender: ${senderId}`,
        `- Local image path: ${localFilePath}`,
        `- Telegram file path: ${filePath}`,
        `- Size bytes: ${bytes.byteLength}`,
        "",
        "Direct image upload is unsupported by current Letta files API. Use local tools to inspect image path.",
      ].join("\n");
      writeFileSync(sidecarPath, sidecarContent, "utf8");

      const sidecarUpload = await attachFilesToAgentFolder({
        agentId: targetAgentId,
        filePaths: [sidecarPath],
        folderNamePrefix: `telegram_image_note_${senderId}_${message.message_id}`,
      });
      if (sidecarUpload.status === "attached") {
        return [
          "Image received. Direct image upload unsupported by current Letta files API.",
          `Attached markdown note: ${sidecarPath}`,
          `Local image path: ${localFilePath}`,
          `Folder: ${sidecarUpload.folderName} (${sidecarUpload.folderId})`,
        ].join("\n");
      }

      return [
        "Image received, but sidecar note upload failed.",
        `Sidecar error: ${sidecarUpload.reason}`,
        `Local image path: ${localFilePath}`,
      ].join("\n");
    } catch (error) {
      return `Image received but processing failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleDocumentAttachment(message: TelegramMessage, senderId: string): Promise<string> {
    if (!this.config) return "";
    const token = this.getBotToken();
    const document = message.document;
    if (!document) return "";

    const fileName = document.file_name || "unknown";
    const mimeType = document.mime_type || "application/octet-stream";
    const ext = "." + (fileName.split(".").pop() || "bin");

    try {
      const fileResp = await this.apiCall<TelegramGetFileResponse>("getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: document.file_id }),
      });
      if (!fileResp.ok || !fileResp.result?.file_path) {
        return `Document received, but Telegram file lookup failed: ${fileResp.description || "unknown error"}`;
      }

      const filePath = fileResp.result.file_path;
      const downloadUrl = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        return `Document received, but Telegram file download failed (${fileRes.status}).`;
      }

      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      const mediaDir = join(process.cwd(), "data", "telegram-media");
      mkdirSync(mediaDir, { recursive: true });
      const localFilePath = join(mediaDir, `tg_${Date.now()}_${message.message_id}${ext}`);
      writeFileSync(localFilePath, Buffer.from(bytes));
      this.log("document downloaded", { localFilePath, size: bytes.byteLength, fileName, mimeType });

      const targetAgentId = (this.config.defaultAgentId || process.env.LETTA_AGENT_ID || "").trim();
      if (!targetAgentId) {
        return `Document (${fileName}) downloaded to ${localFilePath}, but no default agent ID is configured.`;
      }

      // Upload the document to Letta
      const upload = await attachFilesToAgentFolder({
        agentId: targetAgentId,
        filePaths: [localFilePath],
        folderNamePrefix: `telegram_${senderId}_${message.message_id}`,
      });

      if (upload.status === "attached") {
        this.log("document attached to Letta folder", {
          messageId: message.message_id,
          folderId: upload.folderId,
          folderName: upload.folderName,
          uploadedFiles: upload.uploadedFiles,
        });
        return [
          `Document was uploaded and attached to agent ${targetAgentId}.`,
          `File: ${fileName}`,
          `MIME type: ${mimeType}`,
          `Size: ${bytes.byteLength} bytes`,
          `Folder: ${upload.folderName} (${upload.folderId})`,
          `Files: ${upload.uploadedFiles.join(", ") || "none"}`,
          upload.skippedFiles.length > 0 ? `Skipped: ${upload.skippedFiles.join(", ")}` : "",
          upload.failedFiles.length > 0
            ? `Failed: ${upload.failedFiles.map((item) => `${item.file}: ${item.error}`).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      // If upload failed, create a sidecar note
      const sidecarPath = join(mediaDir, `tg_${Date.now()}_${message.message_id}.md`);
      const sidecarContent = [
        "# Telegram Document Attachment",
        `- Message ID: ${message.message_id}`,
        `- Sender: ${senderId}`,
        `- File name: ${fileName}`,
        `- MIME type: ${mimeType}`,
        `- Local file path: ${localFilePath}`,
        `- Telegram file path: ${filePath}`,
        `- File size bytes: ${bytes.byteLength}`,
        "",
        "Document upload to Letta failed. Use local tools on the path above to inspect/describe the document.",
      ].join("\n");
      writeFileSync(sidecarPath, sidecarContent, "utf8");

      const sidecarUpload = await attachFilesToAgentFolder({
        agentId: targetAgentId,
        filePaths: [sidecarPath],
        folderNamePrefix: `telegram_doc_note_${senderId}_${message.message_id}`,
      });

      if (sidecarUpload.status === "attached") {
        return [
          `Document received (${fileName}, ${mimeType}).`,
          "Document upload failed, but a note with file location was attached.",
          `Sidecar note: ${sidecarPath}`,
          `Local file path: ${localFilePath}`,
          `Folder: ${sidecarUpload.folderName} (${sidecarUpload.folderId})`,
        ].join("\n");
      }

      return [
        `Document received (${fileName}, ${mimeType}), but both direct upload and sidecar note upload failed.`,
        `Local file path: ${localFilePath}`,
      ].join("\n");
    } catch (error) {
      return `Document received but processing failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
