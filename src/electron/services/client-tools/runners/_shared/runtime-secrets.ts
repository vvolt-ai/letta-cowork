import { AsyncLocalStorage } from "node:async_hooks";

const runtimeSecretStorage = new AsyncLocalStorage<readonly string[]>();

export function normalizeRuntimeSecretValues(
    values: Iterable<string | null | undefined>
): string[] {
    return [...new Set(Array.from(values).filter((value): value is string => Boolean(value)))].sort(
        (a, b) => b.length - a.length
    );
}

export function runWithRuntimeSecrets<T>(
    values: Iterable<string | null | undefined>,
    fn: () => T
): T {
    return runtimeSecretStorage.run(normalizeRuntimeSecretValues(values), fn);
}

/** Redact exact runtime-secret values at model and persistence boundaries. */
export function redactRuntimeSecrets(
    text: string,
    runtimeEnv?: Readonly<Record<string, string>>
): string {
    if (!text) return text;

    let redacted = text;
    const values = normalizeRuntimeSecretValues([
        ...Object.values(runtimeEnv ?? {}),
        ...(runtimeSecretStorage.getStore() ?? []),
    ]);
    for (const value of values) {
        redacted = redacted.split(value).join("[REDACTED_SECRET]");
    }
    return redacted;
}
