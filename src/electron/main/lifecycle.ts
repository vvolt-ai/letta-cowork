import { execSync } from "child_process";

import { app, globalShortcut } from "electron";

import { cleanupAllSessions } from "../ipc/index.js";
import { shutdownDesktopSdkSessions } from '../libs/runner/sdk/index.js';
import { isDev, DEV_PORT } from "../utils/index.js";
import { stopPolling } from "../utils/test-helper.js";

let cleanupComplete = false;
let cleanupPromise:Promise<void>|undefined;

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
    if(cleanupPromise)return cleanupPromise;
    cleanupPromise=(async()=>{
      stopPolling();
      await cleanupAllSessions();
      await shutdownDesktopSdkSessions();
      globalShortcut.unregisterAll();
      killViteDevServer();
      cleanupComplete=true;
    })().catch(error=>{cleanupPromise=undefined;throw error;});
    return cleanupPromise;
}

/**
 * Handle termination signals
 */
export function handleSignal(): void {
    (app as unknown as { isQuitting?: boolean }).isQuitting = true;
    void cleanup().then(()=>app.quit()).catch(()=>{
      (app as unknown as {isQuitting?:boolean}).isQuitting=false;
      console.error('[lifecycle] Quit paused: owned SDK execution stop could not be verified.');
    });
}

/**
 * Setup app lifecycle event handlers
 */
export function setupLifecycleHandlers(): void {
    app.on('before-quit',event=>{
      if(cleanupComplete)return;
      event.preventDefault();
      handleSignal();
    });
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        // Keep the process alive by default so background services, bridges,
        // schedulers, and the tray/menu-bar entry continue running.
        if (process.platform !== "darwin") return;
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
        (app as unknown as { isQuitting?: boolean }).isQuitting = true;
        handleSignal();
    });
}

/**
 * Check if cleanup has already been completed
 */
export function isCleanupComplete(): boolean {
    return cleanupComplete;
}
