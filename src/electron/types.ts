/**
 * Letta SDK message types for electron communication.
 */

// Re-export SDK types
export type {
  SDKMessage,
  SDKInitMessage,
  SDKAssistantMessage,
  SDKToolCallMessage,
  SDKToolResultMessage,
  SDKReasoningMessage,
  SDKResultMessage,
  CanUseToolResponse,
  MessageContentItem,
} from "@letta-ai/letta-code-sdk";

export type ChatAttachmentKind = "image" | "file";

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  kind: ChatAttachmentKind;
}

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
  attachments?: ChatAttachment[];
  content?: MessageContentItem[];
};

// Import for union type and local use
import type { SDKMessage, CanUseToolResponse, MessageContentItem } from "@letta-ai/letta-code-sdk";

export type StreamMessage = SDKMessage | UserPromptMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  lettaConversationId?: string;
  cwd?: string;
  agentName?: string;
  agentId?: string;
  createdAt: number;
  updatedAt: number;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string; attachments?: ChatAttachment[]; content?: MessageContentItem[] } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; error?: string; agentName?: string; agentId?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | {
      type: "session.history";
      payload: {
        sessionId: string;
        status: SessionStatus;
        messages: StreamMessage[];
        hasMore?: boolean;
        nextBefore?: string;
        requestedBefore?: string;
        totalFetchedCount?: number;
        totalDisplayableCount?: number;
        error?: string;
      };
    }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } }
  | {
      type: "whatsapp-bridge-status";
      payload: {
        state: "stopped" | "starting" | "qr" | "connected" | "reconnecting" | "error";
        connected: boolean;
        selfJid: string;
        qrAvailable: boolean;
        qrDataUrl: string;
        message: string;
        lastError: string;
        updatedAt: number;
      };
    };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; content?: MessageContentItem[]; attachments?: ChatAttachment[]; cwd?: string; allowedTools?: string; agentId?: string; model?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; content?: MessageContentItem[]; attachments?: ChatAttachment[]; cwd?: string } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string; limit?: number; before?: string } }
  | { type: "session.rename"; payload: { sessionId: string; title: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: CanUseToolResponse } };
