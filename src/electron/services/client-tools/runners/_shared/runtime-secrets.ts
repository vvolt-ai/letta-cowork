import { AsyncLocalStorage } from "node:async_hooks";

const runtimeSecretStorage = new AsyncLocalStorage<readonly string[]>();
const SECRET_ENV_KEY =
    /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSCODE|CREDENTIALS?|API_KEY|PRIVATE_KEY|COOKIE|AUTHORIZATION)(?:_|$)/i;

/** Credential-named ambient values only; ordinary environment settings are not secrets. */
export function getSensitiveEnvValues(
    env: Readonly<Record<string, string | undefined>> = process.env
): string[] {
    return Object.entries(env).flatMap(([key, value]) =>
        SECRET_ENV_KEY.test(key) && value ? [value] : []
    );
}

export function normalizeRuntimeSecretValues(
    values: Iterable<string | null | undefined>
): string[] {
    return [...new Set(Array.from(values).filter((value): value is string => Boolean(value)))].sort(
        (a, b) => b.length - a.length
    );
}

/** Snapshot at dispatch so rotation/removal cannot expose a launch-time credential later. */
export function captureRuntimeSecretValues(
    values: Iterable<string | null | undefined> = []
): string[] {
    return normalizeRuntimeSecretValues([
        ...values,
        ...getSensitiveEnvValues(),
        ...(runtimeSecretStorage.getStore() ?? []),
    ]);
}

export function runWithRuntimeSecrets<T>(
    values: Iterable<string | null | undefined>,
    fn: () => T
): T {
    return runtimeSecretStorage.run(captureRuntimeSecretValues(values), fn);
}

/** Redact current ambient, launch-time and explicit values at model/persistence boundaries. */
export function redactRuntimeSecrets(
    text: string,
    runtimeEnv?: Readonly<Record<string, string>>,
    retainedValues: Iterable<string | null | undefined> = []
): string {
    if (!text) return text;
    let redacted = text;
    for (const value of captureRuntimeSecretValues([
        ...Object.values(runtimeEnv ?? {}),
        ...retainedValues,
    ])) {
        redacted = redacted.split(value).join("[REDACTED_SECRET]");
    }
    return redacted;
}
