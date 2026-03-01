import { writeFileSync } from "fs";
import { join } from "path";
import { Client, GatewayIntentBits, Message, TextBasedChannel } from "discord.js";
import { LettaResponder, LettaInboundMessage } from "./lettaResponder.js";
import type { DiscordBridgeConfig } from "./channelConfig.js";

type DiscordStatusState = "stopped" | "starting" | "running" | "error";

export type DiscordBridgeStatus = {
  state: DiscordStatusState;
  connected: boolean;
  botId: string;
  botUsername: string;
  guildCount: number;
  message: string;
  lastError: string;
  updatedAt: number;
};

type StatusListener = (status: DiscordBridgeStatus) => void;

// Group mode types
type GroupMode = "open" | "listen" | "mention-only" | "disabled";

interface GroupConfig {
  mode: GroupMode;
  allowedUsers?: string[];
}

// Pairing code storage
interface PairingEntry {
  code: string;
  userId: string;
  username: string;
  timestamp: number;
}

export class DiscordBridge {
  private client: Client | null = null;
  private config: DiscordBridgeConfig | null = null;
  private readonly lettaResponder = new LettaResponder();
  private statusListeners: StatusListener[] = [];
  private pairingCodes: Map<string, PairingEntry> = new Map();
  private status: DiscordBridgeStatus = {
    state: "stopped",
    connected: false,
    botId: "",
    botUsername: "",
    guildCount: 0,
    message: "",
    lastError: "",
    updatedAt: Date.now(),
  };

  constructor() {
    // Cleanup old pairing codes every minute
    setInterval(() => {
      const now = Date.now();
      for (const [code, entry] of this.pairingCodes) {
        if (now - entry.timestamp > 10 * 60 * 1000) {
          this.pairingCodes.delete(code);
        }
      }
    }, 60000);
  }

  async start(config: DiscordBridgeConfig): Promise<DiscordBridgeStatus> {
    if (this.client) {
      await this.stop();
    }

    this.config = config;
    this.updateStatus({ state: "starting", message: "Connecting to Discord..." });

    try {
      // Create Discord client with required intents
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      // Set up event handlers
      this.client.once("ready", () => this.handleReady());
      this.client.on("guildCreate", () => this.handleGuildUpdate());
      this.client.on("guildDelete", () => this.handleGuildUpdate());
      this.client.on("messageCreate", (message) => this.handleMessage(message));
      this.client.on("error", (error) => this.handleError(error));
      this.client.on("disconnect", () => this.handleDisconnect());

      // Login with bot token
      await this.client.login(config.botToken);

      return this.status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus({
        state: "error",
        message: "Failed to connect",
        lastError: errorMessage,
      });
      throw error;
    }
  }

  async stop(): Promise<DiscordBridgeStatus> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.pairingCodes.clear();
    this.updateStatus({ state: "stopped", message: "Disconnected" });
    return this.status;
  }

  onStatus(listener: StatusListener): void {
    this.statusListeners.push(listener);
    listener(this.status);
  }

  getStatus(): DiscordBridgeStatus {
    return this.status;
  }

  private updateStatus(partial: Partial<DiscordBridgeStatus>): void {
    this.status = { ...this.status, ...partial, updatedAt: Date.now() };
    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  private handleReady(): void {
    if (!this.client?.user) return;

    this.updateStatus({
      state: "running",
      connected: true,
      botId: this.client.user.id,
      botUsername: this.client.user.username,
      message: `Logged in as ${this.client.user.username}`,
    });
  }

  private handleGuildUpdate(): void {
    if (!this.client) return;
    const guildCount = this.client.guilds.cache.size;
    this.updateStatus({ guildCount });
  }

  private handleDisconnect(): void {
    this.updateStatus({
      state: "error",
      connected: false,
      message: "Disconnected from Discord",
    });
  }

  private handleError(error: Error): void {
    console.error("[Discord] Error:", error.message);
    this.updateStatus({
      state: "error",
      lastError: error.message,
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore messages from bots (including self)
    if (message.author.bot) return;
    if (!this.config) return;

    // Check if message is from allowed users
    if (this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(message.author.id)) {
        return;
      }
    }

    const isDm = !message.guild;

    // Handle DM messages
    if (isDm) {
      await this.handleDmMessage(message);
      return;
    }

    // Handle guild messages
    if (message.guild) {
      await this.handleGuildMessage(message);
    }
  }

  private async handleDmMessage(message: Message): Promise<void> {
    if (!this.config) return;

    const dmPolicy = this.config.dmPolicy || "pairing";
    const userId = message.author.id;
    const username = message.author.username;

    switch (dmPolicy) {
      case "allowlist":
        // Check if user is in allowlist
        if (this.config.allowedUsers.length > 0 && !this.config.allowedUsers.includes(userId)) {
          await message.reply("You are not authorized to use this bot.");
          return;
        }
        break;

      case "pairing": {
        // Check if user is paired
        let isPaired = false;
        for (const entry of this.pairingCodes.values()) {
          if (entry.userId === userId) {
            isPaired = true;
            break;
          }
        }

        if (!isPaired) {
          // Generate pairing code
          const code = this.generatePairingCode();
          this.pairingCodes.set(code.toUpperCase(), {
            code,
            userId,
            username,
            timestamp: Date.now(),
          });

          await message.reply(
            `Welcome! To use this bot, please approve the pairing.\n\n` +
            `Your pairing code is: **${code}**\n\n` +
            `To approve, an admin needs to run: /pairing approve ${code}\n\n` +
            `This code expires in 10 minutes.`
          );
          return;
        }
        break;
      }

      case "open":
        // Allow all users
        break;
    }

    // Process the message
    await this.processMessage(message, `discord_dm_${userId}`);
  }

  private async handleGuildMessage(message: Message): Promise<void> {
    if (!this.config || !message.guild) return;

    const guildId = message.guild.id;
    const channelId = message.channelId;
    const userId = message.author.id;
    const content = message.content;

    // Get group config for this channel/guild
    const groupConfig = this.getGroupConfig(guildId, channelId);
    const mode = groupConfig.mode;

    // Check if disabled
    if (mode === "disabled") {
      return;
    }

    // Check allowed users for this group
    if (groupConfig.allowedUsers && groupConfig.allowedUsers.length > 0) {
      if (!groupConfig.allowedUsers.includes(userId)) {
        return;
      }
    }

    // Check if bot is mentioned
    const botId = this.client?.user?.id;
    const isMentioned = botId && content.includes(`<@${botId}>`);

    // Determine if we should respond
    let shouldRespond = false;
    switch (mode) {
      case "open":
        shouldRespond = true;
        break;
      case "listen":
        // Always process but only respond when mentioned
        shouldRespond = isMentioned || true;
        break;
      case "mention-only":
        shouldRespond = isMentioned === true;
        break;
    }

    // If not mentioned in mention-only mode, still process for memory if in listen mode
    if (!shouldRespond && mode === "listen") {
      return;
    }

    if (!shouldRespond) {
      return;
    }

    // Process the message
    const sender = `discord_${userId}`;
    await this.processMessage(message, sender);
  }

  private getGroupConfig(guildId: string, channelId: string): GroupConfig {
    if (!this.config?.groups) {
      return { mode: "open" };
    }

    // Check channel ID first
    if (this.config.groups[channelId]) {
      return this.config.groups[channelId];
    }

    // Check guild ID
    if (this.config.groups[guildId]) {
      return this.config.groups[guildId];
    }

    // Check wildcard
    if (this.config.groups["*"]) {
      return this.config.groups["*"];
    }

    return { mode: "open" };
  }

  private async processMessage(message: Message, sender: string): Promise<void> {
    if (!this.config) return;

    // Send typing indicator
    if (this.config.typingIndicator) {
      try {
        const channel = message.channel as TextBasedChannel;
        if ("sendTyping" in channel) {
          channel.sendTyping();
        }
      } catch {
        // Ignore typing indicator errors
      }
    }

    // Get message content
    const content = message.content;

    // Get attachments if any
    const attachments: string[] = [];
    if (message.attachments.size > 0) {
      try {
        for (const attachment of message.attachments.values()) {
          const filePath = await this.downloadAttachment(attachment.url, attachment.name);
          if (filePath) {
            attachments.push(filePath);
          }
        }
      } catch (error) {
        console.error("[Discord] Error downloading attachments:", error);
      }
    }

    // Send to Letta
    const inboundMessage: LettaInboundMessage = {
      channel: "discord",
      senderId: sender,
      text: content,
      agentId: this.config.defaultAgentId || undefined,
    };

    const response = await this.lettaResponder.respond(inboundMessage);

    // Send response back to Discord
    if (response) {
      try {
        // Split long messages
        const maxLength = 2000;
        if (response.length <= maxLength) {
          await message.reply(response);
        } else {
          // Split into chunks
          const chunks = this.splitMessage(response, maxLength);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        }
      } catch (error) {
        console.error("[Discord] Error sending response:", error);
        await message.reply("Sorry, I encountered an error processing your request.");
      }
    }
  }

  private async downloadAttachment(url: string, filename: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();

      // Use temp directory for now
      const tempDir = join(process.cwd(), "data", "discord-attachments");

      // Ensure directory exists
      const { mkdirSync } = await import("fs");
      mkdirSync(tempDir, { recursive: true });

      const destPath = join(tempDir, `${Date.now()}_${filename}`);
      writeFileSync(destPath, Buffer.from(buffer));
      return destPath;
    } catch (error) {
      console.error("[Discord] Error downloading attachment:", error);
      return null;
    }
  }

  private generatePairingCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const lines = text.split("\n");
    let currentChunk = "";

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        // If single line is too long, split by characters
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength));
          }
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  // Approve a pairing code
  async approvePairing(code: string): Promise<boolean> {
    const entry = this.pairingCodes.get(code.toUpperCase());
    if (!entry) {
      return false;
    }

    // Check if not expired
    if (Date.now() - entry.timestamp > 10 * 60 * 1000) {
      this.pairingCodes.delete(code.toUpperCase());
      return false;
    }

    return true;
  }

  // Add reaction to a message
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return false;

      const message = await channel.messages.fetch(messageId);
      if (!message) return false;

      await message.react(emoji);
      return true;
    } catch (error) {
      console.error("[Discord] Error adding reaction:", error);
      return false;
    }
  }
}

// Singleton instance
let discordBridgeInstance: DiscordBridge | null = null;

export function getDiscordBridge(): DiscordBridge {
  if (!discordBridgeInstance) {
    discordBridgeInstance = new DiscordBridge();
  }
  return discordBridgeInstance;
}
