/**
 * WS-backed replacements for letta-code-sdk's createSession/resumeSession.
 *
 * Drop-in compatible — the returned objects expose the same surface
 * the existing runner uses (initialize / send / stream / agentId /
 * conversationId).
 */

import type { Session as LettaSession } from "@letta-ai/letta-code-sdk";
import { WsSession, type WsSessionOptions } from "./session.js";
export { WsSession } from "./session.js";
export { shutdownListener } from "./listener.js";

// WsSession exposes the same public surface the runner uses
// (initialize / send / stream / agentId / conversationId), but
// `LettaSession` is a class with private fields TypeScript treats
// nominally — we can't structurally satisfy it. Cast through `unknown`
// so callers can keep their `LettaSession` annotations.

/** Create a new conversation against an agent. */
export function createWsSession(
    agentId: string | undefined,
    options: WsSessionOptions
): LettaSession {
    return new WsSession({
        ...options,
        agentId: agentId ?? options.agentId,
    }) as unknown as LettaSession;
}

/** Resume an existing conversation. */
export function resumeWsSession(
    conversationId: string,
    options: WsSessionOptions
): LettaSession {
    return new WsSession({
        ...options,
        conversationId,
    }) as unknown as LettaSession;
}
