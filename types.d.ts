type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

type UnsubscribeFunction = () => void;
type LettaEnvConfig = {
    LETTA_API_KEY: string;
    LETTA_BASE_URL: string;
    LETTA_AGENT_ID: string;
}

type WhatsAppBridgeConfig = {
    enabled: boolean;
    selfChatMode: boolean;
    autoStart: boolean;
    respondToGroups: boolean;
    respondOnlyWhenMentioned: boolean;
    sessionPath: string;
    allowedUsers: string[];
    defaultAgentId: string;
    typingIndicator: boolean;
}

type TelegramBridgeConfig = {
    enabled: boolean;
    autoStart: boolean;
    botToken: string;
    respondToGroups: boolean;
    respondOnlyWhenMentioned: boolean;
    allowedUsers: string[];
    defaultAgentId: string;
    typingIndicator: boolean;
}

type PlaceholderChannelConfig = {
    enabled: boolean;
    botName: string;
    defaultAgentId: string;
    webhookUrl: string;
    token: string;
    signingSecret: string;
    extra: string;
}

type DiscordBridgeConfig = {
    enabled: boolean;
    autoStart: boolean;
    botToken: string;
    dmPolicy: "pairing" | "allowlist" | "open";
    respondToGroups: boolean;
    allowedUsers: string[];
    defaultAgentId: string;
    typingIndicator: boolean;
    groups: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
}

type SlackBridgeConfig = {
    enabled: boolean;
    autoStart: boolean;
    botToken: string;
    appToken: string;
    dmPolicy: "pairing" | "allowlist" | "open";
    respondToChannels: boolean;
    allowedUsers: string[];
    defaultAgentId: string;
    typingIndicator: boolean;
    channels: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
}

type ChannelBridgeConfig = {
    whatsapp: WhatsAppBridgeConfig;
    telegram: TelegramBridgeConfig;
    slack: SlackBridgeConfig;
    discord: DiscordBridgeConfig;
}

type WhatsAppBridgeStatus = {
    state: "stopped" | "starting" | "qr" | "connected" | "reconnecting" | "error";
    connected: boolean;
    selfJid: string;
    qrAvailable: boolean;
    qrDataUrl: string;
    message: string;
    lastError: string;
    updatedAt: number;
}

type TelegramBridgeStatus = {
    state: "stopped" | "starting" | "connected" | "reconnecting" | "error";
    connected: boolean;
    botId: number;
    botUsername: string;
    message: string;
    lastError: string;
    updatedAt: number;
}

type DiscordBridgeStatus = {
    state: "stopped" | "starting" | "running" | "error";
    connected: boolean;
    botId: string;
    botUsername: string;
    guildCount: number;
    message: string;
    lastError: string;
    updatedAt: number;
}

type SlackBridgeStatus = {
    state: "stopped" | "starting" | "running" | "error";
    connected: boolean;
    botId: string;
    botUsername: string;
    workspaceName: string;
    message: string;
    lastError: string;
    updatedAt: number;
}

interface EmailListParams {
    folderId: string;
    start?: number;
    limit?: number;
    status?: "read" | "unread" | "all";
    flagid?: number;
    labelid?: string;
    threadId?: string;
    sortBy?: "date" | "messageId" | "size";
    sortOrder?: boolean;
    includeTo?: boolean;
    includeSent?: boolean;
    includeArchive?: boolean;
    attachedMails?: boolean;
    inlinedMails?: boolean;
    flaggedMails?: boolean;
    respondedMails?: boolean;
    threadedMails?: boolean;
}

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    "generate-session-title": string;
    "get-recent-cwds": string[];
    "select-directory": string | null;
    "fetch-folders": any;
    "fetch-emails": any;
    "fetch-accounts": any;
    "connect-email": void;
    "disconnect-email": { success: boolean };
    "is-email-already-connected": boolean;
    "fetch-email-by-id": any;
    "upload-email-attachment-to-agent": any;
    "update-messages": any;
    "search-emails": any;
    "get-letta-env": LettaEnvConfig;
    "update-letta-env": { success: boolean };
    "get-channel-bridges-config": ChannelBridgeConfig;
    "update-channel-bridges-config": ChannelBridgeConfig;
    "get-whatsapp-bridge-status": WhatsAppBridgeStatus;
    "start-whatsapp-bridge": WhatsAppBridgeStatus;
    "stop-whatsapp-bridge": WhatsAppBridgeStatus;
    "get-telegram-bridge-status": TelegramBridgeStatus;
    "start-telegram-bridge": TelegramBridgeStatus;
    "stop-telegram-bridge": TelegramBridgeStatus;
    // download one or more skills from GitHub into the global skills directory
    // resolves to an object containing success flag and an array of directories
    "download-skill": { success: boolean; skillDirs: string[] };
}

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        // Letta Agent IPC APIs
        sendClientEvent: (event: any) => void;
        onServerEvent: (callback: (event: any) => void) => UnsubscribeFunction;
        getRecentCwds: (limit?: number) => Promise<string[]>;
        selectDirectory: () => Promise<string | null>;
        openExternal: (url: string) => Promise<void>;
        fetchEmails: (accountId: string, params?: EmailListParams) => Promise<any>;
        fetchFolders: () => Promise<any>;
        fetchAccounts: () => Promise<any>;
        onEmailConnected: (
            callback: (data: { success: boolean }) => void
        ) => () => void;
        connectEmail: () => Promise<void>;
        disconnectEmail: () => Promise<{ success: boolean }>;
        checkAlreadyConnected: () => Promise<boolean>;
        fetchEmailById: (accountId: string, folderId: string, messageId: string) => Promise<any>;
        uploadEmailAttachmentToAgent: (folderId: string, messageId: string, accountId: string, agentId: string) => Promise<any>;
        downloadEmailAttachment: (folderId: string, messageId: string, accountId: string) => Promise<any>;
        markMessagesAsRead: (accountId: string, messageIds: (number | string)[]) => Promise<any>;
        searchEmails: (accountId: string, params: any) => Promise<any>;
        getLettaEnv: () => Promise<LettaEnvConfig>;
        updateLettaEnv: (values: LettaEnvConfig) => Promise<{ success: boolean }>;
        getChannelBridgesConfig: () => Promise<ChannelBridgeConfig>;
        updateChannelBridgesConfig: (values: ChannelBridgeConfig) => Promise<ChannelBridgeConfig>;
        getWhatsAppBridgeStatus: () => Promise<WhatsAppBridgeStatus>;
        startWhatsAppBridge: () => Promise<WhatsAppBridgeStatus>;
        stopWhatsAppBridge: () => Promise<WhatsAppBridgeStatus>;
        getTelegramBridgeStatus: () => Promise<TelegramBridgeStatus>;
        startTelegramBridge: () => Promise<TelegramBridgeStatus>;
        stopTelegramBridge: () => Promise<TelegramBridgeStatus>;
        getDiscordBridgeStatus: () => Promise<DiscordBridgeStatus>;
        startDiscordBridge: () => Promise<DiscordBridgeStatus>;
        stopDiscordBridge: () => Promise<DiscordBridgeStatus>;
        getSlackBridgeStatus: () => Promise<SlackBridgeStatus>;
        startSlackBridge: () => Promise<SlackBridgeStatus>;
        stopSlackBridge: () => Promise<SlackBridgeStatus>;
        downloadSkill: (handles: string | string[], skillName?: string, branch?: string) => Promise<{ success: boolean; skillDirs: string[] }>;
    }
}
