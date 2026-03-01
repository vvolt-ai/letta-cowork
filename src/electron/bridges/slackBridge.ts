import SlackBolt from "@slack/bolt";
const { App, LogLevel } = SlackBolt;
type SlackApp = InstanceType<typeof App>;
import { LettaResponder, LettaInboundMessage } from "./lettaResponder.js";
import type { SlackBridgeConfig } from "./channelConfig.js";

type SlackStatusState = "stopped" | "starting" | "running" | "error";

export type SlackBridgeStatus = {
  state: SlackStatusState;
  connected: boolean;
  botId: string;
  botUsername: string;
  teamId: string;
  message: string;
  lastError: string;
  updatedAt: number;
};

type StatusListener = (status: SlackBridgeStatus) => void;

export class SlackBridge {
  private app: SlackApp | null = null;
  private config: SlackBridgeConfig | null = null;
  private readonly lettaResponder = new LettaResponder();
  private statusListeners: StatusListener[] = [];
  private status: SlackBridgeStatus = {
    state: "stopped",
    connected: false,
    botId: "",
    botUsername: "",
    teamId: "",
    message: "",
    lastError: "",
    updatedAt: Date.now(),
  };

  async start(config: SlackBridgeConfig): Promise<SlackBridgeStatus> {
    if (this.app) {
      await this.stop();
    }

    this.config = config;
    this.updateStatus({ state: "starting", message: "Connecting to Slack via Socket Mode..." });

    try {
      // Create Slack app with Socket Mode
      this.app = new App({
        socketMode: true,
        token: config.botToken,
        appToken: config.appToken,
        logLevel: LogLevel.INFO,
      });

      // Event: AppMention - when someone @mentions the bot
      this.app.event("app_mention", async ({ event, client }) => {
        await this.handleMention(event, client);
      });

      // Event: Message in DM (im)
      this.app.message(async ({ message, client }) => {
        // Only handle direct messages, not mentions (those are handled above)
        if (message.channel_type === "im") {
          await this.handleDm(message, client);
        }
      });

      // Start the app
      await this.app.start();

      // Get bot info
      const authResult = await this.app.client.auth.test();
      
      this.updateStatus({
        state: "running",
        connected: true,
        botId: authResult.user_id,
        botUsername: authResult.user,
        teamId: authResult.team_id,
        message: `Logged in as ${authResult.user}`,
      });

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

  async stop(): Promise<SlackBridgeStatus> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    this.updateStatus({ state: "stopped", message: "Disconnected" });
    return this.status;
  }

  onStatus(listener: StatusListener): void {
    this.statusListeners.push(listener);
    listener(this.status);
  }

  getStatus(): SlackBridgeStatus {
    return this.status;
  }

  private updateStatus(partial: Partial<SlackBridgeStatus>): void {
    this.status = { ...this.status, ...partial, updatedAt: Date.now() };
    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  private async handleMention(event: any, client: any): Promise<void> {
    if (!this.config) return;

    const userId = event.user;
    const channelId = event.channel;
    const text = event.text;
    const ts = event.ts; // message timestamp for threading

    // Check if allowed user
    if (this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(userId)) {
        return;
      }
    }

    // Get user info for username
    let username = userId;
    try {
      const userInfo = await client.users.info({ user: userId });
      username = userInfo.user?.real_name || userInfo.user?.name || userId;
    } catch {
      // Use userId as fallback
    }

    // Send typing indicator
    if (this.config.typingIndicator) {
      try {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "🤔 Thinking...",
        });
      } catch {
        // Ignore typing indicator errors
      }
    }

    // Send to Letta
    const sender = `slack_mention_${userId}`;
    const inboundMessage: LettaInboundMessage = {
      channel: "slack",
      senderId: sender,
      text: text,
      agentId: this.config.defaultAgentId || undefined,
    };

    const response = await this.lettaResponder.respond(inboundMessage);

    // Send response back to Slack
    if (response) {
      try {
        // Split long messages
        const maxLength = 3000;
        if (response.length <= maxLength) {
          await client.chat.postMessage({
            channel: channelId,
            text: response,
            thread_ts: ts, // Reply in thread
          });
        } else {
          // Split into chunks
          const chunks = this.splitMessage(response, maxLength);
          for (const chunk of chunks) {
            await client.chat.postMessage({
              channel: channelId,
              text: chunk,
              thread_ts: ts,
            });
          }
        }
      } catch (error) {
        console.error("[Slack] Error sending response:", error);
        await client.chat.postMessage({
          channel: channelId,
          text: "Sorry, I encountered an error processing your request.",
          thread_ts: ts,
        });
      }
    }
  }

  private async handleDm(message: any, client: any): Promise<void> {
    if (!this.config) return;

    // Ignore bot messages
    if (message.subtype === "bot_message" || message.bot_id) {
      return;
    }

    const userId = message.user;
    const channelId = message.channel;
    const text = message.text;
    const ts = message.ts;

    // Check if allowed user
    if (this.config.allowedUsers.length > 0) {
      if (!this.config.allowedUsers.includes(userId)) {
        return;
      }
    }

    // Get user info for username
    let username = userId;
    try {
      const userInfo = await client.users.info({ user: userId });
      username = userInfo.user?.real_name || userInfo.user?.name || userId;
    } catch {
      // Use userId as fallback
    }

    // Send typing indicator
    if (this.config.typingIndicator) {
      try {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "🤔 Thinking...",
        });
      } catch {
        // Ignore typing indicator errors
      }
    }

    // Send to Letta
    const sender = `slack_dm_${userId}`;
    const inboundMessage: LettaInboundMessage = {
      channel: "slack",
      senderId: sender,
      text: text,
      agentId: this.config.defaultAgentId || undefined,
    };

    const response = await this.lettaResponder.respond(inboundMessage);

    // Send response back to Slack
    if (response) {
      try {
        // Split long messages
        const maxLength = 3000;
        if (response.length <= maxLength) {
          await client.chat.postMessage({
            channel: channelId,
            text: response,
          });
        } else {
          // Split into chunks
          const chunks = this.splitMessage(response, maxLength);
          for (const chunk of chunks) {
            await client.chat.postMessage({
              channel: channelId,
              text: chunk,
            });
          }
        }
      } catch (error) {
        console.error("[Slack] Error sending response:", error);
        await client.chat.postMessage({
          channel: channelId,
          text: "Sorry, I encountered an error processing your request.",
        });
      }
    }
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
}

// Singleton instance
let slackBridgeInstance: SlackBridge | null = null;

export function getSlackBridge(): SlackBridge {
  if (!slackBridgeInstance) {
    slackBridgeInstance = new SlackBridge();
  }
  return slackBridgeInstance;
}
