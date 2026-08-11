import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  if (name === "LiveUndoPatch") return "Undid live patch";
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
  if (name === "ProjectMemoryBootstrap") {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed?.status === "created" ? "Initialized project memory" : "Project memory already initialized";
    } catch {
      return "Initialize project memory";
    }
  }
  if (name.startsWith("ProjectMemory")) return "Project memory";
  if (name === "CodeEdit") {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed?.file ? `Edited ${parsed.file}` : "Edited repository file";
    } catch {
      return "Edited repository file";
    }
  }
  if (name === "CodeApplyPatch") {
    try {
      const parsed = JSON.parse(trimmed);
      const count = Array.isArray(parsed?.files) ? parsed.files.length : 0;
      return count > 0 ? `Applied patch to ${count} file${count === 1 ? "" : "s"}` : "Applied code patch";
    } catch {
      return "Applied code patch";
    }
  }
  if (name === "CodeFormatFiles" || name === "CodeOrganizeImports") {
    try {
      const parsed = JSON.parse(trimmed);
      const count = Array.isArray(parsed?.changedFiles) ? parsed.changedFiles.length : 0;
      const action = name === "CodeFormatFiles" ? "Formatted" : "Organized imports in";
      if (count > 0) return `${action} ${count} file${count === 1 ? "" : "s"}`;
      return name === "CodeFormatFiles" ? "Files already formatted" : "Imports already organized";
    } catch {
      return name === "CodeFormatFiles" ? "Format repository files" : "Organize repository imports";
    }
  }
  if (name === "TestFindRelated") {
    try {
      const parsed = JSON.parse(trimmed);
      const count = Number(parsed?.count) || 0;
      return `Found ${count} related test${count === 1 ? "" : "s"}`;
    } catch {
      return "Find related tests";
    }
  }
  if (name === "TestRunRelated" || name === "TestRunByName") {
    try {
      const parsed = JSON.parse(trimmed);
      const status = parsed?.status === "passed" ? "passed" : parsed?.status === "cancelled" ? "cancelled" : "failed";
      return name === "TestRunRelated" ? `Related tests ${status}` : `Named tests ${status}`;
    } catch {
      return name === "TestRunRelated" ? "Run related tests" : "Run tests by name";
    }
  }
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

function RunTimelineOutputCard({ data, tone }: { data: JsonRecord; tone: Tone }) {
  const events = Array.isArray(data.events) ? data.events.filter(isRecord) : [];
  const links = Array.isArray(data.links) ? data.links.filter(isRecord) : [];
  const summary = isRecord(data.summary) ? data.summary : {};
  const inboundLinks = new Map<string, JsonRecord[]>();
  for (const link of links) {
    const target = asText(link.to);
    if (target) inboundLinks.set(target, [...(inboundLinks.get(target) ?? []), link]);
  }
  const failures = Number(summary.failures) || 0;
  const eventColor = (event: JsonRecord) => {
    const status = asText(event.status).toLowerCase();
    if (/failed|error|denied/.test(status)) return "bg-red-500";
    if (event.kind === "test" || event.kind === "diagnostics") return "bg-emerald-500";
    if (event.kind === "patch_apply") return "bg-blue-500";
    return "bg-violet-500";
  };
  return (
    <ToolCard title="Run timeline" tone={failures > 0 ? "error" : tone}>
      <div className="truncate font-mono text-[10px] text-muted" title={asText(data.repoRoot)}>{asText(data.repoRoot)}</div>
      <div className="flex flex-wrap gap-1.5">
        <Pill>{asText(summary.proposals || 0)} patches</Pill>
        <Pill>{asText(summary.applications || 0)} applications</Pill>
        <Pill>{asText(summary.diagnostics || 0)} diagnostics</Pill>
        <Pill>{asText(summary.tests || 0)} tests</Pill>
        {failures > 0 ? <Pill>{failures} failures</Pill> : null}
      </div>
      {events.length === 0 ? <div className="text-[11px] text-muted">No linked patch or validation events found in this time range.</div> : (
        <div className="space-y-0">
          {events.map((event, index) => {
            const id = asText(event.id);
            const files = Array.isArray(event.files) ? event.files.filter((file): file is string => typeof file === "string") : [];
            const proposalIds = Array.isArray(event.linkedProposalIds) ? event.linkedProposalIds.filter((value): value is string => typeof value === "string") : [];
            const incoming = inboundLinks.get(id) ?? [];
            return (
              <div key={id || index} className="relative flex gap-3 pb-3 last:pb-0">
                {index < events.length - 1 ? <div className="absolute bottom-0 left-[5px] top-3 w-px bg-gray-200" /> : null}
                <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white shadow-sm ${eventColor(event)}`} />
                <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white/80 px-2.5 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-ink-700">{asText(event.summary) || asText(event.toolName)}</div>
                      <div className="mt-0.5 text-[9px] text-muted">{asText(event.timestamp) ? new Date(asText(event.timestamp)).toLocaleString() : ""}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Pill>{asText(event.kind)}</Pill><Pill>{asText(event.status)}</Pill>
                    </div>
                  </div>
                  {incoming.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {incoming.map((link, linkIndex) => <span key={linkIndex} className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700">↳ {asText(link.type).replace(/_/g, " ")}{link.proposalId ? ` · ${asText(link.proposalId).slice(0, 8)}` : ""}</span>)}
                    </div>
                  ) : proposalIds.length > 0 ? <div className="mt-1 font-mono text-[9px] text-violet-600">patch {proposalIds.map((idValue) => idValue.slice(0, 8)).join(", ")}</div> : null}
                  {files.length > 0 ? <div className="mt-1.5 truncate font-mono text-[9px] text-muted" title={files.join("\n")}>{files.slice(0, 4).join(" · ")}{files.length > 4 ? ` · +${files.length - 4}` : ""}</div> : null}
                  {isRecord(event.details) && Object.keys(event.details).length > 0 ? <CompactDetails label="Event details"><CodeBlock text={JSON.stringify(event.details, null, 2)} max="max-h-40" /></CompactDetails> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  if (name === "RunTimeline") return "built run timeline";
  if (name === "CodeGetDefinition") return "found definitions";
  if (name === "CodeFindReferences") return "found references";
  if (name === "CodeFileOutline") return "outlined file";
  if (name === "TodoWrite") return "updated tasks";
  if (name === "AskUserQuestion") return "asked question";
  if (name === "LiveProposePatch") return "proposed patch";
  if (name === "LiveApplyPatch") return "applied patch";
  if (name === "LiveUndoPatch") return "undid patch";
  if (name === "LiveRejectPatch") return "rejected patch";
  if (name === "ProjectMemoryBootstrap") return "initialized project memory";
  if (name === "CodeEdit") return "edited code";
  if (name === "CodeApplyPatch") return "applied code patch";
  if (name === "CodeFormatFiles") return "formatted code";
  if (name === "CodeOrganizeImports") return "organized imports";
  if (name === "LiveRegeneratePatch") return "regenerated patch proposal";
  if (name === "TestFindRelated") return "found related tests";
  if (name === "TestRunRelated") return "ran related tests";
  if (name === "TestRunByName") return "ran named tests";
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

function LivePatchReviewCard({ output }: { output: string }) {
  const proposalId = useMemo(() => {
    const parsed = parseJsonRecord(output);
    return typeof parsed?.proposalId === "string" ? parsed.proposalId : null;
  }, [output]);
  const [proposal, setProposal] = useState<LivePatchProposalView | null>(null);
  const [loading, setLoading] = useState(Boolean(proposalId));
  const [action, setAction] = useState<"apply" | "reject" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedHunkIds, setSelectedHunkIds] = useState<string[]>([]);
  const initializedSelection = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!proposalId) {
      setProposal(null);
      setLoading(false);
      setError("The proposal result did not include a proposal ID.");
      return;
    }

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const next = await window.electron.getLivePatchProposal(proposalId);
        if (!cancelled) {
          setProposal((current) => !current || next.updatedAt >= current.updatedAt ? next : current);
          if (next.status === "pending" && initializedSelection.current !== next.id) {
            const files: string[] = [];
            const hunks: string[] = [];
            for (const patchFile of next.patchFiles) {
              if (patchFile.hunkSelectable && patchFile.hunks.length > 0) hunks.push(...patchFile.hunks.map((hunk) => hunk.id));
              else files.push(patchFile.id);
            }
            setSelectedFileIds(files);
            setSelectedHunkIds(hunks);
            initializedSelection.current = next.id;
          }
          if (showLoading) setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    setProposal(null);
    setError(null);
    initializedSelection.current = null;
    void load(true);
    const refreshTimer = window.setInterval(() => void load(false), 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [proposalId]);

  const apply = async () => {
    if (!proposalId || action) return;
    setAction("apply");
    setError(null);
    try {
      const result = await window.electron.applyLivePatchProposal(proposalId, {
        fileIds: selectedFileIds,
        hunkIds: selectedHunkIds,
      });
      setProposal(result.proposal);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      try {
        setProposal(await window.electron.getLivePatchProposal(proposalId));
      } catch {
        // Preserve the apply error; background refresh can retry proposal loading.
      }
    } finally {
      setAction(null);
    }
  };

  const undo = async () => {
    if (!proposalId || action) return;
    setAction("undo");
    setError(null);
    try {
      const result = await window.electron.undoLivePatchProposal(proposalId);
      setProposal(result.proposal);
      setConfirmingUndo(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAction(null);
    }
  };

  const reject = async () => {
    if (!proposalId || action) return;
    setAction("reject");
    setError(null);
    try {
      const next = await window.electron.rejectLivePatchProposal(proposalId, reason.trim() || undefined);
      setProposal(next);
      setRejecting(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAction(null);
    }
  };

  if (loading) return <ToolCard title="Loading patch proposal" tone="running"><div className="text-xs text-muted">Reading the stored proposal…</div></ToolCard>;
  if (!proposal) return <ToolCard title="Patch proposal unavailable" tone="error"><CodeBlock text={error ?? output} /></ToolCard>;

  const riskClass = proposal.riskLevel === "high" ? "text-red-700 bg-red-50 border-red-200" : proposal.riskLevel === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200";
  const statusTone: Tone = proposal.conflict || proposal.status === "rejected" ? "error" : proposal.status === "pending" || proposal.status === "undone" || proposal.status === "superseded" ? "neutral" : "success";
  const selectedHunkSet = new Set(selectedHunkIds);
  const selectedFileSet = new Set(selectedFileIds);
  const selectedCount = selectedFileIds.length + selectedHunkIds.length;
  const toggleFile = (patchFile: LivePatchProposalView["patchFiles"][number]) => {
    if (patchFile.hunkSelectable && patchFile.hunks.length > 0) {
      const hunkIds = patchFile.hunks.map((hunk) => hunk.id);
      const allSelected = hunkIds.every((id) => selectedHunkSet.has(id));
      setSelectedHunkIds((current) => allSelected ? current.filter((id) => !hunkIds.includes(id)) : [...new Set([...current, ...hunkIds])]);
      setSelectedFileIds((current) => current.filter((id) => id !== patchFile.id));
      return;
    }
    setSelectedFileIds((current) => current.includes(patchFile.id) ? current.filter((id) => id !== patchFile.id) : [...current, patchFile.id]);
  };
  const toggleHunk = (fileId: string, hunkId: string) => {
    setSelectedFileIds((current) => current.filter((id) => id !== fileId));
    setSelectedHunkIds((current) => current.includes(hunkId) ? current.filter((id) => id !== hunkId) : [...current, hunkId]);
  };

  return (
    <ToolCard title={proposal.title || "Proposed patch"} tone={statusTone}>
      <p className="text-[12px] leading-5 text-ink-700">{proposal.summary}</p>
      <div className="truncate font-mono text-[10px] text-muted" title={proposal.repoRoot}>{proposal.repoRoot}</div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskClass}`}>{proposal.riskLevel} risk</span>
        <Pill>{proposal.files.length} file{proposal.files.length === 1 ? "" : "s"}</Pill>
        <Pill>{proposal.status}</Pill>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {proposal.files.map((file) => <span key={file} className="rounded-md bg-gray-100 px-2 py-1 font-mono text-[10px] text-ink-700">{file}</span>)}
      </div>
      {proposal.status === "pending" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>Select files or individual hunks to apply</span>
            <span>{selectedCount} selected</span>
          </div>
          {proposal.patchFiles.map((patchFile) => {
            const hunkIds = patchFile.hunks.map((hunk) => hunk.id);
            const allHunksSelected = hunkIds.length > 0 && hunkIds.every((id) => selectedHunkSet.has(id));
            const someHunksSelected = hunkIds.some((id) => selectedHunkSet.has(id));
            const fileSelected = patchFile.hunkSelectable ? allHunksSelected : selectedFileSet.has(patchFile.id);
            return (
              <div key={patchFile.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white/80">
                <label className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-[11px] font-semibold text-ink-700">
                  <input ref={(element) => { if (element) element.indeterminate = patchFile.hunkSelectable && someHunksSelected && !allHunksSelected; }} type="checkbox" checked={fileSelected} onChange={() => toggleFile(patchFile)} className="accent-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 truncate font-mono" title={patchFile.path}>{patchFile.path}</span>
                  <span className="font-normal text-muted">{patchFile.hunkSelectable ? `${patchFile.hunks.length} hunk${patchFile.hunks.length === 1 ? "" : "s"}` : "whole file"}</span>
                </label>
                {patchFile.hunkSelectable ? patchFile.hunks.map((hunk) => (
                  <div key={hunk.id} className="border-b border-gray-100 last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-2 bg-gray-50/80 px-3 py-1.5 font-mono text-[10px] text-ink-600">
                      <input type="checkbox" checked={selectedHunkSet.has(hunk.id)} onChange={() => toggleHunk(patchFile.id, hunk.id)} className="accent-[var(--color-accent)]" />
                      <span className="truncate">{hunk.header}</span>
                    </label>
                    <DiffBlock diff={hunk.patch} />
                  </div>
                )) : <DiffBlock diff={patchFile.patch} />}
              </div>
            );
          })}
        </div>
      ) : <DiffBlock diff={proposal.status === "rejected" ? proposal.patch : proposal.appliedPatch ?? proposal.patch} />}
      {proposal.conflict ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-red-800">Patch conflicts with the current repository</span>
            <span className="text-[10px] text-red-600">{new Date(proposal.conflict.detectedAt).toLocaleString()}</span>
          </div>
          <p className="text-[10px] leading-4 text-red-700">Review the conflicting units and current working-tree changes below. The agent can call <span className="font-mono">LiveRegeneratePatch</span> to create a linked replacement against the latest files.</p>
          {proposal.conflict.files.map((file) => (
            <details key={file.id} open={file.status !== "clean"} className="overflow-hidden rounded-md border border-red-200 bg-white/80">
              <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-2 text-[10px]">
                <span className={`h-2 w-2 rounded-full ${file.status === "clean" ? "bg-emerald-500" : file.status === "partial" ? "bg-amber-500" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1 truncate font-mono font-semibold text-ink-700">{file.path}</span>
                <span className="uppercase text-muted">{file.status}</span>
              </summary>
              <div className="space-y-2 border-t border-red-100 p-2">
                {file.hunks.length > 0 ? (
                  <div className="space-y-1">
                    {file.hunks.map((hunk) => (
                      <div key={hunk.id} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 font-mono text-[9px] text-ink-600">
                        <span className={`h-1.5 w-1.5 rounded-full ${hunk.status === "clean" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="min-w-0 flex-1 truncate">{hunk.header ?? hunk.id}</span>
                        <span>{hunk.status}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {file.currentDiff ? <div><div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted">Current working tree</div><DiffBlock diff={file.currentDiff} /></div> : null}
                {file.message ? <CompactDetails label="Conflict details"><CodeBlock text={file.message} max="max-h-40" /></CompactDetails> : null}
              </div>
            </details>
          ))}
        </div>
      ) : null}
      {proposal.validationPlan.length > 0 ? (
        <details className="rounded-lg border border-gray-200 bg-white/80">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-muted">Validation plan</summary>
          <ul className="space-y-1 border-t border-gray-100 px-5 py-2 text-[11px] text-ink-700">
            {proposal.validationPlan.map((step, index) => <li key={index} className="list-disc">{step}</li>)}
          </ul>
        </details>
      ) : null}
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
      {proposal.status === "pending" ? (
        <div className="space-y-2 border-t border-gray-200 pt-3">
          {rejecting ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Reason for rejection" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for rejection (optional)" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[var(--color-accent)]" />
              <button type="button" onClick={() => void reject()} disabled={Boolean(action)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{action === "reject" ? "Rejecting…" : "Confirm reject"}</button>
              <button type="button" onClick={() => setRejecting(false)} disabled={Boolean(action)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-ink-600">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setRejecting(true)} disabled={Boolean(action)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
              <button type="button" onClick={() => void apply()} disabled={Boolean(action) || selectedCount === 0} className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50">{action === "apply" ? "Checking & applying…" : "Approve & apply selected"}</button>
            </div>
          )}
          <p className="text-right text-[10px] text-muted">Unselected changes are discarded. Approval checks the selected patch against current repository state before writing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className={`rounded-lg px-3 py-2 text-xs font-medium ${proposal.status === "applied" || proposal.status === "partially_applied" ? "bg-emerald-50 text-emerald-700" : proposal.status === "undone" || proposal.status === "superseded" ? "bg-gray-100 text-ink-600" : "bg-red-50 text-red-700"}`}>
            {proposal.status === "applied"
              ? "✓ Patch applied"
              : proposal.status === "partially_applied"
                ? "✓ Selected changes applied; unselected changes were not applied"
                : proposal.status === "undone"
                  ? "↶ Applied patch was undone"
                  : proposal.status === "superseded"
                    ? `Superseded by regenerated proposal ${proposal.supersededByProposalId ?? ""}`
                    : `Patch rejected${proposal.rejectionReason ? `: ${proposal.rejectionReason}` : ""}`}
          </div>
          {proposal.status === "applied" || proposal.status === "partially_applied" ? (
            confirmingUndo ? (
              <div className="flex flex-col items-end gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] text-amber-800">Undo only succeeds if no affected file changed after application.</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmingUndo(false)} disabled={Boolean(action)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50">Cancel</button>
                  <button type="button" onClick={() => void undo()} disabled={Boolean(action)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{action === "undo" ? "Checking & undoing…" : "Confirm undo"}</button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button type="button" onClick={() => setConfirmingUndo(true)} disabled={Boolean(action)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">Undo applied patch</button>
              </div>
            )
          ) : null}
        </div>
      )}
    </ToolCard>
  );
}

function ToolOutputView({ name, output, tone }: { name: string; output: string; tone: Tone }) {
  if (name === "AskUserQuestion") return null;
  const parsed = parseJsonRecord(output);
  if ((name === "LiveProposePatch" || name === "LiveRegeneratePatch") && typeof parsed?.proposalId === "string") return <LivePatchReviewCard output={output} />;
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
  if (name === "RunTimeline") return <RunTimelineOutputCard data={parsed} tone={tone} />;
  if (name === "GitDiffSummary") return <GitDiffOutputCard data={parsed} tone={tone} />;
  if (name === "GitChangedByAgent") return <GitChangedOutputCard data={parsed} tone={tone} />;
  if (name === "ProjectRunScript") return <ProjectRunOutputCard data={parsed} tone={tone} />;
  return <GenericOutputCard data={parsed} tone={tone} />;
}

export const ToolExecutionBlock = memo(function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const isRunning = status === "running";
  const isError = status === "failed";
  const isTodoWrite = name === "TodoWrite";
  const isPatchProposal = name === "LiveProposePatch";
  const [expanded, setExpanded] = useState(isTodoWrite || isPatchProposal);
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
  const collapsedSummary = summary && !/^[{[]/.test(summary.trim()) ? summary : null;
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
