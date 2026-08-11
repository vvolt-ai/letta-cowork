import { type BrowserWindow, ipcMain } from "electron";

import { RemoteRunnerClient } from "./remoteRunnerClient.js";
import {
  getRemoteAccessSettings,
  updateRemoteAccessSettings,
  resetRemoteAccessSettings,
  type RemoteAccessSettings,
} from "../settings/index.js";

import type { RemoteAccessState } from "./types.js";

let client: RemoteRunnerClient | null = null;
let mainWindow: BrowserWindow | null = null;

export function initializeRemoteAccessService(window: BrowserWindow): void {
  mainWindow = window;
  const settings = getRemoteAccessSettings();
  client = new RemoteRunnerClient(settings, broadcastState);
  registerRemoteAccessIpcHandlers();
}

export function getRemoteAccessState(): RemoteAccessState {
  if (!client) {
    const settings = getRemoteAccessSettings();
    return { settings, status: settings.enabled ? "offline" : "disabled" };
  }
  return client.getState();
}

export function applyRemoteAccessSettings(updates: Partial<RemoteAccessSettings>): RemoteAccessState {
  const settings = updateRemoteAccessSettings(updates);
  if (!client) {
    client = new RemoteRunnerClient(settings, broadcastState);
  } else {
    client.updateSettings(settings);
  }
  if (settings.enabled) client.start();
  const state = client.getState();
  broadcastState(state);
  return state;
}

export function restartRemoteAccessService(): void {
  if (getRemoteAccessSettings().enabled) {
    client?.restart();
  }
}

export function stopRemoteAccessService(): void {
  client?.stop();
}

let handlersRegistered = false;
function registerRemoteAccessIpcHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("remote-access:get-state", () => getRemoteAccessState());
  ipcMain.handle("remote-access:update-settings", (_event, updates: Partial<RemoteAccessSettings>) => {
    return applyRemoteAccessSettings(updates);
  });
  ipcMain.handle("remote-access:reset-settings", () => {
    const settings = resetRemoteAccessSettings();
    client?.updateSettings(settings);
    const state = client?.getState() ?? { settings, status: "disabled" as const };
    broadcastState(state);
    return state;
  });
}

function broadcastState(state: RemoteAccessState): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("remote-access:state", state);
}
