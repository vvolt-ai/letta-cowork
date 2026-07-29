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
  if (name === "AskUserQuestion") {
    try {
      const parsed = JSON.parse(trimmed);
      const firstQuestion = Array.isArray(parsed?.questions) ? parsed.questions[0]?.question : null;
      const answers = parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : null;
      const firstAnswer = answers && firstQuestion ? answers[firstQuestion] : null;
      return firstQuestion
        ? `${firstQuestion}${firstAnswer ? ` · ${firstAnswer}` : ""}`
        : "Asked question";
    } catch {
      return "Asked question";
    }
  }
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
  if (tone === "error") return "border-red-200 bg-red-50/70 text-red-950";
  if (tone === "running") return "border-blue-200 bg-blue-50/70 text-blue-950";
  if (tone === "success") return "border-emerald-200 bg-emerald-50/60 text-emerald-950";
  return "border-gray-200 bg-white text-ink-900";
}

function ToolCard({ title, tone = "neutral", children }: { title: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className={`space-y-3 rounded-xl border px-3 py-2.5 shadow-sm ${toneClasses(tone)}`}>
      <div className="text-[11px] font-semibold text-ink-700">{title}</div>
      {children}
    </div>
  );
}

function InlineField({ label, value, mono = true }: { label: string; value: unknown; mono?: boolean }) {
  const text = asText(value);
  if (!text) return null;
  return (
    <div className="min-w-0">
      <span className="text-[11px] font-medium text-muted">{label}: </span>
      <span className={`break-words text-[12px] leading-5 text-ink-800 ${mono ? "font-mono" : ""}`}>{text}</span>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-ink-600">{children}</span>;
}

function CodeBlock({ text, max = "max-h-80" }: { text: string; max?: string }) {
  return (
    <pre className={`${max} overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white/90 px-3 py-2 font-mono text-[11px] leading-5 text-ink-900`}>
      {text}
    </pre>
  );
}

function CompactDetails({ label = "Parameters", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white/80">
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-muted hover:text-ink-700">{label}</summary>
      <div className="space-y-2 border-t border-gray-100 p-3">{children}</div>
    </details>
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
    <CompactDetails label="Search parameters">
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
    </CompactDetails>
  );
}

function ReadInputCard({ name, data }: { name: string; data: JsonRecord }) {
  return (
    <CompactDetails label={name === "ReadLSP" ? "Read parameters" : "Read parameters"}>
      <InlineField label="File" value={data.file_path} />
      <div className="flex flex-wrap gap-1.5">
        {asText(data.offset) ? <Pill>offset: {asText(data.offset)}</Pill> : null}
        {asText(data.limit) ? <Pill>limit: {asText(data.limit)}</Pill> : null}
        {"include_types" in data ? <Pill>types: {asText(data.include_types)}</Pill> : null}
      </div>
    </CompactDetails>
  );
}

function EditInputCard({ data }: { data: JsonRecord }) {
  return (
    <CompactDetails label="Edit parameters">
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
    </CompactDetails>
  );
}

function WriteInputCard({ data }: { data: JsonRecord }) {
  const content = asText(data.content);
  return (
    <CompactDetails label="Write parameters">
      <InlineField label="File" value={data.file_path} />
      {content ? (
        <div className="flex flex-wrap gap-1.5">
          <Pill>{lineCount(content)} lines</Pill>
          <Pill>{byteLabel(content)}</Pill>
          <Pill>overwrites file</Pill>
        </div>
      ) : null}
      {content ? <CodeBlock text={content} max="max-h-72" /> : null}
      <AdvancedDetails data={data} omit={["file_path", "content"]} />
    </CompactDetails>
  );
}

function MultiEditInputCard({ data }: { data: JsonRecord }) {
  const edits = Array.isArray(data.edits) ? data.edits.filter(isRecord) : [];
  return (
    <CompactDetails label="Multi-edit parameters">
      <InlineField label="File" value={data.file_path} />
      <div className="flex flex-wrap gap-1.5"><Pill>{edits.length} edits</Pill></div>
      <div className="space-y-2">
        {edits.map((edit, index) => (
          <details key={index} className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-ink-700">
              Edit {index + 1}{edit.replace_all ? " · replace all" : ""}
            </summary>
            <div className="grid gap-2 border-t border-gray-100 p-2 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600">Old</div>
                <CodeBlock text={asText(edit.old_string)} max="max-h-48" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">New</div>
                <CodeBlock text={asText(edit.new_string)} max="max-h-48" />
              </div>
            </div>
          </details>
        ))}
      </div>
      <AdvancedDetails data={data} omit={["file_path", "edits"]} />
    </CompactDetails>
  );
}

function BashInputCard({ data }: { data: JsonRecord }) {
  return (
    <CompactDetails label="Command parameters">
      <InlineField label="Command" value={data.command} />
      <div className="flex flex-wrap gap-1.5">
        {asText(data.description) ? <Pill>{asText(data.description)}</Pill> : null}
        {"timeout" in data ? <Pill>timeout: {asText(data.timeout)}ms</Pill> : null}
        {"run_in_background" in data ? <Pill>background: {asText(data.run_in_background)}</Pill> : null}
      </div>
      <AdvancedDetails data={data} omit={["command", "description", "timeout", "run_in_background"]} />
    </CompactDetails>
  );
}

function GitInputCard({ data }: { data: JsonRecord }) {
  return (
    <CompactDetails label="Git parameters">
      <div className="flex flex-wrap gap-1.5">
        {asText(data.operation) ? <Pill>{asText(data.operation)}</Pill> : null}
        {asText(data.path) ? <Pill>{asText(data.path).split("/").pop()}</Pill> : null}
        {asText(data.file) ? <Pill>{asText(data.file)}</Pill> : null}
      </div>
      <AdvancedDetails data={data} omit={["operation", "path", "file"]} />
    </CompactDetails>
  );
}

function AskUserQuestionInputCard({ data }: { data: JsonRecord }) {
  const questions = Array.isArray(data.questions) ? data.questions.filter(isRecord) : [];
  const answers = isRecord(data.answers) ? data.answers : {};
  return (
    <CompactDetails label="Question">
      <div className="space-y-1.5">
        {questions.map((question, index) => {
          const questionText = asText(question.question);
          const answer = asText(answers[questionText]);
          return (
            <div key={index} className="flex flex-wrap items-center gap-1.5 text-[12px] leading-5">
              <span className="font-medium text-ink-800">{questionText}</span>
              {Array.isArray(question.options)
                ? question.options.filter(isRecord).map((option, optionIndex) => {
                    const label = asText(option.label);
                    const selected = answer.split(",").map((part) => part.trim()).includes(label);
                    return <Pill key={optionIndex}>{selected ? "✓ " : ""}{label}</Pill>;
                  })
                : null}
              {answer ? <span className="text-[11px] font-medium text-emerald-700">answered: {answer}</span> : null}
            </div>
          );
        })}
      </div>
    </CompactDetails>
  );
}

function ProjectRunInputCard({ data }: { data: JsonRecord }) {
  return (
    <CompactDetails label="Script parameters">
      <div className="grid gap-2 sm:grid-cols-2">
        <InlineField label="Script" value={data.script} mono={false} />
        <InlineField label="Path" value={data.path} />
      </div>
      {Array.isArray(data.args) && data.args.length > 0 ? <InlineField label="Args" value={data.args.join(" ")} /> : null}
    </CompactDetails>
  );
}

function GenericInputCard({ data }: { name: string; data: JsonRecord }) {
  const priority = ["file_path", "path", "query", "pattern", "command", "script", "url", "repoPath", "model"];
  const visible = priority.filter((key) => key in data && asText(data[key]).length > 0);
  return (
    <CompactDetails label="Parameters">
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((key) => <InlineField key={key} label={labelFor(key)} value={data[key]} />)}
      </div>
      <AdvancedDetails data={data} omit={visible} />
    </CompactDetails>
  );
}


function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asText(item)).filter(Boolean) : [];
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

function byteLabel(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function firstNonEmptyLine(text: string): string {
  return text.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}

function FileList({ title, files, tone = "neutral" }: { title: string; files: string[]; tone?: Tone }) {
  if (files.length === 0) return null;
  const dot = tone === "error" ? "bg-red-500" : tone === "success" ? "bg-emerald-500" : "bg-gray-400";
  return (
    <div className="rounded-lg border border-gray-200 bg-white/90">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-ink-800">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {title}
        </div>
        <Pill>{files.length}</Pill>
      </div>
      <div className="max-h-56 overflow-auto py-1">
        {files.map((file) => (
          <div key={file} className="truncate px-3 py-1.5 font-mono text-[12px] leading-5 text-ink-800 hover:bg-gray-50" title={file}>
            {file}
          </div>
        ))}
      </div>
    </div>
  );
}

function GitChangedOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const agentTouched = asStringArray(data.agentTouched);
  const dirty = asStringArray(data.dirty);
  const unrelatedDirty = asStringArray(data.unrelatedDirty);
  const agentDirty = dirty.filter((file) => agentTouched.includes(file));
  return (
    <ToolCard title="Working tree changes" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {asText(data.repoRoot) ? <Pill>repo: {asText(data.repoRoot).split("/").pop()}</Pill> : null}
        <Pill>{dirty.length} dirty</Pill>
        <Pill>{agentTouched.length} agent-touched</Pill>
        {unrelatedDirty.length > 0 ? <Pill>{unrelatedDirty.length} unrelated</Pill> : null}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <FileList title="Agent-touched dirty files" files={agentDirty.length > 0 ? agentDirty : agentTouched} tone="success" />
        <FileList title="Unrelated dirty files" files={unrelatedDirty} tone="error" />
      </div>
      {dirty.length > 0 && agentDirty.length === 0 ? <FileList title="Dirty files" files={dirty} /> : null}
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

function GitOutputCard({ output, tone }: { output: string; tone: Tone }) {
  const isClean = /working tree clean|nothing to commit/i.test(output);
  return (
    <ToolCard title="Git result" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {isClean ? <Pill>clean</Pill> : null}
        <Pill>{lineCount(output)} lines</Pill>
      </div>
      <CodeBlock text={output} max="max-h-80" />
    </ToolCard>
  );
}

function BashOutputCard({ output, tone }: { output: string; tone: Tone }) {
  const first = firstNonEmptyLine(output);
  return (
    <ToolCard title="Command output" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {first ? <Pill>{first.slice(0, 80)}</Pill> : null}
        <Pill>{lineCount(output)} lines</Pill>
      </div>
      <CodeBlock text={output} max="max-h-[520px]" />
    </ToolCard>
  );
}

function DiagnosticsOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const message = asText(data.message ?? data.output ?? data.error);
  const status = asText(data.status);
  const errorHints = message.match(/error TS\d+|error:|failed|Failed/gi) ?? [];
  return (
    <ToolCard title="Diagnostics" tone={tone === "success" && errorHints.length > 0 ? "error" : tone}>
      <div className="flex flex-wrap gap-1.5">
        {status ? <Pill>{status}</Pill> : null}
        {errorHints.length > 0 ? <Pill>{errorHints.length} errors</Pill> : <Pill>no parsed errors</Pill>}
      </div>
      {message ? <CodeBlock text={message} max="max-h-[520px]" /> : null}
      <AdvancedDetails data={data} omit={["message", "output", "error", "status"]} />
    </ToolCard>
  );
}

function CodeSearchOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const message = asText(data.message ?? data.output);
  const matches = asText(data.matches);
  return (
    <ToolCard title="Code search results" tone={tone}>
      <div className="flex flex-wrap gap-1.5">
        {asText(data.status) ? <Pill>{asText(data.status)}</Pill> : null}
        {matches ? <Pill>{matches} matches</Pill> : null}
      </div>
      {message ? <CodeBlock text={message} max="max-h-[520px]" /> : null}
      <AdvancedDetails data={data} omit={["message", "output", "matches", "status"]} />
    </ToolCard>
  );
}

function WriteOutputCard({ output, tone }: { output: string; tone: Tone }) {
  return (
    <ToolCard title="Write result" tone={tone}>
      <div className="text-[13px] leading-6 text-ink-800">{output}</div>
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
  if (name === "MultiEdit") return <MultiEditInputCard data={parsed} />;
  if (name === "Write") return <WriteInputCard data={parsed} />;
  if (name === "Bash") return <BashInputCard data={parsed} />;
  if (name === "Git") return <GitInputCard data={parsed} />;
  if (name === "AskUserQuestion") return <AskUserQuestionInputCard data={parsed} />;
  if (name === "ProjectRunScript") return <ProjectRunInputCard data={parsed} />;
  return <GenericInputCard name={name} data={parsed} />;
}

function toolDisplayLabel(name: string, summary: string | null): string {
  if (name === "Grep" || name === "CodeSearch") return "searched code";
  if (name === "Read" || name === "ReadLSP") return "read file";
  if (name === "Edit") return "edited file";
  if (name === "MultiEdit") return "edited file";
  if (name === "Write") return "wrote file";
  if (name === "GitChangedByAgent") return "checked changes";
  if (name === "GitDiffSummary") return "checked diff";
  if (name === "Git") return "checked git";
  if (name === "Bash") return "ran command";
  if (name === "ProjectRunScript") return "ran script";
  if (name === "CodeDiagnostics") return "checked diagnostics";
  if (name === "CodeGetDefinition") return "found definitions";
  if (name === "CodeFindReferences") return "found references";
  if (name === "CodeFileOutline") return "outlined file";
  if (name === "TodoWrite") return "updated tasks";
  if (name === "AskUserQuestion") return "asked question";
  if (name.toLowerCase() === "tool") return summary ? summary : "used tool";
  return name;
}

function toolStatusGlyph(isRunning: boolean, isError: boolean) {
  if (isRunning) {
    return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />;
  }
  if (isError) {
    return <span className="text-[11px] leading-none text-red-500">!</span>;
  }
  return <span className="text-[11px] leading-none text-ink-300">✓</span>;
}

function ToolOutputView({ name, output, tone }: { name: string; output: string; tone: Tone }) {
  if (name === "AskUserQuestion") return null;
  const parsed = parseJsonRecord(output);
  if (!parsed) {
    if (name === "Read" || name === "ReadLSP") return <ReadOutputCard output={output} tone={tone} />;
    if (name === "Edit" || name === "MultiEdit") return <EditOutputCard output={output} tone={tone} />;
    if (name === "Write") return <WriteOutputCard output={output} tone={tone} />;
    if (name === "Git") return <GitOutputCard output={output} tone={tone} />;
    if (name === "Bash" || name === "BashOutput") return <BashOutputCard output={output} tone={tone} />;
    return <ToolCard title="Output" tone={tone}><CodeBlock text={output} max="max-h-96" /></ToolCard>;
  }
  if (name === "Grep") return <GrepOutputCard data={parsed} tone={tone} />;
  if (name === "CodeSearch" || name === "CodeGetDefinition" || name === "CodeFindReferences" || name === "CodeFileOutline") return <CodeSearchOutputCard data={parsed} tone={tone} />;
  if (name === "CodeDiagnostics") return <DiagnosticsOutputCard data={parsed} tone={tone} />;
  if (name === "GitDiffSummary") return <GitDiffOutputCard data={parsed} tone={tone} />;
  if (name === "GitChangedByAgent") return <GitChangedOutputCard data={parsed} tone={tone} />;
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

  const label = toolDisplayLabel(name, summary);
  const collapsedSummary = summary && !/^[{\[]/.test(summary.trim()) ? summary : null;
  const rowToneClass = isError
    ? "text-red-600 hover:bg-red-50"
    : isRunning
      ? "text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
      : "text-muted hover:bg-[var(--color-surface-hover)] hover:text-ink-700";
  return (
    <section className="max-w-4xl py-[1px]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`group inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] leading-5 transition ${rowToneClass}`}
        title={summary ? `${name}: ${summary}` : name}
      >
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-80">
          {toolStatusGlyph(isRunning, isError)}
        </span>
        <span className="truncate font-medium">{label}</span>
        {collapsedSummary && !expanded && name.toLowerCase() !== "tool" ? (
          <span className="hidden truncate text-ink-300 sm:inline">· {collapsedSummary}</span>
        ) : null}
        <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-ink-300 opacity-0 transition group-hover:opacity-100 ${expanded ? "rotate-90 opacity-100" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {expanded ? (
        <div className="mt-1.5 ml-5 space-y-2">
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
