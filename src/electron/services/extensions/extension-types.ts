import type { JsonSchema } from "../client-tools/types.js";
import type { ExtensionEventHandler, ExtensionEventName } from "./extension-events.js";

export const COWORK_EXTENSION_API_VERSION = 1 as const;
export const COWORK_EXTENSION_MANIFEST_FILE = "cowork.extension.json";

export type CoworkExtensionFilesystemPermission = "none" | "read" | "write";

export interface CoworkExtensionCapabilities {
    tools?: string[];
    events?: ExtensionEventName[];
    services?: string[];
}

/**
 * Permissions are declarations for inspection and future policy enforcement.
 * Extensions still run as trusted Electron main-process code and are not
 * sandboxed by these declarations.
 */
export interface CoworkExtensionPermissions {
    filesystem?: CoworkExtensionFilesystemPermission;
    network?: string[];
    secrets?: string[];
}

export interface CoworkExtensionManifest {
    schemaVersion: 1;
    id: string;
    name: string;
    version: string;
    description?: string;
    entry: string;
    apiVersion: typeof COWORK_EXTENSION_API_VERSION;
    capabilities: CoworkExtensionCapabilities;
    permissions?: CoworkExtensionPermissions;
}

export interface CoworkExtensionToolRunContext {
    args: Record<string, unknown>;
    signal: AbortSignal;
    agentId?: string;
    conversationId?: string;
    toolName?: string;
    planMode?: unknown;
}

export type CoworkExtensionToolRunResult =
    | string
    | {
          output?: string;
          content?: string;
          isError?: boolean;
          success?: boolean;
          status?: "success" | "error";
      };

export interface CoworkExtensionToolRegistration {
    name: string;
    description: string;
    parameters?: JsonSchema;
    run: (
        context: CoworkExtensionToolRunContext
    ) => CoworkExtensionToolRunResult | Promise<CoworkExtensionToolRunResult>;
}

export interface CoworkExtensionServiceContext {
    extensionId: string;
    extensionDirectory: string;
    userDataPath: string;
    signal: AbortSignal;
}

export interface CoworkExtensionServiceRegistration {
    id: string;
    start: (
        context: CoworkExtensionServiceContext
    ) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}

export interface CoworkExtensionApi {
    apiVersion: typeof COWORK_EXTENSION_API_VERSION;
    extension: {
        id: string;
        name: string;
        version: string;
        legacy: boolean;
    };
    tools: {
        register: (tool: CoworkExtensionToolRegistration) => () => void;
    };
    events: {
        on: <TName extends ExtensionEventName>(
            name: TName,
            handler: ExtensionEventHandler<TName>
        ) => () => void;
    };
    services: {
        register: (service: CoworkExtensionServiceRegistration) => () => void;
    };
    getContext: () => {
        app: "letta-cowork";
        extensionDirectory: string;
        userDataPath: string;
    };
}

export type CoworkExtensionFactory = (
    api: CoworkExtensionApi
) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;

export type CoworkExtensionFormat = "manifest" | "legacy-file";
export type CoworkExtensionStatus = "discovered" | "loading" | "loaded" | "failed";

export interface CoworkExtensionInventoryItem {
    id: string;
    name: string;
    version: string;
    description?: string;
    format: CoworkExtensionFormat;
    sourcePath: string;
    entryPath: string;
    apiVersion: number;
    capabilities: CoworkExtensionCapabilities;
    permissions?: CoworkExtensionPermissions;
    status: CoworkExtensionStatus;
    registrations: CoworkExtensionCapabilities;
    error?: string;
}
