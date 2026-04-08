/**
 * API IPC Handlers
 * 
 * Bridges Electron IPC calls to the Vera Cowork API.
 * This replaces the local channel bridge implementation with API calls.
 */

import { ipcMain } from "electron";
import {
  getVeraCoworkApiClient,
  setVeraCoworkApiUrl,
  setAuthExpiredCallback,
  type Channel,
  type ChannelRuntimeStatus,
  type AuthTokens,
} from "../../api/index.js";

// Types for IPC events
export interface ApiConfig {
  apiUrl: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface CreateChannelData {
  provider: "whatsapp" | "telegram" | "discord" | "slack" | "email" | "custom";
  name: string;
  externalId?: string;
  config?: Record<string, unknown>;
}

export interface ChannelCredentialsData {
  credentials: Record<string, string>;
  secureConfig?: Record<string, unknown>;
}

// Store current API URL
let currentApiUrl = process.env.VERA_COWORK_API_URL || "https://vera-cowork-server.ngrok.app";

/**
 * Initialize API IPC handlers.
 */
export function initializeApiIpcHandlers(): void {
  const api = getVeraCoworkApiClient();

  // ============================================
  // Configuration
  // ============================================

  ipcMain.handle("api:set-url", async (_, url: string) => {
    currentApiUrl = url;
    setVeraCoworkApiUrl(url);
    return { success: true, url };
  });

  ipcMain.handle("api:get-url", async () => {
    return currentApiUrl;
  });

  // ============================================
  // Authentication
  // ============================================

  ipcMain.handle("api:is-authenticated", async () => {
    const result = api.isAuthenticated();
    console.log('[API IPC] is-authenticated:', result);
    return result;
  });

  ipcMain.handle("api:get-current-user", async () => {
    console.log('[API IPC] get-current-user:', api.currentUser?.email);
    return api.currentUser;
  });

  ipcMain.handle("api:login", async (_, credentials: LoginCredentials) => {
    console.log('[API IPC] login attempt for:', credentials.email);
    try {
      const tokens = await api.login(credentials.email, credentials.password);
      console.log('[API IPC] login successful, user:', tokens.user?.email);
      return { success: true, user: tokens.user };
    } catch (error) {
      console.error('[API IPC] login failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:register", async (_, data: RegisterData) => {
    console.log('[API IPC] register attempt for:', data.email);
    try {
      const tokens = await api.register(data);
      console.log('[API IPC] register successful, user:', tokens.user?.email);
      return { success: true, user: tokens.user };
    } catch (error) {
      console.error('[API IPC] register failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:logout", async () => {
    try {
      await api.logout();
      return { success: true };
    } catch (error) {
      // Clear tokens anyway
      api.clearTokens();
      return { success: true };
    }
  });

  // ============================================
  // Channels
  // ============================================

  ipcMain.handle("api:list-channels", async () => {
    console.log('[API IPC] list-channels');
    try {
      const channels = await api.listChannels();
      console.log('[API IPC] list-channels result:', channels?.length, 'channels');
      return { success: true, channels };
    } catch (error) {
      console.error('[API IPC] list-channels failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:create-channel", async (_, data: CreateChannelData) => {
    console.log('[API IPC] create-channel:', data.provider, data.name);
    try {
      const channel = await api.createChannel(data);
      console.log('[API IPC] create-channel success:', channel.id);
      return { success: true, channel };
    } catch (error) {
      console.error('[API IPC] create-channel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:get-channel", async (_, channelId: string) => {
    console.log('[API IPC] get-channel:', channelId.slice(0, 8));
    try {
      const channel = await api.getChannel(channelId);
      return { success: true, channel };
    } catch (error) {
      console.error('[API IPC] get-channel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:delete-channel", async (_, channelId: string) => {
    console.log('[API IPC] delete-channel:', channelId.slice(0, 8));
    try {
      await api.deleteChannel(channelId);
      console.log('[API IPC] delete-channel success');
      return { success: true };
    } catch (error) {
      console.error('[API IPC] delete-channel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============================================
  // Channel Credentials
  // ============================================

  ipcMain.handle("api:get-channel-credentials", async (_, channelId: string) => {
    console.log('[API IPC] get-channel-credentials:', channelId.slice(0, 8));
    try {
      const result = await api.getChannelCredentials(channelId);
      return { success: true, ...result };
    } catch (error) {
      console.error('[API IPC] get-channel-credentials failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:set-channel-credentials", async (_, channelId: string, data: ChannelCredentialsData) => {
    console.log('[API IPC] set-channel-credentials:', channelId.slice(0, 8), 'keys:', Object.keys(data.credentials || {}));
    try {
      const result = await api.setChannelCredentials(channelId, data);
      console.log('[API IPC] set-channel-credentials success');
      return { success: true, ...result };
    } catch (error) {
      console.error('[API IPC] set-channel-credentials failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:delete-channel-credentials", async (_, channelId: string) => {
    console.log('[API IPC] delete-channel-credentials:', channelId.slice(0, 8));
    try {
      await api.deleteChannelCredentials(channelId);
      return { success: true };
    } catch (error) {
      console.error('[API IPC] delete-channel-credentials failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:update-channel-config", async (_, channelId: string, config: Record<string, any>) => {
    console.log('[API IPC] update-channel-config:', channelId.slice(0, 8), config);
    try {
      const channel = await api.updateChannelConfig(channelId, config);
      console.log('[API IPC] update-channel-config success');
      return { success: true, channel };
    } catch (error) {
      console.error('[API IPC] update-channel-config failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============================================
  // Channel Runtime
  // ============================================

  ipcMain.handle("api:start-channel", async (_, channelId: string) => {
    console.log('[API IPC] start-channel:', channelId.slice(0, 8));
    try {
      const status = await api.startChannel(channelId);
      console.log('[API IPC] start-channel result:', status?.status);
      return { success: true, status };
    } catch (error) {
      console.error('[API IPC] start-channel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:stop-channel", async (_, channelId: string) => {
    console.log('[API IPC] stop-channel:', channelId.slice(0, 8));
    try {
      const status = await api.stopChannel(channelId);
      console.log('[API IPC] stop-channel result:', status?.status);
      return { success: true, status };
    } catch (error) {
      console.error('[API IPC] stop-channel failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:get-channel-status", async (_, channelId: string) => {
    try {
      const status = await api.getChannelStatus(channelId);
      return { success: true, status };
    } catch (error) {
      console.error('[API IPC] get-channel-status failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:get-all-runtime-status", async () => {
    console.log('[API IPC] get-all-runtime-status');
    try {
      const result = await api.getAllRuntimeStatus();
      console.log('[API IPC] get-all-runtime-status result:', result?.channels?.length, 'channels');
      return { success: true, ...result };
    } catch (error) {
      console.error('[API IPC] get-all-runtime-status failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============================================
  // Messages
  // ============================================

  ipcMain.handle("api:get-message-logs", async (_, channelId: string, options?: {
    direction?: "inbound" | "outbound";
    limit?: number;
    offset?: number;
  }) => {
    try {
      const result = await api.getMessageLogs(channelId, options);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:send-message", async (_, channelId: string, to: string, content: string) => {
    try {
      const result = await api.sendMessage(channelId, to, content);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============================================
  // Conversation Context
  // ============================================

  ipcMain.handle("api:get-conversation-context", async (_, channelId: string, options?: {
    limit?: number;
    since?: string;
  }) => {
    try {
      const context = await api.getConversationContext(channelId, options);
      return { success: true, context };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("api:get-group-conversation-context", async (_, channelId: string, groupId: string, options?: {
    limit?: number;
    since?: string;
  }) => {
    try {
      const context = await api.getGroupConversationContext(channelId, groupId, options);
      return { success: true, context };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  console.log("API IPC handlers initialized");
}

/**
 * Bridge status emitter - forwards API status to renderer.
 * This replaces the local bridge status emitter.
 */
export function setupApiStatusBridge(mainWindow: Electron.BrowserWindow): void {
  const api = getVeraCoworkApiClient();

  // Set up auth expired callback to redirect to login
  setAuthExpiredCallback(() => {
    console.log('[API] Auth expired, sending event to renderer');
    mainWindow.webContents.send("auth-expired");
  });

  // Poll for status updates
  const pollInterval = setInterval(async () => {
    if (!api.isAuthenticated()) {
      return;
    }

    try {
      // Use request() directly with suppressAuthExpired so a transient 401
      // from polling never clears the session token and logs the user out.
      const result = await api.request<{ channels: unknown[]; count: number }>(
        "/channels/runtime/status",
        { suppressAuthExpired: true }
      );
      const event = {
        type: "api-runtime-status",
        payload: result,
      };
      mainWindow.webContents.send("server-event", JSON.stringify(event));
    } catch (error) {
      // Ignore polling errors silently
    }
  }, 2000);

  // Cleanup on window close
  mainWindow.on("closed", () => {
    clearInterval(pollInterval);
  });
}
