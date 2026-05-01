/**
 * IPC handlers for agent migration to letta_v1_agent.
 *
 * Routes:
 *   • letta:migrate-agent — clone source agent into a new letta_v1_agent
 */

import { ipcMain } from "electron";
import {
    migrateAgentToV1,
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
}
