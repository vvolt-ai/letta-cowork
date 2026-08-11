import { app, Menu, nativeImage, Tray } from "electron";

import { getMainWindow } from "./window.js";
import { getIconPath } from "../utils/path-resolver.js";

let tray: Tray | null = null;

function showMainWindow(): void {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

export function setupTray(): Tray {
    if (tray) return tray;

    const icon = nativeImage.createFromPath(getIconPath());
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }));
    tray.setToolTip("Vera Cowork");
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: "Show Vera Cowork",
                click: showMainWindow,
            },
            { type: "separator" },
            {
                label: "Quit",
                click: () => {
                    (app as unknown as { isQuitting?: boolean }).isQuitting = true;
                    app.quit();
                },
            },
        ]),
    );
    tray.on("click", showMainWindow);

    return tray;
}
