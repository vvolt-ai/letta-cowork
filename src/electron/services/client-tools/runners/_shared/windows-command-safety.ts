// Adapted from letta-ai/letta-code 62d23b3b3; protection is independent of approval policy.
import { homedir } from "node:os";
import { win32 } from "node:path";

const CMD_REMOVALS = new Set(["rd", "rmdir", "del", "erase"]);
const POWERSHELLS = new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
export interface WindowsCommandSafetyOptions {
    platform?: NodeJS.Platform;
    cwd?: string;
    homeDirectory?: string;
    env?: NodeJS.ProcessEnv;
}
function parseCommands(input: string): string[][] {
    const commands: string[][] = [];
    let tokens: string[] = [],
        token = "";
    let quote: "single" | "double" | null = null;
    let escaped = false;
    const flushToken = () => {
        if (token) tokens.push(token);
        token = "";
    };
    const flushCommand = () => {
        flushToken();
        if (tokens.length) commands.push(tokens);
        tokens = [];
    };
    for (let index = 0; index < input.length; index++) {
        const c = input[index];
        if (escaped) {
            token += c;
            escaped = false;
            continue;
        }
        if (quote === "single") {
            if (c === "'") quote = null;
            else token += c;
            continue;
        }
        if (quote === "double") {
            if (c === "`") escaped = true;
            else if (c === '"') quote = null;
            else token += c;
            continue;
        }
        if (c === "'") {
            quote = "single";
            continue;
        }
        if (c === '"') {
            quote = "double";
            continue;
        }
        if (c === "`" || c === "^") {
            escaped = true;
            continue;
        }
        if (/\s/.test(c)) {
            flushToken();
            if (c === "\n" || c === "\r") flushCommand();
            continue;
        }
        if (c === ";" || c === "&" || c === "|") {
            flushCommand();
            if (input[index + 1] === c) index++;
            continue;
        }
        if (c === "(" && !token && !tokens.length) continue;
        if (c === ")") {
            flushCommand();
            continue;
        }
        token += c;
    }
    flushCommand();
    return commands;
}
const executableName = (token?: string) =>
    win32.basename((token || "").replace(/\//g, "\\")).toLowerCase();
function resolveTarget(raw: string, cwd: string, env: NodeJS.ProcessEnv): string | null {
    const entries = new Map(
        Object.entries(env).map(([key, value]) => [key.toLowerCase(), value || ""])
    );
    let target = raw
        .replace(/%([^%]+)%/g, (_, key: string) => entries.get(key.toLowerCase()) || "")
        .replace(/[),]+$/g, "")
        .replace(/(?<=[\\/:])\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*/gi, "")
        .replace(/\//g, "\\");
    if (!target || target === "*") return null;
    if (/[*?]/.test(win32.basename(target))) target = win32.dirname(target);
    return win32.normalize(win32.resolve(cwd, target));
}
function comparablePath(path: string): string {
    const normalized = win32.normalize(path),
        root = win32.parse(normalized).root;
    return normalized.toLowerCase() === root.toLowerCase()
        ? root.toLowerCase()
        : normalized.replace(/[\\/]+$/, "").toLowerCase();
}
function protectedPath(path: string, home: string): boolean {
    if (comparablePath(path) === comparablePath(home)) return true;
    const root = win32.parse(path).root;
    if (!root) return false;
    const relative = win32.relative(root, path);
    return !relative || relative.split(/[\\/]+/).filter(Boolean).length === 1;
}
function protectedPayload(
    payload: string,
    cwd: string,
    home: string,
    env: NodeJS.ProcessEnv
): string | null {
    for (const tokens of parseCommands(payload)) {
        if (!CMD_REMOVALS.has(executableName(tokens[0]))) continue;
        for (const token of tokens.slice(1)) {
            if (/^\/[A-Za-z?]+(?::.*)?$/.test(token)) continue;
            const target = resolveTarget(token, cwd, env);
            if (target && protectedPath(target, home)) return target;
        }
    }
    return null;
}
function findProtectedTarget(
    command: string,
    cwd: string,
    home: string,
    env: NodeJS.ProcessEnv,
    depth = 0
): string | null {
    if (depth > 3) return null;
    for (const tokens of parseCommands(command)) {
        const exe = executableName(tokens[0]);
        if (exe === "cmd" || exe === "cmd.exe") {
            const flag = tokens.findIndex(
                (token, index) => index > 0 && token.toLowerCase() === "/c"
            );
            if (flag < 0) continue;
            const target = protectedPayload(tokens.slice(flag + 1).join(" "), cwd, home, env);
            if (target) return target;
        } else if (POWERSHELLS.has(exe)) {
            const flag = tokens.findIndex(
                (token, index) => index > 0 && ["-c", "-command"].includes(token.toLowerCase())
            );
            if (flag < 0) continue;
            const target = findProtectedTarget(
                tokens.slice(flag + 1).join(" "),
                cwd,
                home,
                env,
                depth + 1
            );
            if (target) return target;
        }
    }
    return null;
}
export function assertSafeWindowsCommand(
    command: string,
    options: WindowsCommandSafetyOptions = {}
): void {
    if ((options.platform ?? process.platform) !== "win32") return;
    const target = findProtectedTarget(
        command,
        options.cwd ?? process.cwd(),
        options.homeDirectory ?? homedir(),
        options.env ?? process.env
    );
    if (target)
        throw new Error(`Refusing to run a cmd removal against protected Windows path: ${target}`);
}
