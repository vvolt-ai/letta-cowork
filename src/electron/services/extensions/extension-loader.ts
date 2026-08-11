import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { app } from "electron";

import {
    registerExtensionEventHandler,
    type ExtensionEventHandler,
    type ExtensionEventName,
} from "./extension-events.js";
import { registerClientTool } from "../client-tools/index.js";

import type {
    ClientToolDefinition,
    JsonSchema,
    ToolRunResult,
} from "../client-tools/types.js";

const EXTENSION_FILE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const requireExtension = createRequire(import.meta.url);

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

export interface CoworkExtensionApi {
    tools: {
        register: (tool: CoworkExtensionToolRegistration) => () => void;
    };
    events: {
        on: <TName extends ExtensionEventName>(
            name: TName,
            handler: ExtensionEventHandler<TName>
        ) => () => void;
    };
    getContext: () => {
        app: "letta-cowork";
        extensionDirectory: string;
        userDataPath: string;
    };
}

type ExtensionFactory = (
    api: CoworkExtensionApi
) => void | (() => void) | Promise<void | (() => void)>;

interface ExtensionModule {
    activate?: unknown;
    default?: unknown;
}

interface ExtensionLogger {
    log?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
}

interface LoadExtensionsOptions {
    directory: string;
    logger?: ExtensionLogger;
}

function expandHome(pathValue: string): string {
    if (pathValue === "~") return homedir();
    if (pathValue.startsWith("~/")) return join(homedir(), pathValue.slice(2));
    return pathValue;
}

function defaultExtensionDirectory(): string {
    return join(homedir(), ".letta", "extensions");
}

export function resolveCoworkExtensionDirectory(): string {
    const explicit = process.env.COWORK_EXTENSIONS_DIR || process.env.LETTA_COWORK_EXTENSIONS_DIR;
    if (explicit && explicit.trim()) {
        const expanded = expandHome(explicit.trim());
        return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
    }
    return defaultExtensionDirectory();
}

function extensionOwnerForFile(filePath: string): string {
    return basename(filePath).replace(/\.[^.]+$/, "");
}

function listExtensionFiles(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => {
            if (!entry.isFile()) return false;
            if (entry.name.startsWith(".")) return false;
            return EXTENSION_FILE_EXTENSIONS.has(extname(entry.name));
        })
        .map((entry) => join(directory, entry.name))
        .sort((a, b) => a.localeCompare(b));
}

async function importExtensionModule(file: string): Promise<ExtensionModule> {
    if (extname(file) === ".cjs") {
        return requireExtension(file) as ExtensionModule;
    }
    return (await import(pathToFileURL(file).href)) as ExtensionModule;
}

function normalizeToolResult(result: CoworkExtensionToolRunResult): ToolRunResult {
    if (typeof result === "string") {
        return { output: result, isError: false };
    }

    return {
        output: result.output ?? result.content ?? "",
        isError:
            result.isError ??
            (result.success === false ? true : undefined) ??
            (result.status === "error" ? true : undefined) ??
            false,
    };
}

function createExtensionApi(owner: string, directory: string): CoworkExtensionApi {
    return {
        tools: {
            register: (tool: CoworkExtensionToolRegistration) => {
                if (!tool.name || !tool.description || typeof tool.run !== "function") {
                    throw new Error(`Extension '${owner}' registered an invalid tool definition.`);
                }

                const clientTool: ClientToolDefinition = {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters ?? {
                        type: "object",
                        properties: {},
                        additionalProperties: true,
                    },
                    run: async (args, ctx) =>
                        normalizeToolResult(
                            await tool.run({
                                args,
                                signal: ctx.signal,
                                agentId: ctx.agentId,
                                conversationId: ctx.conversationId,
                                toolName: tool.name,
                                planMode: ctx.planMode,
                            })
                        ),
                };

                registerClientTool(clientTool);
                return () => undefined;
            },
        },
        events: {
            on: (name, handler) => registerExtensionEventHandler(name, owner, handler),
        },
        getContext: () => ({
            app: "letta-cowork",
            extensionDirectory: directory,
            userDataPath: app.getPath("userData"),
        }),
    };
}

export async function loadCoworkExtensions(options: LoadExtensionsOptions): Promise<string[]> {
    const loaded: string[] = [];
    const files = listExtensionFiles(options.directory);
    for (const file of files) {
        const owner = extensionOwnerForFile(file);
        try {
            const mod = await importExtensionModule(file);
            const factory = mod.activate ?? mod.default;
            if (typeof factory !== "function") {
                options.logger?.warn?.(
                    `Skipping extension '${file}': expected activate(api) or default export.`
                );
                continue;
            }

            await (factory as ExtensionFactory)(createExtensionApi(owner, options.directory));
            loaded.push(file);
            options.logger?.log?.(`Loaded Cowork extension: ${file}`);
        } catch (error) {
            options.logger?.error?.(
                `Failed to load Cowork extension '${file}': ${
                    error instanceof Error ? error.stack || error.message : String(error)
                }`
            );
        }
    }

    return loaded;
}

export async function initializeCoworkExtensions(logger: ExtensionLogger = console): Promise<string[]> {
    const enabled = [
        process.env.COWORK_EXTENSIONS_ENABLED,
        process.env.LETTA_COWORK_EXTENSIONS_ENABLED,
    ].some((value) => value?.toLowerCase() === "true");

    if (!enabled) {
        logger.log?.("Cowork extensions disabled. Set COWORK_EXTENSIONS_ENABLED=true to enable.");
        return [];
    }

    const directory = resolveCoworkExtensionDirectory();
    const loaded = await loadCoworkExtensions({ directory, logger });
    logger.log?.(
        `Cowork extensions initialized from ${directory}. Loaded ${loaded.length} extension(s).`
    );
    return loaded;
}
