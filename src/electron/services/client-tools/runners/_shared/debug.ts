/**
 * Slim shim of cowork-gui's utils/debug.ts. We just print to console
 * when DEBUG=letta-tools is set; otherwise silent. The full impl in
 * cowork-gui has namespace gating + colour codes; we don't need that.
 */

const enabled = (() => {
    const v = (process.env.DEBUG || "").toLowerCase();
    return v === "*" || v.includes("letta") || v.includes("tools");
})();

export function debugLog(_namespace: string, fmt: string, ...rest: unknown[]): void {
    if (!enabled) return;
    // eslint-disable-next-line no-console
    console.log(`[${_namespace}]`, fmt, ...rest);
}

export function debugWarn(_namespace: string, fmt: string, ...rest: unknown[]): void {
    if (!enabled) return;
    // eslint-disable-next-line no-console
    console.warn(`[${_namespace}]`, fmt, ...rest);
}

export function isDebugEnabled(): boolean {
    return enabled;
}
