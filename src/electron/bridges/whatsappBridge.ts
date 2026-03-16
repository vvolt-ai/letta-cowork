import { mkdirSync, writeFileSync } from "fs";
import { dirname, extname, join } from "path";
import { LettaResponder } from "./lettaResponder.js";
import type { WhatsAppBridgeConfig } from "./channelConfig.js";
import QRCode from "qrcode";
import { uploadLocalFilesToManager } from "./attachmentUploads.js";
import type { UploadOutcome } from "./attachmentUploads.js";

type WhatsAppStatusState = "stopped" | "starting" | "qr" | "connected" | "reconnecting" | "error";

export type WhatsAppBridgeStatus = {
  state: WhatsAppStatusState;
  connected: boolean;
  selfJid: string;
  qrAvailable: boolean;
  qrDataUrl: string;
  message: string;
  lastError: string;
  updatedAt: number;
};

type StatusListener = (status: WhatsAppBridgeStatus) => void;

type AnyBaileysModule = {
  DisconnectReason: { loggedOut: number };
  fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
  makeWASocket: (options: Record<string, unknown>) => AnyWASocket;
  useMultiFileAuthState: (sessionPath: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
  downloadMediaMessage?: (
    message: AnyWAMessage,
    type: "buffer" | "stream",
    options?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<Buffer | unknown>;
};

type AnyMessageKey = {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
};

type AnyWAMessage = {
  key: AnyMessageKey;
  messageTimestamp?: number;
  message?: Record<string, unknown>;
};

type AnyWASocket = {
  user?: { id?: string };
  ev: {
    on: (event: string, handler: (payload: any) => void) => void;
    off?: (event: string, handler: (payload: any) => void) => void;
    removeAllListeners?: () => void;
  };
  sendMessage: (
    jid: string,
    content: { text: string },
    options?: { quoted?: AnyWAMessage }
  ) => Promise<{ key?: { id?: string } }>;
  presenceSubscribe?: (jid: string) => Promise<void>;
  sendPresenceUpdate?: (type: string, jid: string) => Promise<void>;
  end?: (error?: Error) => void;
  ws?: { close: () => void };
};

const ONE_MINUTE = 60 * 1000;
const RECENT_OUTBOUND_TTL_MS = 10 * ONE_MINUTE;

const toDigits = (value: string): string => value.replace(/[^\d]/g, "");
const normalizeJid = (jid: string): string => jid.split(":")[0];

const parseAllowedUsers = (allowedUsers: string[]): Set<string> => {
  return new Set(allowedUsers.map((entry) => toDigits(entry)).filter((entry) => entry.length > 0));
};

const unwrapMessagePayload = (message: Record<string, unknown>): Record<string, unknown> => {
  let current = message;
  const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
  ];

  for (let depth = 0; depth < 8; depth += 1) {
    let next: Record<string, unknown> | null = null;
    for (const wrapper of wrappers) {
      const wrapped = current[wrapper] as { message?: Record<string, unknown> } | undefined;
      if (wrapped?.message && typeof wrapped.message === "object") {
        next = wrapped.message;
        break;
      }
    }
    if (!next) return current;
    current = next;
  }

  return current;
};

const extractText = (message: Record<string, unknown>): string => {
  const payload = unwrapMessagePayload(message);

  const buttonsResponse = payload.buttonsResponseMessage as { selectedDisplayText?: string } | undefined;
  const buttonsText = String(buttonsResponse?.selectedDisplayText ?? "").trim();
  if (buttonsText) return buttonsText;

  const templateResponse = payload.templateButtonReplyMessage as { selectedDisplayText?: string } | undefined;
  const templateText = String(templateResponse?.selectedDisplayText ?? "").trim();
  if (templateText) return templateText;

  const listResponse = payload.listResponseMessage as { title?: string } | undefined;
  const listText = String(listResponse?.title ?? "").trim();
  if (listText) return listText;

  const conversation = String((payload.conversation as string) ?? "").trim();
  if (conversation) return conversation;

  const extended = payload.extendedTextMessage as { text?: string } | undefined;
  const extendedText = String(extended?.text ?? "").trim();
  if (extendedText) return extendedText;

  const image = payload.imageMessage as { caption?: string } | undefined;
  const imageCaption = String(image?.caption ?? "").trim();
  if (imageCaption) return imageCaption;

  const video = payload.videoMessage as { caption?: string } | undefined;
  const videoCaption = String(video?.caption ?? "").trim();
  if (videoCaption) return videoCaption;

  return "";
};

const hasImageMessage = (message: Record<string, unknown>): boolean => {
  const payload = unwrapMessagePayload(message);
  return Boolean(payload.imageMessage);
};

const hasDocumentMessage = (message: Record<string, unknown>): boolean => {
  const payload = unwrapMessagePayload(message);
  return Boolean(payload.documentMessage);
};

const getDocumentMimeType = (message: Record<string, unknown>): string => {
  const payload = unwrapMessagePayload(message);
  const doc = payload.documentMessage as { mimetype?: string } | undefined;
  return doc?.mimetype || "application/octet-stream";
};

const getDocumentFileName = (message: Record<string, unknown>): string => {
  const payload = unwrapMessagePayload(message);
  const doc = payload.documentMessage as { fileName?: string } | undefined;
  return doc?.fileName || "unknown";
};

const getNumericSender = (message: AnyWAMessage): string => {
  const senderJid = message.key.participant || message.key.remoteJid || "";
  return toDigits(normalizeJid(senderJid));
};

const isGroupMessage = (jid: string): boolean => jid.endsWith("@g.us");
const isStatusBroadcast = (jid: string): boolean => jid === "status@broadcast";

const getMentionedJids = (message: AnyWAMessage): string[] => {
  const payload = unwrapMessagePayload(message.message || {});
  const contextCandidates = [
    payload.extendedTextMessage as { contextInfo?: { mentionedJid?: string[] } } | undefined,
    payload.imageMessage as { contextInfo?: { mentionedJid?: string[] } } | undefined,
    payload.videoMessage as { contextInfo?: { mentionedJid?: string[] } } | undefined,
  ];

  const mentioned = contextCandidates
    .map((item) => item?.contextInfo?.mentionedJid || [])
    .flat()
    .filter((jid): jid is string => typeof jid === "string" && jid.length > 0);
  return mentioned;
};

export class WhatsAppBridge {
  private socket: AnyWASocket | null = null;
  private baileysModule: AnyBaileysModule | null = null;
  private config: WhatsAppBridgeConfig | null = null;
  private status: WhatsAppBridgeStatus = {
    state: "stopped",
    connected: false,
    selfJid: "",
    qrAvailable: false,
    qrDataUrl: "",
    message: "Stopped",
    lastError: "",
    updatedAt: Date.now(),
  };
  private shouldRun = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private startEpochSeconds = 0;
  private recentOutboundMessageIds = new Map<string, number>();
  private readonly statusListener: StatusListener;
  private readonly lettaResponder = new LettaResponder();
  private readonly logPrefix = "[whatsapp-bridge]";

  constructor(statusListener: StatusListener) {
    this.statusListener = statusListener;
  }

  getStatus(): WhatsAppBridgeStatus {
    return this.status;
  }

  private setStatus(next: Partial<WhatsAppBridgeStatus>): void {
    this.status = {
      ...this.status,
      ...next,
      updatedAt: Date.now(),
    };
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupRecentOutbound(): void {
    const now = Date.now();
    for (const [messageId, createdAt] of this.recentOutboundMessageIds) {
      if (now - createdAt > RECENT_OUTBOUND_TTL_MS) {
        this.recentOutboundMessageIds.delete(messageId);
      }
    }
  }

  private async loadBaileysModule(): Promise<AnyBaileysModule> {
    const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<AnyBaileysModule>;
    return await dynamicImport("@whiskeysockets/baileys");
  }

  private async closeSocket(): Promise<void> {
    if (!this.socket) return;
    try {
      this.socket.end?.();
      this.socket.ws?.close();
      this.socket.ev.removeAllListeners?.();
    } catch {
      // no-op
    } finally {
      this.socket = null;
      this.baileysModule = null;
    }
  }

  async start(config: WhatsAppBridgeConfig): Promise<WhatsAppBridgeStatus> {
    this.log("start requested", {
      enabled: config.enabled,
      selfChatMode: config.selfChatMode,
      autoStart: config.autoStart,
      respondToGroups: config.respondToGroups,
      respondOnlyWhenMentioned: config.respondOnlyWhenMentioned,
      sessionPath: config.sessionPath,
      allowedUsersCount: config.allowedUsers.length,
      defaultAgentId: config.defaultAgentId || "(empty)",
    });
    this.config = config;
    this.shouldRun = true;
    this.startEpochSeconds = Math.floor(Date.now() / 1000);
    this.clearReconnectTimer();
    await this.connect();
    return this.status;
  }

  async stop(): Promise<WhatsAppBridgeStatus> {
    this.log("stop requested");
    this.shouldRun = false;
    this.clearReconnectTimer();
    await this.closeSocket();
    this.setStatus({
      state: "stopped",
      connected: false,
      qrAvailable: false,
      qrDataUrl: "",
      message: "Stopped",
    });
    return this.status;
  }

  private async connect(): Promise<void> {
    if (!this.config) {
      this.setStatus({
        state: "error",
        connected: false,
        qrAvailable: false,
        qrDataUrl: "",
        message: "WhatsApp config is missing.",
        lastError: "Missing config",
      });
      return;
    }

    if (!this.config.enabled) {
      await this.stop();
      return;
    }

    this.setStatus({
      state: "starting",
      connected: false,
      qrAvailable: false,
      qrDataUrl: "",
      message: "Starting WhatsApp bridge...",
      lastError: "",
    });

    try {
      this.log("connecting to WhatsApp");
      mkdirSync(dirname(this.config.sessionPath), { recursive: true });
      mkdirSync(this.config.sessionPath, { recursive: true });

      const baileys = await this.loadBaileysModule();
      this.baileysModule = baileys;
      const { state, saveCreds } = await baileys.useMultiFileAuthState(this.config.sessionPath);
      const { version } = await baileys.fetchLatestBaileysVersion();
      const pinoMod = await (new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<any>)("pino");
      const loggerFactory = pinoMod.default ?? pinoMod.pino ?? (() => undefined);

      const socket = baileys.makeWASocket({
        auth: state,
        version,
        logger: loggerFactory({ level: "silent" }),
        browser: ["LettaBot", "Desktop", "1.0.0"],
      });

      this.socket = socket;
      this.log("socket created");
      socket.ev.on("creds.update", () => {
        this.log("creds.update received");
        void saveCreds();
      });

      socket.ev.on("connection.update", (update) => {
        void this.handleConnectionUpdate(update, baileys);
      });

      socket.ev.on("messages.upsert", (payload) => {
        void this.handleMessages(payload);
      });
    } catch (error) {
      this.log("connect failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.setStatus({
        state: "error",
        connected: false,
        qrAvailable: false,
        qrDataUrl: "",
        message: "Failed to start WhatsApp bridge.",
        lastError: error instanceof Error ? error.message : String(error),
      });
      if (this.shouldRun) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (!this.shouldRun) return;
      void this.connect();
    }, 4000);
  }

  private async handleConnectionUpdate(update: any, baileys: AnyBaileysModule): Promise<void> {
    this.log("connection.update", {
      connection: update?.connection ?? "",
      hasQr: Boolean(update?.qr),
      lastDisconnectCode: Number(update?.lastDisconnect?.error?.output?.statusCode ?? -1),
    });
    if (update?.qr) {
      const qrDataUrl = await QRCode.toDataURL(String(update.qr), { margin: 1, width: 256 });
      this.setStatus({
        state: "qr",
        connected: false,
        qrAvailable: true,
        qrDataUrl,
        message: "Scan the QR code in terminal to link WhatsApp.",
      });
    }

    const connection = String(update?.connection ?? "");
    if (connection === "open") {
      const selfJid = normalizeJid(String(this.socket?.user?.id ?? ""));
      this.setStatus({
        state: "connected",
        connected: true,
        qrAvailable: false,
        qrDataUrl: "",
        selfJid,
        message: "WhatsApp connected.",
        lastError: "",
      });
      this.log("connection opened", { selfJid });
      return;
    }

    if (connection !== "close") return;

    const statusCode = Number(update?.lastDisconnect?.error?.output?.statusCode ?? -1);
    const isLoggedOut = statusCode === baileys.DisconnectReason.loggedOut;
    await this.closeSocket();

    if (isLoggedOut) {
      this.log("connection closed: logged out");
      this.shouldRun = false;
      this.setStatus({
        state: "error",
        connected: false,
        qrAvailable: false,
        qrDataUrl: "",
        message: "WhatsApp logged out. Re-link required.",
        lastError: "Logged out",
      });
      return;
    }

    this.setStatus({
      state: "reconnecting",
      connected: false,
      qrAvailable: false,
      qrDataUrl: "",
      message: "Connection closed. Reconnecting...",
    });
    this.log("connection closed: reconnecting scheduled");
    if (this.shouldRun) {
      this.scheduleReconnect();
    }
  }

  private isSelfChatMessage(message: AnyWAMessage): boolean {
    const remoteJid = normalizeJid(String(message.key.remoteJid ?? ""));
    const selfJid = normalizeJid(this.status.selfJid);
    if (!remoteJid || !selfJid) return false;
    return remoteJid === selfJid;
  }

  private shouldProcessMessage(message: AnyWAMessage): boolean {
    if (!this.config) return false;

    const messageId = String(message.key.id ?? "");
    if (messageId && this.recentOutboundMessageIds.has(messageId)) {
      this.log("skip message: recently sent by bot", { messageId });
      this.recentOutboundMessageIds.delete(messageId);
      return false;
    }

    const messageTs = Number(message.messageTimestamp ?? 0);
    if (Number.isFinite(messageTs) && messageTs > 0 && messageTs < this.startEpochSeconds) {
      this.log("skip message: old historical message", {
        messageId,
        messageTs,
        startEpochSeconds: this.startEpochSeconds,
      });
      return false;
    }

    const remoteJid = String(message.key.remoteJid ?? "");
    if (!remoteJid || isStatusBroadcast(remoteJid)) {
      this.log("skip message: unsupported jid", {
        messageId,
        remoteJid,
        isGroup: isGroupMessage(remoteJid),
        isStatus: isStatusBroadcast(remoteJid),
      });
      return false;
    }

    if (this.config.selfChatMode) {
      // In recent WhatsApp builds, self-chat can come through `@lid` JIDs.
      // Treat fromMe + lid as likely self-chat fallback.
      const remoteJid = String(message.key.remoteJid ?? "");
      const likelySelfLid = Boolean(message.key.fromMe) && remoteJid.endsWith("@lid");
      const allowed = this.isSelfChatMessage(message) || likelySelfLid;
      if (!allowed) {
        this.log("skip message: selfChatMode enabled and message not in self chat", {
          messageId,
          remoteJid,
          selfJid: this.status.selfJid,
          fromMe: Boolean(message.key.fromMe),
        });
      } else if (likelySelfLid) {
        this.log("selfChatMode fallback accepted: fromMe + @lid", {
          messageId,
          remoteJid,
        });
      }
      return allowed;
    }

    if (isGroupMessage(remoteJid)) {
      if (!this.config.respondToGroups) {
        this.log("skip message: groups disabled", { messageId, remoteJid });
        return false;
      }

      if (this.config.respondOnlyWhenMentioned) {
        const mentions = getMentionedJids(message);
        const selfNumeric = toDigits(this.status.selfJid || "");
        const hasMention = mentions.some((jid) => {
          const mentionedNumeric = toDigits(normalizeJid(jid));
          return mentionedNumeric.length > 0 && mentionedNumeric === selfNumeric;
        });
        if (!hasMention) {
          this.log("skip message: group message without bot mention", {
            messageId,
            remoteJid,
            mentions,
            selfJid: this.status.selfJid,
          });
          return false;
        }
      }
    }

    if (message.key.fromMe) {
      this.log("skip message: fromMe in non-selfChat mode", { messageId, remoteJid });
      return false;
    }

    const allowed = parseAllowedUsers(this.config.allowedUsers);
    if (allowed.size === 0) return true;
    const sender = getNumericSender(message);
    const isAllowed = allowed.has(sender);
    if (!isAllowed) {
      this.log("skip message: sender not in allowlist", {
        messageId,
        sender,
        allowlistSize: allowed.size,
      });
    }
    return isAllowed;
  }

  private async handleMessages(payload: any): Promise<void> {
    if (!this.socket || !this.config) return;
    const upsertType = String(payload?.type ?? "");
    this.log("messages.upsert received", { type: upsertType, count: Array.isArray(payload?.messages) ? payload.messages.length : 0 });
    if (upsertType !== "notify" && upsertType !== "append") return;
    const messages: AnyWAMessage[] = Array.isArray(payload?.messages) ? payload.messages : [];
    if (messages.length === 0) return;

    this.cleanupRecentOutbound();

    for (const message of messages) {
      const messageId = String(message?.key?.id ?? "");
      const remoteJid = String(message?.key?.remoteJid ?? "");
      if (!message?.message) {
        this.log("skip message: empty payload", { messageId, remoteJid });
        continue;
      }
      if (!this.shouldProcessMessage(message)) continue;
      let text = extractText(message.message);
      const imageOnlyMessage = !text && hasImageMessage(message.message);
      const documentOnlyMessage = !text && hasDocumentMessage(message.message);
      if (!text && imageOnlyMessage) {
        text =
          "User sent an image without caption. Acknowledge receipt and ask what they want help with from this image.";
        this.log("image-only message detected; using fallback prompt text", { messageId, remoteJid });
      }
      if (!text && documentOnlyMessage) {
        const fileName = getDocumentFileName(message.message);
        const mimeType = getDocumentMimeType(message.message);
        text = `User sent a document (${fileName}, ${mimeType}) without caption. Acknowledge receipt and ask what they want help with regarding this document.`;
        this.log("document-only message detected; using fallback prompt text", { messageId, remoteJid, fileName, mimeType });
      }
      if (!text) {
        this.log("skip message: no text extracted", { messageId, remoteJid });
        continue;
      }

      const sender = getNumericSender(message);
      this.log("processing message", {
        messageId,
        remoteJid,
        sender,
        textPreview: text.slice(0, 120),
      });

      // Send typing indicator immediately when message is received
      if (this.config.typingIndicator) {
        this.sendTypingIndicator(remoteJid).catch((err) => this.log("failed to send typing indicator", { error: err }));
      }

      try {
        const attachmentOutcomes: UploadOutcome[] = [];

        if (hasImageMessage(message.message)) {
          attachmentOutcomes.push(await this.handleImageAttachment(message, messageId));
        }

        if (hasDocumentMessage(message.message)) {
          attachmentOutcomes.push(await this.handleDocumentAttachment(message, messageId));
        }

        const combinedAttachments = attachmentOutcomes.flatMap((outcome) => outcome.attachments);
        const combinedWarnings = attachmentOutcomes.flatMap((outcome) => outcome.warnings);

        this.log("calling Letta responder", { messageId, sender });
        const reply = await this.lettaResponder.respond({
          channel: "whatsapp",
          senderId: sender || remoteJid,
          text,
          agentId: this.config.defaultAgentId,
          attachments: combinedAttachments,
          warnings: combinedWarnings,
        });
        this.log("Letta reply generated", {
          messageId,
          replyPreview: reply.slice(0, 180),
          replyLength: reply.length,
        });
        this.setStatus({
          message: `Processed inbound message from ${sender || remoteJid}. Sending reply...`,
        });

        this.log("sending WhatsApp reply", { messageId, remoteJid });
        const sent = await this.socket.sendMessage(remoteJid, { text: reply }, { quoted: message });
        const sentMessageId = String(sent?.key?.id ?? "");
        if (sentMessageId) {
          this.recentOutboundMessageIds.set(sentMessageId, Date.now());
        }
        this.log("reply sent", { messageId, sentMessageId });
        this.setStatus({
          state: "connected",
          connected: true,
          message: `Reply sent to ${sender || remoteJid}.`,
          lastError: "",
        });
      } catch (error) {
        this.log("failed while processing message", {
          messageId,
          remoteJid,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : "",
        });
        this.setStatus({
          state: this.status.connected ? "connected" : "error",
          connected: this.status.connected,
          message: "Failed while handling an incoming message.",
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private getImageExtensionFromMessage(message: AnyWAMessage): string {
    const payload = unwrapMessagePayload(message.message || {});
    const image = payload.imageMessage as { mimetype?: string; fileName?: string } | undefined;
    const fromName = String(image?.fileName ?? "");
    const nameExt = extname(fromName).toLowerCase();
    if (nameExt) return nameExt;

    const mime = String(image?.mimetype ?? "").toLowerCase();
    if (mime.includes("png")) return ".png";
    if (mime.includes("webp")) return ".webp";
    if (mime.includes("gif")) return ".gif";
    return ".jpg";
  }

  private async handleImageAttachment(
    message: AnyWAMessage,
    messageId: string
  ): Promise<UploadOutcome> {
    if (!this.socket || !this.baileysModule?.downloadMediaMessage) {
      this.log("image attachment skipped: media downloader unavailable", { messageId });
      return {
        attachments: [],
        warnings: ["Image was received, but media download utility is unavailable."],
      };
    }

    let localFilePath: string | null = null;
    try {
      this.log("downloading image media", { messageId });
      const mediaBufferUnknown = await this.baileysModule.downloadMediaMessage(
        message,
        "buffer",
        {},
        {
          reuploadRequest: async (msg: AnyWAMessage) => {
            if ((this.socket as any)?.updateMediaMessage) {
              return await (this.socket as any).updateMediaMessage(msg);
            }
            return undefined;
          },
        }
      );

      const mediaBuffer = Buffer.isBuffer(mediaBufferUnknown)
        ? mediaBufferUnknown
        : Buffer.from(mediaBufferUnknown as ArrayBuffer);

      const ext = this.getImageExtensionFromMessage(message);
      const tempDir = join(process.cwd(), "data", "whatsapp-media");
      mkdirSync(tempDir, { recursive: true });
      localFilePath = join(tempDir, `wa_${Date.now()}_${messageId}${ext}`);
      writeFileSync(localFilePath, mediaBuffer);
      this.log("image media downloaded", { messageId, localFilePath, size: mediaBuffer.length });

      const outcome = await uploadLocalFilesToManager(
        [
          {
            path: localFilePath,
            kind: "image",
          },
        ],
        { contextLabel: `WhatsApp image ${messageId}` }
      );

      if (outcome.attachments.length === 0 && outcome.warnings.length === 0) {
        outcome.warnings.push(
          `Image processed for message ${messageId}, but no attachment metadata was generated.`
        );
      }

      return outcome;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log("image attachment failed", {
        messageId,
        error: reason,
      });
      const warning = localFilePath
        ? `Image processing failed for message ${messageId}: ${reason}. Local file may remain at ${localFilePath}.`
        : `Image processing failed for message ${messageId}: ${reason}.`;
      return {
        attachments: [],
        warnings: [warning],
      };
    }
  }

  private async sendTypingIndicator(jid: string): Promise<void> {
    try {
      if (this.socket?.presenceSubscribe && this.socket?.sendPresenceUpdate) {
        await this.socket.presenceSubscribe(jid);
        await this.socket.sendPresenceUpdate("typing", jid);
        this.log("sent typing indicator", { jid });
      }
    } catch (error) {
      this.log("failed to send typing indicator", {
        jid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleDocumentAttachment(
    message: AnyWAMessage,
    messageId: string
  ): Promise<UploadOutcome> {
    if (!this.socket || !this.baileysModule?.downloadMediaMessage) {
      this.log("document attachment skipped: media downloader unavailable", { messageId });
      return {
        attachments: [],
        warnings: ["Document was received, but media download utility is unavailable."],
      };
    }

    const messagePayload = message.message || {};
    const mimeType = getDocumentMimeType(messagePayload);
    const fileName = getDocumentFileName(messagePayload);
    const ext = "." + (fileName.split(".").pop() || "bin");

    let localFilePath: string | null = null;
    try {
      this.log("downloading document media", { messageId, fileName, mimeType });
      const mediaBufferUnknown = await this.baileysModule.downloadMediaMessage(
        message,
        "buffer",
        {},
        {
          reuploadRequest: async (msg: AnyWAMessage) => {
            if ((this.socket as any)?.updateMediaMessage) {
              return await (this.socket as any).updateMediaMessage(msg);
            }
            return undefined;
          },
        }
      );

      const mediaBuffer = Buffer.isBuffer(mediaBufferUnknown)
        ? mediaBufferUnknown
        : Buffer.from(mediaBufferUnknown as ArrayBuffer);

      const tempDir = join(process.cwd(), "data", "whatsapp-media");
      mkdirSync(tempDir, { recursive: true });
      localFilePath = join(tempDir, `wa_${Date.now()}_${messageId}${ext}`);
      writeFileSync(localFilePath, mediaBuffer);
      this.log("document media downloaded", { messageId, localFilePath, size: mediaBuffer.length });

      const outcome = await uploadLocalFilesToManager(
        [
          {
            path: localFilePath,
            kind: "file",
            overrideMimeType: mimeType,
          },
        ],
        { contextLabel: `WhatsApp document ${messageId}` }
      );

      if (outcome.attachments.length === 0 && outcome.warnings.length === 0) {
        outcome.warnings.push(
          `Document processed for message ${messageId}, but no attachment metadata was generated.`
        );
      }

      return outcome;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log("document attachment failed", {
        messageId,
        error: reason,
      });
      const warning = localFilePath
        ? `Document processing failed for message ${messageId}: ${reason}. Local file may remain at ${localFilePath}.`
        : `Document processing failed for message ${messageId}: ${reason}.`;
      return {
        attachments: [],
        warnings: [warning],
      };
    }
  }
}
