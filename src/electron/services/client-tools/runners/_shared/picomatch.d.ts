/**
 * Minimal ambient declaration for picomatch — used by LS.ts.
 * The real types are in @types/picomatch (not installed); this covers
 * what cowork-gui's LS.ts actually calls.
 */
declare module "picomatch" {
    interface PicomatchOptions {
        dot?: boolean;
        nocase?: boolean;
        bash?: boolean;
        contains?: boolean;
        [k: string]: unknown;
    }
    function picomatch(
        pattern: string | string[],
        options?: PicomatchOptions
    ): (input: string) => boolean;
    namespace picomatch {
        function isMatch(
            input: string,
            pattern: string | string[],
            options?: PicomatchOptions
        ): boolean;
    }
    export = picomatch;
}
