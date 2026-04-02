import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type OutputLineType = "stdout" | "stderr" | "system" | "input" | "event";

export interface OutputLine {
  id: number;
  type: OutputLineType;
  text: string;
  timestamp: number;
}

export interface UseLettaCliReturn {
  output: OutputLine[];
  isRunning: boolean;
  history: string[];
  historyIndex: number;
  setHistoryIndex: (i: number) => void;
  showEvents: boolean;
  setShowEvents: (v: boolean) => void;
  runCommand: (input: string) => Promise<void>;
  killCurrent: () => void;
  clearOutput: () => void;
  addSystemLine: (text: string) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = "letta-terminal-history";
const MAX_HISTORY = 100;
const MAX_OUTPUT_LINES = 5000;

// ── Helpers ──────────────────────────────────────────────────────────────────

let _lineId = 0;
function nextId() {
  return ++_lineId;
}

function makeLine(type: OutputLineType, text: string): OutputLine {
  return { id: nextId(), type, text, timestamp: Date.now() };
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {}
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLettaCli(): UseLettaCliReturn {
  const [output, setOutput] = useState<OutputLine[]>([
    makeLine("system", "Letta CLI terminal ready. Type a command and press Enter."),
    makeLine("system", 'Example: agents list  •  agents get <id>  •  tools list'),
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [showEvents, setShowEvents] = useState(true);
  const activeProcessId = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const showEventsRef = useRef(showEvents);
  useEffect(() => { showEventsRef.current = showEvents; }, [showEvents]);

  // Forward letta server events (session activity) to the terminal output
  useEffect(() => {
    const unsubscribe = window.electron.onServerEvent((event: any) => {
      if (!showEventsRef.current) return;
      const line = formatServerEvent(event);
      if (line) {
        setOutput((prev) => trimLines([...prev, makeLine("event", line)]));
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to CLI output events once on mount
  useEffect(() => {
    const unsubscribe = window.electron.onLettaCliOutput((payload) => {
      if (payload.processId !== activeProcessId.current) return;

      if (payload.type === "end") {
        setIsRunning(false);
        activeProcessId.current = null;
        const code = payload.exitCode ?? 0;
        setOutput((prev) =>
          trimLines([
            ...prev,
            makeLine("system", `Process exited with code ${code}`),
          ])
        );
        return;
      }

      if (payload.data) {
        // Split on newlines so each line is its own entry
        const lines = payload.data.split(/\r?\n/);
        const newLines: OutputLine[] = lines
          .filter((l) => l.length > 0)
          .map((l) => makeLine(payload.type as OutputLineType, l));
        if (newLines.length > 0) {
          setOutput((prev) => trimLines([...prev, ...newLines]));
        }
      }
    });

    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, []);

  const addLine = useCallback((type: OutputLineType, text: string) => {
    setOutput((prev) => trimLines([...prev, makeLine(type, text)]));
  }, []);

  const runCommand = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      // Built-in clear command
      if (trimmed === "/clear" || trimmed === "clear") {
        setOutput([makeLine("system", "Terminal cleared.")]);
        return;
      }

      // Echo the input
      addLine("input", `$ letta ${trimmed}`);

      // Update history
      const newHistory = [
        ...history.filter((h) => h !== trimmed),
        trimmed,
      ].slice(-MAX_HISTORY);
      setHistory(newHistory);
      saveHistory(newHistory);
      setHistoryIndex(-1);

      // Parse input into args array
      const args = parseArgs(trimmed);

      setIsRunning(true);

      try {
        const { processId } = await window.electron.startLettaCliStream(args);
        activeProcessId.current = processId;
      } catch (err) {
        setIsRunning(false);
        addLine("stderr", `Failed to start process: ${String(err)}`);
      }
    },
    [addLine, history]
  );

  const killCurrent = useCallback(() => {
    if (activeProcessId.current) {
      void window.electron.killLettaCli(activeProcessId.current);
      addLine("system", "Process killed.");
      setIsRunning(false);
      activeProcessId.current = null;
    }
  }, [addLine]);

  const clearOutput = useCallback(() => {
    setOutput([makeLine("system", "Terminal cleared.")]);
  }, []);

  const addSystemLine = useCallback((text: string) => {
    setOutput((prev) => trimLines([...prev, makeLine("system", text)]));
  }, []);

  return {
    output,
    isRunning,
    history,
    historyIndex,
    setHistoryIndex,
    showEvents,
    setShowEvents,
    addSystemLine,
    runCommand,
    killCurrent,
    clearOutput,
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function trimLines(lines: OutputLine[]): OutputLine[] {
  if (lines.length > MAX_OUTPUT_LINES) {
    return lines.slice(lines.length - MAX_OUTPUT_LINES);
  }
  return lines;
}

/**
 * Very simple shell-style arg parser: splits on spaces, respects quoted strings.
 * e.g.  agents get "my agent"  →  ["agents", "get", "my agent"]
 */
function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * Format a letta server event into a readable one-line string for the terminal.
 * Returns null for events that should be suppressed.
 */
function formatServerEvent(event: any): string | null {
  const type: string = event?.type ?? "";
  const payload = event?.payload ?? {};
  const sessionId: string = (payload.sessionId ?? "").slice(0, 12);
  const prefix = sessionId ? `[${sessionId}]` : "";

  switch (type) {
    case "session.status": {
      const status = payload.status;
      if (status === "idle" || status === "completed") return null; // too noisy
      return `${prefix} ● ${status}`;
    }
    case "stream.user_prompt": {
      const text = typeof payload.prompt === "string"
        ? payload.prompt.slice(0, 120).replace(/\n/g, " ")
        : "";
      return text ? `${prefix} ▶ You: ${text}` : null;
    }
    case "stream.message": {
      const msg = payload.message;
      if (!msg) return null;
      const role = msg.role ?? msg.message_type ?? "";
      if (role === "assistant" || msg.message_type === "assistant_message") {
        const text = (typeof msg.content === "string" ? msg.content : "")
          .slice(0, 200).replace(/\n/g, " ");
        return text ? `${prefix} 🤖 ${text}` : null;
      }
      if (role === "tool" || msg.message_type === "tool_call_message") {
        const name = msg.tool_call?.name ?? msg.name ?? "tool";
        return `${prefix} ⚙  ${name}(…)`;
      }
      if (msg.message_type === "tool_return_message") {
        const status = msg.status === "error" ? "✗ error" : "✓ done";
        const name = msg.name ?? "tool";
        return `${prefix} ⚙  ${name} → ${status}`;
      }
      if (msg.message_type === "reasoning_message") {
        const text = (msg.reasoning ?? "").slice(0, 120).replace(/\n/g, " ");
        return text ? `${prefix} 💭 ${text}` : null;
      }
      return null;
    }
    case "stream.reasoning": {
      const text = (payload.reasoning ?? "").slice(0, 120).replace(/\n/g, " ");
      return text ? `${prefix} 💭 ${text}` : null;
    }
    case "runner.error":
      return `${prefix} ✗ Runner error: ${payload.message ?? "unknown"}`;
    default:
      return null;
  }
}
