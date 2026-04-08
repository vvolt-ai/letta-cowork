/**
 * Electron Main Process Entry Point
 * Initializes the application and wires together all components
 */

import { app } from "electron";
import path from "path";

// Initialize environment before importing other modules
import { initializeLettaEnv } from "../services/env/index.js";
initializeLettaEnv();

// PATH fix: ensure common tool dirs are reachable inside packaged Electron
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

// Determine Letta CLI path
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

console.log("cliPath", localCli);

// Find letta CLI
try {
    if (localCli) {
        process.env.LETTA_CLI_PATH = localCli;
        console.log("Found letta CLI at:", localCli);
    }
} catch (e) {
    console.warn("Could not find letta CLI:", e);
}

// Import modular components
import { createMainWindow, setMainWindow } from "./window.js";
import { setupLifecycleHandlers, registerGlobalShortcuts } from "./lifecycle.js";
import { setupMenu } from "./menu.js";
import { registerAllIpcHandlers, startResourcePolling, initializeBridges } from "../ipc/index.js";
import { expressServer } from "../emails/express/index.js";
import { initializeApiIpcHandlers, setupApiStatusBridge } from "../ipc/handlers/api-handlers.js";
import { installRequiredSkills } from "../services/skillInstaller.js";

/**
 * Initialize the application when ready
 */
app.on("ready", () => {
    // Install required skills on startup
    void installRequiredSkills();

    // Setup menu (hide default menu bar)
    setupMenu();

    // Setup lifecycle event handlers
    setupLifecycleHandlers();

    // Create main window
    const mainWindow = createMainWindow();
    setMainWindow(mainWindow);

    // Register global shortcuts
    registerGlobalShortcuts();

    // Start resource polling
    startResourcePolling(mainWindow);

    // Register all IPC handlers
    registerAllIpcHandlers(mainWindow);

    // Start express server for email operations
    expressServer(mainWindow);

    // Initialize channel bridges
    void initializeBridges();

    // Initialize API IPC handlers for vera-cowork-server
    initializeApiIpcHandlers();
    setupApiStatusBridge(mainWindow);
});
