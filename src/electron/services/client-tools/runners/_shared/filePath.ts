import * as os from "node:os";
import * as path from "node:path";

/**
 * Expand a file_path argument before resolving it:
 * 1. Expand leading `~` to the home directory.
 * 2. Expand `$VAR` and `${VAR}` references using process.env.
 *    Unknown env vars are left intact so downstream errors remain readable.
 * 3. Resolve relative paths against `userCwd`.
 */
export function expandFilePath(filePath: string, userCwd: string): string {
  let expanded = filePath;

  if (expanded === "~" || expanded.startsWith("~/")) {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }

  expanded = expanded.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced?: string, unbraced?: string) => {
      const name = braced ?? unbraced ?? "";
      return process.env[name] ?? match;
    },
  );

  return path.isAbsolute(expanded) ? expanded : path.resolve(userCwd, expanded);
}
