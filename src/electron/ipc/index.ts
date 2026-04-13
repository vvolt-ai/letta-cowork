/**
 * IPC Handler Registration
 * Central point for registering all IPC handlers
 */

import { ipcMain, dialog, shell } from "electron";
import type { BrowserWindow } from "electron";
import type { ClientEvent } from "../types.js";
import { ipcMainHandle } from "../utils/index.js";
import { getStaticData, pollResources } from "../utils/test-helper.js";
import { getLettaEnvConfig, updateLettaEnvConfig, type LettaEnvConfig } from "../services/env/index.js";
import { listLettaAgents, listLettaModels, getLettaAgent, retrieveAgentRunById } from "../services/agents/index.js";
import { listAgentMemoryFiles } from "../services/memoryService.js";
import { downloadSkillsFromGitHub } from "../services/skills/index.js";
import { registerLettaCodeTools, attachLettaCodeToolsToAgent, listRegisteredLettaCodeTools } from "../services/tools/index.js";
import { exec, spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import { isDev } from "../utils/index.js";

// Import individual handler registrators
import { handleSessionEvent, recoverPendingApprovalsForSession, cancelRecoveredRun, cleanupAllSessions } from "./handlers/session/index.js";
import { registerChannelHandlers, initializeBridges } from "./handlers/channel-handlers.js";
import { registerEmailHandlers } from "./handlers/email-handlers.js";
import { registerAttachmentHandlers } from "./handlers/attachment-handlers.js";
import { registerSchedulerHandlers } from "./handlers/scheduler-handlers.js";

// Re-export session handlers for backward compatibility
export { handleClientEvent, recoverPendingApprovalsForSession, cancelRecoveredRun, cleanupAllSessions };
export { initializeBridges };

// Get Letta CLI path
const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV !== "production";
let localCli = "";
if (isDevelopment) {
    localCli = path.join(
        process.cwd(),
        "node_modules",
        "@letta-ai",
        "letta-code",
        "letta.js"
    );
} else {
    localCli = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "@letta-ai",
        "letta-code",
        "letta.js"
    );
}

// Letta CLI process registry
const lettaCliProcesses = new Map<string, ChildProcess>();

/**
 * Handle all client events (session, permission, etc.)
 * This is the main entry point for IPC event handling
 */
async function handleClientEvent(event: ClientEvent): Promise<void> {
    return handleSessionEvent(event);
}

/**
 * Register all IPC handlers
 * @param mainWindow - The main browser window instance
 */
export function registerAllIpcHandlers(mainWindow: BrowserWindow): void {
    // Register session handlers via ipcMain.on for client events
    ipcMain.on("client-event", (_: Electron.IpcMainEvent, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Static data handler
    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Recent working directories
    ipcMainHandle("get-recent-cwds", () => {
        return [process.cwd()];
    });

    // External URL handler
    ipcMain.handle("open-external", async (_event, url: string) => {
        if (typeof url !== "string") {
            throw new Error("Invalid URL");
        }
        const normalized = url.trim();
        if (!/^https?:\/\//i.test(normalized)) {
            throw new Error("Only http(s) URLs are allowed");
        }
        await shell.openExternal(normalized);
    });

    // Letta environment handlers
    ipcMain.handle("get-letta-env", () => {
        return getLettaEnvConfig();
    });

    ipcMain.handle("is-admin", () => {
        return process.env.IS_ADMIN === "true";
    });

    // Agent handlers
    ipcMain.handle("list-letta-agents", async () => {
        try {
            return await listLettaAgents();
        } catch (error) {
            console.error("Failed to list agents:", error);
            throw error;
        }
    });

    ipcMain.handle("list-letta-models", async () => {
        try {
            return await listLettaModels();
        } catch (error) {
            console.error("Failed to list models:", error);
            throw error;
        }
    });

    ipcMain.handle("get-letta-agent", async (_, agentId: string) => {
        try {
            return await getLettaAgent(agentId);
        } catch (error) {
            console.error("Failed to get agent:", error);
            throw error;
        }
    });

    // Pending approvals recovery
    ipcMain.handle("recover-pending-approvals", async (_, sessionId: string, agentId?: string) => {
        return await recoverPendingApprovalsForSession(sessionId, agentId);
    });

    ipcMain.handle("cancel-stuck-run", async (_, runId: string) => {
        return await cancelRecoveredRun(runId);
    });

    ipcMain.handle("get-run-status", async (_, runId: string) => {
        return await retrieveAgentRunById(runId);
    });

    // Memory files
    ipcMain.handle("list-agent-memory-files", async () => {
        try {
            return await listAgentMemoryFiles();
        } catch (error) {
            console.error("Failed to list agent memory files:", error);
            throw error;
        }
    });

    // Update Letta env
    ipcMain.handle("update-letta-env", async (_, values: LettaEnvConfig) => {
        try {
            updateLettaEnvConfig(values);
            return { success: true };
        } catch (error) {
            console.error("Failed to update Letta env:", error);
            throw new Error("Failed to persist environment variables on this system.");
        }
    });

    // Directory selection dialog
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Letta Code Tools handlers
    ipcMain.handle("register-letta-code-tools", async (_event, overwrite: boolean = true) => {
        return await registerLettaCodeTools(overwrite);
    });

    ipcMain.handle("attach-letta-code-tools", async (_event, agentId: string) => {
        return await attachLettaCodeToolsToAgent(agentId);
    });

    ipcMain.handle("list-letta-code-tools", async () => {
        return await listRegisteredLettaCodeTools();
    });

    // Letta CLI: exec-based (returns full output)
    ipcMain.handle("run-letta-cli", async (_event, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        return new Promise((resolve) => {
            if (!localCli) {
                resolve({ stdout: "", stderr: "letta CLI not found", exitCode: 1 });
                return;
            }
            const cmd = `node "${localCli}" ${args.map((a) => JSON.stringify(a)).join(" ")}`;
            const cliEnv = { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb", NO_UPDATE_NOTIFIER: "1" };
            exec(cmd, { env: cliEnv, timeout: 30_000 }, (error, stdout, stderr) => {
                resolve({
                    stdout: stdout ?? "",
                    stderr: stderr ?? (error?.message ?? ""),
                    exitCode: error?.code != null ? Number(error.code) : (error ? 1 : 0),
                });
            });
        });
    });

    // Letta CLI: spawn-based streaming
    ipcMain.handle("start-letta-cli-stream", (_event, args: string[]): { processId: string } => {
        const processId = randomUUID();

        if (!localCli) {
            mainWindow?.webContents.send("letta-cli-output", {
                processId,
                type: "stderr",
                data: "letta CLI not found. Check installation.",
            });
            mainWindow?.webContents.send("letta-cli-output", { processId, type: "end", exitCode: 1 });
            return { processId };
        }

        const child = spawn("node", [localCli, ...args], {
            env: {
                ...process.env,
                CI: "true",
                NO_COLOR: "1",
                FORCE_COLOR: "0",
                NO_UPDATE_NOTIFIER: "1",
                TERM: "dumb",
            },
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        lettaCliProcesses.set(processId, child);

        const send = (type: string, data?: string, exitCode?: number) => {
            mainWindow?.webContents.send("letta-cli-output", { processId, type, data, exitCode });
        };

        child.stdout.on("data", (chunk: Buffer) => send("stdout", chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => send("stderr", chunk.toString()));
        child.on("close", (code) => {
            lettaCliProcesses.delete(processId);
            send("end", undefined, code ?? 0);
        });
        child.on("error", (err) => {
            lettaCliProcesses.delete(processId);
            send("stderr", `Process error: ${err.message}`);
            send("end", undefined, 1);
        });

        return { processId };
    });

    // Letta CLI: kill a running stream process
    ipcMain.handle("kill-letta-cli", (_event, processId: string): void => {
        const child = lettaCliProcesses.get(processId);
        if (child) {
            child.kill("SIGTERM");
            lettaCliProcesses.delete(processId);
        }
    });

    // Download skills from GitHub
    ipcMain.handle("download-skill", async (event, handles: string | string[], skillName?: string, branch?: string) => {
        const dirs = await downloadSkillsFromGitHub(handles, skillName, branch);
        return { success: true, skillDirs: dirs };
    });

    // List installed skills from ~/.letta/skills
    ipcMain.handle("list-skills", async () => {
        const { readdir, readFile, stat } = await import("fs/promises");
        const { join } = await import("path");
        const skillsDir = join(process.env.HOME || process.env.USERPROFILE || "~", ".letta/skills");
        try {
            const entries = await readdir(skillsDir, { withFileTypes: true });
            const skills = await Promise.all(
                entries
                    .filter((e) => e.isDirectory())
                    .map(async (dir) => {
                        const skillMdPath = join(skillsDir, dir.name, "SKILL.md");
                        let description = "";
                        let name = dir.name;
                        try {
                            const content = await readFile(skillMdPath, "utf-8");
                            // Parse frontmatter: ---\nname: ...\ndescription: ...\n---
                            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
                            if (fmMatch) {
                                const fm = fmMatch[1];
                                const nameMatch = fm.match(/^name:\s*(.+)$/m);
                                const descMatch = fm.match(/^description:\s*(.+)$/m);
                                if (nameMatch) name = nameMatch[1].trim();
                                if (descMatch) description = descMatch[1].trim();
                            } else {
                                // No frontmatter — use first line as description
                                description = content.split("\n").find((l) => l.trim()) || "";
                            }
                        } catch { /* no SKILL.md */ }
                        // Get mtime for sorting
                        let updatedAt = 0;
                        try {
                            const s = await stat(join(skillsDir, dir.name));
                            updatedAt = s.mtimeMs;
                        } catch { /* ignore */ }
                        return { id: dir.name, name, description, folder: dir.name, updatedAt };
                    })
            );
            return { success: true, skills: skills.sort((a, b) => b.updatedAt - a.updatedAt) };
        } catch {
            return { success: true, skills: [] };
        }
    });

    // Register domain-specific handlers
    registerChannelHandlers();
    registerEmailHandlers();
    registerAttachmentHandlers();
    registerSchedulerHandlers();
}

/**
 * Start polling resources to the main window
 */
export function startResourcePolling(mainWindow: BrowserWindow): void {
    pollResources(mainWindow);
}
