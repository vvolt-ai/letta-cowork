/**
 * No-op stub for letta-code's lsp/manager. Letta-cowork doesn't bundle
 * an LSP runtime today; ReadLSP.ts always returns the base Read result
 * when `LETTA_ENABLE_LSP` is unset. The dynamic-import path in
 * ReadLSP.ts only fires when that env var IS set, so this stub matches
 * the expected interface but always reports zero diagnostics. Replace
 * with a real impl if/when we add an LSP server here.
 */

export type Diagnostic = {
    severity?: number;
    range: { start: { line: number; character: number } };
    message: string;
};

export const lspManager = {
    async touchFile(_path: string, _force: boolean): Promise<void> {
        /* no-op */
    },
    getDiagnostics(_path: string): Diagnostic[] {
        return [];
    },
};
