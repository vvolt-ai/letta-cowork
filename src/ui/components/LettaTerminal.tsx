import { memo, useCallback, useEffect, useRef, useState, KeyboardEvent, type CSSProperties } from "react";
import { useLettaCli, type OutputLine } from "../hooks/useLettaCli";

// ── Sub-components ────────────────────────────────────────────────────────────

function OutputLineRow({ line }: { line: OutputLine }) {
  const colorClass =
    line.type === "stderr"
      ? "text-red-400"
      : line.type === "system"
      ? "text-[var(--color-accent)]/70 italic"
      : line.type === "input"
      ? "text-ink-400"
      : line.type === "event"
      ? "text-yellow-300/80"
      : "text-green-300";

  return (
    <div className={`font-mono text-xs leading-5 whitespace-pre-wrap break-all ${colorClass}`}>
      {line.text}
    </div>
  );
}

function Cursor() {
  return (
    <span className="inline-block h-3.5 w-1.5 bg-green-400 animate-pulse align-middle ml-0.5" />
  );
}

// ── Register Tools panel ─────────────────────────────────────────────────────

interface ToolStatus { name: string; status: string; id?: string; error?: string; }

function RegisterToolsPanel({ onLog, onClose }: { onLog: (line: string) => void; onClose: () => void }) {
  const [agentId, setAgentId] = useState("");
  const [step, setStep] = useState<"idle" | "registering" | "attaching" | "done" | "error">("idle");
  const [results, setResults] = useState<ToolStatus[]>([]);

  const run = useCallback(async () => {
    if (!agentId.trim()) { onLog("⚠  Enter an agent ID first."); return; }
    setStep("registering");
    onLog("⟳  Registering letta-code tools on server…");

    try {
      const regResults = await window.electron.registerLettaCodeTools(true);
      setResults(regResults);
      for (const r of regResults) {
        if (r.status === "error") onLog(`  ✗ ${r.name}: ${r.error}`);
        else onLog(`  ✓ ${r.name} (${r.status})`);
      }

      setStep("attaching");
      onLog(`⟳  Attaching tools to agent ${agentId.trim()}…`);
      const { attached, failed } = await window.electron.attachLettaCodeToolsToAgent(agentId.trim());
      for (const n of attached) onLog(`  ✓ attached ${n}`);
      for (const n of failed)   onLog(`  ✗ ${n}`);

      if (failed.length === 0) {
        onLog(`✅ All ${attached.length} tools attached to ${agentId.trim()}`);
        setStep("done");
      } else {
        onLog(`⚠  ${attached.length} attached, ${failed.length} failed.`);
        setStep("error");
      }
    } catch (err) {
      onLog(`✗ Error: ${String(err)}`);
      setStep("error");
    }
  }, [agentId, onLog]);

  return (
    <div className="border-t border-yellow-400/20 bg-[#161b22] px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-yellow-300">
          Register Letta-Code Tools
        </span>
        <button onClick={onClose} className="text-ink-600 hover:text-ink-300 text-xs">✕</button>
      </div>
      <p className="text-[11px] text-ink-500 leading-relaxed">
        Registers 6 tools on your Letta server:<br/>
        <span className="font-mono text-ink-400">letta_list_agents • letta_get_agent • letta_send_message • letta_search_archival • letta_update_core_memory • letta_list_tools</span>
      </p>
      <div className="flex gap-2">
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="agent-xxxxxxxx (target agent ID)"
          className="flex-1 rounded bg-[#0d1117] border border-ink-900/30 px-2 py-1 font-mono text-[11px] text-green-100 placeholder:text-ink-600 outline-none focus:border-yellow-400/50"
        />
        <button
          onClick={run}
          disabled={step === "registering" || step === "attaching"}
          className="rounded px-3 py-1 text-[11px] font-semibold bg-yellow-400/90 text-black hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {step === "registering" ? "Registering…" : step === "attaching" ? "Attaching…" : step === "done" ? "✓ Done" : "Register & Attach"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface LettaTerminalProps {
  className?: string;
  style?: CSSProperties;
}

export const LettaTerminal = memo(function LettaTerminal({ className = "", style }: LettaTerminalProps) {
  const {
    output,
    isRunning,
    history,
    historyIndex,
    setHistoryIndex,
    showEvents,
    setShowEvents,
    runCommand,
    killCurrent,
    clearOutput,
    addSystemLine,
  } = useLettaCli();

  const [inputValue, setInputValue] = useState("");
  const [showRegisterPanel, setShowRegisterPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);



  // Auto-scroll to bottom whenever output grows
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  // Focus input when clicking anywhere in the terminal
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isRunning) return;
      void runCommand(inputValue);
      setInputValue("");
      return;
    }

    if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      if (isRunning) killCurrent();
      return;
    }

    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      clearOutput();
      return;
    }

    // History navigation
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setInputValue(history[history.length - 1 - newIndex] ?? "");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInputValue(newIndex === -1 ? "" : (history[history.length - 1 - newIndex] ?? ""));
      return;
    }
  };

  return (
    <div
      className={`flex flex-col bg-[#0d1117] rounded-xl border border-ink-900/20 overflow-hidden ${className}`}
      style={style}
      onClick={handleTerminalClick}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-ink-900/20 select-none">
        <div className="flex items-center gap-2">
          {/* Traffic lights */}
          <span className="h-3 w-3 rounded-full bg-red-500/80" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-green-500/80" />
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Running
            </span>
          ) : (
            <span>Letta Terminal</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Register tools button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowRegisterPanel(!showRegisterPanel); }}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
              showRegisterPanel
                ? "text-yellow-300 bg-yellow-300/10 hover:bg-yellow-300/20"
                : "text-ink-500 hover:bg-ink-500/10"
            }`}
            title="Register letta-code tools on the server"
          >
            🔌 Tools
          </button>

          {/* Session activity toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowEvents(!showEvents); }}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
              showEvents
                ? "text-yellow-300 bg-yellow-300/10 hover:bg-yellow-300/20"
                : "text-ink-600 hover:bg-ink-500/10"
            }`}
            title="Toggle session activity feed"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Activity
          </button>
          {isRunning && (
            <button
              onClick={(e) => { e.stopPropagation(); killCurrent(); }}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-red-400 hover:bg-red-400/10 transition"
              title="Kill process (Ctrl+C)"
            >
              Kill
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); clearOutput(); }}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-ink-500 hover:bg-ink-500/10 transition"
            title="Clear terminal (Ctrl+L)"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Register Tools panel */}
      {showRegisterPanel && (
        <RegisterToolsPanel
          onLog={addSystemLine}
          onClose={() => setShowRegisterPanel(false)}
        />
      )}

      {/* Output area */}
      <div
        ref={outputContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-0.5 min-h-0"
        style={{ maxHeight: "calc(100% - 88px)" }}
      >
        {output.map((line) => (
          <OutputLineRow key={line.id} line={line} />
        ))}
        {isRunning && (
          <div className="font-mono text-xs text-green-300">
            <Cursor />
          </div>
        )}
        <div ref={outputEndRef} />
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-ink-900/20 bg-[#161b22]">
        <span className="font-mono text-xs text-[var(--color-accent)] select-none shrink-0">
          $ letta
        </span>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={isRunning ? "Running… (Ctrl+C to kill)" : "agents list"}
          className="flex-1 bg-transparent font-mono text-xs text-green-100 placeholder:text-ink-600 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {!isRunning && inputValue.trim() && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void runCommand(inputValue);
              setInputValue("");
            }}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium bg-[var(--color-accent)]/90 text-white hover:bg-[var(--color-accent)] transition"
          >
            Run ↵
          </button>
        )}
      </div>

      {/* Keyboard hints */}
      <div className="px-4 py-1.5 border-t border-ink-900/10 bg-[#0d1117] flex items-center gap-4 text-[10px] text-ink-600 select-none">
        <span><kbd className="font-mono">↑↓</kbd> history</span>
        <span><kbd className="font-mono">Ctrl+C</kbd> kill</span>
        <span><kbd className="font-mono">Ctrl+L</kbd> clear</span>
        <span><kbd className="font-mono">/clear</kbd> wipe output</span>
      </div>
    </div>
  );
});
