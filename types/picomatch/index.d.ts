/**
 * Minimal ambient declaration for picomatch — used by LS.ts.
 * The real types are in @types/picomatch (not installed); we only need
 * the call signature for the few features cowork-gui's LS.ts uses.
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
