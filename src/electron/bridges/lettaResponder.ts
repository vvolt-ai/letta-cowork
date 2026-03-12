import { createSession, resumeSession, type Session as LettaSession, type SDKMessage } from "@letta-ai/letta-code-sdk";

type ChannelName = "whatsapp" | "telegram" | "slack" | "discord";

export type LettaInboundMessage = {
  channel: ChannelName;
  senderId: string;
  text: string;
  agentId?: string;
};

type StreamedText = {
  assistantChunks: string[];
  resultMessage?: string;
};

const mergeAssistantChunks = (chunks: string[]): string => {
  let out = "";
  for (const rawChunk of chunks) {
    const chunk = rawChunk ?? "";
    if (!chunk) continue;
    if (!out) {
      out = chunk;
      continue;
    }

    const prev = out[out.length - 1];
    const next = chunk[0];
    const prevIsSpace = /\s/.test(prev);
    const nextIsSpace = /\s/.test(next);
    const nextIsPunctuation = /^[,.;!?)]$/.test(next);
    const prevIsOpenPunctuation = /[(]$/.test(prev);
    const isApostropheJoin = next === "'" || next === "’";

    if (prevIsSpace || nextIsSpace || nextIsPunctuation || prevIsOpenPunctuation || isApostropheJoin) {
      out += chunk;
    } else {
      out += ` ${chunk}`;
    }
  }
  return out.trim();
};

export class LettaResponder {
  private activeSession: LettaSession | null = null;
  private activeConversationId: string | null = null;
  private activeAgentId: string | null = null;

  private createOrResumeSession(targetAgentId?: string): LettaSession {
    const effectiveAgentId = targetAgentId?.trim() || process.env.LETTA_AGENT_ID?.trim() || undefined;
    const sessionOptions = {
      cwd: process.cwd(),
      permissionMode: "bypassPermissions" as const,
      canUseTool: async () => ({ behavior: "allow" as const }),
      systemInfoReminder: false,
    };

    if (this.activeConversationId) {
      return resumeSession(this.activeConversationId, sessionOptions);
    }
    if (effectiveAgentId) {
      return createSession(effectiveAgentId, sessionOptions);
    }
    return createSession(undefined, sessionOptions);
  }

  private extractTextFromStreamedMessage(message: SDKMessage, accumulator: StreamedText): void {
    if (message.type === "assistant") {
      if (message.content?.trim()) {
        accumulator.assistantChunks.push(message.content.trim());
      }
      return;
    }

    if (message.type === "result") {
      const summary = String(message.success ? "" : message.error ?? "").trim();
      if (summary) {
        accumulator.resultMessage = summary;
      }
    }
  }

  async respond(input: LettaInboundMessage): Promise<string> {
    const session = this.createOrResumeSession(input.agentId);
    this.activeSession = session;

    const normalizedPrompt = [
      `Channel: ${input.channel}`,
      `Sender: ${input.senderId}`,
      "User message:",
      input.text.trim(),
    ].join("\n");

    await session.send(normalizedPrompt);

    if (session.conversationId) {
      this.activeConversationId = session.conversationId;
    }
    if (session.agentId) {
      this.activeAgentId = session.agentId;
    }

    const streamed: StreamedText = { assistantChunks: [] };
    for await (const message of session.stream()) {
      this.extractTextFromStreamedMessage(message, streamed);
    }

    const assistantText = mergeAssistantChunks(streamed.assistantChunks);
    if (assistantText) return assistantText;
    if (streamed.resultMessage) return streamed.resultMessage;
    return "I received your message but could not generate a response.";
  }
}
