import { memo, useMemo, useState, type ReactNode } from "react";

interface ToolExecutionBlockProps {
  name: string;
  status: "running" | "succeeded" | "failed";
  input?: string | null;
  output?: string | null;
  logs?: string[];
}

interface TodoItem {
  content: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
}

function parseTodoInput(input?: string | null): TodoItem[] | null {
  if (!input?.trim()) return null;
  try {
    const parsed = JSON.parse(input);
    const todos = parsed?.todos;
    if (!Array.isArray(todos)) return null;
    return todos
      .filter((t): t is TodoItem => t && typeof t === "object" && typeof t.content === "string" && typeof t.status === "string")
      .map((t) => ({ content: t.content, activeForm: t.activeForm, status: t.status as TodoItem["status"] }));
  } catch {
    return null;
  }
}

function summarizeToolInput(name: string, input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  if (name === "TodoWrite") {
    const todos = parseTodoInput(input);
    if (!todos || todos.length === 0) return "Updated task list";
    const done = todos.filter((t) => t.status === "completed").length;
    const inProgress = todos.find((t) => t.status === "in_progress");
    if (inProgress) {
      const label = inProgress.activeForm ?? inProgress.content;
      return `${label} (${done}/${todos.length})`;
    }
    return `${todos.length} task${todos.length === 1 ? "" : "s"} · ${done} done`;
  }

  if (name === "Edit") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Updated (${fileMatch[1]})` : "Updated file contents";
  }

  if (name === "Read") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Read (${fileMatch[1]})` : "Read file contents";
  }

  if (name === "Write") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Wrote (${fileMatch[1]})` : "Wrote file contents";
  }

  if (name === "LiveProposePatch") {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed?.title ? `Proposed patch: ${parsed.title}` : "Proposed live patch";
    } catch {
      return "Proposed live patch";
    }
  }

  if (name === "LiveApplyPatch") return "Applied live patch";
  if (name === "LiveRejectPatch") return "Rejected live patch";
  if (name === "ProjectRunScript") {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed?.script ? `Run script: ${parsed.script}` : "Run project script";
    } catch {
      return "Run project script";
    }
  }
  if (name.startsWith("ProjectMemory")) return "Project memory";
  if (name.startsWith("Code")) return "Code intelligence";

  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
}

function TodoListView({ todos }: { todos: TodoItem[] }) {
  return (
    <ul className="mt-1.5 space-y-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
      {todos.map((todo, idx) => {
        const isDone = todo.status === "completed";
        const isActive = todo.status === "in_progress";
        return (
          <li key={idx} className="flex items-start gap-2 text-[13px] leading-5">
            {isDone ? (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-green-500 text-white">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : isActive ? (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-2 border-blue-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              </span>
            ) : (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 rounded-[3px] border-2 border-gray-300" />
            )}
            <span
              className={
                isDone
                  ? "text-ink-400 line-through"
                  : isActive
                    ? "font-medium text-ink-900"
                    : "text-ink-700"
              }
            >
              {isActive && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </li>
        );
      })}
    </ul>
  );
}


type JsonRecord = Record<string, unknown>;

type Tone = "neutral" | "success" | "error" | "running";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(text?: string | null): JsonRecord | null {
  if (!text?.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function labelFor(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function toneClasses(tone: Tone): string {
  if (tone === "error") return "border-red-200 bg-red-50 text-red-950";
  if (tone === "running") return "border-blue-200 bg-blue-50 text-blue-950";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-gray-200 bg-gray-50 text-ink-900";
}

function ToolCard({ title, tone = "neutral", children }: { title: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className={`space-y-2 rounded-xl border p-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] ${toneClasses(tone)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{title}</div>
      {children}
    </div>
  );
}

function InlineField({ label, value, mono = true }: { label: string; value: unknown; mono?: boolean }) {
  const text = asText(value);
  if (!text) return null;
  return (
    <div className="min-w-0 rounded-lg border border-white/70 bg-white/80 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`mt-1 break-words text-[12px] leading-5 text-ink-800 ${mono ? "font-mono" : ""}`}>{text}</div>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-ink-600">{children}</span>;
}

function CodeBlock({ text, max = "max-h-80" }: { text: string; max?: string }) {
  return (
    <pre className={`${max} overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] leading-5 text-ink-900`}>
      {text}
    </pre>
  );
}

function DiffLine({ line }: { line: string }) {
  const color = line.startsWith("+") && !line.startsWith("+++")
    ? "text-emerald-800 bg-emerald-50"
    : line.startsWith("-") && !line.startsWith("---")
      ? "text-red-800 bg-red-50"
      : line.startsWith("@@")
        ? "text-blue-800 bg-blue-50"
        : line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")
          ? "text-purple-800 bg-purple-50"
          : "text-ink-800";
  return <div className={`min-w-max px-2 ${color}`}>{line || " "}</div>;
}

function DiffBlock({ diff }: { diff: string }) {
  return (
    <details className="overflow-hidden rounded-lg border border-gray-200 bg-white" open>
      <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink-700">Diff</summary>
      <div className="max-h-96 overflow-auto border-t border-gray-200 bg-gray-50 py-2 font-mono text-[11px] leading-5">
        {diff.split("\n").map((line, index) => <DiffLine key={`${index}-${line.slice(0, 24)}`} line={line} />)}
      </div>
    </details>
  );
}

function AdvancedDetails({ data, omit }: { data: JsonRecord; omit: string[] }) {
  const entries = Object.entries(data).filter(([key, value]) => !omit.includes(key) && asText(value).length > 0);
  if (entries.length === 0) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-white/70">
      <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink-700">Advanced</summary>
      <div className="grid gap-2 border-t border-gray-200 p-2 sm:grid-cols-2">
        {entries.map(([key, value]) => <InlineField key={key} label={labelFor(key)} value={value} />)}
      </div>
    </details>
  );
}

function GrepInputCard({ data }: { data: JsonRecord }) {
  const contextBits = ["-B", "-A", "-C", "context", "head_limit", "offset", "type"]
    .map((key) => [key, data[key]] as const)
    .filter(([, value]) => asText(value).length > 0 && asText(value) !== "0");
  return (
    <ToolCard title="Search" tone="neutral">
      <div className="grid gap-2 sm:grid-cols-2">
        <InlineField label="Pattern" value={data.pattern ?? data.query} />
        <InlineField label="Path" value={data.path} />
        <InlineField label="Glob" value={data.glob} />
        <InlineField label="Mode" value={data.output_mode ?? data.mode} mono={false} />
      </div>
      {contextBits.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {contextBits.map(([key, value]) => <Pill key={key}>{key}: {asText(value)}</Pill>)}
        </div>
      ) : null}
      <AdvancedDetails data={data} omit={["pattern", "query", "path", "glob", "output_mode", "mode", ...contextBits.map(([key]) => key)]} />
    </ToolCard>
  );
}

function ReadInputCard({ name, data }: { name: string; data: JsonRecord }) {
  return (
    <ToolCard title={name === "ReadLSP" ? "Read with diagnostics" : "Read file"} tone="neutral">
      <InlineField label="File" value={data.file_path} />
      <div className="flex flex-wrap gap-1.5">
        {asText(data.offset) ? <Pill>offset: {asText(data.offset)}</Pill> : null}
        {asText(data.limit) ? <Pill>limit: {asText(data.limit)}</Pill> : null}
        {"include_types" in data ? <Pill>types: {asText(data.include_types)}</Pill> : null}
      </div>
    </ToolCard>
  );
}

function EditInputCard({ data }: { data: JsonRecord }) {
  return (
    <ToolCard title="Edit file" tone="neutral">
      <InlineField label="File" value={data.file_path} />
      {"replace_all" in data ? <Pill>replace all: {asText(data.replace_all)}</Pill> : null}
      <div className="grid gap-2 lg:grid-cols-2">
        <details className="rounded-lg border border-red-100 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-600">Old string</summary>
          <CodeBlock text={asText(data.old_string)} />
        </details>
        <details className="rounded-lg border border-emerald-100 bg-white" open>
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">New string</summary>
          <CodeBlock text={asText(data.new_string)} />
        </details>
      </div>
    </ToolCard>
  );
}

function ProjectRunInputCard({ data }: { data: JsonRecord }) {
  return (
    <ToolCard title="Run script" tone="running">
      <div className="grid gap-2 sm:grid-cols-2">
        <InlineField label="Script" value={data.script} mono={false} />
        <InlineField label="Path" value={data.path} />
      </div>
      {Array.isArray(data.args) && data.args.length > 0 ? <InlineField label="Args" value={data.args.join(" ")} /> : null}
    </ToolCard>
  );
}

function GenericInputCard({ name, data }: { name: string; data: JsonRecord }) {
  const priority = ["file_path", "path", "query", "pattern", "command", "script", "url", "repoPath", "model"];
  const visible = priority.filter((key) => key in data && asText(data[key]).length > 0);
  return (
    <ToolCard title={`${name} input`} tone="neutral">
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((key) => <InlineField key={key} label={labelFor(key)} value={data[key]} />)}
      </div>
      <AdvancedDetails data={data} omit={visible} />
    </ToolCard>
  );
}

function GrepOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const output = asText(data.output ?? data.message);
  return (
    <ToolCard title="Search results" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {"matches" in data ? <Pill>{asText(data.matches)} matches</Pill> : null}
        {"status" in data ? <Pill>{asText(data.status)}</Pill> : null}
      </div>
      {output ? <CodeBlock text={output} max="max-h-96" /> : null}
      <AdvancedDetails data={data} omit={["output", "message", "matches", "status"]} />
    </ToolCard>
  );
}

function ReadOutputCard({ output, tone }: { output: string; tone: Tone }) {
  return (
    <ToolCard title="File preview" tone={tone}>
      <CodeBlock text={output} max="max-h-[520px]" />
    </ToolCard>
  );
}

function EditOutputCard({ output, tone }: { output: string; tone: Tone }) {
  return (
    <ToolCard title="Edit result" tone={tone}>
      <div className="text-[13px] leading-6 text-ink-800">{output}</div>
    </ToolCard>
  );
}

function GitDiffOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  return (
    <ToolCard title="Git diff" tone={tone}>
      <InlineField label="Repository" value={data.repoRoot} />
      {asText(data.files) ? <CodeBlock text={asText(data.files)} /> : null}
      {asText(data.stat) ? <CodeBlock text={asText(data.stat)} /> : null}
      {asText(data.diff) ? <DiffBlock diff={asText(data.diff)} /> : null}
    </ToolCard>
  );
}

function ProjectRunOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  return (
    <ToolCard title="Script result" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {"command" in data ? <Pill>{asText(data.command)}</Pill> : null}
        {"status" in data ? <Pill>{asText(data.status)}</Pill> : null}
        {"durationMs" in data ? <Pill>{asText(data.durationMs)}ms</Pill> : null}
      </div>
      {asText(data.output) ? <CodeBlock text={asText(data.output)} max="max-h-[520px]" /> : null}
      <AdvancedDetails data={data} omit={["command", "status", "durationMs", "output"]} />
    </ToolCard>
  );
}

function GenericOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const output = asText(data.output ?? data.message ?? data.diff ?? data.content);
  const visibleKeys = ["status", "matches", "repoRoot", "durationMs"].filter((key) => key in data && asText(data[key]).length > 0);
  return (
    <ToolCard title="Tool output" tone={tone}>
      {visibleKeys.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleKeys.map((key) => <Pill key={key}>{labelFor(key)}: {asText(data[key])}</Pill>)}
        </div>
      ) : null}
      {data.diff ? <DiffBlock diff={asText(data.diff)} /> : output ? <CodeBlock text={output} max="max-h-96" /> : null}
      <AdvancedDetails data={data} omit={[...visibleKeys, "output", "message", "diff", "content"]} />
    </ToolCard>
  );
}

function ToolInputView({ name, input }: { name: string; input: string }) {
  const parsed = parseJsonRecord(input);
  if (!parsed) return <CodeBlock text={input} />;
  if (name === "Grep" || name === "CodeSearch") return <GrepInputCard data={parsed} />;
  if (name === "Read" || name === "ReadLSP") return <ReadInputCard name={name} data={parsed} />;
  if (name === "Edit") return <EditInputCard data={parsed} />;
  if (name === "ProjectRunScript") return <ProjectRunInputCard data={parsed} />;
  return <GenericInputCard name={name} data={parsed} />;
}

function ToolOutputView({ name, output, tone }: { name: string; output: string; tone: Tone }) {
  const parsed = parseJsonRecord(output);
  if (!parsed) {
    if (name === "Read" || name === "ReadLSP") return <ReadOutputCard output={output} tone={tone} />;
    if (name === "Edit" || name === "Write") return <EditOutputCard output={output} tone={tone} />;
    return <ToolCard title="Output" tone={tone}><CodeBlock text={output} max="max-h-96" /></ToolCard>;
  }
  if (name === "Grep" || name === "CodeSearch") return <GrepOutputCard data={parsed} tone={tone} />;
  if (name === "GitDiffSummary") return <GitDiffOutputCard data={parsed} tone={tone} />;
  if (name === "ProjectRunScript") return <ProjectRunOutputCard data={parsed} tone={tone} />;
  return <GenericOutputCard data={parsed} tone={tone} />;
}

export const ToolExecutionBlock = memo(function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const isRunning = status === "running";
  const isError = status === "failed";
  const isTodoWrite = name === "TodoWrite";
  const [expanded, setExpanded] = useState(isTodoWrite);
  const todos = useMemo(() => (isTodoWrite ? parseTodoInput(input ?? null) : null), [isTodoWrite, input]);


  const safeInput = useMemo(() => {
    const trimmed = input?.trim();
    if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") return null;
    return trimmed;
  }, [input]);

  const summary = useMemo(() => summarizeToolInput(name, safeInput), [name, safeInput]);
  const transcript = useMemo(() => {
    if (output?.trim()) return output;
    if (logs.length > 0) return logs.join("\n");
    return isRunning ? null : "No output captured.";
  }, [isRunning, logs, output]);

  const statusToneClass = isError ? "text-red-700" : isRunning ? "text-blue-700" : "text-green-700";
  return (
    <section className="max-w-4xl px-1 py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
          isError ? "text-red-500" : isRunning ? "text-blue-500" : "text-green-500"
        }`}>
          {isRunning ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4m0 12v4m-8-8H2m20 0h-4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          ) : isError ? (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={`text-[12px] font-medium ${statusToneClass}`}>{name}</span>
          {summary && !expanded ? <span className="text-[12px] text-muted truncate">— {summary}</span> : null}
        </div>
        <span className="text-ink-300 shrink-0">
          <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div className="mt-1.5 ml-5">
          {isTodoWrite && todos ? (
            <TodoListView todos={todos} />
          ) : safeInput ? (
            <ToolInputView name={name} input={safeInput} />
          ) : null}
          {!isTodoWrite && transcript ? (
            <ToolOutputView name={name} output={transcript} tone={isError ? "error" : isRunning ? "running" : "success"} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
