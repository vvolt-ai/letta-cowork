/**
 * Letta SDK message types for UI communication.
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
  SDKStreamEventMessage,
  CanUseToolResponse,
} from "@letta-ai/letta-code-sdk";

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
};

// Import for union type and local use
import type { SDKMessage, CanUseToolResponse } from "@letta-ai/letta-code-sdk";

export type StreamMessage = SDKMessage | UserPromptMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type SessionInfo = {
  id: string;
  title: string;
  agentName?: string;
  status: SessionStatus;
  lettaConversationId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; error?: string; agentName?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: any[]; error?: string; hasMore?: boolean; before?: string } }
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
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; allowedTools?: string; agentId?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; cwd?: string } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string; limit?: number; before?: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: CanUseToolResponse } };

export type Folder = {
  folderName: string,
  folderType: string,
  folderId: string
}

export type FolderResponse = {
  accountId: string,
  folders: Folder[]
}

export interface EmailListParams {
  folderId: string;
  start?: number;
  limit?: number;
  status?: "read" | "unread" | "all";
  flagid?: number;
  labelid?: string;
  threadId?: string;
  sortBy?: "date" | "messageId" | "size";
  sortOrder?: boolean;
  includeTo?: boolean;
  includeSent?: boolean;
  includeArchive?: boolean;
  attachedMails?: boolean;
  inlinedMails?: boolean;
  flaggedMails?: boolean;
  respondedMails?: boolean;
  threadedMails?: boolean;
}

export interface ZohoEmail {
  accountId?: string;
  summary: string;
  sentDateInGMT: string;        // timestamp string
  calendarType: number;
  subject: string;
  messageId: string;
  flagid: string;
  status2: string;
  priority: string;
  hasInline: string;            // "true" | "false"
  toAddress: string;
  folderId: string;
  ccAddress: string;
  hasAttachment: string;        // "0" | "1"
  size: string;                 // bytes as string
  sender: string;
  receivedTime: string;         // timestamp string
  fromAddress: string;
  status: string;
}


export type ZohoEmailResponse = {
  data: ZohoEmail[];
  status: {
    code: number;
    description: string;
  }
}
