export function formatDuration(startedAt?: number, finishedAt?: number): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = Math.max(0, finishedAt - startedAt);
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toFixed(0)}s`;
}

export function truncateInput(input: unknown, limit = 120): string {
  let asString: string | null = null;

  if (typeof input === "string") {
    asString = input;
  } else if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    const candidateKeys = ["raw", "display", "text", "message", "content"];
    for (const key of candidateKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        asString = value;
        break;
      }
    }

    if (!asString) {
      try {
        asString = JSON.stringify(input, null, 2);
      } catch {
        asString = String(input ?? "");
      }
    }
  } else {
    asString = String(input ?? "");
  }

  if (!asString) return "";
  const trimmed = asString.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}
