/**
 * IPC handlers for agent migration to letta_v1_agent.
 *
 * Routes:
 *   • letta:migrate-agent — clone source agent into a new letta_v1_agent
 */

import { ipcMain } from "electron";
import {
    migrateAgentToV1,
    refreshAgentSystemPrompt,
    type MigrationOptions,
} from "../../services/agent-migration/index.js";

export function registerAgentMigrationHandlers(): void {
    ipcMain.handle(
        "letta:migrate-agent",
        async (_event, opts: MigrationOptions) => {
            try {
                if (!opts || typeof opts !== "object" || !opts.sourceAgentId) {
                    throw new Error("sourceAgentId is required");
                }
                const result = await migrateAgentToV1(opts);
                return { ok: true as const, data: result };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                console.error("[agent-migration] failed:", err);
                return { ok: false as const, error: message };
            }
        }
    );

    // Refresh an existing agent's system prompt to letta-code's
    // tool-aware version. Idempotent — safe to re-run.
    ipcMain.handle(
        "letta:refresh-agent-system-prompt",
        async (
            _event,
            opts: {
                agentId: string;
                mode?: "letta-code" | "letta-code+persona";
                memoryMode?: "blocks" | "memfs";
            }
        ) => {
            try {
                if (!opts || typeof opts !== "object" || !opts.agentId) {
                    throw new Error("agentId is required");
                }
                const result = await refreshAgentSystemPrompt(opts);
                return { ok: true as const, data: result };
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                console.error("[agent-migration] refresh failed:", err);
                return { ok: false as const, error: message };
            }
        }
    );
}
