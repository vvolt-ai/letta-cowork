import { getCurrentWorkingDirectory } from "./runtime-context.js";
import { runWithRuntimeSecrets } from "./runtime-secrets.js";
import { LIMITS, truncateByChars } from "./truncation.js";

/**
 * Last-resort bound for any model-facing client-tool result that escaped the
 * tool's own output limit. The complete output is preserved in an overflow
 * file; only the value returned to the model is clamped.
 */
export function clampToolReturnContent(
  content: string,
  toolName: string,
  secretValues: Iterable<string | null | undefined> = [],
): string {
  if (content.length <= LIMITS.TOOL_RETURN_MAX_CHARS) return content;

  return runWithRuntimeSecrets(secretValues, () =>
    truncateByChars(content, LIMITS.TOOL_RETURN_MAX_CHARS, toolName, {
      workingDirectory: getCurrentWorkingDirectory(),
      toolName,
    }).content
  );
}
