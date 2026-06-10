import type { ToolRunContext } from "../client-tools/types.js";

export type ExtensionEventName = "tool_start";

export interface ExtensionToolStartEvent {
    agentId?: string;
    conversationId?: string;
    toolName: string;
    args: Record<string, unknown>;
    context: ToolRunContext;
}

export interface ExtensionToolStartResult {
    args?: Record<string, unknown>;
    deny?: boolean;
    reason?: string;
}

export type ExtensionEventHandler<TName extends ExtensionEventName = ExtensionEventName> =
    TName extends "tool_start"
        ? (
              event: ExtensionToolStartEvent
          ) => ExtensionToolStartResult | undefined | Promise<ExtensionToolStartResult | undefined>
        : never;

interface RegisteredExtensionEventHandler<TName extends ExtensionEventName = ExtensionEventName> {
    name: TName;
    owner: string;
    handler: ExtensionEventHandler<TName>;
}

const eventHandlers: RegisteredExtensionEventHandler[] = [];

export function registerExtensionEventHandler<TName extends ExtensionEventName>(
    name: TName,
    owner: string,
    handler: ExtensionEventHandler<TName>
): () => void {
    const registration: RegisteredExtensionEventHandler<TName> = {
        name,
        owner,
        handler,
    };
    eventHandlers.push(registration as RegisteredExtensionEventHandler);
    return () => {
        const index = eventHandlers.indexOf(registration as RegisteredExtensionEventHandler);
        if (index >= 0) eventHandlers.splice(index, 1);
    };
}

export async function emitExtensionToolStart(
    event: ExtensionToolStartEvent
): Promise<ExtensionToolStartResult> {
    let nextArgs = event.args;
    for (const registration of eventHandlers) {
        if (registration.name !== "tool_start") continue;

        const result = await (registration.handler as ExtensionEventHandler<"tool_start">)({
            ...event,
            args: nextArgs,
        });

        if (!result) continue;
        if (result.args) nextArgs = result.args;
        if (result.deny) {
            return {
                args: nextArgs,
                deny: true,
                reason:
                    result.reason ||
                    `Tool '${event.toolName}' was denied by extension '${registration.owner}'.`,
            };
        }
    }

    return { args: nextArgs };
}

export function clearExtensionEventHandlersForTests(): void {
    eventHandlers.splice(0, eventHandlers.length);
}
