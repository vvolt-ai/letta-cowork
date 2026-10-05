import { getRuntimeContext } from './runtime-context.js';

export interface BackgroundOwner {
    agentId: string;
    conversationId: string;
    organizationId?: string;
    userId?: string;
    lettaConnectionId?: string;
}
export interface OwnedBackgroundEntry { readonly owner?: Readonly<BackgroundOwner>; }
export function currentBackgroundOwner(): Readonly<BackgroundOwner> | undefined {
    const context = getRuntimeContext();
    if (!context?.agentId || !context.conversationId) return undefined;
    return Object.freeze({ agentId: context.agentId, conversationId: context.conversationId, organizationId: context.organizationId, userId: context.userId, lettaConnectionId: context.lettaConnectionId });
}
function sameOwner(a: Readonly<BackgroundOwner>, b: Readonly<BackgroundOwner>): boolean {
    return a.agentId === b.agentId && a.conversationId === b.conversationId && a.organizationId === b.organizationId && a.userId === b.userId && a.lettaConnectionId === b.lettaConnectionId;
}
function accessible(entry: OwnedBackgroundEntry): boolean {
    const current = currentBackgroundOwner();
    // Legacy unscoped fixtures are visible only outside authenticated runtime execution.
    // An owned entry is never made visible by omitting runtime identity.
    return entry.owner ? Boolean(current && sameOwner(entry.owner, current)) : !getRuntimeContext();
}
/** Reuse existing process/task managers, enforcing their trusted scope at lookup/stop boundaries. */
export class OwnedBackgroundMap<T extends OwnedBackgroundEntry> extends Map<string, T> {
    override set(id: string, entry: T): this {
        const owner = currentBackgroundOwner();
        const existing = super.get(id);
        if (existing && !accessible(existing)) throw new Error('Background ID already belongs to another scope.');
        if (entry.owner && (!owner || !sameOwner(entry.owner, owner))) throw new Error('Background owner mismatch.');
        if (getRuntimeContext() && !owner) throw new Error('Background work requires concrete runtime agent/conversation identity.');
        if (owner && !entry.owner) Object.defineProperty(entry, 'owner', { value: owner, enumerable: true, writable: false, configurable: false });
        return super.set(id, entry);
    }
    override get(id: string): T | undefined {
        const entry = super.get(id);
        return entry && accessible(entry) ? entry : undefined;
    }
    override entries(): MapIterator<[string, T]> {
        const raw = super.entries();
        return (function* () { for (const pair of raw) if (accessible(pair[1])) yield pair; })() as MapIterator<[string, T]>;
    }
    override values(): MapIterator<T> {
        const pairs = this.entries();
        return (function* () { for (const [, entry] of pairs) yield entry; })() as MapIterator<T>;
    }
    override keys(): MapIterator<string> {
        const pairs = this.entries();
        return (function* () { for (const [key] of pairs) yield key; })() as MapIterator<string>;
    }
    override [Symbol.iterator](): MapIterator<[string, T]> { return this.entries(); }
    override forEach(fn: (value: T, key: string, map: Map<string, T>) => void, thisArg?: unknown): void {
        for (const [key, value] of this.entries()) fn.call(thisArg, value, key, this);
    }
    override clear(): void {
        if (!getRuntimeContext()) { super.clear(); return; }
        for (const key of this.keys()) super.delete(key);
    }
    override has(id: string): boolean { return this.get(id) !== undefined; }
    override delete(id: string): boolean { return this.get(id) ? super.delete(id) : false; }
}
