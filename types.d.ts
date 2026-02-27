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
    "update-messages": any;
    "search-emails": any;
    "get-letta-env": LettaEnvConfig;
    "update-letta-env": { success: boolean };
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
        downloadEmailAttachment: (folderId: string, messageId: string, accountId: string) => Promise<any>;
        markMessagesAsRead: (accountId: string, messageIds: (number | string)[]) => Promise<any>;
        searchEmails: (accountId: string, params: any) => Promise<any>;
        getLettaEnv: () => Promise<LettaEnvConfig>;
        updateLettaEnv: (values: LettaEnvConfig) => Promise<{ success: boolean }>;
        downloadSkill: (handles: string | string[], skillName?: string, branch?: string) => Promise<{ success: boolean; skillDirs: string[] }>;
    }
}
