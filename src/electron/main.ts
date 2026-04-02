import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, shell, nativeImage } from "electron"
import { execSync, exec, spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getLettaEnvConfig, initializeLettaEnv, type LettaEnvConfig, updateLettaEnvConfig } from "./envManager.js";
import {
    getCoworkSettings,
    updateCoworkSettings,
    resetCoworkSettings,
    getAutoSyncUnreadConfig,
    updateAutoSyncUnreadConfig,
    resetAutoSyncUnreadConfig,
    getProcessedUnreadEmailIds,
    setProcessedUnreadEmailIds,
    clearProcessedUnreadEmailIds,
    getProcessedUnreadEmailDebugInfo,
    type AutoSyncUnreadConfig,
    type CoworkSettings,
} from "./settings.js";
import { initializeApiIpcHandlers, setupApiStatusBridge } from "./apiIpcHandlers.js";

initializeLettaEnv();

// ── PATH fix: ensure common tool dirs are reachable inside packaged Electron ──
(function fixPath() {
    const extra = [
        "/usr/local/bin",
        "/usr/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/sbin",
    ];
    const current = process.env.PATH ?? "";
    for (const p of extra) {
        if (!current.split(":").includes(p)) {
            process.env.PATH = `${current}:${p}`;
        }
    }
})();

// ── Letta CLI streaming process registry ─────────────────────────────────────
const lettaCliProcesses = new Map<string, ChildProcess>();

// ── Ensure acquiring-skills is always installed ───────────────────────────────
async function ensureAcquiringSkillInstalled(): Promise<void> {
    const globalSkillsDir = path.join(homedir(), ".letta", "skills");
    const targetDir = path.join(globalSkillsDir, "acquiring-skills");
    const targetFile = path.join(targetDir, "SKILL.md");

    // Already installed — nothing to do
    try {
        await fs.access(targetFile);
        console.log("[skills] acquiring-skills already installed at", targetDir);
        return;
    } catch {
        // Not found — continue to install
    }

    // Resolve source from node_modules (works in both dev and packaged builds)
    const sourceDir = isDevelopment
        ? path.join(process.cwd(), "node_modules", "@letta-ai", "letta-code", "skills", "acquiring-skills")
        : path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@letta-ai", "letta-code", "skills", "acquiring-skills");

    try {
        // Ensure target directory exists
        await fs.mkdir(targetDir, { recursive: true });

        // Copy all files from source to target
        const entries = await fs.readdir(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile()) {
                const src = path.join(sourceDir, entry.name);
                const dst = path.join(targetDir, entry.name);
                await fs.copyFile(src, dst);
            }
        }
        console.log("[skills] acquiring-skills installed at", targetDir);
    } catch (err) {
        console.warn("[skills] Failed to install acquiring-skills:", err);
    }
}

const isDevelopment = !app.isPackaged;
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


console.log("cliPath", localCli)

async function listAgentMemoryFiles() {
    const resolvedAgentId = getCurrentAgentId() || process.env.LETTA_AGENT_ID;
    const memoryDir = process.env.MEMORY_DIR
        || (resolvedAgentId ? path.join(homedir(), ".letta", "agents", resolvedAgentId, "memory") : "");

    if (!memoryDir) {
        throw new Error("Unable to resolve agent memory directory: no MEMORY_DIR and no active agent ID.");
    }

    try {
        await fs.access(memoryDir);
    } catch {
        throw new Error(`Agent memory directory is not accessible: ${memoryDir}${resolvedAgentId ? ` (agent: ${resolvedAgentId})` : ""}`);
    }

    const results: Array<{ path: string; description?: string; preview: string; category: "system" | "reference" | "other" }> = [];

    const walk = async (currentDir: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(absolutePath);
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

            const relativePath = path.relative(memoryDir, absolutePath).replace(/\\/g, "/");
            const content = await fs.readFile(absolutePath, "utf8");
            const descriptionMatch = content.match(/^---[\s\S]*?^description:\s*(.+)$[\s\S]*?^---/m);
            const body = content.replace(/^---[\s\S]*?---\s*/m, "").trim();
            const preview = body.slice(0, 280);
            const category = relativePath.startsWith("system/")
                ? "system"
                : relativePath.startsWith("reference/")
                    ? "reference"
                    : "other";

            results.push({
                path: relativePath,
                description: descriptionMatch?.[1]?.trim(),
                preview,
                category,
            });
        }
    };

    await walk(memoryDir);
    return results.sort((a, b) => a.path.localeCompare(b.path));
}

// Find letta CLI
try {
    if (localCli) {
        process.env.LETTA_CLI_PATH = localCli;
        console.log("Found letta CLI at:", localCli);
    }
} catch (e) {
    console.warn("Could not find letta CLI:", e);
}
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import { handleClientEvent, cleanupAllSessions, recoverPendingApprovalsForSession, cancelRecoveredRun } from "./ipc-handlers.js";
import { registerLettaCodeTools, attachLettaCodeToolsToAgent, listRegisteredLettaCodeTools } from "./lettaCodeTools.js";
import { getCurrentAgentId } from "./libs/runner.js";
import type { ClientEvent } from "./types.js";
import { checkAlreadyConnected, connectEmail, disconnectEmail, fetchEmailById, fetchEmailDetails, fetchEmails, fetchFolders, downloadEmailAttachment, fetchAccounts, updateMessages, searchEmails, uploadEmailAttachmentToAgent } from "./emails/fetchEmails.js";
import { expressServer } from "./emails/express.js";
import { downloadSkillsFromGitHub, GLOBAL_SKILLS_DIR2 } from "./skillDownloader.js";
import { getLettaAgent, listLettaAgents, listLettaModels, retrieveAgentRunById } from "./lettaAgents.js";
import {
    getBridgesConfig,
    getWhatsAppBridgeStatus,
    getTelegramBridgeStatus,
    getDiscordBridgeStatus,
    getSlackBridgeStatus,
    initializeChannelBridges,
    startWhatsAppBridge,
    stopWhatsAppBridge,
    startTelegramBridge,
    stopTelegramBridge,
    startDiscordBridge,
    stopDiscordBridge,
    startSlackBridge,
    stopSlackBridge,
    updateBridgesConfig,
} from "./bridges/channelBridgeManager.js";
import type { ChannelBridgeConfig } from "./bridges/channelConfig.js";

let cleanupComplete = false;
let mainWindow: BrowserWindow | null = null;

function killViteDevServer(): void {
    if (!isDev()) return;
    try {
        if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${DEV_PORT}') do taskkill /PID %a /F`, { stdio: 'ignore', shell: 'cmd.exe' });
        } else {
            execSync(`lsof -ti:${DEV_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch {
        // Process may already be dead
    }
}

async function cleanup(): Promise<void> {
    if (cleanupComplete) return;
    cleanupComplete = true;

    globalShortcut.unregisterAll();
    stopPolling();
    await cleanupAllSessions();
    killViteDevServer();
}

function handleSignal(): void {
    cleanup();
    app.quit();
}

// Initialize everything when app is ready
app.on("ready", () => {
    // Ensure acquiring-skills is present so the agent can discover all other skills
    void ensureAcquiringSkillInstalled();

    Menu.setApplicationMenu(null);
    // Setup event handlers
    app.on("before-quit", cleanup);
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        cleanup();
        app.quit();
    });

    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
    process.on("SIGHUP", handleSignal);

    const iconPath = getIconPath();
    const appIcon = nativeImage.createFromPath(iconPath);

    if (appIcon.isEmpty()) {
        console.warn(`App icon not found at ${iconPath}`);
    } else if (process.platform === "darwin" && app.dock) {
        app.dock.setIcon(appIcon);
    }

    // Create main window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
            backgroundThrottling: false,
        },
        icon: appIcon.isEmpty() ? undefined : appIcon,
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    if (isDev()) mainWindow.loadURL(`http://localhost:${DEV_PORT}`)
    else mainWindow.loadFile(getUIPath());

    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle client events
    ipcMain.on("client-event", (_: Electron.IpcMainEvent, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle recent cwds request (simplified - no local storage)
    ipcMainHandle("get-recent-cwds", () => {
        return [process.cwd()]; // Just return current directory
    });

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

    ipcMain.handle("fetch-folders", async () => {
        return await fetchFolders();
    });

    ipcMain.handle("fetch-accounts", async () => {
        return await fetchAccounts();
    });

    ipcMain.handle("fetch-emails", async (event, accountId, params) => {
        return await fetchEmails(accountId, params);
    });

    ipcMain.handle("connect-email", connectEmail)
    ipcMain.handle("disconnect-email", disconnectEmail)

    ipcMain.handle("is-email-already-connected", checkAlreadyConnected)


    ipcMain.handle("fetch-email-by-id", async (event, accountId, folderId, messageId) => {
        return await fetchEmailById(messageId, accountId, folderId);
    });

    ipcMain.handle("fetch-email-details", async (event, accountId, folderId, messageId) => {
        return await fetchEmailDetails(messageId, accountId, folderId);
    });

    ipcMain.handle("upload-email-attachment-to-agent", async (event, folderId, messageId, accountId, agentId) => {
        const targetAgentId = agentId || getCurrentAgentId() || process.env.LETTA_AGENT_ID;
        return await uploadEmailAttachmentToAgent(folderId, messageId, accountId, targetAgentId);
    });

    // handler for downloading email attachments
    ipcMain.handle("download-email-attachment", async (event, folderId, messageId, accountId) => {
        const activeAgentId = getCurrentAgentId() || process.env.LETTA_AGENT_ID;
        return await downloadEmailAttachment(folderId, messageId, accountId, activeAgentId);
    });

    // mark messages read/unread
    ipcMain.handle("update-messages", async (event, accountId, body) => {
        return await updateMessages(accountId, body);
    });

    // search emails
    ipcMain.handle("search-emails", async (event, accountId, params) => {
        return await searchEmails(accountId, params);
    });

    ipcMain.handle("get-letta-env", () => {
        return getLettaEnvConfig();
    });

    ipcMain.handle("is-admin", () => {
        return process.env.IS_ADMIN === "true";
    });

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

    ipcMain.handle("recover-pending-approvals", async (_, sessionId: string, agentId?: string) => {
        return await recoverPendingApprovalsForSession(sessionId, agentId);
    });

    ipcMain.handle("cancel-stuck-run", async (_, runId: string) => {
        return await cancelRecoveredRun(runId);
    });

    ipcMain.handle("get-run-status", async (_, runId: string) => {
        return await retrieveAgentRunById(runId);
    });

    ipcMain.handle("list-agent-memory-files", async () => {
        try {
            return await listAgentMemoryFiles();
        } catch (error) {
            console.error("Failed to list agent memory files:", error);
            throw error;
        }
    });

    ipcMain.handle("update-letta-env", async (_, values: LettaEnvConfig) => {
        try {
            updateLettaEnvConfig(values);
            return { success: true };
        } catch (error) {
            console.error("Failed to update Letta env:", error);
            throw new Error("Failed to persist environment variables on this system.");
        }
    });

    ipcMain.handle("get-channel-bridges-config", () => {
        return getBridgesConfig();
    });

    ipcMain.handle("update-channel-bridges-config", async (_, values: ChannelBridgeConfig) => {
        return updateBridgesConfig(values);
    });

    ipcMain.handle("get-whatsapp-bridge-status", () => {
        return getWhatsAppBridgeStatus();
    });

    ipcMain.handle("start-whatsapp-bridge", async () => {
        return await startWhatsAppBridge();
    });

    ipcMain.handle("stop-whatsapp-bridge", async () => {
        return await stopWhatsAppBridge();
    });

    ipcMain.handle("get-telegram-bridge-status", () => {
        return getTelegramBridgeStatus();
    });

    ipcMain.handle("start-telegram-bridge", async () => {
        return await startTelegramBridge();
    });

    ipcMain.handle("stop-telegram-bridge", async () => {
        return await stopTelegramBridge();
    });

    ipcMain.handle("get-discord-bridge-status", () => {
        return getDiscordBridgeStatus();
    });

    ipcMain.handle("start-discord-bridge", async () => {
        return await startDiscordBridge();
    });

    ipcMain.handle("stop-discord-bridge", async () => {
        return await stopDiscordBridge();
    });

    ipcMain.handle("get-slack-bridge-status", () => {
        return getSlackBridgeStatus();
    });

    ipcMain.handle("start-slack-bridge", async () => {
        return await startSlackBridge();
    });

    ipcMain.handle("stop-slack-bridge", async () => {
        return await stopSlackBridge();
    });

    // download one or more skills from GitHub; stores files under GLOBAL_SKILLS_DIR2/<skillName>
    ipcMain.handle("download-skill", async (event, handles: string | string[], skillName?: string, branch?: string) => {
        const dirs = await downloadSkillsFromGitHub(handles, skillName, branch);
        return { success: true, skillDirs: dirs };
    });

    // Cowork settings handlers
    ipcMain.handle("get-cowork-settings", (): CoworkSettings => {
        return getCoworkSettings();
    });

    ipcMain.handle("update-cowork-settings", (_, updates: Partial<CoworkSettings>): CoworkSettings => {
        return updateCoworkSettings(updates);
    });

    ipcMain.handle("reset-cowork-settings", (): CoworkSettings => {
        return resetCoworkSettings();
    });

    ipcMain.handle("get-auto-sync-unread-config", async (): Promise<AutoSyncUnreadConfig> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { getEmailConfigFromServer } = await import("./apiClient.js");
            const config = await getEmailConfigFromServer();
            console.log('[Email Config] Loaded from server:', config);
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch (error) {
            console.warn('[Email Config] Server failed, using local storage:', error);
            return getAutoSyncUnreadConfig();
        }
    });

    ipcMain.handle("update-auto-sync-unread-config", async (_, updates: Partial<AutoSyncUnreadConfig>): Promise<AutoSyncUnreadConfig> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { updateEmailConfigOnServer } = await import("./apiClient.js");
            const config = await updateEmailConfigOnServer(updates);
            console.log('[Email Config] Saved to server:', config);
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch (error) {
            console.warn('[Email Config] Server failed, using local storage:', error);
            return updateAutoSyncUnreadConfig(updates);
        }
    });

    ipcMain.handle("reset-auto-sync-unread-config", async (): Promise<AutoSyncUnreadConfig> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { updateEmailConfigOnServer } = await import("./apiClient.js");
            const config = await updateEmailConfigOnServer({
                enabled: false,
                agentIds: [],
                routingRules: [],
                sinceDate: '',
                processingMode: 'unread_only',
                markAsReadAfterProcess: true,
            });
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch {
            return resetAutoSyncUnreadConfig();
        }
    });

    ipcMain.handle("get-processed-unread-email-ids", async (_, accountId: string, folderId: string): Promise<string[]> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { getProcessedEmailIdsFromServer, getVeraCoworkApiClient } = await import("./apiClient.js");
            const api = getVeraCoworkApiClient();
            if (!api.isAuthenticated()) {
                console.warn(`[Processed IDs] Not authenticated with API, using local storage`);
                return getProcessedUnreadEmailIds(accountId, folderId);
            }
            const ids = await getProcessedEmailIdsFromServer(accountId, folderId);
            console.log(`[Processed IDs] Loaded ${ids.length} from server for ${accountId}/${folderId}`);
            return ids;
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            return getProcessedUnreadEmailIds(accountId, folderId);
        }
    });

    ipcMain.handle("set-processed-unread-email-ids", async (_, accountId: string, folderId: string, ids: string[]): Promise<string[]> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { setProcessedEmailIdsToServer, getVeraCoworkApiClient } = await import("./apiClient.js");
            const api = getVeraCoworkApiClient();
            if (!api.isAuthenticated()) {
                console.warn(`[Processed IDs] Not authenticated with API, using local storage`);
                return setProcessedUnreadEmailIds(accountId, folderId, ids);
            }
            await setProcessedEmailIdsToServer(accountId, folderId, ids);
            console.log(`[Processed IDs] Saved ${ids.length} to server for ${accountId}/${folderId}`);
            return ids;
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            return setProcessedUnreadEmailIds(accountId, folderId, ids);
        }
    });

    ipcMain.handle("clear-processed-unread-email-ids", async (_, accountId: string, folderId: string): Promise<void> => {
        // Try server first, fall back to local if not authenticated
        try {
            const { clearProcessedEmailIdsOnServer } = await import("./apiClient.js");
            await clearProcessedEmailIdsOnServer(accountId, folderId);
            console.log(`[Processed IDs] Cleared on server for ${accountId}/${folderId}`);
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            clearProcessedUnreadEmailIds(accountId, folderId);
        }
    });

    ipcMain.handle("update-email-conversation-id", async (_, accountId: string, folderId: string, messageId: string, conversationId: string, agentId?: string): Promise<void> => {
        console.log(`[Conversation ID] IPC called with:`, { accountId, folderId, messageId, conversationId, agentId });
        try {
            const { markEmailAsProcessedOnServer, getVeraCoworkApiClient } = await import("./apiClient.js");
            const api = getVeraCoworkApiClient();
            console.log(`[Conversation ID] API authenticated:`, api.isAuthenticated());
            if (!api.isAuthenticated()) {
                console.warn(`[Conversation ID] Not authenticated with API`);
                return;
            }
            await markEmailAsProcessedOnServer(accountId, folderId, messageId, conversationId, agentId);
            console.log(`[Conversation ID] Updated ${messageId} with conversation ${conversationId}`);
        } catch (error) {
            console.warn(`[Conversation ID] Failed to update:`, error);
        }
    });

    ipcMain.handle("get-processed-unread-email-debug-info", (_, accountId: string, folderId: string, limit?: number) => {
        return getProcessedUnreadEmailDebugInfo(accountId, folderId, limit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // ── Letta-Code Tools: register / attach / list ───────────────────────────
    ipcMain.handle("register-letta-code-tools", async (_event, overwrite: boolean = true) => {
        return await registerLettaCodeTools(overwrite);
    });

    ipcMain.handle("attach-letta-code-tools", async (_event, agentId: string) => {
        return await attachLettaCodeToolsToAgent(agentId);
    });

    ipcMain.handle("list-letta-code-tools", async () => {
        return await listRegisteredLettaCodeTools();
    });

    // ── Letta CLI: exec-based (returns full output) ──────────────────────────
    ipcMain.handle("run-letta-cli", async (_event, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        return new Promise((resolve) => {
            if (!localCli) {
                resolve({ stdout: "", stderr: "letta CLI not found", exitCode: 1 });
                return;
            }
            const cmd = `"${process.execPath}" "${localCli}" ${args.map((a) => JSON.stringify(a)).join(" ")}`;
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

    // ── Letta CLI: spawn-based streaming ─────────────────────────────────────
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

        const child = spawn(process.execPath, [localCli, ...args], {
            env: {
                ...process.env,
                // Force line-buffered, non-interactive, no-color output
                CI: "true",
                NO_COLOR: "1",
                FORCE_COLOR: "0",
                NO_UPDATE_NOTIFIER: "1",
                // Disable any TTY-dependent readline/spinner behaviour
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

    // ── Letta CLI: kill a running stream process ─────────────────────────────
    ipcMain.handle("kill-letta-cli", (_event, processId: string): void => {
        const child = lettaCliProcesses.get(processId);
        if (child) {
            child.kill("SIGTERM");
            lettaCliProcesses.delete(processId);
        }
    });

    expressServer(mainWindow)
    void initializeChannelBridges();
    
    // Initialize API IPC handlers for vera-cowork-server
    initializeApiIpcHandlers();
    setupApiStatusBridge(mainWindow);
})
