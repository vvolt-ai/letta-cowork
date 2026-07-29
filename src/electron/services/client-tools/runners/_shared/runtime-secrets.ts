/**
 * Redact exact runtime-secret values before subprocess output is returned to
 * the agent/model. This is a last-resort output boundary; callers must still
 * avoid intentionally printing secrets.
 */
export function redactRuntimeSecrets(
    text: string,
    runtimeEnv: Readonly<Record<string, string>> | undefined
): string {
    if (!text || !runtimeEnv) return text;

    let redacted = text;
    const values = [...new Set(Object.values(runtimeEnv).filter(Boolean))].sort(
        (a, b) => b.length - a.length
    );
    for (const value of values) {
        redacted = redacted.split(value).join("[REDACTED_SECRET]");
    }
    return redacted;
}
