/**
 * Local types for the WS-backed runner.
 *
 * The wire shapes follow letta-code's protocol_v2 exactly. The
 * outbound surface (what the runner emits) mirrors
 * @letta-ai/letta-code-sdk's SDKMessage union so the existing
 * event-handler code keeps working unchanged.
 */

export interface RuntimeScope {
    agent_id: string;
    conversation_id: string;
}

/** Inbound frame envelope. */
export interface ServerFrame {
    type: string;
    runtime?: RuntimeScope;
    agent_id?: string;
    conversation_id?: string;
    request_id?: string;
    [key: string]: unknown;
}

/** Approval decision body sent over the wire. */
export type ApprovalResponseBody =
    | {
          request_id: string;
          decision:
              | { behavior: "allow"; updated_input?: Record<string, unknown> }
              | { behavior: "deny"; message: string };
      }
    | { request_id: string; error: string };

/** Subscriber callback registered with the listener. */
export interface FrameSubscriber {
    /** Identifies the scope this subscriber cares about. */
    scope: RuntimeScope;
    /** Called for every frame whose runtime matches this scope. */
    onFrame: (frame: ServerFrame) => void;
    /** Called on listener-level errors (network, registration, etc.). */
    onError?: (err: Error) => void;
}
