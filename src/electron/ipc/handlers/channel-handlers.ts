/**
 * Channel/Bridge IPC handlers
 * Handles WhatsApp, Telegram, Discord, Slack bridge operations
 */

import { ipcMain } from "electron";
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
} from "../../bridges/channelBridgeManager.js";
import type { ChannelBridgeConfig } from "../../bridges/channelConfig.js";

/**
 * Register channel/bridge IPC handlers
 */
export function registerChannelHandlers(): void {
    // General bridge config
    ipcMain.handle("get-channel-bridges-config", () => {
        return getBridgesConfig();
    });

    ipcMain.handle("update-channel-bridges-config", async (_, values: ChannelBridgeConfig) => {
        return updateBridgesConfig(values);
    });

    // WhatsApp bridge
    ipcMain.handle("get-whatsapp-bridge-status", () => {
        return getWhatsAppBridgeStatus();
    });

    ipcMain.handle("start-whatsapp-bridge", async () => {
        return await startWhatsAppBridge();
    });

    ipcMain.handle("stop-whatsapp-bridge", async () => {
        return await stopWhatsAppBridge();
    });

    // Telegram bridge
    ipcMain.handle("get-telegram-bridge-status", () => {
        return getTelegramBridgeStatus();
    });

    ipcMain.handle("start-telegram-bridge", async () => {
        return await startTelegramBridge();
    });

    ipcMain.handle("stop-telegram-bridge", async () => {
        return await stopTelegramBridge();
    });

    // Discord bridge
    ipcMain.handle("get-discord-bridge-status", () => {
        return getDiscordBridgeStatus();
    });

    ipcMain.handle("start-discord-bridge", async () => {
        return await startDiscordBridge();
    });

    ipcMain.handle("stop-discord-bridge", async () => {
        return await stopDiscordBridge();
    });

    // Slack bridge
    ipcMain.handle("get-slack-bridge-status", () => {
        return getSlackBridgeStatus();
    });

    ipcMain.handle("start-slack-bridge", async () => {
        return await startSlackBridge();
    });

    ipcMain.handle("stop-slack-bridge", async () => {
        return await stopSlackBridge();
    });
}

/**
 * Initialize channel bridges on app startup
 */
export async function initializeBridges(): Promise<void> {
    await initializeChannelBridges();
}
