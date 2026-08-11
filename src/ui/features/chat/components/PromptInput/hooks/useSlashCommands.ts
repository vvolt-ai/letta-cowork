/**
 * Hook for managing slash commands in the PromptInput component.
 */

import { useCallback, useMemo, useState } from "react";

import { formatLettaCliOutput } from "../utils/formatPrompt";

export interface SlashCommandSuggestion {
  command: string;
  description: string;
  insertText?: string;
  status: "supported" | "info";
}

export const SLASH_COMMAND_SUGGESTIONS: SlashCommandSuggestion[] = [
  { command: "/letta", description: "Run a letta CLI command (e.g. /letta agents list)", insertText: "/letta ", status: "supported" },
  { command: "/doctor", description: "Audit and refine your memory structure", insertText: "/doctor ", status: "info" },
  { command: "/remember", description: "Remember something from the conversation", insertText: "/remember ", status: "supported" },
  { command: "/skill", description: "Enter skill creation mode", insertText: "/skill ", status: "info" },
  { command: "/memory", description: "View your agent's memory blocks", insertText: "/memory", status: "supported" },
  { command: "/search", description: "Search messages (defaults to the current agent)", insertText: "/search ", status: "supported" },
  { command: "/new", description: "Start a new conversation, optionally with a name", insertText: "/new ", status: "supported" },
  { command: "/clear", description: "Clear in-context messages", insertText: "/clear", status: "supported" },
  { command: "/compact", description: "Summarize conversation history (compaction)", insertText: "/compact ", status: "info" },
  { command: "/pin", description: "Pin current agent globally (-l for local only)", insertText: "/pin ", status: "info" },
  { command: "/unpin", description: "Unpin current agent (-l for local only)", insertText: "/unpin ", status: "info" },
  { command: "/description", description: "Update the current agent's description", insertText: "/description ", status: "supported" },
  { command: "/export", description: "Export AgentFile (.af)", insertText: "/export ", status: "info" },
  { command: "/toolset", description: "Switch toolset (default/codex/gemini)", insertText: "/toolset ", status: "info" },
  { command: "/server", description: "Start local server listener mode", insertText: "/server ", status: "info" },
  { command: "/mcp", description: "Manage MCP servers", insertText: "/mcp ", status: "info" },
  { command: "/secret", description: "Manage secrets (set, list, unset)", insertText: "/secret ", status: "info" },
  { command: "/skills", description: "Browse available skills by source", insertText: "/skills", status: "info" },
  { command: "/statusline", description: "Configure CLI footer status lines", insertText: "/statusline ", status: "info" },
  { command: "/sleeptime", description: "Configure reflection trigger settings", insertText: "/sleeptime ", status: "info" },
  { command: "/recompile", description: "Recompile the current agent and conversation", insertText: "/recompile", status: "info" },
  { command: "/context", description: "Show context window usage", insertText: "/context", status: "supported" },
  { command: "/usage", description: "Show session usage statistics and balance", insertText: "/usage", status: "supported" },
  { command: "/feedback", description: "Send feedback to the Letta team", insertText: "/feedback ", status: "supported" },
  { command: "/connect openai-compatible", description: "Connect an OpenAI-compatible model provider", insertText: "/connect openai-compatible --base-url ", status: "supported" },
  { command: "/connect chatgpt", description: "Connect ChatGPT Pro/Plus", insertText: "/connect chatgpt", status: "supported" },
  { command: "/disconnect chatgpt", description: "Disconnect ChatGPT Pro/Plus", insertText: "/disconnect chatgpt", status: "info" },
  { command: "/bg", description: "Show background shell processes", insertText: "/bg", status: "supported" },
  { command: "/exit", description: "Exit this session to support with our chat", insertText: "/exit", status: "info" },
];

function parseCliArgs(input: string): string[] {
  return (
    input.match(/[^\s"']+|"[^"]*"|'[^']*'/g)?.map((arg) => arg.replace(/^["']|["']$/g, "")) ??
    input.split(/\s+/).filter(Boolean)
  );
}

const SECRET_CLI_FLAGS = new Set(["--api-key", "--secret-key", "--access-key"]);

function redactSensitiveCliArgs(args: string[]): string[] {
  let redactNext = false;
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return "[REDACTED]";
    }
    const flag = arg.split("=", 1)[0]?.toLowerCase() ?? "";
    if (!SECRET_CLI_FLAGS.has(flag)) return arg;
    if (arg.includes("=")) return `${arg.slice(0, arg.indexOf("=") + 1)}[REDACTED]`;
    redactNext = true;
    return arg;
  });
}

function redactSensitiveCliOutput(output: string, args: string[]): string {
  const secrets: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const flag = arg.split("=", 1)[0]?.toLowerCase() ?? "";
    if (!SECRET_CLI_FLAGS.has(flag)) continue;
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[index + 1];
    if (value) secrets.push(value);
  }
  return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), output);
}

export interface UseSlashCommandsOptions {
  activeSessionId: string | null;
  handleSend: (options: { text: string }) => Promise<void>;
  onOpenMemory?: () => void;
  setActiveSessionId: (id: null, clear: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setPrompt: (prompt: string) => void;
  appendCliResult: (sessionId: string, result: any) => void;
}

export interface UseSlashCommandsResult {
  slashQuery: string;
  slashSuggestions: SlashCommandSuggestion[];
  selectedSlashIndex: number;
  setSelectedSlashIndex: (index: number | ((prev: number) => number)) => void;
  handleSlashCommand: (rawPrompt: string) => Promise<boolean>;
  applySlashSuggestion: (suggestion: SlashCommandSuggestion, onFocus: () => void) => void;
}

export function useSlashCommands(options: UseSlashCommandsOptions): UseSlashCommandsResult {
  const {
    activeSessionId,
    handleSend,
    onOpenMemory,
    setActiveSessionId,
    setGlobalError,
    setPrompt,
    appendCliResult,
  } = options;

  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  const handleSlashCommand = useCallback(
    async (rawPrompt: string): Promise<boolean> => {
      const trimmed = rawPrompt.trim();
      if (!trimmed.startsWith("/")) return false;

      const [rawCommand, ...argParts] = trimmed.split(/\s+/);
      const normalized = rawCommand.toLowerCase();
      const args = argParts.join(" ").trim();

      switch (normalized) {
        case "/letta": {
          if (!args) {
            setGlobalError("Usage: /letta <command>  e.g. /letta agents list");
            setPrompt("");
            return true;
          }
          if (!activeSessionId) {
            setGlobalError("Start or select a session before using /letta.");
            setPrompt("");
            return true;
          }
          const cliArgs = parseCliArgs(args);
          const displayArgs = redactSensitiveCliArgs(cliArgs);
          setGlobalError(null);
          setPrompt("");
          try {
            const { stdout, stderr, exitCode } = await window.electron.runLettaCli(cliArgs);
            const rawOutput = redactSensitiveCliOutput(
              (stdout || stderr || "(no output)").trim(),
              cliArgs
            );
            const formattedOutput = formatLettaCliOutput(displayArgs, rawOutput);
            appendCliResult(activeSessionId, {
              type: "cli_result",
              id: `cli-${Date.now()}`,
              command: displayArgs.join(" "),
              output: formattedOutput || "(no output)",
              exitCode,
              createdAt: Date.now(),
            });
          } catch (err) {
            setGlobalError(`/letta failed: ${String(err)}`);
          }
          return true;
        }
        case "/connect": {
          if (!args) {
            setGlobalError(
              "Usage: /connect openai-compatible --base-url <url> --api-key <key>"
            );
            setPrompt("");
            return true;
          }
          if (!activeSessionId) {
            setGlobalError("Start or select a session before using /connect.");
            setPrompt("");
            return true;
          }

          const cliArgs = ["connect", ...parseCliArgs(args)];
          const displayArgs = redactSensitiveCliArgs(cliArgs);
          setGlobalError(null);
          // Clear the renderer input before awaiting so provider credentials do
          // not remain visible in component state while the request runs.
          setPrompt("");
          try {
            const { stdout, stderr, exitCode } = await window.electron.runLettaCli(cliArgs);
            const rawOutput = redactSensitiveCliOutput(
              (stdout || stderr || "(no output)").trim(),
              cliArgs
            );
            const formattedOutput = formatLettaCliOutput(displayArgs, rawOutput);
            appendCliResult(activeSessionId, {
              type: "cli_result",
              id: `cli-${Date.now()}`,
              command: displayArgs.join(" "),
              output: formattedOutput || "(no output)",
              exitCode,
              createdAt: Date.now(),
            });
            if (exitCode === 0) {
              window.dispatchEvent(new Event("letta-model-catalog-changed"));
            }
          } catch (err) {
            setGlobalError(`/connect failed: ${String(err)}`);
          }
          return true;
        }
        case "/new":
        case "/clear": {
          setActiveSessionId(null, false);
          setPrompt(args);
          setGlobalError(
            normalized === "/clear"
              ? "Started a fresh conversation context."
              : "Opened a new conversation."
          );
          return true;
        }
        case "/memory": {
          onOpenMemory?.();
          return true;
        }
        case "/search": {
          setGlobalError(
            args
              ? `Message search UI is not wired yet in Vera Cowork. Requested search: ${args}`
              : "Message search UI is not wired yet in Vera Cowork."
          );
          return true;
        }
        case "/remember": {
          if (!args) {
            setGlobalError("Usage: /remember <text>");
            return true;
          }
          await handleSend({ text: `Please remember this for future conversations:\n\n${args}` });
          return true;
        }
        case "/description": {
          if (!args) {
            setGlobalError("Usage: /description <text>");
            return true;
          }
          await handleSend({ text: `Please update the current agent description to:\n\n${args}` });
          return true;
        }
        case "/context": {
          await handleSend({
            text: "Show the current context window usage and explain how full it is.",
          });
          return true;
        }
        case "/usage": {
          await handleSend({
            text: "Show current usage statistics and balance information if available.",
          });
          return true;
        }
        case "/feedback": {
          await handleSend({
            text: `Please help me prepare feedback for the Letta team about this issue or idea:\n\n${
              args || "<add feedback details here>"
            }`,
          });
          return true;
        }
        case "/bg": {
          await handleSend({
            text: "Show any background shell or agent processes that are currently running, if available.",
          });
          return true;
        }
        default: {
          setGlobalError(`Command ${normalized} is not yet supported directly in Vera Cowork.`);
          return true;
        }
      }
    },
    [activeSessionId, appendCliResult, handleSend, onOpenMemory, setActiveSessionId, setGlobalError, setPrompt]
  );

  const applySlashSuggestion = useCallback(
    (suggestion: SlashCommandSuggestion, onFocus: () => void) => {
      setPrompt(suggestion.insertText ?? suggestion.command);
      setSelectedSlashIndex(0);
      window.requestAnimationFrame(() => {
        onFocus();
      });
    },
    [setPrompt]
  );

  return {
    slashQuery: "",
    slashSuggestions: SLASH_COMMAND_SUGGESTIONS,
    selectedSlashIndex,
    setSelectedSlashIndex,
    handleSlashCommand,
    applySlashSuggestion,
  };
}

/**
 * Hook for computing slash suggestions based on prompt.
 */
export function useSlashSuggestions(prompt: string): {
  slashQuery: string;
  slashSuggestions: SlashCommandSuggestion[];
} {
  const slashQuery = useMemo(() => {
    const trimmed = prompt.trimStart();
    if (!trimmed.startsWith("/")) return "";
    const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
    return firstLine.slice(1).toLowerCase();
  }, [prompt]);

  const slashSuggestions = useMemo(() => {
    if (!slashQuery && !prompt.trimStart().startsWith("/")) return [];
    return SLASH_COMMAND_SUGGESTIONS.filter((item) =>
      item.command.slice(1).toLowerCase().includes(slashQuery)
    ).slice(0, 8);
  }, [prompt, slashQuery]);

  return { slashQuery, slashSuggestions };
}
