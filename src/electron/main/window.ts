import { BrowserWindow, nativeImage } from "electron";
import { getPreloadPath, getUIPath, getIconPath } from "../utils/path-resolver.js";
import { isDev, DEV_PORT } from "../utils/index.js";

let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
export function createMainWindow(): BrowserWindow {
    const iconPath = getIconPath();
    const appIcon = nativeImage.createFromPath(iconPath);

    if (appIcon.isEmpty()) {
        console.warn(`App icon not found at ${iconPath}`);
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
            backgroundThrottling: false,
            webviewTag: true,
        },
        icon: appIcon.isEmpty() ? undefined : appIcon,
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    // Load the UI
    if (isDev()) {
        mainWindow.loadURL(`http://localhost:${DEV_PORT}`);
    } else {
        mainWindow.loadFile(getUIPath());
    }

    return mainWindow;
}

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
    return mainWindow;
}

/**
 * Set the main window reference
 */
export function setMainWindow(window: BrowserWindow | null): void {
    mainWindow = window;
}

/**
 * Send a message to the main window's web contents
 */
export function sendToMainWindow(channel: string, ...args: unknown[]): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}

/**
 * Broadcast an event to all windows
 */
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, ...args);
        }
    }
}
