/**
 * Utility functions for session IPC handlers
 */

import { BrowserWindow } from "electron";
import { Letta } from "@letta-ai/letta-client";
import type { ServerEvent } from "./types.js";

const DEBUG = process.env.DEBUG_IPC === "true";

/**
 * Simple logger for IPC handlers
 */
export const log = (msg: string, data?: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [ipc] ${msg}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${timestamp}] [ipc] ${msg}`);
    }
};

/**
 * Debug-only logging (verbose)
 */
export const debug = (msg: string, data?: Record<string, unknown>): void => {
    console.log(`[${new Date().toISOString()}] [ipc] ${msg}`, data);
    if (!DEBUG) return;
    log(msg, data);
};

/**
 * Create a Letta client instance
 */
export function createLettaClient(): Letta | null {
    try {
        const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
        const apiKey = (process.env.LETTA_API_KEY || "").trim();
        if (!apiKey) return null;
        return new Letta({
            baseURL,
            apiKey: apiKey || null,
        });
    } catch {
        return null;
    }
}

/**
 * Broadcast an event to all browser windows
 */
export function broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        win.webContents.send("server-event", payload);
    }
}

/**
 * Extract text content from various message content formats
 */
export function extractMessageText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content) && content.length > 0) {
        const lastBlock = content[content.length - 1] as { text?: string } | string;
        if (lastBlock && typeof lastBlock === "object" && typeof lastBlock.text === "string") {
            return lastBlock.text;
        }
        if (typeof lastBlock === "string") {
            return lastBlock;
        }
        try {
            return JSON.stringify(lastBlock);
        } catch {
            return String(lastBlock ?? "");
        }
    }
    if (typeof content === "object") {
        try {
            return JSON.stringify(content);
        } catch {
            return String(content ?? "");
        }
    }
    return String(content ?? "");
}
