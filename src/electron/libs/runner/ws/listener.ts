/**
 * Shared WebSocket listener — one connection per process, fanned out
 * to every active session by (agent_id, conversation_id) scope.
 *
 * Mirrors letta-code's listener pattern faithfully:
 *   1. POST {baseUrl}/v1/environments/register → {connectionId, wsUrl}
 *   2. WebSocket connect with Bearer auth + deviceId/connectionName params
 *   3. 30-second heartbeat ({type:"ping"})
 *   4. Reconnect with exponential backoff (1s → 30s, max 5 min, then re-register)
 *
 * Subscribers register with a scope; inbound frames are routed by
 * matching `frame.runtime` (or top-level agent_id/conversation_id on
 * `control_request` envelopes).
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import { join } from "path";

import { app } from "electron";
import WebSocket from "ws";

import { debug } from "../logger.js";

import type {
    FrameSubscriber,
    RuntimeScope,
    ServerFrame,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────
// Constants — match letta-code/src/websocket/listener/constants.ts
// ─────────────────────────────────────────────────────────────────────
const MAX_RETRY_DURATION_MS = 5 * 60 * 1000;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const LISTENER_PONG_TIMEOUT_MS = 90_000;
const REGISTER_INITIAL_DELAY_MS = 1_000;
const REGISTER_MAX_DELAY_MS = 30_000;
const REGISTER_MAX_DURATION_MS = 2 * 60 * 1_000;

function isListenerPongStale(
    lastPongAt: number | null,
    now: number,
    timeoutMs: number
): boolean {
    if (lastPongAt === null) return false;
    return now - lastPongAt > timeoutMs;
}

// ─────────────────────────────────────────────────────────────────────
// Module-level state
// ─────────────────────────────────────────────────────────────────────

interface ListenerRuntime {
    socket: WebSocket | null;
    intentionallyClosed: boolean;
    everConnected: boolean;
    heartbeatInterval: NodeJS.Timeout | null;
    reconnectTimeout: NodeJS.Timeout | null;
    /** Last relay `pong` epoch ms, used to reap half-open sockets. */
    lastPongAt: number | null;
    connectionId: string | null;
    deviceId: string;
    connectionName: string;
    apiKey: string;
    baseUrl: string;
    /** Active subscribers, keyed by `${agent_id}::${conversation_id}`. */
    subscribers: Map<string, Set<FrameSubscriber>>;
    /** Pending send buffer for messages emitted before connection is open. */
    sendQueue: string[];
    connectPromise: Promise<void> | null;
}

let runtime: ListenerRuntime | null = null;

function scopeKey(scope: RuntimeScope): string {
    return `${scope.agent_id}::${scope.conversation_id}`;
}

function getRuntime(): ListenerRuntime {
    if (!runtime) {
        const apiKey = (process.env.LETTA_API_KEY ?? "").trim();
        const baseUrl = (
            process.env.LETTA_BASE_URL || "https://api.letta.com"
        ).trim();
        if (!apiKey) {
            throw new Error("LETTA_API_KEY is not configured");
        }
        runtime = {
            socket: null,
            intentionallyClosed: false,
            everConnected: false,
            heartbeatInterval: null,
            reconnectTimeout: null,
            lastPongAt: null,
            connectionId: null,
            deviceId: getOrCreateDeviceId(),
            connectionName: `Cowork on ${os.hostname()}`,
            apiKey,
            baseUrl,
            subscribers: new Map(),
            sendQueue: [],
            connectPromise: null,
        };
    }
    return runtime;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to inbound frames for a specific scope. Lazily opens the
 * WS connection on first call. Returns an unsubscribe function.
 */
export async function subscribe(sub: FrameSubscriber): Promise<() => void> {
    const r = getRuntime();
    const key = scopeKey(sub.scope);
    let bucket = r.subscribers.get(key);
    if (!bucket) {
        bucket = new Set();
        r.subscribers.set(key, bucket);
    }
    bucket.add(sub);

    // Ensure connection is open (or in flight).
    if (!r.socket || r.socket.readyState !== WebSocket.OPEN) {
        if (!r.connectPromise) {
            r.connectPromise = connectWithRetry(r, 0, Date.now()).finally(() => {
                r.connectPromise = null;
            });
        }
        try {
            await r.connectPromise;
        } catch (err) {
            sub.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
    }

    return () => {
        const bucketNow = r.subscribers.get(key);
        if (!bucketNow) return;
        bucketNow.delete(sub);
        if (bucketNow.size === 0) r.subscribers.delete(key);
    };
}

/** Best-effort send. Buffers until the socket opens; drops on permanent failure. */
export function sendOnListener(payload: unknown): boolean {
    const r = getRuntime();
    const serialized =
        typeof payload === "string" ? payload : JSON.stringify(payload);
    if (r.socket && r.socket.readyState === WebSocket.OPEN) {
        try {
            r.socket.send(serialized);
            console.log(`[ws-listener] SEND ${serialized.slice(0, 220)}`);
            return true;
        } catch (err) {
            console.error("[ws-listener] send failed:", err);
            return false;
        }
    }
    // Not yet open — buffer. Connection logic will flush on open.
    if (r.sendQueue.length < 100) {
        r.sendQueue.push(serialized);
        console.log(
            `[ws-listener] SEND buffered (socket not open yet) — queue=${r.sendQueue.length}`
        );
    } else {
        console.warn("[ws-listener] send queue full, dropping payload");
    }
    return false;
}

/** Send a user message scoped to a specific conversation. */
export function sendCreateMessage(
    scope: RuntimeScope,
    messages: Array<{
        role: "user";
        content: string | Array<{ type: "text"; text: string }>;
        client_message_id?: string;
    }>,
    clientToolAllowlist?: string[]
): boolean {
    return sendOnListener({
        type: "input",
        runtime: scope,
        payload: {
            kind: "create_message",
            messages,
            ...(clientToolAllowlist
                ? { client_tool_allowlist: clientToolAllowlist }
                : {}),
        },
    });
}

/** Send an approval decision scoped to a specific conversation. */
export function sendApprovalResponse(
    scope: RuntimeScope,
    body:
        | {
              request_id: string;
              decision:
                  | { behavior: "allow"; updated_input?: Record<string, unknown> }
                  | { behavior: "deny"; message: string };
          }
        | { request_id: string; error: string }
): boolean {
    return sendOnListener({
        type: "input",
        runtime: scope,
        payload: { kind: "approval_response", ...body },
    });
}

/** Tear down the listener cleanly. Clears all subscribers. */
export function shutdownListener(): void {
    if (!runtime) return;
    runtime.intentionallyClosed = true;
    clearTimers(runtime);
    if (runtime.socket) {
        try {
            runtime.socket.close();
        } catch {
            // best-effort
        }
        runtime.socket = null;
    }
    runtime.subscribers.clear();
    runtime = null;
}

// ─────────────────────────────────────────────────────────────────────
// Internal — connect + retry + heartbeat
// ─────────────────────────────────────────────────────────────────────

async function connectWithRetry(
    r: ListenerRuntime,
    attempt: number,
    startTime: number
): Promise<void> {
    if (r.intentionallyClosed) return;

    const elapsed = Date.now() - startTime;
    if (attempt > 0) {
        if (elapsed >= MAX_RETRY_DURATION_MS) {
            if (r.everConnected) {
                // Force re-register with a fresh wsUrl.
                r.connectionId = null;
                return scheduleReconnect(r, 1, Date.now());
            }
            throw new Error(
                "[ws-listener] failed to connect after 5 minutes of retrying"
            );
        }
        const delay = Math.min(
            INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
            MAX_RETRY_DELAY_MS
        );
        debug("[ws-listener] retry scheduled", { delayMs: delay });
        await new Promise<void>((resolve) => {
            r.reconnectTimeout = setTimeout(resolve, delay);
        });
        r.reconnectTimeout = null;
        if (r.intentionallyClosed) return;
    }

    clearTimers(r);

    // Step 1: register
    let wsUrl: string;
    let connectionId: string;
    try {
        console.log(
            `[ws-listener] POST ${r.baseUrl}/v1/environments/register …`
        );
        const reg = await registerWithRetry(r);
        wsUrl = reg.wsUrl;
        connectionId = reg.connectionId;
        r.connectionId = connectionId;
        console.log(
            `[ws-listener] register OK → connectionId=${connectionId}, wsUrl=${wsUrl}`
        );
    } catch (err) {
        console.error("[ws-listener] register FAILED:", err);
        // 4xx → fail; 5xx/network → backoff.
        if (err instanceof RegistrationError && err.statusCode >= 400 && err.statusCode < 500) {
            throw err;
        }
        return scheduleReconnect(r, attempt + 1, startTime);
    }

    // Step 2: open WebSocket
    const url = new URL(wsUrl);
    url.searchParams.set("deviceId", r.deviceId);
    url.searchParams.set("connectionName", r.connectionName);

    return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url.toString(), {
            headers: { Authorization: `Bearer ${r.apiKey}` },
        });
        r.socket = socket;
        let resolved = false;

        socket.on("open", () => {
            r.everConnected = true;
            r.lastPongAt = Date.now();
            console.log(`[ws-listener] WS OPEN — connectionId=${connectionId}`);
            r.heartbeatInterval = setInterval(() => {
                if (
                    isListenerPongStale(
                        r.lastPongAt,
                        Date.now(),
                        LISTENER_PONG_TIMEOUT_MS
                    )
                ) {
                    console.warn(
                        `[ws-listener] no relay pong within ${LISTENER_PONG_TIMEOUT_MS}ms; terminating half-open socket to reconnect`
                    );
                    socket.terminate();
                    return;
                }
                try {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: "ping" }));
                    }
                } catch {
                    // ignore
                }
            }, HEARTBEAT_INTERVAL_MS);
            r.heartbeatInterval.unref?.();
            // Flush buffered sends
            while (r.sendQueue.length) {
                const msg = r.sendQueue.shift();
                if (msg) {
                    try {
                        socket.send(msg);
                    } catch {
                        // ignore
                    }
                }
            }
            if (!resolved) {
                resolved = true;
                resolve();
            }
        });

        socket.on("message", (raw: WebSocket.RawData) => {
            const text = raw.toString();
            let frame: ServerFrame | null = null;
            try {
                frame = JSON.parse(text) as ServerFrame;
            } catch (err) {
                console.warn("[ws-listener] dropping unparseable frame:", err);
                return;
            }
            if (!frame || typeof frame !== "object") return;
            if (frame.type === "pong") {
                r.lastPongAt = Date.now();
            }
            // Log every frame so we can see what the server is actually
            // sending. Truncate large delta payloads.
            const peek = JSON.stringify(frame).slice(0, 220);
            console.log(`[ws-listener] RECV ${frame.type ?? "?"} ${peek}`);
            dispatch(r, frame);
        });

        socket.on("close", (code, reason) => {
            clearTimers(r);
            r.socket = null;
            if (r.intentionallyClosed) return;
            console.warn(
                `[ws-listener] socket closed (code=${code}, reason=${reason.toString()}); reconnecting`
            );
            const nextAttempt = r.everConnected ? 1 : attempt + 1;
            const newStart = r.everConnected ? Date.now() : startTime;
            void scheduleReconnect(r, nextAttempt, newStart);
            if (!resolved) {
                resolved = true;
                reject(new Error(`socket closed before open (code=${code})`));
            }
        });

        socket.on("error", (err: Error) => {
            console.warn("[ws-listener] socket error:", err.message);
            // 'close' will fire next and drive reconnect.
            for (const bucket of r.subscribers.values()) {
                for (const sub of bucket) sub.onError?.(err);
            }
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });
    });
}

function scheduleReconnect(
    r: ListenerRuntime,
    attempt: number,
    startTime: number
): Promise<void> {
    return connectWithRetry(r, attempt, startTime).catch((err) => {
        console.error("[ws-listener] reconnect loop error:", err);
    });
}

function clearTimers(r: ListenerRuntime): void {
    if (r.heartbeatInterval) {
        clearInterval(r.heartbeatInterval);
        r.heartbeatInterval = null;
    }
    if (r.reconnectTimeout) {
        clearTimeout(r.reconnectTimeout);
        r.reconnectTimeout = null;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Frame dispatch — route to subscribers by scope
// ─────────────────────────────────────────────────────────────────────

function dispatch(r: ListenerRuntime, frame: ServerFrame): void {
    if (frame.type === "ping" || frame.type === "pong") return;

    // Scope detection — runtime envelope OR top-level (control_request).
    const agentId =
        frame.runtime?.agent_id ?? (frame.agent_id as string | undefined);
    const conversationId =
        frame.runtime?.conversation_id ?? (frame.conversation_id as string | undefined);

    if (!agentId || !conversationId) {
        // Frames without a scope (e.g. global _ws_send_error) — broadcast.
        for (const bucket of r.subscribers.values()) {
            for (const sub of bucket) sub.onFrame(frame);
        }
        return;
    }

    const key = `${agentId}::${conversationId}`;
    const bucket = r.subscribers.get(key);
    if (!bucket) return;
    for (const sub of bucket) sub.onFrame(frame);
}

// ─────────────────────────────────────────────────────────────────────
// Registration (POST /v1/environments/register)
// ─────────────────────────────────────────────────────────────────────

class RegistrationError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "RegistrationError";
        this.statusCode = statusCode;
    }
}

interface RegisterResult {
    connectionId: string;
    wsUrl: string;
}

async function registerOnce(r: ListenerRuntime): Promise<RegisterResult> {
    const url = `${r.baseUrl.replace(/\/+$/, "")}/v1/environments/register`;
    let appVersion = "0.0.0";
    try {
        appVersion = app.getVersion();
    } catch {
        // outside Electron context (tests)
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${r.apiKey}`,
            // Source identifier. The Letta listener server keys routing
            // off this — declare ourselves as letta-code so the existing
            // code path is exercised.
            "X-Letta-Source": "letta-code",
        },
        body: JSON.stringify({
            deviceId: r.deviceId,
            connectionName: r.connectionName,
            metadata: {
                lettaCodeVersion: appVersion,
                os: process.platform,
                osRelease: os.release(),
                arch: process.arch,
                nodeVersion: process.version,
            },
        }),
    }).catch((fetchError: unknown) => {
        const msg =
            fetchError instanceof Error ? fetchError.message : String(fetchError);
        throw new RegistrationError(`Network error: ${msg}`, 0);
    });

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        const text = await response.text().catch(() => "");
        if (text) {
            try {
                const parsed = JSON.parse(text) as { message?: string };
                if (parsed.message) detail = parsed.message;
                else detail += `: ${text.slice(0, 200)}`;
            } catch {
                detail += `: ${text.slice(0, 200)}`;
            }
        }
        throw new RegistrationError(detail, response.status);
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.connectionId !== "string" || typeof body.wsUrl !== "string") {
        throw new RegistrationError(
            "Server returned unexpected response shape",
            response.status
        );
    }
    return { connectionId: body.connectionId, wsUrl: body.wsUrl };
}

async function registerWithRetry(r: ListenerRuntime): Promise<RegisterResult> {
    const startTime = Date.now();
    let attempt = 0;
    for (;;) {
        try {
            return await registerOnce(r);
        } catch (err) {
            const elapsed = Date.now() - startTime;
            const transient =
                err instanceof RegistrationError
                    ? err.statusCode === 0 || err.statusCode >= 500
                    : true;
            if (!transient || elapsed >= REGISTER_MAX_DURATION_MS) throw err;
            attempt++;
            const delay = Math.min(
                REGISTER_INITIAL_DELAY_MS * 2 ** (attempt - 1),
                REGISTER_MAX_DELAY_MS
            );
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// Persistent device id
// ─────────────────────────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
    let userDataDir: string;
    try {
        userDataDir = app.getPath("userData");
    } catch {
        userDataDir = join(process.cwd(), ".vera-cowork-tmp");
    }
    if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true });
    const file = join(userDataDir, "letta-device-id");
    if (existsSync(file)) {
        try {
            const content = readFileSync(file, "utf-8").trim();
            if (content) return content;
        } catch {
            // fall through
        }
    }
    const id = `vera-cowork-${randomUUID()}`;
    try {
        writeFileSync(file, id, "utf-8");
    } catch (err) {
        console.warn("[ws-listener] could not persist device id:", err);
    }
    return id;
}
