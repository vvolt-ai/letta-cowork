import { Menu } from "electron";

/**
 * Setup the application menu
 * Currently sets the menu to null to hide the default menu bar
 */
export function setupMenu(): void {
    Menu.setApplicationMenu(null);
}

/**
 * Create a custom application menu (for future use)
 * @param template - Electron menu template
 */
export function createCustomMenu(template: Electron.MenuItemConstructorOptions[]): void {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
