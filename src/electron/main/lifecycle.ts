import { app, globalShortcut } from "electron";
import { execSync } from "child_process";
import { isDev, DEV_PORT } from "../utils/index.js";
import { stopPolling } from "../utils/test-helper.js";
import { cleanupAllSessions } from "../ipc/index.js";

let cleanupComplete = false;

/**
 * Kill the Vite dev server if running
 */
export function killViteDevServer(): void {
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

/**
 * Cleanup function to run on app quit
 */
export async function cleanup(): Promise<void> {
    if (cleanupComplete) return;
    cleanupComplete = true;

    globalShortcut.unregisterAll();
    stopPolling();
    await cleanupAllSessions();
    killViteDevServer();
}

/**
 * Handle termination signals
 */
export function handleSignal(): void {
    cleanup();
    app.quit();
}

/**
 * Setup app lifecycle event handlers
 */
export function setupLifecycleHandlers(): void {
    app.on("before-quit", cleanup);
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        cleanup();
        app.quit();
    });

    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
    process.on("SIGHUP", handleSignal);
}

/**
 * Register global keyboard shortcuts
 */
export function registerGlobalShortcuts(): void {
    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });
}

/**
 * Check if cleanup has already been completed
 */
export function isCleanupComplete(): boolean {
    return cleanupComplete;
}
